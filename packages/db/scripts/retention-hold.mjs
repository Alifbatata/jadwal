// Le verrou de conservation : relevé, pose et levée (ADR 0030).
//
// Un verrou suspend la purge du journal d'audit et du registre interne d'une organisation, le temps
// d'un litige. Il se pose depuis la base, avec le rôle propriétaire, et depuis nulle part ailleurs :
// ni l'application, ni le super-admin, ni le rôle public n'ont le moindre droit sur cette table.
// C'est voulu — un verrou que l'application pourrait lever ne serait pas un verrou.
//
// Usage (à la racine du dépôt) :
//   pnpm --filter @jadwal/db exec node scripts/retention-hold.mjs list [--anciens <jours>]
//   pnpm --filter @jadwal/db exec node scripts/retention-hold.mjs place <identifiant> "<motif>" "<qui>"
//   pnpm --filter @jadwal/db exec node scripts/retention-hold.mjs lift  <identifiant>

// Les dépendances du paquet viennent de `@jadwal/db` — son propre nom — et non de `../src/*.ts`.
// Node refuse de retirer les types d'un fichier situé sous `node_modules`, et l'image de
// production, elle, y met ce paquet : un script qui importerait la source ne démarrerait pas
// sur le serveur. Il faut donc que `dist/` soit construit avant de lancer ces scripts à la main
// (`pnpm build`) ; la CI et l'image le font déjà, dans cet ordre (ADR 0034).
import postgres from 'postgres';
import { isMainModule } from './is-main.mjs';
import { connectionSettings, loadDotEnv } from '@jadwal/db';

loadDotEnv();

function client(overrides = {}) {
	const settings = connectionSettings('owner', overrides);
	return postgres({
		host: settings.host,
		port: settings.port,
		database: settings.database,
		username: settings.user,
		password: settings.password,
		connection: { search_path: 'public' },
		max: 1,
		onnotice: () => {}
	});
}

/**
 * Le relevé : un verrou par ligne, avec ce qu'il retient. Les comptes de lignes retenues disent la
 * conséquence du verrou, qui est la seule chose qu'on veut vraiment savoir en le relisant.
 *
 * @returns {Promise<{ slug: string, name: string, reason: string, placedBy: string, since: string,
 *   auditRows: number, adminRows: number }[]>}
 */
export async function listHolds(overrides = {}) {
	const sql = client(overrides);
	try {
		const rows = await sql`
			select o."slug", o."name", h."reason", h."placed_by", h."created_at",
				(select count(*) from "audit_log" a where a."organization_id" = h."organization_id")
					as audit_rows,
				(select count(*) from "admin_access_log" l
					where l."organization_id" = h."organization_id") as admin_rows
			from "retention_hold" h
			join "organization" o on o."id" = h."organization_id"
			order by h."created_at"
		`;
		return rows.map((row) => ({
			slug: row.slug,
			name: row.name,
			reason: row.reason,
			placedBy: row.placed_by,
			since: new Date(row.created_at).toISOString().slice(0, 10),
			auditRows: Number(row.audit_rows),
			adminRows: Number(row.admin_rows)
		}));
	} finally {
		await sql.end({ timeout: 5 });
	}
}

/** Pose un verrou. Écriture d'entretien : le drapeau de l'ADR 0019 est posé pour la transaction. */
export async function placeHold(slug, reason, placedBy, overrides = {}) {
	if (!slug || !reason?.trim() || !placedBy?.trim()) {
		throw new Error('identifiant, motif et auteur sont tous les trois obligatoires');
	}
	const sql = client(overrides);
	try {
		return await sql.begin(async (tx) => {
			await tx`set local jadwal.maintenance = 'on'`;
			const [organisation] = await tx`select "id" from "organization" where "slug" = ${slug}`;
			if (!organisation) throw new Error(`organisation inconnue : ${slug}`);
			await tx`
				insert into "retention_hold" ("organization_id", "reason", "placed_by")
				values (${organisation.id}, ${reason}, ${placedBy})
				on conflict ("organization_id") do update
					set "reason" = excluded."reason", "placed_by" = excluded."placed_by"
			`;
			return organisation.id;
		});
	} finally {
		await sql.end({ timeout: 5 });
	}
}

/** Lève un verrou. Rend le nombre de lignes retirées : zéro veut dire qu'il n'y en avait pas. */
export async function liftHold(slug, overrides = {}) {
	const sql = client(overrides);
	try {
		return await sql.begin(async (tx) => {
			await tx`set local jadwal.maintenance = 'on'`;
			const retirees = await tx`
				delete from "retention_hold" h
				using "organization" o
				where o."id" = h."organization_id" and o."slug" = ${slug}
				returning h."organization_id"
			`;
			return retirees.length;
		});
	} finally {
		await sql.end({ timeout: 5 });
	}
}

if (isMainModule(import.meta.filename)) {
	const [commande, ...reste] = process.argv.slice(2);
	if (commande === 'list' || commande === undefined) {
		const verrous = await listHolds();
		const seuil = reste.indexOf('--anciens');
		if (seuil >= 0) {
			// La veille horaire alerte au-delà de six mois (étape 9). Le tri est fait ici, et non
			// dans le script de veille, pour que le serveur n'ait besoin de rien d'autre qu'un
			// `grep` : Node est dans le conteneur, il n'a aucune raison d'être aussi sur l'hôte.
			// Ne rien afficher veut dire ne rien avoir à signaler, ce qui est la convention la
			// plus simple qu'un script shell puisse consommer.
			const jours = Number(reste[seuil + 1]);
			if (!Number.isFinite(jours)) throw new Error('--anciens attend un nombre de jours');
			const limite = Date.now() - jours * 86_400_000;
			for (const verrou of verrous) {
				if (Date.parse(verrou.since) >= limite) continue;
				process.stdout.write(
					`${verrou.slug} — posé le ${verrou.since} par ${verrou.placedBy} : ${verrou.reason}\n`
				);
			}
		} else if (verrous.length === 0) {
			process.stdout.write('Aucun verrou de conservation posé.\n');
		} else {
			process.stdout.write(`${verrous.length} verrou(x) de conservation :\n`);
			for (const verrou of verrous) {
				process.stdout.write(
					`  ${verrou.slug} (${verrou.name}) — posé le ${verrou.since} par ${verrou.placedBy}\n` +
						`    motif : ${verrou.reason}\n` +
						`    retient ${verrou.auditRows} entrée(s) de journal et ${verrou.adminRows} du registre interne\n`
				);
			}
		}
	} else if (commande === 'place') {
		const [slug, motif, auteur] = reste;
		await placeHold(slug, motif, auteur);
		process.stdout.write(
			`Verrou posé sur ${slug}. La purge est suspendue pour cette organisation.\n`
		);
	} else if (commande === 'lift') {
		const [slug] = reste;
		const retires = await liftHold(slug);
		process.stdout.write(
			retires === 0 ? `Aucun verrou sur ${slug}.\n` : `Verrou levé sur ${slug}.\n`
		);
	} else {
		process.stderr.write(
			'Commandes : list | place <identifiant> "<motif>" "<qui>" | lift <identifiant>\n'
		);
		process.exitCode = 2;
	}
}

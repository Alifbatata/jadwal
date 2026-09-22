// Supprime une organisation, et tout ce qui lui appartient, pour de bon.
//
//     node node_modules/@jadwal/db/scripts/delete-organization.mjs --slug association-exemple
//     node node_modules/@jadwal/db/scripts/delete-organization.mjs --slug association-exemple \
//       --confirmer association-exemple
//
// ## Pourquoi elle existe
//
// `docs/CONDITIONS.md` promet qu'une organisation peut demander sa suppression, et aucun écran ne
// la fait. Sans cette commande, l'exploitant devrait taper un `delete` à la main dans la base, et
// compter lui-même ce qui part : la chose qu'aucune documentation ne devrait avoir à conseiller.
// Elle sert aussi aux organisations d'essai qu'on ouvre pour éprouver le parcours en production :
// jusqu'ici, on ne pouvait que les suspendre.
//
// ## Ce qu'elle fait
//
// **Sans `--confirmer`, elle n'efface rien.** Elle ouvre une transaction en lecture seule, et dit
// ce qui partirait, table par table, puis ce qui resterait.
//
// **Avec `--confirmer <identifiant>`**, recopié à l'identique, elle supprime la ligne de
// l'organisation dans une seule transaction. Les clés étrangères font le reste, et chacune a été
// relue dans les migrations :
//
//   - en cascade depuis `organization` : `membership`, `room`, `course`, `invitation`, `pause`,
//     `prayer_day`, `prayer_settings`, `prayer_period`, `audit_log`, `page_view` (0001, 0016,
//     0042, 0046) ;
//   - en cascade depuis `course` : `course_translation`, `session_exception`, et les pauses d'un
//     cours (0001) ;
//   - en cascade depuis `membership` : `terms_acceptance` (0051) ;
//   - `session.active_organization_id` passe à `null` (0021) : la session reste, elle oublie
//     seulement l'organisation choisie ;
//   - `retention_hold` est en `restrict` (0040, ADR 0030) : un verrou bloque tout.
//
// Le déclencheur qui protège la dernière personne responsable (0012) laisse passer : il constate
// que l'organisation elle-même a disparu, et n'a plus personne à protéger.
//
// **Les tables viennent du catalogue**, pas d'une liste recopiée ici : chaque table qui porte une
// colonne `organization_id`, ce que l'ADR 0013 impose à toute table de données d'organisation. La
// liste `EMPORTE` ne donne qu'un libellé et un ordre. Une table ajoutée demain et oubliée ici est
// donc montrée quand même, sous son nom de table, dans l'aperçu comme dans le compte rendu : rien
// ne part sans avoir été compté. Et après la suppression, dans la même transaction, la commande
// recompte chacune de ces tables et annule tout si une seule ligne reste : une table ajoutée sans
// cascade la fait échouer au lieu de laisser des lignes orphelines en silence.
//
// **Ce qui est compté est ce qui est effacé, ou rien ne l'est.** La transaction est en lecture
// répétable : les comptes et la suppression voient le même état de la base. Si une autre écriture
// touche une ligne de l'organisation entre les deux, PostgreSQL refuse la suppression plutôt que
// d'effacer autre chose que ce qui a été montré, et la commande dit de la relancer.
//
// ## Ce qu'elle ne fait pas
//
// - Elle ne passe pas outre un verrou de conservation. La base refuserait de toute façon ; la
//   commande le voit avant d'essayer, le dit, et dit comment le lever.
// - Elle ne supprime **aucun compte**. Seules les adhésions partent. Un compte sans organisation
//   est l'affaire de `jadwal.purge_orphan_accounts()` (0034, 0054), qui a ses propres conditions.
// - Elle ne touche pas au registre interne (`admin_access_log`) : il n'a pas de clé étrangère vers
//   l'organisation (ADR 0025), et ses lignes gardent leur durée de 24 mois (0039, 0041).
// - Elle ne peut rien aux sauvegardes déjà faites, ni au journal technique du serveur.
//
// ## Pourquoi le rôle du serveur
//
// Trois rôles pourraient supprimer la ligne. Un seul peut vérifier ce qu'il a fait.
//
// - **Le propriétaire** a une politique de suppression sur `organization` sous son drapeau
//   d'entretien. Mais il ne lit pas le journal d'audit (migrations 0029 et 0039, ADR 0020) : il y
//   compterait zéro ligne avant, zéro après, et la vérification passerait sans avoir rien vu.
//   C'est le « 0 ligne » muet que ce dépôt a déjà rencontré, et une vérification aveugle est pire
//   que pas de vérification.
// - **Le super-admin applicatif** a une politique de suppression sur `organization`. Mais il n'a
//   aucun droit sur `retention_hold` : il ne verrait le verrou qu'en butant dessus. Ses lectures
//   sont bornées au contexte d'une organisation, et surtout son mot de passe vit dans le conteneur
//   exposé à Internet : la suppression définitive d'une organisation ne doit pas être à la portée
//   de qui aurait pris l'application.
// - **Le rôle du serveur**, superutilisateur, voit toutes les lignes : son aperçu et son recompte
//   disent vrai. Son mot de passe n'est pas dans le conteneur de l'application : seuls `init.env`
//   et PostgreSQL lui-même le portent (ADR 0040). Il faut donc un accès au serveur, comme pour
//   `super-admin.mjs` et `reset-passkeys.mjs`.
//
// Elle n'affiche aucun secret, et ne lit aucune adresse électronique : des nombres, le nom,
// l'identifiant et la clé interne de l'organisation, et, pour un verrou, le motif et l'auteur que
// l'exploitant a lui-même écrits.

// Les dépendances du paquet viennent de `@jadwal/db` (son propre nom), et non de `../src/*.ts`.
// Node refuse de retirer les types d'un fichier situé sous `node_modules`, et l'image de
// production, elle, y met ce paquet : un script qui importerait la source ne démarrerait pas
// sur le serveur.
import postgres from 'postgres';
import { isMainModule } from './is-main.mjs';
import { connectionSettings, loadDotEnv } from '@jadwal/db';

loadDotEnv();

/**
 * Le libellé de chaque table qui part avec l'organisation, dans l'ordre où la commande les montre.
 * Une table du catalogue absente d'ici est montrée quand même, sous son nom de table.
 */
export const EMPORTE = [
	['membership', 'adhésion(s)'],
	['course', 'cours'],
	['course_translation', 'traduction(s) de cours'],
	['session_exception', 'exception(s) de séance'],
	['pause', 'pause(s)'],
	['room', 'salle(s)'],
	['invitation', 'invitation(s)'],
	['terms_acceptance', 'acceptation(s) des conditions'],
	['audit_log', 'ligne(s) du journal des modifications'],
	['page_view', 'ligne(s) du compteur de vues'],
	['prayer_day', 'jour(s) de prière'],
	['prayer_period', "période(s) d'horaires"],
	['prayer_settings', 'réglage(s) des heures de prière']
];

/**
 * Les tables qui gardent une colonne `organization_id` après la suppression, par construction. Le
 * recompte les saute ; toutes les autres doivent tomber à zéro.
 */
const RESTE_PAR_CONSTRUCTION = new Set(['admin_access_log']);

/**
 * La table des verrous de conservation. Sa clé est en `restrict` : une ligne y empêche la
 * suppression, donc elle ne figure jamais dans ce qui part.
 */
const VERROUS = 'retention_hold';

/**
 * Les deux codes de PostgreSQL qui disent qu'une autre transaction a touché les mêmes lignes :
 * accès sérialisé impossible, et interblocage. Dans les deux cas, rien n'a été effacé.
 */
const ECRITURE_CONCURRENTE = new Set(['40001', '40P01']);

/** Une erreur qui se dit à l'exploitant telle quelle, sans pile. */
class Refus extends Error {}

/**
 * Les tables qui portent une colonne `organization_id`, lues dans le catalogue. Une partition est
 * comptée par sa table mère, et pas une seconde fois pour elle-même.
 */
async function tablesDOrganisation(tx) {
	const lignes = await tx`
		select c.relname as table
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		join pg_attribute a on a.attrelid = c.oid
		where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
			and a.attname = 'organization_id' and a.attnum > 0 and not a.attisdropped
		order by c.relname
	`;
	return lignes.map((ligne) => ligne.table);
}

export function parseArgs(argv) {
	let slug;
	let confirmation;
	for (let i = 0; i < argv.length; i += 1) {
		const argument = argv[i];
		if (argument === '--slug' || argument === '--confirmer') {
			const valeur = argv[i + 1];
			if (valeur === undefined || valeur.startsWith('--')) {
				throw new Refus(`${argument} attend un identifiant.`);
			}
			if (argument === '--slug') slug = valeur;
			else confirmation = valeur;
			i += 1;
		} else {
			throw new Refus(`Argument inconnu : ${argument}`);
		}
	}
	if (!slug) throw new Refus('Il faut --slug <identifiant>.');
	// Avant toute connexion : une confirmation qui ne recopie pas l'identifiant ne doit même pas
	// ouvrir la base. C'est la faute de frappe qu'on veut arrêter, pas la deviner.
	if (confirmation !== undefined && confirmation !== slug) {
		throw new Refus(
			`Refusé : --confirmer doit recopier l'identifiant à l'identique ` +
				`(--slug ${slug}, --confirmer ${confirmation}). Rien n'a été effacé.`
		);
	}
	return { slug, confirmer: confirmation !== undefined };
}

/**
 * @param {object} options
 * @param {string} options.slug l'identifiant de l'organisation
 * @param {boolean} options.confirmer faux pour l'aperçu, vrai pour supprimer
 * @param {Record<string, unknown>} [options.overrides] de quoi viser une autre base
 * @param {NodeJS.ProcessEnv} [options.env]
 * @returns {Promise<{
 *   organisation: { id: string, slug: string, name: string, status: string, createdAt: string },
 *   emportees: { table: string, libelle: string, lignes: number }[],
 *   restes: { comptes: number, sansAutre: number, registre: number, sessions: number },
 *   verrou: { reason: string, placedBy: string, since: string } | null,
 *   supprimee: boolean
 * }>}
 * @throws {Refus} si l'identifiant est inconnu ; si l'on confirme et qu'un verrou est posé, qu'une
 *   ligne de l'organisation resterait, ou qu'une autre écriture a touché l'organisation
 *   entre-temps. Dans tous ces cas, la transaction est annulée et rien n'est effacé.
 */
export async function deleteOrganization({ slug, confirmer, overrides = {}, env = process.env }) {
	const settings = connectionSettings('admin', overrides, env);
	const client = postgres({
		host: settings.host,
		port: settings.port,
		database: settings.database,
		username: settings.user,
		password: settings.password,
		connection: { search_path: 'public' },
		max: 1,
		onnotice: () => {}
	});
	try {
		// L'aperçu tourne en lecture seule : ce n'est pas une promesse du code, c'est la base qui
		// refuserait une écriture. Les deux modes sont en lecture répétable : tous les comptes voient
		// le même état de la base, et la suppression efface ce qui a été compté ou échoue. La ligne
		// de l'organisation est verrouillée dès sa lecture : aucune ligne ne peut s'y rattacher
		// directement, ni aucun verrou de conservation être posé, avant la fin de la transaction.
		const mode = confirmer
			? 'isolation level repeatable read read write'
			: 'isolation level repeatable read read only';
		return await client.begin(mode, async (tx) => {
			const [organisation] = confirmer
				? await tx`
						select "id", "slug", "name", "status", "created_at" from "organization"
						where "slug" = ${slug} for update
					`
				: await tx`
						select "id", "slug", "name", "status", "created_at" from "organization"
						where "slug" = ${slug}
					`;
			if (!organisation) {
				throw new Refus(`Aucune organisation n'a l'identifiant « ${slug} ». Rien n'a été effacé.`);
			}
			const id = organisation.id;

			const [verrou] = await tx`
				select "reason", "placed_by", "created_at" from "retention_hold"
				where "organization_id" = ${id}
			`;

			// Le catalogue décide des tables, `EMPORTE` de leur libellé et de leur ordre. Une table
			// que la liste ne connaît pas vient à la fin, sous son nom : elle est montrée, pas tue.
			const tables = await tablesDOrganisation(tx);
			const libelles = new Map(EMPORTE);
			const parties = [
				...EMPORTE.map(([table]) => table).filter((table) => tables.includes(table)),
				...tables.filter(
					(table) => !libelles.has(table) && table !== VERROUS && !RESTE_PAR_CONSTRUCTION.has(table)
				)
			];
			const emportees = [];
			for (const table of parties) {
				const [ligne] = await tx`
					select count(*)::int as n from ${tx(table)} where "organization_id" = ${id}
				`;
				const libelle = libelles.get(table) ?? `ligne(s) de la table ${table}`;
				emportees.push({ table, libelle, lignes: ligne.n });
			}

			const [comptes] = await tx`
				select count(*)::int as tous,
					(count(*) filter (where not exists (
						select 1 from "membership" autre
						where autre."user_id" = m."user_id" and autre."organization_id" <> ${id}
					)))::int as sans_autre
				from "membership" m where m."organization_id" = ${id}
			`;
			const [registre] = await tx`
				select count(*)::int as n from "admin_access_log" where "organization_id" = ${id}
			`;
			const [sessions] = await tx`
				select count(*)::int as n from "session" where "active_organization_id" = ${id}
			`;

			const resultat = {
				organisation: {
					id,
					slug: organisation.slug,
					name: organisation.name,
					status: organisation.status,
					createdAt: new Date(organisation.created_at).toISOString().slice(0, 10)
				},
				emportees,
				restes: {
					comptes: comptes.tous,
					sansAutre: comptes.sans_autre,
					registre: registre.n,
					sessions: sessions.n
				},
				verrou: verrou
					? {
							reason: verrou.reason,
							placedBy: verrou.placed_by,
							since: new Date(verrou.created_at).toISOString().slice(0, 10)
						}
					: null,
				supprimee: false
			};
			if (!confirmer) return resultat;
			if (resultat.verrou) throw new Refus(refusSousVerrou(resultat));

			const supprimees = await tx`delete from "organization" where "id" = ${id} returning "id"`;
			if (supprimees.length !== 1) {
				throw new Error(
					`La suppression n'a pas atteint l'organisation ${slug}. Rien n'a été effacé.`
				);
			}

			// Le recompte, dans la même transaction, sur les tables du catalogue. Une table qu'une
			// cascade n'atteint pas garde sa ligne, et c'est ici qu'elle se voit.
			const laisses = [];
			for (const table of tables) {
				if (RESTE_PAR_CONSTRUCTION.has(table)) continue;
				const [ligne] = await tx`
					select count(*)::int as n from ${tx(table)} where "organization_id" = ${id}
				`;
				if (ligne.n > 0) laisses.push(`${table} : ${ligne.n}`);
			}
			const [encore] = await tx`select count(*)::int as n from "organization" where "id" = ${id}`;
			if (encore.n > 0) laisses.push(`organization : ${encore.n}`);
			const [choisie] = await tx`
				select count(*)::int as n from "session" where "active_organization_id" = ${id}
			`;
			if (choisie.n > 0) laisses.push(`session.active_organization_id : ${choisie.n}`);
			if (laisses.length > 0) {
				// Lever annule la transaction : rien de ce qui précède n'est gardé.
				throw new Refus(
					`La suppression laisserait des lignes derrière elle (${laisses.join(', ')}) : ` +
						`elle est annulée. Rien n'a été effacé.`
				);
			}
			return { ...resultat, supprimee: true };
		});
	} catch (erreur) {
		if (ECRITURE_CONCURRENTE.has(erreur?.code)) {
			throw new Refus(
				`Une autre écriture a touché cette organisation pendant la suppression : tout est ` +
					`annulé pour ne pas effacer autre chose que ce qui a été compté. Rien n'a été ` +
					`effacé. Relancez la même commande : elle recomptera.`
			);
		}
		throw erreur;
	} finally {
		await client.end({ timeout: 5 });
	}
}

function refusSousVerrou({ organisation, verrou }) {
	return [
		`Suppression impossible : un verrou de conservation est posé sur ${organisation.slug} ` +
			`depuis le ${verrou.since}, par ${verrou.placedBy}.`,
		`  motif : ${verrou.reason}`,
		`Le verrou retient le journal des modifications et le registre interne le temps d'un litige,`,
		`et la base ne supprime pas une organisation qui en porte un (ADR 0030).`,
		`Si le litige est réglé, levez le verrou d'abord, puis relancez :`,
		`  retention-hold.mjs lift ${organisation.slug}`,
		`Rien n'a été effacé.`
	].join('\n');
}

const ETATS = { active: 'active', suspended: 'suspendue' };

function identite({ organisation }) {
	return [
		`  identifiant : ${organisation.slug}`,
		`  clé interne : ${organisation.id}`,
		`  état        : ${ETATS[organisation.status] ?? organisation.status}`,
		`  créée le    : ${organisation.createdAt}`
	];
}

function tableau({ emportees }) {
	return emportees.map(({ lignes, libelle }) => `${String(lignes).padStart(7)}  ${libelle}`);
}

function ceQuiReste({ restes }) {
	const lignes = [
		`Ce qui reste, et que cette commande ne touche pas :`,
		`  - Les comptes des personnes : ${restes.comptes} compte(s), dont ${restes.sansAutre} sans ` +
			`autre organisation.`,
		`    Seule l'adhésion part ; l'adresse, les sessions et les passkeys restent. La purge de`,
		`    chaque nuit efface un compte sans organisation créé il y a plus de douze mois, quand il`,
		`    n'a plus de session (une session part après trente jours sans usage) et qu'aucune`,
		`    invitation encore valide ne vise son adresse : une invitation expirée ne le retient pas.`,
		`    Elle n'efface jamais un compte super-admin.`
	];
	if (restes.sessions > 0) {
		lignes.push(
			`  - Les sessions restent ouvertes. Celles qui avaient choisi cette organisation l'oublient :`,
			`    ${restes.sessions} session(s).`
		);
	}
	lignes.push(
		`  - Le registre interne des accès de l'exploitant : ${restes.registre} ligne(s).`,
		`    Il n'a pas de clé étrangère vers l'organisation, et garde sa clé interne et son`,
		`    identifiant ; chaque ligne part avec la purge de chaque nuit, 24 mois après avoir été`,
		`    écrite.`,
		`  - Les sauvegardes chiffrées déjà faites, qui ne se réécrivent pas. Chez le stockage, la`,
		`    dernière archive qui contient l'organisation est effacée à 181 jours au plus`,
		`    (ADR 0037). Sur le disque du serveur, la règle garde les cinq dernières archives du 1er`,
		`    du mois : l'organisation peut y rester jusqu'à 153 jours.`,
		`  - Le journal technique du serveur, où l'identifiant figure dans les adresses demandées.`,
		`    Un script coupe ce journal chaque nuit, et n'en garde aucune ligne plus de quatorze jours.`
	);
	return lignes;
}

/** L'aperçu, sans rien effacer. */
export function decrireApercu(resultat) {
	const lignes = [
		`Organisation : ${resultat.organisation.name}`,
		...identite(resultat),
		``,
		`Ce qui partirait avec elle :`,
		...tableau(resultat),
		``,
		...ceQuiReste(resultat),
		``
	];
	if (!resultat.verrou) {
		lignes.push(
			`Rien n'a été effacé. Pour supprimer cette organisation, relancez la même commande en ajoutant :`,
			`  --confirmer ${resultat.organisation.slug}`
		);
	}
	return `${lignes.join('\n')}\n`;
}

/** Le compte rendu, une fois la transaction validée. */
export function decrireSuppression(resultat) {
	return (
		[
			`Organisation supprimée : ${resultat.organisation.name} (${resultat.organisation.slug})`,
			...identite(resultat),
			``,
			`Ce qui a été effacé :`,
			...tableau(resultat),
			``,
			`Vérifié dans la même transaction : il ne reste aucune ligne de cette organisation, hors`,
			`du registre interne dit plus bas.`,
			``,
			...ceQuiReste(resultat)
		].join('\n') + '\n'
	);
}

if (isMainModule(import.meta.filename)) {
	try {
		const options = parseArgs(process.argv.slice(2));
		const resultat = await deleteOrganization(options);
		if (resultat.supprimee) {
			process.stdout.write(decrireSuppression(resultat));
		} else {
			process.stdout.write(decrireApercu(resultat));
			if (resultat.verrou) {
				process.stderr.write(`${refusSousVerrou(resultat)}\n`);
				process.exitCode = 1;
			}
		}
	} catch (erreur) {
		// Un refus se dit tel quel. Une autre erreur aussi, mais sans sa pile : son message suffit
		// à l'exploitant, et le pilote de PostgreSQL n'y met jamais de mot de passe.
		process.stderr.write(`${erreur instanceof Error ? erreur.message : erreur}\n`);
		process.exitCode = 1;
	}
}

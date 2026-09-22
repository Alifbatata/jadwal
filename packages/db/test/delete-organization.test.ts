// La commande d'exploitant qui supprime une organisation, et tout ce qui lui appartient.
//
// Ces tests la **lancent** comme l'exploitant la lance : en sous-processus, avec ses vrais
// arguments, contre la base de test. Aucun n'appelle une fonction du script : la règle du dépôt dit
// qu'un script qu'aucun test ne lance n'est pas éprouvé, et `super-admin.mjs` a passé sept tests
// sans jamais s'exécuter.
//
// Ce qu'ils vérifient est son **effet en base**, compté par le rôle du serveur, qui voit toutes les
// lignes. Un comptage fait par un rôle soumis à la sécurité au niveau des lignes pourrait rendre
// zéro parce qu'il ne voit rien, et passer pour une preuve : le propriétaire, par exemple, n'a
// aucune politique de lecture sur `audit_log`.
//
// Ce qu'elle doit faire : montrer sans rien effacer tant qu'on ne confirme pas ; refuser une
// confirmation qui ne recopie pas l'identifiant ; supprimer pour de bon quand on confirme, en
// emportant tout ce qui appartient à l'organisation et rien de ce qui appartient à une autre ;
// laisser les comptes des personnes et le registre interne ; refuser sous un verrou de
// conservation ; refuser un identifiant inconnu ; montrer une table qu'elle ne connaît pas au lieu
// de l'effacer sans le dire ; tout annuler si une autre écriture touche l'organisation pendant la
// suppression ; n'afficher aucun secret.

import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { newId, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
	firstRow,
	openDatabase,
	seedOrganisation,
	withMaintenance,
	type Organisation
} from './helpers.js';

const SCRIPT = fileURLToPath(new URL('../scripts/delete-organization.mjs', import.meta.url));
const VERROU = fileURLToPath(new URL('../scripts/retention-hold.mjs', import.meta.url));

/** Ce qui distingue les organisations et les comptes de ce fichier de ceux des autres. */
const PREFIXE = `suppr-${Date.now().toString(36)}`;
const DOMAINE = '@exemple-suppression.test';

let serveur: DatabaseHandle;
let owner: DatabaseHandle;
/**
 * Le rôle du serveur, superutilisateur : il compte toutes les lignes, sans politique entre elles.
 */
let db: Database;

/** Tout ce que la commande a écrit, pour vérifier à la fin qu'aucun secret n'y figure. */
const sorties: string[] = [];

function lancer(script: string, args: string[]) {
	const resultat = spawnSync(process.execPath, [script, ...args], {
		encoding: 'utf8',
		env: { ...process.env, POSTGRES_DB: inject('testDatabase') }
	});
	sorties.push(resultat.stdout ?? '', resultat.stderr ?? '');
	return resultat;
}

const commande = (...args: string[]) => lancer(SCRIPT, args);

/** La commande en tâche de fond : le test garde la main pendant qu'elle tourne. */
function commandeEnFond(
	...args: string[]
): Promise<{ status: number | null; stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const enfant = spawn(process.execPath, [SCRIPT, ...args], {
			env: { ...process.env, POSTGRES_DB: inject('testDatabase') }
		});
		let stdout = '';
		let stderr = '';
		enfant.stdout.setEncoding('utf8').on('data', (morceau: string) => (stdout += morceau));
		enfant.stderr.setEncoding('utf8').on('data', (morceau: string) => (stderr += morceau));
		enfant.on('error', reject);
		enfant.on('close', (status) => {
			sorties.push(stdout, stderr);
			resolve({ status, stdout, stderr });
		});
	});
}

/** Les tables qui ne figurent pas dans le tableau de ce qui part : voir la commande. */
const HORS_TABLEAU = ['admin_access_log', 'retention_hold'];

/** Les lignes chiffrées d'un tableau de la commande, sous le titre donné. */
function tableau(sortie: string, titre: string): { lignes: number; libelle: string }[] {
	const debut = sortie.indexOf(`${titre}\n`);
	if (debut === -1) return [];
	const bloc = sortie.slice(debut + titre.length + 1).split('\n\n')[0] ?? '';
	return bloc.split('\n').flatMap((ligne) => {
		const trouve = /^\s+(\d+) {2}(.+)$/u.exec(ligne);
		return trouve ? [{ lignes: Number(trouve[1]), libelle: trouve[2] ?? '' }] : [];
	});
}

async function nombre(requete: ReturnType<typeof sql>): Promise<number> {
	return Number(firstRow<{ n: string }>(await db.execute(requete))?.n ?? '-1');
}

/**
 * Les tables qui portent une colonne `organization_id`, lues dans le catalogue et non recopiées
 * ici : une table ajoutée par une migration future entre d'elle-même dans le comptage.
 */
async function tablesDOrganisation(): Promise<string[]> {
	const lignes = allRows<{ table_name: string }>(
		await db.execute(sql`
			select c.relname as table_name
			from pg_class c
			join pg_namespace n on n.oid = c.relnamespace
			join pg_attribute a on a.attrelid = c.oid
			where n.nspname = 'public' and c.relkind = 'r'
				and a.attname = 'organization_id' and a.attnum > 0 and not a.attisdropped
			order by c.relname
		`)
	);
	return lignes.map((ligne) => ligne.table_name);
}

/** Tout ce qui se rapporte à une organisation, table par table. */
async function compter(organizationId: string): Promise<Record<string, number>> {
	const comptes: Record<string, number> = {};
	for (const table of await tablesDOrganisation()) {
		comptes[table] = await nombre(
			sql`select count(*)::text as n from ${sql.identifier(table)}
			    where "organization_id" = ${organizationId}`
		);
	}
	comptes['organization'] = await nombre(
		sql`select count(*)::text as n from "organization" where "id" = ${organizationId}`
	);
	comptes['session.active_organization_id'] = await nombre(
		sql`select count(*)::text as n from "session" where "active_organization_id" = ${organizationId}`
	);
	return comptes;
}

async function compteExiste(userId: string): Promise<boolean> {
	return (await nombre(sql`select count(*)::text as n from "user" where "id" = ${userId}`)) === 1;
}

/**
 * Une organisation complète (`seedOrganisation` : une ligne dans chaque table d'organisation),
 * plus ce qui reste par construction après une suppression : deux lignes du registre interne, et
 * une session dont c'est l'organisation choisie.
 */
async function organisation(nom: string): Promise<Organisation & { sessionId: string }> {
	const org = await seedOrganisation(owner.db, `${PREFIXE}-${nom}`);
	for (const action of ['read', 'write']) {
		await db.execute(sql`
			insert into "admin_access_log" ("id", "organization_id", "organization_slug", "actor_id",
				"action", "route")
			values (${newId()}, ${org.id}, ${org.slug}, ${org.userId}, ${action}, '/cours')
		`);
	}
	const sessionId = newId();
	await db.execute(sql`
		insert into "session" ("id", "user_id", "token", "expires_at", "active_organization_id")
		values (${sessionId}, ${org.userId}, ${`${sessionId}-jeton`}, now() + interval '7 days',
			${org.id})
	`);
	return { ...org, sessionId };
}

/** Une personne qui appartient à deux organisations, avec son acceptation des conditions. */
async function personneDeDeux(premiere: string, seconde: string): Promise<string> {
	const userId = newId();
	await withMaintenance(owner.db, async (tx) => {
		await tx.execute(sql`
			insert into "user" ("id", "email", "name")
			values (${userId}, ${`${PREFIXE}-deux${DOMAINE}`}, 'Personne de deux organisations')
		`);
		for (const organizationId of [premiere, seconde]) {
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organizationId}, ${userId}, 'editor')
			`);
		}
		await tx.execute(sql`
			insert into "terms_acceptance" ("id", "organization_id", "user_id", "version")
			values (${newId()}, ${premiere}, ${userId}, '2026-09-01')
		`);
	});
	return userId;
}

beforeAll(() => {
	serveur = openDatabase('admin');
	owner = openDatabase('owner');
	db = serveur.db;
});

afterAll(async () => {
	// Ce que les tests ont laissé : les organisations qui ne sont pas parties, leurs verrous, le
	// registre interne, qu'aucune clé ne relie à elles, et les comptes.
	await db.execute(sql`
		delete from "retention_hold" h using "organization" o
		where o."id" = h."organization_id" and o."slug" like ${`${PREFIXE}-%`}
	`);
	await db.execute(sql`delete from "organization" where "slug" like ${`${PREFIXE}-%`}`);
	await db.execute(
		sql`delete from "admin_access_log" where "organization_slug" like ${`${PREFIXE}-%`}`
	);
	await db.execute(sql`
		delete from "user"
		where "email" like ${`${PREFIXE}-%@example.test`} or "email" like ${`%${DOMAINE}`}
	`);
	await owner.close();
	await serveur.close();
});

describe('les arguments', () => {
	it('exige un identifiant, et refuse ce qu’elle ne connaît pas', () => {
		const sans = commande();
		expect(sans.status).toBe(1);
		expect(sans.stderr).toContain('--slug');

		const vide = commande('--slug');
		expect(vide.status).toBe(1);
		expect(vide.stderr).toContain('--slug');

		const inconnu = commande('--slug', `${PREFIXE}-quelconque`, '--quoi');
		expect(inconnu.status).toBe(1);
		expect(inconnu.stderr).toContain('Argument inconnu');
	});
});

describe('l’aperçu, sans --confirmer', () => {
	it('dit ce qui partirait, et n’efface rien', async () => {
		const org = await organisation('apercu');
		const avant = await compter(org.id);
		// Sans cette garde, le test prouverait qu'un aperçu de rien ne change rien.
		for (const table of Object.keys(avant).filter((t) => t !== 'retention_hold')) {
			expect(avant[table], table).toBeGreaterThan(0);
		}

		const { status, stdout, stderr } = commande('--slug', org.slug);

		expect(stderr, 'rien sur la sortie d’erreur').toBe('');
		expect(status, 'un aperçu réussit').toBe(0);
		expect(stdout).toContain(`Association ${org.slug}`);
		expect(stdout).toContain(org.slug);
		expect(stdout).toContain(org.id);
		expect(stdout).toContain('active');
		for (const libelle of [
			'adhésion(s)',
			'cours',
			'traduction(s) de cours',
			'salle(s)',
			'invitation(s)',
			'exception(s) de séance',
			'pause(s)',
			'ligne(s) du journal des modifications',
			'acceptation(s) des conditions',
			'ligne(s) du compteur de vues',
			'jour(s) de prière',
			"période(s) d'horaires",
			'réglage(s) des heures de prière'
		]) {
			expect(stdout, libelle).toMatch(
				new RegExp(`\\s1  ${libelle.replace(/[()]/g, '\\$&')}\\n`, 'u')
			);
		}
		// Une ligne par table qui part, lue dans le catalogue et non dans la liste ci-dessus : une
		// table ajoutée par une migration, et oubliée par la commande, fait tomber ce compte.
		const parties = tableau(stdout, 'Ce qui partirait avec elle :');
		const attendues = (await tablesDOrganisation()).filter((t) => !HORS_TABLEAU.includes(t));
		expect(parties.length, 'une ligne par table d’organisation').toBe(attendues.length);
		for (const { lignes, libelle } of parties) {
			expect(lignes, libelle).toBe(1);
			expect(libelle, 'chaque table connue a son libellé').not.toContain('de la table');
		}
		expect(stdout, 'ce qui reste est dit aussi').toContain('registre interne');
		expect(stdout).toContain("Rien n'a été effacé");
		expect(stdout, 'et comment confirmer').toContain(`--confirmer ${org.slug}`);

		expect(await compter(org.id), 'la base est intacte').toEqual(avant);
	});
});

describe('une confirmation qui ne recopie pas l’identifiant', () => {
	it('est refusée, sans rien toucher', async () => {
		const org = await organisation('faute');
		const avant = await compter(org.id);

		const { status, stdout, stderr } = commande('--slug', org.slug, '--confirmer', `${org.slug}x`);

		expect(status, 'refusée').toBe(1);
		expect(stderr).toContain('--confirmer');
		expect(stderr).toContain("Rien n'a été effacé");
		expect(stdout).toBe('');
		expect(await compter(org.id)).toEqual(avant);
	});
});

describe('la suppression, avec --confirmer', () => {
	it('emporte tout ce qui appartient à l’organisation, et rien d’une autre', async () => {
		const condamnee = await organisation('condamnee');
		const gardee = await organisation('gardee');
		const deux = await personneDeDeux(condamnee.id, gardee.id);

		const avant = await compter(condamnee.id);
		expect(avant['membership'], 'deux adhésions : la responsable et la personne de deux').toBe(2);
		expect(avant['terms_acceptance']).toBe(2);
		const voisineAvant = await compter(gardee.id);

		const { status, stdout, stderr } = commande(
			'--slug',
			condamnee.slug,
			'--confirmer',
			condamnee.slug
		);

		expect(stderr, 'rien sur la sortie d’erreur').toBe('');
		expect(status, 'la suppression réussit').toBe(0);
		expect(stdout).toContain(`Organisation supprimée : Association ${condamnee.slug}`);
		expect(stdout).toMatch(/\s2 {2}adhésion\(s\)\n/u);
		expect(stdout).toMatch(/\s2 {2}acceptation\(s\) des conditions\n/u);
		expect(stdout).toContain('il ne reste aucune ligne de cette organisation');
		// Ce qui reste est compté, lui aussi : les deux lignes du registre, la session qui oublie.
		expect(stdout).toContain("Le registre interne des accès de l'exploitant : 2 ligne(s).");
		expect(stdout).toMatch(/l'oublient :\n\s+1 session\(s\)\.\n/u);

		// L'effet, table par table. Tout part, sauf deux choses qui restent par construction.
		const apres = await compter(condamnee.id);
		for (const [table, lignes] of Object.entries(apres)) {
			if (table === 'admin_access_log') continue;
			expect(lignes, `${table} : plus rien pour cette organisation`).toBe(0);
		}
		expect(apres['admin_access_log'], 'le registre interne garde ses deux lignes').toBe(2);
		expect(
			await nombre(
				sql`select count(*)::text as n from "session" where "id" = ${condamnee.sessionId}`
			),
			'la session reste ouverte ; elle oublie seulement l’organisation choisie'
		).toBe(1);

		// Les comptes des personnes restent : la commande n'en supprime aucun.
		expect(await compteExiste(condamnee.userId), 'le compte de la responsable reste').toBe(true);
		expect(await compteExiste(deux), 'celui de la personne de deux organisations aussi').toBe(true);
		expect(
			await nombre(sql`select count(*)::text as n from "membership" where "user_id" = ${deux}`),
			'qui garde son adhésion à l’autre organisation'
		).toBe(1);

		// Et l'autre organisation n'a pas perdu une ligne.
		expect(await compter(gardee.id), 'l’autre organisation est intacte').toEqual(voisineAvant);
	});

	it('refuse un identifiant inconnu, et le dit', () => {
		for (const args of [
			['--slug', `${PREFIXE}-jamais-vue`],
			['--slug', `${PREFIXE}-jamais-vue`, '--confirmer', `${PREFIXE}-jamais-vue`]
		]) {
			const { status, stdout, stderr } = commande(...args);
			expect(status, 'un identifiant inconnu est une erreur, pas un succès').toBe(1);
			expect(stderr).toContain('Aucune organisation');
			expect(stderr).toContain(`${PREFIXE}-jamais-vue`);
			expect(stdout).toBe('');
		}
	});
});

describe('sous un verrou de conservation', () => {
	it('refuse de supprimer, le dit avant d’essayer, et n’efface rien', async () => {
		const org = await organisation('verrou');
		const pose = lancer(VERROU, ['place', org.slug, 'litige en cours', 'l’exploitant']);
		expect(pose.status, pose.stderr).toBe(0);
		const avant = await compter(org.id);
		expect(avant['retention_hold']).toBe(1);

		const refus = commande('--slug', org.slug, '--confirmer', org.slug);
		expect(refus.status, 'refusée').toBe(1);
		expect(refus.stderr).toContain('verrou de conservation');
		expect(refus.stderr).toContain('litige en cours');
		expect(refus.stderr, 'avec le moyen de le lever').toContain(
			`retention-hold.mjs lift ${org.slug}`
		);
		expect(refus.stderr).toContain("Rien n'a été effacé");
		expect(refus.stdout).toBe('');
		expect(await compter(org.id), 'la base est intacte').toEqual(avant);

		// L'aperçu, lui, montre ce que le verrou retient, et prévient que la suite sera refusée.
		const apercu = commande('--slug', org.slug);
		expect(apercu.status).toBe(1);
		expect(apercu.stdout).toMatch(/\s1 {2}ligne\(s\) du journal des modifications\n/u);
		expect(apercu.stdout).not.toContain('--confirmer');
		expect(apercu.stderr).toContain('verrou de conservation');
		expect(await compter(org.id)).toEqual(avant);
	});

	it('supprime une fois le verrou levé, comme la marche à suivre le dit', async () => {
		const org = await organisation('levee');
		expect(lancer(VERROU, ['place', org.slug, 'litige réglé', 'l’exploitant']).status).toBe(0);
		expect(commande('--slug', org.slug, '--confirmer', org.slug).status).toBe(1);

		const levee = lancer(VERROU, ['lift', org.slug]);
		expect(levee.status, levee.stderr).toBe(0);
		const suppression = commande('--slug', org.slug, '--confirmer', org.slug);
		expect(suppression.stderr).toBe('');
		expect(suppression.status).toBe(0);
		expect((await compter(org.id))['organization']).toBe(0);
	});
});

describe('une table que la commande ne connaît pas', () => {
	// Une migration future qui ajouterait une table d'organisation sans penser à la commande. Les
	// fichiers de ce projet de test passent un par un : la table n'existe que le temps de ce test,
	// et aucun autre fichier ne la voit.
	const TABLE = 'zz_suppression_essai';
	const ligne = new RegExp(`\\s1  ligne\\(s\\) de la table ${TABLE}\\n`, 'u');

	it('la montre sous son nom, et annule tout si sa ligne devait survivre', async () => {
		const org = await organisation('inconnue');
		await db.execute(sql`create table ${sql.identifier(TABLE)} ("organization_id" uuid not null)`);
		try {
			await db.execute(sql`insert into ${sql.identifier(TABLE)} values (${org.id})`);

			const apercu = commande('--slug', org.slug);
			expect(apercu.status, apercu.stderr).toBe(0);
			expect(apercu.stdout, 'l’aperçu ne cache aucune table').toMatch(ligne);

			// Sans clé étrangère, sa ligne resterait orpheline : le recompte la voit, et annule.
			const avant = await compter(org.id);
			const sansCle = commande('--slug', org.slug, '--confirmer', org.slug);
			expect(sansCle.status, 'annulée').toBe(1);
			expect(sansCle.stderr).toContain(`${TABLE} : 1`);
			expect(sansCle.stderr).toContain("Rien n'a été effacé");
			expect(sansCle.stdout).toBe('');
			expect(await compter(org.id), 'la transaction est annulée tout entière').toEqual(avant);

			// Avec une clé en cascade, elle part avec le reste, et le compte rendu le dit.
			await db.execute(sql`
				alter table ${sql.identifier(TABLE)} add foreign key ("organization_id")
					references "organization" ("id") on delete cascade
			`);
			const avecCle = commande('--slug', org.slug, '--confirmer', org.slug);
			expect(avecCle.stderr).toBe('');
			expect(avecCle.status).toBe(0);
			expect(avecCle.stdout, 'rien ne part sans être compté').toMatch(ligne);
			expect((await compter(org.id))[TABLE]).toBe(0);
		} finally {
			await db.execute(sql`drop table if exists ${sql.identifier(TABLE)}`);
		}
	});
});

describe('une écriture qui touche l’organisation pendant la suppression', () => {
	it('fait tout annuler, plutôt que d’effacer autre chose que ce qui a été compté', async () => {
		const org = await organisation('concurrente');
		const avant = await compter(org.id);

		// Une autre transaction modifie le cours et garde son verrou. La commande compte, puis bute
		// sur ce verrou en supprimant. L'autre transaction valide alors : ce que la commande a
		// compté n'est plus ce qu'elle effacerait.
		// La promesse sort de la transaction dans un objet : rendue telle quelle, elle serait attendue
		// avant la validation, et la commande attendrait un verrou qui ne serait jamais relâché.
		const { enCours } = await db.transaction(async (tx) => {
			await tx.execute(
				sql`update "course" set "updated_at" = now() where "organization_id" = ${org.id}`
			);
			const lancee = commandeEnFond('--slug', org.slug, '--confirmer', org.slug);
			let attend = 0;
			for (let essai = 0; attend === 0; essai += 1) {
				if (essai > 200) throw new Error('la commande n’a jamais attendu le verrou du cours');
				if (essai > 0) await new Promise((resolue) => setTimeout(resolue, 50));
				attend = await nombre(sql`
					select count(*)::text as n from pg_stat_activity
					where datname = current_database() and pid <> pg_backend_pid()
						and wait_event_type = 'Lock' and query like 'delete from "organization"%'
				`);
			}
			return { enCours: lancee };
		});
		const { status, stdout, stderr } = await enCours;

		expect(status, 'annulée').toBe(1);
		expect(stderr).toContain('pendant la suppression');
		expect(stderr).toContain("Rien n'a été effacé");
		expect(stdout).toBe('');
		expect(await compter(org.id), 'rien n’est parti').toEqual(avant);

		// Relancée, elle recompte et supprime.
		const relance = commande('--slug', org.slug, '--confirmer', org.slug);
		expect(relance.stderr).toBe('');
		expect(relance.status).toBe(0);
		expect((await compter(org.id))['organization']).toBe(0);
	});
});

describe('ce que la commande affiche', () => {
	it('ne contient aucun secret, ni l’adresse de personne', () => {
		expect(sorties.length, 'les tests précédents ont bien lancé la commande').toBeGreaterThan(10);
		const secrets = Object.entries(process.env)
			.filter(([nom, valeur]) => /PASSWORD|SECRET/.test(nom) && valeur && valeur.length >= 4)
			.map(([, valeur]) => valeur as string);
		expect(secrets.length, 'la base de test a bien des mots de passe à cacher').toBeGreaterThan(0);
		for (const sortie of sorties) {
			for (const secret of secrets) expect(sortie.includes(secret)).toBe(false);
			expect(sortie, 'aucune adresse électronique').not.toContain('@');
		}
	});
});

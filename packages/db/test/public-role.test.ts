// Le rôle du côté public (ADR 0026) : ce qu'il voit, et surtout ce qu'il ne peut pas voir.
//
// C'est ici que « un brouillon est invisible » devient une propriété de la base plutôt qu'une
// clause d'un `select` qu'on pourrait oublier en écrivant une route. Le rôle ne pose aucun contexte
// d'organisation — une page publique est désignée par son identifiant d'URL — donc tout repose sur
// deux conditions : l'organisation est active, et le cours est publié.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
	countIn,
	openDatabase,
	seedOrganisation,
	SQLSTATE,
	sqlStateOfFailure,
	withMaintenance,
	type Organisation
} from './helpers.js';

let ownerHandle: DatabaseHandle;
let publicHandle: DatabaseHandle;
let owner: Database;
let visiteur: Database;
let ouverte: Organisation;
let suspendue: Organisation;
let coursPublie: string;
let coursBrouillon: string;
let coursArchive: string;

/** Un cours de plus dans l'organisation, avec l'état voulu. */
async function ajouterCours(organisation: Organisation, status: string): Promise<string> {
	const id = newId();
	await withMaintenance(owner, (tx) =>
		tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
				"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "starts_on")
			values (${id}, ${organisation.id}, ${status}, 'open', array['fr'], 'fr', 'weekly',
				array[4]::smallint[], 1, '2026-09-03', 'fixed', '19:00', '20:00', '2026-09-03')
		`)
	);
	return id;
}

async function vuDuPublic(table: string, id: string): Promise<number> {
	return countIn(visiteur, table, sql.raw(`where "id" = '${id}'`));
}

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	publicHandle = openDatabase('public');
	owner = ownerHandle.db;
	visiteur = publicHandle.db;
	ouverte = await seedOrganisation(owner, 'publique-ouverte');
	suspendue = await seedOrganisation(owner, 'publique-suspendue');
	await withMaintenance(owner, (tx) =>
		tx.execute(sql`update "organization" set "status" = 'suspended' where "id" = ${suspendue.id}`)
	);
	coursPublie = await ajouterCours(ouverte, 'published');
	coursBrouillon = await ajouterCours(ouverte, 'draft');
	coursArchive = await ajouterCours(ouverte, 'archived');
});

afterAll(async () => {
	await publicHandle?.close();
	await ownerHandle?.close();
});

describe('ce que le visiteur voit', () => {
	it('reads an active organisation without posing any context at all', async () => {
		const slugs = allRows<{ slug: string }>(
			await visiteur.execute(sql`select "slug" from "organization"`)
		).map((row) => row.slug);
		expect(slugs).toContain(ouverte.slug);
	});

	it('reads a published course, its rooms, its translations and its exceptions', async () => {
		expect(await vuDuPublic('course', coursPublie)).toBe(1);
		for (const table of ['room', 'course_translation', 'session_exception', 'pause']) {
			expect(await countIn(visiteur, table), table).toBeGreaterThan(0);
		}
	});
});

describe('ce que le visiteur ne voit pas', () => {
	it('never sees a draft or an archived course', async () => {
		expect(await vuDuPublic('course', coursBrouillon)).toBe(0);
		expect(await vuDuPublic('course', coursArchive)).toBe(0);
	});

	it('never sees a suspended organisation, nor anything that belongs to it', async () => {
		// La condition tient en un seul endroit : la politique d'`organization`. Toutes les autres
		// passent par elle, donc suspendre retire l'organisation du public partout à la fois.
		expect(await vuDuPublic('organization', suspendue.id)).toBe(0);
		const salles = await countIn(
			visiteur,
			'room',
			sql.raw(`where "organization_id" = '${suspendue.id}'`)
		);
		const cours = await countIn(
			visiteur,
			'course',
			sql.raw(`where "organization_id" = '${suspendue.id}'`)
		);
		expect(salles).toBe(0);
		expect(cours).toBe(0);
	});

	it.each([
		'user',
		'membership',
		'invitation',
		'audit_log',
		'admin_access_log',
		'session',
		'account',
		'verification',
		'passkey',
		'prayer_settings'
	])('has no reach at all into %s', async (table) => {
		// Refus de droit, pas de politique : il tombe avant qu'une ligne soit examinée, et son
		// message ne dépend pas du contenu de la table.
		const state = await sqlStateOfFailure(() =>
			visiteur.execute(sql`select count(*) from ${sql.identifier(table)}`)
		);
		expect(state).toBe(SQLSTATE.insufficientPrivilege);
	});
});

describe('ce que le visiteur ne peut pas écrire', () => {
	it.each(['organization', 'course', 'room', 'course_translation', 'session_exception', 'pause'])(
		'cannot write to %s, which it can read',
		async (table) => {
			const state = await sqlStateOfFailure(() =>
				visiteur.execute(sql`delete from ${sql.identifier(table)}`)
			);
			expect(state).toBe(SQLSTATE.insufficientPrivilege);
		}
	);

	it('holds exactly one writable table, and it is the rate limit counter', async () => {
		// L'exception est assumée, et c'est un compteur : il ne porte aucune donnée d'organisation.
		// Sans lui, la limitation de débit publique n'aurait pas de compteur partagé entre les
		// instances. Depuis l'étape 7, sa clé est un condensat — plus aucune adresse en clair.
		//
		// Le compteur de vues était la seconde exception jusqu'à l'étape 8. Il n'en est plus une :
		// le rôle public l'incrémente par une fonction du propriétaire et n'a plus aucun droit sur
		// la table, pas même la lecture (ADR 0032).
		const ecritures = allRows<{ table_name: string }>(
			await owner.execute(sql`
				select distinct table_name from information_schema.role_table_grants
				where grantee = 'jadwal_public' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
				order by table_name
			`)
		).map((row) => row.table_name);
		expect(ecritures).toEqual(['rate_limit']);
	});

	it('is granted nothing beyond the tables its policies name', async () => {
		const lues = allRows<{ table_name: string }>(
			await owner.execute(sql`
				select distinct table_name from information_schema.role_table_grants
				where grantee = 'jadwal_public' order by table_name
			`)
		).map((row) => row.table_name);
		expect(lues).toEqual([
			'course',
			'course_translation',
			'organization',
			'pause',
			'prayer_day',
			'prayer_period',
			'rate_limit',
			'room',
			'session_exception'
		]);
	});
});

describe('le propriétaire et les journaux', () => {
	it('still cannot read the audit log, flag or no flag', async () => {
		// L'étape 3 le lui avait retiré (ADR 0020), et une boucle d'entretien de l'étape 4 le lui
		// avait rendu sans le vouloir : elle sautait les tables portant déjà un `_owner_select`,
		// donc elle repassait sur celles où on venait justement de l'enlever.
		expect(await countIn(owner, 'audit_log')).toBe(0);
		expect(await withMaintenance(owner, (tx) => countIn(tx, 'audit_log'))).toBe(0);
	});

	it('holds only a bounded delete on the audit log, and no read at all', async () => {
		// Le propriétaire ne peut pas attester lui-même : il ne lit pas le journal. C'est donc le
		// catalogue qui le dit, et `retention.test.ts` qui prouve que la purge ne prend que ce que
		// la fenêtre autorise.
		const politiques = allRows<{ polname: string; polcmd: string }>(
			await owner.execute(sql`
				select p.polname, p.polcmd from pg_policy p
				join pg_class c on c.oid = p.polrelid
				where c.relname = 'audit_log' and p.polname like '%owner%'
				order by p.polname
			`)
		);
		expect(politiques.map((row) => row.polname)).toEqual([
			'audit_log_owner_insert',
			'audit_log_owner_purge'
		]);
		// `d` : la seule suppression accordée au propriétaire est celle que borne la rétention.
		expect(politiques.find((row) => row.polname === 'audit_log_owner_purge')?.polcmd).toBe('d');
	});

	it('keeps the internal register readable to the owner, but not erasable at will', async () => {
		const politiques = allRows<{ polname: string }>(
			await owner.execute(sql`
				select p.polname from pg_policy p
				join pg_class c on c.oid = p.polrelid
				where c.relname = 'admin_access_log' and p.polname like '%owner%'
				order by p.polname
			`)
		).map((row) => row.polname);
		expect(politiques).toEqual([
			'admin_access_log_owner_insert',
			'admin_access_log_owner_purge',
			'admin_access_log_owner_select',
			'admin_access_log_owner_update'
		]);
	});
});

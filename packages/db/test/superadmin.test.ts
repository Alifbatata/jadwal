// Le rôle super-admin : ce qu'il peut, et le peu qu'il ne peut toujours pas.
//
// L'étape 4 a renversé la retenue de l'étape 3 : il lit et écrit dans toutes les organisations, à
// tout moment, sans rien ouvrir au préalable (ADR 0025). Deux choses n'ont pas bougé, et ce sont
// elles que ce fichier surveille surtout : le contexte d'organisation reste obligatoire, et le
// journal d'audit reste en insertion seule, pour lui comme pour les autres.
//
// Comme le rôle applicatif, il n'est ni superutilisateur ni porteur de BYPASSRLS : c'est vérifié
// dans `catalog.test.ts`, pour les quatre rôles.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, withOrg, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
	countIn,
	firstRow,
	messageOfFailure,
	openDatabase,
	seedOrganisation,
	SQLSTATE,
	sqlStateOfFailure,
	type Organisation
} from './helpers.js';

let ownerHandle: DatabaseHandle;
let superAdminHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let owner: Database;
let superAdmin: Database;
let app: Database;
let a: Organisation;
let b: Organisation;

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	superAdminHandle = openDatabase('superadmin');
	appHandle = openDatabase('app');
	owner = ownerHandle.db;
	superAdmin = superAdminHandle.db;
	app = appHandle.db;
	a = await seedOrganisation(owner, 'superadmin-a');
	b = await seedOrganisation(owner, 'superadmin-b');
});

afterAll(async () => {
	await appHandle?.close();
	await superAdminHandle?.close();
	await ownerHandle?.close();
});

const TABLES_ORGANISATION = [
	'course',
	'room',
	'course_translation',
	'session_exception',
	'pause',
	'prayer_day'
] as const;

describe('ce que le super-admin voit', () => {
	it('sees every organisation, with no organisation context at all', async () => {
		const slugs = allRows<{ slug: string }>(
			await superAdmin.execute(sql`select "slug" from "organization" order by "slug"`)
		).map((row) => row.slug);
		expect(slugs).toContain(a.slug);
		expect(slugs).toContain(b.slug);
	});

	it('reads the people, since it opens and closes their organisations', async () => {
		const count = firstRow<{ count: string }>(
			await superAdmin.execute(sql`select count(*)::text as count from "user"`)
		);
		expect(Number(count?.count)).toBeGreaterThanOrEqual(2);
	});

	it.each(TABLES_ORGANISATION)('reads %s of any organisation it enters', async (table) => {
		// Plus de fenêtre à ouvrir : entrer dans l'organisation suffit (ADR 0025).
		expect(await withOrg(superAdmin, a.id, (tx) => countIn(tx, table))).toBeGreaterThan(0);
		expect(await withOrg(superAdmin, b.id, (tx) => countIn(tx, table))).toBeGreaterThan(0);
	});

	it('reads the membership graph of the organisation it entered', async () => {
		expect(await withOrg(superAdmin, a.id, (tx) => countIn(tx, 'membership'))).toBeGreaterThan(0);
	});
});

describe('ce que le super-admin écrit', () => {
	it('creates a course in an organisation it is not a member of', async () => {
		const id = newId();
		await withOrg(superAdmin, a.id, (tx) =>
			tx.execute(sql`
				insert into "course" ("id", "organization_id", "audience", "teaching_language",
					"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
					"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "starts_on")
				values (${id}, ${a.id}, 'open', array['fr'], 'fr', 'weekly', array[2]::smallint[], 1,
					'2026-09-07', 'fixed', '19:00', '20:30', '2026-09-07')
			`)
		);
		const vu = await withOrg(superAdmin, a.id, (tx) =>
			countIn(tx, 'course', sql.raw(`where "id" = '${id}'`))
		);
		expect(vu).toBe(1);
	});

	it('signs its writes in the journal, and the organisation sees them', async () => {
		const target = newId();
		await withOrg(superAdmin, a.id, (tx) =>
			tx.execute(sql`
				insert into "audit_log" ("id", "organization_id", "actor_id", "action", "target_table",
					"target_id")
				values (${newId()}, ${a.id}, ${a.userId}, 'course.update', 'course', ${target})
			`)
		);
		// C'est le contrat de l'ADR 0025 : le contenu est tracé, la consultation ne l'est pas.
		const vu = await withOrg(app, a.id, (tx) =>
			countIn(tx, 'audit_log', sql.raw(`where "target_id" = '${target}'`))
		);
		expect(vu).toBe(1);
	});

	it('writes nothing outside the organisation it entered', async () => {
		// L'écriture porte l'identifiant de B, mais le contexte est celui de A : la politique
		// refuse. C'est le garde-fou qui empêche de modifier la mauvaise mosquée par inadvertance.
		const message = await messageOfFailure(() =>
			withOrg(superAdmin, a.id, (tx) =>
				tx.execute(sql`
					insert into "room" ("id", "organization_id", "name", "display_order")
					values (${newId()}, ${b.id}, 'salle volée', 0)
				`)
			)
		);
		expect(message).toContain('row-level security policy');
	});

	it.each(TABLES_ORGANISATION)(
		'sees nothing of %s without an organisation context',
		async (table) => {
			// Pas une erreur : rien. Le contexte reste la seule porte, même avec tous les droits.
			expect(await countIn(superAdmin, table)).toBe(0);
		}
	);
});

describe('ce que le super-admin ne peut toujours pas', () => {
	it('cannot change or remove an audit entry, any more than the application role', async () => {
		const update = await sqlStateOfFailure(() =>
			superAdmin.execute(sql`update "audit_log" set "action" = 'falsifié'`)
		);
		const remove = await sqlStateOfFailure(() => superAdmin.execute(sql`delete from "audit_log"`));
		expect(update).toBe(SQLSTATE.insufficientPrivilege);
		expect(remove).toBe(SQLSTATE.insufficientPrivilege);
	});

	it('cannot write a person either: accounts are not its business', async () => {
		const state = await sqlStateOfFailure(() =>
			superAdmin.execute(
				sql`insert into "user" ("id", "email") values (${newId()}, 'nouveau@example.test')`
			)
		);
		expect(state).toBe(SQLSTATE.insufficientPrivilege);
	});

	it('cannot touch a passkey: those belong to the sign-in role alone', async () => {
		const state = await sqlStateOfFailure(() =>
			superAdmin.execute(sql`select count(*) from "passkey"`)
		);
		expect(state).toBe(SQLSTATE.insufficientPrivilege);
	});
});

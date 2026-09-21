// Journal d'audit : insertion et lecture, jamais de modification ni de suppression (ADR 0015).

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, withOrg, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
	countVisible,
	openDatabase,
	joinOrganisation,
	seedOrganisation,
	SQLSTATE,
	sqlStateOfFailure,
	type Organisation,
	withMaintenance
} from './helpers.js';

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let owner: Database;
let app: Database;
let a: Organisation;
let b: Organisation;

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	owner = ownerHandle.db;
	app = appHandle.db;
	a = await seedOrganisation(owner, 'audit-a');
	b = await seedOrganisation(owner, 'audit-b');
});

afterAll(async () => {
	await appHandle?.close();
	await ownerHandle?.close();
});

describe('journal d’audit', () => {
	it('accepts an entry of its own organisation, with the state before and after', async () => {
		const id = newId();
		await withOrg(app, { organizationId: a.id, userId: a.userId }, async (tx) => {
			await tx.execute(sql`
				insert into "audit_log" ("id", "organization_id", "actor_id", "action", "target_table", "before", "after")
				values (${id}, ${a.id}, ${a.userId}, 'course.update', 'course',
					${JSON.stringify({ teacher: null })}::jsonb, ${JSON.stringify({ teacher: 'Imam' })}::jsonb)
			`);
		});
		const rows = await withOrg(app, a.id, async (tx) =>
			allRows<{ action: string; after: { teacher: string } }>(
				await tx.execute(sql`select action, after from "audit_log" where id = ${id}`)
			)
		);
		expect(rows).toEqual([{ action: 'course.update', after: { teacher: 'Imam' } }]);
	});

	it('refuses an entry carrying another organisation', async () => {
		const state = await sqlStateOfFailure(() =>
			withOrg(app, a.id, async (tx) => {
				await tx.execute(sql`
					insert into "audit_log" ("id", "organization_id", "action", "target_table")
					values (${newId()}, ${b.id}, 'vol', 'course')
				`);
			})
		);
		expect(state).toBe(SQLSTATE.insufficientPrivilege);
	});

	it('refuses an update and a delete, whatever the row targeted', async () => {
		for (const statement of [
			sql`update "audit_log" set action = 'falsifié'`,
			sql`update "audit_log" set action = 'falsifié' where organization_id = ${a.id}`,
			sql`delete from "audit_log"`,
			sql`delete from "audit_log" where organization_id = ${a.id}`,
			// Une ligne inexistante échoue de la même façon : le refus ne renseigne sur rien.
			sql`delete from "audit_log" where id = '00000000-0000-7000-8000-0000000000ff'`
		]) {
			const state = await sqlStateOfFailure(() =>
				withOrg(app, a.id, async (tx) => {
					await tx.execute(statement);
				})
			);
			expect(state).toBe(SQLSTATE.insufficientPrivilege);
		}
		// Rien n'a bougé.
		expect(await countVisible(app, a.id, 'audit_log')).toBe(2);
	});

	it('does not show the entries of another organisation', async () => {
		expect(await countVisible(app, b.id, 'audit_log')).toBe(1);
	});

	it('keeps the entry when its author is deleted', async () => {
		// L'auteur peut quitter le service ; la trace, elle, reste, avec un auteur devenu absent.
		const author = newId();
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "user" ("id", "email") values (${author}, ${`auteur-${b.slug}@example.test`})
			`)
		);
		await joinOrganisation(owner, app, b.id, author, `auteur-${b.slug}@example.test`);
		await withOrg(app, { organizationId: b.id, userId: author }, (tx) =>
			tx.execute(sql`
				insert into "audit_log" ("id", "organization_id", "actor_id", "action", "target_table")
				values (${newId()}, ${b.id}, ${author}, 'course.update', 'course')
			`)
		);
		await withMaintenance(owner, (tx) => tx.execute(sql`delete from "user" where id = ${author}`));
		const rows = await withOrg(app, b.id, async (tx) =>
			allRows<{ actor_id: string | null }>(
				await tx.execute(sql`select actor_id from "audit_log" where "action" = 'course.update'`)
			)
		);
		expect(rows).toEqual([{ actor_id: null }]);
	});

	it('refuses to delete the last person responsible for an organisation, even by cascade', async () => {
		// Supprimer un compte efface ses adhésions en cascade. Le déclencheur qui protège la
		// dernière personne responsable s'applique aussi à ce chemin : quelqu'un doit reprendre
		// l'organisation avant que son unique responsable puisse disparaître.
		const state = await sqlStateOfFailure(() =>
			withMaintenance(owner, (tx) => tx.execute(sql`delete from "user" where id = ${b.userId}`))
		);
		expect(state).toBe(SQLSTATE.restrictViolation);
	});
});

// Journal d'audit : insertion et lecture, jamais de modification ni de suppression (ADR 0015). Tout
// membre y écrit ; seule la personne responsable le lit (migration 0070, ADR 0046).

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, withOrg, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
	asAdmin,
	countVisible,
	messageOfFailure,
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
let superAdminHandle: DatabaseHandle;
let owner: Database;
let app: Database;
let superAdmin: Database;
let a: Organisation;
let b: Organisation;

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	superAdminHandle = openDatabase('superadmin');
	owner = ownerHandle.db;
	app = appHandle.db;
	superAdmin = superAdminHandle.db;
	a = await seedOrganisation(owner, 'audit-a');
	b = await seedOrganisation(owner, 'audit-b');
});

afterAll(async () => {
	await superAdminHandle?.close();
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
		const rows = await withOrg(app, asAdmin(a), async (tx) =>
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
		expect(await countVisible(app, asAdmin(a), 'audit_log')).toBe(2);
	});

	it('does not show the entries of another organisation', async () => {
		expect(await countVisible(app, asAdmin(b), 'audit_log')).toBe(1);
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
		const rows = await withOrg(app, asAdmin(b), async (tx) =>
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

/**
 * L'auteur d'une entrée est la personne du contexte, celle que l'application pose à partir de la
 * session (migration 0063, ADR 0046). Jusqu'à l'étape 19, la politique ne demandait qu'une personne
 * visible : une éditrice écrivait au journal une entrée qui nommait un collègue comme auteur.
 *
 * Tout se joue dans une organisation à part, C, pour ne rien changer aux comptes des cas précédents.
 */
describe('l’auteur d’une entrée est la personne connectée', () => {
	/** Une insertion refusée par une politique. */
	const NO_POLICY = /row-level security policy/;
	let c: Organisation;
	let editor: string;
	let colleague: string;
	let operator: string;

	beforeAll(async () => {
		c = await seedOrganisation(owner, 'audit-c');
		editor = newId();
		colleague = newId();
		operator = newId();
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "user" ("id", "email", "is_super_admin") values
					(${editor}, 'editrice-audit-c@example.test', false),
					(${colleague}, 'collegue-audit-c@example.test', false),
					(${operator}, 'exploitant-audit-c@example.test', true)
			`)
		);
		await joinOrganisation(owner, app, c.id, editor, 'editrice-audit-c@example.test');
		await joinOrganisation(owner, app, c.id, colleague, 'collegue-audit-c@example.test');
	});

	/** Une entrée du journal de C, signée de `actor`, sur la cible donnée. */
	const entry = (actor: string | null, target: string | null = null) => sql`
		insert into "audit_log" ("id", "organization_id", "actor_id", "action", "target_table", "target_id")
		values (${newId()}, ${c.id}, ${actor}, 'course.update', 'course', ${target})
	`;

	it('refuses an entry that names a colleague as its author', async () => {
		// L'éditrice nomme sa collègue, puis la personne responsable : toutes deux sont membres de C,
		// donc visibles, et la politique d'avant acceptait l'une et l'autre.
		for (const other of [colleague, c.userId]) {
			const message = await messageOfFailure(() =>
				withOrg(app, { organizationId: c.id, userId: editor }, (tx) => tx.execute(entry(other)))
			);
			expect(message, other).toMatch(NO_POLICY);
		}
		// La personne responsable n'écrit pas non plus au nom de l'éditrice.
		const message = await messageOfFailure(() =>
			withOrg(app, { organizationId: c.id, userId: c.userId }, (tx) => tx.execute(entry(editor)))
		);
		expect(message).toMatch(NO_POLICY);
	});

	it('refuses an entry without an author, or written without a person in the context', async () => {
		const attempts: [string, { organizationId: string; userId?: string }, string | null][] = [
			['sans auteur, la personne posée', { organizationId: c.id, userId: editor }, null],
			['sans personne ni auteur', { organizationId: c.id }, null],
			['sans personne, un auteur nommé', { organizationId: c.id }, editor]
		];
		for (const [label, context, actor] of attempts) {
			const message = await messageOfFailure(() =>
				withOrg(app, context, (tx) => tx.execute(entry(actor)))
			);
			expect(message, label).toMatch(NO_POLICY);
		}
	});

	it('accepts the entries of the application, each signed by the person connected', async () => {
		// Ce que fait `record` (apps/web/src/lib/server/audit.ts) : l'auteur est la personne du
		// contexte, que `withSessionOrg` pose à partir de la session.
		const target = newId();
		for (const person of [editor, colleague, c.userId]) {
			await withOrg(app, { organizationId: c.id, userId: person }, (tx) =>
				tx.execute(entry(person, target))
			);
		}
		// Le super-admin entré dans C signe de sa propre identité, comme l'écran le fait (ADR 0025).
		await withOrg(superAdmin, { organizationId: c.id, userId: operator }, (tx) =>
			tx.execute(entry(operator, target))
		);
		const authors = await withOrg(app, { organizationId: c.id, userId: c.userId }, async (tx) =>
			allRows<{ actor_id: string }>(
				await tx.execute(sql`
					select "actor_id" from "audit_log"
					where "organization_id" = ${c.id} and "target_id" = ${target}
				`)
			).map((row) => row.actor_id)
		);
		expect(authors.sort()).toEqual([editor, colleague, c.userId, operator].sort());
	});
});

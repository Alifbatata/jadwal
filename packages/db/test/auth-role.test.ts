// Le rôle de connexion : il crée et met à jour des comptes, et rien d'autre (ADR 0016).
//
// Il n'a aucun droit sur les données d'une organisation, et il ne peut faire de personne un
// super-admin — ni en créant un compte, ni en promouvant un compte existant. C'est le drapeau que
// l'application relit à chaque requête pour ouvrir l'administration.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, type Database, type DatabaseHandle } from '../src/index.js';
import { messageOfFailure, openDatabase, SQLSTATE, sqlStateOfFailure } from './helpers.js';

let authHandle: DatabaseHandle;
let auth: Database;

beforeAll(() => {
	authHandle = openDatabase('auth');
	auth = authHandle.db;
});

afterAll(async () => {
	await authHandle?.close();
});

/**
 * Crée un compte en nommant **toutes** les colonnes, comme le fait Drizzle : il les nomme même
 * quand il les laisse à leur valeur par défaut, et PostgreSQL exige le droit sur chacune d'elles.
 * Un test qui n'en nommerait que trois laisserait passer la panne de la migration 0029.
 */
function createAccount(id: string, email: string, superAdmin: 'default' | boolean = 'default') {
	const flag = superAdmin === 'default' ? sql`default` : sql`${superAdmin}`;
	return auth.execute(sql`
		insert into "user" ("id", "email", "name", "email_verified", "image", "is_super_admin",
			"created_at", "updated_at")
		values (${id}, ${email}, 'Sans nom', false, default, ${flag}, now(), now())
		returning "id", "email", "is_super_admin"
	`);
}

describe('ce que le rôle de connexion peut', () => {
	it('creates an account the way the adapter writes it, every column named', async () => {
		const id = newId();
		await createAccount(id, `${id}@example.test`);
		const rows = await auth.execute<{ is_super_admin: boolean }>(
			sql`select "is_super_admin" from "user" where "id" = ${id}`
		);
		const list = Array.isArray(rows) ? (rows as { is_super_admin: boolean }[]) : [];
		expect(list).toHaveLength(1);
		expect(list[0]?.is_super_admin).toBe(false);
	});

	it('marks an address verified, which is its whole job after a magic link', async () => {
		const id = newId();
		await createAccount(id, `${id}@example.test`);
		await auth.execute(
			sql`update "user" set "email_verified" = true, "updated_at" = now() where "id" = ${id}`
		);
		const rows = await auth.execute<{ email_verified: boolean }>(
			sql`select "email_verified" from "user" where "id" = ${id}`
		);
		const list = Array.isArray(rows) ? (rows as { email_verified: boolean }[]) : [];
		expect(list[0]?.email_verified).toBe(true);
	});
});

describe('ce que le rôle de connexion ne peut pas', () => {
	it('never creates a super-admin', async () => {
		// Le droit lui permet de nommer la colonne — Drizzle la nomme toujours — mais la politique
		// refuse la valeur. PostgreSQL rend le même code pour un refus de droit et pour un refus de
		// politique : le message est le seul moyen de dire lequel des deux a joué.
		const message = await messageOfFailure(() =>
			createAccount(newId(), `${newId()}@example.test`, true)
		);
		expect(message).toContain('row-level security policy');
		expect(message).toContain('"user"');
	});

	it('never promotes an existing account', async () => {
		const id = newId();
		await createAccount(id, `${id}@example.test`);
		// Refus de droit cette fois : la colonne ne lui est pas accordée en modification, donc la
		// tentative échoue avant que la moindre ligne soit examinée.
		const state = await sqlStateOfFailure(() =>
			auth.execute(sql`update "user" set "is_super_admin" = true where "id" = ${id}`)
		);
		expect(state).toBe(SQLSTATE.insufficientPrivilege);
	});

	it('never deletes an account', async () => {
		const id = newId();
		await createAccount(id, `${id}@example.test`);
		const state = await sqlStateOfFailure(() =>
			auth.execute(sql`delete from "user" where "id" = ${id}`)
		);
		expect(state).toBe(SQLSTATE.insufficientPrivilege);
	});

	it.each(['course', 'organization', 'membership', 'invitation', 'audit_log'])(
		'has no reach at all into %s',
		async (table) => {
			const state = await sqlStateOfFailure(() =>
				auth.execute(sql`select count(*) from ${sql.raw(`"${table}"`)}`)
			);
			expect(state).toBe(SQLSTATE.insufficientPrivilege);
		}
	);
});

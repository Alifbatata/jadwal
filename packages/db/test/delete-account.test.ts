// La suppression d'un compte par le super-admin (étape 25, ADR 0058 amendée).
//
// Le super-admin a tous les droits partout (décision du chef de projet, 27 et 28 novembre 2026),
// mais son rôle n'a aucun droit de suppression sur les comptes. `jadwal.delete_account(uuid)`, à
// droits du définisseur et exécutable par lui seul, supprime un compte et tout ce qui tombe avec lui
// (sessions, passkeys, adhésions), et rend ce qui s'est passé : `deleted`, `gone` (aucun compte),
// `super_admin` (un compte de l'exploitant ne se supprime pas d'un écran) ou `last_org_admin` (le
// compte est la dernière personne responsable d'une organisation : rien n'est supprimé).

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
	firstRow,
	openDatabase,
	seedOrganisation,
	SQLSTATE,
	sqlStateOfFailure,
	withMaintenance,
	type Organisation
} from './helpers.js';

let ownerHandle: DatabaseHandle;
let superHandle: DatabaseHandle;
let owner: Database;
let superadmin: Database;
let org: Organisation;

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	superHandle = openDatabase('superadmin');
	owner = ownerHandle.db;
	superadmin = superHandle.db;
	org = await seedOrganisation(owner, `suppression-${newId().slice(-6)}`);
});

afterAll(async () => {
	await superHandle?.close();
	await ownerHandle?.close();
});

async function deleteAccount(
	userId: string,
	db: Database = superadmin
): Promise<string | undefined> {
	return firstRow<{ outcome: string }>(
		await db.execute(sql`select jadwal.delete_account(${userId}) as "outcome"`)
	)?.outcome;
}

/** Un compte, éditeur de l'organisation si demandé, avec une session et la signature d'un cours. */
async function account(options: { editor?: boolean; admin?: boolean; superAdmin?: boolean } = {}) {
	const id = newId();
	await withMaintenance(owner, async (tx) => {
		await tx.execute(sql`
			insert into "user" ("id", "email", "is_super_admin")
			values (${id}, ${`compte-${id}@example.test`}, ${options.superAdmin ?? false})
		`);
		await tx.execute(sql`
			insert into "session" ("id", "token", "user_id", "expires_at")
			values (${newId()}, ${`jeton-${id}`}, ${id}, now() + interval '1 day')
		`);
		if (options.editor || options.admin) {
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${org.id}, ${id}, ${options.admin ? 'org_admin' : 'editor'})
			`);
			await tx.execute(sql`
				update "course" set "updated_by" = ${id} where "organization_id" = ${org.id}
			`);
		}
	});
	return id;
}

async function count(table: 'user' | 'session' | 'membership', userId: string): Promise<number> {
	const column = table === 'user' ? sql.raw('"id"') : sql.raw('"user_id"');
	return Number(
		firstRow<{ n: number }>(
			await withMaintenance(owner, (tx) =>
				tx.execute(
					sql`select count(*)::int as "n" from ${sql.identifier(table)} where ${column} = ${userId}`
				)
			)
		)?.n ?? 0
	);
}

describe('jadwal.delete_account', () => {
	it('deletes an account with its sessions and memberships, and keeps what it signed', async () => {
		const id = await account({ editor: true });
		expect(await count('membership', id)).toBe(1);
		expect(await deleteAccount(id)).toBe('deleted');
		expect(await count('user', id)).toBe(0);
		expect(await count('session', id)).toBe(0);
		expect(await count('membership', id)).toBe(0);
		// Le cours qu'il avait modifié en dernier reste, sans son nom.
		const courses = allRows<{ updated_by: string | null }>(
			await withMaintenance(owner, (tx) =>
				tx.execute(sql`select "updated_by" from "course" where "organization_id" = ${org.id}`)
			)
		);
		expect(courses.length).toBeGreaterThan(0);
		expect(courses.every((row) => row.updated_by === null)).toBe(true);
	});

	it('deletes an account that belongs to nothing', async () => {
		const id = await account();
		expect(await deleteAccount(id)).toBe('deleted');
		expect(await count('user', id)).toBe(0);
	});

	it('deletes a manager when another one remains', async () => {
		const id = await account({ admin: true });
		expect(await deleteAccount(id)).toBe('deleted');
		expect(await count('user', id)).toBe(0);
	});

	it('refuses the last manager of an organisation, and deletes nothing', async () => {
		// La personne responsable de l'organisation d'essai est seule à l'être.
		expect(await deleteAccount(org.userId)).toBe('last_org_admin');
		expect(await count('user', org.userId)).toBe(1);
		expect(await count('membership', org.userId)).toBe(1);
	});

	it('refuses an account of the operator', async () => {
		const id = await account({ superAdmin: true });
		expect(await deleteAccount(id)).toBe('super_admin');
		expect(await count('user', id)).toBe(1);
	});

	it('says an unknown account is gone', async () => {
		expect(await deleteAccount(newId())).toBe('gone');
	});

	it('leaves the maintenance flag as it found it', async () => {
		const id = await account();
		const flag = await superadmin.transaction(async (tx) => {
			await tx.execute(sql`select jadwal.delete_account(${id})`);
			return firstRow<{ flag: string | null }>(
				await tx.execute(sql`select current_setting('jadwal.maintenance', true) as "flag"`)
			)?.flag;
		});
		expect(flag ?? '').toBe('');
	});

	it('is a definer function with its search path pinned, that only the super-admin role can call', async () => {
		const fonction = firstRow<{ definer: boolean; config: string[] | null }>(
			await owner.execute(sql`
				select p.prosecdef as definer, p.proconfig as config
				from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				where n.nspname = 'jadwal' and p.proname = 'delete_account'
			`)
		);
		expect(fonction?.definer).toBe(true);
		expect(fonction?.config).toEqual(['search_path=public, pg_temp']);
		const appelants = allRows<{ role: string }>(
			await owner.execute(sql`
				select r.rolname as role from pg_roles r
				where r.rolname in ('jadwal_app', 'jadwal_superadmin', 'jadwal_auth', 'jadwal_public')
					and has_function_privilege(r.oid, 'jadwal.delete_account(uuid)', 'EXECUTE')
				order by 1
			`)
		);
		expect(appelants.map((row) => row.role)).toEqual(['jadwal_superadmin']);
		const id = await account();
		for (const role of ['app', 'auth', 'public'] as const) {
			const handle = openDatabase(role);
			try {
				expect(await sqlStateOfFailure(() => deleteAccount(id, handle.db)), role).toBe(
					SQLSTATE.insufficientPrivilege
				);
			} finally {
				await handle.close();
			}
		}
		expect(await count('user', id)).toBe(1);
	});
});

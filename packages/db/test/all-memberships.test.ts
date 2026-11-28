// La vue du super-admin sur les comptes de toutes les organisations (étape 25, ADR 0058).
//
// Le super-admin lit tous les comptes et toutes les organisations, mais les adhésions de la seule
// organisation où il est entré (migration 0033) : l'écran Membres, s'il oubliait un jour son filtre,
// ne montrerait jamais les membres d'une autre. `jadwal.all_memberships()` rend, pour l'écran des
// comptes seul, qui appartient à quelle organisation, avec quel rôle et quelle autorisation de
// diffuser, et rien d'autre ; seul le rôle du super-admin peut l'appeler.
//
// Le propriétaire ne sert qu'à poser le décor. Tout ce qui est éprouvé passe par le rôle du
// super-admin, non privilégié.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, setOrgContext, type Database, type DatabaseHandle } from '../src/index.js';
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
let first: Organisation;
let second: Organisation;
let editorId: string;

interface Row {
	user_id: string;
	organization_id: string;
	role: string;
	can_broadcast: boolean;
}

async function memberships(db: Database = superadmin): Promise<Row[]> {
	return allRows<Row>(
		await db.execute(sql`
			select "user_id", "organization_id", "role", "can_broadcast" from jadwal.all_memberships()
		`)
	);
}

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	superHandle = openDatabase('superadmin');
	owner = ownerHandle.db;
	superadmin = superHandle.db;
	first = await seedOrganisation(owner, `comptes-a-${newId().slice(-6)}`);
	second = await seedOrganisation(owner, `comptes-b-${newId().slice(-6)}`);
	// Un éditeur de la seconde, qui a l'autorisation de diffuser.
	editorId = newId();
	await withMaintenance(owner, async (tx) => {
		await tx.execute(sql`
			insert into "user" ("id", "email") values (${editorId}, ${`editeur-${editorId}@example.test`})
		`);
		await tx.execute(sql`
			insert into "membership" ("id", "organization_id", "user_id", "role", "can_broadcast")
			values (${newId()}, ${second.id}, ${editorId}, 'editor', true)
		`);
	});
});

afterAll(async () => {
	await superHandle?.close();
	await ownerHandle?.close();
});

describe('jadwal.all_memberships', () => {
	it('gives the super-admin the memberships of every organisation, outside any of them', async () => {
		const rows = await memberships();
		expect(rows).toContainEqual({
			user_id: first.userId,
			organization_id: first.id,
			role: 'org_admin',
			can_broadcast: false
		});
		expect(rows).toContainEqual({
			user_id: second.userId,
			organization_id: second.id,
			role: 'org_admin',
			can_broadcast: false
		});
		expect(rows).toContainEqual({
			user_id: editorId,
			organization_id: second.id,
			role: 'editor',
			can_broadcast: true
		});
	});

	it('gives the same list from inside an organisation, while his own reading stays bounded', async () => {
		const seen = await superadmin.transaction(async (tx) => {
			await setOrgContext(tx, { organizationId: first.id, userId: first.userId });
			const direct = allRows<{ organization_id: string }>(
				await tx.execute(sql`select "organization_id" from "membership"`)
			);
			const listed = allRows<{ organization_id: string }>(
				await tx.execute(sql`select "organization_id" from jadwal.all_memberships()`)
			);
			return { direct, listed };
		});
		// La politique, elle, ne bouge pas : une seule organisation à la fois.
		expect(new Set(seen.direct.map((row) => row.organization_id))).toEqual(new Set([first.id]));
		expect(seen.listed.map((row) => row.organization_id)).toContain(second.id);
	});

	it('returns four columns, and nothing else of a membership', async () => {
		const fonction = firstRow<{ definer: boolean; config: string[] | null; returns: string }>(
			await owner.execute(sql`
				select p.prosecdef as definer, p.proconfig as config,
					pg_get_function_result(p.oid) as returns
				from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				where n.nspname = 'jadwal' and p.proname = 'all_memberships'
			`)
		);
		expect(fonction?.definer).toBe(true);
		expect(fonction?.config).toEqual(['search_path=public, pg_temp']);
		expect(fonction?.returns).toBe(
			'TABLE(user_id uuid, organization_id uuid, role text, can_broadcast boolean)'
		);
	});

	it('leaves the maintenance flag as it found it', async () => {
		const flag = await superadmin.transaction(async (tx) => {
			await tx.execute(sql`select count(*) from jadwal.all_memberships()`);
			return firstRow<{ flag: string | null }>(
				await tx.execute(sql`select current_setting('jadwal.maintenance', true) as "flag"`)
			)?.flag;
		});
		expect(flag ?? '').toBe('');
	});

	it('can be called by the super-admin role only', async () => {
		const appelants = allRows<{ role: string }>(
			await owner.execute(sql`
				select r.rolname as role from pg_roles r
				where r.rolname in ('jadwal_app', 'jadwal_superadmin', 'jadwal_auth', 'jadwal_public')
					and has_function_privilege(r.oid, 'jadwal.all_memberships()', 'EXECUTE')
				order by 1
			`)
		);
		expect(appelants.map((row) => row.role)).toEqual(['jadwal_superadmin']);
		for (const role of ['app', 'auth', 'public'] as const) {
			const handle = openDatabase(role);
			try {
				expect(await sqlStateOfFailure(() => memberships(handle.db)), role).toBe(
					SQLSTATE.insufficientPrivilege
				);
			} finally {
				await handle.close();
			}
		}
	});
});

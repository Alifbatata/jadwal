// La porte de la connexion : un lien ne part qu'à une adresse attendue (étape 22, ADR 0049).
//
// Une adresse est attendue quand un compte la porte, ou quand une invitation en attente, et non
// échue, l'attend. Toute autre adresse reçoit un autre courriel, qui l'invite à demander l'accès :
// le compte ne s'ouvre plus à qui le demande. `jadwal.may_sign_in` répond oui ou non, et rien
// d'autre ; seul le rôle de connexion peut l'appeler, puisque c'est lui qui envoie les liens.
//
// Le propriétaire ne sert qu'à poser le décor. Tout ce qui est éprouvé passe par le rôle de
// connexion, non privilégié.

import { sql, type SQL } from 'drizzle-orm';
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
let authHandle: DatabaseHandle;
let owner: Database;
let auth: Database;
let org: Organisation;

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	authHandle = openDatabase('auth');
	owner = ownerHandle.db;
	auth = authHandle.db;
	org = await seedOrganisation(owner, 'porte');
});

afterAll(async () => {
	await authHandle?.close();
	await ownerHandle?.close();
});

function address(): string {
	return `porte-${newId()}@example.test`;
}

async function account(email: string): Promise<void> {
	await withMaintenance(owner, (tx) =>
		tx.execute(sql`insert into "user" ("id", "email") values (${newId()}, ${email})`)
	);
}

/** Une invitation posée par le propriétaire. En attente et valable une semaine par défaut. */
async function invitation(
	email: string,
	options: { status?: string; createdAt?: SQL; expiresAt?: SQL } = {}
): Promise<void> {
	await withMaintenance(owner, (tx) =>
		tx.execute(sql`
			insert into "invitation" ("id", "organization_id", "email", "role", "status",
				"created_at", "expires_at")
			values (${newId()}, ${org.id}, ${email}, 'editor', ${options.status ?? 'pending'},
				${options.createdAt ?? sql`now()`},
				${options.expiresAt ?? sql`now() + interval '7 days'`})
		`)
	);
}

async function maySignIn(email: string, db: Database = auth): Promise<boolean | undefined> {
	return firstRow<{ allowed: boolean }>(
		await db.execute(sql`select jadwal.may_sign_in(${email}) as "allowed"`)
	)?.allowed;
}

describe('jadwal.may_sign_in', () => {
	it('refuses an address that nobody expects', async () => {
		expect(await maySignIn(address())).toBe(false);
	});

	it('lets an address with an account in, whatever its case and its spaces', async () => {
		const email = address();
		await account(email);
		expect(await maySignIn(email)).toBe(true);
		expect(await maySignIn(email.toUpperCase())).toBe(true);
		expect(await maySignIn(`  ${email} `)).toBe(true);
	});

	it('lets an address with a pending invitation in, before it has an account', async () => {
		const email = address();
		await invitation(email.toUpperCase());
		expect(await maySignIn(email)).toBe(true);
	});

	it('refuses an address whose only invitation has expired, been cancelled or been used', async () => {
		const expired = address();
		await invitation(expired, {
			createdAt: sql`now() - interval '15 days'`,
			expiresAt: sql`now() - interval '1 day'`
		});
		expect(await maySignIn(expired)).toBe(false);
		for (const status of ['cancelled', 'joined']) {
			const email = address();
			await invitation(email, { status });
			expect(await maySignIn(email), status).toBe(false);
		}
	});

	it('refuses an empty address and a missing one', async () => {
		expect(await maySignIn('')).toBe(false);
		const row = firstRow<{ allowed: boolean | null }>(
			await auth.execute(sql`select jadwal.may_sign_in(null) as "allowed"`)
		);
		expect(row?.allowed).toBe(false);
	});

	it('leaves the maintenance flag as it found it', async () => {
		const flag = await auth.transaction(async (tx) => {
			await tx.execute(sql`select jadwal.may_sign_in(${address()})`);
			return firstRow<{ flag: string | null }>(
				await tx.execute(sql`select current_setting('jadwal.maintenance', true) as "flag"`)
			)?.flag;
		});
		expect(flag ?? '').toBe('');
	});

	it('is a definer function with its search path pinned, that only the sign-in role can call', async () => {
		const fonction = firstRow<{ definer: boolean; config: string[] | null; returns: string }>(
			await owner.execute(sql`
				select p.prosecdef as definer, p.proconfig as config,
					pg_get_function_result(p.oid) as returns
				from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				where n.nspname = 'jadwal' and p.proname = 'may_sign_in'
			`)
		);
		expect(fonction?.definer).toBe(true);
		expect(fonction?.config).toEqual(['search_path=public, pg_temp']);
		expect(fonction?.returns).toBe('boolean');
		const appelants = allRows<{ role: string }>(
			await owner.execute(sql`
				select r.rolname as role from pg_roles r
				where r.rolname in ('jadwal_app', 'jadwal_superadmin', 'jadwal_auth', 'jadwal_public')
					and has_function_privilege(r.oid, 'jadwal.may_sign_in(text)', 'EXECUTE')
				order by 1
			`)
		);
		expect(appelants.map((row) => row.role)).toEqual(['jadwal_auth']);
		for (const role of ['app', 'superadmin', 'public'] as const) {
			const handle = openDatabase(role);
			try {
				expect(await sqlStateOfFailure(() => maySignIn(address(), handle.db)), role).toBe(
					SQLSTATE.insufficientPrivilege
				);
			} finally {
				await handle.close();
			}
		}
	});
});

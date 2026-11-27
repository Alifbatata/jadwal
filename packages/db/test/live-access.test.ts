// Le direct, du côté de la base (étape 25, ADR 0056 amendée) : qui a le droit de diffuser, et vers
// quelles langues.
//
// L'autorisation de diffuser est portée par l'adhésion (`membership.can_broadcast`). La personne
// responsable la donne, et le super-admin entré dans l'organisation ; un éditeur ne se la donne pas,
// et un invité qui crée sa propre adhésion en entrant ne se la donne pas non plus. Les langues du
// direct sont celles de l'organisation (`organization.live_language`), parmi les sept que le direct
// sait servir.
//
// Tout passe par les rôles de connexion, non privilégiés. Le propriétaire ne sert qu'à poser le
// décor et à relever ce qui est réellement en base, sous son drapeau d'entretien (ADR 0019).

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, withOrg, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
	asAdmin,
	firstRow,
	joinOrganisation,
	messageOfFailure,
	openDatabase,
	seedOrganisation,
	sqlStateOfFailure,
	SQLSTATE,
	withMaintenance,
	type Organisation
} from './helpers.js';

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let superAdminHandle: DatabaseHandle;
let owner: Database;
let app: Database;
let superAdmin: Database;
let a: Organisation;
let b: Organisation;
/** Un éditeur de A, sans l'autorisation au départ. */
let editor: string;
/** Un second éditeur de A, qui tente de se la donner lui-même. */
let other: string;

async function newAccount(label: string): Promise<{ id: string; email: string }> {
	const id = newId();
	const email = `${label}@example.test`;
	await withMaintenance(owner, (tx) =>
		tx.execute(sql`insert into "user" ("id", "email") values (${id}, ${email})`)
	);
	return { id, email };
}

/** L'autorisation d'un compte dans une organisation, relevée par le propriétaire. */
async function canBroadcast(organizationId: string, userId: string): Promise<boolean | undefined> {
	return firstRow<{ can_broadcast: boolean }>(
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				select "can_broadcast" from "membership"
				where "organization_id" = ${organizationId} and "user_id" = ${userId}
			`)
		)
	)?.can_broadcast;
}

/** L'écriture de l'écran Membres, mot pour mot : l'autorisation et sa date, par le compte. */
const grant = (userId: string, value: boolean) =>
	sql`update "membership" set "can_broadcast" = ${value}, "updated_at" = now()
		where "organization_id" = ${a.id} and "user_id" = ${userId} returning "can_broadcast"`;

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	superAdminHandle = openDatabase('superadmin');
	owner = ownerHandle.db;
	app = appHandle.db;
	superAdmin = superAdminHandle.db;
	a = await seedOrganisation(owner, 'diffusion-a');
	b = await seedOrganisation(owner, 'diffusion-b');
	const first = await newAccount('editeur-diffusion-a');
	await joinOrganisation(owner, app, a.id, first.id, first.email);
	editor = first.id;
	const second = await newAccount('autre-editeur-diffusion-a');
	await joinOrganisation(owner, app, a.id, second.id, second.email);
	other = second.id;
});

afterAll(async () => {
	await superAdminHandle?.close();
	await appHandle?.close();
	await ownerHandle?.close();
});

describe('l’autorisation de diffuser', () => {
	it('is false for a new member, and for the founder', async () => {
		expect(await canBroadcast(a.id, editor)).toBe(false);
		// La personne responsable diffuse d'office : la colonne ne sert pas pour elle, et reste fausse.
		expect(await canBroadcast(a.id, a.userId)).toBe(false);
	});

	it('is given and taken back by the responsible person', async () => {
		expect(
			allRows(await withOrg(app, asAdmin(a), (tx) => tx.execute(grant(editor, true))))
		).toEqual([{ can_broadcast: true }]);
		expect(await canBroadcast(a.id, editor)).toBe(true);
		await withOrg(app, asAdmin(a), (tx) => tx.execute(grant(editor, false)));
		expect(await canBroadcast(a.id, editor)).toBe(false);
	});

	it('is given by the super-admin entered in the organisation', async () => {
		expect(
			allRows(await withOrg(superAdmin, a.id, (tx) => tx.execute(grant(editor, true))))
		).toEqual([{ can_broadcast: true }]);
		expect(await canBroadcast(a.id, editor)).toBe(true);
		await withOrg(superAdmin, a.id, (tx) => tx.execute(grant(editor, false)));
	});

	it('is never given by an editor, to herself or to a colleague', async () => {
		for (const target of [other, editor]) {
			const touched = allRows(
				await withOrg(app, { organizationId: a.id, userId: other }, (tx) =>
					tx.execute(grant(target, true))
				)
			);
			// La politique ne lui laisse aucune ligne : rien n'est touché, rien n'est dit.
			expect(touched, target).toEqual([]);
			expect(await canBroadcast(a.id, target), target).toBe(false);
		}
	});

	it('is never given from another organisation', async () => {
		const touched = allRows(
			await withOrg(app, asAdmin(b), (tx) => tx.execute(grant(editor, true)))
		);
		expect(touched).toEqual([]);
		expect(await canBroadcast(a.id, editor)).toBe(false);
	});

	it('is not taken by an invitee who writes her own membership', async () => {
		const invitee = await newAccount('invitee-diffusion-a');
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "invitation" ("id", "organization_id", "email", "role", "expires_at")
				values (${newId()}, ${a.id}, ${invitee.email}, 'editor', now() + make_interval(hours => 24))
			`)
		);
		// Le chemin réel de l'entrée, celui de `joinOrganisation`, la case cochée en plus.
		const enter = (value: boolean) =>
			app.transaction(async (tx) => {
				await tx.execute(sql`select set_config('jadwal.org_id', '', true)`);
				await tx.execute(sql`select set_config('jadwal.user_id', ${invitee.id}, true)`);
				await tx.execute(sql`
					update "invitation" set "status" = 'accepted', "accepted_by" = ${invitee.id},
						"resolved_at" = now()
					where "organization_id" = ${a.id} and "email" = ${invitee.email}
						and "status" in ('pending', 'accepted')
				`);
				await tx.execute(sql`select set_config('jadwal.org_id', ${a.id}, true)`);
				await tx.execute(sql`
					insert into "membership" ("id", "organization_id", "user_id", "role", "can_broadcast")
					values (${newId()}, ${a.id}, ${invitee.id}, 'editor', ${value})
				`);
			});
		const refused = await messageOfFailure(() => enter(true));
		expect(refused).toMatch(/row-level security/);
		expect(await canBroadcast(a.id, invitee.id)).toBeUndefined();
		// La même entrée, sans la case : elle passe. Le refus venait bien de la case.
		await enter(false);
		expect(await canBroadcast(a.id, invitee.id)).toBe(false);
	});

	it('is a column the application role may write, with the role and its date', async () => {
		const columns = allRows<{ name: string }>(
			await owner.execute(sql`
				select attname as name from pg_attribute
				where attrelid = 'public.membership'::regclass and attnum > 0 and not attisdropped
					and has_column_privilege('jadwal_app', 'public.membership', attname, 'UPDATE')
				order by attname
			`)
		).map((row) => row.name);
		expect(columns).toEqual(['can_broadcast', 'role', 'updated_at']);
	});
});

describe('les langues du direct', () => {
	const write = (value: ReturnType<typeof sql>) =>
		withOrg(app, asAdmin(a), (tx) =>
			tx.execute(sql`update "organization" set "live_language" = ${value}, "updated_at" = now()
				where "id" = ${a.id}`)
		);
	const stored = async (id: string) =>
		firstRow<{ live_language: string[] }>(
			await withMaintenance(owner, (tx) =>
				tx.execute(sql`select "live_language" from "organization" where "id" = ${id}`)
			)
		)?.live_language;

	it('are the seven languages of the live by default', async () => {
		expect(await stored(b.id)).toEqual(['fr', 'de', 'it', 'en', 'sq', 'bs', 'tr']);
	});

	it('are chosen by the responsible person', async () => {
		await write(sql`array['tr', 'sq']::text[]`);
		expect(await stored(a.id)).toEqual(['tr', 'sq']);
		// L'autre organisation n'en est pas changée.
		expect(await stored(b.id)).toEqual(['fr', 'de', 'it', 'en', 'sq', 'bs', 'tr']);
	});

	it('refuse an empty list, a missing value, and a language the live cannot serve', async () => {
		for (const value of [
			sql`array[]::text[]`,
			sql`array['fr', null]::text[]`,
			sql`array['ar']::text[]`,
			sql`array['fr', 'es']::text[]`,
			sql`null`
		]) {
			expect(await sqlStateOfFailure(() => write(value))).toMatch(
				new RegExp(`^(${SQLSTATE.checkViolation}|23502)$`)
			);
		}
		expect(await stored(a.id)).toEqual(['tr', 'sq']);
	});

	it('are written by an editor nowhere', async () => {
		const touched = allRows(
			await withOrg(app, { organizationId: a.id, userId: editor }, (tx) =>
				tx.execute(sql`update "organization" set "live_language" = array['fr']::text[]
					where "id" = ${a.id} returning "id"`)
			)
		);
		expect(touched).toEqual([]);
		expect(await stored(a.id)).toEqual(['tr', 'sq']);
	});
});

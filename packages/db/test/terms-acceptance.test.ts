// L'acceptation des conditions d'utilisation, du côté de la base.
//
// Une ligne par personne, par organisation et par version, jamais modifiée, et qui part avec
// l'adhésion. Le moment est posé par la base, par le procédé du journal d'audit (ADR 0020) : le
// droit d'insertion est accordé colonne par colonne, sans `accepted_at`, qui garde son défaut
// serveur. Une valeur fournie par l'application n'est donc pas ignorée, elle est **refusée**.
//
// Tout passe par les rôles de connexion, non privilégiés. Le propriétaire ne sert qu'à poser le
// décor et à relever ce qui est réellement en base, sous son drapeau d'entretien (ADR 0019).

import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, withOrg, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
	firstRow,
	joinOrganisation,
	messageOfFailure,
	openDatabase,
	seedOrganisation,
	SQLSTATE,
	sqlStateOfFailure,
	withMaintenance,
	type Organisation
} from './helpers.js';

/** La version du document : sa date de « Dernière mise à jour », en ISO. */
const VERSION = '2026-09-22';
/** Colonne obligatoire laissée vide. */
const NOT_NULL_VIOLATION = '23502';
/** Le refus d'un droit absent, par opposition au refus d'une politique : même code, autre message. */
const NO_RIGHT = /permission denied for table terms_acceptance/;
const NO_POLICY = /row-level security policy/;

/** Le contexte que l'application pose : l'organisation et la personne connectée, toujours les deux. */
interface Context {
	organizationId: string;
	userId: string;
}

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let superAdminHandle: DatabaseHandle;
let publicHandle: DatabaseHandle;
let authHandle: DatabaseHandle;
let owner: Database;
let app: Database;
let superAdmin: Database;
let a: Organisation;
let b: Organisation;
/** Une seconde personne de A, éditrice : même organisation, autre personne. */
let colleague: string;

/**
 * L'insertion telle que l'application l'écrit : les quatre colonnes accordées, rien d'autre. La
 * ligne reprend l'organisation et la personne du contexte, sauf quand un test veut justement s'en
 * écarter.
 */
function accept(
	context: Context,
	version: string,
	row: { organizationId?: string; userId?: string } = {}
) {
	return withOrg(app, context, (tx) =>
		tx.execute(sql`
			insert into "terms_acceptance" ("id", "organization_id", "user_id", "version")
			values (${newId()}, ${row.organizationId ?? context.organizationId},
				${row.userId ?? context.userId}, ${version})
		`)
	);
}

/** Ce qui est réellement en base, relevé par le propriétaire sous son drapeau d'entretien. */
async function stored(where: SQL): Promise<number> {
	const rows = await withMaintenance(owner, (tx) =>
		tx.execute(sql`select count(*)::text as count from "terms_acceptance" where ${where}`)
	);
	return Number(firstRow<{ count: string }>(rows)?.count ?? '0');
}

/** Crée un compte et le fait entrer dans une organisation par le chemin réel de l'invitation. */
async function newMember(organizationId: string, label: string): Promise<string> {
	const userId = newId();
	const email = `${label}@example.test`;
	await withMaintenance(owner, (tx) =>
		tx.execute(sql`insert into "user" ("id", "email") values (${userId}, ${email})`)
	);
	await joinOrganisation(owner, app, organizationId, userId, email);
	return userId;
}

/** La personne donnée, dans le contexte de A. */
const inA = (userId: string): Context => ({ organizationId: a.id, userId });

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	superAdminHandle = openDatabase('superadmin');
	publicHandle = openDatabase('public');
	authHandle = openDatabase('auth');
	owner = ownerHandle.db;
	app = appHandle.db;
	superAdmin = superAdminHandle.db;
	a = await seedOrganisation(owner, 'conditions-a');
	b = await seedOrganisation(owner, 'conditions-b');
	colleague = await newMember(a.id, 'collegue-conditions-a');
});

afterAll(async () => {
	await authHandle?.close();
	await publicHandle?.close();
	await superAdminHandle?.close();
	await appHandle?.close();
	await ownerHandle?.close();
});

describe('acceptation des conditions : chacun la sienne, dans son organisation', () => {
	it('lets a person record her own acceptance in her organisation, and read it back', async () => {
		const returned = await withOrg(app, inA(a.userId), (tx) =>
			tx.execute(sql`
				insert into "terms_acceptance" ("id", "organization_id", "user_id", "version")
				values (${newId()}, ${a.id}, ${a.userId}, ${VERSION})
				returning "version"
			`)
		);
		expect(allRows(returned)).toEqual([{ version: VERSION }]);

		const read = await withOrg(app, inA(a.userId), (tx) =>
			tx.execute(sql`
				select "organization_id", "user_id", "version" from "terms_acceptance"
				where "version" = ${VERSION}
			`)
		);
		expect(allRows(read)).toEqual([{ organization_id: a.id, user_id: a.userId, version: VERSION }]);

		// La question que la porte de l'espace posera, écrite comme elle l'écrira. Les trois égalités
		// répètent ce que la politique impose déjà, et désignent l'index d'unicité tout entier.
		const hasAccepted = async (context: Context, version: string) =>
			firstRow<{ accepted: boolean }>(
				await withOrg(app, context, (tx) =>
					tx.execute(sql`
						select exists (
							select 1 from "terms_acceptance"
							where "organization_id" = ${context.organizationId}
								and "user_id" = ${context.userId} and "version" = ${version}
						) as accepted
					`)
				)
			)?.accepted;
		expect(await hasAccepted(inA(a.userId), VERSION)).toBe(true);
		expect(await hasAccepted(inA(a.userId), '2027-01-01')).toBe(false);
		expect(await hasAccepted(inA(colleague), VERSION)).toBe(false);
	});

	it('shows her neither a colleague’s acceptance nor another organisation’s', async () => {
		await accept(inA(colleague), VERSION);
		await accept({ organizationId: b.id, userId: b.userId }, VERSION);
		// Sans ce relevé, la suite prouverait qu'on ne voit pas ce qui n'existe pas.
		expect(await stored(sql`"version" = ${VERSION}`)).toBe(3);

		const seen = async (context: { organizationId: string; userId?: string }) =>
			allRows(
				await withOrg(app, context, (tx) =>
					tx.execute(sql`
						select distinct "organization_id", "user_id" from "terms_acceptance" order by 1, 2
					`)
				)
			);
		expect(await seen(inA(a.userId))).toEqual([{ organization_id: a.id, user_id: a.userId }]);
		expect(await seen(inA(colleague))).toEqual([{ organization_id: a.id, user_id: colleague }]);
		// Sa propre personne dans une organisation dont elle n'est pas membre : rien, ni ses lignes
		// d'ailleurs, ni celles de l'organisation posée.
		expect(await seen({ organizationId: b.id, userId: a.userId })).toEqual([]);
		// L'organisation sans la personne : rien non plus. La politique exige les deux.
		expect(await seen({ organizationId: a.id })).toEqual([]);
	});

	it('refuses to record for someone else, for another organisation, or without a membership', async () => {
		const other = '2026-09-23';
		expect(
			await messageOfFailure(() => accept(inA(a.userId), other, { userId: colleague }))
		).toMatch(NO_POLICY);
		expect(
			await messageOfFailure(() => accept(inA(a.userId), other, { organizationId: b.id }))
		).toMatch(NO_POLICY);

		// Le contexte est cohérent (la personne et l'organisation posées sont celles de la ligne),
		// mais la personne n'est pas membre : c'est la clé étrangère vers l'adhésion qui refuse.
		const withoutMembership = await sqlStateOfFailure(() =>
			accept({ organizationId: b.id, userId: a.userId }, other)
		);
		expect(withoutMembership).toBe(SQLSTATE.foreignKeyViolation);

		expect(await stored(sql`"version" = ${other}`)).toBe(0);
	});

	it('refuses any update and any delete, on a right that is not granted', async () => {
		const snapshot = async () =>
			allRows<{ version: string; accepted_at: string }>(
				await withMaintenance(owner, (tx) =>
					tx.execute(sql`
						select "version", "accepted_at"::text from "terms_acceptance"
						where "user_id" = ${a.userId} order by 1
					`)
				)
			);
		const before = await snapshot();
		expect(before.map((row) => row.version)).toContain(VERSION);

		for (const statement of [
			sql`update "terms_acceptance" set "version" = '2027-01-01'`,
			sql`update "terms_acceptance" set "accepted_at" = now() - interval '1 year'
				where "user_id" = ${a.userId}`,
			sql`delete from "terms_acceptance"`,
			sql`delete from "terms_acceptance" where "user_id" = ${a.userId}`,
			// Une ligne inexistante échoue de la même façon : le refus ne renseigne sur rien.
			sql`delete from "terms_acceptance" where "id" = '00000000-0000-7000-8000-0000000000ff'`
		]) {
			const message = await messageOfFailure(() =>
				withOrg(app, inA(a.userId), (tx) => tx.execute(statement))
			);
			expect(message).toMatch(NO_RIGHT);
		}
		expect(await snapshot()).toEqual(before);
	});

	it('stamps the moment itself, and refuses a moment chosen by the application', async () => {
		const version = '2026-09-24';
		// `now()` rend le début de la transaction : dans la même transaction, le défaut posé par la
		// base lui est égal à la microseconde. C'est la preuve que la valeur vient du serveur.
		const sameMoment = await withOrg(app, inA(a.userId), async (tx) => {
			await tx.execute(sql`
				insert into "terms_acceptance" ("id", "organization_id", "user_id", "version")
				values (${newId()}, ${a.id}, ${a.userId}, ${version})
			`);
			const row = firstRow<{ same: boolean }>(
				await tx.execute(sql`
					select "accepted_at" = now() as same from "terms_acceptance"
					where "version" = ${version}
				`)
			);
			return row?.same;
		});
		expect(sameMoment).toBe(true);

		// Nommer la colonne suffit à être refusé, quelle que soit la valeur : antidater pour faire
		// croire à une acceptation plus ancienne, ou écrire `default`, qui ne choisit rien.
		for (const value of [sql`'2020-01-01T00:00:00Z'`, sql`default`]) {
			const message = await messageOfFailure(() =>
				withOrg(app, inA(a.userId), (tx) =>
					tx.execute(sql`
						insert into "terms_acceptance"
							("id", "organization_id", "user_id", "version", "accepted_at")
						values (${newId()}, ${a.id}, ${a.userId}, '2026-09-25', ${value})
					`)
				)
			);
			expect(message).toMatch(NO_RIGHT);
		}
		expect(await stored(sql`"version" = '2026-09-25'`)).toBe(0);

		// Et le catalogue le dit sans rien essayer : quatre colonnes accordées, pas l'horodatage.
		const columns = allRows<{ column_name: string }>(
			await owner.execute(sql`
				select column_name from information_schema.column_privileges
				where table_schema = 'public' and table_name = 'terms_acceptance'
					and grantee = 'jadwal_app' and privilege_type = 'INSERT'
				order by column_name
			`)
		).map((row) => row.column_name);
		expect(columns).toEqual(['id', 'organization_id', 'user_id', 'version']);
	});

	it('keeps one line per person, organisation and version', async () => {
		const twice = await sqlStateOfFailure(() => accept(inA(a.userId), VERSION));
		expect(twice).toBe(SQLSTATE.uniqueViolation);

		// L'écriture que l'application emploie : une seconde acceptation de la même version ne lève
		// rien et n'ajoute rien, ce qui absorbe un double clic ou deux onglets ouverts.
		const absorbed = await withOrg(app, inA(a.userId), (tx) =>
			tx.execute(sql`
				insert into "terms_acceptance" ("id", "organization_id", "user_id", "version")
				values (${newId()}, ${a.id}, ${a.userId}, ${VERSION})
				on conflict ("organization_id", "user_id", "version") do nothing
				returning "id"
			`)
		);
		expect(allRows(absorbed)).toEqual([]);
		expect(await stored(sql`"user_id" = ${a.userId} and "version" = ${VERSION}`)).toBe(1);
	});

	it('refuses a malformed version, and accepts a real date only', async () => {
		for (const version of [
			'',
			'v1',
			'2026-9-22',
			'22.09.2026',
			'2026/09/22',
			' 2026-09-22',
			'2026-09-22 ',
			'2026-09-22T00:00',
			'20260922',
			'2026-13-01',
			'2026-00-10',
			'2026-09-00',
			'2026-09-31',
			'2026-02-29',
			'0000-01-01'
		]) {
			const state = await sqlStateOfFailure(() => accept(inA(colleague), version));
			expect(state, JSON.stringify(version)).toBe(SQLSTATE.checkViolation);
		}
		const absent = await sqlStateOfFailure(() =>
			withOrg(app, inA(colleague), (tx) =>
				tx.execute(sql`
					insert into "terms_acceptance" ("id", "organization_id", "user_id", "version")
					values (${newId()}, ${a.id}, ${colleague}, null)
				`)
			)
		);
		expect(absent).toBe(NOT_NULL_VIOLATION);

		// Un 29 février d'année bissextile existe : la contrainte suit le calendrier, pas un gabarit.
		await accept(inA(colleague), '2028-02-29');
		expect(await stored(sql`"user_id" = ${colleague} and "version" = '2028-02-29'`)).toBe(1);
	});
});

describe('acceptation des conditions : elle part avec l’adhésion', () => {
	it('leaves when the person is removed from the organisation', async () => {
		const leaving = await newMember(a.id, 'depart-conditions-a');
		await accept(inA(leaving), VERSION);
		expect(await stored(sql`"user_id" = ${leaving}`)).toBe(1);

		// Le retrait tel que l'écran des membres le fait : une personne responsable, dans le contexte
		// de son organisation. Elle n'a aucun droit sur la table des acceptations ; la cascade passe
		// quand même, parce que c'est la base qui l'exécute.
		await withOrg(app, inA(a.userId), (tx) =>
			tx.execute(sql`delete from "membership" where "user_id" = ${leaving}`)
		);
		expect(await stored(sql`"user_id" = ${leaving}`)).toBe(0);
	});

	it('leaves when the account is deleted', async () => {
		const gone = await newMember(a.id, 'compte-conditions-a');
		await accept(inA(gone), VERSION);
		expect(await stored(sql`"user_id" = ${gone}`)).toBe(1);

		await withMaintenance(owner, (tx) => tx.execute(sql`delete from "user" where "id" = ${gone}`));
		expect(await stored(sql`"user_id" = ${gone}`)).toBe(0);
	});

	it('leaves when the organisation is deleted, and nothing else goes with it', async () => {
		const doomed = await seedOrganisation(owner, 'conditions-supprimee');
		await accept({ organizationId: doomed.id, userId: doomed.userId }, VERSION);
		expect(await stored(sql`"organization_id" = ${doomed.id}`)).toBeGreaterThanOrEqual(1);
		const elsewhere = await stored(sql`"organization_id" <> ${doomed.id}`);

		await superAdmin.execute(sql`delete from "organization" where "id" = ${doomed.id}`);
		expect(await stored(sql`"organization_id" = ${doomed.id}`)).toBe(0);
		expect(await stored(sql`"organization_id" <> ${doomed.id}`)).toBe(elsewhere);
	});
});

describe('acceptation des conditions : les autres rôles', () => {
	it('lets the super-admin read the organisation he entered, and write nothing', async () => {
		const query = sql`
			select "organization_id", "user_id" from "terms_acceptance"
			where "version" = ${VERSION} order by "user_id"
		`;
		const read = async (organizationId?: string) =>
			allRows(
				organizationId
					? await withOrg(superAdmin, organizationId, (tx) => tx.execute(query))
					: await superAdmin.execute(query)
			);
		// Toutes les personnes de l'organisation où il est entré, et seulement celle-là.
		expect(await read(a.id)).toEqual(
			[a.userId, colleague].sort().map((userId) => ({ organization_id: a.id, user_id: userId }))
		);
		expect(await read(b.id)).toEqual([{ organization_id: b.id, user_id: b.userId }]);
		// Sans contexte, rien : le garde-fou de l'ADR 0025.
		expect(await read()).toEqual([]);

		for (const statement of [
			sql`insert into "terms_acceptance" ("id", "organization_id", "user_id", "version")
				values (${newId()}, ${a.id}, ${a.userId}, '2026-10-01')`,
			sql`update "terms_acceptance" set "version" = '2027-01-01'`,
			sql`delete from "terms_acceptance"`
		]) {
			const message = await messageOfFailure(() =>
				withOrg(superAdmin, inA(a.userId), (tx) => tx.execute(statement))
			);
			expect(message).toMatch(NO_RIGHT);
		}
	});

	it('gives the public role and the sign-in role nothing at all', async () => {
		for (const handle of [publicHandle, authHandle]) {
			const message = await messageOfFailure(() =>
				handle.db.execute(sql`select count(*) from "terms_acceptance"`)
			);
			expect(message).toMatch(NO_RIGHT);
		}
	});

	it('grants exactly what the policies cover, and no more', async () => {
		const grants = allRows<{ grantee: string; privilege_type: string }>(
			await owner.execute(sql`
				select grantee, privilege_type from information_schema.role_table_grants
				where table_schema = 'public' and table_name = 'terms_acceptance'
					and grantee like 'jadwal%' and grantee <> 'jadwal_owner'
				union
				select grantee, privilege_type from information_schema.column_privileges
				where table_schema = 'public' and table_name = 'terms_acceptance'
					and grantee like 'jadwal%' and grantee <> 'jadwal_owner'
				order by 1, 2
			`)
		).map((row) => `${row.grantee}:${row.privilege_type}`);
		// L'insertion du rôle applicatif est accordée colonne par colonne : elle n'apparaît que dans
		// les droits de colonne, d'où l'union.
		expect(grants).toEqual(['jadwal_app:INSERT', 'jadwal_app:SELECT', 'jadwal_superadmin:SELECT']);
	});
});

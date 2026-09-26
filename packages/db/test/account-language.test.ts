// La langue du compte, du côté de la base (ADR 0046, migration 0060).
//
// L'espace des responsables se lit en cinq langues, et la langue choisie est retenue pour le compte.
// Une colonne de plus, et le chemin le plus étroit pour l'écrire : le rôle applicatif reçoit le droit
// de modifier cette colonne seule, et une politique ne lui laisse que la ligne de la personne du
// contexte. Aucune autre colonne du compte ne devient modifiable, pour aucun rôle.
//
// Tout passe par les rôles de connexion, non privilégiés. Le propriétaire ne sert qu'à poser le
// décor et à relever ce qui est réellement en base, sous son drapeau d'entretien (ADR 0019).

import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, withOrg, withUser, type Database, type DatabaseHandle } from '../src/index.js';
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

const NO_RIGHT = /permission denied for table user/;

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let authHandle: DatabaseHandle;
let superAdminHandle: DatabaseHandle;
let owner: Database;
let app: Database;
let org: Organisation;
/** Une éditrice de l'organisation : même organisation que la responsable, autre personne. */
let colleague: string;

/** La langue enregistrée, relevée par le propriétaire. */
async function stored(userId: string): Promise<string | null | undefined> {
	return firstRow<{ language: string | null }>(
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`select "language" from "user" where "id" = ${userId}`)
		)
	)?.language;
}

/** L'écriture de la langue par la personne elle-même : le contexte ne pose qu'elle. */
async function setOwn(userId: string, language: string | null): Promise<number> {
	return allRows(
		await withUser(app, userId, (tx) =>
			tx.execute(sql`
				update "user" set "language" = ${language} where "id" = ${userId} returning "id"
			`)
		)
	).length;
}

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	authHandle = openDatabase('auth');
	superAdminHandle = openDatabase('superadmin');
	owner = ownerHandle.db;
	app = appHandle.db;
	org = await seedOrganisation(owner, 'langue-du-compte');
	colleague = newId();
	const email = 'collegue-langue@example.test';
	await withMaintenance(owner, (tx) =>
		tx.execute(sql`insert into "user" ("id", "email") values (${colleague}, ${email})`)
	);
	await joinOrganisation(owner, app, org.id, colleague, email, 'editor');
});

afterAll(async () => {
	await superAdminHandle?.close();
	await authHandle?.close();
	await appHandle?.close();
	await ownerHandle?.close();
});

describe('la langue du compte', () => {
	it('is empty on a new account, until the person chooses', async () => {
		expect(await stored(colleague)).toBeNull();
	});

	it('lets the person change her own language, to each of the five, and back to none', async () => {
		for (const language of ['fr', 'de', 'it', 'en', 'ar']) {
			expect(await setOwn(colleague, language), language).toBe(1);
			expect(await stored(colleague)).toBe(language);
			// Elle la relit elle-même, par le rôle applicatif.
			const read = firstRow<{ language: string | null }>(
				await withUser(app, colleague, (tx) =>
					tx.execute(sql`select "language" from "user" where "id" = ${colleague}`)
				)
			);
			expect(read?.language).toBe(language);
		}
		expect(await setOwn(colleague, null)).toBe(1);
		expect(await stored(colleague)).toBeNull();
	});

	it('does not let another person change it, even a responsible person of her organisation', async () => {
		await setOwn(colleague, 'de');
		// La responsable voit sa collègue (les membres de l'organisation se voient), mais la
		// politique ne lui laisse que sa propre ligne : rien n'est touché.
		const fromAdmin = allRows(
			await withOrg(app, { organizationId: org.id, userId: org.userId }, (tx) =>
				tx.execute(sql`
					update "user" set "language" = 'it' where "id" = ${colleague} returning "id"
				`)
			)
		);
		expect(fromAdmin).toEqual([]);
		// Sans organisation, avec sa seule personne : pas davantage.
		const fromAlone = allRows(
			await withUser(app, org.userId, (tx) =>
				tx.execute(
					sql`update "user" set "language" = 'it' where "id" = ${colleague} returning "id"`
				)
			)
		);
		expect(fromAlone).toEqual([]);
		// Sans personne dans le contexte : rien.
		const fromNobody = allRows(
			await withOrg(app, org.id, (tx) =>
				tx.execute(sql`update "user" set "language" = 'it' returning "id"`)
			)
		);
		expect(fromNobody).toEqual([]);
		expect(await stored(colleague)).toBe('de');
	});

	it('refuses a language outside the five, whatever its shape', async () => {
		for (const value of ['es', 'FR', 'fr-CH', 'en-GB', '', ' fr']) {
			expect(await sqlStateOfFailure(() => setOwn(colleague, value)), JSON.stringify(value)).toBe(
				SQLSTATE.checkViolation
			);
		}
		// Et le propriétaire lui-même, sous son drapeau : c'est une contrainte, pas une politique.
		expect(
			await sqlStateOfFailure(() =>
				withMaintenance(owner, (tx) =>
					tx.execute(sql`update "user" set "language" = 'es' where "id" = ${colleague}`)
				)
			)
		).toBe(SQLSTATE.checkViolation);
	});

	it('opens no other column of the account to the application', async () => {
		const others: [string, SQL][] = [
			['name', sql`'Autre nom'`],
			['email', sql`'autre-langue@example.test'`],
			['is_super_admin', sql`true`],
			['email_verified', sql`true`],
			['image', sql`'x'`],
			['updated_at', sql`now()`],
			['created_at', sql`now()`]
		];
		for (const [column, value] of others) {
			const message = await messageOfFailure(() =>
				withUser(app, colleague, (tx) =>
					tx.execute(sql`
						update "user" set ${sql.identifier(column)} = ${value} where "id" = ${colleague}
					`)
				)
			);
			expect(message, column).toMatch(NO_RIGHT);
		}
		// Le catalogue, sans rien essayer : une seule colonne modifiable par le rôle applicatif.
		const columns = allRows<{ name: string }>(
			await owner.execute(sql`
				select a.attname as name from pg_attribute a
				where a.attrelid = 'public.user'::regclass and a.attnum > 0 and not a.attisdropped
					and has_column_privilege('jadwal_app', a.attrelid, a.attnum, 'UPDATE')
				order by a.attnum
			`)
		);
		expect(columns.map((column) => column.name)).toEqual(['language']);
	});

	it('is not written by the login role nor by the super-admin', async () => {
		// Le rôle de connexion écrit les colonnes de Better Auth, pas celle-ci : ses droits sont
		// accordés colonne par colonne, et elle n'en fait pas partie.
		expect(
			await messageOfFailure(() =>
				authHandle.db.execute(sql`update "user" set "language" = 'it' where "id" = ${colleague}`)
			)
		).toMatch(NO_RIGHT);
		expect(
			await messageOfFailure(() =>
				withOrg(superAdminHandle.db, org.id, (tx) =>
					tx.execute(sql`update "user" set "language" = 'it' where "id" = ${colleague}`)
				)
			)
		).toMatch(NO_RIGHT);
		// Le rôle de connexion la lit, comme le reste du compte : Better Auth relit la ligne entière.
		const read = firstRow<{ language: string | null }>(
			await authHandle.db.execute(sql`select "language" from "user" where "id" = ${colleague}`)
		);
		expect(read).toHaveProperty('language');
	});

	it('lets the login role name it when it creates an account, and never set it', async () => {
		// Drizzle nomme toutes les colonnes d'une insertion, celle-ci comprise : le rôle de connexion
		// a donc le droit de la nommer (migration 0060). Sa politique exige qu'elle reste vide, parce
		// que c'est la personne qui choisit sa langue, jamais la création du compte.
		const create = (language: SQL) => {
			const id = newId();
			return authHandle.db.execute(sql`
				insert into "user" ("id", "email", "name", "email_verified", "image", "is_super_admin",
					"language", "created_at", "updated_at")
				values (${id}, ${`${id}@example.test`}, 'Sans nom', false, default, default,
					${language}, now(), now())
				returning "language"
			`);
		};
		for (const empty of [sql`default`, sql`null`]) {
			expect(allRows(await create(empty))).toEqual([{ language: null }]);
		}
		for (const language of ['fr', 'de', 'it', 'en', 'ar']) {
			const message = await messageOfFailure(() => create(sql`${language}`));
			expect(message, language).toContain('row-level security policy');
			expect(message, language).toContain('"user"');
		}
	});
});

// Modifier une adhésion, du côté de la base : le rôle, et rien d'autre.
//
// Le rôle applicatif a reçu la modification des adhésions à l'étape 3 (migration 0012), sur toutes
// les colonnes, et la politique ne vérifie que l'organisation du contexte. Une simple éditrice
// pouvait donc repointer une adhésion de son organisation vers n'importe quel compte existant,
// jamais invité : la vérification de la clé étrangère contourne la sécurité au niveau des lignes,
// puis `user_select` lui ouvrait le courriel de ce compte. C'est l'évasion que l'ADR 0013 dit
// fermée ; la migration 0024 avait fermé l'insertion, pas la modification. La même faille servait
// d'oracle sur les acceptations des conditions, par le nom de la clé dans le message d'erreur.
//
// Tout passe par les rôles de connexion, non privilégiés. Le propriétaire ne sert qu'à poser le
// décor et à relever ce qui est réellement en base, sous son drapeau d'entretien (ADR 0019).

import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, withOrg, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
	countIn,
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

/** Le refus d'un droit absent, par opposition au refus d'une politique : même code, autre message. */
const NO_RIGHT = /permission denied for table membership/;
/** Un compte qui n'existe pas : l'identifiant visé par l'oracle. */
const NOBODY = '01930000-0000-7000-8000-00000000abcd';
/** Le message qui signale qu'une tentative a passé, et qu'on l'a annulée soi-même. */
const ROLLED_BACK = 'tentative passée, annulée par le test';

interface Context {
	organizationId: string;
	userId: string;
}

/** Ce que rend une tentative : le refus de la base, ou ce qu'on a pu lire juste après. */
type Outcome = { refused: string } | { passed: unknown[] };

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let superAdminHandle: DatabaseHandle;
let owner: Database;
let app: Database;
let superAdmin: Database;
let a: Organisation;
let b: Organisation;
/** L'éditrice de A qui tente l'évasion. */
let editor: string;
/** Une collègue de A qui a accepté les conditions. */
let accepted: string;
/** Une collègue de A qui ne les a pas acceptées. */
let pending: string;

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

/** Les adhésions d'un compte, relevées par le propriétaire sous son drapeau d'entretien. */
async function stored(userId: string) {
	return allRows<{ id: string; organization_id: string; role: string; updated_at: string }>(
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				select "id", "organization_id", "role", "updated_at"::text from "membership"
				where "user_id" = ${userId} order by "organization_id"
			`)
		)
	);
}

/**
 * Joue une écriture dans le contexte donné, relit dans la même transaction ce qu'elle aurait ouvert,
 * puis annule tout. Quand la base laisse passer, le test montre ce qui aurait fui, et le décor des
 * autres cas n'en est pas changé.
 */
async function attempt(context: Context, statement: SQL, afterwards?: SQL): Promise<Outcome> {
	let seen: unknown[] = [];
	const message = await messageOfFailure(() =>
		withOrg(app, context, async (tx) => {
			await tx.execute(statement);
			if (afterwards) seen = allRows(await tx.execute(afterwards));
			throw new Error(ROLLED_BACK);
		})
	);
	return message === ROLLED_BACK ? { passed: seen } : { refused: message };
}

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	superAdminHandle = openDatabase('superadmin');
	owner = ownerHandle.db;
	app = appHandle.db;
	superAdmin = superAdminHandle.db;
	a = await seedOrganisation(owner, 'adhesion-a');
	b = await seedOrganisation(owner, 'adhesion-b');
	editor = await newMember(a.id, 'editrice-adhesion-a');
	accepted = await newMember(a.id, 'acceptee-adhesion-a');
	pending = await newMember(a.id, 'en-attente-adhesion-a');
	// Une version qu'aucun autre fichier n'emploie : les fichiers partagent la base, et
	// `terms-acceptance.test.ts` compte les lignes de ses propres versions.
	await withOrg(app, inA(accepted), (tx) =>
		tx.execute(sql`
			insert into "terms_acceptance" ("id", "organization_id", "user_id", "version")
			values (${newId()}, ${a.id}, ${accepted}, '2026-07-01')
		`)
	);
});

afterAll(async () => {
	await superAdminHandle?.close();
	await appHandle?.close();
	await ownerHandle?.close();
});

describe('modifier une adhésion : on ne rattache personne', () => {
	it('refuses to point a membership of A at an account that A never invited', async () => {
		const emailOfB = sql`select "email" from "user" where "id" = ${b.userId}`;
		// Avant : la responsable de B est invisible depuis A, comme il se doit.
		expect(allRows(await withOrg(app, inA(editor), (tx) => tx.execute(emailOfB)))).toEqual([]);

		// L'évasion : la ligne d'une collègue, repointée vers la responsable de B et promue au
		// passage, puis la lecture de son courriel, que `user_select` ouvre aux membres de A.
		const outcome = await attempt(
			inA(editor),
			sql`update "membership" set "user_id" = ${b.userId}, "role" = 'org_admin'
				where "user_id" = ${pending}`,
			emailOfB
		);
		expect(outcome).toEqual({ refused: expect.stringMatching(NO_RIGHT) });

		// Rien n'a bougé : la collègue est toujours éditrice de A, la responsable de B n'est que de B.
		expect(
			(await stored(pending)).map(({ organization_id, role }) => [organization_id, role])
		).toEqual([[a.id, 'editor']]);
		expect(
			(await stored(b.userId)).map(({ organization_id, role }) => [organization_id, role])
		).toEqual([[b.id, 'org_admin']]);
	});

	it('refuses to rewrite who, where or when of a membership, whatever the value', async () => {
		// Le refus tombe sur un droit absent, avant qu'une ligne soit examinée : la valeur ne compte
		// pas, et réécrire la valeur déjà en place est refusé comme le reste.
		const rewrites: [string, string][] = [
			['id', newId()],
			['organization_id', b.id],
			['organization_id', a.id],
			['user_id', pending],
			['created_at', '2020-01-01T00:00:00Z']
		];
		for (const [column, value] of rewrites) {
			const outcome = await attempt(
				inA(editor),
				sql`update "membership" set ${sql.identifier(column)} = ${value}
					where "user_id" = ${pending}`
			);
			expect(outcome, `${column} = ${value}`).toEqual({ refused: expect.stringMatching(NO_RIGHT) });
		}
	});

	it('tells an editor nothing, through a failed update, about a colleague’s acceptance', async () => {
		// Elle ne voit que ses propres acceptations, et elle n'en a aucune.
		expect(await withOrg(app, inA(editor), (tx) => countIn(tx, 'terms_acceptance'))).toBe(0);
		// Sans ce relevé, la suite prouverait qu'on ne distingue pas deux cas identiques.
		const acceptances = async (userId: string) =>
			Number(
				firstRow<{ count: string }>(
					await withMaintenance(owner, (tx) =>
						tx.execute(sql`
							select count(*)::text as count from "terms_acceptance"
							where "organization_id" = ${a.id} and "user_id" = ${userId}
						`)
					)
				)?.count
			);
		expect(await acceptances(accepted)).toBe(1);
		expect(await acceptances(pending)).toBe(0);

		// La même écriture sur l'une et sur l'autre. Si la base allait jusqu'aux clés, la première
		// buterait sur la clé des acceptations et la seconde sur celle des comptes, et le nom de la
		// contrainte dirait laquelle a accepté.
		const onAccepted = await attempt(
			inA(editor),
			sql`update "membership" set "user_id" = ${NOBODY} where "user_id" = ${accepted}`
		);
		const onPending = await attempt(
			inA(editor),
			sql`update "membership" set "user_id" = ${NOBODY} where "user_id" = ${pending}`
		);
		expect(onAccepted).toEqual(onPending);
		expect(onAccepted).toEqual({ refused: expect.stringMatching(NO_RIGHT) });
	});
});

describe('modifier une adhésion : le rôle reste modifiable', () => {
	it('still lets the role change as the members screen writes it, under both roles', async () => {
		const [before] = await stored(editor);
		expect(before?.role).toBe('editor');
		// L'écriture de l'écran des membres, mot pour mot : le rôle et sa date, par l'identifiant.
		const change = (db: Database, context: Context | string, role: string) =>
			withOrg(db, context, async (tx) =>
				allRows(
					await tx.execute(sql`
						update "membership" set "role" = ${role}, "updated_at" = now()
						where "id" = ${before?.id} returning "role"
					`)
				)
			);
		expect(await change(app, inA(a.userId), 'org_admin')).toEqual([{ role: 'org_admin' }]);
		// Le super-admin passe par la même écriture quand il est entré dans l'organisation.
		expect(await change(superAdmin, a.id, 'editor')).toEqual([{ role: 'editor' }]);

		const [after] = await stored(editor);
		expect(after?.role).toBe('editor');
		expect(after?.updated_at).not.toBe(before?.updated_at);
	});

	it('still refuses to demote the last responsible person, whoever asks', async () => {
		const [admin] = await stored(a.userId);
		expect(admin?.role).toBe('org_admin');
		const demote = sql`update "membership" set "role" = 'editor', "updated_at" = now()
			where "id" = ${admin?.id}`;
		expect(
			await sqlStateOfFailure(() => withOrg(app, inA(a.userId), (tx) => tx.execute(demote)))
		).toBe(SQLSTATE.restrictViolation);
		expect(
			await sqlStateOfFailure(() => withOrg(superAdmin, a.id, (tx) => tx.execute(demote)))
		).toBe(SQLSTATE.restrictViolation);
	});

	it('grants the application role two columns, and the super-admin the whole row', async () => {
		// Le catalogue, sans rien essayer. Le super-admin garde la modification de toute la ligne,
		// par décision (ADR 0025) : il crée déjà une adhésion pour qui il veut dans l'organisation où
		// il est entré, et il lit tous les comptes. Déplacer une adhésion ne lui ouvre rien de plus.
		const columns = allRows<{ name: string; app: boolean; superadmin: boolean }>(
			await owner.execute(sql`
				select a.attname as name,
					has_column_privilege('jadwal_app', a.attrelid, a.attnum, 'UPDATE') as app,
					has_column_privilege('jadwal_superadmin', a.attrelid, a.attnum, 'UPDATE') as superadmin
				from pg_attribute a
				where a.attrelid = 'public.membership'::regclass and a.attnum > 0 and not a.attisdropped
				order by a.attnum
			`)
		);
		expect(columns.filter((column) => column.app).map((column) => column.name)).toEqual([
			'role',
			'updated_at'
		]);
		expect(columns.every((column) => column.superadmin)).toBe(true);

		// Le reste des droits du rôle applicatif ne change pas : lire, rejoindre, retirer.
		const table = firstRow<Record<string, boolean>>(
			await owner.execute(sql`
				select has_table_privilege('jadwal_app', 'public.membership', 'SELECT') as select,
					has_table_privilege('jadwal_app', 'public.membership', 'INSERT') as insert,
					has_table_privilege('jadwal_app', 'public.membership', 'UPDATE') as update,
					has_table_privilege('jadwal_app', 'public.membership', 'DELETE') as delete
			`)
		);
		expect(table).toEqual({ select: true, insert: true, update: false, delete: true });
	});
});

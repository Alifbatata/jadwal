// Les organisations vues par le super-admin : celle où il est entré, et elle seule ; toutes, dans sa
// console, quand aucun contexte n'est posé.
//
// Jusqu'à l'étape 17, `organization_superadmin_select` valait `true` : entré dans A, il lisait
// aussi B, et quatre lectures sans filtre lui ont montré les réglages d'une autre organisation que
// la sienne (corrigées à l'étape 16, dans l'application). La modification et la suppression
// valaient `true` elles aussi : une instruction sans `where`, tapée depuis A, touchait toutes les
// organisations du service. La migration 0055 borne ces trois politiques au contexte quand il est
// posé (ADR 0025). La création ne touche aucune organisation existante : elle reste ouverte.

import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
	createDatabase,
	newId,
	withOrg,
	type Database,
	type DatabaseHandle
} from '../src/index.js';
import { allRows, openDatabase, seedOrganisation, type Organisation } from './helpers.js';

let ownerHandle: DatabaseHandle;
let superAdminHandle: DatabaseHandle;
let superAdmin: Database;
let a: Organisation;
let b: Organisation;

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	superAdminHandle = openDatabase('superadmin');
	superAdmin = superAdminHandle.db;
	a = await seedOrganisation(ownerHandle.db, 'contexte-sa-a');
	b = await seedOrganisation(ownerHandle.db, 'contexte-sa-b');
});

afterAll(async () => {
	await superAdminHandle?.close();
	await ownerHandle?.close();
});

/** Les identifiants d'organisation qu'une requête rend. */
async function organisationIds(run: Promise<unknown>): Promise<string[]> {
	return allRows<{ id: string }>(await run).map((row) => row.id);
}

/** Levée pour défaire une écriture d'essai : elle porte le nombre de lignes touchées. */
class Rollback extends Error {
	readonly touched: number;
	constructor(touched: number) {
		super('rollback');
		this.touched = touched;
	}
}

/**
 * Joue une écriture dans le contexte de A, compte les lignes touchées, puis défait tout. postgres.js
 * rend ce nombre dans `count` ; Drizzle le laisse passer tel quel.
 */
async function touchedFromA(statement: SQL): Promise<number> {
	try {
		await withOrg(superAdmin, a.id, async (tx) => {
			const result = (await tx.execute(statement)) as unknown as { count?: number };
			throw new Rollback(Number(result.count));
		});
	} catch (error) {
		for (let current: unknown = error; current instanceof Error; current = current.cause) {
			if (current instanceof Rollback) return current.touched;
		}
		throw error;
	}
	throw new Error('la transaction aurait dû être défaite');
}

describe('le super-admin entré dans une organisation', () => {
	it('reads that organisation and no other one', async () => {
		const vues = await withOrg(superAdmin, a.id, (tx) =>
			organisationIds(tx.execute(sql`select "id" from "organization"`))
		);
		expect(vues).toEqual([a.id]);
	});

	it('does not even find another organisation by its identifier', async () => {
		// C'est la forme des lectures corrigées à l'étape 16 : un filtre qui nomme la bonne colonne,
		// mais pas le contexte. Elle ne rend plus rien au lieu de rendre la mauvaise organisation.
		const vues = await withOrg(superAdmin, a.id, (tx) =>
			organisationIds(tx.execute(sql`select "id" from "organization" where "id" = ${b.id}`))
		);
		expect(vues).toEqual([]);
	});

	it('changes no other organisation, even with a statement that has no where clause', async () => {
		// Sans `where`, la politique de lecture n'est pas consultée : seule celle de modification
		// borne l'écriture. C'est elle que ce cas éprouve.
		expect(await touchedFromA(sql`update "organization" set "greeting" = 'Bonjour'`)).toBe(1);
	});

	it('deletes no other organisation, even with a statement that has no where clause', async () => {
		expect(await touchedFromA(sql`delete from "organization"`)).toBe(1);
	});

	it('does not change another organisation named by its identifier', async () => {
		// La méprise que l'ADR 0025 veut arrêter : le bon identifiant, tapé depuis la mauvaise
		// organisation. Zéro ligne, comme pour toute autre table d'organisation.
		expect(
			await touchedFromA(sql`update "organization" set "plan" = 'sponsored' where "id" = ${b.id}`)
		).toBe(0);
	});
});

describe('le super-admin avec un contexte illisible', () => {
	it('sees no organisation at all, rather than all of them', async () => {
		// Un contexte posé mais qui n'est pas un identifiant n'est pas une absence de contexte : il
		// ne rend rien, comme sur les autres tables (ADR 0013). Seul un contexte vide ouvre la console.
		const vues = await superAdmin.transaction(async (tx) => {
			await tx.execute(sql`select set_config('jadwal.org_id', 'pas-un-identifiant', true)`);
			return organisationIds(tx.execute(sql`select "id" from "organization"`));
		});
		expect(vues).toEqual([]);
	});
});

describe('le super-admin dans sa console, sans contexte', () => {
	it('reads every organisation, which is how the console lists them', async () => {
		const vues = await organisationIds(superAdmin.execute(sql`select "id" from "organization"`));
		expect(vues).toEqual(expect.arrayContaining([a.id, b.id]));
	});

	it('reads every organisation again on a connection that has just left one', async () => {
		// Les lectures de la console passent par le même pool que `withSessionOrg`. Une fois la
		// transaction close, le réglage ne vaut plus nul mais vide : c'est pour lui que la politique
		// compare à la chaîne vide. Une seule connexion, pour que ce soit bien la même.
		const seule = createDatabase({
			role: 'superadmin',
			overrides: { database: inject('testDatabase') },
			max: 1
		});
		try {
			await withOrg(seule.db, a.id, (tx) => tx.execute(sql`select 1`));
			const vues = await organisationIds(seule.db.execute(sql`select "id" from "organization"`));
			expect(vues).toEqual(expect.arrayContaining([a.id, b.id]));
		} finally {
			await seule.close();
		}
	});

	it('finds the organisation it is about to enter, by its identifier', async () => {
		// C'est la lecture de `chooseOrganisation` et de `currentOrganisation`, sans contexte, avant
		// d'entrer.
		const vues = await organisationIds(
			superAdmin.execute(sql`select "id" from "organization" where "id" = ${b.id}`)
		);
		expect(vues).toEqual([b.id]);
	});

	it('changes the plan and the state of any organisation', async () => {
		const plan = await superAdmin.execute(
			sql`update "organization" set "plan" = 'sponsored', "status" = 'suspended'
				where "id" = ${b.id}`
		);
		expect((plan as unknown as { count: number }).count).toBe(1);
		const remis = await superAdmin.execute(
			sql`update "organization" set "plan" = 'free', "status" = 'active' where "id" = ${b.id}`
		);
		expect((remis as unknown as { count: number }).count).toBe(1);
	});

	it('opens a new organisation, then closes it', async () => {
		const id = newId();
		await superAdmin.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language")
			values (${id}, 'contexte-sa-nouvelle', 'Nouvelle', 'Europe/Zurich', 'fr', array['fr'])
		`);
		const ferme = await superAdmin.execute(sql`delete from "organization" where "id" = ${id}`);
		expect((ferme as unknown as { count: number }).count).toBe(1);
	});
});

describe('les politiques du super-admin qui ne lisent pas le contexte', () => {
	it('are the ones a decision leaves open, and no other', async () => {
		// Relevé dans le catalogue, sans nommer de table : une politique du super-admin qui ne lit
		// pas `jadwal.current_org_id()` fait échouer ce test tant qu'elle n'est pas ajoutée ici avec
		// sa raison.
		//   `admin_access_log` : son registre à lui, qui n'est pas une donnée d'organisation ; une
		//     consultation dans sa console n'a pas de contexte à inscrire (ADR 0025).
		//   `organization` INSERT : créer une organisation n'en touche aucune autre.
		//   `user` SELECT : un compte n'appartient à aucune organisation, et il les lit tous par
		//     décision (ADR 0025).
		const ouvertes = allRows<{ line: string }>(
			await ownerHandle.db.execute(sql`
				select tablename || ' ' || cmd as line from pg_policies
				where schemaname = 'public' and 'jadwal_superadmin' = any(roles)
					and coalesce(qual, '') not like '%current_org_id()%'
					and coalesce(with_check, '') not like '%current_org_id()%'
				order by 1
			`)
		).map((row) => row.line);
		expect(ouvertes).toEqual([
			'admin_access_log INSERT',
			'admin_access_log SELECT',
			'organization INSERT',
			'user SELECT'
		]);
	});
});

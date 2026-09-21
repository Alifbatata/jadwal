// Rétention du journal d'audit : vingt-quatre mois (ADR 0020), et le verrou qui la suspend
// (ADR 0030).
//
// La fenêtre est portée par une politique de suppression, pas par le code de la procédure : un
// `delete` sans clause de restriction ne supprime que ce que la fenêtre autorise. Et l'horodatage
// n'est pas écrivable par l'application, donc une entrée ne peut être ni antidatée pour tomber dans
// la fenêtre, ni postdatée pour y échapper.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, withOrg, type Database, type DatabaseHandle } from '../src/index.js';
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
let appHandle: DatabaseHandle;
let superAdminHandle: DatabaseHandle;
let owner: Database;
let app: Database;
let superAdmin: Database;
let org: Organisation;

const AGES = [
	['trente mois', 30],
	['vingt-cinq mois', 25],
	['vingt-trois mois', 23],
	['trois mois', 3]
] as const;

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	superAdminHandle = openDatabase('superadmin');
	owner = ownerHandle.db;
	app = appHandle.db;
	superAdmin = superAdminHandle.db;
	org = await seedOrganisation(owner, 'retention');
	// Les entrées d'âge choisi ne peuvent pas venir du rôle applicatif, qui n'a pas le droit
	// d'écrire l'horodatage : c'est précisément ce que ce fichier vérifie plus bas. Elles viennent
	// donc du propriétaire, sous son drapeau d'entretien, comme le ferait une tâche d'entretien.
	await withMaintenance(owner, async (tx) => {
		for (const [label, months] of AGES) {
			await tx.execute(sql`
				insert into "audit_log" ("id", "organization_id", "action", "target_table", "created_at")
				values (${newId()}, ${org.id}, ${label}, 'course', now() - make_interval(months => ${months}))
			`);
		}
	});
});

afterAll(async () => {
	await appHandle?.close();
	await superAdminHandle?.close();
	await ownerHandle?.close();
});

async function remaining(): Promise<string[]> {
	const rows = await withOrg(app, org.id, (tx) =>
		tx.execute<{ action: string }>(
			sql`select "action" from "audit_log" where "organization_id" = ${org.id} order by "created_at"`
		)
	);
	return allRows<{ action: string }>(rows).map((row) => row.action);
}

describe('l’horodatage du journal appartient au serveur', () => {
	it('lets the application add an entry without choosing when', async () => {
		await withOrg(app, { organizationId: org.id, userId: org.userId }, (tx) =>
			tx.execute(sql`
				insert into "audit_log" ("id", "organization_id", "actor_id", "action", "target_table")
				values (${newId()}, ${org.id}, ${org.userId}, 'ordinaire', 'course')
			`)
		);
		expect(await remaining()).toContain('ordinaire');
	});

	it('refuses an entry that chooses its own timestamp', async () => {
		// Le droit d'insertion est accordé colonne par colonne, sans `created_at` : le refus est un
		// refus de droit, pas de politique, donc il ne dépend pas du contenu de la table.
		const state = await sqlStateOfFailure(() =>
			withOrg(app, org.id, (tx) =>
				tx.execute(sql`
					insert into "audit_log" ("id", "organization_id", "action", "target_table", "created_at")
					values (${newId()}, ${org.id}, 'antidatée', 'course', now() - interval '30 months')
				`)
			)
		);
		expect(state).toBe(SQLSTATE.insufficientPrivilege);
	});
});

describe('la purge', () => {
	it('is refused to both application roles, table and procedure alike', async () => {
		for (const [name, db] of [
			['applicatif', app],
			['super-admin', superAdmin]
		] as const) {
			const table = await sqlStateOfFailure(() =>
				withOrg(db, org.id, (tx) => tx.execute(sql`delete from "audit_log"`))
			);
			expect(table, name).toBe(SQLSTATE.insufficientPrivilege);
			const procedure = await sqlStateOfFailure(() =>
				db.execute(sql`select jadwal.purge_audit_log()`)
			);
			expect(procedure, name).toBe(SQLSTATE.insufficientPrivilege);
		}
	});

	it('removes what is beyond twenty-four months, and nothing else', async () => {
		const before = await remaining();
		expect(before).toContain('trente mois');
		expect(before).toContain('vingt-cinq mois');
		expect(before).toContain('vingt-trois mois');

		const result = await owner.execute<{ supprimees: string }>(
			sql`select jadwal.purge_audit_log() as supprimees`
		);
		expect(Number(firstRow<{ supprimees: string }>(result)?.supprimees)).toBeGreaterThanOrEqual(2);

		const after = await remaining();
		expect(after).not.toContain('trente mois');
		expect(after).not.toContain('vingt-cinq mois');
		// La base refuse d'effacer une entrée de moins de vingt-quatre mois, quelle que soit la
		// requête : la procédure supprime sans clause de restriction.
		expect(after).toContain('vingt-trois mois');
		expect(after).toContain('trois mois');
	});

	it('changes nothing when there is nothing left to remove', async () => {
		const before = await remaining();
		const result = await owner.execute<{ supprimees: string }>(
			sql`select jadwal.purge_audit_log() as supprimees`
		);
		expect(Number(firstRow<{ supprimees: string }>(result)?.supprimees)).toBe(0);
		expect(await remaining()).toEqual(before);
	});

	it('does not let the owner read the log it purges', async () => {
		// Le propriétaire n'a qu'une politique de lecture sous son drapeau d'entretien, et la purge
		// n'en a pas besoin : elle supprime sans lire.
		const rows = await owner.execute<{ count: string }>(
			sql`select count(*)::text as count from "audit_log"`
		);
		expect(Number(firstRow<{ count: string }>(rows)?.count)).toBe(0);
	});
});

describe('le verrou de conservation', () => {
	// Une seconde organisation, avec ses propres entrées vieilles de trente mois : la première a
	// déjà été purgée par les tests ci-dessus, et un verrou ne se prouve que sur ce qui aurait
	// disparu sans lui.
	let sousVerrou: Organisation;

	beforeAll(async () => {
		sousVerrou = await seedOrganisation(owner, 'verrou');
		await withMaintenance(owner, async (tx) => {
			await tx.execute(sql`
				insert into "audit_log" ("id", "organization_id", "action", "target_table", "created_at")
				values (${newId()}, ${sousVerrou.id}, 'trente mois', 'course',
					now() - make_interval(months => 30))
			`);
			await tx.execute(sql`
				insert into "admin_access_log" ("id", "organization_id", "organization_slug", "actor_id",
					"action", "route", "created_at")
				values (${newId()}, ${sousVerrou.id}, ${sousVerrou.slug}, ${newId()}, 'read', '/cours',
					now() - make_interval(months => 30))
			`);
			await tx.execute(sql`
				insert into "retention_hold" ("organization_id", "reason", "placed_by")
				values (${sousVerrou.id}, 'litige en cours', 'l’exploitant')
			`);
		});
	});

	/**
	 * Ce qui reste, compté par les rôles qui ont le droit de lire : le journal par l'application,
	 * dans le contexte de son organisation, et le registre interne par le super-admin. Le
	 * propriétaire, lui, purge sans lire — il n'a pas de politique de lecture sur ces deux tables.
	 */
	async function restantes(): Promise<{ journal: number; registre: number }> {
		// On ne compte que ce qui est **hors** de la fenêtre de rétention : le reste survivrait de
		// toute façon, et l'y mêler ferait passer le test pour vert sans rien prouver.
		const vieux = sql`"created_at" < now() - interval '24 months'`;
		const journal = await withOrg(app, sousVerrou.id, async (tx) =>
			firstRow<{ n: string }>(
				await tx.execute(sql`select count(*)::text as n from "audit_log"
					where "organization_id" = ${sousVerrou.id} and ${vieux}`)
			)
		);
		const registre = firstRow<{ n: string }>(
			await superAdmin.execute(sql`select count(*)::text as n from "admin_access_log"
				where "organization_id" = ${sousVerrou.id} and ${vieux}`)
		);
		return { journal: Number(journal?.n), registre: Number(registre?.n) };
	}

	it('belongs to the owner alone: no other role can even see the table', async () => {
		// Un verrou que l'application pourrait lever ne serait pas un verrou. Le refus tombe sur un
		// droit absent, avant qu'une ligne soit examinée.
		for (const [nom, db] of [
			['applicatif', app],
			['super-admin', superAdmin]
		] as const) {
			const lecture = await sqlStateOfFailure(() =>
				withOrg(db, sousVerrou.id, (tx) => tx.execute(sql`select * from "retention_hold"`))
			);
			expect(lecture, nom).toBe(SQLSTATE.insufficientPrivilege);
			const levee = await sqlStateOfFailure(() =>
				withOrg(db, sousVerrou.id, (tx) => tx.execute(sql`delete from "retention_hold"`))
			);
			expect(levee, nom).toBe(SQLSTATE.insufficientPrivilege);
		}
	});

	it('refuses to be placed outside a maintenance transaction, even by the owner', async () => {
		const autre = await seedOrganisation(owner, 'verrou-sans-drapeau');
		// La politique d'écriture exige le drapeau de l'ADR 0019 : poser un verrou est un geste
		// délibéré, jamais un effet de bord d'un script qui passait par là.
		const state = await sqlStateOfFailure(() =>
			owner.execute(sql`
				insert into "retention_hold" ("organization_id", "reason", "placed_by")
				values (${autre.id}, 'sans drapeau', 'personne')
			`)
		);
		expect(state).toBe(SQLSTATE.rlsViolation);
	});

	it('suspends both purges while it is in place', async () => {
		const avant = await restantes();
		expect(avant.journal).toBeGreaterThan(0);
		expect(avant.registre).toBeGreaterThan(0);

		await owner.execute(sql`select jadwal.purge_audit_log()`);
		await withMaintenance(owner, (tx) => tx.execute(sql`select jadwal.purge_admin_access_log()`));

		// Rien n'a bougé, alors que ces entrées ont trente mois : la fenêtre de rétention est
		// portée par une politique, et c'est la politique qui consulte le verrou.
		expect(await restantes()).toEqual(avant);
	});

	it('refuses to let the organisation be deleted while it holds', async () => {
		// Sans cette clé étrangère en `restrict`, le verrou n'aurait fermé que la purge : il aurait
		// suffi de supprimer l'organisation pour emporter son journal.
		const state = await sqlStateOfFailure(() =>
			withMaintenance(owner, (tx) =>
				tx.execute(sql`delete from "organization" where "id" = ${sousVerrou.id}`)
			)
		);
		// `ON DELETE RESTRICT` lève 23001, et non 23503 : c'est la contrainte qui refuse, pas une
		// clé étrangère orpheline.
		expect(state).toBe(SQLSTATE.restrictViolation);
	});

	it('lets the purge through again once it is lifted', async () => {
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`delete from "retention_hold" where "organization_id" = ${sousVerrou.id}`)
		);
		await owner.execute(sql`select jadwal.purge_audit_log()`);
		await withMaintenance(owner, (tx) => tx.execute(sql`select jadwal.purge_admin_access_log()`));
		expect(await restantes()).toEqual({ journal: 0, registre: 0 });
	});
});

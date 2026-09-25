// La limite que l'addendum de l'ADR 0019 écrit plutôt que de la corriger : le propriétaire garde le
// droit `TRUNCATE`, et `TRUNCATE` n'examine aucune politique. Sans son drapeau d'entretien, un
// `delete` ne touche aucune acceptation des conditions, ni aucune ligne du journal d'audit plus
// jeune que ses vingt-quatre mois, et ne dit rien ; un `truncate` vide les deux tables.
//
// Tout se joue dans une transaction défaite à la fin. `TRUNCATE` est transactionnel : rien ne
// disparaît pour les autres tests. Ce qui a été vidé se constate donc dans la même transaction, et
// par la taille des tables : le propriétaire ne lit pas le journal d'audit, même sous son drapeau
// (migrations 0029 et 0039), et une autre connexion attendrait la fin de la transaction, puisque
// `TRUNCATE` tient la table sous un verrou exclusif.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withOrg, type Database, type DatabaseHandle, type Transaction } from '../src/index.js';
import {
	countIn,
	firstRow,
	openDatabase,
	seedOrganisation,
	withMaintenance,
	type Organisation
} from './helpers.js';

const TABLES = ['audit_log', 'terms_acceptance'] as const;

let ownerHandle: DatabaseHandle;
let superAdminHandle: DatabaseHandle;
let owner: Database;
let superAdmin: Database;
let org: Organisation;

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	superAdminHandle = openDatabase('superadmin');
	owner = ownerHandle.db;
	superAdmin = superAdminHandle.db;
	// Une ligne de journal et une acceptation des conditions, comme pour toute organisation.
	org = await seedOrganisation(owner, 'troncature');
});

afterAll(async () => {
	await superAdminHandle?.close();
	await ownerHandle?.close();
});

/** Les lignes de l'organisation, relues hors de la transaction par un rôle qui peut les lire. */
async function committed(): Promise<{ audit_log: number; terms_acceptance: number }> {
	return {
		// Le super-admin lit le journal de l'organisation où il est entré (migration 0033).
		audit_log: await withOrg(superAdmin, org.id, (tx) =>
			countIn(tx, 'audit_log', sql.raw(`where "organization_id" = '${org.id}'`))
		),
		terms_acceptance: await withMaintenance(owner, (tx) =>
			countIn(tx, 'terms_acceptance', sql.raw(`where "organization_id" = '${org.id}'`))
		)
	};
}

/** Levée pour défaire la transaction : elle porte ce que la transaction a constaté. */
class Rollback<T> extends Error {
	readonly seen: T;
	constructor(seen: T) {
		super('rollback');
		this.seen = seen;
	}
}

/** Joue `run` dans une transaction du propriétaire, sans drapeau, puis défait tout. */
async function undone<T>(run: (tx: Transaction) => Promise<T>): Promise<T> {
	try {
		await owner.transaction(async (tx) => {
			throw new Rollback(await run(tx));
		});
	} catch (error) {
		for (let current: unknown = error; current instanceof Error; current = current.cause) {
			if (current instanceof Rollback) return current.seen as T;
		}
		throw error;
	}
	throw new Error('la transaction aurait dû être défaite');
}

/** La taille de la table sur le disque, vue depuis la transaction en cours. */
async function bytes(tx: Transaction, table: string): Promise<number> {
	const row = firstRow<{ bytes: string }>(
		await tx.execute(sql`select pg_relation_size(${`public.${table}`}::regclass)::text as bytes`)
	);
	return Number(row?.bytes);
}

describe('le propriétaire sans son drapeau d’entretien', () => {
	it('deletes no line of the audit log or of the terms acceptances, yet empties both with a truncate', async () => {
		const before = await committed();
		expect(before, 'les lignes de l’organisation, avant').toEqual({
			audit_log: 1,
			terms_acceptance: 1
		});

		const seen = await undone(async (tx) => {
			const flag = firstRow<{ flag: string | null }>(
				await tx.execute(sql`select current_setting('jadwal.maintenance', true) as flag`)
			)?.flag;
			// Le journal perd d'abord, par sa propre purge, ce qui a passé ses vingt-quatre mois : cela,
			// le propriétaire l'emporte sans drapeau, par décision (ADR 0020). Un autre fichier de
			// test a pu en laisser, et le compte du `delete` qui suit dépendrait sinon de l'ordre des
			// fichiers.
			await tx.execute(sql`select jadwal.purge_audit_log()`);
			const tables: Record<string, { deleted: number; before: number; after: number }> = {};
			for (const table of TABLES) {
				// Sans clause de restriction : seules les politiques de suppression décident. Une clause
				// sur une colonne ferait aussi appel aux politiques de lecture, et le zéro aurait une
				// autre cause.
				const deleted = (await tx.execute(
					sql`delete from ${sql.identifier(table)}`
				)) as unknown as { count: number };
				const beforeTruncate = await bytes(tx, table);
				await tx.execute(sql`truncate ${sql.identifier(table)}`);
				tables[table] = {
					deleted: deleted.count,
					before: beforeTruncate,
					after: await bytes(tx, table)
				};
			}
			// Les acceptations, relues sous le drapeau, dans la même transaction : plus aucune.
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			return { flag, tables, termsLeft: await countIn(tx, 'terms_acceptance') };
		});

		expect(seen.flag ?? '', 'aucun drapeau posé').not.toBe('on');
		for (const table of TABLES) {
			const { deleted, before: size, after } = seen.tables[table] ?? {};
			expect(deleted, `${table} : le delete ne touche rien, et ne dit rien`).toBe(0);
			expect(size, `${table} : la table porte des lignes avant le truncate`).toBeGreaterThan(0);
			expect(after, `${table} : vide après le truncate`).toBe(0);
		}
		expect(seen.termsLeft, 'acceptations restantes, sous le drapeau').toBe(0);

		// La transaction défaite, tout est revenu : rien n'a disparu pour les autres tests.
		expect(await committed(), 'les lignes de l’organisation, après').toEqual(before);
	});
});

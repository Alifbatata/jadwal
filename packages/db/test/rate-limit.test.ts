// Le seau de limitation de débit : ce qu'il garde, et combien de temps (ADR 0032).
//
// Depuis l'étape 5, la table portait des clés `public:<adresse IP>` en clair, et rien ne les
// effaçait jamais — ce que l'ADR 0009 et `docs/CONDITIONS.md` promettaient pourtant l'inverse.
// L'application ne pose plus que des condensats ; ce fichier tient l'autre moitié de la
// correction : au-delà d'un jour, une ligne s'en va.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, type Database, type DatabaseHandle } from '../src/index.js';
import { allRows, firstRow, openDatabase, SQLSTATE, sqlStateOfFailure } from './helpers.js';

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let publicHandle: DatabaseHandle;
let owner: Database;

/** Une ligne d'un âge choisi, écrite comme l'application l'écrit — par le rôle public. */
async function seau(db: Database, key: string, ageEnHeures: number): Promise<void> {
	const quand = Date.now() - ageEnHeures * 3_600_000;
	await db.execute(sql`
		insert into "rate_limit" ("id", "key", "count", "last_request")
		values (${newId()}, ${key}, 1, ${quand})
	`);
}

async function clesRestantes(): Promise<string[]> {
	return allRows<{ key: string }>(
		await owner.execute(sql`select "key" from "rate_limit" order by "key"`)
	).map((row) => row.key);
}

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	publicHandle = openDatabase('public');
	owner = ownerHandle.db;
});

afterAll(async () => {
	await ownerHandle?.close();
	await appHandle?.close();
	await publicHandle?.close();
});

describe('la purge du seau', () => {
	it('emporte ce qui a plus d’un jour, et laisse une fenêtre en cours', async () => {
		// La fenêtre la plus longue du service est d'une heure : au-delà d'un jour, une ligne ne
		// limite plus rien et n'est plus qu'une trace.
		await seau(publicHandle.db, 'ancienne-de-trois-jours', 72);
		await seau(publicHandle.db, 'ancienne-de-vingt-cinq-heures', 25);
		await seau(publicHandle.db, 'recente-de-deux-heures', 2);
		expect(await clesRestantes()).toContain('ancienne-de-trois-jours');

		const supprimees = Number(
			firstRow<{ n: string }>(await owner.execute(sql`select jadwal.purge_rate_limit()::text as n`))
				?.n
		);
		expect(supprimees).toBe(2);

		const restantes = await clesRestantes();
		expect(restantes).not.toContain('ancienne-de-trois-jours');
		expect(restantes).not.toContain('ancienne-de-vingt-cinq-heures');
		// La procédure supprime sans clause de restriction : c'est la politique qui borne.
		expect(restantes).toContain('recente-de-deux-heures');
	});

	it('ne fait rien quand il n’y a plus rien à emporter', async () => {
		const avant = await clesRestantes();
		const supprimees = Number(
			firstRow<{ n: string }>(await owner.execute(sql`select jadwal.purge_rate_limit()::text as n`))
				?.n
		);
		expect(supprimees).toBe(0);
		expect(await clesRestantes()).toEqual(avant);
	});

	it('est refusée aux rôles applicatifs', async () => {
		for (const db of [appHandle.db, publicHandle.db]) {
			expect(await sqlStateOfFailure(() => db.execute(sql`select jadwal.purge_rate_limit()`))).toBe(
				SQLSTATE.insufficientPrivilege
			);
		}
	});
});

describe('ce que la migration a effacé', () => {
	it('ne laisse aucune clé en clair de l’ancienne forme', async () => {
		// `0043` vide la table et **prouve** qu'elle est vide avant de continuer : une clé
		// `public:<adresse IP>` écrite avant l'étape 7 ne peut pas avoir survécu.
		const enClair = (await clesRestantes()).filter((cle) =>
			/^public:\d+\.\d+\.\d+\.\d+$/.test(cle)
		);
		expect(enClair).toEqual([]);
	});
});

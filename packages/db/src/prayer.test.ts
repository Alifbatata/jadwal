// Ce que le remplissage fait sans base : les cas où il n'écrit rien, et la forme des résultats.
//
// Les cas qui exigent un vrai PostgreSQL — la fenêtre écrite, l'idempotence, la priorité de
// l'import — sont dans `test/prayer.test.ts`. Ici, une fausse transaction suffit, et elle permet
// d'exercer ce qu'une base ne produit pas à la demande : un pôle où le calcul ne rend rien, et la
// forme de résultat de l'autre pilote.

import { describe, expect, it } from 'vitest';
import type { Transaction } from './client.js';
import type { IsoDate } from '@jadwal/core';
import {
	fillPrayerDays,
	lastImportedDay,
	toPrayerSettings,
	type StoredPrayerSettings
} from './prayer.js';

const AUJOURDHUI = '2026-09-21' as IsoDate;

function reglages(overrides: Partial<StoredPrayerSettings> = {}): StoredPrayerSettings {
	return {
		organizationId: '01930000-0000-7000-8000-000000000001',
		timeZone: 'Europe/Zurich',
		latitude: 47.1368,
		longitude: 7.2468,
		method: 'MuslimWorldLeague',
		madhab: 'shafi',
		highLatitudeRule: 'middleofthenight',
		fajrAdjustment: 0,
		dhuhrAdjustment: 0,
		asrAdjustment: 0,
		maghribAdjustment: 0,
		ishaAdjustment: 0,
		...overrides
	};
}

/** Une transaction qui compte les instructions et rend ce qu'on lui dit de rendre. */
function fausseTransaction(resultat: unknown) {
	const instructions: unknown[] = [];
	const tx = {
		execute: async (query: unknown) => {
			instructions.push(query);
			return resultat;
		}
	} as unknown as Transaction;
	return { tx, instructions };
}

describe('quand il n’y a rien à écrire', () => {
	it('n’ouvre aucune instruction sans position', async () => {
		const { tx, instructions } = fausseTransaction([]);
		expect(
			await fillPrayerDays(tx, reglages({ latitude: null, longitude: null }), AUJOURDHUI)
		).toEqual({ calcules: 0, ecrites: 0 });
		expect(instructions).toHaveLength(0);
	});

	it('n’écrit pas un jour que le calcul ne sait pas produire', async () => {
		// À 89,9° de latitude nord, le soleil ne descend jamais assez pour que l'aube et le crépuscule
		// existent : aucun des quatre cents jours de la fenêtre n'est complet. Un jour incomplet n'est
		// pas écrit du tout — il vaut « heure inconnue » pour le cœur, qui sait le dire.
		const { tx, instructions } = fausseTransaction([]);
		expect(
			await fillPrayerDays(
				tx,
				reglages({ latitude: 89.9, longitude: 0, timeZone: 'UTC' }),
				AUJOURDHUI
			)
		).toEqual({ calcules: 0, ecrites: 0 });
		expect(instructions).toHaveLength(0);
	});
});

describe('la forme des résultats', () => {
	it('compte les lignes écrites quand le pilote rend un objet plutôt qu’un tableau', async () => {
		const { tx } = fausseTransaction({ rows: [{ date: '2026-09-21' }, { date: '2026-09-22' }] });
		const resultat = await fillPrayerDays(tx, reglages(), AUJOURDHUI);
		expect(resultat.calcules).toBe(401);
		expect(resultat.ecrites).toBe(2);
	});

	it('n’en compte aucune quand le pilote ne rend ni tableau ni lignes', async () => {
		const { tx } = fausseTransaction({});
		expect((await fillPrayerDays(tx, reglages(), AUJOURDHUI)).ecrites).toBe(0);
	});

	it('lit la fin de l’import dans les deux formes, et rend `null` quand il n’y en a pas', async () => {
		const organisation = reglages().organizationId;
		expect(await lastImportedDay(fausseTransaction([{ fin: '2026-12-31' }]).tx, organisation)).toBe(
			'2026-12-31'
		);
		expect(
			await lastImportedDay(fausseTransaction({ rows: [{ fin: '2027-01-01' }] }).tx, organisation)
		).toBe('2027-01-01');
		expect(await lastImportedDay(fausseTransaction([{ fin: null }]).tx, organisation)).toBeNull();
		expect(await lastImportedDay(fausseTransaction([]).tx, organisation)).toBeNull();
		expect(await lastImportedDay(fausseTransaction({}).tx, organisation)).toBeNull();
	});
});

describe('les réglages traduits', () => {
	it('garde une méthode connue telle quelle', () => {
		expect(toPrayerSettings(reglages({ method: 'Turkey', madhab: 'hanafi' }))).toMatchObject({
			method: 'Turkey',
			madhab: 'hanafi'
		});
	});

	it('remplace une méthode absente par le défaut du service', () => {
		expect(toPrayerSettings(reglages({ method: null }))?.method).toBe('MuslimWorldLeague');
	});
});

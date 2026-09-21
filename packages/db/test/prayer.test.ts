// Le remplissage des heures calculées : la fenêtre, l'idempotence, et la règle qui commande tout —
// un jour importé l'emporte sur le calcul (ADR 0004).

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	fillPrayerDays,
	lastImportedDay,
	PRAYER_AHEAD_DAYS,
	PRAYER_PAST_DAYS,
	toPrayerSettings,
	withOrg,
	type Database,
	type DatabaseHandle,
	type StoredPrayerSettings
} from '../src/index.js';
import type { IsoDate } from '@jadwal/core';
import { allRows, firstRow, openDatabase, seedOrganisation, type Organisation } from './helpers.js';

let appHandle: DatabaseHandle;
let ownerHandle: DatabaseHandle;
let app: Database;
let organisation: Organisation;

/** Le jour de référence. C'est aussi celui de la seule ligne importée que la fixture écrit. */
const AUJOURDHUI = '2026-09-21' as IsoDate;
const JOURS = PRAYER_PAST_DAYS + PRAYER_AHEAD_DAYS + 1;

/** Bienne, à la minute près : la ville du cadrage, et la latitude qui pose la question de l'Isha. */
function reglages(overrides: Partial<StoredPrayerSettings> = {}): StoredPrayerSettings {
	return {
		organizationId: organisation.id,
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

function remplir(stored: StoredPrayerSettings = reglages()) {
	return withOrg(app, organisation.id, (tx) => fillPrayerDays(tx, stored, AUJOURDHUI));
}

async function jours() {
	return withOrg(app, organisation.id, async (tx) =>
		allRows<{ date: string; source: string; fajr: string; updated_at: string }>(
			await tx.execute(sql`
				select "date"::text, "source", "fajr"::text, "updated_at"::text
				from "prayer_day" where "organization_id" = ${organisation.id} order by "date"
			`)
		)
	);
}

beforeAll(async () => {
	appHandle = openDatabase('app');
	ownerHandle = openDatabase('owner');
	app = appHandle.db;
	organisation = await seedOrganisation(ownerHandle.db, 'prayer-fill');
});

afterAll(async () => {
	await appHandle?.close();
	await ownerHandle?.close();
});

describe('les réglages traduits pour le calcul', () => {
	it('rend rien du tout sans position : importer seulement est un cas normal', () => {
		expect(toPrayerSettings(reglages({ latitude: null, longitude: null }))).toBeUndefined();
	});

	it('remplace une valeur illisible par le défaut du service plutôt que d’échouer', () => {
		// Une base modifiée à la main ne doit pas faire tomber la tâche de nuit de toutes les
		// organisations : la valeur incompréhensible est traitée comme absente.
		const traduits = toPrayerSettings(
			reglages({ method: 'Mawaqit', madhab: 'maliki', highLatitudeRule: 'aucune' })
		);
		expect(traduits).toMatchObject({
			method: 'MuslimWorldLeague',
			madhab: 'shafi',
			highLatitudeRule: 'middleofthenight'
		});
	});
});

describe('le remplissage de la fenêtre', () => {
	it('couvre les quatre cents jours et un, et n’écrase pas le jour importé', async () => {
		const avant = (await jours()).find((row) => row.date === AUJOURDHUI);
		expect(avant).toMatchObject({ source: 'import', fajr: '05:40:00' });

		const resultat = await remplir();
		expect(resultat.calcules).toBe(JOURS);
		// Tout est écrit sauf le jour importé, que la clause `where` protège.
		expect(resultat.ecrites).toBe(JOURS - 1);

		const apres = await jours();
		expect(apres).toHaveLength(JOURS);
		expect(apres[0]?.date).toBe('2026-08-22');
		expect(apres.at(-1)?.date).toBe('2027-09-26');
		expect(apres.filter((row) => row.source === 'import')).toEqual([
			expect.objectContaining({ date: AUJOURDHUI, fajr: '05:40:00' })
		]);
	});

	it('ne touche rien quand on la relance avec les mêmes réglages', async () => {
		const avant = await jours();
		const resultat = await remplir();
		expect(resultat).toEqual({ calcules: JOURS, ecrites: 0 });
		// Pas même l'horodatage : il entre dans l'empreinte de cache des flux agenda (ADR 0026), et
		// un flux qui s'invalide chaque nuit sans raison ferait retélécharger tout le monde.
		expect(await jours()).toEqual(avant);
	});

	it('récrit les jours calculés quand un ajustement change, et le jour importé jamais', async () => {
		const resultat = await remplir(reglages({ fajrAdjustment: -4 }));
		expect(resultat.ecrites).toBe(JOURS - 1);

		const apres = await jours();
		expect(apres.find((row) => row.date === AUJOURDHUI)).toMatchObject({
			source: 'import',
			fajr: '05:40:00'
		});
		// Et on remet les heures d'origine, pour que les tests suivants partent du même état.
		await remplir();
	});

	it('n’écrit rien du tout quand la position manque', async () => {
		const avant = await jours();
		expect(await remplir(reglages({ latitude: null, longitude: null }))).toEqual({
			calcules: 0,
			ecrites: 0
		});
		expect(await jours()).toEqual(avant);
	});
});

describe('la fin du calendrier importé', () => {
	it('nomme le dernier jour importé, puis plus rien une fois l’import effacé', async () => {
		expect(await withOrg(app, organisation.id, (tx) => lastImportedDay(tx, organisation.id))).toBe(
			AUJOURDHUI
		);

		await withOrg(app, organisation.id, (tx) =>
			tx.execute(sql`
				delete from "prayer_day"
				where "organization_id" = ${organisation.id} and "source" = 'import'
			`)
		);
		expect(
			await withOrg(app, organisation.id, (tx) => lastImportedDay(tx, organisation.id))
		).toBeNull();

		// Et le calcul reprend le jour laissé vacant, sans qu'on ait rien d'autre à faire.
		const resultat = await remplir();
		expect(resultat.ecrites).toBe(1);
		const repris = (await jours()).find((row) => row.date === AUJOURDHUI);
		expect(repris?.source).toBe('computed');
		expect(repris?.fajr).not.toBe('05:40:00');
	});

	it('ignore les jours d’une autre organisation', async () => {
		const voisine = await seedOrganisation(ownerHandle.db, 'prayer-fill-voisine');
		expect(await withOrg(app, voisine.id, (tx) => lastImportedDay(tx, voisine.id))).toBe(
			AUJOURDHUI
		);
		// La nôtre n'a plus d'import : la lecture de la voisine ne l'a pas fait réapparaître.
		expect(
			await withOrg(app, organisation.id, (tx) => lastImportedDay(tx, organisation.id))
		).toBeNull();
		expect(
			firstRow<{ n: string }>(
				await withOrg(app, voisine.id, (tx) =>
					tx.execute(sql`select count(*)::text as n from "prayer_day"`)
				)
			)?.n
		).toBe('1');
	});
});

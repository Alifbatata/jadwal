// La résolution des trois sources (ADR 0004, étape 8).
//
// **Saisie à la main d'abord, import ensuite, calcul en dernier.** Ce fichier éprouve cette phrase
// dans tous les ordres, y compris le cas qui les mêle : un mois saisi à la main au milieu d'une
// plage importée, elle-même au milieu d'une fenêtre calculée.
//
// Il éprouve aussi ce qu'aucune autre suite ne peut éprouver : que la priorité **ne détruit rien**.
// Retirer la période rend les jours importés tels qu'ils étaient — c'est la raison d'être de la
// résolution à la lecture.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	newId,
	resolvedPrayerDaysQuery,
	toPrayerTable,
	withOrg,
	type Database,
	type DatabaseHandle,
	type ResolvedPrayerRow
} from '../src/index.js';
import type { IsoDate } from '@jadwal/core';
import { allRows, openDatabase, seedOrganisation, type Organisation } from './helpers.js';

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let app: Database;
let org: Organisation;

/** Les lignes résolues sur une plage, lues par le rôle applicatif dans son contexte. */
async function resoudre(de: string, a: string): Promise<ResolvedPrayerRow[]> {
	return withOrg(app, org.id, async (tx) =>
		allRows<ResolvedPrayerRow>(
			await tx.execute(resolvedPrayerDaysQuery(org.id, de as IsoDate, a as IsoDate))
		)
	);
}

async function jour(date: string): Promise<ResolvedPrayerRow | undefined> {
	return (await resoudre(date, date))[0];
}

/** Un jour de `prayer_day`, avec sa source. */
async function poserJour(date: string, maghrib: string, source: 'import' | 'computed') {
	await withOrg(app, org.id, (tx) =>
		tx.execute(sql`
			insert into "prayer_day" ("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib",
				"isha", "source")
			values (${org.id}, ${date}, '05:00', '13:00', '17:00', ${maghrib}, '21:00', ${source})
			on conflict ("organization_id", "date") do update set
				"maghrib" = excluded."maghrib", "source" = excluded."source"
		`)
	);
}

/** Une période, avec ce qu'on veut y mettre. */
async function poserPeriode(
	de: string,
	a: string | null,
	colonnes: Record<string, string | number | null> = {}
): Promise<string> {
	const id = newId();
	const noms = Object.keys(colonnes);
	await withOrg(app, org.id, (tx) =>
		tx.execute(sql`
			insert into "prayer_period" ("id", "organization_id", "name", "from_date", "to_date"
				${
					noms.length > 0
						? sql`, ${sql.join(
								noms.map((nom) => sql.identifier(nom)),
								sql`, `
							)}`
						: sql``
				})
			values (${id}, ${org.id}, 'Essai', ${de}, ${a}
				${
					noms.length > 0
						? sql`, ${sql.join(
								noms.map((nom) => sql`${colonnes[nom]}`),
								sql`, `
							)}`
						: sql``
				})
		`)
	);
	return id;
}

async function vider() {
	await withOrg(app, org.id, async (tx) => {
		await tx.execute(sql`delete from "prayer_period" where "organization_id" = ${org.id}`);
		await tx.execute(sql`delete from "prayer_day" where "organization_id" = ${org.id}`);
	});
}

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	app = appHandle.db;
	org = await seedOrganisation(ownerHandle.db, 'resolution');
	await vider();
});

afterAll(async () => {
	await ownerHandle?.close();
	await appHandle?.close();
});

describe('la priorité des trois sources', () => {
	it('rend le calcul quand il est seul', async () => {
		await vider();
		await poserJour('2027-02-01', '17:30', 'computed');
		expect(await jour('2027-02-01')).toMatchObject({
			maghrib: '17:30:00',
			maghrib_source: 'computed'
		});
	});

	it('fait gagner l’import sur le calcul', async () => {
		await vider();
		await poserJour('2027-02-01', '17:30', 'computed');
		await poserJour('2027-02-01', '17:35', 'import');
		expect(await jour('2027-02-01')).toMatchObject({
			maghrib: '17:35:00',
			maghrib_source: 'import'
		});
	});

	it('fait gagner la saisie sur l’import et sur le calcul', async () => {
		await vider();
		await poserJour('2027-02-01', '17:35', 'import');
		await poserPeriode('2027-02-01', '2027-02-28', { maghrib: '17:40' });
		expect(await jour('2027-02-01')).toMatchObject({
			maghrib: '17:40:00',
			maghrib_source: 'manual'
		});
	});

	it('mêle les trois sur une même plage, chacune à sa place', async () => {
		// Le cas du prompt : un mois saisi à la main au milieu d'une plage importée, elle-même au
		// milieu d'une fenêtre calculée. Chaque jour doit rendre exactement une source.
		await vider();
		for (const [date, heure, source] of [
			['2027-01-15', '17:00', 'computed'],
			['2027-02-01', '17:05', 'computed'],
			['2027-02-10', '17:10', 'import'],
			['2027-02-20', '17:20', 'import'],
			['2027-03-05', '17:25', 'computed']
		] as const) {
			await poserJour(date, heure, source);
		}
		await poserPeriode('2027-02-15', '2027-02-25', { maghrib: '17:45' });

		const attendu: Record<string, [string, string]> = {
			'2027-01-15': ['17:00:00', 'computed'],
			'2027-02-01': ['17:05:00', 'computed'],
			'2027-02-10': ['17:10:00', 'import'],
			'2027-02-20': ['17:45:00', 'manual'],
			'2027-03-05': ['17:25:00', 'computed']
		};
		for (const [date, [heure, source]] of Object.entries(attendu)) {
			expect(await jour(date), date).toMatchObject({ maghrib: heure, maghrib_source: source });
		}
	});

	it('ne détruit rien : retirer la période rend le jour importé tel qu’il était', async () => {
		// C'est **la** raison de résoudre à la lecture plutôt que d'écraser `prayer_day`. Une
		// matérialisation aurait perdu 17:10 pour toujours.
		await vider();
		await poserJour('2027-04-10', '19:10', 'import');
		const id = await poserPeriode('2027-04-01', '2027-04-30', { maghrib: '19:30' });
		expect(await jour('2027-04-10')).toMatchObject({ maghrib: '19:30:00' });

		await withOrg(app, org.id, (tx) =>
			tx.execute(sql`delete from "prayer_period" where "id" = ${id}`)
		);
		expect(await jour('2027-04-10')).toMatchObject({
			maghrib: '19:10:00',
			maghrib_source: 'import'
		});
	});

	it('laisse chaque prière suivre sa propre source', async () => {
		// Une période peut ne porter qu'une heure : les quatre autres retombent sur l'import.
		await vider();
		await poserJour('2027-05-01', '20:00', 'import');
		await poserPeriode('2027-05-01', null, { fajr: '05:30' });
		expect(await jour('2027-05-01')).toMatchObject({
			fajr: '05:30:00',
			fajr_source: 'manual',
			maghrib: '20:00:00',
			maghrib_source: 'import'
		});
	});

	it('rend un jour vide quand aucune source ne le couvre', async () => {
		await vider();
		const vide = await jour('2027-06-15');
		expect(vide).toMatchObject({ date: '2027-06-15', maghrib: null, maghrib_source: null });
		// Et la table du cœur ne le contient pas : « jour absent » et « heure absente » sont la
		// même chose pour l'expansion.
		expect(toPrayerTable([vide as ResolvedPrayerRow]).size).toBe(0);
	});
});

describe('l’iqama', () => {
	it('prend l’heure fixe telle quelle', async () => {
		await vider();
		await poserJour('2027-07-01', '21:00', 'computed');
		await poserPeriode('2027-07-01', null, { maghrib_iqama: '21:15' });
		expect(await jour('2027-07-01')).toMatchObject({
			maghrib: '21:00:00',
			maghrib_iqama: '21:15:00'
		});
	});

	it('ajoute le décalage à l’heure du soleil **résolue**', async () => {
		// Le décalage suit la source qui a gagné : si une période saisit l'heure du soleil, c'est
		// elle qui sert de base, et non l'heure importée qu'elle remplace.
		await vider();
		await poserJour('2027-07-02', '21:00', 'import');
		await poserPeriode('2027-07-02', null, { maghrib: '20:50', maghrib_iqama_offset: 10 });
		expect(await jour('2027-07-02')).toMatchObject({
			maghrib: '20:50:00',
			maghrib_iqama: '21:00:00'
		});
	});

	it('fait coexister les deux formes dans une même organisation', async () => {
		await vider();
		await poserJour('2027-07-03', '21:00', 'computed');
		await poserPeriode('2027-07-03', null, {
			fajr_iqama: '06:30',
			maghrib_iqama_offset: 5,
			isha_iqama_offset: 15
		});
		const ligne = await jour('2027-07-03');
		expect(ligne).toMatchObject({
			fajr_iqama: '06:30:00',
			maghrib_iqama: '21:05:00',
			isha_iqama: '21:15:00',
			// Une prière sans iqama n'en a pas : elle ne retombe pas sur celle d'une autre.
			asr_iqama: null
		});
	});

	it('repasse par minuit sans rien casser', async () => {
		// Une Isha à 23:50 avec un quart d'heure d'iqama tombe à 00:05, et c'est l'heure juste.
		await vider();
		await withOrg(app, org.id, (tx) =>
			tx.execute(sql`
				insert into "prayer_day" ("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib",
					"isha", "source")
				values (${org.id}, '2027-06-21', '03:00', '13:30', '17:30', '21:30', '23:50', 'computed')
			`)
		);
		await poserPeriode('2027-06-21', null, { isha_iqama_offset: 15 });
		expect(await jour('2027-06-21')).toMatchObject({ isha_iqama: '00:05:00' });
	});

	it('n’invente pas d’iqama quand l’heure du soleil est inconnue', async () => {
		await vider();
		await poserPeriode('2027-08-01', null, { maghrib_iqama_offset: 5 });
		expect(await jour('2027-08-01')).toMatchObject({ maghrib: null, maghrib_iqama: null });
	});

	it('entre dans la table du cœur sous la forme qu’il attend', async () => {
		await vider();
		await poserJour('2027-09-01', '19:30', 'import');
		await poserPeriode('2027-09-01', null, { maghrib_iqama_offset: 5, fajr_iqama: '06:00' });
		const table = toPrayerTable(await resoudre('2027-09-01', '2027-09-01'));
		expect(table.get('2027-09-01')).toEqual({
			date: '2027-09-01',
			fajr: '05:00',
			dhuhr: '13:00',
			asr: '17:00',
			maghrib: '19:30',
			isha: '21:00',
			iqama: { fajr: '06:00', maghrib: '19:35' }
		});
	});
});

describe('l’isolation', () => {
	it('ne mêle jamais les périodes de deux organisations', async () => {
		await vider();
		const voisine = await seedOrganisation(ownerHandle.db, 'resolution-voisine');
		await poserJour('2027-10-01', '18:00', 'import');
		// La fixture pose déjà une période ouverte chez la voisine : on la retire, sinon la
		// contrainte d'exclusion refuse la nôtre — ce qui prouve au passage qu'elle fonctionne.
		await withOrg(app, voisine.id, (tx) =>
			tx.execute(sql`delete from "prayer_period" where "organization_id" = ${voisine.id}`)
		);
		await withOrg(app, voisine.id, (tx) =>
			tx.execute(sql`
				insert into "prayer_period" ("id", "organization_id", "name", "from_date", "maghrib")
				values (${newId()}, ${voisine.id}, 'Chez la voisine', '2027-09-01', '18:45')
			`)
		);
		// La période de la voisine ne doit rien changer chez nous, ni l'inverse.
		expect(await jour('2027-10-01')).toMatchObject({
			maghrib: '18:00:00',
			maghrib_source: 'import'
		});
	});
});

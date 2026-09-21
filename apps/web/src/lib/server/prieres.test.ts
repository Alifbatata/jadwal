// Le report d'une période d'horaires sur l'année suivante (ADR 0004).
//
// Ces tests ne touchent pas la base : `datesAnneeSuivante` est de l'arithmétique de dates, et c'est
// à ce niveau que la jointivité se prouve. Le parcours de bout en bout — le bouton, l'écriture, la
// contrainte d'exclusion de PostgreSQL — est éprouvé dans `tests/prieres.test.ts`.

import { describe, expect, it } from 'vitest';
import { addDays, type IsoDate } from '@jadwal/core';
import { datesAnneeSuivante } from './prieres.js';

/** Une année découpée en douze périodes mensuelles jointives, du 1er janvier au 31 décembre. */
function moisDe(annee: number): { de: IsoDate; a: IsoDate }[] {
	const periodes: { de: IsoDate; a: IsoDate }[] = [];
	for (let mois = 1; mois <= 12; mois += 1) {
		const de = `${annee}-${String(mois).padStart(2, '0')}-01` as IsoDate;
		const premierDuSuivant =
			mois === 12
				? (`${annee + 1}-01-01` as IsoDate)
				: (`${annee}-${String(mois + 1).padStart(2, '0')}-01` as IsoDate);
		periodes.push({ de, a: addDays(premierDuSuivant, -1) });
	}
	return periodes;
}

describe('datesAnneeSuivante', () => {
	it('garde le mois et le jour, et change seulement l’année', () => {
		expect(datesAnneeSuivante('2027-03-01', '2027-03-31')).toEqual({
			fromDate: '2028-03-01',
			toDate: '2028-03-31'
		});
		expect(datesAnneeSuivante('2027-02-08', '2027-03-09')).toEqual({
			fromDate: '2028-02-08',
			toDate: '2028-03-09'
		});
	});

	it('étend la période d’hiver au 29 février quand l’année d’arrivée est bissextile', () => {
		// 2027 est commune, 2028 est bissextile. Sans ce report, le 29 février 2028 ne serait
		// couvert par aucune période, et la mosquée n’aurait pas d’horaire ce jour-là.
		expect(datesAnneeSuivante('2027-01-01', '2027-02-28')).toEqual({
			fromDate: '2028-01-01',
			toDate: '2028-02-29'
		});
		expect(datesAnneeSuivante('2027-03-01', '2027-12-31')).toEqual({
			fromDate: '2028-03-01',
			toDate: '2028-12-31'
		});
	});

	it('resserre la période d’hiver au 28 février quand l’année d’arrivée est commune', () => {
		// 2028 est bissextile, 2029 est commune : le jour en trop disparaît, sans chevauchement.
		expect(datesAnneeSuivante('2028-01-01', '2028-02-29')).toEqual({
			fromDate: '2029-01-01',
			toDate: '2029-02-28'
		});
		expect(datesAnneeSuivante('2028-03-01', '2028-12-31')).toEqual({
			fromDate: '2029-03-01',
			toDate: '2029-12-31'
		});
	});

	it('laisse une période sans date de fin sans date de fin', () => {
		expect(datesAnneeSuivante('2027-05-01', null)).toEqual({
			fromDate: '2028-05-01',
			toDate: null
		});
	});

	it('refuse la période réduite au seul 29 février quand l’année suivante n’en a pas', () => {
		expect(datesAnneeSuivante('2028-02-29', '2028-02-29')).toBeNull();
	});

	it('reporte le 29 février au 1er mars quand il ouvre une période plus longue', () => {
		expect(datesAnneeSuivante('2028-02-29', '2028-03-15')).toEqual({
			fromDate: '2029-03-01',
			toDate: '2029-03-15'
		});
	});

	it('pave l’année d’arrivée sans trou ni chevauchement, sur vingt ans', () => {
		// La vraie propriété, et la seule qui compte pour une mosquée : ce qui couvrait une année
		// entière couvre encore l'année entière, bissextile ou non, siècle non bissextile compris.
		for (const annee of [...Array.from({ length: 21 }, (_, pas) => 2024 + pas), 2099, 2100]) {
			const copies = moisDe(annee).map((periode) => {
				const copie = datesAnneeSuivante(periode.de, periode.a);
				expect(copie, `${periode.de} → ${periode.a}`).not.toBeNull();
				return copie as { fromDate: IsoDate; toDate: IsoDate };
			});

			expect(copies[0]?.fromDate, `début de ${annee + 1}`).toBe(`${annee + 1}-01-01`);
			expect(copies.at(-1)?.toDate, `fin de ${annee + 1}`).toBe(`${annee + 1}-12-31`);
			for (let index = 1; index < copies.length; index += 1) {
				const avant = copies[index - 1] as { toDate: IsoDate };
				const apres = copies[index] as { fromDate: IsoDate };
				expect(addDays(avant.toDate, 1), `jointure ${index} de ${annee + 1}`).toBe(apres.fromDate);
			}
		}
	});
});

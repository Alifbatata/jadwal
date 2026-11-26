// La prochaine prière de la vue « Aujourd'hui » (étape 24, docs/maquettes/public-aujourdhui.md) :
// la première dont l'adhan n'est pas encore passé, la prière du vendredi tant qu'une session reste
// à venir, le Fajr du lendemain après l'Isha, et rien quand aucune heure n'est connue.

import { describe, expect, it } from 'vitest';
import { prochainePriere, premierJourSuivant } from './aujourdhui.js';

const HEURES = [
	{ priere: 'fajr', adhan: '05:30', iqama: '05:50' },
	{ priere: 'dhuhr', adhan: '13:05', iqama: '13:15' },
	{ priere: 'asr', adhan: '16:30', iqama: null },
	{ priere: 'maghrib', adhan: '19:10', iqama: '19:15' },
	{ priere: 'isha', adhan: '20:40', iqama: '20:55' }
];
const DEMAIN = [{ priere: 'fajr', adhan: '05:32', iqama: '05:50' }, ...HEURES.slice(1)];
const a = (heure: string) => Number(heure.slice(0, 2)) * 60 + Number(heure.slice(3, 5));

describe('la prochaine prière', () => {
	it('is the first prayer whose adhan has not passed yet, with its iqama', () => {
		expect(
			prochainePriere({ maintenant: a('10:00'), heures: HEURES, vendredi: [], demain: DEMAIN })
		).toEqual({ genre: 'priere', priere: 'dhuhr', adhan: '13:05', iqama: '13:15' });
		expect(
			prochainePriere({ maintenant: a('00:00'), heures: HEURES, vendredi: [], demain: DEMAIN })
		).toEqual({ genre: 'priere', priere: 'fajr', adhan: '05:30', iqama: '05:50' });
	});

	it('gives no iqama where the organisation set none', () => {
		expect(
			prochainePriere({ maintenant: a('14:00'), heures: HEURES, vendredi: [], demain: DEMAIN })
		).toEqual({ genre: 'priere', priere: 'asr', adhan: '16:30', iqama: null });
	});

	it('counts an adhan as passed from its own minute on', () => {
		expect(
			prochainePriere({ maintenant: a('13:04'), heures: HEURES, vendredi: [], demain: DEMAIN })
		).toMatchObject({ priere: 'dhuhr' });
		expect(
			prochainePriere({ maintenant: a('13:05'), heures: HEURES, vendredi: [], demain: DEMAIN })
		).toMatchObject({ priere: 'asr' });
	});

	it('is the Friday prayer while a session is still to come, and names only those left', () => {
		const vendredi = ['12:30', '13:45'];
		expect(
			prochainePriere({ maintenant: a('10:00'), heures: HEURES, vendredi, demain: DEMAIN })
		).toEqual({ genre: 'jumua', heures: ['12:30', '13:45'] });
		// La première session a commencé, avant même l'adhan du Dhuhr : la seconde reste.
		expect(
			prochainePriere({ maintenant: a('12:30'), heures: HEURES, vendredi, demain: DEMAIN })
		).toEqual({ genre: 'jumua', heures: ['13:45'] });
	});

	it('moves on to the Asr once the last Friday session has started, never back to the Dhuhr', () => {
		// 13:00 : l'adhan du Dhuhr, 13:05, n'est pas passé, mais ce vendredi le Dhuhr est la prière du
		// vendredi, dont la seule session a commencé.
		expect(
			prochainePriere({
				maintenant: a('13:00'),
				heures: HEURES,
				vendredi: ['12:30'],
				demain: DEMAIN
			})
		).toEqual({ genre: 'priere', priere: 'asr', adhan: '16:30', iqama: null });
	});

	it('still gives the Fajr before the Friday prayer, early on a Friday', () => {
		expect(
			prochainePriere({
				maintenant: a('04:00'),
				heures: HEURES,
				vendredi: ['12:30'],
				demain: DEMAIN
			})
		).toMatchObject({ genre: 'priere', priere: 'fajr' });
	});

	it('is the Fajr of the next day after the Isha', () => {
		expect(
			prochainePriere({ maintenant: a('21:30'), heures: HEURES, vendredi: [], demain: DEMAIN })
		).toEqual({ genre: 'demain', priere: 'fajr', adhan: '05:32' });
	});

	it('is nothing after the Isha when the next day has no time', () => {
		expect(
			prochainePriere({ maintenant: a('21:30'), heures: HEURES, vendredi: [], demain: null })
		).toBeNull();
		expect(
			prochainePriere({
				maintenant: a('21:30'),
				heures: HEURES,
				vendredi: [],
				demain: [{ priere: 'fajr', adhan: null, iqama: null }]
			})
		).toBeNull();
	});

	it('skips a prayer whose time is not known', () => {
		const heures = [{ priere: 'fajr', adhan: null, iqama: null }, ...HEURES.slice(1)];
		expect(
			prochainePriere({ maintenant: a('04:00'), heures, vendredi: [], demain: DEMAIN })
		).toMatchObject({ priere: 'dhuhr' });
	});

	it('is nothing when no time is known at all', () => {
		expect(prochainePriere({ maintenant: 600, heures: [], vendredi: [], demain: null })).toBeNull();
	});
});

describe('le premier jour suivant qui a des séances', () => {
	const seance = (date: string, status = 'scheduled') => ({ date, status });

	it('is the first later day with a session that takes place', () => {
		expect(
			premierJourSuivant('2026-10-09', [
				seance('2026-10-09'),
				seance('2026-10-11'),
				seance('2026-10-10')
			])
		).toBe('2026-10-10');
	});

	it('does not count a day whose only sessions are cancelled or moved away', () => {
		expect(
			premierJourSuivant('2026-10-09', [
				seance('2026-10-10', 'cancelled'),
				seance('2026-10-11', 'moved_away'),
				seance('2026-10-12', 'moved_here')
			])
		).toBe('2026-10-12');
	});

	it('is nothing when no later day has a session', () => {
		expect(premierJourSuivant('2026-10-09', [seance('2026-10-09')])).toBeNull();
		expect(premierJourSuivant('2026-10-09', [])).toBeNull();
	});
});

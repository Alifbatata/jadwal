// Lire le formulaire d'un cours côté serveur (étape 18, retours C3, B1 et A3) : des minutes toujours
// positives, avant ou après une prière, un décalage signé pour la base, des dates écrites comme en
// Suisse, et une erreur nommée par champ.

import { describe, expect, it } from 'vitest';
import { readCourseForm } from './course-form.js';

const LANGUES = ['fr', 'de', 'ar'];

function formulaire(champs: Record<string, string | string[]>): FormData {
	const form = new FormData();
	for (const [nom, valeur] of Object.entries(champs)) {
		for (const une of Array.isArray(valeur) ? valeur : [valeur]) form.append(nom, une);
	}
	return form;
}

const BASE = {
	sourceLanguage: 'fr',
	'title.fr': 'Tafsir du soir',
	audience: 'adults',
	teachingLanguages: ['fr', 'ar'],
	recurrenceKind: 'weekly',
	weekdays: ['1', '3'],
	interval: '1',
	startsOn: '2026-09-07',
	status: 'draft'
};

function ancre(choix: string, minutes: string, duree = '60') {
	return formulaire({
		...BASE,
		timingKind: choix,
		prayer: 'maghrib',
		offsetMinutes: minutes,
		durationMinutes: duree
	});
}

describe('l’horaire par rapport à une prière (C3)', () => {
	it.each([
		['beforePrayer', '10', -10],
		['beforePrayer', '1', -1],
		['beforePrayer', '120', -120],
		['prayer', '0', 0],
		['prayer', '15', 15],
		['prayer', '240', 240]
	])('stores %s with %s minutes as %i', (choix, minutes, attendu) => {
		const lu = readCourseForm(ancre(choix, minutes), LANGUES);
		expect(lu.ok && lu.values.timing).toEqual({
			kind: 'prayer',
			prayer: 'maghrib',
			offsetMinutes: attendu,
			durationMinutes: 60
		});
	});

	it.each([
		['beforePrayer', '-10', 'minutesBefore'],
		['beforePrayer', '0', 'minutesBefore'],
		['beforePrayer', '121', 'minutesBefore'],
		['beforePrayer', '', 'minutesBefore'],
		['prayer', '-5', 'minutesAfter'],
		['prayer', '241', 'minutesAfter'],
		['prayer', '1.5', 'minutesAfter'],
		['prayer', 'dix', 'minutesAfter']
	])('refuses %s with « %s » minutes: %s', (choix, minutes, erreur) => {
		const lu = readCourseForm(ancre(choix, minutes), LANGUES);
		expect(lu.ok ? [] : lu.errors).toEqual([erreur]);
	});

	it.each(['4', '1441', '', 'une heure'])('refuses a duration of « %s » minutes', (duree) => {
		const lu = readCourseForm(ancre('prayer', '15', duree), LANGUES);
		expect(lu.ok ? [] : lu.errors).toEqual(['duration']);
	});
});

describe('les dates d’un cours à dates précises (A3)', () => {
	function aDates(dates: string) {
		return formulaire({
			...BASE,
			recurrenceKind: 'dates',
			dates,
			timingKind: 'fixed',
			start: '10:00',
			end: '11:30'
		});
	}

	it('reads them as JJ.MM.AAAA, and still as the base writes them', () => {
		const lu = readCourseForm(aDates('12.10.2026\n2026-10-26'), LANGUES);
		expect(lu.ok && lu.values.recurrence).toEqual({
			kind: 'dates',
			dates: ['2026-10-12', '2026-10-26']
		});
	});

	it('names the dates it cannot read, as they were written', () => {
		const lu = readCourseForm(aDates('12.10.2026\n31.02.2026 le 3 mars'), LANGUES);
		expect(lu.ok).toBe(false);
		if (lu.ok) return;
		expect(lu.errors).toEqual(['badDates']);
		expect(lu.badDates).toEqual(['31.02.2026', 'le', '3', 'mars']);
	});

	it('says when there is none, or one twice', () => {
		const vide = readCourseForm(aDates('  '), LANGUES);
		expect(vide.ok ? [] : vide.errors).toEqual(['datesMissing']);
		const double = readCourseForm(aDates('12.10.2026 2026-10-12'), LANGUES);
		expect(double.ok ? [] : double.errors).toEqual(['datesTwice']);
	});
});

describe('les erreurs, champ par champ (B1)', () => {
	it('names each field to correct, in the order of the form', () => {
		const lu = readCourseForm(
			formulaire({
				sourceLanguage: 'fr',
				'title.fr': ' ',
				recurrenceKind: 'weekly',
				timingKind: 'fixed',
				start: '',
				end: '20:00',
				startsOn: '2026-10-06',
				endsOn: '2026-10-01'
			}),
			LANGUES
		);
		// Le titre, la langue d'enseignement, les jours, l'horaire, puis la période : l'ordre des
		// cadres du formulaire, de haut en bas.
		expect(lu.ok ? [] : lu.errors).toEqual([
			'titleMissing',
			'teachingMissing',
			'weekdaysMissing',
			'timeMissing',
			'endsBeforeStarts'
		]);
	});

	it('puts the dates it cannot read at the place of the dates', () => {
		const lu = readCourseForm(
			formulaire({
				...BASE,
				'title.fr': '',
				recurrenceKind: 'dates',
				dates: '31.02.2026',
				timingKind: 'fixed',
				start: '',
				end: ''
			}),
			LANGUES
		);
		expect(lu.ok ? [] : lu.errors).toEqual(['titleMissing', 'badDates', 'timeMissing']);
	});

	it('asks for a teaching language rather than choosing one in silence', () => {
		const lu = readCourseForm(
			formulaire({
				...BASE,
				teachingLanguages: [],
				timingKind: 'fixed',
				start: '19:00',
				end: '20:00'
			}),
			LANGUES
		);
		expect(lu.ok ? [] : lu.errors).toEqual(['teachingMissing']);
	});

	it('asks for the first day', () => {
		const lu = readCourseForm(
			formulaire({ ...BASE, startsOn: '', timingKind: 'fixed', start: '19:00', end: '20:00' }),
			LANGUES
		);
		expect(lu.ok ? [] : lu.errors).toEqual(['startsOnMissing']);
	});

	it('refuses, without saying more, what the form cannot send', () => {
		for (const trafique of [
			{ sourceLanguage: 'es' },
			{ audience: 'tout le monde' },
			{ prayer: 'duha' }
		]) {
			const lu = readCourseForm(
				formulaire({
					...BASE,
					timingKind: 'prayer',
					prayer: 'maghrib',
					offsetMinutes: '15',
					durationMinutes: '60',
					...trafique
				}),
				LANGUES
			);
			expect(lu.ok ? [] : lu.errors, JSON.stringify(trafique)).toEqual(['refused']);
		}
	});

	it('gives back what was sent, to show it again', () => {
		const lu = readCourseForm(
			formulaire({
				...BASE,
				weekdays: [],
				teachingLanguages: [],
				teacher: 'Fatima Keller',
				timingKind: 'beforePrayer',
				prayer: 'isha',
				offsetMinutes: '10',
				durationMinutes: '90'
			}),
			LANGUES
		);
		expect(lu.ok).toBe(false);
		if (lu.ok) return;
		expect(lu.values).toMatchObject({
			titles: { fr: 'Tafsir du soir', de: '', ar: '' },
			weekdays: [],
			teachingLanguages: [],
			teacher: 'Fatima Keller',
			timingKind: 'beforePrayer',
			prayer: 'isha',
			offsetMinutes: 10,
			durationMinutes: 90,
			startsOn: '2026-09-07'
		});
	});
});

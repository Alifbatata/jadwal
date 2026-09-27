// Lire le formulaire d'un cours côté serveur (étape 18, retours C3, B1 et A3) : des minutes toujours
// positives, avant ou après une prière, un décalage signé pour la base, des dates écrites comme en
// Suisse, et une erreur nommée par champ.

import { describe, expect, it } from 'vitest';
import { isoDateToDays, ruleDays, type IsoDate } from '@jadwal/core';
import { readCourseForm } from './course-form.js';

const LANGUES = ['fr', 'de', 'ar'];
/** Les salles de l'organisation, par leur identifiant. */
const SALLES = ['0199a5f0-0000-7000-8000-000000000001'];

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
		const lu = readCourseForm(ancre(choix, minutes), LANGUES, SALLES);
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
		const lu = readCourseForm(ancre(choix, minutes), LANGUES, SALLES);
		expect(lu.ok ? [] : lu.errors).toEqual([erreur]);
	});

	it.each(['4', '1441', '', 'une heure'])('refuses a duration of « %s » minutes', (duree) => {
		const lu = readCourseForm(ancre('prayer', '15', duree), LANGUES, SALLES);
		expect(lu.ok ? [] : lu.errors).toEqual(['duration']);
	});
});

describe('les dates d’un cours à dates précises (A3)', () => {
	function aDates(dates: string, periode: { startsOn?: string; endsOn?: string } = {}) {
		return formulaire({
			...BASE,
			recurrenceKind: 'dates',
			dates,
			timingKind: 'fixed',
			start: '10:00',
			end: '11:30',
			...periode
		});
	}

	it('takes the first date as the first day when the first day arrives empty (étape 19, lot 2)', () => {
		// Sans JavaScript, le premier jour ne s'est pas rempli pendant la saisie : le serveur le fait.
		const lu = readCourseForm(
			aDates('26.10.2026\n12.10.2026 05.11.2026', { startsOn: '' }),
			LANGUES,
			SALLES
		);
		expect(lu.ok && lu.values.startsOn).toBe('2026-10-12');
		expect(lu.ok && lu.values.recurrence).toEqual({
			kind: 'dates',
			dates: ['2026-10-12', '2026-10-26', '2026-11-05']
		});
		// Refusé pour une autre raison, le formulaire revient avec ce premier jour, que le résumé montre.
		const refuse = readCourseForm(
			formulaire({
				...BASE,
				'title.fr': '',
				recurrenceKind: 'dates',
				dates: '26.10.2026\n12.10.2026',
				timingKind: 'fixed',
				start: '10:00',
				end: '11:30',
				startsOn: ''
			}),
			LANGUES,
			SALLES
		);
		expect(refuse.ok ? [] : refuse.errors).toEqual(['titleMissing']);
		expect(refuse.ok ? '' : refuse.values.startsOn).toBe('2026-10-12');
	});

	it('stores the dates in the order of the calendar, whatever the order they were written in', () => {
		// La base gardait l'ordre de la saisie : la liste et le message « nouveau cours », qui en
		// montrent trois, taisaient alors la première séance (relecture du lot 2 de l'étape 19).
		const lu = readCourseForm(
			aDates('26.10.2026\n02.11.2026 09.11.2026\n12.10.2026', { startsOn: '2026-10-12' }),
			LANGUES,
			SALLES
		);
		expect(lu.ok && lu.values.recurrence).toEqual({
			kind: 'dates',
			dates: ['2026-10-12', '2026-10-26', '2026-11-02', '2026-11-09']
		});
	});

	it('keeps a first day that was chosen, and asks for one when no date can be read', () => {
		const choisi = readCourseForm(
			aDates('26.10.2026\n12.10.2026', { startsOn: '2026-10-01' }),
			LANGUES,
			SALLES
		);
		expect(choisi.ok && choisi.values.startsOn).toBe('2026-10-01');
		const illisibles = readCourseForm(aDates('31.02.2026', { startsOn: '' }), LANGUES, SALLES);
		expect(illisibles.ok ? [] : illisibles.errors).toEqual(['badDates', 'startsOnMissing']);
		// Un cours chaque semaine ne prend rien de ses dates : il n'en a pas.
		const hebdomadaire = readCourseForm(
			formulaire({
				...BASE,
				dates: '12.10.2026',
				timingKind: 'fixed',
				start: '19:00',
				end: '20:00',
				startsOn: ''
			}),
			LANGUES,
			SALLES
		);
		expect(hebdomadaire.ok ? [] : hebdomadaire.errors).toEqual(['startsOnMissing']);
	});

	it('refuses the dates before the first day, and names them', () => {
		const lu = readCourseForm(
			aDates('26.10.2026\n12.10.2026 05.11.2026', { startsOn: '2026-11-01' }),
			LANGUES,
			SALLES
		);
		expect(lu.ok).toBe(false);
		if (lu.ok) return;
		expect(lu.errors).toEqual(['datesBeforeStart']);
		expect(lu.datesBefore).toEqual(['2026-10-12', '2026-10-26']);
		expect(lu.datesAfter).toEqual([]);
	});

	it('refuses the dates after the last day, and names them', () => {
		const lu = readCourseForm(
			aDates('12.10.2026 26.10.2026 09.11.2026', { startsOn: '2026-10-01', endsOn: '2026-10-20' }),
			LANGUES,
			SALLES
		);
		expect(lu.ok).toBe(false);
		if (lu.ok) return;
		expect(lu.errors).toEqual(['datesAfterEnd']);
		expect(lu.datesBefore).toEqual([]);
		expect(lu.datesAfter).toEqual(['2026-10-26', '2026-11-09']);
	});

	it('accepts a date exactly when the engine publishes it: the first and the last day included', () => {
		// Le moteur (`courseWindow` dans packages/core/src/expand.ts) ne publie que les dates du
		// premier au dernier jour, les deux compris : le formulaire refuse les autres, et elles seules.
		const periode = { startsOn: '2026-10-12', endsOn: '2026-10-26' } as const;
		const attendu = {
			'2026-10-11': false,
			'2026-10-12': true,
			'2026-10-19': true,
			'2026-10-26': true,
			'2026-10-27': false
		} as const;
		for (const [date, accepte] of Object.entries(attendu)) {
			const publiees = ruleDays(
				{
					id: 'verification',
					recurrence: { kind: 'dates', dates: [date as IsoDate] },
					timing: { kind: 'fixed', start: '10:00', end: '11:30' },
					sequence: 0,
					...periode
				},
				isoDateToDays('2026-01-01'),
				isoDateToDays('2026-12-31')
			);
			expect(publiees.length === 1, `le moteur, ${date}`).toBe(accepte);
			const commeEnSuisse = date.split('-').reverse().join('.');
			const lu = readCourseForm(aDates(commeEnSuisse, periode), LANGUES, SALLES);
			expect(lu.ok, `le formulaire, ${commeEnSuisse}`).toBe(accepte);
		}
	});

	it('does not judge the dates against a period that is itself to correct', () => {
		const lu = readCourseForm(
			aDates('12.10.2026', { startsOn: '2026-11-01', endsOn: '2026-10-01' }),
			LANGUES,
			SALLES
		);
		expect(lu.ok ? [] : lu.errors).toEqual(['endsBeforeStarts']);
	});

	it('reads them as JJ.MM.AAAA, and still as the base writes them', () => {
		const lu = readCourseForm(aDates('12.10.2026\n2026-10-26'), LANGUES, SALLES);
		expect(lu.ok && lu.values.recurrence).toEqual({
			kind: 'dates',
			dates: ['2026-10-12', '2026-10-26']
		});
	});

	it('names the dates it cannot read, as they were written', () => {
		const lu = readCourseForm(aDates('12.10.2026\n31.02.2026 le 3 mars'), LANGUES, SALLES);
		expect(lu.ok).toBe(false);
		if (lu.ok) return;
		expect(lu.errors).toEqual(['badDates']);
		expect(lu.badDates).toEqual(['31.02.2026', 'le', '3', 'mars']);
	});

	it('says when there is none, or one twice', () => {
		const vide = readCourseForm(aDates('  '), LANGUES, SALLES);
		expect(vide.ok ? [] : vide.errors).toEqual(['datesMissing']);
		const double = readCourseForm(aDates('12.10.2026 2026-10-12'), LANGUES, SALLES);
		expect(double.ok ? [] : double.errors).toEqual(['datesTwice']);
	});
});

describe('une description sans titre dans sa langue (B4)', () => {
	function avecTextes(textes: Record<string, string>) {
		return formulaire({ ...BASE, timingKind: 'fixed', start: '19:00', end: '20:00', ...textes });
	}

	it('refuses it rather than losing it in silence, and names each language', () => {
		const lu = readCourseForm(
			avecTextes({ 'description.ar': 'قراءة مع شرح.', 'description.de': 'Für Erwachsene.' }),
			LANGUES,
			SALLES
		);
		expect(lu.ok).toBe(false);
		if (lu.ok) return;
		expect(lu.errors).toEqual(['descriptionWithoutTitle']);
		// Dans l'ordre des langues de l'organisation, celui des onglets.
		expect(lu.untitledDescriptions).toEqual(['de', 'ar']);
		// Le formulaire revient avec ce qui a été écrit : rien n'est à retaper.
		expect(lu.values.descriptions).toMatchObject({ de: 'Für Erwachsene.', ar: 'قراءة مع شرح.' });
	});

	it('keeps it with its title, and ignores a description of blanks', () => {
		const avecTitre = readCourseForm(
			avecTextes({ 'title.de': 'Tafsir am Abend', 'description.de': 'Für Erwachsene.' }),
			LANGUES,
			SALLES
		);
		expect(avecTitre.ok && avecTitre.values.translations.get('de')).toEqual({
			title: 'Tafsir am Abend',
			description: 'Für Erwachsene.'
		});
		const blancs = readCourseForm(avecTextes({ 'description.de': '  \n ' }), LANGUES, SALLES);
		expect(blancs.ok).toBe(true);
	});

	it('says only the missing title in the input language, in the order of the form', () => {
		// Sans titre dans la langue de saisie, c'est ce titre qui manque, et il est déjà demandé.
		const lu = readCourseForm(
			formulaire({
				...BASE,
				'title.fr': '',
				'description.fr': 'Lecture commentée.',
				'description.de': 'Für Erwachsene.',
				teachingLanguages: [],
				timingKind: 'fixed',
				start: '19:00',
				end: '20:00'
			}),
			LANGUES,
			SALLES
		);
		expect(lu.ok ? [] : lu.errors).toEqual([
			'titleMissing',
			'descriptionWithoutTitle',
			'teachingMissing'
		]);
		expect(lu.ok ? [] : lu.untitledDescriptions).toEqual(['de']);
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
			LANGUES,
			SALLES
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
			LANGUES,
			SALLES
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
			LANGUES,
			SALLES
		);
		expect(lu.ok ? [] : lu.errors).toEqual(['teachingMissing']);
	});

	it('asks for the first day', () => {
		const lu = readCourseForm(
			formulaire({ ...BASE, startsOn: '', timingKind: 'fixed', start: '19:00', end: '20:00' }),
			LANGUES,
			SALLES
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
				LANGUES,
				SALLES
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
			LANGUES,
			SALLES
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

describe('ce que la base refusait par une erreur 500 (étape 19, lot 2)', () => {
	const FIXE = { ...BASE, timingKind: 'fixed', start: '19:00', end: '20:00' };

	it.each(['0000-01-01', '1969-12-31', '2101-01-01', '2026-02-31', ''])(
		'asks for the first day when it is « %s »',
		(startsOn) => {
			const lu = readCourseForm(formulaire({ ...FIXE, startsOn }), LANGUES, SALLES);
			expect(lu.ok ? [] : lu.errors).toEqual(['startsOnMissing']);
		}
	);

	it.each(['9999-12-31', '0000-06-01', '2101-01-01', '2026-02-31', 'demain'])(
		'refuses the last day « %s », which the agenda feed or the base cannot take',
		(endsOn) => {
			const lu = readCourseForm(formulaire({ ...FIXE, endsOn }), LANGUES, SALLES);
			expect(lu.ok ? [] : lu.errors).toEqual(['endsOnUnreadable']);
		}
	);

	it('accepts the first and the last date the service handles', () => {
		const lu = readCourseForm(
			formulaire({ ...FIXE, startsOn: '1970-01-01', endsOn: '2100-12-31' }),
			LANGUES,
			SALLES
		);
		expect(lu.ok && [lu.values.startsOn, lu.values.endsOn]).toEqual(['1970-01-01', '2100-12-31']);
	});

	it('names a date outside 1970 to 2100 among the dates it cannot read', () => {
		const lu = readCourseForm(
			formulaire({
				...FIXE,
				recurrenceKind: 'dates',
				dates: '12.10.2026\n31.12.9999\n01.01.0000\n31.12.1969',
				startsOn: '2026-10-01'
			}),
			LANGUES,
			SALLES
		);
		expect(lu.ok).toBe(false);
		if (lu.ok) return;
		expect(lu.errors).toEqual(['badDates']);
		expect(lu.badDates).toEqual(['31.12.9999', '01.01.0000', '31.12.1969']);
		expect(lu.datesBefore).toEqual([]);
	});

	it('drops the null character from every field, and keeps the rest', () => {
		const lu = readCourseForm(
			formulaire({
				...FIXE,
				'title.fr': 'Caractère\u0000 nul',
				'description.fr': 'Pour\u0000 tous.',
				teacher: 'Imam\u0000 Karim',
				recurrenceKind: 'dates',
				dates: '12.10.2026\u0000',
				startsOn: '2026-10-01'
			}),
			LANGUES,
			SALLES
		);
		expect(lu.ok && lu.values.title).toBe('Caractère nul');
		expect(lu.ok && lu.values.teacher).toBe('Imam Karim');
		expect(lu.ok && lu.values.translations.get('fr')).toEqual({
			title: 'Caractère nul',
			description: 'Pour tous.'
		});
		expect(lu.ok && lu.values.recurrence).toEqual({ kind: 'dates', dates: ['2026-10-12'] });
	});

	it('refuses a room that is not one of the organisation, and keeps one that is', () => {
		for (const roomId of ['pas-une-salle', '0199a5f0-0000-7000-8000-000000000002']) {
			const lu = readCourseForm(formulaire({ ...FIXE, roomId }), LANGUES, SALLES);
			expect(lu.ok ? [] : lu.errors, roomId).toEqual(['roomGone']);
		}
		const salle = readCourseForm(formulaire({ ...FIXE, roomId: SALLES[0] ?? '' }), LANGUES, SALLES);
		expect(salle.ok && salle.values.roomId).toBe(SALLES[0]);
	});
});

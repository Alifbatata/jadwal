// Le formulaire d'un cours, sans serveur : les dates telles qu'on les écrit, l'horaire avant ou après
// une prière, et le résumé de ce qui sera publié (étape 18, retours B4, C3 et A3).

import { describe, expect, it } from 'vitest';
import {
	readDate,
	signedOffset,
	summarise,
	timingChoice,
	writeDates,
	type CourseFormValues
} from './course-form.js';

const COMPLET: CourseFormValues = {
	status: 'published',
	audience: 'adults',
	teachingLanguages: ['fr', 'ar'],
	sourceLanguage: 'fr',
	roomId: 'salle',
	teacher: 'Imam Karim Haddad',
	startsOn: '2026-09-07',
	endsOn: '2026-12-20',
	recurrenceKind: 'weekly',
	weekdays: [1, 3],
	interval: 2,
	monthlyWeekday: 1,
	monthlyOrdinal: 1,
	dates: '',
	timingKind: 'beforePrayer',
	start: '19:00',
	end: '20:30',
	prayer: 'maghrib',
	offsetMinutes: 10,
	durationMinutes: 60,
	titles: { fr: 'Tafsir du soir', de: '', ar: 'تفسير المساء' },
	descriptions: { fr: 'Lecture commentée, pour adultes.', de: '', ar: '' }
};

const CONTEXTE = { languages: ['fr', 'de', 'ar'], rooms: [{ id: 'salle', name: 'Grande salle' }] };

function lignes(values: CourseFormValues, langue: Parameters<typeof summarise>[2] = 'fr') {
	return summarise(values, CONTEXTE, langue).map((row) => `${row.label} ${row.value}`);
}

describe('les dates telles qu’on les écrit', () => {
	it.each([
		['12.10.2026', '2026-10-12'],
		['1.2.2026', '2026-02-01'],
		['2026-10-12', '2026-10-12'],
		[' 26.10.2026 ', '2026-10-26']
	])('reads « %s » as %s', (texte, attendu) => {
		expect(readDate(texte)).toBe(attendu);
	});

	it.each(['31.02.2026', '12/10/2026', '12.10.26', '2026-13-01', 'demain', ''])(
		'refuses « %s »',
		(texte) => {
			expect(readDate(texte)).toBeNull();
		}
	);

	it('writes them back as JJ.MM.AAAA, one per line', () => {
		expect(writeDates(['2026-10-12', '2026-10-26'])).toBe('12.10.2026\n26.10.2026');
	});
});

describe('l’horaire par rapport à une prière (C3)', () => {
	it.each([
		['prayer', -10, 'beforePrayer', 10],
		['prayer', -120, 'beforePrayer', 120],
		['prayer', 0, 'prayer', 0],
		['prayer', 30, 'prayer', 30],
		['fixed', null, 'fixed', 15]
	] as const)('opens %s at %s as %s and %i minutes', (kind, offset, choix, minutes) => {
		expect(timingChoice(kind, offset)).toEqual({ timingKind: choix, offsetMinutes: minutes });
	});

	it('gives the base a negative offset before a prayer, a positive one after', () => {
		expect(signedOffset('beforePrayer', 10)).toBe(-10);
		expect(signedOffset('prayer', 10)).toBe(10);
		expect(signedOffset('prayer', 0)).toBe(0);
	});
});

describe('le résumé de ce qui sera publié (B4)', () => {
	it('takes up every published field, the title and the description in each language filled in', () => {
		expect(lignes(COMPLET)).toEqual([
			'Titre en français : Tafsir du soir',
			'Description en français : Lecture commentée, pour adultes.',
			'Titre en arabe : تفسير المساء',
			'Public : adultes',
			'Jours : lundi et mercredi',
			'Fréquence : une semaine sur deux',
			'Horaire : 10 min avant Maghrib, pendant 1 h',
			'Salle : Grande salle',
			'Intervenant : Imam Karim Haddad',
			'Langue d’enseignement : français et arabe',
			'Premier jour : lundi 07.09.2026',
			'Dernier jour : dimanche 20.12.2026',
			'État : publié, visible sur la page publique'
		]);
	});

	it('marks what is missing, and only that', () => {
		const rows = summarise(
			{
				...COMPLET,
				titles: { fr: '', de: '', ar: '' },
				weekdays: [],
				roomId: null,
				teacher: '  ',
				teachingLanguages: [],
				startsOn: '',
				endsOn: null
			},
			CONTEXTE,
			'fr'
		);
		expect(rows.filter((row) => row.missing).map((row) => `${row.label} ${row.value}`)).toEqual([
			'Titre en français : pas encore écrit',
			'Jours : pas choisis',
			'Salle : pas choisie',
			'Intervenant : aucun pour l’instant',
			'Langue d’enseignement : pas choisie',
			'Premier jour : pas choisi'
		]);
		// Pas de dernier jour : la ligne n'existe pas, puisqu'il n'y en a pas.
		expect(rows.map((row) => row.key)).not.toContain('endsOn');
	});

	it('says a description is published only with a title in its language', () => {
		// `parseCourseForm` ne garde la traduction d'une langue qu'avec son titre : une description
		// seule n'est pas publiée, et le résumé le dit au lieu de la montrer comme publiée.
		const rows = summarise(
			{ ...COMPLET, descriptions: { fr: ' ', de: 'Für Erwachsene.', ar: 'قراءة مع شرح.' } },
			CONTEXTE,
			'fr'
		);
		expect(rows.slice(0, 4).map((row) => `${row.label} ${row.value}`)).toEqual([
			'Titre en français : Tafsir du soir',
			'Description en allemand : pas publiée sans titre en allemand',
			'Titre en arabe : تفسير المساء',
			'Description en arabe : قراءة مع شرح.'
		]);
		expect(rows.filter((row) => row.missing).map((row) => row.key)).toEqual(['description-de']);
	});

	it('puts the title of the input language first', () => {
		expect(lignes({ ...COMPLET, sourceLanguage: 'ar' }).slice(0, 2)).toEqual([
			'Titre en arabe : تفسير المساء',
			'Titre en français : Tafsir du soir'
		]);
	});

	it('says an offset after a prayer, and a time that is not complete yet', () => {
		expect(lignes({ ...COMPLET, timingKind: 'prayer', offsetMinutes: 15 })).toContain(
			'Horaire : 15 min après Maghrib, pendant 1 h'
		);
		expect(lignes({ ...COMPLET, timingKind: 'prayer', offsetMinutes: 0 })).toContain(
			'Horaire : après Maghrib, pendant 1 h'
		);
		for (const incomplet of [
			{ offsetMinutes: null },
			{ durationMinutes: null },
			{ timingKind: 'beforePrayer', offsetMinutes: 0 },
			{ timingKind: 'fixed', start: '' }
		] as const) {
			expect(lignes({ ...COMPLET, ...incomplet }), JSON.stringify(incomplet)).toContain(
				'Horaire : à indiquer'
			);
		}
	});

	it('shows the dates of a course at specific dates, and those it cannot read', () => {
		const rows = lignes({
			...COMPLET,
			recurrenceKind: 'dates',
			dates: '26.10.2026\n12.10.2026 32.13.2026'
		});
		expect(rows).toContain('Dates : lundi 12.10.2026 et lundi 26.10.2026');
		expect(rows).toContain('Dates à corriger : 32.13.2026');
		expect(rows).toContain('Fréquence : à des dates précises');
		expect(lignes({ ...COMPLET, recurrenceKind: 'dates', dates: '' })).toContain(
			'Dates : pas encore écrites'
		);
	});

	it('says the day of a monthly course', () => {
		const rows = lignes({
			...COMPLET,
			recurrenceKind: 'monthly',
			monthlyOrdinal: -1,
			monthlyWeekday: 6
		});
		expect(rows).toContain('Jours : le dernier samedi du mois');
		expect(rows).toContain('Fréquence : chaque mois');
	});

	it('speaks each of the five languages', () => {
		const horaires = {
			fr: 'Horaire : 10 min avant Maghrib, pendant 1 h',
			de: 'Zeit: 10 Min. vor Maghrib, 1 Stunde lang',
			it: 'Orario: 10 min prima di Maghrib, per 1 ora',
			en: 'Time: 10 min before Maghrib, for 1 hour',
			ar: 'الوقت: قبل المغرب بـ10 دقائق، لمدة ساعة'
		} as const;
		for (const [langue, horaire] of Object.entries(horaires)) {
			expect(lignes(COMPLET, langue as keyof typeof horaires), langue).toContain(horaire);
		}
		expect(lignes(COMPLET, 'de')).toContain('Erster Tag: Montag, 07.09.2026');
		expect(lignes(COMPLET, 'ar')[0]).toBe('العنوان بالفرنسية: Tafsir du soir');
		const descriptions = {
			fr: 'Description en français : Lecture commentée, pour adultes.',
			de: 'Beschreibung auf Französisch: Lecture commentée, pour adultes.',
			it: 'Descrizione in francese: Lecture commentée, pour adultes.',
			en: 'Description in French: Lecture commentée, pour adultes.',
			ar: 'الوصف بالفرنسية: Lecture commentée, pour adultes.'
		} as const;
		for (const [langue, description] of Object.entries(descriptions)) {
			expect(lignes(COMPLET, langue as keyof typeof descriptions)[1], langue).toBe(description);
		}
	});
});

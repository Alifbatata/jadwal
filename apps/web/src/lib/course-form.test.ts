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

/** Les dates que le service accepte, telles que le serveur les donne à la page (`dates.ts`). */
const BORNES = { first: '1970-01-01', last: '2100-12-31' } as const;

const CONTEXTE = {
	languages: ['fr', 'de', 'ar'],
	rooms: [{ id: 'salle', name: 'Grande salle' }],
	dateRange: BORNES
};

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
		expect(readDate(texte, BORNES)).toBe(attendu);
	});

	it.each(['31.02.2026', '12/10/2026', '12.10.26', '2026-13-01', 'demain', ''])(
		'refuses « %s »',
		(texte) => {
			expect(readDate(texte, BORNES)).toBeNull();
		}
	);

	it.each(['01.01.0000', '31.12.1969', '01.01.2101', '31.12.9999', '0000-01-01'])(
		'refuses « %s », outside the years the service handles (étape 19, lot 2)',
		(texte) => {
			expect(readDate(texte, BORNES)).toBeNull();
		}
	);

	it('accepts the first and the last date the service handles', () => {
		expect([readDate('01.01.1970', BORNES), readDate('31.12.2100', BORNES)]).toEqual([
			'1970-01-01',
			'2100-12-31'
		]);
	});

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

	it('marks as to correct a description without a title in its language', () => {
		// Le serveur refuse une description seule, sans le titre de sa langue : le résumé la marque « à
		// corriger », comme les autres valeurs refusées, au lieu de la montrer comme publiée.
		const rows = summarise(
			{ ...COMPLET, descriptions: { fr: ' ', de: 'Für Erwachsene.', ar: 'قراءة مع شرح.' } },
			CONTEXTE,
			'fr'
		);
		expect(rows.slice(0, 4).map((row) => `${row.label} ${row.value}`)).toEqual([
			'Titre en français : Tafsir du soir',
			'Description en allemand : à corriger, il manque le titre en allemand',
			'Titre en arabe : تفسير المساء',
			'Description en arabe : قراءة مع شرح.'
		]);
		expect(rows.filter((row) => row.missing).map((row) => row.key)).toEqual(['description-de']);
		const marquee = (langue: Parameters<typeof summarise>[2]) =>
			summarise(
				{ ...COMPLET, descriptions: { fr: '', de: 'Für Erwachsene.', ar: '' } },
				CONTEXTE,
				langue
			)
				.filter((row) => row.missing)
				.map((row) => `${row.label} ${row.value}`);
		expect(marquee('de')).toEqual([
			'Beschreibung auf Deutsch: zu korrigieren, der Titel auf Deutsch fehlt'
		]);
		expect(marquee('it')).toEqual([
			'Descrizione in tedesco: da correggere, manca il titolo in tedesco'
		]);
		expect(marquee('en')).toEqual([
			'Description in German: to correct, the title in German is missing'
		]);
		expect(marquee('ar')).toEqual(['الوصف بالألمانية: يجب تصحيحه، ينقصه العنوان بالألمانية']);
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
			{ timingKind: 'fixed', start: '' }
		] as const) {
			expect(lignes({ ...COMPLET, ...incomplet }), JSON.stringify(incomplet)).toContain(
				'Horaire : à indiquer'
			);
		}
	});

	it('marks as to correct what the server refuses, instead of showing it as published', () => {
		const avant = 'Horaire : à corriger, de 1 à 120 minutes avant la prière';
		const apres = 'Horaire : à corriger, de 0 à 240 minutes après la prière';
		const duree = 'Horaire : à corriger, une durée de 5 à 1440 minutes';
		const cas: [Partial<CourseFormValues>, string][] = [
			[{ timingKind: 'beforePrayer', offsetMinutes: 130 }, avant],
			[{ timingKind: 'beforePrayer', offsetMinutes: 0 }, avant],
			[{ timingKind: 'beforePrayer', offsetMinutes: 2.5 }, avant],
			[{ timingKind: 'prayer', offsetMinutes: 241 }, apres],
			[{ timingKind: 'prayer', offsetMinutes: -5 }, apres],
			[{ timingKind: 'prayer', offsetMinutes: 15, durationMinutes: 4 }, duree],
			[{ timingKind: 'prayer', offsetMinutes: 15, durationMinutes: 1441 }, duree],
			[{ endsOn: '2026-09-01' }, 'Dernier jour : à corriger, il tombe avant le premier jour'],
			[
				{ recurrenceKind: 'dates', dates: '12.10.2026\n2026-10-12 26.10.2026' },
				'Dates écrites deux fois : lundi 12.10.2026'
			],
			// Hors des années 1970 à 2100, que le serveur refuse (étape 19, lot 2).
			[{ endsOn: '9999-12-31' }, 'Dernier jour : à corriger, choisissez-le dans le calendrier'],
			[{ endsOn: '2026-02-31' }, 'Dernier jour : à corriger, choisissez-le dans le calendrier'],
			[{ startsOn: '0000-01-01' }, 'Premier jour : pas choisi'],
			[{ recurrenceKind: 'dates', dates: '12.10.2026 31.12.9999' }, 'Dates à corriger : 31.12.9999']
		];
		for (const [valeurs, attendu] of cas) {
			const marquees = summarise({ ...COMPLET, ...valeurs }, CONTEXTE, 'fr')
				.filter((row) => row.missing)
				.map((row) => `${row.label} ${row.value}`);
			expect(marquees, JSON.stringify(valeurs)).toEqual([attendu]);
		}
		// Aux bornes, rien n'est à corriger.
		for (const valeurs of [
			{ timingKind: 'beforePrayer', offsetMinutes: 120, durationMinutes: 1440 },
			{ timingKind: 'beforePrayer', offsetMinutes: 1, durationMinutes: 5 },
			{ timingKind: 'prayer', offsetMinutes: 240 },
			{ endsOn: '2026-09-07' },
			{ startsOn: '1970-01-01', endsOn: '2100-12-31' }
		] as const) {
			const rows = summarise({ ...COMPLET, ...valeurs }, CONTEXTE, 'fr');
			expect(
				rows.filter((row) => row.missing),
				JSON.stringify(valeurs)
			).toEqual([]);
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

	it('does not announce as published the dates outside the period of the course', () => {
		const dehors = summarise(
			{
				...COMPLET,
				recurrenceKind: 'dates',
				dates: '30.12.2026 12.10.2026\n05.09.2026',
				startsOn: '2026-09-07',
				endsOn: '2026-12-20'
			},
			CONTEXTE,
			'fr'
		);
		const lus = dehors.map((row) => `${row.label} ${row.value}`);
		expect(lus).toContain('Dates : lundi 12.10.2026');
		expect(dehors.filter((row) => row.missing).map((row) => `${row.label} ${row.value}`)).toEqual([
			'Dates avant le premier jour, pas publiées : samedi 05.09.2026',
			'Dates après le dernier jour, pas publiées : mercredi 30.12.2026'
		]);

		// Aucune date dans la période : la ligne des dates le dit, au lieu de « pas encore écrites ».
		const aucune = lignes({
			...COMPLET,
			recurrenceKind: 'dates',
			dates: '12.10.2026',
			startsOn: '2026-11-01',
			endsOn: null
		});
		expect(aucune).toContain('Dates : aucune ne sera publiée');
		expect(aucune).toContain('Dates avant le premier jour, pas publiées : lundi 12.10.2026');

		// Le premier et le dernier jour sont publiés, comme le moteur les publie.
		const bornes = summarise(
			{ ...COMPLET, recurrenceKind: 'dates', dates: '07.09.2026 20.12.2026' },
			CONTEXTE,
			'fr'
		);
		expect(bornes.filter((row) => row.missing)).toEqual([]);
		expect(bornes.map((row) => `${row.label} ${row.value}`)).toContain(
			'Dates : lundi 07.09.2026 et dimanche 20.12.2026'
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

	it('agrees the Italian rank with « domenica » in the day of a monthly course', () => {
		const domenica = (monthlyOrdinal: number) =>
			lignes({ ...COMPLET, recurrenceKind: 'monthly', monthlyOrdinal, monthlyWeekday: 7 }, 'it');
		expect(domenica(1)).toContain('Giorni: la prima domenica del mese');
		expect(domenica(-1)).toContain('Giorni: l’ultima domenica del mese');
		expect(lignes({ ...COMPLET, recurrenceKind: 'monthly', monthlyWeekday: 1 }, 'it')).toContain(
			'Giorni: il primo lunedì del mese'
		);
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

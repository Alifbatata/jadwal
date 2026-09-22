// Le libellé d'ancrage du flux agenda : la première ligne de la description d'un cours ancré.
//
// Pour un décalage non nul, le flux dit exactement ce que dit la page : il reprend la phrase de
// `affichage.ts`, et l'arabe accorde ses minutes au nombre au même endroit pour les deux. La prière
// est nommée dans la langue du flux, comme sur la page : « المغرب » en arabe, « Ischa » en allemand.
// Ces tests ne touchent pas la base : le libellé est une fonction pure, et c'est elle que
// `buildAgenda` appelle.

import { describe, expect, it } from 'vitest';
import { LANGUES } from '$lib/i18n.js';
import { horaireEnClair } from '$lib/public/affichage.js';
import { libelleAncrage } from './agenda.js';

describe('le libellé d’ancrage du flux agenda', () => {
	it('keeps the zero offset sentence of each language, which is not the page one', () => {
		expect(libelleAncrage('fr', 'maghrib', 0)).toBe('À Maghrib');
		expect(libelleAncrage('de', 'maghrib', 0)).toBe('Zu Maghrib');
		expect(libelleAncrage('it', 'maghrib', 0)).toBe('A Maghrib');
		expect(libelleAncrage('ar', 'maghrib', 0)).toBe('عند المغرب');
	});

	it('names the prayer in the language of the feed, as the page does', () => {
		expect(libelleAncrage('ar', 'isha', 0)).toBe('عند العشاء');
		expect(libelleAncrage('ar', 'fajr', 15)).toBe('بعد الفجر بـ15 دقيقة');
		// L'allemand du flux suit celui de la page : « Fadschr » et « Ischa », plus « Fajr » et
		// « Isha ».
		expect(libelleAncrage('de', 'fajr', 0)).toBe('Zu Fadschr');
		expect(libelleAncrage('de', 'isha', 15)).toBe('15 Min. nach Ischa');
		expect(libelleAncrage('fr', 'isha', 1)).toBe('1 min après Isha');
		expect(libelleAncrage('it', 'fajr', 100)).toBe('100 min dopo Fajr');
		// Une prière inconnue reste telle quelle, comme sur la page.
		expect(libelleAncrage('fr', 'witr', 0)).toBe('À witr');
	});

	it('keeps the French, German and Italian minutes as they were', () => {
		expect(libelleAncrage('fr', 'maghrib', 15)).toBe('15 min après Maghrib');
		expect(libelleAncrage('de', 'maghrib', 15)).toBe('15 Min. nach Maghrib');
		expect(libelleAncrage('it', 'maghrib', 15)).toBe('15 min dopo Maghrib');
	});

	it('says, for a non-zero offset, exactly what the page says', () => {
		for (const langue of LANGUES) {
			for (const priere of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) {
				for (const decalage of [-120, -100, -15, -11, -10, -3, -2, -1, 1, 2, 3, 10, 11, 15, 240]) {
					expect(libelleAncrage(langue, priere, decalage)).toBe(
						horaireEnClair(langue, {
							timingKind: 'prayer',
							timingPrayer: priere,
							timingOffsetMinutes: decalage
						})
					);
				}
			}
		}
	});

	it('agrees the Arabic minutes with their number', () => {
		const phrases = [0, 1, 2, 3, 10, 11, 15, 100].map((decalage) =>
			libelleAncrage('ar', 'maghrib', decalage)
		);
		expect(phrases).toEqual([
			'عند المغرب',
			'بعد المغرب بدقيقة واحدة',
			'بعد المغرب بدقيقتين',
			'بعد المغرب بـ3 دقائق',
			'بعد المغرب بـ10 دقائق',
			'بعد المغرب بـ11 دقيقة',
			'بعد المغرب بـ15 دقيقة',
			'بعد المغرب بـ100 دقيقة'
		]);
	});

	it('says « before » for a negative offset, with its absolute value', () => {
		const decalages = [-1, -2, -3, -10, -11, -15, -100, -120];
		const libelles = (langue: (typeof LANGUES)[number]) =>
			decalages.map((decalage) => libelleAncrage(langue, 'maghrib', decalage));
		expect(libelles('fr')).toEqual([
			'1 min avant Maghrib',
			'2 min avant Maghrib',
			'3 min avant Maghrib',
			'10 min avant Maghrib',
			'11 min avant Maghrib',
			'15 min avant Maghrib',
			'100 min avant Maghrib',
			'120 min avant Maghrib'
		]);
		expect(libelles('de')).toEqual([
			'1 Min. vor Maghrib',
			'2 Min. vor Maghrib',
			'3 Min. vor Maghrib',
			'10 Min. vor Maghrib',
			'11 Min. vor Maghrib',
			'15 Min. vor Maghrib',
			'100 Min. vor Maghrib',
			'120 Min. vor Maghrib'
		]);
		expect(libelles('it')).toEqual([
			'1 min prima di Maghrib',
			'2 min prima di Maghrib',
			'3 min prima di Maghrib',
			'10 min prima di Maghrib',
			'11 min prima di Maghrib',
			'15 min prima di Maghrib',
			'100 min prima di Maghrib',
			'120 min prima di Maghrib'
		]);
		expect(libelles('ar')).toEqual([
			'قبل المغرب بدقيقة واحدة',
			'قبل المغرب بدقيقتين',
			'قبل المغرب بـ3 دقائق',
			'قبل المغرب بـ10 دقائق',
			'قبل المغرب بـ11 دقيقة',
			'قبل المغرب بـ15 دقيقة',
			'قبل المغرب بـ100 دقيقة',
			'قبل المغرب بـ120 دقيقة'
		]);
	});
});

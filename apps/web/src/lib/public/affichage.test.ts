// La mise en mots des pages publiques, dans les quatre langues.
//
// Trois familles de tests. Les premiers figent les sorties françaises, allemandes et italiennes telles
// qu'elles étaient avant la relecture de l'arabe : la restructuration de `affichage.ts` en
// enregistrements par langue ne devait rien y changer, et ces tests le tiennent. Une seule sortie y a
// bougé depuis, à dessein : « l’ultimo » italien. Les seconds portent les corrections de l'arabe
// demandées par le chef de projet (rangs du mois, conjonction, minutes). Les derniers disent un
// décalage négatif par « avant », dans les quatre langues.

import { describe, expect, it } from 'vitest';
import {
	heureDeSeance,
	horaireEnClair,
	joindre,
	languesEnClair,
	nomPriere,
	rythmeEnClair
} from './affichage.js';

describe('les sorties françaises, allemandes et italiennes ne bougent pas', () => {
	it('keeps the weekly rhythm, one day, two days, three days', () => {
		const un = { recurrenceKind: 'weekly', recurrenceWeekdays: [6], recurrenceInterval: 1 };
		const deux = { recurrenceKind: 'weekly', recurrenceWeekdays: [1, 3], recurrenceInterval: 1 };
		const trois = { recurrenceKind: 'weekly', recurrenceWeekdays: [1, 3, 5] };
		expect(rythmeEnClair('fr', un)).toBe('le samedi');
		expect(rythmeEnClair('de', un)).toBe('jeden Samstag');
		expect(rythmeEnClair('it', un)).toBe('il sabato');
		expect(rythmeEnClair('fr', deux)).toBe('le lundi et mercredi');
		expect(rythmeEnClair('de', deux)).toBe('jeden Montag und Mittwoch');
		expect(rythmeEnClair('it', deux)).toBe('il lunedì e mercoledì');
		expect(rythmeEnClair('fr', trois)).toBe('le lundi, mercredi et vendredi');
		expect(rythmeEnClair('de', trois)).toBe('jeden Montag, Mittwoch und Freitag');
		expect(rythmeEnClair('it', trois)).toBe('il lunedì, mercoledì e venerdì');
	});

	it('keeps the fortnightly rhythm', () => {
		const cours = { recurrenceKind: 'weekly', recurrenceWeekdays: [2], recurrenceInterval: 2 };
		expect(rythmeEnClair('fr', cours)).toBe('un mardi sur deux');
		expect(rythmeEnClair('de', cours)).toBe('jeden zweiten Dienstag');
		expect(rythmeEnClair('it', cours)).toBe('un martedì su due');
		const deux = { recurrenceKind: 'weekly', recurrenceWeekdays: [2, 4], recurrenceInterval: 2 };
		expect(rythmeEnClair('fr', deux)).toBe('un mardi et jeudi sur deux');
		expect(rythmeEnClair('de', deux)).toBe('jeden zweiten Dienstag und Donnerstag');
		expect(rythmeEnClair('it', deux)).toBe('un martedì e giovedì su due');
	});

	it('keeps the five ranks of the month', () => {
		const rang = (ordinal: number, jour: number) => ({
			recurrenceKind: 'monthly',
			recurrenceOrdinal: ordinal,
			recurrenceOrdinalWeekday: jour
		});
		expect(rythmeEnClair('fr', rang(1, 5))).toBe('le premier vendredi du mois');
		expect(rythmeEnClair('fr', rang(2, 2))).toBe('le deuxième mardi du mois');
		expect(rythmeEnClair('fr', rang(3, 3))).toBe('le troisième mercredi du mois');
		expect(rythmeEnClair('fr', rang(4, 4))).toBe('le quatrième jeudi du mois');
		expect(rythmeEnClair('fr', rang(-1, 1))).toBe('le dernier lundi du mois');
		expect(rythmeEnClair('de', rang(1, 5))).toBe('am ersten Freitag des Monats');
		expect(rythmeEnClair('de', rang(2, 2))).toBe('am zweiten Dienstag des Monats');
		expect(rythmeEnClair('de', rang(3, 3))).toBe('am dritten Mittwoch des Monats');
		expect(rythmeEnClair('de', rang(4, 4))).toBe('am vierten Donnerstag des Monats');
		expect(rythmeEnClair('de', rang(-1, 1))).toBe('am letzten Montag des Monats');
		expect(rythmeEnClair('it', rang(1, 5))).toBe('il primo venerdì del mese');
		expect(rythmeEnClair('it', rang(2, 2))).toBe('il secondo martedì del mese');
		expect(rythmeEnClair('it', rang(3, 3))).toBe('il terzo mercoledì del mese');
		expect(rythmeEnClair('it', rang(4, 4))).toBe('il quarto giovedì del mese');
		// L'article s'élide devant la voyelle : « l’ultimo », jamais « il ultimo ».
		expect(rythmeEnClair('it', rang(-1, 1))).toBe('l’ultimo lunedì del mese');
		expect(rythmeEnClair('it', rang(-1, 6))).toBe('l’ultimo sabato del mese');
	});

	it('keeps the rhythm of precise dates', () => {
		const cours = { recurrenceKind: 'dates', recurrenceDates: ['2026-10-01'] };
		expect(rythmeEnClair('fr', cours)).toBe('À des dates précises');
		expect(rythmeEnClair('de', cours)).toBe('An bestimmten Daten');
		expect(rythmeEnClair('it', cours)).toBe('In date precise');
		expect(rythmeEnClair('ar', cours)).toBe('في تواريخ محددة');
	});

	it('keeps the list joined with the conjunction of each language', () => {
		for (const langue of ['fr', 'de', 'it', 'ar'] as const) {
			expect(joindre(langue, [])).toBe('');
			expect(joindre(langue, ['un'])).toBe('un');
		}
		expect(joindre('fr', ['a', 'b'])).toBe('a et b');
		expect(joindre('de', ['a', 'b'])).toBe('a und b');
		expect(joindre('it', ['a', 'b'])).toBe('a e b');
		expect(joindre('fr', ['a', 'b', 'c'])).toBe('a, b et c');
		expect(joindre('de', ['a', 'b', 'c'])).toBe('a, b und c');
		expect(joindre('it', ['a', 'b', 'c'])).toBe('a, b e c');
	});

	it('keeps the teaching languages in full, and an unknown code as it is', () => {
		expect(languesEnClair('fr', ['fr', 'ar'])).toBe('français et arabe');
		expect(languesEnClair('de', ['fr', 'ar'])).toBe('Französisch und Arabisch');
		expect(languesEnClair('it', ['fr', 'ar'])).toBe('francese e arabo');
		expect(languesEnClair('fr', ['de', 'it', 'en', 'sq', 'tr', 'bs'])).toBe(
			'allemand, italien, anglais, albanais, turc et bosnien'
		);
		expect(languesEnClair('de', ['de', 'it', 'en', 'sq', 'tr', 'bs'])).toBe(
			'Deutsch, Italienisch, Englisch, Albanisch, Türkisch und Bosnisch'
		);
		expect(languesEnClair('it', ['de', 'it', 'en', 'sq', 'tr', 'bs'])).toBe(
			'tedesco, italiano, inglese, albanese, turco e bosniaco'
		);
		expect(languesEnClair('fr', ['es'])).toBe('es');
		expect(languesEnClair('fr', [])).toBe('');
	});

	it('keeps the fixed timing and the anchored one', () => {
		const fixe = { timingKind: 'fixed', timingStart: '19:00:00', timingEnd: '20:30:00' };
		expect(horaireEnClair('fr', fixe)).toBe('de 19:00 à 20:30');
		expect(horaireEnClair('de', fixe)).toBe('von 19:00 bis 20:30');
		expect(horaireEnClair('it', fixe)).toBe('dalle 19:00 alle 20:30');
		expect(horaireEnClair('ar', fixe)).toBe('من 19:00 إلى 20:30');
		const ancre = (decalage: number, priere = 'maghrib') => ({
			timingKind: 'prayer',
			timingPrayer: priere,
			timingOffsetMinutes: decalage
		});
		expect(horaireEnClair('fr', ancre(0))).toBe('Après Maghrib');
		expect(horaireEnClair('de', ancre(0))).toBe('Nach Maghrib');
		expect(horaireEnClair('it', ancre(0))).toBe('Dopo Maghrib');
		expect(horaireEnClair('fr', ancre(15))).toBe('15 min après Maghrib');
		expect(horaireEnClair('de', ancre(15))).toBe('15 Min. nach Maghrib');
		expect(horaireEnClair('it', ancre(15))).toBe('15 min dopo Maghrib');
		expect(horaireEnClair('de', ancre(1, 'fajr'))).toBe('1 Min. nach Fadschr');
		expect(horaireEnClair('it', ancre(100, 'isha'))).toBe('100 min dopo Isha');
		expect(horaireEnClair('de', { timingKind: 'prayer', timingPrayer: 'isha' })).toBe('Nach Ischa');
	});

	it('keeps the time of a session, fixed or anchored', () => {
		const fixe = { start: '19:00', end: '20:30', anchor: null };
		for (const langue of ['fr', 'de', 'it', 'ar'] as const) {
			expect(heureDeSeance(langue, fixe)).toBe('19:00 – 20:30');
			expect(heureDeSeance(langue, { start: '19:00', end: null, anchor: null })).toBe('19:00');
			expect(heureDeSeance(langue, { start: null, end: null, anchor: null })).toBe('');
		}
		const ancree = (offsetMinutes: number, start: string | null) => ({
			start,
			end: null,
			anchor: { prayer: 'maghrib', offsetMinutes }
		});
		expect(heureDeSeance('fr', ancree(0, '19:12'))).toBe('Après Maghrib (19:12)');
		expect(heureDeSeance('de', ancree(0, '19:12'))).toBe('Nach Maghrib (19:12)');
		expect(heureDeSeance('it', ancree(0, '19:12'))).toBe('Dopo Maghrib (19:12)');
		expect(heureDeSeance('fr', ancree(10, null))).toBe('10 min après Maghrib');
		expect(heureDeSeance('de', ancree(10, '19:25'))).toBe('10 Min. nach Maghrib (19:25)');
		expect(heureDeSeance('it', ancree(10, null))).toBe('10 min dopo Maghrib');
		expect(heureDeSeance('ar', ancree(0, '19:12'))).toBe('بعد المغرب (19:12)');
	});

	it('keeps the prayer names, and an unknown prayer as it is', () => {
		expect(nomPriere('fr', 'fajr')).toBe('Fajr');
		expect(nomPriere('de', 'fajr')).toBe('Fadschr');
		expect(nomPriere('de', 'isha')).toBe('Ischa');
		expect(nomPriere('it', 'dhuhr')).toBe('Dhuhr');
		expect(nomPriere('ar', 'asr')).toBe('العصر');
		expect(nomPriere('ar', 'witr')).toBe('witr');
	});
});

describe('l’arabe relu par le chef de projet', () => {
	it('writes a rank of the month in its invariable form, before the day without article', () => {
		const rang = (ordinal: number, jour: number) =>
			rythmeEnClair('ar', {
				recurrenceKind: 'monthly',
				recurrenceOrdinal: ordinal,
				recurrenceOrdinalWeekday: jour
			});
		expect(rang(1, 5)).toBe('أول جمعة من الشهر');
		expect(rang(2, 2)).toBe('ثاني ثلاثاء من الشهر');
		expect(rang(3, 3)).toBe('ثالث أربعاء من الشهر');
		expect(rang(4, 4)).toBe('رابع خميس من الشهر');
		expect(rang(-1, 1)).toBe('آخر اثنين من الشهر');
		// Les sept jours sans article, chacun à sa place.
		expect([1, 2, 3, 4, 5, 6, 7].map((jour) => rang(1, jour))).toEqual([
			'أول اثنين من الشهر',
			'أول ثلاثاء من الشهر',
			'أول أربعاء من الشهر',
			'أول خميس من الشهر',
			'أول جمعة من الشهر',
			'أول سبت من الشهر',
			'أول أحد من الشهر'
		]);
	});

	it('glues « و » to each following word, without a comma', () => {
		expect(joindre('ar', ['الفرنسية', 'العربية'])).toBe('الفرنسية والعربية');
		expect(joindre('ar', ['الفرنسية', 'العربية', 'التركية'])).toBe('الفرنسية والعربية والتركية');
		expect(languesEnClair('ar', ['fr', 'ar'])).toBe('الفرنسية والعربية');
		expect(languesEnClair('ar', ['fr', 'ar', 'tr'])).toBe('الفرنسية والعربية والتركية');
	});

	it('writes a weekly rhythm of two days with the same conjunction', () => {
		expect(rythmeEnClair('ar', { recurrenceKind: 'weekly', recurrenceWeekdays: [1, 3] })).toBe(
			'كل الاثنين والأربعاء'
		);
		expect(
			rythmeEnClair('ar', {
				recurrenceKind: 'weekly',
				recurrenceWeekdays: [1, 3],
				recurrenceInterval: 2
			})
		).toBe('الاثنين والأربعاء كل أسبوعين');
		expect(rythmeEnClair('ar', { recurrenceKind: 'weekly', recurrenceWeekdays: [5] })).toBe(
			'كل الجمعة'
		);
	});

	/** Les huit nombres demandés, et la phrase attendue pour chacun. */
	const MINUTES: [number, string][] = [
		[0, 'بعد المغرب'],
		[1, 'بعد المغرب بدقيقة واحدة'],
		[2, 'بعد المغرب بدقيقتين'],
		[3, 'بعد المغرب بـ3 دقائق'],
		[10, 'بعد المغرب بـ10 دقائق'],
		[11, 'بعد المغرب بـ11 دقيقة'],
		[15, 'بعد المغرب بـ15 دقيقة'],
		[100, 'بعد المغرب بـ100 دقيقة']
	];

	it('agrees the minutes with their number, in the timing of a course', () => {
		for (const [decalage, phrase] of MINUTES) {
			expect(
				horaireEnClair('ar', {
					timingKind: 'prayer',
					timingPrayer: 'maghrib',
					timingOffsetMinutes: decalage
				})
			).toBe(phrase);
		}
	});

	it('agrees the minutes with their number, in the time of a session', () => {
		for (const [decalage, phrase] of MINUTES) {
			expect(
				heureDeSeance('ar', {
					start: '19:40',
					end: null,
					anchor: { prayer: 'maghrib', offsetMinutes: decalage }
				})
			).toBe(`${phrase} (19:40)`);
		}
	});
});

describe('un décalage négatif se dit « avant »', () => {
	/** Les huit valeurs demandées, et la phrase attendue dans chaque langue. */
	const AVANT: [number, Record<'fr' | 'de' | 'it' | 'ar', string>][] = [
		[
			-1,
			{
				fr: '1 min avant Maghrib',
				de: '1 Min. vor Maghrib',
				it: '1 min prima di Maghrib',
				ar: 'قبل المغرب بدقيقة واحدة'
			}
		],
		[
			-2,
			{
				fr: '2 min avant Maghrib',
				de: '2 Min. vor Maghrib',
				it: '2 min prima di Maghrib',
				ar: 'قبل المغرب بدقيقتين'
			}
		],
		[
			-3,
			{
				fr: '3 min avant Maghrib',
				de: '3 Min. vor Maghrib',
				it: '3 min prima di Maghrib',
				ar: 'قبل المغرب بـ3 دقائق'
			}
		],
		[
			-10,
			{
				fr: '10 min avant Maghrib',
				de: '10 Min. vor Maghrib',
				it: '10 min prima di Maghrib',
				ar: 'قبل المغرب بـ10 دقائق'
			}
		],
		[
			-11,
			{
				fr: '11 min avant Maghrib',
				de: '11 Min. vor Maghrib',
				it: '11 min prima di Maghrib',
				ar: 'قبل المغرب بـ11 دقيقة'
			}
		],
		[
			-15,
			{
				fr: '15 min avant Maghrib',
				de: '15 Min. vor Maghrib',
				it: '15 min prima di Maghrib',
				ar: 'قبل المغرب بـ15 دقيقة'
			}
		],
		[
			-100,
			{
				fr: '100 min avant Maghrib',
				de: '100 Min. vor Maghrib',
				it: '100 min prima di Maghrib',
				ar: 'قبل المغرب بـ100 دقيقة'
			}
		],
		[
			-120,
			{
				fr: '120 min avant Maghrib',
				de: '120 Min. vor Maghrib',
				it: '120 min prima di Maghrib',
				ar: 'قبل المغرب بـ120 دقيقة'
			}
		]
	];

	it('in the timing of a course', () => {
		for (const [decalage, phrases] of AVANT) {
			for (const langue of ['fr', 'de', 'it', 'ar'] as const) {
				expect(
					horaireEnClair(langue, {
						timingKind: 'prayer',
						timingPrayer: 'maghrib',
						timingOffsetMinutes: decalage
					})
				).toBe(phrases[langue]);
			}
		}
	});

	it('in the time of a session, known or not', () => {
		for (const [decalage, phrases] of AVANT) {
			for (const langue of ['fr', 'de', 'it', 'ar'] as const) {
				const seance = (start: string | null) =>
					heureDeSeance(langue, {
						start,
						end: null,
						anchor: { prayer: 'maghrib', offsetMinutes: decalage }
					});
				expect(seance('19:10')).toBe(`${phrases[langue]} (19:10)`);
				expect(seance(null)).toBe(phrases[langue]);
			}
		}
	});

	it('never writes a minus sign', () => {
		for (const langue of ['fr', 'de', 'it', 'ar'] as const) {
			for (let decalage = -120; decalage < 0; decalage += 1) {
				expect(
					horaireEnClair(langue, {
						timingKind: 'prayer',
						timingPrayer: 'isha',
						timingOffsetMinutes: decalage
					})
				).not.toMatch(/-/);
			}
		}
	});
});

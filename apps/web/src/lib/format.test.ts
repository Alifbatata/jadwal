// La mise en mots : dates, rythmes, horaires, et les messages prêts à coller.
//
// Tout part d'une date civile en chaîne, jamais d'un instant : c'est ce qui permet de vérifier la
// veille d'un changement d'heure sans changer le fuseau de la machine (ADR 0012).

import { describe, expect, it } from 'vitest';
import type { IsoDate } from '@jadwal/core';
import {
	AUDIENCE_LABELS,
	audienceLabel,
	audienceLabels,
	describeDuration,
	describeRecurrence,
	describeSessionTime,
	describeTiming,
	joinFrench,
	joinList,
	languageLabel,
	longDate,
	prayerLabel,
	shortDate,
	weekdayName
} from './format.js';
import { LANGUES, type Langue } from './i18n.js';
import { cancellationMessage, moveMessage, weekMessage } from './messages.js';
import { decalageEnClair, nomPriere } from './public/affichage.js';

/** Les cinq langues, dans l'ordre du service : fr, de, it, en, ar. */
const LANGUES_DE_L_ESPACE: readonly Langue[] = LANGUES;

describe('les dates en français', () => {
	it.each([
		['2026-09-21', 'lundi'],
		['2026-09-27', 'dimanche'],
		// Un 29 février, vérifié contre `Date.UTC` : 2026 n'est pas bissextile, 2028 l'est.
		['2028-02-29', 'mardi']
	])('names the weekday of %s', (date, attendu) => {
		expect(weekdayName(date as IsoDate)).toBe(attendu);
	});

	// Depuis l'étape 18, JJ.MM.AAAA partout, comme la page publique : « jeudi 1er octobre » ne disait
	// pas l'année, et l'espace et la page ne l'écrivaient pas de la même façon.
	it('writes the day, then the date as JJ.MM.AAAA', () => {
		expect(shortDate('2026-10-01' as IsoDate)).toBe('jeudi 01.10.2026');
		expect(shortDate('2026-10-02' as IsoDate)).toBe('vendredi 02.10.2026');
		expect(shortDate('2026-09-26' as IsoDate)).toBe('samedi 26.09.2026');
	});

	it('writes the date alone as JJ.MM.AAAA where the day adds nothing', () => {
		expect(longDate('2026-08-15' as IsoDate)).toBe('15.08.2026');
	});

	it('gives back what it was given when the date is unreadable', () => {
		// Plutôt que d'inventer une date : une chaîne inattendue doit se voir, pas se fondre.
		expect(shortDate('pas-une-date' as IsoDate)).toBe('pas-une-date');
	});
});

describe('les énumérations en français', () => {
	it.each([
		[[], ''],
		[['lundi'], 'lundi'],
		[['lundi', 'mercredi'], 'lundi et mercredi'],
		[['lundi', 'mercredi', 'vendredi'], 'lundi, mercredi et vendredi']
	])('joins %j', (parts, attendu) => {
		expect(joinFrench(parts)).toBe(attendu);
	});
});

describe('le rythme en clair', () => {
	it('says the days of a weekly course', () => {
		expect(describeRecurrence({ kind: 'weekly', weekdays: [1, 3], interval: 1 })).toBe(
			'chaque semaine, le lundi et mercredi'
		);
	});

	it('says « un sur deux » for a fortnightly course', () => {
		expect(describeRecurrence({ kind: 'weekly', weekdays: [6], interval: 2 })).toBe(
			'un samedi sur deux'
		);
	});

	it('says the rank and the day of a monthly course, including the last one', () => {
		expect(describeRecurrence({ kind: 'monthly', ordinal: 2, ordinalWeekday: 4 })).toBe(
			'le deuxième jeudi du mois'
		);
		expect(describeRecurrence({ kind: 'monthly', ordinal: -1, ordinalWeekday: 6 })).toBe(
			'le dernier samedi du mois'
		);
	});

	it('lists a few precise dates and counts the rest, instead of a wall of dates', () => {
		const dates = ['2026-09-21', '2026-10-05', '2026-10-19', '2026-11-02', '2026-11-16'];
		const phrase = describeRecurrence({ kind: 'dates', dates });
		expect(phrase).toContain('lundi 21.09.2026');
		expect(phrase).toContain('et 2 autres');
	});
});

describe('l’horaire en clair', () => {
	it('reads a fixed time, seconds trimmed as PostgreSQL returns them', () => {
		expect(describeTiming({ kind: 'fixed', start: '19:00:00', end: '20:30:00' })).toBe(
			'de 19:00 à 20:30'
		);
	});

	it('says how long after the prayer, and for how long', () => {
		expect(
			describeTiming({
				kind: 'prayer',
				prayer: 'maghrib',
				offsetMinutes: 30,
				durationMinutes: 90
			})
		).toBe('30 min après Maghrib, pendant 1 h 30');
	});

	it('says « avant » rather than a negative number of minutes', () => {
		expect(
			describeTiming({ kind: 'prayer', prayer: 'fajr', offsetMinutes: -20, durationMinutes: 45 })
		).toBe('20 min avant Fajr, pendant 45 min');
	});

	it('says « après » when there is no offset at all, as the public page does', () => {
		// Jusqu'à l'étape 17, la liste des cours disait « à Isha », quand la page publique et le flux
		// agenda disaient « Après Isha » pour le même cours.
		expect(
			describeTiming({ kind: 'prayer', prayer: 'isha', offsetMinutes: 0, durationMinutes: 60 })
		).toBe('après Isha, pendant 1 h');
	});

	it.each([
		[45, '45 min'],
		[60, '1 h'],
		[90, '1 h 30'],
		[125, '2 h 05']
	])('writes %i minutes as %s', (minutes, attendu) => {
		expect(describeDuration(minutes)).toBe(attendu);
	});
});

describe('l’heure d’une séance', () => {
	it('shows the range when both ends are known', () => {
		expect(describeSessionTime({ start: '19:00', end: '20:30' })).toBe('19:00 – 20:30');
	});

	it('falls back on the prayer when the table does not know that day', () => {
		// C'est le cas prévu par l'ADR 0004 : l'heure manque, l'ancrage reste affichable.
		expect(
			describeSessionTime({
				start: null,
				end: null,
				anchor: { prayer: 'maghrib', offsetMinutes: 15 }
			})
		).toBe('15 min après Maghrib');
	});

	it.each([
		[-1, '1 min avant Maghrib'],
		[-2, '2 min avant Maghrib'],
		[-3, '3 min avant Maghrib'],
		[-10, '10 min avant Maghrib'],
		[-11, '11 min avant Maghrib'],
		[-15, '15 min avant Maghrib'],
		[-100, '100 min avant Maghrib'],
		[-120, '120 min avant Maghrib']
	])(
		'says « avant » for an offset of %i minutes, as the timing of the course does',
		(decalage, attendu) => {
			expect(
				describeSessionTime({
					start: null,
					end: null,
					anchor: { prayer: 'maghrib', offsetMinutes: decalage }
				})
			).toBe(attendu);
			// La même phrase que l'horaire du cours, tel que la liste des cours et son formulaire le
			// disent : une séance ne contredit pas le cours dont elle vient.
			expect(
				describeTiming({
					kind: 'prayer',
					prayer: 'maghrib',
					offsetMinutes: decalage,
					durationMinutes: 60
				})
			).toBe(`${attendu}, pendant 1 h`);
		}
	);

	it.each([-15, 0, 15])(
		'says what the public page says, in French, for an offset of %i minutes',
		(decalage) => {
			// L'espace écrit ses repères en minuscules, au fil de la ligne (« chaque semaine, le lundi,
			// après Maghrib ») ; la page publique ouvre la phrase par une majuscule. Les mots, eux, sont
			// les mêmes : une responsable ne lit pas une autre heure que le visiteur.
			const espace = describeSessionTime({
				start: null,
				end: null,
				anchor: { prayer: 'maghrib', offsetMinutes: decalage }
			});
			const publique = decalageEnClair('fr', decalage, nomPriere('fr', 'maghrib'));
			expect(espace.charAt(0).toUpperCase() + espace.slice(1)).toBe(publique);
			expect(
				describeTiming({
					kind: 'prayer',
					prayer: 'maghrib',
					offsetMinutes: decalage,
					durationMinutes: 45
				})
			).toBe(`${espace}, pendant 45 min`);
		}
	);

	it('says plainly that the time is unknown rather than showing nothing', () => {
		expect(describeSessionTime({ start: null, end: null })).toBe('heure à préciser');
	});
});

describe('les messages prêts à coller', () => {
	const seances = [
		{
			date: '2026-09-21' as IsoDate,
			title: 'Tafsir',
			start: '19:00',
			end: '20:30',
			room: 'Salle 1',
			status: 'scheduled'
		},
		{
			date: '2026-09-21' as IsoDate,
			title: 'Arabe',
			start: '17:00',
			end: '18:00',
			room: null,
			status: 'cancelled'
		},
		{
			date: '2026-09-23' as IsoDate,
			title: 'Fiqh',
			start: null,
			end: null,
			room: null,
			anchor: { prayer: 'maghrib', offsetMinutes: 30 },
			status: 'scheduled'
		}
	];

	it('opens with the greeting the organisation chose', () => {
		expect(weekMessage('Assalamu alaykum', 'Association de Bienne', seances)).toContain(
			'Assalamu alaykum,'
		);
	});

	it('groups by day and marks what is cancelled, instead of hiding it', () => {
		const message = weekMessage('Salam alaykoum', 'Association de Bienne', seances);
		expect(message).toContain('lundi 21.09.2026');
		expect(message).toContain('- Tafsir, 19:00 – 20:30, Salle 1');
		// Taire une annulation ferait déplacer quelqu'un pour rien : c'est le contraire du but.
		expect(message).toContain('- Arabe, 17:00 – 18:00 (ANNULÉ)');
		expect(message).toContain('- Fiqh, 30 min après Maghrib');
	});

	it('leaves out a session that moved away, since it is announced at its new date', () => {
		const message = weekMessage('Salam alaykoum', 'Association', [
			...seances,
			{
				date: '2026-09-25' as IsoDate,
				title: 'Partie',
				start: '19:00',
				end: '20:00',
				room: null,
				status: 'moved_away'
			}
		]);
		expect(message).not.toContain('Partie');
	});

	it('says so plainly when there is nothing at all that week', () => {
		expect(weekMessage('Salam alaykoum', 'Association', [])).toContain(
			'Aucune séance cette semaine'
		);
	});

	it('always says that the course goes on, when a single session is cancelled', () => {
		const message = cancellationMessage('Salam alaykoum', 'Tafsir', '2026-09-21' as IsoDate);
		expect(message).toContain('« Tafsir » du lundi 21.09.2026 est annulé');
		expect(message).toContain('Les autres séances ont lieu normalement.');
	});

	it('carries both dates when a session moves', () => {
		const message = moveMessage(
			'Salam alaykoum',
			'Tafsir',
			'2026-09-21' as IsoDate,
			'2026-09-23' as IsoDate,
			'18:00'
		);
		expect(message).toContain('du lundi 21.09.2026');
		expect(message).toContain('au mercredi 23.09.2026 à 18:00');
	});
});

/**
 * La même mise en mots dans les cinq langues de l'espace (étape 18, retour D2). Les appels sans langue
 * restent en français, mot pour mot : tous les tests qui précèdent le tiennent, et les écrans que le
 * lot suivant n'a pas encore repris continuent d'afficher ce qu'ils affichaient.
 */
describe('la mise en mots dans les cinq langues de l’espace', () => {
	it('names the day and writes the date as JJ.MM.AAAA in each language', () => {
		expect(weekdayName('2026-09-21' as IsoDate, 'ar')).toBe('الاثنين');
		expect(LANGUES_DE_L_ESPACE.map((l) => shortDate('2026-10-01' as IsoDate, l))).toEqual([
			'jeudi 01.10.2026',
			'Donnerstag, 01.10.2026',
			'giovedì 01.10.2026',
			'Thursday 01.10.2026',
			'الخميس 01.10.2026'
		]);
	});

	it('names the audiences, the prayers and the teaching languages', () => {
		expect(LANGUES_DE_L_ESPACE.map((l) => audienceLabel('kids', l))).toEqual([
			'enfants',
			'Kinder',
			'bambini',
			'children',
			'الأطفال'
		]);
		expect(audienceLabels('en')).toEqual({
			kids: 'children',
			youth: 'young people',
			women: 'women',
			adults: 'adults',
			open: 'open to all'
		});
		expect(audienceLabels('fr')).toEqual(AUDIENCE_LABELS);
		expect(audienceLabel('inconnu', 'de')).toBe('inconnu');
		expect(prayerLabel('fajr', 'de')).toBe('Fadschr');
		expect(prayerLabel('isha', 'ar')).toBe('العشاء');
		expect(prayerLabel('inconnue', 'it')).toBe('inconnue');
		expect(languageLabel('tr', 'en')).toBe('Turkish');
		expect(languageLabel('de', 'it')).toBe('tedesco');
		expect(languageLabel('xx', 'ar')).toBe('xx');
		expect(joinList(['a', 'b', 'c'], 'de')).toBe('a, b und c');
		expect(joinList(['a', 'b'], 'ar')).toBe('a وb');
	});

	it('says a weekly rhythm in each language', () => {
		const cours = { kind: 'weekly', weekdays: [1, 3], interval: 1 };
		expect(LANGUES_DE_L_ESPACE.map((l) => describeRecurrence(cours, l))).toEqual([
			'chaque semaine, le lundi et mercredi',
			'jede Woche am Montag und Mittwoch',
			'ogni settimana, il lunedì e mercoledì',
			'every week on Monday and Wednesday',
			'كل أسبوع: الاثنين والأربعاء'
		]);
	});

	it('agrees the Italian article with « domenica » in a weekly rhythm', () => {
		// « ogni settimana, il domenica » était faux : l'article s'accorde au jour.
		const semaine = (weekdays: number[], interval: number) =>
			describeRecurrence({ kind: 'weekly', weekdays, interval }, 'it');
		expect(semaine([7], 1)).toBe('ogni settimana, la domenica');
		expect(semaine([6, 7], 1)).toBe('ogni settimana, il sabato e la domenica');
		expect(semaine([1, 3, 7], 1)).toBe('ogni settimana, il lunedì, il mercoledì e la domenica');
		expect(semaine([7], 2)).toBe('una domenica su due');
		expect(describeRecurrence({ kind: 'weekly', weekdays: [7], interval: 1 }, 'fr')).toBe(
			'chaque semaine, le dimanche'
		);
	});

	it('says a fortnightly and a monthly rhythm as the public page does', () => {
		const quinzaine = { kind: 'weekly', weekdays: [6], interval: 2 };
		expect(LANGUES_DE_L_ESPACE.map((l) => describeRecurrence(quinzaine, l))).toEqual([
			'un samedi sur deux',
			'jeden zweiten Samstag',
			'un sabato su due',
			'every other Saturday',
			'السبت كل أسبوعين'
		]);
		const mois = { kind: 'monthly', ordinal: 2, ordinalWeekday: 4 };
		expect(LANGUES_DE_L_ESPACE.map((l) => describeRecurrence(mois, l))).toEqual([
			'le deuxième jeudi du mois',
			'am zweiten Donnerstag des Monats',
			'il secondo giovedì del mese',
			'the second Thursday of the month',
			'ثاني خميس من الشهر'
		]);
	});

	it('lists a few precise dates and counts the rest, in each language', () => {
		const dates = ['2026-09-21', '2026-10-05', '2026-10-19', '2026-11-02', '2026-11-16'];
		expect(LANGUES_DE_L_ESPACE.map((l) => describeRecurrence({ kind: 'dates', dates }, l))).toEqual(
			[
				'à des dates précises : lundi 21.09.2026, lundi 05.10.2026 et lundi 19.10.2026, et 2 autres',
				// Le point-virgule sépare des dates qui portent déjà une virgule : « Montag, 21.09.2026 ».
				'an bestimmten Daten: Montag, 21.09.2026; Montag, 05.10.2026 und Montag, 19.10.2026 sowie 2 weitere',
				'in date precise: lunedì 21.09.2026, lunedì 05.10.2026 e lunedì 19.10.2026, e altre 2',
				'on specific dates: Monday 21.09.2026, Monday 05.10.2026 and Monday 19.10.2026, and 2 more',
				'في تواريخ محددة: الاثنين 21.09.2026 والاثنين 05.10.2026 والاثنين 19.10.2026، وتاريخان آخران'
			]
		);
		const quatre = { kind: 'dates', dates: dates.slice(0, 4) };
		expect(LANGUES_DE_L_ESPACE.map((l) => describeRecurrence(quatre, l))).toEqual([
			'à des dates précises : lundi 21.09.2026, lundi 05.10.2026 et lundi 19.10.2026, et 1 autre',
			'an bestimmten Daten: Montag, 21.09.2026; Montag, 05.10.2026 und Montag, 19.10.2026 sowie 1 weiteres',
			'in date precise: lunedì 21.09.2026, lunedì 05.10.2026 e lunedì 19.10.2026, e un’altra',
			'on specific dates: Monday 21.09.2026, Monday 05.10.2026 and Monday 19.10.2026, and 1 more',
			'في تواريخ محددة: الاثنين 21.09.2026 والاثنين 05.10.2026 والاثنين 19.10.2026، وتاريخ آخر'
		]);
		expect(
			LANGUES_DE_L_ESPACE.map((l) => describeRecurrence({ kind: 'dates', dates: [] }, l))
		).toEqual([
			'à des dates précises',
			'an bestimmten Daten',
			'in date precise',
			'on specific dates',
			'في تواريخ محددة'
		]);
	});

	it('shows the first dates of the calendar, whatever the order they were written in, in each language', () => {
		// Une personne écrit ses dates dans l'ordre qui lui vient, et la base les gardait dans cet
		// ordre : le message « nouveau cours » et la liste montraient alors les trois premières écrites,
		// et taisaient la première séance du cours (relecture du lot 2 de l'étape 19).
		const desordre = {
			kind: 'dates',
			dates: ['2026-10-26', '2026-11-02', '2026-11-09', '2026-10-12']
		};
		expect(LANGUES_DE_L_ESPACE.map((l) => describeRecurrence(desordre, l))).toEqual([
			'à des dates précises : lundi 12.10.2026, lundi 26.10.2026 et lundi 02.11.2026, et 1 autre',
			'an bestimmten Daten: Montag, 12.10.2026; Montag, 26.10.2026 und Montag, 02.11.2026 sowie 1 weiteres',
			'in date precise: lunedì 12.10.2026, lunedì 26.10.2026 e lunedì 02.11.2026, e un’altra',
			'on specific dates: Monday 12.10.2026, Monday 26.10.2026 and Monday 02.11.2026, and 1 more',
			'في تواريخ محددة: الاثنين 12.10.2026 والاثنين 26.10.2026 والاثنين 02.11.2026، وتاريخ آخر'
		]);
		// La liste reçue n'est pas touchée.
		expect(desordre.dates[0]).toBe('2026-10-26');
	});

	it('agrees the Arabic count of the other dates with its number', () => {
		/** Trois dates montrées, et `reste` de plus. */
		const avecUnReste = (reste: number) =>
			describeRecurrence(
				{
					kind: 'dates',
					dates: Array.from(
						{ length: reste + 3 },
						(_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`
					)
				},
				'ar'
			)
				.split('، ')
				.at(-1);
		expect(avecUnReste(3)).toBe('و3 تواريخ أخرى');
		expect(avecUnReste(10)).toBe('و10 تواريخ أخرى');
		expect(avecUnReste(11)).toBe('و11 تاريخًا آخر');
		expect(avecUnReste(25)).toBe('و25 تاريخًا آخر');
	});

	it('says a fixed timing and an anchored one, « before » for a negative offset', () => {
		const fixe = { kind: 'fixed', start: '19:00:00', end: '20:30:00' };
		expect(LANGUES_DE_L_ESPACE.map((l) => describeTiming(fixe, l))).toEqual([
			'de 19:00 à 20:30',
			'von 19:00 bis 20:30',
			'dalle 19:00 alle 20:30',
			'from 19:00 to 20:30',
			'من 19:00 إلى 20:30'
		]);
		const apres = { kind: 'prayer', prayer: 'maghrib', offsetMinutes: 30, durationMinutes: 90 };
		expect(LANGUES_DE_L_ESPACE.map((l) => describeTiming(apres, l))).toEqual([
			'30 min après Maghrib, pendant 1 h 30',
			'30 Min. nach Maghrib, 1 Stunde 30 Minuten lang',
			'30 min dopo Maghrib, per 1 ora e 30 minuti',
			'30 min after Maghrib, for 1 hour 30 minutes',
			'بعد المغرب بـ30 دقيقة، لمدة ساعة و30 دقيقة'
		]);
		// Retour C3 : un cours avant une prière se dit « avant », jamais « -20 min après ».
		const avant = { kind: 'prayer', prayer: 'fajr', offsetMinutes: -20, durationMinutes: 45 };
		expect(LANGUES_DE_L_ESPACE.map((l) => describeTiming(avant, l))).toEqual([
			'20 min avant Fajr, pendant 45 min',
			'20 Min. vor Fadschr, 45 Minuten lang',
			'20 min prima di Fajr, per 45 minuti',
			'20 min before Fajr, for 45 minutes',
			'قبل الفجر بـ20 دقيقة، لمدة 45 دقيقة'
		]);
		const sansDecalage = { kind: 'prayer', prayer: 'isha', offsetMinutes: 0, durationMinutes: 60 };
		expect(LANGUES_DE_L_ESPACE.map((l) => describeTiming(sansDecalage, l))).toEqual([
			'après Isha, pendant 1 h',
			'nach Ischa, 1 Stunde lang',
			'dopo Isha, per 1 ora',
			'after Isha, for 1 hour',
			'بعد العشاء، لمدة ساعة'
		]);
	});

	it.each([
		[1, ['1 min', '1 Minute', '1 minuto', '1 minute', 'دقيقة']],
		[2, ['2 min', '2 Minuten', '2 minuti', '2 minutes', 'دقيقتين']],
		[5, ['5 min', '5 Minuten', '5 minuti', '5 minutes', '5 دقائق']],
		[45, ['45 min', '45 Minuten', '45 minuti', '45 minutes', '45 دقيقة']],
		[120, ['2 h', '2 Stunden', '2 ore', '2 hours', 'ساعتين']],
		[
			125,
			['2 h 05', '2 Stunden 5 Minuten', '2 ore e 5 minuti', '2 hours 5 minutes', 'ساعتين و5 دقائق']
		],
		[180, ['3 h', '3 Stunden', '3 ore', '3 hours', '3 ساعات']]
	])('writes a duration of %i minutes in each language', (minutes, attendus) => {
		expect(LANGUES_DE_L_ESPACE.map((l) => describeDuration(minutes, l))).toEqual(attendus);
	});

	it.each([
		[
			15,
			[
				'15 min après Maghrib',
				'15 Min. nach Maghrib',
				'15 min dopo Maghrib',
				'15 min after Maghrib',
				'بعد المغرب بـ15 دقيقة'
			]
		],
		[
			-15,
			[
				'15 min avant Maghrib',
				'15 Min. vor Maghrib',
				'15 min prima di Maghrib',
				'15 min before Maghrib',
				'قبل المغرب بـ15 دقيقة'
			]
		],
		[0, ['après Maghrib', 'nach Maghrib', 'dopo Maghrib', 'after Maghrib', 'بعد المغرب']]
	])('says the time of a session anchored %i minutes from Maghrib', (decalage, attendus) => {
		const seance = {
			start: null,
			end: null,
			anchor: { prayer: 'maghrib', offsetMinutes: decalage }
		};
		expect(LANGUES_DE_L_ESPACE.map((l) => describeSessionTime(seance, l))).toEqual(attendus);
	});

	it('says plainly that the time is unknown, in each language', () => {
		expect(
			LANGUES_DE_L_ESPACE.map((l) => describeSessionTime({ start: null, end: null }, l))
		).toEqual([
			'heure à préciser',
			'Uhrzeit noch offen',
			'orario da definire',
			'time to be confirmed',
			'الوقت لم يُحدَّد بعد'
		]);
		expect(describeSessionTime({ start: '19:00', end: '20:30' }, 'ar')).toBe('19:00 – 20:30');
	});
});

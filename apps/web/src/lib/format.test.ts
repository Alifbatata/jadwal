// La mise en mots : dates, rythmes, horaires, et les messages prêts à coller.
//
// Tout part d'une date civile en chaîne, jamais d'un instant : c'est ce qui permet de vérifier la
// veille d'un changement d'heure sans changer le fuseau de la machine (ADR 0012).

import { describe, expect, it } from 'vitest';
import type { IsoDate } from '@jadwal/core';
import {
	describeDuration,
	describeRecurrence,
	describeSessionTime,
	describeTiming,
	joinFrench,
	longDate,
	shortDate,
	weekdayName
} from './format.js';
import { cancellationMessage, moveMessage, weekMessage } from './messages.js';

describe('les dates en français', () => {
	it.each([
		['2026-09-21', 'lundi'],
		['2026-09-27', 'dimanche'],
		// Un 29 février, vérifié contre `Date.UTC` : 2026 n'est pas bissextile, 2028 l'est.
		['2028-02-29', 'mardi']
	])('names the weekday of %s', (date, attendu) => {
		expect(weekdayName(date as IsoDate)).toBe(attendu);
	});

	it('writes the first of the month as « 1er », and the rest in figures', () => {
		expect(shortDate('2026-10-01' as IsoDate)).toBe('jeudi 1er octobre');
		expect(shortDate('2026-10-02' as IsoDate)).toBe('vendredi 2 octobre');
	});

	it('keeps the year where the year matters', () => {
		expect(longDate('2026-08-15' as IsoDate)).toBe('15 août 2026');
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
		expect(phrase).toContain('lundi 21 septembre');
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

	it('says « à » when there is no offset at all', () => {
		expect(
			describeTiming({ kind: 'prayer', prayer: 'isha', offsetMinutes: 0, durationMinutes: 60 })
		).toBe('à Isha, pendant 1 h');
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
		expect(message).toContain('lundi 21 septembre');
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
		expect(message).toContain('« Tafsir » du lundi 21 septembre est annulé');
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
		expect(message).toContain('du lundi 21 septembre');
		expect(message).toContain('au mercredi 23 septembre à 18:00');
	});
});

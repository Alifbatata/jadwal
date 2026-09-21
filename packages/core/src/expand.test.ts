// Tests de l'expansion des occurrences (expand.ts) : rythmes, bornes du cours, pauses, exceptions,
// passage de minuit, tri, garde-fous, prochaines séances et exceptions orphelines. Les horaires
// ancrés sur une prière sont couverts par prayer.test.ts ; ici on vérifie seulement qu'une séance
// déplacée d'un cours ancré perd son ancrage et qu'un cours ancré sans table sort sans heure.
//
// Calendrier de référence, calculé à la main (1970-01-01 est un jeudi) :
// - septembre 2026 commence un mardi : lundis 7, 14, 21, 28 ; mercredis 2, 9, 16, 23, 30 ;
//   vendredis 4, 11, 18, 25. Octobre 2026 commence un jeudi : lundis 5, 12, 19, 26.
// - semaine ISO du lundi 29 décembre 2025 : 29, 30, 31 déc., 1er, 2, 3, 4 janv. 2026. Mercredis
//   suivants : 7, 14, 21, 28 janv. ; 4, 11, 18, 25 févr. 2026. Le 1er décembre 2025 est un lundi.
// - février 2021 : 28 jours, commence un lundi (lundis 1, 8, 15, 22 ; dimanches 7, 14, 21, 28).
// - mai 2026 commence un vendredi : vendredis 1, 8, 15, 22, 29 ; samedis 2, 9, 16, 23, 30 ;
//   dimanches 3, 10, 17, 24, 31 ; lundis 4, 11, 18, 25.
// - derniers dimanches 2026 : 29 mars, 26 avr., 31 mai, 28 juin, 26 juil., 30 août, 27 sept.,
//   25 oct., 29 nov., 27 déc.
// - février 2028 (bissextile) commence un mardi : mardis 1, 8, 15, 22, 29 ; mars 2028 : mardis
//   7, 14, 21, 28.
// - janvier 2026 commence un jeudi : lundis 5, 12, 19, 26 ; vendredis 2, 9, 16, 23, 30.
//   Novembre 2026 commence un dimanche : premier lundi le 2.

import { describe, expect, it } from 'vitest';
import { daysToIsoDate, isoDateToDays } from './dates.js';
import {
	compareOccurrences,
	expandOccurrences,
	findOrphanExceptions,
	isRuleDay,
	nextOccurrences,
	ruleDays,
	sessionDurationMinutes
} from './expand.js';
import type {
	CourseSchedule,
	DateRange,
	IsoDate,
	LocalTime,
	Occurrence,
	PrayerTimesLookup,
	SessionException,
	Weekday
} from './types.js';
import { ValidationError, type ValidationCode, type ValidationIssue } from './validation.js';

/** Cours hebdomadaire du lundi, 19:00-21:00, à partir du mardi 2026-09-01, sans date de fin. */
function course(id: string, overrides: Partial<CourseSchedule> = {}): CourseSchedule {
	return {
		id,
		recurrence: { kind: 'weekly', weekdays: [1], interval: 1, anchorDate: '2026-09-07' },
		timing: { kind: 'fixed', start: '19:00', end: '21:00' },
		startsOn: '2026-09-01',
		sequence: 0,
		...overrides
	};
}

/** Occurrence attendue d'un cours 19:00-21:00 planifié normalement, à compléter par `extra`. */
function occurrence(courseId: string, date: IsoDate, extra: Partial<Occurrence> = {}): Occurrence {
	return {
		courseId,
		date,
		start: '19:00',
		end: '21:00',
		startDayOffset: 0,
		endDayOffset: 0,
		status: 'scheduled',
		...extra
	};
}

const SEPTEMBER: DateRange = { from: '2026-09-01', to: '2026-09-30' };

const days = isoDateToDays;

const dates = (list: readonly Occurrence[]): IsoDate[] => list.map((item) => item.date);

/** Projection lisible « cours date début statut » pour les cas où le tableau complet serait lourd. */
const summary = (list: readonly Occurrence[]): string[] =>
	list.map((item) => `${item.courseId} ${item.date} ${item.start ?? 'null'} ${item.status}`);

/** Codes des anomalies de la ValidationError levée par `fn` ; échoue si rien n'est levé. */
function validationIssues(fn: () => unknown): ValidationIssue[] {
	try {
		fn();
	} catch (error) {
		if (error instanceof ValidationError) return [...error.issues];
		throw error;
	}
	throw new Error('expected a ValidationError');
}

function validationCodes(fn: () => unknown): ValidationCode[] {
	try {
		fn();
	} catch (error) {
		if (error instanceof ValidationError) return error.issues.map((issue) => issue.code);
		throw error;
	}
	throw new Error('expected a ValidationError');
}

describe('expandOccurrences: weekly recurrence', () => {
	it('weekly on a single weekday gives every Monday of September 2026', () => {
		expect(expandOccurrences({ schedules: [course('a')], range: SEPTEMBER })).toEqual([
			occurrence('a', '2026-09-07'),
			occurrence('a', '2026-09-14'),
			occurrence('a', '2026-09-21'),
			occurrence('a', '2026-09-28')
		]);
	});

	it('weekly on several weekdays listed in any order [5, 1, 3]', () => {
		const schedule = course('a', {
			recurrence: { kind: 'weekly', weekdays: [5, 1, 3], interval: 1, anchorDate: '2026-09-01' }
		});
		// Du mardi 1er au vendredi 18 septembre : mer. 2, ven. 4, lun. 7, mer. 9, ven. 11, lun. 14,
		// mer. 16, ven. 18 (le lundi 31 août précède la plage).
		const result = expandOccurrences({
			schedules: [schedule],
			range: { from: '2026-09-01', to: '2026-09-18' }
		});
		expect(dates(result)).toEqual([
			'2026-09-02',
			'2026-09-04',
			'2026-09-07',
			'2026-09-09',
			'2026-09-11',
			'2026-09-14',
			'2026-09-16',
			'2026-09-18'
		]);
	});

	it('weekly on all seven weekdays listed in reverse gives every day of the week', () => {
		const schedule = course('a', {
			recurrence: {
				kind: 'weekly',
				weekdays: [7, 6, 5, 4, 3, 2, 1],
				interval: 1,
				anchorDate: '2026-09-01'
			}
		});
		// Du mardi 1er au lundi 7 septembre : les sept jours, en ordre croissant.
		const result = expandOccurrences({
			schedules: [schedule],
			range: { from: '2026-09-01', to: '2026-09-07' }
		});
		expect(dates(result)).toEqual([
			'2026-09-01',
			'2026-09-02',
			'2026-09-03',
			'2026-09-04',
			'2026-09-05',
			'2026-09-06',
			'2026-09-07'
		]);
	});

	// Cours du mercredi une semaine sur deux, du 15 décembre 2025 à fin février 2026.
	const biweekly = (anchorDate: IsoDate): CourseSchedule =>
		course('bi', {
			recurrence: { kind: 'weekly', weekdays: [3], interval: 2, anchorDate },
			startsOn: '2025-12-15'
		});
	const WINTER: DateRange = { from: '2025-12-15', to: '2026-02-28' };
	// Semaines à distance paire de la semaine du lundi 29 décembre 2025 : 15 déc., 29 déc., 12 janv.,
	// 26 janv., 9 févr., 23 févr. → mercredis 17 déc., 31 déc., 14 janv., 28 janv., 11 févr., 25 févr.
	const EVEN_WEDNESDAYS: IsoDate[] = [
		'2025-12-17',
		'2025-12-31',
		'2026-01-14',
		'2026-01-28',
		'2026-02-11',
		'2026-02-25'
	];
	// Semaines à distance impaire : 22 déc., 5 janv., 19 janv., 2 févr., 16 févr. → mercredis
	// 24 déc., 7 janv., 21 janv., 4 févr., 18 févr.
	const ODD_WEDNESDAYS: IsoDate[] = [
		'2025-12-24',
		'2026-01-07',
		'2026-01-21',
		'2026-02-04',
		'2026-02-18'
	];

	it('every other week across the year change, anchored on Wednesday 2025-12-31', () => {
		const result = expandOccurrences({ schedules: [biweekly('2025-12-31')], range: WINTER });
		expect(dates(result)).toEqual(EVEN_WEDNESDAYS);
	});

	it('every other week: any day of the ISO week of Monday 2025-12-29 anchors the same weeks', () => {
		// Lundi 29 décembre, dimanche 4 janvier, et un lundi 104 semaines plus tôt (2024-01-01).
		for (const anchorDate of ['2025-12-29', '2026-01-04', '2024-01-01'] as const) {
			const result = expandOccurrences({ schedules: [biweekly(anchorDate)], range: WINTER });
			expect(dates(result), `anchor ${anchorDate}`).toEqual(EVEN_WEDNESDAYS);
		}
	});

	it('every other week: an anchor in the following ISO week flips the parity', () => {
		// Lundi 5 janvier 2026 : semaine à distance 1 de celle du 29 décembre.
		const result = expandOccurrences({ schedules: [biweekly('2026-01-05')], range: WINTER });
		expect(dates(result)).toEqual(ODD_WEDNESDAYS);
	});

	it('every other week with an anchor date after the range', () => {
		// Mercredi 4 mars 2026 : semaine du 2 mars, 9 semaines après celle du 29 décembre (impair).
		expect(
			dates(expandOccurrences({ schedules: [biweekly('2026-03-04')], range: WINTER }))
		).toEqual(ODD_WEDNESDAYS);
		// Mercredi 11 mars 2026 : semaine du 9 mars, 10 semaines après (pair).
		expect(
			dates(expandOccurrences({ schedules: [biweekly('2026-03-11')], range: WINTER }))
		).toEqual(EVEN_WEDNESDAYS);
	});

	it('every other week on several weekdays keeps every listed day of the active weeks only', () => {
		// Lundi et vendredi une semaine sur deux, ancré sur la semaine du 29 décembre 2025, plage du
		// lundi 22 décembre 2025 au dimanche 18 janvier 2026 : semaines du 22 déc. et du 5 janv.
		// inactives ; semaine du 29 déc. → lun. 29 déc., ven. 2 janv. ; semaine du 12 janv. → lun. 12,
		// ven. 16 janv.
		const schedule = course('bi', {
			recurrence: { kind: 'weekly', weekdays: [5, 1], interval: 2, anchorDate: '2025-12-31' },
			startsOn: '2025-12-15'
		});
		const result = expandOccurrences({
			schedules: [schedule],
			range: { from: '2025-12-22', to: '2026-01-18' }
		});
		expect(dates(result)).toEqual(['2025-12-29', '2026-01-02', '2026-01-12', '2026-01-16']);
	});
});

describe('expandOccurrences: monthly recurrence', () => {
	const monthly = (
		weekday: Weekday,
		ordinal: 1 | 2 | 3 | 4 | -1,
		overrides: Partial<CourseSchedule> = {}
	): CourseSchedule =>
		course('m', {
			recurrence: { kind: 'monthly', weekday, ordinal },
			startsOn: '2021-01-01',
			...overrides
		});
	const FEB_2021: DateRange = { from: '2021-02-01', to: '2021-02-28' };
	const MAY_2026: DateRange = { from: '2026-05-01', to: '2026-05-31' };

	it.each<[1 | 2 | 3 | 4 | -1, IsoDate]>([
		[1, '2021-02-01'],
		[2, '2021-02-08'],
		[3, '2021-02-15'],
		[4, '2021-02-22'],
		[-1, '2021-02-22']
	])('monthly Monday ordinal %i in a 4-week month (February 2021) is %s', (ordinal, expected) => {
		expect(dates(expandOccurrences({ schedules: [monthly(1, ordinal)], range: FEB_2021 }))).toEqual(
			[expected]
		);
	});

	it('monthly 4th and last Sunday coincide in February 2021 (the 28th)', () => {
		expect(dates(expandOccurrences({ schedules: [monthly(7, 4)], range: FEB_2021 }))).toEqual([
			'2021-02-28'
		]);
		expect(dates(expandOccurrences({ schedules: [monthly(7, -1)], range: FEB_2021 }))).toEqual([
			'2021-02-28'
		]);
	});

	it.each<[Weekday, 1 | 2 | 3 | 4 | -1, IsoDate]>([
		[5, 1, '2026-05-01'],
		[5, 2, '2026-05-08'],
		[5, 3, '2026-05-15'],
		[5, 4, '2026-05-22'],
		[5, -1, '2026-05-29'],
		[6, 4, '2026-05-23'],
		[6, -1, '2026-05-30'],
		[7, 4, '2026-05-24'],
		[7, -1, '2026-05-31'],
		[1, 4, '2026-05-25'],
		[1, -1, '2026-05-25']
	])(
		'monthly weekday %i ordinal %i in a 5-week month (May 2026) is %s',
		(weekday, ordinal, expected) => {
			expect(
				dates(expandOccurrences({ schedules: [monthly(weekday, ordinal)], range: MAY_2026 }))
			).toEqual([expected]);
		}
	);

	it('monthly last Sunday from March to October 2026 (29 March and 25 October included)', () => {
		const result = expandOccurrences({
			schedules: [monthly(7, -1)],
			range: { from: '2026-03-01', to: '2026-10-31' }
		});
		expect(dates(result)).toEqual([
			'2026-03-29',
			'2026-04-26',
			'2026-05-31',
			'2026-06-28',
			'2026-07-26',
			'2026-08-30',
			'2026-09-27',
			'2026-10-25'
		]);
	});

	it('monthly across a year change', () => {
		// Premier lundi : 1er décembre 2025 et 5 janvier 2026.
		const result = expandOccurrences({
			schedules: [monthly(1, 1)],
			range: { from: '2025-12-01', to: '2026-01-31' }
		});
		expect(dates(result)).toEqual(['2025-12-01', '2026-01-05']);
	});

	it('monthly skips the session of the first month when the range starts after it', () => {
		// Premier lundi de septembre 2026 = le 7, avant le début de la plage ; octobre = le 5.
		const result = expandOccurrences({
			schedules: [monthly(1, 1)],
			range: { from: '2026-09-10', to: '2026-10-31' }
		});
		expect(dates(result)).toEqual(['2026-10-05']);
	});
});

describe('expandOccurrences: leap year and listed dates', () => {
	it('weekly Tuesdays of February 2028 include the leap day 2028-02-29', () => {
		const schedule = course('a', {
			recurrence: { kind: 'weekly', weekdays: [2], interval: 1, anchorDate: '2028-02-01' },
			startsOn: '2028-01-01'
		});
		const result = expandOccurrences({
			schedules: [schedule],
			range: { from: '2028-02-01', to: '2028-02-29' }
		});
		expect(dates(result)).toEqual([
			'2028-02-01',
			'2028-02-08',
			'2028-02-15',
			'2028-02-22',
			'2028-02-29'
		]);
	});

	it('monthly last Tuesday of February 2028 is the 29th', () => {
		const schedule = course('a', {
			recurrence: { kind: 'monthly', weekday: 2, ordinal: -1 },
			startsOn: '2028-01-01'
		});
		const result = expandOccurrences({
			schedules: [schedule],
			range: { from: '2028-02-01', to: '2028-03-31' }
		});
		expect(dates(result)).toEqual(['2028-02-29', '2028-03-28']);
	});

	it('listed dates are emitted sorted, including the leap day, and clipped to the range', () => {
		const schedule = course('a', {
			recurrence: {
				kind: 'dates',
				dates: ['2028-03-01', '2028-02-29', '2028-02-28', '2028-04-01', '2028-01-31']
			},
			startsOn: '2028-01-01'
		});
		const result = expandOccurrences({
			schedules: [schedule],
			range: { from: '2028-02-01', to: '2028-03-31' }
		});
		expect(dates(result)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
	});

	it('listed dates outside startsOn..endsOn are dropped', () => {
		const schedule = course('a', {
			recurrence: { kind: 'dates', dates: ['2026-09-01', '2026-09-10', '2026-09-30'] },
			startsOn: '2026-09-02',
			endsOn: '2026-09-29'
		});
		expect(dates(expandOccurrences({ schedules: [schedule], range: SEPTEMBER }))).toEqual([
			'2026-09-10'
		]);
	});
});

describe('expandOccurrences: startsOn and endsOn', () => {
	it('startsOn and endsOn are inclusive bounds', () => {
		const schedule = course('a', { startsOn: '2026-09-07', endsOn: '2026-09-21' });
		expect(dates(expandOccurrences({ schedules: [schedule], range: SEPTEMBER }))).toEqual([
			'2026-09-07',
			'2026-09-14',
			'2026-09-21'
		]);
	});

	it('sessions strictly outside startsOn..endsOn are excluded', () => {
		// Mardi 8 → dimanche 20 : seul le lundi 14 reste.
		const schedule = course('a', { startsOn: '2026-09-08', endsOn: '2026-09-20' });
		expect(dates(expandOccurrences({ schedules: [schedule], range: SEPTEMBER }))).toEqual([
			'2026-09-14'
		]);
	});

	it('endsOn equal to startsOn keeps that single day when it is a rule day', () => {
		const monday = course('a', { startsOn: '2026-09-14', endsOn: '2026-09-14' });
		expect(dates(expandOccurrences({ schedules: [monday], range: SEPTEMBER }))).toEqual([
			'2026-09-14'
		]);
		const tuesday = course('a', { startsOn: '2026-09-15', endsOn: '2026-09-15' });
		expect(expandOccurrences({ schedules: [tuesday], range: SEPTEMBER })).toEqual([]);
	});

	it('a monthly course starting after the session of its first month begins the next month', () => {
		// Premier lundi de septembre 2026 = le 7, avant startsOn (le 10) : octobre 5, novembre 2.
		const schedule = course('m', {
			recurrence: { kind: 'monthly', weekday: 1, ordinal: 1 },
			startsOn: '2026-09-10'
		});
		const result = expandOccurrences({
			schedules: [schedule],
			range: { from: '2026-09-01', to: '2026-11-30' }
		});
		expect(dates(result)).toEqual(['2026-10-05', '2026-11-02']);
	});

	it('gives nothing when the course window does not meet the range', () => {
		const later = course('a', { startsOn: '2026-10-01' });
		expect(expandOccurrences({ schedules: [later], range: SEPTEMBER })).toEqual([]);
		const earlier = course('a', { startsOn: '2026-08-01', endsOn: '2026-08-31' });
		expect(expandOccurrences({ schedules: [earlier], range: SEPTEMBER })).toEqual([]);
	});
});

describe('expandOccurrences: pauses', () => {
	it('a course pause removes the rule days of that course only, bounds included', () => {
		const result = expandOccurrences({
			schedules: [course('a'), course('b')],
			pauses: [{ from: '2026-09-14', to: '2026-09-21', courseId: 'a' }],
			range: SEPTEMBER
		});
		// Les lundis 14 et 21 sont les bornes de la pause : tous deux supprimés pour « a » seulement.
		expect(summary(result)).toEqual([
			'a 2026-09-07 19:00 scheduled',
			'b 2026-09-07 19:00 scheduled',
			'b 2026-09-14 19:00 scheduled',
			'b 2026-09-21 19:00 scheduled',
			'a 2026-09-28 19:00 scheduled',
			'b 2026-09-28 19:00 scheduled'
		]);
	});

	it('a pause whose bounds are not rule days removes nothing', () => {
		// Mardi 15 → dimanche 20 : aucun lundi dedans.
		const result = expandOccurrences({
			schedules: [course('a')],
			pauses: [{ from: '2026-09-15', to: '2026-09-20' }],
			range: SEPTEMBER
		});
		expect(dates(result)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
	});

	it('an organisation pause (no courseId) applies to every course', () => {
		const result = expandOccurrences({
			schedules: [course('a'), course('b')],
			pauses: [{ from: '2026-09-08', to: '2026-09-21' }],
			range: SEPTEMBER
		});
		expect(summary(result)).toEqual([
			'a 2026-09-07 19:00 scheduled',
			'b 2026-09-07 19:00 scheduled',
			'a 2026-09-28 19:00 scheduled',
			'b 2026-09-28 19:00 scheduled'
		]);
	});

	it('a pause on another course has no effect', () => {
		const result = expandOccurrences({
			schedules: [course('a')],
			pauses: [{ from: '2026-09-01', to: '2026-09-30', courseId: 'b' }],
			range: SEPTEMBER
		});
		expect(dates(result)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
	});

	it('a pause on another course does not hide an exception of this course', () => {
		// La pause de « b » sur le lundi 14 supprime la séance de « b » seulement ; l'annulation de « a »
		// le même jour reste prise en compte.
		const result = expandOccurrences({
			schedules: [course('a'), course('b')],
			exceptions: [{ kind: 'cancelled', courseId: 'a', date: '2026-09-14' }],
			pauses: [{ from: '2026-09-14', to: '2026-09-14', courseId: 'b' }],
			range: SEPTEMBER
		});
		expect(summary(result)).toEqual([
			'a 2026-09-07 19:00 scheduled',
			'b 2026-09-07 19:00 scheduled',
			'a 2026-09-14 19:00 cancelled',
			'a 2026-09-21 19:00 scheduled',
			'b 2026-09-21 19:00 scheduled',
			'a 2026-09-28 19:00 scheduled',
			'b 2026-09-28 19:00 scheduled'
		]);
	});

	it('a cancellation dated inside a pause is ignored: no occurrence at all', () => {
		const result = expandOccurrences({
			schedules: [course('a')],
			exceptions: [{ kind: 'cancelled', courseId: 'a', date: '2026-09-14' }],
			pauses: [{ from: '2026-09-14', to: '2026-09-14', courseId: 'a' }],
			range: SEPTEMBER
		});
		expect(result).toEqual([
			occurrence('a', '2026-09-07'),
			occurrence('a', '2026-09-21'),
			occurrence('a', '2026-09-28')
		]);
	});

	it('a move whose origin is inside a pause is ignored: no moved_here either', () => {
		const result = expandOccurrences({
			schedules: [course('a')],
			exceptions: [
				{ kind: 'moved', courseId: 'a', date: '2026-09-14', toDate: '2026-09-16', toStart: '18:00' }
			],
			pauses: [{ from: '2026-09-10', to: '2026-09-18' }],
			range: SEPTEMBER
		});
		expect(result).toEqual([
			occurrence('a', '2026-09-07'),
			occurrence('a', '2026-09-21'),
			occurrence('a', '2026-09-28')
		]);
	});

	it('a move whose destination is inside a pause still produces the moved_here', () => {
		const result = expandOccurrences({
			schedules: [course('a')],
			exceptions: [
				{ kind: 'moved', courseId: 'a', date: '2026-09-07', toDate: '2026-09-15', toStart: '19:00' }
			],
			pauses: [{ from: '2026-09-15', to: '2026-09-15', courseId: 'a' }],
			range: SEPTEMBER
		});
		expect(summary(result)).toEqual([
			'a 2026-09-07 19:00 moved_away',
			'a 2026-09-14 19:00 scheduled',
			'a 2026-09-15 19:00 moved_here',
			'a 2026-09-21 19:00 scheduled',
			'a 2026-09-28 19:00 scheduled'
		]);
	});
});

describe('expandOccurrences: cancelled sessions', () => {
	it('a cancelled session stays in the output with status cancelled and its times', () => {
		const result = expandOccurrences({
			schedules: [course('a')],
			exceptions: [{ kind: 'cancelled', courseId: 'a', date: '2026-09-14' }],
			range: SEPTEMBER
		});
		expect(result).toEqual([
			occurrence('a', '2026-09-07'),
			occurrence('a', '2026-09-14', { status: 'cancelled' }),
			occurrence('a', '2026-09-21'),
			occurrence('a', '2026-09-28')
		]);
	});

	it('a cancellation dated on a rule day outside the range changes nothing', () => {
		// Le lundi 7 est une séance du rythme mais précède la plage : rien à annuler, rien d'ajouté.
		const result = expandOccurrences({
			schedules: [course('a')],
			exceptions: [{ kind: 'cancelled', courseId: 'a', date: '2026-09-07' }],
			range: { from: '2026-09-08', to: '2026-09-30' }
		});
		expect(result).toEqual([
			occurrence('a', '2026-09-14'),
			occurrence('a', '2026-09-21'),
			occurrence('a', '2026-09-28')
		]);
	});
});

describe('expandOccurrences: moved sessions', () => {
	it('moved with origin and destination in the range: moved_away plus moved_here', () => {
		const result = expandOccurrences({
			schedules: [course('a')],
			exceptions: [
				{ kind: 'moved', courseId: 'a', date: '2026-09-14', toDate: '2026-09-16', toStart: '18:30' }
			],
			range: SEPTEMBER
		});
		expect(result).toEqual([
			occurrence('a', '2026-09-07'),
			occurrence('a', '2026-09-14', {
				status: 'moved_away',
				movedTo: { date: '2026-09-16', start: '18:30' }
			}),
			occurrence('a', '2026-09-16', {
				start: '18:30',
				end: '20:30',
				status: 'moved_here',
				originalDate: '2026-09-14'
			}),
			occurrence('a', '2026-09-21'),
			occurrence('a', '2026-09-28')
		]);
		expect(result[2]).not.toHaveProperty('anchor');
	});

	it('moved with the destination outside the range: moved_away only', () => {
		const result = expandOccurrences({
			schedules: [course('a')],
			exceptions: [
				{ kind: 'moved', courseId: 'a', date: '2026-09-28', toDate: '2026-10-05', toStart: '19:00' }
			],
			range: SEPTEMBER
		});
		expect(result).toEqual([
			occurrence('a', '2026-09-07'),
			occurrence('a', '2026-09-14'),
			occurrence('a', '2026-09-21'),
			occurrence('a', '2026-09-28', {
				status: 'moved_away',
				movedTo: { date: '2026-10-05', start: '19:00' }
			})
		]);
	});

	it('moved with the origin outside the range: moved_here only', () => {
		const result = expandOccurrences({
			schedules: [course('a')],
			exceptions: [
				{ kind: 'moved', courseId: 'a', date: '2026-09-07', toDate: '2026-09-10', toStart: '18:00' }
			],
			range: { from: '2026-09-08', to: '2026-09-30' }
		});
		expect(result).toEqual([
			occurrence('a', '2026-09-10', {
				start: '18:00',
				end: '20:00',
				status: 'moved_here',
				originalDate: '2026-09-07'
			}),
			occurrence('a', '2026-09-14'),
			occurrence('a', '2026-09-21'),
			occurrence('a', '2026-09-28')
		]);
	});

	it('moved to the same day at another time: both occurrences on that day', () => {
		const result = expandOccurrences({
			schedules: [course('a')],
			exceptions: [
				{ kind: 'moved', courseId: 'a', date: '2026-09-14', toDate: '2026-09-14', toStart: '20:00' }
			],
			range: SEPTEMBER
		});
		expect(result).toEqual([
			occurrence('a', '2026-09-07'),
			occurrence('a', '2026-09-14', {
				status: 'moved_away',
				movedTo: { date: '2026-09-14', start: '20:00' }
			}),
			occurrence('a', '2026-09-14', {
				start: '20:00',
				end: '22:00',
				status: 'moved_here',
				originalDate: '2026-09-14'
			}),
			occurrence('a', '2026-09-21'),
			occurrence('a', '2026-09-28')
		]);
	});

	it('moved to a day where the course already has a session: two occurrences that day', () => {
		const result = expandOccurrences({
			schedules: [course('a')],
			exceptions: [
				{ kind: 'moved', courseId: 'a', date: '2026-09-14', toDate: '2026-09-21', toStart: '17:00' }
			],
			range: SEPTEMBER
		});
		expect(result).toEqual([
			occurrence('a', '2026-09-07'),
			occurrence('a', '2026-09-14', {
				status: 'moved_away',
				movedTo: { date: '2026-09-21', start: '17:00' }
			}),
			occurrence('a', '2026-09-21', {
				start: '17:00',
				end: '19:00',
				status: 'moved_here',
				originalDate: '2026-09-14'
			}),
			occurrence('a', '2026-09-21'),
			occurrence('a', '2026-09-28')
		]);
	});
});

describe('expandOccurrences: prayer-anchored courses', () => {
	// Maghrib à 19:47 tous les jours : 19:47 + 10 min = 19:57, arrondi à 20:00 ; fin 21:00.
	const table: PrayerTimesLookup = (date) => ({
		date,
		fajr: '05:30',
		dhuhr: '13:00',
		asr: '16:30',
		maghrib: '19:47',
		isha: '21:15'
	});
	const anchored = course('p', {
		timing: { kind: 'prayer', prayer: 'maghrib', offsetMinutes: 10, durationMinutes: 60 }
	});
	const anchor = { prayer: 'maghrib', offsetMinutes: 10 } as const;

	it('a moved session of an anchored course takes toStart as a fixed time and loses its anchor', () => {
		const result = expandOccurrences({
			schedules: [anchored],
			exceptions: [
				{ kind: 'moved', courseId: 'p', date: '2026-09-14', toDate: '2026-09-16', toStart: '18:00' }
			],
			range: { from: '2026-09-07', to: '2026-09-16' },
			prayerTimes: table
		});
		expect(result).toEqual([
			occurrence('p', '2026-09-07', { start: '20:00', end: '21:00', anchor }),
			occurrence('p', '2026-09-14', {
				start: '20:00',
				end: '21:00',
				anchor,
				status: 'moved_away',
				movedTo: { date: '2026-09-16', start: '18:00' }
			}),
			occurrence('p', '2026-09-16', {
				start: '18:00',
				end: '19:00',
				status: 'moved_here',
				originalDate: '2026-09-14'
			})
		]);
		expect(result[2]).not.toHaveProperty('anchor');
	});

	it('an anchored course without a prayer table gives null times with the anchor present', () => {
		const result = expandOccurrences({
			schedules: [anchored],
			range: { from: '2026-09-07', to: '2026-09-13' }
		});
		expect(result).toEqual([occurrence('p', '2026-09-07', { start: null, end: null, anchor })]);
	});
});

describe('expandOccurrences: sessions crossing midnight', () => {
	const night = course('n', { timing: { kind: 'fixed', start: '23:00', end: '01:00' } });

	it('fixed 23:00 → 01:00 ends the next day', () => {
		const result = expandOccurrences({
			schedules: [night],
			range: { from: '2026-09-07', to: '2026-09-07' }
		});
		expect(result).toEqual([
			occurrence('n', '2026-09-07', { start: '23:00', end: '01:00', endDayOffset: 1 })
		]);
	});

	it('fixed with end equal to start lasts 24 hours and ends the next day', () => {
		const allDay = course('d', { timing: { kind: 'fixed', start: '19:00', end: '19:00' } });
		const result = expandOccurrences({
			schedules: [allDay],
			range: { from: '2026-09-07', to: '2026-09-07' }
		});
		expect(result).toEqual([
			occurrence('d', '2026-09-07', { start: '19:00', end: '19:00', endDayOffset: 1 })
		]);
		expect(sessionDurationMinutes(allDay.timing)).toBe(1440);
	});

	it('a moved 23:00 → 01:00 session with toStart 22:30 ends at 00:30 the next day', () => {
		const result = expandOccurrences({
			schedules: [night],
			exceptions: [
				{ kind: 'moved', courseId: 'n', date: '2026-09-07', toDate: '2026-09-08', toStart: '22:30' }
			],
			range: { from: '2026-09-07', to: '2026-09-08' }
		});
		expect(result).toEqual([
			occurrence('n', '2026-09-07', {
				start: '23:00',
				end: '01:00',
				endDayOffset: 1,
				status: 'moved_away',
				movedTo: { date: '2026-09-08', start: '22:30' }
			}),
			occurrence('n', '2026-09-08', {
				start: '22:30',
				end: '00:30',
				endDayOffset: 1,
				status: 'moved_here',
				originalDate: '2026-09-07'
			})
		]);
	});
});

describe('expandOccurrences: sort order', () => {
	it('sorts by date, then start (null last), then courseId, then status', () => {
		const schedules = [
			course('z', {
				timing: { kind: 'prayer', prayer: 'isha', offsetMinutes: 0, durationMinutes: 60 }
			}),
			course('b'),
			course('c', { timing: { kind: 'fixed', start: '10:00', end: '11:00' } }),
			course('a')
		];
		const result = expandOccurrences({
			schedules,
			exceptions: [
				{
					kind: 'moved',
					courseId: 'a',
					date: '2026-09-07',
					toDate: '2026-09-07',
					toStart: '19:00'
				},
				{ kind: 'cancelled', courseId: 'b', date: '2026-09-14' }
			],
			range: { from: '2026-09-07', to: '2026-09-14' }
		});
		expect(summary(result)).toEqual([
			'c 2026-09-07 10:00 scheduled',
			'a 2026-09-07 19:00 moved_away',
			'a 2026-09-07 19:00 moved_here',
			'b 2026-09-07 19:00 scheduled',
			'z 2026-09-07 null scheduled',
			'c 2026-09-14 10:00 scheduled',
			'a 2026-09-14 19:00 scheduled',
			'b 2026-09-14 19:00 cancelled',
			'z 2026-09-14 null scheduled'
		]);
	});
});

describe('compareOccurrences', () => {
	it('orders by date first, whatever the start', () => {
		const early = occurrence('b', '2026-09-07', { start: '23:00', end: '23:30' });
		const late = occurrence('a', '2026-09-08', { start: '08:00', end: '09:00' });
		expect(compareOccurrences(early, late)).toBeLessThan(0);
		expect(compareOccurrences(late, early)).toBeGreaterThan(0);
	});

	it('a start on the next day counts 24 hours more', () => {
		const evening = occurrence('a', '2026-09-07', { start: '23:00', end: '23:30' });
		const afterMidnight = occurrence('a', '2026-09-07', {
			start: '01:00',
			end: '02:00',
			startDayOffset: 1
		});
		expect(compareOccurrences(evening, afterMidnight)).toBeLessThan(0);
		expect(compareOccurrences(afterMidnight, evening)).toBeGreaterThan(0);
	});

	it('an unknown start sorts last, and two unknown starts fall back to courseId', () => {
		const known = occurrence('z', '2026-09-07');
		const unknownA = occurrence('a', '2026-09-07', { start: null, end: null });
		const unknownB = occurrence('b', '2026-09-07', { start: null, end: null });
		expect(compareOccurrences(known, unknownA)).toBeLessThan(0);
		expect(compareOccurrences(unknownA, known)).toBeGreaterThan(0);
		expect(compareOccurrences(unknownA, unknownB)).toBeLessThan(0);
		expect(compareOccurrences(unknownB, unknownA)).toBeGreaterThan(0);
	});

	it('orders by courseId then status: scheduled, cancelled, moved_away, moved_here', () => {
		expect(
			compareOccurrences(occurrence('a', '2026-09-07'), occurrence('b', '2026-09-07'))
		).toBeLessThan(0);
		const statuses = ['scheduled', 'cancelled', 'moved_away', 'moved_here'] as const;
		for (let index = 0; index < statuses.length - 1; index += 1) {
			const before = occurrence('a', '2026-09-07', { status: statuses[index] });
			const after = occurrence('a', '2026-09-07', { status: statuses[index + 1] });
			expect(compareOccurrences(before, after), `${before.status} < ${after.status}`).toBeLessThan(
				0
			);
			expect(compareOccurrences(after, before)).toBeGreaterThan(0);
		}
		expect(compareOccurrences(occurrence('a', '2026-09-07'), occurrence('a', '2026-09-07'))).toBe(
			0
		);
	});
});

describe('expandOccurrences: guard rails', () => {
	it('rejects a range whose from is after to with range_inverted', () => {
		expect(
			validationCodes(() =>
				expandOccurrences({
					schedules: [course('a')],
					range: { from: '2026-09-02', to: '2026-09-01' }
				})
			)
		).toEqual(['range_inverted']);
	});

	it('rejects a range of 401 days with range_too_long', () => {
		// Du 1er janvier 2026 au 5 février 2027 inclus : 365 (2026) + 31 (janvier) + 5 = 401 jours.
		expect(
			validationCodes(() =>
				expandOccurrences({
					schedules: [course('a')],
					range: { from: '2026-01-01', to: '2027-02-05' }
				})
			)
		).toEqual(['range_too_long']);
	});

	it('accepts a range of exactly 400 days', () => {
		// Du 1er janvier 2026 au 4 février 2027 inclus : 365 (2026) + 31 (janvier) + 4 = 400 jours.
		const schedule = course('a', {
			recurrence: { kind: 'dates', dates: ['2026-01-01', '2027-02-04'] },
			startsOn: '2026-01-01'
		});
		const result = expandOccurrences({
			schedules: [schedule],
			range: { from: '2026-01-01', to: '2027-02-04' }
		});
		expect(dates(result)).toEqual(['2026-01-01', '2027-02-04']);
	});

	it('rejects invalid date strings in the range', () => {
		expect(
			validationCodes(() =>
				expandOccurrences({
					schedules: [course('a')],
					range: { from: '2026-02-30', to: '2026-03-31' }
				})
			)
		).toEqual(['invalid_date']);
		expect(
			validationCodes(() =>
				expandOccurrences({
					schedules: [],
					// Format non ISO : le type IsoDate l'interdit, d'où le cast d'entrée invalide.
					range: { from: '2026-09-01', to: '30/09/2026' as unknown as IsoDate }
				})
			)
		).toEqual(['invalid_date']);
	});

	it('rejects invalid schedules with the validation issues', () => {
		const broken = course('a', {
			recurrence: { kind: 'weekly', weekdays: [], interval: 1, anchorDate: '2026-09-07' },
			endsOn: '2026-08-31'
		});
		const codes = validationCodes(() =>
			expandOccurrences({ schedules: [broken], range: SEPTEMBER })
		);
		expect(codes).toEqual(['ends_before_starts', 'weekdays_empty']);
		const garbage = {
			id: 'g',
			recurrence: { kind: 'never' },
			timing: { kind: 'fixed', start: '19:00', end: '25:00' },
			startsOn: 'today',
			sequence: -1
		} as unknown as CourseSchedule;
		expect(
			validationCodes(() => expandOccurrences({ schedules: [garbage], range: SEPTEMBER }))
		).toEqual(['invalid_sequence', 'invalid_date', 'invalid_kind', 'invalid_time']);
	});

	it('rejects duplicate course ids with id_duplicate', () => {
		expect(
			validationCodes(() =>
				expandOccurrences({ schedules: [course('a'), course('a')], range: SEPTEMBER })
			)
		).toEqual(['id_duplicate']);
	});

	it('rejects two exceptions for the same course and date with exception_duplicate', () => {
		expect(
			validationCodes(() =>
				expandOccurrences({
					schedules: [course('a')],
					exceptions: [
						{ kind: 'cancelled', courseId: 'a', date: '2026-09-14' },
						{
							kind: 'moved',
							courseId: 'a',
							date: '2026-09-14',
							toDate: '2026-09-15',
							toStart: '19:00'
						}
					],
					range: SEPTEMBER
				})
			)
		).toEqual(['exception_duplicate']);
	});

	it('rejects an inverted pause and an invalid exception', () => {
		expect(
			validationCodes(() =>
				expandOccurrences({
					schedules: [course('a')],
					exceptions: [
						{
							kind: 'moved',
							courseId: 'a',
							date: '2026-09-14',
							toDate: '2026-09-31',
							toStart: '9:00'
						}
					],
					pauses: [{ from: '2026-09-20', to: '2026-09-19' }],
					range: SEPTEMBER
				})
			)
		).toEqual(['invalid_date', 'invalid_time', 'pause_inverted']);
	});

	it('accepts an empty schedules list and returns no occurrence', () => {
		expect(
			expandOccurrences({
				schedules: [],
				exceptions: [{ kind: 'cancelled', courseId: 'a', date: '2026-09-14' }],
				pauses: [{ from: '2026-09-01', to: '2026-09-30' }],
				range: SEPTEMBER
			})
		).toEqual([]);
	});

	it('throws a ValidationError instance carrying path and message', () => {
		let caught: unknown;
		try {
			expandOccurrences({ schedules: [], range: { from: '2026-09-02', to: '2026-09-01' } });
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(ValidationError);
		const error = caught as ValidationError;
		expect(error.name).toBe('ValidationError');
		expect(error.issues).toEqual([
			{ code: 'range_inverted', path: 'range.to', message: 'to is before from' }
		]);
		expect(error.message).toBe('range.to: to is before from');
	});
});

describe('findOrphanExceptions', () => {
	const schedules: CourseSchedule[] = [
		course('a', { endsOn: '2026-09-30' }),
		course('bi', {
			recurrence: { kind: 'weekly', weekdays: [3], interval: 2, anchorDate: '2025-12-31' },
			startsOn: '2025-12-15'
		}),
		course('m', { recurrence: { kind: 'monthly', weekday: 1, ordinal: 1 } }),
		course('d', { recurrence: { kind: 'dates', dates: ['2026-09-10'] } })
	];
	const orphansOf = (exception: SessionException) => findOrphanExceptions(schedules, [exception]);

	it('reports an exception whose course does not exist', () => {
		const exception: SessionException = { kind: 'cancelled', courseId: 'x', date: '2026-09-07' };
		expect(orphansOf(exception)).toEqual([{ exception, reason: 'unknown_course' }]);
	});

	it('reports a date on the wrong weekday', () => {
		const exception: SessionException = { kind: 'cancelled', courseId: 'a', date: '2026-09-08' };
		expect(orphansOf(exception)).toEqual([{ exception, reason: 'not_an_occurrence' }]);
	});

	it('reports a Monday outside startsOn..endsOn', () => {
		const before: SessionException = { kind: 'cancelled', courseId: 'a', date: '2026-08-31' };
		const after: SessionException = {
			kind: 'moved',
			courseId: 'a',
			date: '2026-10-05',
			toDate: '2026-10-06',
			toStart: '19:00'
		};
		expect(findOrphanExceptions(schedules, [before, after])).toEqual([
			{ exception: before, reason: 'not_an_occurrence' },
			{ exception: after, reason: 'not_an_occurrence' }
		]);
	});

	it('reports a Wednesday of an inactive week of an every-other-week course', () => {
		// Le 7 janvier 2026 est dans la semaine du 5 janvier, inactive ; le 14 janvier est actif.
		const inactive: SessionException = { kind: 'cancelled', courseId: 'bi', date: '2026-01-07' };
		const active: SessionException = { kind: 'cancelled', courseId: 'bi', date: '2026-01-14' };
		expect(findOrphanExceptions(schedules, [inactive, active])).toEqual([
			{ exception: inactive, reason: 'not_an_occurrence' }
		]);
	});

	it('reports a date on the wrong ordinal of a monthly course', () => {
		// Deuxième lundi de septembre 2026 (le 14) pour un cours du premier lundi (le 7).
		const second: SessionException = { kind: 'cancelled', courseId: 'm', date: '2026-09-14' };
		const first: SessionException = { kind: 'cancelled', courseId: 'm', date: '2026-09-07' };
		expect(findOrphanExceptions(schedules, [second, first])).toEqual([
			{ exception: second, reason: 'not_an_occurrence' }
		]);
	});

	it('reports a date absent from a dates list', () => {
		const absent: SessionException = { kind: 'cancelled', courseId: 'd', date: '2026-09-11' };
		const listed: SessionException = { kind: 'cancelled', courseId: 'd', date: '2026-09-10' };
		expect(findOrphanExceptions(schedules, [absent, listed])).toEqual([
			{ exception: absent, reason: 'not_an_occurrence' }
		]);
	});

	it('does not treat a paused rule day as an orphan (pauses are not considered)', () => {
		const exception: SessionException = { kind: 'cancelled', courseId: 'a', date: '2026-09-14' };
		expect(orphansOf(exception)).toEqual([]);
		// La même exception est bien ignorée par l'expansion quand une pause couvre sa date.
		const result = expandOccurrences({
			schedules,
			exceptions: [exception],
			pauses: [{ from: '2026-09-14', to: '2026-09-14' }],
			range: { from: '2026-09-14', to: '2026-09-14' }
		});
		expect(result).toEqual([]);
	});

	it('returns an empty list when every exception is a session', () => {
		expect(findOrphanExceptions(schedules, [])).toEqual([]);
		expect(
			findOrphanExceptions(schedules, [
				{ kind: 'cancelled', courseId: 'a', date: '2026-09-07' },
				{
					kind: 'moved',
					courseId: 'bi',
					date: '2025-12-17',
					toDate: '2025-12-18',
					toStart: '10:00'
				}
			])
		).toEqual([]);
	});

	it('validates its input like expandOccurrences', () => {
		expect(validationCodes(() => findOrphanExceptions([course('a'), course('a')], []))).toEqual([
			'id_duplicate'
		]);
		expect(
			validationCodes(() =>
				findOrphanExceptions(schedules, [{ kind: 'cancelled', courseId: '', date: '2026-09-07' }])
			)
		).toEqual(['id_empty']);
	});

	it('expandOccurrences ignores orphan exceptions', () => {
		const result = expandOccurrences({
			schedules: [course('a')],
			exceptions: [
				{ kind: 'cancelled', courseId: 'a', date: '2026-09-08' },
				{
					kind: 'moved',
					courseId: 'a',
					date: '2026-09-09',
					toDate: '2026-09-10',
					toStart: '19:00'
				},
				{ kind: 'moved', courseId: 'x', date: '2026-09-07', toDate: '2026-09-11', toStart: '19:00' }
			],
			range: SEPTEMBER
		});
		expect(result).toEqual([
			occurrence('a', '2026-09-07'),
			occurrence('a', '2026-09-14'),
			occurrence('a', '2026-09-21'),
			occurrence('a', '2026-09-28')
		]);
	});
});

describe('ruleDays and isRuleDay', () => {
	it('ruleDays returns the day numbers of the rule in ascending order', () => {
		const result = ruleDays(course('a'), days('2026-09-01'), days('2026-09-30'));
		expect(result).toEqual([
			days('2026-09-07'),
			days('2026-09-14'),
			days('2026-09-21'),
			days('2026-09-28')
		]);
		expect(result.map(daysToIsoDate)).toEqual([
			'2026-09-07',
			'2026-09-14',
			'2026-09-21',
			'2026-09-28'
		]);
	});

	it('ruleDays clips to the course bounds and returns [] when the window is empty', () => {
		const schedule = course('a', { startsOn: '2026-09-08', endsOn: '2026-09-20' });
		expect(ruleDays(schedule, days('2026-09-01'), days('2026-09-30'))).toEqual([
			days('2026-09-14')
		]);
		expect(ruleDays(schedule, days('2026-09-21'), days('2026-09-30'))).toEqual([]);
		expect(ruleDays(schedule, days('2026-08-01'), days('2026-09-07'))).toEqual([]);
		expect(ruleDays(schedule, days('2026-09-14'), days('2026-09-13'))).toEqual([]);
	});

	it('ruleDays every other week keeps only the active weeks', () => {
		const schedule = course('bi', {
			recurrence: { kind: 'weekly', weekdays: [3], interval: 2, anchorDate: '2025-12-31' },
			startsOn: '2025-12-15'
		});
		// Plage du 1er au 31 janvier 2026 : mercredis actifs 14 et 28 (7 et 21 inactifs).
		expect(ruleDays(schedule, days('2026-01-01'), days('2026-01-31')).map(daysToIsoDate)).toEqual([
			'2026-01-14',
			'2026-01-28'
		]);
	});

	it('isRuleDay is true on a rule day within bounds and false otherwise', () => {
		const schedule = course('a', { startsOn: '2026-09-07', endsOn: '2026-09-21' });
		expect(isRuleDay(schedule, days('2026-09-07'))).toBe(true);
		expect(isRuleDay(schedule, days('2026-09-21'))).toBe(true);
		expect(isRuleDay(schedule, days('2026-09-08'))).toBe(false);
		expect(isRuleDay(schedule, days('2026-08-31'))).toBe(false);
		expect(isRuleDay(schedule, days('2026-09-28'))).toBe(false);
		const monthly = course('m', { recurrence: { kind: 'monthly', weekday: 7, ordinal: -1 } });
		expect(isRuleDay(monthly, days('2026-09-27'))).toBe(true);
		expect(isRuleDay(monthly, days('2026-09-20'))).toBe(false);
	});
});

describe('nextOccurrences', () => {
	it('returns up to limit sessions from the given day, in order', () => {
		const result = nextOccurrences({ schedules: [course('a')], from: '2026-09-01', limit: 3 });
		expect(result).toEqual([
			occurrence('a', '2026-09-07'),
			occurrence('a', '2026-09-14'),
			occurrence('a', '2026-09-21')
		]);
		expect(nextOccurrences({ schedules: [course('a')], from: '2026-09-07', limit: 1 })).toEqual([
			occurrence('a', '2026-09-07')
		]);
	});

	it('fromTime excludes sessions already started on the from day and keeps unknown starts', () => {
		const schedules = [
			course('a'),
			course('c', { timing: { kind: 'fixed', start: '10:00', end: '11:00' } }),
			course('z', {
				timing: { kind: 'prayer', prayer: 'isha', offsetMinutes: 0, durationMinutes: 60 }
			})
		];
		const result = nextOccurrences({
			schedules,
			from: '2026-09-07',
			fromTime: '12:00',
			limit: 10,
			horizonDays: 8
		});
		// Lundi 7 : « c » (10:00) est passé ; « z » sans heure est conservé. Lundi 14 : tout.
		expect(summary(result)).toEqual([
			'a 2026-09-07 19:00 scheduled',
			'z 2026-09-07 null scheduled',
			'c 2026-09-14 10:00 scheduled',
			'a 2026-09-14 19:00 scheduled',
			'z 2026-09-14 null scheduled'
		]);
	});

	it('fromTime equal to the start keeps the session (only earlier starts are past)', () => {
		const result = nextOccurrences({
			schedules: [course('a')],
			from: '2026-09-07',
			fromTime: '19:00',
			limit: 1
		});
		expect(dates(result)).toEqual(['2026-09-07']);
		const later = nextOccurrences({
			schedules: [course('a')],
			from: '2026-09-07',
			fromTime: '19:01',
			limit: 1
		});
		expect(dates(later)).toEqual(['2026-09-14']);
	});

	it('fromTime also drops a moved_here session that starts earlier on the from day', () => {
		// Le lundi 14 est déplacé au lundi 7 à 08:00 : sans fromTime, cette séance précède la séance
		// normale du 7 (19:00) ; avec fromTime 12:00, elle est passée et disparaît.
		const input = {
			schedules: [course('a')],
			exceptions: [
				{ kind: 'moved', courseId: 'a', date: '2026-09-14', toDate: '2026-09-07', toStart: '08:00' }
			] as SessionException[],
			from: '2026-09-07' as IsoDate,
			limit: 2
		};
		expect(summary(nextOccurrences(input))).toEqual([
			'a 2026-09-07 08:00 moved_here',
			'a 2026-09-07 19:00 scheduled'
		]);
		expect(summary(nextOccurrences({ ...input, fromTime: '12:00' }))).toEqual([
			'a 2026-09-07 19:00 scheduled',
			'a 2026-09-21 19:00 scheduled'
		]);
	});

	it('skips cancelled and moved_away sessions and includes moved_here', () => {
		const result = nextOccurrences({
			schedules: [course('a')],
			exceptions: [
				{ kind: 'cancelled', courseId: 'a', date: '2026-09-07' },
				{ kind: 'moved', courseId: 'a', date: '2026-09-14', toDate: '2026-09-16', toStart: '18:00' }
			],
			from: '2026-09-01',
			limit: 3
		});
		expect(result).toEqual([
			occurrence('a', '2026-09-16', {
				start: '18:00',
				end: '20:00',
				status: 'moved_here',
				originalDate: '2026-09-14'
			}),
			occurrence('a', '2026-09-21'),
			occurrence('a', '2026-09-28')
		]);
	});

	it('respects pauses', () => {
		const result = nextOccurrences({
			schedules: [course('a')],
			pauses: [{ from: '2026-09-07', to: '2026-09-14' }],
			from: '2026-09-01',
			limit: 2
		});
		expect(dates(result)).toEqual(['2026-09-21', '2026-09-28']);
	});

	it('horizonDays limits the exploration: a small horizon yields fewer results', () => {
		// 7 jours à partir du 1er septembre : du 1er au 7 inclus, un seul lundi.
		expect(
			dates(
				nextOccurrences({ schedules: [course('a')], from: '2026-09-01', limit: 5, horizonDays: 7 })
			)
		).toEqual(['2026-09-07']);
		// 6 jours : du 1er au 6, aucun lundi.
		expect(
			nextOccurrences({ schedules: [course('a')], from: '2026-09-01', limit: 5, horizonDays: 6 })
		).toEqual([]);
	});

	it('finds a monthly session beyond the first 56-day chunk', () => {
		// Dernier dimanche du mois à partir de novembre 2026 : 29 novembre (89 jours après le
		// 1er septembre, deuxième tranche) puis 27 décembre (117 jours, troisième tranche).
		const schedule = course('m', {
			recurrence: { kind: 'monthly', weekday: 7, ordinal: -1 },
			startsOn: '2026-11-01'
		});
		const result = nextOccurrences({ schedules: [schedule], from: '2026-09-01', limit: 2 });
		expect(dates(result)).toEqual(['2026-11-29', '2026-12-27']);
	});

	it('finds a moved_here whose origin lies in the previous chunk', () => {
		// La première tranche va du 1er septembre au 26 octobre (56 jours) ; la séance du lundi
		// 26 octobre est déplacée au mardi 27, premier jour de la deuxième tranche.
		const result = nextOccurrences({
			schedules: [course('a')],
			exceptions: [
				{ kind: 'moved', courseId: 'a', date: '2026-10-26', toDate: '2026-10-27', toStart: '18:00' }
			],
			from: '2026-09-01',
			limit: 10,
			horizonDays: 60
		});
		expect(summary(result)).toEqual([
			'a 2026-09-07 19:00 scheduled',
			'a 2026-09-14 19:00 scheduled',
			'a 2026-09-21 19:00 scheduled',
			'a 2026-09-28 19:00 scheduled',
			'a 2026-10-05 19:00 scheduled',
			'a 2026-10-12 19:00 scheduled',
			'a 2026-10-19 19:00 scheduled',
			'a 2026-10-27 18:00 moved_here'
		]);
	});

	it('explores 400 days by default', () => {
		// 400 jours à partir du 1er septembre 2026 : jusqu'au 5 octobre 2027 inclus.
		const schedule = course('d', {
			recurrence: { kind: 'dates', dates: ['2027-10-05', '2027-10-06'] },
			startsOn: '2026-01-01'
		});
		const result = nextOccurrences({ schedules: [schedule], from: '2026-09-01', limit: 5 });
		expect(dates(result)).toEqual(['2027-10-05']);
		expect(
			nextOccurrences({ schedules: [schedule], from: '2026-09-01', limit: 5, horizonDays: 401 })
		).toHaveLength(2);
	});

	it('rejects a limit that is not a positive integer with invalid_limit', () => {
		for (const limit of [0, -1, 1.5, Number.NaN]) {
			expect(
				validationCodes(() =>
					nextOccurrences({ schedules: [course('a')], from: '2026-09-01', limit })
				),
				`limit ${limit}`
			).toEqual(['invalid_limit']);
		}
	});

	it('rejects a horizon that is not a positive integer with invalid_horizon', () => {
		for (const horizonDays of [0, -7, 2.5]) {
			expect(
				validationCodes(() =>
					nextOccurrences({ schedules: [course('a')], from: '2026-09-01', limit: 1, horizonDays })
				),
				`horizonDays ${horizonDays}`
			).toEqual(['invalid_horizon']);
		}
	});

	it('rejects an invalid from date and invalid schedules', () => {
		// Une seule anomalie, sur le chemin de la valeur fournie par l'appelant (`from`, pas `range.*`).
		expect(
			validationIssues(() =>
				nextOccurrences({ schedules: [course('a')], from: '2026-13-01', limit: 1 })
			)
		).toEqual([
			{
				code: 'invalid_date',
				path: 'from',
				message: 'expected a valid ISO date (YYYY-MM-DD), got "2026-13-01"'
			}
		]);
		expect(
			validationCodes(() =>
				nextOccurrences({ schedules: [course('a'), course('a')], from: '2026-09-01', limit: 1 })
			)
		).toEqual(['id_duplicate']);
	});

	it('rejects an invalid fromTime with a typed issue instead of a TypeError', () => {
		for (const fromTime of ['9:00', '25:00', '19:00:00', '' as const]) {
			expect(
				validationIssues(() =>
					nextOccurrences({
						schedules: [course('a')],
						from: '2026-09-01',
						limit: 1,
						fromTime: fromTime as LocalTime
					})
				),
				`fromTime ${JSON.stringify(fromTime)}`
			).toEqual([
				{
					code: 'invalid_time',
					path: 'fromTime',
					message: `expected a local time (HH:MM), got ${JSON.stringify(fromTime)}`
				}
			]);
		}
	});
});

describe('sessionDurationMinutes', () => {
	it('fixed timing: end minus start', () => {
		expect(sessionDurationMinutes({ kind: 'fixed', start: '19:00', end: '21:00' })).toBe(120);
		expect(sessionDurationMinutes({ kind: 'fixed', start: '09:15', end: '09:20' })).toBe(5);
	});

	it('fixed timing crossing midnight ends the next day', () => {
		expect(sessionDurationMinutes({ kind: 'fixed', start: '23:00', end: '01:00' })).toBe(120);
		expect(sessionDurationMinutes({ kind: 'fixed', start: '22:30', end: '00:30' })).toBe(120);
	});

	it('fixed timing with end equal to start lasts 24 hours', () => {
		expect(sessionDurationMinutes({ kind: 'fixed', start: '19:00', end: '19:00' })).toBe(1440);
		expect(sessionDurationMinutes({ kind: 'fixed', start: '00:00', end: '00:00' })).toBe(1440);
	});

	it('prayer timing: durationMinutes as is', () => {
		expect(
			sessionDurationMinutes({
				kind: 'prayer',
				prayer: 'fajr',
				offsetMinutes: -30,
				durationMinutes: 90
			})
		).toBe(90);
	});
});

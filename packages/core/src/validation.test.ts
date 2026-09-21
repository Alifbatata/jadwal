// Tests du module de validation : chaque code d'anomalie est obtenu au moins une fois avec le bon
// chemin, les bornes documentées sont vérifiées des deux côtés, et les anomalies se cumulent au sein
// d'un même appel. Les entrées invalides sont construites par un cast explicite `as unknown as …`.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, daysToIsoDate } from './dates.js';
import type {
	CourseSchedule,
	IsoDate,
	Pause,
	Recurrence,
	SessionException,
	Timing,
	Weekday
} from './types.js';
import {
	MAX_DURATION_MINUTES,
	MAX_OFFSET_MINUTES,
	MAX_RANGE_DAYS,
	MIN_DURATION_MINUTES,
	MIN_OFFSET_MINUTES,
	ValidationError,
	assertValid,
	validateException,
	validateInput,
	validatePause,
	validateRange,
	validateSchedule,
	type ValidationCode,
	type ValidationIssue
} from './validation.js';

type IssuePair = [ValidationCode, string];

/** Réduit une liste d'anomalies à ses paires (code, chemin) pour des comparaisons exactes. */
function pairs(issues: readonly ValidationIssue[]): IssuePair[] {
	return issues.map((issue) => [issue.code, issue.path]);
}

/**
 * Tableau réellement creux (les littéraux à trou sont interdits par ESLint) : un trou est laissé
 * partout où la valeur vaut undefined.
 */
function withHole<T>(values: readonly (T | undefined)[]): T[] {
	const result: T[] = [];
	result.length = values.length;
	values.forEach((value, index) => {
		if (value !== undefined) result[index] = value;
	});
	return result;
}

function thrownBy(fn: () => void): ValidationError {
	try {
		fn();
	} catch (error) {
		if (error instanceof ValidationError) return error;
		throw error;
	}
	return expect.unreachable('expected a ValidationError to be thrown');
}

const WEEKLY_FIXED: CourseSchedule = {
	id: 'arabic-1',
	recurrence: { kind: 'weekly', weekdays: [1, 3], interval: 1, anchorDate: '2026-09-07' },
	timing: { kind: 'fixed', start: '19:00', end: '20:30' },
	startsOn: '2026-09-07',
	sequence: 0
};

const MONTHLY_PRAYER: CourseSchedule = {
	id: 'tafsir',
	recurrence: { kind: 'monthly', weekday: 6, ordinal: -1 },
	timing: { kind: 'prayer', prayer: 'maghrib', offsetMinutes: 15, durationMinutes: 60 },
	startsOn: '2026-01-01',
	endsOn: '2026-12-31',
	sequence: 3
};

const DATES_FIXED: CourseSchedule = {
	id: 'seminar',
	recurrence: { kind: 'dates', dates: ['2026-10-03', '2026-11-07'] },
	timing: { kind: 'fixed', start: '10:00', end: '12:00' },
	startsOn: '2026-10-01',
	sequence: 1
};

function schedule(overrides: Partial<CourseSchedule>): CourseSchedule {
	return { ...WEEKLY_FIXED, ...overrides };
}

function withRecurrence(recurrence: unknown): CourseSchedule {
	return schedule({ recurrence: recurrence as Recurrence });
}

function withTiming(timing: unknown): CourseSchedule {
	return schedule({ timing: timing as Timing });
}

function prayerTiming(overrides: Partial<Extract<Timing, { kind: 'prayer' }>>): Timing {
	return { kind: 'prayer', prayer: 'isha', offsetMinutes: 0, durationMinutes: 90, ...overrides };
}

const CANCELLED: SessionException = { kind: 'cancelled', courseId: 'arabic-1', date: '2026-09-09' };

const MOVED: SessionException = {
	kind: 'moved',
	courseId: 'arabic-1',
	date: '2026-09-14',
	toDate: '2026-09-15',
	toStart: '18:30'
};

describe('exported constants', () => {
	it('documents the range and timing bounds', () => {
		expect(MAX_RANGE_DAYS).toBe(400);
		expect(MIN_OFFSET_MINUTES).toBe(-120);
		expect(MAX_OFFSET_MINUTES).toBe(240);
		expect(MIN_DURATION_MINUTES).toBe(5);
		expect(MAX_DURATION_MINUTES).toBe(1440);
	});
});

describe('ValidationError', () => {
	const issues: ValidationIssue[] = [
		{ code: 'invalid_limit', path: 'limit', message: 'limit must be a positive integer' },
		{ code: 'invalid_horizon', path: 'horizonDays', message: 'horizonDays must be positive' }
	];

	it('is an Error named ValidationError', () => {
		const error = new ValidationError(issues);
		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(ValidationError);
		expect(error.name).toBe('ValidationError');
	});

	it('exposes the issues it was built from', () => {
		const error = new ValidationError(issues);
		expect(error.issues).toEqual(issues);
		expect(error.issues.map((issue) => issue.code)).toEqual(['invalid_limit', 'invalid_horizon']);
	});

	it('concatenates "path: message" for every issue', () => {
		expect(new ValidationError(issues).message).toBe(
			'limit: limit must be a positive integer; horizonDays: horizonDays must be positive'
		);
		expect(new ValidationError([issues[0]!]).message).toBe(
			'limit: limit must be a positive integer'
		);
	});

	it('has an empty message and no issues when built from an empty list', () => {
		const error = new ValidationError([]);
		expect(error.message).toBe('');
		expect(error.issues).toEqual([]);
	});
});

describe('assertValid', () => {
	it('does nothing on an empty list', () => {
		expect(() => assertValid([])).not.toThrow();
	});

	it('throws a ValidationError carrying the issues', () => {
		const issues = validateSchedule(schedule({ id: '', sequence: -1 }));
		const error = thrownBy(() => assertValid(issues));
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('ValidationError');
		expect(error.issues).toEqual(issues);
		expect(error.message).toBe(
			'schedule.id: expected a non-empty string; schedule.sequence: expected a non-negative integer'
		);
	});
});

describe('validateSchedule', () => {
	describe('valid schedules', () => {
		it('returns [] for a weekly schedule with a fixed timing', () => {
			expect(validateSchedule(WEEKLY_FIXED)).toEqual([]);
		});

		it('returns [] for a monthly schedule anchored on a prayer', () => {
			expect(validateSchedule(MONTHLY_PRAYER)).toEqual([]);
		});

		it('returns [] for a list of dates', () => {
			expect(validateSchedule(DATES_FIXED)).toEqual([]);
		});

		it('accepts a fortnightly recurrence and every weekday', () => {
			const recurrence: Recurrence = {
				kind: 'weekly',
				weekdays: [1, 2, 3, 4, 5, 6, 7],
				interval: 2,
				anchorDate: '2026-09-07'
			};
			expect(validateSchedule(schedule({ recurrence }))).toEqual([]);
		});

		it('accepts endsOn equal to startsOn', () => {
			expect(validateSchedule(schedule({ endsOn: WEEKLY_FIXED.startsOn }))).toEqual([]);
		});

		it('accepts an explicitly undefined endsOn', () => {
			expect(validateSchedule(schedule({ endsOn: undefined }))).toEqual([]);
		});

		it('accepts a fixed timing whose end is not after its start (ends next day)', () => {
			expect(validateSchedule(withTiming({ kind: 'fixed', start: '22:00', end: '01:00' }))).toEqual(
				[]
			);
			expect(validateSchedule(withTiming({ kind: 'fixed', start: '22:00', end: '22:00' }))).toEqual(
				[]
			);
		});

		it('accepts every prayer name', () => {
			for (const prayer of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const) {
				expect(validateSchedule(withTiming(prayerTiming({ prayer })))).toEqual([]);
			}
		});

		it('accepts every valid monthly ordinal and weekday', () => {
			for (const ordinal of [1, 2, 3, 4, -1] as const) {
				expect(validateSchedule(withRecurrence({ kind: 'monthly', weekday: 1, ordinal }))).toEqual(
					[]
				);
			}
			for (const weekday of [1, 2, 3, 4, 5, 6, 7] as const) {
				expect(validateSchedule(withRecurrence({ kind: 'monthly', weekday, ordinal: 1 }))).toEqual(
					[]
				);
			}
		});
	});

	describe('id', () => {
		it('reports id_empty on an empty string', () => {
			expect(pairs(validateSchedule(schedule({ id: '' })))).toEqual([['id_empty', 'schedule.id']]);
		});

		it('reports id_empty on a non-string id', () => {
			const broken = { ...WEEKLY_FIXED, id: 42 } as unknown as CourseSchedule;
			expect(pairs(validateSchedule(broken))).toEqual([['id_empty', 'schedule.id']]);
		});
	});

	describe('sequence', () => {
		it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
			'reports invalid_sequence on %s',
			(sequence) => {
				expect(pairs(validateSchedule(schedule({ sequence })))).toEqual([
					['invalid_sequence', 'schedule.sequence']
				]);
			}
		);

		it('reports invalid_sequence on a non-number', () => {
			const broken = { ...WEEKLY_FIXED, sequence: '1' } as unknown as CourseSchedule;
			expect(pairs(validateSchedule(broken))).toEqual([['invalid_sequence', 'schedule.sequence']]);
		});

		it('accepts zero and large integers', () => {
			expect(validateSchedule(schedule({ sequence: 0 }))).toEqual([]);
			expect(validateSchedule(schedule({ sequence: 1_000_000 }))).toEqual([]);
		});
	});

	describe('startsOn and endsOn', () => {
		it.each(['2026-02-30', '2026-13-01', '2026-9-7', '07/09/2026', ''])(
			'reports invalid_date on startsOn %j',
			(startsOn) => {
				const broken = { ...WEEKLY_FIXED, startsOn } as unknown as CourseSchedule;
				expect(pairs(validateSchedule(broken))).toEqual([['invalid_date', 'schedule.startsOn']]);
			}
		);

		it('reports invalid_date on a non-string startsOn and shows the value', () => {
			const broken = { ...WEEKLY_FIXED, startsOn: 20260907 } as unknown as CourseSchedule;
			const issues = validateSchedule(broken);
			expect(pairs(issues)).toEqual([['invalid_date', 'schedule.startsOn']]);
			expect(issues[0]?.message).toBe('expected a valid ISO date (YYYY-MM-DD), got 20260907');
		});

		it('quotes a string value in the invalid_date message', () => {
			const issues = validateSchedule(schedule({ startsOn: '2026-02-30' }));
			expect(issues[0]?.message).toBe('expected a valid ISO date (YYYY-MM-DD), got "2026-02-30"');
		});

		it('applies the Gregorian leap-year rules to 29 February', () => {
			expect(validateSchedule(schedule({ startsOn: '2028-02-29' }))).toEqual([]);
			expect(validateSchedule(schedule({ startsOn: '2000-02-29' }))).toEqual([]);
			expect(pairs(validateSchedule(schedule({ startsOn: '2100-02-29' })))).toEqual([
				['invalid_date', 'schedule.startsOn']
			]);
			expect(pairs(validateSchedule(schedule({ startsOn: '2027-02-29' })))).toEqual([
				['invalid_date', 'schedule.startsOn']
			]);
		});

		it('reports invalid_date on endsOn', () => {
			expect(pairs(validateSchedule(schedule({ endsOn: '2026-04-31' })))).toEqual([
				['invalid_date', 'schedule.endsOn']
			]);
		});

		it('reports ends_before_starts when endsOn is before startsOn', () => {
			expect(
				pairs(validateSchedule(schedule({ startsOn: '2026-09-07', endsOn: '2026-09-06' })))
			).toEqual([['ends_before_starts', 'schedule.endsOn']]);
		});

		it('does not compare the bounds when one of them is invalid', () => {
			expect(
				pairs(validateSchedule(schedule({ startsOn: '2026-99-07', endsOn: '2026-01-01' })))
			).toEqual([['invalid_date', 'schedule.startsOn']]);
			expect(
				pairs(validateSchedule(schedule({ startsOn: '2026-09-07', endsOn: '2020-99-01' })))
			).toEqual([['invalid_date', 'schedule.endsOn']]);
		});
	});

	describe('weekly recurrence', () => {
		it('reports weekdays_empty on an empty array', () => {
			const recurrence = { ...WEEKLY_FIXED.recurrence, weekdays: [] };
			expect(pairs(validateSchedule(withRecurrence(recurrence)))).toEqual([
				['weekdays_empty', 'schedule.recurrence.weekdays']
			]);
		});

		it('reports weekdays_empty on a non-array value', () => {
			const recurrence = { ...WEEKLY_FIXED.recurrence, weekdays: 'monday' };
			expect(pairs(validateSchedule(withRecurrence(recurrence)))).toEqual([
				['weekdays_empty', 'schedule.recurrence.weekdays']
			]);
		});

		it('reports weekdays_duplicate', () => {
			const recurrence = { ...WEEKLY_FIXED.recurrence, weekdays: [1, 3, 1] };
			expect(pairs(validateSchedule(withRecurrence(recurrence)))).toEqual([
				['weekdays_duplicate', 'schedule.recurrence.weekdays']
			]);
		});

		it.each([0, 8, 1.5, -1, Number.NaN])('reports invalid_weekday on %s', (weekday) => {
			const recurrence = { ...WEEKLY_FIXED.recurrence, weekdays: [1, weekday] };
			expect(pairs(validateSchedule(withRecurrence(recurrence)))).toEqual([
				['invalid_weekday', 'schedule.recurrence.weekdays']
			]);
		});

		it('reports invalid_weekday on a non-number entry', () => {
			const recurrence = { ...WEEKLY_FIXED.recurrence, weekdays: ['1'] };
			expect(pairs(validateSchedule(withRecurrence(recurrence)))).toEqual([
				['invalid_weekday', 'schedule.recurrence.weekdays']
			]);
		});

		it('cumulates invalid_weekday and weekdays_duplicate', () => {
			const recurrence = { ...WEEKLY_FIXED.recurrence, weekdays: [0, 0] };
			expect(pairs(validateSchedule(withRecurrence(recurrence)))).toEqual([
				['invalid_weekday', 'schedule.recurrence.weekdays'],
				['weekdays_duplicate', 'schedule.recurrence.weekdays']
			]);
		});

		it.each([3, 0, -1, 1.5, '1'])('reports invalid_interval on %j', (interval) => {
			const recurrence = { ...WEEKLY_FIXED.recurrence, interval };
			expect(pairs(validateSchedule(withRecurrence(recurrence)))).toEqual([
				['invalid_interval', 'schedule.recurrence.interval']
			]);
		});

		it('reports invalid_date on anchorDate', () => {
			const recurrence = { ...WEEKLY_FIXED.recurrence, anchorDate: '2026-00-10' };
			expect(pairs(validateSchedule(withRecurrence(recurrence)))).toEqual([
				['invalid_date', 'schedule.recurrence.anchorDate']
			]);
		});

		it('reports invalid_date on a missing anchorDate', () => {
			const recurrence = { kind: 'weekly', weekdays: [1], interval: 1 };
			expect(pairs(validateSchedule(withRecurrence(recurrence)))).toEqual([
				['invalid_date', 'schedule.recurrence.anchorDate']
			]);
		});
	});

	describe('monthly recurrence', () => {
		it.each([0, 8, 1.5])('reports invalid_weekday on %s', (weekday) => {
			expect(
				pairs(validateSchedule(withRecurrence({ kind: 'monthly', weekday, ordinal: 1 })))
			).toEqual([['invalid_weekday', 'schedule.recurrence.weekday']]);
		});

		it.each([0, 5, -2, 1.5])('reports invalid_ordinal on %s', (ordinal) => {
			expect(
				pairs(validateSchedule(withRecurrence({ kind: 'monthly', weekday: 5, ordinal })))
			).toEqual([['invalid_ordinal', 'schedule.recurrence.ordinal']]);
		});

		it('cumulates invalid_weekday and invalid_ordinal', () => {
			expect(
				pairs(validateSchedule(withRecurrence({ kind: 'monthly', weekday: 9, ordinal: 6 })))
			).toEqual([
				['invalid_weekday', 'schedule.recurrence.weekday'],
				['invalid_ordinal', 'schedule.recurrence.ordinal']
			]);
		});
	});

	describe('dates recurrence', () => {
		it('reports dates_empty on an empty array', () => {
			expect(pairs(validateSchedule(withRecurrence({ kind: 'dates', dates: [] })))).toEqual([
				['dates_empty', 'schedule.recurrence.dates']
			]);
		});

		it('reports dates_empty on a non-array value', () => {
			expect(
				pairs(validateSchedule(withRecurrence({ kind: 'dates', dates: '2026-10-03' })))
			).toEqual([['dates_empty', 'schedule.recurrence.dates']]);
		});

		it('reports invalid_date on each bad entry with its index', () => {
			const dates = ['2026-10-03', 'nope', '2026-02-29', '2026-12-01'];
			expect(pairs(validateSchedule(withRecurrence({ kind: 'dates', dates })))).toEqual([
				['invalid_date', 'schedule.recurrence.dates[1]'],
				['invalid_date', 'schedule.recurrence.dates[2]']
			]);
		});

		it('reports dates_duplicate', () => {
			const dates: IsoDate[] = ['2026-10-03', '2026-11-07', '2026-10-03'];
			expect(pairs(validateSchedule(withRecurrence({ kind: 'dates', dates })))).toEqual([
				['dates_duplicate', 'schedule.recurrence.dates']
			]);
		});

		it('cumulates invalid_date and dates_duplicate', () => {
			const dates = ['bad', 'bad'];
			expect(pairs(validateSchedule(withRecurrence({ kind: 'dates', dates })))).toEqual([
				['invalid_date', 'schedule.recurrence.dates[0]'],
				['invalid_date', 'schedule.recurrence.dates[1]'],
				['dates_duplicate', 'schedule.recurrence.dates']
			]);
		});
	});

	describe('recurrence kind', () => {
		it('reports invalid_kind on an unknown kind and names it', () => {
			const issues = validateSchedule(withRecurrence({ kind: 'yearly', month: 9 }));
			expect(pairs(issues)).toEqual([['invalid_kind', 'schedule.recurrence.kind']]);
			expect(issues[0]?.message).toBe('unknown recurrence kind "yearly"');
		});

		it('reports invalid_kind on a missing kind', () => {
			const issues = validateSchedule(withRecurrence({ weekdays: [1] }));
			expect(pairs(issues)).toEqual([['invalid_kind', 'schedule.recurrence.kind']]);
			expect(issues[0]?.message).toBe('unknown recurrence kind undefined');
		});

		it('reports invalid_kind when the recurrence is not an object', () => {
			const issues = validateSchedule(withRecurrence('weekly'));
			expect(pairs(issues)).toEqual([['invalid_kind', 'schedule.recurrence.kind']]);
			expect(issues[0]?.message).toBe('unknown recurrence kind "weekly"');
		});
	});

	describe('fixed timing', () => {
		it.each(['24:00', '19:60', '9:00', '19h00', ''])(
			'reports invalid_time on start %j',
			(start) => {
				expect(pairs(validateSchedule(withTiming({ kind: 'fixed', start, end: '20:30' })))).toEqual(
					[['invalid_time', 'schedule.timing.start']]
				);
			}
		);

		it('reports invalid_time on end', () => {
			const issues = validateSchedule(withTiming({ kind: 'fixed', start: '19:00', end: '25:00' }));
			expect(pairs(issues)).toEqual([['invalid_time', 'schedule.timing.end']]);
			expect(issues[0]?.message).toBe('expected a local time (HH:MM), got "25:00"');
		});

		it('reports invalid_time on both bounds at once', () => {
			expect(
				pairs(validateSchedule(withTiming({ kind: 'fixed', start: undefined, end: 1900 })))
			).toEqual([
				['invalid_time', 'schedule.timing.start'],
				['invalid_time', 'schedule.timing.end']
			]);
		});

		it('accepts the extreme times 00:00 and 23:59', () => {
			expect(validateSchedule(withTiming({ kind: 'fixed', start: '00:00', end: '23:59' }))).toEqual(
				[]
			);
		});
	});

	describe('prayer timing', () => {
		it('reports invalid_prayer on an unknown prayer', () => {
			const issues = validateSchedule(withTiming(prayerTiming({ prayer: 'zuhr' as never })));
			expect(pairs(issues)).toEqual([['invalid_prayer', 'schedule.timing.prayer']]);
			expect(issues[0]?.message).toBe('unknown prayer "zuhr"');
		});

		it.each([-121, 241, 1.5, Number.NaN])('reports offset_out_of_range on %s', (offsetMinutes) => {
			expect(pairs(validateSchedule(withTiming(prayerTiming({ offsetMinutes }))))).toEqual([
				['offset_out_of_range', 'schedule.timing.offsetMinutes']
			]);
		});

		it('accepts the offset bounds -120 and 240', () => {
			expect(validateSchedule(withTiming(prayerTiming({ offsetMinutes: -120 })))).toEqual([]);
			expect(validateSchedule(withTiming(prayerTiming({ offsetMinutes: 240 })))).toEqual([]);
		});

		it.each([4, 1441, 0, 5.5, Number.NaN])(
			'reports duration_out_of_range on %s',
			(durationMinutes) => {
				expect(pairs(validateSchedule(withTiming(prayerTiming({ durationMinutes }))))).toEqual([
					['duration_out_of_range', 'schedule.timing.durationMinutes']
				]);
			}
		);

		it('accepts the duration bounds 5 and 1440', () => {
			expect(validateSchedule(withTiming(prayerTiming({ durationMinutes: 5 })))).toEqual([]);
			expect(validateSchedule(withTiming(prayerTiming({ durationMinutes: 1440 })))).toEqual([]);
		});

		it('cumulates prayer, offset and duration issues', () => {
			const timing = { kind: 'prayer', prayer: 'sunrise', offsetMinutes: 500, durationMinutes: 1 };
			const issues = validateSchedule(withTiming(timing));
			expect(pairs(issues)).toEqual([
				['invalid_prayer', 'schedule.timing.prayer'],
				['offset_out_of_range', 'schedule.timing.offsetMinutes'],
				['duration_out_of_range', 'schedule.timing.durationMinutes']
			]);
			expect(issues.map((issue) => issue.message)).toEqual([
				'unknown prayer "sunrise"',
				'offsetMinutes must be an integer in -120..240',
				'durationMinutes must be an integer in 5..1440'
			]);
		});
	});

	describe('timing kind', () => {
		it('reports invalid_kind on an unknown kind', () => {
			const issues = validateSchedule(withTiming({ kind: 'flexible' }));
			expect(pairs(issues)).toEqual([['invalid_kind', 'schedule.timing.kind']]);
			expect(issues[0]?.message).toBe('unknown timing kind "flexible"');
		});

		it('reports invalid_kind when the timing is not an object', () => {
			const issues = validateSchedule(withTiming(19));
			expect(pairs(issues)).toEqual([['invalid_kind', 'schedule.timing.kind']]);
			expect(issues[0]?.message).toBe('unknown timing kind 19');
		});
	});

	describe('accumulation and paths', () => {
		it('reports every anomaly of a broken schedule in one call', () => {
			const broken = {
				id: '',
				sequence: -1,
				startsOn: '2026-09-31',
				endsOn: 'never',
				recurrence: { kind: 'weekly', weekdays: [0, 0], interval: 3, anchorDate: '2026-13-01' },
				timing: { kind: 'prayer', prayer: 'noon', offsetMinutes: 500, durationMinutes: 0 }
			} as unknown as CourseSchedule;
			expect(pairs(validateSchedule(broken))).toEqual([
				['id_empty', 'schedule.id'],
				['invalid_sequence', 'schedule.sequence'],
				['invalid_date', 'schedule.startsOn'],
				['invalid_date', 'schedule.endsOn'],
				['invalid_weekday', 'schedule.recurrence.weekdays'],
				['weekdays_duplicate', 'schedule.recurrence.weekdays'],
				['invalid_interval', 'schedule.recurrence.interval'],
				['invalid_date', 'schedule.recurrence.anchorDate'],
				['invalid_prayer', 'schedule.timing.prayer'],
				['offset_out_of_range', 'schedule.timing.offsetMinutes'],
				['duration_out_of_range', 'schedule.timing.durationMinutes']
			]);
		});

		it('reports both recurrence and timing kind issues together', () => {
			const broken = schedule({
				recurrence: { kind: 'never' } as unknown as Recurrence,
				timing: { kind: 'whenever' } as unknown as Timing
			});
			expect(pairs(validateSchedule(broken))).toEqual([
				['invalid_kind', 'schedule.recurrence.kind'],
				['invalid_kind', 'schedule.timing.kind']
			]);
		});

		it('prefixes every path with the given root', () => {
			const broken = schedule({
				id: '',
				startsOn: '2026-02-30',
				timing: { kind: 'fixed', start: 'x', end: '20:00' } as unknown as Timing
			});
			expect(pairs(validateSchedule(broken, 'schedules[3]'))).toEqual([
				['id_empty', 'schedules[3].id'],
				['invalid_date', 'schedules[3].startsOn'],
				['invalid_time', 'schedules[3].timing.start']
			]);
		});
	});
});

describe('validateException', () => {
	it('returns [] for a valid cancellation', () => {
		expect(validateException(CANCELLED)).toEqual([]);
	});

	it('returns [] for a valid move', () => {
		expect(validateException(MOVED)).toEqual([]);
	});

	it('reports id_empty on courseId', () => {
		expect(pairs(validateException({ ...CANCELLED, courseId: '' }))).toEqual([
			['id_empty', 'exception.courseId']
		]);
	});

	it('reports invalid_date on date', () => {
		expect(pairs(validateException({ ...CANCELLED, date: '2026-09-32' }))).toEqual([
			['invalid_date', 'exception.date']
		]);
	});

	it('reports invalid_date on toDate', () => {
		expect(pairs(validateException({ ...MOVED, toDate: '2026-00-15' }))).toEqual([
			['invalid_date', 'exception.toDate']
		]);
	});

	it('reports invalid_time on toStart', () => {
		expect(pairs(validateException({ ...MOVED, toStart: '18:75' }))).toEqual([
			['invalid_time', 'exception.toStart']
		]);
	});

	it('reports invalid_kind on an unknown kind, after the common fields', () => {
		const broken = { kind: 'skipped', courseId: 'arabic-1', date: '2026-09-09' };
		const issues = validateException(broken as unknown as SessionException);
		expect(pairs(issues)).toEqual([['invalid_kind', 'exception.kind']]);
		expect(issues[0]?.message).toBe('unknown exception kind "skipped"');
	});

	it('cumulates every anomaly of a broken move', () => {
		const broken = { kind: 'moved', courseId: '', date: 'd', toDate: 'e', toStart: 't' };
		expect(pairs(validateException(broken as unknown as SessionException))).toEqual([
			['id_empty', 'exception.courseId'],
			['invalid_date', 'exception.date'],
			['invalid_date', 'exception.toDate'],
			['invalid_time', 'exception.toStart']
		]);
	});

	it('cumulates common-field anomalies with an unknown kind', () => {
		const broken = { kind: 'whatever', courseId: '', date: '' };
		expect(pairs(validateException(broken as unknown as SessionException))).toEqual([
			['id_empty', 'exception.courseId'],
			['invalid_date', 'exception.date'],
			['invalid_kind', 'exception.kind']
		]);
	});

	it('prefixes every path with the given root', () => {
		expect(pairs(validateException({ ...MOVED, toStart: '99:99' }, 'exceptions[2]'))).toEqual([
			['invalid_time', 'exceptions[2].toStart']
		]);
	});
});

describe('validatePause', () => {
	const PAUSE: Pause = { from: '2026-12-21', to: '2027-01-03' };

	it('returns [] for an organisation-wide pause', () => {
		expect(validatePause(PAUSE)).toEqual([]);
	});

	it('returns [] for a course pause and for a single-day pause', () => {
		expect(validatePause({ ...PAUSE, courseId: 'arabic-1' })).toEqual([]);
		expect(validatePause({ from: '2026-12-21', to: '2026-12-21' })).toEqual([]);
	});

	it('reports invalid_date on from', () => {
		expect(pairs(validatePause({ ...PAUSE, from: '2026-12-32' }))).toEqual([
			['invalid_date', 'pause.from']
		]);
	});

	it('reports invalid_date on to', () => {
		expect(pairs(validatePause({ ...PAUSE, to: '2027-01-00' }))).toEqual([
			['invalid_date', 'pause.to']
		]);
	});

	it('reports pause_inverted when to is before from', () => {
		expect(pairs(validatePause({ from: '2027-01-03', to: '2026-12-21' }))).toEqual([
			['pause_inverted', 'pause.to']
		]);
	});

	it('does not compare the bounds when one of them is invalid', () => {
		expect(pairs(validatePause({ from: 'x' as IsoDate, to: '2026-12-21' }))).toEqual([
			['invalid_date', 'pause.from']
		]);
		expect(pairs(validatePause({ from: '2026-12-21', to: 'x' as IsoDate }))).toEqual([
			['invalid_date', 'pause.to']
		]);
	});

	it('reports id_empty on an empty courseId', () => {
		expect(pairs(validatePause({ ...PAUSE, courseId: '' }))).toEqual([
			['id_empty', 'pause.courseId']
		]);
	});

	it('accepts an explicitly undefined courseId', () => {
		expect(validatePause({ ...PAUSE, courseId: undefined })).toEqual([]);
	});

	it('cumulates anomalies and prefixes paths with the given root', () => {
		const broken = { from: 'a', to: 'b', courseId: '' } as unknown as Pause;
		expect(pairs(validatePause(broken, 'pauses[1]'))).toEqual([
			['invalid_date', 'pauses[1].from'],
			['invalid_date', 'pauses[1].to'],
			['id_empty', 'pauses[1].courseId']
		]);
	});
});

describe('validateRange', () => {
	it('returns [] for a valid range and for a single day', () => {
		expect(validateRange({ from: '2026-09-01', to: '2026-09-30' })).toEqual([]);
		expect(validateRange({ from: '2026-09-01', to: '2026-09-01' })).toEqual([]);
	});

	it('accepts exactly 400 days inclusive', () => {
		expect(validateRange({ from: '2026-01-01', to: '2027-02-04' })).toEqual([]);
	});

	it('reports range_too_long on 401 days with the actual length', () => {
		const issues = validateRange({ from: '2026-01-01', to: '2027-02-05' });
		expect(pairs(issues)).toEqual([['range_too_long', 'range']]);
		expect(issues[0]?.message).toBe('range covers 401 days, maximum is 400');
	});

	it('counts the leap day when the range crosses 29 February', () => {
		// 2028 est bissextile : 366 jours jusqu'au 2029-01-01, puis 33 jours → 400 jours inclus.
		expect(validateRange({ from: '2028-01-01', to: '2029-02-03' })).toEqual([]);
		const issues = validateRange({ from: '2028-01-01', to: '2029-02-04' });
		expect(pairs(issues)).toEqual([['range_too_long', 'range']]);
		expect(issues[0]?.message).toBe('range covers 401 days, maximum is 400');
	});

	it('reports range_inverted when to is before from', () => {
		expect(pairs(validateRange({ from: '2026-09-02', to: '2026-09-01' }))).toEqual([
			['range_inverted', 'range.to']
		]);
	});

	it('reports invalid_date on from', () => {
		expect(pairs(validateRange({ from: '2026-09-31', to: '2026-10-01' }))).toEqual([
			['invalid_date', 'range.from']
		]);
	});

	it('reports invalid_date on to', () => {
		expect(pairs(validateRange({ from: '2026-09-01', to: '2026-9-30' }))).toEqual([
			['invalid_date', 'range.to']
		]);
	});

	it('reports both invalid dates without checking the length', () => {
		expect(pairs(validateRange({ from: 'a' as IsoDate, to: 'b' as IsoDate }))).toEqual([
			['invalid_date', 'range.from'],
			['invalid_date', 'range.to']
		]);
	});

	it('prefixes every path with the given root', () => {
		expect(pairs(validateRange({ from: '2020-01-01', to: '2026-01-01' }, 'window'))).toEqual([
			['range_too_long', 'window']
		]);
		expect(pairs(validateRange({ from: '2026-01-02', to: '2026-01-01' }, 'window'))).toEqual([
			['range_inverted', 'window.to']
		]);
	});

	it('feeds assertValid with a typed error', () => {
		const tooLong = thrownBy(() =>
			assertValid(validateRange({ from: '2026-01-01', to: '2027-02-05' }))
		);
		expect(tooLong.issues.map((issue) => issue.code)).toEqual(['range_too_long']);
		expect(tooLong.message).toBe('range: range covers 401 days, maximum is 400');
		const inverted = thrownBy(() =>
			assertValid(validateRange({ from: '2026-01-02', to: '2026-01-01' }))
		);
		expect(inverted.issues.map((issue) => issue.code)).toEqual(['range_inverted']);
		expect(inverted.message).toBe('range.to: to is before from');
	});
});

describe('validateInput', () => {
	it('returns [] for a valid input with exceptions and pauses', () => {
		expect(
			validateInput({
				schedules: [WEEKLY_FIXED, MONTHLY_PRAYER, DATES_FIXED],
				exceptions: [CANCELLED, MOVED],
				pauses: [
					{ from: '2026-12-21', to: '2027-01-03' },
					{ from: '2026-10-01', to: '2026-10-02', courseId: 'tafsir' }
				]
			})
		).toEqual([]);
	});

	it('returns [] when exceptions and pauses are omitted', () => {
		expect(validateInput({ schedules: [WEEKLY_FIXED] })).toEqual([]);
		expect(validateInput({ schedules: [] })).toEqual([]);
	});

	it('reports id_duplicate on every later schedule sharing an id', () => {
		const issues = validateInput({
			schedules: [WEEKLY_FIXED, schedule({ id: 'other' }), schedule({}), schedule({})]
		});
		expect(pairs(issues)).toEqual([
			['id_duplicate', 'schedules[2].id'],
			['id_duplicate', 'schedules[3].id']
		]);
		expect(issues[0]?.message).toBe('duplicate course id "arabic-1"');
	});

	it('reports exception_duplicate for the same course and date', () => {
		const moved: SessionException = { ...MOVED, date: CANCELLED.date };
		const issues = validateInput({
			schedules: [WEEKLY_FIXED],
			exceptions: [CANCELLED, moved, { ...CANCELLED, courseId: 'tafsir' }]
		});
		expect(pairs(issues)).toEqual([['exception_duplicate', 'exceptions[1]']]);
		expect(issues[0]?.message).toBe('several exceptions for course "arabic-1" on 2026-09-09');
	});

	it('does not flag the same course on different dates', () => {
		expect(validateInput({ schedules: [WEEKLY_FIXED], exceptions: [CANCELLED, MOVED] })).toEqual(
			[]
		);
	});

	it('does not flag a move whose toDate is the date of another exception', () => {
		// Le doublon se juge sur la date d'origine seulement : même cours + même `date`.
		// 2026-09-15 est le `toDate` de MOVED.
		const onTarget: SessionException = { ...CANCELLED, date: '2026-09-15' };
		expect(validateInput({ schedules: [WEEKLY_FIXED], exceptions: [MOVED, onTarget] })).toEqual([]);
	});

	it('prefixes schedule, exception and pause paths with their index', () => {
		const issues = validateInput({
			schedules: [
				schedule({ startsOn: '2026-02-30' }),
				schedule({
					id: 'b',
					timing: { kind: 'fixed', start: '19:00', end: 'x' } as unknown as Timing
				})
			],
			exceptions: [CANCELLED, { ...MOVED, toDate: 'y' as IsoDate }],
			pauses: [
				{ from: '2026-12-21', to: '2027-01-03' },
				{ from: '2027-01-03', to: '2026-12-21' }
			]
		});
		expect(pairs(issues)).toEqual([
			['invalid_date', 'schedules[0].startsOn'],
			['invalid_time', 'schedules[1].timing.end'],
			['invalid_date', 'exceptions[1].toDate'],
			['pause_inverted', 'pauses[1].to']
		]);
	});

	it('cumulates element issues with duplicate issues in one call', () => {
		const issues = validateInput({
			schedules: [schedule({ id: '' }), schedule({ id: '' })],
			exceptions: [
				{ ...CANCELLED, courseId: '' },
				{ ...CANCELLED, courseId: '' }
			],
			pauses: [{ from: 'x' as IsoDate, to: '2026-12-21', courseId: '' }]
		});
		expect(pairs(issues)).toEqual([
			['id_empty', 'schedules[0].id'],
			['id_empty', 'schedules[1].id'],
			['id_duplicate', 'schedules[1].id'],
			['id_empty', 'exceptions[0].courseId'],
			['id_empty', 'exceptions[1].courseId'],
			['exception_duplicate', 'exceptions[1]'],
			['invalid_date', 'pauses[0].from'],
			['id_empty', 'pauses[0].courseId']
		]);
	});

	it('feeds assertValid with a message listing every path', () => {
		const error = thrownBy(() =>
			assertValid(validateInput({ schedules: [WEEKLY_FIXED, schedule({ sequence: -1 })] }))
		);
		expect(error.message).toBe(
			'schedules[1].sequence: expected a non-negative integer; schedules[1].id: duplicate course id "arabic-1"'
		);
	});
});

describe('properties', () => {
	it('accepts every integer offset in -120..240 and rejects every other number', () => {
		fc.assert(
			fc.property(fc.integer({ min: MIN_OFFSET_MINUTES, max: MAX_OFFSET_MINUTES }), (offset) => {
				expect(validateSchedule(withTiming(prayerTiming({ offsetMinutes: offset })))).toEqual([]);
			})
		);
		const outside = fc.oneof(
			fc.integer({ min: -100_000, max: MIN_OFFSET_MINUTES - 1 }),
			fc.integer({ min: MAX_OFFSET_MINUTES + 1, max: 100_000 }),
			fc.double({ min: MIN_OFFSET_MINUTES, max: MAX_OFFSET_MINUTES, noInteger: true, noNaN: true })
		);
		fc.assert(
			fc.property(outside, (offset) => {
				expect(
					pairs(validateSchedule(withTiming(prayerTiming({ offsetMinutes: offset }))))
				).toEqual([['offset_out_of_range', 'schedule.timing.offsetMinutes']]);
			})
		);
	});

	it('accepts every integer duration in 5..1440 and rejects every other number', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: MIN_DURATION_MINUTES, max: MAX_DURATION_MINUTES }),
				(duration) => {
					expect(validateSchedule(withTiming(prayerTiming({ durationMinutes: duration })))).toEqual(
						[]
					);
				}
			)
		);
		const outside = fc.oneof(
			fc.integer({ min: -100_000, max: MIN_DURATION_MINUTES - 1 }),
			fc.integer({ min: MAX_DURATION_MINUTES + 1, max: 100_000 }),
			fc.double({
				min: MIN_DURATION_MINUTES,
				max: MAX_DURATION_MINUTES,
				noInteger: true,
				noNaN: true
			})
		);
		fc.assert(
			fc.property(outside, (duration) => {
				expect(
					pairs(validateSchedule(withTiming(prayerTiming({ durationMinutes: duration }))))
				).toEqual([['duration_out_of_range', 'schedule.timing.durationMinutes']]);
			})
		);
	});

	it('accepts any range of 1..400 days and rejects any longer one', () => {
		const anyDay = fc.integer({ min: 0, max: 100_000 });
		fc.assert(
			fc.property(anyDay, fc.integer({ min: 1, max: MAX_RANGE_DAYS }), (day, length) => {
				const from = daysToIsoDate(day);
				expect(validateRange({ from, to: addDays(from, length - 1) })).toEqual([]);
			})
		);
		fc.assert(
			fc.property(anyDay, fc.integer({ min: MAX_RANGE_DAYS + 1, max: 5_000 }), (day, length) => {
				const from = daysToIsoDate(day);
				const issues = validateRange({ from, to: addDays(from, length - 1) });
				expect(pairs(issues)).toEqual([['range_too_long', 'range']]);
				expect(issues[0]?.message).toBe(`range covers ${length} days, maximum is 400`);
			})
		);
	});

	it('reports range_inverted for any to strictly before from', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 100_000 }),
				fc.integer({ min: 1, max: 5_000 }),
				(day, back) => {
					const from = daysToIsoDate(day);
					expect(pairs(validateRange({ from, to: addDays(from, -back) }))).toEqual([
						['range_inverted', 'range.to']
					]);
				}
			)
		);
	});
});

describe('malformed containers', () => {
	// La validation doit rejeter ce que l'expansion ne sait pas traiter, sans jamais lever
	// elle-même : elle renvoie toujours la liste des anomalies.
	it('reports a null or non-object recurrence as an unknown kind', () => {
		for (const recurrence of [null, undefined, 'weekly', 42]) {
			const issues = validateSchedule({
				...WEEKLY_FIXED,
				recurrence: recurrence as unknown as CourseSchedule['recurrence']
			});
			expect(
				issues.map((issue) => [issue.code, issue.path]),
				String(recurrence)
			).toEqual([['invalid_kind', 'schedule.recurrence.kind']]);
		}
	});

	it('reports a null or non-object timing as an unknown kind', () => {
		for (const timing of [null, undefined, 'fixed', 42]) {
			const issues = validateSchedule({
				...WEEKLY_FIXED,
				timing: timing as unknown as CourseSchedule['timing']
			});
			expect(
				issues.map((issue) => [issue.code, issue.path]),
				String(timing)
			).toEqual([['invalid_kind', 'schedule.timing.kind']]);
		}
	});

	it('reports a hole in weekdays as an invalid weekday', () => {
		const weekdays = withHole<Weekday>([1, undefined, 3]);
		const issues = validateSchedule({
			...WEEKLY_FIXED,
			recurrence: { kind: 'weekly', weekdays, interval: 1, anchorDate: '2026-09-07' }
		});
		expect(issues.map((issue) => issue.code)).toEqual(['invalid_weekday']);
	});

	it('reports a hole in dates as an invalid date', () => {
		const list = withHole<IsoDate>(['2026-10-03', undefined, '2026-11-07']);
		const issues = validateSchedule({
			...WEEKLY_FIXED,
			recurrence: { kind: 'dates', dates: list }
		});
		expect(issues.map((issue) => [issue.code, issue.path])).toEqual([
			['invalid_date', 'schedule.recurrence.dates[1]']
		]);
	});
});

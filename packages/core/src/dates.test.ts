// Tests de l'arithmétique des dates (dates.ts) : cas connus, limites et erreurs, puis propriétés
// avec fast-check en prenant Date.UTC comme oracle. L'objet Date n'est autorisé que dans les tests :
// les sources n'y touchent jamais (hors todayInZone, qui reçoit l'horloge de l'appelant).

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	MINUTES_PER_DAY,
	addDays,
	civilFromDays,
	compareIsoDates,
	daysFromCivil,
	daysInMonth,
	daysToIsoDate,
	formatIsoDate,
	formatLocalTime,
	isIsoDate,
	isLeapYear,
	isLocalTime,
	isoDateToDays,
	localTimeToMinutes,
	nextYearSameDate,
	nthWeekdayOfMonth,
	parseIsoDate,
	parseLocalTime,
	roundUpToFiveMinutes,
	todayInZone,
	weekStart,
	weekdayFromDays,
	type CivilDate
} from './dates.js';
import type { IsoDate, LocalTime, Weekday } from './types.js';

type Ordinal = 1 | 2 | 3 | 4 | -1;

const MS_PER_DAY = 86_400_000;
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];
const ORDINALS: Ordinal[] = [1, 2, 3, 4, -1];
const NUM_RUNS = 500;

// Oracles fondés sur Date.UTC (calendrier grégorien proleptique, sans fuseau). Valables pour les
// années >= 100 : Date.UTC décale les années 0..99 vers 1900..1999.
function utcDays(year: number, month: number, day: number): number {
	return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

function utcDaysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Jour de semaine ISO (1 = lundi … 7 = dimanche) d'après getUTCDay (0 = dimanche). */
function utcIsoWeekday(days: number): number {
	const sundayFirst = new Date(days * MS_PER_DAY).getUTCDay();
	return sundayFirst === 0 ? 7 : sundayFirst;
}

function utcCivil(days: number): CivilDate {
	const date = new Date(days * MS_PER_DAY);
	return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function utcIsoDate(days: number): string {
	return new Date(days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Recherche brute du nième jour de semaine du mois (ou du dernier pour l'ordinal -1). */
function utcNthWeekdayOfMonth(
	year: number,
	month: number,
	weekday: Weekday,
	ordinal: Ordinal
): number | undefined {
	const matches: number[] = [];
	for (let day = 1; day <= utcDaysInMonth(year, month); day += 1) {
		if (utcIsoWeekday(utcDays(year, month, day)) === weekday) matches.push(day);
	}
	return ordinal === -1 ? matches.at(-1) : matches[ordinal - 1];
}

// Arbitraires : dates civiles valides de 1970 à 2100, jours du même intervalle.
const civilDateArb = fc
	.tuple(fc.integer({ min: 1970, max: 2100 }), fc.integer({ min: 1, max: 12 }))
	.chain(([year, month]) =>
		fc.tuple(
			fc.constant(year),
			fc.constant(month),
			fc.integer({ min: 1, max: utcDaysInMonth(year, month) })
		)
	);
const dayArb = fc.integer({ min: daysFromCivil(1970, 1, 1), max: daysFromCivil(2100, 12, 31) });
const weekdayArb = fc.constantFrom(...WEEKDAYS);
const ordinalArb = fc.constantFrom(...ORDINALS);

describe('MINUTES_PER_DAY', () => {
	it('is 1440', () => {
		expect(MINUTES_PER_DAY).toBe(1440);
	});
});

describe('daysFromCivil / civilFromDays', () => {
	const known: [year: number, month: number, day: number, days: number][] = [
		[1970, 1, 1, 0],
		[1969, 12, 31, -1],
		[1970, 1, 5, 4],
		[2000, 2, 29, 11016],
		[2000, 3, 1, 11017],
		[2024, 2, 29, 19782],
		[2024, 3, 1, 19783],
		[2100, 2, 28, 47540],
		[2100, 3, 1, 47541],
		[1900, 2, 28, -25509],
		[1900, 3, 1, -25508],
		[2026, 9, 20, 20716],
		[999, 12, 31, -354286]
	];

	it.each(known)('daysFromCivil(%i, %i, %i) is %i', (year, month, day, days) => {
		expect(daysFromCivil(year, month, day)).toBe(days);
	});

	it.each(known)('civilFromDays gives back %i-%i-%i', (year, month, day, days) => {
		expect(civilFromDays(days)).toEqual({ year, month, day });
	});

	it('treats 2000 and 2024 as leap years: 28 February is followed by 29 February', () => {
		expect(civilFromDays(daysFromCivil(2000, 2, 28) + 1)).toEqual({
			year: 2000,
			month: 2,
			day: 29
		});
		expect(civilFromDays(daysFromCivil(2024, 2, 28) + 1)).toEqual({
			year: 2024,
			month: 2,
			day: 29
		});
		expect(daysFromCivil(2000, 3, 1) - daysFromCivil(2000, 2, 28)).toBe(2);
		expect(daysFromCivil(2024, 3, 1) - daysFromCivil(2024, 2, 28)).toBe(2);
	});

	it('treats 1900 and 2100 as common years: 28 February is followed by 1 March', () => {
		expect(civilFromDays(daysFromCivil(1900, 2, 28) + 1)).toEqual({ year: 1900, month: 3, day: 1 });
		expect(civilFromDays(daysFromCivil(2100, 2, 28) + 1)).toEqual({ year: 2100, month: 3, day: 1 });
		expect(daysFromCivil(1900, 3, 1) - daysFromCivil(1900, 2, 28)).toBe(1);
		expect(daysFromCivil(2100, 3, 1) - daysFromCivil(2100, 2, 28)).toBe(1);
	});

	it('counts 365 days in a common year and 366 in a leap year', () => {
		expect(daysFromCivil(2024, 1, 1) - daysFromCivil(2023, 1, 1)).toBe(365);
		expect(daysFromCivil(2025, 1, 1) - daysFromCivil(2024, 1, 1)).toBe(366);
	});

	it('handles year 0 of the proleptic Gregorian calendar', () => {
		expect(civilFromDays(daysFromCivil(0, 1, 1))).toEqual({ year: 0, month: 1, day: 1 });
		expect(civilFromDays(daysFromCivil(0, 2, 29))).toEqual({ year: 0, month: 2, day: 29 });
	});
});

describe('weekdayFromDays', () => {
	it('returns 4 (Thursday) for day 0, 1970-01-01', () => {
		expect(weekdayFromDays(0)).toBe(4);
	});

	it('returns 1 (Monday) for 1970-01-05', () => {
		expect(weekdayFromDays(4)).toBe(1);
		expect(weekdayFromDays(daysFromCivil(1970, 1, 5))).toBe(1);
	});

	it('returns 7 (Sunday) for 2026-09-20', () => {
		expect(weekdayFromDays(20716)).toBe(7);
		expect(weekdayFromDays(daysFromCivil(2026, 9, 20))).toBe(7);
	});

	it('covers the whole ISO week from Monday to Sunday', () => {
		const monday = daysFromCivil(2026, 9, 14);
		expect(WEEKDAYS.map((weekday) => weekdayFromDays(monday + weekday - 1))).toEqual(WEEKDAYS);
	});

	it('handles negative day numbers', () => {
		expect(weekdayFromDays(-1)).toBe(3); // 1969-12-31, mercredi
		expect(weekdayFromDays(-4)).toBe(7); // 1969-12-28, dimanche
		expect(weekdayFromDays(-5)).toBe(6); // 1969-12-27, samedi
		expect(weekdayFromDays(-7)).toBe(4); // 1969-12-25, jeudi
		expect(weekdayFromDays(-10)).toBe(1); // 1969-12-22, lundi
		expect(weekdayFromDays(daysFromCivil(1900, 2, 28))).toBe(3); // mercredi
	});
});

describe('weekStart', () => {
	it('returns the Monday of the week containing the day', () => {
		expect(weekStart(daysFromCivil(2026, 9, 16))).toBe(daysFromCivil(2026, 9, 14));
		expect(weekStart(daysFromCivil(2026, 9, 19))).toBe(daysFromCivil(2026, 9, 14));
		expect(weekStart(0)).toBe(-3); // 1970-01-01 (jeudi) → 1969-12-29 (lundi)
		expect(weekdayFromDays(weekStart(0))).toBe(1);
	});

	it('returns the day itself for a Monday', () => {
		const monday = daysFromCivil(2026, 9, 14);
		expect(weekStart(monday)).toBe(monday);
		expect(weekStart(-10)).toBe(-10);
	});

	it('is idempotent', () => {
		for (const days of [0, -1, -4, 4, 20716, 47846]) {
			expect(weekStart(weekStart(days))).toBe(weekStart(days));
		}
	});

	it('goes back six days for a Sunday', () => {
		expect(weekStart(daysFromCivil(2026, 9, 20))).toBe(daysFromCivil(2026, 9, 14));
		expect(daysFromCivil(2026, 9, 20) - weekStart(daysFromCivil(2026, 9, 20))).toBe(6);
		expect(weekStart(-4)).toBe(-10); // 1969-12-28 (dimanche) → 1969-12-22 (lundi)
	});
});

describe('isLeapYear', () => {
	it('is true for years divisible by 4 but not by 100', () => {
		expect(isLeapYear(2024)).toBe(true);
		expect(isLeapYear(2028)).toBe(true);
		expect(isLeapYear(1996)).toBe(true);
	});

	it('is false for common years', () => {
		expect(isLeapYear(2023)).toBe(false);
		expect(isLeapYear(2025)).toBe(false);
		expect(isLeapYear(1970)).toBe(false);
	});

	it('is false for centuries not divisible by 400', () => {
		expect(isLeapYear(1900)).toBe(false);
		expect(isLeapYear(2100)).toBe(false);
		expect(isLeapYear(1800)).toBe(false);
	});

	it('is true for centuries divisible by 400', () => {
		expect(isLeapYear(2000)).toBe(true);
		expect(isLeapYear(1600)).toBe(true);
		expect(isLeapYear(2400)).toBe(true);
	});
});

describe('daysInMonth', () => {
	it('returns the length of every month of a common year', () => {
		const lengths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) =>
			daysInMonth(2023, month)
		);
		expect(lengths).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
	});

	it('returns 29 for February of a leap year and 28 otherwise', () => {
		expect(daysInMonth(2024, 2)).toBe(29);
		expect(daysInMonth(2000, 2)).toBe(29);
		expect(daysInMonth(2023, 2)).toBe(28);
		expect(daysInMonth(1900, 2)).toBe(28);
		expect(daysInMonth(2100, 2)).toBe(28);
	});

	it('keeps the other months unchanged in a leap year', () => {
		expect(daysInMonth(2024, 1)).toBe(31);
		expect(daysInMonth(2024, 4)).toBe(30);
		expect(daysInMonth(2024, 12)).toBe(31);
	});
});

describe('nthWeekdayOfMonth', () => {
	it('finds the 1st to 4th and the last Monday of February 2021 (28 days from a Monday)', () => {
		expect(nthWeekdayOfMonth(2021, 2, 1, 1)).toBe(1);
		expect(nthWeekdayOfMonth(2021, 2, 1, 2)).toBe(8);
		expect(nthWeekdayOfMonth(2021, 2, 1, 3)).toBe(15);
		expect(nthWeekdayOfMonth(2021, 2, 1, 4)).toBe(22);
		expect(nthWeekdayOfMonth(2021, 2, 1, -1)).toBe(22);
	});

	it('makes the 4th and the last coincide for every weekday of a 4-week month', () => {
		for (const weekday of WEEKDAYS) {
			expect(nthWeekdayOfMonth(2021, 2, weekday, -1)).toBe(nthWeekdayOfMonth(2021, 2, weekday, 4));
		}
		expect(nthWeekdayOfMonth(2021, 2, 7, 1)).toBe(7);
		expect(nthWeekdayOfMonth(2021, 2, 7, 4)).toBe(28);
	});

	it('finds the 1st to 4th and the last Sunday of March 2026 (5 Sundays)', () => {
		expect(nthWeekdayOfMonth(2026, 3, 7, 1)).toBe(1);
		expect(nthWeekdayOfMonth(2026, 3, 7, 2)).toBe(8);
		expect(nthWeekdayOfMonth(2026, 3, 7, 3)).toBe(15);
		expect(nthWeekdayOfMonth(2026, 3, 7, 4)).toBe(22);
		expect(nthWeekdayOfMonth(2026, 3, 7, -1)).toBe(29);
	});

	it('finds a weekday whose first occurrence is late in the month', () => {
		// Mars 2026 commence un dimanche : le premier samedi est le 7.
		expect(nthWeekdayOfMonth(2026, 3, 6, 1)).toBe(7);
		expect(nthWeekdayOfMonth(2026, 3, 6, 4)).toBe(28);
		expect(nthWeekdayOfMonth(2026, 3, 6, -1)).toBe(28);
		// Octobre 2026 commence un jeudi : le premier mercredi est le 7.
		expect(nthWeekdayOfMonth(2026, 10, 3, 1)).toBe(7);
		expect(nthWeekdayOfMonth(2026, 10, 4, 1)).toBe(1);
	});

	it('finds the last Sunday of March 2026 (29) and of October 2026 (25)', () => {
		expect(nthWeekdayOfMonth(2026, 3, 7, -1)).toBe(29);
		expect(nthWeekdayOfMonth(2026, 10, 7, -1)).toBe(25);
	});

	it('returns the last day of the month for ordinal -1 when the month ends on that weekday', () => {
		expect(nthWeekdayOfMonth(2026, 3, 2, -1)).toBe(31); // mardi 31 mars 2026
		expect(nthWeekdayOfMonth(2021, 2, 7, -1)).toBe(28); // dimanche 28 février 2021
		expect(nthWeekdayOfMonth(2026, 10, 6, -1)).toBe(31); // samedi 31 octobre 2026
		expect(nthWeekdayOfMonth(2024, 2, 4, -1)).toBe(29); // jeudi 29 février 2024
	});
});

describe('parseIsoDate / isIsoDate', () => {
	it('parses a valid date', () => {
		expect(parseIsoDate('2026-09-19')).toEqual({ year: 2026, month: 9, day: 19 });
		expect(parseIsoDate('1970-01-01')).toEqual({ year: 1970, month: 1, day: 1 });
		expect(parseIsoDate('2026-12-31')).toEqual({ year: 2026, month: 12, day: 31 });
		expect(parseIsoDate('0001-01-01')).toEqual({ year: 1, month: 1, day: 1 });
	});

	it('accepts 29 February of a leap year only', () => {
		expect(parseIsoDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
		expect(parseIsoDate('2000-02-29')).toEqual({ year: 2000, month: 2, day: 29 });
		expect(parseIsoDate('2023-02-29')).toBeNull();
		expect(parseIsoDate('1900-02-29')).toBeNull();
		expect(parseIsoDate('2100-02-29')).toBeNull();
	});

	it.each([
		['2026-9-1'],
		['20260901'],
		['2026/09/01'],
		['2026-09-01T00:00'],
		[' 2026-09-01'],
		['2026-09-01 '],
		[''],
		['not a date']
	])('rejects the malformed string %j', (value) => {
		expect(parseIsoDate(value)).toBeNull();
		expect(isIsoDate(value)).toBe(false);
	});

	it.each([
		['2026-09-31'],
		['2026-02-30'],
		['2026-04-31'],
		['2026-13-01'],
		['2026-00-01'],
		['2026-09-00'],
		['2026-09-32']
	])('rejects the impossible civil date %j', (value) => {
		expect(parseIsoDate(value)).toBeNull();
		expect(isIsoDate(value)).toBe(false);
	});

	it('isIsoDate narrows valid strings and rejects non-strings', () => {
		expect(isIsoDate('2026-09-19')).toBe(true);
		expect(isIsoDate('2024-02-29')).toBe(true);
		expect(isIsoDate(null)).toBe(false);
		expect(isIsoDate(undefined)).toBe(false);
		expect(isIsoDate(20260919)).toBe(false);
		expect(isIsoDate(true)).toBe(false);
		expect(isIsoDate({})).toBe(false);
		expect(isIsoDate(['2026-09-19'])).toBe(false);
		expect(isIsoDate(new Date('2026-09-19T00:00:00Z'))).toBe(false);
	});
});

describe('formatIsoDate', () => {
	it('pads month and day with a leading zero', () => {
		expect(formatIsoDate({ year: 2026, month: 9, day: 1 })).toBe('2026-09-01');
		expect(formatIsoDate({ year: 2026, month: 12, day: 25 })).toBe('2026-12-25');
	});

	it('pads years below 1000 to four digits', () => {
		expect(formatIsoDate({ year: 999, month: 12, day: 31 })).toBe('0999-12-31');
		expect(formatIsoDate({ year: 42, month: 3, day: 4 })).toBe('0042-03-04');
		expect(formatIsoDate({ year: 1, month: 1, day: 1 })).toBe('0001-01-01');
		expect(formatIsoDate({ year: 0, month: 1, day: 1 })).toBe('0000-01-01');
	});

	it('is the inverse of parseIsoDate', () => {
		expect(parseIsoDate(formatIsoDate({ year: 2026, month: 9, day: 19 }))).toEqual({
			year: 2026,
			month: 9,
			day: 19
		});
	});
});

describe('isoDateToDays', () => {
	it('converts a valid ISO date to days since 1970-01-01', () => {
		expect(isoDateToDays('1970-01-01')).toBe(0);
		expect(isoDateToDays('1969-12-31')).toBe(-1);
		expect(isoDateToDays('2026-09-20')).toBe(20716);
		expect(isoDateToDays('2000-02-29')).toBe(11016);
	});

	it('throws a TypeError on an invalid string', () => {
		expect(() => isoDateToDays('2026-02-30')).toThrow(TypeError);
		expect(() => isoDateToDays('2026-02-30')).toThrow('Invalid ISO date: 2026-02-30');
		expect(() => isoDateToDays('2026-9-1')).toThrow(TypeError);
		expect(() => isoDateToDays('not a date' as unknown as IsoDate)).toThrow(TypeError);
		expect(() => isoDateToDays('' as unknown as IsoDate)).toThrow(TypeError);
	});
});

describe('daysToIsoDate', () => {
	it('formats days since 1970-01-01 as an ISO date', () => {
		expect(daysToIsoDate(0)).toBe('1970-01-01');
		expect(daysToIsoDate(-1)).toBe('1969-12-31');
		expect(daysToIsoDate(11016)).toBe('2000-02-29');
		expect(daysToIsoDate(20716)).toBe('2026-09-20');
		expect(daysToIsoDate(-25509)).toBe('1900-02-28');
	});

	it('pads years below 1000', () => {
		expect(daysToIsoDate(-354286)).toBe('0999-12-31');
	});
});

describe('addDays', () => {
	it('adds a positive number of days', () => {
		expect(addDays('2026-09-20', 1)).toBe('2026-09-21');
		expect(addDays('2026-09-20', 10)).toBe('2026-09-30');
		expect(addDays('2026-09-20', 11)).toBe('2026-10-01');
	});

	it('adds a negative number of days', () => {
		expect(addDays('2026-09-20', -1)).toBe('2026-09-19');
		expect(addDays('2026-09-01', -1)).toBe('2026-08-31');
		expect(addDays('2026-09-20', -20)).toBe('2026-08-31');
	});

	it('returns the same date for zero', () => {
		expect(addDays('2026-09-20', 0)).toBe('2026-09-20');
	});

	it('crosses year boundaries in both directions', () => {
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
		expect(addDays('2026-09-20', 365)).toBe('2027-09-20');
		expect(addDays('2026-09-20', -400)).toBe('2025-08-16');
	});

	it('crosses 29 February only in leap years', () => {
		expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
		expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
		expect(addDays('2023-02-28', 1)).toBe('2023-03-01');
		expect(addDays('2100-02-28', 1)).toBe('2100-03-01');
	});

	it('throws a TypeError on an invalid date', () => {
		expect(() => addDays('2026-02-30', 1)).toThrow(TypeError);
	});
});

describe('nextYearSameDate', () => {
	it('keeps the month and the day, and moves the year by one', () => {
		expect(nextYearSameDate('2027-01-01')).toBe('2028-01-01');
		expect(nextYearSameDate('2027-03-01')).toBe('2028-03-01');
		expect(nextYearSameDate('2027-12-31')).toBe('2028-12-31');
		expect(nextYearSameDate('2027-02-28')).toBe('2028-02-28');
	});

	it('keeps 29 February when the next year is a leap year', () => {
		// 2096 is a leap year; 2095 is not. The date exists on both sides here.
		expect(nextYearSameDate('2095-12-31')).toBe('2096-12-31');
		expect(nextYearSameDate('2096-02-29')).toBe('2097-03-01');
	});

	it('moves 29 February to 1 March in a common year, never back to 28 February', () => {
		// Backwards would map 28 and 29 February onto the same day, and two periods that merely
		// touched would then overlap. This is the whole reason the direction is forwards.
		expect(nextYearSameDate('2028-02-29')).toBe('2029-03-01');
		expect(nextYearSameDate('2028-02-28')).toBe('2029-02-28');
		expect(nextYearSameDate('2028-02-29')).not.toBe('2029-02-28');
	});

	it('applies the century rule, not just the four-year one', () => {
		// 2100 is divisible by four but is not a leap year.
		expect(nextYearSameDate('2099-02-28')).toBe('2100-02-28');
		expect(nextYearSameDate('2100-02-28')).toBe('2101-02-28');
	});

	it('throws a TypeError on an invalid date', () => {
		expect(() => nextYearSameDate('2026-02-30')).toThrow(TypeError);
	});

	it('always lands between 365 and 366 days later', () => {
		fc.assert(
			fc.property(civilDateArb, ([year, month, day]) => {
				const date = formatIsoDate({ year, month, day });
				const ecart = isoDateToDays(nextYearSameDate(date)) - isoDateToDays(date);
				expect(ecart).toBeGreaterThanOrEqual(365);
				expect(ecart).toBeLessThanOrEqual(366);
			}),
			{ numRuns: NUM_RUNS }
		);
	});

	it('never goes backwards: two dates in order stay in order', () => {
		fc.assert(
			fc.property(dayArb, fc.integer({ min: 0, max: 400 }), (days, ecart) => {
				const avant = daysToIsoDate(days);
				const apres = daysToIsoDate(days + ecart);
				expect(compareIsoDates(nextYearSameDate(avant), nextYearSameDate(apres))).not.toBe(1);
			}),
			{ numRuns: NUM_RUNS }
		);
	});

	it('maps two consecutive days to the same day or to consecutive-enough days', () => {
		// C'est la propriété dont dépend la jointivité des périodes : l'image du lendemain ne
		// recule jamais, et elle ne saute jamais plus d'un jour de trop — le 29 février inséré.
		fc.assert(
			fc.property(dayArb, (days) => {
				const ecart =
					isoDateToDays(nextYearSameDate(daysToIsoDate(days + 1))) -
					isoDateToDays(nextYearSameDate(daysToIsoDate(days)));
				expect(ecart).toBeGreaterThanOrEqual(0);
				expect(ecart).toBeLessThanOrEqual(2);
			}),
			{ numRuns: NUM_RUNS }
		);
	});
});

describe('compareIsoDates', () => {
	it('returns -1, 0 or 1', () => {
		expect(compareIsoDates('2026-09-19', '2026-09-20')).toBe(-1);
		expect(compareIsoDates('2026-09-20', '2026-09-19')).toBe(1);
		expect(compareIsoDates('2026-09-20', '2026-09-20')).toBe(0);
	});

	it('compares across months and years', () => {
		expect(compareIsoDates('2026-09-30', '2026-10-01')).toBe(-1);
		expect(compareIsoDates('2026-12-31', '2027-01-01')).toBe(-1);
		expect(compareIsoDates('2027-01-01', '2026-12-31')).toBe(1);
		expect(compareIsoDates('0999-12-31', '1000-01-01')).toBe(-1);
	});

	it('sorts dates chronologically', () => {
		const dates: IsoDate[] = ['2026-10-01', '2026-01-15', '2027-01-01', '2026-09-20'];
		expect([...dates].sort(compareIsoDates)).toEqual([
			'2026-01-15',
			'2026-09-20',
			'2026-10-01',
			'2027-01-01'
		]);
	});
});

describe('parseLocalTime / isLocalTime', () => {
	it('parses valid times as minutes since midnight', () => {
		expect(parseLocalTime('00:00')).toBe(0);
		expect(parseLocalTime('23:59')).toBe(1439);
		expect(parseLocalTime('19:00')).toBe(1140);
		expect(parseLocalTime('09:05')).toBe(545);
		expect(parseLocalTime('12:30')).toBe(750);
	});

	it.each([['24:00'], ['19:60'], ['23:60'], ['25:00'], ['99:99']])(
		'rejects the out-of-range time %j',
		(value) => {
			expect(parseLocalTime(value)).toBeNull();
			expect(isLocalTime(value)).toBe(false);
		}
	);

	it.each([['9:00'], ['19:00:00'], ['19:5'], ['1900'], ['19h00'], ['19:00 '], [' 19:00'], ['']])(
		'rejects the malformed time %j',
		(value) => {
			expect(parseLocalTime(value)).toBeNull();
			expect(isLocalTime(value)).toBe(false);
		}
	);

	it('isLocalTime narrows valid strings and rejects non-strings', () => {
		expect(isLocalTime('00:00')).toBe(true);
		expect(isLocalTime('23:59')).toBe(true);
		expect(isLocalTime(null)).toBe(false);
		expect(isLocalTime(undefined)).toBe(false);
		expect(isLocalTime(1140)).toBe(false);
		expect(isLocalTime({})).toBe(false);
		expect(isLocalTime(['19:00'])).toBe(false);
	});
});

describe('formatLocalTime', () => {
	it('formats minutes since midnight as HH:MM', () => {
		expect(formatLocalTime(0)).toBe('00:00');
		expect(formatLocalTime(1439)).toBe('23:59');
		expect(formatLocalTime(1140)).toBe('19:00');
		expect(formatLocalTime(5)).toBe('00:05');
		expect(formatLocalTime(60)).toBe('01:00');
		expect(formatLocalTime(545)).toBe('09:05');
	});

	it('throws a RangeError outside [0, 1440[ or on a non-integer', () => {
		expect(() => formatLocalTime(1440)).toThrow(RangeError);
		expect(() => formatLocalTime(1440)).toThrow('Minutes of day out of range: 1440');
		expect(() => formatLocalTime(-1)).toThrow(RangeError);
		expect(() => formatLocalTime(1.5)).toThrow(RangeError);
		expect(() => formatLocalTime(Number.NaN)).toThrow(RangeError);
		expect(() => formatLocalTime(Number.POSITIVE_INFINITY)).toThrow(RangeError);
		expect(() => formatLocalTime(100000)).toThrow(RangeError);
	});
});

describe('localTimeToMinutes', () => {
	it('converts a valid time', () => {
		expect(localTimeToMinutes('00:00')).toBe(0);
		expect(localTimeToMinutes('19:00')).toBe(1140);
		expect(localTimeToMinutes('23:59')).toBe(1439);
	});

	it('throws a TypeError on an invalid string', () => {
		expect(() => localTimeToMinutes('24:00')).toThrow(TypeError);
		expect(() => localTimeToMinutes('24:00')).toThrow('Invalid local time: 24:00');
		expect(() => localTimeToMinutes('19:60')).toThrow(TypeError);
		expect(() => localTimeToMinutes('9:00')).toThrow(TypeError);
		expect(() => localTimeToMinutes('19:00:00' as unknown as LocalTime)).toThrow(TypeError);
		expect(() => localTimeToMinutes('' as unknown as LocalTime)).toThrow(TypeError);
	});
});

describe('roundUpToFiveMinutes', () => {
	it('leaves multiples of five unchanged', () => {
		expect(roundUpToFiveMinutes(0)).toBe(0);
		expect(roundUpToFiveMinutes(5)).toBe(5);
		expect(roundUpToFiveMinutes(10)).toBe(10);
		expect(roundUpToFiveMinutes(1140)).toBe(1140);
		expect(roundUpToFiveMinutes(1440)).toBe(1440);
	});

	it('rounds other values up to the next multiple of five', () => {
		expect(roundUpToFiveMinutes(1)).toBe(5);
		expect(roundUpToFiveMinutes(4)).toBe(5);
		expect(roundUpToFiveMinutes(6)).toBe(10);
		expect(roundUpToFiveMinutes(9)).toBe(10);
		expect(roundUpToFiveMinutes(1141)).toBe(1145);
		expect(roundUpToFiveMinutes(1439)).toBe(1440);
	});

	it('rounds negative values towards +infinity', () => {
		expect(roundUpToFiveMinutes(-17)).toBe(-15);
		expect(roundUpToFiveMinutes(-20)).toBe(-20);
		expect(roundUpToFiveMinutes(-21)).toBe(-20);
		expect(roundUpToFiveMinutes(-16)).toBe(-15);
		// -1 donne -0 (Math.ceil), numériquement égal à 0 : on compare par === et non par Object.is.
		expect(roundUpToFiveMinutes(-1) === 0).toBe(true);
		expect(roundUpToFiveMinutes(-4) === 0).toBe(true);
		expect(roundUpToFiveMinutes(-119)).toBe(-115);
		expect(roundUpToFiveMinutes(-120)).toBe(-120);
	});
});

describe('todayInZone', () => {
	it('gives the civil date of the zone, not of UTC', () => {
		const now = new Date('2026-09-20T12:00:00Z');
		expect(todayInZone('Pacific/Kiritimati', now)).toBe('2026-09-21');
		expect(todayInZone('Europe/Zurich', now)).toBe('2026-09-20');
		expect(todayInZone('UTC', now)).toBe('2026-09-20');
	});

	it('gives the previous day west of Greenwich early in the UTC morning', () => {
		expect(todayInZone('America/Los_Angeles', new Date('2026-09-20T05:00:00Z'))).toBe('2026-09-19');
	});

	it('crosses midnight in Europe/Zurich at 22:00Z in summer (UTC+2)', () => {
		expect(todayInZone('Europe/Zurich', new Date('2026-07-15T21:59:59Z'))).toBe('2026-07-15');
		expect(todayInZone('Europe/Zurich', new Date('2026-07-15T22:00:00Z'))).toBe('2026-07-16');
	});

	it('crosses midnight in Europe/Zurich at 23:00Z in winter (UTC+1)', () => {
		expect(todayInZone('Europe/Zurich', new Date('2026-01-15T22:59:59Z'))).toBe('2026-01-15');
		expect(todayInZone('Europe/Zurich', new Date('2026-01-15T23:00:00Z'))).toBe('2026-01-16');
	});

	it('crosses midnight in UTC at 00:00Z', () => {
		expect(todayInZone('UTC', new Date('2026-09-19T23:59:59.999Z'))).toBe('2026-09-19');
		expect(todayInZone('UTC', new Date('2026-09-20T00:00:00Z'))).toBe('2026-09-20');
	});

	it('returns a canonical ISO date with padded month and day', () => {
		const date = todayInZone('Europe/Zurich', new Date('2026-01-05T12:00:00Z'));
		expect(date).toBe('2026-01-05');
		expect(isIsoDate(date)).toBe(true);
	});
});

describe('properties against the Date.UTC oracle (1970..2100)', () => {
	it('daysFromCivil agrees with Date.UTC', () => {
		fc.assert(
			fc.property(civilDateArb, ([year, month, day]) => {
				expect(daysFromCivil(year, month, day)).toBe(utcDays(year, month, day));
			}),
			{ numRuns: NUM_RUNS }
		);
	});

	it('civilFromDays inverts daysFromCivil', () => {
		fc.assert(
			fc.property(civilDateArb, ([year, month, day]) => {
				expect(civilFromDays(daysFromCivil(year, month, day))).toEqual({ year, month, day });
			}),
			{ numRuns: NUM_RUNS }
		);
	});

	it('weekdayFromDays agrees with getUTCDay (0 = Sunday mapped to 7)', () => {
		fc.assert(
			fc.property(civilDateArb, ([year, month, day]) => {
				const days = daysFromCivil(year, month, day);
				expect(weekdayFromDays(days)).toBe(utcIsoWeekday(days));
			}),
			{ numRuns: NUM_RUNS }
		);
	});

	it('civilFromDays agrees with getUTCFullYear / getUTCMonth / getUTCDate', () => {
		fc.assert(
			fc.property(dayArb, (days) => {
				expect(civilFromDays(days)).toEqual(utcCivil(days));
			}),
			{ numRuns: NUM_RUNS }
		);
	});

	it('isLeapYear and daysInMonth agree with the calendar of Date.UTC', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1970, max: 2100 }),
				fc.integer({ min: 1, max: 12 }),
				(year, month) => {
					expect(isLeapYear(year)).toBe(utcDaysInMonth(year, 2) === 29);
					expect(daysInMonth(year, month)).toBe(utcDaysInMonth(year, month));
				}
			),
			{ numRuns: NUM_RUNS }
		);
	});

	it('nthWeekdayOfMonth agrees with a brute-force search', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1970, max: 2100 }),
				fc.integer({ min: 1, max: 12 }),
				weekdayArb,
				ordinalArb,
				(year, month, weekday, ordinal) => {
					const day = nthWeekdayOfMonth(year, month, weekday, ordinal);
					expect(day).toBe(utcNthWeekdayOfMonth(year, month, weekday, ordinal));
					expect(weekdayFromDays(daysFromCivil(year, month, day))).toBe(weekday);
				}
			),
			{ numRuns: NUM_RUNS }
		);
	});

	it('daysToIsoDate and isoDateToDays round-trip and agree with toISOString', () => {
		fc.assert(
			fc.property(dayArb, (days) => {
				const date = daysToIsoDate(days);
				expect(date).toBe(utcIsoDate(days));
				expect(isIsoDate(date)).toBe(true);
				expect(isoDateToDays(date)).toBe(days);
			}),
			{ numRuns: NUM_RUNS }
		);
	});

	it('formatIsoDate and parseIsoDate round-trip', () => {
		fc.assert(
			fc.property(civilDateArb, ([year, month, day]) => {
				const civil: CivilDate = { year, month, day };
				expect(parseIsoDate(formatIsoDate(civil))).toEqual(civil);
			}),
			{ numRuns: NUM_RUNS }
		);
	});

	it('addDays agrees with the overflow normalisation of Date.UTC', () => {
		fc.assert(
			fc.property(
				civilDateArb,
				fc.integer({ min: -1000, max: 1000 }),
				([year, month, day], delta) => {
					const expected = new Date(Date.UTC(year, month - 1, day + delta))
						.toISOString()
						.slice(0, 10);
					expect(addDays(formatIsoDate({ year, month, day }), delta)).toBe(expected);
				}
			),
			{ numRuns: NUM_RUNS }
		);
	});

	it('compareIsoDates has the sign of the difference in days', () => {
		fc.assert(
			fc.property(dayArb, dayArb, (a, b) => {
				expect(compareIsoDates(daysToIsoDate(a), daysToIsoDate(b))).toBe(Math.sign(a - b));
			}),
			{ numRuns: NUM_RUNS }
		);
	});

	it('formatLocalTime and parseLocalTime round-trip on 0..1439', () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 1439 }), (minutes) => {
				const time = formatLocalTime(minutes);
				expect(time).toMatch(/^\d{2}:\d{2}$/);
				expect(isLocalTime(time)).toBe(true);
				expect(parseLocalTime(time)).toBe(minutes);
				expect(localTimeToMinutes(time)).toBe(minutes);
			}),
			{ numRuns: NUM_RUNS }
		);
	});

	it('roundUpToFiveMinutes yields the smallest multiple of five not below the input', () => {
		fc.assert(
			fc.property(fc.integer({ min: -2000, max: 4000 }), (minutes) => {
				const rounded = roundUpToFiveMinutes(minutes);
				// Comparaison par === : Math.ceil peut produire -0, égal à 0 mais distinct pour Object.is.
				expect(rounded % 5 === 0).toBe(true);
				expect(rounded).toBeGreaterThanOrEqual(minutes);
				expect(rounded - minutes).toBeLessThan(5);
			}),
			{ numRuns: NUM_RUNS }
		);
	});

	it('weekStart is the Monday at most six days before the day', () => {
		fc.assert(
			fc.property(dayArb, (days) => {
				const monday = weekStart(days);
				expect(monday).toBeLessThanOrEqual(days);
				expect(days).toBeLessThan(monday + 7);
				expect(weekdayFromDays(monday)).toBe(1);
				expect(utcIsoWeekday(monday)).toBe(1);
				expect(weekStart(monday)).toBe(monday);
			}),
			{ numRuns: NUM_RUNS }
		);
	});
});

describe('properties before 1970 (negative day numbers)', () => {
	const earlyDayArb = fc.integer({ min: daysFromCivil(1600, 1, 1), max: -1 });

	it('civilFromDays and weekdayFromDays agree with Date.UTC', () => {
		fc.assert(
			fc.property(earlyDayArb, (days) => {
				const civil = utcCivil(days);
				expect(civilFromDays(days)).toEqual(civil);
				expect(daysFromCivil(civil.year, civil.month, civil.day)).toBe(days);
				expect(weekdayFromDays(days)).toBe(utcIsoWeekday(days));
			}),
			{ numRuns: NUM_RUNS }
		);
	});
});

describe('todayInZone guards', () => {
	// ADR 0012 : « aujourd'hui » et « maintenant » sont toujours des paramètres. Sans ces gardes,
	// Intl retomberait en silence sur le fuseau et l'horloge de la machine.
	it('rejects a missing or empty time zone instead of using the machine zone', () => {
		for (const timeZone of [undefined, null, '']) {
			expect(() =>
				todayInZone(timeZone as unknown as string, new Date('2026-09-19T10:30:00Z'))
			).toThrow(TypeError);
		}
	});

	it('rejects a missing or invalid now instead of reading the clock', () => {
		for (const now of [undefined, null, new Date(Number.NaN), '2026-09-19T10:30:00Z']) {
			expect(() => todayInZone('Europe/Zurich', now as unknown as Date)).toThrow(TypeError);
		}
	});
});

describe('four-digit year bounds', () => {
	// ADR 0012 : IsoDate porte une année sur quatre chiffres. Au-delà, la chaîne produite ne serait
	// plus relisible par parseIsoDate : mieux vaut une erreur qu'une valeur qui ment sur son type.
	it('formatIsoDate rejects a year outside 0000..9999', () => {
		for (const year of [-1, 10000, 1.5]) {
			expect(() => formatIsoDate({ year, month: 1, day: 1 }), String(year)).toThrow(RangeError);
		}
		expect(formatIsoDate({ year: 0, month: 1, day: 1 })).toBe('0000-01-01');
		expect(formatIsoDate({ year: 9999, month: 12, day: 31 })).toBe('9999-12-31');
	});

	it('daysToIsoDate and addDays refuse to leave the four-digit range', () => {
		expect(daysToIsoDate(isoDateToDays('9999-12-31'))).toBe('9999-12-31');
		expect(() => daysToIsoDate(isoDateToDays('9999-12-31') + 1)).toThrow(RangeError);
		expect(() => addDays('0000-01-01', -1)).toThrow(RangeError);
	});

	it('todayInZone refuses an instant before the common era', () => {
		// Date.UTC interprète les années 0 à 99 comme 1900 à 1999 : on passe par setUTCFullYear.
		const atYear = (year: number): Date => {
			const date = new Date(Date.UTC(2000, 0, 1));
			date.setUTCFullYear(year);
			return date;
		};
		expect(() => todayInZone('UTC', atYear(-1))).toThrow(RangeError);
		expect(todayInZone('UTC', atYear(1))).toBe('0001-01-01');
	});
});

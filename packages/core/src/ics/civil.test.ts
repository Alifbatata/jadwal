// Tests de civil.ts : passage d'une heure civile (date + minutes dans un fuseau IANA) à l'instant
// UTC, valeur de date pour ical-generator et formats RFC 5545. Toutes les attentes sont des instants
// UTC absolus ou des chaînes civiles : rien ne dépend du fuseau de la machine, et le script test:tz
// relance la suite telle quelle sous plusieurs fuseaux. Cas connus d'abord, puis deux contrôles
// croisés avec Intl.DateTimeFormat comme oracle indépendant du code : un balayage exhaustif de
// 2026-2027 (quatre changements d'heure par fuseau à heure d'été, trous et chevauchements compris)
// et une propriété d'aller-retour sur 1970-2100.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { daysToIsoDate, formatIsoDate, isoDateToDays, localTimeToMinutes } from '../dates.js';
import type { IsoDate, LocalTime } from '../types.js';
import { civilDateTime, civilToUtc, formatCivil, formatUtc } from './civil.js';

const ZURICH = 'Europe/Zurich';
const LOS_ANGELES = 'America/Los_Angeles';
const KIRITIMATI = 'Pacific/Kiritimati';
const KOLKATA = 'Asia/Kolkata';
/** Fuseaux de la propriété : sans changement d'heure, avec, à décalage d'une demi-heure, à +14. */
const ZONES = ['UTC', ZURICH, LOS_ANGELES, KOLKATA, KIRITIMATI];
const NUM_RUNS = 300;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

interface CivilParts {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
}

/** Formateurs mis en cache par fuseau : en construire un coûte bien plus qu'un formatage. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
	let formatter = formatters.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric',
			second: 'numeric'
		});
		formatters.set(timeZone, formatter);
	}
	return formatter;
}

/** Oracle : composantes civiles d'un instant dans un fuseau, lues avec Intl.DateTimeFormat. */
function readCivil(instant: Date, timeZone: string): CivilParts {
	const parts = formatterFor(timeZone).formatToParts(instant);
	const read = (type: Intl.DateTimeFormatPartTypes): number =>
		Number(parts.find((part) => part.type === type)?.value);
	return {
		year: read('year'),
		month: read('month'),
		day: read('day'),
		hour: read('hour'),
		minute: read('minute'),
		second: read('second')
	};
}

/** Composantes civiles ramenées à des millisecondes « comme si UTC ». */
function civilAsUtc(parts: CivilParts): number {
	return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/** Décalage du fuseau (heure civile moins UTC, en millisecondes) en vigueur à un instant. */
function offsetAt(instant: number, timeZone: string): number {
	return civilAsUtc(readCivil(new Date(instant), timeZone)) - instant;
}

/**
 * Instants dont l'heure civile dans le fuseau vaut `wanted` (millisecondes « comme si UTC ») :
 * aucun dans un trou de changement d'heure, deux dans un chevauchement, un sinon. Les décalages en
 * vigueur deux jours avant et deux jours après couvrent toute transition proche, quelle que soit sa
 * taille (une heure en Europe et en Amérique, quarante minutes ou un jour entier à Kiritimati).
 */
function instantsOf(wanted: number, timeZone: string): number[] {
	const offsets = new Set([
		offsetAt(wanted - 2 * MS_PER_DAY, timeZone),
		offsetAt(wanted, timeZone),
		offsetAt(wanted + 2 * MS_PER_DAY, timeZone)
	]);
	return [...offsets]
		.map((offset) => wanted - offset)
		.filter((instant) => civilAsUtc(readCivil(new Date(instant), timeZone)) === wanted);
}

type CivilKind = 'unique' | 'overlap' | 'gap';

/**
 * Instant attendu d'après la spécification, calculé sans le code testé : l'instant unique ; dans un
 * chevauchement, la seconde lecture, c'est-à-dire l'instant le plus tardif (heure d'hiver) ; dans un
 * trou, l'heure civile décalée d'une heure vers l'avant, lue avec le décalage d'après la transition.
 */
function expectedInstant(wanted: number, timeZone: string): { instant: number; kind: CivilKind } {
	const candidates = instantsOf(wanted, timeZone);
	if (candidates.length === 0) {
		const after = offsetAt(wanted + MS_PER_DAY, timeZone);
		return { instant: wanted + MS_PER_HOUR - after, kind: 'gap' };
	}
	return { instant: Math.max(...candidates), kind: candidates.length > 1 ? 'overlap' : 'unique' };
}

// Arbitraires : dates civiles valides de 1970 à 2100, minutes du jour, fuseau parmi ZONES.
const civilDateArb = fc
	.tuple(fc.integer({ min: 1970, max: 2100 }), fc.integer({ min: 1, max: 12 }))
	.chain(([year, month]) =>
		fc.record({
			year: fc.constant(year),
			month: fc.constant(month),
			day: fc.integer({ min: 1, max: new Date(Date.UTC(year, month, 0)).getUTCDate() })
		})
	);
const minutesOfDayArb = fc.integer({ min: 0, max: 1439 });
const zoneArb = fc.constantFrom(...ZONES);

describe('civilToUtc', () => {
	const known: [date: IsoDate, time: LocalTime, timeZone: string, instant: string][] = [
		['2026-09-21', '19:00', ZURICH, '2026-09-21T17:00:00.000Z'], // CEST
		['2026-11-16', '19:00', ZURICH, '2026-11-16T18:00:00.000Z'], // CET
		['2026-07-04', '12:00', LOS_ANGELES, '2026-07-04T19:00:00.000Z'], // PDT
		['2026-01-01', '00:00', KIRITIMATI, '2025-12-31T10:00:00.000Z'], // UTC+14
		['2026-01-01', '12:00', KOLKATA, '2026-01-01T06:30:00.000Z'], // UTC+5:30
		['2026-01-01', '00:00', 'UTC', '2026-01-01T00:00:00.000Z']
	];

	it.each(known)('%s %s in %s is %s', (date, time, timeZone, instant) => {
		expect(civilToUtc(date, localTimeToMinutes(time), timeZone).toISOString()).toBe(instant);
	});

	it('takes seconds into account: end of a civil day in Europe/Zurich', () => {
		expect(civilToUtc('2026-12-31', localTimeToMinutes('23:59'), ZURICH, 59).toISOString()).toBe(
			'2026-12-31T22:59:59.000Z'
		);
		expect(civilToUtc('2027-06-30', localTimeToMinutes('23:59'), ZURICH, 59).toISOString()).toBe(
			'2027-06-30T21:59:59.000Z'
		);
	});

	it('shifts a non-existent time (spring gap) one hour forward: 02:30 becomes 03:30 CEST', () => {
		expect(civilToUtc('2026-03-29', localTimeToMinutes('02:30'), ZURICH).toISOString()).toBe(
			'2026-03-29T01:30:00.000Z'
		);
	});

	it('takes the second reading (winter time) of an ambiguous time in the autumn overlap', () => {
		expect(civilToUtc('2026-10-25', localTimeToMinutes('02:30'), ZURICH).toISOString()).toBe(
			'2026-10-25T01:30:00.000Z'
		);
	});

	// Les règles de la spécification (trou : une heure vers l'avant ; ambiguïté : seconde lecture,
	// heure d'hiver) ne dépendent pas du fuseau. America/Los_Angeles change d'heure le 8 mars
	// (02:00 PST → 03:00 PDT) et le 1er novembre 2026 (02:00 PDT → 01:00 PST).
	it('shifts a non-existent time one hour forward west of UTC: 02:30 becomes 03:30 PDT', () => {
		expect(civilToUtc('2026-03-08', localTimeToMinutes('02:30'), LOS_ANGELES).toISOString()).toBe(
			'2026-03-08T10:30:00.000Z'
		);
	});

	it('takes the second reading (PST) of an ambiguous time west of UTC', () => {
		expect(civilToUtc('2026-11-01', localTimeToMinutes('01:30'), LOS_ANGELES).toISOString()).toBe(
			'2026-11-01T09:30:00.000Z'
		);
	});

	const invalidDates: string[] = ['2026-02-30', '2026-13-01', '2026-9-21', '20260921', ''];

	it.each(invalidDates)('rejects the invalid civil date "%s" with a TypeError', (date) => {
		expect(() => civilToUtc(date as IsoDate, 0, ZURICH)).toThrow(TypeError);
	});

	it('round-trips through Intl.DateTimeFormat and takes the later reading of an overlap', () => {
		fc.assert(
			fc.property(civilDateArb, minutesOfDayArb, zoneArb, (civil, minutesOfDay, timeZone) => {
				const wanted = Date.UTC(civil.year, civil.month - 1, civil.day, 0, minutesOfDay);
				const candidates = instantsOf(wanted, timeZone);
				// Heure civile inexistante (trou de changement d'heure) : couverte par le balayage.
				fc.pre(candidates.length > 0);
				const instant = civilToUtc(formatIsoDate(civil), minutesOfDay, timeZone);
				expect(readCivil(instant, timeZone)).toEqual({
					...civil,
					hour: Math.floor(minutesOfDay / 60),
					minute: minutesOfDay % 60,
					second: 0
				});
				// Heure ambiguë : seconde lecture, donc l'instant le plus tardif des deux.
				expect(instant.getTime()).toBe(Math.max(...candidates));
			}),
			{ numRuns: NUM_RUNS }
		);
	});
});

describe('civilToUtc over 2026-2027 (four daylight-saving changes per zone)', () => {
	const FROM = isoDateToDays('2026-01-01');
	const TO = isoDateToDays('2027-12-31');

	// Fuseau, heures civiles balayées, pas en jours, nombre de valeurs, trous et chevauchements
	// attendus. Europe/Zurich saute 02:00-02:59 les dimanches 29 mars 2026 et 28 mars 2027 et répète
	// 02:00-02:59 les 25 octobre 2026 et 31 octobre 2027 ; America/Los_Angeles saute 02:00-02:59 les
	// 8 mars 2026 et 14 mars 2027 et répète 01:00-01:59 les 1er novembre 2026 et 7 novembre 2027.
	// Les fuseaux sans transition sont balayés une fois par semaine.
	const sweeps: [
		timeZone: string,
		times: LocalTime[],
		stepDays: number,
		total: number,
		gaps: number,
		overlaps: number
	][] = [
		[ZURICH, ['02:30'], 1, 730, 2, 2],
		[LOS_ANGELES, ['01:30', '02:30'], 1, 1460, 2, 2],
		[KOLKATA, ['12:00'], 7, 105, 0, 0],
		[KIRITIMATI, ['00:00'], 7, 105, 0, 0],
		['UTC', ['23:59'], 7, 105, 0, 0]
	];

	it.each(sweeps)(
		'matches the Intl oracle for every swept civil time in %s',
		{ timeout: 30_000 },
		(timeZone, times, stepDays, total, gaps, overlaps) => {
			const counts: Record<CivilKind, number> = { unique: 0, overlap: 0, gap: 0 };
			const mismatches: string[] = [];
			let swept = 0;
			for (let day = FROM; day <= TO; day += stepDays) {
				const date = daysToIsoDate(day);
				for (const time of times) {
					const minutes = localTimeToMinutes(time);
					const expected = expectedInstant(day * MS_PER_DAY + minutes * MS_PER_MINUTE, timeZone);
					const wanted = new Date(expected.instant).toISOString();
					const actual = civilToUtc(date, minutes, timeZone).toISOString();
					counts[expected.kind] += 1;
					swept += 1;
					if (actual !== wanted) {
						mismatches.push(
							`${date} ${time} (${expected.kind}): expected ${wanted}, got ${actual}`
						);
					}
				}
			}
			expect(mismatches).toEqual([]);
			expect(swept).toBe(total);
			expect(counts).toEqual({ gap: gaps, overlap: overlaps, unique: total - gaps - overlaps });
		}
	);
});

describe('civilDateTime', () => {
	const value = civilDateTime('2026-09-21', localTimeToMinutes('19:00'));

	it('formats the civil date and time as YYYYMMDD and HHmmss', () => {
		expect(value.format('YYYYMMDD')).toBe('20260921');
		expect(value.format('HHmmss')).toBe('190000');
	});

	it('reads the civil time as UTC through toDate() and toJSON(), and is valid', () => {
		// La bibliothèque ne compare que le début et la fin d'un événement : lire l'heure civile
		// telle quelle préserve leur ordre même dans le trou d'un changement d'heure.
		expect(value.toDate().toISOString()).toBe('2026-09-21T19:00:00.000Z');
		expect(value.toJSON()).toBe('2026-09-21T19:00:00.000Z');
		expect(value.isValid()).toBe(true);
	});

	it('keeps the civil strings whatever the organisation zone', () => {
		const noon = civilDateTime('2026-07-04', localTimeToMinutes('12:00'));
		expect(noon.format('YYYYMMDD')).toBe('20260704');
		expect(noon.format('HHmmss')).toBe('120000');
		expect(noon.toDate().toISOString()).toBe('2026-07-04T12:00:00.000Z');
	});

	it('keeps a session that starts in a daylight-saving gap in order', () => {
		// 2026-03-29 à Zurich : 02:00 devient 03:00. Une séance 02:30-03:10 a un début « inexistant »
		// dont l'instant réel (03:30 CEST) suivrait sa fin : la comparaison doit rester civile.
		const start = civilDateTime('2026-03-29', localTimeToMinutes('02:30'));
		const end = civilDateTime('2026-03-29', localTimeToMinutes('03:10'));
		expect(start.toDate().getTime()).toBeLessThan(end.toDate().getTime());
		expect(civilToUtc('2026-03-29', localTimeToMinutes('02:30'), ZURICH).getTime()).toBeGreaterThan(
			civilToUtc('2026-03-29', localTimeToMinutes('03:10'), ZURICH).getTime()
		);
	});

	it('tz() and utc() return the value itself, which formats the same', () => {
		for (const other of [value.tz?.(ZURICH), value.utc?.()]) {
			expect(other).toBe(value);
			expect(other?.format('YYYYMMDD')).toBe('20260921');
			expect(other?.format('HHmmss')).toBe('190000');
			expect(other?.toDate().toISOString()).toBe('2026-09-21T19:00:00.000Z');
			expect(other?.isValid()).toBe(true);
		}
	});

	it('throws an Error for any other format', () => {
		expect(() => value.format('X')).toThrow(Error);
		expect(() => value.format('YYYY-MM-DDTHH:mm:ss')).toThrow(Error);
		expect(() => value.format()).toThrow(Error);
	});

	it('rejects minutes outside [0, 1440[ with a RangeError', () => {
		expect(() => civilDateTime('2026-09-21', 1440)).toThrow(RangeError);
		expect(() => civilDateTime('2026-09-21', -1)).toThrow(RangeError);
	});
});

describe('formatUtc', () => {
	it('formats an instant as an RFC 5545 UTC date-time', () => {
		expect(formatUtc(new Date('2026-12-31T22:59:59Z'))).toBe('20261231T225959Z');
		expect(formatUtc(new Date('2027-06-30T21:59:59.000Z'))).toBe('20270630T215959Z');
	});

	it('drops the milliseconds', () => {
		expect(formatUtc(new Date('2026-01-01T00:00:00.999Z'))).toBe('20260101T000000Z');
	});
});

describe('formatCivil', () => {
	it('formats a civil date and minutes of day as an RFC 5545 local date-time', () => {
		expect(formatCivil('2026-09-21', 1140)).toBe('20260921T190000');
		expect(formatCivil('2026-09-21', 0)).toBe('20260921T000000');
		expect(formatCivil('2026-09-21', 1439)).toBe('20260921T235900');
	});

	it.each([1440, -1, 1.5])('rejects minutes of day %s with a RangeError', (minutesOfDay) => {
		expect(() => formatCivil('2026-09-21', minutesOfDay)).toThrow(RangeError);
	});
});

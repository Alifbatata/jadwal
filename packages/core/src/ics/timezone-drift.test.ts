// Garde-fou contre le vieillissement des données de fuseau embarquées par le fournisseur de
// VTIMEZONE : ses décalages sont comparés à ceux d'Intl, c'est-à-dire à la base tz de Node. Le test
// échoue si la bibliothèque prend du retard sur tzdata pour un fuseau européen, ce qui décalerait
// les heures de tout un flux d'agenda. Les deux sources avancent chacune à leur rythme : le signal
// arrive quand Node embarque une base plus récente que la bibliothèque et qu'une règle européenne a
// changé entre les deux. Un mois de décalage entre les deux publications ne déclenche rien tant
// qu'aucune règle ne bouge, ce qui est le comportement voulu.

import { describe, expect, it } from 'vitest';
import { tzlib_get_offset, tzlib_get_timezones } from 'timezones-ical-library';
import { daysFromCivil, daysToIsoDate, formatIsoDate, nthWeekdayOfMonth } from '../dates.js';
import type { IsoDate } from '../types.js';
import { canonicalTimeZones } from './index.js';

/** Fuseaux européens canoniques, ceux qui concernent les organisations visées. */
const EUROPEAN_ZONES = canonicalTimeZones().filter((zone) => zone.startsWith('Europe/'));

/** Années couvertes : deux ans à partir de l'année où l'étape a été écrite. */
const YEARS = [2026, 2027] as const;

function pad2(value: number): string {
	return String(value).padStart(2, '0');
}

/**
 * Décalage réel d'une heure civile dans un fuseau, au format « +HHMM », lu par Intl. L'instant est
 * cherché par approximations successives, comme dans `civil.ts`.
 */
function offsetFromIntl(timeZone: string, date: string, time: string): string {
	const [year, month, day] = date.split('-').map(Number) as [number, number, number];
	const [hour, minute] = time.split(':').map(Number) as [number, number];
	const wanted = Date.UTC(year, month - 1, day, hour, minute);
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	});
	const wallClockOf = (instant: number): number => {
		const parts = Object.fromEntries(
			formatter
				.formatToParts(new Date(instant))
				.filter((part) => part.type !== 'literal')
				.map((part) => [part.type, Number(part.value)])
		) as Record<string, number>;
		return Date.UTC(
			parts.year ?? 0,
			(parts.month ?? 1) - 1,
			parts.day ?? 1,
			parts.hour ?? 0,
			parts.minute ?? 0
		);
	};
	let guess = wanted;
	for (let round = 0; round < 3; round += 1) guess -= wallClockOf(guess) - wanted;
	const minutes = (wanted - guess) / 60_000;
	const sign = minutes < 0 ? '-' : '+';
	const absolute = Math.abs(minutes);
	return `${sign}${pad2(Math.floor(absolute / 60))}${pad2(absolute % 60)}`;
}

/**
 * Dates de sondage : le 15 de chaque mois (régime stable), et les huit jours qui entourent les
 * changements d'heure européens, derniers dimanches de mars et d'octobre.
 */
function probeDates(year: number): IsoDate[] {
	const dates = new Set<IsoDate>();
	for (let month = 1; month <= 12; month += 1) {
		dates.add(formatIsoDate({ year, month, day: 15 }));
	}
	for (const month of [3, 10] as const) {
		const lastSunday = daysFromCivil(year, month, nthWeekdayOfMonth(year, month, 7, -1));
		for (let offset = -4; offset <= 3; offset += 1) {
			dates.add(daysToIsoDate(lastSunday + offset));
		}
	}
	return [...dates].sort();
}

describe('time zone data drift', () => {
	it('covers the European zones of the provider', () => {
		expect(EUROPEAN_ZONES.length).toBeGreaterThan(20);
		expect(EUROPEAN_ZONES).toContain('Europe/Zurich');
		// Le fournisseur connaît des noms qu'Intl ignore et inversement : seuls les canoniques comptent.
		expect(tzlib_get_timezones()).toContain('Europe/Zurich');
	});

	it('the comparison is not vacuous: a deliberately wrong offset is reported', () => {
		const date = probeDates(2026)[0] as IsoDate;
		const real = offsetFromIntl('Europe/Zurich', date, '12:00');
		const wrong = real === '+0100' ? '+0200' : '+0100';
		expect(wrong).not.toBe(real);
		expect(tzlib_get_offset('Europe/Zurich', date, '12:00')).toBe(real);
	});

	it.each(EUROPEAN_ZONES)(
		'%s : the provider offsets match Intl over two years, including the clock changes',
		(zone) => {
			const mismatches: string[] = [];
			for (const year of YEARS) {
				for (const date of probeDates(year)) {
					// 12:00 évite les heures inexistantes ou ambiguës des transitions.
					const expected = offsetFromIntl(zone, date, '12:00');
					const actual = tzlib_get_offset(zone, date, '12:00');
					if (actual !== expected)
						mismatches.push(`${date} 12:00 : ${actual} au lieu de ${expected}`);
				}
			}
			expect(mismatches, `${zone} : données de fuseau en retard sur tzdata`).toEqual([]);
		}
	);
});

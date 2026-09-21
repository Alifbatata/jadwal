// Passage des heures civiles (date + heure locale dans un fuseau IANA) à ical-generator sans jamais
// dépendre du fuseau de la machine. ical-generator formate une Date native avec les getters locaux
// de la machine dès qu'un fuseau est défini ; on lui donne donc un petit objet conforme à son
// interface ICalDayJsStub, qui rend les chaînes civiles telles quelles. Le seul calcul d'instant
// (Intl.DateTimeFormat, fuseau explicite) sert au UNTIL des RRULE, obligatoirement en UTC.

import type { ICalDayJsStub } from 'ical-generator';
import { MINUTES_PER_DAY, formatLocalTime, parseIsoDate } from '../dates.js';
import type { IsoDate } from '../types.js';

/** Millisecondes UTC d'une date civile, sans la règle des deux chiffres de `Date.UTC`. */
function utcOf(year: number, month: number, day: number, minutes = 0, seconds = 0): number {
	const instant = new Date(0);
	instant.setUTCFullYear(year, month - 1, day);
	instant.setUTCHours(0, minutes, seconds, 0);
	return instant.getTime();
}

/** Millisecondes d'une heure civile lue comme si elle était en UTC. */
function civilAsUtc(date: IsoDate, minutesOfDay: number): number {
	const civil = parseIsoDate(date);
	if (!civil) throw new TypeError(`Invalid ISO date: ${date}`);
	if (!Number.isInteger(minutesOfDay) || minutesOfDay < 0 || minutesOfDay >= MINUTES_PER_DAY) {
		throw new RangeError(`Minutes of day out of range: ${minutesOfDay}`);
	}
	return utcOf(civil.year, civil.month, civil.day, minutesOfDay);
}

/** Un `Intl.DateTimeFormat` par fuseau : le construire coûte cher et il est réutilisable. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
	let formatter = formatters.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			era: 'short',
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

/** Composantes civiles d'un instant dans un fuseau, ramenées à des millisecondes « comme si UTC ». */
function wallClockAsUtc(instant: Date, timeZone: string): number {
	const parts = formatterFor(timeZone).formatToParts(instant);
	const read = (type: Intl.DateTimeFormatPartTypes): number =>
		Number(parts.find((part) => part.type === type)?.value);
	const era = parts.find((part) => part.type === 'era')?.value;
	const year = era === 'AD' ? read('year') : 1 - read('year');
	return utcOf(
		year,
		read('month'),
		read('day'),
		read('hour') * 60 + read('minute'),
		read('second')
	);
}

const MS_PER_DAY = 86_400_000;

/**
 * Instant UTC d'une heure civile dans un fuseau IANA, indépendant du fuseau de la machine. Les
 * décalages en vigueur la veille et le lendemain donnent deux candidats ; ceux qui redonnent l'heure
 * civile voulue sont valides. Heure ambiguë (retour à l'heure d'hiver) : la seconde lecture, c'est-à-
 * dire l'instant le plus tardif. Heure inexistante (passage à l'heure d'été) : lue avec l'ancien
 * décalage, donc décalée d'une heure vers l'avant.
 */
export function civilToUtc(
	date: IsoDate,
	minutesOfDay: number,
	timeZone: string,
	seconds = 0
): Date {
	const civil = parseIsoDate(date);
	if (!civil) throw new TypeError(`Invalid ISO date: ${date}`);
	const wanted = utcOf(civil.year, civil.month, civil.day, minutesOfDay, seconds);
	const offsetAt = (instant: number): number =>
		wallClockAsUtc(new Date(instant), timeZone) - instant;
	const before = wanted - offsetAt(wanted - MS_PER_DAY);
	const after = wanted - offsetAt(wanted + MS_PER_DAY);
	const valid = [before, after].filter(
		(candidate) => wallClockAsUtc(new Date(candidate), timeZone) === wanted
	);
	return new Date(valid.length > 0 ? Math.max(...valid) : before);
}

/**
 * Valeur de date pour ical-generator : l'heure civile `minutesOfDay` (0 ≤ m < 1440) du jour `date`.
 * `format` rend les chaînes civiles, seuls formats que la bibliothèque demande (YYYYMMDD et
 * HHmmss) ; le fuseau est porté par l'événement, pas par cette valeur.
 */
export function civilDateTime(date: IsoDate, minutesOfDay: number): ICalDayJsStub {
	const compact = formatCivil(date, minutesOfDay);
	const ymd = compact.slice(0, 8);
	const hms = compact.slice(9);
	// L'objet porte une heure civile ; `toDate` la rend lue comme si elle était en UTC. La
	// bibliothèque ne s'en sert que pour comparer le début et la fin d'un événement, et cette
	// lecture préserve l'ordre civil : une séance qui commence dans le trou d'un changement d'heure
	// (02:30 le jour où 02:00 devient 03:00) verrait sinon son début reporté après sa fin, et la
	// bibliothèque les échangerait.
	const civilInstant = new Date(civilAsUtc(date, minutesOfDay));
	const stub: ICalDayJsStub = {
		isValid: () => true,
		toDate: () => civilInstant,
		toJSON: () => civilInstant.toISOString(),
		format: (format) => {
			if (format === 'YYYYMMDD') return ymd;
			if (format === 'HHmmss') return hms;
			throw new Error(`Unsupported date format: ${String(format)}`);
		},
		tz: () => stub,
		utc: () => stub
	};
	return stub;
}

/** « 20261231T225959Z » : instant au format RFC 5545 en UTC, pour UNTIL. */
export function formatUtc(instant: Date): string {
	const year = instant.getUTCFullYear();
	if (year < 0 || year > 9999) {
		throw new RangeError(`Year out of range for an iCalendar date-time: ${year}`);
	}
	const iso = instant.toISOString(); // 2026-12-31T22:59:59.000Z
	return `${iso.slice(0, 10).replaceAll('-', '')}T${iso.slice(11, 19).replaceAll(':', '')}Z`;
}

/** « 20260921T190000 » : heure civile au format RFC 5545 (sans fuseau), pour EXDATE avec TZID. */
export function formatCivil(date: IsoDate, minutesOfDay: number): string {
	if (!Number.isInteger(minutesOfDay) || minutesOfDay < 0 || minutesOfDay >= MINUTES_PER_DAY) {
		throw new RangeError(`Minutes of day out of range: ${minutesOfDay}`);
	}
	return `${date.replaceAll('-', '')}T${formatLocalTime(minutesOfDay).replaceAll(':', '')}00`;
}

// Arithmétique des dates civiles en entiers (jours depuis 1970-01-01), sans objet Date.
// Algorithmes de Howard Hinnant : https://howardhinnant.github.io/date_algorithms.html
// Seule exception : todayInZone, qui lit une horloge fournie par l'appelant via Intl.DateTimeFormat.

import type { IsoDate, LocalTime, Weekday } from './types.js';

export interface CivilDate {
	year: number;
	month: number;
	day: number;
}

export const MINUTES_PER_DAY = 1440;

/** Jours depuis 1970-01-01 (jour 0, un jeudi) d'une date civile du calendrier grégorien proleptique. */
export function daysFromCivil(year: number, month: number, day: number): number {
	const y = month <= 2 ? year - 1 : year;
	const era = Math.floor(y / 400);
	const yoe = y - era * 400; // [0, 399]
	const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1; // [0, 365]
	const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; // [0, 146096]
	return era * 146097 + doe - 719468;
}

/** Date civile d'un nombre de jours depuis 1970-01-01. */
export function civilFromDays(days: number): CivilDate {
	const z = days + 719468;
	const era = Math.floor(z / 146097);
	const doe = z - era * 146097; // [0, 146096]
	const yoe = Math.floor(
		(doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365
	); // [0, 399]
	const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)); // [0, 365]
	const mp = Math.floor((5 * doy + 2) / 153); // [0, 11]
	const day = doy - Math.floor((153 * mp + 2) / 5) + 1; // [1, 31]
	const month = mp < 10 ? mp + 3 : mp - 9; // [1, 12]
	return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

/** Jour de semaine ISO (1 = lundi … 7 = dimanche) d'un nombre de jours depuis 1970-01-01. */
export function weekdayFromDays(days: number): Weekday {
	// Le jour 0 est un jeudi : (0 + 3) mod 7 = 3, soit le quatrième jour de la semaine ISO.
	return (((((days + 3) % 7) + 7) % 7) + 1) as Weekday;
}

/** Nombre de jours depuis 1970-01-01 du lundi de la semaine qui contient `days`. */
export function weekStart(days: number): number {
	return days - (weekdayFromDays(days) - 1);
}

export function isLeapYear(year: number): boolean {
	return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number): number {
	if (month === 2) return isLeapYear(year) ? 29 : 28;
	return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/**
 * Jour du mois du nième `weekday` du mois (`ordinal` 1 à 4), ou du dernier (`ordinal` -1).
 * Les ordinaux 1 à 4 existent dans tout mois (28 jours au moins).
 */
export function nthWeekdayOfMonth(
	year: number,
	month: number,
	weekday: Weekday,
	ordinal: 1 | 2 | 3 | 4 | -1
): number {
	if (ordinal === -1) {
		const last = daysInMonth(year, month);
		const lastWeekday = weekdayFromDays(daysFromCivil(year, month, last));
		return last - ((lastWeekday - weekday + 7) % 7);
	}
	const firstWeekday = weekdayFromDays(daysFromCivil(year, month, 1));
	return 1 + ((weekday - firstWeekday + 7) % 7) + (ordinal - 1) * 7;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Analyse une chaîne « AAAA-MM-JJ » ; null si le format ou la date civile est invalide. */
export function parseIsoDate(value: string): CivilDate | null {
	const match = ISO_DATE.exec(value);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
	return { year, month, day };
}

export function isIsoDate(value: unknown): value is IsoDate {
	return typeof value === 'string' && parseIsoDate(value) !== null;
}

function pad(value: number, width: number): string {
	return String(value).padStart(width, '0');
}

export function formatIsoDate(date: CivilDate): IsoDate {
	// IsoDate est une année sur quatre chiffres (ADR 0012) : hors de ces bornes, la chaîne produite
	// ne serait plus analysable par parseIsoDate.
	if (!Number.isInteger(date.year) || date.year < 0 || date.year > 9999) {
		throw new RangeError(`Year out of range for an ISO date: ${date.year}`);
	}
	return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}` as IsoDate;
}

/** Jours depuis 1970-01-01 d'une date ISO valide. Lève une erreur sur une chaîne invalide. */
export function isoDateToDays(date: IsoDate): number {
	const civil = parseIsoDate(date);
	if (!civil) throw new TypeError(`Invalid ISO date: ${date}`);
	return daysFromCivil(civil.year, civil.month, civil.day);
}

export function daysToIsoDate(days: number): IsoDate {
	return formatIsoDate(civilFromDays(days));
}

export function addDays(date: IsoDate, days: number): IsoDate {
	return daysToIsoDate(isoDateToDays(date) + days);
}

/** Comparaison de deux dates ISO valides (le format canonique se compare comme une chaîne). */
export function compareIsoDates(a: IsoDate, b: IsoDate): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

const LOCAL_TIME = /^(\d{2}):(\d{2})$/;

/** Minutes depuis minuit d'une heure « HH:MM » ; null si le format ou la valeur est invalide. */
export function parseLocalTime(value: string): number | null {
	const match = LOCAL_TIME.exec(value);
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 23 || minutes > 59) return null;
	return hours * 60 + minutes;
}

export function isLocalTime(value: unknown): value is LocalTime {
	return typeof value === 'string' && parseLocalTime(value) !== null;
}

/** Heure « HH:MM » de minutes depuis minuit, dans [0, 1440[. */
export function formatLocalTime(minutes: number): LocalTime {
	if (!Number.isInteger(minutes) || minutes < 0 || minutes >= MINUTES_PER_DAY) {
		throw new RangeError(`Minutes of day out of range: ${minutes}`);
	}
	return `${pad(Math.floor(minutes / 60), 2)}:${pad(minutes % 60, 2)}` as LocalTime;
}

export function localTimeToMinutes(time: LocalTime): number {
	const minutes = parseLocalTime(time);
	if (minutes === null) throw new TypeError(`Invalid local time: ${time}`);
	return minutes;
}

/** Arrondi aux 5 minutes supérieures (vers +∞). */
export function roundUpToFiveMinutes(minutes: number): number {
	return Math.ceil(minutes / 5) * 5;
}

/**
 * Date civile du jour dans un fuseau IANA à l'instant `now`. Seul point du paquet qui utilise Intl ;
 * l'horloge est toujours fournie par l'appelant.
 */
export function todayInZone(timeZone: string, now: Date): IsoDate {
	// Sans ces gardes, Intl retomberait en silence sur le fuseau et l'horloge de la machine
	// (`timeZone: undefined`, `formatToParts(undefined)`), ce que l'ADR 0012 exclut.
	if (typeof timeZone !== 'string' || timeZone.length === 0) {
		throw new TypeError('timeZone must be a non-empty IANA time zone name');
	}
	if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
		throw new TypeError('now must be a valid Date');
	}
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		era: 'short',
		year: 'numeric',
		month: 'numeric',
		day: 'numeric'
	}).formatToParts(now);
	// Avant l'an 1, Intl compte les années à rebours et signale l'ère : la valeur brute serait fausse.
	if (parts.find((part) => part.type === 'era')?.value !== 'AD') {
		throw new RangeError('now is before the common era');
	}
	const read = (type: 'year' | 'month' | 'day'): number =>
		Number(parts.find((part) => part.type === type)?.value);
	return formatIsoDate({ year: read('year'), month: read('month'), day: read('day') });
}

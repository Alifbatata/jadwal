// Export agenda (RFC 5545) d'une organisation : point d'entrée @jadwal/core/ics, seul endroit du
// paquet qui dépend d'ical-generator et d'un fournisseur de VTIMEZONE. Règles : docs/adr/0003.

import ical, { escape, type ICalEventData } from 'ical-generator';
import { tzlib_get_ical_block, tzlib_get_timezones } from 'timezones-ical-library';
import {
	MINUTES_PER_DAY,
	daysToIsoDate,
	isoDateToDays,
	localTimeToMinutes,
	todayInZone
} from '../dates.js';
import { expandOccurrences, isRuleDay, ruleDays, sessionDurationMinutes } from '../expand.js';
import type {
	CourseSchedule,
	IsoDate,
	Pause,
	Prayer,
	PrayerTimesLookup,
	SessionException,
	Weekday
} from '../types.js';
import { MAX_RANGE_DAYS, assertValid, validateInput, type ValidationIssue } from '../validation.js';
import { civilDateTime, civilToUtc, formatCivil, formatUtc } from './civil.js';

export interface CalendarCourse {
	schedule: CourseSchedule;
	/** Textes déjà dans la langue voulue. */
	title: string;
	description?: string;
	location?: string;
	url?: string;
}

export interface BuildCalendarInput {
	/** Nom du calendrier (X-WR-CALNAME). */
	name: string;
	/** Fuseau IANA de l'organisation, par exemple `Europe/Zurich`. */
	timeZone: string;
	/** Instant courant : sert à DTSTAMP et à situer la fenêtre glissante. */
	now: Date;
	/** Hôte des UID (`<courseId>@<uidHost>`). */
	uidHost: string;
	courses: readonly CalendarCourse[];
	exceptions?: readonly SessionException[];
	pauses?: readonly Pause[];
	prayerTimes?: PrayerTimesLookup;
	/** Jours à venir couverts pour les cours exportés séance par séance (120 par défaut). */
	horizonDays?: number;
	/** Jours passés couverts pour ces mêmes cours (30 par défaut). */
	pastDays?: number;
	/** Libellé en tête de description d'une séance ancrée, par exemple « Après Maghrib ». */
	anchorLabel: (prayer: Prayer, offsetMinutes: number) => string;
}

export const DEFAULT_HORIZON_DAYS = 120;
export const DEFAULT_PAST_DAYS = 30;
/** Une heure : REFRESH-INTERVAL et X-PUBLISHED-TTL. */
const TTL_SECONDS = 3600;
const CRLF = '\r\n';
/** Fenêtre de recherche de la première occurrence d'un cours récurrent (deux mois suffisent). */
const FIRST_OCCURRENCE_SEARCH_DAYS = 62;
/** Horizon des EXDATE issues d'une pause, à partir d'aujourd'hui (voir addRecurringCourse). */
const EXDATE_HORIZON_DAYS = MAX_RANGE_DAYS;

const BYDAY: Record<Weekday, string> = {
	1: 'MO',
	2: 'TU',
	3: 'WE',
	4: 'TH',
	5: 'FR',
	6: 'SA',
	7: 'SU'
};

// Les UID sont écrits tels quels par ical-generator : on refuse ce qu'il faudrait échapper
// (RFC 5545 §3.3.11), les espaces et les caractères de contrôle.
const UID_SAFE = /^[^\s\p{Cc},;\\"]+$/u;
const UID_MESSAGE =
	'must not contain whitespace, control characters, comma, semicolon, backslash or quote (used verbatim in UID)';
// Un identifiant finissant par « -AAAA-MM-JJ » produirait le même UID que la séance datée d'un
// autre cours (RFC 5545 §3.8.4.7 : un UID désigne un seul événement).
const UID_DATE_SUFFIX = /-\d{4}-\d{2}-\d{2}$/;
const UID_SUFFIX_MESSAGE = 'must not end with -YYYY-MM-DD (would collide with a dated session UID)';

function isUidSafe(value: string): boolean {
	return UID_SAFE.test(value);
}

let knownTimeZones: Set<string> | undefined;

/** Fuseau connu du fournisseur de VTIMEZONE **et** accepté par Intl (les deux listes diffèrent). */
function isKnownTimeZone(timeZone: string): boolean {
	knownTimeZones ??= new Set(tzlib_get_timezones() as string[]);
	if (!knownTimeZones.has(timeZone)) return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone });
		return true;
	} catch {
		return false;
	}
}

function rawBlockFor(timeZone: string): string | null {
	const block = tzlib_get_ical_block(timeZone);
	const text = Array.isArray(block) ? block[0] : undefined;
	return text === undefined || text === '' ? null : text;
}

/**
 * Nom canonique d'un fuseau IANA, ou null s'il est inconnu. Le fournisseur de VTIMEZONE résout les
 * alias : le TZID du bloc porte le nom canonique (`Europe/Kiev` → `Europe/Kyiv`).
 */
export function canonicalTimeZone(timeZone: string): string | null {
	if (!isKnownTimeZone(timeZone)) return null;
	const block = rawBlockFor(timeZone);
	const tzid = block === null ? null : /^TZID:(.+)$/m.exec(block)?.[1]?.trim();
	return tzid === undefined || tzid === '' ? null : (tzid ?? null);
}

/** Vrai si le fuseau est connu et n'est pas un alias d'un autre nom. */
export function isCanonicalTimeZone(timeZone: string): boolean {
	return canonicalTimeZone(timeZone) === timeZone;
}

/** Tous les noms de fuseau canoniques, triés : de quoi peupler un choix à la saisie. */
export function canonicalTimeZones(): string[] {
	const zones = tzlib_get_timezones();
	const canonical = new Set<string>();
	if (Array.isArray(zones)) {
		for (const zone of zones) {
			if (isCanonicalTimeZone(zone)) canonical.add(zone);
		}
	}
	return [...canonical].sort();
}

/**
 * VTIMEZONE d'un fuseau IANA, ou null s'il est inconnu. Le TZID du bloc est réécrit avec le nom
 * demandé : sur un alias, il porterait le nom canonique et le `TZID=` des événements ne
 * référencerait aucun composant du fichier (RFC 5545 §3.2.19). `buildCalendar` refuse les alias,
 * cette réécriture reste un garde-fou pour les autres appelants.
 */
export function vtimezoneFor(timeZone: string): string | null {
	const block = isKnownTimeZone(timeZone) ? rawBlockFor(timeZone) : null;
	return block === null ? null : block.replace(/^TZID:.*$/m, `TZID:${timeZone}`);
}

function validateCalendarInput(input: BuildCalendarInput): ValidationIssue[] {
	const issues = validateInput({
		schedules: input.courses.map((course) => course.schedule),
		exceptions: input.exceptions,
		pauses: input.pauses
	});
	if (typeof input.uidHost !== 'string' || input.uidHost.length === 0) {
		issues.push({ code: 'id_empty', path: 'uidHost', message: 'expected a non-empty string' });
	} else if (!isUidSafe(input.uidHost)) {
		issues.push({ code: 'invalid_uid', path: 'uidHost', message: UID_MESSAGE });
	}
	input.courses.forEach((course, index) => {
		if (typeof course.schedule.id === 'string' && UID_DATE_SUFFIX.test(course.schedule.id)) {
			issues.push({
				code: 'invalid_uid',
				path: `courses[${index}].schedule.id`,
				message: UID_SUFFIX_MESSAGE
			});
		}
		if (typeof course.schedule.id === 'string' && !isUidSafe(course.schedule.id)) {
			issues.push({
				code: 'invalid_uid',
				path: `courses[${index}].schedule.id`,
				message: UID_MESSAGE
			});
		}
	});
	if (typeof input.timeZone !== 'string' || !isKnownTimeZone(input.timeZone)) {
		issues.push({
			code: 'invalid_time_zone',
			path: 'timeZone',
			message: `unknown IANA time zone ${JSON.stringify(input.timeZone)}`
		});
	} else if (!isCanonicalTimeZone(input.timeZone)) {
		// Un alias stocké aujourd'hui pourrait désigner un autre fuseau demain, si la zone se
		// sépare de celle vers laquelle elle pointe.
		issues.push({
			code: 'invalid_time_zone',
			path: 'timeZone',
			message: `${JSON.stringify(input.timeZone)} is an alias of the IANA time zone ${JSON.stringify(
				canonicalTimeZone(input.timeZone)
			)}; use the canonical name`
		});
	}
	if (!(input.now instanceof Date) || Number.isNaN(input.now.getTime())) {
		issues.push({ code: 'invalid_date', path: 'now', message: 'expected a valid Date' });
	}
	const horizonDays = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
	const pastDays = input.pastDays ?? DEFAULT_PAST_DAYS;
	for (const [name, value] of [
		['horizonDays', horizonDays],
		['pastDays', pastDays]
	] as const) {
		if (!Number.isInteger(value) || value < 0) {
			issues.push({
				code: 'invalid_horizon',
				path: name,
				message: 'expected a non-negative integer'
			});
		}
	}
	if (
		Number.isInteger(horizonDays) &&
		Number.isInteger(pastDays) &&
		horizonDays + pastDays + 1 > MAX_RANGE_DAYS
	) {
		issues.push({
			code: 'invalid_horizon',
			path: 'horizonDays',
			message: `pastDays + horizonDays + 1 must not exceed ${MAX_RANGE_DAYS} days`
		});
	}
	return issues;
}

/** Événement à créer, avec sa clé de tri (cours, date, maître avant ses séances déplacées). */
interface PendingEvent {
	courseId: string;
	date: IsoDate;
	rank: number;
	data: ICalEventData;
}

interface CourseContext {
	input: BuildCalendarInput;
	timeZone: string;
	/** « Aujourd'hui » dans le fuseau de l'organisation, en jours depuis 1970-01-01. */
	today: number;
	pending: PendingEvent[];
}

/**
 * Retire les caractères de contrôle, que la RFC 5545 §3.1 interdit dans une valeur et que
 * l'échappement de la bibliothèque laisse passer tels quels. La tabulation est conservée.
 */
function sanitize(text: string): string {
	// eslint-disable-next-line no-control-regex -- c'est précisément ce qu'il faut retirer.
	return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

function textFields(
	course: CalendarCourse,
	description: string | undefined
): Partial<ICalEventData> {
	const fields: Partial<ICalEventData> = { summary: sanitize(course.title) };
	if (description !== undefined && description !== '') fields.description = sanitize(description);
	if (course.location !== undefined && course.location !== '') {
		fields.location = sanitize(course.location);
	}
	if (course.url !== undefined && course.url !== '') fields.url = sanitize(course.url);
	return fields;
}

/** DTSTART/DTEND d'une séance : début `startMinutes` le jour `date` (+ `startDayOffset`), durée donnée. */
function startEnd(
	timeZone: string,
	date: IsoDate,
	startDayOffset: number,
	startMinutes: number,
	durationMinutes: number
): Pick<ICalEventData, 'start' | 'end'> {
	const startDay = isoDateToDays(date) + startDayOffset;
	const endTotal = startMinutes + durationMinutes;
	const endDayOffset = Math.floor(endTotal / MINUTES_PER_DAY);
	return {
		start: civilDateTime(daysToIsoDate(startDay), startMinutes),
		end: civilDateTime(
			daysToIsoDate(startDay + endDayOffset),
			endTotal - endDayOffset * MINUTES_PER_DAY
		)
	};
}

function pausesFor(pauses: readonly Pause[], courseId: string): Pause[] {
	return pauses.filter((pause) => pause.courseId === undefined || pause.courseId === courseId);
}

function isPausedDay(pauses: readonly Pause[], day: number): boolean {
	return pauses.some((pause) => day >= isoDateToDays(pause.from) && day <= isoDateToDays(pause.to));
}

/** Cours à heure fixe hebdomadaire ou mensuel : un VEVENT maître avec RRULE, EXDATE, RECURRENCE-ID. */
function addRecurringCourse(context: CourseContext, course: CalendarCourse): void {
	const { schedule } = course;
	const { timeZone, input } = context;
	if (schedule.timing.kind !== 'fixed') throw new Error('recurring export needs a fixed timing');
	const startsOn = isoDateToDays(schedule.startsOn);
	const first = ruleDays(schedule, startsOn, startsOn + FIRST_OCCURRENCE_SEARCH_DAYS)[0];
	if (first === undefined) return; // le cours se termine avant sa première séance
	const startMinutes = localTimeToMinutes(schedule.timing.start);
	const duration = sessionDurationMinutes(schedule.timing);
	const pauses = pausesFor(input.pauses ?? [], schedule.id);
	const exceptions = (input.exceptions ?? []).filter(
		(exception) =>
			exception.courseId === schedule.id &&
			isRuleDay(schedule, isoDateToDays(exception.date)) &&
			!isPausedDay(pauses, isoDateToDays(exception.date))
	);

	const recurrence = schedule.recurrence;
	let rule: string;
	if (recurrence.kind === 'weekly') {
		const days = [...recurrence.weekdays].sort((a, b) => a - b).map((weekday) => BYDAY[weekday]);
		rule = `FREQ=WEEKLY;INTERVAL=${recurrence.interval};WKST=MO;BYDAY=${days.join(',')}`;
	} else if (recurrence.kind === 'monthly') {
		rule = `FREQ=MONTHLY;BYDAY=${recurrence.ordinal}${BYDAY[recurrence.weekday]}`;
	} else {
		throw new Error('recurring export needs a weekly or monthly recurrence');
	}
	if (schedule.endsOn !== undefined) {
		// RFC 5545 : UNTIL en UTC dès que DTSTART porte un TZID. On vise l'instant qui précède le
		// début du jour suivant : « 23:59:59 » n'existe pas partout (America/Nuuk change d'heure à
		// 22:00 et le dernier jour de mars n'y a pas de 23e heure), ce qui laisserait passer une
		// séance de plus.
		const nextDay = daysToIsoDate(isoDateToDays(schedule.endsOn) + 1);
		const until = new Date(civilToUtc(nextDay, 0, timeZone).getTime() - 1000);
		rule += `;UNTIL=${formatUtc(until)}`;
	}

	const excluded = new Set<number>();
	for (const exception of exceptions) {
		if (exception.kind === 'cancelled') excluded.add(isoDateToDays(exception.date));
	}
	// Un cours sans date de fin et une pause de plusieurs siècles produiraient des millions
	// d'EXDATE : dans ce seul cas, les pauses sont bornées à un horizon. Au-delà, le flux régénéré à
	// chaque lecture (REFRESH-INTERVAL d'une heure) rattrape la pause avant qu'elle ne commence.
	const exdateLimit =
		schedule.endsOn === undefined
			? context.today + EXDATE_HORIZON_DAYS
			: isoDateToDays(schedule.endsOn);
	for (const pause of pauses) {
		const from = isoDateToDays(pause.from);
		const to = Math.min(isoDateToDays(pause.to), exdateLimit);
		if (to < from) continue;
		for (const day of ruleDays(schedule, from, to)) excluded.add(day);
	}
	const lines = [`RRULE:${rule}`];
	if (excluded.size > 0) {
		const days = [...excluded].sort((a, b) => a - b);
		const values = days.map((day) => formatCivil(daysToIsoDate(day), startMinutes));
		lines.push(`EXDATE;TZID=${timeZone}:${values.join(',')}`);
	}

	const uid = `${schedule.id}@${input.uidHost}`;
	const common = {
		id: uid,
		sequence: schedule.sequence,
		stamp: input.now,
		timezone: timeZone,
		...textFields(course, course.description)
	};
	context.pending.push({
		courseId: schedule.id,
		date: daysToIsoDate(first),
		rank: 0,
		data: {
			...common,
			...startEnd(timeZone, daysToIsoDate(first), 0, startMinutes, duration),
			repeating: lines.join('\r\n')
		}
	});
	for (const exception of exceptions) {
		if (exception.kind !== 'moved') continue;
		context.pending.push({
			courseId: schedule.id,
			date: exception.date,
			rank: 1,
			data: {
				...common,
				recurrenceId: civilDateTime(exception.date, startMinutes),
				...startEnd(timeZone, exception.toDate, 0, localTimeToMinutes(exception.toStart), duration)
			}
		});
	}
}

/** Cours à dates précises ou ancrés sur une prière : un VEVENT par séance dans la fenêtre. */
function addDatedCourses(
	context: CourseContext,
	courses: readonly CalendarCourse[],
	range: { from: IsoDate; to: IsoDate }
): void {
	if (courses.length === 0) return;
	const { input, timeZone } = context;
	const byId = new Map(courses.map((course) => [course.schedule.id, course]));
	const occurrences = expandOccurrences({
		schedules: courses.map((course) => course.schedule),
		exceptions: input.exceptions,
		pauses: input.pauses,
		prayerTimes: input.prayerTimes,
		range
	});
	for (const occurrence of occurrences) {
		if (occurrence.status !== 'scheduled' && occurrence.status !== 'moved_here') continue;
		if (occurrence.start === null || occurrence.end === null) continue; // heure de prière inconnue
		const course = byId.get(occurrence.courseId);
		if (!course) continue;
		const startMinutes = localTimeToMinutes(occurrence.start);
		const endMinutes = localTimeToMinutes(occurrence.end);
		const duration =
			endMinutes > startMinutes
				? endMinutes - startMinutes
				: endMinutes + MINUTES_PER_DAY - startMinutes;
		const description =
			occurrence.anchor === undefined
				? course.description
				: [
						input.anchorLabel(occurrence.anchor.prayer, occurrence.anchor.offsetMinutes),
						course.description
					]
						.filter((part) => part !== undefined && part !== '')
						.join('\n');
		const uidDate = occurrence.originalDate ?? occurrence.date;
		context.pending.push({
			courseId: occurrence.courseId,
			date: occurrence.date,
			rank: 2,
			data: {
				id: `${occurrence.courseId}-${uidDate}@${input.uidHost}`,
				sequence: course.schedule.sequence,
				stamp: input.now,
				timezone: timeZone,
				...textFields(course, description),
				...startEnd(timeZone, occurrence.date, occurrence.startDayOffset, startMinutes, duration)
			}
		});
	}
}

function comparePending(a: PendingEvent, b: PendingEvent): number {
	if (a.courseId !== b.courseId) return a.courseId < b.courseId ? -1 : 1;
	if (a.rank !== b.rank) return a.rank - b.rank;
	return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

function isRecurringFixed(schedule: CourseSchedule): boolean {
	return schedule.timing.kind === 'fixed' && schedule.recurrence.kind !== 'dates';
}

/**
 * Construit le flux ICS complet d'une organisation (chaîne, lignes CRLF). Lève une
 * ValidationError sur une entrée invalide.
 */
export function buildCalendar(input: BuildCalendarInput): string {
	assertValid(validateCalendarInput(input));
	const timeZone = input.timeZone;
	const today = isoDateToDays(todayInZone(timeZone, input.now));
	const range = {
		from: daysToIsoDate(today - (input.pastDays ?? DEFAULT_PAST_DAYS)),
		to: daysToIsoDate(today + (input.horizonDays ?? DEFAULT_HORIZON_DAYS))
	};

	const calendar = ical({
		name: escape(sanitize(input.name), false),
		prodId: { company: input.uidHost, product: 'jadwal', language: 'FR' },
		// Pas de METHOD : la RFC 5546 §3.2.1 exige un ORGANIZER dans chaque VEVENT avec
		// METHOD:PUBLISH, et un flux auquel on s'abonne n'a pas d'organisateur à déclarer.
		// Pas de nom de fuseau sur le calendrier : ical-generator formaterait alors DTSTAMP et UNTIL
		// en heure locale de la machine. Le fuseau est posé sur chaque événement ; le générateur
		// fournit tout de même le VTIMEZONE.
		timezone: { name: null, generator: vtimezoneFor },
		ttl: TTL_SECONDS
	});

	const context: CourseContext = { input, timeZone, today, pending: [] };
	for (const course of input.courses) {
		if (isRecurringFixed(course.schedule)) addRecurringCourse(context, course);
	}
	addDatedCourses(
		context,
		input.courses.filter((course) => !isRecurringFixed(course.schedule)),
		range
	);

	context.pending.sort(comparePending);
	for (const event of context.pending) calendar.createEvent(event.data);
	if (context.pending.length === 0) {
		// La grammaire de la RFC 5545 §3.6 exige au moins un composant : sans aucune séance, le
		// VTIMEZONE de l'organisation tient ce rôle. Sans VEVENT, poser le nom de fuseau sur le
		// calendrier n'a aucun effet sur DTSTAMP ni sur UNTIL, et la bibliothèque écrit alors
		// elle-même TIMEZONE-ID et X-WR-TIMEZONE.
		calendar.timezone({ name: timeZone, generator: vtimezoneFor });
	} else {
		calendar.x('X-WR-TIMEZONE', timeZone);
	}
	return finalize(calendar.toString());
}

/**
 * La bibliothèque échappe URL comme du texte alors que sa valeur est de type URI, que la RFC 5545
 * §3.3.13 laisse hors de l'échappement par contre-oblique : une URL contenant une virgule ou un
 * point-virgule sortirait avec des contre-obliques, qu'aucun client ne retire. Un URI ne peut pas
 * contenir de contre-oblique (RFC 3986 §2), la restitution est donc sans ambiguïté.
 */
function unescapeUri(line: string): string {
	if (!line.startsWith('URL;') && !line.startsWith('URL:')) return line;
	// Le pliage (CRLF + espace) peut séparer la contre-oblique du caractère qu'elle échappe.
	return line.replace(/\\((?:\r\n[ \t])?)([\\,;])/g, '$1$2');
}

/** Lignes logiques : une ligne pliée (CRLF + espace) est recollée à la précédente. */
function logicalLines(ics: string): string[] {
	const lines: string[] = [];
	for (const line of ics.split(CRLF)) {
		const previous = lines.length - 1;
		if (previous >= 0 && (line.startsWith(' ') || line.startsWith('\t'))) {
			lines[previous] = `${lines[previous] ?? ''}${CRLF}${line}`;
		} else {
			lines.push(line);
		}
	}
	return lines;
}

/**
 * Remet les propriétés du calendrier avant les composants (RFC 5545 §3.6 : `icalbody = calprops
 * component`) et garantit le CRLF final (§3.4). ical-generator écrit REFRESH-INTERVAL et
 * X-PUBLISHED-TTL après le VTIMEZONE, et les propriétés X- après les VEVENT.
 */
function finalize(ics: string): string {
	const lines = logicalLines(ics.endsWith(CRLF) ? ics.slice(0, -CRLF.length) : ics);
	const first = lines[0] ?? '';
	const last = lines[lines.length - 1] ?? '';
	const properties: string[] = [];
	const components: string[] = [];
	let depth = 0;
	for (const line of lines.slice(1, -1)) {
		if (line.startsWith('BEGIN:')) depth += 1;
		(depth > 0 ? components : properties).push(unescapeUri(line));
		if (line.startsWith('END:')) depth -= 1;
	}
	return [first, ...properties, ...components, last].join(CRLF) + CRLF;
}

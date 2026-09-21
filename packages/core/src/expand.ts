// Expansion des occurrences : rythme, bornes du cours, pauses, exceptions, horaires fixes ou ancrés.
// Toute l'arithmétique se fait en jours depuis 1970-01-01 et en minutes depuis minuit.

import {
	MINUTES_PER_DAY,
	civilFromDays,
	daysFromCivil,
	daysToIsoDate,
	formatLocalTime,
	isLocalTime,
	isoDateToDays,
	localTimeToMinutes,
	nthWeekdayOfMonth,
	roundUpToFiveMinutes,
	weekStart
} from './dates.js';
import type {
	CourseSchedule,
	DateRange,
	IsoDate,
	LocalTime,
	Occurrence,
	Pause,
	Prayer,
	PrayerTimesLookup,
	SessionException,
	Timing
} from './types.js';
import {
	MAX_RANGE_DAYS,
	ValidationError,
	assertValid,
	dateIssue,
	timeIssue,
	validateInput,
	validateRange,
	type ValidationIssue
} from './validation.js';

export interface ExpandInput {
	schedules: readonly CourseSchedule[];
	exceptions?: readonly SessionException[];
	pauses?: readonly Pause[];
	/** Plage inclusive, 400 jours au plus. */
	range: DateRange;
	/** Heures de prière par date ; sans table, les cours ancrés sortent sans heure. */
	prayerTimes?: PrayerTimesLookup;
}

interface DayInterval {
	from: number;
	to: number;
}

const NO_PRAYER_TIMES: PrayerTimesLookup = () => undefined;

/** Intervalle en jours couvert par le cours, borné par [from, to]. Null si vide. */
function courseWindow(schedule: CourseSchedule, from: number, to: number): DayInterval | null {
	const start = Math.max(from, isoDateToDays(schedule.startsOn));
	const end = schedule.endsOn === undefined ? to : Math.min(to, isoDateToDays(schedule.endsOn));
	return start <= end ? { from: start, to: end } : null;
}

/**
 * Jours (depuis 1970-01-01) où le rythme du cours produit une séance, dans [from, to] et dans les
 * bornes du cours, en ordre croissant. Avance par semaine (ou quinzaine) et par mois, jamais jour
 * par jour.
 */
export function ruleDays(schedule: CourseSchedule, from: number, to: number): number[] {
	const window = courseWindow(schedule, from, to);
	if (!window) return [];
	const recurrence = schedule.recurrence;
	const days: number[] = [];
	switch (recurrence.kind) {
		case 'weekly': {
			const step = 7 * recurrence.interval;
			const weekdays = [...recurrence.weekdays].sort((a, b) => a - b);
			let week = weekStart(window.from);
			if (recurrence.interval === 2) {
				const anchorWeek = weekStart(isoDateToDays(recurrence.anchorDate));
				if (((week - anchorWeek) / 7) % 2 !== 0) week += 7;
			}
			for (; week <= window.to; week += step) {
				for (const weekday of weekdays) {
					const day = week + weekday - 1;
					if (day >= window.from && day <= window.to) days.push(day);
				}
			}
			return days;
		}
		case 'monthly': {
			const first = civilFromDays(window.from);
			let year = first.year;
			let month = first.month;
			for (;;) {
				const day = daysFromCivil(
					year,
					month,
					nthWeekdayOfMonth(year, month, recurrence.weekday, recurrence.ordinal)
				);
				if (day > window.to) break;
				if (day >= window.from) days.push(day);
				month += 1;
				if (month > 12) {
					month = 1;
					year += 1;
				}
			}
			return days;
		}
		case 'dates': {
			for (const date of recurrence.dates) {
				const day = isoDateToDays(date);
				if (day >= window.from && day <= window.to) days.push(day);
			}
			return days.sort((a, b) => a - b);
		}
	}
}

/** Vrai si le rythme du cours produit une séance ce jour-là (bornes du cours comprises). */
export function isRuleDay(schedule: CourseSchedule, day: number): boolean {
	return ruleDays(schedule, day, day).length === 1;
}

function pauseIntervals(pauses: readonly Pause[], courseId: string): DayInterval[] {
	return pauses
		.filter((pause) => pause.courseId === undefined || pause.courseId === courseId)
		.map((pause) => ({ from: isoDateToDays(pause.from), to: isoDateToDays(pause.to) }));
}

function isPaused(intervals: readonly DayInterval[], day: number): boolean {
	return intervals.some((interval) => day >= interval.from && day <= interval.to);
}

interface ComputedTimes {
	start: LocalTime | null;
	end: LocalTime | null;
	startDayOffset: number;
	endDayOffset: number;
	anchor?: { prayer: Prayer; offsetMinutes: number };
}

/** Heures inconnues : l'ancrage sur la prière reste, mais aucun jour ni aucune heure. */
const UNKNOWN_TIMES = { start: null, end: null, startDayOffset: 0, endDayOffset: 0 } as const;

/** Heures d'une séance à partir de minutes de début et de fin comptées depuis minuit du jour `date`. */
function timesFromMinutes(startMinutes: number, endMinutes: number): ComputedTimes {
	const startDay = Math.floor(startMinutes / MINUTES_PER_DAY);
	const endDay = Math.floor(endMinutes / MINUTES_PER_DAY);
	// Un début la veille (décalage négatif sur une prière très matinale) n'est pas représentable :
	// la séance est rattachée à son jour, elle ne peut pas commencer avant.
	if (startDay < 0) return { ...UNKNOWN_TIMES };
	return {
		start: formatLocalTime(startMinutes - startDay * MINUTES_PER_DAY),
		end: formatLocalTime(endMinutes - endDay * MINUTES_PER_DAY),
		startDayOffset: startDay,
		endDayOffset: endDay
	};
}

function computeTimes(
	timing: Timing,
	date: IsoDate,
	prayerTimes: PrayerTimesLookup
): ComputedTimes {
	if (timing.kind === 'fixed') {
		const start = localTimeToMinutes(timing.start);
		let end = localTimeToMinutes(timing.end);
		if (end <= start) end += MINUTES_PER_DAY;
		return timesFromMinutes(start, end);
	}
	const anchor = { prayer: timing.prayer, offsetMinutes: timing.offsetMinutes };
	const day = prayerTimes(date);
	// **L'iqama d'abord, l'heure du soleil ensuite.** Un cours « après Maghrib » se tient quand les
	// gens sont dans la salle, et c'est l'iqama qui le dit ; l'heure du soleil n'est que le repli
	// quand la mosquée n'en a pas réglé (ADR 0004, étape 8). Le décalage propre au cours s'ajoute
	// par-dessus, sans changer de sens.
	const iqama = day?.iqama?.[timing.prayer];
	const time = isLocalTime(iqama) ? iqama : day?.[timing.prayer];
	// Jour absent de la table, ou heure illisible (cellule vide, « 20h00 ») : heure inconnue.
	if (!isLocalTime(time)) return { ...UNKNOWN_TIMES, anchor };
	const start = roundUpToFiveMinutes(localTimeToMinutes(time) + timing.offsetMinutes);
	return { ...timesFromMinutes(start, start + timing.durationMinutes), anchor };
}

/** Durée d'une séance en minutes, telle que reprise par une séance déplacée. */
export function sessionDurationMinutes(timing: Timing): number {
	if (timing.kind === 'prayer') return timing.durationMinutes;
	const start = localTimeToMinutes(timing.start);
	const end = localTimeToMinutes(timing.end);
	return end <= start ? end + MINUTES_PER_DAY - start : end - start;
}

function movedTimes(timing: Timing, toStart: LocalTime): ComputedTimes {
	const start = localTimeToMinutes(toStart);
	return timesFromMinutes(start, start + sessionDurationMinutes(timing));
}

function startSortKey(occurrence: Occurrence): number {
	if (occurrence.start === null) return Number.POSITIVE_INFINITY;
	return localTimeToMinutes(occurrence.start) + occurrence.startDayOffset * MINUTES_PER_DAY;
}

const STATUS_ORDER: Record<Occurrence['status'], number> = {
	scheduled: 0,
	cancelled: 1,
	moved_away: 2,
	moved_here: 3
};

/** Tri : date, puis début (heure inconnue en dernier), puis identifiant du cours, puis statut. */
export function compareOccurrences(a: Occurrence, b: Occurrence): number {
	if (a.date !== b.date) return a.date < b.date ? -1 : 1;
	const startDiff = startSortKey(a) - startSortKey(b);
	if (startDiff !== 0 && !Number.isNaN(startDiff)) return startDiff;
	if (a.courseId !== b.courseId) return a.courseId < b.courseId ? -1 : 1;
	return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
}

/**
 * Développe les occurrences de tous les cours sur une plage inclusive de 400 jours au plus.
 * Lève une ValidationError sur une entrée invalide.
 */
export function expandOccurrences(input: ExpandInput): Occurrence[] {
	assertValid([...validateInput(input), ...validateRange(input.range)]);
	const prayerTimes = input.prayerTimes ?? NO_PRAYER_TIMES;
	const pauses = input.pauses ?? [];
	const from = isoDateToDays(input.range.from);
	const to = isoDateToDays(input.range.to);
	const inRange = (day: number): boolean => day >= from && day <= to;
	const schedulesById = new Map(input.schedules.map((schedule) => [schedule.id, schedule]));

	const occurrences: Occurrence[] = [];
	const byCourseAndDay = new Map<string, Occurrence>();
	const key = (courseId: string, day: number): string => `${courseId}\u0000${day}`;
	const pausesByCourse = new Map<string, DayInterval[]>();
	for (const schedule of input.schedules) {
		const intervals = pauseIntervals(pauses, schedule.id);
		pausesByCourse.set(schedule.id, intervals);
		for (const day of ruleDays(schedule, from, to)) {
			if (isPaused(intervals, day)) continue;
			const date = daysToIsoDate(day);
			const occurrence: Occurrence = {
				courseId: schedule.id,
				date,
				...computeTimes(schedule.timing, date, prayerTimes),
				status: 'scheduled'
			};
			occurrences.push(occurrence);
			byCourseAndDay.set(key(schedule.id, day), occurrence);
		}
	}

	for (const exception of input.exceptions ?? []) {
		const schedule = schedulesById.get(exception.courseId);
		if (!schedule) continue; // cours inconnu : exception orpheline, ignorée ici
		const day = isoDateToDays(exception.date);
		// Une exception dont la date n'est pas une séance (orpheline) ou tombe dans une pause est ignorée.
		if (!isRuleDay(schedule, day)) continue;
		if (isPaused(pausesByCourse.get(schedule.id) ?? [], day)) continue;
		const original = byCourseAndDay.get(key(schedule.id, day));
		if (exception.kind === 'cancelled') {
			if (original) original.status = 'cancelled';
			continue;
		}
		if (original) {
			original.status = 'moved_away';
			original.movedTo = { date: exception.toDate, start: exception.toStart };
		}
		const toDay = isoDateToDays(exception.toDate);
		if (inRange(toDay)) {
			occurrences.push({
				courseId: schedule.id,
				date: exception.toDate,
				...movedTimes(schedule.timing, exception.toStart),
				status: 'moved_here',
				originalDate: exception.date
			});
		}
	}

	return occurrences.sort(compareOccurrences);
}

export interface NextOccurrencesInput {
	schedules: readonly CourseSchedule[];
	exceptions?: readonly SessionException[];
	pauses?: readonly Pause[];
	prayerTimes?: PrayerTimesLookup;
	/** Premier jour considéré (inclus). */
	from: IsoDate;
	/** Sur le jour `from`, les séances qui commencent avant cette heure sont passées. */
	fromTime?: LocalTime;
	/** Nombre maximal d'occurrences renvoyées. */
	limit: number;
	/** Nombre de jours explorés à partir de `from` (400 par défaut). */
	horizonDays?: number;
}

const CHUNK_DAYS = 56;

/**
 * Les prochaines séances qui ont lieu (statuts `scheduled` et `moved_here`), triées, jusqu'à `limit`,
 * en explorant l'horizon par tranches de huit semaines.
 */
export function nextOccurrences(input: NextOccurrencesInput): Occurrence[] {
	const horizonDays = input.horizonDays ?? MAX_RANGE_DAYS;
	if (!Number.isInteger(input.limit) || input.limit < 1) {
		throw new ValidationError([
			{ code: 'invalid_limit', path: 'limit', message: 'limit must be a positive integer' }
		]);
	}
	if (!Number.isInteger(horizonDays) || horizonDays < 1) {
		throw new ValidationError([
			{
				code: 'invalid_horizon',
				path: 'horizonDays',
				message: 'horizonDays must be a positive integer'
			}
		]);
	}
	const issues: ValidationIssue[] = [];
	const fromDateIssue = dateIssue(input.from, 'from');
	if (fromDateIssue) issues.push(fromDateIssue);
	if (input.fromTime !== undefined) {
		const fromTimeIssue = timeIssue(input.fromTime, 'fromTime');
		if (fromTimeIssue) issues.push(fromTimeIssue);
	}
	assertValid(issues);
	const fromDay = isoDateToDays(input.from);
	const lastDay = fromDay + horizonDays - 1;
	const fromMinutes = input.fromTime === undefined ? null : localTimeToMinutes(input.fromTime);
	const result: Occurrence[] = [];
	for (let chunkStart = fromDay; chunkStart <= lastDay && result.length < input.limit;) {
		const chunkEnd = Math.min(lastDay, chunkStart + CHUNK_DAYS - 1);
		const occurrences = expandOccurrences({
			schedules: input.schedules,
			exceptions: input.exceptions,
			pauses: input.pauses,
			prayerTimes: input.prayerTimes,
			range: { from: daysToIsoDate(chunkStart), to: daysToIsoDate(chunkEnd) }
		});
		for (const occurrence of occurrences) {
			if (occurrence.status !== 'scheduled' && occurrence.status !== 'moved_here') continue;
			if (
				fromMinutes !== null &&
				occurrence.date === input.from &&
				occurrence.start !== null &&
				occurrence.startDayOffset === 0 &&
				localTimeToMinutes(occurrence.start) < fromMinutes
			) {
				continue;
			}
			result.push(occurrence);
			if (result.length === input.limit) break;
		}
		chunkStart = chunkEnd + 1;
	}
	return result;
}

export interface OrphanException {
	exception: SessionException;
	reason: 'unknown_course' | 'not_an_occurrence';
}

/**
 * Exceptions dont la date n'est plus une séance du cours (après un changement de rythme ou de
 * bornes), ou dont le cours n'existe pas. Les pauses ne sont pas prises en compte.
 */
export function findOrphanExceptions(
	schedules: readonly CourseSchedule[],
	exceptions: readonly SessionException[]
): OrphanException[] {
	assertValid(validateInput({ schedules, exceptions }));
	const schedulesById = new Map(schedules.map((schedule) => [schedule.id, schedule]));
	const orphans: OrphanException[] = [];
	for (const exception of exceptions) {
		const schedule = schedulesById.get(exception.courseId);
		if (!schedule) {
			orphans.push({ exception, reason: 'unknown_course' });
		} else if (!isRuleDay(schedule, isoDateToDays(exception.date))) {
			orphans.push({ exception, reason: 'not_an_occurrence' });
		}
	}
	return orphans;
}

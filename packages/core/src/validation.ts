// Validation des entrées avec anomalies typées. Les fonctions `validate*` renvoient la liste des
// anomalies (vide si tout va bien) ; `assertValid` lève une ValidationError qui les porte.

import { isIsoDate, isLocalTime, isoDateToDays } from './dates.js';
import {
	PRAYERS,
	type CourseSchedule,
	type DateRange,
	type Pause,
	type SessionException
} from './types.js';

export const MAX_RANGE_DAYS = 400;
export const MIN_OFFSET_MINUTES = -120;
export const MAX_OFFSET_MINUTES = 240;
export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 1440;

export type ValidationCode =
	| 'invalid_date'
	| 'invalid_time'
	| 'invalid_kind'
	| 'id_empty'
	| 'id_duplicate'
	| 'invalid_sequence'
	| 'ends_before_starts'
	| 'weekdays_empty'
	| 'weekdays_duplicate'
	| 'invalid_weekday'
	| 'invalid_interval'
	| 'invalid_ordinal'
	| 'dates_empty'
	| 'dates_duplicate'
	| 'invalid_prayer'
	| 'offset_out_of_range'
	| 'duration_out_of_range'
	| 'exception_duplicate'
	| 'pause_inverted'
	| 'range_inverted'
	| 'range_too_long'
	| 'invalid_limit'
	| 'invalid_horizon'
	| 'invalid_time_zone'
	| 'invalid_uid';

export interface ValidationIssue {
	code: ValidationCode;
	/** Chemin de la valeur fautive, par exemple `schedule.recurrence.weekdays`. */
	path: string;
	message: string;
}

export class ValidationError extends Error {
	readonly issues: readonly ValidationIssue[];

	constructor(issues: readonly ValidationIssue[]) {
		super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '));
		this.name = 'ValidationError';
		this.issues = issues;
	}
}

function issue(code: ValidationCode, path: string, message: string): ValidationIssue {
	return { code, path, message };
}

function checkDate(value: unknown, path: string, issues: ValidationIssue[]): boolean {
	if (isIsoDate(value)) return true;
	issues.push(
		issue('invalid_date', path, `expected a valid ISO date (YYYY-MM-DD), got ${show(value)}`)
	);
	return false;
}

function checkTime(value: unknown, path: string, issues: ValidationIssue[]): boolean {
	if (isLocalTime(value)) return true;
	issues.push(issue('invalid_time', path, `expected a local time (HH:MM), got ${show(value)}`));
	return false;
}

function checkId(value: unknown, path: string, issues: ValidationIssue[]): boolean {
	if (typeof value === 'string' && value.length > 0) return true;
	issues.push(issue('id_empty', path, 'expected a non-empty string'));
	return false;
}

function isObject(value: unknown): boolean {
	return typeof value === 'object' && value !== null;
}

function isWeekday(value: unknown): boolean {
	return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 7;
}

function show(value: unknown): string {
	return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

/** Anomalie d'heure locale, ou null si la valeur est une heure « HH:MM » valide. */
export function timeIssue(value: unknown, path: string): ValidationIssue | null {
	return isLocalTime(value)
		? null
		: issue('invalid_time', path, `expected a local time (HH:MM), got ${show(value)}`);
}

/** Anomalie de date civile, ou null si la valeur est une date ISO valide. */
export function dateIssue(value: unknown, path: string): ValidationIssue | null {
	return isIsoDate(value)
		? null
		: issue('invalid_date', path, `expected a valid ISO date (YYYY-MM-DD), got ${show(value)}`);
}

export function validateSchedule(schedule: CourseSchedule, path = 'schedule'): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	checkId(schedule.id, `${path}.id`, issues);
	if (!Number.isInteger(schedule.sequence) || schedule.sequence < 0) {
		issues.push(issue('invalid_sequence', `${path}.sequence`, 'expected a non-negative integer'));
	}
	const startsOk = checkDate(schedule.startsOn, `${path}.startsOn`, issues);
	if (schedule.endsOn !== undefined) {
		const endsOk = checkDate(schedule.endsOn, `${path}.endsOn`, issues);
		if (startsOk && endsOk && schedule.endsOn < schedule.startsOn) {
			issues.push(issue('ends_before_starts', `${path}.endsOn`, 'endsOn is before startsOn'));
		}
	}
	validateRecurrence(schedule, `${path}.recurrence`, issues);
	validateTiming(schedule, `${path}.timing`, issues);
	return issues;
}

function validateRecurrence(
	schedule: CourseSchedule,
	path: string,
	issues: ValidationIssue[]
): void {
	const recurrence = schedule.recurrence;
	if (!isObject(recurrence)) {
		issues.push(
			issue('invalid_kind', `${path}.kind`, `unknown recurrence kind ${show(kindOf(recurrence))}`)
		);
		return;
	}
	switch (recurrence.kind) {
		case 'weekly': {
			const weekdays = Array.isArray(recurrence.weekdays)
				? // Array.from remplit les trous d'un tableau creux par undefined, que isWeekday rejette.
					Array.from(recurrence.weekdays)
				: recurrence.weekdays;
			if (!Array.isArray(weekdays) || weekdays.length === 0) {
				issues.push(issue('weekdays_empty', `${path}.weekdays`, 'expected at least one weekday'));
			} else {
				if (weekdays.some((weekday) => !isWeekday(weekday))) {
					issues.push(
						issue('invalid_weekday', `${path}.weekdays`, 'weekdays must be integers 1..7')
					);
				}
				if (new Set(weekdays).size !== weekdays.length) {
					issues.push(issue('weekdays_duplicate', `${path}.weekdays`, 'weekdays must be unique'));
				}
			}
			if (recurrence.interval !== 1 && recurrence.interval !== 2) {
				issues.push(issue('invalid_interval', `${path}.interval`, 'interval must be 1 or 2'));
			}
			checkDate(recurrence.anchorDate, `${path}.anchorDate`, issues);
			return;
		}
		case 'monthly': {
			if (!isWeekday(recurrence.weekday)) {
				issues.push(issue('invalid_weekday', `${path}.weekday`, 'weekday must be an integer 1..7'));
			}
			if (![1, 2, 3, 4, -1].includes(recurrence.ordinal)) {
				issues.push(
					issue('invalid_ordinal', `${path}.ordinal`, 'ordinal must be 1, 2, 3, 4 or -1')
				);
			}
			return;
		}
		case 'dates': {
			const dates = Array.isArray(recurrence.dates)
				? Array.from(recurrence.dates)
				: recurrence.dates;
			if (!Array.isArray(dates) || dates.length === 0) {
				issues.push(issue('dates_empty', `${path}.dates`, 'expected at least one date'));
				return;
			}
			dates.forEach((date, index) => checkDate(date, `${path}.dates[${index}]`, issues));
			if (new Set(dates).size !== dates.length) {
				issues.push(issue('dates_duplicate', `${path}.dates`, 'dates must be unique'));
			}
			return;
		}
		default:
			issues.push(
				issue('invalid_kind', `${path}.kind`, `unknown recurrence kind ${show(kindOf(recurrence))}`)
			);
	}
}

function validateTiming(schedule: CourseSchedule, path: string, issues: ValidationIssue[]): void {
	const timing = schedule.timing;
	if (!isObject(timing)) {
		issues.push(
			issue('invalid_kind', `${path}.kind`, `unknown timing kind ${show(kindOf(timing))}`)
		);
		return;
	}
	switch (timing.kind) {
		case 'fixed':
			checkTime(timing.start, `${path}.start`, issues);
			checkTime(timing.end, `${path}.end`, issues);
			return;
		case 'prayer':
			if (!PRAYERS.includes(timing.prayer)) {
				issues.push(
					issue('invalid_prayer', `${path}.prayer`, `unknown prayer ${show(timing.prayer)}`)
				);
			}
			if (
				!Number.isInteger(timing.offsetMinutes) ||
				timing.offsetMinutes < MIN_OFFSET_MINUTES ||
				timing.offsetMinutes > MAX_OFFSET_MINUTES
			) {
				issues.push(
					issue(
						'offset_out_of_range',
						`${path}.offsetMinutes`,
						`offsetMinutes must be an integer in ${MIN_OFFSET_MINUTES}..${MAX_OFFSET_MINUTES}`
					)
				);
			}
			if (
				!Number.isInteger(timing.durationMinutes) ||
				timing.durationMinutes < MIN_DURATION_MINUTES ||
				timing.durationMinutes > MAX_DURATION_MINUTES
			) {
				issues.push(
					issue(
						'duration_out_of_range',
						`${path}.durationMinutes`,
						`durationMinutes must be an integer in ${MIN_DURATION_MINUTES}..${MAX_DURATION_MINUTES}`
					)
				);
			}
			return;
		default:
			issues.push(
				issue('invalid_kind', `${path}.kind`, `unknown timing kind ${show(kindOf(timing))}`)
			);
	}
}

function kindOf(value: unknown): unknown {
	return typeof value === 'object' && value !== null ? (value as { kind?: unknown }).kind : value;
}

export function validateException(
	exception: SessionException,
	path = 'exception'
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	checkId(exception.courseId, `${path}.courseId`, issues);
	checkDate(exception.date, `${path}.date`, issues);
	switch (exception.kind) {
		case 'cancelled':
			return issues;
		case 'moved':
			checkDate(exception.toDate, `${path}.toDate`, issues);
			checkTime(exception.toStart, `${path}.toStart`, issues);
			return issues;
		default:
			issues.push(
				issue('invalid_kind', `${path}.kind`, `unknown exception kind ${show(kindOf(exception))}`)
			);
			return issues;
	}
}

export function validatePause(pause: Pause, path = 'pause'): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const fromOk = checkDate(pause.from, `${path}.from`, issues);
	const toOk = checkDate(pause.to, `${path}.to`, issues);
	if (fromOk && toOk && pause.to < pause.from) {
		issues.push(issue('pause_inverted', `${path}.to`, 'to is before from'));
	}
	if (pause.courseId !== undefined) checkId(pause.courseId, `${path}.courseId`, issues);
	return issues;
}

/** Plage inclusive : `from` <= `to` et au plus MAX_RANGE_DAYS jours. */
export function validateRange(range: DateRange, path = 'range'): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const fromOk = checkDate(range.from, `${path}.from`, issues);
	const toOk = checkDate(range.to, `${path}.to`, issues);
	if (!fromOk || !toOk) return issues;
	const length = isoDateToDays(range.to) - isoDateToDays(range.from) + 1;
	if (length < 1) {
		issues.push(issue('range_inverted', `${path}.to`, 'to is before from'));
	} else if (length > MAX_RANGE_DAYS) {
		issues.push(
			issue('range_too_long', path, `range covers ${length} days, maximum is ${MAX_RANGE_DAYS}`)
		);
	}
	return issues;
}

export interface ValidatableInput {
	schedules: readonly CourseSchedule[];
	exceptions?: readonly SessionException[];
	pauses?: readonly Pause[];
}

/** Valide chaque élément, puis les doublons entre éléments (identifiants de cours, exceptions). */
export function validateInput(input: ValidatableInput): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const ids = new Set<string>();
	input.schedules.forEach((schedule, index) => {
		issues.push(...validateSchedule(schedule, `schedules[${index}]`));
		if (ids.has(schedule.id)) {
			issues.push(
				issue('id_duplicate', `schedules[${index}].id`, `duplicate course id ${show(schedule.id)}`)
			);
		}
		ids.add(schedule.id);
	});
	const seen = new Set<string>();
	(input.exceptions ?? []).forEach((exception, index) => {
		issues.push(...validateException(exception, `exceptions[${index}]`));
		const key = `${exception.courseId}\u0000${exception.date}`;
		if (seen.has(key)) {
			issues.push(
				issue(
					'exception_duplicate',
					`exceptions[${index}]`,
					`several exceptions for course ${show(exception.courseId)} on ${exception.date}`
				)
			);
		}
		seen.add(key);
	});
	(input.pauses ?? []).forEach((pause, index) => {
		issues.push(...validatePause(pause, `pauses[${index}]`));
	});
	return issues;
}

export function assertValid(issues: readonly ValidationIssue[]): void {
	if (issues.length > 0) throw new ValidationError(issues);
}

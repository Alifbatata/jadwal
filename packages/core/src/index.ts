// Point d'entrée de @jadwal/core : types, validation, arithmétique des dates et expansion.
// Zéro dépendance à l'exécution. L'export agenda est dans @jadwal/core/ics.

export type {
	CourseSchedule,
	DateRange,
	IsoDate,
	LocalTime,
	Occurrence,
	OccurrenceStatus,
	Pause,
	Prayer,
	PrayerDay,
	PrayerTimesLookup,
	Recurrence,
	SessionException,
	Timing,
	Weekday
} from './types.js';
export { PRAYERS } from './types.js';

export type { CivilDate } from './dates.js';
export {
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
	weekdayFromDays
} from './dates.js';

export type { ValidatableInput, ValidationCode, ValidationIssue } from './validation.js';
export {
	MAX_DURATION_MINUTES,
	MAX_OFFSET_MINUTES,
	MAX_RANGE_DAYS,
	MIN_DURATION_MINUTES,
	MIN_OFFSET_MINUTES,
	ValidationError,
	assertValid,
	dateIssue,
	timeIssue,
	validateException,
	validateInput,
	validatePause,
	validateRange,
	validateSchedule
} from './validation.js';

export type { ExpandInput, NextOccurrencesInput, OrphanException } from './expand.js';
export {
	compareOccurrences,
	expandOccurrences,
	findOrphanExceptions,
	isRuleDay,
	nextOccurrences,
	ruleDays,
	sessionDurationMinutes
} from './expand.js';

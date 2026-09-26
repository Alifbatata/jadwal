// Le formulaire d'un cours, sans serveur : ce que le formulaire affiche, ce qu'il envoie, et le résumé
// de ce qui sera publié (étape 18, retours B4, C3 et A3).
//
// Le même code sert le rendu du serveur, sans JavaScript, et le navigateur, qui refait le résumé à
// chaque saisie : les deux disent donc la même chose, et un test peut le lire sans navigateur.
//
// Deux traductions entre la personne et la base passent par ici, et nulle part ailleurs :
//
// - l'horaire : la base garde un décalage signé, de −120 à 240 minutes, comme avant l'étape 18 ;
//   l'écran propose « après une prière » ou « avant une prière », avec des minutes toujours
//   positives. −10 en base s'ouvre sur « avant une prière » et 10 (retour C3) ;
// - les dates d'un cours à dates précises : la base les écrit `2026-10-12`, la personne les lit et
//   les écrit `12.10.2026` (retour A3).

import {
	isIsoDate,
	isLocalTime,
	MAX_DURATION_MINUTES,
	MAX_OFFSET_MINUTES,
	MIN_DURATION_MINUTES,
	MIN_OFFSET_MINUTES,
	type IsoDate
} from '@jadwal/core';
import {
	audienceLabel,
	describeRecurrence,
	describeTiming,
	joinList,
	languageLabel,
	shortDate
} from './format.js';
import { numericDate, t, type Langue } from './i18n.js';
import { courseFormTexts } from './i18n/course-form.js';
import { formattingTexts } from './i18n/formatting.js';

/**
 * Le nom d'une erreur du formulaire ; sa phrase, dans chaque langue, est dans `i18n/course-form.ts`.
 * `badDates`, `datesBeforeStart` et `datesAfterEnd` ont la leur à part, parce qu'elles recopient
 * les dates en cause et accordent leur nombre.
 */
export type CourseFormError =
	| keyof (typeof courseFormTexts)['fr']['errors']
	| 'badDates'
	| 'datesBeforeStart'
	| 'datesAfterEnd';

/** Les trois façons de donner l'heure d'un cours, dans la liste « Comment fixer l'heure ? ». */
export type TimingChoice = 'fixed' | 'prayer' | 'beforePrayer';

export const TIMING_CHOICES: readonly TimingChoice[] = ['fixed', 'prayer', 'beforePrayer'];

export function isTimingChoice(value: string): value is TimingChoice {
	return (TIMING_CHOICES as readonly string[]).includes(value);
}

/** Les champs du formulaire, tels qu'il les affiche et tels que la personne les saisit. */
export interface CourseFormValues {
	status: string;
	audience: string;
	teachingLanguages: string[];
	sourceLanguage: string;
	roomId: string | null;
	teacher: string | null;
	/** La valeur d'un champ de date du navigateur, `2026-09-07`, ou vide. */
	startsOn: string;
	endsOn: string | null;
	recurrenceKind: string;
	weekdays: number[];
	interval: number;
	monthlyWeekday: number;
	monthlyOrdinal: number;
	/** Les dates d'un cours à dates précises, telles que la personne les lit : `12.10.2026`. */
	dates: string;
	timingKind: TimingChoice;
	start: string;
	end: string;
	prayer: string;
	/** Toujours positives : le sens est dans `timingKind`. Nulles tant que le champ est vide. */
	offsetMinutes: number | null;
	durationMinutes: number | null;
	titles: Record<string, string>;
	descriptions: Record<string, string>;
}

/** Les minutes proposées quand un cours à heure fixe passe à une prière. */
const DEFAULT_MINUTES = 15;

/**
 * Le choix et les minutes positives qu'affiche le formulaire, à partir de ce que la base garde. Un
 * décalage nul reste « après une prière » : c'est « juste après », la phrase de la page publique.
 */
export function timingChoice(
	kind: string,
	offset: number | null | undefined
): { timingKind: TimingChoice; offsetMinutes: number } {
	if (kind !== 'prayer') return { timingKind: 'fixed', offsetMinutes: DEFAULT_MINUTES };
	const minutes = offset ?? 0;
	return minutes < 0
		? { timingKind: 'beforePrayer', offsetMinutes: -minutes }
		: { timingKind: 'prayer', offsetMinutes: minutes };
}

/** Le décalage que la base garde : négatif avant une prière. */
export function signedOffset(choice: TimingChoice, minutes: number): number {
	return choice === 'beforePrayer' ? -minutes : minutes;
}

/**
 * Les minutes admises pour chaque sens, en nombre entier : de 1 à 120 avant une prière, jamais zéro,
 * qui voudrait dire « après » ; de 0 à 240 après. Le serveur et le résumé jugent par cette fonction.
 */
export function minutesAllowed(choice: TimingChoice, value: number | null): value is number {
	if (value === null || !Number.isInteger(value)) return false;
	return choice === 'beforePrayer'
		? value >= 1 && value <= -MIN_OFFSET_MINUTES
		: value >= 0 && value <= MAX_OFFSET_MINUTES;
}

/** La durée d'un cours placé par rapport à une prière : de 5 à 1440 minutes, en nombre entier. */
export function durationAllowed(value: number | null): value is number {
	return (
		value !== null &&
		Number.isInteger(value) &&
		value >= MIN_DURATION_MINUTES &&
		value <= MAX_DURATION_MINUTES
	);
}

/** Les dates tapées dans le champ : une par ligne, ou séparées par des espaces, virgules, points-virgules. */
export function splitDates(text: string): string[] {
	return text.split(/[\s,;]+/).filter((value) => value.length > 0);
}

const SWISS_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

/**
 * Une date écrite comme en Suisse, `12.10.2026` ou `1.2.2026`, ou comme la base l'écrit, rendue
 * comme la base l'écrit ; `null` pour une date illisible ou qui n'existe pas, comme le 31.02.
 */
export function readDate(text: string): IsoDate | null {
	const value = text.trim();
	const swiss = SWISS_DATE.exec(value);
	const iso = swiss
		? `${swiss[3]}-${(swiss[2] ?? '').padStart(2, '0')}-${(swiss[1] ?? '').padStart(2, '0')}`
		: value;
	return isIsoDate(iso) ? iso : null;
}

/** Les dates de la base, telles que le champ les montre : `12.10.2026`, une par ligne. */
export function writeDates(dates: readonly string[]): string {
	return dates.map((date) => numericDate(date as IsoDate)).join('\n');
}

/**
 * Les dates d'un cours à dates précises, rangées par rapport à sa période. Le moteur ne publie que
 * celles du premier au dernier jour, les deux compris (`courseWindow`, packages/core/src/expand.ts) :
 * une date avant ou après ne donnerait aucune séance. Tant que le premier jour manque, ou que le
 * dernier vient avant lui, c'est la période qui est à corriger, et aucune date n'est jugée.
 */
export function splitByPeriod(
	dates: readonly IsoDate[],
	startsOn: string,
	endsOn: string | null
): { inside: IsoDate[]; before: IsoDate[]; after: IsoDate[] } {
	const end = endsOn && isIsoDate(endsOn) ? endsOn : null;
	if (!isIsoDate(startsOn) || (end !== null && end < startsOn)) {
		return { inside: [...dates], before: [], after: [] };
	}
	return {
		inside: dates.filter((date) => date >= startsOn && (end === null || date <= end)),
		before: dates.filter((date) => date < startsOn),
		after: end === null ? [] : dates.filter((date) => date > end)
	};
}

/** Une ligne du résumé. `typed` : une valeur saisie par l'organisation, isolée dans `<bdi>`. */
export interface SummaryRow {
	key: string;
	label: string;
	value: string;
	missing: boolean;
	typed: boolean;
}

/** Ce que le résumé doit savoir en plus des champs : les langues de l'organisation, ses salles. */
export interface SummaryContext {
	languages: readonly string[];
	rooms: readonly { id: string; name: string }[];
}

/**
 * Le résumé de ce qui sera publié, une ligne par information (retour B4) : le titre et la
 * description dans chaque langue remplie, celle de saisie d'abord, le public, les jours, la
 * fréquence, l'horaire, la salle, l'intervenant, la langue d'enseignement, le premier jour, le
 * dernier s'il y en a un, et l'état. Ce qui manque a sa ligne, marquée, avec une phrase qui le dit :
 * rien ne disparaît en silence. Ce que le serveur refuserait est marqué de même, « à corriger », au
 * lieu d'être montré comme publié.
 */
export function summarise(
	values: CourseFormValues,
	context: SummaryContext,
	language: Langue
): SummaryRow[] {
	const text = courseFormTexts[language];
	const rows: SummaryRow[] = [];
	const row = (key: string, label: string, value: string | null, missing: string, typed = false) =>
		rows.push(
			value
				? { key, label, value, missing: false, typed }
				: { key, label, value: missing, missing: true, typed: false }
		);

	// Le titre et la description de chaque langue, ensemble, comme dans l'onglet de la langue.
	const others = context.languages.filter((code) => code !== values.sourceLanguage);
	for (const code of [values.sourceLanguage, ...others]) {
		const name = languageLabel(code, language);
		const title = values.titles[code]?.trim() ?? '';
		const description = values.descriptions[code]?.trim() ?? '';
		const isSource = code === values.sourceLanguage;
		if (title || isSource) {
			row(`title-${code}`, text.summary.titleIn(name), title || null, text.missing.title, true);
		}
		// `parseCourseForm` ne garde une langue qu'avec son titre : une description seule n'est pas
		// publiée, et le résumé le dit. Dans la langue de saisie, le titre manquant est déjà signalé.
		if (description) {
			row(
				`description-${code}`,
				text.summary.descriptionIn(name),
				title || isSource ? description : null,
				text.missing.descriptionWithoutTitle(name),
				true
			);
		}
	}

	row('audience', text.summary.audience, audienceLabel(values.audience, language), '');

	if (values.recurrenceKind === 'dates') {
		const tokens = splitDates(values.dates);
		const read = tokens.map(readDate).filter((date) => date !== null);
		const readable = [...new Set(read)].sort();
		const twice = [...new Set(read.filter((date, index) => read.indexOf(date) !== index))].sort();
		const unreadable = tokens.filter((token) => readDate(token) === null);
		const list = (dates: readonly IsoDate[]) =>
			formattingTexts[language].dateList(dates.map((date) => shortDate(date, language)));
		// Seules les dates de la période sont publiées. Les autres, et celles que le serveur refuse,
		// ont leur ligne, marquée, dans l'ordre de ses erreurs.
		const { inside, before, after } = splitByPeriod(readable, values.startsOn, values.endsOn);
		row(
			'dates',
			text.summary.dates,
			inside.length > 0 ? list(inside) : null,
			readable.length > 0 ? text.missing.noDateInPeriod : text.missing.dates
		);
		if (unreadable.length > 0) {
			rows.push({
				key: 'badDates',
				label: text.summary.badDates,
				value: joinList(unreadable, language),
				missing: true,
				typed: true
			});
		}
		for (const [key, label, dates] of [
			['datesTwice', text.summary.datesTwice, twice],
			['datesBefore', text.summary.datesBefore, before],
			['datesAfter', text.summary.datesAfter, after]
		] as const) {
			if (dates.length > 0) {
				rows.push({ key, label, value: list(dates), missing: true, typed: false });
			}
		}
		row('frequency', text.summary.frequency, text.frequencies.dates, '');
	} else if (values.recurrenceKind === 'monthly') {
		const day = describeRecurrence(
			{ kind: 'monthly', ordinal: values.monthlyOrdinal, ordinalWeekday: values.monthlyWeekday },
			language
		);
		row('days', text.summary.days, day, text.missing.days);
		row('frequency', text.summary.frequency, text.frequencies.monthly, '');
	} else {
		const days = values.weekdays.map((day) => t(language).weekdays[day - 1] ?? '');
		row(
			'days',
			text.summary.days,
			days.length > 0 ? joinList(days, language) : null,
			text.missing.days
		);
		const frequency =
			values.interval === 2 ? text.frequencies.fortnightly : text.frequencies.weekly;
		row('frequency', text.summary.frequency, frequency, '');
	}

	const time = timeOf(values, language);
	row('time', text.summary.time, time.value, time.missing);

	const room = context.rooms.find((candidate) => candidate.id === values.roomId)?.name ?? null;
	row('room', text.summary.room, room, text.missing.room, true);
	row('teacher', text.summary.teacher, values.teacher?.trim() || null, text.missing.teacher, true);

	const taught = values.teachingLanguages.filter((code) => context.languages.includes(code));
	const taughtIn = taught.map((code) => languageLabel(code, language));
	row(
		'teachingLanguage',
		text.summary.teachingLanguage,
		taughtIn.length > 0 ? joinList(taughtIn, language) : null,
		text.missing.teachingLanguage
	);

	const startsOn = isIsoDate(values.startsOn) ? shortDate(values.startsOn, language) : null;
	row('startsOn', text.summary.startsOn, startsOn, text.missing.startsOn);
	if (values.endsOn && isIsoDate(values.endsOn)) {
		const beforeStart = isIsoDate(values.startsOn) && values.endsOn < values.startsOn;
		row(
			'endsOn',
			text.summary.endsOn,
			beforeStart ? null : shortDate(values.endsOn, language),
			text.missing.endsBeforeStarts
		);
	}

	const statuses: Record<string, string> = text.statuses;
	row('status', text.summary.status, statuses[values.status] ?? values.status, '');
	return rows;
}

/**
 * L'horaire tel que la liste des cours le dit, ou, à la place, la phrase de la ligne marquée : « à
 * indiquer » tant qu'une heure ou des minutes manquent, « à corriger » avec les bornes quand le
 * serveur refuserait les minutes ou la durée (« avant une prière » à zéro minute compris, qui
 * voudrait dire « après »).
 */
function timeOf(
	values: CourseFormValues,
	language: Langue
): { value: string | null; missing: string } {
	const missing = courseFormTexts[language].missing;
	const incomplete = { value: null, missing: missing.time };
	if (values.timingKind === 'fixed') {
		if (!isLocalTime(values.start) || !isLocalTime(values.end)) return incomplete;
		const fixed = { kind: 'fixed', start: values.start, end: values.end };
		return { value: describeTiming(fixed, language), missing: missing.time };
	}
	const minutes = values.offsetMinutes;
	const duration = values.durationMinutes;
	if (minutes === null || duration === null) return incomplete;
	if (!minutesAllowed(values.timingKind, minutes)) {
		const bounds =
			values.timingKind === 'beforePrayer' ? missing.minutesBefore : missing.minutesAfter;
		return { value: null, missing: bounds };
	}
	if (!durationAllowed(duration)) return { value: null, missing: missing.duration };
	const timing = {
		kind: 'prayer',
		prayer: values.prayer,
		offsetMinutes: signedOffset(values.timingKind, minutes),
		durationMinutes: duration
	};
	return { value: describeTiming(timing, language), missing: missing.time };
}

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
import { direction, isLangue, numericDate, t, type Langue } from './i18n.js';
import { courseFormTexts } from './i18n/course-form.js';
import { formattingTexts } from './i18n/formatting.js';

/**
 * Le nom d'une erreur du formulaire ; sa phrase, dans chaque langue, est dans `i18n/course-form.ts`.
 * `badDates`, `datesBeforeStart` et `datesAfterEnd` ont la leur à part, parce qu'elles recopient
 * les dates en cause et accordent leur nombre ; `descriptionWithoutTitle` aussi, avec une phrase par
 * langue en cause.
 */
export type CourseFormError =
	| keyof (typeof courseFormTexts)['fr']['errors']
	| 'badDates'
	| 'datesBeforeStart'
	| 'datesAfterEnd'
	| 'descriptionWithoutTitle';

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

/**
 * Les langues dont la description est écrite sans titre dans la même langue, dans l'ordre des
 * langues de l'organisation. Une langue n'est gardée qu'avec son titre (`parseCourseForm`) : plutôt
 * que de perdre la description sans rien dire, le serveur refuse le formulaire tant qu'il en reste
 * une, et le résumé la marque. Le serveur et le résumé jugent par cette fonction. La langue de saisie
 * n'y figure jamais : son titre manquant est déjà une erreur.
 */
export function descriptionsWithoutTitle(
	values: Pick<CourseFormValues, 'sourceLanguage' | 'titles' | 'descriptions'>,
	languages: readonly string[]
): string[] {
	return languages.filter(
		(code) =>
			code !== values.sourceLanguage &&
			(values.descriptions[code]?.trim() ?? '') !== '' &&
			(values.titles[code]?.trim() ?? '') === ''
	);
}

/** Les dates tapées dans le champ : une par ligne, ou séparées par des espaces, virgules, points-virgules. */
export function splitDates(text: string): string[] {
	return text.split(/[\s,;]+/).filter((value) => value.length > 0);
}

const SWISS_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

/**
 * Les dates qu'un formulaire de cours accepte, la première et la dernière comprises : celles de
 * `$lib/server/dates.ts`, du 01.01.1970 au 31.12.2100, que la page reçoit du serveur. Ce module
 * sert aussi le navigateur, qui ne peut pas importer un module du serveur (étape 19, lot 2).
 */
export interface DateRange {
	first: IsoDate;
	last: IsoDate;
}

/** Une date `AAAA-MM-JJ` qui existe, entre les deux bornes. */
export function inRange(value: string | null | undefined, range: DateRange): value is IsoDate {
	return isIsoDate(value) && value >= range.first && value <= range.last;
}

/**
 * Une date écrite comme en Suisse, `12.10.2026` ou `1.2.2026`, ou comme la base l'écrit, rendue
 * comme la base l'écrit ; `null` pour une date illisible, qui n'existe pas, comme le 31.02, ou hors
 * des bornes : le 01.01.0000, que PostgreSQL n'a pas, ou le 31.12.9999, qui faisait tomber le flux
 * agenda.
 */
export function readDate(text: string, range: DateRange): IsoDate | null {
	const value = text.trim();
	const swiss = SWISS_DATE.exec(value);
	const iso = swiss
		? `${swiss[3]}-${(swiss[2] ?? '').padStart(2, '0')}-${(swiss[1] ?? '').padStart(2, '0')}`
		: value;
	return inRange(iso, range) ? iso : null;
}

/** Les dates de la base, telles que le champ les montre : `12.10.2026`, une par ligne. */
export function writeDates(dates: readonly string[]): string {
	return dates.map((date) => numericDate(date as IsoDate)).join('\n');
}

/**
 * Les dates d'un cours à dates précises, rangées par rapport à sa période. Le moteur ne publie que
 * celles du premier au dernier jour, les deux compris (`courseWindow`, packages/core/src/expand.ts) :
 * une date avant ou après ne donnerait aucune séance. Tant que le premier jour manque, que le
 * dernier est illisible ou hors des bornes, ou qu'il vient avant le premier, c'est la période qui
 * est à corriger, et aucune date n'est jugée.
 */
export function splitByPeriod(
	dates: readonly IsoDate[],
	startsOn: string,
	endsOn: string | null,
	range: DateRange
): { inside: IsoDate[]; before: IsoDate[]; after: IsoDate[] } {
	const end = endsOn && inRange(endsOn, range) ? endsOn : null;
	if (!inRange(startsOn, range) || (endsOn && end === null) || (end !== null && end < startsOn)) {
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
	/** La langue d'un titre ou d'une description, qui n'est pas forcément celle de l'écran. */
	lang?: string;
}

/**
 * Le sens d'écriture d'une langue de l'organisation, pour un texte saisi dans cette langue : l'arabe
 * de droite à gauche, les autres de gauche à droite, quelle que soit la langue de l'écran.
 */
export function textDirection(code: string): 'ltr' | 'rtl' {
	return isLangue(code) ? direction(code) : 'ltr';
}

/**
 * Ce que le résumé doit savoir en plus des champs : les langues de l'organisation, ses salles, et
 * les dates que le serveur accepte.
 */
export interface SummaryContext {
	languages: readonly string[];
	rooms: readonly { id: string; name: string }[];
	dateRange: DateRange;
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
	// Une phrase qui dit un manque est dans la langue de l'écran : seule une valeur saisie garde la
	// langue de son texte.
	const row = (
		key: string,
		label: string,
		value: string | null,
		missing: string,
		typed = false,
		lang?: string
	) =>
		rows.push(
			value
				? { key, label, value, missing: false, typed, ...(lang ? { lang } : {}) }
				: { key, label, value: missing, missing: true, typed: false }
		);

	// Le titre et la description de chaque langue, ensemble, comme dans l'onglet de la langue.
	const others = context.languages.filter((code) => code !== values.sourceLanguage);
	const untitled = descriptionsWithoutTitle(values, context.languages);
	for (const code of [values.sourceLanguage, ...others]) {
		const name = languageLabel(code, language);
		const title = values.titles[code]?.trim() ?? '';
		const description = values.descriptions[code]?.trim() ?? '';
		const isSource = code === values.sourceLanguage;
		if (title || isSource) {
			const label = text.summary.titleIn(name);
			row(`title-${code}`, label, title || null, text.missing.title, true, code);
		}
		// Une description seule, sans le titre de sa langue, est refusée par le serveur : sa ligne est
		// « à corriger ». Dans la langue de saisie, le titre manquant est déjà signalé.
		if (description) {
			row(
				`description-${code}`,
				text.summary.descriptionIn(name),
				untitled.includes(code) ? null : description,
				text.missing.descriptionWithoutTitle(name),
				true,
				code
			);
		}
	}

	row('audience', text.summary.audience, audienceLabel(values.audience, language), '');

	if (values.recurrenceKind === 'dates') {
		const tokens = splitDates(values.dates);
		const read = tokens
			.map((token) => readDate(token, context.dateRange))
			.filter((date) => date !== null);
		const readable = [...new Set(read)].sort();
		const twice = [...new Set(read.filter((date, index) => read.indexOf(date) !== index))].sort();
		const unreadable = tokens.filter((token) => readDate(token, context.dateRange) === null);
		const list = (dates: readonly IsoDate[]) =>
			formattingTexts[language].dateList(dates.map((date) => shortDate(date, language)));
		// Seules les dates de la période sont publiées. Les autres, et celles que le serveur refuse,
		// ont leur ligne, marquée, dans l'ordre de ses erreurs.
		const { inside, before, after } = splitByPeriod(
			readable,
			values.startsOn,
			values.endsOn,
			context.dateRange
		);
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

	// Une date hors des bornes est refusée par le serveur, comme une date illisible : le premier jour
	// est « pas choisi », le dernier « à corriger ».
	const range = context.dateRange;
	const startsOn = inRange(values.startsOn, range) ? shortDate(values.startsOn, language) : null;
	row('startsOn', text.summary.startsOn, startsOn, text.missing.startsOn);
	if (values.endsOn) {
		const endsOn = inRange(values.endsOn, range) ? values.endsOn : null;
		const beforeStart =
			endsOn !== null && inRange(values.startsOn, range) && endsOn < values.startsOn;
		row(
			'endsOn',
			text.summary.endsOn,
			endsOn !== null && !beforeStart ? shortDate(endsOn, language) : null,
			endsOn !== null ? text.missing.endsBeforeStarts : text.missing.endsOnUnreadable
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

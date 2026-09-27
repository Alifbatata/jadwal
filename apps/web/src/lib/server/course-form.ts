// Lire le formulaire d'un cours : ce que la personne a saisi, vérifié champ par champ, puis confié à
// `parseCourseForm` (étape 18, retours C3, B1 et A3).
//
// Ce module dit **quel champ** corriger, par un nom d'erreur que la page écrit dans sa langue ; les
// phrases de `courses.ts`, en français et sans le champ, ne remontent plus jusqu'à l'écran. Il fait
// aussi les deux traductions du formulaire vers le modèle (voir `../course-form.ts`) : les minutes
// positives, avant ou après une prière, deviennent le décalage signé que la base connaît déjà, et
// les dates `12.10.2026` deviennent `2026-10-12`.
//
// `parseCourseForm`, `@jadwal/core` et la base restent juges, dans cet ordre. Ce qu'ils refusent
// encore après ces vérifications est une valeur que le formulaire ne peut pas envoyer (une langue qui
// n'est pas activée, un public ou une prière qui n'existe pas) : la page le dit sans détail.
//
// Étape 19, lot 2 : ce qui atteignait encore la base et revenait en erreur 500 est arrêté ici, comme
// sur « À venir » et le vendredi au lot 1. Une date s'accepte de 1970 à 2100 (`dates.ts`) : l'an
// 0000, que PostgreSQL n'a pas, et un dernier jour au 31.12.9999, qui faisait tomber le flux agenda
// de toute l'organisation. Le caractère nul est retiré de chaque champ. Une salle qui n'est pas, ou
// plus, une salle de l'organisation est refusée, avec sa phrase.

import { isLocalTime, type IsoDate } from '@jadwal/core';
import {
	descriptionsWithoutTitle,
	durationAllowed,
	firstDate,
	isTimingChoice,
	minutesAllowed,
	readDate,
	signedOffset,
	splitByPeriod,
	splitDates,
	type CourseFormError,
	type CourseFormValues,
	type DateRange
} from '../course-form.js';
import { parseCourseForm, type CourseValues } from './courses.js';
import { FIRST_SUPPORTED_DATE, isSupportedDate, LAST_SUPPORTED_DATE } from './dates.js';

/** Les dates que le service accepte, pour lire celles d'un cours à dates précises. */
const SUPPORTED: DateRange = { first: FIRST_SUPPORTED_DATE, last: LAST_SUPPORTED_DATE };

export type ReadCourseForm =
	| { ok: true; values: CourseValues }
	| {
			ok: false;
			errors: CourseFormError[];
			/**
			 * Les dates illisibles, telles que la personne les a écrites. `errors` porte alors
			 * `badDates`, à la place des dates dans l'ordre du formulaire.
			 */
			badDates: string[];
			/**
			 * Les dates qu'aucune séance ne suivrait, parce qu'elles tombent avant le premier jour ou
			 * après le dernier. `errors` porte alors `datesBeforeStart` ou `datesAfterEnd`.
			 */
			datesBefore: IsoDate[];
			datesAfter: IsoDate[];
			/**
			 * Les langues dont la description est écrite sans titre dans la même langue. `errors`
			 * porte alors `descriptionWithoutTitle`, et la page écrit une phrase par langue.
			 */
			untitledDescriptions: string[];
			/** Ce que la personne a envoyé, pour le lui remontrer avec le résumé qui va avec. */
			values: CourseFormValues;
	  };

/** Des minutes en chiffres, sans signe ni virgule : ce que le formulaire demande. */
const WHOLE = /^\d{1,4}$/;

function text(form: FormData, name: string): string {
	return String(form.get(name) ?? '').trim();
}

/**
 * Le formulaire, sans le caractère nul (U+0000) : aucun clavier ne le tape, mais un formulaire écrit
 * à la main peut l'envoyer, et PostgreSQL le refuse dans un texte, ce qui donnait une erreur 500. Le
 * reste du champ est gardé, comme dans le formulaire d'une session du vendredi.
 */
function withoutNull(form: FormData): FormData {
	const clean = new FormData();
	for (const [name, value] of form) {
		clean.append(name, typeof value === 'string' ? value.replaceAll('\u0000', '') : value);
	}
	return clean;
}

function minutes(form: FormData, name: string): number | null {
	const value = text(form, name);
	return WHOLE.test(value) ? Number(value) : null;
}

function oneOf(value: string, allowed: readonly number[], fallback: number): number {
	const number = Number(value);
	return allowed.includes(number) ? number : fallback;
}

/** Ce que la personne a envoyé, champ par champ, sans rien corriger. */
function sentValues(form: FormData, languages: readonly string[]): CourseFormValues {
	const kind = text(form, 'recurrenceKind');
	const timing = text(form, 'timingKind');
	return {
		status: text(form, 'status') === 'published' ? 'published' : 'draft',
		audience: text(form, 'audience') || 'open',
		teachingLanguages: form
			.getAll('teachingLanguages')
			.map(String)
			.filter((code) => languages.includes(code)),
		sourceLanguage: text(form, 'sourceLanguage') || (languages[0] ?? 'fr'),
		roomId: text(form, 'roomId') || null,
		teacher: text(form, 'teacher') || null,
		startsOn: text(form, 'startsOn'),
		startsOnFromDates: text(form, 'startsOnFromDates'),
		endsOn: text(form, 'endsOn') || null,
		recurrenceKind: ['weekly', 'monthly', 'dates'].includes(kind) ? kind : 'weekly',
		weekdays: [...new Set(form.getAll('weekdays').map(Number))]
			.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
			.sort((a, b) => a - b),
		interval: text(form, 'interval') === '2' ? 2 : 1,
		monthlyWeekday: oneOf(text(form, 'monthlyWeekday'), [1, 2, 3, 4, 5, 6, 7], 1),
		monthlyOrdinal: oneOf(text(form, 'monthlyOrdinal'), [1, 2, 3, 4, -1], 1),
		dates: String(form.get('dates') ?? ''),
		timingKind: isTimingChoice(timing) ? timing : 'fixed',
		start: text(form, 'start'),
		end: text(form, 'end'),
		prayer: text(form, 'prayer') || 'maghrib',
		offsetMinutes: minutes(form, 'offsetMinutes'),
		durationMinutes: minutes(form, 'durationMinutes'),
		titles: Object.fromEntries(languages.map((code) => [code, text(form, `title.${code}`)])),
		descriptions: Object.fromEntries(
			languages.map((code) => [code, String(form.get(`description.${code}`) ?? '')])
		)
	};
}

/**
 * Lit le formulaire d'un cours. Rend soit les valeurs que `insertCourse` et `updateCourse`
 * écrivent, soit les erreurs dans l'ordre des cadres du formulaire, de haut en bas (le texte, la
 * langue d'enseignement, les jours, l'horaire, la salle, la période), avec ce qui a été envoyé.
 * `rooms` : les identifiants des salles de l'organisation.
 */
export function readCourseForm(
	sent: FormData,
	languages: readonly string[],
	rooms: readonly string[]
): ReadCourseForm {
	const form = withoutNull(sent);
	const values = sentValues(form, languages);
	const errors: CourseFormError[] = [];
	const badDates: string[] = [];
	const datesBefore: IsoDate[] = [];
	const datesAfter: IsoDate[] = [];
	const untitledDescriptions: string[] = [];
	const refuse = () => ({
		ok: false as const,
		errors: ['refused' as const],
		badDates,
		datesBefore,
		datesAfter,
		untitledDescriptions,
		values
	});

	// Un cours à dates précises dont le premier jour n'est pas choisi prend sa première date, comme le
	// formulaire le fait pendant la saisie avec JavaScript (étape 19, lot 2). Pas choisi : arrivé
	// vide, ou tel que le service l'avait pris, que le champ caché `startsOnFromDates` renvoie. Après
	// un refus, le champ revient rempli, et passait pour choisi : une coquille corrigée dans la date
	// la plus ancienne faisait refuser le cours (relecture du lot 2). Un premier jour choisi n'est
	// jamais remplacé : des dates avant lui restent refusées, et nommées.
	const notChosen = values.startsOn === '' || values.startsOn === values.startsOnFromDates;
	if (values.recurrenceKind === 'dates' && notChosen) {
		values.startsOn = firstDate(values.dates, SUPPORTED) ?? '';
	}
	values.startsOnFromDates = notChosen ? values.startsOn : '';

	if (!languages.includes(values.sourceLanguage)) return refuse();
	if (!values.titles[values.sourceLanguage]) errors.push('titleMissing');
	// Une description sans le titre de sa langue serait perdue à l'enregistrement (`parseCourseForm`
	// ne garde une langue qu'avec son titre) : le cours ne s'enregistre pas, et la page nomme la langue.
	untitledDescriptions.push(...descriptionsWithoutTitle(values, languages));
	if (untitledDescriptions.length > 0) errors.push('descriptionWithoutTitle');
	// Aucune langue cochée : le résumé dit « pas choisie », et le cours ne s'enregistre pas avec une
	// langue que personne n'a choisie (`parseCourseForm` prendrait la langue de saisie sans le dire).
	if (values.teachingLanguages.length === 0) errors.push('teachingMissing');

	const isoDates: IsoDate[] = [];
	if (values.recurrenceKind === 'weekly' && values.weekdays.length === 0) {
		errors.push('weekdaysMissing');
	}
	if (values.recurrenceKind === 'dates') {
		const tokens = splitDates(values.dates);
		for (const token of tokens) {
			const date = readDate(token, SUPPORTED);
			if (date) isoDates.push(date);
			else badDates.push(token);
		}
		if (tokens.length === 0) errors.push('datesMissing');
		if (badDates.length > 0) errors.push('badDates');
		if (new Set(isoDates).size !== isoDates.length) errors.push('datesTwice');
		// Une date hors de la période ne donnerait aucune séance : le moteur l'écarterait sans rien
		// dire. Le cours ne s'enregistre pas tant qu'elle y est, et la page la nomme.
		const { before, after } = splitByPeriod(
			[...new Set(isoDates)].sort(),
			values.startsOn,
			values.endsOn,
			SUPPORTED
		);
		datesBefore.push(...before);
		datesAfter.push(...after);
		if (before.length > 0) errors.push('datesBeforeStart');
		if (after.length > 0) errors.push('datesAfterEnd');
	}

	const choice = values.timingKind;
	if (choice === 'fixed') {
		if (!isLocalTime(values.start) || !isLocalTime(values.end)) errors.push('timeMissing');
	} else {
		if (!minutesAllowed(choice, values.offsetMinutes)) {
			errors.push(choice === 'beforePrayer' ? 'minutesBefore' : 'minutesAfter');
		}
		if (!durationAllowed(values.durationMinutes)) errors.push('duration');
	}

	// La salle ouvre le dernier cadre. Une salle supprimée entre-temps, un identifiant mal formé ou
	// celui d'une salle d'une autre organisation atteignait la base, qui répondait par une erreur 500.
	if (values.roomId !== null && !rooms.includes(values.roomId)) errors.push('roomGone');

	// La période ferme le dernier cadre : ses erreurs viennent en dernier. Une date hors de 1970 à
	// 2100 se lit comme une date illisible (`isSupportedDate`).
	if (!isSupportedDate(values.startsOn)) errors.push('startsOnMissing');
	if (values.endsOn !== null && !isSupportedDate(values.endsOn)) errors.push('endsOnUnreadable');
	else if (
		values.endsOn !== null &&
		isSupportedDate(values.startsOn) &&
		values.endsOn < values.startsOn
	) {
		errors.push('endsBeforeStarts');
	}

	if (errors.length > 0) {
		return { ok: false, errors, badDates, datesBefore, datesAfter, untitledDescriptions, values };
	}

	// Ce que `parseCourseForm` lit : le décalage signé, les dates comme la base les écrit, dans l'ordre
	// du calendrier et non dans celui de la saisie, et le premier jour, pris à la première date s'il
	// est arrivé vide.
	const normalised = new FormData();
	for (const [name, value] of form) normalised.append(name, value);
	normalised.set('timingKind', choice === 'fixed' ? 'fixed' : 'prayer');
	if (choice !== 'fixed') {
		normalised.set('offsetMinutes', String(signedOffset(choice, values.offsetMinutes ?? 0)));
	}
	if (values.recurrenceKind === 'dates') normalised.set('dates', [...isoDates].sort().join('\n'));
	normalised.set('startsOn', values.startsOn);

	const parsed = parseCourseForm(normalised, languages);
	return parsed.ok ? { ok: true, values: parsed.values } : refuse();
}

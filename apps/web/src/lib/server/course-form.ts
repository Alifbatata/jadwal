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

import { isIsoDate, isLocalTime, type IsoDate } from '@jadwal/core';
import {
	durationAllowed,
	isTimingChoice,
	minutesAllowed,
	readDate,
	signedOffset,
	splitByPeriod,
	splitDates,
	type CourseFormError,
	type CourseFormValues
} from '../course-form.js';
import { parseCourseForm, type CourseValues } from './courses.js';

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
			/** Ce que la personne a envoyé, pour le lui remontrer avec le résumé qui va avec. */
			values: CourseFormValues;
	  };

/** Des minutes en chiffres, sans signe ni virgule : ce que le formulaire demande. */
const WHOLE = /^\d{1,4}$/;

function text(form: FormData, name: string): string {
	return String(form.get(name) ?? '').trim();
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
 * langue d'enseignement, les jours, l'horaire, la période), avec ce qui a été envoyé.
 */
export function readCourseForm(form: FormData, languages: readonly string[]): ReadCourseForm {
	const values = sentValues(form, languages);
	const errors: CourseFormError[] = [];
	const badDates: string[] = [];
	const datesBefore: IsoDate[] = [];
	const datesAfter: IsoDate[] = [];
	const refuse = () => ({
		ok: false as const,
		errors: ['refused' as const],
		badDates,
		datesBefore,
		datesAfter,
		values
	});

	if (!languages.includes(values.sourceLanguage)) return refuse();
	if (!values.titles[values.sourceLanguage]) errors.push('titleMissing');
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
			const date = readDate(token);
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
			values.endsOn
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

	// La période est le dernier cadre du formulaire : ses erreurs viennent en dernier.
	if (!isIsoDate(values.startsOn)) errors.push('startsOnMissing');
	else if (values.endsOn && isIsoDate(values.endsOn) && values.endsOn < values.startsOn) {
		errors.push('endsBeforeStarts');
	}

	if (errors.length > 0) return { ok: false, errors, badDates, datesBefore, datesAfter, values };

	// Ce que `parseCourseForm` lit : le décalage signé, les dates comme la base les écrit.
	const normalised = new FormData();
	for (const [name, value] of form) normalised.append(name, value);
	normalised.set('timingKind', choice === 'fixed' ? 'fixed' : 'prayer');
	if (choice !== 'fixed') {
		normalised.set('offsetMinutes', String(signedOffset(choice, values.offsetMinutes ?? 0)));
	}
	if (values.recurrenceKind === 'dates') normalised.set('dates', isoDates.join('\n'));

	const parsed = parseCourseForm(normalised, languages);
	return parsed.ok ? { ok: true, values: parsed.values } : refuse();
}

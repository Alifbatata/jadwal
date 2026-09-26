// Le formulaire d'une session du vendredi : le lire, le vérifier, en faire un cours d'un autre type
// (ADR 0033), prêt pour `insertCourse` et `updateCourse`.
//
// Depuis l'étape 18, il rend le nom de chaque erreur, jamais sa phrase : l'écran l'écrit dans la
// langue de la personne (`$lib/i18n/friday.ts`). Il remplace `parseJumuaForm` de
// `$lib/server/courses.ts`, qui rendait des phrases en français ; les vérifications sont les mêmes,
// dans le même ordre.
//
// Ce que le formulaire ne demande pas ne se lit pas : le jour est le vendredi, le rythme chaque
// semaine, le public tout le monde.

import type { IsoDate, LocalTime } from '@jadwal/core';
import { isLangue, t } from '$lib/i18n.js';
import type { FridayError } from '$lib/i18n/friday.js';
import type { CourseValues } from '$lib/server/courses.js';

/** Les deux formes que le formulaire accepte : celles d'un champ de date et d'heure du navigateur. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^\d{2}:\d{2}$/;
const TITRE_MAXIMAL = 120;

export type FridayFormResult =
	{ ok: true; values: CourseValues } | { ok: false; errors: FridayError[] };

function text(form: FormData, name: string): string {
	return String(form.get(name) ?? '').trim();
}

function optional(form: FormData, name: string): string | null {
	const value = text(form, name);
	return value.length > 0 ? value : null;
}

/**
 * Lit une session. La langue dans laquelle elle est écrite est la première que l'organisation
 * publie ; un titre laissé vide prend le nom de la prière dans cette langue.
 */
export function parseFridayForm(
	form: FormData,
	enabledLanguages: readonly string[]
): FridayFormResult {
	const errors: FridayError[] = [];
	const sourceLanguage = enabledLanguages[0] ?? 'fr';
	const title = text(form, 'title') || t(isLangue(sourceLanguage) ? sourceLanguage : 'fr').jumua;
	if (title.length > TITRE_MAXIMAL) errors.push('titleTooLong');

	const order = Number(text(form, 'jumuaOrder'));
	if (!Number.isInteger(order) || order < 1 || order > 3) errors.push('orderInvalid');

	const start = text(form, 'start');
	const end = text(form, 'end');
	if (!HEURE.test(start) || !HEURE.test(end)) errors.push('timesMissing');
	else if (end <= start) errors.push('endBeforeStart');

	const sermon = form
		.getAll('sermonLanguages')
		.map(String)
		.filter((language) => enabledLanguages.includes(language));
	if (sermon.length === 0) errors.push('sermonLanguageMissing');

	const startsOn = text(form, 'startsOn');
	if (!DATE.test(startsOn)) errors.push('startDateMissing');
	const endsOn = text(form, 'endsOn');
	if (endsOn !== '' && !DATE.test(endsOn)) errors.push('endDateUnreadable');
	if (DATE.test(startsOn) && DATE.test(endsOn) && endsOn < startsOn) {
		errors.push('endDateBeforeStart');
	}

	if (errors.length > 0) return { ok: false, errors };

	const description = optional(form, 'description');
	return {
		ok: true,
		values: {
			kind: 'jumua',
			jumuaOrder: order,
			title,
			description,
			audience: 'open',
			teachingLanguages: sermon,
			sourceLanguage,
			roomId: optional(form, 'roomId'),
			teacher: optional(form, 'teacher'),
			status: text(form, 'status') === 'published' ? 'published' : 'draft',
			startsOn: startsOn as IsoDate,
			endsOn: endsOn === '' ? null : (endsOn as IsoDate),
			// Le vendredi, chaque semaine : jamais autre chose.
			recurrence: { kind: 'weekly', weekdays: [5], interval: 1, anchorDate: startsOn as IsoDate },
			timing: { kind: 'fixed', start: start as LocalTime, end: end as LocalTime },
			translations: new Map([[sourceLanguage, { title, description }]])
		}
	};
}

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
 * Lit une session. Elle s'écrit dans la langue de l'organisation (`default_language`), celle que
 * l'écran Partager met en tête, et non dans la première qu'elle publie : Réglages enregistre les
 * langues dans l'ordre fr, de, it, en, ar, et une organisation de langue allemande qui publie aussi
 * le français se voyait proposer « Prière du vendredi ». Un titre laissé vide prend le nom de la
 * prière dans cette langue.
 */
export function parseFridayForm(
	form: FormData,
	enabledLanguages: readonly string[],
	organisationLanguage: string
): FridayFormResult {
	const errors: FridayError[] = [];
	const sourceLanguage = organisationLanguage;
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

/** Ce que la personne a saisi dans un formulaire refusé, pour le lui remettre sous les yeux. */
export interface FridayFormEntry {
	title: string;
	jumuaOrder: number;
	start: string;
	end: string;
	roomId: string;
	sermonLanguages: string[];
	teacher: string;
	startsOn: string;
	endsOn: string;
	description: string;
}

/** La saisie d'un formulaire, telle quelle : rien n'est vérifié, elle ne sert qu'à être réaffichée. */
export function readFridayEntry(form: FormData): FridayFormEntry {
	return {
		title: text(form, 'title'),
		jumuaOrder: Number(text(form, 'jumuaOrder')),
		start: text(form, 'start'),
		end: text(form, 'end'),
		roomId: text(form, 'roomId'),
		sermonLanguages: form.getAll('sermonLanguages').map(String),
		teacher: text(form, 'teacher'),
		startsOn: text(form, 'startsOn'),
		endsOn: text(form, 'endsOn'),
		description: text(form, 'description')
	};
}

/**
 * Le rang proposé à l'ajout : le premier qu'aucune session sans date de fin n'occupe. Une session
 * qui a une date de fin s'en va, au changement de saison, et celle qui la remplace reprend son
 * rang. `null` quand les trois sont pris : l'écran ne propose alors pas d'ajouter une session.
 */
export function proposedOrder(
	sessions: readonly { jumuaOrder: number; endsOn: string | null }[]
): number | null {
	const taken = new Set(
		sessions.filter((session) => session.endsOn === null).map((session) => session.jumuaOrder)
	);
	return [1, 2, 3].find((order) => !taken.has(order)) ?? null;
}

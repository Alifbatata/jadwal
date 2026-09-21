// La forme des réponses publiques : c'est un contrat (ADR 0026, `docs/API.md`).
//
// Les noms de champs sont en anglais, comme le reste du code ; les documents qui les décrivent sont
// en français. Ce fichier est le seul endroit où une ligne de base devient une réponse : ajouter un
// champ ailleurs serait le glisser dans le contrat sans l'y écrire.
//
// Ce qui ne sort jamais : une adresse, un identifiant de personne, un identifiant de salle, le
// plan, l'état de l'organisation, un journal, un réglage interne. `tests/api.test.ts` parcourt
// chaque réponse et échoue à la moindre de ces valeurs.

import { nextOccurrences, type CourseSchedule, type IsoDate } from '@jadwal/core';
import { toSchedule, type CourseRow, type PauseRow } from './programme.js';
import type { Langue, OrganisationPublique, SeancePublique } from './public.js';

/** Le rythme d'un cours, tel que la réponse le nomme. */
export type Rythme = 'weekly' | 'fortnightly' | 'monthly' | 'dates';

export function rythmeOf(course: CourseRow): Rythme {
	if (course.recurrence_kind === 'weekly') {
		return course.recurrence_interval === 2 ? 'fortnightly' : 'weekly';
	}
	return course.recurrence_kind === 'monthly' ? 'monthly' : 'dates';
}

/** L'ordre dans lequel les groupes sortent, et dans lequel la vue Tous les cours les affiche. */
export const RYTHMES: readonly Rythme[] = ['weekly', 'fortnightly', 'monthly', 'dates'];

function recurrenceOf(course: CourseRow) {
	if (course.recurrence_kind === 'weekly') {
		return {
			kind: 'weekly' as const,
			weekdays: course.recurrence_weekday ?? [],
			interval: course.recurrence_interval ?? 1
		};
	}
	if (course.recurrence_kind === 'monthly') {
		return {
			kind: 'monthly' as const,
			weekday: course.recurrence_ordinal_weekday ?? 1,
			ordinal: course.recurrence_ordinal ?? 1
		};
	}
	return {
		kind: 'dates' as const,
		dates: (course.recurrence_dates ?? []).map((date) => String(date).slice(0, 10))
	};
}

function timingOf(course: CourseRow) {
	if (course.timing_kind === 'fixed') {
		return {
			kind: 'fixed' as const,
			start: String(course.timing_start).slice(0, 5),
			end: String(course.timing_end).slice(0, 5)
		};
	}
	return {
		kind: 'prayer' as const,
		prayer: course.timing_prayer,
		offsetMinutes: course.timing_offset_minutes,
		durationMinutes: course.timing_duration_minutes
	};
}

/** L'organisation, réduite à ce qu'une page publique a besoin de savoir. */
export function organizationOf(organisation: OrganisationPublique) {
	return {
		slug: organisation.slug,
		name: organisation.name,
		timeZone: organisation.time_zone
	};
}

export function settingsOf(organisation: OrganisationPublique, rooms: readonly { name: string }[]) {
	return {
		organization: {
			...organizationOf(organisation),
			accentColor: organisation.accent_color,
			languages: organisation.enabled_language,
			defaultLanguage: organisation.default_language,
			// Les salles sortent par leur nom seul : leur identifiant interne n'est nécessaire à
			// personne au dehors, donc il ne sort pas.
			rooms: rooms.map((room) => room.name)
		}
	};
}

export function sessionOf(seance: SeancePublique) {
	return {
		courseId: seance.courseId,
		date: seance.date,
		start: seance.start,
		end: seance.end,
		startDayOffset: seance.startDayOffset,
		endDayOffset: seance.endDayOffset,
		status: seance.status,
		...(seance.anchor ? { anchor: seance.anchor } : {}),
		...(seance.originalDate ? { originalDate: seance.originalDate } : {}),
		...(seance.movedTo ? { movedTo: seance.movedTo } : {}),
		title: seance.title,
		audience: seance.audience,
		room: seance.room,
		teacher: seance.teacher,
		// `kind` sort toujours : un lecteur tiers doit pouvoir distinguer une session du vendredi
		// d'un cours sans deviner. Le rang et les langues du sermon ne sortent que pour elles, où
		// ils ont un sens (ADR 0033).
		kind: seance.kind,
		...(seance.kind === 'jumua'
			? { jumuaOrder: seance.jumuaOrder, sermonLanguages: seance.teachingLanguages }
			: {})
	};
}

export function scheduleOf(
	organisation: OrganisationPublique,
	langue: Langue,
	range: { from: IsoDate; to: IsoDate },
	seances: readonly SeancePublique[]
) {
	return {
		organization: organizationOf(organisation),
		language: langue,
		range,
		sessions: seances.map(sessionOf)
	};
}

/** Les prochaines séances d'un cours, exceptions et pauses comprises. */
export function nextDates(
	schedule: CourseSchedule,
	exceptions: Parameters<typeof nextOccurrences>[0]['exceptions'],
	pauses: readonly PauseRow[],
	today: IsoDate,
	limit: number
) {
	return nextOccurrences({
		schedules: [schedule],
		exceptions,
		pauses: pauses.map((pause) => ({
			from: String(pause.from_date).slice(0, 10) as IsoDate,
			to: String(pause.to_date).slice(0, 10) as IsoDate,
			...(pause.course_id ? { courseId: pause.course_id } : {})
		})),
		from: today,
		limit
	});
}

export function courseOf(
	course: CourseRow & { title: string | null; description: string | null; room: string | null },
	next: readonly { date: string; start: string | null; status: string }[]
) {
	return {
		id: course.id,
		kind: course.kind,
		...(course.kind === 'jumua' ? { jumuaOrder: course.jumua_order } : {}),
		title: course.title ?? '',
		description: course.description,
		audience: course.audience,
		teachingLanguages: course.teaching_language,
		room: course.room,
		teacher: course.teacher,
		recurrence: recurrenceOf(course),
		timing: timingOf(course),
		startsOn: String(course.starts_on).slice(0, 10),
		endsOn: course.ends_on ? String(course.ends_on).slice(0, 10) : null,
		nextSessions: next.map((seance) => ({
			date: seance.date,
			start: seance.start,
			status: seance.status
		}))
	};
}

export function coursesOf(
	organisation: OrganisationPublique,
	langue: Langue,
	groupes: readonly { rhythm: Rythme; courses: readonly ReturnType<typeof courseOf>[] }[]
) {
	return {
		organization: organizationOf(organisation),
		language: langue,
		groups: groupes
	};
}

/** Le schéma d'un cours pour `@jadwal/core`, repris tel quel. */
export const scheduleForCore = toSchedule;

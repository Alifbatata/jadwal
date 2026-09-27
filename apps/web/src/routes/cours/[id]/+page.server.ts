// Modifier un cours.
//
// L'identifiant est dans l'URL, et ce n'est pas une contradiction avec l'ADR 0013 : c'est
// l'**organisation** qui ne doit jamais venir de la requête. Elle vient de la session ; la sécurité
// au niveau des lignes ne rend alors que les cours de cette organisation, et un identifiant
// emprunté à une autre ne trouve rien. Un identifiant mal formé n'atteint pas la base, qui le
// refusait par une erreur 500 : il reçoit la réponse d'un cours inconnu (étape 19, lot 2).

import { error, fail, redirect } from '@sveltejs/kit';
import { sql } from '@jadwal/db';
import { timingChoice, writeDates, type CourseFormValues } from '$lib/course-form.js';
import { withSessionOrg } from '$lib/server/context.js';
import { readCourseForm } from '$lib/server/course-form.js';
import { FIRST_SUPPORTED_DATE, LAST_SUPPORTED_DATE } from '$lib/server/dates.js';
import { mustBeInOrganisation } from '$lib/server/guard.js';
import { updateCourse } from '$lib/server/courses.js';
import { readRooms, readSettings, type CourseRow } from '$lib/server/programme.js';
import type { Actions, PageServerLoad } from './$types.js';

/** Un identifiant de cours. Autre chose n'atteint pas la base, qui le refuserait en erreur. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La réponse d'un cours inconnu, la même pour la page et pour son formulaire. */
function unknownCourse(): never {
	error(404, 'Ce cours n’existe pas dans cette organisation.');
}

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

/**
 * Le cours, et seulement un cours : une session du vendredi a son propre écran. Ce formulaire
 * écrit `kind = 'course'`, et la base refuse qu'une ligne change de type (migration 0069) ; une
 * session demandée ici est donc un cours inconnu, pas une erreur 500.
 */
async function readCourse(tx: Parameters<typeof readSettings>[0], id: string) {
	return rows<CourseRow>(
		await tx.execute(sql`
			select c.*, c."recurrence_date"::text[] as recurrence_dates,
				c."starts_on"::text as starts_on, c."ends_on"::text as ends_on,
				c."recurrence_anchor_date"::text as recurrence_anchor_date,
				c."timing_start"::text as timing_start, c."timing_end"::text as timing_end
			from "course" c where c."id" = ${id} and c."kind" = 'course'
		`)
	)[0];
}

export const load: PageServerLoad = async (event) => {
	const context = await mustBeInOrganisation(event);
	const id = event.params.id;
	if (!UUID.test(id)) unknownCourse();
	return withSessionOrg(context, async (tx) => {
		const settings = await readSettings(tx);
		const course = await readCourse(tx, id);
		if (!course) unknownCourse();
		const translations = rows<{ language: string; title: string; description: string | null }>(
			await tx.execute(
				sql`select "language", "title", "description" from "course_translation"
					where "course_id" = ${id}`
			)
		);
		const titles: Record<string, string> = {};
		const descriptions: Record<string, string> = {};
		for (const langue of settings.enabled_language) {
			const found = translations.find((entry) => entry.language === langue);
			titles[langue] = found?.title ?? '';
			descriptions[langue] = found?.description ?? '';
		}
		const dates = (course.recurrence_dates ?? []).map((date) => String(date).slice(0, 10));
		// −10 en base s'ouvre sur « avant une prière » et 10 minutes (retour C3).
		const timing = timingChoice(course.timing_kind, course.timing_offset_minutes);
		const valeurs: CourseFormValues = {
			status: course.status,
			audience: course.audience,
			teachingLanguages: course.teaching_language,
			sourceLanguage: course.source_language,
			roomId: course.room_id,
			teacher: course.teacher,
			startsOn: String(course.starts_on).slice(0, 10),
			// Enregistré, le premier jour est choisi : il ne suit plus les dates.
			startsOnFromDates: '',
			endsOn: course.ends_on ? String(course.ends_on).slice(0, 10) : null,
			recurrenceKind: course.recurrence_kind,
			weekdays: course.recurrence_weekday ?? [],
			interval: course.recurrence_interval ?? 1,
			monthlyWeekday: course.recurrence_ordinal_weekday ?? 1,
			monthlyOrdinal: course.recurrence_ordinal ?? 1,
			// Comme la personne les lit et les écrit : « 12.10.2026 », une par ligne (A3).
			dates: writeDates(dates),
			timingKind: timing.timingKind,
			start: (course.timing_start ?? '19:00').slice(0, 5),
			end: (course.timing_end ?? '20:30').slice(0, 5),
			prayer: course.timing_prayer ?? 'maghrib',
			offsetMinutes: timing.offsetMinutes,
			durationMinutes: course.timing_duration_minutes ?? 60,
			titles,
			descriptions
		};
		return {
			organisation: { name: settings.name },
			// Une clé à elle : `organisation` est déjà posée par cette page et masque celle de la
			// coquille, où vit le drapeau du module (ADR 0042).
			modulePrieres: context.organizationPrayerModule,
			langues: settings.enabled_language,
			salles: (await readRooms(tx)).map((salle) => ({ id: salle.id, name: salle.name })),
			/** Les dates que l'action accepte : les bornes des champs de date et du résumé. */
			dates: { first: FIRST_SUPPORTED_DATE, last: LAST_SUPPORTED_DATE },
			id,
			// Sans titre dans la langue de saisie, la page en écrit un dans la sienne.
			titre: titles[course.source_language] || null,
			valeurs
		};
	});
};

export const actions: Actions = {
	default: async (event) => {
		const context = await mustBeInOrganisation(event);
		const id = event.params.id;
		if (!UUID.test(id)) unknownCourse();
		const form = await event.request.formData();
		const { langues, salles } = await withSessionOrg(context, async (tx) => ({
			langues: (await readSettings(tx)).enabled_language,
			salles: (await readRooms(tx)).map((salle) => salle.id)
		}));
		const read = readCourseForm(form, langues, salles);
		// Les noms des erreurs, jamais leurs phrases : la page les écrit dans sa langue. Ce que la
		// personne a envoyé revient avec, pour qu'elle n'ait rien à retaper et que le résumé le montre.
		if (!read.ok) {
			return fail(400, {
				errors: read.errors,
				badDates: read.badDates,
				datesBefore: read.datesBefore,
				datesAfter: read.datesAfter,
				untitledDescriptions: read.untitledDescriptions,
				values: read.values
			});
		}
		const values = read.values;
		// L'état d'avant l'enregistrement, ou `null` quand le cours n'existe plus.
		const statusBefore = await withSessionOrg(context, async (tx) => {
			const before = await readCourse(tx, id);
			if (!before) return null;
			const ok = await updateCourse(tx, context, id, values, {
				status: before.status,
				recurrence_kind: before.recurrence_kind,
				timing_kind: before.timing_kind
			});
			return ok ? before.status : null;
		});
		if (statusBefore === null) {
			return fail(404, {
				errors: ['gone' as const],
				badDates: [],
				datesBefore: [],
				datesAfter: [],
				untitledDescriptions: [],
				values: null
			});
		}
		// Un brouillon publié à l'instant est un cours nouveau pour la communauté : la liste propose le
		// message « nouveau cours ». Un cours déjà publié ne l'est plus (étape 19, lot 2).
		const justPublished = statusBefore === 'draft' && values.status === 'published';
		redirect(303, justPublished ? `/cours?publie=${id}` : '/cours');
	}
};

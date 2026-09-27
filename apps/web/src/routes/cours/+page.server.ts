// Cours : la liste, avec le rythme en clair, et les pauses de l'organisation.
//
// Une pause sans cours vaut pour toute l'organisation ; une pause rattachée à un cours n'en suspend
// qu'un (ADR 0011). Les deux se posent ici, parce que c'est ici qu'on a la liste sous les yeux.
//
// Étape 19, lot 2 : une date de pause s'accepte de 1970 à 2100 (`isSupportedDate`), un identifiant
// mal formé, ou celui d'une autre organisation, n'atteint pas la base, et le caractère nul est retiré
// de la raison. Chacun donnait une erreur 500. Retirer une pause qui n'existe plus le dit, au lieu de
// répondre « supprimée » et de l'écrire au journal.
//
// Supprimer un cours est réservé à la personne responsable (ADR 0046) : la base le lui réserve depuis
// la migration 0065, l'écran ne propose le bouton qu'à elle, et l'action refuse l'éditeur par la
// garde des écrans réservés. Une session du vendredi ne passe pas par ici : elle a son écran.
//
// Après la publication d'un nouveau cours, le formulaire renvoie ici avec `?publie=<id>`, et la liste
// propose le message « nouveau cours », prêt à coller, dans chaque langue que l'organisation publie,
// la langue source d'abord, comme les messages d'« À venir » (retour D1 de l'étape 18). Le rythme et
// l'horaire sont ceux que la page publique et la liste écrivent, dans la langue de chaque message.

import { fail } from '@sveltejs/kit';
import type { IsoDate } from '@jadwal/core';
import { newId, sql, type Transaction } from '@jadwal/db';
import { splitByPeriod } from '$lib/course-form.js';
import { describeRecurrence, describeTiming } from '$lib/format.js';
import { LANGUES, type Langue } from '$lib/i18n.js';
import { newCourseMessage } from '$lib/messages.js';
import { rythmeEnClair } from '$lib/public/affichage.js';
import { record } from '$lib/server/audit.js';
import { withSessionOrg } from '$lib/server/context.js';
import { FIRST_SUPPORTED_DATE, isSupportedDate, LAST_SUPPORTED_DATE } from '$lib/server/dates.js';
import { mustAdminister, mustBeInOrganisation } from '$lib/server/guard.js';
import {
	readCourses,
	readPauses,
	readSettings,
	type CourseRow,
	type OrganisationSettings
} from '$lib/server/programme.js';
import type { Actions, PageServerLoad } from './$types.js';

/** Un message prêt à coller, dans une langue. */
interface Message {
	language: Langue;
	text: string;
}

/** Un identifiant de cours ou de pause. Autre chose n'atteint pas la base, qui le refuserait en erreur. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

/**
 * Un cours à dates précises dont des dates tombent hors de sa période : le moteur ne les publie pas.
 * Le formulaire le refuse depuis l'étape 18, mais un cours enregistré avant peut en avoir ; sa fiche
 * dit lesquelles, et la liste le signale (étape 19, lot 2).
 */
function datesOutsidePeriod(course: CourseRow): boolean {
	if (course.recurrence_kind !== 'dates') return false;
	const { before, after } = splitByPeriod(
		(course.recurrence_dates ?? []).map((date) => String(date).slice(0, 10) as IsoDate).sort(),
		String(course.starts_on).slice(0, 10),
		course.ends_on ? String(course.ends_on).slice(0, 10) : null,
		{ first: FIRST_SUPPORTED_DATE, last: LAST_SUPPORTED_DATE }
	);
	return before.length + after.length > 0;
}

/**
 * Les langues des messages : celles que l'organisation publie, dans l'ordre du service, et `first`
 * devant elles quand elle en fait partie (retour D1 de l'étape 18). La règle d'« À venir ».
 */
function messageLanguages(published: readonly string[], first: string): Langue[] {
	const languages = LANGUES.filter((language) => published.includes(language));
	const head = languages.find((language) => language === first) ?? languages[0] ?? 'fr';
	return [head, ...languages.filter((language) => language !== head)];
}

/**
 * Le message « nouveau cours » d'un cours publié, dans chaque langue des messages. Le titre est
 * celui de la langue du message quand le cours y est traduit, sinon celui de sa langue source. Le
 * rythme est celui de la page publique ; pour un cours à dates précises, ses dates, comme la liste
 * les écrit. L'horaire est celui de la liste, avec sa durée.
 */
async function newCourseMessages(
	tx: Transaction,
	settings: OrganisationSettings,
	course: CourseRow & { title: string | null; room: string | null }
): Promise<Message[]> {
	const titles = new Map(
		rows<{ language: string; title: string }>(
			await tx.execute(sql`
				select "language", "title" from "course_translation" where "course_id" = ${course.id}
			`)
		).map((row) => [row.language, row.title])
	);
	return messageLanguages(settings.enabled_language, course.source_language).map((language) => ({
		language,
		text: newCourseMessage(
			settings.greeting,
			titles.get(language) ?? course.title ?? '',
			course.recurrence_kind === 'dates'
				? describeRecurrence({ kind: 'dates', dates: course.recurrence_dates }, language)
				: rythmeEnClair(language, {
						recurrenceKind: course.recurrence_kind,
						recurrenceWeekdays: course.recurrence_weekday,
						recurrenceInterval: course.recurrence_interval,
						recurrenceOrdinal: course.recurrence_ordinal,
						recurrenceOrdinalWeekday: course.recurrence_ordinal_weekday
					}),
			describeTiming(
				{
					kind: course.timing_kind,
					start: course.timing_start,
					end: course.timing_end,
					prayer: course.timing_prayer,
					offsetMinutes: course.timing_offset_minutes,
					durationMinutes: course.timing_duration_minutes
				},
				language
			),
			course.room,
			language
		)
	}));
}

/** Le cours existe dans l'organisation du contexte. Le filtre est écrit ici, en plus de la politique. */
async function courseExists(tx: Transaction, courseId: string): Promise<boolean> {
	if (!UUID.test(courseId)) return false;
	const found = await tx.execute(sql`
		select "id" from "course"
		where "id" = ${courseId} and "organization_id" = (select jadwal.current_org_id())
	`);
	return rows(found).length > 0;
}

export const load: PageServerLoad = async (event) => {
	const context = await mustBeInOrganisation(event);
	return withSessionOrg(context, async (tx) => {
		const settings = await readSettings(tx);
		// Les cours, et **eux seuls** : les sessions du vendredi ont leur propre écran, où une
		// organisation les trouve sans les chercher parmi vingt cours (ADR 0033).
		const courses = await readCourses(tx, ['draft', 'published'], ['course']);
		const pauses = await readPauses(tx);
		const titres = new Map(courses.map((course) => [course.id, course.title]));
		// Le cours que l'adresse nomme, s'il est publié : le formulaire y renvoie après une
		// publication, et l'adresse redonne le message ensuite, rechargée ou écrite à la main. Un
		// brouillon ou un cours inconnu n'ont pas de message.
		const publie = event.url.searchParams.get('publie');
		const annonce = courses.find((course) => course.id === publie && course.status === 'published');
		return {
			organisation: { name: settings.name },
			/** « Supprimer ce cours » : la personne responsable seule, comme la garde de l'action. */
			canDelete: context.role !== 'editor',
			/** Le message « nouveau cours », dans chaque langue publiée, ou `null`. */
			announcement: annonce ? await newCourseMessages(tx, settings, annonce) : null,
			// Un titre absent reste absent : la page écrit « Cours sans titre » dans sa langue.
			courses: courses.map((course) => ({
				id: course.id,
				title: course.title,
				status: course.status,
				audience: course.audience,
				room: course.room,
				teacher: course.teacher,
				datesOutsidePeriod: datesOutsidePeriod(course),
				recurrence: {
					kind: course.recurrence_kind,
					weekdays: course.recurrence_weekday,
					interval: course.recurrence_interval,
					ordinal: course.recurrence_ordinal,
					ordinalWeekday: course.recurrence_ordinal_weekday,
					dates: course.recurrence_dates
				},
				timing: {
					kind: course.timing_kind,
					start: course.timing_start,
					end: course.timing_end,
					prayer: course.timing_prayer,
					offsetMinutes: course.timing_offset_minutes,
					durationMinutes: course.timing_duration_minutes
				}
			})),
			pauses: pauses.map((pause) => ({
				id: pause.id,
				courseId: pause.course_id,
				course: pause.course_id ? (titres.get(pause.course_id) ?? null) : null,
				from: pause.from_date,
				to: pause.to_date,
				reason: pause.reason
			})),
			/** Les dates que l'action accepte : les bornes des champs de date d'une pause. */
			dates: { first: FIRST_SUPPORTED_DATE, last: LAST_SUPPORTED_DATE }
		};
	});
};

export const actions: Actions = {
	pause: async (event) => {
		const context = await mustBeInOrganisation(event);
		const form = await event.request.formData();
		const from = String(form.get('from') ?? '');
		const to = String(form.get('to') ?? '');
		const courseId = String(form.get('courseId') ?? '') || null;
		// Le caractère nul, qu'aucun clavier ne tape, et que PostgreSQL refuse dans un texte.
		const reason =
			String(form.get('reason') ?? '')
				.replaceAll('\u0000', '')
				.trim() || null;
		// Le nom de l'erreur, jamais sa phrase : la page l'écrit dans sa langue.
		if (!isSupportedDate(from) || !isSupportedDate(to)) {
			return fail(400, { error: 'pauseDates' as const });
		}
		if (to < from) return fail(400, { error: 'pauseInverted' as const });
		const id = newId();
		const written = await withSessionOrg(context, async (tx) => {
			// Un cours supprimé depuis l'ouverture de la page, ou celui d'une autre organisation : la
			// clé étrangère le refusait par une erreur 500.
			if (courseId !== null && !(await courseExists(tx, courseId))) return false;
			await tx.execute(sql`
				insert into "pause" ("id", "organization_id", "course_id", "from_date", "to_date",
					"reason", "created_by")
				values (${id}, ${context.organizationId}, ${courseId}, ${from}, ${to}, ${reason},
					${context.userId})
			`);
			await record(tx, context.organizationId, context.userId, {
				action: 'pause.create',
				targetTable: 'pause',
				targetId: id,
				after: { from, to, courseId, reason }
			});
			return true;
		});
		if (!written) return fail(404, { error: 'courseGone' as const });
		return { pauseAdded: true };
	},

	/**
	 * Retirer une pause. Une pause déjà retirée, par une autre personne ou depuis une page restée
	 * ouverte, reçoit sa phrase, et rien ne s'écrit au journal.
	 */
	supprimerPause: async (event) => {
		const context = await mustBeInOrganisation(event);
		const form = await event.request.formData();
		const pauseId = String(form.get('pauseId') ?? '');
		if (!UUID.test(pauseId)) return fail(404, { error: 'pauseGone' as const });
		const removed = await withSessionOrg(context, async (tx) => {
			const deleted = rows(
				await tx.execute(sql`
					delete from "pause"
					where "id" = ${pauseId} and "organization_id" = (select jadwal.current_org_id())
					returning "id"
				`)
			);
			if (deleted.length === 0) return false;
			await record(tx, context.organizationId, context.userId, {
				action: 'pause.delete',
				targetTable: 'pause',
				targetId: pauseId
			});
			return true;
		});
		if (!removed) return fail(404, { error: 'pauseGone' as const });
		return { pauseRemoved: true };
	},

	/**
	 * Supprimer un cours, après la confirmation que l'écran demande. L'éditeur est renvoyé à l'accueil
	 * sans rien lire. La base ne répond pas par une erreur à une suppression qu'elle refuse : elle ne
	 * supprime aucune ligne. Le nombre de lignes supprimées décide donc de la réponse, comme pour une
	 * session du vendredi : zéro, et le cours n'existe pas, ou plus, ou c'est une session, et rien ne
	 * s'écrit au journal.
	 */
	supprimer: async (event) => {
		const context = await mustAdminister(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		if (!UUID.test(courseId)) return fail(404, { error: 'courseGone' as const });
		const deleted = await withSessionOrg(context, async (tx) => {
			const before = rows<{ id: string; status: string; starts_on: string }>(
				await tx.execute(sql`
					delete from "course"
					where "id" = ${courseId} and "kind" = 'course'
						and "organization_id" = (select jadwal.current_org_id())
					returning "id", "status", "starts_on"::text
				`)
			)[0];
			if (!before) return false;
			await record(tx, context.organizationId, context.userId, {
				action: 'course.delete',
				targetTable: 'course',
				targetId: courseId,
				before
			});
			return true;
		});
		if (!deleted) return fail(404, { error: 'courseGone' as const });
		return { courseDeleted: true };
	}
};

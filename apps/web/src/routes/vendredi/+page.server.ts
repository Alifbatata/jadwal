// La prière du vendredi, côté responsables (ADR 0033, docs/maquettes/responsables-vendredi.md).
//
// Un écran distinct de la liste des cours, pour une raison simple : une organisation y vient deux
// fois par an, au changement de saison, et elle ne doit pas chercher ses sessions parmi vingt
// cours. Le moteur, lui, est le même — une session est un `course` d'un autre type, et tout ce qui
// vaut pour un cours vaut pour elle sans qu'une ligne soit réécrite.
//
// Les deux gestes du bas — annuler, déplacer — sont **exactement** ceux de l'écran d'accueil, et
// passent par la même table d'exceptions.
//
// Depuis l'étape 18, une action rend le nom de ce qu'elle a fait ou de ce qu'elle refuse, jamais
// une phrase : la page l'écrit dans la langue de la personne (`$lib/i18n/friday.ts`).

import { fail } from '@sveltejs/kit';
import { addDays, todayInZone, type IsoDate } from '@jadwal/core';
import { newId, sql } from '@jadwal/db';
import { isLangue, t } from '$lib/i18n.js';
import type { FridayDone, FridayError } from '$lib/i18n/friday.js';
import { record } from '$lib/server/audit.js';
import { withSessionOrg } from '$lib/server/context.js';
import { insertCourse, updateCourse } from '$lib/server/courses.js';
import { mustHavePrayerModule } from '$lib/server/guard.js';
import { readCourses, readProgramme, readRooms, readSettings } from '$lib/server/programme.js';
import { parseFridayForm } from './form.js';
import type { Actions, PageServerLoad } from './$types.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^\d{2}:\d{2}$/;
/** Sept jours : de quoi couvrir le prochain vendredi, où que l'on soit dans la semaine. */
const JOURS_AFFICHES = 7;

/** Ce qu'une action refuse, par le nom de chaque erreur. */
function refus(status: number, ...errors: FridayError[]) {
	return fail(status, { errors });
}

/** Ce qu'une action a fait, par son nom. */
function fait(done: FridayDone) {
	return { done };
}

/** Les sessions du vendredi, dans leur ordre, telles que l'écran les montre. */
function versSession(course: Awaited<ReturnType<typeof readCourses>>[number]) {
	return {
		id: course.id,
		jumuaOrder: course.jumua_order ?? 1,
		title: course.title ?? '',
		description: course.description,
		status: course.status,
		start: String(course.timing_start ?? '').slice(0, 5),
		end: String(course.timing_end ?? '').slice(0, 5),
		roomId: course.room_id,
		room: course.room,
		teacher: course.teacher,
		sermonLanguages: course.teaching_language,
		startsOn: String(course.starts_on).slice(0, 10),
		endsOn: course.ends_on ? String(course.ends_on).slice(0, 10) : null
	};
}

export const load: PageServerLoad = async (event) => {
	const context = await mustHavePrayerModule(event);
	const maintenant = new Date();
	return withSessionOrg(context, async (tx) => {
		const settings = await readSettings(tx);
		// **Les sessions du vendredi, et elles seules.** C'est la lecture qui trie, jamais l'écran :
		// un filtre oublié dans un composant ferait apparaître un cours ici, ou une session dans la
		// liste des cours (ADR 0033).
		const sessions = await readCourses(tx, ['draft', 'published', 'archived'], ['jumua']);
		const programme = await readProgramme(tx, maintenant, JOURS_AFFICHES);
		const today = todayInZone(settings.time_zone, maintenant);
		// Une session s'écrit dans la première langue que l'organisation publie (`parseFridayForm`) :
		// le titre proposé est le nom de la prière dans cette langue, pas dans celle de l'écran.
		const source = settings.enabled_language[0] ?? 'fr';
		return {
			organisation: { name: settings.name },
			titrePropose: t(isLangue(source) ? source : 'fr').jumua,
			langues: settings.enabled_language,
			salles: (await readRooms(tx)).map((salle) => ({ id: salle.id, name: salle.name })),
			sessions: sessions.map(versSession),
			today,
			// Les séances des sessions dans les sept prochains jours : c'est le prochain vendredi,
			// avec ses annulations et ses déplacements déjà appliqués.
			prochaines: programme.seances
				.filter((seance) => sessions.some((session) => session.id === seance.courseId))
				.map((seance) => ({
					courseId: seance.courseId,
					date: seance.date,
					start: seance.start,
					end: seance.end,
					status: seance.status,
					title: seance.title,
					movedTo: seance.movedTo ?? null,
					originalDate: seance.originalDate ?? null
				})),
			/** Aujourd'hui et les sept jours qui suivent, pour le choix de déplacement. */
			joursSuivants: Array.from({ length: 8 }, (_, index) => addDays(today, index))
		};
	});
};

export const actions: Actions = {
	/** Ajouter une session, ou en modifier une : le même formulaire, la même vérification. */
	enregistrer: async (event) => {
		const context = await mustHavePrayerModule(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		return withSessionOrg(context, async (tx) => {
			const settings = await readSettings(tx);
			const lu = parseFridayForm(form, settings.enabled_language);
			if (!lu.ok) return refus(400, ...lu.errors);
			if (courseId === '') {
				await insertCourse(tx, context, lu.values);
				return fait('added');
			}
			const avant = (await readCourses(tx, ['draft', 'published', 'archived'], ['jumua'])).find(
				(session) => session.id === courseId
			);
			if (!avant) return refus(404, 'sessionGone');
			const ecrit = await updateCourse(tx, context, courseId, lu.values, {
				title: avant.title,
				status: avant.status,
				start: avant.timing_start
			});
			if (!ecrit) return refus(404, 'sessionGone');
			return fait('updated');
		});
	},

	/** Publier ou dépublier. Un brouillon ne s'affiche nulle part en public, pas même en haut. */
	basculer: async (event) => {
		const context = await mustHavePrayerModule(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		const vers = String(form.get('vers') ?? '') === 'published' ? 'published' : 'draft';
		await withSessionOrg(context, async (tx) => {
			await tx.execute(sql`
				update "course" set "status" = ${vers}, "updated_at" = now(),
					"updated_by" = ${context.userId}
				where "id" = ${courseId} and "kind" = 'jumua'
			`);
			await record(tx, context.organizationId, context.userId, {
				action: 'course.update',
				targetTable: 'course',
				targetId: courseId,
				after: { status: vers }
			});
		});
		return fait(vers === 'published' ? 'published' : 'unpublished');
	},

	supprimer: async (event) => {
		const context = await mustHavePrayerModule(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		await withSessionOrg(context, async (tx) => {
			// `kind = 'jumua'` dans la clause : cet écran ne peut pas supprimer un cours, même si
			// quelqu'un lui envoyait l'identifiant d'un cours.
			await tx.execute(sql`delete from "course" where "id" = ${courseId} and "kind" = 'jumua'`);
			await record(tx, context.organizationId, context.userId, {
				action: 'course.delete',
				targetTable: 'course',
				targetId: courseId
			});
		});
		return fait('deleted');
	},

	/** Annuler une session ce vendredi-là. Les autres vendredis ne changent pas. */
	annuler: async (event) => {
		const context = await mustHavePrayerModule(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		const date = String(form.get('date') ?? '');
		if (!DATE.test(date)) return refus(400, 'dateUnreadable');
		await withSessionOrg(context, async (tx) => {
			await tx.execute(sql`
				insert into "session_exception"
					("id", "organization_id", "course_id", "date", "kind", "created_by")
				values (${newId()}, ${context.organizationId}, ${courseId}, ${date}, 'cancelled',
					${context.userId})
				on conflict ("course_id", "date") do update
					set "kind" = 'cancelled', "to_date" = null, "to_start" = null
			`);
			await record(tx, context.organizationId, context.userId, {
				action: 'exception.cancel',
				targetTable: 'session_exception',
				targetId: courseId,
				after: { date, kind: 'cancelled' }
			});
		});
		return fait('cancelled');
	},

	deplacer: async (event) => {
		const context = await mustHavePrayerModule(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		const date = String(form.get('date') ?? '');
		const toDate = String(form.get('toDate') ?? '');
		const toStart = String(form.get('toStart') ?? '');
		if (!DATE.test(date) || !DATE.test(toDate)) return refus(400, 'dateUnreadable');
		if (!HEURE.test(toStart)) return refus(400, 'timeUnreadable');
		await withSessionOrg(context, async (tx) => {
			await tx.execute(sql`
				insert into "session_exception"
					("id", "organization_id", "course_id", "date", "kind", "to_date", "to_start",
					"created_by")
				values (${newId()}, ${context.organizationId}, ${courseId}, ${date}, 'moved',
					${toDate}, ${toStart}, ${context.userId})
				on conflict ("course_id", "date") do update
					set "kind" = 'moved', "to_date" = ${toDate}, "to_start" = ${toStart}
			`);
			await record(tx, context.organizationId, context.userId, {
				action: 'exception.move',
				targetTable: 'session_exception',
				targetId: courseId,
				after: { date, toDate, toStart }
			});
		});
		return fait('moved');
	},

	retablir: async (event) => {
		const context = await mustHavePrayerModule(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		const date = String(form.get('date') ?? '');
		if (!DATE.test(date)) return refus(400, 'dateUnreadable');
		await withSessionOrg(context, async (tx) => {
			await tx.execute(
				sql`delete from "session_exception" where "course_id" = ${courseId} and "date" = ${date}`
			);
			await record(tx, context.organizationId, context.userId, {
				action: 'exception.restore',
				targetTable: 'session_exception',
				targetId: courseId,
				before: { date }
			});
		});
		return fait('restored');
	}
};

/** Le type d'une date ISO, pour le typage du tableau ci-dessus. */
export type JourDeDeplacement = IsoDate;

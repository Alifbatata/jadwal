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
//
// Annuler et déplacer suivent la règle d'« À venir » (relecture du lot 5) : ils ne visent qu'une
// session encore prévue telle quelle ce jour-là. Une page restée ouverte (Retour, un autre onglet,
// l'écran « À venir », une autre personne) montre encore la carte d'une session supprimée, annulée,
// déplacée ou passée à une autre heure depuis ; l'envoyer défaisait ce changement. Les deux actions
// le refusent et n'écrivent rien, et l'écran rendu est à jour. Déplacer refuse aussi le jour et
// l'heure où la session est déjà prévue.

import { fail } from '@sveltejs/kit';
import { addDays, todayInZone, type IsoDate } from '@jadwal/core';
import { newId, sql, type Transaction } from '@jadwal/db';
import { isLangue, t, type Langue } from '$lib/i18n.js';
import type { FridayDone, FridayError } from '$lib/i18n/friday.js';
import { record } from '$lib/server/audit.js';
import { withSessionOrg } from '$lib/server/context.js';
import { insertCourse, updateCourse } from '$lib/server/courses.js';
import { fridayTitle } from '$lib/server/friday-title.js';
import { mustHavePrayerModule } from '$lib/server/guard.js';
import { readCourses, readProgramme, readRooms, readSettings } from '$lib/server/programme.js';
import { parseFridayForm, proposedOrder, readFridayEntry } from './form.js';
import type { Actions, PageServerLoad } from './$types.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^\d{2}:\d{2}$/;
/** Un identifiant de session. Autre chose n'atteint pas la base, qui le refuserait en erreur. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Sept jours : de quoi couvrir le prochain vendredi, où que l'on soit dans la semaine. */
const JOURS_AFFICHES = 7;

function lignes<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

/**
 * Vrai quand la session existe encore dans l'organisation. `kind = 'jumua'` : cet écran n'annule ni
 * ne déplace un cours, même si on lui envoie l'identifiant d'un cours.
 */
async function sessionExiste(tx: Transaction, courseId: string): Promise<boolean> {
	if (!UUID.test(courseId)) return false;
	const trouvees = lignes<{ id: string }>(
		await tx.execute(sql`
			select "id" from "course"
			where "id" = ${courseId} and "kind" = 'jumua'
				and "organization_id" = (select jadwal.current_org_id())
		`)
	);
	return trouvees.length > 0;
}

/**
 * La séance d'une session un jour donné, telle que « Ce vendredi » la montre : le calcul de
 * `@jadwal/core`, par `readProgramme`, sur les sept jours de l'écran. Rien quand elle n'y est pas
 * prévue telle quelle ce jour-là, parce qu'elle y est annulée ou déplacée, ou qu'elle en est absente.
 */
async function seancePrevue(
	tx: Transaction,
	maintenant: Date,
	courseId: string,
	date: string
): Promise<{ start: string | null } | null> {
	const { seances } = await readProgramme(tx, maintenant, JOURS_AFFICHES);
	const seance = seances.find(
		(une) => une.courseId === courseId && une.date === date && une.status === 'scheduled'
	);
	return seance ? { start: seance.start ?? null } : null;
}

/**
 * Ce qu'une action refuse, par le nom de chaque erreur. `entry: null` dit qu'il n'y a aucune saisie
 * à remettre sous les yeux : sans ce champ, TypeScript fondait ce refus dans celui d'un formulaire
 * de session, qui en porte une, et `entry` disparaissait du type que l'écran reçoit.
 */
function refus(status: number, ...errors: FridayError[]) {
	return fail(status, { errors, entry: null });
}

/** Ce qu'une action a fait, par son nom. */
function fait(done: FridayDone) {
	return { done };
}

/**
 * La langue dans laquelle une session s'écrit : celle de l'organisation, que l'écran Partager met
 * aussi en tête (`parseFridayForm`).
 */
function langueDesSessions(settings: { default_language: string }): Langue {
	return isLangue(settings.default_language) ? settings.default_language : 'fr';
}

/**
 * Les sessions du vendredi, dans leur ordre, telles que l'écran les montre. Une session qui porte
 * le nom proposé par le service le montre dans la langue de l'organisation : une session écrite
 * avant l'étape 18 sous « Prière du vendredi » s'affiche « Freitagsgebet » pour une organisation de
 * langue allemande, et s'enregistre ainsi la prochaine fois.
 */
function versSession(course: Awaited<ReturnType<typeof readCourses>>[number], langue: Langue) {
	return {
		id: course.id,
		jumuaOrder: course.jumua_order ?? 1,
		title: fridayTitle(course.title ?? '', 'jumua', langue),
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
		// Une session s'écrit dans la langue de l'organisation (`parseFridayForm`) : le titre proposé
		// est le nom de la prière dans cette langue, pas dans celle de l'écran.
		const source = langueDesSessions(settings);
		const lues = sessions.map((session) => versSession(session, source));
		return {
			organisation: { name: settings.name },
			titrePropose: t(source).jumua,
			rangPropose: proposedOrder(lues),
			langues: settings.enabled_language,
			salles: (await readRooms(tx)).map((salle) => ({ id: salle.id, name: salle.name })),
			sessions: lues,
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
	/**
	 * Ajouter une session, ou en modifier une : le même formulaire, la même vérification. Un refus
	 * rend aussi la session visée et la saisie : l'écran rouvre le bon formulaire, tel que la
	 * personne l'a rempli, et y écrit l'erreur.
	 */
	enregistrer: async (event) => {
		const context = await mustHavePrayerModule(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		return withSessionOrg(context, async (tx) => {
			const settings = await readSettings(tx);
			const lu = parseFridayForm(form, settings.enabled_language, langueDesSessions(settings));
			if (!lu.ok) {
				return fail(400, { errors: lu.errors, courseId, entry: readFridayEntry(form) });
			}
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
			// La session nommée : l'écran écrit la confirmation dans sa carte, là où la page s'ouvre.
			return { done: 'updated' as const, courseId };
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
		return withSessionOrg(context, async (tx) => {
			if (!(await sessionExiste(tx, courseId))) return refus(404, 'sessionGone');
			// Une session déjà annulée ou déplacée ce jour-là garde ce qui lui est arrivé :
			// l'annulation ne s'écrit que si la place est libre, et rien ne s'écrit sinon, pas même
			// le journal.
			const ecrite = lignes<{ id: string }>(
				await tx.execute(sql`
					insert into "session_exception"
						("id", "organization_id", "course_id", "date", "kind", "created_by")
					values (${newId()}, ${context.organizationId}, ${courseId}, ${date}, 'cancelled',
						${context.userId})
					on conflict ("course_id", "date") do nothing
					returning "id"
				`)
			);
			if (ecrite.length === 0) return refus(409, 'changed');
			await record(tx, context.organizationId, context.userId, {
				action: 'exception.cancel',
				targetTable: 'session_exception',
				targetId: courseId,
				after: { date, kind: 'cancelled' }
			});
			return fait('cancelled');
		});
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
		const maintenant = new Date();
		return withSessionOrg(context, async (tx) => {
			if (!(await sessionExiste(tx, courseId))) return refus(404, 'sessionGone');
			// Une session déjà annulée ou déplacée ce jour-là n'est plus prévue telle quelle : rien
			// ne se compare ci-dessous, et c'est l'écriture qui la refuse.
			const seance = await seancePrevue(tx, maintenant, courseId, date);
			// La carte envoie l'heure qu'elle montrait (`plannedStart`) ; une session du vendredi a
			// toujours une heure fixe. Quand elle n'est plus prévue à cette heure-là, son heure a
			// changé depuis l'ouverture de la page : la carte est périmée, quels que soient le jour et
			// l'heure choisis. Un formulaire sans ce champ, ou une séance absente des sept jours de
			// l'écran, n'est pas comparé.
			const montree = form.get('plannedStart');
			if (montree !== null && seance && seance.start !== String(montree)) {
				return refus(409, 'timeChanged');
			}
			// Le jour et l'heure où la session est déjà prévue : il n'y a rien à déplacer.
			if (toDate === date && seance?.start === toStart) return refus(400, 'unchanged');
			// Une session déjà annulée ou déplacée ce jour-là, par une page restée ouverte ou par un
			// envoi arrivé au même instant, garde ce qui lui est arrivé : rien n'est écrasé, rien ne
			// s'écrit, pas même le journal, et celui-ci est refusé.
			const ecrite = lignes<{ id: string }>(
				await tx.execute(sql`
					insert into "session_exception"
						("id", "organization_id", "course_id", "date", "kind", "to_date", "to_start",
						"created_by")
					values (${newId()}, ${context.organizationId}, ${courseId}, ${date}, 'moved',
						${toDate}, ${toStart}, ${context.userId})
					on conflict ("course_id", "date") do nothing
					returning "id"
				`)
			);
			if (ecrite.length === 0) return refus(409, 'changed');
			await record(tx, context.organizationId, context.userId, {
				action: 'exception.move',
				targetTable: 'session_exception',
				targetId: courseId,
				after: { date, toDate, toStart }
			});
			return fait('moved');
		});
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

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
//
// Depuis l'étape 19 (D2), Annuler refuse un jour déjà passé, comme « À venir ». Chaque geste qui
// vise une session répond « Cette session n'existe plus » à une session inconnue, ou à un cours, et
// n'écrit alors rien, pas même le journal : Rétablir, Publier et Supprimer répondaient « fait » et
// écrivaient au journal. Rétablir refuse de même une session qui n'a plus rien à rétablir ce
// jour-là (`alreadyRestored`, relecture de D2). Chaque identifiant, chaque date et chaque heure est vérifié avant la base,
// qui refusait un identifiant mal formé, un 30 février, l'an 0000 ou 25:99 par une erreur 500 ; une
// date s'accepte de 1970 à 2100 (`isSupportedDate`), et une salle qui n'existe pas, ou plus, a sa
// phrase dans le formulaire.
//
// Étape 19, lot 2 : la langue du sermon se choisit parmi toutes les langues d'enseignement, et non
// plus parmi les seules langues publiées ; Déplacer refuse un jour passé, comme « À venir » ; la
// ligne d'une session arrivée d'un autre jour a son « Rétablir » ; et chaque « Rétablir » envoie ce
// que sa ligne montrait, pour qu'une page restée ouverte n'efface pas un changement fait depuis
// (`$lib/server/exceptions.ts`).

import { fail } from '@sveltejs/kit';
import { addDays, isLocalTime, todayInZone, type IsoDate } from '@jadwal/core';
import { newId, sql, type Transaction } from '@jadwal/db';
import { isLangue, t, type Langue } from '$lib/i18n.js';
import type { FridayDone, FridayError } from '$lib/i18n/friday.js';
import { LANGUES_D_ENSEIGNEMENT } from '$lib/public/affichage.js';
import { record } from '$lib/server/audit.js';
import { withSessionOrg } from '$lib/server/context.js';
import { insertCourse, updateCourse } from '$lib/server/courses.js';
import { FIRST_SUPPORTED_DATE, isSupportedDate, LAST_SUPPORTED_DATE } from '$lib/server/dates.js';
import { currentChange, restore, shownChange } from '$lib/server/exceptions.js';
import { fridayTitle } from '$lib/server/friday-title.js';
import { mustHavePrayerModule } from '$lib/server/guard.js';
import { readCourses, readProgramme, readRooms, readSettings } from '$lib/server/programme.js';
import { parseFridayForm, proposedOrder, readFridayEntry } from './form.js';
import type { Actions, PageServerLoad } from './$types.js';

/**
 * Un identifiant de session ou de salle. Autre chose n'atteint pas la base, qui le refuserait en
 * erreur.
 */
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
 * Vrai quand la salle existe dans l'organisation. Une salle supprimée dans Réglages pendant que le
 * formulaire restait ouvert, ou celle d'une autre organisation, échouait sur la clé étrangère.
 */
async function salleExiste(tx: Transaction, roomId: string): Promise<boolean> {
	if (!UUID.test(roomId)) return false;
	const trouvees = lignes<{ id: string }>(
		await tx.execute(sql`
			select "id" from "room"
			where "id" = ${roomId} and "organization_id" = (select jadwal.current_org_id())
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
		const sessions = await readCourses(tx, ['draft', 'published'], ['jumua']);
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
			/**
			 * Les cases de la langue du sermon : toutes les langues d'enseignement, et non plus les
			 * seules langues que l'organisation publie (étape 19, lot 2).
			 */
			languesDuSermon: LANGUES_D_ENSEIGNEMENT,
			salles: (await readRooms(tx)).map((salle) => ({ id: salle.id, name: salle.name })),
			sessions: lues,
			today,
			/**
			 * Les dates qu'un formulaire de session peut envoyer : les bornes de « À partir du » et de
			 * « Jusqu'au ». Le calendrier ne propose plus une date que l'action refuserait.
			 */
			firstDate: FIRST_SUPPORTED_DATE,
			lastDate: LAST_SUPPORTED_DATE,
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
			const lu = parseFridayForm(form, langueDesSessions(settings));
			if (!lu.ok) {
				return fail(400, { errors: lu.errors, courseId, entry: readFridayEntry(form) });
			}
			if (lu.values.roomId !== null && !(await salleExiste(tx, lu.values.roomId))) {
				return fail(400, {
					errors: ['roomGone'] satisfies FridayError[],
					courseId,
					entry: readFridayEntry(form)
				});
			}
			if (courseId === '') {
				// Le rang d'une session sans date de fin est à elle seule, comme l'écran le propose
				// (`proposedOrder`) : une page ouverte avant, ou un formulaire écrit à la main, ne
				// glisse pas une quatrième session à un rang déjà pris.
				if (lu.values.endsOn === null) {
					const ouvertes = await readCourses(tx, ['draft', 'published'], ['jumua']);
					const pris = ouvertes.some(
						(session) =>
							session.ends_on === null && (session.jumua_order ?? 1) === lu.values.jumuaOrder
					);
					if (pris) {
						return fail(409, {
							errors: ['orderTaken'] satisfies FridayError[],
							courseId,
							entry: readFridayEntry(form)
						});
					}
				}
				await insertCourse(tx, context, lu.values);
				return fait('added');
			}
			const avant = (await readCourses(tx, ['draft', 'published'], ['jumua'])).find(
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

	/**
	 * Publier ou dépublier. Un brouillon ne s'affiche nulle part en public, pas même en haut. Une
	 * session qui n'existe pas, ou plus, ne change rien, et le journal n'en garde aucune trace.
	 */
	basculer: async (event) => {
		const context = await mustHavePrayerModule(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		const vers = String(form.get('vers') ?? '') === 'published' ? 'published' : 'draft';
		if (!UUID.test(courseId)) return refus(404, 'sessionGone');
		return withSessionOrg(context, async (tx) => {
			const ecrite = lignes<{ id: string }>(
				await tx.execute(sql`
					update "course" set "status" = ${vers}, "updated_at" = now(),
						"updated_by" = ${context.userId}
					where "id" = ${courseId} and "kind" = 'jumua'
						and "organization_id" = (select jadwal.current_org_id())
					returning "id"
				`)
			);
			if (ecrite.length === 0) return refus(404, 'sessionGone');
			await record(tx, context.organizationId, context.userId, {
				action: 'course.update',
				targetTable: 'course',
				targetId: courseId,
				after: { status: vers }
			});
			return fait(vers === 'published' ? 'published' : 'unpublished');
		});
	},

	supprimer: async (event) => {
		const context = await mustHavePrayerModule(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		if (!UUID.test(courseId)) return refus(404, 'sessionGone');
		return withSessionOrg(context, async (tx) => {
			// `kind = 'jumua'` dans la clause : cet écran ne peut pas supprimer un cours, même si
			// quelqu'un lui envoyait l'identifiant d'un cours. Une session déjà supprimée, par un autre
			// onglet ou une autre personne, n'écrit rien au journal.
			const supprimee = lignes<{ id: string }>(
				await tx.execute(sql`
					delete from "course"
					where "id" = ${courseId} and "kind" = 'jumua'
						and "organization_id" = (select jadwal.current_org_id())
					returning "id"
				`)
			);
			if (supprimee.length === 0) return refus(404, 'sessionGone');
			await record(tx, context.organizationId, context.userId, {
				action: 'course.delete',
				targetTable: 'course',
				targetId: courseId
			});
			return fait('deleted');
		});
	},

	/** Annuler une session ce vendredi-là. Les autres vendredis ne changent pas. */
	annuler: async (event) => {
		const context = await mustHavePrayerModule(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		const date = String(form.get('date') ?? '');
		if (!isSupportedDate(date)) return refus(400, 'dateUnreadable');
		const maintenant = new Date();
		return withSessionOrg(context, async (tx) => {
			if (!(await sessionExiste(tx, courseId))) return refus(404, 'sessionGone');
			// La règle d'« À venir » : aucune carte ne propose un jour passé, mais la page d'une
			// semaine d'avant restée ouverte, ou un formulaire écrit à la main, peut l'envoyer. Deux
			// dates civiles au même format se comparent comme des chaînes.
			const settings = await readSettings(tx);
			if (date < todayInZone(settings.time_zone, maintenant)) return refus(400, 'pastSession');
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
		if (!isSupportedDate(date) || !isSupportedDate(toDate)) return refus(400, 'dateUnreadable');
		if (!isLocalTime(toStart)) return refus(400, 'timeUnreadable');
		const maintenant = new Date();
		return withSessionOrg(context, async (tx) => {
			if (!(await sessionExiste(tx, courseId))) return refus(404, 'sessionGone');
			// Une session déjà annulée ou déplacée ce jour-là n'a rien à corriger, quel que soit le jour
			// choisi : ce refus passe avant les autres, comme sur « À venir » (étape 19, lot 2). Un envoi
			// arrivé au même instant est encore refusé par l'écriture, plus bas.
			if ((await currentChange(tx, courseId, date)) !== null) return refus(409, 'changed');
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
			// Un jour déjà passé. La liste des jours commence aujourd'hui, mais un formulaire écrit à la
			// main, ou la page d'une semaine d'avant restée ouverte, peut en envoyer un : « À venir » le
			// refusait, et cet écran l'écrivait (étape 19, lot 2). Deux dates civiles au même format se
			// comparent comme des chaînes.
			const settings = await readSettings(tx);
			if (toDate < todayInZone(settings.time_zone, maintenant)) return refus(400, 'pastDate');
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

	/**
	 * Rétablir une session annulée ou déplacée ce jour-là. Une session inconnue, ou un cours, reçoit
	 * la réponse d'une session qui n'existe plus, et rien ne s'écrit, pas même le journal. Une session
	 * qui n'a plus rien à rétablir ce jour-là, parce qu'une page restée ouverte ou une autre personne
	 * l'a déjà fait, est refusée de même : l'action répondait « fait » et l'écrivait au journal
	 * (relecture de D2). La ligne envoie ce qu'elle montrait : une session rétablie puis changée de
	 * nouveau ailleurs depuis l'ouverture de la page garde ce nouveau changement, et la ligne est
	 * refusée comme une carte périmée (étape 19, lot 2).
	 */
	retablir: async (event) => {
		const context = await mustHavePrayerModule(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		const date = String(form.get('date') ?? '');
		if (!isSupportedDate(date)) return refus(400, 'dateUnreadable');
		return withSessionOrg(context, async (tx) => {
			if (!(await sessionExiste(tx, courseId))) return refus(404, 'sessionGone');
			const retablie = await restore(tx, courseId, date, shownChange(form));
			if (retablie !== 'restored') return refus(409, retablie);
			await record(tx, context.organizationId, context.userId, {
				action: 'exception.restore',
				targetTable: 'session_exception',
				targetId: courseId,
				before: { date }
			});
			return fait('restored');
		});
	}
};

/** Le type d'une date ISO, pour le typage du tableau ci-dessus. */
export type JourDeDeplacement = IsoDate;

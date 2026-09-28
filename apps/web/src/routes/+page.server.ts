// À venir : les sept prochains jours, séance par séance (étape 4, écran d'accueil).
//
// Les séances ne sont pas calculées ici : `readProgramme` les demande à `@jadwal/core`, qui est la
// seule vérité du projet sur les rythmes, les exceptions et les pauses. Un nombre fixe de requêtes
// pour tout l'écran, quel que soit le nombre de cours.
//
// Depuis l'étape 18, l'écran parle la langue de l'espace, et ses actions rendent le nom d'une erreur,
// jamais sa phrase (`$lib/i18n/upcoming.ts`). Les messages prêts à coller s'écrivent dans chacune des
// langues que l'organisation publie, la langue source d'abord (retour D1) ; une session du vendredi
// qui porte le nom proposé par le service s'y nomme dans la langue du message, comme dans ceux de
// l'écran Partager (`friday-title.ts`). Une séance se déplace à toute date à partir d'aujourd'hui,
// plus tôt comme plus tard que sa date prévue (retour A2) : c'est l'action qui refuse une date
// passée, et non le seul champ du navigateur, qu'un formulaire envoyé à la main contourne. Elle
// refuse aussi un déplacement qui ne change rien, la même date à l'heure où la séance est déjà
// prévue.
//
// Annuler et déplacer ne visent qu'une séance encore prévue telle quelle. Une page restée ouverte
// (Retour, un autre onglet, une autre personne) montre encore la carte d'une séance annulée ou
// déplacée depuis ; l'envoyer défaisait ce changement, en écrivant par exemple un déplacement de la
// séance vers elle-même. Les deux actions le refusent, n'écrivent rien, et l'écran rendu est à jour.
// La carte d'un déplacement envoie aussi l'heure qu'elle montrait : quand l'heure du cours a changé
// depuis dans sa fiche, l'action la refuse, au lieu de déplacer la séance à l'ancienne heure
// (relecture du lot 5), et la carte rouverte propose l'heure actuelle, sauf une heure tapée.
// Annuler refuse une séance dont la date est passée ; rétablir répond à un cours inconnu comme les
// autres actions.
//
// Étape 19 (D4, et les décisions du chef de projet) :
// - le programme de la semaine est celui de Partager : les cours publiés seulement. L'écran, lui,
//   montre aussi les brouillons, et leur carte le dit. Une session du vendredi en brouillon ne
//   donne pas son heure au Dhuhr (`readProgramme`) : un cours prévu après le Dhuhr a la même heure
//   sur sa carte, dans le programme de la semaine et dans le message d'un déplacement ;
// - le titre d'une carte est celui de la langue de l'écran quand le cours y est traduit, sinon celui
//   de sa langue source, comme avant ;
// - le refus d'une carte périmée nomme la séance, par son titre et sa date ;
// - la seconde annulation d'une même séance, par une autre personne ou depuis une page restée
//   ouverte, n'écrit rien, mais rend le message prêt à coller : la personne ne sait pas si la
//   communauté a déjà été prévenue ;
// - une session du vendredi a ses propres mots dans les messages (`messages.ts`) ;
// - rétablir une séance qui n'a plus rien à rétablir est refusé, et n'écrit rien au journal
//   (relecture de D2) ;
// - une date envoyée s'accepte de 1970 à 2100 (`isSupportedDate`) : l'an 0000, que PostgreSQL n'a
//   pas, donnait une erreur 500 à Déplacer et à Rétablir (relecture de D2) ;
// - la carte « Rétablir » envoie ce qu'elle montrait, comme celle d'un déplacement envoie son heure :
//   une séance rétablie puis changée de nouveau par une autre personne garde ce changement, et la
//   carte périmée est refusée (lot 2, `$lib/server/exceptions.ts`) ;
// - annuler ou déplacer une séance un jour où le cours n'en a pas est refusé (`notPlanned`), et
//   n'écrit rien : l'action acceptait toute date à partir d'aujourd'hui, et gardait une exception qui
//   ne tombe sur aucune séance. Les séances comptent comme l'écran les montre (`seanceOn`), ce jour-là
//   qu'il soit dans les sept jours ou non. Une séance arrivée d'un autre jour ne s'annule ni ne se
//   déplace sous ce jour-là, où le calcul ignorerait l'exception : l'envoi reçoit le refus d'une
//   carte périmée (lot 3).
//
// Étape 20 (C2, décision du chef de projet) : « Rétablir » vers une date prévue déjà passée est
// refusé (`pastOrigin`), et n'écrit rien. La carte d'une séance déplacée dont la date prévue est
// passée n'a donc plus « Rétablir », mais « Annuler cette séance » (`annulerDeplacee`), qui l'annule
// à sa nouvelle date et rend le message à copier, avec cette date et cette heure ; une carte déplacée
// dont la date prévue est aujourd'hui ou plus tard garde « Rétablir » seul. Déplacer une séance dont
// la date prévue est passée est refusé, comme l'annuler (`pastSession`).

import { fail } from '@sveltejs/kit';
import { todayInZone } from '@jadwal/core';
import { newId, sql, type Transaction } from '@jadwal/db';
import { type Langue } from '$lib/i18n.js';
import type { NamedUpcomingError, UpcomingError } from '$lib/i18n/upcoming.js';
import { record } from '$lib/server/audit.js';
import {
	cancellationMessages,
	messageLanguages,
	readCourse,
	type Message
} from '$lib/server/change-messages.js';
import { withSessionOrg } from '$lib/server/context.js';
import { isSupportedDate, LAST_SUPPORTED_DATE } from '$lib/server/dates.js';
import { cancelMoved, currentChange, restore, shownChange } from '$lib/server/exceptions.js';
import { fridayTitle } from '$lib/server/friday-title.js';
import { mustBeInOrganisation } from '$lib/server/guard.js';
import { etatDesSources, readReglages } from '$lib/server/prieres.js';
import { readProgramme, readSettings, seanceOn } from '$lib/server/programme.js';
import { lireAudience } from '$lib/server/vues.js';
import { moveMessage, weekMessage } from '$lib/messages.js';
import type { Actions, PageServerLoad } from './$types.js';

/** Sept jours : la semaine qui vient, celle dont on parle dans un message. */
const JOURS_AFFICHES = 7;
/** Une heure du jour, de 00:00 à 23:59 : ce que la base accepte pour la nouvelle heure. */
const HEURE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
/** L'heure que le champ « Heure de début » propose pour une séance sans heure (`+page.svelte`). */
const HEURE_PROPOSEE = '19:00';

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

/**
 * Les titres des cours de l'organisation, par cours puis par langue. Le filtre sur le contexte est
 * écrit ici, comme dans `readSettings` : il ne dépend pas de la seule politique de lecture.
 */
async function readTitles(tx: Transaction): Promise<Map<string, Map<string, string>>> {
	const titles = new Map<string, Map<string, string>>();
	for (const row of rows<{ course_id: string; language: string; title: string }>(
		await tx.execute(sql`
			select "course_id", "language", "title" from "course_translation"
			where "organization_id" = (select jadwal.current_org_id())
		`)
	)) {
		const course = titles.get(row.course_id) ?? new Map<string, string>();
		course.set(row.language, row.title);
		titles.set(row.course_id, course);
	}
	return titles;
}

/**
 * La séance d'un cours un jour donné, telle que l'écran l'affiche : le calcul de `@jadwal/core`, par
 * `readProgramme`, et non une valeur renvoyée par le formulaire. Rien quand la séance n'est pas
 * prévue ce jour-là dans les sept jours de l'écran. Son heure, celle que le champ « Heure de début »
 * propose, est `null` quand elle est inconnue : le champ propose alors 19:00, et l'accepter lui
 * donne une heure.
 */
async function plannedSeance(
	tx: Transaction,
	now: Date,
	courseId: string,
	date: string
): Promise<{ start: string | null } | null> {
	const { seances } = await readProgramme(tx, now, JOURS_AFFICHES);
	const seance = seances.find(
		(candidate) =>
			candidate.courseId === courseId && candidate.date === date && candidate.status === 'scheduled'
	);
	return seance ? { start: seance.start ?? null } : null;
}

/**
 * Un refus, avec ce que l'écran doit retrouver : la séance, pour rouvrir ses options sur l'erreur, et
 * ce qui avait été saisi, pour le corriger sans tout refaire. `toStart: null` : l'heure envoyée n'a
 * pas été choisie, et la carte rouverte propose l'heure de la séance. `title` : le titre de la
 * séance, dans la langue de l'écran, pour les refus qui la nomment ; `messages` : le message qu'une
 * seconde annulation donne quand même.
 */
function refuse(
	error: UpcomingError,
	fields: {
		courseId: string;
		date: string;
		toDate?: string;
		toStart?: string | null;
		title?: string;
		messages?: Message[];
	},
	status = 400
) {
	return fail(status, {
		error,
		courseId: fields.courseId,
		date: fields.date,
		toDate: fields.toDate ?? '',
		toStart: fields.toStart === undefined ? '' : fields.toStart,
		title: fields.title ?? '',
		messages: fields.messages
	});
}

/**
 * Le refus d'une carte périmée : il nomme la séance, par son titre dans la langue de l'écran et par
 * sa date (étape 19, D4). Le statut est 409 : la séance a changé depuis l'ouverture de la page.
 */
function refuseStale(
	error: Exclude<NamedUpcomingError, 'notPlanned' | 'pastOrigin'>,
	course: { title: (language: Langue) => string },
	language: Langue,
	fields: Parameters<typeof refuse>[1]
) {
	return refuse(error, { ...fields, title: course.title(language) }, 409);
}

export const load: PageServerLoad = async (event) => {
	const context = await mustBeInOrganisation(event);
	const maintenant = new Date();
	/** La langue de l'écran, que le hook a calculée : le titre d'une carte la suit. */
	const langue: Langue = event.locals.langue ?? 'fr';
	// Une seule transaction pour tout l'écran : le programme, les chiffres d'audience, l'état des deux
	// sources d'heures de prière et les titres traduits.
	const { programme, audience, prieres, titles } = await withSessionOrg(context, async (tx) => {
		const programme = await readProgramme(tx, maintenant, JOURS_AFFICHES);
		const today = programme.today;
		return {
			programme,
			audience: await lireAudience(tx, today),
			prieres: await etatDesSources(tx, context.organizationId, await readReglages(tx), today),
			titles: await readTitles(tx)
		};
	});
	const settings = programme.settings;
	const kinds = new Map(programme.courses.map((course) => [course.id, course.kind]));
	const statuses = new Map(programme.courses.map((course) => [course.id, course.status]));
	/**
	 * Les séances du programme de la semaine : celles des cours publiés, comme dans Partager (étape
	 * 19, D4). Une session du vendredi en brouillon ne donne pas son heure au Dhuhr (`readProgramme`) :
	 * les séances qui restent ont l'heure que Partager et la page publique leur donnent.
	 */
	const publiees = programme.seances.filter(
		(seance) => statuses.get(seance.courseId) === 'published'
	);
	/**
	 * Le titre d'une séance dans une langue : celui de cette langue quand le cours y est traduit,
	 * comme sur la page publique, sinon celui de sa langue source ; une session du vendredi au nom
	 * proposé prend celui de la prière dans cette langue.
	 */
	const titleIn = (seance: { courseId: string; title: string }, language: Langue) =>
		fridayTitle(
			titles.get(seance.courseId)?.get(language) ?? seance.title,
			kinds.get(seance.courseId) ?? 'course',
			language
		);
	const seances = programme.seances.map((seance) => ({
		courseId: seance.courseId,
		date: seance.date,
		start: seance.start,
		end: seance.end,
		anchor: seance.anchor,
		status: seance.status,
		originalDate: seance.originalDate,
		movedTo: seance.movedTo,
		/** L'exception que « Rétablir la séance » défait, qu'il envoie (reprise du lot 2). */
		exceptionId: seance.exceptionId,
		// Le titre de la carte suit la langue de l'écran (décision du chef de projet, étape 19).
		title: titleIn(seance, langue),
		/** Un cours en brouillon : sa carte le dit, et le programme de la semaine ne le montre pas. */
		draft: statuses.get(seance.courseId) === 'draft',
		room: seance.room,
		teacher: seance.teacher,
		audience: seance.audience
	}));
	// Le programme de la semaine, une fois par langue publiée, la langue par défaut d'abord, dans la
	// langue de chaque message.
	const weekMessages: Message[] = messageLanguages(
		settings.enabled_language,
		settings.default_language
	).map((language) => ({
		language,
		text: weekMessage(
			settings.greeting,
			settings.name,
			publiees.map((seance) => ({
				date: seance.date,
				title: titleIn(seance, language),
				start: seance.start,
				end: seance.end,
				room: seance.room,
				anchor: seance.anchor,
				status: seance.status,
				originalDate: seance.originalDate
			})),
			language
		)
	}));
	return {
		organisation: { name: settings.name, slug: settings.slug, greeting: settings.greeting },
		role: context.role,
		asSuperAdmin: context.asSuperAdmin,
		/** L'écran des prières est réservé aux responsables, et n'existe qu'avec son module. */
		canSetPrayers: context.role !== 'editor' && settings.prayer_module,
		today: programme.today,
		/** La dernière date que Déplacer accepte : la borne du champ « Nouvelle date ». */
		lastDate: LAST_SUPPORTED_DATE,
		from: programme.from,
		to: programme.to,
		seances,
		audience,
		prieres: {
			...prieres,
			/**
			 * Les séances de la semaine qui s'annoncent sans heure faute d'heure de prière connue. Zéro
			 * dès qu'une source couvre la semaine : c'est ce nombre, et non l'absence de réglage, qui
			 * décide d'afficher l'invitation. Un import qui couvre l'année n'a pas besoin de position.
			 */
			seancesSansHeure: seances.filter((seance) => seance.anchor && !seance.start).length
		},
		weekMessages
	};
};

export const actions: Actions = {
	/** Annuler une séance. Le cours continue les autres semaines : l'écran le rappelle avant. */
	annuler: async (event) => {
		const context = await mustBeInOrganisation(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		const date = String(form.get('date') ?? '');
		if (!isSupportedDate(date)) return refuse('unreadableDate', { courseId, date });
		const now = new Date();
		const langue: Langue = event.locals.langue ?? 'fr';
		return withSessionOrg(context, async (tx) => {
			const course = await readCourse(tx, courseId);
			if (!course) return refuse('sessionGone', { courseId, date }, 404);
			const settings = await readSettings(tx);
			// Aucune carte ne propose une date passée, mais une page ouverte la veille, ou un formulaire
			// écrit à la main, peut l'envoyer. Deux dates civiles au même format se comparent comme des
			// chaînes.
			if (date < todayInZone(settings.time_zone, now)) {
				return refuse('pastSession', { courseId, date });
			}
			// Un jour où le cours n'a pas de séance, ou n'a qu'une séance arrivée d'un autre jour :
			// aucune carte ne l'envoie, et l'exception écrite ne tomberait sur aucune séance (lot 3).
			const seance = await seanceOn(tx, now, courseId, date);
			if (seance === 'none') {
				return refuse('notPlanned', { courseId, date, title: course.title(langue) });
			}
			if (seance === 'elsewhere') return refuseStale('changed', course, langue, { courseId, date });
			// Une séance déjà annulée ou déplacée garde ce qui lui est arrivé : l'annulation ne
			// s'écrit que si la place est libre, et rien ne s'écrit sinon, pas même le journal.
			const written = rows<{ id: string }>(
				await tx.execute(sql`
					insert into "session_exception"
						("id", "organization_id", "course_id", "date", "kind", "created_by")
					values (${newId()}, ${context.organizationId}, ${courseId}, ${date}, 'cancelled',
						${context.userId})
					on conflict ("course_id", "date") do nothing
					returning "id"
				`)
			);
			if (written.length === 0) {
				// Déjà annulée, par une autre personne ou depuis une page restée ouverte : c'est ce que
				// la personne voulait. Rien ne s'écrit, mais elle reçoit le message, puisqu'elle ne sait
				// pas si la communauté a déjà été prévenue (étape 19, D4). Une séance déplacée depuis
				// n'a pas de message d'annulation.
				if ((await currentChange(tx, courseId, date)) === 'cancelled') {
					return refuseStale('alreadyCancelled', course, langue, {
						courseId,
						date,
						messages: cancellationMessages(settings, course, date)
					});
				}
				return refuseStale('changed', course, langue, { courseId, date });
			}
			await record(tx, context.organizationId, context.userId, {
				action: 'exception.cancel',
				targetTable: 'session_exception',
				targetId: courseId,
				after: { date, kind: 'cancelled' }
			});
			return { done: 'cancelled' as const, messages: cancellationMessages(settings, course, date) };
		});
	},

	/**
	 * Déplacer une séance : nouvelle date et nouvelle heure, les deux obligatoires. Toute date à partir
	 * d'aujourd'hui, dans le fuseau de l'organisation, plus tôt comme plus tard que la date prévue. Le
	 * même jour à une autre heure est un déplacement, que le message dit comme un changement d'heure ;
	 * le même jour à la même heure n'en est pas un.
	 */
	deplacer: async (event) => {
		const context = await mustBeInOrganisation(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		const date = String(form.get('date') ?? '');
		const toDate = String(form.get('toDate') ?? '');
		const toStart = String(form.get('toStart') ?? '');
		const fields = { courseId, date, toDate, toStart };
		if (!isSupportedDate(date)) return refuse('unreadableDate', fields);
		if (!isSupportedDate(toDate)) return refuse('unreadableNewDate', fields);
		if (!HEURE.test(toStart)) return refuse('unreadableTime', fields);
		const now = new Date();
		const langue: Langue = event.locals.langue ?? 'fr';
		return withSessionOrg(context, async (tx) => {
			const course = await readCourse(tx, courseId);
			if (!course) return refuse('sessionGone', fields, 404);
			const settings = await readSettings(tx);
			const today = todayInZone(settings.time_zone, now);
			// Une séance dont la date prévue est passée ne se déplace pas, comme elle ne s'annule pas
			// (étape 20, C2) : aucune carte ne le propose, et le déplacement en ferait une séance
			// déplacée dont la date prévue est passée, que « Rétablir » ne ramène plus.
			if (date < today) return refuse('pastSession', fields);
			// Un jour où le cours n'a pas de séance : il n'y a rien à déplacer (lot 3).
			const onTheDay = await seanceOn(tx, now, courseId, date);
			if (onTheDay === 'none') {
				return refuse('notPlanned', { ...fields, title: course.title(langue) });
			}
			// Avant les autres refus : une carte restée ouverte sur une séance déjà annulée ou
			// déplacée n'a rien à corriger, quelle que soit la date choisie. Une séance arrivée d'un
			// autre jour se rétablit, et ne se déplace pas sous ce jour-là, où le calcul ignorerait
			// l'exception (lot 3).
			if (onTheDay === 'elsewhere' || (await currentChange(tx, courseId, date)) !== null) {
				return refuseStale('changed', course, langue, fields);
			}
			const seance = await plannedSeance(tx, now, courseId, date);
			// La carte envoie l'heure qu'elle montrait (`plannedStart`, vide pour une séance sans
			// heure). Quand la séance n'est plus prévue à cette heure-là, l'heure du cours a changé
			// depuis l'ouverture de la page : la carte est périmée, quelle que soit la date choisie.
			// Un formulaire sans ce champ, ou une séance absente des sept jours de l'écran, n'est pas
			// comparé.
			const shown = form.get('plannedStart');
			if (shown !== null && seance && (seance.start ?? '') !== String(shown)) {
				// Une heure envoyée telle que la carte la proposait est l'ancienne heure du cours, que la
				// personne n'a pas choisie : elle ne revient pas dans la carte rouverte, qui propose
				// l'heure actuelle. Renvoyée telle quelle, elle déplaçait la séance à l'ancienne heure.
				const typed = toStart !== (String(shown) || HEURE_PROPOSEE);
				return refuseStale('timeChanged', course, langue, {
					...fields,
					toStart: typed ? toStart : null
				});
			}
			// Deux dates civiles au même format se comparent comme des chaînes.
			if (toDate < today) return refuse('pastDate', fields);
			// Le champ s'ouvre sur la date prévue et l'heure habituelle. Les renvoyer tels quels ne
			// déplace rien : l'accepter écrivait une exception vers la séance elle-même, affichée deux
			// fois le même jour, et un message « déplacé du mercredi au mercredi » pour la communauté.
			// Le même jour, l'heure prévue sert aussi au message, qui dit un changement d'heure.
			const planned = toDate === date ? (seance?.start ?? null) : null;
			if (toDate === date && planned === toStart) return refuse('unchanged', fields);
			// Un autre envoi arrivé entre la vérification et cette ligne garde la main : rien n'est
			// écrasé, et celui-ci est refusé de la même façon.
			const written = rows<{ id: string }>(
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
			if (written.length === 0) return refuseStale('changed', course, langue, fields);
			await record(tx, context.organizationId, context.userId, {
				action: 'exception.move',
				targetTable: 'session_exception',
				targetId: courseId,
				after: { date, toDate, toStart }
			});
			const messages: Message[] = messageLanguages(settings.enabled_language, course.source).map(
				(language) => ({
					language,
					text: moveMessage(
						settings.greeting,
						course.title(language),
						date,
						toDate,
						toStart,
						language,
						planned,
						course.kind
					)
				})
			);
			return { done: 'moved' as const, messages };
		});
	},

	/**
	 * Rétablir une séance annulée ou déplacée : l'exception disparaît, le rythme reprend. Un cours
	 * inconnu, ou d'une autre organisation, reçoit la réponse d'un cours inconnu, et rien ne s'écrit,
	 * pas même le journal. Une séance qui n'a plus rien à rétablir, parce qu'une autre personne ou une
	 * page restée ouverte l'a déjà fait, est refusée de même : l'action répondait « rétablie » et
	 * l'écrivait au journal (étape 19, relecture de D2). La carte envoie ce qu'elle montrait : une
	 * séance rétablie puis changée de nouveau ailleurs depuis l'ouverture de la page garde ce nouveau
	 * changement, et la carte reçoit le refus nommé des cartes périmées (étape 19, lot 2).
	 *
	 * Une date prévue déjà passée est refusée, et rien ne s'écrit, pas même le journal (étape 20,
	 * C2) : la séance y serait revenue, et aurait disparu de l'écran et de la page publique sans
	 * message à envoyer. La carte d'une séance déplacée dont la date prévue est passée propose
	 * « Annuler cette séance » à la place (`annulerDeplacee`).
	 */
	retablir: async (event) => {
		const context = await mustBeInOrganisation(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		const date = String(form.get('date') ?? '');
		if (!isSupportedDate(date)) return refuse('unreadableDate', { courseId, date });
		const now = new Date();
		const langue: Langue = event.locals.langue ?? 'fr';
		return withSessionOrg(context, async (tx) => {
			const course = await readCourse(tx, courseId);
			if (!course) return refuse('sessionGone', { courseId, date }, 404);
			const settings = await readSettings(tx);
			if (date < todayInZone(settings.time_zone, now)) {
				return refuse('pastOrigin', { courseId, date, title: course.title(langue) });
			}
			const restored = await restore(tx, courseId, date, shownChange(form));
			if (restored !== 'restored') {
				return refuseStale(restored, course, langue, { courseId, date });
			}
			await record(tx, context.organizationId, context.userId, {
				action: 'exception.restore',
				targetTable: 'session_exception',
				targetId: courseId,
				before: { date }
			});
			return { done: 'restored' as const };
		});
	},

	/**
	 * Annuler une séance déplacée dont la date prévue est passée, à sa nouvelle date (étape 20, C2,
	 * décision du chef de projet). Un nom distinct d'`annuler` : celle-ci vise une séance du rythme,
	 * encore prévue, sous sa date ; celle-là, une séance arrivée d'un autre jour, sous sa date prévue.
	 *
	 * La carte envoie ce qu'elle montrait, comme « Rétablir » : l'exception, le jour et l'heure
	 * d'arrivée. Le déplacement est remplacé par une annulation qui les garde (`cancelMoved`) : la
	 * séance reste sur sa nouvelle date, annulée, sur cet écran, sur la page publique et dans le
	 * programme de la semaine, et le flux agenda la retire. Refusé, sans rien écrire : une date prévue
	 * qui n'est pas passée (sa carte a « Rétablir »), une nouvelle date passée, comme toute
	 * annulation, et une carte périmée. La seconde demande reçoit, comme toute seconde annulation, le
	 * message quand même (étape 19, D4). Le message nomme la nouvelle date et la nouvelle heure.
	 */
	annulerDeplacee: async (event) => {
		const context = await mustBeInOrganisation(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		const date = String(form.get('date') ?? '');
		const shown = shownChange(form);
		if (
			!isSupportedDate(date) ||
			shown === null ||
			!isSupportedDate(shown.toDate) ||
			!HEURE.test(shown.toStart)
		) {
			return refuse('unreadableDate', { courseId, date });
		}
		const toDate = shown.toDate;
		const now = new Date();
		const langue: Langue = event.locals.langue ?? 'fr';
		return withSessionOrg(context, async (tx) => {
			const course = await readCourse(tx, courseId);
			if (!course) return refuse('sessionGone', { courseId, date: toDate }, 404);
			const settings = await readSettings(tx);
			const today = todayInZone(settings.time_zone, now);
			if (date >= today) return refuse('originNotPast', { courseId, date: toDate });
			if (toDate < today) return refuse('pastSession', { courseId, date: toDate });
			const messages = cancellationMessages(settings, course, toDate, shown.toStart);
			const cancelled = await cancelMoved(
				tx,
				{ organizationId: context.organizationId, userId: context.userId, courseId, date },
				shown
			);
			if (cancelled === 'alreadyCancelled') {
				return refuseStale('alreadyCancelled', course, langue, {
					courseId,
					date: toDate,
					messages
				});
			}
			if (cancelled === 'changed') {
				return refuseStale('changed', course, langue, { courseId, date: toDate });
			}
			const moved = { toDate, toStart: shown.toStart };
			await record(tx, context.organizationId, context.userId, {
				action: 'exception.cancel',
				targetTable: 'session_exception',
				targetId: courseId,
				before: { date, kind: 'moved', ...moved },
				after: { date, kind: 'cancelled', ...moved }
			});
			return { done: 'cancelled' as const, messages };
		});
	}
};

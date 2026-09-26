// À venir : les sept prochains jours, séance par séance (étape 4, écran d'accueil).
//
// Les séances ne sont pas calculées ici : `readProgramme` les demande à `@jadwal/core`, qui est la
// seule vérité du projet sur les rythmes, les exceptions et les pauses. Un nombre fixe de requêtes
// pour tout l'écran, quel que soit le nombre de cours.
//
// Depuis l'étape 18, l'écran parle la langue de l'espace, et ses actions rendent le nom d'une erreur,
// jamais sa phrase (`$lib/i18n/upcoming.ts`). Les messages prêts à coller s'écrivent dans chacune des
// langues que l'organisation publie, la langue source d'abord (retour D1). Une séance se déplace à
// toute date à partir d'aujourd'hui, plus tôt comme plus tard que sa date prévue (retour A2) : c'est
// l'action qui refuse une date passée, et non le seul champ du navigateur, qu'un formulaire envoyé à
// la main contourne.

import { fail } from '@sveltejs/kit';
import { isIsoDate, todayInZone } from '@jadwal/core';
import { newId, sql, type Transaction } from '@jadwal/db';
import { LANGUES, type Langue } from '$lib/i18n.js';
import type { UpcomingError } from '$lib/i18n/upcoming.js';
import { record } from '$lib/server/audit.js';
import { withSessionOrg } from '$lib/server/context.js';
import { mustBeInOrganisation } from '$lib/server/guard.js';
import { etatDesSources, readReglages } from '$lib/server/prieres.js';
import { readProgramme, readSettings } from '$lib/server/programme.js';
import { lireAudience } from '$lib/server/vues.js';
import { cancellationMessage, moveMessage, weekMessage } from '$lib/messages.js';
import type { Actions, PageServerLoad } from './$types.js';

/** Sept jours : la semaine qui vient, celle dont on parle dans un message. */
const JOURS_AFFICHES = 7;
/** Une heure du jour, de 00:00 à 23:59 : ce que la base accepte pour la nouvelle heure. */
const HEURE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
/** Un identifiant de cours. Autre chose n'atteint pas la base, qui le refuserait en erreur. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un message prêt à coller, dans une langue. */
interface Message {
	language: Langue;
	text: string;
}

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

/**
 * Les langues des messages : celles que l'organisation publie, dans l'ordre du service, et `first`
 * devant elles quand elle en fait partie (retour D1). La base exige au moins une langue publiée ; le
 * français ne sert que si aucune n'est une langue du service.
 */
function messageLanguages(published: readonly string[], first: string): Langue[] {
	const languages = LANGUES.filter((language) => published.includes(language));
	const head = languages.find((language) => language === first) ?? languages[0] ?? 'fr';
	return [head, ...languages.filter((language) => language !== head)];
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
 * Le cours d'une séance visée par une action : sa langue source, et son titre dans une langue, ou
 * dans sa langue source quand il n'y est pas traduit. Rien si le cours n'existe pas, ou plus.
 */
async function readCourse(
	tx: Transaction,
	courseId: string
): Promise<{ source: string; title: (language: Langue) => string } | null> {
	if (!UUID.test(courseId)) return null;
	const found = rows<{ source_language: string; language: string | null; title: string | null }>(
		await tx.execute(sql`
			select c."source_language", t."language", t."title"
			from "course" c
			left join "course_translation" t on t."course_id" = c."id"
			where c."id" = ${courseId} and c."organization_id" = (select jadwal.current_org_id())
		`)
	);
	const source = found[0]?.source_language;
	if (source === undefined) return null;
	const titles = new Map(found.map((row) => [row.language, row.title ?? '']));
	const fallback = titles.get(source) ?? found.find((row) => row.title)?.title ?? '';
	return { source, title: (language) => titles.get(language) ?? fallback };
}

/**
 * Un refus, avec ce que l'écran doit retrouver : la séance, pour rouvrir ses options sur l'erreur, et
 * ce qui avait été saisi, pour le corriger sans tout refaire.
 */
function refuse(
	error: UpcomingError,
	fields: { courseId: string; date: string; toDate?: string; toStart?: string },
	status = 400
) {
	return fail(status, {
		error,
		courseId: fields.courseId,
		date: fields.date,
		toDate: fields.toDate ?? '',
		toStart: fields.toStart ?? ''
	});
}

export const load: PageServerLoad = async (event) => {
	const context = await mustBeInOrganisation(event);
	const maintenant = new Date();
	// Une seule transaction pour tout l'écran : le programme, les chiffres d'audience, l'état des
	// deux sources d'heures de prière et les titres traduits des messages.
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
	const seances = programme.seances.map((seance) => ({
		courseId: seance.courseId,
		date: seance.date,
		start: seance.start,
		end: seance.end,
		anchor: seance.anchor,
		status: seance.status,
		originalDate: seance.originalDate,
		movedTo: seance.movedTo,
		title: seance.title,
		room: seance.room,
		teacher: seance.teacher,
		audience: seance.audience
	}));
	// Le programme de la semaine, une fois par langue publiée, la langue par défaut d'abord. Le titre
	// d'un cours est celui de la langue du message quand il y est traduit, comme sur la page publique.
	const weekMessages: Message[] = messageLanguages(
		settings.enabled_language,
		settings.default_language
	).map((language) => ({
		language,
		text: weekMessage(
			settings.greeting,
			settings.name,
			seances.map((seance) => ({
				date: seance.date,
				title: titles.get(seance.courseId)?.get(language) ?? seance.title,
				start: seance.start,
				end: seance.end,
				room: seance.room,
				anchor: seance.anchor,
				status: seance.status
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
		if (!isIsoDate(date)) return refuse('unreadableDate', { courseId, date });
		return withSessionOrg(context, async (tx) => {
			const course = await readCourse(tx, courseId);
			if (!course) return refuse('sessionGone', { courseId, date }, 404);
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
			const settings = await readSettings(tx);
			// Le message d'une séance, dans chaque langue publiée, la langue du cours d'abord.
			const messages: Message[] = messageLanguages(settings.enabled_language, course.source).map(
				(language) => ({
					language,
					text: cancellationMessage(settings.greeting, course.title(language), date, language)
				})
			);
			return { done: 'cancelled' as const, messages };
		});
	},

	/**
	 * Déplacer une séance : nouvelle date et nouvelle heure, les deux obligatoires. Toute date à partir
	 * d'aujourd'hui, dans le fuseau de l'organisation, plus tôt comme plus tard que la date prévue.
	 */
	deplacer: async (event) => {
		const context = await mustBeInOrganisation(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		const date = String(form.get('date') ?? '');
		const toDate = String(form.get('toDate') ?? '');
		const toStart = String(form.get('toStart') ?? '');
		const fields = { courseId, date, toDate, toStart };
		if (!isIsoDate(date)) return refuse('unreadableDate', fields);
		if (!isIsoDate(toDate)) return refuse('unreadableNewDate', fields);
		if (!HEURE.test(toStart)) return refuse('unreadableTime', fields);
		return withSessionOrg(context, async (tx) => {
			const course = await readCourse(tx, courseId);
			if (!course) return refuse('sessionGone', fields, 404);
			const settings = await readSettings(tx);
			// Deux dates civiles au même format se comparent comme des chaînes.
			if (toDate < todayInZone(settings.time_zone, new Date())) {
				return refuse('pastDate', fields);
			}
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
			const messages: Message[] = messageLanguages(settings.enabled_language, course.source).map(
				(language) => ({
					language,
					text: moveMessage(
						settings.greeting,
						course.title(language),
						date,
						toDate,
						toStart,
						language
					)
				})
			);
			return { done: 'moved' as const, messages };
		});
	},

	/** Rétablir une séance annulée ou déplacée : l'exception disparaît, le rythme reprend. */
	retablir: async (event) => {
		const context = await mustBeInOrganisation(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		const date = String(form.get('date') ?? '');
		if (!isIsoDate(date)) return refuse('unreadableDate', { courseId, date });
		if (!UUID.test(courseId)) return refuse('sessionGone', { courseId, date }, 404);
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
		return { done: 'restored' as const };
	}
};

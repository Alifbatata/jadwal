// À venir : les sept prochains jours, séance par séance (étape 4, écran d'accueil).
//
// Les séances ne sont pas calculées ici : `readProgramme` les demande à `@jadwal/core`, qui est la
// seule vérité du projet sur les rythmes, les exceptions et les pauses. Cinq requêtes pour tout
// l'écran, quel que soit le nombre de cours.

import { fail } from '@sveltejs/kit';
import { todayInZone, type IsoDate } from '@jadwal/core';
import { newId, sql } from '@jadwal/db';
import { record } from '$lib/server/audit.js';
import { withSessionOrg } from '$lib/server/context.js';
import { mustBeInOrganisation } from '$lib/server/guard.js';
import { etatDesSources, readReglages } from '$lib/server/prieres.js';
import { readProgramme } from '$lib/server/programme.js';
import { lireAudience } from '$lib/server/vues.js';
import { cancellationMessage, moveMessage, weekMessage } from '$lib/messages.js';
import type { Actions, PageServerLoad } from './$types.js';

/** Sept jours : la semaine qui vient, celle dont on parle dans un message. */
const JOURS_AFFICHES = 7;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^\d{2}:\d{2}$/;

export const load: PageServerLoad = async (event) => {
	const context = await mustBeInOrganisation(event);
	const maintenant = new Date();
	// Une seule transaction pour tout l'écran : le programme, les chiffres d'audience et l'état des
	// deux sources d'heures de prière. Trois lectures de plus, pas une connexion de plus.
	const { programme, audience, prieres } = await withSessionOrg(context, async (tx) => {
		const programme = await readProgramme(tx, maintenant, JOURS_AFFICHES);
		const today = todayInZone(programme.settings.time_zone, maintenant);
		return {
			programme,
			audience: await lireAudience(tx, today),
			prieres: await etatDesSources(tx, context.organizationId, await readReglages(tx), today)
		};
	});
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
	return {
		organisation: {
			name: programme.settings.name,
			slug: programme.settings.slug,
			greeting: programme.settings.greeting
		},
		role: context.role,
		asSuperAdmin: context.asSuperAdmin,
		from: programme.from,
		to: programme.to,
		seances,
		audience,
		prieres: {
			...prieres,
			/**
			 * Les séances de la semaine qui s'annoncent « après Maghrib » faute d'heure connue. Zéro
			 * dès qu'une source couvre la semaine : c'est ce nombre, et non l'absence de réglage, qui
			 * décide d'afficher l'invitation — un import qui couvre l'année n'a pas besoin de position.
			 */
			seancesSansHeure: seances.filter((seance) => seance.anchor && !seance.start).length
		},
		messageSemaine: weekMessage(
			programme.settings.greeting,
			programme.settings.name,
			seances.map((seance) => ({
				date: seance.date,
				title: seance.title,
				start: seance.start,
				end: seance.end,
				room: seance.room,
				anchor: seance.anchor,
				status: seance.status
			}))
		)
	};
};

export const actions: Actions = {
	/** Annuler une séance. Le cours continue les autres semaines : l'écran le rappelle avant. */
	annuler: async (event) => {
		const context = await mustBeInOrganisation(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		const date = String(form.get('date') ?? '');
		if (!DATE.test(date)) return fail(400, { erreur: 'Date illisible.' });
		const titre = String(form.get('title') ?? 'ce cours');
		const message = await withSessionOrg(context, async (tx) => {
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
			const settings = await tx.execute<{ greeting: string }>(
				// Filtré sur le contexte, et c'est la première barrière : pour le rôle applicatif, la
				// politique rend aussi les organisations qui invitent la personne (`readSettings`).
				sql`select "greeting" from "organization" where "id" = (select jadwal.current_org_id())`
			);
			const greeting =
				(Array.isArray(settings) ? (settings[0] as { greeting: string } | undefined) : undefined)
					?.greeting ?? 'Salam alaykoum';
			return cancellationMessage(greeting, titre, date as IsoDate);
		});
		return { message, fait: 'annulation' };
	},

	/** Déplacer une séance : nouvelle date et nouvelle heure, les deux obligatoires. */
	deplacer: async (event) => {
		const context = await mustBeInOrganisation(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		const date = String(form.get('date') ?? '');
		const toDate = String(form.get('toDate') ?? '');
		const toStart = String(form.get('toStart') ?? '');
		const titre = String(form.get('title') ?? 'ce cours');
		if (!DATE.test(date) || !DATE.test(toDate)) return fail(400, { erreur: 'Date illisible.' });
		if (!HEURE.test(toStart)) return fail(400, { erreur: 'Heure illisible.' });
		const message = await withSessionOrg(context, async (tx) => {
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
			const settings = await tx.execute<{ greeting: string }>(
				// Filtré sur le contexte, et c'est la première barrière : pour le rôle applicatif, la
				// politique rend aussi les organisations qui invitent la personne (`readSettings`).
				sql`select "greeting" from "organization" where "id" = (select jadwal.current_org_id())`
			);
			const greeting =
				(Array.isArray(settings) ? (settings[0] as { greeting: string } | undefined) : undefined)
					?.greeting ?? 'Salam alaykoum';
			return moveMessage(greeting, titre, date as IsoDate, toDate as IsoDate, toStart);
		});
		return { message, fait: 'deplacement' };
	},

	/** Rétablir une séance annulée ou déplacée : l'exception disparaît, le rythme reprend. */
	retablir: async (event) => {
		const context = await mustBeInOrganisation(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		const date = String(form.get('date') ?? '');
		if (!DATE.test(date)) return fail(400, { erreur: 'Date illisible.' });
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
		return { fait: 'retablissement' };
	}
};

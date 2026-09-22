// Cours : la liste, avec le rythme en clair, et les pauses de l'organisation.
//
// Une pause sans cours vaut pour toute l'organisation ; une pause rattachée à un cours n'en suspend
// qu'un (ADR 0011). Les deux se posent ici, parce que c'est ici qu'on a la liste sous les yeux.

import { fail } from '@sveltejs/kit';
import { newId, sql } from '@jadwal/db';
import { record } from '$lib/server/audit.js';
import { withSessionOrg } from '$lib/server/context.js';
import { mustBeInOrganisation } from '$lib/server/guard.js';
import { readCourses, readPauses, readSettings } from '$lib/server/programme.js';
import type { Actions, PageServerLoad } from './$types.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const load: PageServerLoad = async (event) => {
	const context = await mustBeInOrganisation(event);
	return withSessionOrg(context, async (tx) => {
		const settings = await readSettings(tx);
		// Les cours, et **eux seuls** : les sessions du vendredi ont leur propre écran, où une
		// organisation les trouve sans les chercher parmi vingt cours (ADR 0033).
		const courses = await readCourses(tx, ['draft', 'published', 'archived'], ['course']);
		const pauses = await readPauses(tx);
		const titres = new Map(courses.map((course) => [course.id, course.title]));
		return {
			organisation: { name: settings.name },
			courses: courses.map((course) => ({
				id: course.id,
				title: course.title ?? 'Cours sans titre',
				status: course.status,
				audience: course.audience,
				room: course.room,
				teacher: course.teacher,
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
				course: pause.course_id ? (titres.get(pause.course_id) ?? 'Cours') : null,
				from: pause.from_date,
				to: pause.to_date,
				reason: pause.reason
			}))
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
		const reason = String(form.get('reason') ?? '').trim() || null;
		if (!DATE.test(from) || !DATE.test(to)) return fail(400, { erreur: 'Dates illisibles.' });
		if (to < from) return fail(400, { erreur: 'La fin de la pause est avant son début.' });
		const id = newId();
		await withSessionOrg(context, async (tx) => {
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
		});
		return { pausePosee: true };
	},

	supprimerPause: async (event) => {
		const context = await mustBeInOrganisation(event);
		const form = await event.request.formData();
		const pauseId = String(form.get('pauseId') ?? '');
		await withSessionOrg(context, async (tx) => {
			await tx.execute(sql`delete from "pause" where "id" = ${pauseId}`);
			await record(tx, context.organizationId, context.userId, {
				action: 'pause.delete',
				targetTable: 'pause',
				targetId: pauseId
			});
		});
		return { pauseSupprimee: true };
	},

	supprimer: async (event) => {
		const context = await mustBeInOrganisation(event);
		const form = await event.request.formData();
		const courseId = String(form.get('courseId') ?? '');
		await withSessionOrg(context, async (tx) => {
			const before = await tx.execute(
				sql`select "id", "status", "starts_on"::text from "course" where "id" = ${courseId}`
			);
			await tx.execute(sql`delete from "course" where "id" = ${courseId}`);
			await record(tx, context.organizationId, context.userId, {
				action: 'course.delete',
				targetTable: 'course',
				targetId: courseId,
				before: Array.isArray(before) ? before[0] : null
			});
		});
		return { coursSupprime: true };
	}
};

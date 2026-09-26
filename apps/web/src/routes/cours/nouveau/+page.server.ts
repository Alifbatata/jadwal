// Nouveau cours. Le formulaire est lu champ par champ (`readCourseForm`), puis par
// `@jadwal/core` ; la base a le dernier mot.

import { fail, redirect } from '@sveltejs/kit';
import { withSessionOrg } from '$lib/server/context.js';
import { readCourseForm } from '$lib/server/course-form.js';
import { mustBeInOrganisation } from '$lib/server/guard.js';
import { insertCourse } from '$lib/server/courses.js';
import { readRooms, readSettings } from '$lib/server/programme.js';
import type { Actions, PageServerLoad } from './$types.js';

export const load: PageServerLoad = async (event) => {
	const context = await mustBeInOrganisation(event);
	return withSessionOrg(context, async (tx) => {
		const settings = await readSettings(tx);
		return {
			organisation: { name: settings.name },
			// Une clé à elle : `organisation` est déjà posée par cette page et masque celle de la
			// coquille, où vit le drapeau du module (ADR 0042).
			modulePrieres: context.organizationPrayerModule,
			langues: settings.enabled_language,
			langueParDefaut: settings.default_language,
			salles: (await readRooms(tx)).map((salle) => ({ id: salle.id, name: salle.name }))
		};
	});
};

export const actions: Actions = {
	default: async (event) => {
		const context = await mustBeInOrganisation(event);
		const form = await event.request.formData();
		const langues = await withSessionOrg(
			context,
			async (tx) => (await readSettings(tx)).enabled_language
		);
		const read = readCourseForm(form, langues);
		// Les noms des erreurs, jamais leurs phrases : la page les écrit dans sa langue. Ce que la
		// personne a envoyé revient avec, pour qu'elle n'ait rien à retaper et que le résumé le montre.
		if (!read.ok) {
			return fail(400, { errors: read.errors, badDates: read.badDates, values: read.values });
		}
		await withSessionOrg(context, (tx) => insertCourse(tx, context, read.values));
		redirect(303, '/cours');
	}
};

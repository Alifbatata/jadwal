// Nouveau cours. La vérification est celle de `@jadwal/core` ; la base a le dernier mot.

import { fail, redirect } from '@sveltejs/kit';
import { withSessionOrg } from '$lib/server/context.js';
import { mustBeInOrganisation } from '$lib/server/guard.js';
import { insertCourse, parseCourseForm } from '$lib/server/courses.js';
import { readRooms, readSettings } from '$lib/server/programme.js';
import type { Actions, PageServerLoad } from './$types.js';

export const load: PageServerLoad = async (event) => {
	const context = await mustBeInOrganisation(event);
	return withSessionOrg(context, async (tx) => {
		const settings = await readSettings(tx);
		return {
			organisation: { name: settings.name },
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
		const parsed = parseCourseForm(form, langues);
		if (!parsed.ok) return fail(400, { erreurs: parsed.erreurs });
		await withSessionOrg(context, (tx) => insertCourse(tx, context, parsed.values));
		redirect(303, '/cours');
	}
};

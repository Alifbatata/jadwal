// L'acceptation des conditions d'utilisation, à la première entrée dans l'espace d'une organisation
// et à chaque nouvelle version du texte (ADR 0044).
//
// La seule page de l'espace qui ne passe pas par `mustBeInOrganisation` : c'est vers elle que cette
// porte renvoie. Sa garde exige une session et une organisation en contexte, et renvoie à l'accueil
// une personne qui a déjà accepté la version en cours.

import { redirect } from '@sveltejs/kit';
import { newId, sql, withOrg } from '@jadwal/db';
import { appDatabase } from '$lib/server/database.js';
import { membershipsOf } from '$lib/server/context.js';
import { conditionsHtmlSansTitre, dateDeLaVersion, versionIso } from '$lib/server/conditions.js';
import { mustHaveTermsToAccept } from '$lib/server/guard.js';
import type { Actions, PageServerLoad } from './$types.js';

/** Aucun JavaScript : le bouton est un vrai formulaire, et le texte n'a rien à hydrater. */
export const csr = false;

export const load: PageServerLoad = async (event) => {
	const context = await mustHaveTermsToAccept(event);
	return {
		organisation: context.organizationName,
		date: dateDeLaVersion,
		html: conditionsHtmlSansTitre,
		// La navigation est masquée pendant l'attente : pour qui est membre de plusieurs
		// organisations, le lien vers le choix est le seul chemin vers une autre. `/organisations` ne
		// passe pas par la porte, et le choix fait, c'est la porte de l'autre qui s'applique.
		plusieursOrganisations: (await membershipsOf(context)).length > 1
	};
};

export const actions: Actions = {
	default: async (event) => {
		const context = await mustHaveTermsToAccept(event);
		// En SQL brut, et sans `accepted_at` : la base pose le moment elle-même et refuse une valeur
		// venue de l'application. Le constructeur d'insertion de Drizzle nomme cette colonne, et la
		// base le refuserait. Un envoi répété n'ajoute rien et ne lève rien.
		await withOrg(
			appDatabase(),
			{ organizationId: context.organizationId, userId: context.userId },
			async (tx) => {
				await tx.execute(sql`
					insert into "terms_acceptance" ("id", "organization_id", "user_id", "version")
					values (${newId()}, ${context.organizationId}, ${context.userId}, ${versionIso})
					on conflict ("organization_id", "user_id", "version") do nothing
				`);
			}
		);
		redirect(303, '/');
	}
};

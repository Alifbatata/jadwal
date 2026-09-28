// L'acceptation des conditions d'utilisation, à la première entrée dans l'espace d'une organisation
// et à chaque nouvelle version du texte (ADR 0044).
//
// La seule page de l'espace qui ne passe pas par `mustBeInOrganisation` : c'est vers elle que cette
// porte renvoie. Sa garde exige une session et une organisation en contexte, et renvoie à l'accueil
// une personne qui a déjà accepté la version en cours.
//
// Depuis l'étape 20, la personne qui ne veut pas accepter peut aussi quitter l'organisation d'ici, par
// le chemin de « Vos organisations » (`organisations/leave.server.ts`) : les mêmes vérifications, la
// même confirmation, les mêmes réponses. Deux actions nommées, donc : SvelteKit refuse une action par
// défaut à côté d'une action nommée.

import { redirect } from '@sveltejs/kit';
import type { IsoDate } from '@jadwal/core';
import { newId, sql, withOrg } from '@jadwal/db';
import { numericDate } from '$lib/i18n.js';
import { appDatabase } from '$lib/server/database.js';
import { conditionsHtmlSansTitre, versionIso } from '$lib/server/conditions.js';
import { mustHaveTermsToAccept } from '$lib/server/guard.js';
import { leaveOrganisation } from '../../organisations/leave.server.js';
import type { Actions, PageServerLoad } from './$types.js';

/** Aucun JavaScript : les boutons sont de vrais formulaires, et le texte n'a rien à hydrater. */
export const csr = false;

export const load: PageServerLoad = async (event) => {
	const context = await mustHaveTermsToAccept(event);
	return {
		organisation: context.organizationName,
		// L'organisation que l'écran nomme, pour le bouton qui la quitte : le serveur revérifie que la
		// personne en est membre, et une session changée dans un autre onglet ne lui en fait pas
		// quitter une autre.
		organizationId: context.organizationId,
		// « 26.09.2026 », comme toutes les dates de l'espace depuis l'étape 18 (retour A3).
		date: numericDate(versionIso as IsoDate),
		html: conditionsHtmlSansTitre,
		// La navigation est masquée pendant l'attente : le lien vers le choix est alors le seul chemin
		// vers une autre organisation. Il est là dans les mêmes cas que « Changer d’organisation »
		// dans la navigation (retour H2) : pour qui est membre de plusieurs organisations, et pour qui
		// n'en a qu'une mais a une invitation qui court encore, qu'elle accepte sur cet écran. Les deux
		// nombres viennent du contexte, sans requête de plus. `/organisations` ne passe pas par la
		// porte, et le choix fait, c'est la porte de l'autre qui s'applique.
		autreOrganisation: context.membershipCount > 1 || context.pendingInvitationCount > 0
	};
};

export const actions: Actions = {
	accepter: async (event) => {
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
	},

	/**
	 * Ne pas accepter, et quitter l'organisation (étape 20). La même porte que l'acceptation : une
	 * personne qui a déjà accepté retourne à l'accueil, et rien n'est supprimé. Le refus des
	 * conditions n'est écrit nulle part ; seul le départ l'est, au journal, comme depuis « Vos
	 * organisations » (ADR 0044).
	 */
	quitter: async (event) => {
		const context = await mustHaveTermsToAccept(event);
		return leaveOrganisation(context, await event.request.formData());
	}
};

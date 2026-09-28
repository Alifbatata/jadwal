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
//
// Les deux formulaires portent l'organisation que l'écran nomme. Chaque action la compare à celle de
// la session, après la porte : l'écran et la session doivent parler de la même. Sinon, la session a
// choisi une autre organisation depuis l'affichage, dans un autre onglet, ou le formulaire est
// trafiqué ; rien n'est accepté ni supprimé, et l'écran, rendu pour l'organisation de la session, le
// dit en haut (étape 20).

import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
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
		// L'organisation que l'écran nomme, portée par ses deux formulaires : l'accord et le départ ne
		// valent que pour elle (`memeOrganisation`).
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

/**
 * La porte de l'écran, puis l'organisation que le formulaire nomme, comparée à celle de la session.
 * La porte d'abord : sans session, sans organisation, ou quand l'organisation de la session est déjà
 * acceptée, elle renvoie ailleurs avant toute comparaison, et rien n'est fait.
 */
async function memeOrganisation(event: RequestEvent) {
	const context = await mustHaveTermsToAccept(event);
	const form = await event.request.formData();
	return {
		context,
		form,
		meme: String(form.get('organizationId') ?? '') === context.organizationId
	};
}

export const actions: Actions = {
	accepter: async (event) => {
		const { context, meme } = await memeOrganisation(event);
		if (!meme) return fail(409, { error: 'sessionChanged' as const });
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
	 * personne qui a déjà accepté dans l'organisation de sa session retourne à l'accueil, et rien
	 * n'est supprimé. La même comparaison aussi : le départ ne vise que l'organisation de la session,
	 * et seulement si l'écran la nommait. Le refus des conditions n'est écrit nulle part ; seul le
	 * départ l'est, au journal, comme depuis « Vos organisations » (ADR 0044).
	 */
	quitter: async (event) => {
		const { context, form, meme } = await memeOrganisation(event);
		if (!meme) return fail(409, { error: 'sessionChanged' as const });
		return leaveOrganisation(context, form);
	}
};

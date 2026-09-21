// Demande d'un lien magique.
//
// La réponse est toujours la même, mot pour mot, que l'adresse soit connue ou non, qu'un courriel
// soit parti ou qu'il ait été retenu par la limitation de débit. Aucune branche du code ne consulte
// les comptes : il n'y a donc rien à faire fuir, ni par le message, ni par le temps de réponse
// (ADR 0017).

import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth.js';
import type { Actions, PageServerLoad } from './$types.js';

/** La seule réponse que cette page sait donner quand l'adresse a une forme acceptable. */
const ENVOYE = {
	envoye: true,
	message:
		'Si cette adresse peut se connecter, un lien vient de lui être envoyé. ' +
		'Il est valable quinze minutes et ne sert qu’une fois.'
} as const;

const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const load: PageServerLoad = ({ locals }) => {
	if (locals.person) redirect(303, '/organisations');
	return {};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (!ADRESSE.test(email)) {
			return fail(400, { erreur: 'Cette adresse n’a pas la forme d’une adresse électronique.' });
		}
		try {
			await auth().api.signInMagicLink({
				body: { email, callbackURL: '/organisations' },
				headers: request.headers
			});
		} catch {
			// Une erreur du sous-système de connexion ne doit pas se voir dans la réponse : elle
			// dirait quelque chose de l'adresse. Elle est déjà journalisée côté serveur.
		}
		return ENVOYE;
	}
};

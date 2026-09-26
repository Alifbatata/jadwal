// Demande d'un lien magique.
//
// La réponse est toujours la même, mot pour mot, que l'adresse soit connue ou non, qu'un courriel
// soit parti ou qu'il ait été retenu par la limitation de débit. Aucune branche du code ne consulte
// les comptes : il n'y a donc rien à faire fuir, ni par le message, ni par le temps de réponse
// (ADR 0017).
//
// Les textes sont dans la langue de l'écran, que la page lit dans ses données (`i18n/sign-in.ts`) :
// l'action ne rend qu'un état, jamais une phrase. Le courriel part dans la même langue, celle de la
// requête, que le hook pose sans lire aucun compte (retour D3).

import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth.js';
import type { Actions, PageServerLoad } from './$types.js';

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
			return fail(400, { invalidEmail: true, email });
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
		// La seule réponse que cette page sait donner quand l'adresse a une forme acceptable.
		return { sent: true };
	}
};

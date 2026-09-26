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
//
// Une langue choisie avant la connexion part avec le lien (`signInCallback`) : il l'emporte sur le
// navigateur qui l'ouvre, même si ce n'est pas celui-ci, et la vérification du lien en fait la langue
// du compte (`auth.ts`). Sur ce navigateur, le choix attend encore le temps de ce lien, et pas plus.
// Ce que l'action lit pour cela vient des cookies de ce navigateur, jamais du compte : la réponse
// reste la même pour toutes les adresses.

import { fail, redirect } from '@sveltejs/kit';
import {
	LANGUAGE_COOKIE,
	languageCookieOptions,
	PENDING_CHOICE_COOKIE,
	signInCallback
} from '$lib/i18n/language.js';
import { auth, MAGIC_LINK_SECONDS } from '$lib/server/auth.js';
import type { Actions, PageServerLoad } from './$types.js';

const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const load: PageServerLoad = ({ locals }) => {
	if (locals.person) redirect(303, '/organisations');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (!ADRESSE.test(email)) {
			return fail(400, { invalidEmail: true, email });
		}
		const pending = cookies.get(PENDING_CHOICE_COOKIE) !== undefined;
		const callbackURL = signInCallback({ cookie: cookies.get(LANGUAGE_COOKIE), pending });
		if (pending) {
			cookies.set(PENDING_CHOICE_COOKIE, '1', languageCookieOptions(url, MAGIC_LINK_SECONDS));
		}
		try {
			await auth().api.signInMagicLink({
				body: { email, callbackURL },
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

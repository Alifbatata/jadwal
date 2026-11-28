// Demande d'un lien magique.
//
// La réponse est toujours la même, mot pour mot, que l'adresse soit connue ou non, qu'un courriel
// soit parti ou qu'il ait été retenu par la limitation de débit. Cette action ne consulte aucun
// compte : il n'y a donc rien à faire fuir, ni par le message, ni par ses cookies (ADR 0017).
//
// Depuis l'étape 25, l'inscription est ouverte (ADR 0058) : toute adresse reçoit un lien, et
// l'ouvrir crée le compte. Les bornes de l'ouverture vivent dans l'envoi (`auth.ts`) et partent en
// silence. Une seule se dit, celle-ci : vingt demandes par heure depuis une même adresse IP. Elle ne
// parle que de la connexion d'où l'on écrit, jamais de l'adresse saisie, et elle passe avant tout le
// reste, sans rien demander à la base au sujet de l'adresse. La limitation de Better Auth ne voit
// pas cette action, qui appelle son API serveur : sans ce seau, une seule machine ferait écrire le
// service à autant d'adresses qu'elle en invente.
//
// Les textes sont dans la langue de l'écran, que la page lit dans ses données (`i18n/sign-in.ts`) :
// l'action ne rend qu'un état, jamais une phrase. Le courriel part dans la même langue, celle de la
// requête, que le hook pose sans lire aucun compte (retour D3).
//
// Une langue choisie avant la connexion part avec le lien (`signInCallback`), quel que soit le temps
// passé depuis le choix : il l'emporte sur le navigateur qui l'ouvre, même si ce n'est pas celui-ci,
// et la vérification du lien en fait la langue du compte (`auth.ts`). Parti avec ce lien, le choix
// n'attend plus sur ce navigateur : son cookie d'attente est retiré, et un second lien, demandé
// sans nouveau choix, ne l'emporte pas. Une fois parti, il ne revient donc pas défaire une langue
// changée ensuite ailleurs ; tant qu'aucun lien n'est demandé ici, il attend, jusqu'à un an
// (`hooks.server.ts` dit la règle entière).
//
// Le retrait vaut pour toute adresse de forme acceptable, qu'un courriel parte ou non : une demande
// que la limite par adresse retient (`auth.ts`), ou dont l'envoi échoue, retire aussi le choix.
// L'action ne sait pas si le courriel est parti, et la réponse, cookies compris, doit rester la même
// pour toutes les adresses (ADR 0017) : garder le choix quand la limite par adresse retient l'envoi
// dirait qu'on a déjà demandé trois liens pour cette adresse dans l'heure. Seules une adresse
// refusée pour sa forme et une demande refusée par la borne de l'adresse IP le laissent attendre :
// aucun lien n'est demandé, et la seconde ne dit rien de l'adresse saisie. Ce que l'action lit et retire vient
// des cookies de ce navigateur, jamais du compte.

import { fail, redirect } from '@sveltejs/kit';
import {
	LANGUAGE_COOKIE,
	languageCookieOptions,
	PENDING_CHOICE_COOKIE,
	signInCallback
} from '#lib/i18n/language.js';
import { clientAddress } from '#lib/server/api.js';
import { auth } from '#lib/server/auth.js';
import { authDatabase } from '#lib/server/database.js';
import { consume, SIGN_IN_FORM_BUDGET, signInFormKey } from '#lib/server/rate-limit.js';
import type { Actions, PageServerLoad } from './$types.js';

const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const load: PageServerLoad = ({ locals }) => {
	if (locals.person) redirect(303, '/organisations');
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const { request, cookies, url } = event;
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (!ADRESSE.test(email)) {
			return fail(400, { invalidEmail: true, email });
		}
		// Avant le choix de langue en attente : une demande refusée ici n'a demandé aucun lien, et
		// le choix attend encore, comme pour une adresse refusée pour sa forme.
		const allowed = await consume(
			authDatabase(),
			signInFormKey(clientAddress(event)),
			SIGN_IN_FORM_BUDGET
		);
		if (!allowed) return fail(429, { tooMany: true, email });
		const pending = cookies.get(PENDING_CHOICE_COOKIE) !== undefined;
		const callbackURL = signInCallback({ cookie: cookies.get(LANGUAGE_COOKIE), pending });
		if (pending) cookies.delete(PENDING_CHOICE_COOKIE, languageCookieOptions(url));
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

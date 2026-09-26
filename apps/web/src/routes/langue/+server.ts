// Le choix de la langue, en haut de chaque écran de l'espace (étape 18, retour D2).
//
// Un formulaire ordinaire, qui marche sans JavaScript : il poste la langue choisie et l'écran d'où il
// part, et revient sur cet écran. Pour une personne connectée, la langue devient celle de son compte,
// qu'elle retrouve sur tous ses appareils ; le cookie la retient aussi sur ce navigateur, pour
// l'écran de connexion après une déconnexion. Avant la connexion, le cookie la retient, et un second
// cookie dit que ce choix attend d'être donné au compte : à la connexion, il devient la langue du
// compte (`hooks.server.ts`).
//
// Un envoi depuis un autre site est refusé par SvelteKit avant d'arriver ici (vérification de
// l'origine des formulaires). Le retour ne quitte jamais le service (`returnPath`).

import { redirect } from '@sveltejs/kit';
import { isLangue } from '$lib/i18n.js';
import {
	LANGUAGE_COOKIE,
	languageCookieOptions,
	PENDING_CHOICE_COOKIE,
	returnPath
} from '$lib/i18n/language.js';
import { writeAccountLanguage } from '$lib/server/account-language.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request, cookies, locals, url }) => {
	const form = await request.formData();
	const language = String(form.get('language') ?? '');
	const back = returnPath(String(form.get('returnTo') ?? ''), url.origin);
	// Une langue que le service ne parle pas ne change rien : on revient simplement.
	if (!isLangue(language)) redirect(303, back);

	cookies.set(LANGUAGE_COOKIE, language, languageCookieOptions(url));
	if (locals.person) {
		await writeAccountLanguage(locals.person.userId, language);
	} else {
		cookies.set(PENDING_CHOICE_COOKIE, '1', languageCookieOptions(url));
	}
	redirect(303, back);
};

/**
 * Une adresse tapée à la main, ou un lien suivi par un robot : rien à choisir sans formulaire. Sans
 * cette réponse, SvelteKit en rendrait une en anglais, en texte brut, hors de la coquille. On renvoie
 * à l'accueil, qui mène à la connexion ou à l'espace.
 */
export const GET: RequestHandler = () => redirect(303, '/');

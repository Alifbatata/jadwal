// Le choix de la langue, en haut de chaque écran de l'espace (étape 18, retour D2).
//
// Un formulaire ordinaire, qui marche sans JavaScript : il poste la langue choisie et l'écran d'où il
// part, et revient sur cet écran. Pour une personne connectée, la langue devient celle de son compte,
// qu'elle retrouve sur tous ses appareils ; le cookie la retient aussi sur ce navigateur, pour
// l'écran de connexion après une déconnexion. Avant la connexion, seul le cookie la retient.
//
// Un envoi depuis un autre site est refusé par SvelteKit avant d'arriver ici (vérification de
// l'origine des formulaires). Le retour ne quitte jamais le service (`returnPath`).

import { redirect } from '@sveltejs/kit';
import { isLangue } from '$lib/i18n.js';
import { LANGUAGE_COOKIE, LANGUAGE_COOKIE_SECONDS, returnPath } from '$lib/i18n/language.js';
import { writeAccountLanguage } from '$lib/server/account-language.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request, cookies, locals, url }) => {
	const form = await request.formData();
	const language = String(form.get('language') ?? '');
	const back = returnPath(String(form.get('returnTo') ?? ''), url.origin);
	// Une langue que le service ne parle pas ne change rien : on revient simplement.
	if (!isLangue(language)) redirect(303, back);

	cookies.set(LANGUAGE_COOKIE, language, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		// Comme la session : `Secure` dès que le service est servi en HTTPS (`auth.ts`).
		secure: url.protocol === 'https:',
		maxAge: LANGUAGE_COOKIE_SECONDS
	});
	if (locals.person) {
		await writeAccountLanguage(locals.person.userId, language);
	}
	redirect(303, back);
};

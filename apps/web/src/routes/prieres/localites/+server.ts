// La recherche des localités suisses, pour le champ de l'écran des heures de prière (étape 18, C2).
//
// Elle lit la liste officielle embarquée dans le serveur (`$lib/server/localites`) : aucun service
// extérieur n'est interrogé, ni ici ni ailleurs. Elle est réservée aux personnes qui ouvrent l'écran,
// les responsables d'une organisation qui a allumé le module, par la même porte que lui : la liste
// est publique, mais une route de l'espace n'a pas à servir qui n'y est pas.
//
// Sans JavaScript, l'écran ne l'appelle pas : son propre formulaire rend la liste (`?lieu=`). Avec
// JavaScript, le champ l'interroge à chaque lettre et montre les mêmes résultats sans recharger.

import { json } from '@sveltejs/kit';
import { mustAdministerPrayerModule } from '$lib/server/guard.js';
import { searchLocalities, toChoice } from '$lib/server/localites/localities.js';
import type { RequestHandler } from './$types.js';

/** Plus long que n'importe quel nom de la liste : un texte plus long n'est plus une recherche. */
const LONGUEUR_MAXIMALE = 100;

export const GET: RequestHandler = async (event) => {
	await mustAdministerPrayerModule(event);
	const recherche = (event.url.searchParams.get('q') ?? '').slice(0, LONGUEUR_MAXIMALE);
	return json(searchLocalities(recherche).map(toChoice), {
		// La réponse dépend de la session : aucun cache partagé ne doit la garder.
		headers: { 'cache-control': 'private, no-store' }
	});
};

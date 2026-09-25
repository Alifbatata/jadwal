// Toute adresse sous `/m/<identifiant>/` qu'aucune autre route ne connaît : `/m/x/nulle-part`,
// `/m/x/ar/cours` sans cours.
//
// Sans cette route, SvelteKit ne trouve rien et rend la page d'erreur de la racine, d'après sa
// documentation : le JavaScript de SvelteKit et un texte en français. Avec elle, le 404 passe par
// la page d'erreur de `/m/`, sans script, dans la langue du segment s'il y en a un.
//
// Elle ne passe devant aucune page : une route à paramètre de reste vient en dernier dans l'ordre de
// SvelteKit, après `[[langue=langue]]`, `agenda.ics` et les autres. Et elle ne lit pas la base :
// chercher l'organisation pour sa langue par défaut coûterait une requête à chaque adresse inventée
// par un robot, pour une page qui dit seulement qu'il n'y a rien ici.

import { introuvable } from '$lib/server/pages.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = (event) => introuvable(event);

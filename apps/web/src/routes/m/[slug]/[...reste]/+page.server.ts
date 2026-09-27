// Toute adresse sous `/m/<identifiant>/` qu'aucune autre route ne connaît : `/m/x/nulle-part`,
// `/m/x/ar/cours` sans cours.
//
// Sans cette route, SvelteKit ne trouve rien et rend la page d'erreur de la racine, d'après sa
// documentation : le JavaScript de SvelteKit et un texte en français. Avec elle, le 404 passe par
// la page d'erreur de `/m/`, sans script.
//
// Elle ne passe devant aucune page : une route à paramètre de reste vient en dernier dans l'ordre de
// SvelteKit, après `[[langue=langue]]`, `agenda.ics` et les autres.
//
// Sa langue, depuis le 27.09.2026 (décision du chef de projet) : sous une organisation connue, celle
// du segment si l'organisation la publie, et sa langue par défaut sinon. Le 404 était en français
// sans segment, quelle que soit la langue de l'organisation, parce que la route ne lisait pas la
// base. Elle la lit maintenant, une requête par adresse inventée, celle que fait déjà toute page de
// l'organisation. Sous une organisation inconnue ou suspendue, rien ne change : la langue du
// segment, sinon le français, et rien ne dit qu'une organisation a existé.

import { findOrganisation } from '$lib/server/public.js';
import {
	introuvable,
	langueDuChemin,
	langueParDefaut,
	languesProposees
} from '$lib/server/pages.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async (event) => {
	const organisation = await findOrganisation(event.params.slug);
	if (!organisation) introuvable(event);
	const demandee = langueDuChemin(event);
	introuvable(
		event,
		demandee && languesProposees(organisation).includes(demandee)
			? demandee
			: langueParDefaut(organisation)
	);
};

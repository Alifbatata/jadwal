// Le manifeste de l'application d'une organisation (étape 24, ADR 0053) : ce qu'un navigateur lit
// pour proposer d'installer sa page publique.
//
// Une route à part, hors du chemin de langue : ce n'est pas une page, et elle ne compte pas de vue.
// La langue vient de la page qui le demande, par `?lang=` ; une langue que l'organisation ne publie
// pas retombe sur sa langue par défaut.

import type { RequestHandler } from './$types.js';
import {
	allowRequest,
	CACHE_REGLAGES,
	publicError,
	publicResponse,
	tooManyRequests
} from '#lib/server/api.js';
import { manifesteDe } from '#lib/server/application.js';
import { langueParDefaut, languesProposees } from '#lib/server/pages.js';
import { etagOf, findOrganisation, fingerprint } from '#lib/server/public.js';
import { isLangue } from '#lib/i18n.js';

export const GET: RequestHandler = async (event) => {
	if (!(await allowRequest(event))) return tooManyRequests();
	const organisation = await findOrganisation(event.params.slug);
	// Une organisation suspendue et un identifiant inconnu rendent la même chose.
	if (!organisation) return publicError(404, 'not_found');

	const demandee = event.url.searchParams.get('lang') ?? '';
	const langue =
		isLangue(demandee) && languesProposees(organisation).includes(demandee)
			? demandee
			: langueParDefaut(organisation);
	return publicResponse(event, JSON.stringify(manifesteDe(organisation, langue)), {
		// Le nom et la couleur changent rarement, mais un changement doit se voir vite.
		cacheControl: CACHE_REGLAGES,
		etag: etagOf(await fingerprint(organisation.id), 'manifest', langue),
		contentType: 'application/manifest+json; charset=utf-8'
	});
};

// Les réglages d'affichage publics d'une organisation (ADR 0026, `docs/API.md`).

import type { RequestHandler } from './$types.js';
import {
	allowRequest,
	CACHE_REGLAGES,
	publicError,
	publicOptions,
	publicResponse,
	tooManyRequests
} from '$lib/server/api.js';
import { etagOf, findOrganisation, fingerprint, readPublicRooms } from '$lib/server/public.js';
import { settingsOf } from '$lib/server/serialise.js';

export const GET: RequestHandler = async (event) => {
	if (!(await allowRequest(event))) return tooManyRequests();
	const organisation = await findOrganisation(event.params.slug);
	// Une organisation suspendue et un identifiant inconnu rendent la même chose : le code de
	// réponse ne dit pas qu'une organisation a existé.
	if (!organisation) return publicError(404, 'not_found');

	const etag = etagOf(await fingerprint(organisation.id), 'settings');
	const rooms = await readPublicRooms(organisation.id);
	return publicResponse(event, JSON.stringify(settingsOf(organisation, rooms)), {
		cacheControl: CACHE_REGLAGES,
		etag
	});
};

export const OPTIONS: RequestHandler = () => publicOptions();

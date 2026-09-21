// Le programme d'une organisation sur une plage de dates (ADR 0026, `docs/API.md`).
//
// Les séances viennent de `@jadwal/core` : cette route ne calcule rien, elle met en forme.

import type { RequestHandler } from './$types.js';
import {
	allowRequest,
	CACHE_PROGRAMME,
	publicError,
	publicOptions,
	publicResponse,
	tooManyRequests
} from '$lib/server/api.js';
import {
	boundedRange,
	etagOf,
	findOrganisation,
	fingerprint,
	isLangue,
	MAX_JOURS_DEMANDE,
	plafondDemande,
	readPublicProgramme
} from '$lib/server/public.js';
import { scheduleOf } from '$lib/server/serialise.js';
import { todayInZone } from '@jadwal/core';

export const GET: RequestHandler = async (event) => {
	if (!(await allowRequest(event))) return tooManyRequests();
	const organisation = await findOrganisation(event.params.slug);
	if (!organisation) return publicError(404, 'not_found');

	const demandee = event.url.searchParams.get('lang') ?? organisation.default_language;
	const langue = isLangue(demandee) ? demandee : 'fr';
	// La plage est ramenée dans ses bornes par le serveur, quoi que demande l'appelant : sans cela,
	// une requête sur dix ans ferait travailler la base pour rien. Quatre-vingt-douze jours par
	// défaut, jusqu'à trois cent soixante-six si l'appelant le demande par `maxDays` ; au-delà, un
	// refus qui dit la borne, parce qu'un plafond demandé est une intention, pas une distraction.
	const plafond = plafondDemande(event.url.searchParams.get('maxDays'));
	if (plafond === 'trop_long') {
		return publicError(
			400,
			'range_too_long',
			`maxDays must be ${MAX_JOURS_DEMANDE} or less (one leap year).`
		);
	}
	const today = todayInZone(organisation.time_zone, new Date());
	const range = boundedRange(
		today,
		event.url.searchParams.get('from'),
		event.url.searchParams.get('to'),
		plafond
	);

	const etag = etagOf(await fingerprint(organisation.id), 'schedule', langue, range.from, range.to);
	const programme = await readPublicProgramme(organisation, langue, new Date(), range);
	return publicResponse(
		event,
		JSON.stringify(scheduleOf(organisation, langue, range, programme.seances)),
		{ cacheControl: CACHE_PROGRAMME, etag }
	);
};

export const OPTIONS: RequestHandler = () => publicOptions();

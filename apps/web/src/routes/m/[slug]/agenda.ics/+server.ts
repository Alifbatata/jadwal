// Le flux agenda de toute une organisation, servi par HTTP.
//
// Il vit sous `/m/<identifiant>/` et non sous `/api/`, parce que c'est une adresse qu'une personne
// copie et colle dans son téléphone : elle doit se lire à voix haute sans faute. Le flux d'un seul
// cours est à côté, dans `agenda/<identifiant du cours>.ics` (ADR 0028).

import type { RequestHandler } from './$types.js';
import {
	allowRequest,
	CACHE_AGENDA,
	publicError,
	publicOptions,
	publicResponse,
	tooManyRequests
} from '$lib/server/api.js';
import { agendaFilename, buildAgenda } from '$lib/server/agenda.js';
import { etagOf, findOrganisation, fingerprint, isLangue } from '$lib/server/public.js';
import { vueDe } from '$lib/server/vues.js';

export const GET: RequestHandler = async (event) => {
	if (!(await allowRequest(event))) return tooManyRequests();
	const organisation = await findOrganisation(event.params.slug);
	if (!organisation) return publicError(404, 'not_found');
	// Une requête de flux, posée avant le court-circuit du `304` : un client d'agenda qui sonde sans
	// que rien n'ait changé a bien sondé, et compter l'un sans l'autre ferait dépendre la mesure du
	// hasard des modifications de programme (ADR 0032).
	event.locals.vue = vueDe(event, organisation, 'feed');

	const demandee = event.url.searchParams.get('lang') ?? organisation.default_language;
	const langue = isLangue(demandee) ? demandee : 'fr';
	const etag = etagOf(await fingerprint(organisation.id), 'ics', langue);
	const agenda = await buildAgenda({
		organisation,
		langue,
		now: new Date(),
		// L'hôte des UID est celui de l'origine publique : il doit rester stable, sinon chaque
		// abonné reverrait tout le calendrier comme nouveau.
		uidHost: event.url.hostname
	});
	if (!agenda) return publicError(404, 'not_found');

	return publicResponse(event, agenda.ics, {
		cacheControl: CACHE_AGENDA,
		etag,
		contentType: 'text/calendar; charset=utf-8',
		filename: agendaFilename(organisation.slug)
	});
};

export const OPTIONS: RequestHandler = () => publicOptions();

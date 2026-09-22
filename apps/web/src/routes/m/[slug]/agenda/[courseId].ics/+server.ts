// Le flux agenda d'un seul cours (ADR 0028).
//
// La maquette place « ajouter à mon agenda » sur chaque cours, pas seulement sur l'organisation :
// une personne qui suit le cours d'arabe du mardi n'a pas envie des quinze autres dans son
// téléphone.
//
// Le fichier est construit par le **même** `buildCalendar` que le flux de l'organisation, avec une
// liste d'un cours. Ce n'est donc pas un second export : il ne peut pas diverger de l'autre, et les
// deux se cassent ou tiennent ensemble.

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
	const courseId = event.params.courseId;
	const etag = etagOf(await fingerprint(organisation.id), 'ics', langue, courseId);
	const agenda = await buildAgenda({
		organisation,
		langue,
		now: new Date(),
		uidHost: event.url.hostname,
		courseId
	});
	// Un cours non publié, archivé ou inventé rend la même chose qu'une organisation inconnue :
	// le code de réponse ne dit pas qu'un cours a existé.
	if (!agenda) return publicError(404, 'not_found');

	return publicResponse(event, agenda.ics, {
		cacheControl: CACHE_AGENDA,
		etag,
		contentType: 'text/calendar; charset=utf-8',
		filename: agendaFilename(organisation.slug, agenda.title)
	});
};

export const OPTIONS: RequestHandler = () => publicOptions();

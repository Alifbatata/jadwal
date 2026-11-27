// Le jeton du poste « Diffuser » : ce qui dit au relais qu'une organisation a le droit d'ouvrir un
// direct (ADR 0055, ADR 0056).
//
// L'écran le demande au moment où la personne appuie, et à chaque reprise après une coupure. Il
// vit une minute, ne sert qu'à ouvrir la liaison, et n'est jamais rendu dans une page ni gardé
// dans un cache. L'organisation vient de la session, jamais de la requête (ADR 0013).
//
// Chaque refus répond par son code et rien d'autre : c'est un programme qui lit, pas une personne.
//   404  le direct n'est pas réglé sur cette instance ;
//   403  la demande vient d'un autre site ; ou la personne n'est membre d'aucune organisation,
//        n'a pas accepté les conditions, ou n'a pas le droit de diffuser (un éditeur sans
//        l'autorisation : ADR 0056 amendée) ;
//   409  aucune des langues que l'organisation a choisies n'est servie par le relais ;
//   401  personne n'est connecté.
//
// Le jeton porte les langues permises : celles de l'organisation que le relais sert. Le relais
// refuse une ouverture vers une autre.

import { error } from '@sveltejs/kit';
import { record } from '#lib/server/audit.js';
import { currentOrganisation, withSessionOrg } from '#lib/server/context.js';
import {
	broadcastLanguages,
	liveSettings,
	signBroadcastToken,
	TOKEN_LIFETIME_MS
} from '#lib/server/live.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async (event) => {
	const live = liveSettings();
	if (!live) error(404, 'Not Found');
	// Un navigateur dit toujours d'où part un `POST`. Un autre site n'obtiendrait de toute façon ni
	// le cookie de la session ni la réponse ; le refuser ici ne coûte rien et ne suppose rien.
	if (event.request.headers.get('origin') !== event.url.origin) error(403, 'Forbidden');
	const person = event.locals.person;
	if (!person) error(401, 'Unauthorized');
	const context = await currentOrganisation(person);
	if (!context || !context.termsAccepted || !context.canBroadcast) error(403, 'Forbidden');
	const languages = broadcastLanguages(context.organizationLiveLanguages, live.languages);
	if (languages.length === 0) error(409, 'Conflict');

	// Le journal de l'organisation dit qui a lancé un direct, et quand. La ligne est écrite avant
	// que le jeton ne parte : pas de jeton sans trace.
	await withSessionOrg(context, (tx) =>
		record(tx, context.organizationId, context.userId, {
			action: 'live.token',
			targetTable: 'organization',
			targetId: context.organizationId
		})
	);
	const token = signBroadcastToken(
		live.secret,
		context.organizationSlug,
		Date.now() + TOKEN_LIFETIME_MS,
		languages
	);
	return Response.json({ token }, { headers: { 'cache-control': 'no-store' } });
};

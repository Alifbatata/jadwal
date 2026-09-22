// Ce que toute réponse de l'API publique porte, et ce qu'elle refuse (ADR 0026).
//
// Une seule fonction rend les réponses, pour que le contrat ne dépende pas de la discipline de
// chaque route : mêmes en-têtes de cache, même validation, même CORS, même limitation de débit.
// Une route qui oublierait l'un des quatre serait une exception visible, pas un oubli invisible.

import type { RequestEvent } from '@sveltejs/kit';
import { consume, type Budget } from './rate-limit.js';
import { publicDatabase } from './public.js';

/**
 * Deux minutes de fraîcheur, puis une journée pendant laquelle un cache peut servir l'ancienne
 * réponse le temps de la revalider. C'est le bon compromis pour un programme de cours : une
 * correction se voit en deux minutes, et une panne du serveur ne blanchit pas la page d'une
 * organisation.
 */
export const CACHE_PROGRAMME = 'public, max-age=120, stale-while-revalidate=86400';
/** Le flux agenda annonce déjà un rafraîchissement d'une heure : le cache dit la même chose. */
export const CACHE_AGENDA = 'public, max-age=3600, stale-while-revalidate=86400';
/** Les réglages d'affichage changent rarement, mais un changement de couleur doit se voir vite. */
export const CACHE_REGLAGES = 'public, max-age=300, stale-while-revalidate=86400';

/** Cent vingt requêtes par minute et par adresse : un widget en appelle trois par page. */
export const BUDGET_PUBLIC: Budget = { windowSeconds: 60, max: 120 };

/**
 * L'adresse du client, telle que l'adaptateur l'a résolue.
 *
 * **Ce code lisait l'en-tête lui-même, et il le lisait de travers** (corrigé à l'étape 9). Il
 * prenait la *première* valeur de `X-Forwarded-For`. Or un mandataire **ajoute** la sienne à celles
 * que le client a envoyées : un visiteur qui pose `X-Forwarded-For: 1.2.3.4` obtient
 * `1.2.3.4, <sa vraie adresse>` après Caddy, et nous lisions `1.2.3.4`. Il suffisait d'en changer à
 * chaque requête pour obtenir un seau de limitation neuf — autant dire qu'il n'y avait pas de
 * limitation.
 *
 * La lecture revient donc à `adapter-node`, qui le fait correctement : avec
 * `ADDRESS_HEADER=x-forwarded-for` et `XFF_DEPTH=1`, il prend la **dernière** valeur, celle que le
 * mandataire vient d'ajouter. `XFF_DEPTH` dit combien de mandataires sont devant nous ; il vaut 1
 * parce qu'il y a exactement un Caddy, et il devrait changer le jour où un second s'ajouterait.
 * Sans mandataire — en développement, dans les tests — l'en-tête n'est pas déclaré et c'est
 * l'adresse de la connexion qui sert.
 */
export function clientAddress(event: RequestEvent): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'inconnu';
	}
}

/**
 * Les en-têtes communs à toute réponse publique.
 *
 * CORS ouvert en lecture : le widget de l'étape 6 tourne sur le site d'une organisation, donc sur
 * une autre origine. Ce que cela ouvre est exactement ce que n'importe qui peut déjà lire en tapant
 * l'adresse — il n'y a ni cookie, ni session, ni en-tête d'authentification accepté ici, donc rien
 * qu'un navigateur puisse joindre à la requête à l'insu de son visiteur.
 */
function baseHeaders(cacheControl: string, etag: string | undefined): Headers {
	const headers = new Headers({
		'access-control-allow-origin': '*',
		'access-control-allow-methods': 'GET, HEAD, OPTIONS',
		// Aucun en-tête d'authentification n'est accepté : la liste est close, et elle ne contient
		// que ce qu'un cache a besoin de voir.
		'access-control-allow-headers': 'if-none-match',
		'access-control-expose-headers': 'etag',
		'access-control-max-age': '86400',
		'cache-control': cacheControl,
		// La réponse dépend de l'origine demandée seulement par l'en-tête CORS, jamais par le corps.
		vary: 'accept-encoding',
		'x-content-type-options': 'nosniff',
		// Une balise `meta` ne vit que dans du HTML : c'est donc l'en-tête qui retire du référencement
		// ce qui n'est pas une page — le JSON de l'API, les flux `.ics`, le fichier du widget. Ils
		// restent explorables, ce qui est nécessaire : une adresse interdite d'exploration ne peut
		// porter aucune consigne d'indexation, puisque le robot ne la lit jamais (ADR 0029).
		'x-robots-tag': 'noindex'
	});
	if (etag) headers.set('etag', etag);
	return headers;
}

export interface PublicResponseOptions {
	cacheControl: string;
	etag?: string | undefined;
	contentType?: string;
	filename?: string;
}

/**
 * Rend une réponse publique, ou un `304` si le client a déjà cette version. Le `304` ne porte pas
 * de corps : c'est tout l'intérêt, et c'est ce qui rend le widget d'une organisation peu coûteux à
 * rafraîchir.
 */
export function publicResponse(
	event: RequestEvent,
	body: string,
	options: PublicResponseOptions
): Response {
	const headers = baseHeaders(options.cacheControl, options.etag);
	if (options.filename) {
		headers.set('content-disposition', `inline; filename="${options.filename}"`);
	}
	const known = event.request.headers.get('if-none-match');
	if (options.etag && known && known.split(',').some((value) => value.trim() === options.etag)) {
		return new Response(null, { status: 304, headers });
	}
	headers.set('content-type', options.contentType ?? 'application/json; charset=utf-8');
	return new Response(body, { status: 200, headers });
}

/**
 * Une réponse d'erreur publique. Même forme pour tout le monde, et jamais un détail interne.
 *
 * Le `message` est facultatif et n'apparaît que là où le code ne suffit pas à corriger l'appel —
 * une plage trop longue, par exemple, où il faut dire la borne. Il ne décrit jamais l'état du
 * service, et il n'est pas destiné à être affiché à un visiteur : c'est du texte pour qui écrit un
 * client, donc en anglais comme le reste du contrat.
 */
export function publicError(status: number, code: string, message?: string): Response {
	const headers = baseHeaders('no-store', undefined);
	// Le type, sans quoi la réponse part en `text/plain` — c'est ce que `new Response(<chaîne>)`
	// pose par défaut. Le corps est du JSON, il doit se dire tel. Avec `x-content-type-options:
	// nosniff` juste au-dessus, un client sérieux a le droit de refuser de le lire, et il a raison.
	// Relevé sur le service en ligne le 2026-09-21, pas en relecture.
	headers.set('content-type', 'application/json; charset=utf-8');
	return new Response(JSON.stringify(message ? { error: code, message } : { error: code }), {
		status,
		headers
	});
}

/** La réponse au sondage préalable du navigateur, pour le widget d'une autre origine. */
export function publicOptions(): Response {
	return new Response(null, {
		status: 204,
		headers: baseHeaders('public, max-age=86400', undefined)
	});
}

/**
 * Consomme un jeton de débit pour cette adresse. Rend `false` quand la limite est atteinte ; la
 * route répond alors `429` sans rien lire de la base.
 */
export async function allowRequest(event: RequestEvent): Promise<boolean> {
	return consume(publicDatabase(), `public:${clientAddress(event)}`, BUDGET_PUBLIC);
}

/** La réponse de refus, avec l'indication de patience que les clients savent lire. */
export function tooManyRequests(): Response {
	const response = publicError(429, 'too_many_requests');
	response.headers.set('retry-after', String(BUDGET_PUBLIC.windowSeconds));
	return response;
}

// `robots.txt` (ADR 0029).
//
// Une seule règle autorise, une seule refuse, et la plus spécifique gagne — c'est-à-dire la plus
// longue en octets, quel que soit l'ordre des lignes. `/m/belvedere/fr` tombe sous `Allow: /m/`
// (quatre octets), `/reglages` sous `Disallow: /` (un octet).
//
// Un seul groupe `User-agent: *`. Ajouter un groupe nommé serait un piège : un robot ne retient que
// le groupe le plus spécifique qui le désigne, et ignore alors toutes les règles du groupe général.
//
// Le chemin de l'espace des responsables n'est pas dissimulé. La dissimulation ne protège rien : ce
// qui protège cet espace, c'est qu'il exige une session, et il porte déjà sa balise `noindex`.

import type { RequestHandler } from './$types.js';

/** Une journée est le cache habituel des robots ; une heure permet de corriger le jour même. */
const CACHE = 'public, max-age=3600';

export const GET: RequestHandler = ({ url }) => {
	// Les plans de site sont explicitement autorisés : un fichier interdit d'exploration ne serait
	// jamais lu, et la ligne `Sitemap` ci-dessous ne servirait à rien.
	const corps = [
		'User-agent: *',
		'Allow: /m/',
		'Allow: /sitemap',
		'Disallow: /',
		'',
		`Sitemap: ${new URL('/sitemap.xml', url.origin).toString()}`,
		''
	].join('\n');

	return new Response(corps, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': CACHE,
			'x-content-type-options': 'nosniff'
		}
	});
};

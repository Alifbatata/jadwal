// Le module de la vue d'écoute du direct (étape 25, ADR 0057) : il se branche sur le relais,
// décode le son, montre les sous-titres et garde l'écran allumé. Le raisonnement est écrit en tête
// de `src/lib/ecoute/ecoute.js`.
//
// **Un fichier, jamais du code en ligne**, pour la raison de `hors-reseau.js` : sur une page
// `csr = false`, aucun nonce n'est déclaré, et `script-src 'self'` laisse passer un fichier de la
// même origine. **Sous `/m/`**, à côté des organisations : un point n'entre pas dans leur adresse.
// La page ne le charge que sur la vue d'écoute.

import type { RequestHandler } from './$types.js';
import { publicOptions, publicResponse } from '#lib/server/api.js';
import { ECOUTE, ECOUTE_ETAG } from '#lib/server/ecoute.js';
import { CACHE_WIDGET_MOUVANT, JS_CONTENT_TYPE } from '#lib/server/widget.js';

export const GET: RequestHandler = (event) =>
	publicResponse(event, ECOUTE, {
		cacheControl: CACHE_WIDGET_MOUVANT,
		etag: ECOUTE_ETAG,
		contentType: JS_CONTENT_TYPE
	});

export const OPTIONS: RequestHandler = () => publicOptions();

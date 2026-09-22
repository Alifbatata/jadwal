// Le widget, à son adresse mouvante : celle qui reçoit les corrections sans que l'organisation
// touche à quoi que ce soit. Aucune empreinte d'intégrité n'est publiée pour elle — ce serait
// promettre que le fichier ne changera jamais, alors que c'est précisément ce qu'on attend d'elle.
//
// L'adresse versionnée et immuable est à côté, sous `/widget/<version>/` (ADR 0005).

import type { RequestHandler } from './$types.js';
import { publicOptions, publicResponse } from '$lib/server/api.js';
import { CACHE_WIDGET_MOUVANT, JS_CONTENT_TYPE, WIDGET, WIDGET_ETAG } from '$lib/server/widget.js';

// Pas de limitation de débit ici, et c'est délibéré : ce fichier est servi de mémoire, sans
// toucher la base, et il est chargé une fois par visiteur de chaque site d'organisation. Le compter
// dans le même seau que l'API ferait tomber les pages d'une grande organisation avant le programme.
export const GET: RequestHandler = (event) =>
	publicResponse(event, WIDGET, {
		cacheControl: CACHE_WIDGET_MOUVANT,
		etag: WIDGET_ETAG,
		contentType: JS_CONTENT_TYPE
	});

export const OPTIONS: RequestHandler = () => publicOptions();

// Le widget, à ses adresses versionnées et immuables : celles qu'un site strict épingle avec une
// empreinte d'intégrité (ADR 0005).
//
// Le segment de version est une empreinte du contenu : il change exactement quand le fichier change.
// **Toutes les versions déjà publiées restent servies, pour toujours.** Une organisation qui a
// collé l'adresse immuable la garde des années ; cesser de la servir ferait disparaître son
// programme de son site, sans message — une empreinte qui ne correspond plus ne dégrade pas, elle
// bloque.
//
// Une version inventée, elle, n'a jamais existé : elle répond `404`.

import { createHash } from 'node:crypto';
import type { RequestHandler } from './$types.js';
import { publicError, publicOptions, publicResponse } from '$lib/server/api.js';
import { CACHE_WIDGET_VERSIONNE, JS_CONTENT_TYPE, VERSIONS } from '$lib/server/widget.js';

export const GET: RequestHandler = (event) => {
	const source = VERSIONS.get(event.params.version);
	if (source === undefined) {
		return publicError(
			404,
			'not_found',
			'No widget was ever published at this version. Copy the current snippet from the sharing page.'
		);
	}
	// L'entité de validation est propre à la version : deux versions ne partagent pas une entrée de
	// cache, et une adresse immuable n'a de toute façon jamais à être revalidée.
	const etag = `"${createHash('sha256').update(Buffer.from(source, 'utf8')).digest('base64url').slice(0, 12)}"`;
	return publicResponse(event, source, {
		cacheControl: CACHE_WIDGET_VERSIONNE,
		etag,
		contentType: JS_CONTENT_TYPE
	});
};

export const OPTIONS: RequestHandler = () => publicOptions();

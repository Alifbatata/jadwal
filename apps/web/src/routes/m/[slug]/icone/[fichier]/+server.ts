// Les icônes de l'application d'une organisation (étape 24, ADR 0053) : dessinées par le serveur, à
// sa couleur d'accent (`#lib/server/icone.ts`).
//
// L'adresse porte la couleur, `?c=`, pour qu'un cache puisse garder l'image pour toujours ; ce
// paramètre ne choisit rien : l'icône est peinte avec la couleur de la base.

import type { RequestHandler } from './$types.js';
import { allowRequest, publicError, tooManyRequests } from '#lib/server/api.js';
import { CACHE_ICONE, ICONES } from '#lib/server/application.js';
import { iconePng } from '#lib/server/icone.js';
import { findOrganisation } from '#lib/server/public.js';

/**
 * Les icônes déjà dessinées, par taille, forme et couleur. Une image de 512 pixels se calcule en
 * quelques dizaines de millisecondes : autant ne le faire qu'une fois. Le nombre d'entrées est
 * borné, pour qu'une suite de couleurs ne remplisse pas la mémoire.
 */
const DEJA_DESSINEES = new Map<string, Uint8Array>();
const AU_PLUS = 64;

export const GET: RequestHandler = async (event) => {
	if (!(await allowRequest(event))) return tooManyRequests();
	const icone = Object.hasOwn(ICONES, event.params.fichier) ? ICONES[event.params.fichier] : null;
	if (!icone) return publicError(404, 'not_found');
	const organisation = await findOrganisation(event.params.slug);
	if (!organisation) return publicError(404, 'not_found');

	const cle = `${icone.taille}:${icone.masque}:${organisation.accent_color}`;
	let image = DEJA_DESSINEES.get(cle);
	if (!image) {
		image = iconePng({ ...icone, couleur: organisation.accent_color });
		if (DEJA_DESSINEES.size >= AU_PLUS) DEJA_DESSINEES.clear();
		DEJA_DESSINEES.set(cle, image);
	}
	return new Response(image as BodyInit, {
		headers: {
			'content-type': 'image/png',
			'cache-control': CACHE_ICONE,
			'x-content-type-options': 'nosniff'
		}
	});
};

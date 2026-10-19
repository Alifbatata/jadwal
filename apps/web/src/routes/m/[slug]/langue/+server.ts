// Le choix de la langue d'une page publique (étape 21) : une liste déroulante dans un formulaire
// `GET`, sans JavaScript, dont chaque choix est l'adresse de la page dans cette langue
// (`$lib/public/ChoixDeLangue.svelte`). Cette route y renvoie.
//
// L'adresse vient du navigateur, donc de n'importe qui : elle n'est suivie que si elle reste dans
// les pages de cette organisation, sur ce service. Toute autre, un autre site, une autre
// organisation, l'espace des responsables, ou rien, renvoie à la page de l'organisation. Le mode
// intégré survit au choix : sans lui, la page suivante n'annoncerait plus sa hauteur au widget.

import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = ({ params, url }) => {
	// `resolve` rend un chemin relatif à cette requête : on le lit en absolu pour le comparer.
	const accueil = new URL(resolve('/m/[slug]/[[langue=langue]]', { slug: params.slug }), url)
		.pathname;
	let vers: URL;
	try {
		vers = new URL(url.searchParams.get('vers') ?? '', url.origin);
	} catch {
		redirect(303, accueil);
	}
	const dedans =
		vers.origin === url.origin &&
		(vers.pathname === accueil || vers.pathname.startsWith(`${accueil}/`));
	if (!dedans) redirect(303, accueil);
	if (url.searchParams.get('embed') === '1') vers.searchParams.set('embed', '1');
	redirect(303, `${vers.pathname}${vers.search}`);
};

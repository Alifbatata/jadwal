// Le travailleur de service des pages publiques (étape 24, ADR 0054) : il garde la dernière page
// vue, pour qu'elle se relise quand le réseau ne répond pas.
//
// **Le réseau d'abord, toujours.** Tant que le serveur répond, ce fichier ne change rien à ce que la
// page affiche : il passe la requête, et garde une copie de la réponse. La copie ne sert qu'en
// secours, et elle le dit : le travailleur y montre le paragraphe « copie du … » que la page porte
// caché (`#lib/public/Copie.svelte`).
//
// Ce qu'il garde : les pages publiques qui ont été ouvertes sur ce navigateur, leurs feuilles de
// style et leurs icônes. Jamais l'API, jamais l'espace des responsables, hors de sa portée (`/m/`),
// jamais le cadre du widget. Tout ce qu'il garde est public : ces pages ne lisent ni session ni
// cookie (ADR 0027).
//
// Les décisions sont dans `#lib/hors-reseau/copie.ts`, éprouvées sans navigateur ; il ne reste ici
// que les gestes. Aucun import d'un autre fichier à l'exécution : la construction fond tout en un.

import { self } from '$app/service-worker';
import {
	aElaguer,
	DELAI_DU_RESEAU_MS,
	EN_TETE_COPIE,
	FICHIERS_GARDES,
	fichierAGarder,
	genreDeRequete,
	marquerCopie,
	pageAGarder,
	PAGES_GARDEES,
	reseauARepondu
} from '#lib/hors-reseau/copie.js';

/** Le préfixe de nos caches, et leur version : la changer vide les anciens à l'activation. */
const PREFIXE = 'jadwal-';
const PAGES = `${PREFIXE}pages-1`;
const FICHIERS = `${PREFIXE}fichiers-1`;

self.addEventListener('install', (event) => {
	// Rien à préparer : seul ce qui a été vu est gardé. Une version nouvelle prend la main tout de
	// suite, sans attendre que tous les onglets de l'ancienne soient fermés.
	event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const nom of await caches.keys()) {
				if (nom.startsWith(PREFIXE) && nom !== PAGES && nom !== FICHIERS) await caches.delete(nom);
			}
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	const genre = genreDeRequete({
		methode: request.method,
		mode: request.mode,
		destination: request.destination,
		url: request.url,
		portee: self.registration.scope
	});
	// Sans `respondWith`, le navigateur fait comme s'il n'y avait pas de travailleur.
	if (genre === 'page') event.respondWith(page(event));
	else if (genre === 'fichier') event.respondWith(fichier(event));
});

/** Range une réponse, puis retire les plus anciennes au-delà du plafond. Un échec ne casse rien. */
async function garder(
	cache: Cache,
	plafond: number,
	request: Request,
	reponse: Response
): Promise<void> {
	try {
		await cache.put(request, reponse);
		for (const ancienne of aElaguer(await cache.keys(), plafond)) await cache.delete(ancienne);
	} catch {
		// Plus de place, navigation privée : la page a déjà été servie, et le sera encore par le
		// réseau.
	}
}

/** La réponse du réseau, ou `null` si elle n'est pas arrivée à temps. */
function avantLeDelai(reponse: Promise<Response>): Promise<Response | null> {
	return Promise.race([
		reponse,
		new Promise<null>((resolve) => setTimeout(() => resolve(null), DELAI_DU_RESEAU_MS))
	]);
}

async function page(event: FetchEvent): Promise<Response> {
	const { request } = event;
	const cache = await caches.open(PAGES);
	const copie = await cache.match(request, { ignoreVary: true });

	// `no-cache` : la réponse vient du serveur, ou n'existe pas. Sans cela, le cache HTTP du
	// navigateur rend lui-même une page périmée quand le réseau manque (`stale-while-revalidate`
	// lui en donne le droit pendant une journée), et personne ne saurait que c'est une copie :
	// mesuré dans Chrome 157, la page revenait sans sa mention. Le serveur est donc interrogé à
	// chaque ouverture, comme il l'est par un navigateur dont le cache est vide.
	const duReseau = fetch(request, { cache: 'no-cache' }).then((reponse) => {
		const aGarder = pageAGarder({
			status: reponse.status,
			type: reponse.type,
			contentType: reponse.headers.get('content-type')
		});
		if (aGarder) {
			// La copie porte l'instant où elle a été gardée : c'est lui que la mention dira.
			const entetes = new Headers(reponse.headers);
			entetes.set(EN_TETE_COPIE, new Date().toISOString());
			const aRanger = new Response(reponse.clone().body, { status: 200, headers: entetes });
			event.waitUntil(garder(cache, PAGES_GARDEES, request, aRanger));
		}
		return reponse;
	});
	// Sans copie, rien à offrir d'autre que le réseau : sa réponse, ou son échec, tels quels.
	if (!copie) return duReseau;

	// Si la copie part avant la réponse, celle-ci est attendue quand même : elle sera la prochaine
	// copie.
	event.waitUntil(duReseau.then(noop, noop));
	try {
		const reponse = await avantLeDelai(duReseau);
		if (reponse && reseauARepondu(reponse.status)) return reponse;
	} catch {
		// Pas de réseau : la copie.
	}
	return servirCopie(copie);
}

function noop(): void {}

/** La page gardée, avec sa mention montrée et datée. */
async function servirCopie(copie: Response): Promise<Response> {
	const quand = new Date(copie.headers.get(EN_TETE_COPIE) ?? '');
	const html = await copie.text();
	const entetes = new Headers(copie.headers);
	// Le corps est réécrit : sa longueur et son encodage d'origine ne valent plus.
	entetes.delete('content-length');
	entetes.delete('content-encoding');
	return new Response(Number.isNaN(quand.getTime()) ? html : marquerCopie(html, quand), {
		status: 200,
		headers: entetes
	});
}

/** Un fichier qui ne change jamais : la copie d'abord, le réseau sinon. */
async function fichier(event: FetchEvent): Promise<Response> {
	const { request } = event;
	const cache = await caches.open(FICHIERS);
	const copie = await cache.match(request, { ignoreVary: true });
	if (copie) return copie;
	const reponse = await fetch(request);
	const aGarder = fichierAGarder({
		status: reponse.status,
		type: reponse.type,
		cacheControl: reponse.headers.get('cache-control')
	});
	if (aGarder) event.waitUntil(garder(cache, FICHIERS_GARDES, request, reponse.clone()));
	return reponse;
}

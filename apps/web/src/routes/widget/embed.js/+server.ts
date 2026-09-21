// Le script du mode intégré : celui que la page publique charge, et lui seul, quand elle est dans
// un cadre (ADR 0005).
//
// Il est servi depuis notre propre origine, en fichier et non en ligne. Ce n'est pas une préférence
// de style : sur une page `csr = false`, SvelteKit ne déclare **aucun** nonce dans l'en-tête de
// politique de sécurité du contenu — il n'en pose que pour les balises qu'il produit lui-même, et
// il n'en produit aucune. Un script en ligne y serait donc bloqué avec ou sans nonce, tandis que
// `script-src 'self'` autorise un fichier de la même origine sans rien ajouter.
//
// Pourquoi ce fichier fait ces deux choses-là, et pas d'autres :
//
// **La hauteur.** Aucune plateforme ne dimensionne un cadre d'un autre domaine ; l'issue du groupe
// de travail CSS sur le sujet était encore en conception début 2026. `postMessage` reste la seule
// voie. La mesure porte sur la boîte de bordure de `<html>` et non sur `scrollHeight`, qui vaut au
// moins la hauteur de la fenêtre — c'est-à-dire, dans un cadre, au moins ce que le parent vient
// d'imposer : il ne redescend jamais, et le cadre garderait son vide après un changement de langue.
// Le destinataire est `'*'` parce que le domaine de la mosquée est inconnu ; la valeur par défaut
// (notre propre origine) jetterait le message en silence, sans aucune trace en console. Ce qui part
// est un nombre de pixels, que quiconque voit le cadre connaît déjà.
//
// **Le remplacement.** Les navigations d'un contexte imbriqué sont linéarisées dans l'historique du
// contexte le plus haut : mesuré sur Chrome 153, trois clics dans le cadre et le bouton
// « précédent » du visiteur ne sort plus de la page de la mosquée. Deux `location.replace()`
// successifs, eux, n'ajoutent rien. Le prix est assumé et écrit dans `docs/INTEGRATION.md` : il n'y
// a plus de « précédent » à l'intérieur du widget.
//
// **Et rien d'autre.** Pas de demande de défilement, pas de thème, pas de mesure. Chaque geste de
// plus serait un message de plus à vérifier côté parent.

import type { RequestHandler } from './$types.js';
import { publicOptions, publicResponse } from '$lib/server/api.js';
import { CACHE_WIDGET_MOUVANT, EMBED, EMBED_ETAG, JS_CONTENT_TYPE } from '$lib/server/widget.js';

export const GET: RequestHandler = (event) =>
	publicResponse(event, EMBED, {
		cacheControl: CACHE_WIDGET_MOUVANT,
		etag: EMBED_ETAG,
		contentType: JS_CONTENT_TYPE
	});

export const OPTIONS: RequestHandler = () => publicOptions();

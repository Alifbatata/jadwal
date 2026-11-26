// Le script d'une page publique hors cadre : il enregistre le travailleur de service qui garde la
// dernière page vue, pour qu'elle se relise sans réseau (étape 24, ADR 0054).
//
// **Un fichier, jamais du code en ligne**, pour la raison écrite dans `widget/embed.js` : sur une
// page `csr = false`, SvelteKit ne déclare aucun nonce, donc un script en ligne serait bloqué par
// la politique de sécurité du contenu, tandis que `script-src 'self'` autorise un fichier de la
// même origine sans rien ajouter.
//
// **Pourquoi ce script existe**, alors que SvelteKit enregistre un travailleur de lui-même : il le
// fait depuis son script de démarrage, que les pages publiques n'ont pas (`csr = false`), et pour
// le site entier. L'enregistrement automatique est donc coupé (`serviceWorker.register` dans
// `vite.config.ts`), et celui-ci demande la portée `/m/` : l'espace des responsables n'est jamais
// sous la main d'un travailleur.
//
// **Sous `/m/`**, à côté des organisations : aucune ne peut porter ce nom, un point n'entre pas
// dans une adresse d'organisation. Et rien d'autre dans ce fichier : ni requête, ni mesure, ni
// stockage.

import type { RequestHandler } from './$types.js';
import { publicOptions, publicResponse } from '#lib/server/api.js';
import { ENREGISTREMENT, ENREGISTREMENT_ETAG } from '#lib/server/hors-reseau.js';
import { CACHE_WIDGET_MOUVANT, JS_CONTENT_TYPE } from '#lib/server/widget.js';

export const GET: RequestHandler = (event) =>
	publicResponse(event, ENREGISTREMENT, {
		cacheControl: CACHE_WIDGET_MOUVANT,
		etag: ENREGISTREMENT_ETAG,
		contentType: JS_CONTENT_TYPE
	});

export const OPTIONS: RequestHandler = () => publicOptions();

// Le segment de langue d'une page publique : `fr`, `de`, `it`, `en` ou `ar`, et rien d'autre. La liste
// est celle de `i18n.ts` : l'anglais y est entré à l'étape 18 sans que ce fichier ait à changer.
//
// Sans ce filtre, `/m/belvedere/cours` prendrait `cours` pour une langue, et la page d'un cours ne
// serait jamais atteinte. C'est le rôle exact d'un « matcher » de paramètre dans SvelteKit.

import { defineParams } from '@sveltejs/kit/params';
// `.ts` et non `.js`, ici seulement : à la construction, SvelteKit importe ce fichier par Node, sans
// Vite, et Node ne cherche pas `i18n.ts` derrière `i18n.js` (« Cannot find module »). `i18n.ts` doit
// donc rester lisible par Node seul : il n'importe que `@jadwal/core`, déjà construit. Un chemin
// relatif, et non `#lib` : TypeScript n'admet l'extension `.ts` que là
// (`rewriteRelativeImportExtensions`).
import { isLangue } from './lib/i18n.ts';

export const params = defineParams({
	langue: (param) => (isLangue(param) ? param : undefined)
});

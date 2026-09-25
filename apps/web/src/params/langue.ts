// Le segment de langue d'une page publique : `fr`, `de`, `it`, `en` ou `ar`, et rien d'autre. La liste
// est celle de `i18n.ts` : l'anglais y est entré à l'étape 18 sans que ce fichier ait à changer.
//
// Sans ce filtre, `/m/belvedere/cours` prendrait `cours` pour une langue, et la page d'un cours ne
// serait jamais atteinte. C'est le rôle exact d'un « matcher » de paramètre dans SvelteKit.

import type { ParamMatcher } from '@sveltejs/kit';
import { isLangue } from '$lib/i18n.js';

export const match: ParamMatcher = (param) => isLangue(param);

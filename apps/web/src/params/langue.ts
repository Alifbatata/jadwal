// Le segment de langue d'une page publique : `fr`, `de`, `it` ou `ar`, et rien d'autre.
//
// Sans ce filtre, `/m/belvedere/cours` prendrait `cours` pour une langue, et la page d'un cours ne
// serait jamais atteinte. C'est le rôle exact d'un « matcher » de paramètre dans SvelteKit.

import type { ParamMatcher } from '@sveltejs/kit';
import { LANGUES } from '$lib/i18n.js';

export const match: ParamMatcher = (param) => (LANGUES as readonly string[]).includes(param);

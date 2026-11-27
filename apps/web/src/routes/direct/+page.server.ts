// Le poste « Diffuser » : l'écran d'où une personne de l'organisation lance le direct du sermon
// (ADR 0055, ADR 0056).
//
// Le serveur ne fait ici que trois choses : vérifier qui demande (`mustBroadcast`), dire à la page
// où est le relais et vers quelles langues diffuser, et dire au hook d'ouvrir, sur cette réponse seule,
// le micro et la liaison vers le relais. Tout le reste se passe dans le navigateur : le micro,
// puis le relais, qui ne connaît de cette personne qu'un jeton (`jeton/+server.ts`).

import { mustBroadcast } from '#lib/server/guard.js';
import { broadcastLanguages } from '#lib/server/live.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async (event) => {
	const { context, live } = await mustBroadcast(event);
	event.locals.relay = live.url;
	return {
		organisation: { name: context.organizationName },
		/** La porte du poste sur le relais. Le jeton n'est pas ici : il se demande en appuyant. */
		relay: `${live.url}/broadcast`,
		/**
		 * Les langues que l'organisation a choisies et que ce relais sert, dans l'ordre du relais. Vide :
		 * l'écran le dit, et n'offre pas de bouton (ADR 0056 amendée).
		 */
		languages: broadcastLanguages(context.organizationLiveLanguages, live.languages)
	};
};

// Demander l'accès à jadwal (étape 22, ADR 0049).
//
// Ouverte à tous, connecté ou non : une organisation la remplit avant d'avoir un compte, et un
// compte sans organisation peut y arriver depuis « Vos organisations ». Elle marche sans
// JavaScript : un formulaire, une action, une réponse.
//
// Dans l'ordre : la saisie est vérifiée, et une saisie refusée revient avec ce qui a été tapé et une
// erreur par champ, sans rien consommer ; puis un jeton du budget de l'adresse IP ; puis la base.
// Déposée ou déjà en attente pour cette adresse, la réponse est la même, mot pour mot : l'écran ne
// dit pas qu'une adresse a déjà demandé (ADR 0017). La surcharge, par adresse IP ou pour tout le
// service, se dit, parce qu'elle ne dit rien de personne. Seule une demande déposée prévient
// l'exploitant.

import { fail } from '@sveltejs/kit';
import {
	ACCESS_REQUEST_MAX,
	allowAccessRequest,
	checkAccessRequest,
	notifyOperator,
	readAccessRequest,
	requestAccess
} from '$lib/server/access-requests.js';
import type { Actions, PageServerLoad } from './$types.js';

/** Les bornes de chaque champ, celles de la table, que la page pose en `maxlength`. */
export const load: PageServerLoad = () => ({ max: ACCESS_REQUEST_MAX });

export const actions: Actions = {
	default: async (event) => {
		const values = readAccessRequest(await event.request.formData());
		const errors = checkAccessRequest(values);
		if (Object.keys(errors).length > 0) return fail(400, { values, errors });
		if (!(await allowAccessRequest(event))) return fail(429, { values, tooMany: true });
		const outcome = await requestAccess(values, event.locals.langue ?? 'fr');
		if (outcome === 'full') return fail(429, { values, tooMany: true });
		if (outcome === 'recorded') await notifyOperator(event.url.origin);
		return { sent: true };
	}
};

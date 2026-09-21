import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth.js';
import type { Actions } from './$types.js';

export const actions: Actions = {
	// SvelteKit interdit de mêler une action par défaut et des actions nommées : les deux sont donc
	// nommées.
	ici: async ({ request }) => {
		try {
			await auth().api.signOut({ headers: request.headers });
		} catch (error) {
			// `signOut` lève quand il n'y a rien à fermer. Il n'y a alors rien à faire non plus, et
			// la personne doit quand même se retrouver sur la page de connexion.
			console.error('déconnexion :', error);
		}
		redirect(303, '/connexion');
	},
	// Déconnecte toutes les sessions de la personne, sur tous ses appareils.
	partout: async ({ request }) => {
		try {
			await auth().api.revokeSessions({ headers: request.headers });
		} catch {
			// `revokeSessions` lève quand il n'y a pas de session : il n'y a alors rien à révoquer.
		}
		await auth().api.signOut({ headers: request.headers });
		redirect(303, '/connexion');
	}
};

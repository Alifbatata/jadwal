// Le traducteur simulé : il ne traduit rien, n'appelle personne et ne demande aucune clé.
//
// Il rend à chaque langue le son qu'il reçoit, tel quel, et un texte par seconde de son, qui dit
// de lui-même qu'il est simulé : personne ne peut le prendre pour une traduction. Il sert à bâtir
// et à éprouver tout le reste — le relais, le poste « Diffuser », l'écoute, le parcours — avant
// qu'un service soit choisi sur un vrai prêche (étape 25, chantier 4).
//
// Il ne dépend ni de l'horloge ni d'un délai : la même entrée rend toujours la même sortie.

import { BYTES_PER_SECOND } from './audio.js';
import type { Translator } from './translator.js';

export const simulatedTranslator: Translator = {
	name: 'simulated',
	async open(languages, sink) {
		let received = 0;
		let seconds = 0;
		let closed = false;
		return {
			send(pcm) {
				if (closed) return;
				for (const language of languages) sink.audio(language, pcm);
				received += pcm.length;
				while (received >= (seconds + 1) * BYTES_PER_SECOND) {
					seconds++;
					for (const language of languages) {
						sink.text(language, `Traduction simulée (${language}), seconde ${seconds}.`, true);
					}
				}
			},
			close() {
				closed = true;
			}
		};
	}
};

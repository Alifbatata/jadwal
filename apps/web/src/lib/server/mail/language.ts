// La langue des courriels d'une requête (étape 18, retour D3).
//
// Un courriel part dans la langue de l'écran où le geste est fait : le lien de connexion, dans celle
// de l'écran de connexion d'où il est demandé. Le hook connaît cette langue pour chaque requête de
// l'espace et la pose ici, autour de la requête entière ; les courriels la lisent au moment où ils
// s'écrivent. L'invitation, elle, part depuis l'étape 19 dans la langue que la personne qui invite
// choisit dans le formulaire, celle de son écran d'abord : l'écran des membres la passe en paramètre.
//
// Pourquoi ici plutôt qu'en paramètre : les deux courriels s'écrivent en deux endroits qui ne voient
// pas la requête de la même façon. Le lien est écrit par Better Auth, dans son rappel d'envoi, qui ne
// reçoit que l'adresse et l'URL ; l'invitation, par l'écran des membres. Un stockage par contexte
// asynchrone suit la requête à travers les deux, sans variable globale qui mêlerait deux requêtes
// simultanées, comme la capture du lien de secours (`auth.ts`).
//
// Rien ici ne lit un compte : la langue vient de la requête, jamais de l'adresse à qui l'on écrit
// (ADR 0017).

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Langue } from '$lib/i18n.js';

const current = new AsyncLocalStorage<Langue>();

/** Joue `run` avec cette langue pour les courriels qu'il écrit. */
export function withMailLanguage<T>(language: Langue, run: () => T): T {
	return current.run(language, run);
}

/** La langue des courriels de la requête en cours ; le français hors de toute requête. */
export function mailLanguage(): Langue {
	return current.getStore() ?? 'fr';
}

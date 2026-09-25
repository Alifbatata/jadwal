// Voir https://svelte.dev/docs/kit/types#app.d.ts
/// <reference types="vite/client" />
// Les types de Vite déclarent `*?raw`, dont le service du widget se sert : le fichier construit est
// incorporé au serveur à la construction, parce que `packages/widget/dist` n'existe pas en
// production (ADR 0005).
import type { SignedIn } from '$lib/server/context.js';

declare global {
	namespace App {
		interface Error {
			message: string;
			/**
			 * La langue d'un 404 d'une adresse publique, pour que la page d'erreur de `/m/` parle
			 * celle que le hook écrit sur `<html>`. Posée par `introuvable`, seule à les poser toutes
			 * deux ; absente, la page d'erreur parle français.
			 */
			langue?: import('$lib/i18n.js').Langue | undefined;
		}
		interface Locals {
			/** Qui est connecté, d'après la session vérifiée côté serveur. `null` si personne. */
			person: SignedIn | null;
			/**
			 * L'organisation que cette requête a effectivement touchée. Posée par les routes qui
			 * ouvrent un contexte, lue après coup par le registre interne du super-admin : ainsi la
			 * trace dit où il est allé sans qu'on ait à le redemander à la base (ADR 0025).
			 */
			visited?: { id: string; slug: string } | undefined;
			/**
			 * La vue à compter, posée par une route publique et écrite par le hook après la
			 * réponse. Un seul point d'écriture pour tout le compteur (ADR 0032).
			 */
			vue?: import('$lib/server/vues.js').VueAcompter | undefined;
			/**
			 * La langue d'une page publique, posée par sa route quand la page va être rendue, et
			 * écrite par le hook sur `<html>`, avec son sens. Absente, le document est en français.
			 */
			langue?: import('$lib/i18n.js').Langue | undefined;
		}
	}
}

export {};

import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { bundledPackages } from './bundled-packages.js';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Mode runes forcé pour le projet, sauf pour les bibliothèques (inutile avec Svelte 6).
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// SvelteKit 3 fait demander `/_app/version.json` toutes les heures par chaque page
			// ouverte. jadwal n'en lit pas le résultat (`updated`), et une page laissée ouverte sur un
			// écran enverrait vingt-quatre requêtes par jour sans que personne n'ait rien demandé :
			// zéro, comme avec SvelteKit 2.
			version: { pollInterval: 0 },
			// Le travailleur de service (`src/service-worker`) ne sert que les pages publiques, pour
			// les relire sans réseau (ADR 0054). SvelteKit l'enregistrerait de lui-même depuis son
			// script de démarrage : jamais sur les pages publiques, qui n'en ont pas, et toujours dans
			// l'espace des responsables, pour le site entier. C'est donc `/m/hors-reseau.js` qui
			// l'enregistre, avec la portée `/m/`.
			serviceWorker: { register: false },
			// La configuration de SvelteKit vit ici et non dans un `svelte.config.js` : quand elle
			// est passée au greffon, ce fichier est ignoré, et on ne s'en apercevrait pas.
			csp: {
				// `nonce` plutôt que `auto` : c'est le seul mode qui fait ÉCHOUER la construction si
				// quelqu'un rend une page à l'avance. En `auto`, une page pré-rendue sort avec sa
				// politique en balise `meta`, d'où `frame-ancestors` est silencieusement retiré, et
				// sans aucun en-tête de sécurité puisqu'elle ne passe pas par le hook.
				mode: 'nonce',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:'],
					'font-src': ['self'],
					'connect-src': ['self'],
					// Empêche l'exfiltration d'un formulaire vers un autre site après injection.
					'form-action': ['self'],
					'base-uri': ['self'],
					'object-src': ['none']
					// Pas de `frame-ancestors` ici : la valeur dépend de la route, et cette
					// configuration est globale. Elle est ajoutée dans `hooks.server.ts`.
				}
			}
		}),
		// Le relevé du code tiers fondu dans le serveur et le client, pour l'avis des licences.
		bundledPackages()
	]
});

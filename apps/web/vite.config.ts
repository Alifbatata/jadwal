import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Mode runes forcé pour le projet, sauf pour les bibliothèques (inutile avec Svelte 6).
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
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
		})
	]
});

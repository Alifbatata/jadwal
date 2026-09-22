import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Deux projets : les tests unitaires, et ceux qui lancent un vrai serveur contre un vrai
// PostgreSQL. Les seconds partagent une base et un port : un fichier à la fois.
//
// Les tests unitaires tournent sans le greffon de SvelteKit, qui est celui qui pose l'alias `$lib`.
// Ils le reçoivent ici : `affichage.ts` et `agenda.ts` importent par lui, et sans lui leurs tests
// tombaient sur « Cannot find module '$lib/i18n.js' » avant la première assertion.
export default defineConfig({
	test: {
		projects: [
			{
				resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
				test: { name: 'unit', environment: 'node', include: ['src/**/*.test.ts'] }
			},
			{
				test: {
					name: 'acces',
					environment: 'node',
					include: ['tests/**/*.test.ts'],
					globalSetup: ['tests/global-setup.ts'],
					fileParallelism: false,
					maxWorkers: 1,
					sequence: { concurrent: false },
					testTimeout: 30_000,
					hookTimeout: 120_000
				}
			}
		]
	}
});

import { defineConfig } from 'vitest/config';

// Deux projets : les tests unitaires, et ceux qui exigent un vrai PostgreSQL. Les seconds partagent
// une seule base : un fichier à la fois.
export default defineConfig({
	test: {
		projects: [
			{ test: { name: 'unit', environment: 'node', include: ['src/**/*.test.ts'] } },
			{
				test: {
					name: 'db',
					environment: 'node',
					include: ['test/**/*.test.ts'],
					globalSetup: ['test/global-setup.ts'],
					fileParallelism: false,
					maxWorkers: 1,
					sequence: { concurrent: false },
					testTimeout: 30_000,
					hookTimeout: 60_000
				}
			}
		],
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts'],
			reporter: ['text', 'text-summary'],
			// `globalSetup` ne tourne que s'il y a au moins un test en file : si le motif `test/**`
			// cessait de correspondre, la base absente ne serait jamais détectée et la suite sortirait
			// en succès. Le seuil rattrape ce cas, et `src/is-wired.test.ts` le nomme.
			thresholds: { lines: 90, branches: 90 }
		}
	}
});

import { defineConfig } from 'vitest/config';

// Deux projets : les tests unitaires, et ceux qui lancent un vrai serveur contre un vrai
// PostgreSQL. Les seconds partagent une base et un port : un fichier à la fois.
export default defineConfig({
	test: {
		projects: [
			{ test: { name: 'unit', environment: 'node', include: ['src/**/*.test.ts'] } },
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

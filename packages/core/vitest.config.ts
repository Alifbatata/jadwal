import { defineConfig } from 'vitest/config';

// defineConfig et non defineProject : `coverage` est une option réservée à la racine, que
// defineProject rejette au typage. packages/core n'est pas un projet d'un workspace Vitest.
export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			// Tous les sources, y compris ceux qu'aucun test n'importe ; Vitest exclut d'office les
			// fichiers de test, la config et node_modules.
			include: ['src/**/*.ts'],
			// Aides de test importées par les tests seulement.
			exclude: ['src/**/test-helpers.ts'],
			reporter: ['text', 'text-summary'],
			// Seuil non atteint : « ERROR: Coverage for lines (x%) does not meet global threshold (90%) »
			// et code de sortie 1, donc échec de `pnpm test` et de la CI.
			thresholds: { lines: 90, branches: 90 }
		}
	}
});

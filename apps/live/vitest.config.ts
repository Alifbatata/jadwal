import { defineConfig } from 'vitest/config';

// `src/` : les pièces du relais, une à une, sans réseau ou sur un port que le système choisit.
// `tests/` : le programme lui-même, construit puis lancé comme en production.
export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		testTimeout: 15_000,
		hookTimeout: 60_000
	}
});

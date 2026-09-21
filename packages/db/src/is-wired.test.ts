// Garde-fou de câblage : `globalSetup` ne s'exécute que s'il y a au moins un test en file. Si le
// motif `test/**/*.test.ts` cessait de correspondre (fichier renommé, dossier déplacé), la base
// absente ne serait jamais détectée et la suite sortirait en succès sans rien avoir vérifié.
// Ce test-ci vit dans le projet « unit » : il est toujours collecté.

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));

describe('la suite qui a besoin de la base est bien câblée', () => {
	it('finds the database test files the db project collects', () => {
		const files = readdirSync(join(packageDir, 'test')).filter((name) => name.endsWith('.test.ts'));
		expect(
			files.length,
			'aucun fichier dans test/ : le projet « db » ne vérifierait rien'
		).toBeGreaterThanOrEqual(4);
		for (const expected of ['isolation.test.ts', 'catalog.test.ts', 'audit-log.test.ts']) {
			expect(files, expected).toContain(expected);
		}
	});
});

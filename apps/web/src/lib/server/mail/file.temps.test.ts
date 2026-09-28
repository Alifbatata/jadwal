// Le transport de développement, sous des écritures qui se croisent : quarante courriels de
// 600 000 caractères, écrits en même temps. Le test écrit vingt-quatre mégaoctets sur le disque, et sous
// la charge de la suite complète, il dépassait le délai de 5 s de Vitest (étape 18). Il tourne donc à
// part, dans `pnpm test:temps` (étape 19), avec un délai tiré d'une mesure : `CONTRIBUTING.md`, « Les
// tests liés au temps », dit comment. Le reste du transport est dans `file.test.ts`.

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileMailer, readOutbox } from './file.js';

/**
 * Le délai du test, en millisecondes : quinze fois le maximum mesuré à l'étape 19, sur cinq passages
 * du fichier sur le poste chargé (315 à 466 ms), arrondi à la seconde.
 */
const DELAI = 7_000;

let directory: string;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'jadwal-outbox-'));
});

afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

describe('corbeille de sortie', () => {
	it(
		'survives writes that cross each other, and leaves no temporary file behind',
		async () => {
			const mailer = new FileMailer(directory);
			await Promise.all(
				Array.from({ length: 40 }, (_, index) =>
					mailer.send({
						to: `personne${index}@example.test`,
						subject: `sujet ${index}`,
						// Une charge assez grosse pour qu'une écriture en append se déchire : c'est le cas
						// qui a fait écarter le fichier unique en lignes JSON.
						text: 'x'.repeat(600_000),
						html: '<p>x</p>'
					})
				)
			);
			const all = await readOutbox(directory);
			expect(all).toHaveLength(40);
			expect(new Set(all.map((mail) => mail.to)).size).toBe(40);
			const names = await readdir(directory);
			expect(names.filter((name) => name.endsWith('.tmp'))).toEqual([]);
		},
		DELAI
	);
});

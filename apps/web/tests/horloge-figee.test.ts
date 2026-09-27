// Le module qui pose l'horloge de Node à un instant donné, pour un serveur de test
// (`scripts/horloge-figee.mjs`). Il est éprouvé ici dans un vrai processus Node qui le charge par
// `--import`, comme le serveur de `public-prieres-agenda.test.ts` et comme le parcours automatique
// contre l'image de production.
//
// Relecture de l'étape 19 : l'horloge était figée tout à fait, `Date.now()` rendait toujours le même
// instant, et une durée mesurée par lui valait zéro. Une fenêtre de la limitation de débit
// (`consumeDetailed`, fenêtre fixe sur `Date.now()`) ne se rouvrait donc jamais : cinq demandes de
// lien de connexion par adresse, pour toute la vie du serveur. Et un instant qui n'existe pas, le
// 30 février, passait pour le 2 mars.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const HORLOGE = pathToFileURL(join(appDir, '..', '..', 'scripts', 'horloge-figee.mjs')).href;

/**
 * Ce qu'un processus à l'horloge posée lit : `Date.now()` au départ, une date construite sans
 * argument, `Date()` sans `new`, une date construite à partir d'une valeur, puis `Date.now()` après
 * une attente de 400 ms mesurée par une minuterie.
 */
const LECTURE = `
const depart = Date.now();
const construite = new Date().getTime();
const ecrite = Date();
const donnee = new Date(0).toISOString();
setTimeout(() => {
	process.stdout.write(JSON.stringify({ depart, construite, ecrite, donnee, apres: Date.now() }));
}, 400);
`;

function lancer(instant: string | undefined) {
	const env: NodeJS.ProcessEnv = { ...process.env };
	delete env['JADWAL_HORLOGE_FIGEE'];
	if (instant !== undefined) env['JADWAL_HORLOGE_FIGEE'] = instant;
	const sortie = spawnSync(process.execPath, ['--import', HORLOGE, '-e', LECTURE], {
		env,
		encoding: 'utf8'
	});
	return { code: sortie.status, sortie: sortie.stdout, erreur: sortie.stderr };
}

describe('l’horloge posée d’un serveur de test (scripts/horloge-figee.mjs)', () => {
	it('starts at its instant, and moves on at the real pace from there', () => {
		const { code, sortie, erreur } = lancer('2026-10-09T08:00:00Z');
		expect(code, erreur).toBe(0);
		const lu = JSON.parse(sortie) as {
			depart: number;
			construite: number;
			ecrite: string;
			donnee: string;
			apres: number;
		};
		const instant = Date.parse('2026-10-09T08:00:00Z');
		// Le départ est l'instant donné, à la durée près du chargement : le jour du passage réel est
		// loin, et une horloge qui l'aurait gardé tomberait ici.
		expect(lu.depart).toBeGreaterThanOrEqual(instant);
		expect(lu.depart).toBeLessThan(instant + 60_000);
		expect(lu.construite).toBeGreaterThanOrEqual(lu.depart);
		expect(lu.ecrite).toMatch(/^Fri Oct 09 2026 /);
		// Une date construite à partir d'une valeur reste celle de Node.
		expect(lu.donnee).toBe('1970-01-01T00:00:00.000Z');
		// Une durée mesurée par `Date.now()` est une vraie durée : la minuterie a attendu 400 ms.
		expect(lu.apres - lu.depart).toBeGreaterThanOrEqual(400);
	});

	it('reads an instant with its offset', () => {
		const { code, sortie, erreur } = lancer('2026-10-09T10:00:00+02:00');
		expect(code, erreur).toBe(0);
		const { depart } = JSON.parse(sortie) as { depart: number };
		expect(depart).toBeGreaterThanOrEqual(Date.parse('2026-10-09T08:00:00Z'));
		expect(depart).toBeLessThan(Date.parse('2026-10-09T08:01:00Z'));
	});

	it('says on its standard error where the clock starts, so that a server log shows it', () => {
		const { code, erreur } = lancer('2026-10-09T08:00:00Z');
		expect(code).toBe(0);
		expect(erreur).toContain(
			'horloge-figee : l’horloge de ce processus part du 2026-10-09T08:00:00.000Z'
		);
	});

	it.each([
		['a 30th of February', '2026-02-30T08:00:00Z'],
		['a thirteenth month', '2026-13-45T08:00:00Z'],
		['a 25th hour', '2026-10-09T25:00:00Z'],
		['a 60th minute', '2026-10-09T08:60:00Z'],
		['an offset of 25 hours', '2026-10-09T08:00:00+25:00'],
		['a day without its time', '2026-10-09'],
		['a time without its offset', '2026-10-09T08:00:00'],
		['an empty value', '']
	])('refuses to load on %s, and Node does not start', (_cas, instant) => {
		const { code, sortie, erreur } = lancer(instant);
		expect(code).not.toBe(0);
		expect(sortie).toBe('');
		expect(erreur).toContain('JADWAL_HORLOGE_FIGEE');
	});

	it('refuses to load without the variable', () => {
		const { code, erreur } = lancer(undefined);
		expect(code).not.toBe(0);
		expect(erreur).toContain('JADWAL_HORLOGE_FIGEE');
	});
});

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openCounter } from './counter.js';

const NOVEMBRE = Date.UTC(2026, 10, 27, 12, 0, 0);
const DECEMBRE = Date.UTC(2026, 11, 1, 0, 0, 0);

let dossier: string;
let fichier: string;

beforeEach(() => {
	dossier = mkdtempSync(join(tmpdir(), 'jadwal-live-compteur-'));
	fichier = join(dossier, 'compteur.json');
});
afterEach(() => {
	rmSync(dossier, { recursive: true, force: true });
});

describe('le compteur du temps facturé', () => {
	it("part de zéro quand le fichier n'existe pas, et l'écrit aussitôt", () => {
		const compteur = openCounter(fichier, NOVEMBRE);
		expect(compteur.seconds(NOVEMBRE)).toBe(0);
		// Écrit dès l'ouverture : un dossier où l'on ne peut pas écrire se voit au démarrage, pas
		// au milieu d'un direct.
		expect(JSON.parse(readFileSync(fichier, 'utf8'))).toEqual({ month: '2026-11', seconds: 0 });
	});

	it('additionne, et tient au redémarrage', () => {
		const compteur = openCounter(fichier, NOVEMBRE);
		compteur.add(NOVEMBRE, 150);
		compteur.add(NOVEMBRE, 240);
		expect(compteur.seconds(NOVEMBRE)).toBe(390);
		expect(openCounter(fichier, NOVEMBRE).seconds(NOVEMBRE)).toBe(390);
	});

	it("n'écrit que le mois et un nombre, et rien d'autre dans le dossier", () => {
		const compteur = openCounter(fichier, NOVEMBRE);
		compteur.add(NOVEMBRE, 420);
		expect(JSON.parse(readFileSync(fichier, 'utf8'))).toEqual({ month: '2026-11', seconds: 420 });
		expect(readdirSync(dossier)).toEqual(['compteur.json']);
	});

	it('repart de zéro au mois suivant', () => {
		const compteur = openCounter(fichier, NOVEMBRE);
		compteur.add(NOVEMBRE, 5400);
		expect(compteur.seconds(DECEMBRE)).toBe(0);
		compteur.add(DECEMBRE, 180);
		expect(compteur.seconds(DECEMBRE)).toBe(180);
		expect(JSON.parse(readFileSync(fichier, 'utf8'))).toEqual({ month: '2026-12', seconds: 180 });
		// Rouvert en décembre sur un fichier de novembre : zéro aussi.
		writeFileSync(fichier, JSON.stringify({ month: '2026-11', seconds: 5400 }));
		expect(openCounter(fichier, DECEMBRE).seconds(DECEMBRE)).toBe(0);
	});

	it('refuse un fichier illisible plutôt que de repartir de zéro', () => {
		const faux = [
			'pas du json',
			'',
			'{}',
			'null',
			'[]',
			JSON.stringify({ month: '2026-11' }),
			JSON.stringify({ month: 'novembre', seconds: 1 }),
			JSON.stringify({ month: '2026-13', seconds: 1 }),
			JSON.stringify({ month: '2026-11', seconds: -1 }),
			JSON.stringify({ month: '2026-11', seconds: 1.5 }),
			JSON.stringify({ month: '2026-11', seconds: '12' }),
			JSON.stringify({ month: '2026-11', seconds: 1, extra: 'x' })
		];
		for (const contenu of faux) {
			writeFileSync(fichier, contenu);
			expect(() => openCounter(fichier, NOVEMBRE), contenu).toThrow(/compteur/);
		}
	});

	it('refuse un dossier qui manque', () => {
		expect(() => openCounter(join(dossier, 'absent', 'compteur.json'), NOVEMBRE)).toThrow(
			/compteur/
		);
	});

	it("refuse d'ajouter autre chose qu'un nombre entier de secondes", () => {
		const compteur = openCounter(fichier, NOVEMBRE);
		for (const faux of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() => compteur.add(NOVEMBRE, faux)).toThrow();
		}
		expect(compteur.seconds(NOVEMBRE)).toBe(0);
	});
});

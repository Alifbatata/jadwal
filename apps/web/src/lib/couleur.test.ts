// Le contraste de la couleur d'accent (ADR 0031).
//
// Le test qui porte tout le fichier est le balayage exhaustif : les 16 777 216 couleurs sRGB, une
// par une, et pour chacune le contraste du texte calculé. Un test de propriété tiré au hasard
// dirait « je n'ai pas trouvé de contre-exemple » ; celui-ci dit « il n'y en a pas ».

import { describe, expect, it } from 'vitest';
import {
	BASCULE,
	BLANC,
	NOIR,
	accentValide,
	contraste,
	luminance,
	texteSur,
	variablesAccent
} from './couleur.js';

/** Le seuil de WCAG 2.2 pour du texte ordinaire (critère 1.4.3). */
const EXIGE = 4.5;

describe('la luminance et le contraste', () => {
	it('agrees with the reference values of the specification', () => {
		expect(luminance('#000000')).toBe(0);
		expect(luminance('#ffffff')).toBeCloseTo(1, 10);
		// Le gris à mi-chemin des valeurs codées : 21,59 % de luminance, et non 50 %. C'est tout
		// l'objet de la correction de gamma, et la raison pour laquelle « assombrir un peu » une
		// couleur ne dit rien de son contraste.
		expect(luminance('#808080')).toBeCloseTo(0.21586, 5);
	});

	it('gives the two extremes of the contrast range', () => {
		expect(contraste(NOIR, BLANC)).toBeCloseTo(21, 10);
		expect(contraste(BLANC, BLANC)).toBeCloseTo(1, 10);
		// Et il ne dépend pas de l'ordre des deux couleurs.
		expect(contraste(NOIR, BLANC)).toBe(contraste(BLANC, NOIR));
	});

	it('puts the switch exactly where the two contrasts meet', () => {
		// À la bascule, le contraste avec le noir et celui avec le blanc sont le même nombre.
		const versLeNoir = (BASCULE + 0.05) / 0.05;
		const versLeBlanc = 1.05 / (BASCULE + 0.05);
		expect(versLeNoir).toBeCloseTo(versLeBlanc, 10);
		expect(versLeNoir).toBeCloseTo(4.5826, 4);
		// C'est ce nombre, et lui seul, qui fait tenir la garantie : il est au-dessus de 4,5.
		expect(versLeNoir).toBeGreaterThan(EXIGE);
	});
});

describe('le texte posé sur la couleur', () => {
	it.each([
		['#000000', BLANC],
		['#0f766e', BLANC],
		['#1d4ed8', BLANC],
		['#ffffff', NOIR],
		['#fde68a', NOIR],
		['#c9b896', NOIR]
	])('writes on %s in %s', (fond, attendu) => {
		expect(texteSur(fond)).toBe(attendu);
	});

	it('reads a colour whatever its case', () => {
		expect(texteSur('#0F766E')).toBe(texteSur('#0f766e'));
	});

	it('never returns anything but black or white', () => {
		// La règle est là pour tenir : la couleur d'accent ne sert que de fond, et le texte ne prend
		// jamais une troisième teinte « qui irait bien ».
		for (const fond of ['#123456', '#abcdef', '#ff0000', '#00ff00', '#0000ff', '#7f7f7f']) {
			expect([NOIR, BLANC]).toContain(texteSur(fond));
		}
	});
});

describe('la garantie de contraste, sur toutes les couleurs', () => {
	it('keeps every one of the 16 777 216 sRGB colours above 4.5:1', () => {
		// Les luminances de canal sont précalculées : sans cela, seize millions de puissances 2,4
		// feraient de ce test une minute d'attente au lieu d'une fraction de seconde.
		const lineaire = new Float64Array(256);
		for (let valeur = 0; valeur < 256; valeur += 1) {
			const proportion = valeur / 255;
			lineaire[valeur] =
				proportion <= 0.04045 ? proportion / 12.92 : ((proportion + 0.055) / 1.055) ** 2.4;
		}

		let pire = Number.POSITIVE_INFINITY;
		let pireCouleur = '';
		for (let rouge = 0; rouge < 256; rouge += 1) {
			const partRouge = 0.2126 * (lineaire[rouge] as number);
			for (let vert = 0; vert < 256; vert += 1) {
				const partVert = partRouge + 0.7152 * (lineaire[vert] as number);
				for (let bleu = 0; bleu < 256; bleu += 1) {
					const clarte = partVert + 0.0722 * (lineaire[bleu] as number);
					// Le meilleur des deux, exactement ce que `texteSur` choisit.
					const rapport = Math.max((clarte + 0.05) / 0.05, 1.05 / (clarte + 0.05));
					if (rapport < pire) {
						pire = rapport;
						pireCouleur = `#${rouge.toString(16).padStart(2, '0')}${vert
							.toString(16)
							.padStart(2, '0')}${bleu.toString(16).padStart(2, '0')}`;
					}
				}
			}
		}

		expect(pire, `la pire couleur est ${pireCouleur}`).toBeGreaterThanOrEqual(EXIGE);
		// Et le pire cas vaut bien ce que la démonstration annonce : ni plus, ni moins.
		expect(pire).toBeCloseTo(4.5826, 3);
	});

	it('agrees with the exhaustive sweep, colour by colour, on a sample', () => {
		// Le balayage travaille sur des nombres ; celui-ci passe par les fonctions publiques, pour
		// que les deux chemins ne puissent pas diverger sans qu'on le voie.
		for (let graine = 0; graine < 2000; graine += 1) {
			// Une suite déterministe : un test qui change de valeurs à chaque exécution ne se rejoue
			// pas. Le multiplicateur vient de Knuth, la constante est celle de `numerical recipes`.
			const melange = (graine * 1664525 + 1013904223) >>> 0;
			const fond = `#${(melange & 0xffffff).toString(16).padStart(6, '0')}`;
			expect(contraste(fond, texteSur(fond)), fond).toBeGreaterThanOrEqual(EXIGE);
		}
	});
});

describe('ce que l’application pose dans la page', () => {
	it('falls back to the service tint when the colour is unreadable', () => {
		expect(accentValide(null)).toBe('#0f766e');
		expect(accentValide('')).toBe('#0f766e');
		expect(accentValide('vert')).toBe('#0f766e');
		expect(accentValide('#abc')).toBe('#0f766e');
		expect(accentValide('#0F766E')).toBe('#0f766e');
	});

	it('never writes one variable without the other', () => {
		// C'est tout l'intérêt d'avoir un seul endroit qui les fabrique : une page ne peut pas poser
		// un fond sans la couleur de texte qui va avec.
		const variables = variablesAccent('#fde68a');
		expect(variables).toContain('--accent: #fde68a');
		expect(variables).toContain(`--accent-texte: ${NOIR}`);
		expect(variablesAccent('#0f766e')).toContain(`--accent-texte: ${BLANC}`);
	});
});

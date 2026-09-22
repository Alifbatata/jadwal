// Le QR code : est-ce qu'il porte vraiment le lien ?
//
// Vérifier qu'un SVG « ressemble à un QR code » ne prouve rien. Ce fichier relit donc la matrice
// que la bibliothèque produit et en **redéchiffre** le texte, avec un décodeur écrit ici, qui ne
// partage aucune ligne avec l'encodeur. Si les deux tombent d'accord sur la chaîne de départ,
// l'encodage est juste ; s'ils divergent, l'un des deux a tort et le test le dit.
//
// Le décodeur ne couvre que ce dont l'écran a besoin : mode octet, version 1 à 6, un seul bloc de
// correction. C'est assez pour un lien d'organisation, et ce qui dépasse échoue bruyamment.

import { describe, expect, it } from 'vitest';
import { qrMatrix, qrSvg } from './qr.js';

/** Les modules de service : repères, séparateurs, synchronisation, alignement, format. */
function isFunctionModule(row: number, column: number, size: number): boolean {
	const inFinder =
		(row <= 8 && column <= 8) ||
		(row <= 8 && column >= size - 8) ||
		(row >= size - 8 && column <= 8);
	if (inFinder) return true;
	if (row === 6 || column === 6) return true;
	// Motif d'alignement des versions 2 à 6 : un seul, centré en (size - 7, size - 7).
	const centre = size - 7;
	if (
		size > 21 &&
		row >= centre - 2 &&
		row <= centre + 2 &&
		column >= centre - 2 &&
		column <= centre + 2
	) {
		return true;
	}
	return false;
}

/** Les huit masques de la norme, dans l'ordre. */
const MASKS: ((row: number, column: number) => boolean)[] = [
	(r, c) => (r + c) % 2 === 0,
	(r) => r % 2 === 0,
	(_r, c) => c % 3 === 0,
	(r, c) => (r + c) % 3 === 0,
	(r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
	(r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
	(r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
	(r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];

/** Le flux de bits, lu dans l'ordre en zigzag de la norme, une fois le masque retiré. */
function readBits(matrix: boolean[][], mask: (row: number, column: number) => boolean): number[] {
	const size = matrix.length;
	const bits: number[] = [];
	let upward = true;
	for (let right = size - 1; right >= 0; right -= 2) {
		// La colonne 6 est celle de synchronisation : elle ne porte pas de données, et les paires
		// de colonnes se décalent d'un cran à partir d'elle.
		const pair = right <= 6 ? right - 1 : right;
		if (pair < 0) break;
		for (let step = 0; step < size; step += 1) {
			const row = upward ? size - 1 - step : step;
			for (const column of [pair, pair - 1]) {
				if (column < 0 || isFunctionModule(row, column, size)) continue;
				const dark = matrix[row]?.[column] ?? false;
				bits.push(dark !== mask(row, column) ? 1 : 0);
			}
		}
		upward = !upward;
	}
	return bits;
}

function toNumber(bits: readonly number[]): number {
	return bits.reduce((total, bit) => total * 2 + bit, 0);
}

/** Le texte que porte la matrice, ou `null` si ce masque ne donne rien de lisible. */
function decodeWith(matrix: boolean[][], mask: (row: number, column: number) => boolean) {
	const bits = readBits(matrix, mask);
	// Mode octet : 0100. Tout autre mode n'est pas ce que nous encodons.
	if (toNumber(bits.slice(0, 4)) !== 0b0100) return null;
	const length = toNumber(bits.slice(4, 12));
	if (length === 0 || bits.length < 12 + length * 8) return null;
	const bytes: number[] = [];
	for (let index = 0; index < length; index += 1) {
		bytes.push(toNumber(bits.slice(12 + index * 8, 20 + index * 8)));
	}
	return new TextDecoder().decode(Uint8Array.from(bytes));
}

/** Le texte lu dans la matrice, en essayant les huit masques : un seul peut donner du sens. */
function decode(matrix: boolean[][]): string[] {
	return MASKS.map((mask) => decodeWith(matrix, mask)).filter(
		(texte): texte is string => texte !== null
	);
}

const LIEN = 'https://jadwal.test/m/belvedere';

describe('la matrice', () => {
	it('carries exactly the text it was given, read back by an independent decoder', () => {
		const lectures = decode(qrMatrix(LIEN));
		// Un seul masque doit rendre notre texte. Les sept autres rendent du bruit, donc rien de
		// lisible en mode octet — ou, au pire, autre chose que notre lien.
		expect(lectures).toContain(LIEN);
	});

	it('carries a different text when given a different one', () => {
		// Sans cela, un décodeur qui rendrait toujours la même chose passerait le test précédent.
		const autre = 'https://jadwal.test/m/bienne';
		expect(decode(qrMatrix(autre))).toContain(autre);
		expect(decode(qrMatrix(autre))).not.toContain(LIEN);
	});

	it('is square, and big enough to hold a link', () => {
		const matrix = qrMatrix(LIEN);
		expect(matrix.length).toBeGreaterThanOrEqual(21);
		for (const row of matrix) expect(row).toHaveLength(matrix.length);
	});

	it('places the three finder patterns where a reader looks for them', () => {
		const matrix = qrMatrix(LIEN);
		const size = matrix.length;
		for (const [row, column] of [
			[0, 0],
			[0, size - 7],
			[size - 7, 0]
		] as const) {
			// Le carré 7×7 : bord sombre, anneau clair, cœur 3×3 sombre.
			expect(matrix[row]?.[column], `repère ${row},${column}`).toBe(true);
			expect(matrix[row + 1]?.[column + 1]).toBe(false);
			expect(matrix[row + 3]?.[column + 3]).toBe(true);
		}
	});
});

describe('le SVG', () => {
	it('draws a white background and one path, with the quiet zone around it', () => {
		const svg = qrSvg(LIEN, { module: 4 });
		const size = qrMatrix(LIEN).length;
		expect(svg).toContain(`viewBox="0 0 ${(size + 8) * 4} ${(size + 8) * 4}"`);
		expect(svg).toContain('fill="#ffffff"');
		expect(svg.match(/<path/g)).toHaveLength(1);
	});

	it('says what it is, for someone who cannot see it', () => {
		expect(qrSvg(LIEN, { title: 'QR du lien public' })).toContain('aria-label="QR du lien public"');
	});

	it('escapes a quote in its label instead of breaking the document', () => {
		expect(qrSvg(LIEN, { title: 'le "lien"' })).toContain('aria-label="le &quot;lien&quot;"');
	});
});

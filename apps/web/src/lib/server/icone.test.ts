// L'icône de l'application d'une organisation (étape 24, ADR 0053) : un PNG produit par le serveur,
// à la couleur d'accent, sans fichier d'image ni dépendance. Ce test relit le fichier comme le ferait
// un navigateur : signature, blocs, sommes de contrôle, puis les pixels.

import { crc32, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { iconePng, TAILLES_D_ICONE } from './icone.js';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Les blocs d'un PNG, chacun avec sa somme de contrôle vérifiée. */
function blocs(png: Uint8Array): { type: string; donnees: Buffer }[] {
	const octets = Buffer.from(png);
	expect([...octets.subarray(0, 8)]).toEqual(SIGNATURE);
	const lus: { type: string; donnees: Buffer }[] = [];
	for (let position = 8; position < octets.length;) {
		const longueur = octets.readUInt32BE(position);
		const type = octets.toString('latin1', position + 4, position + 8);
		const donnees = octets.subarray(position + 8, position + 8 + longueur);
		const somme = octets.readUInt32BE(position + 8 + longueur);
		expect(somme, `somme de contrôle du bloc ${type}`).toBe(
			crc32(octets.subarray(position + 4, position + 8 + longueur))
		);
		lus.push({ type, donnees });
		position += 12 + longueur;
	}
	return lus;
}

/** L'image décodée : ses dimensions, et le pixel (rouge, vert, bleu, alpha) d'un point. */
function image(png: Uint8Array) {
	const lus = blocs(png);
	expect(lus.map((bloc) => bloc.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
	const entete = lus[0]?.donnees as Buffer;
	const largeur = entete.readUInt32BE(0);
	const hauteur = entete.readUInt32BE(4);
	// Huit bits par canal, rouge, vert, bleu et alpha, sans entrelacement.
	expect([...entete.subarray(8)]).toEqual([8, 6, 0, 0, 0]);
	const brut = inflateSync(lus[1]?.donnees as Buffer);
	expect(brut.length).toBe(hauteur * (1 + 4 * largeur));
	return {
		largeur,
		hauteur,
		pixel(x: number, y: number): number[] {
			const ligne = y * (1 + 4 * largeur);
			// Chaque ligne commence par son filtre : aucun.
			expect(brut[ligne]).toBe(0);
			return [...brut.subarray(ligne + 1 + 4 * x, ligne + 5 + 4 * x)];
		}
	};
}

const VERT = '#0f766e';
const EN_VERT = [0x0f, 0x76, 0x6e, 255];
const BLANC = [255, 255, 255, 255];

describe('l’icône de l’application', () => {
	it.each(TAILLES_D_ICONE)('is a valid PNG of %i pixels square', (taille) => {
		const lue = image(iconePng({ taille, couleur: VERT, masque: false }));
		expect([lue.largeur, lue.hauteur]).toEqual([taille, taille]);
	});

	it('draws a light card on the accent colour, with three lines of that colour', () => {
		const taille = 512;
		const lue = image(iconePng({ taille, couleur: VERT, masque: false }));
		const a = (part: number) => Math.round(part * taille);
		// Le fond, au-dessus de la carte.
		expect(lue.pixel(a(0.5), a(0.1))).toEqual(EN_VERT);
		// La carte, entre deux lignes.
		expect(lue.pixel(a(0.5), a(0.43))).toEqual(BLANC);
		expect(lue.pixel(a(0.5), a(0.57))).toEqual(BLANC);
		// Les trois lignes.
		for (const hauteur of [0.36, 0.5, 0.64]) {
			expect(lue.pixel(a(0.5), a(hauteur)), String(hauteur)).toEqual(EN_VERT);
		}
		// À gauche de la carte : le fond.
		expect(lue.pixel(a(0.15), a(0.5))).toEqual(EN_VERT);
	});

	it('rounds the corners of the ordinary icon, and fills the whole square of the maskable one', () => {
		const ordinaire = image(iconePng({ taille: 192, couleur: VERT, masque: false }));
		expect(ordinaire.pixel(0, 0)[3]).toBe(0);
		expect(ordinaire.pixel(191, 191)[3]).toBe(0);
		const masque = image(iconePng({ taille: 192, couleur: VERT, masque: true }));
		expect(masque.pixel(0, 0)).toEqual(EN_VERT);
		expect(masque.pixel(191, 191)).toEqual(EN_VERT);
		expect(masque.pixel(96, 0)).toEqual(EN_VERT);
	});

	it('keeps the card inside the safe zone of a maskable icon', () => {
		// Un système peut rogner l'icône en disque : tout ce qui compte tient dans un cercle de 40 %
		// de rayon. Hors de ce cercle, il n'y a que le fond.
		const taille = 512;
		const lue = image(iconePng({ taille, couleur: VERT, masque: true }));
		for (let x = 0; x < taille; x += 8) {
			for (let y = 0; y < taille; y += 8) {
				const distance = Math.hypot(x - taille / 2, y - taille / 2);
				if (distance > 0.4 * taille) expect(lue.pixel(x, y), `${x},${y}`).toEqual(EN_VERT);
			}
		}
	});

	it('draws a dark card on a light accent colour, so that the card always shows', () => {
		const lue = image(iconePng({ taille: 192, couleur: '#ffee00', masque: true }));
		const carte = lue.pixel(96, Math.round(0.43 * 192));
		expect(carte[3]).toBe(255);
		expect((carte[0] ?? 255) + (carte[1] ?? 255) + (carte[2] ?? 255)).toBeLessThan(3 * 0x40);
	});

	it('gives the same bytes for the same request', () => {
		const une = iconePng({ taille: 192, couleur: VERT, masque: false });
		const autre = iconePng({ taille: 192, couleur: VERT, masque: false });
		expect(Buffer.from(une).equals(Buffer.from(autre))).toBe(true);
	});

	it('falls back to the colour of the service when the colour is not one', () => {
		const lue = image(iconePng({ taille: 192, couleur: 'rouge', masque: true }));
		expect(lue.pixel(0, 0)).toEqual(EN_VERT);
	});
});

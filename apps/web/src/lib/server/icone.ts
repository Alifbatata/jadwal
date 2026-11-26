// L'icône de l'application d'une organisation (étape 24, ADR 0053).
//
// Une organisation n'a pas encore d'icône à elle, et rien de propre à une organisation n'est figé
// dans une construction : le serveur en dessine donc une, à sa couleur d'accent. Une carte claire
// avec trois lignes, qui dit « un programme » sans rien dire d'autre.
//
// Sans fichier d'image et sans dépendance : un PNG tient en trois blocs, et `node:zlib` donne la
// compression et la somme de contrôle. Les bords sont lissés par la couverture de chaque pixel,
// calculée sur la distance au bord de la forme.

import { crc32, deflateSync } from 'node:zlib';
import { accentValide, texteSur } from '#lib/couleur.js';

/** Les tailles servies : l'icône d'un iPhone, puis les deux que demande un manifeste. */
export const TAILLES_D_ICONE = [180, 192, 512] as const;
export type TailleDIcone = (typeof TAILLES_D_ICONE)[number];

type Couleur = readonly [number, number, number];

function enOctets(hex: string): Couleur {
	return [
		Number.parseInt(hex.slice(1, 3), 16),
		Number.parseInt(hex.slice(3, 5), 16),
		Number.parseInt(hex.slice(5, 7), 16)
	];
}

/** Un rectangle aux coins arrondis, en parts de la taille de l'icône. */
interface Forme {
	centre: readonly [number, number];
	demi: readonly [number, number];
	rayon: number;
	couleur: Couleur;
}

/**
 * La part d'un pixel que couvre une forme, de 0 à 1 : la distance signée du centre du pixel au bord
 * du rectangle arrondi, ramenée à une largeur d'un pixel. C'est ce qui lisse les bords.
 */
function couverture(forme: Forme, taille: number, x: number, y: number): number {
	const rayon = forme.rayon * taille;
	const dx = Math.abs(x + 0.5 - forme.centre[0] * taille) - (forme.demi[0] * taille - rayon);
	const dy = Math.abs(y + 0.5 - forme.centre[1] * taille) - (forme.demi[1] * taille - rayon);
	const dehors = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
	const dedans = Math.min(Math.max(dx, dy), 0);
	return Math.min(Math.max(0.5 - (dehors + dedans - rayon), 0), 1);
}

function bloc(type: string, donnees: Uint8Array): Buffer {
	const corps = Buffer.concat([Buffer.from(type, 'latin1'), donnees]);
	const tete = Buffer.alloc(4);
	tete.writeUInt32BE(donnees.length);
	const somme = Buffer.alloc(4);
	somme.writeUInt32BE(crc32(corps));
	return Buffer.concat([tete, corps, somme]);
}

/**
 * L'icône, en PNG. `masque` : l'icône « maskable » d'un manifeste, dont le fond remplit tout le
 * carré parce que le système la rogne à sa façon ; ce qui compte tient alors dans un cercle de 40 %
 * de rayon. Sinon, le fond a lui-même les coins arrondis, sur du transparent.
 */
export function iconePng(demande: {
	taille: TailleDIcone;
	couleur: string;
	masque: boolean;
}): Uint8Array {
	const { taille, masque } = demande;
	const accent = accentValide(demande.couleur);
	const fond = enOctets(accent);
	// La carte prend la couleur du texte posé sur l'accent : blanche sur une teinte sombre, sombre
	// sur une teinte claire. Elle se voit donc toujours (ADR 0031).
	const carte = enOctets(texteSur(accent));
	const formes: Forme[] = [
		{ centre: [0.5, 0.5], demi: [0.5, 0.5], rayon: masque ? 0 : 0.22, couleur: fond },
		{ centre: [0.5, 0.5], demi: [0.25, 0.28], rayon: 0.06, couleur: carte },
		...[0.36, 0.5, 0.64].map((hauteur): Forme => ({
			centre: [0.5, hauteur],
			demi: [0.17, 0.025],
			rayon: 0.025,
			couleur: fond
		}))
	];

	// Chaque ligne : un octet de filtre, aucun, puis quatre octets par pixel.
	const brut = Buffer.alloc(taille * (1 + 4 * taille));
	for (let y = 0; y < taille; y += 1) {
		const ligne = y * (1 + 4 * taille);
		for (let x = 0; x < taille; x += 1) {
			let rouge = 0;
			let vert = 0;
			let bleu = 0;
			let alpha = 0;
			for (const forme of formes) {
				const part = couverture(forme, taille, x, y);
				if (part === 0) continue;
				// La forme posée par-dessus ce qui est déjà là.
				const reste = alpha * (1 - part);
				const total = part + reste;
				rouge = (forme.couleur[0] * part + rouge * reste) / total;
				vert = (forme.couleur[1] * part + vert * reste) / total;
				bleu = (forme.couleur[2] * part + bleu * reste) / total;
				alpha = total;
			}
			const pixel = ligne + 1 + 4 * x;
			brut[pixel] = Math.round(rouge);
			brut[pixel + 1] = Math.round(vert);
			brut[pixel + 2] = Math.round(bleu);
			brut[pixel + 3] = Math.round(alpha * 255);
		}
	}

	const entete = Buffer.alloc(13);
	entete.writeUInt32BE(taille, 0);
	entete.writeUInt32BE(taille, 4);
	// Huit bits par canal, rouge, vert, bleu et alpha ; compression et filtre par défaut ; sans
	// entrelacement.
	entete.set([8, 6, 0, 0, 0], 8);
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		bloc('IHDR', entete),
		bloc('IDAT', deflateSync(brut, { level: 9 })),
		bloc('IEND', Buffer.alloc(0))
	]);
}

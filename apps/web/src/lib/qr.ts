// Un QR code, en SVG, sans image à servir ni police à charger.
//
// SVG plutôt que PNG : il se télécharge, s'imprime à n'importe quelle taille sans flou, et se colle
// dans un document. Il n'y a rien à stocker côté serveur — le code est recalculé à chaque affichage,
// pour quelques dixièmes de milliseconde.
//
// L'encodage vient de `qrcode-generator` (MIT, zéro dépendance). Ce fichier ne fait que la mise en
// forme : c'est la bibliothèque qui place les modules, et un test relit la matrice qu'elle produit
// pour vérifier qu'elle porte bien le texte demandé.

import qrcode from 'qrcode-generator';

/** Correction d'erreur moyenne : un QR collé sur une affiche prend des plis et des reflets. */
const CORRECTION = 'M';
/** Quatre modules de marge, exigés par la norme : sans eux, beaucoup de lecteurs échouent. */
const MARGE = 4;

export interface QrOptions {
	/** Taille d'un module en unités SVG. La taille finale s'ajuste par CSS, pas par ce nombre. */
	module?: number;
	title?: string;
}

/** La matrice de modules, noire ou blanche, telle que la bibliothèque la calcule. */
export function qrMatrix(text: string): boolean[][] {
	const code = qrcode(0, CORRECTION);
	code.addData(text);
	code.make();
	const count = code.getModuleCount();
	return Array.from({ length: count }, (_, row) =>
		Array.from({ length: count }, (_, column) => code.isDark(row, column))
	);
}

/**
 * Le SVG. Un seul chemin pour tous les modules sombres : un rectangle par module ferait des
 * milliers d'éléments, et certains lecteurs de PDF y renoncent.
 */
export function qrSvg(text: string, options: QrOptions = {}): string {
	const module = options.module ?? 4;
	const matrix = qrMatrix(text);
	const count = matrix.length;
	const taille = (count + MARGE * 2) * module;
	const segments: string[] = [];
	for (let row = 0; row < count; row += 1) {
		for (let column = 0; column < count; column += 1) {
			if (!matrix[row]?.[column]) continue;
			const x = (column + MARGE) * module;
			const y = (row + MARGE) * module;
			segments.push(`M${x} ${y}h${module}v${module}h-${module}z`);
		}
	}
	const titre = options.title ?? 'QR code du lien public';
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${taille} ${taille}"`,
		` role="img" aria-label="${titre.replaceAll('"', '&quot;')}" shape-rendering="crispEdges">`,
		`<rect width="${taille}" height="${taille}" fill="#ffffff"/>`,
		`<path fill="#000000" d="${segments.join('')}"/>`,
		'</svg>'
	].join('');
}

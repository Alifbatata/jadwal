// La couleur d'accent d'une organisation, et le texte qu'on pose dessus (ADR 0031).
//
// Une seule règle : **la couleur d'accent ne sert que de fond**. Jamais de texte coloré sur fond
// blanc, jamais la couleur comme seul indicateur d'un état. La couleur du texte posé sur ce fond
// n'est pas choisie, elle est calculée — noir ou blanc, celui des deux qui contraste le mieux.
//
// Ce que cela garantit, et ce n'est pas une impression : pour **toute** couleur sRGB, le meilleur
// des deux contrastes vaut au moins 4,58:1, donc toujours plus que les 4,5:1 qu'exige le critère
// 1.4.3 de WCAG. La démonstration tient en trois lignes. Le contraste avec le noir vaut
// (L + 0,05) / 0,05 et croît avec la luminance ; celui avec le blanc vaut 1,05 / (L + 0,05) et
// décroît. Le pire cas est donc leur point d'égalité : (L + 0,05)² = 0,0525, soit L ≈ 0,1791, où
// les deux valent √0,0525 / 0,05 ≈ 4,5826. `couleur.test.ts` le vérifie sur les 16 777 216 couleurs
// une par une, ce qui est plus fort qu'un test de propriété tiré au hasard.

/** Le noir et le blanc, les deux seules couleurs de texte que ce fichier sait rendre. */
export const NOIR = '#000000';
export const BLANC = '#ffffff';

/** `#0f766e` ou `#0F766E`. La saisie est déjà bornée à cette forme par l'écran des réglages. */
const HEXADECIMAL = /^#[0-9a-fA-F]{6}$/;

/**
 * La luminance relative d'un canal sRGB, de 0 à 1.
 *
 * Le seuil est 0,04045 et non 0,03928 : c'est celui de la spécification sRGB, et celui que WCAG 2.2
 * emploie aujourd'hui. L'écart entre les deux ne change aucun résultat à trois décimales, mais
 * autant écrire celui qui fait foi.
 */
function canal(valeur: number): number {
	const proportion = valeur / 255;
	return proportion <= 0.04045 ? proportion / 12.92 : ((proportion + 0.055) / 1.055) ** 2.4;
}

/** La luminance relative d'une couleur sRGB, de 0 (noir) à 1 (blanc). */
export function luminance(hex: string): number {
	const rouge = Number.parseInt(hex.slice(1, 3), 16);
	const vert = Number.parseInt(hex.slice(3, 5), 16);
	const bleu = Number.parseInt(hex.slice(5, 7), 16);
	return 0.2126 * canal(rouge) + 0.7152 * canal(vert) + 0.0722 * canal(bleu);
}

/** Le rapport de contraste entre deux couleurs, de 1:1 à 21:1. */
export function contraste(a: string, b: string): number {
	const premiere = luminance(a);
	const seconde = luminance(b);
	const claire = Math.max(premiere, seconde);
	const sombre = Math.min(premiere, seconde);
	return (claire + 0.05) / (sombre + 0.05);
}

/**
 * Le seuil de bascule, exact plutôt qu'approché : au-dessus, le noir contraste mieux ; au-dessous,
 * le blanc. Il vaut √0,0525 − 0,05, soit environ 0,1791, et c'est le point où les deux contrastes
 * sont égaux. Comparer les luminances à cette constante donne exactement le même résultat que
 * comparer les deux contrastes, en deux calculs de moins.
 */
export const BASCULE = Math.sqrt(1.05 * 0.05) - 0.05;

/** Le texte à poser sur ce fond : noir ou blanc, celui qui contraste le mieux. */
export function texteSur(hex: string): typeof NOIR | typeof BLANC {
	return luminance(hex) > BASCULE ? NOIR : BLANC;
}

/** Une couleur d'accent lisible, ou la teinte du service quand la saisie n'est pas une couleur. */
export function accentValide(hex: string | null | undefined): string {
	return hex && HEXADECIMAL.test(hex) ? hex.toLowerCase() : ACCENT_PAR_DEFAUT;
}

/** La teinte du service, celle qu'une organisation reçoit tant qu'elle n'en choisit pas d'autre. */
export const ACCENT_PAR_DEFAUT = '#0f766e';

export interface Accent {
	/** Le fond. */
	fond: string;
	/** Le texte posé dessus, calculé. */
	texte: string;
}

/**
 * Les deux variables CSS d'une page, prêtes à poser dans un attribut `style`. Un seul endroit les
 * fabrique, pour que `--accent-texte` ne puisse jamais être oubliée là où `--accent` est posée.
 */
export function variablesAccent(hex: string | null | undefined): string {
	const fond = accentValide(hex);
	return `--accent: ${fond}; --accent-texte: ${texteSur(fond)}`;
}

/** L'accent d'une organisation, pour les rares endroits qui ont besoin des deux valeurs séparées. */
export function accentDe(hex: string | null | undefined): Accent {
	const fond = accentValide(hex);
	return { fond, texte: texteSur(fond) };
}

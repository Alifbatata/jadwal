// Ce qu'une personne lit sur une page servie, et ce qu'il y reste de français quand la page est dans
// une autre langue (étape 18, retour D2).
//
// Un module d'aide, pas un fichier de test : chaque écran de l'espace éprouve ses cinq langues dans
// son propre fichier, avec ces trois fonctions. Aucune ne sait rien d'un écran en particulier.

/** Une date telle que la base l'écrit, `2026-09-26`, qui ne doit jamais se lire sur un écran. */
export const ISO_DATE = /(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/;

/** Les entités que Svelte écrit dans le texte et les attributs, rendues. */
function decode(texte: string): string {
	return texte
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&nbsp;', ' ')
		.replaceAll('&amp;', '&');
}

/**
 * Retire chaque élément qui porte `lang="<langue>"`, contenu compris. Les balises du même nom sont
 * comptées pour trouver la bonne fermeture : un bloc de texte en contient d'autres.
 */
function sansLesBlocsEn(html: string, langue: string): string {
	let reste = html;
	for (;;) {
		const ouverture = new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\blang="${langue}"[^>]*>`, 'i').exec(
			reste
		);
		if (!ouverture) return reste;
		const balise = ouverture[1] as string;
		const motif = new RegExp(`<${balise}\\b[^>]*>|</${balise}>`, 'gi');
		motif.lastIndex = ouverture.index + ouverture[0].length;
		let profondeur = 1;
		let fin = reste.length;
		for (let trouve = motif.exec(reste); trouve; trouve = motif.exec(reste)) {
			profondeur += trouve[0].startsWith('</') ? -1 : 1;
			if (profondeur === 0) {
				fin = trouve.index + trouve[0].length;
				break;
			}
		}
		reste = `${reste.slice(0, ouverture.index)} ${reste.slice(fin)}`;
	}
}

/** Le document sans ce qui ne se lit pas : scripts, styles, commentaires. */
function nettoye(html: string): string {
	return html
		.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ');
}

/**
 * Le texte lu : le titre de l'onglet et le corps, sans balise, blancs ramenés à une espace, entités
 * rendues. Une date dans une adresse de lien ou dans un `id` n'est pas lue, et n'y est donc pas.
 */
export function visibleText(html: string): string {
	const titre = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '';
	const corps = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
	return decode(
		nettoye(`${titre} ${corps}`)
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

/**
 * Chaque morceau de texte d'une page : le contenu de chaque nœud de texte, et les attributs qu'un
 * lecteur d'écran annonce ou qu'une personne voit (`aria-label`, `title`, `placeholder`, `alt`).
 * `sauf` retire d'abord les blocs d'une langue : les conditions, qui restent en français.
 */
export function textSegments(html: string, sauf?: string): Set<string> {
	const tete = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '';
	let corps = nettoye(html.match(/<body\b[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '');
	if (sauf) corps = sansLesBlocsEn(corps, sauf);
	const morceaux = [tete, ...corps.split(/<[^>]+>/)];
	for (const trouve of corps.matchAll(/\s(?:aria-label|title|placeholder|alt)="([^"]*)"/g)) {
		morceaux.push(trouve[1] ?? '');
	}
	return new Set(
		morceaux.map((morceau) => decode(morceau).replace(/\s+/g, ' ').trim()).filter(Boolean)
	);
}

/**
 * Au moins deux mots de deux lettres : une phrase, et non un nom propre ou le nom d'une langue. Un
 * trait d'union ne sépare pas deux mots : « Super-admin » s'écrit de même en italien.
 */
const PHRASE = /\p{L}{2,}[^\p{L}-]+\p{L}{2,}/u;

/**
 * Les morceaux de phrase français qu'on retrouve tels quels dans la même page servie dans une autre
 * langue : ceux qu'on a oublié de traduire. `permis` écarte ce qui est pareil dans toutes les langues
 * par nature, comme le nom d'une organisation ou une adresse électronique.
 */
export function frenchLeft(
	francais: string,
	autre: string,
	permis: readonly string[] = []
): string[] {
	const dansLeFrancais = textSegments(francais, 'fr');
	return [...textSegments(autre, 'fr')].filter(
		(morceau) => dansLeFrancais.has(morceau) && PHRASE.test(morceau) && !permis.includes(morceau)
	);
}

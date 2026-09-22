// @ts-check
/**
 * La mise en mots de `docs/CONDITIONS.md` : Markdown vers HTML, puis typographie française.
 *
 * Deux lecteurs, et un seul texte : le PDF pour le juriste (`scripts/conditions-pdf.mjs`) et la page
 * `/conditions` de l'application. Tous deux passent par ce module, pour que ce que le juriste a lu
 * soit, au caractère près, ce que les organisations acceptent.
 *
 * JavaScript et non TypeScript : le script du PDF est lancé par Node sans étape de construction, et
 * l'application l'importe tel quel. Les types sont en JSDoc, et `svelte-check` les vérifie.
 *
 * La source est le document du dépôt, relu et versionné : ce convertisseur n'est pas un filtre
 * contre un texte hostile, et il ne doit jamais recevoir un texte écrit par un visiteur.
 */

// ------------------------------------------------------------------------------------------------
// Un convertisseur Markdown réduit à ce que ce document emploie : titres, paragraphes, listes,
// tableaux, gras, italique, code. Pas de bibliothèque : ce fichier-là est la seule chose à relire
// pour savoir ce qui est rendu, et le document est connu.
// ------------------------------------------------------------------------------------------------

/** @param {string} texte */
const echapper = (texte) =>
	texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Le gras, l'italique, le code et les liens, dans une ligne déjà échappée.
 *
 * @param {string} texte
 */
function enligne(texte) {
	return echapper(texte)
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/**
 * La liste qu'ouvre une ligne, si elle ouvre un élément de liste.
 *
 * @param {string} ligne
 * @returns {'ol' | 'ul' | null}
 */
function genreDElement(ligne) {
	const puce = /^\s*([-*]|\d+\.)\s+/.exec(ligne);
	if (!puce) return null;
	return /^\d/.test(puce[1] ?? '') ? 'ol' : 'ul';
}

/**
 * Une ligne indentée qui n'ouvre pas d'élément : la suite de l'élément en cours.
 *
 * @param {string | undefined} ligne
 */
const estUneSuite = (ligne) =>
	ligne !== undefined && /^\s{2,}\S/.test(ligne) && genreDElement(ligne) === null;

/**
 * L'indice de la première ligne non vide à partir de `depuis`, ou la longueur du tableau.
 *
 * @param {string[]} lignes
 * @param {number} depuis
 */
function premiereNonVide(lignes, depuis) {
	let j = depuis;
	while (j < lignes.length && (lignes[j] ?? '').trim() === '') j += 1;
	return j;
}

/**
 * @param {string} markdown
 * @returns {string}
 */
export function versHtml(markdown) {
	const lignes = markdown.split(/\r?\n/);
	/** @type {string[]} */
	const sortie = [];
	let i = 0;
	/** @type {'ol' | 'ul' | null} */
	let liste = null;

	const fermerListe = () => {
		if (liste) {
			sortie.push(`</${liste}>`);
			liste = null;
		}
	};

	while (i < lignes.length) {
		const ligne = lignes[i] ?? '';

		if (ligne.trim() === '') {
			// Une ligne vide entre deux éléments de même genre ne ferme pas la liste : sans cela,
			// la liste numérotée repartait à 1 après un élément de plusieurs paragraphes.
			if (liste === null || genreDElement(lignes[premiereNonVide(lignes, i)] ?? '') !== liste) {
				fermerListe();
			}
			i += 1;
			continue;
		}

		const titre = /^(#{1,6})\s+(.*)$/.exec(ligne);
		if (titre) {
			fermerListe();
			const niveau = (titre[1] ?? '').length;
			sortie.push(`<h${niveau}>${enligne(titre[2] ?? '')}</h${niveau}>`);
			i += 1;
			continue;
		}

		// Un tableau : une ligne de cellules, puis une ligne de tirets, puis le corps.
		if (ligne.trim().startsWith('|') && /^\s*\|[\s:|-]+\|\s*$/.test(lignes[i + 1] ?? '')) {
			fermerListe();
			/** @param {string} l */
			const cellules = (l) =>
				l
					.trim()
					.replace(/^\||\|$/g, '')
					.split('|')
					.map((c) => c.trim());
			const entetes = cellules(ligne);
			i += 2;
			const corps = [];
			while (i < lignes.length && (lignes[i] ?? '').trim().startsWith('|')) {
				corps.push(cellules(lignes[i] ?? ''));
				i += 1;
			}
			sortie.push('<table>');
			sortie.push(
				`<thead><tr>${entetes.map((c) => `<th>${enligne(c)}</th>`).join('')}</tr></thead>`
			);
			sortie.push('<tbody>');
			for (const rangee of corps) {
				sortie.push(`<tr>${rangee.map((c) => `<td>${enligne(c)}</td>`).join('')}</tr>`);
			}
			sortie.push('</tbody></table>');
			continue;
		}

		const puce = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(ligne);
		if (puce) {
			const voulue = /^\d/.test(puce[2] ?? '') ? 'ol' : 'ul';
			if (liste !== voulue) {
				fermerListe();
				sortie.push(`<${voulue}>`);
				liste = voulue;
			}
			/** @type {string[]} */
			const paragraphes = [];
			let courant = [puce[3] ?? ''];
			i += 1;
			while (i < lignes.length) {
				// Une puce continue sur les lignes suivantes, indentées.
				if (estUneSuite(lignes[i])) {
					courant.push((lignes[i] ?? '').trim());
					i += 1;
					continue;
				}
				// Une ligne vide, puis une ligne indentée qui n'est pas un nouvel élément : un autre
				// paragraphe du même élément, comme celui qui suit les passkeys.
				const apres = premiereNonVide(lignes, i);
				if (apres > i && estUneSuite(lignes[apres])) {
					paragraphes.push(courant.join(' '));
					courant = [];
					i = apres;
					continue;
				}
				break;
			}
			paragraphes.push(courant.join(' '));
			// Un élément d'un seul paragraphe reste nu : c'est le cas de presque tous, et la feuille
			// de style n'a pas à défaire la marge d'un `<p>` qui n'aurait rien à séparer.
			sortie.push(
				paragraphes.length === 1
					? `<li>${enligne(paragraphes[0] ?? '')}</li>`
					: `<li>${paragraphes.map((p) => `<p>${enligne(p)}</p>`).join('')}</li>`
			);
			continue;
		}

		// Un paragraphe : jusqu'à la prochaine ligne vide.
		fermerListe();
		const morceaux = [ligne.trim()];
		while (
			i + 1 < lignes.length &&
			(lignes[i + 1] ?? '').trim() !== '' &&
			!/^(#{1,6}\s|\s*[-*]\s|\s*\d+\.\s|\s*\|)/.test(lignes[i + 1] ?? '')
		) {
			i += 1;
			morceaux.push((lignes[i] ?? '').trim());
		}
		sortie.push(`<p>${enligne(morceaux.join(' '))}</p>`);
		i += 1;
	}
	fermerListe();
	return sortie.join('\n');
}

// ------------------------------------------------------------------------------------------------
// La typographie française, appliquée au rendu et à lui seul.
// ------------------------------------------------------------------------------------------------

/** Espace fine insécable, celle qui précède le point-virgule, l'exclamation et l'interrogation. */
const FINE = '\u202f';
/** Espace insécable, celle qui précède les deux-points et qui borde les guillemets. */
const INSECABLE = '\u00a0';

/**
 * Applique la typographie à un morceau de texte, hors balises et hors code.
 *
 * @param {string} texte
 * @returns {string}
 */
export function typographier(texte) {
	return (
		texte
			// L'apostrophe droite devient courbe, sauf dans une entité HTML.
			.replace(/'/g, '’')
			// Une espace ordinaire devant ces signes devient fine et insécable.
			.replace(/ +([;!?])/g, `${FINE}$1`)
			// Devant les deux-points, l'espace est insécable mais pleine.
			.replace(/ +:/g, `${INSECABLE}:`)
			// Les guillemets français serrent leur contenu.
			.replace(/« +/g, `«${INSECABLE}`)
			.replace(/ +»/g, `${INSECABLE}»`)
	);
}

/**
 * Parcourt le HTML et n'applique la typographie qu'au texte : ni les balises, ni leurs attributs, ni
 * le contenu des `<code>`, où une apostrophe courbe serait une faute. Ni celui des `<style>` et des
 * `<script>` : une espace insécable devant `:` y change un sélecteur en un autre, qui ne désigne
 * plus rien, et la règle disparaît sans bruit. C'est ce qui est arrivé au premier témoin de mise en
 * pages de l'étape 16.
 *
 * @param {string} html
 * @returns {string}
 */
export function typographierHtml(html) {
	let sortie = '';
	let reste = html;
	while (reste.length > 0) {
		const balise = reste.indexOf('<');
		if (balise < 0) {
			sortie += typographier(reste);
			break;
		}
		sortie += typographier(reste.slice(0, balise));
		const intouchable = /^<(code|style|script)\b/.exec(reste.slice(balise, balise + 8))?.[1];
		if (intouchable) {
			const fermeture = `</${intouchable}>`;
			const fin = reste.indexOf(fermeture, balise);
			const coupe = fin < 0 ? reste.length : fin + fermeture.length;
			sortie += reste.slice(balise, coupe);
			reste = reste.slice(coupe);
			continue;
		}
		const fin = reste.indexOf('>', balise);
		const coupe = fin < 0 ? reste.length : fin + 1;
		sortie += reste.slice(balise, coupe);
		reste = reste.slice(coupe);
	}
	return sortie;
}

// ------------------------------------------------------------------------------------------------
// La version du texte.
// ------------------------------------------------------------------------------------------------

/**
 * La date de la version, lue dans le document : une seule source, jamais deux.
 *
 * @param {string} markdown
 * @returns {string}
 */
export function dateDeLaVersion(markdown) {
	const trouve = /^Derni[eè]re mise [aà] jour\s*:\s*(.+?)\.?\s*$/m.exec(markdown);
	return trouve ? (trouve[1] ?? '').trim() : 'sans date';
}

const MOIS = [
	'janvier',
	'février',
	'mars',
	'avril',
	'mai',
	'juin',
	'juillet',
	'août',
	'septembre',
	'octobre',
	'novembre',
	'décembre'
];

/**
 * La version du texte, écrite en ISO : « 22 septembre 2026 » devient `2026-09-22`. C'est elle que
 * l'acceptation enregistre et que le pied du PDF annonce, en toutes lettres.
 *
 * Lève plutôt que d'inventer : une date illisible donnerait une version que personne n'a écrite, et
 * les acceptations enregistrées sous elle ne diraient plus ce qui a été accepté. Une date qui
 * n'existe pas, un 31 septembre, est illisible elle aussi.
 *
 * @param {string} markdown
 * @returns {string}
 */
export function versionIso(markdown) {
	const date = dateDeLaVersion(markdown);
	const trouve = /^(1er|\d{1,2}) (\p{L}+) (\d{4})$/u.exec(date);
	const mois = MOIS.indexOf((trouve?.[2] ?? '').toLowerCase()) + 1;
	const jour = trouve?.[1] === '1er' ? 1 : Number(trouve?.[1]);
	const annee = Number(trouve?.[3]);
	const jourDuCalendrier = new Date(Date.UTC(annee, mois - 1, jour));
	if (
		!trouve ||
		mois === 0 ||
		jourDuCalendrier.getUTCFullYear() !== annee ||
		jourDuCalendrier.getUTCMonth() !== mois - 1 ||
		jourDuCalendrier.getUTCDate() !== jour
	) {
		throw new Error(`date de « Dernière mise à jour » illisible : « ${date} »`);
	}
	const deux = (/** @type {number} */ n) => String(n).padStart(2, '0');
	return `${annee}-${deux(mois)}-${deux(jour)}`;
}

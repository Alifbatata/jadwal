#!/usr/bin/env node
/**
 * Met en page `docs/CONDITIONS.md`, et rend un PDF : le texte seul, pour qui veut l'imprimer ou
 * l'envoyer.
 *
 *     pnpm conditions:pdf
 *
 * Le document produit est `A_LIVRER/CONDITIONS-jadwal.pdf`. Il ne porte rien d'autre que le texte
 * des conditions, et un pied de page qui dit la version et le numéro de page.
 *
 * ## Pourquoi un script plutôt qu'un fichier tenu à la main
 *
 * `docs/CONDITIONS.md` est vivant : il change à chaque fois qu'un sous-traitant ou une durée de
 * rétention bouge. Un PDF recopié à la main serait faux la première fois qu'on oublierait de le
 * refaire, et personne ne le saurait. Ici, le PDF **est** le document, mis en page : il n'y a rien à
 * tenir à jour de séparé.
 *
 * ## L'exploitant
 *
 * Le texte du dépôt porte un nom d'exploitant par défaut. Une instance qui pose `JADWAL_EXPLOITANT`
 * se nomme elle-même, sur sa page `/conditions` comme dans ce PDF : les deux passent par
 * `nommerExploitant`.
 *
 * ## La typographie
 *
 * Le Markdown du dépôt s'écrit avec des apostrophes droites et des espaces ordinaires, parce que
 * c'est ce qu'on tape. Le rendu, lui, doit être en typographie française : apostrophe courbe, espace
 * fine insécable avant `;` `!` `?`, espace insécable avant `:` et à l'intérieur des guillemets. La
 * transformation est faite au rendu, et jamais dans le fichier source : personne n'a à taper des
 * caractères invisibles pour que le document soit correct.
 *
 * Le convertisseur Markdown et cette passe typographique vivent dans
 * `apps/web/src/lib/conditions/rendu.js`, que la page `/conditions` de l'application importe aussi :
 * le PDF et la page disent, au caractère près, le texte que les organisations acceptent, et non deux
 * rendus qui se ressemblent.
 *
 * ## Ce qu'il faut pour le lancer
 *
 * Chrome ou Chromium, déjà installé. Rien d'autre : aucune dépendance n'est ajoutée au dépôt.
 * `JADWAL_CHROME` pointe l'exécutable quand il n'est pas là où ce script le cherche.
 *
 * Le PDF est produit par le protocole de débogage de Chrome, et non par `--print-to-pdf`. La raison
 * tient en trois mots : « page x sur y ». Chrome ne sait pas numéroter les pages depuis une feuille
 * de style (il n'implémente pas les boîtes de marge de CSS), et l'option en ligne de commande ne
 * pose qu'un pied de page anglais qu'on ne choisit pas. Le protocole, lui, accepte un gabarit. Node
 * 22 et suivants portent un client WebSocket : il n'y a donc rien à installer pour lui parler.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne lit **que** `docs/CONDITIONS.md`. Aucun détail de la machine qui exploite l'instance n'entre
 * ici : ce document dit l'hébergeur et le pays des données, rien de plus.
 */
import { spawn } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
	dateDeLaVersion,
	nommerExploitant,
	typographier,
	typographierHtml,
	versHtml,
	versionIso
} from '../apps/web/src/lib/conditions/rendu.js';

// Ses épreuves et le correcteur les importent d'ici depuis l'étape 14 : ils n'ont pas à savoir où
// le rendu a déménagé.
export { dateDeLaVersion, nommerExploitant, typographier, typographierHtml, versHtml, versionIso };

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(racine, 'docs', 'CONDITIONS.md');
const SORTIE = join(racine, 'A_LIVRER', 'CONDITIONS-jadwal.pdf');

const STYLE = `
@page { size: A4; margin: 18mm 16mm 22mm 16mm; }
* { box-sizing: border-box; }
body {
	font-family: "Source Serif 4", Georgia, "Times New Roman", serif;
	font-size: 10.5pt; line-height: 1.5; color: #14171a; margin: 0;
	-webkit-print-color-adjust: exact; print-color-adjust: exact;
}
h1, h2, h3 { font-family: "Segoe UI", system-ui, sans-serif; line-height: 1.25; color: #0f1418; }
h1 { font-size: 20pt; margin: 0 0 4mm; }
h2 { font-size: 13pt; margin: 8mm 0 2.5mm; padding-bottom: 1.5mm; border-bottom: 0.4pt solid #c8ced4; break-after: avoid; }
h3 { font-size: 11pt; margin: 5mm 0 2mm; break-after: avoid; }
/* Aligné à gauche, jamais justifié : la justification creuse des rivières dans une colonne étroite. */
p { margin: 0 0 2.5mm; text-align: left; }
/* Aucun bloc coupé par une page. orphans et widows n'y suffisent pas : Chrome 153 ne les applique pas
   à l'impression, et un paragraphe de trois lignes y est coupé 2/1 même avec widows: 3 (essayé à
   l'étape 16). Seul break-inside: avoid est tenu. Un paragraphe ou une puce passe donc entier à la
   page suivante, un élément de plusieurs paragraphes se coupe entre eux, et la phrase qui annonce
   une liste la suit. Le test mesure le résultat dans le PDF plutôt que de le croire. */
p, li { break-inside: avoid; }
li:has(> p) { break-inside: auto; }
p:has(+ ul, + ol) { break-after: avoid; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1.2mm; text-align: left; }
/* Un élément de plusieurs paragraphes, celui des passkeys : l'écart qui le suit reste celui
   d'une puce. */
li > p:last-child { margin-bottom: 0; }
code { font-family: "Cascadia Mono", Consolas, monospace; font-size: 9pt; background: #f2f4f6; padding: 0 0.6mm; border-radius: 1mm; }
a { color: #14171a; text-decoration: none; border-bottom: 0.3pt solid #9aa4ad; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9.5pt; break-inside: avoid; }
th, td { border: 0.4pt solid #c8ced4; padding: 1.6mm 2.2mm; text-align: left; vertical-align: top; }
th { background: #eef1f4; font-family: "Segoe UI", system-ui, sans-serif; font-weight: 600; }
.document h1 { margin-bottom: 2mm; }
`;

/** Le document HTML qui part chez Chrome : le texte des conditions, rien d'autre. */
export function page(contenuMarkdown, styleEnPlus = '') {
	return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Conditions d'utilisation de jadwal</title>
<style>${STYLE}${styleEnPlus}</style>
</head>
<body>

<section class="document">
${contenuMarkdown}
</section>

</body>
</html>
`;
}

/** Chrome, là où il se trouve. */
function chrome() {
	const declare = process.env['JADWAL_CHROME'];
	if (declare) {
		if (!existsSync(declare)) {
			throw new Error(`JADWAL_CHROME pointe sur un fichier absent : ${declare}`);
		}
		return declare;
	}
	const candidats = [
		'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
		'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'/usr/bin/google-chrome',
		'/usr/bin/chromium',
		'/usr/bin/chromium-browser'
	];
	const trouve = candidats.find((c) => existsSync(c));
	if (!trouve) {
		throw new Error(
			'Chrome ou Chromium est introuvable. Poser JADWAL_CHROME sur le chemin de l’exécutable.'
		);
	}
	return trouve;
}

/**
 * Imprime une page locale en PDF par le protocole de débogage de Chrome.
 *
 * `--print-to-pdf` aurait suffi s'il ne fallait pas de pied de page. Il n'accepte aucun gabarit, et
 * Chrome ne sait pas numéroter les pages depuis CSS. Le protocole, lui, prend `footerTemplate`.
 */
export async function imprimer(chemin, sortie, pied) {
	// Chrome veut un profil à lui. Il va dans le dossier temporaire du système : A_LIVRER ne
	// contient que ce qui se livre, et un profil de navigateur ne se livre pas.
	const profil = mkdtempSync(join(tmpdir(), 'jadwal-conditions-'));
	const enfant = spawn(chrome(), [
		'--headless=new',
		'--disable-gpu',
		'--no-first-run',
		'--no-default-browser-check',
		'--remote-debugging-port=0',
		`--user-data-dir=${profil}`
	]);

	/** Chrome annonce son adresse sur la sortie d'erreur, et seulement là. */
	const adresse = await new Promise((resolue, rejetee) => {
		let tampon = '';
		const minuteur = setTimeout(
			() => rejetee(new Error(`Chrome n’a pas annoncé son adresse de débogage.\n${tampon}`)),
			30_000
		);
		enfant.stderr.on('data', (morceau) => {
			tampon += morceau.toString();
			const trouve = /ws:\/\/[^\s]+/.exec(tampon);
			if (trouve) {
				clearTimeout(minuteur);
				resolue(trouve[0]);
			}
		});
		enfant.on('exit', (code) => {
			clearTimeout(minuteur);
			rejetee(new Error(`Chrome s’est arrêté (code ${code}).\n${tampon}`));
		});
	});

	const socket = new WebSocket(adresse);
	let numero = 0;
	const attentes = new Map();
	const parSession = (sessionId) => (methode, params) =>
		new Promise((resolue, rejetee) => {
			numero += 1;
			attentes.set(numero, { resolue, rejetee });
			socket.send(JSON.stringify({ id: numero, method: methode, params, sessionId }));
		});
	const evenements = new Map();

	await new Promise((resolue, rejetee) => {
		socket.addEventListener('open', resolue, { once: true });
		socket.addEventListener('error', () => rejetee(new Error('connexion refusée par Chrome')), {
			once: true
		});
	});
	socket.addEventListener('message', (message) => {
		const donnee = JSON.parse(message.data);
		if (donnee.id !== undefined) {
			const attente = attentes.get(donnee.id);
			attentes.delete(donnee.id);
			if (!attente) return;
			if (donnee.error) attente.rejetee(new Error(JSON.stringify(donnee.error)));
			else attente.resolue(donnee.result);
			return;
		}
		const rappel = evenements.get(donnee.method);
		if (rappel) rappel(donnee.params);
	});

	try {
		const navigateur = parSession(undefined);
		const cible = await navigateur('Target.createTarget', { url: 'about:blank' });
		const attache = await navigateur('Target.attachToTarget', {
			targetId: cible.targetId,
			flatten: true
		});
		const onglet = parSession(attache.sessionId);
		await onglet('Page.enable', {});
		const chargee = new Promise((resolue) => evenements.set('Page.loadEventFired', resolue));
		await onglet('Page.navigate', { url: pathToFileURL(chemin).href });
		await chargee;
		// Les polices et la mise en page ont besoin d'un tour de boucle après le chargement.
		await new Promise((resolue) => setTimeout(resolue, 500));

		const rendu = await onglet('Page.printToPDF', {
			printBackground: true,
			preferCSSPageSize: true,
			displayHeaderFooter: pied !== null,
			headerTemplate: '<div></div>',
			footerTemplate: pied ?? ''
		});
		writeFileSync(sortie, Buffer.from(rendu.data, 'base64'));
	} finally {
		socket.close();
		// `kill()` rend la main avant que Windows n'ait lâché les fichiers du profil : sans cette
		// attente, l'effacement échoue avec EPERM et fait tomber le script alors que le PDF est fait.
		const fini = new Promise((resolue) => enfant.once('exit', resolue));
		enfant.kill();
		await Promise.race([fini, new Promise((resolue) => setTimeout(resolue, 5_000))]);
		try {
			rmSync(profil, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
		} catch {
			// Un profil temporaire laissé derrière n'est pas une raison de perdre le document.
		}
	}
}

/** La matrice identité, au format des opérateurs PDF : `a b c d e f`. */
const IDENTITE = [1, 0, 0, 1, 0, 0];

/**
 * Le produit de deux matrices PDF, la première appliquée d'abord. C'est l'ordre du format : `cm`
 * pose sa matrice devant la matrice courante, `Td` son déplacement devant la ligne de texte, et la
 * ligne de texte passe devant la matrice courante pour arriver sur la page.
 */
function composer([a, b, c, d, e, f], [a2, b2, c2, d2, e2, f2]) {
	return [
		a * a2 + b * c2,
		a * b2 + b * d2,
		c * a2 + d * c2,
		c * b2 + d * d2,
		e * a2 + f * c2 + e2,
		e * b2 + f * d2 + f2
	];
}

/**
 * Les jetons d'un flux de contenu : une chaîne entre parenthèses ou en hexadécimal, un nom, un
 * nombre, un opérateur, un crochet. Ce qui n'en est pas un, les `<<` et `>>` d'un dictionnaire de
 * balisage, est sauté.
 */
const JETON =
	/\((?:\\[\s\S]|[^\\)])*\)|<[0-9A-Fa-f\s]*>|\/[^\s/[\]()<>{}%]+|[-+]?(?:\d+\.?\d*|\.\d+)|[A-Za-z'"*]+|[[\]]/g;

/**
 * Les lignes de texte de chaque page, lues dans le PDF.
 *
 * ## Pourquoi on mesure le PDF, et pas la page dans le navigateur
 *
 * Chrome ne pagine qu'à l'impression. Dans le document, la mise en pages n'existe pas : tout est
 * une colonne continue, et `getClientRects()` rend des positions qui ne disent rien des pages. Le
 * PDF, lui, porte un flux de contenu par page, et chaque ligne de texte y pose sa position
 * verticale avec `Td` ou `Tm`. C'est donc le seul endroit où la question a une réponse.
 *
 * ## Pourquoi il faut composer les matrices
 *
 * La position qu'écrit `Tm` n'est pas une position sur la page : elle est exprimée dans le repère
 * courant, que chaque `cm` transforme et que `q` et `Q` empilent et dépilent. Chrome retourne l'axe
 * vertical dès la première ligne du flux, décale le document d'une page à l'autre, et dessine le
 * pied de page dans un repère à lui. Lu tel quel, `Tm` rendait donc chaque page **de bas en haut**,
 * pied de page en dernier : jusqu'à l'étape 15, le contrôle « en haut de page » regardait le bas,
 * et le contrôle « en bas de page » regardait le pied, qu'il écartait pour sa taille. `Td`, lui,
 * déplace depuis la ligne courante : l'ancien code le prenait pour une position absolue.
 *
 * Chaque ligne est donc ramenée sur la page, en points, origine en bas à gauche comme le veut le
 * format : la position est celle de l'origine du texte par `Tm` puis par la matrice courante, et le
 * corps est la taille de `Tf` mise à la même échelle (10,5 pour le texte courant).
 *
 * Le pied de page est écarté : il est sur chaque page, il ne dit rien de la mise en pages, et le
 * compter ferait passer une page presque vide pour une page à moitié pleine.
 */
export function lignesParPage(octets) {
	const brut = octets.toString('latin1');
	const flux = [];
	const motif = /stream\r?\n/g;
	let trouve;
	while ((trouve = motif.exec(brut)) !== null) {
		const debut = trouve.index + trouve[0].length;
		const fin = brut.indexOf('endstream', debut);
		if (fin < 0) continue;
		try {
			const clair = inflateSync(octets.subarray(debut, fin)).toString('latin1');
			if (/\bBT\b/.test(clair) && /\bTf\b/.test(clair)) flux.push(clair);
		} catch {
			/* un flux qui n'est ni compressé ni du contenu : une police, une image */
		}
	}

	return flux.map((contenu) => {
		const lignes = [];
		let matrice = IDENTITE;
		const pile = [];
		let ligneDeTexte = IDENTITE;
		let taille = 0;
		let operandes = [];
		// Les opérateurs se lisent dans l'ordre : la taille de police courante est celle du dernier
		// `Tf` rencontré, et c'est elle qui distingue un titre d'une ligne de texte.
		const poser = () => {
			const surLaPage = composer(ligneDeTexte, matrice);
			const y = surLaPage[5];
			// La marge basse est de 22 mm, soit 62 points : en dessous, c'est le pied de page.
			if (!Number.isFinite(y) || y < 62) return;
			const corps = taille * Math.hypot(surLaPage[2], surLaPage[3]);
			lignes.push({ y: Math.round(y * 10) / 10, corps: Math.round(corps * 100) / 100 });
		};
		for (const [jeton] of contenu.matchAll(JETON)) {
			if (/^[-+.\d]/.test(jeton)) {
				operandes.push(Number(jeton));
				continue;
			}
			// Une chaîne, un nom, un tableau : rien qui déplace, mais rien qui efface les nombres
			// d'avant, puisque `Tf` reçoit son nom de police avant sa taille.
			if (/^[(<[\]/]/.test(jeton)) continue;
			const six = operandes.slice(-6);
			if (jeton === 'q') pile.push(matrice);
			else if (jeton === 'Q') matrice = pile.pop() ?? IDENTITE;
			else if (jeton === 'cm' && six.length === 6) matrice = composer(six, matrice);
			else if (jeton === 'BT') ligneDeTexte = IDENTITE;
			else if (jeton === 'Tf') taille = operandes.at(-1) ?? taille;
			else if (jeton === 'Tm' && six.length === 6) {
				ligneDeTexte = six;
				poser();
			} else if ((jeton === 'Td' || jeton === 'TD') && operandes.length >= 2) {
				ligneDeTexte = composer([1, 0, 0, 1, ...operandes.slice(-2)], ligneDeTexte);
				poser();
			}
			operandes = [];
		}
		// Une même ligne peut être posée en plusieurs morceaux, pour du gras ou un lien.
		const parY = new Map();
		for (const ligne of lignes) {
			if (!parY.has(ligne.y) || parY.get(ligne.y) < ligne.corps) parY.set(ligne.y, ligne.corps);
		}
		return [...parY.entries()]
			.map(([y, corps]) => ({ y, corps }))
			.sort((gauche, droite) => droite.y - gauche.y);
	});
}

/**
 * Les objets du PDF, par numéro : le dictionnaire, et le flux décompressé quand il y en a un.
 *
 * La longueur d'un flux est lue dans son dictionnaire quand elle y est écrite : un flux binaire,
 * une police par exemple, peut porter par hasard les octets de `endobj` ou de `endstream`, et une
 * recherche de ces mots le couperait.
 */
function objetsDuPdf(octets) {
	const brut = octets.toString('latin1');
	const objets = new Map();
	const debutObjet = /(\d+) 0 obj\b/g;
	let trouve;
	while ((trouve = debutObjet.exec(brut)) !== null) {
		const apres = trouve.index + trouve[0].length;
		const fin = brut.indexOf('endobj', apres);
		if (fin < 0) break;
		const flux = brut.indexOf('stream', apres);
		if (flux < 0 || flux > fin) {
			objets.set(Number(trouve[1]), { dict: brut.slice(apres, fin), flux: null });
			debutObjet.lastIndex = fin;
			continue;
		}
		const dict = brut.slice(apres, flux);
		let depart = flux + 'stream'.length;
		if (brut[depart] === '\r') depart += 1;
		if (brut[depart] === '\n') depart += 1;
		const longueur = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
		const arrivee = longueur ? depart + Number(longueur[1]) : brut.indexOf('endstream', depart);
		let donnees = octets.subarray(depart, arrivee);
		if (/\/FlateDecode/.test(dict)) {
			try {
				donnees = inflateSync(donnees);
			} catch {
				donnees = null;
			}
		}
		objets.set(Number(trouve[1]), { dict, flux: donnees });
		debutObjet.lastIndex = Math.max(brut.indexOf('endobj', arrivee), apres);
	}
	return objets;
}

/** Une suite d'octets UTF-16 gros-boutien, écrite en hexadécimal, rendue en texte. */
function depuisUtf16(hexa) {
	const pair = hexa.length % 4 === 0 ? hexa : hexa.padStart(Math.ceil(hexa.length / 4) * 4, '0');
	return Buffer.from(pair, 'hex').swap16().toString('utf16le');
}

/**
 * La table d'une police, du code dessiné au texte qu'il représente, lue dans son `ToUnicode`.
 *
 * Chrome pose chaque police en `Type0`, codée `Identity-H` : le flux de contenu ne porte pas des
 * lettres mais des numéros de glyphes, sur deux octets. Seule cette table dit quelle lettre chacun
 * dessine. Les deux formes du format y sont lues : `bfchar`, un code pour un texte, et `bfrange`,
 * une plage de codes pour des textes qui se suivent, ou pour une liste de textes.
 */
function tableDUnicode(cmap) {
	const table = new Map();
	const espace = /begincodespacerange\s*<([0-9A-Fa-f]+)>/.exec(cmap);
	const largeur = espace ? espace[1].length / 2 : 2;
	for (const bloc of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
		for (const [, code, cible] of bloc[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
			table.set(parseInt(code, 16), depuisUtf16(cible));
		}
	}
	for (const bloc of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
		const plages = bloc[1].matchAll(
			/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])/g
		);
		for (const [, de, a, cible] of plages) {
			const premier = parseInt(de, 16);
			const dernier = parseInt(a, 16);
			const liste = cible.startsWith('[') ? [...cible.matchAll(/<([0-9A-Fa-f]+)>/g)] : null;
			for (let code = premier; code <= dernier; code += 1) {
				if (liste) {
					const hexa = liste[code - premier]?.[1];
					if (hexa) table.set(code, depuisUtf16(hexa));
					continue;
				}
				// Une plage : le dernier caractère du texte de départ avance avec le code.
				const depart = depuisUtf16(cible.slice(1, -1));
				table.set(
					code,
					depart.slice(0, -1) +
						String.fromCharCode(depart.charCodeAt(depart.length - 1) + code - premier)
				);
			}
		}
	}
	return { largeur, table };
}

/** Les octets d'une chaîne du flux de contenu, en hexadécimal ou entre parenthèses. */
function octetsDeLaChaine(jeton) {
	if (jeton.startsWith('<')) return Buffer.from(jeton.slice(1, -1).replace(/\s/g, ''), 'hex');
	const corps = jeton.slice(1, -1).replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (tout, echappe) => {
		const simples = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
		return simples[echappe] ?? String.fromCharCode(parseInt(echappe, 8));
	});
	return Buffer.from(corps, 'latin1');
}

/** Les pages, dans l'ordre du document : l'arbre des pages, descendu depuis sa racine. */
function pagesDansLOrdre(objets) {
	const racine = [...objets.values()].find(
		({ dict }) => /\/Type\s*\/Pages\b/.test(dict) && !/\/Parent\s/.test(dict)
	);
	const pages = [];
	const descendre = (noeud) => {
		const enfants = /\/Kids\s*\[([^\]]*)\]/.exec(noeud.dict)?.[1] ?? '';
		for (const [, numero] of enfants.matchAll(/(\d+)\s+0\s+R/g)) {
			const enfant = objets.get(Number(numero));
			if (!enfant) continue;
			if (/\/Type\s*\/Pages\b/.test(enfant.dict)) descendre(enfant);
			else pages.push(enfant);
		}
	};
	if (racine) descendre(racine);
	return pages;
}

/** Un dictionnaire écrit en place, ou l'objet qu'une référence désigne. */
function dictionnaire(objets, dict, cle) {
	const reference = new RegExp(`/${cle}\\s+(\\d+)\\s+0\\s+R`).exec(dict);
	if (reference) return objets.get(Number(reference[1]))?.dict ?? '';
	const debut = dict.search(new RegExp(`/${cle}\\s*<<`));
	if (debut < 0) return '';
	let profondeur = 0;
	for (let index = dict.indexOf('<<', debut); index < dict.length; index += 1) {
		if (dict.startsWith('<<', index)) {
			profondeur += 1;
			index += 1;
		} else if (dict.startsWith('>>', index)) {
			profondeur -= 1;
			index += 1;
			if (profondeur === 0) return dict.slice(debut, index + 1);
		}
	}
	return dict.slice(debut);
}

/**
 * Le texte que dessine chaque page, lu dans le PDF : une chaîne par page, dans l'ordre du document.
 *
 * ## Pourquoi il le lit, et comment
 *
 * Ce qui quitte le poste, c'est le PDF : un nom qui y serait dessiné, par le texte ou par le pied de
 * page, y serait lu, quel que soit l'endroit où il est entré. Le relire dans le HTML, avant Chrome,
 * laisserait passer le pied de page, que Chrome compose à part, et ce que la feuille de style
 * change.
 *
 * Chrome dessine chaque glyphe par son numéro, et l'espace est un glyphe comme un autre. Le texte
 * se retrouve donc par la table `ToUnicode` de chaque police, sans rien deviner. Il reste à séparer
 * les lignes : Chrome ouvre un bloc de texte (`BT`, `Tm`) par ligne et par changement de police.
 * Un bloc posé à une autre hauteur que le précédent commence une ligne ; un bloc posé loin à droite
 * du dernier glyphe, sur la même ligne, en est séparé par une espace (une autre cellule de tableau).
 * Un changement de police au milieu d'un mot, du gras par exemple, ne le coupe pas.
 */
export function texteDuPdf(octets) {
	const objets = objetsDuPdf(octets);
	const polices = new Map();
	const policeDe = (numero) => {
		if (!polices.has(numero)) {
			const dict = objets.get(numero)?.dict ?? '';
			const cmap = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(dict)?.[1];
			const flux = cmap ? objets.get(Number(cmap))?.flux : null;
			polices.set(numero, flux ? tableDUnicode(flux.toString('latin1')) : null);
		}
		return polices.get(numero);
	};

	return pagesDansLOrdre(objets).map((page) => {
		const ressources = dictionnaire(objets, page.dict, 'Resources');
		const nomsDePolices = new Map(
			[
				...dictionnaire(objets, ressources, 'Font').matchAll(/\/([^\s/<>[\]]+)\s+(\d+)\s+0\s+R/g)
			].map(([, nom, numero]) => [nom, Number(numero)])
		);
		const contenus = /\/Contents\s*(\[[^\]]*\]|\d+\s+0\s+R)/.exec(page.dict)?.[1] ?? '';
		const contenu = [...contenus.matchAll(/(\d+)\s+0\s+R/g)]
			.map(([, numero]) => objets.get(Number(numero))?.flux?.toString('latin1') ?? '')
			.join('\n');

		let texte = '';
		let police = null;
		let taille = 0;
		let matrice = IDENTITE;
		const pile = [];
		let ligneDeTexte = IDENTITE;
		/** La hauteur de la ligne en cours, et l'abscisse de son dernier glyphe, sur la page. */
		let dernier = null;
		let operandes = [];
		let tableau = null;
		const ecrire = (jeton) => {
			if (!police) return;
			const brut = octetsDeLaChaine(jeton);
			for (let index = 0; index + police.largeur <= brut.length; index += police.largeur) {
				// Un code absent de la table se voit, au lieu de disparaître du texte relu.
				texte += police.table.get(brut.readUIntBE(index, police.largeur)) ?? '\ufffd';
			}
		};
		const placer = () => {
			const surLaPage = composer(ligneDeTexte, matrice);
			const [x, y] = [surLaPage[4], surLaPage[5]];
			const corps = taille * Math.hypot(surLaPage[2], surLaPage[3]);
			if (dernier && Math.abs(y - dernier.y) > 1) texte += '\n';
			else if (dernier && x - dernier.x > 1.5 * corps) texte += ' ';
			dernier = { x, y };
		};
		for (const [jeton] of contenu.matchAll(JETON)) {
			if (tableau) {
				if (jeton === ']') {
					for (const element of tableau) if (/^[(<]/.test(element)) ecrire(element);
					operandes.push(tableau);
					tableau = null;
				} else tableau.push(jeton);
				continue;
			}
			if (jeton === '[') {
				tableau = [];
				continue;
			}
			if (/^[-+.\d]/.test(jeton) || /^[(<]/.test(jeton) || jeton.startsWith('/')) {
				operandes.push(jeton);
				continue;
			}
			const nombres = operandes
				.filter((o) => typeof o === 'string' && /^[-+.\d]/.test(o))
				.map(Number);
			const six = nombres.slice(-6);
			if (jeton === 'q') pile.push(matrice);
			else if (jeton === 'Q') matrice = pile.pop() ?? IDENTITE;
			else if (jeton === 'cm' && six.length === 6) matrice = composer(six, matrice);
			else if (jeton === 'BT') ligneDeTexte = IDENTITE;
			else if (jeton === 'Tf') {
				const nom = operandes.findLast((o) => typeof o === 'string' && o.startsWith('/'));
				police = nom ? policeDe(nomsDePolices.get(nom.slice(1))) : null;
				taille = nombres.at(-1) ?? taille;
			} else if (jeton === 'Tm' && six.length === 6) {
				ligneDeTexte = six;
				placer();
			} else if ((jeton === 'Td' || jeton === 'TD') && nombres.length >= 2) {
				const [dx, dy] = nombres.slice(-2);
				ligneDeTexte = composer([1, 0, 0, 1, dx, dy], ligneDeTexte);
				if (dy !== 0) placer();
				else if (dernier) dernier.x = composer(ligneDeTexte, matrice)[4];
			} else if (jeton === 'T*') texte += '\n';
			else if (jeton === 'Tj' || jeton === "'" || jeton === '"') {
				const chaine = operandes.findLast((o) => typeof o === 'string' && /^[(<]/.test(o));
				if (jeton !== 'Tj') texte += '\n';
				if (chaine) ecrire(chaine);
			}
			// `TJ` a déjà écrit ses chaînes à la fermeture du tableau.
			operandes = [];
		}
		return texte;
	});
}

/** La dernière page doit porter au moins ce nombre de lignes. */
export const LIGNES_MINIMUM_DERNIERE_PAGE = 8;

/**
 * Passé cet écart, compté en interlignes, deux lignes voisines n'appartiennent plus au même bloc.
 *
 * Calibré sur le PDF de l'étape 15, relu par `lignesParPage`. Entre deux lignes voisines du texte
 * courant, les écarts mesurés sont : 15 pt, l'interligne, 71 fois ; 15,7 à 15,8 pt, une ligne un
 * peu plus haute dans le même bloc, 3 fois ; 18 à 18,8 pt entre deux puces, 19 fois ; 21,7 à 24 pt
 * entre deux paragraphes, 19 fois. Dans un bloc, l'écart ne dépasse donc pas 1,05 interligne ;
 * entre deux blocs, il commence à 1,2. Le seuil est posé au milieu.
 *
 * L'ancien seuil était de 1,4 interligne : il ne voyait que la fin d'un paragraphe, jamais celle
 * d'une puce, dont la marge est plus courte (1,2 mm contre 2,5).
 */
export const ECART_ENTRE_DEUX_BLOCS = 1.12;

/**
 * Ce qui cloche dans la mise en pages, ou un tableau vide.
 *
 * Deux défauts, et un seul est évident à l'œil : une dernière page presque vide, et une ligne
 * restée seule en haut ou en bas d'une page.
 *
 * La seconde se mesure par les écarts. Dans un bloc, paragraphe ou puce, deux lignes sont
 * séparées d'un interligne ; entre deux blocs, l'écart est plus grand. Une première ligne de page
 * suivie d'un tel écart est donc la **fin** d'un bloc restée seule ; une dernière ligne précédée
 * d'un tel écart en est le **début**. Les titres sont écartés : ils ont leur propre taille, et un
 * titre en bas de page est déjà empêché par `break-after: avoid`.
 *
 * Un bloc d'une seule ligne en haut ou en bas de page est signalé lui aussi : rien, dans les
 * positions, ne le distingue d'une fin de bloc. Le contrôle préfère une mise en pages refaite pour
 * rien à une ligne seule dans le document imprimé.
 *
 * `ecart` ne sert qu'à l'épreuve : elle rejoue l'ancien seuil pour montrer ce qu'il laissait passer.
 */
export function defautsDeMiseEnPages(pages, { ecart = ECART_ENTRE_DEUX_BLOCS } = {}) {
	const defauts = [];
	const derniere = pages[pages.length - 1] ?? [];
	if (derniere.length < LIGNES_MINIMUM_DERNIERE_PAGE) {
		defauts.push(`la dernière page ne porte que ${derniere.length} ligne(s)`);
	}

	const corpsCourant = (() => {
		const tailles = new Map();
		for (const page of pages) {
			for (const ligne of page) tailles.set(ligne.corps, (tailles.get(ligne.corps) ?? 0) + 1);
		}
		return [...tailles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
	})();

	// L'interligne courant : l'écart le plus fréquent entre deux lignes voisines du texte courant.
	const ecarts = new Map();
	for (const page of pages) {
		for (let index = 1; index < page.length; index += 1) {
			if (page[index].corps !== corpsCourant || page[index - 1].corps !== corpsCourant) continue;
			const ecart = Math.round((page[index - 1].y - page[index].y) * 10) / 10;
			ecarts.set(ecart, (ecarts.get(ecart) ?? 0) + 1);
		}
	}
	const interligne = [...ecarts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
	if (interligne === 0) return defauts;
	const seuil = interligne * ecart;

	for (const [index, page] of pages.entries()) {
		if (page.length < 2) continue;
		if (page[0].corps === corpsCourant && page[0].y - page[1].y > seuil) {
			defauts.push(`page ${index + 1} : une ligne reste seule en haut`);
		}
		const dernier = page.length - 1;
		if (page[dernier].corps === corpsCourant && page[dernier - 1].y - page[dernier].y > seuil) {
			defauts.push(`page ${index + 1} : une ligne reste seule en bas`);
		}
	}
	return defauts;
}

/**
 * Le pied de page, tel que Chrome l'attend : un fragment autonome, avec sa propre feuille de style,
 * et les deux classes qu'il remplit lui-même. Sans `displayHeaderFooter`, il n'est pas dessiné ;
 * avec, et sans gabarit, Chrome pose le sien, en anglais.
 */
export function piedDePage(version) {
	return `<div style="width:100%;font-family:'Segoe UI',system-ui,sans-serif;font-size:7.5pt;
		color:#5a666f;padding:0 16mm;display:flex;justify-content:space-between;">
		<span>jadwal, conditions d’utilisation. Version du ${version}.</span>
		<span>page <span class="pageNumber"></span> sur <span class="totalPages"></span></span>
	</div>`;
}

/** Le document entier, mis en page et typographié, tel qu'il part chez Chrome. */
export function construire(markdown, styleEnPlus = '') {
	return typographierHtml(page(versHtml(markdown), styleEnPlus));
}

/** Le nombre de pages annoncé par le PDF lui-même, sans passer par un outil extérieur. */
export function nombreDePages(octets) {
	const trouve = /\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/.exec(octets.toString('latin1'));
	return Number(trouve?.[1] ?? 0);
}

/**
 * Les mises en pages essayées, dans cet ordre, jusqu'à ce que l'une tienne.
 *
 * Une dernière page presque vide ne se corrige pas en déplaçant un mot : elle tient à la hauteur
 * totale du texte. Trois lignes qui débordent se ramènent en serrant très légèrement, et l'écart
 * est invisible à la lecture : 0,1 point de corps, deux centièmes d'interligne.
 *
 * Les lignes seules, elles, ne sont plus l'affaire des variantes : la feuille de style ne laisse
 * aucun bloc se couper. Il reste un cas, qu'une variante règle en décalant le texte : un bloc d'une
 * seule ligne en haut ou en bas de page, que `defautsDeMiseEnPages` signale par prudence.
 *
 * L'ordre va du plus discret au plus net. La première qui passe est gardée, et le rapport dit
 * laquelle : une mise en pages choisie en silence serait une mise en pages qu'on ne sait pas
 * reproduire.
 */
const VARIANTES = [
	['telle quelle', ''],
	['interligne 1,46', 'body { line-height: 1.46; }'],
	['interligne 1,43', 'body { line-height: 1.43; }'],
	['corps 10,4 pt', 'body { font-size: 10.4pt; }'],
	['corps 10,4 pt, interligne 1,45', 'body { font-size: 10.4pt; line-height: 1.45; }'],
	['corps 10,3 pt, interligne 1,44', 'body { font-size: 10.3pt; line-height: 1.44; }'],
	['corps 10,6 pt', 'body { font-size: 10.6pt; }'],
	['corps 10,8 pt, interligne 1,52', 'body { font-size: 10.8pt; line-height: 1.52; }']
];

/** Lit `docs/CONDITIONS.md`, écrit le PDF, et rend de quoi en rendre compte. */
export async function produire({ avecPied = true, variantes = VARIANTES } = {}) {
	// L'exploitant nommé comme sur la page de l'instance qui lance ce script, s'il le dit.
	const markdown = nommerExploitant(readFileSync(SOURCE, 'utf8'), process.env['JADWAL_EXPLOITANT']);
	const version = dateDeLaVersion(markdown);
	// La version que l'application enregistrera à chaque acceptation : si elle est illisible, le PDF
	// n'est pas produit, plutôt que de partir sous une version que personne n'a écrite.
	versionIso(markdown);
	mkdirSync(dirname(SORTIE), { recursive: true });
	const travail = join(racine, 'A_LIVRER', '.conditions.html');

	let dernier = null;
	try {
		for (const [nom, styleEnPlus] of variantes) {
			const html = construire(markdown, styleEnPlus);
			writeFileSync(travail, html, 'utf8');
			await imprimer(travail, SORTIE, avecPied ? piedDePage(version) : null);
			if (!existsSync(SORTIE)) throw new Error(`Chrome n’a pas produit ${SORTIE}.`);
			const octets = readFileSync(SORTIE);
			const lignes = lignesParPage(octets);
			const defauts = defautsDeMiseEnPages(lignes);
			dernier = {
				chemin: SORTIE,
				version,
				html,
				variante: nom,
				octets: octets.length,
				pages: nombreDePages(octets),
				lignes: lignes.map((page) => page.length),
				defauts
			};
			if (defauts.length === 0) return dernier;
		}
	} finally {
		if (!process.env['JADWAL_GARDER_HTML']) rmSync(travail, { force: true });
	}
	if (!dernier) throw new Error('aucune variante de mise en pages n’a été essayée');
	return dernier;
}

// Importé par son épreuve, ce fichier ne doit rien faire ; lancé à la main, il produit le document.
if (import.meta.main) {
	const rendu = await produire();
	process.stdout.write(
		`${rendu.chemin}\n` +
			`docs/CONDITIONS.md en entier, et rien d’autre.\n` +
			`version du ${rendu.version}, ${rendu.pages} pages, ` +
			`${rendu.octets.toLocaleString('fr-CH')} octets.\n` +
			`mise en pages : ${rendu.variante}. Lignes par page : ${rendu.lignes.join(', ')}.\n` +
			(rendu.defauts.length > 0 ? `à revoir : ${rendu.defauts.join(' ; ')}\n` : '')
	);
}

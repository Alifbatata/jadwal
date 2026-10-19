#!/usr/bin/env node
/**
 * Éprouve le générateur du PDF des conditions d'utilisation.
 *
 *     pnpm conditions:test
 *
 * ## Pourquoi ce test existe
 *
 * `scripts/conditions-pdf.mjs` produit un document qui sort du dépôt pour être imprimé ou envoyé, et
 * lu par quelqu'un qui ne le lira qu'une fois. Ce qui y est faux ne sera pas rattrapé. Trois choses
 * peuvent y être fausses sans que rien ne se plaigne.
 *
 * **Le tiret cadratin.** Le contrôle de style interdit `—` dans `docs/CONDITIONS.md`. Il ne dit rien
 * du rendu : une entité HTML, un caractère venu d'un titre, et il réapparaît dans le PDF sans que
 * personne ne l'ait tapé.
 *
 * **La typographie.** Le Markdown du dépôt s'écrit avec des apostrophes droites et des espaces
 * ordinaires. Le rendu les transforme. Si cette transformation cesse de s'appliquer, le PDF reste
 * lisible, seulement mal composé, et rien ne tombe.
 *
 * **Le pied de page.** `page x sur y` n'existe que parce que `displayHeaderFooter` est vrai et qu'un
 * gabarit est passé. Les deux se perdent en une ligne, et un PDF sans numéros de page se lit très
 * bien jusqu'au moment où il faut désigner un passage.
 *
 * Deux autres se voient à l'œil, mais seulement si on les cherche. **La liste des données
 * personnelles** repartait à 1 après les passkeys, à l'étape 15, parce que le convertisseur fermait
 * la liste à la ligne vide. **Une ligne seule** en haut de la page 6, la fin d'une puce, a franchi
 * le contrôle de mise en pages de la même étape : il lisait les pages à l'envers et ne voyait que la
 * fin d'un paragraphe. Chacun a désormais son contrôle, et son témoin.
 *
 * **Le nom de l'exploitant.** Le texte du dépôt nomme Voltia, et aucune personne à côté. Le nom est
 * cherché **partout dans le PDF** : le texte que Chrome a dessiné est relu, page par page, pied de
 * page compris, avec les métadonnées du PDF, dont son titre ; chaque « Voltia » y est lu avec toute
 * sa phrase, et chaque phrase qui nomme l'exploitant doit nommer Voltia. Ces phrases ne sont pas
 * écrites ici : elles sont lues dans `docs/CONDITIONS.md`, aux marques du nom de l'exploitant. Quand
 * le poste porte la liste privée des termes interdits, celle du garde-fou, aucun de ses termes ne
 * doit paraître dans le PDF, ni dans ses pages, ni dans ses métadonnées. Un terme trouvé n'est
 * jamais recopié : seul son numéro dans la liste est donné. Le contrôle du nom ne recopie pas le nom
 * qu'il lit, celui du cadratin ne recopie pas le titre, et tout ce que l'épreuve écrit passe par le
 * même masque (`masquer`) : un terme de la liste n'en sort que par son rang.
 *
 * ## Ce qu'il joue
 *
 * Le document réel, celui de `docs/CONDITIONS.md`, et pas un document inventé : c'est lui qui part.
 * Le script est aussi lancé **comme en production**, en sous-processus, par la même commande que
 * `pnpm conditions:pdf`.
 *
 * Le texte est rendu **tel que le dépôt le porte**, avec le nom d'exploitant par défaut : la
 * variable `JADWAL_EXPLOITANT` est retirée de l'environnement avant tout rendu, pour l'épreuve comme
 * pour le script qu'elle lance. Une instance qui se nomme autrement ne fait pas tomber l'épreuve, et
 * l'épreuve ne relit pas un nom que le dépôt public ne porte pas.
 *
 * Chaque contrôle est doublé d'un témoin qui le fait tomber : un contrôle qui ne sait pas échouer ne
 * prouve rien.
 *
 * ## Ce qu'il ne prouve pas
 *
 * Il ne relit le texte dessiné que pour y chercher des noms et des termes : la typographie, elle,
 * est vérifiée sur le HTML qui part chez Chrome. Un nom est reconnu à sa majuscule, dans la phrase
 * de Voltia, ou à sa place dans une phrase qui nomme l'exploitant : une phrase qu'un saut de page
 * coupe est lue page par page, et un nom écrit dans une autre phrase n'est vu que par la liste
 * privée, quand le poste en a une. Le texte est retrouvé par la table `ToUnicode` de chaque police (`texteDuPdf`, dans
 * `conditions-pdf.mjs`), sans outil de plus. Le pied de page est aussi prouvé autrement : le même
 * document est rendu deux fois, avec et sans pied, et les deux PDF sont comparés.
 *
 * Il a besoin de Chrome, comme le script lui-même.
 */
import { execFileSync } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	construire,
	dateDeLaVersion,
	defautsDeMiseEnPages,
	ECART_ENTRE_DEUX_BLOCS,
	imprimer,
	lignesParPage,
	LIGNES_MINIMUM_DERNIERE_PAGE,
	nombreDePages,
	nommerExploitant,
	piedDePage,
	produire,
	texteDuPdf,
	typographierHtml
} from './conditions-pdf.mjs';
import { AUCUNE, cheminDeLaListe, lireListe } from './controle-fuites.mjs';

// Le dépôt public ne porte que le nom d'exploitant par défaut, et c'est lui que l'épreuve relit.
// Retirée ici, la variable ne joue ni sur les rendus de l'épreuve ni sur le script qu'elle lance en
// sous-processus, qui hérite de cet environnement : le nom qu'une instance se donne n'a pas à
// passer par la sortie de l'épreuve, et ne doit pas la faire tomber.
delete process.env['JADWAL_EXPLOITANT'];

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(racine, 'docs', 'CONDITIONS.md');
const PDF = join(racine, 'A_LIVRER', 'CONDITIONS-jadwal.pdf');

/** Espace fine insécable, et espace insécable : les deux que la typographie française demande. */
const FINE = ' ';
const INSECABLE = ' ';
const CADRATIN = '—';
const APOSTROPHE = '’';

const echecs = [];
let verifications = 0;

/**
 * La liste privée des termes interdits, quand le poste en a une (`listeDesTermes`, plus bas). Ses
 * termes sont cherchés dans le PDF, et masqués dans tout ce que l'épreuve écrit.
 */
const listePrivee = listeDesTermes();

/**
 * Le texte, où chaque terme de la liste devient « [terme n°N] », quelles que soient sa casse, ses
 * espaces et son apostrophe. Un détail recopie parfois du texte : un bout de phrase mal composée,
 * le titre du PDF, la sortie du générateur. Si l'un d'eux portait un terme de la liste, il ne
 * sortirait pas du poste par la sortie de l'épreuve, pas plus que par le PDF (relecture de
 * l'étape 19).
 */
function masquer(texte, termes = listePrivee.etat === 'lue' ? listePrivee.termes : []) {
	let masque = texte;
	for (const terme of termes) {
		const motif = terme.texte
			.trim()
			.split(/\s+/)
			.map((mot) => mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]"))
			.join('[\\s\\u00a0\\u202f\\u2009]+');
		masque = masque.replace(new RegExp(motif, 'giu'), `[terme n°${terme.rang}]`);
	}
	return masque;
}

/** Tout ce que l'épreuve écrit passe par ici, termes de la liste privée masqués. */
function ecrire(texte, flux = process.stdout) {
	flux.write(masquer(texte));
}

function verifier(quoi, condition, detail = '') {
	verifications += 1;
	if (!condition) echecs.push(detail ? `${quoi} : ${detail}` : quoi);
	ecrire(`  ${condition ? 'ok  ' : 'NON '} ${quoi}${detail ? ` (${detail})` : ''}\n`);
}

/** Le texte du corps, sans les balises, sans la feuille de style et sans les bouts de code. */
function texteSeul(html) {
	const corps = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
	return corps.replace(/<code[^>]*>[\s\S]*?<\/code>/g, ' ').replace(/<[^>]*>/g, '');
}

/** Les fautes de composition qui restent : une espace ordinaire devant un signe double. */
function fautesDeComposition(texte) {
	const fautes = [];
	for (const signe of [';', '!', '?', ':']) {
		for (const trouve of texte.matchAll(new RegExp(`.{0,30} \\${signe}`, 'g'))) {
			fautes.push(trouve[0]);
		}
	}
	for (const trouve of texte.matchAll(/« | »/g)) fautes.push(trouve[0]);
	return fautes;
}

/** Pour chaque liste numérotée du rendu, dans l'ordre, le nombre de ses éléments. */
function listesNumerotees(html) {
	return [...html.matchAll(/<ol>([\s\S]*?)<\/ol>/g)].map(
		(liste) => liste[1].match(/<li>/g)?.length ?? 0
	);
}

/** Une seule liste numérotée, qui porte chaque élément numéroté de la source. */
function listeSuivie(source, html) {
	const numerotes = source.split(/\r?\n/).filter((ligne) => /^\d+\.\s/.test(ligne)).length;
	const listes = listesNumerotees(html);
	return {
		suivie: numerotes > 0 && listes.length === 1 && listes[0] === numerotes,
		detail: `listes rendues : ${listes.join(' puis ') || 'aucune'} ; éléments numérotés dans la source : ${numerotes}`
	};
}

/** Les espaces insécables du rendu, et l'apostrophe courbe, ramenées à leur forme tapée. */
function aplatir(texte) {
	return texte.replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/’/g, "'");
}

/**
 * Les mots qui peuvent s'écrire avec une majuscule dans la phrase de « Voltia » sans être un nom :
 * ceux qui ouvrent une phrase ou un titre, et ceux qu'un titre écrit avec une majuscule. La liste
 * est courte à dessein : un mot en majuscule qui n'y est pas fait tomber l'épreuve, et il ne s'y
 * ajoute qu'après une relecture de sa phrase.
 */
const MOTS_DE_PHRASE = new Set([
	// Les mots de liaison, et ceux qui ouvrent une phrase ou un titre.
	'à',
	'avec',
	'chez',
	'd',
	'de',
	'des',
	'du',
	'en',
	'et',
	'l',
	'la',
	'le',
	'les',
	'par',
	'pour',
	'qui',
	'sans',
	'un',
	'une',
	// Les mots que le texte écrit avec une majuscule dans une phrase qui nomme Voltia.
	'jadwal',
	'service',
	'suisse'
]);

/**
 * Ce qui finit une phrase : un point, un point d'exclamation ou d'interrogation, ou des points de
 * suspension, suivis d'une espace ou de la fin de la page. Le point de `voltia.ch` n'en est pas un.
 * Le deux-points et le point-virgule non plus : ils ne ferment pas une phrase française, et
 * « Voltia : Une Personne » est un nom écrit à côté de Voltia (relecture de l'étape 19).
 */
const FIN_DE_PHRASE = /[.!?…](?=\s|$)/gu;

/** Les mots d'un texte, lettres et chiffres. */
function mots(texte) {
	return [...texte.matchAll(/[\p{L}\p{N}]+/gu)].map((trouve) => trouve[0]);
}

/** Un mot qui commence par une majuscule, et qui n'est ni Voltia ni un mot de `MOTS_DE_PHRASE`. */
function suspect(mot) {
	return (
		/^\p{Lu}/u.test(mot) &&
		mot.toLocaleLowerCase('fr') !== 'voltia' &&
		!MOTS_DE_PHRASE.has(mot.toLocaleLowerCase('fr'))
	);
}

/**
 * « Voltia », seul, partout où le PDF le dessine : dans le texte, les titres et le pied de page.
 *
 * Le nom qu'on craint de voir revenir est celui d'une personne, écrit **à côté** de Voltia :
 * « Une Personne (Voltia) », « Voltia, Une Personne », « VOLTIA, UNE PERSONNE » en capitales, ou
 * derrière un mot de phrase, « Voltia de Une Personne », « Voltia, entreprise de Une Personne ».
 * Un nom propre commence par une majuscule. Chaque mention est donc lue avec toute sa phrase, du
 * signe qui finit la phrase d'avant à celui qui finit la sienne, et chaque mot de cette phrase qui
 * commence par une majuscule doit être Voltia ou l'un des mots de `MOTS_DE_PHRASE`. Jusqu'à la
 * relecture de l'étape 19, seuls les deux voisins de Voltia étaient lus, et un nom écrit derrière
 * « de » passait. Une adresse en `voltia.ch` n'a le droit d'être que `contact@voltia.ch`.
 *
 * Ce qui est signalé ne dit jamais le mot trouvé, seulement où : un nom de personne recopié dans la
 * sortie d'une épreuve serait publié par elle, dans un journal ou un rapport. `nommer` dit où, pour
 * chaque texte lu : une page, par défaut, ou les métadonnées.
 */
function voltiaSeul(pages, nommer = (index) => `page ${index + 1}`) {
	const ecarts = [];
	let mentions = 0;
	pages.forEach((texte, index) => {
		const plat = aplatir(texte);
		for (const trouve of plat.matchAll(/voltia/gi)) {
			mentions += 1;
			const ou = `${nommer(index)}, mention ${mentions}`;
			const avant = plat.slice(0, trouve.index);
			const apres = plat.slice(trouve.index + trouve[0].length);
			if (/^\.ch\b/i.test(apres)) {
				if (!/(?:^|[^\w.@-])contact@$/i.test(avant)) {
					ecarts.push(`${ou} : une adresse en voltia.ch qui n'est pas contact@voltia.ch`);
				}
				continue;
			}
			if (/\p{L}$/u.test(avant) || /^\p{L}/u.test(apres)) {
				ecarts.push(`${ou} : Voltia collé à un autre mot`);
				continue;
			}
			const debut = [...avant.matchAll(FIN_DE_PHRASE)].at(-1);
			const fin = [...apres.matchAll(FIN_DE_PHRASE)][0];
			const lus = [
				['avant', mots(avant.slice(debut === undefined ? 0 : debut.index + 1)).reverse()],
				['après', mots(apres.slice(0, fin === undefined ? apres.length : fin.index))]
			];
			for (const [sens, phrase] of lus) {
				const rang = phrase.findIndex(suspect);
				if (rang < 0) continue;
				const place = rang === 0 ? 'juste' : `au ${rang + 1}e mot`;
				ecarts.push(`${ou} : un mot en majuscule ${place} ${sens} Voltia, dans sa phrase`);
			}
		}
	});
	return { mentions, ecarts };
}

/**
 * « Voltia » seul, dans tout ce que le PDF porte : le texte dessiné de chaque page, et les chaînes
 * de ses métadonnées, dont le titre que le lecteur affiche dans sa barre. Ce titre n'est dessiné sur
 * aucune page : jusqu'à la relecture de l'étape 19, un nom écrit à côté de Voltia n'y était pas lu.
 */
function voltiaSeulDansLePdf(octets) {
	const pages = voltiaSeul(texteDuPdf(octets));
	const metadonnees = voltiaSeul(chainesHorsDesPages(octets).information, () => 'métadonnées');
	return {
		mentions: pages.mentions + metadonnees.mentions,
		ecarts: [...pages.ecarts, ...metadonnees.ecarts]
	};
}

/**
 * Les phrases du texte qui nomment l'exploitant, lues dans `docs/CONDITIONS.md` et non écrites ici.
 * Le texte marque le nom (`<!-- exploitant -->Voltia<!-- /exploitant -->`) pour que
 * `nommerExploitant` le remplace : chaque marque donne les deux mots qui la précèdent, « exploité
 * par » aujourd'hui, et le nom par défaut qu'elle porte. Une phrase récrite dans le texte est suivie
 * sans que l'épreuve change ; une phrase écrite en dur ici aurait cessé d'être lue le jour où le
 * texte l'a récrite, sans que rien ne tombe (« … est le responsable du traitement », jusqu'à la
 * version du 19.10.2026).
 */
function phrasesQuiNomment(source) {
	return [
		...source.matchAll(/(\S+\s+\S+)\s*<!-- exploitant -->([^<\n]*)<!-- \/exploitant -->/g)
	].map(([, avant, nom]) => ({ avant: aplatir(avant).replace(/\s+/g, ' '), nom: nom.trim() }));
}

/**
 * Le nom que donne chaque phrase qui nomme l'exploitant, dans le texte relu : il doit être le nom par
 * défaut du texte, seul. `voltiaSeul` voit un nom écrit à côté de Voltia ; ce contrôle voit un nom
 * écrit **à sa place**. Chaque phrase doit être trouvée au moins une fois : une phrase que le rendu
 * aurait perdue ne serait plus contrôlée du tout. Le détail ne dit jamais le nom lu.
 */
function exploitantNommePartout(pages, phrases) {
	const texte = aplatir(pages.join('\n')).replace(/\s+/g, ' ');
	const ecarts = [];
	if (phrases.length === 0) ecarts.push('aucune marque du nom de l’exploitant dans le texte');
	for (const { avant, nom } of phrases) {
		const phrase = `« ${avant} … »`;
		const motif = new RegExp(
			`${avant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}\\s+([^\\s,.;:]+)`,
			'gi'
		);
		const noms = [...texte.matchAll(motif)].map((trouve) => trouve[1]);
		if (noms.length === 0) ecarts.push(`${phrase} : phrase introuvable`);
		const autres = noms.filter(
			(lu) => lu.toLocaleLowerCase('fr') !== nom.toLocaleLowerCase('fr')
		).length;
		if (autres > 0) ecarts.push(`${phrase} : ${autres} fois un autre nom que le nom par défaut`);
	}
	return ecarts;
}

/**
 * Les chaînes que le PDF porte hors de ses pages : son dictionnaire d'information (titre, auteur,
 * logiciel), que le générateur fait écrire, et les adresses de ses liens, qui viennent toutes du
 * texte des conditions.
 */
function chainesHorsDesPages(octets) {
	const brut = octets.toString('latin1');
	const decoder = (jeton) =>
		jeton.startsWith('<')
			? Buffer.from(jeton.slice(1, -1), 'hex').toString('latin1').startsWith('\u00fe\u00ff')
				? Buffer.from(jeton.slice(5, -1), 'hex').swap16().toString('utf16le')
				: Buffer.from(jeton.slice(1, -1), 'hex').toString('latin1')
			: jeton.slice(1, -1);
	const info = /\/Info\s+(\d+)\s+0\s+R/.exec(brut)?.[1];
	const dict = info ? (new RegExp(`\\b${info} 0 obj([\\s\\S]*?)endobj`).exec(brut)?.[1] ?? '') : '';
	return {
		information: [...dict.matchAll(/<[0-9A-Fa-f]*>|\((?:\\[\s\S]|[^\\)])*\)/g)].map(([jeton]) =>
			decoder(jeton)
		),
		liens: [...brut.matchAll(/\/URI\s*(\((?:\\[\s\S]|[^\\)])*\)|<[0-9A-Fa-f]*>)/g)].map(
			([, jeton]) => decoder(jeton)
		)
	};
}

/**
 * Les termes de la liste privée que le PDF porte là où la liste ne les autorise pas, par leur rang,
 * et où. Le terme lui-même n'est jamais rendu : comme le garde-fou, l'épreuve ne donne que son
 * numéro dans la liste.
 *
 * La liste peut autoriser un terme dans un fichier (`terme | chemin`), et le garde-fou la lit ainsi.
 * L'épreuve aussi : `CLAUDE.md` permet à `docs/CONDITIONS.md` de nommer l'hébergeur et le pays des
 * données, et le PDF est ce fichier, mis en pages. Chaque morceau du PDF répond donc au fichier
 * d'où il vient : les pages et les adresses des liens à `docs/CONDITIONS.md`, le pied de chaque
 * page et les métadonnées à `scripts/conditions-pdf.mjs`. Seule une autorisation sans commit compte
 * ici : le PDF est fait de l'arbre de travail, pas d'un commit.
 */
function termesDansLePdf(pages, horsDesPages, termes) {
	const GENERATEUR = 'scripts/conditions-pdf.mjs';
	const CONDITIONS = 'docs/CONDITIONS.md';
	const morceaux = [];
	pages.forEach((texte, index) => {
		const lignes = texte.split('\n');
		const pied = /^jadwal, conditions d'utilisation\./i.test(aplatir(lignes.at(-1) ?? ''))
			? lignes.pop()
			: '';
		morceaux.push({ ou: `page ${index + 1}`, source: CONDITIONS, texte: lignes.join('\n') });
		if (pied)
			morceaux.push({ ou: `pied de la page ${index + 1}`, source: GENERATEUR, texte: pied });
	});
	morceaux.push({
		ou: 'métadonnées',
		source: GENERATEUR,
		texte: horsDesPages.information.join('\n')
	});
	morceaux.push({ ou: 'liens', source: CONDITIONS, texte: horsDesPages.liens.join('\n') });
	const aplati = (texte) => aplatir(texte).replace(/\s+/g, ' ').toLowerCase();
	const trouves = [];
	for (const terme of termes) {
		const cherche = aplati(terme.texte);
		const ou = morceaux
			.filter(
				({ source, texte }) => !terme.autorises.includes(source) && aplati(texte).includes(cherche)
			)
			.map((morceau) => morceau.ou);
		if (ou.length > 0) trouves.push({ rang: terme.rang, ou });
	}
	return trouves;
}

/**
 * La liste privée des termes interdits, quand le poste en a une : `git config
 * jadwal.termes-interdits`, ou `JADWAL_TERMES_INTERDITS`, comme le garde-fou la lit. Sans liste, ou
 * avec la valeur qui dit « aucune », il n'y a rien à chercher ; une liste nommée mais absente est
 * une erreur, comme pour le garde-fou.
 */
function listeDesTermes() {
	const chemin = cheminDeLaListe();
	if (!chemin || chemin === AUCUNE) return { etat: chemin === AUCUNE ? 'aucune' : 'absente' };
	if (!existsSync(chemin)) return { etat: 'introuvable' };
	return { etat: 'lue', termes: lireListe(chemin) };
}

/** Des lignes de texte courant, construites : `n` lignes à un interligne l'une de l'autre. */
function lignesDeTexte(haut, n, interligne = 15) {
	return Array.from({ length: n }, (_, index) => ({ y: haut - index * interligne, corps: 10.5 }));
}

// Le texte du dépôt, avec le nom d'exploitant par défaut : `JADWAL_EXPLOITANT` a été retirée plus
// haut, et le nom n'est demandé à personne.
const source = readFileSync(SOURCE, 'utf8');
const markdown = nommerExploitant(source, undefined);
const version = dateDeLaVersion(markdown);
const html = construire(markdown);
const texte = texteSeul(html);
const phrases = phrasesQuiNomment(source);
const titreDuTexte = /^# (.+)$/m.exec(markdown)?.[1] ?? '';

ecrire(`\nLe document rendu, à partir de docs/CONDITIONS.md (version du ${version})\n`);

verifier(
	'aucun tiret cadratin dans le rendu',
	!html.includes(CADRATIN),
	html.includes(CADRATIN) ? `${html.split(CADRATIN).length - 1} trouvé(s)` : ''
);
verifier('aucun tiret cadratin dans le titre du document', !/<title>[^<]*—/.test(html));
verifier(
	'aucune apostrophe droite dans le texte',
	!texte.includes("'"),
	texte.includes("'") ? `${texte.split("'").length - 1} trouvée(s)` : ''
);
verifier(
	'des apostrophes typographiques, et beaucoup',
	texte.split(APOSTROPHE).length - 1 > 50,
	`${texte.split(APOSTROPHE).length - 1} trouvée(s)`
);

const fautes = fautesDeComposition(texte);
verifier(
	'aucune espace ordinaire devant un signe double ni dans les guillemets',
	fautes.length === 0,
	fautes.length ? fautes.slice(0, 3).join(' | ') : ''
);
// Un signe que le texte n'emploie pas n'a rien à prouver : il est dit, et sauté. Le texte des
// conditions n'a plus de « ? » depuis que le PDF ne porte plus que lui ; le témoin plus bas compose
// une question. Il faut au moins un signe présent, sans quoi ce contrôle ne vérifierait rien.
let signesPresents = 0;
for (const [signe, attendu, nom] of [
	[';', FINE, 'fine insécable'],
	['?', FINE, 'fine insécable'],
	['!', FINE, 'fine insécable'],
	[':', INSECABLE, 'insécable']
]) {
	const total = texte.split(signe).length - 1;
	if (total === 0) {
		ecrire(`  (aucun « ${signe} » dans le texte : rien à y vérifier)\n`);
		continue;
	}
	signesPresents += 1;
	const bons = texte.split(attendu + signe).length - 1;
	verifier(`chaque « ${signe} » précédé d'une espace ${nom}`, bons === total, `${bons}/${total}`);
}
verifier('au moins un signe double est employé, et donc vérifié', signesPresents > 0);
verifier(
	'les guillemets serrent leur contenu',
	texte.split(`«${INSECABLE}`).length - 1 === texte.split('«').length - 1 &&
		texte.split(`${INSECABLE}»`).length - 1 === texte.split('»').length - 1
);
verifier('le texte est aligné à gauche', /p \{[^}]*text-align: left/.test(html));
verifier(
	'rien n’est justifié',
	!html.includes('justify;') && !html.includes('text-align: justify')
);

// Le document est le texte seul : une section, qui ouvre le corps, et dont le premier titre est
// celui du texte.
verifier(
	'le rendu ne porte que le texte des conditions, qui ouvre le document',
	/<body>\s*<section class="document">\s*<h1>/.test(html) &&
		html.split('<section').length - 1 === 1 &&
		titreDuTexte !== '' &&
		aplatir(texte.trimStart()).startsWith(titreDuTexte),
	`${html.split('<section').length - 1} section(s)`
);
verifier(
	'le titre du document est « Conditions d’utilisation de jadwal »',
	aplatir(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '') === "Conditions d'utilisation de jadwal"
);
verifier(
	'le texte du dépôt marque le nom de l’exploitant, et le nom par défaut est Voltia',
	phrases.length > 0 && phrases.every((phrase) => phrase.nom === 'Voltia'),
	`${phrases.length} marque(s) ; nom par défaut : ` +
		(phrases.every((phrase) => phrase.nom === 'Voltia') ? 'Voltia' : 'un autre nom')
);
const liste = listeSuivie(markdown, html);
verifier(
	'la liste des données personnelles se suit d’un bout à l’autre',
	liste.suivie,
	liste.detail
);
// Les mots cherchés s'écrivent ici sans apparaître en toutes lettres : une classe d'une lettre pour
// le latin, des échappements pour l'arabe. Le dépôt ne les porte ainsi que dans le module des heures
// de prière et dans les ADR, et une recherche de ces mots sur tout le dépôt n'a pas à tomber sur le
// contrôle même qui vérifie qu'ils sont absents (étape 19, B12). Le motif est le même qu'avant.
verifier(
	'le rendu ne parle pas d’un lieu de culte',
	!/mos[q]u|mos[c]he[ae]|\u0645\u0633\u062c\u062f/i.test(html)
);

ecrire(`\nLes témoins : chaque contrôle sait tomber\n`);

const abime = markdown.replace('Dernière mise à jour', `Dernière ${CADRATIN} mise à jour`);
verifier('un cadratin glissé dans la source est vu', construire(abime).includes(CADRATIN));

const brut = '<p>Est-ce vrai ? Il a dit : « oui ».</p>';
verifier(
	'sans la passe typographique, la composition est fautive',
	fautesDeComposition(texteSeul(`<body>${brut}</body>`)).length > 0
);
verifier(
	'avec elle, elle ne l’est plus',
	fautesDeComposition(texteSeul(`<body>${typographierHtml(brut)}</body>`)).length === 0
);
verifier(
	'le contenu d’un <code> garde ses apostrophes droites',
	typographierHtml("<p>l'un</p><code>l'autre</code>") ===
		`<p>l${APOSTROPHE}un</p><code>l'autre</code>`
);

// Le paragraphe des passkeys sans son retrait : c'est exactement ce que l'ancien convertisseur
// faisait de lui, et la liste repart à 1.
const desindente = markdown.replace(/^ {3}(\*\*Ce qui est vrai de toutes\*\*)/m, '$1');
const coupee = listeSuivie(desindente, construire(desindente));
verifier(
	'une liste coupée en deux est vue',
	desindente !== markdown && !coupee.suivie,
	desindente === markdown ? 'le paragraphe des passkeys est introuvable' : coupee.detail
);

/**
 * Le texte du dépôt, où la première phrase qui nomme l'exploitant donne `nouveau` à la place du nom
 * par défaut. La phrase est celle que `phrasesQuiNomment` a lue dans le texte, pas une phrase
 * écrite ici.
 */
function nommeAutrement(nouveau) {
	if (!premiere) return markdown;
	return markdown.replace(`${premiere.avant} ${premiere.nom}`, `${premiere.avant} ${nouveau}`);
}
const [premiere] = phrases;

// Un nom de personne revenu devant Voltia, dans la phrase qui nomme l'exploitant. Les deux contrôles
// le voient, et leur détail ne le recopie pas : un nom réel, terme de la liste privée, partirait
// avec la sortie de l'épreuve dans un journal ou un rapport (relecture de l'étape 19).
const avecUnNom = nommeAutrement('Une Personne (Voltia)');
const texteAvecUnNom = texteSeul(construire(avecUnNom));
const nomALaPlace = exploitantNommePartout([texteAvecUnNom], phrases);
const nomACote = voltiaSeul([texteAvecUnNom]);
verifier(
	'un nom de personne revenu devant Voltia dans le texte est vu, sans être recopié',
	avecUnNom !== markdown &&
		nomALaPlace.length > 0 &&
		nomACote.ecarts.length > 0 &&
		![...nomALaPlace, ...nomACote.ecarts].some((ecart) => /Une Personne/.test(ecart)),
	[...nomALaPlace, ...nomACote.ecarts].join(' ; ') || 'rien vu'
);
const surLeTexte = [...exploitantNommePartout([texte], phrases), ...voltiaSeul([texte]).ecarts];
verifier(
	'le texte du dépôt, lui, ne fait rien dire aux deux contrôles',
	surLeTexte.length === 0,
	surLeTexte.join(' ; ')
);

// La phrase qui nomme l'exploitant, perdue au rendu : un contrôle qui ne trouve plus sa phrase ne
// contrôle plus rien, et il doit le dire. Puis un texte sans marque du nom.
const sansLaPhrase = premiere ? markdown.replace(`${premiere.avant} `, 'tenu par ') : markdown;
const phrasePerdue = exploitantNommePartout([texteSeul(construire(sansLaPhrase))], phrases);
verifier(
	'une phrase qui nomme l’exploitant, perdue au rendu, est vue',
	sansLaPhrase !== markdown && phrasePerdue.some((ecart) => ecart.endsWith('phrase introuvable')),
	phrasePerdue.join(' ; ') || 'rien vu'
);
const sansMarque = exploitantNommePartout([texte], phrasesQuiNomment(markdown));
verifier(
	'un texte sans marque du nom de l’exploitant ne passe pas',
	sansMarque.some((ecart) => ecart.startsWith('aucune marque')),
	sansMarque.join(' ; ') || 'rien vu'
);

// Les termes interdits, sur une page construite dont la dernière ligne est le pied de page, et une
// liste de témoin : un terme absent, un terme sans autorisation, et un terme que la liste autorise
// dans `docs/CONDITIONS.md`. Le deuxième est vu dans la page, le troisième dans le seul pied, qui
// vient du générateur, et seuls leurs rangs reviennent.
const temoinDesTermes = termesDansLePdf(
	[
		'Le document : Témoin-Autorisé et Témoin-Seul.\n' +
			'jadwal, conditions d’utilisation. Version du Témoin-Autorisé.'
	],
	{ information: [], liens: [] },
	[
		{ rang: 1, texte: 'terme-absent-du-texte', autorises: [] },
		{ rang: 2, texte: 'TÉMOIN-SEUL', autorises: [] },
		{ rang: 3, texte: 'témoin-autorisé', autorises: ['docs/CONDITIONS.md'] }
	]
);
const rendu = temoinDesTermes.map((trouve) => `terme n°${trouve.rang} : ${trouve.ou.join(', ')}`);
verifier(
	'un terme de la liste est vu, par son seul rang, sauf là où la liste l’autorise',
	rendu.join(' ; ') === 'terme n°2 : page 1 ; terme n°3 : pied de la page 1',
	rendu.join(' ; ')
);

// Un terme de la liste posé à la place de Voltia : le contrôle du nom le voit sans le recopier, et
// un détail qui le recopierait quand même ne le ferait sortir que par son rang, en capitales, avec
// une espace insécable ou une apostrophe courbe comme en toutes lettres.
const listeDuTemoin = [{ rang: 7, texte: "Jean l'Exemple", autorises: [] }];
const nomDeLaListe = exploitantNommePartout(
	[texteSeul(construire(nommeAutrement("Jean l'Exemple")))],
	phrases
);
const sortieDuTemoin = masquer(
	`${nomDeLaListe.join(' ; ')} ; exploité par Jean l'Exemple ; JEAN L’EXEMPLE ; Jean\u00a0l'exemple`,
	listeDuTemoin
);
verifier(
	'un terme de la liste mis à la place de Voltia est vu, et ne sort de l’épreuve que par son rang',
	nomDeLaListe.length > 0 &&
		!/exemple/i.test(sortieDuTemoin) &&
		sortieDuTemoin.split('[terme n°7]').length - 1 === 3,
	sortieDuTemoin
);

ecrire(`\nLes lignes seules, sur des pages construites\n`);

// Une page pleine, qui fixe l'interligne à 15 points, et une dernière page assez garnie : seul le
// défaut que chaque témoin pose peut alors tomber.
const pleine = lignesDeTexte(779.7, 40);
const fin = lignesDeTexte(779.7, 12);
// Le cas de l'étape 15, relevé dans son PDF : la dernière ligne d'une puce en haut de la page 6,
// puis 18,8 points jusqu'à la puce suivante, 1,25 interligne.
const finDePuceEnHaut = [pleine, [{ y: 779.7, corps: 10.5 }, ...lignesDeTexte(760.9, 30)], fin];
verifier(
	'la fin d’une puce restée seule en haut est vue',
	defautsDeMiseEnPages(finDePuceEnHaut).includes('page 2 : une ligne reste seule en haut'),
	defautsDeMiseEnPages(finDePuceEnHaut).join(' ; ') || 'rien vu'
);
verifier(
	'l’ancien seuil, 1,4 interligne, ne la voyait pas',
	defautsDeMiseEnPages(finDePuceEnHaut, { ecart: 1.4 }).length === 0,
	`le seuil est désormais de ${ECART_ENTRE_DEUX_BLOCS.toLocaleString('fr-CH')} interligne`
);
const debutDePuceEnBas = [
	pleine,
	[...lignesDeTexte(779.7, 30), { y: 779.7 - 29 * 15 - 18.8, corps: 10.5 }],
	fin
];
verifier(
	'le début d’une puce resté seul en bas est vu',
	defautsDeMiseEnPages(debutDePuceEnBas).includes('page 2 : une ligne reste seule en bas'),
	defautsDeMiseEnPages(debutDePuceEnBas).join(' ; ') || 'rien vu'
);
// Deux lignes de chaque côté d'un écart de puce : rien à redire, et rien ne doit être dit.
const puceEntiere = [
	pleine,
	[...lignesDeTexte(779.7, 2), ...lignesDeTexte(779.7 - 15 - 18.8, 28)],
	fin
];
verifier(
	'deux lignes de chaque côté ne sont pas une ligne seule',
	defautsDeMiseEnPages(puceEntiere).length === 0,
	defautsDeMiseEnPages(puceEntiere).join(' ; ')
);

ecrire(`\nLe pied de page\n`);

const pied = piedDePage(version);
verifier('le gabarit demande le numéro de page', pied.includes('class="pageNumber"'));
verifier('le gabarit demande le nombre total', pied.includes('class="totalPages"'));
verifier(
	'le gabarit dit « page x sur y »',
	/page <span class="pageNumber"><\/span> sur/.test(pied)
);
verifier('le gabarit porte la date de la version', pied.includes(version));
verifier('le gabarit n’a pas de cadratin', !pied.includes(CADRATIN));

// Le même document, rendu sans pied de page, puis rendu à nouveau comme en production. Le second
// rendu est celui qui reste sur le disque : le document livré est toujours le bon.
const sauvegarde = existsSync(PDF) ? `${PDF}.avant-epreuve` : null;
if (sauvegarde) copyFileSync(PDF, sauvegarde);

let sansPied;
try {
	sansPied = await produire({ avecPied: false });
	ecrire(`  sans pied : ${sansPied.pages} pages, ${sansPied.octets} octets\n`);

	ecrire(`\nLe script lancé comme en production\n`);
	const sortie = execFileSync(process.execPath, [join(racine, 'scripts', 'conditions-pdf.mjs')], {
		cwd: racine,
		encoding: 'utf8'
	});
	ecrire(
		sortie
			.trimEnd()
			.split('\n')
			.map((l) => `      ${l}\n`)
			.join('')
	);

	verifier('le PDF est là', existsSync(PDF));
	const octets = readFileSync(PDF);
	const pages = nombreDePages(octets);
	verifier('il fait plus d’une page', pages >= 5, `${pages} pages`);
	verifier('il pèse quelque chose', octets.length > 20_000, `${octets.length} octets`);
	const titre = titreSansCadratin(octets);
	verifier('son titre ne porte pas de cadratin', titre.accord, titre.detail);
	verifier('le même nombre de pages avec et sans pied', pages === sansPied.pages);

	ecrire(`\nLe texte relu dans le PDF\n`);
	const pagesLues = texteDuPdf(octets);
	const toutLeTexte = aplatir(pagesLues.join('\n')).replace(/\s+/g, ' ');
	verifier(
		'chaque page se relit, sans glyphe inconnu',
		pagesLues.length === pages && !toutLeTexte.includes('\ufffd'),
		`${pagesLues.length} page(s), ${toutLeTexte.length} caractères`
	);
	verifier(
		'le texte relu porte le document et le pied de page',
		toutLeTexte.includes(titreDuTexte) && toutLeTexte.includes(`page 1 sur ${pages}`)
	);
	verifier(
		'le PDF commence par le texte : la première page s’ouvre sur son titre',
		aplatir(pagesLues[0] ?? '').startsWith(`${titreDuTexte}\n`)
	);
	// Le texte du dépôt dit Voltia un certain nombre de fois : le PDF doit au moins les dessiner
	// toutes, sans quoi le contrôle n'aurait relu qu'une partie du document.
	const mentionsDuTexte = (aplatir(texte).match(/voltia/gi) ?? []).length;
	const seul = voltiaSeulDansLePdf(octets);
	verifier(
		'partout où le PDF porte Voltia, pages et métadonnées, aucun nom n’est écrit à côté',
		mentionsDuTexte > 0 && seul.mentions >= mentionsDuTexte && seul.ecarts.length === 0,
		`${seul.mentions} mention(s) dans le PDF, ${mentionsDuTexte} dans le texte` +
			(seul.ecarts.length > 0 ? ` ; ${seul.ecarts.join(' ; ')}` : '')
	);
	const nomme = exploitantNommePartout(pagesLues, phrases);
	verifier(
		'chaque phrase qui nomme l’exploitant nomme Voltia',
		nomme.length === 0,
		nomme.join(' ; ')
	);
	if (listePrivee.etat === 'lue') {
		const trouves = termesDansLePdf(pagesLues, chainesHorsDesPages(octets), listePrivee.termes);
		verifier(
			`aucun des ${listePrivee.termes.length} termes de la liste privée ne paraît dans le PDF, ` +
				`hors de ce que la liste autorise`,
			listePrivee.termes.length > 0 && trouves.length === 0,
			trouves.map((trouve) => `terme n°${trouve.rang} : ${trouve.ou.join(', ')}`).join(' ; ')
		);
	} else if (listePrivee.etat === 'introuvable') {
		verifier(
			'la liste privée des termes interdits, nommée sur ce poste, se lit',
			false,
			'le chemin configuré ne mène à aucun fichier'
		);
	} else {
		ecrire(
			`  (liste privée des termes interdits ${listePrivee.etat === 'aucune' ? 'déclarée « aucune »' : 'non configurée'} sur ce poste : rien à y chercher)\n`
		);
	}

	// Les témoins rendus : le même document, avec un nom écrit à côté de Voltia ou à sa place, rendu
	// par Chrome dans un dossier temporaire et relu dans le PDF, comme le document livré.
	ecrire(`\nLe témoin : un nom écrit à côté de Voltia, dans un PDF rendu\n`);
	const dossierDuTemoin = mkdtempSync(join(tmpdir(), 'jadwal-conditions-temoin-'));
	/** Le HTML donné, rendu par Chrome avec son pied de page, et relu page par page. */
	const rendre = async (nom, contenu) => {
		const chemin = join(dossierDuTemoin, `${nom}.html`);
		writeFileSync(chemin, contenu, 'utf8');
		await imprimer(chemin, join(dossierDuTemoin, `${nom}.pdf`), piedDePage(version));
		return readFileSync(join(dossierDuTemoin, `${nom}.pdf`));
	};
	/** Les mentions de Voltia que `voltiaSeul` signale, une fois chacune. */
	const mentionsSignalees = (ecarts) => [...new Set(ecarts.map((ecart) => ecart.split(' : ')[0]))];
	try {
		// Le premier : un nom écrit devant Voltia, dans la phrase qui nomme l'exploitant. Il est à
		// côté de Voltia, et à sa place après les mots qui l'annoncent : les deux contrôles le voient.
		const avecDesNoms = nommeAutrement('Jean Exemple (Voltia)');
		const pagesDuTemoin = texteDuPdf(await rendre('temoin', construire(avecDesNoms)));
		const seulTemoin = voltiaSeul(pagesDuTemoin);
		verifier(
			'un nom écrit juste devant Voltia, dans le texte, est vu',
			avecDesNoms !== markdown &&
				seulTemoin.ecarts.some((ecart) => /juste avant Voltia/.test(ecart)),
			seulTemoin.ecarts.join(' ; ') || 'rien vu'
		);
		const nommeTemoin = exploitantNommePartout(pagesDuTemoin, phrases);
		verifier(
			'le même nom, écrit à la place de Voltia après les mots qui l’annoncent, est vu',
			nommeTemoin.some((ecart) => /autre nom/.test(ecart)),
			nommeTemoin.join(' ; ') || 'rien vu'
		);

		// Le deuxième : un nom écrit derrière un mot de liaison ou un mot en minuscules, « Voltia de
		// Jean Exemple » dans la phrase qui nomme l'exploitant, puis « Voltia, entreprise de Jean
		// Exemple » dans celle de l'adresse de contact. Le mot qui touche Voltia ne prend pas de
		// majuscule : un contrôle qui ne lit que ce voisin laisse passer le nom (relecture de
		// l'étape 19).
		const derriere = nommeAutrement('Voltia de Jean Exemple').replace(
			'Pour toute question ou demande :',
			'Pour toute question ou demande à Voltia, entreprise de Jean Exemple :'
		);
		const seulDerriere = voltiaSeul(texteDuPdf(await rendre('derriere', construire(derriere))));
		verifier(
			'un nom écrit derrière un mot de liaison ou un mot en minuscules, deux fois dans le texte, ' +
				'est vu deux fois',
			derriere.split('Jean Exemple').length - 1 === 2 &&
				mentionsSignalees(seulDerriere.ecarts).length === 2,
			seulDerriere.ecarts.join(' ; ') || 'rien vu'
		);

		// Le troisième : un nom écrit derrière un deux-points ou un point-virgule, « à Voltia : Jean
		// Exemple » puis « exploité par Voltia ; Jean Exemple ». Ni l'un ni l'autre ne ferme la
		// phrase : un contrôle qui s'y arrête laisse passer le nom (relecture de l'étape 19).
		const deuxPoints = nommeAutrement('Voltia ; Jean Exemple').replace(
			'Pour toute question ou demande :',
			'Pour toute question ou demande à Voltia : Jean Exemple,'
		);
		const seulDeuxPoints = voltiaSeul(
			texteDuPdf(await rendre('deux-points', construire(deuxPoints)))
		);
		verifier(
			'un nom écrit derrière un deux-points ou un point-virgule, deux fois dans le texte, est vu ' +
				'deux fois',
			deuxPoints.split('Jean Exemple').length - 1 === 2 &&
				mentionsSignalees(seulDeuxPoints.ecarts).length === 2,
			seulDeuxPoints.ecarts.join(' ; ') || 'rien vu'
		);

		// Le quatrième : un nom écrit à côté de Voltia dans le titre du document, que le lecteur de
		// PDF affiche dans sa barre. Le titre n'est dessiné sur aucune page : seules les métadonnées
		// le portent. Le contrôle doit l'y voir, et celui du cadratin, qui lit le même titre, ne doit
		// pas le recopier (relecture de l'étape 19).
		const titreAvecUnNom = html.replace(
			/<title>[^<]*<\/title>/,
			'<title>Conditions d’utilisation de jadwal (Voltia, Jean Exemple)</title>'
		);
		const octetsDuTitre = await rendre('titre', titreAvecUnNom);
		const seulTitre = voltiaSeulDansLePdf(octetsDuTitre);
		verifier(
			'un nom écrit juste à côté de Voltia, dans le titre que portent les métadonnées, est vu',
			titreAvecUnNom !== html &&
				seulTitre.ecarts.some((ecart) =>
					/^métadonnées, mention \d+ : un mot en majuscule juste après Voltia/.test(ecart)
				),
			seulTitre.ecarts.join(' ; ') || 'rien vu'
		);
		const titreDuTemoin = titreSansCadratin(octetsDuTitre);
		verifier(
			'le contrôle du cadratin du titre ne recopie pas le titre',
			titreDuPdf(octetsDuTitre).includes('Jean Exemple') &&
				!/Jean|Exemple/.test(titreDuTemoin.detail),
			titreDuTemoin.detail.includes('Jean Exemple')
				? 'le détail recopie le titre, et le nom qu’il porte'
				: titreDuTemoin.detail
		);
	} finally {
		rmSync(dossierDuTemoin, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	}

	ecrire(`\nLa mise en pages, lue dans le PDF\n`);
	const parPage = lignesParPage(octets);
	const derniere = parPage[parPage.length - 1]?.length ?? 0;
	verifier(
		'autant de flux de contenu que de pages',
		parPage.length === pages,
		`${parPage.length} contre ${pages}`
	);
	// Le titre du document, 20 points, ouvre la première page, et c'est la seule ligne de ce corps.
	// Lue à l'envers, comme jusqu'à l'étape 15, cette page commencerait par sa dernière ligne de
	// texte courant.
	const pageDuTitre = parPage.findLastIndex((page) => page.some((ligne) => ligne.corps > 18));
	verifier(
		'les pages se lisent de haut en bas : le titre du document ouvre la première page',
		pageDuTitre === 0 && parPage[pageDuTitre][0].corps > 18,
		`page ${pageDuTitre + 1}, première ligne de corps ${parPage[pageDuTitre]?.[0]?.corps}`
	);
	verifier(
		`la dernière page porte au moins ${LIGNES_MINIMUM_DERNIERE_PAGE} lignes`,
		derniere >= LIGNES_MINIMUM_DERNIERE_PAGE,
		`${derniere} ligne(s) ; par page : ${parPage.map((page) => page.length).join(', ')}`
	);
	const defauts = defautsDeMiseEnPages(parPage);
	verifier(
		'aucune ligne ne reste seule en haut ou en bas',
		defauts.length === 0,
		defauts.join(' ; ')
	);

	// Le témoin rendu : une dernière page presque vide, forcée par la feuille de style, doit tomber
	// au bout de toute la chaîne, Chrome, PDF, lecture et contrôle. Jusqu'à l'étape 15, ce témoin
	// comptait sur la mise en pages « telle quelle » pour échouer ; elle passe depuis que plus aucun
	// bloc ne se coupe, et un témoin qui dépend du texte finit toujours par ne plus rien prouver.
	ecrire(`\nLe témoin : une dernière page presque vide, forcée\n`);
	const forcee = await produire({
		variantes: [['dernier paragraphe seul', '.document > :last-child { break-before: page; }']]
	});
	ecrire(
		`      lignes par page : ${forcee.lignes.join(', ')}\n` +
			`      ${forcee.defauts.join(' ; ') || 'aucun défaut'}\n`
	);
	verifier(
		'une dernière page presque vide est vue dans le PDF',
		forcee.defauts.some((defaut) => defaut.startsWith('la dernière page')),
		forcee.defauts.length === 0 ? 'le contrôle ne prouve plus rien, le relire' : ''
	);
	verifier(
		'le pied de page ajoute vraiment de l’encre',
		octets.length > sansPied.octets,
		`${octets.length} contre ${sansPied.octets} octets`
	);
	// Le témoin vient d'écrire un PDF mal mis en pages à la place du document livré : on le
	// refait, avec toutes les variantes, et c'est celui-là qui reste sur le disque.
	const refait = await produire();
	verifier(
		'le document livré est celui qui passe',
		refait.defauts.length === 0,
		`mise en pages : ${refait.variante}`
	);
} finally {
	if (sauvegarde && echecs.length > 0 && !existsSync(PDF)) copyFileSync(sauvegarde, PDF);
	if (sauvegarde) rmSync(sauvegarde, { force: true });
}

/**
 * Le titre que le PDF déclare, sans cadratin. Le détail ne recopie pas le titre, seulement sa
 * longueur et le nombre de cadratins : un nom écrit dans le titre sortirait sinon avec la sortie de
 * l'épreuve, dans un journal ou un rapport (relecture de l'étape 19).
 */
function titreSansCadratin(octets) {
	const titre = titreDuPdf(octets);
	const cadratins = titre.split(CADRATIN).length - 1;
	return {
		accord: cadratins === 0,
		detail:
			titre === ''
				? 'aucun titre lu'
				: `titre de ${titre.length} caractères, ${cadratins} cadratin(s)`
	};
}

/** Le titre que le PDF déclare. Chrome l'y écrit en UTF-16 gros-boutien, marque d'ordre comprise. */
function titreDuPdf(octets) {
	const hexa = /\/Title\s*<([0-9A-Fa-f]+)>/.exec(octets.toString('latin1'))?.[1];
	if (!hexa) return '';
	return Buffer.from(hexa, 'hex').swap16().toString('utf16le').slice(1);
}

if (echecs.length > 0) {
	ecrire(`\nCe qui a échoué :\n`, process.stderr);
	for (const echec of echecs) ecrire(`  - ${echec}\n`, process.stderr);
	process.exitCode = 1;
} else {
	ecrire(
		`\nLes ${verifications} vérifications passent : le document part composé, numéroté et sans cadratin.\n`
	);
}

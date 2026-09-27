#!/usr/bin/env node
/**
 * Éprouve le générateur du PDF pour le juriste.
 *
 *     pnpm conditions:test
 *
 * ## Pourquoi ce test existe
 *
 * `scripts/conditions-pdf.mjs` produit le seul document du dépôt qui sorte du dépôt pour être lu par
 * quelqu'un qui ne le lira qu'une fois. Ce qui y est faux ne sera pas rattrapé : le juriste répondra
 * sur ce qu'il a vu. Trois choses peuvent y être fausses sans que rien ne se plaigne.
 *
 * **Le tiret cadratin.** Le contrôle de style interdit `—` dans `docs/CONDITIONS.md` et dans la page
 * de garde. Il ne dit rien du rendu : une entité HTML, un caractère venu d'un titre, et il
 * réapparaît dans le PDF sans que personne ne l'ait tapé.
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
 * **La durée des sauvegardes.** Le point de la page de garde qui en parle est écrit à la main, dans
 * `QUESTIONS`, et le texte la promet de son côté. Le contrôle lit les deux et les compare.
 *
 * **Le nom de l'exploitant.** Depuis l'étape 18, c'est Voltia, sans nom de personne. Les conditions
 * l'écrivent, le pied de la page de garde le redit, et le onzième point demande au juriste s'il
 * suffit : le contrôle lit les trois et les compare. Il compte aussi les points que l'introduction
 * annonce en lettres, écrits à la main comme elle.
 *
 * Depuis l'étape 19, le nom est aussi cherché **partout dans le PDF**, et non plus dans une seule
 * phrase : un nom écrit juste à côté de « Voltia », au chapeau ou au milieu d'un paragraphe, passait.
 * Le texte que Chrome a dessiné est relu, page par page, pied de page compris ; chaque « Voltia » y
 * est lu avec toute sa phrase, et chaque phrase qui nomme l'exploitant doit nommer Voltia. Quand
 * le poste porte la liste privée des termes interdits, celle du garde-fou, aucun de ses termes ne
 * doit paraître dans le PDF, ni dans ses pages, ni dans ses métadonnées. Un terme trouvé n'est
 * jamais recopié : seul son numéro dans la liste est donné. Le contrôle du nom ne recopie pas le nom
 * qu'il lit, et tout ce que l'épreuve écrit passe par le même masque (`masquer`) : un terme de la
 * liste n'en sort que par son rang. Le onzième point, enfin, dit comme un fait que Voltia est une
 * entreprise individuelle, ce que l'exploitant a confirmé.
 *
 * ## Ce qu'il joue
 *
 * Le document réel, celui de `docs/CONDITIONS.md`, et pas un document inventé : c'est lui qui part.
 * Le script est aussi lancé **comme en production**, en sous-processus, par la même commande que
 * `pnpm conditions:pdf`.
 *
 * Chaque contrôle est doublé d'un témoin qui le fait tomber : un contrôle qui ne sait pas échouer ne
 * prouve rien.
 *
 * ## Ce qu'il ne prouve pas
 *
 * Il ne relit le texte dessiné que pour y chercher des noms et des termes : la typographie, elle,
 * est vérifiée sur le HTML qui part chez Chrome. Un nom est reconnu à sa majuscule, dans la phrase
 * de Voltia : une phrase qu'un saut de page coupe est lue page par page, et un nom écrit dans une
 * autre phrase, sans Voltia, n'est vu que par la liste privée, quand le poste en a une. Le texte
 * est retrouvé par la table `ToUnicode` de chaque police (`texteDuPdf`, dans `conditions-pdf.mjs`),
 * sans outil de plus. Le pied de page est aussi prouvé autrement : le même document est rendu deux
 * fois, avec et sans pied, et les deux PDF sont comparés.
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
	piedDePage,
	produire,
	QUESTIONS,
	texteDuPdf,
	typographierHtml
} from './conditions-pdf.mjs';
import { AUCUNE, cheminDeLaListe, lireListe } from './controle-fuites.mjs';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(racine, 'docs', 'CONDITIONS.md');
const PDF = join(racine, 'A_LIVRER', 'CONDITIONS-jadwal-juriste.pdf');

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

/**
 * La durée que le point sur les sauvegardes annonce au juriste, dans son titre et dans son corps,
 * et celle que le texte promet (« reste au plus N jours dans ces sauvegardes »). Les deux sont
 * lues, aucune n'est écrite ici : si l'une change sans l'autre, le juriste répondrait sur une durée
 * que le texte ne dit plus.
 */
function dureeDesSauvegardes(source, questions) {
	const promise = /reste au plus (\d+) jours dans ces sauvegardes/.exec(source)?.[1];
	const points = questions.filter((point) => /sauvegardes/.test(point.titre));
	const titre = /jusqu.à (\d+) jours/.exec(points[0]?.titre ?? '')?.[1];
	const corps = /(\d+) jours\s+au\s+plus/.exec(points[0]?.corps ?? '')?.[1];
	return {
		accord: promise !== undefined && points.length === 1 && titre === promise && corps === promise,
		detail:
			`conditions : ${promise ?? '(phrase introuvable)'} jours ; point : titre ${titre ?? '?'},` +
			` corps ${corps ?? '?'} ; ${points.length} point(s) sur les sauvegardes`
	};
}

/** Les nombres que l'introduction de la page de garde peut écrire en lettres. */
const NOMBRES = [
	'zéro',
	'un',
	'deux',
	'trois',
	'quatre',
	'cinq',
	'six',
	'sept',
	'huit',
	'neuf',
	'dix',
	'onze',
	'douze',
	'treize',
	'quatorze',
	'quinze'
];

/**
 * Le nombre de points que l'introduction annonce en lettres (« Onze points nous paraissent… »), et
 * celui que la page porte. L'annonce est écrite à la main : un point ajouté sans elle ferait dire
 * « dix » à une page qui en montre onze.
 */
function annonceDesPoints(html) {
	const mot = /(\S+) points nous paraissent/.exec(texteSeul(html))?.[1]?.toLocaleLowerCase('fr');
	const points = html.split('<div class="point">').length - 1;
	return {
		accord: mot !== undefined && NOMBRES.indexOf(mot) === points,
		detail: `annoncés : ${mot ?? '(phrase introuvable)'} ; présents : ${points}`
	};
}

/**
 * Le nom de l'exploitant, lu à trois endroits : la phrase des conditions (« Le service est exploité
 * par X, en Suisse »), la même phrase au pied de la page de garde, et le point qui demande au
 * juriste si ce nom suffit (art. 945 CO). Depuis l'étape 18, c'est Voltia, et aucun nom de personne
 * ne l'accompagne. Si l'un des trois change sans les autres, le juriste répondrait sur un nom que
 * le texte ne porte plus.
 *
 * Le détail ne dit jamais le nom lu, seulement « Voltia » ou « un autre nom » : le vrai nom de
 * l'exploitant, écrit là par erreur, est justement ce que la sortie de l'épreuve ne doit pas porter.
 */
function exploitantNomme(source, html, questions) {
	const motif = /exploité par ([^,.]+), en Suisse/;
	const conditions = motif.exec(source)?.[1];
	const garde = /<section class="garde">([\s\S]*?)<\/section>/.exec(html)?.[1] ?? '';
	const pied = motif.exec(garde)?.[1];
	const points = questions.filter((point) => /art\. 945/.test(point.corps));
	const cite =
		points.length === 1 &&
		conditions !== undefined &&
		points[0].corps.includes(`« ${conditions} »`);
	const dit = (nom) =>
		nom === undefined ? '(phrase introuvable)' : nom === 'Voltia' ? 'Voltia' : 'un autre nom';
	return {
		accord: conditions === 'Voltia' && pied === conditions && cite,
		detail:
			`conditions : ${dit(conditions)} ; pied de la page de garde : ${dit(pied)} ; ` +
			`${points.length} point(s) sur l'art. 945 CO` +
			(points.length === 1 ? (cite ? ', qui cite ce nom' : ', qui ne cite pas ce nom') : '')
	};
}

/** Les espaces insécables du rendu, et l'apostrophe courbe, ramenées à leur forme tapée. */
function aplatir(texte) {
	return texte.replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/’/g, "'");
}

/**
 * Les mots qui peuvent s'écrire avec une majuscule dans la phrase de « Voltia » sans être un nom :
 * ceux qui ouvrent une phrase ou un titre, et ceux du chapeau de la page de garde, qui écrit tout en
 * capitales (« JADWAL, UN SERVICE DE VOLTIA »). La liste est courte à dessein : un mot en majuscule
 * qui n'y est pas fait tomber l'épreuve, et il ne s'y ajoute qu'après une relecture de sa phrase.
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

/**
 * « Voltia », seul, partout où le PDF le dessine : dans le texte, la page de garde, les titres, le
 * chapeau en capitales et le pied de page.
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
 * sortie d'une épreuve serait publié par elle, dans un journal ou un rapport.
 */
function voltiaSeul(pages) {
	const ecarts = [];
	let mentions = 0;
	const mots = (texte) => [...texte.matchAll(/[\p{L}\p{N}]+/gu)].map((trouve) => trouve[0]);
	const suspect = (mot) =>
		/^\p{Lu}/u.test(mot) &&
		mot.toLocaleLowerCase('fr') !== 'voltia' &&
		!MOTS_DE_PHRASE.has(mot.toLocaleLowerCase('fr'));
	pages.forEach((texte, index) => {
		const plat = aplatir(texte);
		for (const trouve of plat.matchAll(/voltia/gi)) {
			mentions += 1;
			const ou = `page ${index + 1}, mention ${mentions}`;
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
 * Les phrases qui nomment l'exploitant, et le nom qu'elles donnent : il doit être « Voltia », seul.
 * `voltiaSeul` voit un nom écrit à côté de Voltia ; celles-ci voient un nom écrit **à sa place**.
 * Chacune doit être trouvée au moins une fois : une phrase récrite sans que ce contrôle suive ne
 * serait plus contrôlée du tout.
 */
const PHRASES_QUI_NOMMENT = [
	['« exploité par … »', /exploité par\s+([^\s,.]+)/gi],
	['« jadwal, un service de … »', /jadwal, un service de\s+([^\s,.]+)/gi],
	['« … est le responsable du traitement »', /([^\s,.]+)\s+est le responsable du traitement/gi],
	["« nomme l'exploitant « … » »", /nomme l'exploitant\s+«\s*([^»]+?)\s*»/gi]
];

function exploitantNommePartout(pages) {
	const texte = aplatir(pages.join('\n')).replace(/\s+/g, ' ');
	const ecarts = [];
	for (const [phrase, motif] of PHRASES_QUI_NOMMENT) {
		const noms = [...texte.matchAll(motif)].map((trouve) => trouve[1]);
		if (noms.length === 0) ecarts.push(`${phrase} : phrase introuvable`);
		const autres = noms.filter((nom) => nom.toLocaleLowerCase('fr') !== 'voltia').length;
		if (autres > 0) ecarts.push(`${phrase} : ${autres} fois un autre nom que Voltia`);
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
 * d'où il vient : les pages du document et les adresses de ses liens à `docs/CONDITIONS.md`, la
 * page de garde, le pied de chaque page et les métadonnées à `scripts/conditions-pdf.mjs`. Seule
 * une autorisation sans commit compte ici : le PDF est fait de l'arbre de travail, pas d'un commit.
 */
function termesDansLePdf(pages, horsDesPages, termes, debutDuDocument) {
	const GENERATEUR = 'scripts/conditions-pdf.mjs';
	const CONDITIONS = 'docs/CONDITIONS.md';
	const morceaux = [];
	pages.forEach((texte, index) => {
		const lignes = texte.split('\n');
		const pied = /^jadwal, conditions d'utilisation\./i.test(aplatir(lignes.at(-1) ?? ''))
			? lignes.pop()
			: '';
		const source = debutDuDocument >= 0 && index >= debutDuDocument ? CONDITIONS : GENERATEUR;
		morceaux.push({ ou: `page ${index + 1}`, source, texte: lignes.join('\n') });
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

/**
 * Le onzième point dit, **comme un fait**, que Voltia est une entreprise individuelle : l'exploitant
 * l'a confirmé à l'étape 19. Une tournure qui en ferait de nouveau une hypothèse, ou qui demanderait
 * une confirmation, ferait répondre le juriste sur une situation que personne n'affirme.
 */
function entrepriseIndividuelle(questions) {
	const points = questions.filter((point) => /art\. 945/.test(point.corps));
	const corps = points[0]?.corps.replace(/\s+/g, ' ') ?? '';
	const fait = /Voltia est une entreprise individuelle/.test(corps);
	const doute = /confirm|suppos|serait une entreprise|semble/i.test(corps);
	return {
		accord: points.length === 1 && fait && !doute,
		detail:
			`${points.length} point(s) sur l'art. 945 CO ; ` +
			(fait ? 'le fait est écrit' : 'le fait n’est pas écrit') +
			(doute ? ', avec une réserve qui en refait une hypothèse' : '')
	};
}

/** Des lignes de texte courant, construites : `n` lignes à un interligne l'une de l'autre. */
function lignesDeTexte(haut, n, interligne = 15) {
	return Array.from({ length: n }, (_, index) => ({ y: haut - index * interligne, corps: 10.5 }));
}

const markdown = readFileSync(SOURCE, 'utf8');
const version = dateDeLaVersion(markdown);
const html = construire(markdown);
const texte = texteSeul(html);

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
for (const [signe, attendu, nom] of [
	[';', FINE, 'fine insécable'],
	['?', FINE, 'fine insécable'],
	[':', INSECABLE, 'insécable']
]) {
	const total = texte.split(signe).length - 1;
	const bons = texte.split(attendu + signe).length - 1;
	verifier(
		`chaque « ${signe} » précédé d'une espace ${nom}`,
		total > 0 && bons === total,
		`${bons}/${total}`
	);
}
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

const points = html.split('<div class="point">').length - 1;
verifier('les onze points pour le juriste sont là', points === 11, `${points} trouvé(s)`);
const annonce = annonceDesPoints(html);
verifier(
	'l’introduction annonce autant de points qu’elle en montre',
	annonce.accord,
	annonce.detail
);
const exploitant = exploitantNomme(markdown, html, QUESTIONS);
verifier(
	'l’exploitant est Voltia seul, dans les conditions, au pied de la page de garde et au point sur son nom',
	exploitant.accord,
	exploitant.detail
);
const individuelle = entrepriseIndividuelle(QUESTIONS);
verifier(
	'le point sur le nom dit, comme un fait, que Voltia est une entreprise individuelle',
	individuelle.accord,
	individuelle.detail
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
// contrôle même qui vérifie qu'ils ont disparu (étape 19, B12). Le motif est le même qu'avant.
verifier(
	'la page de garde ne parle plus d’un lieu de culte',
	!/mos[q]u|mos[c]he[ae]|\u0645\u0633\u062c\u062f/i.test(html)
);
const duree = dureeDesSauvegardes(markdown, QUESTIONS);
verifier(
	'le point sur les sauvegardes dit la durée que promettent les conditions',
	duree.accord,
	duree.detail
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

// Un point qui annonce un jour de moins que le texte, 181 jours contre 182 par exemple. Le jour de
// moins est compté depuis le texte : le contrôle doit tomber, quelle que soit la durée que le point
// écrit.
const joursDuTexte = Number(/reste au plus (\d+) jours dans ces sauvegardes/.exec(markdown)?.[1]);
const enRetard = QUESTIONS.map((point) =>
	/sauvegardes/.test(point.titre)
		? {
				...point,
				titre: point.titre.replace(/\d+ jours/, `${joursDuTexte - 1} jours`),
				corps: point.corps.replace(/\d+(?= jours\s+au\s+plus)/, String(joursDuTexte - 1))
			}
		: point
);
const ecart = dureeDesSauvegardes(markdown, enRetard);
verifier('un point qui annonce un jour de moins que le texte est vu', !ecart.accord, ecart.detail);

// Une annonce qui compte un point de trop, comme « Dix points » l'aurait fait devant neuf.
const annonceFausse = annonceDesPoints(
	html.replace(/\S+( points nous paraissent)/, `${NOMBRES[points + 1] ?? 'mille'}$1`)
);
verifier(
	'une introduction qui annonce un point de trop est vue',
	!annonceFausse.accord,
	annonceFausse.detail
);

// Un nom de personne revenu devant Voltia, dans les conditions puis au seul pied de la page de
// garde ; et une page de garde qui a perdu le point sur le nom. Le nom est vu, et le détail du
// contrôle ne le recopie pas : un nom réel, terme de la liste privée, partirait avec la sortie de
// l'épreuve dans un journal ou un rapport (relecture de l'étape 19).
const avecUnNom = markdown.replace(
	/exploité par [^,.]+, en Suisse/,
	'exploité par Une Personne (Voltia), en Suisse'
);
const nomDansLeTexte = exploitantNomme(avecUnNom, html, QUESTIONS);
verifier(
	'un nom de personne revenu dans les conditions est vu, sans être recopié',
	avecUnNom !== markdown &&
		!nomDansLeTexte.accord &&
		!nomDansLeTexte.detail.includes('Une Personne'),
	nomDansLeTexte.detail
);
const piedAvecUnNom = html.replace(
	/(<section class="garde">[\s\S]*?exploité par )[^,.]+/,
	'$1Une Personne (Voltia)'
);
const nomAuPied = exploitantNomme(markdown, piedAvecUnNom, QUESTIONS);
verifier(
	'un nom de personne revenu au pied de la page de garde est vu, sans être recopié',
	piedAvecUnNom !== html && !nomAuPied.accord && !nomAuPied.detail.includes('Une Personne'),
	nomAuPied.detail
);
const sansLePointDuNom = exploitantNomme(
	markdown,
	html,
	QUESTIONS.filter((point) => !/art\. 945/.test(point.corps))
);
verifier(
	'une page de garde sans le point sur le nom est vue',
	!sansLePointDuNom.accord,
	sansLePointDuNom.detail
);

// Le onzième point tel qu'il était avant que l'exploitant ne confirme : une hypothèse, et une
// confirmation demandée.
const enHypothese = entrepriseIndividuelle(
	QUESTIONS.map((point) =>
		/art\. 945/.test(point.corps)
			? {
					...point,
					corps: point.corps.replace(
						'Voltia est une entreprise individuelle, et non une société.',
						'La question suppose que Voltia est une entreprise individuelle, ce que ' +
							'l’exploitant doit confirmer.'
					)
				}
			: point
	)
);
verifier(
	'un point qui refait de l’entreprise individuelle une hypothèse est vu',
	!enHypothese.accord,
	enHypothese.detail
);

// Les termes interdits, sur un PDF construit, une page de garde puis une page du document, et une
// liste de témoin : un terme absent, un terme sans autorisation, et un terme que la liste autorise
// dans `docs/CONDITIONS.md`. Le deuxième est vu aux deux pages, le troisième à la seule page de
// garde, et seuls leurs rangs reviennent.
const temoinDesTermes = termesDansLePdf(
	['Page de garde, pour le juriste : Témoin-Autorisé.', 'Le document : Témoin-Autorisé.'],
	{ information: [], liens: [] },
	[
		{ rang: 1, texte: 'terme-absent-du-texte', autorises: [] },
		{ rang: 2, texte: 'JURISTE', autorises: [] },
		{ rang: 3, texte: 'témoin-autorisé', autorises: ['docs/CONDITIONS.md'] }
	],
	1
);
const rendu = temoinDesTermes.map((trouve) => `terme n°${trouve.rang} : ${trouve.ou.join(', ')}`);
verifier(
	'un terme de la liste est vu, par son seul rang, sauf là où la liste l’autorise',
	rendu.join(' ; ') === 'terme n°2 : page 1 ; terme n°3 : page 1',
	rendu.join(' ; ')
);

// Un terme de la liste posé après « exploité par », à la place de Voltia : le contrôle du nom le
// voit sans le recopier, et un détail qui le recopierait quand même ne le ferait sortir que par son
// rang, en capitales, avec une espace insécable ou une apostrophe courbe comme en toutes lettres.
const listeDuTemoin = [{ rang: 7, texte: "Jean l'Exemple", autorises: [] }];
const nomDeLaListe = exploitantNomme(
	markdown.replace(/exploité par [^,.]+, en Suisse/, "exploité par Jean l'Exemple, en Suisse"),
	html,
	QUESTIONS
);
const sortieDuTemoin = masquer(
	`${nomDeLaListe.detail} ; exploité par Jean l'Exemple ; JEAN L’EXEMPLE ; Jean\u00a0l'exemple`,
	listeDuTemoin
);
verifier(
	'un terme de la liste mis à la place de Voltia est vu, et ne sort de l’épreuve que par son rang',
	!nomDeLaListe.accord &&
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
	verifier(
		'son titre ne porte pas de cadratin',
		!titreDuPdf(octets).includes(CADRATIN),
		titreDuPdf(octets)
	);
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
		'le texte relu porte le chapeau en capitales, le document et le pied de page',
		toutLeTexte.includes('UN SERVICE DE VOLTIA') &&
			toutLeTexte.includes("Conditions d'utilisation") &&
			toutLeTexte.includes(`page 1 sur ${pages}`)
	);
	const seul = voltiaSeul(pagesLues);
	verifier(
		'partout où le PDF dessine Voltia, aucun nom n’est écrit à côté',
		seul.mentions >= 6 && seul.ecarts.length === 0,
		`${seul.mentions} mention(s)${seul.ecarts.length > 0 ? ` ; ${seul.ecarts.join(' ; ')}` : ''}`
	);
	const nomme = exploitantNommePartout(pagesLues);
	verifier(
		'chaque phrase qui nomme l’exploitant nomme Voltia',
		nomme.length === 0,
		nomme.join(' ; ')
	);
	// La page où le document commence, après la page de garde : son titre ouvre la page.
	const debutDuDocument = pagesLues.findIndex((texte) =>
		aplatir(texte).startsWith("Conditions d'utilisation\n")
	);
	verifier(
		'le document commence après la page de garde, sur une page à lui',
		debutDuDocument > 0,
		`page ${debutDuDocument + 1}`
	);
	if (listePrivee.etat === 'lue') {
		const trouves = termesDansLePdf(
			pagesLues,
			chainesHorsDesPages(octets),
			listePrivee.termes,
			debutDuDocument
		);
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

	// Le témoin rendu : le même document, avec un nom écrit à côté de Voltia dans le chapeau, que la
	// feuille de style met en capitales, et un autre à sa place dans les conditions. Rendu par Chrome
	// dans un dossier temporaire, relu dans le PDF, comme le document livré.
	ecrire(`\nLe témoin : un nom écrit à côté de Voltia, dans un PDF rendu\n`);
	const auChapeau = html.replace('un service de Voltia.', 'un service de Voltia, Jean Exemple.');
	const avecDesNoms = auChapeau.replace(
		/(<section class="document">[\s\S]*?exploité par )Voltia/,
		'$1Jean Exemple (Voltia)'
	);
	const dossierDuTemoin = mkdtempSync(join(tmpdir(), 'jadwal-conditions-temoin-'));
	try {
		const cheminDuTemoin = join(dossierDuTemoin, 'temoin.html');
		writeFileSync(cheminDuTemoin, avecDesNoms, 'utf8');
		await imprimer(cheminDuTemoin, join(dossierDuTemoin, 'temoin.pdf'), piedDePage(version));
		const pagesDuTemoin = texteDuPdf(readFileSync(join(dossierDuTemoin, 'temoin.pdf')));
		const seulTemoin = voltiaSeul(pagesDuTemoin);
		verifier(
			'un nom écrit juste à côté de Voltia, en capitales au chapeau puis dans le texte, est vu',
			auChapeau !== html &&
				avecDesNoms !== auChapeau &&
				seulTemoin.ecarts.some((ecart) => ecart.startsWith('page 1,')) &&
				seulTemoin.ecarts.filter((ecart) => !ecart.startsWith('page 1,')).length > 0,
			seulTemoin.ecarts.join(' ; ') || 'rien vu'
		);
		const nommeTemoin = exploitantNommePartout(pagesDuTemoin);
		verifier(
			'un nom écrit à la place de Voltia, après « exploité par », est vu',
			nommeTemoin.some((ecart) => ecart.startsWith('« exploité par')),
			nommeTemoin.join(' ; ') || 'rien vu'
		);
		// L'ancien contrôle ne lisait le nom que dans la phrase « exploité par … » : le nom du chapeau
		// lui échappait.
		const ancien = exploitantNomme(markdown, auChapeau, QUESTIONS);
		verifier(
			'l’ancien contrôle, qui ne lisait qu’une phrase, laissait passer le nom du chapeau',
			ancien.accord,
			ancien.detail
		);

		// Le second témoin rendu : un nom écrit derrière un mot de phrase, « VOLTIA DE JEAN EXEMPLE »
		// au chapeau, « Voltia de Jean Exemple » puis « Voltia, entreprise de Jean Exemple » dans le
		// texte. Le mot qui touche Voltia est un mot de liaison ou un mot en minuscules : un contrôle
		// qui ne lit que ce voisin laisse passer le nom (relecture de l'étape 19).
		const derriereAuChapeau = html.replace(
			'un service de Voltia.',
			'un service de Voltia de Jean Exemple.'
		);
		const derriere = derriereAuChapeau
			.replace(/(<section class="document">[\s\S]*?exploité par Voltia)/, '$1 de Jean Exemple')
			.replace(
				/(<section class="document">[\s\S]*?)Voltia est le responsable/,
				'$1Voltia, entreprise de Jean Exemple, est le responsable'
			);
		const cheminDerriere = join(dossierDuTemoin, 'derriere.html');
		writeFileSync(cheminDerriere, derriere, 'utf8');
		await imprimer(cheminDerriere, join(dossierDuTemoin, 'derriere.pdf'), piedDePage(version));
		const seulDerriere = voltiaSeul(
			texteDuPdf(readFileSync(join(dossierDuTemoin, 'derriere.pdf')))
		);
		const mentionsVues = [...new Set(seulDerriere.ecarts.map((ecart) => ecart.split(' : ')[0]))];
		verifier(
			'un nom écrit derrière un mot de liaison ou un mot en minuscules, en capitales au chapeau ' +
				'puis deux fois dans le texte, est vu',
			derriereAuChapeau !== html &&
				derriere.split('Jean Exemple').length - 1 === 3 &&
				mentionsVues.filter((mention) => mention.startsWith('page 1,')).length === 1 &&
				mentionsVues.filter((mention) => !mention.startsWith('page 1,')).length === 2,
			seulDerriere.ecarts.join(' ; ') || 'rien vu'
		);

		// Le troisième témoin rendu : un nom écrit derrière un deux-points ou un point-virgule,
		// « VOLTIA : JEAN EXEMPLE » au chapeau, « à Voltia : Jean Exemple » puis « exploité par
		// Voltia ; Jean Exemple » dans le texte. Ni l'un ni l'autre ne ferme la phrase : un contrôle
		// qui s'y arrête laisse passer le nom (relecture de l'étape 19).
		const deuxPoints = construire(
			markdown
				.replace(
					'Pour toute question ou demande : **contact@voltia.ch**.',
					'Pour toute question ou demande à Voltia : Jean Exemple, **contact@voltia.ch**.'
				)
				.replace('exploité par Voltia, en Suisse', 'exploité par Voltia ; Jean Exemple, en Suisse')
		).replace('un service de Voltia.', 'un service de Voltia : Jean Exemple.');
		const cheminDeuxPoints = join(dossierDuTemoin, 'deux-points.html');
		writeFileSync(cheminDeuxPoints, deuxPoints, 'utf8');
		await imprimer(cheminDeuxPoints, join(dossierDuTemoin, 'deux-points.pdf'), piedDePage(version));
		const seulDeuxPoints = voltiaSeul(
			texteDuPdf(readFileSync(join(dossierDuTemoin, 'deux-points.pdf')))
		);
		const vuesDeuxPoints = [
			...new Set(seulDeuxPoints.ecarts.map((ecart) => ecart.split(' : ')[0]))
		];
		verifier(
			'un nom écrit derrière un deux-points ou un point-virgule, en capitales au chapeau puis ' +
				'deux fois dans le texte, est vu',
			deuxPoints.split('Jean Exemple').length - 1 === 3 &&
				vuesDeuxPoints.filter((mention) => mention.startsWith('page 1,')).length === 1 &&
				vuesDeuxPoints.filter((mention) => !mention.startsWith('page 1,')).length === 2,
			seulDeuxPoints.ecarts.join(' ; ') || 'rien vu'
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
	// Le titre du document, 20 points, ouvre la page qui suit la page de garde. Lue à l'envers,
	// comme jusqu'à l'étape 15, cette page commencerait par sa dernière ligne de texte courant.
	const pageDuTitre = parPage.findLastIndex((page) => page.some((ligne) => ligne.corps > 18));
	verifier(
		'les pages se lisent de haut en bas : le titre du document ouvre sa page',
		pageDuTitre >= 0 && parPage[pageDuTitre][0].corps > 18,
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

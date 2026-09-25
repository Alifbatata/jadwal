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
 * Il ne relit pas le texte dessiné dans le PDF : extraire le texte d'un PDF demande de suivre les
 * tables de glyphes de chaque police, et cet outil n'existe pas ici. Le pied de page est donc prouvé
 * autrement : le même document est rendu deux fois, avec et sans pied, et les deux PDF sont comparés.
 *
 * Il a besoin de Chrome, comme le script lui-même.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	construire,
	dateDeLaVersion,
	defautsDeMiseEnPages,
	ECART_ENTRE_DEUX_BLOCS,
	lignesParPage,
	LIGNES_MINIMUM_DERNIERE_PAGE,
	nombreDePages,
	piedDePage,
	produire,
	QUESTIONS,
	typographierHtml
} from './conditions-pdf.mjs';

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

function verifier(quoi, condition, detail = '') {
	verifications += 1;
	if (!condition) echecs.push(detail ? `${quoi} : ${detail}` : quoi);
	process.stdout.write(`  ${condition ? 'ok  ' : 'NON '} ${quoi}${detail ? ` (${detail})` : ''}\n`);
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

/** Des lignes de texte courant, construites : `n` lignes à un interligne l'une de l'autre. */
function lignesDeTexte(haut, n, interligne = 15) {
	return Array.from({ length: n }, (_, index) => ({ y: haut - index * interligne, corps: 10.5 }));
}

const markdown = readFileSync(SOURCE, 'utf8');
const version = dateDeLaVersion(markdown);
const html = construire(markdown);
const texte = texteSeul(html);

process.stdout.write(
	`\nLe document rendu, à partir de docs/CONDITIONS.md (version du ${version})\n`
);

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
verifier('les dix points pour le juriste sont là', points === 10, `${points} trouvé(s)`);
const liste = listeSuivie(markdown, html);
verifier(
	'la liste des données personnelles se suit d’un bout à l’autre',
	liste.suivie,
	liste.detail
);
verifier(
	'la page de garde ne parle plus d’un lieu de culte',
	!/mosqu|moschee|moschea|مسجد/i.test(html)
);
const duree = dureeDesSauvegardes(markdown, QUESTIONS);
verifier(
	'le point sur les sauvegardes dit la durée que promettent les conditions',
	duree.accord,
	duree.detail
);

process.stdout.write(`\nLes témoins : chaque contrôle sait tomber\n`);

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

process.stdout.write(`\nLes lignes seules, sur des pages construites\n`);

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

process.stdout.write(`\nLe pied de page\n`);

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
	process.stdout.write(`  sans pied : ${sansPied.pages} pages, ${sansPied.octets} octets\n`);

	process.stdout.write(`\nLe script lancé comme en production\n`);
	const sortie = execFileSync(process.execPath, [join(racine, 'scripts', 'conditions-pdf.mjs')], {
		cwd: racine,
		encoding: 'utf8'
	});
	process.stdout.write(
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

	process.stdout.write(`\nLa mise en pages, lue dans le PDF\n`);
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
	process.stdout.write(`\nLe témoin : une dernière page presque vide, forcée\n`);
	const forcee = await produire({
		variantes: [['dernier paragraphe seul', '.document > :last-child { break-before: page; }']]
	});
	process.stdout.write(
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
	process.stderr.write(`\nCe qui a échoué :\n`);
	for (const echec of echecs) process.stderr.write(`  - ${echec}\n`);
	process.exitCode = 1;
} else {
	process.stdout.write(
		`\nLes ${verifications} vérifications passent : le document part composé, numéroté et sans cadratin.\n`
	);
}

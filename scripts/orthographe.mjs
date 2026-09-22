#!/usr/bin/env node
/**
 * Relit **tout ce que des gens lisent**, avec LanguageTool, hors réseau.
 *
 *     pnpm orthographe
 *
 * ## Pourquoi il existe
 *
 * `pnpm style` retire des tics : le tiret cadratin et une liste de chevilles. Il ne comprend ni le
 * français, ni l'allemand, ni l'italien, et il ne voit aucune faute d'orthographe ni d'accord. Or le
 * service parle quatre langues à des gens qui ne les parlent pas toutes, et une faute dans un écran
 * public est ce qui se remarque en premier.
 *
 * ## Comment il tourne
 *
 * LanguageTool dans un conteneur, **sans réseau** : `--network none`. Rien de ce qui est relu ne
 * sort du poste, ce qui compte pour un texte qui n'est pas encore publié, et le résultat ne dépend
 * d'aucun service qui pourrait changer sous nos pieds.
 *
 * L'image est épinglée par empreinte, à une version exacte publiée depuis plus de sept jours, comme
 * toutes les images du dépôt (ADR 0010). **Aucune donnée n-grammes** : elles pèsent des gigaoctets,
 * elles demandent un téléchargement séparé, et elles servent à départager des homonymes, pas à
 * trouver des fautes.
 *
 * ## Ce qu'il relit
 *
 * Les documents, les gabarits des écrans, et les chaînes des modules de messages — les mêmes
 * surfaces que le contrôle de style, plus les ADR et le `README`. Les commentaires de code et le
 * code en sont exclus : ils sont écrits pour celui qui reprend le projet. Les maquettes de
 * `docs/maquettes/` aussi : elles décrivent les écrans pour celui qui les construit.
 *
 * Avant de relire, il vérifie qu'il n'a oublié aucun document : chaque fichier Markdown suivi de
 * `docs/`, hors `docs/maquettes/`, plus le `README`, `CONTRIBUTING.md` et `SECURITY.md`. Il en
 * oubliait huit, les conditions comprises (`documentsOublies`).
 *
 * Les dictionnaires des pages publiques sont relus langue par langue. Trois modules rangent aussi
 * leurs phrases par langue, sous des clés `fr:`, `de:`, `it:` et `ar:` : la mise en mots des pages
 * publiques, le libellé d'ancrage du flux agenda et le widget. Chaque chaîne y est relue dans la
 * langue de sa clé (`parLangue`).
 *
 * Le Markdown est nettoyé **ligne à ligne**, en remplaçant par des espaces ce qui n'est pas de la
 * prose : blocs de code, code en ligne, adresses, balises. Le compte de lignes est donc conservé, et
 * un numéro de ligne rendu ici désigne la bonne ligne du bon fichier.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne corrige rien. Il ne coupe aucune règle en bloc sans raison écrite : la liste des règles
 * ignorées est ci-dessous, chacune avec la sienne. Et il ne sait pas tout : voir `AR` plus bas.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QUESTIONS } from './conditions-pdf.mjs';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * LanguageTool 6.8, publiée le 2026-06-15, épinglée par le digest de son index multi-architecture.
 * Le digest prime sur l'étiquette : une étiquette qui bouge ferait changer le verdict sans qu'une
 * ligne du dépôt n'ait changé.
 */
const IMAGE =
	'erikvl87/languagetool@sha256:ef8fa12cbd485166c9ceeb7139d76d56d07707a624da6bb1fc1fbb5411750527';

/**
 * Les variantes visées. Le service est suisse : `fr-CH` et `de-CH` connaissent les nombres, les
 * guillemets et le vocabulaire d'ici, ce que `fr-FR` et `de-DE` corrigeraient à tort.
 *
 * `ar` : LanguageTool n'a pour l'arabe qu'un correcteur orthographique et quelques règles de
 * ponctuation. **Il ne vérifie ni l'accord, ni la syntaxe, ni les hamzas mal placées.** C'est dit
 * ici plutôt que de laisser croire à une relecture complète.
 */
const LANGUES = [
	['fr', 'fr-CH', 'français (Suisse)'],
	['de', 'de-CH', 'allemand (Suisse)'],
	['it', 'it', 'italien'],
	['ar', 'ar', 'arabe, orthographe et ponctuation seulement']
];

/**
 * Les règles ignorées, et la raison de chacune. Une règle n'entre ici que si elle se trompe **sur
 * nos textes**, pas parce qu'elle dérange.
 */
const REGLES_IGNOREES = [
	[
		'WHITESPACE_RULE',
		'les espaces sont posées par prettier, et deux espaces après un point sont introuvables ici'
	],
	['FRENCH_WHITESPACE', 'la typographie fine est appliquée au rendu du PDF, pas dans les sources'],
	['UNPAIRED_BRACKETS', 'le Markdown nettoyé laisse des parenthèses de liens sans leur paire'],
	['EN_QUOTES', 'les guillemets droits des chaînes de code ne sont pas de la ponctuation'],
	[
		'DE_CASE',
		'les chaînes courtes des écrans ne sont pas des phrases, et la majuscule allemande y est décidée par la place du mot'
	],
	[
		'UPPERCASE_SENTENCE_START',
		'une chaîne d’écran commence souvent par un mot en minuscule, par construction'
	],
	[
		'COMMA_PARENTHESIS_WHITESPACE',
		'même cause que les parenthèses dépareillées : le nettoyage du Markdown'
	],
	[
		'ARABIC_WORD_REPEAT_RULE',
		'un mot répété dans une liste de jours ou de mois n’est pas une faute'
	],
	[
		'NOMBRES_EN_LETTRES_2',
		'elle réclame « sept » là où le document écrit 7 : une documentation technique écrit ses ' +
			'durées et ses comptes en chiffres, et une tabelle en lettres serait illisible'
	],
	['NOMBRES_EN_LETTRES_2_IMPROVED', 'même règle, même raison'],
	[
		'FLECHES',
		'elle prend les opérateurs de comparaison cités dans les documents, comme <=, pour des ' +
			'flèches mal dessinées'
	],
	[
		'PLACE_ADJ',
		'elle veut l’adjectif avant le nom dans « une ligne fausse » ou « une alerte vraie » ; ' +
			'l’ordre choisi porte l’insistance, et il est tenu partout'
	],
	[
		'IL_FAUT',
		'elle ajoute « il » devant « vaut », y compris dans « mieux vaut » et derrière un sujet ' +
			'déjà présent'
	],
	[
		'PAUSE_POSE',
		'elle propose « pose » pour « pause », qui est un mot du domaine : une pause suspend un cours'
	],
	[
		'ACCORD_EXPRESSION_SANS_COMPLEMENT',
		'elle réclame un pluriel après « sans » dans « sans mot de passe » et « sans limite », où ' +
			'le singulier est la forme reçue'
	],
	[
		'MOTS_INCOMP',
		'elle tombe sur les cellules de tableau et sur les interpolations rendues au substitut, où ' +
			'deux mots se touchent sans phrase autour'
	],
	['D_N', 'elle confond le genre de sigles cités, comme « le CORS »'],
	[
		'FR_REPEATEDWORDS_FAÇON',
		'elle compte les répétitions à travers tout le corpus recollé, où chaque document est ' +
			'indépendant des autres : deux « façon » dans deux ADR ne sont pas une répétition'
	],
	[
		'grammar_0011_notjazem_lam_nafia',
		'en arabe, elle propose parfois le mot déjà écrit, et la forme demandée dépend d’une ' +
			'vocalisation que les écrans ne portent pas (ADR 0007)'
	],
	[
		'PAS_DE_VIRGULE',
		'la virgule avant « et » est un choix d’écriture du dépôt, tenu partout : elle sépare deux ' +
			'propositions ou ferme une énumération longue, et la règle la refuse sans regarder laquelle'
	]
];

const MOTIF_IGNOREES = new Set(REGLES_IGNOREES.map(([regle]) => regle));

/**
 * Les signalements relus un par un et acceptés, dans `orthographe-acceptees.txt`.
 *
 * Une règle coupée laisserait passer un vrai défaut ailleurs ; une liste de cas garde la règle
 * allumée et n'excuse que ce qui a été lu. La clé est le triplet fichier, règle, texte : le
 * numéro de ligne bouge à chaque réécriture, le triplet non.
 */
function acceptees() {
	const brut = readFileSync(join(racine, 'scripts', 'orthographe-acceptees.txt'), 'utf8');
	const cas = new Set();
	for (const ligne of brut.split(/\r?\n/)) {
		if (ligne.trim().startsWith('#') || !ligne.includes('|')) continue;
		const [chemin, regle, ...reste] = ligne.split('|');
		cas.add(`${chemin.trim()}|${regle.trim()}|${reste.join('|').trim()}`);
	}
	return cas;
}

/** Le dictionnaire du projet : noms propres et termes techniques, relu à la main. */
function dictionnaire() {
	const brut = readFileSync(join(racine, 'scripts', 'dictionnaire-orthographe.txt'), 'utf8');
	const mots = new Set();
	for (const ligne of brut.split(/\r?\n/)) {
		const mot = ligne.replace(/#.*$/, '').trim();
		if (mot) {
			mots.add(mot);
			mots.add(mot.toLocaleLowerCase('fr'));
		}
	}
	return mots;
}

// ------------------------------------------------------------------------------------------------
// Extraire la prose, et rien qu'elle, sans perdre le compte des lignes.
// ------------------------------------------------------------------------------------------------

/**
 * Ce qui remplaçe un bout de code en ligne ou une adresse au milieu d'une phrase.
 *
 * Un trou ferait dire au correcteur que la phrase est incomplète, que la virgule est mal placée
 * et que le point manque d'espace : mesuré, c'était trois cents signalements sur onze règles, et
 * les couper toutes aurait caché les vraies fautes de ponctuation.
 *
 * « ceci » est un pronom invariable : il tient la place d'un sujet comme d'un complément sans
 * imposer de genre ni de nombre à ce qui l'entoure.
 */
const SUBSTITUT = 'ceci';
/** Le substitut, entouré d'espaces : collé à un mot, il en formerait un autre. */
const POSER_SUBSTITUT = ` ${SUBSTITUT} `;

/**
 * Un document Markdown, moins ce qui n'est pas de la prose.
 *
 * Trois passes, et l'ordre compte. Les blocs de code partent en premier, sinon leurs trois accents
 * graves se feraient lire comme des débuts de code en ligne. Les spans entre accents graves partent
 * ensuite, **sur le document entier** : ils enjambent souvent un retour à la ligne, et une passe
 * ligne par ligne en ouvrait un au milieu d'un autre. Le reste se traite ligne par ligne.
 */
function prose(markdown) {
	const lignes = markdown.split(/\r?\n/);
	let dansUnBloc = false;
	const sansBlocs = lignes.map((ligne) => {
		if (/^\s*```/.test(ligne)) {
			dansUnBloc = !dansUnBloc;
			return '';
		}
		if (dansUnBloc) return '';
		// Un tableau Markdown : les barres et les tirets d'alignement ne sont pas du texte.
		if (/^\s*\|[\s:|-]+\|\s*$/.test(ligne)) return '';
		// Un bloc de code indenté.
		return /^\s{4,}\S/.test(ligne) ? '' : ligne;
	});

	const sansCode = sansBlocs
		.join('\n')
		.replace(/`[^`]*`/gs, (span) => POSER_SUBSTITUT + span.replace(/[^\n]/g, ''));

	return sansCode
		.split('\n')
		.map((ligne) =>
			ligne
				// Une puce Markdown se lit comme un tiret de dialogue, et le correcteur réclame alors
				// une majuscule après. Elle part, le texte de la puce reste.
				.replace(/^(\s*)(?:[-*+]|\d+\.)\s+/, '$1')
				.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
				.replace(/https?:\/\/\S+/g, POSER_SUBSTITUT)
				.replace(/<[^>]*>/g, ' ')
				// Un titre n'a pas de point final, et le correcteur en réclame un à chaque fois. Le
				// marqueur part, un point le remplace : le titre reste relu, sans ce faux signalement.
				.replace(/^\s*#+\s*(.*)$/, (tout, titre) => ` ${titre.replace(/[.:!?]\s*$/, '')}.`)
				.replace(/^\s*>+\s*/, ' ')
				// Une emphase collée à une élision, « l'**iqama** » : remplacée par une espace comme les
				// autres, elle donnait « l' iqama », et le correcteur signalait l'espace après l'apostrophe.
				.replace(/(['’])[*_]+/g, '$1')
				.replace(/[*_|]/g, ' ')
		)
		.join('\n');
}

/** Un composant Svelte, moins son `<script>`, son `<style>` et ses commentaires. */
function gabarit(source) {
	let texte = source
		.replace(/<script[\s\S]*?<\/script>/g, (bloc) => bloc.replace(/[^\n]/g, ' '))
		// Un `<code>` d'écran porte un nom de colonne ou de commande, jamais une phrase.
		// Le substitut plutôt qu'un trou : ces noms se suivent souvent, séparés par des virgules,
		// et un trou ferait voir au correcteur deux ponctuations collées.
		.replace(/<code[^>]*>[\s\S]*?<\/code>/g, (bloc) => POSER_SUBSTITUT + bloc.replace(/[^\n]/g, ''))
		.replace(/<style[\s\S]*?<\/style>/g, (bloc) => bloc.replace(/[^\n]/g, ' '))
		.replace(/<!--[\s\S]*?-->/g, (bloc) => bloc.replace(/[^\n]/g, ' '));
	// Les attributs, les expressions et les balises ne sont pas lus par un visiteur.
	// Une expression de gabarit tient souvent sur plusieurs lignes, et un `{` ouvre un bloc qui
	// en contient d'autres. Une expression régulière ne sait pas compter les accolades : celle-ci
	// les compte. Sans cela, `{lecture\n.refusees.length}` arrivait au correcteur, qui proposait
	// « refusées » pour un nom de champ.
	let sans = '';
	for (let index = 0; index < texte.length; index += 1) {
		if (texte[index] !== '{') {
			sans += texte[index];
			continue;
		}
		let profondeur = 0;
		let fin = index;
		for (; fin < texte.length; fin += 1) {
			if (texte[fin] === '{') profondeur += 1;
			else if (texte[fin] === '}') {
				profondeur -= 1;
				if (profondeur === 0) break;
			}
		}
		// Les retours à la ligne de l'expression sont gardés : les numéros de ligne doivent tenir.
		const avale = texte.slice(index, Math.min(fin + 1, texte.length));
		sans += POSER_SUBSTITUT + avale.replace(/[^\n]/g, '');
		index = fin;
	}
	return sans.replace(/<[^>]*>/g, ' ');
}

/**
 * Une chaîne qui est un identifiant, et non une phrase : `moved_away`, `org`, `@jadwal/core`.
 *
 * Le correcteur ne sait pas les distinguer d'un mot mal écrit, et les ajouter au dictionnaire du
 * projet reviendrait à y ranger du code. La règle est simple et se vérifie à l'œil : un seul mot,
 * en minuscules, sans accent, éventuellement coupé de tirets bas, de points ou de barres obliques.
 * Un texte d'écran d'un seul mot commence par une majuscule, ou porte un accent, ou une apostrophe.
 */
const IDENTIFIANT = /^[@a-z][a-z0-9_./-]*$/;

/**
 * Un module, réduit à ce qui est entre guillemets. L'automate est celui du contrôle de style : il
 * connaît les trois délimiteurs et les échappements.
 *
 * `identifiants: false` garde aussi les chaînes d'un seul mot en minuscules. C'est le cas des
 * valeurs rangées sous une clé de langue (`parLangue`) et des dictionnaires de `i18n.ts` : elles
 * sont du texte par construction, et le filtre y effaçait justement ce qu'il fallait relire,
 * « premier », « allemand », « ultimo », « lundi », « oggi ».
 */
function chaines(source, { identifiants = true } = {}) {
	let sortie = '';
	let etat = 'code';
	let delimiteur = '';
	/** La chaîne en cours, pour décider à sa fermeture si c'est une phrase ou un identifiant. */
	let courante = '';
	/** Où la chaîne en cours commence dans la sortie : c'est cette plage qu'on efface. */
	let debutDansLaSortie = 0;
	for (let index = 0; index < source.length; index += 1) {
		const caractere = source[index];
		if (etat === 'code') {
			if (caractere === "'" || caractere === '"' || caractere === '`') {
				etat = 'chaine';
				delimiteur = caractere;
				courante = '';
				sortie += ' ';
				debutDansLaSortie = sortie.length;
			} else if (caractere === '/' && source[index + 1] === '/') {
				etat = 'ligne';
				sortie += ' ';
			} else if (caractere === '/' && source[index + 1] === '*') {
				etat = 'bloc';
				sortie += ' ';
			} else {
				sortie += caractere === '\n' ? '\n' : ' ';
			}
			continue;
		}
		if (etat === 'chaine') {
			// `${…}` dans un gabarit littéral est du code, pas du texte. Sans cette branche, le
			// correcteur relit des noms de variables et des appels de méthode.
			if (delimiteur === '`' && caractere === '$' && source[index + 1] === '{') {
				let profondeur = 0;
				let fin = index + 1;
				for (; fin < source.length; fin += 1) {
					if (source[fin] === '{') profondeur += 1;
					else if (source[fin] === '}') {
						profondeur -= 1;
						if (profondeur === 0) break;
					}
				}
				// Le substitut, et non un trou : une interpolation tient la place d'un mot dans la
				// phrase, et l'effacer donnait « le cours du est annulé ».
				const avale = source.slice(index, fin + 1);
				sortie += POSER_SUBSTITUT + avale.replace(/[^\n]/g, '');
				index = fin;
				continue;
			}
			if (caractere === '\\') {
				sortie += '  ';
				index += 1;
				continue;
			}
			if (caractere === delimiteur) {
				etat = 'code';
				// La chaîne vient d'être fermée : si c'est un identifiant, elle est effacée de la
				// sortie, en gardant les retours à la ligne pour que le compte reste juste. Toute sa
				// plage, et non ses seuls caractères : un gabarit y a aussi écrit un substitut par
				// interpolation, et compter à rebours depuis la fin laissait « le ce » de `le ${jours}`.
				if (identifiants && IDENTIFIANT.test(courante.trim())) {
					sortie =
						sortie.slice(0, debutDansLaSortie) +
						sortie.slice(debutDansLaSortie).replace(/[^\n]/g, ' ');
				}
				courante = '';
				sortie += ' ';
				continue;
			}
			courante += caractere;
			sortie += caractere === '\n' ? '\n' : caractere;
			continue;
		}
		if (etat === 'ligne') {
			if (caractere === '\n') etat = 'code';
			sortie += caractere === '\n' ? '\n' : ' ';
			continue;
		}
		if (caractere === '*' && source[index + 1] === '/') {
			etat = 'code';
			sortie += '  ';
			index += 1;
			continue;
		}
		sortie += caractere === '\n' ? '\n' : ' ';
	}
	return sortie;
}

/**
 * L'indice qui suit la chaîne ouverte en `debut` : guillemet simple, double, ou gabarit. Le code
 * d'un `${…}` peut porter d'autres chaînes, et même des gabarits : il est parcouru par
 * `finDeValeur`, qui s'arrête à l'accolade qui le ferme.
 */
function finDeChaine(source, debut) {
	const delimiteur = source[debut];
	let index = debut + 1;
	while (index < source.length) {
		const caractere = source[index];
		if (caractere === '\\') index += 2;
		else if (caractere === delimiteur) return index + 1;
		else if (delimiteur === '`' && caractere === '$' && source[index + 1] === '{') {
			index = finDeValeur(source, index + 2, { virgule: false }) + 1;
		} else index += 1;
	}
	return source.length;
}

/**
 * La fin d'une valeur de code commencée en `debut` : la première virgule, le premier point-virgule
 * ou le premier fermant de niveau zéro. Parenthèses, crochets et accolades sont comptés ; chaînes,
 * gabarits et commentaires sont sautés d'un bloc, pour qu'une virgule ou une accolade écrite dans
 * un texte ne coupe pas la valeur. Dans un `${…}`, seule l'accolade fermante arrête.
 */
function finDeValeur(source, debut, { virgule = true } = {}) {
	let profondeur = 0;
	let index = debut;
	while (index < source.length) {
		const caractere = source[index];
		if (caractere === "'" || caractere === '"' || caractere === '`') {
			index = finDeChaine(source, index);
			continue;
		}
		if (caractere === '/' && source[index + 1] === '/') {
			const fin = source.indexOf('\n', index);
			index = fin < 0 ? source.length : fin;
			continue;
		}
		if (caractere === '/' && source[index + 1] === '*') {
			const fin = source.indexOf('*/', index + 2);
			index = fin < 0 ? source.length : fin + 2;
			continue;
		}
		if ('([{'.includes(caractere)) profondeur += 1;
		else if (')]}'.includes(caractere)) {
			if (profondeur === 0) return index;
			profondeur -= 1;
		} else if (virgule && profondeur === 0 && (caractere === ',' || caractere === ';')) {
			return index;
		}
		index += 1;
	}
	return source.length;
}

/**
 * Un module qui range ses phrases par langue, découpé en autant de textes que de langues.
 *
 * Chaque clé `fr:`, `de:`, `it:` ou `ar:` d'un littéral d'objet donne une plage : sa valeur, une
 * chaîne, une fonction fléchée ou un objet, délimitée par `finDeValeur`. La clé doit suivre une
 * accolade ou une virgule, ce qui écarte un ternaire et une annotation de type. Quand deux plages
 * s'emboîtent, **la plus intérieure l'emporte** : dans `fr: { fr: 'français', de: 'Französisch' }`,
 * la clé extérieure est la langue enseignée, et c'est la clé intérieure qui dit dans quelle
 * langue « Französisch » est écrit.
 *
 * Pour chaque langue, le texte rendu est le fichier entier, où tout ce qui n'appartient pas à cette
 * langue est blanchi, retours à la ligne gardés : les numéros de ligne restent ceux du fichier, et
 * `chaines` fait le reste comme pour les autres modules.
 */
function parLangue(source) {
	const langues = new Set(LANGUES.map(([langue]) => langue));
	const plages = [];
	const mot = /[A-Za-z_$][\w$]*/y;
	const deuxPoints = /\s*:(?!:)\s*/y;
	/** Le dernier caractère significatif du code, commentaires et blancs exclus. */
	let precedent = '';
	let index = 0;
	while (index < source.length) {
		const caractere = source[index];
		if (caractere === "'" || caractere === '"' || caractere === '`') {
			index = finDeChaine(source, index);
			precedent = caractere;
			continue;
		}
		if (caractere === '/' && source[index + 1] === '/') {
			const fin = source.indexOf('\n', index);
			index = fin < 0 ? source.length : fin;
			continue;
		}
		if (caractere === '/' && source[index + 1] === '*') {
			const fin = source.indexOf('*/', index + 2);
			index = fin < 0 ? source.length : fin + 2;
			continue;
		}
		mot.lastIndex = index;
		const lu = mot.exec(source);
		if (lu) {
			const suite = index + lu[0].length;
			deuxPoints.lastIndex = suite;
			if (
				langues.has(lu[0]) &&
				(precedent === '{' || precedent === ',') &&
				deuxPoints.test(source)
			) {
				const debut = deuxPoints.lastIndex;
				plages.push({ langue: lu[0], debut, fin: finDeValeur(source, debut) });
			}
			// La valeur n'est pas sautée : les clés qu'elle contient sont cherchées à leur tour.
			index = suite;
			precedent = lu[0].at(-1);
			continue;
		}
		if (!/\s/.test(caractere)) precedent = caractere;
		index += 1;
	}

	// Les plus longues d'abord : une plage intérieure, plus courte, recouvre ensuite la sienne.
	const langueDe = new Array(source.length).fill('');
	plages.sort((a, b) => b.fin - b.debut - (a.fin - a.debut));
	for (const { langue, debut, fin } of plages) langueDe.fill(langue, debut, fin);

	const textes = new Map();
	for (const langue of langues) {
		let texte = '';
		for (let position = 0; position < source.length; position += 1) {
			const caractere = source[position];
			texte += langueDe[position] === langue || caractere === '\n' ? caractere : ' ';
		}
		textes.set(langue, texte);
	}
	return textes;
}

/** Ne garde que les lignes d'un intervalle, en blanchissant les autres. */
function tranche(texte, de, a) {
	return texte
		.split('\n')
		.map((ligne, index) => (index + 1 >= de && index + 1 <= a ? ligne : ''))
		.join('\n');
}

/**
 * Le dernier passage, commun à toutes les surfaces.
 *
 * Blanchir laisse de longues plages d'espaces là où il y avait du code ou une adresse. Le
 * correcteur y voit une ponctuation mal espacée et une phrase qui ne finit pas : mesuré, c'était
 * la moitié des signalements. Les plages sont donc réduites à une espace, **ligne par ligne**,
 * pour que le numéro de ligne reste juste.
 *
 * Les balises HTML écrites à l'intérieur d'une chaîne — la page de garde du PDF en est faite — ne
 * sont pas vues par l'extracteur de chaînes, qui ne connaît que les guillemets.
 */
function degraisser(texte) {
	return texte
		.split('\n')
		.map((ligne) =>
			ligne
				.replace(/<[^>]*>/g, ' ')
				.replace(/&[a-z]+;|&#\d+;/gi, ' ')
				// Un accent grave orphelin, laissé par un bout de code coupé par un retour à la ligne.
				.replace(/`/g, ' ')
				// Une élision devant le substitut donnerait « d' ceci », que le correcteur refuse à juste
				// titre. Le texte d'origine élidait devant un mot que le substitut a remplacé : on
				// développe l'élision, et la phrase redevient du français.
				.replace(
					new RegExp(`\\b([dlnmstjc]|qu)['’]\\s*${SUBSTITUT}\\b`, 'gi'),
					(tout, avant) => `${avant}e ${SUBSTITUT}`
				)
				// Deux substituts qui se suivent sont un seul trou : le correcteur y verrait une
				// répétition de mot, ce qu'un lecteur ne verra jamais.
				.replace(new RegExp(`(\\b${SUBSTITUT}\\b[\\s,]*){2,}`, 'g'), `${SUBSTITUT} `)
				.replace(/\s{2,}/g, ' ')
				.trimEnd()
		)
		.join('\n');
}

/**
 * Les fichiers suivis par git qui correspondent à un motif.
 *
 * Un motif qui porte `**` s'écrit avec la magie `:(glob)`. Sans elle, git compare le motif au
 * chemin entier comme `fnmatch` sans `FNM_PATHNAME` : `**` n'y a aucun sens particulier, et
 * `docs/**\/*.md` exige une barre oblique de plus que `docs/CONDITIONS.md` n'en porte.
 */
function fichiersDe(motif) {
	return execFileSync('git', ['ls-files', '--', motif], { cwd: racine, encoding: 'utf8' })
		.split('\n')
		.filter(Boolean);
}

/**
 * Le corpus : un morceau par fichier et par langue.
 *
 * Le `README` porte un résumé en anglais, qui n'est relu par personne ici : un correcteur français
 * le prendrait pour cent fautes. Il est écarté par ses lignes, et c'est dit.
 */
function corpus() {
	const morceaux = [];
	/**
	 * Recolle les paragraphes. Les fichiers du dépôt sont coupés à cent colonnes, et le correcteur
	 * prend chaque retour à la ligne pour une fin de phrase : il réclamait un point à la fin de
	 * chaque ligne, une majuscule au début de la suivante, et il coupait « aller-\nretour » en deux
	 * mots. Un paragraphe recollé est signalé à la ligne où il commence.
	 */
	const ajouter = (chemin, langue, texte) => {
		const lignes = degraisser(texte).split('\n');
		const paragraphes = [];
		let encours = null;
		for (let index = 0; index < lignes.length; index += 1) {
			const ligne = lignes[index].trim();
			if (ligne.length === 0) {
				if (encours) paragraphes.push(encours);
				encours = null;
				continue;
			}
			// Un mot composé coupé en fin de ligne — « lui-\nmême » — se recolle sans espace, sinon
			// le correcteur voit deux mots et propose de les réunir.
			if (encours) encours.texte += encours.texte.endsWith('-') ? ligne : ` ${ligne}`;
			else encours = { ligne: index + 1, texte: ligne };
		}
		if (encours) paragraphes.push(encours);
		if (paragraphes.length > 0) morceaux.push({ chemin, langue, paragraphes });
	};

	// `docs/maquettes/` décrit les écrans pour celui qui les construit : structure, ordre des
	// éléments, comportements. Aucun visiteur ni responsable ne la lit, et ses cellules de tableau et
	// ses libellés cités hors de toute phrase demandaient chacun une exception. Elle sort du corpus.
	// `docs/maquettes.md`, à côté du dossier, reste : c'est un document, qui dit d'où viennent les
	// maquettes et ce qu'elles valent.
	const documents = fichiersDe(':(glob)docs/**/*.md').filter(
		(chemin) => !chemin.startsWith('docs/maquettes/')
	);
	for (const chemin of [...documents, 'CONTRIBUTING.md', 'SECURITY.md']) {
		try {
			ajouter(chemin, 'fr', prose(readFileSync(join(racine, chemin), 'utf8')));
		} catch {
			/* un fichier annoncé par git et absent du disque : rien à relire */
		}
	}

	const readme = readFileSync(join(racine, 'README.md'), 'utf8');
	const anglais = readme.split(/\r?\n/).findIndex((ligne) => /^##\s+English/.test(ligne));
	ajouter('README.md', 'fr', tranche(prose(readme), 1, anglais > 0 ? anglais : 10_000));

	for (const chemin of fichiersDe(':(glob)apps/web/src/**/*.svelte')) {
		ajouter(chemin, 'fr', gabarit(readFileSync(join(racine, chemin), 'utf8')));
	}

	for (const chemin of [
		'apps/web/src/lib/messages.ts',
		'apps/web/src/lib/server/mail/messages.ts'
	]) {
		ajouter(chemin, 'fr', chaines(readFileSync(join(racine, chemin), 'utf8')));
	}

	// Trois modules rangent leurs phrases par langue, sous des clés `fr:`, `de:`, `it:` et `ar:` :
	// la mise en mots des pages publiques, le libellé d'ancrage du flux agenda, et le widget. Chaque
	// chaîne y est relue dans la langue de sa clé, et rien d'autre du fichier n'est relu.
	for (const chemin of [
		'apps/web/src/lib/public/affichage.ts',
		'apps/web/src/lib/server/agenda.ts',
		'packages/widget/src/element.ts'
	]) {
		for (const [langue, texte] of parLangue(readFileSync(join(racine, chemin), 'utf8'))) {
			ajouter(chemin, langue, chaines(texte, { identifiants: false }));
		}
	}

	// La page de garde du PDF : ses dix points, lus depuis le module qui les porte. Extraire les
	// chaînes de ce fichier rendrait aussi sa feuille de style, qui n'est pas du français.
	ajouter(
		'scripts/conditions-pdf.mjs',
		'fr',
		QUESTIONS.map((point) => `${point.titre}\n${point.corps}`).join('\n\n')
	);

	// `i18n.ts` porte les quatre langues, chacune dans son propre objet. Les relire toutes en
	// français rendrait trois cents fautes qui n'en sont pas.
	const chemin = 'apps/web/src/lib/i18n.ts';
	const source = readFileSync(join(racine, chemin), 'utf8');
	const lignes = source.split(/\r?\n/);
	const debuts = [];
	for (const [langue] of LANGUES) {
		const index = lignes.findIndex((ligne) =>
			ligne.startsWith(`const ${langue}: Dictionnaire = {`)
		);
		if (index >= 0) debuts.push([langue, index + 1]);
	}
	debuts.sort((a, b) => a[1] - b[1]);
	// Sans le filtre des identifiants, comme pour les valeurs rangées sous une clé de langue : entre
	// `const fr: Dictionnaire` et `const DICTIONNAIRES`, chaque chaîne est du texte, et le filtre y
	// effaçait les jours, les mois, « heute », « oggi » et « lezioni ». Le code du fichier, qui porte
	// de vrais identifiants (`'rtl'`, `'fr'`), est hors des tranches : `tranche` le blanchit.
	const extrait = chaines(source, { identifiants: false });
	for (let index = 0; index < debuts.length; index += 1) {
		const [langue, de] = debuts[index];
		// Le dernier dictionnaire s'arrête où les dictionnaires s'arrêtent, et non à la fin du
		// fichier : ce qui suit est du code partagé, et le relire en arabe n'a aucun sens.
		const finDesDictionnaires = lignes.findIndex((ligne) =>
			ligne.startsWith('const DICTIONNAIRES')
		);
		const a =
			index + 1 < debuts.length
				? debuts[index + 1][1] - 1
				: finDesDictionnaires > 0
					? finDesDictionnaires
					: lignes.length;
		ajouter(chemin, langue, tranche(extrait, de, a));
	}
	return morceaux;
}

/**
 * Les documents que le corpus doit contenir, pris ailleurs que dans les motifs qui le construisent.
 *
 * Un motif mal écrit ne lève aucune erreur : il rend moins de fichiers, et le correcteur conclut
 * « rien à signaler » sur ce qu'il n'a pas lu. C'est arrivé : sans la magie `:(glob)`, git lit
 * `docs/**\/*.md` comme s'il exigeait un sous-dossier, et les huit documents de la racine de
 * `docs/`, les conditions comprises, n'ont été relus par personne de l'étape 14 à l'étape 16.
 *
 * La référence est donc la liste entière des fichiers suivis, filtrée par une expression régulière
 * qui ne doit rien à la syntaxe des motifs de git. `docs/CONDITIONS.md` est exigé en plus, même
 * absent du disque : si le texte des conditions changeait de nom, le correcteur le dirait au lieu
 * de relire tout le reste et de conclure qu'il n'y a rien à signaler.
 */
function documentsOublies(morceaux) {
	const lus = new Set(morceaux.map((morceau) => morceau.chemin));
	const suivis = execFileSync('git', ['ls-files'], { cwd: racine, encoding: 'utf8' }).split('\n');
	const attendus = suivis.filter(
		(chemin) =>
			(/^docs\/(?!maquettes\/).+\.md$/.test(chemin) ||
				['README.md', 'CONTRIBUTING.md', 'SECURITY.md'].includes(chemin)) &&
			existsSync(join(racine, chemin))
	);
	return [...new Set(['docs/CONDITIONS.md', ...attendus])].filter((chemin) => !lus.has(chemin));
}

// ------------------------------------------------------------------------------------------------

const dossier = join(racine, '.orthographe');
rmSync(dossier, { recursive: true, force: true });
mkdirSync(dossier, { recursive: true });
process.on('exit', () => rmSync(dossier, { recursive: true, force: true }));

const mots = dictionnaire();
const relues = acceptees();
const morceaux = corpus();
const oublies = documentsOublies(morceaux);
if (oublies.length > 0) {
	process.stderr.write(
		`\nOrthographe : ${oublies.length} document(s) absents du corpus, rien n'est relu.\n\n` +
			oublies.map((chemin) => `      ${chemin}\n`).join('') +
			`\n  Un correcteur qui ne lit pas un document ne prouve rien sur lui : corriger la\n` +
			`  sélection des fichiers dans corpus(), ou dire dans documentsOublies() pourquoi il sort.\n`
	);
	process.exit(1);
}
const trouvailles = [];
let relus = 0;
let ignorees = 0;

process.stdout.write(`\nLanguageTool 6.8, hors réseau, sur ${morceaux.length} morceaux de texte\n`);

for (const [langue, code, nom] of LANGUES) {
	const aRelire = morceaux.filter((morceau) => morceau.langue === langue);
	if (aRelire.length === 0) continue;

	// Un seul fichier par langue, et une seule machine virtuelle Java : cent fichiers relus un par
	// un coûteraient cent démarrages de JVM, soit plusieurs minutes pour rien.
	// Une ligne du fichier assemblé par paragraphe, et une ligne vide entre deux morceaux : le
	// numéro de ligne du signalement désigne alors directement le paragraphe, et la carte le
	// ramène à son fichier et à sa ligne d'origine.
	const carte = [];
	let assemble = '';
	for (const morceau of aRelire) {
		for (const paragraphe of morceau.paragraphes) {
			carte.push({ chemin: morceau.chemin, ligne: paragraphe.ligne });
			assemble += `${paragraphe.texte}\n`;
			carte.push({ chemin: morceau.chemin, ligne: paragraphe.ligne });
			assemble += '\n';
		}
		relus += 1;
	}
	const fichier = `${langue}.txt`;
	writeFileSync(join(dossier, fichier), assemble, 'utf8');

	const passage = spawnSync(
		'docker',
		[
			'run',
			'--rm',
			// Hors réseau : rien de ce qui est relu ne quitte le poste.
			'--network',
			'none',
			'--volume',
			`${dossier}:/corpus:ro`,
			'--entrypoint',
			'java',
			IMAGE,
			'-jar',
			'/LanguageTool/languagetool-commandline.jar',
			'--json',
			'--encoding',
			'utf-8',
			'-l',
			code,
			`/corpus/${fichier}`
		],
		{
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
			env: { ...process.env, MSYS_NO_PATHCONV: '1' }
		}
	);
	if (passage.status !== 0 && !passage.stdout) {
		process.stderr.write(`LanguageTool a échoué sur ${nom} :\n${passage.stderr ?? ''}\n`);
		process.exitCode = 1;
		continue;
	}
	const json = /\{[\s\S]*\}\s*$/.exec(passage.stdout ?? '');
	if (!json) {
		process.stderr.write(
			`Réponse illisible pour ${nom}.\n${(passage.stdout ?? '').slice(0, 400)}\n`
		);
		process.exitCode = 1;
		continue;
	}
	const { matches = [] } = JSON.parse(json[0]);

	/** La ligne du fichier assemblé où tombe un décalage, pour retrouver la source. */
	const lignesAssemblees = assemble.split('\n');
	const debutsDeLigne = [];
	let position = 0;
	for (const ligne of lignesAssemblees) {
		debutsDeLigne.push(position);
		position += ligne.length + 1;
	}
	const ligneDe = (decalage) => {
		let bas = 0;
		let haut = debutsDeLigne.length - 1;
		while (bas < haut) {
			const milieu = Math.ceil((bas + haut) / 2);
			if (debutsDeLigne[milieu] <= decalage) bas = milieu;
			else haut = milieu - 1;
		}
		return bas;
	};

	let gardees = 0;
	for (const match of matches) {
		const regle = match.rule?.id ?? '';
		if (MOTIF_IGNOREES.has(regle)) {
			ignorees += 1;
			continue;
		}
		const index = ligneDe(match.offset);
		const fautif = (lignesAssemblees[index] ?? '').slice(
			match.offset - debutsDeLigne[index],
			match.offset - debutsDeLigne[index] + match.length
		);
		if (mots.has(fautif) || mots.has(fautif.toLocaleLowerCase('fr'))) {
			ignorees += 1;
			continue;
		}
		// Le substitut n'est pas un mot du texte : deux d'affilée, séparés par un retour à la ligne,
		// passent pour une répétition qu'aucun lecteur ne verra. Un trou ne se signale pas.
		if (new RegExp(`^[\\s,.;:]*(${SUBSTITUT}[\\s,.;:]*)+$`, 'i').test(fautif)) {
			ignorees += 1;
			continue;
		}
		const ou = carte[index] ?? { chemin: '?', ligne: 0 };
		if (relues.has(`${ou.chemin.replace(/\\/g, '/')}|${regle}|${fautif.trim()}`)) {
			ignorees += 1;
			continue;
		}
		trouvailles.push({
			langue: nom,
			chemin: ou.chemin,
			ligne: ou.ligne,
			regle,
			fautif,
			message: match.shortMessage || match.message,
			propositions: (match.replacements ?? []).slice(0, 3).map((r) => r.value)
		});
		gardees += 1;
	}
	process.stdout.write(
		`  ${nom.padEnd(38)} ${String(aRelire.length).padStart(3)} morceau(x), ` +
			`${String(matches.length).padStart(4)} signalement(s), ${gardees} à corriger\n`
	);
}

if (trouvailles.length === 0) {
	process.stdout.write(
		`\nOrthographe : ${relus} morceau(x) relus dans ${LANGUES.length} langues, rien à signaler.\n` +
			`  ${ignorees} signalement(s) écartés par le dictionnaire du projet ou par une règle ignorée.\n`
	);
} else {
	process.stdout.write(`\n  ${trouvailles.length} chose(s) à corriger :\n\n`);
	let dernier = '';
	for (const trouvaille of trouvailles) {
		if (trouvaille.chemin !== dernier) {
			process.stdout.write(`      ${relative('.', trouvaille.chemin)} (${trouvaille.langue})\n`);
			dernier = trouvaille.chemin;
		}
		const propositions = trouvaille.propositions.length
			? ` → ${trouvaille.propositions.join(', ')}`
			: '';
		process.stdout.write(
			`        ligne ${String(trouvaille.ligne).padStart(4)} : ` +
				`« ${trouvaille.fautif} »${propositions}\n` +
				`                     ${trouvaille.message} [${trouvaille.regle}]\n`
		);
	}
	process.stdout.write(
		`\n  Un mot juste que le correcteur ne connaît pas se pose dans\n` +
			`  scripts/dictionnaire-orthographe.txt, avec les autres, et il est relu.\n`
	);
	process.exitCode = 1;
}

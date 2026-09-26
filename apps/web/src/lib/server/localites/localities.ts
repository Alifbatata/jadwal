// La liste officielle des localités suisses, embarquée dans le serveur, et sa recherche.
//
// La liste est le répertoire officiel des localités de swisstopo, réduit par
// `scripts/localites-suisses.mjs` à une ligne par localité et NPA, avec une position en degrés
// (`README.md`, à côté, dit d'où elle vient et sous quelles conditions). Vite l'incorpore au serveur
// construit (`?raw`), comme les conditions d'utilisation : aucune lecture de disque à l'exécution,
// aucun service extérieur, et rien de tout cela n'atteint le navigateur, puisque le fichier vit sous
// `$lib/server`.
//
// La recherche répond à ce qu'une personne tape : un nom, avec ou sans accents, avec ses trémas ou
// écrit sans eux (« Zuerich »), dans sa langue ; un NPA, entier ou commencé ; les deux à la suite ;
// un nom suivi de son canton (« Biel BE »), et la forme sous laquelle une localité s'affiche
// (« 2502 Biel/Bienne (BE) »). Elle rend les résultats les plus probables d'abord, et peu : c'est
// une liste où l'on choisit, pas un annuaire.

import brut from './localities.csv?raw';

export interface Locality {
	/** Le NPA à quatre chiffres. */
	postcode: string;
	/** Le nom officiel de la localité, tel que swisstopo l'écrit (« Biel/Bienne », « St-Imier »). */
	name: string;
	/** La commune qui a le plus d'adresses dans cette localité et ce NPA. */
	municipality: string;
	/** L'abréviation du canton, ou `FL` pour le Liechtenstein. */
	canton: string;
	/** En degrés décimaux WGS84, à 4 décimales. */
	latitude: number;
	longitude: number;
}

/**
 * Ce que l'écran des prières et sa recherche montrent d'une localité : de quoi la nommer, « 2502
 * Biel/Bienne (BE) », et la placer. La commune n'y est pas : personne ne la cherche par là.
 */
export interface LocalityChoice {
	postcode: string;
	name: string;
	canton: string;
	latitude: number;
	longitude: number;
}

export function toChoice(locality: Locality): LocalityChoice {
	const { postcode, name, canton, latitude, longitude } = locality;
	return { postcode, name, canton, latitude, longitude };
}

/** Ce qu'il faut savoir de la liste pour la citer : les conditions de swisstopo l'exigent. */
export interface LocalitiesSource {
	title: string;
	/** La date de la version, en ISO (`2026-09-01`). */
	version: string;
	count: number;
	/**
	 * La mention de la source, sous l'une des formes que swisstopo accepte. Aucune n'est en arabe :
	 * `©swisstopo`, qui figure aussi dans la liste, sert pour cette langue.
	 */
	credit: { fr: string; de: string; it: string; en: string; ar: string };
	termsUrl: string;
}

/** Les chefs-lieux, sous leur nom dans les autres langues nationales et en anglais. */
const OTHER_NAMES: Record<string, string[]> = {
	'Zürich|ZH': ['Zurigo'],
	'Bern|BE': ['Berne', 'Berna'],
	'Luzern|LU': ['Lucerne', 'Lucerna'],
	'Schwyz|SZ': ['Schwytz', 'Svitto'],
	'Glarus|GL': ['Glaris', 'Glarona'],
	'Zug|ZG': ['Zoug', 'Zugo'],
	'Fribourg|FR': ['Freiburg', 'Friburgo'],
	'Solothurn|SO': ['Soleure', 'Soletta'],
	'Basel|BS': ['Bâle', 'Basilea'],
	'Schaffhausen|SH': ['Schaffhouse', 'Sciaffusa'],
	'St. Gallen|SG': ['Saint-Gall', 'San Gallo'],
	'Chur|GR': ['Coire', 'Coira'],
	'Bellinzona|TI': ['Bellinzone', 'Bellenz'],
	'Lausanne|VD': ['Losanna'],
	'Sion|VS': ['Sitten'],
	'Neuchâtel|NE': ['Neuenburg'],
	'Genève|GE': ['Genf', 'Ginevra', 'Geneva'],
	'Delémont|JU': ['Delsberg']
};

/**
 * Les mots que les noms officiels abrègent : « Saint-Imier » s'y écrit « St-Imier ». Une `Map` et
 * non un objet : un mot tapé comme « constructor » ne doit rien trouver dans un prototype.
 */
const ABBREVIATIONS = new Map([
	['saint', 'st'],
	['sankt', 'st'],
	['sainte', 'ste']
]);

/** Les abréviations des cantons, et `FL` pour le Liechtenstein, comme la colonne `canton` les écrit. */
const CANTONS = new Set(
	'AG AI AR BE BL BS FR GE GL GR JU LU NE NW OW SG SH SO SZ TG TI UR VD VS ZG ZH FL'.split(' ')
);

/** Un canton qui termine un nom officiel pour le distinguer (« Carouge GE », « Laax GR 2 »). */
const CANTON_SUFFIX = new RegExp(`\\s+(?:${[...CANTONS].join('|')})(?:\\s+\\d+)?$`);

/**
 * Ce qu'une recherche rend sans autre borne. Une liste qui en compte autant en a peut-être laissé :
 * l'écran dit alors qu'il montre les localités qui correspondent le mieux, et non combien il en a
 * trouvé.
 */
export const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MIN_LENGTH = 2;

/**
 * Un texte réduit à ce qui compte pour comparer : sans accents, en minuscules, la ponctuation
 * remplacée par des espaces, les abréviations officielles appliquées. « Saint-Imier » et
 * « St-Imier » donnent tous deux `st imier`, « Zürich » donne `zurich`.
 */
function normalise(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.split(' ')
		.map((word) => ABBREVIATIONS.get(word) ?? word)
		.join(' ');
}

/** Les trémas allemands tels qu'on les écrit sans eux : « Zürich » devient « Zuerich ». */
const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue' };

/**
 * Un nom sous chacune de ses graphies, normalisées : telle quelle (« zurich »), et, s'il porte des
 * trémas, telle qu'un clavier sans trémas l'écrit (« zuerich »). La seconde s'ajoute à la première
 * du côté de la liste, jamais du côté de ce qui est tapé : « Frauenfeld » ou « Aeugst » s'écrivent
 * vraiment avec « ue » et « ae », et ne doivent rien perdre.
 */
function spellingsOf(text: string): string[] {
	const plain = normalise(text);
	const withoutUmlauts = normalise(
		text.replace(/[äöüÄÖÜ]/g, (letter) => UMLAUTS[letter] ?? letter)
	);
	return withoutUmlauts === plain ? [plain] : [plain, withoutUmlauts];
}

/**
 * Les chiffres arabes orientaux (U+0660 à U+0669) et persans (U+06F0 à U+06F9) en chiffres
 * latins : un clavier arabe de téléphone tape les premiers, et les NPA de la liste sont en chiffres
 * latins, comme toute l'application (ADR 0007).
 */
function latinDigits(text: string): string {
	let result = '';
	for (const character of text) {
		const code = character.charCodeAt(0);
		if (code >= 0x0660 && code <= 0x0669) result += String(code - 0x0660);
		else if (code >= 0x06f0 && code <= 0x06f9) result += String(code - 0x06f0);
		else result += character;
	}
	return result;
}

interface Entry {
	locality: Locality;
	/** Le nom entier, normalisé. */
	name: string;
	/** Le nom entier sous chacune de ses graphies : tel quel, et sans trémas (voir `spellingsOf`). */
	spellings: string[];
	/**
	 * Les noms sous lesquels la localité se cherche : chaque langue du nom officiel, sans suffixe,
	 * et ses noms dans les autres langues, chacun sous ses graphies.
	 */
	names: string[];
	/** La commune, sous ses graphies. */
	municipalities: string[];
	/** Combien de NPA portent ce nom : une grande ville en a beaucoup. */
	weight: number;
	/** Combien de localités la commune compte : départage à poids égal. */
	municipalityWeight: number;
}

/**
 * Les noms d'une localité, un par langue (« Biel/Bienne »), sans le canton qui la distingue
 * (« Carouge GE ») ni la précision entre parenthèses (« St-Saphorin (Lavaux) »).
 */
function namesOf(locality: Locality): string[] {
	const names = locality.name
		.split('/')
		.flatMap((part) => spellingsOf(part.replace(/\s*\(.*\)\s*$/, '').replace(CANTON_SUFFIX, '')));
	for (const other of OTHER_NAMES[`${locality.name}|${locality.canton}`] ?? []) {
		names.push(...spellingsOf(other));
	}
	return names.filter((name) => name.length > 0);
}

function parse(text: string): { title: string; version: string; entries: Entry[] } {
	const lines = text.split(/\r?\n/);
	const header = /^# (.+), version du (\d{2})\.(\d{2})\.(\d{4})\.$/.exec(lines[0] ?? '');
	if (!header) throw new Error('localities.csv : la première ligne ne dit pas la version');
	const [, title, day, month, year] = header;

	const localities: Locality[] = [];
	let columns = false;
	for (const line of lines) {
		if (line === '' || line.startsWith('#')) continue;
		if (!columns) {
			if (line !== 'postcode;name;municipality;canton;latitude;longitude') {
				throw new Error(`localities.csv : colonnes inattendues (« ${line} »)`);
			}
			columns = true;
			continue;
		}
		const [postcode, name, municipality, canton, latitude, longitude, ...rest] = line.split(';');
		const lat = Number(latitude);
		const lon = Number(longitude);
		if (
			rest.length > 0 ||
			!/^\d{4}$/.test(postcode ?? '') ||
			!name ||
			!municipality ||
			!canton ||
			!Number.isFinite(lat) ||
			!Number.isFinite(lon)
		) {
			throw new Error(`localities.csv : ligne illisible (« ${line} »)`);
		}
		localities.push(
			Object.freeze({
				postcode: postcode as string,
				name,
				municipality,
				canton,
				latitude: lat,
				longitude: lon
			})
		);
	}

	const byName = new Map<string, number>();
	const byMunicipality = new Map<string, number>();
	for (const locality of localities) {
		const nameKey = `${locality.name}|${locality.canton}`;
		const municipalityKey = `${locality.municipality}|${locality.canton}`;
		byName.set(nameKey, (byName.get(nameKey) ?? 0) + 1);
		byMunicipality.set(municipalityKey, (byMunicipality.get(municipalityKey) ?? 0) + 1);
	}

	const entries = localities.map((locality) => ({
		locality,
		name: normalise(locality.name),
		spellings: spellingsOf(locality.name),
		names: namesOf(locality),
		municipalities: spellingsOf(locality.municipality),
		weight: byName.get(`${locality.name}|${locality.canton}`) ?? 1,
		municipalityWeight: byMunicipality.get(`${locality.municipality}|${locality.canton}`) ?? 1
	}));
	return { title: title as string, version: `${year}-${month}-${day}`, entries };
}

const { title, version, entries } = parse(brut);

export const LOCALITIES_SOURCE: LocalitiesSource = Object.freeze({
	title,
	version,
	count: entries.length,
	credit: Object.freeze({
		fr: 'Office fédéral de topographie swisstopo',
		de: 'Bundesamt für Landestopografie swisstopo',
		it: 'Ufficio federale di topografia swisstopo',
		en: 'Federal Office of Topography swisstopo',
		ar: '©swisstopo'
	}),
	termsUrl:
		'https://www.swisstopo.admin.ch/fr/conditions-utilisation-geodonnees-et-geoservices-gratuit'
});

/**
 * Le rang d'une localité pour un texte cherché, du plus sûr au moins sûr, ou `null` si elle ne
 * correspond pas :
 *
 * 0. son nom officiel entier est ce texte (« biel bienne », « laax gr 2 ») : c'est la localité
 *    qu'une personne a choisie, remise telle quelle dans le champ ;
 * 1. l'un de ses noms est ce texte ;
 * 2. l'un de ses noms commence par ce texte ;
 * 3. un mot de son nom commence par ce texte (« lancy » pour « Petit-Lancy ») ;
 * 4. son nom contient ce texte ;
 * 5. chaque mot du texte commence un mot de son nom, dans n'importe quel ordre (« bienne biel ») ;
 * 6. un mot de sa commune commence par ce texte (« val de ruz » pour Cernier).
 *
 * Chaque nom compte sous ses graphies : « zuerich » trouve Zürich au même rang que « zurich ».
 */
function rank(entry: Entry, text: string): number | null {
	const { spellings } = entry;
	if (spellings.includes(text)) return 0;
	if (entry.names.includes(text)) return 1;
	if (entry.names.some((name) => name.startsWith(text))) return 2;
	if (spellings.some((spelling) => ` ${spelling}`.includes(` ${text}`))) return 3;
	if (spellings.some((spelling) => spelling.includes(text))) return 4;
	const words = text.split(' ');
	if (
		words.length > 1 &&
		spellings.some((spelling) => words.every((word) => ` ${spelling}`.includes(` ${word}`)))
	) {
		return 5;
	}
	if (entry.municipalities.some((municipality) => ` ${municipality}`.includes(` ${text}`))) {
		return 6;
	}
	return null;
}

/**
 * À rang égal, la localité la plus probable d'abord : celle dont le nom porte le plus de NPA (une
 * ville), puis celle dont la commune compte le plus de localités, puis le nom le plus court, puis
 * l'ordre alphabétique, puis le NPA. Le dernier critère rend l'ordre total : deux recherches
 * identiques rendent toujours la même liste.
 */
function compare(a: Entry, b: Entry): number {
	return (
		b.weight - a.weight ||
		b.municipalityWeight - a.municipalityWeight ||
		a.locality.name.length - b.locality.name.length ||
		(a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
		(a.locality.postcode < b.locality.postcode ? -1 : 1)
	);
}

/** Les NPA de la liste : un NPA entier absent est celui d'une case postale ou d'un grand destinataire. */
const POSTCODES = new Set(entries.map((entry) => entry.locality.postcode));

/** Un NPA, éventuellement précédé de « CH- » : entier en `whole`, commencé en `start`. */
const POSTCODE_WORD = { whole: /^(?:ch-?)?(\d{4})$/i, start: /^(?:ch-?)?(\d{1,4})$/i };

/** Deux lettres, entre parenthèses ou non, et peut-être une parenthèse encore ouverte. */
const CANTON_WORD = /^(\()?([a-z]{2})(\))?$/i;

/** Ce que dit une recherche, une fois lue. */
interface Query {
	/** Le NPA, entier ou commencé, ou rien. */
	digits: string;
	/** Vrai quand le NPA est entier et que la liste ne le connaît pas. */
	unknown: boolean;
	/** Le nom, normalisé. */
	text: string;
	/** Le canton qui suit le nom, ou `null`. */
	canton: string | null;
	/** Les lettres du canton telles qu'elles ont été tapées. */
	cantonWord: string;
	/** Vrai quand le canton est entre deux parenthèses : il ne peut alors être que le canton. */
	strict: boolean;
}

/**
 * Lit une recherche : le NPA, le nom normalisé, et le canton qui le suit s'il y en a un.
 *
 * Le NPA vient en tête (« 2502 Biel/Bienne », l'ordre d'une adresse suisse), entier ou commencé, ou
 * en fin, et alors entier : un nombre plus court en fin fait partie du nom (« Lausanne 25 »). Le
 * canton vient en fin, après au moins un mot : seul, « BE » reste un nom commencé. Entre deux
 * parenthèses, « (BE) », il ne peut être que le canton ; après une parenthèse encore ouverte,
 * « Charmey (Gr », il peut aussi être le début du mot qui précise un nom, « Charmey (Gruyère) ».
 */
function readQuery(query: string): Query {
	// Une virgule sépare comme une espace ; une parenthèse collée au nom s'en détache.
	const words = latinDigits(query)
		.replace(/[,;]/g, ' ')
		.replace(/\(/g, ' (')
		.trim()
		.split(/\s+/)
		.filter((word) => word !== '');
	let digits = '';
	let canton: string | null = null;
	let cantonWord = '';
	let strict = false;
	const head = POSTCODE_WORD.start.exec(words[0] ?? '');
	if (head) {
		digits = head[1] as string;
		words.shift();
	}
	while (words.length > 1) {
		const last = words.at(-1) as string;
		const postcode = digits === '' ? POSTCODE_WORD.whole.exec(last) : null;
		const word = CANTON_WORD.exec(last);
		const code = word?.[2]?.toUpperCase();
		if (postcode) digits = postcode[1] as string;
		else if (canton === null && code && CANTONS.has(code)) {
			canton = code;
			cantonWord = last;
			strict = word?.[1] !== undefined && word[3] !== undefined;
		} else break;
		words.pop();
	}
	return {
		digits,
		unknown: digits.length === 4 && !POSTCODES.has(digits),
		text: normalise(words.join(' ')),
		canton,
		cantonWord,
		strict
	};
}

/**
 * Les localités autour d'un NPA que la liste ne connaît pas : celui d'une case postale ou d'un grand
 * destinataire, comme « 1211 » à Genève ou « 3030 » à Berne.
 *
 * Ce NPA n'appartient à aucune localité, et ses trois premiers chiffres ne mènent pas toujours à la
 * bonne : « 121 » ne donne que des communes voisines de Genève, Grand-Lancy d'abord. La recherche
 * regarde donc les localités du même arrondissement postal (les deux premiers chiffres), une fois
 * chacune sous son plus petit NPA, et met d'abord celle qui a le plus de NPA pour la distance qui la
 * sépare du NPA tapé : une ville proche vient avant un village aussi proche, et avant une ville
 * lointaine. Avec un nom, le rang du nom passe avant tout le reste.
 */
function nearby(digits: string, text: string, canton: string | null, bound: number): Locality[] {
	if (text !== '' && text.length < MIN_LENGTH) return [];
	const typed = Number(digits);
	const district = digits.slice(0, 2);
	const groups = new Map<string, { entry: Entry; rank: number; count: number; distance: number }>();
	for (const entry of entries) {
		const { postcode, name, canton: itsCanton } = entry.locality;
		if (!postcode.startsWith(district)) continue;
		if (canton !== null && itsCanton !== canton) continue;
		const value = text === '' ? 0 : rank(entry, text);
		if (value === null) continue;
		const distance = Math.abs(Number(postcode) - typed);
		const key = `${name}|${itsCanton}`;
		const known = groups.get(key);
		if (!known) {
			groups.set(key, { entry, rank: value, count: 1, distance });
			continue;
		}
		known.count += 1;
		known.distance = Math.min(known.distance, distance);
		if (value < known.rank || (value === known.rank && postcode < known.entry.locality.postcode)) {
			known.entry = entry;
			known.rank = value;
		}
	}
	return [...groups.values()]
		.sort(
			(a, b) =>
				a.rank - b.rank || b.count / b.distance - a.count / a.distance || compare(a.entry, b.entry)
		)
		.slice(0, bound)
		.map(({ entry }) => entry.locality);
}

/** Les localités d'un NPA, d'un nom, ou des deux, dans ce canton s'il est donné. */
function find(
	{ digits, unknown }: Pick<Query, 'digits' | 'unknown'>,
	text: string,
	canton: string | null,
	bound: number
): Locality[] {
	if (unknown) return nearby(digits, text, canton, bound);
	const inCanton = (entry: Entry) => canton === null || entry.locality.canton === canton;

	if (digits !== '' && text === '') {
		if (digits.length < MIN_LENGTH) return [];
		// Un NPA entier : ses localités, la principale d'abord. Un NPA commencé : dans l'ordre des NPA,
		// puisque rien d'autre ne dit lequel la personne cherche.
		const exact = digits.length === 4;
		return entries
			.filter((entry) => entry.locality.postcode.startsWith(digits) && inCanton(entry))
			.sort((a, b) =>
				exact || a.locality.postcode === b.locality.postcode
					? compare(a, b)
					: a.locality.postcode < b.locality.postcode
						? -1
						: 1
			)
			.slice(0, bound)
			.map((entry) => entry.locality);
	}

	if (text.length < MIN_LENGTH) return [];

	// Une localité par nom et canton : la ligne du meilleur rang, et à rang égal celle du plus petit
	// NPA. Avec un NPA dans la recherche, chaque ligne est déjà seule de son nom.
	const best = new Map<string, { entry: Entry; rank: number }>();
	for (const entry of entries) {
		const { postcode, name, canton: itsCanton } = entry.locality;
		if (digits !== '' && !postcode.startsWith(digits)) continue;
		if (!inCanton(entry)) continue;
		const value = rank(entry, text);
		if (value === null) continue;
		const key = digits === '' ? `${name}|${itsCanton}` : `${postcode}|${name}`;
		const known = best.get(key);
		if (
			!known ||
			value < known.rank ||
			(value === known.rank && postcode < known.entry.locality.postcode)
		) {
			best.set(key, { entry, rank: value });
		}
	}
	return [...best.values()]
		.sort((a, b) => a.rank - b.rank || compare(a.entry, b.entry))
		.slice(0, bound)
		.map(({ entry }) => entry.locality);
}

/**
 * Les localités qui répondent à `query`, les plus probables d'abord, `limit` au plus (10 par
 * défaut, jamais plus de 50).
 *
 * - Un nom : sans tenir compte des accents ni de la casse, avec « ue », « oe » et « ae » pour
 *   « ü », « ö » et « ä » (« Zuerich » trouve Zürich), dans n'importe quelle langue du nom
 *   officiel (« bienne » trouve Biel/Bienne), et pour les chefs-lieux dans les autres langues
 *   nationales et en anglais (« Genf », « Geneva »). Une localité qui a plusieurs NPA n'est rendue
 *   qu'une fois, sous le plus petit de ceux qui répondent le mieux.
 * - Un NPA : entier, il rend les localités qui le portent ; commencé (deux chiffres au moins), il
 *   rend les NPA qui commencent par ces chiffres, dans l'ordre.
 * - Un NPA et un nom, dans un ordre ou dans l'autre (« 2502 biel », « bienne 2502 ») : les deux
 *   doivent correspondre. Le NPA peut suivre « CH- » (« CH-2502 ») ou précéder une virgule
 *   (« 1201, Genève »). Un NPA entier que la liste ne connaît pas (« 1211 », celui d'une case
 *   postale ou d'un grand destinataire) propose les localités voisines, la plus grande et la plus
 *   proche d'abord (voir `nearby`).
 * - Un nom suivi de l'abréviation du canton, avec ou sans parenthèses (« Biel BE », « Biel/Bienne
 *   (BE) »), comme on lève un homonyme en Suisse. Entre deux parenthèses, les localités de ce
 *   canton seulement. Sans parenthèses, ou après une parenthèse encore ouverte, les localités de ce
 *   canton d'abord, puis celles dont le nom porte ces deux lettres (« biel be » peut être le début
 *   de « Biel-Benken », « Charmey (Gr » celui de « Charmey (Gruyère) ») : ces dernières gardent au
 *   moins la moitié des places quand elles existent, pour que « la ne » propose encore
 *   La Neuveville. La forme « NPA Nom (CANTON) », celle sous laquelle une localité s'affiche,
 *   retrouve donc cette localité en premier.
 *
 * Un NPA tapé en chiffres arabes orientaux ou persans se lit comme en chiffres latins.
 *
 * Moins de deux caractères utiles ne donnent rien : une lettre seule correspond à des centaines de
 * localités, et aucune n'est plus probable qu'une autre.
 */
export function searchLocalities(query: string, limit = DEFAULT_LIMIT): Locality[] {
	// Un nombre qui n'en est pas un (NaN) ne borne rien : sans ce garde-fou, la liste entière partait.
	const bound = Number.isNaN(limit)
		? DEFAULT_LIMIT
		: Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
	const read = readQuery(query);
	const { text, canton, cantonWord } = read;
	if (canton === null) return find(read, text, null, bound);
	const found = find(read, text, canton, bound);
	if (read.strict) return found;
	// Sans ses deux parenthèses, les deux lettres peuvent aussi commencer le dernier mot d'un nom :
	// les localités de ce canton d'abord, puis les autres, sans doublon. Les autres gardent jusqu'à
	// la moitié des places : sans quoi un canton qui compte beaucoup de localités les chassait toutes
	// de la liste, et « la ne » ne proposait plus La Neuveville.
	const literal = find(read, normalise(`${text} ${cantonWord}`), null, bound);
	const others = literal.filter((locality) => !found.includes(locality));
	const kept = Math.min(others.length, Math.floor(bound / 2));
	return [...found.slice(0, bound - kept), ...others].slice(0, bound);
}

/**
 * La localité de ce NPA et de ce nom exacts, ou `null`. C'est ce qu'un formulaire renvoie une fois
 * la localité choisie : le serveur y relit la position, plutôt que de croire celle que le navigateur
 * enverrait.
 */
export function findLocality(postcode: string, name: string): Locality | null {
	return (
		entries.find((entry) => entry.locality.postcode === postcode && entry.locality.name === name)
			?.locality ?? null
	);
}

/**
 * La localité dont la position est exactement celle-ci, ou `null`. Les réglages des prières ne
 * gardent que la position : une position prise dans la liste redonne ainsi la localité choisie, et
 * une position saisie à la main, qui n'a aucune raison de tomber sur un point de la liste à quatre
 * décimales près, n'en redonne aucune.
 */
export function findLocalityAt(latitude: number, longitude: number): Locality | null {
	return (
		entries.find(
			(entry) => entry.locality.latitude === latitude && entry.locality.longitude === longitude
		)?.locality ?? null
	);
}

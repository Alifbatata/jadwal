// La liste officielle des localités suisses, embarquée dans le serveur, et sa recherche.
//
// La liste est le répertoire officiel des localités de swisstopo, réduit par
// `scripts/localites-suisses.mjs` à une ligne par localité et NPA, avec une position en degrés
// (`README.md`, à côté, dit d'où elle vient et sous quelles conditions). Vite l'incorpore au serveur
// construit (`?raw`), comme les conditions d'utilisation : aucune lecture de disque à l'exécution,
// aucun service extérieur, et rien de tout cela n'atteint le navigateur, puisque le fichier vit sous
// `$lib/server`.
//
// La recherche répond à ce qu'une personne tape : un nom, avec ou sans accents, dans sa langue ; un
// NPA, entier ou commencé ; les deux à la suite. Elle rend les résultats les plus probables d'abord,
// et peu : c'est une liste où l'on choisit, pas un annuaire.

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

/** Les cantons, et `FL`, tels qu'ils terminent un nom pour le distinguer (« Carouge GE »). */
const CANTON_SUFFIX =
	/\s+(?:AG|AI|AR|BE|BL|BS|FR|GE|GL|GR|JU|LU|NE|NW|OW|SG|SH|SO|SZ|TG|TI|UR|VD|VS|ZG|ZH|FL)(?:\s+\d+)?$/;

const DEFAULT_LIMIT = 10;
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
	/**
	 * Les noms sous lesquels la localité se cherche : chaque langue du nom officiel, sans suffixe,
	 * et ses noms dans les autres langues.
	 */
	names: string[];
	municipality: string;
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
		.map((part) => normalise(part.replace(/\s*\(.*\)\s*$/, '').replace(CANTON_SUFFIX, '')));
	for (const other of OTHER_NAMES[`${locality.name}|${locality.canton}`] ?? []) {
		names.push(normalise(other));
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
		names: namesOf(locality),
		municipality: normalise(locality.municipality),
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
 * 0. l'un de ses noms est ce texte ;
 * 1. l'un de ses noms commence par ce texte ;
 * 2. un mot de son nom commence par ce texte (« lancy » pour « Petit-Lancy ») ;
 * 3. son nom contient ce texte ;
 * 4. un mot de sa commune commence par ce texte (« val de ruz » pour Cernier).
 */
function rank(entry: Entry, text: string): number | null {
	if (entry.names.includes(text)) return 0;
	if (entry.names.some((name) => name.startsWith(text))) return 1;
	if (` ${entry.name}`.includes(` ${text}`)) return 2;
	if (entry.name.includes(text)) return 3;
	if (` ${entry.municipality}`.includes(` ${text}`)) return 4;
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

/**
 * Les localités qui répondent à `query`, les plus probables d'abord, `limit` au plus (10 par
 * défaut, jamais plus de 50).
 *
 * - Un nom : sans tenir compte des accents ni de la casse, dans n'importe quelle langue du nom
 *   officiel (« bienne » trouve Biel/Bienne), et pour les chefs-lieux dans les autres langues
 *   nationales et en anglais (« Genf », « Geneva »). Une localité qui a plusieurs NPA n'est rendue
 *   qu'une fois, sous le plus petit de ceux qui répondent le mieux.
 * - Un NPA : entier, il rend les localités qui le portent ; commencé (deux chiffres au moins), il
 *   rend les NPA qui commencent par ces chiffres, dans l'ordre.
 * - Un NPA et un nom, dans un ordre ou dans l'autre (« 2502 biel », « bienne 2502 ») : les deux
 *   doivent correspondre.
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
	// Le NPA vient en tête (« 2502 Biel/Bienne », l'ordre d'une adresse suisse), entier ou commencé,
	// ou en fin, et alors entier : un nombre plus court en fin fait partie du nom (« Lausanne 25 »).
	const words = latinDigits(query).trim().split(/\s+/);
	let digits = '';
	if (/^\d{1,4}$/.test(words[0] ?? '')) digits = words.shift() as string;
	else if (words.length > 1 && /^\d{4}$/.test(words.at(-1) ?? '')) digits = words.pop() as string;
	const text = normalise(words.join(' '));

	if (digits !== '' && text === '') {
		if (digits.length < MIN_LENGTH) return [];
		// Un NPA entier : ses localités, la principale d'abord. Un NPA commencé : dans l'ordre des NPA,
		// puisque rien d'autre ne dit lequel la personne cherche.
		const exact = digits.length === 4;
		return entries
			.filter((entry) => entry.locality.postcode.startsWith(digits))
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
		const { postcode, name, canton } = entry.locality;
		if (digits !== '' && !postcode.startsWith(digits)) continue;
		const value = rank(entry, text);
		if (value === null) continue;
		const key = digits === '' ? `${name}|${canton}` : `${postcode}|${name}`;
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

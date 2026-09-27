// Ce que les deux fichiers de tests de la recherche des localités partagent : la liste lue dans le
// fichier, sans passer par le module qu'on éprouve, et les façons d'en écrire les noms.
// `localities.test.ts` tourne dans `pnpm test` ; `localities.temps.test.ts`, qui parcourt la liste
// entière, dans `pnpm test:temps`.

import { readFileSync } from 'node:fs';
import { searchLocalities } from './localities.js';

/** Le premier résultat d'une recherche, sous la forme « NPA Nom (canton) ». */
export function premier(requete: string): string {
	const [trouve] = searchLocalities(requete);
	return trouve ? `${trouve.postcode} ${trouve.name} (${trouve.canton})` : 'rien';
}

/**
 * Chaque ligne de la liste, lue ici dans le fichier, sans passer par le module qu'on éprouve : NPA,
 * nom et canton.
 */
export const LIGNES = readFileSync(new URL('./localities.csv', import.meta.url), 'utf8')
	.split(/\r?\n/)
	.filter((ligne) => /^\d{4};/.test(ligne))
	.map((ligne) => {
		const [postcode, name, , canton] = ligne.split(';');
		return { postcode: postcode as string, name: name as string, canton: canton as string };
	});

/** « Zürich » écrit comme sur un clavier sans trémas, sans passer par le module qu'on éprouve. */
const TREMAS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue' };
export const sansTremas = (nom: string) =>
	nom.replace(/[äöüÄÖÜ]/g, (lettre) => TREMAS[lettre] ?? lettre);

/** Un texte réduit à ses lettres, sans accents ni trémas, sans passer par le module éprouvé. */
export const plat = (texte: string) =>
	texte
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();

/** Vrai quand le nom ou la commune porte ce début tel qu'il s'écrit, trémas effacés des deux côtés. */
export const lEcritAinsi = (localite: { name: string; municipality: string }, debut: string) =>
	` ${plat(localite.name)} ${plat(localite.municipality)}`.includes(plat(debut));

/**
 * Les chefs-lieux se cherchent aussi sous leur nom dans les autres langues (« Neuenburg »), que ces
 * tests ne relisent pas : ils sont laissés de côté.
 */
const CHEFS_LIEUX = new Set([
	'Zürich',
	'Bern',
	'Luzern',
	'Schwyz',
	'Glarus',
	'Zug',
	'Fribourg',
	'Solothurn',
	'Basel',
	'Schaffhausen',
	'St. Gallen',
	'Chur',
	'Bellinzona',
	'Lausanne',
	'Sion',
	'Neuchâtel',
	'Genève',
	'Delémont'
]);
export const horsChefsLieux = (requete: string) =>
	searchLocalities(requete).filter((localite) => !CHEFS_LIEUX.has(localite.name));

/**
 * Les débuts d'un seul mot, de 3 à 6 et de 8 lettres, des noms de la liste qui portent « ue »,
 * « oe » ou « ae », avec ou sans tréma.
 */
export const debutsEnUe = (avecTrema: boolean) =>
	new Set(
		LIGNES.flatMap(({ name }) => [3, 4, 5, 6, 8].map((longueur) => name.slice(0, longueur))).filter(
			(debut) =>
				/[äöüÄÖÜ]/.test(debut) === avecTrema &&
				/ue|oe|ae/.test(plat(debut)) &&
				!plat(debut).includes(' ')
		)
	);

/** Vrai quand ce début est le nom entier, ou l'une de ses langues, écrit sans ses trémas (« Lue »). */
export const nomEntierSansTremas = (localite: { name: string }, debut: string) =>
	[localite.name, ...localite.name.split('/')].some((nom) => plat(sansTremas(nom)) === plat(debut));

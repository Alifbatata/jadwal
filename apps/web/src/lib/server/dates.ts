// Une date qu'un écran des responsables accepte d'un formulaire, avant de l'écrire (étape 19,
// relecture de D2).
//
// `isIsoDate` (`@jadwal/core`) accepte toute date du calendrier grégorien sur quatre chiffres
// d'année (ADR 0012), et cela ne suffit pas. PostgreSQL n'a pas d'an 0 : « 0000-01-01 » faisait
// échouer la requête, et l'écran répondait par une erreur 500. La base range le 31.12.9999, mais le
// flux agenda calcule le lendemain d'une date de fin, en l'an 10000, que le calcul refuse : une
// session publiée qui finissait ce jour-là faisait tomber le flux de toute l'organisation. Le
// service s'en tient donc aux années que couvrent les tests du calcul, de 1970 à 2100 : aucune
// organisation n'a de séance avant 1970, et une date après 2100 ne vient que d'une faute de frappe
// ou d'un formulaire écrit à la main.

import { parseIsoDate, type IsoDate } from '@jadwal/core';

/** La première et la dernière année qu'un formulaire peut envoyer (ADR 0012). */
const PREMIERE_ANNEE = 1970;
const DERNIERE_ANNEE = 2100;

/** Une date `AAAA-MM-JJ` qui existe, de 1970 à 2100. */
export function isSupportedDate(value: unknown): value is IsoDate {
	if (typeof value !== 'string') return false;
	const civil = parseIsoDate(value);
	return civil !== null && civil.year >= PREMIERE_ANNEE && civil.year <= DERNIERE_ANNEE;
}

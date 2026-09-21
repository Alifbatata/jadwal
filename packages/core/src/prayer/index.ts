// Le calcul des cinq heures de prière : point d'entrée @jadwal/core/prayer, seul endroit du paquet
// qui dépend d'`adhan`. Règles : docs/adr/0004.
//
// **Pourquoi une entrée à part.** L'ADR 0012 interdit l'objet `Date` dans les calculs du paquet, et
// l'entrée principale annonce zéro dépendance à l'exécution. `adhan` exige un `Date` en entrée et en
// rend cinq en sortie. Ce fichier est donc l'adaptateur qui confine les deux : il prend une date
// civile, une position et un fuseau IANA, et rend le `PrayerDay` de `LocalTime` que le cœur
// consomme déjà — exactement la forme que produit aussi l'import CSV.
//
// **Ce qu'il ne fait pas.** Aucun appel réseau, aucun service extérieur, jamais Mawaqit (ADR 0009).
// Il ne lit ni l'horloge ni le fuseau de la machine : `currentPrayer()` et `nextPrayer()` d'`adhan`
// le feraient, ils ne sont pas employés.

import {
	CalculationMethod,
	CalculationParameters,
	Coordinates,
	HighLatitudeRule,
	Madhab,
	PrayerTimes
} from 'adhan';
import { parseIsoDate } from '../dates.js';
import type { IsoDate, LocalTime, PrayerDay } from '../types.js';

/**
 * Les treize méthodes d'`adhan`, telles qu'elle les nomme. `Other` est la porte de sortie d'une
 * mosquée qui publie ses propres angles — elle ne sert à rien tant qu'on ne les expose pas.
 */
export const CALCULATION_METHODS = [
	'MuslimWorldLeague',
	'Egyptian',
	'Karachi',
	'UmmAlQura',
	'Dubai',
	'MoonsightingCommittee',
	'NorthAmerica',
	'Kuwait',
	'Qatar',
	'Singapore',
	'Tehran',
	'Turkey',
	'Other'
] as const;
export type CalculationMethodName = (typeof CALCULATION_METHODS)[number];

/** L'école qui décide de la longueur d'ombre de l'Asr : `hanafi` la place plus tard. */
export const MADHABS = ['shafi', 'hanafi'] as const;
export type MadhabName = (typeof MADHABS)[number];

/**
 * La règle des latitudes hautes. Elle ne « corrige » jamais vers des heures plus extrêmes : c'est
 * un plancher pour le Fajr et un plafond pour l'Isha, appliqué seulement s'il rapproche l'heure du
 * lever ou du coucher.
 */
export const HIGH_LATITUDE_RULES = [
	'middleofthenight',
	'seventhofthenight',
	'twilightangle'
] as const;
export type HighLatitudeRuleName = (typeof HIGH_LATITUDE_RULES)[number];

/** Le décalage en minutes appliqué à chaque prière après le calcul, tel que la mosquée le règle. */
export interface PrayerAdjustments {
	fajr: number;
	dhuhr: number;
	asr: number;
	maghrib: number;
	isha: number;
}

export const NO_ADJUSTMENTS: PrayerAdjustments = {
	fajr: 0,
	dhuhr: 0,
	asr: 0,
	maghrib: 0,
	isha: 0
};

export interface PrayerSettings {
	/** Degrés décimaux, positifs vers le nord. */
	latitude: number;
	/** Degrés décimaux, positifs vers l'est. */
	longitude: number;
	/** Nom IANA du fuseau de l'organisation : c'est le seul endroit où le fuseau intervient. */
	timeZone: string;
	method: CalculationMethodName;
	madhab: MadhabName;
	highLatitudeRule: HighLatitudeRuleName;
	adjustments?: PrayerAdjustments;
}

const METHODES: Record<CalculationMethodName, () => CalculationParameters> = {
	MuslimWorldLeague: CalculationMethod.MuslimWorldLeague,
	Egyptian: CalculationMethod.Egyptian,
	Karachi: CalculationMethod.Karachi,
	UmmAlQura: CalculationMethod.UmmAlQura,
	Dubai: CalculationMethod.Dubai,
	MoonsightingCommittee: CalculationMethod.MoonsightingCommittee,
	NorthAmerica: CalculationMethod.NorthAmerica,
	Kuwait: CalculationMethod.Kuwait,
	Qatar: CalculationMethod.Qatar,
	Singapore: CalculationMethod.Singapore,
	Tehran: CalculationMethod.Tehran,
	Turkey: CalculationMethod.Turkey,
	Other: CalculationMethod.Other
};

/**
 * La règle que la bibliothèque recommande pour une position : elle ne regarde que la latitude, et
 * son seuil est strictement 48°. Pour toute la Suisse — Bargen SH, le point le plus au nord, est à
 * 47,81° — elle rend donc `middleofthenight`.
 */
export function recommendedHighLatitudeRule(latitude: number): HighLatitudeRuleName {
	return latitude > 48 ? 'seventhofthenight' : 'middleofthenight';
}

export function isCalculationMethod(value: unknown): value is CalculationMethodName {
	return (CALCULATION_METHODS as readonly unknown[]).includes(value);
}

export function isMadhab(value: unknown): value is MadhabName {
	return (MADHABS as readonly unknown[]).includes(value);
}

export function isHighLatitudeRule(value: unknown): value is HighLatitudeRuleName {
	return (HIGH_LATITUDE_RULES as readonly unknown[]).includes(value);
}

/**
 * L'heure locale d'un instant, dans un fuseau IANA, en `HH:MM`.
 *
 * `Intl` et non l'objet `Date` : les composantes locales de la machine donneraient une heure fausse
 * partout sauf sur une machine réglée sur le fuseau de la mosquée. `hourCycle: 'h23'` évite le
 * « 24:05 » que `hour12: false` produit à minuit dans certaines implémentations.
 */
function heureLocale(instant: Date, timeZone: string): LocalTime {
	const format = new Intl.DateTimeFormat('en-GB', {
		timeZone,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	});
	const parties = format.formatToParts(instant);
	const heure = parties.find((partie) => partie.type === 'hour')?.value ?? '00';
	const minute = parties.find((partie) => partie.type === 'minute')?.value ?? '00';
	return `${heure}:${minute}` as LocalTime;
}

/** La date civile d'un instant dans un fuseau IANA, pour savoir à quel jour une heure appartient. */
function dateLocale(instant: Date, timeZone: string): IsoDate {
	// `sv-SE` formate en `AAAA-MM-JJ`, ce qui évite d'assembler trois morceaux à la main.
	return new Intl.DateTimeFormat('sv-SE', { timeZone }).format(instant) as IsoDate;
}

/**
 * L'instant que l'on donne à `adhan` pour une date civile.
 *
 * **Midi, et non minuit.** `PrayerTimes` lit le jour avec `getFullYear/getMonth/getDate`, donc avec
 * les composantes **locales de la machine**. Un `new Date('2026-06-21')` — minuit UTC — devient le
 * 20 juin sur une machine réglée à Los Angeles, et tout le calcul glisse d'un jour. Construire midi
 * en heure machine met la même date civile hors d'atteinte de n'importe quel décalage de fuseau.
 */
function instantDuJour(date: IsoDate): Date | null {
	const civil = parseIsoDate(date);
	if (!civil) return null;
	return new Date(civil.year, civil.month - 1, civil.day, 12);
}

function parametres(settings: PrayerSettings): CalculationParameters {
	const params = METHODES[settings.method]();
	// Explicitement, toujours : le défaut de la bibliothèque est `MiddleOfTheNight`, et le prendre
	// par omission serait un choix subi plutôt qu'un choix fait.
	// Nos noms sont exactement ceux de la bibliothèque : une table de correspondance n'ajouterait
	// qu'un endroit où les deux pourraient diverger sans qu'on le voie. Les deux assertions
	// ci-dessous tiennent la promesse — si un nom changeait chez elle, le typage le dirait.
	params.madhab = settings.madhab;
	params.highLatitudeRule = settings.highLatitudeRule;
	const decalages = settings.adjustments ?? NO_ADJUSTMENTS;
	// `adjustments` est le champ prévu pour un réglage de mosquée ; `methodAdjustments` appartient à
	// la méthode et n'est jamais touché.
	params.adjustments.fajr = decalages.fajr;
	params.adjustments.dhuhr = decalages.dhuhr;
	params.adjustments.asr = decalages.asr;
	params.adjustments.maghrib = decalages.maghrib;
	params.adjustments.isha = decalages.isha;
	return params;
}

/**
 * Les cinq heures d'un jour, dans le fuseau de l'organisation, ou `undefined` si la méthode ne
 * produit rien ce jour-là.
 *
 * Une méthode **peut** ne rien produire : à Paris, à 18°, il n'existe aucun instant de Fajr pendant
 * dix-neuf jours de l'année. `adhan` rend alors une date invalide. Un jour sans les cinq heures
 * n'est pas écrit du tout — c'est la même absence qu'un jour non importé, que le cœur sait déjà
 * traiter (ADR 0004).
 */
export function computePrayerDay(date: IsoDate, settings: PrayerSettings): PrayerDay | undefined {
	const instant = instantDuJour(date);
	if (!instant) return undefined;
	const times = new PrayerTimes(
		new Coordinates(settings.latitude, settings.longitude),
		instant,
		parametres(settings)
	);
	const brutes = {
		fajr: times.fajr,
		dhuhr: times.dhuhr,
		asr: times.asr,
		maghrib: times.maghrib,
		isha: times.isha
	};
	for (const valeur of Object.values(brutes)) {
		if (!(valeur instanceof Date) || Number.isNaN(valeur.getTime())) return undefined;
	}
	return {
		date,
		fajr: heureLocale(brutes.fajr, settings.timeZone),
		dhuhr: heureLocale(brutes.dhuhr, settings.timeZone),
		asr: heureLocale(brutes.asr, settings.timeZone),
		maghrib: heureLocale(brutes.maghrib, settings.timeZone),
		isha: heureLocale(brutes.isha, settings.timeZone)
	};
}

/**
 * Vrai quand l'heure calculée d'une prière tombe le **jour civil suivant**, dans le fuseau de
 * l'organisation.
 *
 * Ce n'est pas une curiosité : à Bienne, avec la règle du milieu de la nuit, l'Isha passe minuit
 * vingt-huit jours par an en 2026, du 9 juin au 6 juillet. La ligne du 21 juin porte alors
 * « Isha 00:10 »,
 * qui est bien ce que la mosquée affiche sur son panneau — mais qui désigne le 22 juin. Les écrans
 * le signalent ; `PrayerDay` ne sait pas le dire, et c'est écrit dans l'ADR 0004.
 */
export function crossesMidnight(date: IsoDate, settings: PrayerSettings): boolean {
	const instant = instantDuJour(date);
	if (!instant) return false;
	const times = new PrayerTimes(
		new Coordinates(settings.latitude, settings.longitude),
		instant,
		parametres(settings)
	);
	return (
		times.isha instanceof Date &&
		!Number.isNaN(times.isha.getTime()) &&
		dateLocale(times.isha, settings.timeZone) !== date
	);
}

// Deux vérifications de typage, sans effet à l'exécution : nos noms doivent rester exactement ceux
// de la bibliothèque. Si `adhan` renommait une valeur, ces deux lignes cesseraient de compiler.
const _ecolesConnues: MadhabName = Madhab.Shafi;
const _reglesConnues: HighLatitudeRuleName = HighLatitudeRule.MiddleOfTheNight;
void _ecolesConnues;
void _reglesConnues;

// Le lecteur de calendrier CSV vit à côté du calcul : ce sont les deux sources d'un même
// `PrayerDay`, et elles doivent rester interchangeables (ADR 0004).
export {
	analyserCalendrier,
	DERIVE_MAXIMALE,
	lireCsv,
	lireHeure,
	type Avertissement,
	type CalendrierLu,
	type LigneRefusee,
	type OptionsDeLecture,
	type OrdreDeDate
} from './csv.js';

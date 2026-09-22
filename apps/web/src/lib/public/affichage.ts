// La mise en mots des pages publiques, dans les quatre langues.
//
// Pur, sans accès au serveur : les mêmes fonctions servent au rendu et aux tests. Les nombres
// s'écrivent en chiffres latins dans les quatre langues, l'arabe compris (ADR 0007).
//
// Chaque phrase est un enregistrement par langue, jamais un ternaire sur la langue : le correcteur
// (`pnpm orthographe`) relit chaque chaîne dans la langue de la clé qui la porte, `fr:`, `de:`,
// `it:` ou `ar:`. Dans un ternaire, il ne saurait pas laquelle est laquelle.

import { t, type Langue } from '$lib/i18n.js';

export interface SeanceAffichable {
	start: string | null;
	end: string | null;
	anchor: { prayer: string; offsetMinutes: number } | null;
}

const PRIERES: Record<string, Record<Langue, string>> = {
	fajr: { fr: 'Fajr', de: 'Fadschr', it: 'Fajr', ar: 'الفجر' },
	dhuhr: { fr: 'Dhuhr', de: 'Dhuhr', it: 'Dhuhr', ar: 'الظهر' },
	asr: { fr: 'Asr', de: 'Asr', it: 'Asr', ar: 'العصر' },
	maghrib: { fr: 'Maghrib', de: 'Maghrib', it: 'Maghrib', ar: 'المغرب' },
	isha: { fr: 'Isha', de: 'Ischa', it: 'Isha', ar: 'العشاء' }
};

export function nomPriere(langue: Langue, priere: string): string {
	return PRIERES[priere]?.[langue] ?? priere;
}

/**
 * Où tombe un cours par rapport à sa prière : « Après Maghrib », « 15 min après Maghrib »,
 * « 15 min avant Maghrib ». La base et le formulaire acceptent de -120 à 240 minutes ; un décalage
 * négatif se dit « avant », avec sa valeur absolue, et jamais « -15 min après ».
 *
 * La page (horaire d'un cours, heure d'une séance) et le flux agenda passent tous par ici : ils ne
 * peuvent pas dire deux choses différentes du même cours.
 */
export function decalageEnClair(langue: Langue, decalage: number, nomDePriere: string): string {
	const mots = t(langue);
	if (decalage === 0) return mots.after(nomDePriere);
	return decalage > 0
		? mots.afterOffset(decalage, nomDePriere)
		: mots.beforeOffset(-decalage, nomDePriere);
}

/**
 * L'heure d'une séance. Pour un cours ancré, la prière vient **en premier** et l'heure reste une
 * indication (ADR 0004) ; quand la table des heures ne connaît pas ce jour, il n'y a que la prière,
 * et surtout aucune mention d'un réglage manquant — un visiteur n'a pas à connaître nos étapes.
 */
export function heureDeSeance(langue: Langue, seance: SeanceAffichable): string {
	if (seance.anchor) {
		const priere = nomPriere(langue, seance.anchor.prayer);
		const tete = decalageEnClair(langue, seance.anchor.offsetMinutes, priere);
		return seance.start ? `${tete} (${seance.start})` : tete;
	}
	if (seance.start && seance.end) return `${seance.start} – ${seance.end}`;
	return seance.start ?? '';
}

export interface RythmeAffichable {
	recurrenceKind: string;
	recurrenceWeekdays?: readonly number[] | null;
	recurrenceInterval?: number | null;
	recurrenceOrdinal?: number | null;
	recurrenceOrdinalWeekday?: number | null;
	recurrenceDates?: readonly string[] | null;
}

/** « le lundi et mercredi » : un cours de chaque semaine. */
const CHAQUE_SEMAINE: Record<Langue, (jours: string) => string> = {
	fr: (jours) => `le ${jours}`,
	de: (jours) => `jeden ${jours}`,
	it: (jours) => `il ${jours}`,
	ar: (jours) => `كل ${jours}`
};

/** « un mardi sur deux ». */
const UNE_SEMAINE_SUR_DEUX: Record<Langue, (jours: string) => string> = {
	fr: (jours) => `un ${jours} sur deux`,
	de: (jours) => `jeden zweiten ${jours}`,
	it: (jours) => `un ${jours} su due`,
	ar: (jours) => `${jours} كل أسبوعين`
};

/**
 * Le rang d'un jour dans le mois. L'arabe prend la forme invariable du rang, placée devant le jour :
 * « أول جمعة », et non l'adjectif accordé qui suit le jour, « الجمعة الأولى ».
 *
 * L'italien porte son article avec le rang, parce que l'article dépend du rang : il s'élide devant
 * la voyelle d'« ultimo », « l’ultimo lunedì », et reste « il » devant les quatre autres.
 */
const ORDINAUX: Record<Langue, Record<number, string>> = {
	fr: { 1: 'premier', 2: 'deuxième', 3: 'troisième', 4: 'quatrième', [-1]: 'dernier' },
	de: { 1: 'ersten', 2: 'zweiten', 3: 'dritten', 4: 'vierten', [-1]: 'letzten' },
	it: { 1: 'il primo', 2: 'il secondo', 3: 'il terzo', 4: 'il quarto', [-1]: 'l’ultimo' },
	ar: { 1: 'أول', 2: 'ثاني', 3: 'ثالث', 4: 'رابع', [-1]: 'آخر' }
};

/**
 * Le jour tel qu'il s'écrit après un rang, quand ce n'est pas son nom habituel. En arabe, le rang
 * invariable demande le jour **sans article** : « آخر اثنين », pas « آخر الاثنين ». Les trois autres
 * langues reprennent les noms de jour de leur dictionnaire.
 */
const JOURS_APRES_UN_RANG: Partial<Record<Langue, readonly string[]>> = {
	ar: ['اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت', 'أحد']
};

/** « le dernier samedi du mois ». */
const RANG_DU_MOIS: Record<Langue, (rang: string, jour: string) => string> = {
	fr: (rang, jour) => `le ${rang} ${jour} du mois`,
	de: (rang, jour) => `am ${rang} ${jour} des Monats`,
	it: (rang, jour) => `${rang} ${jour} del mese`,
	ar: (rang, jour) => `${rang} ${jour} من الشهر`
};

/** « le lundi et mercredi », « un mardi sur deux », « le dernier samedi du mois ». */
export function rythmeEnClair(langue: Langue, cours: RythmeAffichable): string {
	const mots = t(langue);
	const jours = (cours.recurrenceWeekdays ?? []).map((jour) => mots.weekdays[jour - 1] ?? '');
	if (cours.recurrenceKind === 'weekly') {
		const liste = joindre(langue, jours);
		return cours.recurrenceInterval === 2
			? UNE_SEMAINE_SUR_DEUX[langue](liste)
			: CHAQUE_SEMAINE[langue](liste);
	}
	if (cours.recurrenceKind === 'monthly') {
		const rang = ORDINAUX[langue][cours.recurrenceOrdinal ?? 1] ?? '';
		const jours = JOURS_APRES_UN_RANG[langue] ?? mots.weekdays;
		const jour = jours[(cours.recurrenceOrdinalWeekday ?? 1) - 1] ?? '';
		return RANG_DU_MOIS[langue](rang, jour);
	}
	return mots.rhythms['dates'] ?? '';
}

/**
 * Une liste de deux éléments ou plus. Le français, l'allemand et l'italien séparent par des
 * virgules et posent la conjonction avant le dernier. L'arabe colle « و » au mot qui suit et le
 * répète devant chaque élément, sans virgule : « الفرنسية والعربية والتركية ».
 */
const LISTE: Record<Langue, (parties: readonly string[]) => string> = {
	fr: (parties) => `${parties.slice(0, -1).join(', ')} et ${parties[parties.length - 1]}`,
	de: (parties) => `${parties.slice(0, -1).join(', ')} und ${parties[parties.length - 1]}`,
	it: (parties) => `${parties.slice(0, -1).join(', ')} e ${parties[parties.length - 1]}`,
	ar: (parties) => parties.join(' و')
};

/** « lundi, mercredi et vendredi », avec la conjonction de chaque langue. */
export function joindre(langue: Langue, parties: readonly string[]): string {
	if (parties.length === 0) return '';
	if (parties.length === 1) return parties[0] ?? '';
	return LISTE[langue](parties);
}

/** « de 19:00 à 20:30 ». */
const DE_A: Record<Langue, (debut: string, fin: string) => string> = {
	fr: (debut, fin) => `de ${debut} à ${fin}`,
	de: (debut, fin) => `von ${debut} bis ${fin}`,
	it: (debut, fin) => `dalle ${debut} alle ${fin}`,
	ar: (debut, fin) => `من ${debut} إلى ${fin}`
};

/** L'horaire d'un cours, hors de toute séance : « de 19:00 à 20:30 », « après Maghrib ». */
export function horaireEnClair(
	langue: Langue,
	cours: {
		timingKind: string;
		timingStart?: string | null;
		timingEnd?: string | null;
		timingPrayer?: string | null;
		timingOffsetMinutes?: number | null;
	}
): string {
	if (cours.timingKind === 'fixed') {
		return DE_A[langue]((cours.timingStart ?? '').slice(0, 5), (cours.timingEnd ?? '').slice(0, 5));
	}
	const priere = nomPriere(langue, cours.timingPrayer ?? '');
	return decalageEnClair(langue, cours.timingOffsetMinutes ?? 0, priere);
}

/** Le nom de chaque langue d'enseignement, dans chacune des quatre langues de l'interface. */
const NOMS_DE_LANGUE: Record<string, Record<Langue, string>> = {
	fr: { fr: 'français', de: 'Französisch', it: 'francese', ar: 'الفرنسية' },
	de: { fr: 'allemand', de: 'Deutsch', it: 'tedesco', ar: 'الألمانية' },
	it: { fr: 'italien', de: 'Italienisch', it: 'italiano', ar: 'الإيطالية' },
	ar: { fr: 'arabe', de: 'Arabisch', it: 'arabo', ar: 'العربية' },
	en: { fr: 'anglais', de: 'Englisch', it: 'inglese', ar: 'الإنجليزية' },
	sq: { fr: 'albanais', de: 'Albanisch', it: 'albanese', ar: 'الألبانية' },
	tr: { fr: 'turc', de: 'Türkisch', it: 'turco', ar: 'التركية' },
	bs: { fr: 'bosnien', de: 'Bosnisch', it: 'bosniaco', ar: 'البوسنية' }
};

/** Les langues d'enseignement, en toutes lettres. */
export function languesEnClair(langue: Langue, codes: readonly string[]): string {
	return joindre(
		langue,
		codes.map((code) => NOMS_DE_LANGUE[code]?.[langue] ?? code)
	);
}

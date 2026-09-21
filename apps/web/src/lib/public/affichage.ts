// La mise en mots des pages publiques, dans les quatre langues.
//
// Pur, sans accès au serveur : les mêmes fonctions servent au rendu et aux tests. Les nombres
// s'écrivent en chiffres latins dans les quatre langues, l'arabe compris (ADR 0007).

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
 * L'heure d'une séance. Pour un cours ancré, la prière vient **en premier** et l'heure reste une
 * indication (ADR 0004) ; quand la table des heures ne connaît pas ce jour, il n'y a que la prière,
 * et surtout aucune mention d'un réglage manquant — un visiteur n'a pas à connaître nos étapes.
 */
export function heureDeSeance(langue: Langue, seance: SeanceAffichable): string {
	const mots = t(langue);
	if (seance.anchor) {
		const priere = nomPriere(langue, seance.anchor.prayer);
		const tete =
			seance.anchor.offsetMinutes === 0
				? mots.after(priere)
				: mots.afterOffset(seance.anchor.offsetMinutes, priere);
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

const ORDINAUX: Record<Langue, Record<number, string>> = {
	fr: { 1: 'premier', 2: 'deuxième', 3: 'troisième', 4: 'quatrième', [-1]: 'dernier' },
	de: { 1: 'ersten', 2: 'zweiten', 3: 'dritten', 4: 'vierten', [-1]: 'letzten' },
	it: { 1: 'primo', 2: 'secondo', 3: 'terzo', 4: 'quarto', [-1]: 'ultimo' },
	ar: { 1: 'الأول', 2: 'الثاني', 3: 'الثالث', 4: 'الرابع', [-1]: 'الأخير' }
};

/** « le lundi et mercredi », « un mardi sur deux », « le dernier samedi du mois ». */
export function rythmeEnClair(langue: Langue, cours: RythmeAffichable): string {
	const mots = t(langue);
	const jours = (cours.recurrenceWeekdays ?? []).map((jour) => mots.weekdays[jour - 1] ?? '');
	if (cours.recurrenceKind === 'weekly') {
		const liste = joindre(langue, jours);
		if (cours.recurrenceInterval === 2) {
			return langue === 'fr'
				? `un ${liste} sur deux`
				: langue === 'de'
					? `jeden zweiten ${liste}`
					: langue === 'it'
						? `un ${liste} su due`
						: `${liste} كل أسبوعين`;
		}
		return langue === 'fr'
			? `le ${liste}`
			: langue === 'de'
				? `jeden ${liste}`
				: langue === 'it'
					? `il ${liste}`
					: `كل ${liste}`;
	}
	if (cours.recurrenceKind === 'monthly') {
		const rang = ORDINAUX[langue][cours.recurrenceOrdinal ?? 1] ?? '';
		const jour = mots.weekdays[(cours.recurrenceOrdinalWeekday ?? 1) - 1] ?? '';
		return langue === 'fr'
			? `le ${rang} ${jour} du mois`
			: langue === 'de'
				? `am ${rang} ${jour} des Monats`
				: langue === 'it'
					? `il ${rang} ${jour} del mese`
					: `${jour} ${rang} من الشهر`;
	}
	return mots.rhythms['dates'] ?? '';
}

/** « lundi, mercredi et vendredi », avec la conjonction de chaque langue. */
export function joindre(langue: Langue, parties: readonly string[]): string {
	if (parties.length === 0) return '';
	if (parties.length === 1) return parties[0] ?? '';
	const conjonction = { fr: 'et', de: 'und', it: 'e', ar: 'و' }[langue];
	return `${parties.slice(0, -1).join(', ')} ${conjonction} ${parties[parties.length - 1]}`;
}

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
	const mots = t(langue);
	if (cours.timingKind === 'fixed') {
		const debut = (cours.timingStart ?? '').slice(0, 5);
		const fin = (cours.timingEnd ?? '').slice(0, 5);
		return langue === 'fr'
			? `de ${debut} à ${fin}`
			: langue === 'de'
				? `von ${debut} bis ${fin}`
				: langue === 'it'
					? `dalle ${debut} alle ${fin}`
					: `من ${debut} إلى ${fin}`;
	}
	const priere = nomPriere(langue, cours.timingPrayer ?? '');
	const decalage = cours.timingOffsetMinutes ?? 0;
	return decalage === 0 ? mots.after(priere) : mots.afterOffset(decalage, priere);
}

/** Les langues d'enseignement, en toutes lettres. */
export function languesEnClair(langue: Langue, codes: readonly string[]): string {
	const noms: Record<string, Record<Langue, string>> = {
		fr: { fr: 'français', de: 'Französisch', it: 'francese', ar: 'الفرنسية' },
		de: { fr: 'allemand', de: 'Deutsch', it: 'tedesco', ar: 'الألمانية' },
		it: { fr: 'italien', de: 'Italienisch', it: 'italiano', ar: 'الإيطالية' },
		ar: { fr: 'arabe', de: 'Arabisch', it: 'arabo', ar: 'العربية' },
		en: { fr: 'anglais', de: 'Englisch', it: 'inglese', ar: 'الإنجليزية' },
		sq: { fr: 'albanais', de: 'Albanisch', it: 'albanese', ar: 'الألبانية' },
		tr: { fr: 'turc', de: 'Türkisch', it: 'turco', ar: 'التركية' },
		bs: { fr: 'bosnien', de: 'Bosnisch', it: 'bosniaco', ar: 'البوسنية' }
	};
	return joindre(
		langue,
		codes.map((code) => noms[code]?.[langue] ?? code)
	);
}

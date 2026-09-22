// Mise en mots, en français. Aucune dépendance au serveur, aucune horloge, aucun fuseau : tout part
// d'une date civile en chaîne (ADR 0012), pour que la même phrase sorte ici, dans un test, et un
// jour dans le navigateur.
//
// `Intl` n'est pas utilisé pour les dates : il demande un objet `Date`, donc un instant, donc un
// fuseau — et c'est précisément ce que le modèle de l'étape 1 a refusé d'introduire.

import { isoDateToDays, parseIsoDate, weekdayFromDays, type IsoDate } from '@jadwal/core';

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;
const MOIS = [
	'janvier',
	'février',
	'mars',
	'avril',
	'mai',
	'juin',
	'juillet',
	'août',
	'septembre',
	'octobre',
	'novembre',
	'décembre'
] as const;

/** « lundi ». */
export function weekdayName(date: IsoDate): string {
	return JOURS[weekdayFromDays(isoDateToDays(date)) - 1] ?? '';
}

/** « lundi 21 septembre ». Sans l'année, qui n'apprend rien sur sept jours. */
export function shortDate(date: IsoDate): string {
	const civil = parseIsoDate(date);
	if (!civil) return date;
	const premier = civil.day === 1 ? '1er' : String(civil.day);
	return `${weekdayName(date)} ${premier} ${MOIS[civil.month - 1]}`;
}

/** « 21 septembre 2026 », pour les endroits où l'année compte. */
export function longDate(date: IsoDate): string {
	const civil = parseIsoDate(date);
	if (!civil) return date;
	const premier = civil.day === 1 ? '1er' : String(civil.day);
	return `${premier} ${MOIS[civil.month - 1]} ${civil.year}`;
}

export const AUDIENCE_LABELS: Record<string, string> = {
	kids: 'enfants',
	youth: 'jeunes',
	women: 'femmes',
	adults: 'adultes',
	open: 'ouvert à tous'
};

export const PRAYER_LABELS: Record<string, string> = {
	fajr: 'Fajr',
	dhuhr: 'Dhuhr',
	asr: 'Asr',
	maghrib: 'Maghrib',
	isha: 'Isha'
};

export const LANGUAGE_LABELS: Record<string, string> = {
	fr: 'français',
	de: 'allemand',
	it: 'italien',
	ar: 'arabe',
	en: 'anglais',
	sq: 'albanais',
	tr: 'turc',
	bs: 'bosnien'
};

const ORDINALS: Record<number, string> = {
	1: 'premier',
	2: 'deuxième',
	3: 'troisième',
	4: 'quatrième',
	[-1]: 'dernier'
};

/** « lundi et mercredi », « lundi, mercredi et vendredi ». */
export function joinFrench(parts: readonly string[]): string {
	if (parts.length === 0) return '';
	if (parts.length === 1) return parts[0] ?? '';
	return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
}

export interface RecurrenceView {
	kind: string;
	weekdays?: readonly number[] | null;
	interval?: number | null;
	ordinal?: number | null;
	ordinalWeekday?: number | null;
	dates?: readonly string[] | null;
}

/** Le rythme en clair : c'est la phrase que le responsable relit pour se rassurer. */
export function describeRecurrence(recurrence: RecurrenceView): string {
	if (recurrence.kind === 'weekly') {
		const jours = joinFrench((recurrence.weekdays ?? []).map((day) => JOURS[day - 1] ?? ''));
		return recurrence.interval === 2 ? `un ${jours} sur deux` : `chaque semaine, le ${jours}`;
	}
	if (recurrence.kind === 'monthly') {
		const rang = ORDINALS[recurrence.ordinal ?? 1] ?? 'premier';
		const jour = JOURS[(recurrence.ordinalWeekday ?? 1) - 1] ?? '';
		return `le ${rang} ${jour} du mois`;
	}
	const dates = recurrence.dates ?? [];
	if (dates.length === 0) return 'à des dates précises';
	const affichees = dates.slice(0, 3).map((date) => shortDate(date as IsoDate));
	const reste = dates.length - affichees.length;
	return reste > 0
		? `à des dates précises : ${joinFrench(affichees)}, et ${reste} autre${reste > 1 ? 's' : ''}`
		: `à des dates précises : ${joinFrench(affichees)}`;
}

export interface TimingView {
	kind: string;
	start?: string | null;
	end?: string | null;
	prayer?: string | null;
	offsetMinutes?: number | null;
	durationMinutes?: number | null;
}

/** « de 19:00 à 20:30 », « 30 min après Maghrib, pendant 1 h ». */
export function describeTiming(timing: TimingView): string {
	if (timing.kind === 'fixed') {
		return `de ${(timing.start ?? '').slice(0, 5)} à ${(timing.end ?? '').slice(0, 5)}`;
	}
	const priere = PRAYER_LABELS[timing.prayer ?? ''] ?? timing.prayer ?? '';
	const quand = quandParRapportA(priere, timing.offsetMinutes ?? 0);
	return `${quand}, pendant ${describeDuration(timing.durationMinutes ?? 0)}`;
}

/**
 * « à Maghrib », « 15 min après Maghrib », « 15 min avant Maghrib ». Un décalage négatif se dit
 * « avant », avec sa valeur absolue : l'horaire d'un cours et l'heure de chacune de ses séances le
 * disent de la même façon, parce qu'ils passent tous deux par ici.
 */
function quandParRapportA(priere: string, decalage: number): string {
	if (decalage === 0) return `à ${priere}`;
	return decalage > 0 ? `${decalage} min après ${priere}` : `${-decalage} min avant ${priere}`;
}

/** « 1 h 30 », « 45 min ». */
export function describeDuration(minutes: number): string {
	if (minutes < 60) return `${minutes} min`;
	const heures = Math.floor(minutes / 60);
	const reste = minutes % 60;
	return reste === 0 ? `${heures} h` : `${heures} h ${String(reste).padStart(2, '0')}`;
}

/** L'heure d'une séance, ou ce qu'on en sait quand la table des prières ne dit rien. */
export function describeSessionTime(seance: {
	start: string | null;
	end: string | null;
	anchor?: { prayer: string; offsetMinutes: number } | undefined;
}): string {
	if (seance.start && seance.end) return `${seance.start} – ${seance.end}`;
	if (seance.anchor) {
		const priere = PRAYER_LABELS[seance.anchor.prayer] ?? seance.anchor.prayer;
		return quandParRapportA(priere, seance.anchor.offsetMinutes);
	}
	return 'heure à préciser';
}

// Mise en mots, dans les cinq langues de l'espace. Aucune dépendance au serveur, aucune horloge, aucun
// fuseau : tout part d'une date civile en chaîne (ADR 0012), pour que la même phrase sorte ici, dans
// un test, et un jour dans le navigateur.
//
// `Intl` n'est pas utilisé pour les dates : il demande un objet `Date`, donc un instant, donc un
// fuseau — et c'est précisément ce que le modèle de l'étape 1 a refusé d'introduire.
//
// Chaque fonction prend la langue en dernier paramètre, facultatif, le français par défaut (étape 18) :
// un appel sans langue rend ce qu'il rendait avant, mot pour mot, et les écrans pas encore repris
// n'ont rien à changer. Les mots viennent de `i18n/formatting.ts`, de `i18n.ts` et de
// `public/affichage.ts`, jamais d'ici.

import { isoDateToDays, weekdayFromDays, type IsoDate } from '@jadwal/core';
import { longDate as dateDuJour, numericDate, t, type Langue } from './i18n.js';
import { formattingTexts } from './i18n/formatting.js';
import {
	decalageEnClair,
	horaireEnClair,
	joindre,
	languesEnClair,
	nomPriere,
	rythmeEnClair
} from './public/affichage.js';

/** « lundi ». */
export function weekdayName(date: IsoDate, language: Langue = 'fr'): string {
	return t(language).weekdays[weekdayFromDays(isoDateToDays(date)) - 1] ?? '';
}

/**
 * « lundi 21.09.2026 » : le nom du jour, puis la date en `JJ.MM.AAAA`. Depuis l'étape 18, l'espace
 * écrit ses dates comme la page publique, par la même fonction de `i18n.ts` ; elles s'écrivaient
 * « lundi 21 septembre », sans l'année.
 */
export function shortDate(date: IsoDate, language: Langue = 'fr'): string {
	return dateDuJour(language, date);
}

/** « 21.09.2026 », pour les endroits où le nom du jour n'apprend rien. Pareil dans les cinq langues. */
export function longDate(date: IsoDate): string {
	return numericDate(date);
}

type Audience = keyof (typeof formattingTexts)['fr']['audiences'];

/** Les publics, au fil d'une ligne, dans une langue : pour une liste d'options, par exemple. */
export function audienceLabels(language: Langue): Record<string, string> {
	return { ...formattingTexts[language].audiences };
}

/** Un public au fil d'une ligne ; un code inconnu reste tel quel. */
export function audienceLabel(code: string, language: Langue = 'fr'): string {
	const labels = formattingTexts[language].audiences;
	return code in labels ? labels[code as Audience] : code;
}

export const AUDIENCE_LABELS: Record<string, string> = audienceLabels('fr');

/** Le nom d'une prière, tel que la page publique le donne ; un code inconnu reste tel quel. */
export function prayerLabel(code: string, language: Langue = 'fr'): string {
	return nomPriere(language, code);
}

export const PRAYER_LABELS: Record<string, string> = Object.fromEntries(
	['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map((code) => [code, prayerLabel(code)])
);

/** Le nom d'une langue d'enseignement ; un code inconnu reste tel quel. */
export function languageLabel(code: string, language: Langue = 'fr'): string {
	return languesEnClair(language, [code]);
}

export const LANGUAGE_LABELS: Record<string, string> = Object.fromEntries(
	['fr', 'de', 'it', 'ar', 'en', 'sq', 'tr', 'bs'].map((code) => [code, languageLabel(code)])
);

/** « lundi, mercredi et vendredi », avec la conjonction de chaque langue. */
export function joinList(parts: readonly string[], language: Langue = 'fr'): string {
	return joindre(language, parts);
}

/** « lundi et mercredi », « lundi, mercredi et vendredi ». */
export function joinFrench(parts: readonly string[]): string {
	return joinList(parts, 'fr');
}

export interface RecurrenceView {
	kind: string;
	weekdays?: readonly number[] | null;
	interval?: number | null;
	ordinal?: number | null;
	ordinalWeekday?: number | null;
	dates?: readonly string[] | null;
}

/**
 * Le rythme en clair : c'est la phrase que le responsable relit pour se rassurer.
 *
 * Une semaine sur deux et le rang dans le mois se disent comme sur la page publique ; seul le rythme
 * de chaque semaine le précise (« chaque semaine, le lundi »), pour se distinguer d'« un lundi sur
 * deux », et les dates précises montrent les trois premières.
 */
export function describeRecurrence(recurrence: RecurrenceView, language: Langue = 'fr'): string {
	const words = formattingTexts[language];
	if (recurrence.kind === 'weekly' && recurrence.interval !== 2) {
		const days = (recurrence.weekdays ?? []).map((day) => t(language).weekdays[day - 1] ?? '');
		return words.weekly(joinList(days, language));
	}
	if (recurrence.kind === 'weekly' || recurrence.kind === 'monthly') {
		return rythmeEnClair(language, {
			recurrenceKind: recurrence.kind,
			recurrenceWeekdays: recurrence.weekdays ?? null,
			recurrenceInterval: recurrence.interval ?? null,
			recurrenceOrdinal: recurrence.ordinal ?? 1,
			recurrenceOrdinalWeekday: recurrence.ordinalWeekday ?? 1
		});
	}
	const dates = recurrence.dates ?? [];
	if (dates.length === 0) return words.datesNone;
	const shown = words.dateList(
		dates.slice(0, 3).map((date) => shortDate(date as IsoDate, language))
	);
	const more = dates.length - Math.min(dates.length, 3);
	return more > 0 ? words.datesAndMore(shown, more) : words.dates(shown);
}

export interface TimingView {
	kind: string;
	start?: string | null;
	end?: string | null;
	prayer?: string | null;
	offsetMinutes?: number | null;
	durationMinutes?: number | null;
}

/** « de 19:00 à 20:30 », « 30 min après Maghrib, pendant 1 h 30 ». */
export function describeTiming(timing: TimingView, language: Langue = 'fr'): string {
	if (timing.kind === 'fixed') {
		return horaireEnClair(language, {
			timingKind: 'fixed',
			timingStart: timing.start ?? '',
			timingEnd: timing.end ?? ''
		});
	}
	const when = relativeToPrayer(timing.prayer ?? '', timing.offsetMinutes ?? 0, language);
	return formattingTexts[language].lasting(
		when,
		describeDuration(timing.durationMinutes ?? 0, language)
	);
}

/**
 * « après Maghrib », « 15 min après Maghrib », « 15 min avant Maghrib » (retour C3). Un décalage
 * négatif se dit « avant », avec sa valeur absolue : l'horaire d'un cours et l'heure de chacune de ses
 * séances le disent de la même façon, parce qu'ils passent tous deux par ici. Ce sont les mots de la
 * page publique et du flux agenda (`decalageEnClair`), en minuscule initiale, puisque l'espace les
 * écrit au fil de la ligne ; un code de prière inconnu reste tel quel.
 */
function relativeToPrayer(prayer: string, offset: number, language: Langue): string {
	const phrase = decalageEnClair(language, offset, nomPriere(language, prayer));
	return phrase.charAt(0).toLocaleLowerCase(language) + phrase.slice(1);
}

/** « 1 h 30 », « 45 min » ; « 1 Stunde 30 Minuten », « ساعة و30 دقيقة ». */
export function describeDuration(minutes: number, language: Langue = 'fr'): string {
	return formattingTexts[language].duration(Math.floor(minutes / 60), minutes % 60);
}

/** L'heure d'une séance, ou ce qu'on en sait quand la table des prières ne dit rien. */
export function describeSessionTime(
	seance: {
		start: string | null;
		end: string | null;
		anchor?: { prayer: string; offsetMinutes: number } | undefined;
	},
	language: Langue = 'fr'
): string {
	if (seance.start && seance.end) return `${seance.start} – ${seance.end}`;
	if (seance.anchor) {
		return relativeToPrayer(seance.anchor.prayer, seance.anchor.offsetMinutes, language);
	}
	return formattingTexts[language].timeUnknown;
}

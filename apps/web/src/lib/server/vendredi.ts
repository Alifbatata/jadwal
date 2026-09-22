// La prière du vendredi remplace le Dhuhr de ce jour-là (ADR 0033).
//
// Ce que cela veut dire concrètement, et pourquoi c'est écrit ici plutôt que dans la requête de
// résolution : l'heure **du soleil** du Dhuhr reste ce qu'elle est — c'est un fait astronomique, et
// la fausser serait mentir. C'est l'**iqama** du Dhuhr qui devient l'heure de la session, parce que
// l'iqama est par définition « quand la prière est appelée dans la salle », et le vendredi elle
// l'est à la Jumu'a.
//
// Le mécanisme est donc celui de l'étape 8, sans rien d'autre : un cours « après Dhuhr » suit déjà
// l'iqama quand elle existe. Sans cette substitution, un cours du vendredi s'annoncerait à 12:34
// pendant que l'organisation prie à 13:30.
//
// **Quand il y a plusieurs sessions, c'est la dernière qui vaut.** C'est le moment où les gens sont
// encore là : après la première, une partie de l'assemblée est repartie et la seconde n'a pas
// commencé. Le choix est discutable et il est écrit dans l'ADR ; ce qui ne l'est pas, c'est qu'il
// faut en faire un.

import {
	weekdayFromDays,
	isoDateToDays,
	type IsoDate,
	type LocalTime,
	type PrayerDay
} from '@jadwal/core';

/** Vendredi, en jour de semaine ISO. */
const VENDREDI = 5;

/** Ce qu'une session apporte ici : son rang et son heure de début. */
export interface SessionDuVendredi {
	jumuaOrder: number;
	start: LocalTime;
}

/** Les sessions du vendredi d'une liste de cours, dans leur ordre d'affichage. */
export function sessionsDuVendredi(
	courses: readonly {
		kind?: string | null;
		jumua_order?: number | null;
		timing_start?: string | null;
	}[]
): SessionDuVendredi[] {
	return courses
		.filter((course) => course.kind === 'jumua' && course.timing_start)
		.map((course) => ({
			jumuaOrder: course.jumua_order ?? 1,
			start: String(course.timing_start).slice(0, 5) as LocalTime
		}))
		.sort((a, b) => a.jumuaOrder - b.jumuaOrder);
}

/**
 * Remplace l'iqama du Dhuhr par l'heure de la dernière session, chaque vendredi de la table.
 *
 * Rend une **nouvelle** table : les jours des autres semaines, et les autres prières du vendredi,
 * ne sont pas touchés. Sans session, la table revient telle quelle — le comportement d'avant
 * l'étape 8, mot pour mot.
 */
export function appliquerVendredi(
	table: Map<string, PrayerDay>,
	sessions: readonly SessionDuVendredi[]
): Map<string, PrayerDay> {
	if (sessions.length === 0) return table;
	const derniere = sessions[sessions.length - 1] as SessionDuVendredi;
	const resultat = new Map<string, PrayerDay>();
	for (const [date, jour] of table) {
		if (weekdayFromDays(isoDateToDays(date as IsoDate)) !== VENDREDI) {
			resultat.set(date, jour);
			continue;
		}
		resultat.set(date, { ...jour, iqama: { ...(jour.iqama ?? {}), dhuhr: derniere.start } });
	}
	return resultat;
}

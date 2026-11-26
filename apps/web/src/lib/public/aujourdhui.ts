// Ce que la vue « Aujourd'hui » décide, sans rien afficher : la prochaine prière, et le premier
// jour suivant qui a des séances (étape 24, docs/maquettes/public-aujourdhui.md).
//
// Des fonctions pures : l'heure qu'il est leur est donnée, en minutes du jour dans le fuseau de
// l'organisation (`minuteOfDayInZone`, `@jadwal/core`). La page n'a pas de script : la réponse vaut
// pour l'instant où elle a été demandée.

/** Une prière d'un jour : son adhan, et l'iqama que l'organisation a réglée, quand elle en a une. */
export interface HeureDuJour {
	priere: string;
	adhan: string | null;
	iqama: string | null;
}

/**
 * La prochaine prière :
 * - une prière d'aujourd'hui, avec son iqama quand elle est fixée ;
 * - la prière du vendredi, avec les heures des sessions qui n'ont pas encore commencé ;
 * - le Fajr de demain, après l'Isha ;
 * - `null` quand aucune heure à venir n'est connue.
 */
export type Prochaine =
	| { genre: 'priere'; priere: string; adhan: string; iqama: string | null }
	| { genre: 'jumua'; heures: string[] }
	| { genre: 'demain'; priere: string; adhan: string }
	| null;

/** « 13:05 » en minutes du jour. Les heures viennent de la base, déjà ramenées à `HH:MM`. */
function enMinutes(heure: string): number {
	return Number(heure.slice(0, 2)) * 60 + Number(heure.slice(3, 5));
}

/**
 * La première prière dont l'adhan n'est pas encore passé. Un adhan est passé dès sa propre minute :
 * à 13:05, celui de 13:05 a été dit.
 *
 * Un vendredi où des sessions ont lieu, le Dhuhr est la prière du vendredi (ADR 0033) : elle reste
 * la prochaine tant qu'une session n'a pas commencé, et l'adhan du Dhuhr ne compte pas, qu'il vienne
 * avant ou après elles. `vendredi` porte les heures de début de ces sessions, dans l'ordre, et reste
 * vide les autres jours.
 */
export function prochainePriere(demande: {
	maintenant: number;
	heures: readonly HeureDuJour[];
	vendredi: readonly string[];
	demain: readonly HeureDuJour[] | null;
}): Prochaine {
	const { maintenant, heures, vendredi, demain } = demande;
	for (const heure of heures) {
		if (heure.priere === 'dhuhr' && vendredi.length > 0) {
			const restent = vendredi.filter((debut) => enMinutes(debut) > maintenant);
			if (restent.length > 0) return { genre: 'jumua', heures: restent };
			continue;
		}
		if (heure.adhan !== null && enMinutes(heure.adhan) > maintenant) {
			return { genre: 'priere', priere: heure.priere, adhan: heure.adhan, iqama: heure.iqama };
		}
	}
	const premiere = demain?.find((heure) => heure.adhan !== null);
	return premiere?.adhan
		? { genre: 'demain', priere: premiere.priere, adhan: premiere.adhan }
		: null;
}

/**
 * Le premier jour après `today` où une séance a lieu. Une séance annulée, ou partie à un autre jour,
 * n'a pas lieu : un jour qui n'a qu'elles n'est pas « à venir ». La séance déplacée compte à son
 * jour d'arrivée, où l'expansion la rend une seconde fois (`moved_here`).
 */
export function premierJourSuivant(
	today: string,
	seances: readonly { date: string; status: string }[]
): string | null {
	const jours = seances
		.filter(
			(seance) =>
				seance.date > today && seance.status !== 'cancelled' && seance.status !== 'moved_away'
		)
		.map((seance) => seance.date)
		.sort();
	return jours[0] ?? null;
}

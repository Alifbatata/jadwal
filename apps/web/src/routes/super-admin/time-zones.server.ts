// Les fuseaux horaires qu'on propose à la création d'une organisation (étape 18, retour B2).
//
// Rien que des noms IANA canoniques : un alias (Europe/Amsterdam, Europe/Oslo…) pointe vers le fuseau
// d'un autre pays, et pourrait en désigner un autre demain si la base IANA les sépare. `buildCalendar`
// les refuse, et le flux agenda d'une organisation enregistrée avant la liste doit ramener le sien au
// fuseau canonique (`lib/server/agenda.ts`) : on ne les propose donc pas, et le serveur refuse tout
// nom qui n'est pas dans la liste.
//
// Les fuseaux `Etc/` ne sont pas proposés non plus : une organisation a un lieu, et `Etc/GMT-1` veut
// dire une heure de plus que Greenwich, signe inversé, ce qui tromperait à coup sûr.

import { canonicalTimeZones } from '@jadwal/core/ics';

/** Le fuseau choisi d'avance : celui de la Suisse, où le service est exploité. */
export const DEFAULT_TIME_ZONE = 'Europe/Zurich';

export interface TimeZoneChoices {
	/** Les fuseaux d'Europe, en tête de la liste. */
	readonly europe: readonly string[];
	/** Tous les autres, par ordre alphabétique. */
	readonly world: readonly string[];
}

let choices: TimeZoneChoices | undefined;
let offered: ReadonlySet<string> | undefined;

/**
 * La liste, calculée une fois par processus : `canonicalTimeZones` consulte la base des fuseaux pour
 * chacun des noms qu'elle connaît.
 */
export function timeZoneChoices(): TimeZoneChoices {
	if (!choices) {
		const zones = canonicalTimeZones().filter((zone) => !zone.startsWith('Etc/'));
		choices = {
			europe: zones.filter((zone) => zone.startsWith('Europe/')),
			world: zones.filter((zone) => !zone.startsWith('Europe/'))
		};
	}
	return choices;
}

/** Vrai si ce fuseau est l'un de ceux que la liste propose. */
export function isOfferedTimeZone(zone: string): boolean {
	offered ??= new Set([...timeZoneChoices().europe, ...timeZoneChoices().world]);
	return offered.has(zone);
}

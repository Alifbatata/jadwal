// Modèle de données de @jadwal/core : cours, rythme, horaire, exceptions, pauses, occurrences.
// Voir docs/adr/0003 (récurrence), 0004 (ancrage sur une prière), 0011 (pauses) et 0012 (dates en chaînes).

/** Date civile au format ISO 8601 (« 2026-09-19 »). Aucun fuseau : c'est le jour civil de l'organisation. */
export type IsoDate = `${number}-${number}-${number}`;

/** Heure locale « HH:MM » sur 24 heures (« 19:00 »). */
export type LocalTime = `${number}:${number}`;

/** Jour de semaine ISO 8601 : 1 = lundi … 7 = dimanche. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Prayer = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export const PRAYERS: readonly Prayer[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export type Recurrence =
	| {
			kind: 'weekly';
			weekdays: Weekday[];
			/** 1 = chaque semaine ; 2 = une semaine sur deux, par rapport à la semaine de `anchorDate`. */
			interval: 1 | 2;
			/** Une date quelconque de la première semaine active (semaine commençant le lundi). */
			anchorDate: IsoDate;
	  }
	| {
			kind: 'monthly';
			weekday: Weekday;
			/** 1 à 4 = nième jour de semaine du mois ; -1 = le dernier. */
			ordinal: 1 | 2 | 3 | 4 | -1;
	  }
	| { kind: 'dates'; dates: IsoDate[] };

export type Timing =
	| { kind: 'fixed'; start: LocalTime; end: LocalTime }
	| {
			kind: 'prayer';
			prayer: Prayer;
			/** Décalage par rapport à l'heure de la prière, en minutes, dans -120..240. */
			offsetMinutes: number;
			/** Durée de la séance en minutes, dans 5..1440. */
			durationMinutes: number;
	  };

export interface CourseSchedule {
	id: string;
	recurrence: Recurrence;
	timing: Timing;
	startsOn: IsoDate;
	endsOn?: IsoDate;
	/** Numéro de révision de l'horaire, repris tel quel dans SEQUENCE à l'export ICS. */
	sequence: number;
}

export type SessionException =
	| { kind: 'cancelled'; courseId: string; date: IsoDate }
	| { kind: 'moved'; courseId: string; date: IsoDate; toDate: IsoDate; toStart: LocalTime };

/** Période sans séance, inclusive. Sans `courseId`, la pause vaut pour toute l'organisation. */
export interface Pause {
	from: IsoDate;
	to: IsoDate;
	courseId?: string;
}

export interface PrayerDay {
	date: IsoDate;
	fajr: LocalTime;
	dhuhr: LocalTime;
	asr: LocalTime;
	maghrib: LocalTime;
	isha: LocalTime;
	/**
	 * Heures d'**iqama** du jour, prière par prière, quand l'organisation les a réglées.
	 *
	 * Ce n'est pas la même chose que les cinq heures ci-dessus, qui sont celles du soleil. L'iqama
	 * est l'heure à laquelle la prière est **appelée dans la salle**, et c'est l'organisation qui la
	 * décide : une heure fixe, ou un décalage après l'heure du soleil. C'est donc elle, et non
	 * l'heure du soleil, qui dit quand les gens sont là — un cours « après Maghrib » s'ancre
	 * dessus quand elle existe (ADR 0004, étape 8).
	 *
	 * Le tableau est partiel : une organisation peut régler l'iqama de trois prières et pas des deux
	 * autres. Une prière absente retombe sur l'heure du soleil.
	 */
	iqama?: Partial<Record<Prayer, LocalTime>>;
}

export type PrayerTimesLookup = (date: IsoDate) => PrayerDay | undefined;

export type OccurrenceStatus = 'scheduled' | 'cancelled' | 'moved_away' | 'moved_here';

export interface Occurrence {
	courseId: string;
	date: IsoDate;
	/** Heure de début, ou null quand l'heure de la prière d'ancrage est inconnue. */
	start: LocalTime | null;
	end: LocalTime | null;
	/**
	 * Nombre de jours entre `date` et le jour du début : 0 le jour même, 1 le lendemain. Vaut 1 pour
	 * un cours ancré sur une prière dont l'heure plus le décalage passe minuit ; la séance reste
	 * rattachée au jour de la prière.
	 */
	startDayOffset: number;
	/** Nombre de jours entre `date` et le jour de la fin : 0 le jour même, 1 le lendemain, 2 ensuite. */
	endDayOffset: number;
	anchor?: { prayer: Prayer; offsetMinutes: number };
	status: OccurrenceStatus;
	/** Pour `moved_here` : la date d'origine de la séance. */
	originalDate?: IsoDate;
	/** Pour `moved_away` : où la séance a été déplacée. */
	movedTo?: { date: IsoDate; start: LocalTime };
}

/** Plage de dates inclusive. */
export interface DateRange {
	from: IsoDate;
	to: IsoDate;
}

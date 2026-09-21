// Ce que l'espace des responsables lit, et comment il le donne à `@jadwal/core`.
//
// Une règle, et elle décide de tout le fichier : **aucun calcul de récurrence ici**. Les colonnes
// sont converties dans le modèle de l'étape 1, et c'est `expandOccurrences` qui répond. Refaire
// l'arithmétique dans l'interface, ce serait deux vérités au lieu d'une, et celle de l'écran serait
// la moins testée.
//
// Seconde règle : **un nombre fixe de requêtes**, quel que soit le nombre de cours. Cinq lectures
// pour tout l'écran d'accueil, jamais une par cours.

import {
	expandOccurrences,
	todayInZone,
	addDays,
	type CourseSchedule,
	type IsoDate,
	type LocalTime,
	type Occurrence,
	type Pause,
	type Prayer,
	type Recurrence,
	type SessionException,
	type Timing,
	type Weekday
} from '@jadwal/core';
import {
	COURSE_KINDS,
	COURSE_STATUSES,
	resolvedPrayerDaysQuery,
	sql,
	toPrayerTable,
	type ResolvedPrayerRow,
	type Transaction
} from '@jadwal/db';
import { appliquerVendredi, sessionsDuVendredi } from './vendredi.js';

export interface CourseRow {
	id: string;
	/**
	 * `course` ou `jumua`. Une session du vendredi passe par le même moteur qu'un cours ; seuls les
	 * écrans les séparent, et ils le font en le demandant (ADR 0033).
	 */
	kind: string;
	/** `jumua` : première, deuxième ou troisième session. Nul pour un cours. */
	jumua_order: number | null;
	status: string;
	audience: string;
	teaching_language: string[];
	room_id: string | null;
	teacher: string | null;
	source_language: string;
	recurrence_kind: string;
	recurrence_weekday: number[] | null;
	recurrence_interval: number | null;
	recurrence_anchor_date: string | null;
	recurrence_ordinal_weekday: number | null;
	recurrence_ordinal: number | null;
	/**
	 * `dates` : les dates listées, relues en `text[]`. Le pilote ne sait pas décoder un `date[]` —
	 * il rend la chaîne brute `{2026-09-12,…}` — alors qu'il décode parfaitement un `text[]`.
	 * Mesuré, pas supposé : sans ce détour, un cours à dates précises faisait échouer l'écran.
	 */
	recurrence_dates: string[] | null;
	timing_kind: string;
	timing_start: string | null;
	timing_end: string | null;
	timing_prayer: string | null;
	timing_offset_minutes: number | null;
	timing_duration_minutes: number | null;
	starts_on: string;
	ends_on: string | null;
	sequence: number;
	title: string;
	description: string | null;
	room: string | null;
}

export interface ExceptionRow {
	id: string;
	course_id: string;
	date: string;
	kind: string;
	to_date: string | null;
	to_start: string | null;
}

export interface PauseRow {
	id: string;
	course_id: string | null;
	from_date: string;
	to_date: string;
	reason: string | null;
}

export interface RoomRow {
	id: string;
	name: string;
	display_order: number;
}

export interface OrganisationSettings {
	id: string;
	slug: string;
	name: string;
	time_zone: string;
	accent_color: string;
	default_language: string;
	enabled_language: string[];
	greeting: string;
}

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

/** `HH:MM:SS` de PostgreSQL vers `HH:MM` de `@jadwal/core`. */
function localTime(value: string): LocalTime {
	return value.slice(0, 5) as LocalTime;
}

/** Une colonne `date` de PostgreSQL vers `IsoDate`. */
function isoDate(value: string): IsoDate {
	return value.slice(0, 10) as IsoDate;
}

/**
 * Les colonnes de rythme vers le modèle de l'étape 1. La contrainte de forme de la base garantit
 * déjà qu'une seule branche est renseignée ; ce code lit ce qui est là, il ne revalide pas.
 */
export function toRecurrence(row: CourseRow): Recurrence {
	if (row.recurrence_kind === 'weekly') {
		return {
			kind: 'weekly',
			weekdays: (row.recurrence_weekday ?? []).map((day) => day as Weekday),
			interval: (row.recurrence_interval ?? 1) as 1 | 2,
			anchorDate: isoDate(row.recurrence_anchor_date ?? row.starts_on)
		};
	}
	if (row.recurrence_kind === 'monthly') {
		return {
			kind: 'monthly',
			weekday: (row.recurrence_ordinal_weekday ?? 1) as Weekday,
			ordinal: (row.recurrence_ordinal ?? 1) as 1 | 2 | 3 | 4 | -1
		};
	}
	return { kind: 'dates', dates: (row.recurrence_dates ?? []).map(isoDate) };
}

export function toTiming(row: CourseRow): Timing {
	if (row.timing_kind === 'fixed') {
		return {
			kind: 'fixed',
			start: localTime(row.timing_start ?? '00:00'),
			end: localTime(row.timing_end ?? '00:00')
		};
	}
	return {
		kind: 'prayer',
		prayer: (row.timing_prayer ?? 'maghrib') as Prayer,
		offsetMinutes: row.timing_offset_minutes ?? 0,
		durationMinutes: row.timing_duration_minutes ?? 60
	};
}

export function toSchedule(row: CourseRow): CourseSchedule {
	const endsOn = row.ends_on ? { endsOn: isoDate(row.ends_on) } : {};
	return {
		id: row.id,
		recurrence: toRecurrence(row),
		timing: toTiming(row),
		startsOn: isoDate(row.starts_on),
		sequence: row.sequence,
		...endsOn
	};
}

export function toException(row: ExceptionRow): SessionException {
	if (row.kind === 'cancelled') {
		return { kind: 'cancelled', courseId: row.course_id, date: isoDate(row.date) };
	}
	return {
		kind: 'moved',
		courseId: row.course_id,
		date: isoDate(row.date),
		toDate: isoDate(row.to_date ?? row.date),
		toStart: localTime(row.to_start ?? '00:00')
	};
}

export function toPause(row: PauseRow): Pause {
	const course = row.course_id ? { courseId: row.course_id } : {};
	return { from: isoDate(row.from_date), to: isoDate(row.to_date), ...course };
}

/** Les réglages de l'organisation en contexte. Une requête. */
export async function readSettings(tx: Transaction): Promise<OrganisationSettings> {
	const found = rows<OrganisationSettings>(
		await tx.execute(sql`
			select "id", "slug", "name", "time_zone", "accent_color", "default_language",
				"enabled_language", "greeting"
			from "organization"
		`)
	)[0];
	if (!found) throw new Error('aucune organisation dans le contexte courant');
	return found;
}

/**
 * Les cours de l'organisation, avec le titre dans la langue source et le nom de la salle. Une
 * requête, quelle que soit la taille du programme : la jointure fait le travail, pas une boucle.
 *
 * `kinds` dit ce que l'appelant veut : les cours, les sessions du vendredi, ou les deux. Le défaut
 * est **les deux**, parce que c'est ce qu'attendent le programme, les flux et le cache — une
 * session du vendredi est une séance comme une autre. Les deux écrans qui les séparent le
 * demandent, et un test exige que la liste des cours n'en contienne aucune (ADR 0033).
 */
export async function readCourses(
	tx: Transaction,
	statuses: readonly string[] = ['draft', 'published'],
	kinds: readonly string[] = COURSE_KINDS
) {
	for (const kind of kinds) {
		if (!(COURSE_KINDS as readonly string[]).includes(kind)) {
			throw new Error(`unknown course kind ${JSON.stringify(kind)}`);
		}
	}
	// Liste écrite en littéral et non en paramètre : Drizzle développe un tableau JavaScript en
	// `($1, $2)`, ce qu'un `= any(...)` refuse. Les valeurs viennent d'une constante du code, jamais
	// d'une saisie, et l'appartenance à `COURSE_STATUSES` est vérifiée avant.
	for (const status of statuses) {
		if (!(COURSE_STATUSES as readonly string[]).includes(status)) {
			throw new Error(`unknown course status ${JSON.stringify(status)}`);
		}
	}
	const literal = statuses.map((status) => `'${status}'`).join(', ');
	const literalKinds = kinds.map((kind) => `'${kind}'`).join(', ');
	return rows<CourseRow>(
		await tx.execute(sql`
			select c.*, c."recurrence_date"::text[] as recurrence_dates,
				t."title", t."description", r."name" as room
			from "course" c
			left join "course_translation" t
				on t."course_id" = c."id" and t."language" = c."source_language"
			left join "room" r on r."id" = c."room_id"
			where c."status" in (${sql.raw(literal)}) and c."kind" in (${sql.raw(literalKinds)})
			order by c."jumua_order" nulls last, lower(coalesce(t."title", '')), c."created_at"
		`)
	);
}

export async function readExceptions(tx: Transaction, from: IsoDate, to: IsoDate) {
	return rows<ExceptionRow>(
		await tx.execute(sql`
			select "id", "course_id", "date"::text, "kind", "to_date"::text, "to_start"::text
			from "session_exception"
			where ("date" between ${from} and ${to}) or ("to_date" between ${from} and ${to})
			order by "date"
		`)
	);
}

export async function readPauses(tx: Transaction) {
	return rows<PauseRow>(
		await tx.execute(sql`
			select "id", "course_id", "from_date"::text, "to_date"::text, "reason"
			from "pause" order by "from_date"
		`)
	);
}

export async function readRooms(tx: Transaction) {
	return rows<RoomRow>(
		await tx.execute(
			sql`select "id", "name", "display_order" from "room" order by "display_order", "name"`
		)
	);
}

/**
 * Les heures de l'organisation sur une plage, **les trois sources résolues** : saisie à la main
 * d'abord, import ensuite, calcul en dernier, avec l'iqama de chaque prière quand elle existe
 * (ADR 0004, étape 8). La requête est celle de `@jadwal/db` — la priorité est écrite une fois, et
 * l'espace des responsables lit exactement ce que le public lit.
 */
export async function readPrayerDays(
	tx: Transaction,
	organizationId: string,
	from: IsoDate,
	to: IsoDate
) {
	return rows<ResolvedPrayerRow>(
		await tx.execute(resolvedPrayerDaysQuery(organizationId, from, to))
	);
}

export interface Seance extends Occurrence {
	title: string;
	room: string | null;
	teacher: string | null;
	audience: string;
}

export interface Programme {
	from: IsoDate;
	to: IsoDate;
	today: IsoDate;
	courses: CourseRow[];
	pauses: PauseRow[];
	seances: Seance[];
	settings: OrganisationSettings;
}

/**
 * Tout ce qu'il faut à l'écran d'accueil, en **cinq requêtes** : réglages, cours, exceptions,
 * pauses, heures de prière. Le calcul des séances est celui de `@jadwal/core`, jamais un autre.
 */
export async function readProgramme(
	tx: Transaction,
	now: Date,
	days: number,
	options: { statuses?: readonly string[] } = {}
): Promise<Programme> {
	const settings = await readSettings(tx);
	const today = todayInZone(settings.time_zone, now);
	const to = addDays(today, days - 1);
	const [courses, exceptions, pauses, prayerDays] = [
		await readCourses(tx, options.statuses),
		await readExceptions(tx, today, to),
		await readPauses(tx),
		await readPrayerDays(tx, settings.id, today, to)
	];
	// Même règle que côté public : le vendredi, l'iqama du Dhuhr est l'heure de la dernière session
	// (ADR 0033). Les brouillons de session comptent ici, puisque cet écran les montre.
	const prayerTable = appliquerVendredi(toPrayerTable(prayerDays), sessionsDuVendredi(courses));
	const byId = new Map(courses.map((course) => [course.id, course]));
	const occurrences = expandOccurrences({
		schedules: courses.map(toSchedule),
		exceptions: exceptions.map(toException),
		pauses: pauses.map(toPause),
		range: { from: today, to },
		prayerTimes: (date) => prayerTable.get(date)
	});
	const seances: Seance[] = occurrences.map((occurrence) => {
		const course = byId.get(occurrence.courseId);
		return {
			...occurrence,
			title: course?.title ?? 'Cours sans titre',
			room: course?.room ?? null,
			teacher: course?.teacher ?? null,
			audience: course?.audience ?? 'open'
		};
	});
	return { from: today, to, today, courses, pauses, seances, settings };
}

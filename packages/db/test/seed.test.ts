// Données de démonstration : le script est rejouable, et ce qu'il écrit se relit exactement comme
// le modèle de @jadwal/core. C'est la preuve que les colonnes de rythme et d'horaire portent bien
// ce que l'étape 1 attend, sans traduction ni perte.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import {
	expandOccurrences,
	type CourseSchedule,
	type IsoDate,
	type LocalTime,
	type Prayer,
	type PrayerDay,
	type Weekday
} from '@jadwal/core';
import { buildCalendar } from '@jadwal/core/ics';
import type { Database, DatabaseHandle } from '../src/index.js';
import { seed } from '../scripts/seed.mjs';
import { allRows, firstRow, openDatabase, organizationTables, withMaintenance } from './helpers.js';

let handle: DatabaseHandle;
let db: Database;

interface CourseRow {
	id: string;
	recurrence_kind: 'weekly' | 'monthly' | 'dates';
	recurrence_weekday: number[] | null;
	recurrence_interval: number | null;
	recurrence_anchor_date: string | null;
	recurrence_ordinal_weekday: number | null;
	recurrence_ordinal: number | null;
	recurrence_date: string[] | null;
	timing_kind: 'fixed' | 'prayer';
	timing_start: string | null;
	timing_end: string | null;
	timing_prayer: Prayer | null;
	timing_offset_minutes: number | null;
	timing_duration_minutes: number | null;
	starts_on: string;
	ends_on: string | null;
	sequence: number;
}

/** Reconstruit un `CourseSchedule` de @jadwal/core depuis une ligne de la table `course`. */
function toSchedule(row: CourseRow): CourseSchedule {
	const recurrence: CourseSchedule['recurrence'] =
		row.recurrence_kind === 'weekly'
			? {
					kind: 'weekly',
					weekdays: (row.recurrence_weekday ?? []) as Weekday[],
					interval: row.recurrence_interval as 1 | 2,
					anchorDate: row.recurrence_anchor_date as IsoDate
				}
			: row.recurrence_kind === 'monthly'
				? {
						kind: 'monthly',
						weekday: row.recurrence_ordinal_weekday as Weekday,
						ordinal: row.recurrence_ordinal as 1 | 2 | 3 | 4 | -1
					}
				: { kind: 'dates', dates: (row.recurrence_date ?? []) as IsoDate[] };
	const timing: CourseSchedule['timing'] =
		row.timing_kind === 'fixed'
			? {
					kind: 'fixed',
					start: toLocalTime(row.timing_start),
					end: toLocalTime(row.timing_end)
				}
			: {
					kind: 'prayer',
					prayer: row.timing_prayer as Prayer,
					offsetMinutes: row.timing_offset_minutes as number,
					durationMinutes: row.timing_duration_minutes as number
				};
	return {
		id: row.id,
		recurrence,
		timing,
		startsOn: row.starts_on as IsoDate,
		...(row.ends_on === null ? {} : { endsOn: row.ends_on as IsoDate }),
		sequence: row.sequence
	};
}

/** PostgreSQL rend une heure « HH:MM:SS » ; le modèle du cœur veut « HH:MM ». */
function toLocalTime(value: string | null): LocalTime {
	return (value ?? '').slice(0, 5) as LocalTime;
}

/**
 * Toute lecture du propriétaire passe par une transaction d'entretien : depuis l'étape 3 il est
 * soumis à la sécurité au niveau des lignes comme les autres, et hors de ce drapeau il ne verrait
 * rien (ADR 0019). C'est bien le propriétaire qui relit ici, puisque c'est lui qui a écrit.
 */
function ownerRead(query: SQL) {
	return withMaintenance(db, (tx) => tx.execute(query));
}

beforeAll(async () => {
	handle = openDatabase('owner');
	db = handle.db;
	await seed({ database: handle.settings.database });
});

afterAll(async () => {
	await handle?.close();
});

describe('données de démonstration', () => {
	it('writes one organisation, its rooms, its people and its courses', async () => {
		// Les autres fichiers de test peuplent la même base : un comptage de table entière resterait
		// vert avec des données de démonstration amputées. On compte donc chez « madretsch » seule,
		// et on exige les nombres exacts que le script écrit.
		expect(await demoCounts()).toEqual({
			membership: 2,
			room: 3,
			// Cinq cours et deux sessions du vendredi : `course` porte les deux (ADR 0033).
			course: 7,
			course_translation: 16,
			session_exception: 2,
			pause: 2,
			prayer_day: 4,
			// Une période d'horaires saisie à la main, sans date de fin, avec ses cinq iqamas.
			prayer_period: 1,
			prayer_settings: 1,
			// Les données de démonstration ne fabriquent aucune vue : un compteur se remplit en
			// étant lu, jamais en étant semé.
			page_view: 0,
			audit_log: 0,
			// Les données de démonstration n'ouvrent aucune invitation.
			invitation: 0
		});
	});

	it('carries the cancellation, the move and the pause the step asks for', async () => {
		const moved = allRows<{ date: string; to_date: string; to_start: string }>(
			await ownerRead(sql`
				select e.date, e.to_date, e.to_start from "session_exception" e
				join "organization" o on o.id = e.organization_id
				where o.slug = 'madretsch' and e.kind = 'moved'
			`)
		);
		expect(moved).toHaveLength(1);
		expect(moved[0]?.to_date).not.toBe(moved[0]?.date);
		expect(moved[0]?.to_start).toMatch(/^\d{2}:\d{2}:00$/);

		const cancelled = allRows<{ date: string }>(
			await ownerRead(sql`
				select e.date from "session_exception" e
				join "organization" o on o.id = e.organization_id
				where o.slug = 'madretsch' and e.kind = 'cancelled'
			`)
		);
		expect(cancelled).toHaveLength(1);

		// Une pause de toute l'organisation, et une pause d'un seul cours (ADR 0011).
		const pauses = allRows<{ course_id: string | null; from_date: string; to_date: string }>(
			await ownerRead(sql`
				select p.course_id, p.from_date, p.to_date from "pause" p
				join "organization" o on o.id = p.organization_id
				where o.slug = 'madretsch' order by p.from_date
			`)
		);
		expect(pauses).toHaveLength(2);
		expect(pauses.filter((row) => row.course_id === null)).toHaveLength(1);
		expect(pauses.filter((row) => row.course_id !== null)).toHaveLength(1);
		for (const pause of pauses) expect(pause.to_date > pause.from_date).toBe(true);
	});

	it('is idempotent: running it again restores every column it wrote', async () => {
		const before = await fingerprint();
		// Un comptage ne suffirait pas : le nombre de lignes reste le même quand une colonne a
		// changé. On abîme donc la démonstration à la main, sur des colonnes que le script pose
		// sans les nommer dans sa liste d'insertion, puis on exige qu'elles reviennent.
		await ownerRead(sql`update "organization" set "status" = 'suspended', "accent_color" = '#ff0000'
			where "slug" = 'madretsch'`);
		await ownerRead(sql`update "course" set "status" = 'archived', "sequence" = 7
			where "organization_id" = ${await demoOrganizationId()}`);
		await ownerRead(sql`update "prayer_settings"
			set "method" = 'Karachi', "madhab" = 'hanafi', "latitude" = 1, "longitude" = 1,
				"fajr_adjustment" = 33
			where "organization_id" = ${await demoOrganizationId()}`);
		await ownerRead(sql`update "prayer_day" set "source" = 'computed'
			where "organization_id" = ${await demoOrganizationId()}`);
		await ownerRead(sql`update "session_exception" set "created_by" = null
			where "organization_id" = ${await demoOrganizationId()}`);
		expect(await fingerprint()).not.toEqual(before);

		await seed({ database: handle.settings.database });
		expect(await fingerprint()).toEqual(before);
	});

	it('names no real person and uses only non-routable addresses', async () => {
		// Les autres fichiers de test partagent cette base : on ne regarde que les personnes de
		// l'organisation de démonstration.
		const people = allRows<{ email: string; name: string }>(
			await ownerRead(sql`
				select u.email, u.name from "user" u
				join "membership" m on m.user_id = u.id
				join "organization" o on o.id = m.organization_id
				where o.slug = 'madretsch'
			`)
		);
		expect(people.length).toBeGreaterThanOrEqual(2);
		for (const person of people) {
			// example.test est réservé par la RFC 2606 et ne peut pas être enregistré.
			expect(person.email, person.email).toMatch(/@[a-z.]*example\.test$/);
			expect(person.name, person.name).toContain('personne fictive');
		}
	});

	it('covers both timing kinds and several rhythms', async () => {
		const rows = await demoCourses();
		expect(new Set(rows.map((row) => row.timing_kind))).toEqual(new Set(['fixed', 'prayer']));
		expect(new Set(rows.map((row) => row.recurrence_kind))).toContain('weekly');
		expect(rows.some((row) => row.recurrence_kind === 'monthly')).toBe(true);
		expect(rows.some((row) => row.recurrence_interval === 2)).toBe(true);
		expect(rows.some((row) => (row.recurrence_weekday ?? []).length > 1)).toBe(true);
	});
});

describe('aller-retour avec le modèle de @jadwal/core', () => {
	it('expands the stored courses without any validation error', async () => {
		const rows = await demoCourses();
		const schedules = rows.map(toSchedule);
		const exceptions = allRows<{
			course_id: string;
			date: string;
			kind: 'cancelled' | 'moved';
			to_date: string | null;
			to_start: string | null;
		}>(await ownerRead(sql`select * from "session_exception"`)).map((row) =>
			row.kind === 'cancelled'
				? ({ kind: 'cancelled', courseId: row.course_id, date: row.date as IsoDate } as const)
				: ({
						kind: 'moved',
						courseId: row.course_id,
						date: row.date as IsoDate,
						toDate: row.to_date as IsoDate,
						toStart: toLocalTime(row.to_start)
					} as const)
		);
		const pauses = allRows<{ course_id: string | null; from_date: string; to_date: string }>(
			await ownerRead(sql`select course_id, from_date, to_date from "pause"`)
		).map((row) => ({
			from: row.from_date as IsoDate,
			to: row.to_date as IsoDate,
			...(row.course_id === null ? {} : { courseId: row.course_id })
		}));
		const prayerRows = allRows<{
			date: string;
			fajr: string;
			dhuhr: string;
			asr: string;
			maghrib: string;
			isha: string;
		}>(await ownerRead(sql`select * from "prayer_day"`));
		const prayerTimes = new Map<string, PrayerDay>(
			prayerRows.map((row) => [
				row.date,
				{
					date: row.date as IsoDate,
					fajr: toLocalTime(row.fajr),
					dhuhr: toLocalTime(row.dhuhr),
					asr: toLocalTime(row.asr),
					maghrib: toLocalTime(row.maghrib),
					isha: toLocalTime(row.isha)
				}
			])
		);

		const occurrences = expandOccurrences({
			schedules,
			exceptions,
			pauses,
			range: { from: '2026-09-01', to: '2026-09-30' },
			prayerTimes: (date) => prayerTimes.get(date)
		});
		expect(occurrences.length).toBeGreaterThan(10);
		// La séance annulée du 21 septembre est bien dans la sortie, avec son statut.
		expect(
			occurrences.some(
				(occurrence) => occurrence.date === '2026-09-21' && occurrence.status === 'cancelled'
			)
		).toBe(true);
		// Le cours ancré a une heure les jours où la table de prière est remplie.
		const anchored = occurrences.filter((occurrence) => occurrence.anchor !== undefined);
		expect(anchored.length).toBeGreaterThan(0);
		expect(anchored.some((occurrence) => occurrence.start !== null)).toBe(true);
	});

	it('builds a calendar feed from the stored data', async () => {
		const rows = await demoCourses();
		const titles = new Map(
			allRows<{ course_id: string; title: string }>(
				await ownerRead(
					sql`select course_id, title from "course_translation" where language = 'fr'`
				)
			).map((row) => [row.course_id, row.title])
		);
		const organisation = allRows<{ time_zone: string; name: string }>(
			await ownerRead(sql`select time_zone, name from "organization" limit 1`)
		)[0];
		const ics = buildCalendar({
			name: organisation?.name ?? 'Démonstration',
			timeZone: organisation?.time_zone ?? 'Europe/Zurich',
			now: new Date('2026-09-20T08:00:00Z'),
			uidHost: 'demo.jadwal.example',
			courses: rows.map((row) => ({
				schedule: toSchedule(row),
				title: titles.get(row.id) ?? 'Cours'
			})),
			anchorLabel: (prayer, offsetMinutes) => `${offsetMinutes} min après ${prayer}`
		});
		expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(ics).toContain('TZID:Europe/Zurich');
		expect(ics).toContain('SUMMARY:Arabe\\, niveau 1');
	});
});

/** Les cours de l'organisation de démonstration, sans ceux que les autres fichiers ont créés. */
async function demoCourses(): Promise<CourseRow[]> {
	return allRows<CourseRow>(
		await ownerRead(sql`
			select c.* from "course" c
			join "organization" o on o.id = c.organization_id
			where o.slug = 'madretsch' order by c.id
		`)
	);
}

/** Les lignes de la démonstration, table par table, sans celles des autres fichiers de test. */
async function demoCounts(): Promise<Record<string, number>> {
	const organizationId = await demoOrganizationId();
	const tables = await organizationTables(db);
	const entries: Array<readonly [string, number]> = [];
	for (const table of tables) {
		const row = firstRow<{ count: string }>(
			await ownerRead(sql`
				select count(*)::text as count from ${sql.identifier(table)} t
				where t."organization_id" = ${organizationId}
			`)
		);
		entries.push([table, Number(row?.count ?? '0')] as const);
	}
	return Object.fromEntries(entries);
}

/** L'organisation de démonstration. Les autres fichiers de test partagent cette base. */
async function demoOrganizationId(): Promise<string> {
	const rows = allRows<{ id: string }>(
		await ownerRead(sql`select "id" from "organization" where "slug" = 'madretsch'`)
	);
	expect(rows).toHaveLength(1);
	return rows[0]?.id ?? '';
}

/**
 * Empreinte du contenu de la démonstration : toutes les lignes de toutes les tables qui portent une
 * organisation, colonne par colonne, sans les horodatages techniques que le script remet à l'heure
 * à chaque passage. Un comptage passerait là où une colonne a changé sans que le nombre de lignes
 * bouge ; une empreinte, non.
 */
async function fingerprint(): Promise<Record<string, string[]>> {
	const organizationId = await demoOrganizationId();
	// `organization` se désigne par sa propre clé ; les dix autres portent `organization_id`.
	const tables: Array<readonly [string, ReturnType<typeof sql.identifier>]> = [
		['organization', sql.identifier('id')],
		...(await organizationTables(db)).map(
			(table) => [table, sql.identifier('organization_id')] as const
		)
	];
	const entries: Array<readonly [string, string[]]> = [];
	for (const [table, key] of tables) {
		const rows = allRows<{ line: string }>(
			await ownerRead(sql`
				select t::text as line from ${sql.identifier(table)} t
				where t.${key} = ${organizationId} order by t::text
			`)
		);
		entries.push([
			table,
			rows.map((row) => row.line.replaceAll(TIMESTAMP, '<horodatage>'))
		] as const);
	}
	expect(entries.length).toBeGreaterThanOrEqual(10);
	expect(entries.find(([table]) => table === 'organization')?.[1]).toHaveLength(1);
	return Object.fromEntries(entries);
}

/** Les horodatages bougent à chaque passage : ils ne disent rien de l'idempotence du contenu. */
const TIMESTAMP = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?\+\d{2}/g;

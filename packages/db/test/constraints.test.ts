// Contraintes de vérification : ce que la base refuse d'écrire, quel que soit le code appelant.
//
// Une contrainte de vérification n'écarte une ligne que si elle rend FALSE ; si elle rend NULL, la
// ligne passe. C'est le piège que ces tests surveillent : chaque cas ci-dessous est une ligne que
// `@jadwal/core` sait refuser et que la base doit refuser aussi. Les écritures passent par le rôle
// applicatif non privilégié partout où ses politiques le permettent.

import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, withOrg, type Database, type DatabaseHandle } from '../src/index.js';
import {
	countIn,
	firstRow,
	openDatabase,
	seedOrganisation,
	SQLSTATE,
	sqlStateOfFailure,
	type Organisation,
	withMaintenance
} from './helpers.js';

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let superAdminHandle: DatabaseHandle;
let owner: Database;
let app: Database;
let superAdmin: Database;
let org: Organisation;
let roomId: string;
let courseId: string;

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	superAdminHandle = openDatabase('superadmin');
	owner = ownerHandle.db;
	app = appHandle.db;
	superAdmin = superAdminHandle.db;
	org = await seedOrganisation(owner, 'contraintes');
	await withOrg(app, org.id, async (tx) => {
		const rooms = await tx.execute(sql`select "id" from "room" limit 1`);
		const courses = await tx.execute(sql`select "id" from "course" limit 1`);
		roomId = firstRow<{ id: string }>(rooms)?.id ?? '';
		courseId = firstRow<{ id: string }>(courses)?.id ?? '';
	});
	expect(roomId).not.toBe('');
	expect(courseId).not.toBe('');
});

afterAll(async () => {
	await appHandle?.close();
	await superAdminHandle?.close();
	await ownerHandle?.close();
});

/** Colonnes communes à tous les cours écrits ici, pour ne garder que ce qui change dans chaque cas. */
function course(columns: string, values: SQL) {
	return sql`insert into "course" (
		"id", "organization_id", "status", "audience", "source_language", "teaching_language",
		"starts_on", ${sql.raw(columns)}
	) values (
		${newId()}, ${org.id}, 'published', 'adults', 'fr', array['fr'], '2026-09-07', ${values}
	)`;
}

/** Rythme hebdomadaire valide, quand le cas porte sur l'horaire. */
const WEEKLY_COLUMNS =
	'"recurrence_kind", "recurrence_weekday", "recurrence_interval", "recurrence_anchor_date"';
const WEEKLY_VALUES = sql`'weekly', array[1]::smallint[], 1, '2026-09-07'`;

/** Horaire fixe valide, quand le cas porte sur le rythme. */
const FIXED_COLUMNS = '"timing_kind", "timing_start", "timing_end"';
const FIXED_VALUES = sql`'fixed', '19:00', '20:30'`;

describe('forme du rythme et de l’horaire d’un cours', () => {
	const cases: Array<[string, string, SQL]> = [
		[
			'un ancrage sur une prière sans prière, sans décalage et sans durée',
			`${WEEKLY_COLUMNS}, "timing_kind"`,
			sql`${WEEKLY_VALUES}, 'prayer'`
		],
		[
			'un ancrage sur une prière inconnue',
			`${WEEKLY_COLUMNS}, "timing_kind", "timing_prayer", "timing_offset_minutes", "timing_duration_minutes"`,
			sql`${WEEKLY_VALUES}, 'prayer', 'tahajjud', 0, 60`
		],
		[
			'un décalage au-delà de la borne haute',
			`${WEEKLY_COLUMNS}, "timing_kind", "timing_prayer", "timing_offset_minutes", "timing_duration_minutes"`,
			sql`${WEEKLY_VALUES}, 'prayer', 'isha', 241, 60`
		],
		[
			'un décalage en deçà de la borne basse',
			`${WEEKLY_COLUMNS}, "timing_kind", "timing_prayer", "timing_offset_minutes", "timing_duration_minutes"`,
			sql`${WEEKLY_VALUES}, 'prayer', 'isha', -121, 60`
		],
		[
			'une durée trop courte',
			`${WEEKLY_COLUMNS}, "timing_kind", "timing_prayer", "timing_offset_minutes", "timing_duration_minutes"`,
			sql`${WEEKLY_VALUES}, 'prayer', 'isha', 0, 4`
		],
		[
			'une durée au-delà de la journée',
			`${WEEKLY_COLUMNS}, "timing_kind", "timing_prayer", "timing_offset_minutes", "timing_duration_minutes"`,
			sql`${WEEKLY_VALUES}, 'prayer', 'isha', 0, 1441`
		],
		[
			'un horaire fixe qui porte en plus une prière',
			`${WEEKLY_COLUMNS}, "timing_kind", "timing_start", "timing_end", "timing_prayer"`,
			sql`${WEEKLY_VALUES}, 'fixed', '19:00', '20:30', 'isha'`
		],
		[
			'une heure avec une fraction de seconde',
			`${WEEKLY_COLUMNS}, "timing_kind", "timing_start", "timing_end"`,
			sql`${WEEKLY_VALUES}, 'fixed', '19:00:00.5', '20:30'`
		],
		[
			'une heure de fin à vingt-quatre heures',
			`${WEEKLY_COLUMNS}, "timing_kind", "timing_start", "timing_end"`,
			sql`${WEEKLY_VALUES}, 'fixed', '19:00', '24:00:00'`
		],
		[
			'un rythme mensuel sans rang ni jour de semaine',
			`"recurrence_kind", ${FIXED_COLUMNS}`,
			sql`'monthly', ${FIXED_VALUES}`
		],
		[
			'un rythme mensuel dont le rang n’existe pas',
			`"recurrence_kind", "recurrence_ordinal_weekday", "recurrence_ordinal", ${FIXED_COLUMNS}`,
			sql`'monthly', 1, 5, ${FIXED_VALUES}`
		],
		[
			'un rythme hebdomadaire sans intervalle',
			`"recurrence_kind", "recurrence_weekday", "recurrence_anchor_date", ${FIXED_COLUMNS}`,
			sql`'weekly', array[1]::smallint[], '2026-09-07', ${FIXED_VALUES}`
		],
		[
			'un rythme hebdomadaire une semaine sur trois',
			`"recurrence_kind", "recurrence_weekday", "recurrence_interval", "recurrence_anchor_date", ${FIXED_COLUMNS}`,
			sql`'weekly', array[1]::smallint[], 3, '2026-09-07', ${FIXED_VALUES}`
		],
		[
			'une liste de jours vide',
			`"recurrence_kind", "recurrence_weekday", "recurrence_interval", "recurrence_anchor_date", ${FIXED_COLUMNS}`,
			sql`'weekly', array[]::smallint[], 1, '2026-09-07', ${FIXED_VALUES}`
		],
		[
			'un jour de semaine hors de un à sept',
			`"recurrence_kind", "recurrence_weekday", "recurrence_interval", "recurrence_anchor_date", ${FIXED_COLUMNS}`,
			sql`'weekly', array[8]::smallint[], 1, '2026-09-07', ${FIXED_VALUES}`
		],
		[
			'un jour de semaine répété',
			`"recurrence_kind", "recurrence_weekday", "recurrence_interval", "recurrence_anchor_date", ${FIXED_COLUMNS}`,
			sql`'weekly', array[1,1]::smallint[], 1, '2026-09-07', ${FIXED_VALUES}`
		],
		[
			'une liste de dates vide',
			`"recurrence_kind", "recurrence_date", ${FIXED_COLUMNS}`,
			sql`'dates', array[]::date[], ${FIXED_VALUES}`
		],
		[
			'une date répétée',
			`"recurrence_kind", "recurrence_date", ${FIXED_COLUMNS}`,
			sql`'dates', array['2026-09-07','2026-09-07']::date[], ${FIXED_VALUES}`
		],
		[
			'un rythme par dates qui porte en plus un intervalle',
			`"recurrence_kind", "recurrence_date", "recurrence_interval", ${FIXED_COLUMNS}`,
			sql`'dates', array['2026-09-07']::date[], 1, ${FIXED_VALUES}`
		]
	];

	for (const [name, columns, values] of cases) {
		it(`refuses ${name}`, async () => {
			// L'échec avorte la transaction : c'est `withOrg` tout entier qui lève, et le code
			// SQLSTATE se lit sur l'erreur qui en sort.
			const state = await sqlStateOfFailure(() =>
				withOrg(app, org.id, (tx) => tx.execute(course(columns, values)))
			);
			expect(state).toBe(SQLSTATE.checkViolation);
		});
	}

	it('accepts the two valid shapes', async () => {
		await withOrg(app, org.id, async (tx) => {
			await tx.execute(
				course(`${WEEKLY_COLUMNS}, ${FIXED_COLUMNS}`, sql`${WEEKLY_VALUES}, ${FIXED_VALUES}`)
			);
			await tx.execute(
				course(
					`"recurrence_kind", "recurrence_ordinal_weekday", "recurrence_ordinal", "timing_kind", "timing_prayer", "timing_offset_minutes", "timing_duration_minutes"`,
					sql`'monthly', 6, -1, 'prayer', 'isha', 15, 90`
				)
			);
		});
	});
});

describe('autres contraintes du schéma', () => {
	it('refuses a primary key that is not a version 7 UUID', async () => {
		const state = await sqlStateOfFailure(() =>
			withOrg(app, org.id, (tx) =>
				tx.execute(sql`
					insert into "room" ("id", "organization_id", "name")
					values ('0195e1a0-0000-4000-8000-000000000000', ${org.id}, 'Salle v4')
				`)
			)
		);
		expect(state).toBe(SQLSTATE.checkViolation);
	});

	it('refuses a status, an audience and a role outside their list', async () => {
		const statements = [
			sql`update "course" set "status" = 'hidden' where "id" = ${courseId}`,
			sql`update "course" set "audience" = 'seniors' where "id" = ${courseId}`
		];
		for (const statement of statements) {
			const state = await sqlStateOfFailure(() =>
				withOrg(app, org.id, (tx) => tx.execute(statement))
			);
			expect(state).toBe(SQLSTATE.checkViolation);
		}

		// Le rôle applicatif n'écrit plus dans `membership` : attacher une personne relève du flux
		// d'invitation (ADR 0013). La contrainte se vérifie donc depuis le propriétaire.
		const role = await sqlStateOfFailure(() =>
			withMaintenance(owner, (tx) =>
				tx.execute(sql`
					insert into "membership" ("id", "organization_id", "user_id", "role")
					values (${newId()}, ${org.id}, ${org.userId}, 'owner')
				`)
			)
		);
		expect(role).toBe(SQLSTATE.checkViolation);
	});

	it('refuses a course with no teaching language at all', async () => {
		const state = await sqlStateOfFailure(() =>
			withOrg(app, org.id, (tx) =>
				tx.execute(
					sql`update "course" set "teaching_language" = array[]::text[] where "id" = ${courseId}`
				)
			)
		);
		expect(state).toBe(SQLSTATE.checkViolation);
	});

	it('refuses an end date before the start date, and a pause that runs backwards', async () => {
		const statements = [
			sql`update "course" set "ends_on" = '2026-09-06' where "id" = ${courseId}`,
			sql`insert into "pause" ("id", "organization_id", "from_date", "to_date")
				values (${newId()}, ${org.id}, '2027-01-03', '2026-12-21')`
		];
		for (const statement of statements) {
			const state = await sqlStateOfFailure(() =>
				withOrg(app, org.id, (tx) => tx.execute(statement))
			);
			expect(state).toBe(SQLSTATE.checkViolation);
		}
	});

	it('refuses an exception whose shape does not match its kind', async () => {
		const statements = [
			sql`insert into "session_exception" ("id", "organization_id", "course_id", "date", "kind", "to_date")
				values (${newId()}, ${org.id}, ${courseId}, '2026-10-05', 'cancelled', '2026-10-06')`,
			sql`insert into "session_exception" ("id", "organization_id", "course_id", "date", "kind", "to_date")
				values (${newId()}, ${org.id}, ${courseId}, '2026-10-12', 'moved', '2026-10-13')`,
			sql`insert into "session_exception" ("id", "organization_id", "course_id", "date", "kind", "to_date", "to_start")
				values (${newId()}, ${org.id}, ${courseId}, '2026-10-19', 'moved', '2026-10-20', '24:00:00')`
		];
		for (const statement of statements) {
			const state = await sqlStateOfFailure(() =>
				withOrg(app, org.id, (tx) => tx.execute(statement))
			);
			expect(state).toBe(SQLSTATE.checkViolation);
		}
	});

	it('refuses a blank title, a blank action and an adjustment beyond two hours', async () => {
		const statements = [
			sql`insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
				values (${newId()}, ${org.id}, ${courseId}, 'de', '   ')`,
			sql`insert into "audit_log" ("id", "organization_id", "action", "target_table")
				values (${newId()}, ${org.id}, '  ', 'course')`,
			sql`update "prayer_settings" set "fajr_adjustment" = 121 where "organization_id" = ${org.id}`
		];
		for (const statement of statements) {
			const state = await sqlStateOfFailure(() =>
				withOrg(app, org.id, (tx) => tx.execute(statement))
			);
			expect(state).toBe(SQLSTATE.checkViolation);
		}
	});

	it('refuses a prayer time that carries seconds', async () => {
		const state = await sqlStateOfFailure(() =>
			withOrg(app, org.id, (tx) =>
				tx.execute(
					sql`update "prayer_day" set "fajr" = '05:40:30' where "organization_id" = ${org.id}`
				)
			)
		);
		expect(state).toBe(SQLSTATE.checkViolation);
	});

	it('refuses an organisation whose languages are empty, absent or unusable', async () => {
		const values: Array<SQL> = [
			// Liste vide : `array_length` rend NULL, pas zéro.
			sql`'fr', array[]::text[]`,
			// Langue par défaut hors de la liste.
			sql`'fr', array['de']`,
			// Valeur absente dans la liste : la comparaison rend NULL, pas FALSE.
			sql`'fr', array['de', null]`
		];
		for (const value of values) {
			const state = await sqlStateOfFailure(() =>
				superAdmin.execute(sql`
					insert into "organization" ("id", "slug", "name", "time_zone", "default_language", "enabled_language")
					values (${newId()}, ${`refus-${newId().slice(0, 8)}`}, 'Refus', 'Europe/Zurich', ${value})
				`)
			);
			expect(state).toBe(SQLSTATE.checkViolation);
		}
	});

	it('refuses a slug, an accent colour and an email that do not have the expected shape', async () => {
		const state = await sqlStateOfFailure(() =>
			superAdmin.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language", "enabled_language")
				values (${newId()}, 'Slug Majuscule', 'Refus', 'Europe/Zurich', 'fr', array['fr'])
			`)
		);
		expect(state).toBe(SQLSTATE.checkViolation);

		const colour = await sqlStateOfFailure(() =>
			withOrg(app, org.id, (tx) =>
				tx.execute(
					sql`update "organization" set "accent_color" = 'turquoise' where "id" = ${org.id}`
				)
			)
		);
		expect(colour).toBe(SQLSTATE.checkViolation);

		// `user` n'est écrite ni par le rôle applicatif ni par le super-admin : aucune politique
		// d'insertion ne les vise (ADR 0013). Le propriétaire porte donc ce cas.
		const email = await sqlStateOfFailure(() =>
			withMaintenance(owner, (tx) =>
				tx.execute(sql`insert into "user" ("id", "email") values (${newId()}, 'pas-une-adresse')`)
			)
		);
		expect(email).toBe(SQLSTATE.checkViolation);
	});
});

describe('suppression d’une organisation', () => {
	it('takes everything that belongs to it with it, and nothing else', async () => {
		const doomed = await seedOrganisation(owner, 'a-supprimer');
		const kept = await seedOrganisation(owner, 'a-garder');
		const tables = [
			'membership',
			'room',
			'course',
			'course_translation',
			'session_exception',
			'pause',
			'prayer_day',
			'prayer_settings',
			'audit_log',
			'invitation'
		];

		const before = await withOrg(app, doomed.id, async (tx) => {
			const counts: Record<string, number> = {};
			for (const table of tables) counts[table] = await countIn(tx, table);
			return counts;
		});
		// Sans cette garde, la suite prouverait que supprimer rien ne laisse rien.
		expect(Object.values(before).every((count) => count > 0)).toBe(true);

		await superAdmin.execute(sql`delete from "organization" where "id" = ${doomed.id}`);

		for (const table of tables) {
			const rows = await withMaintenance(owner, (tx) =>
				tx.execute<{ count: string }>(sql`
					select count(*)::text as count from ${sql.identifier(table)}
					where "organization_id" = ${doomed.id}
				`)
			);
			expect(Number(firstRow<{ count: string }>(rows)?.count), table).toBe(0);
		}

		// L'utilisateur n'appartient à aucune organisation : il survit, son adhésion non.
		const survivor = await withMaintenance(owner, (tx) =>
			tx.execute<{ count: string }>(
				sql`select count(*)::text as count from "user" where "id" = ${doomed.userId}`
			)
		);
		expect(Number(firstRow<{ count: string }>(survivor)?.count)).toBe(1);

		const untouched = await withOrg(app, kept.id, (tx) => countIn(tx, 'course'));
		expect(untouched).toBeGreaterThan(0);
	});
});

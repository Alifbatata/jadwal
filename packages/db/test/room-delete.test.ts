// Supprimer une salle qu'un cours occupe (migration 0061).
//
// Un cours désigne sa salle par une clé étrangère composite, (salle, organisation), parce que les
// vérifications de clé contournent la sécurité au niveau des lignes : sans l'organisation dans la
// clé, un cours pourrait désigner la salle d'une autre organisation (ADR 0013). Cette clé vidait les
// deux colonnes quand la salle disparaissait, et l'organisation d'un cours ne peut pas être vide :
// la suppression échouait, et l'écran des réglages rendait une erreur 500. Depuis la migration 0061,
// seule la salle se vide. Le cours garde son organisation, et tout le reste.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, withOrg, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
	asAdmin,
	firstRow,
	openDatabase,
	seedOrganisation,
	SQLSTATE,
	sqlStateOfFailure,
	withMaintenance,
	type Organisation
} from './helpers.js';

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let superAdminHandle: DatabaseHandle;
let owner: Database;
let app: Database;
let superAdmin: Database;
let a: Organisation;
let b: Organisation;

/** Un cours tel que le propriétaire le relève : la salle à part, tout le reste en un bloc. */
interface StoredCourse {
	id: string;
	organization_id: string;
	room_id: string | null;
	rest: Record<string, unknown>;
}

async function coursesOf(organizationId: string): Promise<StoredCourse[]> {
	return allRows<StoredCourse>(
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				select c."id", c."organization_id", c."room_id", to_jsonb(c) - 'room_id' as rest
				from "course" c where c."organization_id" = ${organizationId}
				order by c."id"
			`)
		)
	);
}

async function roomOf(organizationId: string): Promise<string> {
	const row = firstRow<{ id: string }>(
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`select "id" from "room" where "organization_id" = ${organizationId}`)
		)
	);
	return String(row?.id);
}

/** Une salle de plus dans l'organisation, et un cours de plus qui l'occupe. */
async function roomWithCourse(organizationId: string, name: string): Promise<string> {
	const roomId = newId();
	const courseId = newId();
	await withMaintenance(owner, async (tx) => {
		await tx.execute(sql`
			insert into "room" ("id", "organization_id", "name", "display_order")
			values (${roomId}, ${organizationId}, ${name}, 2)
		`);
		await tx.execute(sql`
			insert into "course" (
				"id", "organization_id", "status", "audience", "teaching_language", "room_id",
				"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
				"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "starts_on"
			) values (
				${courseId}, ${organizationId}, 'draft', 'kids', array['fr'], ${roomId},
				'fr', 'weekly', array[3]::smallint[], 1, '2026-09-09', 'fixed', '14:00', '15:30',
				'2026-09-09'
			)
		`);
	});
	return roomId;
}

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	superAdminHandle = openDatabase('superadmin');
	owner = ownerHandle.db;
	app = appHandle.db;
	superAdmin = superAdminHandle.db;
	a = await seedOrganisation(owner, 'salle-occupee-a');
	b = await seedOrganisation(owner, 'salle-occupee-b');
});

afterAll(async () => {
	await superAdminHandle?.close();
	await appHandle?.close();
	await ownerHandle?.close();
});

describe('supprimer une salle qu’un cours occupe', () => {
	it('lets the responsible person do it: the course keeps its organisation and loses only the room', async () => {
		const occupied = await roomOf(a.id);
		const other = await roomWithCourse(a.id, 'Salle qui reste');
		const before = await coursesOf(a.id);
		expect(before.filter((course) => course.room_id === occupied)).toHaveLength(1);
		const theirsBefore = await coursesOf(b.id);

		// L'instruction de l'écran des réglages, sous le contexte qu'il pose.
		const deleted = allRows(
			await withOrg(app, asAdmin(a), (tx) =>
				tx.execute(sql`delete from "room" where "id" = ${occupied} returning "id"`)
			)
		);
		expect(deleted).toEqual([{ id: occupied }]);

		const after = await coursesOf(a.id);
		expect(after).toEqual(
			before.map((course) => ({
				...course,
				room_id: course.room_id === occupied ? null : course.room_id
			}))
		);
		expect(after.map((course) => course.room_id).sort()).toEqual([null, other].sort());
		// Rien ne bouge dans l'organisation voisine.
		expect(await coursesOf(b.id)).toEqual(theirsBefore);
	});

	it('lets the super-admin do it too, in the organisation where he entered', async () => {
		const occupied = await roomWithCourse(b.id, 'Salle du super-admin');
		const before = await coursesOf(b.id);
		const deleted = allRows(
			await withOrg(superAdmin, b.id, (tx) =>
				tx.execute(sql`delete from "room" where "id" = ${occupied} returning "id"`)
			)
		);
		expect(deleted).toEqual([{ id: occupied }]);
		expect(await coursesOf(b.id)).toEqual(
			before.map((course) => ({
				...course,
				room_id: course.room_id === occupied ? null : course.room_id
			}))
		);
	});

	it('keeps the key composite: a course still cannot take the room of another organisation', async () => {
		const theirs = await roomOf(b.id);
		const course = (await coursesOf(a.id))[0];
		expect(course).toBeDefined();
		const state = await sqlStateOfFailure(() =>
			withOrg(app, asAdmin(a), (tx) =>
				tx.execute(sql`update "course" set "room_id" = ${theirs} where "id" = ${course?.id}`)
			)
		);
		expect(state).toBe(SQLSTATE.foreignKeyViolation);
		const definition = firstRow<{ definition: string }>(
			await owner.execute(sql`
				select pg_get_constraintdef(oid) as definition from pg_constraint
				where conrelid = 'public.course'::regclass and conname = 'course_room_fk'
			`)
		);
		expect(definition?.definition).toBe(
			'FOREIGN KEY (room_id, organization_id) REFERENCES room(id, organization_id) ON DELETE SET NULL (room_id)'
		);
	});
});

describe('toutes les clés du schéma', () => {
	it('never empty a column that cannot be empty', async () => {
		// Le défaut de la salle, cherché partout : une clé qui vide la référence quand la ligne visée
		// disparaît (SET NULL), sans liste de colonnes, vide toutes ses colonnes. Si l'une d'elles ne
		// peut pas être vide, la suppression échoue. Le catalogue est lu tel quel : une clé ajoutée
		// plus tard est relue sans qu'on la nomme.
		const keys = allRows<{ key: string; emptied: string[]; not_null: string[] }>(
			await owner.execute(sql`
				select con.conrelid::regclass::text || '.' || con.conname as key,
					array_agg(a.attname::text order by a.attnum) as emptied,
					coalesce(array_agg(a.attname::text order by a.attnum) filter (where a.attnotnull),
						'{}') as not_null
				from pg_constraint con
				join pg_namespace n on n.oid = con.connamespace
				join pg_attribute a on a.attrelid = con.conrelid
					and a.attnum = any (coalesce(con.confdelsetcols, con.conkey))
				where n.nspname = 'public' and con.contype = 'f' and con.confdeltype = 'n'
				group by con.conrelid, con.conname
				order by 1
			`)
		);
		// Le relevé ne passe pas à vide : il voit au moins la clé de la salle.
		expect(keys.map((row) => row.key)).toContain('course.course_room_fk');
		expect(keys.filter((row) => row.not_null.length > 0)).toEqual([]);
		expect(keys.find((row) => row.key === 'course.course_room_fk')?.emptied).toEqual(['room_id']);
	});
});

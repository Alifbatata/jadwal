// Les états d'un cours : brouillon et publié, et rien d'autre (étape 19, migration 0067).
//
// Jusqu'ici, la base connaissait un troisième état, « archivé », qu'aucun écran ne posait. Le
// formulaire d'un cours ne le connaissait pas : enregistrer un cours archivé le repassait en
// brouillon sans le dire. L'état disparaît du modèle, et la migration ramène d'abord en brouillon
// toute ligne qui le portait encore, sous le drapeau d'entretien du propriétaire (ADR 0019).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COURSE_STATUSES } from '../src/schema/index.js';
import { withOrg, type Database, type DatabaseHandle } from '../src/index.js';
import {
	asAdmin,
	firstRow,
	messageOfFailure,
	openDatabase,
	seedOrganisation,
	SQLSTATE,
	sqlStateOfFailure,
	type Organisation
} from './helpers.js';

const migration = join(
	dirname(dirname(fileURLToPath(import.meta.url))),
	'migrations',
	'0067_course_without_archived.sql'
);
/** Le message qui signale qu'une tentative a passé, et qu'on l'a annulée soi-même. */
const ROLLED_BACK = 'tentative passée, annulée par le test';

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let owner: Database;
let app: Database;
let org: Organisation;
let courseId: string;

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	owner = ownerHandle.db;
	app = appHandle.db;
	org = await seedOrganisation(owner, 'etats-du-cours');
	courseId = String(
		firstRow<{ id: string }>(
			await withOrg(app, asAdmin(org), (tx) => tx.execute(sql`select "id" from "course"`))
		)?.id
	);
});

afterAll(async () => {
	await appHandle?.close();
	await ownerHandle?.close();
});

describe('les états d’un cours', () => {
	it('knows two states, draft and published', () => {
		expect(COURSE_STATUSES).toEqual(['draft', 'published']);
	});

	it('refuses the archived state, in a new course as in an existing one', async () => {
		const archive = sql`update "course" set "status" = 'archived' where "id" = ${courseId}`;
		expect(
			await sqlStateOfFailure(() => withOrg(app, asAdmin(org), (tx) => tx.execute(archive)))
		).toBe(SQLSTATE.checkViolation);
		const copy = sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"source_language", "recurrence_kind", "recurrence_date", "timing_kind", "timing_start",
				"timing_end", "starts_on")
			values ('01930000-0000-7000-8000-00000000a001', ${org.id}, 'archived', 'adults',
				array['fr'], 'fr', 'dates', array['2026-10-01']::date[], 'fixed', '18:00', '19:00',
				'2026-10-01')
		`;
		expect(
			await sqlStateOfFailure(() => withOrg(app, asAdmin(org), (tx) => tx.execute(copy)))
		).toBe(SQLSTATE.checkViolation);
	});

	it('brings an archived course back to draft, under the maintenance flag, before closing the state', async () => {
		// L'état d'avant la migration, rejoué dans une transaction annulée à la fin : la contrainte
		// de l'étape 18, et un cours archivé. Le drapeau est coupé avant la migration : c'est à
		// elle de le poser, sans quoi sa mise à jour ne toucherait aucune ligne (ADR 0019).
		const statements = readFileSync(migration, 'utf8')
			.split('--> statement-breakpoint')
			.map((text) => text.trim())
			.filter((text) => text.replace(/^--.*$/gm, '').trim().length > 0);
		const message = await messageOfFailure(() =>
			owner.transaction(async (tx) => {
				await tx.execute(sql`alter table "course" drop constraint "course_status_ck"`);
				await tx.execute(sql`
					alter table "course" add constraint "course_status_ck"
					check (("status" in ('draft', 'published', 'archived')) is true)
				`);
				await tx.execute(sql`select set_config('jadwal.maintenance', 'on', true)`);
				await tx.execute(sql`update "course" set "status" = 'archived' where "id" = ${courseId}`);
				await tx.execute(sql`select set_config('jadwal.maintenance', 'off', true)`);
				for (const statement of statements) await tx.execute(sql.raw(statement));
				// La migration rend le drapeau coupé, comme elle l'a trouvé : les migrations suivantes
				// du même lot tournent dans la même transaction.
				const flag = firstRow<{ on: boolean }>(
					await tx.execute(sql`select jadwal.maintenance() as on`)
				);
				expect(flag?.on).toBe(false);
				// Relu sous le drapeau : hors de lui, le propriétaire ne voit rien.
				await tx.execute(sql`select set_config('jadwal.maintenance', 'on', true)`);
				const row = firstRow<{ status: string }>(
					await tx.execute(sql`select "status" from "course" where "id" = ${courseId}`)
				);
				expect(row?.status).toBe('draft');
				throw new Error(ROLLED_BACK);
			})
		);
		expect(message).toBe(ROLLED_BACK);
	});
});

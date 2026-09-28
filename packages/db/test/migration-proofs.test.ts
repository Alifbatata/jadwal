// Les preuves des migrations 0073, 0074 et 0075 voient un état affaibli (étape 20, relecture du
// chantier 1).
//
// Chaque migration écrite à la main finit par un bloc `DO $verifie$` qui lève si l'état n'est pas
// exactement celui qu'elle annonce. Une preuve qui ne lit que des fragments laisse passer une règle
// qui ne demande plus rien : `or true` dans une branche, des secondes non bornées, une seconde
// politique de suppression qui s'ajoute à la première. Chaque essai pose un tel état, joue le bloc
// du fichier tel qu'il est, et attend son refus ; puis le même bloc passe sur l'état que la
// migration laisse. Tout se joue sous le propriétaire, dans une transaction annulée à la fin : la
// base de test n'en garde rien.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database, DatabaseHandle, Transaction } from '../src/index.js';
import { openDatabase, sqlStateOf } from './helpers.js';

const migrationsDir = join(dirname(dirname(fileURLToPath(import.meta.url))), 'migrations');

let ownerHandle: DatabaseHandle;
let owner: Database;

beforeAll(() => {
	ownerHandle = openDatabase('owner');
	owner = ownerHandle.db;
});

afterAll(async () => {
	await ownerHandle?.close();
});

/** Le bloc de preuve d'un fichier de migration, tel que Drizzle l'envoie. */
function preuve(tag: string): string {
	const bloc = readFileSync(join(migrationsDir, `${tag}.sql`), 'utf8')
		.split('--> statement-breakpoint')
		.map((text) => text.trim())
		.find((text) =>
			text
				.replace(/^--.*$/gm, '')
				.trim()
				.startsWith('DO $verifie$')
		);
	if (!bloc) throw new Error(`${tag} : pas de bloc $verifie$`);
	return bloc;
}

/** L'erreur qui annule une transaction d'essai, une fois le résultat lu. */
class Annulee extends Error {}

/**
 * Pose `etat` dans une transaction du propriétaire, joue la preuve de `tag` dans un point de
 * sauvegarde, puis annule tout. Rend le refus de la preuve, ou `null` si elle passe.
 */
async function refusDeLaPreuve(
	tag: string,
	etat: readonly string[]
): Promise<{ code: string | undefined; message: string } | null> {
	let refus: { code: string | undefined; message: string } | null | undefined;
	try {
		await owner.transaction(async (tx: Transaction) => {
			for (const instruction of etat) await tx.execute(sql.raw(instruction));
			try {
				await tx.transaction((point) => point.execute(sql.raw(preuve(tag))));
				refus = null;
			} catch (error) {
				let cause: unknown = error;
				while (cause instanceof Error && typeof (cause as { code?: unknown }).code !== 'string') {
					cause = (cause as { cause?: unknown }).cause;
				}
				refus = {
					code: sqlStateOf(error),
					message: cause instanceof Error ? cause.message : String(error)
				};
			}
			throw new Annulee();
		});
	} catch (error) {
		if (!(error instanceof Annulee)) throw error;
	}
	if (refus === undefined) throw new Error('essai sans résultat');
	return refus;
}

describe('la preuve de la migration 0075 (forme d’une exception)', () => {
	const TAG = '0075_session_exception_cancelled_where_moved';

	/** La contrainte de forme, écrite par branche : chacune remplace celle du fichier. */
	const forme = (annulation: string, deplacement: string) => [
		`alter table "session_exception" drop constraint "session_exception_shape_ck"`,
		`alter table "session_exception" add constraint "session_exception_shape_ck" check ((case "kind"
			when 'cancelled' then ${annulation}
			when 'moved' then ${deplacement}
			else false end) is true)`
	];
	const RIEN = `("to_date" is null and "to_start" is null)`;
	const ARRIVEE = `("to_date" is not null and "to_start" is not null
		and "to_start" < time '24:00:00' and extract(second from "to_start") = 0)`;
	const SECONDES_LIBRES = `("to_date" is not null and "to_start" is not null
		and "to_start" < time '24:00:00' and extract(second from "to_start") >= 0)`;

	it('passes on the state the migration leaves', async () => {
		expect(await refusDeLaPreuve(TAG, [])).toBeNull();
	});

	it.each([
		['the form of migration 0003, a cancellation without arrival only', forme(RIEN, ARRIVEE)],
		[
			'a cancellation that takes anything (or true)',
			forme(`${RIEN} or ${ARRIVEE} or true`, ARRIVEE)
		],
		['a move that takes anything (or true)', forme(`${RIEN} or ${ARRIVEE}`, `${ARRIVEE} or true`)],
		[
			'seconds left unbounded in both branches',
			forme(`${RIEN} or ${SECONDES_LIBRES}`, SECONDES_LIBRES)
		]
	])('refuses %s', async (_cas, etat) => {
		expect(await refusDeLaPreuve(TAG, etat)).toEqual({
			code: 'P0001',
			message: expect.stringMatching(/^session_exception_shape_ck : n'a pas la forme annoncée/)
		});
	});
});

describe('la preuve de la migration 0074 (une lettre dans l’adresse publique)', () => {
	const TAG = '0074_organization_slug_letter';
	const regle = (condition: string) => [
		`alter table "organization" drop constraint "organization_slug_letter_ck"`,
		`alter table "organization" add constraint "organization_slug_letter_ck" check (${condition})`
	];

	it('passes on the state the migration leaves', async () => {
		expect(await refusDeLaPreuve(TAG, [])).toBeNull();
	});

	it.each([
		['a rule not closed by is true', regle(`"slug" ~ '[a-z]'`)],
		['a rule that asks for nothing (or true)', regle(`("slug" ~ '[a-z]' or true) is true`)],
		['a rule that asks for a digit instead', regle(`("slug" ~ '[a-z0-9]') is true`)]
	])('refuses %s', async (_cas, etat) => {
		expect(await refusDeLaPreuve(TAG, etat)).toEqual({
			code: 'P0001',
			message: expect.stringMatching(/^organization_slug_letter_ck : /)
		});
	});
});

describe('la preuve de la migration 0073 (supprimer une session du vendredi)', () => {
	const TAG = '0073_course_delete_friday_by_manager';

	it('passes on the state the migration leaves', async () => {
		expect(await refusDeLaPreuve(TAG, [])).toBeNull();
	});

	it.each([
		[
			'the Friday branch put back into course_delete',
			[
				`alter policy "course_delete" on "course" to jadwal_app using ("organization_id" = (select jadwal.current_org_id())
					and ("kind" = 'jumua' or (select jadwal.is_org_admin())))`
			]
		],
		[
			'a second delete policy that opens Friday sessions to the editor',
			[
				`create policy "course_delete_jumua" on "course" as permissive for delete to jadwal_app
					using ("organization_id" = (select jadwal.current_org_id()) and "kind" = 'jumua')`
			]
		],
		[
			'a policy for every command, without the manager',
			[
				`create policy "course_all" on "course" as permissive for all to jadwal_app
					using ("organization_id" = (select jadwal.current_org_id()))`
			]
		],
		[
			'a delete policy for every role',
			[
				`create policy "course_delete_public" on "course" as permissive for delete to public
					using ("organization_id" = (select jadwal.current_org_id()))`
			]
		]
	])('refuses %s', async (_cas, etat) => {
		expect(await refusDeLaPreuve(TAG, etat)).toEqual({
			code: 'P0001',
			message: expect.stringMatching(/^course(_delete)? : /)
		});
	});
});

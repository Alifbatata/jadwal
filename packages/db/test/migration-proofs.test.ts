// Les preuves des migrations 0073, 0074, 0075, 0076, 0081, 0083 et 0085 voient un état affaibli
// (étape 20, relecture du chantier 1 ; étape 22 pour 0076 et 0081 ; étape 24 pour 0083 ; étape 25
// pour 0085). La preuve de 0079
// n'est plus jouée ici :
// elle disait que le super-admin lit la table des demandes et ne fait que lire, ce que 0081 change ;
// la preuve de 0081 dit l'état entier de cette table, et reprend chacun de ses cas.
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

describe('la preuve de la migration 0081 (les demandes d’accès, et la réponse)', () => {
	const TAG = '0081_access_request_resolve_rights';

	it('passes on the state the migration leaves', async () => {
		expect(await refusDeLaPreuve(TAG, [])).toBeNull();
	});

	it.each([
		[
			'row level security no longer forced',
			[`alter table "access_request" no force row level security`]
		],
		['the public role reading the table', [`grant select on "access_request" to jadwal_public`]],
		[
			'the super-admin rewriting what a request says',
			[`grant update ("email") on "access_request" to jadwal_superadmin`]
		],
		[
			'the super-admin writing every column',
			[`grant update on "access_request" to jadwal_superadmin`]
		],
		[
			'the super-admin no longer answering',
			[`revoke update on "access_request" from jadwal_superadmin`]
		],
		['the super-admin deleting', [`grant delete on "access_request" to jadwal_superadmin`]],
		[
			'an answer from inside an organisation',
			[
				`alter policy "access_request_superadmin_resolve" on "access_request"
					using ("status" = 'pending')`
			]
		],
		[
			'an answer that changes an answered request',
			[
				`alter policy "access_request_superadmin_resolve" on "access_request"
					using ((select coalesce(current_setting('jadwal.org_id', true), '')) = '')`
			]
		],
		[
			'an answer dated by the screen',
			[
				`alter policy "access_request_superadmin_resolve" on "access_request"
					with check ("status" in ('accepted', 'refused'))`
			]
		],
		[
			'an answer that puts a request back to pending',
			[
				`alter policy "access_request_superadmin_resolve" on "access_request"
					with check ("status" in ('pending', 'accepted', 'refused') and "resolved_at" = now())`
			]
		],
		[
			'the answer taken away',
			[`drop policy "access_request_superadmin_resolve" on "access_request"`]
		],
		['the application role deleting', [`grant delete on "access_request" to jadwal_app`]],
		[
			'a second policy that opens the table to the public role',
			[
				`create policy "access_request_public_select" on "access_request" as permissive
					for select to jadwal_public using (true)`
			]
		],
		[
			'the super-admin reading from inside an organisation',
			[
				`alter policy "access_request_superadmin_select" on "access_request"
					using ((select coalesce(current_setting('jadwal.org_id', true), '')) = '' or true)`
			]
		],
		[
			'a purge that keeps answered requests longer',
			[
				`alter policy "access_request_owner_purge" on "access_request" using (
					("status" <> 'pending' and "resolved_at" < now() - interval '400 days')
					or ("status" = 'pending' and "created_at" < now() - interval '12 months'))`
			]
		],
		[
			'the writing function open to the application role',
			[
				`grant execute on function jadwal.request_access(text, text, text, text, text, text)
					to jadwal_app`
			]
		],
		[
			'the writing function taken from the public role',
			[
				`revoke execute on function jadwal.request_access(text, text, text, text, text, text)
					from jadwal_public`
			]
		],
		[
			'the purge open to the public role',
			[`grant execute on function jadwal.purge_access_requests() to jadwal_public`]
		]
	])('refuses %s', async (_cas, etat) => {
		expect(await refusDeLaPreuve(TAG, etat)).toEqual({
			code: 'P0001',
			message: expect.stringMatching(
				/^(jadwal\.)?(access_request|request_access|purge_access_requests)/
			)
		});
	});
});

describe('la preuve de la migration 0083 (ce que l’organisation dit d’elle)', () => {
	const TAG = '0083_organization_info_rights';
	// La migration 0085 donne en plus au rôle applicatif les langues du direct. La preuve de 0083 dit
	// l'état que 0083 laisse : chaque essai part donc de cet état, la colonne du direct retirée.
	const AVANT_0085 = [`revoke update ("live_language") on "organization" from jadwal_app`];

	it('passes on the state the migration leaves', async () => {
		expect(await refusDeLaPreuve(TAG, AVANT_0085)).toBeNull();
	});

	it.each([
		[
			'the application role writing the whole row again',
			[`grant update on "organization" to jadwal_app`]
		],
		[
			'the application role writing the public address',
			[`grant update ("slug") on "organization" to jadwal_app`]
		],
		[
			'the application role writing the state of the organisation',
			[`grant update ("status") on "organization" to jadwal_app`]
		],
		[
			'a piece of information the application role can no longer write',
			[`revoke update ("announcement") on "organization" from jadwal_app`]
		],
		[
			'a setting the application role can no longer write',
			[`revoke update ("greeting") on "organization" from jadwal_app`]
		],
		[
			'an editor writing the information',
			[
				`alter policy "organization_update" on "organization"
					using ("id" = (select jadwal.current_org_id()))
					with check ("id" = (select jadwal.current_org_id()))`
			]
		],
		[
			'a piece of information that lost its constraint',
			[`alter table "organization" drop constraint "organization_website_ck"`]
		],
		[
			'a piece of information that became mandatory',
			[
				// Sous le drapeau d'entretien : hors de lui, le propriétaire n'écrit aucune ligne (ADR 0019).
				`set local jadwal.maintenance = 'on'`,
				`update "organization" set "address" = 'x' where "address" is null`,
				`alter table "organization" alter column "address" set not null`
			]
		],
		['a column that went away', [`alter table "organization" drop column "access_note"`]],
		['the super-admin losing the row', [`revoke update on "organization" from jadwal_superadmin`]],
		['the public role no longer reading', [`revoke select on "organization" from jadwal_public`]],
		[
			'the public role writing a piece of information',
			[`grant update ("announcement") on "organization" to jadwal_public`]
		]
	])('refuses %s', async (_cas, etat) => {
		expect(await refusDeLaPreuve(TAG, [...AVANT_0085, ...etat])).toEqual({
			code: 'P0001',
			message: expect.stringMatching(/^organization(\.|_update| )/)
		});
	});
});

describe('la preuve de la migration 0085 (qui diffuse, et vers quelles langues)', () => {
	const TAG = '0085_live_broadcast_rights';

	it('passes on the state the migration leaves', async () => {
		expect(await refusDeLaPreuve(TAG, [])).toBeNull();
	});

	it.each([
		[
			'the application role writing a whole membership again',
			[`grant update on "membership" to jadwal_app`]
		],
		[
			'the application role moving a membership to another account',
			[`grant update ("user_id") on "membership" to jadwal_app`]
		],
		[
			'the permission the application role can no longer write',
			[`revoke update ("can_broadcast") on "membership" from jadwal_app`]
		],
		[
			'the live languages the application role can no longer write',
			[`revoke update ("live_language") on "organization" from jadwal_app`]
		],
		[
			'the application role writing the public address',
			[`grant update ("slug") on "organization" to jadwal_app`]
		],
		[
			'an editor giving the permission',
			[
				`alter policy "membership_update" on "membership"
					using ("organization_id" = (select jadwal.current_org_id()))
					with check ("organization_id" = (select jadwal.current_org_id()))`
			]
		],
		[
			'an invitee who gives herself the permission',
			[
				`alter policy "membership_insert" on "membership" with check (
					"organization_id" = (select jadwal.current_org_id())
					and "user_id" = (select jadwal.current_user_id())
					and jadwal.invited("organization_id", "user_id", "role"))`
			]
		],
		[
			'a permission given by default',
			[`alter table "membership" alter column "can_broadcast" set default true`]
		],
		[
			'live languages that lost their constraint',
			[`alter table "organization" drop constraint "organization_live_language_ck"`]
		],
		[
			'the super-admin losing a membership',
			[`revoke update on "membership" from jadwal_superadmin`]
		],
		[
			'the public role giving the permission',
			[`grant update ("can_broadcast") on "membership" to jadwal_public`]
		]
	])('refuses %s', async (_cas, etat) => {
		expect(await refusDeLaPreuve(TAG, etat)).toEqual({
			code: 'P0001',
			message: expect.stringMatching(/^(membership|organization)(\.|_update|_insert|_live| )/)
		});
	});
});

describe('la preuve de la migration 0076 (plus aucun plan)', () => {
	const TAG = '0076_organization_plan_drop';

	it('passes on the state the migration leaves', async () => {
		expect(await refusDeLaPreuve(TAG, [])).toBeNull();
	});

	it.each([
		[
			'the plan column back, with its rule',
			[
				`alter table "organization" add column "plan" text default 'free' not null`,
				`alter table "organization" add constraint "organization_plan_ck"
					check (("plan" in ('free', 'sponsored', 'paid')) is true)`
			]
		],
		[
			'the plan column back, without its rule',
			[`alter table "organization" add column "plan" text`]
		],
		[
			'the rule alone, under its name',
			[`alter table "organization" add constraint "organization_plan_ck" check (true)`]
		]
	])('refuses %s', async (_cas, etat) => {
		expect(await refusDeLaPreuve(TAG, etat)).toEqual({
			code: 'P0001',
			message: expect.stringMatching(/^organization : /)
		});
	});
});

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

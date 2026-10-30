// Les demandes d'accès (étape 22, ADR 0049) : qui écrit, qui lit, combien, et pour combien de temps.
//
// Une organisation qui veut se servir de jadwal le demande par le formulaire public. La demande
// n'entre que par `jadwal.request_access`, que seul le rôle public exécute ; le rôle public n'a
// aucun droit sur la table. Le super-admin lit, et répond, depuis sa console : acceptée ou refusée,
// une fois, à l'heure du serveur. Une demande résolue part quatre-vingt-dix jours après sa réponse,
// une demande restée sans réponse douze mois après son dépôt.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database, DatabaseHandle } from '../src/index.js';
import {
	allRows,
	firstRow,
	openDatabase,
	SQLSTATE,
	sqlStateOfFailure,
	withMaintenance
} from './helpers.js';

let ownerHandle: DatabaseHandle;
let publicHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let authHandle: DatabaseHandle;
let superAdminHandle: DatabaseHandle;
let owner: Database;

beforeAll(() => {
	ownerHandle = openDatabase('owner');
	publicHandle = openDatabase('public');
	appHandle = openDatabase('app');
	authHandle = openDatabase('auth');
	superAdminHandle = openDatabase('superadmin');
	owner = ownerHandle.db;
});

afterAll(async () => {
	await Promise.all(
		[ownerHandle, publicHandle, appHandle, authHandle, superAdminHandle].map((h) => h?.close())
	);
});

/** Chaque essai part d'une table vide : le plafond du jour compte tout ce qui a été déposé. */
beforeEach(async () => {
	await withMaintenance(owner, (tx) => tx.execute(sql`delete from "access_request"`));
});

interface Saisie {
	organization: string;
	locality: string;
	contact: string;
	email: string;
	message: string | null;
	language: string;
}

function saisie(overrides: Partial<Saisie> = {}): Saisie {
	return {
		organization: 'Association de Bienne',
		locality: 'Bienne',
		contact: 'Une Personne',
		email: 'demande@example.org',
		message: 'Nous aimerions publier nos cours.',
		language: 'fr',
		...overrides
	};
}

/** Dépose une demande comme le formulaire le fait : par le rôle public, et par la fonction seule. */
async function demander(overrides: Partial<Saisie> = {}, db?: Database): Promise<string> {
	const s = saisie(overrides);
	const row = firstRow<{ outcome: string }>(
		await (db ?? publicHandle.db).execute(sql`
			select jadwal.request_access(${s.organization}, ${s.locality}, ${s.contact}, ${s.email},
				${s.message}, ${s.language}) as outcome
		`)
	);
	return row?.outcome ?? '';
}

interface Ligne {
	organization_name: string;
	locality: string;
	contact_name: string;
	email: string;
	message: string | null;
	language: string;
	status: string;
	resolved_at: Date | null;
	age_seconds: string;
}

async function lignes(): Promise<Ligne[]> {
	return allRows<Ligne>(
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				select "organization_name", "locality", "contact_name", "email", "message", "language",
					"status", "resolved_at", extract(epoch from now() - "created_at")::text as age_seconds
				from "access_request" order by "created_at", "id"
			`)
		)
	);
}

describe('déposer une demande', () => {
	it('records what the form says, trimmed, as pending, at the server’s time', async () => {
		expect(
			await demander({
				organization: '  Association de Bienne ',
				locality: ' Bienne',
				contact: 'Une Personne  ',
				email: ' Demande@Example.org ',
				message: '   ',
				language: 'de'
			})
		).toBe('recorded');
		const [ligne, ...autres] = await lignes();
		expect(autres).toEqual([]);
		expect(ligne).toMatchObject({
			organization_name: 'Association de Bienne',
			locality: 'Bienne',
			contact_name: 'Une Personne',
			email: 'Demande@Example.org',
			// Un message fait de blancs n'est pas un message.
			message: null,
			language: 'de',
			status: 'pending',
			resolved_at: null
		});
		expect(Number(ligne?.age_seconds)).toBeLessThan(60);
	});

	it('keeps one pending request per address, whatever its case, and says so to the server only', async () => {
		expect(await demander()).toBe('recorded');
		expect(await demander({ email: 'DEMANDE@example.ORG', organization: 'Autre' })).toBe(
			'duplicate'
		);
		const toutes = await lignes();
		expect(toutes.map((l) => l.organization_name)).toEqual(['Association de Bienne']);
	});

	it('takes a new request from the same address once the first has its answer', async () => {
		expect(await demander()).toBe('recorded');
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`update "access_request" set "status" = 'refused', "resolved_at" = now()`)
		);
		expect(await demander()).toBe('recorded');
		expect((await lignes()).map((l) => l.status)).toEqual(['refused', 'pending']);
	});

	it('stops at thirty requests in twenty-four hours, and counts no older one', async () => {
		for (let n = 0; n < 30; n += 1) {
			expect(await demander({ email: `demande-${n}@example.org` })).toBe('recorded');
		}
		expect(await demander({ email: 'trente-et-une@example.org' })).toBe('full');
		expect(await lignes()).toHaveLength(30);

		// Une demande vieille de plus d'un jour ne compte plus.
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				update "access_request" set "created_at" = now() - interval '25 hours'
				where "email" = 'demande-0@example.org'
			`)
		);
		expect(await demander({ email: 'trente-et-une@example.org' })).toBe('recorded');
	});

	it('lets the table refuse what the form should never send', async () => {
		const refus: Partial<Saisie>[] = [
			{ organization: '   ' },
			{ locality: '' },
			{ contact: 'x'.repeat(121) },
			{ email: 'pas-une-adresse' },
			{ email: `${'a'.repeat(250)}@example.org` },
			{ message: 'x'.repeat(1001) },
			{ language: 'es' }
		];
		for (const cas of refus) {
			expect(await sqlStateOfFailure(() => demander(cas)), JSON.stringify(cas)).toBe(
				SQLSTATE.checkViolation
			);
		}
		expect(await lignes()).toEqual([]);
	});

	it('is open to the public role only', async () => {
		for (const db of [appHandle.db, authHandle.db, superAdminHandle.db]) {
			expect(await sqlStateOfFailure(() => demander({}, db))).toBe(SQLSTATE.insufficientPrivilege);
		}
	});
});

describe('qui lit et qui écrit la table', () => {
	it('gives the public role no right on the table itself', async () => {
		await demander();
		const db = publicHandle.db;
		for (const instruction of [
			sql`select * from "access_request"`,
			sql`insert into "access_request" ("id", "organization_name", "locality", "contact_name",
				"email", "language") values (uuidv7(), 'a', 'b', 'c', 'd@e.fg', 'fr')`,
			sql`update "access_request" set "status" = 'accepted', "resolved_at" = now()`,
			sql`delete from "access_request"`
		]) {
			expect(await sqlStateOfFailure(() => db.execute(instruction))).toBe(
				SQLSTATE.insufficientPrivilege
			);
		}
	});

	it('gives the application and sign-in roles nothing', async () => {
		for (const db of [appHandle.db, authHandle.db]) {
			expect(await sqlStateOfFailure(() => db.execute(sql`select * from "access_request"`))).toBe(
				SQLSTATE.insufficientPrivilege
			);
		}
	});

	it('lets the super-admin read from the console, and not from inside an organisation', async () => {
		await demander();
		const console = allRows<{ email: string }>(
			await superAdminHandle.db.execute(sql`select "email" from "access_request"`)
		);
		expect(console.map((l) => l.email)).toEqual(['demande@example.org']);

		const dedans = await superAdminHandle.db.transaction(async (tx) => {
			await tx.execute(
				sql`select set_config('jadwal.org_id', '01900000-0000-7000-8000-000000000000', true)`
			);
			return allRows(await tx.execute(sql`select "email" from "access_request"`));
		});
		expect(dedans).toEqual([]);
	});

	it('lets the super-admin neither add nor delete a request', async () => {
		await demander();
		for (const instruction of [
			sql`insert into "access_request" ("id", "organization_name", "locality", "contact_name",
				"email", "language") values (uuidv7(), 'a', 'b', 'c', 'd@e.fg', 'fr')`,
			sql`delete from "access_request"`
		]) {
			expect(await sqlStateOfFailure(() => superAdminHandle.db.execute(instruction))).toBe(
				SQLSTATE.insufficientPrivilege
			);
		}
		expect(await lignes()).toHaveLength(1);
	});
});

describe('répondre à une demande', () => {
	/** Une réponse du super-admin, depuis sa console : rend le nombre de demandes touchées. */
	async function repondre(instruction: ReturnType<typeof sql>): Promise<number> {
		const resultat = await superAdminHandle.db.execute(instruction);
		return (resultat as unknown as { count: number }).count;
	}

	it('lets the super-admin accept or refuse a pending request, at the time of the answer', async () => {
		await demander({ email: 'acceptee@example.org' });
		await demander({ email: 'refusee@example.org' });
		expect(
			await repondre(sql`
				update "access_request" set "status" = 'accepted', "resolved_at" = now()
				where "email" = 'acceptee@example.org'
			`)
		).toBe(1);
		expect(
			await repondre(sql`
				update "access_request" set "status" = 'refused', "resolved_at" = now()
				where "email" = 'refusee@example.org'
			`)
		).toBe(1);
		const toutes = await lignes();
		expect(toutes.map((l) => [l.email, l.status])).toEqual([
			['acceptee@example.org', 'accepted'],
			['refusee@example.org', 'refused']
		]);
		for (const ligne of toutes) {
			// Le pilote rend la date en texte, sous `execute`.
			expect(Date.now() - new Date(String(ligne.resolved_at)).getTime()).toBeLessThan(60_000);
		}
	});

	it('answers once: an answered request no longer moves', async () => {
		await demander();
		await repondre(sql`update "access_request" set "status" = 'refused', "resolved_at" = now()`);
		for (const instruction of [
			sql`update "access_request" set "status" = 'accepted', "resolved_at" = now()`,
			sql`update "access_request" set "status" = 'refused', "resolved_at" = now()`
		]) {
			expect(await repondre(instruction)).toBe(0);
		}
		expect((await lignes()).map((l) => l.status)).toEqual(['refused']);
	});

	it('refuses an answer that goes back to pending, or that is dated by anyone but the server', async () => {
		await demander();
		for (const instruction of [
			sql`update "access_request" set "status" = 'pending'`,
			sql`update "access_request" set "status" = 'accepted',
				"resolved_at" = now() - interval '1 day'`,
			sql`update "access_request" set "status" = 'refused',
				"resolved_at" = '2026-01-01T00:00:00Z'`
		]) {
			expect(await sqlStateOfFailure(() => superAdminHandle.db.execute(instruction))).toBe(
				SQLSTATE.insufficientPrivilege
			);
		}
		expect((await lignes()).map((l) => [l.status, l.resolved_at])).toEqual([['pending', null]]);
	});

	it('lets the super-admin rewrite nothing the request says', async () => {
		await demander();
		for (const instruction of [
			sql`update "access_request" set "email" = 'autre@example.org'`,
			sql`update "access_request" set "organization_name" = 'Autre'`,
			sql`update "access_request" set "created_at" = now()`,
			sql`update "access_request" set "status" = 'accepted', "resolved_at" = now(),
				"language" = 'de'`
		]) {
			expect(await sqlStateOfFailure(() => superAdminHandle.db.execute(instruction))).toBe(
				SQLSTATE.insufficientPrivilege
			);
		}
		expect(await lignes()).toMatchObject([
			{ email: 'demande@example.org', language: 'fr', status: 'pending' }
		]);
	});

	it('does not answer from inside an organisation', async () => {
		await demander();
		const touchees = await superAdminHandle.db.transaction(async (tx) => {
			await tx.execute(
				sql`select set_config('jadwal.org_id', '01900000-0000-7000-8000-000000000000', true)`
			);
			const resultat = await tx.execute(
				sql`update "access_request" set "status" = 'accepted', "resolved_at" = now()`
			);
			return (resultat as unknown as { count: number }).count;
		});
		expect(touchees).toBe(0);
		expect((await lignes()).map((l) => l.status)).toEqual(['pending']);
	});

	it('gives the other roles no answer', async () => {
		await demander();
		for (const db of [publicHandle.db, appHandle.db, authHandle.db]) {
			expect(
				await sqlStateOfFailure(() =>
					db.execute(sql`update "access_request" set "status" = 'refused', "resolved_at" = now()`)
				)
			).toBe(SQLSTATE.insufficientPrivilege);
		}
	});
});

describe('la purge des demandes', () => {
	/** Une demande d'un âge choisi, posée sous le drapeau d'entretien. */
	async function ancienne(email: string, depot: string, reponse: string | null): Promise<void> {
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "access_request" ("id", "organization_name", "locality", "contact_name",
					"email", "language", "status", "created_at", "resolved_at")
				values (uuidv7(), 'Association', 'Bienne', 'Une Personne', ${email}, 'fr',
					${reponse === null ? 'pending' : 'accepted'},
					now() - ${depot}::interval,
					${reponse === null ? null : sql`now() - ${reponse}::interval`})
			`)
		);
	}

	async function purger(): Promise<number> {
		return Number(
			firstRow<{ n: string }>(
				await owner.execute(sql`select jadwal.purge_access_requests()::text as n`)
			)?.n
		);
	}

	it('takes an answered request ninety days after its answer, a pending one after twelve months', async () => {
		await ancienne('reponse-91-jours@example.org', '200 days', '91 days');
		await ancienne('reponse-89-jours@example.org', '200 days', '89 days');
		await ancienne('attente-13-mois@example.org', '13 months', null);
		await ancienne('attente-11-mois@example.org', '11 months', null);

		expect(await purger()).toBe(2);
		expect((await lignes()).map((l) => l.email).sort()).toEqual([
			'attente-11-mois@example.org',
			'reponse-89-jours@example.org'
		]);
		expect(await purger()).toBe(0);
	});

	it('is refused to every role but the owner', async () => {
		for (const db of [appHandle.db, publicHandle.db, authHandle.db, superAdminHandle.db]) {
			expect(
				await sqlStateOfFailure(() => db.execute(sql`select jadwal.purge_access_requests()`))
			).toBe(SQLSTATE.insufficientPrivilege);
		}
	});
});

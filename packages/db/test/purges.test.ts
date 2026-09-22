// Les deux purges de l'étape 4 : les comptes sans adhésion, les invitations résolues.
//
// Ce sont des procédures du propriétaire, comme celle du journal (ADR 0020) : ni le rôle applicatif
// ni le super-admin ne peuvent les appeler. La borne, en revanche, n'est pas au même endroit, et il
// vaut la peine de dire pourquoi. Le journal doit résister au propriétaire lui-même, donc sa fenêtre
// est portée par une politique. Un compte, le propriétaire peut déjà l'effacer sous son drapeau
// d'entretien : une politique bornée ne lui retirerait rien et donnerait l'illusion d'une garantie.
// La borne est donc dans la procédure, et c'est ce fichier qui la tient.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, withOrg, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
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
let org: Organisation;

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	superAdminHandle = openDatabase('superadmin');
	owner = ownerHandle.db;
	app = appHandle.db;
	superAdmin = superAdminHandle.db;
	org = await seedOrganisation(owner, 'purges');
});

afterAll(async () => {
	await appHandle?.close();
	await superAdminHandle?.close();
	await ownerHandle?.close();
});

/** Un compte posé par le propriétaire, avec l'âge qu'on veut : l'application ne le pourrait pas. */
async function compte(email: string, moisDAge: number): Promise<string> {
	const id = newId();
	await withMaintenance(owner, (tx) =>
		tx.execute(sql`
			insert into "user" ("id", "email", "created_at", "updated_at")
			values (${id}, ${email}, now() - make_interval(months => ${moisDAge}),
				now() - make_interval(months => ${moisDAge}))
		`)
	);
	return id;
}

async function existe(table: string, id: string): Promise<boolean> {
	const found = firstRow<{ n: number }>(
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`select count(*)::int as n from ${sql.identifier(table)} where "id" = ${id}`)
		)
	);
	return (found?.n ?? 0) > 0;
}

describe('la purge des comptes sans adhésion', () => {
	it('is refused to both application roles, procedure included', async () => {
		for (const [nom, db] of [
			['app', app],
			['superadmin', superAdmin]
		] as const) {
			const state = await sqlStateOfFailure(() =>
				db.execute(sql`select jadwal.purge_orphan_accounts()`)
			);
			expect(state, nom).toBe(SQLSTATE.insufficientPrivilege);
		}
	});

	it('removes an account older than twelve months with nothing attached', async () => {
		const abandonne = await compte(`abandonne-${newId()}@example.test`, 13);
		const recent = await compte(`recent-${newId()}@example.test`, 2);
		await withMaintenance(owner, (tx) => tx.execute(sql`select jadwal.purge_orphan_accounts()`));
		expect(await existe('user', abandonne)).toBe(false);
		expect(await existe('user', recent)).toBe(true);
	});

	it('keeps an old account that is a member of something', async () => {
		const membre = await compte(`membre-${newId()}@example.test`, 24);
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${org.id}, ${membre}, 'editor')
			`)
		);
		await withMaintenance(owner, (tx) => tx.execute(sql`select jadwal.purge_orphan_accounts()`));
		expect(await existe('user', membre)).toBe(true);
	});

	it('keeps an old account that still has a session open', async () => {
		const connecte = await compte(`connecte-${newId()}@example.test`, 24);
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "session" ("id", "user_id", "token", "expires_at")
				values (${newId()}, ${connecte}, ${newId()}, now() + interval '30 days')
			`)
		);
		await withMaintenance(owner, (tx) => tx.execute(sql`select jadwal.purge_orphan_accounts()`));
		expect(await existe('user', connecte)).toBe(true);
	});

	it('keeps an old account that has an invitation waiting for it', async () => {
		const adresse = `invite-${newId()}@example.test`;
		const attendu = await compte(adresse, 24);
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "invitation" ("id", "organization_id", "email", "role", "expires_at")
				values (${newId()}, ${org.id}, ${adresse.toUpperCase()}, 'editor',
					now() + interval '14 days')
			`)
		);
		// Comparaison insensible à la casse, comme l'unicité des adresses : sans cela, une
		// invitation en attente n'empêcherait pas la purge du compte qu'elle vise.
		await withMaintenance(owner, (tx) => tx.execute(sql`select jadwal.purge_orphan_accounts()`));
		expect(await existe('user', attendu)).toBe(true);
	});

	it('never removes a super-admin account, whatever its age', async () => {
		const id = newId();
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "user" ("id", "email", "is_super_admin", "created_at", "updated_at")
				values (${id}, ${`admin-${id}@example.test`}, true, now() - interval '5 years',
					now() - interval '5 years')
			`)
		);
		await withMaintenance(owner, (tx) => tx.execute(sql`select jadwal.purge_orphan_accounts()`));
		expect(await existe('user', id)).toBe(true);
	});

	it('says how many it removed, and removes nothing the second time', async () => {
		await compte(`compte-${newId()}@example.test`, 18);
		const premier = firstRow<{ purge_orphan_accounts: string }>(
			await withMaintenance(owner, (tx) => tx.execute(sql`select jadwal.purge_orphan_accounts()`))
		);
		const second = firstRow<{ purge_orphan_accounts: string }>(
			await withMaintenance(owner, (tx) => tx.execute(sql`select jadwal.purge_orphan_accounts()`))
		);
		expect(Number(premier?.purge_orphan_accounts)).toBeGreaterThan(0);
		expect(Number(second?.purge_orphan_accounts)).toBe(0);
	});
});

describe('la purge des invitations résolues', () => {
	it('is refused to both application roles, procedure included', async () => {
		for (const [nom, db] of [
			['app', app],
			['superadmin', superAdmin]
		] as const) {
			const state = await sqlStateOfFailure(() =>
				db.execute(sql`select jadwal.purge_resolved_invitations()`)
			);
			expect(state, nom).toBe(SQLSTATE.insufficientPrivilege);
		}
	});

	async function invitation(
		statut: string,
		joursDepuisResolution: number | null,
		/** Négatif : l'invitation a expiré il y a tant de jours. Positif : elle court encore. */
		joursJusquaExpiration = -186
	): Promise<string> {
		const id = newId();
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "invitation" ("id", "organization_id", "email", "role", "status",
					"created_at", "expires_at", "resolved_at")
				values (${id}, ${org.id}, ${`${id}@example.test`}, 'editor', ${statut},
					now() - interval '200 days',
					now() + make_interval(days => ${joursJusquaExpiration}),
					${joursDepuisResolution === null ? null : sql`now() - make_interval(days => ${joursDepuisResolution})`})
			`)
		);
		return id;
	}

	it('removes what has been resolved for more than ninety days', async () => {
		const vieille = await invitation('cancelled', 120);
		const jeune = await invitation('cancelled', 30);
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`select jadwal.purge_resolved_invitations()`)
		);
		expect(await existe('invitation', vieille)).toBe(false);
		expect(await existe('invitation', jeune)).toBe(true);
	});

	it('never removes one that is still pending and still running', async () => {
		const attente = await invitation('pending', null, 7);
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`select jadwal.purge_resolved_invitations()`)
		);
		// Une invitation en attente porte une adresse, mais elle sert encore : l'effacer serait
		// retirer à quelqu'un la porte qu'on vient de lui ouvrir.
		expect(await existe('invitation', attente)).toBe(true);
	});

	it('removes one that stayed pending and expired more than ninety days ago', async () => {
		// Le trou de l'étape 13. La purge ne visait que `status <> 'pending'`, et l'écran des membres
		// ne liste que `expires_at > now()` : une invitation expirée n'était plus annulable par
		// personne, et rien ne l'effaçait. Son adresse restait pour toujours.
		const perimee = await invitation('pending', null, -186);
		const expireeHier = await invitation('pending', null, -1);
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`select jadwal.purge_resolved_invitations()`)
		);
		expect(await existe('invitation', perimee), 'expirée depuis 186 jours').toBe(false);
		// Quatre-vingt-dix jours après la fin, pas avant : une invitation qui vient d'expirer peut
		// encore être renvoyée, et c'est la même durée que pour celles qu'on annule.
		expect(await existe('invitation', expireeHier), 'expirée hier').toBe(true);
	});

	it('falls back on the creation date when nothing recorded a resolution', async () => {
		// `resolved_at` a été ajoutée à l'étape 3 : des lignes anciennes peuvent ne pas la porter.
		// Sans le repli, elles resteraient éternellement.
		const sansDate = await invitation('joined', null);
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`select jadwal.purge_resolved_invitations()`)
		);
		expect(await existe('invitation', sansDate)).toBe(false);
	});

	it('leaves the membership in place when it removes an accepted invitation', async () => {
		const avant = firstRow<{ n: number }>(
			await withMaintenance(owner, (tx) =>
				tx.execute(sql`select count(*)::int as n from "membership"`)
			)
		);
		await invitation('joined', 100);
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`select jadwal.purge_resolved_invitations()`)
		);
		const apres = firstRow<{ n: number }>(
			await withMaintenance(owner, (tx) =>
				tx.execute(sql`select count(*)::int as n from "membership"`)
			)
		);
		expect(apres?.n).toBe(avant?.n);
	});
});

describe('la purge du registre interne', () => {
	it('is refused to both application roles, procedure included', async () => {
		for (const [nom, db] of [
			['app', app],
			['superadmin', superAdmin]
		] as const) {
			const state = await sqlStateOfFailure(() =>
				db.execute(sql`select jadwal.purge_admin_access_log()`)
			);
			expect(state, nom).toBe(SQLSTATE.insufficientPrivilege);
		}
	});

	it('removes what is beyond twenty-four months, and nothing else', async () => {
		const vieille = newId();
		const jeune = newId();
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "admin_access_log" ("id", "organization_id", "organization_slug", "actor_id",
					"action", "route", "created_at")
				values
					(${vieille}, ${org.id}, ${org.slug}, ${org.userId}, 'read', '/cours',
						now() - interval '30 months'),
					(${jeune}, ${org.id}, ${org.slug}, ${org.userId}, 'read', '/cours',
						now() - interval '3 months')
			`)
		);
		await withMaintenance(owner, (tx) => tx.execute(sql`select jadwal.purge_admin_access_log()`));
		expect(await existe('admin_access_log', vieille)).toBe(false);
		// La borne est dans une politique, pas dans la procédure : un `delete` sans clause de
		// restriction ne peut emporter que ce que la fenêtre autorise.
		expect(await existe('admin_access_log', jeune)).toBe(true);
	});

	it('cannot take a recent entry even with a delete of its own', async () => {
		const jeune = newId();
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "admin_access_log" ("id", "organization_id", "organization_slug", "actor_id",
					"action", "route", "created_at")
				values (${jeune}, ${org.id}, ${org.slug}, ${org.userId}, 'write', '/cours',
					now() - interval '1 day')
			`)
		);
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`delete from "admin_access_log" where "id" = ${jeune}`)
		);
		// Zéro ligne supprimée, en silence : c'est le comportement d'un `delete` refusé par une
		// politique, et c'est pourquoi la procédure existe plutôt qu'un `delete` à la main.
		expect(await existe('admin_access_log', jeune)).toBe(true);
	});
});

describe('la purge des sessions expirées', () => {
	async function session(joursJusquaExpiration: number, userId: string): Promise<string> {
		const id = newId();
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "session" ("id", "user_id", "token", "expires_at")
				values (${id}, ${userId}, ${newId()}, now() + make_interval(days => ${joursJusquaExpiration}))
			`)
		);
		return id;
	}

	it('is refused to both application roles, procedure included', async () => {
		for (const [nom, db] of [
			['app', app],
			['superadmin', superAdmin]
		] as const) {
			const state = await sqlStateOfFailure(() =>
				db.execute(sql`select jadwal.purge_expired_sessions()`)
			);
			expect(state, nom).toBe(SQLSTATE.insufficientPrivilege);
		}
	});

	it('removes an expired session and keeps a live one', async () => {
		const personne = await compte(`sessions-${newId()}@example.test`, 1);
		const morte = await session(-1, personne);
		const vivante = await session(30, personne);
		await withMaintenance(owner, (tx) => tx.execute(sql`select jadwal.purge_expired_sessions()`));
		expect(await existe('session', morte), 'expirée hier').toBe(false);
		expect(await existe('session', vivante), 'expire dans trente jours').toBe(true);
	});

	it('cannot take a live session even under the maintenance flag', async () => {
		// La borne est dans une politique, pas seulement dans la procédure : même sous le drapeau
		// d'entretien, une session qui court ne peut pas partir. Sans cela, une commande tapée par
		// erreur déconnecterait tout le monde.
		const personne = await compte(`sessions-vivantes-${newId()}@example.test`, 1);
		const vivante = await session(30, personne);
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`delete from "session" where "id" = ${vivante}`)
		);
		expect(await existe('session', vivante)).toBe(true);
	});

	it('lets an orphan account go once its ghost session is gone', async () => {
		// Les deux défauts se renforçaient : aucune purge n'effaçait les sessions, et
		// `purge_orphan_accounts` exige `NOT EXISTS (session)`. Une ligne fantôme retenait donc un
		// compte pour toujours. Ce test le joue dans l'ordre.
		const fantome = await compte(`fantome-${newId()}@example.test`, 24);
		await session(-10, fantome);
		await withMaintenance(owner, (tx) => tx.execute(sql`select jadwal.purge_orphan_accounts()`));
		expect(await existe('user', fantome), 'retenu par sa session expirée').toBe(true);

		await withMaintenance(owner, (tx) => tx.execute(sql`select jadwal.purge_expired_sessions()`));
		await withMaintenance(owner, (tx) => tx.execute(sql`select jadwal.purge_orphan_accounts()`));
		expect(await existe('user', fantome), 'libéré une fois la session effacée').toBe(false);
	});
});

describe('la purge des vérifications expirées', () => {
	async function verification(joursJusquaExpiration: number): Promise<string> {
		const id = newId();
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "verification" ("id", "identifier", "value", "expires_at")
				values (${id}, ${`jeton-${id}`}, ${'{"email":"quelquun@example.test"}'},
					now() + make_interval(days => ${joursJusquaExpiration}))
			`)
		);
		return id;
	}

	it('is refused to both application roles, procedure included', async () => {
		for (const [nom, db] of [
			['app', app],
			['superadmin', superAdmin]
		] as const) {
			const state = await sqlStateOfFailure(() =>
				db.execute(sql`select jadwal.purge_expired_verifications()`)
			);
			expect(state, nom).toBe(SQLSTATE.insufficientPrivilege);
		}
	});

	it('removes an expired verification and keeps a live one', async () => {
		// Ce que ces lignes portent n'est pas anodin : Better Auth range dans `value` le
		// `JSON.stringify({ email, name })` du lien magique, **en clair**. La ligne ne partait qu'au
		// clic ; un lien qu'on ne clique jamais gardait l'adresse sans limite de temps.
		const morte = await verification(-1);
		const vivante = await verification(1);
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`select jadwal.purge_expired_verifications()`)
		);
		expect(await existe('verification', morte), 'expirée hier').toBe(false);
		expect(await existe('verification', vivante), 'expire demain').toBe(true);
	});
});

describe('une organisation sans responsable reste récupérable', () => {
	it('lets the super-admin name a manager where there is none at all', async () => {
		// Une organisation nue : le super-admin vient d'en ouvrir une et personne n'y est encore
		// entré. C'est le seul état orphelin que la base laisse exister — le déclencheur du dernier
		// `org_admin` interdit de vider une organisation habitée, y compris au propriétaire, et y
		// compris en supprimant le compte de la dernière personne responsable.
		const orpheline = { id: newId(), slug: `orpheline-${Date.now()}` };
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
					"enabled_language")
				values (${orpheline.id}, ${orpheline.slug}, 'Association orpheline', 'Europe/Zurich', 'fr',
					array['fr'])
			`)
		);
		const personne = await compte(`reprise-${newId()}@example.test`, 0);
		await withOrg(superAdmin, orpheline.id, (tx) =>
			tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${orpheline.id}, ${personne}, 'org_admin')
			`)
		);
		const membres = allRows<{ user_id: string }>(
			await withMaintenance(owner, (tx) =>
				tx.execute(
					sql`select "user_id" from "membership" where "organization_id" = ${orpheline.id}`
				)
			)
		);
		expect(membres.map((row) => row.user_id)).toEqual([personne]);
	});

	it('still refuses to remove the last manager, owner included', async () => {
		const state = await sqlStateOfFailure(() =>
			withMaintenance(owner, (tx) =>
				tx.execute(sql`
					delete from "membership"
					where "organization_id" = ${org.id} and "role" = 'org_admin'
				`)
			)
		);
		// Le garde-fou de l'étape 3 tient toujours, y compris sous le propriétaire : il est dans un
		// déclencheur, pas dans une politique. C'est aussi ce qui fait qu'une organisation habitée
		// ne devient jamais orpheline.
		expect(state).toBe(SQLSTATE.restrictViolation);
	});

	it('still refuses it through the deletion of the account itself', async () => {
		const responsable = allRows<{ user_id: string }>(
			await withMaintenance(owner, (tx) =>
				tx.execute(sql`
					select "user_id" from "membership"
					where "organization_id" = ${org.id} and "role" = 'org_admin'
				`)
			)
		)[0];
		const state = await sqlStateOfFailure(() =>
			withMaintenance(owner, (tx) =>
				tx.execute(sql`delete from "user" where "id" = ${responsable?.user_id}`)
			)
		);
		expect(state).toBe(SQLSTATE.restrictViolation);
	});
});

// Le registre interne des accès du super-admin (ADR 0025).
//
// Il protège l'exploitant, pas l'organisation : c'est exactement pour cela qu'une organisation ne
// doit pouvoir l'atteindre par aucun chemin. L'étape 3 a appris que fermer une porte sans regarder
// les fenêtres ne ferme rien — la lecture du journal d'audit rouvrait alors le graphe des adhésions
// qu'une politique venait de fermer. Ce fichier cherche donc les chemins indirects autant que le
// chemin direct.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, withOrg, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
	countIn,
	openDatabase,
	seedOrganisation,
	SQLSTATE,
	sqlStateOfFailure,
	tablesWithoutAppGrant,
	type Organisation
} from './helpers.js';

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let superAdminHandle: DatabaseHandle;
let authHandle: DatabaseHandle;
let owner: Database;
let app: Database;
let superAdmin: Database;
let auth: Database;
let org: Organisation;

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	superAdminHandle = openDatabase('superadmin');
	authHandle = openDatabase('auth');
	owner = ownerHandle.db;
	app = appHandle.db;
	superAdmin = superAdminHandle.db;
	auth = authHandle.db;
	org = await seedOrganisation(owner, 'registre');
});

afterAll(async () => {
	await appHandle?.close();
	await superAdminHandle?.close();
	await authHandle?.close();
	await ownerHandle?.close();
});

async function poserUneEntree(action = 'read', route = '/cours'): Promise<string> {
	const id = newId();
	await superAdmin.execute(sql`
		insert into "admin_access_log"
			("id", "organization_id", "organization_slug", "actor_id", "action", "route")
		values (${id}, ${org.id}, ${org.slug}, ${org.userId}, ${action}, ${route})
	`);
	return id;
}

describe('ce que le super-admin y écrit', () => {
	it('records one entry, with the organisation it visited and the route', async () => {
		const id = await poserUneEntree('read', '/cours');
		const rows = allRows<{ route: string; organization_slug: string; action: string }>(
			await superAdmin.execute(
				sql`select "route", "organization_slug", "action" from "admin_access_log"
					where "id" = ${id}`
			)
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			route: '/cours',
			organization_slug: org.slug,
			action: 'read'
		});
	});

	it('refuses an action it does not know', async () => {
		const state = await sqlStateOfFailure(() => poserUneEntree('espionner'));
		expect(state).toBe(SQLSTATE.checkViolation);
	});

	it('cannot rewrite or erase what it recorded', async () => {
		const id = await poserUneEntree();
		const update = await sqlStateOfFailure(() =>
			superAdmin.execute(
				sql`update "admin_access_log" set "route" = '/ailleurs' where "id" = ${id}`
			)
		);
		const remove = await sqlStateOfFailure(() =>
			superAdmin.execute(sql`delete from "admin_access_log" where "id" = ${id}`)
		);
		expect(update).toBe(SQLSTATE.insufficientPrivilege);
		expect(remove).toBe(SQLSTATE.insufficientPrivilege);
	});

	it('does not choose its own timestamp, any more than in the audit log', async () => {
		const state = await sqlStateOfFailure(() =>
			superAdmin.execute(sql`
				insert into "admin_access_log" ("id", "actor_id", "action", "route", "created_at")
				values (${newId()}, ${org.userId}, 'read', '/cours', now() - interval '1 year')
			`)
		);
		expect(state).toBe(SQLSTATE.insufficientPrivilege);
	});
});

describe('ce que l’organisation ne peut pas en savoir', () => {
	it('is out of the application role’s reach entirely, in context or not', async () => {
		const direct = await sqlStateOfFailure(() =>
			app.execute(sql`select count(*) from "admin_access_log"`)
		);
		const enContexte = await sqlStateOfFailure(() =>
			withOrg(app, org.id, (tx) => tx.execute(sql`select count(*) from "admin_access_log"`))
		);
		// Refus de droit, pas de politique : le message ne dépend donc pas de son contenu, et il
		// tombe avant qu'une ligne soit examinée.
		expect(direct).toBe(SQLSTATE.insufficientPrivilege);
		expect(enContexte).toBe(SQLSTATE.insufficientPrivilege);
	});

	it('is out of the sign-in role’s reach too: it has no business there', async () => {
		const state = await sqlStateOfFailure(() =>
			auth.execute(sql`select count(*) from "admin_access_log"`)
		);
		expect(state).toBe(SQLSTATE.insufficientPrivilege);
	});

	it('leaves nothing in the organisation’s own journal when a read is recorded', async () => {
		const avant = await withOrg(app, org.id, (tx) => countIn(tx, 'audit_log'));
		await poserUneEntree('read', '/membres');
		const apres = await withOrg(app, org.id, (tx) => countIn(tx, 'audit_log'));
		// C'est la décision de l'ADR 0025, et son prix : la consultation ne se voit pas.
		expect(apres).toBe(avant);
	});

	it('is reachable by no join from a table the organisation can read', async () => {
		// Le chemin indirect de l'étape 3 : une table lisible qui en désigne une autre. Aucune clé
		// étrangère ne pointe vers le registre, et aucune n'en part — c'est ce qui le rend
		// inatteignable autrement que par un droit qu'on ne lui a pas donné.
		const liens = allRows<{ n: number }>(
			await owner.execute(sql`
				select count(*)::int as n from pg_constraint c
				join pg_class t on t.oid = c.conrelid
				join pg_class f on f.oid = c.confrelid
				where c.contype = 'f'
					and (t.relname = 'admin_access_log' or f.relname = 'admin_access_log')
			`)
		);
		expect(liens[0]?.n).toBe(0);
	});

	it('grants nothing to any role but the super-admin', async () => {
		// Le propriétaire est écarté : il possède la table, ses droits sont implicites et ne se
		// révoquent pas utilement. C'est lui que l'ADR 0019 borne par le drapeau d'entretien.
		const beneficiaires = allRows<{ grantee: string }>(
			await owner.execute(sql`
				select distinct grantee from information_schema.role_table_grants
				where table_name = 'admin_access_log' and grantee like 'jadwal%'
					and grantee <> 'jadwal_owner'
				order by grantee
			`)
		).map((row) => row.grantee);
		expect(beneficiaires).toEqual(['jadwal_superadmin']);
	});

	it('is one of the two organisation tables the application role cannot touch', async () => {
		// Si une table d'organisation sortait un jour du balayage d'isolation sans qu'on le veuille,
		// c'est ici qu'on le verrait : la liste est close.
		//
		// `retention_hold` l'a rejointe à l'étape 6, et pour la même raison : un verrou que
		// l'application pourrait lever ne serait pas un verrou (ADR 0030).
		expect(await tablesWithoutAppGrant(owner)).toEqual(['admin_access_log', 'retention_hold']);
	});
});

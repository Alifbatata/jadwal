// Ce que la base doit garantir d'elle-même, lu dans les catalogues système : aucune table n'est
// nommée à la main, la liste vient de PostgreSQL. Un oubli sur une table ajoutée plus tard fait
// échouer ce fichier.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database, DatabaseHandle } from '../src/index.js';
import { allRows, firstRow, openDatabase, organizationTables } from './helpers.js';

let handle: DatabaseHandle;
let db: Database;
let tables: string[];

/** Les quatre opérations d'une table, avec la lettre que `pg_policy.polcmd` emploie. */
const COMMANDS = [
	{ grant: 'SELECT', polcmd: 'r' },
	{ grant: 'INSERT', polcmd: 'a' },
	{ grant: 'UPDATE', polcmd: 'w' },
	{ grant: 'DELETE', polcmd: 'd' }
] as const;

const APP_ROLE = 'jadwal_app';
const SUPER_ADMIN_ROLE = 'jadwal_superadmin';
/** Les deux rôles qui se connectent. Le super-admin a ses propres politiques (ADR 0006). */
const AUTH_ROLE = 'jadwal_auth';
const CONNECTING_ROLES = [APP_ROLE, SUPER_ADMIN_ROLE, AUTH_ROLE] as const;

beforeAll(async () => {
	handle = openDatabase('owner');
	db = handle.db;
	tables = await organizationTables(db);
});

afterAll(async () => {
	await handle?.close();
});

describe('catalogue : sécurité au niveau des lignes', () => {
	it('finds every table that carries an organization', () => {
		// Le compte protège d'une requête de catalogue qui ne trouverait rien et passerait à vide.
		expect(tables.length).toBeGreaterThanOrEqual(9);
		expect(tables).toContain('course');
		expect(tables).toContain('audit_log');
	});

	it('enables and forces row level security on every one of them', async () => {
		const result = await db.execute(sql`
			select c.relname as table_name, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
			from pg_class c join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and c.relkind = 'r'
			order by c.relname
		`);
		const rows = allRows<{ table_name: string; enabled: boolean; forced: boolean }>(result);
		const missing = rows.filter((row) => !row.enabled || !row.forced).map((row) => row.table_name);
		expect(missing, 'tables sans RLS activée et forcée').toEqual([]);
		// Toutes les tables du schéma, pas seulement celles qui portent une organisation.
		expect(rows.length).toBeGreaterThanOrEqual(tables.length + 1);
	});

	it('makes every check constraint strict, so that a NULL refuses instead of accepting', async () => {
		// Une contrainte de vérification qui rend NULL accepte la ligne. Presque tout rend NULL au
		// contact d'un NULL : `array_length` d'un tableau vide, une comparaison avec une valeur
		// absente, un `case` sans branche correspondante. Le schéma enveloppe donc chaque contrainte
		// dans `is true` (voir `ck` dans src/schema/index.ts), et ce test le vérifie sans nommer une
		// seule contrainte : une contrainte ajoutée plus tard sans l'enveloppe fait échouer la suite.
		const result = await db.execute(sql`
			select c.conname as name, t.relname as table_name, pg_get_constraintdef(c.oid) as definition
			from pg_constraint c
			join pg_class t on t.oid = c.conrelid
			join pg_namespace n on n.oid = t.relnamespace
			where n.nspname = 'public' and c.contype = 'c'
			order by t.relname, c.conname
		`);
		const rows = allRows<{ name: string; table_name: string; definition: string }>(result);
		expect(rows.length, 'contraintes de vérification trouvées').toBeGreaterThanOrEqual(30);
		const lax = rows
			.filter((row) => !/\bIS\s+TRUE\s*\)*\s*$/i.test(row.definition))
			.map((row) => `${row.table_name}.${row.name}`);
		expect(lax, 'contraintes qui acceptent une ligne quand elles rendent NULL').toEqual([]);
	});

	it.each(CONNECTING_ROLES)('covers with a policy every operation granted to %s', async (role) => {
		// Les droits accordés colonne par colonne — l'insertion dans le journal d'audit, dont
		// l'horodatage est réservé au serveur (ADR 0020) — n'apparaissent pas dans les droits de
		// table. Les ignorer ferait passer la politique correspondante pour une politique sans droit.
		const grants = await db.execute(sql`
			select table_name, privilege_type
			from information_schema.role_table_grants
			where table_schema = 'public' and grantee = ${role}
			union
			select table_name, privilege_type
			from information_schema.column_privileges
			where table_schema = 'public' and grantee = ${role}
		`);
		const granted = new Set(
			allRows<{ table_name: string; privilege_type: string }>(grants).map(
				(row) => `${row.table_name}:${row.privilege_type}`
			)
		);
		const policies = await db.execute(sql`
			select c.relname as table_name, p.polcmd as command
			from pg_policy p
			join pg_class c on c.oid = p.polrelid
			join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and ${role}::regrole = any(p.polroles)
		`);
		const covered = new Set(
			allRows<{ table_name: string; command: string }>(policies).flatMap((row) =>
				row.command === '*'
					? COMMANDS.map((command) => `${row.table_name}:${command.polcmd}`)
					: [`${row.table_name}:${row.command}`]
			)
		);
		const holes: string[] = [];
		const allTables = allRows<{ table_name: string }>(
			await db.execute(sql`
				select c.relname as table_name from pg_class c
				join pg_namespace n on n.oid = c.relnamespace
				where n.nspname = 'public' and c.relkind = 'r'
			`)
		).map((row) => row.table_name);
		for (const table of allTables) {
			for (const command of COMMANDS) {
				const isGranted = granted.has(`${table}:${command.grant}`);
				const isCovered = covered.has(`${table}:${command.polcmd}`);
				// Une opération accordée sans politique laisserait tout passer ; une politique sans
				// droit est morte et cache une intention perdue.
				if (isGranted && !isCovered)
					holes.push(`${table}: ${command.grant} accordé sans politique`);
				if (!isGranted && isCovered) holes.push(`${table}: politique ${command.grant} sans droit`);
			}
		}
		expect(holes).toEqual([]);
	});

	it('uses one policy per operation, never a single one covering them all', async () => {
		// `FOR ALL` se cumule en OU avec les autres et promeut silencieusement son `USING` en
		// `WITH CHECK` : l'ADR 0013 l'interdit seul, et la règle mérite son assertion.
		const result = await db.execute(sql`
			select c.relname as table_name, p.polname as name
			from pg_policy p
			join pg_class c on c.oid = p.polrelid
			join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and p.polcmd = '*'
			order by 1, 2
		`);
		const all = allRows<{ table_name: string; name: string }>(result);
		expect(all.map((row) => `${row.table_name}.${row.name}`)).toEqual([]);
	});

	it('keeps the session tables out of the application role’s reach entirely', async () => {
		// La cohérence droit ↔ politique ne suffit pas ici : un droit accompagné de sa politique
		// passerait, et ce serait la lecture de tous les jetons de session par le rôle applicatif,
		// que l'ADR 0016 interdit. On affirme donc l'absence de droit ET l'absence de politique.
		const interdites = ['session', 'account', 'verification'];
		const droits = allRows<{ table_name: string; privilege_type: string }>(
			await db.execute(sql`
				select table_name, privilege_type from information_schema.role_table_grants
				where table_schema = 'public' and grantee = ${APP_ROLE}
					and table_name in ('session', 'account', 'verification')
				union
				select table_name, privilege_type from information_schema.column_privileges
				where table_schema = 'public' and grantee = ${APP_ROLE}
					and table_name in ('session', 'account', 'verification')
			`)
		);
		expect(
			droits.map((row) => `${row.table_name}:${row.privilege_type}`),
			'droits du rôle applicatif sur les tables de session'
		).toEqual([]);

		const politiques = allRows<{ table_name: string; name: string }>(
			await db.execute(sql`
				select c.relname as table_name, p.polname as name
				from pg_policy p join pg_class c on c.oid = p.polrelid
				where c.relname in ('session', 'account', 'verification')
					and ${APP_ROLE}::regrole = any(p.polroles)
			`)
		);
		expect(
			politiques.map((row) => `${row.table_name}.${row.name}`),
			'politiques nommant le rôle applicatif sur les tables de session'
		).toEqual([]);

		// Et le contrôle ne serait pas honnête s'il portait sur des tables absentes.
		const presentes = allRows<{ relname: string }>(
			await db.execute(sql`
				select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
				where n.nspname = 'public' and c.relkind = 'r'
					and c.relname in ('session', 'account', 'verification')
			`)
		).map((row) => row.relname);
		expect(presentes.sort()).toEqual(interdites.sort());
	});

	it('grants the application role neither UPDATE nor DELETE on the audit log', async () => {
		const result = await db.execute(sql`
			select privilege_type from information_schema.role_table_grants
			where table_schema = 'public' and table_name = 'audit_log' and grantee = ${APP_ROLE}
			union
			select privilege_type from information_schema.column_privileges
			where table_schema = 'public' and table_name = 'audit_log' and grantee = ${APP_ROLE}
		`);
		const privileges = allRows<{ privilege_type: string }>(result).map((row) => row.privilege_type);
		expect(privileges.sort()).toEqual(['INSERT', 'SELECT']);
	});

	it('keeps the audit timestamp out of the application’s reach', async () => {
		// L'insertion est accordée colonne par colonne, et `created_at` n'en fait pas partie : une
		// entrée ne peut être ni antidatée pour tomber dans la fenêtre de purge, ni postdatée pour
		// y échapper (ADR 0020).
		const result = await db.execute(sql`
			select column_name from information_schema.column_privileges
			where table_schema = 'public' and table_name = 'audit_log'
				and grantee = ${APP_ROLE} and privilege_type = 'INSERT'
			order by column_name
		`);
		const columns = allRows<{ column_name: string }>(result).map((row) => row.column_name);
		expect(columns).not.toContain('created_at');
		expect(columns).toContain('action');
	});

	it.each(CONNECTING_ROLES)('keeps %s unprivileged and not an owner', async (role) => {
		// Tous les attributs que la migration d'amorçage prend la peine d'imposer, pas seulement
		// les deux plus connus : un rôle qui peut créer des rôles peut s'en créer un qui voit tout.
		const attributes = firstRow<Record<string, boolean>>(
			await db.execute(sql`
				select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication
				from pg_roles where rolname = ${role}
			`)
		);
		expect(attributes).toEqual({
			rolsuper: false,
			rolbypassrls: false,
			rolcreatedb: false,
			rolcreaterole: false,
			rolreplication: false
		});
		const owned = firstRow<{ count: string }>(
			await db.execute(sql`
				select count(*)::text as count from pg_class c
				join pg_namespace n on n.oid = c.relnamespace
				where n.nspname = 'public' and pg_get_userbyid(c.relowner) = ${role}
			`)
		);
		expect(Number(owned?.count)).toBe(0);
	});
});

describe('catalogue : propriété des objets', () => {
	// Tout ce qui suit est lu par le rôle applicatif, non privilégié : les catalogues employés sont
	// lisibles de tous. `pg_authid` ne l'est pas, d'où `pg_roles`.
	const EXPECTED_OWNER = 'jadwal_owner';
	const SCHEMAS = ['public', 'jadwal', 'drizzle'];
	// Drizzle développe un tableau JavaScript en une liste de paramètres, pas en littéral de
	// tableau : `= any($1, $2, $3)` ne serait pas du SQL valide. Les trois noms sont des constantes
	// du fichier, jamais une saisie.
	const SCHEMA_LIST = sql.raw(SCHEMAS.map((name) => `'${name}'`).join(', '));

	it('gives every object of every schema to the expected owner', async () => {
		// Les objets d'une **extension** sont exclus, et seulement eux. `btree_gist` est *trusted* :
		// PostgreSQL l'installe comme s'il était posé par un superutilisateur, et ses deux cents
		// fonctions de support appartiennent donc au rôle d'amorçage — ce n'est pas notre choix, et
		// ce n'est pas notre code. `pg_depend` les nomme exactement (`deptype = 'e'`), ce qui vaut
		// mieux que de les exclure par leur préfixe.
		const membreDExtension = sql`exists (
			select 1 from pg_depend dep
			where dep.classid = 'pg_class'::regclass and dep.objid = c.oid and dep.deptype = 'e'
		)`;
		const result = await db.execute(sql`
			select 'schéma ' || n.nspname as objet, pg_get_userbyid(n.nspowner) as proprietaire
			from pg_namespace n where n.nspname in (${SCHEMA_LIST})
			union all
			select 'relation ' || n.nspname || '.' || c.relname, pg_get_userbyid(c.relowner)
			from pg_class c join pg_namespace n on n.oid = c.relnamespace
			where n.nspname in (${SCHEMA_LIST}) and c.relkind in ('r','p','v','m','f','S','i','I')
				and not ${membreDExtension}
			union all
			select 'fonction ' || n.nspname || '.' || p.proname, pg_get_userbyid(p.proowner)
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname in (${SCHEMA_LIST})
				and not exists (
					select 1 from pg_depend dep
					where dep.classid = 'pg_proc'::regclass and dep.objid = p.oid and dep.deptype = 'e'
				)
			order by 1
		`);
		const rows = allRows<{ objet: string; proprietaire: string }>(result);
		// Le compte protège d'une requête de catalogue qui ne trouverait rien et passerait à vide.
		expect(rows.length).toBeGreaterThanOrEqual(40);
		const etrangers = rows
			.filter((row) => row.proprietaire !== EXPECTED_OWNER)
			.map((row) => `${row.objet} appartient à ${row.proprietaire}`);
		expect(etrangers, 'objets qui n’appartiennent pas au propriétaire attendu').toEqual([]);
	});

	it('installs no extension beyond the one the exclusion constraint needs', async () => {
		// Le corollaire du test précédent : puisqu'on cesse de regarder les objets d'extension, la
		// liste des extensions elle-même devient la chose à tenir. `plpgsql` est là depuis la
		// création de la base ; `btree_gist` sert à interdire deux périodes qui se chevauchent.
		const extensions = allRows<{ extname: string }>(
			await db.execute(sql`select extname from pg_extension order by 1`)
		).map((row) => row.extname);
		expect(extensions).toEqual(['btree_gist', 'plpgsql']);
	});

	it('keeps the owner unprivileged, directly and through any role it belongs to', async () => {
		// L'attribut ne s'hérite pas, mais l'appartenance ouvre `set role`, qui prend les attributs
		// de la cible : l'audit doit donc suivre la transitivité.
		const result = await db.execute(sql`
			with recursive lui_et_ses_groupes as (
				select r.oid, r.rolname from pg_roles r where r.rolname = ${EXPECTED_OWNER}
				union
				select r.oid, r.rolname from lui_et_ses_groupes g
				join pg_auth_members m on m.member = g.oid
				join pg_roles r on r.oid = m.roleid
			)
			select g.rolname as role, r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole,
				r.rolreplication
			from lui_et_ses_groupes g join pg_roles r on r.oid = g.oid order by 1
		`);
		const roles = allRows<{
			role: string;
			rolsuper: boolean;
			rolbypassrls: boolean;
			rolcreatedb: boolean;
			rolcreaterole: boolean;
			rolreplication: boolean;
		}>(result);
		expect(roles.map((row) => row.role)).toEqual([EXPECTED_OWNER]);
		for (const role of roles) {
			expect(role, role.role).toEqual({
				role: role.role,
				rolsuper: false,
				rolbypassrls: false,
				rolcreatedb: false,
				rolcreaterole: false,
				rolreplication: false
			});
		}
	});

	it('covers every table with the owner’s maintenance policies', async () => {
		// Une table ajoutée par une migration ultérieure sans ses politiques d'entretien laisserait
		// le propriétaire incapable d'y écrire — et, pire, ses `update` rendraient « 0 ligne » sans
		// rien dire. On vérifie donc la couverture, sans nommer une seule table.
		const result = await db.execute(sql`
			select c.relname as table_name,
				count(*) filter (where ${EXPECTED_OWNER}::regrole = any(p.polroles)) as politiques
			from pg_class c
			join pg_namespace n on n.oid = c.relnamespace
			left join pg_policy p on p.polrelid = c.oid
			where n.nspname = 'public' and c.relkind = 'r'
			group by 1 order by 1
		`);
		const rows = allRows<{ table_name: string; politiques: string }>(result);
		expect(rows.length).toBeGreaterThanOrEqual(tables.length);
		const manquantes = rows
			// Le journal d'audit n'en a que deux : il reste en ajout seul, même pour le propriétaire.
			.filter((row) => Number(row.politiques) < (row.table_name === 'audit_log' ? 2 : 4))
			.map((row) => `${row.table_name} : ${row.politiques}`);
		expect(manquantes, 'tables sans politiques d’entretien du propriétaire').toEqual([]);
	});
});

describe('catalogue : intégrité du schéma', () => {
	it('indexes every foreign key', async () => {
		// Une clé étrangère sans index rend les suppressions en cascade coûteuses et les jointures
		// lentes. On compare les colonnes de la clé au début d'un index.
		const result = await db.execute(sql`
			select c.relname as table_name, con.conname as constraint_name
			from pg_constraint con
			join pg_class c on c.oid = con.conrelid
			join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and con.contype = 'f'
				and not exists (
					select 1 from pg_index i
					where i.indrelid = con.conrelid
						and (i.indkey::smallint[])[0:array_length(con.conkey, 1) - 1] @> con.conkey
						and array_length(con.conkey, 1) <= i.indnatts
						and (i.indkey::smallint[])[0:array_length(con.conkey, 1) - 1] <@ con.conkey
				)
			order by 1, 2
		`);
		expect(allRows<{ constraint_name: string }>(result).map((row) => row.constraint_name)).toEqual(
			[]
		);
	});

	it('gives every table a primary key', async () => {
		const result = await db.execute(sql`
			select c.relname as table_name from pg_class c
			join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and c.relkind = 'r'
				and not exists (select 1 from pg_constraint con where con.conrelid = c.oid and con.contype = 'p')
			order by 1
		`);
		expect(allRows<{ table_name: string }>(result).map((row) => row.table_name)).toEqual([]);
	});

	it('keeps the context functions stable and never leakproof', async () => {
		const result = await db.execute(sql`
			select p.proname as name, p.provolatile as volatility, p.proleakproof as leakproof
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'jadwal' order by 1
		`);
		const functions = allRows<{ name: string; volatility: string; leakproof: boolean }>(result);
		expect(functions.map((row) => row.name)).toEqual([
			'consume_invitation',
			'count_view',
			'current_org_id',
			'current_user_id',
			'has_no_duplicate',
			'invited',
			'maintenance',
			'purge_admin_access_log',
			'purge_audit_log',
			'purge_expired_sessions',
			'purge_expired_verifications',
			'purge_orphan_accounts',
			'purge_page_views',
			'purge_rate_limit',
			'purge_resolved_invitations',
			'refuse_last_org_admin',
			'refuse_prayer_course_without_module',
			'refuse_prayer_module_off'
		]);
		// Une fonction leakproof serait évaluée avant le filtre de sécurité (ADR 0013).
		expect(functions.filter((row) => row.leakproof)).toEqual([]);

		// Ce que le rôle public peut exécuter dans ce schéma, et **rien d'autre**. Depuis l'étape 8
		// il y entre — il lui faut `count_view` — et cette liste est la contrepartie de ce droit.
		//   `count_view` : la seule écriture du compteur de vues, en `SECURITY DEFINER` (ADR 0032).
		//   `has_no_duplicate` : compare les éléments d'un tableau, ne touche à aucune table, et
		//   sert à des contraintes de vérification que toutes les écritures traversent.
		const executables = allRows<{ name: string }>(
			await db.execute(sql`
				select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				where n.nspname = 'jadwal'
					and has_function_privilege('jadwal_public', p.oid, 'EXECUTE')
				order by 1
			`)
		).map((row) => row.name);
		expect(executables).toEqual(['count_view', 'has_no_duplicate']);

		// Et une fonction `SECURITY DEFINER` sans `search_path` figé serait détournable par un
		// schéma temporaire de l'appelant : on exige la clause sur chacune.
		const definers = allRows<{ name: string; config: string[] | null }>(
			await db.execute(sql`
				select p.proname as name, p.proconfig as config
				from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				where n.nspname = 'jadwal' and p.prosecdef order by 1
			`)
		);
		expect(definers.length).toBeGreaterThanOrEqual(2);
		for (const row of definers) {
			expect(row.config?.join(' ') ?? '', `${row.name} sans search_path figé`).toContain(
				'search_path='
			);
		}

		// La volatilité ne compte que pour les fonctions qu'une politique appelle : une fonction
		// volatile y serait réévaluée à chaque ligne, et son résultat pourrait changer en cours de
		// requête. Les autres — la purge, le déclencheur — écrivent, donc elles sont volatiles par
		// nature. On lit les définitions des politiques pour savoir lesquelles sont concernées,
		// plutôt que de les nommer.
		const policies = allRows<{ definition: string }>(
			await db.execute(sql`
				select coalesce(qual, '') || ' ' || coalesce(with_check, '') as definition
				from pg_policies where schemaname = 'public'
			`)
		)
			.map((row) => row.definition)
			.join(' ');
		const called = functions.filter((row) => policies.includes(`${row.name}(`));
		expect(called.length, 'fonctions appelées par une politique').toBeGreaterThanOrEqual(3);
		for (const row of called) {
			expect(['s', 'i'], `${row.name} doit être stable ou immuable`).toContain(row.volatility);
		}
	});
});

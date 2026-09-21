// Aides des tests de base. Tout passe par le rôle applicatif non privilégié : un test joué sous le
// propriétaire ou un superutilisateur prouverait le contraire de ce qu'il affirme (ADR 0013).

import { sql } from 'drizzle-orm';
import { inject } from 'vitest';
import {
	createDatabase,
	loadDotEnv,
	newId,
	withOrg,
	type Database,
	type DatabaseHandle,
	type DatabaseRole,
	type OrgContext,
	type Transaction
} from '../src/index.js';

// Chaque fichier de test tourne dans son propre processus : le `.env` de la racine doit y être
// chargé aussi, pas seulement dans la préparation globale.
loadDotEnv();

/** Ouvre une connexion sur la base de test avec le rôle demandé. */
export function openDatabase(role: DatabaseRole = 'app'): DatabaseHandle {
	return createDatabase({ role, overrides: { database: inject('testDatabase') }, max: 4 });
}

export interface Organisation {
	id: string;
	slug: string;
	userId: string;
}

/**
 * Ouvre une transaction sous le drapeau d'entretien du propriétaire. Depuis l'étape 3, le
 * propriétaire est soumis à la sécurité au niveau des lignes comme les autres (ADR 0019) : hors de
 * ce drapeau il ne voit rien et n'écrit rien, et un `update` refusé rendrait « 0 ligne » sans rien
 * dire. Les fixtures le posent donc explicitement, comme le fait le script de démonstration.
 */
export async function withMaintenance<T>(
	owner: Database,
	callback: (tx: Transaction) => Promise<T>
): Promise<T> {
	return owner.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		return callback(tx);
	});
}

/** Crée une organisation complète (salle, cours, traduction, exception, pause, journal) en tant que propriétaire. */
export async function seedOrganisation(owner: Database, slug: string): Promise<Organisation> {
	const id = newId();
	const userId = newId();
	const roomId = newId();
	const courseId = newId();
	await withMaintenance(owner, async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language", "enabled_language")
			values (${id}, ${slug}, ${`Mosquée ${slug}`}, 'Europe/Zurich', 'fr', array['fr','de'])
		`);
		await tx.execute(sql`
			insert into "user" ("id", "email", "name") values (${userId}, ${`${slug}@example.test`}, ${`Responsable ${slug}`})
		`);
		await tx.execute(sql`
			insert into "membership" ("id", "organization_id", "user_id", "role")
			values (${newId()}, ${id}, ${userId}, 'org_admin')
		`);
		await tx.execute(sql`
			insert into "room" ("id", "organization_id", "name", "display_order")
			values (${roomId}, ${id}, ${`Salle ${slug}`}, 1)
		`);
		await tx.execute(sql`
			insert into "course" (
				"id", "organization_id", "status", "audience", "teaching_language", "room_id",
				"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
				"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "starts_on"
			) values (
				${courseId}, ${id}, 'published', 'adults', array['fr'], ${roomId},
				'fr', 'weekly', array[1]::smallint[], 1, '2026-09-07', 'fixed', '19:00', '20:30', '2026-09-07'
			)
		`);
		await tx.execute(sql`
			insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
			values (${newId()}, ${id}, ${courseId}, 'fr', ${`Cours de ${slug}`})
		`);
		await tx.execute(sql`
			insert into "session_exception" ("id", "organization_id", "course_id", "date", "kind")
			values (${newId()}, ${id}, ${courseId}, '2026-09-21', 'cancelled')
		`);
		await tx.execute(sql`
			insert into "pause" ("id", "organization_id", "from_date", "to_date", "reason")
			values (${newId()}, ${id}, '2026-12-21', '2027-01-03', 'Vacances')
		`);
		await tx.execute(sql`
			insert into "prayer_day" ("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib", "isha", "source")
			values (${id}, '2026-09-21', '05:40', '13:20', '16:50', '19:27', '21:00', 'import')
		`);
		await tx.execute(sql`
			insert into "prayer_settings" ("organization_id") values (${id})
		`);
		// Une période d'horaires, comme pour toute table d'organisation : les balayages d'isolation
		// parcourent la liste des tables et attendent exactement une ligne par organisation.
		await tx.execute(sql`
			insert into "prayer_period" ("id", "organization_id", "name", "from_date", "to_date",
				"maghrib_iqama_offset")
			values (${newId()}, ${id}, ${`Horaires ${slug}`}, '2026-09-01', null, 5)
		`);
		await tx.execute(sql`
			insert into "audit_log" ("id", "organization_id", "actor_id", "action", "target_table", "target_id")
			values (${newId()}, ${id}, ${userId}, 'course.create', 'course', ${courseId})
		`);
		await tx.execute(sql`
			insert into "invitation" ("id", "organization_id", "email", "role", "invited_by", "expires_at")
			values (${newId()}, ${id}, ${`invite-${slug}@example.test`}, 'editor', ${userId},
				now() + interval '14 days')
		`);
		// Une ligne de compteur, comme pour toute table d'organisation : les tests d'isolation
		// parcourent la liste des tables et attendent exactement une ligne par organisation.
		await tx.execute(sql`
			insert into "page_view" ("organization_id", "day", "kind", "count")
			values (${id}, '2026-09-21', 'page', 3)
		`);
	});
	return { id, slug, userId };
}

/**
 * Rattache quelqu'un à une organisation par le chemin réel : une invitation, puis son acceptation
 * par la personne elle-même. La base n'en accepte pas d'autre — on ne s'attache que soi-même, et
 * seulement si l'on a été invité (ADR 0017).
 */
export async function joinOrganisation(
	owner: Database,
	app: Database,
	organizationId: string,
	userId: string,
	email: string,
	role: 'org_admin' | 'editor' = 'editor'
): Promise<void> {
	await withMaintenance(owner, (tx) =>
		tx.execute(sql`
			insert into "invitation" ("id", "organization_id", "email", "role", "expires_at")
			values (${newId()}, ${organizationId}, ${email}, ${role}, now() + interval '7 days')
		`)
	);
	await app.transaction(async (tx) => {
		await tx.execute(sql`select set_config('jadwal.org_id', '', true)`);
		await tx.execute(sql`select set_config('jadwal.user_id', ${userId}, true)`);
		await tx.execute(sql`
			update "invitation" set "status" = 'accepted', "accepted_by" = ${userId}, "resolved_at" = now()
			where "organization_id" = ${organizationId} and "status" = 'pending'
		`);
		await tx.execute(sql`select set_config('jadwal.org_id', ${organizationId}, true)`);
		await tx.execute(sql`
			insert into "membership" ("id", "organization_id", "user_id", "role")
			values (${newId()}, ${organizationId}, ${userId}, ${role})
		`);
	});
}

/** Compte les lignes visibles d'une table, dans le contexte donné. */
export async function countVisible(
	db: Database,
	context: OrgContext | string,
	table: string
): Promise<number> {
	return withOrg(db, context, async (tx) => countIn(tx, table));
}

/** Compte les lignes visibles d'une table dans une transaction déjà contextualisée. */
export async function countIn(
	tx: Transaction | Database,
	table: string,
	where?: ReturnType<typeof sql.raw>
): Promise<number> {
	const rows = await tx.execute(
		sql`select count(*)::text as count from ${sql.identifier(table)} ${where ?? sql.raw('')}`
	);
	return Number(firstRow<{ count: string }>(rows)?.count ?? '0');
}

/**
 * Première ligne d'un résultat. postgres.js rend un tableau ; le typage de Drizzle passe par une
 * forme commune aux pilotes, d'où cette lecture défensive.
 */
export function firstRow<T>(result: unknown): T | undefined {
	if (Array.isArray(result)) return result[0] as T | undefined;
	const rows = (result as { rows?: unknown[] }).rows;
	return Array.isArray(rows) ? (rows[0] as T | undefined) : undefined;
}

export function allRows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const rows = (result as { rows?: unknown[] }).rows;
	return Array.isArray(rows) ? (rows as T[]) : [];
}

/**
 * Les tables d'organisation **que le rôle applicatif peut toucher**. Le filtre sur les droits n'est
 * pas un détail : depuis l'étape 4, `admin_access_log` porte une colonne `organization_id` sans
 * qu'aucun droit ne soit accordé au rôle applicatif (ADR 0025). L'y inclure ferait échouer les
 * balayages d'isolation sur un refus de droit, là où ils cherchent « zéro ligne ». Qu'elle reste
 * hors de portée est vérifié ailleurs, dans `admin-access-log.test.ts`, et
 * `tablesWithoutAppGrant` ci-dessous empêche qu'une table y disparaisse en silence.
 */
export async function organizationTables(db: Database): Promise<string[]> {
	const result = await db.execute<{ table_name: string }>(sql`
		select c.relname as table_name
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		join pg_attribute a on a.attrelid = c.oid
		where n.nspname = 'public' and c.relkind = 'r'
			and a.attname = 'organization_id' and a.attnum > 0 and not a.attisdropped
			and exists (
				select 1 from information_schema.role_table_grants g
				where g.table_schema = 'public' and g.table_name = c.relname
					and g.grantee = 'jadwal_app'
			)
		order by c.relname
	`);
	return allRows<{ table_name: string }>(result).map((row) => row.table_name);
}

/** Les tables d'organisation que le rôle applicatif ne peut pas toucher du tout. */
export async function tablesWithoutAppGrant(db: Database): Promise<string[]> {
	const result = await db.execute<{ table_name: string }>(sql`
		select c.relname as table_name
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		join pg_attribute a on a.attrelid = c.oid
		where n.nspname = 'public' and c.relkind = 'r'
			and a.attname = 'organization_id' and a.attnum > 0 and not a.attisdropped
			and not exists (
				select 1 from information_schema.role_table_grants g
				where g.table_schema = 'public' and g.table_name = c.relname
					and g.grantee = 'jadwal_app'
			)
		order by c.relname
	`);
	return allRows<{ table_name: string }>(result).map((row) => row.table_name);
}

/**
 * Code SQLSTATE d'une erreur PostgreSQL. Drizzle enveloppe l'erreur du pilote dans une
 * `DrizzleQueryError` dont le message ne dit que « Failed query » : le code se lit dans la cause.
 */
export function sqlStateOf(error: unknown): string | undefined {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
		const code = (current as { code?: unknown }).code;
		if (typeof code === 'string') return code;
		current = (current as { cause?: unknown }).cause;
	}
	return undefined;
}

/** Codes attendus dans les tests d'isolation. */
export const SQLSTATE = {
	/** Droit refusé, et violation d'une politique de sécurité de ligne. */
	insufficientPrivilege: '42501',
	foreignKeyViolation: '23503',
	uniqueViolation: '23505',
	checkViolation: '23514',
	/** Levé par le déclencheur qui protège la dernière personne responsable d'une organisation. */
	restrictViolation: '23001',
	/**
	 * Une insertion refusée par une politique de sécurité de ligne. Même code qu'un refus de droit :
	 * seul le message les distingue, d'où `messageOfFailure` quand la différence compte.
	 */
	rlsViolation: '42501'
} as const;

/**
 * Message de l'erreur PostgreSQL, lu dans la cause pour la même raison que le code. Il sert à
 * distinguer un refus de droit d'un refus de politique : les deux portent le code 42501.
 */
export async function messageOfFailure(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
	} catch (error) {
		let current: unknown = error;
		for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
			if (typeof (current as { code?: unknown }).code === 'string') return current.message;
			current = (current as { cause?: unknown }).cause;
		}
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error('aucune erreur levée, alors que le test en attend une');
}

/** Joue `run` et rend le code SQLSTATE de l'erreur ; échoue si rien n'est levé. */
export async function sqlStateOfFailure(run: () => Promise<unknown>): Promise<string | undefined> {
	try {
		await run();
	} catch (error) {
		return sqlStateOf(error);
	}
	throw new Error('expected the statement to fail');
}

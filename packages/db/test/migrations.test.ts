// Migrations : le journal est cohérent, elles s'appliquent depuis une base vide et se rejouent sans
// rien changer. Drizzle ne compare que l'horodatage de la dernière migration appliquée : un fichier
// modifié après coup ou une entrée antidatée passeraient inaperçus, d'où les contrôles de forme.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database, DatabaseHandle } from '../src/index.js';
import { runMigrations } from '../scripts/migrate.mjs';
import { allRows, firstRow, openDatabase } from './helpers.js';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationsDir = join(packageDir, 'migrations');

interface JournalEntry {
	idx: number;
	when: number;
	tag: string;
	breakpoints: boolean;
}

const journal = JSON.parse(readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf8')) as {
	version: string;
	dialect: string;
	entries: JournalEntry[];
};

let handle: DatabaseHandle;
let db: Database;

beforeAll(async () => {
	handle = openDatabase('owner');
	db = handle.db;
});

afterAll(async () => {
	await handle?.close();
});

describe('forme du dossier de migrations', () => {
	it('lists every SQL file in the journal, and nothing else', () => {
		const files = readdirSync(migrationsDir)
			.filter((name) => name.endsWith('.sql'))
			.map((name) => name.replace(/\.sql$/, ''))
			.sort();
		expect(journal.entries.map((entry) => entry.tag).sort()).toEqual(files);
		expect(files.length).toBeGreaterThanOrEqual(3);
	});

	it('keeps the journal strictly increasing, in order', () => {
		// Une entrée antidatée serait ignorée en silence par Drizzle, qui ne compare que
		// l'horodatage de la dernière migration appliquée.
		const entries = journal.entries;
		for (const [position, entry] of entries.entries()) {
			expect(entry.idx, `idx de ${entry.tag}`).toBe(position);
			expect(entry.tag.startsWith(String(position).padStart(4, '0')), entry.tag).toBe(true);
			const previous = entries[position - 1];
			if (previous) {
				expect(entry.when, `${entry.tag} après ${previous.tag}`).toBeGreaterThan(previous.when);
			}
		}
	});

	it('uses the statement separator that the runtime expects', () => {
		for (const entry of journal.entries) {
			const text = readFileSync(join(migrationsDir, `${entry.tag}.sql`), 'utf8');
			expect(entry.breakpoints, entry.tag).toBe(true);
			expect(text.trim().length, entry.tag).toBeGreaterThan(0);
			// Un fichier d'une seule instruction n'a pas de séparateur, et c'est normal. Dès qu'il y
			// en a deux, il en faut un : sans lui, le pilote enverrait tout d'un bloc. Un fichier qui
			// contient un bloc entre dollars échappe au comptage : les point-virgules y appartiennent
			// au corps de la fonction, pas au fichier.
			const hasDollarBlock = text.includes('$');
			const statements = text.split(';').filter((part) => part.trim().length > 0);
			if (!hasDollarBlock && statements.length > 1) {
				expect(text.includes('--> statement-breakpoint'), entry.tag).toBe(true);
			}
		}
	});
});

describe('application des migrations', () => {
	it('has applied every migration of the journal to the test database', async () => {
		const rows = allRows<{ created_at: string }>(
			await db.execute(sql`select created_at from drizzle.__drizzle_migrations order by created_at`)
		);
		expect(rows).toHaveLength(journal.entries.length);
	});

	it('changes nothing when replayed', async () => {
		const before = await schemaFingerprint(db);
		const countBefore = await appliedCount(db);
		await runMigrations({ database: handle.settings.database });
		expect(await appliedCount(db)).toBe(countBefore);
		expect(await schemaFingerprint(db)).toEqual(before);
	});

	it('really replays the hand-written migrations, and they change nothing', async () => {
		// Le test précédent appelle `runMigrations`, qui saute tout ce qui est déjà appliqué : aucun
		// SQL n'est rejoué. Une migration écrite à la main qui ne supporterait pas d'être rejouée
		// passerait donc inaperçue. Ici, les fichiers marqués `@rejouable` sont exécutés pour de
		// bon, instruction par instruction.
		const replayable = journal.entries.filter((entry) =>
			readFileSync(join(migrationsDir, `${entry.tag}.sql`), 'utf8').includes('-- @rejouable')
		);
		expect(replayable.length, 'migrations marquées rejouables').toBeGreaterThanOrEqual(2);

		const before = await schemaFingerprint(db);
		for (const entry of replayable) {
			const statements = readFileSync(join(migrationsDir, `${entry.tag}.sql`), 'utf8')
				.split('--> statement-breakpoint')
				.map((text) => text.trim())
				// Un morceau qui n'est plus que du commentaire n'est pas une instruction.
				.filter((text) => text.replace(/^--.*$/gm, '').trim().length > 0);
			expect(statements.length, entry.tag).toBeGreaterThan(0);
			await db.transaction(async (tx) => {
				for (const statement of statements) {
					await tx.execute(sql.raw(statement));
				}
			});
		}
		expect(await schemaFingerprint(db)).toEqual(before);
	});

	it('leaves the hardening in place after a replay', async () => {
		const notForced = allRows<{ relname: string }>(
			await db.execute(sql`
				select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
				where n.nspname = 'public' and c.relkind = 'r'
					and (not c.relrowsecurity or not c.relforcerowsecurity)
			`)
		);
		expect(notForced).toEqual([]);
	});
});

async function appliedCount(db: Database): Promise<number> {
	const row = firstRow<{ count: string }>(
		await db.execute(sql`select count(*)::text as count from drizzle.__drizzle_migrations`)
	);
	return Number(row?.count);
}

/** Empreinte du schéma : tables, colonnes, contraintes, index et politiques. */
async function schemaFingerprint(db: Database): Promise<string[]> {
	const columns = allRows<{ line: string }>(
		await db.execute(sql`
			select c.relname || '.' || a.attname || ':' || format_type(a.atttypid, a.atttypmod)
				|| case when a.attnotnull then ' not null' else '' end as line
			from pg_class c
			join pg_namespace n on n.oid = c.relnamespace
			join pg_attribute a on a.attrelid = c.oid
			where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
			order by 1
		`)
	);
	const constraints = allRows<{ line: string }>(
		await db.execute(sql`
			select con.conname || ' ' || pg_get_constraintdef(con.oid) as line
			from pg_constraint con join pg_namespace n on n.oid = con.connamespace
			where n.nspname = 'public' order by 1
		`)
	);
	const indexes = allRows<{ line: string }>(
		await db.execute(
			sql`select indexdef as line from pg_indexes where schemaname = 'public' order by 1`
		)
	);
	const policies = allRows<{ line: string }>(
		await db.execute(sql`
			select tablename || '.' || policyname || ' ' || cmd || ' ' || coalesce(qual, '-')
				|| ' ' || coalesce(with_check, '-') as line
			from pg_policies where schemaname = 'public' order by 1
		`)
	);
	return [...columns, ...constraints, ...indexes, ...policies].map((row) => row.line);
}

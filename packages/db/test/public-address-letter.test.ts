// Une adresse publique a au moins une lettre, et la base le tient depuis la migration 0074 : le
// comptage qui précède la règle, sur les données déjà là (étape 20).
//
// Avant l'étape 19, l'écran du super-admin acceptait « 2026 », et proposait « 2 » pour un nom arabe
// suivi d'un chiffre. Une base en service peut donc porter une adresse sans lettre. La migration
// refuse alors de s'appliquer, en disant combien, et ne réécrit jamais une adresse : une adresse
// publique ne change pas (`packages/db/README.md`). Le comptage lit la table sous le drapeau
// d'entretien : hors de lui, le propriétaire ne voit aucune organisation, et le compte rendrait zéro
// sans rien dire, le défaut de la migration 0050 (`prayer-module-repair.test.ts`).
//
// Chaque essai rejoue le fichier tel qu'il est, sous le propriétaire, dans une transaction que l'on
// annule à la fin : la base de test n'en garde rien, et le rejeu de `migrations.test.ts` n'y trouve
// aucune adresse sans lettre.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, type Database, type DatabaseHandle, type Transaction } from '../src/index.js';
import { allRows, firstRow, messageOfFailure, openDatabase, sqlStateOfFailure } from './helpers.js';

const migrationsDir = join(dirname(dirname(fileURLToPath(import.meta.url))), 'migrations');

/** La migration qui pose la règle. */
const REGLE = '0074_organization_slug_letter';

let ownerHandle: DatabaseHandle;
let owner: Database;

beforeAll(() => {
	ownerHandle = openDatabase('owner');
	owner = ownerHandle.db;
});

afterAll(async () => {
	await ownerHandle?.close();
});

/** Les instructions d'un fichier de migration, découpées comme Drizzle les envoie. */
function instructions(tag: string): string[] {
	return readFileSync(join(migrationsDir, `${tag}.sql`), 'utf8')
		.split('--> statement-breakpoint')
		.map((text) => text.trim())
		.filter((text) => text.replace(/^--.*$/gm, '').trim().length > 0);
}

async function jouer(tx: Transaction, tag: string): Promise<void> {
	for (const instruction of instructions(tag)) await tx.execute(sql.raw(instruction));
}

async function drapeau(tx: Transaction, valeur: 'on' | 'off'): Promise<void> {
	await tx.execute(sql`select set_config('jadwal.maintenance', ${valeur}, true)`);
}

/** L'erreur qui annule une transaction d'essai, une fois le résultat lu. */
class Annulee extends Error {}

/** Joue `essai` dans une transaction du propriétaire, puis l'annule : rien ne reste. */
async function sansRienGarder<T>(essai: (tx: Transaction) => Promise<T>): Promise<T> {
	let resultat: { valeur: T } | undefined;
	try {
		await owner.transaction(async (tx) => {
			resultat = { valeur: await essai(tx) };
			throw new Annulee();
		});
	} catch (error) {
		if (!(error instanceof Annulee)) throw error;
	}
	if (!resultat) throw new Error('essai sans résultat');
	return resultat.valeur;
}

/** La règle est-elle posée ? Lu dans le catalogue, que la sécurité au niveau des lignes ignore. */
async function reglePosee(tx: Transaction): Promise<boolean> {
	const trouvee = await tx.execute(sql`
		select 1 from pg_constraint
		where conrelid = 'public.organization'::regclass and conname = 'organization_slug_letter_ck'
	`);
	return allRows(trouvee).length === 1;
}

/**
 * L'état d'avant 0074 : la règle retirée, puis deux adresses sans lettre écrites sous le drapeau,
 * et le drapeau coupé, comme il l'est quand la migration commence.
 */
async function avant0074(tx: Transaction): Promise<string[]> {
	await tx.execute(sql`
		alter table "organization" drop constraint if exists "organization_slug_letter_ck"
	`);
	await drapeau(tx, 'on');
	const ids = [newId(), newId()];
	for (const [id, slug] of [
		[ids[0], '2026'],
		[ids[1], '12-34']
	] as const) {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language")
			values (${id}, ${slug}, ${`Sans lettre ${slug}`}, 'Europe/Zurich', 'fr', array['fr'])
		`);
	}
	await drapeau(tx, 'off');
	return ids.map(String);
}

describe('la migration 0074 sur les données déjà là', () => {
	it('refuses to apply over addresses without a letter, says how many, and rewrites none', async () => {
		const constat = await sansRienGarder(async (tx) => {
			const ids = await avant0074(tx);
			// Le fichier est joué dans un point de sauvegarde : son refus n'annule que lui, et la
			// suite lit ce qu'il a laissé. Joué deux fois, pour le code puis pour le message.
			const jeu = () => tx.transaction((point) => jouer(point, REGLE));
			const code = await sqlStateOfFailure(jeu);
			const message = await messageOfFailure(jeu);
			await drapeau(tx, 'on');
			const adresses = allRows<{ slug: string }>(
				await tx.execute(sql`
					select "slug" from "organization"
					where "id" in (${ids[0] ?? ''}, ${ids[1] ?? ''}) order by "slug"
				`)
			).map((ligne) => ligne.slug);
			await drapeau(tx, 'off');
			return { code, message, adresses, posee: await reglePosee(tx) };
		});
		expect(constat.code).toBe('P0001');
		expect(constat.message).toMatch(
			/^organization : 2 adresse\(s\) publique\(s\) sans aucune lettre/
		);
		// Aucune adresse n'est réécrite, et la règle n'est pas posée.
		expect(constat.adresses).toEqual(['12-34', '2026']);
		expect(constat.posee).toBe(false);
	});

	it('applies over addresses that all have a letter, and leaves the maintenance flag off', async () => {
		const constat = await sansRienGarder(async (tx) => {
			await tx.execute(sql`
				alter table "organization" drop constraint if exists "organization_slug_letter_ck"
			`);
			await drapeau(tx, 'off');
			await jouer(tx, REGLE);
			const flag = firstRow<{ on: boolean }>(
				await tx.execute(sql`select jadwal.maintenance() as "on"`)
			);
			return { posee: await reglePosee(tx), drapeau: flag?.on };
		});
		expect(constat).toEqual({ posee: true, drapeau: false });
	});
});

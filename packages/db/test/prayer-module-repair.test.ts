// Le module des heures de prière, allumé par la migration 0050 pour les organisations qui s'en
// servaient déjà : une mise à jour jouée sans le drapeau d'entretien, et sa réparation (étape 19,
// lot 2, ADR 0042 et 0019).
//
// Le propriétaire est soumis à la sécurité au niveau des lignes (ADR 0019) : hors de son drapeau, il
// ne voit aucune ligne, et un `update` rend « 0 ligne » sans rien dire. La migration 0050 a posé la
// colonne, éteinte par défaut, puis a voulu l'allumer là où les heures de prière servaient déjà. Sur
// une base qui avait déjà des organisations, cette mise à jour n'a touché aucune ligne. Sur une base
// vide, comme celle des tests, il n'y a rien à toucher : aucun test ne pouvait le voir.
//
// Chaque essai rejoue les fichiers de migration tels qu'ils sont, sous le propriétaire, dans une
// transaction que l'on annule à la fin : la base de test n'en garde rien. Les fichiers de ce paquet
// passent un par un (`vitest.config.ts`) : la colonne retirée le temps d'un essai ne gêne personne.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, type Database, type DatabaseHandle, type Transaction } from '../src/index.js';
import { allRows, openDatabase } from './helpers.js';

const migrationsDir = join(dirname(dirname(fileURLToPath(import.meta.url))), 'migrations');

/** La migration qui répare ce que 0050 n'a pas fait. */
const REPARATION = '0072_prayer_module_repair';

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

/**
 * Ce dont une organisation se sert : un cours ancré sur une prière, une session du vendredi, des
 * réglages et des jours importés seulement, ou rien.
 */
type Usage = 'ancre' | 'vendredi' | 'reglages' | 'rien';

/** Une organisation, son module allumé, et ce dont elle se sert. Sous le drapeau d'entretien. */
async function organisation(tx: Transaction, usage: Usage): Promise<string> {
	const id = newId();
	await tx.execute(sql`
		insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
			"enabled_language", "prayer_module")
		values (${id}, ${`module-${usage}-${id.slice(-6)}`}, ${`Module ${usage}`}, 'Europe/Zurich', 'fr',
			array['fr'], true)
	`);
	if (usage === 'ancre') {
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
				"recurrence_anchor_date", "timing_kind", "timing_prayer", "timing_offset_minutes",
				"timing_duration_minutes", "starts_on")
			values (${newId()}, ${id}, 'published', 'open', array['fr'], 'fr', 'weekly',
				array[1]::smallint[], 1, '2026-09-07', 'prayer', 'maghrib', 15, 60, '2026-09-07')
		`);
	}
	if (usage === 'vendredi') {
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "kind", "jumua_order", "status", "audience",
				"teaching_language", "source_language", "recurrence_kind", "recurrence_weekday",
				"recurrence_interval", "recurrence_anchor_date", "timing_kind", "timing_start",
				"timing_end", "starts_on")
			values (${newId()}, ${id}, 'jumua', 1, 'published', 'open', array['ar'], 'fr', 'weekly',
				array[5]::smallint[], 1, '2026-09-04', 'fixed', '12:10', '12:50', '2026-09-04')
		`);
	}
	if (usage === 'reglages') {
		await tx.execute(sql`insert into "prayer_settings" ("organization_id") values (${id})`);
		await tx.execute(sql`
			insert into "prayer_day" ("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib",
				"isha", "source")
			values (${id}, '2026-09-21', '05:40', '13:20', '16:50', '19:27', '21:00', 'import')
		`);
	}
	return id;
}

/** L'état du module de chaque organisation, lu sous le drapeau d'entretien. */
async function modules(
	tx: Transaction,
	ids: Record<string, string>
): Promise<Record<string, boolean>> {
	const lus = new Map(
		allRows<{ id: string; prayer_module: boolean }>(
			await tx.execute(sql`select "id", "prayer_module" from "organization"`)
		).map((ligne) => [ligne.id, ligne.prayer_module])
	);
	return Object.fromEntries(Object.entries(ids).map(([nom, id]) => [nom, lus.get(id) ?? false]));
}

/**
 * L'état d'avant 0050, pour des organisations qui se servent déjà des heures de prière : la colonne
 * n'existe pas encore. Le déclencheur qui la surveille part avec elle ; l'annulation de la
 * transaction remet tout.
 */
async function avant0050(tx: Transaction): Promise<Record<Usage, string>> {
	await drapeau(tx, 'on');
	const ids = {
		ancre: await organisation(tx, 'ancre'),
		vendredi: await organisation(tx, 'vendredi'),
		reglages: await organisation(tx, 'reglages'),
		rien: await organisation(tx, 'rien')
	};
	await tx.execute(sql`alter table "organization" drop column "prayer_module" cascade`);
	return ids;
}

describe('la migration 0050, jouée sans le drapeau d’entretien', () => {
	it('left the module off for every organisation that already used the prayer times, without a word', async () => {
		const lus = await sansRienGarder(async (tx) => {
			const ids = await avant0050(tx);
			// Une nouvelle exécution des migrations : Drizzle joue chaque lot dans une transaction à lui,
			// qui commence sans drapeau.
			await drapeau(tx, 'off');
			await jouer(tx, '0050_prayer_module');
			await drapeau(tx, 'on');
			return modules(tx, ids);
		});
		// Rien n'a changé : la colonne est arrivée éteinte partout, et la mise à jour n'a rien vu.
		expect(lus).toEqual({ ancre: false, vendredi: false, reglages: false, rien: false });
	});

	it('did its work only under the flag, as in a batch where 0049 had left it on', async () => {
		// Le bloc `$efface$` de 0049 pose le drapeau et ne le coupe pas : dans un lot qui jouait 0049
		// puis 0050 dans la même transaction, la mise à jour a fait son travail. C'est la preuve que
		// le seul drapeau manquait.
		const lus = await sansRienGarder(async (tx) => {
			const ids = await avant0050(tx);
			await jouer(tx, '0050_prayer_module');
			return modules(tx, ids);
		});
		expect(lus).toEqual({ ancre: true, vendredi: true, reglages: true, rien: false });
	});
});

describe('la réparation (étape 19, lot 2)', () => {
	it('turns the module back on where a course still depends on it, and leaves the others as they are', async () => {
		const lus = await sansRienGarder(async (tx) => {
			const ids = await avant0050(tx);
			await drapeau(tx, 'off');
			await jouer(tx, '0050_prayer_module');
			// Après 0050, une organisation allume le module depuis ses réglages : il reste allumé.
			await drapeau(tx, 'on');
			const allumee = await organisation(tx, 'reglages');
			await drapeau(tx, 'off');
			// Un lot suivant, qui commence lui aussi sans drapeau.
			await jouer(tx, REPARATION);
			const drapeauApres = allRows<{ pose: boolean }>(
				await tx.execute(sql`select jadwal.maintenance() as pose`)
			)[0]?.pose;
			await drapeau(tx, 'on');
			return { modules: await modules(tx, { ...ids, allumee }), drapeauApres };
		});
		// Un cours ancré sur une prière ou une session du vendredi : un état que le déclencheur de 0050
		// interdit de créer autrement, et que la page publique ne sait pas afficher. Des réglages ou
		// des jours importés seuls ne disent pas que le module sert : l'organisation a pu l'éteindre
		// exprès, et la réparation n'y touche pas.
		expect(lus.modules).toEqual({
			ancre: true,
			vendredi: true,
			reglages: false,
			rien: false,
			allumee: true
		});
		// Le drapeau est coupé après la mise à jour : la suite du lot ne l'hérite pas.
		expect(lus.drapeauApres).toBe(false);
	});

	it('changes nothing on a database where every organisation is in order', async () => {
		const lus = await sansRienGarder(async (tx) => {
			// Des organisations en ordre, après 0050 : le module allumé sous un cours qui en dépend, ou
			// éteint exprès sur des réglages et des jours importés, ou jamais allumé.
			await drapeau(tx, 'on');
			for (const usage of ['ancre', 'vendredi', 'reglages', 'rien'] as const) {
				await organisation(tx, usage);
			}
			const eteinte = await organisation(tx, 'reglages');
			await tx.execute(
				sql`update "organization" set "prayer_module" = false where "id" = ${eteinte}`
			);
			const avant = allRows<{ id: string; prayer_module: boolean; updated_at: string }>(
				await tx.execute(
					sql`select "id", "prayer_module", "updated_at"::text from "organization" order by "id"`
				)
			);
			await drapeau(tx, 'off');
			await jouer(tx, REPARATION);
			await drapeau(tx, 'on');
			const apres = allRows<{ id: string; prayer_module: boolean; updated_at: string }>(
				await tx.execute(
					sql`select "id", "prayer_module", "updated_at"::text from "organization" order by "id"`
				)
			);
			return { avant, apres };
		});
		expect(lus.avant.length).toBeGreaterThan(0);
		expect(lus.apres).toEqual(lus.avant);
	});
});

// Le compteur de vues, contre un vrai serveur et une vraie base (ADR 0032).
//
// Le test qui porte le plus n'est pas celui qui compte : c'est le balayage. On envoie des requêtes
// dont chaque en-tête contient un marqueur unique — provenance, agent, cookie, adresse, langue —
// puis on relit **toutes les colonnes de toutes les tables** en cherchant ces marqueurs. Aucun ne
// doit s'y trouver. C'est ce qui transforme « nous n'écrivons rien du visiteur » d'une intention en
// une propriété vérifiée.

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { todayInZone } from '@jadwal/core';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';

const origin = inject('origin');
const testDatabase = inject('testDatabase');

let ownerHandle: DatabaseHandle;
let adminHandle: DatabaseHandle;
let organizationId: string;
const SLUG = 'compteur';
const FUSEAU = 'Europe/Zurich';

/** Les marqueurs posés dans les en-têtes. Aucun ne doit survivre à la requête. */
const MARQUEURS = [
	'marqueur-de-provenance',
	'marqueur-agent-unique',
	'marqueur-de-cookie',
	'203.0.113.77',
	'xx-marqueur'
] as const;

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

async function maintenance<T>(
	callback: (tx: Parameters<Parameters<DatabaseHandle['db']['transaction']>[0]>[0]) => Promise<T>
): Promise<T> {
	return ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		return callback(tx);
	});
}

/** Le compteur de l'organisation, par type, pour aujourd'hui. */
async function compteurs(): Promise<Record<string, number>> {
	const jour = todayInZone(FUSEAU, new Date());
	const lignes = rows<{ kind: string; count: string }>(
		await ownerHandle.db.execute(sql`
			select "kind", "count"::text from "page_view"
			where "organization_id" = ${organizationId} and "day" = ${jour}
		`)
	);
	return Object.fromEntries(lignes.map((ligne) => [ligne.kind, Number(ligne.count)]));
}

/** Une visite, avec les en-têtes voulus. Rien n'est simulé : c'est une vraie requête HTTP. */
async function visiter(chemin: string, entetes: Record<string, string> = {}): Promise<Response> {
	const response = await fetch(`${origin}${chemin}`, {
		headers: {
			'user-agent':
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
			...entetes
		}
	});
	// Le corps est consommé : sans cela la réponse reste ouverte, et le compteur — écrit après le
	// rendu — pourrait n'avoir pas encore touché la base quand on la relit.
	await response.arrayBuffer();
	return response;
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	adminHandle = createDatabase({ role: 'admin', overrides: { database: testDatabase } });
	organizationId = newId();
	const courseId = newId();
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language")
			values (${organizationId}, ${SLUG}, 'Association du compteur', ${FUSEAU}, 'fr', array['fr'])
		`);
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
				"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "starts_on")
			values (${courseId}, ${organizationId}, 'published', 'open', array['fr'], 'fr', 'weekly',
				array[1]::smallint[], 1, '2026-09-07', 'fixed', '19:00', '20:30', '2026-09-07')
		`);
		await tx.execute(sql`
			insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
			values (${newId()}, ${organizationId}, ${courseId}, 'fr', 'Cours du compteur')
		`);
	});
});

afterAll(async () => {
	await ownerHandle?.close();
	await adminHandle?.close();
});

describe('ce que le compteur distingue', () => {
	it('compte la page publique, le mode intégré et le flux séparément', async () => {
		const avant = await compteurs();

		await visiter(`/m/${SLUG}`);
		await visiter(`/m/${SLUG}`);
		// `Sec-Fetch-Dest` est posé par le navigateur et interdit à JavaScript : c'est lui qui dit
		// qu'une page est dans un cadre, et non le paramètre d'adresse, que n'importe qui peut
		// écrire.
		await visiter(`/m/${SLUG}`, { 'sec-fetch-dest': 'iframe' });
		// Le repli, pour un cadre posé à la main dans un navigateur ancien.
		await visiter(`/m/${SLUG}?embed=1`);
		await visiter(`/m/${SLUG}/agenda.ics`);

		const apres = await compteurs();
		expect(apres['page'] ?? 0).toBe((avant['page'] ?? 0) + 2);
		expect(apres['embed'] ?? 0).toBe((avant['embed'] ?? 0) + 2);
		expect(apres['feed'] ?? 0).toBe((avant['feed'] ?? 0) + 1);
	});

	it('ne compte pas un robot connu', async () => {
		const avant = await compteurs();
		for (const agent of [
			'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
			'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0)',
			'curl/8.7.1',
			''
		]) {
			await visiter(`/m/${SLUG}`, { 'user-agent': agent });
		}
		expect(await compteurs()).toEqual(avant);
	});

	it('ne compte pas une page que personne n’a encore ouverte', async () => {
		// Un navigateur pré-charge au survol d'un lien : la page est demandée, pas lue.
		const avant = await compteurs();
		await visiter(`/m/${SLUG}`, { 'sec-purpose': 'prefetch;prerender' });
		await visiter(`/m/${SLUG}`, { purpose: 'prefetch' });
		await visiter(`/m/${SLUG}`, { 'x-moz': 'prefetch' });
		expect(await compteurs()).toEqual(avant);
	});

	it('n’attribue à une organisation que ses propres vues', async () => {
		const ailleurs = async () =>
			Number(
				rows<{ count: string }>(
					await ownerHandle.db.execute(sql`
						select coalesce(sum("count"), 0)::text as count from "page_view"
						where "organization_id" <> ${organizationId}
					`)
				)[0]?.count ?? '0'
			);
		const avant = await ailleurs();
		await visiter(`/m/${SLUG}`);
		expect(await ailleurs()).toBe(avant);
	});
});

describe('ce que la base ne contient pas', () => {
	it('ne garde aucune trace des en-têtes d’une visite, dans aucune table', async () => {
		await visiter(`/m/${SLUG}`, {
			referer: 'https://marqueur-de-provenance.example.test/ou-je-etais',
			'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) marqueur-agent-unique/1.0',
			cookie: 'suivi=marqueur-de-cookie',
			'x-forwarded-for': '203.0.113.77',
			'accept-language': 'xx-marqueur'
		});
		await visiter(`/m/${SLUG}/agenda.ics`, {
			referer: 'https://marqueur-de-provenance.example.test/flux',
			'user-agent': 'Mozilla/5.0 marqueur-agent-unique/1.0',
			'x-forwarded-for': '203.0.113.77'
		});

		// Le rôle d'administration voit tout, y compris ce que la sécurité au niveau des lignes
		// cache au propriétaire : un balayage qui n'irait pas jusqu'au journal d'audit ne prouverait
		// rien.
		const tables = rows<{ relname: string }>(
			await adminHandle.db.execute(sql`
				select c.relname from pg_class c
				join pg_namespace n on n.oid = c.relnamespace
				where n.nspname = 'public' and c.relkind = 'r'
				order by c.relname
			`)
		).map((row) => row.relname);
		expect(tables.length).toBeGreaterThan(10);

		// Une seule expression, pour que le balayage tienne en une requête par table. Les points de
		// l’adresse sont échappés : sans cela, ils vaudraient « n’importe quel caractère ».
		const motif = MARQUEURS.map((marqueur) => marqueur.replace(/[.]/g, '[.]')).join('|');
		const trouvailles: string[] = [];
		for (const table of tables) {
			// `to_jsonb(t.*)` rend la ligne entière : aucune colonne n'échappe au balayage, quel que
			// soit son type, et une colonne ajoutée demain y entre sans qu'on y pense.
			const lignes = rows<{ ligne: string }>(
				await adminHandle.db.execute(sql`
					select to_jsonb(t.*)::text as ligne from ${sql.identifier(table)} t
					where to_jsonb(t.*)::text ~* ${motif}
					limit 3
				`)
			);
			for (const ligne of lignes) trouvailles.push(`${table} : ${ligne.ligne.slice(0, 200)}`);
		}
		expect(trouvailles).toEqual([]);
	});

	it('ne garde du compteur que l’organisation, le jour, le type et le nombre', async () => {
		const colonnes = rows<{ column_name: string }>(
			await adminHandle.db.execute(sql`
				select column_name from information_schema.columns
				where table_schema = 'public' and table_name = 'page_view'
				order by ordinal_position
			`)
		).map((row) => row.column_name);
		expect(colonnes).toEqual(['organization_id', 'day', 'kind', 'count']);
	});

	it('ne garde du limiteur de débit qu’une clé condensée', async () => {
		// Le seau public est alimenté par les mêmes visites que ci-dessus. Sa clé portait l'adresse
		// en clair jusqu'à l'étape 7 ; elle ne porte plus qu'un condensat, ni lisible ni réversible.
		const cles = rows<{ key: string }>(
			await adminHandle.db.execute(sql`select "key" from "rate_limit"`)
		).map((row) => row.key);
		expect(cles.length).toBeGreaterThan(0);
		for (const cle of cles) {
			expect(cle, cle).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
			expect(cle, cle).not.toContain(':');
		}
	});
});

// La page publique se relit sans réseau (étape 24, ADR 0054) : un travailleur de service garde la
// dernière page vue, et la rend, marquée de sa date, quand le réseau ne répond pas.
//
// Ici, ce que le serveur doit servir pour cela : le travailleur, le script qui l'enregistre, et le
// paragraphe caché que le travailleur montre. Ce que le navigateur en fait pour de vrai (couper le
// réseau, relire la page) est éprouvé par le parcours automatique.
//
// Vrai serveur construit, vraie base.

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';
import { marquerCopie } from '../src/lib/hors-reseau/copie.js';
import { attendreLeSeulScriptHorsReseau, scriptsDe } from './scripts-de-page.js';

const origin = inject('origin');
const testDatabase = inject('testDatabase');

const SLUG = 'organisation-hors-reseau';

let ownerHandle: DatabaseHandle;

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	await ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language")
			values (${newId()}, ${SLUG}, 'Association hors réseau', 'Europe/Zurich', 'fr',
				array['fr','de','it','en','ar'])
		`);
	});
});

afterAll(async () => {
	await ownerHandle?.close();
});

const lire = async (chemin: string) => (await fetch(`${origin}${chemin}`)).text();

/** Le moment où la copie de ces essais a été gardée, à l'heure de l'appareil. */
const QUAND = new Date(2026, 10, 26, 14, 5);

/** Le paragraphe qui dit qu'une page est une copie : sa balise, et le texte qu'on y lit. */
function mentionDe(html: string): { balise: string; texte: string } | null {
	const trouve = html.match(/(<p\b[^>]*\sdata-jadwal-copie(?![-\w])[^>]*>)([\s\S]*?)<\/p>/);
	if (!trouve) return null;
	const texte = (trouve[2] ?? '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return { balise: trouve[1] ?? '', texte };
}

describe('le travailleur de service', () => {
	it('is served at the root of the site, as a script', async () => {
		const reponse = await fetch(`${origin}/service-worker.js`);
		expect(reponse.status).toBe(200);
		expect(reponse.headers.get('content-type') ?? '').toMatch(/^(text|application)\/javascript/);
		const corps = await reponse.text();
		// Il répond aux requêtes, et il garde ce qu'il a servi.
		expect(corps).toContain('respondWith');
		expect(corps).toContain('caches');
	});

	it('is one file that loads nothing else', async () => {
		// Un travailleur qui importerait un autre fichier ne démarrerait pas sans réseau si ce
		// fichier manquait au cache du navigateur.
		const corps = await lire('/service-worker.js');
		// Le fichier est construit sur une seule ligne : on y cherche le mot, où qu'il soit.
		expect(corps).not.toMatch(/\b(import|export)\b/);
		expect(corps).not.toContain('importScripts');
	});

	it('never talks to another site, and keeps nothing of the people in charge', async () => {
		const corps = await lire('/service-worker.js');
		expect(corps).not.toMatch(/https?:\/\//);
		expect(corps).not.toContain('/api/');
		expect(corps).not.toContain('cookie');
	});
});

describe('le script qui enregistre le travailleur', () => {
	it('is served as a script, kept out of the index, and revalidated', async () => {
		const reponse = await fetch(`${origin}/m/hors-reseau.js`);
		expect(reponse.status).toBe(200);
		expect(reponse.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
		expect(reponse.headers.get('x-robots-tag')).toBe('noindex');
		expect(reponse.headers.get('cache-control')).toBe(
			'public, max-age=3600, stale-while-revalidate=86400'
		);
		const entite = reponse.headers.get('etag');
		expect(entite).toMatch(/^"[\w-]+"$/);
		const connue = await fetch(`${origin}/m/hors-reseau.js`, {
			headers: { 'if-none-match': entite ?? '' }
		});
		expect(connue.status).toBe(304);
	});

	it('registers the worker for the public pages, and for them alone', async () => {
		const corps = await lire('/m/hors-reseau.js');
		expect(corps).toContain('serviceWorker');
		expect(corps).toContain('register');
		// Les adresses se calculent depuis celle du script : `/service-worker.js`, et la portée `/m/`.
		const script = `${origin}/m/hors-reseau.js`;
		const travailleur = corps.match(/new URL\('([^']+service-worker\.js)'/)?.[1] ?? '';
		expect(new URL(travailleur, script).pathname).toBe('/service-worker.js');
		const portee = corps.match(/scope:\s*new URL\('([^']+)'/)?.[1] ?? '';
		expect(new URL(portee, script).pathname).toBe('/m/');
		// Rien d'autre : ni requête, ni mesure, ni stockage.
		expect(corps).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|localStorage|document\.cookie/);
	});
});

describe('ce que les pages portent pour cela', () => {
	const PAGES = [
		['the programme', `/m/${SLUG}`],
		['the Today view', `/m/${SLUG}?vue=aujourdhui`],
		['the programme in Arabic', `/m/${SLUG}/ar`],
		['the subscription page', `/m/${SLUG}/agenda`],
		['the subscription page in German', `/m/${SLUG}/de/agenda`]
	] as const;

	it.each(PAGES)('loads the one script, and nothing inline, on %s', async (_, chemin) => {
		const html = await lire(chemin);
		attendreLeSeulScriptHorsReseau(html, `${origin}${chemin}`);
		const source = scriptsDe(html)[0]?.match(/\bsrc="([^"]+)"/)?.[1] ?? '';
		expect((await fetch(new URL(source, `${origin}${chemin}`))).status).toBe(200);
	});

	it('keeps the frame of the widget as it was: its own script, and no other', async () => {
		const scripts = scriptsDe(await lire(`/m/${SLUG}?embed=1`));
		expect(scripts).toHaveLength(1);
		expect(scripts[0]).toContain('/widget/embed.js');
	});

	it('loads no script on a page that does not exist', async () => {
		expect(scriptsDe(await lire('/m/organisation-inconnue'))).toEqual([]);
		expect(scriptsDe(await lire(`/m/${SLUG}/cours/inconnu`))).toEqual([]);
	});

	it('registers no worker in the space of the people in charge', async () => {
		// SvelteKit l'enregistrerait de lui-même, sur toute page qui a du JavaScript, avec la portée
		// du site entier : `serviceWorker.register` est coupé dans `vite.config.ts`.
		for (const chemin of ['/connexion', '/conditions']) {
			const html = await lire(chemin);
			expect(html, chemin).not.toContain('serviceWorker');
			expect(html, chemin).not.toContain('service-worker');
		}
	});

	const MENTIONS = {
		fr: 'Pas de réseau : voici la copie gardée le 26.11.2026 à 14:05.',
		de: 'Keine Verbindung: Dies ist die Kopie vom 26.11.2026, 14:05 Uhr.',
		it: 'Nessuna connessione: questa è la copia del 26.11.2026 alle 14:05.',
		en: 'No connection: this is the copy kept on 26.11.2026 at 14:05.',
		ar: 'لا يوجد اتصال: هذه نسخة محفوظة بتاريخ 26.11.2026 الساعة 14:05.'
	} as const;

	it.each(Object.entries(MENTIONS))(
		'hides the mention of a copy while the network answers, and shows it dated otherwise: %s',
		async (langue, mention) => {
			const chemin = langue === 'fr' ? `/m/${SLUG}` : `/m/${SLUG}/${langue}`;
			const html = await lire(chemin);
			// Servie par le réseau : le paragraphe est là, caché, et ses creux sont vides.
			const cachee = mentionDe(html);
			expect(cachee?.balise, chemin).toMatch(/\shidden\b/);
			expect(cachee?.texte, chemin).not.toContain('26.11.2026');

			// Servie par le travailleur : la même page, dont le paragraphe est montré et daté.
			const montree = mentionDe(marquerCopie(html, QUAND));
			expect(montree?.balise, chemin).not.toMatch(/\shidden\b/);
			expect(montree?.texte, chemin).toBe(mention);
		}
	);

	it.each([
		['the subscription page', `/m/${SLUG}/agenda`],
		['the Today view', `/m/${SLUG}?vue=aujourdhui`]
	])('carries the mention on %s too', async (_, chemin) => {
		expect(mentionDe(marquerCopie(await lire(chemin), QUAND))?.texte).toBe(MENTIONS.fr);
	});

	it('carries the mention once, at the head of the content', async () => {
		const html = await lire(`/m/${SLUG}`);
		expect(html.match(/\sdata-jadwal-copie(?![-\w])/g)).toHaveLength(1);
		expect(html).toMatch(
			/<main\b[^>]*>(?:\s|<!--[\s\S]*?-->)*<p\b[^>]*\sdata-jadwal-copie(?![-\w])/
		);
	});

	it('carries no mention in the frame of the widget', async () => {
		expect(await lire(`/m/${SLUG}?embed=1`)).not.toContain('data-jadwal-copie');
	});
});

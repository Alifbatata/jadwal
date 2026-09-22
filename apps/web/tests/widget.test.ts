// L'étape 6, contre un vrai serveur et une vraie base : le widget, le mode intégré, le flux par
// cours et le référencement (ADR 0028, 0029, 0031).
//
// Trois tests portent plus que les autres : celui qui relit le flux d'un seul cours avec `ical.js`
// et le compare à `expandOccurrences` ; celui qui vérifie qu'une page **non** intégrée n'a toujours
// aucun script, pendant que la page intégrée n'en a qu'un ; et celui qui recalcule l'empreinte
// d'intégrité sur les octets réellement servis.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import ICAL from 'ical.js';
import { addDays, expandOccurrences, todayInZone, type IsoDate } from '@jadwal/core';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';

const origin = inject('origin');
const secondOrigin = inject('secondOrigin');
const testDatabase = inject('testDatabase');

/** La racine du dépôt, depuis `apps/web/tests/` : trois dossiers au-dessus. */
function racine(): string {
	return dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
}

/** Le segment de version d'une adresse immuable : une empreinte des octets servis. */
function versionDe(source: string): string {
	return createHash('sha256').update(Buffer.from(source, 'utf8')).digest('base64url').slice(0, 12);
}

let ownerHandle: DatabaseHandle;
let organizationId: string;
let hebdoId: string;
let ancreId: string;
let brouillonId: string;
const SLUG = 'widget';
const FUSEAU = 'Europe/Zurich';
/** Un lundi, pour que les jours listés se lisent. */
const DEBUT = '2026-09-07';

async function maintenance<T>(
	callback: (tx: Parameters<Parameters<DatabaseHandle['db']['transaction']>[0]>[0]) => Promise<T>
): Promise<T> {
	return ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		return callback(tx);
	});
}

async function poserCours(cours: {
	status: string;
	titre: string;
	weekdays: number[];
	timingKind: string;
	start?: string | null;
	end?: string | null;
	prayer?: string | null;
	offsetMinutes?: number | null;
	durationMinutes?: number | null;
}): Promise<string> {
	const id = newId();
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
				"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "timing_prayer",
				"timing_offset_minutes", "timing_duration_minutes", "starts_on")
			values (${id}, ${organizationId}, ${cours.status}, 'open', array['fr'], 'fr', 'weekly',
				${sql.raw(`array[${cours.weekdays.join(',')}]::smallint[]`)}, 1, ${DEBUT},
				${cours.timingKind}, ${cours.start ?? null}, ${cours.end ?? null}, ${cours.prayer ?? null},
				${cours.offsetMinutes ?? null}, ${cours.durationMinutes ?? null}, ${DEBUT})
		`);
		await tx.execute(sql`
			insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
			values (${newId()}, ${organizationId}, ${id}, 'fr', ${cours.titre})
		`);
	});
	return id;
}

async function texte(url: string, entetes?: Record<string, string>): Promise<string> {
	const reponse = await fetch(url, entetes ? { headers: entetes } : undefined);
	expect(reponse.status, url).toBe(200);
	return reponse.text();
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	organizationId = newId();
	await maintenance((tx) =>
		tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language", "prayer_module")
			values (${organizationId}, ${SLUG}, 'Association du widget', ${FUSEAU}, 'fr',
				array['fr','de','it','ar'], true)
		`)
	);
	hebdoId = await poserCours({
		status: 'published',
		titre: 'Arabe du mardi',
		weekdays: [2],
		timingKind: 'fixed',
		start: '19:00',
		end: '20:30'
	});
	ancreId = await poserCours({
		status: 'published',
		titre: 'Tafsir après Maghrib',
		weekdays: [5],
		timingKind: 'prayer',
		prayer: 'maghrib',
		offsetMinutes: 30,
		durationMinutes: 60
	});
	brouillonId = await poserCours({
		status: 'draft',
		titre: 'Brouillon du widget',
		weekdays: [3],
		timingKind: 'fixed',
		start: '18:00',
		end: '19:00'
	});
	// Les heures de prière, sur toute la fenêtre glissante du flux. Sans elles, un cours ancré n'a
	// aucune heure connue et ne produit **aucun** événement : le flux serait vide, et le test qui
	// le lit passerait à côté de ce qu'il prétend vérifier.
	await maintenance((tx) =>
		tx.execute(sql`
			insert into "prayer_day" ("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib",
				"isha", "source")
			select ${organizationId}, jour::date, '06:00', '13:00', '16:00', '19:30', '21:00', 'import'
			from generate_series(current_date - interval '40 days', current_date + interval '130 days',
				interval '1 day') as jour
		`)
	);
});

afterAll(async () => {
	await ownerHandle?.close();
});

describe('le fichier du widget', () => {
	it('is served with everything an integrity check needs', async () => {
		const reponse = await fetch(`${origin}/widget/jadwal-widget.js`);
		expect(reponse.status).toBe(200);
		// Un type approximatif ferait refuser l'exécution : `nosniff` est posé sur toute réponse.
		expect(reponse.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
		// Sans CORS, `integrity` ne dégrade pas : elle bloque le script à cent pour cent.
		expect(reponse.headers.get('access-control-allow-origin')).toBe('*');
		// Pour un site qui impose `Cross-Origin-Embedder-Policy: require-corp`.
		expect(reponse.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
		expect(reponse.headers.get('cache-control')).toContain('max-age');
		const corps = await reponse.text();
		expect(corps).toContain('jadwal-widget');
		expect(corps).toContain('customElements');
	});

	it('serves the very same bytes at its versioned address, with the fingerprint it announces', async () => {
		const mouvant = await texte(`${origin}/widget/jadwal-widget.js`);
		const version = versionDe(mouvant);
		const reponse = await fetch(`${origin}/widget/${version}/jadwal-widget.js`);
		expect(reponse.status).toBe(200);
		expect(reponse.headers.get('cache-control')).toContain('immutable');
		expect(await reponse.text()).toBe(mouvant);
	});

	it('never stops serving a version it has published', async () => {
		// Le registre est le dossier du paquet, et c'est lui qui fait foi : une organisation qui a collé
		// une adresse immuable la garde des années. Ce test lit le dossier — il n'énumère rien à la
		// main — et échoue donc si une version publiée cessait d'être servie.
		const registre = join(racine(), 'packages', 'widget', 'published');
		const versions = readdirSync(registre, { withFileTypes: true })
			.filter((entree) => entree.isDirectory())
			.map((entree) => entree.name);
		expect(versions.length, 'aucune version archivée : le registre est vide').toBeGreaterThan(0);

		for (const version of versions) {
			const attendu = readFileSync(join(registre, version, 'jadwal-widget.js'), 'utf8');
			const reponse = await fetch(`${origin}/widget/${version}/jadwal-widget.js`);
			expect(reponse.status, version).toBe(200);
			expect(await reponse.text(), version).toBe(attendu);
			// Et l'archive porte bien le nom de son empreinte : sans cela le registre mentirait.
			expect(versionDe(attendu), version).toBe(version);
		}
	});

	it('refuses a version that was never published', async () => {
		const reponse = await fetch(`${origin}/widget/une-version-inventee/jadwal-widget.js`);
		expect(reponse.status).toBe(404);
	});

	it('offers its test page only where the operator opened it', async () => {
		// La page d'essai est un outil d'avant-publication, pas une page du service. Sans le réglage,
		// elle n'existe pas ; la seconde instance, elle, l'a — les deux branches sont éprouvées sur
		// un vrai serveur (étape 7, partie A).
		expect((await fetch(`${origin}/widget/test`)).status).toBe(404);

		const ouverte = await fetch(`${secondOrigin}/widget/test`);
		expect(ouverte.status).toBe(200);
		const html = await ouverte.text();
		const mouvant = await texte(`${origin}/widget/jadwal-widget.js`);
		// Elle charge le widget comme le ferait un site extérieur : adresse versionnée, empreinte
		// recalculée sur les octets servis, et le `crossorigin` sans lequel l'empreinte bloquerait.
		const empreinte = `sha384-${createHash('sha384').update(Buffer.from(mouvant, 'utf8')).digest('base64')}`;
		expect(html).toContain(empreinte);
		expect(html).toContain(`/widget/${versionDe(mouvant)}/jadwal-widget.js`);
		expect(html).toContain('crossorigin="anonymous"');
		// Et elle ne s'indexe pas, quoi qu'il arrive.
		expect(ouverte.headers.get('x-robots-tag') ?? html).toContain('noindex');
	});

	it('serves the embed script, and keeps it out of the index', async () => {
		const reponse = await fetch(`${origin}/widget/embed.js`);
		expect(reponse.status).toBe(200);
		expect(reponse.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
		expect(reponse.headers.get('x-robots-tag')).toBe('noindex');
		const corps = await reponse.text();
		expect(corps).toContain('ResizeObserver');
		expect(corps).toContain('jadwal:height:1');
		// Il annonce à un parent d'une autre origine : le destinataire par défaut jetterait le message.
		expect(corps).toContain("'*'");
	});
});

describe('le mode intégré', () => {
	it('adds exactly one script, and only when the page is framed', async () => {
		const ordinaire = await texte(`${origin}/m/${SLUG}`);
		// La promesse de l'ADR 0027 ne bouge pas d'un octet pour une page non intégrée.
		expect(ordinaire).not.toMatch(/<script[\s>]/);

		// Le chemin rendu est relatif à la page — `../widget/embed.js`, `../../widget/embed.js` —
		// et SvelteKit compte les segments lui-même. On vérifie donc ce qu'un navigateur en ferait,
		// sur les trois profondeurs, plutôt que de comparer une chaîne qui a l'air juste.
		for (const chemin of [
			`/m/${SLUG}?embed=1`,
			`/m/${SLUG}/ar?embed=1`,
			`/m/${SLUG}/de/agenda?embed=1`
		]) {
			const html = await texte(`${origin}${chemin}`);
			const trouves = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)];
			expect(trouves, chemin).toHaveLength(1);
			const resolu = new URL(trouves[0]?.[1] as string, `${origin}${chemin}`);
			expect(resolu.pathname, chemin).toBe('/widget/embed.js');
			// Et il répond vraiment : un chemin qui se résout bien mais ne mène nulle part laisserait
			// le cadre à sa hauteur minimale, sans rien dire.
			expect((await fetch(resolu)).status, chemin).toBe(200);
		}

		const integree = await texte(`${origin}/m/${SLUG}?embed=1`);
		const scripts = [...integree.matchAll(/<script\b[^>]*>/g)].map((trouve) => trouve[0]);
		expect(scripts).toHaveLength(1);
		expect(scripts[0]).toContain('/widget/embed.js');
		// Un fichier, jamais du code en ligne : sur une page `csr = false`, aucun nonce n'existe.
		expect(integree).not.toMatch(/<script(?![^>]*\bsrc=)/);
		// Et le programme est bien là : le mode intégré ne change pas le contenu.
		expect(integree).toContain('Arabe du mardi');
	});

	it('carries the mention exactly once, and on the right side of the frame', async () => {
		const ordinaire = await texte(`${origin}/m/${SLUG}`);
		expect(ordinaire).toContain('Proposé gratuitement par jadwal');
		// Dans un cadre, c'est le pied du widget qui la porte, sous le cadre : la répéter à dix
		// pixels d'écart n'apprendrait rien.
		const integree = await texte(`${origin}/m/${SLUG}?embed=1`);
		expect(integree).not.toContain('Proposé gratuitement par jadwal');
		// Le widget, lui, la porte.
		expect(await texte(`${origin}/widget/jadwal-widget.js`)).toContain(
			'Proposé gratuitement par jadwal'
		);
	});

	it('marks the page so the embedded stylesheet applies, and only then', async () => {
		expect(await texte(`${origin}/m/${SLUG}?embed=1`)).toContain('data-jadwal-embed');
		expect(await texte(`${origin}/m/${SLUG}`)).not.toContain('data-jadwal-embed=""');
	});

	it('still asks the browser for nothing from another domain, framed or not', async () => {
		for (const chemin of [`/m/${SLUG}`, `/m/${SLUG}?embed=1`, `/m/${SLUG}/agenda?embed=1`]) {
			const html = await texte(`${origin}${chemin}`);
			const externes = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
				.map((trouve) => trouve[1] as string)
				.filter((url) => /^(https?:)?\/\//.test(url) && !url.startsWith(origin));
			expect(externes, chemin).toEqual([]);
		}
	});
});

describe('le flux agenda d’un seul cours', () => {
	it('is read back by an independent library and matches expandOccurrences', async () => {
		const reponse = await fetch(`${origin}/m/${SLUG}/agenda/${hebdoId}.ics`);
		expect(reponse.status).toBe(200);
		expect(reponse.headers.get('content-type')).toContain('text/calendar');
		// Un nom de fichier lisible, tiré du titre du cours.
		expect(reponse.headers.get('content-disposition')).toContain('widget-arabe-du-mardi.ics');
		const ics = await reponse.text();

		const composant = new ICAL.Component(ICAL.parse(ics));
		const evenements = composant.getAllSubcomponents('vevent');
		const titres = evenements.map((evenement) => evenement.getFirstPropertyValue('summary'));
		// Un seul cours, et c'est le bon : les autres cours publiés n'y sont pas.
		expect(titres).toContain('Arabe du mardi');
		expect(titres).not.toContain('Tafsir après Maghrib');
		expect(titres).not.toContain('Brouillon du widget');
		// Le nom du calendrier dit de quelle organisation et de quel cours il s'agit. L'application
		// d'agenda l'affiche tel quel : un tiret demi-cadratin, pas de cadratin (`pnpm style`).
		expect(composant.getFirstPropertyValue('x-wr-calname')).toBe(
			'Association du widget – Arabe du mardi'
		);

		const evenement = evenements.find(
			(candidat) => candidat.getFirstPropertyValue('summary') === 'Arabe du mardi'
		) as ICAL.Component;
		const expansion = new ICAL.RecurExpansion({
			component: evenement,
			dtstart: evenement.getFirstPropertyValue('dtstart') as ICAL.Time
		});
		const dates: string[] = [];
		for (let index = 0; index < 6; index += 1) {
			const suivant = expansion.next();
			if (!suivant) break;
			dates.push(suivant.toJSDate().toISOString().slice(0, 10));
		}
		const attendues = expandOccurrences({
			schedules: [
				{
					id: hebdoId,
					recurrence: { kind: 'weekly', weekdays: [2], interval: 1, anchorDate: DEBUT as IsoDate },
					timing: { kind: 'fixed', start: '19:00', end: '20:30' },
					startsOn: DEBUT as IsoDate,
					sequence: 0
				}
			],
			range: { from: DEBUT as IsoDate, to: addDays(DEBUT as IsoDate, 41) }
		}).map((seance) => seance.date);
		expect(dates).toEqual(attendues.slice(0, dates.length));
		expect(dates.length).toBeGreaterThan(3);
	});

	it('serves an anchored course session by session, like the organisation feed does', async () => {
		const ics = await texte(`${origin}/m/${SLUG}/agenda/${ancreId}.ics`);
		const composant = new ICAL.Component(ICAL.parse(ics));
		const evenements = composant.getAllSubcomponents('vevent');
		// Un cours ancré sur une prière sort séance par séance : son heure change chaque jour.
		expect(evenements.length).toBeGreaterThan(1);
		for (const evenement of evenements) {
			expect(evenement.getFirstPropertyValue('rrule')).toBeNull();
		}
	});

	it('answers a draft, an unknown course and another organisation the same way', async () => {
		const brouillon = await fetch(`${origin}/m/${SLUG}/agenda/${brouillonId}.ics`);
		const inconnu = await fetch(`${origin}/m/${SLUG}/agenda/${newId()}.ics`);
		expect(brouillon.status).toBe(404);
		expect(inconnu.status).toBe(404);
		expect(await brouillon.text()).toBe(await inconnu.text());
	});

	it('is linked from the course page, in webcal as well as https', async () => {
		const html = await texte(`${origin}/m/${SLUG}/cours/${hebdoId}`);
		expect(html).toContain(`webcal://${new URL(origin).host}/m/${SLUG}/agenda/${hebdoId}.ics`);
		expect(html).toContain(`${origin}/m/${SLUG}/agenda/${hebdoId}.ics`);
		// Et la page d'abonnement propose les deux : tout le programme, ou un seul cours.
		const agenda = await texte(`${origin}/m/${SLUG}/agenda`);
		expect(agenda).toContain('Tout le programme');
		expect(agenda).toContain('Un seul cours');
		expect(agenda).toContain(`webcal://${new URL(origin).host}/m/${SLUG}/agenda/${hebdoId}.ics`);
		expect(agenda).not.toContain(brouillonId);
	});

	it('changes its version when the course changes, and keeps the feeds apart', async () => {
		const url = `${origin}/m/${SLUG}/agenda/${hebdoId}.ics`;
		const premiere = await fetch(url);
		const etag = premiere.headers.get('etag') as string;
		expect(etag).toBeTruthy();
		// Deux flux de la même organisation ne partagent pas une entrée de cache.
		const autre = await fetch(`${origin}/m/${SLUG}/agenda/${ancreId}.ics`);
		expect(autre.headers.get('etag')).not.toBe(etag);

		const revalidation = await fetch(url, { headers: { 'if-none-match': etag } });
		expect(revalidation.status).toBe(304);
	});
});

describe('la plage de dates', () => {
	it('serves ninety-two days by default, and more only when asked explicitly', async () => {
		const today = todayInZone(FUSEAU, new Date());
		const defaut = (await (
			await fetch(`${origin}/api/v1/organisations/${SLUG}/schedule?from=${today}&to=2099-12-31`)
		).json()) as { range: { to: string } };
		expect(defaut.range.to).toBe(addDays(today as IsoDate, 91));

		const demandee = (await (
			await fetch(
				`${origin}/api/v1/organisations/${SLUG}/schedule?from=${today}&to=2099-12-31&maxDays=366`
			)
		).json()) as { range: { to: string } };
		expect(demandee.range.to).toBe(addDays(today as IsoDate, 365));
	});

	it('refuses beyond a year, and says the limit', async () => {
		const reponse = await fetch(`${origin}/api/v1/organisations/${SLUG}/schedule?maxDays=1000`);
		expect(reponse.status).toBe(400);
		const corps = (await reponse.json()) as { error: string; message: string };
		expect(corps.error).toBe('range_too_long');
		expect(corps.message).toContain('366');
	});

	it('ignores an unreadable value, exactly as it ignores an unreadable date', async () => {
		const today = todayInZone(FUSEAU, new Date());
		const reponse = (await (
			await fetch(
				`${origin}/api/v1/organisations/${SLUG}/schedule?from=${today}&to=2099-12-31&maxDays=beaucoup`
			)
		).json()) as { range: { to: string } };
		expect(reponse.range.to).toBe(addDays(today as IsoDate, 91));
	});
});

describe('le référencement', () => {
	it('opens the public pages and closes the rest', async () => {
		const reponse = await fetch(`${origin}/robots.txt`);
		expect(reponse.status).toBe(200);
		expect(reponse.headers.get('content-type')).toBe('text/plain; charset=utf-8');
		const corps = await reponse.text();
		expect(corps).toContain('User-agent: *');
		expect(corps).toContain('Allow: /m/');
		expect(corps).toContain('Disallow: /');
		expect(corps).toContain(`Sitemap: ${origin}/sitemap.xml`);
		// Un seul groupe : un robot n'en retient qu'un, et en ajouter un nommé lui ferait perdre
		// toutes les règles du groupe général.
		expect(corps.match(/User-agent:/g)).toHaveLength(1);
	});

	it('lists one sitemap per organisation, and the pages of each', async () => {
		const index = await texte(`${origin}/sitemap.xml`);
		expect(index).toContain('<sitemapindex');
		expect(index).toContain(`${origin}/sitemap-${SLUG}.xml`);

		const plan = await texte(`${origin}/sitemap-${SLUG}.xml`);
		expect(plan).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
		// La page dans les quatre langues, la page d'abonnement, et une page par cours publié.
		expect(plan).toContain(`<loc>${origin}/m/${SLUG}</loc>`);
		expect(plan).toContain(`<loc>${origin}/m/${SLUG}/ar</loc>`);
		expect(plan).toContain(`<loc>${origin}/m/${SLUG}/agenda</loc>`);
		expect(plan).toContain(`${origin}/m/${SLUG}/cours/${hebdoId}`);
		expect(plan).not.toContain(brouillonId);
		// Chaque entrée cite toutes les versions, elle-même comprise, plus `x-default` : sans cette
		// réciprocité, le groupe entier est ignoré.
		const entrees = plan.match(/<url>/g) ?? [];
		const alternatives = plan.match(/hreflang="/g) ?? [];
		expect(entrees.length).toBeGreaterThan(0);
		expect(alternatives.length).toBe(entrees.length * 5);
		expect(plan).toContain('hreflang="x-default"');
	});

	it('gives every public page a canonical address of its own language', async () => {
		const francais = await texte(`${origin}/m/${SLUG}`);
		expect(francais).toContain(`<link rel="canonical" href="${origin}/m/${SLUG}"`);
		const arabe = await texte(`${origin}/m/${SLUG}/ar`);
		// Jamais vers la version française : une page se canonicalise dans sa propre langue.
		expect(arabe).toContain(`<link rel="canonical" href="${origin}/m/${SLUG}/ar"`);
		// L'adresse explicite de la langue par défaut se rabat sur l'adresse courte, qui est celle
		// que l'organisation met sur ses affiches.
		const explicite = await texte(`${origin}/m/${SLUG}/fr`);
		expect(explicite).toContain(`<link rel="canonical" href="${origin}/m/${SLUG}"`);
		// Et les filtres ne créent pas d'adresse de plus.
		const filtre = await texte(`${origin}/m/${SLUG}?public=kids`);
		expect(filtre).toContain(`<link rel="canonical" href="${origin}/m/${SLUG}"`);
	});

	it('keeps what is not a page out of the index', async () => {
		for (const chemin of [
			`/api/v1/organisations/${SLUG}`,
			`/api/v1/organisations/${SLUG}/schedule`,
			`/m/${SLUG}/agenda.ics`,
			`/m/${SLUG}/agenda/${hebdoId}.ics`
		]) {
			const reponse = await fetch(`${origin}${chemin}`);
			expect(reponse.headers.get('x-robots-tag'), chemin).toBe('noindex');
		}
		// Les pages, elles, restent indexables : c'est la seule partie du service qui l'est.
		const page = await fetch(`${origin}/m/${SLUG}`);
		expect(page.headers.get('x-robots-tag')).toBeNull();
		expect(await page.text()).not.toContain('name="robots"');
	});

	it('never lets a sitemap say that a suspended organisation existed', async () => {
		const reponse = await fetch(`${origin}/sitemap-jamais-existe.xml`);
		expect(reponse.status).toBe(404);
	});
});

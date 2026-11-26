// La page publique s'installe comme une application (étape 24, ADR 0053) : un manifeste par
// organisation, des icônes à sa couleur, et les balises qui les annoncent. Rien de propre à une
// organisation n'est figé dans une construction : son nom et sa couleur viennent de la base.
//
// Vrai serveur construit, vraie base.

import { inflateSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';

const origin = inject('origin');
const testDatabase = inject('testDatabase');

const SLUG = 'organisation-installable';
const NOM = 'Association installable';
const COULEUR = '#b45309';
/** Un nom long : le manifeste ne lui invente pas de nom court. */
const SLUG_LONG = 'organisation-au-long-nom';
const NOM_LONG = 'Association culturelle et sportive du quartier de l’Exemple';

let ownerHandle: DatabaseHandle;
let organizationId: string;

async function maintenance<T>(
	travail: (tx: Parameters<Parameters<DatabaseHandle['db']['transaction']>[0]>[0]) => Promise<T>
): Promise<T> {
	return ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		return travail(tx);
	});
}

function attributs(balise: string): Record<string, string> {
	return Object.fromEntries(
		[...balise.matchAll(/\s([a-z-]+)="([^"]*)"/g)].map((trouve) => [
			trouve[1],
			(trouve[2] ?? '').replaceAll('&amp;', '&')
		])
	);
}

/** Les balises `link` et `meta` de l'en-tête d'une page. */
function tete(html: string): Record<string, string>[] {
	const contenu = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/)?.[1] ?? '';
	return [...contenu.matchAll(/<(?:link|meta)\b([^>]*)>/g)].map((trouve) =>
		attributs(`<x${trouve[1]}>`)
	);
}

interface Manifeste {
	id: string;
	name: string;
	short_name?: string;
	lang: string;
	dir: string;
	start_url: string;
	scope: string;
	display: string;
	background_color: string;
	theme_color: string;
	icons: { src: string; sizes: string; type: string; purpose: string }[];
}

async function manifeste(chemin: string): Promise<{ reponse: Response; lu: Manifeste }> {
	const reponse = await fetch(`${origin}${chemin}`);
	return { reponse, lu: (await reponse.clone().json()) as Manifeste };
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	organizationId = newId();
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language", "accent_color")
			values
				(${organizationId}, ${SLUG}, ${NOM}, 'Europe/Zurich', 'fr', array['fr','ar'], ${COULEUR}),
				(${newId()}, ${SLUG_LONG}, ${NOM_LONG}, 'Europe/Zurich', 'de', array['de'], '#0f766e')
		`);
	});
});

afterAll(async () => {
	await ownerHandle?.close();
});

describe('le manifeste de l’application d’une organisation', () => {
	it('names the organisation, opens on the Today view and stays within its pages', async () => {
		const { reponse, lu } = await manifeste(`/m/${SLUG}/manifest.webmanifest`);
		expect(reponse.status).toBe(200);
		expect(reponse.headers.get('content-type')).toBe('application/manifest+json; charset=utf-8');
		expect(lu).toMatchObject({
			id: `/m/${SLUG}`,
			name: NOM,
			short_name: NOM,
			lang: 'fr',
			dir: 'ltr',
			scope: `/m/${SLUG}`,
			display: 'standalone',
			background_color: '#ffffff',
			theme_color: COULEUR
		});
		const depart = new URL(lu.start_url, `${origin}/m/${SLUG}/manifest.webmanifest`);
		expect([depart.pathname, depart.search]).toEqual([`/m/${SLUG}`, '?vue=aujourdhui']);
		// L'adresse de départ est dans la portée : sans cela, un navigateur refuse l'installation.
		expect(depart.pathname.startsWith(lu.scope)).toBe(true);
	});

	it('opens in the language of the page it was installed from, under the same identity', async () => {
		const { lu } = await manifeste(`/m/${SLUG}/manifest.webmanifest?lang=ar`);
		expect(lu).toMatchObject({ id: `/m/${SLUG}`, lang: 'ar', dir: 'rtl', name: NOM });
		const depart = new URL(lu.start_url, `${origin}/m/${SLUG}/manifest.webmanifest`);
		expect([depart.pathname, depart.search]).toEqual([`/m/${SLUG}/ar`, '?vue=aujourdhui']);
	});

	it('falls back to the default language for a language the organisation does not publish', async () => {
		const { lu } = await manifeste(`/m/${SLUG}/manifest.webmanifest?lang=de`);
		expect(lu).toMatchObject({ lang: 'fr', dir: 'ltr' });
		expect(new URL(lu.start_url, origin).pathname).toBe(`/m/${SLUG}`);
	});

	it('lists the two sizes a browser asks for, and a maskable icon, at the colour of the organisation', async () => {
		const { lu } = await manifeste(`/m/${SLUG}/manifest.webmanifest`);
		expect(lu.icons.map((icone) => `${icone.sizes} ${icone.type} ${icone.purpose}`)).toEqual([
			'192x192 image/png any',
			'512x512 image/png any',
			'512x512 image/png maskable'
		]);
		for (const icone of lu.icons) {
			const adresse = new URL(icone.src, `${origin}/m/${SLUG}/manifest.webmanifest`);
			expect(adresse.pathname.startsWith(`/m/${SLUG}/icone/`), icone.src).toBe(true);
			// La couleur est dans l'adresse : une couleur changée donne une autre adresse, et l'icône
			// peut être gardée en cache pour toujours.
			expect(adresse.searchParams.get('c')).toBe(COULEUR.slice(1));
			const reponse = await fetch(adresse);
			expect(reponse.status, icone.src).toBe(200);
		}
	});

	it('gives no short name to an organisation whose name is long', async () => {
		const { lu } = await manifeste(`/m/${SLUG_LONG}/manifest.webmanifest`);
		expect(lu.name).toBe(NOM_LONG);
		expect(lu.short_name).toBeUndefined();
		expect(lu.lang).toBe('de');
	});

	it('follows the name and the colour of the organisation, without a new build', async () => {
		await maintenance((tx) =>
			tx.execute(sql`
				update "organization" set "name" = 'Association renommée', "accent_color" = '#1d4ed8',
					"updated_at" = now()
				where "id" = ${organizationId}
			`)
		);
		const { lu } = await manifeste(`/m/${SLUG}/manifest.webmanifest`);
		expect(lu).toMatchObject({ name: 'Association renommée', theme_color: '#1d4ed8' });
		expect(new URL(lu.icons[0]?.src ?? '', origin).searchParams.get('c')).toBe('1d4ed8');
		await maintenance((tx) =>
			tx.execute(sql`
				update "organization" set "name" = ${NOM}, "accent_color" = ${COULEUR},
					"updated_at" = now()
				where "id" = ${organizationId}
			`)
		);
	});

	it('answers 404 for an organisation that does not exist', async () => {
		const reponse = await fetch(`${origin}/m/organisation-inconnue/manifest.webmanifest`);
		expect(reponse.status).toBe(404);
	});
});

describe('les icônes de l’application', () => {
	it.each([
		['180.png', 180],
		['192.png', 192],
		['512.png', 512],
		['masque-512.png', 512]
	] as const)(
		'serves %s as a PNG of that size, kept for good by a cache',
		async (fichier, taille) => {
			const reponse = await fetch(`${origin}/m/${SLUG}/icone/${fichier}?c=${COULEUR.slice(1)}`);
			expect(reponse.status).toBe(200);
			expect(reponse.headers.get('content-type')).toBe('image/png');
			expect(reponse.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
			const octets = Buffer.from(await reponse.arrayBuffer());
			expect([...octets.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
			expect([octets.readUInt32BE(16), octets.readUInt32BE(20)]).toEqual([taille, taille]);
		}
	);

	it('paints the icon with the colour of the organisation, whatever the address says', async () => {
		// Le paramètre ne sert qu'à changer d'adresse quand la couleur change : il ne choisit rien.
		const lue = async (requete: string) => {
			const reponse = await fetch(`${origin}/m/${SLUG}/icone/masque-512.png${requete}`);
			const octets = Buffer.from(await reponse.arrayBuffer());
			// Le bloc IDAT suit l'en-tête : 8 octets de signature, 25 de IHDR, puis longueur et type.
			const longueur = octets.readUInt32BE(33);
			const brut = inflateSync(octets.subarray(41, 41 + longueur));
			return [...brut.subarray(1, 5)];
		};
		const attendue = [0xb4, 0x53, 0x09, 255];
		expect(await lue(`?c=${COULEUR.slice(1)}`)).toEqual(attendue);
		expect(await lue('?c=000000')).toEqual(attendue);
		expect(await lue('')).toEqual(attendue);
	});

	it.each(['64.png', '512.jpg', 'masque-192.png', '192', '../192.png'])(
		'answers 404 for a file it does not serve: %s',
		async (fichier) => {
			const reponse = await fetch(`${origin}/m/${SLUG}/icone/${encodeURIComponent(fichier)}`);
			expect(reponse.status).toBe(404);
		}
	);

	it('answers 404 for an organisation that does not exist', async () => {
		const reponse = await fetch(`${origin}/m/organisation-inconnue/icone/192.png`);
		expect(reponse.status).toBe(404);
	});
});

describe('ce que les pages publiques annoncent', () => {
	it.each([
		['the programme', ''],
		['the Today view', '?vue=aujourdhui'],
		['the subscription page', '/agenda']
	] as const)('links the manifest, the colour and the icons on %s', async (_, chemin) => {
		const html = await (await fetch(`${origin}/m/${SLUG}${chemin}`)).text();
		const balises = tete(html);
		const page = `${origin}/m/${SLUG}${chemin}`;
		const lien = (rel: string) => balises.find((balise) => balise['rel'] === rel);
		const versManifeste = new URL(lien('manifest')?.['href'] ?? '', page);
		expect(versManifeste.pathname).toBe(`/m/${SLUG}/manifest.webmanifest`);
		expect(balises.find((balise) => balise['name'] === 'theme-color')?.['content']).toBe(COULEUR);
		const versIcone = new URL(lien('icon')?.['href'] ?? '', page);
		expect(versIcone.pathname).toBe(`/m/${SLUG}/icone/192.png`);
		expect(lien('icon')).toMatchObject({ type: 'image/png', sizes: '192x192' });
		const pourApple = new URL(lien('apple-touch-icon')?.['href'] ?? '', page);
		expect(pourApple.pathname).toBe(`/m/${SLUG}/icone/180.png`);
		expect(html).not.toMatch(/<script\b/i);
	});

	it('asks the manifest in the language of the page', async () => {
		const html = await (await fetch(`${origin}/m/${SLUG}/ar`)).text();
		const lien = tete(html).find((balise) => balise['rel'] === 'manifest');
		const vers = new URL(lien?.['href'] ?? '', `${origin}/m/${SLUG}/ar`);
		expect([vers.pathname, vers.searchParams.get('lang')]).toEqual([
			`/m/${SLUG}/manifest.webmanifest`,
			'ar'
		]);
	});

	// Le widget encadre un programme, pas une application (ADR 0053).
	it('announces nothing of the application in the frame of the widget', async () => {
		const html = await (await fetch(`${origin}/m/${SLUG}?embed=1`)).text();
		const balises = tete(html);
		expect(balises.find((balise) => balise['rel'] === 'manifest')).toBeUndefined();
		expect(balises.find((balise) => balise['name'] === 'theme-color')).toBeUndefined();
	});
});

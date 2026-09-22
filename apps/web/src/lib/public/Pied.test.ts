// Le pied de la page publique, rendu pour de vrai : le composant compilé par Svelte, côté serveur,
// comme SvelteKit le rend.
//
// Les tests unitaires tournent sans le greffon de Svelte. Ce fichier monte donc un Vite à lui, le
// temps de ses tests, avec le seul greffon de Svelte, l'alias `$lib`, et un `$app/paths` réduit à
// ce que le pied en attend : `resolve` rend le chemin tel quel, puisque la page publique n'a pas de
// chemin de base. Rien n'est écrit sur le disque, et le serveur n'écoute sur aucun port.

import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { LANGUES, t, type Langue } from '$lib/i18n.js';

const RACINE = fileURLToPath(new URL('../../..', import.meta.url));
const CHEMINS = '\0app-paths';

let vite: ViteDevServer;
let rendre: (props: { langue: Langue; lienAgenda: string; integre?: boolean }) => string;

beforeAll(async () => {
	vite = await createServer({
		configFile: false,
		root: RACINE,
		logLevel: 'silent',
		appType: 'custom',
		server: { middlewareMode: true, hmr: false, watch: null },
		optimizeDeps: { noDiscovery: true, include: [] },
		resolve: { alias: { $lib: fileURLToPath(new URL('..', import.meta.url)) } },
		plugins: [
			svelte({ configFile: false, compilerOptions: { runes: true } }),
			{
				name: 'jadwal-app-paths',
				resolveId: (id) => (id === '$app/paths' ? CHEMINS : undefined),
				load: (id) => (id === CHEMINS ? 'export const resolve = (chemin) => chemin;' : undefined)
			}
		]
	});
	const { default: Pied } = await vite.ssrLoadModule('/src/lib/public/Pied.svelte');
	// `render` vient du même Vite que le composant : un seul exemplaire de Svelte des deux côtés.
	const { render } = await vite.ssrLoadModule('svelte/server');
	rendre = (props) => render(Pied, { props }).body;
});

afterAll(async () => {
	await vite?.close();
});

/** Les liens du pied, leurs attributs et leur texte, dans l'ordre. */
function liens(html: string): { attributs: Record<string, string>; texte: string }[] {
	return [...html.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs)].map(([, attributs = '', texte = '']) => ({
		attributs: Object.fromEntries(
			[...attributs.matchAll(/([\w-]+)="([^"]*)"/g)]
				.map(([, nom = '', valeur = '']) => [nom, valeur] as const)
				.filter(([nom]) => nom !== 'class')
		),
		texte: texte.replaceAll(/<!--.*?-->/g, '').trim()
	}));
}

describe('le pied de la page publique', () => {
	// `/conditions` refuse d'être encadrée. Le mode intégré n'est pas le seul cadre : celui que
	// l'écran Partager donne à coller à la main charge la page sans `embed=1`, la même qu'un
	// visiteur ouvre directement. Le lien ouvre donc un nouvel onglet partout.
	it('opens the terms in a new tab outside the widget too, in the language of the page, towards a French text', () => {
		for (const langue of LANGUES) {
			const conditions = liens(rendre({ langue, lienAgenda: '/m/belvedere/agenda' }))[1];
			expect(conditions).toEqual({
				attributs: { href: '/conditions', hreflang: 'fr', target: '_blank', rel: 'noopener' },
				texte: t(langue).terms
			});
		}
	});

	it('opens the terms in a new tab from the frame, which they refuse to live in', () => {
		for (const langue of LANGUES) {
			const conditions = liens(rendre({ langue, lienAgenda: '/x', integre: true }))[1];
			expect(conditions).toEqual({
				attributs: { href: '/conditions', hreflang: 'fr', target: '_blank', rel: 'noopener' },
				texte: t(langue).terms
			});
		}
	});

	it('keeps the calendar link first, and the mention outside the frame only', () => {
		const dehors = rendre({ langue: 'ar', lienAgenda: '/m/belvedere/ar/agenda' });
		const dedans = rendre({ langue: 'ar', lienAgenda: '/m/belvedere/ar/agenda', integre: true });
		for (const html of [dehors, dedans]) {
			expect(liens(html)[0]).toEqual({
				attributs: { href: '/m/belvedere/ar/agenda' },
				texte: t('ar').subscribe
			});
			expect(liens(html)).toHaveLength(2);
		}
		expect(dehors).toContain(t('ar').offeredBy);
		expect(dedans).not.toContain(t('ar').offeredBy);
	});

	it('is the contentinfo landmark of the page', () => {
		expect(rendre({ langue: 'fr', lienAgenda: '/x' })).toMatch(/^(<!--[^>]*-->)*<footer\b/);
	});
});

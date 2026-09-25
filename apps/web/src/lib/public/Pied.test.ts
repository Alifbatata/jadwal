// Le pied de la page publique, rendu pour de vrai : le composant compilé par Svelte, côté serveur,
// comme SvelteKit le rend.
//
// Les tests unitaires tournent sans le greffon de Svelte. Ce fichier monte donc un Vite à lui, le
// temps de ses tests, avec le seul greffon de Svelte, l'alias `$lib`, et un `$app/paths` réduit à
// ce que le pied en attend : `resolve` rend le chemin tel quel, puisque la page publique n'a pas de
// chemin de base. Rien n'est écrit sur le disque, et le serveur n'écoute sur aucun port.

import { readFileSync } from 'node:fs';
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

/**
 * Les liens du pied, dans l'ordre : leurs attributs, leur texte visible, le texte réservé aux
 * lecteurs d'écran (l'élément de classe `pour-lecteur`), et leur texte entier, qui est ce qu'un
 * lecteur d'écran annonce comme nom du lien.
 */
function liens(html: string): {
	attributs: Record<string, string>;
	visible: string;
	cache: string;
	nom: string;
}[] {
	return [...html.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs)].map(([, attributs = '', contenu = '']) => {
		const sansCommentaires = contenu.replaceAll(/<!--.*?-->/g, '');
		const pourLecteur = /<span class="pour-lecteur[^"]*">(.*?)<\/span>/s;
		return {
			attributs: Object.fromEntries(
				[...attributs.matchAll(/([\w-]+)="([^"]*)"/g)]
					.map(([, nom = '', valeur = '']) => [nom, valeur] as const)
					.filter(([nom]) => nom !== 'class')
			),
			visible: sansCommentaires.replace(pourLecteur, '').trim(),
			cache: sansCommentaires.match(pourLecteur)?.[1] ?? '',
			nom: sansCommentaires.replaceAll(/<[^>]+>/g, '').trim()
		};
	});
}

/**
 * Le nom du lien des conditions, tel qu'un lecteur d'écran doit l'annoncer. Les textes du nouvel
 * onglet sont ceux que le chef de projet a donnés, mot pour mot, entre parenthèses : Chrome met une
 * espace autour de l'élément caché, qui est un bloc, et une virgule s'y retrouvait détachée du mot
 * qui la précède, « Conditions d’utilisation , s’ouvre… », mesuré dans Chrome 153.
 */
const NOM_DES_CONDITIONS: Record<Langue, string> = {
	fr: 'Conditions d’utilisation (s’ouvre dans un nouvel onglet)',
	de: 'Nutzungsbedingungen (öffnet sich in einem neuen Tab)',
	it: 'Condizioni d’uso (si apre in una nuova scheda)',
	ar: 'شروط الاستخدام (يُفتح في علامة تبويب جديدة)'
};

describe('le pied de la page publique', () => {
	// `/conditions` refuse d'être encadrée. Le mode intégré n'est pas le seul cadre : celui que
	// l'écran Partager donne à coller à la main charge la page sans `embed=1`, la même qu'un
	// visiteur ouvre directement. Le lien ouvre donc un nouvel onglet partout.
	it('opens the terms in a new tab outside the widget too, in the language of the page, towards a French text', () => {
		for (const langue of LANGUES) {
			const conditions = liens(rendre({ langue, lienAgenda: '/m/belvedere/agenda' }))[1];
			expect(conditions?.attributs).toEqual({
				href: '/conditions',
				hreflang: 'fr',
				target: '_blank',
				rel: 'noopener'
			});
			expect(conditions?.visible).toBe(t(langue).terms);
		}
	});

	it('opens the terms in a new tab from the frame, which they refuse to live in', () => {
		for (const langue of LANGUES) {
			const conditions = liens(rendre({ langue, lienAgenda: '/x', integre: true }))[1];
			expect(conditions?.attributs).toEqual({
				href: '/conditions',
				hreflang: 'fr',
				target: '_blank',
				rel: 'noopener'
			});
			expect(conditions?.visible).toBe(t(langue).terms);
		}
	});

	// Technique G201 des WCAG : un lien qui ouvre un nouvel onglet le dit avant qu'on le suive.
	// Le texte est hors de la vue, pas hors de l'arbre d'accessibilité : l'œil lit « Conditions
	// d’utilisation », le lecteur d'écran lit la phrase entière.
	it('tells a screen reader, in the language of the page, that the terms open in a new tab', () => {
		for (const langue of LANGUES) {
			for (const integre of [false, true]) {
				const conditions = liens(rendre({ langue, lienAgenda: '/x', integre }))[1];
				expect(conditions?.nom, langue).toBe(NOM_DES_CONDITIONS[langue]);
				// L'annonce commence par une espace : sans elle, un calcul du nom qui ne sépare pas
				// les blocs, ou une page lue sans sa feuille de style, collerait les deux textes.
				expect(conditions?.cache, langue).toBe(
					NOM_DES_CONDITIONS[langue].slice(t(langue).terms.length)
				);
				expect(conditions?.cache, langue).toMatch(/^ \(/);
			}
		}
	});

	it('hides that sentence from the eye only, with a rule of its own', () => {
		// Le rendu côté serveur ne porte pas la feuille de style du composant : elle est lue dans sa
		// source. `tests/langue-des-pages.test.ts` la relit telle que le serveur la sert.
		const style = readFileSync(new URL('./Pied.svelte', import.meta.url), 'utf8').match(
			/<style>([\s\S]*)<\/style>/
		)?.[1];
		const regle = style?.match(/\.pour-lecteur\s*\{([^}]*)\}/)?.[1];
		expect(regle, 'aucune règle pour la classe « pour-lecteur »').toBeTruthy();
		expect(regle).toMatch(/position:\s*absolute/);
		expect(regle).toMatch(/clip-path:\s*inset\(50%\)/);
		// L'un ou l'autre le retirerait aussi aux lecteurs d'écran.
		expect(regle).not.toMatch(/display:\s*none|visibility:\s*hidden/);
	});

	it('keeps the calendar link first, and the mention outside the frame only', () => {
		const dehors = rendre({ langue: 'ar', lienAgenda: '/m/belvedere/ar/agenda' });
		const dedans = rendre({ langue: 'ar', lienAgenda: '/m/belvedere/ar/agenda', integre: true });
		for (const html of [dehors, dedans]) {
			// Ce lien-là reste dans la page : il n'annonce rien de plus que son texte.
			expect(liens(html)[0]).toEqual({
				attributs: { href: '/m/belvedere/ar/agenda' },
				visible: t('ar').subscribe,
				cache: '',
				nom: t('ar').subscribe
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

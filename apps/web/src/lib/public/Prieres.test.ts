// L'onglet des prières de la page publique, rendu pour de vrai : le composant compilé par Svelte,
// côté serveur, comme SvelteKit le rend (même montage que `Pied.test.ts`).
//
// Ce que ce fichier éprouve et que le test d'accès ne peut pas éprouver chaque jour : le tableau du
// jour **un vendredi**. Le serveur prend la date du jour à l'horloge ; ici, le jour est choisi.
//
// Les lignes datées suivent les séances réelles de chaque vendredi, annulations et déplacements
// compris, comme la vue Semaine de la même page (étape 18, relecture du lot 3). Le bloc du bas, sans
// date, garde le rythme habituel.

import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const RACINE = fileURLToPath(new URL('../../..', import.meta.url));

type Langue = 'fr' | 'de' | 'it' | 'en' | 'ar';
interface SeanceDuVendredi {
	id: string;
	start: string | null;
	status: 'scheduled' | 'cancelled' | 'moved_away' | 'moved_here';
	movedTo: string | null;
}
interface Proprietes {
	langue: Langue;
	today: string;
	jours: {
		date: string;
		heures: { priere: string; adhan: string | null; iqama: string | null }[];
		vendredi: SeanceDuVendredi[];
	}[];
	sessions: { id: string; start: string; sermonLanguages: string[]; room: string | null }[];
}

let vite: ViteDevServer;
let rendre: (props: Proprietes) => string;

beforeAll(async () => {
	vite = await createServer({
		configFile: false,
		root: RACINE,
		// Un cache à lui : celui de `Pied.test.ts`, qui tourne en même temps dans un autre processus,
		// se réécrivait sous ses pieds, et la suite complète tombait sur « There is a new version of the
		// pre-bundle for …/deps_ssr/svelte_internal_server.js ».
		cacheDir: 'node_modules/.vite-prieres-test',
		logLevel: 'silent',
		appType: 'custom',
		server: { middlewareMode: true, hmr: false, watch: null },
		optimizeDeps: { noDiscovery: true, include: [] },
		resolve: { alias: { $lib: fileURLToPath(new URL('..', import.meta.url)) } },
		plugins: [svelte({ configFile: false, compilerOptions: { runes: true } })]
	});
	const { default: Prieres } = await vite.ssrLoadModule('/src/lib/public/Prieres.svelte');
	const { render } = await vite.ssrLoadModule('svelte/server');
	rendre = (props) => render(Prieres, { props }).body;
});

afterAll(async () => {
	await vite?.close();
});

/** Un vendredi, et le jeudi qui le précède. */
const VENDREDI = '2026-10-02';
const JEUDI = '2026-10-01';
const VENDREDI_SUIVANT = '2026-10-09';

const HEURES = [
	{ priere: 'fajr', adhan: '05:30', iqama: '05:50' },
	{ priere: 'dhuhr', adhan: '13:05', iqama: '13:15' },
	{ priere: 'asr', adhan: '16:30', iqama: null },
	{ priere: 'maghrib', adhan: '19:10', iqama: '19:15' },
	{ priere: 'isha', adhan: '20:40', iqama: '20:55' }
];

/** Le rythme habituel : trois sessions, sans date. */
const SESSIONS = [
	{ id: 's1', start: '12:30', sermonLanguages: ['ar', 'fr'], room: null },
	{ id: 's2', start: '13:45', sermonLanguages: ['de'], room: null },
	{ id: 's3', start: '15:00', sermonLanguages: ['en'], room: null }
];

const prevues: SeanceDuVendredi[] = SESSIONS.map((session) => ({
	id: session.id,
	start: session.start,
	status: 'scheduled',
	movedTo: null
}));

/**
 * Ce vendredi-là, telles que l'expansion les rend : la première annulée ; la deuxième déplacée à
 * 14:15 le même jour (elle part de 13:45 et arrive à 14:15) ; la troisième déplacée au vendredi
 * suivant.
 */
const changees: SeanceDuVendredi[] = [
	{ id: 's1', start: '12:30', status: 'cancelled', movedTo: null },
	{ id: 's2', start: '13:45', status: 'moved_away', movedTo: VENDREDI },
	{ id: 's2', start: '14:15', status: 'moved_here', movedTo: null },
	{ id: 's3', start: '15:00', status: 'moved_away', movedTo: VENDREDI_SUIVANT }
];

function proprietes(langue: Langue, vendredi: SeanceDuVendredi[]): Proprietes {
	return {
		langue,
		today: VENDREDI,
		jours: [
			{ date: JEUDI, heures: HEURES, vendredi: [] },
			{ date: VENDREDI, heures: HEURES, vendredi }
		],
		sessions: SESSIONS
	};
}

/** Ce que l'œil lit d'un fragment : sans balise, sans le texte réservé aux lecteurs d'écran. */
function lu(fragment: string): string {
	return fragment
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<span class="pour-lecteur[^"]*">[^<]*<\/span>/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Les lignes d'un tableau : l'en-tête de ligne, puis chaque case, telles que l'œil les lit. */
function lignes(html: string, classe: string): string[][] {
	const tableau =
		html.match(
			new RegExp(`<table\\b[^>]*\\bclass="${classe}\\b[^"]*"[^>]*>([\\s\\S]*?)</table>`)
		)?.[1] ?? '';
	const corps = tableau.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
	return [...corps.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((ligne) =>
		[...(ligne[1] ?? '').matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/g)].map((cellule) =>
			lu(cellule[1] ?? '')
		)
	);
}

/** Le Dhuhr du tableau du jour : sa case d'iqama. */
const iqamaDuDhuhr = (html: string) => lignes(html, 'aujourdhui')[1]?.[2];
/** La case du Dhuhr d'une ligne de la semaine. */
const caseDuDhuhr = (html: string, rang: number) => lignes(html, 'semaine')[rang]?.[2];

describe('l’onglet des prières, un vendredi', () => {
	it('gives the usual sessions of a Friday that nothing changed', () => {
		const html = rendre(proprietes('fr', prevues));
		expect(iqamaDuDhuhr(html)).toBe('Prière du vendredi : 12:30, 13:45 et 15:00');
		expect(caseDuDhuhr(html, 1)).toBe('13:05 12:30 13:45 15:00');
		// Le jeudi garde son iqama.
		expect(caseDuDhuhr(html, 0)).toBe('13:05 13:15');
	});

	it('follows the sessions of that Friday: one cancelled, one moved that day, one moved away', () => {
		const html = rendre(proprietes('fr', changees));
		expect(iqamaDuDhuhr(html)).toBe(
			'Prière du vendredi : 14:15 ' +
				'Prière du vendredi : 12:30 Annulé ' +
				'Prière du vendredi : 15:00 Déplacé au vendredi 09.10.2026'
		);
		expect(caseDuDhuhr(html, 1)).toBe(
			'13:05 14:15 12:30 Annulé 15:00 Déplacé au vendredi 09.10.2026'
		);
		// Ce qui n'a pas lieu est barré. L'heure de départ d'une session déplacée le même jour n'est
		// pas écrite (les deux cases ci-dessus n'ont pas de 13:45) : c'est la nouvelle heure qui compte.
		expect(html.match(/<s>[^<]*<\/s>/g)).toEqual([
			'<s>Prière du vendredi : 12:30</s>',
			'<s>Prière du vendredi : 15:00</s>',
			'<s>12:30</s>',
			'<s>15:00</s>'
		]);
	});

	it('keeps the usual rhythm in the block below, which has no date', () => {
		const html = rendre(proprietes('fr', changees));
		const section = html.match(/<section\b[^>]*\bid="prieres-vendredi"[\s\S]*?<\/section>/)?.[0];
		expect(
			[...(section ?? '').matchAll(/<span class="heure[^"]*">([^<]*)<\/span>/g)].map(
				(trouve) => trouve[1]
			)
		).toEqual(['12:30', '13:45', '15:00']);
	});

	it('gives the iqama of Dhuhr back when every session of that Friday is cancelled', () => {
		const annulees = prevues.map((seance) => ({ ...seance, status: 'cancelled' as const }));
		const html = rendre(proprietes('fr', annulees));
		expect(iqamaDuDhuhr(html)).toBe(
			'13:15 ' +
				'Prière du vendredi : 12:30 Annulé ' +
				'Prière du vendredi : 13:45 Annulé ' +
				'Prière du vendredi : 15:00 Annulé'
		);
		expect(caseDuDhuhr(html, 1)).toBe('13:05 13:15 12:30 Annulé 13:45 Annulé 15:00 Annulé');
	});

	it('says it in the language of the page', () => {
		const anglais = rendre(proprietes('en', changees));
		expect(iqamaDuDhuhr(anglais)).toBe(
			'Friday prayer: 14:15 Friday prayer: 12:30 Cancelled Friday prayer: 15:00 Moved to Friday 09.10.2026'
		);
		const arabe = rendre(proprietes('ar', changees));
		expect(caseDuDhuhr(arabe, 1)).toBe('13:05 14:15 12:30 ملغى 15:00 نُقل إلى الجمعة 09.10.2026');
	});

	it('tells a screen reader that each time of the Dhuhr box is the Friday prayer', () => {
		const html = rendre(proprietes('en', changees));
		const ligne = html.match(/<table\b[^>]*\bclass="semaine[\s\S]*?<\/table>/)?.[0] ?? '';
		const annonces = [...ligne.matchAll(/<span class="pour-lecteur[^"]*">([^<]*)<\/span>/g)].map(
			(trouve) => trouve[1]
		);
		// Chaque adhan et chaque iqama des deux jours (5 + 4, puis 5 + 3, l'Asr n'en a pas), et les
		// trois heures du vendredi.
		expect(annonces).toHaveLength(2 * 5 + 4 + 3 + 3);
		// Chaque annonce finit par une espace : Svelte retire celle qu'on écrit avant `</span>`, et le
		// lecteur d'écran lisait « Friday prayer12:30 ».
		expect(annonces.filter((annonce) => !annonce?.endsWith(' '))).toEqual([]);
		expect(ligne).toMatch(/<span class="pour-lecteur[^"]*">Friday prayer <\/span><s>12:30<\/s>/);
	});
});

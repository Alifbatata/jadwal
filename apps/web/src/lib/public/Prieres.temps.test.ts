// L'onglet des prières de la page publique, rendu pour de vrai : le composant compilé par Svelte,
// côté serveur, comme SvelteKit le rend (même montage que `Pied.temps.test.ts`).
//
// Ce montage demande un serveur Vite, et sous la charge de la suite complète, son démarrage a
// dépassé le délai de 10 s de Vitest (étape 18). Ce fichier tourne donc à part, dans
// `pnpm test:temps` (étape 19), avec un délai tiré d'une mesure : `CONTRIBUTING.md`, « Les tests
// liés au temps », dit comment.
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
	/** Pour une session venue d'un autre jour : le vendredi où elle était prévue. */
	originalDate?: string | null;
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

/**
 * Le délai du démarrage de Vite, en millisecondes : quinze fois le maximum mesuré à l'étape 19, sur
 * cinq passages du fichier sur le poste chargé (618 à 758 ms), arrondi à la seconde.
 */
const DEMARRAGE_DE_VITE = 12_000;

beforeAll(async () => {
	vite = await createServer({
		configFile: false,
		root: RACINE,
		// Un cache à lui : celui de `Pied.temps.test.ts`, qui tourne en même temps dans un autre
		// processus, se réécrivait sous ses pieds, et la suite tombait sur « There is a new version of
		// the pre-bundle for …/deps_ssr/svelte_internal_server.js ».
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
}, DEMARRAGE_DE_VITE);

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
				'Prière du vendredi : 12:30 Annulée ' +
				'Prière du vendredi : 15:00 Déplacé au vendredi 09.10.2026'
		);
		expect(caseDuDhuhr(html, 1)).toBe(
			'13:05 14:15 12:30 Annulée 15:00 Déplacé au vendredi 09.10.2026'
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
				'Prière du vendredi : 12:30 Annulée ' +
				'Prière du vendredi : 13:45 Annulée ' +
				'Prière du vendredi : 15:00 Annulée'
		);
		expect(caseDuDhuhr(html, 1)).toBe('13:05 13:15 12:30 Annulée 13:45 Annulée 15:00 Annulée');
	});

	it('says it in the language of the page', () => {
		const anglais = rendre(proprietes('en', changees));
		expect(iqamaDuDhuhr(anglais)).toBe(
			'Friday prayer: 14:15 Friday prayer: 12:30 Cancelled Friday prayer: 15:00 Moved to Friday 09.10.2026'
		);
		const arabe = rendre(proprietes('ar', changees));
		expect(caseDuDhuhr(arabe, 1)).toBe('13:05 14:15 12:30 ملغاة 15:00 نُقل إلى الجمعة 09.10.2026');
	});

	// Décision du chef de projet, au 27.09.2026 : « Annulée » s'accorde avec « Prière du vendredi »,
	// là où la langue accorde. L'allemand et l'anglais n'ont qu'une forme.
	it('agrees « cancelled » with the Friday prayer, in each language', () => {
		const ANNULEE: Record<Langue, string> = {
			fr: 'Annulée',
			de: 'Abgesagt',
			it: 'Annullata',
			en: 'Cancelled',
			ar: 'ملغاة'
		};
		for (const langue of ['fr', 'de', 'it', 'en', 'ar'] as const) {
			const html = rendre(proprietes(langue, changees));
			const marques = [...html.matchAll(/<span class="marque[^"]*">([^<]*)<\/span>/g)].map(
				(trouve) => trouve[1]
			);
			expect(
				marques.filter((marque) => marque === ANNULEE[langue]),
				langue
			).toHaveLength(2);
		}
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

/**
 * Relecture du lot 4 : une session du vendredi déplacée à un autre jour s'écrivait dans la case du
 * Dhuhr de ce jour-là comme une troisième heure en gras, sans nom visible, et après l'iqama même
 * quand elle venait avant. Seul un lecteur d'écran entendait « Prière du vendredi ».
 */
describe('l’onglet des prières, un jour qui reçoit une session du vendredi', () => {
	/** Trois sessions du vendredi 02.10.2026 déplacées au jeudi : avant l'adhan, entre l'adhan et l'iqama, après l'iqama. */
	const venues: SeanceDuVendredi[] = ['13:00', '13:10', '14:30'].map((start, rang) => ({
		id: `s${rang + 1}`,
		start,
		status: 'moved_here',
		movedTo: null,
		originalDate: VENDREDI
	}));
	/** Le jeudi, qui est aujourd'hui : les deux tableaux ont une ligne pour lui. */
	const jeudi = (langue: Langue): Proprietes => ({
		langue,
		today: JEUDI,
		jours: [
			{ date: JEUDI, heures: HEURES, vendredi: venues },
			{
				date: VENDREDI,
				heures: HEURES,
				vendredi: venues.map((seance) => ({
					id: seance.id,
					start: SESSIONS.find((session) => session.id === seance.id)?.start ?? null,
					status: 'moved_away',
					movedTo: JEUDI,
					originalDate: null
				}))
			}
		],
		sessions: SESSIONS
	});

	it('names each session, says its Friday, keeps the iqama and puts each at its place in time', () => {
		const html = rendre(jeudi('fr'));
		const origine = 'Initialement le vendredi 02.10.2026';
		expect(caseDuDhuhr(html, 0)).toBe(
			`Prière du vendredi : 13:00 ${origine} 13:05 ` +
				`Prière du vendredi : 13:10 ${origine} 13:15 ` +
				`Prière du vendredi : 14:30 ${origine}`
		);
		// Dans le tableau du jour, la case de l'iqama : chacune avant ou après l'iqama selon son heure.
		expect(iqamaDuDhuhr(html)).toBe(
			`Prière du vendredi : 13:00 ${origine} Prière du vendredi : 13:10 ${origine} 13:15 ` +
				`Prière du vendredi : 14:30 ${origine}`
		);
		// Le vendredi garde son iqama, et chaque session y dit où elle est partie.
		expect(caseDuDhuhr(html, 1)).toBe(
			'13:05 13:15 12:30 Déplacé au jeudi 01.10.2026 13:45 Déplacé au jeudi 01.10.2026 ' +
				'15:00 Déplacé au jeudi 01.10.2026'
		);
	});

	it('says this case in the help above the table, and only when it happens', () => {
		const aides = (html: string) =>
			[...html.matchAll(/<p class="aide[^"]*">([^<]*)<\/p>/g)].map((trouve) => trouve[1]);
		const aide =
			'Quand une prière du vendredi est déplacée à un autre jour, la case du Dhuhr de ce jour-là la donne aussi, avec son nom et sa date d’origine.';
		expect(aides(rendre(jeudi('fr')))).toContain(aide);
		expect(aides(rendre(proprietes('fr', changees)))).not.toContain(aide);
	});

	it('says it in the language of the page', () => {
		const anglais = rendre(jeudi('en'));
		expect(caseDuDhuhr(anglais, 0)).toBe(
			'Friday prayer: 13:00 Originally on Friday 02.10.2026 13:05 ' +
				'Friday prayer: 13:10 Originally on Friday 02.10.2026 13:15 ' +
				'Friday prayer: 14:30 Originally on Friday 02.10.2026'
		);
		const arabe = rendre(jeudi('ar'));
		expect(caseDuDhuhr(arabe, 0)).toBe(
			'صلاة الجمعة: 13:00 كان مقرّرًا في الجمعة 02.10.2026 13:05 ' +
				'صلاة الجمعة: 13:10 كان مقرّرًا في الجمعة 02.10.2026 13:15 ' +
				'صلاة الجمعة: 14:30 كان مقرّرًا في الجمعة 02.10.2026'
		);
	});
});

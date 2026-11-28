// Ce que le travailleur de service décide, sans navigateur : quelle requête il prend, quelle réponse
// il garde, et comment il marque une copie servie sans réseau (étape 24, ADR 0054).

import { describe, expect, it } from 'vitest';
import { numericDate } from '#lib/i18n.js';
import {
	aElaguer,
	fichierAGarder,
	genreDeRequete,
	jourEtHeure,
	marquerCopie,
	pageAGarder,
	reseauARepondu
} from './copie.js';

const PORTEE = 'https://jadwal.example/m/';

function requete(
	url: string,
	autres: Partial<{ methode: string; mode: string; destination: string }> = {}
) {
	return {
		methode: 'GET',
		mode: 'navigate',
		destination: 'document',
		url,
		portee: PORTEE,
		...autres
	};
}

describe('ce que le travailleur prend', () => {
	it.each([
		'https://jadwal.example/m/association',
		'https://jadwal.example/m/association?vue=aujourdhui',
		'https://jadwal.example/m/association/ar?vue=prieres',
		'https://jadwal.example/m/association/agenda',
		'https://jadwal.example/m/association/cours/0190-abcd'
	])('takes the navigation to a public page: %s', (url) => {
		expect(genreDeRequete(requete(url))).toBe('page');
	});

	it.each([
		['the space of the people in charge', 'https://jadwal.example/'],
		['the settings', 'https://jadwal.example/reglages'],
		['the public API', 'https://jadwal.example/api/v1/organisations/association'],
		['the terms', 'https://jadwal.example/conditions'],
		['a page whose address only starts like the scope', 'https://jadwal.example/membres'],
		['another site', 'https://ailleurs.example/m/association']
	])('leaves %s to the browser', (_, url) => {
		expect(genreDeRequete(requete(url))).toBeNull();
	});

	it('leaves the listening view of the live broadcast to the browser', () => {
		// Sans réseau, pas de direct : une copie dirait « pas de direct » à tort (ADR 0057).
		for (const url of [
			'https://jadwal.example/m/association?vue=direct',
			'https://jadwal.example/m/association/de?vue=direct'
		]) {
			expect(genreDeRequete(requete(url))).toBeNull();
		}
		expect(genreDeRequete(requete('https://jadwal.example/m/association?vue=infos'))).toBe('page');
	});

	it('leaves the frame of the widget to the browser', () => {
		expect(genreDeRequete(requete('https://jadwal.example/m/association?embed=1'))).toBeNull();
	});

	it('leaves a page opened in a frame to the browser, whatever its address', () => {
		// Le cadre posé à la main charge la page sans `embed=1` : c'est la destination qui le dit.
		const url = 'https://jadwal.example/m/association';
		expect(genreDeRequete(requete(url, { destination: 'iframe' }))).toBeNull();
		expect(genreDeRequete(requete(url, { destination: 'frame' }))).toBeNull();
	});

	it('leaves anything but a GET to the browser', () => {
		const url = 'https://jadwal.example/m/association';
		expect(genreDeRequete(requete(url, { methode: 'POST' }))).toBeNull();
		expect(genreDeRequete(requete(url, { methode: 'HEAD' }))).toBeNull();
	});

	it('takes the style sheets, the images and the fonts of its own site', () => {
		for (const destination of ['style', 'image', 'font']) {
			const fichier = requete('https://jadwal.example/_app/immutable/assets/0.abc.css', {
				mode: 'no-cors',
				destination
			});
			expect(genreDeRequete(fichier), destination).toBe('fichier');
		}
	});

	it('leaves the scripts, the manifest and the calls of a page to the browser', () => {
		for (const destination of ['script', 'manifest', '', 'iframe']) {
			const autre = requete('https://jadwal.example/m/hors-reseau.js', {
				mode: 'no-cors',
				destination
			});
			expect(genreDeRequete(autre), destination).toBeNull();
		}
	});

	it('leaves a file of another site to the browser', () => {
		const ailleurs = requete('https://ailleurs.example/police.woff2', {
			mode: 'cors',
			destination: 'font'
		});
		expect(genreDeRequete(ailleurs)).toBeNull();
	});
});

describe('ce que le travailleur garde', () => {
	const page = { status: 200, type: 'basic', contentType: 'text/html; charset=utf-8' };

	it('keeps a page that was served', () => {
		expect(pageAGarder(page)).toBe(true);
	});

	it.each([
		['an error', { ...page, status: 404 }],
		['a failure of the server', { ...page, status: 500 }],
		['a redirection', { ...page, status: 0, type: 'opaqueredirect' }],
		['a calendar feed', { ...page, contentType: 'text/calendar; charset=utf-8' }],
		['an answer without a type', { ...page, contentType: null }]
	])('does not keep %s', (_, reponse) => {
		expect(pageAGarder(reponse)).toBe(false);
	});

	it('keeps a file only when the server says it never changes', () => {
		const fichier = { status: 200, type: 'basic' };
		expect(
			fichierAGarder({ ...fichier, cacheControl: 'public, max-age=31536000, immutable' })
		).toBe(true);
		expect(fichierAGarder({ ...fichier, cacheControl: 'public, max-age=3600' })).toBe(false);
		expect(fichierAGarder({ ...fichier, cacheControl: null })).toBe(false);
		expect(fichierAGarder({ status: 404, type: 'basic', cacheControl: 'immutable' })).toBe(false);
	});

	it('takes any answer of the server but a failure for an answer of the network', () => {
		expect(reseauARepondu(200)).toBe(true);
		expect(reseauARepondu(304)).toBe(true);
		expect(reseauARepondu(404)).toBe(true);
		expect(reseauARepondu(500)).toBe(false);
		expect(reseauARepondu(502)).toBe(false);
		expect(reseauARepondu(503)).toBe(false);
	});

	it('drops the oldest copies beyond the ceiling, and nothing below it', () => {
		expect(aElaguer(['a', 'b', 'c', 'd', 'e'], 3)).toEqual(['a', 'b']);
		expect(aElaguer(['a', 'b', 'c'], 3)).toEqual([]);
		expect(aElaguer([], 3)).toEqual([]);
	});
});

describe('la mention d’une copie', () => {
	it('writes the day as every date of the service, and the hour on two figures', () => {
		// L'heure locale de l'appareil : c'est le moment où ce téléphone a gardé la page.
		const quand = new Date(2026, 10, 6, 9, 5);
		expect(jourEtHeure(quand)).toEqual({ jour: '06.11.2026', heure: '09:05' });
		expect(jourEtHeure(quand).jour).toBe(numericDate('2026-11-06'));
	});

	const gabarit = (cachee: string) =>
		`<main><p class="copie svelte-1abc" ${cachee} data-jadwal-copie>Copie du <span data-jadwal-copie-jour></span> à <span data-jadwal-copie-heure></span>.</p><p hidden>autre</p></main>`;
	const quand = new Date(2026, 10, 26, 14, 5);

	it.each([['hidden'], ['hidden=""']])('shows the mention and dates it: %s', (cachee) => {
		expect(marquerCopie(gabarit(cachee), quand)).toBe(
			'<main><p class="copie svelte-1abc" data-jadwal-copie>Copie du <span data-jadwal-copie-jour>26.11.2026</span> à <span data-jadwal-copie-heure>14:05</span>.</p><p hidden>autre</p></main>'
		);
	});

	it('finds the mention whatever the order of its attributes', () => {
		const html =
			'<p data-jadwal-copie hidden class="copie">Le <span class="x" data-jadwal-copie-jour></span></p>';
		expect(marquerCopie(html, quand)).toBe(
			'<p data-jadwal-copie class="copie">Le <span class="x" data-jadwal-copie-jour>26.11.2026</span></p>'
		);
	});

	it('leaves a page without the mention as it is', () => {
		const html = '<main><p hidden>autre</p><span data-jadwal-copie-jour-de-plus></span></main>';
		expect(marquerCopie(html, quand)).toBe(html);
	});
});

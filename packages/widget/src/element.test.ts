// Ce que le widget doit tenir, et surtout ce qu'il doit refuser.
//
// Les messages sont fabriqués à la main plutôt qu'envoyés par `postMessage` : c'est le seul moyen de
// choisir l'origine et la fenêtre émettrice, c'est-à-dire précisément les deux choses que le widget
// vérifie. Un test qui ne saurait pas mentir ne prouverait rien.

import { afterEach, describe, expect, it } from 'vitest';
import { TAG_NAME } from './index.js';

const ORIGINE = 'https://jadwal.example';

function poser(attributs: string, repli = '<a href="https://jadwal.example/m/x">Programme</a>') {
	document.body.innerHTML = `<jadwal-widget ${attributs}>${repli}</jadwal-widget>`;
	return document.querySelector(TAG_NAME) as HTMLElement;
}

function cadreDe(element: HTMLElement): HTMLIFrameElement | null {
	return element.shadowRoot?.querySelector('iframe') ?? null;
}

/**
 * jsdom ne crée pas de contexte de navigation pour un cadre placé dans un shadow root : son
 * `contentWindow` vaut `null`, alors qu'il vaut une fenêtre dans tout navigateur. On lui en prête
 * donc une vraie, empruntée à un cadre du DOM clair — sans quoi la vérification que ces tests
 * existent pour éprouver comparerait deux absences et passerait toujours.
 */
function brancher(cadre: HTMLIFrameElement): Window {
	const porteur = document.createElement('iframe');
	document.body.append(porteur);
	const fenetre = porteur.contentWindow as Window;
	Object.defineProperty(cadre, 'contentWindow', { value: fenetre, configurable: true });
	return fenetre;
}

/** Une autre fenêtre de la page : une régie publicitaire, un chat, un autre widget. */
function fenetreEtrangere(): Window {
	const autre = document.createElement('iframe');
	document.body.append(autre);
	return autre.contentWindow as Window;
}

/** Un message tel que la page intégrée l'enverrait, ou tel qu'un autre site l'enverrait. */
function annoncer(options: {
	source: Window | null;
	origin?: string;
	data?: unknown;
	height?: number;
}) {
	const data =
		'data' in options ? options.data : { type: 'jadwal:height:1', height: options.height };
	window.dispatchEvent(
		new MessageEvent('message', {
			data,
			origin: options.origin ?? ORIGINE,
			source: options.source as MessageEventSource
		})
	);
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('l’enregistrement et les attributs', () => {
	it('registers the custom element', () => {
		expect(customElements.get(TAG_NAME)).toBeDefined();
	});

	it('builds the frame address from the attributes', () => {
		const element = poser(
			`org="madretsch" lang="de" view="mois" audience="kids" base="${ORIGINE}"`
		);
		const source = cadreDe(element)?.src ?? '';
		const url = new URL(source);
		expect(url.origin).toBe(ORIGINE);
		expect(url.pathname).toBe('/m/madretsch/de');
		expect(url.searchParams.get('vue')).toBe('mois');
		expect(url.searchParams.get('public')).toBe('kids');
		// C'est ce paramètre, et lui seul, qui fait charger le script d'annonce de hauteur.
		expect(url.searchParams.get('embed')).toBe('1');
	});

	it('leaves the language out of the path when none is asked, and the default view out of the query', () => {
		const element = poser(`org="madretsch" view="semaine" base="${ORIGINE}"`);
		const url = new URL(cadreDe(element)?.src ?? '');
		expect(url.pathname).toBe('/m/madretsch');
		expect(url.searchParams.get('vue')).toBeNull();
	});

	it('ignores an absurd attribute instead of breaking', () => {
		const element = poser(
			`org="madretsch" lang="klingon" view="tableau" audience="chats" min-height="-42" base="${ORIGINE}"`
		);
		const cadre = cadreDe(element);
		const url = new URL(cadre?.src ?? '');
		expect(url.pathname).toBe('/m/madretsch');
		expect(url.searchParams.get('vue')).toBeNull();
		expect(url.searchParams.get('public')).toBeNull();
		// La hauteur minimale retombe sur celle du widget, jamais sur une valeur négative.
		expect(cadre?.style.height).toBe('320px');
	});

	it('names the frame, for someone who navigates with a screen reader', () => {
		const element = poser(`org="madretsch" base="${ORIGINE}"`);
		expect(cadreDe(element)?.title).toBe('Programme des cours');
		const allemand = poser(`org="madretsch" lang="de" base="${ORIGINE}"`);
		expect(cadreDe(allemand)?.title).toBe('Kursprogramm');
	});

	it('shows no frame at all without an organisation, and keeps the fallback content in place', () => {
		const element = poser(`base="${ORIGINE}"`);
		expect(cadreDe(element)).toBeNull();
		// Le repli reste dans le DOM clair : c'est lui qu'un visiteur sans JavaScript verrait.
		expect(element.querySelector('a')?.getAttribute('href')).toBe('https://jadwal.example/m/x');
	});

	it('carries a discreet footer with a link to the public page', () => {
		const element = poser(`org="madretsch" base="${ORIGINE}"`);
		const lien = element.shadowRoot?.querySelector('footer a') as HTMLAnchorElement;
		expect(lien.textContent).toBe('Voir le programme complet');
		// Le lien sort du cadre : c'est aussi celui qui reste utile quand le cadre ne s'affiche pas.
		expect(lien.getAttribute('href')).toBe(`${ORIGINE}/m/madretsch`);
		expect(lien.target).toBe('_blank');
		expect(element.shadowRoot?.querySelector('footer span')?.textContent).toBe(
			'Proposé gratuitement par jadwal, un service de Voltia'
		);
	});

	it('never renders the fallback content itself: there is no slot in the shadow root', () => {
		// C'est le mécanisme du repli. L'élément n'a pas de `<slot>`, donc ses enfants ne sont pas
		// affichés dès qu'il est défini — et ils le sont tant qu'il ne l'est pas, c'est-à-dire
		// exactement quand le script n'a pas pu s'exécuter chez le visiteur.
		const element = poser(`org="madretsch" base="${ORIGINE}"`);
		expect(element.shadowRoot?.querySelector('slot')).toBeNull();
	});

	it('replaces the frame instead of renavigating it when an attribute changes', () => {
		const element = poser(`org="madretsch" base="${ORIGINE}"`);
		const premier = cadreDe(element);
		element.setAttribute('lang', 'it');
		const second = cadreDe(element);
		// Réécrire `src` ajouterait une entrée à l'historique du site de la mosquée.
		expect(second).not.toBe(premier);
		expect(new URL(second?.src ?? '').pathname).toBe('/m/madretsch/it');
	});
});

describe('la hauteur annoncée par le cadre', () => {
	it('applies a height announced by its own frame', () => {
		const element = poser(`org="madretsch" base="${ORIGINE}"`);
		const cadre = cadreDe(element) as HTMLIFrameElement;
		const fenetre = brancher(cadre);
		annoncer({ source: fenetre, height: 940 });
		expect(cadre.style.height).toBe('940px');
	});

	it('ignores a message from another origin', () => {
		const element = poser(`org="madretsch" base="${ORIGINE}"`);
		const cadre = cadreDe(element) as HTMLIFrameElement;
		const fenetre = brancher(cadre);
		for (const origine of [
			'https://jadwal.example.evil.test',
			'https://evil-jadwal.example',
			'https://xjadwal.example',
			'http://jadwal.example',
			'null'
		]) {
			annoncer({ source: fenetre, origin: origine, height: 1500 });
			expect(cadre.style.height, origine).toBe('320px');
		}
	});

	it('ignores a message from our origin but from another window', () => {
		const element = poser(`org="madretsch" base="${ORIGINE}"`);
		const cadre = cadreDe(element) as HTMLIFrameElement;
		const fenetre = brancher(cadre);
		// Une régie publicitaire, un chat, un autre cadre de la page : la bonne origine ne suffit pas.
		annoncer({ source: fenetreEtrangere(), height: 1500 });
		expect(cadre.style.height).toBe('320px');
		// Un message sans émetteur — un travailleur, un canal — ne vaut pas davantage.
		annoncer({ source: null, height: 1500 });
		expect(cadre.style.height).toBe('320px');
		// Et le cadre, lui, est bien écouté : sans cette ligne, le test passerait à vide.
		annoncer({ source: fenetre, height: 1500 });
		expect(cadre.style.height).toBe('1500px');
	});

	it.each([
		['forme inattendue', { type: 'jadwal:height:1' }],
		['nom inattendu', { type: 'resize', height: 900 }],
		['version plus ancienne', { type: 'jadwal:height', height: 900 }],
		['hauteur en texte', { type: 'jadwal:height:1', height: '900' }],
		['hauteur infinie', { type: 'jadwal:height:1', height: Number.POSITIVE_INFINITY }],
		['hauteur absente de sens', { type: 'jadwal:height:1', height: Number.NaN }],
		['message vide', null],
		['message en texte', 'jadwal:height:1'],
		['message en tableau', ['jadwal:height:1', 900]]
	])('ignores a message of our own origin with an unexpected shape: %s', (_nom, data) => {
		const element = poser(`org="madretsch" base="${ORIGINE}"`);
		const cadre = cadreDe(element) as HTMLIFrameElement;
		const fenetre = brancher(cadre);
		annoncer({ source: fenetre, data });
		expect(cadre.style.height).toBe('320px');
	});

	it('bounds the height, below and above', () => {
		const element = poser(`org="madretsch" min-height="500" base="${ORIGINE}"`);
		const cadre = cadreDe(element) as HTMLIFrameElement;
		const fenetre = brancher(cadre);
		annoncer({ source: fenetre, height: 10 });
		expect(cadre.style.height).toBe('500px');
		// Un message forgé qui rendrait la page de la mosquée inutilisable est plafonné.
		annoncer({ source: fenetre, height: 5_000_000 });
		expect(cadre.style.height).toBe('20000px');
	});

	it('does not move for a difference of a pixel or two', () => {
		const element = poser(`org="madretsch" base="${ORIGINE}"`);
		const cadre = cadreDe(element) as HTMLIFrameElement;
		const fenetre = brancher(cadre);
		annoncer({ source: fenetre, height: 900 });
		expect(cadre.style.height).toBe('900px');
		// Sans ce seuil, une page dont une longueur dépend de la hauteur de sa fenêtre boucle.
		annoncer({ source: fenetre, height: 901 });
		expect(cadre.style.height).toBe('900px');
		annoncer({ source: fenetre, height: 912 });
		expect(cadre.style.height).toBe('912px');
	});

	it('stops listening once it leaves the page', () => {
		const element = poser(`org="madretsch" base="${ORIGINE}"`);
		const cadre = cadreDe(element) as HTMLIFrameElement;
		const fenetre = brancher(cadre);
		element.remove();
		annoncer({ source: fenetre, height: 1200 });
		expect(cadre.style.height).toBe('320px');
	});
});

describe('deux widgets sur la même page', () => {
	it('keeps each one on its own frame', () => {
		document.body.innerHTML =
			`<jadwal-widget id="a" org="madretsch" base="${ORIGINE}"></jadwal-widget>` +
			`<jadwal-widget id="b" org="bienne" lang="ar" min-height="400" base="${ORIGINE}"></jadwal-widget>`;
		const premier = document.querySelector('#a') as HTMLElement;
		const second = document.querySelector('#b') as HTMLElement;
		const cadreA = cadreDe(premier) as HTMLIFrameElement;
		const cadreB = cadreDe(second) as HTMLIFrameElement;
		const fenetreA = brancher(cadreA);
		const fenetreB = brancher(cadreB);
		expect(new URL(cadreA.src).pathname).toBe('/m/madretsch');
		expect(new URL(cadreB.src).pathname).toBe('/m/bienne/ar');

		annoncer({ source: fenetreA, height: 1100 });
		expect(cadreA.style.height).toBe('1100px');
		// Le second n'a rien reçu : chacun ne répond qu'à sa propre fenêtre.
		expect(cadreB.style.height).toBe('400px');

		annoncer({ source: fenetreB, height: 700 });
		expect(cadreA.style.height).toBe('1100px');
		expect(cadreB.style.height).toBe('700px');
	});
});

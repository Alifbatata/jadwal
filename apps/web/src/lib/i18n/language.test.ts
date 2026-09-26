// La langue de l'espace des responsables : d'où elle vient, dans quel ordre, et où revient le choix
// de la langue une fois fait (étape 18, retour D2).
//
// Pur, sans serveur : le hook et la route du choix ne font que lire la requête et appeler ces trois
// fonctions. Le parcours complet, cookie et compte compris, est éprouvé par HTTP dans
// `tests/espace-en-cinq-langues.test.ts`.

import { describe, expect, it } from 'vitest';
import { browserLanguage, LANGUAGE_COOKIE, returnPath, spaceLanguage } from './language.js';

describe('la langue du navigateur', () => {
	it.each([
		['de-CH,de;q=0.9,fr;q=0.8', 'de'],
		['fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5', 'fr'],
		['it-CH', 'it'],
		['en-GB,en;q=0.9', 'en'],
		['ar-MA,ar;q=0.9,fr;q=0.8', 'ar'],
		// La première langue que le service parle, pas la première du navigateur.
		['es-ES,es;q=0.9,it;q=0.6,de;q=0.5', 'it'],
		// Le poids décide, pas l'ordre d'écriture.
		['fr;q=0.4,de;q=0.8', 'de'],
		// La casse ne compte pas.
		['DE-ch', 'de'],
		// Une langue refusée (q=0) n'est jamais choisie.
		['fr;q=0,it;q=0.1', 'it']
	])('reads « %s » as %s', (entete, attendue) => {
		expect(browserLanguage(entete)).toBe(attendue);
	});

	it.each([[''], ['es-ES,pt;q=0.8'], ['*'], ['fr;q=0'], ['fr;q=abc'], [null], [undefined]])(
		'finds nothing it speaks in %j',
		(entete) => {
			expect(browserLanguage(entete)).toBeNull();
		}
	);
});

describe('la langue de l’espace, source par source', () => {
	it('takes the account first, for a signed-in person', () => {
		expect(spaceLanguage({ account: 'ar', cookie: 'it', browser: 'de-CH' })).toBe('ar');
	});

	it('takes the choice kept on this browser before the browser itself', () => {
		expect(spaceLanguage({ account: null, cookie: 'it', browser: 'de-CH' })).toBe('it');
	});

	it('takes the browser on a first visit', () => {
		expect(spaceLanguage({ account: null, cookie: null, browser: 'en-GB,en;q=0.9' })).toBe('en');
	});

	it('falls back on French when nothing else speaks', () => {
		expect(spaceLanguage({ account: null, cookie: null, browser: 'es-ES' })).toBe('fr');
		expect(spaceLanguage({})).toBe('fr');
	});

	it('ignores a cookie that is not one of the five languages', () => {
		expect(spaceLanguage({ cookie: 'es', browser: 'de' })).toBe('de');
		expect(spaceLanguage({ cookie: '<script>', browser: null })).toBe('fr');
	});

	it('lets an address ask for a language, for that page only, before anything else', () => {
		// Le lien des conditions au pied d'une page publique passe la langue de la page (retour D4).
		expect(spaceLanguage({ asked: 'de', account: 'ar', cookie: 'it', browser: 'en' })).toBe('de');
		expect(spaceLanguage({ asked: 'es', account: 'ar' })).toBe('ar');
	});

	it('names its cookie after the service', () => {
		expect(LANGUAGE_COOKIE).toBe('jadwal_language');
	});
});

describe('le retour après le choix de la langue', () => {
	const ORIGINE = 'https://jadwal.example';

	it.each([
		['/connexion', '/connexion'],
		['/cours?vue=semaine', '/cours?vue=semaine'],
		// La langue demandée par l'adresse est retirée : sans cela, le choix fait serait aussitôt
		// défait par elle.
		['/conditions?lang=de', '/conditions'],
		['/cours?lang=de&vue=semaine', '/cours?vue=semaine'],
		// Le nom d'une action de formulaire ne se rejoue pas en GET.
		['/organisations?/choisir', '/organisations']
	])('comes back to %s as %s', (valeur, attendu) => {
		expect(returnPath(valeur, ORIGINE)).toBe(attendu);
	});

	it.each([
		['https://ailleurs.example/piege'],
		['//ailleurs.example/piege'],
		['/\\ailleurs.example/piege'],
		['javascript:alert(1)'],
		[''],
		['cours']
	])('never leaves the service for %s', (valeur) => {
		expect(returnPath(valeur, ORIGINE)).toBe('/');
	});
});

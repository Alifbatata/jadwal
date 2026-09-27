// L'agenda selon l'appareil (étape 18, retour E1) : ce que le serveur lit dans les en-têtes, et les
// deux liens qui ouvrent l'abonnement dans Google Agenda et dans Outlook.
//
// Les agents sont de vrais agents, relevés sur les navigateurs cités : une détection se trompe
// d'abord sur les cas qu'on n'a pas vus, et l'iPad qui se dit Macintosh en est le plus connu.

import { describe, expect, it } from 'vitest';
import { appareilDe, ENTETES_DE_L_APPAREIL, lienGoogleAgenda, lienOutlook } from './abonnement.js';

/** Des en-têtes comme la requête les donne : `get` ne distingue pas les majuscules. */
function entetes(valeurs: Record<string, string>): Headers {
	return new Headers(valeurs);
}

const AGENTS = {
	iphone:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
	ipad: 'Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/604.1',
	// Safari sur iPadOS demande par défaut le site pour ordinateur : il se dit Macintosh, et rien dans
	// la requête ne le distingue d'un Mac.
	ipadOs:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
	macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:143.0) Gecko/20100101 Firefox/143.0',
	chromeIos:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.101 Mobile/15E148 Safari/604.1',
	android:
		'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
	androidFirefox: 'Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0',
	windows:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
	linux: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0'
};

describe('l’appareil, lu dans les en-têtes', () => {
	it.each([
		['iPhone', AGENTS.iphone, 'apple'],
		['iPad', AGENTS.ipad, 'apple'],
		['iPadOS qui se dit Macintosh', AGENTS.ipadOs, 'apple'],
		['Mac', AGENTS.macFirefox, 'apple'],
		['Chrome sur iPhone', AGENTS.chromeIos, 'apple'],
		['Android', AGENTS.android, 'android'],
		['Firefox sur Android', AGENTS.androidFirefox, 'android'],
		['Windows', AGENTS.windows, 'autre'],
		['Linux', AGENTS.linux, 'autre'],
		['un agent vide', '', 'autre']
	] as const)('reads %s in User-Agent', (_nom, agent, attendu) => {
		expect(appareilDe(entetes({ 'user-agent': agent }))).toBe(attendu);
	});

	it('answers « autre » when neither header is there', () => {
		expect(appareilDe(entetes({}))).toBe('autre');
	});

	// Chrome et Edge envoient la plateforme sans qu'on la demande, entre guillemets (RFC 8941). Elle
	// passe avant l'agent, que ces navigateurs réduisent : sur Android, il ne dit plus que « K ».
	it.each([
		['"Android"', 'android'],
		['"iOS"', 'apple'],
		['"macOS"', 'apple'],
		['"Windows"', 'autre'],
		['"Linux"', 'autre'],
		['"Chrome OS"', 'autre']
	] as const)('reads the platform %s in Sec-CH-UA-Platform first', (plateforme, attendu) => {
		expect(
			appareilDe(entetes({ 'sec-ch-ua-platform': plateforme, 'user-agent': AGENTS.windows }))
		).toBe(attendu);
	});

	it('falls back on User-Agent when the platform is unknown or empty', () => {
		for (const plateforme of ['"Unknown"', '""', '']) {
			expect(
				appareilDe(entetes({ 'sec-ch-ua-platform': plateforme, 'user-agent': AGENTS.iphone })),
				plateforme
			).toBe('apple');
		}
	});

	it('names the two headers it reads, for the Vary of the response', () => {
		expect([...ENTETES_DE_L_APPAREIL]).toEqual(['Sec-CH-UA-Platform', 'User-Agent']);
	});
});

describe('les liens qui ouvrent l’abonnement', () => {
	const WEBCAL = 'webcal://jadwal.example/m/belvedere/agenda.ics?lang=de';

	it('opens Google Calendar with the webcal address of the feed, encoded', () => {
		expect(lienGoogleAgenda(WEBCAL)).toBe(
			'https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Fjadwal.example%2Fm%2Fbelvedere%2Fagenda.ics%3Flang%3Dde'
		);
		// L'adresse se relit entière : aucun paramètre du flux ne devient un paramètre de Google.
		const lu = new URL(lienGoogleAgenda(WEBCAL));
		expect([...lu.searchParams.keys()]).toEqual(['cid']);
		expect(lu.searchParams.get('cid')).toBe(WEBCAL);
	});

	it('opens Outlook on the web with the address and the name of the calendar', () => {
		const lien = lienOutlook(WEBCAL, 'Association Belvédère & Cie');
		expect(
			lien.startsWith('https://outlook.live.com/calendar/0/addfromweb?url=webcal%3A%2F%2F')
		).toBe(true);
		const lu = new URL(lien);
		expect(lu.searchParams.get('url')).toBe(WEBCAL);
		expect(lu.searchParams.get('name')).toBe('Association Belvédère & Cie');
		// Les espaces s'écrivent %20 : un « + » n'est une espace que dans un formulaire.
		expect(lien).not.toContain('+');
	});

	it('opens the Outlook of work or school accounts at the same path, on outlook.office.com', () => {
		const lien = lienOutlook(WEBCAL, 'Association Belvédère & Cie', 'travail');
		expect(lien).toBe(
			'https://outlook.office.com/calendar/0/addfromweb?url=webcal%3A%2F%2Fjadwal.example%2Fm%2Fbelvedere%2Fagenda.ics%3Flang%3Dde&name=Association%20Belv%C3%A9d%C3%A8re%20%26%20Cie'
		);
		expect(lienOutlook(WEBCAL, 'x', 'personnel')).toBe(lienOutlook(WEBCAL, 'x'));
	});
});

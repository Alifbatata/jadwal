// Le nom d'une passkey enregistrée depuis l'écran du super-admin : le système de l'appareil et le
// jour en Suisse, pareil dans les cinq langues, et jamais deux fois le même (étape 18, reprise de la
// relecture du lot 3). Avant, chacune s'appelait « Cet appareil », dans la langue du moment.

import { describe, expect, it } from 'vitest';
import { passkeyName, systemName } from './passkey-name.js';

/** Des agents réels, tels que chaque navigateur les envoie aujourd'hui. */
const AGENTS = {
	windowsChrome:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
	windowsFirefox:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
	// Chrome réduit l'agent d'un Android au point de n'y plus dire le modèle.
	androidChrome:
		'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
	iphoneSafari:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
	// Safari sur un Mac, et sur un iPad, qui se dit Macintosh depuis iPadOS 13.
	macSafari:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
	linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
	chromebook:
		'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
};

describe('the system a passkey is named after', () => {
	// Le système, l'indice de plateforme de Chrome et Edge (les autres n'en donnent pas), l'agent, et
	// le nombre de points de contact de l'écran.
	it.each([
		['Chrome sur Windows', 'Windows', 'Windows', AGENTS.windowsChrome, 0],
		['Firefox sur Windows', 'Windows', undefined, AGENTS.windowsFirefox, 0],
		['Chrome sur Android', 'Android', 'Android', AGENTS.androidChrome, 5],
		['Safari sur iPhone', 'iPhone', undefined, AGENTS.iphoneSafari, 5],
		['Safari sur iPad, qui se dit Macintosh', 'iPad', undefined, AGENTS.macSafari, 5],
		['Safari sur Mac', 'Mac', undefined, AGENTS.macSafari, 0],
		['Chrome sur Mac', 'Mac', 'macOS', AGENTS.macSafari, 0],
		['Firefox sur Linux', 'Linux', undefined, AGENTS.linuxFirefox, 0],
		['un Chromebook', 'ChromeOS', 'Chrome OS', AGENTS.chromebook, 0]
	])('names %s « %s »', (_, nom, platform, agent, touch) => {
		expect(systemName({ platform, userAgent: agent, maxTouchPoints: touch })).toBe(nom);
	});

	it('says nothing when the browser does not tell its system', () => {
		expect(systemName({ platform: 'Unknown', userAgent: '', maxTouchPoints: 0 })).toBeUndefined();
		expect(systemName({ userAgent: 'curl/8.9.1', maxTouchPoints: 0 })).toBeUndefined();
	});
});

describe('the name of a passkey', () => {
	const now = new Date('2026-09-26T13:42:00Z');

	it('is the system and the day, as JJ.MM.AAAA, the same in every language', () => {
		expect(passkeyName({ system: 'Windows', now, timeZone: 'Europe/Zurich', taken: [] })).toBe(
			'Windows, 26.09.2026'
		);
		expect(passkeyName({ system: undefined, now, timeZone: 'Europe/Zurich', taken: [] })).toBe(
			'26.09.2026'
		);
	});

	it('takes the day of Switzerland, the one the list of passkeys writes', () => {
		// 23:30 à Greenwich le 5 mars : il est déjà 00:30 le 6 en Suisse.
		const minuit = new Date('2026-03-05T23:30:00Z');
		expect(
			passkeyName({ system: 'iPhone', now: minuit, timeZone: 'Europe/Zurich', taken: [] })
		).toBe('iPhone, 06.03.2026');
	});

	it('never gives the name of a passkey already there', () => {
		const taken = ['Cet appareil', null, 'Windows, 26.09.2026'];
		const second = passkeyName({ system: 'Windows', now, timeZone: 'Europe/Zurich', taken });
		expect(second).toBe('Windows, 26.09.2026 (2)');
		const third = passkeyName({
			system: 'Windows',
			now,
			timeZone: 'Europe/Zurich',
			taken: [...taken, second]
		});
		expect(third).toBe('Windows, 26.09.2026 (3)');
		// Un autre système, le même jour : son nom suffit à le distinguer.
		expect(passkeyName({ system: 'iPhone', now, timeZone: 'Europe/Zurich', taken })).toBe(
			'iPhone, 26.09.2026'
		);
	});
});

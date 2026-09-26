// Le nom donné à une passkey enregistrée depuis l'écran du super-admin : le système de l'appareil et
// le jour, « Windows, 26.09.2026 », sans rien demander à la personne (étape 18, reprise de la
// relecture du lot 3).
//
// Jusqu'ici, chaque passkey s'appelait « Cet appareil », dans la langue du moment : en suivant le
// conseil de l'écran (en enregistrer sur plusieurs appareils), la liste en montrait plusieurs du même
// nom, et vue d'un autre appareil l'étiquette était fausse. Un nom de système et une date s'écrivent
// de même dans les cinq langues ; un second enregistrement le même jour, sur le même système, prend
// « (2) » : deux passkeys de la liste ne portent jamais le même nom.
//
// Pur, sans navigateur : la page lui passe ce que le navigateur dit de lui-même. Ce qu'il en dit peut
// se tromper, et le nom aide à reconnaître une passkey sans rien prouver.

import { todayInZone } from '@jadwal/core';
import { numericDate } from '$lib/i18n.js';

/** Ce que le navigateur dit de son système. */
export interface DeviceHints {
	/** `navigator.userAgentData.platform`, que seuls Chrome et Edge donnent. */
	readonly platform?: string | undefined;
	readonly userAgent: string;
	/** `navigator.maxTouchPoints` : un iPad se dit Macintosh, mais un Mac n'a pas d'écran tactile. */
	readonly maxTouchPoints: number;
}

/** L'indice de plateforme de Chrome et Edge, et le nom que la liste en montre. */
const PLATFORMS: Readonly<Record<string, string>> = {
	windows: 'Windows',
	macos: 'Mac',
	android: 'Android',
	'chrome os': 'ChromeOS',
	'chromium os': 'ChromeOS',
	linux: 'Linux'
};

/**
 * Le système de l'appareil, tel qu'on appelle l'appareil lui-même : iPhone, iPad, Mac, Android,
 * Windows, ChromeOS, Linux. L'indice de plateforme d'abord ; sinon l'agent, que Safari et Firefox
 * envoient seul. Android est cherché avant Linux, que tous ses agents disent aussi, et l'iPhone avant
 * le Mac, dont il reprend le nom (« like Mac OS X »).
 */
export function systemName(hints: DeviceHints): string | undefined {
	const platform = PLATFORMS[(hints.platform ?? '').trim().toLowerCase()];
	if (platform) return platform;
	const agent = hints.userAgent;
	if (/android/i.test(agent)) return 'Android';
	if (/iphone|ipod/i.test(agent)) return 'iPhone';
	if (/ipad/i.test(agent)) return 'iPad';
	if (/macintosh|mac os x/i.test(agent)) return hints.maxTouchPoints > 1 ? 'iPad' : 'Mac';
	if (/windows/i.test(agent)) return 'Windows';
	if (/\bcros\b/i.test(agent)) return 'ChromeOS';
	if (/linux/i.test(agent)) return 'Linux';
	return undefined;
}

/**
 * Le nom de la passkey : le système, puis le jour de `timeZone` à l'instant `now`, celui que la liste
 * écrit à côté (le jour de la Suisse, où le service est exploité). Un nom déjà pris par une passkey
 * de la liste prend le premier rang libre, « (2) », « (3) »…
 */
export function passkeyName(input: {
	readonly system: string | undefined;
	readonly now: Date;
	readonly timeZone: string;
	readonly taken: readonly (string | null)[];
}): string {
	const day = numericDate(todayInZone(input.timeZone, input.now));
	const base = input.system === undefined ? day : `${input.system}, ${day}`;
	if (!input.taken.includes(base)) return base;
	let rank = 2;
	while (input.taken.includes(`${base} (${rank})`)) rank += 1;
	return `${base} (${rank})`;
}

// Le direct, vu du serveur web : ses réglages, le jeton du poste « Diffuser », et les deux
// en-têtes que son écran demande (ADR 0055, ADR 0056).
//
// Le relais (`apps/live`) est un programme à part, qui ne connaît ni comptes ni base. Le serveur
// web, qui les connaît, signe pour un membre connecté un jeton court ; le relais le vérifie. Les
// deux partagent un secret, `JADWAL_LIVE_SECRET`, et rien d'autre : pas un fichier. La forme du
// jeton est donc écrite deux fois, ici et dans `apps/live/src/token.ts`, et un jeton témoin,
// identique dans les tests des deux paquets, fait tomber l'un ou l'autre si elles divergent.
//
// **Sans l'adresse du relais, `JADWAL_LIVE_URL`, le direct n'existe pas** : ni écran, ni onglet.
// Une adresse sans secret, ou une valeur fausse, refuse le démarrage du serveur, comme `ORIGIN`
// (ADR 0051) : un direct à moitié réglé montrerait un bouton qui ne mène nulle part.

import { createHmac } from 'node:crypto';

/** Une minute : le jeton se demande au moment d'appuyer, et ne sert qu'à ouvrir la liaison. */
export const TOKEN_LIFETIME_MS = 60_000;

/** Le même plancher que le relais : un secret plus court se devine. */
const MIN_SECRET_LENGTH = 32;

/** Les sept langues du direct (ADR 0052), comme le relais. */
const DEFAULT_LANGUAGES = 'fr,de,it,en,sq,bs,tr';

export interface LiveSettings {
	/** Partagé avec le relais. Ne sort jamais de ce module que pour signer. */
	readonly secret: string;
	/** L'adresse publique du relais : `ws://` ou `wss://`, hôte, port, sans chemin. */
	readonly url: string;
	/** Les langues que l'écran propose : celles que le relais accepte de servir. */
	readonly languages: readonly string[];
}

type Environment = Readonly<Record<string, string | undefined>>;

/**
 * Les réglages du direct, ou `null` quand il est éteint. Lève une erreur qui nomme la variable
 * quand le direct est à moitié réglé ; le secret n'est jamais recopié dans le message.
 */
export function readLiveSettings(env: Environment): LiveSettings | null {
	/** Une ligne vide de `.env` vaut une absence. */
	const read = (name: string): string | undefined => {
		const value = env[name]?.trim();
		return value === undefined || value === '' ? undefined : value;
	};
	// C'est l'adresse qui allume le direct côté web, comme `JADWAL_LIVE_TRANSLATOR` l'allume côté
	// relais. Le secret seul ne dit rien : un `.env` recopié de l'exemple le porte déjà, pour le
	// relais, et le serveur web ne doit pas refuser de démarrer pour autant.
	const address = read('JADWAL_LIVE_URL');
	if (address === undefined) return null;
	const secret = read('JADWAL_LIVE_SECRET');
	if (secret === undefined) {
		throw new Error('JADWAL_LIVE_SECRET is required when JADWAL_LIVE_URL is set');
	}
	if (secret.length < MIN_SECRET_LENGTH) {
		throw new Error(`JADWAL_LIVE_SECRET is too short: ${MIN_SECRET_LENGTH} characters at least`);
	}

	let url: URL;
	try {
		url = new URL(address);
	} catch {
		throw new Error(`JADWAL_LIVE_URL is not a valid URL, got ${JSON.stringify(address)}`);
	}
	if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
		throw new Error(`JADWAL_LIVE_URL must use ws or wss, got ${JSON.stringify(url.protocol)}`);
	}
	if (url.username || url.password) throw new Error('JADWAL_LIVE_URL must not carry credentials');
	if (url.pathname !== '/' || url.search || url.hash) {
		throw new Error(
			`JADWAL_LIVE_URL must be an origin, without path, query or fragment, got ${JSON.stringify(address)}`
		);
	}
	// Un site servi en https ne peut pas ouvrir une liaison en clair : le navigateur la bloque, et
	// le bouton ne ferait rien. Mieux vaut ne pas démarrer.
	if (url.protocol === 'ws:' && env['ORIGIN']?.startsWith('https:')) {
		throw new Error('JADWAL_LIVE_URL must use wss when ORIGIN uses https');
	}

	const languages = (read('JADWAL_LIVE_LANGUAGES') ?? DEFAULT_LANGUAGES)
		.split(',')
		.map((language) => language.trim());
	if (
		languages.some((language) => !/^[a-z]{2,3}$/.test(language)) ||
		new Set(languages).size !== languages.length
	) {
		throw new Error(
			'JADWAL_LIVE_LANGUAGES must be language codes of two or three lowercase letters, separated by commas, without repetition'
		);
	}
	return { secret, url: `${url.protocol}//${url.host}`, languages };
}

let cached: LiveSettings | null | undefined;

/**
 * Les réglages du direct de ce serveur, lus une fois. Le crochet `init` les lit avant que le
 * serveur écoute : une valeur fausse arrête donc le démarrage, pas la première requête.
 */
export function liveSettings(): LiveSettings | null {
	if (cached === undefined) cached = readLiveSettings(process.env);
	return cached;
}

/**
 * Les langues vers lesquelles une organisation peut diffuser : celles qu'elle a choisies
 * (`organization.live_language`) que le relais sert, dans l'ordre du relais (ADR 0056 amendée).
 * Une liste vide veut dire : pas de direct possible tant que l'un ou l'autre ne change pas.
 */
export function broadcastLanguages(
	organisation: readonly string[],
	relay: readonly string[]
): string[] {
	return relay.filter((language) => organisation.includes(language));
}

/**
 * Ce que l'écran des réglages enregistre : les langues cochées que le relais sert, puis celles que
 * l'organisation avait choisies et que le relais ne sert pas. L'écran ne montre que les premières ;
 * les secondes ne doivent pas s'effacer en silence parce qu'un relais en sert moins aujourd'hui.
 */
export function keptLiveLanguages(
	checked: readonly string[],
	stored: readonly string[],
	relay: readonly string[]
): string[] {
	return [
		...relay.filter((language) => checked.includes(language)),
		...stored.filter((language) => !relay.includes(language))
	];
}

/** Deux listes de langues disent-elles le même choix, quel que soit l'ordre ? */
export function sameLanguages(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((language) => b.includes(language));
}

/**
 * Signe le jeton qui autorise une organisation à ouvrir un direct jusqu'à `expiresAt`, vers les
 * langues données ou une partie d'entre elles.
 *
 * Sa forme est celle que le relais vérifie : `contenu.signature`, en base64url ; le contenu est
 * `{o, e, l, p}` (organisation, échéance en millisecondes, langues, usage), et la signature le
 * HMAC-SHA-256 du contenu tel qu'il est écrit.
 */
export function signBroadcastToken(
	secret: string,
	organization: string,
	expiresAt: number,
	languages: readonly string[]
): string {
	const body = Buffer.from(
		JSON.stringify({ o: organization, e: expiresAt, l: languages, p: 'broadcast' })
	).toString('base64url');
	return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

/**
 * Les deux en-têtes que l'écran « Diffuser » demande, et lui seul.
 *
 * - `connect-src` reçoit l'origine du relais en toutes lettres : `'self'` ne vaut pas pour une
 *   liaison WebSocket dans tous les navigateurs, et le relais peut vivre sous un autre nom.
 * - `Permissions-Policy` ouvre le micro à la page elle-même. Partout ailleurs, il reste interdit.
 */
export function liveHeaders(
	contentSecurityPolicy: string,
	relay: string
): { contentSecurityPolicy: string; permissionsPolicy: string } {
	const directives = contentSecurityPolicy
		.split(';')
		.map((directive) => directive.trim())
		.filter((directive) => directive !== '');
	const index = directives.findIndex((directive) => /^connect-src(\s|$)/.test(directive));
	if (index === -1) directives.push(`connect-src 'self' ${relay}`);
	else directives[index] = `${directives[index]} ${relay}`;
	return {
		contentSecurityPolicy: directives.join('; '),
		permissionsPolicy: 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()'
	};
}

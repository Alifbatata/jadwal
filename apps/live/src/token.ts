// Le jeton du poste « Diffuser » : ce qui dit au relais qu'une organisation a le droit d'ouvrir un
// direct, sans que le relais connaisse ni comptes ni base (ADR 0055).
//
// Le serveur web le signe pour un responsable connecté ; le relais le vérifie. Les deux partagent
// un secret, `JADWAL_LIVE_SECRET`, et rien d'autre. Le jeton est court à vivre et ne sert qu'à
// ouvrir : il voyage dans le premier message de la liaison, jamais dans une adresse.
//
// Sa forme : `contenu.signature`, tous deux en base64url. Le contenu est un petit JSON ; la
// signature est le HMAC-SHA-256 du contenu **tel qu'il est écrit**, pas du JSON relu.
//
// Il porte aussi les langues que l'organisation a choisies (ADR 0056 amendée) : le poste ne peut
// ouvrir le direct que vers elles, ou vers une partie d'entre elles. Sans cela, la règle ne serait
// tenue que par l'écran, et une langue de plus se paie.

import { createHmac, timingSafeEqual } from 'node:crypto';

/** La forme d'un identifiant d'organisation, celle que la base impose (`organization_slug_ck`). */
const ORGANIZATION = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_ORGANIZATION_LENGTH = 100;

/** Ce que ce jeton autorise. Un jeton signé pour autre chose, un jour, ne vaudra pas ici. */
const PURPOSE = 'broadcast';

/** Bien au-delà de ce qu'un jeton pèse : on ne décode pas un roman. */
const MAX_TOKEN_LENGTH = 512;

/** Autant que le relais en accepte à l'ouverture (`isOpenMessage`). */
const MAX_LANGUAGES = 50;
const LANGUAGE = /^[a-z]{2,3}$/;

export interface TokenClaims {
	readonly organization: string;
	/** L'échéance, en millisecondes depuis 1970. */
	readonly expiresAt: number;
	/** Les langues que le poste peut demander : au moins une, sans doublon. */
	readonly languages: readonly string[];
}

export type TokenResult =
	| { readonly ok: true; readonly organization: string; readonly languages: readonly string[] }
	| { readonly ok: false; readonly reason: 'malformed' | 'signature' | 'expired' };

export function isOrganization(value: unknown): value is string {
	return (
		typeof value === 'string' && value.length <= MAX_ORGANIZATION_LENGTH && ORGANIZATION.test(value)
	);
}

function isLanguageList(value: unknown): value is string[] {
	return (
		Array.isArray(value) &&
		value.length >= 1 &&
		value.length <= MAX_LANGUAGES &&
		value.every((language) => typeof language === 'string' && LANGUAGE.test(language)) &&
		new Set(value).size === value.length
	);
}

function sign(secret: string, body: string): Buffer {
	return createHmac('sha256', secret).update(body).digest();
}

export function signToken(secret: string, claims: TokenClaims): string {
	if (
		!isOrganization(claims.organization) ||
		!Number.isSafeInteger(claims.expiresAt) ||
		!isLanguageList(claims.languages)
	) {
		throw new Error('jeton : organisation, échéance ou langues invalides');
	}
	const body = Buffer.from(
		JSON.stringify({ o: claims.organization, e: claims.expiresAt, l: claims.languages, p: PURPOSE })
	).toString('base64url');
	return `${body}.${sign(secret, body).toString('base64url')}`;
}

/** Ne lève jamais : ce qu'elle lit vient d'un inconnu. */
export function verifyToken(secret: string, token: string, now: number): TokenResult {
	if (token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: 'malformed' };
	const parts = token.split('.');
	const [body, signature] = parts;
	if (parts.length !== 2 || !body || !signature) return { ok: false, reason: 'malformed' };

	// La signature d'abord, en temps constant : rien du contenu n'est lu avant qu'elle soit juste.
	// Ce sont les deux écritures qui sont comparées, pas les octets décodés : `Buffer.from` ignore
	// les caractères hors de l'alphabet, et deux écritures de la même signature passeraient. On
	// n'accepte que celle que `signToken` produit.
	const expected = Buffer.from(sign(secret, body).toString('base64url'));
	const given = Buffer.from(signature);
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
		return { ok: false, reason: 'signature' };
	}

	let claims: unknown;
	try {
		claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
	} catch {
		return { ok: false, reason: 'malformed' };
	}
	if (typeof claims !== 'object' || claims === null) return { ok: false, reason: 'malformed' };
	const { o, e, l, p } = claims as Record<string, unknown>;
	if (
		p !== PURPOSE ||
		!isOrganization(o) ||
		typeof e !== 'number' ||
		!Number.isSafeInteger(e) ||
		!isLanguageList(l)
	) {
		return { ok: false, reason: 'malformed' };
	}
	if (now >= e) return { ok: false, reason: 'expired' };
	return { ok: true, organization: o, languages: l };
}

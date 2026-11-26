import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from './token.js';

const SECRET = 'secret-de-test-assez-long-pour-etre-accepte';
/** Un instant quelconque, en millisecondes. */
const NOW = Date.UTC(2026, 10, 27, 12, 0, 0);

/** Un jeton que le vrai secret signe, mais dont le contenu est celui qu'on veut. */
function forge(payload: string): string {
	const body = Buffer.from(payload).toString('base64url');
	return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}

describe('le jeton du poste « Diffuser »', () => {
	it("se vérifie avec le secret qui l'a signé, et rend l'organisation", () => {
		const token = signToken(SECRET, { organization: 'centre-demo', expiresAt: NOW + 60_000 });
		expect(verifyToken(SECRET, token, NOW)).toEqual({ ok: true, organization: 'centre-demo' });
	});

	it("est refusé à l'échéance, à la milliseconde", () => {
		const token = signToken(SECRET, { organization: 'centre-demo', expiresAt: NOW + 60_000 });
		expect(verifyToken(SECRET, token, NOW + 59_999).ok).toBe(true);
		expect(verifyToken(SECRET, token, NOW + 60_000)).toEqual({ ok: false, reason: 'expired' });
	});

	it("est refusé sous un autre secret, ou si l'on y change une lettre", () => {
		const token = signToken(SECRET, { organization: 'centre-demo', expiresAt: NOW + 60_000 });
		expect(verifyToken(`${SECRET}x`, token, NOW)).toEqual({ ok: false, reason: 'signature' });

		const [body, signature] = token.split('.') as [string, string];
		const autre = Buffer.from(
			Buffer.from(body, 'base64url').toString().replace('centre-demo', 'centre-autre')
		).toString('base64url');
		expect(verifyToken(SECRET, `${autre}.${signature}`, NOW)).toEqual({
			ok: false,
			reason: 'signature'
		});
		const fin = signature.endsWith('A') ? 'B' : 'A';
		expect(verifyToken(SECRET, `${body}.${signature.slice(0, -1)}${fin}`, NOW)).toEqual({
			ok: false,
			reason: 'signature'
		});
	});

	it('est refusé mal formé, sans jamais lever', () => {
		for (const faux of ['', 'abc', 'a.b.c', '.', 'a.', '.b', '   ', 'é.è', 'x'.repeat(5000)]) {
			expect(verifyToken(SECRET, faux, NOW).ok, `« ${faux.slice(0, 20)} »`).toBe(false);
		}
	});

	it('est refusé bien signé mais au contenu inattendu', () => {
		const exp = NOW + 60_000;
		const faux = [
			'pas du json',
			'null',
			'[]',
			JSON.stringify({ o: 'centre-demo', e: exp }),
			JSON.stringify({ o: 'centre-demo', e: exp, p: 'listen' }),
			JSON.stringify({ o: 'Centre Démo', e: exp, p: 'broadcast' }),
			JSON.stringify({ o: '', e: exp, p: 'broadcast' }),
			JSON.stringify({ o: 'centre-demo', e: String(exp), p: 'broadcast' }),
			JSON.stringify({ o: 'centre-demo', e: 1.5, p: 'broadcast' }),
			JSON.stringify({ o: 'a'.repeat(101), e: exp, p: 'broadcast' })
		];
		for (const contenu of faux) {
			expect(verifyToken(SECRET, forge(contenu), NOW), contenu).toEqual({
				ok: false,
				reason: 'malformed'
			});
		}
	});

	it("refuse de signer pour une organisation qui n'en a pas la forme", () => {
		expect(() => signToken(SECRET, { organization: 'Centre Démo', expiresAt: NOW })).toThrow();
	});
});

// Le serveur web signe avec son propre code (`apps/web/src/lib/server/live.ts`) : les deux
// programmes ne partagent aucun fichier. Ce qui les tient d'accord est ce jeton témoin, écrit à
// l'identique dans `apps/web/src/lib/server/live.test.ts`. Qui change la forme du jeton d'un côté
// fait tomber ce test-ci, ou celui d'en face.
describe('le jeton témoin, commun au serveur web et au relais', () => {
	const WITNESS_SECRET = 'secret-temoin-du-direct-partage-par-les-deux-tests';
	const WITNESS_EXPIRY = 1_795_000_000_000;
	const WITNESS =
		'eyJvIjoibW9zcXVlZS10ZW1vaW4iLCJlIjoxNzk1MDAwMDAwMDAwLCJwIjoiYnJvYWRjYXN0In0.GHmXfhCkFatGWq8h_NJ5SGdUbSkggbc1PxZHWuMk0OY';

	it('est celui que le relais signe', () => {
		expect(
			signToken(WITNESS_SECRET, { organization: 'mosquee-temoin', expiresAt: WITNESS_EXPIRY })
		).toBe(WITNESS);
	});

	it('est accepté par le relais', () => {
		expect(verifyToken(WITNESS_SECRET, WITNESS, WITNESS_EXPIRY - 1)).toEqual({
			ok: true,
			organization: 'mosquee-temoin'
		});
	});
});

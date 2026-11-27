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
		const token = signToken(SECRET, {
			organization: 'centre-demo',
			expiresAt: NOW + 60_000,
			languages: ['fr', 'de']
		});
		expect(verifyToken(SECRET, token, NOW)).toEqual({
			ok: true,
			organization: 'centre-demo',
			languages: ['fr', 'de']
		});
	});

	it("est refusé à l'échéance, à la milliseconde", () => {
		const token = signToken(SECRET, {
			organization: 'centre-demo',
			expiresAt: NOW + 60_000,
			languages: ['fr', 'de']
		});
		expect(verifyToken(SECRET, token, NOW + 59_999).ok).toBe(true);
		expect(verifyToken(SECRET, token, NOW + 60_000)).toEqual({ ok: false, reason: 'expired' });
	});

	it("est refusé sous un autre secret, ou si l'on y change une lettre", () => {
		const token = signToken(SECRET, {
			organization: 'centre-demo',
			expiresAt: NOW + 60_000,
			languages: ['fr', 'de']
		});
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
			// Les langues : présentes, une liste, au moins une, des codes, sans doublon. Un jeton sans
			// elles laisserait le poste ouvrir vers n'importe quelle langue (ADR 0056 amendée).
			JSON.stringify({ o: 'centre-demo', e: exp, p: 'broadcast' }),
			JSON.stringify({ o: 'centre-demo', e: exp, l: [], p: 'broadcast' }),
			JSON.stringify({ o: 'centre-demo', e: exp, l: 'fr', p: 'broadcast' }),
			JSON.stringify({ o: 'centre-demo', e: exp, l: ['FR'], p: 'broadcast' }),
			JSON.stringify({ o: 'centre-demo', e: exp, l: ['fr', 'fr'], p: 'broadcast' }),
			JSON.stringify({ o: 'centre-demo', e: exp, l: [1], p: 'broadcast' }),
			// Cinquante et une langues distinctes, de la bonne forme : « aa » à « by ». Plus que le
			// relais n'en accepte à l'ouverture.
			JSON.stringify({
				o: 'centre-demo',
				e: exp,
				l: Array.from({ length: 51 }, (_, i) =>
					String.fromCharCode(97 + Math.floor(i / 26), 97 + (i % 26))
				),
				p: 'broadcast'
			}),
			JSON.stringify({ o: 'centre-demo', e: exp, l: ['fr'], p: 'listen' }),
			JSON.stringify({ o: 'Centre Démo', e: exp, l: ['fr'], p: 'broadcast' }),
			JSON.stringify({ o: '', e: exp, l: ['fr'], p: 'broadcast' }),
			JSON.stringify({ o: 'centre-demo', e: String(exp), l: ['fr'], p: 'broadcast' }),
			JSON.stringify({ o: 'centre-demo', e: 1.5, l: ['fr'], p: 'broadcast' }),
			JSON.stringify({ o: 'a'.repeat(101), e: exp, l: ['fr'], p: 'broadcast' })
		];
		for (const contenu of faux) {
			expect(verifyToken(SECRET, forge(contenu), NOW), contenu).toEqual({
				ok: false,
				reason: 'malformed'
			});
		}
	});

	it("refuse de signer pour une organisation qui n'en a pas la forme", () => {
		expect(() =>
			signToken(SECRET, { organization: 'Centre Démo', expiresAt: NOW, languages: ['fr'] })
		).toThrow();
	});

	it('refuse de signer sans langue, ou avec une langue qui n’en a pas la forme', () => {
		for (const languages of [[], ['FR'], ['fr', 'fr'], ['français']]) {
			expect(
				() => signToken(SECRET, { organization: 'centre-demo', expiresAt: NOW, languages }),
				JSON.stringify(languages)
			).toThrow();
		}
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
		'eyJvIjoibW9zcXVlZS10ZW1vaW4iLCJlIjoxNzk1MDAwMDAwMDAwLCJsIjpbImZyIiwic3EiLCJ0ciJdLCJwIjoiYnJvYWRjYXN0In0.oDbJFiAabsWyYaiB7lXKyNFme-2gvK3M4_E2H-3TEM0';

	it('est celui que le relais signe', () => {
		expect(
			signToken(WITNESS_SECRET, {
				organization: 'mosquee-temoin',
				expiresAt: WITNESS_EXPIRY,
				languages: ['fr', 'sq', 'tr']
			})
		).toBe(WITNESS);
	});

	it('est accepté par le relais', () => {
		expect(verifyToken(WITNESS_SECRET, WITNESS, WITNESS_EXPIRY - 1)).toEqual({
			ok: true,
			organization: 'mosquee-temoin',
			languages: ['fr', 'sq', 'tr']
		});
	});
});

import { describe, expect, it } from 'vitest';
import {
	liveHeaders,
	readLiveSettings,
	signBroadcastToken,
	TOKEN_LIFETIME_MS,
	type LiveSettings
} from './live.js';

const SECRET = 'secret-de-test-assez-long-pour-etre-accepte';
const ORIGIN = 'https://jadwal.example.org';

function read(env: Record<string, string | undefined>): LiveSettings | null {
	return readLiveSettings({ ORIGIN, ...env });
}

describe('les réglages du direct, côté serveur web', () => {
	it('est éteint sans l’adresse du relais, et une ligne vide vaut une absence', () => {
		expect(read({})).toBeNull();
		expect(read({ JADWAL_LIVE_SECRET: '', JADWAL_LIVE_URL: '  ' })).toBeNull();
		// Le secret et les langues seuls n'allument rien : `.env.example` les remplit pour le relais,
		// et un serveur web lancé avec ce fichier ne doit ni s'allumer ni refuser de démarrer.
		expect(read({ JADWAL_LIVE_SECRET: SECRET, JADWAL_LIVE_LANGUAGES: 'fr,de' })).toBeNull();
		expect(read({ JADWAL_LIVE_SECRET: 'court' })).toBeNull();
	});

	it("rend le secret, l'origine du relais et les sept langues par défaut", () => {
		expect(
			read({ JADWAL_LIVE_SECRET: SECRET, JADWAL_LIVE_URL: 'wss://direct.example.org' })
		).toEqual({
			secret: SECRET,
			url: 'wss://direct.example.org',
			languages: ['fr', 'de', 'it', 'en', 'sq', 'bs', 'tr']
		});
	});

	it('garde le port de l’adresse, et lit la liste des langues', () => {
		const settings = readLiveSettings({
			ORIGIN: 'http://localhost:3000',
			JADWAL_LIVE_SECRET: SECRET,
			JADWAL_LIVE_URL: 'ws://127.0.0.1:3100',
			JADWAL_LIVE_LANGUAGES: 'fr, de'
		});
		expect(settings?.url).toBe('ws://127.0.0.1:3100');
		expect(settings?.languages).toEqual(['fr', 'de']);
	});

	it('refuse une adresse sans secret, en nommant la variable qui manque', () => {
		expect(() => read({ JADWAL_LIVE_URL: 'wss://direct.example.org' })).toThrow(
			/JADWAL_LIVE_SECRET/
		);
	});

	it('refuse un secret trop court, sans le recopier', () => {
		const court = 'trop-court-pour-un-secret';
		let message = '';
		try {
			read({ JADWAL_LIVE_SECRET: court, JADWAL_LIVE_URL: 'wss://direct.example.org' });
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toMatch(/JADWAL_LIVE_SECRET/);
		expect(message).not.toContain(court);
	});

	it("refuse une adresse qui n'est pas celle d'un relais", () => {
		for (const faux of [
			'direct.example.org',
			'https://direct.example.org',
			'wss://direct.example.org/broadcast',
			'wss://direct.example.org/?x=1',
			'wss://compte:secret@direct.example.org',
			'wss://direct.example.org/#la',
			'pas une adresse'
		]) {
			expect(() => read({ JADWAL_LIVE_SECRET: SECRET, JADWAL_LIVE_URL: faux }), faux).toThrow(
				/JADWAL_LIVE_URL/
			);
		}
	});

	it('refuse une liaison en clair sous un site en https : le navigateur la bloquerait', () => {
		expect(() =>
			read({ JADWAL_LIVE_SECRET: SECRET, JADWAL_LIVE_URL: 'ws://direct.example.org' })
		).toThrow(/wss/);
		// En développement, tout est en clair, et c'est permis.
		expect(
			readLiveSettings({
				ORIGIN: 'http://localhost:3000',
				JADWAL_LIVE_SECRET: SECRET,
				JADWAL_LIVE_URL: 'ws://localhost:3100'
			})
		).not.toBeNull();
	});

	it('refuse une liste de langues mal écrite', () => {
		for (const faux of ['fr,,de', 'fr,FR', 'fr,fr', 'français', 'fr;de']) {
			expect(
				() =>
					read({
						JADWAL_LIVE_SECRET: SECRET,
						JADWAL_LIVE_URL: 'wss://direct.example.org',
						JADWAL_LIVE_LANGUAGES: faux
					}),
				faux
			).toThrow(/JADWAL_LIVE_LANGUAGES/);
		}
	});
});

// Le relais vérifie avec son propre code (`apps/live/src/token.ts`) : les deux programmes ne
// partagent aucun fichier. Ce qui les tient d'accord est ce jeton témoin, écrit à l'identique dans
// `apps/live/src/token.test.ts`.
describe('le jeton témoin, commun au serveur web et au relais', () => {
	const WITNESS_SECRET = 'secret-temoin-du-direct-partage-par-les-deux-tests';
	const WITNESS_EXPIRY = 1_795_000_000_000;
	const WITNESS =
		'eyJvIjoibW9zcXVlZS10ZW1vaW4iLCJlIjoxNzk1MDAwMDAwMDAwLCJwIjoiYnJvYWRjYXN0In0.GHmXfhCkFatGWq8h_NJ5SGdUbSkggbc1PxZHWuMk0OY';

	it('est celui que le serveur web signe', () => {
		expect(signBroadcastToken(WITNESS_SECRET, 'mosquee-temoin', WITNESS_EXPIRY)).toBe(WITNESS);
	});

	it('vit une minute', () => {
		expect(TOKEN_LIFETIME_MS).toBe(60_000);
	});
});

describe('les en-têtes de l’écran « Diffuser »', () => {
	/** La politique que SvelteKit pose, telle que `vite.config.ts` la règle, avec son nonce. */
	const POLICY =
		"default-src 'self'; script-src 'self' 'nonce-abc'; style-src 'self' 'unsafe-inline'; " +
		"img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; " +
		"base-uri 'self'; object-src 'none'";

	it("ajoute l'origine du relais à connect-src, et ne touche à rien d'autre", () => {
		const { contentSecurityPolicy } = liveHeaders(POLICY, 'wss://direct.example.org');
		expect(contentSecurityPolicy).toBe(
			POLICY.replace("connect-src 'self'", "connect-src 'self' wss://direct.example.org")
		);
	});

	it('ouvre le micro à la page elle-même, et à personne d’autre', () => {
		const { permissionsPolicy } = liveHeaders(POLICY, 'wss://direct.example.org');
		expect(permissionsPolicy).toBe(
			'camera=(), microphone=(self), geolocation=(), payment=(), usb=()'
		);
	});

	it('pose connect-src quand la politique n’en porte pas', () => {
		const { contentSecurityPolicy } = liveHeaders("default-src 'self'", 'ws://127.0.0.1:3100');
		expect(contentSecurityPolicy).toBe(
			"default-src 'self'; connect-src 'self' ws://127.0.0.1:3100"
		);
	});
});

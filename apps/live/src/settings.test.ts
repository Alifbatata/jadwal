import { describe, expect, it } from 'vitest';
import { readSettings } from './settings.js';

/** Le plus petit environnement qui allume le relais. */
const MINIMAL = {
	JADWAL_LIVE_TRANSLATOR: 'simulated',
	JADWAL_LIVE_SECRET: 'secret-de-test-assez-long-pour-etre-accepte',
	JADWAL_LIVE_ORIGIN: 'http://localhost:3000',
	JADWAL_LIVE_COUNTER_FILE: '/tmp/jadwal-live.json'
};

function errorsOf(env: Record<string, string | undefined>): string {
	const result = readSettings(env);
	if (result.ok) throw new Error('les réglages auraient dû être refusés');
	return result.errors.join('\n');
}

describe('les réglages du relais', () => {
	it('acceptent le plus petit environnement, et posent les valeurs par défaut', () => {
		const result = readSettings(MINIMAL);
		expect(result).toEqual({
			ok: true,
			settings: {
				translator: 'simulated',
				host: '127.0.0.1',
				port: 3100,
				secret: MINIMAL.JADWAL_LIVE_SECRET,
				origin: 'http://localhost:3000',
				languages: ['fr', 'de', 'it', 'en', 'sq', 'bs', 'tr'],
				maxBroadcastMs: 60 * 60_000,
				maxSilenceMs: 30_000,
				monthlyMinutes: 1600,
				counterFile: '/tmp/jadwal-live.json',
				maxListeners: 500
			}
		});
	});

	it('éteints sans traducteur : rien ne démarre, et le message dit pourquoi', () => {
		const sans = { ...MINIMAL, JADWAL_LIVE_TRANSLATOR: undefined };
		expect(errorsOf(sans)).toMatch(/JADWAL_LIVE_TRANSLATOR.*éteint/s);
		// Une ligne vide de `.env` vaut une absence.
		expect(errorsOf({ ...MINIMAL, JADWAL_LIVE_TRANSLATOR: '' })).toMatch(/JADWAL_LIVE_TRANSLATOR/);
	});

	it('refusent un traducteur inconnu', () => {
		expect(errorsOf({ ...MINIMAL, JADWAL_LIVE_TRANSLATOR: 'devin' })).toMatch(
			/JADWAL_LIVE_TRANSLATOR.*devin/s
		);
	});

	it('exigent un secret, et le veulent long', () => {
		expect(errorsOf({ ...MINIMAL, JADWAL_LIVE_SECRET: undefined })).toMatch(/JADWAL_LIVE_SECRET/);
		expect(errorsOf({ ...MINIMAL, JADWAL_LIVE_SECRET: 'trop-court' })).toMatch(
			/JADWAL_LIVE_SECRET.*32/s
		);
	});

	it('ne recopient jamais le secret dans un message de refus', () => {
		const message = errorsOf({ ...MINIMAL, JADWAL_LIVE_SECRET: 'trop-court' });
		expect(message).not.toContain('trop-court');
	});

	it("exigent l'origine du site, sans chemin", () => {
		expect(errorsOf({ ...MINIMAL, JADWAL_LIVE_ORIGIN: undefined })).toMatch(/JADWAL_LIVE_ORIGIN/);
		for (const fausse of ['localhost:3000', 'https://example.org/chemin', 'ftp://example.org']) {
			expect(errorsOf({ ...MINIMAL, JADWAL_LIVE_ORIGIN: fausse })).toMatch(/JADWAL_LIVE_ORIGIN/);
		}
		const result = readSettings({ ...MINIMAL, JADWAL_LIVE_ORIGIN: 'https://example.org' });
		expect(result.ok && result.settings.origin).toBe('https://example.org');
	});

	it('exigent le fichier du compteur', () => {
		expect(errorsOf({ ...MINIMAL, JADWAL_LIVE_COUNTER_FILE: undefined })).toMatch(
			/JADWAL_LIVE_COUNTER_FILE/
		);
	});

	it('lisent une liste de langues, sans tenir compte des espaces', () => {
		const result = readSettings({ ...MINIMAL, JADWAL_LIVE_LANGUAGES: ' fr, de ,tr ' });
		expect(result.ok && result.settings.languages).toEqual(['fr', 'de', 'tr']);
	});

	it('refusent une langue mal écrite, répétée, ou une liste vide', () => {
		for (const fausse of ['fr,FR', 'fr,fr', 'français', ',', 'fr,,de', 'f']) {
			expect(errorsOf({ ...MINIMAL, JADWAL_LIVE_LANGUAGES: fausse })).toMatch(
				/JADWAL_LIVE_LANGUAGES/
			);
		}
	});

	it('refusent un nombre qui n’en est pas un, ou hors de ses bornes', () => {
		const nombres = [
			'JADWAL_LIVE_PORT',
			'JADWAL_LIVE_MAX_MINUTES',
			'JADWAL_LIVE_SILENCE_SECONDS',
			'JADWAL_LIVE_MONTHLY_MINUTES',
			'JADWAL_LIVE_MAX_LISTENERS'
		];
		for (const nom of nombres) {
			for (const faux of ['abc', '-1', '1.5', '1e3', '99999999']) {
				expect(errorsOf({ ...MINIMAL, [nom]: faux }), `${nom}=${faux}`).toContain(nom);
			}
		}
		// Zéro n'a de sens que pour le port : le système en choisit alors un libre.
		const result = readSettings({ ...MINIMAL, JADWAL_LIVE_PORT: '0' });
		expect(result.ok && result.settings.port).toBe(0);
		expect(errorsOf({ ...MINIMAL, JADWAL_LIVE_MAX_MINUTES: '0' })).toContain(
			'JADWAL_LIVE_MAX_MINUTES'
		);
	});

	it('lisent les nombres posés, dans leur unité', () => {
		const result = readSettings({
			...MINIMAL,
			JADWAL_LIVE_HOST: '0.0.0.0',
			JADWAL_LIVE_PORT: '4100',
			JADWAL_LIVE_MAX_MINUTES: '45',
			JADWAL_LIVE_SILENCE_SECONDS: '10',
			JADWAL_LIVE_MONTHLY_MINUTES: '300',
			JADWAL_LIVE_MAX_LISTENERS: '50'
		});
		expect(result.ok && result.settings).toMatchObject({
			host: '0.0.0.0',
			port: 4100,
			maxBroadcastMs: 45 * 60_000,
			maxSilenceMs: 10_000,
			monthlyMinutes: 300,
			maxListeners: 50
		});
	});

	it('disent toutes les fautes à la fois', () => {
		const message = errorsOf({ JADWAL_LIVE_TRANSLATOR: 'simulated', JADWAL_LIVE_PORT: 'abc' });
		for (const nom of [
			'JADWAL_LIVE_SECRET',
			'JADWAL_LIVE_ORIGIN',
			'JADWAL_LIVE_COUNTER_FILE',
			'JADWAL_LIVE_PORT'
		]) {
			expect(message).toContain(nom);
		}
	});
});

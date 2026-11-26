// Lié au temps (CONTRIBUTING.md) : ce test attend plusieurs battements de la sonde des liaisons,
// et un appareil qui répond doit le faire avant le battement suivant. Sous une machine très
// chargée, une réponse en retard le ferait tomber sans que le code ait changé.
//
// La marge, mesurée le 26.11.2026 sur un poste chargé (la suite complète tournait à côté) : cinq
// passes de deux cents sondes, et l'aller-retour le plus long, 1,926 ms. Quinze fois ce maximum
// font 28,9 ms, arrondis à la seconde supérieure : un battement d'une seconde. Le test en laisse
// passer trois.

import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startServer, type RunningServer } from './server.js';
import { simulatedTranslator } from './simulated-translator.js';

let server: RunningServer | undefined;

afterEach(async () => {
	await server?.close();
	server = undefined;
});

describe('la sonde des liaisons', () => {
	it('laisse en place un appareil qui répond', async () => {
		server = await startServer({
			settings: {
				translator: 'simulated',
				host: '127.0.0.1',
				port: 0,
				secret: 'secret-de-test-assez-long-pour-etre-accepte',
				origin: 'https://jadwal.example.org',
				languages: ['fr'],
				maxBroadcastMs: 60 * 60_000,
				maxSilenceMs: 30_000,
				monthlyMinutes: 1600,
				counterFile: 'inutilisé',
				maxListeners: 10
			},
			translator: simulatedTranslator,
			counter: { seconds: () => 0, add: () => undefined },
			clock: { now: () => Date.now() },
			log: () => undefined,
			heartbeatMs: 1000
		});
		const socket = new WebSocket(`ws://127.0.0.1:${server.port}/listen/centre-demo/fr`);
		let pings = 0;
		socket.on('ping', () => pings++);
		await new Promise((resolve) => socket.on('open', resolve));
		await new Promise((resolve) => setTimeout(resolve, 3500));
		expect(pings).toBeGreaterThanOrEqual(3);
		expect(socket.readyState).toBe(WebSocket.OPEN);
		socket.close();
	});
});

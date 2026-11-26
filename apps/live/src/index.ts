// Le relais du direct, lancé : `node dist/index.js`.
//
// Il lit ses réglages dans l'environnement, et refuse de démarrer s'il en manque un. Sans
// `JADWAL_LIVE_TRANSLATOR`, le direct est éteint : le programme le dit et s'arrête, rien n'écoute.
//
// Son journal va sur la sortie standard, une ligne JSON par événement : le démarrage, l'arrêt, le
// début et la fin de chaque direct. Ni son, ni texte, ni adresse de qui que ce soit (ADR 0055).

import { openCounter, type Counter } from './counter.js';
import { startServer, type RunningServer } from './server.js';
import { readSettings, type Settings } from './settings.js';
import { simulatedTranslator } from './simulated-translator.js';
import type { Translator } from './translator.js';

const TRANSLATORS: Record<Settings['translator'], Translator> = {
	simulated: simulatedTranslator
};

function log(entry: object): void {
	process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`);
}

async function main(): Promise<void> {
	const read = readSettings(process.env);
	if (!read.ok) {
		for (const error of read.errors) console.error(error);
		process.exitCode = 1;
		return;
	}
	const { settings } = read;

	let counter: Counter;
	try {
		counter = openCounter(settings.counterFile, Date.now());
	} catch (error) {
		console.error(error instanceof Error ? error.message : 'Le compteur du direct ne s’ouvre pas.');
		process.exitCode = 1;
		return;
	}

	let server: RunningServer;
	try {
		server = await startServer({
			settings,
			translator: TRANSLATORS[settings.translator],
			counter,
			clock: { now: () => Date.now() },
			log
		});
	} catch (error) {
		// Un port déjà pris, une adresse que la machine n'a pas : une ligne, pas une pile d'appels.
		const cause = error instanceof Error ? error.message : String(error);
		console.error(
			`Le relais du direct n'écoute pas (${settings.host}:${settings.port}) : ${cause}`
		);
		process.exitCode = 1;
		return;
	}
	log({
		event: 'listening',
		host: settings.host,
		port: server.port,
		translator: settings.translator
	});

	let stopping = false;
	for (const signal of ['SIGTERM', 'SIGINT'] as const) {
		process.on(signal, () => {
			if (stopping) return;
			stopping = true;
			void server.close().then(() => {
				log({ event: 'stopped' });
				process.exitCode = 0;
			});
		});
	}
}

await main();

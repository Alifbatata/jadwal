import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { AUDIO_FORMAT, BYTES_PER_SECOND } from './audio.js';
import type { Counter } from './counter.js';
import type { LogEntry } from './relay.js';
import { sendAudioIfKeepingUp, startServer, type RunningServer } from './server.js';
import type { Settings } from './settings.js';
import { simulatedTranslator } from './simulated-translator.js';
import { signToken } from './token.js';

const SECRET = 'secret-de-test-assez-long-pour-etre-accepte';
const ORIGIN = 'https://jadwal.example.org';

const SETTINGS: Settings = {
	translator: 'simulated',
	host: '127.0.0.1',
	// Zéro : le système choisit un port libre, et deux suites ne se gênent pas.
	port: 0,
	secret: SECRET,
	origin: ORIGIN,
	languages: ['fr', 'de', 'tr'],
	maxBroadcastMs: 60 * 60_000,
	maxSilenceMs: 30_000,
	monthlyMinutes: 1600,
	counterFile: 'inutilisé : le compteur de ces tests est en mémoire',
	maxListeners: 500
};

function memoryCounter(): Counter & { total: number } {
	return {
		total: 0,
		seconds() {
			return this.total;
		},
		add(_now, seconds) {
			this.total += seconds;
		}
	};
}

type Received = Record<string, unknown> | Buffer;

/** Une liaison de test : ce qu'elle reçoit se lit dans l'ordre, sans attendre à l'aveugle. */
function connect(server: RunningServer, path: string, options: WebSocket.ClientOptions = {}) {
	const socket = new WebSocket(`ws://127.0.0.1:${server.port}${path}`, options);
	const queue: Received[] = [];
	const waiting: ((value: Received) => void)[] = [];
	socket.on('message', (data, isBinary) => {
		const value: Received = isBinary
			? (data as Buffer)
			: (JSON.parse(data.toString()) as Record<string, unknown>);
		const next = waiting.shift();
		if (next) next(value);
		else queue.push(value);
	});
	/** Le refus de la poignée de main, s'il y en a un : le code HTTP. */
	const refused = new Promise<number>((resolve) => {
		socket.on('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0));
	});
	socket.on('error', () => undefined);
	const closed = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)));
	const open = new Promise<void>((resolve) => socket.on('open', () => resolve()));
	return {
		socket,
		open,
		closed,
		refused,
		next: () =>
			new Promise<Received>((resolve) => {
				const value = queue.shift();
				if (value !== undefined) resolve(value);
				else waiting.push(resolve);
			}),
		json: (message: unknown) => socket.send(JSON.stringify(message))
	};
}

/** Par défaut, le jeton permet toutes les langues du relais de ces tests. */
function token(
	organization = 'centre-demo',
	expiresAt = Date.now() + 60_000,
	languages: readonly string[] = SETTINGS.languages
): string {
	return signToken(SECRET, { organization, expiresAt, languages });
}

let server: RunningServer | undefined;
const log: LogEntry[] = [];

async function start(
	settings: Partial<Settings> = {},
	timings: { openTimeoutMs?: number; heartbeatMs?: number; tickMs?: number } = {}
): Promise<RunningServer> {
	log.length = 0;
	server = await startServer({
		settings: { ...SETTINGS, ...settings },
		translator: simulatedTranslator,
		counter: memoryCounter(),
		clock: { now: () => Date.now() },
		log: (entry) => void log.push(entry),
		...timings
	});
	return server;
}

afterEach(async () => {
	await server?.close();
	server = undefined;
});

/** Ouvre un poste « Diffuser » et attend que le relais le dise ouvert. */
async function broadcasting(running: RunningServer, languages = ['fr', 'de']) {
	const poste = connect(running, '/broadcast');
	await poste.open;
	poste.json({ type: 'open', token: token(), languages });
	expect(await poste.next()).toEqual({
		type: 'opened',
		languages,
		maxSeconds: 3600,
		format: AUDIO_FORMAT
	});
	return poste;
}

describe('les demandes ordinaires', () => {
	it('répond à la sonde, et à rien d’autre', async () => {
		const running = await start();
		const sonde = await fetch(`http://127.0.0.1:${running.port}/healthz`);
		expect(sonde.status).toBe(200);
		expect(await sonde.json()).toEqual({ status: 'ok' });
		for (const chemin of ['/', '/broadcast', '/listen/centre-demo/fr', '/healthz/x']) {
			expect((await fetch(`http://127.0.0.1:${running.port}${chemin}`)).status, chemin).toBe(404);
		}
		const ecriture = await fetch(`http://127.0.0.1:${running.port}/healthz`, { method: 'POST' });
		expect(ecriture.status).toBe(404);
	});
});

describe('de bout en bout', () => {
	it('le son du poste arrive, traduit, à ceux qui écoutent, avec son texte', async () => {
		const running = await start();
		const fidele = connect(running, '/listen/centre-demo/fr');
		expect(await fidele.next()).toEqual({ type: 'state', live: false });

		const poste = await broadcasting(running);
		expect(await fidele.next()).toEqual({
			type: 'state',
			live: true,
			languages: ['fr', 'de'],
			format: AUDIO_FORMAT
		});

		// Une seconde de son, en cinq morceaux de 200 ms.
		const morceaux = Array.from({ length: 5 }, (_, i) => Buffer.alloc(BYTES_PER_SECOND / 5, i + 1));
		for (const morceau of morceaux) poste.socket.send(morceau);
		for (const morceau of morceaux) expect(await fidele.next()).toEqual(morceau);
		expect(await fidele.next()).toEqual({
			type: 'text',
			text: 'Traduction simulée (fr), seconde 1.',
			final: true
		});

		poste.json({ type: 'close' });
		// Entre l'ouverture et la fermeture, le poste a pu recevoir des états : on les passe.
		let message = await poste.next();
		while (!Buffer.isBuffer(message) && message['type'] === 'status') message = await poste.next();
		expect(message).toEqual({ type: 'closed', reason: 'requested' });
		expect(await poste.closed).toBe(1000);
		expect(await fidele.next()).toEqual({ type: 'state', live: false });
		expect(log.map((entry) => entry.event)).toEqual(['broadcast-started', 'broadcast-ended']);
	});

	it('le poste qui tombe rend la main à ceux qui écoutent', async () => {
		const running = await start();
		const fidele = connect(running, '/listen/centre-demo/de');
		await fidele.next();
		const poste = await broadcasting(running);
		expect(await fidele.next()).toMatchObject({ live: true });
		poste.socket.terminate();
		expect(await fidele.next()).toEqual({ type: 'state', live: false });
		expect(log.at(-1)).toMatchObject({ event: 'broadcast-ended', reason: 'disconnected' });
	});

	it('le direct s’arrête seul quand le poste se tait', async () => {
		const running = await start({ maxSilenceMs: 200 }, { tickMs: 20 });
		const poste = connect(running, '/broadcast');
		await poste.open;
		poste.json({ type: 'open', token: token(), languages: ['fr'] });
		expect(await poste.next()).toMatchObject({ type: 'opened' });
		let message = await poste.next();
		while (!Buffer.isBuffer(message) && message['type'] === 'status') message = await poste.next();
		expect(message).toEqual({ type: 'closed', reason: 'silence' });
		expect(await poste.closed).toBe(1000);
	});
});

describe('le poste « Diffuser » refusé', () => {
	it('sans jeton valable : faux, échu, ou signé par un autre', async () => {
		const running = await start();
		const faux = [
			'nimporte.quoi',
			token('centre-demo', Date.now() - 1),
			signToken(`${SECRET}-autre`, {
				organization: 'centre-demo',
				expiresAt: Date.now() + 60_000,
				languages: ['fr']
			})
		];
		for (const jeton of faux) {
			const poste = connect(running, '/broadcast');
			await poste.open;
			poste.json({ type: 'open', token: jeton, languages: ['fr'] });
			expect(await poste.next()).toEqual({ type: 'refused', reason: 'token' });
			expect(await poste.closed).toBe(1000);
		}
		expect(log).toEqual([]);
	});

	it('dans une langue que le relais ne sert pas', async () => {
		const running = await start();
		const poste = connect(running, '/broadcast');
		await poste.open;
		poste.json({ type: 'open', token: token(), languages: ['fr', 'xx'] });
		expect(await poste.next()).toEqual({ type: 'refused', reason: 'languages' });
		expect(await poste.closed).toBe(1000);
	});

	it('dans une langue que le relais sert, mais que le jeton ne permet pas', async () => {
		// Les langues de l'organisation, que le serveur web a mises dans le jeton (ADR 0056 amendée) :
		// le poste ne peut pas en demander une de plus, même servie par le relais.
		const running = await start();
		const refuse = connect(running, '/broadcast');
		await refuse.open;
		refuse.json({
			type: 'open',
			token: token(undefined, undefined, ['fr']),
			languages: ['fr', 'de']
		});
		expect(await refuse.next()).toEqual({ type: 'refused', reason: 'languages' });
		expect(await refuse.closed).toBe(1000);
		expect(log).toEqual([]);

		// Une partie de celles du jeton suffit : on ne traduit pas forcément vers toutes.
		const accepte = connect(running, '/broadcast');
		await accepte.open;
		accepte.json({
			type: 'open',
			token: token(undefined, undefined, ['fr', 'tr']),
			languages: ['tr']
		});
		expect(await accepte.next()).toMatchObject({ type: 'opened', languages: ['tr'] });
	});

	it('quand son premier message ne vient pas', async () => {
		const running = await start({}, { openTimeoutMs: 50 });
		const poste = connect(running, '/broadcast');
		expect(await poste.closed).toBe(1008);
	});

	it('quand il parle avant de s’annoncer, ou dit autre chose que prévu', async () => {
		const running = await start();
		const envois: ((socket: WebSocket) => void)[] = [
			(socket) => socket.send(Buffer.alloc(4800)),
			(socket) => socket.send('pas du json'),
			(socket) => socket.send(JSON.stringify({ type: 'inconnu' })),
			(socket) => socket.send(JSON.stringify({ type: 'open', token: 12, languages: ['fr'] })),
			(socket) => socket.send(JSON.stringify({ type: 'open', token: token(), languages: 'fr' })),
			(socket) => socket.send(JSON.stringify(null))
		];
		for (const envoyer of envois) {
			const poste = connect(running, '/broadcast');
			await poste.open;
			envoyer(poste.socket);
			expect(await poste.closed).toBe(1008);
		}
	});

	it('quand il s’annonce deux fois', async () => {
		const running = await start();
		const poste = await broadcasting(running);
		poste.json({ type: 'open', token: token(), languages: ['fr'] });
		expect(await poste.closed).toBe(1008);
		expect(log.at(-1)).toMatchObject({ event: 'broadcast-ended', reason: 'disconnected' });
	});

	it('quand un message dépasse la taille admise', async () => {
		const running = await start();
		const poste = await broadcasting(running);
		poste.socket.send(Buffer.alloc(70_000));
		expect(await poste.closed).toBe(1009);
	});
});

describe("l'origine", () => {
	it('refuse la poignée de main d’un navigateur venu d’un autre site', async () => {
		const running = await start();
		for (const chemin of ['/broadcast', '/listen/centre-demo/fr']) {
			const etranger = connect(running, chemin, { origin: 'https://ailleurs.example.net' });
			expect(await etranger.refused, chemin).toBe(403);
		}
	});

	it('accepte l’origine du site, et un client qui n’en dit aucune', async () => {
		const running = await start();
		const navigateur = connect(running, '/listen/centre-demo/fr', { origin: ORIGIN });
		expect(await navigateur.next()).toEqual({ type: 'state', live: false });
		const programme = connect(running, '/listen/centre-demo/fr');
		expect(await programme.next()).toEqual({ type: 'state', live: false });
	});
});

describe('ceux qui écoutent', () => {
	it('sont refusés hors des chemins prévus', async () => {
		const running = await start();
		for (const chemin of [
			'/',
			'/listen',
			'/listen/centre-demo',
			'/listen/Centre%20Demo/fr',
			'/listen/centre-demo/fr/x',
			'/broadcast/x',
			'/healthz'
		]) {
			const liaison = connect(running, chemin);
			expect(await liaison.refused, chemin).toBe(404);
		}
	});

	it('apprennent pourquoi : une langue que le relais ne sert pas, ou plus de place', async () => {
		const running = await start({ maxListeners: 1 });
		const inconnue = connect(running, '/listen/centre-demo/xx');
		expect(await inconnue.next()).toEqual({ type: 'refused', reason: 'language' });
		expect(await inconnue.closed).toBe(1000);

		const premier = connect(running, '/listen/centre-demo/fr');
		expect(await premier.next()).toEqual({ type: 'state', live: false });
		const second = connect(running, '/listen/centre-demo/fr');
		expect(await second.next()).toEqual({ type: 'refused', reason: 'full' });
		expect(await second.closed).toBe(1000);

		// La place rendue se reprend.
		premier.socket.close();
		await premier.closed;
		const troisieme = connect(running, '/listen/centre-demo/fr');
		expect(await troisieme.next()).toEqual({ type: 'state', live: false });
	});

	it('n’ont rien à dire : un message de leur part ferme la liaison', async () => {
		const running = await start();
		const fidele = connect(running, '/listen/centre-demo/fr');
		await fidele.next();
		fidele.socket.send('bonjour');
		expect(await fidele.closed).toBe(1008);
	});

	it('sont décrochés quand leur appareil ne répond plus', async () => {
		const running = await start({}, { heartbeatMs: 40 });
		const muet = connect(running, '/listen/centre-demo/fr', { autoPong: false });
		await muet.next();
		// 1006 : la liaison a été coupée, sans poignée de fermeture.
		expect(await muet.closed).toBe(1006);
		// Qu'un appareil qui répond reste, c'est `server.temps.test.ts` qui le dit : il y faut un délai.
	});
});

describe('un appareil trop lent', () => {
	it('saute du son plutôt que de le recevoir en retard', () => {
		const sent: Buffer[] = [];
		const socket = { bufferedAmount: 0, send: (pcm: Buffer) => void sent.push(pcm) };
		const pcm = Buffer.alloc(4800);
		expect(sendAudioIfKeepingUp(socket, pcm)).toBe(true);
		// Plus de trois secondes de son en attente : ce morceau n'est pas envoyé.
		socket.bufferedAmount = BYTES_PER_SECOND * 3 + 1;
		expect(sendAudioIfKeepingUp(socket, pcm)).toBe(false);
		socket.bufferedAmount = BYTES_PER_SECOND * 3;
		expect(sendAudioIfKeepingUp(socket, pcm)).toBe(true);
		expect(sent).toHaveLength(2);
	});
});

describe("l'arrêt du serveur", () => {
	it('prévient le poste, ferme toutes les liaisons, et rend le port', async () => {
		const running = await start();
		const fidele = connect(running, '/listen/centre-demo/fr');
		await fidele.next();
		const poste = await broadcasting(running);
		await fidele.next();
		const port = running.port;
		await running.close();
		server = undefined;

		let message = await poste.next();
		while (!Buffer.isBuffer(message) && message['type'] === 'status') message = await poste.next();
		expect(message).toEqual({ type: 'closed', reason: 'shutdown' });
		expect(await fidele.next()).toEqual({ type: 'state', live: false });
		await poste.closed;
		await fidele.closed;
		await expect(fetch(`http://127.0.0.1:${port}/healthz`)).rejects.toThrow();
		expect(log.at(-1)).toMatchObject({ event: 'broadcast-ended', reason: 'shutdown' });
	});
});

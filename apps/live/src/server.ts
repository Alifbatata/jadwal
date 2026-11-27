// Le relais, branché sur le réseau : un serveur HTTP qui ne sert qu'une sonde, et deux portes
// WebSocket (ADR 0055).
//
//   /broadcast                    le poste « Diffuser » : un jeton, puis du son
//   /listen/<organisation>/<langue>   ceux qui écoutent : sans compte, sans cookie
//   /healthz                      la sonde
//
// Les ordres sont du texte JSON, le son des trames binaires. Tout ce qui décide — qui a le droit,
// quand un direct s'arrête — est dans `relay.ts` ; ce fichier traduit des liaisons en « ports » et
// rien de plus. Il ne journalise rien : ni adresse, ni ce qui passe.

import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { BYTES_PER_SECOND } from './audio.js';
import type { Counter } from './counter.js';
import {
	Relay,
	type Broadcast,
	type BroadcasterMessage,
	type Clock,
	type ListenerMessage,
	type LogEntry
} from './relay.js';
import type { Settings } from './settings.js';
import { isOrganization, verifyToken } from './token.js';
import type { Translator } from './translator.js';

/**
 * Le plus gros message qu'un poste puisse envoyer : un peu plus d'une seconde de son. Les
 * services de traduction en veulent des morceaux de 200 à 320 ms ; au-delà de cette taille, ce
 * n'est pas un micro.
 */
const MAX_BROADCAST_MESSAGE = 64 * 1024;

/** Ceux qui écoutent n'ont rien à dire : leur premier message ferme la liaison. */
const MAX_LISTENER_MESSAGE = 1024;

/**
 * Au-delà de trois secondes de son en attente pour un appareil, le relais saute des morceaux : un
 * direct en retard ne sert à rien, et la mémoire du relais n'est pas celle d'un téléphone lent.
 */
const MAX_BUFFERED_BYTES = BYTES_PER_SECOND * 3;

/** À l'arrêt, les liaisons ont ce temps pour se fermer d'elles-mêmes avant d'être coupées. */
const CLOSE_GRACE_MS = 3000;

/** Les codes de fermeture de la RFC 6455 dont le relais se sert. */
const NORMAL = 1000;
const GOING_AWAY = 1001;
const POLICY_VIOLATION = 1008;

export interface ServerOptions {
	readonly settings: Settings;
	readonly translator: Translator;
	readonly counter: Counter;
	readonly clock: Clock;
	log(entry: LogEntry): void;
	/** Un poste a ce temps pour s'annoncer après avoir ouvert sa liaison. */
	readonly openTimeoutMs?: number;
	/** Le rythme de la sonde des liaisons : une liaison qui n'y répond pas est coupée. */
	readonly heartbeatMs?: number;
	/** Le rythme auquel le relais regarde ses directs : c'est lui qui les arrête seuls. */
	readonly tickMs?: number;
}

export interface RunningServer {
	/** Le port sur lequel le serveur écoute, celui que le système a choisi si le réglage valait 0. */
	readonly port: number;
	/** Ferme tout : les directs, les liaisons, le port. */
	close(): Promise<void>;
}

/** Envoie du son à un appareil, sauf s'il a déjà trop de retard. Dit si le morceau est parti. */
export function sendAudioIfKeepingUp(
	socket: { readonly bufferedAmount: number; send(data: Buffer): void },
	pcm: Buffer
): boolean {
	if (socket.bufferedAmount > MAX_BUFFERED_BYTES) return false;
	socket.send(pcm);
	return true;
}

type Route =
	| { readonly kind: 'broadcast' }
	| { readonly kind: 'listen'; readonly organization: string; readonly language: string };

function routeOf(url: string | undefined): Route | null {
	let pathname: string;
	try {
		pathname = new URL(url ?? '', 'http://relay.invalid').pathname;
	} catch {
		return null;
	}
	if (pathname === '/broadcast') return { kind: 'broadcast' };
	const [, organization, language] = /^\/listen\/([^/]+)\/([^/]+)$/.exec(pathname) ?? [];
	if (isOrganization(organization) && language !== undefined && /^[a-z]{2,3}$/.test(language)) {
		return { kind: 'listen', organization, language };
	}
	return null;
}

/** Refuse une poignée de main avant qu'elle n'aboutisse : le navigateur n'en saura que l'échec. */
function refuse(socket: Duplex, status: 403 | 404): void {
	const reason = status === 403 ? 'Forbidden' : 'Not Found';
	socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function parse(data: RawData): unknown {
	try {
		return JSON.parse(toBuffer(data).toString('utf8'));
	} catch {
		return undefined;
	}
}

function toBuffer(data: RawData): Buffer {
	if (Buffer.isBuffer(data)) return data;
	return Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
}

interface OpenMessage {
	readonly type: 'open';
	readonly token: string;
	readonly languages: string[];
}

function isOpenMessage(message: unknown): message is OpenMessage {
	if (typeof message !== 'object' || message === null) return false;
	const { type, token, languages } = message as Record<string, unknown>;
	return (
		type === 'open' &&
		typeof token === 'string' &&
		Array.isArray(languages) &&
		languages.length <= 50 &&
		languages.every((language) => typeof language === 'string')
	);
}

function isCloseMessage(message: unknown): boolean {
	return (
		typeof message === 'object' &&
		message !== null &&
		(message as Record<string, unknown>)['type'] === 'close'
	);
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
	const { settings, clock } = options;
	const relay = new Relay({
		settings,
		translator: options.translator,
		counter: options.counter,
		clock,
		log: options.log
	});

	const http = createServer((request, response) => {
		if (request.method === 'GET' && request.url === '/healthz') {
			response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
			response.end(JSON.stringify({ status: 'ok' }));
			return;
		}
		response.writeHead(404, { 'content-length': '0' });
		response.end();
	});

	// La compression par message reste éteinte, comme `ws` le fait par défaut côté serveur : du son
	// brut ne s'y prête pas, et elle coûte de la mémoire par liaison.
	const broadcasters = new WebSocketServer({ noServer: true, maxPayload: MAX_BROADCAST_MESSAGE });
	const listeners = new WebSocketServer({ noServer: true, maxPayload: MAX_LISTENER_MESSAGE });

	/** Toutes les liaisons ouvertes, et si chacune a répondu à la dernière sonde. */
	const sockets = new Map<WebSocket, { alive: boolean }>();

	const track = (socket: WebSocket): void => {
		const state = { alive: true };
		sockets.set(socket, state);
		socket.on('pong', () => (state.alive = true));
		socket.on('close', () => sockets.delete(socket));
		// Sans cet écouteur, une trame fausse ou trop grosse ferait tomber le programme entier :
		// `ws` ferme la liaison lui-même, il n'y a rien d'autre à faire.
		socket.on('error', () => undefined);
	};

	const send = (
		socket: WebSocket,
		message: BroadcasterMessage | ListenerMessage | Refusal
	): void => {
		if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
	};

	const onBroadcaster = (socket: WebSocket): void => {
		track(socket);
		let announced = false;
		let broadcast: Broadcast | null = null;
		const late = setTimeout(() => socket.close(POLICY_VIOLATION), options.openTimeoutMs ?? 5000);
		/** Le poste ne suit pas le protocole : on ferme, et son direct avec. */
		const violation = (): void => {
			socket.close(POLICY_VIOLATION);
			if (broadcast) relay.stop(broadcast, 'disconnected');
		};
		const refuseWith = (reason: Refusal['reason']): void => {
			send(socket, { type: 'refused', reason });
			socket.close(NORMAL);
		};

		socket.on('message', (data, isBinary) => {
			if (isBinary) {
				if (!broadcast) return violation();
				return relay.audio(broadcast, toBuffer(data));
			}
			const message = parse(data);
			if (!announced && isOpenMessage(message)) {
				announced = true;
				clearTimeout(late);
				// Un seul refus pour un jeton faux, échu ou signé par un autre : rien à apprendre à
				// celui qui essaie.
				const verified = verifyToken(settings.secret, message.token, clock.now());
				if (!verified.ok) return refuseWith('token');
				// Les langues de l'organisation, que le serveur web a signées : le poste en demande
				// toutes ou une partie, jamais une autre (ADR 0056 amendée). Le relais vérifie ensuite
				// qu'il les sert lui-même.
				if (!message.languages.every((language) => verified.languages.includes(language))) {
					return refuseWith('languages');
				}
				const opened = relay.open(verified.organization, message.languages, {
					send: (reply) => send(socket, reply),
					close: () => socket.close(NORMAL)
				});
				if (!opened.ok) return refuseWith(opened.reason);
				broadcast = opened.broadcast;
				return;
			}
			if (broadcast && isCloseMessage(message)) return relay.stop(broadcast, 'requested');
			violation();
		});
		socket.on('close', () => {
			clearTimeout(late);
			if (broadcast) relay.stop(broadcast, 'disconnected');
		});
	};

	const onListener = (socket: WebSocket, organization: string, language: string): void => {
		track(socket);
		const place = relay.listen(organization, language, {
			send: (message) => send(socket, message),
			audio: (pcm) => {
				if (socket.readyState === socket.OPEN) sendAudioIfKeepingUp(socket, pcm);
			}
		});
		if (!place.ok) {
			// La liaison est acceptée pour pouvoir dire pourquoi : un navigateur ne lit rien d'une
			// poignée de main refusée.
			send(socket, { type: 'refused', reason: place.reason });
			socket.close(NORMAL);
			return;
		}
		socket.on('message', () => socket.close(POLICY_VIOLATION));
		socket.on('close', place.leave);
	};

	http.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
		socket.on('error', () => undefined);
		const route = routeOf(request.url);
		if (!route) return refuse(socket, 404);
		// Un navigateur dit toujours d'où il vient ; un autre site que le nôtre n'a rien à faire ici.
		// Un programme n'en dit rien, et c'est sans conséquence : il n'y a ni cookie ni session à
		// détourner, et le poste « Diffuser » n'entre qu'avec son jeton.
		const origin = request.headers.origin;
		if (origin !== undefined && origin !== settings.origin) return refuse(socket, 403);
		if (route.kind === 'broadcast') {
			broadcasters.handleUpgrade(request, socket, head, onBroadcaster);
		} else {
			listeners.handleUpgrade(request, socket, head, (accepted) =>
				onListener(accepted, route.organization, route.language)
			);
		}
	});

	// Écouter d'abord, lancer les minuteries ensuite : sur un port déjà pris, rien ne doit rester
	// qui garde le programme en vie. Il ne s'arrêterait jamais, sans rien écouter.
	await new Promise<void>((resolve, reject) => {
		http.once('error', reject);
		http.listen(settings.port, settings.host, () => {
			http.off('error', reject);
			resolve();
		});
	});

	const ticking = setInterval(() => relay.tick(), options.tickMs ?? 1000);
	// La sonde des liaisons, telle que `ws` la recommande : un téléphone qui a perdu le réseau ne
	// ferme rien, et sa place resterait prise.
	const heartbeat = setInterval(() => {
		for (const [socket, state] of sockets) {
			if (!state.alive) {
				socket.terminate();
				continue;
			}
			state.alive = false;
			socket.ping();
		}
	}, options.heartbeatMs ?? 30_000);

	return {
		port: (http.address() as AddressInfo).port,
		async close() {
			clearInterval(ticking);
			clearInterval(heartbeat);
			relay.shutdown();
			for (const socket of sockets.keys()) socket.close(GOING_AWAY);
			const forced = setTimeout(() => {
				for (const socket of sockets.keys()) socket.terminate();
			}, CLOSE_GRACE_MS);
			await new Promise<void>((resolve) => {
				http.close(() => resolve());
				http.closeIdleConnections();
			});
			clearTimeout(forced);
		}
	};
}

/** Ce que le serveur dit à une liaison qu'il n'accepte pas, avant de la fermer. */
interface Refusal {
	readonly type: 'refused';
	readonly reason: 'token' | 'languages' | 'ceiling' | 'shutdown' | 'language' | 'full';
}

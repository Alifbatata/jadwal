// Le cœur du relais : qui diffuse, qui écoute, et quand un direct s'arrête (ADR 0055).
//
// Rien ici ne touche au réseau ni à l'horloge de la machine. Le serveur (`server.ts`) lui passe
// des « ports » — de quoi écrire à un poste ou à une personne qui écoute — et appelle `tick()`
// chaque seconde ; les tests font de même avec une horloge qu'ils avancent. C'est ce qui permet
// d'éprouver une durée maximale d'une heure sans attendre une heure.
//
// Ce que le relais garde en mémoire : les directs en cours et les liaisons de ceux qui écoutent.
// Le son et le texte le traversent sans y rester : il n'a ni tampon ni file. Rien n'est écrit,
// sinon le compteur du mois, et deux lignes de journal par direct.
//
// Le son rendu par le traducteur est codé pour les téléphones (`adpcm.ts`, ADR 0057) : une fois
// par morceau et par langue, et le même paquet part à chacun.

import {
	createAdpcmEncoder,
	LISTENER_FORMAT,
	type AdpcmEncoder,
	type ListenerFormat
} from './adpcm.js';
import { AUDIO_FORMAT, BYTES_PER_SAMPLE, BYTES_PER_SECOND, type AudioFormat } from './audio.js';
import type { Counter } from './counter.js';
import type { Settings } from './settings.js';
import type { TranslationSession, Translator } from './translator.js';

/** Le traducteur a ce temps pour être prêt ; au-delà, l'ouverture est abandonnée. */
const OPEN_TIMEOUT_MS = 15_000;

/** Le compteur du mois s'écrit à ce rythme pendant un direct, et une dernière fois à la fin. */
const COUNT_STEP_MS = 10_000;

/**
 * Un poste peut envoyer son son un peu en avance sur l'horloge : il rattrape une coupure. Au-delà
 * de cette avance, ce n'est plus un micro, et chaque octet de trop serait facturé.
 */
const RATE_MARGIN_MS = 5000;

export type StopReason =
	/** Le poste a demandé la fin. */
	| 'requested'
	/** La durée maximale est atteinte. */
	| 'duration'
	/** Le poste n'envoie plus de son. */
	| 'silence'
	/** Le plafond du mois est atteint. */
	| 'ceiling'
	/** Le poste envoie plus de son que le temps écoulé n'en permet. */
	| 'rate'
	/** Ce que le poste envoie n'est pas du son au format attendu. */
	| 'format'
	/** Un autre poste s'est annoncé pour la même organisation. */
	| 'replaced'
	/** La liaison du poste est tombée. */
	| 'disconnected'
	/** Le traducteur n'a pas répondu, ou a lâché. */
	| 'translator'
	/** Le compteur ne s'écrit plus : pas de direct sans compte. */
	| 'error'
	/** Le programme s'arrête. */
	| 'shutdown';

export type BroadcasterMessage =
	| {
			readonly type: 'opened';
			readonly languages: readonly string[];
			readonly maxSeconds: number;
			readonly format: AudioFormat;
	  }
	| {
			readonly type: 'status';
			readonly seconds: number;
			readonly listeners: Readonly<Record<string, number>>;
	  }
	| { readonly type: 'closed'; readonly reason: StopReason };

export type ListenerMessage =
	| { readonly type: 'state'; readonly live: false }
	| {
			readonly type: 'state';
			readonly live: true;
			readonly languages: readonly string[];
			readonly format: ListenerFormat;
	  }
	| { readonly type: 'text'; readonly text: string; readonly final: boolean };

/** De quoi écrire au poste « Diffuser ». */
export interface BroadcasterPort {
	send(message: BroadcasterMessage): void;
	close(): void;
}

/** De quoi écrire à une personne qui écoute. */
export interface ListenerPort {
	send(message: ListenerMessage): void;
	/** Un paquet de son codé (`adpcm.ts`), le même pour tous ceux qui écoutent cette langue. */
	audio(packet: Buffer): void;
}

/**
 * Tout ce que le relais journalise. Ni son, ni texte, ni adresse, ni message d'erreur d'un
 * service : seulement de quoi savoir qu'un direct a eu lieu, et pourquoi il s'est arrêté.
 */
export type LogEntry =
	| {
			readonly event: 'broadcast-started';
			readonly organization: string;
			readonly languages: readonly string[];
			readonly translator: string;
	  }
	| {
			readonly event: 'broadcast-ended';
			readonly organization: string;
			readonly languages: readonly string[];
			readonly seconds: number;
			readonly reason: StopReason;
			readonly peakListeners: number;
	  };

export interface Clock {
	/** L'instant, en millisecondes depuis 1970. */
	now(): number;
}

/** Un direct, vu de l'extérieur : de quoi le désigner, rien de plus. */
export interface Broadcast {
	readonly organization: string;
}

interface LiveBroadcast extends Broadcast {
	readonly languages: readonly string[];
	readonly port: BroadcasterPort;
	state: 'opening' | 'open' | 'closed';
	session: TranslationSession | null;
	readonly requestedAt: number;
	openedAt: number;
	lastAudioAt: number;
	countedUntil: number;
	bytes: number;
	peakListeners: number;
	/** Un codeur par langue, créé au premier morceau qu'une personne écoute. */
	readonly encoders: Map<string, AdpcmEncoder>;
}

export type OpenResult =
	| { readonly ok: true; readonly broadcast: Broadcast }
	| { readonly ok: false; readonly reason: 'languages' | 'ceiling' | 'shutdown' };

export type ListenResult =
	| { readonly ok: true; leave(): void }
	| { readonly ok: false; readonly reason: 'language' | 'full' };

export interface RelayOptions {
	readonly settings: Pick<
		Settings,
		'languages' | 'maxBroadcastMs' | 'maxSilenceMs' | 'monthlyMinutes' | 'maxListeners'
	>;
	readonly translator: Translator;
	readonly counter: Counter;
	readonly clock: Clock;
	log(entry: LogEntry): void;
}

export class Relay {
	readonly #options: RelayOptions;
	/** Un direct au plus par organisation. */
	readonly #broadcasts = new Map<string, LiveBroadcast>();
	/** Ceux qui écoutent : par organisation, puis par langue. */
	readonly #listeners = new Map<string, Map<string, Set<ListenerPort>>>();
	#listenerCount = 0;
	#stopped = false;

	constructor(options: RelayOptions) {
		this.#options = options;
	}

	counts(): { broadcasts: number; listeners: number } {
		return { broadcasts: this.#broadcasts.size, listeners: this.#listenerCount };
	}

	/**
	 * Ouvre un direct pour une organisation. La réponse dit seulement si la demande est recevable :
	 * le poste apprend la suite par son port, `opened` quand le traducteur est prêt, `closed` sinon.
	 */
	open(organization: string, requested: readonly string[], port: BroadcasterPort): OpenResult {
		const { settings, clock, counter } = this.#options;
		if (this.#stopped) return { ok: false, reason: 'shutdown' };
		const languages = [...new Set(requested)];
		if (
			languages.length === 0 ||
			languages.some((language) => !settings.languages.includes(language))
		) {
			return { ok: false, reason: 'languages' };
		}
		const now = clock.now();
		if (counter.seconds(now) >= settings.monthlyMinutes * 60)
			return { ok: false, reason: 'ceiling' };

		// Un poste qui s'annonce remplace celui qui diffusait : c'est le même responsable, revenu
		// après une coupure, pendant que son ancienne liaison n'est pas encore déclarée morte.
		const previous = this.#broadcasts.get(organization);
		if (previous) this.#end(previous, 'replaced');

		const broadcast: LiveBroadcast = {
			organization,
			languages,
			port,
			state: 'opening',
			session: null,
			requestedAt: now,
			openedAt: now,
			lastAudioAt: now,
			countedUntil: now,
			bytes: 0,
			peakListeners: 0,
			encoders: new Map()
		};
		this.#broadcasts.set(organization, broadcast);

		this.#options.translator
			.open(languages, {
				audio: (language, pcm) => {
					if (broadcast.state !== 'open') return;
					const listeners = this.#listenersOf(organization, language);
					// Personne n'écoute cette langue : rien à coder. Le paquet suivant porte son propre
					// état, et se décode sans celui-ci.
					if (listeners.size === 0) return;
					let encoder = broadcast.encoders.get(language);
					if (!encoder) broadcast.encoders.set(language, (encoder = createAdpcmEncoder()));
					const packet = encoder.encode(pcm);
					for (const listener of listeners) listener.audio(packet);
				},
				text: (language, text, final) => {
					if (broadcast.state !== 'open') return;
					const message: ListenerMessage = { type: 'text', text, final };
					for (const listener of this.#listenersOf(organization, language)) listener.send(message);
				},
				// Le message du service n'est ni journalisé ni transmis : il peut citer ce qu'il a entendu.
				error: () => this.#end(broadcast, 'translator')
			})
			.then(
				(session) => {
					// Arrêté pendant que le traducteur s'ouvrait : sa session ne sert plus à rien.
					if (broadcast.state !== 'opening') return session.close();
					this.#opened(broadcast, session);
				},
				() => this.#end(broadcast, 'translator')
			);
		return { ok: true, broadcast };
	}

	#opened(broadcast: LiveBroadcast, session: TranslationSession): void {
		const { settings, clock, translator, log } = this.#options;
		const now = clock.now();
		broadcast.state = 'open';
		broadcast.session = session;
		broadcast.openedAt = now;
		broadcast.lastAudioAt = now;
		broadcast.countedUntil = now;
		broadcast.peakListeners = this.#countOf(broadcast.organization);
		log({
			event: 'broadcast-started',
			organization: broadcast.organization,
			languages: broadcast.languages,
			translator: translator.name
		});
		broadcast.port.send({
			type: 'opened',
			languages: broadcast.languages,
			maxSeconds: Math.round(settings.maxBroadcastMs / 1000),
			format: AUDIO_FORMAT
		});
		this.#tell(broadcast.organization, {
			type: 'state',
			live: true,
			languages: broadcast.languages,
			format: LISTENER_FORMAT
		});
	}

	/** Du son du poste. Ignoré tant que le direct n'est pas ouvert, et après sa fin. */
	audio(handle: Broadcast, pcm: Buffer): void {
		const broadcast = handle as LiveBroadcast;
		if (broadcast.state !== 'open' || pcm.length === 0) return;
		if (pcm.length % BYTES_PER_SAMPLE !== 0) return this.#end(broadcast, 'format');
		const now = this.#options.clock.now();
		const allowed = ((now - broadcast.openedAt + RATE_MARGIN_MS) / 1000) * BYTES_PER_SECOND;
		if (broadcast.bytes + pcm.length > allowed) return this.#end(broadcast, 'rate');
		broadcast.bytes += pcm.length;
		broadcast.lastAudioAt = now;
		broadcast.session?.send(pcm);
	}

	/** Arrête un direct. Sans effet sur un direct déjà arrêté. */
	stop(handle: Broadcast, reason: StopReason): void {
		this.#end(handle as LiveBroadcast, reason);
	}

	/**
	 * Une personne se met à l'écoute d'une organisation, dans une langue. Elle peut arriver avant
	 * le direct : elle l'apprendra sur la même liaison. Elle ne reçoit rien de ce qui a déjà été dit.
	 */
	listen(organization: string, language: string, port: ListenerPort): ListenResult {
		const { settings } = this.#options;
		if (!settings.languages.includes(language)) return { ok: false, reason: 'language' };
		if (this.#listenerCount >= settings.maxListeners) return { ok: false, reason: 'full' };

		let byLanguage = this.#listeners.get(organization);
		if (!byLanguage) this.#listeners.set(organization, (byLanguage = new Map()));
		let ports = byLanguage.get(language);
		if (!ports) byLanguage.set(language, (ports = new Set()));
		ports.add(port);
		this.#listenerCount++;

		const broadcast = this.#broadcasts.get(organization);
		if (broadcast?.state === 'open') {
			broadcast.peakListeners = Math.max(broadcast.peakListeners, this.#countOf(organization));
			port.send({
				type: 'state',
				live: true,
				languages: broadcast.languages,
				format: LISTENER_FORMAT
			});
		} else {
			port.send({ type: 'state', live: false });
		}

		let left = false;
		return {
			ok: true,
			leave: () => {
				if (left) return;
				left = true;
				ports.delete(port);
				this.#listenerCount--;
				// Rien ne reste d'une organisation que plus personne n'écoute.
				if (ports.size === 0) byLanguage.delete(language);
				if (byLanguage.size === 0) this.#listeners.delete(organization);
			}
		};
	}

	/** À appeler chaque seconde : c'est ici que les directs s'arrêtent seuls. */
	tick(): void {
		const { settings, clock, counter } = this.#options;
		const now = clock.now();
		for (const broadcast of [...this.#broadcasts.values()]) {
			if (broadcast.state === 'opening') {
				if (now - broadcast.requestedAt >= OPEN_TIMEOUT_MS) this.#end(broadcast, 'translator');
				continue;
			}
			if (now - broadcast.countedUntil >= COUNT_STEP_MS && !this.#count(broadcast, now)) {
				this.#end(broadcast, 'error');
			} else if (counter.seconds(now) >= settings.monthlyMinutes * 60) {
				this.#end(broadcast, 'ceiling');
			} else if (now - broadcast.openedAt >= settings.maxBroadcastMs) {
				this.#end(broadcast, 'duration');
			} else if (now - broadcast.lastAudioAt >= settings.maxSilenceMs) {
				this.#end(broadcast, 'silence');
			} else {
				const listeners: Record<string, number> = {};
				for (const language of broadcast.languages) {
					listeners[language] = this.#listenersOf(broadcast.organization, language).size;
				}
				broadcast.port.send({
					type: 'status',
					seconds: Math.round((now - broadcast.openedAt) / 1000),
					listeners
				});
			}
		}
	}

	/** Le programme s'arrête : tous les directs se ferment, et plus aucun ne s'ouvre. */
	shutdown(): void {
		this.#stopped = true;
		for (const broadcast of [...this.#broadcasts.values()]) this.#end(broadcast, 'shutdown');
	}

	/** Porte au compteur du mois le temps écoulé depuis le dernier compte. Faux : il ne s'écrit plus. */
	#count(broadcast: LiveBroadcast, now: number): boolean {
		// En secondes entières : le serveur bat chaque seconde, et le compteur ne prend pas de virgule.
		const seconds = Math.round(
			((now - broadcast.countedUntil) / 1000) * broadcast.languages.length
		);
		broadcast.countedUntil = now;
		try {
			this.#options.counter.add(now, seconds);
			return true;
		} catch {
			return false;
		}
	}

	#end(broadcast: LiveBroadcast, reason: StopReason): void {
		if (broadcast.state === 'closed') return;
		const now = this.#options.clock.now();
		const wasOpen = broadcast.state === 'open';
		broadcast.state = 'closed';
		// Un direct remplacé a déjà cédé sa place : ne retirer que soi.
		if (this.#broadcasts.get(broadcast.organization) === broadcast) {
			this.#broadcasts.delete(broadcast.organization);
		}
		broadcast.session?.close();
		broadcast.session = null;
		// Ce qui reste à compter l'est ici ; si le compteur ne s'écrit plus, le direct est de toute
		// façon en train de finir.
		if (wasOpen) this.#count(broadcast, now);
		this.#options.log({
			event: 'broadcast-ended',
			organization: broadcast.organization,
			languages: broadcast.languages,
			seconds: wasOpen ? Math.round((now - broadcast.openedAt) / 1000) : 0,
			reason,
			peakListeners: broadcast.peakListeners
		});
		broadcast.port.send({ type: 'closed', reason });
		broadcast.port.close();
		if (wasOpen) this.#tell(broadcast.organization, { type: 'state', live: false });
	}

	#listenersOf(organization: string, language: string): ReadonlySet<ListenerPort> {
		return this.#listeners.get(organization)?.get(language) ?? NOBODY;
	}

	#countOf(organization: string): number {
		let count = 0;
		for (const ports of this.#listeners.get(organization)?.values() ?? []) count += ports.size;
		return count;
	}

	/** Dit quelque chose à tous ceux qui écoutent une organisation, quelle que soit leur langue. */
	#tell(organization: string, message: ListenerMessage): void {
		for (const ports of this.#listeners.get(organization)?.values() ?? []) {
			for (const port of ports) port.send(message);
		}
	}
}

const NOBODY: ReadonlySet<ListenerPort> = new Set();

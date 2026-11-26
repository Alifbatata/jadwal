// Le poste « Diffuser », sans son écran ni son micro : ce qu'il dit au relais, ce qu'il en
// entend, et ce qu'il fait quand la liaison tombe (ADR 0055, ADR 0056).
//
// Rien ici ne touche au navigateur. Le jeton, la liaison et les minuteries sont donnés de
// l'extérieur : la page donne les vrais, les tests en donnent de faux, et le test d'accès branche
// ce même code sur le vrai relais, avec du son fabriqué.
//
// Le protocole est celui que les tests du relais fixent. Le poste envoie
// `{"type":"open","token","languages"}`, puis du son en trames binaires, puis `{"type":"close"}`.
// Il reçoit `opened`, `status` chaque seconde, puis `closed` avec sa raison, ou `refused`.

/** Pourquoi un direct a pris fin, ou n'a pas commencé. */
export type EndCause =
	/** Le relais a fermé le direct : à la demande du poste (`requested`), ou de lui-même. */
	| { readonly kind: 'closed'; readonly reason: string }
	/** Le relais n'a pas voulu l'ouvrir. */
	| { readonly kind: 'refused'; readonly reason: string }
	/** Le serveur web n'a pas signé de jeton : la session a pris fin, ou le droit a été retiré. */
	| { readonly kind: 'denied' }
	/** Rien n'a répondu au départ : ni direct, ni reprise à tenter. */
	| { readonly kind: 'unreachable' }
	/** La liaison est tombée pendant le direct, et les reprises n'ont rien donné. */
	| { readonly kind: 'lost' };

export interface BroadcastState {
	readonly phase: 'idle' | 'starting' | 'live' | 'resuming' | 'ended';
	readonly languages: readonly string[];
	/** La durée du direct, telle que le relais la compte. Elle repart de zéro après une reprise. */
	readonly seconds: number;
	/** La durée passé laquelle le relais arrêtera le direct de lui-même. */
	readonly maxSeconds: number | null;
	/** Les personnes à l'écoute, par langue. */
	readonly listeners: Readonly<Record<string, number>>;
	readonly end: EndCause | null;
}

/** Une liaison vers le relais, réduite à ce dont le poste se sert. */
export interface RelaySocket {
	onopen: (() => void) | null;
	/** Reçoit ce que le relais envoie : du texte pour un poste, jamais de son. */
	onmessage: ((data: unknown) => void) | null;
	onclose: (() => void) | null;
	send(data: string | ArrayBuffer): void;
	close(): void;
}

/** Ce que le serveur web répond à la demande d'un jeton. Une panne de réseau, elle, lève. */
export type TokenAnswer = { readonly ok: true; readonly token: string } | { readonly ok: false };

export interface SessionDependencies {
	requestToken(): Promise<TokenAnswer>;
	connect(): RelaySocket;
	setTimer(callback: () => void, ms: number): unknown;
	clearTimer(timer: unknown): void;
	/** Appelée à chaque changement d'état, avec le nouvel état. */
	onChange(state: BroadcastState): void;
}

/**
 * L'attente avant chaque essai de reprise, après une coupure en plein direct. Cinq essais en
 * vingt-trois secondes : de quoi passer un changement de réseau, sans laisser croire longtemps à
 * un direct qui n'existe plus. Le relais, lui, garde ceux qui écoutent.
 */
export const RESUME_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000, 8000];

/** Le relais a ce temps pour confirmer une fin demandée ; passé ce temps, le poste finit seul. */
export const STOP_GRACE_MS = 3000;

const IDLE: BroadcastState = {
	phase: 'idle',
	languages: [],
	seconds: 0,
	maxSeconds: null,
	listeners: {},
	end: null
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/** Des nombres de personnes par langue, et rien d'autre. */
function isListeners(value: unknown): value is Record<string, number> {
	return isRecord(value) && Object.values(value).every((count) => typeof count === 'number');
}

export class BroadcastSession {
	readonly #deps: SessionDependencies;
	#state: BroadcastState = IDLE;
	#socket: RelaySocket | null = null;
	/** Ce qui a été demandé : les langues voulues, redemandées telles quelles à chaque reprise. */
	#wanted: readonly string[] = [];
	/** Le relais a dit « ouvert » au moins une fois : une coupure vaut alors une reprise. */
	#wasLive = false;
	/** La fin est demandée, et le relais ne l'a pas encore confirmée. */
	#stopping = false;
	/** Le nombre d'essais de reprise déjà faits depuis la dernière ouverture réussie. */
	#attempts = 0;
	#timer: unknown = null;
	/** Change à chaque fin : une demande de jeton partie avant n'ouvre plus rien à son retour. */
	#run = 0;

	constructor(deps: SessionDependencies) {
		this.#deps = deps;
	}

	get state(): BroadcastState {
		return this.#state;
	}

	/** Commence un direct dans ces langues. Sans effet s'il y en a déjà un en route. */
	start(languages: readonly string[]): void {
		if (this.#state.phase !== 'idle' && this.#state.phase !== 'ended') return;
		this.#wanted = [...languages];
		this.#wasLive = false;
		this.#stopping = false;
		this.#attempts = 0;
		this.#set({ ...IDLE, phase: 'starting', languages: this.#wanted });
		void this.#open();
	}

	/** Donne un morceau de son. Dit s'il est parti : hors du direct, il est jeté. */
	audio(pcm: ArrayBuffer): boolean {
		if (this.#state.phase !== 'live' || this.#stopping || !this.#socket) return false;
		this.#socket.send(pcm);
		return true;
	}

	/** Demande la fin du direct. */
	stop(): void {
		const phase = this.#state.phase;
		if (phase === 'idle' || phase === 'ended' || this.#stopping) return;
		if (phase === 'live' && this.#socket) {
			// Le relais confirme par `closed` : c'est lui qui dit à ceux qui écoutent que c'est fini.
			this.#stopping = true;
			this.#socket.send(JSON.stringify({ type: 'close' }));
			this.#arm(() => this.#end({ kind: 'closed', reason: 'requested' }), STOP_GRACE_MS);
			return;
		}
		// Pas encore ouvert, ou en pleine reprise : il n'y a rien à fermer chez le relais.
		this.#end({ kind: 'closed', reason: 'requested' });
	}

	async #open(): Promise<void> {
		const run = this.#run;
		let answer: TokenAnswer;
		try {
			answer = await this.#deps.requestToken();
		} catch {
			if (run === this.#run) this.#dropped();
			return;
		}
		// Arrêté pendant que la demande courait : ce jeton ne sert plus.
		if (run !== this.#run) return;
		if (!answer.ok) return this.#end({ kind: 'denied' });

		const token = answer.token;
		const socket = this.#deps.connect();
		this.#socket = socket;
		// Le jeton voyage dans le premier message, jamais dans l'adresse de la liaison.
		socket.onopen = () =>
			socket.send(JSON.stringify({ type: 'open', token, languages: this.#wanted }));
		socket.onmessage = (data) => {
			if (this.#socket === socket) this.#heard(data);
		};
		socket.onclose = () => {
			if (this.#socket !== socket) return;
			this.#socket = null;
			this.#dropped();
		};
	}

	/** Ce que le relais dit. Tout ce qui n'a pas la forme attendue est ignoré. */
	#heard(data: unknown): void {
		if (typeof data !== 'string') return;
		let message: unknown;
		try {
			message = JSON.parse(data);
		} catch {
			return;
		}
		if (!isRecord(message)) return;
		const { type, reason } = message;
		if (type === 'opened') {
			const { languages, maxSeconds } = message;
			this.#wasLive = true;
			this.#attempts = 0;
			this.#set({
				phase: 'live',
				languages:
					Array.isArray(languages) && languages.every((language) => typeof language === 'string')
						? (languages as string[])
						: this.#wanted,
				seconds: 0,
				maxSeconds: typeof maxSeconds === 'number' ? maxSeconds : null,
				listeners: {},
				end: null
			});
		} else if (type === 'status') {
			const { seconds, listeners } = message;
			if (this.#state.phase !== 'live' || typeof seconds !== 'number' || !isListeners(listeners)) {
				return;
			}
			this.#set({ ...this.#state, seconds, listeners });
		} else if (type === 'closed' && typeof reason === 'string') {
			this.#end({ kind: 'closed', reason });
		} else if (type === 'refused' && typeof reason === 'string') {
			this.#end({ kind: 'refused', reason });
		}
	}

	/** La liaison est tombée, ou n'a rien donné, sans que le relais ait dit pourquoi. */
	#dropped(): void {
		if (this.#stopping) return this.#end({ kind: 'closed', reason: 'requested' });
		// Jamais ouvert : rien à reprendre. On le dit, et la personne réessaie si elle veut.
		if (!this.#wasLive) return this.#end({ kind: 'unreachable' });
		const delay = RESUME_DELAYS_MS[this.#attempts];
		if (delay === undefined) return this.#end({ kind: 'lost' });
		this.#attempts += 1;
		this.#set({ ...this.#state, phase: 'resuming' });
		this.#arm(() => void this.#open(), delay);
	}

	#end(cause: EndCause): void {
		this.#run += 1;
		this.#disarm();
		this.#stopping = false;
		const socket = this.#socket;
		this.#socket = null;
		socket?.close();
		this.#set({ ...this.#state, phase: 'ended', end: cause });
	}

	#arm(callback: () => void, ms: number): void {
		this.#disarm();
		this.#timer = this.#deps.setTimer(() => {
			this.#timer = null;
			callback();
		}, ms);
	}

	#disarm(): void {
		if (this.#timer !== null) this.#deps.clearTimer(this.#timer);
		this.#timer = null;
	}

	#set(state: BroadcastState): void {
		this.#state = state;
		this.#deps.onChange(state);
	}
}

/**
 * Une vraie liaison vers le relais, par le `WebSocket` du navigateur, que Node fournit aussi.
 * Le son part en binaire ; ce qui arrive est du texte.
 */
export function openRelaySocket(url: string): RelaySocket {
	const socket = new WebSocket(url);
	socket.binaryType = 'arraybuffer';
	const relay: RelaySocket = {
		onopen: null,
		onmessage: null,
		onclose: null,
		send: (data) => socket.send(data),
		close: () => socket.close()
	};
	socket.onopen = () => relay.onopen?.();
	socket.onmessage = (event) => relay.onmessage?.(event.data);
	// Une erreur est toujours suivie d'une fermeture : c'est elle qui compte.
	socket.onclose = () => relay.onclose?.();
	return relay;
}

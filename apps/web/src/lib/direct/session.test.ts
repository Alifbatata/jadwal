import { describe, expect, it } from 'vitest';
import {
	BroadcastSession,
	RESUME_DELAYS_MS,
	STOP_GRACE_MS,
	type BroadcastState,
	type RelaySocket,
	type TokenAnswer
} from './session.js';

/** Une liaison de théâtre : le test joue le relais, et lit ce que le poste envoie. */
class FakeSocket implements RelaySocket {
	onopen: (() => void) | null = null;
	onmessage: ((data: unknown) => void) | null = null;
	onclose: (() => void) | null = null;
	readonly sent: (string | ArrayBuffer)[] = [];
	closed = false;

	send(data: string | ArrayBuffer): void {
		this.sent.push(data);
	}
	close(): void {
		this.closed = true;
	}
	/** Ce que le relais dit. */
	says(message: Record<string, unknown>): void {
		this.onmessage?.(JSON.stringify(message));
	}
	/** Les ordres que le poste a envoyés, relus. */
	orders(): Record<string, unknown>[] {
		return this.sent
			.filter((data) => typeof data === 'string')
			.map((data) => JSON.parse(data as string) as Record<string, unknown>);
	}
}

interface Timer {
	readonly callback: () => void;
	readonly ms: number;
	cleared: boolean;
}

/** Tout ce qui entoure le poste, tenu par le test : jetons, liaisons, minuteries. */
function stage(answers: (TokenAnswer | Error)[] = []) {
	const sockets: FakeSocket[] = [];
	const timers: Timer[] = [];
	const states: BroadcastState[] = [];
	let requests = 0;
	const session = new BroadcastSession({
		requestToken: async () => {
			requests += 1;
			const answer = answers.shift() ?? { ok: true, token: `jeton-${requests}` };
			if (answer instanceof Error) throw answer;
			return answer;
		},
		connect: () => {
			const socket = new FakeSocket();
			sockets.push(socket);
			return socket;
		},
		setTimer: (callback, ms) => {
			const timer = { callback, ms, cleared: false };
			timers.push(timer);
			return timer;
		},
		clearTimer: (timer) => {
			(timer as Timer).cleared = true;
		},
		onChange: (state) => states.push(state)
	});
	return {
		session,
		sockets,
		timers,
		states,
		requests: () => requests,
		/** Laisse aboutir les promesses en attente : la demande du jeton. */
		settle: () => new Promise<void>((resolve) => setImmediate(resolve)),
		/** Les minuteries encore armées. */
		pending: () => timers.filter((timer) => !timer.cleared),
		/** La dernière liaison ouverte. */
		last: () => sockets.at(-1) as FakeSocket
	};
}

/** Un poste en direct : jeton reçu, liaison ouverte, relais d'accord. */
async function live(languages = ['fr', 'de']) {
	const scene = stage();
	scene.session.start(languages);
	await scene.settle();
	scene.last().onopen?.();
	scene.last().says({ type: 'opened', languages, maxSeconds: 3600, format: {} });
	return scene;
}

describe('le poste « Diffuser », de l’appui à « en direct »', () => {
	it('demande un jeton, puis ouvre la liaison et s’annonce avec lui', async () => {
		const scene = stage();
		expect(scene.session.state.phase).toBe('idle');
		scene.session.start(['fr', 'tr']);
		expect(scene.session.state.phase).toBe('starting');
		// Pas de liaison avant le jeton : il voyage dans le premier message.
		expect(scene.sockets).toHaveLength(0);
		await scene.settle();
		expect(scene.requests()).toBe(1);
		expect(scene.sockets).toHaveLength(1);
		expect(scene.last().sent).toEqual([]);
		scene.last().onopen?.();
		expect(scene.last().orders()).toEqual([
			{ type: 'open', token: 'jeton-1', languages: ['fr', 'tr'] }
		]);
		expect(scene.session.state.phase).toBe('starting');
	});

	it('est en direct quand le relais le dit, avec ses langues et sa durée maximale', async () => {
		const scene = await live(['fr', 'de']);
		expect(scene.session.state).toEqual({
			phase: 'live',
			languages: ['fr', 'de'],
			seconds: 0,
			maxSeconds: 3600,
			listeners: {},
			end: null
		});
		// Chaque changement est annoncé à l'écran.
		expect(scene.states.map((state) => state.phase)).toEqual(['starting', 'live']);
	});

	it('ignore un second appui pendant qu’il démarre ou diffuse', async () => {
		const scene = await live();
		scene.session.start(['fr']);
		await scene.settle();
		expect(scene.requests()).toBe(1);
		expect(scene.sockets).toHaveLength(1);
	});

	it('suit la durée et les personnes à l’écoute', async () => {
		const scene = await live();
		scene.last().says({ type: 'status', seconds: 12, listeners: { fr: 3, de: 0 } });
		expect(scene.session.state.seconds).toBe(12);
		expect(scene.session.state.listeners).toEqual({ fr: 3, de: 0 });
	});
});

describe('le son', () => {
	it('est jeté tant que le relais n’a pas dit « ouvert »', async () => {
		const scene = stage();
		const pcm = new ArrayBuffer(9600);
		expect(scene.session.audio(pcm)).toBe(false);
		scene.session.start(['fr']);
		await scene.settle();
		scene.last().onopen?.();
		expect(scene.session.audio(pcm)).toBe(false);
		expect(scene.last().sent.filter((data) => typeof data !== 'string')).toEqual([]);
	});

	it('part tel quel une fois en direct', async () => {
		const scene = await live();
		const pcm = new ArrayBuffer(9600);
		expect(scene.session.audio(pcm)).toBe(true);
		expect(scene.last().sent.at(-1)).toBe(pcm);
	});
});

describe('la fin', () => {
	it('demandée : le poste le dit au relais, se tait, et attend sa réponse', async () => {
		const scene = await live();
		scene.session.stop();
		expect(scene.last().orders().at(-1)).toEqual({ type: 'close' });
		expect(scene.session.audio(new ArrayBuffer(9600))).toBe(false);
		expect(scene.session.state.phase).toBe('live');
		scene.last().says({ type: 'closed', reason: 'requested' });
		expect(scene.session.state.phase).toBe('ended');
		expect(scene.session.state.end).toEqual({ kind: 'closed', reason: 'requested' });
		expect(scene.last().closed).toBe(true);
		expect(scene.pending()).toEqual([]);
	});

	it('demandée, sans réponse du relais : le poste finit seul', async () => {
		const scene = await live();
		scene.session.stop();
		const [grace] = scene.pending();
		expect(grace?.ms).toBe(STOP_GRACE_MS);
		grace?.callback();
		expect(scene.session.state.end).toEqual({ kind: 'closed', reason: 'requested' });
		expect(scene.last().closed).toBe(true);
	});

	it('demandée, et la liaison tombe avant la réponse : c’est une fin, pas une coupure', async () => {
		const scene = await live();
		scene.session.stop();
		scene.last().onclose?.();
		expect(scene.session.state.end).toEqual({ kind: 'closed', reason: 'requested' });
		expect(scene.pending()).toEqual([]);
	});

	it.each(['duration', 'silence', 'ceiling', 'replaced', 'translator', 'shutdown'])(
		'décidée par le relais (%s) : le poste ne se rebranche pas',
		async (reason) => {
			const scene = await live();
			scene.last().says({ type: 'closed', reason });
			scene.last().onclose?.();
			await scene.settle();
			expect(scene.session.state.end).toEqual({ kind: 'closed', reason });
			expect(scene.pending()).toEqual([]);
			expect(scene.sockets).toHaveLength(1);
		}
	);

	it('permet de recommencer', async () => {
		const scene = await live();
		scene.last().says({ type: 'closed', reason: 'duration' });
		scene.session.start(['fr']);
		expect(scene.session.state).toMatchObject({ phase: 'starting', end: null, seconds: 0 });
		await scene.settle();
		expect(scene.sockets).toHaveLength(2);
	});
});

describe('les refus', () => {
	it.each(['token', 'languages', 'ceiling', 'shutdown'])('du relais (%s)', async (reason) => {
		const scene = stage();
		scene.session.start(['fr']);
		await scene.settle();
		scene.last().onopen?.();
		scene.last().says({ type: 'refused', reason });
		scene.last().onclose?.();
		expect(scene.session.state.phase).toBe('ended');
		expect(scene.session.state.end).toEqual({ kind: 'refused', reason });
		expect(scene.pending()).toEqual([]);
	});

	it('du serveur web, qui ne signe pas : aucune liaison n’est ouverte', async () => {
		const scene = stage([{ ok: false }]);
		scene.session.start(['fr']);
		await scene.settle();
		expect(scene.session.state.end).toEqual({ kind: 'denied' });
		expect(scene.sockets).toHaveLength(0);
	});

	it('un serveur web injoignable au départ', async () => {
		const scene = stage([new Error('réseau')]);
		scene.session.start(['fr']);
		await scene.settle();
		expect(scene.session.state.end).toEqual({ kind: 'unreachable' });
		expect(scene.pending()).toEqual([]);
	});

	it('un relais injoignable au départ : pas de nouvel essai, on le dit', async () => {
		const scene = stage();
		scene.session.start(['fr']);
		await scene.settle();
		scene.last().onclose?.();
		expect(scene.session.state.end).toEqual({ kind: 'unreachable' });
		expect(scene.pending()).toEqual([]);
	});
});

describe('une coupure pendant le direct', () => {
	it('le poste se rebranche seul, avec un jeton neuf et les mêmes langues', async () => {
		const scene = await live(['fr', 'de']);
		scene.last().says({ type: 'status', seconds: 40, listeners: { fr: 2, de: 1 } });
		scene.last().onclose?.();
		expect(scene.session.state.phase).toBe('resuming');
		expect(scene.session.audio(new ArrayBuffer(9600))).toBe(false);
		const [retry] = scene.pending();
		expect(retry?.ms).toBe(RESUME_DELAYS_MS[0]);
		retry?.callback();
		await scene.settle();
		expect(scene.requests()).toBe(2);
		expect(scene.sockets).toHaveLength(2);
		scene.last().onopen?.();
		expect(scene.last().orders()).toEqual([
			{ type: 'open', token: 'jeton-2', languages: ['fr', 'de'] }
		]);
		scene.last().says({ type: 'opened', languages: ['fr', 'de'], maxSeconds: 3600, format: {} });
		expect(scene.session.state.phase).toBe('live');
		expect(scene.session.audio(new ArrayBuffer(9600))).toBe(true);
	});

	it('essaie cinq fois, de plus en plus tard, puis dit la liaison perdue', async () => {
		expect(RESUME_DELAYS_MS).toEqual([1000, 2000, 4000, 8000, 8000]);
		const scene = await live();
		scene.last().onclose?.();
		const delays: number[] = [];
		for (let attempt = 0; attempt < RESUME_DELAYS_MS.length; attempt += 1) {
			expect(scene.session.state.phase).toBe('resuming');
			const [retry] = scene.pending();
			delays.push(retry?.ms ?? -1);
			(retry as Timer).cleared = true;
			retry?.callback();
			await scene.settle();
			// Le relais ne répond toujours pas.
			scene.last().onclose?.();
		}
		expect(delays).toEqual(RESUME_DELAYS_MS);
		expect(scene.session.state.phase).toBe('ended');
		expect(scene.session.state.end).toEqual({ kind: 'lost' });
		expect(scene.pending()).toEqual([]);
	});

	it('un serveur web qui ne répond pas pendant la reprise compte pour un essai', async () => {
		// Le jeton d'après le premier ne vient pas : le réseau du poste est encore coupé.
		const failing = stage([{ ok: true, token: 'a' }, new Error('réseau')]);
		failing.session.start(['fr']);
		await failing.settle();
		failing.last().onopen?.();
		failing.last().says({ type: 'opened', languages: ['fr'], maxSeconds: 60, format: {} });
		failing.last().onclose?.();
		const [retry] = failing.pending();
		(retry as Timer).cleared = true;
		retry?.callback();
		await failing.settle();
		expect(failing.session.state.phase).toBe('resuming');
		expect(failing.pending()[0]?.ms).toBe(RESUME_DELAYS_MS[1]);
		expect(failing.sockets).toHaveLength(1);
	});

	it('une reprise réussie remet le compte des essais à zéro', async () => {
		const scene = await live();
		for (let round = 0; round < 3; round += 1) {
			scene.last().onclose?.();
			const [retry] = scene.pending();
			expect(retry?.ms).toBe(RESUME_DELAYS_MS[0]);
			(retry as Timer).cleared = true;
			retry?.callback();
			await scene.settle();
			scene.last().onopen?.();
			scene.last().says({ type: 'opened', languages: ['fr'], maxSeconds: 3600, format: {} });
		}
		expect(scene.session.state.phase).toBe('live');
	});

	it('un serveur web qui ne signe plus arrête la reprise', async () => {
		const scene = stage([{ ok: true, token: 'a' }, { ok: false }]);
		scene.session.start(['fr']);
		await scene.settle();
		scene.last().onopen?.();
		scene.last().says({ type: 'opened', languages: ['fr'], maxSeconds: 60, format: {} });
		scene.last().onclose?.();
		scene.pending()[0]?.callback();
		await scene.settle();
		expect(scene.session.state.end).toEqual({ kind: 'denied' });
	});

	it('« Arrêter » pendant la reprise finit tout, et rien ne repart', async () => {
		const scene = await live();
		scene.last().onclose?.();
		const [retry] = scene.pending();
		// La minuterie a déjà sonné, et la demande du jeton est en route quand on arrête.
		(retry as Timer).cleared = true;
		retry?.callback();
		scene.session.stop();
		expect(scene.session.state.end).toEqual({ kind: 'closed', reason: 'requested' });
		await scene.settle();
		expect(scene.sockets).toHaveLength(1);
		expect(scene.pending()).toEqual([]);
	});

	it('ce qu’une ancienne liaison dit encore n’est plus écouté', async () => {
		const scene = await live();
		const old = scene.last();
		old.onclose?.();
		scene.pending()[0]?.callback();
		await scene.settle();
		old.says({ type: 'closed', reason: 'duration' });
		old.onclose?.();
		expect(scene.session.state.phase).toBe('resuming');
		expect(scene.session.state.end).toBeNull();
	});
});

describe('ce que le relais dit de travers', () => {
	it('est ignoré : ni du binaire, ni du texte illisible ne change l’état', async () => {
		const scene = await live();
		const before = scene.session.state;
		scene.last().onmessage?.(new ArrayBuffer(4));
		scene.last().onmessage?.('pas du json');
		scene.last().onmessage?.('null');
		scene.last().says({ type: 'inconnu' });
		scene.last().says({ type: 'status', seconds: 'douze', listeners: null });
		expect(scene.session.state).toEqual(before);
	});
});

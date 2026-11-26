import { describe, expect, it } from 'vitest';
import { AUDIO_FORMAT, BYTES_PER_SECOND } from './audio.js';
import type { Counter } from './counter.js';
import {
	Relay,
	type BroadcasterMessage,
	type BroadcasterPort,
	type ListenerMessage,
	type ListenerPort,
	type LogEntry
} from './relay.js';
import type { TranslationSession, TranslationSink, Translator } from './translator.js';

const DEPART = Date.UTC(2026, 10, 27, 12, 0, 0);

const SETTINGS = {
	languages: ['fr', 'de', 'tr'],
	maxBroadcastMs: 60 * 60_000,
	maxSilenceMs: 30_000,
	monthlyMinutes: 1600,
	maxListeners: 500
};

interface FakeSession {
	languages: readonly string[];
	sink: TranslationSink;
	sent: Buffer[];
	closed: boolean;
}

/** Un traducteur de test : il note ce qu'il reçoit, et ne rend que ce que le test lui fait rendre. */
function fakeTranslator() {
	const sessions: FakeSession[] = [];
	const state = {
		/** La prochaine ouverture échoue. */
		fail: false,
		/** Les ouvertures attendent `release()`. */
		hold: false,
		release: [] as (() => void)[]
	};
	const translator: Translator = {
		name: 'fake',
		async open(languages, sink): Promise<TranslationSession> {
			if (state.hold) await new Promise<void>((resolve) => state.release.push(resolve));
			if (state.fail) throw new Error('service injoignable');
			const session: FakeSession = { languages, sink, sent: [], closed: false };
			sessions.push(session);
			return {
				send: (pcm) => void session.sent.push(pcm),
				close: () => void (session.closed = true)
			};
		}
	};
	return { translator, sessions, state };
}

function fakeCounter(depart = 0): Counter & { total: number; broken: boolean } {
	return {
		total: depart,
		broken: false,
		seconds() {
			return this.total;
		},
		add(_now, seconds) {
			if (this.broken) throw new Error('disque plein');
			this.total += seconds;
		}
	};
}

function broadcaster(): BroadcasterPort & { messages: BroadcasterMessage[]; closed: boolean } {
	return {
		messages: [],
		closed: false,
		send(message) {
			this.messages.push(message);
		},
		close() {
			this.closed = true;
		}
	};
}

function listener(): ListenerPort & { messages: ListenerMessage[]; pcm: Buffer[] } {
	return {
		messages: [],
		pcm: [],
		send(message) {
			this.messages.push(message);
		},
		audio(pcm) {
			this.pcm.push(pcm);
		}
	};
}

/** Laisse aboutir les promesses en cours : l'ouverture du traducteur est asynchrone. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function setup(overrides: Partial<typeof SETTINGS> = {}, counted = 0) {
	const clock = { time: DEPART, now: () => clock.time };
	const fake = fakeTranslator();
	const counter = fakeCounter(counted);
	const log: LogEntry[] = [];
	const relay = new Relay({
		settings: { ...SETTINGS, ...overrides },
		translator: fake.translator,
		counter,
		clock,
		log: (entry) => void log.push(entry)
	});
	/** Avance l'horloge seconde par seconde, comme le fait le serveur. */
	const advance = (seconds: number, eachSecond?: () => void) => {
		for (let i = 0; i < seconds; i++) {
			clock.time += 1000;
			eachSecond?.();
			relay.tick();
		}
	};
	return { relay, clock, counter, log, advance, ...fake };
}

/** Ouvre un direct et attend que le traducteur soit prêt. */
async function opened(
	t: ReturnType<typeof setup>,
	organization = 'centre-demo',
	languages = ['fr', 'de']
) {
	const port = broadcaster();
	const result = t.relay.open(organization, languages, port);
	if (!result.ok) throw new Error(`ouverture refusée : ${result.reason}`);
	await settle();
	return { port, broadcast: result.broadcast, session: t.sessions.at(-1) as FakeSession };
}

/** Une seconde de son, en morceaux de 200 ms, que le poste envoie à chaque seconde qui passe. */
const SECONDE = Buffer.alloc(BYTES_PER_SECOND, 1);

describe('ouvrir un direct', () => {
	it('ouvre le traducteur dans les langues demandées, et le dit au poste', async () => {
		const t = setup();
		const { port, session } = await opened(t);
		expect(session.languages).toEqual(['fr', 'de']);
		expect(port.messages).toEqual([
			{ type: 'opened', languages: ['fr', 'de'], maxSeconds: 3600, format: AUDIO_FORMAT }
		]);
		expect(t.relay.counts()).toEqual({ broadcasts: 1, listeners: 0 });
	});

	it('ne dit rien au poste tant que le traducteur ne répond pas', async () => {
		const t = setup();
		t.state.hold = true;
		const port = broadcaster();
		expect(t.relay.open('centre-demo', ['fr'], port).ok).toBe(true);
		await settle();
		expect(port.messages).toEqual([]);
		t.state.release.forEach((release) => release());
		await settle();
		expect(port.messages.map((m) => m.type)).toEqual(['opened']);
	});

	it('refuse une liste vide ou une langue que le relais ne sert pas', () => {
		const t = setup();
		for (const languages of [[], ['fr', 'xx'], ['FR'], ['sq']]) {
			expect(t.relay.open('centre-demo', languages, broadcaster())).toEqual({
				ok: false,
				reason: 'languages'
			});
		}
		expect(t.sessions).toEqual([]);
		expect(t.relay.counts().broadcasts).toBe(0);
	});

	it('ne compte une langue répétée qu’une fois', async () => {
		const t = setup();
		const { session } = await opened(t, 'centre-demo', ['fr', 'de', 'fr']);
		expect(session.languages).toEqual(['fr', 'de']);
	});

	it('refuse quand le plafond du mois est déjà atteint, sans ouvrir le traducteur', async () => {
		const t = setup({ monthlyMinutes: 100 }, 100 * 60);
		expect(t.relay.open('centre-demo', ['fr'], broadcaster())).toEqual({
			ok: false,
			reason: 'ceiling'
		});
		await settle();
		expect(t.sessions).toEqual([]);
	});

	it("dit au poste que le traducteur n'a pas répondu, et ne garde rien", async () => {
		const t = setup();
		t.state.fail = true;
		const port = broadcaster();
		expect(t.relay.open('centre-demo', ['fr'], port).ok).toBe(true);
		await settle();
		expect(port.messages).toEqual([{ type: 'closed', reason: 'translator' }]);
		expect(port.closed).toBe(true);
		expect(t.relay.counts().broadcasts).toBe(0);
		expect(t.counter.total).toBe(0);
	});

	it('abandonne un traducteur qui tarde plus de quinze secondes', async () => {
		const t = setup();
		t.state.hold = true;
		const port = broadcaster();
		t.relay.open('centre-demo', ['fr'], port);
		await settle();
		t.advance(14);
		expect(port.messages).toEqual([]);
		t.advance(1);
		expect(port.messages).toEqual([{ type: 'closed', reason: 'translator' }]);
		// Le traducteur finit par répondre : sa session est fermée aussitôt, sans rien compter.
		t.state.release.forEach((release) => release());
		await settle();
		expect(t.sessions.map((s) => s.closed)).toEqual([true]);
		expect(t.counter.total).toBe(0);
	});

	it('ferme la session d’un poste parti pendant l’ouverture', async () => {
		const t = setup();
		t.state.hold = true;
		const port = broadcaster();
		const result = t.relay.open('centre-demo', ['fr'], port);
		if (!result.ok) throw new Error('refusé');
		t.relay.stop(result.broadcast, 'disconnected');
		t.state.release.forEach((release) => release());
		await settle();
		expect(t.sessions.map((s) => s.closed)).toEqual([true]);
		expect(port.messages.map((m) => m.type)).toEqual(['closed']);
		expect(t.relay.counts().broadcasts).toBe(0);
	});
});

describe('le son et le texte', () => {
	it('donne au traducteur le son du poste, tel quel', async () => {
		const t = setup();
		const { broadcast, session } = await opened(t);
		const morceau = Buffer.from([1, 2, 3, 4]);
		t.relay.audio(broadcast, morceau);
		expect(session.sent).toEqual([morceau]);
	});

	it('ne donne le français qu’à ceux qui écoutent le français de cette organisation', async () => {
		const t = setup();
		const fr = listener();
		const de = listener();
		const ailleurs = listener();
		t.relay.listen('centre-demo', 'fr', fr);
		t.relay.listen('centre-demo', 'de', de);
		t.relay.listen('autre-centre', 'fr', ailleurs);
		const { session } = await opened(t);

		const voix = Buffer.from([9, 9]);
		session.sink.audio('fr', voix);
		session.sink.text('fr', 'Bonjour', false);
		session.sink.text('fr', 'Bonjour à tous.', true);
		expect(fr.pcm).toEqual([voix]);
		expect(fr.messages.slice(-2)).toEqual([
			{ type: 'text', text: 'Bonjour', final: false },
			{ type: 'text', text: 'Bonjour à tous.', final: true }
		]);
		expect(de.pcm).toEqual([]);
		expect(de.messages.filter((m) => m.type === 'text')).toEqual([]);
		expect(ailleurs.pcm).toEqual([]);
		expect(ailleurs.messages).toEqual([{ type: 'state', live: false }]);
	});

	it('ignore le son d’un poste qui n’est pas encore ouvert, ou qui est fermé', async () => {
		const t = setup();
		t.state.hold = true;
		const result = t.relay.open('centre-demo', ['fr'], broadcaster());
		if (!result.ok) throw new Error('refusé');
		t.relay.audio(result.broadcast, SECONDE);
		t.state.release.forEach((release) => release());
		await settle();
		expect(t.sessions[0]?.sent).toEqual([]);
		t.relay.stop(result.broadcast, 'requested');
		t.relay.audio(result.broadcast, SECONDE);
		expect(t.sessions[0]?.sent).toEqual([]);
	});

	it('ne distribue plus rien de ce que le traducteur rend après la fin', async () => {
		const t = setup();
		const fr = listener();
		t.relay.listen('centre-demo', 'fr', fr);
		const { broadcast, session } = await opened(t);
		t.relay.stop(broadcast, 'requested');
		session.sink.audio('fr', Buffer.from([1, 2]));
		session.sink.text('fr', 'trop tard', true);
		expect(fr.pcm).toEqual([]);
		expect(fr.messages.filter((m) => m.type === 'text')).toEqual([]);
	});
});

describe('ceux qui écoutent', () => {
	it('attendent, apprennent le début, puis la fin, sur la même liaison', async () => {
		const t = setup();
		const fr = listener();
		expect(t.relay.listen('centre-demo', 'fr', fr).ok).toBe(true);
		expect(fr.messages).toEqual([{ type: 'state', live: false }]);
		const { broadcast } = await opened(t);
		expect(fr.messages.at(-1)).toEqual({
			type: 'state',
			live: true,
			languages: ['fr', 'de'],
			format: AUDIO_FORMAT
		});
		t.relay.stop(broadcast, 'requested');
		expect(fr.messages.at(-1)).toEqual({ type: 'state', live: false });
		expect(t.relay.counts().listeners).toBe(1);
	});

	it('arrivés en cours de route, apprennent le direct et ne reçoivent rien du passé', async () => {
		const t = setup();
		const { session } = await opened(t);
		session.sink.audio('fr', Buffer.from([1, 2]));
		const fr = listener();
		t.relay.listen('centre-demo', 'fr', fr);
		expect(fr.messages).toEqual([
			{ type: 'state', live: true, languages: ['fr', 'de'], format: AUDIO_FORMAT }
		]);
		expect(fr.pcm).toEqual([]);
	});

	it('peuvent attendre une langue que ce direct ne sert pas : la liste le leur dit', async () => {
		const t = setup();
		const tr = listener();
		t.relay.listen('centre-demo', 'tr', tr);
		const { session } = await opened(t);
		session.sink.audio('fr', Buffer.from([1, 2]));
		expect(tr.messages.at(-1)).toMatchObject({ live: true, languages: ['fr', 'de'] });
		expect(tr.pcm).toEqual([]);
	});

	it('sont refusés dans une langue que le relais ne sert pas', () => {
		const t = setup();
		expect(t.relay.listen('centre-demo', 'xx', listener())).toEqual({
			ok: false,
			reason: 'language'
		});
	});

	it('sont refusés au-delà du nombre de places, et une place rendue se reprend', () => {
		const t = setup({ maxListeners: 2 });
		const premier = t.relay.listen('centre-demo', 'fr', listener());
		expect(t.relay.listen('autre-centre', 'de', listener()).ok).toBe(true);
		expect(t.relay.listen('centre-demo', 'fr', listener())).toEqual({ ok: false, reason: 'full' });
		if (!premier.ok) throw new Error('refusé');
		premier.leave();
		premier.leave();
		expect(t.relay.counts().listeners).toBe(1);
		expect(t.relay.listen('centre-demo', 'fr', listener()).ok).toBe(true);
	});

	it('ne reçoivent plus rien une fois partis', async () => {
		const t = setup();
		const fr = listener();
		const place = t.relay.listen('centre-demo', 'fr', fr);
		const { session } = await opened(t);
		if (!place.ok) throw new Error('refusé');
		place.leave();
		session.sink.audio('fr', Buffer.from([1, 2]));
		expect(fr.pcm).toEqual([]);
	});
});

describe('les arrêts seuls', () => {
	it('à la durée maximale', async () => {
		const t = setup({ maxBroadcastMs: 5 * 60_000 });
		const { port, broadcast, session } = await opened(t);
		t.advance(5 * 60 - 1, () => t.relay.audio(broadcast, SECONDE));
		expect(port.closed).toBe(false);
		t.advance(1, () => t.relay.audio(broadcast, SECONDE));
		expect(port.messages.at(-1)).toEqual({ type: 'closed', reason: 'duration' });
		expect(port.closed).toBe(true);
		expect(session.closed).toBe(true);
		expect(t.relay.counts().broadcasts).toBe(0);
	});

	it('quand le poste se tait', async () => {
		const t = setup({ maxSilenceMs: 10_000 });
		const { port, broadcast, session } = await opened(t);
		t.advance(20, () => t.relay.audio(broadcast, SECONDE));
		expect(port.closed).toBe(false);
		t.advance(9);
		expect(port.closed).toBe(false);
		t.advance(1);
		expect(port.messages.at(-1)).toEqual({ type: 'closed', reason: 'silence' });
		expect(session.closed).toBe(true);
	});

	it('quand le poste n’envoie jamais rien', async () => {
		const t = setup({ maxSilenceMs: 10_000 });
		const { port } = await opened(t);
		t.advance(10);
		expect(port.messages.at(-1)).toEqual({ type: 'closed', reason: 'silence' });
	});

	it('quand le plafond du mois est atteint en cours de direct', async () => {
		// Deux langues : dix minutes facturées, c'est cinq minutes de direct.
		const t = setup({ monthlyMinutes: 10 });
		const { port, broadcast } = await opened(t);
		t.advance(4 * 60 + 45, () => t.relay.audio(broadcast, SECONDE));
		expect(port.closed).toBe(false);
		t.advance(15, () => t.relay.audio(broadcast, SECONDE));
		expect(port.messages.at(-1)).toEqual({ type: 'closed', reason: 'ceiling' });
		// Le compte est en secondes entières : dix minutes, pas une de plus.
		expect(t.counter.total).toBe(10 * 60);
	});

	it('quand le poste envoie plus de son que le temps écoulé n’en permet', async () => {
		const t = setup();
		const { port, broadcast, session } = await opened(t);
		// Cinq secondes d'avance sont tolérées : un poste qui rattrape une coupure.
		for (let i = 0; i < 5; i++) t.relay.audio(broadcast, SECONDE);
		expect(port.closed).toBe(false);
		t.relay.audio(broadcast, SECONDE);
		expect(port.messages.at(-1)).toEqual({ type: 'closed', reason: 'rate' });
		expect(session.sent).toHaveLength(5);
	});

	it('quand le son n’a pas la forme attendue', async () => {
		const t = setup();
		const { port, broadcast, session } = await opened(t);
		t.relay.audio(broadcast, Buffer.from([1, 2, 3]));
		expect(port.messages.at(-1)).toEqual({ type: 'closed', reason: 'format' });
		expect(session.sent).toEqual([]);
	});

	it('quand le traducteur lâche en cours de route', async () => {
		const t = setup();
		const { port, session } = await opened(t);
		session.sink.error('liaison perdue');
		expect(port.messages.at(-1)).toEqual({ type: 'closed', reason: 'translator' });
		expect(session.closed).toBe(true);
	});

	it('quand le compteur ne s’écrit plus : pas de direct sans compte', async () => {
		const t = setup();
		const { port, broadcast } = await opened(t);
		t.counter.broken = true;
		t.advance(15, () => t.relay.audio(broadcast, SECONDE));
		expect(port.messages.at(-1)).toEqual({ type: 'closed', reason: 'error' });
		expect(t.relay.counts().broadcasts).toBe(0);
	});

	it('une seule fois : un direct arrêté ne se ferme pas deux fois', async () => {
		const t = setup();
		const { port, broadcast } = await opened(t);
		t.relay.stop(broadcast, 'requested');
		t.relay.stop(broadcast, 'disconnected');
		expect(port.messages.filter((m) => m.type === 'closed')).toEqual([
			{ type: 'closed', reason: 'requested' }
		]);
	});
});

describe('un second poste pour la même organisation', () => {
	it('remplace le premier, sans décrocher ceux qui écoutent', async () => {
		const t = setup();
		const fr = listener();
		t.relay.listen('centre-demo', 'fr', fr);
		const premier = await opened(t);
		const second = await opened(t, 'centre-demo', ['fr']);
		expect(premier.port.messages.at(-1)).toEqual({ type: 'closed', reason: 'replaced' });
		expect(premier.session.closed).toBe(true);
		expect(second.port.messages.map((m) => m.type)).toEqual(['opened']);
		expect(t.relay.counts()).toEqual({ broadcasts: 1, listeners: 1 });
		expect(fr.messages.at(-1)).toEqual({
			type: 'state',
			live: true,
			languages: ['fr'],
			format: AUDIO_FORMAT
		});
		second.session.sink.audio('fr', Buffer.from([7, 7]));
		expect(fr.pcm).toEqual([Buffer.from([7, 7])]);
		// Ce que l'ancienne session rendrait encore ne passe plus.
		premier.session.sink.audio('fr', Buffer.from([1, 1]));
		expect(fr.pcm).toHaveLength(1);
	});

	it('ne touche pas au direct d’une autre organisation', async () => {
		const t = setup();
		const un = await opened(t, 'centre-demo');
		const deux = await opened(t, 'autre-centre');
		expect(t.relay.counts().broadcasts).toBe(2);
		t.relay.stop(un.broadcast, 'requested');
		expect(deux.port.closed).toBe(false);
		expect(deux.session.closed).toBe(false);
	});
});

describe('le compte des minutes', () => {
	it('compte les minutes de direct fois le nombre de langues', async () => {
		const t = setup();
		const { broadcast } = await opened(t, 'centre-demo', ['fr', 'de', 'tr']);
		t.advance(3 * 60, () => t.relay.audio(broadcast, SECONDE));
		expect(t.counter.total).toBe(9 * 60);
	});

	it('compte le reste à la fin, à la seconde près', async () => {
		const t = setup();
		const { broadcast } = await opened(t);
		t.advance(7, () => t.relay.audio(broadcast, SECONDE));
		// Rien encore : le compte s'écrit toutes les dix secondes.
		expect(t.counter.total).toBe(0);
		t.relay.stop(broadcast, 'requested');
		expect(t.counter.total).toBe(7 * 2);
	});

	it('ne compte rien avant que le traducteur soit ouvert', async () => {
		const t = setup();
		t.state.hold = true;
		const result = t.relay.open('centre-demo', ['fr'], broadcaster());
		if (!result.ok) throw new Error('refusé');
		t.advance(12);
		t.relay.stop(result.broadcast, 'requested');
		expect(t.counter.total).toBe(0);
	});
});

describe('ce que le poste apprend en cours de route', () => {
	it('chaque seconde : la durée, et combien écoutent dans chaque langue', async () => {
		const t = setup();
		t.relay.listen('centre-demo', 'fr', listener());
		t.relay.listen('centre-demo', 'fr', listener());
		t.relay.listen('centre-demo', 'tr', listener());
		t.relay.listen('autre-centre', 'de', listener());
		const { port, broadcast } = await opened(t);
		t.advance(3, () => t.relay.audio(broadcast, SECONDE));
		expect(port.messages.at(-1)).toEqual({
			type: 'status',
			seconds: 3,
			listeners: { fr: 2, de: 0 }
		});
	});
});

describe('aucune trace', () => {
	it('le journal dit le début et la fin, et rien de ce qui a été dit', async () => {
		const t = setup();
		t.relay.listen('centre-demo', 'fr', listener());
		t.relay.listen('centre-demo', 'fr', listener());
		const { broadcast, session } = await opened(t);
		t.advance(65, () => {
			t.relay.audio(broadcast, SECONDE);
			session.sink.audio('fr', SECONDE);
			session.sink.text('fr', 'Une phrase du sermon.', true);
		});
		t.relay.stop(broadcast, 'requested');
		expect(t.log).toEqual([
			{
				event: 'broadcast-started',
				organization: 'centre-demo',
				languages: ['fr', 'de'],
				translator: 'fake'
			},
			{
				event: 'broadcast-ended',
				organization: 'centre-demo',
				languages: ['fr', 'de'],
				seconds: 65,
				reason: 'requested',
				peakListeners: 2
			}
		]);
		expect(JSON.stringify(t.log)).not.toContain('sermon');
	});

	it('journalise un refus du traducteur sans recopier sa réponse', async () => {
		const t = setup();
		t.state.fail = true;
		t.relay.open('centre-demo', ['fr'], broadcaster());
		await settle();
		expect(t.log).toEqual([
			{
				event: 'broadcast-ended',
				organization: 'centre-demo',
				languages: ['fr'],
				seconds: 0,
				reason: 'translator',
				peakListeners: 0
			}
		]);
	});

	it('rien ne reste en mémoire après la fin', async () => {
		const t = setup();
		const place = t.relay.listen('centre-demo', 'fr', listener());
		const { broadcast } = await opened(t);
		t.relay.stop(broadcast, 'requested');
		if (place.ok) place.leave();
		expect(t.relay.counts()).toEqual({ broadcasts: 0, listeners: 0 });
	});
});

describe("l'arrêt du programme", () => {
	it('ferme tous les directs, compte ce qui reste, et refuse la suite', async () => {
		const t = setup();
		const un = await opened(t, 'centre-demo');
		const deux = await opened(t, 'autre-centre', ['fr']);
		t.advance(6, () => {
			t.relay.audio(un.broadcast, SECONDE);
			t.relay.audio(deux.broadcast, SECONDE);
		});
		t.relay.shutdown();
		expect(un.port.messages.at(-1)).toEqual({ type: 'closed', reason: 'shutdown' });
		expect(deux.port.messages.at(-1)).toEqual({ type: 'closed', reason: 'shutdown' });
		expect(t.counter.total).toBe(6 * 3);
		expect(t.relay.counts().broadcasts).toBe(0);
		expect(t.relay.open('centre-demo', ['fr'], broadcaster())).toEqual({
			ok: false,
			reason: 'shutdown'
		});
	});
});

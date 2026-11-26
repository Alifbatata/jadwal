// Le poste « Diffuser » (étape 25, ADR 0056), sur de vrais serveurs : le serveur web construit, une
// vraie base, et le **vrai relais** (`apps/live`), lancé comme en production avec le traducteur
// simulé.
//
// Ce que ce fichier prouve et qu'aucun test unitaire ne voit :
//   - sans réglage, l'écran n'existe pas (première instance) ; avec, il existe (seconde instance) ;
//   - qui a le droit de diffuser : un membre, responsable ou éditeur, conditions acceptées ; ni un
//     inconnu, ni le super-admin entré par ses pouvoirs, ni un autre site ;
//   - le micro et la liaison vers le relais ne sont ouverts, dans les en-têtes, que sur cet écran ;
//   - le jeton que le serveur web signe est **accepté par le relais**, et le code du poste
//     (`src/lib/direct/session.ts`) conduit un direct entier : ce qu'il envoie arrive à une
//     personne qui écoute l'organisation de la session, et à elle seule.
//
// Le micro, lui, ne se joue pas ici : le son est fabriqué. La capture se prouve dans un navigateur.

import { spawn, type ChildProcess } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDatabase, newId, sql, withOrg, type DatabaseHandle } from '@jadwal/db';
import {
	BroadcastSession,
	openRelaySocket,
	type BroadcastState,
	type TokenAnswer
} from '../src/lib/direct/session.js';
import { conditionsAcceptees } from './conditions-acceptees.js';
import { productionEnvironment } from './environnement-de-production.js';
import { frenchLeft, visibleText } from './textes-lus.js';

/** La première instance n'a pas de direct ; la seconde en a un. */
const sans = inject('origin');
const avec = inject('secondOrigin');
const outbox = inject('outbox');
const testDatabase = inject('testDatabase');
const liveSecret = inject('liveSecret');
const liveUrl = inject('liveUrl');
const liveLanguages = inject('liveLanguages').split(',');

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const relayEntry = join(appDir, '..', 'live', 'dist', 'index.js');

const SLUG = 'direct-essai';
const ORGANISATION = 'Association du direct';
const RESPONSABLE = 'direct-responsable@example.test';
const EDITEUR = 'direct-editeur@example.test';
/** Membre, mais qui n'a pas accepté les conditions. */
const SANS_ACCORD = 'direct-sans-accord@example.test';
/** L'exploitant, entré dans l'organisation par ses pouvoirs : il n'en est pas membre. */
const EXPLOITANT = 'direct-exploitant@example.test';

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let organizationId: string;
const userIds: Record<string, string> = {};
const cookies: Record<string, string> = {};
let relay: ChildProcess | undefined;
let relayFolder: string | undefined;
const relayLog: string[] = [];

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

async function maintenance<T>(
	callback: (tx: Parameters<Parameters<DatabaseHandle['db']['transaction']>[0]>[0]) => Promise<T>
): Promise<T> {
	return ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		return callback(tx);
	});
}

/**
 * Les lignes du direct dans le journal de l'organisation, lues comme la responsable les lit : le
 * journal ne se montre qu'à elle, pas même au propriétaire des tables (migration 0070).
 */
async function liveJournal(): Promise<{ actor_id: string; action: string }[]> {
	return withOrg(
		appHandle.db,
		{ organizationId, userId: userIds[RESPONSABLE] as string },
		async (tx) =>
			rows<{ actor_id: string; action: string }>(
				await tx.execute(sql`
					select "actor_id", "action" from "audit_log"
					where "action" like 'live.%' order by "created_at", "id"
				`)
			)
	);
}

/** Se connecte par lien magique, comme une vraie personne, et rend le cookie de la session. */
async function signIn(email: string): Promise<string> {
	await fetch(`${sans}/connexion`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			accept: 'text/html',
			origin: sans
		},
		body: new URLSearchParams({ email }).toString()
	});
	const names = (await readdir(outbox)).filter((name) => name.endsWith('.json')).sort();
	const messages = await Promise.all(
		names.map(
			async (name) =>
				JSON.parse(await readFile(join(outbox, name), 'utf8')) as { to: string; text: string }
		)
	);
	const link = messages
		.filter((message) => message.to === email)
		.at(-1)
		?.text.match(/https?:\/\/\S+/)?.[0];
	expect(link, `aucun lien magique reçu pour ${email}`).toBeTruthy();
	const followed = await fetch(link as string, { redirect: 'manual' });
	const set = (followed.headers.getSetCookie?.() ?? []).find((value) =>
		value.startsWith('better-auth.session_token=')
	);
	expect(set, `aucune session posée pour ${email}`).toBeTruthy();
	return (set as string).split(';')[0] as string;
}

function get(origin: string, path: string, cookie?: string): Promise<Response> {
	return fetch(`${origin}${path}`, {
		redirect: 'manual',
		headers: { accept: 'text/html', ...(cookie ? { cookie } : {}) }
	});
}

/**
 * Demande un jeton comme la page le fait : un `POST` sans corps, de la même origine. `from` dit
 * une autre origine, et `json` ajoute un corps JSON, comme un autre site pourrait l'écrire.
 */
function askToken(
	origin: string,
	cookie?: string,
	from: string = origin,
	json = false
): Promise<Response> {
	return fetch(`${origin}/direct/jeton`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			accept: 'application/json',
			origin: from,
			...(cookie ? { cookie } : {}),
			...(json ? { 'content-type': 'application/json' } : {})
		},
		...(json ? { body: '{}' } : {})
	});
}

/** Attend qu'une condition soit vraie, sans dormir à l'aveugle. */
async function until(condition: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error(`Toujours pas : ${what}.\n${relayLog.join('')}`);
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

beforeAll(async () => {
	if (!existsSync(relayEntry)) {
		throw new Error(
			`Relais non construit (${relayEntry} absent). Lancer « pnpm build » avant « pnpm test ».`
		);
	}
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	appHandle = createDatabase({ role: 'app', overrides: { database: testDatabase } });
	organizationId = newId();
	for (const email of [RESPONSABLE, EDITEUR, SANS_ACCORD, EXPLOITANT]) userIds[email] = newId();
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language")
			values (${organizationId}, ${SLUG}, ${ORGANISATION}, 'Europe/Zurich', 'fr', array['fr'])
		`);
		for (const [email, userId] of Object.entries(userIds)) {
			await tx.execute(sql`
				insert into "user" ("id", "email", "name", "email_verified", "is_super_admin")
				values (${userId}, ${email}, 'Personne fictive', true, ${email === EXPLOITANT})
			`);
		}
		for (const [email, role] of [
			[RESPONSABLE, 'org_admin'],
			[EDITEUR, 'editor'],
			[SANS_ACCORD, 'editor']
		] as const) {
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organizationId}, ${userIds[email]}, ${role})
			`);
		}
		await tx.execute(conditionsAcceptees(organizationId, userIds[RESPONSABLE] as string));
		await tx.execute(conditionsAcceptees(organizationId, userIds[EDITEUR] as string));
		await tx.execute(sql`delete from "rate_limit"`);
	});
	for (const email of [RESPONSABLE, EDITEUR, SANS_ACCORD, EXPLOITANT]) {
		cookies[email] = await signIn(email);
	}
	// L'exploitant a prouvé sa passkey et choisi cette organisation : ce que l'écran du super-admin
	// fait, écrit ici par le propriétaire. Il y entre par ses pouvoirs, sans en être membre.
	await maintenance((tx) =>
		tx.execute(sql`
			update "session" set "passkey_verified_at" = now(),
				"active_organization_id" = ${organizationId}
			where "user_id" = ${userIds[EXPLOITANT]}
		`)
	);

	// Le relais, comme en production : `node dist/index.js`, réglé par son environnement.
	relayFolder = await mkdtemp(join(tmpdir(), 'jadwal-tests-direct-'));
	const port = new URL(liveUrl).port;
	// L'environnement du poste, moins tout réglage du direct qu'un `.env` y aurait mis : le relais
	// ne reçoit que ceux écrits ici.
	const inherited = Object.fromEntries(
		Object.entries(productionEnvironment()).filter(([name]) => !name.startsWith('JADWAL_LIVE_'))
	);
	relay = spawn(process.execPath, [relayEntry], {
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...inherited,
			JADWAL_LIVE_TRANSLATOR: 'simulated',
			JADWAL_LIVE_SECRET: liveSecret,
			JADWAL_LIVE_ORIGIN: avec,
			JADWAL_LIVE_HOST: '127.0.0.1',
			JADWAL_LIVE_PORT: port,
			JADWAL_LIVE_LANGUAGES: liveLanguages.join(','),
			JADWAL_LIVE_COUNTER_FILE: join(relayFolder, 'compteur.json')
		}
	});
	relay.stdout?.on('data', (chunk: Buffer) => relayLog.push(chunk.toString()));
	relay.stderr?.on('data', (chunk: Buffer) => relayLog.push(chunk.toString()));
	let ready = false;
	for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
		try {
			ready = (await fetch(`http://127.0.0.1:${port}/healthz`)).ok;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
	}
	if (!ready) throw new Error(`Le relais n'a pas démarré.\n${relayLog.join('')}`);
}, 120_000);

afterAll(async () => {
	relay?.kill();
	if (relayFolder) await rm(relayFolder, { recursive: true, force: true });
	await ownerHandle?.close();
	await appHandle?.close();
});

describe('sans réglage, le direct n’existe pas', () => {
	it('answers 404 on the screen and on the token, even to a manager', async () => {
		expect((await get(sans, '/direct', cookies[RESPONSABLE])).status).toBe(404);
		expect((await askToken(sans, cookies[RESPONSABLE])).status).toBe(404);
	});

	it('shows no « Direct » link in the navigation', async () => {
		const home = await (await get(sans, '/', cookies[RESPONSABLE])).text();
		expect(home).toMatch(/<nav\b/);
		expect(home).not.toMatch(/<a href="[^"]*direct"/);
	});

	it('keeps the microphone closed', async () => {
		const response = await get(sans, '/direct', cookies[RESPONSABLE]);
		expect(response.headers.get('permissions-policy')).toContain('microphone=()');
		expect(response.headers.get('content-security-policy')).not.toContain('ws:');
	});
});

describe('l’écran « Diffuser »', () => {
	it('shows a manager the languages of the relay and the button, and never a token', async () => {
		const response = await get(avec, '/direct', cookies[RESPONSABLE]);
		expect(response.status).toBe(200);
		const html = await response.text();
		const text = visibleText(html);
		expect(text).toContain('Diffuser le sermon en direct');
		expect(text).toContain('Commencer le direct');
		for (const language of liveLanguages) {
			expect(html).toMatch(new RegExp(`<input\\b[^>]*name="languages"[^>]*value="${language}"`));
		}
		// Les langues de ce relais, et pas les sept de l'exemple.
		expect(html).not.toMatch(/<input\b[^>]*name="languages"[^>]*value="it"/);
		expect(text).toContain('français');
		expect(text).toContain('turc');
		// Le jeton se demande au moment d'appuyer : il n'est jamais rendu dans la page.
		expect(html).not.toContain('eyJ');
		expect(html).not.toContain(liveSecret);
	});

	it('is open to an editor too', async () => {
		expect((await get(avec, '/direct', cookies[EDITEUR])).status).toBe(200);
	});

	it('is in the navigation of a member', async () => {
		const home = await (await get(avec, '/', cookies[EDITEUR])).text();
		expect(home).toMatch(/<a href="[^"]*direct"[^>]*>Direct<\/a>/);
	});

	it('sends a visitor to the sign-in screen, and a member without the terms to accept them', async () => {
		const visitor = await get(avec, '/direct');
		expect(visitor.status).toBe(303);
		expect(visitor.headers.get('location')).toBe('/connexion');
		const pending = await get(avec, '/direct', cookies[SANS_ACCORD]);
		expect(pending.status).toBe(303);
		expect(pending.headers.get('location')).toBe('/conditions/accepter');
	});

	it('does not exist for the super admin who entered by his powers', async () => {
		// Le témoin : il est bien entré dans l'organisation, et voit son espace.
		const home = await get(avec, '/', cookies[EXPLOITANT]);
		expect(home.status).toBe(200);
		const html = await home.text();
		expect(html).toContain(ORGANISATION);
		expect(html).not.toMatch(/<a href="[^"]*direct"/);
		expect((await get(avec, '/direct', cookies[EXPLOITANT])).status).toBe(404);
	});

	it('opens the microphone and the way to the relay on this screen only', async () => {
		const screen = await get(avec, '/direct', cookies[RESPONSABLE]);
		expect(screen.headers.get('permissions-policy')).toBe(
			'camera=(), microphone=(self), geolocation=(), payment=(), usb=()'
		);
		expect(screen.headers.get('content-security-policy')).toContain(
			`connect-src 'self' ${liveUrl};`
		);
		// Le reste de la politique tient toujours : le nonce de SvelteKit et l'interdiction de cadre.
		expect(screen.headers.get('content-security-policy')).toMatch(/script-src 'self' 'nonce-/);
		expect(screen.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");

		for (const path of ['/', '/cours', '/direct/jeton']) {
			const other = await get(avec, path, cookies[RESPONSABLE]);
			expect(other.headers.get('permissions-policy'), path).toContain('microphone=()');
			expect(other.headers.get('content-security-policy'), path).not.toContain(liveUrl);
		}
	});

	it.each(['de', 'it', 'en', 'ar'] as const)(
		'leaves no French sentence in %s',
		async (language) => {
			const french = await (await get(avec, '/direct?lang=fr', cookies[RESPONSABLE])).text();
			const other = await (
				await get(avec, `/direct?lang=${language}`, cookies[RESPONSABLE])
			).text();
			expect(other).toMatch(new RegExp(`<html\\b[^>]*\\blang="${language}"`));
			expect(other).toMatch(
				new RegExp(`<html\\b[^>]*\\bdir="${language === 'ar' ? 'rtl' : 'ltr'}"`)
			);
			expect(frenchLeft(french, other, [ORGANISATION, RESPONSABLE])).toEqual([]);
			// Le témoin : la page française, elle, en est pleine.
			expect(frenchLeft(french, french, [ORGANISATION, RESPONSABLE]).length).toBeGreaterThan(5);
		}
	);
});

describe('le jeton', () => {
	it('is signed for the organisation of the session, for one minute, and leaves a line in the journal', async () => {
		const before = Date.now();
		const response = await askToken(avec, cookies[RESPONSABLE]);
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		const { token } = (await response.json()) as { token: string };
		const [body, signature] = token.split('.') as [string, string];
		const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
			o: string;
			e: number;
			p: string;
		};
		expect(claims.o).toBe(SLUG);
		expect(claims.p).toBe('broadcast');
		// Une minute après la signature, qui a eu lieu entre l'envoi et la réponse. Une seconde de jeu
		// de chaque côté : le serveur et ce test sont deux programmes, et leurs lectures de l'horloge
		// ne tombent pas sur le même battement (15,6 ms sous Windows ; vu : 11 ms d'écart). Ce jeu ne
		// dépend pas de la charge de la machine, et une durée de vie fausse le dépasse de loin.
		expect(claims.e).toBeGreaterThanOrEqual(before + 60_000 - 1000);
		expect(claims.e).toBeLessThanOrEqual(Date.now() + 60_000 + 1000);
		expect(signature).toBe(createHmac('sha256', liveSecret).update(body).digest('base64url'));

		expect(await liveJournal()).toEqual([{ actor_id: userIds[RESPONSABLE], action: 'live.token' }]);
	});

	it('is given to an editor', async () => {
		expect((await askToken(avec, cookies[EDITEUR])).status).toBe(200);
	});

	it('is refused without a session, without the terms, to the super admin, and to another site', async () => {
		expect((await askToken(avec)).status).toBe(401);
		expect((await askToken(avec, cookies[SANS_ACCORD])).status).toBe(403);
		expect((await askToken(avec, cookies[EXPLOITANT])).status).toBe(403);
		const elsewhere = 'https://ailleurs.example.org';
		expect((await askToken(avec, cookies[RESPONSABLE], elsewhere)).status).toBe(403);
		// SvelteKit refuse de lui-même un `POST` d'un autre site sans type de contenu, mais laisse
		// passer un corps JSON : c'est la route qui le refuse alors. Le témoin : le même corps, de
		// la bonne origine, reçoit son jeton.
		expect((await askToken(avec, cookies[RESPONSABLE], elsewhere, true)).status).toBe(403);
		expect((await askToken(avec, cookies[RESPONSABLE], avec, true)).status).toBe(200);
		// Aucun de ces refus ne laisse de corps à lire, ni de ligne au journal.
		const refused = await askToken(avec, cookies[SANS_ACCORD]);
		expect(await refused.text()).not.toContain('eyJ');
		const before = await liveJournal();
		await askToken(avec, cookies[SANS_ACCORD]);
		await askToken(avec, cookies[EXPLOITANT]);
		await askToken(avec, cookies[RESPONSABLE], 'https://ailleurs.example.org');
		expect(await liveJournal()).toEqual(before);
		// Le témoin : le journal, lui, a bien des lignes, et un jeton donné en ajoute une.
		expect(before.length).toBeGreaterThan(0);
		await askToken(avec, cookies[RESPONSABLE]);
		expect(await liveJournal()).toHaveLength(before.length + 1);
	});

	it('is not given by GET', async () => {
		expect((await get(avec, '/direct/jeton', cookies[RESPONSABLE])).status).toBe(405);
	});
});

describe('un direct entier, du serveur web au relais', () => {
	it('the relay accepts the token the web server signs, and the listener of this organisation hears the sound', async () => {
		// Une personne écoute déjà, en français, sans compte ni cookie.
		const heard: (Record<string, unknown> | ArrayBuffer)[] = [];
		const listener = new WebSocket(`${liveUrl}/listen/${SLUG}/fr`);
		listener.binaryType = 'arraybuffer';
		listener.onmessage = (event) =>
			heard.push(
				typeof event.data === 'string'
					? (JSON.parse(event.data) as Record<string, unknown>)
					: (event.data as ArrayBuffer)
			);
		// Et une autre écoute une organisation qui ne diffuse pas : elle ne doit rien entendre.
		const elsewhere: unknown[] = [];
		const stranger = new WebSocket(`${liveUrl}/listen/une-autre-organisation/fr`);
		stranger.onmessage = (event) => elsewhere.push(event.data);
		await until(() => heard.length > 0 && elsewhere.length > 0, 'les deux écoutes en attente');
		expect(heard[0]).toEqual({ type: 'state', live: false });

		// Le poste : le code de la page, branché sur le vrai serveur web et le vrai relais.
		const states: BroadcastState[] = [];
		const session = new BroadcastSession({
			requestToken: async (): Promise<TokenAnswer> => {
				const response = await askToken(avec, cookies[RESPONSABLE]);
				if (!response.ok) return { ok: false };
				return { ok: true, token: ((await response.json()) as { token: string }).token };
			},
			connect: () => openRelaySocket(`${liveUrl}/broadcast`),
			setTimer: (callback, ms) => setTimeout(callback, ms),
			clearTimer: (timer) => clearTimeout(timer as NodeJS.Timeout),
			onChange: (state) => states.push(state)
		});
		session.start(['fr', 'tr']);
		await until(() => session.state.phase === 'live', 'le relais dit « ouvert »');
		expect(session.state.languages).toEqual(['fr', 'tr']);
		expect(session.state.maxSeconds).toBe(3600);

		// Une seconde de son fabriqué, en cinq morceaux de 200 ms, comme le micro les donnerait.
		const sent = new Int16Array(24_000);
		for (let index = 0; index < sent.length; index += 1) sent[index] = (index * 7) % 30_000;
		for (let chunk = 0; chunk < 5; chunk += 1) {
			expect(session.audio(sent.buffer.slice(chunk * 9600, (chunk + 1) * 9600))).toBe(true);
		}

		const sound = () => heard.filter((message) => message instanceof ArrayBuffer) as ArrayBuffer[];
		const bytes = () => sound().reduce((total, part) => total + part.byteLength, 0);
		await until(() => bytes() >= sent.byteLength, 'le son arrive à la personne qui écoute');
		const received = Buffer.concat(sound().map((part) => Buffer.from(part)));
		expect(received.equals(Buffer.from(sent.buffer))).toBe(true);
		expect(heard).toContainEqual(
			expect.objectContaining({ type: 'state', live: true, languages: ['fr', 'tr'] })
		);
		// Le traducteur simulé rend un texte qui se dit simulé : personne ne le prend pour vrai.
		await until(
			() =>
				heard.some((message) => !(message instanceof ArrayBuffer) && message['type'] === 'text'),
			'le texte arrive'
		);

		// Le poste voit qui écoute, langue par langue.
		await until(
			() => session.state.listeners['fr'] === 1,
			'le poste voit une personne en français'
		);
		expect(session.state.listeners).toEqual({ fr: 1, tr: 0 });

		session.stop();
		await until(() => session.state.phase === 'ended', 'le relais confirme la fin');
		expect(session.state.end).toEqual({ kind: 'closed', reason: 'requested' });
		await until(() => {
			const last = heard.filter((message) => !(message instanceof ArrayBuffer)).at(-1);
			return last !== undefined && !(last instanceof ArrayBuffer) && last['live'] === false;
		}, 'la personne qui écoute apprend la fin');

		// L'autre organisation n'a rien entendu : son seul message est celui de l'attente.
		expect(elsewhere).toEqual([JSON.stringify({ type: 'state', live: false })]);
		expect(states.map((state) => state.phase)).toEqual(
			expect.arrayContaining(['starting', 'live', 'ended'])
		);
		listener.close();
		stranger.close();

		// Le journal du relais nomme l'organisation de la session, et rien de ce qui a été dit.
		await until(() => relayLog.join('').includes('broadcast-ended'), 'le relais journalise la fin');
		const log = relayLog.join('');
		expect(log).toContain(`"organization":"${SLUG}"`);
		expect(log).not.toContain('simulée');
	});

	it('the relay refuses a token signed with another secret, and the screen is told', async () => {
		const forged = (() => {
			const body = Buffer.from(
				JSON.stringify({ o: SLUG, e: Date.now() + 60_000, p: 'broadcast' })
			).toString('base64url');
			const signature = createHmac('sha256', 'un-autre-secret-assez-long-pour-en-etre-un')
				.update(body)
				.digest('base64url');
			return `${body}.${signature}`;
		})();
		const session = new BroadcastSession({
			requestToken: async () => ({ ok: true, token: forged }),
			connect: () => openRelaySocket(`${liveUrl}/broadcast`),
			setTimer: (callback, ms) => setTimeout(callback, ms),
			clearTimer: (timer) => clearTimeout(timer as NodeJS.Timeout),
			onChange: () => undefined
		});
		session.start(['fr']);
		await until(() => session.state.phase === 'ended', 'le relais refuse');
		expect(session.state.end).toEqual({ kind: 'refused', reason: 'token' });
	});

	it('the relay refuses a language it does not serve', async () => {
		const session = new BroadcastSession({
			requestToken: async (): Promise<TokenAnswer> => {
				const response = await askToken(avec, cookies[EDITEUR]);
				return { ok: true, token: ((await response.json()) as { token: string }).token };
			},
			connect: () => openRelaySocket(`${liveUrl}/broadcast`),
			setTimer: (callback, ms) => setTimeout(callback, ms),
			clearTimer: (timer) => clearTimeout(timer as NodeJS.Timeout),
			onChange: () => undefined
		});
		session.start(['fr', 'it']);
		await until(() => session.state.phase === 'ended', 'le relais refuse');
		expect(session.state.end).toEqual({ kind: 'refused', reason: 'languages' });
	});
});

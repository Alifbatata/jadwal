// Le poste « Diffuser » (étape 25, ADR 0056), sur de vrais serveurs : le serveur web construit, une
// vraie base, et le **vrai relais** (`apps/live`), lancé comme en production avec le traducteur
// simulé.
//
// Ce que ce fichier prouve et qu'aucun test unitaire ne voit :
//   - sans réglage, l'écran n'existe pas (première instance) ; avec, il existe (seconde instance) ;
//   - qui a le droit de diffuser : la personne responsable d'office, un éditeur à qui elle a donné
//     l'autorisation, conditions acceptées, et le super-admin entré par ses pouvoirs, qui a tous
//     les droits partout ; ni un autre éditeur, ni un inconnu, ni un autre site (ADR 0056 amendée) ;
//   - l'autorisation se donne dans l'écran Membres, et vaut à la requête suivante ;
//   - les langues du direct sont celles que l'organisation a choisies dans ses réglages, croisées
//     avec celles du relais : l'écran n'offre qu'elles, le jeton les porte, le relais refuse les
//     autres ;
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
/** Éditeur sans l'autorisation de diffuser. */
const EDITEUR = 'direct-editeur@example.test';
/** Éditeur à qui la responsable a donné l'autorisation. */
const DIFFUSEUR = 'direct-diffuseur@example.test';
/**
 * Les langues que l'organisation a choisies : le français et le turc, que le relais de ces tests
 * sert, et l'albanais, qu'il ne sert pas. L'allemand, qu'il sert, n'en est pas.
 */
const LANGUES_DE_L_ORGANISATION = ['fr', 'tr', 'sq'];
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

/** Poste un formulaire comme un navigateur sans JavaScript. Un champ peut porter plusieurs valeurs. */
function postForm(
	origin: string,
	path: string,
	fields: Record<string, string | readonly string[]>,
	cookie: string | undefined
): Promise<Response> {
	const body = new URLSearchParams();
	for (const [name, value] of Object.entries(fields)) {
		for (const one of typeof value === 'string' ? [value] : value) body.append(name, one);
	}
	return fetch(`${origin}${path}`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			accept: 'text/html',
			origin,
			...(cookie ? { cookie } : {})
		},
		body: body.toString()
	});
}

/** L'adhésion d'une personne de l'organisation, et son autorisation, relevées par le propriétaire. */
async function membershipOf(email: string): Promise<{ id: string; can_broadcast: boolean }> {
	const [row] = await maintenance(async (tx) =>
		rows<{ id: string; can_broadcast: boolean }>(
			await tx.execute(sql`
				select "id", "can_broadcast" from "membership"
				where "organization_id" = ${organizationId} and "user_id" = ${userIds[email]}
			`)
		)
	);
	expect(row, email).toBeTruthy();
	return row as { id: string; can_broadcast: boolean };
}

/** Les langues du direct de l'organisation, relevées par le propriétaire. */
async function storedLiveLanguages(): Promise<string[]> {
	const [row] = await maintenance(async (tx) =>
		rows<{ live_language: string[] }>(
			await tx.execute(
				sql`select "live_language" from "organization" where "id" = ${organizationId}`
			)
		)
	);
	return row?.live_language ?? [];
}

/** Les lignes du journal d'une action donnée, lues comme la responsable les lit. */
async function journalOf(action: string): Promise<{ actor_id: string; after: unknown }[]> {
	return withOrg(
		appHandle.db,
		{ organizationId, userId: userIds[RESPONSABLE] as string },
		async (tx) =>
			rows<{ actor_id: string; after: unknown }>(
				await tx.execute(sql`
					select "actor_id", "after" from "audit_log"
					where "action" = ${action} order by "created_at", "id"
				`)
			)
	);
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
	for (const email of [RESPONSABLE, EDITEUR, DIFFUSEUR, SANS_ACCORD, EXPLOITANT]) {
		userIds[email] = newId();
	}
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language", "live_language")
			values (${organizationId}, ${SLUG}, ${ORGANISATION}, 'Europe/Zurich', 'fr', array['fr'],
				${`{${LANGUES_DE_L_ORGANISATION.join(',')}}`}::text[])
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
			[DIFFUSEUR, 'editor'],
			[SANS_ACCORD, 'editor']
		] as const) {
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organizationId}, ${userIds[email]}, ${role})
			`);
		}
		await tx.execute(conditionsAcceptees(organizationId, userIds[RESPONSABLE] as string));
		await tx.execute(conditionsAcceptees(organizationId, userIds[EDITEUR] as string));
		await tx.execute(conditionsAcceptees(organizationId, userIds[DIFFUSEUR] as string));
		await tx.execute(sql`delete from "rate_limit"`);
	});
	for (const email of [RESPONSABLE, EDITEUR, DIFFUSEUR, SANS_ACCORD, EXPLOITANT]) {
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

	it('offers neither the permission in Members nor the languages in Settings', async () => {
		const members = await (await get(sans, '/membres', cookies[RESPONSABLE])).text();
		expect(members).toContain(EDITEUR);
		expect(members).not.toContain('?/diffusion');
		const settings = await (await get(sans, '/reglages', cookies[RESPONSABLE])).text();
		expect(settings).toContain('?/enregistrer');
		expect(settings).not.toContain('?/languesDirect');
		const { id } = await membershipOf(EDITEUR);
		expect(
			(
				await postForm(
					sans,
					'/membres?/diffusion',
					{ membershipId: id, allow: 'oui' },
					cookies[RESPONSABLE]
				)
			).status
		).toBe(404);
		expect(
			(
				await postForm(
					sans,
					'/reglages?/languesDirect',
					{ liveLanguages: 'fr' },
					cookies[RESPONSABLE]
				)
			).status
		).toBe(404);
		expect((await membershipOf(EDITEUR)).can_broadcast).toBe(false);
		expect(await storedLiveLanguages()).toEqual(LANGUES_DE_L_ORGANISATION);
	});
});

describe('qui diffuse : l’autorisation, donnée dans l’écran Membres', () => {
	it('shows the responsible person a permission to give each editor, and none to give herself', async () => {
		const html = await (await get(avec, '/membres', cookies[RESPONSABLE])).text();
		const { id: editor } = await membershipOf(EDITEUR);
		const { id: manager } = await membershipOf(RESPONSABLE);
		expect(html).toMatch(
			new RegExp(`action="\\?/diffusion"[\\s\\S]{0,400}?name="membershipId" value="${editor}"`)
		);
		// Elle diffuse d'office : l'écran le dit, sans case à cocher pour elle.
		expect(html).not.toMatch(
			new RegExp(`action="\\?/diffusion"[\\s\\S]{0,400}?name="membershipId" value="${manager}"`)
		);
		expect(visibleText(html)).toContain('Diffuse d’office');
	});

	it('refuses the permission to an editor who would give it, to herself or to a colleague', async () => {
		for (const target of [EDITEUR, DIFFUSEUR]) {
			const { id } = await membershipOf(target);
			const response = await postForm(
				avec,
				'/membres?/diffusion',
				{ membershipId: id, allow: 'oui' },
				cookies[EDITEUR]
			);
			// L'action refuse (403), puis la page, que le formulaire sans JavaScript recharge, renvoie
			// l'éditeur à l'accueil : l'écran Membres ne s'ouvre pas pour lui.
			expect(response.status, target).toBe(303);
			expect((await membershipOf(target)).can_broadcast, target).toBe(false);
		}
		expect(await journalOf('member.broadcast')).toEqual([]);
	});

	it('is given by the responsible person, and leaves a line in the journal', async () => {
		const { id } = await membershipOf(DIFFUSEUR);
		const response = await postForm(
			avec,
			'/membres?/diffusion',
			{ membershipId: id, allow: 'oui' },
			cookies[RESPONSABLE]
		);
		expect(response.status).toBe(200);
		expect(visibleText(await response.text())).toContain('peut maintenant diffuser le direct');
		expect((await membershipOf(DIFFUSEUR)).can_broadcast).toBe(true);
		expect(await journalOf('member.broadcast')).toEqual([
			{ actor_id: userIds[RESPONSABLE], after: { canBroadcast: true } }
		]);
	});

	it('refuses a membership that is not one, and a value that is neither yes nor no', async () => {
		// Comme pour le rôle : un membre introuvable, 404 ; une valeur fausse, 400. La personne
		// responsable diffuse d'office : sa propre case n'existe pas, et ne s'écrit pas.
		const { id } = await membershipOf(EDITEUR);
		const { id: manager } = await membershipOf(RESPONSABLE);
		for (const [fields, status] of [
			[{ membershipId: 'pas-un-identifiant', allow: 'oui' }, 404],
			[{ membershipId: newId(), allow: 'oui' }, 404],
			[{ membershipId: id, allow: 'peut-etre' }, 400],
			[{ membershipId: id }, 400],
			[{ membershipId: manager, allow: 'oui' }, 400]
		] as const) {
			const response = await postForm(avec, '/membres?/diffusion', fields, cookies[RESPONSABLE]);
			expect(response.status, JSON.stringify(fields)).toBe(status);
		}
		expect((await membershipOf(EDITEUR)).can_broadcast).toBe(false);
		expect((await membershipOf(RESPONSABLE)).can_broadcast).toBe(false);
	});
});

describe('vers quelles langues : le choix de l’organisation, dans ses Réglages', () => {
	it('shows the responsible person the languages of the relay, checked as the organisation chose', async () => {
		const html = await (await get(avec, '/reglages', cookies[RESPONSABLE])).text();
		expect(html).toContain('?/languesDirect');
		const box = (language: string) =>
			html.match(
				new RegExp(`<input\\b[^>]*name="liveLanguages"[^>]*value="${language}"[^>]*>`)
			)?.[0];
		expect(box('fr')).toMatch(/\bchecked\b/);
		expect(box('tr')).toMatch(/\bchecked\b/);
		expect(box('de')).toBeDefined();
		expect(box('de')).not.toMatch(/\bchecked\b/);
		// Ce que le relais ne sert pas, l'écran ne le propose pas.
		expect(box('it')).toBeUndefined();
		expect(box('sq')).toBeUndefined();
	});

	it('refuses an editor, an empty choice and a language the relay does not serve', async () => {
		expect(
			(await postForm(avec, '/reglages?/languesDirect', { liveLanguages: 'de' }, cookies[EDITEUR]))
				.status
		).toBe(303);
		for (const liveLanguages of [[], ['it'], ['xx'], ['sq']]) {
			const response = await postForm(
				avec,
				'/reglages?/languesDirect',
				{ liveLanguages },
				cookies[RESPONSABLE]
			);
			expect(response.status, JSON.stringify(liveLanguages)).toBe(400);
		}
		expect(await storedLiveLanguages()).toEqual(LANGUES_DE_L_ORGANISATION);
		expect(await journalOf('organization.live_languages')).toEqual([]);
	});

	it('keeps the languages the relay does not serve when the responsible person saves', async () => {
		// L'albanais, choisi mais que ce relais ne sert pas, n'est pas sur l'écran : l'enregistrer ne
		// doit pas l'effacer en silence. Le choix d'une organisation survit à un relais qui change.
		const response = await postForm(
			avec,
			'/reglages?/languesDirect',
			{ liveLanguages: ['fr', 'tr'] },
			cookies[RESPONSABLE]
		);
		expect(response.status).toBe(200);
		expect(await storedLiveLanguages()).toEqual(LANGUES_DE_L_ORGANISATION);
		expect(await journalOf('organization.live_languages')).toEqual([]);
	});

	it('changes the choice, says so, and leaves a line in the journal', async () => {
		const save = (liveLanguages: string[]) =>
			postForm(avec, '/reglages?/languesDirect', { liveLanguages }, cookies[RESPONSABLE]);
		const added = await save(['fr', 'de', 'tr']);
		expect(added.status).toBe(200);
		expect(visibleText(await added.text())).toContain('Les langues du direct sont enregistrées');
		expect(await storedLiveLanguages()).toEqual(['fr', 'de', 'tr', 'sq']);
		// Et le retour au choix de départ, pour la suite de ce fichier.
		expect((await save(['fr', 'tr'])).status).toBe(200);
		expect(await storedLiveLanguages()).toEqual(LANGUES_DE_L_ORGANISATION);
		expect(await journalOf('organization.live_languages')).toEqual([
			{
				actor_id: userIds[RESPONSABLE],
				after: { liveLanguages: ['fr', 'de', 'tr', 'sq'] }
			},
			{ actor_id: userIds[RESPONSABLE], after: { liveLanguages: LANGUES_DE_L_ORGANISATION } }
		]);
	});
});

describe('l’écran « Diffuser »', () => {
	it('shows a manager the languages of the organisation that the relay serves, the button, and never a token', async () => {
		const response = await get(avec, '/direct', cookies[RESPONSABLE]);
		expect(response.status).toBe(200);
		const html = await response.text();
		const text = visibleText(html);
		expect(text).toContain('Diffuser le sermon en direct');
		expect(text).toContain('Commencer le direct');
		// Le français et le turc : choisis par l'organisation, servis par le relais.
		for (const language of ['fr', 'tr']) {
			expect(html).toMatch(new RegExp(`<input\\b[^>]*name="languages"[^>]*value="${language}"`));
		}
		// L'allemand, que le relais sert mais que l'organisation n'a pas choisi ; l'albanais, choisi
		// mais que le relais ne sert pas ; l'italien, ni l'un ni l'autre.
		for (const language of ['de', 'sq', 'it']) {
			expect(html).not.toMatch(
				new RegExp(`<input\\b[^>]*name="languages"[^>]*value="${language}"`)
			);
		}
		expect(liveLanguages).toContain('de');
		expect(text).toContain('français');
		expect(text).toContain('turc');
		expect(text).not.toContain('allemand');
		// Le jeton se demande au moment d'appuyer : il n'est jamais rendu dans la page.
		expect(html).not.toContain('eyJ');
		expect(html).not.toContain(liveSecret);
	});

	it('is open to an editor with the permission, and to no other editor', async () => {
		expect((await get(avec, '/direct', cookies[DIFFUSEUR])).status).toBe(200);
		expect((await get(avec, '/direct', cookies[EDITEUR])).status).toBe(404);
	});

	it('is in the navigation of those who may broadcast, and of nobody else', async () => {
		const link = /<a href="[^"]*direct"[^>]*>Direct<\/a>/;
		for (const email of [RESPONSABLE, DIFFUSEUR]) {
			expect(await (await get(avec, '/', cookies[email])).text(), email).toMatch(link);
		}
		const editor = await get(avec, '/', cookies[EDITEUR]);
		expect(editor.status).toBe(200);
		expect(await editor.text()).not.toMatch(/<a href="[^"]*direct"/);
	});

	it('closes as soon as the permission is taken back, and opens again when it is given', async () => {
		// Le droit est relu à chaque requête, jamais gardé dans la session ni dans un cookie.
		const { id } = await membershipOf(DIFFUSEUR);
		const give = (allow: string) =>
			postForm(avec, '/membres?/diffusion', { membershipId: id, allow }, cookies[RESPONSABLE]);
		expect((await give('non')).status).toBe(200);
		expect((await get(avec, '/direct', cookies[DIFFUSEUR])).status).toBe(404);
		expect((await askToken(avec, cookies[DIFFUSEUR])).status).toBe(403);
		expect((await give('oui')).status).toBe(200);
		expect((await get(avec, '/direct', cookies[DIFFUSEUR])).status).toBe(200);
		expect((await journalOf('member.broadcast')).map((line) => line.after)).toEqual([
			{ canBroadcast: true },
			{ canBroadcast: false },
			{ canBroadcast: true }
		]);
	});

	it('says so, and offers no button, when none of the chosen languages is served', async () => {
		await maintenance((tx) =>
			tx.execute(sql`update "organization" set "live_language" = array['sq', 'bs']::text[]
				where "id" = ${organizationId}`)
		);
		try {
			const html = await (await get(avec, '/direct', cookies[RESPONSABLE])).text();
			const text = visibleText(html);
			expect(text).toContain('Aucune des langues choisies');
			expect(text).not.toContain('Commencer le direct');
			expect(html).not.toMatch(/<input\b[^>]*name="languages"/);
			expect((await askToken(avec, cookies[RESPONSABLE])).status).toBe(409);
		} finally {
			await maintenance((tx) =>
				tx.execute(sql`update "organization"
					set "live_language" = ${`{${LANGUES_DE_L_ORGANISATION.join(',')}}`}::text[]
					where "id" = ${organizationId}`)
			);
		}
	});

	it('sends a visitor to the sign-in screen, and a member without the terms to accept them', async () => {
		const visitor = await get(avec, '/direct');
		expect(visitor.status).toBe(303);
		expect(visitor.headers.get('location')).toBe('/connexion');
		const pending = await get(avec, '/direct', cookies[SANS_ACCORD]);
		expect(pending.status).toBe(303);
		expect(pending.headers.get('location')).toBe('/conditions/accepter');
	});

	it('is open to the super admin who entered by his powers, link included', async () => {
		// Il a tous les droits dans toutes les organisations, diffuser compris (décision du chef de
		// projet du 27 novembre 2026). Il n'en est pas membre : c'est son entrée qui le lui donne.
		const home = await get(avec, '/', cookies[EXPLOITANT]);
		expect(home.status).toBe(200);
		const html = await home.text();
		expect(html).toContain(ORGANISATION);
		expect(html).toMatch(/<a href="[^"]*direct"[^>]*>Direct<\/a>/);
		expect((await get(avec, '/direct', cookies[EXPLOITANT])).status).toBe(200);
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

	// L'écran « Diffuser », et ce que le direct ajoute aux Membres et aux Réglages, qui ne se montre
	// que sur cette instance.
	it.each(
		(['de', 'it', 'en', 'ar'] as const).flatMap((language) =>
			['/direct', '/membres', '/reglages'].map((path) => [language, path] as const)
		)
	)('leaves no French sentence in %s on %s', async (language, path) => {
		const keep = [ORGANISATION, RESPONSABLE, EDITEUR, DIFFUSEUR, SANS_ACCORD];
		// Des Réglages, la section du direct seule : le reste de l'écran est éprouvé ailleurs, et la
		// liste des fuseaux, qui s'écrit pareil dans toutes les langues, n'a rien à y faire.
		const part = (html: string) =>
			path === '/reglages'
				? `${html.match(/<html\b[^>]*>/)?.[0] ?? ''}<body>${
						html.match(/<section aria-labelledby="direct-titre"[\s\S]*?<\/section>/)?.[0] ?? ''
					}</body>`
				: html;
		const french = part(await (await get(avec, `${path}?lang=fr`, cookies[RESPONSABLE])).text());
		const other = part(
			await (await get(avec, `${path}?lang=${language}`, cookies[RESPONSABLE])).text()
		);
		expect(other).toMatch(new RegExp(`<html\\b[^>]*\\blang="${language}"`));
		expect(other).toMatch(new RegExp(`<html\\b[^>]*\\bdir="${language === 'ar' ? 'rtl' : 'ltr'}"`));
		expect(frenchLeft(french, other, keep)).toEqual([]);
		// Le témoin : la page française, elle, en est pleine.
		expect(frenchLeft(french, french, keep).length).toBeGreaterThan(path === '/reglages' ? 2 : 5);
	});
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
			l: string[];
			p: string;
		};
		expect(claims.o).toBe(SLUG);
		expect(claims.p).toBe('broadcast');
		// Les langues de l'organisation que le relais sert, et elles seules.
		expect(claims.l).toEqual(['fr', 'tr']);
		// Une minute après la signature, qui a eu lieu entre l'envoi et la réponse. Une seconde de jeu
		// de chaque côté : le serveur et ce test sont deux programmes, et leurs lectures de l'horloge
		// ne tombent pas sur le même battement (15,6 ms sous Windows ; vu : 11 ms d'écart). Ce jeu ne
		// dépend pas de la charge de la machine, et une durée de vie fausse le dépasse de loin.
		expect(claims.e).toBeGreaterThanOrEqual(before + 60_000 - 1000);
		expect(claims.e).toBeLessThanOrEqual(Date.now() + 60_000 + 1000);
		expect(signature).toBe(createHmac('sha256', liveSecret).update(body).digest('base64url'));

		expect(await liveJournal()).toEqual([{ actor_id: userIds[RESPONSABLE], action: 'live.token' }]);
	});

	it('is given to an editor with the permission, and refused to the others', async () => {
		expect((await askToken(avec, cookies[DIFFUSEUR])).status).toBe(200);
		const before = await liveJournal();
		const refused = await askToken(avec, cookies[EDITEUR]);
		expect(refused.status).toBe(403);
		expect(await refused.text()).not.toContain('eyJ');
		expect(await liveJournal()).toEqual(before);
	});

	it('is given to the super admin who entered, and the journal names him', async () => {
		const before = await liveJournal();
		const response = await askToken(avec, cookies[EXPLOITANT]);
		expect(response.status).toBe(200);
		const { token } = (await response.json()) as { token: string };
		const claims = JSON.parse(
			Buffer.from(token.split('.')[0] as string, 'base64url').toString('utf8')
		) as { o: string; l: string[] };
		expect(claims.o).toBe(SLUG);
		expect(claims.l).toEqual(['fr', 'tr']);
		expect(await liveJournal()).toEqual([
			...before,
			{ actor_id: userIds[EXPLOITANT], action: 'live.token' }
		]);
	});

	it('is refused without a session, without the terms, and to another site', async () => {
		expect((await askToken(avec)).status).toBe(401);
		expect((await askToken(avec, cookies[SANS_ACCORD])).status).toBe(403);
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
		await askToken(avec, cookies[EDITEUR]);
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
				JSON.stringify({ o: SLUG, e: Date.now() + 60_000, l: ['fr'], p: 'broadcast' })
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

	it.each([
		['a language neither chosen nor served', ['fr', 'it']],
		// L'allemand est servi par le relais, mais l'organisation ne l'a pas choisi : c'est le jeton
		// qui le refuse, et le relais avec lui. Un poste modifié à la main n'y gagne rien.
		['a language the relay serves but the organisation did not choose', ['fr', 'de']]
	])('the relay refuses %s', async (_case, languages) => {
		const session = new BroadcastSession({
			requestToken: async (): Promise<TokenAnswer> => {
				const response = await askToken(avec, cookies[DIFFUSEUR]);
				return { ok: true, token: ((await response.json()) as { token: string }).token };
			},
			connect: () => openRelaySocket(`${liveUrl}/broadcast`),
			setTimer: (callback, ms) => setTimeout(callback, ms),
			clearTimer: (timer) => clearTimeout(timer as NodeJS.Timeout),
			onChange: () => undefined
		});
		session.start(languages);
		await until(() => session.state.phase === 'ended', 'le relais refuse');
		expect(session.state.end).toEqual({ kind: 'refused', reason: 'languages' });
	});
});

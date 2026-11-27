#!/usr/bin/env node
/**
 * Le poste « Diffuser », **dans un vrai navigateur**, avec un faux micro (étape 25, ADR 0056).
 *
 *     pnpm direct:test
 *
 * ## Pourquoi ce test existe
 *
 * Les tests de l'application éprouvent le jeton, les en-têtes et le fil du poste avec le relais,
 * sans navigateur. Aucun ne prouve ce qui ne vit que dans un navigateur : que la politique de
 * sécurité du contenu laisse charger le découpeur et ouvrir la liaison, que `Permissions-Policy`
 * laisse prendre le micro sur cet écran et sur lui seul, que le son capté arrive au relais **à
 * 24 kHz**, par morceaux de 200 ms, au rythme du temps réel, et que l'écran dit ce qui se passe.
 *
 * ## Ce qu'il fait
 *
 * Il crée une base neuve, lance le serveur web construit et le vrai relais (traducteur simulé,
 * qui rend le son reçu), puis Chrome sans interface, à qui il donne pour micro un fichier : un
 * son pur de 440 Hz. Une personne connectée ouvre « Direct » depuis la navigation, appuie sur
 * « Commencer le direct », et le script écoute le relais comme un fidèle :
 *
 * - on arrive sur l'écran, et on en repart, par un vrai chargement de document : c'est lui qui
 *   porte les en-têtes ;
 * - le relais rend des morceaux de 9 600 octets, à 48 000 octets par seconde, et le son qui en
 *   sort fait 440 Hz quand on le lit à 24 kHz : la preuve de la fréquence ;
 * - l'écran montre « En direct », la durée, le niveau du micro et la personne à l'écoute ;
 * - le relais tué puis relancé, le poste se rebranche seul ;
 * - « Arrêter le direct » finit le direct, et celui qui écoute l'apprend ;
 * - un micro refusé donne sa phrase, sans direct ;
 * - axe ne trouve rien de sérieux, ni à l'arrêt ni en direct.
 *
 * ## Ce qu'il lui faut
 *
 * PostgreSQL joignable (comme `pnpm test`), `pnpm build` déjà fait, et Chrome ou Chromium :
 * `JADWAL_CHROME` dit où, sinon il est cherché aux endroits habituels. Les ports sont demandés au
 * système. La base créée (`JADWAL_DIRECT_TEST_DB`, `jadwal_direct_test` par défaut) est détruite à
 * la fin.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const webDir = join(root, 'apps', 'web');
const webEntry = join(webDir, 'build', 'index.js');
const relayEntry = join(root, 'apps', 'live', 'dist', 'index.js');

// `@jadwal/db` est une dépendance de l'application, pas de la racine : on la prend chez elle.
const fromWeb = createRequire(join(webDir, 'package.json'));
const importFromWeb = (specifier) => import(pathToFileURL(fromWeb.resolve(specifier)).href);
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

const SLUG = 'direct-navigateur';
const ORGANISATION = 'Association du direct';
const EMAIL = 'direct-navigateur@example.test';
const LANGUAGES = ['fr', 'de', 'tr'];
/** Deux secrets d'essai, sans valeur hors de cette épreuve. */
const LIVE_SECRET = 'secret-du-direct-pour-l-epreuve-du-navigateur';
const AUTH_SECRET = 'secret-de-session-pour-l-epreuve-du-navigateur';

/** Le son du faux micro : un la, 440 Hz. */
const TONE_HZ = 440;
/** Ce que le relais attend : 24 kHz, 16 bits, mono, par morceaux de 200 ms. */
const RELAY_RATE = 24_000;
const BYTES_PER_SECOND = RELAY_RATE * 2;
const CHUNK_BYTES = BYTES_PER_SECOND / 5;

// ---------------------------------------------------------------------------------------------
// Le relevé
// ---------------------------------------------------------------------------------------------

const verdicts = [];

function check(name, passed, detail = '') {
	verdicts.push({ name, passed });
	const suffix = detail === '' ? '' : ` (${detail})`;
	process.stdout.write(`  ${passed ? 'ok  ' : 'NON '} ${name}${suffix}\n`);
}

async function until(condition, what, timeoutMs = 15_000) {
	const deadline = Date.now() + timeoutMs;
	while (!(await condition())) {
		if (Date.now() > deadline) throw new Error(`Toujours pas : ${what}.`);
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

// ---------------------------------------------------------------------------------------------
// Le poste : Chrome, des ports libres, le faux micro
// ---------------------------------------------------------------------------------------------

/** Chrome, là où il se trouve : la même recherche que le parcours. */
function chrome() {
	const declared = process.env['JADWAL_CHROME'];
	if (declared) {
		if (!existsSync(declared)) {
			throw new Error(`JADWAL_CHROME pointe sur un fichier absent : ${declared}`);
		}
		return declared;
	}
	const candidates = [
		'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
		'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'/usr/bin/google-chrome',
		'/usr/bin/chromium',
		'/usr/bin/chromium-browser'
	];
	const found = candidates.find((candidate) => existsSync(candidate));
	if (!found) {
		throw new Error(
			'Chrome ou Chromium est introuvable. Poser JADWAL_CHROME sur le chemin de l’exécutable.'
		);
	}
	return found;
}

/** Un port libre de la boucle locale, demandé au système puis rendu aussitôt. */
function freePort() {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.on('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address();
			probe.close(() => resolve(port));
		});
	});
}

/**
 * Un fichier WAV de deux secondes, 48 kHz, 16 bits, mono : un son pur. Deux secondes font un
 * nombre entier de périodes, et Chrome, qui rejoue le fichier en boucle, ne fait pas de saut.
 */
function toneWav() {
	const rate = 48_000;
	const samples = rate * 2;
	const wav = Buffer.alloc(44 + samples * 2);
	wav.write('RIFF', 0);
	wav.writeUInt32LE(36 + samples * 2, 4);
	wav.write('WAVEfmt ', 8);
	wav.writeUInt32LE(16, 16);
	wav.writeUInt16LE(1, 20);
	wav.writeUInt16LE(1, 22);
	wav.writeUInt32LE(rate, 24);
	wav.writeUInt32LE(rate * 2, 28);
	wav.writeUInt16LE(2, 32);
	wav.writeUInt16LE(16, 34);
	wav.write('data', 36);
	wav.writeUInt32LE(samples * 2, 40);
	for (let index = 0; index < samples; index += 1) {
		const value = 0.5 * Math.sin((2 * Math.PI * TONE_HZ * index) / rate);
		wav.writeInt16LE(Math.round(value * 32767), 44 + index * 2);
	}
	return wav;
}

// ---------------------------------------------------------------------------------------------
// Les deux programmes
// ---------------------------------------------------------------------------------------------

const children = [];

function start(entry, cwd, env, log) {
	const child = spawn(process.execPath, [entry], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
	child.stdout.on('data', (chunk) => log.push(chunk.toString()));
	child.stderr.on('data', (chunk) => log.push(chunk.toString()));
	children.push(child);
	return child;
}

async function healthy(address, log, name) {
	for (let attempt = 0; attempt < 80; attempt += 1) {
		try {
			if ((await fetch(`${address}/healthz`)).ok) return;
		} catch {
			// Pas encore à l'écoute.
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`${name} n'a pas démarré sur ${address}.\n${log.join('')}`);
}

// ---------------------------------------------------------------------------------------------
// Celui qui écoute
// ---------------------------------------------------------------------------------------------

/** Écoute le relais comme un fidèle : sans compte, une langue. Garde ce qui arrive, et quand. */
function listen(relayUrl, language) {
	const socket = new WebSocket(`${relayUrl}/listen/${SLUG}/${language}`);
	socket.binaryType = 'arraybuffer';
	const heard = { frames: [], messages: [], close: () => socket.close() };
	socket.onmessage = (event) => {
		if (typeof event.data === 'string') heard.messages.push(JSON.parse(event.data));
		else heard.frames.push({ at: performance.now(), bytes: Buffer.from(event.data) });
	};
	socket.onerror = () => undefined;
	return heard;
}

/** La fréquence d'un son pur lu à 24 kHz : ses passages par zéro en montant, par seconde. */
function frequencyOf(pcm) {
	const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
	let crossings = 0;
	let peak = 0;
	for (let index = 1; index < samples.length; index += 1) {
		if (samples[index - 1] < 0 && samples[index] >= 0) crossings += 1;
		peak = Math.max(peak, Math.abs(samples[index]));
	}
	return { hertz: (crossings * RELAY_RATE) / samples.length, peak: peak / 32768 };
}

// ---------------------------------------------------------------------------------------------
// axe
// ---------------------------------------------------------------------------------------------

async function audit(page, name) {
	await page.evaluate(AXE);
	const violations = await page.evaluate(async () => {
		const result = await window.axe.run(document, { resultTypes: ['violations'] });
		return result.violations.map((violation) => ({
			rule: violation.id,
			impact: violation.impact ?? 'inconnu',
			targets: violation.nodes.map((node) => node.target.join(' '))
		}));
	});
	const serious = violations.filter((violation) =>
		['serious', 'critical'].includes(violation.impact)
	);
	check(
		`axe : ${name}`,
		serious.length === 0,
		violations.length === 0
			? 'rien à signaler'
			: violations.map((violation) => `[${violation.impact}] ${violation.rule}`).join(', ')
	);
	for (const violation of violations) {
		for (const target of violation.targets) {
			process.stdout.write(`         [${violation.impact}] ${violation.rule} : ${target}\n`);
		}
	}
}

// ---------------------------------------------------------------------------------------------
// L'épreuve
// ---------------------------------------------------------------------------------------------

async function main() {
	for (const [entry, name] of [
		[webEntry, 'Serveur web'],
		[relayEntry, 'Relais']
	]) {
		if (!existsSync(entry)) {
			throw new Error(`${name} non construit (${entry} absent). Lancer « pnpm build » d'abord.`);
		}
	}
	const { createDatabase, loadDotEnv, newId, sql } = await importFromWeb('@jadwal/db');
	const { createTestDatabase, dropTestDatabase } = await importFromWeb(
		'@jadwal/db/scripts/test-database.mjs'
	);
	const { versionIso } = await import(
		pathToFileURL(join(webDir, 'src', 'lib', 'conditions', 'rendu.js')).href
	);
	loadDotEnv();
	const databaseEnv = {
		...process.env,
		JADWAL_TEST_DB: process.env['JADWAL_DIRECT_TEST_DB'] ?? 'jadwal_direct_test'
	};

	const folder = await mkdtemp(join(tmpdir(), 'jadwal-direct-'));
	const outbox = join(folder, 'courriels');
	const wav = join(folder, 'micro.wav');
	await writeFile(wav, toneWav());
	const webLog = [];
	const relayLog = [];
	let owner;
	let browser;
	let refusing;

	try {
		process.stdout.write('Préparation : base, serveur web, relais\n');
		const database = await createTestDatabase({ env: databaseEnv });
		owner = createDatabase({ role: 'owner', overrides: { database } });
		const organizationId = newId();
		const userId = newId();
		const terms = versionIso(readFileSync(join(root, 'docs', 'CONDITIONS.md'), 'utf8'));
		await owner.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
					"enabled_language")
				values (${organizationId}, ${SLUG}, ${ORGANISATION}, 'Europe/Zurich', 'fr', array['fr'])
			`);
			await tx.execute(sql`
				insert into "user" ("id", "email", "name", "email_verified")
				values (${userId}, ${EMAIL}, 'Personne fictive', true)
			`);
			// Un éditeur, la personne à la sono, à qui la responsable a donné l'autorisation de diffuser
			// (ADR 0056, addendum du 27 novembre 2026) : sans elle, l'écran n'existe pas pour lui.
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role", "can_broadcast")
				values (${newId()}, ${organizationId}, ${userId}, 'editor', true)
			`);
			await tx.execute(sql`
				insert into "terms_acceptance" ("id", "organization_id", "user_id", "version")
				values (${newId()}, ${organizationId}, ${userId}, ${terms})
			`);
		});

		const webPort = await freePort();
		const relayPort = await freePort();
		const origin = `http://127.0.0.1:${webPort}`;
		const relayUrl = `ws://127.0.0.1:${relayPort}`;
		// Le relais ne reçoit, du direct, que les réglages écrits ici.
		const inherited = Object.fromEntries(
			Object.entries(process.env).filter(([name]) => !name.startsWith('JADWAL_LIVE_'))
		);
		const relayEnv = {
			...inherited,
			JADWAL_LIVE_TRANSLATOR: 'simulated',
			JADWAL_LIVE_SECRET: LIVE_SECRET,
			JADWAL_LIVE_ORIGIN: origin,
			JADWAL_LIVE_HOST: '127.0.0.1',
			JADWAL_LIVE_PORT: String(relayPort),
			JADWAL_LIVE_LANGUAGES: LANGUAGES.join(','),
			JADWAL_LIVE_COUNTER_FILE: join(folder, 'compteur.json')
		};
		let relay = start(relayEntry, root, relayEnv, relayLog);
		start(
			webEntry,
			webDir,
			{
				...inherited,
				NODE_ENV: 'production',
				PORT: String(webPort),
				HOST: '127.0.0.1',
				ORIGIN: origin,
				POSTGRES_DB: database,
				MAIL_TRANSPORT: 'file',
				MAIL_OUTBOX_DIR: outbox,
				MAIL_FROM: 'jadwal@example.test',
				BETTER_AUTH_SECRET: AUTH_SECRET,
				ADDRESS_HEADER: '',
				JADWAL_LIVE_URL: relayUrl,
				JADWAL_LIVE_SECRET: LIVE_SECRET,
				JADWAL_LIVE_LANGUAGES: LANGUAGES.join(',')
			},
			webLog
		);
		await healthy(origin, webLog, 'Le serveur web');
		await healthy(`http://127.0.0.1:${relayPort}`, relayLog, 'Le relais');

		// La connexion, par lien magique, comme une vraie personne.
		await fetch(`${origin}/connexion`, {
			method: 'POST',
			redirect: 'manual',
			headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html', origin },
			body: new URLSearchParams({ email: EMAIL }).toString()
		});
		const [message] = (await readdir(outbox)).filter((name) => name.endsWith('.json'));
		const link = JSON.parse(await readFile(join(outbox, message), 'utf8')).text.match(
			/https?:\/\/\S+/
		)?.[0];
		const followed = await fetch(link, { redirect: 'manual' });
		const session = followed.headers
			.getSetCookie()
			.find((value) => value.startsWith('better-auth.session_token='))
			?.split(';')[0];
		if (!session) throw new Error(`Aucune session posée.\n${webLog.join('')}`);
		const [cookieName, ...cookieValue] = session.split('=');
		const cookie = { name: cookieName, value: cookieValue.join('='), url: origin };

		// -----------------------------------------------------------------------------------
		process.stdout.write('\nLe poste « Diffuser » dans Chrome, avec un micro de 440 Hz\n');
		browser = await chromium.launch({
			executablePath: chrome(),
			headless: true,
			args: [
				'--use-fake-device-for-media-stream',
				'--use-fake-ui-for-media-stream',
				`--use-file-for-fake-audio-capture=${wav}`
			]
		});
		const context = await browser.newContext({ locale: 'fr-CH' });
		await context.addCookies([cookie]);
		const page = await context.newPage();
		const errors = [];
		page.on('console', (entry) => {
			if (entry.type() !== 'error') return;
			// L'espace des responsables n'a pas d'icône d'onglet : Chrome la demande quand même, à
			// chaque page, et note son absence. Ce n'est pas un refus de cet écran.
			if (entry.location().url === `${origin}/favicon.ico`) return;
			errors.push(`${entry.text()} [${entry.location().url}]`);
		});
		page.on('pageerror', (error) => errors.push(String(error)));
		const documentFor = (path) => (response) =>
			response.url() === `${origin}${path}` && response.request().resourceType() === 'document';

		const home = await page.goto(`${origin}/`);
		check(
			'ailleurs que sur l’écran, le micro reste interdit',
			home.headers()['permissions-policy']?.includes('microphone=()') === true,
			home.headers()['permissions-policy']
		);
		const [arrival] = await Promise.all([
			page.waitForResponse(documentFor('/direct'), { timeout: 10_000 }),
			page.getByRole('link', { name: 'Direct', exact: true }).click()
		]);
		check(
			'« Direct », dans la navigation, charge un vrai document',
			arrival.status() === 200,
			`${arrival.status()}`
		);
		check(
			'ce document ouvre le micro à la page elle-même',
			arrival.headers()['permissions-policy']?.includes('microphone=(self)') === true,
			arrival.headers()['permissions-policy']
		);
		check(
			'et la liaison vers le relais',
			arrival.headers()['content-security-policy']?.includes(`connect-src 'self' ${relayUrl}`) ===
				true
		);
		await page.getByRole('heading', { name: 'Diffuser le sermon en direct' }).waitFor();
		const startButton = page.getByRole('button', { name: 'Commencer le direct' });
		await until(() => startButton.isEnabled(), 'le bouton s’allume une fois le script lancé');
		check(
			'les langues du relais sont cochées',
			(await page.getByRole('checkbox').count()) === LANGUAGES.length &&
				(await page.getByRole('checkbox', { checked: true }).count()) === LANGUAGES.length
		);
		await audit(page, 'l’écran « Diffuser », à l’arrêt');

		// Quelqu'un écoute déjà, en français.
		let listener = listen(relayUrl, 'fr');
		await until(() => listener.messages.length > 0, 'celui qui écoute attend le direct');

		await startButton.click();
		await page.getByText('En direct', { exact: true }).waitFor({ timeout: 15_000 });
		check('l’écran dit « En direct »', true);
		check(
			'rien n’a été refusé par le navigateur jusque-là',
			errors.length === 0,
			errors.join(' | ').slice(0, 300)
		);

		// Quatre secondes de son, mesurées à l'arrivée.
		await until(() => listener.frames.length >= 21, 'quatre secondes de son arrivent', 20_000);
		const frames = listener.frames.slice(0, 21);
		check(
			'le relais rend des morceaux de 200 ms (9 600 octets)',
			frames.every((frame) => frame.bytes.length === CHUNK_BYTES),
			[...new Set(frames.map((frame) => frame.bytes.length))].join(', ')
		);
		const elapsed = (frames.at(-1).at - frames[0].at) / 1000;
		const pace = ((frames.length - 1) * CHUNK_BYTES) / elapsed;
		check(
			'au rythme du temps réel : 48 000 octets par seconde, à 5 % près',
			Math.abs(pace - BYTES_PER_SECOND) / BYTES_PER_SECOND < 0.05,
			`${Math.round(pace)} octets par seconde sur ${elapsed.toFixed(2)} s`
		);
		const tone = frequencyOf(Buffer.concat(frames.map((frame) => frame.bytes)));
		check(
			`le son du micro, lu à 24 kHz, fait ${TONE_HZ} Hz, à 2 % près`,
			Math.abs(tone.hertz - TONE_HZ) / TONE_HZ < 0.02,
			`${tone.hertz.toFixed(1)} Hz, crête ${tone.peak.toFixed(2)}`
		);
		check('et il n’est pas un silence', tone.peak > 0.05, `crête ${tone.peak.toFixed(2)}`);

		const text = () => page.locator('main').innerText();
		await until(
			async () => /français\s*1/.test(await text()),
			'l’écran compte la personne qui écoute'
		);
		check('l’écran compte une personne à l’écoute, en français', true);
		check(
			'il dit quand le direct s’arrêtera seul',
			/Arrêt automatique après\s*1:00:00/.test(await text())
		);
		let level = 0;
		await until(async () => {
			level = await page.locator('meter').evaluate((meter) => meter.value);
			return level > 0.02;
		}, 'le niveau du micro bouge');
		check('le niveau du micro bouge', true, `niveau ${level.toFixed(2)}`);
		check(
			'le silence du micro n’est pas annoncé à tort',
			!(await text()).includes('ne capte aucun son')
		);
		await audit(page, 'l’écran « Diffuser », en direct');

		// -----------------------------------------------------------------------------------
		process.stdout.write('\nLe relais tombe, puis revient\n');
		relay.kill();
		await page.getByText('La liaison est coupée').waitFor({ timeout: 10_000 });
		check('l’écran dit que la liaison est coupée, et qu’il réessaie', true);
		listener.close();
		relay = start(relayEntry, root, relayEnv, relayLog);
		await healthy(`http://127.0.0.1:${relayPort}`, relayLog, 'Le relais');
		listener = listen(relayUrl, 'fr');
		await page.getByText('En direct', { exact: true }).waitFor({ timeout: 30_000 });
		check('le poste se rebranche seul', true);
		await until(() => listener.frames.length >= 5, 'le son repart vers celui qui écoute', 15_000);
		check('et le son repart', true);

		// -----------------------------------------------------------------------------------
		process.stdout.write('\nLa fin\n');
		await page.getByRole('button', { name: 'Arrêter le direct' }).click();
		await page.getByText('Le direct est terminé.').waitFor({ timeout: 10_000 });
		check('« Arrêter le direct » finit le direct, et l’écran le dit', true);
		await until(() => listener.messages.at(-1)?.live === false, 'celui qui écoute apprend la fin');
		check('celui qui écoute l’apprend', true);
		await until(() => relayLog.join('').includes('"reason":"requested"'), 'le relais le note');
		check(
			'le relais note un direct fini à la demande, pour cette organisation',
			relayLog.join('').includes(`"organization":"${SLUG}"`)
		);
		const [departure] = await Promise.all([
			page.waitForResponse(documentFor('/cours'), { timeout: 10_000 }),
			page.getByRole('link', { name: 'Cours', exact: true }).click()
		]);
		check(
			'on quitte l’écran par un vrai chargement, et le micro se referme',
			departure.headers()['permissions-policy']?.includes('microphone=()') === true,
			departure.headers()['permissions-policy']
		);
		listener.close();
		await browser.close();
		browser = undefined;

		// -----------------------------------------------------------------------------------
		process.stdout.write('\nUn micro refusé\n');
		refusing = await chromium.launch({
			executablePath: chrome(),
			headless: true,
			// Le faux micro existe, mais personne ne répond « oui » à la question du navigateur.
			args: ['--use-fake-device-for-media-stream', '--deny-permission-prompts']
		});
		const refusingContext = await refusing.newContext({ locale: 'fr-CH' });
		await refusingContext.addCookies([cookie]);
		const refused = await refusingContext.newPage();
		await refused.goto(`${origin}/direct`);
		const refusedStart = refused.getByRole('button', { name: 'Commencer le direct' });
		await until(() => refusedStart.isEnabled(), 'le bouton s’allume');
		await refusedStart.click();
		await refused.getByText('Le micro est refusé à cette page.').waitFor({ timeout: 15_000 });
		check('l’écran dit que le micro est refusé, et comment l’autoriser', true);
		check(
			'et le bouton reste là pour réessayer',
			await refused.getByRole('button', { name: 'Commencer le direct' }).isEnabled()
		);
	} finally {
		await browser?.close().catch(() => undefined);
		await refusing?.close().catch(() => undefined);
		for (const child of children) child.kill();
		await owner?.close().catch(() => undefined);
		await dropTestDatabase({ env: databaseEnv }).catch(() => undefined);
		await rm(folder, { recursive: true, force: true }).catch(() => undefined);
	}
}

try {
	await main();
} catch (error) {
	check('l’épreuve va au bout', false, error instanceof Error ? error.message : String(error));
}
const failed = verdicts.filter((verdict) => !verdict.passed);
process.stdout.write(
	`\n${verdicts.length - failed.length} vérifications réussies sur ${verdicts.length}.\n`
);
if (failed.length > 0) {
	for (const verdict of failed) process.stdout.write(`  NON  ${verdict.name}\n`);
	process.exitCode = 1;
}

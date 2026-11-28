// Le programme, lancé comme en production : `node dist/index.js`, avec ses vraies variables
// d'environnement, dans un sous-processus. Un script qu'aucun test ne lance n'est pas éprouvé
// (règle du dépôt depuis l'étape 12).
//
// La construction est refaite ici, avant tout : un `dist/` périmé ferait passer ces tests sur
// l'ancien code.

import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createAdpcmEncoder } from '../src/adpcm.js';
import { BYTES_PER_SECOND } from '../src/audio.js';
import { signToken } from '../src/token.js';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const SECRET = 'secret-de-test-assez-long-pour-etre-accepte';

beforeAll(() => {
	const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
	execFileSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], {
		cwd: appDir,
		stdio: 'pipe'
	});
});

let dossier: string;
let enfant: ChildProcess | undefined;

beforeEach(() => {
	dossier = mkdtempSync(join(tmpdir(), 'jadwal-live-programme-'));
});
afterEach(async () => {
	if (enfant && enfant.exitCode === null && enfant.signalCode === null) {
		enfant.kill();
		await new Promise((resolve) => enfant?.once('exit', resolve));
	}
	enfant = undefined;
	rmSync(dossier, { recursive: true, force: true });
});

/**
 * L'environnement du sous-processus : celui du test, **sans** aucune variable du relais qu'un
 * poste aurait posée, plus celles que le test donne.
 */
function environment(variables: Record<string, string>): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {};
	for (const [nom, valeur] of Object.entries(process.env)) {
		if (!nom.startsWith('JADWAL_LIVE_')) env[nom] = valeur;
	}
	return { ...env, ...variables };
}

function complete(): Record<string, string> {
	return {
		JADWAL_LIVE_TRANSLATOR: 'simulated',
		JADWAL_LIVE_SECRET: SECRET,
		JADWAL_LIVE_ORIGIN: 'https://jadwal.example.org',
		JADWAL_LIVE_COUNTER_FILE: join(dossier, 'compteur.json'),
		JADWAL_LIVE_PORT: '0'
	};
}

interface Lance {
	sortie: { stdout: string; stderr: string };
	fini: Promise<number | null>;
	/** La prochaine ligne de journal qui porte cet événement. */
	evenement(nom: string): Promise<Record<string, unknown>>;
}

function lancer(variables: Record<string, string>): Lance {
	const sortie = { stdout: '', stderr: '' };
	const child = spawn(process.execPath, ['dist/index.js'], {
		cwd: appDir,
		env: environment(variables),
		stdio: ['ignore', 'pipe', 'pipe']
	});
	enfant = child;
	const attentes: { nom: string; resolve: (ligne: Record<string, unknown>) => void }[] = [];
	const lues: Record<string, unknown>[] = [];
	let reste = '';
	child.stdout.setEncoding('utf8').on('data', (texte: string) => {
		sortie.stdout += texte;
		reste += texte;
		const lignes = reste.split('\n');
		reste = lignes.pop() ?? '';
		for (const ligne of lignes.filter(Boolean)) {
			const entree = JSON.parse(ligne) as Record<string, unknown>;
			const attente = attentes.findIndex((a) => a.nom === entree['event']);
			if (attente >= 0) attentes.splice(attente, 1)[0]?.resolve(entree);
			else lues.push(entree);
		}
	});
	child.stderr.setEncoding('utf8').on('data', (texte: string) => (sortie.stderr += texte));
	return {
		sortie,
		fini: new Promise((resolve) => child.once('exit', (code) => resolve(code))),
		evenement(nom) {
			return new Promise((resolve) => {
				const deja = lues.findIndex((entree) => entree['event'] === nom);
				if (deja >= 0) resolve(lues.splice(deja, 1)[0] as Record<string, unknown>);
				else attentes.push({ nom, resolve });
			});
		}
	};
}

function liaison(port: number, chemin: string) {
	const socket = new WebSocket(`ws://127.0.0.1:${port}${chemin}`);
	const recus: (Record<string, unknown> | Buffer)[] = [];
	const attentes: ((valeur: Record<string, unknown> | Buffer) => void)[] = [];
	socket.on('message', (data, binaire) => {
		const valeur = binaire
			? (data as Buffer)
			: (JSON.parse(data.toString()) as Record<string, unknown>);
		const suivant = attentes.shift();
		if (suivant) suivant(valeur);
		else recus.push(valeur);
	});
	socket.on('error', () => undefined);
	return {
		socket,
		ouverte: new Promise<void>((resolve) => socket.on('open', () => resolve())),
		fermee: new Promise<number>((resolve) => socket.on('close', (code) => resolve(code))),
		suivant: () =>
			new Promise<Record<string, unknown> | Buffer>((resolve) => {
				const valeur = recus.shift();
				if (valeur !== undefined) resolve(valeur);
				else attentes.push(resolve);
			})
	};
}

describe('le programme, éteint', () => {
	it('refuse de démarrer sans traducteur, dit pourquoi, et n’écrit rien', async () => {
		const sans = complete();
		delete sans['JADWAL_LIVE_TRANSLATOR'];
		const programme = lancer(sans);
		expect(await programme.fini).toBe(1);
		expect(programme.sortie.stderr).toContain('JADWAL_LIVE_TRANSLATOR');
		expect(programme.sortie.stderr).toContain('éteint');
		expect(programme.sortie.stdout).toBe('');
		expect(readdirSync(dossier)).toEqual([]);
	});

	it('refuse de démarrer sur un réglage faux, sans recopier le secret', async () => {
		const programme = lancer({ ...complete(), JADWAL_LIVE_SECRET: 'trop-court' });
		expect(await programme.fini).toBe(1);
		expect(programme.sortie.stderr).toContain('JADWAL_LIVE_SECRET');
		expect(programme.sortie.stderr).not.toContain('trop-court');
	});

	it('refuse de démarrer sur un compteur illisible', async () => {
		const programme = lancer({
			...complete(),
			JADWAL_LIVE_COUNTER_FILE: join(dossier, 'absent', 'compteur.json')
		});
		expect(await programme.fini).toBe(1);
		expect(programme.sortie.stderr).toContain('compteur');
	});

	it('refuse de démarrer sur un port déjà pris, en une ligne', async () => {
		const premier = lancer(complete());
		const port = (await premier.evenement('listening'))['port'] as number;
		const second = spawnSync(process.execPath, ['dist/index.js'], {
			cwd: appDir,
			env: environment({ ...complete(), JADWAL_LIVE_PORT: String(port) }),
			encoding: 'utf8',
			// Un programme qui n'écoute pas doit rendre la main. Sans cette borne, un programme
			// resté en vie bloquerait la suite entière au lieu de faire tomber ce test.
			timeout: 10_000
		});
		expect(second.status).toBe(1);
		expect(second.stderr).toContain("n'écoute pas");
		expect(second.stderr.trim().split('\n')).toHaveLength(1);
		expect(second.stdout).toBe('');
	});
});

describe('le programme, allumé', () => {
	it('écoute, relaie un direct, et ne laisse ni son ni texte derrière lui', async () => {
		const programme = lancer(complete());
		const ecoute = await programme.evenement('listening');
		expect(ecoute).toMatchObject({ host: '127.0.0.1', translator: 'simulated' });
		const port = ecoute['port'] as number;
		expect(port).toBeGreaterThan(0);
		expect((await fetch(`http://127.0.0.1:${port}/healthz`)).status).toBe(200);

		const fidele = liaison(port, '/listen/centre-demo/fr');
		expect(await fidele.suivant()).toEqual({ type: 'state', live: false });
		const poste = liaison(port, '/broadcast');
		await poste.ouverte;
		poste.socket.send(
			JSON.stringify({
				type: 'open',
				token: signToken(SECRET, {
					organization: 'centre-demo',
					expiresAt: Date.now() + 60_000,
					languages: ['fr', 'de']
				}),
				languages: ['fr', 'de']
			})
		);
		expect(await poste.suivant()).toMatchObject({ type: 'opened', languages: ['fr', 'de'] });
		expect(await fidele.suivant()).toMatchObject({ type: 'state', live: true });

		// Une seconde d'un son reconnaissable : l'octet 0x5a, que rien d'autre n'écrirait.
		const son = Buffer.alloc(BYTES_PER_SECOND, 0x5a);
		poste.socket.send(son.subarray(0, BYTES_PER_SECOND / 2));
		poste.socket.send(son.subarray(BYTES_PER_SECOND / 2));
		// Il arrive codé pour les téléphones (ADR 0057), morceau par morceau, d'un même codeur.
		const codeur = createAdpcmEncoder();
		expect(await fidele.suivant()).toEqual(codeur.encode(son.subarray(0, BYTES_PER_SECOND / 2)));
		expect(await fidele.suivant()).toEqual(codeur.encode(son.subarray(BYTES_PER_SECOND / 2)));
		expect(await fidele.suivant()).toEqual({
			type: 'text',
			text: 'Traduction simulée (fr), seconde 1.',
			final: true
		});

		poste.socket.send(JSON.stringify({ type: 'close' }));
		await poste.fermee;
		const fin = await programme.evenement('broadcast-ended');
		expect(fin).toMatchObject({
			organization: 'centre-demo',
			languages: ['fr', 'de'],
			reason: 'requested',
			peakListeners: 1
		});

		// Aucune trace : le journal ne porte ni le texte ni le son, le dossier ne porte que le
		// compteur, et le compteur ne porte que le mois et un nombre de secondes.
		expect(programme.sortie.stdout).not.toContain('Traduction simulée');
		expect(programme.sortie.stdout).not.toContain('ZZZZ');
		expect(programme.sortie.stderr).toBe('');
		expect(readdirSync(dossier)).toEqual(['compteur.json']);
		const compteur = JSON.parse(readFileSync(join(dossier, 'compteur.json'), 'utf8')) as Record<
			string,
			unknown
		>;
		expect(Object.keys(compteur).sort()).toEqual(['month', 'seconds']);
		// Une seconde de son a suffi : le reste du direct se compte à la fin, en secondes entières.
		expect(Number.isInteger(compteur['seconds'])).toBe(true);
		// Le journal ne dit l'adresse de personne.
		expect(programme.sortie.stdout).not.toMatch(/127\.0\.0\.1:\d+|::1|remote|address/);
	});

	it('s’arrête quand on le lui demande', async () => {
		const programme = lancer(complete());
		const port = (await programme.evenement('listening'))['port'] as number;
		const poste = liaison(port, '/broadcast');
		await poste.ouverte;
		poste.socket.send(
			JSON.stringify({
				type: 'open',
				token: signToken(SECRET, {
					organization: 'centre-demo',
					expiresAt: Date.now() + 60_000,
					languages: ['fr', 'de']
				}),
				languages: ['fr']
			})
		);
		expect(await poste.suivant()).toMatchObject({ type: 'opened' });

		enfant?.kill('SIGTERM');
		const code = await programme.fini;
		await poste.fermee;
		await expect(fetch(`http://127.0.0.1:${port}/healthz`)).rejects.toThrow();
		// Windows ne délivre pas de signal à un sous-processus : il le tue, et le programme n'a pas
		// la main pour fermer proprement. Ailleurs, on vérifie l'arrêt ordonné : le poste prévenu,
		// le direct journalisé, le code de sortie à zéro.
		if (process.platform !== 'win32') {
			expect(code).toBe(0);
			expect(await programme.evenement('broadcast-ended')).toMatchObject({ reason: 'shutdown' });
			let message = await poste.suivant();
			while (!Buffer.isBuffer(message) && message['type'] === 'status') {
				message = await poste.suivant();
			}
			expect(message).toEqual({ type: 'closed', reason: 'shutdown' });
		}
	});
});

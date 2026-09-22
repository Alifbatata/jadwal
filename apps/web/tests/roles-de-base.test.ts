// L'application ne doit jamais porter les deux mots de passe qui contournent la sécurité par ligne
// (ADR 0040) : celui du superutilisateur de PostgreSQL, et celui du propriétaire du schéma.
//
// Deux façons de le vérifier, et il faut les deux :
//
//   1. **par lecture** — les rôles que le code demande, relevés dans les sources. Ce test tombe le
//      jour où quelqu'un écrit `createDatabase({ role: 'owner' })` dans une route, même si ce
//      chemin n'est jamais emprunté par les autres tests ;
//   2. **par exécution** — un vrai serveur, construit, démarré avec un environnement d'où les deux
//      mots de passe ont été **retirés**, et à qui l'on demande les trois choses qu'il doit savoir
//      faire : répondre, parler à la base par le rôle public, et servir l'écran de connexion.
//
// La première seule ne prouverait rien d'un démarrage ; la seconde seule laisserait passer un
// chemin rarement emprunté.

import { spawn, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { connectionSettings } from '@jadwal/db';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));

/** Les quatre rôles que l'application a le droit de demander, et rien d'autre. */
const AUTORISES = ['app', 'auth', 'public', 'superadmin'];

/** Les deux variables qui ne doivent plus jamais être nécessaires au service. */
const INTERDITES = ['POSTGRES_PASSWORD', 'JADWAL_DB_OWNER_PASSWORD'];

/** Un port à part : les trois serveurs de la préparation globale occupent 4173 à 4175. */
const PORT = 4176;
const ORIGINE = `http://127.0.0.1:${PORT}`;

function fichiersSources(racine: string): string[] {
	const trouves: string[] = [];
	for (const entree of readdirSync(racine)) {
		const chemin = join(racine, entree);
		if (statSync(chemin).isDirectory()) trouves.push(...fichiersSources(chemin));
		else if (/\.(ts|svelte)$/.test(entree)) trouves.push(chemin);
	}
	return trouves;
}

let serveur: ChildProcess;
const journal: string[] = [];

async function attendre(attempts = 60): Promise<void> {
	for (let essai = 1; essai <= attempts; essai += 1) {
		try {
			if ((await fetch(`${ORIGINE}/healthz`)).ok) return;
		} catch {
			// Le serveur n'écoute pas encore.
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(
		`Le serveur sans mots de passe privilégiés n'a pas démarré.\n${journal.join('')}`
	);
}

beforeAll(async () => {
	// L'environnement de production tel qu'il sera : `app.env` moins les deux lignes.
	const env: NodeJS.ProcessEnv = { ...process.env };
	for (const variable of INTERDITES) delete env[variable];

	serveur = spawn(process.execPath, [join(appDir, 'build', 'index.js')], {
		cwd: appDir,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...env,
			NODE_ENV: 'production',
			PORT: String(PORT),
			HOST: '127.0.0.1',
			ORIGIN: ORIGINE,
			POSTGRES_DB: inject('testDatabase'),
			MAIL_TRANSPORT: 'file',
			MAIL_OUTBOX_DIR: inject('outbox'),
			MAIL_FROM: 'jadwal@example.test',
			BETTER_AUTH_SECRET: inject('authSecret')
		}
	});
	serveur.stdout?.on('data', (chunk: Buffer) => journal.push(chunk.toString()));
	serveur.stderr?.on('data', (chunk: Buffer) => journal.push(chunk.toString()));
	await attendre();
}, 120_000);

afterAll(() => {
	serveur?.kill();
});

describe('les rôles que le code demande', () => {
	it('n’en demande que quatre, et jamais « admin » ni « owner »', () => {
		const demandes = new Set<string>();
		for (const fichier of fichiersSources(join(appDir, 'src'))) {
			const source = readFileSync(fichier, 'utf8');
			for (const trouve of source.matchAll(/createDatabase\(\s*\{[^}]*role:\s*'([a-z]+)'/g)) {
				demandes.add(trouve[1] as string);
			}
		}
		expect(
			demandes.size,
			'aucun appel à createDatabase trouvé : le relevé ne mesure rien'
		).toBeGreaterThan(0);
		expect([...demandes].sort()).toEqual(AUTORISES);
	});
});

describe('ce que l’environnement porte, et ce qu’il ne porte plus', () => {
	const sans: NodeJS.ProcessEnv = {
		POSTGRES_DB: 'jadwal',
		POSTGRES_USER: 'jadwal',
		JADWAL_DB_APP_PASSWORD: 'x',
		JADWAL_DB_SUPERADMIN_PASSWORD: 'x',
		JADWAL_DB_AUTH_PASSWORD: 'x',
		JADWAL_DB_PUBLIC_PASSWORD: 'x'
	};

	it('les quatre rôles de l’application se connectent sans les deux mots de passe', () => {
		for (const role of AUTORISES) {
			expect(() =>
				connectionSettings(role as Parameters<typeof connectionSettings>[0], {}, sans)
			).not.toThrow();
		}
	});

	it('et les deux rôles privilégiés, eux, ne le peuvent pas', () => {
		// C'est le témoin de ce fichier : si `required()` cessait d'être exigeant, les deux
		// assertions ci-dessus ne prouveraient plus rien.
		expect(() => connectionSettings('admin', {}, sans)).toThrow(/POSTGRES_PASSWORD/);
		expect(() => connectionSettings('owner', {}, sans)).toThrow(/JADWAL_DB_OWNER_PASSWORD/);
	});
});

describe('un vrai serveur, sans les deux mots de passe', () => {
	it('répond sur /healthz', async () => {
		const reponse = await fetch(`${ORIGINE}/healthz`);
		expect(reponse.status).toBe(200);
		expect(await reponse.json()).toEqual({ status: 'ok' });
	});

	it('parle à la base par le rôle public', async () => {
		// `/api/v1/status` fait un vrai `select` sous `jadwal_public` : un 503 dirait que la base est
		// injoignable, et c'est exactement ce qu'on veut exclure.
		const reponse = await fetch(`${ORIGINE}/api/v1/status`);
		expect(reponse.status).toBe(200);
		expect(await reponse.json()).toEqual({ status: 'ok' });
	});

	it('sert l’écran de connexion, qui passe par le rôle d’authentification', async () => {
		const reponse = await fetch(`${ORIGINE}/connexion`);
		expect(reponse.status).toBe(200);
		expect(await reponse.text()).toContain('</html>');
	});

	it('n’a rien écrit sur sa sortie d’erreur au sujet d’une variable manquante', () => {
		expect(journal.join('')).not.toMatch(/Missing environment variable/);
	});
});

// Prépare tout ce que les tests d'accès exigent : une base neuve, migrée, et un vrai serveur.
//
// Rien n'est simulé. Le serveur est celui que la production lance, construit par `pnpm build`, et
// les requêtes sont de vraies requêtes HTTP. Si PostgreSQL est injoignable ou si le serveur ne
// démarre pas, la préparation lève et la suite échoue avec un message qui dit quoi faire.

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import { loadDotEnv } from '@jadwal/db';
import { createTestDatabase, dropTestDatabase } from '@jadwal/db/scripts/test-database.mjs';

loadDotEnv();

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
/**
 * Trois instances, sur trois ports fixes : ces tests ne tournent qu'un fichier à la fois.
 *
 * La **seconde** n'existe que pour une chose — montrer que la limitation de débit est bien
 * partagée, puisque son compteur est une ligne de la base et non un objet en mémoire.
 *
 * La **troisième** est configurée **comme en production** : elle croit avoir un mandataire inverse
 * devant elle. C'est la seule façon d'éprouver pour de vrai qu'un visiteur ne peut pas choisir son
 * adresse en envoyant l'en-tête lui-même (étape 9). Les deux premières restent en prise directe,
 * comme en développement.
 */
const PORTS = [4173, 4174, 4175] as const;

/**
 * Le secret de session des serveurs de test. Il est fourni aux fichiers de test parce qu'il sert
 * aussi de sel aux clés du limiteur de débit (ADR 0032) : sans lui, un test ne pourrait plus
 * retrouver un seau, puisque sa clé n'est plus lisible.
 */
const SECRET = 'secret-de-test-assez-long-pour-ne-pas-etre-refuse';

const servers: ChildProcess[] = [];
let outbox: string | undefined;

async function waitForServer(origin: string, attempts = 60): Promise<void> {
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			const response = await fetch(`${origin}/healthz`);
			if (response.ok) return;
		} catch {
			// Le serveur n'écoute pas encore.
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`Le serveur n'a pas démarré sur ${origin} après ${attempts} tentatives.`);
}

export default async function setup(project: TestProject) {
	const build = join(appDir, 'build', 'index.js');
	if (!existsSync(build)) {
		throw new Error(
			`Serveur non construit (${build} absent). Lancer « pnpm build » avant « pnpm test ».`
		);
	}
	const database = await createTestDatabase();
	outbox = await mkdtemp(join(tmpdir(), 'jadwal-tests-courriels-'));
	const origins = PORTS.map((port) => `http://127.0.0.1:${port}`);
	const logs: string[] = [];

	for (const [index, port] of PORTS.entries()) {
		const child = spawn(process.execPath, [build], {
			cwd: appDir,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: {
				...process.env,
				NODE_ENV: 'production',
				PORT: String(port),
				HOST: '127.0.0.1',
				ORIGIN: origins[index] as string,
				POSTGRES_DB: database,
				MAIL_TRANSPORT: 'file',
				MAIL_OUTBOX_DIR: outbox,
				MAIL_FROM: 'jadwal@example.test',
				BETTER_AUTH_SECRET: SECRET,
				// La page d'essai du widget n'existe que si ce réglage est posé (étape 7, partie A).
				// Elle ne l'est que sur la seconde instance : les deux branches — ouverte et fermée —
				// sont ainsi éprouvées sur un vrai serveur, et non simulées.
				...(index === 1 ? { JADWAL_WIDGET_TEST_ORG: 'widget' } : {}),
				// La troisième instance seulement : adapter-node lit alors `X-Forwarded-For` et prend
				// la valeur à un rang depuis la droite — celle qu'un mandataire vient d'ajouter. Les
				// deux autres n'ont pas cet en-tête déclaré et lèveraient sur toute requête qui ne le
				// porterait pas.
				...(index === 2
					? {
							ADDRESS_HEADER: 'x-forwarded-for',
							XFF_DEPTH: '1',
							JADWAL_TRUSTED_PROXIES: '127.0.0.1/32,::1/128'
						}
					: {})
			}
		});
		child.stdout?.on('data', (chunk: Buffer) => logs.push(chunk.toString()));
		child.stderr?.on('data', (chunk: Buffer) => {
			logs.push(chunk.toString());
			// Une erreur du serveur doit se voir dans la sortie des tests : sans cela, un échec de
			// route n'apparaîtrait que sous la forme d'un 500 sans explication.
			process.stderr.write(chunk.toString());
		});
		child.on('exit', (code) => {
			if (code !== 0 && code !== null) {
				process.stderr.write(`Serveur de test arrêté (code ${code}) :
${logs.join('')}
`);
			}
		});
		servers.push(child);
	}

	try {
		for (const origin of origins) await waitForServer(origin);
	} catch (error) {
		process.stderr.write(logs.join(''));
		throw error;
	}

	const origin = origins[0] as string;
	project.provide('secondOrigin', origins[1] as string);
	project.provide('proxiedOrigin', origins[2] as string);
	project.provide('origin', origin);
	project.provide('outbox', outbox);
	project.provide('authSecret', SECRET);
	project.provide('testDatabase', database);

	return async () => {
		for (const child of servers) child.kill();
		if (outbox) await rm(outbox, { recursive: true, force: true });
		await dropTestDatabase();
	};
}

declare module 'vitest' {
	export interface ProvidedContext {
		origin: string;
		/** La seconde instance, pour prouver que le compteur de débit est partagé. */
		secondOrigin: string;
		/** La troisième, configurée comme en production : elle croit avoir un mandataire devant elle. */
		proxiedOrigin: string;
		outbox: string;
		authSecret: string;
		testDatabase: string;
	}
}

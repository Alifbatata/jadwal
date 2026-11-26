// Un serveur construit, lancé à une horloge posée (`scripts/horloge-figee.mjs`) : elle part de
// l'instant donné et avance au rythme réel. Un module d'aide, pas un fichier de test.
//
// `public-prieres-agenda.test.ts` a écrit ce lancement le premier, pour ses deux serveurs ; les
// fichiers venus après (étape 24) le prennent ici. Les ports se suivent à partir de
// `JADWAL_TEST_PORT_BASE` : la préparation globale prend les trois premiers, `roles-de-base.test.ts`
// le quatrième, `public-prieres-agenda.test.ts` le cinquième et le sixième, `origine.test.ts` le
// septième, `aujourdhui.test.ts` le neuvième et le dixième. Ces fichiers tournent un à la fois.

import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { productionEnvironment } from './environnement-de-production.js';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
/** Le module qui pose l'horloge de Node, chargé par les seuls serveurs lancés d'ici. */
const HORLOGE = pathToFileURL(join(appDir, '..', '..', 'scripts', 'horloge-figee.mjs')).href;

/** Le port de rang `rang` (0 pour le premier) à partir de `JADWAL_TEST_PORT_BASE`. */
export function portDeTest(rang: number): number {
	return Number(process.env['JADWAL_TEST_PORT_BASE'] ?? 4173) + rang;
}

/**
 * Lance le serveur sur `port`, à l'horloge posée à `instant`, et attend qu'il réponde. Rend le
 * processus, que l'appelant arrête, et lève avec le journal du serveur s'il ne démarre pas.
 */
export async function demarrerALHorloge(demande: {
	port: number;
	instant: string;
	testDatabase: string;
	outbox: string;
	authSecret: string;
}): Promise<ChildProcess> {
	const depuis = `http://127.0.0.1:${demande.port}`;
	const journal: string[] = [];
	const serveur = spawn(
		process.execPath,
		['--import', HORLOGE, join(appDir, 'build', 'index.js')],
		{
			cwd: appDir,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: {
				...productionEnvironment(),
				NODE_ENV: 'production',
				PORT: String(demande.port),
				HOST: '127.0.0.1',
				ORIGIN: depuis,
				POSTGRES_DB: demande.testDatabase,
				MAIL_TRANSPORT: 'file',
				MAIL_OUTBOX_DIR: demande.outbox,
				MAIL_FROM: 'jadwal@example.test',
				BETTER_AUTH_SECRET: demande.authSecret,
				JADWAL_HORLOGE_FIGEE: demande.instant
			}
		}
	);
	serveur.stdout?.on('data', (morceau: Buffer) => journal.push(morceau.toString()));
	serveur.stderr?.on('data', (morceau: Buffer) => {
		journal.push(morceau.toString());
		// Une erreur du serveur doit se voir dans la sortie des tests, et non seulement sous la forme
		// d'un 500 sans explication.
		process.stderr.write(morceau.toString());
	});
	for (let essai = 1; essai <= 60; essai += 1) {
		try {
			if ((await fetch(`${depuis}/healthz`)).ok) return serveur;
		} catch {
			// Le serveur n'écoute pas encore.
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	serveur.kill();
	throw new Error(
		`Le serveur à l'horloge posée au ${demande.instant} n'a pas démarré.\n${journal.join('')}`
	);
}

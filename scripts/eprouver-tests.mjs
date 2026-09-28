#!/usr/bin/env node
/**
 * Éprouve `scripts/tests.mjs`, qui lance `pnpm test` et `pnpm test:temps` et en rend le tableau.
 *
 *     pnpm tests:test
 *
 * ## Pourquoi ce test existe
 *
 * Le tableau de `pnpm test` dit, paquet par paquet, combien de fichiers de tests liés au temps
 * (`*.temps.test.ts`) tournent à part, par `pnpm test:temps`. Il les compte sur le disque, sans les
 * lancer. Un tel fichier, posé dans un paquet qui n'a pas de script `test:temps`, ou dont le script
 * `test` ne l'écarte pas, tourne ailleurs que là où le tableau le dit : dans `pnpm test`, ou nulle
 * part. Jusqu'à la relecture de l'étape 19, le tableau l'affirmait quand même, et rendait la main
 * en vert. `tests.mjs` refuse désormais de rien lancer dans ce cas, et nomme le paquet.
 *
 * ## Ce qu'il joue
 *
 * Le vrai `tests.mjs`, en sous-processus, dans un espace de travail jetable : un dépôt git, des
 * paquets pnpm, et un faux vitest qui écrit le relevé qu'un vrai écrirait. Les suites du dépôt ne
 * sont pas lancées, et rien n'est installé. Chaque cas repart d'un espace neuf, effacé ensuite.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TESTS = join(racine, 'scripts', 'tests.mjs');
/** Le même pnpm que le dépôt, par corepack : le champ `packageManager` est recopié. */
const PNPM = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8')).packageManager;

/** Le faux vitest : il écrit un relevé d'un test réussi là où `--outputFile` le demande. */
const FAUX_VITEST = `import { writeFileSync } from 'node:fs';
const sortie = process.argv.find((argument) => argument.startsWith('--outputFile='));
writeFileSync(sortie.slice('--outputFile='.length), JSON.stringify({
	testResults: [{}], numTotalTests: 1, numPassedTests: 1,
	numPendingTests: 0, numTodoTests: 0, numFailedTests: 0
}));
`;

/** Le script `test` d'un paquet rangé comme `apps/web` : il écarte les tests liés au temps. */
const TEST_RANGE =
	'node ../../faux-vitest.mjs --exclude "**/*.temps.test.ts" --outputFile=.vitest-resultats.json';
const TEST_SEUL = 'node ../../faux-vitest.mjs --outputFile=.vitest-resultats.json';
const TEST_TEMPS =
	'node ../../faux-vitest.mjs .temps.test. --outputFile=.vitest-temps-resultats.json';

const echecs = [];
let verifications = 0;

function verifier(quoi, condition, detail = '') {
	verifications += 1;
	if (!condition) echecs.push(detail ? `${quoi} : ${detail}` : quoi);
	process.stdout.write(`  ${condition ? 'ok  ' : 'NON '} ${quoi}${detail ? ` (${detail})` : ''}\n`);
}

/**
 * Un espace de travail jetable, avec ses paquets (`{ nom, scripts, fichiers }`), puis `tests.mjs`
 * lancé dedans avec `argumentsDeTests`. Rend le code de sortie, tout ce qui a été écrit, et les paquets
 * dont le faux vitest a écrit un relevé : ceux que `tests.mjs` a vraiment lancés.
 */
function jouer(paquets, argumentsDeTests = []) {
	const dossier = mkdtempSync(join(tmpdir(), 'jadwal-tests-'));
	try {
		writeFileSync(
			join(dossier, 'package.json'),
			JSON.stringify({ name: 'essai', private: true, type: 'module', packageManager: PNPM })
		);
		writeFileSync(join(dossier, 'pnpm-workspace.yaml'), 'packages:\n  - paquets/*\n');
		writeFileSync(join(dossier, 'faux-vitest.mjs'), FAUX_VITEST);
		for (const paquet of paquets) {
			const chemin = join(dossier, 'paquets', paquet.nom);
			mkdirSync(join(chemin, 'src'), { recursive: true });
			writeFileSync(
				join(chemin, 'package.json'),
				JSON.stringify({ name: `@essai/${paquet.nom}`, private: true, scripts: paquet.scripts })
			);
			for (const fichier of paquet.fichiers) {
				mkdirSync(dirname(join(chemin, fichier)), { recursive: true });
				writeFileSync(join(chemin, fichier), '');
			}
		}
		spawnSync('git', ['init', '--quiet', dossier]);
		const execution = spawnSync(process.execPath, [TESTS, ...argumentsDeTests], {
			cwd: dossier,
			encoding: 'utf8',
			env: {
				...process.env,
				COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
				npm_config_update_notifier: 'false'
			}
		});
		const lances = paquets
			.filter(
				(paquet) =>
					existsSync(join(dossier, 'paquets', paquet.nom, '.vitest-resultats.json')) ||
					existsSync(join(dossier, 'paquets', paquet.nom, '.vitest-temps-resultats.json'))
			)
			.map((paquet) => paquet.nom);
		return {
			code: execution.status,
			sortie: `${execution.stdout ?? ''}${execution.stderr ?? ''}`,
			lances
		};
	} finally {
		rmSync(dossier, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	}
}

/** La ligne du tableau d'un paquet, ses nombres seuls. */
function ligneDuTableau(sortie, nom) {
	const ligne = sortie.split('\n').find((texte) => texte.startsWith(`@essai/${nom} `));
	return ligne?.trim().split(/\s+/).slice(1).join(' ') ?? '(aucune ligne)';
}

// Un paquet rangé comme `apps/web`, avec un fichier lié au temps, et un paquet sans aucun : c'est
// le dépôt d'aujourd'hui. Un fichier sous `node_modules` n'est pas compté.
const RANGE = {
	nom: 'range',
	scripts: { test: TEST_RANGE, 'test:temps': TEST_TEMPS },
	fichiers: ['src/a.test.ts', 'src/b.temps.test.ts']
};
const SANS_TEMPS = {
	nom: 'sans-temps',
	scripts: { test: TEST_SEUL },
	fichiers: ['src/c.test.ts', 'node_modules/dep/d.temps.test.ts']
};
// Un fichier lié au temps dans un paquet qui n'a pas de script `test:temps` : le cas du widget, si
// son test du démarrage était renommé sans rien d'autre.
const SANS_SCRIPT = {
	nom: 'sans-script',
	scripts: { test: TEST_SEUL },
	fichiers: ['src/e.test.ts', 'src/f.temps.test.ts']
};
// Un script `test:temps`, mais un script `test` qui ne les écarte pas : ils tourneraient deux fois.
const SANS_EXCLUSION = {
	nom: 'sans-exclusion',
	scripts: { test: TEST_SEUL, 'test:temps': TEST_TEMPS },
	fichiers: ['src/g.temps.test.ts']
};

process.stdout.write('\nUn espace rangé, comme le dépôt\n');
const range = jouer([RANGE, SANS_TEMPS]);
verifier('pnpm test passe', range.code === 0, `code ${range.code}`);
verifier(
	'il compte à part le fichier lié au temps du paquet rangé, et rien pour l’autre',
	ligneDuTableau(range.sortie, 'range') === '1 1 1 0 0 1' &&
		ligneDuTableau(range.sortie, 'sans-temps') === '1 1 1 0 0 0',
	`range : ${ligneDuTableau(range.sortie, 'range')} ; sans-temps : ${ligneDuTableau(range.sortie, 'sans-temps')}`
);
const rangeTemps = jouer([RANGE, SANS_TEMPS], ['--temps']);
verifier(
	'pnpm test:temps passe, et ne lance que le paquet qui a des tests liés au temps',
	rangeTemps.code === 0 && rangeTemps.lances.join(',') === 'range',
	`code ${rangeTemps.code}, lancés : ${rangeTemps.lances.join(', ') || 'aucun'}`
);

for (const [cas, paquet, attendu] of [
	['un paquet sans script test:temps', SANS_SCRIPT, 'aucun script « test:temps »'],
	['un paquet dont le script test ne les écarte pas', SANS_EXCLUSION, 'ne les écarte pas']
]) {
	process.stdout.write(`\nUn fichier lié au temps dans ${cas}\n`);
	for (const argumentsDeTests of [[], ['--temps']]) {
		const commande = argumentsDeTests.length === 0 ? 'pnpm test' : 'pnpm test:temps';
		const joue = jouer([RANGE, paquet], argumentsDeTests);
		verifier(
			`${commande} refuse, nomme le paquet et dit ce qui manque, sans rien lancer`,
			joue.code === 1 &&
				joue.sortie.includes(`@essai/${paquet.nom}`) &&
				joue.sortie.includes(attendu) &&
				joue.lances.length === 0,
			`code ${joue.code}, lancés : ${joue.lances.join(', ') || 'aucun'}` +
				(joue.sortie.includes(attendu) ? '' : ' ; le manque n’est pas dit')
		);
	}
}

if (echecs.length > 0) {
	process.stderr.write(`\nCe qui a échoué :\n`);
	for (const echec of echecs) process.stderr.write(`  - ${echec}\n`);
	process.exitCode = 1;
} else {
	process.stdout.write(
		`\nLes ${verifications} vérifications passent : aucun test lié au temps ne tourne ailleurs ` +
			`que là où le tableau le dit.\n`
	);
}

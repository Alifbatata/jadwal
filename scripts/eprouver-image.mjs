#!/usr/bin/env node
/**
 * Éprouve l'**image de production** : ce qu'elle contient, et qu'elle sert.
 *
 *     pnpm image:test
 *
 * ## Pourquoi ce test existe
 *
 * `scripts/elaguer-arbre-de-production.mjs` retire de l'arbre déployé ce qu'aucun `import` résolu
 * par Node n'atteint. Il décide par la déclaration, en descendant de `package.json` en
 * `package.json` — et un module chargé par un nom calculé, hors de toute déclaration, lui
 * échapperait. Une image amputée d'un module dont elle a besoin démarre parfois très bien, et tombe
 * la première fois qu'une route rare est demandée.
 *
 * **Alors on ne le croit pas sur parole.** Ce test construit l'image, lève une base à côté, y joue
 * les rôles et les migrations avec les scripts de l'image elle-même, lance le serveur de l'image, et
 * l'interroge — y compris sur les routes qui touchent la base, celles qui rendent du HTML, et celles
 * qui rendent un fichier.
 *
 * Il vérifie aussi ce que l'image **ne doit plus** contenir : aucun outil de construction. C'est la
 * condition qui a permis de passer sous licence MIT (ADR 0043) — une image qui les reprendrait
 * rendrait le fichier des licences tierces faux sans que rien ne se plaigne.
 *
 * ## Ce qu'il lui faut
 *
 * Docker. Rien d'autre : aucun secret, aucune base existante, aucun port fixe. Les mots de passe
 * sont tirés au hasard à chaque exécution et ne sont jamais affichés.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** PostgreSQL, à la version et au digest de `docker-compose.dev.yml` : une seule vérité. */
function imagePostgres() {
	const compose = readFileSync(join(racine, 'docker-compose.dev.yml'), 'utf8');
	const trouve = /image:\s*(postgres:[^\s@]+@sha256:[0-9a-f]{64})/.exec(compose);
	if (!trouve) throw new Error('digest de PostgreSQL introuvable dans docker-compose.dev.yml');
	return trouve[1];
}

/** Ce que l'image ne doit plus porter, et la raison de chacun. */
const INTERDITS = [
	['vite', 'empaqueteur'],
	['vitest', 'cadre de tests'],
	['lightningcss', 'compilateur CSS, et le seul composant MPL-2.0 qui restait'],
	['rolldown', 'empaqueteur'],
	['esbuild', 'compilateur'],
	['typescript', 'compilateur'],
	['drizzle-kit', 'outil de migration en développement'],
	['svelte', 'compilateur de gabarits'],
	['@sveltejs/kit', 'cadre, incorporé au serveur construit'],
	['jsdom', 'navigateur simulé, pour les tests']
];

const marque = randomUUID().slice(0, 8);
const IMAGE = `jadwal-epreuve:${marque}`;
const RESEAU = `jadwal-epreuve-${marque}`;
const BASE = `jadwal-epreuve-db-${marque}`;
const SERVEUR = `jadwal-epreuve-app-${marque}`;

/** Un mot de passe tiré au hasard. Il ne sort jamais d'ici, et il meurt avec le test. */
const motDePasse = () => randomBytes(24).toString('base64url');

const SECRETS = {
	POSTGRES_PASSWORD: motDePasse(),
	JADWAL_DB_OWNER_PASSWORD: motDePasse(),
	JADWAL_DB_APP_PASSWORD: motDePasse(),
	JADWAL_DB_SUPERADMIN_PASSWORD: motDePasse(),
	JADWAL_DB_AUTH_PASSWORD: motDePasse(),
	JADWAL_DB_PUBLIC_PASSWORD: motDePasse(),
	BETTER_AUTH_SECRET: motDePasse()
};

const echecs = [];
let verifications = 0;

function verifier(quoi, condition, detail = '') {
	verifications += 1;
	if (!condition) echecs.push(detail ? `${quoi} : ${detail}` : quoi);
	process.stdout.write(`  ${condition ? 'ok  ' : 'NON '} ${quoi}${detail ? ` (${detail})` : ''}\n`);
}

function docker(args, options = {}) {
	return execFileSync('docker', args, { encoding: 'utf8', ...options });
}

/** Les variables d'environnement, en arguments `--env`. Les valeurs ne passent jamais par un shell. */
function environnement(extra = {}) {
	const toutes = {
		NODE_ENV: 'production',
		POSTGRES_HOST: BASE,
		POSTGRES_PORT: '5432',
		POSTGRES_USER: 'jadwal',
		POSTGRES_DB: 'jadwal',
		ORIGIN: 'http://127.0.0.1:3000',
		// `file` et `smtp` sont les deux seules valeurs. Une troisième fait lever l'application à
		// la première requête, et toutes les routes rendent 500 : mesuré en écrivant ce test.
		MAIL_TRANSPORT: 'file',
		MAIL_OUTBOX_DIR: '/tmp/courriels',
		MAIL_FROM: 'epreuve@example.test',
		MAIL_FROM_NAME: 'jadwal',
		...SECRETS,
		...extra
	};
	return Object.entries(toutes).flatMap(([cle, valeur]) => ['--env', `${cle}=${valeur}`]);
}

function nettoyer() {
	for (const nom of [SERVEUR, BASE]) {
		spawnSync('docker', ['rm', '-f', nom], { stdio: 'ignore' });
	}
	spawnSync('docker', ['network', 'rm', RESEAU], { stdio: 'ignore' });
	spawnSync('docker', ['image', 'rm', '-f', IMAGE], { stdio: 'ignore' });
}

process.on('exit', nettoyer);
process.on('SIGINT', () => process.exit(130));

process.stdout.write(`\nConstruction de l'image\n`);
const construction = spawnSync('docker', ['build', '--tag', IMAGE, '.'], {
	cwd: racine,
	stdio: ['ignore', 'pipe', 'pipe'],
	encoding: 'utf8'
});
if (construction.status !== 0) {
	process.stderr.write(construction.stderr?.slice(-4000) ?? '');
	process.stderr.write('\nL’image ne se construit pas. Rien d’autre n’a été tenté.\n');
	process.exit(1);
}
// L'élagage dit ce qu'il a fait ; c'est la ligne la plus utile de toute la construction.
for (const ligne of (construction.stderr ?? '').split('\n')) {
	if (/gardés|retirés|disque rendu|paquets dans le magasin/.test(ligne)) {
		process.stdout.write(`  ${ligne.replace(/^#\d+\s+\d+\.\d+\s*/, '').trim()}\n`);
	}
}

process.stdout.write(`\nCe que l'image contient\n`);
const magasin = docker([
	'run',
	'--rm',
	'--entrypoint',
	'sh',
	IMAGE,
	'-c',
	'ls /app/node_modules/.pnpm'
])
	.split('\n')
	.map((ligne) => ligne.trim())
	.filter(Boolean);

verifier('le magasin de paquets est lisible', magasin.length > 0, `${magasin.length} entrées`);
for (const [nom, raison] of INTERDITS) {
	const clef = nom.replace('/', '+').replace('@', '@');
	const trouve = magasin.filter((entree) => entree.startsWith(`${clef}@`));
	verifier(`aucun ${nom} (${raison})`, trouve.length === 0, trouve.join(', '));
}

const licences = '/app/LICENCES-TIERCES.md';
const presence = docker([
	'run',
	'--rm',
	'--entrypoint',
	'sh',
	IMAGE,
	'-c',
	`test -s ${licences} && wc -l < ${licences} || echo absent`
]).trim();
verifier('le fichier des licences tierces est livré', presence !== 'absent', `${presence} lignes`);

const licenceOci = docker([
	'image',
	'inspect',
	'--format',
	'{{index .Config.Labels "org.opencontainers.image.licenses"}}',
	IMAGE
]).trim();
verifier('l’étiquette de licence dit MIT', licenceOci === 'MIT', licenceOci || 'absente');

process.stdout.write(`\nL'image mise en marche, comme en production\n`);
docker(['network', 'create', RESEAU], { stdio: 'ignore' });
docker([
	'run',
	'--detach',
	'--name',
	BASE,
	'--network',
	RESEAU,
	'--env',
	'POSTGRES_USER=jadwal',
	'--env',
	`POSTGRES_PASSWORD=${SECRETS.POSTGRES_PASSWORD}`,
	'--env',
	'POSTGRES_DB=jadwal',
	imagePostgres()
]);

/** Attend que la base réponde, sans jamais dormir plus qu'il ne faut. */
function attendreLaBase() {
	for (let essai = 0; essai < 60; essai += 1) {
		const sonde = spawnSync(
			'docker',
			['exec', BASE, 'pg_isready', '-h', '127.0.0.1', '-U', 'jadwal', '-d', 'jadwal'],
			{ stdio: 'ignore' }
		);
		if (sonde.status === 0) return true;
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
	}
	return false;
}
verifier('la base répond', attendreLaBase());

for (const [quoi, script] of [
	['les rôles sont créés', 'bootstrap-roles.mjs'],
	['les migrations passent', 'migrate.mjs']
]) {
	const passage = spawnSync(
		'docker',
		[
			'run',
			'--rm',
			'--network',
			RESEAU,
			...environnement(),
			IMAGE,
			'node',
			`node_modules/@jadwal/db/scripts/${script}`
		],
		{ encoding: 'utf8' }
	);
	const sortie = `${passage.stdout ?? ''}${passage.stderr ?? ''}`.trim().split('\n').pop() ?? '';
	verifier(quoi, passage.status === 0, sortie.slice(0, 120));
}

docker([
	'run',
	'--detach',
	'--name',
	SERVEUR,
	'--network',
	RESEAU,
	'--publish',
	'127.0.0.1:0:3000',
	...environnement(),
	IMAGE
]);

const publie = docker(['port', SERVEUR, '3000']).trim().split('\n')[0] ?? '';
const port = Number(publie.split(':').pop());
verifier('le serveur publie un port', Number.isInteger(port) && port > 0, publie);

/** Interroge une route, en laissant au serveur le temps de se lever. */
async function interroger(chemin) {
	for (let essai = 0; essai < 40; essai += 1) {
		try {
			const reponse = await fetch(`http://127.0.0.1:${port}${chemin}`, { redirect: 'manual' });
			return reponse.status;
		} catch {
			await new Promise((resolue) => setTimeout(resolue, 500));
		}
	}
	return 0;
}

// Une route par famille : la sonde, une page rendue côté serveur, l'API publique, un fichier
// engendré, et une page publique qui interroge la base. Une image amputée tombe sur l'une d'elles.
const ROUTES = [
	['/healthz', 200],
	['/connexion', 200],
	['/api/v1/status', 200],
	['/widget/jadwal-widget.js', 200],
	['/sitemap.xml', 200],
	['/m/inconnue/fr', 404]
];
for (const [chemin, attendu] of ROUTES) {
	const code = await interroger(chemin);
	verifier(`${chemin} rend ${attendu}`, code === attendu, code === attendu ? '' : `rendu ${code}`);
}

// `docker logs` écrit la sortie standard du conteneur sur la sienne, et sa sortie d'erreur sur
// la sienne. Les 500 d'`adapter-node` passent par la seconde : les lire toutes les deux, ou ne
// rien voir d'une panne. Mesuré : le journal ne montrait que « Listening on ».
const sortiesDuServeur = spawnSync('docker', ['logs', SERVEUR], { encoding: 'utf8' });
const journal = `${sortiesDuServeur.stdout ?? ''}${sortiesDuServeur.stderr ?? ''}`;
// Une route qui rend 500 ne dit pas pourquoi ; le journal du conteneur, lui, le dit. Sans ces
// lignes, le test annonce un échec et emporte sa cause avec le conteneur qu'il détruit.
if (echecs.length > 0) {
	process.stdout.write(`\nLes dernières lignes du serveur :\n`);
	for (const ligne of journal.trim().split('\n').slice(-25)) {
		process.stdout.write(`      ${ligne}\n`);
	}
}

const casses = journal
	.split('\n')
	.filter((ligne) => /Cannot find (module|package)|ERR_MODULE_NOT_FOUND/.test(ligne));
verifier(
	'aucun module manquant dans le journal',
	casses.length === 0,
	casses.slice(0, 2).join(' | ')
);

if (echecs.length > 0) {
	process.stderr.write(`\nCe qui a échoué :\n`);
	for (const echec of echecs) process.stderr.write(`  - ${echec}\n`);
	process.exitCode = 1;
} else {
	process.stdout.write(
		`\nLes ${verifications} vérifications passent : l'image ne porte aucun outil de construction, ` +
			`et elle sert.\n`
	);
}

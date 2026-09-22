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
 *
 * La mise en marche elle-même (réseau, base, rôles, migrations, serveur) vit dans
 * `image-en-marche.mjs`, que `eprouver-parcours.mjs` emploie aussi : les deux épreuves lèvent
 * l'image de la même façon.
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { construireImage, docker, MiseEnMarche, racine } from './image-en-marche.mjs';

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
const marche = new MiseEnMarche(IMAGE, 'jadwal-epreuve', marque);
const SERVEUR = marche.serveur;

const echecs = [];
let verifications = 0;

function verifier(quoi, condition, detail = '') {
	verifications += 1;
	if (!condition) echecs.push(detail ? `${quoi} : ${detail}` : quoi);
	process.stdout.write(`  ${condition ? 'ok  ' : 'NON '} ${quoi}${detail ? ` (${detail})` : ''}\n`);
}

function nettoyer() {
	marche.nettoyer();
	spawnSync('docker', ['image', 'rm', '-f', IMAGE], { stdio: 'ignore' });
}

process.on('exit', nettoyer);
process.on('SIGINT', () => process.exit(130));

process.stdout.write(`\nConstruction de l'image\n`);
const construction = construireImage(racine, IMAGE);
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

// Les commandes d'exploitant se lancent depuis l'image, par leur chemin sous `node_modules` : c'est
// la forme que `docs/EXPLOITATION.md` donne à chacune. Une commande que l'image ne porterait pas ne
// se remarquerait que le jour où l'on en a besoin, sur le serveur. Elles arrivent par le champ
// `files` de `@jadwal/db`, que `pnpm deploy` respecte, et l'élagage ne touche pas au paquet : il ne
// retire que des paquets entiers du magasin, et celui-ci est une dépendance du serveur.
const COMMANDES = [
	'retention-hold.mjs',
	'super-admin.mjs',
	'reset-passkeys.mjs',
	'delete-organization.mjs'
];
const scriptsDeLImage = docker([
	'run',
	'--rm',
	'--entrypoint',
	'sh',
	IMAGE,
	'-c',
	'ls /app/node_modules/@jadwal/db/scripts'
])
	.split('\n')
	.map((ligne) => ligne.trim())
	.filter(Boolean);
for (const commande of COMMANDES) {
	verifier(
		`la commande d’exploitant ${commande} est dans l’image`,
		scriptsDeLImage.includes(commande)
	);
}

process.stdout.write(`\nL'image mise en marche, comme en production\n`);
verifier('la base répond', marche.leverLaBase());

for (const [quoi, script] of [
	['les rôles sont créés', 'bootstrap-roles.mjs'],
	['les migrations passent', 'migrate.mjs']
]) {
	const passage = marche.jouer(script);
	verifier(quoi, passage.ok, passage.derniere.slice(0, 120));
}

// Présente ne suffit pas : elle doit démarrer, ses imports se résoudre dans l'arbre élagué, et la
// base répondre. Un identifiant inconnu est le seul appel qui ne change rien, quelle que soit la
// base ; ses effets, eux, sont éprouvés par `packages/db/test/delete-organization.test.ts`.
const suppression = marche.jouer('delete-organization.mjs', ['--slug', 'inconnue']);
verifier(
	'la suppression d’une organisation démarre, et refuse un identifiant inconnu',
	!suppression.ok && suppression.derniere.startsWith('Aucune organisation'),
	suppression.derniere.slice(0, 120)
);

marche.lancerLeServeur('127.0.0.1:0:3000');

const publie = docker(['port', SERVEUR, '3000']).trim().split('\n')[0] ?? '';
const port = Number(publie.split(':').pop());
verifier('le serveur publie un port', Number.isInteger(port) && port > 0, publie);

/** Interroge une route, en laissant au serveur le temps de se lever. Rend le code et le corps. */
async function interroger(chemin) {
	for (let essai = 0; essai < 40; essai += 1) {
		try {
			const reponse = await fetch(`http://127.0.0.1:${port}${chemin}`, { redirect: 'manual' });
			return { code: reponse.status, corps: await reponse.text() };
		} catch {
			await new Promise((resolue) => setTimeout(resolue, 500));
		}
	}
	return { code: 0, corps: '' };
}

// Une route par famille : la sonde, une page rendue côté serveur, l'API publique, un fichier
// engendré, et une page publique qui interroge la base. Une image amputée tombe sur l'une d'elles.
// `/conditions` rend un fichier de `docs/`, que `.dockerignore` écarte tout entier sauf lui.
const ROUTES = [
	['/healthz', 200],
	['/connexion', 200],
	['/conditions', 200],
	['/api/v1/status', 200],
	['/widget/jadwal-widget.js', 200],
	['/sitemap.xml', 200],
	['/m/inconnue/fr', 404]
];
const corps = new Map();
for (const [chemin, attendu] of ROUTES) {
	const { code, corps: texte } = await interroger(chemin);
	corps.set(chemin, texte);
	verifier(`${chemin} rend ${attendu}`, code === attendu, code === attendu ? '' : `rendu ${code}`);
}
// Le titre du document, et non celui de la page : c'est lui qui prouve que le fichier est entré dans
// la construction. Le `<title>` vient du gabarit, il serait là même sans le texte.
verifier(
	'/conditions porte le texte des conditions',
	corps.get('/conditions')?.includes('<h1>Conditions d’utilisation</h1>') === true,
	`${corps.get('/conditions')?.length ?? 0} caractères`
);

// Les deux sorties du conteneur : les 500 d'`adapter-node` passent par celle d'erreur.
const journal = marche.journal();
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

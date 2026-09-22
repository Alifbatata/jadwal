#!/usr/bin/env node
/**
 * Éprouve que le fichier d'environnement arrive **identique** dans le conteneur, quel que soit le
 * lecteur : Docker Compose d'un côté, `docker run --env-file` de l'autre.
 *
 *     pnpm env:test
 *
 * ## Pourquoi ce test existe
 *
 * Le même fichier est lu par deux programmes qui ne lisent pas pareil. `docker run --env-file`
 * prend chaque ligne telle quelle. Docker Compose, lui, **interpole** : `$` y ouvre une référence à
 * une variable, et une référence introuvable devient une chaîne vide, avec un avertissement noyé
 * dans sa sortie et **aucune erreur**.
 *
 * Le conteneur reçoit alors un secret amputé, et le service échoue plus tard, ailleurs, pour une
 * raison qui ne ressemble en rien à la cause. C'est arrivé à la mise en ligne : un mot de passe
 * arrivait tronqué, et aucun courriel ne pouvait partir.
 *
 * `format: raw`, sur `env_file`, dit à Compose de lire le fichier comme `docker run` le lit.
 * Ce test le vérifie plutôt que de le croire — et il tombe quand on l'enlève.
 *
 * ## Ce qu'il joue
 *
 * Un fichier d'environnement qui ressemble à un vrai : des commentaires, des lignes vides, et des
 * valeurs qui portent ce qui casse les analyseurs — `$`, guillemets simples et doubles, barre
 * oblique inverse, `#`, espaces, signe égal. Aucune de ces valeurs n'est un secret : elles sont
 * inventées ici et ne servent qu'à être reconnues.
 *
 * On compare l'empreinte SHA-256 de ce que le conteneur a reçu à celle de ce que le fichier
 * contient. Des empreintes, pas des valeurs : c'est la règle du dépôt, et elle vaut aussi pour des
 * valeurs inventées, parce qu'un test qui affiche des valeurs finit par en afficher une vraie.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const IMAGE = process.env['JADWAL_ALPINE_IMAGE'] ?? 'alpine:3.20';
const PROJET = 'jadwal-epreuve-env';

/**
 * Ce qu'on fait passer. Chaque valeur porte au moins un caractère qui a déjà cassé quelque chose
 * quelque part.
 */
const VALEURS = {
	AVEC_DOLLAR: 'av$ant-apres',
	AVEC_DOLLAR_ACCOLADE: 'debut${milieu}fin',
	AVEC_GUILLEMETS: 'il a dit "oui" et \'non\'',
	AVEC_ANTISLASH: 'chemin\\vers\\quelque-part',
	AVEC_DIESE: 'valeur#pas-un-commentaire',
	AVEC_ESPACES: '  bordee d espaces  ',
	AVEC_EGAL: 'cle=valeur=encore',
	TOUT_A_LA_FOIS: '$a"b\'c\\d#e f=g${h}'
};

const empreinte = (texte) => createHash('sha256').update(texte, 'utf8').digest('hex').slice(0, 16);

const docker = (args, options = {}) =>
	execFileSync('docker', args, { encoding: 'utf8', ...options }).trim();

/** Le fichier d'environnement, avec ce qu'un vrai fichier contient autour des valeurs. */
function fichierEnv() {
	const lignes = [
		'# Un commentaire en tete, comme dans le vrai fichier.',
		'#',
		'# Et une ligne de commentaire qui contient un $dollar, pour voir.',
		''
	];
	for (const [cle, valeur] of Object.entries(VALEURS)) {
		lignes.push(`${cle}=${valeur}`);
		lignes.push('');
	}
	lignes.push('# Un commentaire a la fin.', '');
	return lignes.join('\n');
}

/** Lit les variables telles que le conteneur les a reçues. `env -0` : rien ne se perd. */
function recues(sortie) {
	const vues = {};
	for (const entree of sortie.split('\0')) {
		const coupe = entree.indexOf('=');
		if (coupe < 0) continue;
		vues[entree.slice(0, coupe)] = entree.slice(coupe + 1);
	}
	return vues;
}

const dossier = mkdtempSync(join(tmpdir(), 'jadwal-env-'));
const chemin = join(dossier, 'essai.env');
writeFileSync(chemin, fichierEnv(), 'utf8');

/**
 * Le fichier Compose. `brut` décide si `format: raw` y est : c'est la seule différence entre les
 * deux exécutions, et c'est ce qui rend le test capable de tomber.
 */
function compose(brut) {
	return `name: ${PROJET}
services:
  t:
    image: ${IMAGE}
    entrypoint: ["/usr/bin/env", "-0"]
    env_file:
      - path: ${chemin.replaceAll('\\', '/')}
${brut ? '        format: raw\n' : ''}`;
}

let echecs = [];
let verifications = 0;

function eprouver(brut) {
	const cheminCompose = join(dossier, brut ? 'raw.yml' : 'defaut.yml');
	writeFileSync(cheminCompose, compose(brut), 'utf8');
	const sortie = docker([
		'compose',
		'--file',
		cheminCompose,
		'--progress',
		'quiet',
		'run',
		'--rm',
		'--no-TTY',
		't'
	]);
	return recues(sortie);
}

try {
	process.stdout.write(`Deux lecteurs, un même fichier. Image ${IMAGE}.\n\n`);

	const parRun = recues(docker(['run', '--rm', '--env-file', chemin, IMAGE, '/usr/bin/env', '-0']));
	const parComposeBrut = eprouver(true);
	const parComposeDefaut = eprouver(false);

	process.stdout.write(
		`${'variable'.padEnd(22)} ${'attendu'.padEnd(18)} ${'--env-file'.padEnd(18)} ${'compose raw'.padEnd(18)} compose defaut\n`
	);

	for (const [cle, valeur] of Object.entries(VALEURS)) {
		const attendu = empreinte(valeur);
		const a = parRun[cle] === undefined ? '(absente)' : empreinte(parRun[cle]);
		const b = parComposeBrut[cle] === undefined ? '(absente)' : empreinte(parComposeBrut[cle]);
		const c = parComposeDefaut[cle] === undefined ? '(absente)' : empreinte(parComposeDefaut[cle]);
		process.stdout.write(
			`${cle.padEnd(22)} ${attendu.padEnd(18)} ${a.padEnd(18)} ${b.padEnd(18)} ${c}\n`
		);

		verifications += 2;
		if (a !== attendu) echecs.push(`${cle} : --env-file ne rend pas la valeur du fichier`);
		if (b !== attendu)
			echecs.push(`${cle} : Compose en format raw ne rend pas la valeur du fichier`);
	}

	// Le témoin : sans `format: raw`, au moins une valeur doit être abîmée. Si tout passe même sans,
	// c'est que ce test ne mesure plus rien — et il faut le savoir.
	const abimees = Object.entries(VALEURS).filter(
		([cle, valeur]) => parComposeDefaut[cle] !== valeur
	);
	verifications += 1;
	if (abimees.length === 0) {
		echecs.push(
			'sans format: raw, Compose rend tout intact : ce test ne prouve plus rien, le relire'
		);
	} else {
		process.stdout.write(
			`\nSans « format: raw », ${abimees.length} valeur(s) sur ${Object.keys(VALEURS).length} arrivent abîmées : ` +
				`${abimees.map(([cle]) => cle).join(', ')}.\n`
		);
	}
} finally {
	try {
		docker(['compose', '--project-name', PROJET, 'down', '--remove-orphans'], { stdio: 'pipe' });
	} catch {
		/* rien à défaire */
	}
	rmSync(dossier, { recursive: true, force: true });
}

if (echecs.length > 0) {
	process.stderr.write(`\nCe qui a échoué :\n`);
	for (const echec of echecs) process.stderr.write(`  - ${echec}\n`);
	process.exitCode = 1;
} else {
	process.stdout.write(
		`\nLes ${verifications} vérifications passent : les deux lecteurs rendent le fichier tel quel.\n`
	);
}

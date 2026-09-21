#!/usr/bin/env node
/**
 * Éprouve le refus des dossiers privés : ajoute **de force** un fichier de `PRIVE/`, le commite,
 * demande au crochet ce qu'il en pense, et vérifie qu'il refuse. Ne laisse rien derrière lui.
 *
 *     pnpm prive:test
 *
 * `git add -f` est exactement le geste contre lequel ce contrôle existe : il passe outre
 * `.gitignore` sans un avertissement, et le fichier devient suivi comme n'importe quel autre. Un
 * coffre chiffré poussé sur un dépôt public ne se dépublie pas.
 *
 * Elle ne contacte **aucun serveur** : le commit d'essai est créé en local, le contrôle est appelé
 * dans son mode `--pousse` avec la même ligne que git lui donnerait, puis le commit est défait.
 *
 * Elle défait **seulement ce qu'elle a fait** : `reset --soft` puis `restore --staged`, jamais
 * `reset --hard`. Cette commande se lance au milieu d'un travail en cours.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const git = (args, options = {}) =>
	execFileSync('git', args, { encoding: 'utf8', ...options }).trim();

const racine = git(['rev-parse', '--show-toplevel']);

/** Un fichier qui existe vraiment dans PRIVE/, pour que l'épreuve porte sur le cas réel. */
const TEMOIN = 'PRIVE/LISEZMOI.md';
if (!existsSync(join(racine, TEMOIN))) {
	process.stderr.write(
		`\n  Épreuve impossible : ${TEMOIN} n'existe pas.\n\n` +
			`  Ce dossier est celui de l'exploitant de cette instance ; sur un clone qui n'en a pas,\n` +
			`  il n'y a rien à éprouver et rien à protéger.\n\n`
	);
	process.exit(1);
}

const depart = git(['rev-parse', 'HEAD']);
let commite = false;
let refuse = false;

try {
	// `--force` : le geste même qu'on veut voir refuser plus loin.
	git(['add', '--force', TEMOIN], { cwd: racine });
	git(['commit', '--no-verify', '-m', 'test: ceci ne doit jamais atteindre le dépôt public'], {
		cwd: racine
	});
	commite = true;

	process.stdout.write(`« git add -f ${TEMOIN} » puis commit. Ce que le crochet en dit :\n\n`);
	const tete = git(['rev-parse', 'HEAD']);
	try {
		execFileSync('node', [join(racine, 'scripts', 'controle-dossiers-prives.mjs'), '--pousse'], {
			cwd: racine,
			input: `refs/heads/main ${tete} refs/heads/main ${depart}\n`,
			stdio: ['pipe', 'inherit', 'inherit']
		});
	} catch {
		refuse = true;
	}
} finally {
	if (commite) {
		git(['reset', '--soft', depart], { cwd: racine, stdio: 'pipe' });
		try {
			git(['restore', '--staged', TEMOIN], { cwd: racine, stdio: 'pipe' });
		} catch {
			/* le fichier n'était plus indexé : rien à défaire */
		}
	}
}

if (refuse) {
	process.stdout.write('\nLa poussée a été refusée : le contrôle fonctionne.\n');
} else {
	process.stderr.write(
		'\nLE CONTRÔLE A LAISSÉ PASSER un fichier de PRIVE/. Vérifiez\n' +
			'scripts/controle-dossiers-prives.mjs et .githooks/pre-push.\n'
	);
	process.exitCode = 1;
}

#!/usr/bin/env node
/**
 * Éprouve le garde-fou anti-fuite : pose un terme interdit dans un commit, demande au contrôle ce
 * qu'il en pense, et vérifie qu'il refuse. Ne laisse rien derrière lui, même en cas d'échec.
 *
 * Un garde-fou qu'on n'a jamais vu refuser quelque chose n'est pas un garde-fou, c'est une
 * intention. Cette commande est là pour qu'on puisse le voir refuser, à volonté.
 *
 *     pnpm fuites:test
 *
 * Elle ne contacte **aucun serveur** : le commit d'essai est créé en local, le contrôle est appelé
 * dans son mode `--pousse` avec la même ligne que git lui donnerait, puis le commit est défait. Rien
 * ne sort du poste, et c'est le but — on éprouve un refus de publication sans rien publier.
 *
 * Le terme interdit n'est **jamais affiché** : il est lu depuis la liste privée et écrit directement
 * dans le fichier témoin. L'afficher ici reviendrait à le publier dans une console, ce que le
 * contrôle lui-même se refuse à faire.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const git = (args, options = {}) =>
	execFileSync('git', args, { encoding: 'utf8', ...options }).trim();

const racine = git(['rev-parse', '--show-toplevel']);
const temoin = join(racine, 'faux-terme-interdit-de-test.md');

function cheminDeLaListe() {
	try {
		const configure = git(['config', '--get', 'jadwal.termes-interdits']);
		if (configure) return configure;
	} catch {
		// La clé n'existe pas.
	}
	return process.env['JADWAL_TERMES_INTERDITS'] ?? '';
}

const liste = cheminDeLaListe();
if (!liste || !existsSync(liste)) {
	process.stderr.write(
		`\n  Épreuve impossible : la liste des termes interdits est introuvable.\n\n` +
			`  Elle vit hors de ce dépôt. Une fois :\n\n` +
			`      git config jadwal.termes-interdits <chemin absolu>\n\n`
	);
	process.exit(1);
}

/** Le premier terme de la liste, sans son éventuelle clause d'autorisation. */
const premier = readFileSync(liste, 'utf8')
	.split(/\r?\n/)
	.map((ligne) => ligne.trim())
	.filter((ligne) => ligne && !ligne.startsWith('#'))
	.map((ligne) => (ligne.split('|')[0] ?? '').trim())
	.find(Boolean);

if (!premier) {
	process.stderr.write(`\n  Épreuve impossible : ${liste} ne contient aucun terme.\n\n`);
	process.exit(1);
}

const depart = git(['rev-parse', 'HEAD']);
let commite = false;
let refuse = false;

try {
	writeFileSync(temoin, `# Épreuve du garde-fou\n\nCe fichier parle de ${premier}.\n`);
	// `--no-verify` : le crochet pre-commit cherche des secrets, pas du vocabulaire d'infrastructure.
	// Le faire tourner ici n'apprendrait rien et ralentirait l'épreuve.
	git(['add', '--force', temoin], { cwd: racine });
	git(['commit', '--no-verify', '-m', 'test: ceci ne doit jamais atteindre le dépôt public'], {
		cwd: racine
	});
	commite = true;

	process.stdout.write('Commit d’essai créé. Ce que le garde-fou en dit :\n\n');
	const tete = git(['rev-parse', 'HEAD']);
	try {
		// La ligne exacte que git passe à un crochet pre-push : ref locale, sha local, ref distante,
		// sha distant. Le contrôle ne relit donc que ce commit-ci.
		execFileSync('node', [join(racine, 'scripts', 'controle-fuites.mjs'), '--pousse'], {
			cwd: racine,
			input: `refs/heads/main ${tete} refs/heads/main ${depart}\n`,
			stdio: ['pipe', 'inherit', 'inherit']
		});
	} catch {
		refuse = true;
	}
} finally {
	// `reset --soft` puis `restore --staged`, et surtout **pas** `reset --hard` : cette commande se
	// lance au milieu d'un travail en cours, et un `--hard` emporterait tout ce qui n'est pas encore
	// commité. Elle ne doit défaire que ce qu'elle a fait.
	if (commite) {
		git(['reset', '--soft', depart], { cwd: racine, stdio: 'pipe' });
		try {
			git(['restore', '--staged', temoin], { cwd: racine, stdio: 'pipe' });
		} catch {
			/* le fichier n'était plus indexé : rien à défaire */
		}
	}
	if (existsSync(temoin)) rmSync(temoin, { force: true });
}

if (refuse) {
	process.stdout.write('\nLa poussée a été refusée : le garde-fou fonctionne.\n');
} else {
	process.stderr.write(
		'\nLE CONTRÔLE A LAISSÉ PASSER. Ce dépôt est public, et rien ne relit ce qui en part.\n' +
			'Vérifiez `git config jadwal.termes-interdits` et le contenu de la liste.\n'
	);
	process.exitCode = 1;
}

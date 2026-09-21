#!/usr/bin/env node
/**
 * Refuse toute poussée qui emporterait un fichier de `PRIVE/` ou de `A_LIVRER/`.
 *
 *     node scripts/controle-dossiers-prives.mjs --pousse   lit l'entrée du crochet pre-push
 *     node scripts/controle-dossiers-prives.mjs --arbre    relit ce que git suit aujourd'hui
 *
 * ## Pourquoi un second garde-fou, alors que `.gitignore` les couvre déjà
 *
 * Parce que `.gitignore` se contourne d'une option. `git add -f PRIVE/coffre/vault.yml` passe outre
 * sans un avertissement, et le fichier est alors suivi comme n'importe quel autre : plus rien ne
 * l'arrête. C'est une commande qu'on tape à une heure du matin pour « juste tester quelque chose »,
 * et un coffre chiffré poussé sur un dépôt public ne se dépublie pas — il reste dans les caches et
 * les copies que ce dépôt ne contrôle pas.
 *
 * Ce contrôle-ci ne regarde pas `.gitignore`. Il regarde ce que les commits contiennent vraiment.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne relit pas le contenu des fichiers : `scripts/controle-fuites.mjs` s'en charge, avec la liste
 * des termes interdits. Celui-ci est plus bête et plus sûr : **deux chemins, jamais**.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Les deux dossiers qui ne quittent jamais le poste. Voir `PRIVE/LISEZMOI.md` et `CLAUDE.md`. */
const INTERDITS = ['PRIVE/', 'A_LIVRER/'];

const git = (args, options = {}) =>
	execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });

function interdit(chemin) {
	return INTERDITS.some((dossier) => chemin === dossier.slice(0, -1) || chemin.startsWith(dossier));
}

/** Les commits qui partent vraiment, d'après ce que git donne au crochet sur l'entrée standard. */
function commitsAPousser() {
	const plages = [];
	for (const ligne of readFileSync(0, 'utf8').split('\n')) {
		const [, local, , distant] = ligne.trim().split(/\s+/);
		if (!local || /^0+$/.test(local)) continue; // suppression de branche : rien à relire
		plages.push(/^0+$/.test(distant ?? '') ? local : `${distant}..${local}`);
	}
	if (plages.length === 0) return { commits: [], plages };
	return {
		commits: git(['rev-list', ...plages])
			.split('\n')
			.filter(Boolean),
		plages
	};
}

const modes = new Set(process.argv.slice(2));
if (modes.size === 0) modes.add('--arbre');

const trouvailles = [];
let surface;

if (modes.has('--pousse')) {
	const { commits, plages } = commitsAPousser();
	surface = plages.length === 0 ? 'rien à pousser' : `${commits.length} commit(s) à pousser`;
	for (const commit of commits) {
		// `ls-tree -r --name-only` : l'arbre complet du commit, pas seulement ce qu'il change. Un
		// fichier entré il y a trois commits et jamais retiré part aussi.
		for (const chemin of git(['ls-tree', '-r', '--name-only', commit]).split('\n')) {
			if (chemin && interdit(chemin)) trouvailles.push(`${commit.slice(0, 10)}:${chemin}`);
		}
	}
} else {
	surface = "l'arbre suivi par git";
	for (const chemin of git(['ls-files']).split('\n')) {
		if (chemin && interdit(chemin)) trouvailles.push(chemin);
	}
}

if (trouvailles.length === 0) {
	process.stdout.write(`Dossiers privés : rien de PRIVE/ ni de A_LIVRER/ dans ${surface}.\n`);
	process.exit(0);
}

process.stderr.write(
	`\n  Refusé : ${trouvailles.length} fichier(s) de PRIVE/ ou A_LIVRER/ dans ${surface}.\n\n`
);
for (const t of [...new Set(trouvailles)]) process.stderr.write(`      ${t}\n`);
process.stderr.write(
	`\n  Ces deux dossiers ne quittent jamais ce poste. \`.gitignore\` les couvre, mais \`git add -f\`\n` +
		`  passe outre : c'est pour ce cas-là que ce contrôle existe.\n\n` +
		`  Retirer le fichier de l'index et refaire le commit :\n\n` +
		`      git rm --cached -r PRIVE A_LIVRER\n` +
		`      git commit --amend\n\n`
);
process.exit(1);

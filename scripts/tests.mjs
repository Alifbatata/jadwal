#!/usr/bin/env node
/**
 * Lance la suite de tests de tous les paquets, puis en rend compte **par paquet**.
 *
 *     pnpm test
 *
 * Pourquoi cette commande existe plutôt qu'un simple `pnpm -r run test` : chaque paquet annonce son
 * propre total, et ces totaux défilent entremêlés puisque les paquets tournent en parallèle. Il est
 * arrivé qu'un résumé de séance additionne trois paquets sur quatre et annonce 495 tests là où il y
 * en avait 1 163 — sans que rien n'ait été perdu. Un seul tableau, à la fin, rend ce compte faux
 * impossible à écrire.
 *
 * La règle qu'elle fait respecter : **aucun test sauté en silence.** Un test qui a besoin de
 * PostgreSQL ou de Docker doit échouer quand ils manquent, jamais se retirer discrètement du
 * décompte. Le nombre de tests sautés est donc affiché à chaque exécution, et un test sauté rend la
 * main en rouge — sauf si `JADWAL_TESTS_SAUTES_TOLERES` vaut `1`, ce qui doit rester un geste
 * conscient et temporaire.
 *
 * En Node, et non en script shell, parce que la même commande doit marcher sous Windows et sous
 * Linux (voir CLAUDE.md).
 */
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** Le nom du fichier que chaque paquet écrit, et que celui-ci relit. Voir les scripts `test`. */
const RESULTATS = '.vitest-resultats.json';

const racine = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

/** Sous Windows, git rend « C:/… » et pnpm « C:\… » : sans cela, la racine passerait pour un paquet. */
function normaliser(chemin) {
	return chemin.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
}

/** Les paquets de l'espace de travail qui ont un script `test`, tels que pnpm les connaît. */
function paquets() {
	// Une chaîne unique plutôt qu'un tableau d'arguments : sous Windows, `pnpm` est un script `.cmd`
	// que Node refuse de lancer sans interpréteur, et un tableau passé avec `shell` est concaténé
	// sans échappement — Node le déconseille. Rien ici ne vient de l'extérieur, et rien n'est
	// interpolé dans la commande.
	const brut = execSync('pnpm list --recursive --depth -1 --json', {
		cwd: racine,
		encoding: 'utf8'
	});
	return JSON.parse(brut)
		.filter((projet) => projet.path && normaliser(projet.path) !== normaliser(racine))
		.map((projet) => ({
			nom: projet.name,
			chemin: projet.path,
			fichier: join(projet.path, RESULTATS)
		}))
		.filter((projet) => {
			const manifeste = JSON.parse(readFileSync(join(projet.chemin, 'package.json'), 'utf8'));
			return Boolean(manifeste.scripts?.test);
		})
		.sort((a, b) => a.nom.localeCompare(b.nom));
}

/** Ce qu'un paquet a vraiment joué, ou `null` s'il n'a pas été lancé du tout. */
function releve(projet) {
	if (!existsSync(projet.fichier)) return null;
	const rapport = JSON.parse(readFileSync(projet.fichier, 'utf8'));
	return {
		fichiers: rapport.testResults?.length ?? 0,
		total: rapport.numTotalTests ?? 0,
		reussis: rapport.numPassedTests ?? 0,
		// `pending` est le sauté de vitest (`skip`), `todo` le test annoncé et pas écrit. Les deux
		// sont des tests qui n'ont rien éprouvé : on les compte ensemble.
		sautes: (rapport.numPendingTests ?? 0) + (rapport.numTodoTests ?? 0),
		echoues: rapport.numFailedTests ?? 0
	};
}

function ligne(colonnes, largeurs) {
	return colonnes
		.map((valeur, index) =>
			index === 0
				? String(valeur).padEnd(largeurs[index])
				: String(valeur).padStart(largeurs[index])
		)
		.join('  ');
}

const projets = paquets();
if (projets.length === 0) {
	process.stderr.write('Aucun paquet avec un script « test » : rien à lancer.\n');
	process.exit(1);
}

// Repartir de zéro : un fichier de résultats d'hier ferait croire qu'un paquet a tourné.
for (const projet of projets) rmSync(projet.fichier, { force: true });

const execution = spawnSync('pnpm --recursive --if-present run test', {
	cwd: racine,
	stdio: 'inherit',
	shell: true
});

const releves = projets.map((projet) => ({ ...projet, resultat: releve(projet) }));
const joues = releves.filter((projet) => projet.resultat !== null);
const absents = releves.filter((projet) => projet.resultat === null);

const totaux = joues.reduce(
	(somme, projet) => ({
		fichiers: somme.fichiers + projet.resultat.fichiers,
		total: somme.total + projet.resultat.total,
		reussis: somme.reussis + projet.resultat.reussis,
		sautes: somme.sautes + projet.resultat.sautes,
		echoues: somme.echoues + projet.resultat.echoues
	}),
	{ fichiers: 0, total: 0, reussis: 0, sautes: 0, echoues: 0 }
);

const entetes = ['paquet', 'fichiers', 'tests', 'réussis', 'sautés', 'échoués'];
const lignes = [
	...joues.map((projet) => [
		projet.nom,
		projet.resultat.fichiers,
		projet.resultat.total,
		projet.resultat.reussis,
		projet.resultat.sautes,
		projet.resultat.echoues
	]),
	...absents.map((projet) => [projet.nom, '—', 'non lancé', '—', '—', '—'])
];
const largeurs = entetes.map((entete, index) =>
	Math.max(entete.length, ...lignes.map((valeurs) => String(valeurs[index]).length))
);

process.stdout.write('\n');
process.stdout.write(`${ligne(entetes, largeurs)}\n`);
process.stdout.write(`${largeurs.map((largeur) => '─'.repeat(largeur)).join('  ')}\n`);
for (const valeurs of lignes) process.stdout.write(`${ligne(valeurs, largeurs)}\n`);
process.stdout.write(`${largeurs.map((largeur) => '─'.repeat(largeur)).join('  ')}\n`);
process.stdout.write(
	`${ligne(
		['total', totaux.fichiers, totaux.total, totaux.reussis, totaux.sautes, totaux.echoues],
		largeurs
	)}\n\n`
);

const tolere = process.env['JADWAL_TESTS_SAUTES_TOLERES'] === '1';
const problemes = [];
if (execution.status !== 0) problemes.push(`la suite est sortie avec le code ${execution.status}`);
for (const projet of absents) {
	problemes.push(
		`${projet.nom} n'a pas été lancé (aucun ${RESULTATS}) : un paquet précédent a dû échouer`
	);
}
if (totaux.sautes > 0 && !tolere) {
	problemes.push(
		`${totaux.sautes} test(s) sauté(s). Un test qui a besoin de PostgreSQL ou de Docker doit ` +
			`échouer quand ils manquent, pas disparaître du décompte. Pour passer outre sciemment : ` +
			`JADWAL_TESTS_SAUTES_TOLERES=1`
	);
}
if (totaux.sautes > 0 && tolere) {
	process.stdout.write(
		`${totaux.sautes} test(s) sauté(s), tolérés par JADWAL_TESTS_SAUTES_TOLERES=1.\n\n`
	);
}

if (problemes.length > 0) {
	for (const probleme of problemes) process.stderr.write(`  ✗ ${probleme}\n`);
	process.stderr.write('\n');
	process.exit(1);
}
process.stdout.write(`${totaux.total} tests, tous réussis, aucun sauté.\n`);

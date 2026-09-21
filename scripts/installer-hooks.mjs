#!/usr/bin/env node
/**
 * Installe le contrôle de secrets du dépôt : le crochet `pre-commit`, et l'outil qu'il appelle.
 *
 * En Node, et non en script shell, parce que la même commande doit marcher sous Windows et sous
 * Linux (voir CLAUDE.md). Rien n'est installé globalement : le binaire vit dans le cache de
 * l'utilisateur, et son chemin est enregistré dans la configuration git de ce dépôt seul.
 *
 *     pnpm hooks
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Version épinglée, et empreinte de chaque archive officielle. Une release réécrite en amont
 * fait échouer l'installation au lieu de poser un binaire inattendu. Pour relever la version :
 * changer les quatre lignes ensemble, depuis
 * https://github.com/gitleaks/gitleaks/releases/download/vX.Y.Z/gitleaks_X.Y.Z_checksums.txt
 */
const VERSION = '8.30.1';
const ARCHIVES = {
	'win32-x64': {
		nom: `gitleaks_${VERSION}_windows_x64.zip`,
		sha256: 'd29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e',
		binaire: 'gitleaks.exe'
	},
	'linux-x64': {
		nom: `gitleaks_${VERSION}_linux_x64.tar.gz`,
		sha256: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
		binaire: 'gitleaks'
	},
	'darwin-arm64': {
		nom: `gitleaks_${VERSION}_darwin_arm64.tar.gz`,
		sha256: null, // à relever le jour où quelqu'un développe sur ce matériel
		binaire: 'gitleaks'
	}
};

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function cacheDir() {
	const base =
		process.platform === 'win32'
			? (process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'))
			: (process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'));
	return join(base, 'gitleaks', `v${VERSION}`);
}

function dejaInstalle(chemin) {
	if (!existsSync(chemin)) return false;
	try {
		return execFileSync(chemin, ['version'], { encoding: 'utf8' }).trim() === VERSION;
	} catch {
		return false;
	}
}

async function telecharger(archive, destination) {
	const url = `https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/${archive.nom}`;
	process.stdout.write(`Téléchargement de ${archive.nom}…\n`);
	const reponse = await fetch(url, { redirect: 'follow' });
	if (!reponse.ok) throw new Error(`${url} a répondu ${reponse.status}`);
	const octets = Buffer.from(await reponse.arrayBuffer());

	const obtenue = createHash('sha256').update(octets).digest('hex');
	if (obtenue !== archive.sha256) {
		throw new Error(
			`Empreinte inattendue pour ${archive.nom}.\n  attendue : ${archive.sha256}\n  obtenue  : ${obtenue}\n` +
				`L'archive n'est pas celle qui a été vérifiée : rien n'est installé.`
		);
	}
	writeFileSync(destination, octets);
	process.stdout.write(`Empreinte conforme (${obtenue.slice(0, 16)}…).\n`);
}

function extraire(archivePath, dossier, archive) {
	if (archive.nom.endsWith('.zip')) {
		// `tar` sait lire un zip sur Windows 10+ comme sur Linux : pas de dépendance de plus.
		execFileSync('tar', ['-xf', archivePath, '-C', dossier, archive.binaire], {
			stdio: 'inherit'
		});
	} else {
		execFileSync('tar', ['-xzf', archivePath, '-C', dossier, archive.binaire], {
			stdio: 'inherit'
		});
	}
}

async function main() {
	const cle = `${process.platform}-${process.arch}`;
	const archive = ARCHIVES[cle];
	if (!archive?.sha256) {
		throw new Error(
			`Aucune empreinte relevée pour ${cle}. Ajoutez-la dans scripts/installer-hooks.mjs ` +
				`depuis le fichier checksums de la release, puis relancez.`
		);
	}

	const dossier = cacheDir();
	const binaire = join(dossier, archive.binaire);

	if (dejaInstalle(binaire)) {
		process.stdout.write(`gitleaks ${VERSION} déjà présent : ${binaire}\n`);
	} else {
		mkdirSync(dossier, { recursive: true });
		const archivePath = join(tmpdir(), archive.nom);
		await telecharger(archive, archivePath);
		extraire(archivePath, dossier, archive);
		rmSync(archivePath, { force: true });
		chmodSync(binaire, 0o755);
		const version = execFileSync(binaire, ['version'], { encoding: 'utf8' }).trim();
		if (version !== VERSION)
			throw new Error(`Le binaire extrait annonce ${version}, pas ${VERSION}.`);
		process.stdout.write(`gitleaks ${VERSION} installé : ${binaire}\n`);
	}

	git('config', 'jadwal.gitleaks', binaire);
	git('config', 'core.hooksPath', '.githooks');

	// Git sous Windows ignore le bit d'exécution, mais pas sous Linux : on le pose des deux côtés.
	const crochet = join(git('rev-parse', '--show-toplevel'), '.githooks', 'pre-commit');
	if (existsSync(crochet)) chmodSync(crochet, 0o755);

	process.stdout.write(
		`\ncore.hooksPath = .githooks\n` +
			`jadwal.gitleaks = ${binaire}\n\n` +
			`Le crochet pre-commit refusera désormais tout commit qui contient un secret.\n` +
			`Pour l'éprouver : voir scripts/eprouver-controle-secrets.mjs.\n`
	);
}

await main().catch((erreur) => {
	process.stderr.write(`\n${erreur.message}\n\n`);
	process.exitCode = 1;
});

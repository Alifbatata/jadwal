#!/usr/bin/env node
/**
 * Le garde-fou : refuse de laisser partir vers le dépôt public un texte qui parle de la machine.
 *
 * `gitleaks` cherche ce qui *ressemble* à un secret. Ce contrôle-ci cherche ce qui *est* interdit
 * ici : l'adresse du serveur, son nom, les autres services qu'il héberge, ses comptes, ses chemins.
 * Rien de tout cela n'a la forme d'un secret — une adresse IP est un nombre, un nom de service est
 * un mot — et rien de tout cela n'a sa place dans un dépôt public qui ne parle que de jadwal.
 *
 *     node scripts/controle-fuites.mjs --arbre        ce que git suit aujourd'hui
 *     node scripts/controle-fuites.mjs --historique   tous les commits de tous les refs
 *     node scripts/controle-fuites.mjs --tout         les deux
 *     node scripts/controle-fuites.mjs --pousse       lit l'entrée du crochet pre-push
 *
 * **La liste des termes n'est pas dans ce dépôt, et n'y sera jamais.** Elle vit dans le dépôt privé
 * de l'exploitation ; ce fichier n'en connaît aucun. Son chemin se donne une fois :
 *
 *     git config jadwal.termes-interdits <chemin absolu>
 *
 * ou, à défaut, par la variable d'environnement `JADWAL_TERMES_INTERDITS`. Sans liste, le contrôle
 * **refuse** plutôt que de laisser passer : un garde-fou qui s'efface quand il n'a pas ses données
 * ne garde rien, exactement comme le crochet de secrets refuse sans gitleaks.
 *
 * Ce qui est trouvé n'est **jamais recopié** dans la sortie : le contrôle affiche le fichier, la
 * ligne et le **numéro** du terme dans la liste. Autrement, refuser une fuite la publierait dans un
 * journal de console, puis dans un rapport, puis dans un cache.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const git = (args, options = {}) =>
	execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...options });

/** `git grep` sort 1 quand il ne trouve rien : ce n'est pas une erreur. */
function grep(args) {
	try {
		return git(['grep', ...args]);
	} catch (erreur) {
		if (erreur.status === 1) return '';
		throw erreur;
	}
}

function cheminDeLaListe() {
	let configure = '';
	try {
		configure = git(['config', '--get', 'jadwal.termes-interdits']).trim();
	} catch {
		// `git config --get` sort 1 quand la clé n'existe pas.
	}
	return configure || process.env['JADWAL_TERMES_INTERDITS'] || '';
}

/** Un terme, son rang dans la liste, et les chemins où il a le droit d'apparaître. */
function lireListe(chemin) {
	const termes = [];
	for (const brut of readFileSync(chemin, 'utf8').split(/\r?\n/)) {
		const ligne = brut.trim();
		if (!ligne || ligne.startsWith('#')) continue;
		const [terme, autorises] = ligne.split('|');
		const texte = terme.trim();
		if (!texte) continue;
		termes.push({
			rang: termes.length + 1,
			texte,
			minuscule: texte.toLowerCase(),
			autorises: (autorises ?? '')
				.split(',')
				.map((valeur) => valeur.trim())
				.filter(Boolean)
		});
	}
	return termes;
}

/**
 * Les trouvailles d'un `git grep`, dépouillées de ce qu'elles ont trouvé.
 *
 * `git grep -o` rend `chemin:ligne:trouvaille`, ou `commit:chemin:ligne:trouvaille` quand on lui
 * donne des commits. La trouvaille sert ici à retrouver le rang du terme, puis elle est jetée.
 */
function depouiller(sortie, termes, avecCommit) {
	const trouvailles = [];
	for (const ligne of sortie.split('\n')) {
		if (!ligne) continue;
		const morceaux = ligne.split(':');
		const commit = avecCommit ? morceaux.shift() : null;
		const trouvaille = morceaux.pop() ?? '';
		const numero = morceaux.pop() ?? '';
		const chemin = morceaux.join(':');
		const terme = termes.find((candidat) => candidat.minuscule === trouvaille.toLowerCase());
		if (!terme) continue;
		if (terme.autorises.includes(chemin)) continue;
		trouvailles.push({ commit, chemin, numero, rang: terme.rang });
	}
	return trouvailles;
}

/** Les commits que git grep peut relire, par paquets : une ligne de commande a une longueur. */
function parPaquets(elements, taille) {
	const paquets = [];
	for (let debut = 0; debut < elements.length; debut += taille) {
		paquets.push(elements.slice(debut, debut + taille));
	}
	return paquets;
}

function messagesDeCommit(revisions, termes) {
	if (revisions.length === 0) return [];
	const sortie = git(['log', '--no-walk=unsorted', '--format=%H%x1f%B%x1e', '--stdin'], {
		input: `${revisions.join('\n')}\n`
	});
	const trouvailles = [];
	for (const bloc of sortie.split('\x1e')) {
		const [commit, message] = bloc.split('\x1f');
		if (!commit || message === undefined) continue;
		const minuscule = message.toLowerCase();
		for (const terme of termes) {
			// Un message de commit n'a pas de chemin : aucune autorisation ne s'y applique.
			if (minuscule.includes(terme.minuscule)) {
				trouvailles.push({
					commit: commit.trim(),
					chemin: '(message de commit)',
					numero: '—',
					rang: terme.rang
				});
			}
		}
	}
	return trouvailles;
}

function revisionsAPousser() {
	const entree = readFileSync(0, 'utf8');
	const revisions = [];
	for (const ligne of entree.split('\n')) {
		const [, local, , distant] = ligne.trim().split(/\s+/);
		if (!local || /^0+$/.test(local)) continue; // suppression de branche : rien à relire
		revisions.push(/^0+$/.test(distant ?? '') ? local : `${distant}..${local}`);
	}
	return revisions;
}

function commitsDe(plages) {
	if (plages.length === 0) return [];
	const sortie = git(['rev-list', ...plages]);
	return sortie.split('\n').filter(Boolean);
}

function main() {
	const modes = new Set(process.argv.slice(2));
	if (modes.size === 0) modes.add('--tout');
	if (modes.has('--tout')) {
		modes.add('--arbre');
		modes.add('--historique');
	}

	const chemin = cheminDeLaListe();
	if (!chemin || !existsSync(chemin)) {
		process.stderr.write(
			`\n  Contrôle refusé : la liste des termes interdits est introuvable.\n\n` +
				(chemin ? `  Chemin configuré : ${chemin}\n\n` : '') +
				`  Elle vit hors de ce dépôt, dans le dépôt privé de l'exploitation. Une fois :\n\n` +
				`      git config jadwal.termes-interdits <chemin absolu vers termes-interdits.txt>\n\n` +
				`  Ce dépôt est public : sans cette liste, rien ne relit ce qui en part.\n\n`
		);
		return 1;
	}

	const termes = lireListe(chemin);
	if (termes.length === 0) {
		process.stderr.write(`\n  Contrôle refusé : ${chemin} ne contient aucun terme.\n\n`);
		return 1;
	}

	// `git grep -f` veut un fichier de motifs, et rien d'autre que des motifs : la liste, elle, porte
	// des commentaires et des autorisations. Le fichier temporaire disparaît avec ce processus.
	const dossier = mkdtempSync(join(tmpdir(), 'jadwal-fuites-'));
	const motifs = join(dossier, 'motifs.txt');
	writeFileSync(motifs, `${termes.map((terme) => terme.texte).join('\n')}\n`);

	const trouvailles = [];
	const surfaces = [];
	try {
		if (modes.has('--arbre')) {
			surfaces.push("l'arbre de travail");
			trouvailles.push(
				...depouiller(grep(['-I', '-i', '-n', '-o', '-F', '-f', motifs, '--', '.']), termes, false)
			);
		}

		let revisions = [];
		if (modes.has('--pousse')) {
			const plages = revisionsAPousser();
			revisions = commitsDe(plages);
			surfaces.push(
				plages.length === 0
					? 'rien à pousser'
					: `${revisions.length} commit(s) à pousser (${plages.join(', ')})`
			);
		} else if (modes.has('--historique')) {
			revisions = git(['rev-list', '--all']).split('\n').filter(Boolean);
			surfaces.push(`${revisions.length} commit(s) de l'historique`);
		}

		for (const paquet of parPaquets(revisions, 50)) {
			trouvailles.push(
				...depouiller(
					grep(['-I', '-i', '-n', '-o', '-F', '-f', motifs, ...paquet, '--', '.']),
					termes,
					true
				)
			);
		}
		trouvailles.push(...messagesDeCommit(revisions, termes));
	} finally {
		rmSync(dossier, { recursive: true, force: true });
	}

	const surface = surfaces.join(' et ');
	if (trouvailles.length === 0) {
		process.stdout.write(
			`Garde-fou : ${termes.length} termes cherchés dans ${surface}. Aucune trouvaille.\n`
		);
		return 0;
	}

	process.stderr.write(
		`\n  Refusé : ${trouvailles.length} trouvaille(s) dans ${surface}.\n\n` +
			`  Les termes ne sont pas recopiés ici — les afficher, ce serait les publier. Le numéro\n` +
			`  renvoie à la ligne correspondante de ${chemin}.\n\n`
	);
	for (const trouvaille of trouvailles) {
		const ou = trouvaille.commit
			? `${trouvaille.commit.slice(0, 10)}:${trouvaille.chemin}`
			: trouvaille.chemin;
		process.stderr.write(`      ${ou}:${trouvaille.numero}  →  terme n°${trouvaille.rang}\n`);
	}
	process.stderr.write(
		`\n  Une fuite poussée ne se rattrape pas : elle subsiste dans des journaux et des caches\n` +
			`  que ce dépôt ne contrôle pas. Réécrire le texte, pas seulement remplacer le mot.\n\n`
	);
	return 1;
}

process.exitCode = main();

#!/usr/bin/env node
/**
 * Éprouve le journal du site : **la vraie configuration**, jouée par un vrai Caddy, dans un
 * conteneur jetable. Une requête porteuse de secrets est envoyée, et la ligne écrite est relue.
 *
 *     pnpm caddy:test
 *
 * ## Pourquoi un conteneur plutôt qu'un test unitaire
 *
 * Un journal d'accès mal filtré ne se voit pas à la relecture : `format filter` est un module de
 * Caddy, ses champs se désignent par un chemin (`request>headers>Cookie`), et une faute de frappe
 * dans ce chemin ne produit **aucune erreur** — le filtre ne s'applique simplement à rien, et le
 * secret part dans le fichier. Seule une ligne écrite par Caddy lui-même prouve quelque chose.
 *
 * ## Ce qu'il joue
 *
 * Le bloc `log { … }` est lu **dans le fichier de site livré**, pas recopié ici : le jour où
 * quelqu'un l'affaiblit, ce test tombe. Il est posé dans un site jetable qui répond « ok » et pose
 * un faux cookie de session, puis une requête est envoyée depuis l'intérieur du conteneur avec :
 *
 *   - un jeton de lien magique dans la requête (`?token=…`) ;
 *   - le même jeton dans l'en-tête `Referer`, parce qu'un navigateur le renvoie après la redirection ;
 *   - un cookie de session ;
 *   - un en-tête `Authorization` ;
 *   - un `X-Forwarded-For` portant une adresse IPv4 publique et une adresse IPv6.
 *
 * Et l'on vérifie qu'aucun des quatre secrets n'est dans le fichier, que les adresses y sont
 * tronquées, et que le chemin demandé, lui, y est resté : un journal qui ne dit plus rien n'est pas
 * un journal filtré, c'est un journal supprimé.
 *
 * ## L'image
 *
 * `caddy:2.6.2` par défaut, parce que c'est la version en service sur le serveur visé : un filtre
 * qui marche sur la version courante et pas sur celle-là ne protégerait rien. `JADWAL_CADDY_IMAGE`
 * permet d'en éprouver une autre.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const IMAGE = process.env['JADWAL_CADDY_IMAGE'] ?? 'caddy:2.6.2';
const CONTENEUR = 'jadwal-epreuve-journal';

/** Le fichier de site livré. Le domaine ne sert qu'à le trouver et à nommer son journal. */
const DOMAINE = process.env['JADWAL_DOMAINE'] ?? 'jadwal.voltia.ch';

/**
 * Les quatre secrets de l'épreuve. Ce sont des chaînes inventées ici, jamais des vraies : elles
 * n'ont besoin que d'être reconnaissables dans un fichier.
 */
const SECRETS = {
	jeton: 'JETON-DE-LIEN-MAGIQUE-4f2a9c',
	session: 'JETON-DE-SESSION-8b71de',
	porteur: 'JETON-PORTEUR-1c0e55',
	chemin: 'JETON-DANS-LE-CHEMIN-3e6a04',
	// Le jeton du Referer est le même que celui de la requête : c'est le cas réel.
	get referer() {
		return this.jeton;
	}
};

/** L'adresse du visiteur, telle qu'un mandataire la transmettrait. */
const IPV4 = '203.0.113.45';
const IPV6 = '2001:db8:abcd:1234::1';
/** Ce qu'elles doivent devenir : /24 et /48. */
const IPV4_TRONQUEE = '203.0.113.0';
const IPV6_TRONQUEE = '2001:db8:abcd::';

const docker = (args, options = {}) =>
	execFileSync('docker', args, { encoding: 'utf8', ...options }).trim();

/**
 * Extrait le bloc `log { … }` du fichier de site, accolades appariées. On ne se contente pas d'une
 * expression régulière jusqu'à la première `}` : le bloc en contient d'autres.
 */
function blocJournal(source) {
	const debut = source.search(/^\tlog \{$/m);
	if (debut < 0) throw new Error(`Aucun bloc « log { » dans le fichier de site.`);
	let profondeur = 0;
	for (let i = debut; i < source.length; i += 1) {
		if (source[i] === '{') profondeur += 1;
		else if (source[i] === '}') {
			profondeur -= 1;
			if (profondeur === 0) return source.slice(debut, i + 1);
		}
	}
	throw new Error('Le bloc « log » ne se referme pas.');
}

/** Le chemin du journal, tel que le bloc le déclare. */
function fichierJournal(bloc) {
	const trouve = /output file (\S+)/.exec(bloc);
	if (!trouve) throw new Error('Le bloc « log » n’écrit pas dans un fichier.');
	return trouve[1];
}

function nettoyer() {
	try {
		docker(['rm', '--force', CONTENEUR], { stdio: 'pipe' });
	} catch {
		/* le conteneur n'existait pas */
	}
}

const racine = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const site = readFileSync(join(racine, 'infra', 'caddy', `${DOMAINE}.caddy`), 'utf8');
const bloc = blocJournal(site);
const journal = fichierJournal(bloc);

// Le site jetable : il répond, il pose un cookie de session, et il journalise **avec le bloc livré**.
const caddyfile = `{
	auto_https off
	admin off
}

:80 {
	header Set-Cookie "better-auth.session_token=${SECRETS.session}; Path=/; HttpOnly"
	respond "ok"

${bloc}
}
`;

const dossier = mkdtempSync(join(tmpdir(), 'jadwal-journal-'));
const chemin = join(dossier, 'Caddyfile');
writeFileSync(chemin, caddyfile);

let echecs = [];
let verifications = 0;
let brut;

try {
	nettoyer();
	process.stdout.write(
		`Caddy ${IMAGE}, conteneur jetable, avec le bloc « log » de ${DOMAINE}.\n\n`
	);

	// `docker create` puis `docker cp` plutôt qu'un montage : un montage Windows donne le bit
	// d'exécution à tout et des droits que Caddy refuse, et le contournement coûte plus cher que la
	// copie.
	docker([
		'create',
		'--name',
		CONTENEUR,
		IMAGE,
		'caddy',
		'run',
		'--adapter',
		'caddyfile',
		'--config',
		'/etc/caddy/Caddyfile'
	]);
	docker(['cp', chemin, `${CONTENEUR}:/etc/caddy/Caddyfile`]);
	docker(['start', CONTENEUR]);

	// Attendre que Caddy écoute, sans dormir à l'aveugle.
	let pret = false;
	for (let essai = 0; essai < 50 && !pret; essai += 1) {
		try {
			docker(['exec', CONTENEUR, 'wget', '-q', '-O', '/dev/null', 'http://127.0.0.1/'], {
				stdio: 'pipe'
			});
			pret = true;
		} catch {
			// Une attente synchrone, sans dépendance : le script reste linéaire et lisible.
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
		}
	}
	if (!pret) {
		process.stderr.write(docker(['logs', CONTENEUR]) + '\n');
		throw new Error(`Caddy n’a pas répondu dans le conteneur.`);
	}

	// La requête porteuse de secrets. `--header` de busybox wget, une fois par en-tête.
	const url = `http://127.0.0.1/api/auth/magic-link/verify?token=${SECRETS.jeton}&callbackURL=/organisations`;
	docker([
		'exec',
		CONTENEUR,
		'wget',
		'-q',
		'-O',
		'/dev/null',
		'--header',
		`Cookie: better-auth.session_token=${SECRETS.session}`,
		'--header',
		`Authorization: Bearer ${SECRETS.porteur}`,
		'--header',
		`Referer: https://${DOMAINE}/api/auth/magic-link/verify?token=${SECRETS.referer}`,
		'--header',
		`X-Forwarded-For: ${IPV4}, ${IPV6}`,
		url
	]);

	// La seconde forme : le jeton **dans le chemin**. Better Auth monte `/reset-password/<jeton>`
	// quelle que soit la configuration, et un filtre de requête ne le verrait pas passer.
	docker([
		'exec',
		CONTENEUR,
		'wget',
		'-q',
		'-O',
		'/dev/null',
		`http://127.0.0.1/api/auth/reset-password/${SECRETS.chemin}`
	]);

	brut = docker(['exec', CONTENEUR, 'cat', journal]);
	const lignes = brut
		.split('\n')
		.filter((l) => l.trim().length > 0)
		.map((l) => JSON.parse(l));
	const ligne = lignes.find((l) => String(l.request?.uri ?? '').includes('magic-link/verify'));
	if (!ligne) {
		throw new Error(
			`Aucune ligne de journal pour la requête envoyée. ${lignes.length} ligne(s) lue(s).`
		);
	}

	process.stdout.write('La ligne écrite par Caddy :\n\n');
	process.stdout.write(JSON.stringify(ligne, null, 1) + '\n\n');

	const verifier = (nom, condition) => {
		verifications += 1;
		if (!condition) echecs.push(nom);
	};

	for (const [quoi, valeur] of Object.entries({
		'le jeton du lien magique': SECRETS.jeton,
		'le jeton de session': SECRETS.session,
		'le jeton porteur': SECRETS.porteur,
		'le jeton porté par le chemin': SECRETS.chemin
	})) {
		verifier(`${quoi} est absent du fichier`, !brut.includes(valeur));
	}

	const parChemin = lignes.find((l) => String(l.request?.uri ?? '').includes('/reset-password/'));
	verifier(
		`la requête au jeton dans le chemin est bien journalisée`,
		parChemin !== undefined && String(parChemin.request.uri).includes('REDACTED')
	);

	verifier(
		`l’adresse du visiteur est tronquée (remote_ip)`,
		typeof ligne.request?.remote_ip === 'string' && /\.0$|::$/.test(ligne.request.remote_ip)
	);

	const xff = String(ligne.request?.headers?.['X-Forwarded-For'] ?? '');
	verifier(`X-Forwarded-For ne porte plus l’adresse IPv4 entière`, !xff.includes(IPV4));
	verifier(`X-Forwarded-For ne porte plus l’adresse IPv6 entière`, !xff.includes(IPV6));
	verifier(`X-Forwarded-For porte l’IPv4 tronquée en /24`, xff.includes(IPV4_TRONQUEE));
	verifier(`X-Forwarded-For porte l’IPv6 tronquée en /48`, xff.includes(IPV6_TRONQUEE));

	verifier(
		`le chemin demandé est toujours journalisé`,
		String(ligne.request?.uri ?? '').includes('/api/auth/magic-link/verify')
	);
	verifier(`le code de réponse est toujours journalisé`, typeof ligne.status === 'number');

	// ---------------------------------------------------------------------------------------------
	// La seconde moitié : la coupe quotidienne, jouée par **le vrai script**, pendant que Caddy tient
	// le fichier ouvert. C'est le seul moment où l'on peut savoir ce qu'il advient de sa position
	// d'écriture, et c'est ce qui a disqualifié `logrotate --copytruncate` (ADR 0039).
	// ---------------------------------------------------------------------------------------------
	process.stdout.write('La coupe quotidienne, jouée par jadwal-journal-caddy.sh :\n\n');

	// Les scripts sont écrits pour un serveur Debian ; l'image de Caddy est une Alpine. On y pose
	// donc bash et les outils GNU, le temps du conteneur.
	docker(
		['exec', CONTENEUR, 'apk', 'add', '--no-cache', 'bash', 'coreutils', 'findutils', 'grep'],
		{
			stdio: 'pipe'
		}
	);
	docker([
		'exec',
		CONTENEUR,
		'mkdir',
		'-p',
		'/opt/jadwal/scripts',
		'/etc/jadwal',
		'/var/lib/jadwal'
	]);
	for (const script of ['jadwal-commun.sh', 'jadwal-journal-caddy.sh']) {
		docker(['cp', join(racine, 'infra', 'scripts', script), `${CONTENEUR}:/opt/jadwal/scripts/`]);
	}
	docker(['exec', CONTENEUR, 'chmod', '0755', '/opt/jadwal/scripts/jadwal-journal-caddy.sh']);
	// Le fichier d'environnement du serveur, réduit à la seule clé que la tâche y lit. Aucun secret.
	docker([
		'exec',
		CONTENEUR,
		'sh',
		'-c',
		`printf 'JADWAL_JOURNAL_CADDY=%s\\n' '${journal}' > /etc/jadwal/jadwal.env`
	]);
	// Une archive d'il y a vingt jours, pour voir la rétention mordre.
	const vieille = `${journal}.2026-09-01T000000Z`;
	docker([
		'exec',
		CONTENEUR,
		'sh',
		'-c',
		`echo vieux > ${vieille} && touch -d '20 days ago' ${vieille}`
	]);

	const lignesAvant = brut.split('\n').filter((l) => l.trim().length > 0).length;
	const coupe = docker(['exec', CONTENEUR, '/opt/jadwal/scripts/jadwal-journal-caddy.sh']);
	process.stdout.write(coupe + '\n\n');

	docker(['exec', CONTENEUR, 'wget', '-q', '-O', '/dev/null', 'http://127.0.0.1/apres-la-coupe']);
	const apres = docker(['exec', CONTENEUR, 'cat', journal]);
	const utiles = apres.split('\n').filter((l) => l.trim().length > 0);

	verifier(`après la coupe, aucun octet nul dans le journal`, !apres.includes('\u0000'));
	verifier(
		`après la coupe, le journal ne porte plus que ce qui a suivi`,
		utiles.length === 1 && utiles[0].includes('/apres-la-coupe')
	);
	verifier(
		`après la coupe, ce qui reste est toujours du JSON par ligne`,
		utiles.every((l) => {
			try {
				JSON.parse(l);
				return true;
			} catch {
				return false;
			}
		})
	);

	const archives = docker([
		'exec',
		CONTENEUR,
		'sh',
		'-c',
		`ls -1 ${journal}.*Z 2>/dev/null || true`
	])
		.split('\n')
		.filter((l) => l.trim().length > 0);
	verifier(`la coupe a laissé une archive datée, et une seule`, archives.length === 1);
	verifier(`l’archive de vingt jours a été effacée`, !archives.includes(vieille));

	if (archives.length === 1) {
		const archive = docker(['exec', CONTENEUR, 'cat', archives[0]]);
		const gardees = archive.split('\n').filter((l) => l.trim().length > 0);
		verifier(
			`l’archive porte les ${lignesAvant} lignes du journal, sans ligne vide`,
			gardees.length === lignesAvant
		);
		verifier(
			`l’archive ne porte toujours aucun secret`,
			!Object.values(SECRETS).some((valeur) => archive.includes(valeur))
		);
	}
} finally {
	nettoyer();
	rmSync(dossier, { recursive: true, force: true });
}

if (echecs.length > 0) {
	process.stderr.write(`\nCe qui a échoué :\n`);
	for (const echec of echecs) process.stderr.write(`  - ${echec}\n`);
	process.stderr.write(
		`\nLe journal du site laisse passer ce qu’il ne devrait pas. Corriger le bloc « log » de\n` +
			`infra/caddy/${DOMAINE}.caddy, puis relancer.\n`
	);
	process.exitCode = 1;
} else {
	process.stdout.write(
		`Les ${verifications} vérifications passent : aucun secret dans le fichier, adresses tronquées, chemin gardé.\n`
	);
}

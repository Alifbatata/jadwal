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
 * Puis une requête sur `/healthz`, qui doit être **servie** et **absente du journal** : c'est la
 * sonde, 576 fois par jour, et `log_skip` la garde dehors. Les deux moitiés comptent — un `/healthz`
 * absent du journal parce que la requête n'est jamais arrivée ne prouverait rien.
 *
 * Et l'on vérifie qu'aucun des quatre secrets n'est dans le fichier, que les adresses y sont
 * tronquées, et que le chemin demandé, lui, y est resté : un journal qui ne dit plus rien n'est pas
 * un journal filtré, c'est un journal supprimé.
 *
 * ## La borne des quatorze jours
 *
 * Les conditions d'utilisation promettent qu'aucune ligne du journal ne vit plus de quatorze jours.
 * La coupe de chaque nuit est donc jouée une seconde fois, sur des morceaux datés par `touch -d`
 * juste avant et juste après la limite, et sur un morceau que **Caddy a vraiment roulé** : ceux-là
 * aussi doivent partir à temps, et Caddy ne les efface pas de lui-même tant qu'il ne roule pas de
 * nouveau. Le calcul des pires cas est refait avant, à partir de la minuterie livrée.
 *
 * ## L'image
 *
 * `caddy:2.11.4` par défaut, parce que c'est la version en service sur le serveur visé : un filtre
 * qui marche sur la version courante et pas sur celle-là ne protégerait rien. `JADWAL_CADDY_IMAGE`
 * permet d'en éprouver une autre — mais pas en deçà de 2.8.0, où `log_skip` s'appelait `skip_log`
 * et où Caddy refuse le fichier entier plutôt que d'ignorer la directive.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const IMAGE = process.env['JADWAL_CADDY_IMAGE'] ?? 'caddy:2.11.4';
const CONTENEUR = 'jadwal-epreuve-journal';

/** Le fichier de site livré. Le domaine ne sert qu'à le trouver et à nommer son journal. */
const DOMAINE = process.env['JADWAL_DOMAINE'] ?? 'jadwal.voltia.ch';

/**
 * La durée promise par `docs/CONDITIONS.md`, et le seuil que `jadwal-journal-caddy.sh` doit en
 * tirer : un morceau part quand sa dernière écriture a plus de (jours - 2) jours moins douze heures,
 * soit onze jours et demi. Le calcul est dans l'en-tête du script, et il est refait plus bas.
 */
const JOURS = 14;
const SEUIL = (JOURS - 2) * 24 * 60 - 12 * 60;
const MINUTES_PAR_JOUR = 24 * 60;

/** Une durée de systemd en minutes, arrondie au-dessus : `5m`, `1min`, `30s`, `2h`. */
function enMinutes(duree) {
	const trouve = /^(\d+)\s*(s|sec|m|min|h)$/.exec(duree.trim());
	if (!trouve) throw new Error(`Durée de systemd que ce test ne sait pas lire : ${duree}`);
	const nombre = Number(trouve[1]);
	if (trouve[2] === 'h') return nombre * 60;
	if (trouve[2] === 's' || trouve[2] === 'sec') return Math.ceil(nombre / 60);
	return nombre;
}

/**
 * Le retard le plus grand d'un passage sur son heure : le délai aléatoire, plus la précision que
 * systemd s'accorde (une minute quand la minuterie ne dit rien). Lu dans la minuterie livrée, pour
 * que ce test tombe le jour où quelqu'un allonge le délai sans refaire le calcul.
 */
function retardDeLaMinuterie(minuterie) {
	if (!/^OnCalendar=\*-\*-\* \d\d:\d\d:\d\d UTC$/m.test(minuterie)) {
		throw new Error('La minuterie de la coupe ne passe plus une fois par nuit, en UTC.');
	}
	const valeur = (cle, defaut) => new RegExp(`^${cle}=(.+)$`, 'm').exec(minuterie)?.[1] ?? defaut;
	return enMinutes(valeur('RandomizedDelaySec', '0s')) + enMinutes(valeur('AccuracySec', '1min'));
}

/**
 * Le calcul des pires cas. Un passage par nuit, à l'heure dite plus un retard de 0 à `retard`
 * minutes, essayé minute par minute. Un morceau porte les lignes écrites entre le passage d'avant
 * et sa dernière écriture : à la coupe même pour une archive de la coupe, n'importe quand dans la
 * journée pour un morceau que Caddy a roulé. Il part au premier passage où sa dernière écriture a
 * plus de `seuil` minutes, et les retards sont choisis pour le faire durer le plus longtemps.
 *
 * Rend la vie la plus longue de la plus vieille ligne d'un morceau, en minutes.
 */
function pireDesCas(retard, seuil) {
	let plusLongue = 0;
	for (let avant = 0; avant <= retard; avant += 1) {
		const passageAvant = -MINUTES_PAR_JOUR + avant;
		for (let coupe = 0; coupe <= retard; coupe += 1) {
			for (let ecriture = passageAvant + 1; ecriture <= coupe; ecriture += 1) {
				// Le passage où le morceau part forcément : même sans retard, il a passé le seuil.
				// Avant celui-là, un retard nul suffit à le garder une nuit de plus.
				let nuit = 1;
				while (nuit * MINUTES_PAR_JOUR - ecriture <= seuil) nuit += 1;
				const depart = nuit * MINUTES_PAR_JOUR + retard;
				plusLongue = Math.max(plusLongue, depart - passageAvant);
			}
		}
	}
	return plusLongue;
}

/** `18726` → `13 j 0 h 06`. */
function duree(minutes) {
	const jours = Math.floor(minutes / MINUTES_PAR_JOUR);
	const heures = Math.floor((minutes % MINUTES_PAR_JOUR) / 60);
	return `${jours} j ${heures} h ${String(minutes % 60).padStart(2, '0')}`;
}

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

/**
 * Les directives `log_skip` du fichier de site, lues **dans le fichier livré** pour la même raison
 * que le bloc `log` : recopier ici ce qu'on prétend éprouver ne prouverait que la copie.
 */
function lignesLogSkip(source) {
	return source
		.split(/\r?\n/)
		.filter((l) => /^\tlog_skip\b/.test(l))
		.join('\n');
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

/** Une attente synchrone, sans dépendance : le script reste linéaire et lisible. */
function patienter(millisecondes) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, millisecondes);
}

/** Attendre que Caddy écoute, sans dormir à l'aveugle. */
function attendreCaddy() {
	for (let essai = 0; essai < 50; essai += 1) {
		try {
			docker(['exec', CONTENEUR, 'wget', '-q', '-O', '/dev/null', 'http://127.0.0.1/'], {
				stdio: 'pipe'
			});
			return;
		} catch {
			patienter(100);
		}
	}
	process.stderr.write(docker(['logs', CONTENEUR]) + '\n');
	throw new Error(`Caddy n’a pas répondu dans le conteneur.`);
}

const racine = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const site = readFileSync(join(racine, 'infra', 'caddy', `${DOMAINE}.caddy`), 'utf8');
const bloc = blocJournal(site);
const sauts = lignesLogSkip(site);
const journal = fichierJournal(bloc);
if (!sauts.includes('/healthz')) {
	throw new Error('Le fichier de site ne garde plus /healthz hors du journal (log_skip).');
}

// Le site jetable : il répond, il pose un cookie de session, et il journalise **avec le bloc livré**.
const caddyfile = `{
	auto_https off
	admin off
}

:80 {
	header Set-Cookie "better-auth.session_token=${SECRETS.session}; Path=/; HttpOnly"
	respond "ok"

${sauts}

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

	attendreCaddy();

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

	// La sonde. On lit sa **réponse** : sans cela, un `/healthz` absent du journal parce que la
	// requête n'est jamais partie passerait pour un filtre qui marche.
	const reponseSonde = docker([
		'exec',
		CONTENEUR,
		'wget',
		'-q',
		'-O',
		'-',
		'http://127.0.0.1/healthz'
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

	verifier(`la sonde est bien servie : /healthz répond`, reponseSonde === 'ok');
	verifier(
		`et elle ne va pas au journal : aucune ligne pour /healthz`,
		!lignes.some((l) => String(l.request?.uri ?? '') === '/healthz')
	);

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

	// ---------------------------------------------------------------------------------------------
	// La borne des quatorze jours (`docs/CONDITIONS.md`). D'abord le calcul des pires cas, à partir
	// de la minuterie livrée ; puis la coupe, jouée une seconde fois sur des morceaux datés juste
	// avant et juste après la limite, et sur un morceau que Caddy a vraiment roulé.
	// ---------------------------------------------------------------------------------------------
	process.stdout.write('La borne des quatorze jours :\n\n');

	const retard = retardDeLaMinuterie(
		readFileSync(join(racine, 'infra', 'systemd', 'jadwal-journal-caddy.timer'), 'utf8')
	);
	const plusLongue = pireDesCas(retard, SEUIL);
	process.stdout.write(
		`  Seuil d'effacement : ${SEUIL} minutes (${duree(SEUIL)}). Retard d'un passage sur son ` +
			`heure : ${retard} minutes au plus.\n` +
			`  Au pire, la plus vieille ligne d'un morceau vit ${duree(plusLongue)}.\n\n`
	);
	verifier(
		`au pire des retards de la minuterie, aucune ligne ne vit plus de ${JOURS} jours`,
		plusLongue <= JOURS * MINUTES_PAR_JOUR
	);

	// Un vrai roulement de Caddy. La coupe écrase au lieu de vider : le fichier courant garde sa
	// taille, atteint `roll_size` un jour ou l'autre, et Caddy le roule. On l'y amène d'un coup en
	// ajoutant des lignes vides, puis en redémarrant Caddy, qui reprend la taille du fichier à
	// l'ouverture et roule à la première écriture.
	const dossierJournal = journal.slice(0, journal.lastIndexOf('/'));
	const nomJournal = journal.slice(journal.lastIndexOf('/') + 1);
	const prefixe = nomJournal.includes('.')
		? nomJournal.slice(0, nomJournal.lastIndexOf('.'))
		: nomJournal;
	docker([
		'exec',
		CONTENEUR,
		'sh',
		'-c',
		`head -c 11534336 /dev/zero | tr '\\0' '\\n' >> ${journal}`
	]);
	docker(['restart', CONTENEUR]);
	attendreCaddy();
	let roules = [];
	for (let essai = 0; essai < 50; essai += 1) {
		roules = docker([
			'exec',
			CONTENEUR,
			'sh',
			'-c',
			`ls -1 ${dossierJournal}/${prefixe}-* 2>/dev/null || true`
		])
			.split('\n')
			.filter((l) => l.trim().length > 0);
		if (roules.some((nom) => nom.endsWith('.gz'))) break;
		patienter(100);
	}
	const roule = roules.find((nom) => nom.endsWith('.gz')) ?? roules[0];
	verifier(`Caddy a roulé le journal : ${roule ?? 'aucun morceau roulé'}`, roule !== undefined);
	process.stdout.write(`  Morceau roulé par Caddy : ${roule ?? '(aucun)'}\n\n`);

	// Les morceaux, datés par rapport à l'horloge du conteneur, celle que `find` lira.
	const maintenant = Number(docker(['exec', CONTENEUR, 'date', '+%s']));
	const iso = (age) => new Date((maintenant - age * 60) * 1000).toISOString();
	const nomDeCoupe = (age) =>
		`${journal}.${iso(age).slice(0, 10)}T${iso(age).slice(11, 19).replaceAll(':', '')}Z`;
	const nomDeCaddy = (dossier, debut, age) =>
		`${dossier}/${debut}-${iso(age).slice(0, 10)}T${iso(age).slice(11, 19).replaceAll(':', '-')}.000-size.log.gz`;

	const cas = [
		{
			// Coupée il y a onze nuits, et aussi vieille que les retards le permettent : elle
			// porte encore des lignes de moins de treize jours, qui peuvent rester une nuit de plus.
			quoi: `une archive coupée il y a onze nuits, au plus vieux`,
			chemin: nomDeCoupe(11 * MINUTES_PAR_JOUR + retard + 1),
			age: 11 * MINUTES_PAR_JOUR + retard + 1,
			part: false
		},
		{
			quoi: `une archive juste avant le seuil`,
			chemin: nomDeCoupe(SEUIL - 5),
			age: SEUIL - 5,
			part: false
		},
		{
			quoi: `une archive juste après le seuil`,
			chemin: nomDeCoupe(SEUIL + 5),
			age: SEUIL + 5,
			part: true
		},
		{
			// Coupée il y a douze nuits, et aussi jeune que les retards le permettent. Sa plus
			// vieille ligne a déjà presque treize jours : gardée cette nuit, l'archive partirait la
			// suivante, et cette ligne pourrait alors avoir vécu quatorze jours et quelques minutes.
			quoi: `une archive coupée il y a douze nuits, au plus jeune`,
			chemin: nomDeCoupe(12 * MINUTES_PAR_JOUR - retard - 1),
			age: 12 * MINUTES_PAR_JOUR - retard - 1,
			part: true
		},
		{
			quoi: `le morceau roulé par Caddy, juste après le seuil`,
			chemin: roule ?? `${dossierJournal}/${prefixe}-introuvable`,
			age: SEUIL + 5,
			part: true
		},
		{
			quoi: `un morceau roulé par Caddy, juste avant le seuil`,
			chemin: nomDeCaddy(dossierJournal, prefixe, SEUIL - 5),
			age: SEUIL - 5,
			part: false,
			copie: roule
		},
		{
			// Le serveur peut porter d'autres sites, dont le journal serait rangé au même endroit.
			quoi: `l'archive d'un autre site, de trente jours`,
			chemin: `${dossierJournal}/autre-site.log.2026-08-01T002000Z`,
			age: 30 * MINUTES_PAR_JOUR,
			part: false
		},
		{
			quoi: `un morceau roulé du journal d'un autre site, de trente jours`,
			chemin: nomDeCaddy(dossierJournal, 'autre-site', 30 * MINUTES_PAR_JOUR),
			age: 30 * MINUTES_PAR_JOUR,
			part: false
		}
	];

	for (const { chemin, age, copie } of cas) {
		const creer = copie ? `cp '${copie}' '${chemin}'` : `echo borne > '${chemin}'`;
		docker([
			'exec',
			CONTENEUR,
			'sh',
			'-c',
			`{ [ -e '${chemin}' ] || ${creer}; } && touch -d @${maintenant - age * 60} '${chemin}'`
		]);
	}

	const secondeCoupe = docker(['exec', CONTENEUR, '/opt/jadwal/scripts/jadwal-journal-caddy.sh']);
	process.stdout.write(secondeCoupe + '\n\n');

	const restants = docker(['exec', CONTENEUR, 'ls', '-1', dossierJournal])
		.split('\n')
		.filter((l) => l.trim().length > 0)
		.map((nom) => `${dossierJournal}/${nom}`);
	for (const { quoi, chemin, age, part } of cas) {
		const reste = restants.includes(chemin);
		verifier(`${quoi} (${duree(age)}) ${part ? 'part' : 'reste'}`, part ? !reste : reste);
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
			`infra/caddy/${DOMAINE}.caddy, ou infra/scripts/jadwal-journal-caddy.sh pour la durée,\n` +
			`puis relancer.\n`
	);
	process.exitCode = 1;
} else {
	process.stdout.write(
		`Les ${verifications} vérifications passent : aucun secret dans le fichier, adresses tronquées, chemin gardé, ` +
			`et aucune ligne gardée plus de ${JOURS} jours.\n`
	);
}

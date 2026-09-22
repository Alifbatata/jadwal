#!/usr/bin/env node
/**
 * Éprouve la décision de la veille sur une tâche périodique : quand se tait-elle, quand alerte-t-elle.
 *
 *     pnpm veille:test
 *
 * ## Pourquoi ce test existe
 *
 * Le soir de la mise en ligne, trois alertes sont parties une demi-heure après l'installation, pour
 * trois tâches dont la minuterie ne s'était tout simplement pas encore déclenchée. Les alertes
 * étaient exactes et inutiles. Une alerte inutile ne coûte pas rien : elle apprend à ne plus lire
 * les alertes, et c'est la seule chose qu'une veille ne doit jamais faire.
 *
 * La règle est maintenant : **on ne reproche rien à une tâche avant son premier déclenchement**, et
 * c'est systemd qui dit quand ce déclenchement a eu lieu — pas une période recopiée dans le script.
 *
 * ## Ce qu'il joue
 *
 * `verdict_tache`, du socle commun, est une fonction sans effet : elle prend des faits et rend un
 * mot. Le test la joue dans un conteneur jetable, avec le `bash` et les outils GNU pour lesquels
 * elle est écrite, et vérifie les trois situations demandées plus les cas de bord qui comptent.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const IMAGE = process.env['JADWAL_DEBIAN_IMAGE'] ?? 'debian:stable-slim';
const MAINTENANT = 1_800_000_000; // un instant fixe : le test ne doit pas dépendre de l'heure
const HEURE = 3600;
const GRACE = 3600;

/**
 * Les situations, et ce que la veille doit en dire.
 *
 * `alerte` dit si ce verdict doit réveiller l'exploitant. C'est la seule chose qui compte vraiment :
 * le mot rendu n'est qu'un moyen de le dire.
 */
const CAS = [
	{
		nom: 'installation fraîche : la minuterie ne s’est jamais déclenchée',
		args: ['loaded', 'active', 0, 0, MAINTENANT, 'non', GRACE],
		verdict: 'jamais',
		alerte: false
	},
	{
		nom: 'passage raté : déclenchée il y a trois heures, aucune réussite',
		args: ['loaded', 'active', MAINTENANT - 3 * HEURE, 0, MAINTENANT, 'non', GRACE],
		verdict: 'sans-reussite',
		alerte: true
	},
	{
		nom: 'passage raté : déclenchée après la dernière réussite',
		args: [
			'loaded',
			'active',
			MAINTENANT - 3 * HEURE,
			MAINTENANT - 30 * HEURE,
			MAINTENANT,
			'non',
			GRACE
		],
		verdict: 'sans-reussite',
		alerte: true
	},
	{
		nom: 'passage réussi : la réussite suit le déclenchement',
		args: [
			'loaded',
			'active',
			MAINTENANT - 3 * HEURE,
			MAINTENANT - 3 * HEURE + 60,
			MAINTENANT,
			'non',
			GRACE
		],
		verdict: 'ok',
		alerte: false
	},
	{
		// Une tâche brève écrit sa marque dans la seconde même du déclenchement. Relevé sur la coupe
		// du journal de Caddy, qui prend moins d’une seconde : les deux instants étaient égaux, et
		// la règle l’a d’abord jugée « pas encore aboutie ».
		nom: 'passage réussi dans la seconde même du déclenchement',
		args: [
			'loaded',
			'active',
			MAINTENANT - 3 * HEURE,
			MAINTENANT - 3 * HEURE,
			MAINTENANT,
			'non',
			GRACE
		],
		verdict: 'ok',
		alerte: false
	},
	{
		nom: 'la tâche tourne en ce moment',
		args: ['loaded', 'active', MAINTENANT - 3 * HEURE, 0, MAINTENANT, 'oui', GRACE],
		verdict: 'en-cours',
		alerte: false
	},
	{
		nom: 'déclenchée il y a dix minutes : on lui laisse le temps',
		args: ['loaded', 'active', MAINTENANT - 600, 0, MAINTENANT, 'non', GRACE],
		verdict: 'en-cours',
		alerte: false
	},
	{
		nom: 'la minuterie a disparu',
		args: ['not-found', 'inactive', 0, 0, MAINTENANT, 'non', GRACE],
		verdict: 'absente',
		alerte: true
	},
	{
		nom: 'la minuterie existe mais est arrêtée',
		args: ['loaded', 'inactive', 0, 0, MAINTENANT, 'non', GRACE],
		verdict: 'inactive',
		alerte: true
	}
];

/**
 * Ce que `systemctl show --property=LastTriggerUSec --value` rend vraiment, selon la version de
 * systemd et selon que la minuterie s'est déjà déclenchée.
 *
 * Le nom de la propriété annonce des microsecondes ; systemd 255 rend une date lisible, et une
 * chaîne vide quand elle ne s’est jamais déclenchée. Lire ce format de travers, c’est déclarer
 * « jamais déclenchée » une minuterie qui vient de tourner — ce qui est exactement ce qui est
 * arrivé, et ce que ces cas empêchent de revenir.
 */
const DATES = [
	{ nom: 'jamais declenchee : systemd rend une chaine vide', valeur: '', epoch: 0 },
	{ nom: 'systemd rend « n/a »', valeur: 'n/a', epoch: 0 },
	{
		nom: 'une date lisible, telle que systemd 255 la rend',
		valeur: 'Tue 2026-09-22 00:23:30 UTC',
		epoch: 1_790_036_610
	},
	{
		nom: 'des microsecondes, telles qu’un systemd plus ancien les rend',
		valeur: '1790036610000000',
		epoch: 1_790_036_610
	},
	{ nom: 'illisible : on se tait plutôt que de se tromper', valeur: 'pas une date', epoch: 0 }
];

/** Les verdicts qui doivent réveiller quelqu'un. */
const ALERTENT = new Set(['absente', 'inactive', 'sans-reussite']);

const docker = (args, options = {}) =>
	execFileSync('docker', args, { encoding: 'utf8', ...options }).trim();

const racine = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const commun = readFileSync(join(racine, 'infra', 'scripts', 'jadwal-commun.sh'), 'utf8');

// Le socle commun, tel qu'il est livré, moins son `set -Eeuo pipefail` : le harnais doit pouvoir
// continuer après un cas qui rend un mot inattendu, pour tous les montrer d'un coup.
const harnais = `${commun.replace(/^set -Eeuo pipefail$/m, 'set -u')}

for cas in "$@"; do
	case "$cas" in
		e\\|*)
			# Une date telle que systemd la rend : « e|<index>|<valeur> ».
			nom="\${cas#e|}"; nom="\${nom%%|*}"
			valeur="\${cas#e|*|}"
			printf '%s|%s\\n' "$nom" "$(epoch_systemd "$valeur")"
			;;
		*)
			IFS='|' read -r nom charge activite declenchement reussite maintenant en_cours grace <<< "$cas"
			printf '%s|%s\\n' "$nom" "$(verdict_tache "$charge" "$activite" "$declenchement" "$reussite" "$maintenant" "$en_cours" "$grace")"
			;;
	esac
done
`;

const dossier = mkdtempSync(join(tmpdir(), 'jadwal-veille-'));
const chemin = join(dossier, 'harnais.sh');
writeFileSync(chemin, harnais, 'utf8');

let echecs = [];

try {
	process.stdout.write(`La décision de la veille sur une tâche, jouée dans ${IMAGE}.\n\n`);

	const arguments_ = [
		...CAS.map((cas, index) => `${index}|${cas.args.join('|')}`),
		...DATES.map((cas, index) => `e|d${index}|${cas.valeur}`)
	];
	const sortie = docker([
		'run',
		'--rm',
		'--volume',
		`${chemin.replaceAll('\\', '/')}:/harnais.sh:ro`,
		IMAGE,
		'bash',
		'/harnais.sh',
		...arguments_
	]);

	const rendus = new Map();
	for (const ligne of sortie.split('\n')) {
		const [cle, valeur] = ligne.split('|');
		if (cle !== undefined && cle !== '') rendus.set(cle, (valeur ?? '').trim());
	}

	process.stdout.write(`${'ce que systemd rend'.padEnd(58)} ${'lu comme'.padEnd(15)}\n`);
	for (const [index, cas] of DATES.entries()) {
		const rendu = rendus.get(`d${index}`) ?? '(rien)';
		process.stdout.write(`${cas.nom.padEnd(58)} ${rendu}\n`);
		if (Number(rendu) !== cas.epoch) {
			echecs.push(`${cas.nom} : lu « ${rendu} », attendu « ${cas.epoch} »`);
		}
	}

	process.stdout.write(`\n${'situation'.padEnd(58)} ${'verdict'.padEnd(15)} alerte ?\n`);
	for (const [index, cas] of CAS.entries()) {
		const rendu = rendus.get(String(index)) ?? '(rien)';
		const alerte = ALERTENT.has(rendu);
		process.stdout.write(`${cas.nom.padEnd(58)} ${rendu.padEnd(15)} ${alerte ? 'OUI' : 'non'}\n`);
		if (rendu !== cas.verdict) {
			echecs.push(`${cas.nom} : verdict « ${rendu} », attendu « ${cas.verdict} »`);
		} else if (alerte !== cas.alerte) {
			echecs.push(
				`${cas.nom} : ${alerte ? 'alerte alors quil ne faut pas' : 'aucune alerte alors quil en faut une'}`
			);
		}
	}
} finally {
	rmSync(dossier, { recursive: true, force: true });
}

// -------------------------------------------------------------------------------------------------
// La seconde moitié : **le script lui-même**, lancé comme systemd le lance.
//
// La règle du dépôt, écrite à l'étape 12 : un script qu'aucun test ne *lance* n'est pas éprouvé.
// `verdict_tache` est une fonction, et jusqu'ici c'est tout ce que ce fichier éprouvait ; le script
// qui l'appelle, lui, n'était jamais exécuté. Il l'est maintenant, dans un conteneur, avec des
// doublures pour ce qui n'existe pas là — `systemctl`, `docker`, `curl`, `openssl` — et de vrais
// fichiers pour le reste.
//
// Ce qu'il fallait attraper : un contrôle qui **se tait quand il n'a pas pu contrôler**. La liste des
// verrous de conservation se terminait par `|| true` ; une commande en échec rendait une sortie vide,
// la sortie vide voulait dire « rien à signaler », et la veille annonçait pour toujours qu'aucun
// verrou ne traîne sans jamais avoir regardé.
// -------------------------------------------------------------------------------------------------

/** Les situations jouées par le script entier, et ce qu'il doit en dire. */
const PASSAGES = [
	{
		nom: 'tout va bien : aucune alerte',
		verrous: 'vide',
		attendu: [],
		interdit: ['ALERTE']
	},
	{
		nom: 'un verrou dure depuis plus de six mois',
		verrous: 'un-vieux',
		attendu: ['[verrous] ALERTE'],
		interdit: []
	},
	{
		nom: 'la liste des verrous est illisible : la commande échoue',
		verrous: 'echec',
		// C'est le cas que l'ancienne version ratait : elle prenait « rien à signaler ».
		attendu: ['[verrous-illisibles] ALERTE'],
		interdit: ['[verrous] ALERTE']
	},
	{
		nom: 'une unité étrangère est en échec, et l’option est éteinte',
		verrous: 'vide',
		machine: false,
		unites: 'oui',
		// Une instance qui s'auto-héberge ne se fait pas réveiller pour les unités d'autrui.
		attendu: [],
		interdit: ['ALERTE']
	},
	{
		nom: 'une unité étrangère est en échec, et l’option est allumée',
		verrous: 'vide',
		machine: true,
		unites: 'oui',
		attendu: ['exemple-oneshot.service est en échec'],
		interdit: []
	},
	{
		nom: 'Caddy porte une capacité de trop, et l’option est allumée',
		verrous: 'vide',
		machine: true,
		capacites: 'cap_net_bind_service cap_net_admin',
		attendu: ['[caddy-capacites] ALERTE'],
		interdit: []
	},
	{
		nom: 'Caddy ne porte que ce qu’il faut',
		verrous: 'vide',
		machine: true,
		capacites: 'cap_net_bind_service',
		attendu: [],
		interdit: ['ALERTE']
	}
];

const dossier2 = mkdtempSync(join(tmpdir(), 'jadwal-veille-script-'));

/** Les doublures, écrites ici pour qu'on lise dans ce fichier ce que le script croit trouver. */
const DOUBLURES = {
	systemctl: `#!/bin/sh
# Une minuterie chargée, active, jamais déclenchée : la veille ne doit rien reprocher.
#
# Deux réponses de plus, pour la veille au-delà de jadwal : la liste des unités en échec de la
# machine, et les capacités de Caddy. Les deux sont pilotées par l'environnement du passage.
case "$*" in
  *AmbientCapabilities*) echo "\${JADWAL_EPREUVE_CAPACITES:-cap_net_bind_service}" ;;
  list-units*)
    if [ "\${JADWAL_EPREUVE_UNITES:-non}" = "oui" ]; then
      echo "exemple-oneshot.service loaded failed failed Une unite d exemple"
    fi
    ;;
  *LoadState*)      echo loaded ;;
  *ActiveState*)    echo active ;;
  *LastTriggerUSec*) echo "" ;;
  "is-active"*)     exit 1 ;;
  *)                exit 0 ;;
esac
`,
	curl: `#!/bin/sh
# Battements de cœur, /healthz et le nom public : tout répond.
exit 0
`,
	openssl: `#!/bin/sh
# Un certificat valable encore longtemps.
case "$1" in
  x509) echo "notAfter=Dec 20 20:37:41 2026 GMT" ;;
  *)    echo "" ;;
esac
exit 0
`,
	docker: `#!/bin/sh
# Ce que le script demande vraiment à Docker, et rien de plus.
case "$*" in
  *"retention-hold.mjs list"*)
    case "$JADWAL_EPREUVE_VERROUS" in
      vide)     exit 0 ;;
      un-vieux) echo "verrou abcdef posé le 2026-01-01 pour « litige »"; exit 0 ;;
      echec)    echo "Error: No such service: init" >&2; exit 1 ;;
    esac
    ;;
  *"compose ps"*)
    printf 'app running healthy\\ndb running healthy\\n'; exit 0 ;;
  run*)
    # Le conteneur jetable qui envoie un courriel : on note le sujet, on n'envoie rien.
    for a in "$@"; do echo "$a"; done | tail -n 1 >> /tmp/courriels.txt
    cat > /dev/null
    exit 0 ;;
esac
exit 0
`
};

try {
	process.stdout.write(`\nLa veille elle-même, lancée dans ${IMAGE} comme systemd la lance.\n\n`);

	for (const [nom, source] of Object.entries(DOUBLURES)) {
		writeFileSync(join(dossier2, nom), source, 'utf8');
	}
	// Le fichier d'environnement du serveur, réduit à ce que la veille y lit. Aucun secret.
	writeFileSync(
		join(dossier2, 'jadwal.env'),
		[
			'JADWAL_ORIGIN=https://exemple.test',
			'JADWAL_APP_PORT=3080',
			'JADWAL_IMAGE=exemple/jadwal@sha256:0000',
			'JADWAL_ALERTE_TO=exploitant@exemple.test',
			''
		].join('\n'),
		'utf8'
	);

	const preparation = [
		'set -e',
		'mkdir -p /opt/jadwal/scripts /etc/jadwal /var/lib/jadwal/reussites /var/backups/jadwal /usr/local/bin',
		'cp /doublures/jadwal.env /etc/jadwal/jadwal.env',
		'cp /doublures/systemctl /doublures/docker /doublures/curl /doublures/openssl /usr/local/bin/',
		'chmod 0755 /usr/local/bin/systemctl /usr/local/bin/docker /usr/local/bin/curl /usr/local/bin/openssl',
		'cp /scripts/jadwal-commun.sh /scripts/jadwal-veille.sh /opt/jadwal/scripts/',
		'chmod 0755 /opt/jadwal/scripts/jadwal-veille.sh',
		// Une archive fraîche et une restauration récente : sans elles, deux alertes légitimes
		// partiraient et masqueraient ce qu'on cherche à mesurer.
		'touch /var/backups/jadwal/jadwal-2026-09-22T000000Z.dump.age',
		'date --iso-8601=seconds > /var/lib/jadwal/reussites/restauration-complete',
		// Ce que Compose lit pour interpoler. Il ne porte aucun secret, et c'est tout son objet : le
		// fichier que Compose lit ne doit rien contenir qu'il puisse essayer de développer.
		"printf 'JADWAL_IMAGE=exemple/jadwal@sha256:0000\\nJADWAL_APP_PORT=3080\\n' > /etc/jadwal/compose.env",
		// Chaque passage, avec sa situation, dans son propre état. La ligne `JADWAL_VEILLE_MACHINE`
		// est réécrite à chaque fois : c'est une option, et son absence est un cas à éprouver.
		...PASSAGES.map((passage, index) => {
			const env = [
				`JADWAL_EPREUVE_VERROUS=${passage.verrous}`,
				`JADWAL_EPREUVE_UNITES=${passage.unites ?? 'non'}`,
				`JADWAL_EPREUVE_CAPACITES='${passage.capacites ?? 'cap_net_bind_service'}'`
			].join(' ');
			const machine = passage.machine
				? "printf 'JADWAL_VEILLE_MACHINE=true\\n' >> /etc/jadwal/jadwal.env"
				: "grep -v '^JADWAL_VEILLE_MACHINE=' /etc/jadwal/jadwal.env > /tmp/e && mv /tmp/e /etc/jadwal/jadwal.env";
			return (
				`echo "=== ${index} ==="; rm -rf /var/lib/jadwal/alertes; ` +
				`cp /doublures/jadwal.env /etc/jadwal/jadwal.env; ${machine}; ` +
				`${env} /opt/jadwal/scripts/jadwal-veille.sh 2>&1 || true`
			);
		})
	].join('\n');

	writeFileSync(join(dossier2, 'preparation.sh'), preparation, 'utf8');

	const sortie = execFileSync(
		'docker',
		[
			'run',
			'--rm',
			'--volume',
			`${dossier2.replaceAll('\\', '/')}:/doublures:ro`,
			'--volume',
			`${join(racine, 'infra', 'scripts').replaceAll('\\', '/')}:/scripts:ro`,
			IMAGE,
			'bash',
			'/doublures/preparation.sh'
		],
		{ encoding: 'utf8' }
	);

	const blocs = sortie.split(/^=== (\d+) ===$/m);
	const parPassage = new Map();
	for (let i = 1; i < blocs.length; i += 2) {
		parPassage.set(Number(blocs[i]), blocs[i + 1] ?? '');
	}

	process.stdout.write(`${'situation'.padEnd(52)} ce que la veille en dit\n`);
	for (const [index, passage] of PASSAGES.entries()) {
		const bloc = parPassage.get(index) ?? '';
		const alertes = bloc
			.split('\n')
			.filter((l) => l.includes('ALERTE'))
			.map((l) => l.replace(/^\S+\s/, '').trim());
		process.stdout.write(
			`${passage.nom.padEnd(52)} ${alertes.length === 0 ? 'aucune alerte' : alertes.join(' | ')}\n`
		);
		if (bloc === '') {
			echecs.push(`${passage.nom} : le script n’a rien écrit — il ne s’est pas exécuté`);
			continue;
		}
		if (!bloc.includes('veille terminée')) {
			echecs.push(`${passage.nom} : la veille ne va pas jusqu’au bout`);
		}
		for (const attendu of passage.attendu) {
			if (!bloc.includes(attendu)) echecs.push(`${passage.nom} : « ${attendu} » attendu, absent`);
		}
		for (const interdit of passage.interdit) {
			if (bloc.includes(interdit))
				echecs.push(`${passage.nom} : « ${interdit} » ne devait pas être là`);
		}
	}
} finally {
	rmSync(dossier2, { recursive: true, force: true });
}

if (echecs.length > 0) {
	process.stderr.write(`\nCe qui a échoué :\n`);
	for (const echec of echecs) process.stderr.write(`  - ${echec}\n`);
	process.exitCode = 1;
} else {
	process.stdout.write(
		`\nLes ${CAS.length} situations rendent le verdict attendu, et les ${PASSAGES.length} passages du script entier` +
			` disent ce qu'ils doivent dire — y compris quand un contrôle n'a pas pu contrôler.\n`
	);
}

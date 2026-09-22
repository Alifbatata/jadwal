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

if (echecs.length > 0) {
	process.stderr.write(`\nCe qui a échoué :\n`);
	for (const echec of echecs) process.stderr.write(`  - ${echec}\n`);
	process.exitCode = 1;
} else {
	process.stdout.write(
		`\nLes ${CAS.length} situations rendent le verdict attendu : une installation fraîche ne réveille personne, un passage raté si.\n`
	);
}

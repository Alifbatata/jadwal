#!/usr/bin/env node
/**
 * Éprouve la garde du déploiement : **le vrai playbook**, joué par un vrai Ansible, dans un
 * conteneur jetable, contre une fausse API servie par ce script.
 *
 *     pnpm garde:test
 *     node scripts/eprouver-garde-deploiement.mjs --reel ghcr.io/<compte>/jadwal@sha256:<digest> [options]
 *
 * ## Ce que la garde promet
 *
 * `infra/ansible/jadwal.yml` refuse de déployer une image dont le commit n'a pas d'exécution verte
 * du flux `parcours` (`.github/workflows/parcours.yml`). La garde exige une image publiée sous le
 * chemin du dépôt, sur le registre qu'elle lit, en manifeste simple. Elle lit la révision dans
 * l'étiquette `org.opencontainers.image.revision` de l'image, et sa source dans
 * `org.opencontainers.image.source`, par l'API du registre, puis demande à l'API de GitHub les
 * exécutions du flux pour ce commit. Elle tourne dans une pièce à part, sur le nœud de contrôle,
 * **avant** toute connexion au serveur, chaque fois que le rôle `application`, le seul qui écrive
 * l'image, tourne. Ce rôle commence par vérifier son verdict, et ses gabarits ne lisent l'image
 * qu'à travers lui : aucune sélection de tâches ne doit écrire une image qu'elle n'a pas passée.
 *
 * Le verdict ne doit naître que d'une vérification faite dans le même passage. Les tâches de la
 * garde se jouent d'un seul bloc, que `--start-at-task` ne peut pas ouvrir au milieu. Elle refuse
 * toute variable à son préfixe (`garde_`) qui existe avant elle, et range son verdict dans les faits
 * du nœud de contrôle, que l'inventaire ne peut pas écrire. Les cas qui forgent une variable, un
 * fait ou un cache de faits éprouvent cela.
 *
 * Ce que l'épreuve ne couvre pas, parce que la garde ne le vise pas : qui modifie le playbook ou
 * ses rôles, ou pointe les adresses de la garde vers un faux service. L'épreuve elle-même le fait,
 * pour jouer la garde contre sa fausse API.
 *
 * ## Pourquoi un conteneur et une fausse API
 *
 * Une garde qui ne refuse jamais ne se voit pas à la relecture : un `when` inversé, un filtre qui
 * rend une liste vide, une réponse d'erreur prise pour une réponse, et le playbook passe en disant
 * que tout va bien. Seul le playbook joué pour de vrai, contre des réponses choisies, prouve
 * quelque chose. La vraie API ne donne pas ces réponses à la demande : un flux rouge, une étiquette
 * absente, un registre qui rend un autre manifeste que celui du digest.
 *
 * Le serveur HTTP tourne sur le poste, et le conteneur le joint par `host.docker.internal` :
 * Docker Desktop le fournit, et `--add-host host.docker.internal:host-gateway` le pose sous Linux.
 * Il imite ce que les deux vraies API font, mesuré le 2026-09-23 : le défi `WWW-Authenticate` du
 * registre, le jeton anonyme, le manifeste servi selon l'en-tête `Accept`, la configuration servie
 * par une redirection, la liste des exécutions, vide pour un commit qui n'en a pas, et le `404`
 * d'un flux que GitHub ne connaît pas par son nom.
 *
 * ## Ce qu'il joue
 *
 * Un inventaire factice dont l'unique hôte est le conteneur lui-même, en connexion locale. **Aucune
 * connexion ne part vers un serveur.**
 *
 * La plupart des cas jouent le playbook avec `--tags garde` : la garde tourne en entier, et de la
 * pièce du déploiement il ne reste que la collecte des faits du conteneur. Le récapitulatif dit si
 * la seconde pièce a commencé : quand la garde refuse, l'hôte factice ne doit pas y figurer du tout.
 *
 * Les cas qui éprouvent une sélection de tâches (`--tags`, `--skip-tags`, `--start-at-task`,
 * `--limit`) jouent aussi le rôle `application`, en `--check --diff` : c'est lui qui écrit l'image
 * dans `compose.env` et `jadwal.env`, et la question est de savoir s'il l'écrit sans que la garde
 * l'ait passée. Pour qu'il aille jusque-là, le conteneur porte une doublure de `docker` qui ne lance
 * rien, un coffre factice et `-e ansible_become=false` (le conteneur tourne déjà en root, sans
 * `sudo`). En `--check`, les gabarits sont rendus et comparés, rien n'est écrit, et les commandes
 * qui tireraient ou lanceraient l'image sont sautées. Le diff de `compose.env` montre l'image que le
 * rôle aurait écrite ; celui de `jadwal.env` est caché par `no_log`, et seul son statut compte.
 *
 * Seuls les fichiers suivis par git sous `infra/ansible/`, et le fichier Compose que le rôle
 * `application` recopie, entrent dans le conteneur : ni le coffre ni l'inventaire réels, qui
 * peuvent traîner dans l'arbre de travail, n'y sont copiés.
 *
 * ## `--reel`
 *
 * Joue la même garde contre les **vraies** API, pour l'image donnée, en lecture seule : un jeton
 * anonyme du registre, deux lectures, une requête à GitHub. Rien n'est jugé : la sortie du playbook
 * est recopiée telle quelle, et le code de retour est le sien. Ce qui suit l'image va au playbook :
 * `-e jadwal_garde_flux=ci.yml` montre le passage sur un flux qui a déjà une exécution verte.
 *
 * ## Les versions
 *
 * `python:3.13-slim`, comme le conteneur de déploiement d'`infra/README.md`, et `ansible-core`
 * épinglé : `JADWAL_ANSIBLE_CORE` en éprouve un autre.
 */
import { execFile, execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const IMAGE_PYTHON = process.env['JADWAL_GARDE_PYTHON'] ?? 'python:3.13-slim';
const ANSIBLE_CORE = process.env['JADWAL_ANSIBLE_CORE'] ?? '2.21.4';
const CONTENEUR = `jadwal-epreuve-garde-${randomUUID().slice(0, 8)}`;

/** Ce que le conteneur appelle pour joindre le poste. */
const HOTE_DU_POSTE = 'host.docker.internal';

const OCI_INDEX = 'application/vnd.oci.image.index.v1+json';
const OCI_MANIFESTE = 'application/vnd.oci.image.manifest.v1+json';
const OCI_CONFIGURATION = 'application/vnd.oci.image.config.v1+json';
const ETIQUETTE_REVISION = 'org.opencontainers.image.revision';
const ETIQUETTE_SOURCE = 'org.opencontainers.image.source';

const racine = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

/**
 * Le dépôt et le flux que la garde demande à GitHub, lus là où le déploiement les lit : les images
 * de l'épreuve sont publiées sous ce dépôt, comme la CI publie les siennes.
 */
function variableDuDeploiement(nom) {
	const texte = readFileSync(
		join(racine, 'infra', 'ansible', 'group_vars', 'all', 'main.yml'),
		'utf8'
	);
	const valeur = new RegExp(`^${nom}:\\s*(\\S+)\\s*$`, 'm').exec(texte)?.[1];
	if (!valeur) throw new Error(`${nom} est introuvable dans infra/ansible/group_vars/all/main.yml`);
	return valeur;
}
const DEPOT = variableDuDeploiement('jadwal_garde_depot');
const FLUX = variableDuDeploiement('jadwal_garde_flux');
/** L'étiquette `source` que `ci.yml` pose : `${{ github.server_url }}/${{ github.repository }}`. */
const SOURCE = `https://github.com/${DEPOT}`;

/**
 * Les valeurs du coffre que lisent les gabarits du rôle `application`. Le coffre de l'épreuve les
 * porte toutes, avec une valeur factice : sans elles, les gabarits échoueraient pour une autre raison
 * que la garde.
 */
const VALEURS_DU_COFFRE = [
	'vault_postgres_password',
	'vault_db_owner_password',
	'vault_db_app_password',
	'vault_db_superadmin_password',
	'vault_db_auth_password',
	'vault_db_public_password',
	'vault_better_auth_secret',
	'vault_smtp_password'
];

/** Les tâches du rôle `application` qui écrivent l'image, telles que la sortie d'Ansible les titre. */
const TACHES_QUI_ECRIVENT_L_IMAGE = [
	"application : Le fichier d'interpolation de Compose",
	"application : Le fichier d'environnement"
];

// ---------------------------------------------------------------------------------------------
// Les commandes
// ---------------------------------------------------------------------------------------------

/**
 * Une commande, **sans bloquer** : le faux serveur vit dans ce processus, et un `execFileSync` le
 * figerait pendant que le playbook l'interroge. La garde attendrait une réponse qui ne vient pas.
 */
function lancer(commande, args) {
	return new Promise((resolue) => {
		execFile(
			commande,
			args,
			{ encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
			(erreur, stdout, stderr) => {
				const code = erreur ? (typeof erreur.code === 'number' ? erreur.code : 1) : 0;
				resolue({ code, sortie: `${stdout ?? ''}${stderr ?? ''}` });
			}
		);
	});
}

async function docker(args) {
	const resultat = await lancer('docker', args);
	if (resultat.code !== 0) {
		throw new Error(`docker ${args.slice(0, 2).join(' ')} a échoué :\n${resultat.sortie}`);
	}
	return resultat.sortie;
}

// ---------------------------------------------------------------------------------------------
// Le faux registre et la fausse API de GitHub
// ---------------------------------------------------------------------------------------------

const sha256 = (texte) => createHash('sha256').update(texte).digest('hex');
const revisionDe = (nom) => createHash('sha1').update(`revision-${nom}`).digest('hex');

/** Le jeton que le faux registre délivre. Tiré au hasard : la garde ne peut pas le deviner. */
const JETON = randomBytes(18).toString('base64url');

/** Ce que le faux registre sert : les manifestes par digest, les configurations par digest. */
const manifestes = new Map();
const blobs = new Map();
/** Ce que la fausse API de GitHub rend, par révision. */
const executions = new Map();
/**
 * Les flux que la fausse API de GitHub connaît, par leur nom dans le dépôt, posés par chaque cas.
 * GitHub cherche un flux par son nom, pas commit par commit : un flux qu'il ne connaît pas rend
 * 404 pour tout commit, et un flux qu'il connaît rend 200, même sans exécution pour ce commit.
 * Relevé le 2026-09-25 sur le dépôt : `orthographe.yml`, pour un commit poussé avant lui, rend 200
 * et une liste vide ; `parcours.yml`, pas encore poussé, rend 404.
 */
let fluxPousses = new Set();
/** Toutes les requêtes reçues depuis la dernière remise à zéro : ce que la garde a demandé. */
let requetes = [];
/** Le dépôt et le flux que la garde a demandés à GitHub, relevés pour être vérifiés. */
const demandesGithub = [];

let ADRESSE = '';
/** L'hôte du faux registre, tel qu'il s'écrit en tête d'une référence d'image. */
let HOTE_REGISTRE = '';

/** Une configuration d'image, avec les étiquettes données. Rend son digest. */
function configuration(etiquettes) {
	const corps = JSON.stringify({
		architecture: 'amd64',
		os: 'linux',
		config: { Labels: etiquettes },
		rootfs: { type: 'layers', diff_ids: [] }
	});
	const digest = `sha256:${sha256(corps)}`;
	blobs.set(digest, corps);
	return { digest, taille: Buffer.byteLength(corps) };
}

/** Le manifeste d'une image, écrit comme le registre l'écrit. */
function corpsDeManifeste(config) {
	return JSON.stringify(
		{
			schemaVersion: 2,
			mediaType: OCI_MANIFESTE,
			config: { mediaType: OCI_CONFIGURATION, digest: config.digest, size: config.taille },
			layers: []
		},
		null,
		2
	);
}

/** Range un manifeste sous son digest, ou sous un autre quand le registre doit mentir. */
function ranger(corps, type, digest = `sha256:${sha256(corps)}`) {
	manifestes.set(digest, { corps, type });
	return digest;
}

/**
 * Une exécution du flux, dans la forme que l'API rend. `path` est écrit comme l'API l'écrit, relevé
 * le 2026-09-23 sur les exécutions de `ci.yml` du dépôt : `.github/workflows/ci.yml`.
 */
function execution(id, revision, status, conclusion) {
	return {
		id,
		name: 'Parcours',
		path: `.github/workflows/${FLUX}`,
		event: 'push',
		head_branch: 'main',
		head_sha: revision,
		status,
		conclusion,
		html_url: `https://github.example.test/runs/${id}`
	};
}

function repondre(reponse, statut, type, corps, entetes = {}) {
	reponse.writeHead(statut, { 'Content-Type': type, ...entetes });
	reponse.end(corps);
}

const refusJson = (reponse, statut, code, message) =>
	repondre(reponse, statut, 'application/json', JSON.stringify({ errors: [{ code, message }] }));

function servir(requete, reponse) {
	const adresse = new URL(requete.url ?? '/', 'http://epreuve');
	requetes.push(`${requete.method} ${adresse.pathname}${adresse.search}`);

	// Le jeton anonyme : `{"token": …}`, pour la portée demandée et pour elle seule.
	if (adresse.pathname === '/token') {
		const portee = adresse.searchParams.get('scope') ?? '';
		if (adresse.searchParams.get('service') !== 'epreuve' || !/^repository:.+:pull$/.test(portee)) {
			return refusJson(reponse, 400, 'DENIED', 'service ou portée inattendus');
		}
		return repondre(reponse, 200, 'application/json', JSON.stringify({ token: JETON }));
	}

	// Le stockage où le registre renvoie pour les blobs, comme ghcr.io le fait.
	const stockage = /^\/stockage\/(sha256:[0-9a-f]{64})$/.exec(adresse.pathname);
	if (stockage) {
		const corps = blobs.get(stockage[1]);
		if (!corps) return repondre(reponse, 404, 'text/plain', 'absent');
		return repondre(reponse, 200, 'application/octet-stream', corps);
	}

	const registre = /^\/v2\/(.+)\/(manifests|blobs)\/(sha256:[0-9a-f]{64})$/.exec(adresse.pathname);
	if (registre) {
		const [, chemin, genre, digest] = registre;
		if (requete.headers.authorization !== `Bearer ${JETON}`) {
			return refusJson(reponse, 401, 'UNAUTHORIZED', 'authentication required');
		}
		if (genre === 'blobs') {
			if (!blobs.has(digest)) return refusJson(reponse, 404, 'BLOB_UNKNOWN', 'blob unknown');
			return repondre(reponse, 307, 'application/octet-stream', '', {
				Location: `${ADRESSE}/stockage/${digest}`
			});
		}
		const manifeste = manifestes.get(digest);
		// Un registre ne rend un manifeste que dans un type que le client déclare accepter.
		const accepte = String(requete.headers.accept ?? '');
		if (!manifeste || !accepte.includes(manifeste.type)) {
			return refusJson(reponse, 404, 'MANIFEST_UNKNOWN', `manifest unknown: ${chemin}`);
		}
		return repondre(reponse, 200, manifeste.type, manifeste.corps, {
			'Docker-Content-Digest': digest
		});
	}

	// Sans jeton, le registre répond par le défi, comme ghcr.io.
	if (adresse.pathname.startsWith('/v2/')) {
		return refusJson(reponse, 401, 'UNAUTHORIZED', 'authentication required');
	}

	const github = /^\/github\/repos\/([^/]+\/[^/]+)\/actions\/workflows\/([^/]+)\/runs$/.exec(
		adresse.pathname
	);
	if (github) {
		const [, depot, flux] = github;
		demandesGithub.push({ depot, flux });
		if (!fluxPousses.has(flux)) {
			return repondre(
				reponse,
				404,
				'application/json',
				JSON.stringify({ message: 'Not Found', status: '404' })
			);
		}
		const liste = executions.get(adresse.searchParams.get('head_sha') ?? '')?.liste ?? [];
		return repondre(
			reponse,
			200,
			'application/json',
			JSON.stringify({ total_count: liste.length, workflow_runs: liste })
		);
	}

	return repondre(reponse, 404, 'text/plain', 'inconnu');
}

// Le défi du registre porte l'adresse du service de jetons : il faut donc répondre avec elle. On
// l'ajoute ici, une fois l'adresse connue, plutôt que dans chaque réponse 401.
function avecDefi(requete, reponse) {
	const ecrire = reponse.writeHead.bind(reponse);
	reponse.writeHead = (statut, entetes) => {
		if (statut === 401) {
			const chemin = /^\/v2\/(.+)\/(?:manifests|blobs)\//.exec(requete.url ?? '')?.[1] ?? '';
			entetes = {
				...entetes,
				'WWW-Authenticate': `Bearer realm="${ADRESSE}/token",service="epreuve",scope="repository:${chemin}:pull"`
			};
		}
		return ecrire(statut, entetes);
	};
	servir(requete, reponse);
}

// ---------------------------------------------------------------------------------------------
// Les cas
// ---------------------------------------------------------------------------------------------

/**
 * Une image de l'épreuve : sa configuration, son manifeste, son digest, et ce que GitHub dit de sa
 * révision. Rend la référence à passer au playbook.
 *
 * Par défaut, elle est publiée comme la CI publie les siennes : sur le registre que la garde lit,
 * sous le nom du dépôt en minuscules, avec les étiquettes `source` et `revision` de `ci.yml`.
 * `chemin` et `hote` la publient ailleurs.
 */
function image(
	nom,
	{
		etiquettes,
		index = false,
		menteur = false,
		hybride = false,
		plateformes,
		github,
		chemin,
		hote,
		revision: imposee
	}
) {
	const revision = imposee ?? revisionDe(nom);
	const reference = (digest) =>
		`${hote ?? HOTE_REGISTRE}/${chemin ?? DEPOT.toLowerCase()}@${digest}`;
	if (github) executions.set(revision, github(revision));

	if (plateformes) {
		// Un index dont chaque plateforme porte sa propre révision, donc son propre verdict.
		const entrees = plateformes.map(({ architecture, revision: sienne, github: verdict }) => {
			const corps = corpsDeManifeste(
				configuration({ [ETIQUETTE_SOURCE]: SOURCE, [ETIQUETTE_REVISION]: sienne })
			);
			if (verdict) executions.set(sienne, verdict(sienne));
			return {
				mediaType: OCI_MANIFESTE,
				digest: ranger(corps, OCI_MANIFESTE),
				size: Buffer.byteLength(corps),
				platform: { os: 'linux', architecture }
			};
		});
		const corpsIndex = JSON.stringify({
			schemaVersion: 2,
			mediaType: OCI_INDEX,
			manifests: entrees
		});
		return { reference: reference(ranger(corpsIndex, OCI_INDEX)), revision };
	}

	const config = configuration(
		etiquettes === undefined
			? { [ETIQUETTE_SOURCE]: SOURCE, [ETIQUETTE_REVISION]: revision }
			: etiquettes
	);
	const corps = corpsDeManifeste(config);
	let digest;
	if (index) {
		// Un index comme BuildKit l'écrit avec l'attestation de provenance : le manifeste de
		// l'attestation d'abord, en `unknown/unknown`, puis celui de l'image.
		const attestation = ranger(
			corpsDeManifeste(configuration({ 'epreuve.attestation': 'oui' })),
			OCI_MANIFESTE
		);
		const vrai = ranger(corps, OCI_MANIFESTE);
		const corpsIndex = JSON.stringify({
			schemaVersion: 2,
			mediaType: OCI_INDEX,
			manifests: [
				{
					mediaType: OCI_MANIFESTE,
					digest: attestation,
					size: 1,
					platform: { os: 'unknown', architecture: 'unknown' }
				},
				{
					mediaType: OCI_MANIFESTE,
					digest: vrai,
					size: Buffer.byteLength(corps),
					platform: { os: 'linux', architecture: 'amd64' }
				}
			]
		});
		digest = ranger(corpsIndex, OCI_INDEX);
	} else if (hybride) {
		// Un manifeste d'image (son type, sa configuration et ses couches : ce que Docker exécute) qui
		// porte en plus une liste « manifests » vers une autre image, dont le parcours est vert.
		const revisionVerte = revisionDe(`${nom}-verte`);
		const corpsVert = corpsDeManifeste(
			configuration({ [ETIQUETTE_SOURCE]: SOURCE, [ETIQUETTE_REVISION]: revisionVerte })
		);
		executions.set(revisionVerte, vert(revisionVerte));
		const corpsHybride = JSON.stringify({
			...JSON.parse(corps),
			manifests: [
				{
					mediaType: OCI_MANIFESTE,
					digest: ranger(corpsVert, OCI_MANIFESTE),
					size: Buffer.byteLength(corpsVert),
					platform: { os: 'linux', architecture: 'amd64' }
				}
			]
		});
		digest = ranger(corpsHybride, OCI_MANIFESTE);
	} else if (menteur) {
		// Le digest demandé est celui d'un manifeste honnête, mais le registre en rend un autre :
		// même configuration, une couche de plus.
		digest = `sha256:${sha256(corps)}`;
		const autre = JSON.stringify({ ...JSON.parse(corps), layers: [{ digest: 'sha256:0' }] });
		ranger(autre, OCI_MANIFESTE, digest);
	} else {
		digest = ranger(corps, OCI_MANIFESTE);
	}
	return { reference: reference(digest), revision };
}

const vert = (revision) => ({ liste: [execution(11, revision, 'completed', 'success')] });
const rouge = (id) => (revision) => ({ liste: [execution(id, revision, 'completed', 'failure')] });

/** Une image, puis le cas qui a besoin de sa référence : une dérogation qui la nomme, par exemple. */
function avecImage(nom, reglages, cas) {
	const fabriquee = image(nom, reglages);
	return { ...fabriquee, ...cas(fabriquee.reference) };
}

/** Le rôle `application` en simulation, diff compris : ce qu'il écrirait se lit dans la sortie. */
const SIMULATION = ['--check', '--diff'];

const MOTIF = 'retour à l’image d’avant la garde';

/** Un verdict vert pour l'image donnée, tel que la garde le range. */
const verdictVert = (reference) => ({ image: reference, verdict: 'vert' });

/** Le verdict forgé, sous le nom qu'il portait (`jadwal_garde`) et sous le sien (`garde_verdict`). */
const verdictForge = (reference) => ({
	jadwal_garde: verdictVert(reference),
	garde_verdict: verdictVert(reference)
});

/** Des faits forgés : `-e` remplace `ansible_facts` en entier, sur chaque hôte. */
const faitsForges = (reference) => ({ ansible_facts: { garde_verdict: verdictVert(reference) } });

/** Un verdict écrit dans l'inventaire de localhost, sous toutes les formes qu'il pourrait prendre. */
const verdictEnInventaire = (reference) =>
	[
		'jadwal_garde:',
		`  image: '${reference}'`,
		'  verdict: vert',
		'garde_verdict:',
		`  image: '${reference}'`,
		'  verdict: vert',
		'ansible_facts:',
		'  garde_verdict:',
		`    image: '${reference}'`,
		'    verdict: vert'
	].join('\n');

/** Un cache de faits qui survit au passage : un fichier par hôte, dans ce dossier. */
const DOSSIER_DU_CACHE = '/tmp/faits-de-l-epreuve';
const CACHE_PERSISTANT = [
	'ANSIBLE_CACHE_PLUGIN=jsonfile',
	`ANSIBLE_CACHE_PLUGIN_CONNECTION=${DOSSIER_DU_CACHE}`
];

/** Un passage d'avant, qui laisse dans le cache de faits le verdict que la garde y rangerait. */
const passageQuiGardeUnVerdict = (reference) =>
	[
		"- name: Un passage d'avant, qui laisse un verdict dans le cache de faits",
		'  hosts: localhost',
		'  connection: local',
		'  gather_facts: false',
		'  tasks:',
		'    - name: Le verdict, rangé comme la garde le range',
		'      ansible.builtin.set_fact:',
		'        garde_verdict:',
		`          image: '${reference}'`,
		'          verdict: vert',
		'        jadwal_garde:',
		`          image: '${reference}'`,
		'          verdict: vert',
		'        cacheable: true'
	].join('\n');

/**
 * Ce que chaque cas attend.
 *
 * - `passe` : le playbook sort en 0 et la seconde pièce commence, sans échec.
 * - `refuse` : il sort en erreur, la garde échoue, la seconde pièce ne commence pas.
 * - `arrete` : il sort en erreur, et la seconde pièce s'arrête sur une tâche en échec.
 * - `liste` : `--list-tasks`, qui dit ce qu'une sélection jouerait, sans rien jouer.
 * - `introuvable` : Ansible ne trouve pas la tâche de départ `depart`, et ne joue aucune tâche.
 *
 * `ecrit` : `true`, le rôle `application` écrirait l'image demandée ; `false`, aucune image n'est
 * écrite, ni dans `compose.env` ni dans `jadwal.env`. `dit` : ce que la sortie doit contenir.
 * `depart` : la tâche de `--start-at-task`, dont le cas vérifie d'abord qu'elle existe dans la garde.
 * `fichiers` : posés avant le cas, effacés après, avec `aEffacer`. `env` : des réglages d'Ansible.
 * `prealable` : un passage joué avant, avec les mêmes réglages, et qui doit réussir.
 * `fluxPousses` : les flux que la fausse API de GitHub connaît, par leur nom ; par défaut, celui
 * du déploiement.
 */
function lesCas() {
	return [
		{
			quoi: 'un parcours vert pour ce commit',
			...image('vert', { github: vert }),
			attendu: 'passe',
			dit: ['a un parcours vert', 'https://github.example.test/runs/11']
		},
		{
			quoi: 'un parcours rouge pour ce commit',
			...image('rouge', { github: rouge(12) }),
			attendu: 'refuse',
			dit: ['Déploiement refusé', 'aucune réussie', 'completed/failure']
		},
		{
			quoi: 'un parcours encore en cours',
			...image('en-cours', {
				github: (r) => ({ liste: [execution(13, r, 'in_progress', null)] })
			}),
			attendu: 'refuse',
			dit: ['Déploiement refusé', 'in_progress']
		},
		{
			quoi: 'aucune exécution du flux pour ce commit',
			...image('sans-execution', { github: () => ({ liste: [] }) }),
			attendu: 'refuse',
			dit: ['Déploiement refusé', 'aucune exécution de ce flux pour ce commit']
		},
		{
			// Une image construite avant la garde : son commit a été poussé avant le flux. GitHub
			// connaît le flux par son nom dans le dépôt, et n'a aucune exécution de lui pour ce
			// commit : il répond 200 et une liste vide, pas 404.
			quoi: 'une image d’un commit poussé avant le flux (200, aucune exécution)',
			...image('avant-le-flux', {}),
			attendu: 'refuse',
			dit: ['Déploiement refusé', 'aucune exécution de ce flux pour ce commit'],
			verifier: (sortie) => [['la sortie ne parle pas de 404', !sortie.includes('(404)')]]
		},
		{
			// Le cas réel du 2026-09-23 : le fichier du flux n'était pas encore poussé sur GitHub.
			// Un commit sans exécution, comme au cas précédent : c'est le nom du flux, inconnu du
			// dépôt, qui fait le 404, et non le commit.
			quoi: 'un flux pas encore poussé sur GitHub (404)',
			...image('flux-absent', {}),
			fluxPousses: ['ci.yml'],
			attendu: 'refuse',
			dit: [
				'Déploiement refusé',
				'le flux est inconnu de GitHub pour ce dépôt (404)',
				"il n'y a pas encore été poussé",
				// Et le conseil qui va avec : ni attendre ni relancer ne sert, toute image aurait ce 404.
				'toute image recevra la même réponse tant que le flux reste inconnu'
			]
		},
		{
			// Une API qui ignorerait le filtre `head_sha` rendrait les exécutions d'autres commits :
			// une seule verte suffirait à tromper une garde qui ne relit pas la révision.
			quoi: 'des exécutions vertes, mais pour un autre commit',
			...image('autre-commit', {
				github: () => ({
					liste: [execution(14, revisionDe('un-autre-commit'), 'completed', 'success')]
				})
			}),
			attendu: 'refuse',
			dit: [
				'Déploiement refusé',
				'aucune exécution de ce flux pour ce commit',
				'pour un autre commit ou un autre flux'
			]
		},
		{
			// Le même raisonnement pour le flux : une API qui ignorerait le nom du flux dans l'adresse
			// rendrait les exécutions de `ci.yml`, qui ne dit rien du parcours.
			quoi: 'une exécution verte d’un autre flux (ci.yml) pour ce commit',
			...image('autre-flux', {
				github: (r) => ({
					liste: [
						{
							...execution(21, r, 'completed', 'success'),
							name: 'CI',
							path: '.github/workflows/ci.yml'
						}
					]
				})
			}),
			attendu: 'refuse',
			dit: [
				'Déploiement refusé',
				'aucune exécution de ce flux pour ce commit',
				'pour un autre commit ou un autre flux'
			]
		},
		{
			quoi: 'une API de GitHub qui ne répond pas',
			...image('github-muet', { github: vert }),
			apiGithub: 'http://127.0.0.1:9',
			attendu: 'refuse',
			dit: ['Déploiement refusé', "GitHub n'a pas répondu", 'Connection refused']
		},
		{
			quoi: 'une image sans étiquette de révision',
			...image('sans-etiquette', { etiquettes: { [ETIQUETTE_SOURCE]: SOURCE }, github: vert }),
			attendu: 'refuse',
			dit: ['Déploiement refusé', 'illisible', ETIQUETTE_REVISION],
			sansGithub: true
		},
		{
			quoi: 'une étiquette de révision qui n’est pas un commit',
			...image('revision-main', {
				etiquettes: { [ETIQUETTE_SOURCE]: SOURCE, [ETIQUETTE_REVISION]: 'main' },
				github: vert
			}),
			attendu: 'refuse',
			dit: ['Déploiement refusé', 'illisible', 'main'],
			sansGithub: true
		},
		{
			// La CI pose l'étiquette `source` sur chaque image (`ci.yml`) : une image qui ne la porte
			// pas ne vient pas de là.
			quoi: 'une image sans étiquette source',
			...image('sans-source', {
				etiquettes: { [ETIQUETTE_REVISION]: revisionDe('sans-source') },
				github: vert
			}),
			attendu: 'refuse',
			dit: ['Déploiement refusé', ETIQUETTE_SOURCE, '(absente)'],
			sansGithub: true
		},
		{
			quoi: 'une image du dépôt dont l’étiquette source désigne un autre dépôt',
			...image('source-etrangere', {
				etiquettes: {
					[ETIQUETTE_SOURCE]: 'https://github.com/un-autre-compte/pas-jadwal',
					[ETIQUETTE_REVISION]: revisionDe('source-etrangere')
				},
				github: vert
			}),
			attendu: 'refuse',
			dit: [
				'Déploiement refusé',
				ETIQUETTE_SOURCE,
				'https://github.com/un-autre-compte/pas-jadwal'
			],
			sansGithub: true
		},
		{
			// N'importe quel compte peut publier une image dont l'étiquette de révision désigne un
			// commit vert de jadwal : seul le chemin sur le registre dit qui l'a publiée.
			quoi: 'une image d’un autre compte du registre, étiquette = un commit vert de jadwal',
			...image('pas-jadwal', {
				chemin: 'un-autre-compte/pas-jadwal',
				etiquettes: {
					[ETIQUETTE_SOURCE]: SOURCE,
					[ETIQUETTE_REVISION]: revisionDe('commit-vert-de-jadwal')
				},
				revision: revisionDe('commit-vert-de-jadwal'),
				github: vert
			}),
			attendu: 'refuse',
			dit: ['Déploiement refusé', 'un-autre-compte/pas-jadwal', DEPOT],
			sansRegistre: true,
			sansGithub: true
		},
		{
			// La référence désigne un registre, et la garde en lit un autre : ce qu'elle a vérifié
			// n'est pas ce que le serveur tirerait.
			quoi: 'une image sur un autre registre que celui que la garde lit',
			...image('autre-registre', { hote: 'registre.example.test', github: vert }),
			attendu: 'refuse',
			dit: ['Déploiement refusé', 'registre.example.test'],
			sansRegistre: true,
			sansGithub: true
		},
		{
			quoi: 'un registre qui rend un autre manifeste que celui du digest',
			...image('menteur', { menteur: true, github: vert }),
			attendu: 'refuse',
			dit: ['Déploiement refusé', 'empreinte'],
			sansGithub: true
		},
		{
			// La CI publie un manifeste simple (`provenance: false`, `sbom: false`). Un index est
			// refusé, en disant que faire : Docker y prendrait la plateforme du serveur, que la garde
			// ne connaît pas.
			quoi: 'un index multiplateforme, attestation en tête',
			...image('index', { index: true, github: vert }),
			attendu: 'refuse',
			dit: ['Déploiement refusé', 'index', OCI_INDEX],
			sansGithub: true
		},
		{
			quoi: 'un index : amd64 porte un commit vert, arm64 un commit rouge',
			...image('index-mixte', {
				plateformes: [
					{ architecture: 'amd64', revision: revisionDe('index-vert'), github: vert },
					{ architecture: 'arm64', revision: revisionDe('index-rouge'), github: rouge(22) }
				]
			}),
			attendu: 'refuse',
			dit: ['Déploiement refusé', 'index'],
			sansGithub: true
		},
		{
			quoi: 'un manifeste d’image rouge qui porte aussi une clé « manifests » vers une image verte',
			...image('hybride', { hybride: true, github: rouge(23) }),
			attendu: 'refuse',
			dit: ['Déploiement refusé', 'manifests'],
			sansGithub: true
		},
		{
			quoi: 'une étiquette au lieu d’un digest',
			reference: `${HOTE_REGISTRE}/${DEPOT.toLowerCase()}:main`,
			attendu: 'refuse',
			dit: ['Déploiement refusé', 'digest'],
			sansRegistre: true
		},
		{
			quoi: 'un registre qui ne répond pas',
			...image('muet', { github: vert, hote: '127.0.0.1:9' }),
			registre: 'http://127.0.0.1:9',
			attendu: 'refuse',
			dit: ['Déploiement refusé', 'registre'],
			sansRegistre: true
		},
		{
			// `uri` ne tourne pas en `--check` sans `check_mode: false` : une garde qui l'oublie est
			// sautée en simulation, et la simulation laisse croire que le déploiement passera.
			quoi: 'un parcours rouge, en simulation (--check)',
			...image('rouge-simulation', { github: rouge(15) }),
			options: ['--check'],
			attendu: 'refuse',
			dit: ['Déploiement refusé', 'aucune réussie']
		},
		{
			// L'autre moitié : une lecture sautée ne rend rien, et la garde refuserait tout en
			// simulation. Seul ce cas-ci montre que les lectures ont vraiment lieu sous `--check`.
			quoi: 'un parcours vert, en simulation (--check)',
			...image('vert-simulation', { github: vert }),
			options: ['--check'],
			attendu: 'passe',
			dit: ['a un parcours vert']
		},
		// La dérogation nomme l'image qu'elle couvre : c'est la forme d'`infra/README.md`, en JSON, la
		// seule qui fait passer une valeur composée. Le rôle `application` la voit, et écrit l'image.
		avecImage('derogation', { github: rouge(16) }, (reference) => ({
			quoi: 'un parcours rouge, avec une dérogation écrite pour cette image (rôle application)',
			selection: ['--tags', 'application'],
			options: [
				...SIMULATION,
				'-e',
				JSON.stringify({ jadwal_garde_derogation: { image: reference, motif: MOTIF } })
			],
			attendu: 'passe',
			ecrit: true,
			dit: ['DÉROGATION', `Motif : ${MOTIF}`],
			ignore: true,
			sansRegistre: true
		})),
		{
			// `-e clé=valeur` ne sait écrire qu'une chaîne, coupée au premier espace sans rien dire.
			quoi: 'une dérogation passée en clé=valeur',
			...image('derogation-coupee', { github: rouge(17) }),
			options: ['-e', `jadwal_garde_derogation=${MOTIF}`],
			attendu: 'refuse',
			dit: [
				'Dérogation refusée',
				"n'a pas la forme attendue",
				'{"jadwal_garde_derogation": {"image"'
			],
			sansRegistre: true,
			sansGithub: true
		},
		avecImage('derogation-un-mot', { github: rouge(18) }, (reference) => ({
			quoi: 'une dérogation dont le motif tient en un mot',
			options: [
				'-e',
				JSON.stringify({ jadwal_garde_derogation: { image: reference, motif: 'urgence' } })
			],
			attendu: 'refuse',
			dit: ['Dérogation refusée', 'un seul mot (urgence)'],
			sansRegistre: true,
			sansGithub: true
		})),
		{
			// Le fichier passé par `-e @fichier` à chaque déploiement (`exploitant.yml`) : une
			// dérogation qui y reste ne doit pas valoir pour l'image suivante.
			quoi: 'une dérogation restée dans un fichier passé par -e @fichier, sans image (ancienne forme)',
			...image('derogation-fichier', { github: rouge(19) }),
			fichiers: {
				'/travail/ansible/derogation.yml':
					'jadwal_garde_derogation: retour urgent de la semaine dernière'
			},
			options: ['-e', '@derogation.yml'],
			attendu: 'refuse',
			dit: ['Dérogation refusée', "n'a pas la forme attendue"],
			sansRegistre: true,
			sansGithub: true
		},
		avecImage('derogation-precedente', { github: rouge(20) }, (precedente) => ({
			quoi: 'une dérogation restée dans un fichier passé par -e @fichier, pour une autre image',
			...image('derogation-suivante', { github: rouge(24) }),
			fichiers: {
				'/travail/ansible/derogation-precedente.yml': [
					'jadwal_garde_derogation:',
					`  image: '${precedente}'`,
					'  motif: retour urgent de la semaine dernière'
				].join('\n')
			},
			options: ['-e', '@derogation-precedente.yml'],
			attendu: 'refuse',
			dit: ['Dérogation refusée', 'une autre image', precedente],
			sansRegistre: true,
			sansGithub: true
		})),
		{
			// Le témoin des cas qui suivent : un parcours vert, et le rôle qui écrit l'image. La garde
			// tourne, la vérification ouvre le rôle, et le diff de `compose.env` montre l'image.
			quoi: 'un parcours vert, --tags application (rôle application en simulation)',
			...image('vert-application', { github: vert }),
			selection: ['--tags', 'application'],
			options: SIMULATION,
			attendu: 'passe',
			ecrit: true,
			gardeTourne: true,
			premiere: 'application : La garde est passée pour cette image',
			dit: ['a un parcours vert']
		},
		{
			quoi: 'un parcours rouge, --tags application --skip-tags always',
			...image('sauter-always', { github: rouge(25) }),
			selection: ['--tags', 'application', '--skip-tags', 'always'],
			options: SIMULATION,
			attendu: 'refuse',
			ecrit: false,
			dit: ['Déploiement refusé', 'aucune réussie']
		},
		{
			// Reprendre un déploiement interrompu, avec une nouvelle image : la garde et la
			// vérification sont avant la tâche de départ, et sautées. Les gabarits tiennent.
			quoi: 'un parcours rouge, --start-at-task « Une image, et par digest »',
			...image('reprise-image', { github: rouge(26) }),
			selection: [],
			options: [...SIMULATION, '--start-at-task', 'Une image, et par digest'],
			attendu: 'arrete',
			ecrit: false,
			dit: ['Image non gardée']
		},
		{
			quoi: 'un parcours rouge, --start-at-task « Le fichier d’environnement »',
			...image('reprise-environnement', { github: rouge(27) }),
			selection: [],
			options: [...SIMULATION, '--start-at-task', "Le fichier d'environnement"],
			attendu: 'arrete',
			ecrit: false,
			dit: []
		},
		// Démarrer à l'intérieur de la garde, sur la tâche qui pose le verdict ou juste avant : le
		// verdict naîtrait sans aucune vérification (relecture adverse du lot 3, ADV1 à ADV3). Les
		// tâches de la garde sont chargées d'un seul bloc, et `--start-at-task` ne les voit pas :
		// Ansible dit qu'il ne trouve pas la tâche, et ne joue rien.
		{
			quoi: 'un parcours rouge, une dérogation sans image, --start-at-task « La dérogation, retenue pour la pièce du déploiement »',
			...image('depart-derogation', { github: rouge(31) }),
			selection: ['--tags', 'application'],
			depart: 'La dérogation, retenue pour la pièce du déploiement',
			options: [
				...SIMULATION,
				'-e',
				'jadwal_garde_derogation=x',
				'--start-at-task',
				'La dérogation, retenue pour la pièce du déploiement'
			],
			attendu: 'introuvable',
			ecrit: false,
			sansRegistre: true,
			sansGithub: true
		},
		{
			quoi: 'un parcours rouge, -e garde_revision=0, --start-at-task « Le verdict, retenu pour la pièce du déploiement »',
			...image('depart-verdict', { github: rouge(32) }),
			selection: ['--tags', 'application'],
			depart: 'Le verdict, retenu pour la pièce du déploiement',
			options: [
				...SIMULATION,
				'-e',
				'garde_revision=0',
				'--start-at-task',
				'Le verdict, retenu pour la pièce du déploiement'
			],
			attendu: 'introuvable',
			ecrit: false,
			sansRegistre: true,
			sansGithub: true
		},
		avecImage('depart-motif-precedente', { github: rouge(33) }, (precedente) => ({
			quoi: 'un parcours rouge, une dérogation pour une autre image dans -e @fichier, --start-at-task « Un motif, pas un mot »',
			...image('depart-motif', { github: rouge(34) }),
			fichiers: {
				'/travail/ansible/derogation-ancienne.yml': [
					'jadwal_garde_derogation:',
					`  image: '${precedente}'`,
					'  motif: retour urgent de la semaine dernière'
				].join('\n')
			},
			selection: ['--tags', 'application'],
			depart: 'Un motif, pas un mot',
			options: [
				...SIMULATION,
				'-e',
				'@derogation-ancienne.yml',
				'--start-at-task',
				'Un motif, pas un mot'
			],
			attendu: 'introuvable',
			ecrit: false,
			sansRegistre: true,
			sansGithub: true
		})),
		{
			// La tête du bloc, elle, se voit : y démarrer joue la garde en entier.
			quoi: 'un parcours rouge, --start-at-task sur la tête de la garde « La garde, d’un seul bloc »',
			...image('depart-tete', { github: rouge(39) }),
			selection: ['--tags', 'application'],
			depart: "La garde, d'un seul bloc",
			options: [...SIMULATION, '--start-at-task', "La garde, d'un seul bloc"],
			attendu: 'refuse',
			ecrit: false,
			dit: ['Déploiement refusé', 'aucune réussie']
		},
		{
			// La garde sautée par une étiquette : le rôle qui écrit l'image doit le voir et s'arrêter.
			quoi: 'un parcours vert, mais la garde sautée (--tags application --skip-tags garde)',
			...image('sautee', { github: vert }),
			selection: ['--tags', 'application', '--skip-tags', 'garde'],
			options: SIMULATION,
			attendu: 'arrete',
			ecrit: false,
			dit: ['ne part pas sans la garde', "la garde n'a pas tourné"],
			sansRegistre: true
		},
		avecImage('forgee', { github: rouge(28) }, (reference) => ({
			// Le verdict de la garde passé en variable, sous son ancien nom et sous le nouveau : c'est
			// la garde seule qui le pose.
			quoi: 'un parcours rouge, la garde sautée et son verdict passé par -e',
			selection: ['--tags', 'application', '--skip-tags', 'garde'],
			options: [...SIMULATION, '-e', JSON.stringify(verdictForge(reference))],
			attendu: 'arrete',
			ecrit: false,
			dit: ['ne part pas sans la garde', 'réservées à la garde', 'garde_verdict'],
			sansRegistre: true
		})),
		// Les variables passées par `-e` l'emportent sur `set_fact` et sur `register` : une seule
		// suffisait à rendre vert le verdict d'une image rouge, la garde jouée en entier (ADV5, ADV6).
		// La garde refuse toute variable à son préfixe qui existe avant elle, avant la moindre
		// lecture.
		(() => {
			const verte = image('interne-revision-verte', { github: vert });
			return {
				quoi: 'un parcours rouge, la garde jouée en entier, -e garde_revision=<un commit vert>',
				...image('interne-revision', { github: rouge(36) }),
				selection: ['--tags', 'application'],
				options: [...SIMULATION, '-e', `garde_revision=${verte.revision}`],
				attendu: 'refuse',
				ecrit: false,
				dit: ['Déploiement refusé', 'garde_revision'],
				sansRegistre: true,
				sansGithub: true
			};
		})(),
		{
			quoi: 'un parcours rouge, la garde jouée en entier, -e garde_vertes=[…]',
			...image('interne-vertes', { github: rouge(37) }),
			selection: ['--tags', 'application'],
			options: [...SIMULATION, '-e', JSON.stringify({ garde_vertes: [{ id: 1 }] })],
			attendu: 'refuse',
			ecrit: false,
			dit: ['Déploiement refusé', 'garde_vertes'],
			sansRegistre: true,
			sansGithub: true
		},
		avecImage('faits-forges-garde', { github: rouge(40) }, (reference) => ({
			// Le verdict vit dans les faits du nœud de contrôle, que `-e ansible_facts` remplacerait.
			quoi: 'un parcours rouge, la garde jouée en entier, -e ansible_facts portant un verdict',
			selection: ['--tags', 'application'],
			options: [...SIMULATION, '-e', JSON.stringify(faitsForges(reference))],
			attendu: 'refuse',
			ecrit: false,
			dit: ['Déploiement refusé', 'ansible_facts.garde_verdict'],
			sansRegistre: true,
			sansGithub: true
		})),
		// La garde sautée par `--start-at-task`, et un verdict forgé : les gabarits ne lisent que le
		// verdict rangé dans les faits de ce passage (ADV4 et ses variantes).
		avecImage('reprise-verdict-e', { github: rouge(35) }, (reference) => ({
			quoi: 'un parcours rouge, un verdict passé par -e, --start-at-task « Une image, et par digest »',
			selection: [],
			options: [
				...SIMULATION,
				'-e',
				JSON.stringify(verdictForge(reference)),
				'--start-at-task',
				'Une image, et par digest'
			],
			attendu: 'arrete',
			ecrit: false,
			dit: ['Image non gardée']
		})),
		avecImage('reprise-faits-e', { github: rouge(41) }, (reference) => ({
			quoi: 'un parcours rouge, -e ansible_facts portant un verdict, --start-at-task « Une image, et par digest »',
			selection: [],
			options: [
				...SIMULATION,
				'-e',
				JSON.stringify(faitsForges(reference)),
				'--start-at-task',
				'Une image, et par digest'
			],
			attendu: 'arrete',
			ecrit: false,
			dit: ['Image non gardée']
		})),
		avecImage('reprise-inventaire', { github: rouge(42) }, (reference) => ({
			// L'inventaire ne peut pas écrire dans les faits : Ansible les range à part.
			quoi: 'un parcours rouge, un verdict dans host_vars/localhost.yml, --start-at-task « Une image, et par digest »',
			fichiers: { '/travail/ansible/host_vars/localhost.yml': verdictEnInventaire(reference) },
			selection: [],
			options: [...SIMULATION, '--start-at-task', 'Une image, et par digest'],
			attendu: 'arrete',
			ecrit: false,
			dit: ['Image non gardée']
		})),
		avecImage('sautee-inventaire', { github: rouge(38) }, (reference) => ({
			// ADV7 : le verdict posé pour localhost seul échappait à la vérification du serveur.
			quoi: 'un parcours rouge, un verdict dans host_vars/localhost.yml, --tags application --skip-tags garde',
			fichiers: { '/travail/ansible/host_vars/localhost.yml': verdictEnInventaire(reference) },
			selection: ['--tags', 'application', '--skip-tags', 'garde'],
			options: SIMULATION,
			attendu: 'arrete',
			ecrit: false,
			dit: ['ne part pas sans la garde', '--skip-tags garde'],
			sansRegistre: true
		})),
		avecImage('cache-ancien', { github: rouge(43) }, (reference) => ({
			// Un cache de faits persistant garde le verdict d'un passage à l'autre : il ne viendrait
			// plus de ce passage. Le passage d'avant le remplit comme la garde le ferait.
			quoi: 'un parcours rouge, un verdict resté dans un cache de faits (jsonfile), --start-at-task « Une image, et par digest »',
			fichiers: { '/travail/ansible/verdict-ancien.yml': passageQuiGardeUnVerdict(reference) },
			env: CACHE_PERSISTANT,
			aEffacer: [DOSSIER_DU_CACHE],
			prealable: ['verdict-ancien.yml'],
			selection: [],
			options: [...SIMULATION, '--start-at-task', 'Une image, et par digest'],
			attendu: 'arrete',
			ecrit: false,
			dit: ['Image non gardée']
		})),
		avecImage('cache-limite', { github: rouge(44) }, (reference) => ({
			// La même chose, la garde laissée hors de la limite : la première tâche du rôle le voit.
			quoi: 'un parcours rouge, un verdict resté dans un cache de faits (jsonfile), --limit cible',
			fichiers: { '/travail/ansible/verdict-ancien.yml': passageQuiGardeUnVerdict(reference) },
			env: CACHE_PERSISTANT,
			aEffacer: [DOSSIER_DU_CACHE],
			prealable: ['verdict-ancien.yml'],
			selection: ['--tags', 'application'],
			options: [...SIMULATION, '--limit', 'cible'],
			attendu: 'arrete',
			ecrit: false,
			dit: ['ne part pas sans la garde', 'jsonfile'],
			sansRegistre: true
		})),
		{
			quoi: 'un parcours vert, un cache de faits persistant (jsonfile), la garde jouée en entier',
			...image('cache-persistant', { github: vert }),
			env: CACHE_PERSISTANT,
			aEffacer: [DOSSIER_DU_CACHE],
			selection: ['--tags', 'application'],
			options: SIMULATION,
			attendu: 'refuse',
			ecrit: false,
			dit: ['Déploiement refusé', 'jsonfile'],
			sansRegistre: true,
			sansGithub: true
		},
		{
			// La garde tourne sur localhost : une limite au seul serveur la laisse dehors.
			quoi: 'un parcours vert, --limit cible (localhost hors de la limite)',
			...image('limite', { github: vert }),
			selection: ['--tags', 'application'],
			options: [...SIMULATION, '--limit', 'cible'],
			attendu: 'arrete',
			ecrit: false,
			dit: ['ne part pas sans la garde', "--limit 'cible,localhost'"],
			sansRegistre: true
		},
		{
			quoi: 'un parcours vert, --limit cible,localhost',
			...image('limite-localhost', { github: vert }),
			selection: ['--tags', 'application'],
			options: [...SIMULATION, '--limit', 'cible,localhost'],
			attendu: 'passe',
			ecrit: true,
			gardeTourne: true,
			dit: ['a un parcours vert']
		},
		{
			// ADV8 : la limite nomme localhost pour l'exclure. Le conseil doit porter sur la limite.
			quoi: "un parcours vert, --limit 'all:!localhost'",
			...image('limite-exclut', { github: vert }),
			selection: ['--tags', 'application'],
			options: [...SIMULATION, '--limit', 'all:!localhost'],
			attendu: 'arrete',
			ecrit: false,
			dit: ['ne part pas sans la garde', 'Elle tourne sur localhost', "--limit 'cible,localhost'"],
			sansRegistre: true
		},
		{
			// Seul le rôle `application` lit `jadwal_image` : un passage qui ne le joue pas n'a pas à
			// présenter une image verte.
			quoi: 'un passage limité aux tâches et au bloc de site (--tags taches,caddy)',
			...image('liste-taches', { github: rouge(29) }),
			selection: ['--tags', 'taches,caddy'],
			options: ['--list-tasks'],
			attendu: 'liste',
			verifier: (sortie) => [
				['la pièce de la garde n’a aucune tâche', !/^\s+garde : /m.test(sortie)],
				['le rôle application n’a aucune tâche', !/^\s+application : /m.test(sortie)],
				[
					'les rôles taches et caddy ont les leurs',
					/^\s+taches : /m.test(sortie) && /^\s+caddy : /m.test(sortie)
				]
			],
			sansRegistre: true,
			sansGithub: true
		}
	];
}

// ---------------------------------------------------------------------------------------------
// Le conteneur
// ---------------------------------------------------------------------------------------------

/**
 * Les fichiers suivis par git sous `infra/ansible/`, et le fichier Compose que le rôle
 * `application` recopie, dans un dossier temporaire. Un fichier nouveau ajouté par `git add -N` y
 * est ; le coffre et l'inventaire réels, ignorés, non.
 */
function copieDeTravail() {
	const dossier = mkdtempSync(join(tmpdir(), 'jadwal-garde-'));
	const suivis = ['infra/ansible', 'infra/compose/docker-compose.yml'];
	const fichiers = execFileSync('git', ['ls-files', '--', ...suivis], {
		cwd: racine,
		encoding: 'utf8'
	})
		.split('\n')
		.filter(Boolean)
		.filter((chemin) => existsSync(join(racine, chemin)));
	for (const chemin of fichiers) {
		const cible = join(dossier, chemin.replace(/^infra\//, ''));
		mkdirSync(dirname(cible), { recursive: true });
		copyFileSync(join(racine, chemin), cible);
	}
	return dossier;
}

async function preparerLeConteneur() {
	const copie = copieDeTravail();
	try {
		await docker([
			'run',
			'--detach',
			'--name',
			CONTENEUR,
			'--add-host',
			`${HOTE_DU_POSTE}:host-gateway`,
			IMAGE_PYTHON,
			'sleep',
			'infinity'
		]);
		await docker(['cp', join(copie, 'ansible'), `${CONTENEUR}:/source-ansible`]);
		await docker(['cp', join(copie, 'compose'), `${CONTENEUR}:/source-compose`]);
	} finally {
		rmSync(copie, { recursive: true, force: true });
	}
	// Les trois pièges d'un montage Windows qu'`infra/README.md` décrit valent aussi pour une
	// copie : droits recalculés, sinon Ansible ignore `ansible.cfg` sans rien dire.
	const preparation = [
		'set -e',
		`pip install --quiet --disable-pip-version-check --root-user-action=ignore 'ansible-core==${ANSIBLE_CORE}'`,
		'mkdir -p /travail && cp -r /source-ansible /travail/ansible && cp -r /source-compose /travail/compose',
		'chmod -R go-w /travail',
		// L'inventaire factice : un seul hôte, le conteneur lui-même, en connexion locale.
		`printf '[jadwal]\\ncible ansible_connection=local ansible_python_interpreter=/usr/local/bin/python3\\n' > /travail/ansible/inventory.ini`,
		// Un coffre factice, en clair : une valeur factice pour chaque clé que lisent les gabarits.
		`printf '%s: factice\\n' ${VALEURS_DU_COFFRE.join(' ')} > /travail/ansible/group_vars/all/vault.yml`,
		`printf 'factice\\n' > /tmp/phrase && chmod 600 /tmp/phrase`,
		// La doublure de `docker` : elle donne une version de Compose assez récente, et ne lance
		// rien. En `--check`, seule la lecture de version l'appelle.
		`printf '%s\\n' '#!/bin/sh' 'if [ "$1 $2 $3" = "compose version --short" ]; then echo 2.40.0; fi' 'exit 0' > /usr/local/bin/docker`,
		'chmod 755 /usr/local/bin/docker',
		'ansible-playbook --version | head -n 1'
	].join('\n');
	return (await docker(['exec', CONTENEUR, 'sh', '-c', preparation])).trim();
}

/** Pose un fichier dans le conteneur : une dérogation oubliée d'un passage précédent, par exemple. */
function poser(chemin, contenu) {
	return docker([
		'exec',
		CONTENEUR,
		'sh',
		'-c',
		'mkdir -p "$(dirname "$2")" && printf "%s\\n" "$1" > "$2"',
		'sh',
		contenu,
		chemin
	]);
}

/**
 * Efface ce qu'un cas a posé. Un `host_vars/localhost.yml` resté là fausserait tous les cas
 * suivants, et un cache de faits aussi.
 */
function effacer(chemins) {
	if (chemins.length === 0) return Promise.resolve('');
	return docker(['exec', CONTENEUR, 'rm', '-rf', '--', ...chemins]);
}

async function nettoyer() {
	await lancer('docker', ['rm', '--force', CONTENEUR]);
}

/**
 * `ansible-playbook` dans le conteneur, depuis `/travail/ansible`. `env` : des variables
 * d'environnement de plus, `K=V`, pour un réglage d'Ansible comme le cache de faits.
 */
function ansible(args, env = []) {
	return lancer('docker', [
		'exec',
		'--workdir',
		'/travail/ansible',
		'--env',
		'ANSIBLE_NOCOLOR=1',
		'--env',
		'ANSIBLE_VAULT_PASSWORD_FILE=/tmp/phrase',
		...env.flatMap((variable) => ['--env', variable]),
		CONTENEUR,
		'ansible-playbook',
		...args
	]);
}

/** Joue le playbook dans le conteneur. */
function jouer(
	reference,
	{ selection = ['--tags', 'garde'], options = [], variables = [], env = [] } = {}
) {
	return ansible(
		['jadwal.yml', ...selection, '-e', `jadwal_image=${reference}`, ...variables, ...options],
		env
	);
}

/**
 * Les noms des tâches de la garde, lus dans ses fichiers. Un cas qui démarre sur l'une d'elles
 * vérifie d'abord qu'elle existe : sinon, « tâche introuvable » ne prouverait rien.
 */
function tachesDeLaGarde() {
	const dossier = join(racine, 'infra', 'ansible', 'roles', 'garde', 'tasks');
	const fichiers = execFileSync('git', ['ls-files', '--', dossier], {
		cwd: racine,
		encoding: 'utf8'
	})
		.split('\n')
		.filter((chemin) => chemin.endsWith('.yml') && existsSync(join(racine, chemin)));
	const noms = new Set();
	for (const chemin of fichiers) {
		for (const [, nom] of readFileSync(join(racine, chemin), 'utf8').matchAll(
			/^\s*- name: (.+?)\s*$/gm
		)) {
			noms.add(nom.replace(/^'(.*)'$/, '$1').replace(/''/g, "'"));
		}
	}
	return noms;
}

// ---------------------------------------------------------------------------------------------
// La lecture de la sortie
// ---------------------------------------------------------------------------------------------

/** Les lignes du récapitulatif, par hôte : `{ localhost: { ok: 5, failed: 1, … } }`. */
function recapitulatif(sortie) {
	const debut = sortie.indexOf('PLAY RECAP');
	if (debut < 0) return {};
	const hotes = {};
	for (const ligne of sortie.slice(debut).split('\n').slice(1)) {
		const trouve = /^(\S+)\s+:\s+(.*)$/.exec(ligne.trim());
		if (!trouve) continue;
		hotes[trouve[1]] = Object.fromEntries(
			[...trouve[2].matchAll(/(\w+)=(\d+)/g)].map(([, cle, valeur]) => [cle, Number(valeur)])
		);
	}
	return hotes;
}

/**
 * Ce que la garde a dit : le message d'un refus, ou la ligne d'un passage. Les lignes utiles de la
 * sortie, sans les titres de tâches ni les lignes vides.
 */
function paroles(sortie) {
	const lignes = sortie.split('\n');
	const gardees = [];
	let dedans = false;
	for (const ligne of lignes) {
		if (/^(fatal|ok|failed): \[/.test(ligne) || /^\s+msg: /.test(ligne)) dedans = true;
		if (/^(TASK|PLAY|RUNNING HANDLER) /.test(ligne)) dedans = false;
		if (dedans && ligne.trim() !== '') gardees.push(ligne);
	}
	return gardees.filter((ligne) => !/^(ok|skipping): \[\w+\]$/.test(ligne));
}

/** La sortie, tâche par tâche : le titre entre crochets, puis ce qu'Ansible a écrit dessous. */
function blocs(sortie) {
	const liste = [];
	for (const ligne of sortie.split('\n')) {
		const titre = /^TASK \[(.+)\]\s*\**\s*$/.exec(ligne);
		if (titre) liste.push({ titre: titre[1], corps: '' });
		else if (/^(PLAY|RUNNING HANDLER) /.test(ligne)) liste.push({ titre: '', corps: '' });
		else if (liste.length > 0) liste[liste.length - 1].corps += `${ligne}\n`;
	}
	return liste;
}

/** Une tâche a tourné sur l'hôte visé, sans échec : écrite, ou écrite en simulation. */
const passee = (sortie, titre) =>
	blocs(sortie).some(
		(bloc) => bloc.titre === titre && /^(ok|changed): \[cible\]/m.test(bloc.corps)
	);

/**
 * Le rôle `application` a-t-il écrit une image, ou l'aurait-il écrite en simulation ? Une ligne
 * `JADWAL_IMAGE=` dans un diff, ou l'une des deux tâches qui l'écrivent passée sans échec.
 */
const imageEcrite = (sortie) =>
	sortie.includes('JADWAL_IMAGE=') ||
	TACHES_QUI_ECRIVENT_L_IMAGE.some((titre) => passee(sortie, titre));

const tacheJouee = (sortie, debut) => blocs(sortie).some(({ titre }) => titre.startsWith(debut));

// ---------------------------------------------------------------------------------------------
// Le déroulé
// ---------------------------------------------------------------------------------------------

const serveur = createServer(avecDefi);
/**
 * Sous Linux, `host-gateway` mène à l'interface du pont Docker : le serveur doit écouter sur toutes
 * les interfaces pour y répondre. Docker Desktop, lui, fait suivre vers la boucle locale du poste,
 * et l'on n'ouvre rien de plus que nécessaire.
 */
const ECOUTE = process.platform === 'linux' ? '0.0.0.0' : '127.0.0.1';

const reel = process.argv.indexOf('--reel');
const imageReelle = reel >= 0 ? (process.argv[reel + 1] ?? '') : '';
/** Ce qui suit l'image passe tel quel au playbook : `-e jadwal_garde_flux=ci.yml`, par exemple. */
const optionsReelles = reel >= 0 ? process.argv.slice(reel + 2) : [];
if (reel >= 0 && !imageReelle) {
	process.stderr.write('Usage : --reel ghcr.io/<compte>/jadwal@sha256:<digest>\n');
	process.exit(2);
}

let echecs = [];
let verifications = 0;
let nombreDeCas = 0;

try {
	if (imageReelle) {
		process.stdout.write(`${IMAGE_PYTHON}, ansible-core ${ANSIBLE_CORE}, conteneur jetable.\n`);
		process.stdout.write(`${await preparerLeConteneur()}\n\n`);
		process.stdout.write(`La garde, contre les vraies API, pour ${imageReelle} :\n\n`);
		const { code, sortie } = await jouer(imageReelle, { options: optionsReelles });
		process.stdout.write(`${sortie}\nCode de retour du playbook : ${code}\n`);
		process.exitCode = code;
	} else {
		await new Promise((resolue) => serveur.listen(0, ECOUTE, resolue));
		const { port } = /** @type {import('node:net').AddressInfo} */ (serveur.address());
		HOTE_REGISTRE = `${HOTE_DU_POSTE}:${port}`;
		ADRESSE = `http://${HOTE_REGISTRE}`;

		process.stdout.write(
			`${IMAGE_PYTHON}, ansible-core ${ANSIBLE_CORE}, conteneur jetable ; fausse API sur ` +
				`${ECOUTE}:${port}, jointe par ${ADRESSE}.\n`
		);
		process.stdout.write(`${await preparerLeConteneur()}\n`);

		const tous = lesCas();
		nombreDeCas = tous.length;
		const nomsDeLaGarde = tachesDeLaGarde();
		for (const cas of tous) {
			for (const [chemin, contenu] of Object.entries(cas.fichiers ?? {})) {
				await poser(chemin, contenu);
			}
			// Un passage d'avant, joué avec les mêmes réglages : un cache de faits qu'il remplit, par
			// exemple. Il doit réussir, sans quoi le cas n'éprouverait rien.
			const prealable = cas.prealable ? await ansible(cas.prealable, cas.env) : null;
			requetes = [];
			fluxPousses = new Set(cas.fluxPousses ?? [FLUX]);
			// `ansible_become=false` : le conteneur tourne en root et n'a pas de `sudo`. Les tâches du
			// rôle `application` qui demandent `become` tournent donc telles quelles.
			const variables = [
				'-e',
				`jadwal_garde_registre=${cas.registre ?? ADRESSE}`,
				'-e',
				`jadwal_garde_api_github=${cas.apiGithub ?? `${ADRESSE}/github`}`,
				'-e',
				'ansible_become=false'
			];
			const { code, sortie } = await jouer(cas.reference, {
				selection: cas.selection,
				options: cas.options,
				variables,
				env: cas.env
			});
			await effacer([...Object.keys(cas.fichiers ?? {}), ...(cas.aEffacer ?? [])]);
			const recap = recapitulatif(sortie);
			const cible = recap['cible'];
			const garde = recap['localhost'];

			const constats = [];
			const constater = (quoi, condition) => {
				verifications += 1;
				constats.push({ quoi, condition });
			};
			if (prealable) {
				constater('le passage d’avant réussit', prealable.code === 0);
			}
			if (cas.depart) {
				constater(`la tâche « ${cas.depart} » existe dans la garde`, nomsDeLaGarde.has(cas.depart));
			}
			if (cas.attendu === 'introuvable') {
				constater(
					'Ansible ne trouve pas la tâche de départ',
					sortie.includes(`No matching task "${cas.depart}" found`)
				);
				constater(
					'aucune tâche ne tourne, ni sur le nœud de contrôle ni sur le serveur',
					blocs(sortie).every(({ titre }) => titre === '') && Object.keys(recap).length === 0
				);
			} else if (cas.attendu === 'passe') {
				constater('le playbook sort en 0', code === 0);
				constater(
					'la seconde pièce commence, sans échec',
					cible !== undefined && cible['failed'] === 0
				);
			} else if (cas.attendu === 'refuse') {
				constater('le playbook sort en erreur', code !== 0);
				constater('la garde échoue sur le nœud de contrôle', (garde?.['failed'] ?? 0) > 0);
				constater(
					'la seconde pièce ne commence pas : l’hôte visé est absent du récapitulatif',
					cible === undefined
				);
			} else if (cas.attendu === 'arrete') {
				constater('le playbook sort en erreur', code !== 0);
				constater(
					'la seconde pièce s’arrête sur une tâche en échec',
					cible !== undefined && cible['failed'] === 1
				);
			} else {
				constater('Ansible liste les tâches sans erreur', code === 0);
			}
			if (cas.ecrit === true) {
				constater(
					'compose.env recevrait l’image demandée (diff « +JADWAL_IMAGE=… »)',
					sortie.includes(`+JADWAL_IMAGE=${cas.reference}`)
				);
				constater(
					'jadwal.env serait écrit',
					passee(sortie, "application : Le fichier d'environnement")
				);
			} else if (cas.ecrit === false) {
				constater(
					'aucune image n’est écrite, ni dans compose.env ni dans jadwal.env',
					!imageEcrite(sortie)
				);
			}
			if (cas.gardeTourne) constater('la garde a tourné', tacheJouee(sortie, 'garde : '));
			if (cas.premiere) {
				const premiere = blocs(sortie).find(({ titre }) => titre.startsWith('application : '));
				constater(
					`la première tâche du rôle est « ${cas.premiere} »`,
					premiere?.titre === cas.premiere
				);
			}
			for (const [quoi, condition] of cas.verifier?.(sortie) ?? []) constater(quoi, condition);
			for (const morceau of cas.dit ?? [])
				constater(`la sortie dit « ${morceau} »`, sortie.includes(morceau));
			if (cas.ignore) {
				constater(
					'la dérogation reste au récapitulatif (ignored=1)',
					garde !== undefined && garde['ignored'] === 1
				);
			}
			if (cas.sansGithub) {
				constater(
					'GitHub n’est pas interrogé',
					!requetes.some((requete) => requete.includes(' /github/'))
				);
			}
			if (cas.sansRegistre) {
				constater(
					'le faux registre n’est pas interrogé',
					!requetes.some((requete) => / \/(v2|token|stockage)/.test(requete))
				);
			}

			const rate = constats.filter(({ condition }) => !condition);
			process.stdout.write(`\n${rate.length === 0 ? 'ok  ' : 'NON '} ${cas.quoi}\n`);
			process.stdout.write(`       ${cas.reference}\n`);
			for (const ligne of paroles(sortie)) process.stdout.write(`     | ${ligne}\n`);
			for (const [hote, compte] of Object.entries(recap)) {
				process.stdout.write(
					`     > ${hote} : ${Object.entries(compte)
						.filter(([, valeur]) => valeur > 0)
						.map(([cle, valeur]) => `${cle}=${valeur}`)
						.join(' ')}\n`
				);
			}
			for (const { quoi, condition } of constats) {
				process.stdout.write(`       ${condition ? 'ok ' : 'NON'} ${quoi}\n`);
			}
			if (rate.length > 0) {
				echecs.push(`${cas.quoi} : ${rate.map(({ quoi }) => quoi).join(' ; ')}`);
				process.stdout.write(`\n       La sortie complète :\n`);
				for (const ligne of sortie.split('\n')) process.stdout.write(`       : ${ligne}\n`);
			}
		}

		// Le dépôt et le flux demandés à GitHub sont ceux du dépôt : le fichier du flux existe.
		const flux = [...new Set(demandesGithub.map(({ flux: nom }) => nom))];
		const depots = [...new Set(demandesGithub.map(({ depot }) => depot))];
		process.stdout.write(
			`\nDemandé à GitHub : dépôt ${depots.join(', ')}, flux ${flux.join(', ')}.\n`
		);
		verifications += 1;
		const fichierDuFlux = join(racine, '.github', 'workflows', flux[0] ?? '');
		if (flux.length !== 1 || !existsSync(fichierDuFlux)) {
			echecs.push(
				`le flux demandé à GitHub n’est pas un fichier de .github/workflows : ${flux.join(', ')}`
			);
		} else {
			// Chaque commit doit garder son verdict : une exécution annulée avant d'avoir tourné n'en
			// a aucun, et la garde refuse son image. Il faut donc que le flux n'annule ni l'exécution
			// en cours (`cancel-in-progress: false`) ni celles qui attendent (`queue: max`, jusqu'à
			// cent ; la valeur par défaut, `single`, n'en garde qu'une).
			const concurrence =
				/^concurrency:\r?\n((?:[ \t]+.*\r?\n)+)/m.exec(readFileSync(fichierDuFlux, 'utf8'))?.[1] ??
				'';
			process.stdout.write(`\nLa concurrence de ${flux[0]} :\n${concurrence}`);
			for (const [quoi, motif] of [
				[
					'n’annule pas l’exécution en cours (cancel-in-progress: false)',
					/^\s+cancel-in-progress:\s*false\s*$/m
				],
				['garde toutes les exécutions en attente (queue: max)', /^\s+queue:\s*max\s*$/m]
			]) {
				verifications += 1;
				const tenu = motif.test(concurrence);
				process.stdout.write(`${tenu ? 'ok ' : 'NON'} ${flux[0]} ${quoi}\n`);
				if (!tenu) echecs.push(`${flux[0]} ${quoi} : non`);
			}
		}
	}
} finally {
	serveur.close();
	await nettoyer();
}

if (!imageReelle) {
	if (echecs.length > 0) {
		process.stderr.write(`\nCe qui a échoué :\n`);
		for (const echec of echecs) process.stderr.write(`  - ${echec}\n`);
		process.stderr.write(
			`\nLa garde du déploiement laisse passer ce qu’elle devrait arrêter, ou arrête ce qu’elle\n` +
				`devrait laisser passer. Corriger infra/ansible/roles/garde/, roles/application/ ou\n` +
				`jadwal.yml, puis relancer.\n`
		);
		process.exitCode = 1;
	} else {
		process.stdout.write(
			`\nLes ${verifications} vérifications de ${nombreDeCas} cas passent. Quand elle tourne, la garde\n` +
				`laisse passer un parcours vert et refuse les autres images avant la moindre connexion au\n` +
				`serveur. Aucune des sélections de tâches ni des variables forgées éprouvées ici n'écrit une\n` +
				`image qu'elle n'a pas passée dans ce passage.\n`
		);
	}
}

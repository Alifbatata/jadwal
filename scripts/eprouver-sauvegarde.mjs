#!/usr/bin/env node
/**
 * Éprouve la tâche de sauvegarde entière, jusqu'à la vérification de l'âge des objets distants.
 *
 *     node scripts/eprouver-sauvegarde.mjs
 *
 * ## Pourquoi ce test existe
 *
 * La règle du dépôt, depuis l'étape 12 : un script qu'aucun test ne lance n'est pas éprouvé, et
 * chaque script bash modifié est éprouvé dans un conteneur. `jadwal-sauvegarde.sh` ne l'était pas.
 * Il le devient au moment où il gagne un contrôle qui ne doit jamais se taire : chaque nuit, il liste
 * la destination et refuse tout objet plus vieux que l'âge promis pour son préfixe (ADR 0037). Un
 * contrôle de ce genre se rate de deux façons, et ce test cherche les deux : laisser passer un objet
 * trop vieux, et prendre une liste qui a échoué pour une liste où il n'y a rien à signaler.
 *
 * ## Ce qu'il joue
 *
 * Le script tel qu'il est livré, avec le socle commun et `jadwal-retention.sh`, lancé comme systemd
 * le lance, dans un conteneur tiré de **l'image de Node de la production**, lue dans le `Dockerfile` :
 * bash et les outils GNU pour le script, Node pour les trois règles de `infra/sauvegarde/`, qui
 * tournent pour de vrai, recopiées sous les noms que le rôle Ansible leur donne.
 *
 * **rclone est le vrai**, tiré de son image officielle, avec une destination locale : un dossier du
 * conteneur, dont les objets ont de vraies dates. La liste que la règle reçoit est donc celle que
 * rclone écrit, pas une imitation. Une enveloppe mince ne remplace que ce qu'une destination locale
 * ne sait pas imiter : l'empreinte à distance, que le stockage retenu ne calcule pas, une liste en
 * échec, et une liste faite ailleurs, qui ne montre pas les objets de la nuit.
 *
 * **Chaque passage est joué avec deux versions de rclone**, chacune épinglée par son empreinte.
 * Le rôle Ansible installe le paquet rclone de la distribution, souvent bien plus ancien que l'image
 * officielle : 1.60.1 est la version des paquets des distributions stables d'aujourd'hui, 1.75.1 une
 * version récente. Ce que la tâche fait de la liste ne doit dépendre ni de l'une ni de l'autre.
 *
 * Elle envoie aussi la liste de quatre passages à un **faux stockage S3**, servi par Node dans le
 * même conteneur : il rend en liste le dossier de la destination, chaque objet daté de son fichier,
 * répond 404 `NoSuchBucket` pour tout autre seau, comme S3, et refuse toute autre requête, la
 * lecture des métadonnées d'un objet (HEAD) comprise. C'est le cas que seul S3 connaît : rclone qui
 * lit la date d'un objet par un HEAD, et qui voit ce HEAD échouer, met l'heure présente à la place
 * et sort sans erreur, en 1.60.1 comme en 1.75.1. Seule la commande de liste va au faux stockage,
 * avec les options que le script lui donne ; l'envoi et la relecture restent locaux. Le faux
 * stockage date chaque objet de son fichier, et le nom de l'objet peut porter une autre date : il
 * imite de cette façon une archive recopiée, que le stockage date de son nouveau dépôt.
 *
 * Deux de ces passages éprouvent ce que rclone rend quand la destination n'existe pas. Pour un
 * chemin absent d'un seau qui existe, une liste vide, sans erreur : c'est la règle qui doit la
 * refuser. Pour un seau absent, une erreur (« directory not found »), qui fait échouer la liste
 * elle-même.
 *
 * Trois doublures, et rien d'autre : `docker` (la vidange dans le conteneur de la base, et les
 * conteneurs jetables des règles, qui lancent Node sur le fichier monté), `age` (qui écrit l'en-tête
 * sans chiffrer), `curl` (qui note les battements de cœur au lieu de les envoyer).
 *
 * Il a besoin de Docker, et tire trois images s'il ne les a pas. `JADWAL_RCLONE_IMAGE` remplace les
 * deux versions de rclone par une seule image, pour en essayer une autre.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const racine = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

// L'image de Node de la production, lue dans le Dockerfile : les règles tournent sur le serveur
// dans l'image de l'application, et c'est cette Node-là qui doit les lire ici.
const dockerfile = readFileSync(join(racine, 'Dockerfile'), 'utf8');
const IMAGE_NODE =
	process.env['JADWAL_NODE_IMAGE'] ??
	/^FROM (node@sha256:[0-9a-f]{64}) AS runtime$/m.exec(dockerfile)?.[1];
if (!IMAGE_NODE) throw new Error("Le Dockerfile n'a plus d'étage « runtime » tiré de node@sha256");

// Les deux versions de rclone, chacune épinglée par l'empreinte de son index multi-architecture.
const RCLONES = process.env['JADWAL_RCLONE_IMAGE']
	? [{ version: null, image: process.env['JADWAL_RCLONE_IMAGE'] }]
	: [
			{
				version: '1.60.1',
				image:
					'rclone/rclone@sha256:895e89550af5f00e2b3d0b2849a8caa0e17a99b8e57d6e1dac7ecb07289e71a3'
			},
			{
				version: '1.75.1',
				image:
					'rclone/rclone@sha256:45401ad7410db1d67ffdb58e19059ad20b0d8e0285a60e38bbec55cc1019c7a5'
			}
		];

const JOUR = 86_400;
const MINUTE = 60;

/**
 * Les passages, et ce que la tâche doit en dire.
 *
 * `depots` : ce qui est déjà chez le stockage avant la nuit, `[préfixe, âge du dépôt, âge du nom]`
 * en secondes, chaque archive avec son empreinte, datées pareil. Sans âge du nom, le nom porte la
 * date du dépôt. `liste` pilote l'enveloppe de rclone : `reelle` laisse faire le vrai rclone, et
 * `s3`, `s3-chemin-absent` et `s3-seau-absent` lui font lister le faux stockage S3.
 */
const DANS_LES_AGES = [
	// À dix minutes de chaque limite depuis leur dépôt, et nommés vingt minutes plus tôt, comme après
	// une vidange et un envoi de vingt minutes : dans la promesse depuis le dépôt, déjà trop vieux
	// depuis le nom. La règle laisse une heure à la nuit pour déposer ce qu'elle a nommé.
	['quotidien', 9 * JOUR - 10 * MINUTE, 9 * JOUR + 10 * MINUTE],
	['hebdo', 30 * JOUR - 10 * MINUTE, 30 * JOUR + 10 * MINUTE],
	['mensuel', 182 * JOUR - 10 * MINUTE, 182 * JOUR + 10 * MINUTE]
];

const PASSAGES = [
	{
		nom: 'tout est dans les âges',
		depots: DANS_LES_AGES,
		liste: 'reelle',
		code: 0,
		attendu: ["aucun plus vieux que l'âge promis pour son préfixe", 'réussite enregistrée'],
		interdit: ['ÉCHEC'],
		battement: 'ok'
	},
	{
		nom: 'un objet de mensuel/ a 183 jours',
		depots: [...DANS_LES_AGES, ['mensuel', 183 * JOUR]],
		liste: 'reelle',
		code: 1,
		attendu: [
			"ÉCHEC : l'archive est partie et a été relue, mais la vérification de l'âge des objets distants a échoué : " +
				"2 objets distants plus vieux que l'âge promis pour leur préfixe, sur ",
			// L'archive et son empreinte, toutes deux signalées.
			'.dump.age : 183 jours 0 h',
			'.dump.age.sha256 : 183 jours 0 h',
			'pour 182 jours promis sous mensuel/'
		],
		interdit: ['réussite enregistrée'],
		battement: 'fail'
	},
	{
		nom: 'un objet hors des trois préfixes',
		depots: DANS_LES_AGES,
		racine: 'notes.txt',
		liste: 'reelle',
		code: 1,
		attendu: ['1 objet distant hors des trois préfixes', 'notes.txt : 0 jour 0 h'],
		interdit: ['réussite enregistrée'],
		battement: 'fail'
	},
	{
		nom: 'la liste de la destination échoue',
		depots: DANS_LES_AGES,
		liste: 'echec',
		code: 1,
		attendu: [
			"ÉCHEC : l'archive est partie et a été relue, mais la liste de exemple:/distant a échoué"
		],
		interdit: ['réussite enregistrée', 'aucun plus vieux'],
		battement: 'fail'
	},
	{
		// Le vrai rclone, vers un chemin absent d'un seau qui existe : il rend une liste vide et sort
		// en 0. C'est la règle qui refuse cette liste, pas rclone qui échoue.
		nom: 'la liste d’un chemin absent du seau revient vide, sans erreur',
		depots: DANS_LES_AGES,
		liste: 's3-chemin-absent',
		code: 1,
		attendu: ['liste illisible : la liste ne contient aucun objet'],
		interdit: ['réussite enregistrée', 'aucun plus vieux', 'la liste de exemple:/distant a échoué'],
		battement: 'fail'
	},
	{
		// Le vrai rclone, vers un seau absent : le faux stockage répond 404 NoSuchBucket, comme S3, et
		// rclone sort en erreur. C'est la liste elle-même qui échoue.
		nom: 'la liste d’un seau absent échoue',
		depots: DANS_LES_AGES,
		liste: 's3-seau-absent',
		code: 1,
		attendu: [
			"ÉCHEC : l'archive est partie et a été relue, mais la liste de exemple:/distant a échoué",
			'directory not found'
		],
		interdit: ['réussite enregistrée', 'aucun plus vieux', 'liste illisible'],
		battement: 'fail'
	},
	{
		// Une liste qui n'est pas vide, dont chaque objet est dans les âges, mais qui ne montre pas
		// ce que la nuit vient d'envoyer : elle ne regarde pas là où la nuit a écrit.
		nom: 'la liste ne montre pas les objets de la nuit',
		depots: DANS_LES_AGES,
		liste: 'ailleurs',
		code: 1,
		attendu: [
			// La liste a été lue : le refus ne doit pas se dire « illisible ».
			"liste incomplète : la liste ne montre pas ce que cette nuit vient d'envoyer (quotidien/jadwal-",
			'.dump.age.sha256) : lue sans erreur, elle regarde ailleurs, ou elle est tronquée'
		],
		interdit: ['réussite enregistrée', 'aucun plus vieux', 'liste illisible'],
		battement: 'fail'
	},
	{
		// Le faux stockage S3 refuse tout HEAD. Un objet de 21 jours doit être signalé quand même :
		// sa date vient de la liste, pas d'une lecture qui peut échouer sans rien dire. Et c'est la
		// date de la liste qui doit le signaler, pas celle de son nom, qui ne ferait que rattraper.
		nom: 'S3 refuse la lecture des métadonnées, et un objet de quotidien/ a 21 jours',
		depots: [...DANS_LES_AGES, ['quotidien', 21 * JOUR]],
		liste: 's3',
		code: 1,
		attendu: [
			"ÉCHEC : l'archive est partie et a été relue, mais la vérification de l'âge des objets distants a échoué : " +
				"2 objets distants plus vieux que l'âge promis pour leur préfixe, sur ",
			'.dump.age : 21 jours 0 h',
			'.dump.age.sha256 : 21 jours 0 h',
			'pour 9 jours promis sous quotidien/'
		],
		interdit: ['réussite enregistrée', 'aucun plus vieux', 'compté depuis la date de son nom'],
		battement: 'fail'
	},
	{
		// Une archive vidée il y a 206 jours, recopiée il y a 13 jours (un changement de stockage, une
		// copie entre seaux) : le stockage la date de son nouveau dépôt, et son cycle de vie la
		// garderait encore 168 jours. Son nom garde la date de la vidange, et c'est lui qui compte.
		nom: 'une archive de mensuel/ vidée il y a 206 jours, recopiée il y a 13 jours',
		depots: [...DANS_LES_AGES, ['mensuel', 13 * JOUR, 206 * JOUR]],
		liste: 's3',
		code: 1,
		attendu: [
			"ÉCHEC : l'archive est partie et a été relue, mais la vérification de l'âge des objets distants a échoué : " +
				"2 objets distants plus vieux que l'âge promis pour leur préfixe, sur ",
			'.dump.age : 206 jours 0 h',
			'.dump.age.sha256 : 206 jours 0 h',
			'pour 182 jours promis sous mensuel/, compté depuis la date de son nom' +
				' (déposé chez le stockage il y a 13 jours 0 h'
		],
		interdit: ['réussite enregistrée', 'aucun plus vieux'],
		battement: 'fail'
	}
];

/** Les doublures et l'enveloppe, écrites ici pour qu'on lise dans ce fichier ce que le script croit trouver. */
const DOUBLURES = {
	docker: `#!/bin/sh
# Ce que la sauvegarde demande à Docker, et rien de plus.
case "$*" in
  compose*" exec -T db "*)
    # pg_dump, dans le conteneur de la base : une vidange factice de huit kilo-octets.
    printf 'PGDMP'
    head -c 8192 /dev/zero | tr '\\0' 'x'
    exit 0 ;;
  run*)
    # Un conteneur jetable qui joue une règle : Node sur le fichier monté, pour de vrai, avec
    # l'entrée standard telle quelle.
    source=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --volume) source="\${2%%:*}"; shift 2 ;;
        node) shift 2; exec node "$source" "$@" ;;
        *) shift ;;
      esac
    done
    echo "doublure docker : pas de node dans l'appel" >&2
    exit 125 ;;
esac
echo "doublure docker : appel inattendu : $*" >&2
exit 125
`,
	age: `#!/bin/sh
# Chiffre pour de faux : l'en-tête d'age, puis l'entrée telle quelle.
sortie=""
while [ $# -gt 0 ]; do
  case "$1" in
    --output) sortie="$2"; shift 2 ;;
    *) shift ;;
  esac
done
{ printf 'age-encryption.org/v1\\n'; cat; } > "$sortie"
`,
	curl: `#!/bin/sh
# Un battement de cœur : on note l'adresse, le dernier argument, et l'on n'envoie rien.
for adresse in "$@"; do :; done
printf '%s\\n' "$adresse" >> /tmp/battements.txt
exit 0
`,
	rclone: `#!/bin/sh
# L'enveloppe du vrai rclone. Elle ne remplace que ce qu'une destination locale ne sait pas imiter.
case " $* " in
  *" hashsum "*)
    # Le stockage retenu ne calcule pas d'empreinte à distance : le script relit alors l'objet.
    echo "ERROR : hash unsupported" >&2
    exit 1 ;;
  *" lsjson "*)
    case "\${JADWAL_EPREUVE_LISTE:-reelle}" in
      echec) echo "ERROR : error listing: couldn't connect to the destination" >&2; exit 3 ;;
      # La même commande, avec les mêmes options, vers une autre destination, qui est le dernier
      # argument : le faux stockage S3 (son seau, un chemin absent de ce seau, un seau absent), ou
      # une copie de la destination prise avant la nuit.
      s3*|ailleurs)
        case "$JADWAL_EPREUVE_LISTE" in
          s3) autre=faux-s3:seau ;;
          s3-chemin-absent) autre=faux-s3:seau/absent ;;
          s3-seau-absent) autre=faux-s3:sans-seau ;;
          *) autre=exemple:/ailleurs ;;
        esac
        n=$#
        i=0
        for argument in "$@"; do
          i=$((i + 1))
          [ "$i" -eq "$n" ] && argument="$autre"
          set -- "$@" "$argument"
        done
        shift "$n" ;;
    esac ;;
esac
exec /usr/local/lib/rclone-reel "$@"
`,
	'faux-s3.mjs': `// Un faux stockage S3, le temps d'un passage. Il rend en liste le dossier /distant, chaque objet
// daté de son fichier, sous le seau « seau » ; tout autre seau n'existe pas. Il refuse tout le
// reste, la lecture des métadonnées d'un objet (HEAD) comprise. Chaque requête est notée dans
// /tmp/faux-s3.log, pour qu'on voie ce que rclone a demandé.
import { appendFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

const echapper = (texte) =>
	texte.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function objets(dossier, prefixe) {
	return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) =>
		entree.isDirectory()
			? objets(join(dossier, entree.name), prefixe + entree.name + '/')
			: [{ cle: prefixe + entree.name, fichier: statSync(join(dossier, entree.name)) }]
	);
}

createServer((requete, reponse) => {
	const adresse = new URL(requete.url, 'http://faux-s3');
	appendFileSync('/tmp/faux-s3.log', requete.method + ' ' + adresse.pathname + adresse.search + '\\n');
	// Un seau qui n'existe pas : S3 répond 404 NoSuchBucket, à la liste comme à toute autre requête.
	if (adresse.pathname.split('/')[1] !== 'seau') {
		reponse.writeHead(404, { 'Content-Type': 'application/xml' });
		return reponse.end(requete.method === 'HEAD' ? '' : '<Error><Code>NoSuchBucket</Code></Error>');
	}
	if (requete.method !== 'GET' || adresse.pathname !== '/seau') {
		reponse.writeHead(403, { 'Content-Type': 'application/xml' });
		return reponse.end(requete.method === 'HEAD' ? '' : '<Error><Code>AccessDenied</Code></Error>');
	}
	const prefixe = adresse.searchParams.get('prefix') ?? '';
	const delimiteur = adresse.searchParams.get('delimiter') ?? '';
	const fichiers = [];
	const dossiers = new Set();
	for (const objet of objets('/distant', '').sort((a, b) => (a.cle < b.cle ? -1 : 1))) {
		if (!objet.cle.startsWith(prefixe)) continue;
		const coupure = delimiteur ? objet.cle.indexOf(delimiteur, prefixe.length) : -1;
		if (coupure === -1) fichiers.push(objet);
		else dossiers.add(objet.cle.slice(0, coupure + delimiteur.length));
	}
	const corps =
		'<?xml version="1.0" encoding="UTF-8"?>' +
		'<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
		'<Name>seau</Name><Prefix>' + echapper(prefixe) + '</Prefix><Marker></Marker>' +
		'<KeyCount>' + (fichiers.length + dossiers.size) + '</KeyCount><MaxKeys>1000</MaxKeys>' +
		'<Delimiter>' + echapper(delimiteur) + '</Delimiter><IsTruncated>false</IsTruncated>' +
		fichiers
			.map(
				(o) =>
					'<Contents><Key>' + echapper(o.cle) + '</Key>' +
					'<LastModified>' + o.fichier.mtime.toISOString() + '</LastModified>' +
					'<ETag>"00000000000000000000000000000000"</ETag><Size>' + o.fichier.size + '</Size>' +
					'<StorageClass>STANDARD</StorageClass></Contents>'
			)
			.join('') +
		[...dossiers].map((d) => '<CommonPrefixes><Prefix>' + echapper(d) + '</Prefix></CommonPrefixes>').join('') +
		'</ListBucketResult>';
	reponse.writeHead(200, { 'Content-Type': 'application/xml' });
	reponse.end(corps);
}).listen(9000, '127.0.0.1', () => writeFileSync('/tmp/faux-s3.pret', ''));
`
};

const dossier = mkdtempSync(join(tmpdir(), 'jadwal-sauvegarde-'));
const echecs = [];
const nomDe = (rclone) => (rclone.version ? `rclone ${rclone.version}` : rclone.image);

try {
	process.stdout.write(
		`La tâche de sauvegarde, lancée dans ${IMAGE_NODE.slice(0, 19)}… comme systemd la lance,\n` +
			`avec le vrai rclone, en ${RCLONES.map((rclone) => rclone.version ?? rclone.image).join(' puis en ')}.\n`
	);

	for (const [nom, source] of Object.entries(DOUBLURES)) {
		writeFileSync(join(dossier, nom), source, 'utf8');
	}
	// Le fichier d'environnement du serveur, réduit à ce que la sauvegarde y lit. Aucun secret.
	writeFileSync(
		join(dossier, 'jadwal.env'),
		[
			'JADWAL_AGE_RECIPIENT=age1exemple0000000000000000000000000000000000000000000000000',
			'JADWAL_RCLONE_REMOTE=exemple:/distant',
			'POSTGRES_DB=jadwal',
			'POSTGRES_USER=jadwal',
			'JADWAL_IMAGE=exemple/jadwal@sha256:0000',
			'JADWAL_PING_SAUVEGARDE=https://supervision.exemple.test/ping/sauvegarde',
			''
		].join('\n'),
		'utf8'
	);
	// Une destination locale : le stockage, réduit à un dossier. Et le faux stockage S3, que seule la
	// liste de quatre passages interroge ; ses identifiants sont des valeurs d'exemple, qu'il ne lit
	// pas.
	writeFileSync(
		join(dossier, 'rclone.conf'),
		[
			'[exemple]',
			'type = local',
			'',
			'[faux-s3]',
			'type = s3',
			'provider = Other',
			'endpoint = http://127.0.0.1:9000',
			'access_key_id = exemple',
			'secret_access_key = exemple',
			'force_path_style = true',
			''
		].join('\n'),
		'utf8'
	);

	const preparation = [
		'set -eu',
		'mkdir -p /opt/jadwal/scripts /etc/jadwal /usr/local/lib',
		'cp /doublures/jadwal.env /doublures/rclone.conf /etc/jadwal/',
		'cp /doublures/docker /doublures/age /doublures/curl /doublures/rclone /usr/local/bin/',
		'cp /doublures/rclone-reel /usr/local/lib/rclone-reel',
		'chmod 0755 /usr/local/bin/docker /usr/local/bin/age /usr/local/bin/curl /usr/local/bin/rclone /usr/local/lib/rclone-reel',
		// Les scripts et les règles, sous les noms que le rôle Ansible `taches` leur donne.
		'cp /scripts/jadwal-commun.sh /scripts/jadwal-sauvegarde.sh /scripts/jadwal-retention.sh /opt/jadwal/scripts/',
		'chmod 0755 /opt/jadwal/scripts/*.sh',
		'cp /sauvegarde/destinations.mjs /opt/jadwal/scripts/jadwal-destinations.mjs',
		'cp /sauvegarde/retention.mjs /opt/jadwal/scripts/jadwal-retention.mjs',
		'cp /sauvegarde/ages.mjs /opt/jadwal/scripts/jadwal-ages.mjs',
		'echo "rclone : $(/usr/local/lib/rclone-reel version | head -n 1)"',
		// Le faux stockage S3, sur la boucle locale du conteneur, prêt avant le premier passage.
		'node /doublures/faux-s3.mjs &',
		'for n in $(seq 50); do [ -f /tmp/faux-s3.pret ] && break; sleep 0.1; done',
		'[ -f /tmp/faux-s3.pret ] || { echo "le faux stockage S3 ne répond pas" >&2; exit 1; }',
		// Une archive déjà chez le stockage, avec son empreinte : `deposer <préfixe> <âge du dépôt>
		// [<âge du nom>]`. Le fichier est daté de son dépôt, et le nom de sa vidange.
		'deposer() {',
		'  ici=$(date +%s)',
		'  t=$(( ici - $2 ))',
		'  n=$(( ici - ${3:-$2} ))',
		'  nom="$(date --utc --date="@$n" +jadwal-%Y-%m-%dT%H%M%SZ.dump.age)"',
		'  mkdir -p "/distant/$1"',
		'  printf "age-encryption.org/v1\\nancienne\\n" > "/distant/$1/$nom"',
		'  printf "0  %s\\n" "$nom" > "/distant/$1/$nom.sha256"',
		'  touch --date="@$t" "/distant/$1/$nom" "/distant/$1/$nom.sha256"',
		'}',
		...PASSAGES.map((passage, index) =>
			[
				`echo "=== ${index} ==="`,
				'rm -rf /distant /ailleurs /var/backups/jadwal /var/lib/jadwal /tmp/battements.txt /tmp/faux-s3.log',
				'mkdir -p /distant /var/backups/jadwal',
				// Sur le disque local : sept nuits récentes, et une archive d'un mardi de 2025 que la
				// rétention locale doit retirer, que la vérification distante passe ou non.
				'for n in 1 2 3 4 5 6 7; do f="/var/backups/jadwal/$(date --utc --date="$n days ago" +jadwal-%Y-%m-%dT021503Z.dump.age)"; echo x > "$f"; echo x > "$f.sha256"; done',
				'echo x > /var/backups/jadwal/jadwal-2025-01-14T021503Z.dump.age',
				...passage.depots.map(([prefixe, ...ages]) => `deposer ${prefixe} ${ages.join(' ')}`),
				...(passage.racine ? [`echo x > /distant/${passage.racine}`] : []),
				// La destination telle qu'elle est avant la nuit, dates comprises : ce que montre une
				// liste qui regarde ailleurs que là où la nuit écrit.
				'cp -a /distant /ailleurs',
				'code=0',
				`JADWAL_EPREUVE_LISTE=${passage.liste} /opt/jadwal/scripts/jadwal-sauvegarde.sh > /tmp/sortie.txt 2>&1 || code=$?`,
				'cat /tmp/sortie.txt',
				'echo "--- code : $code"',
				'echo "--- reussite : $([ -f /var/lib/jadwal/reussites/sauvegarde ] && echo oui || echo non)"',
				'echo "--- battement : $(tail -n 1 /tmp/battements.txt 2>/dev/null)"',
				'echo "--- ancienne locale : $([ -f /var/backups/jadwal/jadwal-2025-01-14T021503Z.dump.age ] && echo restee || echo retiree)"',
				'echo "--- listes s3 : $(grep -c "^GET /" /tmp/faux-s3.log 2>/dev/null)"',
				'echo "--- head s3 : $(grep -c "^HEAD " /tmp/faux-s3.log 2>/dev/null)"'
			].join('\n')
		)
	].join('\n');
	writeFileSync(join(dossier, 'preparation.sh'), `${preparation}\n`, 'utf8');

	for (const rclone of RCLONES) {
		const quelRclone = nomDe(rclone);
		// Le vrai rclone, sorti de son image officielle, à la place de celui du tour précédent.
		const conteneur = execFileSync('docker', ['create', rclone.image], { encoding: 'utf8' }).trim();
		try {
			execFileSync('docker', [
				'cp',
				`${conteneur}:/usr/local/bin/rclone`,
				join(dossier, 'rclone-reel')
			]);
		} finally {
			execFileSync('docker', ['rm', conteneur], { stdio: 'ignore' });
		}

		const sortie = execFileSync(
			'docker',
			[
				'run',
				'--rm',
				'--volume',
				`${dossier.replaceAll('\\', '/')}:/doublures:ro`,
				'--volume',
				`${join(racine, 'infra', 'scripts').replaceAll('\\', '/')}:/scripts:ro`,
				'--volume',
				`${join(racine, 'infra', 'sauvegarde').replaceAll('\\', '/')}:/sauvegarde:ro`,
				IMAGE_NODE,
				'bash',
				'/doublures/preparation.sh'
			],
			{ encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
		);

		const [entete = '', ...reste] = sortie.split(/^=== (\d+) ===$/m);
		process.stdout.write(`\n##### ${quelRclone}\n${entete.trim()}\n`);
		// L'empreinte doit bien désigner la version annoncée : une erreur de recopie jouerait l'autre.
		const lue = /^rclone : rclone v(\S+)$/m.exec(entete)?.[1];
		if (rclone.version && lue !== rclone.version) {
			echecs.push(`${quelRclone} : l'image rend rclone ${lue ?? '(aucune version lue)'}`);
		}
		const parPassage = new Map();
		for (let i = 0; i < reste.length; i += 2) parPassage.set(Number(reste[i]), reste[i + 1] ?? '');

		for (const [index, passage] of PASSAGES.entries()) {
			const bloc = parPassage.get(index) ?? '';
			const fait = (cle) => new RegExp(`^--- ${cle} : (.*)$`, 'm').exec(bloc)?.[1]?.trim() ?? '';
			const journal = bloc
				.split('\n')
				.filter((ligne) => ligne !== '' && !ligne.startsWith('--- '))
				// L'horodatage de chaque ligne ne dit rien ici, et rend la sortie illisible.
				.map((ligne) => `    ${ligne.replace(/^\d{4}-\d{2}-\d{2}T[\d:]+[+-]\d{2}:\d{2} /, '')}`);
			const code = Number(fait('code'));
			process.stdout.write(`\n${passage.nom} : sortie ${fait('code') || '(aucune)'}\n`);
			process.stdout.write(`${journal.join('\n')}\n`);
			process.stdout.write(
				`    [réussite enregistrée : ${fait('reussite')} ; dernier battement : ${fait('battement')} ;` +
					` ancienne archive locale : ${fait('ancienne locale')}` +
					(passage.liste.startsWith('s3')
						? ` ; faux S3 : ${fait('listes s3') || 0} liste(s), ${fait('head s3') || 0} HEAD`
						: '') +
					']\n'
			);

			if (bloc === '') {
				echecs.push(
					`${quelRclone}, ${passage.nom} : le script n'a rien écrit, il ne s'est pas exécuté`
				);
				continue;
			}
			if (code !== passage.code) {
				echecs.push(`${quelRclone}, ${passage.nom} : sortie ${code}, attendu ${passage.code}`);
			}
			for (const attendu of passage.attendu) {
				if (!bloc.includes(attendu))
					echecs.push(`${quelRclone}, ${passage.nom} : « ${attendu} » attendu, absent`);
			}
			for (const interdit of passage.interdit) {
				if (bloc.includes(interdit))
					echecs.push(`${quelRclone}, ${passage.nom} : « ${interdit} » ne devait pas être là`);
			}
			// Ce que la nuit doit laisser, que la vérification passe ou non : l'archive envoyée et relue,
			// et le disque local rangé. La vérification vient après, et ne défait ni l'un ni l'autre.
			if (!bloc.includes('relecture identique')) {
				echecs.push(
					`${quelRclone}, ${passage.nom} : l'archive de la nuit n'a pas été envoyée puis relue`
				);
			}
			if (fait('ancienne locale') !== 'retiree') {
				echecs.push(
					`${quelRclone}, ${passage.nom} : la rétention locale n'a pas retiré l'archive de 2025`
				);
			}
			const reussite = fait('reussite') === 'oui';
			if (reussite !== (passage.code === 0)) {
				echecs.push(`${quelRclone}, ${passage.nom} : réussite enregistrée « ${fait('reussite')} »`);
			}
			// La liste est bien passée par le faux stockage, sans quoi le passage ne prouverait rien.
			// Et, quand le seau montre des objets, aucune date n'y a été lue objet par objet : un HEAD
			// est une lecture qui peut échouer sans que rclone sorte en erreur. Vers un chemin absent,
			// rclone demande d'abord par un HEAD si ce chemin est un objet : ce HEAD-là ne lit aucune
			// date.
			if (passage.liste.startsWith('s3') && !(Number(fait('listes s3')) >= 1)) {
				echecs.push(
					`${quelRclone}, ${passage.nom} : la liste n'est pas passée par le faux stockage S3`
				);
			}
			if (passage.liste === 's3' && Number(fait('head s3') || 0) !== 0) {
				echecs.push(
					`${quelRclone}, ${passage.nom} : ${fait('head s3')} HEAD reçus par le faux stockage, attendu aucun`
				);
			}
			const battement = fait('battement');
			const enEchec = battement.endsWith('/fail');
			if (!battement.startsWith('https://supervision.exemple.test/ping/sauvegarde')) {
				echecs.push(`${quelRclone}, ${passage.nom} : aucun battement de cœur noté`);
			} else if (enEchec !== (passage.battement === 'fail')) {
				echecs.push(
					`${quelRclone}, ${passage.nom} : battement « ${battement} », attendu ${passage.battement}`
				);
			}
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
		`\nLes ${PASSAGES.length} passages disent ce qu'ils doivent dire, avec` +
			` ${RCLONES.map(nomDe).join(' comme avec ')} : la nuit dans les âges réussit, un objet` +
			` trop vieux ou hors des préfixes fait échouer la tâche, une liste qui échoue (un seau` +
			` absent), revient vide (un chemin absent du seau) ou ne montre pas les objets de la nuit` +
			` aussi, un objet trop vieux est vu même quand S3 refuse la lecture de ses métadonnées, et` +
			` une archive recopiée est jugée depuis la date de son nom.\n`
	);
}

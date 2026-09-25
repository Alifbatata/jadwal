#!/usr/bin/env node
/**
 * Éprouve le générateur de la liste des localités suisses, et la mention de sa source dans l'avis
 * des licences tierces.
 *
 *     node scripts/eprouver-localites-suisses.mjs
 *
 * ## Ce qu'il joue
 *
 * 1. `scripts/localites-suisses.mjs` sur un extrait du fichier officiel de swisstopo, recopié ici
 *    tel qu'il arrive : marque d'ordre des octets, fins de ligne CRLF, pourcentages suivis d'un
 *    espace et d'un signe, Liechtenstein sans canton. L'extrait porte les cas qui décident de ce
 *    que le fichier produit contient : une localité à cheval sur deux communes, dont la commune
 *    principale vient tantôt en premier, tantôt en second ; un ordre d'arrivée qui n'est pas celui
 *    des NPA.
 * 2. Le même générateur sur des fichiers qu'il doit refuser : une colonne renommée, une ligne
 *    amputée, des coordonnées qui ne sont pas du MN95, une date de version illisible. Un fichier
 *    officiel qui changerait de forme doit arrêter la génération, pas produire une liste fausse.
 * 3. `scripts/licences-tierces.mjs` sur deux arbres déployés factices : l'un dont le serveur
 *    construit contient la liste, l'autre non. La mention de swisstopo doit figurer dans le premier,
 *    et seulement dans le premier.
 *
 * Rien ne sort sur le réseau : l'extrait est dans ce fichier.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lv95ToWgs84 } from '../apps/web/src/lib/server/localites/lv95.ts';

const racine = fileURLToPath(new URL('..', import.meta.url));
const GENERATEUR = join(racine, 'scripts', 'localites-suisses.mjs');
const LICENCES = join(racine, 'scripts', 'licences-tierces.mjs');

const ENTETE =
	'Ortschaftsname;PLZ4;Zusatzziffer;ZIP_ID;Gemeindename;BFS-Nr;Kantonskürzel;Adressenanteil;E;N;Sprache;Validity';

/** Des lignes du fichier officiel du 01.09.2026, dans un ordre qui n'est pas celui des NPA. */
const LIGNES = [
	'Biel/Bienne;2502;00;1428;Biel/Bienne;371;BE;100 %;2585547.000;1221249.000;multiple;2008-07-01',
	'Vaduz;9490;00;5393;Vaduz;7001;;100 %;2757674.000;1223440.000;de;2008-07-01',
	'Genève;1202;00;368;Genève;6621;GE;99.199 %;2499544.000;1119162.000;fr;2008-07-01',
	'Genève;1202;00;368;Pregny-Chambésy;6634;GE;0.801 %;2499379.000;1120947.000;fr;2008-07-01',
	'Petit-Lancy;1213;00;415;Genève;6621;GE;2.498 %;2498165.000;1117223.000;fr;2008-07-01',
	'Petit-Lancy;1213;00;415;Lancy;6628;GE;97.502 %;2498002.000;1116430.000;fr;2008-07-01',
	'Lausanne;1003;00;150;Lausanne;5586;VD;100 %;2538093.000;1152461.000;fr;2008-07-01'
];

const echecs = [];
let verifications = 0;

function verifier(quoi, condition, detail = '') {
	verifications += 1;
	if (!condition) echecs.push(detail ? `${quoi} : ${detail}` : quoi);
	process.stdout.write(`  ${condition ? 'ok  ' : 'NON '} ${quoi}${detail ? ` (${detail})` : ''}\n`);
}

const dossier = mkdtempSync(join(tmpdir(), 'jadwal-localites-'));
process.on('exit', () => rmSync(dossier, { recursive: true, force: true }));

/** La marque d'ordre des octets, par son code : invisible, elle se perdrait à la relecture. */
const BOM = String.fromCharCode(0xfeff);

/** Le contenu d'un fichier, ou une chaîne vide s'il n'existe pas. */
function lire(chemin) {
	try {
		return readFileSync(chemin, 'utf8');
	} catch {
		return '';
	}
}

/** Écrit un fichier source comme swisstopo le livre : BOM, CRLF. */
function source(nom, lignes, entete = ENTETE) {
	const chemin = join(dossier, nom);
	writeFileSync(chemin, BOM + [entete, ...lignes].join('\r\n') + '\r\n', 'utf8');
	return chemin;
}

function generer(entree, version, sortie) {
	const args = [GENERATEUR, entree, version, sortie].filter((arg) => arg !== undefined);
	return spawnSync(process.execPath, args, { encoding: 'utf8' });
}

// 1. Un extrait bien formé.
process.stdout.write('\nLe générateur, sur un extrait du fichier officiel\n');
const sortie = join(dossier, 'localities.csv');
const passe = generer(source('extrait.csv', LIGNES), '2026-09-01', sortie);
verifier('il réussit', passe.status === 0, (passe.stderr ?? '').trim().slice(0, 300));

const produit = lire(sortie);
const lignes = produit.split('\n').filter(Boolean);
const entete = lignes.filter((ligne) => ligne.startsWith('#'));
const donnees = lignes.filter((ligne) => !ligne.startsWith('#'));

verifier(
	'les fins de ligne sont LF, sans BOM',
	produit.length > 0 && !produit.includes('\r') && !produit.startsWith(BOM)
);
verifier(
	'l’en-tête nomme la liste et sa version, au format suisse',
	entete.some((ligne) =>
		ligne.includes(
			'Répertoire officiel des localités avec le code postal et le périmètre, version du 01.09.2026'
		)
	),
	entete[0] ?? 'aucun en-tête'
);
verifier(
	'l’en-tête porte la mention de la source que swisstopo exige',
	entete.some((ligne) => ligne.includes('Source : Office fédéral de topographie swisstopo'))
);
verifier(
	'l’en-tête donne l’adresse du fichier téléchargé',
	entete.some((ligne) =>
		ligne.includes(
			'https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz_2056.csv.zip'
		)
	)
);
verifier(
	'l’en-tête donne l’adresse des conditions d’utilisation',
	entete.some((ligne) =>
		ligne.includes(
			'https://www.swisstopo.admin.ch/fr/conditions-utilisation-geodonnees-et-geoservices-gratuit'
		)
	)
);
verifier(
	'la première ligne de données nomme les colonnes',
	donnees[0] === 'postcode;name;municipality;canton;latitude;longitude',
	donnees[0] ?? 'absente'
);

const rangs = donnees.slice(1).map((ligne) => ligne.split(';'));
verifier(
	'une ligne par localité et NPA : cinq, pour sept lignes sources',
	rangs.length === 5,
	`${rangs.length}`
);
verifier(
	'dans l’ordre des NPA',
	rangs.map((rang) => rang[0]).join(',') === '1003,1202,1213,2502,9490',
	rangs.map((rang) => rang[0]).join(',')
);

const par = new Map(rangs.map((rang) => [`${rang[0]} ${rang[1]}`, rang]));
verifier(
	'Genève 1202 garde sa commune principale, venue en premier',
	par.get('1202 Genève')?.[2] === 'Genève',
	par.get('1202 Genève')?.join(';')
);
verifier(
	'Petit-Lancy 1213 garde sa commune principale, venue en second',
	par.get('1213 Petit-Lancy')?.[2] === 'Lancy',
	par.get('1213 Petit-Lancy')?.join(';')
);
verifier(
	'Vaduz, sans canton dans la source, est marqué FL',
	par.get('9490 Vaduz')?.[3] === 'FL',
	par.get('9490 Vaduz')?.join(';')
);

const attendu = lv95ToWgs84(2_498_002, 1_116_430);
const lancy = par.get('1213 Petit-Lancy');
verifier(
	'la position est celle de la commune principale, convertie et arrondie à 4 décimales',
	lancy?.[4] === attendu.latitude.toFixed(4) && lancy?.[5] === attendu.longitude.toFixed(4),
	`${lancy?.[4]} ${lancy?.[5]} contre ${attendu.latitude.toFixed(4)} ${attendu.longitude.toFixed(4)}`
);
const biel = par.get('2502 Biel/Bienne');
verifier(
	'Biel/Bienne tombe à Bienne (47,13° N, 7,25° E, à 0,03° près)',
	biel !== undefined &&
		Math.abs(Number(biel[4]) - 47.133) < 0.03 &&
		Math.abs(Number(biel[5]) - 7.25) < 0.03,
	biel?.join(';')
);

const deuxieme = join(dossier, 'localities-2.csv');
generer(source('extrait.csv', LIGNES), '2026-09-01', deuxieme);
verifier(
	'deux générations du même fichier donnent le même octet pour octet',
	produit.length > 0 && lire(deuxieme) === produit
);

// 2. Ce qu'il doit refuser.
process.stdout.write('\nLe générateur, sur ce qu’il doit refuser\n');
const refus = [
	[
		'une colonne renommée',
		source('renomme.csv', LIGNES, ENTETE.replace('Gemeindename', 'Gemeinde')),
		'2026-09-01',
		/Gemeindename/
	],
	[
		'une ligne amputée d’un champ',
		source('ampute.csv', [
			...LIGNES,
			'Bern;3011;00;2045;Bern;351;BE;100 %;2600000.000;1199000.000;de'
		]),
		'2026-09-01',
		/ligne 9/
	],
	[
		'des coordonnées qui ne sont pas du MN95',
		source('wgs84.csv', ['Bern;3011;00;2045;Bern;351;BE;100 %;7.447;46.948;de;2008-07-01']),
		'2026-09-01',
		/MN95/
	],
	['une date de version illisible', source('date.csv', LIGNES), '01.09.2026', /AAAA-MM-JJ/],
	['une date de version absente', source('sans-date.csv', LIGNES), undefined, /usage/]
];
for (const [quoi, entree, version, motif] of refus) {
	const cible = join(dossier, `refus-${verifications}.csv`);
	const resultat = generer(entree, version, version === undefined ? undefined : cible);
	verifier(
		`il refuse ${quoi}, le dit, et n’écrit rien`,
		resultat.status !== 0 && motif.test(resultat.stderr ?? '') && lire(cible) === '',
		`code ${resultat.status}, ${(resultat.stderr ?? '').trim().slice(0, 160)}`
	);
}

// 3. La mention dans l'avis des licences tierces.
process.stdout.write('\nL’avis des licences tierces\n');

/** Un arbre déployé minimal : un magasin vide, un serveur construit d'un seul fichier. */
function arbre(nom, contenu) {
	const chemin = join(dossier, nom);
	mkdirSync(join(chemin, 'node_modules', '.pnpm'), { recursive: true });
	mkdirSync(join(chemin, 'build', 'server', 'chunks'), { recursive: true });
	writeFileSync(join(chemin, 'build', 'server', 'chunks', 'localities.js'), contenu, 'utf8');
	return chemin;
}

// Ce que Vite écrit pour un import `?raw` : le fichier entier dans une chaîne. Le début suffit, il
// porte l'en-tête.
const liste = lire(join(racine, 'apps/web/src/lib/server/localites/localities.csv'));
verifier('la liste du dépôt existe', liste.length > 0);
const embarque = arbre(
	'avec',
	`const data = ${JSON.stringify(liste.slice(0, 2000))};\nexport { data };\n`
);
const sans = arbre('sans', 'export const data = "rien";\n');

const avec = spawnSync(process.execPath, [LICENCES, embarque], { encoding: 'utf8' });
verifier(
	'le script réussit sur l’arbre qui contient la liste',
	avec.status === 0,
	avec.stderr?.trim()
);
verifier(
	'l’avis a une section des données tierces',
	/^## Données tierces$/m.test(avec.stdout ?? '')
);
verifier(
	'l’avis nomme swisstopo comme la source de la liste des localités',
	(avec.stdout ?? '').includes('Source : Office fédéral de topographie swisstopo')
);
verifier(
	'l’avis donne l’adresse des conditions d’utilisation',
	(avec.stdout ?? '').includes(
		'https://www.swisstopo.admin.ch/fr/conditions-utilisation-geodonnees-et-geoservices-gratuit'
	)
);

const pas = spawnSync(process.execPath, [LICENCES, sans], { encoding: 'utf8' });
verifier(
	'le script réussit sur l’arbre qui ne la contient pas',
	pas.status === 0,
	pas.stderr?.trim()
);
verifier(
	'l’avis ne mentionne pas une liste que le serveur ne contient pas',
	!(pas.stdout ?? '').includes('swisstopo') && !/^## Données tierces$/m.test(pas.stdout ?? '')
);

if (echecs.length > 0) {
	process.stderr.write(`\nCe qui a échoué :\n`);
	for (const echec of echecs) process.stderr.write(`  - ${echec}\n`);
	process.exitCode = 1;
} else {
	process.stdout.write(`\nLes ${verifications} vérifications passent.\n`);
}

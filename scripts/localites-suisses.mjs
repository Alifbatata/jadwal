#!/usr/bin/env node
/**
 * Engendre la liste des localités suisses que le serveur embarque, à partir du répertoire officiel
 * des localités de swisstopo.
 *
 *     node scripts/localites-suisses.mjs <AMTOVZ_CSV_LV95.csv> <AAAA-MM-JJ> [sortie]
 *
 * - le premier argument est le fichier CSV en MN95 (LV95), décompressé, tel que swisstopo le livre ;
 * - le deuxième est la date de la version, le premier jour du mois où swisstopo l'a publiée ;
 * - la sortie, par défaut, est `apps/web/src/lib/server/localites/localities.csv`.
 *
 * `apps/web/src/lib/server/localites/README.md` dit où télécharger le fichier, sous quelles
 * conditions, et comment refaire la liste. Ce script ne sort jamais sur le réseau, et le serveur
 * non plus : la liste est engendrée ici, une fois, puis incorporée au serveur à sa construction.
 *
 * ## Ce qu'il garde
 *
 * Le fichier officiel a une ligne par localité, NPA et commune : une localité à cheval sur deux
 * communes y a deux lignes, chacune avec sa part des adresses et un point dans son périmètre. Pour
 * choisir un lieu de calcul, une seule suffit. Le script garde donc **une ligne par localité et
 * NPA**, celle de la commune qui a le plus d'adresses, avec son point.
 *
 * Chaque ligne produite dit : le NPA, le nom officiel de la localité, la commune, le canton (`FL`
 * pour le Liechtenstein, que la source laisse sans canton), la latitude et la longitude en degrés
 * décimaux à 4 décimales (une dizaine de mètres). Le point est converti de MN95 en WGS84 par les
 * formules approchées de swisstopo, dans `lv95.ts`, que ce script charge tel quel.
 *
 * ## Ce qu'il refuse
 *
 * Une colonne absente, une ligne qui n'a pas le bon nombre de champs, un nombre illisible, un point
 * hors du cadre MN95 de la Suisse : le fichier officiel a changé de forme, ou ce n'est pas le bon
 * fichier (celui en WGS84, ou un ancien en MN03). Une date de version qui n'existe pas, 2026-13-45 ou
 * 2026-02-30, bien qu'elle ait la bonne forme : l'en-tête de la liste la recopierait telle quelle.
 * Le script s'arrête alors sans rien écrire, plutôt que de produire une liste fausse que personne ne
 * remarquerait.
 *
 * Le résultat ne dépend que du fichier d'entrée et de la date : deux passages donnent le même
 * fichier, octet pour octet, et une mise à jour se relit comme un diff.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lv95ToWgs84 } from '../apps/web/src/lib/server/localites/lv95.ts';

const racine = fileURLToPath(new URL('..', import.meta.url));
const SORTIE = join(racine, 'apps', 'web', 'src', 'lib', 'server', 'localites', 'localities.csv');

const TELECHARGEMENT =
	'https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz_2056.csv.zip';
const CONDITIONS =
	'https://www.swisstopo.admin.ch/fr/conditions-utilisation-geodonnees-et-geoservices-gratuit';

/** Les colonnes lues, sous leur nom dans le fichier officiel. */
const COLONNES = [
	'Ortschaftsname',
	'PLZ4',
	'Gemeindename',
	'Kantonskürzel',
	'Adressenanteil',
	'E',
	'N'
];

/**
 * Le cadre de la Suisse et du Liechtenstein en MN95, avec de la marge. Un point dehors vient d'un
 * autre système de coordonnées : MN03 a un million de moins, WGS84 des degrés.
 */
const CADRE = { est: [2_480_000, 2_840_000], nord: [1_070_000, 1_300_000] };

function arreter(message) {
	process.stderr.write(`localites-suisses : ${message}\n`);
	process.exit(1);
}

const [entree, version, sortie = SORTIE] = process.argv.slice(2);
if (!entree || !version) {
	arreter('usage : node scripts/localites-suisses.mjs <AMTOVZ_CSV_LV95.csv> <AAAA-MM-JJ> [sortie]');
}
const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(version);
if (!date) arreter(`la date de la version s'écrit AAAA-MM-JJ, pas « ${version} »`);
// La forme ne suffit pas : « 2026-13-45 » et « 2026-02-30 » l'ont aussi. Le jour est reconstruit par
// le calendrier, et il doit retomber sur les trois nombres écrits : un mois ou un jour de trop se
// reporte sur le suivant, et la date rendue n'est plus celle qu'on a donnée.
const [annee, mois, jour] = [Number(date[1]), Number(date[2]), Number(date[3])];
const reconstruite = new Date(Date.UTC(annee, mois - 1, jour));
if (
	reconstruite.getUTCFullYear() !== annee ||
	reconstruite.getUTCMonth() !== mois - 1 ||
	reconstruite.getUTCDate() !== jour
) {
	arreter(`la date de la version n'existe pas : « ${version} »`);
}
const versionSuisse = `${date[3]}.${date[2]}.${date[1]}`;

let texte;
try {
	texte = readFileSync(entree, 'utf8');
} catch (erreur) {
	arreter(`impossible de lire ${entree} : ${erreur.message}`);
}
// Le fichier officiel commence par une marque d'ordre des octets (U+FEFF), qui collerait au nom de
// la première colonne.
const lignes = (texte.charCodeAt(0) === 0xfeff ? texte.slice(1) : texte)
	.split(/\r?\n/)
	.filter((ligne) => ligne.length > 0);

const entete = (lignes[0] ?? '').split(';');
const position = {};
for (const colonne of COLONNES) {
	const index = entete.indexOf(colonne);
	if (index < 0) arreter(`colonne absente du fichier source : ${colonne}`);
	position[colonne] = index;
}

/** Un nombre du fichier source, ou l'arrêt. Les parts d'adresses s'écrivent « 99.199 % ». */
function nombre(brut, ligne, colonne) {
	const valeur = Number(brut.replace(/\s*%$/, ''));
	if (brut.trim() === '' || !Number.isFinite(valeur)) {
		arreter(`ligne ${ligne} : ${colonne} illisible (« ${brut} »)`);
	}
	return valeur;
}

/** Les localités, par nom et NPA, avec la ligne de la commune qui a le plus d'adresses. */
const localites = new Map();
lignes.slice(1).forEach((brute, rang) => {
	const numero = rang + 2;
	const champs = brute.split(';');
	if (champs.length !== entete.length) {
		arreter(`ligne ${numero} : ${champs.length} champs au lieu de ${entete.length}`);
	}
	const nom = champs[position.Ortschaftsname].trim();
	const npa = champs[position.PLZ4].trim();
	if (!/^\d{4}$/.test(npa)) arreter(`ligne ${numero} : NPA illisible (« ${npa} »)`);
	if (nom === '') arreter(`ligne ${numero} : localité sans nom`);
	const est = nombre(champs[position.E], numero, 'E');
	const nord = nombre(champs[position.N], numero, 'N');
	if (est < CADRE.est[0] || est > CADRE.est[1] || nord < CADRE.nord[0] || nord > CADRE.nord[1]) {
		arreter(`ligne ${numero} : le point ${est} / ${nord} n'est pas du MN95 en Suisse`);
	}
	const candidate = {
		npa,
		nom,
		commune: champs[position.Gemeindename].trim(),
		canton: champs[position['Kantonskürzel']].trim() || 'FL',
		part: nombre(champs[position.Adressenanteil], numero, 'Adressenanteil'),
		est,
		nord
	};
	const clef = `${npa};${nom}`;
	const connue = localites.get(clef);
	// À part égale, la première ligne reste : l'ordre du fichier officiel départage.
	if (!connue || candidate.part > connue.part) localites.set(clef, candidate);
});

if (localites.size === 0) arreter('aucune localité dans le fichier source');

/** Une comparaison qui ne dépend ni de la langue de la machine ni de sa version d'ICU. */
function ordre(a, b) {
	if (a.npa !== b.npa) return a.npa < b.npa ? -1 : 1;
	return a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : 0;
}

const sortieLignes = [
	`# Répertoire officiel des localités avec le code postal et le périmètre, version du ${versionSuisse}.`,
	'# Source : Office fédéral de topographie swisstopo.',
	`# Téléchargé depuis ${TELECHARGEMENT}`,
	`# Conditions d'utilisation : ${CONDITIONS}`,
	'# Transformé pour jadwal par scripts/localites-suisses.mjs : une ligne par localité et NPA, la',
	'# commune qui a le plus d’adresses, sa position convertie de MN95 en WGS84 par les formules',
	'# approchées de swisstopo, arrondie à 4 décimales.',
	'postcode;name;municipality;canton;latitude;longitude'
];
for (const localite of [...localites.values()].sort(ordre)) {
	const { latitude, longitude } = lv95ToWgs84(localite.est, localite.nord);
	sortieLignes.push(
		[
			localite.npa,
			localite.nom,
			localite.commune,
			localite.canton,
			latitude.toFixed(4),
			longitude.toFixed(4)
		].join(';')
	);
}

writeFileSync(sortie, sortieLignes.join('\n') + '\n', 'utf8');
process.stdout.write(
	`${localites.size} localités, de ${lignes.length - 1} lignes sources, écrites dans ${sortie}\n`
);

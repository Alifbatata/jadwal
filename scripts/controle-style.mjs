#!/usr/bin/env node
/**
 * Le contrôle de style des textes français **lus par les gens** : les conditions d'utilisation, les
 * écrans, les courriels et les messages à recopier.
 *
 *     pnpm style
 *
 * Deux règles, et elles ne visent que la prose du service :
 *
 * 1. **Aucun tiret cadratin** (U+2014, « — »). Il ne se tape pas sur un clavier suisse romand, il se
 *    coupe mal en petite largeur, et un responsable qui recopie une phrase dans WhatsApp le voit
 *    devenir un carré. Un tiret demi-cadratin, une parenthèse ou deux phrases font le même travail.
 * 2. **Aucun des mots de la liste ci-dessous.** Ce sont les chevilles d'une langue qui veut avoir
 *    l'air sérieuse : elles allongent la phrase sans rien lui ajouter. « Notamment » ne dit pas quoi,
 *    « essentiel » ne dit pas pourquoi, et « ainsi » relie deux idées que l'auteur n'a pas reliées.
 *    Les retirer oblige à écrire ce qu'on voulait dire.
 *
 * ## Ce qu'il regarde, et ce qu'il ne regarde pas
 *
 * Il ne lit que ce qu'un visiteur ou un responsable peut lire : le corps des documents, le gabarit
 * des écrans, et les chaînes de caractères des modules de messages. **Les commentaires de code et le
 * code lui-même en sont exclus**, et c'est voulu : ils sont écrits pour celui qui reprendra le
 * projet, pas pour l'organisation, et la règle du tiret cadratin n'a aucun sens là où personne ne
 * recopie rien.
 *
 * Il ne comprend ni le français ni le contexte : il cherche des chaînes. Une phrase creuse écrite
 * sans aucun de ces mots passera. Il retire des tics, il ne relit pas à votre place.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CADRATIN = '—';

/** Les chevilles. En minuscules ; la comparaison ne tient pas compte de la casse. */
const MOTS = [
	'par ailleurs',
	'en outre',
	'notamment',
	'en parallèle',
	'ainsi',
	'au-delà de',
	'crucial',
	'essentiel',
	'significatif',
	'robuste',
	'substantiel'
];

/**
 * Les surfaces relues, et la façon de n'en garder que le texte.
 *
 * - `document` : tout le fichier ; un document est du texte de bout en bout.
 * - `gabarit` : un composant, moins son `<script>`, son `<style>` et ses commentaires.
 * - `chaines` : un module, réduit à ce qui est entre guillemets.
 */
const SURFACES = [
	{ motif: 'docs/CONDITIONS.md', genre: 'document' },
	{ motif: 'apps/web/src/**/*.svelte', genre: 'gabarit' },
	{ motif: 'apps/web/src/lib/i18n.ts', genre: 'chaines' },
	{ motif: 'apps/web/src/lib/messages.ts', genre: 'chaines' },
	{ motif: 'apps/web/src/lib/server/mail/messages.ts', genre: 'chaines' },
	// La page de garde du PDF pour le juriste vit dans ce script, et nulle part ailleurs : sans
	// cette ligne, le seul texte du document que personne ne relirait serait celui-là.
	{ motif: 'scripts/conditions-pdf.mjs', genre: 'chaines' }
];

const racine = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

function fichiersDe(motif) {
	const sortie = execFileSync('git', ['ls-files', '--', motif], { cwd: racine, encoding: 'utf8' });
	return sortie.split('\n').filter(Boolean);
}

/** Remplace une tranche par des espaces, en gardant les fins de ligne : les numéros ne bougent pas. */
function effacer(texte, debut, fin) {
	const tranche = texte.slice(debut, fin).replace(/[^\n]/g, ' ');
	return texte.slice(0, debut) + tranche + texte.slice(fin);
}

function effacerParMotif(texte, motif) {
	let resultat = texte;
	for (const trouve of texte.matchAll(motif)) {
		const debut = trouve.index ?? 0;
		resultat = effacer(resultat, debut, debut + trouve[0].length);
	}
	return resultat;
}

/** Ne garder que le gabarit : ni script, ni style, ni commentaire HTML. */
function gabarit(texte) {
	let resultat = effacerParMotif(texte, /<script\b[\s\S]*?<\/script>/g);
	resultat = effacerParMotif(resultat, /<style\b[\s\S]*?<\/style>/g);
	return effacerParMotif(resultat, /<!--[\s\S]*?-->/g);
}

/**
 * Ne garder que ce qui est entre guillemets. Un petit automate plutôt qu'une expression régulière :
 * une apostrophe française dans un commentaire ouvrirait une chaîne qui ne se referme jamais, et le
 * contrôle se tairait sur tout le reste du fichier — un contrôle muet est pire que pas de contrôle.
 */
function chaines(texte) {
	const dedans = new Array(texte.length).fill(false);
	let etat = 'code';
	let delimiteur = '';
	for (let index = 0; index < texte.length; index += 1) {
		const c = texte[index];
		const suivant = texte[index + 1];
		if (etat === 'code') {
			if (c === '/' && suivant === '/') etat = 'ligne';
			else if (c === '/' && suivant === '*') etat = 'bloc';
			else if (c === "'" || c === '"' || c === '`') {
				etat = 'chaine';
				delimiteur = c;
			}
		} else if (etat === 'ligne') {
			if (c === '\n') etat = 'code';
		} else if (etat === 'bloc') {
			if (c === '*' && suivant === '/') {
				etat = 'code';
				index += 1;
			}
		} else if (etat === 'chaine') {
			if (c === '\\') {
				index += 1;
				continue;
			}
			if (c === delimiteur) etat = 'code';
			else dedans[index] = true;
		}
	}
	return [...texte].map((c, index) => (c === '\n' ? '\n' : dedans[index] ? c : ' ')).join('');
}

const EXTRACTEURS = { document: (texte) => texte, gabarit, chaines };

// Les lookarounds évitent d'accrocher « ainsi » dans « ainsiquoi » ou « essentiel » dans
// « quintessentiel ». `\b` ne convient pas : il ne connaît pas les lettres accentuées.
const MOTIF_MOTS = new RegExp(
	`(?<![\\p{L}\\p{M}])(?:${MOTS.map((mot) => mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{M}])`,
	'giu'
);

function position(texte, index) {
	const avant = texte.slice(0, index);
	const ligne = avant.split('\n').length;
	const colonne = index - (avant.lastIndexOf('\n') + 1) + 1;
	return { ligne, colonne };
}

const trouvailles = [];
let relus = 0;

for (const surface of SURFACES) {
	for (const chemin of fichiersDe(surface.motif)) {
		const brut = readFileSync(`${racine}/${chemin}`, 'utf8');
		const texte = EXTRACTEURS[surface.genre](brut);
		relus += 1;

		let index = texte.indexOf(CADRATIN);
		while (index !== -1) {
			trouvailles.push({ chemin, ...position(texte, index), quoi: 'tiret cadratin (U+2014)' });
			index = texte.indexOf(CADRATIN, index + 1);
		}
		for (const trouve of texte.matchAll(MOTIF_MOTS)) {
			trouvailles.push({
				chemin,
				...position(texte, trouve.index ?? 0),
				quoi: `« ${trouve[0]} »`
			});
		}
	}
}

if (trouvailles.length === 0) {
	process.stdout.write(`Style : ${relus} fichier(s) relus, rien à signaler.\n`);
	process.exit(0);
}

trouvailles.sort(
	(a, b) => a.chemin.localeCompare(b.chemin) || a.ligne - b.ligne || a.colonne - b.colonne
);
process.stderr.write(
	`\n  ${trouvailles.length} chose(s) à réécrire dans les textes lus par les gens :\n\n`
);
for (const t of trouvailles) {
	process.stderr.write(`      ${t.chemin}:${t.ligne}:${t.colonne}  ${t.quoi}\n`);
}
process.stderr.write(
	`\n  Le tiret cadratin ne se tape pas sur un clavier suisse romand et devient un carré quand on\n` +
		`  recopie la phrase ailleurs. Les mots de la liste allongent sans rien ajouter : les retirer\n` +
		`  oblige à écrire ce qu'on voulait dire.\n\n`
);
process.exit(1);

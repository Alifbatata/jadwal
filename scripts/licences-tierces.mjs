#!/usr/bin/env node
/**
 * Engendre l'avis des licences tierces pour ce qui est **réellement** embarqué.
 *
 *     node scripts/licences-tierces.mjs <arbre déployé> [> LICENCES-TIERCES.md]
 *
 * ## Pourquoi il lit un arbre plutôt que le dépôt
 *
 * `pnpm licenses list` répond sur l'arbre du poste, qui porte les outils de développement. Ce
 * fichier-ci doit répondre sur le contenu de l'image, et sur rien d'autre : c'est ce qui est
 * distribué qui crée des obligations, pas ce qui a servi à le construire.
 *
 * Il est donc lancé **après** `elaguer-arbre-de-production.mjs`, sur l'arbre qui part. Ce qui reste
 * dans son magasin est exactement ce que l'image contient.
 *
 * ## Ce qu'il recopie, et pourquoi
 *
 * MIT, BSD et Apache demandent toutes la même chose : conserver l'avis de copyright et le texte de
 * la licence. Le regroupement de SvelteKit retire les commentaires du code ; sans ce fichier, ces
 * avis disparaîtraient de ce qui est distribué. Il recopie donc **le texte entier**, et non un nom
 * de licence.
 *
 * `NOTICE` est en plus : Apache-2.0 demande de le transmettre quand il existe.
 *
 * Pour une licence à réciprocité **par fichier** — MPL, EPL, CDDL —, il ajoute le lien vers le code
 * source, parce que c'est l'obligation propre à ces licences : celui qui reçoit le binaire doit
 * pouvoir obtenir la forme source des fichiers concernés.
 *
 * ## Ce qu'il ne couvre pas
 *
 * La base système de l'image (Debian, et les paquets de l'image officielle de Node). C'est une
 * agrégation de conteneur : rien n'y est lié au code de jadwal. Le fichier le dit.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const cible = process.argv[2];
if (!cible) {
	process.stderr.write('usage : node scripts/licences-tierces.mjs <arbre deploye>\n');
	process.exit(2);
}
const magasin = join(resolve(cible), 'node_modules', '.pnpm');

/** Les licences dont l'obligation porte sur les fichiers, et qui demandent donc la source. */
const RECIPROQUES_PAR_FICHIER = /MPL|EPL|CDDL|CPL|Ms-RL/i;

/** Les noms de fichiers où vit un texte de licence, par ordre de préférence. */
const NOMS_DE_LICENCE = /^(LICEN[CS]E|COPYING|LICENSE-MIT|LICENSE-APACHE)(\..*)?$/i;
const NOMS_DE_NOTICE = /^NOTICE(\..*)?$/i;

/** Le premier fichier du dossier dont le nom correspond, avec son contenu. */
function fichierCorrespondant(dossier, motif) {
	let entrees;
	try {
		entrees = readdirSync(dossier, { withFileTypes: true });
	} catch {
		return null;
	}
	const trouve = entrees
		.filter((entree) => entree.isFile() && motif.test(entree.name))
		.sort((a, b) => a.name.localeCompare(b.name))[0];
	if (!trouve) return null;
	try {
		const chemin = join(dossier, trouve.name);
		// Un texte de licence tient en quelques dizaines de kilooctets. Au-delà, c'est autre chose.
		if (statSync(chemin).size > 200_000) return null;
		return { nom: trouve.name, texte: readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n').trim() };
	} catch {
		return null;
	}
}

/** L'adresse du code source déclarée par un paquet, sous une forme qu'on peut ouvrir. */
function source(paquet) {
	const brut =
		typeof paquet.repository === 'string' ? paquet.repository : (paquet.repository?.url ?? '');
	if (!brut) return paquet.homepage ?? null;
	return brut
		.replace(/^git\+/, '')
		.replace(/\.git$/, '')
		.replace(/^git:\/\//, 'https://')
		.replace(/^github:/, 'https://github.com/');
}

/** Les paquets du magasin, un par dossier `<clé>/node_modules/<nom>`. */
function paquets() {
	const trouves = new Map();
	for (const entree of readdirSync(magasin, { withFileTypes: true })) {
		if (!entree.isDirectory() || entree.name === 'node_modules') continue;
		const interne = join(magasin, entree.name, 'node_modules');
		let sous;
		try {
			sous = readdirSync(interne, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const candidat of sous) {
			if (!candidat.isDirectory()) continue;
			const dossiers = candidat.name.startsWith('@')
				? readdirSync(join(interne, candidat.name), { withFileTypes: true })
						.filter((portee) => portee.isDirectory())
						.map((portee) => join(interne, candidat.name, portee.name))
				: [join(interne, candidat.name)];
			for (const dossier of dossiers) {
				let paquet;
				try {
					paquet = JSON.parse(readFileSync(join(dossier, 'package.json'), 'utf8'));
				} catch {
					continue;
				}
				if (!paquet.name || !paquet.version) continue;
				// Nos propres paquets ne sont pas des tiers : ils sont couverts par le LICENSE du dépôt.
				if (paquet.name.startsWith('@jadwal/')) continue;
				const clef = `${paquet.name}@${paquet.version}`;
				if (trouves.has(clef)) continue;
				trouves.set(clef, {
					nom: paquet.name,
					version: paquet.version,
					licence:
						typeof paquet.license === 'string'
							? paquet.license
							: (paquet.license?.type ?? paquet.licenses?.[0]?.type ?? 'non déclarée'),
					source: source(paquet),
					texte: fichierCorrespondant(dossier, NOMS_DE_LICENCE),
					notice: fichierCorrespondant(dossier, NOMS_DE_NOTICE)
				});
			}
		}
	}
	return [...trouves.values()].sort((a, b) => a.nom.localeCompare(b.nom));
}

const liste = paquets();
const parLicence = new Map();
for (const paquet of liste) {
	parLicence.set(paquet.licence, (parLicence.get(paquet.licence) ?? 0) + 1);
}

const lignes = [];
lignes.push('# Licences des composants tiers embarqués dans jadwal');
lignes.push('');
lignes.push(
	'jadwal est distribué sous licence MIT (voir `LICENSE`). Ce fichier est **engendré** par',
	"`scripts/licences-tierces.mjs` à partir du contenu réel de l'image de production, après",
	"l'élagage qui en retire tout ce qui n'est pas chargé à l'exécution. Il n'est pas tenu à la main :",
	'un composant ajouté ou retiré y apparaît ou en disparaît tout seul.'
);
lignes.push('');
lignes.push(`**${liste.length} composants tiers.** Par licence :`);
lignes.push('');
for (const [licence, combien] of [...parLicence.entries()].sort((a, b) => b[1] - a[1])) {
	lignes.push(`- ${licence} : ${combien}`);
}
lignes.push('');
lignes.push(
	"La base système de l'image (Debian, et les paquets de l'image officielle de Node) n'est pas",
	"couverte ici : c'est une agrégation de conteneur, rien n'y est lié au code de jadwal, et chacun",
	'de ces paquets porte son propre avis dans `/usr/share/doc`.'
);
lignes.push('');
lignes.push('---');
lignes.push('');

for (const paquet of liste) {
	lignes.push(`## ${paquet.nom} ${paquet.version}`);
	lignes.push('');
	lignes.push(`Licence déclarée : **${paquet.licence}**`);
	if (paquet.source) lignes.push('', `Code source : ${paquet.source}`);
	if (RECIPROQUES_PAR_FICHIER.test(paquet.licence)) {
		lignes.push(
			'',
			'**Réciprocité par fichier.** Cette licence oblige à rendre disponible la forme source des',
			'fichiers qu’elle couvre. Le lien ci-dessus y donne accès, et ces fichiers ne sont pas',
			'modifiés ici.'
		);
	}
	if (paquet.texte) {
		lignes.push('', `<!-- ${paquet.texte.nom} -->`, '', '```', paquet.texte.texte, '```');
	} else {
		lignes.push(
			'',
			'_Aucun fichier de licence dans le paquet publié ; la licence déclarée ci-dessus fait foi._'
		);
	}
	if (paquet.notice) {
		lignes.push('', `### NOTICE`, '', '```', paquet.notice.texte, '```');
	}
	lignes.push('');
}

process.stdout.write(lignes.join('\n'));

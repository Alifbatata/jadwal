#!/usr/bin/env node
/**
 * Retire de l'arbre déployé tout ce qui n'est pas atteignable à l'exécution.
 *
 *     node scripts/elaguer-arbre-de-production.mjs <dossier deployé>
 *
 * ## Pourquoi ce script existe
 *
 * `pnpm deploy --prod` élague les dépendances de développement. Il ne peut pas élaguer ceci :
 * `better-auth` déclare `@sveltejs/kit`, `svelte`, `vitest` et `drizzle-kit` en **pairs
 * facultatifs**, pour s'adapter au cadre qui l'emploie. pnpm résout un pair facultatif depuis ce
 * que l'espace de travail contient déjà — et nos paquets les déclarent, puisqu'on développe avec.
 * L'arête « dépendance de production vers son pair » entre alors dans la fermeture de production,
 * et `deploy` la recopie fidèlement.
 *
 * `ignoredOptionalDependencies` ne l'empêche pas : il refuse d'**installer** un pair facultatif
 * absent, il ne refuse pas d'en lier un présent. Mesuré, pas supposé : avec le réglage posé, l'arbre
 * déployé portait toujours 193 paquets et les mêmes outils.
 *
 * Résultat avant ce script : un cadre de tests, deux compilateurs et un empaqueteur dans une image
 * de production. 193 paquets, 237 Mio, dont rien n'est chargé à l'exécution.
 *
 * ## Ce qu'il fait, et comment il décide
 *
 * Il part des `dependencies` du paquet déployé et descend, de `package.json` en `package.json`, en
 * ne suivant **que** les `dependencies` et les `optionalDependencies` réellement présentes. Ce qu'il
 * n'a pas visité n'est atteignable par aucun `import` résolu par Node à l'exécution, et part.
 *
 * Les pairs ne sont pas suivis, et c'est tout l'objet : un pair est ce que l'hôte fournit, et
 * l'hôte, ici, c'est un serveur déjà construit qui n'en fournit aucun.
 *
 * **Ce n'est pas une analyse statique des imports.** Un module chargé par un nom calculé, hors de
 * toute déclaration, lui échapperait. C'est pourquoi l'élagage n'est pas cru sur parole :
 * `scripts/eprouver-image.mjs` construit l'image, la lance, et l'interroge.
 */
import { readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const cible = process.argv[2];
if (!cible) {
	process.stderr.write('usage : node scripts/elaguer-arbre-de-production.mjs <dossier>\n');
	process.exit(2);
}
const racine = resolve(cible);
const magasin = join(racine, 'node_modules', '.pnpm');

/** Le `package.json` d'un dossier, ou `null` s'il n'y en a pas. */
function manifeste(dossier) {
	try {
		return JSON.parse(readFileSync(join(dossier, 'package.json'), 'utf8'));
	} catch {
		return null;
	}
}

/** Le dossier réel d'un paquet vu depuis `depuis`, en remontant les `node_modules` comme Node. */
function resoudre(depuis, nom) {
	let courant = depuis;
	for (let garde = 0; garde < 40; garde += 1) {
		const candidat = join(courant, 'node_modules', nom);
		try {
			if (statSync(candidat).isDirectory()) return realpathSync(candidat);
		} catch {
			/* pas ici, on remonte */
		}
		const parent = resolve(courant, '..');
		if (parent === courant) break;
		courant = parent;
	}
	return null;
}

/**
 * Tout ce qui est atteignable depuis le paquet déployé, en ne suivant que ce que Node suivrait.
 * Rend l'ensemble des dossiers réels visités.
 */
function atteignables() {
	const vus = new Set();
	const manquants = [];
	const file = [racine];
	while (file.length > 0) {
		const dossier = file.pop();
		if (vus.has(dossier)) continue;
		vus.add(dossier);
		const paquet = manifeste(dossier);
		if (!paquet) continue;
		const noms = [
			...Object.keys(paquet.dependencies ?? {}),
			...Object.keys(paquet.optionalDependencies ?? {})
		];
		for (const nom of noms) {
			const trouve = resoudre(dossier, nom);
			// Une `optionalDependency` absente est normale : c'est ce que « facultatif » veut dire.
			if (trouve) file.push(trouve);
			else if (paquet.dependencies?.[nom]) manquants.push(`${paquet.name} -> ${nom}`);
		}
	}
	return { vus, manquants };
}

/** La taille d'un dossier, en octets, sans sortir de l'arbre. */
function poids(dossier) {
	let total = 0;
	const file = [dossier];
	while (file.length > 0) {
		const courant = file.pop();
		let entrees;
		try {
			entrees = readdirSync(courant, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entree of entrees) {
			if (entree.isSymbolicLink()) continue;
			const chemin = join(courant, entree.name);
			if (entree.isDirectory()) file.push(chemin);
			else {
				try {
					total += statSync(chemin).size;
				} catch {
					/* disparu entre-temps */
				}
			}
		}
	}
	return total;
}

const { vus, manquants } = atteignables();
if (manquants.length > 0) {
	process.stderr.write(
		`Élagage refusé : ${manquants.length} dépendance(s) déclarée(s) et introuvable(s).\n` +
			manquants.map((ligne) => `  - ${ligne}\n`).join('') +
			`L'arbre déployé est incomplet ; l'élaguer masquerait le vrai défaut.\n`
	);
	process.exit(1);
}

const entrees = readdirSync(magasin, { withFileTypes: true }).filter((entree) =>
	entree.isDirectory()
);
const retires = [];
let octetsRetires = 0;

for (const entree of entrees) {
	if (entree.name === 'node_modules') continue;
	const dossier = join(magasin, entree.name);
	// Le magasin range chaque paquet sous `<clé>/node_modules/<nom>`. C'est ce dossier-là que la
	// marche a visité, jamais la clé.
	const interne = join(dossier, 'node_modules');
	let garde = false;
	try {
		for (const sous of readdirSync(interne, { withFileTypes: true })) {
			if (!sous.isDirectory()) continue;
			const candidats = sous.name.startsWith('@')
				? readdirSync(join(interne, sous.name), { withFileTypes: true })
						.filter((portee) => portee.isDirectory())
						.map((portee) => join(interne, sous.name, portee.name))
				: [join(interne, sous.name)];
			for (const candidat of candidats) {
				if (vus.has(realpathSync(candidat))) garde = true;
			}
		}
	} catch {
		/* magasin sans ce dossier : rien à garder */
	}
	if (garde) continue;
	octetsRetires += poids(dossier);
	retires.push(entree.name);
	rmSync(dossier, { recursive: true, force: true });
}

const gardes = entrees.length - retires.length;
process.stdout.write(
	`Élagage de ${racine}\n` +
		`  paquets dans le magasin : ${entrees.length}\n` +
		`  gardés (atteignables)   : ${gardes}\n` +
		`  retirés                 : ${retires.length}\n` +
		`  disque rendu            : ${(octetsRetires / 1024 / 1024).toFixed(1)} Mio\n`
);
if (retires.length > 0) {
	process.stdout.write(`  ${retires.slice(0, 12).join('\n  ')}\n`);
	if (retires.length > 12) process.stdout.write(`  … et ${retires.length - 12} autres\n`);
}

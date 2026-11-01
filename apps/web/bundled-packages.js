// Le relevé du code tiers que l'empaqueteur fond dans le serveur et dans le client construits.
//
// Ce code n'est plus un paquet de l'image : `scripts/licences-tierces.mjs`, qui lit le magasin de
// l'image, ne le voyait pas, et l'avis des licences oubliait SvelteKit et Svelte (étape 23). Ce
// greffon écrit, pour chaque environnement construit, chaque module et le paquet d'où il vient ;
// l'avis lit ce relevé en plus du magasin.
//
// Il ne décide de rien : un module qu'il ne sait pas rattacher à un paquet est écrit tel quel, et
// c'est `licences-tierces.mjs` qui refuse alors de produire l'avis.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = resolve(ici, '..', '..');

/** Là où le relevé est écrit, un fichier par environnement (`client.json`, `ssr.json`). */
export const BUNDLED_PACKAGES_DIR = join(ici, '.svelte-kit', 'bundled-packages');

/**
 * Les modules virtuels, qui n'ont pas de chemin : l'empaqueteur et le cadre les écrivent, et leur
 * code est celui du paquet qui les écrit.
 */
const VIRTUELS = [
	[/^\0vite\//, 'vite'],
	[/^\0rolldown\//, 'rolldown'],
	[/^\0(virtual:)?__sveltekit\//, '@sveltejs/kit'],
	[/^\0sveltekit\//, '@sveltejs/kit']
];

const exiger = createRequire(join(ici, 'package.json'));

/** Le dossier d'un paquet que `apps/web` peut résoudre, ou celui où le cadre l'a résolu. */
function dossierDe(nom) {
	try {
		return dirname(exiger.resolve(`${nom}/package.json`));
	} catch {
		// `rolldown` n'est pas une dépendance de `apps/web` : il vient avec `vite`.
		const deVite = createRequire(join(dossierDe('vite'), 'package.json'));
		return dirname(deVite.resolve(`${nom}/package.json`));
	}
}

/** Le dossier du paquet d'un module pris dans `node_modules`, d'après son chemin. */
function dossierDuModule(chemin) {
	const morceaux = chemin.split(/[/\\]/);
	const dernier = morceaux.lastIndexOf('node_modules');
	if (dernier === -1) return null;
	const longueur = morceaux[dernier + 1]?.startsWith('@') ? 2 : 1;
	return morceaux.slice(0, dernier + 1 + longueur).join(sep);
}

/**
 * Le paquet d'un module : `{ name, version, dir }`, `null` pour le code de jadwal lui-même, ou
 * `{ unknown }` pour un module que rien ne rattache.
 */
function paquetDe(id) {
	if (id.startsWith('\0')) {
		const trouve = VIRTUELS.find(([motif]) => motif.test(id));
		return trouve ? lire(dossierDe(trouve[1])) : { unknown: id };
	}
	const chemin = id.split('?')[0];
	const dossier = dossierDuModule(chemin);
	if (dossier) return lire(dossier);
	// Le code du dépôt, sources et paquets `@jadwal/*` : couvert par le `LICENSE` du dépôt.
	if (resolve(chemin).startsWith(racine + sep)) return null;
	return { unknown: id };
}

function lire(dossier) {
	const { name, version } = JSON.parse(readFileSync(join(dossier, 'package.json'), 'utf8'));
	return { name, version, dir: dossier };
}

/** Le greffon : il relève chaque environnement à la fin de sa construction. */
export function bundledPackages() {
	return {
		name: 'jadwal-bundled-packages',
		apply: 'build',
		generateBundle(_options, bundle) {
			const paquets = new Map();
			const inconnus = new Set();
			for (const sortie of Object.values(bundle)) {
				if (sortie.type !== 'chunk') continue;
				for (const id of sortie.moduleIds) {
					const paquet = paquetDe(id);
					if (paquet === null) continue;
					if ('unknown' in paquet) inconnus.add(paquet.unknown);
					else paquets.set(`${paquet.name}@${paquet.version}`, paquet);
				}
			}
			mkdirSync(BUNDLED_PACKAGES_DIR, { recursive: true });
			writeFileSync(
				join(BUNDLED_PACKAGES_DIR, `${this.environment.name}.json`),
				JSON.stringify(
					{
						packages: [...paquets.values()].sort((a, b) => a.name.localeCompare(b.name)),
						unknown: [...inconnus].sort()
					},
					null,
					'\t'
				) + '\n'
			);
		}
	};
}

// Les deux fichiers Compose du dépôt ne doivent jamais se disputer un volume.
//
// Le fichier de production (`infra/compose/docker-compose.yml`) et celui de développement
// (`docker-compose.dev.yml`) décrivent tous deux une base PostgreSQL. Tant qu'ils portaient le même
// nom de projet, `jadwal`, leurs volumes portaient le même nom : `jadwal_pgdata`. Compose ne refuse
// pas cette collision. Il avertit, attache le volume existant, et l'on se retrouve avec deux
// serveurs PostgreSQL sur le même répertoire de données.
//
// Mesuré le 2026-09-22, en répétant le déploiement de production sur un poste de développement : les
// deux ont tourné vingt-huit secondes côte à côte, le second a réécrit `postmaster.pid`, et en
// s'arrêtant il l'a effacé. Le premier a fini par le remarquer :
//
//   LOG: could not open file "postmaster.pid": No such file or directory
//   LOG: performing immediate shutdown because data directory lock file is invalid
//
// Rien n'a été perdu ce jour-là. Rien ne le garantissait.
//
// Ce test lit les deux fichiers livrés, pas une copie : le jour où quelqu'un ramène les deux noms
// l'un vers l'autre, il tombe.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const racine = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const PRODUCTION = join(racine, 'infra', 'compose', 'docker-compose.yml');
const DEVELOPPEMENT = join(racine, 'docker-compose.dev.yml');

/**
 * Le nom de projet déclaré par un fichier Compose, et les noms de ses volumes tels que Compose les
 * produira. Un analyseur YAML complet serait une dépendance de plus pour deux clés : on lit les deux
 * clés, et le test échoue bruyamment si la forme du fichier change.
 */
function lire(chemin) {
	const texte = readFileSync(chemin, 'utf8');
	const nom = /^name:\s*(\S+)\s*$/m.exec(texte)?.[1];
	if (!nom) throw new Error(`${chemin} ne déclare pas de nom de projet`);

	const bloc = /^volumes:\s*$([\s\S]*)$/m.exec(texte)?.[1] ?? '';
	const volumes = [];
	for (const ligne of bloc.split('\n')) {
		// Fin du bloc : une clé de premier niveau.
		if (/^\S/.test(ligne) && ligne.trim() !== '') break;
		const declare = /^\s{2}(\w[\w-]*):\s*$/.exec(ligne);
		if (declare) volumes.push({ cle: declare[1], nom: `${nom}_${declare[1]}` });
		const explicite = /^\s{4}name:\s*(\S+)\s*$/.exec(ligne);
		if (explicite && volumes.length > 0) volumes[volumes.length - 1].nom = explicite[1];
	}
	return { nom, volumes };
}

describe('les deux fichiers Compose du dépôt', () => {
	it('ne portent pas le même nom de projet', () => {
		const prod = lire(PRODUCTION);
		const dev = lire(DEVELOPPEMENT);
		expect(prod.nom, 'le fichier de production').toBe('jadwal');
		expect(dev.nom, 'le fichier de développement').not.toBe(prod.nom);
	});

	it('ne peuvent pas produire un volume du même nom', () => {
		const prod = lire(PRODUCTION);
		const dev = lire(DEVELOPPEMENT);
		expect(
			prod.volumes.length,
			'le fichier de production déclare au moins un volume'
		).toBeGreaterThan(0);
		expect(
			dev.volumes.length,
			'le fichier de développement déclare au moins un volume'
		).toBeGreaterThan(0);

		const nomsProd = new Set(prod.volumes.map((v) => v.nom));
		const communs = dev.volumes.map((v) => v.nom).filter((n) => nomsProd.has(n));
		expect(communs, 'volumes que les deux fichiers produiraient sous le même nom').toEqual([]);
	});

	it('nomment bien le volume de production jadwal_pgdata', () => {
		// Le témoin de ce fichier. Si cette attente cessait d'être vraie, les deux tests précédents
		// pourraient passer sans plus rien comparer : ils compareraient deux listes vides.
		expect(lire(PRODUCTION).volumes.map((v) => v.nom)).toContain('jadwal_pgdata');
	});
});

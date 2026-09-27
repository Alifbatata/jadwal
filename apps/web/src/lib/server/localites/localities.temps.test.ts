// La recherche des localités, sur la liste entière : chaque localité, ou chaque début de nom, est
// cherché à son tour. Ces tests prennent de une à plusieurs secondes, et sous la charge de la suite
// complète, ils dépassaient le délai de 5 s de Vitest (6 271 ms au lot 1 de l'étape 19, 8 584 ms au
// point de contrôle qui a suivi). Ils tournent donc à part, dans `pnpm test:temps` (étape 19), avec
// un délai tiré d'une mesure : `CONTRIBUTING.md`, « Les tests liés au temps », dit comment.
//
// Le reste de la recherche, rapide, est dans `localities.test.ts`, qui tourne dans `pnpm test`.

import { describe, expect, it } from 'vitest';
import { searchLocalities } from './localities.js';
import {
	debutsEnUe,
	horsChefsLieux,
	lEcritAinsi,
	LIGNES,
	nomEntierSansTremas,
	premier
} from './localities.test-support.js';

/**
 * Les délais, en millisecondes : quinze fois le maximum mesuré à l'étape 19, sur cinq passages du
 * fichier sur le poste chargé, arrondi à la seconde. Les mesures, dans l'ordre des tests :
 * 345 à 508 ms, 1 095 à 1 448 ms, 2 036 à 3 525 ms, 319 à 365 ms.
 */
const DELAIS = {
	formeDAffichage: 8_000,
	nomEtCanton: 22_000,
	debutAvecTrema: 53_000,
	debutSansTrema: 6_000
};

describe('searchLocalities, sur chaque localité de la liste', () => {
	it(
		'retrouve en premier chaque localité de la liste sous sa forme d’affichage',
		() => {
			// Un écran qui remet dans le champ la localité choisie, sous cette forme, doit la retrouver.
			const perdues = LIGNES.map(({ postcode, name, canton }) => `${postcode} ${name} (${canton})`)
				.filter((affichee) => premier(affichee) !== affichee)
				.map((affichee) => `${affichee} -> ${premier(affichee)}`);
			expect(perdues).toEqual([]);
		},
		DELAIS.formeDAffichage
	);

	it(
		'retrouve en premier chaque localité sous « Nom (CANTON) », sans le NPA',
		() => {
			const perdues = LIGNES.filter(({ name, canton }) => {
				const [trouve] = searchLocalities(`${name} (${canton})`);
				return trouve?.name !== name || trouve.canton !== canton;
			}).map(({ name, canton }) => `${name} (${canton}) -> ${premier(`${name} (${canton})`)}`);
			expect([...new Set(perdues)]).toEqual([]);
		},
		DELAIS.nomEtCanton
	);
});

describe('searchLocalities, sur chaque début de nom à trémas (relecture du lot 4)', () => {
	it(
		'ne met jamais, pour un début tapé avec son tréma, un nom qui ne le porte pas avant un nom qui le porte',
		() => {
			// Chaque début de 3 à 6 ou de 8 lettres d'un nom de la liste qui porte « ä », « ö » ou
			// « ü », tapé tel quel : les localités dont le nom le contient, ou dont un mot de la commune
			// le commence, tréma compris, forment le haut de la liste ; celles qui ne le portent qu'une
			// fois les trémas effacés viennent après.
			const bas = (texte: string) =>
				texte
					.toLowerCase()
					.replace(/[^a-z0-9äöü]+/g, ' ')
					.trim();
			const debuts = new Set(
				LIGNES.flatMap(({ name }) =>
					[3, 4, 5, 6, 8].map((longueur) => name.slice(0, longueur))
				).filter((debut) => /[äöüÄÖÜ]/.test(debut) && !bas(debut).includes(' '))
			);
			expect(debuts.size).toBeGreaterThan(100);
			const porte = (localite: { name: string; municipality: string }, debut: string) =>
				bas(localite.name).includes(bas(debut)) ||
				` ${bas(localite.municipality)}`.includes(` ${bas(debut)}`);
			const melangees = [...debuts].filter((debut) => {
				const portent = horsChefsLieux(debut).map((localite) => porte(localite, debut));
				const premiereSans = portent.indexOf(false);
				return premiereSans !== -1 && portent.slice(premiereSans).includes(true);
			});
			expect(melangees).toEqual([]);
		},
		DELAIS.debutAvecTrema
	);

	it(
		'met, sans tréma tapé, les noms écrits ainsi avant ceux qui ne l’écrivent que sans leurs trémas',
		() => {
			// Chaque début de 3 à 6 ou de 8 lettres d'un nom de la liste qui porte « ue », « oe » ou
			// « ae », tapé sans tréma : les localités qui l'écrivent ainsi forment le haut de la liste,
			// et celles qui ne l'écrivent qu'une fois leurs trémas lus « ue », « oe » ou « ae » viennent
			// après. Seule exception : un nom entier écrit sans ses trémas, que la personne a tapé en
			// entier.
			const debuts = debutsEnUe(false);
			expect(debuts.size).toBeGreaterThan(100);
			const melangees = [...debuts].filter((debut) => {
				const ecrites = horsChefsLieux(debut).map(
					(localite) => lEcritAinsi(localite, debut) || nomEntierSansTremas(localite, debut)
				);
				const premiereAutre = ecrites.indexOf(false);
				return premiereAutre !== -1 && ecrites.slice(premiereAutre).includes(true);
			});
			expect(melangees).toEqual([]);
		},
		DELAIS.debutSansTrema
	);
});

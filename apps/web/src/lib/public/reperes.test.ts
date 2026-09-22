// Les repères des pages publiques : un en-tête, un contenu principal, un pied, et rien entre eux.
//
// axe relevait sur les onze pages publiques, la page encadrée comprise, « landmark-one-main » et
// « region » : leur contenu n'était dans aucun repère, faute de `<main>`. Ce test lit la structure
// des trois gabarits, telle que Svelte l'analyse : chaque enfant du bloc `.page` est l'en-tête, le
// contenu principal ou le pied, et il n'y a qu'un `<main>`. L'audit lui-même reste celui du parcours
// complet (`pnpm parcours:test`), qui passe axe sur les pages rendues.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse, type AST } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

const ROUTES = fileURLToPath(new URL('../../routes/m/[slug]/[[langue=langue]]/', import.meta.url));

/** Les trois gabarits publics, et ce qui peut se trouver au premier niveau de leur bloc `.page`. */
const PAGES = [
	{ nom: 'programme', fichier: '+page.svelte', attendu: ['Entete', 'main', 'Pied'] },
	{ nom: 'cours', fichier: 'cours/[courseId]/+page.svelte', attendu: ['main', 'Pied'] },
	{ nom: 'abonnement', fichier: 'agenda/+page.svelte', attendu: ['header', 'main', 'Pied'] }
];

type Noeud = AST.Fragment['nodes'][number];

function gabarit(chemin: string): Noeud[] {
	return parse(readFileSync(chemin, 'utf8'), { modern: true }).fragment.nodes;
}

/** Les nœuds qui se voient : ni un blanc entre deux balises, ni un commentaire. */
function visibles(noeuds: readonly Noeud[]): Noeud[] {
	return noeuds.filter(
		(noeud) => noeud.type !== 'Comment' && !(noeud.type === 'Text' && !noeud.data.trim())
	);
}

/** Le nom d'une balise ou d'un composant ; pour un bloc `{#if}`, son genre. */
function nom(noeud: Noeud): string {
	return 'name' in noeud ? noeud.name : noeud.type;
}

function classe(noeud: Noeud): string {
	if (noeud.type !== 'RegularElement') return '';
	const attribut = noeud.attributes.find(
		(a): a is AST.Attribute => a.type === 'Attribute' && a.name === 'class'
	);
	const valeur = attribut?.value;
	if (!Array.isArray(valeur)) return '';
	return valeur.map((part) => (part.type === 'Text' ? part.data : '')).join('');
}

/** Tous les éléments de ce nom, à toute profondeur, blocs `{#if}` et `{#each}` compris. */
function compter(arbre: unknown, balise: string): number {
	if (Array.isArray(arbre)) return arbre.reduce((total, n) => total + compter(n, balise), 0);
	if (!arbre || typeof arbre !== 'object') return 0;
	const ici =
		'type' in arbre && arbre.type === 'RegularElement' && 'name' in arbre && arbre.name === balise
			? 1
			: 0;
	return (
		ici +
		Object.entries(arbre)
			.filter(([cle]) => cle !== 'attributes')
			.reduce((total, [, valeur]) => total + compter(valeur, balise), 0)
	);
}

describe('les repères des pages publiques', () => {
	for (const page of PAGES) {
		it(`puts the whole content of the ${page.nom} page in a header, a main or a footer`, () => {
			const noeuds = gabarit(join(ROUTES, page.fichier));
			const bloc = visibles(noeuds).find(
				(noeud): noeud is AST.RegularElement =>
					noeud.type === 'RegularElement' && classe(noeud) === 'page'
			);
			expect(bloc, 'le bloc .page').toBeDefined();
			expect(visibles(bloc?.fragment.nodes ?? []).map(nom)).toEqual(page.attendu);
			expect(compter(noeuds, 'main')).toBe(1);
		});
	}

	it('makes the shared header a banner and the shared footer a contentinfo', () => {
		const racine = (fichier: string) =>
			visibles(gabarit(fileURLToPath(new URL(fichier, import.meta.url)))).map(nom);
		expect(racine('./Entete.svelte')).toEqual(['header']);
		expect(racine('./Pied.svelte')).toEqual(['footer']);
	});
});

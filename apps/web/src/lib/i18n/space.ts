// Le contrat des textes de l'espace des responsables (étape 18, retour D2). Voir `LISEZMOI.md`, à
// côté, pour ajouter les textes d'un écran.
//
// Le même contrat que les pages publiques (`i18n.ts`, ADR 0007) : un objet par langue, pas de
// bibliothèque, et TypeScript qui refuse de compiler un dictionnaire où une langue manque, où une clé
// manque dans une langue, ou où une langue porte une clé de trop.

import type { Langue } from '../i18n.js';

/**
 * Les textes d'un écran, dans chacune des cinq langues. `T` décrit les textes d'une langue ; chaque
 * langue doit les donner tous, et rien d'autre.
 */
export type Translations<T> = { readonly [L in Langue]: T };

/** Les formes d'un mot selon le nombre, telles que le CLDR les nomme. `other` est obligatoire. */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { readonly other: string };

const RULES = new Map<Langue, Intl.PluralRules>();

/**
 * La forme qui convient à un nombre dans une langue : « 1 minute », « 2 minutes » ; en arabe, les six
 * formes du CLDR (zéro, un, deux, de 3 à 10, de 11 à 99, le reste).
 *
 * Seules les règles viennent d'`Intl`, jamais l'écriture du nombre : il reste en chiffres latins dans
 * les cinq langues, l'arabe compris (ADR 0007). Une forme absente retombe sur `other`.
 */
export function plural(language: Langue, count: number, forms: PluralForms): string {
	let rules = RULES.get(language);
	if (!rules) {
		rules = new Intl.PluralRules(language);
		RULES.set(language, rules);
	}
	return forms[rules.select(count)] ?? forms.other;
}

// Tous les dictionnaires de l'espace, ceux d'aujourd'hui et ceux qu'un autre chantier ajoutera dans
// ce dossier : ce fichier les trouve seul (`import.meta.glob`), sans qu'on ait à l'y inscrire.
//
// TypeScript refuse déjà un dictionnaire où une langue ou une clé manque. Ce test tient ce que le
// compilateur ne voit pas : une phrase recopiée du français et jamais traduite, un tiret cadratin, un
// chiffre arabo-indien (ADR 0007), et une langue dont les textes n'ont pas la même forme que ceux du
// français (une fonction à la place d'une phrase, par exemple).

import { describe, expect, it } from 'vitest';
import { LANGUES } from '../i18n.js';

const modules = import.meta.glob<Record<string, unknown>>(['./*.ts', '!./*.test.ts'], {
	eager: true
});

/** Un objet qui a exactement les cinq langues pour clés : un dictionnaire. */
function isDictionary(value: unknown): value is Record<(typeof LANGUES)[number], unknown> {
	if (typeof value !== 'object' || value === null) return false;
	const keys = Object.keys(value).sort();
	return keys.join() === [...LANGUES].sort().join();
}

const DICTIONARIES = Object.entries(modules).flatMap(([file, exports]) =>
	Object.entries(exports)
		.filter(([, value]) => isDictionary(value))
		.map(([name, value]) => ({ name: `${file.replace('./', '')} ${name}`, value }))
) as { name: string; value: Record<(typeof LANGUES)[number], unknown> }[];

/**
 * Ce qu'une valeur dit, feuille par feuille : une phrase telle quelle, une fonction appelée avec des
 * valeurs témoins. Une fonction attend des mots, des nombres ou une liste : les trois sont essayés,
 * dans cet ordre, et la première réponse est gardée.
 */
function leaves(value: unknown, path = ''): Map<string, string | null> {
	const found = new Map<string, string | null>();
	if (value === null || typeof value === 'string') {
		found.set(path, value);
	} else if (typeof value === 'function') {
		const samples = [
			['⟨a⟩', '⟨b⟩', '⟨c⟩'],
			[3, 7, 11],
			[['⟨a⟩', '⟨b⟩', '⟨c⟩'], 2]
		];
		for (const sample of samples) {
			try {
				found.set(`${path}()`, String((value as (...args: unknown[]) => unknown)(...sample)));
				break;
			} catch {
				// L'essai suivant.
			}
		}
	} else if (typeof value === 'object') {
		for (const [key, inner] of Object.entries(value as object)) {
			for (const [leaf, text] of leaves(inner, path ? `${path}.${key}` : key)) {
				found.set(leaf, text);
			}
		}
	}
	return found;
}

/**
 * Au moins deux mots de deux lettres : une phrase, et non un nom propre ou un mot pareil partout. Un
 * trait d'union ne sépare pas deux mots : « Super-admin » s'écrit de même en italien.
 */
const PHRASE = /\p{L}{2,}[^\p{L}-]+\p{L}{2,}/u;

describe('les dictionnaires de l’espace', () => {
	it('are found in this folder', () => {
		const names = DICTIONARIES.map((dictionary) => dictionary.name);
		for (const expected of [
			'common.ts commonTexts',
			'sign-in.ts signInTexts',
			'organisations.ts organisationsTexts',
			'terms.ts termsTexts',
			'error.ts errorTexts',
			'sign-out.ts signOutTexts',
			'formatting.ts formattingTexts'
		]) {
			expect(names).toContain(expected);
		}
	});

	it.each(DICTIONARIES)('$name has the same texts in the five languages', ({ value }) => {
		const french = leaves(value.fr);
		expect(french.size).toBeGreaterThan(0);
		for (const language of LANGUES) {
			expect([...leaves(value[language]).keys()], language).toEqual([...french.keys()]);
		}
	});

	it.each(DICTIONARIES)('$name leaves no French sentence untranslated', ({ value }) => {
		const french = leaves(value.fr);
		for (const language of LANGUES.filter((l) => l !== 'fr')) {
			const copied = [...leaves(value[language])].filter(
				([leaf, text]) => text !== null && PHRASE.test(text) && text === french.get(leaf)
			);
			expect(copied, language).toEqual([]);
		}
	});

	it.each(DICTIONARIES)(
		'$name writes neither an em dash nor an Arabic-Indic digit',
		({ value }) => {
			for (const language of LANGUES) {
				for (const [leaf, text] of leaves(value[language])) {
					expect(text ?? '', `${language} ${leaf}`).not.toContain('—');
					expect(text ?? '', `${language} ${leaf}`).not.toMatch(/[٠-٩۰-۹]/);
				}
			}
		}
	);
});

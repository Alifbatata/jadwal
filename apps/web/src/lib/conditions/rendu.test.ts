// La mise en mots des conditions d'utilisation : le Markdown du dépôt, rendu une seule fois pour le
// PDF du juriste et pour la page `/conditions`.
//
// Le document réel est lu ici, et pas une copie : c'est lui que les organisations acceptent, et un
// défaut de rendu qui ne toucherait que lui passerait sous un exemple inventé.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dateDeLaVersion, typographier, typographierHtml, versHtml, versionIso } from './rendu.js';

const CONDITIONS = readFileSync(
	new URL('../../../../../docs/CONDITIONS.md', import.meta.url),
	'utf8'
);

/** Pour chaque liste numérotée du rendu, dans l'ordre, le nombre de ses éléments. */
function listesNumerotees(html: string): number[] {
	return [...html.matchAll(/<ol>([\s\S]*?)<\/ol>/g)].map(
		(liste) => (liste[1] ?? '').match(/<li>/g)?.length ?? 0
	);
}

/** Les éléments de la première liste numérotée, tels que rendus. */
function elements(html: string): string[] {
	const liste = /<ol>([\s\S]*?)<\/ol>/.exec(html)?.[1] ?? '';
	return [...liste.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((element) => element[1] ?? '');
}

describe('la liste numérotée', () => {
	it('keeps one list when an item goes on with an indented paragraph', () => {
		const html = versHtml(
			[
				'1. Premier élément.',
				'2. Deuxième élément, qui continue',
				'   sur une seconde ligne.',
				'',
				'   Un second paragraphe du deuxième élément.',
				'',
				'3. Troisième élément.'
			].join('\n')
		);
		expect(listesNumerotees(html)).toEqual([3]);
		expect(elements(html)).toEqual([
			'Premier élément.',
			'<p>Deuxième élément, qui continue sur une seconde ligne.</p>' +
				'<p>Un second paragraphe du deuxième élément.</p>',
			'Troisième élément.'
		]);
	});

	it('still ends the list on a paragraph that is not indented', () => {
		const html = versHtml(
			['1. Un.', '2. Deux.', '', 'Un paragraphe après la liste.', '', '1. Une autre liste.'].join(
				'\n'
			)
		);
		expect(listesNumerotees(html)).toEqual([2, 1]);
		expect(html).toContain('</ol>\n<p>Un paragraphe après la liste.</p>\n<ol>');
	});

	it('renders the personal data of docs/CONDITIONS.md as one list of ten, end to end', () => {
		const html = versHtml(CONDITIONS);
		expect(listesNumerotees(html)).toEqual([10]);
		const liste = elements(html);
		// Le paragraphe sur les passkeys reste dans leur élément, et l'acceptation ferme la liste.
		expect(liste[6]).toMatch(/^<p><strong>Les passkeys<\/strong>.*<\/p><p><strong>Ce qui est vrai/);
		expect(liste[9]).toMatch(/acceptation/i);
	});
});

describe('la version du texte', () => {
	const document = (date: string) => `# Titre\n\nDernière mise à jour : ${date}.\n\nLe texte.\n`;

	it('reads the date of the last update', () => {
		expect(dateDeLaVersion(document('22 septembre 2026'))).toBe('22 septembre 2026');
	});

	it.each([
		['22 septembre 2026', '2026-09-22'],
		['1er octobre 2026', '2026-10-01'],
		['5 août 2027', '2027-08-05'],
		['3 décembre 2026', '2026-12-03'],
		// 2028 est bissextile, 2027 ne l'est pas : le 29 février n'existe que la première.
		['29 février 2028', '2028-02-29']
	])('writes « %s » as %s', (date, attendu) => {
		expect(versionIso(document(date))).toBe(attendu);
	});

	it.each([
		['no date line at all', '# Titre\n\nLe texte.\n'],
		['a date in words', document('bientôt')],
		['an abbreviated month', document('22 sept. 2026')],
		['a month that is not French', document('22 September 2026')],
		['a day the month does not have', document('31 septembre 2026')],
		['a 29 February in a common year', document('29 février 2027')],
		['« er » after another day than the first', document('2er mars 2026')],
		['no year', document('22 septembre')]
	])('throws on %s, rather than invent a version', (_cas, markdown) => {
		expect(() => versionIso(markdown)).toThrow(/illisible/);
	});

	it('reads the version of docs/CONDITIONS.md', () => {
		expect(versionIso(CONDITIONS)).toMatch(/^20\d\d-\d\d-\d\d$/);
	});
});

describe('la typographie française', () => {
	it('curls the apostrophe and tightens the double signs and the quotes', () => {
		expect(typographier("l'heure ? oui : « non » ; voilà !")).toBe(
			'l’heure\u202f? oui\u00a0: «\u00a0non\u00a0»\u202f; voilà\u202f!'
		);
	});

	it('leaves tags and code alone', () => {
		expect(typographierHtml("<p class='a'>l'un</p><code>l'autre ?</code>")).toBe(
			"<p class='a'>l’un</p><code>l'autre ?</code>"
		);
	});

	it('leaves a style sheet alone, where a no-break space would break a selector', () => {
		// Le PDF passe sa page entière par la typographie, feuille de style comprise.
		const style = "<style>.a > :last-child { color: red !important; content: 'x' }</style>";
		expect(typographierHtml(`${style}<p>oui ?</p>`)).toBe(`${style}<p>oui\u202f?</p>`);
	});
});

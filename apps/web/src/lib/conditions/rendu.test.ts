// La mise en mots des conditions d'utilisation : le Markdown du dépôt, rendu une seule fois pour le
// PDF des conditions et pour la page `/conditions`.
//
// Le document réel est lu ici, et pas une copie : c'est lui que les organisations acceptent, et un
// défaut de rendu qui ne toucherait que lui passerait sous un exemple inventé.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	dateDeLaVersion,
	nommerExploitant,
	typographier,
	typographierHtml,
	versHtml,
	versionIso
} from './rendu.js';

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
		expect(liste[6]).toMatch(
			/^<p><strong>Les passkeys de l'exploitant\.<\/strong>.*<\/p><p><strong>Ce qui est vrai/
		);
		expect(liste[9]).toMatch(/acceptation/i);
	});
});

describe('la version du texte', () => {
	const document = (date: string) => `# Titre\n\nDernière mise à jour : ${date}.\n\nLe texte.\n`;

	it('reads the date of the last update', () => {
		expect(dateDeLaVersion(document('22.09.2026'))).toBe('22.09.2026');
	});

	it.each([
		['22.09.2026', '2026-09-22'],
		['01.10.2026', '2026-10-01'],
		['05.08.2027', '2027-08-05'],
		['03.12.2026', '2026-12-03'],
		// 2028 est bissextile, 2027 ne l'est pas : le 29 février n'existe que la première.
		['29.02.2028', '2028-02-29']
	])('writes « %s » as %s', (date, attendu) => {
		expect(versionIso(document(date))).toBe(attendu);
	});

	it.each([
		['no date line at all', '# Titre\n\nLe texte.\n'],
		['a date in words', document('bientôt')],
		// Une seule façon d'écrire la date, celle de l'écran (A3) : l'ancienne, en toutes lettres,
		// est refusée plutôt que lue à côté de la nouvelle.
		['the date in words that the text used to carry', document('22 septembre 2026')],
		['a day or a month without its zero', document('2.09.2026')],
		['a month without its zero', document('22.9.2026')],
		['a year in two digits', document('22.09.26')],
		['the date as the database writes it', document('2026-09-22')],
		['another separator', document('22/09/2026')],
		['a day the month does not have', document('31.09.2026')],
		['a month the year does not have', document('22.13.2026')],
		['a day zero', document('00.09.2026')],
		['a 29 February in a common year', document('29.02.2027')]
	])('throws on %s, rather than invent a version', (_cas, markdown) => {
		expect(() => versionIso(markdown)).toThrow(/illisible/);
	});

	it('reads the version of docs/CONDITIONS.md, whose date is written as on the screen', () => {
		expect(dateDeLaVersion(CONDITIONS)).toMatch(/^\d\d\.\d\d\.20\d\d$/);
		expect(versionIso(CONDITIONS)).toMatch(/^20\d\d-\d\d-\d\d$/);
	});

	// L'acceptation enregistre la date, pas le texte : un texte changé sous la même date ne serait
	// redemandé à personne, et les acceptations déjà gardées diraient avoir accepté ce que personne
	// n'a lu. Chaque version a donc son empreinte, ajoutée ici quand la date change. Les fins de
	// ligne sont ramenées à LF : un poste Windows ne doit pas changer l'empreinte.
	const EMPREINTES: Record<string, string> = {
		'2026-09-26': 'ce107d7a3d36101abd5ed79a5412c30f842b162afee3606b2af9c799c5e4a867',
		'2026-10-19': 'b41aa0c011e590e44fdde7ed48235ae863bd55edb6a0e7606429dd8f47296f80'
	};

	it('gives every change of docs/CONDITIONS.md a new date, so that everyone accepts it again', () => {
		const version = versionIso(CONDITIONS);
		const empreinte = createHash('sha256').update(CONDITIONS.replace(/\r\n/g, '\n')).digest('hex');
		expect(
			EMPREINTES[version],
			`version ${version} sans empreinte : ajoutez « '${version}': '${empreinte}' »`
		).toBeDefined();
		expect(
			empreinte,
			`le texte de la version ${version} a changé : donnez-lui une nouvelle date de mise à jour`
		).toBe(EMPREINTES[version]);
	});
});

describe('le nom de l’exploitant', () => {
	const texte =
		'Le service est exploité par <!-- exploitant -->Voltia<!-- /exploitant -->, en Suisse.';

	it('keeps the default name, without its marks, where the instance names no one', () => {
		expect(nommerExploitant(texte, undefined)).toBe(
			'Le service est exploité par Voltia, en Suisse.'
		);
		expect(nommerExploitant(texte, '  ')).toBe('Le service est exploité par Voltia, en Suisse.');
	});

	it('puts the name the instance sets in place of the default one', () => {
		expect(nommerExploitant(texte, ' Voltia, entreprise individuelle de Jean Exemple ')).toBe(
			'Le service est exploité par Voltia, entreprise individuelle de Jean Exemple, en Suisse.'
		);
	});

	it.each([
		['a line break', 'Voltia\n# Titre'],
		['a tag', 'Voltia <script>'],
		['bold', '**Voltia**'],
		['a link', '[Voltia](https://example.test)'],
		['code', '`Voltia`']
	])('refuses a name with %s, which the converter would read as text structure', (_cas, nom) => {
		expect(() => nommerExploitant(texte, nom)).toThrow(/JADWAL_EXPLOITANT/);
	});

	it.each([
		['no mark', 'Le service est exploité par Voltia.'],
		['two marks', `${texte}\n\n${texte}`]
	])('throws on a text with %s, rather than leave the operator unnamed', (_cas, markdown) => {
		expect(() => nommerExploitant(markdown, 'Voltia')).toThrow(/exploitant/);
	});

	it('finds the one mark in docs/CONDITIONS.md', () => {
		expect(nommerExploitant(CONDITIONS, 'Témoin')).toContain('exploité par Témoin, en Suisse');
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

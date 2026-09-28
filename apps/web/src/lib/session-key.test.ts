// La clé d'une séance dans les listes de « À venir » et de l'écran du vendredi : unique, même quand
// deux séances d'un cours tombent le même jour avec le même statut (étape 20, relecture du
// chantier 1).
//
// Svelte refuse deux fois la même clé dans un `{#each}` à clé : à l'hydratation, en production
// comme en développement, il lève `each_key_duplicate` et l'écran ne répond plus. Le rendu côté
// serveur, lui, ne vérifie rien : un test d'accès qui lit la page ne le verrait pas. Ce test prend
// donc les séances telles que `@jadwal/core` les calcule dans ces cas, et vérifie leurs clés ; puis
// il lit les deux écrans, tels que Svelte les analyse, pour s'assurer qu'ils rangent leurs séances
// par cette clé-là.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	expandOccurrences,
	type CourseSchedule,
	type DateRange,
	type SessionException
} from '@jadwal/core';
import { parse } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';
import { sessionKey } from './session-key.js';

/** Un cours du lundi, 19:00 à 21:00. Septembre 2026 : lundis 7, 14, 21, 28. */
const LUNDI: CourseSchedule = {
	id: 'a',
	recurrence: { kind: 'weekly', weekdays: [1], interval: 1, anchorDate: '2026-09-07' },
	timing: { kind: 'fixed', start: '19:00', end: '21:00' },
	startsOn: '2026-09-01',
	sequence: 0
};

const CAS: readonly [string, SessionException[], DateRange, number][] = [
	[
		'the session of the rhythm is cancelled, and one moved to that day is cancelled there',
		[
			{
				kind: 'cancelled',
				courseId: 'a',
				date: '2026-09-07',
				movedTo: { date: '2026-09-14', start: '17:00' }
			},
			{ kind: 'cancelled', courseId: 'a', date: '2026-09-14' }
		],
		{ from: '2026-09-14', to: '2026-09-14' },
		2
	],
	[
		'two sessions moved to one day are cancelled there',
		[
			{
				kind: 'cancelled',
				courseId: 'a',
				date: '2026-09-07',
				movedTo: { date: '2026-09-16', start: '18:00' }
			},
			{
				kind: 'cancelled',
				courseId: 'a',
				date: '2026-09-14',
				movedTo: { date: '2026-09-16', start: '18:00' }
			}
		],
		{ from: '2026-09-16', to: '2026-09-16' },
		2
	],
	[
		'two sessions are moved to one day',
		[
			{ kind: 'moved', courseId: 'a', date: '2026-09-07', toDate: '2026-09-16', toStart: '18:00' },
			{ kind: 'moved', courseId: 'a', date: '2026-09-14', toDate: '2026-09-16', toStart: '18:00' }
		],
		{ from: '2026-09-16', to: '2026-09-16' },
		2
	],
	[
		'a session changes time on its own day',
		[{ kind: 'moved', courseId: 'a', date: '2026-09-14', toDate: '2026-09-14', toStart: '17:00' }],
		{ from: '2026-09-14', to: '2026-09-14' },
		2
	]
];

describe('la clé d’une séance à l’écran', () => {
	it.each(CAS)('is unique when %s', (_cas, exceptions, range, attendues) => {
		const seances = expandOccurrences({ schedules: [LUNDI], exceptions, range });
		// Le cas est bien là : autant de séances ce jour-là que prévu.
		expect(seances).toHaveLength(attendues);
		const cles = seances.map(sessionKey);
		expect(new Set(cles).size, cles.join(' | ')).toBe(cles.length);
	});

	it.each([
		['« À venir »', '../routes/+page.svelte'],
		['the Friday screen', '../routes/vendredi/+page.svelte']
	])('keys the sessions of %s by it', (_ecran, chemin) => {
		const source = readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8');
		const cles = blocsDeSeances(parse(source, { modern: true }).fragment);
		expect(cles.length).toBeGreaterThan(0);
		expect(cles).toEqual(cles.map(() => 'sessionKey(seance)'));
	});
});

/** Les blocs `{#each … as seance (clé)}` d'un gabarit, à toute profondeur : le texte de leur clé. */
function blocsDeSeances(arbre: unknown): string[] {
	if (Array.isArray(arbre)) return arbre.flatMap((noeud) => blocsDeSeances(noeud));
	if (!arbre || typeof arbre !== 'object') return [];
	const noeud = arbre as Record<string, unknown>;
	const ici: string[] = [];
	if (
		noeud['type'] === 'EachBlock' &&
		(noeud['context'] as { name?: string } | null)?.name === 'seance'
	) {
		ici.push(texte(noeud['key']));
	}
	return [
		...ici,
		...Object.entries(noeud)
			.filter(([cle]) => cle !== 'key' && cle !== 'expression' && cle !== 'context')
			.flatMap(([, valeur]) => blocsDeSeances(valeur))
	];
}

/** Une expression simple, réécrite : un appel, un nom, une somme ou un membre. */
function texte(expression: unknown): string {
	const e = expression as Record<string, unknown> | undefined;
	if (!e) return '(sans clé)';
	switch (e['type']) {
		case 'Identifier':
			return String(e['name']);
		case 'CallExpression':
			return `${texte(e['callee'])}(${(e['arguments'] as unknown[]).map(texte).join(', ')})`;
		case 'MemberExpression':
			return `${texte(e['object'])}.${texte(e['property'])}`;
		case 'BinaryExpression':
			return `${texte(e['left'])} ${String(e['operator'])} ${texte(e['right'])}`;
		default:
			return String(e['type']);
	}
}

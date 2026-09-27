// Une date que le service accepte d'un formulaire (étape 19, relecture de D2).

import { describe, expect, it } from 'vitest';
import { isSupportedDate } from './dates.js';

describe('isSupportedDate', () => {
	it.each(['1970-01-01', '2026-09-27', '2028-02-29', '2100-12-31'])('accepts %s', (date) => {
		expect(isSupportedDate(date)).toBe(true);
	});

	it.each([
		// PostgreSQL n'a pas d'an 0 : il refuse la requête.
		'0000-01-01',
		// La base range le 31.12.9999, mais le flux agenda calcule son lendemain, en l'an 10000.
		'9999-12-31',
		// Juste avant, juste après les années que couvrent les tests du calcul (ADR 0012).
		'1969-12-31',
		'2101-01-01',
		// Une date qui n'existe pas, une autre forme, rien.
		'2026-02-30',
		'2027-02-29',
		'27.09.2026',
		''
	])('refuses %s', (date) => {
		expect(isSupportedDate(date)).toBe(false);
	});

	it('refuses what is not a string', () => {
		for (const valeur of [null, undefined, 20260927]) expect(isSupportedDate(valeur)).toBe(false);
	});
});

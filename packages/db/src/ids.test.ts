// Identifiants : forme, version et ordre. Aucune base nécessaire.

import { describe, expect, it } from 'vitest';
import { newId } from './ids.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
	it('produces a canonical version 7 UUID', () => {
		for (let i = 0; i < 100; i += 1) expect(newId()).toMatch(UUID_V7);
	});

	it('produces identifiers safe to write in a calendar UID', () => {
		// Règle de l'étape 1 : ni espace, ni caractère de contrôle, ni virgule, point-virgule,
		// antislash ou guillemet, et pas de fin en -AAAA-MM-JJ.
		for (let i = 0; i < 100; i += 1) {
			const id = newId();
			expect(id).toMatch(/^[^\s,;\\"]+$/);
			expect(id).not.toMatch(/-\d{4}-\d{2}-\d{2}$/);
		}
	});

	it('increases strictly, even inside a single millisecond', () => {
		// La monotonie vient du compteur du paquet `uuid` ; une implémentation sans compteur la
		// perdrait une fois sur deux (ADR 0014).
		const ids = Array.from({ length: 10_000 }, () => newId());
		expect(new Set(ids).size).toBe(ids.length);
		const sorted = [...ids].sort();
		expect(sorted).toEqual(ids);
	});
});

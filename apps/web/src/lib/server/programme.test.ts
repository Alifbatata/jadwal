// Une exception de la base, telle que `@jadwal/core` la reçoit. Toutes les lectures passent par
// `toException` : l'espace des responsables, la page publique, l'API et le flux agenda. Ces tests ne
// touchent pas la base : la conversion est une fonction pure.

import { describe, expect, it } from 'vitest';
import { toException } from './programme.js';

const ligne = { id: 'exception', course_id: 'cours', date: '2026-09-14' };

describe('toException', () => {
	it('keeps where a cancelled session had been moved, day and time, and nothing for a plain cancellation', () => {
		// Une séance déplacée puis annulée garde son jour et son heure d'arrivée (étape 20, C2,
		// migration 0075) : c'est là qu'elle reste, annulée. PostgreSQL rend l'heure avec ses secondes.
		expect(
			toException({ ...ligne, kind: 'cancelled', to_date: '2026-09-16', to_start: '18:30:00' })
		).toEqual({
			kind: 'cancelled',
			courseId: 'cours',
			date: '2026-09-14',
			movedTo: { date: '2026-09-16', start: '18:30' }
		});
		expect(toException({ ...ligne, kind: 'cancelled', to_date: null, to_start: null })).toEqual({
			kind: 'cancelled',
			courseId: 'cours',
			date: '2026-09-14'
		});
		expect(
			toException({ ...ligne, kind: 'moved', to_date: '2026-09-16', to_start: '18:30:00' })
		).toEqual({
			kind: 'moved',
			courseId: 'cours',
			date: '2026-09-14',
			toDate: '2026-09-16',
			toStart: '18:30'
		});
	});
});

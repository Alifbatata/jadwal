// Contrôles d'entrée de `withOrg`, avant toute connexion : un contexte qui n'est pas un UUID est
// refusé ici plutôt que d'aboutir à une transaction qui ne verrait rien.

import { describe, expect, it, vi } from 'vitest';
import { withOrg, type Database } from './client.js';

const UUID = '00000000-0000-7000-8000-00000000000b';

/**
 * Base factice. `transaction` ne doit même pas être appelée quand le contexte est invalide ; quand
 * il est valide, elle exécute le rappel pour de bon et retient le SQL posé au passage.
 */
function fakeDatabase(): {
	db: Database;
	transaction: ReturnType<typeof vi.fn>;
	statements: string[];
	parameters: unknown[][];
} {
	const statements: string[] = [];
	const parameters: unknown[][] = [];
	// Un fragment de SQL Drizzle est soit un morceau de texte (`value` est un tableau de chaînes),
	// soit la valeur liée elle-même, intercalée entre deux morceaux.
	const isText = (chunk: unknown): chunk is { value: string[] } =>
		typeof chunk === 'object' &&
		chunk !== null &&
		Array.isArray((chunk as { value?: unknown }).value);
	const transaction = vi.fn(async (run: (tx: unknown) => Promise<unknown>) =>
		run({
			execute: (query: { queryChunks?: unknown[] }) => {
				const chunks = query.queryChunks ?? [];
				statements.push(
					chunks
						.filter(isText)
						.flatMap((chunk) => chunk.value)
						.join('?')
				);
				parameters.push(chunks.filter((chunk) => !isText(chunk)));
				return Promise.resolve(undefined);
			}
		})
	);
	return { db: { transaction } as unknown as Database, transaction, statements, parameters };
}

describe('withOrg', () => {
	it('refuses an organisation identifier that is not a UUID', async () => {
		const { db, transaction } = fakeDatabase();
		for (const value of ['', 'org-a', '00000000-0000-7000-8000', 'x'.repeat(36)]) {
			await expect(
				withOrg(db, value, async () => undefined),
				value
			).rejects.toThrow(TypeError);
		}
		expect(transaction).not.toHaveBeenCalled();
	});

	it('refuses a user identifier that is not a UUID', async () => {
		const { db, transaction } = fakeDatabase();
		await expect(
			withOrg(
				db,
				{ organizationId: '00000000-0000-7000-8000-00000000000a', userId: 'moi' },
				async () => undefined
			)
		).rejects.toThrow(TypeError);
		expect(transaction).not.toHaveBeenCalled();
	});

	it('accepts both letter cases, runs the callback, and gives back what it returns', async () => {
		// Le faux exécute vraiment le rappel : sinon la valeur attendue viendrait du faux lui-même
		// et l'assertion ne dirait rien.
		const { db, transaction, statements } = fakeDatabase();
		expect(await withOrg(db, '00000000-0000-7000-8000-00000000000A', async () => 'fait')).toBe(
			'fait'
		);
		expect(
			await withOrg(
				db,
				{ organizationId: '00000000-0000-7000-8000-00000000000a', userId: UUID },
				async () => 'autre'
			)
		).toBe('autre');
		expect(transaction).toHaveBeenCalledTimes(2);

		// Deux `set_config` par transaction, et le troisième argument — la portée transaction — est
		// ce qui empêche le contexte de rester collé à la connexion rendue au pool (ADR 0013).
		expect(statements).toHaveLength(4);
		for (const statement of statements) {
			expect(statement).toContain('set_config');
			expect(statement).toContain('true');
		}
		expect(statements.filter((text) => text.includes('jadwal.org_id'))).toHaveLength(2);
		expect(statements.filter((text) => text.includes('jadwal.user_id'))).toHaveLength(2);
	});

	it('passes an empty user identifier when the context carries none', async () => {
		const { db, parameters } = fakeDatabase();
		await withOrg(db, '00000000-0000-7000-8000-00000000000a', async () => undefined);
		// Le second `set_config` reçoit bien la chaîne vide, et non `undefined` : c'est elle que la
		// fonction de contexte sait lire sans lever.
		expect(parameters).toEqual([['00000000-0000-7000-8000-00000000000a'], ['']]);
	});
});

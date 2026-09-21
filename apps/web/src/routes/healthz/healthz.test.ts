import { describe, expect, it } from 'vitest';
import { GET } from './+server';
import type { RequestEvent } from './$types';

// Événement minimal : le gestionnaire n'en lit aucun champ.
const event = { url: new URL('http://localhost/healthz') } as unknown as RequestEvent;

describe('GET /healthz', () => {
	it('responds 200 with { status: "ok" }', async () => {
		const response = await GET(event);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/json');
		await expect(response.json()).resolves.toEqual({ status: 'ok' });
	});
});

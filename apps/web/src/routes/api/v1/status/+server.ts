// La réponse d'état, pour la supervision (ADR 0026).
//
// Elle dit deux choses, et pas une de plus : le service répond, et la base répond. Pas de version,
// pas de nom de machine, pas de compte d'organisations — une page d'état qui renseigne un attaquant
// sur ce qui tourne coûte plus qu'elle ne rapporte.

import type { RequestHandler } from './$types.js';
import { sql } from '@jadwal/db';
import { publicError, publicOptions, publicResponse } from '$lib/server/api.js';
import { publicDatabase } from '$lib/server/public.js';

export const GET: RequestHandler = async (event) => {
	try {
		await publicDatabase().execute(sql`select 1`);
	} catch {
		return publicError(503, 'database_unavailable');
	}
	return publicResponse(event, JSON.stringify({ status: 'ok' }), {
		// Un état ne se met jamais en cache : ce serait dire « tout va bien » de mémoire.
		cacheControl: 'no-store'
	});
};

export const OPTIONS: RequestHandler = () => publicOptions();

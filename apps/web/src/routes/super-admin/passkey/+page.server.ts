// La passkey du super-admin : l'enregistrer, la lister, la supprimer (ADR 0025).
//
// C'est le seul écran de l'application qui exige JavaScript, et il n'y a pas de contournement :
// WebAuthn est une API du navigateur, il n'existe pas de chemin par formulaire. L'écran le dit
// plutôt que de rester muet devant un bouton inerte.
//
// La garde d'amorçage n'est pas ici mais dans `hooks.server.ts`, avant que Better Auth ne voie la
// requête : un écran ne protège rien, seule la route protège.

import { redirect } from '@sveltejs/kit';
import { sql } from '@jadwal/db';
import { authDatabase } from '$lib/server/database.js';
import { mustBeSignedIn } from '$lib/server/guard.js';
import type { PageServerLoad } from './$types.js';

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

export const load: PageServerLoad = async (event) => {
	const person = mustBeSignedIn(event);
	// Cet écran est accessible **sans** pouvoirs : c'est par lui qu'on les obtient la première fois.
	if (!person.isSuperAdmin) redirect(303, '/organisations');
	const passkeys = rows<{ id: string; name: string | null; created_at: string }>(
		await authDatabase().execute(sql`
			select "id", "name", "created_at"::text from "passkey"
			where "user_id" = ${person.userId} order by "created_at"
		`)
	);
	return {
		passkeys: passkeys.map((entry) => ({
			id: entry.id,
			name: entry.name ?? 'sans nom',
			createdAt: entry.created_at.slice(0, 10)
		})),
		hasSuperAdminPowers: person.hasSuperAdminPowers,
		/** Vrai tant qu'aucune passkey n'existe : c'est la fenêtre d'amorçage. */
		amorcage: passkeys.length === 0
	};
};

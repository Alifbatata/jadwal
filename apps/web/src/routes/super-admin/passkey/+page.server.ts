// La passkey du super-admin : l'enregistrer, la lister, la supprimer (ADR 0025).
//
// C'est le seul écran de l'application qui exige JavaScript, et il n'y a pas de contournement :
// WebAuthn est une API du navigateur, il n'existe pas de chemin par formulaire. L'écran le dit
// plutôt que de rester muet devant un bouton inerte.
//
// La garde d'amorçage n'est pas ici mais dans `hooks.server.ts`, avant que Better Auth ne voie la
// requête : un écran ne protège rien, seule la route protège.

import { redirect } from '@sveltejs/kit';
import type { IsoDate } from '@jadwal/core';
import { sql } from '@jadwal/db';
import { authDatabase } from '$lib/server/database.js';
import { mustBeSignedIn } from '$lib/server/guard.js';
import { DEFAULT_TIME_ZONE } from '../time-zones.server.js';
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
	// Le jour d'enregistrement est celui de la Suisse, où le service est exploité : lu tel quel,
	// l'instant serait écrit à l'heure de la session de la base, et une passkey enregistrée à 00:30
	// porterait la date de la veille.
	const passkeys = rows<{ id: string; name: string | null; created_at: string }>(
		await authDatabase().execute(sql`
			select "id", "name",
				to_char("created_at" at time zone ${DEFAULT_TIME_ZONE}, 'YYYY-MM-DD') as "created_at"
			from "passkey"
			where "user_id" = ${person.userId} order by "passkey"."created_at"
		`)
	);
	return {
		// Le nom manquant et la date sont écrits par la page, dans sa langue : la date y passe par
		// `numericDate` (JJ.MM.AAAA), jamais telle que la base l'écrit (étape 18, retour A3).
		passkeys: passkeys.map((entry) => ({
			id: entry.id,
			name: entry.name,
			createdAt: entry.created_at.slice(0, 10) as IsoDate
		})),
		hasSuperAdminPowers: person.hasSuperAdminPowers,
		/** Vrai tant qu'aucune passkey n'existe : c'est la fenêtre d'amorçage. */
		amorcage: passkeys.length === 0
	};
};

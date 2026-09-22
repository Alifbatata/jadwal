// Les conditions d'utilisation acceptées d'avance, pour les tests qui entrent dans l'espace d'une
// organisation sans éprouver l'acceptation elle-même (ADR 0044).
//
// Depuis l'étape 16, la porte de l'espace renvoie vers `/conditions/accepter` toute personne qui n'a
// pas accepté la version en cours. Un test qui éprouve les cours, les prières ou les membres n'a pas
// à repasser par cet écran : il pose l'acceptation comme il pose l'adhésion, par le propriétaire
// sous son drapeau d'entretien, dans la même transaction. L'acceptation elle-même, avec son écran
// et son formulaire, est éprouvée dans `conditions.test.ts`.

import { readFileSync } from 'node:fs';
import { newId, sql } from '@jadwal/db';
import { dateDeLaVersion, versionIso } from '../src/lib/conditions/rendu.js';

const source = readFileSync(new URL('../../../docs/CONDITIONS.md', import.meta.url), 'utf8');

/** La version en cours, lue dans le même fichier que le serveur et par la même fonction. */
export const VERSION_DES_CONDITIONS = versionIso(source);

/** La même date, en toutes lettres : « 22 septembre 2026 ». */
export const DATE_DES_CONDITIONS = dateDeLaVersion(source);

/**
 * L'insertion d'une acceptation, à jouer par le propriétaire sous `jadwal.maintenance`. Sans
 * `accepted_at` : la base le pose, comme elle le fait pour l'application.
 */
export function conditionsAcceptees(
	organizationId: string,
	userId: string,
	version: string = VERSION_DES_CONDITIONS
) {
	return sql`
		insert into "terms_acceptance" ("id", "organization_id", "user_id", "version")
		values (${newId()}, ${organizationId}, ${userId}, ${version})
	`;
}

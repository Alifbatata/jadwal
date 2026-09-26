// La langue du compte : celle dans laquelle l'espace des responsables s'affiche pour une personne,
// retenue d'une visite à l'autre (ADR 0046, migration 0060).
//
// La personne seule la change. Le rôle applicatif ne peut modifier que cette colonne du compte, et
// la politique ne lui laisse que la ligne de la personne du contexte : ces deux fonctions posent donc
// la personne, et rien d'autre. Aucune organisation, et aucun compte désigné par la requête : le
// contexte vient de la session, comme partout (ADR 0013).
//
// La personne la choisit en haut de chaque écran de l'espace (`routes/langue/+server.ts`). Deux
// autres chemins l'écrivent : un choix fait avant la connexion (`auth.ts`, `hooks.server.ts`), et,
// pour un compte qui n'en a encore aucune, la langue que la personne voyait (`hooks.server.ts`).

import { ACCOUNT_LANGUAGES, sql, withUser, type Database } from '@jadwal/db';
import { appDatabase } from './database.js';

export type AccountLanguage = (typeof ACCOUNT_LANGUAGES)[number];

/** Une des cinq langues qu'un compte peut retenir. */
export function isAccountLanguage(value: unknown): value is AccountLanguage {
	return typeof value === 'string' && (ACCOUNT_LANGUAGES as readonly string[]).includes(value);
}

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

/**
 * La langue retenue pour le compte de cette personne, ou `null` si elle n'en a encore choisi aucune :
 * l'espace prend alors celle du navigateur, puis le français.
 */
export async function readAccountLanguage(
	userId: string,
	db: Database = appDatabase()
): Promise<AccountLanguage | null> {
	const found = await withUser(db, userId, async (tx) =>
		rows<{ language: string | null }>(
			await tx.execute(sql`select "language" from "user" where "id" = ${userId}`)
		)
	);
	const language = found[0]?.language;
	return isAccountLanguage(language) ? language : null;
}

/**
 * Retient la langue du compte de cette personne. `null` l'efface. Rend `false` si rien n'a été
 * écrit : la politique écarte une ligne sans lever d'erreur, et c'est ce compte qui le dit.
 *
 * Une valeur hors des cinq est refusée ici, avant la base, qui la refuserait aussi.
 */
export async function writeAccountLanguage(
	userId: string,
	language: AccountLanguage | null,
	db: Database = appDatabase()
): Promise<boolean> {
	if (language !== null && !isAccountLanguage(language)) {
		throw new TypeError(`language must be one of ${ACCOUNT_LANGUAGES.join(', ')} or null`);
	}
	const written = await withUser(db, userId, async (tx) =>
		rows<{ id: string }>(
			await tx.execute(sql`
				update "user" set "language" = ${language} where "id" = ${userId} returning "id"
			`)
		)
	);
	return written.length === 1;
}

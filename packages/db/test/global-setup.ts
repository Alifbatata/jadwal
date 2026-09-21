// Prépare la base de test avant toute la suite, et la détruit après. Si PostgreSQL est injoignable,
// la préparation lève : la suite échoue avec un message clair, jamais en silence.

import type { TestProject } from 'vitest/node';
import {
	createTestDatabase,
	dropTestDatabase,
	readRoleAttributes,
	waitForPostgres
} from '../scripts/test-database.mjs';
import { loadDotEnv } from '../src/env.js';

loadDotEnv();

export default async function setup(project: TestProject) {
	// L'état des rôles est relevé avant toute réparation : `createTestDatabase` rejoue la migration
	// d'amorçage et le script des rôles, qui remettent les attributs en ordre. Sans ce relevé, le
	// test qui affirme que le rôle applicatif est non privilégié relirait ce que sa propre
	// préparation vient d'écrire.
	await waitForPostgres();
	project.provide('roleAttributesBeforeSetup', await readRoleAttributes());
	const database = await createTestDatabase();
	project.provide('testDatabase', database);
	return async () => {
		await dropTestDatabase();
	};
}

declare module 'vitest' {
	export interface ProvidedContext {
		testDatabase: string;
		roleAttributesBeforeSetup: Record<
			string,
			{
				rolsuper: boolean;
				rolbypassrls: boolean;
				rolcreatedb: boolean;
				rolcreaterole: boolean;
				rolreplication: boolean;
			}
		>;
	}
}

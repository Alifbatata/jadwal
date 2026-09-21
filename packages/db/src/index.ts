// Point d'entrée de @jadwal/db : schéma, connexion, contexte d'organisation et identifiants.

export * from './schema/index.js';
export { createDatabase, withOrg, withUser } from './client.js';
export type {
	CreateDatabaseOptions,
	Database,
	DatabaseHandle,
	OrgContext,
	Transaction
} from './client.js';
export { connectionSettings, loadDotEnv, testDatabaseName } from './env.js';
export type { ConnectionSettings, DatabaseRole } from './env.js';
export { newId } from './ids.js';
export {
	fillPrayerDays,
	lastImportedDay,
	resolvedPrayerDaysQuery,
	toPrayerSettings,
	toPrayerTable,
	PRAYER_AHEAD_DAYS,
	PRAYER_PAST_DAYS
} from './prayer.js';
export type { FillResult, ResolvedPrayerRow, StoredPrayerSettings } from './prayer.js';

// Les aides de requête sont réexportées d'ici, et jamais importées de `drizzle-orm` ailleurs : le
// paquet est résolu avec des pairs différents selon l'endroit, et deux instances donnent deux types
// `SQL` incompatibles. Une seule porte d'entrée, une seule identité.
export { and, eq, or, sql, type SQL } from 'drizzle-orm';

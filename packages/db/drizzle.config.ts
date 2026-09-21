import { defineConfig } from 'drizzle-kit';
import { connectionSettings, loadDotEnv } from './src/env.js';

// Migrations par fichiers SQL versionnés : `drizzle-kit generate` les écrit, `pnpm migrate` les
// applique. `push` n'est jamais utilisé (pas de synchronisation automatique du schéma).
loadDotEnv();
const settings = connectionSettings('owner');

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/schema/index.ts',
	out: './migrations',
	// À répéter au moment de la connexion (voir src/client.ts), sinon les noms diffèrent.
	casing: 'snake_case',
	breakpoints: true,
	schemaFilter: ['public'],
	dbCredentials: {
		host: settings.host,
		port: settings.port,
		database: settings.database,
		user: settings.user,
		password: settings.password,
		ssl: false
	},
	migrations: { table: '__drizzle_migrations', schema: 'drizzle', prefix: 'index' },
	// Les rôles sont créés et maintenus par les migrations d'amorçage : drizzle-kit ne doit ni les
	// créer ni proposer de les supprimer.
	entities: {
		roles: { exclude: ['postgres', 'jadwal', 'jadwal_owner', 'jadwal_app', 'jadwal_superadmin'] }
	}
});

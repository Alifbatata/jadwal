// Applique les migrations en attente, dans l'ordre du journal, sous le rôle propriétaire.
// Drizzle joue tout le lot dans une seule transaction : un échec n'en laisse aucune à moitié
// appliquée. Portable Windows et Linux : rien d'autre que Node.

// Les dépendances du paquet viennent de `@jadwal/db` — son propre nom — et non de `../src/*.ts`.
// Node refuse de retirer les types d'un fichier situé sous `node_modules`, et l'image de
// production, elle, y met ce paquet : un script qui importerait la source ne démarrerait pas
// sur le serveur. Il faut donc que `dist/` soit construit avant de lancer ces scripts à la main
// (`pnpm build`) ; la CI et l'image le font déjà, dans cet ordre (ADR 0034).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { isMainModule } from './is-main.mjs';
import { connectionSettings, loadDotEnv } from '@jadwal/db';

loadDotEnv();

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));

/** Applique les migrations et rend le nombre de millisecondes écoulées. */
export async function runMigrations(overrides = {}) {
	const settings = connectionSettings('owner', overrides);
	// `max: 1` : les migrations sont séquentielles, un pool n'apporte rien.
	const client = postgres({
		host: settings.host,
		port: settings.port,
		database: settings.database,
		username: settings.user,
		password: settings.password,
		// Voir src/client.ts : le search_path est fixé, pas hérité.
		connection: { search_path: 'public' },
		max: 1,
		onnotice: () => {}
	});
	const startedAt = Date.now();
	try {
		await migrate(drizzle(client), {
			migrationsFolder: join(packageDir, 'migrations'),
			migrationsTable: '__drizzle_migrations',
			migrationsSchema: 'drizzle'
		});
		return { database: settings.database, elapsedMs: Date.now() - startedAt };
	} finally {
		await client.end({ timeout: 5 });
	}
}

if (isMainModule(import.meta.filename)) {
	const result = await runMigrations();
	process.stdout.write(`migrations appliquées sur ${result.database} en ${result.elapsedMs} ms\n`);
}

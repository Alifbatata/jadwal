// Prépare et détruit la base de test. Portable Windows et Linux : rien d'autre que Node.
//
// Une base ne se supprime pas depuis une connexion qui l'utilise : ces opérations passent par la
// base de maintenance, et coupent d'abord les connexions restantes.

// Les dépendances du paquet viennent de `@jadwal/db` — son propre nom — et non de `../src/*.ts`.
// Node refuse de retirer les types d'un fichier situé sous `node_modules`, et l'image de
// production, elle, y met ce paquet : un script qui importerait la source ne démarrerait pas
// sur le serveur. Il faut donc que `dist/` soit construit avant de lancer ces scripts à la main
// (`pnpm build`) ; la CI et l'image le font déjà, dans cet ordre (ADR 0034).
import postgres from 'postgres';
import { connectionSettings, loadDotEnv, testDatabaseName } from '@jadwal/db';

loadDotEnv();
import { bootstrapRoles } from './bootstrap-roles.mjs';
import { runMigrations } from './migrate.mjs';

/**
 * Base de maintenance : celle du rôle du serveur, jamais celle que l'on crée ou supprime. Créer et
 * supprimer une base, comme créer un rôle, sont les seules choses que le propriétaire non
 * privilégié ne peut pas faire — c'est pour cela, et pour cela seulement, que ce rôle existe.
 */
function maintenanceClient(env = process.env, role = 'admin') {
	const settings = connectionSettings(role, {}, env);
	return postgres({
		host: settings.host,
		port: settings.port,
		database: settings.database,
		username: settings.user,
		password: settings.password,
		connection: { search_path: 'public' },
		max: 1,
		// Une seule tentative : si le serveur n'est pas là, on veut le savoir tout de suite.
		max_lifetime: 60,
		connect_timeout: 10,
		onnotice: () => {}
	});
}

function quoteIdentifier(value) {
	if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
		throw new Error(`Unsafe database name: ${JSON.stringify(value)}`);
	}
	return `"${value}"`;
}

/**
 * Attributs des rôles applicatifs, lus tels qu'ils sont, sans rien réparer. À appeler avant
 * `createTestDatabase` : celle-ci rejoue la migration d'amorçage et le script des rôles, qui
 * ramènent tous deux les attributs à ce qu'ils doivent être. Un test qui lirait l'état après coup
 * relirait ce que sa propre préparation vient d'écrire, et ne pourrait donc jamais échouer.
 */
export async function readRoleAttributes(env = process.env) {
	const client = maintenanceClient(env);
	try {
		// Les quatre rôles, et pas seulement les deux applicatifs : le propriétaire est celui que
		// l'ADR 0019 met en avant, et le rôle de connexion détient tous les jetons de session. Les
		// oublier laisserait une dérive sur eux passer sans bruit.
		const rows = await client`
			select rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication
			from pg_roles
			where rolname in ('jadwal_owner', 'jadwal_app', 'jadwal_superadmin', 'jadwal_auth')
			order by rolname
		`;
		return Object.fromEntries(rows.map(({ rolname, ...attributes }) => [rolname, attributes]));
	} finally {
		await client.end({ timeout: 1 });
	}
}

/**
 * Attend que le serveur réponde vraiment. Une sonde de port ne suffit pas : sur un port publié par
 * Docker, le mandataire accepte la connexion avant que PostgreSQL n'écoute.
 */
export async function waitForPostgres({ attempts = 30, delayMs = 1000, env = process.env } = {}) {
	let lastError;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		const client = maintenanceClient(env);
		try {
			await client`select 1`;
			await client.end({ timeout: 1 });
			return;
		} catch (error) {
			lastError = error;
			await client.end({ timeout: 1 }).catch(() => {});
			if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}
	const settings = connectionSettings('admin', {}, env);
	throw new Error(
		`PostgreSQL injoignable sur ${settings.host}:${settings.port} après ${attempts} tentatives. ` +
			'Lancer la base de développement : docker compose -f docker-compose.dev.yml up -d db ' +
			`(cause : ${lastError instanceof Error ? lastError.message : String(lastError)})`
	);
}

/** Recrée la base de test à vide, y applique les migrations et rend son nom. */
export async function createTestDatabase({ env = process.env } = {}) {
	const name = testDatabaseName(env);
	await waitForPostgres({ env });
	const client = maintenanceClient(env);
	try {
		await client`select pg_terminate_backend(pid) from pg_stat_activity
			where datname = ${name} and pid <> pg_backend_pid()`;
		await client.unsafe(`drop database if exists ${quoteIdentifier(name)} with (force)`);
		await client.unsafe(
			`create database ${quoteIdentifier(name)} template template0 encoding 'UTF8'`
		);
	} finally {
		await client.end({ timeout: 5 });
	}
	// Les rôles sont communs au serveur, mais la propriété du schéma et le droit de créer se posent
	// dans la base neuve : d'où une seconde connexion, sur celle-ci. L'amorçage passe AVANT les
	// migrations, puisque c'est lui qui crée le propriétaire qui va les jouer.
	await bootstrapRoles({ database: name }, env);
	await runMigrations({ database: name });
	return name;
}

export async function dropTestDatabase({ env = process.env } = {}) {
	const name = testDatabaseName(env);
	const client = maintenanceClient(env);
	try {
		await client`select pg_terminate_backend(pid) from pg_stat_activity
			where datname = ${name} and pid <> pg_backend_pid()`;
		await client.unsafe(`drop database if exists ${quoteIdentifier(name)} with (force)`);
	} finally {
		await client.end({ timeout: 5 });
	}
}

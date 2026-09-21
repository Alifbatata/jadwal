// Connexion à PostgreSQL et contexte d'organisation. Le contexte est posé par transaction et
// disparaît avec elle (ADR 0013) : `withOrg` est le seul chemin prévu pour lire ou écrire des
// données d'organisation.

import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { connectionSettings, type ConnectionSettings, type DatabaseRole } from './env.js';
import { schema } from './schema/index.js';

export type Database = PostgresJsDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface DatabaseHandle {
	db: Database;
	/** Ferme le pool. `timeout` en secondes : les requêtes en cours ont ce délai pour finir. */
	close: (timeoutSeconds?: number) => Promise<void>;
	settings: ConnectionSettings;
}

export interface CreateDatabaseOptions {
	role?: DatabaseRole;
	overrides?: Partial<ConnectionSettings>;
	env?: NodeJS.ProcessEnv;
	/** Nombre maximal de connexions du pool. */
	max?: number;
}

export function createDatabase(options: CreateDatabaseOptions = {}): DatabaseHandle {
	const settings = connectionSettings(options.role ?? 'app', options.overrides, options.env);
	const client = postgres({
		host: settings.host,
		port: settings.port,
		database: settings.database,
		username: settings.user,
		password: settings.password,
		// Le search_path par défaut vaut « "$user", public » : si un schéma porte le nom du rôle de
		// connexion, les objets non qualifiés y atterriraient. On le fixe, et les fonctions de
		// contexte sont toujours appelées qualifiées (jadwal.…).
		connection: { search_path: 'public' },
		max: options.max ?? 10,
		// Le schéma est explicite partout ; aucune conversion de nom n'est laissée au hasard.
		prepare: true,
		onnotice: () => {}
	});
	// `casing` doit répéter le réglage de drizzle.config.ts, sinon les noms de colonnes diffèrent
	// entre les migrations et les requêtes.
	const db = drizzle(client, { schema, casing: 'snake_case' });
	return {
		db,
		settings,
		close: async (timeoutSeconds = 5) => {
			await client.end({ timeout: timeoutSeconds });
		}
	};
}

/** Un UUID canonique, seule forme acceptée dans le contexte. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OrgContext {
	organizationId: string;
	/** Utilisateur agissant, quand il y en a un : sert aux politiques de `user` et au journal. */
	userId?: string;
}

/**
 * Ouvre une transaction en posant seulement la personne, sans organisation. Sert au tout début
 * d'une requête, quand on cherche justement de quelles organisations quelqu'un est membre : à ce
 * moment-là il n'y a pas encore d'organisation à poser. Les politiques qui exigent une organisation
 * ne rendent alors rien, ce qui est le comportement voulu.
 */
export async function withUser<T>(
	db: Database,
	userId: string,
	callback: (tx: Transaction) => Promise<T>
): Promise<T> {
	if (!UUID.test(userId)) {
		throw new TypeError(`userId must be a UUID, got ${JSON.stringify(userId)}`);
	}
	return db.transaction(async (tx) => {
		await tx.execute(sql`select set_config('jadwal.org_id', '', true)`);
		await tx.execute(sql`select set_config('jadwal.user_id', ${userId}, true)`);
		return callback(tx);
	});
}

/**
 * Ouvre une transaction, y pose le contexte d'organisation, exécute `callback`, et rend la main.
 * Le contexte est local à la transaction : il disparaît au `COMMIT` comme au `ROLLBACK`, et ne peut
 * pas fuir vers la requête suivante de la même connexion.
 */
export async function withOrg<T>(
	db: Database,
	context: OrgContext | string,
	callback: (tx: Transaction) => Promise<T>
): Promise<T> {
	const { organizationId, userId } =
		typeof context === 'string' ? { organizationId: context, userId: undefined } : context;
	if (!UUID.test(organizationId)) {
		throw new TypeError(`organizationId must be a UUID, got ${JSON.stringify(organizationId)}`);
	}
	if (userId !== undefined && !UUID.test(userId)) {
		throw new TypeError(`userId must be a UUID, got ${JSON.stringify(userId)}`);
	}
	return db.transaction(async (tx) => {
		// Le troisième argument (`is_local`) est ce qui limite la portée à la transaction.
		await tx.execute(sql`select set_config('jadwal.org_id', ${organizationId}, true)`);
		await tx.execute(sql`select set_config('jadwal.user_id', ${userId ?? ''}, true)`);
		return callback(tx);
	});
}

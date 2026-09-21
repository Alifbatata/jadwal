// Paramètres de connexion, lus dans l'environnement et jamais codés en dur (règle du dépôt).
// Les champs sont passés séparément au pilote : une URL exigerait un encodage pour cent du mot de
// passe, et une erreur d'encodage se traduit par un échec de connexion difficile à lire.

/**
 * Rôles de connexion.
 *
 * - `admin` est le rôle du serveur, celui que l'image PostgreSQL crée : il est superutilisateur, et
 *   il ne sert qu'à ce que lui seul peut faire — créer les rôles, créer et supprimer la base de
 *   test, poser un mot de passe. Jamais aux migrations, jamais aux données.
 * - `owner` possède le schéma, les tables et les fonctions, et joue les migrations. Il n'est ni
 *   superutilisateur ni porteur de `BYPASSRLS` : la sécurité au niveau des lignes s'applique donc
 *   aussi à lui, ce qui est toute la raison d'être de ce rôle (ADR 0019).
 * - `app` et `superadmin` sont les deux rôles applicatifs, non privilégiés et non propriétaires.
 * - `auth` est celui de la connexion : lui seul touche aux tables de session, et le rôle applicatif
 *   n'y a aucun droit (ADR 0016).
 */
export type DatabaseRole = 'admin' | 'owner' | 'app' | 'superadmin' | 'auth' | 'public';

export interface ConnectionSettings {
	host: string;
	port: number;
	database: string;
	user: string;
	password: string;
}

function required(name: string, value: string | undefined): string {
	if (value === undefined || value === '') {
		throw new Error(`Missing environment variable ${name} (see .env.example)`);
	}
	return value;
}

function port(value: string | undefined): number {
	const parsed = Number(value ?? '5432');
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
		throw new Error(`POSTGRES_PORT must be a port number, got ${String(value)}`);
	}
	return parsed;
}

/**
 * Paramètres de connexion d'un rôle. `database` peut être remplacée, pour la base de test et pour
 * les opérations qui doivent se connecter ailleurs (créer ou supprimer une base).
 */
export function connectionSettings(
	role: DatabaseRole,
	overrides: Partial<ConnectionSettings> = {},
	env: NodeJS.ProcessEnv = process.env
): ConnectionSettings {
	const base = {
		host: env['POSTGRES_HOST'] ?? '127.0.0.1',
		port: port(env['POSTGRES_PORT']),
		database: env['POSTGRES_DB'] ?? 'jadwal'
	};
	const credentials =
		role === 'admin'
			? {
					user: required('POSTGRES_USER', env['POSTGRES_USER']),
					password: required('POSTGRES_PASSWORD', env['POSTGRES_PASSWORD'])
				}
			: role === 'owner'
				? {
						user: env['JADWAL_DB_OWNER_USER'] ?? 'jadwal_owner',
						password: required('JADWAL_DB_OWNER_PASSWORD', env['JADWAL_DB_OWNER_PASSWORD'])
					}
				: role === 'auth'
					? {
							user: env['JADWAL_DB_AUTH_USER'] ?? 'jadwal_auth',
							password: required('JADWAL_DB_AUTH_PASSWORD', env['JADWAL_DB_AUTH_PASSWORD'])
						}
					: role === 'public'
						? {
								user: env['JADWAL_DB_PUBLIC_USER'] ?? 'jadwal_public',
								password: required('JADWAL_DB_PUBLIC_PASSWORD', env['JADWAL_DB_PUBLIC_PASSWORD'])
							}
						: role === 'app'
							? {
									user: env['JADWAL_DB_APP_USER'] ?? 'jadwal_app',
									password: required('JADWAL_DB_APP_PASSWORD', env['JADWAL_DB_APP_PASSWORD'])
								}
							: {
									user: env['JADWAL_DB_SUPERADMIN_USER'] ?? 'jadwal_superadmin',
									password: required(
										'JADWAL_DB_SUPERADMIN_PASSWORD',
										env['JADWAL_DB_SUPERADMIN_PASSWORD']
									)
								};
	return { ...base, ...credentials, ...overrides };
}

/** Nom de la base de test, créée et détruite par la suite. */
export function testDatabaseName(env: NodeJS.ProcessEnv = process.env): string {
	return env['JADWAL_TEST_DB'] ?? 'jadwal_test';
}

/**
 * Charge le fichier `.env` de la racine du dépôt dans `process.env`, s'il existe. Node ne le fait
 * pas tout seul : sans cet appel, la commande documentée dans le README échouerait sur une variable
 * manquante alors que le fichier est bien là. Une variable déjà posée dans l'environnement gagne
 * (c'est le comportement de `process.loadEnvFile`), ce qui laisse la CI passer ses valeurs sans
 * fichier. L'absence de fichier n'est pas une erreur : la CI n'en a pas.
 *
 * Réservé aux scripts et aux tests. Le serveur de production lit son environnement, pas un fichier.
 */
export function loadDotEnv(
	path: string | URL = new URL('../../../.env', import.meta.url)
): boolean {
	try {
		process.loadEnvFile(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
		throw error;
	}
}

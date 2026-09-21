// Amorçage des rôles : les crée s'ils manquent, ramène leurs attributs à ce qu'ils doivent être,
// leur pose un mot de passe lu dans l'environnement, et donne au propriétaire ce qu'il lui faut
// pour jouer les migrations.
//
// C'est le seul endroit où le rôle du serveur — celui que l'image PostgreSQL crée, et qui est
// superutilisateur — est employé. Il ne sert qu'à ce que lui seul peut faire : créer un rôle et
// changer le propriétaire d'un schéma. Les migrations, les données de démonstration et les tests
// passent ensuite par des rôles non privilégiés (ADR 0019).
//
// À lancer AVANT les migrations, une fois par serveur pour les rôles, une fois par base pour les
// droits du propriétaire. Le script est rejouable à volonté : c'est lui qui répare un rôle qui
// aurait dérivé, puisque Drizzle ne rejoue jamais une migration déjà appliquée.

// Les dépendances du paquet viennent de `@jadwal/db` — son propre nom — et non de `../src/*.ts`.
// Node refuse de retirer les types d'un fichier situé sous `node_modules`, et l'image de
// production, elle, y met ce paquet : un script qui importerait la source ne démarrerait pas
// sur le serveur. Il faut donc que `dist/` soit construit avant de lancer ces scripts à la main
// (`pnpm build`) ; la CI et l'image le font déjà, dans cet ordre (ADR 0034).
import postgres from 'postgres';
import { isMainModule } from './is-main.mjs';
import { connectionSettings, loadDotEnv } from '@jadwal/db';

loadDotEnv();

/** Les cinq rôles créés ici, et la variable qui porte le nom de chacun. */
const ROLES = [
	{ role: 'owner', envUser: 'JADWAL_DB_OWNER_USER', defaultUser: 'jadwal_owner' },
	{ role: 'app', envUser: 'JADWAL_DB_APP_USER', defaultUser: 'jadwal_app' },
	{ role: 'superadmin', envUser: 'JADWAL_DB_SUPERADMIN_USER', defaultUser: 'jadwal_superadmin' },
	{ role: 'auth', envUser: 'JADWAL_DB_AUTH_USER', defaultUser: 'jadwal_auth' },
	// Le côté public (ADR 0026) : lecture seule, sans contexte d'organisation, et rien d'autre.
	{ role: 'public', envUser: 'JADWAL_DB_PUBLIC_USER', defaultUser: 'jadwal_public' }
];

/**
 * Attributs refusés à tous ces rôles. `NOBYPASSRLS` est celui qui compte : un rôle qui contourne la
 * sécurité au niveau des lignes voit toutes les organisations. `NOCREATEROLE` compte aussi, parce
 * qu'un rôle qui peut en créer d'autres peut s'ouvrir un chemin de connexion.
 */
const SAFE_ATTRIBUTES = 'nosuperuser nobypassrls nocreatedb nocreaterole noreplication';

export async function bootstrapRoles(overrides = {}, env = process.env) {
	const settings = connectionSettings('admin', overrides, env);
	const client = postgres({
		host: settings.host,
		port: settings.port,
		database: settings.database,
		username: settings.user,
		password: settings.password,
		connection: { search_path: 'public' },
		max: 1,
		onnotice: () => {}
	});
	const done = [];
	try {
		for (const { role, envUser, defaultUser } of ROLES) {
			const plain = env[envUser] ?? defaultUser;
			const name = quoteIdentifier(plain);
			// connectionSettings lève si le mot de passe manque : le message nomme la variable.
			const { password } = connectionSettings(role, {}, env);
			await client.unsafe(`
				do $bootstrap$
				begin
					-- Un rôle appartient au serveur, pas à une base : le verrou sérialise deux bases
					-- du même serveur amorcées en même temps.
					perform pg_advisory_xact_lock(hashtext('jadwal:roles'));
					if not exists (select 1 from pg_roles where rolname = ${quoteLiteral(plain)}) then
						create role ${name} nologin ${SAFE_ATTRIBUTES} noinherit;
					end if;
				end
				$bootstrap$;
			`);
			await client.unsafe(`alter role ${name} ${SAFE_ATTRIBUTES}`);
			// Le mot de passe est passé en littéral : ALTER ROLE n'accepte pas de paramètre lié.
			await client.unsafe(`alter role ${name} login password ${quoteLiteral(password)}`);
			done.push(plain);
		}
		await grantOwnership(client, settings.database, env);
		return done;
	} finally {
		await client.end({ timeout: 5 });
	}
}

/**
 * Ce qu'il faut au propriétaire pour jouer les migrations dans CETTE base, et rien de plus.
 *
 * - `CREATE` sur la base : Drizzle lance `create schema if not exists drizzle` à chaque exécution,
 *   et PostgreSQL vérifie le droit avant de regarder si le schéma existe déjà. Sans ce droit, toute
 *   migration échoue, même quand il n'y a rien à créer.
 * - la propriété du schéma `public` : elle suffit à créer tables, index, séquences, fonctions et
 *   politiques, sans aucun attribut de rôle privilégié. Depuis PostgreSQL 15, `public` appartient à
 *   `pg_database_owner` ; on le nomme donc explicitement au lieu de le chercher par son
 *   propriétaire.
 */
export async function grantOwnership(client, database, env = process.env) {
	const owner = quoteIdentifier(env['JADWAL_DB_OWNER_USER'] ?? 'jadwal_owner');
	await client.unsafe(`grant create on database ${quoteIdentifier(database)} to ${owner}`);
	await client.unsafe(`alter schema "public" owner to ${owner}`);
	// Le rôle applicatif ne doit rien pouvoir créer dans le schéma des tables.
	await client.unsafe(`revoke create on schema "public" from public`);
}

function quoteIdentifier(value) {
	if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
		throw new Error(`Unsafe identifier: ${JSON.stringify(value)}`);
	}
	return `"${value}"`;
}

function quoteLiteral(value) {
	return `'${String(value).replaceAll("'", "''")}'`;
}

if (isMainModule(import.meta.filename)) {
	const roles = await bootstrapRoles();
	process.stdout.write(`rôles prêts à se connecter : ${roles.join(', ')}\n`);
}

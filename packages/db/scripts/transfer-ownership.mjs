// Bascule la propriété d'une base existante vers le rôle propriétaire non privilégié (ADR 0019).
//
// À lancer une fois par base, avec le rôle du serveur, application arrêtée : chaque changement de
// propriétaire prend un verrou exclusif bref sur l'objet visé. Le script est rejouable : il ne
// touche que ce qui n'appartient pas déjà au propriétaire attendu, et il rend le compte.
//
// `REASSIGN OWNED BY` ne convient pas ici. Quand l'ancien propriétaire est le rôle d'amorçage du
// serveur, PostgreSQL refuse en bloc :
//
//     ERROR:  cannot reassign ownership of objects owned by role postgres
//             because they are required by the database system
//
// parce que ce rôle possède aussi des objets partagés épinglés, et que la commande est tout ou rien.
// D'où la boucle ci-dessous, qui nomme les schémas au lieu de filtrer sur l'ancien propriétaire :
// depuis PostgreSQL 15, le schéma `public` appartient à `pg_database_owner` et non au rôle qui l'a
// créé, donc un filtre sur l'ancien propriétaire le raterait.

// Les dépendances du paquet viennent de `@jadwal/db` — son propre nom — et non de `../src/*.ts`.
// Node refuse de retirer les types d'un fichier situé sous `node_modules`, et l'image de
// production, elle, y met ce paquet : un script qui importerait la source ne démarrerait pas
// sur le serveur. Il faut donc que `dist/` soit construit avant de lancer ces scripts à la main
// (`pnpm build`) ; la CI et l'image le font déjà, dans cet ordre (ADR 0034).
import postgres from 'postgres';
import { isMainModule } from './is-main.mjs';
import { connectionSettings, loadDotEnv } from '@jadwal/db';

loadDotEnv();

/** Les schémas du projet. Le suivi de migration de Drizzle en fait partie : sans lui, la migration
 * suivante échouerait sur « permission denied for schema drizzle ». */
const SCHEMAS = ['public', 'jadwal', 'drizzle'];

export async function transferOwnership({ overrides = {}, env = process.env } = {}) {
	const settings = connectionSettings('admin', overrides, env);
	const owner = env['JADWAL_DB_OWNER_USER'] ?? 'jadwal_owner';
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
	try {
		const [{ exists }] = await client`
			select exists (select 1 from pg_roles where rolname = ${owner}) as exists
		`;
		if (!exists) {
			throw new Error(
				`Role ${owner} does not exist: run the role bootstrap first ` +
					'(pnpm --filter @jadwal/db exec node scripts/bootstrap-roles.mjs)'
			);
		}
		const moved = [];
		// Les schémas d'abord : sans eux, rien d'autre ne peut changer de main.
		for (const schema of SCHEMAS) {
			const [row] = await client`
				select pg_get_userbyid(nspowner) as current from pg_namespace where nspname = ${schema}
			`;
			if (row && row.current !== owner) {
				await client.unsafe(`alter schema ${quote(schema)} owner to ${quote(owner)}`);
				moved.push(`schéma ${schema}`);
			}
		}
		// Puis les relations. Les index, les tables TOAST et les types composites de table suivent
		// leur table : les toucher séparément échouerait ou ne servirait à rien. Les tables d'abord,
		// les séquences ensuite, parce qu'une séquence d'identité a pu suivre sa table entre-temps.
		const relations = await client`
			select n.nspname as schema, c.relname as name, c.relkind as kind
			from pg_class c join pg_namespace n on n.oid = c.relnamespace
			where n.nspname in ${client(SCHEMAS)}
				and c.relkind in ('r', 'p', 'f', 'v', 'm', 'S')
				and pg_get_userbyid(c.relowner) <> ${owner}
			order by case c.relkind when 'S' then 3 when 'v' then 2 when 'm' then 2 else 1 end, c.relname
		`;
		for (const relation of relations) {
			const [still] = await client`
				select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
				where n.nspname = ${relation.schema} and c.relname = ${relation.name}
					and pg_get_userbyid(c.relowner) <> ${owner}
			`;
			if (!still) continue;
			await client.unsafe(
				`alter table ${quote(relation.schema)}.${quote(relation.name)} owner to ${quote(owner)}`
			);
			moved.push(`${relation.schema}.${relation.name}`);
		}
		// Les fonctions ne sont pas dans `pg_class` : une boucle sur les relations les oublierait.
		const routines = await client`
			select n.nspname as schema, p.oid::regprocedure::text as signature,
				case p.prokind when 'p' then 'procedure' when 'a' then 'aggregate' else 'function' end as kind
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname in ${client(SCHEMAS)} and pg_get_userbyid(p.proowner) <> ${owner}
		`;
		for (const routine of routines) {
			await client.unsafe(`alter ${routine.kind} ${routine.signature} owner to ${quote(owner)}`);
			moved.push(routine.signature);
		}
		// Les privilèges par défaut posés par l'ancien rôle ne se réassignent pas : ils se reposent.
		// Le projet n'en crée aucun, mais un déploiement ancien pourrait en porter.
		const defaults = await client`
			select d.defaclrole::regrole::text as pose_par,
				d.defaclnamespace::regnamespace::text as schema, d.defaclobjtype as type
			from pg_default_acl d where d.defaclrole::regrole::text <> ${owner}
		`;
		await client.unsafe(`grant create on database ${quote(settings.database)} to ${quote(owner)}`);
		return { moved, database: settings.database, owner, remainingDefaultPrivileges: [...defaults] };
	} finally {
		await client.end({ timeout: 5 });
	}
}

function quote(value) {
	if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
		throw new Error(`Unsafe identifier: ${JSON.stringify(value)}`);
	}
	return `"${value}"`;
}

if (isMainModule(import.meta.filename)) {
	const result = await transferOwnership();
	process.stdout.write(
		`${result.moved.length} objet(s) transféré(s) à ${result.owner} sur ${result.database}\n`
	);
	for (const entry of result.remainingDefaultPrivileges) {
		process.stdout.write(
			`ATTENTION : privilège par défaut resté sur ${entry.pose_par} ` +
				`(schéma ${entry.schema}, type ${entry.type}) : le reposer sous ${result.owner}\n`
		);
	}
}

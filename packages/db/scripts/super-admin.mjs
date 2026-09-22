// Donne le drapeau super-admin à une adresse électronique, et crée le compte s'il n'existe pas.
//
//     node node_modules/@jadwal/db/scripts/super-admin.mjs --email quelquun@exemple.test
//
// C'est la **commande d'exploitant** qui ouvre le premier compte d'une instance. Sans elle, la seule
// façon de désigner un super-admin serait un `update` tapé à la main dans la base — c'est-à-dire la
// chose qu'aucune documentation ne devrait avoir à conseiller.
//
// ## Pourquoi l'application ne peut pas le faire elle-même
//
// Elle ne le peut pas, et c'est voulu (ADR 0025, migration 0032) : une politique interdit au rôle
// d'authentification d'écrire `is_super_admin = true`. Un compte ne devient donc jamais clé maîtresse
// par une requête du service, quoi qu'il arrive à Better Auth. Il faut un accès à la base, donc un
// accès au serveur, donc l'exploitant.
//
// Ce script emploie le rôle du serveur — celui de l'image PostgreSQL, superutilisateur — comme
// `bootstrap-roles.mjs`, et pour la même raison : c'est le seul qui puisse écrire cette colonne.
//
// ## Ce qu'il fait, et ce qu'il ne fait pas
//
// Il crée le compte si l'adresse est inconnue, **avant toute connexion**, et pose le drapeau. Il est
// rejouable : sur un compte qui l'a déjà, il ne fait rien et le dit. Il ne pose aucun mot de passe —
// il n'y en a pas dans ce service —, n'envoie aucun courriel, et ne retire jamais le drapeau à
// personne. Retirer un pouvoir est un geste qui se réfléchit : il se fait à la main, en connaissance
// de cause.
//
// La personne se connecte ensuite normalement, par lien magique, et trouve ses pouvoirs en place —
// sous réserve d'une passkey, que l'écran `/super-admin/passkey` lui fait enregistrer.

// Les dépendances du paquet viennent de `@jadwal/db` — son propre nom — et non de `../src/*.ts`.
// Node refuse de retirer les types d'un fichier situé sous `node_modules`, et l'image de
// production, elle, y met ce paquet : un script qui importerait la source ne démarrerait pas
// sur le serveur.
import postgres from 'postgres';
import { isMainModule } from './is-main.mjs';
import { connectionSettings, loadDotEnv, newId } from '@jadwal/db';

loadDotEnv();

/** La même forme que la contrainte `user_email_ck` de la base : un arobase, un point après. */
const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseArgs(argv) {
	let email;
	let name;
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === '--email') {
			email = argv[i + 1];
			i += 1;
		} else if (argv[i] === '--name') {
			name = argv[i + 1];
			i += 1;
		} else {
			throw new Error(`Argument inconnu : ${argv[i]}`);
		}
	}
	if (!email) throw new Error('Il faut --email <adresse>.');
	const propre = email.trim();
	if (!ADRESSE.test(propre)) throw new Error(`Adresse invalide : ${propre}`);
	return { email: propre, ...(name ? { name: name.trim() } : {}) };
}

/**
 * @param {object} options
 * @param {string} options.email l'adresse à rendre super-admin
 * @param {string} [options.name] le nom affiché, si on le connaît déjà
 * @param {Record<string, unknown>} [options.overrides] de quoi viser une autre base, pour les tests
 * @param {NodeJS.ProcessEnv} [options.env]
 * @returns {Promise<{ email: string, cree: boolean, deja: boolean }>} ce qui a été fait :
 *   `cree` si le compte n'existait pas, `deja` s'il était déjà super-admin.
 */
export async function grantSuperAdmin({ email, name, overrides = {}, env = process.env }) {
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
	try {
		// La comparaison se fait en minuscules, comme l'index d'unicité de la table : sans cela, une
		// deuxième ligne pourrait naître pour la même personne écrite autrement.
		const existant = await client`
			select "id", "is_super_admin" from "user" where lower("email") = lower(${email}) limit 1
		`;
		if (existant.length > 0) {
			const ligne = existant[0];
			if (ligne.is_super_admin) return { email, cree: false, deja: true };
			await client`update "user" set "is_super_admin" = true, "updated_at" = now() where "id" = ${ligne.id}`;
			return { email, cree: false, deja: false };
		}
		await client`
			insert into "user" ("id", "email", "name", "email_verified", "is_super_admin")
			values (${newId()}, ${email}, ${name ?? null}, false, true)
		`;
		return { email, cree: true, deja: false };
	} finally {
		await client.end({ timeout: 5 });
	}
}

if (isMainModule(import.meta.filename)) {
	try {
		const resultat = await grantSuperAdmin(parseArgs(process.argv.slice(2)));
		if (resultat.deja) {
			process.stdout.write(`${resultat.email} est déjà super-admin : rien à faire.\n`);
		} else if (resultat.cree) {
			process.stdout.write(
				`${resultat.email} : compte créé et super-admin.\n` +
					`Il peut maintenant demander un lien de connexion ; ses pouvoirs demandent une passkey.\n`
			);
		} else {
			process.stdout.write(
				`${resultat.email} : super-admin.\n` +
					`Le compte existait déjà. Il devra se reconnecter pour que sa session relise ses droits.\n`
			);
		}
	} catch (erreur) {
		process.stderr.write(`${erreur instanceof Error ? erreur.message : erreur}\n`);
		process.exitCode = 1;
	}
}

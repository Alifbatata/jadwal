// Retire **toutes** les passkeys d'un compte, pour le jour où elles sont perdues.
//
//     node node_modules/@jadwal/db/scripts/reset-passkeys.mjs --email quelquun@exemple.test
//
// ## À quoi elle sert
//
// Les pouvoirs de super-admin exigent une passkey : un lien magique seul ne les donne jamais
// (ADR 0025). C'est la bonne règle, et elle a une conséquence — perdre ses passkeys, c'est perdre
// ses pouvoirs, définitivement, parce que l'application ne sait pas les rendre. La procédure de
// secours était jusqu'ici « manuelle et côté base », c'est-à-dire un `delete` tapé à la main : la
// chose qu'aucune documentation ne devrait avoir à conseiller.
//
// Une passkey synchronisée par le gestionnaire de l'appareil (`backed_up`) survit à la perte du
// téléphone. Celle-ci sert quand rien n'a survécu : appareil et sauvegarde perdus, gestionnaire de
// mots de passe fermé, ou passkey enregistrée sur un appareil qui n'existe plus.
//
// Après son passage, le compte **n'a plus aucune passkey**. La personne se reconnecte par lien
// magique et en enregistre une nouvelle : l'écran accepte la première sans en exiger une déjà
// prouvée, précisément parce qu'il n'y en a plus.
//
// ## Elle ferme aussi les pouvoirs en cours, et c'est le point important
//
// Les pouvoirs ne viennent pas de la table des passkeys : ils viennent de `session.passkey_verified_at`,
// posé au moment où une passkey a été prouvée. Retirer les passkeys sans y toucher laisserait les
// sessions déjà ouvertes garder leurs pouvoirs jusqu'à douze heures — c'est-à-dire exactement ce
// qu'on voulait couper si la raison de la remise à zéro est un vol plutôt qu'une perte.
//
// La colonne est donc remise à `null` sur les sessions du compte, dans **la même transaction**. La
// personne n'est pas déconnectée : elle garde sa session ordinaire, et perd ses pouvoirs jusqu'à sa
// prochaine passkey. Une remise à zéro qui laisse les pouvoirs debout n'est pas une remise à zéro.
//
// ## Pourquoi le rôle du serveur
//
// Le rôle d'authentification aurait le droit d'effacer ces lignes — c'est lui qui les écrit. Mais
// c'est justement le rôle que porte le service exposé à Internet : faire passer par lui la
// réinitialisation d'un facteur d'authentification reviendrait à dire qu'une prise de contrôle de
// l'application suffit à se donner les pouvoirs. Cette commande demande donc le rôle du serveur,
// donc `init.env`, donc un accès au serveur (ADR 0040).
//
// Elle ne retire **jamais** le drapeau super-admin, et ne crée aucun compte : une adresse inconnue
// est une erreur, pas un travail à faire.

// Les dépendances du paquet viennent de `@jadwal/db` — son propre nom — et non de `../src/*.ts`.
// Node refuse de retirer les types d'un fichier situé sous `node_modules`, et l'image de
// production, elle, y met ce paquet : un script qui importerait la source ne démarrerait pas
// sur le serveur.
import postgres from 'postgres';
import { isMainModule } from './is-main.mjs';
import { connectionSettings, loadDotEnv } from '@jadwal/db';

loadDotEnv();

/** La même forme que la contrainte `user_email_ck` de la base : un arobase, un point après. */
const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseArgs(argv) {
	let email;
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === '--email') {
			email = argv[i + 1];
			i += 1;
		} else {
			throw new Error(`Argument inconnu : ${argv[i]}`);
		}
	}
	if (!email) throw new Error('Il faut --email <adresse>.');
	const propre = email.trim();
	if (!ADRESSE.test(propre)) throw new Error(`Adresse invalide : ${propre}`);
	return { email: propre };
}

/**
 * @param {object} options
 * @param {string} options.email l'adresse dont on retire les passkeys
 * @param {Record<string, unknown>} [options.overrides] de quoi viser une autre base, pour les tests
 * @param {NodeJS.ProcessEnv} [options.env]
 * @returns {Promise<{ email: string, passkeys: number, sessions: number }>} ce qui a été retiré :
 *   le nombre de passkeys effacées, et le nombre de sessions qui ont perdu leurs pouvoirs.
 * @throws {Error} si l'adresse est inconnue — une faute de frappe ne doit pas passer pour un succès.
 */
export async function resetPasskeys({ email, overrides = {}, env = process.env }) {
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
		// Une transaction : les passkeys et les pouvoirs qu'elles ont donnés tombent ensemble, ou
		// rien ne tombe. Entre les deux, il y aurait un instant où le compte n'a plus de passkey et
		// garde encore ses pouvoirs.
		return await client.begin(async (tx) => {
			// La comparaison se fait en minuscules, comme l'index d'unicité de la table.
			const comptes = await tx`
				select "id" from "user" where lower("email") = lower(${email}) limit 1
			`;
			if (comptes.length === 0) throw new Error(`Aucun compte pour ${email}.`);
			const userId = comptes[0].id;

			const effacees = await tx`delete from "passkey" where "user_id" = ${userId} returning "id"`;
			const revoquees = await tx`
				update "session" set "passkey_verified_at" = null, "updated_at" = now()
				where "user_id" = ${userId} and "passkey_verified_at" is not null
				returning "id"
			`;
			return { email, passkeys: effacees.length, sessions: revoquees.length };
		});
	} finally {
		await client.end({ timeout: 5 });
	}
}

if (isMainModule(import.meta.filename)) {
	try {
		const resultat = await resetPasskeys(parseArgs(process.argv.slice(2)));
		if (resultat.passkeys === 0) {
			process.stdout.write(
				`${resultat.email} n'avait aucune passkey : rien à retirer.\n` +
					`${resultat.sessions} session(s) ont perdu leurs pouvoirs.\n`
			);
		} else {
			process.stdout.write(
				`${resultat.email} : ${resultat.passkeys} passkey(s) retirée(s), ` +
					`${resultat.sessions} session(s) ont perdu leurs pouvoirs.\n` +
					`Le compte peut se reconnecter par lien magique et enregistrer une nouvelle passkey.\n`
			);
		}
	} catch (erreur) {
		process.stderr.write(`${erreur instanceof Error ? erreur.message : erreur}\n`);
		process.exitCode = 1;
	}
}

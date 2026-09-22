// Les purges, toutes, en une commande (ADR 0036).
//
// Chaque rétention est portée par une **politique de suppression**, pas par ce script : les
// procédures `jadwal.purge_*()` suppriment sans clause de restriction, et c'est la base qui décide
// ce qui peut partir. Ce fichier ne fait que les appeler, dans l'ordre, et dire combien de lignes
// chacune a emportées.
//
// Idempotent par construction : relancé dans la minute, il ne supprime plus rien et le dit.
//
// Usage : node scripts/purge.mjs [--sec]
//   `--sec` n'appelle rien et se contente de lister ce qui serait appelé.

// Les dépendances du paquet viennent de `@jadwal/db` — son propre nom — et non de `../src/*.ts`.
// Node refuse de retirer les types d'un fichier situé sous `node_modules`, et l'image de
// production, elle, y met ce paquet : un script qui importerait la source ne démarrerait pas
// sur le serveur. Il faut donc que `dist/` soit construit avant de lancer ces scripts à la main
// (`pnpm build`) ; la CI et l'image le font déjà, dans cet ordre (ADR 0034).
import postgres from 'postgres';
import { connectionSettings, loadDotEnv } from '@jadwal/db';
import { isMainModule } from './is-main.mjs';

loadDotEnv();

/**
 * Les huit purges, dans l'ordre où elles ont un sens : les journaux d'abord, parce que ce sont eux
 * qui grossissent ; les sessions et les vérifications ensuite, parce qu'une session expirée retient
 * le compte auquel elle appartient ; les comptes en dernier, parce qu'une invitation résolue doit
 * partir avant le compte qu'elle aurait pu rattacher.
 *
 * **L'ordre entre les sessions et les comptes n'est pas indifférent.** `purge_orphan_accounts` exige
 * `NOT EXISTS (session)` : tant que les sessions expirées n'étaient effacées par rien, une ligne
 * fantôme suffisait à retenir un compte pour toujours. Les deux défauts se renforçaient, et les
 * corriger séparément n'aurait rien donné.
 */
export const PURGES = [
	['journal d’audit', 'purge_audit_log'],
	['registre interne du super-admin', 'purge_admin_access_log'],
	['compteur de vues', 'purge_page_views'],
	['limiteur de débit', 'purge_rate_limit'],
	['sessions expirées', 'purge_expired_sessions'],
	['vérifications expirées', 'purge_expired_verifications'],
	['invitations qui ne sont plus en cours', 'purge_resolved_invitations'],
	['comptes sans organisation', 'purge_orphan_accounts']
];

export async function purge(overrides = {}, env = process.env) {
	const settings = connectionSettings('owner', overrides, env);
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
		const resultats = [];
		for (const [libelle, fonction] of PURGES) {
			// Une purge par transaction : si l'une échoue — un verrou de conservation, une table
			// verrouillée —, les précédentes restent acquises et le message dit laquelle a cédé.
			const lignes = await client.begin(async (tx) => {
				const rendu = await tx.unsafe(`select jadwal.${fonction}() as supprimees`);
				return Number(rendu[0]?.supprimees ?? 0);
			});
			resultats.push({ libelle, fonction, lignes });
		}
		return resultats;
	} finally {
		await client.end({ timeout: 5 });
	}
}

if (isMainModule(import.meta.filename)) {
	if (process.argv.includes('--sec')) {
		for (const [libelle, fonction] of PURGES) {
			process.stdout.write(`${fonction} — ${libelle}\n`);
		}
	} else {
		const resultats = await purge();
		const total = resultats.reduce((somme, ligne) => somme + ligne.lignes, 0);
		for (const { libelle, lignes } of resultats) {
			process.stdout.write(`${String(lignes).padStart(7)} ligne(s) — ${libelle}\n`);
		}
		process.stdout.write(`${String(total).padStart(7)} ligne(s) au total\n`);
	}
}

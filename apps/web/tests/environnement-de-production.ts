// L'environnement d'un serveur de test : celui du processus qui le lance, moins ce qui dit « en test ».
//
// La préparation globale (`global-setup.ts`) lance trois serveurs avec lui, et chaque fichier qui
// lance le sien, comme `roles-de-base.test.ts`, en fait autant : un serveur qui se croit en test
// n'éprouve pas ce que la production fait.

/**
 * Vitest pose `TEST=true` et `VITEST=true`, et d'autres `VITEST_*` dans ses processus de travail.
 * Better Auth lit `TEST` : il se croit alors en test et coupe son contrôle d'origine, si bien qu'un
 * lien de connexion dont l'écran de retour est pris sur un autre site y renverrait, alors que la
 * production le refuse. Le serveur doit se croire en production, comme `NODE_ENV` le lui dit : ce
 * que la production refuse, les tests le voient refusé.
 *
 * Retirer `TEST` change aussi la façon dont Better Auth trouve l'adresse du visiteur pour sa limite
 * de débit. Pour une requête sans en-tête d'adresse (`x-forwarded-for`), ce qui est le cas de
 * presque toutes celles des tests, il prenait 127.0.0.1 en test ; sans `TEST`, comme en production,
 * il n'en trouve aucune. Il range alors toutes ces requêtes d'un même chemin dans un seul seau,
 * partagé, et l'écrit une fois par serveur dans la sortie des tests : « WARN [Better Auth]: Rate
 * limiting could not determine a client IP and is falling back to a single shared per-path
 * bucket. » Ce seau remplace celui de 127.0.0.1, que ces requêtes partageaient déjà.
 */
export function productionEnvironment(): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...process.env };
	for (const name of Object.keys(env)) {
		if (name === 'TEST' || name.startsWith('VITEST')) delete env[name];
	}
	return env;
}

/** Ce qui, dans un environnement, dit « en test » : ce qu'un serveur de test ne doit pas recevoir. */
export function nomsDeTest(env: NodeJS.ProcessEnv): string[] {
	return Object.keys(env).filter((name) => name === 'TEST' || name.startsWith('VITEST'));
}

// L'origine publique, vérifiée au démarrage (ADR 0051).
//
// adapter-node lit `ORIGIN` lui-même et s'en sert pour l'adresse de toute requête, sans regarder ce
// que le client écrit. Mais il démarre sans elle, et tire alors l'adresse de `Host` ; et il réduit
// sans rien dire une `ORIGIN` qui porte un chemin, une requête ou un compte. jadwal ne veut ni l'un
// ni l'autre : ce module refuse ces cas, et le crochet `init` le fait jouer avant que le serveur
// écoute. Better Auth refuse déjà une origine avec un chemin (`auth.ts`), mais seulement à la
// première requête qui le sollicite.

/** Les réglages d'adapter-node qu'`ORIGIN` rend sans effet : posés, ils ne peuvent que tromper. */
const IGNORED_SETTINGS = ['PROTOCOL_HEADER', 'HOST_HEADER', 'PORT_HEADER'] as const;

/** Lève une erreur qui dit ce qui ne va pas, si `ORIGIN` ne peut pas servir d'origine publique. */
export function checkPublicOrigin(env: NodeJS.ProcessEnv): void {
	const value = env['ORIGIN'];
	if (!value) throw new Error('ORIGIN is required, for example https://jadwal.example');
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`ORIGIN is not a valid URL, got ${JSON.stringify(value)}`);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(`ORIGIN must use http or https, got ${JSON.stringify(url.protocol)}`);
	}
	if (url.username || url.password) throw new Error('ORIGIN must not carry credentials');
	if (url.pathname !== '/') {
		throw new Error(`ORIGIN must not carry a path, got ${JSON.stringify(url.pathname)}`);
	}
	if (url.search) {
		throw new Error(`ORIGIN must not carry a query, got ${JSON.stringify(url.search)}`);
	}
	if (url.hash) {
		throw new Error(`ORIGIN must not carry a fragment, got ${JSON.stringify(url.hash)}`);
	}
	for (const name of IGNORED_SETTINGS) {
		if (env[name] !== undefined) {
			throw new Error(`${name} must not be set: jadwal takes the address of the site from ORIGIN`);
		}
	}
}

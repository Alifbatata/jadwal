// Ce que l'application sert au site d'une mosquée : le widget, et le script du mode intégré.
//
// Les deux fichiers sont incorporés à la construction plutôt que lus sur le disque à chaud. Le
// serveur de production ne contient que `apps/web/build` : `packages/widget/dist` n'y est pas, et
// un `readFile` y chercherait un fichier absent.
//
// L'empreinte d'intégrité est calculée **sur les octets servis**, jamais sur ceux du dépôt. C'est
// la seule façon qu'elle ne puisse pas diverger : une empreinte fausse ne dégrade rien, elle bloque
// le script à cent pour cent.

import { createHash } from 'node:crypto';
import source from '@jadwal/widget?raw';
import embedSource from '$lib/embed/embed.js?raw';

/** Les octets du widget, tels qu'ils partiront sur le réseau. */
export const WIDGET = source;
/** Les octets du script du mode intégré. */
export const EMBED = embedSource;

function octets(texte: string): Buffer {
	return Buffer.from(texte, 'utf8');
}

/**
 * L'empreinte d'intégrité, en SHA-384 : c'est l'algorithme des exemples de la spécification, et
 * mélanger les algorithmes serait une erreur — le navigateur ne retient que le plus fort présent et
 * ignore les autres, donc une empreinte périmée dans un algorithme plus fort bloquerait tout.
 */
export const WIDGET_INTEGRITY = `sha384-${createHash('sha384').update(octets(WIDGET)).digest('base64')}`;

/**
 * Le segment de version de l'URL immuable : les douze premiers caractères d'une empreinte du
 * contenu. Il change donc exactement quand le fichier change, sans numéro à incrémenter à la main
 * et sans variable d'environnement à oublier de poser.
 *
 * Conséquence assumée : une adresse versionnée cesse d'exister dès la publication suivante. Pour
 * qui a épinglé une empreinte, c'est la même chose qu'une empreinte qui ne correspond plus — le
 * script ne s'exécute pas, et le contenu de repli de la balise reste visible.
 */
export const WIDGET_VERSION = createHash('sha256')
	.update(octets(WIDGET))
	.digest('base64url')
	.slice(0, 12);

export const WIDGET_ETAG = `"${WIDGET_VERSION}"`;
export const EMBED_ETAG = `"${createHash('sha256').update(octets(EMBED)).digest('base64url').slice(0, 12)}"`;

/**
 * Toutes les versions déjà publiées, incorporées au serveur à la construction (ADR 0005).
 *
 * **Aucune version publiée n'est jamais retirée.** Une mosquée qui a collé l'adresse immuable — la
 * seule qui porte une empreinte d'intégrité — la garde des années ; cesser de la servir ferait
 * disparaître son programme de son site, sans message. Le dossier `published/` du paquet est donc
 * le registre, il n'est jamais vidé, et `tests/widget.test.ts` le relit pour échouer si l'une de
 * ses versions cessait d'être servie.
 *
 * La version courante s'y ajoute d'elle-même : `pnpm build` du paquet l'archive.
 */
const ARCHIVES = import.meta.glob('../../../../../packages/widget/published/*/jadwal-widget.js', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

/** `<version> → octets`, la version courante comprise même si l'archive n'a pas encore été faite. */
export const VERSIONS: ReadonlyMap<string, string> = new Map<string, string>([
	...Object.entries(ARCHIVES).map(
		([chemin, source]) => [chemin.split('/').at(-2) as string, source] as const
	),
	[WIDGET_VERSION, WIDGET]
]);

/** Le chemin de l'adresse versionnée, à mettre dans le code que la mosquée colle. */
export function widgetPath(): string {
	return `/widget/${WIDGET_VERSION}/jadwal-widget.js`;
}

/**
 * `text/javascript`, et pas `application/javascript` : le second est un type hérité, obsolété par
 * la RFC 9239. Comme `x-content-type-options: nosniff` est posé sur toute réponse par les hooks, un
 * type approximatif ferait refuser l'exécution du fichier par le navigateur.
 */
export const JS_CONTENT_TYPE = 'text/javascript; charset=utf-8';

/** Une adresse versionnée ne change jamais de contenu : un an, et rien à revalider. */
export const CACHE_WIDGET_VERSIONNE = 'public, max-age=31536000, immutable';
/**
 * L'adresse mouvante, elle, doit se corriger vite. `max-age` court plutôt que `no-cache` : le
 * fichier porte une entité de validation, donc une revalidation coûte un `304` sans corps.
 */
export const CACHE_WIDGET_MOUVANT = 'public, max-age=3600, stale-while-revalidate=86400';

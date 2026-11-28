// Ce que le travailleur de service décide (étape 24, ADR 0054) : quelle requête il prend, quelle
// réponse il garde, et comment il marque une copie servie sans réseau.
//
// Des fonctions pures, sans rien du navigateur : le travailleur (`src/service-worker/index.ts`) les
// appelle, et `copie.test.ts` les éprouve sans navigateur. Ce fichier part dans le travailleur :
// il n'importe rien, et surtout pas les dictionnaires.

/** L'attribut du paragraphe que la page porte caché, et que le travailleur montre. */
export const MARQUE_COPIE = 'data-jadwal-copie';
/** Les deux creux de ce paragraphe : le jour et l'heure où la copie a été gardée. */
export const MARQUE_JOUR = 'data-jadwal-copie-jour';
export const MARQUE_HEURE = 'data-jadwal-copie-heure';

/** L'en-tête qu'une copie porte dans le cache : l'instant où elle a été gardée. */
export const EN_TETE_COPIE = 'x-jadwal-copie';

/** Combien de pages et de fichiers ce navigateur garde, au plus : les plus anciens partent. */
export const PAGES_GARDEES = 40;
export const FICHIERS_GARDES = 40;

/**
 * Combien de temps le réseau a pour répondre **quand une copie existe** : au-delà, la copie est
 * servie, et la réponse, si elle finit par arriver, la remplace pour la prochaine fois. Sans copie,
 * on attend le réseau aussi longtemps que le navigateur.
 */
export const DELAI_DU_RESEAU_MS = 5000;

export interface Requete {
	readonly methode: string;
	/** `Request.mode` : `navigate` pour une page que l'on ouvre. */
	readonly mode: string;
	/** `Request.destination` : `style`, `image`, `font`… */
	readonly destination: string;
	readonly url: string;
	/** La portée du travailleur, en adresse complète : `https://…/m/`. */
	readonly portee: string;
}

/** Ce qui ne change jamais, que le serveur dit `immutable` : feuilles de style, icônes. */
const FICHIERS = new Set(['style', 'image', 'font']);

/**
 * Ce que le travailleur fait d'une requête : une `page` (le réseau d'abord, la copie en secours),
 * un `fichier` (la copie d'abord : il ne change jamais), ou rien, et le navigateur fait comme s'il
 * n'y avait pas de travailleur.
 *
 * Rien : tout ce qui n'est pas une lecture, tout ce qui vient d'un autre site, l'espace des
 * responsables et l'API (hors de la portée), une page ouverte dans un cadre, les scripts, le
 * manifeste.
 */
export function genreDeRequete(requete: Requete): 'page' | 'fichier' | null {
	if (requete.methode !== 'GET') return null;
	const url = new URL(requete.url);
	const portee = new URL(requete.portee);
	if (url.origin !== portee.origin) return null;
	if (FICHIERS.has(requete.destination)) return 'fichier';
	// Une page que l'on ouvre dans un onglet ou dans l'application installée, et rien d'autre.
	if (requete.mode !== 'navigate' || requete.destination !== 'document') return null;
	if (!url.pathname.startsWith(portee.pathname)) return null;
	// Le widget encadre un programme, pas une application (ADR 0053) : ni son cadre, que le
	// navigateur dit par la destination `iframe`, ni son adresse ouverte à la main.
	if (url.searchParams.has('embed')) return null;
	// L'écoute du direct (ADR 0057) : sans réseau, il n'y a pas de direct, et une copie dirait
	// « pas de direct » quand il y en a peut-être un.
	if (url.searchParams.get('vue') === 'direct') return null;
	return 'page';
}

/** Une page se garde si elle a été servie pour de bon : ni erreur, ni redirection, ni flux. */
export function pageAGarder(reponse: {
	status: number;
	type: string;
	contentType: string | null;
}): boolean {
	return (
		reponse.status === 200 &&
		reponse.type === 'basic' &&
		(reponse.contentType ?? '').startsWith('text/html')
	);
}

/** Un fichier se garde si le serveur dit lui-même qu'il ne changera jamais. */
export function fichierAGarder(reponse: {
	status: number;
	type: string;
	cacheControl: string | null;
}): boolean {
	return (
		reponse.status === 200 &&
		reponse.type === 'basic' &&
		/\bimmutable\b/.test(reponse.cacheControl ?? '')
	);
}

/**
 * Le réseau a répondu : toute réponse du serveur, un 404 compris, qui est une vraie réponse. Une
 * panne (5xx) n'en est pas une : si une copie existe, elle vaut mieux qu'une page d'erreur.
 */
export function reseauARepondu(status: number): boolean {
	return status < 500;
}

/** Les clés à retirer d'un cache qui dépasse son plafond : les plus anciennes, en tête de liste. */
export function aElaguer<Cle>(cles: readonly Cle[], plafond: number): Cle[] {
	return cles.slice(0, Math.max(0, cles.length - plafond));
}

const deuxChiffres = (nombre: number) => String(nombre).padStart(2, '0');

/**
 * Le jour et l'heure d'une copie, à l'heure de l'appareil : `26.11.2026` et `14:05`. Le jour
 * s'écrit comme toutes les dates du service (`numericDate`), que ce fichier ne peut pas importer.
 */
export function jourEtHeure(quand: Date): { jour: string; heure: string } {
	return {
		jour: `${deuxChiffres(quand.getDate())}.${deuxChiffres(quand.getMonth() + 1)}.${quand.getFullYear()}`,
		heure: `${deuxChiffres(quand.getHours())}:${deuxChiffres(quand.getMinutes())}`
	};
}

// `(?![-\w])` : `data-jadwal-copie-jour` commence comme `data-jadwal-copie`.
const BALISE = new RegExp(`<p\\b[^>]*\\s${MARQUE_COPIE}(?![-\\w])[^>]*>`);
const CACHE = /\shidden(?:="[^"]*")?(?![-\w])/;
const creux = (marque: string) =>
	new RegExp(`(<span\\b[^>]*\\s${marque}(?![-\\w])[^>]*>)(</span>)`);

/**
 * La page gardée, telle qu'elle part quand le réseau ne répond pas : son paragraphe caché devient
 * visible, et dit de quand date la copie. Une page qui ne porte pas ce paragraphe part telle quelle.
 */
export function marquerCopie(html: string, quand: Date): string {
	if (!BALISE.test(html)) return html;
	const { jour, heure } = jourEtHeure(quand);
	return html
		.replace(BALISE, (balise) => balise.replace(CACHE, ''))
		.replace(creux(MARQUE_JOUR), `$1${jour}$2`)
		.replace(creux(MARQUE_HEURE), `$1${heure}$2`);
}

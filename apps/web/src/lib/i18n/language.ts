// La langue de l'espace des responsables : d'où elle vient, et où revient le choix de la langue
// (étape 18, retour D2).
//
// Pur : le hook et la route du choix lisent la requête et appellent ces fonctions, qui ne lisent rien
// d'autre. La page publique n'y passe pas : elle prend la langue de son adresse (ADR 0027), et elle ne
// lit ni cookie ni session.

import { isLangue, type Langue } from '../i18n.js';

/**
 * Le cookie qui retient, sur ce navigateur, la langue choisie. Il n'est posé que par un choix fait
 * dans le formulaire, jamais au premier passage, et ne porte que le code de la langue. Il sert aux
 * écrans d'avant la connexion ; une fois connectée, la personne a la langue de son compte.
 */
export const LANGUAGE_COOKIE = 'jadwal_language';

/**
 * Le cookie qui dit qu'un choix fait avant la connexion attend d'être donné au compte. Il est posé
 * avec le choix, par une personne qui n'est pas connectée, et retiré dès que ce choix est devenu la
 * langue du compte : à la connexion. Il ne porte rien d'autre que sa présence.
 *
 * Sans lui, le serveur ne saurait pas distinguer deux navigateurs qui envoient la même chose : celui
 * où la personne vient de choisir l'allemand avant de se connecter, et celui où l'allemand est resté
 * d'un choix ancien, alors que le compte a changé depuis sur un autre appareil.
 *
 * Il ne vit pas plus longtemps qu'un lien de connexion : quinze minutes après le choix, et de nouveau
 * quinze minutes à chaque lien demandé. Le lien, lui, emporte le choix (`signInCallback`), sur
 * quelque navigateur qu'il s'ouvre. Ouvert ailleurs, il ne peut pas retirer ce cookie-ci : c'est sa
 * courte vie qui l'empêche de défaire plus tard une langue changée entre-temps sur l'autre appareil.
 */
export const PENDING_CHOICE_COOKIE = 'jadwal_language_pending';

/** Un an, en secondes : le choix se garde d'une visite à l'autre. */
export const LANGUAGE_COOKIE_SECONDS = 31_536_000;

/**
 * Les attributs des deux cookies, les mêmes pour les poser et pour les retirer : lisibles du seul
 * serveur, envoyés par les formulaires du service, `Secure` dès que le service est servi en HTTPS,
 * comme la session (`auth.ts`). Seule la vie change : un an pour la langue choisie, celle d'un lien
 * de connexion pour le choix en attente.
 */
export function languageCookieOptions(
	url: URL,
	maxAge: number = LANGUAGE_COOKIE_SECONDS
): {
	path: '/';
	httpOnly: true;
	sameSite: 'lax';
	secure: boolean;
	maxAge: number;
} {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge
	};
}

/**
 * Le paramètre d'adresse qui demande une langue pour une seule page, sans rien retenir : le lien des
 * conditions au pied d'une page publique le porte, pour que la page s'ouvre dans la langue que le
 * visiteur lisait (retour D4). C'est le nom que l'API et le flux agenda donnent déjà à la langue.
 */
export const LANGUAGE_PARAMETER = 'lang';

/**
 * Le paramètre qui porte, dans le lien de connexion, la langue choisie avant la connexion. Il est
 * ajouté à l'écran où le lien ramène, et lu une seule fois : quand le lien est vérifié (`auth.ts`),
 * pour la personne que son jeton désigne. Ailleurs, il ne compte pas : un écran ne le lit pas, et une
 * adresse qui le porte, posée sur un autre site, ne change ni la page ni le compte.
 */
export const SIGN_IN_CHOICE_PARAMETER = 'language';

/** L'écran où ramène un lien de connexion. */
const SIGN_IN_LANDING = '/organisations';

/**
 * L'écran où ramènera le lien de connexion demandé sur ce navigateur : celui des organisations, avec
 * la langue choisie avant la connexion quand ce choix attend encore d'être donné au compte. Le choix
 * voyage ainsi avec le lien, et vaut sur le navigateur qui l'ouvre, quel qu'il soit.
 *
 * Un cookie de langue sans choix en attente ne part pas : il peut dater d'un choix ancien, que la
 * personne a défait depuis, sur un autre appareil. Une valeur qui n'est pas l'une des cinq langues ne
 * part pas non plus.
 */
export function signInCallback(sources: {
	cookie?: string | null | undefined;
	pending?: boolean | undefined;
}): string {
	const { cookie, pending } = sources;
	if (!pending || !cookie || !isLangue(cookie)) return SIGN_IN_LANDING;
	return `${SIGN_IN_LANDING}?${new URLSearchParams({ [SIGN_IN_CHOICE_PARAMETER]: cookie })}`;
}

/**
 * La langue choisie avant la connexion qu'emporte un lien de connexion, lue dans l'écran où il
 * ramène, ou `null`. Seule l'une des cinq langues compte : le lien passe par une boîte aux lettres et
 * par un navigateur, qui peuvent y écrire n'importe quoi.
 */
export function signInChoice(callback: string | null | undefined, origin: string): Langue | null {
	if (!callback) return null;
	try {
		const choice = new URL(callback, origin).searchParams.get(SIGN_IN_CHOICE_PARAMETER);
		return choice !== null && isLangue(choice) ? choice : null;
	} catch {
		return null;
	}
}

/**
 * La meilleure langue du service parmi celles que le navigateur demande (`Accept-Language`), ou
 * `null` s'il n'en demande aucune des cinq.
 *
 * Le poids `q` décide, puis l'ordre d'écriture. Seule la langue principale compte : `de-CH` et `de`
 * donnent l'allemand. Une entrée illisible, `*`, ou refusée (`q=0`) est écartée.
 */
export function browserLanguage(header: string | null | undefined): Langue | null {
	if (!header) return null;
	let best: { language: Langue; weight: number } | null = null;
	for (const entry of header.split(',')) {
		const [tag = '', ...parameters] = entry.trim().split(';');
		const primary = tag.trim().toLowerCase().split('-')[0] ?? '';
		if (!isLangue(primary)) continue;
		let weight = 1;
		for (const parameter of parameters) {
			const [name, value] = parameter.trim().split('=');
			if (name?.trim() !== 'q') continue;
			weight = /^\s*(0(\.\d{0,3})?|1(\.0{0,3})?)\s*$/.test(value ?? '') ? Number(value) : 0;
		}
		if (weight > 0 && (best === null || weight > best.weight)) best = { language: primary, weight };
	}
	return best?.language ?? null;
}

/** Ce qu'une requête dit de la langue, du plus fort au plus faible. */
export interface LanguageSources {
	/** La langue demandée par l'adresse, pour cette page seulement (`?lang=`). */
	asked?: string | null | undefined;
	/** La langue du compte de la personne connectée, si elle en a une. */
	account?: Langue | null | undefined;
	/** La valeur du cookie du choix, telle que le navigateur l'envoie. */
	cookie?: string | null | undefined;
	/** L'en-tête `Accept-Language`. */
	browser?: string | null | undefined;
}

/**
 * La langue d'un écran de l'espace : celle que l'adresse demande ; sinon celle du compte ; sinon celle
 * retenue sur ce navigateur ; sinon la meilleure que le navigateur demande ; sinon le français. Une
 * valeur qui n'est pas l'une des cinq langues ne compte pas : le cookie et l'adresse viennent du
 * navigateur, qui peut y écrire n'importe quoi.
 */
export function spaceLanguage(sources: LanguageSources): Langue {
	const { asked, account, cookie, browser } = sources;
	if (asked && isLangue(asked)) return asked;
	if (account) return account;
	if (cookie && isLangue(cookie)) return cookie;
	return browserLanguage(browser) ?? 'fr';
}

/** Ce que la requête d'une personne connectée dit de la langue à retenir pour son compte. */
export interface AccountSources {
	/** La langue du compte, ou `null` s'il n'en a encore aucune. */
	account: Langue | null;
	/** La valeur du cookie du choix, telle que le navigateur l'envoie. */
	cookie?: string | null | undefined;
	/** Le choix du cookie a été fait avant la connexion, et n'a pas encore été donné au compte. */
	pending?: boolean | undefined;
	/** L'en-tête `Accept-Language`. */
	browser?: string | null | undefined;
}

/**
 * La langue à écrire sur le compte d'une personne connectée, ou `null` s'il n'y a rien à écrire.
 *
 * - Un choix fait avant la connexion devient la langue du compte, même si le compte en avait une :
 *   c'est la dernière chose que la personne a dite, sur l'écran même de la connexion. Le lien de
 *   connexion l'emporte aussi, et la vérification du lien l'écrit (`auth.ts`) ; ici, c'est le
 *   cookie d'attente qui le dit, sur le navigateur où il a été fait.
 * - Un compte sans langue reçoit celle que la personne voyait : son choix sur ce navigateur, sinon
 *   celle du navigateur, sinon le français.
 * - Ensuite, le compte fait foi : un cookie resté sur un navigateur ne le change pas, puisque la
 *   personne a pu changer de langue depuis, sur un autre appareil.
 */
export function languageForTheAccount(sources: AccountSources): Langue | null {
	const { account, cookie, pending, browser } = sources;
	if (pending && cookie && isLangue(cookie)) return cookie === account ? null : cookie;
	if (account === null) return spaceLanguage({ cookie, browser });
	return null;
}

/** Un chemin du service qu'un navigateur ne peut pas lire comme une autre origine. */
function staysOnTheService(path: string, origin: string): boolean {
	if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return false;
	try {
		return new URL(path, origin).origin === new URL(origin).origin;
	} catch {
		return false;
	}
}

/**
 * L'écran où revenir après le choix de la langue : un chemin du service, jamais une autre origine.
 *
 * Le formulaire envoie le chemin de l'écran d'où il part. Tout ce qui n'est pas un chemin absolu du
 * même site renvoie à l'accueil : `//ailleurs`, `/\ailleurs` (qu'un navigateur lit comme `//`), une
 * adresse complète. La langue demandée par l'adresse est retirée, sans quoi elle défait le choix qui
 * vient d'être fait ; celle qu'un lien de connexion a portée jusqu'à l'écran d'arrivée aussi, qui n'a
 * compté qu'une fois ; et le nom d'une action de formulaire (`?/choisir`), qui ne se rejoue pas.
 *
 * Le chemin est vérifié deux fois : tel qu'il arrive, et tel qu'il repart. Entre les deux, l'adresse
 * le normalise, et la normalisation peut faire apparaître ce que la valeur ne montrait pas : les
 * segments en point disparaissent, encodés ou non, une tabulation est effacée, une barre inverse
 * devient une barre, si bien que `/.//ailleurs` devient `//ailleurs`, qu'un navigateur lit comme une
 * autre origine. Ce qui ne reste pas sur le service renvoie à l'accueil.
 */
export function returnPath(value: string, origin: string): string {
	if (!staysOnTheService(value, origin)) return '/';
	const url = new URL(value, origin);
	url.searchParams.delete(LANGUAGE_PARAMETER);
	url.searchParams.delete(SIGN_IN_CHOICE_PARAMETER);
	for (const name of [...url.searchParams.keys()]) {
		if (name.startsWith('/')) url.searchParams.delete(name);
	}
	const search = url.searchParams.toString();
	const path = `${url.pathname}${search ? `?${search}` : ''}`;
	return staysOnTheService(path, origin) ? path : '/';
}

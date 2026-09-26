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

/** Un an, en secondes : le choix se garde d'une visite à l'autre. */
export const LANGUAGE_COOKIE_SECONDS = 31_536_000;

/**
 * Le paramètre d'adresse qui demande une langue pour une seule page, sans rien retenir : le lien des
 * conditions au pied d'une page publique le porte, pour que la page s'ouvre dans la langue que le
 * visiteur lisait (retour D4). C'est le nom que l'API et le flux agenda donnent déjà à la langue.
 */
export const LANGUAGE_PARAMETER = 'lang';

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

/**
 * L'écran où revenir après le choix de la langue : un chemin du service, jamais une autre origine.
 *
 * Le formulaire envoie le chemin de l'écran d'où il part. Tout ce qui n'est pas un chemin absolu du
 * même site renvoie à l'accueil : `//ailleurs`, `/\ailleurs` (qu'un navigateur lit comme `//`), une
 * adresse complète. La langue demandée par l'adresse est retirée, sans quoi elle défait le choix qui
 * vient d'être fait ; et le nom d'une action de formulaire (`?/choisir`) aussi, qui ne se rejoue pas.
 */
export function returnPath(value: string, origin: string): string {
	if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
	let url: URL;
	try {
		url = new URL(value, origin);
	} catch {
		return '/';
	}
	if (url.origin !== new URL(origin).origin) return '/';
	url.searchParams.delete(LANGUAGE_PARAMETER);
	for (const name of [...url.searchParams.keys()]) {
		if (name.startsWith('/')) url.searchParams.delete(name);
	}
	const search = url.searchParams.toString();
	return `${url.pathname}${search ? `?${search}` : ''}`;
}

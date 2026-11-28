// Limitation de débit par adresse électronique.
//
// Le limiteur de Better Auth ne connaît que l'adresse IP : sa clé est « IP | chemin », et le corps
// de la requête n'est jamais lu. Un pool d'adresses IP — un réseau mobile, un service d'anonymat —
// peut donc noyer une boîte aux lettres sans jamais l'atteindre. Ce volet-ci complète l'autre ; les
// deux partagent la même table, donc le même compteur entre toutes les instances du serveur.
//
// Le compteur ne change jamais la réponse rendue à l'appelant : la demande de lien répond toujours
// la même chose, qu'elle ait été envoyée ou non (ADR 0017). Refuser en silence est ici la bonne
// réponse — la personne légitime en a déjà reçu un.

import { createHmac } from 'node:crypto';
import { newId, sql, type Database } from '@jadwal/db';

/**
 * Le sel des clés. Le secret de session est déjà obligatoire en production et déjà partagé par
 * toutes les instances : c'est exactement ce qu'il faut ici, et cela n'ajoute rien à configurer.
 *
 * En développement, faute de secret, un sel tiré au hasard au démarrage. Le compteur cesse alors
 * d'être partagé entre deux processus — ce qui n'arrive qu'en développement, où il n'y en a qu'un.
 */
function sel(): string {
	return process.env['BETTER_AUTH_SECRET'] ?? SEL_DE_SECOURS;
}
const SEL_DE_SECOURS = newId();

/**
 * La clé rangée en base : jamais la valeur d'origine.
 *
 * Une adresse IP et une adresse électronique sont toutes deux des données personnelles, et une
 * table de seaux les conservait en clair depuis l'étape 5 — alors que l'ADR 0009 et
 * `docs/CONDITIONS.md` affirment le contraire (ADR 0032). Le condensat suffit au compteur : il n'a
 * jamais besoin de savoir de qui il s'agit, seulement de reconnaître deux requêtes venues du même
 * appelant.
 *
 * Ce que cela protège, et ce que cela ne protège pas : une base volée ne rend plus les adresses,
 * mais quelqu'un qui tient **aussi** le secret peut retrouver une adresse IPv4 en épuisant les
 * quatre milliards de possibilités. C'est la limite de tout condensat d'un ensemble petit, et c'est
 * pourquoi la purge à un jour compte autant que le hachage.
 */
function cle(valeur: string): string {
	return createHmac('sha256', sel()).update(valeur).digest('base64url');
}

export interface Budget {
	/** Durée de la fenêtre, en secondes. */
	windowSeconds: number;
	/** Nombre de demandes acceptées dans une fenêtre. */
	max: number;
}

/** Trois liens par heure et par adresse : de quoi se tromper deux fois, pas de quoi noyer. */
export const MAGIC_LINK_BUDGET: Budget = { windowSeconds: 3600, max: 3 };

/**
 * Vingt demandes de lien par heure et par adresse IP, pour le formulaire `/connexion` (étape 25,
 * ADR 0058). La limitation de Better Auth ne voit que les requêtes HTTP vers `/api/auth/*` : une
 * action de formulaire, qui appelle son API serveur, lui échappe. Sans ce seau, une seule machine
 * ferait écrire le service à autant d'adresses qu'elle en invente. Le chemin HTTP reçoit la même
 * borne, dans la règle de Better Auth (`auth.ts`).
 */
export const SIGN_IN_FORM_BUDGET: Budget = { windowSeconds: 3600, max: 20 };

/**
 * Dix liens par heure depuis une même adresse IP, au-delà desquels plus aucun compte ne s'ouvre
 * depuis elle (ADR 0058). Chaque lien compte, connu ou non ; seule l'ouverture d'un compte est
 * retenue : un compte existant reçoit toujours le sien.
 */
export const SIGN_UP_ADDRESS_BUDGET: Budget = { windowSeconds: 3600, max: 10 };

/** Soixante liens par heure pour tout le service, avec la même règle (ADR 0058). */
export const SIGN_UP_SERVICE_BUDGET: Budget = { windowSeconds: 3600, max: 60 };

/** Le seau du service entier : une seule clé. */
export const SIGN_UP_SERVICE_KEY = 'sign-up:service';

/** Le seau d'une adresse IP pour le formulaire de connexion. */
export function signInFormKey(address: string): string {
	return `sign-in-form:${address}`;
}

/** Le seau d'une adresse IP pour l'ouverture des comptes. */
export function signUpAddressKey(address: string): string {
	return `sign-up:${address}`;
}

/**
 * Trois demandes d'accès par heure et par adresse IP (étape 22) : une organisation n'en dépose
 * qu'une, et celle qui s'est trompée la refait. Au-delà, le formulaire servirait à remplir la
 * console ; la base tient en plus un plafond pour tout le service (`jadwal.request_access`).
 */
export const ACCESS_REQUEST_BUDGET: Budget = { windowSeconds: 3600, max: 3 };

/** Ce qu'un seau répond : accordé ou non, et dans combien de secondes il se rouvre. */
export interface Verdict {
	allowed: boolean;
	/** Secondes avant la fin de la fenêtre, ou `null` quand la demande est accordée. */
	retryAfter: number | null;
}

/**
 * Consomme un jeton pour cette clé et dit si l'on est dans les clous. Tout tient en une seule
 * instruction : deux instances qui demandent en même temps ne peuvent pas dépasser la limite,
 * puisqu'il n'y a ni lecture ni écriture séparées.
 *
 * La fenêtre est **fixe** et commence à la première demande : `last_request` ne bouge qu'à la
 * remise à zéro. Une rafale n'allonge donc pas sa propre punition, et « trois liens par heure »
 * veut dire ce qu'il dit.
 */
export async function consumeDetailed(db: Database, key: string, budget: Budget): Promise<Verdict> {
	const now = Date.now();
	const windowStart = now - budget.windowSeconds * 1000;
	// La clé n'entre jamais telle quelle : ce qui est rangé est son condensat (voir `cle`).
	const rangee = cle(key);
	const rows = await db.execute<{ count: number; last_request: string }>(sql`
		insert into "rate_limit" ("id", "key", "count", "last_request")
		values (${newId()}, ${rangee}, 1, ${now})
		on conflict ("key") do update set
			"count" = case when "rate_limit"."last_request" < ${windowStart} then 1
				else "rate_limit"."count" + 1 end,
			"last_request" = case when "rate_limit"."last_request" < ${windowStart} then ${now}
				else "rate_limit"."last_request" end
		returning "count", "last_request"
	`);
	const row = Array.isArray(rows)
		? (rows[0] as { count: number; last_request: string } | undefined)
		: undefined;
	const compte = Number(row?.count ?? Number.MAX_SAFE_INTEGER);
	if (compte <= budget.max) return { allowed: true, retryAfter: null };
	const debut = Number(row?.last_request ?? now);
	return {
		allowed: false,
		retryAfter: Math.max(1, Math.ceil((debut + budget.windowSeconds * 1000 - now) / 1000))
	};
}

/** La même chose, réduite à « oui ou non » : ce dont le volet par adresse a besoin. */
export async function consume(db: Database, key: string, budget: Budget): Promise<boolean> {
	return (await consumeDetailed(db, key, budget)).allowed;
}

/**
 * La clé d'une adresse électronique, normalisée : sinon `Alice@` et `alice@` seraient deux seaux.
 * La valeur rendue ici n'est pas ce qui est écrit — `consume` la hache avant de la ranger.
 */
export function emailKey(email: string, path: string): string {
	return `email:${email.trim().toLowerCase()}|${path}`;
}

/** Le condensat d'une clé, pour les tests qui ont besoin de retrouver une ligne sans la deviner. */
export function storedKey(key: string): string {
	return cle(key);
}

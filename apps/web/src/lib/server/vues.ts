// Le compteur de vues (ADR 0032).
//
// Ce qu'il écrit : une organisation, un jour, un type, un nombre. **Rien d'autre.** Ni adresse IP,
// ni cookie, ni `Referer`, ni identifiant de visiteur, ni horodatage — pas même un `created_at`,
// qui donnerait l'heure de la première vue du jour et, dans une petite organisation, l'heure exacte
// à laquelle une personne a lu la page.
//
// Ce qu'il lit et jette : l'agent utilisateur, pour écarter les robots connus, et deux en-têtes de
// pré-chargement. Aucune de ces valeurs ne sort de la requête, et aucune n'en dérive quoi que ce
// soit de persistant.
//
// Ce qu'il ne mesure pas : les visiteurs servis par un cache. Les pages publiques portent
// `max-age=120` et une journée de `stale-while-revalidate` ; un cache partagé peut donc servir la
// même réponse à un nombre illimité de personnes sans que le serveur l'apprenne. Le compteur est un
// **minorant**, et les écrans le disent.

import { sql } from '@jadwal/db';
import { todayInZone } from '@jadwal/core';
import { publicDatabase } from './public.js';

/** Les trois choses que le compteur distingue, et les seules. */
export type TypeDeVue = 'page' | 'embed' | 'feed';

/**
 * Les fragments d'agent utilisateur qui désignent un robot. Liste courte, tenue à la main, en
 * minuscules, comparée par `includes`.
 *
 * Mesuré contre le jeu `crawler-user-agents` : elle reconnaît 73,6 % de ses instances et 0 % des
 * seize chaînes de vrais navigateurs qui ont servi de contrôle. Les 26 % manqués sont la queue du
 * catalogue — des robots qui ne visitent pas la page d'une organisation de quartier. Une dépendance
 * de 1 500 expressions régulières coûterait plus cher qu'elle ne rapporterait, et il faudrait la
 * réévaluer chaque semaine.
 */
const ROBOTS = [
	'bot',
	'crawler',
	'spider',
	'slurp',
	'crawling',
	'facebookexternalhit',
	'ia_archiver',
	'feedfetcher',
	'mediapartners',
	'headlesschrome',
	'phantomjs',
	'curl/',
	'wget',
	'python-requests',
	'python-urllib',
	'go-http-client',
	'okhttp',
	'java/',
	'libwww-perl',
	'axios/',
	'node-fetch',
	'httpclient',
	'scrapy',
	'lighthouse',
	'chrome-lighthouse',
	'pingdom',
	'uptimerobot',
	'statuscake',
	'gptbot',
	'oai-searchbot',
	'chatgpt-user',
	'claudebot',
	'claude-web',
	'perplexitybot',
	'bytespider',
	'amazonbot',
	'meta-externalagent',
	'applebot',
	'petalbot',
	'dataforseo'
] as const;

/**
 * Les chaînes qui contiennent un fragment de robot sans en être un. `CUBOT` est une marque de
 * téléphones Android bon marché — exactement le public d'une organisation de quartier — et son
 * agent utilisateur contient « bot ». Sans cette liste, on effacerait ces visiteurs en silence.
 */
const FAUX_ROBOTS = ['cubot'] as const;

/** Les en-têtes qu'un navigateur pose quand il pré-charge une page que personne n'a encore ouverte. */
function estPrechargement(entetes: Headers): boolean {
	const but = entetes.get('sec-purpose') ?? entetes.get('purpose') ?? entetes.get('x-purpose');
	if (but && /prefetch|prerender|preview/i.test(but)) return true;
	return (entetes.get('x-moz') ?? '').toLowerCase() === 'prefetch';
}

/** Vrai pour un robot connu. La chaîne est lue, jugée, et jetée : rien n'en est écrit. */
export function estUnRobot(agent: string | null): boolean {
	if (!agent) return true; // Un agent vide n'est jamais un navigateur.
	const minuscule = agent.toLowerCase();
	if (FAUX_ROBOTS.some((faux) => minuscule.includes(faux))) return false;
	return ROBOTS.some((fragment) => minuscule.includes(fragment));
}

/**
 * Le type d'une vue de page. `Sec-Fetch-Dest` est posé par le navigateur et interdit à JavaScript :
 * c'est un meilleur juge que le paramètre `embed=1`, que n'importe qui peut écrire. Le paramètre
 * reste le repli, pour le cadre posé à la main et les navigateurs anciens.
 */
export function typeDeVue(entetes: Headers, url: URL): TypeDeVue {
	const destination = entetes.get('sec-fetch-dest');
	if (destination === 'iframe' || destination === 'frame') return 'embed';
	return url.searchParams.get('embed') === '1' ? 'embed' : 'page';
}

/** Ce qu'une requête laissera au compteur, ou rien du tout. */
export interface VueAcompter {
	organizationId: string;
	timeZone: string;
	kind: TypeDeVue;
}

/**
 * Décide si cette requête compte, et pour quel type. Rend `undefined` quand elle ne compte pas —
 * robot connu, pré-chargement, ou requête de données d'une navigation interne.
 */
export function vueDe(
	event: { request: Request; url: URL; isDataRequest: boolean },
	organisation: { id: string; time_zone: string },
	kind?: TypeDeVue
): VueAcompter | undefined {
	if (event.request.method !== 'GET' && event.request.method !== 'HEAD') return undefined;
	// Une requête de données n'est pas une visite : c'est le routeur de SvelteKit qui la déclenche,
	// parfois au simple survol d'un lien.
	if (event.isDataRequest) return undefined;
	if (estPrechargement(event.request.headers)) return undefined;
	if (estUnRobot(event.request.headers.get('user-agent'))) return undefined;
	return {
		organizationId: organisation.id,
		timeZone: organisation.time_zone,
		kind: kind ?? typeDeVue(event.request.headers, event.url)
	};
}

/**
 * Ajoute une vue. Une seule instruction, sans lecture séparée : deux instances qui comptent en même
 * temps ne peuvent pas se perdre l'une l'autre.
 *
 * Le jour est la date **locale de l'organisation**. Avec la date UTC, la soirée du vendredi d'une
 * association de Bienne tomberait au samedi une partie de l'année.
 *
 * Depuis l'étape 8, l'écriture passe par une fonction du propriétaire : le rôle public n'a plus
 * aucun droit sur la table, pas même la lecture qu'un `count + 1` exigeait. Il ne peut donc plus
 * lire les chiffres d'une autre organisation, ce qui était la dernière question ouverte de
 * l'ADR 0032.
 */
export async function compter(vue: VueAcompter, now: Date): Promise<void> {
	const jour = todayInZone(vue.timeZone, now);
	await publicDatabase().execute(
		sql`select jadwal.count_view(${vue.organizationId}::uuid, ${jour}::date, ${vue.kind})`
	);
}

export interface CompteDesVues {
	page: number;
	embed: number;
	feed: number;
}

export interface Audience {
	sept: CompteDesVues;
	trente: CompteDesVues;
	/**
	 * Vrai quand le mode intégré **avait** des vues et n'en a plus depuis sept jours.
	 *
	 * La condition « avait des vues » n'est pas un détail : sans elle, l'alerte s'afficherait chez
	 * toutes les organisations qui n'ont jamais collé le widget. Et même ainsi, elle ne peut pas
	 * distinguer un widget retiré volontairement d'un widget cassé — le service n'a aucun signal
	 * pour cela, puisqu'il ne lit ni `Referer` ni domaine déclaré. L'écran dit donc les deux
	 * possibilités plutôt que d'affirmer la mauvaise.
	 */
	widgetMuet: boolean;
}

function vide(): CompteDesVues {
	return { page: 0, embed: 0, feed: 0 };
}

/**
 * Ce que les responsables voient. Une seule requête, et aucune donnée de visiteur : la table n'en
 * contient pas.
 */
export async function lireAudience(
	tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> },
	today: string
): Promise<Audience> {
	const result = await tx.execute(sql`
		select "kind",
			sum("count") filter (where "day" > ${today}::date - 7) as sept,
			sum("count") filter (where "day" > ${today}::date - 30) as trente,
			sum("count") filter (where "day" > ${today}::date - 35 and "day" <= ${today}::date - 7)
				as avant
		from "page_view"
		where "day" > ${today}::date - 35 and "day" <= ${today}::date
		group by "kind"
	`);
	const rows = (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as {
		kind: string;
		sept: string | null;
		trente: string | null;
		avant: string | null;
	}[];

	const sept = vide();
	const trente = vide();
	let embedAvant = 0;
	for (const ligne of rows) {
		const type = ligne.kind as keyof CompteDesVues;
		if (!(type in sept)) continue;
		sept[type] = Number(ligne.sept ?? 0);
		trente[type] = Number(ligne.trente ?? 0);
		if (type === 'embed') embedAvant = Number(ligne.avant ?? 0);
	}
	return { sept, trente, widgetMuet: embedAvant > 0 && sept.embed === 0 };
}

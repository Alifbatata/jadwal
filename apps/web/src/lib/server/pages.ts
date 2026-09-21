// Ce que toute page publique a besoin de savoir, et les liens qu'elle sait construire.
//
// Un seul endroit décide de la forme des adresses publiques : `/m/<identifiant>` dans la langue par
// défaut de l'organisation, `/m/<identifiant>/<langue>` dans les autres. Une langue par lien,
// partageable telle quelle — jamais un cookie, jamais une détection silencieuse (ADR 0027).

import { error, type RequestEvent } from '@sveltejs/kit';
import { findOrganisation, isLangue, type Langue, type OrganisationPublique } from './public.js';
import { vueDe } from './vues.js';
import { LANGUES } from '$lib/i18n.js';

export interface PublicContext {
	organisation: OrganisationPublique;
	langue: Langue;
	/** La langue est-elle dans le chemin ? Elle ne l'est pas pour la langue par défaut. */
	explicite: boolean;
}

/**
 * L'organisation et la langue d'une page publique. Un identifiant inconnu et une organisation
 * suspendue rendent le même 404 : le code de réponse ne dit pas qu'une organisation a existé.
 */
export async function publicContext(event: RequestEvent): Promise<PublicContext> {
	const slug = event.params['slug'] ?? '';
	const organisation = await findOrganisation(slug);
	if (!organisation) error(404, 'Page introuvable.');
	// Une vue de page, à compter après la réponse. C'est le seul endroit qui la pose pour les trois
	// écrans publics : une page nouvelle est comptée sans qu'on y pense (ADR 0032).
	event.locals.vue = vueDe(event, organisation);
	const segment = event.params['langue'];
	const langue = segment && isLangue(segment) ? segment : langueParDefaut(organisation);
	return { organisation, langue, explicite: Boolean(segment) };
}

/** La langue par défaut d'une organisation, ramenée à une des quatre que l'interface parle. */
export function langueParDefaut(organisation: OrganisationPublique): Langue {
	return isLangue(organisation.default_language) ? organisation.default_language : 'fr';
}

/** Les langues proposées : celles que l'organisation a activées, dans l'ordre de l'interface. */
export function languesProposees(organisation: OrganisationPublique): Langue[] {
	const activees = organisation.enabled_language.filter(isLangue);
	const proposees = LANGUES.filter((langue) => activees.includes(langue));
	return proposees.length > 0 ? [...proposees] : [langueParDefaut(organisation)];
}

/** Le préfixe d'une adresse publique dans cette langue. */
export function base(organisation: OrganisationPublique, langue: Langue): string {
	return langue === langueParDefaut(organisation)
		? `/m/${organisation.slug}`
		: `/m/${organisation.slug}/${langue}`;
}

export interface LienOptions {
	vue?: 'semaine' | 'cours' | 'mois';
	public?: string | null;
	mois?: string | null;
	jour?: string | null;
}

/** Une adresse de vue, avec ce qu'il faut garder : la vue, le filtre, le mois, le jour. */
export function lien(
	organisation: OrganisationPublique,
	langue: Langue,
	options: LienOptions = {}
): string {
	const parametres = new URLSearchParams();
	if (options.vue && options.vue !== 'semaine') parametres.set('vue', options.vue);
	if (options.public) parametres.set('public', options.public);
	if (options.mois) parametres.set('mois', options.mois);
	if (options.jour) parametres.set('jour', options.jour);
	const requete = parametres.toString();
	return requete ? `${base(organisation, langue)}?${requete}` : base(organisation, langue);
}

/** L'adresse absolue d'une page, pour les métadonnées de partage et les liens croisés. */
export function absolu(event: RequestEvent, chemin: string): string {
	return new URL(chemin, event.url.origin).toString();
}

/** Les liens croisés entre versions linguistiques, pour les moteurs de recherche (ADR 0027). */
export function liensAlternatifs(
	event: RequestEvent,
	organisation: OrganisationPublique,
	suffixe: string,
	options: LienOptions = {}
): { langue: Langue; href: string }[] {
	return languesProposees(organisation).map((langue) => ({
		langue,
		href: absolu(event, `${lienAvecSuffixe(organisation, langue, suffixe, options)}`)
	}));
}

function lienAvecSuffixe(
	organisation: OrganisationPublique,
	langue: Langue,
	suffixe: string,
	options: LienOptions
): string {
	if (suffixe === '') return lien(organisation, langue, options);
	return `${base(organisation, langue)}${suffixe}`;
}

/**
 * Ce qu'une page publique dit aux moteurs de recherche : son adresse canonique, et les adresses de
 * ses versions linguistiques (ADR 0029).
 *
 * Une seule fonction produit les deux, et c'est ce qui garantit la réciprocité : chaque version
 * liste toutes les autres **et elle-même**, faute de quoi le groupe entier est ignoré. Les adresses
 * sont absolues, comme les moteurs l'exigent.
 *
 * `x-default` désigne la langue par défaut de l'organisation — c'est-à-dire, pour elle, l'adresse
 * courte `/m/<identifiant>`. C'est un choix : la recommandation habituelle est de canonicaliser
 * vers l'adresse explicite `/m/<identifiant>/<langue>`, mais l'adresse courte est celle que la
 * mosquée met dans sa bio et sur son affiche. C'est donc elle qui doit porter le référencement.
 */
export interface Alternatif {
	hreflang: string;
	href: string;
}

export function referencement(
	event: RequestEvent,
	organisation: OrganisationPublique,
	langue: Langue,
	chemin: (langue: Langue) => string
): { canonical: string; alternates: Alternatif[] } {
	const proposees = languesProposees(organisation);
	const alternates: Alternatif[] = proposees.map((autre) => ({
		hreflang: autre,
		href: absolu(event, chemin(autre))
	}));
	const defaut = langueParDefaut(organisation);
	if (proposees.includes(defaut)) {
		alternates.push({ hreflang: 'x-default', href: absolu(event, chemin(defaut)) });
	}
	return { canonical: absolu(event, chemin(langue)), alternates };
}

/** Les publics, dans l'ordre de la maquette. `null` = tous. */
export const PUBLICS = ['kids', 'youth', 'women', 'adults', 'open'] as const;

export function publicDemande(event: RequestEvent): string | null {
	const value = event.url.searchParams.get('public');
	return value && (PUBLICS as readonly string[]).includes(value) ? value : null;
}

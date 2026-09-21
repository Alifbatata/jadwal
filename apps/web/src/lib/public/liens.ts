// Les adresses publiques, construites en un seul endroit.
//
// Elles passent par `resolve` de SvelteKit plutôt que par une concaténation : c'est lui qui connaît
// les routes et qui préfixerait un éventuel chemin de base. La chaîne de requête est ajoutée après,
// parce que `resolve` ne s'occupe que du chemin.

import { resolve } from '$app/paths';
import type { Langue } from '$lib/i18n.js';

export interface Adresse {
	slug: string;
	langue: Langue;
	/** La langue par défaut de l'organisation n'apparaît pas dans le chemin. */
	langueParDefaut: string;
}

/** `/m/<identifiant>` ou `/m/<identifiant>/<langue>`. */
export function lienVue(adresse: Adresse, requete: Record<string, string | null> = {}): string {
	const chemin = resolve('/m/[slug]/[[langue=langue]]', {
		slug: adresse.slug,
		...(adresse.langue === adresse.langueParDefaut ? {} : { langue: adresse.langue })
	});
	const parametres = new URLSearchParams();
	for (const [cle, valeur] of Object.entries(requete)) {
		if (valeur) parametres.set(cle, valeur);
	}
	const suffixe = parametres.toString();
	return suffixe ? `${chemin}?${suffixe}` : chemin;
}

/** La page d'un cours, à son propre lien. */
export function lienCours(adresse: Adresse, courseId: string): string {
	return resolve('/m/[slug]/[[langue=langue]]/cours/[courseId]', {
		slug: adresse.slug,
		courseId,
		...(adresse.langue === adresse.langueParDefaut ? {} : { langue: adresse.langue })
	});
}

/** La page d'abonnement au calendrier. */
export function lienAgenda(adresse: Adresse): string {
	return resolve('/m/[slug]/[[langue=langue]]/agenda', {
		slug: adresse.slug,
		...(adresse.langue === adresse.langueParDefaut ? {} : { langue: adresse.langue })
	});
}

/**
 * Le flux agenda lui-même, en dehors du chemin de langue : ce n'est pas une page, c'est un fichier
 * qu'une application de calendrier relit toute seule. La langue des titres passe par `?lang=`.
 */
export function lienFlux(slug: string, langue?: Langue): string {
	const chemin = resolve('/m/[slug]/agenda.ics', { slug });
	return langue ? `${chemin}?lang=${langue}` : chemin;
}

/** Le flux agenda d'un seul cours (ADR 0028). */
export function lienFluxCours(slug: string, courseId: string, langue?: Langue): string {
	const chemin = resolve('/m/[slug]/agenda/[courseId].ics', { slug, courseId });
	return langue ? `${chemin}?lang=${langue}` : chemin;
}

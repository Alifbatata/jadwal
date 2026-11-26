// Ce qui fait de la page publique d'une organisation une application qu'on installe (étape 24,
// ADR 0053) : son manifeste, et les adresses de ses icônes.
//
// Rien de propre à une organisation n'est figé dans une construction : le nom et la couleur
// viennent de la base, et un changement de nom est une saisie, pas une nouvelle version.

import { accentValide } from '#lib/couleur.js';
import { direction, type Langue } from '#lib/i18n.js';
import type { TailleDIcone } from './icone.js';
import { base, langueParDefaut } from './pages.js';
import type { OrganisationPublique } from './public.js';

/** Les fichiers d'icône servis, et ce que chacun est. */
export const ICONES: Record<string, { taille: TailleDIcone; masque: boolean }> = {
	'180.png': { taille: 180, masque: false },
	'192.png': { taille: 192, masque: false },
	'512.png': { taille: 512, masque: false },
	'masque-512.png': { taille: 512, masque: true }
};

/** Un an, et jamais revalidée : l'adresse d'une icône porte sa couleur, donc elle ne change pas. */
export const CACHE_ICONE = 'public, max-age=31536000, immutable';

/**
 * Au-delà, un nom ne tient pas sous une icône : le manifeste ne lui invente pas de nom court, et le
 * système abrège lui-même le nom entier.
 */
const NOM_COURT_AU_PLUS = 24;

/**
 * L'adresse d'une icône. La couleur y est écrite, sans son croisillon : quand l'organisation change
 * de couleur, l'adresse change, et un cache peut garder l'ancienne pour toujours. Le serveur, lui,
 * peint avec la couleur de la base, quoi que dise l'adresse.
 */
export function adresseDIcone(organisation: OrganisationPublique, fichier: string): string {
	// Une adresse entière, depuis la racine : un manifeste se lit hors de toute page, et `resolve`
	// rendrait ici un chemin relatif à la requête en cours.
	const chemin = `${base(organisation, langueParDefaut(organisation))}/icone/${fichier}`;
	return `${chemin}?c=${accentValide(organisation.accent_color).slice(1)}`;
}

/**
 * Le manifeste de l'application, dans la langue de la page d'où on l'installe.
 *
 * `id` ne dépend pas de la langue : installée depuis la page arabe ou la page française, c'est la
 * même application. Elle s'ouvre sur la vue « Aujourd'hui », et sa portée est l'adresse de
 * l'organisation : un lien vers une autre organisation, ou vers l'espace des responsables, s'ouvre
 * dans le navigateur.
 */
export function manifesteDe(organisation: OrganisationPublique, langue: Langue) {
	const accent = accentValide(organisation.accent_color);
	// L'adresse courte de l'organisation, celle de sa langue par défaut.
	const adresse = base(organisation, langueParDefaut(organisation));
	return {
		id: adresse,
		name: organisation.name,
		...([...organisation.name].length <= NOM_COURT_AU_PLUS
			? { short_name: organisation.name }
			: {}),
		lang: langue,
		dir: direction(langue),
		start_url: `${base(organisation, langue)}?vue=aujourdhui`,
		scope: adresse,
		display: 'standalone',
		// Le fond des pages publiques, et la couleur de la barre du système.
		background_color: '#ffffff',
		theme_color: accent,
		icons: [
			{ fichier: '192.png', purpose: 'any' },
			{ fichier: '512.png', purpose: 'any' },
			{ fichier: 'masque-512.png', purpose: 'maskable' }
		].map(({ fichier, purpose }) => {
			const taille = ICONES[fichier]?.taille ?? 512;
			return {
				src: adresseDIcone(organisation, fichier),
				sizes: `${taille}x${taille}`,
				type: 'image/png',
				purpose
			};
		})
	};
}

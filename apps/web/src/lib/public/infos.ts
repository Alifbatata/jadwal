// Ce que l'onglet Infos décide sans rien afficher (étape 24, ADR 0052,
// docs/maquettes/public-infos.md). Des fonctions pures, lues par la page et par ses tests.

import type { Appareil } from './abonnement.js';

/** Ce qu'une organisation dit d'elle : six textes bruts, chacun présent ou absent. */
export interface InfosPubliques {
	address: string | null;
	contactPhone: string | null;
	contactEmail: string | null;
	website: string | null;
	accessNote: string | null;
	announcement: string | null;
}

/** L'onglet Infos n'existe que si l'organisation a saisi au moins une information. */
export function aDesInfos(infos: InfosPubliques): boolean {
	return Object.values(infos).some((valeur) => valeur !== null);
}

/**
 * Où mène « Ouvrir dans une carte », selon l'appareil du visiteur (lu comme pour l'agenda,
 * ADR 0048) : l'application de cartes d'un téléphone Android, Plans sur un iPhone, un iPad ou un
 * Mac, OpenStreetMap ailleurs. `ailleurs` dit si le lien quitte la page pour un autre site, et
 * s'ouvre donc dans un nouvel onglet.
 *
 * C'est un lien que le visiteur choisit de suivre : la page ne charge aucune carte, et rien ne part
 * tant qu'il ne l'a pas touché. L'adresse ne voyage que dans la requête du lien, encodée.
 */
export function lienCarte(
	appareil: Appareil,
	adresse: string
): { href: string; ailleurs: boolean } {
	const surUneLigne = adresse
		.split('\n')
		.map((ligne) => ligne.trim())
		.filter((ligne) => ligne.length > 0)
		.join(', ');
	const requete = encodeURIComponent(surUneLigne);
	if (appareil === 'android') return { href: `geo:0,0?q=${requete}`, ailleurs: false };
	if (appareil === 'apple') return { href: `https://maps.apple.com/?q=${requete}`, ailleurs: true };
	return { href: `https://www.openstreetmap.org/search?query=${requete}`, ailleurs: true };
}

/**
 * L'adresse du site, si elle peut devenir un lien : elle commence par `http://` ou `https://`, sans
 * blanc. La base le garantit (migration 0082) ; la page ne s'en remet pas à elle seule pour écrire
 * un `href`.
 */
export function lienSite(site: string): string | null {
	return /^https?:\/\/\S+$/.test(site) ? site : null;
}

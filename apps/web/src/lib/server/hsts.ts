// L'en-tête de transport strict de l'application, et la seule règle qui décide de son envoi.
//
// Sorti du hook pour être éprouvé sans serveur : les serveurs de test écoutent en clair, et
// l'en-tête n'y part jamais. La valeur est celle du bloc de site de Caddy, au caractère près ; un
// test compare les deux. En production, c'est le serveur web frontal qui a le dernier mot, mais une
// instance servie autrement ne doit pas promettre moins que lui : jusqu'à l'étape 17, l'application
// disait un an, et le bloc deux.

/**
 * Deux ans, sous-domaines compris, comme le bloc de site. `preload` n'y est pas : il engagerait le
 * domaine parent entier auprès des navigateurs, et ce n'est pas à jadwal d'en décider.
 */
export const STRICT_TRANSPORT_SECURITY = 'max-age=63072000; includeSubDomains';

/**
 * La valeur à poser sur une réponse, ou `undefined` en clair. Derrière un mandataire, l'adresse
 * vient d'`ORIGIN` : sans `ORIGIN` en https, l'en-tête ne partirait jamais.
 */
export function strictTransportSecurity(url: URL): string | undefined {
	return url.protocol === 'https:' ? STRICT_TRANSPORT_SECURITY : undefined;
}

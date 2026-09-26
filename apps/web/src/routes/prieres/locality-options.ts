// La liste où l'on choisit sa localité, sur l'écran des heures de prière (étape 18, retour C2).
//
// Un module à part, sans Svelte ni navigateur, pour que ce que la liste montre s'éprouve seul : la
// page l'appelle à chaque recherche.

/** Ce que le formulaire envoie d'une localité choisie : le serveur y relit la position. */
export function localityKey(locality: { postcode: string; name: string }): string {
	return `${locality.postcode}|${locality.name}`;
}

/**
 * Les cases de la liste : les localités trouvées, et la localité déjà choisie en tête quand la
 * recherche ne la rend plus ; sans recherche, celle qui a été choisie seule.
 *
 * Une localité choisie reste donc cochée, et le formulaire l'envoie, jusqu'à ce qu'on en coche une
 * autre ou qu'on tape une position « Hors de Suisse ». Sans cela, une nouvelle recherche la retirait
 * de la liste : l'écran disait encore « Localité choisie », mais plus rien ne l'envoyait.
 */
export function localityOptions<T extends { postcode: string; name: string }>(
	found: readonly T[] | null,
	chosen: T | null
): T[] {
	if (found === null) return chosen ? [chosen] : [];
	if (chosen === null) return [...found];
	const key = localityKey(chosen);
	return found.some((locality) => localityKey(locality) === key) ? [...found] : [chosen, ...found];
}

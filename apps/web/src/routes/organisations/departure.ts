// Le départ d'une organisation, et ce que « Vos organisations » en dit à l'arrivée (étape 19).
//
// Une personne quitte une organisation depuis « Vos organisations », ou une responsable se retire
// elle-même depuis l'écran Membres. Dans les deux cas, l'organisation ne lui est plus ouverte : elle
// arrive sur « Vos organisations », avec ce paramètre, et la page affiche l'encadré qui le dit, sur
// l'écran même où elle arrive. Le même mécanisme que pour la responsable devenue éditrice
// (`membres/self-editor.ts`) : un paramètre d'adresse plutôt qu'un cookie, rien à retenir, rien de
// personnel.
//
// L'adresse nomme l'organisation quittée par son identifiant, et la page ne montre l'encadré qu'à
// une personne qui n'en est pas membre : une adresse copiée, ouverte par une personne qui en est
// membre, ne lui fait rien dire de faux. Le nom de l'organisation n'y est pas : la base ne le montre
// plus à qui l'a quittée, et une adresse ne doit pas pouvoir faire écrire un nom à l'écran.

/** Le paramètre d'adresse des encadrés d'arrivée, le même que celui de la responsable devenue éditrice. */
export const DEPARTURE_PARAM = 'avis';
export const DEPARTURE_VALUE = 'depart';
/** Le paramètre qui nomme l'organisation quittée, par son identifiant. */
export const DEPARTED_PARAM = 'organisation';

/** Un identifiant d'organisation ; autre chose ne nomme aucune organisation. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** L'écran où arrive une personne qui vient de quitter cette organisation. */
export function departureArrival(organizationId: string): string {
	const query = new URLSearchParams({
		[DEPARTURE_PARAM]: DEPARTURE_VALUE,
		[DEPARTED_PARAM]: organizationId
	});
	return `/organisations?${query}`;
}

/** L'organisation que l'adresse dit quittée, ou `null` si elle n'en dit rien de lisible. */
export function departedFrom(url: URL): string | null {
	if (url.searchParams.get(DEPARTURE_PARAM) !== DEPARTURE_VALUE) return null;
	const organizationId = url.searchParams.get(DEPARTED_PARAM) ?? '';
	return UUID.test(organizationId) ? organizationId : null;
}

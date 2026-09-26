// Ce que montre l'écran de la passkey selon la session : ses boutons, et le message qui suit
// l'enregistrement d'une passkey (étape 18, reprise de la relecture du lot 3).
//
// Pur, sans navigateur : la page et ses tests lisent les mêmes fonctions. Le message et les boutons
// ne peuvent donc pas se contredire, ce qu'ils faisaient quand une passkey de plus renvoyait à un
// bouton de connexion que l'écran n'affichait pas.

export interface PasskeySession {
	/** Session ouverte par une passkey : les pouvoirs de super-admin sont actifs. */
	readonly hasSuperAdminPowers: boolean;
	/** Aucune passkey n'existe encore : la fenêtre d'amorçage. */
	readonly amorcage: boolean;
}

/**
 * Les boutons de l'écran. Enregistrer : à l'amorçage, ou pouvoirs actifs, les deux seuls cas où le
 * serveur l'accepte. Se connecter : une passkey existe et la session n'a pas encore les pouvoirs.
 */
export function passkeyButtons(session: PasskeySession): { register: boolean; signIn: boolean } {
	return {
		register: session.amorcage || session.hasSuperAdminPowers,
		signIn: !session.hasSuperAdminPowers && !session.amorcage
	};
}

/**
 * Le message après l'enregistrement, selon la session qui l'a fait. Sans pouvoirs, c'était la
 * première passkey : le bouton « Se connecter avec une passkey » apparaît juste dessous, et le
 * message y renvoie. Pouvoirs actifs, c'est une passkey de plus : la session garde ses pouvoirs,
 * aucun bouton de connexion n'apparaît, et la passkey servira à la prochaine connexion.
 */
export function afterRegistration(before: PasskeySession): 'registered' | 'registeredAnother' {
	return before.hasSuperAdminPowers ? 'registeredAnother' : 'registered';
}

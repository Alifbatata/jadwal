// L'agenda selon l'appareil (étape 18, retours E1 et E2).
//
// La page publique ne charge aucun script (ADR 0027) : c'est le serveur qui lit l'appareil, dans
// les en-têtes de la requête, et la page qui propose le bon lien d'abord. iPhone, iPad et Mac : le
// lien `webcal:`, que l'application Calendrier ouvre elle-même. Android : Google Agenda, avec la
// demande d'abonnement prête. Ailleurs : le choix entre Google Agenda, Outlook, une autre
// application, et l'adresse à copier.
//
// Une détection se trompe parfois, et quand elle se trompe elle cache la bonne réponse : la page
// garde donc toujours un lien vers le choix complet (`?appareil=tous`), et les étapes à suivre à la
// main.
//
// Pur, sans accès au serveur : les mêmes fonctions servent au rendu et aux tests.

/** Ce que la page propose d'abord : trois cas, et non un nom d'appareil de plus. */
export type Appareil = 'apple' | 'android' | 'autre';

/**
 * Les en-têtes que la détection lit, et que la réponse nomme donc dans `Vary` : un cache qui les
 * ignorerait servirait à un iPhone la page préparée pour un Android.
 */
export const ENTETES_DE_L_APPAREIL = ['Sec-CH-UA-Platform', 'User-Agent'] as const;

/** Le paramètre d'adresse qui demande le choix complet, quel que soit l'appareil. */
export const PARAMETRE_APPAREIL = 'appareil';
export const TOUS_LES_CHOIX = 'tous';

/**
 * L'appareil du visiteur. `Sec-CH-UA-Platform` d'abord : Chrome et Edge l'envoient sans qu'on le
 * demande, entre guillemets, et ils réduisent l'agent au point qu'un Android n'y dit plus son
 * modèle. Sinon `User-Agent`, que Safari et Firefox envoient seul.
 *
 * Android est cherché avant Apple : aucun agent Android ne dit « iPhone », mais tous disent « Linux ».
 * Safari sur iPadOS se dit Macintosh et ne se distingue pas d'un Mac ; les deux ouvrent `webcal:`
 * de la même façon, et c'est pourquoi le Mac est rangé avec l'iPhone et l'iPad.
 */
export function appareilDe(entetes: { get(nom: string): string | null }): Appareil {
	const plateforme = (entetes.get('sec-ch-ua-platform') ?? '')
		.trim()
		.replace(/^"(.*)"$/, '$1')
		.toLowerCase();
	if (plateforme !== '' && plateforme !== 'unknown') {
		if (plateforme === 'android') return 'android';
		if (plateforme === 'ios' || plateforme === 'macos') return 'apple';
		return 'autre';
	}
	const agent = entetes.get('user-agent') ?? '';
	if (/android/i.test(agent)) return 'android';
	if (/iphone|ipad|ipod|macintosh/i.test(agent)) return 'apple';
	return 'autre';
}

/**
 * Google Agenda, ouvert sur la demande d'abonnement au flux : `render?cid=` suivi de l'adresse
 * `webcal:` du flux, encodée. Google ne documente pas ce lien ; c'est l'usage établi, et Google y
 * refuse une adresse `https:`, qu'il prend pour un identifiant d'agenda (vérifié le 26.09.2026, voir
 * le rapport de l'étape 18).
 */
export function lienGoogleAgenda(webcal: string): string {
	return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
}

/**
 * Outlook sur le web, ouvert sur « S'abonner à partir du web » avec l'adresse et le nom déjà remplis.
 * `outlook.live.com` est l'Outlook des comptes personnels, celui d'une communauté ; un compte de
 * travail ou d'école copie l'adresse, et la page le dit. Chaque valeur est encodée à part : un « + »
 * n'est une espace que dans un formulaire.
 */
export function lienOutlook(webcal: string, nom: string): string {
	return `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(webcal)}&name=${encodeURIComponent(nom)}`;
}

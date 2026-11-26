// Les informations qu'une organisation donne d'elle, lues du formulaire de l'écran Réglages
// (étape 24, ADR 0052, docs/maquettes/public-infos.md).
//
// Six textes bruts, tous facultatifs. Un champ vide est une information absente, `null`, jamais une
// chaîne vide : c'est ce que la base exige (migration 0082). Elle refuse de son côté tout ce que
// cette lecture refuse ; ici, l'écran le dit d'abord, avec des mots.

export interface Infos {
	address: string | null;
	contactPhone: string | null;
	contactEmail: string | null;
	website: string | null;
	accessNote: string | null;
	announcement: string | null;
}

/** La longueur de chaque champ, en caractères : celle des contraintes de la base. */
export const LIMITES_DES_INFOS: Record<keyof Infos, number> = {
	address: 300,
	contactPhone: 40,
	contactEmail: 254,
	website: 300,
	accessNote: 1000,
	announcement: 500
};

export type ErreurDInfos = 'infoTooLong' | 'infoEmail' | 'infoWebsite';

/** Une arobase, rien de blanc : la forme que la base exige, et ce qui peut devenir un `mailto:`. */
const ADRESSE = /^[^@\s]+@[^@\s]+$/;
/** `http://` ou `https://`, puis au moins un caractère, sans blanc : rien d'autre ne devient un lien. */
const SITE = /^https?:\/\/\S+$/i;
/** Les caractères de commande, retours à la ligne compris. */
const COMMANDES = /\p{Cc}+/gu;

/** Un champ sur plusieurs lignes : fins de ligne ramenées à `\n`, blancs retirés aux deux bouts. */
function texte(valeur: FormDataEntryValue | null): string | null {
	const lu = String(valeur ?? '')
		.replace(/\r\n?/g, '\n')
		.trim();
	return lu.length > 0 ? lu : null;
}

/** Un champ d'une seule ligne : tout caractère de commande devient une espace. */
function ligne(valeur: FormDataEntryValue | null): string | null {
	const lu = String(valeur ?? '')
		.replace(COMMANDES, ' ')
		.trim();
	return lu.length > 0 ? lu : null;
}

/**
 * Les six informations d'un formulaire, et la première raison de les refuser. Ce qui a été tapé est
 * rendu même en cas de refus : le formulaire le remontre sous le message.
 */
export function lireInfos(formulaire: FormData): { infos: Infos; error: ErreurDInfos | null } {
	const infos: Infos = {
		address: texte(formulaire.get('address')),
		contactPhone: ligne(formulaire.get('contactPhone')),
		contactEmail: ligne(formulaire.get('contactEmail')),
		website: ligne(formulaire.get('website')),
		accessNote: texte(formulaire.get('accessNote')),
		announcement: texte(formulaire.get('announcement'))
	};
	for (const [champ, limite] of Object.entries(LIMITES_DES_INFOS) as [keyof Infos, number][]) {
		// En caractères, comme `char_length` : un émoji compte pour un, pas pour ses deux moitiés.
		if ([...(infos[champ] ?? '')].length > limite) return { infos, error: 'infoTooLong' };
	}
	if (infos.contactEmail !== null && !ADRESSE.test(infos.contactEmail)) {
		return { infos, error: 'infoEmail' };
	}
	if (infos.website !== null && !SITE.test(infos.website)) {
		return { infos, error: 'infoWebsite' };
	}
	// Le protocole en minuscules : la base ne connaît que `http://` et `https://` écrits ainsi.
	if (infos.website !== null) {
		infos.website = infos.website.replace(/^https?:/i, (protocole) => protocole.toLowerCase());
	}
	return { infos, error: null };
}

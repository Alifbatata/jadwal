// L'adresse de la page publique d'une organisation : la fin de `/m/<adresse>` (étape 18, retour B2).
//
// Un seul module pour le navigateur et le serveur. L'écran propose l'adresse pendant que le nom
// s'écrit ; le serveur la propose de la même façon quand le champ arrive vide, sans JavaScript, et la
// montre avant de créer quoi que ce soit (étape 19, D6). Les deux appliquent la règle de la base,
// plus une : une adresse porte au moins une lettre.

/**
 * La règle de la base, mot pour mot : la contrainte `organization_slug_ck` (migration 0003). Des
 * lettres minuscules sans accent et des chiffres, en mots séparés par un seul trait d'union.
 */
export const PUBLIC_ADDRESS = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Au moins une lettre. La base prend `2026` ou `12-34` ; l'écran les refuse, parce que `/m/2` ne
 * dit rien de l'organisation qu'elle ouvre (étape 19, D6). Cette règle n'est que celle de l'écran :
 * la base garde la sienne, celle de la migration 0003.
 */
const UNE_LETTRE = /[a-z]/;

/**
 * Les deux règles, sans ancres, pour l'attribut `pattern` d'un champ, qui ancre de lui-même. Le
 * navigateur lit ce motif avec le drapeau `v` : une anticipation y est permise.
 */
export const PUBLIC_ADDRESS_PATTERN = `(?=.*${UNE_LETTRE.source})${PUBLIC_ADDRESS.source.slice(1, -1)}`;

/** Une adresse proposée ne dépasse pas cette longueur : elle s'écrit sur une affiche. */
const LONGUEUR_PROPOSEE = 60;

/**
 * Les lettres latines qu'aucune décomposition Unicode ne ramène à une lettre sans accent. Les autres
 * (é, ü, ç, ñ…) perdent leur accent par la décomposition elle-même.
 */
const LETTRES: Readonly<Record<string, string>> = {
	ß: 'ss',
	æ: 'ae',
	œ: 'oe',
	ø: 'o',
	ł: 'l',
	đ: 'd',
	ð: 'd',
	þ: 'th',
	ı: 'i'
};

/** Vrai quand la base prendrait cette adresse et qu'elle porte au moins une lettre. */
export function isPublicAddress(value: string): boolean {
	return PUBLIC_ADDRESS.test(value) && UNE_LETTRE.test(value);
}

/** Vrai quand l'adresse suit la règle de la base mais n'a aucune lettre : `2026`, `12-34`. */
export function hasNoLetter(value: string): boolean {
	return PUBLIC_ADDRESS.test(value) && !UNE_LETTRE.test(value);
}

/**
 * L'adresse que l'on propose pour un nom : « Crèche Horizon » donne `creche-horizon`. Les accents
 * tombent, tout ce qui n'est ni lettre latine ni chiffre sépare deux mots, et une adresse trop longue
 * est coupée entre deux mots. La décomposition de compatibilité (NFKD) ramène aussi les ligatures
 * (« ﬁ ») et les lettres pleine chasse (« Ｃ ») à des lettres latines : la décomposition canonique
 * (NFD) les laissait telles quelles, et elles tombaient. Elle donne parfois une majuscule (« № »
 * donne « No ») : la mise en minuscules vient donc après elle. Un nom sans une seule lettre latine
 * ne donne rien, même s'il porte des chiffres (« جمعية الأفق 2 » donnait `2`) : c'est alors à la
 * personne d'écrire l'adresse.
 */
export function proposePublicAddress(name: string): string {
	const mots = name
		.normalize('NFKD')
		.toLowerCase()
		.replace(/\p{M}/gu, '')
		.replace(/[ßæœøłđðþı]/g, (lettre) => LETTRES[lettre] ?? '')
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
	let adresse = '';
	for (const mot of mots) {
		const suivante = adresse ? `${adresse}-${mot}` : mot;
		if (suivante.length > LONGUEUR_PROPOSEE) {
			// Un premier mot déjà trop long est coupé net ; sinon, on s'arrête avant le mot de trop.
			adresse ||= mot.slice(0, LONGUEUR_PROPOSEE);
			break;
		}
		adresse = suivante;
	}
	return UNE_LETTRE.test(adresse) ? adresse : '';
}

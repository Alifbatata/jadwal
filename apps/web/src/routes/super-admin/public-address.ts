// L'adresse de la page publique d'une organisation : la fin de `/m/<adresse>` (étape 18, retour B2).
//
// Un seul module pour le navigateur et le serveur. L'écran propose l'adresse pendant que le nom
// s'écrit ; le serveur la propose de la même façon quand le champ arrive vide, sans JavaScript. Les
// deux appliquent la règle de la base, et rien d'autre.

/**
 * La règle de la base, mot pour mot : la contrainte `organization_slug_ck` (migration 0003). Des
 * lettres minuscules sans accent et des chiffres, en mots séparés par un seul trait d'union.
 */
export const PUBLIC_ADDRESS = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** La même règle, sans ses ancres, pour l'attribut `pattern` d'un champ, qui ancre de lui-même. */
export const PUBLIC_ADDRESS_PATTERN = PUBLIC_ADDRESS.source.slice(1, -1);

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

export function isPublicAddress(value: string): boolean {
	return PUBLIC_ADDRESS.test(value);
}

/**
 * L'adresse que l'on propose pour un nom : « Mosquée Madretsch » donne `mosquee-madretsch`. Les accents
 * tombent, tout ce qui n'est ni lettre latine ni chiffre sépare deux mots, et une adresse trop longue
 * est coupée entre deux mots. Un nom sans une seule lettre latine ni un seul chiffre ne donne rien :
 * c'est alors à la personne d'écrire l'adresse.
 */
export function proposePublicAddress(name: string): string {
	const mots = name
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.replace(/[ßæœøłđðþı]/g, (lettre) => LETTRES[lettre] ?? '')
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
	let adresse = '';
	for (const mot of mots) {
		const suivante = adresse ? `${adresse}-${mot}` : mot;
		if (suivante.length > LONGUEUR_PROPOSEE) {
			// Un premier mot déjà trop long est coupé net ; sinon, on s'arrête avant le mot de trop.
			return adresse || mot.slice(0, LONGUEUR_PROPOSEE);
		}
		adresse = suivante;
	}
	return adresse;
}

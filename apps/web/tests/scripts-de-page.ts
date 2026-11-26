// Le seul script d'une page publique hors cadre (étape 24, ADR 0054) : le fichier qui demande au
// navigateur de garder la page pour la lire sans réseau. Les tests qui exigeaient « aucun script »
// exigent désormais « celui-là, et lui seul ».

import { expect } from 'vitest';

/** Les balises `<script>` d'un document, telles qu'elles sont écrites. */
export function scriptsDe(html: string): string[] {
	return [...html.matchAll(/<script\b[^>]*>/gi)].map((trouve) => trouve[0]);
}

/**
 * La page porte un seul script : un fichier de la même origine, `/m/hors-reseau.js`, chargé sans
 * bloquer la lecture. Jamais de code en ligne : la politique de sécurité du contenu le bloquerait,
 * et rien ne le dirait.
 *
 * @param page L'adresse de la page, complète ou depuis la racine : le chemin du script est relatif
 *   à elle.
 */
export function attendreLeSeulScriptHorsReseau(html: string, page: string): void {
	const adresse = new URL(page, 'http://page.test');
	const scripts = scriptsDe(html);
	expect(scripts, page).toHaveLength(1);
	const balise = scripts[0] ?? '';
	const source = balise.match(/\bsrc="([^"]+)"/)?.[1];
	expect(source, `${page} : ${balise}`).toBeDefined();
	const resolu = new URL(source ?? '', adresse);
	expect(resolu.origin, page).toBe(adresse.origin);
	expect(resolu.pathname, page).toBe('/m/hors-reseau.js');
	expect(balise, page).toMatch(/\sdefer\b/);
}

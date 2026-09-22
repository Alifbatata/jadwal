// Le texte des conditions d'utilisation, tel que le service le montre et le fait accepter (ADR 0044).
//
// Lu à la construction, depuis `docs/CONDITIONS.md` lui-même : Vite l'incorpore au serveur construit
// (`?raw`), il n'y a donc ni lecture de disque à l'exécution ni chemin à retrouver depuis `build/`.
// L'image de production n'a besoin du fichier que le temps de sa construction : `.dockerignore` le
// laisse passer, seul de `docs/`.
//
// La mise en mots est celle du PDF remis au juriste (`$lib/conditions/rendu.js`) : ce qu'il a lu est,
// au caractère près, ce que les organisations acceptent. Ce module ne passe à ce convertisseur que ce
// fichier-là, jamais un texte venu d'un visiteur : le convertisseur n'échappe pas tout, et son
// en-tête le dit.

import source from '../../../../../docs/CONDITIONS.md?raw';
import {
	dateDeLaVersion as dateLue,
	typographierHtml,
	versHtml,
	versionIso as versionLue
} from '$lib/conditions/rendu.js';

/**
 * La version en cours, en ISO (`2026-09-22`) : la date de « Dernière mise à jour » du texte. C'est
 * elle que l'acceptation enregistre, et elle change dès que la date du texte change. `versionIso`
 * lève sur une date illisible plutôt que d'inventer une version que personne n'a écrite.
 */
export const versionIso: string = versionLue(source);

/** La même date, telle que le texte l'écrit : « 22 septembre 2026 ». */
export const dateDeLaVersion: string = dateLue(source);

/**
 * Chaque tableau dans un cadre qui défile de côté. Sur un téléphone, le tableau des durées ne tient
 * pas en largeur : c'est son cadre qui défile, pas la page.
 *
 * Un cadre qui défile doit pouvoir prendre le focus, sans quoi on ne le fait pas défiler au clavier
 * (règle `scrollable-region-focusable` d'axe, « serious »). Il porte donc un rôle et un nom : celui
 * de la section où il se trouve, pour qu'une personne qui l'atteint au clavier sache où elle est.
 */
function tableauxDefilants(html: string): string {
	let section = '';
	return html.replace(/<h2>([\s\S]*?)<\/h2>|<table>|<\/table>/g, (trouve, titre?: string) => {
		if (titre !== undefined) {
			section = titre.replace(/<[^>]+>/g, '').replaceAll('"', '&quot;');
			return trouve;
		}
		if (trouve === '</table>') return '</table></div>';
		return `<div class="tableau" role="region" tabindex="0" aria-label="Tableau : ${section}"><table>`;
	});
}

/** Le texte entier, en HTML : ce que montre `/conditions`. */
export const conditionsHtml: string = tableauxDefilants(typographierHtml(versHtml(source)));

/**
 * Le même texte sans son titre de niveau 1 : la page d'acceptation porte le sien, qui dit la même
 * chose, et une page n'a qu'un titre de niveau 1.
 */
export const conditionsHtmlSansTitre: string = conditionsHtml.replace(/^<h1>[\s\S]*?<\/h1>\n?/, '');

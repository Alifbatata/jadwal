// La page d'abonnement au flux agenda (docs/maquettes/public-agenda.md).
//
// Elle existe parce que « copiez cette adresse et collez-la dans votre application de calendrier »
// n'aide personne. Depuis l'étape 6, elle explique les deux abonnements : tout le programme, ou un
// seul cours (ADR 0028).
//
// Depuis l'étape 18 (retour E1), elle propose d'abord ce que l'appareil sait ouvrir : le lien
// `webcal:` sur un iPhone, un iPad ou un Mac, Google Agenda sur Android, et le choix complet
// ailleurs. L'appareil est lu par le serveur, la page n'ayant aucun script (`appareilDuVisiteur`).
// Une détection se trompe parfois, et quand elle se trompe elle cache la bonne réponse : le choix
// complet reste toujours à un lien, et les étapes à suivre à la main restent sur la page.

import type { PageServerLoad } from './$types.js';
import { CACHE_REGLAGES } from '$lib/server/api.js';
import {
	appareilDuVisiteur,
	languesProposees,
	publicContext,
	referencement
} from '$lib/server/pages.js';
import { readPublicCourses } from '$lib/server/public.js';
import { lienAgenda, lienFlux, lienFluxCours } from '$lib/public/liens.js';

/** `https://…` et `webcal://…` désignent le même fichier ; seul le second ouvre l'application. */
function deuxFormes(chemin: string, origine: string): { https: string; webcal: string } {
	const https = new URL(chemin, origine).toString();
	return { https, webcal: https.replace(/^https?:/, 'webcal:') };
}

export const load: PageServerLoad = async (event) => {
	const { organisation, langue } = await publicContext(event);
	// La langue ne figure dans l'adresse du flux que si elle n'est pas celle de l'organisation :
	// une adresse qu'on copie à la main gagne à rester courte.
	const demandee = langue === organisation.default_language ? undefined : langue;
	const organisationFlux = deuxFormes(lienFlux(organisation.slug, demandee), event.url.origin);
	const cours = await readPublicCourses(organisation.id, langue);
	const { appareil, tousLesChoix } = appareilDuVisiteur(event);

	const moteur = referencement(event, organisation, langue, (autre) =>
		lienAgenda({
			slug: organisation.slug,
			langue: autre,
			langueParDefaut: organisation.default_language
		})
	);

	event.setHeaders({ 'cache-control': CACHE_REGLAGES });
	// La langue du document, que le hook écrit sur `<html>` (voir la page du programme).
	event.locals.langue = langue;
	return {
		canonical: moteur.canonical,
		alternates: moteur.alternates,
		organisation: {
			slug: organisation.slug,
			name: organisation.name,
			accentColor: organisation.accent_color,
			defaultLanguage: organisation.default_language
		},
		langue,
		langues: languesProposees(organisation),
		appareil,
		tousLesChoix,
		https: organisationFlux.https,
		// `webcal:` est ce qui ouvre directement l'application de calendrier sur un téléphone. Les
		// deux adresses désignent le même fichier, au même chemin.
		webcal: organisationFlux.webcal,
		cours: cours.map((course) => ({
			id: course.id,
			title: course.title ?? '',
			webcal: deuxFormes(lienFluxCours(organisation.slug, course.id, demandee), event.url.origin)
				.webcal
		}))
	};
};

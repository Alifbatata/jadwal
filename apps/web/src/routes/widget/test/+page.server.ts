// La page d'essai d'intégration du widget (ADR 0005).
//
// Elle charge le widget exactement comme le ferait le site d'une mosquée : une balise de script,
// l'adresse versionnée, l'empreinte d'intégrité, et plusieurs éléments côte à côte. C'est le test
// manuel d'avant chaque publication — celui qu'aucune assertion ne remplace, parce que « la hauteur
// est juste et il n'y a pas de barre de défilement interne » se voit et ne se mesure pas.
//
// Une honnêteté à garder en tête en la regardant : ici, le cadre est de la **même** origine que la
// page. La vérification d'origine du widget y passe donc trivialement. Le vrai test d'une autre
// origine est celui de `tests/widget.test.ts`, qui lance deux instances sur deux ports.

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { listPublicOrganisations } from '$lib/server/public.js';
import { WIDGET_INTEGRITY, widgetPath } from '$lib/server/widget.js';

export const load: PageServerLoad = async (event) => {
	// La page n'existe que si l'exploitant l'a ouverte. Sans ce réglage, elle répond comme une page
	// qui n'existe pas : c'est un outil d'avant-publication, pas une page du service, et une
	// instance de production n'a aucune raison de l'exposer (étape 7, partie A).
	const ouverte = process.env['JADWAL_WIDGET_TEST_ORG']?.trim();
	if (!ouverte) error(404, 'Page introuvable.');

	const demande = event.url.searchParams.get('org')?.trim();
	// À défaut d'organisation demandée, celle du réglage. La liste des autres n'est lue que pour
	// l'afficher : aucun identifiant de démonstration n'est écrit en dur, il serait faux ailleurs.
	const organisations = await listPublicOrganisations();
	const org = demande || ouverte;

	return {
		org,
		script: widgetPath(),
		integrity: WIDGET_INTEGRITY,
		// La page n'a aucune raison d'être explorée : elle ne sert qu'à nous.
		disponibles: organisations.map((organisation) => organisation.slug)
	};
};

// Le plan de site d'une organisation : ses pages, ses cours, et ses versions linguistiques
// (ADR 0029).
//
// Les annotations de langue se répètent dans chaque entrée, et chaque version se cite elle-même :
// c'est la condition de leur prise en compte. Une seule fonction les produit — celle des pages —
// ce qui rend la réciprocité structurelle plutôt que surveillée.

import type { RequestHandler } from './$types.js';
import { publicError, publicResponse } from '$lib/server/api.js';
import {
	etagOf,
	findOrganisation,
	fingerprint,
	readPublicCourseStamps,
	type Langue
} from '$lib/server/public.js';
import { languesProposees, langueParDefaut, referencement } from '$lib/server/pages.js';
import { lienAgenda, lienCours, lienVue } from '$lib/public/liens.js';
import {
	CACHE_PLAN,
	jour,
	planDeSite,
	XML_CONTENT_TYPE,
	type EntreePlan
} from '$lib/server/sitemap.js';

export const GET: RequestHandler = async (event) => {
	const organisation = await findOrganisation(event.params.slug);
	// Une organisation suspendue ou inventée rend le même 404 qu'ailleurs : un plan de site n'est
	// pas un endroit où l'on raconte ce qui a existé.
	if (!organisation) return publicError(404, 'not_found');

	const adresse = (langue: Langue) => ({
		slug: organisation.slug,
		langue,
		langueParDefaut: organisation.default_language
	});
	const defaut = langueParDefaut(organisation);
	const langues = languesProposees(organisation);
	const cours = await readPublicCourseStamps(organisation.id);
	// Le plan porte la date de ce qu'il décrit. Faute de cours, celle de l'organisation.
	const modifieLe = jour(
		cours.reduce(
			(plus, un) => (un.last_modified > plus ? un.last_modified : plus),
			organisation.updated_at
		)
	);

	const entrees: EntreePlan[] = [];
	for (const langue of langues) {
		const vue = referencement(event, organisation, langue, (autre) => lienVue(adresse(autre)));
		entrees.push({ loc: vue.canonical, lastmod: modifieLe, alternates: vue.alternates });
		const agenda = referencement(event, organisation, langue, (autre) =>
			lienAgenda(adresse(autre))
		);
		entrees.push({ loc: agenda.canonical, lastmod: modifieLe, alternates: agenda.alternates });
		for (const un of cours) {
			const page = referencement(event, organisation, langue, (autre) =>
				lienCours(adresse(autre), un.id)
			);
			entrees.push({
				loc: page.canonical,
				lastmod: jour(un.last_modified),
				alternates: page.alternates
			});
		}
	}

	const etag = etagOf(await fingerprint(organisation.id), 'sitemap', defaut, langues.join(','));
	return publicResponse(event, planDeSite(entrees), {
		cacheControl: CACHE_PLAN,
		etag,
		contentType: XML_CONTENT_TYPE
	});
};

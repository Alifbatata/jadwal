// L'index des plans de site : un plan par organisation (ADR 0029).

import type { RequestHandler } from './$types.js';
import { publicResponse } from '$lib/server/api.js';
import { etagOf, listPublicOrganisations } from '$lib/server/public.js';
import { CACHE_PLAN, indexDesPlans, jour, XML_CONTENT_TYPE } from '$lib/server/sitemap.js';

export const GET: RequestHandler = async (event) => {
	const organisations = await listPublicOrganisations();
	const plans = organisations.map((organisation) => ({
		loc: new URL(`/sitemap-${organisation.slug}.xml`, event.url.origin).toString(),
		lastmod: jour(organisation.last_modified)
	}));
	// L'empreinte suit ce qui est servi : la liste des organisations et leurs dates. Un plan qui se
	// dirait modifié à chaque lecture ferait réexplorer pour rien.
	const etag = etagOf(plans.map((plan) => `${plan.loc}@${plan.lastmod}`).join('|'), 'sitemapindex');

	return publicResponse(event, indexDesPlans(plans), {
		cacheControl: CACHE_PLAN,
		etag,
		contentType: XML_CONTENT_TYPE
	});
};

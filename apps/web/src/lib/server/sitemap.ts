// Les plans de site (ADR 0029).
//
// Deux fichiers : un index qui liste une organisation par ligne, et un plan par organisation. Ce
// n'est pas obligatoire tant qu'on tient sous cinquante mille adresses — c'est tout de même la
// bonne forme dès maintenant, parce qu'un moteur ne reprend alors que l'organisation qui a changé.
//
// Les deux vivent à la **racine**, et non dans un dossier : la portée d'un plan de site est son
// répertoire parent, donc un fichier rangé dans `/plans/` ne pourrait déclarer aucune adresse de
// `/m/`. C'est un piège classique, et il est silencieux.

/** Un plan de site est un document XML : tout ce qui vient des données y est échappé. */
export function xml(texte: string): string {
	return texte
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

/** `2026-09-21` : la date suffit, et elle évite d'annoncer une modification à la seconde près. */
export function jour(horodatage: string): string {
	return horodatage.slice(0, 10);
}

export interface EntreePlan {
	loc: string;
	lastmod: string;
	/** Les versions linguistiques, `x-default` compris. Elles se répètent dans chaque entrée. */
	alternates: readonly { hreflang: string; href: string }[];
}

/**
 * Le plan d'une organisation. L'ordre des enfants d'une entrée suit le schéma officiel : `loc`,
 * puis `lastmod`, puis les annotations de langue — qui doivent venir après, et non entre les deux.
 */
export function planDeSite(entrees: readonly EntreePlan[]): string {
	const corps = entrees
		.map((entree) => {
			const liens = entree.alternates
				.map(
					(autre) =>
						`\t\t<xhtml:link rel="alternate" hreflang="${xml(autre.hreflang)}" href="${xml(autre.href)}" />`
				)
				.join('\n');
			return `\t<url>\n\t\t<loc>${xml(entree.loc)}</loc>\n\t\t<lastmod>${xml(entree.lastmod)}</lastmod>\n${liens}\n\t</url>`;
		})
		.join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${corps}
</urlset>
`;
}

/** L'index : un plan par organisation, avec la date de ce que ce plan décrit. */
export function indexDesPlans(plans: readonly { loc: string; lastmod: string }[]): string {
	const corps = plans
		.map(
			(plan) =>
				`\t<sitemap>\n\t\t<loc>${xml(plan.loc)}</loc>\n\t\t<lastmod>${xml(plan.lastmod)}</lastmod>\n\t</sitemap>`
		)
		.join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${corps}
</sitemapindex>
`;
}

export const XML_CONTENT_TYPE = 'application/xml; charset=utf-8';
/** Un plan de site change quand le programme change : une heure de fraîcheur suffit largement. */
export const CACHE_PLAN = 'public, max-age=3600, stale-while-revalidate=86400';

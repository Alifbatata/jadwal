import { currentOrganisation } from '$lib/server/context.js';
import type { LayoutServerLoad } from './$types.js';

/**
 * Le côté public ne porte rien de l'espace des responsables : ni en-tête, ni navigation, ni adresse
 * de compte. Une page de mosquée s'affiche dans l'iframe d'un autre site (ADR 0027) ; y faire
 * apparaître « jadwal » et un bouton de déconnexion n'aurait aucun sens.
 */
const PUBLIC = /^\/(m\/|api\/v1\/)/;
/**
 * Les pages qui se rendent seules, sans la coquille des responsables et sans être publiques : la
 * page d'essai du widget, qui doit ressembler au site d'une mosquée et non au nôtre. Elle garde en
 * revanche son `noindex`, comme tout ce qui n'est pas `/m/**` (ADR 0029).
 */
const NUES = /^\/widget\//;

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Le mode intégré, et le seul endroit du code qui le décide : c'est lui qui fait charger le
	// script d'annonce de hauteur, et rien d'autre ne l'ajoute jamais (ADR 0005).
	const integre = PUBLIC.test(url.pathname) && url.searchParams.get('embed') === '1';
	if (PUBLIC.test(url.pathname)) {
		return { person: null, organisation: null, cotePublic: true, nu: false, integre };
	}
	if (NUES.test(url.pathname)) {
		return { person: null, organisation: null, cotePublic: false, nu: true, integre: false };
	}
	const person = locals.person;
	if (!person) {
		return { person: null, organisation: null, cotePublic: false, nu: false, integre: false };
	}
	// L'organisation en contexte sert à la navigation et à la bannière du super-admin. Elle vient
	// de la session, comme partout ailleurs, jamais de l'URL (ADR 0013).
	const context = await currentOrganisation(person);
	return {
		cotePublic: false,
		nu: false,
		integre: false,
		// Rien d'autre que ce que la page a besoin d'afficher.
		person: {
			email: person.email,
			isSuperAdmin: person.isSuperAdmin,
			hasSuperAdminPowers: person.hasSuperAdminPowers,
			needsPasskey: person.needsPasskey
		},
		organisation: context
			? {
					name: context.organizationName,
					slug: context.organizationSlug,
					// La coquille des responsables prend la couleur de la mosquée, comme ses pages
					// publiques : c'est la même organisation (ADR 0031).
					accentColor: context.organizationAccent,
					role: context.role,
					asSuperAdmin: context.asSuperAdmin
				}
			: null
	};
};

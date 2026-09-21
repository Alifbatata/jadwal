// Ce que chaque route de l'espace des responsables demande avant de faire quoi que ce soit.
//
// Une seule porte, trois marches : être connecté, avoir une organisation en contexte, et avoir le
// rôle qu'exige l'écran. Le contexte vient de la session, jamais de l'URL (ADR 0013) ; le rôle est
// relu à chaque requête, jamais gardé dans un cookie.

import { redirect, type RequestEvent } from '@sveltejs/kit';
import { currentOrganisation, type OrganisationContext, type SignedIn } from './context.js';

/** Connecté, sinon la page de connexion. */
export function mustBeSignedIn(event: RequestEvent): SignedIn {
	const person = event.locals.person;
	if (!person) redirect(303, '/connexion');
	return person;
}

/**
 * Connecté **et** dans une organisation. Pose aussi `locals.visited`, que le registre interne du
 * super-admin relit après coup : la trace dit alors où il est allé, sans requête de plus.
 */
export async function mustBeInOrganisation(event: RequestEvent): Promise<OrganisationContext> {
	const person = mustBeSignedIn(event);
	const context = await currentOrganisation(person);
	if (!context) redirect(303, '/organisations');
	event.locals.visited = { id: context.organizationId, slug: context.organizationSlug };
	return context;
}

/** Les écrans réservés aux responsables : réglages, membres. Le super-admin y entre aussi. */
export async function mustAdminister(event: RequestEvent): Promise<OrganisationContext> {
	const context = await mustBeInOrganisation(event);
	if (context.role === 'editor') redirect(303, '/');
	return context;
}

/** Les écrans du super-admin. Sans passkey prouvée, il n'y a aucun pouvoir (ADR 0025). */
export function mustBeSuperAdmin(event: RequestEvent): SignedIn {
	const person = mustBeSignedIn(event);
	if (!person.isSuperAdmin) redirect(303, '/organisations');
	if (!person.hasSuperAdminPowers) redirect(303, '/super-admin/passkey');
	return person;
}

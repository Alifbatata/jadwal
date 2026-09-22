// Ce que chaque route de l'espace des responsables demande avant de faire quoi que ce soit.
//
// Une seule porte, quatre marches : être connecté, avoir une organisation en contexte, avoir accepté
// la version en cours des conditions d'utilisation (ADR 0044), et avoir le rôle qu'exige l'écran. Le
// contexte vient de la session, jamais de l'URL (ADR 0013) ; le rôle et l'acceptation sont relus à
// chaque requête, jamais gardés dans un cookie.

import { error, redirect, type RequestEvent } from '@sveltejs/kit';
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
	// Ici, et non écran par écran : toutes les pages et toutes les actions de l'espace passent par
	// cette porte, et un seul oubli laisserait entrer sans accord. Tous les rôles s'y arrêtent,
	// éditeurs compris, puisqu'ils publient aussi ; le super-admin jamais (ADR 0044).
	if (!context.termsAccepted) redirect(303, '/conditions/accepter');
	return context;
}

/**
 * L'écran d'acceptation des conditions : connecté, une organisation en contexte, **et** des
 * conditions à accepter. Il ne passe pas par `mustBeInOrganisation`, qui le renverrait vers
 * lui-même ; une personne qui a déjà accepté cette version retourne à l'accueil de l'espace.
 */
export async function mustHaveTermsToAccept(event: RequestEvent): Promise<OrganisationContext> {
	const person = mustBeSignedIn(event);
	const context = await currentOrganisation(person);
	if (!context) redirect(303, '/organisations');
	if (context.termsAccepted) redirect(303, '/');
	return context;
}

/** Les écrans réservés aux responsables : réglages, membres. Le super-admin y entre aussi. */
export async function mustAdminister(event: RequestEvent): Promise<OrganisationContext> {
	const context = await mustBeInOrganisation(event);
	if (context.role === 'editor') redirect(303, '/');
	return context;
}

/**
 * Les écrans du module des heures de prière, pour une organisation qui l'a allumé (ADR 0042).
 *
 * **404, et non une page vide avec un message.** Une page qui existe pour dire qu'elle n'a rien à
 * dire reste une page à traduire, à tester et à maintenir. Éteint, le module est absent.
 *
 * Le contrôle est ici plutôt qu'à chaque chargement et à chaque action : ces écrans en comptent
 * dix-huit à eux deux, et un seul oubli laisserait une porte ouverte sans que rien ne le dise.
 */
export async function mustHavePrayerModule(event: RequestEvent): Promise<OrganisationContext> {
	const context = await mustBeInOrganisation(event);
	if (!context.organizationPrayerModule) error(404, 'Not Found');
	return context;
}

/** Les mêmes écrans, quand ils sont réservés aux responsables : les réglages des prières. */
export async function mustAdministerPrayerModule(
	event: RequestEvent
): Promise<OrganisationContext> {
	const context = await mustAdminister(event);
	if (!context.organizationPrayerModule) error(404, 'Not Found');
	return context;
}

/** Les écrans du super-admin. Sans passkey prouvée, il n'y a aucun pouvoir (ADR 0025). */
export function mustBeSuperAdmin(event: RequestEvent): SignedIn {
	const person = mustBeSignedIn(event);
	if (!person.isSuperAdmin) redirect(303, '/organisations');
	if (!person.hasSuperAdminPowers) redirect(303, '/super-admin/passkey');
	return person;
}

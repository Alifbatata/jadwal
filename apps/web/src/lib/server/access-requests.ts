// Les demandes d'accès (étape 22, ADR 0049) : vérifier une saisie, la déposer, prévenir l'exploitant.
//
// Une organisation qui veut se servir de jadwal le demande par le formulaire public. La demande
// n'entre en base que par `jadwal.request_access`, sous le rôle public, qui n'a aucun droit sur la
// table : il ne relit rien de ce qu'il dépose (migration 0079).
//
// Aucun courriel ne part à l'adresse saisie : le formulaire ne doit pas servir à écrire à n'importe
// qui. Le seul courriel est l'avis à l'exploitant, sans aucune donnée de la demande.

import { sql } from '@jadwal/db';
import { ACCESS_REQUEST_LIMITS } from '@jadwal/db/schema';
import type { RequestEvent } from '@sveltejs/kit';
import type { Langue } from '$lib/i18n.js';
import { clientAddress } from './api.js';
import { createMailer } from './mail/index.js';
import { accessRequestNoticeEmail } from './mail/messages.js';
import { publicDatabase } from './public.js';
import { ACCESS_REQUEST_BUDGET, consume } from './rate-limit.js';

/** La forme acceptable d'une adresse, celle de `/connexion` et de la contrainte de la table. */
const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ACCESS_REQUEST_FIELDS = [
	'organization',
	'locality',
	'contact',
	'email',
	'message'
] as const;
export type AccessRequestField = (typeof ACCESS_REQUEST_FIELDS)[number];

/** Ce qui a été tapé, sans les blancs autour : c'est aussi ce que la page rend après un refus. */
export type AccessRequestValues = Record<AccessRequestField, string>;

/** Le nom d'une erreur ; la page l'écrit dans sa langue. */
export type AccessRequestError = 'required' | 'tooLong' | 'invalidEmail';

/** Les bornes de chaque champ, reprises de la table : la page les pose en `maxlength`. */
export const ACCESS_REQUEST_MAX: Record<AccessRequestField, number> = {
	organization: ACCESS_REQUEST_LIMITS.name,
	locality: ACCESS_REQUEST_LIMITS.name,
	contact: ACCESS_REQUEST_LIMITS.name,
	email: ACCESS_REQUEST_LIMITS.email,
	message: ACCESS_REQUEST_LIMITS.message
};

export function readAccessRequest(form: FormData): AccessRequestValues {
	const read = (field: AccessRequestField) => String(form.get(field) ?? '').trim();
	return {
		organization: read('organization'),
		locality: read('locality'),
		contact: read('contact'),
		email: read('email'),
		message: read('message')
	};
}

/** Les erreurs, champ par champ ; un objet vide quand tout est acceptable. */
export function checkAccessRequest(
	values: AccessRequestValues
): Partial<Record<AccessRequestField, AccessRequestError>> {
	const errors: Partial<Record<AccessRequestField, AccessRequestError>> = {};
	for (const field of ACCESS_REQUEST_FIELDS) {
		const value = values[field];
		if (value === '') {
			if (field !== 'message') errors[field] = 'required';
		} else if (value.length > ACCESS_REQUEST_MAX[field]) {
			errors[field] = 'tooLong';
		} else if (field === 'email' && !ADRESSE.test(value)) {
			errors[field] = 'invalidEmail';
		}
	}
	return errors;
}

/**
 * Un jeton du budget de cette adresse IP. La clé est condensée avant d'être rangée, et la ligne
 * part au bout d'un jour (ADR 0032).
 */
export async function allowAccessRequest(event: RequestEvent): Promise<boolean> {
	return consume(publicDatabase(), `access-request:${clientAddress(event)}`, ACCESS_REQUEST_BUDGET);
}

/** Ce que la base répond : déposée, déjà en attente pour cette adresse, ou plafond du jour atteint. */
export type AccessRequestOutcome = 'recorded' | 'duplicate' | 'full';

export async function requestAccess(
	values: AccessRequestValues,
	language: Langue
): Promise<AccessRequestOutcome> {
	const rows = await publicDatabase().execute<{ outcome: AccessRequestOutcome }>(sql`
		select jadwal.request_access(${values.organization}, ${values.locality}, ${values.contact},
			${values.email}, ${values.message}, ${language}) as "outcome"
	`);
	const row = Array.isArray(rows)
		? (rows[0] as { outcome: AccessRequestOutcome } | undefined)
		: undefined;
	if (!row) throw new Error('jadwal.request_access returned no row');
	return row.outcome;
}

/**
 * Prévient l'exploitant qu'une demande attend, si `JADWAL_DEMANDES_COURRIEL` est posée ; vide, la
 * console suffit. Un échec d'envoi est journalisé et ne change rien à la réponse : la demande est
 * déposée, et la console la montre.
 */
export async function notifyOperator(
	origin: string,
	env: NodeJS.ProcessEnv = process.env
): Promise<void> {
	const to = (env['JADWAL_DEMANDES_COURRIEL'] ?? '').trim();
	if (to === '') return;
	try {
		await createMailer(env).send(accessRequestNoticeEmail(to, origin));
	} catch (cause) {
		console.error('Access request notice not sent', cause);
	}
}

// Inscrire une invitation : le geste commun à l'écran Membres et à la console du super-admin, qui
// invite la personne responsable d'une organisation sans entrer dans son espace (étape 22, ADR 0049).
//
// Aucune consultation des comptes : on enregistre l'invitation, et l'appelant envoie le message. Il
// n'y a donc aucune branche qui puisse dépendre de l'existence d'un compte, ni par le message, ni par
// le temps de réponse (ADR 0017).

import { newId, sql, type Transaction } from '@jadwal/db';
import { record } from './audit.js';

/** Quatorze jours : assez pour une absence, assez court pour ne pas traîner. */
export const INVITATION_DAYS = 14;

export type InvitationRole = 'org_admin' | 'editor';

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

/**
 * Inscrit l'invitation de `email` dans l'organisation, au journal compris, dans la transaction de
 * l'appelant, qui a posé le contexte de cette organisation et la personne qui invite.
 */
export async function createInvitation(
	tx: Transaction,
	invitation: { organizationId: string; actorId: string; email: string; role: InvitationRole }
): Promise<void> {
	const { organizationId, actorId, email, role } = invitation;
	const invitationId = newId();
	// Une invitation encore en attente pour cette adresse, échue ou non, est close d'abord, et la
	// nouvelle la remplace. L'index des invitations en attente n'en admet qu'une par adresse, échues
	// comprises : sans cela, l'insertion ne faisait rien, et l'écran disait « envoyée » pour une
	// invitation que personne ne voyait, ou qui gardait son ancien rôle (étape 17). Seules les
	// invitations de cette organisation sont touchées, et aucun compte n'est lu : la réponse reste la
	// même, mot pour mot.
	const remplacees = rows<{ id: string }>(
		await tx.execute(sql`
			update "invitation" set "status" = 'cancelled', "resolved_at" = now()
			where "organization_id" = ${organizationId}
				and lower("email") = lower(${email}) and "status" = 'pending'
			returning "id"
		`)
	);
	for (const remplacee of remplacees) {
		await record(tx, organizationId, actorId, {
			action: 'invitation.cancel',
			targetTable: 'invitation',
			targetId: remplacee.id,
			after: { replacedBy: invitationId }
		});
	}
	// La fin se compte en heures, comme la borne de la base (migration 0056) : quatorze jours de
	// calendrier, dans un fuseau qui passe à l'heure d'hiver, font 337 heures, et la base les refusait.
	// Il ne reste de conflit possible qu'avec une invitation envoyée au même instant, qui vaut alors
	// pour celle-ci.
	const creee = rows<{ id: string }>(
		await tx.execute(sql`
			insert into "invitation" ("id", "organization_id", "email", "role", "invited_by", "expires_at")
			values (${invitationId}, ${organizationId}, ${email}, ${role}, ${actorId},
				now() + make_interval(hours => ${INVITATION_DAYS} * 24))
			on conflict do nothing
			returning "id"
		`)
	);
	if (creee.length === 0) return;
	await record(tx, organizationId, actorId, {
		action: 'invitation.create',
		targetTable: 'invitation',
		targetId: invitationId,
		after: { email, role }
	});
}

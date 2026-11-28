// Journal d'audit : qui a fait quoi, quand (ADR 0015).
//
// L'entrée est écrite dans la même transaction que la modification qu'elle décrit : si la
// modification est annulée, sa trace l'est aussi, et si la trace échoue, la modification l'est
// également. L'horodatage n'est pas écrit ici : il appartient au serveur, et le rôle applicatif n'a
// pas le droit de le fournir (ADR 0020).

import { newId, sql, type Transaction } from '@jadwal/db';

/**
 * Ce que le journal sait nommer. Les écritures du super-admin y entrent sous les mêmes noms que
 * celles d'un responsable : le journal dit ce qui a changé, pas qui avait le droit de le changer
 * (ADR 0025). Ses **lectures**, elles, n'y entrent pas — elles vont au registre interne.
 */
export type AuditAction =
	| 'invitation.create'
	| 'invitation.cancel'
	| 'invitation.accept'
	| 'member.remove'
	| 'member.leave'
	| 'member.role'
	/** L'autorisation de diffuser le direct, donnée ou retirée à un éditeur (ADR 0056 amendée). */
	| 'member.broadcast'
	/**
	 * Un compte supprimé par le super-admin (ADR 0058 amendée) : une entrée dans le journal de
	 * chaque organisation dont il était membre, avec son adresse et son rôle, puisque le compte
	 * lui-même ne sera plus là pour le dire.
	 */
	| 'account.delete'
	| 'organization.create'
	| 'organization.settings'
	| 'organization.prayer_module'
	/** Les langues du direct de l'organisation (ADR 0056 amendée). */
	| 'organization.live_languages'
	| 'course.create'
	| 'course.update'
	| 'course.delete'
	| 'exception.cancel'
	| 'exception.move'
	| 'exception.restore'
	| 'pause.create'
	| 'pause.delete'
	| 'room.create'
	| 'room.delete'
	| 'prayer.settings'
	| 'prayer.import'
	| 'prayer.import.delete'
	| 'prayer.period.create'
	| 'prayer.period.update'
	| 'prayer.period.delete'
	/** Un jeton du poste « Diffuser » a été signé : qui a lancé un direct, et quand (ADR 0056). */
	| 'live.token';

export interface AuditEntry {
	action: AuditAction;
	targetTable: string;
	targetId?: string | undefined;
	before?: unknown;
	after?: unknown;
}

/** Écrit une entrée dans le journal de l'organisation du contexte courant. */
export async function record(
	tx: Transaction,
	organizationId: string,
	actorId: string | null,
	entry: AuditEntry
): Promise<void> {
	await tx.execute(sql`
		insert into "audit_log"
			("id", "organization_id", "actor_id", "action", "target_table", "target_id", "before", "after")
		values (
			${newId()}, ${organizationId}, ${actorId}, ${entry.action}, ${entry.targetTable},
			${entry.targetId ?? null},
			${entry.before === undefined ? null : JSON.stringify(entry.before)},
			${entry.after === undefined ? null : JSON.stringify(entry.after)}
		)
	`);
}

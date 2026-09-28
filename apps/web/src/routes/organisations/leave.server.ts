// Quitter une organisation, depuis « Vos organisations » (étape 19). À part, pour qu'un autre écran
// puisse proposer le même départ par le même chemin, avec les mêmes réponses.
//
// Le premier envoi ne fait rien : il rend la demande de confirmation, avec le nom de l'organisation.
// La seule personne responsable l'apprend dès ce premier envoi : l'écran ne lui demande pas de
// confirmer un départ que la base refuserait. Le second envoi, qui porte `confirm=yes`, supprime sa
// propre adhésion.
//
// Le contexte est celui de l'organisation quittée, avec la personne : la politique ne lui laisse que
// sa propre adhésion (migration 0066), et le journal exige que l'auteur soit la personne du contexte
// (migration 0063). Le déclencheur de la dernière personne responsable reste la vérité : son refus
// est traduit, au cas où l'autre responsable partirait entre les deux envois. Partie, la personne
// n'a plus cette organisation dans sa session, et elle arrive sur « Vos organisations » avec
// l'encadré qui le lui dit (`departure.ts`).
//
// Les réponses nomment une erreur, jamais sa phrase : l'écran l'écrit dans la langue de l'espace.

import { fail, redirect } from '@sveltejs/kit';
import { sql, withOrg, type Transaction } from '@jadwal/db';
import { appDatabase } from '$lib/server/database.js';
import { forgetOrganisation, membershipsOf, type SignedIn } from '$lib/server/context.js';
import { record } from '$lib/server/audit.js';
import { departureArrival } from './departure.js';

/** Un identifiant d'organisation. Autre chose n'atteint pas la base, qui le refuserait en erreur. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

/** Le nombre de personnes responsables de l'organisation du contexte. */
async function managersOf(tx: Transaction, organizationId: string): Promise<number> {
	const [compte] = rows<{ combien: number | string }>(
		await tx.execute(sql`
			select count(*) as "combien" from "membership"
			where "organization_id" = ${organizationId} and "role" = 'org_admin'
		`)
	);
	return Number(compte?.combien ?? 0);
}

/**
 * Le refus du déclencheur de la dernière personne responsable (migration 0012) : le code
 * `restrict_violation` et son message. Tout autre échec est relancé, pour ne pas masquer une vraie
 * erreur.
 */
function isLastManagerRefusal(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
		const { code, message } = current as { code?: unknown; message?: unknown };
		if (code === '23001' && String(message).includes('last org_admin')) return true;
		current = (current as { cause?: unknown }).cause;
	}
	return false;
}

/**
 * L'action « quitter », sur le formulaire envoyé : `organizationId`, l'organisation que l'écran
 * nomme, et `confirm=yes` au second envoi. L'appartenance est revérifiée ici : un identifiant venu
 * du formulaire ne donne rien, et un identifiant mal formé ne désigne aucune organisation. Un départ
 * fait renvoie vers « Vos organisations » ; les autres issues rendent la réponse que l'écran affiche
 * en haut de la page.
 */
export async function leaveOrganisation(person: SignedIn, form: FormData) {
	const organizationId = String(form.get('organizationId') ?? '');
	const confirme = String(form.get('confirm') ?? '') === 'yes';
	const membership = UUID.test(organizationId)
		? (await membershipsOf(person)).find((entry) => entry.organizationId === organizationId)
		: undefined;
	if (!membership) return fail(403, { error: 'notMember' as const });
	const organisation = membership.organizationName;

	let issue: 'ask' | 'lastManager' | 'notMember' | 'left';
	try {
		issue = await withOrg(appDatabase(), { organizationId, userId: person.userId }, async (tx) => {
			if (!confirme) {
				const seule =
					membership.role === 'org_admin' && (await managersOf(tx, organizationId)) <= 1;
				return seule ? 'lastManager' : 'ask';
			}
			const [partie] = rows<{ id: string; role: string }>(
				await tx.execute(sql`
					delete from "membership"
					where "organization_id" = ${organizationId} and "user_id" = ${person.userId}
					returning "id", "role"
				`)
			);
			if (!partie) return 'notMember';
			await record(tx, organizationId, person.userId, {
				action: 'member.leave',
				targetTable: 'membership',
				targetId: partie.id,
				before: { role: partie.role }
			});
			return 'left';
		});
	} catch (error) {
		if (!isLastManagerRefusal(error)) throw error;
		issue = 'lastManager';
	}
	if (issue === 'notMember') return fail(403, { error: 'notMember' as const });
	if (issue === 'lastManager') {
		return fail(409, { error: 'lastManager' as const, organisation });
	}
	if (issue === 'ask') return { aConfirmer: { organizationId, organisation } };
	await forgetOrganisation(person, organizationId);
	redirect(303, departureArrival(organizationId));
}

// Après connexion : choisir son organisation, et répondre aux invitations reçues.
//
// Les invitations visibles ici sont celles adressées à l'adresse de la personne connectée, que le
// lien magique vient de prouver. Aucune organisation n'est en contexte à ce moment : la personne
// n'en est pas encore membre. C'est elle qui crée son adhésion en acceptant (ADR 0017).
//
// Depuis l'étape 19, la personne y quitte aussi une organisation, chacune de la liste, après une
// confirmation. La base le permet depuis la migration 0066 : chacun supprime sa propre adhésion, et
// rien de plus ; la dernière personne responsable reste retenue par son déclencheur (migration 0012).
//
// Les actions rendent le nom d'une erreur, jamais sa phrase : la page l'écrit dans la langue de
// l'espace (`i18n/organisations.ts`).

import { fail, redirect } from '@sveltejs/kit';
import { newId, sql, withOrg, withUser, type Transaction } from '@jadwal/db';
import { appDatabase } from '$lib/server/database.js';
import {
	chooseOrganisation,
	forgetOrganisation,
	membershipsOf,
	pendingInvitationsOf
} from '$lib/server/context.js';
import { record } from '$lib/server/audit.js';
import { departedFrom, departureArrival } from './departure.js';
import type { Actions, PageServerLoad } from './$types.js';

/**
 * Un identifiant d'invitation ou d'organisation. Autre chose n'atteint pas la base, qui le refuserait
 * en erreur.
 */
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

export const load: PageServerLoad = async ({ locals, url }) => {
	const person = locals.person;
	if (!person) redirect(303, '/connexion');
	const memberships = await membershipsOf(person);
	// L'encadré du départ, pour une personne qui n'est plus membre de l'organisation que l'adresse
	// nomme (`departure.ts`). Une adresse copiée ne fait rien dire de faux à qui en est membre.
	const quittee = departedFrom(url);
	return {
		departed: quittee !== null && !memberships.some((entry) => entry.organizationId === quittee),
		memberships,
		// La lecture que le contexte compte pour proposer cet écran dans la navigation : il ne mène
		// jamais ici pour une invitation qui n'y serait pas.
		invitations: (await pendingInvitationsOf(person)).map((invitation) => ({
			id: invitation.id,
			organisation: invitation.organisation,
			role: invitation.role,
			expiresAt: invitation.expires_at
		}))
	};
};

export const actions: Actions = {
	choisir: async ({ request, locals }) => {
		const person = locals.person;
		if (!person) redirect(303, '/connexion');
		const form = await request.formData();
		const organizationId = String(form.get('organizationId') ?? '');
		// L'appartenance est revérifiée ici : un identifiant venu du formulaire ne donne rien.
		if (!(await chooseOrganisation(person, organizationId))) {
			return fail(403, { error: 'notMember' as const });
		}
		redirect(303, '/');
	},

	accepter: async ({ request, locals }) => {
		const person = locals.person;
		if (!person) redirect(303, '/connexion');
		const form = await request.formData();
		const invitationId = String(form.get('invitationId') ?? '');
		// Un identifiant mal formé ne désigne aucune invitation : la réponse d'une invitation inconnue.
		if (!UUID.test(invitationId)) return fail(404, { error: 'invitationGone' as const });
		const accepted = await withUser(appDatabase(), person.userId, async (tx) => {
			// L'ordre compte. La personne accepte d'abord : la politique de mise à jour la reconnaît
			// par son adresse, que le lien magique vient de prouver. C'est cette acceptation, et elle
			// seule, qui autorisera ensuite la création de l'adhésion (ADR 0017).
			const claimed = rows<{
				organization_id: string;
				role: 'org_admin' | 'editor';
				status: 'accepted' | 'joined';
			}>(
				await tx.execute(sql`
					update "invitation"
					set "status" = 'accepted', "accepted_by" = ${person.userId}, "resolved_at" = now()
					where "id" = ${invitationId} and "status" = 'pending' and "expires_at" > now()
					returning "organization_id", "role", "status"
				`)
			)[0];
			if (!claimed) return null;
			// Le contexte d'organisation est posé maintenant, et pas avant : la personne vient à
			// l'instant d'en devenir légitime.
			await tx.execute(sql`select set_config('jadwal.org_id', ${claimed.organization_id}, true)`);
			// Une personne déjà membre, réinvitée, n'a pas d'adhésion à créer : la base consomme son
			// invitation dès l'acceptation, qui revient « joined » (migration 0058), et la politique
			// refuserait l'insertion. Elle garde son adhésion et son rôle. Pour toute autre personne,
			// l'adhésion porte le rôle de l'invitation : la base n'en accepte pas d'autre. L'insertion
			// ne part donc que pour une personne qui n'est pas encore membre, et n'a plus besoin de
			// « on conflict do nothing ».
			if (claimed.status === 'accepted') {
				await tx.execute(sql`
					insert into "membership" ("id", "organization_id", "user_id", "role")
					values (${newId()}, ${claimed.organization_id}, ${person.userId}, ${claimed.role})
				`);
			}
			await record(tx, claimed.organization_id, person.userId, {
				action: 'invitation.accept',
				targetTable: 'invitation',
				targetId: invitationId,
				after: { role: claimed.role }
			});
			return claimed.organization_id;
		});
		if (!accepted) return fail(404, { error: 'invitationGone' as const });
		await chooseOrganisation(person, accepted);
		redirect(303, '/');
	},

	/**
	 * Quitter une organisation (étape 19). Le premier envoi ne fait rien : il rend la demande de
	 * confirmation, avec le nom de l'organisation. La seule personne responsable l'apprend dès ce
	 * premier envoi, avec ce qu'elle doit faire : la page ne lui demande pas de confirmer un départ
	 * que la base refuserait. Le second envoi, qui porte `confirm=yes`, supprime sa propre adhésion.
	 *
	 * Le contexte est celui de l'organisation quittée, avec la personne : la politique ne lui laisse
	 * que sa propre adhésion (migration 0066), et le journal exige que l'auteur soit la personne du
	 * contexte (migration 0063). Le déclencheur de la dernière personne responsable reste la vérité :
	 * son refus est traduit, au cas où l'autre responsable partirait entre les deux envois. Partie, la
	 * personne n'a plus cette organisation dans sa session, et elle arrive ici avec l'encadré qui le
	 * lui dit (`departure.ts`).
	 */
	quitter: async ({ request, locals }) => {
		const person = locals.person;
		if (!person) redirect(303, '/connexion');
		const form = await request.formData();
		const organizationId = String(form.get('organizationId') ?? '');
		const confirme = String(form.get('confirm') ?? '') === 'yes';
		// L'appartenance est revérifiée ici, comme pour le choix : un identifiant venu du formulaire ne
		// donne rien. Un identifiant mal formé ne désigne aucune organisation.
		const membership = UUID.test(organizationId)
			? (await membershipsOf(person)).find((entry) => entry.organizationId === organizationId)
			: undefined;
		if (!membership) return fail(403, { error: 'notMember' as const });
		const organisation = membership.organizationName;

		let issue: 'ask' | 'lastManager' | 'notMember' | 'left';
		try {
			issue = await withOrg(
				appDatabase(),
				{ organizationId, userId: person.userId },
				async (tx) => {
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
				}
			);
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
};

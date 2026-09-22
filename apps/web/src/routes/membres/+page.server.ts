// Les membres d'une organisation et ses invitations en attente.
//
// Tout passe par `withSessionOrg` : le contexte vient de la session, jamais de la requête. Une
// personne qui écrirait l'identifiant d'une autre organisation dans son formulaire ne verrait rien,
// puisque le contexte n'est pas construit à partir de ce qu'elle envoie.

import { fail } from '@sveltejs/kit';
import { newId, sql } from '@jadwal/db';
import { record } from '$lib/server/audit.js';
import { withSessionOrg } from '$lib/server/context.js';
import { mustAdminister, mustBeInOrganisation } from '$lib/server/guard.js';
import { createMailer } from '$lib/server/mail/index.js';
import { invitationEmail } from '$lib/server/mail/messages.js';
import type { Actions, PageServerLoad } from './$types.js';

/** Quatorze jours : assez pour une absence, assez court pour ne pas traîner. */
const INVITATION_DAYS = 14;
const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** La seule réponse que l'invitation sait donner, quelle que soit l'adresse (ADR 0017). */
const INVITEE = {
	invitee: true,
	message: 'L’invitation a été envoyée à cette adresse.'
} as const;

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

export const load: PageServerLoad = async (event) => {
	// Un `editor` n'entre pas ici : il saisit des cours, il n'ouvre ni ne ferme les accès.
	const context = await mustAdminister(event);

	return withSessionOrg(context, async (tx) => ({
		organisation: { nom: await organisationName(tx), slug: context.organizationSlug },
		role: context.role,
		moi: context.userId,
		membres: rows<{
			id: string;
			user_id: string;
			role: string;
			email: string;
			name: string | null;
		}>(
			await tx.execute(sql`
				select m."id", m."user_id", m."role", u."email", u."name"
				from "membership" m join "user" u on u."id" = m."user_id"
				order by m."role", u."email"
			`)
		),
		// Une invitation en attente n'affiche que ce que le responsable a saisi : l'adresse, la date
		// et qui a invité. Jamais un nom venu d'un compte existant.
		invitations: rows<{ id: string; email: string; role: string; created_at: string }>(
			await tx.execute(sql`
				select "id", "email", "role", "created_at"::text
				from "invitation" where "status" = 'pending' and "expires_at" > now()
				order by "created_at"
			`)
		)
	}));
};

/**
 * Le nom de l'organisation en contexte. Filtré ici : le super-admin voit toutes les organisations,
 * et l'invitation envoyée depuis la seconde nommait la première (`readSettings` le dit aussi).
 */
async function organisationName(tx: Parameters<Parameters<typeof withSessionOrg>[1]>[0]) {
	const found = rows<{ name: string }>(
		await tx.execute(
			sql`select "name" from "organization" where "id" = (select jadwal.current_org_id())`
		)
	);
	return found[0]?.name ?? '';
}

/** Seule une personne responsable touche aux membres. */
/**
 * Seul un responsable administre les membres — et le super-admin, qui entre partout depuis
 * l'étape 4 (ADR 0025). Un `editor` saisit des cours, il n'ouvre ni ne ferme les accès.
 */
function mustBeAdmin(role: string) {
	return role === 'org_admin' || role === 'superadmin';
}

export const actions: Actions = {
	inviter: async (event) => {
		const { request, url } = event;
		const context = await mustBeInOrganisation(event);
		if (!mustBeAdmin(context.role)) {
			return fail(403, { erreur: 'Seule une personne responsable peut inviter.' });
		}
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const role = String(form.get('role') ?? 'editor');
		if (!ADRESSE.test(email)) {
			return fail(400, { erreur: 'Cette adresse n’a pas la forme d’une adresse électronique.' });
		}
		if (role !== 'org_admin' && role !== 'editor') {
			return fail(400, { erreur: 'Ce rôle n’existe pas.' });
		}

		// Aucune consultation des comptes : on enregistre l'invitation et on envoie le message. Il
		// n'y a donc aucune branche qui puisse dépendre de l'existence d'un compte, ni par le
		// message, ni par le temps de réponse (ADR 0017).
		const invitationId = newId();
		await withSessionOrg(context, async (tx) => {
			await tx.execute(sql`
				insert into "invitation" ("id", "organization_id", "email", "role", "invited_by", "expires_at")
				values (${invitationId}, ${context.organizationId}, ${email}, ${role}, ${context.userId},
					now() + make_interval(days => ${INVITATION_DAYS}))
				on conflict do nothing
			`);
			await record(tx, context.organizationId, context.userId, {
				action: 'invitation.create',
				targetTable: 'invitation',
				targetId: invitationId,
				after: { email, role }
			});
		});
		const organisation = await withSessionOrg(context, organisationName);
		await createMailer().send(invitationEmail(email, organisation, url.origin));
		return INVITEE;
	},

	annuler: async (event) => {
		const { request } = event;
		const context = await mustBeInOrganisation(event);
		if (!mustBeAdmin(context.role)) {
			return fail(403, { erreur: 'Seule une personne responsable peut annuler une invitation.' });
		}
		const invitationId = String((await request.formData()).get('invitationId') ?? '');
		await withSessionOrg(context, async (tx) => {
			await tx.execute(sql`
				update "invitation" set "status" = 'cancelled', "resolved_at" = now()
				where "id" = ${invitationId} and "status" = 'pending'
			`);
			await record(tx, context.organizationId, context.userId, {
				action: 'invitation.cancel',
				targetTable: 'invitation',
				targetId: invitationId
			});
		});
		return { annulee: true };
	},

	retirer: async (event) => {
		const { request } = event;
		const context = await mustBeInOrganisation(event);
		if (!mustBeAdmin(context.role)) {
			return fail(403, { erreur: 'Seule une personne responsable peut retirer un membre.' });
		}
		const membershipId = String((await request.formData()).get('membershipId') ?? '');
		try {
			await withSessionOrg(context, async (tx) => {
				await tx.execute(sql`delete from "membership" where "id" = ${membershipId}`);
				await record(tx, context.organizationId, context.userId, {
					action: 'member.remove',
					targetTable: 'membership',
					targetId: membershipId
				});
			});
		} catch (error) {
			return fail(409, { erreur: derniereResponsable(error) });
		}
		return { retire: true };
	},

	role: async (event) => {
		const { request } = event;
		const context = await mustBeInOrganisation(event);
		if (!mustBeAdmin(context.role)) {
			return fail(403, { erreur: 'Seule une personne responsable peut changer un rôle.' });
		}
		const form = await request.formData();
		const membershipId = String(form.get('membershipId') ?? '');
		const role = String(form.get('role') ?? '');
		if (role !== 'org_admin' && role !== 'editor') {
			return fail(400, { erreur: 'Ce rôle n’existe pas.' });
		}
		try {
			await withSessionOrg(context, async (tx) => {
				await tx.execute(
					sql`update "membership" set "role" = ${role}, "updated_at" = now() where "id" = ${membershipId}`
				);
				await record(tx, context.organizationId, context.userId, {
					action: 'member.role',
					targetTable: 'membership',
					targetId: membershipId,
					after: { role }
				});
			});
		} catch (error) {
			return fail(409, { erreur: derniereResponsable(error) });
		}
		return { change: true };
	}
};

/**
 * La base refuse de laisser une organisation sans personne responsable (code `restrict_violation`).
 * On traduit ce refus précis ; tout autre échec est relancé, pour ne pas masquer une vraie erreur.
 */
function derniereResponsable(error: unknown): string {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
		if ((current as { code?: unknown }).code === '23001') {
			return 'Une organisation doit toujours garder au moins une personne responsable.';
		}
		current = (current as { cause?: unknown }).cause;
	}
	throw error;
}

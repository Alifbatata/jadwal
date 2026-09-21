// Après connexion : choisir son organisation, et répondre aux invitations reçues.
//
// Les invitations visibles ici sont celles adressées à l'adresse de la personne connectée, que le
// lien magique vient de prouver. Aucune organisation n'est en contexte à ce moment : la personne
// n'en est pas encore membre. C'est elle qui crée son adhésion en acceptant (ADR 0017).

import { fail, redirect } from '@sveltejs/kit';
import { newId, sql, withUser } from '@jadwal/db';
import { appDatabase } from '$lib/server/database.js';
import { chooseOrganisation, membershipsOf } from '$lib/server/context.js';
import { record } from '$lib/server/audit.js';
import type { Actions, PageServerLoad } from './$types.js';

interface InvitationRow {
	id: string;
	organization_id: string;
	role: 'org_admin' | 'editor';
	created_at: string;
	expires_at: string;
}

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

/** Les invitations en attente adressées à cette personne, avec le nom de l'organisation. */
async function pendingInvitations(userId: string) {
	return withUser(appDatabase(), userId, async (tx) =>
		rows<InvitationRow & { organisation: string }>(
			await tx.execute(sql`
				select i."id", i."organization_id", i."role", i."created_at"::text,
					i."expires_at"::text, o."name" as organisation
				from "invitation" i
				join "organization" o on o."id" = i."organization_id"
				where i."status" = 'pending' and i."expires_at" > now()
				order by i."created_at"
			`)
		)
	);
}

export const load: PageServerLoad = async ({ locals }) => {
	const person = locals.person;
	if (!person) redirect(303, '/connexion');
	return {
		memberships: await membershipsOf(person),
		invitations: (await pendingInvitations(person.userId)).map((invitation) => ({
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
			return fail(403, { erreur: 'Vous n’êtes pas membre de cette organisation.' });
		}
		redirect(303, '/');
	},

	accepter: async ({ request, locals }) => {
		const person = locals.person;
		if (!person) redirect(303, '/connexion');
		const form = await request.formData();
		const invitationId = String(form.get('invitationId') ?? '');
		const accepted = await withUser(appDatabase(), person.userId, async (tx) => {
			// L'ordre compte. La personne accepte d'abord : la politique de mise à jour la reconnaît
			// par son adresse, que le lien magique vient de prouver. C'est cette acceptation, et elle
			// seule, qui autorisera ensuite la création de l'adhésion (ADR 0017).
			const claimed = rows<{ organization_id: string; role: 'org_admin' | 'editor' }>(
				await tx.execute(sql`
					update "invitation"
					set "status" = 'accepted', "accepted_by" = ${person.userId}, "resolved_at" = now()
					where "id" = ${invitationId} and "status" = 'pending' and "expires_at" > now()
					returning "organization_id", "role"
				`)
			)[0];
			if (!claimed) return null;
			// Le contexte d'organisation est posé maintenant, et pas avant : la personne vient à
			// l'instant d'en devenir légitime.
			await tx.execute(sql`select set_config('jadwal.org_id', ${claimed.organization_id}, true)`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${claimed.organization_id}, ${person.userId}, ${claimed.role})
				on conflict ("organization_id", "user_id") do nothing
			`);
			await record(tx, claimed.organization_id, person.userId, {
				action: 'invitation.accept',
				targetTable: 'invitation',
				targetId: invitationId,
				after: { role: claimed.role }
			});
			return claimed.organization_id;
		});
		if (!accepted) return fail(404, { erreur: 'Cette invitation n’est plus valable.' });
		await chooseOrganisation(person, accepted);
		redirect(303, '/');
	}
};

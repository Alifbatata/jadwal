// Les membres d'une organisation et ses invitations en attente.
//
// Tout passe par `withSessionOrg` : le contexte vient de la session, jamais de la requête. Une
// personne qui écrirait l'identifiant d'une autre organisation dans son formulaire ne verrait rien,
// puisque le contexte n'est pas construit à partir de ce qu'elle envoie.
//
// Les actions rendent le nom d'une erreur, jamais sa phrase : la page l'écrit dans la langue de
// l'écran (`$lib/i18n/members.ts`, étape 18).

import { fail, redirect } from '@sveltejs/kit';
import type { IsoDate } from '@jadwal/core';
import { newId, sql } from '@jadwal/db';
import { isLangue, type Langue } from '$lib/i18n.js';
import { record } from '$lib/server/audit.js';
import { withSessionOrg } from '$lib/server/context.js';
import { mustAdminister, mustBeInOrganisation } from '$lib/server/guard.js';
import { createMailer } from '$lib/server/mail/index.js';
import { invitationEmail } from '$lib/server/mail/messages.js';
import type { Actions, PageServerLoad } from './$types.js';
import { SELF_EDITOR_ARRIVAL } from './self-editor.js';

/** Quatorze jours : assez pour une absence, assez court pour ne pas traîner. */
const INVITATION_DAYS = 14;
const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * La seule réponse que l'invitation sait donner, quelle que soit l'adresse (ADR 0017). La page
 * l'écrit dans sa langue ; elle ne dépend de rien d'autre que du geste.
 */
const INVITEE = { invitee: true } as const;

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

export const load: PageServerLoad = async (event) => {
	// Un `editor` n'entre pas ici : il saisit des cours, il n'ouvre ni ne ferme les accès.
	const context = await mustAdminister(event);

	// Les deux listes nomment l'organisation en contexte. Les politiques rendent aussi à la personne
	// connectée ses adhésions des autres organisations (migration 0022) et les invitations reçues à
	// son adresse (migration 0016) : sans ce filtre, elles s'affichaient ici, avec leurs boutons
	// (étape 17).
	return withSessionOrg(context, async (tx) => ({
		organisation: { nom: await organisationName(tx), slug: context.organizationSlug },
		role: context.role,
		moi: context.userId,
		invitationDays: INVITATION_DAYS,
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
				where m."organization_id" = ${context.organizationId}
				order by m."role", u."email"
			`)
		),
		// Une invitation en attente n'affiche que ce que le responsable a saisi : l'adresse, le rôle,
		// le jour de l'envoi et le dernier jour où elle vaut. Jamais un nom venu d'un compte existant.
		// Les deux jours sont ceux du fuseau de l'organisation, que la page écrit JJ.MM.AAAA (A3).
		invitations: rows<{
			id: string;
			email: string;
			role: string;
			sent_on: IsoDate;
			expires_on: IsoDate;
		}>(
			await tx.execute(sql`
				select i."id", i."email", i."role",
					to_char(i."created_at" at time zone o."time_zone", 'YYYY-MM-DD') as "sent_on",
					to_char(i."expires_at" at time zone o."time_zone", 'YYYY-MM-DD') as "expires_on"
				from "invitation" i join "organization" o on o."id" = i."organization_id"
				where i."organization_id" = ${context.organizationId}
					and i."status" = 'pending' and i."expires_at" > now()
				order by i."created_at"
			`)
		)
	}));
};

/**
 * Le nom de l'organisation en contexte. Ce filtre est la première barrière, et non une défense de
 * second rang : pour le rôle applicatif, la politique de lecture des organisations rend aussi toute
 * organisation qui invite la personne connectée (migration 0023). Sans lui, l'écran et le courriel
 * d'invitation pourraient nommer celle-ci. Le super-admin ne voit que l'organisation en contexte
 * depuis la migration 0055 ; avant, il les voyait toutes, et l'invitation envoyée depuis la seconde
 * nommait la première (`readSettings` le dit aussi).
 */
async function organisationName(tx: Parameters<Parameters<typeof withSessionOrg>[1]>[0]) {
	const found = rows<{ name: string }>(
		await tx.execute(
			sql`select "name" from "organization" where "id" = (select jadwal.current_org_id())`
		)
	);
	return found[0]?.name ?? '';
}

/**
 * Seule une personne responsable administre les membres, avec le super-admin, qui entre partout
 * depuis l'étape 4 (ADR 0025). Un `editor` saisit des cours, il n'ouvre ni ne ferme les accès.
 */
function mustBeAdmin(role: string) {
	return role === 'org_admin' || role === 'superadmin';
}

export const actions: Actions = {
	inviter: async (event) => {
		const { request, url, locals } = event;
		const context = await mustBeInOrganisation(event);
		if (!mustBeAdmin(context.role)) {
			return fail(403, { error: 'notManager' as const });
		}
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const role = String(form.get('role') ?? 'editor');
		// La langue du courriel, choisie dans le formulaire (étape 19) : celle de l'écran quand le
		// formulaire n'en envoie pas, ou en envoie une que le service ne parle pas. Elle vient de la
		// personne qui invite, jamais d'un compte lu par l'adresse invitée (ADR 0017).
		const choisie = String(form.get('emailLanguage') ?? '');
		const language: Langue = isLangue(choisie) ? choisie : (locals.langue ?? 'fr');
		// L'adresse, le rôle et la langue saisis reviennent au formulaire : sans JavaScript, la page
		// renvoyée les aurait perdus, et la personne devait tout retaper pour une faute de frappe.
		if (!ADRESSE.test(email)) {
			return fail(400, { error: 'invalidEmail' as const, email, role, language });
		}
		if (role !== 'org_admin' && role !== 'editor') {
			return fail(400, { error: 'unknownRole' as const, email, role: 'editor', language });
		}

		// Aucune consultation des comptes : on enregistre l'invitation et on envoie le message. Il
		// n'y a donc aucune branche qui puisse dépendre de l'existence d'un compte, ni par le
		// message, ni par le temps de réponse (ADR 0017).
		const invitationId = newId();
		await withSessionOrg(context, async (tx) => {
			// Une invitation encore en attente pour cette adresse, échue ou non, est close d'abord, et
			// la nouvelle la remplace. L'index des invitations en attente n'en admet qu'une par adresse,
			// échues comprises : sans cela, l'insertion ne faisait rien, et l'écran disait « envoyée »
			// pour une invitation que personne ne voyait, ou qui gardait son ancien rôle (étape 17).
			// Seules les invitations de cette organisation sont touchées, et aucun compte n'est lu : la
			// réponse reste la même, mot pour mot.
			const remplacees = rows<{ id: string }>(
				await tx.execute(sql`
					update "invitation" set "status" = 'cancelled', "resolved_at" = now()
					where "organization_id" = ${context.organizationId}
						and lower("email") = lower(${email}) and "status" = 'pending'
					returning "id"
				`)
			);
			for (const remplacee of remplacees) {
				await record(tx, context.organizationId, context.userId, {
					action: 'invitation.cancel',
					targetTable: 'invitation',
					targetId: remplacee.id,
					after: { replacedBy: invitationId }
				});
			}
			// La fin se compte en heures, comme la borne de la base (migration 0056) : quatorze jours de
			// calendrier, dans un fuseau qui passe à l'heure d'hiver, font 337 heures, et la base les
			// refusait.
			// Il ne reste de conflit possible qu'avec une invitation envoyée au même instant, qui vaut
			// alors pour celle-ci.
			const creee = rows<{ id: string }>(
				await tx.execute(sql`
					insert into "invitation" ("id", "organization_id", "email", "role", "invited_by", "expires_at")
					values (${invitationId}, ${context.organizationId}, ${email}, ${role}, ${context.userId},
						now() + make_interval(hours => ${INVITATION_DAYS} * 24))
					on conflict do nothing
					returning "id"
				`)
			);
			if (creee.length === 0) return;
			await record(tx, context.organizationId, context.userId, {
				action: 'invitation.create',
				targetTable: 'invitation',
				targetId: invitationId,
				after: { email, role }
			});
		});
		const organisation = await withSessionOrg(context, organisationName);
		// La langue que la personne qui invite a choisie, celle de son écran d'abord : lire celle du
		// compte invité demanderait de le chercher par son adresse, ce que ce chemin ne fait jamais
		// (ADR 0017). Le choix ne change ni la réponse, ni le chemin suivi : les mêmes requêtes, pour
		// toute adresse, dans toute langue.
		await createMailer().send(invitationEmail(email, organisation, url.origin, language));
		return INVITEE;
	},

	annuler: async (event) => {
		const { request } = event;
		const context = await mustBeInOrganisation(event);
		if (!mustBeAdmin(context.role)) {
			return fail(403, { error: 'notManager' as const });
		}
		const invitationId = String((await request.formData()).get('invitationId') ?? '');
		await withSessionOrg(context, async (tx) => {
			// L'organisation est nommée : la politique laisse aussi la personne connectée modifier les
			// invitations reçues à son adresse. Depuis cet écran, elle annulait une invitation d'une
			// autre organisation (étape 17). Le journal ne consigne que ce qui a changé.
			const annulees = rows<{ id: string }>(
				await tx.execute(sql`
					update "invitation" set "status" = 'cancelled', "resolved_at" = now()
					where "id" = ${invitationId} and "organization_id" = ${context.organizationId}
						and "status" = 'pending'
					returning "id"
				`)
			);
			if (annulees.length === 0) return;
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
			return fail(403, { error: 'notManager' as const });
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
			return fail(409, { error: derniereResponsable(error) });
		}
		return { retire: true };
	},

	role: async (event) => {
		const { request } = event;
		const context = await mustBeInOrganisation(event);
		if (!mustBeAdmin(context.role)) {
			return fail(403, { error: 'notManager' as const });
		}
		const form = await request.formData();
		const membershipId = String(form.get('membershipId') ?? '');
		const role = String(form.get('role') ?? '');
		if (role !== 'org_admin' && role !== 'editor') {
			return fail(400, { error: 'unknownRole' as const });
		}
		let soiMeme = false;
		try {
			await withSessionOrg(context, async (tx) => {
				const changees = rows<{ user_id: string }>(
					await tx.execute(
						sql`update "membership" set "role" = ${role}, "updated_at" = now() where "id" = ${membershipId} returning "user_id"`
					)
				);
				soiMeme = changees.some((ligne) => ligne.user_id === context.userId);
				await record(tx, context.organizationId, context.userId, {
					action: 'member.role',
					targetTable: 'membership',
					targetId: membershipId,
					after: { role }
				});
			});
		} catch (error) {
			return fail(409, { error: derniereResponsable(error) });
		}
		// Une responsable qui se donne le rôle d'éditeur ne peut plus ouvrir cet écran : elle va sur
		// « À venir », où la coquille lui dit ce qui s'est passé (`self-editor.ts`).
		if (soiMeme && role === 'editor') redirect(303, SELF_EDITOR_ARRIVAL);
		// Le nouveau rôle revient à la page, qui le nomme dans son message.
		return { change: true, role };
	}
};

/**
 * La base refuse de laisser une organisation sans personne responsable (code `restrict_violation`).
 * On nomme ce refus précis ; tout autre échec est relancé, pour ne pas masquer une vraie erreur.
 */
function derniereResponsable(error: unknown): 'lastManager' {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
		if ((current as { code?: unknown }).code === '23001') {
			return 'lastManager';
		}
		current = (current as { cause?: unknown }).cause;
	}
	throw error;
}

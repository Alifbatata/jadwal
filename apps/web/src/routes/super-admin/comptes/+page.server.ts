// La vue du super-admin sur les comptes de toutes les organisations (étape 25, ADR 0058).
//
// L'inscription est ouverte à tous : le super-admin, qui gère toutes les mosquées et tous les
// comptes, voit ici chaque compte, ouvert seul ou sur invitation, avec ses organisations, son rôle et
// son autorisation de diffuser. L'écran ne change rien ; pour agir dans une organisation, il y entre,
// par l'action de la console.
//
// Il lit les comptes et les organisations comme la console, sans organisation en contexte. Les
// adhésions de toutes les organisations sortent par `jadwal.all_memberships()` (migration 0086) :
// sa propre politique ne lui montre que celles de l'organisation où il est entré, et elle le reste.
// Chaque ouverture de l'écran est inscrite au registre des accès par `hooks.server.ts`, comme toute
// requête d'un super-admin en exercice.

import { fail } from '@sveltejs/kit';
import { setOrgContext, sql, type Database } from '@jadwal/db';
import type { IsoDate } from '@jadwal/core';
import { record } from '#lib/server/audit.js';
import { superAdminDatabase } from '#lib/server/database.js';
import { mustBeSuperAdmin } from '#lib/server/guard.js';
import { DEFAULT_TIME_ZONE } from '../time-zones.server.js';
import type { Actions, PageServerLoad } from './$types.js';

/** Un identifiant de compte. Autre chose n'atteint pas la base : c'est un compte qui n'existe pas. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La base a refusé la suppression : ce qu'elle a dit, rendu tel quel à l'écran. */
class Refused extends Error {
	constructor(readonly outcome: string) {
		super(outcome);
	}
}

/** Le code SQLSTATE d'une erreur du pilote, lu dans la cause comme ailleurs dans le dépôt. */
function codeSql(error: unknown): string | undefined {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
		const code = (current as { code?: unknown }).code;
		if (typeof code === 'string') return code;
		current = (current as { cause?: unknown }).cause;
	}
	return undefined;
}

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

type Role = 'org_admin' | 'editor';

export interface AccountOrganisation {
	id: string;
	name: string;
	role: Role;
	canBroadcast: boolean;
}

export interface Account {
	id: string;
	email: string;
	name: string | null;
	superAdmin: boolean;
	openedOn: IsoDate;
	organisations: AccountOrganisation[];
}

export const load: PageServerLoad = async (event) => {
	mustBeSuperAdmin(event);
	const db = superAdminDatabase();
	// La date d'ouverture est une date civile, dans le fuseau de la console, comme celle des demandes
	// d'accès.
	const users = rows<{
		id: string;
		email: string;
		name: string | null;
		is_super_admin: boolean;
		opened_on: IsoDate;
	}>(
		await db.execute(sql`
			select "id", "email", "name", "is_super_admin",
				to_char("created_at" at time zone ${DEFAULT_TIME_ZONE}, 'YYYY-MM-DD') as "opened_on"
			from "user" order by lower("email"), "id"
		`)
	);
	const organisations = new Map(
		rows<{ id: string; name: string }>(
			await db.execute(sql`select "id", "name" from "organization"`)
		).map((row) => [row.id, row.name])
	);
	const byUser = new Map<string, AccountOrganisation[]>();
	for (const membership of rows<{
		user_id: string;
		organization_id: string;
		role: Role;
		can_broadcast: boolean;
	}>(
		await db.execute(sql`
			select "user_id", "organization_id", "role", "can_broadcast" from jadwal.all_memberships()
		`)
	)) {
		const list = byUser.get(membership.user_id) ?? [];
		list.push({
			id: membership.organization_id,
			name: organisations.get(membership.organization_id) ?? '',
			role: membership.role,
			canBroadcast: membership.can_broadcast
		});
		byUser.set(membership.user_id, list);
	}
	const accounts: Account[] = users.map((user) => ({
		id: user.id,
		email: user.email,
		name: user.name,
		superAdmin: user.is_super_admin,
		openedOn: user.opened_on,
		organisations: (byUser.get(user.id) ?? []).sort((a, b) => a.name.localeCompare(b.name))
	}));
	return {
		accounts,
		alone: accounts.filter((account) => account.organisations.length === 0).length
	};
};

/** Le compte visé par une suppression, ses adhésions, et celles où il est seul responsable. */
async function target(db: Database, userId: string) {
	const [user] = rows<{ email: string; is_super_admin: boolean }>(
		await db.execute(sql`select "email", "is_super_admin" from "user" where "id" = ${userId}`)
	);
	if (!user) return null;
	const all = rows<{
		user_id: string;
		organization_id: string;
		role: Role;
		can_broadcast: boolean;
	}>(
		await db.execute(sql`
			select "user_id", "organization_id", "role", "can_broadcast" from jadwal.all_memberships()
		`)
	);
	const names = new Map(
		rows<{ id: string; name: string }>(
			await db.execute(sql`select "id", "name" from "organization"`)
		).map((row) => [row.id, row.name])
	);
	const own = all.filter((membership) => membership.user_id === userId);
	const alone = own
		.filter(
			(membership) =>
				membership.role === 'org_admin' &&
				!all.some(
					(other) =>
						other.organization_id === membership.organization_id &&
						other.role === 'org_admin' &&
						other.user_id !== userId
				)
		)
		.map((membership) => names.get(membership.organization_id) ?? '');
	return {
		email: user.email,
		superAdmin: user.is_super_admin,
		memberships: own,
		organisations: own.map((membership) => names.get(membership.organization_id) ?? '').sort(),
		alone: alone.sort()
	};
}

export const actions: Actions = {
	/**
	 * Supprimer un compte (ADR 0058 amendée) : le super-admin peut tout faire, dit le chef de
	 * projet. Le premier envoi rend la confirmation, avec l'adresse et les organisations du compte ;
	 * le second, qui porte `confirm=yes`, supprime. Rien ne part pour un compte de l'exploitant, ni
	 * pour la dernière personne responsable d'une organisation, et l'écran dit lesquelles.
	 *
	 * Une seule transaction : une entrée dans le journal de chaque organisation du compte, signée du
	 * super-admin et posée dans le contexte de cette organisation (la base n'en accepte pas
	 * d'autre), puis `jadwal.delete_account` (migration 0087). Si la base refuse, le journal
	 * n'écrit rien.
	 */
	supprimer: async (event) => {
		const person = mustBeSuperAdmin(event);
		const form = await event.request.formData();
		const userId = String(form.get('userId') ?? '');
		const confirme = String(form.get('confirm') ?? '') === 'yes';
		if (!UUID.test(userId)) return fail(404, { removeError: 'gone' as const });
		const db = superAdminDatabase();
		const found = await target(db, userId);
		if (!found) return fail(404, { removeError: 'gone' as const });
		if (found.superAdmin) return fail(409, { removeError: 'superAdmin' as const });
		if (found.alone.length > 0) {
			return fail(409, { removeError: 'lastManager' as const, lastManagerOf: found.alone });
		}
		if (!confirme) {
			return {
				toConfirm: { userId, email: found.email, organisations: found.organisations }
			};
		}
		try {
			await db.transaction(async (tx) => {
				for (const membership of found.memberships) {
					await setOrgContext(tx, {
						organizationId: membership.organization_id,
						userId: person.userId
					});
					await record(tx, membership.organization_id, person.userId, {
						action: 'account.delete',
						targetTable: 'user',
						targetId: userId,
						before: {
							email: found.email,
							role: membership.role,
							canBroadcast: membership.can_broadcast
						}
					});
				}
				const [outcome] = rows<{ outcome: string }>(
					await tx.execute(sql`select jadwal.delete_account(${userId}) as "outcome"`)
				);
				if (outcome?.outcome !== 'deleted') throw new Refused(outcome?.outcome ?? 'gone');
			});
		} catch (cause) {
			// Entre la lecture et la suppression, une autre transaction a pu changer la donne : la
			// base le dit, et son déclencheur de la dernière personne responsable aussi.
			if (cause instanceof Refused && cause.outcome === 'gone') {
				return fail(404, { removeError: 'gone' as const });
			}
			if (cause instanceof Refused && cause.outcome === 'super_admin') {
				return fail(409, { removeError: 'superAdmin' as const });
			}
			if (
				(cause instanceof Refused && cause.outcome === 'last_org_admin') ||
				codeSql(cause) === '23001'
			) {
				const again = await target(db, userId);
				return fail(409, {
					removeError: 'lastManager' as const,
					lastManagerOf: again?.alone ?? []
				});
			}
			throw cause;
		}
		return { removed: found.email };
	}
};

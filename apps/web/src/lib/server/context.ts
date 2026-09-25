// Le seul chemin entre une session vérifiée et les données d'une organisation.
//
// Le contexte d'organisation ne vient jamais de la requête : ni d'un paramètre d'URL, ni d'un
// en-tête, ni du corps. Il vient de la session, relue côté serveur à chaque requête, et
// l'appartenance est revérifiée à chaque fois. Une valeur falsifiée ne donne donc accès à rien :
// même si quelqu'un écrivait l'identifiant d'une autre organisation dans la session, la
// vérification d'appartenance la rejetterait, et la sécurité au niveau des lignes ne rendrait rien.
//
// Depuis l'étape 4, un second chemin existe, et il n'est pas gardé par l'appartenance : le
// super-admin entre dans l'organisation qu'il veut (ADR 0025). Le contexte reste obligatoire pour
// lui aussi — la base n'accorde rien hors de lui — mais sa condition n'est plus « être membre »,
// c'est « avoir prouvé une passkey ». Ce fichier est l'endroit où cette différence est écrite.

import { appDatabase, authDatabase, superAdminDatabase } from './database.js';
import { auth } from './auth.js';
import { versionIso as versionDesConditions } from './conditions.js';
import { MEMBERSHIP_ROLES, newId, sql, withOrg, withUser, type Transaction } from '@jadwal/db';

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/** Douze heures : une session de super-admin ne dure pas plus, et ne se renouvelle pas (ADR 0025). */
export const SUPER_ADMIN_SESSION_HOURS = 12;

export interface SignedIn {
	userId: string;
	email: string;
	name: string | null;
	/** Le compte porte le drapeau. Il ne suffit pas : voir `hasSuperAdminPowers`. */
	isSuperAdmin: boolean;
	/**
	 * Le drapeau **et** une session ouverte par passkey. C'est cette valeur, et elle seule, qui
	 * ouvre les écrans et les écritures de super-admin.
	 */
	hasSuperAdminPowers: boolean;
	/** Vrai quand le compte est super-admin mais n'a encore enregistré aucune passkey. */
	needsPasskey: boolean;
	sessionToken: string;
}

export interface OrganisationContext extends SignedIn {
	organizationId: string;
	organizationSlug: string;
	organizationName: string;
	/** La couleur d'accent, portée par le contexte pour que la coquille l'ait sans requête de plus. */
	organizationAccent: string;
	/** Le module des heures de prière, pour que la navigation sache quoi proposer (ADR 0042). */
	organizationPrayerModule: boolean;
	/** `superadmin` quand la personne n'est pas membre mais entre par ses pouvoirs. */
	role: MembershipRole | 'superadmin';
	/** Vrai quand la connexion à utiliser est celle du super-admin, pas celle de l'application. */
	asSuperAdmin: boolean;
	/**
	 * La personne a accepté la version en cours des conditions d'utilisation dans cette organisation
	 * (ADR 0044). Tant que c'est faux, la porte de l'espace la renvoie vers `/conditions/accepter`.
	 * Toujours vrai pour un compte super-admin, membre ou non : l'exploitant n'y est pas soumis.
	 */
	termsAccepted: boolean;
	/**
	 * Le nombre d'organisations dont la personne est membre, lu sans requête de plus : le contexte
	 * les parcourt déjà pour trouver la sienne. À partir de deux, la coquille propose d'en changer.
	 */
	membershipCount: number;
	/**
	 * Le nombre d'invitations en attente adressées à la personne, qui courent encore : celles que
	 * l'écran « Vos organisations » lui propose d'accepter, lues par la même fonction, soit une
	 * requête de plus par contexte. Avec une invitation qui attend, la coquille propose ce choix
	 * même à qui n'a qu'une organisation : c'est sur cet écran qu'elle l'accepte.
	 */
	pendingInvitationCount: number;
}

function firstRow<T>(result: unknown): T | undefined {
	if (Array.isArray(result)) return result[0] as T | undefined;
	const rows = (result as { rows?: unknown[] }).rows;
	return Array.isArray(rows) ? (rows[0] as T | undefined) : undefined;
}

function allRows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const rows = (result as { rows?: unknown[] }).rows;
	return Array.isArray(rows) ? (rows as T[]) : [];
}

/** Qui est connecté, d'après la session seule. `null` si personne. */
export async function signedIn(headers: Headers): Promise<SignedIn | null> {
	const found = await auth().api.getSession({ headers });
	if (!found) return null;
	const db = authDatabase();
	const row = firstRow<{ is_super_admin: boolean; email: string; name: string | null }>(
		await db.execute(
			sql`select "email", "name", "is_super_admin" from "user" where "id" = ${found.user.id}`
		)
	);
	if (!row) return null;
	const session = firstRow<{ passkey_verified_at: Date | null; age_hours: number }>(
		await db.execute(sql`
			select "passkey_verified_at",
				extract(epoch from (now() - "created_at")) / 3600 as age_hours
			from "session" where "token" = ${found.session.token}
		`)
	);
	if (!session) return null;

	if (row.is_super_admin && Number(session.age_hours) >= SUPER_ADMIN_SESSION_HOURS) {
		// Le plafond est mesuré depuis la création, que Better Auth ne touche jamais : il ne peut
		// donc pas être repoussé par l'usage. Un `databaseHook` ne pouvait pas le porter, sa
		// documentation dit qu'un `before` de création de session ne change pas `expiresAt`.
		await db.execute(sql`delete from "session" where "token" = ${found.session.token}`);
		return null;
	}

	const passkeys = firstRow<{ n: number }>(
		await db.execute(
			sql`select count(*)::int as n from "passkey" where "user_id" = ${found.user.id}`
		)
	);
	return {
		userId: found.user.id,
		email: row.email,
		name: row.name,
		isSuperAdmin: row.is_super_admin,
		hasSuperAdminPowers: row.is_super_admin && session.passkey_verified_at !== null,
		needsPasskey: row.is_super_admin && (passkeys?.n ?? 0) === 0,
		sessionToken: found.session.token
	};
}

/** Le compte a-t-il au moins une passkey ? Sert à la règle d'amorçage (ADR 0025). */
export async function passkeyCount(userId: string): Promise<number> {
	const row = firstRow<{ n: number }>(
		await authDatabase().execute(
			sql`select count(*)::int as n from "passkey" where "user_id" = ${userId}`
		)
	);
	return row?.n ?? 0;
}

export interface Membership {
	organizationId: string;
	organizationSlug: string;
	organizationName: string;
	/** Lue en même temps que le nom : la coquille en a besoin à chaque page (ADR 0031). */
	organizationAccent: string;
	/** Lu de même, et pour la même raison : la navigation en dépend (ADR 0042). */
	organizationPrayerModule: boolean;
	role: MembershipRole;
}

/**
 * Les organisations dont cette personne est membre. La lecture passe par le contexte de chaque
 * organisation à tour de rôle : il n'existe aucune requête qui verrait tout d'un coup, et c'est
 * voulu. On part de la table d'adhésion, lue sous le contexte de l'organisation candidate.
 *
 * Les deux lectures nomment l'organisation candidate. Le contexte ne suffit pas à les borner : la
 * politique des adhésions rend aussi à la personne ses lignes des autres organisations (migration
 * 0022), et celle des organisations, celles qui l'invitent (migration 0023). Sans filtre, la
 * première ligne venue répondait : une responsable d'une organisation, éditrice d'une autre, était
 * traitée en responsable dans les deux, et l'organisation qui invite prêtait son nom, sa couleur et
 * son module à celle de la session (étape 17).
 */
export async function membershipsOf(person: SignedIn): Promise<Membership[]> {
	// Une transaction qui ne pose que la personne : à ce moment-là il n'y a pas encore
	// d'organisation à poser, et la politique d'adhésion laisse chacun voir les siennes.
	const candidates = await withUser(appDatabase(), person.userId, async (tx) =>
		allRows<{ organization_id: string }>(
			await tx.execute(sql`select "organization_id" from "membership"`)
		).map((row) => row.organization_id)
	);
	const memberships: Membership[] = [];
	for (const organizationId of candidates) {
		const found = await withOrg(
			appDatabase(),
			{ organizationId, userId: person.userId },
			async (tx) => {
				const organisation = firstRow<{
					slug: string;
					name: string;
					accent_color: string;
					prayer_module: boolean;
				}>(
					await tx.execute(
						sql`select "slug", "name", "accent_color", "prayer_module" from "organization"
							where "id" = ${organizationId}`
					)
				);
				const membership = firstRow<{ role: MembershipRole }>(
					await tx.execute(
						sql`select "role" from "membership"
							where "user_id" = ${person.userId} and "organization_id" = ${organizationId}`
					)
				);
				return organisation && membership
					? {
							organizationId,
							organizationSlug: organisation.slug,
							organizationName: organisation.name,
							organizationAccent: organisation.accent_color,
							organizationPrayerModule: organisation.prayer_module,
							role: membership.role
						}
					: undefined;
			}
		);
		if (found) memberships.push(found);
	}
	return memberships.sort((left, right) =>
		left.organizationName.localeCompare(right.organizationName, 'fr')
	);
}

/** Une invitation en attente adressée à la personne, avec le nom de l'organisation qui invite. */
export interface PendingInvitation {
	id: string;
	organization_id: string;
	role: 'org_admin' | 'editor';
	created_at: string;
	expires_at: string;
	organisation: string;
}

/**
 * Les invitations en attente adressées à cette personne, qui courent encore. La lecture ne pose
 * que la personne : elle n'est pas membre des organisations qui l'invitent, et c'est son adresse,
 * prouvée par le lien magique, qui les lui montre (ADR 0017).
 *
 * L'écran « Vos organisations » les liste, et le contexte les compte par cette même fonction : la
 * coquille ne propose jamais d'aller sur cet écran pour une invitation qu'il ne montrerait pas.
 */
export async function pendingInvitationsOf(person: SignedIn): Promise<PendingInvitation[]> {
	return withUser(appDatabase(), person.userId, async (tx) =>
		allRows<PendingInvitation>(
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

/** L'identifiant d'organisation posé sur la session, s'il y en a un. */
async function activeOrganizationId(person: SignedIn): Promise<string | null> {
	const row = firstRow<{ active_organization_id: string | null }>(
		await authDatabase().execute(
			sql`select "active_organization_id" from "session" where "token" = ${person.sessionToken}`
		)
	);
	return row?.active_organization_id ?? null;
}

/**
 * La personne a-t-elle accepté la version en cours des conditions dans cette organisation ?
 *
 * Sans requête pour un compte super-admin, même membre : c'est l'exploitant, et c'est lui qui propose
 * ce texte (ADR 0044). La lecture pose l'organisation **et** la personne : la politique ne montre à
 * chacun que ses propres acceptations, et l'organisation seule ne verrait rien.
 */
async function hasAcceptedTerms(person: SignedIn, organizationId: string): Promise<boolean> {
	if (person.isSuperAdmin) return true;
	return withOrg(appDatabase(), { organizationId, userId: person.userId }, async (tx) => {
		const row = firstRow<{ accepted: boolean }>(
			await tx.execute(sql`
				select exists (
					select 1 from "terms_acceptance"
					where "organization_id" = ${organizationId}
						and "user_id" = ${person.userId} and "version" = ${versionDesConditions}
				) as accepted
			`)
		);
		return row?.accepted === true;
	});
}

/** L'organisation choisie pour cette session, si elle en a une et que l'appartenance tient. */
export async function currentOrganisation(person: SignedIn): Promise<OrganisationContext | null> {
	const active = await activeOrganizationId(person);
	const memberships = await membershipsOf(person);
	// Une seule organisation : pas de choix à faire, et rien à stocker. Sauf pour le super-admin qui
	// en a posé une autre par ses pouvoirs : son choix l'emporte, sans quoi il retombait dans la
	// sienne à chaque requête et n'entrait jamais ailleurs (étape 17). Une personne ordinaire retirée
	// de l'organisation choisie retombe, elle, dans celle qui lui reste.
	const choisieAilleurs = person.hasSuperAdminPowers && active !== null;
	const chosen =
		memberships.find((entry) => entry.organizationId === active) ??
		(memberships.length === 1 && !choisieAilleurs ? memberships[0] : undefined);
	if (chosen) {
		return {
			...person,
			...chosen,
			asSuperAdmin: false,
			termsAccepted: await hasAcceptedTerms(person, chosen.organizationId),
			membershipCount: memberships.length,
			pendingInvitationCount: (await pendingInvitationsOf(person)).length
		};
	}

	// Pas membre : reste le chemin du super-admin, qui entre où il veut une fois sa passkey
	// prouvée. Sans pouvoir, il n'entre nulle part — un lien magique ne suffit pas (ADR 0025).
	if (!person.hasSuperAdminPowers || !active) return null;
	const visited = firstRow<{
		slug: string;
		name: string;
		accent_color: string;
		prayer_module: boolean;
	}>(
		await superAdminDatabase().execute(
			sql`select "slug", "name", "accent_color", "prayer_module"
				from "organization" where "id" = ${active}`
		)
	);
	if (!visited) return null;
	return {
		...person,
		organizationId: active,
		organizationSlug: visited.slug,
		organizationName: visited.name,
		organizationAccent: visited.accent_color,
		organizationPrayerModule: visited.prayer_module,
		role: 'superadmin',
		asSuperAdmin: true,
		// L'exploitant n'accepte pas ses propres conditions (ADR 0044).
		termsAccepted: true,
		membershipCount: memberships.length,
		// Compté pour lui comme pour tout le monde, pour que le nombre dise vrai : c'est la coquille
		// qui ne lui propose pas le choix des membres, puisqu'il a le lien de sa bannière.
		pendingInvitationCount: (await pendingInvitationsOf(person)).length
	};
}

/**
 * Pose le choix de l'organisation sur la session. L'appartenance est vérifiée d'abord — sauf pour
 * un super-admin qui a prouvé sa passkey, pour qui toute organisation est ouverte (ADR 0025).
 */
export async function chooseOrganisation(
	person: SignedIn,
	organizationId: string
): Promise<boolean> {
	const memberships = await membershipsOf(person);
	let allowed = memberships.some((entry) => entry.organizationId === organizationId);
	if (!allowed && person.hasSuperAdminPowers) {
		allowed =
			firstRow<{ id: string }>(
				await superAdminDatabase().execute(
					sql`select "id" from "organization" where "id" = ${organizationId}`
				)
			) !== undefined;
	}
	if (!allowed) return false;
	await authDatabase().execute(
		sql`update "session" set "active_organization_id" = ${organizationId}
			where "token" = ${person.sessionToken}`
	);
	return true;
}

/**
 * Ouvre une transaction dans le contexte de l'organisation de la session. C'est le seul chemin par
 * lequel une route touche aux données d'une organisation — pour un responsable comme pour un
 * super-admin. Seule la connexion change, et donc les politiques qui s'appliquent.
 */
export async function withSessionOrg<T>(
	context: OrganisationContext,
	callback: (tx: Transaction, context: OrganisationContext) => Promise<T>
): Promise<T> {
	return withOrg(
		context.asSuperAdmin ? superAdminDatabase() : appDatabase(),
		{ organizationId: context.organizationId, userId: context.userId },
		(tx) => callback(tx, context)
	);
}

/** Ce que le registre interne sait distinguer (ADR 0025). */
export type AdminAccessAction = 'read' | 'write' | 'magic_link';

/**
 * Écrit une entrée dans le registre interne des accès du super-admin. Une entrée par requête, pas
 * une par ligne lue. L'organisation visitée n'y a accès ni directement ni indirectement : aucun
 * droit n'est accordé au rôle applicatif sur cette table.
 *
 * Elle n'écrit rien dans le journal de l'organisation : une consultation ne s'y voit pas, et c'est
 * une décision assumée, dont `docs/CONDITIONS.md` informe les organisations.
 */
export async function recordAdminAccess(
	person: SignedIn,
	action: AdminAccessAction,
	route: string,
	organisation?: { id: string; slug: string } | undefined
): Promise<void> {
	await superAdminDatabase().execute(sql`
		insert into "admin_access_log"
			("id", "organization_id", "organization_slug", "actor_id", "action", "route")
		values (${newId()}, ${organisation?.id ?? null}, ${organisation?.slug ?? null},
			${person.userId}, ${action}, ${route})
	`);
}

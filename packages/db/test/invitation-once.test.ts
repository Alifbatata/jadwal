// Une invitation ne vaut qu'une fois, et l'adhésion qui en naît porte le rôle qu'elle nomme.
//
// L'ADR 0017 le promettait et l'écran le tenait, mais la base, non. La relecture de l'étape 17 a
// trouvé deux trous dans le modèle d'appel direct que vise déjà la migration 0057 : une requête
// tapée sous le rôle applicatif, hors de l'écran.
// - Une personne invitée comme éditrice acceptait, puis créait elle-même une adhésion de
//   responsable : ni `jadwal.invited` ni la politique d'adhésion ne regardaient le rôle.
// - Une personne déjà membre, réinvitée, acceptait, et rien ne consommait l'invitation. Retirée
//   ensuite, elle se remettait seule dans l'organisation, tant que l'invitation courait.
// La migration 0058 ferme les deux. Elle tient aussi les passages de statut, sans lesquels une
// invitation consommée repassait à « accepted » : `invitation-status.test.ts` les éprouve.
//
// Limite. Pour le rôle applicatif, la base ne sépare pas l'éditeur du responsable à l'intérieur d'une
// organisation : toute personne qui a le contexte de l'organisation peut, par un appel direct,
// s'écrire une invitation, de n'importe quel rôle, à sa propre adresse, l'accepter et adhérer avec ce
// rôle, comme elle peut changer le rôle d'une adhésion, le sien compris (migration 0053). Ce fichier
// éprouve donc la promesse d'une invitation donnée, pas la séparation des rôles.
//
// Tout passe par les rôles de connexion, non privilégiés. Le propriétaire ne sert qu'à poser le
// décor et à relire ce qui est réellement en base.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, withOrg, withUser, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
	firstRow,
	joinOrganisation,
	messageOfFailure,
	openDatabase,
	seedOrganisation,
	withMaintenance,
	type Organisation
} from './helpers.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const MIGRATION = '0058_invitation_role_and_single_use.sql';
const RLS_MEMBERSHIP = 'row-level security policy for table "membership"';

type Role = 'org_admin' | 'editor';

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let owner: Database;
let app: Database;
let org: Organisation;

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	owner = ownerHandle.db;
	app = appHandle.db;
	org = await seedOrganisation(owner, 'une-fois');
});

afterAll(async () => {
	await appHandle?.close();
	await ownerHandle?.close();
});

/** Un compte sans organisation, créé par le propriétaire. */
async function account(): Promise<{ id: string; email: string }> {
	const id = newId();
	const email = `une-fois-${id}@example.test`;
	await withMaintenance(owner, (tx) =>
		tx.execute(sql`insert into "user" ("id", "email") values (${id}, ${email})`)
	);
	return { id, email };
}

/** Un compte déjà membre, entré par le chemin réel : invitation, acceptation, adhésion. */
async function member(role: Role): Promise<{ id: string; email: string }> {
	const person = await account();
	await joinOrganisation(owner, app, org.id, person.id, person.email, role);
	return person;
}

/** La personne responsable invite, avec l'insertion de l'écran des membres. Rend l'invitation. */
async function invite(email: string, role: Role): Promise<string> {
	const id = newId();
	await withOrg(app, { organizationId: org.id, userId: org.userId }, (tx) =>
		tx.execute(sql`
			insert into "invitation" ("id", "organization_id", "email", "role", "invited_by", "expires_at")
			values (${id}, ${org.id}, ${email}, ${role}, ${org.userId},
				now() + make_interval(hours => 14 * 24))
		`)
	);
	return id;
}

/** La personne invitée accepte par un appel direct, sans adhérer dans la même transaction. */
async function accept(id: string, userId: string): Promise<void> {
	await withUser(app, userId, (tx) =>
		tx.execute(sql`
			update "invitation"
			set "status" = 'accepted', "accepted_by" = ${userId}, "resolved_at" = now()
			where "id" = ${id}
		`)
	);
}

/** La personne crée elle-même son adhésion, avec le rôle qu'elle choisit : l'appel direct. */
async function selfJoin(userId: string, role: Role): Promise<void> {
	await withOrg(app, { organizationId: org.id, userId }, (tx) =>
		tx.execute(sql`
			insert into "membership" ("id", "organization_id", "user_id", "role")
			values (${newId()}, ${org.id}, ${userId}, ${role})
		`)
	);
}

/**
 * L'écran d'acceptation : accepter, puis adhérer avec le rôle de l'invitation, dans une seule
 * transaction. Il n'adhère que si l'invitation est restée « accepted » : celle d'une personne déjà
 * membre est consommée dès l'acceptation, et la politique refuserait l'adhésion.
 */
async function acceptAndJoin(id: string, userId: string): Promise<void> {
	await withUser(app, userId, async (tx) => {
		const claimed = firstRow<{ role: Role; status: string }>(
			await tx.execute(sql`
				update "invitation"
				set "status" = 'accepted', "accepted_by" = ${userId}, "resolved_at" = now()
				where "id" = ${id} and "status" = 'pending' and "expires_at" > now()
				returning "role", "status"
			`)
		);
		if (!claimed) throw new Error(`invitation ${id} non acceptée`);
		await tx.execute(sql`select set_config('jadwal.org_id', ${org.id}, true)`);
		if (claimed.status !== 'accepted') return;
		await tx.execute(sql`
			insert into "membership" ("id", "organization_id", "user_id", "role")
			values (${newId()}, ${org.id}, ${userId}, ${claimed.role})
		`);
	});
}

/** La personne responsable retire quelqu'un, comme l'action « retirer » de l'écran des membres. */
async function remove(userId: string): Promise<void> {
	await withOrg(app, { organizationId: org.id, userId: org.userId }, (tx) =>
		tx.execute(sql`
			delete from "membership" where "organization_id" = ${org.id} and "user_id" = ${userId}
		`)
	);
}

/** L'état d'une invitation, relu par le propriétaire. */
async function stateOf(id: string): Promise<{ status: string; accepted_by: string | null }> {
	const row = firstRow<{ status: string; accepted_by: string | null }>(
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`select "status", "accepted_by" from "invitation" where "id" = ${id}`)
		)
	);
	if (!row) throw new Error(`invitation ${id} introuvable`);
	return row;
}

/** Le rôle d'une personne dans l'organisation, ou rien si elle n'en est pas membre. */
async function roleOf(userId: string): Promise<string | undefined> {
	return firstRow<{ role: string }>(
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				select "role" from "membership"
				where "organization_id" = ${org.id} and "user_id" = ${userId}
			`)
		)
	)?.role;
}

describe('le rôle d’une adhésion née d’une invitation', () => {
	it('is the role of the invitation, and no other, when she writes her membership herself', async () => {
		// L'écran insère le rôle de l'invitation. Rien, dans la base, ne l'y obligeait : une personne
		// invitée comme éditrice acceptait, puis s'écrivait responsable (ADR 0017 : « une invitation
		// d'éditeur ne devient pas une invitation de responsable »). Et dans l'autre sens aussi : une
		// adhésion née d'une invitation porte exactement le rôle de celle-ci.
		for (const [invitee, autre] of [
			['editor', 'org_admin'],
			['org_admin', 'editor']
		] as const) {
			const person = await account();
			await accept(await invite(person.email, invitee), person.id);
			expect(
				await messageOfFailure(() => selfJoin(person.id, autre)),
				`invitation « ${invitee} », adhésion « ${autre} »`
			).toContain(RLS_MEMBERSHIP);
			expect(await roleOf(person.id), `aucune adhésion « ${autre} »`).toBeUndefined();
			await selfJoin(person.id, invitee);
			expect(await roleOf(person.id)).toBe(invitee);
		}
	});
});

describe('une invitation ne vaut qu’une fois', () => {
	it('is consumed as soon as a person who is already a member accepts it', async () => {
		// L'adhésion existe déjà : aucune insertion, donc le déclencheur de la migration 0029 ne
		// consommait rien, et l'invitation restait « accepted ». La personne garde son adhésion et son
		// rôle : pour le changer, la personne responsable passe par l'écran des membres.
		const person = await member('editor');
		const id = await invite(person.email, 'org_admin');
		await accept(id, person.id);
		expect(await stateOf(id)).toEqual({ status: 'joined', accepted_by: person.id });
		expect(await roleOf(person.id)).toBe('editor');
	});

	it('does not let a member removed from the organisation come back with it', async () => {
		// Le trou entier : réinvitée, elle accepte ; la personne responsable la retire ; elle se remet
		// elle-même dans l'organisation par un appel direct, avec le rôle de l'invitation.
		const person = await member('editor');
		const id = await invite(person.email, 'org_admin');
		await accept(id, person.id);
		await remove(person.id);
		expect(await roleOf(person.id), 'retirée').toBeUndefined();
		expect(await messageOfFailure(() => selfJoin(person.id, 'org_admin'))).toContain(
			RLS_MEMBERSHIP
		);
		expect(await roleOf(person.id), 'toujours retirée').toBeUndefined();
	});

	// Deux gestes que la version précédente de 0058 consommait sont refusés depuis que la base tient
	// les passages de statut : le changement de mains d'une acceptation, et l'insertion d'une
	// invitation déjà acceptée. Leurs refus sont dans `invitation-status.test.ts` (F4, F2b, F2c).

	it('still refuses an expired invitation to a member, and says why', async () => {
		// Les deux déclencheurs tirent sur le même geste. Le refus de l'échéance passe le premier : une
		// invitation échue est refusée avec son motif, et non consommée en silence.
		const person = await member('editor');
		const id = newId();
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "invitation" ("id", "organization_id", "email", "role", "created_at",
					"expires_at")
				values (${id}, ${org.id}, ${person.email}, 'org_admin',
					now() - make_interval(hours => 15 * 24), now() - interval '24 hours')
			`)
		);
		expect(await messageOfFailure(() => accept(id, person.id))).toContain('has expired');
		expect(await stateOf(id)).toEqual({ status: 'pending', accepted_by: null });
	});

	it('changes nothing on the ordinary path: invited, joined, removed, invited again, joined again', async () => {
		const person = await account();
		const premiere = await invite(person.email, 'editor');
		await acceptAndJoin(premiere, person.id);
		expect(await stateOf(premiere)).toEqual({ status: 'joined', accepted_by: person.id });
		expect(await roleOf(person.id)).toBe('editor');

		await remove(person.id);
		// L'invitation consommée ne rouvre rien.
		expect(await messageOfFailure(() => selfJoin(person.id, 'editor'))).toContain(RLS_MEMBERSHIP);

		// Une nouvelle invitation, en revanche, vaut une nouvelle adhésion.
		const seconde = await invite(person.email, 'org_admin');
		await acceptAndJoin(seconde, person.id);
		expect(await stateOf(seconde)).toEqual({ status: 'joined', accepted_by: person.id });
		expect(await roleOf(person.id)).toBe('org_admin');
	});
});

describe('les acceptations écrites avant la migration 0058', () => {
	/** Porte ce qui a été lu hors de la transaction, que son lancer défait. */
	class Rollback extends Error {
		readonly found: { states: Record<string, string>; flag: string };
		constructor(found: { states: Record<string, string>; flag: string }) {
			super('rollback');
			this.found = found;
		}
	}

	it('are all consumed, and the maintenance flag is left as it was found', async () => {
		// L'écran accepte et adhère dans la même transaction : une invitation restée « accepted » après
		// coup est celle d'une personne qui était déjà membre, qu'elle le soit encore ou qu'elle ait été
		// retirée depuis, ou dont le compte a été supprimé. Aucune n'attend une adhésion à venir. La
		// migration les consomme toutes, et ne touche à rien d'autre. Tout est défait avec la
		// transaction.
		const statements = readFileSync(join(migrationsDir, MIGRATION), 'utf8')
			.split('--> statement-breakpoint')
			.map((text) => text.trim())
			.filter((text) => text.replace(/^--.*$/gm, '').trim().length > 0);
		const person = await member('editor');
		const removed = await account();
		const rows: [string, string, string | null][] = [
			['membre', 'accepted', person.id],
			['retiree', 'accepted', removed.id],
			['sans-nom', 'accepted', null],
			['en-attente', 'pending', null],
			['annulee', 'cancelled', null]
		];
		const ids = Object.fromEntries(rows.map(([name]) => [name, newId()]));
		const found = await owner
			.transaction(async (tx) => {
				// Des lignes d'avant la migration, écrites par le propriétaire sous son drapeau : il sort
				// des règles de passage, et écrit exactement ce qu'il veut écrire.
				await tx.execute(sql`set local jadwal.maintenance = 'on'`);
				for (const [name, status, acceptedBy] of rows) {
					await tx.execute(sql`
						insert into "invitation" ("id", "organization_id", "email", "role", "status",
							"accepted_by", "expires_at")
						values (${ids[name]}, ${org.id}, ${`${name}-${newId()}@example.test`}, 'editor',
							${status}, ${acceptedBy}, now() + make_interval(hours => 7 * 24))
					`);
				}
				// La migration tourne sans le drapeau d'entretien : on le retire avant de la jouer.
				await tx.execute(sql`set local jadwal.maintenance = 'off'`);
				for (const statement of statements) await tx.execute(sql.raw(statement));
				const flag =
					firstRow<{ flag: string }>(
						await tx.execute(sql`select current_setting('jadwal.maintenance', true) as flag`)
					)?.flag ?? '';
				await tx.execute(sql`set local jadwal.maintenance = 'on'`);
				const states = allRows<{ id: string; status: string }>(
					await tx.execute(sql`
						select "id", "status" from "invitation"
						where "id" in (${sql.join(
							Object.values(ids).map((id) => sql`${id}`),
							sql`, `
						)})
					`)
				);
				const byName = Object.fromEntries(
					rows.map(([name]) => [name, states.find((row) => row.id === ids[name])?.status ?? ''])
				);
				throw new Rollback({ states: byName, flag });
			})
			.catch((error: unknown) => {
				if (error instanceof Rollback) return error.found;
				throw error;
			});
		expect(found.states).toEqual({
			membre: 'joined',
			retiree: 'joined',
			'sans-nom': 'joined',
			'en-attente': 'pending',
			annulee: 'cancelled'
		});
		expect(found.flag, 'drapeau d’entretien').toBe('off');
	});
});

// Les passages de statut d'une invitation, tenus par la base pour les rôles de connexion
// (ADR 0017, migration 0058).
//
// La relecture du lot 4 de l'étape 17 l'a montré : la politique de modification laisse la personne
// invitée écrire n'importe quel statut sur toute ligne reçue à son adresse, et la personne
// responsable sur toute ligne de son organisation. Une invitation consommée repassait à « pending »
// ou à « accepted », et resservait après un retrait (F1, G1, G2). Une invitation annulée par la
// personne responsable s'acceptait encore (F3, G3). Une acceptation changeait de mains, depuis un
// contexte vide, sans être consommée (F4). Les lettres sont celles des attaques de cette relecture.
//
// Ce qui est permis, et rien d'autre :
// - une invitation naît « pending », acceptée par personne, sans date de réponse ;
// - « pending » va vers « accepted », par la personne à qui elle a été envoyée et à son propre nom,
//   ou vers « cancelled » ;
// - « accepted » va vers « joined » ;
// - « joined » et « cancelled » ne bougent plus ;
// - `accepted_by` ne se remplit qu'à l'acceptation, et ne se vide que par la suppression du compte ;
// - `resolved_at` prend l'heure de la réponse au moment où elle est donnée, et ne bouge plus. La
//   purge des invitations résolues compte depuis cette date : la repousser gardait une adresse plus
//   longtemps que les quatre-vingt-dix jours que promet `docs/CONDITIONS.md`.
// Le super-admin suit les mêmes règles. Le propriétaire, sous son drapeau d'entretien, en sort.
//
// F2d reste possible : une personne qui a le contexte de l'organisation s'écrit une invitation à sa
// propre adresse, avec les colonnes de l'écran, l'accepte et adhère avec son rôle. C'est la limite
// du rôle, écrite dans l'ADR 0017 et en tête de `invitation-once.test.ts`, que ce fichier ne ferme
// pas.
//
// Tout passe par les rôles de connexion, non privilégiés. Le propriétaire ne sert qu'à poser le
// décor et à relire ce qui est réellement en base. Le rôle du serveur ne sert qu'une fois : pour
// supprimer un compte sans poser le drapeau d'entretien.

import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	newId,
	withOrg,
	withUser,
	type Database,
	type DatabaseHandle,
	type Transaction
} from '../src/index.js';
import {
	firstRow,
	joinOrganisation,
	messageOfFailure,
	openDatabase,
	seedOrganisation,
	SQLSTATE,
	sqlStateOf,
	withMaintenance,
	type Organisation
} from './helpers.js';

const RLS_MEMBERSHIP = 'row-level security policy for table "membership"';

type Role = 'org_admin' | 'editor';

interface Person {
	id: string;
	email: string;
}

let serverHandle: DatabaseHandle;
let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let superAdminHandle: DatabaseHandle;
let server: Database;
let owner: Database;
let app: Database;
let superAdmin: Database;
let org: Organisation;

beforeAll(async () => {
	serverHandle = openDatabase('admin');
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	superAdminHandle = openDatabase('superadmin');
	server = serverHandle.db;
	owner = ownerHandle.db;
	app = appHandle.db;
	superAdmin = superAdminHandle.db;
	org = await seedOrganisation(owner, 'passages');
});

afterAll(async () => {
	await superAdminHandle?.close();
	await appHandle?.close();
	await ownerHandle?.close();
	await serverHandle?.close();
});

/** Un compte sans organisation, créé par le propriétaire, à l'adresse donnée ou à une adresse neuve. */
async function account(email?: string, monthsOld = 0): Promise<Person> {
	const id = newId();
	const address = email ?? `passages-${id}@example.test`;
	await withMaintenance(owner, (tx) =>
		tx.execute(sql`
			insert into "user" ("id", "email", "created_at", "updated_at")
			values (${id}, ${address}, now() - make_interval(months => ${monthsOld}),
				now() - make_interval(months => ${monthsOld}))
		`)
	);
	return { id, email: address };
}

/** Un compte déjà membre, entré par le chemin réel : invitation, acceptation, adhésion. */
async function member(role: Role, monthsOld = 0): Promise<Person> {
	const person = await account(undefined, monthsOld);
	await joinOrganisation(owner, app, org.id, person.id, person.email, role);
	return person;
}

/** Ce que la personne invitée écrit, depuis son propre contexte, sans organisation. */
const asPerson = (person: Person, statement: SQL) =>
	withUser(app, person.id, (tx) => tx.execute(statement));

/** Ce que la personne responsable écrit, dans le contexte de son organisation. */
const asManager = (statement: SQL) =>
	withOrg(app, { organizationId: org.id, userId: org.userId }, (tx) => tx.execute(statement));

/** Ce que le super-admin écrit, entré dans l'organisation. */
const asSuperAdmin = (statement: SQL) => withOrg(superAdmin, org.id, (tx) => tx.execute(statement));

/** L'insertion de l'écran des membres, par la personne responsable. Rend l'invitation. */
async function invite(email: string, role: Role = 'editor'): Promise<string> {
	const id = newId();
	await asManager(sql`
		insert into "invitation" ("id", "organization_id", "email", "role", "invited_by", "expires_at")
		values (${id}, ${org.id}, ${email}, ${role}, ${org.userId},
			now() + make_interval(hours => 14 * 24))
	`);
	return id;
}

/** L'annulation de l'écran des membres : l'organisation est nommée, et le statut attendu aussi. */
const cancelByScreen = (id: string) =>
	asManager(sql`
		update "invitation" set "status" = 'cancelled', "resolved_at" = now()
		where "id" = ${id} and "organization_id" = ${org.id} and "status" = 'pending'
	`);

/** La personne invitée accepte à son propre nom, sans adhérer dans la même transaction. */
const acceptOnly = (id: string, person: Person) =>
	asPerson(
		person,
		sql`
			update "invitation"
			set "status" = 'accepted', "accepted_by" = ${person.id}, "resolved_at" = now()
			where "id" = ${id}
		`
	);

/**
 * L'écran d'acceptation, tel qu'il est écrit dans `organisations/+page.server.ts` : accepter une
 * invitation en attente qui court encore, puis adhérer avec le rôle rendu, dans une transaction. Rend
 * le statut rendu par l'acceptation, ou rien quand l'écran ne trouve rien à accepter.
 */
async function acceptByScreen(id: string, person: Person): Promise<string | undefined> {
	return withUser(app, person.id, async (tx) => {
		const claimed = firstRow<{ role: Role; status: string }>(
			await tx.execute(sql`
				update "invitation"
				set "status" = 'accepted', "accepted_by" = ${person.id}, "resolved_at" = now()
				where "id" = ${id} and "status" = 'pending' and "expires_at" > now()
				returning "role", "status"
			`)
		);
		if (!claimed) return undefined;
		await tx.execute(sql`select set_config('jadwal.org_id', ${org.id}, true)`);
		if (claimed.status === 'accepted') {
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${org.id}, ${person.id}, ${claimed.role})
			`);
		}
		return claimed.status;
	});
}

/** La personne responsable retire quelqu'un, comme l'action « retirer » de l'écran des membres. */
const remove = (person: Person) =>
	asManager(sql`
		delete from "membership" where "organization_id" = ${org.id} and "user_id" = ${person.id}
	`);

/** La personne crée elle-même son adhésion, dans le contexte de l'organisation : l'appel direct. */
const selfJoin = (person: Person, role: Role) =>
	withOrg(app, { organizationId: org.id, userId: person.id }, (tx) =>
		tx.execute(sql`
			insert into "membership" ("id", "organization_id", "user_id", "role")
			values (${newId()}, ${org.id}, ${person.id}, ${role})
		`)
	);

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

/** La date de réponse d'une invitation, relue par le propriétaire, en texte pour la comparer telle quelle. */
async function answeredAt(id: string): Promise<string | null> {
	const row = firstRow<{ resolved_at: string | null }>(
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`select "resolved_at"::text from "invitation" where "id" = ${id}`)
		)
	);
	if (!row) throw new Error(`invitation ${id} introuvable`);
	return row.resolved_at;
}

/** Le rôle d'une personne dans l'organisation, ou rien si elle n'en est pas membre. */
async function roleOf(person: Person): Promise<string | undefined> {
	return firstRow<{ role: string }>(
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				select "role" from "membership"
				where "organization_id" = ${org.id} and "user_id" = ${person.id}
			`)
		)
	)?.role;
}

/** Ce que dit la base quand elle refuse : son code et son message, lus en une seule tentative. */
async function refusal(run: () => Promise<unknown>): Promise<{ code?: string; message: string }> {
	try {
		await run();
	} catch (error) {
		return {
			code: sqlStateOf(error),
			message: await messageOfFailure(() => Promise.reject(error))
		};
	}
	throw new Error('aucune erreur levée, alors que le test en attend une');
}

/** Le refus attendu : la règle est nommée, comme celle de l'échéance (migration 0057). */
const refused = (because: string) => ({
	code: SQLSTATE.restrictViolation,
	message: expect.stringContaining(because) as unknown as string
});

describe('une invitation consommée', () => {
	it('does not go back to accepted, and the person removed does not come back with it (F1)', async () => {
		// Déjà membre, réinvitée comme responsable : l'acceptation consomme l'invitation (0058). Une
		// fois retirée, elle la remettait à « accepted » depuis son propre contexte, puis se remettait
		// dans l'organisation, responsable.
		const person = await member('editor');
		const id = await invite(person.email, 'org_admin');
		expect(await acceptByScreen(id, person)).toBe('joined');
		await remove(person);
		expect(
			await refusal(() =>
				asPerson(person, sql`update "invitation" set "status" = 'accepted' where "id" = ${id}`)
			)
		).toEqual(refused('cannot go from joined to accepted'));
		expect(await stateOf(id)).toEqual({ status: 'joined', accepted_by: person.id });
		expect(await messageOfFailure(() => selfJoin(person, 'org_admin'))).toContain(RLS_MEMBERSHIP);
		expect(await roleOf(person), 'toujours retirée').toBeUndefined();
	});

	it('does not go back to pending for the screen to accept it again, on the ordinary path (G1)', async () => {
		// Le modèle le plus strict : un seul `update`, dans le propre contexte de la personne, puis
		// l'écran d'acceptation tel quel.
		const person = await account();
		const id = await invite(person.email);
		expect(await acceptByScreen(id, person)).toBe('accepted');
		expect(await stateOf(id)).toEqual({ status: 'joined', accepted_by: person.id });
		await remove(person);
		expect(
			await refusal(() =>
				asPerson(person, sql`update "invitation" set "status" = 'pending' where "id" = ${id}`)
			)
		).toEqual(refused('cannot go from joined to pending'));
		expect(await acceptByScreen(id, person), 'l’écran ne trouve rien à accepter').toBeUndefined();
		expect(await roleOf(person)).toBeUndefined();
	});

	it('does not go back to pending either when it was consumed at acceptance (G2)', async () => {
		// Le cas même que la migration 0058 corrige : déjà membre, réinvitée, retirée.
		const person = await member('editor');
		const id = await invite(person.email, 'org_admin');
		expect(await acceptByScreen(id, person)).toBe('joined');
		await remove(person);
		expect(
			await refusal(() =>
				asPerson(person, sql`update "invitation" set "status" = 'pending' where "id" = ${id}`)
			)
		).toEqual(refused('cannot go from joined to pending'));
		expect(await acceptByScreen(id, person)).toBeUndefined();
		expect(await roleOf(person)).toBeUndefined();
	});
});

describe('une invitation annulée', () => {
	it('is not accepted by the invited person once the manager has cancelled it (F3)', async () => {
		// L'ADR 0017 : « Le responsable peut annuler une invitation tant qu'elle n'a pas été
		// acceptée. » La base ne tenait pas l'annulation : l'invitation s'acceptait encore, et
		// l'adhésion suivait.
		const person = await account();
		const id = await invite(person.email);
		await cancelByScreen(id);
		expect(
			await refusal(() =>
				asPerson(
					person,
					sql`
						update "invitation"
						set "status" = 'accepted', "accepted_by" = ${person.id}, "resolved_at" = now()
						where "id" = ${id}
					`
				)
			)
		).toEqual(refused('cannot go from cancelled to accepted'));
		expect(await stateOf(id)).toEqual({ status: 'cancelled', accepted_by: null });
		expect(await messageOfFailure(() => selfJoin(person, 'editor'))).toContain(RLS_MEMBERSHIP);
	});

	it('does not go back to pending for the screen to accept it (G3)', async () => {
		const person = await account();
		const id = await invite(person.email);
		await cancelByScreen(id);
		expect(
			await refusal(() =>
				asPerson(person, sql`update "invitation" set "status" = 'pending' where "id" = ${id}`)
			)
		).toEqual(refused('cannot go from cancelled to pending'));
		expect(await acceptByScreen(id, person)).toBeUndefined();
		expect(await roleOf(person)).toBeUndefined();
	});
});

describe('une acceptation', () => {
	it('never changes hands, not even to a member, not even from an empty context (F4)', async () => {
		// La personne qui détient l'adresse passait son acceptation à une membre, depuis un contexte
		// vide. Le déclencheur de consommation, qui lit les adhésions avec les droits de l'appelant, ne
		// voyait pas celle de la membre : rien n'était consommé, et la membre, retirée, revenait avec.
		const holder = await account();
		const target = await member('editor');
		const id = await invite(holder.email, 'org_admin');
		await acceptOnly(id, holder);
		expect(await stateOf(id)).toEqual({ status: 'accepted', accepted_by: holder.id });
		const toTarget = sql`update "invitation" set "accepted_by" = ${target.id} where "id" = ${id}`;
		expect(await refusal(() => asPerson(holder, toTarget)), 'depuis un contexte vide').toEqual(
			refused('never changes hands')
		);
		expect(await refusal(() => asManager(toTarget)), 'par la personne responsable').toEqual(
			refused('never changes hands')
		);
		expect(await stateOf(id)).toEqual({ status: 'accepted', accepted_by: holder.id });
		await remove(target);
		expect(await messageOfFailure(() => selfJoin(target, 'org_admin'))).toContain(RLS_MEMBERSHIP);
	});

	it('is made only by the person the invitation was sent to, in her own name', async () => {
		// L'ADR 0017 : « L'acceptation est faite par la personne elle-même. » La personne responsable
		// acceptait à sa place, ou à son propre nom une invitation adressée à une autre ; la personne
		// invitée acceptait au nom d'un autre compte.
		const invitee = await account();
		const other = await account();
		const id = await invite(invitee.email);
		const acceptFor = (userId: string) => sql`
			update "invitation" set "status" = 'accepted', "accepted_by" = ${userId}, "resolved_at" = now()
			where "id" = ${id}
		`;
		expect(await refusal(() => asManager(acceptFor(invitee.id))), 'à sa place').toEqual(
			refused('accepted only by the person it was sent to')
		);
		expect(await refusal(() => asManager(acceptFor(org.userId))), 'à son propre nom').toEqual(
			refused('accepted only by the person it was sent to')
		);
		expect(
			await refusal(() => asPerson(invitee, acceptFor(other.id))),
			'au nom d’un autre compte'
		).toEqual(refused('accepted only by the person it was sent to'));
		expect(await stateOf(id)).toEqual({ status: 'pending', accepted_by: null });
		await acceptOnly(id, invitee);
		expect(await stateOf(id)).toEqual({ status: 'accepted', accepted_by: invitee.id });

		// Une membre réinvitée : la personne responsable voit son compte, et l'adresse est la bonne.
		// Seul le nom de celle qui accepte l'arrête.
		const reinvited = await member('editor');
		const again = await invite(reinvited.email, 'org_admin');
		expect(
			await refusal(() =>
				asManager(sql`
					update "invitation" set "status" = 'accepted', "accepted_by" = ${reinvited.id},
						"resolved_at" = now()
					where "id" = ${again}
				`)
			),
			'une membre, à sa place'
		).toEqual(refused('accepted only by the person it was sent to'));
		expect(await stateOf(again)).toEqual({ status: 'pending', accepted_by: null });
	});

	it('is made by the person whatever the case of the address the manager typed', async () => {
		// L'écran des membres garde l'adresse telle qu'elle a été tapée, et une adresse ne distingue
		// pas les majuscules : la règle compare sans la casse.
		const person = await account();
		const id = await invite(person.email.toUpperCase());
		expect(await acceptByScreen(id, person)).toBe('accepted');
		expect(await stateOf(id)).toEqual({ status: 'joined', accepted_by: person.id });
		expect(await roleOf(person)).toBe('editor');
	});

	it('is neither cancelled nor sent back to pending once made', async () => {
		const invitee = await account();
		const id = await invite(invitee.email);
		await acceptOnly(id, invitee);
		expect(
			await refusal(() =>
				asManager(sql`update "invitation" set "status" = 'cancelled' where "id" = ${id}`)
			)
		).toEqual(refused('cannot go from accepted to cancelled'));
		expect(
			await refusal(() =>
				asPerson(invitee, sql`update "invitation" set "status" = 'pending' where "id" = ${id}`)
			)
		).toEqual(refused('cannot go from accepted to pending'));
		expect(await stateOf(id)).toEqual({ status: 'accepted', accepted_by: invitee.id });
	});

	it('loses its name only when the account is deleted, and nobody takes it back', async () => {
		const invitee = await account();
		const id = await invite(invitee.email);
		await acceptOnly(id, invitee);
		const empty = sql`update "invitation" set "accepted_by" = null where "id" = ${id}`;
		expect(await refusal(() => asManager(empty)), 'par la personne responsable').toEqual(
			refused('emptied only when the account is deleted')
		);
		expect(await refusal(() => asPerson(invitee, empty)), 'par la personne invitée').toEqual(
			refused('emptied only when the account is deleted')
		);
		// La suppression du compte le vide, par la clé étrangère (`on delete set null`).
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`delete from "user" where "id" = ${invitee.id}`)
		);
		expect(await stateOf(id)).toEqual({ status: 'accepted', accepted_by: null });
		// Un compte recréé à la même adresse ne reprend pas l'acceptation d'un autre compte : il faut
		// l'inviter de nouveau.
		const again = await account(invitee.email);
		expect(
			await refusal(() =>
				asPerson(again, sql`update "invitation" set "accepted_by" = ${again.id} where "id" = ${id}`)
			)
		).toEqual(refused('never changes hands'));
		expect(await stateOf(id)).toEqual({ status: 'accepted', accepted_by: null });
	});

	it('loses its name too when the account is deleted without the maintenance flag', async () => {
		// PostgreSQL exécute l'action d'une clé étrangère sous le propriétaire de la table, quel que
		// soit le rôle qui supprime le compte. Les purges posent le drapeau d'entretien, et la règle
		// les laisse passer par lui ; le rôle du serveur supprime sans le poser. Le vidage doit passer
		// quand même, sans quoi un compte qui porte une acceptation ne se supprimerait plus.
		const invitee = await account();
		const id = await invite(invitee.email);
		await acceptOnly(id, invitee);
		await server.execute(sql`delete from "user" where "id" = ${invitee.id}`);
		expect(await stateOf(id)).toEqual({ status: 'accepted', accepted_by: null });
	});
});

describe('une invitation qui naît', () => {
	it('is born pending and accepted by nobody, whoever writes it (F2b, F2c)', async () => {
		// Une personne qui a le contexte de l'organisation s'écrivait une invitation déjà acceptée, à
		// son nom, puis adhérait avec son rôle. Une invitation naît en attente : il faut encore
		// l'accepter, par la personne à qui elle est adressée.
		const person = await account();
		const forged = (status: string, acceptedBy: string | null, answered: boolean) => sql`
			insert into "invitation" ("id", "organization_id", "email", "role", "status",
				"accepted_by", "resolved_at", "expires_at")
			values (${newId()}, ${org.id}, ${`forgee-${newId()}@example.test`}, 'org_admin', ${status},
				${acceptedBy}, ${answered ? sql`now()` : null}, now() + interval '24 hours')
		`;
		const inContext = (statement: SQL) =>
			withOrg(app, { organizationId: org.id, userId: person.id }, (tx) => tx.execute(statement));
		for (const [status, acceptedBy, answered] of [
			['accepted', person.id, true],
			['joined', person.id, true],
			['cancelled', null, true],
			['pending', person.id, false],
			['pending', null, true]
		] as const) {
			expect(
				await refusal(() => inContext(forged(status, acceptedBy, answered))),
				`« ${status} », accepted_by ${acceptedBy ? 'posé' : 'vide'}, ${answered ? 'datée' : 'sans date'}`
			).toEqual(refused('is created pending, accepted by nobody'));
		}
		expect(
			await refusal(() => asSuperAdmin(forged('accepted', person.id, true))),
			'par le super-admin'
		).toEqual(refused('is created pending, accepted by nobody'));
		expect(await messageOfFailure(() => selfJoin(person, 'org_admin'))).toContain(RLS_MEMBERSHIP);
		// L'insertion de l'écran, elle, passe : c'est le seul geste qui crée une invitation.
		expect(await stateOf(await invite(person.email))).toEqual({
			status: 'pending',
			accepted_by: null
		});
	});
});

describe('la date de réponse', () => {
	const DATED = 'is dated once, at the time of its answer';

	it('is taken at the time of the answer, then no longer moves, so the purge keeps its ninety days', async () => {
		// La purge emporte une invitation résolue quatre-vingt-dix jours après sa date de réponse
		// (`docs/CONDITIONS.md`). Le rôle applicatif peut écrire cette colonne : la personne
		// responsable repoussait celle d'une invitation annulée, la personne invitée celle de son
		// invitation consommée, et la purge ne les emportait plus jamais.
		const tenYears = (id: string) =>
			sql`update "invitation" set "resolved_at" = now() + interval '10 years' where "id" = ${id}`;
		const cancelledFor = await account();
		const cancelled = await invite(cancelledFor.email);
		await cancelByScreen(cancelled);
		const joinedFor = await account();
		const joined = await invite(joinedFor.email);
		expect(await acceptByScreen(joined, joinedFor)).toBe('accepted');
		const waiting = await account();
		const pending = await invite(waiting.email);
		const before = [await answeredAt(cancelled), await answeredAt(joined)];

		expect(
			await refusal(() => asManager(tenYears(cancelled))),
			'annulée, par la personne responsable'
		).toEqual(refused(DATED));
		expect(
			await refusal(() => asPerson(joinedFor, tenYears(joined))),
			'consommée, par la personne invitée'
		).toEqual(refused(DATED));
		expect(
			await refusal(() => asSuperAdmin(tenYears(cancelled))),
			'annulée, par le super-admin'
		).toEqual(refused(DATED));
		expect(
			await refusal(() =>
				asManager(sql`update "invitation" set "resolved_at" = null where "id" = ${joined}`)
			),
			'effacée'
		).toEqual(refused(DATED));
		expect(await refusal(() => asManager(tenYears(pending))), 'en attente').toEqual(refused(DATED));
		expect([await answeredAt(cancelled), await answeredAt(joined)]).toEqual(before);

		// À la réponse même, la date est celle de la transaction qui répond, comme à l'écran.
		expect(
			await refusal(() =>
				asPerson(
					waiting,
					sql`
						update "invitation"
						set "status" = 'accepted', "accepted_by" = ${waiting.id},
							"resolved_at" = now() + interval '10 years'
						where "id" = ${pending}
					`
				)
			),
			'acceptée, datée plus tard'
		).toEqual(refused(DATED));
		expect(
			await refusal(() =>
				asManager(sql`update "invitation" set "status" = 'cancelled' where "id" = ${pending}`)
			),
			'annulée, sans date'
		).toEqual(refused(DATED));
		expect(await stateOf(pending)).toEqual({ status: 'pending', accepted_by: null });
		expect(await answeredAt(pending)).toBeNull();
	});
});

describe('le super-admin', () => {
	it('follows the same moves as everyone else', async () => {
		// Il a tous les droits sur les données (ADR 0025). Ces règles ne lui en retirent aucun : tout
		// ce qu'un passage refusé lui donnerait, il l'obtient par un geste permis, une nouvelle
		// invitation ou une adhésion qu'il crée lui-même. Elles tiennent le sens de la ligne, et
		// l'arrêtent sur la méprise, comme le contexte.
		const joined = await account();
		const consumed = await invite(joined.email);
		await acceptByScreen(consumed, joined);
		expect(
			await refusal(() =>
				asSuperAdmin(sql`update "invitation" set "status" = 'pending' where "id" = ${consumed}`)
			),
			'consommée'
		).toEqual(refused('cannot go from joined to pending'));

		const cancelledFor = await account();
		const cancelled = await invite(cancelledFor.email);
		await cancelByScreen(cancelled);
		expect(
			await refusal(() =>
				asSuperAdmin(sql`
					update "invitation" set "status" = 'accepted', "accepted_by" = ${cancelledFor.id}
					where "id" = ${cancelled}
				`)
			),
			'annulée'
		).toEqual(refused('cannot go from cancelled to accepted'));

		const holder = await account();
		const accepted = await invite(holder.email);
		await acceptOnly(accepted, holder);
		expect(
			await refusal(() =>
				asSuperAdmin(
					sql`update "invitation" set "accepted_by" = ${joined.id} where "id" = ${accepted}`
				)
			),
			'acceptée'
		).toEqual(refused('never changes hands'));

		const waiting = await account();
		const pending = await invite(waiting.email);
		expect(
			await refusal(() =>
				asSuperAdmin(sql`
					update "invitation" set "status" = 'accepted', "accepted_by" = ${waiting.id}
					where "id" = ${pending}
				`)
			),
			'en attente, acceptée à sa place'
		).toEqual(refused('accepted only by the person it was sent to'));
	});

	it('accepts nothing sent to someone else, not even by readdressing it to himself at once', async () => {
		// Il peut modifier l'adresse d'une invitation (migration 0056). La règle lit l'adresse à
		// laquelle l'invitation a été envoyée, et non celle que la ligne prend dans la même instruction.
		const admin = await account();
		const invitee = await account();
		const id = await invite(invitee.email);
		expect(
			await refusal(() =>
				withOrg(superAdmin, { organizationId: org.id, userId: admin.id }, (tx) =>
					tx.execute(sql`
						update "invitation"
						set "email" = ${admin.email}, "status" = 'accepted', "accepted_by" = ${admin.id},
							"resolved_at" = now()
						where "id" = ${id}
					`)
				)
			)
		).toEqual(refused('accepted only by the person it was sent to'));
		expect(await stateOf(id)).toEqual({ status: 'pending', accepted_by: null });
	});

	it('still invites, cancels, pushes back the end, and makes a person a member himself', async () => {
		// Les gestes de l'écran des membres sous son rôle, puis le report d'échéance de l'ADR 0025.
		const invitee = await account();
		const id = newId();
		await asSuperAdmin(sql`
			insert into "invitation" ("id", "organization_id", "email", "role", "expires_at")
			values (${id}, ${org.id}, ${invitee.email}, 'editor',
				now() + make_interval(hours => 2 * 24))
		`);
		await asSuperAdmin(sql`
			update "invitation" set "expires_at" = "created_at" + make_interval(hours => 14 * 24)
			where "id" = ${id}
		`);
		expect(await stateOf(id)).toEqual({ status: 'pending', accepted_by: null });
		await asSuperAdmin(sql`
			update "invitation" set "status" = 'cancelled', "resolved_at" = now()
			where "id" = ${id} and "organization_id" = ${org.id} and "status" = 'pending'
		`);
		expect(await stateOf(id)).toEqual({ status: 'cancelled', accepted_by: null });

		// Une acceptation qui attend son adhésion : l'adhésion que crée le super-admin consomme
		// l'invitation (migration 0029).
		const waiting = await account();
		const accepted = await invite(waiting.email);
		await acceptOnly(accepted, waiting);
		await asSuperAdmin(sql`
			insert into "membership" ("id", "organization_id", "user_id", "role")
			values (${newId()}, ${org.id}, ${waiting.id}, 'editor')
		`);
		expect(await stateOf(accepted)).toEqual({ status: 'joined', accepted_by: waiting.id });
		expect(await roleOf(waiting)).toBe('editor');
	});
});

describe('le propriétaire', () => {
	it('writes any status under his maintenance flag, as fixtures and the migration itself need', async () => {
		const person = await account();
		const id = await invite(person.email);
		await cancelByScreen(id);
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				update "invitation" set "status" = 'accepted', "accepted_by" = ${person.id}
				where "id" = ${id}
			`)
		);
		expect(await stateOf(id)).toEqual({ status: 'accepted', accepted_by: person.id });
		const written = newId();
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "invitation" ("id", "organization_id", "email", "role", "status",
					"accepted_by", "expires_at")
				values (${written}, ${org.id}, ${`ecrite-${written}@example.test`}, 'editor', 'joined',
					${person.id}, now() + interval '24 hours')
			`)
		);
		expect(await stateOf(written)).toEqual({ status: 'joined', accepted_by: person.id });
	});
});

describe('le drapeau d’entretien', () => {
	it('opens nothing to the application or the super-admin who set it themselves', async () => {
		// Tout rôle peut poser ce réglage pour lui-même : seul le propriétaire en tire quelque chose.
		// Si la règle ne lisait que le drapeau, la personne retirée remettrait son invitation
		// consommée à « accepted », la personne responsable écrirait une invitation déjà acceptée, et
		// le super-admin rouvrirait une invitation consommée.
		const flagged = (statement: SQL) => async (tx: Transaction) => {
			await tx.execute(sql`select set_config('jadwal.maintenance', 'on', true)`);
			return tx.execute(statement);
		};

		const person = await member('editor');
		const consumed = await invite(person.email, 'org_admin');
		expect(await acceptByScreen(consumed, person)).toBe('joined');
		await remove(person);
		expect(
			await refusal(() =>
				withUser(
					app,
					person.id,
					flagged(sql`update "invitation" set "status" = 'accepted' where "id" = ${consumed}`)
				)
			),
			'la personne retirée, drapeau posé'
		).toEqual(refused('cannot go from joined to accepted'));

		const written = newId();
		expect(
			await refusal(() =>
				withOrg(
					app,
					{ organizationId: org.id, userId: org.userId },
					flagged(sql`
						insert into "invitation" ("id", "organization_id", "email", "role", "invited_by",
							"status", "accepted_by", "expires_at")
						values (${written}, ${org.id}, ${person.email}, 'org_admin', ${org.userId},
							'accepted', ${person.id}, now() + interval '24 hours')
					`)
				)
			),
			'la personne responsable, drapeau posé'
		).toEqual(refused('is created pending'));

		expect(
			await refusal(() =>
				withOrg(
					superAdmin,
					org.id,
					flagged(sql`update "invitation" set "status" = 'pending' where "id" = ${consumed}`)
				)
			),
			'le super-admin, drapeau posé'
		).toEqual(refused('cannot go from joined to pending'));

		expect(await stateOf(consumed)).toEqual({ status: 'joined', accepted_by: person.id });
		expect(await roleOf(person), 'toujours retirée').toBeUndefined();
	});
});

describe('le parcours ordinaire', () => {
	it('invites, accepts, joins, removes, invites again, joins again', async () => {
		const person = await account();
		const premiere = await invite(person.email, 'editor');
		expect(await acceptByScreen(premiere, person)).toBe('accepted');
		expect(await stateOf(premiere)).toEqual({ status: 'joined', accepted_by: person.id });
		expect(await roleOf(person)).toBe('editor');
		await remove(person);
		expect(await roleOf(person)).toBeUndefined();
		const seconde = await invite(person.email, 'org_admin');
		expect(await acceptByScreen(seconde, person)).toBe('accepted');
		expect(await stateOf(seconde)).toEqual({ status: 'joined', accepted_by: person.id });
		expect(await roleOf(person)).toBe('org_admin');
	});

	it('cancels a pending invitation, and replaces one, even expired, as the members screen does', async () => {
		const annulee = await account();
		const id = await invite(annulee.email);
		await cancelByScreen(id);
		expect(await stateOf(id)).toEqual({ status: 'cancelled', accepted_by: null });

		// Le remplacement de l'écran : l'invitation en attente pour cette adresse, échue ou non, est
		// close, et la nouvelle prend sa place.
		const remplacee = await account();
		const echue = newId();
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "invitation" ("id", "organization_id", "email", "role", "created_at",
					"expires_at")
				values (${echue}, ${org.id}, ${remplacee.email}, 'editor',
					now() - make_interval(hours => 15 * 24), now() - interval '24 hours')
			`)
		);
		await asManager(sql`
			update "invitation" set "status" = 'cancelled', "resolved_at" = now()
			where "organization_id" = ${org.id} and lower("email") = lower(${remplacee.email})
				and "status" = 'pending'
		`);
		const nouvelle = await invite(remplacee.email, 'org_admin');
		expect(await stateOf(echue)).toEqual({ status: 'cancelled', accepted_by: null });
		expect(await acceptByScreen(nouvelle, remplacee)).toBe('accepted');
		expect(await roleOf(remplacee)).toBe('org_admin');
	});

	it('lets accounts go with the acceptances they carry, deleted by the owner or purged', async () => {
		// Supprimée par le propriétaire : l'invitation consommée reste, sans nom.
		const partie = await member('editor');
		const consommee = firstRow<{ id: string }>(
			await withMaintenance(owner, (tx) =>
				tx.execute(sql`
					select "id" from "invitation"
					where "organization_id" = ${org.id} and "accepted_by" = ${partie.id}
				`)
			)
		)?.id;
		expect(consommee).toBeDefined();
		await remove(partie);
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`delete from "user" where "id" = ${partie.id}`)
		);
		expect(await stateOf(consommee ?? '')).toEqual({ status: 'joined', accepted_by: null });

		// Purgé : un compte de deux ans, retiré de l'organisation, sans session.
		const ancien = await member('editor', 24);
		await remove(ancien);
		await withMaintenance(owner, (tx) => tx.execute(sql`select jadwal.purge_orphan_accounts()`));
		const restant = firstRow<{ n: number }>(
			await withMaintenance(owner, (tx) =>
				tx.execute(sql`select count(*)::int as n from "user" where "id" = ${ancien.id}`)
			)
		);
		expect(restant?.n, 'le compte ancien est purgé').toBe(0);
	});

	it('purges resolved invitations, consumed and cancelled alike', async () => {
		const ids = { consommee: newId(), annulee: newId() };
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "invitation" ("id", "organization_id", "email", "role", "status",
					"created_at", "expires_at", "resolved_at")
				values
					(${ids.consommee}, ${org.id}, ${`vieille-${ids.consommee}@example.test`}, 'editor',
						'joined', now() - make_interval(hours => 130 * 24),
						now() - make_interval(hours => 120 * 24), now() - make_interval(hours => 125 * 24)),
					(${ids.annulee}, ${org.id}, ${`vieille-${ids.annulee}@example.test`}, 'editor',
						'cancelled', now() - make_interval(hours => 130 * 24),
						now() - make_interval(hours => 120 * 24), now() - make_interval(hours => 125 * 24))
			`)
		);
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`select jadwal.purge_resolved_invitations()`)
		);
		const restantes = firstRow<{ n: number }>(
			await withMaintenance(owner, (tx) =>
				tx.execute(sql`
					select count(*)::int as n from "invitation"
					where "id" in (${ids.consommee}, ${ids.annulee})
				`)
			)
		);
		expect(restantes?.n).toBe(0);
	});
});

describe('l’ordre des déclencheurs', () => {
	it('lets the expiry rule speak first: an expired acceptance that changes hands has expired', async () => {
		// PostgreSQL exécute les déclencheurs d'un même moment dans l'ordre de leurs noms. Le refus de
		// l'échéance (0057) passe avant celui des passages : une acceptation échue est refusée avec son
		// motif à elle.
		const invitee = await account();
		const other = await account();
		const id = newId();
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "invitation" ("id", "organization_id", "email", "role", "status",
					"accepted_by", "created_at", "expires_at")
				values (${id}, ${org.id}, ${invitee.email}, 'editor', 'accepted', ${invitee.id},
					now() - make_interval(hours => 15 * 24), now() - interval '24 hours')
			`)
		);
		expect(
			await refusal(() =>
				asManager(sql`update "invitation" set "accepted_by" = ${other.id} where "id" = ${id}`)
			)
		).toEqual(refused('has expired'));
	});

	it('checks the move the caller asks for, before the consumption rewrites it', async () => {
		// La personne déjà membre demande « accepted » ; la consommation (0058) écrit « joined » après
		// le contrôle. Dans l'autre ordre, le contrôle lirait « pending » vers « joined », et refuserait
		// l'acceptation.
		const person = await member('editor');
		const id = await invite(person.email, 'org_admin');
		await acceptOnly(id, person);
		expect(await stateOf(id)).toEqual({ status: 'joined', accepted_by: person.id });
	});
});

// L'éditeur et le responsable, du côté de la base (ADR 0046).
//
// Jusqu'à l'étape 18, la base ne distinguait pas les deux rôles à l'intérieur d'une organisation :
// c'était l'application qui réservait des écrans aux personnes responsables. Toute personne qui avait
// le contexte de l'organisation pouvait, par un appel direct, changer un rôle, le sien compris,
// s'écrire une invitation de responsable et l'accepter, retirer un membre, modifier les réglages, les
// salles et les heures de prière (ADR 0017, « Limite du rôle »). La faille de l'étape 17 a montré ce
// que cela coûte : un rôle mal lu dans l'application suffisait.
//
// La migration 0059 fait tenir la séparation par la base : `jadwal.is_org_admin()` dit si la personne
// du contexte est responsable de l'organisation du contexte, et les politiques des gestes réservés
// l'exigent. Chaque geste de la liste de l'ADR 0046 est tenté ici par une éditrice, avec le contexte
// que l'écran pose (l'organisation et sa propre personne), puis par une personne responsable. Le
// parcours ordinaire, celui d'une personne invitée qui accepte et adhère, reste le même.
//
// Tout passe par les rôles de connexion, non privilégiés. Le propriétaire ne sert qu'à poser le
// décor et à relever ce qui est réellement en base, sous son drapeau d'entretien (ADR 0019).

import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, withOrg, withUser, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
	countVisible,
	firstRow,
	joinOrganisation,
	messageOfFailure,
	openDatabase,
	seedOrganisation,
	withMaintenance,
	type Organisation
} from './helpers.js';

/** Le message qui signale qu'une tentative a passé, et qu'on l'a annulée soi-même. */
const ROLLED_BACK = 'tentative passée, annulée par le test';
/** Une insertion refusée par une politique. */
const NO_POLICY = /row-level security policy/;
/** Un droit de colonne absent. */
const NO_RIGHT = /permission denied/;

/** Le contexte que l'application pose : l'organisation et la personne connectée, toujours les deux. */
interface Context {
	organizationId: string;
	userId: string;
}

/**
 * Ce que rend une tentative : le refus de la base, ou le nombre de lignes que l'écriture a touchées
 * (ou que la lecture a rendues). Une modification ou une suppression que la politique écarte ne lève
 * rien : elle touche zéro ligne, et c'est ce qu'on compte.
 */
type Outcome = { refused: string } | { rows: number };

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let superAdminHandle: DatabaseHandle;
let owner: Database;
let app: Database;
let superAdmin: Database;
let a: Organisation;
let b: Organisation;
/** L'éditrice de A qui tente chaque geste réservé. */
let editor: { id: string; email: string };
/** Une seconde responsable de A : la retirer ou la rétrograder ne bute pas sur la dernière. */
let second: { id: string; email: string };
/** Un collègue éditeur de A. */
let colleague: { id: string; email: string };
/** Responsable de B, éditrice de A : le rôle se lit dans l'organisation du contexte. */
let both: { id: string; email: string };
/** L'invitation en attente que `seedOrganisation` pose dans A. */
let pendingInvitation: string;
/** Une salle de A qu'aucun cours n'occupe : la supprimer ne dépend que du droit. */
let spareRoom: string;
/** La période d'horaires de A. */
let period: string;
/** Le cours de A, publié, que `seedOrganisation` pose. */
let courseOfA: string;
/**
 * Une organisation dont toutes les invitations sont en attente, et qui n'a pas encore de réglages
 * des prières : le décor des gestes qui éprouvent une politique d'écriture seule.
 */
let c: Organisation;
/** L'éditrice de C, entrée sans invitation : aucune invitation ne porte son adresse. */
let quiet: { id: string; email: string };

/** Un compte sans organisation, créé par le propriétaire. */
async function account(label: string): Promise<{ id: string; email: string }> {
	const id = newId();
	const email = `${label}@example.test`;
	await withMaintenance(owner, (tx) =>
		tx.execute(sql`insert into "user" ("id", "email") values (${id}, ${email})`)
	);
	return { id, email };
}

const inA = (userId: string): Context => ({ organizationId: a.id, userId });

/**
 * Le nombre de lignes qu'une instruction a touchées, ou qu'une lecture a rendues : celui que le
 * pilote relève de la réponse du serveur. Une écriture sans `returning` le donne aussi, et c'est ce
 * qui permet d'éprouver une politique d'écriture sans que celle de lecture s'en mêle.
 */
function touched(result: unknown): number {
	const count = (result as { count?: unknown }).count;
	return typeof count === 'number' ? count : allRows(result).length;
}

/** Joue une instruction dans le contexte donné, puis annule tout : chaque cas part du même décor. */
async function attempt(db: Database, context: Context | string, statement: SQL): Promise<Outcome> {
	let rows = 0;
	const message = await messageOfFailure(() =>
		withOrg(db, context, async (tx) => {
			rows = touched(await tx.execute(statement));
			throw new Error(ROLLED_BACK);
		})
	);
	return message === ROLLED_BACK ? { rows } : { refused: message };
}

/** Ce que la base répond sur la personne du contexte, lu par le rôle applicatif. */
async function isOrgAdmin(context: Context | string): Promise<boolean | undefined> {
	return firstRow<{ admin: boolean }>(
		await withOrg(app, context, (tx) => tx.execute(sql`select jadwal.is_org_admin() as admin`))
	)?.admin;
}

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	superAdminHandle = openDatabase('superadmin');
	owner = ownerHandle.db;
	app = appHandle.db;
	superAdmin = superAdminHandle.db;
	a = await seedOrganisation(owner, 'roles-a');
	b = await seedOrganisation(owner, 'roles-b');
	editor = await account('editrice-roles-a');
	second = await account('seconde-roles-a');
	colleague = await account('collegue-roles-a');
	both = await account('responsable-b-editrice-a');
	await joinOrganisation(owner, app, a.id, editor.id, editor.email, 'editor');
	await joinOrganisation(owner, app, a.id, second.id, second.email, 'org_admin');
	await joinOrganisation(owner, app, a.id, colleague.id, colleague.email, 'editor');
	await joinOrganisation(owner, app, a.id, both.id, both.email, 'editor');
	await joinOrganisation(owner, app, b.id, both.id, both.email, 'org_admin');
	spareRoom = newId();
	await withMaintenance(owner, (tx) =>
		tx.execute(sql`
			insert into "room" ("id", "organization_id", "name", "display_order")
			values (${spareRoom}, ${a.id}, 'Salle libre', 9)
		`)
	);
	// Les invitations des quatre personnes ci-dessus sont consommées par leur adhésion : il ne reste
	// en attente que celle que `seedOrganisation` pose.
	const lookup = async (query: SQL) =>
		String(firstRow<{ id: string }>(await withMaintenance(owner, (tx) => tx.execute(query)))?.id);
	pendingInvitation = await lookup(sql`
		select "id" from "invitation" where "organization_id" = ${a.id} and "status" = 'pending'
	`);
	period = await lookup(sql`select "id" from "prayer_period" where "organization_id" = ${a.id}`);
	courseOfA = await lookup(sql`select "id" from "course" where "organization_id" = ${a.id}`);
	// C garde la seule invitation que `seedOrganisation` pose, en attente. Son éditrice entre par le
	// propriétaire et non par une invitation : une invitation consommée ne change plus de statut
	// (migration 0058), et une instruction sans WHERE qui la toucherait lèverait pour cette raison,
	// pas pour celle qu'on éprouve. Les réglages des prières de C sont retirés : sa première
	// insertion est une vraie insertion.
	c = await seedOrganisation(owner, 'roles-c');
	quiet = await account('editrice-roles-c');
	await withMaintenance(owner, async (tx) => {
		await tx.execute(sql`
			insert into "membership" ("id", "organization_id", "user_id", "role")
			values (${newId()}, ${c.id}, ${quiet.id}, 'editor')
		`);
		await tx.execute(sql`delete from "prayer_settings" where "organization_id" = ${c.id}`);
	});
});

afterAll(async () => {
	await superAdminHandle?.close();
	await appHandle?.close();
	await ownerHandle?.close();
});

/**
 * Les gestes que l'application réserve aux personnes responsables, tels que l'ADR 0046 les liste :
 * la route qui les porte, la table, l'instruction que l'écran écrit ou la plus proche. `admin` dit
 * combien de lignes la personne responsable touche ; l'éditrice, elle, doit être refusée ou n'en
 * toucher aucune.
 */
interface Gesture {
	name: string;
	statement: () => SQL;
	admin: number;
}

const GESTURES: Gesture[] = [
	{
		name: '/membres ?/inviter : écrire une invitation (invitation, insert)',
		statement: () => sql`
			insert into "invitation" ("id", "organization_id", "email", "role", "invited_by", "expires_at")
			values (${newId()}, ${a.id}, 'nouvelle-roles-a@example.test', 'editor', ${editor.id},
				now() + make_interval(hours => 14 * 24))
			returning "id"
		`,
		admin: 1
	},
	{
		name: '/membres ?/inviter : s’inviter soi-même comme responsable (invitation, insert)',
		statement: () => sql`
			insert into "invitation" ("id", "organization_id", "email", "role", "invited_by", "expires_at")
			values (${newId()}, ${a.id}, ${editor.email}, 'org_admin', ${editor.id},
				now() + make_interval(hours => 14 * 24))
			returning "id"
		`,
		admin: 1
	},
	{
		name: '/membres ?/annuler et ?/inviter : clore une invitation en attente (invitation, update)',
		statement: () => sql`
			update "invitation" set "status" = 'cancelled', "resolved_at" = now()
			where "id" = ${pendingInvitation} and "status" = 'pending'
			returning "id"
		`,
		admin: 1
	},
	{
		name: 'aucun écran : supprimer une invitation (invitation, delete)',
		statement: () => sql`delete from "invitation" where "id" = ${pendingInvitation} returning "id"`,
		admin: 1
	},
	{
		name: '/membres : lire les invitations en attente (invitation, select)',
		statement: () => sql`
			select "id", "email" from "invitation"
			where "organization_id" = ${a.id} and "status" = 'pending'
		`,
		admin: 1
	},
	{
		name: '/membres ?/role : se passer responsable (membership, update)',
		statement: () => sql`
			update "membership" set "role" = 'org_admin', "updated_at" = now()
			where "organization_id" = ${a.id} and "user_id" = ${editor.id}
			returning "id"
		`,
		admin: 1
	},
	{
		name: '/membres ?/role : passer une responsable éditrice (membership, update)',
		statement: () => sql`
			update "membership" set "role" = 'editor', "updated_at" = now()
			where "organization_id" = ${a.id} and "user_id" = ${second.id}
			returning "id"
		`,
		admin: 1
	},
	{
		name: '/membres ?/retirer : retirer un éditeur (membership, delete)',
		statement: () => sql`
			delete from "membership" where "organization_id" = ${a.id} and "user_id" = ${colleague.id}
			returning "id"
		`,
		admin: 1
	},
	{
		name: '/membres ?/retirer : retirer une responsable (membership, delete)',
		statement: () => sql`
			delete from "membership" where "organization_id" = ${a.id} and "user_id" = ${second.id}
			returning "id"
		`,
		admin: 1
	},
	{
		name: '/reglages ?/enregistrer : nom, fuseau, couleur, formule, langues (organization, update)',
		statement: () => sql`
			update "organization" set "name" = 'Nom changé', "greeting" = 'Bonjour',
				"accent_color" = '#123456', "updated_at" = now()
			where "id" = ${a.id}
			returning "id"
		`,
		admin: 1
	},
	{
		name: '/reglages ?/modulePrieres : éteindre le module des prières (organization, update)',
		statement: () => sql`
			update "organization" set "prayer_module" = false, "updated_at" = now()
			where "id" = ${a.id}
			returning "id"
		`,
		admin: 1
	},
	{
		name: '/reglages ?/ajouterSalle : ajouter une salle (room, insert)',
		statement: () => sql`
			insert into "room" ("id", "organization_id", "name", "display_order")
			values (${newId()}, ${a.id}, 'Salle neuve', 10)
			returning "id"
		`,
		admin: 1
	},
	{
		name: 'aucun écran : renommer une salle (room, update)',
		statement: () => sql`
			update "room" set "name" = 'Salle renommée' where "id" = ${spareRoom} returning "id"
		`,
		admin: 1
	},
	{
		name: '/reglages ?/supprimerSalle : supprimer une salle (room, delete)',
		statement: () => sql`delete from "room" where "id" = ${spareRoom} returning "id"`,
		admin: 1
	},
	{
		name: '/prieres ?/enregistrer : position et méthode de calcul (prayer_settings, insert ou update)',
		statement: () => sql`
			insert into "prayer_settings" ("organization_id", "latitude", "longitude")
			values (${a.id}, 46.2, 6.1)
			on conflict ("organization_id") do update set "latitude" = 46.2, "longitude" = 6.1
			returning "organization_id"
		`,
		admin: 1
	},
	{
		name: 'aucun écran : supprimer les réglages des prières (prayer_settings, delete)',
		statement: () => sql`
			delete from "prayer_settings" where "organization_id" = ${a.id} returning "organization_id"
		`,
		admin: 1
	},
	{
		name: '/prieres ?/confirmer : importer des heures (prayer_day, insert ou update)',
		statement: () => sql`
			insert into "prayer_day" ("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib", "isha", "source")
			values (${a.id}, '2026-10-01', '05:50', '13:15', '16:30', '19:05', '20:40', 'import')
			on conflict ("organization_id", "date") do update set "fajr" = excluded."fajr"
			returning "date"
		`,
		admin: 1
	},
	{
		name: '/prieres ?/confirmer : corriger une heure importée (prayer_day, update)',
		statement: () => sql`
			update "prayer_day" set "fajr" = '05:41'
			where "organization_id" = ${a.id} and "date" = '2026-09-21'
			returning "date"
		`,
		admin: 1
	},
	{
		name: '/prieres ?/effacer : effacer des heures importées (prayer_day, delete)',
		statement: () => sql`
			delete from "prayer_day" where "organization_id" = ${a.id} and "date" = '2026-09-21'
			returning "date"
		`,
		admin: 1
	},
	{
		name: '/prieres ?/periode et ?/dupliquerPeriode : écrire une période (prayer_period, insert)',
		statement: () => sql`
			insert into "prayer_period" ("id", "organization_id", "name", "from_date", "to_date",
				"maghrib_iqama_offset")
			values (${newId()}, ${a.id}, 'Horaires anciens', '2025-01-01', '2025-06-30', 5)
			returning "id"
		`,
		admin: 1
	},
	{
		name: '/prieres ?/periode : modifier une période (prayer_period, update)',
		statement: () => sql`
			update "prayer_period" set "name" = 'Période renommée' where "id" = ${period}
			returning "id"
		`,
		admin: 1
	},
	{
		name: '/prieres ?/supprimerPeriode : supprimer une période (prayer_period, delete)',
		statement: () => sql`delete from "prayer_period" where "id" = ${period} returning "id"`,
		admin: 1
	},
	{
		// L'écran Cours le propose à la personne responsable seule (`?/supprimer`) ; la base le réserve
		// aussi (migration 0065).
		name: '/cours ?/supprimer : supprimer un cours (course, delete)',
		statement: () => sql`delete from "course" where "id" = ${courseOfA} returning "id"`,
		admin: 1
	}
];

describe('les gestes réservés : l’éditrice est refusée, la personne responsable passe', () => {
	it.each(GESTURES.map((gesture) => [gesture.name, gesture] as const))('%s', async (_, gesture) => {
		const asEditor = await attempt(app, inA(editor.id), gesture.statement());
		// Refusée par la politique, ou rien de touché : les deux disent « non », selon l'opération.
		if ('refused' in asEditor) expect(asEditor.refused).toMatch(NO_POLICY);
		else expect(asEditor).toEqual({ rows: 0 });

		expect(await attempt(app, inA(a.userId), gesture.statement())).toEqual({
			rows: gesture.admin
		});
		// La seconde responsable, entrée par une invitation acceptée, passe aussi : ce n'est pas la
		// personne qui compte, c'est son rôle.
		expect(await attempt(app, inA(second.id), gesture.statement())).toEqual({
			rows: gesture.admin
		});
		// Le super-admin garde ses pouvoirs (ADR 0025), dans l'organisation où il est entré.
		expect(await attempt(superAdmin, a.id, gesture.statement())).toEqual({ rows: gesture.admin });
	});

	it('reads the role in the organisation of the context, not in another one', async () => {
		// Responsable de B, éditrice de A : c'est la faille de l'étape 17, où la première adhésion
		// venue donnait son rôle. Dans A, la base la traite en éditrice ; dans B, en responsable.
		expect(await isOrgAdmin(inA(both.id))).toBe(false);
		expect(await isOrgAdmin({ organizationId: b.id, userId: both.id })).toBe(true);
		const invite = (organizationId: string) => sql`
			insert into "invitation" ("id", "organization_id", "email", "role", "invited_by", "expires_at")
			values (${newId()}, ${organizationId}, ${both.email}, 'org_admin', ${both.id},
				now() + make_interval(hours => 14 * 24))
			returning "id"
		`;
		const inOrgA = await attempt(app, inA(both.id), invite(a.id));
		expect('refused' in inOrgA ? inOrgA.refused : inOrgA).toMatch(NO_POLICY);
		expect(await attempt(app, { organizationId: b.id, userId: both.id }, invite(b.id))).toEqual({
			rows: 1
		});
	});

	it('takes nobody for a responsible person without a person, or without an organisation', async () => {
		// Le contexte d'une organisation seule, sans personne : un script qui l'oublierait écrivait
		// jusqu'ici comme n'importe quel membre. Il n'écrit plus rien de réservé.
		expect(await isOrgAdmin(a.id)).toBe(false);
		const settings = sql`update "organization" set "greeting" = 'Sans personne'
			where "id" = ${a.id} returning "id"`;
		expect(await attempt(app, a.id, settings)).toEqual({ rows: 0 });
		// Il lit encore ce que tout membre lit, mais plus les invitations, que seule une personne
		// responsable lit (addendum de l'ADR 0013), ni les adhésions depuis la migration 0064.
		for (const table of [
			'organization',
			'room',
			'prayer_settings',
			'prayer_day',
			'prayer_period'
		]) {
			expect(await countVisible(app, a.id, table), table).toBeGreaterThan(0);
		}
		expect(await countVisible(app, a.id, 'invitation')).toBe(0);
		expect(await countVisible(app, a.id, 'membership')).toBe(0);
		expect(await countVisible(app, inA(a.userId), 'invitation')).toBeGreaterThan(0);
		// La personne seule, sans organisation.
		const alone = firstRow<{ admin: boolean }>(
			await withUser(app, a.userId, (tx) => tx.execute(sql`select jadwal.is_org_admin() as admin`))
		);
		expect(alone?.admin).toBe(false);
		// La responsable de B, avec le contexte de A, où elle n'est rien.
		expect(await isOrgAdmin(inA(b.userId))).toBe(false);
		expect(await attempt(app, inA(b.userId), settings)).toEqual({ rows: 0 });
	});

	it('closes the chain of step 17: an editor who invites herself as responsible, then accepts', async () => {
		// L'attaque que l'ADR 0017 laissait ouverte, tentée jusqu'au bout. La première marche tombe.
		const invitationId = newId();
		const message = await messageOfFailure(() =>
			withOrg(app, inA(editor.id), (tx) =>
				tx.execute(sql`
					insert into "invitation" ("id", "organization_id", "email", "role", "invited_by", "expires_at")
					values (${invitationId}, ${a.id}, ${editor.email}, 'org_admin', ${editor.id},
						now() + make_interval(hours => 14 * 24))
				`)
			)
		);
		expect(message).toMatch(NO_POLICY);
		// Et rien n'existe à accepter.
		const stored = await withMaintenance(owner, (tx) =>
			tx.execute(sql`select 1 from "invitation" where "id" = ${invitationId}`)
		);
		expect(allRows(stored)).toEqual([]);
		// Elle reste éditrice.
		const role = firstRow<{ role: string }>(
			await withMaintenance(owner, (tx) =>
				tx.execute(sql`
					select "role" from "membership"
					where "organization_id" = ${a.id} and "user_id" = ${editor.id}
				`)
			)
		);
		expect(role?.role).toBe('editor');
	});
});

/**
 * La liste des membres et leurs comptes (étape 19, migration 0064). Jusqu'ici, tout membre les
 * lisait par un appel direct, nom et adresse compris : aucun écran ne les montrait à un éditeur, mais
 * une erreur de l'application qui l'aurait fait n'aurait pas été arrêtée. La personne responsable et
 * le super-admin lisent la liste comme avant ; l'éditrice ne lit plus que sa propre adhésion et son
 * propre compte.
 */
describe('la liste des membres : la personne responsable la lit, l’éditrice ne lit que la sienne', () => {
	/** Ce que la base rend, par le rôle et le contexte donnés, d'une lecture qui rend des personnes. */
	async function people(db: Database, context: Context | string, query: SQL): Promise<string[]> {
		const found = await withOrg(db, context, async (tx) =>
			allRows<{ person: string }>(await tx.execute(query))
		);
		return found.map((row) => row.person).sort();
	}

	/** Les membres de A, relevés par le propriétaire sous son drapeau d'entretien. */
	async function membersOfA(): Promise<string[]> {
		const found = await withMaintenance(owner, async (tx) =>
			allRows<{ person: string }>(
				await tx.execute(sql`
					select "user_id" as person from "membership" where "organization_id" = ${a.id}
				`)
			)
		);
		return found.map((row) => row.person).sort();
	}

	it('shows an editor her own membership and her own account, and nobody else’s', async () => {
		const asEditor = inA(editor.id);
		// La table des adhésions, entière, puis filtrée sur l'organisation comme le ferait un écran.
		expect(await people(app, asEditor, sql`select "user_id" as person from "membership"`)).toEqual([
			editor.id
		]);
		expect(
			await people(
				app,
				asEditor,
				sql`select "user_id" as person from "membership" where "organization_id" = ${a.id}`
			)
		).toEqual([editor.id]);
		// Les comptes, et la jointure de l'écran Membres, avec l'adresse de chacun.
		expect(await people(app, asEditor, sql`select "id" as person from "user"`)).toEqual([
			editor.id
		]);
		expect(
			await people(
				app,
				asEditor,
				sql`select u."email" as person from "membership" m join "user" u on u."id" = m."user_id"
					where m."organization_id" = ${a.id}`
			)
		).toEqual([editor.email]);
		// Un collègue et la personne responsable, cherchés par leur identifiant.
		for (const other of [colleague.id, a.userId]) {
			expect(
				await people(app, asEditor, sql`select "email" as person from "user" where "id" = ${other}`)
			).toEqual([]);
			expect(
				await people(
					app,
					asEditor,
					sql`select "role" as person from "membership" where "user_id" = ${other}`
				)
			).toEqual([]);
		}
	});

	it('lets the manager, and the super-admin who entered the organisation, read the list as before', async () => {
		const expected = await membersOfA();
		expect(expected.length).toBeGreaterThanOrEqual(5);
		const query = sql`select m."user_id" as person from "membership" m
			join "user" u on u."id" = m."user_id" where m."organization_id" = ${a.id}`;
		for (const manager of [a.userId, second.id]) {
			expect(await people(app, inA(manager), query), manager).toEqual(expected);
		}
		// Le super-admin n'est membre de rien : c'est sa propre politique qui lui montre la liste.
		expect(await people(superAdmin, a.id, query)).toEqual(expected);
	});

	it('reads no membership at all without a person in the context', async () => {
		// Un script qui ne poserait que l'organisation ne lit plus les membres : il n'y a personne
		// dont la base puisse dire qu'elle est responsable.
		expect(await countVisible(app, a.id, 'membership')).toBe(0);
		expect(await countVisible(app, a.id, 'user')).toBe(0);
	});

	it('lets an editor name herself in what she writes, and a manager any member', async () => {
		// La garde des personnes désignées (ADR 0013) passe par ce que la personne voit : l'éditrice
		// ne voit plus ses collègues, elle ne les nomme plus. L'application ne lui fait jamais écrire
		// que son propre nom (`created_by`, `updated_by`, l'auteur du journal).
		const pause = (author: string) => sql`
			insert into "pause" ("id", "organization_id", "from_date", "to_date", "reason", "created_by")
			values (${newId()}, ${a.id}, '2026-11-02', '2026-11-08', 'Travaux', ${author})
			returning "id"
		`;
		expect(await attempt(app, inA(editor.id), pause(colleague.id))).toEqual({
			refused: expect.stringMatching(NO_POLICY)
		});
		expect(await attempt(app, inA(editor.id), pause(editor.id))).toEqual({ rows: 1 });
		expect(await attempt(app, inA(a.userId), pause(colleague.id))).toEqual({ rows: 1 });
	});
});

/**
 * Le journal (étape 19, migration 0070). L'écran Membres y écrit l'adresse et le rôle de chaque
 * personne invitée, et l'acceptation d'une invitation y est signée de la personne qui entre : une
 * éditrice qui le lisait par un appel direct reconstituait la liste des membres que la migration
 * 0064 lui retire, et les invitations que la migration 0059 lui retire. Aucun écran ne montre le
 * journal. La personne responsable et le super-admin le lisent comme avant.
 */
describe('le journal : la personne responsable le lit, l’éditrice n’en lit rien', () => {
	/** L'invitation que les deux entrées décrivent. */
	const invitationId = newId();
	const journal = () => sql`
		select "actor_id", "action", "after" from "audit_log" where "organization_id" = ${a.id}
	`;
	/** Ce que le journal rend de l'invitation, par le rôle et le contexte donnés. */
	async function traces(db: Database, context: Context | string) {
		const found = await withOrg(db, context, async (tx) =>
			allRows<{ actor_id: string; action: string; after: { email?: string } | null }>(
				await tx.execute(sql`
					select "actor_id", "action", "after" from "audit_log"
					where "target_id" = ${invitationId} order by "action"
				`)
			)
		);
		return found.map((row) => [row.action, row.actor_id, row.after?.email ?? null]);
	}

	beforeAll(async () => {
		// Les deux entrées, telles que `record` les écrit : l'invitation par la personne responsable,
		// avec l'adresse et le rôle, puis l'acceptation par la collègue, qui la signe.
		await withOrg(app, inA(a.userId), (tx) =>
			tx.execute(sql`
				insert into "audit_log" ("id", "organization_id", "actor_id", "action", "target_table",
					"target_id", "after")
				values (${newId()}, ${a.id}, ${a.userId}, 'invitation.create', 'invitation',
					${invitationId}, ${JSON.stringify({ email: colleague.email, role: 'editor' })}::jsonb)
			`)
		);
		await withOrg(app, inA(colleague.id), (tx) =>
			tx.execute(sql`
				insert into "audit_log" ("id", "organization_id", "actor_id", "action", "target_table",
					"target_id", "after")
				values (${newId()}, ${a.id}, ${colleague.id}, 'invitation.accept', 'invitation',
					${invitationId}, ${JSON.stringify({ role: 'editor' })}::jsonb)
			`)
		);
	});

	it('shows an editor nothing of the journal, neither the addresses nor the authors', async () => {
		// L'éditrice, et la collègue qui a pourtant signé l'une des deux entrées.
		for (const person of [editor.id, colleague.id]) {
			expect(await traces(app, inA(person)), person).toEqual([]);
			expect(await attempt(app, inA(person), journal()), person).toEqual({ rows: 0 });
		}
	});

	it('lets the manager, and the super-admin who entered the organisation, read it as before', async () => {
		const expected = [
			['invitation.accept', colleague.id, null],
			['invitation.create', a.userId, colleague.email]
		];
		for (const manager of [a.userId, second.id]) {
			expect(await traces(app, inA(manager)), manager).toEqual(expected);
		}
		expect(await traces(superAdmin, a.id)).toEqual(expected);
	});

	it('reads no entry at all without a person in the context', async () => {
		expect(await countVisible(app, a.id, 'audit_log')).toBe(0);
	});
});

/**
 * Une modification ou une suppression qui nomme une colonne, dans son WHERE ou son `returning`,
 * passe aussi par la politique de lecture. L'éditrice ne lit pas les invitations de son
 * organisation : elle ne touchait donc rien dans les gestes ci-dessus, même si la politique
 * d'écriture l'avait laissée faire, et c'est la lecture qui répondait à sa place. Une instruction
 * qui ne nomme aucune colonne atteint tout ce que la politique d'écriture permet, et rien d'autre :
 * c'est elle qu'on éprouve ici, dans C.
 *
 * Même chose pour les réglages des prières : quand la ligne existe, « ajouter ou modifier » devient
 * une modification, et c'est la politique de modification qui répond. C n'a pas encore de
 * réglages : la première fois que l'écran les enregistre, c'est une insertion.
 */
const WRITE_ONLY_GESTURES: Gesture[] = [
	{
		name: 'aucun écran, sans WHERE : clore toutes les invitations de l’organisation (invitation, update)',
		statement: () => sql`update "invitation" set "status" = 'cancelled', "resolved_at" = now()`,
		admin: 1
	},
	{
		name: 'aucun écran, sans WHERE : supprimer toutes les invitations de l’organisation (invitation, delete)',
		statement: () => sql`delete from "invitation"`,
		admin: 1
	},
	{
		name: '/prieres ?/enregistrer, la première fois : créer les réglages des prières (prayer_settings, insert)',
		statement: () => sql`
			insert into "prayer_settings" ("organization_id", "latitude", "longitude")
			values (${c.id}, 46.2, 6.1)
			on conflict ("organization_id") do update set "latitude" = 46.2, "longitude" = 6.1
		`,
		admin: 1
	},
	{
		name: 'aucun écran, sans WHERE : supprimer tous les cours de l’organisation (course, delete)',
		statement: () => sql`delete from "course"`,
		admin: 1
	}
];

describe('les politiques d’écriture elles-mêmes, sans que la lecture réponde à leur place', () => {
	const inC = (userId: string): Context => ({ organizationId: c.id, userId });

	it.each(WRITE_ONLY_GESTURES.map((gesture) => [gesture.name, gesture] as const))(
		'%s',
		async (_, gesture) => {
			const asEditor = await attempt(app, inC(quiet.id), gesture.statement());
			if ('refused' in asEditor) expect(asEditor.refused).toMatch(NO_POLICY);
			else expect(asEditor).toEqual({ rows: 0 });

			expect(await attempt(app, inC(c.userId), gesture.statement())).toEqual({
				rows: gesture.admin
			});
			expect(await attempt(superAdmin, c.id, gesture.statement())).toEqual({
				rows: gesture.admin
			});
		}
	);

	it('starts from what the four gestures need: one pending invitation, no prayer settings, one course', async () => {
		// Sans ce décor, les quatre gestes ci-dessus ne toucheraient rien, pour personne, et
		// l'éditrice passerait pour refusée alors qu'il n'y avait rien à toucher.
		const state = firstRow<{ pending: number; others: number; settings: number; courses: number }>(
			await withMaintenance(owner, (tx) =>
				tx.execute(sql`
					select
						(select count(*)::int from "invitation"
							where "organization_id" = ${c.id} and "status" = 'pending') as pending,
						(select count(*)::int from "invitation"
							where "organization_id" = ${c.id} and "status" <> 'pending') as others,
						(select count(*)::int from "prayer_settings"
							where "organization_id" = ${c.id}) as settings,
						(select count(*)::int from "course"
							where "organization_id" = ${c.id} and "kind" = 'course') as courses
				`)
			)
		);
		expect(state).toEqual({ pending: 1, others: 0, settings: 0, courses: 1 });
		expect(await isOrgAdmin(inC(quiet.id))).toBe(false);
	});
});

describe('ce que ni l’éditeur ni la personne responsable ne font : le plan, l’état, l’adresse', () => {
	it('leaves the plan, the state and the web address to the super-admin', async () => {
		// L'écran des réglages n'écrit que huit colonnes. Le plan, l'état et l'identifiant d'URL
		// relèvent du super-admin (ADR 0025) : un appel direct les écrivait sous le rôle applicatif.
		const writes: [string, SQL][] = [
			[
				'plan',
				sql`update "organization" set "plan" = 'sponsored' where "id" = ${a.id} returning "id"`
			],
			[
				'status',
				sql`update "organization" set "status" = 'suspended' where "id" = ${a.id} returning "id"`
			],
			[
				'slug',
				sql`update "organization" set "slug" = 'roles-a-bis' where "id" = ${a.id} returning "id"`
			],
			[
				'created_at',
				sql`update "organization" set "created_at" = now() where "id" = ${a.id} returning "id"`
			]
		];
		for (const [column, write] of writes) {
			for (const person of [editor.id, a.userId]) {
				expect(await attempt(app, inA(person), write), `${column} par ${person}`).toEqual({
					refused: expect.stringMatching(NO_RIGHT)
				});
			}
			expect(await attempt(superAdmin, a.id, write), `${column} par le super-admin`).toEqual({
				rows: 1
			});
		}
	});
});

describe('ce que l’éditeur fait toujours', () => {
	it('lets an editor, whom the base does not take for a responsible person, keep the programme', async () => {
		expect(await isOrgAdmin(inA(editor.id))).toBe(false);
		expect(await isOrgAdmin(inA(a.userId))).toBe(true);
		const courseId = newId();
		const roomId = String(
			firstRow<{ id: string }>(
				await withMaintenance(owner, (tx) =>
					tx.execute(sql`
						select "id" from "room" where "organization_id" = ${a.id} and "id" <> ${spareRoom}
					`)
				)
			)?.id
		);
		// Les écritures des écrans « Cours », « À venir » et « Vendredi », mot pour mot ou presque,
		// dans une seule transaction annulée à la fin.
		const outcome = await messageOfFailure(() =>
			withOrg(app, inA(editor.id), async (tx) => {
				await tx.execute(sql`
					insert into "course" (
						"id", "organization_id", "status", "audience", "teaching_language", "room_id",
						"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
						"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "starts_on",
						"updated_by"
					) values (
						${courseId}, ${a.id}, 'draft', 'adults', array['fr'], ${roomId},
						'fr', 'weekly', array[2]::smallint[], 1, '2026-09-08', 'fixed', '18:00', '19:00',
						'2026-09-08', ${editor.id}
					)
				`);
				await tx.execute(sql`
					insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
					values (${newId()}, ${a.id}, ${courseId}, 'fr', 'Cours de l’éditrice')
				`);
				await tx.execute(sql`
					update "course" set "status" = 'published', "updated_at" = now(),
						"updated_by" = ${editor.id}
					where "id" = ${courseId}
				`);
				await tx.execute(sql`
					insert into "session_exception"
						("id", "organization_id", "course_id", "date", "kind", "created_by")
					values (${newId()}, ${a.id}, ${courseId}, '2026-09-15', 'cancelled', ${editor.id})
					on conflict ("course_id", "date") do update
						set "kind" = 'cancelled', "to_date" = null, "to_start" = null
				`);
				await tx.execute(sql`
					delete from "session_exception" where "course_id" = ${courseId} and "date" = '2026-09-15'
				`);
				await tx.execute(sql`
					insert into "pause" ("id", "organization_id", "course_id", "from_date", "to_date",
						"reason", "created_by")
					values (${newId()}, ${a.id}, ${courseId}, '2026-10-05', '2026-10-18', 'Vacances',
						${editor.id})
				`);
				await tx.execute(sql`
					insert into "audit_log" ("id", "organization_id", "actor_id", "action", "target_table", "target_id")
					values (${newId()}, ${a.id}, ${editor.id}, 'course.create', 'course', ${courseId})
				`);
				await tx.execute(sql`
					insert into "terms_acceptance" ("id", "organization_id", "user_id", "version")
					values (${newId()}, ${a.id}, ${editor.id}, '2026-08-01')
				`);
				// Supprimer un cours, même le sien, est réservé depuis la migration 0065 : la
				// suppression est écartée sans erreur, et le cours reste.
				const deleted = allRows(
					await tx.execute(sql`delete from "course" where "id" = ${courseId} returning "id"`)
				);
				expect(deleted).toHaveLength(0);
				throw new Error(ROLLED_BACK);
			})
		);
		expect(outcome).toBe(ROLLED_BACK);
	});

	it('lets an editor delete a Friday session, as the Vendredi screen offers her', async () => {
		// La suppression d'un cours est réservée depuis la migration 0065 ; celle d'une session du
		// vendredi ne l'est pas : l'écran Vendredi la propose à l'éditeur (ADR 0033, ADR 0046).
		const outcome = await messageOfFailure(() =>
			withOrg(app, inA(editor.id), async (tx) => {
				const sessionId = newId();
				await tx.execute(sql`
					insert into "course" (
						"id", "organization_id", "kind", "jumua_order", "status", "audience",
						"teaching_language", "source_language", "recurrence_kind", "recurrence_weekday",
						"recurrence_interval", "recurrence_anchor_date", "timing_kind", "timing_start",
						"timing_end", "starts_on", "updated_by"
					) values (
						${sessionId}, ${a.id}, 'jumua', 2, 'published', 'open', array['fr'], 'fr',
						'weekly', array[5]::smallint[], 1, '2026-09-11', 'fixed', '13:30', '14:10',
						'2026-09-11', ${editor.id}
					)
				`);
				// L'instruction de l'écran Vendredi, `kind = 'jumua'` compris.
				const deleted = allRows(
					await tx.execute(sql`
						delete from "course" where "id" = ${sessionId} and "kind" = 'jumua' returning "id"
					`)
				);
				expect(deleted).toHaveLength(1);
				throw new Error(ROLLED_BACK);
			})
		);
		expect(outcome).toBe(ROLLED_BACK);
	});
});

/**
 * Le type d'un cours ne change pas (migration 0069). La suppression d'une session du vendredi reste
 * ouverte à l'éditeur, et celle d'un cours ne l'est plus (migration 0065) : si un cours pouvait
 * devenir une session, l'éditrice le supprimerait en deux instructions, la modification qui en fait
 * une session, puis la suppression. Aucun écran ne change le type d'une ligne, et la base le refuse
 * à tout le monde.
 */
describe('le type d’un cours ne change pas', () => {
	/** Le refus du déclencheur. */
	const KIND_KEPT = /keeps its kind/;
	/** Ce qui fait du cours de A une session du vendredi, pour les contraintes de forme. */
	const intoFriday = () => sql`
		update "course" set "kind" = 'jumua', "jumua_order" = 3,
			"recurrence_weekday" = array[5]::smallint[], "recurrence_anchor_date" = '2026-09-11'
		where "id" = ${courseOfA}
		returning "id"
	`;

	it('refuses an editor who would make a course a Friday session, then delete it', async () => {
		// L'attaque en deux temps, dans une seule transaction : la modification, puis la suppression
		// que la politique laisse à l'éditrice pour une session du vendredi.
		let deleted = -1;
		const message = await messageOfFailure(() =>
			withOrg(app, inA(editor.id), async (tx) => {
				await tx.execute(intoFriday());
				deleted = touched(
					await tx.execute(sql`delete from "course" where "id" = ${courseOfA} returning "id"`)
				);
				throw new Error(ROLLED_BACK);
			})
		);
		expect(message).toMatch(KIND_KEPT);
		expect(deleted).toBe(-1);
		// Le cours est toujours là, et toujours un cours.
		const kept = firstRow<{ kind: string }>(
			await withMaintenance(owner, (tx) =>
				tx.execute(sql`select "kind" from "course" where "id" = ${courseOfA}`)
			)
		);
		expect(kept).toEqual({ kind: 'course' });
	});

	it('keeps the kind of every row, whoever writes it, in both directions', async () => {
		// La personne responsable et le super-admin non plus : aucun écran ne le fait, et la règle ne
		// dépend pas du rôle.
		for (const [who, db, context] of [
			['responsable', app, inA(a.userId)],
			['super-admin', superAdmin, a.id]
		] as const) {
			const outcome = await attempt(db, context, intoFriday());
			expect('refused' in outcome ? outcome.refused : JSON.stringify(outcome), who).toMatch(
				KIND_KEPT
			);
		}
		// Et une session du vendredi ne devient pas un cours.
		const outcome = await messageOfFailure(() =>
			withOrg(app, inA(editor.id), async (tx) => {
				const sessionId = newId();
				await tx.execute(sql`
					insert into "course" (
						"id", "organization_id", "kind", "jumua_order", "status", "audience",
						"teaching_language", "source_language", "recurrence_kind", "recurrence_weekday",
						"recurrence_interval", "recurrence_anchor_date", "timing_kind", "timing_start",
						"timing_end", "starts_on", "updated_by"
					) values (
						${sessionId}, ${a.id}, 'jumua', 2, 'published', 'open', array['fr'], 'fr',
						'weekly', array[5]::smallint[], 1, '2026-09-11', 'fixed', '13:30', '14:10',
						'2026-09-11', ${editor.id}
					)
				`);
				await tx.execute(sql`
					update "course" set "kind" = 'course', "jumua_order" = null where "id" = ${sessionId}
				`);
				throw new Error(ROLLED_BACK);
			})
		);
		expect(outcome).toMatch(KIND_KEPT);
	});

	it('lets every write that keeps the kind pass, as the screens write it', async () => {
		// `updateCourse` réécrit le type à chaque modification, avec la valeur qu'il a déjà : ce
		// n'est pas un changement, et rien n'est refusé.
		const same = sql`
			update "course" set "kind" = 'course', "jumua_order" = null, "teacher" = 'Intervenant'
			where "id" = ${courseOfA}
			returning "id"
		`;
		expect(await attempt(app, inA(editor.id), same)).toEqual({ rows: 1 });
		expect(await attempt(app, inA(a.userId), same)).toEqual({ rows: 1 });
		expect(await attempt(superAdmin, a.id, same)).toEqual({ rows: 1 });
	});
});

describe('le parcours ordinaire', () => {
	it('gives the invited person the role of her invitation, and the base reads it', async () => {
		for (const role of ['editor', 'org_admin'] as const) {
			const person = await account(`invitee-${role}-roles-a`);
			const invitationId = newId();
			// La personne responsable invite, avec l'insertion de l'écran des membres.
			await withOrg(app, inA(a.userId), (tx) =>
				tx.execute(sql`
					insert into "invitation" ("id", "organization_id", "email", "role", "invited_by", "expires_at")
					values (${invitationId}, ${a.id}, ${person.email}, ${role}, ${a.userId},
						now() + make_interval(hours => 14 * 24))
				`)
			);
			// Sans contexte d'organisation, la personne voit l'invitation reçue à son adresse, et
			// l'accepte ; puis l'écran pose l'organisation et crée l'adhésion avec le rôle invité.
			await withUser(app, person.id, async (tx) => {
				const seen = allRows<{ id: string }>(
					await tx.execute(sql`select "id" from "invitation" where "status" = 'pending'`)
				);
				expect(seen.map((row) => row.id)).toEqual([invitationId]);
				const claimed = allRows(
					await tx.execute(sql`
						update "invitation"
						set "status" = 'accepted', "accepted_by" = ${person.id}, "resolved_at" = now()
						where "id" = ${invitationId} and "status" = 'pending' and "expires_at" > now()
						returning "role"
					`)
				);
				expect(claimed).toEqual([{ role }]);
				await tx.execute(sql`select set_config('jadwal.org_id', ${a.id}, true)`);
				await tx.execute(sql`
					insert into "membership" ("id", "organization_id", "user_id", "role")
					values (${newId()}, ${a.id}, ${person.id}, ${role})
				`);
			});
			// Sans contexte d'organisation, elle retrouve ses adhésions.
			const mine = allRows<{ organization_id: string; role: string }>(
				await withUser(app, person.id, (tx) =>
					tx.execute(sql`select "organization_id", "role" from "membership"`)
				)
			);
			expect(mine).toEqual([{ organization_id: a.id, role }]);
			// Et la base lit son rôle comme l'invitation le disait.
			expect(await isOrgAdmin(inA(person.id))).toBe(role === 'org_admin');
		}
	});
});

/**
 * Quitter une organisation, seule (étape 19, migration 0066). La migration 0059 réservait toute
 * suppression d'adhésion à la personne responsable : un éditeur ne pouvait plus retirer la sienne.
 * Le chef de projet veut qu'une personne puisse partir d'elle-même ; l'écran « Vos organisations »
 * le propose. La base lui laisse supprimer sa propre adhésion, dans l'organisation du contexte,
 * et rien de plus. La dernière personne responsable ne part pas : le déclencheur de la migration
 * 0012 la retient.
 *
 * Tout se joue dans D, pour que les départs ne changent rien au décor de A.
 */
describe('quitter l’organisation', () => {
	let d: Organisation;
	/** L'éditrice qui part d'elle-même. */
	let leaver: { id: string; email: string };
	/** L'éditrice que la personne responsable retire : le départ doit effacer la même chose. */
	let removed: { id: string; email: string };
	/** Une collègue qui reste. */
	let stays: { id: string; email: string };
	const inD = (userId: string): Context => ({ organizationId: d.id, userId });

	/** Ce qui reste d'une personne dans D, relevé par le propriétaire sous son drapeau. */
	async function footprint(userId: string) {
		return firstRow<{
			account: number;
			membership: number;
			terms: number;
			invitations: string;
		}>(
			await withMaintenance(owner, (tx) =>
				tx.execute(sql`
					select
						(select count(*)::int from "user" where "id" = ${userId}) as account,
						(select count(*)::int from "membership"
							where "organization_id" = ${d.id} and "user_id" = ${userId}) as membership,
						(select count(*)::int from "terms_acceptance"
							where "organization_id" = ${d.id} and "user_id" = ${userId}) as terms,
						(select coalesce(string_agg("status", ',' order by "status"), '') from "invitation"
							where "organization_id" = ${d.id} and "accepted_by" = ${userId}) as invitations
				`)
			)
		);
	}

	beforeAll(async () => {
		d = await seedOrganisation(owner, 'roles-d');
		leaver = await account('partante-roles-d');
		removed = await account('retiree-roles-d');
		stays = await account('restante-roles-d');
		for (const person of [leaver, removed, stays]) {
			await joinOrganisation(owner, app, d.id, person.id, person.email, 'editor');
			// Chacune accepte les conditions, comme l'écran le lui demande à l'arrivée.
			await withOrg(app, inD(person.id), (tx) =>
				tx.execute(sql`
					insert into "terms_acceptance" ("id", "organization_id", "user_id", "version")
					values (${newId()}, ${d.id}, ${person.id}, '2026-09-27')
				`)
			);
		}
	});

	it('lets a person delete her own membership, and nothing more', async () => {
		const own = sql`
			delete from "membership" where "organization_id" = ${d.id} and "user_id" = ${leaver.id}
			returning "id"
		`;
		expect(await attempt(app, inD(leaver.id), own)).toEqual({ rows: 1 });
		// Sans WHERE, la suppression ne touche que sa propre adhésion.
		expect(await attempt(app, inD(leaver.id), sql`delete from "membership"`)).toEqual({ rows: 1 });
	});

	it('refuses an editor who would remove someone else, or leave another organisation', async () => {
		for (const other of [stays.id, d.userId]) {
			const theirs = sql`
				delete from "membership" where "organization_id" = ${d.id} and "user_id" = ${other}
				returning "id"
			`;
			expect(await attempt(app, inD(leaver.id), theirs), other).toEqual({ rows: 0 });
		}
		// Responsable de B, éditrice de A : dans le contexte de A, elle ne quitte pas B.
		const fromB = sql`
			delete from "membership" where "organization_id" = ${b.id} and "user_id" = ${both.id}
			returning "id"
		`;
		expect(await attempt(app, inA(both.id), fromB)).toEqual({ rows: 0 });
		expect(await attempt(app, inA(both.id), sql`delete from "membership"`)).toEqual({ rows: 1 });
	});

	it('refuses the last manager who would leave', async () => {
		const message = await messageOfFailure(() =>
			withOrg(app, inD(d.userId), (tx) =>
				tx.execute(sql`
					delete from "membership" where "organization_id" = ${d.id} and "user_id" = ${d.userId}
				`)
			)
		);
		expect(message).toMatch(/last org_admin/);
		expect(await footprint(d.userId)).toMatchObject({ membership: 1 });
	});

	it('erases with the membership what a removal by a manager erases', async () => {
		await withOrg(app, inD(leaver.id), (tx) =>
			tx.execute(sql`
				delete from "membership" where "organization_id" = ${d.id} and "user_id" = ${leaver.id}
			`)
		);
		await withOrg(app, inD(d.userId), (tx) =>
			tx.execute(sql`
				delete from "membership" where "organization_id" = ${d.id} and "user_id" = ${removed.id}
			`)
		);
		// Le compte reste, l'invitation consommée aussi ; l'adhésion et l'acceptation des conditions
		// partent, par la clé en cascade (ADR 0044). Les deux chemins laissent la même trace.
		const gone = { account: 1, membership: 0, terms: 0, invitations: 'joined' };
		expect(await footprint(leaver.id)).toEqual(gone);
		expect(await footprint(removed.id)).toEqual(gone);
		// La collègue qui reste n'a rien perdu.
		expect(await footprint(stays.id)).toEqual({ ...gone, membership: 1, terms: 1 });
	});
});

describe('la fonction qui lit le rôle', () => {
	it('runs with the rights of its definer, a fixed search path, and only for the application', async () => {
		const found = firstRow<{
			definer: boolean;
			config: string[] | null;
			volatility: string;
			args: string;
		}>(
			await owner.execute(sql`
				select p.prosecdef as definer, p.proconfig as config, p.provolatile as volatility,
					pg_get_function_identity_arguments(p.oid) as args
				from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				where n.nspname = 'jadwal' and p.proname = 'is_org_admin'
			`)
		);
		expect(found).toEqual({
			definer: true,
			config: ['search_path=public, pg_temp'],
			volatility: 's',
			args: ''
		});
		const executors = allRows<{ role: string; can: boolean }>(
			await owner.execute(sql`
				select r.role, has_function_privilege(r.role, 'jadwal.is_org_admin()', 'EXECUTE') as can
				from unnest(array['jadwal_app', 'jadwal_superadmin', 'jadwal_auth', 'jadwal_public']) as r(role)
				order by r.role
			`)
		);
		expect(executors).toEqual([
			{ role: 'jadwal_app', can: true },
			{ role: 'jadwal_auth', can: false },
			{ role: 'jadwal_public', can: false },
			{ role: 'jadwal_superadmin', can: false }
		]);
	});

	it('is required by exactly the policies of the gestures reserved to a manager', async () => {
		// La migration 0059 vérifiait cette liste elle-même ; depuis que d'autres migrations la
		// complètent, elle n'en vérifie que le minimum, pour rester rejouable, et c'est ici que la
		// liste exacte est tenue. Chaque politique l'exige dans chacune de ses clauses.
		const found = allRows<{ policy: string; qual: string; check: string; cmd: string }>(
			await owner.execute(sql`
				select tablename || '.' || policyname as policy, cmd, coalesce(qual, '') as qual,
					coalesce(with_check, '') as check
				from pg_policies
				where schemaname = 'public'
					and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%is_org_admin%'
				order by 1
			`)
		);
		expect(found.map((row) => row.policy)).toEqual([
			'audit_log.audit_log_select',
			'course.course_delete',
			'invitation.invitation_delete',
			'invitation.invitation_insert',
			'invitation.invitation_select',
			'invitation.invitation_update',
			'membership.membership_delete',
			'membership.membership_select',
			'membership.membership_update',
			'organization.organization_update',
			'prayer_day.prayer_day_delete',
			'prayer_day.prayer_day_insert',
			'prayer_day.prayer_day_update',
			'prayer_period.prayer_period_delete',
			'prayer_period.prayer_period_insert',
			'prayer_period.prayer_period_update',
			'prayer_settings.prayer_settings_delete',
			'prayer_settings.prayer_settings_insert',
			'prayer_settings.prayer_settings_update',
			'room.room_delete',
			'room.room_insert',
			'room.room_update'
		]);
		for (const row of found) {
			if (row.cmd !== 'INSERT') expect(row.qual, row.policy).toContain('is_org_admin()');
			if (row.cmd === 'INSERT' || row.cmd === 'UPDATE') {
				expect(row.check, row.policy).toContain('is_org_admin()');
			}
		}
		// Aucune politique d'un autre rôle ne l'appelle.
		const others = allRows<{ policy: string }>(
			await owner.execute(sql`
				select tablename || '.' || policyname as policy from pg_policies
				where schemaname = 'public' and not ('jadwal_app' = any (roles))
					and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%is_org_admin%'
			`)
		);
		expect(others).toEqual([]);
	});
});

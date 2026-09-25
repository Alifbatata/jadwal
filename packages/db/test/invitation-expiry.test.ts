// La durée d'une invitation et son échéance, tenues par la base et non plus seulement par l'écran.
//
// Jusqu'à l'étape 17, l'application posait la fin à quatorze jours et filtrait `expires_at > now()`
// au moment d'accepter ; la base n'exigeait que `expires_at > created_at`. Un appel direct acceptait
// donc une invitation échue, l'adhésion suivait, et une invitation de quinze jours, ou d'un an,
// passait sans un mot. La date de création elle-même se choisissait à l'insertion : la borne n'aurait
// rien borné. Les migrations 0056 et 0057 ferment les trois (ADR 0017).
//
// Tout passe par les rôles de connexion, non privilégiés. Le propriétaire ne sert qu'à poser le
// décor, par exemple une invitation déjà échue, et à relire ce qui est réellement en base.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, withOrg, withUser, type Database, type DatabaseHandle } from '../src/index.js';
import {
	firstRow,
	messageOfFailure,
	openDatabase,
	seedOrganisation,
	SQLSTATE,
	sqlStateOfFailure,
	withMaintenance,
	type Organisation
} from './helpers.js';

const testDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(testDir, '..', 'migrations');
/** L'écran des membres, qui pose la fin de chaque invitation. Lu, jamais modifié. */
const membersScreen = join(testDir, '..', '..', '..', 'apps', 'web', 'src', 'routes', 'membres');

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let superAdminHandle: DatabaseHandle;
let owner: Database;
let app: Database;
let superAdmin: Database;
let org: Organisation;

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	superAdminHandle = openDatabase('superadmin');
	owner = ownerHandle.db;
	app = appHandle.db;
	superAdmin = superAdminHandle.db;
	org = await seedOrganisation(owner, 'echeance');
});

afterAll(async () => {
	await superAdminHandle?.close();
	await appHandle?.close();
	await ownerHandle?.close();
});

/** Un compte qui attend une invitation, créé par le propriétaire. */
async function account(): Promise<{ id: string; email: string }> {
	const id = newId();
	const email = `invitee-${id}@example.test`;
	await withMaintenance(owner, (tx) =>
		tx.execute(sql`insert into "user" ("id", "email") values (${id}, ${email})`)
	);
	return { id, email };
}

/**
 * Une invitation posée par le propriétaire, aux dates voulues. Échue par défaut : créée il y a
 * quinze jours, finie hier, quatorze jours de durée, donc dans la borne. Les jours y sont comptés
 * en heures, comme partout dans ces tests (voir `seedOrganisation`).
 */
async function invitation(
	email: string,
	options: { status?: string; acceptedBy?: string | null; createdAt?: SQL; expiresAt?: SQL } = {}
): Promise<string> {
	const id = newId();
	await withMaintenance(owner, (tx) =>
		tx.execute(sql`
			insert into "invitation" ("id", "organization_id", "email", "role", "status", "accepted_by",
				"created_at", "expires_at")
			values (${id}, ${org.id}, ${email}, 'editor', ${options.status ?? 'pending'},
				${options.acceptedBy ?? null},
				${options.createdAt ?? sql`now() - make_interval(hours => 15 * 24)`},
				${options.expiresAt ?? sql`now() - interval '24 hours'`})
		`)
	);
	return id;
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

/** Ce que l'écran d'acceptation écrit, sans son filtre sur l'échéance : l'appel direct. */
const accept = (id: string, userId: string) => sql`
	update "invitation"
	set "status" = 'accepted', "accepted_by" = ${userId}, "resolved_at" = now()
	where "id" = ${id}
`;

/** L'écran d'acceptation tel quel : accepter, avec son filtre, puis adhérer, dans une transaction. */
async function acceptAndJoin(id: string, userId: string): Promise<void> {
	await withUser(app, userId, async (tx) => {
		await tx.execute(sql`
			update "invitation"
			set "status" = 'accepted', "accepted_by" = ${userId}, "resolved_at" = now()
			where "id" = ${id} and "status" = 'pending' and "expires_at" > now()
		`);
		await tx.execute(sql`select set_config('jadwal.org_id', ${org.id}, true)`);
		await tx.execute(sql`
			insert into "membership" ("id", "organization_id", "user_id", "role")
			values (${newId()}, ${org.id}, ${userId}, 'editor')
		`);
	});
}

describe('une invitation échue', () => {
	it('is not accepted by a direct call from the invited person', async () => {
		const invitee = await account();
		const id = await invitation(invitee.email);
		const state = await sqlStateOfFailure(() =>
			withUser(app, invitee.id, (tx) => tx.execute(accept(id, invitee.id)))
		);
		expect(state).toBe(SQLSTATE.restrictViolation);
		expect(await stateOf(id)).toEqual({ status: 'pending', accepted_by: null });
	});

	it('names the rule it breaks, rather than a policy', async () => {
		// Un refus de politique dirait seulement « row-level security », comme un refus d'isolation.
		const invitee = await account();
		const id = await invitation(invitee.email);
		const message = await messageOfFailure(() =>
			withUser(app, invitee.id, (tx) => tx.execute(accept(id, invitee.id)))
		);
		expect(message).toContain('has expired');
	});

	it('is not accepted on her behalf by the organisation, nor by the super-admin', async () => {
		// Le déclencheur tient quels que soient le rôle et la branche de politique qui laissent passer
		// la ligne : celle de l'adresse, celle du contexte, celle du super-admin.
		const invitee = await account();
		const parLOrganisation = await invitation(invitee.email);
		expect(
			await sqlStateOfFailure(() =>
				withOrg(app, { organizationId: org.id, userId: org.userId }, (tx) =>
					tx.execute(accept(parLOrganisation, invitee.id))
				)
			),
			'responsable'
		).toBe(SQLSTATE.restrictViolation);

		const other = await account();
		const parLeSuperAdmin = await invitation(other.email);
		expect(
			await sqlStateOfFailure(() =>
				withOrg(superAdmin, org.id, (tx) => tx.execute(accept(parLeSuperAdmin, other.id)))
			),
			'super-admin'
		).toBe(SQLSTATE.restrictViolation);
	});

	it('does not change hands once expired, even when it was accepted in time', async () => {
		// Acceptée pendant sa validité, puis échue avant l'adhésion : la repointer vers un autre compte
		// lui rendrait la valeur d'une acceptation neuve.
		const invitee = await account();
		const other = await account();
		const id = await invitation(invitee.email, { status: 'accepted', acceptedBy: invitee.id });
		const state = await sqlStateOfFailure(() =>
			withOrg(app, { organizationId: org.id, userId: org.userId }, (tx) =>
				tx.execute(sql`update "invitation" set "accepted_by" = ${other.id} where "id" = ${id}`)
			)
		);
		expect(state).toBe(SQLSTATE.restrictViolation);
		expect((await stateOf(id)).accepted_by).toBe(invitee.id);
	});

	it('may lose its name, as when the account is deleted, but never take another one', async () => {
		// Quand un compte est supprimé, la clé étrangère (`on delete set null`) vide `accepted_by`. Ce
		// n'est pas un changement de mains, et le refuser empêchait de supprimer le compte, donc toute
		// la purge des comptes (voir `purges.test.ts`). Une fois vide, le nom d'une invitation échue ne
		// se remplit plus : ce serait une acceptation neuve sur une invitation échue. Le compte est
		// supprimé pour de bon : depuis la migration 0058, aucun rôle de connexion ne vide ce nom à la
		// main (`invitation-status.test.ts`).
		const invitee = await account();
		const other = await account();
		const id = await invitation(invitee.email, { status: 'accepted', acceptedBy: invitee.id });
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`delete from "user" where "id" = ${invitee.id}`)
		);
		expect(await stateOf(id)).toEqual({ status: 'accepted', accepted_by: null });
		const state = await sqlStateOfFailure(() =>
			withOrg(app, { organizationId: org.id, userId: org.userId }, (tx) =>
				tx.execute(sql`update "invitation" set "accepted_by" = ${other.id} where "id" = ${id}`)
			)
		);
		expect(state).toBe(SQLSTATE.restrictViolation);
		expect(await stateOf(id)).toEqual({ status: 'accepted', accepted_by: null });
	});

	it('opens no membership, even when it was accepted in time', async () => {
		// L'acceptation et l'adhésion vont dans la même transaction à l'écran, mais rien ne l'impose à
		// un appel direct : c'est `jadwal.invited`, que lit la politique d'adhésion, qui regarde
		// désormais l'échéance aussi.
		const invitee = await account();
		await invitation(invitee.email, { status: 'accepted', acceptedBy: invitee.id });
		const message = await messageOfFailure(() =>
			withOrg(app, { organizationId: org.id, userId: invitee.id }, (tx) =>
				tx.execute(sql`
					insert into "membership" ("id", "organization_id", "user_id", "role")
					values (${newId()}, ${org.id}, ${invitee.id}, 'editor')
				`)
			)
		);
		expect(message).toContain('row-level security policy for table "membership"');
	});
});

describe('une invitation qui court encore', () => {
	it('is accepted, then joined, exactly as the screen does it', async () => {
		const invitee = await account();
		const id = await invitation(invitee.email, {
			createdAt: sql`now() - interval '24 hours'`,
			expiresAt: sql`now() + make_interval(hours => 13 * 24)`
		});
		await acceptAndJoin(id, invitee.id);
		expect(await stateOf(id)).toEqual({ status: 'joined', accepted_by: invitee.id });
	});
});

describe('le super-admin et l’échéance', () => {
	it('can push back the end of a short invitation, even expired, up to fourteen days from its creation', async () => {
		// Le super-admin a tous les droits sur les données (ADR 0025), et repousser une échéance est
		// une modification ordinaire. Repousser, puis accepter, ce sont deux modifications : quand vient
		// l'acceptation, la fin de la ligne est déjà repoussée. Une invitation d'un jour, échue hier,
		// reprend donc vie. La borne de 0056 tient toujours, et c'est elle seule qui arrête : quatorze
		// jours après la création, pas une seconde de plus.
		const invitee = await account();
		const courte = await invitation(invitee.email, {
			createdAt: sql`now() - make_interval(hours => 2 * 24)`,
			expiresAt: sql`now() - interval '24 hours'`
		});
		const repousser = (id: string, duree: string) =>
			withOrg(superAdmin, org.id, (tx) =>
				tx.execute(sql`
					update "invitation" set "expires_at" = "created_at" + ${duree}::interval
					where "id" = ${id}
				`)
			);
		expect(
			await sqlStateOfFailure(() => repousser(courte, '336 hours 1 second')),
			'quatorze jours et une seconde'
		).toBe(SQLSTATE.checkViolation);
		await repousser(courte, '336 hours');
		await acceptAndJoin(courte, invitee.id);
		expect(await stateOf(courte)).toEqual({ status: 'joined', accepted_by: invitee.id });

		// Créée il y a quinze jours, une invitation a déjà dépassé sa borne : rien ne la ranime.
		const other = await account();
		const vieille = await invitation(other.email);
		await repousser(vieille, '336 hours');
		expect(
			await sqlStateOfFailure(() =>
				withUser(app, other.id, (tx) => tx.execute(accept(vieille, other.id)))
			),
			'créée il y a quinze jours'
		).toBe(SQLSTATE.restrictViolation);
	});

	it('judges the end the row leaves with: pushed back and accepted in one statement passes', async () => {
		// Le déclencheur lit la fin de la ligne qui sort, et non celle qu'elle avait. Cela ne compte que
		// pour une instruction qui change la fin et l'acceptation ensemble, et seul le super-admin peut
		// changer la fin. Depuis que la base tient les passages de statut (migration 0058), il n'accepte
		// qu'à son propre nom, une invitation reçue à sa propre adresse : c'est le cas joué ici.
		const himself = await account();
		const courte = await invitation(himself.email, {
			createdAt: sql`now() - make_interval(hours => 2 * 24)`,
			expiresAt: sql`now() - interval '24 hours'`
		});
		await withOrg(superAdmin, { organizationId: org.id, userId: himself.id }, (tx) =>
			tx.execute(sql`
				update "invitation"
				set "expires_at" = "created_at" + make_interval(hours => 14 * 24), "status" = 'accepted',
					"accepted_by" = ${himself.id}, "resolved_at" = now()
				where "id" = ${courte}
			`)
		);
		expect(await stateOf(courte)).toEqual({ status: 'accepted', accepted_by: himself.id });
	});

	it('judges the end the row leaves with: moved into the past and named in one statement is refused', async () => {
		// L'autre sens : une acceptation qui court encore, dont une seule instruction avance la fin dans
		// le passé et change le nom. Juger la fin qu'avait la ligne laisserait passer une acceptation
		// échue, qui change de mains. Le message compte : depuis la migration 0058, le changement de
		// mains est refusé aussi par la règle des passages, qui passe après celle-ci. Seul le motif de
		// l'échéance dit que c'est bien la fin de la ligne qui sort qui a été jugée.
		const invitee = await account();
		const other = await account();
		const enCours = await invitation(invitee.email, {
			status: 'accepted',
			acceptedBy: invitee.id,
			createdAt: sql`now() - make_interval(hours => 2 * 24)`,
			expiresAt: sql`now() + interval '24 hours'`
		});
		expect(
			await messageOfFailure(() =>
				withOrg(superAdmin, org.id, (tx) =>
					tx.execute(sql`
						update "invitation"
						set "expires_at" = now() - interval '1 hour', "accepted_by" = ${other.id}
						where "id" = ${enCours}
					`)
				)
			)
		).toContain('has expired');
		expect(await stateOf(enCours)).toEqual({ status: 'accepted', accepted_by: invitee.id });
	});
});

describe('la durée d’une invitation', () => {
	/** L'insertion de l'écran des membres, avec la fin demandée. */
	const invite = (email: string, fin: SQL) => sql`
		insert into "invitation" ("id", "organization_id", "email", "role", "invited_by", "expires_at")
		values (${newId()}, ${org.id}, ${email}, 'editor', ${org.userId}, ${fin})
	`;

	it('refuses fifteen days, from the organisation as from the super-admin', async () => {
		const quinze = sql`now() + make_interval(hours => 15 * 24)`;
		expect(
			await messageOfFailure(() =>
				withOrg(app, { organizationId: org.id, userId: org.userId }, (tx) =>
					tx.execute(invite(`quinze-${newId()}@example.test`, quinze))
				)
			),
			'responsable'
		).toContain('invitation_duration_ck');
		expect(
			await sqlStateOfFailure(() =>
				withOrg(superAdmin, org.id, (tx) =>
					tx.execute(invite(`quinze-${newId()}@example.test`, quinze))
				)
			),
			'super-admin'
		).toBe(SQLSTATE.checkViolation);
	});

	it('is the duration the members screen gives, to the second, whatever the time zone', async () => {
		// La fin est lue dans le fichier de l'écran, qui reste le seul à la poser : si l'une des deux
		// durées change sans l'autre, ce test tombe. L'expression de l'écran est rejouée telle quelle,
		// sa constante remplacée par sa valeur, sous deux fuseaux et par-dessus le passage à l'heure
		// d'hiver du 25 octobre 2026. Quatorze jours de calendrier y font 337 heures, que la borne
		// refuse : l'écran doit compter en heures, comme la contrainte (migration 0056).
		const source = readFileSync(join(membersScreen, '+page.server.ts'), 'utf8');
		const found = /^const INVITATION_DAYS = (\d+);$/m.exec(source);
		expect(found, 'INVITATION_DAYS dans l’écran des membres').not.toBeNull();
		const jours = Number(found?.[1]);
		const posees = [...source.matchAll(/now\(\) \+ (make_interval\([^()]*\))/g)];
		expect(posees, 'une seule fin posée par l’écran').toHaveLength(1);
		const fin = (posees[0]?.[1] ?? '').replaceAll('${INVITATION_DAYS}', String(jours));
		// Garde avant `sql.raw` : un appel à `make_interval` sur des nombres, rien d'autre.
		expect(fin).toMatch(/^make_interval\([a-z]+ => [\d *]+\)$/);

		const debut = sql`'2026-10-20T12:00:00Z'::timestamptz`;
		for (const zone of ['UTC', 'Europe/Zurich']) {
			const duree = firstRow<{ secondes: number }>(
				await owner.transaction(async (tx) => {
					await tx.execute(sql.raw(`set local time zone '${zone}'`));
					return tx.execute(sql`
						select extract(epoch from (${debut} + ${sql.raw(fin)}) - ${debut})::int as "secondes"
					`);
				})
			);
			expect(duree?.secondes, `${fin} sous ${zone}`).toBe(jours * 24 * 3600);
		}

		// Et la base accepte cette fin, pas une seconde de plus : l'insertion de l'écran.
		await withOrg(app, { organizationId: org.id, userId: org.userId }, (tx) =>
			tx.execute(invite(`pile-${newId()}@example.test`, sql`now() + ${sql.raw(fin)}`))
		);
		const state = await sqlStateOfFailure(() =>
			withOrg(app, { organizationId: org.id, userId: org.userId }, (tx) =>
				tx.execute(
					invite(
						`une-seconde-${newId()}@example.test`,
						sql`now() + ${sql.raw(fin)} + interval '1 second'`
					)
				)
			)
		);
		expect(state).toBe(SQLSTATE.checkViolation);
	});

	it('lets no login role choose the creation date the bound is measured from', async () => {
		// Sans cela, la borne ne bornait rien : une création datée de l'an prochain, une fin quatorze
		// jours plus tard, et l'invitation valait un an et quatorze jours. Le refus tombe sur un droit
		// absent, quelle que soit la valeur, comme pour l'horodatage du journal (ADR 0020).
		const antidatee = (email: string) => sql`
			insert into "invitation" ("id", "organization_id", "email", "role", "created_at",
				"expires_at")
			values (${newId()}, ${org.id}, ${email}, 'editor', now() + interval '1 year',
				now() + interval '1 year 14 days')
		`;
		expect(
			await messageOfFailure(() =>
				withOrg(app, { organizationId: org.id, userId: org.userId }, (tx) =>
					tx.execute(antidatee(`an-${newId()}@example.test`))
				)
			),
			'responsable'
		).toContain('permission denied for table invitation');
		expect(
			await messageOfFailure(() =>
				withOrg(superAdmin, org.id, (tx) => tx.execute(antidatee(`an-${newId()}@example.test`)))
			),
			'super-admin, à l’insertion'
		).toContain('permission denied for table invitation');

		const existante = await invitation(`repoussee-${newId()}@example.test`, {
			createdAt: sql`now() - interval '24 hours'`,
			expiresAt: sql`now() + make_interval(hours => 13 * 24)`
		});
		expect(
			await messageOfFailure(() =>
				withOrg(superAdmin, org.id, (tx) =>
					tx.execute(sql`
						update "invitation" set "created_at" = now() + interval '1 year',
							"expires_at" = now() + interval '1 year 14 days'
						where "id" = ${existante}
					`)
				)
			),
			'super-admin, à la modification'
		).toContain('permission denied for table invitation');
	});

	it('holds the same bound whatever the time zone of the session', async () => {
		// Le 25 octobre 2026, Zurich repasse à l'heure d'hiver. Quatorze jours de calendrier comptés
		// à Zurich par-dessus ce changement font 337 heures, et 336 comptés en UTC. La borne porte sur
		// la durée écoulée, 336 heures, et non sur une date de calendrier : sans quoi une vérification
		// rejouée à la restauration d'une sauvegarde, sous un autre fuseau, refuserait des lignes
		// que l'insertion avait acceptées.
		const debut = sql`'2026-10-20T12:00:00Z'::timestamptz`;
		const sous = (zone: string, duree: string) =>
			withMaintenance(owner, async (tx) => {
				await tx.execute(sql.raw(`set local time zone '${zone}'`));
				await tx.execute(sql`
					insert into "invitation" ("id", "organization_id", "email", "role", "created_at",
						"expires_at")
					values (${newId()}, ${org.id}, ${`fuseau-${newId()}@example.test`}, 'editor',
						${debut}, ${debut} + ${duree}::interval)
				`);
				return zone;
			});
		for (const zone of ['UTC', 'Europe/Zurich']) {
			await expect(sous(zone, '336 hours'), `336 heures sous ${zone}`).resolves.toBe(zone);
			expect(
				await sqlStateOfFailure(() => sous(zone, '336 hours 1 second')),
				`336 heures et une seconde sous ${zone}`
			).toBe(SQLSTATE.checkViolation);
		}
	});

	it('cannot be imposed over an invitation that already lasts longer', async () => {
		// La preuve que la migration donne sur une base existante : une ligne hors de la borne, et elle
		// refuse de s'appliquer, avec un message qui dit combien. Tout est défait avec la transaction.
		const statements = readFileSync(join(migrationsDir, '0056_invitation_duration.sql'), 'utf8')
			.split('--> statement-breakpoint')
			.map((text) => text.trim())
			.filter((text) => text.replace(/^--.*$/gm, '').trim().length > 0);
		const message = await messageOfFailure(() =>
			owner.transaction(async (tx) => {
				await tx.execute(
					sql`alter table "invitation" drop constraint if exists "invitation_duration_ck"`
				);
				await tx.execute(sql`set local jadwal.maintenance = 'on'`);
				await tx.execute(sql`
					insert into "invitation" ("id", "organization_id", "email", "role", "created_at",
						"expires_at")
					values (${newId()}, ${org.id}, ${`longue-${newId()}@example.test`}, 'editor',
						now() - make_interval(hours => 20 * 24), now() - make_interval(hours => 5 * 24))
				`);
				// La migration tourne sans le drapeau d'entretien : on le retire avant de la jouer.
				await tx.execute(sql`set local jadwal.maintenance = 'off'`);
				for (const statement of statements) await tx.execute(sql.raw(statement));
			})
		);
		expect(message).toContain('1 invitation(s) durent plus de quatorze jours');
		// Et la base n'a rien perdu : la contrainte est toujours là, la ligne n'y est pas.
		const restante = firstRow<{ n: number }>(
			await owner.execute(sql`
				select count(*)::int as n from pg_constraint
				where conname = 'invitation_duration_ck' and conrelid = 'public.invitation'::regclass
			`)
		);
		expect(restante?.n).toBe(1);
	});
});

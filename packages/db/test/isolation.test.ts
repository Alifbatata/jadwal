// Isolation entre organisations, jouée avec le rôle applicatif non privilégié. Deux organisations
// A et B sont peuplées par le propriétaire ; tout le reste passe par `jadwal_app`.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { newId, withOrg, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
	countIn,
	countVisible,
	firstRow,
	openDatabase,
	organizationTables,
	joinOrganisation,
	seedOrganisation,
	SQLSTATE,
	sqlStateOfFailure,
	type Organisation,
	withMaintenance
} from './helpers.js';

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let owner: Database;
let app: Database;
let a: Organisation;
let b: Organisation;
let tables: string[];

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	owner = ownerHandle.db;
	app = appHandle.db;
	a = await seedOrganisation(owner, 'org-a');
	b = await seedOrganisation(owner, 'org-b');
	tables = await organizationTables(owner);
});

afterAll(async () => {
	await appHandle?.close();
	await ownerHandle?.close();
});

describe('le rôle de test est bien non privilégié', () => {
	it('is not a superuser and does not bypass row level security', async () => {
		const result = await app.execute<{
			rolname: string;
			rolsuper: boolean;
			rolbypassrls: boolean;
		}>(sql`select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user`);
		const role = firstRow<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(result);
		expect(role?.rolname).toBe('jadwal_app');
		expect(role?.rolsuper).toBe(false);
		expect(role?.rolbypassrls).toBe(false);
	});

	it('was already unprivileged before the suite prepared anything', () => {
		// Le test ci-dessus relit un état que la préparation de la suite vient d'écrire : la
		// migration d'amorçage et le script des rôles ramènent tous deux les attributs à ce qu'ils
		// doivent être, quelques instants avant la première assertion. Il ne peut donc pas échouer.
		// Celui-ci porte sur le relevé fait avant toute réparation : une dérive d'un serveur réel
		// (`alter role jadwal_app bypassrls`) le fait échouer.
		const before = inject('roleAttributesBeforeSetup');
		// Sur un serveur neuf — la CI en monte un à chaque exécution — les rôles n'existent pas
		// encore : c'est l'amorçage qui les crée, et il n'y a alors rien à contrôler. Sur un serveur
		// déjà installé, les quatre sont là. Un nombre intermédiaire signalerait une installation à
		// moitié faite. Les quatre comptent : le propriétaire parce que l'isolation repose sur lui,
		// le rôle de connexion parce qu'il détient tous les jetons de session.
		expect([0, 4], 'rôles trouvés avant la préparation').toContain(Object.keys(before).length);
		for (const [name, attributes] of Object.entries(before)) {
			expect(attributes, name).toEqual({
				rolsuper: false,
				rolbypassrls: false,
				rolcreatedb: false,
				rolcreaterole: false,
				rolreplication: false
			});
		}
	});

	it('does not own any table of the public schema', async () => {
		const result = await app.execute<{ count: string }>(sql`
			select count(*)::text as count from pg_class c
			join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and c.relkind = 'r' and pg_get_userbyid(c.relowner) = current_user
		`);
		expect(Number(firstRow<{ count: string }>(result)?.count)).toBe(0);
	});
});

describe('contexte absent, vide ou illisible', () => {
	it('shows nothing at all without a context', async () => {
		for (const table of tables) {
			expect(await countIn(app, table), table).toBe(0);
		}
		// Les tables sans `organization_id` sont protégées de la même façon.
		expect(await countIn(app, 'user')).toBe(0);
	});

	it('shows nothing and raises nothing for an empty, invalid or unknown context', async () => {
		for (const value of [
			'',
			'pas-un-uuid',
			"00000000-0000-7000-8000-00000000000a'; drop table course --"
		]) {
			const rows = await app.transaction(async (tx) => {
				await tx.execute(sql`select set_config('jadwal.org_id', ${value}, true)`);
				return countIn(tx, 'course');
			});
			expect(rows, JSON.stringify(value)).toBe(0);
		}
		// Un UUID valide mais inconnu ne rend rien non plus.
		expect(await countVisible(app, '00000000-0000-7000-8000-0000000000ff', 'course')).toBe(0);
	});

	it('accepts a context written in upper case: it is the same identifier', async () => {
		expect(await countVisible(app, a.id.toUpperCase(), 'course')).toBe(1);
	});
});

describe('lecture : une organisation ne voit que ses lignes', () => {
	it('counts only its own rows in every table carrying an organization', async () => {
		// Le contexte complet, organisation et personne, comme l'application le pose toujours : une
		// table peut exiger les deux. `terms_acceptance` ne montre à chacun que ses propres lignes, et
		// l'organisation seule n'y voit rien, ce que `terms-acceptance.test.ts` vérifie.
		for (const table of tables) {
			expect(
				await countVisible(app, { organizationId: a.id, userId: a.userId }, table),
				`${table} sous A`
			).toBe(1);
			expect(
				await countVisible(app, { organizationId: b.id, userId: b.userId }, table),
				`${table} sous B`
			).toBe(1);
		}
	});

	it('returns its own rows and never the other ones', async () => {
		const slugs = await withOrg(app, a.id, async (tx) => {
			const result = await tx.execute<{ slug: string }>(sql`select slug from "organization"`);
			return allRows<{ slug: string }>(result).map((row) => row.slug);
		});
		expect(slugs).toEqual(['org-a']);
	});

	it('does not leak through a join, a subquery or an aggregate', async () => {
		await withOrg(app, a.id, async (tx) => {
			const joined = await tx.execute<{ slug: string; title: string }>(sql`
				select o.slug, t.title
				from "organization" o
				join "course" c on c.organization_id = o.id
				join "course_translation" t on t.course_id = c.id
			`);
			expect(allRows(joined)).toHaveLength(1);

			const others = await tx.execute<{ count: string }>(sql`
				select count(*)::text as count from "course"
				where organization_id <> (select jadwal.current_org_id())
			`);
			expect(Number(firstRow<{ count: string }>(others)?.count)).toBe(0);

			// Une sous-requête corrélée ne voit pas davantage.
			const correlated = await tx.execute<{ count: string }>(sql`
				select count(*)::text as count from "course" c
				where exists (select 1 from "organization" o where o.id = c.organization_id)
			`);
			expect(Number(firstRow<{ count: string }>(correlated)?.count)).toBe(1);
		});
	});

	it('hides the other organisation users: no global directory', async () => {
		const names = await withOrg(app, { organizationId: a.id, userId: a.userId }, async (tx) => {
			const result = await tx.execute<{ email: string }>(sql`select email from "user"`);
			return allRows<{ email: string }>(result).map((row) => row.email);
		});
		expect(names).toEqual(['org-a@example.test']);
	});
});

describe('écriture : une organisation ne touche que ses lignes', () => {
	it('refuses an insert that would carry another organisation', async () => {
		const state = await sqlStateOfFailure(() =>
			withOrg(app, a.id, async (tx) => {
				await tx.execute(sql`
					insert into "room" ("id", "organization_id", "name")
					values ('00000000-0000-7000-8000-00000000aaa1', ${b.id}, 'Salle volée')
				`);
			})
		);
		expect(state).toBe(SQLSTATE.insufficientPrivilege);
		expect(await countVisible(app, b.id, 'room')).toBe(1);
	});

	it('refuses an update that would move a row to another organisation', async () => {
		const state = await sqlStateOfFailure(() =>
			withOrg(app, a.id, async (tx) => {
				await tx.execute(sql`update "room" set organization_id = ${b.id}`);
			})
		);
		expect(state).toBe(SQLSTATE.insufficientPrivilege);
	});

	it('touches no row when updating or deleting the other organisation rows', async () => {
		await withOrg(app, a.id, async (tx) => {
			const updated = await tx.execute(sql`
				update "course" set teacher = 'pirate' where organization_id = ${b.id} returning id
			`);
			expect(allRows(updated)).toHaveLength(0);
			const deleted = await tx.execute(sql`
				delete from "room" where organization_id = ${b.id} returning id
			`);
			expect(allRows(deleted)).toHaveLength(0);
		});
		expect(await countVisible(app, b.id, 'course')).toBe(1);
		expect(await countVisible(app, b.id, 'room')).toBe(1);
	});

	it('writes and reads back its own row through RETURNING', async () => {
		const id = '00000000-0000-7000-8000-00000000aaa2';
		const returned = await withOrg(app, a.id, async (tx) => {
			const result = await tx.execute<{ id: string }>(sql`
				insert into "room" ("id", "organization_id", "name")
				values (${id}, ${a.id}, 'Salle A2') returning id
			`);
			return allRows<{ id: string }>(result).map((row) => row.id);
		});
		expect(returned).toEqual([id]);
		expect(await countVisible(app, a.id, 'room')).toBe(2);
		await withOrg(app, a.id, async (tx) => {
			await tx.execute(sql`delete from "room" where id = ${id}`);
		});
	});

	it('cannot reach another organisation course through a composite foreign key', async () => {
		const otherCourse = await withMaintenance(owner, (tx) =>
			tx.execute<{ id: string }>(sql`select id from "course" where organization_id = ${b.id}`)
		);
		const courseId = firstRow<{ id: string }>(otherCourse)?.id;
		expect(courseId).toBeTruthy();
		// La clé étrangère porte sur (course_id, organization_id) : la ligne visée n'existe pas pour
		// cette organisation, et l'erreur ne dit pas si elle existe ailleurs.
		const state = await sqlStateOfFailure(() =>
			withOrg(app, a.id, async (tx) => {
				await tx.execute(sql`
					insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
					values ('00000000-0000-7000-8000-00000000aaa3', ${a.id}, ${courseId}, 'de', 'Vol')
				`);
			})
		);
		expect(state).toBe(SQLSTATE.foreignKeyViolation);
	});
});

describe('le contexte ne fuit pas', () => {
	it('is gone once the transaction ends', async () => {
		expect(await countVisible(app, a.id, 'course')).toBe(1);
		expect(await countIn(app, 'course')).toBe(0);
	});

	it('is gone after an error and a rollback, on the same connection', async () => {
		const single = openDatabase('app');
		try {
			const pidBefore = await backendPid(single.db);
			await expect(
				withOrg(single.db, a.id, async (tx) => {
					await tx.execute(sql`select 1 / 0`);
				})
			).rejects.toThrow();
			const pidAfter = await backendPid(single.db);
			expect(pidAfter).toBe(pidBefore);
			expect(await countIn(single.db, 'course')).toBe(0);
			// Le paramètre ne redevient pas absent mais vaut la chaîne vide : la fonction de contexte
			// doit rendre NULL sans lever.
			const result = await single.db.execute<{ raw: string | null }>(
				sql`select current_setting('jadwal.org_id', true) as raw`
			);
			expect(firstRow<{ raw: string | null }>(result)?.raw).toBe('');
		} finally {
			await single.close();
		}
	});

	it('does not leak from one transaction to the next on the same connection', async () => {
		const single = openDatabase('app');
		try {
			expect(await countVisible(single.db, a.id, 'course')).toBe(1);
			expect(await countVisible(single.db, b.id, 'course')).toBe(1);
			expect(await countIn(single.db, 'course')).toBe(0);
		} finally {
			await single.close();
		}
	});
});

describe('le contexte utilisateur', () => {
	it('shows a person their own account, even in an organisation they do not belong to', async () => {
		// `user_select` a deux branches : « c'est moi » et « nous sommes de la même organisation ».
		// Celle-ci n'existe que par la première : a n'est pas membre de b. Neutraliser
		// `jadwal.user_id`, ou cesser de le poser dans `withOrg`, fait tomber ce test.
		const withUser = await withOrg(app, { organizationId: b.id, userId: a.userId }, (tx) =>
			tx.execute<{ email: string }>(sql`select "email" from "user" order by "email"`)
		);
		expect(allRows<{ email: string }>(withUser).map((row) => row.email)).toEqual([
			`${a.slug}@example.test`,
			`${b.slug}@example.test`
		]);

		const withoutUser = await withOrg(app, b.id, (tx) =>
			tx.execute<{ email: string }>(sql`select "email" from "user" order by "email"`)
		);
		expect(allRows<{ email: string }>(withoutUser).map((row) => row.email)).toEqual([
			`${b.slug}@example.test`
		]);
	});

	it('refuses a user identifier that is not a UUID, before opening anything', async () => {
		await expect(
			withOrg(app, { organizationId: a.id, userId: 'moi' }, async () => undefined)
		).rejects.toThrow(TypeError);
	});
});

describe('les personnes ne se laissent pas atteindre par une écriture', () => {
	it('lets a person attach themselves once invited, and never otherwise', async () => {
		// L'écriture d'adhésion est revenue au rôle applicatif à l'étape 3, mais seulement pour
		// soi-même, et seulement après une invitation acceptée (ADR 0017).
		const sansInvitation = await sqlStateOfFailure(() =>
			withOrg(app, { organizationId: b.id, userId: a.userId }, (tx) =>
				tx.execute(sql`
					insert into "membership" ("id", "organization_id", "user_id", "role")
					values (${newId()}, ${b.id}, ${a.userId}, 'editor')
				`)
			)
		);
		expect(sansInvitation).toBe(SQLSTATE.insufficientPrivilege);

		await joinOrganisation(owner, app, b.id, a.userId, `${a.slug}@example.test`);
		const joined = await withOrg(app, { organizationId: b.id, userId: a.userId }, async (tx) =>
			firstRow<{ count: string }>(
				await tx.execute(
					// La politique laisse chacun voir ses propres adhésions, où qu'elles soient : on borne
					// donc le comptage à l'organisation visée, sinon celle d'origine s'y ajouterait.
					sql`select count(*)::text as count from "membership"
					where "user_id" = ${a.userId} and "organization_id" = ${b.id}`
				)
			)
		);
		expect(Number(joined?.count)).toBe(1);
		// On défait, pour ne pas changer le décor des autres cas de ce fichier.
		await withOrg(app, b.id, (tx) =>
			tx.execute(sql`delete from "membership" where "user_id" = ${a.userId}`)
		);
	});

	it('refuses the membership an organisation would forge to read someone else’s account', async () => {
		// L'évasion complète : A écrit une adhésion vers la personne de B — la vérification de clé
		// étrangère contourne la RLS — puis relit `user`, que `user_select` ouvre aux membres de
		// l'organisation courante. Le droit d'écriture sur `membership` a donc quitté le rôle
		// applicatif (ADR 0013).
		const seen = await withOrg(app, { organizationId: a.id, userId: a.userId }, (tx) =>
			tx.execute<{ email: string }>(sql`select "email" from "user"`)
		);
		const before = allRows<{ email: string }>(seen).map((row) => row.email);
		expect(before).toEqual([`${a.slug}@example.test`]);

		const state = await sqlStateOfFailure(() =>
			withOrg(app, { organizationId: a.id, userId: a.userId }, (tx) =>
				tx.execute(sql`
					insert into "membership" ("id", "organization_id", "user_id", "role")
					values (${newId()}, ${a.id}, ${b.userId}, 'editor')
				`)
			)
		);
		expect(state).toBe(SQLSTATE.insufficientPrivilege);

		const after = await withOrg(app, { organizationId: a.id, userId: a.userId }, (tx) =>
			tx.execute<{ email: string }>(sql`select "email" from "user"`)
		);
		expect(allRows<{ email: string }>(after).map((row) => row.email)).toEqual(before);
	});

	it('refuses to name someone else in a row of its own, and says the same thing for an unknown id', async () => {
		// Sans cette garde, la contrainte passait pour un identifiant réel et échouait pour un
		// identifiant inventé : l'écart renseignait sur des personnes invisibles.
		const foreign = await sqlStateOfFailure(() =>
			withOrg(app, a.id, (tx) =>
				tx.execute(
					sql`update "course" set "updated_by" = ${b.userId} where "organization_id" = ${a.id}`
				)
			)
		);
		const unknown = await sqlStateOfFailure(() =>
			withOrg(app, a.id, (tx) =>
				tx.execute(
					sql`update "course" set "updated_by" = '01930000-0000-7000-8000-00000000ffff' where "organization_id" = ${a.id}`
				)
			)
		);
		expect(foreign).toBe(SQLSTATE.insufficientPrivilege);
		expect(unknown).toBe(foreign);
	});

	it('still lets an organisation name one of its own people, or nobody', async () => {
		await withOrg(app, a.id, async (tx) => {
			await tx.execute(
				sql`update "course" set "updated_by" = ${a.userId} where "organization_id" = ${a.id}`
			);
			await tx.execute(
				sql`update "course" set "updated_by" = null where "organization_id" = ${a.id}`
			);
		});
	});

	it('refuses an audit entry that credits someone from another organisation', async () => {
		const state = await sqlStateOfFailure(() =>
			withOrg(app, a.id, (tx) =>
				tx.execute(sql`
					insert into "audit_log" ("id", "organization_id", "actor_id", "action", "target_table")
					values (${newId()}, ${a.id}, ${b.userId}, 'course.update', 'course')
				`)
			)
		);
		expect(state).toBe(SQLSTATE.insufficientPrivilege);
	});
});

describe('la dernière personne responsable', () => {
	it('cannot be removed, nor demoted, whatever the calling code does', async () => {
		// La règle est portée par un déclencheur, donc elle tient même si une interface oublie de la
		// vérifier : une organisation ne peut pas se retrouver sans responsable.
		const remove = await sqlStateOfFailure(() =>
			withOrg(app, a.id, (tx) =>
				tx.execute(sql`delete from "membership" where "user_id" = ${a.userId}`)
			)
		);
		const demote = await sqlStateOfFailure(() =>
			withOrg(app, a.id, (tx) =>
				tx.execute(sql`update "membership" set "role" = 'editor' where "user_id" = ${a.userId}`)
			)
		);
		expect(remove).toBe(SQLSTATE.restrictViolation);
		expect(demote).toBe(SQLSTATE.restrictViolation);
	});

	it('can be removed once the organisation has another one', async () => {
		const second = newId();
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "user" ("id", "email") values (${second}, ${`second-${a.slug}@example.test`})
			`)
		);
		await joinOrganisation(owner, app, a.id, second, `second-${a.slug}@example.test`, 'org_admin');
		await withOrg(app, a.id, (tx) =>
			tx.execute(sql`delete from "membership" where "user_id" = ${a.userId}`)
		);
		const left = await withOrg(app, a.id, (tx) =>
			tx.execute<{ count: string }>(
				sql`select count(*)::text as count from "membership" where "role" = 'org_admin'`
			)
		);
		expect(Number(firstRow<{ count: string }>(left)?.count)).toBe(1);
		// On remet le décor en place pour les autres fichiers.
		await joinOrganisation(owner, app, a.id, a.userId, `${a.slug}@example.test`, 'org_admin');
	});

	it('is not a rule an editor can slip past', async () => {
		// Retirer un éditeur reste possible : le déclencheur ne vise que les personnes responsables.
		const editor = newId();
		await withMaintenance(owner, (tx) =>
			tx.execute(sql`
				insert into "user" ("id", "email") values (${editor}, ${`editeur-${a.slug}@example.test`})
			`)
		);
		await joinOrganisation(owner, app, a.id, editor, `editeur-${a.slug}@example.test`);
		await withOrg(app, a.id, (tx) =>
			tx.execute(sql`delete from "membership" where "user_id" = ${editor}`)
		);
	});
});

async function backendPid(db: Database): Promise<number> {
	const result = await db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
	return Number(firstRow<{ pid: number }>(result)?.pid);
}

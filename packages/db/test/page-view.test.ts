// Le compteur de vues, du côté de la base (ADR 0032).
//
// Le test central de ce fichier est structurel : la table n'a **aucune colonne** où une donnée de
// visiteur pourrait se ranger. C'est plus fort qu'un test de comportement, qui prouverait seulement
// que le code d'aujourd'hui n'en écrit pas.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withOrg, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
	countIn,
	firstRow,
	messageOfFailure,
	openDatabase,
	seedOrganisation,
	SQLSTATE,
	sqlStateOfFailure,
	withMaintenance,
	type Organisation
} from './helpers.js';

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let publicHandle: DatabaseHandle;
let app: Database;
let visiteur: Database;
let ici: Organisation;
let ailleurs: Organisation;

/** L'incrément, écrit exactement comme l'application l'écrit : par la fonction, jamais en direct. */
function compter(organizationId: string, jour: string, kind: string) {
	return visiteur.execute(
		sql`select jadwal.count_view(${organizationId}::uuid, ${jour}::date, ${kind})`
	);
}

async function compte(organizationId: string, jour: string, kind: string): Promise<number> {
	return Number(
		firstRow<{ count: string }>(
			await withOrg(app, organizationId, (tx) =>
				tx.execute(sql`
					select "count"::text from "page_view"
					where "organization_id" = ${organizationId} and "day" = ${jour} and "kind" = ${kind}
				`)
			)
		)?.count ?? '0'
	);
}

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	publicHandle = openDatabase('public');
	app = appHandle.db;
	visiteur = publicHandle.db;
	ici = await seedOrganisation(ownerHandle.db, 'compteur-ici');
	ailleurs = await seedOrganisation(ownerHandle.db, 'compteur-ailleurs');
});

afterAll(async () => {
	await ownerHandle?.close();
	await appHandle?.close();
	await publicHandle?.close();
});

describe('ce que la table peut contenir', () => {
	it('n’a que quatre colonnes, et aucune ne peut porter une donnée de visiteur', async () => {
		const colonnes = allRows<{ column_name: string; data_type: string }>(
			await app.execute(sql`
				select column_name, data_type from information_schema.columns
				where table_schema = 'public' and table_name = 'page_view'
				order by ordinal_position
			`)
		);
		// Ni adresse, ni identifiant, ni agent utilisateur, ni provenance — et **pas d'horodatage**.
		// Un `created_at` donnerait l'heure de la première vue du jour : dans une organisation de
		// quartier, l'heure exacte à laquelle une personne a lu la page.
		expect(colonnes).toEqual([
			{ column_name: 'organization_id', data_type: 'uuid' },
			{ column_name: 'day', data_type: 'date' },
			{ column_name: 'kind', data_type: 'text' },
			{ column_name: 'count', data_type: 'bigint' }
		]);
	});

	it('borne `kind` aux trois types, et refuse tout ce qui ressemblerait à une provenance', async () => {
		expect(
			await sqlStateOfFailure(() => compter(ici.id, '2026-09-22', 'https://exemple.test'))
		).toBe(SQLSTATE.checkViolation);
		expect(await sqlStateOfFailure(() => compter(ici.id, '2026-09-22', 'referer'))).toBe(
			SQLSTATE.checkViolation
		);
	});
});

describe('l’incrément du visiteur', () => {
	it('crée la ligne du jour, puis l’augmente d’une unité à chaque fois', async () => {
		await compter(ici.id, '2026-09-22', 'page');
		expect(await compte(ici.id, '2026-09-22', 'page')).toBe(1);
		await compter(ici.id, '2026-09-22', 'page');
		await compter(ici.id, '2026-09-22', 'page');
		expect(await compte(ici.id, '2026-09-22', 'page')).toBe(3);
	});

	it('ne perd aucune vue quand deux instances comptent en même temps', async () => {
		// Une lecture suivie d'une écriture perdrait des vues sous concurrence ; `count = count + 1`
		// dans la même instruction n'en perd pas, y compris au niveau d'isolement par défaut.
		await Promise.all(Array.from({ length: 20 }, () => compter(ici.id, '2026-09-23', 'embed')));
		expect(await compte(ici.id, '2026-09-23', 'embed')).toBe(20);
	});

	it('tient les trois types séparés', async () => {
		await compter(ici.id, '2026-09-24', 'page');
		await compter(ici.id, '2026-09-24', 'embed');
		await compter(ici.id, '2026-09-24', 'feed');
		await compter(ici.id, '2026-09-24', 'feed');
		expect([
			await compte(ici.id, '2026-09-24', 'page'),
			await compte(ici.id, '2026-09-24', 'embed'),
			await compte(ici.id, '2026-09-24', 'feed')
		]).toEqual([1, 1, 2]);
	});

	it('refuse de compter pour une organisation qui n’existe pas', async () => {
		// C'est la clé étrangère qui le dit, et non une condition dans la fonction : elle le fait
		// mieux, et on ne peut pas l'oublier en récrivant la fonction.
		expect(
			await sqlStateOfFailure(() =>
				compter('01930000-0000-7000-8000-00000000dead', '2026-09-22', 'page')
			)
		).toBe(SQLSTATE.foreignKeyViolation);
	});

	it('ne laisse au visiteur aucun droit sur la table, pas même la lecture', async () => {
		// C'est la question ouverte n° 4 de l'étape 7, fermée : pour incrémenter, le rôle public
		// avait besoin de lire, et sa politique de lecture portait sur toutes les organisations
		// actives. Il ne lit plus rien du tout, et l'échec porte sur un droit absent — le message
		// le dit — et non sur une politique.
		const message = await messageOfFailure(() =>
			visiteur.execute(sql`select count(*) from "page_view"`)
		);
		expect(message).toMatch(/permission denied|droit/i);
		expect(message).toContain('page_view');

		for (const instruction of [
			sql`insert into "page_view" ("organization_id", "day", "kind", "count")
				values (${ici.id}, '2026-09-25', 'page', 1)`,
			sql`update "page_view" set "count" = 1`,
			sql`delete from "page_view"`
		]) {
			expect(await sqlStateOfFailure(() => visiteur.execute(instruction))).toBe(
				SQLSTATE.insufficientPrivilege
			);
		}
	});
});

describe('ce que les responsables en voient', () => {
	it('ne montre à une organisation que ses propres chiffres', async () => {
		await compter(ailleurs.id, '2026-09-22', 'page');
		await compter(ailleurs.id, '2026-09-22', 'page');
		expect(await withOrg(app, ici.id, (tx) => countIn(tx, 'page_view'))).toBeGreaterThan(0);
		// La fixture écrit une ligne par organisation ; la voisine en a donc une de plus, et aucune
		// des nôtres.
		const chezLaVoisine = allRows<{ organization_id: string }>(
			await withOrg(app, ailleurs.id, (tx) =>
				tx.execute(sql`select distinct "organization_id" from "page_view"`)
			)
		);
		expect(chezLaVoisine).toEqual([{ organization_id: ailleurs.id }]);
	});

	it('ne laisse pas le rôle applicatif écrire un compteur', async () => {
		// Un compteur n'est pas une donnée qu'on saisit : aucun écran ne l'écrit, et la base le
		// garantit plutôt que de faire confiance aux écrans.
		expect(
			await sqlStateOfFailure(() =>
				withOrg(app, ici.id, (tx) =>
					tx.execute(sql`update "page_view" set "count" = 9999 where "organization_id" = ${ici.id}`)
				)
			)
		).toBe(SQLSTATE.insufficientPrivilege);
		expect(
			await sqlStateOfFailure(() =>
				withOrg(app, ici.id, (tx) =>
					tx.execute(sql`delete from "page_view" where "organization_id" = ${ici.id}`)
				)
			)
		).toBe(SQLSTATE.insufficientPrivilege);
	});
});

describe('la rétention du compteur', () => {
	/** Les jours du compteur qui restent, vus par le propriétaire — le seul qui les purge. */
	async function restants(): Promise<string[]> {
		return allRows<{ day: string }>(
			await ownerHandle.db.execute(sql`
				select "day"::text from "page_view"
				where "organization_id" = ${ici.id} order by "day"
			`)
		).map((row) => row.day);
	}

	it('emporte ce qui dépasse vingt-cinq mois, et rien d’autre', async () => {
		await withMaintenance(ownerHandle.db, async (tx) => {
			for (const [mois, kind] of [
				[26, 'page'],
				[25, 'embed'],
				[24, 'feed']
			] as const) {
				await tx.execute(sql`
					insert into "page_view" ("organization_id", "day", "kind", "count")
					values (${ici.id}, (current_date - make_interval(months => ${mois}))::date, ${kind}, 5)
				`);
			}
		});
		const avant = await restants();
		expect(avant.length).toBeGreaterThanOrEqual(3);

		const supprimees = Number(
			firstRow<{ n: string }>(
				await ownerHandle.db.execute(sql`select jadwal.purge_page_views()::text as n`)
			)?.n
		);
		// La procédure supprime sans clause de restriction : c'est la politique qui borne, et elle
		// seule. Vingt-cinq mois pile est **dans** la fenêtre et survit.
		expect(supprimees).toBe(1);

		const apres = await restants();
		expect(apres).toHaveLength(avant.length - 1);
		expect(await ownerHandle.db.execute(sql`select 1`)).toBeDefined();
	});

	it('n’est pas suspendue par un verrou de conservation, et c’est voulu', async () => {
		// Le verrou de l'ADR 0030 gèle les traces de **ce que des personnes ont fait**, pour qu'un
		// litige puisse s'appuyer dessus. Le compteur ne décrit personne, et la promesse de
		// `docs/CONDITIONS.md` — vingt-cinq mois au plus — vaut envers des visiteurs qui ne sont
		// partie à aucun litige. L'étendre au compteur allongerait cette durée sans rien prouver.
		await withMaintenance(ownerHandle.db, async (tx) => {
			await tx.execute(sql`
				insert into "page_view" ("organization_id", "day", "kind", "count")
				values (${ici.id}, (current_date - make_interval(months => 30))::date, 'page', 1)
			`);
			await tx.execute(sql`
				insert into "retention_hold" ("organization_id", "reason", "placed_by")
				values (${ici.id}, 'litige en cours', 'l’exploitant')
				on conflict ("organization_id") do nothing
			`);
		});
		const supprimees = Number(
			firstRow<{ n: string }>(
				await ownerHandle.db.execute(sql`select jadwal.purge_page_views()::text as n`)
			)?.n
		);
		expect(supprimees).toBe(1);
	});

	it('est refusée aux deux rôles applicatifs, table et procédure', async () => {
		for (const db of [app, visiteur]) {
			expect(await sqlStateOfFailure(() => db.execute(sql`select jadwal.purge_page_views()`))).toBe(
				SQLSTATE.insufficientPrivilege
			);
		}
	});
});

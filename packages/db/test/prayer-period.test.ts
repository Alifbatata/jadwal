// Les périodes d'horaires : ce que l'organisation saisit elle-même (ADR 0004, étape 8).
//
// Le test central de ce fichier est celui du chevauchement. Deux périodes qui se recouvrent
// rendraient la résolution des heures ambiguë — deux lignes pour la même date, et la réponse
// dépendrait de l'ordre de lecture. Ce n'est pas l'écran qui l'interdit, c'est la base.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, withOrg, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
	countIn,
	openDatabase,
	seedOrganisation,
	SQLSTATE,
	sqlStateOfFailure,
	type Organisation
} from './helpers.js';

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let app: Database;
let ici: Organisation;
let ailleurs: Organisation;

/** Le code que PostgreSQL rend quand une contrainte d'exclusion mord. */
const EXCLUSION = '23P01';

interface Periode {
	organizationId?: string;
	nom?: string;
	de: string;
	a?: string | null;
	colonnes?: Record<string, string | number | null>;
}

function poser({ organizationId, nom, de, a = null, colonnes = {} }: Periode) {
	const cible = organizationId ?? ici.id;
	const noms = Object.keys(colonnes);
	const entetes = noms.map((nom) => sql.identifier(nom));
	const valeurs = noms.map((nom) => sql`${colonnes[nom]}`);
	return withOrg(app, cible, (tx) =>
		tx.execute(sql`
			insert into "prayer_period" ("id", "organization_id", "name", "from_date", "to_date"
				${noms.length > 0 ? sql`, ${sql.join(entetes, sql`, `)}` : sql``})
			values (${newId()}, ${cible}, ${nom ?? 'Période'}, ${de}, ${a}
				${noms.length > 0 ? sql`, ${sql.join(valeurs, sql`, `)}` : sql``})
		`)
	);
}

/** Vide les périodes de l'organisation d'essai : chaque cas part d'une table propre. */
async function vider(organizationId = ici.id) {
	await withOrg(app, organizationId, (tx) =>
		tx.execute(sql`delete from "prayer_period" where "organization_id" = ${organizationId}`)
	);
}

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	app = appHandle.db;
	ici = await seedOrganisation(ownerHandle.db, 'periodes-ici');
	ailleurs = await seedOrganisation(ownerHandle.db, 'periodes-ailleurs');
});

afterAll(async () => {
	await ownerHandle?.close();
	await appHandle?.close();
});

describe('deux périodes ne se chevauchent jamais', () => {
	it('accepte deux périodes qui se suivent, et refuse deux qui se recouvrent', async () => {
		await vider();
		await poser({ nom: 'Hiver', de: '2027-01-01', a: '2027-03-31' });
		// Adjacente au jour près : la première finit le 31 mars, la seconde commence le 1er avril.
		await poser({ nom: 'Printemps', de: '2027-04-01', a: '2027-06-30' });
		expect(await withOrg(app, ici.id, (tx) => countIn(tx, 'prayer_period'))).toBe(2);

		// Un seul jour de recouvrement suffit à faire mordre la contrainte.
		expect(
			await sqlStateOfFailure(() => poser({ nom: 'Chevauche', de: '2027-03-31', a: '2027-04-15' }))
		).toBe(EXCLUSION);
		// Et la période qui engloberait les deux non plus.
		expect(
			await sqlStateOfFailure(() =>
				poser({ nom: 'Toute l’année', de: '2027-01-01', a: '2027-12-31' })
			)
		).toBe(EXCLUSION);
	});

	it('traite une période sans fin comme couvrant tout ce qui vient après', async () => {
		await vider();
		await poser({ nom: 'Jusqu’à nouvel ordre', de: '2027-01-01', a: null });
		// C'est le sens de « jusqu'à nouvel ordre » : on ne peut pas en ouvrir une seconde sans
		// avoir clos la première, et la base le dit au lieu de laisser deux vérités coexister.
		expect(await sqlStateOfFailure(() => poser({ de: '2030-06-01', a: '2030-08-31' }))).toBe(
			EXCLUSION
		);
		// Ce qui précède la période ouverte, en revanche, passe.
		await poser({ nom: 'Avant', de: '2026-01-01', a: '2026-12-31' });
		expect(await withOrg(app, ici.id, (tx) => countIn(tx, 'prayer_period'))).toBe(2);
	});

	it('n’empêche pas deux organisations d’avoir la même période', async () => {
		// La contrainte porte sur l'organisation **et** la plage : elle ne doit pas transformer le
		// calendrier d'une organisation en contrainte sur celui d'une autre.
		await vider();
		await vider(ailleurs.id);
		await poser({ de: '2028-01-01', a: '2028-12-31' });
		await poser({ organizationId: ailleurs.id, de: '2028-01-01', a: '2028-12-31' });
		expect(await withOrg(app, ici.id, (tx) => countIn(tx, 'prayer_period'))).toBe(1);
		expect(await withOrg(app, ailleurs.id, (tx) => countIn(tx, 'prayer_period'))).toBe(1);
	});

	it('refuse aussi un chevauchement créé par une modification', async () => {
		await vider();
		await poser({ nom: 'Un', de: '2029-01-01', a: '2029-03-31' });
		await poser({ nom: 'Deux', de: '2029-04-01', a: '2029-06-30' });
		// Étendre la première jusqu'en mai la ferait mordre sur la seconde.
		expect(
			await sqlStateOfFailure(() =>
				withOrg(app, ici.id, (tx) =>
					tx.execute(sql`update "prayer_period" set "to_date" = '2029-05-01' where "name" = 'Un'`)
				)
			)
		).toBe(EXCLUSION);
	});
});

describe('ce qu’une période accepte et refuse', () => {
	it('refuse une fin antérieure au début', async () => {
		await vider();
		expect(await sqlStateOfFailure(() => poser({ de: '2027-06-01', a: '2027-05-31' }))).toBe(
			SQLSTATE.checkViolation
		);
	});

	it('refuse un nom vide ou fait d’espaces', async () => {
		await vider();
		for (const nom of ['', '   ']) {
			expect(await sqlStateOfFailure(() => poser({ nom, de: '2027-01-01' }))).toBe(
				SQLSTATE.checkViolation
			);
		}
	});

	it('refuse une iqama à la fois fixe et en décalage, prière par prière', async () => {
		await vider();
		// Les deux ensemble ne voudraient rien dire : rien ne dirait laquelle des deux vaut.
		expect(
			await sqlStateOfFailure(() =>
				poser({ de: '2027-01-01', colonnes: { maghrib_iqama: '19:30', maghrib_iqama_offset: 5 } })
			)
		).toBe(SQLSTATE.checkViolation);
		// L'une **ou** l'autre, en revanche, et sur des prières différentes dans la même période.
		await poser({
			de: '2027-01-01',
			colonnes: { fajr_iqama: '06:30', maghrib_iqama_offset: 5 }
		});
		expect(await withOrg(app, ici.id, (tx) => countIn(tx, 'prayer_period'))).toBe(1);
	});

	it('refuse un décalage d’iqama négatif ou démesuré', async () => {
		await vider();
		for (const decalage of [-1, 121]) {
			expect(
				await sqlStateOfFailure(() =>
					poser({ de: '2027-01-01', colonnes: { isha_iqama_offset: decalage } })
				)
			).toBe(SQLSTATE.checkViolation);
		}
	});

	it('refuse une heure avec des secondes', async () => {
		await vider();
		expect(
			await sqlStateOfFailure(() => poser({ de: '2027-01-01', colonnes: { fajr: '06:30:30' } }))
		).toBe(SQLSTATE.checkViolation);
	});
});

describe('isolation', () => {
	it('ne montre à une organisation que ses propres périodes', async () => {
		await vider();
		await vider(ailleurs.id);
		await poser({ nom: 'La nôtre', de: '2031-01-01', a: '2031-12-31' });
		await poser({ organizationId: ailleurs.id, nom: 'La leur', de: '2031-01-01', a: '2031-12-31' });

		const vues = await withOrg(app, ici.id, async (tx) =>
			allRows<{ name: string }>(await tx.execute(sql`select "name" from "prayer_period"`))
		);
		expect(vues.map((ligne) => ligne.name)).toEqual(['La nôtre']);
	});

	it('disparaît avec l’organisation', async () => {
		const ephemere = await seedOrganisation(ownerHandle.db, 'periodes-ephemere');
		expect(await withOrg(app, ephemere.id, (tx) => countIn(tx, 'prayer_period'))).toBe(1);
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`delete from "organization" where "id" = ${ephemere.id}`);
		});
		const restantes = await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			return countIn(tx, 'prayer_period', sql.raw(`where "organization_id" = '${ephemere.id}'`));
		});
		expect(restantes).toBe(0);
	});
});

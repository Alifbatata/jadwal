// Le module des heures de prière, et l'invariant que la base tient à sa place (ADR 0042).
//
// L'interface cache l'ancrage sur une prière quand le module est éteint, et l'écran des réglages
// compte ce qui bloque avant de proposer le bouton. Ni l'un ni l'autre n'est une garantie : un envoi
// de formulaire fabriqué à la main ne passe par aucun écran.
//
// Deux déclencheurs, et il faut les deux. Celui qui empêche d'éteindre pendant qu'un cours s'appuie
// sur le module ne dit rien du cours créé **après** l'extinction ; celui qui refuse ce cours ne dit
// rien de l'extinction faite pendant qu'il existe. N'en tenir qu'un laisse la même page publique
// afficher un cours dont l'heure ne peut pas être calculée.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, withOrg, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
	messageOfFailure,
	openDatabase,
	seedOrganisation,
	withMaintenance,
	type Organisation
} from './helpers.js';

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let app: Database;
let ici: Organisation;

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	app = appHandle.db;
	ici = await seedOrganisation(ownerHandle.db, 'module-prieres');
});

afterAll(async () => {
	await ownerHandle.close();
	await appHandle.close();
});

/** L'état du module, lu par le propriétaire sous son drapeau d'entretien. */
async function moduleAllume(organizationId = ici.id): Promise<boolean> {
	return withMaintenance(ownerHandle.db, async (tx) => {
		const lignes = allRows<{ prayer_module: boolean }>(
			await tx.execute(
				sql`select "prayer_module" from "organization" where "id" = ${organizationId}`
			)
		);
		return lignes[0]?.prayer_module ?? false;
	});
}

/** Pose l'interrupteur, par le rôle applicatif : c'est lui qui écrit en production. */
async function basculer(allume: boolean, organizationId = ici.id): Promise<void> {
	await withOrg(app, organizationId, async (tx) => {
		await tx.execute(
			sql`update "organization" set "prayer_module" = ${allume} where "id" = ${organizationId}`
		);
	});
}

/**
 * Un cours, avec l'horaire demandé. `prayer` l'ancre sur le Maghrib ; `jumua` en fait une session
 * du vendredi. Tout le reste est identique d'un cas à l'autre.
 */
async function poserCours(
	quoi: 'fixed' | 'prayer' | 'jumua',
	organizationId = ici.id
): Promise<string> {
	const id = newId();
	const kind = quoi === 'jumua' ? 'jumua' : 'course';
	const ordre = quoi === 'jumua' ? 1 : null;
	const timingKind = quoi === 'prayer' ? 'prayer' : 'fixed';
	await withOrg(app, organizationId, async (tx) => {
		await tx.execute(sql`
			insert into "course" (
				"id", "organization_id", "kind", "jumua_order", "status", "audience",
				"teaching_language", "source_language", "recurrence_kind", "recurrence_weekday",
				"recurrence_interval", "recurrence_anchor_date", "timing_kind", "timing_start",
				"timing_end", "timing_prayer", "timing_offset_minutes", "timing_duration_minutes",
				"starts_on"
			) values (
				${id}, ${organizationId}, ${kind}, ${ordre}, 'published', 'open',
				array['fr'], 'fr', 'weekly', array[5]::smallint[],
				1, '2026-09-04', ${timingKind},
				${timingKind === 'fixed' ? '12:10' : null},
				${timingKind === 'fixed' ? '13:00' : null},
				${timingKind === 'prayer' ? 'maghrib' : null},
				${timingKind === 'prayer' ? 15 : null},
				${timingKind === 'prayer' ? 60 : null},
				'2026-09-04'
			)
		`);
	});
	return id;
}

async function effacerCours(id: string, organizationId = ici.id): Promise<void> {
	await withOrg(app, organizationId, async (tx) => {
		await tx.execute(sql`delete from "course" where "id" = ${id}`);
	});
}

describe('le drapeau du module', () => {
	it('est éteint pour une organisation qui vient d’être créée', async () => {
		// Une organisation nue, et non le fixture des tests : celui-ci porte des heures
		// importées et allume donc son module. C'est le **défaut de la colonne** qui est en
		// question ici, et il ne se lit nulle part ailleurs.
		const id = newId();
		await withMaintenance(ownerHandle.db, async (tx) => {
			await tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone",
					"default_language", "enabled_language")
				values (${id}, 'module-nue', 'Association nue', 'Europe/Zurich', 'fr', array['fr'])
			`);
		});
		expect(await moduleAllume(id)).toBe(false);
	});

	it('s’allume et s’éteint quand rien ne s’y appuie', async () => {
		await basculer(true);
		expect(await moduleAllume()).toBe(true);
		await basculer(false);
		expect(await moduleAllume()).toBe(false);
	});
});

describe('éteindre le module', () => {
	it('est refusé tant qu’un cours est ancré sur une prière', async () => {
		await basculer(true);
		const cours = await poserCours('prayer');
		const message = await messageOfFailure(() => basculer(false));
		expect(message).toContain('prayer_module_still_used');
		// Et le drapeau n'a pas bougé : le refus est un refus, pas un aller-retour.
		expect(await moduleAllume()).toBe(true);
		await effacerCours(cours);
	});

	it('est refusé tant qu’une session du vendredi existe', async () => {
		await basculer(true);
		const session = await poserCours('jumua');
		const message = await messageOfFailure(() => basculer(false));
		expect(message).toContain('prayer_module_still_used');
		expect(await moduleAllume()).toBe(true);
		await effacerCours(session);
	});

	it('redevient possible une fois ce qui s’y appuyait retiré', async () => {
		await basculer(true);
		const cours = await poserCours('prayer');
		const session = await poserCours('jumua');
		await effacerCours(cours);
		await effacerCours(session);
		await basculer(false);
		expect(await moduleAllume()).toBe(false);
	});

	it('laisse partir un cours à heure fixe sans rien demander', async () => {
		await basculer(true);
		const cours = await poserCours('fixed');
		await basculer(false);
		expect(await moduleAllume()).toBe(false);
		await effacerCours(cours);
	});

	it('ne regarde pas ce qui se passe chez une autre organisation', async () => {
		const ailleurs = await seedOrganisation(ownerHandle.db, 'module-ailleurs');
		await basculer(true, ailleurs.id);
		const chezEux = await poserCours('prayer', ailleurs.id);

		await basculer(true);
		await basculer(false);
		expect(await moduleAllume()).toBe(false);

		await effacerCours(chezEux, ailleurs.id);
	});
});

describe('un cours qui a besoin du module', () => {
	it('ne peut pas être créé quand il est éteint', async () => {
		await basculer(false);
		const message = await messageOfFailure(() => poserCours('prayer'));
		expect(message).toContain('prayer_module_off');
	});

	it('vaut aussi pour une session du vendredi', async () => {
		await basculer(false);
		const message = await messageOfFailure(() => poserCours('jumua'));
		expect(message).toContain('prayer_module_off');
	});

	it('ne gêne pas un cours à heure fixe', async () => {
		await basculer(false);
		const cours = await poserCours('fixed');
		expect(cours).toHaveLength(36);
		await effacerCours(cours);
	});

	it('refuse aussi de changer un cours existant pour l’ancrer sur une prière', async () => {
		await basculer(false);
		const cours = await poserCours('fixed');
		const message = await messageOfFailure(() =>
			withOrg(app, ici.id, async (tx) => {
				await tx.execute(sql`
					update "course" set "timing_kind" = 'prayer', "timing_start" = null,
						"timing_end" = null, "timing_prayer" = 'maghrib',
						"timing_offset_minutes" = 15, "timing_duration_minutes" = 60
					where "id" = ${cours}
				`);
			})
		);
		expect(message).toContain('prayer_module_off');
		await effacerCours(cours);
	});
});

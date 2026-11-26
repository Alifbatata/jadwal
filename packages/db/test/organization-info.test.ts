// Ce qu'une organisation dit d'elle (étape 24, ADR 0052, docs/maquettes/public-infos.md) : six
// colonnes facultatives de `organization`, que la personne responsable écrit depuis les réglages et
// que tout visiteur lit, comme le reste de la ligne.
//
// La base tient elle-même ce que l'écran annonce : un texte vide n'est pas une information, chaque
// champ a sa longueur, le site commence par `http://` ou `https://`, et les champs d'une ligne
// n'ont pas de retour à la ligne. Le rôle applicatif n'écrit que ces colonnes et celles des
// réglages : ni l'adresse publique, ni l'état de l'organisation.

import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withOrg, type Database, type DatabaseHandle } from '../src/index.js';
import {
	allRows,
	asAdmin,
	firstRow,
	messageOfFailure,
	openDatabase,
	seedOrganisation,
	sqlStateOfFailure,
	SQLSTATE,
	type Organisation
} from './helpers.js';

const COLONNES = [
	'address',
	'contact_phone',
	'contact_email',
	'website',
	'access_note',
	'announcement'
] as const;
type Colonne = (typeof COLONNES)[number];

/** Une valeur que chaque colonne accepte. */
const VALABLE: Record<Colonne, string> = {
	address: 'Rue de l’Exemple 12\n2500 Bienne',
	contact_phone: '+41 32 000 00 00',
	contact_email: 'contact@example.org',
	website: 'https://www.example.org/',
	access_note: 'Bus 4, arrêt Exemple.\nEntrée des femmes par la cour.',
	announcement: 'La salle du bas est fermée cette semaine.'
};
/** La longueur que chaque colonne admet au plus (docs/maquettes/public-infos.md). */
const LIMITE: Record<Colonne, number> = {
	address: 300,
	contact_phone: 40,
	contact_email: 254,
	website: 300,
	access_note: 1000,
	announcement: 500
};
/** Les champs d'une seule ligne : un retour à la ligne n'y a pas de sens. */
const SUR_UNE_LIGNE: readonly Colonne[] = ['contact_phone', 'contact_email', 'website'];

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let publicHandle: DatabaseHandle;
let owner: Database;
let app: Database;
let visiteur: Database;
let organisation: Organisation;

/** La responsable écrit une colonne ; rend le nombre de lignes touchées. */
async function ecrire(colonne: string, valeur: SQL | string | null): Promise<number> {
	return withOrg(app, asAdmin(organisation), async (tx) => {
		const touchees = await tx.execute(
			sql`update "organization" set ${sql.identifier(colonne)} = ${valeur}, "updated_at" = now()
				where "id" = ${organisation.id} returning "id"`
		);
		return allRows(touchees).length;
	});
}

beforeAll(async () => {
	ownerHandle = openDatabase('owner');
	appHandle = openDatabase('app');
	publicHandle = openDatabase('public');
	owner = ownerHandle.db;
	app = appHandle.db;
	visiteur = publicHandle.db;
	organisation = await seedOrganisation(owner, 'organisation-qui-se-presente');
});

afterAll(async () => {
	await publicHandle?.close();
	await appHandle?.close();
	await ownerHandle?.close();
});

describe('les informations d’une organisation', () => {
	it('are all empty for an organisation that has said nothing', async () => {
		const ligne = firstRow<Record<Colonne, string | null>>(
			await visiteur.execute(
				sql`select "address", "contact_phone", "contact_email", "website", "access_note",
					"announcement" from "organization" where "id" = ${organisation.id}`
			)
		);
		expect(ligne).toEqual({
			address: null,
			contact_phone: null,
			contact_email: null,
			website: null,
			access_note: null,
			announcement: null
		});
	});

	it.each(COLONNES)('lets the manager write %s, and any visitor read it', async (colonne) => {
		expect(await ecrire(colonne, VALABLE[colonne])).toBe(1);
		const lue = firstRow<{ valeur: string | null }>(
			await visiteur.execute(
				sql`select ${sql.identifier(colonne)} as "valeur" from "organization"
					where "id" = ${organisation.id}`
			)
		);
		expect(lue?.valeur).toBe(VALABLE[colonne]);
		// Et la retire : une information qu'on enlève redevient absente, pas vide.
		expect(await ecrire(colonne, null)).toBe(1);
	});

	it.each(COLONNES)('refuses an empty or blank %s: absent is null', async (colonne) => {
		for (const vide of ['', '   ', '\n']) {
			expect(await sqlStateOfFailure(() => ecrire(colonne, vide)), JSON.stringify(vide)).toBe(
				SQLSTATE.checkViolation
			);
		}
	});

	it.each(COLONNES)('holds %s to its length', async (colonne) => {
		// Une valeur de la bonne forme, allongée jusqu'à la limite, puis d'un caractère de plus.
		const tete = colonne === 'website' ? 'https://' : colonne === 'contact_email' ? 'a@' : '';
		const juste = tete + 'x'.repeat(LIMITE[colonne] - tete.length);
		expect(juste).toHaveLength(LIMITE[colonne]);
		expect(await ecrire(colonne, juste)).toBe(1);
		expect(await sqlStateOfFailure(() => ecrire(colonne, `${juste}x`))).toBe(
			SQLSTATE.checkViolation
		);
		expect(await ecrire(colonne, null)).toBe(1);
	});

	it.each(SUR_UNE_LIGNE)('refuses a line break in %s', async (colonne) => {
		const coupee = VALABLE[colonne].replace(/(.{4})/, '$1\n');
		expect(await sqlStateOfFailure(() => ecrire(colonne, coupee))).toBe(SQLSTATE.checkViolation);
	});

	it('keeps the line breaks of the address, the access note and the announcement', async () => {
		for (const colonne of ['address', 'access_note', 'announcement'] as const) {
			expect(await ecrire(colonne, 'une ligne\nune autre'), colonne).toBe(1);
			expect(await ecrire(colonne, null), colonne).toBe(1);
		}
	});

	it.each([
		'www.example.org',
		'ftp://example.org',
		'javascript:alert(1)',
		'https://',
		'https://exa mple.org',
		' https://example.org'
	])('refuses a website that is not a web address: %s', async (site) => {
		expect(await sqlStateOfFailure(() => ecrire('website', site))).toBe(SQLSTATE.checkViolation);
	});

	it.each(['http://example.org', 'https://example.org/chemin?x=1'])(
		'accepts a website that starts with http or https: %s',
		async (site) => {
			expect(await ecrire('website', site)).toBe(1);
			expect(await ecrire('website', null)).toBe(1);
		}
	);

	it.each(['contact', 'contact@', '@example.org', 'a b@example.org', 'a@b@example.org'])(
		'refuses an e-mail address that has not the form of one: %s',
		async (adresse) => {
			expect(await sqlStateOfFailure(() => ecrire('contact_email', adresse))).toBe(
				SQLSTATE.checkViolation
			);
		}
	);

	// Ce que la migration des droits donne au rôle applicatif : ces six colonnes en plus de celles
	// des réglages, et toujours rien d'autre (migration 0059, puis celle-ci).
	it('still refuses the application role the columns that are not on a screen', async () => {
		for (const [colonne, valeur] of [
			['slug', 'autre-adresse'],
			['status', 'suspended']
		] as const) {
			expect(await messageOfFailure(() => ecrire(colonne, valeur)), colonne).toMatch(
				/permission denied/
			);
		}
	});

	it('gives the application role exactly the columns of the settings and of the information', async () => {
		const colonnes = allRows<{ colonne: string }>(
			await owner.execute(sql`
				select attname as "colonne" from pg_attribute
				where attrelid = 'public.organization'::regclass and attnum > 0 and not attisdropped
					and has_column_privilege('jadwal_app', 'public.organization', attname, 'UPDATE')
				order by attname
			`)
		).map((ligne) => ligne.colonne);
		expect(colonnes).toEqual(
			[
				'accent_color',
				'default_language',
				'enabled_language',
				'greeting',
				'name',
				'prayer_module',
				'time_zone',
				'updated_at',
				...COLONNES
			].sort()
		);
	});
});

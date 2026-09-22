// La commande d'exploitant qui retire toutes les passkeys d'un compte, pour le jour où elles sont
// perdues.
//
// Ce qu'elle doit faire, et que ces tests vérifient en base : effacer les passkeys du compte visé,
// **et seulement du sien** ; remettre à `null` le `passkey_verified_at` de ses sessions, sans quoi
// les pouvoirs survivraient jusqu'à douze heures à la perte de la passkey ; refuser une adresse
// inconnue ; et faire tout cela quand on la lance comme l'exploitant la lance, en sous-processus.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { sql } from 'drizzle-orm';
import { parseArgs, resetPasskeys } from '../scripts/reset-passkeys.mjs';
import { newId, type Database, type DatabaseHandle } from '../src/index.js';
import { allRows, firstRow, openDatabase } from './helpers.js';

let handle: DatabaseHandle;
let db: Database;

/** Les surcharges que la commande doit employer pour viser la base de test. */
const overrides = { database: inject('testDatabase') };

const DOMAINE = '@exemple-passkeys.test';

/**
 * Un compte avec `passkeys` passkeys et `sessions` sessions dont les pouvoirs sont prouvés, plus
 * une session ordinaire qui ne l'est pas — celle-là ne doit pas bouger.
 */
async function compte(prefixe: string, passkeys: number, sessions: number) {
	const email = `${prefixe}-${Date.now()}-${Math.floor(Math.random() * 1e6)}${DOMAINE}`;
	const userId = newId();
	await db.execute(sql`
		insert into "user" ("id", "email", "email_verified", "is_super_admin")
		values (${userId}, ${email}, true, true)
	`);
	for (let i = 0; i < passkeys; i += 1) {
		await db.execute(sql`
			insert into "passkey" ("id", "name", "public_key", "user_id", "credential_id", "counter",
				"device_type", "backed_up")
			values (${newId()}, ${`Appareil ${i}`}, ${`cle-publique-${i}`}, ${userId},
				${`${userId}-credential-${i}`}, 0, 'multiDevice', true)
		`);
	}
	for (let i = 0; i < sessions; i += 1) {
		await db.execute(sql`
			insert into "session" ("id", "user_id", "token", "expires_at", "passkey_verified_at")
			values (${newId()}, ${userId}, ${`${userId}-avec-pouvoirs-${i}`},
				now() + interval '12 hours', now())
		`);
	}
	await db.execute(sql`
		insert into "session" ("id", "user_id", "token", "expires_at", "passkey_verified_at")
		values (${newId()}, ${userId}, ${`${userId}-sans-pouvoir`}, now() + interval '7 days', null)
	`);
	return { email, userId };
}

async function compterPasskeys(userId: string) {
	return Number(
		firstRow<{ count: string }>(
			await db.execute(
				sql`select count(*)::text as count from "passkey" where "user_id" = ${userId}`
			)
		)?.count ?? '-1'
	);
}

async function pouvoirs(userId: string) {
	return allRows<{ token: string; passkey_verified_at: Date | null }>(
		await db.execute(
			sql`select "token", "passkey_verified_at" from "session" where "user_id" = ${userId} order by "token"`
		)
	);
}

beforeAll(() => {
	handle = openDatabase('admin');
	db = handle.db;
});

afterAll(async () => {
	// `session` et `passkey` partent en cascade avec le compte (`on delete cascade`).
	await db.execute(sql`delete from "user" where "email" like ${`%${DOMAINE}`}`);
	await handle.close();
});

describe('la lecture des arguments', () => {
	it('exige une adresse, et refuse ce qui n’en est pas une', () => {
		expect(() => parseArgs([])).toThrow(/--email/);
		expect(() => parseArgs(['--email', 'pas-une-adresse'])).toThrow(/invalide/);
		expect(() => parseArgs(['--quoi'])).toThrow(/inconnu/);
	});

	it('accepte une adresse, et retire les espaces autour', () => {
		expect(parseArgs(['--email', '  quelquun@exemple.test  '])).toEqual({
			email: 'quelquun@exemple.test'
		});
	});
});

describe('la commande', () => {
	it('retire toutes les passkeys du compte', async () => {
		const { email, userId } = await compte('trois', 3, 0);
		expect(await compterPasskeys(userId)).toBe(3);

		expect(await resetPasskeys({ email, overrides })).toEqual({ email, passkeys: 3, sessions: 0 });
		expect(await compterPasskeys(userId)).toBe(0);
	});

	it('coupe les pouvoirs des sessions ouvertes, sans déconnecter la personne', async () => {
		// Le cœur du test. Les pouvoirs ne viennent pas de la table des passkeys mais de
		// `session.passkey_verified_at` : effacer les unes sans remettre l'autre à zéro laisserait
		// une session garder ses pouvoirs de super-admin pendant douze heures.
		const { email, userId } = await compte('pouvoirs', 2, 2);

		const resultat = await resetPasskeys({ email, overrides });
		expect(resultat).toEqual({ email, passkeys: 2, sessions: 2 });

		const apres = await pouvoirs(userId);
		expect(apres, 'les trois sessions sont toujours là : personne n’est déconnecté').toHaveLength(
			3
		);
		expect(
			apres.every((s) => s.passkey_verified_at === null),
			'et plus aucune ne porte de pouvoirs'
		).toBe(true);
	});

	it('ne touche pas aux autres comptes', async () => {
		const voisin = await compte('voisin', 2, 1);
		const cible = await compte('cible', 1, 1);

		await resetPasskeys({ email: cible.email, overrides });

		expect(await compterPasskeys(voisin.userId), 'le voisin garde ses passkeys').toBe(2);
		expect(
			(await pouvoirs(voisin.userId)).filter((s) => s.passkey_verified_at !== null),
			'et ses pouvoirs'
		).toHaveLength(1);
	});

	it('est rejouable : la deuxième fois, il n’y a plus rien à retirer', async () => {
		const { email } = await compte('rejoue', 2, 1);
		await resetPasskeys({ email, overrides });
		expect(await resetPasskeys({ email, overrides })).toEqual({ email, passkeys: 0, sessions: 0 });
	});

	it('reconnaît l’adresse quelle que soit la casse', async () => {
		const { email, userId } = await compte('Casse', 1, 0);
		await resetPasskeys({ email: email.toUpperCase(), overrides });
		expect(await compterPasskeys(userId)).toBe(0);
	});

	it('refuse une adresse inconnue plutôt que de ne rien faire en silence', async () => {
		await expect(resetPasskeys({ email: `jamais-vue${DOMAINE}`, overrides })).rejects.toThrow(
			/Aucun compte/
		);
	});

	it('ne retire jamais le drapeau super-admin', async () => {
		const { email, userId } = await compte('drapeau', 1, 1);
		await resetPasskeys({ email, overrides });
		const ligne = firstRow<{ is_super_admin: boolean }>(
			await db.execute(sql`select "is_super_admin" from "user" where "id" = ${userId}`)
		);
		expect(ligne?.is_super_admin, 'le compte reste super-admin, il n’a plus de passkey').toBe(true);
	});
});

describe('la commande, lancée comme on la lance vraiment', () => {
	it('fait quelque chose, et le dit, quand on l’appelle en ligne de commande', async () => {
		// La règle du dépôt : un script qu'aucun test ne **lance** n'est pas éprouvé. Sept tests
		// passaient sur `super-admin.mjs` pendant qu'elle ne s'exécutait pas du tout et sortait en 0.
		const { email, userId } = await compte('cli', 2, 1);
		const script = fileURLToPath(new URL('../scripts/reset-passkeys.mjs', import.meta.url));
		const { status, stdout, stderr } = spawnSync(process.execPath, [script, '--email', email], {
			encoding: 'utf8',
			env: { ...process.env, POSTGRES_DB: inject('testDatabase') }
		});

		expect(stderr, 'la commande ne doit rien écrire sur la sortie d’erreur').toBe('');
		expect(status, 'la commande doit réussir').toBe(0);
		expect(stdout, 'la commande doit dire ce qu’elle a fait').toContain(email);
		expect(stdout).toContain('2 passkey(s) retirée(s)');

		expect(await compterPasskeys(userId), 'et l’avoir fait pour de vrai').toBe(0);
		expect((await pouvoirs(userId)).filter((s) => s.passkey_verified_at !== null)).toHaveLength(0);
	});

	it('sort en erreur, et le dit, sur une adresse inconnue', async () => {
		const script = fileURLToPath(new URL('../scripts/reset-passkeys.mjs', import.meta.url));
		const { status, stdout, stderr } = spawnSync(
			process.execPath,
			[script, '--email', `inconnue-cli${DOMAINE}`],
			{ encoding: 'utf8', env: { ...process.env, POSTGRES_DB: inject('testDatabase') } }
		);

		expect(status, 'un compte inconnu est une erreur, pas un succès').toBe(1);
		expect(stderr).toContain('Aucun compte');
		expect(stdout).toBe('');
	});
});

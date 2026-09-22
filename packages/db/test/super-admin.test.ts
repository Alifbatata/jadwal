// La commande d'exploitant qui ouvre le premier compte : elle crée le compte s'il n'existe pas et
// lui pose le drapeau super-admin, avant toute connexion.
//
// C'est la seule façon prévue de désigner un super-admin. L'application, elle, ne le peut pas : une
// politique interdit au rôle d'authentification d'écrire `is_super_admin = true` (migration 0032).
// Ce test le vérifie aussi, parce que la commande n'a de sens que tant que cette interdiction tient.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { sql } from 'drizzle-orm';
import { grantSuperAdmin, parseArgs } from '../scripts/super-admin.mjs';
import { newId, type Database, type DatabaseHandle } from '../src/index.js';
import { openDatabase } from './helpers.js';

let handle: DatabaseHandle;
let db: Database;

/** Les surcharges que la commande doit employer pour viser la base de test. */
const overrides = { database: inject('testDatabase') };

async function ligne(email: string) {
	const rows = await db.execute(
		sql`select "id", "email", "name", "is_super_admin", "email_verified"
		    from "user" where lower("email") = lower(${email})`
	);
	const tableau = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []);
	return tableau as {
		id: string;
		email: string;
		name: string | null;
		is_super_admin: boolean;
		email_verified: boolean;
	}[];
}

beforeAll(() => {
	handle = openDatabase('admin');
	db = handle.db;
});

afterAll(async () => {
	await db.execute(sql`delete from "user" where "email" like '%@exemple-super-admin.test'`);
	await handle.close();
});

describe('la lecture des arguments', () => {
	it('exige une adresse, et refuse ce qui n’en est pas une', () => {
		expect(() => parseArgs([])).toThrow(/--email/);
		expect(() => parseArgs(['--email', 'pas-une-adresse'])).toThrow(/invalide/);
		expect(() => parseArgs(['--email', 'a@b'])).toThrow(/invalide/);
		expect(() => parseArgs(['--quoi'])).toThrow(/inconnu/);
	});

	it('accepte une adresse, et retire les espaces autour', () => {
		expect(parseArgs(['--email', '  quelquun@exemple.test  '])).toEqual({
			email: 'quelquun@exemple.test'
		});
		expect(parseArgs(['--email', 'a@b.test', '--name', 'Quelqu’un'])).toEqual({
			email: 'a@b.test',
			name: 'Quelqu’un'
		});
	});
});

describe('la commande', () => {
	it('crée le compte d’une adresse inconnue, et le fait super-admin', async () => {
		const email = `neuf-${Date.now()}@exemple-super-admin.test`;
		expect(await ligne(email)).toHaveLength(0);

		const resultat = await grantSuperAdmin({ email, overrides });
		expect(resultat).toEqual({ email, cree: true, deja: false });

		const [cree] = await ligne(email);
		expect(cree?.is_super_admin).toBe(true);
		// Le lien magique n'a pas encore été suivi : rien ne dit que l'adresse est vérifiée.
		expect(cree?.email_verified).toBe(false);
	});

	it('pose le drapeau sur un compte qui existe déjà, sans en créer un second', async () => {
		const email = `existant-${Date.now()}@exemple-super-admin.test`;
		await db.execute(
			sql`insert into "user" ("id", "email", "email_verified", "is_super_admin")
			    values (${newId()}, ${email}, true, false)`
		);

		const resultat = await grantSuperAdmin({ email, overrides });
		expect(resultat).toEqual({ email, cree: false, deja: false });

		const lignes = await ligne(email);
		expect(lignes).toHaveLength(1);
		expect(lignes[0]?.is_super_admin).toBe(true);
	});

	it('est rejouable : la deuxième fois, elle ne fait rien et le dit', async () => {
		const email = `rejoue-${Date.now()}@exemple-super-admin.test`;
		await grantSuperAdmin({ email, overrides });
		expect(await grantSuperAdmin({ email, overrides })).toEqual({ email, cree: false, deja: true });
		expect(await ligne(email)).toHaveLength(1);
	});

	it('reconnaît l’adresse quelle que soit la casse, et n’en crée pas un doublon', async () => {
		const email = `Casse-${Date.now()}@exemple-super-admin.test`;
		await grantSuperAdmin({ email, overrides });
		const resultat = await grantSuperAdmin({ email: email.toUpperCase(), overrides });
		expect(resultat.deja).toBe(true);
		expect(await ligne(email)).toHaveLength(1);
	});
});

describe('la commande, lancée comme on la lance vraiment', () => {
	it('fait quelque chose, et le dit, quand on l’appelle en ligne de commande', async () => {
		// Ce test existe parce que le contraire est arrivé : `isMainModule` recevait une URL là où il
		// attend un chemin, la garde rendait faux, et la commande **ne faisait rien en sortant en 0**.
		// Rien dans la sortie, rien dans la base, et un code de retour qui disait que tout allait
		// bien. Appeler la fonction depuis un test ne l'aurait jamais montré : il faut lancer le
		// fichier comme l'exploitant le lance.
		const email = `cli-${Date.now()}@exemple-super-admin.test`;
		const script = fileURLToPath(new URL('../scripts/super-admin.mjs', import.meta.url));
		const { status, stdout, stderr } = spawnSync(process.execPath, [script, '--email', email], {
			encoding: 'utf8',
			env: { ...process.env, POSTGRES_DB: inject('testDatabase') }
		});

		expect(stderr, 'la commande ne doit rien écrire sur la sortie d’erreur').toBe('');
		expect(status, 'la commande doit réussir').toBe(0);
		expect(stdout, 'la commande doit dire ce qu’elle a fait').toContain(email);
		expect(stdout).toContain('compte créé');

		const [cree] = await ligne(email);
		expect(cree?.is_super_admin, 'et l’avoir fait pour de vrai').toBe(true);
	});
});

describe('ce que l’application ne peut pas faire', () => {
	it('le rôle d’authentification ne peut pas se donner le drapeau', async () => {
		const auth = openDatabase('auth');
		const email = `auth-${Date.now()}@exemple-super-admin.test`;
		try {
			await expect(
				auth.db.execute(
					sql`insert into "user" ("id", "email", "email_verified", "is_super_admin")
					    values (${newId()}, ${email}, false, true)`
				)
			).rejects.toThrow();
			expect(await ligne(email)).toHaveLength(0);
		} finally {
			await auth.close();
		}
	});
});

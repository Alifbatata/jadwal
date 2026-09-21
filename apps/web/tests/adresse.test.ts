// L'adresse réelle du visiteur, derrière un mandataire inverse (étape 9).
//
// Ce fichier existe pour une raison précise : jusqu'à l'étape 9, l'application lisait la
// **première** valeur de `X-Forwarded-For`. Un mandataire **ajoute** la sienne à celles que le
// client a envoyées — un visiteur qui pose `X-Forwarded-For: 1.2.3.4` obtient donc
// `1.2.3.4, <sa vraie adresse>` après Caddy. Nous lisions `1.2.3.4`, c'est-à-dire ce que le visiteur
// avait choisi : il lui suffisait d'en changer à chaque requête pour obtenir un seau de limitation
// neuf, et la limitation de débit publique ne valait rien.
//
// Les requêtes de ce fichier vont à la **troisième** instance, la seule configurée comme en
// production. Et le test joue le rôle du mandataire : il envoie l'en-tête tel que Caddy le
// laisserait, c'est-à-dire avec la vraie adresse **en dernier**. C'est la seule manière d'éprouver
// la règle plutôt que de la relire.

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDatabase, sql, type DatabaseHandle } from '@jadwal/db';
import { storedKey } from '../src/lib/server/rate-limit.js';

const proxiedOrigin = inject('proxiedOrigin');
const testDatabase = inject('testDatabase');
process.env['BETTER_AUTH_SECRET'] = inject('authSecret');

let ownerHandle: DatabaseHandle;

/** L'adresse que le visiteur essaie de se donner. Elle ne doit jamais servir de clé. */
const USURPEE = '198.51.100.7';
/** L'adresse que le mandataire ajoute : la vraie, celle qui doit compter. */
const REELLE = '203.0.113.9';

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

/** Vrai si un seau de limitation existe pour cette clé en clair. */
async function seauExiste(cle: string): Promise<boolean> {
	const trouve = await ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		return rows<{ key: string }>(
			await tx.execute(sql`select "key" from "rate_limit" where "key" = ${storedKey(cle)}`)
		);
	});
	return trouve.length > 0;
}

async function viderLesSeaux() {
	await ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		await tx.execute(sql`delete from "rate_limit"`);
	});
}

/** Une requête publique, avec l'en-tête tel qu'un mandataire le laisserait. */
async function visiter(chemin: string, forwardedFor: string): Promise<Response> {
	const response = await fetch(`${proxiedOrigin}${chemin}`, {
		headers: {
			'x-forwarded-for': forwardedFor,
			'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36'
		}
	});
	await response.arrayBuffer();
	return response;
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
});

afterAll(async () => {
	await ownerHandle?.close();
});

describe('un visiteur ne choisit pas son adresse', () => {
	it('retient celle que le mandataire a ajoutée, pas celle que le visiteur a écrite', async () => {
		await viderLesSeaux();
		// Ce que Caddy laisse quand le visiteur a triché : sa valeur d'abord, la vraie ensuite.
		await visiter('/api/v1/organisations/inexistante', `${USURPEE}, ${REELLE}`);

		expect(await seauExiste(`public:${REELLE}`), 'le seau de la vraie adresse').toBe(true);
		expect(await seauExiste(`public:${USURPEE}`), 'le seau de l’adresse usurpée').toBe(false);
	});

	it('ne se laisse pas donner un seau neuf à chaque requête', async () => {
		// Le cœur du défaut : avec l'ancienne lecture, chaque valeur inventée créait un seau. On en
		// invente dix ; il ne doit toujours y avoir qu'un seul seau public, celui de la vraie
		// adresse.
		await viderLesSeaux();
		for (let essai = 0; essai < 10; essai += 1) {
			await visiter('/api/v1/organisations/inexistante', `10.0.0.${essai}, ${REELLE}`);
		}
		const seaux = await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			return rows<{ key: string; count: number }>(
				await tx.execute(sql`select "key", "count" from "rate_limit"`)
			);
		});
		expect(seaux).toHaveLength(1);
		expect(seaux[0]?.key).toBe(storedKey(`public:${REELLE}`));
		expect(Number(seaux[0]?.count)).toBe(10);
	});

	it('lit la seule valeur présente quand le visiteur n’a rien envoyé', async () => {
		await viderLesSeaux();
		await visiter('/api/v1/organisations/inexistante', REELLE);
		expect(await seauExiste(`public:${REELLE}`)).toBe(true);
	});

	it('donne la même adresse au limiteur de Better Auth', async () => {
		// Better Auth relit l'en-tête lui-même : il faut qu'il arrive à la même conclusion, sinon les
		// deux volets de la limitation protégeraient deux choses différentes.
		//
		// La requête va à `/api/auth/…` et non à `/connexion` : notre écran de connexion appelle
		// Better Auth **dans le processus**, sans passer par son gestionnaire HTTP, donc son limiteur
		// intégré ne s'y déclenche pas. Le volet par adresse électronique, lui, s'y déclenche — et
		// c'est ce que vérifie `acces.test.ts`.
		await viderLesSeaux();
		const reponse = await fetch(
			`${proxiedOrigin}/api/auth/magic-link/verify?token=jeton-inexistant`,
			{
				redirect: 'manual',
				headers: { 'x-forwarded-for': `${USURPEE}, ${REELLE}` }
			}
		);
		await reponse.arrayBuffer();

		const cles = new Set(
			(
				await ownerHandle.db.transaction(async (tx) => {
					await tx.execute(sql`set local jadwal.maintenance = 'on'`);
					return rows<{ key: string }>(await tx.execute(sql`select "key" from "rate_limit"`));
				})
			).map((ligne) => ligne.key)
		);
		expect(cles.has(storedKey(`${REELLE}|/magic-link/verify`))).toBe(true);
		expect(cles.has(storedKey(`${USURPEE}|/magic-link/verify`))).toBe(false);
		// Et surtout : pas de repli sur le seau partagé, qui punirait tout le monde ensemble.
		expect(cles.has(storedKey('no-trusted-ip|/magic-link/verify'))).toBe(false);
	});
});

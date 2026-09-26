// Le choix de la langue et ce qu'il devient, servi par HTTP (étape 18, reprises du socle après sa
// relecture).
//
// - Un choix fait avant la connexion devient la langue du compte à la connexion, même quand le compte
//   en a déjà une ; ensuite, le compte fait foi, et un cookie resté sur un navigateur ne le défait
//   pas.
// - Le retour après le choix ne quitte jamais le service, quelle que soit la forme du chemin envoyé.
//
// Chaque « navigateur » est un bocal de cookies qui retient ce que les réponses posent et retirent,
// comme un vrai : sans lui, un test renverrait un cookie que le serveur a déjà effacé.

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';

const origin = inject('origin');
const outbox = inject('outbox');
const testDatabase = inject('testDatabase');

/** Un compte qui a déjà une langue, écrite à sa première connexion depuis un navigateur français. */
const DEJA_EN_FRANCAIS = 'choix-deja-fr@example.test';
/** Un compte qui choisit sa langue une fois connecté. */
const CHOISIT_CONNECTEE = 'choix-connectee@example.test';

let ownerHandle: DatabaseHandle;

/** Le propriétaire, sous son drapeau d'entretien, le temps d'une transaction. */
async function maintenance<T>(
	travail: (tx: Parameters<Parameters<DatabaseHandle['db']['transaction']>[0]>[0]) => Promise<T>
): Promise<T> {
	return ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		return travail(tx);
	});
}

function lignes<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const rows = (result as { rows?: unknown[] }).rows;
	return Array.isArray(rows) ? (rows as T[]) : [];
}

async function langueDuCompte(email: string): Promise<string | null | undefined> {
	const trouve = await maintenance(async (tx) =>
		lignes<{ language: string | null }>(
			await tx.execute(sql`select "language" from "user" where "email" = ${email}`)
		)
	);
	return trouve[0]?.language;
}

/**
 * Les cookies d'un navigateur : ce que chaque réponse pose est retenu, ce qu'elle retire (Max-Age=0)
 * est oublié, et tout part avec la requête suivante.
 */
class Navigateur {
	readonly cookies = new Map<string, string>();

	constructor(readonly langues?: string) {}

	entete(): string {
		return [...this.cookies].map(([nom, valeur]) => `${nom}=${valeur}`).join('; ');
	}

	retenir(reponse: Response): void {
		for (const pose of reponse.headers.getSetCookie?.() ?? []) {
			const [paire = '', ...attributs] = pose.split(';');
			const egal = paire.indexOf('=');
			const nom = paire.slice(0, egal).trim();
			const valeur = paire.slice(egal + 1).trim();
			const efface = attributs.some((attribut) => /^\s*max-age=0\s*$/i.test(attribut));
			if (efface || valeur === '') this.cookies.delete(nom);
			else this.cookies.set(nom, valeur);
		}
	}

	private entetes(): Record<string, string> {
		const cookie = this.entete();
		return {
			...(cookie ? { cookie } : {}),
			...(this.langues ? { 'accept-language': this.langues } : {})
		};
	}

	async get(chemin: string): Promise<Response> {
		const reponse = await fetch(new URL(chemin, origin), {
			redirect: 'manual',
			headers: this.entetes()
		});
		this.retenir(reponse);
		return reponse;
	}

	/** Un formulaire envoyé sans JavaScript, depuis une page du service. */
	async post(chemin: string, champs: Record<string, string>): Promise<Response> {
		const reponse = await fetch(`${origin}${chemin}`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				accept: 'text/html',
				origin,
				...this.entetes()
			},
			body: new URLSearchParams(champs).toString()
		});
		this.retenir(reponse);
		return reponse;
	}

	/** Demande le lien de connexion et le suit, comme une personne sur ce navigateur. */
	async seConnecter(email: string): Promise<void> {
		await maintenance((tx) => tx.execute(sql`delete from "rate_limit"`));
		expect((await this.post('/connexion', { email })).status).toBe(200);
		const lien = (await dernierCourrielA(email))?.text.match(/https?:\/\/\S+/)?.[0];
		expect(lien, `aucun lien envoyé à ${email}`).toBeTruthy();
		await this.get(lien as string);
		expect([...this.cookies.keys()], `aucune session pour ${email}`).toContain(
			'better-auth.session_token'
		);
	}

	/** La session se ferme ; les autres cookies du navigateur restent. */
	oublierLaSession(): void {
		for (const nom of [...this.cookies.keys()]) {
			if (nom.startsWith('better-auth.')) this.cookies.delete(nom);
		}
	}
}

async function dernierCourrielA(email: string): Promise<{ text: string } | undefined> {
	const noms = (await readdir(outbox)).filter((nom) => nom.endsWith('.json')).sort();
	return noms
		.map(
			(nom) => JSON.parse(readFileSync(join(outbox, nom), 'utf8')) as { to: string; text: string }
		)
		.filter((courriel) => courriel.to === email)
		.at(-1);
}

/** La langue d'une page, lue sur sa balise `<html>`. */
async function langueDe(reponse: Response): Promise<string | undefined> {
	expect(reponse.status).toBe(200);
	return (await reponse.text()).match(/<html\b[^>]*\blang="([^"]*)"/)?.[1];
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	await maintenance(async (tx) => {
		for (const [email, langue] of [
			[DEJA_EN_FRANCAIS, 'fr'],
			[CHOISIT_CONNECTEE, null]
		] as const) {
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified", "language")
				values (${newId()}, ${email}, true, ${langue})
			`);
		}
	});
});

afterAll(async () => {
	await ownerHandle?.close();
});

describe('un choix fait avant la connexion', () => {
	it('becomes the language of the account at sign-in, even when the account already has one', async () => {
		expect(await langueDuCompte(DEJA_EN_FRANCAIS)).toBe('fr');
		const navigateur = new Navigateur('fr-CH,fr;q=0.9');

		// Sur l'écran de connexion, la personne choisit l'allemand.
		const choix = await navigateur.post('/langue', { language: 'de', returnTo: '/connexion' });
		expect(choix.status).toBe(303);
		expect(await langueDe(await navigateur.get('/connexion'))).toBe('de');

		// Elle se connecte : l'espace reste en allemand, et le compte le retient.
		await navigateur.seConnecter(DEJA_EN_FRANCAIS);
		expect(await langueDe(await navigateur.get('/organisations'))).toBe('de');
		expect(await langueDuCompte(DEJA_EN_FRANCAIS)).toBe('de');
	});

	it('then leaves the account in charge: a change made elsewhere is kept on this browser', async () => {
		const ici = new Navigateur('fr-CH,fr;q=0.9');
		await ici.post('/langue', { language: 'de', returnTo: '/connexion' });
		await ici.seConnecter(DEJA_EN_FRANCAIS);
		expect(await langueDe(await ici.get('/organisations'))).toBe('de');

		// Sur un autre appareil, la personne passe à l'italien.
		const ailleurs = new Navigateur('en-GB,en;q=0.9');
		await ailleurs.seConnecter(DEJA_EN_FRANCAIS);
		expect(
			(await ailleurs.post('/langue', { language: 'it', returnTo: '/organisations' })).status
		).toBe(303);
		expect(await langueDuCompte(DEJA_EN_FRANCAIS)).toBe('it');

		// Revenue ici, elle trouve l'italien : l'allemand resté dans ce navigateur ne le défait pas.
		expect(await langueDe(await ici.get('/organisations'))).toBe('it');
		expect(await langueDuCompte(DEJA_EN_FRANCAIS)).toBe('it');

		// Après une déconnexion, l'écran de connexion garde la langue retenue sur ce navigateur ; une
		// nouvelle connexion, sans nouveau choix, retrouve celle du compte.
		ici.oublierLaSession();
		expect(await langueDe(await ici.get('/connexion'))).toBe('de');
		await ici.seConnecter(DEJA_EN_FRANCAIS);
		expect(await langueDe(await ici.get('/organisations'))).toBe('it');
		expect(await langueDuCompte(DEJA_EN_FRANCAIS)).toBe('it');
	});

	it('is not waiting any more once a signed-in person chooses: the account keeps what she changes elsewhere', async () => {
		const ici = new Navigateur('de-CH,de;q=0.9');
		await ici.seConnecter(CHOISIT_CONNECTEE);
		// Le compte reçoit la langue du navigateur au premier écran qu'elle ouvre une fois connectée.
		expect(await langueDe(await ici.get('/organisations'))).toBe('de');
		expect(await langueDuCompte(CHOISIT_CONNECTEE)).toBe('de');
		expect((await ici.post('/langue', { language: 'ar', returnTo: '/organisations' })).status).toBe(
			303
		);
		expect(await langueDuCompte(CHOISIT_CONNECTEE)).toBe('ar');

		const ailleurs = new Navigateur();
		await ailleurs.seConnecter(CHOISIT_CONNECTEE);
		await ailleurs.post('/langue', { language: 'en', returnTo: '/organisations' });

		ici.oublierLaSession();
		await ici.seConnecter(CHOISIT_CONNECTEE);
		expect(await langueDe(await ici.get('/organisations'))).toBe('en');
		expect(await langueDuCompte(CHOISIT_CONNECTEE)).toBe('en');
	});
});

describe('le retour après le choix de la langue', () => {
	it.each([
		'//ailleurs.example/piege',
		'/\\ailleurs.example/piege',
		'https://ailleurs.example/piege',
		'/.//ailleurs.example/piege',
		'/./\\ailleurs.example/piege',
		'/..//ailleurs.example/piege',
		'/a/..//ailleurs.example/piege',
		'/%2e//ailleurs.example/piege',
		'/%2E%2E//ailleurs.example/piege',
		'/.%2e//ailleurs.example/piege',
		'/.\t//ailleurs.example/piege'
	])('never sends the browser off the service for %j', async (retour) => {
		const reponse = await new Navigateur().post('/langue', { language: 'de', returnTo: retour });
		expect(reponse.status).toBe(303);
		expect(reponse.headers.get('location')).toBe('/');
	});

	it('comes back to the screen a dot segment names on the service', async () => {
		const reponse = await new Navigateur().post('/langue', {
			language: 'de',
			returnTo: '/./conditions'
		});
		expect(reponse.headers.get('location')).toBe('/conditions');
	});

	it.each(['fr', 'de', 'it', 'en', 'ar'])(
		'sends an address typed by hand back to the service, without a message in English (%s)',
		async (langue) => {
			const navigateur = new Navigateur();
			await navigateur.post('/langue', { language: langue, returnTo: '/connexion' });
			const reponse = await navigateur.get('/langue');
			expect(reponse.status).toBe(303);
			expect(reponse.headers.get('location')).toBe('/');
			expect(await reponse.text()).toBe('');
		}
	);
});

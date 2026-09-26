// Le choix de la langue et ce qu'il devient, servi par HTTP (étape 18, reprises du socle après sa
// relecture).
//
// - Un choix fait avant la connexion devient la langue du compte à la connexion, même quand le compte
//   en a déjà une ; ensuite, le compte fait foi, et un cookie resté sur un navigateur ne le défait
//   pas.
// - Ce choix voyage avec le lien de connexion, quel que soit le temps passé avant de le demander : il
//   vaut aussi quand le lien s'ouvre sur un autre navigateur, et il n'attend plus, sur le premier,
//   une fois le lien demandé.
// - Un lien de connexion dont on change l'écran de retour pour un autre site est refusé, comme en
//   production : les serveurs de test tournent sans rien qui les dise en test (`global-setup.ts`).
// - Le retour après le choix ne quitte jamais le service, quelle que soit la forme du chemin envoyé.
// - Un écran de l'espace dit aux caches qu'il change selon le navigateur et le cookie ; une page
//   publique, qui ne lit aucun cookie, ne le dit pas.
//
// Chaque « navigateur » est un bocal de cookies qui retient ce que les réponses posent et retirent,
// et oublie ceux dont la vie est finie, comme un vrai : sans lui, un test renverrait un cookie que le
// serveur a déjà effacé, ou qu'un navigateur aurait laissé expirer.

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
/** Un compte en français qui demande son lien sur un navigateur et l'ouvre sur un autre. */
const LIEN_AILLEURS = 'choix-lien-ailleurs@example.test';
/** Un compte en français dont on lit le lien de connexion. */
const LIEN_LU = 'choix-lien-lu@example.test';
/** Un compte en français qui choisit sa langue longtemps avant de demander son lien. */
const CHOIX_ANCIEN = 'choix-ancien@example.test';
/** Un compte en français qui choisit de nouveau sa langue après avoir demandé son lien. */
const CHOIX_REFAIT = 'choix-refait@example.test';
/** Un compte en français dont on détourne le lien de connexion vers un autre site. */
const LIEN_DETOURNE = 'choix-lien-detourne@example.test';
const SLUG = 'choix-de-la-langue';

const COOKIE_EN_ATTENTE = 'jadwal_language_pending';
/** Quinze minutes, en secondes : la vie d'un lien de connexion (`auth.ts`). */
const VIE_DU_LIEN = 900;
/** Un an, en secondes : la vie des deux cookies de langue (`i18n/language.ts`). */
const UN_AN = 31_536_000;

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
 * est oublié, ce dont la vie est finie aussi, et le reste part avec la requête suivante. Le temps de
 * ce navigateur avance avec `plusTard`, sans attendre.
 */
class Navigateur {
	readonly cookies = new Map<string, string>();
	/** La vie que la dernière réponse a donnée à chaque cookie, en secondes (Max-Age). */
	readonly vies = new Map<string, number>();
	/** L'instant où chaque cookie expire, sur l'horloge de ce navigateur, en millisecondes. */
	private readonly echeances = new Map<string, number>();
	/** Le temps passé par `plusTard`, en millisecondes. */
	private avance = 0;

	constructor(readonly langues?: string) {}

	private maintenant(): number {
		return Date.now() + this.avance;
	}

	/** Le temps passe : un cookie dont la vie est finie n'est plus envoyé. */
	plusTard(secondes: number): void {
		this.avance += secondes * 1000;
	}

	entete(): string {
		for (const [nom, echeance] of this.echeances) {
			if (echeance <= this.maintenant()) this.oublier(nom);
		}
		return [...this.cookies].map(([nom, valeur]) => `${nom}=${valeur}`).join('; ');
	}

	/** Si ce navigateur enverrait ce cookie avec sa prochaine requête. */
	envoie(nom: string): boolean {
		return this.entete()
			.split('; ')
			.some((paire) => paire.startsWith(`${nom}=`));
	}

	private oublier(nom: string): void {
		this.cookies.delete(nom);
		this.vies.delete(nom);
		this.echeances.delete(nom);
	}

	retenir(reponse: Response): void {
		for (const pose of reponse.headers.getSetCookie?.() ?? []) {
			const [paire = '', ...attributs] = pose.split(';');
			const egal = paire.indexOf('=');
			const nom = paire.slice(0, egal).trim();
			const valeur = paire.slice(egal + 1).trim();
			const vie = attributs
				.map((attribut) => /^\s*max-age=(\d+)\s*$/i.exec(attribut)?.[1])
				.find((trouve) => trouve !== undefined);
			if (vie === '0' || valeur === '') {
				this.oublier(nom);
				continue;
			}
			this.cookies.set(nom, valeur);
			if (vie === undefined) {
				this.vies.delete(nom);
				this.echeances.delete(nom);
			} else {
				this.vies.set(nom, Number(vie));
				this.echeances.set(nom, this.maintenant() + Number(vie) * 1000);
			}
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

	/** Demande le lien de connexion sur ce navigateur, et le rend tel que le courriel le porte. */
	async demanderLeLien(email: string): Promise<{ lien: string; sujet: string }> {
		await maintenance((tx) => tx.execute(sql`delete from "rate_limit"`));
		const avant = await dernierCourrielA(email);
		expect((await this.post('/connexion', { email })).status).toBe(200);
		const courriel = await dernierCourrielA(email);
		expect(courriel, `aucun courriel neuf pour ${email}`).not.toEqual(avant);
		const lien = courriel?.text.match(/https?:\/\/\S+/)?.[0];
		expect(lien, `aucun lien envoyé à ${email}`).toBeTruthy();
		return { lien: lien as string, sujet: courriel?.subject ?? '' };
	}

	/** Suit un lien de connexion sur ce navigateur, d'où qu'il vienne, et rend la redirection. */
	async suivre(lien: string): Promise<Response> {
		const reponse = await this.get(lien);
		expect([...this.cookies.keys()], 'aucune session ouverte par le lien').toContain(
			'better-auth.session_token'
		);
		return reponse;
	}

	/** Demande le lien de connexion et le suit, comme une personne sur ce navigateur. */
	async seConnecter(email: string): Promise<void> {
		await this.suivre((await this.demanderLeLien(email)).lien);
	}

	/** La session se ferme ; les autres cookies du navigateur restent. */
	oublierLaSession(): void {
		for (const nom of [...this.cookies.keys()]) {
			if (nom.startsWith('better-auth.')) this.cookies.delete(nom);
		}
	}
}

async function dernierCourrielA(
	email: string
): Promise<{ text: string; subject: string } | undefined> {
	const noms = (await readdir(outbox)).filter((nom) => nom.endsWith('.json')).sort();
	return noms
		.map(
			(nom) =>
				JSON.parse(readFileSync(join(outbox, nom), 'utf8')) as {
					to: string;
					subject: string;
					text: string;
				}
		)
		.filter((courriel) => courriel.to === email)
		.at(-1);
}

/** La langue d'une page, lue sur sa balise `<html>`. */
async function langueDe(reponse: Response): Promise<string | undefined> {
	expect(reponse.status).toBe(200);
	return (await reponse.text()).match(/<html\b[^>]*\blang="([^"]*)"/)?.[1];
}

/** Les noms que l'en-tête `Vary` d'une réponse énumère, en minuscules. */
function variations(reponse: Response): string[] {
	return (reponse.headers.get('vary') ?? '')
		.split(',')
		.map((nom) => nom.trim().toLowerCase())
		.filter(Boolean);
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	await maintenance(async (tx) => {
		for (const [email, langue] of [
			[DEJA_EN_FRANCAIS, 'fr'],
			[CHOISIT_CONNECTEE, null],
			[LIEN_AILLEURS, 'fr'],
			[LIEN_LU, 'fr'],
			[CHOIX_ANCIEN, 'fr'],
			[CHOIX_REFAIT, 'fr'],
			[LIEN_DETOURNE, 'fr']
		] as const) {
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified", "language")
				values (${newId()}, ${email}, true, ${langue})
			`);
		}
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language")
			values (${newId()}, ${SLUG}, 'Choix de la langue', 'Europe/Zurich', 'fr',
				array['fr','de','it','en','ar'])
		`);
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
		// Le choix est donné : il n'attend plus sur ce navigateur, qui garde la langue choisie.
		expect(navigateur.envoie(COOKIE_EN_ATTENTE)).toBe(false);
		expect(navigateur.cookies.get('jadwal_language')).toBe('de');
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

describe('le choix fait avant la connexion, et le lien de connexion', () => {
	it('keeps a choice waiting until a link is asked for, however long that takes, and not after', async () => {
		const ordinateur = new Navigateur('fr-CH,fr;q=0.9');
		await ordinateur.post('/langue', { language: 'de', returnTo: '/connexion' });
		// Le choix en attente se garde comme la langue choisie : un an.
		expect(ordinateur.vies.get('jadwal_language')).toBe(UN_AN);
		expect(ordinateur.vies.get(COOKIE_EN_ATTENTE)).toBe(UN_AN);

		// Une heure plus tard, elle demande son lien : le choix part avec lui, et n'attend plus ici.
		ordinateur.plusTard(60 * 60);
		expect(ordinateur.envoie(COOKIE_EN_ATTENTE)).toBe(true);
		const premier = new URL((await ordinateur.demanderLeLien(LIEN_LU)).lien);
		expect(premier.searchParams.get('callbackURL')).toBe('/organisations?language=de');
		expect(ordinateur.envoie(COOKIE_EN_ATTENTE)).toBe(false);

		// Un second lien, demandé sans nouveau choix, ne l'emporte plus. La langue choisie reste sur
		// ce navigateur, pour ses écrans d'avant la connexion.
		const second = new URL((await ordinateur.demanderLeLien(LIEN_LU)).lien);
		expect(second.searchParams.get('callbackURL')).toBe('/organisations');
		expect(await langueDe(await ordinateur.get('/connexion'))).toBe('de');
	});

	it('goes with a link asked long after the choice, on the same browser, into the space', async () => {
		expect(await langueDuCompte(CHOIX_ANCIEN)).toBe('fr');
		// Sur l'écran de connexion, la personne choisit l'allemand, puis fait autre chose.
		const navigateur = new Navigateur('fr-CH,fr;q=0.9');
		await navigateur.post('/langue', { language: 'de', returnTo: '/connexion' });

		// Seize minutes plus tard, plus que la vie d'un lien, elle demande son lien sur le même
		// navigateur, puis le suit : l'espace s'ouvre dans la langue qu'elle a choisie.
		navigateur.plusTard(VIE_DU_LIEN + 60);
		expect(await langueDe(await navigateur.get('/connexion'))).toBe('de');
		const { lien, sujet } = await navigateur.demanderLeLien(CHOIX_ANCIEN);
		expect(sujet).toBe('Ihr Anmeldelink für jadwal');
		const arrivee = await navigateur.suivre(lien);
		expect(new URL(arrivee.headers.get('location') ?? '', origin).origin).toBe(origin);
		expect(await langueDe(await navigateur.get('/organisations'))).toBe('de');
		expect(await langueDuCompte(CHOIX_ANCIEN)).toBe('de');
	});

	it('is given at sign-in when made again after the link was asked for, and then waits no more', async () => {
		expect(await langueDuCompte(CHOIX_REFAIT)).toBe('fr');
		// Elle choisit l'allemand et demande son lien, qui l'emporte ; puis, en attendant le courriel,
		// elle passe à l'italien sur le même navigateur.
		const navigateur = new Navigateur('fr-CH,fr;q=0.9');
		await navigateur.post('/langue', { language: 'de', returnTo: '/connexion' });
		const { lien } = await navigateur.demanderLeLien(CHOIX_REFAIT);
		await navigateur.post('/langue', { language: 'it', returnTo: '/connexion' });
		expect(navigateur.envoie(COOKIE_EN_ATTENTE)).toBe(true);

		// Elle suit le lien sur ce navigateur : son dernier choix l'emporte, et n'attend plus.
		await navigateur.suivre(lien);
		expect(await langueDe(await navigateur.get('/organisations'))).toBe('it');
		expect(await langueDuCompte(CHOIX_REFAIT)).toBe('it');
		expect(navigateur.envoie(COOKIE_EN_ATTENTE)).toBe(false);
	});

	it('follows the link to another browser, then leaves the account in charge on both', async () => {
		expect(await langueDuCompte(LIEN_AILLEURS)).toBe('fr');
		// Sur son ordinateur, la personne choisit l'allemand sur l'écran de connexion et demande son
		// lien. Le courriel part en allemand.
		const ordinateur = new Navigateur('fr-CH,fr;q=0.9');
		await ordinateur.post('/langue', { language: 'de', returnTo: '/connexion' });
		const { lien, sujet } = await ordinateur.demanderLeLien(LIEN_AILLEURS);
		expect(sujet).toBe('Ihr Anmeldelink für jadwal');

		// Elle l'ouvre sur son téléphone, depuis sa messagerie : un navigateur qui n'a rien choisi. Le
		// lien la ramène sur le service, et l'espace s'ouvre dans la langue qu'elle a choisie.
		const telephone = new Navigateur('fr-CH,fr;q=0.9');
		const arrivee = await telephone.suivre(lien);
		expect(new URL(arrivee.headers.get('location') ?? '', origin).origin).toBe(origin);
		expect.soft(await langueDe(await telephone.get('/organisations'))).toBe('de');
		expect.soft(await langueDuCompte(LIEN_AILLEURS)).toBe('de');

		// Sur le téléphone, elle passe ensuite à l'italien.
		expect(
			(await telephone.post('/langue', { language: 'it', returnTo: '/organisations' })).status
		).toBe(303);
		expect(await langueDuCompte(LIEN_AILLEURS)).toBe('it');

		// Plus tard, elle revient à l'ordinateur et se connecte sans rien choisir : l'allemand choisi
		// là avant la première connexion ne revient pas. L'italien reste, ici comme sur le téléphone.
		ordinateur.plusTard(VIE_DU_LIEN + 60);
		await ordinateur.seConnecter(LIEN_AILLEURS);
		expect.soft(await langueDe(await ordinateur.get('/organisations'))).toBe('it');
		expect.soft(await langueDuCompte(LIEN_AILLEURS)).toBe('it');
		expect.soft(await langueDe(await telephone.get('/organisations'))).toBe('it');
	});

	it('puts nothing more in the link than before, apart from the language chosen before signing in', async () => {
		// Sans choix : le jeton, et l'écran où le lien ramène.
		const sansChoix = new URL((await new Navigateur('fr-CH').demanderLeLien(LIEN_LU)).lien);
		// Avec un choix fait avant la connexion : les mêmes, la langue choisie en plus dans l'écran où
		// le lien ramène.
		const navigateur = new Navigateur('fr-CH');
		await navigateur.post('/langue', { language: 'ar', returnTo: '/connexion' });
		const avecChoix = new URL((await navigateur.demanderLeLien(LIEN_LU)).lien);

		for (const lien of [sansChoix, avecChoix]) {
			expect(lien.origin).toBe(origin);
			expect(lien.pathname).toBe('/api/auth/magic-link/verify');
			expect([...lien.searchParams.keys()].sort()).toEqual(['callbackURL', 'token']);
			expect(lien.searchParams.get('token')).toMatch(/^[A-Za-z0-9]{32}$/);
			// Ni l'adresse, sous aucune forme.
			expect(decodeURIComponent(lien.href)).not.toContain(LIEN_LU);
			expect(lien.href).not.toContain(encodeURIComponent(LIEN_LU));
		}
		expect(sansChoix.searchParams.get('callbackURL')).toBe('/organisations');
		expect(avecChoix.searchParams.get('callbackURL')).toBe('/organisations?language=ar');
	});

	it('lets no address change the language of an account: only the link does, when it is verified', async () => {
		const navigateur = new Navigateur('fr-CH');
		await navigateur.seConnecter(LIEN_LU);
		expect(await langueDe(await navigateur.get('/organisations'))).toBe('fr');
		// Un lien posé sur un autre site, vers l'écran où arrive un lien de connexion, avec une langue :
		// il ne change ni la page ni le compte.
		expect(await langueDe(await navigateur.get('/organisations?language=ar'))).toBe('fr');
		expect(await langueDuCompte(LIEN_LU)).toBe('fr');
	});

	it('refuses a link whose return leads to another site, as in production', async () => {
		const navigateur = new Navigateur('fr-CH');
		await navigateur.post('/langue', { language: 'de', returnTo: '/connexion' });
		const { lien } = await navigateur.demanderLeLien(LIEN_DETOURNE);

		// Le même jeton, avec un écran de retour pris sur un autre site : refusé, sans session ouverte,
		// sans rien écrire sur le compte, et sans renvoyer nulle part.
		for (const ailleurs of [
			'https://ailleurs.example/organisations?language=de',
			'//ailleurs.example/organisations?language=de',
			'/\\ailleurs.example/organisations?language=de'
		]) {
			const detourne = new URL(lien);
			detourne.searchParams.set('callbackURL', ailleurs);
			const victime = new Navigateur('fr-CH');
			const reponse = await victime.get(detourne.href);
			expect(reponse.status, ailleurs).toBe(403);
			expect(reponse.headers.get('location'), ailleurs).toBeNull();
			expect(victime.envoie('better-auth.session_token'), ailleurs).toBe(false);
		}
		expect(await langueDuCompte(LIEN_DETOURNE)).toBe('fr');

		// Le jeton n'a pas servi : le lien tel qu'il est parti ouvre la session, sur le service.
		const arrivee = await new Navigateur('fr-CH').suivre(lien);
		expect(new URL(arrivee.headers.get('location') ?? '', origin).origin).toBe(origin);
		expect(await langueDuCompte(LIEN_DETOURNE)).toBe('de');
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

describe('ce que les caches doivent savoir', () => {
	it('says that a screen of the space changes with the browser and the cookie', async () => {
		const anonyme = new Navigateur('it-CH');
		for (const chemin of ['/connexion', '/conditions', '/nulle-part']) {
			const reponse = await anonyme.get(chemin);
			expect(variations(reponse), chemin).toEqual(
				expect.arrayContaining(['accept-language', 'cookie'])
			);
		}
		const connectee = new Navigateur();
		await connectee.seConnecter(DEJA_EN_FRANCAIS);
		const reponse = await connectee.get('/organisations');
		expect(reponse.status).toBe(200);
		expect(variations(reponse)).toEqual(expect.arrayContaining(['accept-language', 'cookie']));
	});

	it('does not say it for a public page, which reads no cookie and speaks the language of its address', async () => {
		for (const chemin of [`/m/${SLUG}`, `/m/${SLUG}/de`]) {
			const reponse = await new Navigateur('ar').get(chemin);
			expect(reponse.status, chemin).toBe(200);
			expect(variations(reponse), chemin).not.toContain('cookie');
			expect(variations(reponse), chemin).not.toContain('accept-language');
		}
	});
});

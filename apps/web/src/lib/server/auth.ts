// Connexion : Better Auth, liens magiques, passkeys, aucun mot de passe (ADR 0016, ADR 0025).
//
// Ce que Better Auth fait ici, et rien d'autre : les sessions, les liens magiques, les passkeys et
// la limitation de débit. Les organisations, les adhésions, les rôles et les invitations restent à
// nous, dans notre schéma et sous notre isolation — l'ADR 0016 dit pourquoi.
//
// Trois réglages sont indispensables et dangereux par défaut :
//   `magicLink.expiresIn` vaut 300 secondes par défaut, pas 900 ;
//   `magicLink.storeToken` vaut « plain » par défaut, donc le jeton part en clair dans la base ;
//   `rateLimit.enabled` ne s'active qu'en production si on ne le dit pas.

import { AsyncLocalStorage } from 'node:async_hooks';
import { schema } from '@jadwal/db/schema';
import { sql } from '@jadwal/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware } from 'better-auth/api';
import { magicLink } from 'better-auth/plugins/magic-link';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { passkey } from '@better-auth/passkey';
import { getRequestEvent } from '$app/server';
import { v7 as uuidv7 } from 'uuid';
import { authDatabase } from './database.js';
import { createMailer } from './mail/index.js';
import { magicLinkEmail } from './mail/messages.js';
import { consume, consumeDetailed, emailKey, MAGIC_LINK_BUDGET } from './rate-limit.js';

/** Quinze minutes, en secondes : l'unité de `expiresIn` est la seconde. */
const MAGIC_LINK_SECONDS = 900;
/** Trente jours, en secondes. */
const SESSION_SECONDS = 2_592_000;
/** Un jour : au-delà, l'usage d'une session repousse sa date de fin. */
const SESSION_REFRESH_SECONDS = 86_400;

/**
 * Le chemin que le plugin passkey emprunte pour authentifier. C'est **le seul** qui donne à une
 * session la preuve exigée par les pouvoirs de super-admin : l'enregistrement d'une passkey ne la
 * donne pas, sans quoi une boîte aux lettres compromise enregistrerait la sienne et se
 * l'attribuerait (ADR 0025).
 */
const PASSKEY_AUTHENTICATED = '/passkey/verify-authentication';

/**
 * Les mandataires inverses devant nous, en notation CIDR, séparés par des virgules.
 *
 * Vide en développement et dans les tests : rien n'est alors de confiance, ce qui est exact. En
 * production, c'est le réseau Docker d'où Caddy parle — et lui seul, puisque ni l'application ni sa
 * base ne sont joignables d'ailleurs.
 */
function mandatairesDeConfiance(env: NodeJS.ProcessEnv): string[] {
	return (env['JADWAL_TRUSTED_PROXIES'] ?? '')
		.split(',')
		.map((entree) => entree.trim())
		.filter((entree) => entree !== '');
}

function required(name: string, value: string | undefined): string {
	if (value === undefined || value === '') {
		throw new Error(`Missing environment variable ${name} (see .env.example)`);
	}
	return value;
}

/**
 * L'origine publique, sans chemin. Si elle en portait un, Better Auth abandonnerait `basePath` et
 * les liens produits pointeraient à côté, tout en refusant les requêtes pour origine invalide.
 */
function baseUrl(env: NodeJS.ProcessEnv): string {
	const origin = required('ORIGIN', env['ORIGIN']);
	const url = new URL(origin);
	if (url.pathname !== '/') {
		throw new Error(`ORIGIN must not carry a path, got ${JSON.stringify(url.pathname)}`);
	}
	return url.origin;
}

/**
 * Capture d'un lien magique au lieu de son envoi. Le super-admin s'en sert pour produire un lien de
 * secours quand le courriel ne part plus (ADR 0024). L'API serveur de Better Auth ne rend ni le
 * jeton ni l'URL : le seul endroit où le lien existe est le rappel d'envoi, et c'est donc là qu'on
 * le prend. Le stockage par contexte asynchrone évite une variable globale, qui mêlerait deux
 * requêtes simultanées.
 */
const capture = new AsyncLocalStorage<{ url?: string }>();

/** Joue `run` sans rien envoyer, et rend le lien qui aurait été envoyé. */
export async function captureMagicLink(run: () => Promise<unknown>): Promise<string | undefined> {
	const box: { url?: string } = {};
	await capture.run(box, run);
	return box.url;
}

export function createAuth(env: NodeJS.ProcessEnv = process.env) {
	const mailer = createMailer(env);
	const origin = baseUrl(env);
	return betterAuth({
		appName: 'jadwal',
		baseURL: origin,
		secret: required('BETTER_AUTH_SECRET', env['BETTER_AUTH_SECRET']),
		// Aucune télémétrie (règle du dépôt). Le défaut la désactive déjà ; on le dit quand même,
		// parce qu'une variable d'environnement suffirait sinon à la rallumer.
		telemetry: { enabled: false },
		database: drizzleAdapter(authDatabase(), { provider: 'pg', schema }),
		// Aucun mot de passe : le lien magique et la passkey sont les seuls chemins (ADR 0006).
		emailAndPassword: { enabled: false },
		session: {
			expiresIn: SESSION_SECONDS,
			updateAge: SESSION_REFRESH_SECONDS,
			// Le cache de session en cookie masquerait une révocation jusqu'à son expiration : une
			// session retirée doit cesser de valoir tout de suite. C'est aussi ce qui permet au
			// plafond de douze heures d'une session de super-admin de mordre à chaque requête.
			cookieCache: { enabled: false }
		},
		// **Une session ne garde ni adresse IP ni navigateur** (étape 13).
		//
		// Better Auth écrit les deux sans rien demander : `createSession` fait
		// `ipAddress: getIP(headers, options) || ''` et `userAgent: headers?.get('user-agent') || ''`.
		// Le durcissement de l'étape 9 les a même rendus exacts — en déclarant les mandataires de
		// confiance, on lui a appris à résoudre la vraie adresse du visiteur. Rien ne les effaçait
		// ensuite : une session dont le navigateur a été fermé n'est jamais représentée, donc jamais
		// nettoyée, et sa ligne restait avec son adresse.
		//
		// `docs/CONDITIONS.md` promet qu'une organisation ne laisse qu'une adresse électronique. Ce
		// n'était pas vrai, et c'est le code qui avait tort.
		//
		// Pourquoi ce crochet plutôt que `advanced.ipAddress.disableIpTracking` : cette option-là
		// coupe la résolution de l'adresse **partout**, y compris pour le limiteur de débit, qui
		// retomberait sur un seau partagé — tout le monde punirait tout le monde. Ici, l'adresse est
		// résolue, elle sert à limiter les abus le temps de la requête, et elle n'est pas rangée.
		//
		// Et pour le navigateur, il n'y a pas d'option du tout : `headers?.get('user-agent') || ''`
		// est inconditionnel dans Better Auth. Ce crochet est le seul levier documenté.
		databaseHooks: {
			session: {
				create: {
					before: async (session) => ({
						data: { ...session, ipAddress: '', userAgent: '' }
					})
				}
			}
		},
		advanced: {
			// Les identifiants sont des UUID v7 produits par l'application, comme partout ailleurs
			// dans le schéma (ADR 0014).
			database: { generateId: () => uuidv7() },
			useSecureCookies: origin.startsWith('https://'),
			ipAddress: {
				// Better Auth ne voit pas l'adresse résolue par l'adaptateur : il relit l'en-tête
				// lui-même. Il le fait correctement **à condition** qu'on lui dise qui est de
				// confiance : avec `trustedProxies`, il parcourt la liste depuis la droite, saute les
				// mandataires déclarés, et retient la première adresse qui n'en est pas un.
				//
				// Sans cette liste il n'est pas dupe pour autant — il refuse un en-tête qui porte
				// plusieurs valeurs et retombe sur un seau partagé —, mais tout le monde partage alors
				// la même limite, ce qui punit les visiteurs légitimes. D'où la liste (étape 9).
				ipAddressHeaders: [env['JADWAL_IP_HEADER'] ?? 'x-forwarded-for'],
				...(mandatairesDeConfiance(env).length > 0
					? { trustedProxies: mandatairesDeConfiance(env) }
					: {})
			}
		},
		// Ceinture et bretelles : tout jeton de vérification est stocké haché, quel que soit le
		// plugin qui l'a produit.
		verification: { storeIdentifier: 'hashed' },
		rateLimit: {
			// Sans cela, la limitation ne s'activerait qu'en production, et les tests ne prouveraient
			// rien.
			enabled: true,
			// Notre propre rangement, et non le sien. La raison tient en une ligne : la clé du
			// limiteur intégré est « adresse IP | chemin », et son rangement en base l'écrit telle
			// quelle. Une adresse IP est une donnée personnelle, l'ADR 0009 et `docs/CONDITIONS.md`
			// promettent qu'un visiteur n'en laisse aucune, et une table sans purge la garderait
			// pour toujours (ADR 0032).
			//
			// `customStorage` consomme un jeton en une seule instruction, comme le sien : deux
			// instances qui demandent en même temps ne peuvent pas dépasser la limite. Et les deux
			// volets — celui-ci et celui par adresse électronique — partagent dès lors la même
			// table, le même condensat et la même purge à un jour.
			customStorage: {
				consume: async (key, rule) =>
					consumeDetailed(authDatabase(), key, {
						windowSeconds: rule.window,
						max: rule.max
					})
			},
			window: 60,
			max: 100,
			customRules: {
				// Le volet par adresse électronique est ajouté à part : la clé du limiteur intégré
				// est l'adresse IP et le chemin, jamais le corps de la requête.
				'/sign-in/magic-link': { window: 60, max: 5 },
				'/magic-link/verify': { window: 60, max: 10 },
				// La connexion du super-admin est plus serrée que le reste : c'est la porte de la
				// clé maîtresse (ADR 0025). Une passkey n'a pas de secret à deviner, mais un essai
				// répété reste le premier signe d'une attaque, et rien n'oblige à le laisser gratuit.
				'/passkey/generate-authenticate-options': { window: 300, max: 10 },
				[PASSKEY_AUTHENTICATED]: { window: 300, max: 10 },
				'/passkey/generate-register-options': { window: 300, max: 5 },
				'/passkey/verify-registration': { window: 300, max: 5 }
			}
		},
		hooks: {
			after: createAuthMiddleware(async (ctx) => {
				if (ctx.path !== PASSKEY_AUTHENTICATED) return;
				const token = ctx.context.newSession?.session?.token;
				if (!token) return;
				// La preuve est portée par la session, pas par le compte : une autre session du
				// même compte, ouverte par lien magique, reste sans pouvoir.
				await authDatabase().execute(
					sql`update "session" set "passkey_verified_at" = now() where "token" = ${token}`
				);
			})
		},
		plugins: [
			magicLink({
				expiresIn: MAGIC_LINK_SECONDS,
				// Le défaut stocke le jeton en clair dans la table de vérification.
				storeToken: 'hashed',
				sendMagicLink: async ({ email, url }) => {
					const box = capture.getStore();
					if (box) {
						// Lien de secours : rien ne part, et le seau de l'adresse n'est pas entamé.
						// Le super-admin le lira à l'écran et le transmettra autrement.
						box.url = url;
						return;
					}
					// Le volet par adresse. Il est ici plutôt que dans un intercepteur en amont pour
					// une raison qui compte : la réponse rendue à l'appelant ne change pas d'un
					// cheveu quand la limite est atteinte. Seul l'envoi s'arrête. Une adresse
					// connue et une adresse inconnue restent indistinguables (ADR 0017).
					const allowed = await consume(
						authDatabase(),
						emailKey(email, '/sign-in/magic-link'),
						MAGIC_LINK_BUDGET
					);
					if (!allowed) return;
					await mailer.send(magicLinkEmail(email, url));
				}
			}),
			passkey({
				// L'identifiant de partie de confiance est le nom d'hôte, jamais l'origine entière :
				// une passkey enregistrée pour `exemple.test` vaut pour tous ses sous-domaines, et
				// une passkey enregistrée pour une origine avec port ne serait acceptée nulle part.
				rpID: new URL(origin).hostname,
				rpName: 'jadwal',
				origin,
				authenticatorSelection: {
					// La vérification de l'utilisateur est exigée, pas seulement préférée : sans
					// elle, un authentificateur volé et déverrouillé suffirait. C'est le point de
					// toute l'exigence de passkey (ADR 0025).
					userVerification: 'required',
					residentKey: 'preferred'
				}
			}),
			// Doit rester le dernier : sans lui, une form action crée bien la session mais ne pose
			// aucun cookie, et la connexion échoue en silence.
			sveltekitCookies(getRequestEvent)
		]
	});
}

let instance: ReturnType<typeof createAuth> | undefined;

/** L'instance du processus. Construite à la première demande, pas à l'import. */
export function auth() {
	instance ??= createAuth();
	return instance;
}

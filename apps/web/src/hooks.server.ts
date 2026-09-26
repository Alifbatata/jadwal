// Ce qui s'applique à toutes les requêtes : la session, la langue de l'espace, la garde des passkeys,
// le registre interne du super-admin, et les en-têtes de sécurité.
//
// Deux choses à ne pas faire ici, toutes deux mesurées : lire le corps de la réponse, qui détruit le
// rendu différé et ferait attendre la page entière ; et remplacer la réponse par une nouvelle, qui
// perdrait son code — un 404 redeviendrait un 200 — ainsi que le type de contenu et l'empreinte de
// cache. On mute donc les en-têtes de la réponse rendue, sans jamais la consommer.

import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { error, type Handle, type RequestEvent } from '@sveltejs/kit';
import { documentDansSaLangue, type Langue } from '$lib/i18n.js';
import {
	LANGUAGE_COOKIE,
	LANGUAGE_PARAMETER,
	languageCookieOptions,
	languageForTheAccount,
	PENDING_CHOICE_COOKIE,
	spaceLanguage
} from '$lib/i18n/language.js';
import { writeAccountLanguage } from '$lib/server/account-language.js';
import { auth } from '$lib/server/auth.js';
import { passkeyCount, recordAdminAccess, signedIn } from '$lib/server/context.js';
import { strictTransportSecurity } from '$lib/server/hsts.js';
import { withMailLanguage } from '$lib/server/mail/language.js';
import { compter } from '$lib/server/vues.js';

/**
 * Les routes que l'on accepte de voir intégrées dans un cadre d'un autre site : les pages publiques
 * d'une organisation, et elles seules (ADR 0027).
 *
 * Ce que cela ouvre : n'importe quel site peut afficher la page d'une organisation dans une iframe,
 * ce qui est précisément l'usage voulu — une organisation colle son programme sur son propre site
 * sans attendre que nous inscrivions son domaine quelque part.
 *
 * Ce que cela n'ouvre pas : la page n'a ni cookie, ni session, ni formulaire, ni action. Il n'y a
 * donc rien à détourner par un clic mal placé, et rien qu'un cadre puisse faire qu'un visiteur ne
 * puisse déjà faire en tapant l'adresse. Le reste du service, lui, reste en `frame-ancestors 'none'`.
 */
const EMBEDDABLE = /^\/m\/[^/]+/;

/**
 * Le côté public : pages d'une organisation, API en lecture seule, flux agenda, et les fichiers du
 * widget.
 *
 * Aucune de ces routes ne lit la session, et c'est structurel plutôt que promis : le cookie n'est
 * même pas regardé, donc il n'y a rien à oublier de ne pas lire. Cela évite aussi de construire
 * l'instance de connexion et d'ouvrir une transaction pour une page qui n'en a aucun besoin
 * (ADR 0009, ADR 0027). Le widget compte autant que le reste : il est chargé une fois par visiteur
 * de chaque site d'organisation, et une lecture de session par chargement serait une lecture de
 * trop.
 */
const PUBLIC = /^\/(m\/|api\/v1\/|widget\/)/;

/**
 * Les réponses qu'un autre site a le droit d'incorporer. `Cross-Origin-Resource-Policy` n'est
 * vérifié que pour les requêtes sans CORS — c'est-à-dire précisément le code court, sans
 * `crossorigin`, que colle une organisation. Sans cet en-tête, un site qui impose
 * `Cross-Origin-Embedder-Policy: require-corp` le bloquerait (ADR 0005).
 */
const CROSS_ORIGIN = /^\/(m\/[^/]+|widget\/)/;

/**
 * Enregistrer une passkey, et en supprimer une. Ce sont les deux gestes qui décident de qui pourra
 * devenir la clé maîtresse du service : ils sont donc gardés ici, avant que Better Auth ne les
 * voie, et non par une confiance placée dans le client (ADR 0025).
 */
const PASSKEY_REGISTER = ['/passkey/generate-register-options', '/passkey/verify-registration'];
const PASSKEY_DELETE = '/passkey/delete-passkey';

function embedOrigins(): string {
	const configured = process.env['JADWAL_EMBED_ORIGINS'] ?? '';
	return configured
		.split(',')
		.map((origin) => origin.trim())
		.filter((origin) => origin.length > 0)
		.join(' ');
}

/**
 * La règle d'amorçage. Une session ordinaire — donc ouverte par lien magique — n'enregistre une
 * passkey que tant que le compte n'en a aucune. Dès qu'il en a une, il faut une session déjà
 * prouvée par passkey. Sans cela, une boîte aux lettres compromise enregistrerait la sienne et la
 * protection entière ne servirait à rien.
 *
 * Quand toutes les passkeys d'un compte sont perdues, c'est le propriétaire qui les efface côté
 * base, ce qui rouvre l'amorçage : jamais une question secrète, jamais un code par courriel.
 */
async function guardPasskeyRoutes(event: Parameters<Handle>[0]['event']): Promise<void> {
	const path = event.url.pathname;
	const registering = PASSKEY_REGISTER.some((route) => path.endsWith(route));
	const deleting = path.endsWith(PASSKEY_DELETE);
	if (!registering && !deleting) return;

	const person = event.locals.person;
	if (!person) error(401, 'Il faut être connecté.');
	// Les passkeys ne servent aujourd'hui qu'aux pouvoirs de super-admin. Les ouvrir à tous serait
	// une fonctionnalité de plus à tenir, sans besoin établi (règle du dépôt).
	if (!person.isSuperAdmin) error(403, 'Réservé aux comptes super-admin.');
	if (deleting && !person.hasSuperAdminPowers) {
		error(403, 'Il faut une session ouverte par passkey pour en supprimer une.');
	}
	if (registering && !person.hasSuperAdminPowers && (await passkeyCount(person.userId)) > 0) {
		error(403, 'Il faut une session ouverte par passkey pour en enregistrer une autre.');
	}
}

/**
 * La langue d'un écran de l'espace (étape 18, retour D2) : celle que l'adresse demande pour cette
 * page ; sinon celle du compte de la personne connectée ; sinon celle retenue sur ce navigateur par
 * le choix de la langue ; sinon la meilleure que le navigateur demande ; sinon le français.
 *
 * À sa première requête connectée, le compte reçoit la langue que la personne voyait
 * (`languageForTheAccount`) : le choix qu'elle a fait avant de se connecter, même si le compte avait
 * déjà une langue ; sinon, pour un compte qui n'en a aucune, celle du navigateur. Ses courriels et
 * ses prochaines visites, depuis n'importe quel appareil, la gardent. Ensuite, le compte fait foi.
 *
 * La règle du choix d'avant la connexion : il part avec le lien de connexion, quel que soit le temps
 * passé avant de le demander, et la vérification du lien l'écrit sur le compte (`auth.ts`), sur
 * quelque navigateur que le lien s'ouvre. Son cookie d'attente est retiré dès que le choix est parti :
 * à la demande du lien (`connexion/+page.server.ts`), ou ici, à la connexion, une fois le choix écrit
 * sur le compte. Un navigateur ne donne donc un choix qu'une fois, et ce choix ne revient jamais plus
 * tard défaire une langue changée entre-temps sur un autre appareil. Le lien, lui, ne vit que quinze
 * minutes. Ici, le choix se reconnaît à son cookie d'attente, sur le navigateur où il a été fait,
 * quand aucun lien ne l'a emporté : une connexion par passkey, qui n'a pas de lien, et un choix refait
 * après la demande du lien.
 *
 * Une écriture qui échoue ne fait pas échouer la page, et le cookie d'attente reste : la langue n'est
 * qu'une préférence, et elle sera retentée à la requête suivante. SvelteKit n'ajoute les cookies
 * qu'aux réponses qu'il rend : une réponse de Better Auth (`/api/auth/`) ne porte donc pas le
 * retrait, et c'est l'écran suivant qui le fait. Après un lien de connexion, cet écran est celui vers
 * lequel le lien renvoie.
 */
async function languageOfTheSpace(event: RequestEvent): Promise<Langue> {
	const person = event.locals.person;
	const cookie = event.cookies.get(LANGUAGE_COOKIE);
	const browser = event.request.headers.get('accept-language');
	if (person) {
		const pending = event.cookies.get(PENDING_CHOICE_COOKIE) !== undefined;
		const toWrite = languageForTheAccount({ account: person.language, cookie, pending, browser });
		let given = toWrite === null;
		if (toWrite !== null) {
			try {
				given = await writeAccountLanguage(person.userId, toWrite);
				if (given) person.language = toWrite;
			} catch (erreur) {
				console.error('langue du compte :', erreur);
			}
		}
		if (pending && given) {
			event.cookies.delete(PENDING_CHOICE_COOKIE, languageCookieOptions(event.url));
		}
	}
	return spaceLanguage({
		asked: event.url.searchParams.get(LANGUAGE_PARAMETER),
		account: person?.language ?? null,
		cookie,
		browser
	});
}

export const handle: Handle = async ({ event, resolve }) => {
	// La session est relue à chaque requête : le cache de session en cookie est désactivé, pour
	// qu'une session révoquée cesse de valoir tout de suite (ADR 0016), et pour que le plafond de
	// douze heures d'une session de super-admin morde sans délai (ADR 0025).
	const cotePublic = PUBLIC.test(event.url.pathname);
	event.locals.person = cotePublic ? null : await signedIn(event.request.headers);
	// La langue de l'espace, posée avant le rendu : la coquille la donne à chaque écran, le hook
	// l'écrit sur `<html>`, et les courriels de la requête la prennent. Le côté public ne passe pas par
	// ici : sa langue est celle de son adresse, posée par sa route, et il ne lit aucun cookie.
	if (!cotePublic) event.locals.langue = await languageOfTheSpace(event);
	if (!cotePublic) await guardPasskeyRoutes(event);

	// La langue du document, écrite sur `<html>` une fois la page rendue : le hook l'a posée juste
	// au-dessus pour l'espace, la route publique la pose sur `event.locals.langue` pendant son
	// chargement, qui précède le rendu. `locals` est lu au moment du morceau, pas avant : lu ici, il
	// serait encore vide pour une page publique. Better Auth appelle `resolve`
	// sans options ; on lui passe donc un `resolve` qui porte déjà la transformation, au lieu de
	// contourner son chemin.
	const dansSaLangue: typeof resolve = (evenement, options) =>
		resolve(evenement, {
			...options,
			transformPageChunk: async (morceau) => {
				const html = (await options?.transformPageChunk?.(morceau)) ?? morceau.html;
				return documentDansSaLangue(html, evenement.locals.langue);
			}
		});
	const traiter = () =>
		svelteKitHandler({
			event,
			resolve: dansSaLangue,
			auth: auth(),
			building
		});
	// Les courriels écrits pendant la requête prennent la langue de l'écran : le lien de connexion,
	// que Better Auth écrit dans son rappel sans voir la requête, et l'invitation (retour D3).
	const langueDeLEspace = event.locals.langue;
	const response = langueDeLEspace
		? await withMailLanguage(langueDeLEspace, traiter)
		: await traiter();

	// Le registre interne : une entrée par requête d'un super-admin en exercice, jamais une par
	// ligne lue. Il ne va pas dans le journal de l'organisation, qui ne voit pas les consultations.
	const person = event.locals.person;
	if (person?.hasSuperAdminPowers && !event.isSubRequest) {
		await recordAdminAccess(
			person,
			event.request.method === 'GET' ? 'read' : 'write',
			event.url.pathname,
			event.locals.visited
		);
	}

	// Le compteur de vues, s'il y a quelque chose à compter (ADR 0032). Un seul point d'écriture,
	// après la réponse, et l'écriture est **attendue** : une promesse laissée courir survivrait à la
	// requête et perdrait ce qu'elle porte à l'arrêt du serveur. Elle coûte un aller-retour à une
	// page qui n'en faisait que des lectures ; c'est le prix d'une promesse tenue à la lettre.
	if (event.locals.vue) await compter(event.locals.vue, new Date());

	const embeddable = EMBEDDABLE.test(event.url.pathname);
	const origins = embedOrigins();
	// Une page publique s'affiche dans le cadre de n'importe quel site. `JADWAL_EMBED_ORIGINS`
	// permet de restreindre cette ouverture à une liste, pour une instance qui le voudrait ; sans
	// elle, l'ouverture est totale, et c'est le réglage par défaut du service hébergé.
	const frameAncestors = embeddable
		? origins.length > 0
			? `frame-ancestors 'self' ${origins}`
			: 'frame-ancestors *'
		: "frame-ancestors 'none'";

	// On ajoute à la politique existante au lieu de la remplacer : SvelteKit y a posé le nonce de
	// son script de démarrage, et l'écraser bloquerait l'hydratation de toutes les pages.
	const existing = response.headers.get('content-security-policy');
	response.headers.set(
		'content-security-policy',
		existing ? `${existing}; ${frameAncestors}` : frameAncestors
	);

	// `X-Frame-Options` ne sert jamais à autoriser : dès qu'une politique porte `frame-ancestors`,
	// il est ignoré. On ne le pose donc que pour interdire, en doublon des navigateurs anciens.
	if (embeddable) response.headers.delete('x-frame-options');
	else response.headers.set('x-frame-options', 'DENY');

	// Un écran de l'espace change de langue selon le navigateur et le cookie du choix : un cache qui
	// l'ignorerait servirait l'allemand à qui a demandé l'arabe.
	if (!cotePublic) response.headers.append('vary', 'Accept-Language, Cookie');

	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('cross-origin-opener-policy', 'same-origin');
	if (CROSS_ORIGIN.test(event.url.pathname)) {
		response.headers.set('cross-origin-resource-policy', 'cross-origin');
	}
	response.headers.set(
		'permissions-policy',
		'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
	);
	// Une route peut en vouloir une plus stricte : on ne remplace pas ce qu'elle a posé.
	if (!response.headers.has('referrer-policy')) {
		response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	}
	// Seulement en HTTPS réel. Derrière un mandataire, cela suppose `ORIGIN` en https, sans quoi
	// l'en-tête ne partirait jamais.
	const transportStrict = strictTransportSecurity(event.url);
	if (transportStrict) response.headers.set('strict-transport-security', transportStrict);

	return response;
};

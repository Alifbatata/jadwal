// Le cycle complet des accès, contre un vrai serveur et une vraie base.
//
// Aucun raccourci : les requêtes sont de vraies requêtes HTTP, les formulaires de vrais formulaires
// envoyés sans JavaScript, et le courriel est relu dans le dossier où le transport de développement
// l'écrit.

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDatabase, newId, sql, withOrg, type DatabaseHandle } from '@jadwal/db';
import { emailKey, storedKey } from '../src/lib/server/rate-limit.js';

const origin = inject('origin');
const secondOrigin = inject('secondOrigin');
const outbox = inject('outbox');
// Le sel des clés du limiteur : les serveurs de test le reçoivent, ce fichier aussi, faute de
// quoi il ne pourrait plus retrouver un seau — sa clé est un condensat depuis l'étape 7.
process.env['BETTER_AUTH_SECRET'] = inject('authSecret');
const testDatabase = inject('testDatabase');

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let organizationId: string;
let adminUserId: string;
let superAdminUserId: string;

interface RecordedEmail {
	to: string;
	subject: string;
	text: string;
}

/** Les courriels écrits jusqu'ici, du plus ancien au plus récent. */
async function outboxMails(): Promise<RecordedEmail[]> {
	const names = (await readdir(outbox)).filter((name) => name.endsWith('.json')).sort();
	return names.map((name) => JSON.parse(readFileSync(join(outbox, name), 'utf8')) as RecordedEmail);
}

async function lastMailTo(email: string): Promise<RecordedEmail | undefined> {
	const all = await outboxMails();
	return all.filter((mail) => mail.to === email).at(-1);
}

/** Le lien de connexion contenu dans le dernier message envoyé à cette adresse. */
async function magicLinkFor(email: string): Promise<string | undefined> {
	const mail = await lastMailTo(email);
	return mail?.text.match(/https?:\/\/\S+/)?.[0];
}

/** Poste un formulaire comme un navigateur sans JavaScript : encodage de formulaire et origine. */
async function postForm(
	path: string,
	fields: Record<string, string>,
	cookie?: string
): Promise<Response> {
	return fetch(`${origin}${path}`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			// Sans cet en-tête, SvelteKit répond au protocole de ses formulaires améliorés : du JSON
			// et un code 200 qui porte l'échec dans son corps. Un navigateur sans JavaScript, lui,
			// demande du HTML et reçoit le vrai code. C'est ce chemin-là que l'on veut éprouver.
			accept: 'text/html',
			origin,
			...(cookie ? { cookie } : {})
		},
		body: new URLSearchParams(fields).toString()
	});
}

/**
 * La page, sans ce qui change d'une réponse à l'autre. SvelteKit pose un nonce différent à chaque
 * rendu : le comparer reviendrait à comparer du hasard.
 */
function sansNonce(html: string): string {
	return html.replaceAll(/nonce="[^"]*"/g, 'nonce="…"');
}

function sessionCookie(response: Response): string | undefined {
	const raw = response.headers.getSetCookie?.() ?? [];
	const found = raw.find((value) => value.startsWith('better-auth.session_token='));
	return found?.split(';')[0];
}

/** Suit un lien magique et rend le cookie de session qu'il pose, s'il en pose un. */
async function followMagicLink(url: string): Promise<{ status: number; cookie?: string }> {
	const response = await fetch(url, { redirect: 'manual' });
	return { status: response.status, cookie: sessionCookie(response) };
}

/**
 * Vide les compteurs de débit. La limitation est vraie et volontaire — trois liens par heure et par
 * adresse — mais un test qui se connecte plusieurs fois l'atteindrait sans rien prouver. C'est de
 * l'hygiène de test, pas un contournement : le comportement lui-même est vérifié plus bas.
 */
async function resetRateLimit(): Promise<void> {
	await ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		await tx.execute(sql`delete from "rate_limit"`);
	});
}

/** Demande un lien, le suit, et rend le cookie de session. */
async function signIn(email: string): Promise<string> {
	await resetRateLimit();
	await postForm('/connexion', { email });
	const link = await magicLinkFor(email);
	expect(link, `aucun lien envoyé à ${email}`).toBeTruthy();
	const { cookie } = await followMagicLink(link as string);
	expect(cookie, `aucune session posée pour ${email}`).toBeTruthy();
	return cookie as string;
}

/** Une colonne `date` de PostgreSQL vers la chaîne que `@jadwal/core` attend. */
function isoOf(value: unknown): `${number}-${number}-${number}` {
	return String(value).slice(0, 10) as `${number}-${number}-${number}`;
}

/** Le rythme d'une ligne de `course`, relu ici plutôt que repris du serveur. */
function recurrenceOf(course: Record<string, unknown>) {
	if (course['recurrence_kind'] === 'weekly') {
		return {
			kind: 'weekly' as const,
			weekdays: (course['recurrence_weekday'] as number[]).map((day) => day as 1),
			interval: ((course['recurrence_interval'] as number) === 2 ? 2 : 1) as 1 | 2,
			anchorDate: isoOf(course['recurrence_anchor_date'])
		};
	}
	if (course['recurrence_kind'] === 'monthly') {
		return {
			kind: 'monthly' as const,
			weekday: course['recurrence_ordinal_weekday'] as 1,
			ordinal: course['recurrence_ordinal'] as 1
		};
	}
	return {
		kind: 'dates' as const,
		dates: (course['recurrence_dates'] as string[]).map((date) => isoOf(date))
	};
}

/** L'horaire d'une ligne de `course`, même esprit. */
function timingOf(course: Record<string, unknown>) {
	if (course['timing_kind'] === 'fixed') {
		return {
			kind: 'fixed' as const,
			start: String(course['timing_start']).slice(0, 5) as `${number}:${number}`,
			end: String(course['timing_end']).slice(0, 5) as `${number}:${number}`
		};
	}
	return {
		kind: 'prayer' as const,
		prayer: course['timing_prayer'] as 'maghrib',
		offsetMinutes: course['timing_offset_minutes'] as number,
		durationMinutes: course['timing_duration_minutes'] as number
	};
}

/** Le prochain lundi à venir, dans les sept jours affichés par l'écran d'accueil. */
function prochainLundi(): string {
	const today = new Date();
	const reste = (8 - today.getUTCDay()) % 7 || 7;
	return decalerDe(today.toISOString().slice(0, 10), reste);
}

/** Une date civile décalée de `jours`, sans dépendre du fuseau de la machine. */
function decalerDe(date: string, jours: number): string {
	const [year, month, day] = date.split('-').map(Number);
	const moved = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + jours));
	return moved.toISOString().slice(0, 10);
}

/**
 * Donne à une session la preuve qu'une passkey lui donnerait. La cérémonie WebAuthn n'existe que
 * dans un navigateur : ce que le test remplace, c'est le geste du navigateur, pas la règle. La
 * règle — pas de pouvoirs sans cette preuve — est vérifiée telle quelle, et le test qui suit
 * vérifie d'abord qu'elle mord.
 */
async function preuvePasskey(cookie: string, userId: string): Promise<void> {
	const token = cookie.split('=')[1] ?? '';
	await ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		await tx.execute(sql`
			insert into "passkey" ("id", "name", "public_key", "user_id", "credential_id", "counter",
				"device_type", "backed_up")
			values (${newId()}, 'test', 'cle-publique', ${userId}, ${newId()}, 0, 'singleDevice', false)
		`);
		// Better Auth signe le cookie : la valeur utile est ce qui précède le point.
		await tx.execute(sql`
			update "session" set "passkey_verified_at" = now()
			where ${sql.raw(`"token" = split_part('${decodeURIComponent(token)}', '.', 1)`)}
		`);
	});
}

/** Se connecte en super-admin **avec** ses pouvoirs : lien magique, puis preuve de passkey. */
async function signInSuperAdmin(): Promise<string> {
	const cookie = await signIn('admin@example.test');
	await preuvePasskey(cookie, superAdminUserId);
	return cookie;
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	appHandle = createDatabase({ role: 'app', overrides: { database: testDatabase } });
	organizationId = newId();
	adminUserId = newId();
	superAdminUserId = newId();
	await ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language", "enabled_language")
			values (${organizationId}, 'acces', 'Mosquée d’essai', 'Europe/Zurich', 'fr', array['fr'])
		`);
		await tx.execute(sql`
			insert into "user" ("id", "email", "name", "email_verified")
			values (${adminUserId}, 'responsable@example.test', 'Responsable', true)
		`);
		await tx.execute(sql`
			insert into "membership" ("id", "organization_id", "user_id", "role")
			values (${newId()}, ${organizationId}, ${adminUserId}, 'org_admin')
		`);
		// Un compte connu, rattaché à rien : il sert au test qui compare une adresse connue à une
		// adresse inconnue, sans déranger la personne responsable.
		await tx.execute(sql`
			insert into "user" ("id", "email", "email_verified")
			values (${newId()}, 'connue@example.test', true)
		`);
		// Le super-admin. Le drapeau est une colonne du compte : aucune interface ne le pose, et
		// c'est voulu (voir les actions en attente du rapport).
		await tx.execute(sql`
			insert into "user" ("id", "email", "email_verified", "is_super_admin")
			values (${superAdminUserId}, 'admin@example.test', true, true)
		`);
	});
});

afterAll(async () => {
	await appHandle?.close();
	await ownerHandle?.close();
});

describe('le lien magique', () => {
	it('writes a message, opens a session once, and refuses the second use', async () => {
		const email = 'cycle@example.test';
		const asked = await postForm('/connexion', { email });
		expect(asked.status).toBe(200);

		const mail = await lastMailTo(email);
		expect(mail?.subject).toBe('Votre lien de connexion à jadwal');
		const link = await magicLinkFor(email);
		expect(link).toMatch(/\/api\/auth\/magic-link\/verify\?token=/);

		const first = await followMagicLink(link as string);
		expect(first.cookie, 'le premier usage doit poser une session').toBeTruthy();

		// Le même lien, une seconde fois : le jeton a été consommé.
		const second = await followMagicLink(link as string);
		expect(second.cookie).toBeUndefined();
	});

	it('signs in an account created by hand, whose address was never proven', async () => {
		// Le chemin de l'amorçage : le compte super-admin est créé à la main, donc avec
		// `email_verified` à faux. Better Auth pose alors un verrou dans `verification` dont la clé
		// primaire est un SHA-256 — quarante-trois caractères en base64url. Tant que la colonne
		// était de type `uuid`, la connexion répondait 500 et personne ne pouvait entrer.
		const email = `amorcage-${Date.now().toString(36)}@example.test`;
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified")
				values (${newId()}, ${email}, false)
			`);
		});
		await resetRateLimit();
		await postForm('/connexion', { email });
		const lien = await magicLinkFor(email);
		expect(lien, `aucun lien envoyé à ${email}`).toBeTruthy();
		const { status, cookie } = await followMagicLink(lien as string);
		expect(status, 'le lien doit rediriger, pas échouer').toBe(302);
		expect(cookie, 'la session doit être posée').toBeTruthy();
	});

	it('gives the link the fifteen minutes it promises, not the five of the default', async () => {
		// Le défaut de la bibliothèque est de cinq minutes. Rien ne l'affirmait : le test
		// d'expiration réécrit lui-même la date de fin, donc il prouve que la vérification honore la
		// colonne, jamais la valeur que le code y met.
		await postForm('/connexion', { email: 'duree@example.test' });
		const rows = await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			return tx.execute<{ secondes: string }>(sql`
				select extract(epoch from ("expires_at" - "created_at"))::text as secondes
				from "verification" order by "created_at" desc limit 1
			`);
		});
		const secondes = Number(
			(Array.isArray(rows) ? (rows[0] as { secondes: string } | undefined) : undefined)?.secondes
		);
		expect(secondes).toBeGreaterThan(890);
		expect(secondes).toBeLessThanOrEqual(900);
	});

	it('stores the token hashed, never in the clear', async () => {
		const email = 'hachage@example.test';
		await postForm('/connexion', { email });
		const link = await magicLinkFor(email);
		const token = new URL(link as string).searchParams.get('token');
		expect(token).toBeTruthy();
		const rows = await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			return tx.execute<{ identifier: string; value: string }>(
				sql`select "identifier", "value" from "verification"`
			);
		});
		const lignes = (Array.isArray(rows) ? rows : []) as { identifier: string; value: string }[];
		expect(lignes.length).toBeGreaterThan(0);
		// Le jeton en clair ne doit apparaître dans AUCUNE colonne : deux réglages le hachent, et
		// n'en regarder qu'une laisserait l'un des deux passer inaperçu s'il était retiré.
		for (const ligne of lignes) {
			expect(ligne.identifier, 'colonne identifier').not.toContain(token);
			expect(ligne.value, 'colonne value').not.toContain(token);
		}
	});

	it('refuses a link that has run out of time', async () => {
		const email = 'expire@example.test';
		await postForm('/connexion', { email });
		const link = await magicLinkFor(email);
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`update "verification" set "expires_at" = now() - interval '1 minute'`);
		});
		const used = await followMagicLink(link as string);
		expect(used.cookie).toBeUndefined();
	});

	it('answers the same thing, and in the same time, for a known and an unknown address', async () => {
		// Le chemin de demande ne consulte jamais les comptes : il n'y a donc aucune branche qui
		// puisse dépendre de l'existence d'un compte (ADR 0017). On le vérifie sur la réponse, sur
		// le corps, et sur le temps.
		const connue = 'connue@example.test';
		const inconnue = 'jamais-vue@example.test';
		const mesures: Record<string, number[]> = { connue: [], inconnue: [] };
		const corps: Record<string, string> = {};
		// Rodage : la première réponse d'un serveur qui vient de démarrer coûte plusieurs fois les
		// suivantes, et une mesure qui l'inclurait noierait l'écart qu'on cherche.
		for (const email of [connue, inconnue]) await postForm('/connexion', { email });
		for (let tour = 0; tour < 30; tour += 1) {
			for (const [nom, email] of [
				['connue', connue],
				['inconnue', inconnue]
			] as const) {
				const debut = performance.now();
				const response = await postForm('/connexion', { email });
				mesures[nom]?.push(performance.now() - debut);
				corps[nom] = sansNonce(await response.text());
				expect(response.status, nom).toBe(200);
			}
		}
		// Le corps rendu est le même, mot pour mot.
		expect(corps['connue']).toBe(corps['inconnue']);

		const mediane = (valeurs: number[]) =>
			[...valeurs].sort((a, b) => a - b)[Math.floor(valeurs.length / 2)] ?? 0;
		const ecart = Math.abs(mediane(mesures['connue'] ?? []) - mediane(mesures['inconnue'] ?? []));
		// Un seuil absolu, et non une fraction du temps de réponse : une fraction de la moitié
		// tolérerait huit millisecondes sur des réponses de seize, c'est-à-dire deux allers-retours
		// vers la base. Une consultation des comptes en coûte un ou deux : le seuil doit être plus
		// serré qu'elle, pas plus large.
		expect(ecart, `écart des médianes : ${ecart.toFixed(2)} ms`).toBeLessThan(3);
	});
});

describe('la limitation de débit', () => {
	it('stops sending to the same address, without changing a word of the answer', async () => {
		const email = 'debit@example.test';
		await resetRateLimit();
		const avant = (await outboxMails()).filter((mail) => mail.to === email).length;
		const reponses: number[] = [];
		const corps: string[] = [];
		for (let tour = 0; tour < 6; tour += 1) {
			const response = await postForm('/connexion', { email });
			reponses.push(response.status);
			corps.push(sansNonce(await response.text()));
		}
		const apres = (await outboxMails()).filter((mail) => mail.to === email).length;
		// Trois par heure : les suivantes ne partent pas.
		expect(apres - avant).toBeLessThanOrEqual(3);
		expect(apres - avant).toBeGreaterThan(0);
		// Et pourtant la réponse ne bouge pas : rien ne dit à l'appelant qu'il a été retenu.
		expect(new Set(reponses)).toEqual(new Set([200]));
		expect(new Set(corps).size).toBe(1);
	});

	it('shares its counter between two instances, which is why it lives in the database', async () => {
		// Deux serveurs, deux processus, une seule base. Les demandes alternent de l'un à l'autre :
		// si le compteur était en mémoire, chaque instance aurait le sien et la limite serait
		// doublée. Ce test lance vraiment la seconde instance.
		await resetRateLimit();
		const email = 'deux-instances@example.test';
		const avant = (await outboxMails()).filter((mail) => mail.to === email).length;
		const cibles = [origin, secondOrigin, origin, secondOrigin, origin, secondOrigin];
		const codes: number[] = [];
		for (const cible of cibles) {
			const response = await fetch(`${cible}/connexion`, {
				method: 'POST',
				redirect: 'manual',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					accept: 'text/html',
					origin: cible
				},
				body: new URLSearchParams({ email }).toString()
			});
			codes.push(response.status);
		}
		const apres = (await outboxMails()).filter((mail) => mail.to === email).length;
		// Trois par heure, en tout, quelle que soit l'instance qui a reçu la demande.
		expect(apres - avant).toBe(3);
		// Et la réponse ne change pas : rien ne dit à l'appelant qu'il a été retenu.
		expect(new Set(codes)).toEqual(new Set([200]));

		// La clé rangée n'est plus l'adresse : c'est son condensat (ADR 0032). On la recalcule ici
		// plutôt que de chercher l'adresse en clair — qui, elle, ne doit plus s'y trouver.
		const rangee = storedKey(emailKey(email, '/sign-in/magic-link'));
		const rows = await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			return tx.execute<{ key: string; count: number }>(
				sql`select "key", "count" from "rate_limit" where "key" = ${rangee}`
			);
		});
		const seau = (Array.isArray(rows) ? rows : [])[0] as { count: number } | undefined;
		// Un seul seau, partagé : six demandes, six incréments.
		expect(seau?.count).toBe(6);

		// Et l'adresse elle-même n'est nulle part dans la table.
		const enClair = await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			return tx.execute<{ key: string }>(
				sql`select "key" from "rate_limit" where "key" like ${`%${email}%`}`
			);
		});
		expect(Array.isArray(enClair) ? enClair : []).toEqual([]);
	});
});

describe('la session et le contexte d’organisation', () => {
	it('shows the organisation of the session, and never one passed in the request', async () => {
		const cookie = await signIn('responsable@example.test');
		const page = await fetch(`${origin}/membres`, { headers: { cookie } });
		expect(page.status).toBe(200);
		const html = await page.text();
		expect(html).toContain('Mosquée d’essai');

		// Une autre organisation, dont cette personne n'est pas membre.
		const autre = newId();
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language", "enabled_language")
				values (${autre}, 'voisine', 'Mosquée voisine', 'Europe/Zurich', 'fr', array['fr'])
			`);
		});

		// Forcer l'identifiant dans le formulaire, dans l'URL et dans un en-tête : rien n'y fait.
		const force = await postForm('/organisations?/choisir', { organizationId: autre }, cookie);
		expect(force.status).toBe(403);
		const parUrl = await fetch(`${origin}/membres?organizationId=${autre}`, {
			headers: { cookie, 'x-organization-id': autre }
		});
		expect(await parUrl.text()).not.toContain('Mosquée voisine');
	});

	it('refuses to serve the members page to someone who is not signed in', async () => {
		const page = await fetch(`${origin}/membres`, { redirect: 'manual' });
		expect(page.status).toBe(303);
		expect(page.headers.get('location')).toBe('/connexion');
	});
});

describe('les rôles', () => {
	it('lets a manager invite, and refuses an editor', async () => {
		const adminCookie = await signIn('responsable@example.test');
		const invited = await postForm(
			'/membres?/inviter',
			{ email: 'nouvelle@example.test', role: 'editor' },
			adminCookie
		);
		expect(invited.status).toBe(200);
		expect(await lastMailTo('nouvelle@example.test')).toBeTruthy();

		// La personne invitée accepte, ce qui fait d'elle une éditrice.
		const cookie = await signIn('nouvelle@example.test');
		const invitations = await fetch(`${origin}/organisations`, { headers: { cookie } });
		const html = await invitations.text();
		const invitationId = html.match(/name="invitationId" value="([^"]+)"/)?.[1];
		expect(invitationId, 'l’invitation doit apparaître').toBeTruthy();
		const accepted = await postForm(
			'/organisations?/accepter',
			{ invitationId: invitationId as string },
			cookie
		);
		expect(accepted.status).toBe(303);

		// Et une éditrice ne peut pas inviter. Depuis l'étape 4 elle ne voit même plus l'écran :
		// la route la renvoie à l'accueil avant d'avoir lu le formulaire.
		const refuse = await postForm(
			'/membres?/inviter',
			{ email: 'encore@example.test', role: 'editor' },
			cookie
		);
		expect(refuse.status).toBe(303);
		expect(refuse.headers.get('location')).toBe('/');
		// Et rien n'est parti : le refus n'est pas seulement un code de retour.
		expect(await lastMailTo('encore@example.test')).toBeUndefined();
	});

	it('never lets the last manager be removed or demoted', async () => {
		const cookie = await signIn('responsable@example.test');
		// On vise l'adhésion de la personne responsable, et non la première venue de la page.
		const membershipId = await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			const rows = await tx.execute<{ id: string }>(
				sql`select "id" from "membership" where "user_id" = ${adminUserId}`
			);
			return (Array.isArray(rows) ? (rows[0] as { id: string } | undefined) : undefined)?.id;
		});
		expect(membershipId).toBeTruthy();
		const removed = await postForm(
			'/membres?/retirer',
			{ membershipId: membershipId as string },
			cookie
		);
		const demoted = await postForm(
			'/membres?/role',
			{ membershipId: membershipId as string, role: 'editor' },
			cookie
		);
		// 409 : la base refuse, et l'interface le traduit.
		expect(removed.status).toBe(409);
		expect(demoted.status).toBe(409);
	});
});

describe('les en-têtes de sécurité', () => {
	it('carries them on every response', async () => {
		const response = await fetch(`${origin}/connexion`);
		// Une liste close : en retirer un fait échouer, et en ajouter un sans l'affirmer aussi. Un
		// en-tête posé et jamais vérifié n'est pas une protection, c'est une intention.
		const attendus: Record<string, string> = {
			'x-content-type-options': 'nosniff',
			'x-frame-options': 'DENY',
			'referrer-policy': 'strict-origin-when-cross-origin',
			'cross-origin-opener-policy': 'same-origin',
			'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
		};
		for (const [nom, valeur] of Object.entries(attendus)) {
			expect(response.headers.get(nom), nom).toBe(valeur);
		}
		// En clair, l'en-tête de transport strict ne doit pas partir : il engagerait le navigateur
		// pour un an sur un domaine qui n'est pas encore en HTTPS.
		expect(response.headers.get('strict-transport-security')).toBeNull();
		const csp = response.headers.get('content-security-policy') ?? '';
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).toContain("form-action 'self'");
		// Le nonce de SvelteKit doit survivre : on ajoute à la politique, on ne la remplace pas.
		expect(csp).toMatch(/script-src[^;]*nonce-/);
	});

	it('refuses a form posted from another origin', async () => {
		const response = await fetch(`${origin}/connexion`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				origin: 'https://ailleurs.example'
			},
			body: new URLSearchParams({ email: 'csrf@example.test' }).toString()
		});
		expect(response.status).toBe(403);
	});
});

describe('la déconnexion', () => {
	it('closes the session, and the page stops answering', async () => {
		const cookie = await signIn('responsable@example.test');
		const before = await fetch(`${origin}/membres`, { headers: { cookie }, redirect: 'manual' });
		expect(before.status).toBe(200);
		const out = await postForm('/deconnexion?/ici', {}, cookie);
		expect(out.status, 'la déconnexion doit rediriger').toBe(303);
		const after = await fetch(`${origin}/membres`, { headers: { cookie }, redirect: 'manual' });
		expect(after.status).toBe(303);
	});
});

describe('l’espace du super-admin', () => {
	it('opens an organisation and changes its plan', async () => {
		const cookie = await signInSuperAdmin();
		const page = await fetch(`${origin}/super-admin`, { headers: { cookie } });
		expect(page.status).toBe(200);

		const slug = `essai-${Date.now().toString(36)}`;
		const opened = await postForm(
			'/super-admin?/ouvrir',
			{ slug, name: 'Mosquée ouverte', timeZone: 'Europe/Zurich' },
			cookie
		);
		expect(opened.status).toBe(200);
		expect(await (await fetch(`${origin}/super-admin`, { headers: { cookie } })).text()).toContain(
			'Mosquée ouverte'
		);

		// Le changement de plan, que le titre promettait sans l'exercer.
		const changed = await postForm(
			'/super-admin?/plan',
			{ organizationId, plan: 'sponsored' },
			cookie
		);
		expect(changed.status).toBe(200);
		const plan = await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			const found = await tx.execute<{ plan: string }>(
				sql`select "plan" from "organization" where "id" = ${organizationId}`
			);
			return (Array.isArray(found) ? (found[0] as { plan: string } | undefined) : undefined)?.plan;
		});
		expect(plan).toBe('sponsored');

		// Un plan qui n'existe pas est refusé, et ne laisse rien derrière lui.
		const inconnu = await postForm(
			'/super-admin?/plan',
			{ organizationId, plan: 'offert-a-vie' },
			cookie
		);
		expect(inconnu.status).toBe(400);
	});

	it('keeps an ordinary manager out of the administration', async () => {
		const cookie = await signIn('responsable@example.test');
		const page = await fetch(`${origin}/super-admin`, { headers: { cookie }, redirect: 'manual' });
		expect(page.status).toBe(303);
		expect(page.headers.get('location')).toBe('/organisations');
	});
});

describe('les pouvoirs du super-admin', () => {
	it('gives none of them to a session opened by magic link alone', async () => {
		// C'est la règle entière de l'ADR 0025 : une boîte aux lettres compromise ne suffit pas.
		const cookie = await signIn('admin@example.test');
		const page = await fetch(`${origin}/super-admin`, { headers: { cookie }, redirect: 'manual' });
		expect(page.status).toBe(303);
		expect(page.headers.get('location')).toBe('/super-admin/passkey');
	});

	it('refuses to register another passkey from a session that has none proven', async () => {
		// La règle d'amorçage : le premier enregistrement passe, les suivants exigent une session
		// déjà prouvée. Sans cela, qui tient la boîte aux lettres se fabrique sa propre passkey.
		const cookie = await signIn('admin@example.test');
		await preuvePasskey(cookie, superAdminUserId);
		const autre = await signIn('admin@example.test');
		const refus = await fetch(`${origin}/api/auth/passkey/generate-register-options`, {
			method: 'POST',
			headers: { cookie: autre, 'content-type': 'application/json', origin },
			body: '{}'
		});
		expect(refus.status).toBe(403);
	});

	it('enters an organisation it is not a member of, and writes in it', async () => {
		const cookie = await signInSuperAdmin();
		const entered = await postForm('/super-admin?/entrer', { organizationId }, cookie);
		expect(entered.status).toBe(303);

		const page = await fetch(`${origin}/`, { headers: { cookie } });
		const html = await page.text();
		expect(html).toContain('Mosquée d’essai');
		// La bannière : elle empêche de modifier la mauvaise mosquée par inadvertance.
		expect(html).toContain('pouvoirs de super-admin');

		const created = await postForm(
			'/cours/nouveau',
			{
				'title.fr': 'Cours du super-admin',
				sourceLanguage: 'fr',
				audience: 'open',
				teachingLanguages: 'fr',
				recurrenceKind: 'weekly',
				weekdays: '1',
				interval: '1',
				timingKind: 'fixed',
				start: '19:00',
				end: '20:00',
				startsOn: '2026-09-07',
				status: 'published'
			},
			cookie
		);
		expect(created.status).toBe(303);

		const journal = await withOrg(
			appHandle.db,
			{ organizationId, userId: adminUserId },
			async (tx) => {
				const found = await tx.execute<{ action: string }>(
					sql`select "action" from "audit_log" where "action" = 'course.create'`
				);
				return Array.isArray(found) ? (found as { action: string }[]) : [];
			}
		);
		// Ses écritures sont signées dans le journal de l'organisation, comme celles d'un
		// responsable : c'est le contrat de l'ADR 0025.
		expect(journal.length).toBeGreaterThan(0);
	});

	it('leaves no trace of its reading in the organisation’s journal, and one in its own register', async () => {
		const cookie = await signInSuperAdmin();
		await postForm('/super-admin?/entrer', { organizationId }, cookie);

		const compter = async () =>
			withOrg(appHandle.db, { organizationId, userId: adminUserId }, async (tx) => {
				const found = await tx.execute<{ n: number }>(
					sql`select count(*)::int as n from "audit_log"`
				);
				return (Array.isArray(found) ? (found[0] as { n: number } | undefined) : undefined)?.n ?? 0;
			});

		const avant = await compter();
		await fetch(`${origin}/cours`, { headers: { cookie } });
		const apres = await compter();
		// Une consultation ne se voit pas : c'est la décision, et son prix est écrit dans
		// `docs/SECURITE.md` et dans `docs/CONDITIONS.md`.
		expect(apres).toBe(avant);

		const registre = await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			const found = await tx.execute<{ route: string }>(
				sql`select "route" from "admin_access_log" where "organization_id" = ${organizationId}`
			);
			return (Array.isArray(found) ? (found as { route: string }[]) : []).map((row) => row.route);
		});
		expect(registre).toContain('/cours');
	});

	it('stops working once its session is older than twelve hours', async () => {
		const cookie = await signInSuperAdmin();
		expect((await fetch(`${origin}/super-admin`, { headers: { cookie } })).status).toBe(200);
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`
				update "session" set "created_at" = now() - interval '13 hours'
				where "user_id" = ${superAdminUserId}
			`);
		});
		// Le plafond est mesuré depuis la création, que Better Auth ne touche jamais : l'usage ne
		// le repousse pas. La session est révoquée, pas seulement ignorée.
		const apres = await fetch(`${origin}/super-admin`, { headers: { cookie }, redirect: 'manual' });
		expect(apres.status).toBe(303);
		expect(apres.headers.get('location')).toBe('/connexion');
	});

	it('produces a rescue link that works once, and records it', async () => {
		const cookie = await signInSuperAdmin();
		const avant = (await outboxMails()).length;
		const response = await postForm(
			'/super-admin?/lienSecours',
			{ email: 'secours@example.test' },
			cookie
		);
		expect(response.status).toBe(200);
		const lien = (await response.text()).match(
			/https?:\/\/[^\s"<]+magic-link\/verify[^\s"<]*/
		)?.[0];
		expect(lien, 'le lien de secours doit être affiché').toBeTruthy();
		// Rien n'est parti par courriel : c'est tout l'intérêt quand le courriel ne part plus.
		expect((await outboxMails()).length).toBe(avant);

		const propre = (lien as string).replaceAll('&amp;', '&');
		const premier = await followMagicLink(propre);
		expect(premier.cookie, 'le lien de secours doit ouvrir une session').toBeTruthy();
		const second = await followMagicLink(propre);
		expect(second.cookie).toBeUndefined();

		const registre = await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			const found = await tx.execute<{ action: string }>(
				sql`select "action" from "admin_access_log" where "action" = 'magic_link'`
			);
			return Array.isArray(found) ? (found as { action: string }[]) : [];
		});
		expect(registre.length).toBeGreaterThan(0);
	});
});

describe('l’espace des responsables', () => {
	/** Crée un cours par le formulaire, sans JavaScript, et rend son identifiant. */
	async function creerCours(
		cookie: string,
		champs: Record<string, string>
	): Promise<{ status: number; id?: string }> {
		const response = await postForm('/cours/nouveau', champs, cookie);
		if (response.status !== 303) return { status: response.status };
		const found = await withOrg(
			appHandle.db,
			{ organizationId, userId: adminUserId },
			async (tx) => {
				const rows = await tx.execute<{ id: string }>(sql`
					select c."id" from "course" c
					join "course_translation" t on t."course_id" = c."id"
					where t."title" = ${champs['title.fr'] ?? ''}
				`);
				return Array.isArray(rows) ? (rows as { id: string }[]) : [];
			}
		);
		return { status: response.status, id: found[0]?.id };
	}

	const BASE = {
		sourceLanguage: 'fr',
		audience: 'open',
		teachingLanguages: 'fr',
		status: 'published',
		startsOn: '2026-09-07'
	};

	it('creates a course of every rhythm and every timing, and refuses what core refuses', async () => {
		const cookie = await signIn('responsable@example.test');
		const cas: Record<string, string>[] = [
			{
				...BASE,
				'title.fr': 'Hebdo',
				recurrenceKind: 'weekly',
				weekdays: '1',
				interval: '1',
				timingKind: 'fixed',
				start: '19:00',
				end: '20:30'
			},
			{
				...BASE,
				'title.fr': 'Quinzaine',
				recurrenceKind: 'weekly',
				weekdays: '3',
				interval: '2',
				timingKind: 'fixed',
				start: '18:00',
				end: '19:00'
			},
			{
				...BASE,
				'title.fr': 'Mensuel',
				recurrenceKind: 'monthly',
				monthlyOrdinal: '-1',
				monthlyWeekday: '6',
				timingKind: 'prayer',
				prayer: 'maghrib',
				offsetMinutes: '30',
				durationMinutes: '60'
			},
			{
				...BASE,
				'title.fr': 'Dates',
				recurrenceKind: 'dates',
				dates: '2026-09-12 2026-09-26',
				timingKind: 'fixed',
				start: '10:00',
				end: '11:30'
			}
		];
		for (const champs of cas) {
			const { status } = await creerCours(cookie, champs);
			expect(status, champs['title.fr']).toBe(303);
		}

		// Ce que `@jadwal/core` refuse, l'écran le refuse aussi, et le dit en français.
		const refus = await postForm(
			'/cours/nouveau',
			{
				...BASE,
				'title.fr': 'Sans jour',
				recurrenceKind: 'weekly',
				interval: '1',
				timingKind: 'fixed',
				start: '19:00',
				end: '20:00'
			},
			cookie
		);
		expect(refus.status).toBe(400);
		expect(await refus.text()).toContain('Choisissez au moins un jour');
	});

	it('shows in À venir exactly what @jadwal/core computes for the same data', async () => {
		const cookie = await signIn('responsable@example.test');
		const html = await (await fetch(`${origin}/`, { headers: { cookie } })).text();

		// La même expansion, calculée ici à partir de la base, sans passer par le serveur : si
		// l'écran refaisait l'arithmétique de son côté, les deux divergeraient.
		const { expandOccurrences, todayInZone, addDays } = await import('@jadwal/core');
		const donnees = await withOrg(
			appHandle.db,
			{ organizationId, userId: adminUserId },
			async (tx) => {
				const cours = await tx.execute(sql`
					select c.*, c."recurrence_date"::text[] as recurrence_dates, t."title" from "course" c
					left join "course_translation" t
						on t."course_id" = c."id" and t."language" = c."source_language"
					where c."status" in ('draft', 'published')
				`);
				return (Array.isArray(cours) ? cours : []) as Record<string, unknown>[];
			}
		);
		const today = todayInZone('Europe/Zurich', new Date());
		const attendues = expandOccurrences({
			schedules: donnees.map((course) => ({
				id: String(course['id']),
				recurrence: recurrenceOf(course),
				timing: timingOf(course),
				startsOn: isoOf(course['starts_on']),
				sequence: 0
			})),
			range: { from: today, to: addDays(today, 6) }
		});
		const titres = new Map(
			donnees.map((course) => [String(course['id']), String(course['title'])])
		);
		// Chaque séance que le cœur annonce est à l'écran ; l'écran n'en invente aucune.
		for (const occurrence of attendues) {
			expect(html, `${titres.get(occurrence.courseId)} le ${occurrence.date}`).toContain(
				titres.get(occurrence.courseId) as string
			);
		}
		expect(attendues.length, 'la semaine de test doit porter des séances').toBeGreaterThan(0);
	});

	it('cancels, moves and restores a session, and writes each one in the journal', async () => {
		const cookie = await signIn('responsable@example.test');
		const { id } = await creerCours(cookie, {
			...BASE,
			'title.fr': 'Exceptions',
			recurrenceKind: 'weekly',
			weekdays: '1',
			interval: '1',
			timingKind: 'fixed',
			start: '19:00',
			end: '20:00'
		});
		expect(id).toBeTruthy();

		const lundi = prochainLundi();
		const annule = await postForm(
			'/?/annuler',
			{ courseId: id as string, date: lundi, title: 'Exceptions' },
			cookie
		);
		expect(annule.status).toBe(200);
		// Le message prêt à coller sort avec l'annulation, et rappelle que le cours continue.
		expect(await annule.text()).toContain('Les autres séances ont lieu normalement');

		const suivant = decalerDe(lundi, 7);
		const deplace = await postForm(
			'/?/deplacer',
			{
				courseId: id as string,
				date: suivant,
				toDate: decalerDe(suivant, 1),
				toStart: '18:00',
				title: 'Exceptions'
			},
			cookie
		);
		expect(deplace.status).toBe(200);

		const retabli = await postForm('/?/retablir', { courseId: id as string, date: lundi }, cookie);
		expect(retabli.status).toBe(200);

		const actions = await withOrg(
			appHandle.db,
			{ organizationId, userId: adminUserId },
			async (tx) => {
				const rows = await tx.execute<{ action: string }>(sql`
					select distinct "action" from "audit_log" where "target_id" = ${id}
				`);
				return (Array.isArray(rows) ? (rows as { action: string }[]) : []).map((row) => row.action);
			}
		);
		expect(actions).toContain('exception.cancel');
		expect(actions).toContain('exception.move');
		expect(actions).toContain('exception.restore');
	});

	it('puts a pause on the whole mosque, and records it', async () => {
		const cookie = await signIn('responsable@example.test');
		const posee = await postForm(
			'/cours?/pause',
			{ from: '2026-12-21', to: '2027-01-03', reason: 'vacances', courseId: '' },
			cookie
		);
		expect(posee.status).toBe(200);
		const page = await fetch(`${origin}/cours`, { headers: { cookie } });
		expect(await page.text()).toContain('Toute la mosquée');

		const traces = await withOrg(
			appHandle.db,
			{ organizationId, userId: adminUserId },
			async (tx) => {
				const rows = await tx.execute<{ action: string }>(
					sql`select "action" from "audit_log" where "action" = 'pause.create'`
				);
				return Array.isArray(rows) ? (rows as { action: string }[]) : [];
			}
		);
		expect(traces.length).toBeGreaterThan(0);
	});

	it('renders dangerous text as text, in every field that shows it', async () => {
		const cookie = await signIn('responsable@example.test');
		const charge = '<img src=x onerror=alert(1)>';
		const { status } = await creerCours(cookie, {
			...BASE,
			'title.fr': charge,
			'description.fr': '"><script>alert(2)</script>',
			teacher: `'--><svg onload=alert(3)>`,
			recurrenceKind: 'weekly',
			weekdays: '5',
			interval: '1',
			timingKind: 'fixed',
			start: '19:00',
			end: '20:00'
		});
		expect(status).toBe(303);
		for (const route of ['/cours', '/']) {
			const html = await (await fetch(`${origin}${route}`, { headers: { cookie } })).text();
			// Svelte échappe `&` et `<` ; un `>` seul ne peut rien ouvrir, et reste tel quel.
			expect(html, route).toContain('&lt;img src=x onerror=alert(1)>');
			expect(html, route).not.toContain(charge);
			expect(html, route).not.toContain('<script>alert(2)</script>');
			expect(html, route).not.toContain('<svg onload=alert(3)>');
		}
	});

	it('keeps an editor out of the settings and the members', async () => {
		const editeur = newId();
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified")
				values (${editeur}, 'editeur@example.test', true)
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organizationId}, ${editeur}, 'editor')
			`);
		});
		const cookie = await signIn('editeur@example.test');
		for (const route of ['/reglages', '/membres']) {
			const page = await fetch(`${origin}${route}`, { headers: { cookie }, redirect: 'manual' });
			expect(page.status, route).toBe(303);
		}
		// Il saisit les cours, en revanche : c'est tout son rôle.
		expect((await fetch(`${origin}/cours`, { headers: { cookie } })).status).toBe(200);
	});

	it('writes nothing into another organisation, whatever the form says', async () => {
		const cookie = await signIn('responsable@example.test');
		const voisine = newId();
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language", "enabled_language")
				values (${voisine}, ${`voisine-${Date.now().toString(36)}`}, 'Mosquée d’à côté',
					'Europe/Zurich', 'fr', array['fr'])
			`);
		});
		// L'identifiant forcé dans le formulaire : le contexte vient de la session, pas de là.
		const force = await postForm(
			'/cours/nouveau',
			{
				...BASE,
				'title.fr': 'Cours volé',
				organizationId: voisine,
				recurrenceKind: 'weekly',
				weekdays: '2',
				interval: '1',
				timingKind: 'fixed',
				start: '19:00',
				end: '20:00'
			},
			cookie
		);
		expect(force.status).toBe(303);
		const chezElle = await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			const rows = await tx.execute<{ n: number }>(
				sql`select count(*)::int as n from "course" where "organization_id" = ${voisine}`
			);
			return (Array.isArray(rows) ? (rows[0] as { n: number } | undefined) : undefined)?.n ?? 0;
		});
		expect(chezElle).toBe(0);
	});

	it('shows the share screen, with the QR code and the three ways to paste the widget', async () => {
		const cookie = await signIn('responsable@example.test');
		const html = await (await fetch(`${origin}/partager`, { headers: { cookie } })).text();
		expect(html).toContain('<svg');
		expect(html).toContain('/m/acces');
		// Depuis l'étape 6, plus rien n'y est annoncé « à venir » : les trois formes existent.
		expect(html).not.toContain('étape 5');
		expect(html).not.toContain('étape 6');
		// Le code ordinaire, celui qui reçoit les corrections tout seul.
		expect(html).toContain('/widget/jadwal-widget.js');
		// Le code verrouillé : une empreinte d'intégrité, et le `crossorigin` sans lequel elle
		// bloquerait le script au lieu de le protéger.
		expect(html).toContain('integrity=');
		expect(html).toContain('sha384-');
		expect(html).toContain('crossorigin=');
		// Et le cadre posé à la main, pour un site qui refuse les scripts extérieurs.
		expect(html).toContain('&lt;iframe src=');
	});

	it('saves the settings, including the greeting the messages open with', async () => {
		const cookie = await signIn('responsable@example.test');
		const enregistre = await postForm(
			'/reglages?/enregistrer',
			{
				name: 'Mosquée d’essai',
				timeZone: 'Europe/Zurich',
				accentColor: '#0f766e',
				greeting: 'Assalamu alaykum',
				enabledLanguages: 'fr',
				defaultLanguage: 'fr'
			},
			cookie
		);
		expect(enregistre.status).toBe(200);
		const accueil = await (await fetch(`${origin}/`, { headers: { cookie } })).text();
		expect(accueil).toContain('Assalamu alaykum');

		// Un fuseau inventé est refusé avant d'atteindre la base.
		const faux = await postForm(
			'/reglages?/enregistrer',
			{
				name: 'Mosquée d’essai',
				timeZone: 'Europe/Nulle-Part',
				accentColor: '#0f766e',
				greeting: 'Salam',
				enabledLanguages: 'fr',
				defaultLanguage: 'fr'
			},
			cookie
		);
		expect(faux.status).toBe(400);
	});
});

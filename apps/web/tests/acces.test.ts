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
import { conditionsAcceptees } from './conditions-acceptees.js';

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

/** Le message prêt à coller qu'une action de l'accueil vient de rendre, tel que la page le montre. */
function messageACopier(html: string): string {
	return /aria-label="Message à copier"[^>]*>([\s\S]*?)<\/textarea>/.exec(html)?.[1] ?? '';
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
			-- Le module des heures de prière est allumé : cette organisation crée des cours ancrés
			-- sur une prière, que la base refuserait sinon (ADR 0042). Les tests du module l’éteignent
			-- eux-mêmes, et le rallument après.
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language", "prayer_module")
			values (${organizationId}, 'acces', 'Association d’essai', 'Europe/Zurich', 'fr',
				array['fr'], true)
		`);
		await tx.execute(sql`
			insert into "user" ("id", "email", "name", "email_verified")
			values (${adminUserId}, 'responsable@example.test', 'Responsable', true)
		`);
		await tx.execute(sql`
			insert into "membership" ("id", "organization_id", "user_id", "role")
			values (${newId()}, ${organizationId}, ${adminUserId}, 'org_admin')
		`);
		// Les conditions déjà acceptées : ce fichier éprouve l'espace, pas son écran d'acceptation,
		// que `conditions.test.ts` éprouve à part (ADR 0044).
		await tx.execute(conditionsAcceptees(organizationId, adminUserId));
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

	it('opens a session that keeps neither the address nor the browser', async () => {
		// `docs/CONDITIONS.md` promet qu'une organisation ne laisse qu'une adresse électronique.
		// Ce n'était pas vrai : Better Auth range `ipAddress` et `userAgent` dans chaque session,
		// sans rien demander, et le durcissement de l'étape 9 les avait même rendus exacts. Rien ne
		// les effaçait ensuite — aucune purge ne visait la table des sessions.
		//
		// La requête porte donc **exprès** une adresse et un navigateur reconnaissables : sans eux,
		// le test passerait aussi sur un serveur qui les enregistre fidèlement, faute de matière.
		const email = 'sans-trace@example.test';
		const MARQUEUR_AGENT = 'marqueur-navigateur-6f1c2e';
		const MARQUEUR_ADRESSE = '198.51.100.77';
		await resetRateLimit();
		await postForm('/connexion', { email });
		const link = await magicLinkFor(email);
		const reponse = await fetch(link as string, {
			redirect: 'manual',
			headers: { 'user-agent': MARQUEUR_AGENT, 'x-forwarded-for': MARQUEUR_ADRESSE }
		});
		expect(
			sessionCookie(reponse),
			'la connexion doit aboutir, sinon rien n’est prouvé'
		).toBeTruthy();

		const rows = await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			return tx.execute<{ ip_address: string | null; user_agent: string | null }>(
				sql`select "ip_address", "user_agent" from "session"`
			);
		});
		const sessions = (Array.isArray(rows) ? rows : []) as {
			ip_address: string | null;
			user_agent: string | null;
		}[];
		expect(sessions.length, 'une session au moins doit exister').toBeGreaterThan(0);
		for (const ligne of sessions) {
			expect(ligne.ip_address ?? '', 'colonne ip_address').toBe('');
			expect(ligne.user_agent ?? '', 'colonne user_agent').toBe('');
		}
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
		const corps: Record<string, string> = {};

		const mesurer = async (nom: string, email: string) => {
			const debut = performance.now();
			const response = await postForm('/connexion', { email });
			const duree = performance.now() - debut;
			corps[nom] = sansNonce(await response.text());
			expect(response.status, nom).toBe(200);
			return duree;
		};

		// Rodage : la première réponse d'un serveur qui vient de démarrer coûte plusieurs fois les
		// suivantes, et une mesure qui l'inclurait noierait l'écart qu'on cherche.
		for (const email of [connue, inconnue]) await postForm('/connexion', { email });

		// **Des écarts appariés, et non une différence de médianes.** Les deux mesures d'un tour sont
		// prises l'une après l'autre, à quelques millisecondes d'intervalle : un ralentissement de la
		// machine — et une machine d'intégration continue est partagée — les touche toutes les deux
		// et s'annule dans leur différence. Une différence de médianes, elle, compare deux ensembles
		// que le bruit a pu décaler séparément, et c'est ainsi qu'on obtient un test qui échoue une
		// fois sur dix sans que rien n'ait changé. Un test qu'on relance jusqu'à ce qu'il passe ne
		// prouve plus rien.
		//
		// L'ordre du couple alterne, pour qu'un éventuel avantage à « passer en premier » — un cache
		// tiède, une connexion déjà ouverte — se compense lui aussi.
		const ecarts: number[] = [];
		for (let tour = 0; tour < 40; tour += 1) {
			if (tour % 2 === 0) {
				const a = await mesurer('connue', connue);
				const b = await mesurer('inconnue', inconnue);
				ecarts.push(a - b);
			} else {
				const b = await mesurer('inconnue', inconnue);
				const a = await mesurer('connue', connue);
				ecarts.push(a - b);
			}
		}
		// Le corps rendu est le même, mot pour mot.
		expect(corps['connue']).toBe(corps['inconnue']);

		const mediane = (valeurs: number[]) =>
			[...valeurs].sort((a, b) => a - b)[Math.floor(valeurs.length / 2)] ?? 0;
		const ecart = Math.abs(mediane(ecarts));
		// Un seuil absolu, et non une fraction du temps de réponse : une fraction de la moitié
		// tolérerait huit millisecondes sur des réponses de seize, c'est-à-dire deux allers-retours
		// vers la base. Une consultation des comptes en coûte un ou deux : le seuil doit être plus
		// serré qu'elle, pas plus large.
		expect(ecart, `écart apparié médian : ${ecart.toFixed(2)} ms`).toBeLessThan(3);
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
		expect(html).toContain('Association d’essai');

		// Une autre organisation, dont cette personne n'est pas membre.
		const autre = newId();
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language", "enabled_language")
				values (${autre}, 'voisine', 'Association voisine', 'Europe/Zurich', 'fr', array['fr'])
			`);
		});

		// Forcer l'identifiant dans le formulaire, dans l'URL et dans un en-tête : rien n'y fait.
		const force = await postForm('/organisations?/choisir', { organizationId: autre }, cookie);
		expect(force.status).toBe(403);
		const parUrl = await fetch(`${origin}/membres?organizationId=${autre}`, {
			headers: { cookie, 'x-organization-id': autre }
		});
		expect(await parUrl.text()).not.toContain('Association voisine');
	});

	it('refuses to serve the members page to someone who is not signed in', async () => {
		const page = await fetch(`${origin}/membres`, { redirect: 'manual' });
		expect(page.status).toBe(303);
		expect(page.headers.get('location')).toBe('/connexion');
	});
});

describe('changer d’organisation', () => {
	// Jusqu'à l'étape 17, le lien n'était que dans la bannière du super-admin et sur l'écran Membres,
	// que les éditeurs n'ouvrent pas, et il s'y montrait même à qui n'a qu'une organisation. Une
	// éditrice de deux organisations devait connaître l'adresse `/organisations`, ou se déconnecter.
	// Le lien vaut aussi pour qui n'a qu'une organisation et une invitation qui attend : c'est sur
	// cet écran qu'elle l'accepte.
	const PREMIERE = newId();
	const SECONDE = newId();
	const EDITRICE = newId();
	const RESPONSABLE = newId();
	const SEULE = newId();
	const EN_ATTENTE = newId();
	const INVITEE = newId();
	const ECHUE = newId();
	const INVITATION_QUI_COURT = newId();
	const INVITATION_ECHUE = newId();
	const LIBELLE = 'Changer d’organisation';

	/**
	 * Les liens d'un fragment, résolus depuis la page comme un navigateur le ferait. SvelteKit rend
	 * les chemins de `resolve` relatifs à la page, `./organisations` sous `/cours` : comparer la
	 * chaîne brute à `/organisations` ne trouverait jamais rien, et un test d'absence passerait à vide.
	 */
	function liens(fragment: string, page: string): { chemin: string; texte: string }[] {
		return [...fragment.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((trouve) => ({
			chemin: new URL(
				(trouve[1]?.match(/\bhref="([^"]*)"/)?.[1] ?? '').replaceAll('&amp;', '&'),
				`${origin}${page}`
			).pathname,
			texte: (trouve[2] ?? '')
				.replace(/<[^>]+>/g, '')
				.replace(/\s+/g, ' ')
				.trim()
		}));
	}

	beforeAll(async () => {
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			for (const [id, slug, nom] of [
				[PREMIERE, 'changer-premiere', 'Association première'],
				[SECONDE, 'changer-seconde', 'Association seconde']
			] as const) {
				await tx.execute(sql`
					insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
						"enabled_language")
					values (${id}, ${slug}, ${nom}, 'Europe/Zurich', 'fr', array['fr'])
				`);
			}
			// Une éditrice des deux : le rôle le plus modeste, pour que le lien ne dépende pas d'un
			// droit de responsable. Un responsable des deux, pour l'écran Membres, que l'éditrice
			// n'ouvre pas. Une responsable d'une seule, qui l'ouvre et ne doit pas l'y trouver. Et une
			// éditrice des deux qui n'a accepté les conditions que dans la première.
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified")
				values (${EDITRICE}, 'deux-organisations@example.test', true),
					(${RESPONSABLE}, 'deux-responsable@example.test', true),
					(${SEULE}, 'une-organisation@example.test', true),
					(${EN_ATTENTE}, 'deux-en-attente@example.test', true)
			`);
			for (const organisation of [PREMIERE, SECONDE]) {
				await tx.execute(sql`
					insert into "membership" ("id", "organization_id", "user_id", "role")
					values (${newId()}, ${organisation}, ${EN_ATTENTE}, 'editor')
				`);
			}
			await tx.execute(conditionsAcceptees(PREMIERE, EN_ATTENTE));
			for (const organisation of [PREMIERE, SECONDE]) {
				for (const [personne, role] of [
					[EDITRICE, 'editor'],
					[RESPONSABLE, 'org_admin']
				] as const) {
					await tx.execute(sql`
						insert into "membership" ("id", "organization_id", "user_id", "role")
						values (${newId()}, ${organisation}, ${personne}, ${role})
					`);
					await tx.execute(conditionsAcceptees(organisation, personne));
				}
			}
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${PREMIERE}, ${SEULE}, 'org_admin')
			`);
			await tx.execute(conditionsAcceptees(PREMIERE, SEULE));
			// Deux personnes d'une seule organisation, invitées dans la seconde : une éditrice dont
			// l'invitation court encore, et une responsable dont l'invitation a échu hier. Les dates
			// se comptent en heures, pas en jours de calendrier : un passage à l'heure d'hiver ne
			// les fait pas enjamber la borne des quatorze jours (migration 0056).
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified")
				values (${INVITEE}, 'une-et-invitee@example.test', true),
					(${ECHUE}, 'une-et-echue@example.test', true)
			`);
			for (const [personne, role] of [
				[INVITEE, 'editor'],
				[ECHUE, 'org_admin']
			] as const) {
				await tx.execute(sql`
					insert into "membership" ("id", "organization_id", "user_id", "role")
					values (${newId()}, ${PREMIERE}, ${personne}, ${role})
				`);
				await tx.execute(conditionsAcceptees(PREMIERE, personne));
			}
			await tx.execute(sql`
				insert into "invitation" ("id", "organization_id", "email", "role", "expires_at")
				values (${INVITATION_QUI_COURT}, ${SECONDE}, 'une-et-invitee@example.test', 'org_admin',
					now() + make_interval(hours => 7 * 24))
			`);
			await tx.execute(sql`
				insert into "invitation" ("id", "organization_id", "email", "role", "created_at",
					"expires_at")
				values (${INVITATION_ECHUE}, ${SECONDE}, 'une-et-echue@example.test', 'editor',
					now() - make_interval(hours => 10 * 24), now() - make_interval(hours => 24))
			`);
		});
	});

	/** Les invitations que l'écran « Vos organisations » propose d'accepter, par leur identifiant. */
	async function invitationsAAccepter(cookie: string): Promise<string[]> {
		const page = await fetch(`${origin}/organisations`, { headers: { cookie } });
		expect(page.status).toBe(200);
		return [...(await page.text()).matchAll(/name="invitationId" value="([^"]*)"/g)].map(
			(trouve) => trouve[1] ?? ''
		);
	}

	/** Aucune trace du lien sur ces écrans de l'espace, qui sont bien ceux de cette organisation. */
	async function aucunLien(cookie: string, routes: string[], nom: string): Promise<void> {
		for (const route of routes) {
			const page = await fetch(`${origin}${route}`, { headers: { cookie } });
			expect(page.status, route).toBe(200);
			const html = await page.text();
			// La page est bien celle de l'espace : sans cette ligne, un renvoi passerait pour une
			// absence.
			expect(html, route).toContain(nom);
			expect(html, route).not.toContain(LIBELLE);
			expect(
				liens(html, route).map((lien) => lien.chemin),
				route
			).not.toContain('/organisations');
		}
	}

	/** Le lien du menu de l'espace, et lui seul sur toute la page : ni doublon, ni second chemin. */
	async function lienUniqueDansLeMenu(cookie: string, route: string, nom: string): Promise<void> {
		const page = await fetch(`${origin}${route}`, { headers: { cookie } });
		expect(page.status, route).toBe(200);
		const html = await page.text();
		expect(html, route).toContain(nom);
		const menu =
			html.match(/<nav\b[^>]*aria-label="Espace des responsables"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';
		expect(
			liens(menu, route).filter((lien) => lien.texte === LIBELLE),
			`${route} : le lien doit être dans le menu de l’espace, vers le choix`
		).toEqual([{ chemin: '/organisations', texte: LIBELLE }]);
		expect(html.split(LIBELLE), `${route} : une seule fois`).toHaveLength(2);
	}

	it('is in the menu of anyone who belongs to several organisations, editors included', async () => {
		const cookie = await signIn('deux-organisations@example.test');
		// Deux organisations et aucune choisie : la porte renvoie au choix.
		const sansChoix = await fetch(`${origin}/cours`, { headers: { cookie }, redirect: 'manual' });
		expect(sansChoix.headers.get('location')).toBe('/organisations');

		const choisie = await postForm('/organisations?/choisir', { organizationId: SECONDE }, cookie);
		expect(choisie.status).toBe(303);
		for (const route of ['/', '/cours', '/partager']) {
			await lienUniqueDansLeMenu(cookie, route, 'Association seconde');
		}

		// Et il mène bien au choix, d'où l'on passe à l'autre organisation.
		const choix = await fetch(`${origin}/organisations`, { headers: { cookie } });
		const liste = await choix.text();
		expect(liste).toContain('Association première');
		expect(liste).toContain('Association seconde');
		expect(
			(await postForm('/organisations?/choisir', { organizationId: PREMIERE }, cookie)).status
		).toBe(303);
		await lienUniqueDansLeMenu(cookie, '/cours', 'Association première');
	});

	it('is there once on the members screen too, for a manager of several organisations', async () => {
		const cookie = await signIn('deux-responsable@example.test');
		await postForm('/organisations?/choisir', { organizationId: PREMIERE }, cookie);
		for (const route of ['/membres', '/reglages', '/']) {
			await lienUniqueDansLeMenu(cookie, route, 'Association première');
		}
	});

	it('is not offered to someone who belongs to one organisation only, on any screen', async () => {
		const cookie = await signIn('une-organisation@example.test');
		// Une responsable : elle ouvre aussi l'écran Membres, qui portait ce lien pour tout le monde.
		await aucunLien(cookie, ['/', '/cours', '/membres', '/reglages'], 'Association première');
		expect(await invitationsAAccepter(cookie)).toEqual([]);
	});

	it('is in the menu of someone with one organisation and an invitation waiting', async () => {
		// Une éditrice : le lien ne dépend pas de l'écran Membres, qu'elle n'ouvre pas. C'est sur
		// « Vos organisations » qu'elle accepte l'invitation, et aucun autre écran de l'espace n'y
		// mène.
		const cookie = await signIn('une-et-invitee@example.test');
		for (const route of ['/', '/cours', '/partager']) {
			await lienUniqueDansLeMenu(cookie, route, 'Association première');
		}
		// Le lien mène à l'invitation qui l'a fait paraître.
		expect(await invitationsAAccepter(cookie)).toEqual([INVITATION_QUI_COURT]);
	});

	it('is not offered for an expired invitation, which the choice screen omits too', async () => {
		// Le lien et l'écran lisent les invitations par la même requête : il ne mène jamais à un
		// écran qui n'aurait rien de plus à proposer.
		const cookie = await signIn('une-et-echue@example.test');
		await aucunLien(cookie, ['/', '/cours', '/membres', '/reglages'], 'Association première');
		expect(await invitationsAAccepter(cookie)).toEqual([]);
		// L'invitation est bien là, en attente, et c'est son échéance seule qui l'écarte.
		const ligne = await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			return tx.execute<{ status: string; echue: boolean }>(sql`
				select "status", "expires_at" <= now() as echue from "invitation"
				where "id" = ${INVITATION_ECHUE}
			`);
		});
		expect([...(ligne as unknown as { status: string; echue: boolean }[])]).toEqual([
			{ status: 'pending', echue: true }
		]);
	});

	// L'écran d'acceptation a son propre lien vers le choix, « Choisir une autre organisation », pour
	// qui en a plusieurs, et son en-tête est réduit à la marque, au compte et à la déconnexion
	// (docs/maquettes/responsables-conditions.md). Un second lien vers le même écran n'y ajouterait
	// rien.
	it('does not double the link of the terms screen, which has its own', async () => {
		const cookie = await signIn('deux-en-attente@example.test');
		await postForm('/organisations?/choisir', { organizationId: SECONDE }, cookie);
		const renvoi = await fetch(`${origin}/cours`, { headers: { cookie }, redirect: 'manual' });
		expect(renvoi.headers.get('location')).toBe('/conditions/accepter');
		const page = await fetch(`${origin}/conditions/accepter`, { headers: { cookie } });
		expect(page.status).toBe(200);
		const html = await page.text();
		expect(html).toContain('Association seconde');
		expect(html).not.toContain(LIBELLE);
		expect(
			liens(html, '/conditions/accepter').filter((lien) => lien.chemin === '/organisations')
		).toEqual([{ chemin: '/organisations', texte: 'Choisir une autre organisation' }]);

		// Les conditions acceptées, la navigation revient, et le lien avec elle.
		expect(
			(await postForm('/organisations?/choisir', { organizationId: PREMIERE }, cookie)).status
		).toBe(303);
		await lienUniqueDansLeMenu(cookie, '/cours', 'Association première');
	});

	it('leaves the super-admin the link of his banner, and only that one', async () => {
		// Une invitation l'attend, et la règle de l'invitation ne lui rend pas pour autant le lien de
		// la navigation. Elle est retirée à la fin : le reste du fichier ne l'attend pas.
		const invitation = newId();
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`
				insert into "invitation" ("id", "organization_id", "email", "role", "expires_at")
				values (${invitation}, ${PREMIERE}, 'admin@example.test', 'editor',
					now() + make_interval(hours => 7 * 24))
			`);
		});
		try {
			const cookie = await signInSuperAdmin();
			// Elle compte bien : l'écran du choix la propose.
			expect(await invitationsAAccepter(cookie)).toEqual([invitation]);
			expect(
				(await postForm('/super-admin?/entrer', { organizationId: SECONDE }, cookie)).status
			).toBe(303);
			const html = await (await fetch(`${origin}/cours`, { headers: { cookie } })).text();
			const banniere = html.match(/<p class="banniere[^"]*"[\s\S]*?<\/p>/)?.[0] ?? '';
			expect(banniere).toContain('Association seconde');
			expect(liens(banniere, '/cours')).toEqual([{ chemin: '/super-admin', texte: LIBELLE }]);
			expect(html.split(LIBELLE)).toHaveLength(2);
			expect(liens(html, '/cours').map((lien) => lien.chemin)).not.toContain('/organisations');
		} finally {
			await ownerHandle.db.transaction(async (tx) => {
				await tx.execute(sql`set local jadwal.maintenance = 'on'`);
				await tx.execute(sql`delete from "invitation" where "id" = ${invitation}`);
			});
		}
	});
});

describe('le rôle et l’organisation de la session, et d’aucune autre', () => {
	// Une personne n'a qu'un compte pour tout le service (ADR 0017). La politique des adhésions lui
	// montre ses lignes dans toutes ses organisations (migration 0022), et celle des organisations
	// lui montre aussi celles qui l'invitent (migration 0023). Jusqu'à l'étape 17, le contexte lisait
	// le rôle et l'organisation sans filtre et prenait la première ligne venue : une responsable
	// d'une organisation, éditrice d'une autre, était traitée en responsable dans les deux. Trouvé
	// par le parcours complet.
	const suffixe = newId().slice(-8);
	const RESPONSABLES = newId();
	const EDITEURS = newId();
	const QUI_INVITE = newId();
	const DE_LA_SESSION = newId();
	const DE_L_EXPLOITANT = newId();
	const VISITEE = newId();
	const DOUBLE = newId();
	const DOUBLE_EDITRICE = newId();
	const DOUBLE_RESPONSABLE = newId();
	const COLLEGUE = newId();
	const COLLEGUE_EDITEUR = newId();
	const INVITEE_AILLEURS = newId();
	const INVITATION_AILLEURS = newId();
	const RETIREE = newId();
	const EXPLOITANT = newId();
	const SLUG_QUI_INVITE = `qui-invite-${suffixe}`;
	const COULEUR_QUI_INVITE = '#7c2d12';

	/** Les textes des liens du menu de l'espace, ou `null` si la page n'a pas ce menu. */
	function menuDeLEspace(html: string): string[] | null {
		const menu = html.match(
			/<nav\b[^>]*aria-label="Espace des responsables"[^>]*>[\s\S]*?<\/nav>/
		)?.[0];
		if (!menu) return null;
		return [...menu.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((lien) =>
			(lien[1] ?? '')
				.replace(/<[^>]+>/g, '')
				.replace(/\s+/g, ' ')
				.trim()
		);
	}

	/** Les adhésions d'une organisation, relues par le propriétaire : identifiant et rôle. */
	async function adhesionsDe(organisation: string): Promise<Record<string, string>> {
		const lignes = await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			return tx.execute<{ id: string; role: string }>(
				sql`select "id", "role" from "membership" where "organization_id" = ${organisation}`
			);
		});
		return Object.fromEntries(
			(Array.isArray(lignes) ? (lignes as { id: string; role: string }[]) : []).map((ligne) => [
				ligne.id,
				ligne.role
			])
		);
	}

	beforeAll(async () => {
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			// L'organisation qui invite est créée avant celle de la session, et le module des heures
			// de prière n'est allumé que chez elle : une lecture sans filtre la rendrait en premier, et
			// la coquille prendrait son nom, sa couleur et son module.
			for (const [id, slug, nom, couleur, module] of [
				[RESPONSABLES, `responsables-${suffixe}`, 'Association des responsables', '#0f766e', false],
				[EDITEURS, `editeurs-${suffixe}`, 'Association des éditeurs', '#0f766e', false],
				[QUI_INVITE, SLUG_QUI_INVITE, 'Association qui invite', COULEUR_QUI_INVITE, true],
				[DE_LA_SESSION, `de-la-session-${suffixe}`, 'Association de la session', '#1d4ed8', false],
				[DE_L_EXPLOITANT, `exploitant-${suffixe}`, 'Association de l’exploitant', '#0f766e', false],
				[VISITEE, `visitee-${suffixe}`, 'Association visitée', '#0f766e', false]
			] as const) {
				await tx.execute(sql`
					insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
						"enabled_language", "accent_color", "prayer_module")
					values (${id}, ${slug}, ${nom}, 'Europe/Zurich', 'fr', array['fr'], ${couleur}, ${module})
				`);
			}
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified", "is_super_admin")
				values (${DOUBLE}, 'responsable-et-editrice@example.test', true, false),
					(${COLLEGUE}, 'collegue-editeur@example.test', true, false),
					(${INVITEE_AILLEURS}, 'responsable-invitee-ailleurs@example.test', true, false),
					(${RETIREE}, 'retiree@example.test', true, false),
					(${EXPLOITANT}, 'exploitant-membre@example.test', true, true)
			`);
			// L'adhésion de responsable d'abord, dans une instruction à elle : c'est la ligne qu'une
			// lecture sans filtre rendrait en premier, dans l'une comme dans l'autre organisation.
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${DOUBLE_RESPONSABLE}, ${RESPONSABLES}, ${DOUBLE}, 'org_admin')
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${DOUBLE_EDITRICE}, ${EDITEURS}, ${DOUBLE}, 'editor')
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${COLLEGUE_EDITEUR}, ${EDITEURS}, ${COLLEGUE}, 'editor'),
					(${newId()}, ${DE_LA_SESSION}, ${INVITEE_AILLEURS}, 'org_admin'),
					(${newId()}, ${RESPONSABLES}, ${RETIREE}, 'editor'),
					(${newId()}, ${EDITEURS}, ${RETIREE}, 'editor'),
					(${newId()}, ${DE_L_EXPLOITANT}, ${EXPLOITANT}, 'org_admin')
			`);
			for (const [organisation, personne] of [
				[RESPONSABLES, DOUBLE],
				[EDITEURS, DOUBLE],
				[DE_LA_SESSION, INVITEE_AILLEURS],
				[RESPONSABLES, RETIREE],
				[EDITEURS, RETIREE]
			] as const) {
				await tx.execute(conditionsAcceptees(organisation, personne));
			}
			// Une invitation qui court, de l'organisation qui invite vers la responsable de l'autre.
			await tx.execute(sql`
				insert into "invitation" ("id", "organization_id", "email", "role", "expires_at")
				values (${INVITATION_AILLEURS}, ${QUI_INVITE}, 'responsable-invitee-ailleurs@example.test',
					'editor', now() + make_interval(hours => 7 * 24))
			`);
		});
	});

	it('treats a manager of one organisation as the editor she is in the other', async () => {
		const cookie = await signIn('responsable-et-editrice@example.test');
		expect(
			(await postForm('/organisations?/choisir', { organizationId: EDITEURS }, cookie)).status
		).toBe(303);

		const accueil = await (await fetch(`${origin}/`, { headers: { cookie } })).text();
		expect(accueil).toContain('Association des éditeurs');
		const menu = menuDeLEspace(accueil);
		// Le menu est bien là : sans cette ligne, une page sans menu passerait pour un menu d'éditrice.
		expect(menu).toContain('Cours');
		expect(menu).not.toContain('Membres');
		expect(menu).not.toContain('Réglages');
		for (const route of ['/membres', '/reglages']) {
			const page = await fetch(`${origin}${route}`, { headers: { cookie }, redirect: 'manual' });
			expect(page.status, route).toBe(303);
			expect(page.headers.get('location'), route).toBe('/');
		}

		// Les actions de l'écran Membres, envoyées à la main : aucune ne passe, pas même se promouvoir
		// soi-même, et rien ne part.
		const envois: [string, Record<string, string>][] = [
			['/membres?/inviter', { email: 'par-une-editrice@example.test', role: 'org_admin' }],
			['/membres?/role', { membershipId: DOUBLE_EDITRICE, role: 'org_admin' }],
			['/membres?/retirer', { membershipId: COLLEGUE_EDITEUR }]
		];
		for (const [action, champs] of envois) {
			const reponse = await postForm(action, champs, cookie);
			expect(reponse.status, action).toBe(303);
			expect(reponse.headers.get('location'), action).toBe('/');
		}
		expect(await lastMailTo('par-une-editrice@example.test')).toBeUndefined();
		expect(await adhesionsDe(EDITEURS)).toMatchObject({
			[DOUBLE_EDITRICE]: 'editor',
			[COLLEGUE_EDITEUR]: 'editor'
		});

		// Dans la première, elle reste responsable, et sa liste des membres n'y montre que les siens :
		// pas son adhésion d'éditrice, venue de l'autre organisation.
		expect(
			(await postForm('/organisations?/choisir', { organizationId: RESPONSABLES }, cookie)).status
		).toBe(303);
		const membres = await fetch(`${origin}/membres`, { headers: { cookie }, redirect: 'manual' });
		expect(membres.status).toBe(200);
		const liste = await membres.text();
		expect(liste).toContain(`<h1>Association des responsables</h1>`);
		expect(liste).toContain(DOUBLE_RESPONSABLE);
		expect(liste).not.toContain(DOUBLE_EDITRICE);
		expect(liste).not.toContain(COLLEGUE_EDITEUR);
	});

	it('names the organisation of the session, never one that invites the person', async () => {
		const cookie = await signIn('responsable-invitee-ailleurs@example.test');
		// Membre d'une seule organisation : pas de choix, elle y entre tout de suite.
		for (const route of ['/', '/cours', '/membres']) {
			const page = await fetch(`${origin}${route}`, { headers: { cookie }, redirect: 'manual' });
			expect(page.status, route).toBe(200);
			const html = await page.text();
			expect(html, route).toContain('Association de la session');
			expect(html, route).not.toContain('Association qui invite');
			expect(html, route).not.toContain(SLUG_QUI_INVITE);
			expect(html, route).not.toContain(COULEUR_QUI_INVITE);
			expect(menuDeLEspace(html), route).not.toContain('Prières');
		}
		// Le module des heures de prière est celui de son organisation, éteint : ses écrans n'existent
		// pas, même si l'organisation qui l'invite a allumé le sien.
		expect((await fetch(`${origin}/prieres`, { headers: { cookie } })).status).toBe(404);

		// L'écran Membres de son organisation ne montre pas l'invitation qu'elle a reçue d'ailleurs, et
		// ne peut pas l'annuler.
		const membres = await (await fetch(`${origin}/membres`, { headers: { cookie } })).text();
		expect(membres).not.toContain(INVITATION_AILLEURS);
		expect(membres).toContain('Aucune invitation en attente.');
		await postForm('/membres?/annuler', { invitationId: INVITATION_AILLEURS }, cookie);
		const etat = await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			const lignes = await tx.execute<{ status: string }>(
				sql`select "status" from "invitation" where "id" = ${INVITATION_AILLEURS}`
			);
			return (Array.isArray(lignes) ? (lignes[0] as { status: string } | undefined) : undefined)
				?.status;
		});
		expect(etat).toBe('pending');
		// Et le journal de son organisation ne dit pas qu'elle a annulé ce qu'elle n'a pas touché. Il
		// se lit dans l'organisation, par le rôle applicatif : le propriétaire ne le lit pas.
		const journal = await withOrg(
			appHandle.db,
			{ organizationId: DE_LA_SESSION, userId: INVITEE_AILLEURS },
			async (tx) => {
				const lignes = await tx.execute<{ action: string }>(sql`select "action" from "audit_log"`);
				return (Array.isArray(lignes) ? (lignes as { action: string }[]) : []).map(
					(ligne) => ligne.action
				);
			}
		);
		expect(journal).not.toContain('invitation.cancel');
	});

	it('lets a super-admin who belongs to one organisation enter another', async () => {
		// Le repli sur l'organisation unique l'emportait sur celle qu'il venait de choisir : il
		// retombait dans la sienne à chaque requête et n'entrait jamais ailleurs.
		const cookie = await signIn('exploitant-membre@example.test');
		await preuvePasskey(cookie, EXPLOITANT);
		expect(
			(await postForm('/super-admin?/entrer', { organizationId: VISITEE }, cookie)).status
		).toBe(303);
		const visitee = await (await fetch(`${origin}/cours`, { headers: { cookie } })).text();
		expect(visitee).toContain('<title>Cours | Association visitée</title>');
		expect(visitee).toContain('pouvoirs de super-admin');

		// Revenu chez lui, il y est membre, et la bannière s'en va.
		expect(
			(await postForm('/super-admin?/entrer', { organizationId: DE_L_EXPLOITANT }, cookie)).status
		).toBe(303);
		const chezLui = await (await fetch(`${origin}/cours`, { headers: { cookie } })).text();
		expect(chezLui).toContain('<title>Cours | Association de l’exploitant</title>');
		expect(chezLui).not.toContain('pouvoirs de super-admin');

		// Une session neuve, sans choix posé : il entre dans son unique organisation, comme avant.
		const neuve = await signIn('exploitant-membre@example.test');
		await preuvePasskey(neuve, EXPLOITANT);
		const accueil = await (await fetch(`${origin}/cours`, { headers: { cookie: neuve } })).text();
		expect(accueil).toContain('<title>Cours | Association de l’exploitant</title>');
	});

	it('brings an ordinary member removed from the chosen organisation back to her only one', async () => {
		// La garde de la correction précédente : le choix posé ne l'emporte que pour le super-admin.
		// Une personne ordinaire retirée de l'organisation choisie retombe dans celle qui lui reste,
		// sans repasser par le choix.
		const cookie = await signIn('retiree@example.test');
		expect(
			(await postForm('/organisations?/choisir', { organizationId: EDITEURS }, cookie)).status
		).toBe(303);
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`
				delete from "membership" where "organization_id" = ${EDITEURS} and "user_id" = ${RETIREE}
			`);
		});
		const page = await fetch(`${origin}/cours`, { headers: { cookie }, redirect: 'manual' });
		expect(page.status).toBe(200);
		expect(await page.text()).toContain('<title>Cours | Association des responsables</title>');
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
		// Sa première entrée dans l'espace passe par les conditions d'utilisation, comme pour toute
		// personne invitée (ADR 0044) : elle les accepte par le formulaire de l'écran.
		const conditions = await postForm('/conditions/accepter', {}, cookie);
		expect(conditions.status).toBe(303);
		expect(conditions.headers.get('location')).toBe('/');

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

describe('les invitations', () => {
	type LigneInvitation = {
		id: string;
		status: string;
		role: string;
		valide: boolean;
		resolue: boolean;
	};

	/** Les invitations d'une adresse dans l'organisation d'essai, de la plus ancienne à la plus récente. */
	async function invitationsDe(email: string): Promise<LigneInvitation[]> {
		const lignes = await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			return tx.execute<LigneInvitation>(sql`
				select "id", "status", "role", "expires_at" > now() as valide,
					"resolved_at" is not null as resolue
				from "invitation"
				where "organization_id" = ${organizationId} and lower("email") = lower(${email})
				order by "id"
			`);
		});
		return Array.isArray(lignes) ? (lignes as LigneInvitation[]) : [];
	}

	/** Ce que l'écran dit après l'envoi, et rien d'autre de la page. */
	function messageDeLEcran(html: string): string | undefined {
		return /<p role="status">([\s\S]*?)<\/p>/.exec(html)?.[1];
	}

	it('invites again an address whose invitation has run out, and the person sees it', async () => {
		// L'index des invitations en attente couvre aussi les échues : l'insertion ne faisait rien,
		// l'écran disait « envoyée », le courriel partait, et personne ne voyait d'invitation. La liste
		// de l'écran ne montre pas les échues : la personne responsable ne pouvait pas non plus
		// annuler l'ancienne.
		const email = 'echue@example.test';
		const echue = newId();
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`
				insert into "invitation" ("id", "organization_id", "email", "role", "invited_by",
					"created_at", "expires_at")
				values (${echue}, ${organizationId}, ${email}, 'editor', ${adminUserId},
					now() - make_interval(hours => 15 * 24), now() - make_interval(hours => 24))
			`);
		});
		const cookie = await signIn('responsable@example.test');
		const reponse = await postForm('/membres?/inviter', { email, role: 'editor' }, cookie);
		expect(reponse.status).toBe(200);
		expect(messageDeLEcran(await reponse.text())).toBe(
			'L’invitation a été envoyée à cette adresse.'
		);

		const lignes = await invitationsDe(email);
		expect(lignes.find((ligne) => ligne.id === echue)).toMatchObject({
			status: 'cancelled',
			resolue: true
		});
		expect(lignes.filter((ligne) => ligne.status === 'pending' && ligne.valide)).toHaveLength(1);

		// Et la personne invitée la trouve en se connectant.
		const invitee = await signIn(email);
		const choix = await (
			await fetch(`${origin}/organisations`, { headers: { cookie: invitee } })
		).text();
		expect(choix).toContain('Association d’essai');
		expect(choix).toMatch(/name="invitationId" value="[^"]+"/);
	});

	it('sends a real invitation when one is still pending, with the same answer', async () => {
		// Une invitation qui court encore faisait tomber la nouvelle en silence : l'écran disait
		// « envoyée » pour une invitation de responsable, et l'adresse restait invitée en éditrice.
		// La nouvelle remplace désormais l'ancienne, et la réponse ne change pas d'un mot : elle ne
		// dépend de rien que la personne responsable ne voie déjà (ADR 0017).
		const email = 'deja-invitee@example.test';
		const cookie = await signIn('responsable@example.test');
		const premiere = await postForm('/membres?/inviter', { email, role: 'editor' }, cookie);
		const seconde = await postForm('/membres?/inviter', { email, role: 'org_admin' }, cookie);
		expect([premiere.status, seconde.status]).toEqual([200, 200]);
		const messages = [
			messageDeLEcran(await premiere.text()),
			messageDeLEcran(await seconde.text())
		];
		expect(messages).toEqual([
			'L’invitation a été envoyée à cette adresse.',
			'L’invitation a été envoyée à cette adresse.'
		]);
		expect((await invitationsDe(email)).map((ligne) => [ligne.status, ligne.role])).toEqual([
			['cancelled', 'editor'],
			['pending', 'org_admin']
		]);
	});

	it('lasts fourteen days by the clock, whatever the time zone of the session', async () => {
		// La contrainte de la base compte une durée écoulée, 336 heures (migration 0056). Quatorze
		// jours de calendrier, comptés dans un fuseau qui change d'heure, en font 337 : l'insertion de
		// l'écran tombait alors sur la contrainte, et la page répondait 500. On rejoue son calcul à la
		// lettre, lu dans le fichier de l'écran, le 20 octobre 2026 à Zurich : l'heure d'hiver arrive
		// le 25, dans la durée.
		const source = readFileSync(
			new URL('../src/routes/membres/+page.server.ts', import.meta.url),
			'utf8'
		);
		const jours = /^const INVITATION_DAYS = (\d+);$/m.exec(source)?.[1];
		const duree = /now\(\) \+ (make_interval\([^)]*\))/.exec(source)?.[1];
		expect(jours, 'INVITATION_DAYS dans l’écran des membres').toBeTruthy();
		expect(duree, 'la fin calculée par l’écran').toBeTruthy();
		const intervalle = (duree as string).replaceAll('${INVITATION_DAYS}', jours as string);
		const creation = '2026-10-20 12:00:00+00';
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`set local time zone 'Europe/Zurich'`);
			const id = newId();
			await tx.execute(sql`
				insert into "invitation" ("id", "organization_id", "email", "role", "created_at",
					"expires_at")
				values (${id}, ${organizationId}, 'heure-d-hiver@example.test', 'editor',
					${creation}::timestamptz, ${creation}::timestamptz + ${sql.raw(intervalle)})
			`);
			// La ligne n'a servi qu'à la contrainte : elle ne reste pas dans la liste de l'écran.
			await tx.execute(sql`delete from "invitation" where "id" = ${id}`);
		});
	});

	it('consumes the invitation of a person who is already a member, and keeps her role', async () => {
		// L'écran ne consulte pas les comptes (ADR 0017) : il réinvite une personne déjà membre comme
		// n'importe quelle adresse. Elle acceptait, l'adhésion existait déjà, rien n'était inséré, et
		// l'invitation restait « accepted » : retirée ensuite, la personne se remettait seule dans
		// l'organisation par un appel direct. La base la consomme désormais dès l'acceptation
		// (migration 0058), et l'écran ne tente plus d'adhésion.
		const email = 'deja-membre@example.test';
		const membre = newId();
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified") values (${membre}, ${email}, true)
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organizationId}, ${membre}, 'editor')
			`);
			await tx.execute(conditionsAcceptees(organizationId, membre));
		});
		const responsable = await signIn('responsable@example.test');
		const envoi = await postForm('/membres?/inviter', { email, role: 'org_admin' }, responsable);
		expect(envoi.status).toBe(200);

		const cookie = await signIn(email);
		const page = await (await fetch(`${origin}/organisations`, { headers: { cookie } })).text();
		const invitationId = page.match(/name="invitationId" value="([^"]+)"/)?.[1];
		expect(invitationId, 'l’invitation doit apparaître').toBeTruthy();
		const accepte = await postForm(
			'/organisations?/accepter',
			{ invitationId: invitationId as string },
			cookie
		);
		expect(accepte.status).toBe(303);
		expect(accepte.headers.get('location')).toBe('/');

		expect(
			(await invitationsDe(email)).map((ligne) => [ligne.id, ligne.status, ligne.role])
		).toEqual([[invitationId, 'joined', 'org_admin']]);
		const role = await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			return tx.execute<{ role: string }>(sql`
				select "role" from "membership"
				where "organization_id" = ${organizationId} and "user_id" = ${membre}
			`);
		});
		expect((role as unknown as { role: string }[]).map((ligne) => ligne.role)).toEqual(['editor']);
	});

	it('leaves alone the invitations a manager received elsewhere when she invites her own address', async () => {
		// La politique de modification laisse la personne connectée toucher les invitations reçues à
		// son adresse, dans toutes les organisations (migration 0016). Réinviter une adresse clôt ses
		// invitations en attente : sans le filtre sur l'organisation, une responsable qui invite sa
		// propre adresse clôt celles qu'elle a reçues d'ailleurs.
		const suffixe = newId().slice(-8);
		const session = newId();
		const ailleurs = newId();
		const moi = newId();
		const recue = newId();
		const adresse = 'elle-meme@example.test';
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			for (const [id, slug, nom] of [
				[ailleurs, `ailleurs-${suffixe}`, 'Association d’ailleurs'],
				[session, `sienne-${suffixe}`, 'Association à elle']
			] as const) {
				await tx.execute(sql`
					insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
						"enabled_language")
					values (${id}, ${slug}, ${nom}, 'Europe/Zurich', 'fr', array['fr'])
				`);
			}
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified") values (${moi}, ${adresse}, true)
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${session}, ${moi}, 'org_admin')
			`);
			await tx.execute(conditionsAcceptees(session, moi));
			await tx.execute(sql`
				insert into "invitation" ("id", "organization_id", "email", "role", "expires_at")
				values (${recue}, ${ailleurs}, ${adresse}, 'editor', now() + make_interval(hours => 7 * 24))
			`);
		});
		const cookie = await signIn(adresse);
		const envoi = await postForm('/membres?/inviter', { email: adresse, role: 'editor' }, cookie);
		expect(envoi.status).toBe(200);

		const lignes = await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			return tx.execute<{ id: string; organization_id: string; status: string }>(sql`
				select "id", "organization_id", "status" from "invitation"
				where lower("email") = lower(${adresse}) order by "id"
			`);
		});
		const parOrganisation = (
			lignes as unknown as { id: string; organization_id: string; status: string }[]
		).map((ligne) => [ligne.organization_id === ailleurs ? 'ailleurs' : 'sienne', ligne.status]);
		expect(parOrganisation).toEqual([
			['ailleurs', 'pending'],
			['sienne', 'pending']
		]);
	});

	it('writes the replaced invitation in the journal, with the one that replaces it', async () => {
		// L'écran des membres consigne l'invitation remplacée comme une annulation qui nomme sa
		// remplaçante (`routes/membres/+page.server.ts`, action `inviter`). Le journal se lit sous le
		// rôle applicatif : le propriétaire n'y a pas accès (migration 0029), et une lecture sous lui
		// passerait à vide.
		const email = 'journal-remplacee@example.test';
		const cookie = await signIn('responsable@example.test');
		await postForm('/membres?/inviter', { email, role: 'editor' }, cookie);
		await postForm('/membres?/inviter', { email, role: 'org_admin' }, cookie);
		const [ancienne, nouvelle] = (await invitationsDe(email)).map((ligne) => ligne.id);
		expect(ancienne && nouvelle, 'deux invitations').toBeTruthy();
		const journal = await withOrg(
			appHandle.db,
			{ organizationId, userId: adminUserId },
			async (tx) =>
				tx.execute<{ action: string; target_id: string; after: unknown }>(sql`
					select "action", "target_id", "after" from "audit_log"
					where "target_id" in (${ancienne}, ${nouvelle}) order by "created_at", "id"
				`)
		);
		expect(
			(journal as unknown as { action: string; target_id: string; after: unknown }[]).map(
				(ligne) => [
					ligne.action,
					ligne.target_id === ancienne ? 'ancienne' : 'nouvelle',
					typeof ligne.after === 'string' ? JSON.parse(ligne.after) : ligne.after
				]
			)
		).toEqual([
			['invitation.create', 'ancienne', { email, role: 'editor' }],
			['invitation.cancel', 'ancienne', { replacedBy: nouvelle }],
			['invitation.create', 'nouvelle', { email, role: 'org_admin' }]
		]);
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
		// pour deux ans sur un domaine qui n'est pas encore en HTTPS. Sa valeur, que ces serveurs
		// en clair ne peuvent pas montrer, est éprouvée par `src/lib/server/hsts.test.ts`.
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
			{ slug, name: 'Association ouverte', timeZone: 'Europe/Zurich' },
			cookie
		);
		expect(opened.status).toBe(200);
		expect(await (await fetch(`${origin}/super-admin`, { headers: { cookie } })).text()).toContain(
			'Association ouverte'
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

	it('offers the passkey sign-in as soon as the first one is registered, with no sign-out', async () => {
		// Ce que voit quelqu’un qui vient d’enregistrer sa première passkey : l’écran est rechargé par
		// la même session, ouverte par lien magique. C’est exactement l’instant qui suit
		// l’enregistrement, une fois les données relues.
		//
		// Lui demander de se déconnecter puis de revenir serait une marche de plus pour rien, et
		// c’est ce que l’écran disait jusqu’à cette étape.
		const email = `passkey-fraiche-${Date.now().toString(36)}@example.test`;
		const userId = newId();
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified", "is_super_admin")
				values (${userId}, ${email}, true, true)
			`);
		});
		await resetRateLimit();
		const cookie = await signIn(email);

		// Avant : aucune passkey. C’est la fenêtre d’amorçage, et elle ne propose que l’enregistrement.
		const avant = await (
			await fetch(`${origin}/super-admin/passkey`, { headers: { cookie } })
		).text();
		expect(avant).toContain('Enregistrer une passkey');
		expect(avant).not.toContain('Se connecter avec une passkey');

		// L’enregistrement, tel que le navigateur le fait : une ligne de plus dans la table.
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`
				insert into "passkey" ("id", "name", "public_key", "user_id", "credential_id", "counter",
					"device_type", "backed_up")
				values (${newId()}, 'Cet appareil', 'cle-publique', ${userId}, ${newId()}, 0, 'singleDevice', false)
			`);
		});

		// Après, **sans changer de session** : le bouton est là.
		const apres = await (
			await fetch(`${origin}/super-admin/passkey`, { headers: { cookie } })
		).text();
		expect(apres).toContain('Se connecter avec une passkey');
		// Et le message qui suit l’enregistrement ne demande plus de se déconnecter. Ce message-là
		// n’est pas dans le HTML : il est posé par le navigateur, après la cérémonie WebAuthn, que
		// ce test ne peut pas jouer. On garde donc le texte à la source — c’est une garde modeste,
		// mais elle empêche le conseil inutile de revenir sans qu’on s’en aperçoive.
		const ecran = readFileSync(
			new URL('../src/routes/super-admin/passkey/+page.svelte', import.meta.url),
			'utf8'
		);
		expect(ecran).not.toContain('Déconnectez-vous puis reconnectez-vous');
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
		expect(html).toContain('Association d’essai');
		// La bannière : elle empêche de modifier la mauvaise organisation par inadvertance.
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

	it('reads the organisation it entered, and no other, when the instance has several', async () => {
		// Le rôle du super-admin voit toutes les lignes de `organization` : c'est ce qui lui fait
		// lister et ouvrir les organisations (ADR 0025). Une lecture de cette table sans filtre ne s'y
		// arrête donc pas au contexte, et rendait la même ligne dans deux organisations. Trouvé par
		// le parcours complet : l'invitation envoyée depuis la seconde nommait la première.
		const suffixe = Date.now().toString(36);
		const organisations = [
			{
				id: newId(),
				slug: `voisine-${suffixe}`,
				nom: 'Association voisine',
				accueil: 'Bonjour les voisins'
			},
			{
				id: newId(),
				slug: `lointaine-${suffixe}`,
				nom: 'Association lointaine',
				accueil: 'Bienvenue de loin'
			}
		];
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			for (const organisation of organisations) {
				await tx.execute(sql`
					insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
						"enabled_language", "greeting")
					values (${organisation.id}, ${organisation.slug}, ${organisation.nom}, 'Europe/Zurich',
						'fr', array['fr'], ${organisation.accueil})
				`);
			}
		});

		const cookie = await signInSuperAdmin();
		for (const organisation of organisations) {
			const entre = await postForm(
				'/super-admin?/entrer',
				{ organizationId: organisation.id },
				cookie
			);
			expect(entre.status).toBe(303);

			// L'écran Membres, son titre, et l'invitation qui en part.
			const membres = await (await fetch(`${origin}/membres`, { headers: { cookie } })).text();
			expect(membres).toContain(`<title>Membres | ${organisation.nom}</title>`);
			expect(membres).toContain(`<h1>${organisation.nom}</h1>`);
			const invitee = `invitee-${organisation.slug}@example.test`;
			const invite = await postForm(
				'/membres?/inviter',
				{ email: invitee, role: 'editor' },
				cookie
			);
			expect(invite.status).toBe(200);
			expect((await lastMailTo(invitee))?.subject).toBe(
				`Invitation à rejoindre ${organisation.nom} sur jadwal`
			);

			// Les réglages, que le formulaire préremplit : les enregistrer tels quels aurait écrit
			// dans cette organisation le nom et la formule d'une autre.
			const reglages = await (await fetch(`${origin}/reglages`, { headers: { cookie } })).text();
			expect(reglages).toContain(`value="${organisation.nom}"`);
			expect(reglages).toContain(`value="${organisation.accueil}"`);

			// Les messages prêts à coller s'ouvrent sur la formule de cette organisation : celui de
			// la semaine, à l'accueil, et ceux d'une annulation et d'un déplacement.
			const titre = `Cours de ${organisation.slug}`;
			const cree = await postForm(
				'/cours/nouveau',
				{
					'title.fr': titre,
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
			expect(cree.status).toBe(303);
			const courseId = await ownerHandle.db.transaction(async (tx) => {
				await tx.execute(sql`set local jadwal.maintenance = 'on'`);
				const found = await tx.execute<{ id: string }>(sql`
					select c."id" from "course" c
					join "course_translation" t on t."course_id" = c."id"
					where c."organization_id" = ${organisation.id} and t."title" = ${titre}
				`);
				return (Array.isArray(found) ? (found[0] as { id: string } | undefined) : undefined)?.id;
			});
			expect(courseId).toBeTruthy();

			const accueil = await (await fetch(`${origin}/`, { headers: { cookie } })).text();
			expect(accueil).toContain(organisation.accueil);
			const lundi = prochainLundi();
			const annule = await postForm(
				'/?/annuler',
				{ courseId: courseId as string, date: lundi, title: titre },
				cookie
			);
			expect(annule.status).toBe(200);
			// Le message de l'action seul : la page qui le porte montre aussi celui de la semaine,
			// qui contient déjà la formule et ferait passer l'assertion sans rien prouver.
			expect(messageACopier(await annule.text())).toMatch(new RegExp(`^${organisation.accueil}`));
			const suivant = decalerDe(lundi, 7);
			const deplace = await postForm(
				'/?/deplacer',
				{
					courseId: courseId as string,
					date: suivant,
					toDate: decalerDe(suivant, 1),
					toStart: '18:00',
					title: titre
				},
				cookie
			);
			expect(deplace.status).toBe(200);
			expect(messageACopier(await deplace.text())).toMatch(new RegExp(`^${organisation.accueil}`));
		}
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

	it('puts a pause on the whole organisation, and records it', async () => {
		const cookie = await signIn('responsable@example.test');
		const posee = await postForm(
			'/cours?/pause',
			{ from: '2026-12-21', to: '2027-01-03', reason: 'vacances', courseId: '' },
			cookie
		);
		expect(posee.status).toBe(200);
		const page = await fetch(`${origin}/cours`, { headers: { cookie } });
		expect(await page.text()).toContain('Toute l’organisation');

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
			// Acceptées d'avance : ce test éprouve le rôle, pas la porte des conditions.
			await tx.execute(conditionsAcceptees(organizationId, editeur));
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
				values (${voisine}, ${`voisine-${Date.now().toString(36)}`}, 'Association d’à côté',
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
		// Et le cadre posé à la main, pour un site qui refuse les scripts extérieurs. Son titre est lu
		// par les lecteurs d'écran sur le site de l'organisation : un tiret demi-cadratin, pas de
		// cadratin (`pnpm style`).
		expect(html).toContain('&lt;iframe src=');
		const cadre = html.match(/aria-label="Cadre à coller à la main"[^>]*>([^<]*)</)?.[1] ?? '';
		expect(cadre).toMatch(/title=(?:"|&quot;)Programme des cours – /);
		expect(cadre).not.toContain('—');
	});

	it('saves the settings, including the greeting the messages open with', async () => {
		const cookie = await signIn('responsable@example.test');
		const enregistre = await postForm(
			'/reglages?/enregistrer',
			{
				name: 'Association d’essai',
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
				name: 'Association d’essai',
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

describe('le module des heures de prière', () => {
	// Une organisation à elle seule, et une personne responsable qui n'appartient qu'à elle.
	//
	// L'organisation d'essai du fichier ne peut pas servir : d'autres tests y laissent des cours
	// ancrés sur une prière, et la base refuse alors d'éteindre le module — ce qui est exactement ce
	// qu'elle doit faire. Éprouver l'extinction demande donc un endroit où rien ne s'y appuie.
	let moduleOrgId: string;
	let moduleCookie: string;

	beforeAll(async () => {
		moduleOrgId = newId();
		const responsable = newId();
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
					"enabled_language")
				values (${moduleOrgId}, 'acces-module', 'Association du module', 'Europe/Zurich', 'fr',
					array['fr'])
			`);
			await tx.execute(sql`
				insert into "user" ("id", "email", "name", "email_verified")
				values (${responsable}, 'module@example.test', 'Responsable du module', true)
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${moduleOrgId}, ${responsable}, 'org_admin')
			`);
			await tx.execute(conditionsAcceptees(moduleOrgId, responsable));
		});
		moduleCookie = await signIn('module@example.test');
	});

	/** Pose l'interrupteur directement en base : l'état de départ n'est pas ce que le test éprouve. */
	async function poserModule(allume: boolean): Promise<void> {
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`
				update "organization" set "prayer_module" = ${allume} where "id" = ${moduleOrgId}
			`);
		});
	}

	async function moduleAllume(): Promise<boolean> {
		return ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			const result = await tx.execute(sql`
				select "prayer_module" from "organization" where "id" = ${moduleOrgId}
			`);
			const brut: unknown = Array.isArray(result)
				? result
				: ((result as { rows?: unknown[] }).rows ?? []);
			const lignes = brut as { prayer_module: boolean }[];
			return lignes[0]?.prayer_module ?? false;
		});
	}

	/** Les trois adresses du module : ses deux écrans et son modèle de fichier. */
	const ADRESSES = ['/prieres', '/vendredi', '/prieres/modele.csv'];

	it('répond 404 sur chacune de ses adresses quand il est éteint', async () => {
		await poserModule(false);
		for (const adresse of ADRESSES) {
			const page = await fetch(`${origin}${adresse}`, {
				headers: { cookie: moduleCookie },
				redirect: 'manual'
			});
			expect(page.status, adresse).toBe(404);
		}
	});

	it('les ouvre toutes quand il est allumé', async () => {
		await poserModule(true);
		for (const adresse of ADRESSES) {
			const page = await fetch(`${origin}${adresse}`, {
				headers: { cookie: moduleCookie },
				redirect: 'manual'
			});
			expect(page.status, adresse).toBe(200);
		}
	});

	it('refuse aussi ses actions, et pas seulement ses pages', async () => {
		await poserModule(false);
		// Une action d'écriture, envoyée à la main : l'écran qui la porte n'existe pas, mais rien
		// n'empêche de poster à son adresse.
		// `enregistrer` est une vraie action de cet écran : un nom inventé rendrait 404 tout seul,
		// et le test passerait sans rien prouver. Mesuré : avec un nom inventé, il passait même le
		// contrôle du module retiré.
		const envoi = await postForm(
			'/vendredi?/enregistrer',
			{ jumuaOrder: '1', start: '12:10', end: '13:00', startsOn: '2026-09-04' },
			moduleCookie
		);
		expect(envoi.status).toBe(404);
	});

	it('disparaît de la navigation quand il est éteint, et revient quand il est allumé', async () => {
		await poserModule(false);
		const eteint = await (
			await fetch(`${origin}/cours`, { headers: { cookie: moduleCookie } })
		).text();
		expect(eteint).not.toContain('>Prières<');
		expect(eteint).not.toContain('>Vendredi<');

		await poserModule(true);
		const allume = await (
			await fetch(`${origin}/cours`, { headers: { cookie: moduleCookie } })
		).text();
		expect(allume).toContain('>Prières<');
		expect(allume).toContain('>Vendredi<');
	});

	it('ne propose pas l’ancrage sur une prière dans le formulaire d’un cours', async () => {
		await poserModule(false);
		const eteint = await (
			await fetch(`${origin}/cours/nouveau`, { headers: { cookie: moduleCookie } })
		).text();
		expect(eteint).not.toContain('après une prière');

		await poserModule(true);
		const allume = await (
			await fetch(`${origin}/cours/nouveau`, { headers: { cookie: moduleCookie } })
		).text();
		expect(allume).toContain('après une prière');
	});

	it('s’allume et s’éteint depuis les réglages', async () => {
		await poserModule(false);
		expect(
			(await postForm('/reglages?/modulePrieres', { allume: 'oui' }, moduleCookie)).status
		).toBe(200);
		expect(await moduleAllume()).toBe(true);

		expect(
			(await postForm('/reglages?/modulePrieres', { allume: 'non' }, moduleCookie)).status
		).toBe(200);
		expect(await moduleAllume()).toBe(false);
	});

	it('refuse de s’éteindre tant qu’une prière du vendredi existe', async () => {
		await poserModule(true);
		const session = newId();
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`
				insert into "course" (
					"id", "organization_id", "kind", "jumua_order", "status", "audience",
					"teaching_language", "source_language", "recurrence_kind", "recurrence_weekday",
					"recurrence_interval", "recurrence_anchor_date", "timing_kind", "timing_start",
					"timing_end", "starts_on"
				) values (
					${session}, ${moduleOrgId}, 'jumua', 1, 'published', 'open', array['fr'], 'fr',
					'weekly', array[5]::smallint[], 1, '2026-09-04', 'fixed', '12:10', '13:00', '2026-09-04'
				)
			`);
		});

		const refus = await postForm('/reglages?/modulePrieres', { allume: 'non' }, moduleCookie);
		expect(refus.status).toBe(409);
		expect(await moduleAllume()).toBe(true);

		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`delete from "course" where "id" = ${session}`);
		});
	});
});

// Le formulaire public de demande d'accès (étape 22, ADR 0049), contre un vrai serveur et une vraie
// base.
//
// Une organisation qui veut se servir de jadwal le demande sans compte, sans JavaScript, dans sa
// langue. La demande arrive en base et nulle part ailleurs : aucun courriel ne part à l'adresse
// saisie, et l'exploitant n'est prévenu que si l'instance le demande, sans rien de la demande. Une
// seconde demande pour la même adresse reçoit la même réponse, mot pour mot ; la surcharge se dit.

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';
import { accessRequestTexts } from '../src/lib/i18n/access-request.js';
import { commonTexts } from '../src/lib/i18n/common.js';
import { LANGUES, t, type Langue } from '../src/lib/i18n.js';

const origin = inject('origin');
const secondOrigin = inject('secondOrigin');
const proxiedOrigin = inject('proxiedOrigin');
const outbox = inject('outbox');
const operatorEmail = inject('operatorEmail');
const testDatabase = inject('testDatabase');

let ownerHandle: DatabaseHandle;

/** L'en-tête qu'un navigateur réglé dans chaque langue envoie. */
const NAVIGATEUR: Record<Langue, string> = {
	fr: 'fr-CH,fr;q=0.9',
	de: 'de-CH,de;q=0.9',
	it: 'it-CH,it;q=0.9',
	en: 'en-GB,en;q=0.9',
	ar: 'ar-MA,ar;q=0.9'
};

/** Un navigateur ordinaire : le service ne regarde pas l'agent, mais il n'a pas à voir un robot. */
const AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36';

interface RecordedEmail {
	to: string;
	subject: string;
	text: string;
	html: string;
}

async function outboxMails(): Promise<RecordedEmail[]> {
	const names = (await readdir(outbox)).filter((name) => name.endsWith('.json')).sort();
	return names.map((name) => JSON.parse(readFileSync(join(outbox, name), 'utf8')) as RecordedEmail);
}

/** Les courriels écrits pendant `run`, et eux seuls. */
async function mailsDuring(run: () => Promise<unknown>): Promise<RecordedEmail[]> {
	const before = (await outboxMails()).length;
	await run();
	return (await outboxMails()).slice(before);
}

interface Envoi {
	langue?: Langue;
	base?: string;
	adresseIp?: string;
}

/** Poste le formulaire comme un navigateur sans JavaScript : encodage de formulaire et origine. */
async function envoyer(fields: Record<string, string>, envoi: Envoi = {}): Promise<Response> {
	const base = envoi.base ?? origin;
	return fetch(`${base}/demande-d-acces`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			// Un navigateur sans JavaScript demande du HTML, et reçoit le vrai code de la réponse.
			accept: 'text/html',
			'accept-language': NAVIGATEUR[envoi.langue ?? 'fr'],
			'user-agent': AGENT,
			origin: base,
			...(envoi.adresseIp ? { 'x-forwarded-for': envoi.adresseIp } : {})
		},
		body: new URLSearchParams(fields).toString()
	});
}

async function lire(path: string, langue: Langue = 'fr', cookie?: string): Promise<Response> {
	return fetch(`${origin}${path}`, {
		redirect: 'manual',
		headers: {
			'accept-language': NAVIGATEUR[langue],
			'user-agent': AGENT,
			...(cookie ? { cookie } : {})
		}
	});
}

function demande(overrides: Record<string, string> = {}): Record<string, string> {
	return {
		organization: 'Association culturelle de Bienne',
		locality: 'Bienne',
		contact: 'Une Personne',
		email: 'demande@example.org',
		message: 'Nous aimerions publier nos cours du samedi.',
		...overrides
	};
}

/** Ce que l'écran affiche, entités décodées, sans balises : ce qu'une personne lit. */
function texte(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/g, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replaceAll('&amp;', '&')
		.replaceAll('&#39;', "'")
		.replaceAll('&quot;', '"')
		.replaceAll(/\s+/g, ' ');
}

/** Un texte à chercher tel quel dans une expression régulière. */
function re(value: string): string {
	return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Les liens d'une page, chacun avec le chemin où il mène et son texte. SvelteKit rend des liens
 * relatifs (`./conditions`) : ils sont résolus contre l'adresse de la page, comme un navigateur.
 */
function liens(html: string, page: string): { path: string; text: string }[] {
	return [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((trouve) => ({
		path: new URL(trouve[1] ?? '', `${origin}${page}`).pathname,
		text: texte(trouve[2] ?? '').trim()
	}));
}

/** La page, sans le nonce que SvelteKit change à chaque rendu. */
function sansNonce(html: string): string {
	return html.replaceAll(/nonce="[^"]*"/g, 'nonce="…"');
}

interface Ligne {
	organization_name: string;
	locality: string;
	contact_name: string;
	email: string;
	message: string | null;
	language: string;
	status: string;
}

async function demandes(): Promise<Ligne[]> {
	return ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		return (await tx.execute(sql`
			select "organization_name", "locality", "contact_name", "email", "message", "language",
				"status"
			from "access_request" order by "created_at", "id"
		`)) as unknown as Ligne[];
	});
}

async function compterLesSeaux(): Promise<number> {
	return ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		const rows = (await tx.execute(
			sql`select count(*)::int as n from "rate_limit"`
		)) as unknown as { n: number }[];
		return rows[0]?.n ?? 0;
	});
}

beforeAll(() => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
});

afterAll(async () => {
	await ownerHandle?.close();
});

/**
 * Chaque essai part de rien : ni demande, ni seau de débit. Le budget par adresse IP est vrai, et il
 * est éprouvé plus bas ; ailleurs, il n'aurait rien à prouver.
 */
beforeEach(async () => {
	await ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		await tx.execute(sql`delete from "access_request"`);
		await tx.execute(sql`delete from "rate_limit"`);
	});
});

describe('la page de demande d’accès', () => {
	it.each(LANGUES)(
		'shows its form in %s, says what happens to the data, with no French left',
		async (langue) => {
			const mots = accessRequestTexts[langue];
			const reponse = await lire('/demande-d-acces', langue);
			expect(reponse.status).toBe(200);
			const html = await reponse.text();
			const lu = texte(html);
			expect(html).toContain(`<title>${mots.title} | jadwal</title>`);
			for (const phrase of [
				mots.intro,
				mots.outcome,
				mots.member,
				mots.organizationLabel,
				mots.localityLabel,
				mots.contactLabel,
				mots.emailLabel,
				mots.messageLabel,
				mots.privacyTitle,
				mots.privacy,
				mots.submit
			]) {
				expect(lu, phrase).toContain(phrase);
			}
			// Le formulaire part sans JavaScript, et chaque champ porte la borne de la table.
			expect(html).toMatch(/<form method="post"/);
			expect(html).toMatch(/name="organization"[^>]*maxlength="120"/);
			expect(html).toMatch(/name="email"[^>]*maxlength="254"/);
			expect(html).toMatch(/name="message"[^>]*maxlength="1000"/);
			expect(liens(html, '/demande-d-acces')).toContainEqual({
				path: '/conditions',
				text: t(langue).terms
			});
			if (langue !== 'fr') {
				expect(lu).not.toContain(accessRequestTexts.fr.intro);
				expect(lu).not.toContain(accessRequestTexts.fr.submit);
			}
		}
	);
});

describe('déposer une demande', () => {
	it.each(LANGUES)(
		'records a request made in %s, in that language, and writes to no one',
		async (langue) => {
			let reponse: Response | undefined;
			const ecrits = await mailsDuring(async () => {
				reponse = await envoyer(demande({ email: `demande-${langue}@example.org` }), { langue });
			});
			expect(reponse?.status).toBe(200);
			const lu = texte(await (reponse as Response).text());
			expect(lu).toContain(accessRequestTexts[langue].sent);
			expect(lu).toContain(accessRequestTexts[langue].sentHint);

			expect(await demandes()).toEqual([
				{
					organization_name: 'Association culturelle de Bienne',
					locality: 'Bienne',
					contact_name: 'Une Personne',
					email: `demande-${langue}@example.org`,
					message: 'Nous aimerions publier nos cours du samedi.',
					language: langue,
					status: 'pending'
				}
			]);
			// Ni à l'adresse saisie, ni à l'exploitant : cette instance ne pose pas la variable.
			expect(ecrits).toEqual([]);
		}
	);

	it('keeps an empty message as no message at all', async () => {
		expect((await envoyer(demande({ message: '   ' }))).status).toBe(200);
		expect((await demandes()).map((l) => l.message)).toEqual([null]);
	});

	it('tells the operator a request is waiting, with nothing of the request, when the instance asks', async () => {
		let reponse: Response | undefined;
		const ecrits = await mailsDuring(async () => {
			reponse = await envoyer(demande(), { base: secondOrigin });
		});
		expect(reponse?.status).toBe(200);
		expect(ecrits.map((mail) => mail.to)).toEqual([operatorEmail]);
		const [avis] = ecrits as [RecordedEmail];
		expect(avis.subject).toBe('jadwal : une demande d’accès attend');
		expect(avis.text).toContain(`${secondOrigin}/super-admin`);
		expect(avis.html).toContain(`href="${secondOrigin}/super-admin"`);
		for (const donnee of [
			'Association culturelle',
			'Bienne',
			'Une Personne',
			'demande@example.org',
			'samedi'
		]) {
			expect(avis.text).not.toContain(donnee);
			expect(avis.html).not.toContain(donnee);
		}
	});

	it('answers a second request for the same address exactly as the first, keeps one, and tells the operator once', async () => {
		const ecrits = await mailsDuring(async () => {
			const premiere = await envoyer(demande(), { base: secondOrigin });
			const seconde = await envoyer(
				demande({ email: 'DEMANDE@Example.org', organization: 'Une autre association' }),
				{ base: secondOrigin }
			);
			expect(premiere.status).toBe(200);
			expect(seconde.status).toBe(200);
			expect(sansNonce(await seconde.text())).toBe(sansNonce(await premiere.text()));
		});
		expect((await demandes()).map((l) => l.organization_name)).toEqual([
			'Association culturelle de Bienne'
		]);
		expect(ecrits.map((mail) => mail.to)).toEqual([operatorEmail]);
	});
});

describe('une saisie refusée', () => {
	it('records nothing, spends nothing, says which field and why, and gives back what was typed', async () => {
		const reponse = await envoyer(
			demande({ organization: '  ', email: 'pas-une-adresse', message: 'x'.repeat(1001) })
		);
		expect(reponse.status).toBe(400);
		const html = await reponse.text();
		const mots = accessRequestTexts.fr;
		expect(html).toMatch(new RegExp(`role="alert"[^>]*>${re(mots.errorSummary)}<`));
		expect(html).toMatch(new RegExp(`id="organization-erreur"[^>]*>${re(mots.errors.required)}<`));
		expect(html).toMatch(
			new RegExp(`id="email-erreur"[^>]*>${re(commonTexts.fr.errors.invalidEmail)}<`)
		);
		expect(html).toMatch(
			new RegExp(`id="message-erreur"[^>]*>\\s*${re(mots.errors.tooLong)}\\s*<`)
		);
		expect(html).toMatch(
			/id="organization"[^>]*aria-describedby="organization-aide organization-erreur"/
		);
		expect(html).toMatch(/id="organization"[^>]*aria-invalid="true"/);
		// Ce qui était acceptable revient tel quel ; la localité n'a pas d'erreur.
		expect(html).toMatch(/id="locality"[^>]*value="Bienne"/);
		expect(html).toMatch(/id="email"[^>]*value="pas-une-adresse"/);
		expect(html).not.toContain('id="locality-erreur"');

		expect(await demandes()).toEqual([]);
		expect(await compterLesSeaux()).toBe(0);
	});

	it.each(LANGUES)('says what is wrong in %s', async (langue) => {
		const html = await (await envoyer(demande({ contact: '' }), { langue })).text();
		const mots = accessRequestTexts[langue];
		expect(texte(html)).toContain(mots.errorSummary);
		expect(texte(html)).toContain(mots.errors.required);
	});
});

describe('la surcharge', () => {
	it('stops a fourth request from the same address within the hour, and says so about no one', async () => {
		for (let n = 1; n <= 3; n += 1) {
			const reponse = await envoyer(demande({ email: `ip-${n}@example.org` }), {
				base: proxiedOrigin,
				adresseIp: '203.0.113.9'
			});
			expect(reponse.status).toBe(200);
		}
		const quatrieme = await envoyer(demande({ email: 'ip-4@example.org' }), {
			base: proxiedOrigin,
			adresseIp: '203.0.113.9'
		});
		expect(quatrieme.status).toBe(429);
		const lu = texte(await quatrieme.text());
		expect(lu).toContain(accessRequestTexts.fr.tooMany);
		expect(lu).not.toContain(accessRequestTexts.fr.sent);

		// Une autre adresse IP a son propre budget.
		const ailleurs = await envoyer(demande({ email: 'ip-5@example.org' }), {
			base: proxiedOrigin,
			adresseIp: '203.0.113.10'
		});
		expect(ailleurs.status).toBe(200);
		expect((await demandes()).map((l) => l.email)).toEqual([
			'ip-1@example.org',
			'ip-2@example.org',
			'ip-3@example.org',
			'ip-5@example.org'
		]);
	});

	it('stops at the ceiling of the whole service, and says so the same way', async () => {
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			for (let n = 0; n < 30; n += 1) {
				await tx.execute(sql`
					insert into "access_request" ("id", "organization_name", "locality", "contact_name",
						"email", "language")
					values (${newId()}, 'Association', 'Bienne', 'Une Personne',
						${`plafond-${n}@example.org`}, 'fr')
				`);
			}
		});
		const ecrits = await mailsDuring(async () => {
			const reponse = await envoyer(demande(), { base: secondOrigin, langue: 'it' });
			expect(reponse.status).toBe(429);
			expect(texte(await reponse.text())).toContain(accessRequestTexts.it.tooMany);
		});
		expect(await demandes()).toHaveLength(30);
		expect(ecrits).toEqual([]);
	});
});

describe('les chemins vers la page', () => {
	it.each(LANGUES)('are offered by the sign-in page in %s', async (langue) => {
		const html = await (await lire('/connexion', langue)).text();
		const { question, link } = accessRequestTexts[langue].elsewhere;
		expect(texte(html)).toContain(question);
		expect(liens(html, '/connexion')).toContainEqual({ path: '/demande-d-acces', text: link });
	});

	it('is offered to an account that belongs to no organisation', async () => {
		const email = `sans-organisation-${newId()}@example.org`;
		await ownerHandle.db.transaction(async (tx) => {
			await tx.execute(sql`set local jadwal.maintenance = 'on'`);
			await tx.execute(sql`insert into "user" ("id", "email") values (${newId()}, ${email})`);
		});
		const ecrits = await mailsDuring(() =>
			fetch(`${origin}/connexion`, {
				method: 'POST',
				redirect: 'manual',
				headers: {
					'content-type': 'application/x-www-form-urlencoded',
					accept: 'text/html',
					origin
				},
				body: new URLSearchParams({ email }).toString()
			})
		);
		const lien = ecrits.find((mail) => mail.to === email)?.text.match(/https?:\/\/\S+/)?.[0];
		expect(lien, 'aucun lien de connexion').toBeTruthy();
		const ouverture = await fetch(lien as string, { redirect: 'manual' });
		const cookie = (ouverture.headers.getSetCookie?.() ?? [])
			.find((value) => value.startsWith('better-auth.session_token='))
			?.split(';')[0];
		expect(cookie, 'aucune session').toBeTruthy();

		const html = await (await lire('/organisations', 'fr', cookie)).text();
		const { question, link } = accessRequestTexts.fr.elsewhere;
		expect(texte(html)).toContain(question);
		expect(liens(html, '/organisations')).toContainEqual({ path: '/demande-d-acces', text: link });
	});
});

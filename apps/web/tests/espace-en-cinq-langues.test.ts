// L'espace des responsables en cinq langues (étape 18, retours D2, D3, D4, H2 et A3), servi par HTTP.
//
// La langue de l'espace : celle du compte pour une personne connectée ; sinon celle retenue sur ce
// navigateur, par le choix de la langue ; sinon la meilleure que le navigateur demande parmi les cinq ;
// sinon le français. Ce fichier éprouve ce qu'aucun test unitaire ne voit : le hook qui la calcule et
// l'écrit sur `<html>`, le formulaire du choix sans JavaScript, la langue qui devient celle du compte à
// la connexion, les courriels réellement écrits, et le texte de chaque écran du socle dans chaque
// langue. Vrai serveur construit, vraie base, formulaires envoyés comme sans JavaScript.

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';
import { conditionsAcceptees, VERSION_DES_CONDITIONS } from './conditions-acceptees.js';
import { frenchLeft, ISO_DATE, textSegments, visibleText } from './textes-lus.js';

const origin = inject('origin');
const outbox = inject('outbox');
const testDatabase = inject('testDatabase');

const LANGUES = ['fr', 'de', 'it', 'en', 'ar'] as const;
type Langue = (typeof LANGUES)[number];
const SENS: Record<Langue, 'ltr' | 'rtl'> = {
	fr: 'ltr',
	de: 'ltr',
	it: 'ltr',
	en: 'ltr',
	ar: 'rtl'
};
const COOKIE = 'jadwal_language';

const ORGANISATION = 'Association des cinq langues';
const INVITANTE = 'Association qui invite';
/** Responsable de l'organisation, conditions acceptées. Sa langue est choisie test après test. */
const RESPONSABLE = 'cinq-responsable@example.test';
/** Une seule organisation, conditions à accepter, et une invitation d'une autre qui court encore. */
const EN_ATTENTE = 'cinq-en-attente@example.test';
/** Une seule organisation, conditions à accepter, et une invitation échue hier. */
const ECHUE = 'cinq-echue@example.test';
/** Responsable qui invite, et dont le compte est en italien. */
const INVITEUR = 'cinq-inviteur@example.test';
/** Un compte existant, en arabe, que l'on invite : il reçoit la langue de qui invite (ADR 0017). */
const INVITE_EN_ARABE = 'cinq-arabe@example.test';
/** Des comptes sans organisation, pour la langue retenue à la connexion. */
const PAR_LE_COOKIE = 'cinq-cookie@example.test';
const PAR_LE_NAVIGATEUR = 'cinq-navigateur@example.test';
/** L'exploitant : sa bannière, dans l'organisation où il entre, est celle de la coquille. */
const EXPLOITANT = 'cinq-exploitant@example.test';

/** Ce qui est pareil dans toutes les langues par nature : noms, adresses, la marque. */
const PERMIS = [ORGANISATION, INVITANTE, RESPONSABLE, EN_ATTENTE, INVITEUR];

let ownerHandle: DatabaseHandle;
let organizationId: string;
let invitanteId: string;
const ids: Record<string, string> = {};

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

/** La langue enregistrée sur un compte, relevée par le propriétaire. */
async function langueDuCompte(email: string): Promise<string | null | undefined> {
	const trouve = await maintenance(async (tx) =>
		lignes<{ language: string | null }>(
			await tx.execute(sql`select "language" from "user" where "email" = ${email}`)
		)
	);
	return trouve[0]?.language;
}

async function poserLangueDuCompte(email: string, langue: Langue | null): Promise<void> {
	await maintenance((tx) =>
		tx.execute(sql`update "user" set "language" = ${langue} where "email" = ${email}`)
	);
}

interface Options {
	cookie?: string | undefined;
	navigateur?: string | undefined;
}

async function get(chemin: string, { cookie, navigateur }: Options = {}): Promise<Response> {
	return fetch(`${origin}${chemin}`, {
		redirect: 'manual',
		headers: {
			...(cookie ? { cookie } : {}),
			...(navigateur ? { 'accept-language': navigateur } : {})
		}
	});
}

/** Poste un formulaire comme un navigateur sans JavaScript : encodage de formulaire et origine. */
async function postForm(
	chemin: string,
	champs: Record<string, string>,
	{ cookie, navigateur }: Options = {},
	depuis: string = origin
): Promise<Response> {
	return fetch(`${origin}${chemin}`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			accept: 'text/html',
			origin: depuis,
			...(cookie ? { cookie } : {}),
			...(navigateur ? { 'accept-language': navigateur } : {})
		},
		body: new URLSearchParams(champs).toString()
	});
}

/** La balise `<html>` d'une page, et elle seule. */
function baliseHtml(html: string): string {
	return html.match(/<html\b[^>]*>/)?.[0] ?? '';
}

function titre(html: string): string {
	return (html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim();
}

interface Courriel {
	to: string;
	subject: string;
	text: string;
	html: string;
}

async function courriels(): Promise<Courriel[]> {
	const noms = (await readdir(outbox)).filter((nom) => nom.endsWith('.json')).sort();
	return noms.map((nom) => JSON.parse(readFileSync(join(outbox, nom), 'utf8')) as Courriel);
}

async function dernierCourrielA(email: string): Promise<Courriel | undefined> {
	return (await courriels()).filter((courriel) => courriel.to === email).at(-1);
}

/** Le cookie de langue que pose une réponse, s'il y en a un, avec ses attributs. */
function cookieDeLangue(reponse: Response): string | undefined {
	return (reponse.headers.getSetCookie?.() ?? []).find((valeur) => valeur.startsWith(`${COOKIE}=`));
}

/** Le cookie qui dit qu'un choix fait avant la connexion attend d'être donné au compte. */
function cookieEnAttente(reponse: Response): string | undefined {
	return (reponse.headers.getSetCookie?.() ?? []).find((valeur) =>
		valeur.startsWith(`${COOKIE}_pending=`)
	);
}

/**
 * Se connecte comme une personne le ferait depuis ce navigateur : le lien est demandé et suivi avec
 * le même cookie de langue, s'il y en a un. Rend les cookies à renvoyer ensuite, session comprise.
 */
async function signIn(email: string, cookieDeLangueDuNavigateur?: string): Promise<string> {
	await maintenance((tx) => tx.execute(sql`delete from "rate_limit"`));
	await postForm('/connexion', { email }, { cookie: cookieDeLangueDuNavigateur });
	const lien = (await dernierCourrielA(email))?.text.match(/https?:\/\/\S+/)?.[0];
	expect(lien, `aucun lien envoyé à ${email}`).toBeTruthy();
	const suivi = await fetch(lien as string, {
		redirect: 'manual',
		headers: cookieDeLangueDuNavigateur ? { cookie: cookieDeLangueDuNavigateur } : {}
	});
	const session = (suivi.headers.getSetCookie?.() ?? [])
		.find((valeur) => valeur.startsWith('better-auth.session_token='))
		?.split(';')[0];
	expect(session, `aucune session posée pour ${email}`).toBeTruthy();
	return [session, cookieDeLangueDuNavigateur].filter(Boolean).join('; ');
}

/** Le cookie de session seul, sans la langue du navigateur. */
function sessionSeule(cookies: string): string {
	return cookies.split('; ').find((cookie) => cookie.startsWith('better-auth.')) ?? '';
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	organizationId = newId();
	invitanteId = newId();
	for (const email of [
		RESPONSABLE,
		EN_ATTENTE,
		ECHUE,
		INVITEUR,
		INVITE_EN_ARABE,
		PAR_LE_COOKIE,
		PAR_LE_NAVIGATEUR,
		EXPLOITANT
	]) {
		ids[email] = newId();
	}
	await maintenance(async (tx) => {
		for (const [id, slug, nom] of [
			[organizationId, 'cinq-langues', ORGANISATION],
			[invitanteId, 'cinq-langues-invite', INVITANTE]
		] as const) {
			await tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
					"enabled_language", "prayer_module")
				values (${id}, ${slug}, ${nom}, 'Europe/Zurich', 'fr', array['fr','de','it','en','ar'],
					true)
			`);
		}
		for (const email of Object.keys(ids)) {
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified") values (${ids[email] ?? ''}, ${email}, true)
			`);
		}
		await tx.execute(sql`update "user" set "language" = 'ar' where "email" = ${INVITE_EN_ARABE}`);
		// Le drapeau d'exploitant est une colonne du compte, qu'aucune interface ne pose.
		await tx.execute(sql`update "user" set "is_super_admin" = true where "email" = ${EXPLOITANT}`);
		for (const [email, role] of [
			[RESPONSABLE, 'org_admin'],
			[EN_ATTENTE, 'editor'],
			[ECHUE, 'editor'],
			[INVITEUR, 'org_admin']
		] as const) {
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organizationId}, ${ids[email] ?? ''}, ${role})
			`);
		}
		await tx.execute(conditionsAcceptees(organizationId, ids[RESPONSABLE] ?? ''));
		await tx.execute(conditionsAcceptees(organizationId, ids[INVITEUR] ?? ''));
		// L'invitation qui court encore, et celle qui a échu hier. Les durées se comptent en heures,
		// comme la borne de la base (migration 0056).
		await tx.execute(sql`
			insert into "invitation" ("id", "organization_id", "email", "role", "expires_at")
			values (${newId()}, ${invitanteId}, ${EN_ATTENTE}, 'editor',
				now() + make_interval(hours => 7 * 24))
		`);
		await tx.execute(sql`
			insert into "invitation" ("id", "organization_id", "email", "role", "created_at",
				"expires_at")
			values (${newId()}, ${invitanteId}, ${ECHUE}, 'editor',
				now() - make_interval(hours => 10 * 24), now() - make_interval(hours => 24))
		`);
	});
});

afterAll(async () => {
	await ownerHandle?.close();
});

describe('la langue du premier passage', () => {
	it.each([
		['de-CH,de;q=0.9,fr;q=0.8', 'de', 'Anmelden'],
		['it-CH,it;q=0.9', 'it', 'Accedi'],
		['en-GB,en;q=0.9', 'en', 'Sign in'],
		['ar-MA,ar;q=0.9,fr;q=0.5', 'ar', 'تسجيل الدخول'],
		// Une langue que le service ne parle pas : le français.
		['es-ES,es;q=0.9', 'fr', 'Se connecter']
	] as const)(
		'serves the sign-in page to a browser asking for « %s » in %s',
		async (navigateur, langue, attendu) => {
			const reponse = await get('/connexion', { navigateur });
			expect(reponse.status).toBe(200);
			const html = await reponse.text();
			expect(baliseHtml(html)).toBe(`<html lang="${langue}" dir="${SENS[langue]}">`);
			expect(titre(html)).toBe(`${attendu} | jadwal`);
			// Le premier passage ne pose aucun cookie : seul un choix fait en pose un.
			expect(cookieDeLangue(reponse)).toBeUndefined();
			expect(cookieEnAttente(reponse)).toBeUndefined();
		}
	);
});

describe('le choix de la langue', () => {
	it('is a form on every screen of the socle, which works without JavaScript', async () => {
		for (const chemin of ['/connexion', '/conditions', '/deconnexion', '/nulle-part']) {
			const html = await (await get(chemin)).text();
			const formulaire =
				html.match(/<form\b[^>]*action="\/langue"[^>]*>[\s\S]*?<\/form>/)?.[0] ?? '';
			expect(formulaire, chemin).toMatch(/method="post"/);
			// Chaque langue écrite dans sa langue, et marquée comme telle pour les lecteurs d'écran.
			const boutons = [...formulaire.matchAll(/<button\b([^>]*)>\s*([^<]*?)\s*<\/button>/g)].map(
				(trouve) => ({
					valeur: trouve[1]?.match(/\bvalue="([^"]*)"/)?.[1],
					langue: trouve[1]?.match(/\blang="([^"]*)"/)?.[1],
					nom: trouve[2],
					actuelle: /aria-current="true"/.test(trouve[1] ?? '')
				})
			);
			expect(boutons, chemin).toEqual([
				{ valeur: 'fr', langue: 'fr', nom: 'Français', actuelle: true },
				{ valeur: 'de', langue: 'de', nom: 'Deutsch', actuelle: false },
				{ valeur: 'it', langue: 'it', nom: 'Italiano', actuelle: false },
				{ valeur: 'en', langue: 'en', nom: 'English', actuelle: false },
				{ valeur: 'ar', langue: 'ar', nom: 'العربية', actuelle: false }
			]);
			expect(formulaire, chemin).toMatch(/name="language"/);
			// Il revient sur l'écran d'où il part.
			expect(formulaire, chemin).toContain(`name="returnTo" value="${chemin}"`);
		}
	});

	it('keeps the choice on this browser before signing in, above what the browser asks', async () => {
		const reponse = await postForm('/langue', { language: 'it', returnTo: '/connexion' });
		expect(reponse.status).toBe(303);
		expect(reponse.headers.get('location')).toBe('/connexion');
		const pose = cookieDeLangue(reponse) ?? '';
		expect(pose).toMatch(/^jadwal_language=it;/);
		expect(pose).toMatch(/; Path=\//);
		expect(pose).toMatch(/; HttpOnly/i);
		expect(pose).toMatch(/; SameSite=Lax/i);
		expect(pose).toMatch(/; Max-Age=31536000/);
		// Fait avant la connexion, le choix attend d'être donné au compte : un second cookie le dit,
		// posé de la même façon, sans rien porter d'autre que sa présence, pour le temps d'un lien de
		// connexion seulement (quinze minutes).
		const enAttente = cookieEnAttente(reponse) ?? '';
		expect(enAttente).toMatch(/^jadwal_language_pending=1;/);
		expect(enAttente).toMatch(/; Path=\//);
		expect(enAttente).toMatch(/; HttpOnly/i);
		expect(enAttente).toMatch(/; SameSite=Lax/i);
		expect(enAttente).toMatch(/; Max-Age=900(;|$)/);

		const page = await get('/connexion', { cookie: `${COOKIE}=it`, navigateur: 'de-CH,de' });
		const html = await page.text();
		expect(baliseHtml(html)).toBe('<html lang="it" dir="ltr">');
		expect(titre(html)).toBe('Accedi | jadwal');
	});

	it('ignores a language it does not speak, and a return outside the service', async () => {
		const inconnue = await postForm('/langue', { language: 'es', returnTo: '/conditions' });
		expect(inconnue.status).toBe(303);
		expect(inconnue.headers.get('location')).toBe('/conditions');
		expect(cookieDeLangue(inconnue)).toBeUndefined();
		expect(cookieEnAttente(inconnue)).toBeUndefined();

		for (const ailleurs of ['https://ailleurs.example/', '//ailleurs.example/', '/\\ailleurs']) {
			const reponse = await postForm('/langue', { language: 'de', returnTo: ailleurs });
			expect(reponse.headers.get('location'), ailleurs).toBe('/');
		}
		// La langue demandée par l'adresse est retirée du retour, sans quoi elle défait le choix.
		const retour = await postForm('/langue', { language: 'fr', returnTo: '/conditions?lang=de' });
		expect(retour.headers.get('location')).toBe('/conditions');
	});

	it('refuses a choice posted from another site', async () => {
		const reponse = await postForm(
			'/langue',
			{ language: 'ar', returnTo: '/connexion' },
			{},
			'https://ailleurs.example'
		);
		expect(reponse.status).toBe(403);
		expect(cookieDeLangue(reponse)).toBeUndefined();
		expect(cookieEnAttente(reponse)).toBeUndefined();
	});
});

describe('la langue du compte', () => {
	it('becomes the language the person was seeing when she signs in: the one she chose', async () => {
		expect(await langueDuCompte(PAR_LE_COOKIE)).toBeNull();
		const cookies = await signIn(PAR_LE_COOKIE, `${COOKIE}=en`);
		const page = await get('/organisations', { cookie: cookies });
		expect(page.status).toBe(200);
		expect(baliseHtml(await page.text())).toBe('<html lang="en" dir="ltr">');
		expect(await langueDuCompte(PAR_LE_COOKIE)).toBe('en');

		// Retenue pour le compte : un autre navigateur, qui demande l'allemand, voit l'anglais.
		const ailleurs = await get('/organisations', {
			cookie: sessionSeule(cookies),
			navigateur: 'de-CH,de'
		});
		expect(baliseHtml(await ailleurs.text())).toBe('<html lang="en" dir="ltr">');
	});

	it('becomes the language of the browser when she never chose one', async () => {
		const cookies = await signIn(PAR_LE_NAVIGATEUR);
		const page = await get('/organisations', { cookie: cookies, navigateur: 'de-CH,de;q=0.9' });
		expect(baliseHtml(await page.text())).toBe('<html lang="de" dir="ltr">');
		expect(await langueDuCompte(PAR_LE_NAVIGATEUR)).toBe('de');
		const ensuite = await get('/organisations', { cookie: cookies, navigateur: 'ar' });
		expect(baliseHtml(await ensuite.text())).toBe('<html lang="de" dir="ltr">');
	});

	it('is changed by the choice of a signed-in person, and wins over the cookie', async () => {
		const cookies = await signIn(PAR_LE_COOKIE, `${COOKIE}=en`);
		const choix = await postForm(
			'/langue',
			{ language: 'ar', returnTo: '/organisations' },
			{ cookie: cookies }
		);
		expect(choix.status).toBe(303);
		expect(choix.headers.get('location')).toBe('/organisations');
		expect(await langueDuCompte(PAR_LE_COOKIE)).toBe('ar');
		// Le cookie suit, pour que l'écran de connexion garde la langue après la déconnexion. Le compte
		// a déjà le choix : rien n'attend d'y être donné.
		expect(cookieDeLangue(choix)).toMatch(/^jadwal_language=ar;/);
		expect(cookieEnAttente(choix)).toBeUndefined();

		// L'ancien cookie du navigateur, resté à l'anglais, ne l'emporte pas sur le compte.
		const page = await get('/organisations', { cookie: `${sessionSeule(cookies)}; ${COOKIE}=it` });
		const html = await page.text();
		expect(baliseHtml(html)).toBe('<html lang="ar" dir="rtl">');
		expect(titre(html)).toBe('مؤسساتك | jadwal');
	});
});

/**
 * Les écrans du socle, et comment les atteindre dans une langue : avant la connexion par le cookie
 * du choix, après par la langue du compte.
 */
const ECRANS = [
	{ chemin: '/connexion', qui: null, statut: 200 },
	{ chemin: '/conditions', qui: null, statut: 200 },
	{ chemin: '/deconnexion', qui: null, statut: 200 },
	{ chemin: '/nulle-part', qui: null, statut: 404 },
	{ chemin: '/organisations', qui: RESPONSABLE, statut: 200 },
	{ chemin: '/conditions/accepter', qui: EN_ATTENTE, statut: 200 },
	{ chemin: '/une-adresse-inconnue', qui: RESPONSABLE, statut: 404 }
] as const;

describe('chaque écran du socle, dans les cinq langues', () => {
	const sessions: Record<string, string> = {};
	/** Chaque écran, rendu dans chaque langue. */
	const rendus: Record<string, Record<Langue, string>> = {};

	beforeAll(async () => {
		for (const email of [RESPONSABLE, EN_ATTENTE]) sessions[email] = await signIn(email);
		for (const langue of LANGUES) {
			for (const email of [RESPONSABLE, EN_ATTENTE]) await poserLangueDuCompte(email, langue);
			for (const { chemin, qui, statut } of ECRANS) {
				const reponse = qui
					? await get(chemin, { cookie: sessions[qui] })
					: await get(chemin, { cookie: `${COOKIE}=${langue}` });
				expect(reponse.status, `${chemin} en ${langue}`).toBe(statut);
				(rendus[chemin] ??= {} as Record<Langue, string>)[langue] = await reponse.text();
			}
		}
	});

	it.each(ECRANS.flatMap((ecran) => LANGUES.map((langue) => ({ ...ecran, langue }))))(
		'serves $chemin with <html lang="$langue">',
		({ chemin, langue }) => {
			const html = rendus[chemin]?.[langue] ?? '';
			expect(html.match(/<html\b[^>]*>/g)).toEqual([
				`<html lang="${langue}" dir="${SENS[langue]}">`
			]);
		}
	);

	it.each(ECRANS.flatMap((ecran) => LANGUES.slice(1).map((langue) => ({ ...ecran, langue }))))(
		'leaves no French sentence on $chemin in $langue',
		({ chemin, langue }) => {
			const francais = rendus[chemin]?.fr ?? '';
			const autre = rendus[chemin]?.[langue] ?? '';
			// Sans texte, une comparaison vide passerait pour une traduction complète.
			expect(textSegments(francais).size, chemin).toBeGreaterThan(8);
			expect(frenchLeft(francais, autre, PERMIS)).toEqual([]);
			expect(titre(autre)).not.toBe(titre(francais));
		}
	);

	it.each(ECRANS.flatMap((ecran) => LANGUES.map((langue) => ({ ...ecran, langue }))))(
		'writes no date as AAAA-MM-JJ on $chemin in $langue',
		({ chemin, langue }) => {
			const lu = visibleText(rendus[chemin]?.[langue] ?? '');
			expect(lu.match(ISO_DATE)?.[0] ?? null).toBeNull();
		}
	);

	it('dates the version of the terms JJ.MM.AAAA in each language', () => {
		const [annee, mois, jour] = VERSION_DES_CONDITIONS.split('-');
		const date = `${jour}.${mois}.${annee}`;
		expect(
			LANGUES.map((langue) => visibleText(rendus['/conditions/accepter']?.[langue] ?? ''))
		).toEqual(
			LANGUES.map((langue) =>
				expect.stringContaining(
					{
						fr: `Version du ${date}`,
						de: `Version vom ${date}`,
						it: `Versione del ${date}`,
						en: `Version dated ${date}`,
						ar: `الإصدار بتاريخ ${date}`
					}[langue]
				)
			)
		);
	});

	it('writes the date of the terms one way only, JJ.MM.AAAA, in the text of the terms too', () => {
		// L'écran d'acceptation dit la version, puis montre le texte, qui dit sa date de mise à jour :
		// une personne lit deux fois la même date, et doit la lire deux fois de la même façon (A3).
		const [annee, mois, jour] = VERSION_DES_CONDITIONS.split('-');
		const date = `${jour}\\.${mois}\\.${annee}`;
		const enLettres =
			/\d{1,2}(?:er)?\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4}/i;
		for (const chemin of ['/conditions', '/conditions/accepter']) {
			for (const langue of LANGUES) {
				const lu = visibleText(rendus[chemin]?.[langue] ?? '');
				expect(lu.match(enLettres)?.[0] ?? null, `${chemin} ${langue}`).toBeNull();
				expect(lu, `${chemin} ${langue}`).toMatch(
					new RegExp(`Dernière mise à jour\\s*:\\s*${date}\\.`)
				);
			}
		}
	});

	it('names the page not found in each language, with a way back', () => {
		const titres = {
			fr: 'Page introuvable',
			de: 'Seite nicht gefunden',
			it: 'Pagina non trovata',
			en: 'Page not found',
			ar: 'الصفحة غير موجودة'
		};
		for (const langue of LANGUES) {
			for (const chemin of ['/nulle-part', '/une-adresse-inconnue']) {
				const html = rendus[chemin]?.[langue] ?? '';
				expect(titre(html), `${chemin} ${langue}`).toBe(`${titres[langue]} | jadwal`);
				expect(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.trim()).toBe(titres[langue]);
				expect(html).toMatch(/<a\b[^>]*href="[^"]*"[^>]*>[^<]+<\/a>/);
			}
		}
	});

	it('translates the header of a screen of the space, whose body the next lot takes over', async () => {
		// L'en-tête, la navigation et le pied sont ceux de la coquille, dans toutes les pages ; le
		// corps de « Cours » est repris au lot suivant.
		const enTetes: Record<string, string> = {};
		for (const langue of LANGUES) {
			await poserLangueDuCompte(RESPONSABLE, langue);
			const html = await (await get('/cours', { cookie: sessions[RESPONSABLE] })).text();
			expect(baliseHtml(html)).toBe(`<html lang="${langue}" dir="${SENS[langue]}">`);
			const tete = html.match(/<header\b[\s\S]*?<\/header>/)?.[0] ?? '';
			const pied = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? '';
			enTetes[langue] = `<body>${tete}${pied}</body>`;
		}
		expect(enTetes['fr']).toContain('Heures de prière');
		expect(enTetes['fr']).toContain('Prière du vendredi');
		for (const langue of LANGUES.slice(1)) {
			expect(frenchLeft(enTetes['fr'] ?? '', enTetes[langue] ?? '', PERMIS), langue).toEqual([]);
			// Un mot seul, comme « Cours », ne passe pas par le filtre des phrases : il est cherché ici.
			const morceaux = textSegments(enTetes[langue] ?? '');
			for (const mot of ['Cours', 'Partager', 'Membres', 'Réglages', 'Langue']) {
				expect(morceaux.has(mot), `${langue} : ${mot}`).toBe(false);
			}
		}
	});
});

describe('les conditions, qui restent en français (retour D4)', () => {
	const NOTE: Record<Exclude<Langue, 'fr'>, string> = {
		de: 'Diesen Text gibt es vorerst nur auf Französisch.',
		it: 'Per ora questo testo esiste solo in francese.',
		en: 'For now, this text only exists in French.',
		ar: 'هذا النص متوفر بالفرنسية فقط في الوقت الحالي.'
	};

	/** Le premier paragraphe du contenu de la page, avant le texte des conditions. */
	function tete(html: string): string {
		const principal = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
		return (principal.split(/<div\b[^>]*\blang="fr"/)[0] ?? '')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	it('says nothing more in French', async () => {
		const html = await (await get('/conditions')).text();
		expect(tete(html)).toBe('');
		expect(html).toContain('<h1>Conditions d’utilisation</h1>');
	});

	it.each(Object.entries(NOTE))(
		'says first, in %s, that the text exists only in French',
		async (langue, note) => {
			const html = await (await get('/conditions', { cookie: `${COOKIE}=${langue}` })).text();
			expect(tete(html)).toBe(note);
			// Le texte lui-même est marqué comme français, et de gauche à droite dans une page arabe.
			expect(html).toMatch(
				/<div\b[^>]*\blang="fr" dir="ltr"[^>]*>[\s\S]*<h1>Conditions d’utilisation<\/h1>/
			);
		}
	);

	it('speaks the language asked by the address, as the footer of a public page asks', async () => {
		const html = await (await get('/conditions?lang=de', { cookie: `${COOKIE}=ar` })).text();
		expect(baliseHtml(html)).toBe('<html lang="de" dir="ltr">');
		expect(tete(html)).toBe(NOTE.de);
	});

	it('is linked from the footer of a public page in the language of that page', async () => {
		for (const langue of LANGUES) {
			const chemin = langue === 'fr' ? '/m/cinq-langues' : `/m/cinq-langues/${langue}`;
			const html = await (await get(chemin)).text();
			const pied = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? '';
			const liens = [...pied.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map(
				(trouve) => new URL((trouve[1] ?? '').replaceAll('&amp;', '&'), `${origin}${chemin}`)
			);
			const conditions = liens.filter((lien) => lien.pathname === '/conditions');
			expect(
				conditions.map((lien) => lien.searchParams.get('lang')),
				chemin
			).toEqual([langue]);
		}
	});

	it('says it in the acceptance screen too, in the language of the account', async () => {
		const cookies = await signIn(EN_ATTENTE);
		await poserLangueDuCompte(EN_ATTENTE, 'it');
		const html = await (await get('/conditions/accepter', { cookie: cookies })).text();
		expect(visibleText(html)).toContain(NOTE.it);
		expect(html).toMatch(/<button type="submit"[^>]*>Accetto le condizioni d’uso<\/button>/);
	});
});

describe('l’écran d’acceptation propose une autre organisation (retour H2)', () => {
	const AUTRE: Record<Langue, string> = {
		fr: 'Choisir une autre organisation',
		de: 'Andere Organisation wählen',
		it: 'Scegli un’altra organizzazione',
		en: 'Choose another organisation',
		ar: 'اختيار مؤسسة أخرى'
	};

	/** Les liens de la page vers le choix de l'organisation, par leur texte. */
	function versLeChoix(html: string): string[] {
		return [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
			.filter(
				(trouve) =>
					new URL((trouve[1] ?? '').replaceAll('&amp;', '&'), `${origin}/conditions/accepter`)
						.pathname === '/organisations'
			)
			.map((trouve) => (trouve[2] ?? '').replace(/<[^>]+>/g, '').trim());
	}

	it('to someone with one organisation and an invitation that still runs, as the navigation does', async () => {
		const cookies = await signIn(EN_ATTENTE);
		for (const langue of LANGUES) {
			await poserLangueDuCompte(EN_ATTENTE, langue);
			const reponse = await get('/conditions/accepter', { cookie: cookies });
			expect(reponse.status).toBe(200);
			expect(versLeChoix(await reponse.text()), langue).toEqual([AUTRE[langue]]);
		}
		// Et l'écran du choix propose bien cette invitation.
		const choix = await (await get('/organisations', { cookie: cookies })).text();
		expect(choix).toContain(INVITANTE);
		expect(choix).toMatch(/name="invitationId" value="[^"]+"/);
	});

	it('not for an invitation that has run out, which the choice screen omits too', async () => {
		const cookies = await signIn(ECHUE);
		await poserLangueDuCompte(ECHUE, 'fr');
		const reponse = await get('/conditions/accepter', { cookie: cookies });
		expect(reponse.status).toBe(200);
		const html = await reponse.text();
		expect(html).toContain(ORGANISATION);
		expect(versLeChoix(html)).toEqual([]);
	});
});

describe('les courriels (retour D3)', () => {
	it('sends the sign-in link in the language of the screen it was asked from', async () => {
		const cas = [
			{
				email: 'cinq-lien-de@example.test',
				options: { navigateur: 'de-CH,de' },
				sujet: 'Ihr Anmeldelink für jadwal',
				langue: 'de'
			},
			{
				email: 'cinq-lien-ar@example.test',
				options: { cookie: `${COOKIE}=ar` },
				sujet: 'رابط الدخول إلى jadwal',
				langue: 'ar'
			},
			{
				email: 'cinq-lien-fr@example.test',
				options: {},
				sujet: 'Votre lien de connexion à jadwal',
				langue: 'fr'
			}
		] as const;
		for (const { email, options, sujet, langue } of cas) {
			await maintenance((tx) => tx.execute(sql`delete from "rate_limit"`));
			const reponse = await postForm('/connexion', { email }, options);
			expect(reponse.status).toBe(200);
			const courriel = await dernierCourrielA(email);
			expect(courriel?.subject, email).toBe(sujet);
			expect(courriel?.html, email).toContain(`<html lang="${langue}" dir="${SENS[langue]}">`);
			// Et l'écran qui répond parle la même langue que le courriel.
			expect(baliseHtml(await reponse.text())).toBe(
				`<html lang="${langue}" dir="${SENS[langue]}">`
			);
		}
	});

	it('sends an invitation in the language of the person who invites, known account or not', async () => {
		await poserLangueDuCompte(INVITEUR, 'it');
		const cookies = await signIn(INVITEUR);
		const inconnue = 'cinq-inconnue@example.test';
		const reponses = [];
		for (const email of [inconnue, INVITE_EN_ARABE]) {
			const reponse = await postForm(
				'/membres?/inviter',
				{ email, role: 'editor' },
				{ cookie: cookies }
			);
			expect(reponse.status, email).toBe(200);
			reponses.push(await reponse.text());
		}
		const [versInconnue, versCompte] = await Promise.all([
			dernierCourrielA(inconnue),
			dernierCourrielA(INVITE_EN_ARABE)
		]);
		expect(versInconnue?.subject).toBe(`Invito a unirti a ${ORGANISATION} su jadwal`);
		// Le compte existe et parle arabe, mais rien ne le lit : le courriel est le même, mot pour mot,
		// que pour une adresse inconnue (ADR 0017). Voir les écarts du rapport de l'étape 18.
		expect(versCompte?.subject).toBe(versInconnue?.subject);
		expect(versCompte?.text).toBe(versInconnue?.text);
		expect(versCompte?.html).toBe(versInconnue?.html);
	});
});

describe('les écrans du super-admin', () => {
	/**
	 * La preuve qu'une passkey donnerait à la session, comme dans `acces.test.ts` : la cérémonie
	 * WebAuthn n'existe que dans un navigateur, la règle, elle, est celle du serveur.
	 */
	async function preuvePasskey(cookies: string): Promise<void> {
		const jeton = decodeURIComponent(sessionSeule(cookies).split('=')[1] ?? '').split('.')[0] ?? '';
		await maintenance(async (tx) => {
			await tx.execute(sql`
				insert into "passkey" ("id", "name", "public_key", "user_id", "credential_id", "counter",
					"device_type", "backed_up")
				values (${newId()}, 'test', 'cle-publique', ${ids[EXPLOITANT] ?? ''}, ${newId()}, 0,
					'singleDevice', false)
			`);
			await tx.execute(
				sql`update "session" set "passkey_verified_at" = now() where "token" = ${jeton}`
			);
		});
	}

	it('carry the language on <html> and the language form, before and after the passkey', async () => {
		const cookies = await signIn(EXPLOITANT);
		for (const langue of LANGUES) {
			await poserLangueDuCompte(EXPLOITANT, langue);
			const html = await (await get('/super-admin/passkey', { cookie: cookies })).text();
			expect(baliseHtml(html), langue).toBe(`<html lang="${langue}" dir="${SENS[langue]}">`);
			expect(html, langue).toMatch(/<form\b[^>]*action="\/langue"/);
		}
		await preuvePasskey(cookies);
		for (const langue of LANGUES) {
			await poserLangueDuCompte(EXPLOITANT, langue);
			const reponse = await get('/super-admin', { cookie: cookies });
			expect(reponse.status, langue).toBe(200);
			const html = await reponse.text();
			expect(baliseHtml(html), langue).toBe(`<html lang="${langue}" dir="${SENS[langue]}">`);
			expect(html, langue).toMatch(/<form\b[^>]*action="\/langue"/);
		}
	});

	it('translates the banner of an organisation he entered with his powers', async () => {
		const cookies = await signIn(EXPLOITANT);
		await preuvePasskey(cookies);
		expect(
			(await postForm('/super-admin?/entrer', { organizationId }, { cookie: cookies })).status
		).toBe(303);
		const bannieres: Record<string, string> = {};
		for (const langue of LANGUES) {
			await poserLangueDuCompte(EXPLOITANT, langue);
			const html = await (await get('/cours', { cookie: cookies })).text();
			const banniere = html.match(/<p class="banniere[^"]*"[\s\S]*?<\/p>/)?.[0] ?? '';
			expect(banniere, langue).toContain(ORGANISATION);
			bannieres[langue] = `<body>${banniere}</body>`;
		}
		expect(visibleText(bannieres['fr'] ?? '')).toBe(
			`Vous travaillez dans ${ORGANISATION} avec vos pouvoirs de super-admin. Changer d’organisation`
		);
		expect(visibleText(bannieres['ar'] ?? '')).toBe(
			`أنت تعمل في ${ORGANISATION} بصلاحيات المشرف العام. تغيير المؤسسة`
		);
		for (const langue of LANGUES.slice(1)) {
			expect(frenchLeft(bannieres['fr'] ?? '', bannieres[langue] ?? '', PERMIS), langue).toEqual(
				[]
			);
		}
	});
});

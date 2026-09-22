// Les conditions d'utilisation : la page ouverte à tous, et la porte de l'espace des responsables qui
// en demande l'acceptation, version par version (ADR 0044).
//
// Contre un vrai serveur et une vraie base, comme les tests d'accès : de vraies requêtes HTTP, des
// formulaires envoyés sans JavaScript, et le courriel relu dans le dossier où il est écrit.

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';
import {
	conditionsAcceptees,
	DATE_DES_CONDITIONS,
	VERSION_DES_CONDITIONS
} from './conditions-acceptees.js';

const origin = inject('origin');
const outbox = inject('outbox');
const testDatabase = inject('testDatabase');

const ORGANISATION = 'Association des conditions';
const RESPONSABLE = 'conditions-responsable@example.test';
const EDITEUR = 'conditions-editeur@example.test';
const ANCIEN = 'conditions-ancien@example.test';
const EXPLOITANT_MEMBRE = 'conditions-exploitant@example.test';
const SUPER_ADMIN = 'conditions-admin@example.test';
const SANS_ORGANISATION = 'conditions-sans@example.test';
/** Membre de deux organisations : conditions à accepter dans la première, acceptées dans l'autre. */
const DEUX_ORGANISATIONS = 'conditions-deux@example.test';
const VOISINE = 'Association voisine';
const AUTRE_ORGANISATION = 'Choisir une autre organisation';

let ownerHandle: DatabaseHandle;
let organizationId: string;
let voisineId: string;
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
			accept: 'text/html',
			origin,
			...(cookie ? { cookie } : {})
		},
		body: new URLSearchParams(fields).toString()
	});
}

async function get(path: string, cookie?: string): Promise<Response> {
	return fetch(`${origin}${path}`, { redirect: 'manual', headers: cookie ? { cookie } : {} });
}

/** Demande un lien, le suit, et rend le cookie de session. Le compteur de débit est vidé d'abord. */
async function signIn(email: string): Promise<string> {
	await maintenance((tx) => tx.execute(sql`delete from "rate_limit"`));
	await postForm('/connexion', { email });
	const noms = (await readdir(outbox)).filter((nom) => nom.endsWith('.json')).sort();
	const lien = noms
		.map(
			(nom) => JSON.parse(readFileSync(join(outbox, nom), 'utf8')) as { to: string; text: string }
		)
		.filter((message) => message.to === email)
		.at(-1)
		?.text.match(/https?:\/\/\S+/)?.[0];
	expect(lien, `aucun lien envoyé à ${email}`).toBeTruthy();
	const suivi = await fetch(lien as string, { redirect: 'manual' });
	const pose = (suivi.headers.getSetCookie?.() ?? []).find((valeur) =>
		valeur.startsWith('better-auth.session_token=')
	);
	expect(pose, `aucune session posée pour ${email}`).toBeTruthy();
	return (pose as string).split(';')[0] as string;
}

/**
 * La preuve qu'une passkey donnerait à la session, comme dans `acces.test.ts` : la cérémonie
 * WebAuthn n'existe que dans un navigateur, la règle, elle, est celle du serveur.
 */
async function preuvePasskey(cookie: string, userId: string): Promise<void> {
	const token = decodeURIComponent(cookie.split('=')[1] ?? '').split('.')[0] ?? '';
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "passkey" ("id", "name", "public_key", "user_id", "credential_id", "counter",
				"device_type", "backed_up")
			values (${newId()}, 'test', 'cle-publique', ${userId}, ${newId()}, 0, 'singleDevice', false)
		`);
		await tx.execute(
			sql`update "session" set "passkey_verified_at" = now() where "token" = ${token}`
		);
	});
}

/** Les acceptations d'une personne dans l'organisation du fichier, lues par le propriétaire. */
async function acceptationsDe(email: string) {
	return maintenance(async (tx) =>
		lignes<{ version: string; recent: boolean }>(
			await tx.execute(sql`
				select "version", (now() - "accepted_at") < interval '1 minute' as recent
				from "terms_acceptance"
				where "organization_id" = ${organizationId} and "user_id" = ${ids[email] ?? ''}
				order by "version"
			`)
		)
	);
}

/** Chaque lien de la page, avec son texte et le chemin où il mène, résolu depuis la page. */
function liens(html: string, page: string): { texte: string; chemin: string }[] {
	return [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((trouve) => ({
		texte: (trouve[2] ?? '').replace(/<[^>]+>/g, '').trim(),
		chemin: new URL((trouve[1] ?? '').replaceAll('&amp;', '&'), `${origin}${page}`).pathname
	}));
}

/** Le pied commun de la coquille, s'il y en a un. */
function pied(html: string): string {
	return html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? '';
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	organizationId = newId();
	voisineId = newId();
	for (const email of [
		RESPONSABLE,
		EDITEUR,
		ANCIEN,
		EXPLOITANT_MEMBRE,
		SUPER_ADMIN,
		SANS_ORGANISATION,
		DEUX_ORGANISATIONS
	]) {
		ids[email] = newId();
	}
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language")
			values (${organizationId}, 'conditions', ${ORGANISATION}, 'Europe/Zurich', 'fr', array['fr'])
		`);
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language")
			values (${voisineId}, 'conditions-voisine', ${VOISINE}, 'Europe/Zurich', 'fr', array['fr'])
		`);
		for (const [email, superAdmin] of [
			[RESPONSABLE, false],
			[EDITEUR, false],
			[ANCIEN, false],
			[EXPLOITANT_MEMBRE, true],
			[SUPER_ADMIN, true],
			[SANS_ORGANISATION, false],
			[DEUX_ORGANISATIONS, false]
		] as const) {
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified", "is_super_admin")
				values (${ids[email] ?? ''}, ${email}, true, ${superAdmin})
			`);
		}
		for (const [email, role] of [
			[RESPONSABLE, 'org_admin'],
			[EDITEUR, 'editor'],
			[ANCIEN, 'org_admin'],
			// Un compte super-admin qui serait aussi membre : le drapeau suffit à l'exempter.
			[EXPLOITANT_MEMBRE, 'org_admin'],
			[DEUX_ORGANISATIONS, 'editor']
		] as const) {
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organizationId}, ${ids[email] ?? ''}, ${role})
			`);
		}
		// Une personne qui n'a accepté qu'une version plus ancienne du texte.
		await tx.execute(conditionsAcceptees(organizationId, ids[ANCIEN] ?? '', '2026-01-01'));
		// La même personne dans une seconde organisation, où elle a déjà accepté la version en cours.
		await tx.execute(sql`
			insert into "membership" ("id", "organization_id", "user_id", "role")
			values (${newId()}, ${voisineId}, ${ids[DEUX_ORGANISATIONS] ?? ''}, 'org_admin')
		`);
		await tx.execute(conditionsAcceptees(voisineId, ids[DEUX_ORGANISATIONS] ?? ''));
	});
});

afterAll(async () => {
	await ownerHandle?.close();
});

describe('la page /conditions, ouverte à tous', () => {
	it('serves the whole text without a session, typeset like the PDF and with no script', async () => {
		const reponse = await get('/conditions');
		expect(reponse.status).toBe(200);
		const html = await reponse.text();

		expect(html).toContain('<title>Conditions d’utilisation | jadwal</title>');
		expect(html).toContain('<meta name="robots" content="noindex"');
		expect(html).toContain('<h1>Conditions d’utilisation</h1>');
		expect(html).toContain(DATE_DES_CONDITIONS);
		// Aucun JavaScript, aucune ressource d'un autre domaine.
		expect(html).not.toMatch(/<script\b/);
		expect(html).not.toMatch(/\b(src|href)="(https?:)?\/\//);

		const texte = html.slice(html.indexOf('<div class="conditions'), html.indexOf('</main>'));
		expect(texte.length, 'le texte doit être dans son composant').toBeGreaterThan(10_000);
		// Les apostrophes du texte sont typographiques, hors des balises et du code.
		const prose = texte.replace(/<code>[\s\S]*?<\/code>/g, '').replace(/<[^>]+>/g, '');
		expect(prose).toContain('’');
		expect(prose).not.toContain("'");
		expect(texte).not.toContain('—');

		// La liste des données personnelles : une seule liste numérotée, de dix éléments.
		const numerotees = [...texte.matchAll(/<ol>([\s\S]*?)<\/ol>/g)];
		expect(numerotees).toHaveLength(1);
		expect(numerotees[0]?.[1]?.match(/<li>/g)).toHaveLength(10);

		// Le tableau des durées défile dans son cadre, qui prend le focus et porte un nom.
		expect(texte).toContain(
			'<div class="tableau" role="region" tabindex="0" aria-label="Tableau : Combien de temps"><table>'
		);
	});
});

describe('la porte de l’espace des responsables', () => {
	let cookie: string;

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
	});

	it('sends a manager who has not accepted to the terms, from every page and every action', async () => {
		for (const page of ['/', '/cours', '/membres']) {
			const reponse = await get(page, cookie);
			expect(reponse.status, page).toBe(303);
			expect(reponse.headers.get('location'), page).toBe('/conditions/accepter');
		}
		const cree = await postForm(
			'/cours/nouveau',
			{
				'title.fr': 'Cours sans accord',
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
		expect(cree.headers.get('location')).toBe('/conditions/accepter');
		// Et rien n'a été écrit : le renvoi n'est pas seulement un code de retour.
		const cours = await maintenance(async (tx) =>
			lignes<{ n: number }>(
				await tx.execute(
					sql`select count(*)::int as n from "course" where "organization_id" = ${organizationId}`
				)
			)
		);
		expect(cours[0]?.n).toBe(0);
	});

	it('shows the whole text, the version and the button, without the navigation of the space', async () => {
		const reponse = await get('/conditions/accepter', cookie);
		expect(reponse.status).toBe(200);
		const html = await reponse.text();
		expect(html).toContain('<title>Conditions d’utilisation | jadwal</title>');
		expect(html).toContain(`Avant d’entrer dans l’espace de <strong>${ORGANISATION}</strong>`);
		expect(html).toContain(`Version du ${DATE_DES_CONDITIONS}`);
		expect(html).toMatch(
			/<form method="post"[^>]*>\s*<button type="submit"[^>]*>J’accepte les conditions d’utilisation<\/button>/
		);
		// Sous le bouton, ce qui reste fermé, et rien de plus : le compte, l'adhésion et la session
		// sont déjà enregistrés, « rien n'est enregistré » serait faux.
		expect(html).toMatch(
			new RegExp(
				`<p\\b[^>]*>\\s*Tant que vous ne les avez pas acceptées, l’espace de ${ORGANISATION} reste fermé\\.\\s*</p>`
			)
		);
		expect(html).not.toContain('rien n’est enregistré');
		// Le texte entier, avec un seul titre de niveau 1 : celui de la page.
		expect(html).toContain('Combien de temps');
		expect(html.match(/<h1\b/g)).toHaveLength(1);
		expect(html).not.toMatch(/<script\b/);
		// Chaque lien de la navigation ramènerait ici : elle n'est pas affichée. La déconnexion, si.
		expect(html).not.toContain('aria-label="Espace des responsables"');
		expect(html).toContain('Se déconnecter');
		// Une seule organisation : il n'y a rien d'autre à choisir, donc pas de lien pour le faire.
		expect(liens(html, '/conditions/accepter').map((lien) => lien.texte)).not.toContain(
			AUTRE_ORGANISATION
		);
	});

	it('records the current version, stamped by the database, then opens the space', async () => {
		const accepte = await postForm('/conditions/accepter', {}, cookie);
		expect(accepte.status).toBe(303);
		expect(accepte.headers.get('location')).toBe('/');

		expect(await acceptationsDe(RESPONSABLE)).toEqual([
			{ version: VERSION_DES_CONDITIONS, recent: true }
		]);
		expect((await get('/', cookie)).status).toBe(200);
		expect((await get('/cours', cookie)).status).toBe(200);

		// Une seconde fois : l'écran renvoie à l'accueil, et rien n'est ajouté.
		const encore = await postForm('/conditions/accepter', {}, cookie);
		expect(encore.status).toBe(303);
		expect(encore.headers.get('location')).toBe('/');
		const page = await get('/conditions/accepter', cookie);
		expect(page.status).toBe(303);
		expect(page.headers.get('location')).toBe('/');
		expect(await acceptationsDe(RESPONSABLE)).toHaveLength(1);
	});

	it('asks again when the text has a new version', async () => {
		const ancien = await signIn(ANCIEN);
		const reponse = await get('/', ancien);
		expect(reponse.status).toBe(303);
		expect(reponse.headers.get('location')).toBe('/conditions/accepter');
		expect(await (await get('/conditions/accepter', ancien)).text()).toContain(
			'J’accepte les conditions d’utilisation'
		);

		expect((await postForm('/conditions/accepter', {}, ancien)).status).toBe(303);
		expect(await acceptationsDe(ANCIEN)).toEqual([
			{ version: '2026-01-01', recent: true },
			{ version: VERSION_DES_CONDITIONS, recent: true }
		]);
		expect((await get('/', ancien)).status).toBe(200);
	});

	it('holds an editor at the same door', async () => {
		const editeur = await signIn(EDITEUR);
		const reponse = await get('/cours', editeur);
		expect(reponse.status).toBe(303);
		expect(reponse.headers.get('location')).toBe('/conditions/accepter');

		expect((await postForm('/conditions/accepter', {}, editeur)).status).toBe(303);
		expect((await get('/cours', editeur)).status).toBe(200);
		expect(await acceptationsDe(EDITEUR)).toHaveLength(1);
	});

	it('never stops the super-admin with his powers, in an organisation he entered', async () => {
		const admin = await signIn(SUPER_ADMIN);
		await preuvePasskey(admin, ids[SUPER_ADMIN] ?? '');
		expect((await postForm('/super-admin?/entrer', { organizationId }, admin)).status).toBe(303);

		for (const page of ['/', '/cours', '/membres']) {
			expect((await get(page, admin)).status, page).toBe(200);
		}
		const ecran = await get('/conditions/accepter', admin);
		expect(ecran.status).toBe(303);
		expect(ecran.headers.get('location')).toBe('/');
	});

	it('never stops a super-admin account that is also a member', async () => {
		const exploitant = await signIn(EXPLOITANT_MEMBRE);
		expect((await get('/', exploitant)).status).toBe(200);
		expect((await get('/cours', exploitant)).status).toBe(200);
		expect(await acceptationsDe(EXPLOITANT_MEMBRE)).toHaveLength(0);
	});

	it('sends to sign in, or to choose an organisation, before any acceptance', async () => {
		const anonyme = await get('/conditions/accepter');
		expect(anonyme.status).toBe(303);
		expect(anonyme.headers.get('location')).toBe('/connexion');

		const sans = await signIn(SANS_ORGANISATION);
		const page = await get('/conditions/accepter', sans);
		expect(page.status).toBe(303);
		expect(page.headers.get('location')).toBe('/organisations');
		const poste = await postForm('/conditions/accepter', {}, sans);
		expect(poste.status).toBe(303);
		expect(poste.headers.get('location')).toBe('/organisations');
	});

	it('lets a member of several organisations choose another one, through a page the door does not hold', async () => {
		const cookie = await signIn(DEUX_ORGANISATIONS);
		// Deux organisations et aucune choisie : le choix vient d'abord.
		expect((await get('/', cookie)).headers.get('location')).toBe('/organisations');
		expect((await postForm('/organisations?/choisir', { organizationId }, cookie)).status).toBe(
			303
		);
		expect((await get('/', cookie)).headers.get('location')).toBe('/conditions/accepter');

		// La navigation est masquée pendant l'attente : ce lien est le seul chemin vers l'autre.
		const ecran = await get('/conditions/accepter', cookie);
		expect(ecran.status).toBe(200);
		const html = await ecran.text();
		expect(html).not.toContain('aria-label="Espace des responsables"');
		expect(liens(html, '/conditions/accepter')).toContainEqual({
			texte: AUTRE_ORGANISATION,
			chemin: '/organisations'
		});

		// La page du choix n'est pas derrière la porte : elle s'ouvre, et propose les deux.
		const choix = await get('/organisations', cookie);
		expect(choix.status).toBe(200);
		const liste = await choix.text();
		expect(liste).toContain(ORGANISATION);
		expect(liste).toContain(VOISINE);

		// L'autre organisation, où la personne a déjà accepté, s'ouvre sans rien demander de plus.
		const change = await postForm('/organisations?/choisir', { organizationId: voisineId }, cookie);
		expect(change.status).toBe(303);
		expect(change.headers.get('location')).toBe('/');
		expect((await get('/', cookie)).status).toBe(200);
		expect((await get('/cours', cookie)).status).toBe(200);
		// Rien n'a été accepté en passant : la première organisation attend toujours.
		expect(await acceptationsDe(DEUX_ORGANISATIONS)).toHaveLength(0);
	});
});

describe('les liens vers les conditions, et les titres', () => {
	it('links the sign-in page to the terms, under the form and in the common footer', async () => {
		const reponse = await get('/connexion');
		expect(reponse.status).toBe(200);
		const html = await reponse.text();
		expect(html).toContain('<title>Se connecter | jadwal</title>');
		expect(liens(html, '/connexion')).toContainEqual({
			texte: 'Lire les conditions d’utilisation',
			chemin: '/conditions'
		});
		expect(liens(pied(html), '/connexion')).toContainEqual({
			texte: 'Conditions d’utilisation',
			chemin: '/conditions'
		});
	});

	it('puts the same footer on a page of the space, and titles the choice of organisation', async () => {
		const cookie = await signIn(RESPONSABLE);
		const cours = await get('/cours', cookie);
		expect(cours.status).toBe(200);
		expect(liens(pied(await cours.text()), '/cours')).toContainEqual({
			texte: 'Conditions d’utilisation',
			chemin: '/conditions'
		});

		const choix = await get('/organisations', cookie);
		expect(choix.status).toBe(200);
		expect(await choix.text()).toContain('<title>Vos organisations | jadwal</title>');
	});
});

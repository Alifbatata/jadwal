// Les conditions d'utilisation : la page ouverte à tous, et la porte de l'espace des responsables qui
// en demande l'acceptation, version par version (ADR 0044).
//
// Contre un vrai serveur et une vraie base, comme les tests d'accès : de vraies requêtes HTTP, des
// formulaires envoyés sans JavaScript, et le courriel relu dans le dossier où il est écrit.
//
// Depuis l'étape 20, l'écran d'acceptation propose aussi de ne pas accepter et de quitter
// l'organisation : le dernier groupe de ce fichier l'éprouve, avec ses propres organisations.

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDatabase, newId, sql, withOrg, type DatabaseHandle } from '@jadwal/db';
import {
	conditionsAcceptees,
	DATE_DES_CONDITIONS,
	VERSION_DES_CONDITIONS
} from './conditions-acceptees.js';
import { contraste } from '../src/lib/couleur.js';
import { visibleText } from './textes-lus.js';

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
		// Le nom est isolé (`<bdi>`) : un nom latin garde son sens dans une page arabe, et l'inverse.
		// « Association… » commence par une voyelle : « d’ », collé au nom, sans espace entre les deux
		// (relevé D8 du 27.09.2026 ; la règle est celle de `deDevant`, dans `i18n.ts`).
		expect(html).toContain(
			`Avant d’entrer dans l’espace d’<strong><bdi>${ORGANISATION}</bdi></strong>`
		);
		// JJ.MM.AAAA, comme toutes les dates de l'espace depuis l'étape 18 (retour A3).
		const [annee, mois, jour] = VERSION_DES_CONDITIONS.split('-');
		expect(html).toContain(`Version du ${jour}.${mois}.${annee}`);
		// Une action nommée : l'écran en a une seconde depuis l'étape 20, « quitter ». Le formulaire
		// porte l'organisation que l'écran nomme, que le serveur compare à celle de la session.
		expect(html).toMatch(
			new RegExp(
				`<form method="post" action="\\?/accepter">\\s*<input type="hidden" name="organizationId" value="${organizationId}"\\s*/?>\\s*<button type="submit"[^>]*>J’accepte les conditions d’utilisation</button>`
			)
		);
		// Sous le bouton, ce qui reste fermé, et rien de plus : le compte, l'adhésion et la session
		// sont déjà enregistrés, « rien n'est enregistré » serait faux.
		expect(html).toMatch(
			new RegExp(
				`<p\\b[^>]*>\\s*Tant que vous ne les avez pas acceptées, l’espace d’${ORGANISATION} reste fermé\\.\\s*</p>`
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
		const accepte = await postForm('/conditions/accepter?/accepter', { organizationId }, cookie);
		expect(accepte.status).toBe(303);
		expect(accepte.headers.get('location')).toBe('/');

		expect(await acceptationsDe(RESPONSABLE)).toEqual([
			{ version: VERSION_DES_CONDITIONS, recent: true }
		]);
		expect((await get('/', cookie)).status).toBe(200);
		expect((await get('/cours', cookie)).status).toBe(200);

		// Une seconde fois : l'écran renvoie à l'accueil, et rien n'est ajouté.
		const encore = await postForm('/conditions/accepter?/accepter', { organizationId }, cookie);
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

		expect(
			(await postForm('/conditions/accepter?/accepter', { organizationId }, ancien)).status
		).toBe(303);
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

		expect(
			(await postForm('/conditions/accepter?/accepter', { organizationId }, editeur)).status
		).toBe(303);
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
		const poste = await postForm('/conditions/accepter?/accepter', {}, sans);
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

const LANGUES = ['fr', 'de', 'it', 'en', 'ar'] as const;
type Langue = (typeof LANGUES)[number];

/** Le texte lu d'un morceau de page, balises retirées. */
function lu(fragment: string): string {
	return visibleText(`<body>${fragment}</body>`);
}

/** L'élément qui porte cet identifiant, contenu compris (les balises du même nom sont comptées). */
function element(html: string, id: string): string {
	const ouverture = new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\bid="${id}"[^>]*>`, 'i').exec(html);
	if (!ouverture) return '';
	const balise = ouverture[1] as string;
	const motif = new RegExp(`<${balise}\\b[^>]*>|</${balise}>`, 'gi');
	motif.lastIndex = ouverture.index + ouverture[0].length;
	let profondeur = 1;
	for (let trouve = motif.exec(html); trouve; trouve = motif.exec(html)) {
		profondeur += trouve[0].startsWith('</') ? -1 : 1;
		if (profondeur === 0) return html.slice(ouverture.index, trouve.index + trouve[0].length);
	}
	return html.slice(ouverture.index);
}

/**
 * Le premier formulaire de la page dont l'action est `action` : ses champs cachés, la balise de son
 * bouton et ce que le bouton dit. `null` si la page n'en montre aucun.
 */
function formulaireDeLaPage(
	html: string,
	action: string
): { caches: Record<string, string>; balise: string; bouton: string } | null {
	for (const [bloc] of html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)) {
		const ouverture = bloc.match(/<form\b[^>]*>/)?.[0] ?? '';
		if ((ouverture.match(/\baction="([^"]*)"/)?.[1] ?? '') !== action) continue;
		const caches: Record<string, string> = {};
		for (const [champ] of bloc.matchAll(/<input\b[^>]*>/g)) {
			if (!/\btype="hidden"/.test(champ)) continue;
			const nom = champ.match(/\bname="([^"]*)"/)?.[1];
			if (nom) caches[nom] = champ.match(/\bvalue="([^"]*)"/)?.[1] ?? '';
		}
		const balise = bloc.match(/<button\b[^>]*>/)?.[0] ?? '';
		return { caches, balise, bouton: lu(bloc.match(/<button\b[\s\S]*?<\/button>/)?.[0] ?? '') };
	}
	return null;
}

async function poserLangueDuCompte(email: string, langue: Langue): Promise<void> {
	await maintenance((tx) =>
		tx.execute(sql`update "user" set "language" = ${langue} where "email" = ${email}`)
	);
}

/** L'organisation que désigne la session de ce cookie, relevée par le propriétaire. */
async function organisationDeLaSession(cookie: string): Promise<string | null | undefined> {
	const jeton = decodeURIComponent(cookie.split('=')[1] ?? '').split('.')[0] ?? '';
	const [ligne] = await maintenance(async (tx) =>
		lignes<{ active_organization_id: string | null }>(
			await tx.execute(sql`select "active_organization_id" from "session" where "token" = ${jeton}`)
		)
	);
	return ligne?.active_organization_id;
}

/** Le bouton de l'écran d'acceptation qui fait partir sans accepter. */
const NE_PAS_ACCEPTER: Record<Langue, string> = {
	fr: 'Ne pas accepter et quitter l’organisation',
	de: 'Nicht akzeptieren und Organisation verlassen',
	it: 'Non accettare e lascia l’organizzazione',
	en: 'Decline the terms and leave the organisation',
	ar: 'عدم الموافقة ومغادرة المؤسسة'
};

/** La demande de confirmation et le refus, les phrases de « Vos organisations ». */
const QUITTER: Record<
	Langue,
	{ demande: string; confirmer: string; rester: string; seule: string }
> = {
	fr: {
		demande: 'Vous allez quitter cette organisation :',
		confirmer: 'Confirmer le départ',
		rester: 'Rester dans l’organisation',
		seule: 'Vous êtes la seule personne responsable de cette organisation :'
	},
	de: {
		demande: 'Sie sind dabei, diese Organisation zu verlassen:',
		confirmer: 'Austritt bestätigen',
		rester: 'In der Organisation bleiben',
		seule: 'Sie sind die einzige Person in der Leitung dieser Organisation:'
	},
	it: {
		demande: 'Stai per lasciare questa organizzazione:',
		confirmer: 'Conferma l’uscita',
		rester: 'Resta nell’organizzazione',
		seule: 'Sei l’unica persona responsabile di questa organizzazione:'
	},
	en: {
		demande: 'You are about to leave this organisation:',
		confirmer: 'Confirm leaving',
		rester: 'Stay in the organisation',
		seule: 'You are the only manager of this organisation:'
	},
	ar: {
		demande: 'أنت على وشك مغادرة هذه المؤسسة:',
		confirmer: 'تأكيد المغادرة',
		rester: 'البقاء في المؤسسة',
		seule: 'أنت المسؤول الوحيد عن هذه المؤسسة:'
	}
};

/**
 * Ce que le refus dit de faire à la seule personne responsable, sur cet écran. La phrase de « Vos
 * organisations » lui dit « ouvrez-la », ce qui la ramènerait ici.
 */
const ACCEPTER_D_ABORD: Record<Langue, string> = {
	fr: 'Une organisation garde toujours au moins une personne responsable. Pour la quitter, acceptez d’abord les conditions, puis, dans l’écran Membres, donnez le rôle de responsable à un autre membre ou invitez une personne comme responsable.',
	de: 'Eine Organisation behält immer mindestens eine Person in der Leitung. Um sie zu verlassen, akzeptieren Sie zuerst die Nutzungsbedingungen. Geben Sie dann auf der Seite «Mitglieder» einem anderen Mitglied die Rolle «Leitung», oder laden Sie eine Person für die Leitung ein.',
	it: 'Un’organizzazione ha sempre almeno un responsabile. Per lasciarla, accetta prima le condizioni d’uso, poi, nella pagina Membri, dai il ruolo di responsabile a un altro membro o invita una persona come responsabile.',
	en: 'An organisation always keeps at least one manager. To leave it, first accept the terms of use, then, on the Members screen, give the manager role to another member or invite someone as a manager.',
	ar: 'تحتفظ المؤسسة دائمًا بمسؤول واحد أو أكثر. لمغادرتها، وافق أولًا على شروط الاستخدام، ثم امنح في صفحة «الأعضاء» دور المسؤول لعضو آخر أو ادعُ شخصًا بصفة مسؤول.'
};

/** L'encadré de « Vos organisations », à l'arrivée, après un départ. */
const PARTIE: Record<Langue, string> = {
	fr: 'Vous avez quitté l’organisation. Son espace ne vous est plus ouvert. Pour y revenir, demandez à une personne responsable de vous inviter de nouveau.',
	de: 'Sie haben die Organisation verlassen. Der Bereich der Organisation steht Ihnen nicht mehr offen. Um zurückzukommen, bitten Sie eine Person in der Leitung, Sie wieder einzuladen.',
	it: 'Hai lasciato l’organizzazione. La sua area non ti è più accessibile. Per tornare, chiedi a un responsabile di invitarti di nuovo.',
	en: 'You have left the organisation. Its area is no longer open to you. To come back, ask a manager to invite you again.',
	ar: 'لقد غادرت المؤسسة، ولم تعد مساحتها مفتوحة لك. وللعودة إليها اطلب من أحد المسؤولين أن يدعوك من جديد.'
};

/**
 * Le refus d'un envoi qui nomme une autre organisation que celle de la session : la session a changé
 * d'organisation dans un autre onglet depuis l'affichage. Puis la phrase qui précède le nom de celle
 * que l'écran montre désormais.
 */
const SESSION_CHANGEE: Record<Langue, { quoi: string; maintenant: string }> = {
	fr: {
		quoi: 'Depuis l’ouverture de la page, vous avez choisi une autre organisation, peut-être dans un autre onglet. Rien n’a été enregistré.',
		maintenant: 'La page concerne maintenant cette organisation :'
	},
	de: {
		quoi: 'Seit die Seite geöffnet wurde, haben Sie eine andere Organisation gewählt, vielleicht in einem anderen Tab. Es wurde nichts gespeichert.',
		maintenant: 'Die Seite gilt jetzt für diese Organisation:'
	},
	it: {
		quoi: 'Da quando hai aperto la pagina hai scelto un’altra organizzazione, forse in un’altra scheda. Non è stato salvato niente.',
		maintenant: 'Ora la pagina riguarda questa organizzazione:'
	},
	en: {
		quoi: 'Since the page was opened, you have chosen another organisation, perhaps in another tab. Nothing has been saved.',
		maintenant: 'The page is now about this organisation:'
	},
	ar: {
		quoi: 'اخترت مؤسسة أخرى منذ أن فُتحت الصفحة، ربما في علامة تبويب أخرى. لم يُحفظ أي شيء.',
		maintenant: 'تخص الصفحة الآن هذه المؤسسة:'
	}
};

/** Le blanc de la page, sous les boutons de l'écran. */
const PAGE = '#ffffff';

/**
 * Un bord ou un fond qui ne dessine rien : `none`, `transparent`, ou les formes courtes que la
 * construction en écrit (`#0000` pour `transparent`, `0 0` pour un fond `none`).
 */
const INVISIBLE = /^(none|transparent|#0000|#00000000|0 0)$/;

/**
 * Les déclarations des règles servies dont la liste de sélecteurs contient exactement `selecteur`,
 * dans l'ordre : la dernière l'emporte. Les feuilles liées et en ligne, comme un navigateur.
 */
async function declarationsServies(
	html: string,
	chemin: string,
	selecteur: string
): Promise<[string, string][]> {
	const liees = await Promise.all(
		[...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)].map(async (trouve) => {
			const href = trouve[0].match(/\bhref="([^"]*)"/)?.[1] ?? '';
			return (await fetch(new URL(href, `${origin}${chemin}`))).text();
		})
	);
	const enLigne = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(
		(trouve) => trouve[1] ?? ''
	);
	const declarations: [string, string][] = [];
	for (const [, selecteurs, corps] of [...liees, ...enLigne]
		.join('\n')
		.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		if (!(selecteurs ?? '').split(',').some((un) => un.trim() === selecteur)) continue;
		for (const declaration of (corps ?? '').split(';')) {
			const deuxPoints = declaration.indexOf(':');
			if (deuxPoints < 0) continue;
			declarations.push([
				declaration.slice(0, deuxPoints).trim(),
				declaration.slice(deuxPoints + 1).trim()
			]);
		}
	}
	return declarations;
}

/**
 * La couleur du bord que ces déclarations dessinent : `none` quand il est retiré, `currentcolor`
 * quand rien ne la fixe.
 */
function couleurDuBord(declarations: [string, string][]): string {
	let couleur = 'currentcolor';
	for (const [propriete, valeur] of declarations) {
		if (propriete === 'border-color') couleur = valeur;
		if (propriete === 'border') {
			const morceaux = valeur.split(/\s+/);
			couleur =
				morceaux.find((morceau) => /^(#|var\(|transparent$)/i.test(morceau)) ??
				(morceaux.includes('none') || morceaux[0] === '0' ? 'none' : 'currentcolor');
		}
	}
	return couleur;
}

/** La dernière valeur d'une propriété, ou `undefined`. */
function valeurDe(declarations: [string, string][], propriete: string): string | undefined {
	return declarations.filter(([nom]) => nom === propriete).at(-1)?.[1];
}

describe('ne pas accepter les conditions, et quitter l’organisation (étape 20)', () => {
	/** Celle que l'on quitte : une responsable qui a accepté, et des membres qui ne l'ont pas fait. */
	const QUITTEE = { id: newId(), slug: 'conditions-quittee', nom: 'Association du départ' };
	/** Une seule responsable, qui n'a pas accepté. */
	const SEULE = {
		id: newId(),
		slug: 'conditions-seule',
		nom: 'Association d’une seule responsable'
	};
	/** L'autre organisation d'une personne qui en a deux : elle y a accepté. */
	const GARDEE = { id: newId(), slug: 'conditions-gardee', nom: 'Association que l’on garde' };
	/** Celle que l'on choisit dans un autre onglet, pendant que l'écran nomme QUITTEE. */
	const AUTRE = { id: newId(), slug: 'conditions-autre', nom: 'Association de l’autre onglet' };
	/** Une éditrice d'une seule organisation, sans invitation : le cas le plus courant. */
	const SOLO = 'conditions-solo@example.test';
	/** La responsable qui reste, et qui lit le journal. */
	const RESTE = 'conditions-reste@example.test';
	const UNIQUE = 'conditions-unique@example.test';
	/** Membre de deux organisations : conditions à accepter dans l'une, acceptées dans l'autre. */
	const DEUX = 'conditions-deux-depart@example.test';
	/** Une éditrice qui a déjà accepté : l'écran ne lui est plus ouvert. */
	const DEJA = 'conditions-deja@example.test';
	/** Membre de QUITTEE et d'AUTRE, sans avoir accepté dans aucune des deux. */
	const CHANGE = 'conditions-change@example.test';
	/** Membre de trois organisations : QUITTEE, où elle n'a pas accepté, GARDEE et AUTRE, où si. */
	const TROIS = 'conditions-trois@example.test';
	/** Un compte super-admin, éditeur de QUITTEE : la porte ne l'arrête jamais (ADR 0044). */
	const EXPLOITANT = 'conditions-exploitant-depart@example.test';
	const MEMBRES = [
		[RESTE, QUITTEE.id, 'org_admin'],
		[RESTE, GARDEE.id, 'org_admin'],
		[RESTE, AUTRE.id, 'org_admin'],
		[SOLO, QUITTEE.id, 'editor'],
		[DEUX, QUITTEE.id, 'editor'],
		[DEUX, GARDEE.id, 'editor'],
		[DEJA, QUITTEE.id, 'editor'],
		[UNIQUE, SEULE.id, 'org_admin'],
		[CHANGE, QUITTEE.id, 'editor'],
		[CHANGE, AUTRE.id, 'editor'],
		[TROIS, QUITTEE.id, 'editor'],
		[TROIS, GARDEE.id, 'editor'],
		[TROIS, AUTRE.id, 'editor'],
		[EXPLOITANT, QUITTEE.id, 'editor']
	] as const;
	/** Les adhésions dont la personne a accepté la version en cours. */
	const ACCEPTEES = [
		`${RESTE} ${QUITTEE.id}`,
		`${RESTE} ${AUTRE.id}`,
		`${DEUX} ${GARDEE.id}`,
		`${DEJA} ${QUITTEE.id}`,
		`${TROIS} ${GARDEE.id}`,
		`${TROIS} ${AUTRE.id}`
	];
	const personnes: Record<string, string> = {};
	/** Les adhésions, par adresse et par organisation : `adresse organisation`. */
	const adhesions: Record<string, string> = {};
	const cookies: Record<string, string> = {};
	let appHandle: DatabaseHandle;

	/** Remet une adhésion, avec son acceptation si elle en avait une, si le départ l'a emportée. */
	async function remettre(email: string, organisation: string, role: string): Promise<void> {
		const cle = `${email} ${organisation}`;
		await maintenance(async (tx) => {
			const rendue = lignes(
				await tx.execute(sql`
					insert into "membership" ("id", "organization_id", "user_id", "role")
					values (${adhesions[cle] ?? ''}, ${organisation}, ${personnes[email] ?? ''}, ${role})
					on conflict ("id") do nothing
					returning "id"
				`)
			);
			if (rendue.length > 0 && ACCEPTEES.includes(cle)) {
				await tx.execute(conditionsAcceptees(organisation, personnes[email] ?? ''));
			}
		});
	}

	/** Le rôle d'une personne dans une organisation, ou `undefined` si elle n'en est plus membre. */
	async function roleDans(email: string, organisation: string): Promise<string | undefined> {
		const [ligne] = await maintenance(async (tx) =>
			lignes<{ role: string }>(
				await tx.execute(sql`
					select "role" from "membership"
					where "id" = ${adhesions[`${email} ${organisation}`] ?? ''}
				`)
			)
		);
		return ligne?.role;
	}

	/** Les acceptations des conditions d'une personne dans une organisation. */
	async function acceptations(email: string, organisation: string): Promise<number> {
		const trouvees = await maintenance(async (tx) =>
			lignes(
				await tx.execute(sql`
					select 1 from "terms_acceptance"
					where "organization_id" = ${organisation} and "user_id" = ${personnes[email] ?? ''}
				`)
			)
		);
		return trouvees.length;
	}

	beforeAll(async () => {
		appHandle = createDatabase({ role: 'app', overrides: { database: testDatabase } });
		for (const email of [SOLO, RESTE, UNIQUE, DEUX, DEJA, CHANGE, TROIS, EXPLOITANT]) {
			personnes[email] = newId();
		}
		for (const [email, organisation] of MEMBRES) {
			adhesions[`${email} ${organisation}`] = newId();
		}
		await maintenance(async (tx) => {
			for (const organisation of [QUITTEE, SEULE, GARDEE, AUTRE]) {
				await tx.execute(sql`
					insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
						"enabled_language")
					values (${organisation.id}, ${organisation.slug}, ${organisation.nom}, 'Europe/Zurich',
						'fr', array['fr'])
				`);
			}
			for (const [email, id] of Object.entries(personnes)) {
				await tx.execute(sql`
					insert into "user" ("id", "email", "email_verified", "is_super_admin")
					values (${id}, ${email}, true, ${email === EXPLOITANT})
				`);
			}
		});
		for (const [email, organisation, role] of MEMBRES) await remettre(email, organisation, role);
		for (const email of [SOLO, UNIQUE, DEUX, DEJA, CHANGE, TROIS, EXPLOITANT]) {
			cookies[email] = await signIn(email);
		}
	});

	afterAll(async () => {
		await appHandle?.close();
	});

	it.each(LANGUES)(
		'offers in %s, under the button that accepts, a second form that leaves the organisation',
		async (langue) => {
			await poserLangueDuCompte(SOLO, langue);
			const reponse = await get('/conditions/accepter', cookies[SOLO]);
			expect(reponse.status).toBe(200);
			const html = await reponse.text();
			const partir = formulaireDeLaPage(html, '?/quitter');
			// L'organisation que l'écran nomme, sans confirmation : le premier envoi ne fait rien partir.
			expect(partir?.caches).toEqual({ organizationId: QUITTEE.id });
			// L'accord la porte aussi : le serveur n'accepte que pour l'organisation que l'écran nomme.
			expect(formulaireDeLaPage(html, '?/accepter')?.caches).toEqual({
				organizationId: QUITTEE.id
			});
			expect(partir?.bouton).toBe(NE_PAS_ACCEPTER[langue]);
			// Un bouton secondaire, sous celui qui accepte : l'accord reste le geste que l'écran propose.
			expect(partir?.balise).toMatch(/\bclass="secondaire\b/);
			expect(html.indexOf('action="?/accepter"')).toBeGreaterThan(-1);
			expect(html.indexOf('action="?/quitter"')).toBeGreaterThan(
				html.indexOf('action="?/accepter"')
			);
			// Rien n'est demandé tant que rien n'est envoyé.
			expect(element(html, 'confirmer-depart')).toBe('');
			expect(element(html, 'refus-depart')).toBe('');
		}
	);

	it.each(LANGUES)(
		'asks at the top in %s, after the title and before the text, and neither leaves nor accepts',
		async (langue) => {
			await poserLangueDuCompte(SOLO, langue);
			const demande = await postForm(
				'/conditions/accepter?/quitter',
				{ organizationId: QUITTEE.id },
				cookies[SOLO]
			);
			expect(demande.status).toBe(200);
			const html = await demande.text();
			const boite = element(html, 'confirmer-depart');
			expect(boite).toMatch(/role="alert"/);
			// En haut : après l'envoi, la page s'ouvre en haut, et le texte des conditions est long.
			expect(html.indexOf('id="confirmer-depart"')).toBeGreaterThan(html.indexOf('<h1'));
			expect(html.indexOf('id="confirmer-depart"')).toBeLessThan(
				html.indexOf('<div lang="fr" dir="ltr">')
			);
			expect(lu(boite)).toContain(`${QUITTER[langue].demande} ${QUITTEE.nom}`);
			expect(boite).toContain(`<bdi>${QUITTEE.nom}</bdi>`);
			const confirmer = formulaireDeLaPage(boite, '?/quitter');
			expect(confirmer?.caches).toEqual({ organizationId: QUITTEE.id, confirm: 'yes' });
			expect(confirmer?.bouton).toBe(QUITTER[langue].confirmer);
			// « Rester » ramène à cet écran sans rien envoyer, et non à « Vos organisations ».
			expect(liens(boite, '/conditions/accepter')).toEqual([
				{ texte: QUITTER[langue].rester, chemin: '/conditions/accepter' }
			]);
			expect(
				liens(html, '/conditions/accepter').filter((lien) => lien.chemin === '/organisations')
			).toEqual([]);
			expect(await roleDans(SOLO, QUITTEE.id), 'rien ne part avant la confirmation').toBe('editor');
			expect(await acceptations(SOLO, QUITTEE.id), 'rien n’est accepté').toBe(0);
		}
	);

	it.each(LANGUES)(
		'leaves once confirmed, says so in %s where she arrives, and writes it in the journal',
		async (langue) => {
			await remettre(SOLO, QUITTEE.id, 'editor');
			await poserLangueDuCompte(SOLO, langue);
			const cookie = cookies[SOLO] ?? '';
			// L'organisation qu'elle quitte est celle de sa session : sans ce choix, la vérification
			// d'après passerait à vide, puisqu'une personne d'une seule organisation n'a rien à choisir.
			expect(
				(await postForm('/organisations?/choisir', { organizationId: QUITTEE.id }, cookie)).status
			).toBe(303);
			expect(await organisationDeLaSession(cookie)).toBe(QUITTEE.id);
			expect((await get('/', cookie)).headers.get('location')).toBe('/conditions/accepter');
			// Le cas de cet écran : on lui redemande son accord parce que le texte a changé. Sans cette
			// acceptation, la vérification d'après, « son acceptation part avec elle », passerait à vide.
			await maintenance((tx) =>
				tx.execute(conditionsAcceptees(QUITTEE.id, personnes[SOLO] ?? '', '2026-01-01'))
			);
			expect(await acceptations(SOLO, QUITTEE.id), 'l’acceptation d’avant le départ').toBe(1);

			const reponse = await postForm(
				'/conditions/accepter?/quitter',
				{ organizationId: QUITTEE.id, confirm: 'yes' },
				cookie
			);
			expect(reponse.status).toBe(303);
			const arrivee = new URL(reponse.headers.get('location') ?? '', origin);
			expect(arrivee.pathname).toBe('/organisations');
			expect(Object.fromEntries(arrivee.searchParams)).toEqual({
				avis: 'depart',
				organisation: QUITTEE.id
			});
			// L'adhésion part, et son acceptation avec elle ; la session ne nomme plus l'organisation.
			expect(await roleDans(SOLO, QUITTEE.id)).toBeUndefined();
			expect(await acceptations(SOLO, QUITTEE.id)).toBe(0);
			expect(await organisationDeLaSession(cookie)).toBeNull();
			// Le départ est au journal, signé d'elle, comme depuis « Vos organisations ». Le refus des
			// conditions, lui, n'est consigné nulle part (ADR 0044).
			const journal = await withOrg(
				appHandle.db,
				{ organizationId: QUITTEE.id, userId: personnes[RESTE] ?? '' },
				async (tx) =>
					lignes<{ action: string; actor_id: string; target_table: string }>(
						await tx.execute(sql`
							select "action", "actor_id", "target_table" from "audit_log"
							where "target_id" = ${adhesions[`${SOLO} ${QUITTEE.id}`] ?? ''}
							order by "created_at" desc, "id" desc
						`)
					)
			);
			expect(journal[0]).toEqual({
				action: 'member.leave',
				actor_id: personnes[SOLO],
				target_table: 'membership'
			});

			const page = await get(`${arrivee.pathname}${arrivee.search}`, cookie);
			expect(page.status).toBe(200);
			const html = await page.text();
			expect(lu(element(html, 'avis-depart'))).toBe(PARTIE[langue]);
			// Elle n'a plus d'organisation : il n'y a plus rien à quitter, et l'espace la renvoie ici.
			expect(formulaireDeLaPage(html, '?/quitter')).toBeNull();
			expect((await get('/', cookie)).headers.get('location')).toBe('/organisations');
		}
	);

	it('keeps the other organisation of someone who has two', async () => {
		await poserLangueDuCompte(DEUX, 'fr');
		const cookie = cookies[DEUX] ?? '';
		expect(
			(await postForm('/organisations?/choisir', { organizationId: QUITTEE.id }, cookie)).status
		).toBe(303);
		expect((await get('/', cookie)).headers.get('location')).toBe('/conditions/accepter');
		const reponse = await postForm(
			'/conditions/accepter?/quitter',
			{ organizationId: QUITTEE.id, confirm: 'yes' },
			cookie
		);
		expect(reponse.status).toBe(303);
		expect(new URL(reponse.headers.get('location') ?? '', origin).pathname).toBe('/organisations');
		expect(await roleDans(DEUX, QUITTEE.id)).toBeUndefined();
		expect(await roleDans(DEUX, GARDEE.id)).toBe('editor');
		expect(await acceptations(DEUX, GARDEE.id)).toBe(1);
		// Une seule organisation lui reste, où elle a déjà accepté : l'espace s'y ouvre de lui-même.
		const accueil = await get('/', cookie);
		expect(accueil.status).toBe(200);
		expect(await accueil.text()).toContain(GARDEE.nom);
	});

	it.each(LANGUES)(
		'refuses in %s the only manager, before and after confirming, and says what to do here',
		async (langue) => {
			await poserLangueDuCompte(UNIQUE, langue);
			// Sans confirmation, l'écran ne demande pas de confirmer un départ que la base refuserait ;
			// avec, c'est le refus de la base, traduit (déclencheur de la migration 0012).
			for (const confirm of ['', 'yes']) {
				const reponse = await postForm(
					'/conditions/accepter?/quitter',
					{ organizationId: SEULE.id, confirm },
					cookies[UNIQUE]
				);
				expect(reponse.status, confirm).toBe(409);
				const html = await reponse.text();
				expect(element(html, 'confirmer-depart'), confirm).toBe('');
				const refus = element(html, 'refus-depart');
				expect(refus, confirm).toMatch(/role="alert"/);
				expect(lu(refus), confirm).toBe(
					`${QUITTER[langue].seule} ${SEULE.nom} ${ACCEPTER_D_ABORD[langue]}`
				);
				expect(html.indexOf('id="refus-depart"'), confirm).toBeGreaterThan(html.indexOf('<h1'));
				expect(html.indexOf('id="refus-depart"'), confirm).toBeLessThan(
					html.indexOf('<div lang="fr" dir="ltr">')
				);
			}
			expect(await roleDans(UNIQUE, SEULE.id)).toBe('org_admin');
			expect(await acceptations(UNIQUE, SEULE.id)).toBe(0);
		}
	);

	it('answers a form that names another organisation, or no identifier at all, with a sentence', async () => {
		await remettre(SOLO, QUITTEE.id, 'editor');
		await poserLangueDuCompte(SOLO, 'fr');
		for (const organizationId of [SEULE.id, newId(), 'pas-un-identifiant', '']) {
			for (const confirm of ['', 'yes']) {
				const reponse = await postForm(
					'/conditions/accepter?/quitter',
					{ organizationId, confirm },
					cookies[SOLO]
				);
				const cas = `« ${organizationId} » ${confirm}`;
				// Le formulaire ne nomme pas l'organisation de la session : le serveur n'en cherche pas
				// plus, et l'écran le dit comme pour une session changée dans un autre onglet.
				expect(reponse.status, cas).toBe(409);
				const html = await reponse.text();
				expect(lu(element(html, 'organisation-changee')), cas).toBe(
					`${SESSION_CHANGEE.fr.quoi} ${SESSION_CHANGEE.fr.maintenant} ${QUITTEE.nom}`
				);
				expect(element(html, 'refus-depart'), cas).toBe('');
				expect(element(html, 'confirmer-depart'), cas).toBe('');
			}
		}
		// Et rien n'a bougé.
		expect(await roleDans(SOLO, QUITTEE.id)).toBe('editor');
		expect(await roleDans(UNIQUE, SEULE.id)).toBe('org_admin');
	});

	it('sends someone who has already accepted back to the space, and deletes nothing', async () => {
		const reponse = await postForm(
			'/conditions/accepter?/quitter',
			{ organizationId: QUITTEE.id, confirm: 'yes' },
			cookies[DEJA]
		);
		expect(reponse.status).toBe(303);
		expect(reponse.headers.get('location')).toBe('/');
		expect(await roleDans(DEJA, QUITTEE.id)).toBe('editor');
		expect(await acceptations(DEJA, QUITTEE.id)).toBe(1);
	});

	it('refuses a departure that names her other organisation, and keeps it with its acceptance', async () => {
		await remettre(DEUX, QUITTEE.id, 'editor');
		await remettre(DEUX, GARDEE.id, 'editor');
		await poserLangueDuCompte(DEUX, 'fr');
		const cookie = cookies[DEUX] ?? '';
		expect(
			(await postForm('/organisations?/choisir', { organizationId: QUITTEE.id }, cookie)).status
		).toBe(303);
		// L'écran nomme QUITTEE ; le formulaire, trafiqué, nomme GARDEE, où elle a accepté. Les
		// issues sont relevées toutes, puis comparées d'un coup : un échec montre tout ce qui a eu lieu.
		const issues = [];
		for (const confirm of ['', 'yes']) {
			const reponse = await postForm(
				'/conditions/accepter?/quitter',
				{ organizationId: GARDEE.id, confirm },
				cookie
			);
			const html = await reponse.text();
			issues.push({
				confirm,
				statut: reponse.status,
				dit: lu(element(html, 'organisation-changee')),
				demande: element(html, 'confirmer-depart') !== ''
			});
		}
		expect({
			issues,
			gardee: {
				role: await roleDans(DEUX, GARDEE.id),
				acceptees: await acceptations(DEUX, GARDEE.id)
			},
			quittee: await roleDans(DEUX, QUITTEE.id)
		}).toEqual({
			issues: ['', 'yes'].map((confirm) => ({
				confirm,
				statut: 409,
				dit: `${SESSION_CHANGEE.fr.quoi} ${SESSION_CHANGEE.fr.maintenant} ${QUITTEE.nom}`,
				demande: false
			})),
			gardee: { role: 'editor', acceptees: 1 },
			quittee: 'editor'
		});

		// Un autre onglet choisit GARDEE, où elle a accepté : la porte la renvoie à l'accueil de
		// GARDEE, et QUITTEE, que l'écran affiché nommait, n'est pas quittée.
		expect(
			(await postForm('/organisations?/choisir', { organizationId: GARDEE.id }, cookie)).status
		).toBe(303);
		const ailleurs = await postForm(
			'/conditions/accepter?/quitter',
			{ organizationId: QUITTEE.id, confirm: 'yes' },
			cookie
		);
		expect(ailleurs.status).toBe(303);
		expect(ailleurs.headers.get('location')).toBe('/');
		expect(await roleDans(DEUX, QUITTEE.id)).toBe('editor');
		expect(await roleDans(DEUX, GARDEE.id)).toBe('editor');
	});

	it.each(LANGUES)(
		'refuses in %s to accept or to leave once another tab has chosen another organisation, and says so at the top',
		async (langue) => {
			await remettre(CHANGE, QUITTEE.id, 'editor');
			await remettre(CHANGE, AUTRE.id, 'editor');
			await poserLangueDuCompte(CHANGE, langue);
			const cookie = cookies[CHANGE] ?? '';
			// L'écran s'affiche pour QUITTEE : ses deux formulaires la nomment.
			expect(
				(await postForm('/organisations?/choisir', { organizationId: QUITTEE.id }, cookie)).status
			).toBe(303);
			const ecran = await (await get('/conditions/accepter', cookie)).text();
			expect.soft(formulaireDeLaPage(ecran, '?/accepter')?.caches).toEqual({
				organizationId: QUITTEE.id
			});
			expect.soft(formulaireDeLaPage(ecran, '?/quitter')?.caches).toEqual({
				organizationId: QUITTEE.id
			});
			// Un autre onglet choisit AUTRE, où les conditions attendent aussi.
			expect(
				(await postForm('/organisations?/choisir', { organizationId: AUTRE.id }, cookie)).status
			).toBe(303);

			// Ce que l'écran de QUITTEE envoie, bouton par bouton. Les issues sont relevées toutes, puis
			// comparées d'un coup : un échec montre tout ce qui a eu lieu, et ce qui a été enregistré.
			const envois: [string, Record<string, string>][] = [
				['?/accepter', { organizationId: QUITTEE.id }],
				['?/quitter', { organizationId: QUITTEE.id }],
				['?/quitter', { organizationId: QUITTEE.id, confirm: 'yes' }]
			];
			const issues = [];
			for (const [action, champs] of envois) {
				const reponse = await postForm(`/conditions/accepter${action}`, champs, cookie);
				const html = await reponse.text();
				const boite = element(html, 'organisation-changee');
				const position = html.indexOf('id="organisation-changee"');
				issues.push({
					envoi: `${action} ${JSON.stringify(champs)}`,
					statut: reponse.status,
					annonce: /role="alert"/.test(boite),
					dit: lu(boite),
					isole: boite.includes(`<bdi>${AUTRE.nom}</bdi>`),
					// En haut, comme la demande de confirmation : la page s'ouvre là après l'envoi.
					enHaut:
						position > html.indexOf('<h1') && position < html.indexOf('<div lang="fr" dir="ltr">'),
					// L'écran est désormais celui d'AUTRE, et son accord la nomme.
					nommee: formulaireDeLaPage(html, '?/accepter')?.caches['organizationId'] ?? null,
					demande: element(html, 'confirmer-depart') !== ''
				});
			}
			expect({
				issues,
				// Rien n'est accepté, ni pour l'une ni pour l'autre, et elle reste dans les deux.
				acceptees: [await acceptations(CHANGE, QUITTEE.id), await acceptations(CHANGE, AUTRE.id)],
				roles: [await roleDans(CHANGE, QUITTEE.id), await roleDans(CHANGE, AUTRE.id)]
			}).toEqual({
				issues: envois.map(([action, champs]) => ({
					envoi: `${action} ${JSON.stringify(champs)}`,
					statut: 409,
					annonce: true,
					dit: `${SESSION_CHANGEE[langue].quoi} ${SESSION_CHANGEE[langue].maintenant} ${AUTRE.nom}`,
					isole: true,
					enHaut: true,
					nommee: AUTRE.id,
					demande: false
				})),
				acceptees: [0, 0],
				roles: ['editor', 'editor']
			});
		}
	);

	it('sends a departure without a session to sign in', async () => {
		await remettre(SOLO, QUITTEE.id, 'editor');
		const reponse = await postForm('/conditions/accepter?/quitter', {
			organizationId: QUITTEE.id,
			confirm: 'yes'
		});
		expect(reponse.status).toBe(303);
		expect(reponse.headers.get('location')).toBe('/connexion');
		expect(await roleDans(SOLO, QUITTEE.id)).toBe('editor');
	});

	it('sends a departure without an organisation to the choice', async () => {
		const sans = await signIn(SANS_ORGANISATION);
		const reponse = await postForm(
			'/conditions/accepter?/quitter',
			{ organizationId: QUITTEE.id, confirm: 'yes' },
			sans
		);
		expect(reponse.status).toBe(303);
		expect(reponse.headers.get('location')).toBe('/organisations');
	});

	it('sends a super-admin who is a member back to the space, and deletes nothing', async () => {
		// La porte ne l'arrête jamais (ADR 0044) : il n'a rien à refuser, donc rien à quitter d'ici.
		const reponse = await postForm(
			'/conditions/accepter?/quitter',
			{ organizationId: QUITTEE.id, confirm: 'yes' },
			cookies[EXPLOITANT]
		);
		expect(reponse.status).toBe(303);
		expect(reponse.headers.get('location')).toBe('/');
		expect(await roleDans(EXPLOITANT, QUITTEE.id)).toBe('editor');
	});

	it('refuses a departure sent from another site', async () => {
		await remettre(SOLO, QUITTEE.id, 'editor');
		const reponse = await fetch(`${origin}/conditions/accepter?/quitter`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				accept: 'text/html',
				origin: 'https://ailleurs.example',
				cookie: cookies[SOLO] ?? ''
			},
			body: new URLSearchParams({ organizationId: QUITTEE.id, confirm: 'yes' }).toString()
		});
		expect(reponse.status).toBe(403);
		expect(await roleDans(SOLO, QUITTEE.id)).toBe('editor');
	});

	it('leaves one organisation of three, and arrives on the choice of the two others', async () => {
		await poserLangueDuCompte(TROIS, 'fr');
		const cookie = cookies[TROIS] ?? '';
		expect(
			(await postForm('/organisations?/choisir', { organizationId: QUITTEE.id }, cookie)).status
		).toBe(303);
		expect((await get('/', cookie)).headers.get('location')).toBe('/conditions/accepter');
		const reponse = await postForm(
			'/conditions/accepter?/quitter',
			{ organizationId: QUITTEE.id, confirm: 'yes' },
			cookie
		);
		expect(reponse.status).toBe(303);
		const arrivee = new URL(reponse.headers.get('location') ?? '', origin);
		expect(`${arrivee.pathname}${arrivee.search}`).toBe(
			`/organisations?avis=depart&organisation=${QUITTEE.id}`
		);
		expect(await roleDans(TROIS, QUITTEE.id)).toBeUndefined();
		for (const organisation of [GARDEE.id, AUTRE.id]) {
			expect(await roleDans(TROIS, organisation), organisation).toBe('editor');
			expect(await acceptations(TROIS, organisation), organisation).toBe(1);
		}
		// Deux organisations lui restent, et aucune n'est choisie : l'espace la mène au choix.
		expect(await organisationDeLaSession(cookie)).toBeNull();
		expect((await get('/', cookie)).headers.get('location')).toBe('/organisations');
		const page = await get(`${arrivee.pathname}${arrivee.search}`, cookie);
		expect(page.status).toBe(200);
		const html = await page.text();
		expect(lu(element(html, 'avis-depart'))).toBe(PARTIE.fr);
		const proposees = [...html.matchAll(/<form\b[^>]*action="\?\/choisir"[^>]*>[\s\S]*?<\/form>/g)]
			.map(([bloc]) => bloc.match(/name="organizationId" value="([^"]*)"/)?.[1])
			.sort();
		expect(proposees).toEqual([GARDEE.id, AUTRE.id].sort());
	});

	it('draws the button that accepts more than the one that leaves, even on a very light accent', async () => {
		await remettre(SOLO, QUITTEE.id, 'editor');
		await poserLangueDuCompte(SOLO, 'fr');
		await maintenance((tx) =>
			tx.execute(
				sql`update "organization" set "accent_color" = '#ffffff' where "id" = ${QUITTEE.id}`
			)
		);
		try {
			const html = await (await get('/conditions/accepter', cookies[SOLO])).text();
			// Les réglages acceptent cet accent : le bouton qui accepte est alors blanc sur la page.
			const coquille = html.match(/<div\b[^>]*\bclass="coquille[^"]*"[^>]*>/)?.[0] ?? '';
			const variables: Record<string, string> = Object.fromEntries(
				[...coquille.matchAll(/(--accent(?:-texte)?):\s*(#[0-9a-f]{6})/gi)].map((trouve) => [
					trouve[1] ?? '',
					(trouve[2] ?? '').toLowerCase()
				])
			);
			expect(variables).toEqual({ '--accent': '#ffffff', '--accent-texte': '#000000' });

			const classesDe = (action: string) =>
				(formulaireDeLaPage(html, action)?.balise.match(/\bclass="([^"]*)"/)?.[1] ?? '')
					.split(/\s+/)
					.filter(Boolean);
			const portee = classesDe('?/accepter').find((nom) => nom.startsWith('svelte-'));
			expect(portee, 'la classe de portée du composant').toBeTruthy();
			expect(classesDe('?/quitter')).toEqual(['secondaire', portee]);
			const bouton = await declarationsServies(html, '/conditions/accepter', `button.${portee}`);

			// Le bord du bouton qui accepte se voit sur la page, quel que soit l'accent : 3:1 au moins,
			// le seuil des éléments d'une interface (WCAG 1.4.11).
			const bord = couleurDuBord(bouton).replace(
				/^var\((--[a-z-]+)\)$/,
				(tout, nom: string) => variables[nom] ?? tout
			);
			expect.soft(bord, 'la couleur du bord du bouton qui accepte').toMatch(/^#[0-9a-f]{6}$/i);
			expect.soft(contraste(bord, PAGE), `le contraste du bord ${bord}`).toBeGreaterThanOrEqual(3);

			// Le bouton qui fait partir ne dessine ni bord ni fond : il ne ressemble jamais plus à un
			// bouton que celui qui accepte. Un texte souligné, comme un lien.
			const secondaire = [
				...bouton,
				...(await declarationsServies(html, '/conditions/accepter', `button.secondaire.${portee}`))
			];
			expect
				.soft({
					bord: couleurDuBord(secondaire),
					fond: valeurDe(secondaire, 'background'),
					souligne: valeurDe(secondaire, 'text-decoration')
				})
				.toEqual({
					bord: expect.stringMatching(INVISIBLE),
					fond: expect.stringMatching(INVISIBLE),
					souligne: 'underline'
				});
		} finally {
			await maintenance((tx) =>
				tx.execute(
					sql`update "organization" set "accent_color" = '#0f766e' where "id" = ${QUITTEE.id}`
				)
			);
		}
	});
});

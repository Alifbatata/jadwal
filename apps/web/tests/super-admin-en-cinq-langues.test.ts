// Les écrans du super-admin, que comprend seule une personne qui ne connaît rien au service, dans les
// cinq langues (étape 18, retours B2, B1, D2 et A3), servis par HTTP.
//
// B2 : « Créer une organisation », avec ce qu'est une organisation ; « Adresse de la page publique »,
// proposée à partir du nom (par le serveur quand le champ arrive vide, sans JavaScript), avec sa règle,
// un exemple et l'adresse complète ; le fuseau horaire dans une liste de noms canoniques, Europe/Zurich
// choisi, l'Europe en tête ; le lien de connexion de secours, qui dit quand s'en servir, ce qui se passe
// et combien de temps il vaut. D2 et A3 : la console et l'écran de la passkey en cinq langues, erreurs
// comprises, sans une phrase française restée, sans date écrite comme la base l'écrit.
//
// Vrai serveur construit, vraie base, formulaires envoyés comme sans JavaScript. La proposition pendant
// la frappe, elle, est la même fonction que celle du serveur (`public-address.test.ts`).

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { isCanonicalTimeZone } from '@jadwal/core/ics';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';
import { frenchLeft, ISO_DATE, textSegments, visibleText } from './textes-lus.js';

const origin = inject('origin');
const outbox = inject('outbox');
const testDatabase = inject('testDatabase');

/** L'hôte tel que l'écran l'écrit devant l'adresse d'une page publique. */
const HOTE = new URL(origin).host;

const LANGUES = ['fr', 'de', 'it', 'en', 'ar'] as const;
type Langue = (typeof LANGUES)[number];
const SENS: Record<Langue, 'ltr' | 'rtl'> = {
	fr: 'ltr',
	de: 'ltr',
	it: 'ltr',
	en: 'ltr',
	ar: 'rtl'
};

/** L'exploitant, drapeau posé par le propriétaire : aucune interface ne le pose. */
const EXPLOITANT = 'sa-exploitant@example.test';
const EXISTANTE = 'Association déjà là';
const EXISTANTE_ADRESSE = 'sa-deja-la';
/**
 * La passkey d'essai est enregistrée le 5 mars à 23:30 UTC : en Suisse, où le service est exploité,
 * il est déjà 00:30 le 6. L'écran écrit le jour de la Suisse, jamais celui de Greenwich, et jamais
 * comme la base l'écrit.
 */
const PASSKEY_CREEE = '2026-03-05 23:30:00+00';
const PASSKEY_LE = '2026-03-05';
const PASSKEY_JOUR_UTC = '05.03.2026';
const PASSKEY_LE_AFFICHE = '06.03.2026';

/**
 * Le titre de l'onglet de chaque écran, dans chaque langue. « Super-admin » s'écrit de même en
 * français et en italien, comme dans la navigation (`common.ts`).
 */
const TITRES: Record<'/super-admin' | '/super-admin/passkey', Record<Langue, string>> = {
	'/super-admin': {
		fr: 'Super-admin',
		de: 'Super-Admin',
		it: 'Super-admin',
		en: 'Super admin',
		ar: 'المشرف العام'
	},
	'/super-admin/passkey': {
		fr: 'Votre passkey',
		de: 'Ihr Passkey',
		it: 'La tua passkey',
		en: 'Your passkey',
		ar: 'مفتاح المرور الخاص بك'
	}
};

let ownerHandle: DatabaseHandle;
let exploitantId: string;
let existanteId: string;
/** Session ouverte par lien magique, qui recevra la preuve de la passkey. */
let avecPouvoirs: string;
/** Seconde session du même compte, ouverte par lien magique seulement : aucun pouvoir. */
let sansPouvoirs: string;

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

async function langueDuCompte(langue: Langue): Promise<void> {
	await maintenance((tx) =>
		tx.execute(sql`update "user" set "language" = ${langue} where "email" = ${EXPLOITANT}`)
	);
}

/** L'organisation portant cette adresse, relevée par le propriétaire. */
async function organisationA(
	adresse: string
): Promise<{ name: string; time_zone: string } | undefined> {
	const trouve = await maintenance(async (tx) =>
		lignes<{ name: string; time_zone: string }>(
			await tx.execute(
				sql`select "name", "time_zone" from "organization" where "slug" = ${adresse}`
			)
		)
	);
	return trouve[0];
}

async function nombreDOrganisations(): Promise<number> {
	const trouve = await maintenance(async (tx) =>
		lignes<{ n: number }>(await tx.execute(sql`select count(*)::int as "n" from "organization"`))
	);
	return trouve[0]?.n ?? -1;
}

async function get(chemin: string, cookie: string): Promise<Response> {
	return fetch(`${origin}${chemin}`, { redirect: 'manual', headers: { cookie } });
}

/** Poste un formulaire comme un navigateur sans JavaScript : encodage de formulaire et origine. */
async function postForm(
	chemin: string,
	champs: Record<string, string>,
	cookie = ''
): Promise<Response> {
	return fetch(`${origin}${chemin}`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			accept: 'text/html',
			origin,
			...(cookie ? { cookie } : {})
		},
		body: new URLSearchParams(champs).toString()
	});
}

function baliseHtml(html: string): string {
	return html.match(/<html\b[^>]*>/)?.[0] ?? '';
}

function titre(html: string): string {
	return (html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim();
}

/** Le texte lu d'un fragment de page : un élément, et ce qu'il contient. */
function texteDe(fragment: string): string {
	return visibleText(`<body>${fragment}</body>`);
}

/** Le premier élément dont la balise d'ouverture répond au motif, contenu compris. */
function element(html: string, ouverture: RegExp, balise: string): string {
	const debut = html.search(ouverture);
	if (debut < 0) return '';
	const fin = html.indexOf(`</${balise}>`, debut);
	return fin < 0 ? '' : html.slice(debut, fin + balise.length + 3);
}

/** La section dont le titre porte cet identifiant. */
function section(html: string, titreId: string): string {
	return element(html, new RegExp(`<section\\b[^>]*aria-labelledby="${titreId}"`), 'section');
}

/** Le texte du libellé d'un champ, par son identifiant. */
function libelle(html: string, pour: string): string {
	return texteDe(element(html, new RegExp(`<label\\b[^>]*for="${pour}"`), 'label'));
}

/** La valeur d'un champ de texte, par son identifiant, telle que la page la rend. */
function valeurDuChamp(html: string, id: string): string | undefined {
	const champ = html.match(new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`))?.[0] ?? '';
	const valeur = champ.match(/\bvalue="([^"]*)"/)?.[1];
	return valeur?.replaceAll('&quot;', '"').replaceAll('&amp;', '&');
}

/** Le message d'erreur que la page annonce, s'il y en a un. */
function erreur(html: string): string {
	return texteDe(element(html, /<p\b[^>]*role="alert"/, 'p'));
}

async function courrielsA(email: string): Promise<{ text: string }[]> {
	const noms = (await readdir(outbox)).filter((nom) => nom.endsWith('.json')).sort();
	return noms
		.map(
			(nom) => JSON.parse(readFileSync(join(outbox, nom), 'utf8')) as { to: string; text: string }
		)
		.filter((courriel) => courriel.to === email);
}

/** Se connecte par le lien reçu, comme le ferait une personne : rend le cookie de session. */
async function signIn(email: string): Promise<string> {
	await maintenance((tx) => tx.execute(sql`delete from "rate_limit"`));
	await postForm('/connexion', { email });
	const lien = (await courrielsA(email)).at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
	expect(lien, `aucun lien envoyé à ${email}`).toBeTruthy();
	const suivi = await fetch(lien as string, { redirect: 'manual' });
	const session = (suivi.headers.getSetCookie?.() ?? [])
		.find((valeur) => valeur.startsWith('better-auth.session_token='))
		?.split(';')[0];
	expect(session, `aucune session posée pour ${email}`).toBeTruthy();
	return session as string;
}

/**
 * La preuve qu'une passkey donnerait à la session, comme dans `acces.test.ts` : la cérémonie
 * WebAuthn n'existe que dans un navigateur, la règle, elle, est celle du serveur. La passkey porte
 * une date d'enregistrement connue, pour lire comment l'écran l'écrit.
 */
async function preuvePasskey(cookie: string): Promise<void> {
	const jeton = decodeURIComponent(cookie.split('=')[1] ?? '').split('.')[0] ?? '';
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "passkey" ("id", "name", "public_key", "user_id", "credential_id", "counter",
				"device_type", "backed_up", "created_at")
			values (${newId()}, 'Téléphone', 'cle-publique', ${exploitantId}, ${newId()}, 0,
				'singleDevice', false, ${PASSKEY_CREEE})
		`);
		await tx.execute(
			sql`update "session" set "passkey_verified_at" = now() where "token" = ${jeton}`
		);
	});
}

/** Les options du choix du fuseau, dans l'ordre, avec leur groupe et celle qui est choisie. */
function fuseaux(html: string): { valeur: string; groupe: string; choisi: boolean }[] {
	const choix = element(html, /<select\b[^>]*name="timeZone"/, 'select');
	const options: { valeur: string; groupe: string; choisi: boolean }[] = [];
	let groupe = '';
	for (const trouve of choix.matchAll(/<optgroup\b[^>]*label="([^"]*)"|<option\b([^>]*)>/g)) {
		if (trouve[1] !== undefined) {
			groupe = trouve[1];
			continue;
		}
		const attributs = trouve[2] ?? '';
		options.push({
			valeur: attributs.match(/\bvalue="([^"]*)"/)?.[1] ?? '',
			groupe,
			choisi: /\bselected\b/.test(attributs)
		});
	}
	return options;
}

/**
 * Ce qui est pareil dans toutes les langues par nature : l'adresse du compte, et tout ce que l'écran
 * isole dans un `<bdi>`, parce que c'est un nom ou une adresse qui garde son sens dans une phrase
 * arabe (les organisations, dont celles que les autres fichiers de test créent dans la même base, la
 * passkey, les exemples d'adresse). Puis les noms des fuseaux horaires, noms propres de la base IANA,
 * et le titre de la console en italien, qui s'écrit comme en français : `TITRES` le tient langue par
 * langue.
 */
function permis(html: string): string[] {
	const isoles = [...html.matchAll(/<bdi\b[^>]*>[\s\S]*?<\/bdi>/g)].flatMap((trouve) => [
		...textSegments(`<body>${trouve[0]}</body>`)
	]);
	const libellesDesFuseaux = [...textSegments(html)].filter((morceau) =>
		/^[A-Za-z_]+(?:\/[A-Za-z_ -]+)+$/.test(morceau)
	);
	return [EXPLOITANT, `${TITRES['/super-admin'].it} | jadwal`, ...isoles, ...libellesDesFuseaux];
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	exploitantId = newId();
	existanteId = newId();
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language")
			values (${existanteId}, ${EXISTANTE_ADRESSE}, ${EXISTANTE}, 'Europe/Zurich', 'fr', array['fr'])
		`);
		await tx.execute(sql`
			insert into "user" ("id", "email", "email_verified", "is_super_admin", "language")
			values (${exploitantId}, ${EXPLOITANT}, true, true, 'fr')
		`);
	});
	avecPouvoirs = await signIn(EXPLOITANT);
	sansPouvoirs = await signIn(EXPLOITANT);
});

afterAll(async () => {
	await ownerHandle?.close();
});

describe('la passkey, la première fois', () => {
	it('explains what a passkey is and why, in the five languages, before the first one', async () => {
		const pages: Partial<Record<Langue, string>> = {};
		for (const langue of LANGUES) {
			await langueDuCompte(langue);
			const reponse = await get('/super-admin/passkey', sansPouvoirs);
			expect(reponse.status, langue).toBe(200);
			pages[langue] = await reponse.text();
			expect(baliseHtml(pages[langue]), langue).toBe(
				`<html lang="${langue}" dir="${SENS[langue]}">`
			);
		}
		const francais = pages.fr ?? '';
		for (const langue of LANGUES) {
			expect(titre(pages[langue] ?? ''), langue).toBe(
				`${TITRES['/super-admin/passkey'][langue]} | jadwal`
			);
		}
		expect(visibleText(francais)).toContain(
			'Une passkey est une clé de connexion que votre appareil garde pour vous'
		);
		expect(visibleText(francais)).toContain('Aucune passkey n’est encore enregistrée.');
		for (const langue of LANGUES.slice(1)) {
			expect(frenchLeft(francais, pages[langue] ?? '', permis(francais)), langue).toEqual([]);
		}
	});
});

describe('les écrans du super-admin, avec ses pouvoirs', () => {
	beforeAll(async () => {
		await preuvePasskey(avecPouvoirs);
		await langueDuCompte('fr');
	});

	describe('B2 : créer une organisation', () => {
		it('names the form « Créer une organisation » and says what an organisation is', async () => {
			const html = await (await get('/super-admin', avecPouvoirs)).text();
			const creer = section(html, 'creer-titre');
			expect(texteDe(creer)).toContain(
				'Créer une organisation Une organisation est l’espace d’une association, d’une école ou d’un club : son programme, ses membres et sa page publique.'
			);
			expect(texteDe(element(creer, /<button\b[^>]*type="submit"/, 'button'))).toBe(
				'Créer l’organisation'
			);
			expect(visibleText(html)).not.toContain('Ouvrir une organisation');
			expect(libelle(html, 'name')).toBe('Nom de l’organisation');
			// Un nom s'écrit en lettres latines ou arabes : le champ prend le sens de ce qu'on y tape,
			// et « Club 2000 ! » ne devient pas « ! Club 2000 » sur l'écran arabe.
			expect(html.match(/<input\b[^>]*\bid="name"[^>]*>/)?.[0] ?? '').toMatch(/\bdir="auto"/);
		});

		it('labels the address « Adresse de la page publique », with its rule, an example and the full address', async () => {
			const html = await (await get('/super-admin', avecPouvoirs)).text();
			const creer = texteDe(section(html, 'creer-titre'));
			expect(libelle(html, 'slug')).toBe('Adresse de la page publique');
			expect(visibleText(html)).not.toContain('Identifiant d’URL');
			expect(creer).toContain(
				'Elle est proposée à partir du nom, et vous pouvez la modifier. Si vous la laissez vide, elle est formée à partir du nom.'
			);
			expect(creer).toContain(
				'Lettres minuscules sans accent ni cédille, chiffres et traits d’union. Exemple : mosquee-madretsch'
			);
			// L'adresse complète, qui vient de l'origine du serveur, jamais d'un nom écrit en dur.
			expect(creer).toContain(`Adresse complète : ${HOTE}/m/`);
			const champ = html.match(/<input\b[^>]*\bid="slug"[^>]*>/)?.[0] ?? '';
			// Le champ peut rester vide : c'est alors le serveur qui propose l'adresse.
			expect(champ).not.toMatch(/\brequired\b/);
			expect(champ).toContain('pattern="[a-z0-9]+(-[a-z0-9]+)*"');
		});

		it('says in German that the address takes no Umlaut, in the rule and in both errors', async () => {
			// Pour qui parle allemand, ä, ö et ü sont des Umlaute, pas des accents : « ohne Akzente »
			// laissait croire que « zürich-moschee » convenait. Le français dit de même la cédille,
			// qui n'est pas un accent non plus : les tests voisins lisent ses textes exacts.
			await langueDuCompte('de');
			try {
				const html = await (await get('/super-admin', avecPouvoirs)).text();
				expect
					.soft(texteDe(section(html, 'creer-titre')))
					.toContain(
						'Kleinbuchstaben ohne Umlaute und Akzente, Ziffern und Bindestriche. Beispiel: moschee-madretsch'
					);
				const refusee = await postForm(
					'/super-admin?/ouvrir',
					{ name: 'Moschee Zürich', slug: 'zürich-moschee', timeZone: 'Europe/Zurich' },
					avecPouvoirs
				);
				expect(refusee.status).toBe(400);
				expect
					.soft(erreur(await refusee.text()))
					.toContain(
						'Sie darf nur Kleinbuchstaben ohne Umlaute und Akzente, Ziffern und Bindestriche enthalten'
					);
				const sansAdresse = await postForm(
					'/super-admin?/ouvrir',
					{ name: 'مسجد السلام', slug: '', timeZone: 'Europe/Zurich' },
					avecPouvoirs
				);
				expect(sansAdresse.status).toBe(400);
				expect
					.soft(erreur(await sansAdresse.text()))
					.toContain('mit Kleinbuchstaben ohne Umlaute und Akzente, Ziffern und Bindestrichen.');
			} finally {
				await langueDuCompte('fr');
			}
		});

		it('offers the time zone in a list of canonical names, Europe/Zurich chosen, Europe first', async () => {
			const html = await (await get('/super-admin', avecPouvoirs)).text();
			expect(libelle(html, 'timeZone')).toBe('Fuseau horaire');
			expect(texteDe(section(html, 'creer-titre'))).toContain(
				'Il sert à afficher les heures du programme à l’heure du lieu de l’organisation et à calculer les heures de prière. En Suisse : Europe/Zurich.'
			);
			const options = fuseaux(html);
			expect(options.length).toBeGreaterThan(300);
			expect(options.filter((option) => option.choisi).map((option) => option.valeur)).toEqual([
				'Europe/Zurich'
			]);
			const premierHorsEurope = options.findIndex((option) => !option.valeur.startsWith('Europe/'));
			expect(premierHorsEurope).toBeGreaterThan(30);
			expect(options.slice(premierHorsEurope).some((o) => o.valeur.startsWith('Europe/'))).toBe(
				false
			);
			expect(new Set(options.slice(0, premierHorsEurope).map((option) => option.groupe))).toEqual(
				new Set(['Europe'])
			);
			expect(options[premierHorsEurope]?.groupe).toBe('Reste du monde');
			// Rien que des noms canoniques : un alias pourrait désigner un autre fuseau demain.
			expect(options.filter((option) => !isCanonicalTimeZone(option.valeur))).toEqual([]);
			expect(options.map((option) => option.valeur)).not.toContain('Europe/Amsterdam');
			expect(options.map((option) => option.valeur)).toEqual(
				expect.arrayContaining(['Europe/Paris', 'America/New_York', 'Asia/Karachi'])
			);
		});

		it('proposes the address from the name when the field arrives empty, without JavaScript', async () => {
			const reponse = await postForm(
				'/super-admin?/ouvrir',
				{ name: 'Mosquée Madretsch', slug: '', timeZone: 'Europe/Zurich' },
				avecPouvoirs
			);
			expect(reponse.status).toBe(200);
			expect(await organisationA('mosquee-madretsch')).toEqual({
				name: 'Mosquée Madretsch',
				time_zone: 'Europe/Zurich'
			});
			const confirme = texteDe(
				element(await reponse.text(), /<section\b[^>]*class="succes[\s"]/, 'section')
			);
			expect(confirme).toContain('L’organisation est créée : Mosquée Madretsch');
			expect(confirme).toContain(`Sa page publique : ${HOTE}/m/mosquee-madretsch`);
		});

		it('keeps the address written by hand, and the time zone chosen', async () => {
			const reponse = await postForm(
				'/super-admin?/ouvrir',
				{ name: 'Centre de Bienne', slug: 'centre-bienne', timeZone: 'Europe/Berlin' },
				avecPouvoirs
			);
			expect(reponse.status).toBe(200);
			expect(await organisationA('centre-bienne')).toEqual({
				name: 'Centre de Bienne',
				time_zone: 'Europe/Berlin'
			});
		});

		it.each([
			['Mosquée-Madretsch', 'une majuscule et un accent'],
			['-madretsch', 'un trait d’union au début'],
			['mosquee--madretsch', 'deux traits d’union de suite'],
			['mosquee madretsch', 'une espace']
		])('refuses the address « %s » (%s), and says the rule', async (adresse) => {
			const avant = await nombreDOrganisations();
			const reponse = await postForm(
				'/super-admin?/ouvrir',
				{ name: 'Mosquée refusée', slug: adresse, timeZone: 'Europe/Zurich' },
				avecPouvoirs
			);
			expect(reponse.status).toBe(400);
			expect(erreur(await reponse.text())).toBe(
				'Cette adresse ne convient pas. Elle ne peut contenir que des lettres minuscules sans accent ni cédille, des chiffres et des traits d’union, un seul entre deux mots, jamais au début ni à la fin. Exemple : mosquee-madretsch'
			);
			expect(await nombreDOrganisations()).toBe(avant);
		});

		it('refuses an address already taken, and says so instead of failing', async () => {
			const reponse = await postForm(
				'/super-admin?/ouvrir',
				{ name: 'Une autre', slug: EXISTANTE_ADRESSE, timeZone: 'Europe/Zurich' },
				avecPouvoirs
			);
			expect(reponse.status).toBe(400);
			expect(erreur(await reponse.text())).toBe(
				'Cette adresse est déjà celle d’une autre organisation. Choisissez-en une autre, par exemple en y ajoutant le nom de la ville.'
			);
		});

		it('asks for the address when the name gives none', async () => {
			const avant = await nombreDOrganisations();
			const reponse = await postForm(
				'/super-admin?/ouvrir',
				{ name: 'مسجد السلام', slug: '', timeZone: 'Europe/Zurich' },
				avecPouvoirs
			);
			expect(reponse.status).toBe(400);
			expect(erreur(await reponse.text())).toBe(
				'Le nom ne permet pas de proposer une adresse. Écrivez-la vous-même, en lettres minuscules sans accent ni cédille, chiffres et traits d’union. Exemple : mosquee-madretsch'
			);
			expect(await nombreDOrganisations()).toBe(avant);
		});

		it.each([
			['Mosquée-Voisine', 'une adresse refusée'],
			[EXISTANTE_ADRESSE, 'une adresse déjà prise']
		])(
			'gives back the name, the address and the time zone typed after an error (%s, %s)',
			async (adresse) => {
				const reponse = await postForm(
					'/super-admin?/ouvrir',
					{ name: 'Association d’à côté', slug: adresse, timeZone: 'Europe/Berlin' },
					avecPouvoirs
				);
				expect(reponse.status).toBe(400);
				const html = await reponse.text();
				expect(erreur(html)).not.toBe('');
				// Rien n'est à écrire une seconde fois : ni le nom, ni l'adresse, ni le fuseau choisi.
				expect(valeurDuChamp(html, 'name')).toBe('Association d’à côté');
				expect(valeurDuChamp(html, 'slug')).toBe(adresse);
				expect(fuseaux(html).filter((option) => option.choisi)).toEqual([
					{ valeur: 'Europe/Berlin', groupe: 'Europe', choisi: true }
				]);
			}
		);

		it('chooses Europe/Zurich again when the time zone sent is not in the list', async () => {
			// Un nom hors de la liste ne peut être choisi dans aucune option : sans cela, aucune ne
			// serait choisie, et le navigateur prendrait la première, Europe/Andorra.
			const reponse = await postForm(
				'/super-admin?/ouvrir',
				{ name: 'Club du fuseau perdu', slug: 'club-fuseau-perdu', timeZone: 'Mars/Olympus' },
				avecPouvoirs
			);
			expect(reponse.status).toBe(400);
			const html = await reponse.text();
			expect(erreur(html)).toBe('Choisissez le fuseau horaire dans la liste.');
			expect(valeurDuChamp(html, 'name')).toBe('Club du fuseau perdu');
			expect(fuseaux(html).filter((option) => option.choisi)).toEqual([
				{ valeur: 'Europe/Zurich', groupe: 'Europe', choisi: true }
			]);
		});

		it.each([
			['Europe/Amsterdam', 'un alias, qui pointe vers le fuseau d’un autre pays'],
			['Europe/Nulle-Part', 'un nom inventé'],
			['', 'rien']
		])('refuses the time zone « %s » (%s)', async (fuseau) => {
			const avant = await nombreDOrganisations();
			const reponse = await postForm(
				'/super-admin?/ouvrir',
				{ name: 'Club du fuseau', slug: `club-fuseau-${avant}`, timeZone: fuseau },
				avecPouvoirs
			);
			expect(reponse.status).toBe(400);
			expect(erreur(await reponse.text())).toBe('Choisissez le fuseau horaire dans la liste.');
			expect(await nombreDOrganisations()).toBe(avant);
		});
	});

	describe('B2 : le lien de connexion de secours', () => {
		it('says when to use it, what happens and how long it lasts', async () => {
			const html = await (await get('/super-admin', avecPouvoirs)).text();
			expect(texteDe(section(html, 'lien-titre'))).toContain(
				[
					'Lien de connexion de secours',
					'Servez-vous-en quand une personne ne reçoit pas le courriel de connexion, par exemple si l’envoi des courriels est en panne.',
					'Le lien s’affiche ici au lieu de partir par courriel : envoyez-le à la personne par un message, et, en l’ouvrant, elle entre dans son compte comme avec le lien habituel.',
					'Il est valable quinze minutes et ne sert qu’une fois.'
				].join(' ')
			);
			expect(libelle(html, 'email')).toBe('Adresse électronique de la personne');
		});

		it('shows the link with what it opens and what it does not', async () => {
			const reponse = await postForm(
				'/super-admin?/lienSecours',
				{ email: 'sa-secours@example.test' },
				avecPouvoirs
			);
			expect(reponse.status).toBe(200);
			const lu = texteDe(
				element(await reponse.text(), /<section\b[^>]*class="secours[\s"]/, 'section')
			);
			expect(lu).toContain('Lien de connexion pour sa-secours@example.test');
			expect(lu).toContain(
				'Copiez-le et envoyez-le à cette personne par un message. Il est valable quinze minutes à partir de maintenant et ne sert qu’une fois.'
			);
			expect(lu).toContain(
				'Il ouvre son compte et ses organisations, sans aucun pouvoir de super-admin, même pour votre propre adresse. Si l’adresse n’a pas encore de compte, il en crée un, rattaché à aucune organisation.'
			);
		});
	});

	describe('B1 : la liste des organisations', () => {
		/** La carte d'une organisation de la liste, par son nom. */
		function carte(html: string, nom: string): string {
			const liste = section(html, 'liste-titre');
			return (
				[...liste.matchAll(/<li\b[\s\S]*?<\/li>/g)]
					.map((trouve) => trouve[0])
					.find((morceau) => texteDe(morceau).includes(nom)) ?? ''
			);
		}

		it('shows the public page of each organisation, and says once what each action does', async () => {
			const html = await (await get('/super-admin', avecPouvoirs)).text();
			const lue = texteDe(carte(html, EXISTANTE));
			// L'adresse complète de sa page publique, et non plus l'identifiant technique seul.
			expect(lue).toContain(`Page publique : ${HOTE}/m/${EXISTANTE_ADRESSE}`);
			expect(lue).toContain('Enregistrer le plan');
			expect(lue).toContain('Enregistrer l’état');
			expect(lue).not.toContain('Changer');
			expect(texteDe(section(html, 'liste-titre'))).toContain(
				[
					'Entrer dans son espace',
					'Vous y voyez et modifiez tout, comme sa personne responsable. Une bannière le rappelle en haut de chaque écran.',
					'Plan',
					'Noté pour le suivi. Aucun paiement n’est demandé pour le moment, et le plan ne change rien à ce que l’organisation peut faire.',
					'État',
					'Une organisation suspendue n’a plus de page publique : ni sa page, ni son widget, ni son agenda ne s’affichent. Rien n’est effacé, et vous pouvez la réactiver.'
				].join(' ')
			);
		});

		it('confirms a saved plan or status by the name of the organisation, and says when it does not exist', async () => {
			// Le texte tel qu'il s'affiche, balises retirées : le point suit le nom sans espace, ce que
			// `visibleText`, qui sépare chaque morceau par une espace, ne montrerait pas.
			const confirmation = (html: string) =>
				element(html, /<p\b[^>]*class="succes[\s"][^>]*role="status"/, 'p')
					.replace(/<!--[\s\S]*?-->|<[^>]+>/g, '')
					.replace(/\s+/g, ' ')
					.trim();
			const plan = await postForm(
				'/super-admin?/plan',
				{ organizationId: existanteId, plan: 'sponsored' },
				avecPouvoirs
			);
			expect(plan.status).toBe(200);
			expect(confirmation(await plan.text())).toBe(`Plan enregistré pour ${EXISTANTE}.`);
			const etat = await postForm(
				'/super-admin?/statut',
				{ organizationId: existanteId, status: 'active' },
				avecPouvoirs
			);
			expect(etat.status).toBe(200);
			expect(confirmation(await etat.text())).toBe(`État enregistré pour ${EXISTANTE}.`);

			// Une organisation qui n'existe pas, ou plus : rien n'est enregistré, et l'écran le dit au
			// lieu de confirmer.
			for (const [chemin, champs] of [
				['/super-admin?/plan', { organizationId: newId(), plan: 'paid' }],
				['/super-admin?/statut', { organizationId: newId(), status: 'suspended' }]
			] as const) {
				const reponse = await postForm(chemin, champs, avecPouvoirs);
				expect(reponse.status, chemin).toBe(404);
				expect(erreur(await reponse.text()), chemin).toBe(
					'Cette organisation n’existe pas, ou plus.'
				);
			}
		});

		it('answers an organisation id that is not an identifier like an unknown organisation', async () => {
			// Un formulaire forgé, ou abîmé en route : l'identifiant n'atteint pas la base, qui le
			// refuserait en erreur du serveur, et l'écran dit la même chose que pour une organisation
			// inconnue.
			for (const identifiant of ['pas-un-identifiant', '']) {
				for (const [chemin, champs] of [
					['/super-admin?/plan', { organizationId: identifiant, plan: 'paid' }],
					['/super-admin?/statut', { organizationId: identifiant, status: 'suspended' }],
					['/super-admin?/entrer', { organizationId: identifiant }]
				] as const) {
					// `expect.soft` : chaque action et chaque identifiant disent leur résultat, même après
					// un premier échec.
					const reponse = await postForm(chemin, champs, avecPouvoirs);
					expect.soft(reponse.status, `${chemin} « ${identifiant} »`).toBe(404);
					expect
						.soft(erreur(await reponse.text()), `${chemin} « ${identifiant} »`)
						.toBe('Cette organisation n’existe pas, ou plus.');
				}
			}
		});
	});

	describe('D2 et A3 : les écrans en cinq langues', () => {
		const ECRANS = [
			['/super-admin', 'la console'],
			['/super-admin/passkey', 'la passkey, pouvoirs actifs']
		] as const;

		it.each(ECRANS)(
			'serves %s (%s) in each language, with no French left and no date as the database writes it',
			async (chemin) => {
				const pages: Partial<Record<Langue, string>> = {};
				for (const langue of LANGUES) {
					await langueDuCompte(langue);
					const reponse = await get(chemin, avecPouvoirs);
					expect(reponse.status, langue).toBe(200);
					const html = await reponse.text();
					pages[langue] = html;
					expect(baliseHtml(html), langue).toBe(`<html lang="${langue}" dir="${SENS[langue]}">`);
					expect(titre(html), langue).toBe(`${TITRES[chemin][langue]} | jadwal`);
					expect(visibleText(html), langue).not.toMatch(ISO_DATE);
				}
				const francais = pages.fr ?? '';
				for (const langue of LANGUES.slice(1)) {
					expect(frenchLeft(francais, pages[langue] ?? '', permis(francais)), langue).toEqual([]);
				}
			}
		);

		it('serves the passkey screen of a session without powers in each language', async () => {
			const pages: Partial<Record<Langue, string>> = {};
			for (const langue of LANGUES) {
				await langueDuCompte(langue);
				pages[langue] = await (await get('/super-admin/passkey', sansPouvoirs)).text();
			}
			const francais = pages.fr ?? '';
			expect(visibleText(francais)).toContain(
				'Vous êtes connecté avec le lien reçu par courriel : cette session n’a aucun pouvoir de super-admin.'
			);
			for (const langue of LANGUES.slice(1)) {
				expect(frenchLeft(francais, pages[langue] ?? '', permis(francais)), langue).toEqual([]);
			}
		});

		it('writes the day a passkey was registered as JJ.MM.AAAA, the day of Switzerland', async () => {
			for (const langue of LANGUES) {
				await langueDuCompte(langue);
				const lu = visibleText(await (await get('/super-admin/passkey', avecPouvoirs)).text());
				expect(lu, langue).toContain(PASSKEY_LE_AFFICHE);
				expect(lu, langue).not.toContain(PASSKEY_LE);
				expect(lu, langue).not.toContain(PASSKEY_JOUR_UTC);
			}
		});

		it('gives its error messages in each language', async () => {
			const erreurs: Record<string, Partial<Record<Langue, string>>> = {};
			const cas = {
				adresse: [
					'/super-admin?/ouvrir',
					{ name: 'Club', slug: 'Club!', timeZone: 'Europe/Zurich' }
				],
				fuseau: [
					'/super-admin?/ouvrir',
					{ name: 'Club', slug: 'club-x', timeZone: 'Mars/Olympus' }
				],
				nom: ['/super-admin?/ouvrir', { name: ' ', slug: 'club-y', timeZone: 'Europe/Zurich' }],
				prise: [
					'/super-admin?/ouvrir',
					{ name: 'Club', slug: EXISTANTE_ADRESSE, timeZone: 'Europe/Zurich' }
				],
				courriel: ['/super-admin?/lienSecours', { email: 'pas-une-adresse' }],
				plan: ['/super-admin?/plan', { organizationId: newId(), plan: 'offert-a-vie' }],
				etat: ['/super-admin?/statut', { organizationId: newId(), status: 'fermee' }]
			} as const;
			for (const langue of LANGUES) {
				await langueDuCompte(langue);
				for (const [nom, [chemin, champs]] of Object.entries(cas)) {
					const reponse = await postForm(chemin, champs, avecPouvoirs);
					expect(reponse.status, `${nom} ${langue}`).toBe(400);
					const html = await reponse.text();
					expect(baliseHtml(html), `${nom} ${langue}`).toBe(
						`<html lang="${langue}" dir="${SENS[langue]}">`
					);
					(erreurs[nom] ??= {})[langue] = erreur(html);
				}
			}
			for (const [nom, parLangue] of Object.entries(erreurs)) {
				expect(parLangue.fr, nom).toBeTruthy();
				for (const langue of LANGUES.slice(1)) {
					expect(parLangue[langue], `${nom} ${langue}`).toBeTruthy();
					expect(parLangue[langue], `${nom} ${langue}`).not.toBe(parLangue.fr);
				}
			}
		});

		it('confirms each success in each language, with no French left', async () => {
			/** Le bloc qui confirme une création, un plan, un état ou un lien de secours. */
			const confirmation = (html: string) =>
				texteDe(
					element(html, /<section\b[^>]*class="(?:succes|secours)[\s"]/, 'section') ||
						element(html, /<p\b[^>]*class="succes[\s"]/, 'p')
				);
			const pages: Record<string, Partial<Record<Langue, string>>> = {};
			for (const langue of LANGUES) {
				await langueDuCompte(langue);
				const cas = {
					creation: [
						'/super-admin?/ouvrir',
						{ name: `Centre ${langue}`, slug: `centre-succes-${langue}`, timeZone: 'Europe/Zurich' }
					],
					plan: ['/super-admin?/plan', { organizationId: existanteId, plan: 'free' }],
					etat: ['/super-admin?/statut', { organizationId: existanteId, status: 'active' }],
					secours: ['/super-admin?/lienSecours', { email: `sa-succes-${langue}@example.test` }]
				} as const;
				for (const [nom, [chemin, champs]] of Object.entries(cas)) {
					const reponse = await postForm(chemin, champs, avecPouvoirs);
					expect(reponse.status, `${nom} ${langue}`).toBe(200);
					(pages[nom] ??= {})[langue] = await reponse.text();
				}
			}
			for (const [nom, parLangue] of Object.entries(pages)) {
				const francais = parLangue.fr ?? '';
				expect(confirmation(francais), nom).not.toBe('');
				for (const langue of LANGUES.slice(1)) {
					const html = parLangue[langue] ?? '';
					expect(baliseHtml(html), `${nom} ${langue}`).toBe(
						`<html lang="${langue}" dir="${SENS[langue]}">`
					);
					expect(confirmation(html), `${nom} ${langue}`).not.toBe('');
					// `expect.soft` : chaque geste et chaque langue disent ce qui y reste de français.
					expect.soft(frenchLeft(francais, html, permis(francais)), `${nom} ${langue}`).toEqual([]);
				}
			}
		});
	});
});

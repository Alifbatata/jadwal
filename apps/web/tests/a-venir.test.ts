// L'écran « À venir » (étape 18, retours A1, A2 et D1, et pour cet écran B1, D2 et A3), servi par
// HTTP : vrai serveur construit, vraie base, formulaires envoyés comme sans JavaScript.
//
// - A1 : les options de chaque séance sont fermées par défaut, chaque carte a les siennes, et le
//   bouton qui annule ne se trouve que derrière elles. C'est la page servie qui est lue : ce qu'elle
//   montre sans JavaScript est ce que ces tests voient.
// - A2 : une séance se déplace à toute date à partir d'aujourd'hui, plus tôt comme plus tard que la
//   date prévue. L'action refuse une date passée, avec une phrase claire, et n'écrit rien. Elle
//   refuse aussi un déplacement qui ne change rien, la même date à l'heure déjà prévue (relecture du
//   lot 3), et répond par une phrase, jamais par une erreur 500, à une heure hors plage, à un
//   identifiant mal formé ou à un cours inconnu.
// - D1 : les messages prêts à coller s'écrivent dans chacune des langues que l'organisation publie,
//   la langue source d'abord : la langue par défaut pour le programme de la semaine, celle du cours
//   pour une annulation ou un déplacement. Le nom de chaque zone de texte dit sa langue.
// - D2, A3, B1 : l'écran dans les cinq langues, sans phrase française restée, sans date AAAA-MM-JJ
//   dans le texte lu, et un champ de date qui dit ce qu'il accepte.

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { addDays, todayInZone, type IsoDate } from '@jadwal/core';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';
import { conditionsAcceptees } from './conditions-acceptees.js';
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

const FUSEAU = 'Europe/Zurich';
const ORGANISATION = 'Association à venir';
const ACCUEIL = 'Salam alaykoum';
/** Une organisation qui publie en allemand d'abord, en français et en arabe, et pas en italien. */
const ORGANISATION_B = 'Verein Kommende';
const RESPONSABLE = 'avenir-responsable@example.test';
const RESPONSABLE_B = 'avenir-verein@example.test';
/** Un éditeur de la même organisation : l'écran des prières lui est fermé. */
const EDITEUR = 'avenir-editeur@example.test';

/** Le cours du soir : une séance chaque jour, à heure fixe, traduit en allemand et en arabe. */
const SOIR = { fr: 'Cours du soir', de: 'Abendkurs', ar: 'درس المساء' } as const;
/** Le cercle de lecture : une séance chaque jour, un quart d'heure après Maghrib, en français seul. */
const CERCLE = 'Cercle de lecture';
/** Le cours de l'organisation B, écrit en arabe, traduit en français seulement. */
const TAJWID = { ar: 'حلقة التجويد', fr: 'Cercle de tajwid' } as const;
const SALLE = 'Salle Ibn Khaldoun';
const ENSEIGNANT = 'Karim Haddad';

/** Ce qui est pareil dans toutes les langues par nature : noms, titres, adresses. */
const PERMIS = [
	ORGANISATION,
	ORGANISATION_B,
	ACCUEIL,
	RESPONSABLE,
	RESPONSABLE_B,
	SOIR.fr,
	CERCLE,
	SALLE,
	ENSEIGNANT
];

let ownerHandle: DatabaseHandle;
let organisationA: string;
let organisationB: string;
const soir = newId();
const cercle = newId();
const tajwid = newId();
const ids: Record<string, string> = {};
/** Le jour de l'organisation, pris une fois : les séances affichées vont d'aujourd'hui à J+6. */
const today = todayInZone(FUSEAU, new Date());
const jour = (pas: number): IsoDate => addDays(today, pas);

/** `26.09.2026` : la seule forme d'une date lue par une personne (A3). */
function numerique(date: string): string {
	const [annee, mois, quantieme] = date.split('-');
	return `${quantieme}.${mois}.${annee}`;
}

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

async function poserLangueDuCompte(email: string, langue: Langue): Promise<void> {
	await maintenance((tx) =>
		tx.execute(sql`update "user" set "language" = ${langue} where "email" = ${email}`)
	);
}

/** L'exception posée sur une séance, telle que la base la garde, ou rien. */
async function exception(
	courseId: string,
	date: string
): Promise<{ kind: string; to_date: string | null; to_start: string | null } | undefined> {
	return maintenance(async (tx) =>
		lignes<{ kind: string; to_date: string | null; to_start: string | null }>(
			await tx.execute(sql`
				select "kind", "to_date"::text, left("to_start"::text, 5) as to_start
				from "session_exception" where "course_id" = ${courseId} and "date" = ${date}
			`)
		)
	).then((trouve) => trouve[0]);
}

async function get(chemin: string, cookie: string): Promise<Response> {
	return fetch(`${origin}${chemin}`, { redirect: 'manual', headers: { cookie } });
}

/** Poste un formulaire comme un navigateur sans JavaScript : encodage de formulaire et origine. */
async function postForm(
	chemin: string,
	champs: Record<string, string>,
	cookie?: string
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

async function dernierCourrielA(email: string): Promise<{ text: string } | undefined> {
	const noms = (await readdir(outbox)).filter((nom) => nom.endsWith('.json')).sort();
	return noms
		.map(
			(nom) => JSON.parse(readFileSync(join(outbox, nom), 'utf8')) as { to: string; text: string }
		)
		.filter((courriel) => courriel.to === email)
		.at(-1);
}

/** Se connecte par le lien reçu, et rend le cookie de session. */
async function signIn(email: string): Promise<string> {
	await maintenance((tx) => tx.execute(sql`delete from "rate_limit"`));
	await postForm('/connexion', { email });
	const lien = (await dernierCourrielA(email))?.text.match(/https?:\/\/\S+/)?.[0];
	expect(lien, `aucun lien envoyé à ${email}`).toBeTruthy();
	const suivi = await fetch(lien as string, { redirect: 'manual' });
	const session = (suivi.headers.getSetCookie?.() ?? [])
		.find((valeur) => valeur.startsWith('better-auth.session_token='))
		?.split(';')[0];
	expect(session, `aucune session posée pour ${email}`).toBeTruthy();
	return session as string;
}

/** Les entités que Svelte écrit dans le texte et les attributs, rendues. */
function decode(texte: string): string {
	return texte
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&nbsp;', ' ')
		.replaceAll('&amp;', '&');
}

/** Les attributs d'une balise ouvrante, par nom ; un attribut sans valeur vaut une chaîne vide. */
function attributs(balise: string): Record<string, string> {
	const corps = balise.replace(/^<[a-z]+/i, '').replace(/\/?>$/, '');
	return Object.fromEntries(
		[...corps.matchAll(/([a-z-]+)(?:="([^"]*)")?/gi)].map((trouve) => [
			trouve[1] ?? '',
			decode(trouve[2] ?? '')
		])
	);
}

/** Le texte d'un fragment, sans ses balises, les blancs ramenés à une espace. */
function texte(fragment: string): string {
	return decode(
		fragment
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

interface Options {
	/** La balise ouvrante `<details …>`. */
	balise: string;
	ouvert: boolean;
	resume: string;
	contenu: string;
}

/** Chaque `<details>` de la page, avec son résumé et son contenu. Les miens ne s'emboîtent pas. */
function blocsDetails(html: string): Options[] {
	return [...html.matchAll(/(<details\b[^>]*>)([\s\S]*?)<\/details>/g)].map((trouve) => {
		const balise = trouve[1] ?? '';
		const interieur = trouve[2] ?? '';
		return {
			balise,
			ouvert: 'open' in attributs(balise),
			resume: texte(interieur.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1] ?? ''),
			contenu: interieur
		};
	});
}

/** Les options d'une séance : un bloc qui porte le formulaire d'annulation. */
function optionsDesSeances(html: string): Options[] {
	return blocsDetails(html).filter((bloc) => bloc.contenu.includes('action="?/annuler"'));
}

/**
 * Pour chaque formulaire d'annulation de la page, le `<details>` qui l'enferme, ou `null` s'il est
 * à découvert. Les balises sont lues dans l'ordre, avec la pile des blocs ouverts.
 */
function enveloppesDesAnnulations(html: string): (string | null)[] {
	const pile: string[] = [];
	const trouves: (string | null)[] = [];
	for (const trouve of html.matchAll(
		/<details\b[^>]*>|<\/details>|<form\b[^>]*action="\?\/annuler"[^>]*>/g
	)) {
		const balise = trouve[0];
		if (balise.startsWith('<details')) pile.push(balise);
		else if (balise === '</details>') pile.pop();
		else trouves.push(pile.at(-1) ?? null);
	}
	return trouves;
}

/** La valeur d'un champ caché d'un fragment. */
function cache(fragment: string, nom: string): string | undefined {
	const balise = fragment.match(new RegExp(`<input\\b[^>]*name="${nom}"[^>]*>`))?.[0];
	return balise ? attributs(balise)['value'] : undefined;
}

/** La phrase d'erreur d'un fragment : le texte de son élément `role="alert"`. */
function alerte(fragment: string): string {
	return texte(fragment.match(/<[a-z]+\b[^>]*role="alert"[^>]*>([\s\S]*?)<\/[a-z]+>/)?.[1] ?? '');
}

/**
 * Le nom qu'un lecteur d'écran annonce pour une zone de texte : les éléments que désigne son
 * `aria-labelledby`, dans l'ordre, la zone elle-même valant son `aria-label` ; sans lui, son
 * `aria-label`. Chaque élément désigné est rendu avec sa balise, pour lire sa langue.
 */
function nomAccessible(
	fragment: string,
	balise: string
): { nom: string; designes: { balise: string; texte: string }[] } {
	const champs = attributs(balise);
	const ids = (champs['aria-labelledby'] ?? '').split(/\s+/).filter(Boolean);
	if (ids.length === 0) return { nom: champs['aria-label'] ?? '', designes: [] };
	const designes = ids.map((id) => {
		if (id === champs['id']) return { balise, texte: champs['aria-label'] ?? '' };
		const trouve = fragment.match(
			new RegExp(`(<([a-z]+)\\b[^>]*\\bid="${id}"[^>]*>)([\\s\\S]*?)</\\2>`)
		);
		return { balise: trouve?.[1] ?? '', texte: texte(trouve?.[3] ?? '') };
	});
	return { nom: designes.map((designe) => designe.texte).join(' '), designes };
}

/** Une section de la page, par l'identifiant de son titre. */
function section(html: string, titre: string): string {
	return (
		html.match(
			new RegExp(`<section\\b[^>]*aria-labelledby="${titre}"[^>]*>([\\s\\S]*?)</section>`)
		)?.[1] ?? ''
	);
}

interface Message {
	ouvert: boolean;
	/** La balise ouvrante du bloc de la langue. */
	bloc: string;
	langue: string | undefined;
	sens: string | undefined;
	libelle: string | undefined;
	/** Le nom accessible de la zone de texte, et les éléments qui le composent. */
	nom: ReturnType<typeof nomAccessible>;
	texte: string;
}

/** Les messages d'une section : un bloc par langue, et dans chacun le texte à copier. */
function messages(fragment: string): Message[] {
	return blocsDetails(fragment)
		.filter((bloc) => bloc.contenu.includes('<textarea'))
		.map((bloc) => {
			const zone = bloc.contenu.match(/(<textarea\b[^>]*>)([\s\S]*?)<\/textarea>/);
			const champs = attributs(zone?.[1] ?? '');
			return {
				ouvert: bloc.ouvert,
				bloc: bloc.balise,
				langue: champs['lang'],
				sens: champs['dir'],
				libelle: champs['aria-label'],
				nom: nomAccessible(bloc.contenu, zone?.[1] ?? ''),
				texte: decode(zone?.[2] ?? '')
			};
		});
}

/** Les zones de texte à copier d'une section, quelle que soit leur forme. */
function zonesDeTexte(fragment: string): string[] {
	return [...fragment.matchAll(/<textarea\b[^>]*>([\s\S]*?)<\/textarea>/g)].map((trouve) =>
		decode(trouve[1] ?? '')
	);
}

/** Une séance d'un jour, par son titre : le fragment de sa carte. */
function carte(html: string, date: string, titre: string, statut: string): string {
	const duJour = section(html, `jour-${date}`);
	const cartes = [...duJour.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((trouve) => trouve[0]);
	return (
		cartes.find(
			(fragment) =>
				texte(fragment).includes(titre) &&
				(attributs(fragment.match(/^<li\b[^>]*>/)?.[0] ?? '')['class'] ?? '')
					.split(/\s+/)
					.includes(statut)
		) ?? ''
	);
}

async function poserCours(
	id: string,
	organizationId: string,
	source: string,
	titres: Record<string, string>,
	horaire: { priere: string; decalage: number } | { debut: string; fin: string },
	extra: { salle?: string; enseignant?: string } = {}
): Promise<void> {
	const ancre = 'priere' in horaire;
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
				"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "timing_prayer",
				"timing_offset_minutes", "timing_duration_minutes", "starts_on", "room_id", "teacher")
			values (${id}, ${organizationId}, 'published', 'adults', array[${source}], ${source},
				'weekly', array[1,2,3,4,5,6,7]::smallint[], 1, ${jour(-30)},
				${ancre ? 'prayer' : 'fixed'}, ${ancre ? null : horaire.debut},
				${ancre ? null : horaire.fin}, ${ancre ? horaire.priere : null},
				${ancre ? horaire.decalage : null}, ${ancre ? 60 : null}, ${jour(-30)},
				${extra.salle ?? null}, ${extra.enseignant ?? null})
		`);
		for (const [langue, titre] of Object.entries(titres)) {
			await tx.execute(sql`
				insert into "course_translation" ("id", "organization_id", "course_id", "language",
					"title")
				values (${newId()}, ${organizationId}, ${id}, ${langue}, ${titre})
			`);
		}
	});
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	organisationA = newId();
	organisationB = newId();
	const salle = newId();
	for (const email of [RESPONSABLE, RESPONSABLE_B, EDITEUR]) ids[email] = newId();
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language", "prayer_module", "greeting")
			values (${organisationA}, 'a-venir', ${ORGANISATION}, ${FUSEAU}, 'fr',
				array['fr','de','it','en','ar'], true, ${ACCUEIL}),
				(${organisationB}, 'a-venir-verein', ${ORGANISATION_B}, ${FUSEAU}, 'de',
				array['ar','fr','de'], false, ${ACCUEIL})
		`);
		await tx.execute(sql`
			insert into "room" ("id", "organization_id", "name") values (${salle}, ${organisationA}, ${SALLE})
		`);
		for (const [email, organisation, role] of [
			[RESPONSABLE, organisationA, 'org_admin'],
			[RESPONSABLE_B, organisationB, 'org_admin'],
			[EDITEUR, organisationA, 'editor']
		] as const) {
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified") values (${ids[email] ?? ''}, ${email}, true)
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organisation}, ${ids[email] ?? ''}, ${role})
			`);
			await tx.execute(conditionsAcceptees(organisation, ids[email] ?? ''));
		}
		// Un calendrier importé qui s'arrête dans quatre jours : les deux dernières séances du cercle
		// n'ont pas d'heure, et l'écran le dit, avec la date de fin de l'import.
		for (let pas = 0; pas <= 4; pas += 1) {
			await tx.execute(sql`
				insert into "prayer_day" ("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib",
					"isha", "source")
				values (${organisationA}, ${jour(pas)}, '05:30', '13:15', '16:45', '19:20', '20:50',
					'import')
			`);
		}
		// Le programme vu dans un site il y a dix jours, et plus depuis : l'écran prévient.
		await tx.execute(sql`
			insert into "page_view" ("organization_id", "day", "kind", "count")
			values (${organisationA}, ${jour(-10)}, 'embed', 12), (${organisationA}, ${jour(-2)}, 'page', 30),
				(${organisationA}, ${jour(-1)}, 'feed', 7)
		`);
	});
	await poserCours(
		soir,
		organisationA,
		'fr',
		SOIR,
		{ debut: '19:00', fin: '20:30' },
		{
			salle,
			enseignant: ENSEIGNANT
		}
	);
	await poserCours(
		cercle,
		organisationA,
		'fr',
		{ fr: CERCLE },
		{ priere: 'maghrib', decalage: 15 }
	);
	await poserCours(tajwid, organisationB, 'ar', TAJWID, { debut: '18:00', fin: '19:00' });
});

afterAll(async () => {
	await ownerHandle?.close();
});

describe('A1 : les options de chaque séance', () => {
	let cookie: string;
	let html: string;

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const reponse = await get('/', cookie);
		expect(reponse.status).toBe(200);
		html = await reponse.text();
	});

	it('keeps every cancel button behind the options of its session, closed by default', () => {
		const enveloppes = enveloppesDesAnnulations(html);
		// Sept jours, deux cours par jour : quatorze séances, et autant de boutons d'annulation.
		expect(enveloppes).toHaveLength(14);
		// Aucun bouton d'annulation à découvert : sans avoir ouvert les options, on ne peut pas
		// annuler.
		expect(enveloppes.filter((enveloppe) => enveloppe === null)).toEqual([]);
		// Et aucune option ouverte d'avance.
		expect(enveloppes.filter((enveloppe) => enveloppe && 'open' in attributs(enveloppe))).toEqual(
			[]
		);
	});

	it('gives each session its own options, which open nothing but that session', () => {
		const options = optionsDesSeances(html);
		expect(options).toHaveLength(14);
		const seances = new Set<string>();
		for (const bloc of options) {
			expect(bloc.resume).toBe('Annuler ou déplacer');
			// Un bloc, une séance : son annulation et son déplacement, rien d'une autre carte.
			const annulations = bloc.contenu.match(/action="\?\/annuler"/g) ?? [];
			const deplacements = bloc.contenu.match(/action="\?\/deplacer"/g) ?? [];
			expect([annulations.length, deplacements.length]).toEqual([1, 1]);
			const cles = [...bloc.contenu.matchAll(/<form\b[\s\S]*?<\/form>/g)].map(
				(formulaire) => `${cache(formulaire[0], 'courseId')}|${cache(formulaire[0], 'date')}`
			);
			expect(new Set(cles).size, cles.join(', ')).toBe(1);
			seances.add(cles[0] ?? '');
		}
		// Quatorze blocs pour quatorze séances différentes.
		expect(seances.size).toBe(14);
	});
});

describe('A2 : déplacer une séance', () => {
	let cookie: string;

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'fr');
	});

	it('offers any date from today, earlier or later than the planned one', async () => {
		const html = await (await get('/', cookie)).text();
		const options = optionsDesSeances(html);
		expect(options).toHaveLength(14);
		for (const bloc of options) {
			const date = cache(bloc.contenu, 'date');
			// Plus de liste des six jours suivants : elle interdisait plus tôt, et plus loin.
			expect(bloc.contenu).not.toMatch(/<select\b[^>]*name="toDate"/);
			const balise = bloc.contenu.match(/<input\b[^>]*name="toDate"[^>]*>/)?.[0] ?? '';
			const champ = attributs(balise);
			expect(champ['type'], date).toBe('date');
			expect(champ['min'], date).toBe(today);
			expect(champ, date).not.toHaveProperty('max');
			expect(champ, date).toHaveProperty('required');
			// La date prévue d'abord : changer seulement l'heure reste un geste simple.
			expect(champ['value'], date).toBe(date);
		}
	});

	it('names the new date and says, with today’s date, which dates it accepts (B1, A3)', async () => {
		const html = await (await get('/', cookie)).text();
		const bloc = optionsDesSeances(html)[0]?.contenu ?? '';
		const champ = attributs(bloc.match(/<input\b[^>]*name="toDate"[^>]*>/)?.[0] ?? '');
		const libelle = bloc.match(
			new RegExp(`<label\\b[^>]*for="${champ['id']}"[^>]*>([\\s\\S]*?)</label>`)
		);
		expect(texte(libelle?.[1] ?? '')).toBe('Nouvelle date');
		const aide = bloc.match(
			new RegExp(`<[a-z]+\\b[^>]*id="${champ['aria-describedby']}"[^>]*>([\\s\\S]*?)</[a-z]+>`)
		);
		expect(texte(aide?.[1] ?? '')).toContain(numerique(today));
		expect(texte(aide?.[1] ?? '')).toContain('plus tôt ou plus tard');
	});

	it('refuses a date already past, says why, opens that session and writes nothing', async () => {
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(3), toDate: jour(-1), toStart: '18:00' },
			cookie
		);
		expect(reponse.status).toBe(400);
		const html = await reponse.text();
		expect(await exception(soir, jour(3))).toBeUndefined();
		// Les options de cette séance, et d'elle seule, sont rouvertes sur la phrase qui dit quoi faire.
		const ouvertes = optionsDesSeances(html).filter((bloc) => bloc.ouvert);
		expect(ouvertes).toHaveLength(1);
		const bloc = ouvertes[0]?.contenu ?? '';
		expect([cache(bloc, 'courseId'), cache(bloc, 'date')]).toEqual([soir, jour(3)]);
		expect(
			texte(bloc.match(/<[a-z]+\b[^>]*role="alert"[^>]*>([\s\S]*?)<\/[a-z]+>/)?.[1] ?? '')
		).toBe('Cette date est déjà passée. Choisissez une date à partir d’aujourd’hui.');
		// Ce qui avait été saisi est gardé, pour corriger sans tout refaire.
		expect(attributs(bloc.match(/<input\b[^>]*name="toDate"[^>]*>/)?.[0] ?? '')['value']).toBe(
			jour(-1)
		);
	});

	it('refuses an impossible date with a sentence, instead of failing', async () => {
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(3), toDate: '2027-02-31', toStart: '18:00' },
			cookie
		);
		expect(reponse.status).toBe(400);
		expect(visibleText(await reponse.text())).toContain('Cette date n’a pas pu être lue.');
		expect(await exception(soir, jour(3))).toBeUndefined();
	});

	it('refuses a move that changes neither the date nor the time, says what to do, keeps the form', async () => {
		// Le champ s'ouvre sur la date prévue et l'heure habituelle : les renvoyer tels quels, c'est
		// toucher « Déplacer la séance » sans rien changer. Rien ne se déplace, et rien ne s'annonce.
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(3), toDate: jour(3), toStart: '19:00' },
			cookie
		);
		expect(reponse.status).toBe(400);
		const html = await reponse.text();
		expect(await exception(soir, jour(3))).toBeUndefined();
		expect(section(html, 'message-titre')).toBe('');
		const ouvertes = optionsDesSeances(html).filter((bloc) => bloc.ouvert);
		expect(ouvertes).toHaveLength(1);
		const bloc = ouvertes[0]?.contenu ?? '';
		expect([cache(bloc, 'courseId'), cache(bloc, 'date')]).toEqual([soir, jour(3)]);
		expect(alerte(bloc)).toBe(
			'La séance est déjà prévue à cette date et à cette heure. Choisissez une autre date ou une autre heure.'
		);
		// Ce qui avait été envoyé reste dans le formulaire.
		expect(attributs(bloc.match(/<input\b[^>]*name="toDate"[^>]*>/)?.[0] ?? '')['value']).toBe(
			jour(3)
		);
		expect(attributs(bloc.match(/<input\b[^>]*name="toStart"[^>]*>/)?.[0] ?? '')['value']).toBe(
			'19:00'
		);
	});

	it('refuses it for a session that follows a prayer, at the time computed for that day', async () => {
		// Maghrib à 19:20 le jour J+2, et le cercle un quart d'heure après : 19:35, l'heure que le
		// champ propose. Le serveur la tient du même calcul que l'écran, pas du formulaire.
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: cercle, date: jour(2), toDate: jour(2), toStart: '19:35' },
			cookie
		);
		expect(reponse.status).toBe(400);
		expect(alerte(await reponse.text())).toContain('La séance est déjà prévue');
		expect(await exception(cercle, jour(2))).toBeUndefined();
	});

	it('accepts the same day at another time, and says the new time', async () => {
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(3), toDate: jour(3), toStart: '20:30' },
			cookie
		);
		expect(reponse.status).toBe(200);
		expect(await exception(soir, jour(3))).toEqual({
			kind: 'moved',
			to_date: jour(3),
			to_start: '20:30'
		});
		const annonce = messages(section(await reponse.text(), 'message-titre'));
		expect(annonce[0]?.texte).toContain('20:30');
		await postForm('/?/retablir', { courseId: soir, date: jour(3) }, cookie);
		expect(await exception(soir, jour(3))).toBeUndefined();
	});

	it('accepts another day at the same time', async () => {
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(3), toDate: jour(4), toStart: '19:00' },
			cookie
		);
		expect(reponse.status).toBe(200);
		expect((await exception(soir, jour(3)))?.to_date).toBe(jour(4));
		await postForm('/?/retablir', { courseId: soir, date: jour(3) }, cookie);
		expect(await exception(soir, jour(3))).toBeUndefined();
	});

	it('accepts the same day for a session shown without a time: it gets one', async () => {
		// Le calendrier importé s'arrête à J+4 : le cercle de J+5 n'a pas d'heure, et le champ propose
		// 19:00. L'accepter donne une heure à la séance, ce qui change quelque chose.
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: cercle, date: jour(5), toDate: jour(5), toStart: '19:00' },
			cookie
		);
		expect(reponse.status).toBe(200);
		expect(await exception(cercle, jour(5))).toEqual({
			kind: 'moved',
			to_date: jour(5),
			to_start: '19:00'
		});
		await postForm('/?/retablir', { courseId: cercle, date: jour(5) }, cookie);
		expect(await exception(cercle, jour(5))).toBeUndefined();
	});

	it('refuses an hour out of range with a sentence, instead of failing', async () => {
		for (const heure of ['25:99', '24:00', '19:60']) {
			const reponse = await postForm(
				'/?/deplacer',
				{ courseId: soir, date: jour(3), toDate: jour(4), toStart: heure },
				cookie
			);
			expect(reponse.status, heure).toBe(400);
			const bloc =
				optionsDesSeances(await reponse.text()).find((options) => options.ouvert)?.contenu ?? '';
			expect(alerte(bloc), heure).toBe(
				'Cette heure n’a pas pu être lue. Écrivez les heures et les minutes, par exemple 19:30.'
			);
			expect(await exception(soir, jour(3)), heure).toBeUndefined();
		}
	});

	it('answers a malformed course identifier with a sentence, in each action', async () => {
		const champs = { courseId: 'pas-un-identifiant', date: jour(3) };
		for (const [action, envoi] of [
			['annuler', champs],
			['deplacer', { ...champs, toDate: jour(4), toStart: '18:00' }],
			['retablir', champs]
		] as const) {
			const reponse = await postForm(`/?/${action}`, envoi, cookie);
			expect(reponse.status, action).toBe(404);
			const html = await reponse.text();
			// La séance visée ne désigne aucune carte : la phrase s'affiche en haut de l'écran.
			expect(alerte(html), action).toBe(
				'Cette séance n’existe plus. Rechargez la page pour voir le programme à jour.'
			);
			expect(
				optionsDesSeances(html).filter((options) => options.ouvert),
				action
			).toEqual([]);
		}
	});

	it('answers an unknown course, or one of another organisation, with a sentence', async () => {
		for (const courseId of [newId(), tajwid]) {
			for (const [action, envoi] of [
				['annuler', { courseId, date: jour(3) }],
				['deplacer', { courseId, date: jour(3), toDate: jour(4), toStart: '18:00' }]
			] as const) {
				const reponse = await postForm(`/?/${action}`, envoi, cookie);
				expect(reponse.status, `${action} ${courseId}`).toBe(404);
				expect(alerte(await reponse.text()), `${action} ${courseId}`).toBe(
					'Cette séance n’existe plus. Rechargez la page pour voir le programme à jour.'
				);
			}
		}
		// Rien n'est écrit dans l'autre organisation.
		expect(await exception(tajwid, jour(3))).toBeUndefined();
	});

	it('accepts a date earlier than the planned one, and shows the session there', async () => {
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(5), toDate: jour(2), toStart: '18:00' },
			cookie
		);
		expect(reponse.status).toBe(200);
		expect(await exception(soir, jour(5))).toEqual({
			kind: 'moved',
			to_date: jour(2),
			to_start: '18:00'
		});
		const html = await (await get('/', cookie)).text();
		const arrivee = carte(html, jour(2), SOIR.fr, 'moved_here');
		expect(texte(arrivee)).toContain(numerique(jour(5)));
		const depart = carte(html, jour(5), SOIR.fr, 'moved_away');
		expect(texte(depart)).toContain(numerique(jour(2)));
	});

	it('accepts today, the first date it offers', async () => {
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(4), toDate: today, toStart: '21:00' },
			cookie
		);
		expect(reponse.status).toBe(200);
		expect((await exception(soir, jour(4)))?.to_date).toBe(today);
	});

	it('accepts a date weeks after the planned one', async () => {
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(6), toDate: jour(40), toStart: '19:00' },
			cookie
		);
		expect(reponse.status).toBe(200);
		expect((await exception(soir, jour(6)))?.to_date).toBe(jour(40));
	});
});

describe('B1 : chaque mention dit quoi faire, et à qui', () => {
	/** Les mentions de l'écran, ce qui demande une décision avant le programme. */
	function mentions(html: string): string[] {
		return [...html.matchAll(/<p\b[^>]*class="mention[^"]*"[^>]*>([\s\S]*?)<\/p>/g)].map(
			(trouve) => trouve[1] ?? ''
		);
	}

	it('sends a manager to the prayer times, and tells an editor who can set them', async () => {
		const responsable = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const editeur = await signIn(EDITEUR);
		await poserLangueDuCompte(EDITEUR, 'fr');
		const pourLeResponsable = mentions(await (await get('/', responsable)).text());
		const pourLEditeur = mentions(await (await get('/', editeur)).text());
		// Les séances sans heure et la fin de l'import mènent à l'écran des prières ; le site, non.
		expect(pourLeResponsable.map((mention) => /href="[^"]*prieres"/.test(mention))).toEqual([
			true,
			true,
			false
		]);
		// Cet écran renverrait un éditeur à l'accueil sans rien lui dire : pas de lien, mais qui le peut.
		expect(pourLEditeur.map((mention) => /href="[^"]*prieres"/.test(mention))).toEqual([
			false,
			false,
			false
		]);
		expect(texte(pourLEditeur[0] ?? '')).toContain(
			'La personne responsable de votre organisation peut les régler.'
		);
		expect(texte(pourLEditeur[1] ?? '')).toContain(
			'La personne responsable de votre organisation peut ajouter la suite du calendrier.'
		);
	});
});

describe('D1 : les messages prêts à coller, dans les langues publiées', () => {
	it('writes the week in each published language, the default language first and open', async () => {
		const cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const semaine = messages(section(await (await get('/', cookie)).text(), 'semaine-titre'));
		expect(semaine.map((message) => message.langue)).toEqual(['fr', 'de', 'it', 'en', 'ar']);
		expect(semaine.map((message) => message.ouvert)).toEqual([true, false, false, false, false]);
		expect(semaine.map((message) => message.sens)).toEqual(['ltr', 'ltr', 'ltr', 'ltr', 'rtl']);
		const [fr, de, it, en, ar] = semaine.map((message) => message.texte);
		expect(fr).toContain(`Programme de la semaine à ${ORGANISATION} :`);
		expect(de).toContain(`Das Programm dieser Woche bei ${ORGANISATION}:`);
		expect(it).toContain(`Il programma della settimana di ${ORGANISATION}:`);
		expect(en).toContain(`This week’s programme at ${ORGANISATION}:`);
		expect(ar).toContain(`برنامج هذا الأسبوع في ${ORGANISATION}:`);
		// Le titre d'un cours dans la langue du message quand il y est traduit, sinon dans sa langue.
		expect(de).toContain(SOIR.de);
		expect(de).not.toContain(SOIR.fr);
		expect(ar).toContain(SOIR.ar);
		expect(it).toContain(SOIR.fr);
		expect(de).toContain(CERCLE);
		for (const message of semaine) {
			expect(message.texte.startsWith(ACCUEIL), message.langue).toBe(true);
			expect(message.texte.match(ISO_DATE)?.[0] ?? null, message.langue).toBeNull();
			expect(message.texte, message.langue).toContain(numerique(jour(1)));
		}
	});

	it('writes a cancellation in each published language, and nothing else', async () => {
		const cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'de');
		const reponse = await postForm('/?/annuler', { courseId: soir, date: jour(1) }, cookie);
		expect(reponse.status).toBe(200);
		const annonce = messages(section(await reponse.text(), 'message-titre'));
		expect(annonce.map((message) => message.langue)).toEqual(['fr', 'de', 'it', 'en', 'ar']);
		expect(annonce.map((message) => message.ouvert)).toEqual([true, false, false, false, false]);
		const date = numerique(jour(1));
		const [fr, de, , , ar] = annonce.map((message) => message.texte);
		expect(fr).toMatch(new RegExp(`Le cours « ${SOIR.fr} » du \\p{L}+ ${date} est annulé\\.`, 'u'));
		expect(de).toMatch(new RegExp(`Der Kurs «${SOIR.de}» vom \\p{L}+, ${date}, fällt aus\\.`, 'u'));
		expect(ar).toContain(`«${SOIR.ar}»`);
		expect(ar).toContain(date);
		// Le nom que lit un lecteur d'écran est dans la langue de l'écran, ici l'allemand, et il dit
		// la langue de chaque message.
		expect(annonce.map((message) => message.nom.nom)).toEqual([
			'Nachricht zum Kopieren auf Französisch',
			'Nachricht zum Kopieren auf Deutsch',
			'Nachricht zum Kopieren auf Italienisch',
			'Nachricht zum Kopieren auf Englisch',
			'Nachricht zum Kopieren auf Arabisch'
		]);
		await postForm('/?/retablir', { courseId: soir, date: jour(1) }, cookie);
	});

	it('names each message box after its language, in the language of the screen', async () => {
		const cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const semaine = messages(section(await (await get('/', cookie)).text(), 'semaine-titre'));
		// Cinq noms différents : un lecteur d'écran ne dit plus cinq fois la même chose.
		expect(semaine.map((message) => message.nom.nom)).toEqual([
			'Programme de la semaine en français',
			'Programme de la semaine en allemand',
			'Programme de la semaine en italien',
			'Programme de la semaine en anglais',
			'Programme de la semaine en arabe'
		]);
		// Chaque message garde sa langue et son sens.
		expect(semaine.map((message) => [message.langue, message.sens])).toEqual(
			LANGUES.map((langue) => [langue, SENS[langue]])
		);
		for (const message of semaine) {
			// La langue du message est dite par un élément qui n'est pas dans sa langue à lui : ni
			// l'élément, ni son bloc ne portent de `lang`, il parle donc la langue de l'écran.
			const autres = message.nom.designes.filter(
				(designe) => !designe.balise.startsWith('<textarea')
			);
			expect(autres.length, message.langue).toBeGreaterThan(0);
			for (const designe of autres)
				expect(attributs(designe.balise), message.langue).not.toHaveProperty('lang');
			expect(attributs(message.bloc), message.langue).not.toHaveProperty('lang');
		}
		// Le libellé que lisent les tests de l'accueil (`acces.test.ts`) reste le même.
		expect(semaine.map((message) => message.libelle)).toEqual(
			Array(5).fill('Programme de la semaine')
		);
	});

	it('names the message boxes in Arabic on an Arabic screen', async () => {
		const cookie = await signIn(RESPONSABLE_B);
		await poserLangueDuCompte(RESPONSABLE_B, 'ar');
		const semaine = messages(section(await (await get('/', cookie)).text(), 'semaine-titre'));
		expect(semaine.map((message) => message.nom.nom)).toEqual([
			'برنامجك لهذا الأسبوع بالألمانية',
			'برنامجك لهذا الأسبوع بالفرنسية',
			'برنامجك لهذا الأسبوع بالعربية'
		]);
		await poserLangueDuCompte(RESPONSABLE_B, 'fr');
	});

	it('puts the default language first for the week, and the language of the course first for it', async () => {
		const cookie = await signIn(RESPONSABLE_B);
		await poserLangueDuCompte(RESPONSABLE_B, 'fr');
		const html = await (await get('/', cookie)).text();
		const semaine = messages(section(html, 'semaine-titre'));
		// L'allemand, langue par défaut, puis les autres langues publiées ; ni l'italien ni l'anglais.
		expect(semaine.map((message) => message.langue)).toEqual(['de', 'fr', 'ar']);
		expect(semaine[0]?.ouvert).toBe(true);

		const deplace = await postForm(
			'/?/deplacer',
			{ courseId: tajwid, date: jour(3), toDate: jour(1), toStart: '17:30' },
			cookie
		);
		expect(deplace.status).toBe(200);
		const annonce = messages(section(await deplace.text(), 'message-titre'));
		// Le cours est écrit en arabe : son message commence par l'arabe.
		expect(annonce.map((message) => message.langue)).toEqual(['ar', 'fr', 'de']);
		const [ar, fr, de] = annonce.map((message) => message.texte);
		expect(ar).toContain(`«${TAJWID.ar}»`);
		expect(fr).toContain(`« ${TAJWID.fr} »`);
		// Pas de titre allemand : celui du cours, dans sa langue.
		expect(de).toContain(`«${TAJWID.ar}»`);
		for (const texteDuMessage of [ar, fr, de]) {
			expect(texteDuMessage).toContain(numerique(jour(3)));
			expect(texteDuMessage).toContain(numerique(jour(1)));
			expect(texteDuMessage).toContain('17:30');
		}
	});
});

describe('D2, A3 : l’écran dans les cinq langues', () => {
	/** Chaque état de l'écran, rendu dans chaque langue, et le code de la réponse. */
	const rendus: Record<string, Record<Langue, string>> = {};
	const statuts: Record<string, Record<Langue, number>> = {};
	const ETATS = [
		'affiché',
		'après une annulation',
		'après un refus',
		'après un déplacement qui ne change rien',
		'après un rétablissement'
	];
	const ATTENDUS: Record<string, number> = {
		affiché: 200,
		'après une annulation': 200,
		'après un refus': 400,
		'après un déplacement qui ne change rien': 400,
		'après un rétablissement': 200
	};

	beforeAll(async () => {
		const cookie = await signIn(RESPONSABLE);
		for (const langue of LANGUES) {
			await poserLangueDuCompte(RESPONSABLE, langue);
			const pages: [string, Response][] = [
				['affiché', await get('/', cookie)],
				[
					'après une annulation',
					await postForm('/?/annuler', { courseId: cercle, date: jour(1) }, cookie)
				],
				[
					'après un refus',
					await postForm(
						'/?/deplacer',
						{ courseId: cercle, date: jour(2), toDate: jour(-3), toStart: '20:00' },
						cookie
					)
				],
				[
					'après un déplacement qui ne change rien',
					await postForm(
						'/?/deplacer',
						{ courseId: soir, date: jour(3), toDate: jour(3), toStart: '19:00' },
						cookie
					)
				],
				[
					'après un rétablissement',
					await postForm('/?/retablir', { courseId: cercle, date: jour(1) }, cookie)
				]
			];
			for (const [etat, reponse] of pages) {
				(statuts[etat] ??= {} as Record<Langue, number>)[langue] = reponse.status;
				(rendus[etat] ??= {} as Record<Langue, string>)[langue] = await reponse.text();
			}
		}
	});

	it.each(ETATS.flatMap((etat) => LANGUES.map((langue) => ({ etat, langue }))))(
		'answers the screen $etat in $langue with the right status',
		({ etat, langue }) => {
			expect(statuts[etat]?.[langue]).toBe(ATTENDUS[etat]);
		}
	);

	/**
	 * La page sans ses messages à copier : ils sont écrits dans les langues publiées, quelle que soit
	 * celle de l'écran, et les tests D1 les éprouvent. Sans ce retrait, le message allemand, présent
	 * dans la page française comme dans la page allemande, passerait pour du français resté.
	 */
	function sansMessages(html: string): string {
		return html.replace(/<textarea\b[\s\S]*?<\/textarea>/g, ' ');
	}

	it.each(ETATS.flatMap((etat) => LANGUES.map((langue) => ({ etat, langue }))))(
		'serves the screen $etat with <html lang="$langue">',
		({ etat, langue }) => {
			const html = rendus[etat]?.[langue] ?? '';
			expect(html.match(/<html\b[^>]*>/g)).toEqual([
				`<html lang="${langue}" dir="${SENS[langue]}">`
			]);
		}
	);

	it.each(ETATS.flatMap((etat) => LANGUES.slice(1).map((langue) => ({ etat, langue }))))(
		'leaves no French sentence on the screen $etat in $langue',
		({ etat, langue }) => {
			const francais = sansMessages(rendus[etat]?.fr ?? '');
			const autre = sansMessages(rendus[etat]?.[langue] ?? '');
			// Sans texte, une comparaison vide passerait pour une traduction complète.
			expect(textSegments(francais).size).toBeGreaterThan(40);
			expect(frenchLeft(francais, autre, PERMIS)).toEqual([]);
			// Un mot seul ne passe pas par le filtre des phrases : les marques et les boutons courts.
			const morceaux = textSegments(autre);
			for (const mot of ['annulée', 'déplacée', 'Rétablir', 'Déplacer', 'Consultations', 'Où']) {
				expect(morceaux.has(mot), mot).toBe(false);
			}
		}
	);

	it.each(ETATS.flatMap((etat) => LANGUES.map((langue) => ({ etat, langue }))))(
		'writes no date as AAAA-MM-JJ on the screen $etat in $langue',
		({ etat, langue }) => {
			const lu = visibleText(rendus[etat]?.[langue] ?? '');
			expect(lu.match(ISO_DATE)?.[0] ?? null).toBeNull();
		}
	);

	it('names the screen and its notices in each language', () => {
		const titres = {
			fr: `À venir | ${ORGANISATION}`,
			de: `Demnächst | ${ORGANISATION}`,
			it: `In arrivo | ${ORGANISATION}`,
			en: `Coming up | ${ORGANISATION}`,
			ar: `القادم | ${ORGANISATION}`
		};
		for (const langue of LANGUES) {
			const html = rendus['affiché']?.[langue] ?? '';
			expect(html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim(), langue).toBe(titres[langue]);
			const lu = visibleText(html);
			// L'import s'arrête dans quatre jours : la date de fin s'écrit JJ.MM.AAAA.
			expect(lu, langue).toContain(numerique(jour(4)));
			// Les trois mentions sont là, chacune avec son lien.
			expect((html.match(/<p\b[^>]*class="mention[^"]*"[^>]*role="status"/g) ?? []).length).toBe(3);
		}
		// Le texte que les tests des prières lisent en français reste le même.
		const francais = visibleText(rendus['affiché']?.fr ?? '');
		expect(francais).toContain('sans heure');
		expect(francais).toContain('Régler les heures de prière');
	});

	it('says in each language what the last action did', () => {
		const faits: Record<string, Record<Langue, string>> = {
			'après une annulation': {
				fr: 'La séance est annulée.',
				de: 'Der Termin ist abgesagt.',
				it: 'La lezione è annullata.',
				en: 'The session is cancelled.',
				ar: 'أُلغيت الحصة.'
			},
			'après un rétablissement': {
				fr: 'La séance est rétablie.',
				de: 'Der Termin ist wiederhergestellt.',
				it: 'La lezione è ripristinata.',
				en: 'The session has been restored.',
				ar: 'استُعيدت الحصة.'
			}
		};
		for (const [etat, phrases] of Object.entries(faits)) {
			for (const langue of LANGUES) {
				const html = rendus[etat]?.[langue] ?? '';
				expect(
					texte(section(html, 'message-titre').match(/^[\s\S]*?<\/h2>/)?.[0] ?? ''),
					`${etat} ${langue}`
				).toBe(phrases[langue]);
			}
		}
		// Une annulation porte son message ; un rétablissement, non.
		expect(
			zonesDeTexte(section(rendus['après une annulation']?.fr ?? '', 'message-titre'))
		).toHaveLength(5);
		expect(
			zonesDeTexte(section(rendus['après un rétablissement']?.fr ?? '', 'message-titre'))
		).toEqual([]);
	});

	it('says in each language that the session is already there, and what to choose instead', () => {
		const phrases: Record<Langue, string> = {
			fr: 'La séance est déjà prévue à cette date et à cette heure. Choisissez une autre date ou une autre heure.',
			de: 'Der Termin ist schon an diesem Datum und zu dieser Uhrzeit geplant. Wählen Sie ein anderes Datum oder eine andere Uhrzeit.',
			it: 'La lezione è già prevista per questa data e questo orario. Scegli un’altra data o un altro orario.',
			en: 'The session is already planned for this date and time. Choose a different date or time.',
			ar: 'الحصة مقرّرة بالفعل في هذا التاريخ وفي هذا الوقت. اختر تاريخًا آخر أو وقتًا آخر.'
		};
		for (const langue of LANGUES) {
			const html = rendus['après un déplacement qui ne change rien']?.[langue] ?? '';
			// Le refus se lit dans la carte de la séance, rouverte, et nulle part un « déplacé ».
			const ouvertes = optionsDesSeances(html).filter((bloc) => bloc.ouvert);
			expect(ouvertes, langue).toHaveLength(1);
			expect(alerte(ouvertes[0]?.contenu ?? ''), langue).toBe(phrases[langue]);
			expect(section(html, 'message-titre'), langue).toBe('');
		}
	});
});

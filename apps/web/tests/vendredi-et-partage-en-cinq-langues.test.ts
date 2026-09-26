// La prière du vendredi et le partage, dans les cinq langues de l'espace (étape 18, retours B1, D1,
// D2 et A3), servis par HTTP.
//
// Deux écrans, et pour chacun ce qu'une personne lit dans sa langue : `<html lang dir>`, aucune phrase
// française restée, aucune date écrite comme la base l'écrit, des libellés qui disent ce qu'ils
// demandent. Le partage donne en plus le message de la semaine dans chacune des langues que
// l'organisation publie, la sienne d'abord (D1), et dit sans jargon où coller chaque code.
//
// Vrai serveur construit, vraie base, formulaires envoyés comme sans JavaScript, sur le modèle de
// `espace-en-cinq-langues.test.ts`.

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { addDays, isoDateToDays, todayInZone, weekdayFromDays, type IsoDate } from '@jadwal/core';
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
/** Les jours de la semaine, du lundi au dimanche, tels que chaque langue les écrit devant une date. */
const JOURS: Record<Langue, readonly string[]> = {
	fr: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
	de: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
	it: ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'],
	en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
	ar: ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']
};

/** Le nom de la prière que le service propose, dans chaque langue (`t(langue).jumua`). */
const NOM_DE_LA_PRIERE: Record<Langue, string> = {
	fr: 'Prière du vendredi',
	de: 'Freitagsgebet',
	it: 'Preghiera del venerdì',
	en: 'Friday prayer',
	ar: 'صلاة الجمعة'
};
/** La virgule d'une énumération dans un message : la virgule arabe « ، » en arabe. */
const VIRGULE: Record<Langue, string> = { fr: ', ', de: ', ', it: ', ', en: ', ', ar: '، ' };

const FUSEAU = 'Europe/Zurich';
const ORGANISATION = 'Association du vendredi en cinq langues';
const SLUG = 'vendredi-cinq-langues';
/**
 * Une organisation de langue allemande qui publie aussi le français et l'arabe. Ses langues sont
 * enregistrées dans l'ordre où Réglages les écrit, le français d'abord : sa langue n'est donc pas la
 * première de la liste, et c'est ce que les tests de la langue de l'organisation éprouvent.
 */
const ORGANISATION_DE = 'Verein am Freitag';
const SLUG_DE = 'verein-am-freitag';
const RESPONSABLE = 'vp-responsable@example.test';
const RESPONSABLE_DE = 'vp-responsable-de@example.test';
const SALLE = 'Grande salle';
const COURS = 'Cours d’arabe';
const COURS_DE = 'Arabischkurs';
const INTERVENANT = 'Imam Youssef';
const SALUT = 'Salam alaykoum';
/** Un titre que l'organisation allemande a écrit elle-même : il reste tel quel dans chaque langue. */
const TITRE_CHOISI = 'Jumu’a im Gemeindesaal';

/** Ce qui est pareil dans toutes les langues par nature : noms, adresses, ce que l'organisation a saisi. */
const PERMIS = [
	ORGANISATION,
	ORGANISATION_DE,
	RESPONSABLE,
	RESPONSABLE_DE,
	SALLE,
	COURS,
	INTERVENANT
];

let ownerHandle: DatabaseHandle;
let organizationId: string;
let organizationDeId: string;
let salleId: string;
const ids: Record<string, string> = {};
let cookies: string;
let cookiesDe: string;
/** Les trois sessions du vendredi, par rang. */
const sessions: Record<1 | 2 | 3, string> = { 1: '', 2: '', 3: '' };
/** Les trois sessions de l'organisation allemande, par rang. */
const sessionsDe: Record<1 | 2 | 3, string> = { 1: '', 2: '', 3: '' };

const today = (): IsoDate => todayInZone(FUSEAU, new Date());

/** Le prochain vendredi, aujourd'hui compris. */
function prochainVendredi(depuis: IsoDate): IsoDate {
	for (let pas = 0; pas < 7; pas += 1) {
		const date = addDays(depuis, pas);
		if (weekdayFromDays(isoDateToDays(date)) === 5) return date;
	}
	throw new Error('aucun vendredi en sept jours');
}

/** Le jour où la troisième session est déplacée : le lendemain du vendredi, ou la veille le samedi. */
function jourDuDeplacement(): IsoDate {
	const vendredi = prochainVendredi(today());
	return addDays(vendredi, 1) > addDays(today(), 6) ? addDays(vendredi, -1) : addDays(vendredi, 1);
}

/** La fin de la première session : assez loin pour ne pas gêner, et affichée sur l'écran. */
const FIN_DE_SESSION = (): IsoDate => addDays(today(), 60);

/** « vendredi 02.10.2026 », « Freitag, 02.10.2026 » : le nom du jour, puis JJ.MM.AAAA. */
function dateEcrite(langue: Langue, date: IsoDate): string {
	const [annee, mois, jour] = date.split('-');
	const nom = JOURS[langue][weekdayFromDays(isoDateToDays(date)) - 1];
	return `${nom}${langue === 'de' ? ',' : ''} ${jour}.${mois}.${annee}`;
}

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

async function get(chemin: string, cookie: string): Promise<Response> {
	return fetch(`${origin}${chemin}`, { redirect: 'manual', headers: { cookie } });
}

/** Poste un formulaire comme un navigateur sans JavaScript. Un champ peut porter plusieurs valeurs. */
async function postForm(
	chemin: string,
	champs: Record<string, string | readonly string[]>,
	cookie: string
): Promise<Response> {
	const corps = new URLSearchParams();
	for (const [cle, valeur] of Object.entries(champs)) {
		for (const une of typeof valeur === 'string' ? [valeur] : valeur) corps.append(cle, une);
	}
	return fetch(`${origin}${chemin}`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			accept: 'text/html',
			origin,
			cookie
		},
		body: corps.toString()
	});
}

async function signIn(email: string): Promise<string> {
	await maintenance((tx) => tx.execute(sql`delete from "rate_limit"`));
	await postForm('/connexion', { email }, '');
	const noms = (await readdir(outbox)).filter((nom) => nom.endsWith('.json')).sort();
	const lien = noms
		.map(
			(nom) => JSON.parse(readFileSync(join(outbox, nom), 'utf8')) as { to: string; text: string }
		)
		.filter((courriel) => courriel.to === email)
		.at(-1)
		?.text.match(/https?:\/\/\S+/)?.[0];
	expect(lien, `aucun lien envoyé à ${email}`).toBeTruthy();
	const suivi = await fetch(lien as string, { redirect: 'manual' });
	const session = (suivi.headers.getSetCookie?.() ?? [])
		.find((valeur) => valeur.startsWith('better-auth.session_token='))
		?.split(';')[0];
	expect(session, `aucune session posée pour ${email}`).toBeTruthy();
	return session as string;
}

function baliseHtml(html: string): string {
	return html.match(/<html\b[^>]*>/)?.[0] ?? '';
}

function titre(html: string): string {
	return (html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim();
}

/** Un élément par son `id`, contenu compris, jusqu'à la fermeture de la même balise, sans imbrication. */
function section(html: string, idDuTitre: string): string {
	const debut = html.search(new RegExp(`<section\\b[^>]*aria-labelledby="${idDuTitre}"`));
	if (debut < 0) return '';
	return html.slice(debut, html.indexOf('</section>', debut) + '</section>'.length);
}

/** Le contenu d'une zone de texte, tel qu'on le copie : entités rendues, retours à la ligne gardés. */
function contenu(zone: string): string {
	return (zone.match(/<textarea\b[^>]*>([\s\S]*?)<\/textarea>/)?.[1] ?? '')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&#39;', "'")
		.replaceAll('&amp;', '&');
}

function attribut(balise: string, nom: string): string | undefined {
	return balise.match(new RegExp(`\\s${nom}="([^"]*)"`))?.[1];
}

/** Les zones de texte d'un morceau de page, chacune entière. */
function zonesDeTexte(html: string): string[] {
	return [...html.matchAll(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/g)].map((trouve) => trouve[0]);
}

/**
 * La page sans les zones de texte qui portent leur propre langue : les messages prêts à coller et les
 * codes. Leur langue ne suit pas celle de l'écran, c'est voulu, et des tests à part les éprouvent.
 */
function sansTexteEnSaLangue(html: string): string {
	return html.replace(
		/<textarea\b[^>]*\blang="[^"]*"[^>]*>[\s\S]*?<\/textarea>/g,
		'<textarea></textarea>'
	);
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	organizationId = newId();
	organizationDeId = newId();
	salleId = newId();
	for (const email of [RESPONSABLE, RESPONSABLE_DE]) ids[email] = newId();
	await maintenance(async (tx) => {
		for (const [id, slug, nom, source, langues] of [
			[organizationId, SLUG, ORGANISATION, 'fr', "array['fr','de','it','en','ar']"],
			[organizationDeId, SLUG_DE, ORGANISATION_DE, 'de', "array['fr','de','ar']"]
		] as const) {
			await tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
					"enabled_language", "prayer_module")
				values (${id}, ${slug}, ${nom}, ${FUSEAU}, ${source}, ${sql.raw(langues)}, true)
			`);
		}
		for (const [email, organisation] of [
			[RESPONSABLE, organizationId],
			[RESPONSABLE_DE, organizationDeId]
		] as const) {
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified", "language")
				values (${ids[email] ?? ''}, ${email}, true, 'fr')
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organisation}, ${ids[email] ?? ''}, 'org_admin')
			`);
			await tx.execute(conditionsAcceptees(organisation, ids[email] ?? ''));
		}
		await tx.execute(sql`
			insert into "room" ("id", "organization_id", "name", "display_order")
			values (${salleId}, ${organizationId}, ${SALLE}, 1)
		`);
		// Un cours publié, chaque jour à 19:00, traduit en allemand seulement : le message de la
		// semaine le nomme dans la langue du message quand la traduction existe, comme la page publique.
		const coursId = newId();
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"room_id", "source_language", "recurrence_kind", "recurrence_weekday",
				"recurrence_interval", "recurrence_anchor_date", "timing_kind", "timing_start",
				"timing_end", "starts_on")
			values (${coursId}, ${organizationId}, 'published', 'open', array['ar'], ${salleId}, 'fr',
				'weekly', array[1,2,3,4,5,6,7]::smallint[], 1, '2026-09-07', 'fixed', '19:00', '20:30',
				'2026-09-07')
		`);
		for (const [langue, intitule] of [
			['fr', COURS],
			['de', COURS_DE]
		] as const) {
			await tx.execute(sql`
				insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
				values (${newId()}, ${organizationId}, ${coursId}, ${langue}, ${intitule})
			`);
		}
	});

	cookies = await signIn(RESPONSABLE);
	cookiesDe = await signIn(RESPONSABLE_DE);

	// Les trois sessions, saisies par l'écran lui-même : la première publiée et close dans deux mois,
	// la deuxième annulée ce vendredi, la troisième déplacée et remise en brouillon. Chaque branche de
	// l'écran a ainsi quelque chose à montrer.
	const communs = { title: 'Prière du vendredi', status: 'published', startsOn: '2026-09-04' };
	for (const [rang, champs] of [
		[
			1,
			{
				start: '12:10',
				end: '12:50',
				roomId: salleId,
				sermonLanguages: ['ar', 'fr'],
				teacher: INTERVENANT,
				endsOn: FIN_DE_SESSION()
			}
		],
		[2, { start: '13:30', end: '14:10', sermonLanguages: ['de'], endsOn: '' }],
		[3, { start: '14:30', end: '15:10', sermonLanguages: ['fr'], endsOn: '' }]
	] as const) {
		const reponse = await postForm(
			'/vendredi?/enregistrer',
			{ ...communs, ...champs, jumuaOrder: String(rang) },
			cookies
		);
		expect(reponse.status, `session ${rang}`).toBe(200);
	}
	const trouvees = await maintenance(async (tx) =>
		lignes<{ id: string; jumua_order: 1 | 2 | 3 }>(
			await tx.execute(sql`
				select "id", "jumua_order" from "course"
				where "organization_id" = ${organizationId} and "kind" = 'jumua'
			`)
		)
	);
	for (const trouvee of trouvees) sessions[trouvee.jumua_order] = trouvee.id;
	const vendredi = prochainVendredi(today());
	expect(
		(await postForm('/vendredi?/annuler', { courseId: sessions[2], date: vendredi }, cookies))
			.status
	).toBe(200);
	expect(
		(
			await postForm(
				'/vendredi?/deplacer',
				{ courseId: sessions[3], date: vendredi, toDate: jourDuDeplacement(), toStart: '15:00' },
				cookies
			)
		).status
	).toBe(200);
	expect(
		(await postForm('/vendredi?/basculer', { courseId: sessions[3], vers: 'draft' }, cookies))
			.status
	).toBe(200);

	// L'organisation allemande : une session au titre laissé vide, qui prend le nom proposé, et une
	// session au titre choisi, saisies par l'écran ; puis une session d'avant l'étape 18, écrite en
	// allemand sous le nom français que le service proposait alors dans toutes les langues.
	for (const [rang, champs] of [
		[1, { title: '', start: '12:10', end: '12:50', sermonLanguages: ['de'] }],
		[2, { title: TITRE_CHOISI, start: '13:30', end: '14:10', sermonLanguages: ['ar'] }]
	] as const) {
		const reponse = await postForm(
			'/vendredi?/enregistrer',
			{ ...champs, jumuaOrder: String(rang), status: 'published', startsOn: '2026-09-04' },
			cookiesDe
		);
		expect(reponse.status, `session allemande ${rang}`).toBe(200);
	}
	await maintenance(async (tx) => {
		const ancienne = newId();
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "kind", "jumua_order", "status", "audience",
				"teaching_language", "source_language", "recurrence_kind", "recurrence_weekday",
				"recurrence_interval", "recurrence_anchor_date", "timing_kind", "timing_start",
				"timing_end", "starts_on")
			values (${ancienne}, ${organizationDeId}, 'jumua', 3, 'published', 'open', array['de'], 'de',
				'weekly', array[5]::smallint[], 1, '2026-09-04', 'fixed', '14:30', '15:10', '2026-09-04')
		`);
		await tx.execute(sql`
			insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
			values (${newId()}, ${organizationDeId}, ${ancienne}, 'de', ${NOM_DE_LA_PRIERE.fr})
		`);
		for (const trouvee of lignes<{ id: string; jumua_order: 1 | 2 | 3 }>(
			await tx.execute(sql`
				select "id", "jumua_order" from "course"
				where "organization_id" = ${organizationDeId} and "kind" = 'jumua'
			`)
		)) {
			sessionsDe[trouvee.jumua_order] = trouvee.id;
		}
	});
});

afterAll(async () => {
	await ownerHandle?.close();
});

/** Chaque écran, rendu dans chaque langue par la langue du compte. */
const rendus: Record<string, Record<Langue, string>> = {};

async function rendre(chemin: string): Promise<void> {
	for (const langue of LANGUES) {
		await poserLangueDuCompte(RESPONSABLE, langue);
		const reponse = await get(chemin, cookies);
		expect(reponse.status, `${chemin} en ${langue}`).toBe(200);
		(rendus[chemin] ??= {} as Record<Langue, string>)[langue] = await reponse.text();
	}
	await poserLangueDuCompte(RESPONSABLE, 'fr');
}

describe('les deux écrans, dans les cinq langues (retours D2 et A3)', () => {
	beforeAll(async () => {
		await rendre('/vendredi');
		await rendre('/partager');
	});

	const ECRANS = ['/vendredi', '/partager'] as const;

	it.each(ECRANS.flatMap((chemin) => LANGUES.map((langue) => ({ chemin, langue }))))(
		'serves $chemin with <html lang="$langue">',
		({ chemin, langue }) => {
			expect(rendus[chemin]?.[langue]?.match(/<html\b[^>]*>/g)).toEqual([
				`<html lang="${langue}" dir="${SENS[langue]}">`
			]);
		}
	);

	it.each(ECRANS.flatMap((chemin) => LANGUES.slice(1).map((langue) => ({ chemin, langue }))))(
		'leaves no French sentence on $chemin in $langue',
		({ chemin, langue }) => {
			const francais = sansTexteEnSaLangue(rendus[chemin]?.fr ?? '');
			const autre = sansTexteEnSaLangue(rendus[chemin]?.[langue] ?? '');
			// Sans texte, une comparaison vide passerait pour une traduction complète.
			expect(textSegments(francais).size, chemin).toBeGreaterThan(20);
			expect(frenchLeft(francais, autre, PERMIS)).toEqual([]);
			expect(titre(autre)).not.toBe(titre(francais));
		}
	);

	it.each(LANGUES.slice(1))('leaves no French word alone on /vendredi in %s', (langue) => {
		// Un mot seul ne passe pas par le filtre des phrases : les libellés d'avant sont cherchés un à un.
		const morceaux = textSegments(sansTexteEnSaLangue(rendus['/vendredi']?.[langue] ?? ''));
		for (const mot of [
			'Modifier',
			'Publier',
			'Dépublier',
			'Supprimer',
			'Publiée',
			'Brouillon',
			'Titre',
			'Rang',
			'Début',
			'Fin',
			'Salle',
			'Aucune',
			'Intervenant',
			'Enregistrer',
			'Déplacer',
			'Rétablir',
			'annulée',
			'déplacée',
			'à'
		]) {
			expect(morceaux.has(mot), `${langue} : ${mot}`).toBe(false);
		}
	});

	it.each(ECRANS.flatMap((chemin) => LANGUES.map((langue) => ({ chemin, langue }))))(
		'writes no date as AAAA-MM-JJ on $chemin in $langue',
		({ chemin, langue }) => {
			const lu = visibleText(rendus[chemin]?.[langue] ?? '');
			expect(lu.match(ISO_DATE)?.[0] ?? null).toBeNull();
		}
	);

	it.each(LANGUES)('writes the dates of /vendredi JJ.MM.AAAA after the day in %s', (langue) => {
		const lu = visibleText(rendus['/vendredi']?.[langue] ?? '');
		const vendredi = prochainVendredi(today());
		// Le prochain vendredi, la fin de la première session, et le jour où la troisième est déplacée.
		for (const date of [vendredi, FIN_DE_SESSION(), jourDuDeplacement()]) {
			expect(lu, `${langue} ${date}`).toContain(dateEcrite(langue, date));
		}
	});
});

/** Les formulaires d'enregistrement d'une page, chacun entier. */
function formulairesDEnregistrement(html: string): string[] {
	return [...html.matchAll(/<form\b[^>]*action="\?\/enregistrer[^"]*"[^>]*>[\s\S]*?<\/form>/g)].map(
		(trouve) => trouve[0]
	);
}

/** Le formulaire d'ajout : celui qui ne porte pas l'identifiant d'une session. */
function formulaireDAjout(html: string): string {
	return (
		formulairesDEnregistrement(html).find(
			(formulaire) => !formulaire.includes('name="courseId"')
		) ?? ''
	);
}

/** Le formulaire de modification d'une session, par son identifiant. */
function formulaireDe(html: string, courseId: string): string {
	return (
		formulairesDEnregistrement(html).find((formulaire) =>
			formulaire.includes(`name="courseId" value="${courseId}"`)
		) ?? ''
	);
}

/** La valeur d'un champ d'un formulaire, par son nom, telle que le navigateur l'affiche. */
function valeur(formulaire: string, nom: string): string | undefined {
	const champ = formulaire.match(new RegExp(`<input\\b[^>]*\\sname="${nom}"[^>]*>`))?.[0] ?? '';
	const brute = attribut(champ, 'value');
	return brute === undefined ? undefined : visibleText(`<body>${brute}</body>`);
}

/** Le rang choisi d'avance dans un formulaire : l'option qui porte `selected`. */
function rangChoisi(formulaire: string): string[] {
	const liste = formulaire.match(/<select\b[^>]*name="jumuaOrder"[^>]*>([\s\S]*?)<\/select>/)?.[1];
	return [...(liste ?? '').matchAll(/<option\b([^>]*)>/g)]
		.filter((option) => /\sselected(?:[\s=>]|$)/.test(option[1] ?? ''))
		.map((option) => attribut(option[0], 'value') ?? '');
}

/**
 * Les replis de modification et de suppression d'une page, par leur balise ouvrante. Svelte ajoute
 * à la classe celle qui borne la feuille de style de l'écran.
 */
function replis(html: string): string[] {
	return [...html.matchAll(/<details\b[^>]*class="repli(?:\s[^"]*)?"[^>]*>/g)].map(
		(trouve) => trouve[0]
	);
}

const ouvert = (balise: string) => /\sopen(?:[\s=>]|$)/.test(balise);

/**
 * Une liste d'erreurs : un bloc `role="alert"` autour d'une liste. Le rôle posé sur la liste même
 * effacerait son rôle de liste, et axe le relève (`listitem`).
 */
const ERREURS = /<div\b[^>]*role="alert"[^>]*>\s*<ul\b[^>]*>([\s\S]*?)<\/ul>/g;

describe('la prière du vendredi dit ce qu’elle demande (retour B1)', () => {
	/** Le texte d'un élément de la page par son `id`, sans ses balises. */
	function texteDeLId(html: string, id: string): string {
		const ouverture = new RegExp(`<([a-z]+)\\b[^>]*\\sid="${id}"[^>]*>`).exec(html);
		if (!ouverture) return '';
		const fin = html.indexOf(`</${ouverture[1]}>`, ouverture.index);
		return visibleText(`<body>${html.slice(ouverture.index, fin)}</body>`);
	}

	it.each(LANGUES)('gives each field of the form a label and a help sentence in %s', (langue) => {
		const html = rendus['/vendredi']?.[langue] ?? '';
		const formulaire = formulaireDAjout(html);
		expect(formulaire).not.toBe('');
		for (const nom of [
			'title',
			'jumuaOrder',
			'start',
			'end',
			'roomId',
			'teacher',
			'startsOn',
			'endsOn',
			'description'
		]) {
			const champ = formulaire.match(
				new RegExp(`<(?:input|select|textarea)\\b[^>]*\\sname="${nom}"[^>]*>`)
			)?.[0];
			expect(champ, nom).toBeTruthy();
			const id = attribut(champ ?? '', 'id') ?? '';
			const libelle = formulaire.match(
				new RegExp(`<label\\b[^>]*for="${id}"[^>]*>([\\s\\S]*?)</label>`)
			);
			expect(visibleText(`<body>${libelle?.[1] ?? ''}</body>`), `${nom} : libellé`).not.toBe('');
			const aides = (attribut(champ ?? '', 'aria-describedby') ?? '').split(' ').filter(Boolean);
			expect(aides.length, `${nom} : phrase d’aide`).toBeGreaterThan(0);
			for (const aide of aides) expect(texteDeLId(html, aide), `${nom} : ${aide}`).not.toBe('');
		}
		// Les langues du sermon sont des cases : l'aide est portée par leur groupe.
		const groupe = formulaire.match(
			/<fieldset\b[^>]*>(?:(?!<\/fieldset>)[\s\S])*?name="sermonLanguages"/
		)?.[0];
		const aideDuGroupe = attribut(
			groupe?.match(/<fieldset\b[^>]*>/)?.[0] ?? '',
			'aria-describedby'
		);
		expect(aideDuGroupe, 'sermon : phrase d’aide').toBeTruthy();
		expect(texteDeLId(html, aideDuGroupe ?? '')).not.toBe('');
	});

	/** L'aide de « À partir du » d'un formulaire, telle qu'un lecteur d'écran la lit sous le champ. */
	function aideDuDebut(html: string, formulaire: string): string {
		const champ = formulaire.match(/<input\b[^>]*\sname="startsOn"[^>]*>/)?.[0] ?? '';
		return (attribut(champ, 'aria-describedby') ?? '')
			.split(' ')
			.filter(Boolean)
			.map((id) => texteDeLId(html, id))
			.join(' ');
	}

	it.each(LANGUES)(
		'gives « À partir du » a help that fits a session already in place, not the add advice, in %s',
		(langue) => {
			// Dans la carte d'une session, le champ montre sa date de début, pas la date du jour :
			// « gardez la date du jour » n'y vaut rien, et pousserait à changer une session en place.
			const html = rendus['/vendredi']?.[langue] ?? '';
			const francais = rendus['/vendredi']?.fr ?? '';
			const ajout = aideDuDebut(html, formulaireDAjout(html));
			const modifications = ([1, 2, 3] as const).map((rang) =>
				aideDuDebut(html, formulaireDe(html, sessions[rang]))
			);
			const [modification] = modifications;
			expect(modification, langue).toBeTruthy();
			expect(modifications, langue).toEqual([modification, modification, modification]);
			expect(modification, langue).not.toBe(ajout);
			if (langue === 'fr') {
				expect(ajout).toBe(
					'La session a lieu chaque vendredi à partir de cette date. Gardez la date du jour pour qu’elle commence tout de suite.'
				);
				expect(modification).toBe(
					'La session a lieu chaque vendredi à partir de cette date. Changez cette date seulement pour corriger une erreur.'
				);
			} else {
				expect(modification, langue).not.toBe(
					aideDuDebut(francais, formulaireDe(francais, sessions[1]))
				);
			}
		}
	);

	it('shows examples where a value is not obvious, in French', () => {
		const lu = visibleText(rendus['/vendredi']?.fr ?? '');
		for (const exemple of [
			'Exemple : Prière du vendredi',
			'Exemple : de 12:10 à 12:50.',
			`Exemple : ${INTERVENANT}`
		]) {
			expect(lu).toContain(exemple);
		}
	});

	it('lets each session be removed without JavaScript, after a confirmation on the page', () => {
		const html = rendus['/vendredi']?.fr ?? '';
		for (const rang of [1, 2, 3] as const) {
			const formulaire = [
				...html.matchAll(/<form\b[^>]*action="\?\/supprimer"[^>]*>[\s\S]*?<\/form>/g)
			]
				.map((trouve) => trouve[0])
				.find((un) => un.includes(`value="${sessions[rang]}"`));
			expect(formulaire, `session ${rang}`).toBeTruthy();
			expect(formulaire).toMatch(/<button\b[^>]*type="submit"[^>]*>\s*Oui, supprimer\s*<\/button>/);
		}
	});

	it('says whether a session shows on the public page, in words', () => {
		const lu = visibleText(rendus['/vendredi']?.fr ?? '');
		expect(lu).toContain('Publiée : visible sur votre page publique.');
		expect(lu).toContain('Brouillon : pas encore visible sur votre page publique.');
	});

	it('opens no edit and no delete fold on load: the screen stays short to read', () => {
		for (const langue of LANGUES) {
			const trouves = replis(rendus['/vendredi']?.[langue] ?? '');
			// Deux replis par session : le modifier, le supprimer.
			expect(trouves, langue).toHaveLength(6);
			expect(trouves.filter(ouvert), langue).toEqual([]);
		}
	});

	it('proposes the first free order, and a session with an end date frees its own', () => {
		// La première session s'arrête dans deux mois : c'est la saison qui change, et la session qui
		// la remplace reprend son rang. La deuxième et la troisième continuent sans date de fin.
		expect(rangChoisi(formulaireDAjout(rendus['/vendredi']?.fr ?? ''))).toEqual(['1']);
	});
});

/** Une session de passage, en brouillon, au rang 3 : le test qui l'ajoute la supprime avant de finir. */
const SESSION_DE_PASSAGE = {
	jumuaOrder: '3',
	start: '16:00',
	end: '16:40',
	sermonLanguages: ['fr'],
	startsOn: '2026-09-04',
	endsOn: '',
	status: 'draft'
} as const;

/**
 * Ajoute par l'écran une session de passage sous ce titre, et rend la réponse et son identifiant.
 * Les autres tests comptent trois sessions : celui qui l'ajoute doit la supprimer.
 */
async function ajouterUneSessionDePassage(
	titre: string
): Promise<{ reponse: Response; id: string }> {
	const reponse = await postForm(
		'/vendredi?/enregistrer',
		{ ...SESSION_DE_PASSAGE, title: titre },
		cookies
	);
	const [trouvee] = await maintenance(async (tx) =>
		lignes<{ id: string }>(
			await tx.execute(sql`
				select c."id" from "course" c join "course_translation" t on t."course_id" = c."id"
				where c."organization_id" = ${organizationId} and c."kind" = 'jumua'
					and t."title" = ${titre}
			`)
		)
	);
	expect(trouvee, `session « ${titre} »`).toBeTruthy();
	return { reponse, id: trouvee?.id ?? '' };
}

/** Où commence la première carte de l'écran : ce qui s'écrit avant est en tête. */
const PREMIERE_CARTE = /<section\b[^>]*class="session[\s"]/;

describe('une modification refusée reste sous les yeux (retour B1)', () => {
	/** Le texte de chaque liste d'erreurs d'un morceau de page. */
	function erreurs(html: string): string[][] {
		return [...html.matchAll(ERREURS)].map((liste) =>
			[...(liste[1] ?? '').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((point) =>
				visibleText(`<body>${point[1] ?? ''}</body>`)
			)
		);
	}

	it('reopens the fold of the refused session, keeps what was typed, and says the mistake there', async () => {
		const reponse = await postForm(
			'/vendredi?/enregistrer',
			{
				courseId: sessions[2],
				title: NOM_DE_LA_PRIERE.fr,
				jumuaOrder: '2',
				start: '13:30',
				end: '13:00',
				sermonLanguages: ['de'],
				teacher: 'Imam Omar',
				startsOn: '2026-09-04',
				endsOn: '',
				status: 'published'
			},
			cookies
		);
		expect(reponse.status).toBe(400);
		const html = await reponse.text();
		const carte = section(html, `session-${sessions[2]}`);
		expect(carte).not.toBe('');
		// L'erreur est dans la carte de la session, et nulle part ailleurs.
		expect(erreurs(carte)).toEqual([['L’heure de fin doit venir après l’heure de début.']]);
		expect(erreurs(html.replace(carte, ''))).toEqual([]);
		expect(html).not.toMatch(/<ul\b[^>]*\srole=/);
		// Le repli de modification de cette session est ouvert, et lui seul.
		const ouverts = replis(html).filter(ouvert);
		expect(ouverts).toHaveLength(1);
		expect(replis(carte).filter(ouvert)).toEqual(ouverts);
		// Ce que la personne a saisi est encore là.
		const formulaire = formulaireDe(carte, sessions[2]);
		expect(valeur(formulaire, 'end')).toBe('13:00');
		expect(valeur(formulaire, 'teacher')).toBe('Imam Omar');
		// Sans script, la page renvoyée s'ouvre sur la carte de la session, pas en haut de l'écran.
		expect(formulaire).toContain(`action="?/enregistrer#session-${sessions[2]}"`);
	});

	it('keeps what was typed in the add form too, and says the mistakes there', async () => {
		const reponse = await postForm(
			'/vendredi?/enregistrer',
			{
				title: 'Prière de midi',
				jumuaOrder: '2',
				start: '13:00',
				end: '12:00',
				teacher: 'Imam Omar',
				startsOn: '2026-09-04',
				endsOn: '',
				status: 'published'
			},
			cookies
		);
		expect(reponse.status).toBe(400);
		const html = await reponse.text();
		const ajout = section(html, 'ajout');
		expect(erreurs(ajout)).toEqual([
			['L’heure de fin doit venir après l’heure de début.', 'Cochez au moins une langue du sermon.']
		]);
		expect(erreurs(html.replace(ajout, ''))).toEqual([]);
		const formulaire = formulaireDAjout(ajout);
		expect(valeur(formulaire, 'title')).toBe('Prière de midi');
		expect(valeur(formulaire, 'start')).toBe('13:00');
		expect(valeur(formulaire, 'end')).toBe('12:00');
		expect(valeur(formulaire, 'teacher')).toBe('Imam Omar');
		expect(rangChoisi(formulaire)).toEqual(['2']);
		expect(formulaire).toContain('action="?/enregistrer#ajout"');
	});

	it('says at the top that the session no longer exists, with the mistakes, when its card is gone', async () => {
		// La session est supprimée ailleurs (un autre onglet, une autre personne responsable) pendant
		// que son formulaire est encore ouvert ici, puis ce formulaire part avec une erreur.
		const { id } = await ajouterUneSessionDePassage('Prière supprimée ailleurs');
		expect((await postForm('/vendredi?/supprimer', { courseId: id }, cookies)).status).toBe(200);
		const reponse = await postForm(
			'/vendredi?/enregistrer',
			{ ...SESSION_DE_PASSAGE, courseId: id, title: 'Prière supprimée ailleurs', end: '15:00' },
			cookies
		);
		expect(reponse.status).toBe(400);
		const html = await reponse.text();
		// Aucune carte ne porte plus cette session : la réponse ne peut s'écrire qu'en tête.
		expect(section(html, `session-${id}`)).toBe('');
		// La page renvoyée montre déjà les sessions telles qu'elles sont : la phrase ne demande pas de
		// la recharger, ce qui, sans script, renverrait le même formulaire (relecture du lot 5).
		expect(erreurs(html)).toEqual([
			[
				'Cette session n’existe plus : elle a été supprimée entre-temps. La liste ci-dessous est à jour.',
				'L’heure de fin doit venir après l’heure de début.'
			]
		]);
		expect(html.search(ERREURS)).toBeGreaterThan(-1);
		expect(html.search(ERREURS)).toBeLessThan(html.search(PREMIERE_CARTE));
		// Il n'y a plus de formulaire à rouvrir.
		expect(replis(html).filter(ouvert)).toEqual([]);
	});
});

describe('un enregistrement réussi se confirme là où la page s’ouvre (retour B1)', () => {
	/** Le texte de chaque confirmation d'un morceau de page. */
	function confirmations(html: string): string[] {
		return [...html.matchAll(/<p\b[^>]*role="status"[^>]*>([\s\S]*?)<\/p>/g)].map((trouve) =>
			visibleText(`<body>${trouve[1] ?? ''}</body>`)
		);
	}

	it('confirms an addition in the add section, and a change in the card of the session, not at the top', async () => {
		// Sans script, la page renvoyée s'ouvre sur la section d'ajout (#ajout) ou sur la carte de la
		// session (#session-…) : une confirmation écrite en tête resterait hors de la vue.
		const { reponse: ajoutee, id } = await ajouterUneSessionDePassage('Prière de passage');
		try {
			expect(ajoutee.status).toBe(200);
			const apresAjout = await ajoutee.text();
			const ajout = section(apresAjout, 'ajout');
			expect(confirmations(ajout)).toEqual(['La session est ajoutée.']);
			expect(confirmations(apresAjout.replace(ajout, ''))).toEqual([]);

			const modifiee = await postForm(
				'/vendredi?/enregistrer',
				{ ...SESSION_DE_PASSAGE, courseId: id, title: 'Prière de passage', end: '16:50' },
				cookies
			);
			expect(modifiee.status).toBe(200);
			const apresModification = await modifiee.text();
			const carte = section(apresModification, `session-${id}`);
			expect(carte).not.toBe('');
			expect(confirmations(carte)).toEqual(['Les changements sont enregistrés.']);
			expect(confirmations(apresModification.replace(carte, ''))).toEqual([]);
		} finally {
			await postForm('/vendredi?/supprimer', { courseId: id }, cookies);
		}
	});
});

describe('la prière du vendredi s’écrit dans la langue de l’organisation', () => {
	it('proposes the name of the prayer in the language of the organisation, even when it is not its first published one', async () => {
		expect(valeur(formulaireDAjout(rendus['/vendredi']?.fr ?? ''), 'title')).toBe(
			NOM_DE_LA_PRIERE.fr
		);
		const html = await (await get('/vendredi', cookiesDe)).text();
		expect(valeur(formulaireDAjout(html), 'title')).toBe(NOM_DE_LA_PRIERE.de);
	});

	it('writes a session in the language of the organisation, under the proposed name when the title is left empty', async () => {
		const ecrites = await maintenance(async (tx) =>
			lignes<{ source_language: string; language: string; title: string }>(
				await tx.execute(sql`
					select c."source_language", t."language", t."title"
					from "course" c join "course_translation" t on t."course_id" = c."id"
					where c."id" = ${sessionsDe[1]}
				`)
			)
		);
		expect(ecrites).toEqual([{ source_language: 'de', language: 'de', title: 'Freitagsgebet' }]);
	});

	it('shows a session saved under the French name before under the name in the language of the organisation', async () => {
		const html = await (await get('/vendredi', cookiesDe)).text();
		expect(valeur(formulaireDe(html, sessionsDe[3]), 'title')).toBe(NOM_DE_LA_PRIERE.de);
		// Un titre choisi par l'organisation reste tel quel.
		expect(valeur(formulaireDe(html, sessionsDe[2]), 'title')).toBe(TITRE_CHOISI);
	});
});

describe('la prière du vendredi répond dans la langue du compte (retour D2)', () => {
	/** Les messages d'une réponse : la liste d'erreurs ou la confirmation, en texte. */
	function alerte(html: string): string[] {
		const liste = [...html.matchAll(ERREURS)][0]?.[1] ?? '';
		return [...liste.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((trouve) =>
			visibleText(`<body>${trouve[1] ?? ''}</body>`)
		);
	}

	function confirmation(html: string): string {
		return visibleText(
			`<body>${html.match(/<p\b[^>]*role="status"[^>]*>[\s\S]*?<\/p>/)?.[0] ?? ''}</body>`
		);
	}

	it('names the mistakes of a form in each language', async () => {
		const erreurs: Partial<Record<Langue, string[]>> = {};
		for (const langue of LANGUES) {
			await poserLangueDuCompte(RESPONSABLE, langue);
			const reponse = await postForm(
				'/vendredi?/enregistrer',
				{ jumuaOrder: '1', start: '13:00', end: '12:00', startsOn: '2026-09-04', endsOn: '' },
				cookies
			);
			expect(reponse.status, langue).toBe(400);
			const html = await reponse.text();
			expect(baliseHtml(html)).toBe(`<html lang="${langue}" dir="${SENS[langue]}">`);
			erreurs[langue] = alerte(html);
		}
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		expect(erreurs.fr).toEqual([
			'L’heure de fin doit venir après l’heure de début.',
			'Cochez au moins une langue du sermon.'
		]);
		for (const langue of LANGUES.slice(1)) {
			expect(erreurs[langue], langue).toHaveLength(2);
			for (const [index, phrase] of (erreurs[langue] ?? []).entries()) {
				expect(phrase, `${langue} ${index}`).not.toBe(erreurs.fr?.[index]);
			}
		}
	});

	it('names an unreadable date in each language', async () => {
		const erreurs: Partial<Record<Langue, string[]>> = {};
		for (const langue of LANGUES) {
			await poserLangueDuCompte(RESPONSABLE, langue);
			const reponse = await postForm(
				'/vendredi?/annuler',
				{ courseId: sessions[1], date: 'demain' },
				cookies
			);
			expect(reponse.status, langue).toBe(400);
			erreurs[langue] = alerte(await reponse.text());
		}
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		expect(erreurs.fr).toEqual(['Cette date est illisible. Rechargez la page et recommencez.']);
		for (const langue of LANGUES.slice(1)) {
			expect(erreurs[langue], langue).toHaveLength(1);
			expect(erreurs[langue]?.[0], langue).not.toBe(erreurs.fr?.[0]);
		}
	});

	it('says what each gesture did, in each language', async () => {
		const dit: Partial<Record<Langue, [string, string]>> = {};
		for (const langue of LANGUES) {
			await poserLangueDuCompte(RESPONSABLE, langue);
			const retiree = await postForm(
				'/vendredi?/basculer',
				{ courseId: sessions[1], vers: 'draft' },
				cookies
			);
			const publiee = await postForm(
				'/vendredi?/basculer',
				{ courseId: sessions[1], vers: 'published' },
				cookies
			);
			expect([retiree.status, publiee.status], langue).toEqual([200, 200]);
			dit[langue] = [confirmation(await retiree.text()), confirmation(await publiee.text())];
		}
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		expect(dit.fr).toEqual([
			'La session est retirée de votre page publique. Elle reste ici, en brouillon.',
			'La session est publiée : elle s’affiche sur votre page publique.'
		]);
		for (const langue of LANGUES.slice(1)) {
			const [retrait, publication] = dit[langue] ?? ['', ''];
			expect(retrait, langue).not.toBe('');
			expect(publication, langue).not.toBe('');
			expect(retrait, langue).not.toBe(dit.fr?.[0]);
			expect(publication, langue).not.toBe(dit.fr?.[1]);
			expect(retrait, langue).not.toBe(publication);
		}
	});
});

describe('le message de la semaine, dans chaque langue publiée (retour D1)', () => {
	/** Les messages de la section, dans l'ordre de la page, avec leur langue et leur sens. */
	function messages(html: string) {
		const bloc = section(html, 'semaine-titre');
		return zonesDeTexte(bloc).map((zone) => ({
			langue: attribut(zone.match(/<textarea\b[^>]*>/)?.[0] ?? '', 'lang'),
			sens: attribut(zone.match(/<textarea\b[^>]*>/)?.[0] ?? '', 'dir'),
			texte: contenu(zone)
		}));
	}

	const ENTETE: Record<Langue, (organisation: string) => string> = {
		fr: (organisation) => `Programme de la semaine à ${organisation} :`,
		de: (organisation) => `Das Programm dieser Woche bei ${organisation}:`,
		it: (organisation) => `Il programma della settimana di ${organisation}:`,
		en: (organisation) => `This week’s programme at ${organisation}:`,
		ar: (organisation) => `برنامج هذا الأسبوع في ${organisation}:`
	};

	it.each(LANGUES)(
		'gives one message per published language, the source first, whatever the screen speaks (%s)',
		(langue) => {
			const trouves = messages(rendus['/partager']?.[langue] ?? '');
			expect(trouves.map((message) => message.langue)).toEqual(['fr', 'de', 'it', 'en', 'ar']);
			expect(trouves.map((message) => message.sens)).toEqual(['ltr', 'ltr', 'ltr', 'ltr', 'rtl']);
			for (const [index, message] of trouves.entries()) {
				const langueDuMessage = LANGUES[index] as Langue;
				const [salut, vide, entete] = message.texte.split('\n');
				expect([salut, vide, entete], langueDuMessage).toEqual([
					`${SALUT}${langueDuMessage === 'ar' ? '،' : ','}`,
					'',
					ENTETE[langueDuMessage](ORGANISATION)
				]);
				// Les jours s'écrivent dans la langue du message, en JJ.MM.AAAA.
				expect(message.texte, langueDuMessage).toContain(dateEcrite(langueDuMessage, today()));
				expect(message.texte.match(ISO_DATE)).toBeNull();
			}
		}
	);

	it('names a course in the language of the message when it is translated, as the public page does', () => {
		const trouves = messages(rendus['/partager']?.fr ?? '');
		expect(trouves).toHaveLength(5);
		const [fr, de, , , ar] = trouves.map((message) => message.texte);
		expect(de).toContain(`- ${COURS_DE}, 19:00 – 20:30, ${SALLE}`);
		expect(de).not.toContain(COURS);
		expect(fr).toContain(`- ${COURS}, 19:00 – 20:30, ${SALLE}`);
		// Sans traduction arabe, le titre reste dans sa langue source, comme sur la page publique.
		expect(ar).toContain(`- ${COURS}، 19:00 – 20:30، ${SALLE}`);
	});

	it('opens the message in the source language, and lets the others be opened', () => {
		const bloc = section(rendus['/partager']?.de ?? '', 'semaine-titre');
		const replis = [...bloc.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)];
		expect(replis).toHaveLength(5);
		expect(replis.map((repli) => /\sopen(?:[\s=>]|$)/.test(repli[1] ?? ''))).toEqual([
			true,
			false,
			false,
			false,
			false
		]);
		for (const repli of replis) {
			expect(repli[2]).toMatch(/<summary\b[^>]*>[\s\S]*?\S[\s\S]*?<\/summary>/);
			expect(zonesDeTexte(repli[2] ?? '')).toHaveLength(1);
		}
	});

	it('follows the languages of the organisation: its own first, and none it does not publish', async () => {
		// Ses langues sont enregistrées fr, de, ar : c'est pourtant l'allemand qui vient d'abord.
		const html = await (await get('/partager', cookiesDe)).text();
		const trouves = messages(html);
		expect(trouves.map((message) => message.langue)).toEqual(['de', 'fr', 'ar']);
		expect(trouves[0]?.texte.split('\n')[2]).toBe(ENTETE.de(ORGANISATION_DE));
		const titres = [
			...section(html, 'semaine-titre').matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/g)
		].map((trouve) => visibleText(`<body>${trouve[1] ?? ''}</body>`));
		expect(titres).toEqual([
			'En allemand (la langue principale de votre page)',
			'En français',
			'En arabe'
		]);
	});

	it('names the Friday prayer in the language of each message, when its title is the one proposed', () => {
		const trouves = messages(rendus['/partager']?.fr ?? '');
		expect(trouves.map((message) => message.langue)).toEqual([...LANGUES]);
		for (const message of trouves) {
			const langue = message.langue as Langue;
			const v = VIRGULE[langue];
			expect(message.texte, langue).toContain(
				`- ${NOM_DE_LA_PRIERE[langue]}${v}12:10 – 12:50${v}${SALLE}`
			);
			if (langue !== 'fr') expect(message.texte, langue).not.toContain(NOM_DE_LA_PRIERE.fr);
		}
	});

	it('keeps a title the organisation chose, and names the others in the language of each message', async () => {
		const trouves = messages(await (await get('/partager', cookiesDe)).text());
		expect(trouves.map((message) => message.langue)).toEqual(['de', 'fr', 'ar']);
		for (const message of trouves) {
			const langue = message.langue as Langue;
			const v = VIRGULE[langue];
			expect(message.texte, langue).toContain(`- ${NOM_DE_LA_PRIERE[langue]}${v}12:10 – 12:50`);
			expect(message.texte, langue).toContain(`- ${TITRE_CHOISI}${v}13:30 – 14:10`);
			// La session d'avant l'étape 18, écrite en allemand sous le nom français.
			expect(message.texte, langue).toContain(`- ${NOM_DE_LA_PRIERE[langue]}${v}14:30 – 15:10`);
			for (const autre of LANGUES.filter((une) => une !== langue)) {
				expect(message.texte, `${langue} : ${autre}`).not.toContain(NOM_DE_LA_PRIERE[autre]);
			}
		}
	});
});

describe('la page publique, le programme sur un site et le flux agenda nomment la prière dans la langue du lecteur (retour D1)', () => {
	/** Les titres des événements d'un flux agenda, lignes repliées recollées. */
	function titresDuFlux(ics: string): string[] {
		return ics
			.replace(/\r?\n[ \t]/g, '')
			.split(/\r?\n/)
			.filter((ligne) => ligne.startsWith('SUMMARY:'))
			.map((ligne) => ligne.slice('SUMMARY:'.length));
	}

	async function lire(chemin: string): Promise<string> {
		const reponse = await fetch(`${origin}${chemin}`);
		expect(reponse.status, chemin).toBe(200);
		return reponse.text();
	}

	it.each(['en', 'de'] as const)(
		'names the sessions of a French organisation in %s on the public page and in the programme on a site',
		async (langue) => {
			// La page publique, puis la même page telle que le code à coller la montre, vues Semaine
			// et Tous les cours.
			for (const chemin of [
				`/m/${SLUG}/${langue}`,
				`/m/${SLUG}/${langue}?vue=cours`,
				`/m/${SLUG}/${langue}?embed=1`,
				`/m/${SLUG}/${langue}?vue=cours&embed=1`
			]) {
				const lu = visibleText(await lire(chemin));
				expect(lu, chemin).toContain(NOM_DE_LA_PRIERE[langue]);
				expect(lu, chemin).not.toContain(NOM_DE_LA_PRIERE.fr);
			}
		}
	);

	it.each(['en', 'de'] as const)(
		'names the sessions of a French organisation in %s in the calendar feed',
		async (langue) => {
			const titres = titresDuFlux(await lire(`/m/${SLUG}/agenda.ics?lang=${langue}`));
			expect(titres).toContain(NOM_DE_LA_PRIERE[langue]);
			expect(titres).not.toContain(NOM_DE_LA_PRIERE.fr);
		}
	);

	it('keeps a title the organisation chose, on the public page and in the feed', async () => {
		const allemand = visibleText(await lire(`/m/${SLUG_DE}?vue=cours`));
		expect(allemand).toContain(TITRE_CHOISI);
		expect(allemand).toContain(NOM_DE_LA_PRIERE.de);
		expect(allemand).not.toContain(NOM_DE_LA_PRIERE.fr);
		const francais = visibleText(await lire(`/m/${SLUG_DE}/fr?vue=cours`));
		expect(francais).toContain(TITRE_CHOISI);
		expect(francais).toContain(NOM_DE_LA_PRIERE.fr);
		expect(francais).not.toContain(NOM_DE_LA_PRIERE.de);
		expect(titresDuFlux(await lire(`/m/${SLUG_DE}/agenda.ics?lang=ar`)).sort()).toEqual(
			[NOM_DE_LA_PRIERE.ar, NOM_DE_LA_PRIERE.ar, TITRE_CHOISI].sort()
		);
	});
});

describe('le code à coller, expliqué sans jargon (retour B1)', () => {
	/** Ce que la section du code dit en phrases, sans les codes eux-mêmes. */
	function explications(html: string): string {
		const bloc = section(html, 'code-titre').replace(/<textarea\b[\s\S]*?<\/textarea>/g, ' ');
		return visibleText(`<body>${bloc}</body>`);
	}

	const EXEMPLE: Record<Langue, string> = {
		fr: '« HTML personnalisé »',
		de: '«Individuelles HTML»',
		it: '«HTML personalizzato»',
		en: '‘Custom HTML’',
		ar: '«HTML مخصص»'
	};

	it.each(LANGUES)(
		'says where to paste each code, with an example, and no jargon, in %s',
		(langue) => {
			const html = rendus['/partager']?.[langue] ?? '';
			const dit = explications(html);
			expect(dit.length).toBeGreaterThan(200);
			expect(dit).not.toMatch(/iframe|widget|script|skript|docs\//i);
			expect(dit).toContain(EXEMPLE[langue]);
			// Le nombre à changer pour un cadre plus haut, dit en toutes lettres.
			expect(dit).toContain('900');
		}
	);

	/** Ce que le programme ne prend pas au site qui l'affiche : ses couleurs et ses polices. */
	const APPARENCE: Record<Langue, string> = {
		fr: 'Le programme garde sa propre présentation : il ne prend ni les couleurs ni les polices de votre site.',
		de: 'Das Programm behält seine eigene Gestaltung: Es übernimmt weder die Farben noch die Schriften Ihrer Website.',
		it: 'Il programma mantiene il suo aspetto: non prende né i colori né i caratteri del tuo sito.',
		en: 'The programme keeps its own look: it does not take on the colours or the fonts of your website.',
		ar: 'يحتفظ البرنامج بمظهره الخاص: فهو لا يأخذ ألوان موقعك ولا خطوطه.'
	};

	it.each(LANGUES)(
		'says that the programme keeps its own look, whatever the site, in %s',
		(langue) => {
			expect(explications(rendus['/partager']?.[langue] ?? '')).toContain(APPARENCE[langue]);
		}
	);

	it.each(LANGUES)(
		'keeps each code left to right, in the language of the organisation (%s)',
		(langue) => {
			const zones = zonesDeTexte(section(rendus['/partager']?.[langue] ?? '', 'code-titre'));
			expect(zones.length).toBe(3);
			for (const zone of zones) {
				const balise = zone.match(/<textarea\b[^>]*>/)?.[0] ?? '';
				expect(attribut(balise, 'dir'), balise).toBe('ltr');
				expect(attribut(balise, 'lang'), balise).toBe('fr');
				// Chaque code a un libellé qu'on voit, et non une étiquette pour les seuls lecteurs d'écran.
				const id = attribut(balise, 'id') ?? '';
				expect(rendus['/partager']?.[langue]).toMatch(new RegExp(`<label\\b[^>]*for="${id}"`));
			}
			const [ordinaire, cadre] = zones.map(contenu);
			expect(ordinaire).toContain(`<jadwal-widget org="${SLUG}">`);
			expect(ordinaire).toContain('Voir le programme des cours');
			expect(cadre).toContain(`<iframe src="${origin}/m/${SLUG}"`);
			expect(cadre).toContain(`title="Programme des cours – ${ORGANISATION}"`);
		}
	);

	it('writes the words inside the code in the language of the organisation, not of the screen', async () => {
		await poserLangueDuCompte(RESPONSABLE_DE, 'it');
		const html = await (await get('/partager', cookiesDe)).text();
		await poserLangueDuCompte(RESPONSABLE_DE, 'fr');
		const zones = zonesDeTexte(section(html, 'code-titre'));
		for (const zone of zones) {
			expect(attribut(zone.match(/<textarea\b[^>]*>/)?.[0] ?? '', 'lang')).toBe('de');
		}
		const [ordinaire, cadre] = zones.map(contenu);
		expect(ordinaire).toContain('>Das Kursprogramm ansehen</a>');
		expect(cadre).toContain(`title="Kursprogramm – ${ORGANISATION_DE}"`);
	});
});

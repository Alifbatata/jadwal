// La prière du vendredi et le partage, dans les cinq langues de l'espace (étape 18, retours B1, D1,
// D2 et A3), servis par HTTP.
//
// Deux écrans, et pour chacun ce qu'une personne lit dans sa langue : `<html lang dir>`, aucune phrase
// française restée, aucune date écrite comme la base l'écrit, des libellés qui disent ce qu'ils
// demandent. Le partage donne en plus le message de la semaine dans chacune des langues que
// l'organisation publie, la sienne d'abord (D1), et dit sans jargon où coller chaque code.
//
// « Ce vendredi » suit la règle d'« À venir » : une page restée ouverte ne défait pas un changement
// fait ailleurs, ni ne vise une session supprimée depuis ; un déplacement qui ne change rien est
// refusé, une carte dont l'heure a changé depuis aussi, quel que soit le jour choisi (relecture du
// lot 5). Quand trois sessions continuent sans date de fin, l'écran ne propose plus d'en ajouter une,
// et dit pourquoi et quoi faire. Depuis l'étape 19 (D2), il refuse d'annuler un vendredi passé,
// comme « À venir », répond à une session inconnue par une phrase dans chaque geste, sans rien
// écrire au journal, et vérifie chaque identifiant, chaque date et chaque heure avant la base : plus
// aucune erreur 500.
//
// Vrai serveur construit, vraie base, formulaires envoyés comme sans JavaScript, sur le modèle de
// `espace-en-cinq-langues.test.ts`.

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { addDays, isoDateToDays, todayInZone, weekdayFromDays, type IsoDate } from '@jadwal/core';
import { createDatabase, newId, sql, withOrg, type DatabaseHandle } from '@jadwal/db';
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
/** Le cours publié chaque jour à 19:00, dont le message de la semaine porte le titre traduit. */
let coursId: string;
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
		coursId = newId();
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
	// allemand sous le nom français que le service proposait alors dans toutes les langues. Celle-ci
	// s'arrête dans deux mois : son rang reste libre, et l'écran propose encore d'ajouter une session.
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
				"timing_end", "starts_on", "ends_on")
			values (${ancienne}, ${organizationDeId}, 'jumua', 3, 'published', 'open', array['de'], 'de',
				'weekly', array[5]::smallint[], 1, '2026-09-04', 'fixed', '14:30', '15:10', '2026-09-04',
				${FIN_DE_SESSION()})
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

/**
 * Les refus des gestes de « Ce vendredi », et celui d'une session supprimée entre-temps, dans chaque
 * langue (relecture du lot 5). Tous s'écrivent en tête de l'écran.
 */
const REFUS_DU_VENDREDI: Record<
	'changed' | 'timeChanged' | 'unchanged' | 'sessionGone' | 'alreadyRestored',
	Record<Langue, string>
> = {
	changed: {
		fr: 'Cette session a changé depuis l’ouverture de la page : elle a déjà été annulée ou déplacée ce jour-là. Rien n’a été enregistré. La partie « Ce vendredi », plus bas, est à jour.',
		de: 'Dieser Durchgang hat sich geändert, seit die Seite geöffnet wurde: Er wurde an diesem Tag schon abgesagt oder verschoben. Es wurde nichts gespeichert. Der Abschnitt «Diesen Freitag» weiter unten ist aktuell.',
		it: 'Questo turno è cambiato da quando hai aperto la pagina: quel giorno è già stato annullato o spostato. Non è stato salvato niente. La sezione «Questo venerdì», più in basso, è aggiornata.',
		en: 'This session has changed since the page was opened: it has already been cancelled or moved for that day. Nothing has been saved. The ‘This Friday’ section further down shows the latest changes.',
		ar: 'تغيّر هذا الموعد منذ أن فُتحت الصفحة: سبق أن أُلغي أو نُقل في ذلك اليوم. لم يُحفظ أي شيء. قسم «هذه الجمعة» في الأسفل محدَّث.'
	},
	timeChanged: {
		fr: 'L’heure de cette session a changé depuis l’ouverture de la page. Rien n’a été enregistré. Sa nouvelle heure est écrite plus bas, dans « Ce vendredi » : vérifiez le jour et l’heure choisis, puis recommencez.',
		de: 'Die Uhrzeit dieses Durchgangs hat sich geändert, seit die Seite geöffnet wurde. Es wurde nichts gespeichert. Die neue Uhrzeit steht weiter unten unter «Diesen Freitag»: Prüfen Sie den gewählten Tag und die gewählte Uhrzeit und versuchen Sie es noch einmal.',
		it: 'L’orario di questo turno è cambiato da quando hai aperto la pagina. Non è stato salvato niente. Il nuovo orario è indicato più in basso, in «Questo venerdì»: controlla il giorno e l’orario scelti, poi riprova.',
		en: 'The time of this session has changed since the page was opened. Nothing has been saved. Its new time is shown further down, under ‘This Friday’: check the day and time you chose, then try again.',
		ar: 'تغيّر وقت هذا الموعد منذ أن فُتحت الصفحة. لم يُحفظ أي شيء. وقته الجديد مكتوب في قسم «هذه الجمعة» في الأسفل: راجع ما اخترته من يوم ووقت، ثم حاول مرة أخرى.'
	},
	unchanged: {
		fr: 'La session est déjà prévue ce jour-là à cette heure : rien n’a été déplacé. Choisissez une autre heure ou un autre jour dans « Ce vendredi », plus bas.',
		de: 'Der Durchgang ist schon an diesem Tag zu dieser Uhrzeit geplant: Es wurde nichts verschoben. Wählen Sie weiter unten unter «Diesen Freitag» einen anderen Tag oder eine andere Uhrzeit.',
		it: 'Il turno è già previsto quel giorno a quell’ora: non è stato spostato niente. Scegli un altro giorno o un altro orario più in basso, in «Questo venerdì».',
		en: 'The session is already planned for that day at that time: nothing has been moved. Choose a different day or time under ‘This Friday’, further down.',
		ar: 'الموعد مقرّر أصلًا في هذا اليوم وفي هذا الوقت: لم يُنقل أي شيء. اختر يومًا آخر أو وقتًا آخر في قسم «هذه الجمعة» في الأسفل.'
	},
	sessionGone: {
		fr: 'Cette session n’existe plus : elle a été supprimée entre-temps. La liste ci-dessous est à jour.',
		de: 'Diesen Durchgang gibt es nicht mehr: Er wurde inzwischen gelöscht. Die Liste unten ist aktuell.',
		it: 'Questo turno non esiste più: nel frattempo è stato eliminato. L’elenco qui sotto è aggiornato.',
		en: 'This session no longer exists: it has been deleted in the meantime. The list below shows the sessions as they are now.',
		ar: 'هذا الموعد لم يعد موجودًا: فقد حُذف في هذه الأثناء. القائمة أدناه محدَّثة.'
	},
	/** Un second « Rétablir », depuis une page restée ouverte : rien à rétablir (relecture de D2). */
	alreadyRestored: {
		fr: 'Cette session a déjà été rétablie depuis l’ouverture de la page. Rien n’a été enregistré. La partie « Ce vendredi », plus bas, est à jour.',
		de: 'Dieser Durchgang ist schon wiederhergestellt worden, seit die Seite geöffnet wurde. Es wurde nichts gespeichert. Der Abschnitt «Diesen Freitag» weiter unten ist aktuell.',
		it: 'Questo turno è già stato ripristinato da quando hai aperto la pagina. Non è stato salvato niente. La sezione «Questo venerdì», più in basso, è aggiornata.',
		en: 'This session has already been restored since the page was opened. Nothing has been saved. The ‘This Friday’ section further down shows the latest changes.',
		ar: 'عاد هذا الموعد إلى يومه ووقته المعتادين منذ أن فُتحت الصفحة. لم يُحفظ أي شيء. قسم «هذه الجمعة» في الأسفل محدَّث.'
	}
};

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

/**
 * Une session de passage, en brouillon, au rang 3 : le test qui l'ajoute la supprime avant de finir.
 * Elle a une date de fin : le rang 3 est déjà celui d'une session sans date de fin, et le serveur
 * refuse une seconde session sans date de fin au même rang.
 */
const SESSION_DE_PASSAGE = {
	jumuaOrder: '3',
	start: '16:00',
	end: '16:40',
	sermonLanguages: ['fr'],
	startsOn: '2026-09-04',
	endsOn: '2027-06-25',
	status: 'draft'
} as const;

/**
 * Ajoute par l'écran une session de passage sous ce titre, et rend la réponse et son identifiant.
 * `champs` remplace ceux de la session de passage. Les autres tests comptent trois sessions : celui
 * qui l'ajoute doit la supprimer.
 */
async function ajouterUneSessionDePassage(
	titre: string,
	champs: Record<string, string> = {}
): Promise<{ reponse: Response; id: string }> {
	const reponse = await postForm(
		'/vendredi?/enregistrer',
		{ ...SESSION_DE_PASSAGE, ...champs, title: titre },
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
			[REFUS_DU_VENDREDI.sessionGone.fr, 'L’heure de fin doit venir après l’heure de début.']
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

/**
 * Ce que la section d'ajout dit quand aucun rang n'est libre, parce que trois sessions continuent
 * sans date de fin : pourquoi l'écran ne propose plus d'ajouter une session, et quoi faire.
 */
const PLUS_DE_RANG_LIBRE: Record<Langue, string> = {
	fr: 'Vous ne pouvez pas ajouter de session : trois sessions continuent déjà sans date de fin, et c’est le maximum. Pour changer l’heure d’une session, ouvrez « Modifier cette session » plus haut. Si l’heure change avec la saison, remplissez d’abord « Jusqu’au » dans la session qui s’arrête : vous pourrez ensuite ajouter la nouvelle ici.',
	de: 'Sie können keinen weiteren Durchgang hinzufügen: Drei Durchgänge laufen schon ohne Enddatum weiter, und mehr sind nicht möglich. Um die Zeit eines Durchgangs zu ändern, öffnen Sie weiter oben «Diesen Durchgang bearbeiten». Ändert sich die Zeit mit der Jahreszeit? Füllen Sie zuerst beim Durchgang, der endet, «Gültig bis» aus. Danach können Sie hier den neuen hinzufügen.',
	it: 'Non puoi aggiungere un altro turno: tre turni continuano già senza data di fine, ed è il massimo. Per cambiare l’orario di un turno, apri «Modifica questo turno» più in alto. Se l’orario cambia con la stagione, compila prima «Valido fino al» nel turno che finisce: poi potrai aggiungere qui quello nuovo.',
	en: 'You cannot add another session: three sessions already carry on with no end date, and that is the maximum. To change the time of a session, open ‘Edit this session’ further up. If the time changes with the season, first fill in ‘Until’ in the session that ends: you can then add the new one here.',
	ar: 'لا يمكنك إضافة موعد آخر: توجد 3 مواعيد مستمرة دون تاريخ نهاية، وهذا هو الحد الأقصى. لتغيير وقت موعد، افتح «تعديل هذا الموعد» في الأعلى. وإن تغيّر الوقت مع الفصل، فاملأ أولًا خانة «يسري حتى» في الموعد الذي ينتهي، ثم أضف الموعد الجديد هنا.'
};

describe('sans rang libre, l’écran ne propose plus d’ajouter une session, et dit pourquoi', () => {
	/** Le texte lu d'un morceau de page. */
	const lu = (fragment: string) => visibleText(`<body>${fragment}</body>`);

	it('shows no add form once three sessions go on with no end date, and says why and what to do, in each language', async () => {
		// La première session s'arrête dans deux mois : son rang est libre. Une session sans date de
		// fin le prend, et les trois rangs sont occupés.
		const { reponse, id } = await ajouterUneSessionDePassage('Prière du premier rang', {
			jumuaOrder: '1',
			endsOn: ''
		});
		try {
			expect(reponse.status).toBe(200);
			// La confirmation de l'ajout reste là où la page s'ouvre, suivie de la phrase.
			const apresAjout = section(await reponse.text(), 'ajout');
			expect(formulaireDAjout(apresAjout)).toBe('');
			expect(lu(apresAjout)).toContain('La session est ajoutée.');
			expect(lu(apresAjout)).toContain(PLUS_DE_RANG_LIBRE.fr);
			for (const langue of LANGUES) {
				await poserLangueDuCompte(RESPONSABLE, langue);
				const html = await (await get('/vendredi', cookies)).text();
				const ajout = section(html, 'ajout');
				expect(ajout, langue).not.toBe('');
				expect(formulaireDAjout(html), langue).toBe('');
				expect(lu(ajout), langue).toContain(PLUS_DE_RANG_LIBRE[langue]);
			}
			await poserLangueDuCompte(RESPONSABLE, 'fr');
			// Un ajout envoyé depuis une page ouverte avant, et refusé, garde son formulaire : ce qui
			// a été tapé et l'erreur ne disparaissent pas.
			const refuse = await postForm(
				'/vendredi?/enregistrer',
				{ ...SESSION_DE_PASSAGE, title: 'Prière de trop', end: '15:00' },
				cookies
			);
			expect(refuse.status).toBe(400);
			const ajout = section(await refuse.text(), 'ajout');
			expect(valeur(formulaireDAjout(ajout), 'title')).toBe('Prière de trop');
			expect(lu(ajout)).toContain('L’heure de fin doit venir après l’heure de début.');
			expect(lu(ajout)).not.toContain(PLUS_DE_RANG_LIBRE.fr);
		} finally {
			await poserLangueDuCompte(RESPONSABLE, 'fr');
			await postForm('/vendredi?/supprimer', { courseId: id }, cookies);
		}
		// Le rang de la première session est de nouveau libre : le formulaire d'ajout revient.
		const html = await (await get('/vendredi', cookies)).text();
		expect(rangChoisi(formulaireDAjout(html))).toEqual(['1']);
		expect(lu(section(html, 'ajout'))).not.toContain(PLUS_DE_RANG_LIBRE.fr);
	});

	it('refuses a session sent at a rank a session with no end date already holds, keeps what was typed, and writes nothing, in each language', async () => {
		// La phrase promet un maximum : le serveur le tient aussi pour une page ouverte avant, ou un
		// formulaire écrit à la main (relecture du lot 7).
		const RANG_PRIS: Record<Langue, string> = {
			fr: 'Une autre session sans date de fin occupe déjà ce rang. Choisissez un autre rang, ou remplissez d’abord « Jusqu’au » dans l’autre session.',
			de: 'Ein anderer Durchgang ohne Enddatum hat schon diese Reihenfolge. Wählen Sie eine andere, oder füllen Sie zuerst «Gültig bis» im anderen Durchgang aus.',
			it: 'Un altro turno senza data di fine occupa già questo posto nell’ordine. Scegline un altro, oppure compila prima «Valido fino al» nell’altro turno.',
			en: 'Another session with no end date already has this place in the order. Choose another, or first fill in ‘Until’ in the other session.',
			ar: 'موعد آخر بلا تاريخ نهاية يشغل هذا الترتيب. اختر ترتيبًا آخر، أو املأ أولًا «يسري حتى» في الموعد الآخر.'
		};
		const { id } = await ajouterUneSessionDePassage('Prière du premier rang', {
			jumuaOrder: '1',
			endsOn: ''
		});
		try {
			for (const langue of LANGUES) {
				await poserLangueDuCompte(RESPONSABLE, langue);
				const titre = `Prière de trop, ${langue}`;
				const refuse = await postForm(
					'/vendredi?/enregistrer',
					{ ...SESSION_DE_PASSAGE, jumuaOrder: '2', endsOn: '', title: titre },
					cookies
				);
				expect(refuse.status, langue).toBe(409);
				const ajout = section(await refuse.text(), 'ajout');
				expect(valeur(formulaireDAjout(ajout), 'title'), langue).toBe(titre);
				expect(lu(ajout), langue).toContain(RANG_PRIS[langue]);
				const ecrites = await maintenance(async (tx) =>
					lignes(await tx.execute(sql`select 1 from "course_translation" where "title" = ${titre}`))
				);
				expect(ecrites, langue).toEqual([]);
			}
		} finally {
			await poserLangueDuCompte(RESPONSABLE, 'fr');
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

/** L'exception posée sur une séance, telle que la base la garde, ou rien. */
async function exceptionDe(
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
	).then((trouvees) => trouvees[0]);
}

/** Change l'heure d'une session, comme une autre personne responsable le ferait dans un autre onglet. */
async function changerHeureDe(courseId: string, debut: string, fin: string): Promise<void> {
	await maintenance((tx) =>
		tx.execute(sql`
			update "course" set "timing_start" = ${debut}, "timing_end" = ${fin} where "id" = ${courseId}
		`)
	);
}

/**
 * Un formulaire de « Ce vendredi », tel que la page le propose pour une session et un jour : chaque
 * champ et sa valeur, et pour une liste l'option choisie d'avance. C'est ce qu'envoie une page restée
 * ouverte, même quand la session a changé depuis.
 */
function formulaireDuVendredi(
	html: string,
	action: 'annuler' | 'deplacer' | 'retablir',
	courseId: string,
	date: string
): Record<string, string> {
	const formulaire =
		[
			...section(html, 'ce-vendredi').matchAll(
				new RegExp(`<form\\b[^>]*action="\\?/${action}"[^>]*>[\\s\\S]*?</form>`, 'g')
			)
		]
			.map((trouve) => trouve[0])
			.find((un) => valeur(un, 'courseId') === courseId && valeur(un, 'date') === date) ?? '';
	const champs: Record<string, string> = {};
	for (const champ of formulaire.matchAll(/<input\b[^>]*>/g)) {
		champs[attribut(champ[0], 'name') ?? ''] = attribut(champ[0], 'value') ?? '';
	}
	for (const liste of formulaire.matchAll(
		/<select\b[^>]*\sname="([^"]*)"[^>]*>([\s\S]*?)<\/select>/g
	)) {
		const choisie = [...(liste[2] ?? '').matchAll(/<option\b[^>]*>/g)].find((option) =>
			/\sselected(?:[\s=>]|$)/.test(option[0])
		);
		champs[liste[1] ?? ''] = attribut(choisie?.[0] ?? '', 'value') ?? '';
	}
	return champs;
}

/** Les phrases de la liste d'erreurs en tête de l'écran, avant la première carte. */
function enTete(html: string): string[] {
	const premiere = html.search(PREMIERE_CARTE);
	return [...html.matchAll(ERREURS)]
		.filter((liste) => premiere < 0 || liste.index < premiere)
		.flatMap((liste) =>
			[...(liste[1] ?? '').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((point) =>
				visibleText(`<body>${point[1] ?? ''}</body>`)
			)
		);
}

describe('une page /vendredi restée ouverte ne défait pas un changement (relecture du lot 5)', () => {
	const vendredi = () => prochainVendredi(today());

	async function retablirCeVendredi(courseId: string): Promise<void> {
		await postForm('/vendredi?/retablir', { courseId, date: vendredi() }, cookies);
		expect(await exceptionDe(courseId, vendredi())).toBeUndefined();
	}

	it('refuses the card of a page left open after the session was moved on the upcoming screen, and keeps the move', async () => {
		const page = await (await get('/vendredi', cookies)).text();
		const annulation = formulaireDuVendredi(page, 'annuler', sessions[1], vendredi());
		const deplacement = formulaireDuVendredi(page, 'deplacer', sessions[1], vendredi());
		expect(annulation).toEqual({ courseId: sessions[1], date: vendredi() });
		// Ailleurs, sur « À venir », la session part au lendemain (la veille un samedi), à 15:00.
		const ailleurs = await postForm(
			'/?/deplacer',
			{ courseId: sessions[1], date: vendredi(), toDate: jourDuDeplacement(), toStart: '15:00' },
			cookies
		);
		try {
			expect(ailleurs.status).toBe(200);
			const deplacee = { kind: 'moved', to_date: jourDuDeplacement(), to_start: '15:00' };
			expect(await exceptionDe(sessions[1], vendredi())).toEqual(deplacee);
			// La page restée ouverte : annuler remplaçait le déplacement, déplacer sans rien changer
			// écrivait un déplacement de la session vers elle-même, et déplacer ailleurs l'écrasait.
			for (const [action, envoi] of [
				['annuler', annulation],
				['deplacer', deplacement],
				['deplacer', { ...deplacement, toStart: '16:00' }]
			] as const) {
				const reponse = await postForm(`/vendredi?/${action}`, envoi, cookies);
				expect(reponse.status, `${action} ${envoi['toStart'] ?? ''}`).toBe(409);
				expect(enTete(await reponse.text()), action).toEqual([REFUS_DU_VENDREDI.changed.fr]);
				expect(await exceptionDe(sessions[1], vendredi()), action).toEqual(deplacee);
			}
		} finally {
			await retablirCeVendredi(sessions[1]);
		}
	});

	it('refuses a move that changes neither the day nor the time, says what to do, and writes nothing', async () => {
		const page = await (await get('/vendredi', cookies)).text();
		const deplacement = formulaireDuVendredi(page, 'deplacer', sessions[1], vendredi());
		// Le jour s'ouvre sur ce vendredi, l'heure sur celle de la session : la carte telle quelle.
		expect([deplacement['toDate'], deplacement['toStart']]).toEqual([vendredi(), '12:10']);
		const reponse = await postForm('/vendredi?/deplacer', deplacement, cookies);
		try {
			expect(reponse.status).toBe(400);
			expect(enTete(await reponse.text())).toEqual([REFUS_DU_VENDREDI.unchanged.fr]);
			expect(await exceptionDe(sessions[1], vendredi())).toBeUndefined();
		} finally {
			await retablirCeVendredi(sessions[1]);
		}
	});

	it('refuses the card of a page left open while the time of the session changed, and writes nothing', async () => {
		const page = await (await get('/vendredi', cookies)).text();
		const deplacement = formulaireDuVendredi(page, 'deplacer', sessions[1], vendredi());
		// Une autre personne responsable passe la session à 12:20 ; ce vendredi n'a aucune exception.
		await changerHeureDe(sessions[1], '12:20', '13:00');
		try {
			// Sans changement, la carte déplaçait la session à 12:10, l'ancienne heure, ce vendredi-là.
			for (const envoi of [deplacement, { ...deplacement, toStart: '14:00' }]) {
				const reponse = await postForm('/vendredi?/deplacer', envoi, cookies);
				expect(reponse.status, envoi['toStart']).toBe(409);
				const html = await reponse.text();
				expect(enTete(html), envoi['toStart']).toEqual([REFUS_DU_VENDREDI.timeChanged.fr]);
				expect(await exceptionDe(sessions[1], vendredi()), envoi['toStart']).toBeUndefined();
				// « Ce vendredi » rendu de nouveau montre la nouvelle heure, et sa carte l'envoie.
				expect(
					formulaireDuVendredi(html, 'deplacer', sessions[1], vendredi()),
					envoi['toStart']
				).toMatchObject({ plannedStart: '12:20', toStart: '12:20' });
			}
		} finally {
			await changerHeureDe(sessions[1], '12:10', '12:50');
			await retablirCeVendredi(sessions[1]);
		}
	});

	it('refuses it too when the card moves the session to another day, and writes nothing', async () => {
		const page = await (await get('/vendredi', cookies)).text();
		const deplacement = formulaireDuVendredi(page, 'deplacer', sessions[1], vendredi());
		await changerHeureDe(sessions[1], '12:20', '13:00');
		try {
			// Vers un autre jour, la carte partait aussi d'une heure que la personne n'avait pas vue : à
			// l'ancienne heure, 12:10, ou à une autre.
			const envois: Record<string, string>[] = [
				{ ...deplacement, toDate: jourDuDeplacement() },
				{ ...deplacement, toDate: jourDuDeplacement(), toStart: '14:00' }
			];
			for (const envoi of envois) {
				expect(envoi['toDate'], envoi['toStart']).not.toBe(vendredi());
				const reponse = await postForm('/vendredi?/deplacer', envoi, cookies);
				expect(reponse.status, envoi['toStart']).toBe(409);
				expect(enTete(await reponse.text()), envoi['toStart']).toEqual([
					REFUS_DU_VENDREDI.timeChanged.fr
				]);
				expect(await exceptionDe(sessions[1], vendredi()), envoi['toStart']).toBeUndefined();
			}
		} finally {
			await changerHeureDe(sessions[1], '12:10', '12:50');
			await retablirCeVendredi(sessions[1]);
		}
	});

	it('says that a session deleted in the meantime no longer exists, and writes nothing', async () => {
		const { id } = await ajouterUneSessionDePassage('Prière supprimée entre-temps');
		const page = await (await get('/vendredi', cookies)).text();
		const annulation = formulaireDuVendredi(page, 'annuler', id, vendredi());
		const deplacement = formulaireDuVendredi(page, 'deplacer', id, vendredi());
		expect(annulation).toEqual({ courseId: id, date: vendredi() });
		expect((await postForm('/vendredi?/supprimer', { courseId: id }, cookies)).status).toBe(200);
		for (const [action, envoi] of [
			['annuler', annulation],
			['deplacer', { ...deplacement, toStart: '17:00' }]
		] as const) {
			const reponse = await postForm(`/vendredi?/${action}`, envoi, cookies);
			expect(reponse.status, action).toBe(404);
			expect(enTete(await reponse.text()), action).toEqual([REFUS_DU_VENDREDI.sessionGone.fr]);
			expect(await exceptionDe(id, vendredi()), action).toBeUndefined();
		}
	});

	it('names each refusal of « Ce vendredi » in each language', async () => {
		const date = vendredi();
		// Avant toute exception : le même jour à la même heure, une carte ouverte quand la session
		// commençait à 11:00, et une session qui n'existe plus.
		const avantAnnulation = [
			[
				'unchanged',
				400,
				'deplacer',
				{ courseId: sessions[1], date, plannedStart: '12:10', toDate: date, toStart: '12:10' }
			],
			[
				'timeChanged',
				409,
				'deplacer',
				{ courseId: sessions[1], date, plannedStart: '11:00', toDate: date, toStart: '11:00' }
			],
			['sessionGone', 404, 'annuler', { courseId: newId(), date }]
		] as const;
		try {
			for (const langue of LANGUES) {
				await poserLangueDuCompte(RESPONSABLE, langue);
				for (const [refus, statut, action, envoi] of avantAnnulation) {
					const reponse = await postForm(`/vendredi?/${action}`, envoi, cookies);
					expect(reponse.status, `${refus} ${langue}`).toBe(statut);
					expect(enTete(await reponse.text()), `${refus} ${langue}`).toEqual([
						REFUS_DU_VENDREDI[refus][langue]
					]);
				}
			}
			// La session annulée une fois : l'annuler encore est le refus d'une page restée ouverte.
			expect(
				(await postForm('/vendredi?/annuler', { courseId: sessions[1], date }, cookies)).status
			).toBe(200);
			for (const langue of LANGUES) {
				await poserLangueDuCompte(RESPONSABLE, langue);
				const reponse = await postForm(
					'/vendredi?/annuler',
					{ courseId: sessions[1], date },
					cookies
				);
				expect(reponse.status, langue).toBe(409);
				expect(enTete(await reponse.text()), langue).toEqual([REFUS_DU_VENDREDI.changed[langue]]);
			}
		} finally {
			await poserLangueDuCompte(RESPONSABLE, 'fr');
			await retablirCeVendredi(sessions[1]);
		}
	});
});

/**
 * Le refus d'annuler un vendredi passé, que la page d'une semaine d'avant encore ouverte, ou un
 * formulaire écrit à la main, peut envoyer : la règle d'« À venir », en tête de l'écran (étape 19,
 * D2).
 */
const VENDREDI_PASSE: Record<Langue, string> = {
	fr: 'Cette session est déjà passée : vous ne pouvez annuler que les sessions d’aujourd’hui et des jours suivants.',
	de: 'Dieser Durchgang ist schon vorbei: Sie können nur Durchgänge von heute oder von einem späteren Tag absagen.',
	it: 'Questo turno è già passato: puoi annullare solo i turni di oggi o dei giorni successivi.',
	en: 'This session has already passed: you can only cancel sessions from today onwards.',
	ar: 'هذا الموعد قد مضى: يمكنك إلغاء مواعيد اليوم والأيام التالية فقط.'
};

/** Le refus d'une salle qui n'existe pas, ou plus, dans le formulaire d'une session (étape 19, D2). */
const SALLE_DISPARUE: Record<Langue, string> = {
	fr: 'Cette salle n’existe plus : elle a été supprimée entre-temps. Choisissez une autre salle, ou « Pas de salle précise ».',
	de: 'Diesen Raum gibt es nicht mehr: Er wurde inzwischen gelöscht. Wählen Sie einen anderen Raum oder «Kein bestimmter Raum».',
	it: 'Questa sala non esiste più: nel frattempo è stata eliminata. Scegli un’altra sala, oppure «Nessuna sala precisa».',
	en: 'This room no longer exists: it has been deleted in the meantime. Choose another room, or ‘No particular room’.',
	ar: 'هذه القاعة لم تعد موجودة: فقد حُذفت في هذه الأثناء. اختر قاعة أخرى، أو «دون قاعة محددة».'
};

describe('D2 : l’écran du vendredi refuse ce qu’il ne peut pas faire, sans erreur 500 (étape 19)', () => {
	const vendredi = () => prochainVendredi(today());
	/** Le vendredi d'une semaine plus tôt : toujours passé, même un vendredi. */
	const vendrediPasse = () => addDays(vendredi(), -7);
	let journal: DatabaseHandle;

	beforeAll(() => {
		journal = createDatabase({ role: 'app', overrides: { database: testDatabase } });
	});

	afterAll(async () => {
		await journal?.close();
	});

	/**
	 * Les lignes du journal de l'organisation. Il se lit dans l'organisation, par le rôle applicatif :
	 * le propriétaire ne le lit pas.
	 */
	async function lignesDuJournal(): Promise<number> {
		return withOrg(journal.db, { organizationId, userId: ids[RESPONSABLE] ?? '' }, async (tx) =>
			lignes<{ n: number }>(await tx.execute(sql`select count(*)::int as n from "audit_log"`))
		).then((trouve) => trouve[0]?.n ?? 0);
	}

	/** Les sessions, leur salle, leur heure et leurs exceptions, pour voir que rien ne s'y est écrit. */
	async function etatDesSessions(): Promise<unknown[]> {
		return maintenance(async (tx) =>
			lignes(
				await tx.execute(sql`
					select c."id", c."status", c."room_id", c."timing_start"::text,
						(select count(*)::int from "session_exception" e where e."course_id" = c."id") as n
					from "course" c
					where c."organization_id" = ${organizationId}
					order by c."id"
				`)
			)
		);
	}

	/** Le texte lu d'un morceau de page. */
	const lu = (fragment: string) => visibleText(`<body>${fragment}</body>`);

	/** Une date envoyée par un geste de « Ce vendredi », puis celles du formulaire d'une session. */
	const DATE_ILLISIBLE = 'Cette date est illisible. Rechargez la page et recommencez.';
	const DEBUT_ILLISIBLE = 'Choisissez la date à partir de laquelle la session a lieu.';
	const FIN_ILLISIBLE = 'La date « Jusqu’au » est illisible. Choisissez-la dans le calendrier.';
	const FIN_AVANT_DEBUT = 'La date « Jusqu’au » vient avant la date « À partir du ».';

	it('refuses to cancel a past Friday, says so at the top in each language, and writes nothing', async () => {
		const date = vendrediPasse();
		const journalAvant = await lignesDuJournal();
		try {
			for (const langue of LANGUES) {
				await poserLangueDuCompte(RESPONSABLE, langue);
				const reponse = await postForm(
					'/vendredi?/annuler',
					{ courseId: sessions[1], date },
					cookies
				);
				expect(reponse.status, langue).toBe(400);
				expect(enTete(await reponse.text()), langue).toEqual([VENDREDI_PASSE[langue]]);
				expect(await exceptionDe(sessions[1], date), langue).toBeUndefined();
			}
		} finally {
			await poserLangueDuCompte(RESPONSABLE, 'fr');
			await maintenance((tx) =>
				tx.execute(sql`
					delete from "session_exception" where "course_id" = ${sessions[1]} and "date" = ${date}
				`)
			);
		}
		expect(await lignesDuJournal()).toBe(journalAvant);
	});

	it('answers « Rétablir » for a session that does not exist with a sentence in each language, and writes nothing to the journal', async () => {
		const journalAvant = await lignesDuJournal();
		try {
			for (const langue of LANGUES) {
				await poserLangueDuCompte(RESPONSABLE, langue);
				// Une session inconnue, puis un cours, que cet écran ne rétablit pas.
				for (const courseId of [newId(), coursId]) {
					const reponse = await postForm(
						'/vendredi?/retablir',
						{ courseId, date: vendredi() },
						cookies
					);
					expect(reponse.status, `${langue} ${courseId}`).toBe(404);
					expect(enTete(await reponse.text()), `${langue} ${courseId}`).toEqual([
						REFUS_DU_VENDREDI.sessionGone[langue]
					]);
				}
			}
		} finally {
			await poserLangueDuCompte(RESPONSABLE, 'fr');
		}
		expect(await lignesDuJournal()).toBe(journalAvant);
	});

	it('answers « Rétablir » for a session with nothing left to restore with a sentence in each language, and writes nothing to the journal (relecture de D2)', async () => {
		const date = vendredi();
		// La session annulée ce vendredi, puis rétablie une fois. Une page restée ouverte, qui la
		// montrait annulée, touche encore « Rétablir comme d’habitude » : il n'y a plus rien à rétablir.
		expect(
			(await postForm('/vendredi?/annuler', { courseId: sessions[1], date }, cookies)).status
		).toBe(200);
		const envoi = formulaireDuVendredi(
			await (await get('/vendredi', cookies)).text(),
			'retablir',
			sessions[1],
			date
		);
		// La carte envoie aussi ce qu'elle montrait : l'annulation (étape 19, lot 2).
		expect(envoi).toEqual({ courseId: sessions[1], date, shownKind: 'cancelled' });
		try {
			expect((await postForm('/vendredi?/retablir', envoi, cookies)).status).toBe(200);
			const journalAvant = await lignesDuJournal();
			const avant = await etatDesSessions();
			for (const langue of LANGUES) {
				await poserLangueDuCompte(RESPONSABLE, langue);
				const reponse = await postForm('/vendredi?/retablir', envoi, cookies);
				expect(reponse.status, langue).toBe(409);
				expect(enTete(await reponse.text()), langue).toEqual([
					REFUS_DU_VENDREDI.alreadyRestored[langue]
				]);
			}
			expect(await etatDesSessions()).toEqual(avant);
			expect(await lignesDuJournal()).toBe(journalAvant);
		} finally {
			await poserLangueDuCompte(RESPONSABLE, 'fr');
			await maintenance((tx) =>
				tx.execute(sql`
					delete from "session_exception" where "course_id" = ${sessions[1]} and "date" = ${date}
				`)
			);
		}
	});

	it('answers a publication or a removal of a session that does not exist, and writes nothing to the journal', async () => {
		const journalAvant = await lignesDuJournal();
		const avant = await etatDesSessions();
		for (const courseId of [newId(), coursId]) {
			for (const [action, envoi] of [
				['basculer', { courseId, vers: 'draft' }],
				['supprimer', { courseId }]
			] as const) {
				const reponse = await postForm(`/vendredi?/${action}`, envoi, cookies);
				expect(reponse.status, `${action} ${courseId}`).toBe(404);
				expect(enTete(await reponse.text()), `${action} ${courseId}`).toEqual([
					REFUS_DU_VENDREDI.sessionGone.fr
				]);
			}
		}
		expect(await etatDesSessions()).toEqual(avant);
		expect(await lignesDuJournal()).toBe(journalAvant);
	});

	it('checks each identifier of each gesture before the database, and answers with a sentence instead of an error 500', async () => {
		const MAL_FORME = 'pas-un-identifiant';
		const journalAvant = await lignesDuJournal();
		const avant = await etatDesSessions();
		const date = vendredi();
		for (const [action, envoi] of [
			['enregistrer', { ...SESSION_DE_PASSAGE, courseId: MAL_FORME, title: 'Prière mal nommée' }],
			['basculer', { courseId: MAL_FORME, vers: 'published' }],
			['supprimer', { courseId: MAL_FORME }],
			['annuler', { courseId: MAL_FORME, date }],
			['deplacer', { courseId: MAL_FORME, date, toDate: date, toStart: '15:00' }],
			['retablir', { courseId: MAL_FORME, date }]
		] as const) {
			const reponse = await postForm(`/vendredi?/${action}`, envoi, cookies);
			expect(reponse.status, action).toBe(404);
			expect(enTete(await reponse.text())[0], action).toBe(REFUS_DU_VENDREDI.sessionGone.fr);
		}
		// La salle d'une session : mal formée, inconnue, ou d'une autre organisation, dans le formulaire
		// d'ajout comme dans celui d'une session. Sa phrase s'écrit dans le formulaire, avec la saisie.
		const autreSalle = newId();
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "room" ("id", "organization_id", "name", "display_order")
				values (${autreSalle}, ${organizationDeId}, 'Saal', 1)
			`)
		);
		try {
			for (const roomId of [MAL_FORME, newId(), autreSalle]) {
				const ajout = await postForm(
					'/vendredi?/enregistrer',
					{ ...SESSION_DE_PASSAGE, title: 'Prière sans salle', roomId },
					cookies
				);
				expect(ajout.status, roomId).toBe(400);
				const formulaireAjoute = section(await ajout.text(), 'ajout');
				expect(lu(formulaireAjoute), roomId).toContain(SALLE_DISPARUE.fr);
				expect(valeur(formulaireDAjout(formulaireAjoute), 'title'), roomId).toBe(
					'Prière sans salle'
				);

				const modification = await postForm(
					'/vendredi?/enregistrer',
					{
						...SESSION_DE_PASSAGE,
						courseId: sessions[2],
						title: NOM_DE_LA_PRIERE.fr,
						jumuaOrder: '2',
						start: '13:30',
						end: '14:10',
						sermonLanguages: ['de'],
						endsOn: '',
						status: 'published',
						roomId
					},
					cookies
				);
				expect(modification.status, roomId).toBe(400);
				const carte = section(await modification.text(), `session-${sessions[2]}`);
				expect(lu(carte), roomId).toContain(SALLE_DISPARUE.fr);
			}
		} finally {
			await maintenance((tx) => tx.execute(sql`delete from "room" where "id" = ${autreSalle}`));
		}
		expect(await etatDesSessions()).toEqual(avant);
		expect(await lignesDuJournal()).toBe(journalAvant);
	});

	it('names the missing room in each language', async () => {
		try {
			for (const langue of LANGUES) {
				await poserLangueDuCompte(RESPONSABLE, langue);
				const reponse = await postForm(
					'/vendredi?/enregistrer',
					{ ...SESSION_DE_PASSAGE, title: 'Prière sans salle', roomId: newId() },
					cookies
				);
				expect(reponse.status, langue).toBe(400);
				expect(lu(section(await reponse.text(), 'ajout')), langue).toContain(
					SALLE_DISPARUE[langue]
				);
			}
		} finally {
			await poserLangueDuCompte(RESPONSABLE, 'fr');
		}
	});

	it('refuses an impossible date or time with a sentence, instead of an error 500', async () => {
		const journalAvant = await lignesDuJournal();
		const avant = await etatDesSessions();
		const date = vendredi();
		// Au bon format, mais impossibles : un 30 février, 25 h 99.
		for (const [action, envoi, phrase] of [
			['annuler', { courseId: sessions[1], date: '2026-02-30' }, DATE_ILLISIBLE],
			['retablir', { courseId: sessions[1], date: '2026-02-30' }, DATE_ILLISIBLE],
			[
				'deplacer',
				{ courseId: sessions[1], date, toDate: '2026-02-30', toStart: '15:00' },
				DATE_ILLISIBLE
			],
			[
				'deplacer',
				{ courseId: sessions[1], date, toDate: date, toStart: '25:99' },
				'Cette heure est illisible. Exemple : 13:30.'
			]
		] as const) {
			const cas = `${action} ${JSON.stringify(envoi)}`;
			const reponse = await postForm(`/vendredi?/${action}`, envoi, cookies);
			expect(reponse.status, cas).toBe(400);
			expect(enTete(await reponse.text()), cas).toEqual([phrase]);
		}
		for (const [champs, phrase] of [
			[
				{ start: '25:99' },
				'Donnez une heure de début et une heure de fin. Exemple : 12:10 et 12:50.'
			],
			[{ startsOn: '2026-02-30' }, DEBUT_ILLISIBLE],
			[{ endsOn: '2026-02-30' }, FIN_ILLISIBLE]
		] as const) {
			const reponse = await postForm(
				'/vendredi?/enregistrer',
				{ ...SESSION_DE_PASSAGE, title: 'Prière impossible', ...champs },
				cookies
			);
			expect(reponse.status, JSON.stringify(champs)).toBe(400);
			expect(lu(section(await reponse.text(), 'ajout')), JSON.stringify(champs)).toContain(phrase);
		}
		expect(await etatDesSessions()).toEqual(avant);
		expect(await lignesDuJournal()).toBe(journalAvant);
	});

	it('refuses a date the service does not handle, the year 0000 or outside 1970 to 2100, and keeps the agenda feed readable', async () => {
		// Le calendrier de `@jadwal/core` a un an 0000 (ADR 0012), PostgreSQL non : la requête échouait,
		// et l'écran répondait par une erreur 500. Le 31.12.9999, la base le range, mais le flux agenda
		// calcule le lendemain d'une date de fin, en l'an 10000, que le calcul refuse : une session qui
		// finissait ce jour-là faisait tomber le flux de toute l'organisation. Le service s'en tient aux
		// années que couvrent les tests du calcul, de 1970 à 2100 (étape 19, relecture de D2).
		const TITRE = 'Prière hors des années';
		const journalAvant = await lignesDuJournal();
		const avant = await etatDesSessions();
		const date = vendredi();
		const [{ debut } = { debut: '' }] = await maintenance(async (tx) =>
			lignes<{ debut: string }>(await tx.execute(sql`select now()::text as debut`))
		);
		const recus: Record<string, unknown> = {};
		const attendus: Record<string, unknown> = {};
		try {
			for (const [action, envoi] of [
				['annuler', { courseId: sessions[1], date: '0000-01-01' }],
				['retablir', { courseId: sessions[1], date: '0000-01-01' }],
				['deplacer', { courseId: sessions[1], date: '0000-01-01', toDate: date, toStart: '15:00' }],
				['deplacer', { courseId: sessions[1], date, toDate: '0000-01-01', toStart: '15:00' }],
				['annuler', { courseId: sessions[1], date: '2101-01-07' }],
				['retablir', { courseId: sessions[1], date: '9999-12-31' }],
				['deplacer', { courseId: sessions[1], date: '1969-12-26', toDate: date, toStart: '15:00' }],
				['deplacer', { courseId: sessions[1], date, toDate: '9999-12-31', toStart: '15:00' }]
			] as const) {
				const cas = `${action} ${JSON.stringify(envoi)}`;
				const reponse = await postForm(`/vendredi?/${action}`, envoi, cookies);
				recus[cas] = { statut: reponse.status, phrases: enTete(await reponse.text()) };
				attendus[cas] = { statut: 400, phrases: [DATE_ILLISIBLE] };
			}
			// Le formulaire d'une session : « À partir du » et « Jusqu'au ».
			for (const [champs, phrases] of [
				[{ startsOn: '0000-01-01', endsOn: '' }, [DEBUT_ILLISIBLE]],
				[{ startsOn: '0000-01-01', endsOn: '0000-06-01' }, [DEBUT_ILLISIBLE, FIN_ILLISIBLE]],
				[{ endsOn: '0000-06-01' }, [FIN_ILLISIBLE]],
				// Publiée : le flux agenda ne montre que les sessions publiées.
				[
					{ startsOn: '9999-12-24', endsOn: '9999-12-31', status: 'published' },
					[DEBUT_ILLISIBLE, FIN_ILLISIBLE]
				],
				[{ startsOn: '1969-12-26' }, [DEBUT_ILLISIBLE]],
				[{ endsOn: '2101-01-07' }, [FIN_ILLISIBLE]]
			] as const) {
				const cas = `enregistrer ${JSON.stringify(champs)}`;
				const reponse = await postForm(
					'/vendredi?/enregistrer',
					{ ...SESSION_DE_PASSAGE, title: TITRE, ...champs },
					cookies
				);
				const ajout = lu(section(await reponse.text(), 'ajout'));
				recus[cas] = {
					statut: reponse.status,
					phrases: [DEBUT_ILLISIBLE, FIN_ILLISIBLE, FIN_AVANT_DEBUT].filter((phrase) =>
						ajout.includes(phrase)
					)
				};
				attendus[cas] = { statut: 400, phrases };
			}
			recus['flux agenda'] = (await fetch(`${origin}/m/${SLUG}/agenda.ics`)).status;
			attendus['flux agenda'] = 200;
			expect(recus).toEqual(attendus);
			expect(await etatDesSessions()).toEqual(avant);
			expect(await lignesDuJournal()).toBe(journalAvant);
		} finally {
			// Ce qu'un envoi aurait écrit ne reste pas pour les tests suivants.
			await maintenance(async (tx) => {
				await tx.execute(sql`
					delete from "session_exception"
					where "course_id" = ${sessions[1]} and "created_at" >= ${debut}::timestamptz
				`);
				await tx.execute(sql`
					delete from "course" where "id" in
						(select "course_id" from "course_translation" where "title" = ${TITRE})
				`);
			});
		}
	});

	it('offers in the calendar of each date of a session only the dates the service accepts, 1970 to 2100 (relecture de D2)', async () => {
		// Le calendrier du navigateur proposait le 31.12.2101, que l'action refuse comme une date
		// illisible : la phrase disait de la choisir dans le calendrier, où elle venait d'être choisie.
		const formulaires = formulairesDEnregistrement(await (await get('/vendredi', cookies)).text());
		expect(formulaires.length).toBeGreaterThan(1);
		for (const [index, formulaire] of formulaires.entries()) {
			for (const nom of ['startsOn', 'endsOn']) {
				const balise =
					formulaire.match(new RegExp(`<input\\b[^>]*\\sname="${nom}"[^>]*>`))?.[0] ?? '';
				expect(
					[attribut(balise, 'type'), attribut(balise, 'min'), attribut(balise, 'max')],
					`${index} ${nom}`
				).toEqual(['date', '1970-01-01', '2100-12-31']);
			}
		}
	});

	it('removes the null character a hand-written form may send, instead of an error 500', async () => {
		// PostgreSQL refuse ce caractère dans un texte : un titre qui le portait donnait une erreur 500
		// (étape 19, relecture de D2). Aucun clavier ne le tape : il est retiré, et le reste s'enregistre.
		const reponse = await postForm(
			'/vendredi?/enregistrer',
			{
				...SESSION_DE_PASSAGE,
				title: 'Prière\u0000 sans caractère nul',
				teacher: 'Imam\u0000 Youssef',
				description: 'Sermon\u0000 court.'
			},
			cookies
		);
		const [lue] = await maintenance(async (tx) =>
			lignes<{ id: string; title: string; teacher: string | null; description: string | null }>(
				await tx.execute(sql`
					select c."id", t."title", c."teacher", t."description"
					from "course" c join "course_translation" t on t."course_id" = c."id"
					where c."organization_id" = ${organizationId} and c."kind" = 'jumua'
						and t."title" like 'Prière%sans caractère nul'
				`)
			)
		);
		try {
			expect({
				statut: reponse.status,
				session: lue && { title: lue.title, teacher: lue.teacher, description: lue.description }
			}).toEqual({
				statut: 200,
				session: {
					title: 'Prière sans caractère nul',
					teacher: 'Imam Youssef',
					description: 'Sermon court.'
				}
			});
		} finally {
			if (lue)
				await maintenance((tx) => tx.execute(sql`delete from "course" where "id" = ${lue.id}`));
		}
	});
});

/**
 * Les langues d'enseignement, dans l'ordre des cases : le sermon se choisit parmi elles toutes, et
 * plus seulement parmi celles que l'organisation publie (étape 19, lot 2). Le chef de projet citait
 * l'albanais, le turc et le bosnien : une communauté entend souvent le sermon dans une langue que sa
 * page publique ne parle pas.
 */
const LANGUES_DU_SERMON = ['fr', 'de', 'it', 'ar', 'en', 'sq', 'tr', 'bs'] as const;

/** Le nom de chaque case du sermon, dans chaque langue de l'écran, majuscule comprise. */
const CASES_DU_SERMON: Record<Langue, readonly string[]> = {
	fr: ['Français', 'Allemand', 'Italien', 'Arabe', 'Anglais', 'Albanais', 'Turc', 'Bosnien'],
	de: [
		'Französisch',
		'Deutsch',
		'Italienisch',
		'Arabisch',
		'Englisch',
		'Albanisch',
		'Türkisch',
		'Bosnisch'
	],
	it: ['Francese', 'Tedesco', 'Italiano', 'Arabo', 'Inglese', 'Albanese', 'Turco', 'Bosniaco'],
	en: ['French', 'German', 'Italian', 'Arabic', 'English', 'Albanian', 'Turkish', 'Bosnian'],
	ar: [
		'الفرنسية',
		'الألمانية',
		'الإيطالية',
		'العربية',
		'الإنجليزية',
		'الألبانية',
		'التركية',
		'البوسنية'
	]
};

/** L'aide des cases du sermon : elle ne dit plus que seules les langues de la page sont proposées. */
const AIDE_DU_SERMON: Record<Langue, string> = {
	fr: 'Cochez chaque langue dans laquelle le sermon est dit, même si votre page publique n’est pas écrite dans cette langue.',
	de: 'Kreuzen Sie jede Sprache an, in der gepredigt wird, auch wenn Ihre öffentliche Seite nicht in dieser Sprache erscheint.',
	it: 'Seleziona ogni lingua in cui viene detto il sermone, anche se la tua pagina pubblica non è in quella lingua.',
	en: 'Tick each language the sermon is given in, even if your public page is not in that language.',
	ar: 'اختر كل لغة تُلقى بها الخطبة، حتى إن لم تكن صفحتك العامة مكتوبة بهذه اللغة.'
};

/** L'albanais, le turc et le bosnien, tels que chaque langue du lecteur les écrit à la suite. */
const TROIS_LANGUES: Record<Langue, string> = {
	fr: 'albanais, turc et bosnien',
	de: 'Albanisch, Türkisch und Bosnisch',
	it: 'albanese, turco e bosniaco',
	en: 'Albanian, Turkish and Bosnian',
	ar: 'الألبانية والتركية والبوسنية'
};

/** « Sermon en … » dans la carte d'une session de l'écran du vendredi (`fridayTexts.sermonIn`). */
const SERMON_DE_LA_CARTE: Record<Langue, (langues: string) => string> = {
	fr: (langues) => `Sermon en ${langues}`,
	de: (langues) => `Predigt auf ${langues}`,
	it: (langues) => `Sermone in ${langues}`,
	en: (langues) => `Sermon in ${langues}`,
	ar: (langues) => `لغة الخطبة: ${langues}`
};

/** « sermon en … » dans l'onglet Prières de la page publique (`t(langue).sermonIn`). */
const SERMON_DE_LA_PAGE: Record<Langue, (langues: string) => string> = {
	fr: (langues) => `sermon en ${langues}`,
	de: (langues) => `Predigt auf ${langues}`,
	it: (langues) => `sermone in ${langues}`,
	en: (langues) => `sermon in ${langues}`,
	ar: (langues) => `لغة الخطبة: ${langues}`
};

/** Les cases du sermon d'un formulaire : la valeur de chacune, et son nom tel qu'il se lit. */
function casesDuSermon(formulaire: string): { valeur: string; nom: string }[] {
	return [...formulaire.matchAll(/<label\b[^>]*class="case[^"]*"[^>]*>([\s\S]*?)<\/label>/g)]
		.map((trouve) => trouve[1] ?? '')
		.filter((contenu) => contenu.includes('name="sermonLanguages"'))
		.map((contenu) => ({
			valeur: attribut(contenu.match(/<input\b[^>]*>/)?.[0] ?? '', 'value') ?? '',
			nom: visibleText(`<body>${contenu}</body>`)
		}));
}

describe('la langue du sermon se choisit parmi toutes les langues d’enseignement (étape 19, lot 2)', () => {
	/** L'aide d'un groupe de cases, par l'`aria-describedby` de son `fieldset`. */
	function aideDesCases(html: string, formulaire: string): string {
		const groupe =
			formulaire.match(
				/<fieldset\b[^>]*>(?:(?!<\/fieldset>)[\s\S])*?name="sermonLanguages"/
			)?.[0] ?? '';
		const id = attribut(groupe.match(/<fieldset\b[^>]*>/)?.[0] ?? '', 'aria-describedby') ?? '';
		const aide = html.match(new RegExp(`<p\\b[^>]*\\sid="${id}"[^>]*>([\\s\\S]*?)</p>`))?.[1];
		return visibleText(`<body>${aide ?? ''}</body>`);
	}

	it('offers the eight teaching languages to an organisation that publishes three, in each form and each language, and says so', async () => {
		// L'organisation allemande publie le français, l'allemand et l'arabe : l'écran ne proposait que
		// ces trois cases, dans le formulaire d'ajout comme dans celui d'une session enregistrée.
		try {
			for (const langue of LANGUES) {
				await poserLangueDuCompte(RESPONSABLE_DE, langue);
				const html = await (await get('/vendredi', cookiesDe)).text();
				const formulaires = {
					ajout: formulaireDAjout(html),
					premiere: formulaireDe(html, sessionsDe[1]),
					deuxieme: formulaireDe(html, sessionsDe[2])
				};
				for (const [nom, formulaire] of Object.entries(formulaires)) {
					expect(formulaire, `${langue} ${nom}`).not.toBe('');
					expect(casesDuSermon(formulaire), `${langue} ${nom}`).toEqual(
						LANGUES_DU_SERMON.map((valeur, rang) => ({
							valeur,
							nom: CASES_DU_SERMON[langue][rang]
						}))
					);
					expect(aideDesCases(html, formulaire), `${langue} ${nom}`).toBe(AIDE_DU_SERMON[langue]);
				}
			}
		} finally {
			await poserLangueDuCompte(RESPONSABLE_DE, 'fr');
		}
	});

	it('saves a sermon in Albanian, Turkish and Bosnian, which the organisation does not publish, and names them wherever the sermon is read, in each language', async () => {
		// L'organisation publie les cinq langues du service, et aucune des trois : l'action les
		// retirait de l'envoi, et refusait la session faute de langue du sermon.
		const titre = 'Prière en trois langues';
		const reponse = await postForm(
			'/vendredi?/enregistrer',
			{
				title: titre,
				jumuaOrder: '3',
				start: '16:00',
				end: '16:40',
				sermonLanguages: ['sq', 'tr', 'bs'],
				startsOn: '2026-09-04',
				endsOn: '2027-06-25',
				status: 'published'
			},
			cookies
		);
		const [lue] = await maintenance(async (tx) =>
			lignes<{ id: string; teaching_language: string[] }>(
				await tx.execute(sql`
					select c."id", c."teaching_language"
					from "course" c join "course_translation" t on t."course_id" = c."id"
					where c."organization_id" = ${organizationId} and c."kind" = 'jumua'
						and t."title" = ${titre}
				`)
			)
		);
		try {
			expect(reponse.status).toBe(200);
			expect(lue?.teaching_language).toEqual(['sq', 'tr', 'bs']);
			const id = lue?.id ?? '';
			for (const langue of LANGUES) {
				// L'écran du vendredi, dans la langue du compte.
				await poserLangueDuCompte(RESPONSABLE, langue);
				const ecran = await (await get('/vendredi', cookies)).text();
				expect(visibleText(`<body>${section(ecran, `session-${id}`)}</body>`), langue).toContain(
					SERMON_DE_LA_CARTE[langue](TROIS_LANGUES[langue])
				);
				// La page publique, son onglet Prières, et la page telle que le widget l'encadre.
				const page = langue === 'fr' ? `/m/${SLUG}` : `/m/${SLUG}/${langue}`;
				const vendredi = (await (await fetch(`${origin}${page}`)).text()).match(
					/<section\b[^>]*aria-labelledby="vendredi-titre"[\s\S]*?<\/section>/
				)?.[0];
				expect(visibleText(`<body>${vendredi ?? ''}</body>`), `${langue} page`).toContain(
					TROIS_LANGUES[langue]
				);
				const prieres = (await (await fetch(`${origin}${page}?vue=prieres`)).text()).match(
					/<section\b[^>]*\bid="prieres-vendredi"[\s\S]*?<\/section>/
				)?.[0];
				expect(visibleText(`<body>${prieres ?? ''}</body>`), `${langue} prières`).toContain(
					SERMON_DE_LA_PAGE[langue](TROIS_LANGUES[langue])
				);
				const integree = visibleText(await (await fetch(`${origin}${page}?embed=1`)).text());
				expect(integree, `${langue} widget`).toContain(TROIS_LANGUES[langue]);
			}
			// L'API donne les codes, que le lecteur tiers écrit dans ses propres mots.
			const programme = (await (
				await fetch(
					`${origin}/api/v1/organisations/${SLUG}/schedule?from=${today()}&to=${addDays(today(), 6)}`
				)
			).json()) as { sessions: { title: string; kind: string; sermonLanguages?: string[] }[] };
			const seances = programme.sessions.filter((seance) => seance.title === titre);
			expect(seances.length).toBeGreaterThan(0);
			for (const seance of seances) expect(seance.sermonLanguages).toEqual(['sq', 'tr', 'bs']);
		} finally {
			await poserLangueDuCompte(RESPONSABLE, 'fr');
			if (lue) {
				await maintenance((tx) => tx.execute(sql`delete from "course" where "id" = ${lue.id}`));
			}
		}
	});

	it('still refuses a code that is not a teaching language: without another one, the session has no language of the sermon', async () => {
		// Une case écrite à la main hors de la liste ne s'enregistre pas : la liste s'ouvre aux huit
		// langues d'enseignement, pas à n'importe quel texte.
		const reponse = await postForm(
			'/vendredi?/enregistrer',
			{ ...SESSION_DE_PASSAGE, title: 'Prière en klingon', sermonLanguages: ['tlh'] },
			cookies
		);
		expect(reponse.status).toBe(400);
		const erreurs = [...formulaireDAjout(await reponse.text()).matchAll(ERREURS)].flatMap((liste) =>
			[...(liste[1] ?? '').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((point) =>
				visibleText(`<body>${point[1] ?? ''}</body>`)
			)
		);
		expect(erreurs).toEqual(['Cochez au moins une langue du sermon.']);
		const [trouvee] = await maintenance(async (tx) =>
			lignes<{ id: string }>(
				await tx.execute(sql`
					select c."id" from "course" c join "course_translation" t on t."course_id" = c."id"
					where c."organization_id" = ${organizationId} and t."title" = 'Prière en klingon'
				`)
			)
		);
		expect(trouvee).toBeUndefined();
	});
});

/**
 * Les lignes du journal de l'organisation, lues par sa responsable, par une connexion à part : le
 * journal se lit sous le rôle applicatif, le propriétaire ne le lit pas.
 */
async function lignesDuJournalDeVendredi(): Promise<number> {
	const journal = createDatabase({ role: 'app', overrides: { database: testDatabase } });
	try {
		const trouve = await withOrg(
			journal.db,
			{ organizationId, userId: ids[RESPONSABLE] ?? '' },
			async (tx) =>
				lignes<{ n: number }>(await tx.execute(sql`select count(*)::int as n from "audit_log"`))
		);
		return trouve[0]?.n ?? 0;
	} finally {
		await journal.close();
	}
}

/** Retire toute exception de la première session au prochain vendredi, sans passer par l'écran. */
async function effacerLesExceptionsDeLaPremiere(): Promise<void> {
	await maintenance((tx) =>
		tx.execute(sql`
			delete from "session_exception"
			where "course_id" = ${sessions[1]} and "date" = ${prochainVendredi(today())}
		`)
	);
}

describe('« Ce vendredi » : un « Rétablir » resté ouvert ne défait pas un changement fait depuis (étape 19, lot 2)', () => {
	const vendredi = () => prochainVendredi(today());

	it('refuses « Rétablir » from a page left open after the session was restored then changed again, keeps the change, says so in each language, and writes nothing to the journal', async () => {
		const date = vendredi();
		// La session annulée ; une page la montre annulée, avec « Rétablir comme d’habitude ».
		expect(
			(await postForm('/vendredi?/annuler', { courseId: sessions[1], date }, cookies)).status
		).toBe(200);
		const annulee = formulaireDuVendredi(
			await (await get('/vendredi', cookies)).text(),
			'retablir',
			sessions[1],
			date
		);
		try {
			// Ailleurs, une autre personne la rétablit, puis la déplace au lendemain (la veille un samedi).
			expect((await postForm('/vendredi?/retablir', annulee, cookies)).status).toBe(200);
			expect(
				(
					await postForm(
						'/vendredi?/deplacer',
						{ courseId: sessions[1], date, toDate: jourDuDeplacement(), toStart: '15:00' },
						cookies
					)
				).status
			).toBe(200);
			const deplacee = { kind: 'moved', to_date: jourDuDeplacement(), to_start: '15:00' };
			const journalAvant = await lignesDuJournalDeVendredi();
			// La page restée ouverte touche « Rétablir » : elle effaçait le déplacement, qu'elle n'avait
			// jamais vu.
			for (const langue of LANGUES) {
				await poserLangueDuCompte(RESPONSABLE, langue);
				const reponse = await postForm('/vendredi?/retablir', annulee, cookies);
				expect(reponse.status, langue).toBe(409);
				expect(enTete(await reponse.text()), langue).toEqual([REFUS_DU_VENDREDI.changed[langue]]);
				expect(await exceptionDe(sessions[1], date), langue).toEqual(deplacee);
			}
			await poserLangueDuCompte(RESPONSABLE, 'fr');
			expect(await lignesDuJournalDeVendredi()).toBe(journalAvant);
			// La carte envoie ce qu'elle montrait : l'annulation, puis le déplacement.
			expect(annulee).toEqual({ courseId: sessions[1], date, shownKind: 'cancelled' });
			const aJour = formulaireDuVendredi(
				await (await get('/vendredi', cookies)).text(),
				'retablir',
				sessions[1],
				date
			);
			expect(aJour).toEqual({
				courseId: sessions[1],
				date,
				shownKind: 'moved',
				shownToDate: jourDuDeplacement(),
				shownToStart: '15:00'
			});
			// Le déplacement change encore d'heure ailleurs : la carte du déplacement est périmée à son
			// tour, et refusée de même.
			await maintenance((tx) =>
				tx.execute(sql`
					update "session_exception" set "to_start" = '16:00'
					where "course_id" = ${sessions[1]} and "date" = ${date}
				`)
			);
			const perimee = await postForm('/vendredi?/retablir', aJour, cookies);
			expect(perimee.status).toBe(409);
			expect(enTete(await perimee.text())).toEqual([REFUS_DU_VENDREDI.changed.fr]);
			expect(await exceptionDe(sessions[1], date)).toEqual({ ...deplacee, to_start: '16:00' });
			// La carte à jour, elle, rétablit la session.
			const derniere = formulaireDuVendredi(
				await (await get('/vendredi', cookies)).text(),
				'retablir',
				sessions[1],
				date
			);
			expect((await postForm('/vendredi?/retablir', derniere, cookies)).status).toBe(200);
			expect(await exceptionDe(sessions[1], date)).toBeUndefined();
		} finally {
			await poserLangueDuCompte(RESPONSABLE, 'fr');
			await effacerLesExceptionsDeLaPremiere();
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

	it('marks a session moved to another time of the same day with its new time, in each message (relecture du lot 5)', async () => {
		// Le cours de 19:00 commence à 21:00 demain, seulement ce jour-là : c'est ce que disent la
		// carte d'« À venir » et le message du déplacement, et le message de la semaine le dit aussi.
		const demain = addDays(today(), 1);
		const deplace = await postForm(
			'/?/deplacer',
			{ courseId: coursId, date: demain, toDate: demain, toStart: '21:00' },
			cookies
		);
		try {
			expect(deplace.status).toBe(200);
			const trouves = messages(await (await get('/partager', cookies)).text());
			expect(trouves.map((message) => message.langue)).toEqual([...LANGUES]);
			const NOUVELLE_HEURE: Record<Langue, string> = {
				fr: 'nouvelle heure',
				de: 'neue Uhrzeit',
				it: 'nuovo orario',
				en: 'new time',
				ar: 'وقت جديد'
			};
			for (const message of trouves) {
				const langue = message.langue as Langue;
				const v = VIRGULE[langue];
				const intitule = langue === 'de' ? COURS_DE : COURS;
				expect(message.texte.split('\n'), langue).toContain(
					`- ${intitule}${v}21:00 – 22:30${v}${SALLE} (${NOUVELLE_HEURE[langue]})`
				);
			}
		} finally {
			await postForm('/?/retablir', { courseId: coursId, date: demain }, cookies);
			expect(await exceptionDe(coursId, demain)).toBeUndefined();
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

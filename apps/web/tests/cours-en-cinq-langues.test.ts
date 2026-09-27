// Les cours et leur formulaire (étape 18, retours B4, C3, B1, D2 et A3), servis par HTTP.
//
// Le résumé en haut du formulaire reprend tout ce qui sera publié et signale ce qui manque (B4) ; il
// est juste au rendu du serveur, sans JavaScript, y compris après une erreur de validation. Un cours
// peut se placer avant une prière, avec des minutes toujours positives, et la base garde le décalage
// négatif qu'elle connaît déjà (C3). Les trois écrans parlent les cinq langues, erreurs comprises
// (D2), et n'écrivent aucune date comme la base (A3).
//
// Vrai serveur construit, vraie base, formulaires envoyés comme sans JavaScript.

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
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

const ORGANISATION = 'Association des cours du soir';
const RESPONSABLE = 'cours-responsable@example.test';
const SALLE = 'Grande salle';
const INTERVENANT = 'Imam Karim Haddad';
/** Le cours placé 10 minutes avant le Maghrib, tel que la base le connaît déjà : à −10. */
const TAFSIR = 'Tafsir du soir';
const TAFSIR_AR = 'تفسير المساء';
const DESCRIPTION = 'Lecture commentée, pour adultes.';
/** Un cours à des dates précises, en brouillon, sans salle ni intervenant. */
const ENFANTS = 'Arabe pour enfants';
const MOTIF = 'Vacances d’hiver';

/** Ce qui est pareil dans toutes les langues par nature : ce que l'organisation a saisi. */
const PERMIS = [
	ORGANISATION,
	RESPONSABLE,
	SALLE,
	INTERVENANT,
	TAFSIR,
	TAFSIR_AR,
	DESCRIPTION,
	ENFANTS,
	MOTIF
];

let ownerHandle: DatabaseHandle;
/** Le rôle applicatif, pour lire le journal, que le propriétaire ne lit pas (migration 0070). */
let appHandle: DatabaseHandle;
let organizationId: string;
let userId: string;
let tafsirId: string;
let enfantsId: string;

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

/**
 * Les entrées du journal de l'organisation pour une action, et une cible s'il y en a une. Il se lit
 * dans l'organisation, par le rôle applicatif, comme la personne responsable le lirait.
 */
async function auJournal(action: string, cible?: string): Promise<number> {
	const trouvees = await withOrg(appHandle.db, { organizationId, userId }, async (tx) =>
		lignes<{ n: number }>(
			await tx.execute(sql`
				select count(*)::int as n from "audit_log"
				where "action" = ${action} and (${cible ?? null}::uuid is null or "target_id" = ${cible ?? null}::uuid)
			`)
		)
	);
	return trouvees[0]?.n ?? 0;
}

async function get(chemin: string, cookie: string): Promise<Response> {
	return fetch(`${origin}${chemin}`, { redirect: 'manual', headers: { cookie } });
}

/**
 * Poste un formulaire comme un navigateur sans JavaScript. Des paires, et non un objet : les jours
 * et les langues cochés portent le même nom plusieurs fois.
 */
async function postForm(
	chemin: string,
	champs: readonly (readonly [string, string])[],
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
		body: new URLSearchParams(champs.map(([nom, valeur]) => [nom, valeur])).toString()
	});
}

async function signIn(email: string): Promise<string> {
	await maintenance((tx) => tx.execute(sql`delete from "rate_limit"`));
	await postForm('/connexion', [['email', email]]);
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

async function poserLangueDuCompte(langue: Langue): Promise<void> {
	await maintenance((tx) =>
		tx.execute(sql`update "user" set "language" = ${langue} where "id" = ${userId}`)
	);
}

function titre(html: string): string {
	return (html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim();
}

/** Le texte lu d'un fragment de page. */
function lu(fragment: string): string {
	return visibleText(`<body>${fragment}</body>`);
}

/** Le résumé en haut du formulaire, et lui seul. */
function resume(html: string): string {
	return html.match(/<section\b[^>]*\bid="course-summary"[^>]*>[\s\S]*?<\/section>/)?.[0] ?? '';
}

/** Les lignes du résumé, chacune lue comme une personne la lit. */
function lignesDuResume(html: string): string[] {
	return [...resume(html).matchAll(/<div\b[^>]*>\s*<dt\b[\s\S]*?<\/dd>\s*<\/div>/g)].map((trouve) =>
		lu(trouve[0])
	);
}

/** Les lignes du résumé marquées comme manquantes. */
function manques(html: string): string[] {
	return [
		...resume(html).matchAll(/<div\b[^>]*class="[^"]*\bmanque\b[^"]*"[^>]*>[\s\S]*?<\/div>/g)
	].map((trouve) => lu(trouve[0]));
}

/** Les lignes du résumé d'un champ facultatif laissé vide, marquées en discret (étape 19, lot 2). */
function facultatives(html: string): string[] {
	return [
		...resume(html).matchAll(/<div\b[^>]*class="[^"]*\bfacultatif\b[^"]*"[^>]*>[\s\S]*?<\/div>/g)
	].map((trouve) => lu(trouve[0]));
}

/** Les phrases de l'encadré des erreurs, une par ligne de la liste. */
function erreurs(html: string): string[] {
	const alerte = html.match(/<div\b[^>]*role="alert"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? '';
	return [...alerte.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((t) => lu(t[1] ?? ''));
}

/** Les options d'une liste, avec celle qui est choisie. */
function options(html: string, id: string): { valeur: string; texte: string; choisie: boolean }[] {
	const liste = html.match(new RegExp(`<select\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</select>`));
	return [...(liste?.[1] ?? '').matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map(
		(trouve) => ({
			valeur: trouve[1]?.match(/\bvalue="([^"]*)"/)?.[1] ?? '',
			texte: lu(trouve[2] ?? ''),
			choisie: /\bselected\b/.test(trouve[1] ?? '')
		})
	);
}

/** Les attributs d'un champ, par son identifiant. */
function champ(html: string, id: string): Record<string, string> {
	const balise = html.match(new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`))?.[0] ?? '';
	return Object.fromEntries(
		[...balise.matchAll(/\s([a-z][\w.-]*)(?:="([^"]*)")?/g)].map((trouve) => [
			trouve[1] ?? '',
			trouve[2] ?? ''
		])
	);
}

function libelle(html: string, pour: string): string {
	return lu(
		html.match(new RegExp(`<label\\b[^>]*\\bfor="${pour}"[^>]*>([\\s\\S]*?)</label>`))?.[1] ?? ''
	);
}

/** Les entités que Svelte écrit dans une valeur d'attribut ou un texte. */
function decode(texte: string): string {
	return texte
		.replaceAll('&quot;', '"')
		.replaceAll('&#39;', "'")
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&amp;', '&');
}

/**
 * Ce que le formulaire du cours enverrait tel qu'il est rendu, sans JavaScript : chaque champ avec
 * sa valeur, les cases cochées seules, l'option choisie de chaque liste. Les champs des onglets de
 * langue masqués en font partie : un navigateur les envoie aussi.
 */
function champsDuFormulaire(html: string): [string, string][] {
	const formulaire =
		[...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)]
			.map((trouve) => trouve[0])
			.find((bloc) => bloc.includes('name="startsOn"')) ?? '';
	const champs: [string, string][] = [];
	for (const trouve of formulaire.matchAll(
		/<input\b([^>]*)>|<select\b([^>]*)>([\s\S]*?)<\/select>|<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g
	)) {
		const attributs = trouve[1] ?? trouve[2] ?? trouve[4] ?? '';
		const nom = attributs.match(/\bname="([^"]*)"/)?.[1];
		if (!nom) continue;
		if (trouve[1] !== undefined) {
			const type = attributs.match(/\btype="([^"]*)"/)?.[1] ?? 'text';
			if (type === 'submit' || type === 'button') continue;
			if ((type === 'checkbox' || type === 'radio') && !/\bchecked\b/.test(attributs)) continue;
			champs.push([nom, decode(attributs.match(/\bvalue="([^"]*)"/)?.[1] ?? '')]);
		} else if (trouve[2] !== undefined) {
			const choix = [...(trouve[3] ?? '').matchAll(/<option\b([^>]*)>/g)].map((o) => o[1] ?? '');
			const choisie = choix.find((o) => /\bselected\b/.test(o)) ?? choix[0] ?? '';
			champs.push([nom, decode(choisie.match(/\bvalue="([^"]*)"/)?.[1] ?? '')]);
		} else {
			champs.push([nom, decode(trouve[5] ?? '')]);
		}
	}
	return champs;
}

async function decalageEnBase(titreDuCours: string): Promise<{ kind: string; offset: number }[]> {
	return maintenance(async (tx) =>
		lignes<{ kind: string; offset: number }>(
			await tx.execute(sql`
				select c."timing_kind" as kind, c."timing_offset_minutes" as offset from "course" c
				join "course_translation" t on t."course_id" = c."id"
				where t."title" = ${titreDuCours} and c."organization_id" = ${organizationId}
			`)
		)
	);
}

/** Un cours ancré sur une prière, complet sauf l'horaire, prêt à poster. */
function coursAncre(
	titreDuCours: string,
	choix: string,
	minutes: string
): (readonly [string, string])[] {
	return [
		['sourceLanguage', 'fr'],
		['title.fr', titreDuCours],
		['audience', 'adults'],
		['teachingLanguages', 'fr'],
		['recurrenceKind', 'weekly'],
		['weekdays', '4'],
		['interval', '1'],
		['timingKind', choix],
		['prayer', 'maghrib'],
		['offsetMinutes', minutes],
		['durationMinutes', '60'],
		['startsOn', '2026-10-01'],
		['status', 'draft']
	];
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	appHandle = createDatabase({ role: 'app', overrides: { database: testDatabase } });
	organizationId = newId();
	userId = newId();
	tafsirId = newId();
	enfantsId = newId();
	const salleId = newId();
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language", "prayer_module")
			values (${organizationId}, 'cours-du-soir', ${ORGANISATION}, 'Europe/Zurich', 'fr',
				array['fr','de','ar'], true)
		`);
		await tx.execute(sql`
			insert into "user" ("id", "email", "email_verified") values (${userId}, ${RESPONSABLE}, true)
		`);
		await tx.execute(sql`
			insert into "membership" ("id", "organization_id", "user_id", "role")
			values (${newId()}, ${organizationId}, ${userId}, 'org_admin')
		`);
		await tx.execute(conditionsAcceptees(organizationId, userId));
		await tx.execute(sql`
			insert into "room" ("id", "organization_id", "name", "display_order")
			values (${salleId}, ${organizationId}, ${SALLE}, 1)
		`);
		// Un lundi et un mercredi sur deux, 10 minutes avant le Maghrib : −10 en base, comme un cours
		// d'avant l'étape 18 que rien n'a migré.
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"room_id", "teacher", "source_language", "recurrence_kind", "recurrence_weekday",
				"recurrence_interval", "recurrence_anchor_date", "timing_kind", "timing_prayer",
				"timing_offset_minutes", "timing_duration_minutes", "starts_on", "ends_on")
			values (${tafsirId}, ${organizationId}, 'published', 'adults', array['fr','ar'], ${salleId},
				${INTERVENANT}, 'fr', 'weekly', array[1,3]::smallint[], 2, '2026-09-07', 'prayer',
				'maghrib', -10, 60, '2026-09-07', '2026-12-20')
		`);
		await tx.execute(sql`
			insert into "course_translation" ("id", "organization_id", "course_id", "language", "title",
				"description")
			values (${newId()}, ${organizationId}, ${tafsirId}, 'fr', ${TAFSIR}, ${DESCRIPTION}),
				(${newId()}, ${organizationId}, ${tafsirId}, 'ar', ${TAFSIR_AR}, null)
		`);
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"source_language", "recurrence_kind", "recurrence_date", "timing_kind", "timing_start",
				"timing_end", "starts_on")
			values (${enfantsId}, ${organizationId}, 'draft', 'kids', array['ar'], 'fr', 'dates',
				array['2026-10-12','2026-10-26']::date[], 'fixed', '10:00', '11:30', '2026-10-12')
		`);
		await tx.execute(sql`
			insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
			values (${newId()}, ${organizationId}, ${enfantsId}, 'fr', ${ENFANTS})
		`);
		await tx.execute(sql`
			insert into "pause" ("id", "organization_id", "from_date", "to_date", "reason")
			values (${newId()}, ${organizationId}, '2026-12-21', '2027-01-03', ${MOTIF})
		`);
	});
});

afterAll(async () => {
	await ownerHandle?.close();
	await appHandle?.close();
});

/** Une demande d'écran : une page lue, ou un formulaire refusé qui revient avec son erreur. */
interface Ecran {
	nom: string;
	statut: number;
	demande: (cookie: string) => Promise<Response>;
}

const ECRANS: Ecran[] = [
	{ nom: 'la liste', statut: 200, demande: (cookie) => get('/cours', cookie) },
	{ nom: 'le nouveau cours', statut: 200, demande: (cookie) => get('/cours/nouveau', cookie) },
	{ nom: 'la fiche d’un cours ancré', statut: 200, demande: (c) => get(`/cours/${tafsirId}`, c) },
	{
		nom: 'la fiche d’un cours à dates',
		statut: 200,
		demande: (c) => get(`/cours/${enfantsId}`, c)
	},
	{
		nom: 'un nouveau cours refusé',
		statut: 400,
		demande: (cookie) =>
			postForm(
				'/cours/nouveau',
				[
					['sourceLanguage', 'fr'],
					['title.fr', ''],
					['recurrenceKind', 'dates'],
					// Aucune date lisible : le premier jour vide ne prend pas de première date (étape
					// 19, lot 2), et sa phrase reste dans la liste.
					['dates', '31.02.2026'],
					['timingKind', 'beforePrayer'],
					['prayer', 'isha'],
					['offsetMinutes', '0'],
					['durationMinutes', '3'],
					['startsOn', ''],
					['status', 'draft']
				],
				cookie
			)
	},
	{
		nom: 'une pause refusée',
		statut: 400,
		demande: (cookie) =>
			postForm(
				'/cours?/pause',
				[
					['from', '2026-12-10'],
					['to', '2026-12-01']
				],
				cookie
			)
	}
];

describe('les écrans des cours, dans les cinq langues (D2, A3)', () => {
	let cookie = '';
	const rendus: Record<string, Record<Langue, string>> = {};

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		for (const langue of LANGUES) {
			await poserLangueDuCompte(langue);
			for (const { nom, statut, demande } of ECRANS) {
				const reponse = await demande(cookie);
				expect(reponse.status, `${nom} en ${langue}`).toBe(statut);
				(rendus[nom] ??= {} as Record<Langue, string>)[langue] = await reponse.text();
			}
		}
		await poserLangueDuCompte('fr');
	});

	const CAS = ECRANS.flatMap(({ nom }) => LANGUES.map((langue) => ({ nom, langue })));

	it.each(CAS)('serves $nom with <html lang="$langue">', ({ nom, langue }) => {
		expect(rendus[nom]?.[langue]?.match(/<html\b[^>]*>/g)).toEqual([
			`<html lang="${langue}" dir="${SENS[langue]}">`
		]);
	});

	it.each(CAS.filter(({ langue }) => langue !== 'fr'))(
		'leaves no French sentence on $nom in $langue',
		({ nom, langue }) => {
			const francais = rendus[nom]?.fr ?? '';
			const autre = rendus[nom]?.[langue] ?? '';
			expect(textSegments(francais).size, nom).toBeGreaterThan(8);
			expect(frenchLeft(francais, autre, PERMIS)).toEqual([]);
			expect(titre(autre)).not.toBe(titre(francais));
		}
	);

	it.each(CAS)('writes no date as AAAA-MM-JJ on $nom in $langue', ({ nom, langue }) => {
		const texte = visibleText(rendus[nom]?.[langue] ?? '');
		expect(texte.match(ISO_DATE)?.[0] ?? null).toBeNull();
	});

	it('writes the dates of a course at specific dates as JJ.MM.AAAA, in the field and the summary', () => {
		const html = rendus['la fiche d’un cours à dates']?.fr ?? '';
		expect(html).toMatch(
			/<textarea\b[^>]*\bid="dates"[^>]*>12\.10\.2026\n26\.10\.2026<\/textarea>/
		);
		expect(lignesDuResume(html)).toContain('Dates : lundi 12.10.2026 et lundi 26.10.2026');
	});

	it('writes the period of a pause JJ.MM.AAAA, with the name of the day', () => {
		expect(visibleText(rendus['la liste']?.fr ?? '')).toContain(
			`Du lundi 21.12.2026 au dimanche 03.01.2027 · ${MOTIF}`
		);
		expect(visibleText(rendus['la liste']?.de ?? '')).toContain(
			`Vom Montag, 21.12.2026 bis Sonntag, 03.01.2027 · ${MOTIF}`
		);
	});

	it('says what to correct in the language of the account, field by field, in the order of the form', () => {
		const attendu: Record<Langue, string[]> = {
			fr: [
				'Écrivez le titre du cours dans la langue de saisie.',
				'Cochez au moins une langue d’enseignement.',
				'Cette date n’est pas valable : 31.02.2026. Écrivez chaque date comme ceci : 12.10.2026',
				'Avant une prière : de 1 à 120 minutes, en chiffres. Exemple : 10',
				'La durée va de 5 à 1440 minutes, en chiffres. Exemple : 90 pour 1 h 30',
				'Choisissez le premier jour du cours.'
			],
			de: [
				'Schreiben Sie den Titel des Kurses in der Eingabesprache.',
				'Kreuzen Sie mindestens eine Unterrichtssprache an.',
				'Dieses Datum ist nicht gültig: 31.02.2026. Schreiben Sie jedes Datum so: 12.10.2026',
				'Vor einem Gebet: 1 bis 120 Minuten, in Ziffern. Beispiel: 10',
				'Die Dauer beträgt 5 bis 1440 Minuten, in Ziffern. Beispiel: 90 für 1 Stunde 30 Minuten',
				'Wählen Sie den ersten Kurstag.'
			],
			it: [
				'Scrivi il titolo del corso nella lingua di inserimento.',
				'Scegli almeno una lingua di insegnamento.',
				'Questa data non è valida: 31.02.2026. Scrivi ogni data così: 12.10.2026',
				'Prima di una preghiera: da 1 a 120 minuti, in cifre. Esempio: 10',
				'La durata va da 5 a 1440 minuti, in cifre. Esempio: 90 per 1 ora e 30 minuti',
				'Scegli il primo giorno del corso.'
			],
			en: [
				'Write the title of the course in the input language.',
				'Tick at least one teaching language.',
				'This date is not valid: 31.02.2026. Write each date like this: 12.10.2026',
				'Before a prayer: from 1 to 120 minutes, in figures. Example: 10',
				'The duration is from 5 to 1440 minutes, in figures. Example: 90 for 1 hour 30 minutes',
				'Choose the first day of the course.'
			],
			ar: [
				'اكتب عنوان الدرس بلغة الإدخال.',
				'اختر لغة تدريس أو أكثر.',
				'هذا التاريخ غير صالح: 31.02.2026. اكتب كل تاريخ هكذا: 12.10.2026',
				'قبل صلاة: من 1 إلى 120 دقيقة، بالأرقام. مثال: 10',
				'المدة من 5 إلى 1440 دقيقة، بالأرقام. مثال: 90 لساعة ونصف',
				'اختر اليوم الأول للدرس.'
			]
		};
		for (const langue of LANGUES) {
			const html = rendus['un nouveau cours refusé']?.[langue] ?? '';
			const alerte = html.match(/<div\b[^>]*role="alert"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? '';
			const lus = [...alerte.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((t) => lu(t[1] ?? ''));
			expect(lus, langue).toEqual(attendu[langue]);
		}
	});

	it('says what is wrong with a pause in the language of the account', () => {
		const attendu: Record<Langue, string> = {
			fr: 'Le dernier jour de la pause vient avant le premier.',
			de: 'Der letzte Tag der Pause liegt vor dem ersten.',
			it: 'L’ultimo giorno della pausa viene prima del primo.',
			en: 'The last day of the break comes before the first.',
			ar: 'اليوم الأخير من العطلة يأتي قبل اليوم الأول.'
		};
		for (const langue of LANGUES) {
			const html = rendus['une pause refusée']?.[langue] ?? '';
			const alerte = html.match(/<p\b[^>]*role="alert"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
			expect(lu(alerte), langue).toBe(attendu[langue]);
		}
	});
});

describe('le résumé en haut du formulaire (B4)', () => {
	let cookie = '';

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte('fr');
	});

	it('takes up everything that will be published, at the server render', async () => {
		const html = await (await get(`/cours/${tafsirId}`, cookie)).text();
		expect(lu(resume(html).match(/<h2\b[\s\S]*?<\/h2>/)?.[0] ?? '')).toBe(
			'Résumé : ce qui sera publié'
		);
		// La description est publiée sur la fiche publique du cours : le résumé la reprend (B4).
		// L'organisation publie aussi l'allemand : le titre qui y manque a sa ligne. Ce qui est
		// facultatif le dit, rempli ou non (étape 19, lot 2).
		expect(lignesDuResume(html)).toEqual([
			`Titre en français : ${TAFSIR}`,
			`Description en français : ${DESCRIPTION} (facultatif)`,
			'Titre en allemand : pas encore écrit, le titre en français s’affichera à sa place (facultatif)',
			`Titre en arabe : ${TAFSIR_AR} (facultatif)`,
			'Public : adultes',
			'Jours : lundi et mercredi',
			'Fréquence : une semaine sur deux',
			'Horaire : 10 min avant Maghrib, pendant 1 h',
			`Salle : ${SALLE} (facultatif)`,
			`Intervenant : ${INTERVENANT} (facultatif)`,
			'Langue d’enseignement : français et arabe',
			'Premier jour : lundi 07.09.2026',
			'Dernier jour : dimanche 20.12.2026 (facultatif)',
			'État : publié, visible sur la page publique'
		]);
		expect(manques(html)).toEqual([]);
	});

	it('signals what is missing on a new course, and marks what is optional as such', async () => {
		const html = await (await get('/cours/nouveau', cookie)).text();
		expect(lignesDuResume(html)).toEqual([
			'Titre en français : pas encore écrit',
			'Titre en allemand : pas encore écrit, le titre en français s’affichera à sa place (facultatif)',
			'Titre en arabe : pas encore écrit, le titre en français s’affichera à sa place (facultatif)',
			'Public : ouvert à tous',
			'Jours : lundi',
			'Fréquence : chaque semaine',
			'Horaire : de 19:00 à 20:30',
			'Salle : pas choisie (facultatif)',
			'Intervenant : aucun pour l’instant (facultatif)',
			'Langue d’enseignement : français',
			'Premier jour : pas choisi',
			'État : brouillon, pas encore sur la page publique'
		]);
		// Ce qui est facultatif et laissé vide n'est pas un manque : la salle et l'intervenant ne sont
		// plus marqués comme le titre ou le premier jour (étape 19, lot 2).
		expect(manques(html)).toEqual([
			'Titre en français : pas encore écrit',
			'Premier jour : pas choisi'
		]);
	});

	it('marks what is optional as « facultatif », quietly, in each language', async () => {
		const attendu: Record<Langue, string[]> = {
			fr: [
				'Titre en allemand : pas encore écrit, le titre en français s’affichera à sa place (facultatif)',
				'Titre en arabe : pas encore écrit, le titre en français s’affichera à sa place (facultatif)',
				'Salle : pas choisie (facultatif)',
				'Intervenant : aucun pour l’instant (facultatif)'
			],
			de: [
				'Titel auf Deutsch: noch nicht geschrieben, an seiner Stelle erscheint der Titel auf Französisch (freiwillig)',
				'Titel auf Arabisch: noch nicht geschrieben, an seiner Stelle erscheint der Titel auf Französisch (freiwillig)',
				'Raum: kein Raum gewählt (freiwillig)',
				'Lehrperson: nicht angegeben (freiwillig)'
			],
			it: [
				'Titolo in tedesco: non ancora scritto, al suo posto comparirà il titolo in francese (facoltativo)',
				'Titolo in arabo: non ancora scritto, al suo posto comparirà il titolo in francese (facoltativo)',
				'Sala: non scelta (facoltativo)',
				'Insegnante: non indicato (facoltativo)'
			],
			en: [
				'Title in German: not written yet, the title in French will be shown instead (optional)',
				'Title in Arabic: not written yet, the title in French will be shown instead (optional)',
				'Room: none chosen (optional)',
				'Teacher: not given (optional)'
			],
			ar: [
				'العنوان بالألمانية: لم يُكتب بعد، وسيظهر مكانه العنوان بالفرنسية (اختياري)',
				'العنوان بالعربية: لم يُكتب بعد، وسيظهر مكانه العنوان بالفرنسية (اختياري)',
				'القاعة: لم تُختر (اختياري)',
				'المدرّس: لم يُذكر (اختياري)'
			]
		};
		for (const langue of LANGUES) {
			await poserLangueDuCompte(langue);
			const html = await (await get('/cours/nouveau', cookie)).text();
			expect(facultatives(html), langue).toEqual(attendu[langue]);
			// La marque est discrète : dans la ligne, jamais dans ce que le résumé dit manquer.
			for (const ligne of facultatives(html)) expect(manques(html), langue).not.toContain(ligne);
		}
		await poserLangueDuCompte('fr');
	});

	it('shows the title and description of every language without JavaScript', async () => {
		// Sans JavaScript, les onglets ne feraient rien : ils n'existent qu'une fois la page hydratée,
		// et le rendu du serveur montre les champs de chaque langue, l'un sous l'autre.
		for (const chemin of ['/cours/nouveau', `/cours/${tafsirId}`]) {
			const html = await (await get(chemin, cookie)).text();
			// Le bloc de chaque langue, et s'il est masqué (la classe de portée de Svelte mise à part).
			const masques = [...html.matchAll(/<div\b[^>]*\bclass="(onglet\b[^"]*)"[^>]*>/g)].map(
				(trouve) => (trouve[1] ?? '').split(/\s+/).includes('masque')
			);
			expect(masques, chemin).toEqual([false, false, false]);
			expect(html, chemin).not.toMatch(/role="tablist"/);
			for (const code of ['fr', 'de', 'ar']) {
				expect(libelle(html, `title-${code}`), `${chemin}, ${code}`).toMatch(/^Titre en /);
				expect(champ(html, `title-${code}`)['name'], `${chemin}, ${code}`).toBe(`title.${code}`);
			}
		}
	});

	it('says the real rule of a monthly course: the nth weekday of the month, with an example', async () => {
		// Le premier lundi d'octobre 2026 est le 05.10.2026, dans la deuxième semaine du mois : la règle
		// n'est pas « quelle semaine », mais « quel jour, et lequel dans le mois ».
		const attendu: Record<Langue, { jour: string; rang: string; rangs: string[]; aide: string }> = {
			fr: {
				jour: 'Quel jour de la semaine ?',
				rang: 'Lequel dans le mois ?',
				rangs: ['le premier', 'le deuxième', 'le troisième', 'le quatrième', 'le dernier'],
				aide: 'Exemple : lundi, puis « le premier » : le cours a lieu le premier lundi de chaque mois.'
			},
			de: {
				jour: 'Welcher Wochentag?',
				rang: 'Welcher davon im Monat?',
				rangs: ['der erste', 'der zweite', 'der dritte', 'der vierte', 'der letzte'],
				aide: 'Beispiel: Montag, dann «der erste»: Der Kurs findet am ersten Montag jedes Monats statt.'
			},
			it: {
				jour: 'Quale giorno della settimana?',
				rang: 'Quale volta nel mese?',
				rangs: ['la prima', 'la seconda', 'la terza', 'la quarta', 'l’ultima'],
				aide: 'Esempio: lunedì, poi «la prima»: il corso si tiene il primo lunedì di ogni mese.'
			},
			en: {
				jour: 'Which day of the week?',
				rang: 'Which one in the month?',
				rangs: ['the first', 'the second', 'the third', 'the fourth', 'the last'],
				aide: 'Example: Monday, then ‘the first’: the course takes place on the first Monday of every month.'
			},
			ar: {
				jour: 'أي يوم من أيام الأسبوع؟',
				rang: 'ترتيبه في الشهر؟',
				rangs: ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الأخير'],
				aide: 'مثال: الاثنين ثم «الأول»: يُقام الدرس في أول اثنين من كل شهر.'
			}
		};
		for (const langue of LANGUES) {
			await poserLangueDuCompte(langue);
			// Un envoi refusé (sans titre) rend le formulaire tel qu'il a été envoyé : une fois par mois.
			const reponse = await postForm(
				'/cours/nouveau',
				[
					['sourceLanguage', 'fr'],
					['title.fr', ''],
					['teachingLanguages', 'fr'],
					['recurrenceKind', 'monthly'],
					['monthlyOrdinal', '1'],
					['monthlyWeekday', '1'],
					['timingKind', 'fixed'],
					['start', '19:00'],
					['end', '20:30'],
					['startsOn', '2026-10-01'],
					['status', 'draft']
				],
				cookie
			);
			expect(reponse.status, langue).toBe(400);
			const html = await reponse.text();
			const { jour, rang, rangs, aide } = attendu[langue];
			expect(libelle(html, 'monthlyWeekday'), langue).toBe(jour);
			expect(libelle(html, 'monthlyOrdinal'), langue).toBe(rang);
			expect(
				options(html, 'monthlyOrdinal').map((option) => option.texte),
				langue
			).toEqual(rangs);
			expect(
				lu(html.match(/<p\b[^>]*\bid="monthly-hint"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''),
				langue
			).toBe(aide);
			// Le jour d'abord, puis son rang : « lundi », puis « le premier ».
			expect(html.indexOf('id="monthlyWeekday"'), langue).toBeLessThan(
				html.indexOf('id="monthlyOrdinal"')
			);
		}
		await poserLangueDuCompte('fr');
	});

	it('stays right after a validation error, and the form keeps what was typed', async () => {
		const reponse = await postForm(
			'/cours/nouveau',
			[
				['sourceLanguage', 'fr'],
				['title.fr', 'Cours du mardi'],
				['audience', 'women'],
				['recurrenceKind', 'weekly'],
				['interval', '1'],
				['timingKind', 'beforePrayer'],
				['prayer', 'isha'],
				['offsetMinutes', '10'],
				['durationMinutes', '90'],
				['teacher', 'Fatima Keller'],
				['startsOn', '2026-10-06'],
				['status', 'draft']
			],
			cookie
		);
		expect(reponse.status).toBe(400);
		const html = await reponse.text();
		expect(lignesDuResume(html)).toEqual([
			'Titre en français : Cours du mardi',
			'Titre en allemand : pas encore écrit, le titre en français s’affichera à sa place (facultatif)',
			'Titre en arabe : pas encore écrit, le titre en français s’affichera à sa place (facultatif)',
			'Public : femmes',
			'Jours : pas choisis',
			'Fréquence : chaque semaine',
			'Horaire : 10 min avant Isha, pendant 1 h 30',
			'Salle : pas choisie (facultatif)',
			'Intervenant : Fatima Keller (facultatif)',
			'Langue d’enseignement : pas choisie',
			'Premier jour : mardi 06.10.2026',
			'État : brouillon, pas encore sur la page publique'
		]);
		expect(manques(html)).toEqual(['Jours : pas choisis', 'Langue d’enseignement : pas choisie']);
		expect(champ(html, 'title-fr')['value']).toBe('Cours du mardi');
		expect(champ(html, 'offsetMinutes')['value']).toBe('10');
		expect(options(html, 'timingKind').find((option) => option.choisie)?.valeur).toBe(
			'beforePrayer'
		);
		expect(options(html, 'prayer').find((option) => option.choisie)?.valeur).toBe('isha');
		expect(await decalageEnBase('Cours du mardi')).toEqual([]);
	});

	it('refuses a course without a teaching language rather than choosing one in silence', async () => {
		// Le résumé dit « pas choisie » : enregistrer le cours avec une langue que personne n'a cochée
		// publierait autre chose que ce qu'il annonce.
		const titreDuCours = 'Sans langue d’enseignement';
		const reponse = await postForm(
			'/cours/nouveau',
			coursAncre(titreDuCours, 'prayer', '15').filter(([nom]) => nom !== 'teachingLanguages'),
			cookie
		);
		expect(reponse.status).toBe(400);
		const html = await reponse.text();
		const alerte = html.match(/<div\b[^>]*role="alert"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? '';
		expect([...alerte.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((t) => lu(t[1] ?? ''))).toEqual(
			['Cochez au moins une langue d’enseignement.']
		);
		expect(manques(html)).toContain('Langue d’enseignement : pas choisie');
		expect(await decalageEnBase(titreDuCours)).toEqual([]);
	});

	it('marks as to correct, after a refusal, the values the server refused', async () => {
		// 130 minutes avant une prière, et un dernier jour avant le premier : le serveur refuse les
		// deux, et le résumé ne les montre plus comme publiables.
		const attendu: Record<Langue, string[]> = {
			fr: [
				'Horaire : à corriger, de 1 à 120 minutes avant la prière',
				'Dernier jour : à corriger, il tombe avant le premier jour (facultatif)'
			],
			de: [
				'Zeit: zu korrigieren, 1 bis 120 Minuten vor dem Gebet',
				'Letzter Tag: zu korrigieren, er liegt vor dem ersten Tag (freiwillig)'
			],
			it: [
				'Orario: da correggere, da 1 a 120 minuti prima della preghiera',
				'Ultimo giorno: da correggere, viene prima del primo giorno (facoltativo)'
			],
			en: [
				'Time: to correct, from 1 to 120 minutes before the prayer',
				'Last day: to correct, it comes before the first day (optional)'
			],
			ar: [
				'الوقت: يجب تصحيحه، من 1 إلى 120 دقيقة قبل الصلاة',
				'اليوم الأخير: يجب تصحيحه، فهو يأتي قبل اليوم الأول (اختياري)'
			]
		};
		const champs = champsDuFormulaire(await (await get(`/cours/${tafsirId}`, cookie)).text()).map(
			([nom, valeur]): [string, string] =>
				nom === 'offsetMinutes'
					? [nom, '130']
					: nom === 'endsOn'
						? [nom, '2026-09-01']
						: [nom, valeur]
		);
		for (const langue of LANGUES) {
			await poserLangueDuCompte(langue);
			const reponse = await postForm(`/cours/${tafsirId}`, champs, cookie);
			expect(reponse.status, langue).toBe(400);
			expect(manques(await reponse.text()), langue).toEqual(attendu[langue]);
		}
		await poserLangueDuCompte('fr');
		expect(await decalageEnBase(TAFSIR)).toEqual([{ kind: 'prayer', offset: -10 }]);
	});

	it('gives each text field, and its line in the summary, the language and direction of its language', async () => {
		// Dans l'espace en arabe, un titre français se lit de gauche à droite, avec son point à droite ;
		// dans l'espace en français, un titre arabe se lit de droite à gauche.
		const sens = { fr: 'ltr', de: 'ltr', ar: 'rtl' } as const;
		for (const langue of ['fr', 'ar'] as const) {
			await poserLangueDuCompte(langue);
			const html = await (await get(`/cours/${tafsirId}`, cookie)).text();
			for (const [code, dir] of Object.entries(sens)) {
				expect(champ(html, `title-${code}`), `${langue}, titre ${code}`).toMatchObject({
					lang: code,
					dir
				});
				const zone = html.match(new RegExp(`<textarea\\b[^>]*\\bid="description-${code}"[^>]*>`));
				expect(zone?.[0], `${langue}, description ${code}`).toMatch(
					new RegExp(`\\blang="${code}"[^>]*\\bdir="${dir}"`)
				);
			}
			const ligne = resume(html).match(/<bdi\b[^>]*>Lecture commentée, pour adultes\.<\/bdi>/);
			expect(ligne?.[0], `${langue}, résumé`).toMatch(/\blang="fr"[^>]*\bdir="ltr"/);
		}
		await poserLangueDuCompte('fr');
	});

	it('says the time in each language', async () => {
		const horaires: Record<Langue, string> = {
			fr: '10 min avant Maghrib, pendant 1 h',
			de: '10 Min. vor Maghrib, 1 Stunde lang',
			it: '10 min prima di Maghrib, per 1 ora',
			en: '10 min before Maghrib, for 1 hour',
			ar: 'قبل المغرب بـ10 دقائق، لمدة ساعة'
		};
		for (const langue of LANGUES) {
			await poserLangueDuCompte(langue);
			const html = await (await get(`/cours/${tafsirId}`, cookie)).text();
			expect(lu(resume(html)), langue).toContain(horaires[langue]);
		}
		await poserLangueDuCompte('fr');
	});
});

describe('les dates hors de la période du cours (B4)', () => {
	let cookie = '';

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
	});

	/** Un cours à dates précises, publié, dont on choisit les dates et la période. */
	function coursADates(
		titreDuCours: string,
		dates: string,
		periode: readonly (readonly [string, string])[]
	): (readonly [string, string])[] {
		return [
			['sourceLanguage', 'fr'],
			['title.fr', titreDuCours],
			['audience', 'kids'],
			['teachingLanguages', 'ar'],
			['recurrenceKind', 'dates'],
			['dates', dates],
			['timingKind', 'fixed'],
			['start', '10:00'],
			['end', '11:30'],
			...periode,
			['status', 'published']
		];
	}

	it('refuses dates before the first day, names them and says what to do, in each language', async () => {
		// Le moteur ne publierait aucune de ces séances : le cours ne s'enregistre pas en silence.
		const attendu: Record<Langue, string> = {
			fr: 'Ces dates tombent avant le premier jour du cours et ne seraient pas publiées : 12.10.2026 et 26.10.2026. Choisissez comme premier jour le 12.10.2026 ou un jour plus tôt. Vous pouvez aussi retirer ces dates.',
			de: 'Diese Daten liegen vor dem ersten Kurstag und werden deshalb nicht veröffentlicht: 12.10.2026 und 26.10.2026. Wählen Sie als ersten Kurstag den 12.10.2026 oder einen früheren Tag. Sie können die Daten auch entfernen.',
			it: 'Queste date cadono prima del primo giorno del corso e non sarebbero pubblicate: 12.10.2026 e 26.10.2026. Scegli come primo giorno il 12.10.2026 o un giorno precedente. Puoi anche togliere queste date.',
			en: 'These dates fall before the first day of the course and would not be published: 12.10.2026 and 26.10.2026. Choose 12.10.2026 or an earlier day as the first day. You can also remove these dates.',
			ar: 'هذان التاريخان يقعان قبل اليوم الأول للدرس، ولن يُنشرا: 12.10.2026 و26.10.2026. اجعل اليوم الأول للدرس 12.10.2026 أو يومًا قبله، أو احذف هذين التاريخين.'
		};
		const titreDuCours = 'Dates avant le premier jour';
		for (const langue of LANGUES) {
			await poserLangueDuCompte(langue);
			const reponse = await postForm(
				'/cours/nouveau',
				coursADates(titreDuCours, '26.10.2026\n12.10.2026', [['startsOn', '2026-11-01']]),
				cookie
			);
			expect(reponse.status, langue).toBe(400);
			expect(erreurs(await reponse.text()), langue).toEqual([attendu[langue]]);
		}
		await poserLangueDuCompte('fr');
		expect(await decalageEnBase(titreDuCours)).toEqual([]);
	});

	it('shows them in the summary as not published, after the refusal', async () => {
		const reponse = await postForm(
			'/cours/nouveau',
			coursADates('Dates hors période', '26.10.2026\n12.10.2026', [['startsOn', '2026-11-01']]),
			cookie
		);
		expect(reponse.status).toBe(400);
		const html = await reponse.text();
		// Seules les lignes des dates sont lues ici.
		expect(manques(html).filter((ligne) => ligne.startsWith('Dates'))).toEqual([
			'Dates : aucune ne sera publiée',
			'Dates avant le premier jour, pas publiées : lundi 12.10.2026 et lundi 26.10.2026'
		]);
	});

	it('refuses dates after the last day, and keeps the first and the last day', async () => {
		const apres = await postForm(
			'/cours/nouveau',
			coursADates('Dates après le dernier jour', '12.10.2026\n30.12.2026', [
				['startsOn', '2026-10-12'],
				['endsOn', '2026-12-20']
			]),
			cookie
		);
		expect(apres.status).toBe(400);
		expect(erreurs(await apres.text())).toEqual([
			'Cette date tombe après le dernier jour du cours et ne serait pas publiée : 30.12.2026. Choisissez comme dernier jour le 30.12.2026 ou un jour plus tard. Vous pouvez aussi laisser le dernier jour vide ou retirer cette date.'
		]);
		expect(await decalageEnBase('Dates après le dernier jour')).toEqual([]);

		const bornes = await postForm(
			'/cours/nouveau',
			coursADates('Dates aux deux bornes', '12.10.2026\n20.12.2026', [
				['startsOn', '2026-10-12'],
				['endsOn', '2026-12-20']
			]),
			cookie
		);
		expect(bornes.status).toBe(303);
		expect(await decalageEnBase('Dates aux deux bornes')).toEqual([
			{ kind: 'fixed', offset: null }
		]);
	});

	it('proposes the latest of several dates after the last day as the last day', async () => {
		// Le dernier jour qui les garderait toutes est celui de la plus tardive, pas de la première
		// écrite ni de la première après le dernier jour.
		const titreDuCours = 'Deux dates après le dernier jour';
		const reponse = await postForm(
			'/cours/nouveau',
			coursADates(titreDuCours, '05.01.2027\n12.10.2026\n30.12.2026', [
				['startsOn', '2026-10-12'],
				['endsOn', '2026-12-20']
			]),
			cookie
		);
		expect(reponse.status).toBe(400);
		const html = await reponse.text();
		expect(erreurs(html)).toEqual([
			'Ces dates tombent après le dernier jour du cours et ne seraient pas publiées : 30.12.2026 et 05.01.2027. Choisissez comme dernier jour le 05.01.2027 ou un jour plus tard. Vous pouvez aussi laisser le dernier jour vide ou retirer ces dates.'
		]);
		expect(manques(html).filter((ligne) => ligne.startsWith('Dates'))).toEqual([
			'Dates après le dernier jour, pas publiées : mercredi 30.12.2026 et mardi 05.01.2027'
		]);
		expect(await decalageEnBase(titreDuCours)).toEqual([]);
	});

	it('refuses them on the page of a course too, names them and keeps the course as it was', async () => {
		// La fiche d'un cours passe par le même formulaire : le message y garde ses dates et le jour
		// qu'il propose, et rien n'est écrit.
		async function periodeEnBase() {
			return maintenance(async (tx) =>
				lignes<{ startsOn: string; endsOn: string | null }>(
					await tx.execute(sql`
						select "starts_on"::text as "startsOn", "ends_on"::text as "endsOn" from "course"
						where "id" = ${enfantsId}
					`)
				)
			);
		}
		const fiche = champsDuFormulaire(await (await get(`/cours/${enfantsId}`, cookie)).text());
		expect(fiche).toContainEqual(['dates', '12.10.2026\n26.10.2026']);
		const avec = (nom: string, valeur: string) =>
			fiche.map(([champ, ancienne]): [string, string] => [
				champ,
				champ === nom ? valeur : ancienne
			]);

		const avant = await postForm(`/cours/${enfantsId}`, avec('startsOn', '2026-11-01'), cookie);
		expect(avant.status).toBe(400);
		const htmlAvant = await avant.text();
		expect(erreurs(htmlAvant)).toEqual([
			'Ces dates tombent avant le premier jour du cours et ne seraient pas publiées : 12.10.2026 et 26.10.2026. Choisissez comme premier jour le 12.10.2026 ou un jour plus tôt. Vous pouvez aussi retirer ces dates.'
		]);
		expect(manques(htmlAvant).filter((ligne) => ligne.startsWith('Dates'))).toEqual([
			'Dates : aucune ne sera publiée',
			'Dates avant le premier jour, pas publiées : lundi 12.10.2026 et lundi 26.10.2026'
		]);

		const apres = await postForm(`/cours/${enfantsId}`, avec('endsOn', '2026-10-20'), cookie);
		expect(apres.status).toBe(400);
		expect(erreurs(await apres.text())).toEqual([
			'Cette date tombe après le dernier jour du cours et ne serait pas publiée : 26.10.2026. Choisissez comme dernier jour le 26.10.2026 ou un jour plus tard. Vous pouvez aussi laisser le dernier jour vide ou retirer cette date.'
		]);

		expect(await periodeEnBase()).toEqual([{ startsOn: '2026-10-12', endsOn: null }]);
	});
});

describe('une description sans titre dans sa langue (B4)', () => {
	let cookie = '';

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
	});

	const DESCRIPTION_DE = 'Kommentierte Lesung für Erwachsene.';
	// La description est facultative, même à corriger : l'effacer est l'une des deux corrections.
	const MANQUE =
		'Description en allemand : à corriger, il manque le titre en allemand (facultatif)';
	const MESSAGE: Record<Langue, string> = {
		fr: 'La description en allemand ne peut pas être publiée sans titre dans la même langue. Écrivez aussi le titre en allemand, ou effacez cette description.',
		de: 'Die Beschreibung auf Deutsch kann ohne Titel in derselben Sprache nicht veröffentlicht werden. Schreiben Sie auch den Titel auf Deutsch oder löschen Sie diese Beschreibung.',
		it: 'La descrizione in tedesco non può essere pubblicata senza un titolo nella stessa lingua. Scrivi anche il titolo in tedesco, oppure cancella questa descrizione.',
		en: 'The description in German cannot be published without a title in the same language. Write the title in German too, or delete this description.',
		ar: 'لا يمكن نشر الوصف بالألمانية دون عنوان باللغة نفسها. اكتب العنوان بالألمانية أيضًا، أو احذف هذا الوصف.'
	};

	/** Les titres et descriptions en base du cours qui porte ce titre, langue par langue. */
	async function traductionsDe(titreDuCours: string) {
		return maintenance(async (tx) =>
			lignes<{ language: string; title: string; description: string | null }>(
				await tx.execute(sql`
					select t."language", t."title", t."description" from "course_translation" t
					where t."organization_id" = ${organizationId} and t."course_id" in (
						select "course_id" from "course_translation" where "title" = ${titreDuCours}
					)
					order by t."language"
				`)
			)
		);
	}

	it('refuses it on a new course, names the language and says what to do, in each language', async () => {
		// Avant, le cours s'enregistrait et la description disparaissait sans un mot.
		const titreDuCours = 'Description allemande sans titre';
		const champs: (readonly [string, string])[] = [
			...coursAncre(titreDuCours, 'prayer', '15'),
			['description.de', DESCRIPTION_DE]
		];
		for (const langue of LANGUES) {
			await poserLangueDuCompte(langue);
			const reponse = await postForm('/cours/nouveau', champs, cookie);
			expect(reponse.status, langue).toBe(400);
			expect(erreurs(await reponse.text()), langue).toEqual([MESSAGE[langue]]);
		}
		await poserLangueDuCompte('fr');
		expect(await traductionsDe(titreDuCours)).toEqual([]);
	});

	it('keeps what was typed, marks it in the summary, and saves it once the title is written', async () => {
		const titreDuCours = 'Description gardée';
		const champs: (readonly [string, string])[] = [
			...coursAncre(titreDuCours, 'prayer', '15'),
			['description.de', DESCRIPTION_DE]
		];
		const reponse = await postForm('/cours/nouveau', champs, cookie);
		expect(reponse.status).toBe(400);
		const html = await reponse.text();
		expect(champsDuFormulaire(html)).toContainEqual(['description.de', DESCRIPTION_DE]);
		expect(manques(html)).toContain(MANQUE);

		// Le titre ajouté, comme le message le demande : le cours s'enregistre avec la description.
		const corrige = await postForm(
			'/cours/nouveau',
			[...champs, ['title.de', 'Kurs mit Beschreibung']],
			cookie
		);
		expect(corrige.status).toBe(303);
		expect(await traductionsDe(titreDuCours)).toEqual([
			{ language: 'de', title: 'Kurs mit Beschreibung', description: DESCRIPTION_DE },
			{ language: 'fr', title: titreDuCours, description: null }
		]);
	});

	it('refuses it on the page of a course too, keeps what was typed and the course as it was', async () => {
		const champs = champsDuFormulaire(await (await get(`/cours/${tafsirId}`, cookie)).text()).map(
			([nom, valeur]): [string, string] => [nom, nom === 'description.de' ? DESCRIPTION_DE : valeur]
		);
		const reponse = await postForm(`/cours/${tafsirId}`, champs, cookie);
		expect(reponse.status).toBe(400);
		const html = await reponse.text();
		expect(erreurs(html)).toEqual([MESSAGE.fr]);
		expect(champsDuFormulaire(html)).toContainEqual(['description.de', DESCRIPTION_DE]);
		expect(manques(html)).toEqual([MANQUE]);
		expect(await traductionsDe(TAFSIR)).toEqual([
			{ language: 'ar', title: TAFSIR_AR, description: null },
			{ language: 'fr', title: TAFSIR, description: DESCRIPTION }
		]);
	});
});

describe('le message « nouveau cours », après la publication (étape 19, lot 2)', () => {
	// `newCourseMessage` existait sans écran : la liste le propose maintenant, prêt à coller, après la
	// publication d'un nouveau cours, dans chaque langue que l'organisation publie, la langue source
	// d'abord (règle D1 de l'étape 18).
	let cookie = '';
	let salle = '';

	const PUBLIE: Record<Langue, string> = {
		fr: 'Le cours est publié.',
		de: 'Der Kurs ist veröffentlicht.',
		it: 'Il corso è pubblicato.',
		en: 'The course is published.',
		ar: 'نُشر الدرس.'
	};

	/** Le bloc du message, et lui seul. */
	function blocDuMessage(html: string): string {
		return html.match(/<section\b[^>]*\bclass="message[^"]*"[^>]*>[\s\S]*?<\/section>/)?.[0] ?? '';
	}

	/** Les messages prêts à coller, dans l'ordre de la page : leur langue et leur texte. */
	function messages(html: string): { langue: string; texte: string }[] {
		return [...blocDuMessage(html).matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g)].map(
			(trouve) => ({
				langue: trouve[1]?.match(/\blang="([^"]*)"/)?.[1] ?? '',
				texte: decode(trouve[2] ?? '')
			})
		);
	}

	function coursDuSoir(statut: string): (readonly [string, string])[] {
		return [
			['sourceLanguage', 'de'],
			['title.de', 'Abendkurs'],
			['title.fr', 'Cours du soir'],
			['audience', 'adults'],
			['teachingLanguages', 'de'],
			['recurrenceKind', 'weekly'],
			['weekdays', '2'],
			['interval', '1'],
			['timingKind', 'fixed'],
			['start', '19:00'],
			['end', '20:00'],
			['roomId', salle],
			['startsOn', '2026-10-06'],
			['status', statut]
		];
	}

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte('fr');
		salle =
			options(await (await get('/cours/nouveau', cookie)).text(), 'roomId').find(
				(option) => option.texte === SALLE
			)?.valeur ?? '';
		expect(salle).not.toBe('');
	});

	it('shows it after a new course is published, in each published language, the source language first', async () => {
		const reponse = await postForm('/cours/nouveau', coursDuSoir('published'), cookie);
		expect(reponse.status).toBe(303);
		const adresse = reponse.headers.get('location') ?? '';
		expect(adresse).toMatch(/^\/cours\?publie=[0-9a-f-]{36}$/);
		const html = await (await get(adresse, cookie)).text();
		expect(lu(blocDuMessage(html).match(/<h2\b[\s\S]*?<\/h2>/)?.[0] ?? '')).toBe(PUBLIE.fr);
		// L'allemand, langue de saisie, puis les autres langues publiées, dans l'ordre du service. En
		// arabe, où le cours n'a pas de titre, le titre de la langue de saisie.
		expect(messages(html)).toEqual([
			{
				langue: 'de',
				texte:
					'Salam alaykoum,\n\nNeuer Kurs: «Abendkurs», jeden Dienstag, von 19:00 bis 20:00, Grande salle.'
			},
			{
				langue: 'fr',
				texte:
					'Salam alaykoum,\n\nNouveau cours : « Cours du soir », le mardi, de 19:00 à 20:00, Grande salle.'
			},
			{
				langue: 'ar',
				texte:
					'Salam alaykoum،\n\nدرس جديد: «Abendkurs»، كل الثلاثاء، من 19:00 إلى 20:00، Grande salle.'
			}
		]);
	});

	it('writes the dates of a course at specific dates, and its time by a prayer, never as AAAA-MM-JJ', async () => {
		const reponse = await postForm(
			'/cours/nouveau',
			[
				['sourceLanguage', 'fr'],
				['title.fr', 'Cours annoncé à dates'],
				['audience', 'adults'],
				['teachingLanguages', 'fr'],
				['recurrenceKind', 'dates'],
				['dates', '12.10.2026\n26.10.2026'],
				['timingKind', 'beforePrayer'],
				['prayer', 'maghrib'],
				['offsetMinutes', '10'],
				['durationMinutes', '60'],
				['startsOn', '2026-10-12'],
				['status', 'published']
			],
			cookie
		);
		expect(reponse.status).toBe(303);
		const html = await (await get(reponse.headers.get('location') ?? '', cookie)).text();
		const lus = messages(html);
		expect(lus.map((message) => message.langue)).toEqual(['fr', 'de', 'ar']);
		expect(lus[0]?.texte.split('\n').at(-1)).toBe(
			'Nouveau cours : « Cours annoncé à dates », à des dates précises : lundi 12.10.2026 et lundi 26.10.2026, 10 min avant Maghrib, pendant 1 h.'
		);
		for (const message of lus) expect(message.texte, message.langue).not.toMatch(ISO_DATE);
	});

	it('speaks the language of the screen around the messages, in each language', async () => {
		// Le nom de la zone du message allemand : « Message à copier », puis sa langue, dans celle de
		// l'écran.
		const ALLEMAND: Record<Langue, [string, string]> = {
			fr: ['Message à copier', 'en allemand'],
			de: ['Nachricht zum Kopieren', 'auf Deutsch'],
			it: ['Messaggio da copiare', 'in tedesco'],
			en: ['Message to copy', 'in German'],
			ar: ['الرسالة المراد نسخها', 'بالألمانية']
		};
		const reponse = await postForm('/cours/nouveau', coursDuSoir('published'), cookie);
		const adresse = reponse.headers.get('location') ?? '';
		for (const langue of LANGUES) {
			await poserLangueDuCompte(langue);
			const html = await (await get(adresse, cookie)).text();
			const bloc = blocDuMessage(html);
			expect(lu(bloc.match(/<h2\b[\s\S]*?<\/h2>/)?.[0] ?? ''), langue).toBe(PUBLIE[langue]);
			const zone = bloc.match(/<textarea\b[^>]*\bid="message-de"[^>]*>/)?.[0] ?? '';
			expect(
				[
					decode(zone.match(/\baria-label="([^"]*)"/)?.[1] ?? ''),
					lu(bloc.match(/<span\b[^>]*\bid="message-de-langue"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '')
				],
				langue
			).toEqual(ALLEMAND[langue]);
			expect(zone, langue).toMatch(/\baria-labelledby="message-de message-de-langue"/);
			// Les messages restent dans les langues de la page publique, quelle que soit l'écran.
			expect(
				messages(html).map((message) => message.langue),
				langue
			).toEqual(['de', 'fr', 'ar']);
		}
		await poserLangueDuCompte('fr');
	});

	it('shows it when a draft is published from its page, and not for a draft or another save', async () => {
		const brouillon = await postForm('/cours/nouveau', coursDuSoir('draft'), cookie);
		expect(brouillon.status).toBe(303);
		expect(brouillon.headers.get('location')).toBe('/cours');
		const id = await maintenance(
			async (tx) =>
				lignes<{ id: string }>(
					await tx.execute(sql`
						select c."id" from "course" c where c."status" = 'draft' and exists (
							select 1 from "course_translation" t
							where t."course_id" = c."id" and t."title" = 'Abendkurs'
						)
					`)
				)[0]?.id ?? ''
		);
		// Un brouillon n'est pas annoncé, même à l'adresse d'une annonce, ni un identifiant mal formé.
		for (const adresse of [`/cours?publie=${id}`, '/cours?publie=pas-un-cours']) {
			const html = await (await get(adresse, cookie)).text();
			expect(blocDuMessage(html), adresse).toBe('');
		}
		const champs = champsDuFormulaire(await (await get(`/cours/${id}`, cookie)).text());
		const publie = await postForm(
			`/cours/${id}`,
			champs.map(([nom, valeur]): [string, string] => [
				nom,
				nom === 'status' ? 'published' : valeur
			]),
			cookie
		);
		expect(publie.status).toBe(303);
		expect(publie.headers.get('location')).toBe(`/cours?publie=${id}`);
		expect(messages(await (await get(`/cours?publie=${id}`, cookie)).text())).toHaveLength(3);
		// Enregistré de nouveau, déjà publié : ce n'est plus un nouveau cours.
		const encore = await postForm(
			`/cours/${id}`,
			champsDuFormulaire(await (await get(`/cours/${id}`, cookie)).text()),
			cookie
		);
		expect(encore.status).toBe(303);
		expect(encore.headers.get('location')).toBe('/cours');
	});
});

describe('les dates hors de la période, signalées dans la liste des cours (étape 19, lot 2)', () => {
	// Un cours enregistré avant la règle de l'étape 18 peut avoir des dates que le moteur ne publie
	// pas. Sa fiche le signale déjà ; la liste le montrait encore « publié », sans rien de plus.
	const HORS = 'Cours aux dates d’avant la règle';
	let cookie = '';

	const MARQUE: Record<Langue, string> = {
		fr: 'À corriger : des dates de ce cours tombent hors de sa période et ne sont pas publiées. Ouvrez « Modifier ce cours » pour voir lesquelles.',
		de: 'Zu korrigieren: Einige Daten dieses Kurses liegen ausserhalb seines Zeitraums und werden nicht veröffentlicht. Öffnen Sie «Diesen Kurs bearbeiten», um zu sehen, welche.',
		it: 'Da correggere: alcune date di questo corso cadono fuori dal suo periodo e non sono pubblicate. Apri «Modifica questo corso» per vedere quali.',
		en: 'To correct: some dates of this course fall outside its period and are not published. Open ‘Edit this course’ to see which ones.',
		ar: 'يجب التصحيح: بعض تواريخ هذا الدرس تقع خارج فترته ولا تُنشر. افتح «تعديل هذا الدرس» لتعرف أيّها.'
	};

	/** Le bloc d'un cours dans la liste, par son titre, lu comme une personne le lit. */
	function blocLu(html: string, titreDuCours: string): string {
		return (
			[...html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)]
				.map((trouve) => lu(trouve[0]))
				.find((texte) => texte.includes(titreDuCours)) ?? ''
		);
	}

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		const id = newId();
		await maintenance(async (tx) => {
			// Le 05.10.2026 tombe avant le premier jour, le 10.10.2026 : la base l'accepte, le
			// formulaire ne l'accepterait plus.
			await tx.execute(sql`
				insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
					"source_language", "recurrence_kind", "recurrence_date", "timing_kind", "timing_start",
					"timing_end", "starts_on")
				values (${id}, ${organizationId}, 'published', 'kids', array['fr'], 'fr', 'dates',
					array['2026-10-05','2026-10-12']::date[], 'fixed', '10:00', '11:00', '2026-10-10')
			`);
			await tx.execute(sql`
				insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
				values (${newId()}, ${organizationId}, ${id}, 'fr', ${HORS})
			`);
		});
	});

	it('marks such a course in the list, in each language, and only it', async () => {
		for (const langue of LANGUES) {
			await poserLangueDuCompte(langue);
			const html = await (await get('/cours', cookie)).text();
			expect(blocLu(html, HORS), langue).toContain(MARQUE[langue]);
			// Un cours à dates précises dont les dates sont toutes dans sa période n'a rien à corriger.
			expect(blocLu(html, ENFANTS), langue).not.toContain(MARQUE[langue]);
		}
		await poserLangueDuCompte('fr');
	});
});

describe('ce que le nouveau cours remplit de lui-même (étape 19, lot 2)', () => {
	let cookie = '';

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte('fr');
	});

	/** Les cases cochées d'une liste de cases, par leur nom. */
	function cochees(html: string, nom: string): string[] {
		return champsDuFormulaire(html)
			.filter(([champ]) => champ === nom)
			.map(([, valeur]) => valeur);
	}

	it('ticks the input language as the teaching language of a new course, without JavaScript', async () => {
		const html = await (await get('/cours/nouveau', cookie)).text();
		expect(options(html, 'sourceLanguage').find((option) => option.choisie)?.valeur).toBe('fr');
		expect(cochees(html, 'teachingLanguages')).toEqual(['fr']);
		// La langue de saisie d'un nouveau cours est la langue de l'organisation : une organisation de
		// langue arabe a l'arabe coché d'office.
		await maintenance((tx) =>
			tx.execute(
				sql`update "organization" set "default_language" = 'ar' where "id" = ${organizationId}`
			)
		);
		try {
			const arabe = await (await get('/cours/nouveau', cookie)).text();
			expect(options(arabe, 'sourceLanguage').find((option) => option.choisie)?.valeur).toBe('ar');
			expect(cochees(arabe, 'teachingLanguages')).toEqual(['ar']);
		} finally {
			await maintenance((tx) =>
				tx.execute(
					sql`update "organization" set "default_language" = 'fr' where "id" = ${organizationId}`
				)
			);
		}
	});

	it('still refuses a course with no teaching language ticked at all', async () => {
		const reponse = await postForm(
			'/cours/nouveau',
			coursAncre('Toujours sans langue', 'prayer', '15').filter(
				([nom]) => nom !== 'teachingLanguages'
			),
			cookie
		);
		expect(reponse.status).toBe(400);
		expect(erreurs(await reponse.text())).toEqual(['Cochez au moins une langue d’enseignement.']);
		expect(await decalageEnBase('Toujours sans langue')).toEqual([]);
	});

	it('takes the first date as the first day when a course at specific dates arrives without one', async () => {
		// Sans JavaScript, le premier jour ne s'est pas rempli pendant la saisie : le serveur le fait.
		const champs = (titreDuCours: string): (readonly [string, string])[] => [
			['sourceLanguage', 'fr'],
			['title.fr', titreDuCours],
			['audience', 'kids'],
			['teachingLanguages', 'ar'],
			['recurrenceKind', 'dates'],
			['dates', '26.10.2026\n12.10.2026'],
			['timingKind', 'fixed'],
			['start', '10:00'],
			['end', '11:30'],
			['startsOn', ''],
			['status', 'draft']
		];
		const reponse = await postForm('/cours/nouveau', champs('Premier jour rempli'), cookie);
		expect(reponse.status).toBe(303);
		expect(
			await maintenance(async (tx) =>
				lignes<{ startsOn: string }>(
					await tx.execute(sql`
						select c."starts_on"::text as "startsOn" from "course" c
						join "course_translation" t on t."course_id" = c."id"
						where t."title" = 'Premier jour rempli'
					`)
				)
			)
		).toEqual([{ startsOn: '2026-10-12' }]);

		// Refusé pour une autre raison, le formulaire revient avec ce premier jour, dans le champ et
		// dans le résumé.
		const refuse = await postForm('/cours/nouveau', champs(''), cookie);
		expect(refuse.status).toBe(400);
		const html = await refuse.text();
		expect(erreurs(html)).toEqual(['Écrivez le titre du cours dans la langue de saisie.']);
		expect(champ(html, 'startsOn')['value']).toBe('2026-10-12');
		expect(lignesDuResume(html)).toContain('Premier jour : lundi 12.10.2026');
	});

	it('lets a browser without JavaScript send a course at specific dates with its first day empty', async () => {
		// Un navigateur n'envoie pas un formulaire dont un champ `required` est vide : le premier jour
		// l'était, et le serveur ne voyait donc jamais arriver un premier jour vide depuis le vrai
		// formulaire (relecture du lot 2, dans un vrai Chrome sans JavaScript). On lit ici les
		// champs obligatoires que chaque page rend, et on n'envoie que ce que le navigateur enverrait.
		/** Les champs obligatoires de la page que l'envoi laisse vides : le navigateur s'arrêterait. */
		function obligatoiresVides(html: string, envoye: readonly [string, string][]): string[] {
			return [...html.matchAll(/<(?:input|select|textarea)\b([^>]*)>/g)]
				.map((trouve) => trouve[1] ?? '')
				.filter((attributs) => /\srequired(?=[\s=/>]|$)/.test(attributs))
				.map((attributs) => attributs.match(/\bname="([^"]*)"/)?.[1] ?? '')
				.filter((nom) => !envoye.some(([envoi, valeur]) => envoi === nom && valeur !== ''));
		}

		// Sans JavaScript, « à des dates précises » se choisit sur la page d'un nouveau cours, qui
		// n'a pas encore le champ des dates, puis s'envoie, le premier jour laissé vide.
		const nouveau = await (await get('/cours/nouveau', cookie)).text();
		const choix = champsDuFormulaire(nouveau).map(([nom, valeur]): [string, string] => {
			if (nom === 'recurrenceKind') return [nom, 'dates'];
			if (nom === 'title.fr') return [nom, 'Dates sans premier jour'];
			if (nom === 'start') return [nom, '10:00'];
			if (nom === 'end') return [nom, '11:30'];
			return [nom, valeur];
		});
		expect(choix).toContainEqual(['startsOn', '']);
		expect(obligatoiresVides(nouveau, choix)).toEqual([]);
		const premier = await postForm('/cours/nouveau', choix, cookie);
		expect(premier.status).toBe(400);
		// La page revient avec le champ des dates. On les écrit, et le premier jour reste vide.
		const aDates = await premier.text();
		expect(aDates).toMatch(/<textarea\b[^>]*\bid="dates"/);
		const envoye = champsDuFormulaire(aDates).map(([nom, valeur]): [string, string] => [
			nom,
			nom === 'dates' ? '26.10.2026\n12.10.2026' : valeur
		]);
		expect(envoye).toContainEqual(['startsOn', '']);
		expect(obligatoiresVides(aDates, envoye)).toEqual([]);
		// La fiche d'un cours à dates précises n'exige pas non plus son premier jour.
		const fiche = await (await get(`/cours/${enfantsId}`, cookie)).text();
		expect(champ(fiche, 'startsOn')).not.toHaveProperty('required');
		expect((await postForm('/cours/nouveau', envoye, cookie)).status).toBe(303);
		expect(
			await maintenance(async (tx) =>
				lignes<{ startsOn: string }>(
					await tx.execute(sql`
						select c."starts_on"::text as "startsOn" from "course" c
						join "course_translation" t on t."course_id" = c."id"
						where t."title" = 'Dates sans premier jour'
					`)
				)
			)
		).toEqual([{ startsOn: '2026-10-12' }]);
	});
});

describe('un cours avant une prière (C3)', () => {
	let cookie = '';

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte('fr');
	});

	it('proposes a fixed time, after a prayer or before a prayer', async () => {
		const html = await (await get('/cours/nouveau', cookie)).text();
		expect(options(html, 'timingKind').map(({ valeur, texte }) => [valeur, texte])).toEqual([
			['fixed', 'heure fixe'],
			['prayer', 'après une prière'],
			['beforePrayer', 'avant une prière']
		]);
	});

	it('opens a course stored at −10 on « avant une prière » and 10 minutes', async () => {
		const html = await (await get(`/cours/${tafsirId}`, cookie)).text();
		expect(options(html, 'timingKind').find((option) => option.choisie)?.valeur).toBe(
			'beforePrayer'
		);
		expect(champ(html, 'offsetMinutes')).toMatchObject({ value: '10', min: '1', max: '120' });
		expect(libelle(html, 'offsetMinutes')).toBe('Combien de minutes avant la prière ?');
		expect(options(html, 'prayer').find((option) => option.choisie)).toEqual({
			valeur: 'maghrib',
			texte: 'Maghrib',
			choisie: true
		});
	});

	it('records « avant une prière » with 10 minutes as −10', async () => {
		const reponse = await postForm(
			'/cours/nouveau',
			coursAncre('Avant le Maghrib', 'beforePrayer', '10'),
			cookie
		);
		expect(reponse.status).toBe(303);
		expect(await decalageEnBase('Avant le Maghrib')).toEqual([{ kind: 'prayer', offset: -10 }]);
	});

	it('keeps −10 when the form of the course is sent back as it is', async () => {
		const html = await (await get(`/cours/${tafsirId}`, cookie)).text();
		const champs = champsDuFormulaire(html);
		expect(champs).toContainEqual(['timingKind', 'beforePrayer']);
		expect(champs).toContainEqual(['offsetMinutes', '10']);
		const reponse = await postForm(`/cours/${tafsirId}`, champs, cookie);
		expect(reponse.status).toBe(303);
		expect(await decalageEnBase(TAFSIR)).toEqual([{ kind: 'prayer', offset: -10 }]);
	});

	it('says « 10 min avant Maghrib » in the list, in each language', async () => {
		const horaires: Record<Langue, string> = {
			fr: '10 min avant Maghrib, pendant 1 h',
			de: '10 Min. vor Maghrib, 1 Stunde lang',
			it: '10 min prima di Maghrib, per 1 ora',
			en: '10 min before Maghrib, for 1 hour',
			ar: 'قبل المغرب بـ10 دقائق، لمدة ساعة'
		};
		for (const langue of LANGUES) {
			await poserLangueDuCompte(langue);
			const html = await (await get('/cours', cookie)).text();
			const ligne =
				[...html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)]
					.map((trouve) => lu(trouve[0]))
					.find((texte) => texte.includes(TAFSIR)) ?? '';
			expect(ligne, langue).toContain(horaires[langue]);
		}
		await poserLangueDuCompte('fr');
	});

	it.each([
		['beforePrayer', '-10', 'Avant une prière : de 1 à 120 minutes, en chiffres. Exemple : 10'],
		['beforePrayer', '0', 'Avant une prière : de 1 à 120 minutes, en chiffres. Exemple : 10'],
		['beforePrayer', '121', 'Avant une prière : de 1 à 120 minutes, en chiffres. Exemple : 10'],
		['prayer', '-5', 'Après une prière : de 0 à 240 minutes, en chiffres. Exemple : 15'],
		['prayer', '241', 'Après une prière : de 0 à 240 minutes, en chiffres. Exemple : 15'],
		['prayer', '1.5', 'Après une prière : de 0 à 240 minutes, en chiffres. Exemple : 15'],
		['prayer', 'dix', 'Après une prière : de 0 à 240 minutes, en chiffres. Exemple : 15']
	])('refuses %s with « %s » minutes, and writes nothing', async (choix, minutes, message) => {
		const titreDuCours = `Refusé ${choix} ${minutes}`;
		const reponse = await postForm(
			'/cours/nouveau',
			coursAncre(titreDuCours, choix, minutes),
			cookie
		);
		expect(reponse.status).toBe(400);
		const alerte = (await reponse.text()).match(
			/<div\b[^>]*role="alert"[^>]*>[\s\S]*?<\/div>/
		)?.[0];
		expect(
			[...(alerte ?? '').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((t) => lu(t[1] ?? ''))
		).toEqual([message]);
		expect(await decalageEnBase(titreDuCours)).toEqual([]);
	});

	it.each([
		['beforePrayer', '120', -120],
		['beforePrayer', '1', -1],
		['prayer', '0', 0],
		['prayer', '240', 240]
	])('accepts %s with %s minutes, stored as %i', async (choix, minutes, attendu) => {
		const titreDuCours = `Accepté ${choix} ${minutes}`;
		const reponse = await postForm(
			'/cours/nouveau',
			coursAncre(titreDuCours, choix, minutes),
			cookie
		);
		expect(reponse.status).toBe(303);
		expect(await decalageEnBase(titreDuCours)).toEqual([{ kind: 'prayer', offset: attendu }]);
	});

	it('is bounded by the base too, whatever the path: from −120 to 240 minutes', async () => {
		async function inserer(decalage: number): Promise<string> {
			try {
				await maintenance((tx) =>
					tx.execute(sql`
						insert into "course" ("id", "organization_id", "status", "audience",
							"teaching_language", "source_language", "recurrence_kind", "recurrence_weekday",
							"recurrence_interval", "recurrence_anchor_date", "timing_kind", "timing_prayer",
							"timing_offset_minutes", "timing_duration_minutes", "starts_on")
						values (${newId()}, ${organizationId}, 'draft', 'open', array['fr'], 'fr', 'weekly',
							array[2]::smallint[], 1, '2026-10-06', 'prayer', 'isha', ${decalage}, 60,
							'2026-10-06')
					`)
				);
				return 'accepté';
			} catch (erreur) {
				// Drizzle enveloppe l'erreur de PostgreSQL : son message et celui de sa cause.
				const cause = (erreur as { cause?: { message?: string } }).cause;
				return `${String(erreur)} ${cause?.message ?? ''}`;
			}
		}
		expect(await inserer(-121)).toContain('course_timing_shape_ck');
		expect(await inserer(241)).toContain('course_timing_shape_ck');
		expect(await inserer(-120)).toBe('accepté');
		expect(await inserer(240)).toBe('accepté');
	});
});

describe('aucune erreur 500 sur les écrans des cours (étape 19, lot 2)', () => {
	// Les défauts corrigés au lot 1 sur « À venir » et le vendredi, cherchés ici : `isIsoDate` suit le
	// calendrier de `@jadwal/core`, qui a un an 0000 (ADR 0012), et PostgreSQL non ; le flux agenda
	// calcule le lendemain d'une date de fin, et le 31.12.9999 le faisait tomber pour toute
	// l'organisation ; PostgreSQL refuse le caractère nul dans un texte. Un identifiant mal formé, ou
	// celui d'une autre organisation, atteignait aussi la base.
	let cookie = '';
	const AUTRE = { organisation: newId(), salle: newId(), cours: newId() };
	const DEBUT_ILLISIBLE = 'Choisissez le premier jour du cours.';
	const FIN_ILLISIBLE =
		'Le dernier jour est illisible. Choisissez-le dans le calendrier, ou laissez-le vide.';
	const SALLE_DISPARUE =
		'Cette salle n’existe plus : elle a été supprimée entre-temps. Choisissez une autre salle, ou « aucune salle ».';
	const COURS_DISPARU = 'Ce cours n’existe plus : il a peut-être déjà été supprimé.';

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte('fr');
		await maintenance(async (tx) => {
			await tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
					"enabled_language")
				values (${AUTRE.organisation}, 'cours-d-a-cote', 'Association d’à côté', 'Europe/Zurich',
					'fr', array['fr'])
			`);
			await tx.execute(sql`
				insert into "room" ("id", "organization_id", "name", "display_order")
				values (${AUTRE.salle}, ${AUTRE.organisation}, 'Salle d’à côté', 1)
			`);
			await tx.execute(sql`
				insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
					"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
					"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "starts_on")
				values (${AUTRE.cours}, ${AUTRE.organisation}, 'published', 'open', array['fr'], 'fr',
					'weekly', array[2]::smallint[], 1, '2026-10-06', 'fixed', '19:00', '20:00',
					'2026-10-06')
			`);
		});
	});

	/** Un cours à heure fixe, publié, complet, prêt à poster avec ce qu'on veut y changer. */
	function coursFixe(
		titreDuCours: string,
		changes: readonly (readonly [string, string])[] = []
	): (readonly [string, string])[] {
		const noms = new Set(changes.map(([nom]) => nom));
		return [
			...(
				[
					['sourceLanguage', 'fr'],
					['title.fr', titreDuCours],
					['audience', 'adults'],
					['teachingLanguages', 'fr'],
					['recurrenceKind', 'weekly'],
					['weekdays', '2'],
					['interval', '1'],
					['timingKind', 'fixed'],
					['start', '19:00'],
					['end', '20:00'],
					['startsOn', '2026-10-06'],
					['status', 'published']
				] as const
			).filter(([nom]) => !noms.has(nom)),
			...changes
		];
	}

	async function coursEnBase(titreDuCours: string) {
		return maintenance(async (tx) =>
			lignes<{ id: string; title: string; teacher: string | null; description: string | null }>(
				await tx.execute(sql`
					select c."id", t."title", c."teacher", t."description" from "course" c
					join "course_translation" t on t."course_id" = c."id"
					where c."organization_id" = ${organizationId} and t."title" like ${`${titreDuCours}%`}
				`)
			)
		);
	}

	it('refuses a date the service does not handle, the year 0000 or outside 1970 to 2100, and keeps the agenda feed readable', async () => {
		const TITRE = 'Cours hors des années';
		const recus: Record<string, unknown> = {};
		const attendus: Record<string, unknown> = {};
		for (const [champs, phrases] of [
			[[['startsOn', '0000-01-01']], [DEBUT_ILLISIBLE]],
			[[['startsOn', '1969-12-30']], [DEBUT_ILLISIBLE]],
			[[['endsOn', '9999-12-31']], [FIN_ILLISIBLE]],
			[[['endsOn', '2101-01-06']], [FIN_ILLISIBLE]],
			[[['endsOn', '2026-02-31']], [FIN_ILLISIBLE]],
			[
				[
					['recurrenceKind', 'dates'],
					['dates', '06.10.2026\n31.12.9999']
				],
				['Cette date n’est pas valable : 31.12.9999. Écrivez chaque date comme ceci : 12.10.2026']
			],
			[
				[
					['recurrenceKind', 'dates'],
					['dates', '01.01.0000']
				],
				['Cette date n’est pas valable : 01.01.0000. Écrivez chaque date comme ceci : 12.10.2026']
			]
		] as const) {
			const cas = JSON.stringify(champs);
			const reponse = await postForm('/cours/nouveau', coursFixe(TITRE, champs), cookie);
			recus[cas] = { statut: reponse.status, phrases: erreurs(await reponse.text()) };
			attendus[cas] = { statut: 400, phrases };
		}
		// La fiche d'un cours passe par le même formulaire.
		const fiche = champsDuFormulaire(await (await get(`/cours/${tafsirId}`, cookie)).text()).map(
			([nom, valeur]): [string, string] => [nom, nom === 'endsOn' ? '9999-12-31' : valeur]
		);
		const surLaFiche = await postForm(`/cours/${tafsirId}`, fiche, cookie);
		recus['fiche'] = { statut: surLaFiche.status, phrases: erreurs(await surLaFiche.text()) };
		attendus['fiche'] = { statut: 400, phrases: [FIN_ILLISIBLE] };
		recus['flux agenda'] = (await fetch(`${origin}/m/cours-du-soir/agenda.ics`)).status;
		attendus['flux agenda'] = 200;
		expect(recus).toEqual(attendus);
		expect(await coursEnBase(TITRE)).toEqual([]);
	});

	it('offers in the calendar of each date field only the dates the service accepts', async () => {
		for (const [chemin, ids] of [
			['/cours/nouveau', ['startsOn', 'endsOn']],
			[`/cours/${tafsirId}`, ['startsOn', 'endsOn']],
			['/cours', ['pause-from', 'pause-to']]
		] as const) {
			const html = await (await get(chemin, cookie)).text();
			for (const id of ids) {
				const attributs = champ(html, id);
				expect([attributs['type'], attributs['min'], attributs['max']], `${chemin} ${id}`).toEqual([
					'date',
					'1970-01-01',
					'2100-12-31'
				]);
			}
		}
	});

	it('drops the null character from each text field, instead of an error 500', async () => {
		const reponse = await postForm(
			'/cours/nouveau',
			coursFixe('Caractère\u0000 nul', [
				['teacher', 'Imam\u0000 Karim'],
				['description.fr', 'Pour\u0000 tous.'],
				['recurrenceKind', 'dates'],
				['dates', '06.10.2026\u0000']
			]),
			cookie
		);
		expect(reponse.status).toBe(303);
		expect(
			(await coursEnBase('Caractère nul')).map(({ title, teacher, description }) => ({
				title,
				teacher,
				description
			}))
		).toEqual([{ title: 'Caractère nul', teacher: 'Imam Karim', description: 'Pour tous.' }]);
	});

	it('refuses a room that is not one of the organisation, instead of an error 500', async () => {
		for (const salle of ['pas-une-salle', AUTRE.salle, newId()]) {
			const reponse = await postForm(
				'/cours/nouveau',
				coursFixe('Salle d’ailleurs', [['roomId', salle]]),
				cookie
			);
			expect(reponse.status, salle).toBe(400);
			expect(erreurs(await reponse.text()), salle).toEqual([SALLE_DISPARUE]);
		}
		expect(await coursEnBase('Salle d’ailleurs')).toEqual([]);
	});

	it('answers an unknown course to a malformed identifier in the address', async () => {
		expect((await get('/cours/pas-un-cours', cookie)).status).toBe(404);
		expect(
			(await postForm('/cours/pas-un-cours', coursFixe('Adresse mal formée'), cookie)).status
		).toBe(404);
		expect(await coursEnBase('Adresse mal formée')).toEqual([]);
	});

	it('refuses a pause the service does not handle, instead of an error 500', async () => {
		const PAUSE_ILLISIBLE = 'Choisissez le premier et le dernier jour de la pause.';
		const recus: Record<string, unknown> = {};
		const attendus: Record<string, unknown> = {};
		for (const [champs, statut, phrase] of [
			[{ from: '0000-01-01', to: '0000-01-02' }, 400, PAUSE_ILLISIBLE],
			[{ from: '2026-02-31', to: '2026-03-02' }, 400, PAUSE_ILLISIBLE],
			[{ from: '2026-12-01', to: '9999-12-31' }, 400, PAUSE_ILLISIBLE],
			[{ from: '2026-12-01', to: '2026-12-02', courseId: 'pas-un-cours' }, 404, COURS_DISPARU],
			[{ from: '2026-12-01', to: '2026-12-02', courseId: AUTRE.cours }, 404, COURS_DISPARU]
		] as const) {
			const cas = JSON.stringify(champs);
			const reponse = await postForm('/cours?/pause', Object.entries(champs), cookie);
			const html = await reponse.text();
			recus[cas] = {
				statut: reponse.status,
				phrase: lu(html.match(/<p\b[^>]*role="alert"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '')
			};
			attendus[cas] = { statut, phrase };
		}
		expect(recus).toEqual(attendus);
		const nul = await postForm(
			'/cours?/pause',
			[
				['from', '2027-02-01'],
				['to', '2027-02-07'],
				['reason', 'Relâche\u0000 de février']
			],
			cookie
		);
		expect(nul.status).toBe(200);
		expect(
			await maintenance(async (tx) =>
				lignes<{ reason: string }>(
					await tx.execute(sql`
						select "reason" from "pause"
						where "organization_id" = ${organizationId} and "from_date" = '2027-02-01'
					`)
				)
			)
		).toEqual([{ reason: 'Relâche de février' }]);
	});

	it('says a pause is gone rather than removed, and writes nothing to the journal', async () => {
		const PAUSE_DISPARUE = 'Cette pause n’existe plus : elle a peut-être déjà été supprimée.';
		const pauseId = newId();
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "pause" ("id", "organization_id", "from_date", "to_date")
				values (${pauseId}, ${organizationId}, '2027-04-05', '2027-04-18')
			`)
		);
		const retiree = await postForm('/cours?/supprimerPause', [['pauseId', pauseId]], cookie);
		expect(retiree.status).toBe(200);
		expect(await auJournal('pause.delete', pauseId)).toBe(1);
		const avant = await auJournal('pause.delete');
		// La même pause une seconde fois, depuis une page restée ouverte, puis un identifiant mal formé
		// et un identifiant qu'aucune pause ne porte.
		for (const id of [pauseId, 'pas-une-pause', newId()]) {
			const reponse = await postForm('/cours?/supprimerPause', [['pauseId', id]], cookie);
			expect(reponse.status, id).toBe(404);
			const html = await reponse.text();
			expect(lu(html.match(/<p\b[^>]*role="alert"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''), id).toBe(
				PAUSE_DISPARUE
			);
			expect(html, id).not.toContain('La pause est supprimée.');
		}
		expect(await auJournal('pause.delete')).toBe(avant);
	});
});

describe('supprimer un cours, réservé au responsable (étape 19, lot 2, D3)', () => {
	// La base réserve déjà la suppression d'un cours à la personne responsable (migration 0065) :
	// l'écran la lui propose, à elle seule, avec une confirmation qui marche sans JavaScript, et
	// l'action la ferme à l'éditeur. Un cours qui n'existe plus reçoit une phrase, pas « supprimé ».
	const EDITRICE = 'cours-editrice@example.test';
	let responsable = '';
	let editrice = '';
	let vendrediId = '';

	const BOUTON: Record<Langue, string> = {
		fr: 'Supprimer ce cours',
		de: 'Diesen Kurs löschen',
		it: 'Elimina questo corso',
		en: 'Delete this course',
		ar: 'حذف هذا الدرس'
	};
	const CONFIRMER: Record<Langue, string> = {
		fr: 'Oui, supprimer',
		de: 'Ja, löschen',
		it: 'Sì, elimina',
		en: 'Yes, delete',
		ar: 'نعم، احذف'
	};
	const SUPPRIME: Record<Langue, string> = {
		fr: 'Le cours est supprimé.',
		de: 'Der Kurs ist gelöscht.',
		it: 'Il corso è stato eliminato.',
		en: 'The course has been deleted.',
		ar: 'حُذف الدرس.'
	};
	const DISPARU = 'Ce cours n’existe plus : il a peut-être déjà été supprimé.';

	/** Un cours publié, posé par le propriétaire, sous ce titre. */
	async function poserCours(titreDuCours: string, kind: 'course' | 'jumua' = 'course') {
		const id = newId();
		await maintenance(async (tx) => {
			await tx.execute(sql`
				insert into "course" ("id", "organization_id", "kind", "jumua_order", "status", "audience",
					"teaching_language", "source_language", "recurrence_kind", "recurrence_weekday",
					"recurrence_interval", "recurrence_anchor_date", "timing_kind", "timing_start",
					"timing_end", "starts_on")
				values (${id}, ${organizationId}, ${kind}, ${kind === 'jumua' ? 1 : null}, 'published',
					'open', array['fr'], 'fr', 'weekly', ${sql.raw(kind === 'jumua' ? 'array[5]' : 'array[3]')}::smallint[],
					1, '2026-10-07', 'fixed', '13:30', '14:00', '2026-10-07')
			`);
			await tx.execute(sql`
				insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
				values (${newId()}, ${organizationId}, ${id}, 'fr', ${titreDuCours})
			`);
		});
		return id;
	}

	async function existe(id: string): Promise<boolean> {
		return maintenance(
			async (tx) =>
				lignes(await tx.execute(sql`select "id" from "course" where "id" = ${id}`)).length > 0
		);
	}

	async function suppressionsAuJournal(id: string): Promise<number> {
		return auJournal('course.delete', id);
	}

	/** Le bloc d'un cours dans la liste, par son titre. */
	function blocDuCours(html: string, titreDuCours: string): string {
		return (
			[...html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)]
				.map((trouve) => trouve[0])
				.find((bloc) => bloc.includes(titreDuCours)) ?? ''
		);
	}

	/** La phrase en haut de la liste après un geste : `role="status"`, ou `role="alert"`. */
	function phrase(html: string, role: 'status' | 'alert'): string {
		return lu(html.match(new RegExp(`<p\\b[^>]*role="${role}"[^>]*>([\\s\\S]*?)</p>`))?.[1] ?? '');
	}

	beforeAll(async () => {
		const editriceId = newId();
		await maintenance(async (tx) => {
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified") values (${editriceId}, ${EDITRICE}, true)
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organizationId}, ${editriceId}, 'editor')
			`);
			await tx.execute(conditionsAcceptees(organizationId, editriceId));
		});
		vendrediId = await poserCours('Prière du vendredi à garder', 'jumua');
		responsable = await signIn(RESPONSABLE);
		editrice = await signIn(EDITRICE);
		await poserLangueDuCompte('fr');
	});

	it('offers the manager « Supprimer ce cours », behind a confirmation that works without JavaScript', async () => {
		const id = await poserCours('Cours à confirmer');
		const bloc = blocDuCours(await (await get('/cours', responsable)).text(), 'Cours à confirmer');
		// Un élément `details` natif : fermé, il ne montre que son résumé ; le navigateur l'ouvre seul,
		// sans script, sur la phrase qui dit ce que la suppression emporte et le bouton qui confirme.
		const repli = bloc.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0] ?? '';
		expect(repli).not.toMatch(/<details\b[^>]*\bopen\b/);
		expect(lu(repli.match(/<summary\b[^>]*>[\s\S]*?<\/summary>/)?.[0] ?? '')).toBe(
			'Supprimer ce cours'
		);
		// Le titre du cours complète le nom du geste pour un lecteur d'écran, comme « Modifier ce cours ».
		expect(repli.match(/<summary\b[^>]*>/)?.[0]).toContain(`aria-describedby="course-${id}"`);
		const formulaire = repli.match(/<form\b[^>]*>[\s\S]*?<\/form>/)?.[0] ?? '';
		expect(formulaire).toMatch(/\bmethod="post"/);
		expect(formulaire).toMatch(/\baction="\?\/supprimer"/);
		expect(formulaire).toContain(`name="courseId" value="${id}"`);
		expect(lu(formulaire)).toBe(
			'Le cours disparaîtra de cet écran, de votre page publique et des agendas abonnés, avec ses pauses et les changements de ses séances. Cela ne peut pas être annulé. Pour arrêter le cours à une date, indiquez plutôt son dernier jour dans « Modifier ce cours ». Oui, supprimer'
		);
		expect(await existe(id)).toBe(true);
	});

	it('shows no such button to an editor', async () => {
		await poserCours('Cours vu par l’éditrice');
		const html = await (await get('/cours', editrice)).text();
		const bloc = blocDuCours(html, 'Cours vu par l’éditrice');
		expect(lu(bloc)).toContain('Modifier ce cours');
		expect(html).not.toContain('Supprimer ce cours');
		expect(html).not.toContain('action="?/supprimer"');
	});

	it('refuses it to an editor on the server, deletes nothing and writes nothing', async () => {
		const id = await poserCours('Cours gardé malgré l’éditrice');
		const reponse = await postForm('/cours?/supprimer', [['courseId', id]], editrice);
		expect(reponse.status).toBe(303);
		expect(reponse.headers.get('location')).toBe('/');
		expect(await existe(id)).toBe(true);
		expect(await suppressionsAuJournal(id)).toBe(0);
	});

	it('deletes it for the manager, says so on the list, in each language, and writes the journal once', async () => {
		for (const langue of LANGUES) {
			await poserLangueDuCompte(langue);
			const titreDuCours = `Cours supprimé en ${langue}`;
			const id = await poserCours(titreDuCours);
			const avant = await (await get('/cours', responsable)).text();
			const bloc = blocDuCours(avant, titreDuCours);
			expect(lu(bloc.match(/<summary\b[^>]*>[\s\S]*?<\/summary>/)?.[0] ?? ''), langue).toBe(
				BOUTON[langue]
			);
			expect(lu(bloc.match(/<button\b[^>]*>[\s\S]*?<\/button>/)?.[0] ?? ''), langue).toBe(
				CONFIRMER[langue]
			);
			const reponse = await postForm('/cours?/supprimer', [['courseId', id]], responsable);
			expect(reponse.status, langue).toBe(200);
			const html = await reponse.text();
			expect(phrase(html, 'status'), langue).toBe(SUPPRIME[langue]);
			expect(html, langue).not.toContain(titreDuCours);
			expect(await existe(id), langue).toBe(false);
			expect(await suppressionsAuJournal(id), langue).toBe(1);
		}
		await poserLangueDuCompte('fr');
	});

	it('says a course that no longer exists is gone, not deleted, and writes nothing more', async () => {
		const id = await poserCours('Cours supprimé deux fois');
		expect((await postForm('/cours?/supprimer', [['courseId', id]], responsable)).status).toBe(200);
		// Une seconde fois, depuis une page restée ouverte, un identifiant mal formé, et une session du
		// vendredi, que cet écran ne supprime pas : l'écran du vendredi s'en charge.
		for (const courseId of [id, 'pas-un-cours', newId(), vendrediId]) {
			const reponse = await postForm('/cours?/supprimer', [['courseId', courseId]], responsable);
			expect(reponse.status, courseId).toBe(404);
			const html = await reponse.text();
			expect(phrase(html, 'alert'), courseId).toBe(DISPARU);
			expect(html, courseId).not.toContain('Le cours est supprimé.');
		}
		expect(await suppressionsAuJournal(id)).toBe(1);
		expect(await existe(vendrediId)).toBe(true);
		expect(await suppressionsAuJournal(vendrediId)).toBe(0);
	});
});

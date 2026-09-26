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
					['dates', '12.10.2026\n31.02.2026'],
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
		expect(lignesDuResume(html)).toEqual([
			`Titre en français : ${TAFSIR}`,
			`Description en français : ${DESCRIPTION}`,
			`Titre en arabe : ${TAFSIR_AR}`,
			'Public : adultes',
			'Jours : lundi et mercredi',
			'Fréquence : une semaine sur deux',
			'Horaire : 10 min avant Maghrib, pendant 1 h',
			`Salle : ${SALLE}`,
			`Intervenant : ${INTERVENANT}`,
			'Langue d’enseignement : français et arabe',
			'Premier jour : lundi 07.09.2026',
			'Dernier jour : dimanche 20.12.2026',
			'État : publié, visible sur la page publique'
		]);
		expect(manques(html)).toEqual([]);
	});

	it('signals what is missing on a new course', async () => {
		const html = await (await get('/cours/nouveau', cookie)).text();
		expect(lignesDuResume(html)).toEqual([
			'Titre en français : pas encore écrit',
			'Public : ouvert à tous',
			'Jours : lundi',
			'Fréquence : chaque semaine',
			'Horaire : de 19:00 à 20:30',
			'Salle : pas choisie',
			'Intervenant : aucun pour l’instant',
			'Langue d’enseignement : français',
			'Premier jour : pas choisi',
			'État : brouillon, pas encore sur la page publique'
		]);
		expect(manques(html)).toEqual([
			'Titre en français : pas encore écrit',
			'Salle : pas choisie',
			'Intervenant : aucun pour l’instant',
			'Premier jour : pas choisi'
		]);
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
			'Public : femmes',
			'Jours : pas choisis',
			'Fréquence : chaque semaine',
			'Horaire : 10 min avant Isha, pendant 1 h 30',
			'Salle : pas choisie',
			'Intervenant : Fatima Keller',
			'Langue d’enseignement : pas choisie',
			'Premier jour : mardi 06.10.2026',
			'État : brouillon, pas encore sur la page publique'
		]);
		expect(manques(html)).toEqual([
			'Jours : pas choisis',
			'Salle : pas choisie',
			'Langue d’enseignement : pas choisie'
		]);
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

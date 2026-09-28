// La prière du vendredi et l'iqama, de bout en bout (ADR 0033, ADR 0004 étape 8).
//
// Un responsable se connecte, saisit ses horaires à la main, règle ses iqamas, ajoute deux sessions
// du vendredi dans deux langues, et l'on vérifie que tout est juste là où un visiteur regarde : la
// page publique, le mode intégré, le flux agenda. Rien n'est simulé — vrai serveur, vraie base,
// vrais formulaires sans JavaScript.

import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import ICAL from 'ical.js';
import { addDays, isoDateToDays, todayInZone, weekdayFromDays, type IsoDate } from '@jadwal/core';
import { analyserCalendrier } from '@jadwal/core/prayer';
import { createDatabase, newId, sql, withOrg, type DatabaseHandle } from '@jadwal/db';
import { conditionsAcceptees } from './conditions-acceptees.js';

const origin = inject('origin');
const outbox = inject('outbox');
const testDatabase = inject('testDatabase');

let ownerHandle: DatabaseHandle;
let cookie: string;
let organizationId: string;
let userId: string;
let salleId: string;

const SLUG = 'vendredi';
const FUSEAU = 'Europe/Zurich';
const EMAIL = 'responsable-vendredi@example.test';
/** Le Maghrib importé, le même tous les jours : l'iqama se lit alors sans calcul mental. */
const MAGHRIB = '19:00';
const DHUHR = '12:30';

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

async function maintenance<T>(
	callback: (tx: Parameters<Parameters<DatabaseHandle['db']['transaction']>[0]>[0]) => Promise<T>
): Promise<T> {
	return ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		return callback(tx);
	});
}

/** Poste un formulaire sans JavaScript, avec la session du responsable, ou avec celle donnée. */
async function postForm(
	chemin: string,
	champs: Record<string, string | string[]>,
	session: string = cookie
) {
	const corps = new URLSearchParams();
	for (const [cle, valeur] of Object.entries(champs)) {
		for (const un of Array.isArray(valeur) ? valeur : [valeur]) corps.append(cle, un);
	}
	return fetch(`${origin}${chemin}`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			accept: 'text/html',
			origin,
			cookie: session
		},
		body: corps.toString()
	});
}

/** Connexion par lien magique, comme un vrai responsable : rend le cookie de sa session. */
async function seConnecter(email: string): Promise<string> {
	await maintenance((tx) => tx.execute(sql`delete from "rate_limit"`));
	await fetch(`${origin}/connexion`, {
		method: 'POST',
		redirect: 'manual',
		headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html', origin },
		body: new URLSearchParams({ email }).toString()
	});
	const { readdir, readFile } = await import('node:fs/promises');
	const { join } = await import('node:path');
	const noms = (await readdir(outbox)).filter((nom) => nom.endsWith('.json')).sort();
	const messages = await Promise.all(
		noms.map(
			async (nom) =>
				JSON.parse(await readFile(join(outbox, nom), 'utf8')) as { to: string; text: string }
		)
	);
	const lien = messages
		.filter((message) => message.to === email)
		.at(-1)
		?.text.match(/https?:\/\/\S+/)?.[0];
	expect(lien, `aucun lien magique reçu pour ${email}`).toBeTruthy();
	const suivi = await fetch(lien as string, { redirect: 'manual' });
	const pose = (suivi.headers.getSetCookie?.() ?? []).find((valeur) =>
		valeur.startsWith('better-auth.session_token=')
	);
	expect(pose, `aucune session posée pour ${email}`).toBeTruthy();
	return (pose as string).split(';')[0] as string;
}

async function page(chemin: string, entetes: Record<string, string> = {}): Promise<string> {
	const response = await fetch(`${origin}${chemin}`, {
		headers: {
			accept: 'text/html',
			'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36',
			...entetes
		}
	});
	expect(response.status, chemin).toBe(200);
	return response.text();
}

/** Le prochain vendredi, à partir d'aujourd'hui. */
function prochainVendredi(today: IsoDate): IsoDate {
	for (let pas = 0; pas < 7; pas += 1) {
		const date = addDays(today, pas);
		if (weekdayFromDays(isoDateToDays(date)) === 5) return date;
	}
	throw new Error('aucun vendredi en sept jours');
}

/** Les heures annoncées par la page publique, dans l'ordre du document. */
function heuresAffichees(html: string): string[] {
	return [...html.matchAll(/class="heure[^"]*">([^<]*)</g)].map((trouve) => trouve[1] as string);
}

/** Le bloc du vendredi, en haut de la page : ses lignes, ou une liste vide s'il n'y en a pas. */
function blocDuVendredi(html: string): string[] {
	const debut = html.indexOf('vendredi-titre');
	if (debut < 0) return [];
	const section = html.slice(debut, html.indexOf('</section>', debut));
	return [...section.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((trouve) =>
		(trouve[1] as string)
			.replace(/<[^>]*>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	organizationId = newId();
	userId = newId();
	salleId = newId();
	const soirId = newId();
	const midiId = newId();
	const today = todayInZone(FUSEAU, new Date());

	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language", "prayer_module")
			values (${organizationId}, ${SLUG}, 'Association du vendredi', ${FUSEAU}, 'fr',
				array['fr','de','ar'], true)
		`);
		await tx.execute(sql`
			insert into "user" ("id", "email", "name", "email_verified")
			values (${userId}, ${EMAIL}, 'Responsable (personne fictive)', true)
		`);
		await tx.execute(sql`
			insert into "membership" ("id", "organization_id", "user_id", "role")
			values (${newId()}, ${organizationId}, ${userId}, 'org_admin')
		`);
		// Les conditions déjà acceptées : ce fichier éprouve le vendredi, pas la porte de l'espace,
		// que `conditions.test.ts` éprouve à part (ADR 0044).
		await tx.execute(conditionsAcceptees(organizationId, userId));
		await tx.execute(sql`
			insert into "room" ("id", "organization_id", "name", "display_order")
			values (${salleId}, ${organizationId}, 'Grande salle', 1)
		`);
		// Un cours ancré sur le Maghrib, tous les jours : il servira à voir l'iqama.
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"room_id", "source_language", "recurrence_kind", "recurrence_weekday",
				"recurrence_interval", "recurrence_anchor_date", "timing_kind", "timing_prayer",
				"timing_offset_minutes", "timing_duration_minutes", "starts_on")
			values (${soirId}, ${organizationId}, 'published', 'open', array['fr'], ${salleId}, 'fr',
				'weekly', array[1,2,3,4,5,6,7]::smallint[], 1, '2026-09-07', 'prayer', 'maghrib', 30, 60,
				'2026-09-07')
		`);
		await tx.execute(sql`
			insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
			values (${newId()}, ${organizationId}, ${soirId}, 'fr', 'Cercle du soir')
		`);
		// Un cours ancré sur le Dhuhr, le vendredi : c'est lui qui prouve que la Jumu'a remplace le
		// Dhuhr partout, et pas seulement à l'affichage.
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"room_id", "source_language", "recurrence_kind", "recurrence_weekday",
				"recurrence_interval", "recurrence_anchor_date", "timing_kind", "timing_prayer",
				"timing_offset_minutes", "timing_duration_minutes", "starts_on")
			values (${midiId}, ${organizationId}, 'published', 'open', array['fr'], ${salleId}, 'fr',
				'weekly', array[5]::smallint[], 1, '2026-09-07', 'prayer', 'dhuhr', 30, 45,
				'2026-09-07')
		`);
		await tx.execute(sql`
			insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
			values (${newId()}, ${organizationId}, ${midiId}, 'fr', 'Leçon de midi')
		`);
		// Un calendrier importé, plat : les heures ne dérivent pas, donc ce qu'on lit à l'écran se
		// vérifie de tête.
		for (let pas = -2; pas <= 20; pas += 1) {
			await tx.execute(sql`
				insert into "prayer_day" ("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib",
					"isha", "source")
				values (${organizationId}, ${addDays(today, pas)}, '05:00', ${DHUHR}, '17:00',
					${MAGHRIB}, '21:00', 'import')
			`);
		}
		await tx.execute(sql`
			insert into "prayer_settings" ("organization_id") values (${organizationId})
		`);
	});

	cookie = await seConnecter(EMAIL);
});

afterAll(async () => {
	await ownerHandle?.close();
});

describe('avant toute session', () => {
	it('n’affiche aucun bloc du vendredi, et ne dit pas qu’il en manque un', async () => {
		const html = await page(`/m/${SLUG}`);
		expect(blocDuVendredi(html)).toEqual([]);
		// Un visiteur n'a pas à connaître nos étapes : rien ne signale l'absence.
		expect(html).not.toContain('Prière du vendredi');
	});

	it('laisse le cours de midi suivre l’heure du Dhuhr', async () => {
		const today = todayInZone(FUSEAU, new Date());
		const html = await page(`/m/${SLUG}`);
		// Le vendredi est bien dans la semaine affichée, en JJ.MM.AAAA comme partout ailleurs depuis
		// l'étape 18 (« vendredi 02.10.2026 »).
		const [annee, mois, jour] = prochainVendredi(today).split('-');
		expect(html).toContain(`vendredi ${jour}.${mois}.${annee}`);
		// 12:30 + 30 min = 13:00.
		expect(heuresAffichees(html)).toContain('30 min après Dhuhr (13:00)');
	});
});

describe('la saisie à la main et l’iqama', () => {
	it('enregistre une période sans date de fin, avec les deux formes d’iqama', async () => {
		const response = await postForm('/prieres?/periode', {
			name: 'Toute l’année',
			fromDate: '2026-01-01',
			toDate: '',
			fajrIqama: '06:30',
			maghribIqamaOffset: '10',
			ishaIqamaOffset: '15'
		});
		expect(response.status).toBe(200);
		const periodes = await maintenance(async (tx) =>
			rows<{ name: string; fajr_iqama: string; maghrib_iqama_offset: number }>(
				await tx.execute(sql`
					select "name", "fajr_iqama"::text, "maghrib_iqama_offset" from "prayer_period"
					where "organization_id" = ${organizationId}
				`)
			)
		);
		expect(periodes).toHaveLength(1);
		expect(periodes[0]).toMatchObject({ fajr_iqama: '06:30:00', maghrib_iqama_offset: 10 });
	});

	it('refuse une période qui en chevauche une autre, en le disant', async () => {
		const response = await postForm('/prieres?/periode', {
			name: 'Celle de trop',
			fromDate: '2027-01-01',
			toDate: '2027-06-30'
		});
		expect(response.status).toBe(400);
		// Deux phrases, sans tiret cadratin (`pnpm style`) : le message est lu par un responsable.
		expect(await response.text()).toContain(
			'Cette période en chevauche une autre. Fermez d’abord celle qui la précède. Une période ' +
				'sans date de fin couvre tout ce qui vient après elle.'
		);
	});

	it('fait suivre l’iqama au cours du soir, sur la page publique', async () => {
		// Le Maghrib importé est à 19:00, l'iqama dix minutes plus tard, le cours trente minutes
		// après l'iqama : 19:40, et non 19:30.
		const heures = heuresAffichees(await page(`/m/${SLUG}`));
		expect(heures).toContain('30 min après Maghrib (19:40)');
		expect(heures).not.toContain('30 min après Maghrib (19:30)');
	});

	it('la fait suivre aussi en mode intégré et dans le flux agenda', async () => {
		const integre = heuresAffichees(await page(`/m/${SLUG}?embed=1`));
		expect(integre).toContain('30 min après Maghrib (19:40)');

		const ics = await (await fetch(`${origin}/m/${SLUG}/agenda.ics`)).text();
		const calendrier = new ICAL.Component(ICAL.parse(ics));
		const debuts = calendrier
			.getAllSubcomponents('vevent')
			.map((vevent) => new ICAL.Event(vevent))
			.filter((event) => event.summary === 'Cercle du soir')
			.map((event) => event.startDate.toString().slice(11, 16));
		expect(debuts.length).toBeGreaterThan(3);
		expect(new Set(debuts)).toEqual(new Set(['19:40']));
	});
});

describe('les sessions du vendredi', () => {
	const vendredi = () => prochainVendredi(todayInZone(FUSEAU, new Date()));

	async function ajouter(champs: Record<string, string | string[]>) {
		const response = await postForm('/vendredi?/enregistrer', {
			title: 'Prière du vendredi',
			start: '12:10',
			end: '12:50',
			sermonLanguages: ['ar'],
			roomId: salleId,
			startsOn: '2026-09-04',
			endsOn: '',
			status: 'published',
			...champs
		});
		expect(response.status, await response.text()).toBe(200);
		return response;
	}

	it('en montre une, seule, en haut de la page publique', async () => {
		await ajouter({ jumuaOrder: '1', sermonLanguages: ['ar', 'fr'] });
		const bloc = blocDuVendredi(await page(`/m/${SLUG}`));
		expect(bloc).toHaveLength(1);
		expect(bloc[0]).toContain('12:10');
		expect(bloc[0]).toContain('arabe et français');
		expect(bloc[0]).toContain('Grande salle');
	});

	it('en montre deux, dans leur ordre, avec des langues différentes', async () => {
		await ajouter({ jumuaOrder: '2', start: '13:30', end: '14:10', sermonLanguages: ['ar'] });
		const bloc = blocDuVendredi(await page(`/m/${SLUG}`));
		expect(bloc).toHaveLength(2);
		expect(bloc[0]).toContain('12:10');
		expect(bloc[1]).toContain('13:30');
		expect(bloc[1]).toContain('arabe');
		expect(bloc[1]).not.toContain('français');
	});

	it('en montre trois quand l’organisation en tient trois', async () => {
		await ajouter({ jumuaOrder: '3', start: '14:30', end: '15:10', sermonLanguages: ['de'] });
		expect(blocDuVendredi(await page(`/m/${SLUG}`))).toHaveLength(3);
		// Et la troisième repart : les cas suivants en veulent deux.
		const sessions = await maintenance(async (tx) =>
			rows<{ id: string }>(
				await tx.execute(sql`
					select "id" from "course"
					where "organization_id" = ${organizationId} and "jumua_order" = 3
				`)
			)
		);
		await postForm('/vendredi?/supprimer', { courseId: sessions[0]?.id ?? '' });
		expect(blocDuVendredi(await page(`/m/${SLUG}`))).toHaveLength(2);
	});

	it('les place aussi dans la vue Semaine, au vendredi, avec le mot « sermon »', async () => {
		const html = await page(`/m/${SLUG}`);
		expect(html).toContain('sermon en arabe et français');
		expect(html).toContain('sermon en arabe');
		const heures = heuresAffichees(html);
		expect(heures).toContain('12:10 – 12:50');
		expect(heures).toContain('13:30 – 14:10');
	});

	it('n’affiche plus l’heure du Dhuhr seule : la dernière session la remplace', async () => {
		// Le cours « 30 min après Dhuhr » du vendredi suivait 12:30 ; il suit maintenant 13:30, qui
		// est l'heure de la dernière session — le moment où les gens sont là.
		const heures = heuresAffichees(await page(`/m/${SLUG}`));
		expect(heures).toContain('30 min après Dhuhr (14:00)');
		expect(heures).not.toContain('30 min après Dhuhr (13:00)');
	});

	it('les met dans le flux agenda de l’organisation, et leur donne le leur', async () => {
		const ics = await (await fetch(`${origin}/m/${SLUG}/agenda.ics`)).text();
		const evenements = new ICAL.Component(ICAL.parse(ics))
			.getAllSubcomponents('vevent')
			.map((vevent) => new ICAL.Event(vevent))
			.filter((event) => event.summary === 'Prière du vendredi');
		expect(evenements.length).toBeGreaterThanOrEqual(2);

		const session = await maintenance(async (tx) =>
			rows<{ id: string }>(
				await tx.execute(sql`
					select "id" from "course"
					where "organization_id" = ${organizationId} and "jumua_order" = 1
				`)
			)
		);
		const propre = await fetch(`${origin}/m/${SLUG}/agenda/${session[0]?.id}.ics`);
		expect(propre.status).toBe(200);
		expect(await propre.text()).toContain('Prière du vendredi');
	});

	it('n’apparaît pas dans la liste des cours des responsables', async () => {
		// Le contenu de l'écran seul : depuis l'étape 18, la navigation de la coquille nomme l'écran
		// du vendredi « Prière du vendredi », comme son titre, sur chaque page de l'espace.
		const html = (await page('/cours', { cookie })).match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '';
		expect(html).toContain('Cercle du soir');
		expect(html).not.toContain('Prière du vendredi');
	});

	it('ne s’ouvre pas dans la fiche d’un cours, et n’en devient pas un', async () => {
		// Le formulaire d'un cours écrit un cours : envoyé sur une session, il en faisait un cours.
		// La base refuse qu'une ligne change de type (migration 0069) ; l'écran répond alors comme
		// pour un cours inconnu, jamais par une erreur 500. Une session à elle, en brouillon, retirée
		// à la fin : les autres cas n'en voient rien.
		const sessionId = newId();
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "course" ("id", "organization_id", "kind", "jumua_order", "status", "audience",
					"teaching_language", "source_language", "recurrence_kind", "recurrence_weekday",
					"recurrence_interval", "recurrence_anchor_date", "timing_kind", "timing_start",
					"timing_end", "starts_on")
				values (${sessionId}, ${organizationId}, 'jumua', 3, 'draft', 'open', array['ar'], 'fr',
					'weekly', array[5]::smallint[], 1, '2026-09-04', 'fixed', '14:30', '15:10', '2026-09-04')
			`)
		);
		try {
			const fiche = await fetch(`${origin}/cours/${sessionId}`, {
				headers: { accept: 'text/html', cookie }
			});
			expect(fiche.status).toBe(404);
			const envoi = await postForm(`/cours/${sessionId}`, {
				'title.fr': 'Cours écrit par-dessus',
				audience: 'open',
				teachingLanguages: 'fr',
				sourceLanguage: 'fr',
				status: 'draft',
				startsOn: '2026-09-01',
				recurrenceKind: 'weekly',
				weekdays: '2',
				interval: '1',
				timingKind: 'fixed',
				start: '18:00',
				end: '19:00'
			});
			expect(envoi.status).toBe(404);
			const apres = await maintenance(async (tx) =>
				rows<{ kind: string; jumua_order: number | null }>(
					await tx.execute(
						sql`select "kind", "jumua_order" from "course" where "id" = ${sessionId}`
					)
				)
			);
			expect(apres).toEqual([{ kind: 'jumua', jumua_order: 3 }]);
		} finally {
			await maintenance((tx) => tx.execute(sql`delete from "course" where "id" = ${sessionId}`));
		}
	});

	it('s’annule pour un vendredi seulement, puis se rétablit', async () => {
		const session = await maintenance(async (tx) =>
			rows<{ id: string }>(
				await tx.execute(sql`
					select "id" from "course"
					where "organization_id" = ${organizationId} and "jumua_order" = 1
				`)
			)
		);
		const courseId = session[0]?.id ?? '';
		const date = vendredi();
		expect((await postForm('/vendredi?/annuler', { courseId, date })).status).toBe(200);

		const html = await page(`/m/${SLUG}`);
		expect(html).toContain('Session annulée');
		// Le bloc du haut décrit le rythme habituel : il ne porte pas l'exception.
		expect(blocDuVendredi(html)).toHaveLength(2);

		expect((await postForm('/vendredi?/retablir', { courseId, date })).status).toBe(200);
		expect(await page(`/m/${SLUG}`)).not.toContain('Session annulée');
	});

	it('se déplace, et apparaît alors aux deux dates', async () => {
		const session = await maintenance(async (tx) =>
			rows<{ id: string }>(
				await tx.execute(sql`
					select "id" from "course"
					where "organization_id" = ${organizationId} and "jumua_order" = 2
				`)
			)
		);
		const courseId = session[0]?.id ?? '';
		const date = vendredi();
		// Le lendemain, sauf un samedi : la semaine affichée va alors du samedi au vendredi, et le
		// lendemain du vendredi en sort. Le test tombait chaque samedi, sans rien qui ait changé (vu
		// le 2026-09-26) ; la veille, un jeudi, est alors dans la semaine.
		const today = todayInZone(FUSEAU, new Date());
		const versLe = addDays(date, 1) > addDays(today, 6) ? addDays(date, -1) : addDays(date, 1);
		expect(
			(await postForm('/vendredi?/deplacer', { courseId, date, toDate: versLe, toStart: '15:00' }))
				.status
		).toBe(200);

		const html = await page(`/m/${SLUG}`);
		expect(html).toContain('Session déplacée au');
		expect(html).toContain('Date exceptionnelle');
		expect(heuresAffichees(html)).toContain('15:00 – 15:40');

		expect((await postForm('/vendredi?/retablir', { courseId, date })).status).toBe(200);
	});

	it('se traduit, et prend le nom de la prière dans la langue de la page quand la traduction manque', async () => {
		const session = await maintenance(async (tx) =>
			rows<{ id: string }>(
				await tx.execute(sql`
					select "id" from "course"
					where "organization_id" = ${organizationId} and "jumua_order" = 1
				`)
			)
		);
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
				values (${newId()}, ${organizationId}, ${session[0]?.id}, 'de', 'Freitagsgebet')
				on conflict ("course_id", "language") do update set "title" = excluded."title"
			`)
		);
		const allemand = await page(`/m/${SLUG}/de`);
		expect(allemand).toContain('Freitagsgebet');
		// La seconde session n'est pas traduite, et porte le nom que le service propose : elle se lit
		// sous le nom allemand de la prière, sans mention (étape 18). Un titre choisi par l'organisation
		// garde sa langue source : vendredi-et-partage-en-cinq-langues.test.ts.
		expect(allemand).not.toContain('Prière du vendredi');
		expect(allemand).not.toContain('traduction');
	});

	it('change de saison en closant l’ancienne et en ajoutant la nouvelle', async () => {
		const session = await maintenance(async (tx) =>
			rows<{ id: string }>(
				await tx.execute(sql`
					select "id" from "course"
					where "organization_id" = ${organizationId} and "jumua_order" = 1
				`)
			)
		);
		const courseId = session[0]?.id ?? '';
		const today = todayInZone(FUSEAU, new Date());
		// On clôt la première session hier : elle ne doit plus avoir lieu cette semaine.
		expect(
			(
				await postForm('/vendredi?/enregistrer', {
					courseId,
					title: 'Prière du vendredi',
					jumuaOrder: '1',
					start: '12:10',
					end: '12:50',
					sermonLanguages: ['ar', 'fr'],
					roomId: salleId,
					startsOn: '2026-09-04',
					endsOn: addDays(today, -1),
					status: 'published'
				})
			).status
		).toBe(200);

		const heures = heuresAffichees(await page(`/m/${SLUG}`));
		expect(heures).not.toContain('12:10 – 12:50');
		expect(heures).toContain('13:30 – 14:10');
	});
});

describe('un jour où la session n’a pas lieu (étape 19, lot 3)', () => {
	// Aucune ligne de « Ce vendredi » ne l'envoie, mais un formulaire écrit à la main annulait une
	// session un lundi : l'action répondait 200 et gardait une exception qui ne tombe sur aucune séance.
	// Les séances comptent comme l'écran les montre, du calcul de `@jadwal/core`, quel que soit le jour.
	const LANGUES = ['fr', 'de', 'it', 'en', 'ar'] as const;
	const PAS_CE_JOUR: Record<(typeof LANGUES)[number], string> = {
		fr: 'Cette session n’a pas lieu ce jour-là. Rien n’a été enregistré. La partie « Ce vendredi », plus bas, est à jour.',
		de: 'Dieser Durchgang findet an diesem Tag nicht statt. Es wurde nichts gespeichert. Der Abschnitt «Diesen Freitag» weiter unten ist aktuell.',
		it: 'Questo turno non si tiene quel giorno. Non è stato salvato niente. La sezione «Questo venerdì», più in basso, è aggiornata.',
		en: 'This session does not take place on that day. Nothing has been saved. The ‘This Friday’ section further down shows the latest changes.',
		ar: 'هذا الموعد لا يُقام في ذلك اليوم. لم يُحفظ أي شيء. قسم «هذه الجمعة» في الأسفل محدَّث.'
	};
	const CHANGEE =
		'Cette session a changé depuis l’ouverture de la page : elle a déjà été annulée ou déplacée ce jour-là. Rien n’a été enregistré. La partie « Ce vendredi », plus bas, est à jour.';
	const DEJA_RETABLIE =
		'Cette session a déjà été rétablie depuis l’ouverture de la page. Rien n’a été enregistré. La partie « Ce vendredi », plus bas, est à jour.';

	const vendredi = () => prochainVendredi(todayInZone(FUSEAU, new Date()));
	/** Le lundi qui suit le prochain vendredi : aucune session n'a lieu ce jour-là. */
	const lundi = () => addDays(vendredi(), 3);
	let journal: DatabaseHandle;
	// Une organisation à ce bloc, avec ses deux sessions : il se lance seul (`-t "lot 3"`), et ne
	// dépend pas de ce que les blocs d'avant laissent dans celle du fichier (relecture du lot 3).
	const organisation = newId();
	const utilisateur = newId();
	const EMAIL_DU_BLOC = 'vendredi-jour-sans-session@example.test';
	let session = '';
	/** La première session, close hier, et la deuxième, qui continue. */
	const close = newId();
	const continue_ = newId();

	/** Poste un formulaire avec la session de la personne responsable de cette organisation. */
	const poster = (chemin: string, champs: Record<string, string>) =>
		postForm(chemin, champs, session);

	/** Les phrases du bloc des erreurs en tête de l'écran. */
	function enTete(html: string): string[] {
		const bloc = html.match(/<div\b[^>]*role="alert"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
		return [...bloc.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((trouve) =>
			(trouve[1] ?? '').replace(/<!--[\s\S]*?-->/g, '').trim()
		);
	}

	/** Les lignes du journal de l'organisation, lues par le rôle applicatif. */
	async function lignesDuJournal(): Promise<number> {
		return withOrg(journal.db, { organizationId: organisation, userId: utilisateur }, async (tx) =>
			rows<{ n: number }>(await tx.execute(sql`select count(*)::int as n from "audit_log"`))
		).then((trouve) => trouve[0]?.n ?? 0);
	}

	/** Toutes les exceptions des sessions : un refus n'en écrit aucune. */
	async function exceptions(): Promise<unknown[]> {
		return maintenance(async (tx) =>
			rows(
				await tx.execute(sql`
					select "course_id", "date"::text, "kind", "to_date"::text from "session_exception"
					where "organization_id" = ${organisation} order by "course_id", "date"
				`)
			)
		);
	}

	async function poserLangue(langue: string): Promise<void> {
		await maintenance((tx) =>
			tx.execute(sql`update "user" set "language" = ${langue} where "id" = ${utilisateur}`)
		);
	}

	beforeAll(async () => {
		journal = createDatabase({ role: 'app', overrides: { database: testDatabase } });
		const hier = addDays(todayInZone(FUSEAU, new Date()), -1);
		await maintenance(async (tx) => {
			await tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
					"enabled_language", "prayer_module")
				values (${organisation}, 'vendredi-jour-sans-session', 'Association des vendredis',
					${FUSEAU}, 'fr', array['fr','de','ar'], true)
			`);
			await tx.execute(sql`
				insert into "user" ("id", "email", "name", "email_verified", "language")
				values (${utilisateur}, ${EMAIL_DU_BLOC}, 'Responsable (personne fictive)', true, 'fr')
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organisation}, ${utilisateur}, 'org_admin')
			`);
			await tx.execute(conditionsAcceptees(organisation, utilisateur));
			await tx.execute(sql`
				insert into "prayer_settings" ("organization_id") values (${organisation})
			`);
			// Deux sessions publiées chaque vendredi depuis le 04.09.2026 : la première close hier, comme
			// une saison qui change, la deuxième sans date de fin.
			await tx.execute(sql`
				insert into "course" ("id", "organization_id", "kind", "jumua_order", "status", "audience",
					"teaching_language", "source_language", "recurrence_kind", "recurrence_weekday",
					"recurrence_interval", "recurrence_anchor_date", "timing_kind", "timing_start",
					"timing_end", "starts_on", "ends_on")
				values
					(${close}, ${organisation}, 'jumua', 1, 'published', 'open', array['ar'], 'fr', 'weekly',
						array[5]::smallint[], 1, '2026-09-04', 'fixed', '12:10', '12:50', '2026-09-04', ${hier}),
					(${continue_}, ${organisation}, 'jumua', 2, 'published', 'open', array['ar'], 'fr',
						'weekly', array[5]::smallint[], 1, '2026-09-04', 'fixed', '13:30', '14:10',
						'2026-09-04', null)
			`);
		});
		session = await seConnecter(EMAIL_DU_BLOC);
	});

	// Ce qu'un envoi aurait écrit ne reste pas pour le test suivant.
	afterEach(async () => {
		await maintenance((tx) =>
			tx.execute(sql`
				delete from "session_exception" where "organization_id" = ${organisation}
			`)
		);
	});

	afterAll(async () => {
		await journal?.close();
	});

	it('refuses to cancel or move a session on a Monday, says so at the top in each language, and writes nothing, not even the journal', async () => {
		const journalAvant = await lignesDuJournal();
		try {
			for (const langue of LANGUES) {
				await poserLangue(langue);
				for (const [action, envoi] of [
					['annuler', { courseId: continue_, date: lundi() }],
					[
						'deplacer',
						{ courseId: continue_, date: lundi(), toDate: addDays(lundi(), 1), toStart: '13:30' }
					]
				] as const) {
					const reponse = await poster(`/vendredi?/${action}`, envoi);
					expect(reponse.status, `${action} ${langue}`).toBe(400);
					expect(enTete(await reponse.text()), `${action} ${langue}`).toEqual([
						PAS_CE_JOUR[langue]
					]);
				}
			}
		} finally {
			await poserLangue('fr');
		}
		expect(await exceptions()).toEqual([]);
		expect(await lignesDuJournal()).toBe(journalAvant);
	});

	it('refuses a Friday after the last day of a session', async () => {
		// La première session s'est arrêtée hier : ce vendredi, elle n'a plus lieu.
		for (const [action, envoi] of [
			['annuler', { courseId: close, date: vendredi() }],
			['deplacer', { courseId: close, date: vendredi(), toDate: vendredi(), toStart: '12:30' }]
		] as const) {
			const reponse = await poster(`/vendredi?/${action}`, envoi);
			expect(reponse.status, action).toBe(400);
			expect(enTete(await reponse.text()), action).toEqual([PAS_CE_JOUR.fr]);
		}
		expect(await exceptions()).toEqual([]);
	});

	it.each([
		['of the session', true],
		['of the whole organisation', false]
	] as const)(
		'refuses a Friday in a pause %s, and writes nothing, not even the journal',
		async (_pause, deLaSession) => {
			// Une pause retire la session de ces vendredis, sur l'écran comme sur « À venir » : le
			// prochain vendredi et le suivant, qui s'annulent hors de la pause, n'en ont plus
			// (relecture du lot 3).
			const pause = newId();
			await maintenance((tx) =>
				tx.execute(sql`
					insert into "pause" ("id", "organization_id", "course_id", "from_date", "to_date",
						"reason")
					values (${pause}, ${organisation}, ${deLaSession ? continue_ : null}, ${vendredi()},
						${addDays(vendredi(), 7)}, 'Vacances d’été')
				`)
			);
			try {
				const journalAvant = await lignesDuJournal();
				for (const date of [vendredi(), addDays(vendredi(), 7)]) {
					for (const [action, envoi] of [
						['annuler', { courseId: continue_, date }],
						['deplacer', { courseId: continue_, date, toDate: date, toStart: '15:00' }]
					] as const) {
						const reponse = await poster(`/vendredi?/${action}`, envoi);
						expect(reponse.status, `${action} ${date}`).toBe(400);
						expect(enTete(await reponse.text()), `${action} ${date}`).toEqual([PAS_CE_JOUR.fr]);
					}
				}
				expect(await exceptions()).toEqual([]);
				expect(await lignesDuJournal()).toBe(journalAvant);
			} finally {
				await maintenance((tx) => tx.execute(sql`delete from "pause" where "id" = ${pause}`));
			}
		}
	);

	it('still cancels a session on a Friday after the seven days of the screen', async () => {
		const plusTard = addDays(vendredi(), 7);
		const reponse = await poster('/vendredi?/annuler', { courseId: continue_, date: plusTard });
		expect(reponse.status).toBe(200);
		expect(await exceptions()).toEqual([
			{ course_id: continue_, date: plusTard, kind: 'cancelled', to_date: null }
		]);
	});

	it('refuses to cancel or move a session moved to another day on that day, and keeps the move', async () => {
		// La deuxième session passe du vendredi au jeudi ou au samedi : « Ce vendredi » la montre ce
		// jour-là avec « Rétablir comme d'habitude ». Une annulation écrite sous ce jour-là serait
		// ignorée par le calcul, et la session aurait lieu quand même.
		const today = todayInZone(FUSEAU, new Date());
		const date = vendredi();
		const versLe = addDays(date, 1) > addDays(today, 6) ? addDays(date, -1) : addDays(date, 1);
		expect(
			(
				await poster('/vendredi?/deplacer', {
					courseId: continue_,
					date,
					toDate: versLe,
					toStart: '15:00'
				})
			).status
		).toBe(200);
		const deplacement = await exceptions();
		const journalAvant = await lignesDuJournal();
		for (const [action, envoi] of [
			['annuler', { courseId: continue_, date: versLe }],
			['deplacer', { courseId: continue_, date: versLe, toDate: versLe, toStart: '16:00' }]
		] as const) {
			const reponse = await poster(`/vendredi?/${action}`, envoi);
			expect(reponse.status, action).toBe(409);
			expect(enTete(await reponse.text()), action).toEqual([CHANGEE]);
		}
		expect(await exceptions()).toEqual(deplacement);
		expect(await lignesDuJournal()).toBe(journalAvant);
	});

	it('answers « Rétablir » on a Monday with a refusal, and writes nothing, not even the journal', async () => {
		// Il n'y a rien à rétablir ce jour-là : rien ne s'écrit (étape 19, lot 1).
		const journalAvant = await lignesDuJournal();
		const reponse = await poster('/vendredi?/retablir', { courseId: continue_, date: lundi() });
		expect(reponse.status).toBe(409);
		expect(enTete(await reponse.text())).toEqual([DEJA_RETABLIE]);
		expect(await exceptions()).toEqual([]);
		expect(await lignesDuJournal()).toBe(journalAvant);
	});
});

describe('le modèle CSV', () => {
	it('se télécharge, et notre propre lecteur l’accepte sans une erreur', async () => {
		const response = await fetch(`${origin}/prieres/modele.csv`, { headers: { cookie } });
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/csv');
		expect(response.headers.get('content-disposition')).toContain('attachment');

		const texte = await response.text();
		const lu = analyserCalendrier(texte);
		// Sans position, les heures sont vides : les soixante lignes sont refusées, ce qui est le
		// bon message à l'organisation. Ce qui compte ici, c'est que la **forme** passe.
		expect(lu.separateur).toBe(';');
		expect(texte.split('\r\n')[0]).toBe('date;fajr;dhuhr;asr;maghrib;isha');

		// Avec une position, le modèle est rempli : plus aucune ligne refusée, aucun avertissement.
		await postForm('/prieres?/enregistrer', {
			latitude: '47.1368',
			longitude: '7.2468',
			method: 'MuslimWorldLeague',
			madhab: 'shafi',
			highLatitudeRule: 'middleofthenight',
			fajrAdjustment: '0',
			dhuhrAdjustment: '0',
			asrAdjustment: '0',
			maghribAdjustment: '0',
			ishaAdjustment: '0'
		});
		const rempli = await (
			await fetch(`${origin}/prieres/modele.csv`, { headers: { cookie } })
		).text();
		const relu = analyserCalendrier(rempli);
		expect(relu.refusees).toEqual([]);
		expect(relu.avertissements).toEqual([]);
		expect(relu.jours).toHaveLength(60);
		expect(relu.manquants).toEqual([]);
	});
});

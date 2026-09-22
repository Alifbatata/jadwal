// La prière du vendredi et l'iqama, de bout en bout (ADR 0033, ADR 0004 étape 8).
//
// Un responsable se connecte, saisit ses horaires à la main, règle ses iqamas, ajoute deux sessions
// du vendredi dans deux langues, et l'on vérifie que tout est juste là où un visiteur regarde : la
// page publique, le mode intégré, le flux agenda. Rien n'est simulé — vrai serveur, vraie base,
// vrais formulaires sans JavaScript.

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import ICAL from 'ical.js';
import { addDays, isoDateToDays, todayInZone, weekdayFromDays, type IsoDate } from '@jadwal/core';
import { analyserCalendrier } from '@jadwal/core/prayer';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';
import { conditionsAcceptees } from './conditions-acceptees.js';

const origin = inject('origin');
const outbox = inject('outbox');
const testDatabase = inject('testDatabase');

let ownerHandle: DatabaseHandle;
let cookie: string;
let organizationId: string;
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

async function postForm(chemin: string, champs: Record<string, string | string[]>) {
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
			cookie
		},
		body: corps.toString()
	});
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
	const userId = newId();
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
		await tx.execute(sql`delete from "rate_limit"`);
	});

	// Connexion par lien magique, comme un vrai responsable.
	await fetch(`${origin}/connexion`, {
		method: 'POST',
		redirect: 'manual',
		headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html', origin },
		body: new URLSearchParams({ email: EMAIL }).toString()
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
		.filter((message) => message.to === EMAIL)
		.at(-1)
		?.text.match(/https?:\/\/\S+/)?.[0];
	expect(lien, 'aucun lien magique reçu').toBeTruthy();
	const suivi = await fetch(lien as string, { redirect: 'manual' });
	const pose = (suivi.headers.getSetCookie?.() ?? []).find((valeur) =>
		valeur.startsWith('better-auth.session_token=')
	);
	expect(pose, 'aucune session posée').toBeTruthy();
	cookie = (pose as string).split(';')[0] as string;
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
		// Le vendredi est bien dans la semaine affichée, en toutes lettres comme partout ailleurs.
		expect(html).toContain(`vendredi ${Number(prochainVendredi(today).slice(8, 10))}`);
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
		const html = await page('/cours', { cookie });
		expect(html).toContain('Cercle du soir');
		expect(html).not.toContain('Prière du vendredi');
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
		expect(html).toContain('Annulé');
		// Le bloc du haut décrit le rythme habituel : il ne porte pas l'exception.
		expect(blocDuVendredi(html)).toHaveLength(2);

		expect((await postForm('/vendredi?/retablir', { courseId, date })).status).toBe(200);
		expect(await page(`/m/${SLUG}`)).not.toContain('Annulé');
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
		const versLe = addDays(date, 1);
		expect(
			(await postForm('/vendredi?/deplacer', { courseId, date, toDate: versLe, toStart: '15:00' }))
				.status
		).toBe(200);

		const html = await page(`/m/${SLUG}`);
		expect(html).toContain('Déplacé au');
		expect(html).toContain('Date exceptionnelle');
		expect(heuresAffichees(html)).toContain('15:00 – 15:40');

		expect((await postForm('/vendredi?/retablir', { courseId, date })).status).toBe(200);
	});

	it('se traduit, et se replie sur sa langue source quand la traduction manque', async () => {
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
		// La seconde session n'est pas traduite : elle sort dans sa langue source, sans mention.
		expect(allemand).toContain('Prière du vendredi');
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
			source: 'import',
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

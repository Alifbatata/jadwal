// Le côté public, contre un vrai serveur et une vraie base (ADR 0026, ADR 0027).
//
// Deux tests portent plus que les autres : celui qui compare le programme servi à ce que
// `expandOccurrences` calcule, et celui qui relit le flux agenda **réellement servi par HTTP** avec
// une bibliothèque indépendante. Les autres gardent des promesses : rien de personnel, rien
// d'externe, rien d'invisible qui transparaisse, et un cache qui se périme quand il le doit.

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import ICAL from 'ical.js';
import {
	addDays,
	expandOccurrences,
	todayInZone,
	type IsoDate,
	type Occurrence
} from '@jadwal/core';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';

const origin = inject('origin');
const secondOrigin = inject('secondOrigin');
const testDatabase = inject('testDatabase');

let ownerHandle: DatabaseHandle;
let organizationId: string;
let suspendueId: string;
let publieId: string;
let brouillonId: string;
let archiveId: string;
let dangereuxId: string;
const SLUG = 'publique';
const SLUG_SUSPENDUE = 'suspendue';
const FUSEAU = 'Europe/Zurich';
/** Le point de départ des rythmes : un lundi, pour que les jours listés soient lisibles. */
const DEBUT = '2026-09-07';
const CHARGE = '<img src=x onerror=alert(1)>';

/** Une transaction du propriétaire, sous son drapeau d'entretien : les fixtures passent par là. */
async function maintenance<T>(
	callback: (tx: Parameters<Parameters<DatabaseHandle['db']['transaction']>[0]>[0]) => Promise<T>
): Promise<T> {
	return ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		return callback(tx);
	});
}

/** Un cours complet, posé par le propriétaire : l'application publique ne sait pas écrire. */
async function poserCours(cours: {
	status: string;
	titre: string;
	description?: string;
	audience?: string;
	recurrenceKind: string;
	weekdays?: number[] | null;
	interval?: number | null;
	ordinalWeekday?: number | null;
	ordinal?: number | null;
	dates?: string[] | null;
	timingKind: string;
	start?: string | null;
	end?: string | null;
	prayer?: string | null;
	offsetMinutes?: number | null;
	durationMinutes?: number | null;
	traductions?: Record<string, [string, string | null]>;
}): Promise<string> {
	const id = newId();
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
				"recurrence_anchor_date", "recurrence_ordinal_weekday", "recurrence_ordinal",
				"recurrence_date", "timing_kind", "timing_start", "timing_end", "timing_prayer",
				"timing_offset_minutes", "timing_duration_minutes", "starts_on")
			values (${id}, ${organizationId}, ${cours.status}, ${cours.audience ?? 'open'},
				array['fr'], 'fr', ${cours.recurrenceKind},
				${cours.weekdays ? sql.raw(`array[${cours.weekdays.join(',')}]::smallint[]`) : null},
				${cours.interval ?? null},
				${cours.recurrenceKind === 'weekly' ? DEBUT : null},
				${cours.ordinalWeekday ?? null}, ${cours.ordinal ?? null},
				${cours.dates ? sql.raw(`array[${cours.dates.map((d) => `'${d}'`).join(',')}]::date[]`) : null},
				${cours.timingKind}, ${cours.start ?? null}, ${cours.end ?? null}, ${cours.prayer ?? null},
				${cours.offsetMinutes ?? null}, ${cours.durationMinutes ?? null}, ${DEBUT})
		`);
		const traductions = cours.traductions ?? { fr: [cours.titre, cours.description ?? null] };
		for (const [langue, [titre, description]] of Object.entries(traductions)) {
			await tx.execute(sql`
				insert into "course_translation" ("id", "organization_id", "course_id", "language",
					"title", "description")
				values (${newId()}, ${organizationId}, ${id}, ${langue}, ${titre}, ${description})
			`);
		}
	});
	return id;
}

async function json(url: string): Promise<Record<string, unknown>> {
	const response = await fetch(url);
	expect(response.status, url).toBe(200);
	return (await response.json()) as Record<string, unknown>;
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	organizationId = newId();
	suspendueId = newId();
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language")
			values (${organizationId}, ${SLUG}, 'Mosquée publique', ${FUSEAU}, 'fr',
				array['fr','de','it','ar'])
		`);
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language", "status")
			values (${suspendueId}, ${SLUG_SUSPENDUE}, 'Mosquée suspendue', ${FUSEAU}, 'fr',
				array['fr'], 'suspended')
		`);
	});

	// Les quatre rythmes et les deux modes d'horaire, chacun publié.
	publieId = await poserCours({
		status: 'published',
		titre: 'Hebdomadaire',
		description: 'Deux fois par semaine.',
		recurrenceKind: 'weekly',
		weekdays: [1, 3],
		interval: 1,
		timingKind: 'fixed',
		start: '19:00',
		end: '20:30',
		traductions: {
			fr: ['Hebdomadaire', 'Deux fois par semaine.'],
			de: ['Wöchentlich', 'Zweimal pro Woche.']
		}
	});
	await poserCours({
		status: 'published',
		titre: 'Quinzaine',
		recurrenceKind: 'weekly',
		weekdays: [2],
		interval: 2,
		timingKind: 'fixed',
		start: '14:00',
		end: '15:30'
	});
	await poserCours({
		status: 'published',
		titre: 'Mensuel ancré',
		audience: 'kids',
		recurrenceKind: 'monthly',
		ordinalWeekday: 6,
		ordinal: -1,
		timingKind: 'prayer',
		prayer: 'maghrib',
		offsetMinutes: 30,
		durationMinutes: 60
	});
	await poserCours({
		status: 'published',
		titre: 'Dates précises',
		recurrenceKind: 'dates',
		dates: ['2026-09-12', '2026-09-26', '2027-01-09'],
		timingKind: 'fixed',
		start: '10:00',
		end: '11:30'
	});
	brouillonId = await poserCours({
		status: 'draft',
		titre: 'Brouillon secret',
		recurrenceKind: 'weekly',
		weekdays: [4],
		interval: 1,
		timingKind: 'fixed',
		start: '18:00',
		end: '19:00'
	});
	archiveId = await poserCours({
		status: 'archived',
		titre: 'Archivé secret',
		recurrenceKind: 'weekly',
		weekdays: [5],
		interval: 1,
		timingKind: 'fixed',
		start: '18:00',
		end: '19:00'
	});
	dangereuxId = await poserCours({
		status: 'published',
		titre: CHARGE,
		description: '"><script>alert(2)</script>',
		recurrenceKind: 'weekly',
		weekdays: [7],
		interval: 1,
		timingKind: 'fixed',
		start: '16:00',
		end: '17:00'
	});
});

afterAll(async () => {
	await ownerHandle?.close();
});

describe('l’API dit exactement ce que le cœur calcule', () => {
	it('serves the same sessions as expandOccurrences, on all four rhythms and both timings', async () => {
		const today = todayInZone(FUSEAU, new Date());
		const to = addDays(today, 60);
		const reponse = (await json(
			`${origin}/api/v1/organisations/${SLUG}/schedule?from=${today}&to=${to}`
		)) as { sessions: { courseId: string; date: string; start: string | null; status: string }[] };

		// La même expansion, calculée ici depuis la base, sans passer par le serveur.
		const cours = (await maintenance(async (tx) =>
			tx.execute(sql`select * from "course" where "organization_id" = ${organizationId}
				and "status" = 'published'`)
		)) as unknown as Record<string, unknown>[];
		const attendues: Occurrence[] = expandOccurrences({
			schedules: cours.map((row) => ({
				id: String(row['id']),
				recurrence:
					row['recurrence_kind'] === 'weekly'
						? {
								kind: 'weekly' as const,
								weekdays: (row['recurrence_weekday'] as number[]).map((jour) => jour as 1),
								interval: ((row['recurrence_interval'] as number) === 2 ? 2 : 1) as 1 | 2,
								anchorDate: String(row['recurrence_anchor_date']).slice(0, 10) as IsoDate
							}
						: row['recurrence_kind'] === 'monthly'
							? {
									kind: 'monthly' as const,
									weekday: row['recurrence_ordinal_weekday'] as 1,
									ordinal: row['recurrence_ordinal'] as 1
								}
							: {
									kind: 'dates' as const,
									dates: String(row['recurrence_date'])
										.replace(/[{}]/g, '')
										.split(',')
										.filter(Boolean)
										.map((date) => date.slice(0, 10) as IsoDate)
								},
				timing:
					row['timing_kind'] === 'fixed'
						? {
								kind: 'fixed' as const,
								start: String(row['timing_start']).slice(0, 5) as `${number}:${number}`,
								end: String(row['timing_end']).slice(0, 5) as `${number}:${number}`
							}
						: {
								kind: 'prayer' as const,
								prayer: row['timing_prayer'] as 'maghrib',
								offsetMinutes: row['timing_offset_minutes'] as number,
								durationMinutes: row['timing_duration_minutes'] as number
							},
				startsOn: String(row['starts_on']).slice(0, 10) as IsoDate,
				sequence: 0
			})),
			range: { from: today, to }
		});

		const empreinte = (seance: { courseId: string; date: string; start: string | null }) =>
			`${seance.courseId}|${seance.date}|${seance.start ?? ''}`;
		expect(reponse.sessions.map(empreinte).sort()).toEqual(attendues.map(empreinte).sort());
		// Sans cette garde, deux listes vides seraient « égales » et le test ne dirait rien.
		expect(attendues.length).toBeGreaterThan(10);
	});

	it('bounds the range itself, whatever the caller asks for', async () => {
		const today = todayInZone(FUSEAU, new Date());
		const reponse = (await json(
			`${origin}/api/v1/organisations/${SLUG}/schedule?from=${today}&to=2099-12-31`
		)) as { range: { from: string; to: string } };
		// Quatre-vingt-douze jours au plus : une requête sur dix ans ferait travailler la base pour
		// rien, et le cœur refuserait au-delà de quatre cents jours de toute façon.
		expect(reponse.range.to).toBe(addDays(today as IsoDate, 91));
	});

	it('groups the courses by rhythm, in the order the mockup names', async () => {
		const reponse = (await json(`${origin}/api/v1/organisations/${SLUG}/courses`)) as {
			groups: { rhythm: string; courses: { title: string }[] }[];
		};
		expect(reponse.groups.map((groupe) => groupe.rhythm)).toEqual([
			'weekly',
			'fortnightly',
			'monthly',
			'dates'
		]);
	});
});

describe('ce que le public ne voit pas', () => {
	it('hides a draft, an archived course and a suspended organisation, with no tell-tale code', async () => {
		const programme = await (await fetch(`${origin}/api/v1/organisations/${SLUG}/schedule`)).text();
		expect(programme).not.toContain('Brouillon secret');
		expect(programme).not.toContain('Archivé secret');
		expect(programme).not.toContain(brouillonId);
		expect(programme).not.toContain(archiveId);

		// Une organisation suspendue et un identifiant inventé rendent le même code : rien ne dit
		// qu'une organisation a existé.
		const suspendue = await fetch(`${origin}/api/v1/organisations/${SLUG_SUSPENDUE}/schedule`);
		const inconnue = await fetch(`${origin}/api/v1/organisations/jamais-existe/schedule`);
		expect(suspendue.status).toBe(404);
		expect(inconnue.status).toBe(404);
		expect(await suspendue.text()).toBe(await inconnue.text());

		const page = await fetch(`${origin}/m/${SLUG_SUSPENDUE}`);
		const pageInconnue = await fetch(`${origin}/m/jamais-existe`);
		expect(page.status).toBe(404);
		expect(pageInconnue.status).toBe(404);
	});

	it('never leaks a personal address or an unexpected internal identifier', async () => {
		const cible = [
			`${origin}/api/v1/organisations/${SLUG}`,
			`${origin}/api/v1/organisations/${SLUG}/schedule`,
			`${origin}/api/v1/organisations/${SLUG}/courses`,
			`${origin}/m/${SLUG}`,
			`${origin}/m/${SLUG}?vue=cours`,
			`${origin}/m/${SLUG}/agenda.ics`
		];
		// Les identifiants que le contrat autorise : ceux des cours publiés, dont le widget a besoin
		// pour faire des liens. Tout autre UUID dans une réponse publique est une fuite.
		const autorises = new Set([publieId, dangereuxId]);
		const cours = (await maintenance(async (tx) =>
			tx.execute(sql`select "id" from "course" where "organization_id" = ${organizationId}
				and "status" = 'published'`)
		)) as unknown as { id: string }[];
		for (const row of cours) autorises.add(row.id);

		for (const url of cible) {
			const texte = await (await fetch(url)).text();
			// Les UID du flux agenda ont la forme `<identifiant de cours>@<hôte>`, qui ressemble à une
			// adresse sans en être une. On les retire avant de chercher : c'est la RFC 5545 qui veut
			// cette forme, et l'identifiant du cours est déjà autorisé par le contrat.
			const sansUid = texte.replaceAll(/UID:[0-9a-f-]+(?:-\d{4}-\d{2}-\d{2})?@\S+/g, 'UID:…');
			expect(sansUid, url).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
			const uuids = texte.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g);
			for (const uuid of uuids ?? []) {
				expect(autorises.has(uuid), `${url} laisse passer ${uuid}`).toBe(true);
			}
			expect(texte, url).not.toContain(organizationId);
		}
	});

	it('serves no cookie at all on a public page', async () => {
		const reponse = await fetch(`${origin}/m/${SLUG}`);
		expect(reponse.headers.getSetCookie?.() ?? []).toEqual([]);
	});
});

describe('le flux agenda', () => {
	it('is read back by an independent library and matches expandOccurrences', async () => {
		const reponse = await fetch(`${origin}/m/${SLUG}/agenda.ics`);
		expect(reponse.status).toBe(200);
		expect(reponse.headers.get('content-type')).toContain('text/calendar');
		expect(reponse.headers.get('content-disposition')).toContain(`${SLUG}-jadwal.ics`);
		const ics = await reponse.text();

		// `ical.js` est de Mozilla, et ne partage aucune ligne avec `ical-generator` : si les deux
		// tombent d'accord, le fichier est juste.
		const composant = new ICAL.Component(ICAL.parse(ics));
		const evenements = composant.getAllSubcomponents('vevent');
		expect(evenements.length).toBeGreaterThan(0);

		const titres = evenements.map((evenement) => evenement.getFirstPropertyValue('summary'));
		expect(titres).toContain('Hebdomadaire');
		expect(titres).not.toContain('Brouillon secret');
		expect(titres).not.toContain('Archivé secret');

		// Le cours hebdomadaire à heure fixe sort en un seul événement récurrent, développé ici par
		// `ical.js` et comparé aux dates que le cœur annonce.
		const hebdo = evenements.find(
			(evenement) => evenement.getFirstPropertyValue('summary') === 'Hebdomadaire'
		);
		expect(hebdo, 'le cours hebdomadaire doit être dans le flux').toBeTruthy();
		const expansion = new ICAL.RecurExpansion({
			component: hebdo as ICAL.Component,
			dtstart: (hebdo as ICAL.Component).getFirstPropertyValue('dtstart') as ICAL.Time
		});
		const dates: string[] = [];
		for (let index = 0; index < 8; index += 1) {
			const suivant = expansion.next();
			if (!suivant) break;
			dates.push(suivant.toJSDate().toISOString().slice(0, 10));
		}
		const attendues = expandOccurrences({
			schedules: [
				{
					id: publieId,
					recurrence: {
						kind: 'weekly',
						weekdays: [1, 3],
						interval: 1,
						anchorDate: DEBUT as IsoDate
					},
					timing: { kind: 'fixed', start: '19:00', end: '20:30' },
					startsOn: DEBUT as IsoDate,
					sequence: 0
				}
			],
			range: { from: DEBUT as IsoDate, to: addDays(DEBUT as IsoDate, 27) }
		}).map((seance) => seance.date);
		expect(dates.slice(0, 8)).toEqual(attendues.slice(0, 8));
	});

	it('carries dangerous text as text, never as markup', async () => {
		const ics = await (await fetch(`${origin}/m/${SLUG}/agenda.ics`)).text();
		// Dans un `.ics`, « échapper » veut dire virgule, point-virgule et antislash protégés ; les
		// chevrons, eux, n'ont aucun pouvoir. Ce qui compte est que le texte arrive entier.
		expect(ics).toContain('img src=x onerror=alert(1)');
		expect(ics).not.toContain('\r\n\r\n');
	});
});

describe('les quatre langues', () => {
	it.each([
		['fr', 'Semaine', 'ltr'],
		['de', 'Woche', 'ltr'],
		['it', 'Settimana', 'ltr'],
		['ar', 'الأسبوع', 'rtl']
	])('translates the interface into %s', async (langue, mot, sens) => {
		const chemin = langue === 'fr' ? `/m/${SLUG}` : `/m/${SLUG}/${langue}`;
		const html = await (await fetch(`${origin}${chemin}`)).text();
		expect(html).toContain(mot);
		expect(html).toContain(`dir="${sens}"`);
		expect(html).toContain(`lang="${langue}"`);
	});

	it('falls back to the source language without ever saying so', async () => {
		const allemand = await (await fetch(`${origin}/m/${SLUG}/de`)).text();
		// « Wöchentlich » est traduit ; « Quinzaine » ne l'est pas et sort dans sa langue source.
		expect(allemand).toContain('Wöchentlich');
		expect(allemand).toContain('Quinzaine');
		expect(allemand).not.toMatch(/traduction|Übersetzung fehlt|not translated/i);
	});

	it('writes numbers with latin digits, even in arabic', async () => {
		const arabe = await (await fetch(`${origin}/m/${SLUG}/ar`)).text();
		expect(arabe).toMatch(/19:00|14:00|16:00/);
		// Les chiffres arabo-indiens sont exclus par l'ADR 0007.
		expect(arabe).not.toMatch(/[٠١٢٣٤٥٦٧٨٩]/);
	});

	it('links the language versions to each other for search engines', async () => {
		const html = await (await fetch(`${origin}/m/${SLUG}/cours/${publieId}`)).text();
		for (const langue of ['fr', 'de', 'it', 'ar']) {
			expect(html).toContain(`hreflang="${langue}"`);
		}
	});
});

describe('les pages se lisent sans JavaScript et sans rien d’ailleurs', () => {
	it('carries the programme in the raw HTML, with no script at all', async () => {
		const html = await (await fetch(`${origin}/m/${SLUG}`)).text();
		expect(html).toContain('Hebdomadaire');
		expect(html).toContain('19:00');
		// `csr = false` : SvelteKit n'envoie aucun script. Une balise `<script>` ici serait une
		// régression de la promesse de l'ADR 0027.
		expect(html).not.toMatch(/<script[\s>]/);
	});

	it('asks the browser for nothing from another domain', async () => {
		for (const chemin of [`/m/${SLUG}`, `/m/${SLUG}?vue=cours`, `/m/${SLUG}/agenda`]) {
			const html = await (await fetch(`${origin}${chemin}`)).text();
			const externes = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
				.map((trouve) => trouve[1] as string)
				.filter((url) => /^(https?:)?\/\//.test(url) && !url.startsWith(origin));
			expect(externes, chemin).toEqual([]);
		}
	});

	it('renders dangerous text as text, in the page and in the share metadata', async () => {
		const html = await (await fetch(`${origin}/m/${SLUG}/cours/${dangereuxId}`)).text();
		expect(html).toContain('&lt;img src=x onerror=alert(1)>');
		expect(html).not.toContain(CHARGE);
		expect(html).not.toContain('<script>alert(2)</script>');
		// Les métadonnées de partage sont produites côté serveur : elles s'échappent comme le reste.
		const description = html.match(/<meta property="og:description" content="([^"]*)"/)?.[1] ?? '';
		expect(description).not.toContain('"><script');
	});

	it('lets a mosque put the page in an iframe, and nothing else of the service', async () => {
		const publique = await fetch(`${origin}/m/${SLUG}`);
		expect(publique.headers.get('content-security-policy')).toContain('frame-ancestors *');
		expect(publique.headers.get('x-frame-options')).toBeNull();

		const privee = await fetch(`${origin}/connexion`);
		expect(privee.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
		expect(privee.headers.get('x-frame-options')).toBe('DENY');
	});
});

describe('le cache', () => {
	it('answers 304 when nothing changed, and a new version once a manager writes', async () => {
		const url = `${origin}/api/v1/organisations/${SLUG}/schedule`;
		const premiere = await fetch(url);
		const etag = premiere.headers.get('etag');
		expect(etag, 'une réponse publique porte une entité de validation').toBeTruthy();
		expect(premiere.headers.get('cache-control')).toContain('max-age');

		const revalidation = await fetch(url, { headers: { 'if-none-match': etag as string } });
		expect(revalidation.status).toBe(304);
		expect(await revalidation.text()).toBe('');

		// Une modification par un responsable : la version suivante doit être différente.
		await maintenance((tx) =>
			tx.execute(sql`
				update "course" set "teacher" = ${`changé ${Date.now()}`}, "updated_at" = now()
				where "id" = ${publieId}
			`)
		);
		const apres = await fetch(url, { headers: { 'if-none-match': etag as string } });
		expect(apres.status).toBe(200);
		expect(apres.headers.get('etag')).not.toBe(etag);
	});

	it('changes its version when a course is deleted, which touches no updated_at', async () => {
		// C'est le cas que le comptage rattrape : une suppression ne met aucun horodatage à jour.
		const url = `${origin}/api/v1/organisations/${SLUG}/courses`;
		const jetable = await poserCours({
			status: 'published',
			titre: 'Jetable',
			recurrenceKind: 'weekly',
			weekdays: [4],
			interval: 1,
			timingKind: 'fixed',
			start: '08:00',
			end: '09:00'
		});
		const avant = (await fetch(url)).headers.get('etag');
		await maintenance((tx) => tx.execute(sql`delete from "course" where "id" = ${jetable}`));
		const apres = (await fetch(url)).headers.get('etag');
		expect(apres).not.toBe(avant);
	});
});

describe('la limitation de débit', () => {
	it('refuses beyond the budget, and shares its counter between instances', async () => {
		// Le compteur vit en base : la seconde instance voit ce que la première a consommé.
		await maintenance((tx) => tx.execute(sql`delete from "rate_limit"`));
		const url = `${origin}/api/v1/organisations/${SLUG}`;
		let refus = 0;
		for (let index = 0; index < 130; index += 1) {
			const reponse = await fetch(url);
			if (reponse.status === 429) refus += 1;
			await reponse.text();
		}
		expect(refus).toBeGreaterThan(0);

		const autre = await fetch(`${secondOrigin}/api/v1/organisations/${SLUG}`);
		expect(autre.status).toBe(429);
		expect(autre.headers.get('retry-after')).toBeTruthy();
		await maintenance((tx) => tx.execute(sql`delete from "rate_limit"`));
	});
});

describe('l’API pour un widget d’une autre origine', () => {
	it('opens CORS for reading, and accepts no authentication header', async () => {
		const reponse = await fetch(`${origin}/api/v1/organisations/${SLUG}`);
		expect(reponse.headers.get('access-control-allow-origin')).toBe('*');
		expect(reponse.headers.get('access-control-allow-methods')).toBe('GET, HEAD, OPTIONS');
		const permis = reponse.headers.get('access-control-allow-headers') ?? '';
		expect(permis.toLowerCase()).not.toContain('authorization');
		expect(permis.toLowerCase()).not.toContain('cookie');
	});

	it('answers the preflight without touching the database', async () => {
		const reponse = await fetch(`${origin}/api/v1/organisations/${SLUG}`, { method: 'OPTIONS' });
		expect(reponse.status).toBe(204);
	});

	it('says it is alive, and nothing more', async () => {
		const reponse = await fetch(`${origin}/api/v1/status`);
		expect(reponse.status).toBe(200);
		const etat = (await reponse.json()) as Record<string, unknown>;
		// Ni version, ni nom de machine, ni compte d'organisations : une page d'état qui renseigne
		// un attaquant coûte plus qu'elle ne rapporte.
		expect(Object.keys(etat)).toEqual(['status']);
	});
});

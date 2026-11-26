// La vue « Aujourd'hui » et la navigation principale de la page publique (étape 24, ADR 0052 et
// 0053, docs/maquettes/public-aujourdhui.md).
//
// Vrai serveur construit, vraie base, horloge posée. Les textes attendus sont écrits ici en toutes
// lettres, sans passer par le code qu'on éprouve.

import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { addDays, isoDateToDays, todayInZone, weekdayFromDays, type IsoDate } from '@jadwal/core';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';
import { demarrerALHorloge, portDeTest } from './serveur-a-l-horloge.js';
import { ISO_DATE, visibleText } from './textes-lus.js';

const PORT = portDeTest(8);
const origin = `http://127.0.0.1:${PORT}`;
const PORT_DU_SOIR = portDeTest(9);
const origineDuSoir = `http://127.0.0.1:${PORT_DU_SOIR}`;
const testDatabase = inject('testDatabase');

const LANGUES = ['fr', 'de', 'it', 'en', 'ar'] as const;
type Langue = (typeof LANGUES)[number];

const FUSEAU = 'Europe/Zurich';
/** Un vendredi, 10:00 à Zurich : avant les deux sessions de la prière du vendredi. */
const HORLOGE_DU_MATIN = '2026-10-09T08:00:00Z';
/** La veille, un jeudi, 21:30 à Zurich : après l'Isha. */
const HORLOGE_DU_SOIR = '2026-10-08T19:30:00Z';
const today = todayInZone(FUSEAU, new Date(HORLOGE_DU_MATIN));
const JEUDI = todayInZone(FUSEAU, new Date(HORLOGE_DU_SOIR));
const DEMAIN = addDays(today, 1);
const APRES_DEMAIN = addDays(today, 2);
const DEBUT = '2026-09-07';

/** Module des prières allumé, cinq langues, deux sessions du vendredi, trois cours. */
const SLUG = 'aujourdhui';
const NOM = 'Association du jour';
/** Sans le module : pas d'heure de prière, et un seul cours, après-demain. */
const SLUG_SANS = 'aujourdhui-sans';
const NOM_SANS = 'Association sans prières';
/** Aucun cours publié. */
const SLUG_VIDE = 'aujourdhui-vide';
/** Un cours de chaque jour, et une pause de toute l'organisation, avec son motif. */
const SLUG_PAUSE = 'aujourdhui-pause';
/** La même, sans motif. */
const SLUG_PAUSE_MUETTE = 'aujourdhui-pause-muette';

const HEURES = { fajr: '05:30', dhuhr: '13:05', asr: '16:30', maghrib: '19:10', isha: '20:40' };
const SESSIONS = [
	{ ordre: 1, debut: '12:30', fin: '13:10', langues: ['ar', 'fr'] },
	{ ordre: 2, debut: '13:45', fin: '14:25', langues: ['de'] }
];
const COURS = { quotidien: newId(), demain: newId(), annule: newId(), sans: newId() };
const TITRES = { quotidien: 'Hifz', demain: 'Tajwid', annule: 'Nahw', sans: 'Fiqh', pause: 'Sira' };

const jourDe = (date: IsoDate) => weekdayFromDays(isoDateToDays(date));
const JOURS: Record<Langue, readonly string[]> = {
	fr: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
	de: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
	it: ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'],
	en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
	ar: ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']
};
function jourEtDate(langue: Langue, date: IsoDate): string {
	const [a, m, j] = date.split('-');
	return `${JOURS[langue][jourDe(date) - 1]}${langue === 'de' ? ',' : ''} ${j}.${m}.${a}`;
}

// Ce que la page doit dire, écrit ici.
const ONGLETS: Record<Langue, string[]> = {
	fr: ['Aujourd’hui', 'Programme', 'Prières'],
	de: ['Heute', 'Programm', 'Gebetszeiten'],
	it: ['Oggi', 'Programma', 'Preghiere'],
	en: ['Today', 'Programme', 'Prayer times'],
	ar: ['اليوم', 'البرنامج', 'مواقيت الصلاة']
};
const NOM_DES_ONGLETS: Record<Langue, string> = {
	fr: 'Navigation principale',
	de: 'Hauptnavigation',
	it: 'Navigazione principale',
	en: 'Main navigation',
	ar: 'التنقل الرئيس'
};
const VUES_DU_PROGRAMME: Record<Langue, string[]> = {
	fr: ['Semaine', 'Tous les cours', 'Mois'],
	de: ['Woche', 'Alle Kurse', 'Monat'],
	it: ['Settimana', 'Tutti i corsi', 'Mese'],
	en: ['Week', 'All courses', 'Month'],
	ar: ['الأسبوع', 'كل الدروس', 'الشهر']
};
const AUJOURDHUI: Record<Langue, (date: string) => string> = {
	fr: (date) => `Aujourd’hui, ${date}`,
	de: (date) => `Heute, ${date}`,
	it: (date) => `Oggi, ${date}`,
	en: (date) => `Today, ${date}`,
	ar: (date) => `اليوم، ${date}`
};
/** Un vendredi à 10:00 : les deux sessions restent à venir. */
const PROCHAINE_LE_VENDREDI: Record<Langue, string> = {
	fr: 'Prochaine prière : prière du vendredi à 12:30 et 13:45.',
	de: 'Nächstes Gebet: Freitagsgebet um 12:30 und 13:45.',
	it: 'Prossima preghiera: preghiera del venerdì alle 12:30 e 13:45.',
	en: 'Next prayer: Friday prayer at 12:30 and 13:45.',
	ar: 'الصلاة القادمة: صلاة الجمعة في الساعة 12:30 و13:45.'
};
/** Un jeudi à 21:30, après l'Isha : le Fajr du lendemain. */
const PROCHAINE_LE_SOIR: Record<Langue, string> = {
	fr: 'Prochaine prière : Fajr, demain à 05:30.',
	de: 'Nächstes Gebet: Fadschr, morgen um 05:30.',
	it: 'Prossima preghiera: Fajr, domani alle 05:30.',
	en: 'Next prayer: Fajr, tomorrow at 05:30.',
	ar: 'الصلاة القادمة: الفجر، غدًا في الساعة 05:30.'
};
const SEPT_JOURS: Record<Langue, string> = {
	fr: 'Les sept prochains jours',
	de: 'Die nächsten sieben Tage',
	it: 'I prossimi sette giorni',
	en: 'The next seven days',
	ar: 'الأيام السبعة القادمة'
};
const AU_PROGRAMME: Record<Langue, string> = {
	fr: 'Au programme aujourd’hui',
	de: 'Heute auf dem Programm',
	it: 'In programma oggi',
	en: 'Today’s programme',
	ar: 'برنامج اليوم'
};
const A_VENIR: Record<Langue, string> = {
	fr: 'À venir',
	de: 'Demnächst',
	it: 'Prossimamente',
	en: 'Coming up',
	ar: 'قريبًا'
};
const TOUTE_LA_SEMAINE: Record<Langue, string> = {
	fr: 'Voir toute la semaine',
	de: 'Ganze Woche ansehen',
	it: 'Vedi tutta la settimana',
	en: 'See the whole week',
	ar: 'عرض الأسبوع كاملًا'
};
const SEANCE_ANNULEE: Record<Langue, string> = {
	fr: 'Séance annulée',
	de: 'Termin abgesagt',
	it: 'Lezione annullata',
	en: 'Session cancelled',
	ar: 'حصة ملغاة'
};
const TITRE_DE_L_ONGLET: Record<Langue, string> = {
	fr: `${NOM} | Aujourd’hui`,
	de: `${NOM} | Heute`,
	it: `${NOM} | Oggi`,
	en: `${NOM} | Today`,
	ar: `${NOM} | اليوم`
};

let ownerHandle: DatabaseHandle;
const serveurs: ChildProcess[] = [];

async function servir(
	chemin: string,
	depuis: string = origin
): Promise<{ statut: number; html: string; headers: Headers }> {
	const reponse = await fetch(`${depuis}${chemin}`, { redirect: 'manual' });
	return { statut: reponse.status, html: await reponse.text(), headers: reponse.headers };
}

const base = (langue: Langue, slug = SLUG) =>
	langue === 'fr' ? `/m/${slug}` : `/m/${slug}/${langue}`;

function attributs(balise: string): Record<string, string> {
	return Object.fromEntries(
		[...balise.matchAll(/\s([a-z-]+)="([^"]*)"/g)].map((trouve) => [trouve[1], trouve[2]])
	);
}

/** Ce que l'œil lit d'un fragment : sans balise, sans le texte réservé aux lecteurs d'écran. */
function lu(fragment: string): string {
	return fragment
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<span class="pour-lecteur[^"]*">[^<]*<\/span>/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replaceAll('&amp;', '&')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Une liste de liens de l'en-tête, par sa classe : son nom, ses liens, et celui qui est marqué. */
function navigation(
	html: string,
	classe: string
): { nom: string; liens: { nom: string; href: string; courant: string | undefined }[] } | null {
	const trouve = html.match(
		new RegExp(`<nav\\b([^>]*\\bclass="${classe}\\b[^"]*"[^>]*)>([\\s\\S]*?)</nav>`)
	);
	if (!trouve) return null;
	return {
		nom: attributs(`<nav${trouve[1]}>`)['aria-label'] ?? '',
		liens: [...(trouve[2] ?? '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((lien) => {
			const lus = attributs(`<a${lien[1]}>`);
			return {
				nom: lu(lien[2] ?? ''),
				href: (lus['href'] ?? '').replaceAll('&amp;', '&'),
				courant: lus['aria-current']
			};
		})
	};
}

/** Les titres d'un niveau, dans l'ordre, tels qu'ils se lisent. */
function titres(html: string, niveau: 2 | 3): string[] {
	return [...html.matchAll(new RegExp(`<h${niveau}\\b[^>]*>([\\s\\S]*?)</h${niveau}>`, 'g'))].map(
		(trouve) => lu(trouve[1] ?? '')
	);
}

/** Les lignes d'un tableau, telles que l'œil les lit. */
function lignes(html: string, classe: string): string[][] {
	const tableau =
		html.match(
			new RegExp(`<table\\b[^>]*\\bclass="${classe}\\b[^"]*"[^>]*>([\\s\\S]*?)</table>`)
		)?.[1] ?? '';
	const corps = tableau.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
	return [...corps.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((ligne) =>
		[...(ligne[1] ?? '').matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/g)].map((cellule) =>
			lu(cellule[1] ?? '')
		)
	);
}

/** Le contenu d'une section, par son identifiant. */
function section(html: string, id: string): string {
	return (
		html.match(new RegExp(`<section\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</section>`))?.[1] ?? ''
	);
}

/** Les séances d'un fragment : ce que dit chaque ligne de la liste. */
function seances(fragment: string): string[] {
	return [...fragment.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((trouve) =>
		lu(trouve[1] ?? '')
	);
}

async function maintenance<T>(
	travail: (tx: Parameters<Parameters<DatabaseHandle['db']['transaction']>[0]>[0]) => Promise<T>
): Promise<T> {
	return ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		return travail(tx);
	});
}

beforeAll(async () => {
	const commun = {
		testDatabase,
		outbox: inject('outbox'),
		authSecret: inject('authSecret')
	};
	serveurs.push(
		...(await Promise.all([
			demarrerALHorloge({ ...commun, port: PORT, instant: HORLOGE_DU_MATIN }),
			demarrerALHorloge({ ...commun, port: PORT_DU_SOIR, instant: HORLOGE_DU_SOIR })
		]))
	);
}, 120_000);

afterAll(() => {
	for (const serveur of serveurs) serveur.kill();
});

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	const organisation = newId();
	const sans = newId();
	const vide = newId();
	const pause = newId();
	const pauseMuette = newId();
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language", "prayer_module")
			values
				(${organisation}, ${SLUG}, ${NOM}, ${FUSEAU}, 'fr', array['fr','de','it','en','ar'], true),
				(${sans}, ${SLUG_SANS}, ${NOM_SANS}, ${FUSEAU}, 'fr', array['fr','en'], false),
				(${vide}, ${SLUG_VIDE}, 'Association vide', ${FUSEAU}, 'fr', array['fr'], false),
				(${pause}, ${SLUG_PAUSE}, 'Association en pause', ${FUSEAU}, 'fr', array['fr'], false),
				(${pauseMuette}, ${SLUG_PAUSE_MUETTE}, 'Association en pause muette', ${FUSEAU}, 'fr',
					array['fr'], false)
		`);
		for (let pas = -3; pas <= 10; pas += 1) {
			await tx.execute(sql`
				insert into "prayer_day" ("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib",
					"isha", "source")
				values (${organisation}, ${addDays(today, pas)}, ${HEURES.fajr}, ${HEURES.dhuhr},
					${HEURES.asr}, ${HEURES.maghrib}, ${HEURES.isha}, 'import')
			`);
		}
		// Les iqamas : deux heures fixes, deux décalages, et l'Asr sans rien.
		await tx.execute(sql`
			insert into "prayer_period" ("id", "organization_id", "name", "from_date", "to_date",
				"fajr_iqama", "dhuhr_iqama_offset", "maghrib_iqama_offset", "isha_iqama")
			values (${newId()}, ${organisation}, 'Automne', ${addDays(today, -3)},
				${addDays(today, 10)}, '05:50', 10, 5, '20:55')
		`);
		for (const session of SESSIONS) {
			const id = newId();
			await tx.execute(sql`
				insert into "course" ("id", "organization_id", "kind", "jumua_order", "status", "audience",
					"teaching_language", "source_language", "recurrence_kind", "recurrence_weekday",
					"recurrence_interval", "recurrence_anchor_date", "timing_kind", "timing_start",
					"timing_end", "starts_on")
				values (${id}, ${organisation}, 'jumua', ${session.ordre}, 'published', 'open',
					${sql.raw(`array[${session.langues.map((langue) => `'${langue}'`).join(',')}]`)}, 'fr',
					'weekly', array[5]::smallint[], 1, ${DEBUT}, 'fixed', ${session.debut}, ${session.fin},
					${DEBUT})
			`);
			await tx.execute(sql`
				insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
				values (${newId()}, ${organisation}, ${id}, 'fr', 'Jumu’a')
			`);
		}
		const cours = async (
			orgId: string,
			id: string,
			titre: string,
			jours: number[],
			debut: string,
			fin: string
		) => {
			await tx.execute(sql`
				insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
					"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
					"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "starts_on")
				values (${id}, ${orgId}, 'published', 'open', array['fr'], 'fr', 'weekly',
					${sql.raw(`array[${jours.join(',')}]::smallint[]`)}, 1, ${DEBUT}, 'fixed', ${debut},
					${fin}, ${DEBUT})
			`);
			await tx.execute(sql`
				insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
				values (${newId()}, ${orgId}, ${id}, 'fr', ${titre})
			`);
		};
		const TOUS = [1, 2, 3, 4, 5, 6, 7];
		await cours(organisation, COURS.quotidien, TITRES.quotidien, TOUS, '18:00', '19:00');
		await cours(organisation, COURS.demain, TITRES.demain, [jourDe(DEMAIN)], '10:00', '11:00');
		await cours(organisation, COURS.annule, TITRES.annule, TOUS, '20:00', '21:00');
		// Annulée le vendredi seulement : le jeudi, elle a lieu.
		await tx.execute(sql`
			insert into "session_exception" ("id", "organization_id", "course_id", "date", "kind",
				"to_date", "to_start")
			values (${newId()}, ${organisation}, ${COURS.annule}, ${today}, 'cancelled', null, null)
		`);
		await cours(sans, COURS.sans, TITRES.sans, [jourDe(APRES_DEMAIN)], '18:00', '19:00');
		for (const [orgId, motif] of [
			[pause, 'vacances scolaires'],
			[pauseMuette, null]
		] as const) {
			await cours(orgId, newId(), TITRES.pause, TOUS, '18:00', '19:00');
			await tx.execute(sql`
				insert into "pause" ("id", "organization_id", "course_id", "from_date", "to_date", "reason")
				values (${newId()}, ${orgId}, null, ${addDays(today, -3)}, ${addDays(today, 1)}, ${motif})
			`);
		}
	});
}, 120_000);

afterAll(async () => {
	await ownerHandle?.close();
});

describe('les deux horloges de ce fichier', () => {
	it('puts the first on a Friday and the second on the Thursday before', () => {
		expect([jourDe(today), jourDe(JEUDI)]).toEqual([5, 4]);
		expect(addDays(JEUDI, 1)).toBe(today);
	});
});

describe('la navigation principale de la page publique', () => {
	it.each(LANGUES)('names the tabs, in %s, under a name of its own', async (langue) => {
		const { statut, html } = await servir(base(langue));
		expect(statut).toBe(200);
		const onglets = navigation(html, 'onglets');
		expect(onglets?.nom).toBe(NOM_DES_ONGLETS[langue]);
		expect(onglets?.liens.map((lien) => lien.nom)).toEqual(ONGLETS[langue]);
		const cibles = (onglets?.liens ?? []).map((lien) => {
			const cible = new URL(lien.href, `${origin}${base(langue)}`);
			return [cible.pathname, cible.searchParams.get('vue')];
		});
		expect(cibles).toEqual([
			[base(langue), 'aujourdhui'],
			[base(langue), null],
			[base(langue), 'prieres']
		]);
	});

	it('marks the tab of the current view, and Programme on each of its three views', async () => {
		const courant = async (requete: string) => {
			const { html } = await servir(`${base('en')}${requete}`);
			return (navigation(html, 'onglets')?.liens ?? [])
				.filter((lien) => lien.courant !== undefined)
				.map((lien) => `${lien.nom}=${lien.courant}`);
		};
		expect(await courant('?vue=aujourdhui')).toEqual(['Today=page']);
		expect(await courant('')).toEqual(['Programme=page']);
		// « Tous les cours » et « Mois » ne sont pas la page où mène l'onglet : il est marqué, sans
		// se dire la page courante, que la liste des vues désigne.
		expect(await courant('?vue=cours')).toEqual(['Programme=true']);
		expect(await courant('?vue=mois')).toEqual(['Programme=true']);
		expect(await courant('?vue=prieres')).toEqual(['Prayer times=page']);
	});

	// La page d'un cours et la page d'abonnement font partie du programme : la navigation les suit,
	// pour qu'on n'y soit jamais sans retour vers les autres onglets.
	it.each([
		['the page of a course', `/cours/${COURS.quotidien}`],
		['the subscription page', '/agenda']
	] as const)(
		'follows on %s, with Programme marked, and stays out of its frame',
		async (_, chemin) => {
			for (const langue of ['fr', 'ar'] as const) {
				const { statut, html } = await servir(`${base(langue)}${chemin}`);
				expect(statut, langue).toBe(200);
				const onglets = navigation(html, 'onglets');
				expect(onglets?.nom, langue).toBe(NOM_DES_ONGLETS[langue]);
				expect(
					onglets?.liens.map((lien) => lien.nom),
					langue
				).toEqual(ONGLETS[langue]);
				expect(
					onglets?.liens.map((lien) => lien.courant),
					langue
				).toEqual([undefined, 'true', undefined]);
				// Les liens mènent aux vues de l'organisation, dans la langue de la page.
				const cibles = (onglets?.liens ?? []).map((lien) => {
					const cible = new URL(lien.href, `${origin}${base(langue)}${chemin}`);
					return [cible.pathname, cible.searchParams.get('vue')];
				});
				expect(cibles, langue).toEqual([
					[base(langue), 'aujourdhui'],
					[base(langue), null],
					[base(langue), 'prieres']
				]);
				expect(html, langue).not.toMatch(/<script\b/i);
			}
			const integree = await servir(`${base('fr')}${chemin}?embed=1`);
			expect(integree.statut).toBe(200);
			expect(navigation(integree.html, 'onglets')).toBeNull();
		}
	);

	it.each(LANGUES)(
		'keeps only the three views of the programme in the view list, in %s',
		async (langue) => {
			const { html } = await servir(base(langue));
			expect(navigation(html, 'vues')?.liens.map((lien) => lien.nom)).toEqual(
				VUES_DU_PROGRAMME[langue]
			);
		}
	);

	it('shows the view list and the audience filters under Programme only', async () => {
		for (const requete of ['', '?vue=cours', '?vue=mois']) {
			const { html } = await servir(`${base('fr')}${requete}`);
			expect(navigation(html, 'vues'), requete).not.toBeNull();
			expect(navigation(html, 'filtres'), requete).not.toBeNull();
		}
		for (const requete of ['?vue=aujourdhui', '?vue=prieres']) {
			const { html } = await servir(`${base('fr')}${requete}`);
			expect(navigation(html, 'vues'), requete).toBeNull();
			expect(navigation(html, 'filtres'), requete).toBeNull();
		}
	});

	it('drops the audience filter when leaving the programme for another tab', async () => {
		const { html } = await servir(`${base('fr')}?public=women`);
		const liens = navigation(html, 'onglets')?.liens ?? [];
		expect(liens.map((lien) => new URL(lien.href, origin).searchParams.get('public'))).toEqual([
			null,
			null,
			null
		]);
	});

	it('has no prayer tab where the module is off', async () => {
		const { html } = await servir(`/m/${SLUG_SANS}/en`);
		expect(navigation(html, 'onglets')?.liens.map((lien) => lien.nom)).toEqual([
			'Today',
			'Programme'
		]);
	});

	// Le widget encadre un programme, pas une application (ADR 0053).
	it('stays out of the frame of the widget, whose view list keeps its four views', async () => {
		for (const requete of ['?embed=1', '?vue=prieres&embed=1', '?vue=aujourdhui&embed=1']) {
			const { statut, html } = await servir(`${base('fr')}${requete}`);
			expect(statut, requete).toBe(200);
			expect(navigation(html, 'onglets'), requete).toBeNull();
			expect(
				navigation(html, 'vues')?.liens.map((lien) => lien.nom),
				requete
			).toEqual(['Semaine', 'Tous les cours', 'Mois', 'Prières']);
		}
	});

	it('adds no script to the page', async () => {
		for (const requete of ['', '?vue=aujourdhui']) {
			const { html } = await servir(`${base('fr')}${requete}`);
			expect(html, requete).not.toMatch(/<script\b/i);
		}
	});
});

describe('la vue Aujourd’hui, un vendredi à 10:00', () => {
	it.each(LANGUES)('names the view in the title of the page, in %s', async (langue) => {
		const { html } = await servir(`${base(langue)}?vue=aujourdhui`);
		expect(lu(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '')).toBe(TITRE_DE_L_ONGLET[langue]);
	});

	it.each(LANGUES)(
		'gives the day, the next prayer and the prayer times of the day, in %s',
		async (langue) => {
			const { statut, html } = await servir(`${base(langue)}?vue=aujourdhui`);
			expect(statut).toBe(200);
			expect(titres(html, 2)[0]).toBe(AUJOURDHUI[langue](jourEtDate(langue, today)));
			const prochaine = lu(
				html.match(/<p\b[^>]*\bclass="prochaine\b[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''
			);
			expect(prochaine).toBe(PROCHAINE_LE_VENDREDI[langue]);
			// Le tableau du jour est celui de l'onglet des prières, ligne pour ligne.
			const onglet = await servir(`${base(langue)}?vue=prieres`);
			expect(lignes(html, 'aujourdhui')).toHaveLength(5);
			expect(lignes(html, 'aujourdhui')).toEqual(lignes(onglet.html, 'aujourdhui'));
			// Et pas le tableau de la semaine, que l'onglet garde pour lui.
			expect(html).not.toMatch(/<table\b[^>]*\bclass="semaine\b/);
			const lien = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].find(
				(trouve) => lu(trouve[2] ?? '') === SEPT_JOURS[langue]
			);
			const cible = new URL(
				(attributs(`<a${lien?.[1] ?? ''}>`)['href'] ?? '').replaceAll('&amp;', '&'),
				`${origin}${base(langue)}`
			);
			expect([cible.pathname, cible.searchParams.get('vue')]).toEqual([base(langue), 'prieres']);
		}
	);

	it.each(LANGUES)(
		'lists what takes place today, cancelled sessions included, in %s',
		async (langue) => {
			const { html } = await servir(`${base(langue)}?vue=aujourdhui`);
			expect(titres(html, 2)[1]).toBe(AU_PROGRAMME[langue]);
			const duJour = seances(section(html, 'aujourdhui-programme'));
			expect(duJour).toHaveLength(4);
			// Dans l'ordre des heures : les deux sessions du vendredi, puis les deux cours.
			expect(duJour[0]).toContain('12:30');
			expect(duJour[1]).toContain('13:45');
			expect(duJour[2]).toContain(`18:00 – 19:00 ${TITRES.quotidien}`);
			expect(duJour[3]).toContain(`20:00 – 21:00 ${TITRES.annule} ${SEANCE_ANNULEE[langue]}`);
		}
	);

	it.each(LANGUES)(
		'gives the next day that has sessions, and a link to the week, in %s',
		async (langue) => {
			const { html } = await servir(`${base(langue)}?vue=aujourdhui`);
			expect(titres(html, 2)[2]).toBe(A_VENIR[langue]);
			expect(titres(html, 3)).toEqual([jourEtDate(langue, DEMAIN)]);
			const suite = section(html, 'aujourdhui-suite');
			// Demain, un samedi : le cours du samedi, puis les deux cours de chaque jour, dont celui qui
			// n'était annulé que le vendredi.
			const attendues = [
				`10:00 – 11:00 ${TITRES.demain}`,
				`18:00 – 19:00 ${TITRES.quotidien}`,
				`20:00 – 21:00 ${TITRES.annule}`
			];
			const lues = seances(suite);
			expect(lues.map((ligne, rang) => ligne.slice(0, (attendues[rang] ?? '').length))).toEqual(
				attendues
			);
			expect(lues.join(' ')).not.toContain(SEANCE_ANNULEE[langue]);
			const lien = [...suite.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].find(
				(trouve) => lu(trouve[2] ?? '') === TOUTE_LA_SEMAINE[langue]
			);
			const cible = new URL(
				(attributs(`<a${lien?.[1] ?? ''}>`)['href'] ?? '').replaceAll('&amp;', '&'),
				`${origin}${base(langue)}`
			);
			expect([cible.pathname, cible.search]).toEqual([base(langue), '']);
		}
	);

	it('shows neither the Friday block of the header nor a date in the form of the database', async () => {
		for (const langue of LANGUES) {
			const { html } = await servir(`${base(langue)}?vue=aujourdhui`);
			expect(html, langue).not.toMatch(/<section\b[^>]*\bclass="vendredi\b/);
			expect(visibleText(html), langue).not.toMatch(ISO_DATE);
		}
	});

	it('is kept in a cache for a minute, no longer: the next prayer changes with the hour', async () => {
		const { headers } = await servir(`${base('fr')}?vue=aujourdhui`);
		expect(headers.get('cache-control')).toBe('public, max-age=60');
		// Les autres vues gardent leur cache.
		const semaine = await servir(base('fr'));
		expect(semaine.headers.get('cache-control')).toBe(
			'public, max-age=120, stale-while-revalidate=86400'
		);
	});

	it('keeps the view when the language changes', async () => {
		const { html } = await servir(`${base('fr')}?vue=aujourdhui`);
		const choix = [...html.matchAll(/<option\b([^>]*)>/g)].map((trouve) =>
			(attributs(`<option${trouve[1]}>`)['value'] ?? '').replaceAll('&amp;', '&')
		);
		expect(choix).toEqual(LANGUES.map((langue) => `${base(langue)}?vue=aujourdhui`));
	});
});

describe('la vue Aujourd’hui, un jeudi à 21:30', () => {
	it.each(LANGUES)(
		'gives the Fajr of the next day once the Isha has passed, in %s',
		async (langue) => {
			const { html } = await servir(`${base(langue)}?vue=aujourdhui`, origineDuSoir);
			expect(titres(html, 2)[0]).toBe(AUJOURDHUI[langue](jourEtDate(langue, JEUDI)));
			const prochaine = lu(
				html.match(/<p\b[^>]*\bclass="prochaine\b[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''
			);
			expect(prochaine).toBe(PROCHAINE_LE_SOIR[langue]);
		}
	);

	it('gives the iqama of the Dhuhr on a day that is not a Friday, and no Friday prayer', async () => {
		const { html } = await servir(`${base('fr')}?vue=aujourdhui`, origineDuSoir);
		expect(lignes(html, 'aujourdhui')[1]).toEqual(['Dhuhr', '13:05', '13:15']);
		const duJour = seances(section(html, 'aujourdhui-programme'));
		// Les séances du matin restent affichées jusqu'à la fin de la journée ; celle de 20:00 a lieu.
		expect(duJour.map((ligne) => ligne.slice(0, 18))).toEqual([
			`18:00 – 19:00 ${TITRES.quotidien}`,
			`20:00 – 21:00 ${TITRES.annule}`
		]);
		expect(duJour.join(' ')).not.toContain(SEANCE_ANNULEE.fr);
	});
});

describe('la vue Aujourd’hui, sans heure de prière', () => {
	it('heads the sessions with the day where the prayer module is off', async () => {
		const { statut, html } = await servir(`/m/${SLUG_SANS}?vue=aujourdhui`);
		expect(statut).toBe(200);
		expect(html).not.toMatch(/<table\b[^>]*\bclass="aujourdhui\b/);
		expect(html).not.toMatch(/\bclass="prochaine\b/);
		expect(titres(html, 2)).toEqual([AUJOURDHUI.fr(jourEtDate('fr', today)), A_VENIR.fr]);
		expect(lu(section(html, 'aujourdhui-programme'))).toContain('Aucune séance aujourd’hui.');
		// Le premier jour suivant qui a des séances : après-demain.
		expect(titres(html, 3)).toEqual([jourEtDate('fr', APRES_DEMAIN)]);
		expect(seances(section(html, 'aujourdhui-suite'))[0]).toContain(`18:00 – 19:00 ${TITRES.sans}`);
	});

	it.each([
		['fr', 'Aucune séance aujourd’hui.'],
		['en', 'No sessions today.']
	] as const)('says that nothing takes place today, in %s', async (langue, phrase) => {
		const { html } = await servir(`${base(langue, SLUG_SANS)}?vue=aujourdhui`);
		expect(lu(section(html, 'aujourdhui-programme'))).toContain(phrase);
	});

	it('says that the programme is not published yet, and keeps the link to the week', async () => {
		const { html } = await servir(`/m/${SLUG_VIDE}?vue=aujourdhui`);
		expect(lu(section(html, 'aujourdhui-programme'))).toContain(
			'Le programme n’est pas encore publié.'
		);
		expect(titres(html, 3)).toEqual([]);
		expect(lu(section(html, 'aujourdhui-suite'))).toBe(`${A_VENIR.fr} ${TOUTE_LA_SEMAINE.fr}`);
	});

	it('names the pause, with its reason when it has one', async () => {
		const nommee = await servir(`/m/${SLUG_PAUSE}?vue=aujourdhui`);
		expect(lu(section(nommee.html, 'aujourdhui-programme'))).toContain(
			'Pas de cours aujourd’hui : vacances scolaires.'
		);
		const muette = await servir(`/m/${SLUG_PAUSE_MUETTE}?vue=aujourdhui`);
		expect(lu(section(muette.html, 'aujourdhui-programme'))).toContain(
			'Pas de cours aujourd’hui : une pause est en cours.'
		);
	});
});

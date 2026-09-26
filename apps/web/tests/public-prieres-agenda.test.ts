// La page publique et le widget, après les retours de l'étape 18 : l'onglet des prières (C4),
// l'agenda selon l'appareil (E1), le délai de Google (E2), la vue « Tous les cours » qui ne compte
// plus une séance déplacée ailleurs, et chaque écran touché dans les cinq langues (D2, A3).
//
// Vrai serveur construit, vraie base. Les textes attendus sont écrits ici en toutes lettres, sans
// passer par le code qu'on éprouve : un dictionnaire faux ferait tomber le test au lieu de s'y
// recopier.

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { addDays, isoDateToDays, todayInZone, weekdayFromDays, type IsoDate } from '@jadwal/core';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';
import { frenchLeft, ISO_DATE, textSegments, visibleText } from './textes-lus.js';

const origin = inject('origin');
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
/** Une organisation qui a le module des prières, en français par défaut, dans les cinq langues. */
const SLUG = 'prieres-agenda';
const NOM = 'Association des prières';
/** Une organisation sans le module : ni onglet, ni heure. */
const SLUG_SANS = 'sans-prieres';
const NOM_SANS = 'Association sans module';
const DEBUT = '2026-09-07';

const today = todayInZone(FUSEAU, new Date());
/** Le lendemain, et son jour de semaine : le cours déplacé a lieu ce jour-là chaque semaine. */
const DEMAIN = addDays(today, 1);
const APRES_DEMAIN = addDays(today, 2);

/** Les heures importées, et les iqamas de la période saisie : fixes, pour qu'elles se lisent ici. */
const HEURES = { fajr: '05:30', dhuhr: '13:05', asr: '16:30', maghrib: '19:10', isha: '20:40' };
/** L'iqama de chaque prière : deux heures fixes, deux décalages, et l'Asr sans iqama. */
const IQAMAS = { fajr: '05:50', dhuhr: '13:15', asr: null, maghrib: '19:15', isha: '20:55' };
/** Les deux sessions du vendredi et les langues de leur sermon. */
const SESSIONS = [
	{ ordre: 1, debut: '12:30', fin: '13:10', langues: ['ar', 'fr'] },
	{ ordre: 2, debut: '13:45', fin: '14:25', langues: ['de'] }
];

const COURS = {
	/** Un cours qui a lieu chaque semaine le jour de demain ; la séance de demain est déplacée. */
	deplace: newId(),
	/** Un cours de chaque jour, pour la page d'un cours et son abonnement. */
	quotidien: newId()
};
/** Les titres, d'un seul mot : un titre saisi par l'organisation n'est pas un texte à traduire. */
const TITRES = { deplace: 'Tajwid', quotidien: 'Hifz' };

/** Les agents de vrais navigateurs, les mêmes que ceux du test unitaire de la détection. */
const AGENTS = {
	iphone:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
	ipad: 'Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/604.1',
	ipadOs:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
	android:
		'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
	windows:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'
};
type Visiteur = Record<string, string>;
const IPHONE: Visiteur = { 'user-agent': AGENTS.iphone };
const ANDROID: Visiteur = { 'user-agent': AGENTS.android, 'sec-ch-ua-platform': '"Android"' };
const WINDOWS: Visiteur = { 'user-agent': AGENTS.windows, 'sec-ch-ua-platform': '"Windows"' };

let ownerHandle: DatabaseHandle;

async function maintenance<T>(
	travail: (tx: Parameters<Parameters<DatabaseHandle['db']['transaction']>[0]>[0]) => Promise<T>
): Promise<T> {
	return ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		return travail(tx);
	});
}

async function servir(
	chemin: string,
	entetes: Visiteur = {}
): Promise<{ statut: number; html: string; headers: Headers }> {
	const reponse = await fetch(`${origin}${chemin}`, { redirect: 'manual', headers: entetes });
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

/** « samedi 26.09.2026 », « Samstag, 26.09.2026 » : écrit ici, sans le code qu'on éprouve. */
const JOURS: Record<Langue, readonly string[]> = {
	fr: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
	de: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
	it: ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'],
	en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
	ar: ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']
};
const jourDe = (date: IsoDate) => weekdayFromDays(isoDateToDays(date));
function jourEtDate(langue: Langue, date: IsoDate): string {
	const [a, m, j] = date.split('-');
	return `${JOURS[langue][jourDe(date) - 1]}${langue === 'de' ? ',' : ''} ${j}.${m}.${a}`;
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	const organisation = newId();
	const sans = newId();
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language", "prayer_module")
			values (${organisation}, ${SLUG}, ${NOM}, ${FUSEAU}, 'fr', array['fr','de','it','en','ar'], true)
		`);
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language")
			values (${sans}, ${SLUG_SANS}, ${NOM_SANS}, ${FUSEAU}, 'fr', array['fr','en'])
		`);
		for (let pas = -2; pas <= 10; pas += 1) {
			await tx.execute(sql`
				insert into "prayer_day" ("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib",
					"isha", "source")
				values (${organisation}, ${addDays(today, pas)}, ${HEURES.fajr}, ${HEURES.dhuhr},
					${HEURES.asr}, ${HEURES.maghrib}, ${HEURES.isha}, 'import')
			`);
		}
		// Les iqamas, par une période saisie : deux heures fixes et deux décalages, l'Asr sans rien.
		await tx.execute(sql`
			insert into "prayer_period" ("id", "organization_id", "name", "from_date", "to_date",
				"fajr_iqama", "dhuhr_iqama_offset", "maghrib_iqama_offset", "isha_iqama")
			values (${newId()}, ${organisation}, 'Automne', ${addDays(today, -2)}, ${addDays(today, 10)},
				'05:50', 10, 5, '20:55')
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
		const cours: [string, string, number[]][] = [
			[COURS.deplace, TITRES.deplace, [jourDe(DEMAIN)]],
			[COURS.quotidien, TITRES.quotidien, [1, 2, 3, 4, 5, 6, 7]]
		];
		for (const [id, titre, jours] of cours) {
			await tx.execute(sql`
				insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
					"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
					"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "starts_on")
				values (${id}, ${organisation}, 'published', 'open', array['fr'], 'fr', 'weekly',
					${sql.raw(`array[${jours.join(',')}]::smallint[]`)}, 1, ${DEBUT}, 'fixed', '18:00',
					'19:00', ${DEBUT})
			`);
			await tx.execute(sql`
				insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
				values (${newId()}, ${organisation}, ${id}, 'fr', ${titre})
			`);
		}
		// La séance de demain passe à après-demain, un jour où le cours n'a pas lieu d'habitude.
		await tx.execute(sql`
			insert into "session_exception" ("id", "organization_id", "course_id", "date", "kind",
				"to_date", "to_start")
			values (${newId()}, ${organisation}, ${COURS.deplace}, ${DEMAIN}, 'moved', ${APRES_DEMAIN},
				'18:00')
		`);
		await tx.execute(sql`delete from "rate_limit"`);
	});
});

afterAll(async () => {
	await ownerHandle?.close();
});

// ---------------------------------------------------------------------------------------------
// C4 : l'onglet des prières
// ---------------------------------------------------------------------------------------------

/** Le nom de chaque vue de l'en-tête, dans l'ordre, lu dans la liste des vues. */
function vues(html: string): { nom: string; href: string }[] {
	const liste = html.match(/<nav\b[^>]*\bclass="vues\b[^"]*"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
	return [...liste.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((trouve) => ({
		nom: lu(trouve[2] ?? ''),
		href: (attributs(`<a${trouve[1]}>`)['href'] ?? '').replaceAll('&amp;', '&')
	}));
}

const NOMS_DES_VUES: Record<Langue, string[]> = {
	fr: ['Semaine', 'Tous les cours', 'Mois', 'Prières'],
	de: ['Woche', 'Alle Kurse', 'Monat', 'Gebetszeiten'],
	it: ['Settimana', 'Tutti i corsi', 'Mese', 'Preghiere'],
	en: ['Week', 'All courses', 'Month', 'Prayer times'],
	ar: ['الأسبوع', 'كل الدروس', 'الشهر', 'مواقيت الصلاة']
};

/** Les lignes d'un tableau : l'en-tête de ligne, puis chaque case, telles que l'œil les lit. */
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

const PRIERES: Record<Langue, string[]> = {
	fr: ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'],
	de: ['Fadschr', 'Dhuhr', 'Asr', 'Maghrib', 'Ischa'],
	it: ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'],
	en: ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'],
	ar: ['الفجر', 'الظهر', 'العصر', 'المغرب', 'العشاء']
};
/** « Prière du vendredi : 12:30 et 13:45 », à la place de l'iqama du Dhuhr, un vendredi. */
const VENDREDI_A: Record<Langue, string> = {
	fr: 'Prière du vendredi : 12:30 et 13:45',
	de: 'Freitagsgebet: 12:30 und 13:45',
	it: 'Preghiera del venerdì: 12:30 e 13:45',
	en: 'Friday prayer: 12:30 and 13:45',
	ar: 'صلاة الجمعة: 12:30 و13:45'
};
const AUJOURDHUI: Record<Langue, (date: string) => string> = {
	fr: (date) => `Aujourd’hui, ${date}`,
	de: (date) => `Heute, ${date}`,
	it: (date) => `Oggi, ${date}`,
	en: (date) => `Today, ${date}`,
	ar: (date) => `اليوم، ${date}`
};
const SERMONS: Record<Langue, string[]> = {
	fr: ['12:30 sermon en arabe et français', '13:45 sermon en allemand'],
	de: ['12:30 Predigt auf Arabisch und Französisch', '13:45 Predigt auf Deutsch'],
	it: ['12:30 sermone in arabo e francese', '13:45 sermone in tedesco'],
	en: ['12:30 sermon in Arabic and French', '13:45 sermon in German'],
	ar: ['12:30 لغة الخطبة: العربية والفرنسية', '13:45 لغة الخطبة: الألمانية']
};

describe('l’onglet des prières, quand le module est allumé (C4)', () => {
	it.each(LANGUES)(
		'adds the tab to the views, in %s, and it leads to the prayer times',
		async (langue) => {
			const { statut, html } = await servir(base(langue));
			expect(statut).toBe(200);
			const liste = vues(html);
			expect(liste.map((vue) => vue.nom)).toEqual(NOMS_DES_VUES[langue]);
			const onglet = new URL(liste[3]?.href ?? '', `${origin}${base(langue)}`);
			expect(onglet.pathname).toBe(base(langue));
			expect(onglet.searchParams.get('vue')).toBe('prieres');
		}
	);

	it('marks the tab as the current view, and hides the audience filters there', async () => {
		const { html } = await servir(`${base('en')}?vue=prieres`);
		const courant = [...html.matchAll(/<nav\b[^>]*\bclass="vues\b[\s\S]*?<\/nav>/g)][0]?.[0] ?? '';
		expect(courant).toMatch(/<a\b[^>]*aria-current="page"[^>]*>\s*Prayer times\s*<\/a>/);
		expect(html).not.toMatch(/<nav\b[^>]*\bclass="filtres\b/);
	});

	it.each(LANGUES)('gives the adhan and the iqama of today, in %s', async (langue) => {
		const { statut, html } = await servir(`${base(langue)}?vue=prieres`);
		expect(statut).toBe(200);
		const vendredi = jourDe(today) === 5;
		const pasDIqama = '–';
		expect(lignes(html, 'aujourdhui')).toEqual([
			[PRIERES[langue][0], HEURES.fajr, IQAMAS.fajr],
			[PRIERES[langue][1], HEURES.dhuhr, vendredi ? VENDREDI_A[langue] : IQAMAS.dhuhr],
			[PRIERES[langue][2], HEURES.asr, pasDIqama],
			[PRIERES[langue][3], HEURES.maghrib, IQAMAS.maghrib],
			[PRIERES[langue][4], HEURES.isha, IQAMAS.isha]
		]);
		// Le titre porte la date du jour, en JJ.MM.AAAA et précédée du nom du jour.
		const titres = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((trouve) =>
			lu(trouve[1] ?? '')
		);
		expect(titres).toContain(AUJOURDHUI[langue](jourEtDate(langue, today)));
	});

	it.each(LANGUES)(
		'lists the next seven days, in %s, with the Friday prayer in place of Dhuhr',
		async (langue) => {
			const { html } = await servir(`${base(langue)}?vue=prieres`);
			const semaine = lignes(html, 'semaine');
			const dates = Array.from({ length: 7 }, (_, pas) => addDays(today, pas));
			expect(semaine.map((ligne) => ligne[0])).toEqual(
				dates.map((date) => jourEtDate(langue, date))
			);
			for (const [index, date] of dates.entries()) {
				const vendredi = jourDe(date) === 5;
				expect(semaine[index]?.slice(1), date).toEqual([
					`${HEURES.fajr} ${IQAMAS.fajr}`,
					vendredi ? `${HEURES.dhuhr} 12:30 13:45` : `${HEURES.dhuhr} ${IQAMAS.dhuhr}`,
					HEURES.asr,
					`${HEURES.maghrib} ${IQAMAS.maghrib}`,
					`${HEURES.isha} ${IQAMAS.isha}`
				]);
			}
			// L'en-tête des colonnes nomme chaque prière dans la langue de la page.
			const tete = html.match(/<table\b[^>]*\bclass="semaine\b[\s\S]*?<\/thead>/)?.[0] ?? '';
			expect(
				[...tete.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)]
					.map((trouve) => lu(trouve[1] ?? ''))
					.slice(1)
			).toEqual(PRIERES[langue]);
		}
	);

	it.each(LANGUES)(
		'lists the Friday sessions with the languages of their sermon, in %s',
		async (langue) => {
			const { html } = await servir(`${base(langue)}?vue=prieres`);
			const section =
				html.match(/<section\b[^>]*\bid="prieres-vendredi"[\s\S]*?<\/section>/)?.[0] ?? '';
			expect(section, 'la section du vendredi manque').not.toBe('');
			expect(
				[...section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((trouve) => lu(trouve[1] ?? ''))
			).toEqual(SERMONS[langue]);
		}
	);

	it('shows no tab where the module is off, and the week view for a prayer address', async () => {
		const { html } = await servir(`/m/${SLUG_SANS}/en`);
		expect(vues(html).map((vue) => vue.nom)).toEqual(['Week', 'All courses', 'Month']);
		const demande = await servir(`/m/${SLUG_SANS}/en?vue=prieres`);
		expect(demande.statut).toBe(200);
		expect(demande.html).not.toMatch(/<table\b[^>]*\bclass="(aujourdhui|semaine)\b/);
		expect(visibleText(demande.html)).toContain(`${NOM_SANS} | This week’s courses`);
	});

	it('names the tab in the title of the page', async () => {
		const titres = await Promise.all(
			LANGUES.map(async (langue) => {
				const { html } = await servir(`${base(langue)}?vue=prieres`);
				return lu(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
			})
		);
		expect(titres).toEqual([
			`${NOM} | Heures de prière`,
			`${NOM} | Gebetszeiten`,
			`${NOM} | Orari delle preghiere`,
			`${NOM} | Prayer times`,
			`${NOM} | مواقيت الصلاة`
		]);
	});

	// Le widget ne dessine rien : il pose un cadre vers la page publique (ADR 0005). L'onglet doit donc
	// se trouver dans la page intégrée, et y mener sans perdre le mode intégré.
	it('appears in the frame of the widget, and opens there with the embed script', async () => {
		const { html } = await servir(`/m/${SLUG}?embed=1`);
		const onglet = vues(html)[3];
		expect(onglet?.nom).toBe('Prières');
		const cible = new URL(onglet?.href ?? '', `${origin}/m/${SLUG}?embed=1`);
		// `embed.js` ajoute `embed=1` à tout lien de la même origine qu'on suit dans le cadre.
		cible.searchParams.set('embed', '1');
		const dedans = await servir(`${cible.pathname}${cible.search}`);
		expect(dedans.statut).toBe(200);
		const scripts = [...dedans.html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)];
		expect(scripts).toHaveLength(1);
		expect(new URL(scripts[0]?.[1] ?? '', cible).pathname).toBe('/widget/embed.js');
		expect(lignes(dedans.html, 'aujourdhui')).toHaveLength(5);
		// Et le widget encadre bien cette page : l'adresse qu'il pose est celle de l'organisation.
		const widget = await (await fetch(`${origin}/widget/jadwal-widget.js`)).text();
		expect(widget).toContain('/m/');
	});
});

// ---------------------------------------------------------------------------------------------
// E1 et E2 : l'agenda selon l'appareil
// ---------------------------------------------------------------------------------------------

/**
 * Une adresse de lien telle qu'un navigateur la suit depuis la page : SvelteKit écrit les liens de la
 * même origine en relatif (`../../m/…`). Une adresse d'ailleurs, ou `webcal:`, reste telle quelle.
 */
function suivi(href: string, depuis: string): string {
	if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
	const url = new URL(href, `${origin}${depuis}`);
	return `${url.pathname}${url.search}${url.hash}`;
}

/** Le bloc d'abonnement d'une page : l'appareil qu'il sert, et ses liens dans l'ordre. */
function abonnement(
	html: string,
	depuis: string
): {
	appareil: string;
	liens: { href: string; texte: string; cible: string | undefined }[];
	lu: string;
	code: string[];
} {
	const trouve = html.match(
		/<div\b[^>]*\bclass="abonnement\b[^"]*"[^>]*\bdata-appareil="([a-z]+)"[^>]*>([\s\S]*?)<\/div>/
	);
	const bloc = trouve?.[2] ?? '';
	return {
		appareil: trouve?.[1] ?? '',
		liens: [...bloc.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((lien) => {
			const attrs = attributs(`<a${lien[1]}>`);
			return {
				href: suivi((attrs['href'] ?? '').replaceAll('&amp;', '&'), depuis),
				texte: lu(lien[2] ?? ''),
				cible: attrs['target']
			};
		}),
		lu: lu(bloc),
		code: [...bloc.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/g)].map((code) =>
			lu(code[1] ?? '').replaceAll('&amp;', '&')
		)
	};
}

const hote = new URL(origin).host;
const fluxHttps = (langue: Langue) =>
	`${origin}/m/${SLUG}/agenda.ics${langue === 'fr' ? '' : `?lang=${langue}`}`;
const fluxWebcal = (langue: Langue) => fluxHttps(langue).replace(/^https?:/, 'webcal:');
const fluxCoursHttps = (langue: Langue, id: string) =>
	`${origin}/m/${SLUG}/agenda/${id}.ics${langue === 'fr' ? '' : `?lang=${langue}`}`;
const fluxCoursWebcal = (langue: Langue, id: string) =>
	fluxCoursHttps(langue, id).replace(/^https?:/, 'webcal:');
/** Les deux liens, recomposés ici sans le code qu'on éprouve. */
const google = (webcal: string) =>
	`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
const outlook = (webcal: string, nom: string) =>
	`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(webcal)}&name=${encodeURIComponent(nom)}`;

const DELAI_GOOGLE: Record<Langue, string> = {
	fr: 'Google peut mettre jusqu’à 24 heures à rafraîchir un abonnement.',
	de: 'Google kann bis zu 24 Stunden brauchen, um ein Abo zu aktualisieren.',
	it: 'Google può impiegare fino a 24 ore per aggiornare un’iscrizione.',
	en: 'Google can take up to 24 hours to refresh a subscription.',
	ar: 'قد يستغرق Google حتى 24 ساعة لتحديث الاشتراك.'
};
const AUTRE_APPAREIL: Record<Langue, string> = {
	fr: 'Un autre appareil ? Voir tous les choix',
	de: 'Ein anderes Gerät? Alle Möglichkeiten anzeigen',
	it: 'Un altro dispositivo? Vedi tutte le possibilità',
	en: 'Another device? See all the options',
	ar: 'جهاز آخر؟ اعرض كل الخيارات'
};

describe('l’abonnement selon l’appareil, sur la page d’abonnement (E1)', () => {
	it.each([
		['an iPhone', { 'user-agent': AGENTS.iphone }],
		['an iPad', { 'user-agent': AGENTS.ipad }],
		['an iPad that says Macintosh', { 'user-agent': AGENTS.ipadOs }],
		['a Mac with Chrome', { 'user-agent': AGENTS.ipadOs, 'sec-ch-ua-platform': '"macOS"' }]
	])('offers the webcal link first to %s, then the full choice', async (_nom, visiteur) => {
		const { statut, html } = await servir(`/m/${SLUG}/en/agenda`, visiteur);
		expect(statut).toBe(200);
		const bloc = abonnement(html, `/m/${SLUG}/en/agenda`);
		expect(bloc.appareil).toBe('apple');
		expect(bloc.liens.map((lien) => [lien.href, lien.texte])).toEqual([
			[fluxWebcal('en'), 'Add to my calendar'],
			[`/m/${SLUG}/en/agenda?appareil=tous`, AUTRE_APPAREIL.en]
		]);
		expect(bloc.code).toEqual([fluxHttps('en')]);
		expect(html).not.toContain('calendar.google.com');
	});

	it('opens Google Calendar with the subscription ready on Android, in a new tab', async () => {
		for (const visiteur of [ANDROID, { 'user-agent': AGENTS.android }]) {
			const { html } = await servir(`/m/${SLUG}/agenda`, visiteur);
			const bloc = abonnement(html, `/m/${SLUG}/agenda`);
			expect(bloc.appareil).toBe('android');
			expect(bloc.liens.map((lien) => [lien.href, lien.texte, lien.cible])).toEqual([
				[google(fluxWebcal('fr')), 'Ajouter à Google Agenda', '_blank'],
				[`/m/${SLUG}/agenda?appareil=tous`, AUTRE_APPAREIL.fr, undefined]
			]);
			expect(google(fluxWebcal('fr'))).toContain(`cid=webcal%3A%2F%2F${encodeURIComponent(hote)}`);
			expect(bloc.lu).toContain(DELAI_GOOGLE.fr);
		}
	});

	it('offers the full choice elsewhere: Google, Outlook, another app, and the address to copy', async () => {
		for (const visiteur of [WINDOWS, {}]) {
			const { html } = await servir(`/m/${SLUG}/de/agenda`, visiteur);
			const bloc = abonnement(html, `/m/${SLUG}/de/agenda`);
			expect(bloc.appareil).toBe('autre');
			expect(bloc.liens.map((lien) => [lien.href, lien.texte, lien.cible])).toEqual([
				[google(fluxWebcal('de')), 'Google Kalender', '_blank'],
				[outlook(fluxWebcal('de'), NOM), 'Outlook', '_blank'],
				[fluxWebcal('de'), 'Eine andere App', undefined]
			]);
			expect(bloc.code).toEqual([fluxHttps('de')]);
			expect(bloc.lu).toContain('Die Adresse kopieren');
			expect(bloc.lu).not.toContain(AUTRE_APPAREIL.de);
		}
	});

	it('gives the full choice to an iPhone that asks for it', async () => {
		const bloc = abonnement(
			(await servir(`/m/${SLUG}/agenda?appareil=tous`, IPHONE)).html,
			`/m/${SLUG}/agenda?appareil=tous`
		);
		expect(bloc.appareil).toBe('autre');
		expect(bloc.liens.map((lien) => lien.href)).toEqual([
			google(fluxWebcal('fr')),
			outlook(fluxWebcal('fr'), NOM),
			fluxWebcal('fr')
		]);
	});

	it('links each course the way of the device: webcal, Google, or its own page', async () => {
		const lienDuCours = async (visiteur: Visiteur, suite = '') => {
			const { html } = await servir(`/m/${SLUG}/en/agenda${suite}`, visiteur);
			const liste = html.match(/<ul\b[^>]*\bclass="cours\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? '';
			return [...liste.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
				.filter((lien) => lu(lien[2] ?? '') === TITRES.quotidien)
				.map((lien) =>
					suivi(
						(attributs(`<a${lien[1]}>`)['href'] ?? '').replaceAll('&amp;', '&'),
						`/m/${SLUG}/en/agenda${suite}`
					)
				);
		};
		expect(await lienDuCours(IPHONE)).toEqual([fluxCoursWebcal('en', COURS.quotidien)]);
		expect(await lienDuCours(ANDROID)).toEqual([google(fluxCoursWebcal('en', COURS.quotidien))]);
		expect(await lienDuCours(WINDOWS)).toEqual([`/m/${SLUG}/en/cours/${COURS.quotidien}#agenda`]);
		expect(await lienDuCours(IPHONE, '?appareil=tous')).toEqual([
			`/m/${SLUG}/en/cours/${COURS.quotidien}?appareil=tous#agenda`
		]);
	});

	it('says in its Vary header which request headers it read, and keeps its cache', async () => {
		const { headers } = await servir(`/m/${SLUG}/agenda`, IPHONE);
		const vary = (headers.get('vary') ?? '').toLowerCase().split(/\s*,\s*/);
		expect(vary).toEqual(expect.arrayContaining(['sec-ch-ua-platform', 'user-agent']));
		expect(headers.get('cache-control')).toBe('public, max-age=300, stale-while-revalidate=86400');
		// Le choix complet ne dépend pas de l'appareil : sa réponse ne le dit pas.
		const tous = await servir(`/m/${SLUG}/agenda?appareil=tous`, IPHONE);
		expect((tous.headers.get('vary') ?? '').toLowerCase()).not.toContain('user-agent');
	});
});

describe('« Ajouter ce cours à mon agenda » selon l’appareil (E1)', () => {
	const chemin = (langue: Langue) => `${base(langue)}/cours/${COURS.quotidien}`;

	it('offers the course feed in webcal on an iPhone, in Google on Android, and the choice elsewhere', async () => {
		const iphone = abonnement((await servir(chemin('it'), IPHONE)).html, chemin('it'));
		expect(iphone.appareil).toBe('apple');
		expect(iphone.liens.map((lien) => [lien.href, lien.texte])).toEqual([
			[fluxCoursWebcal('it', COURS.quotidien), 'Aggiungi al mio calendario'],
			[`/m/${SLUG}/it/cours/${COURS.quotidien}?appareil=tous#agenda`, AUTRE_APPAREIL.it]
		]);
		expect(iphone.code).toEqual([fluxCoursHttps('it', COURS.quotidien)]);

		const android = abonnement((await servir(chemin('it'), ANDROID)).html, chemin('it'));
		expect(android.appareil).toBe('android');
		expect(android.liens[0]).toEqual({
			href: google(fluxCoursWebcal('it', COURS.quotidien)),
			texte: 'Aggiungi a Google Calendar',
			cible: '_blank'
		});
		expect(android.lu).toContain(DELAI_GOOGLE.it);

		const windows = abonnement((await servir(chemin('it'), WINDOWS)).html, chemin('it'));
		expect(windows.appareil).toBe('autre');
		expect(windows.liens.map((lien) => lien.href)).toEqual([
			google(fluxCoursWebcal('it', COURS.quotidien)),
			outlook(fluxCoursWebcal('it', COURS.quotidien), `${NOM} – ${TITRES.quotidien}`),
			fluxCoursWebcal('it', COURS.quotidien)
		]);
		expect(windows.code).toEqual([fluxCoursHttps('it', COURS.quotidien)]);
	});

	it('keeps the heading « Add this course to my calendar » above the choice, with an anchor', async () => {
		const { html } = await servir(chemin('en'), IPHONE);
		const section =
			html.match(/<section\b[^>]*\bid="agenda"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? '';
		expect(lu(section.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? '')).toBe(
			'Add this course to my calendar'
		);
	});

	it('varies with the device, and keeps the cache of the programme', async () => {
		const { headers } = await servir(chemin('fr'), ANDROID);
		const vary = (headers.get('vary') ?? '').toLowerCase().split(/\s*,\s*/);
		expect(vary).toEqual(expect.arrayContaining(['sec-ch-ua-platform', 'user-agent']));
		expect(headers.get('cache-control')).toBe('public, max-age=120, stale-while-revalidate=86400');
	});
});

describe('le délai de Google, dans les textes d’aide (E2)', () => {
	it.each(LANGUES)('says in %s that Google can take up to 24 hours', async (langue) => {
		// Sur Android, sous le bouton ; ailleurs, sous le choix de Google ; et dans les étapes à la main.
		const android = await servir(`${base(langue)}/agenda`, ANDROID);
		expect(abonnement(android.html, `${base(langue)}/agenda`).lu).toContain(DELAI_GOOGLE[langue]);
		const ailleurs = await servir(`${base(langue)}/agenda`, WINDOWS);
		expect(abonnement(ailleurs.html, `${base(langue)}/agenda`).lu).toContain(DELAI_GOOGLE[langue]);
		const main =
			ailleurs.html.match(/<section\b[^>]*\bid="a-la-main"[\s\S]*?<\/section>/)?.[0] ?? '';
		expect(lu(main)).toContain(DELAI_GOOGLE[langue]);
		const cours = await servir(`${base(langue)}/cours/${COURS.quotidien}`, ANDROID);
		expect(abonnement(cours.html, `${base(langue)}/cours/${COURS.quotidien}`).lu).toContain(
			DELAI_GOOGLE[langue]
		);
	});
});

// ---------------------------------------------------------------------------------------------
// La vue « Tous les cours » et une séance déplacée
// ---------------------------------------------------------------------------------------------

describe('la vue « Tous les cours » et une séance déplacée ailleurs', () => {
	/** La ligne des prochaines séances d'un cours de la vue. */
	function prochaines(html: string, courseId: string): string {
		const debut = html.indexOf(`id="cours-${courseId}"`);
		expect(debut, `le cours ${courseId} manque à la vue`).toBeGreaterThan(-1);
		const bloc = html.slice(debut, html.indexOf('</details>', debut));
		return lu(bloc.match(/<p class="details[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? '');
	}

	it('no longer counts the session that moved away, and counts it on its new date', async () => {
		const suivantes = [APRES_DEMAIN, addDays(DEMAIN, 7), addDays(DEMAIN, 14)];
		const { html } = await servir(`${base('en')}?vue=cours`);
		expect(prochaines(html, COURS.deplace)).toBe(
			`Upcoming sessions: ${suivantes.map((date) => jourEtDate('en', date)).join(', ')}`
		);
		const francais = await servir(`${base('fr')}?vue=cours`);
		expect(prochaines(francais.html, COURS.deplace)).toBe(
			`Prochaines séances : ${suivantes.map((date) => jourEtDate('fr', date)).join(', ')}`
		);
	});

	it('still shows it in the week view, struck through, with where it went', async () => {
		const { html } = await servir(base('en'));
		expect(visibleText(html)).toContain(`Moved to ${jourEtDate('en', APRES_DEMAIN)}`);
	});
});

// ---------------------------------------------------------------------------------------------
// D2 et A3 : chaque écran touché, dans les cinq langues
// ---------------------------------------------------------------------------------------------

/**
 * Ce qui est pareil dans toutes les langues par nature : les noms et les titres saisis, et le titre
 * de l'onglet d'une page de cours, qui n'est fait que d'eux.
 */
const PERMIS = [NOM, TITRES.deplace, TITRES.quotidien, 'Jumu’a', `${TITRES.quotidien} | ${NOM}`];

const ECRANS: { nom: string; suite: string; visiteur: Visiteur }[] = [
	{ nom: 'prayer tab', suite: '?vue=prieres', visiteur: {} },
	{ nom: 'subscription on an iPhone', suite: '/agenda', visiteur: IPHONE },
	{ nom: 'subscription on Android', suite: '/agenda', visiteur: ANDROID },
	{ nom: 'subscription elsewhere', suite: '/agenda', visiteur: WINDOWS },
	{ nom: 'full choice', suite: '/agenda?appareil=tous', visiteur: IPHONE },
	{ nom: 'course on an iPhone', suite: `/cours/${COURS.quotidien}`, visiteur: IPHONE },
	{ nom: 'course on Android', suite: `/cours/${COURS.quotidien}`, visiteur: ANDROID },
	{ nom: 'course elsewhere', suite: `/cours/${COURS.quotidien}`, visiteur: WINDOWS },
	{ nom: 'all courses', suite: '?vue=cours', visiteur: {} }
];

/**
 * La page publique porte sa langue sur le bloc qui l'enveloppe : `<div lang="fr" class="page">`.
 * `frenchLeft` retire de la page française tout bloc en `lang="fr"`, pour laisser de côté les
 * conditions, qui restent en français ; sur une page publique, il retirait donc la page entière, et
 * ne comparait plus que le titre de l'onglet. Un mutant l'a montré : une phrase française posée dans
 * le dictionnaire arabe passait. On retire ici l'attribut du seul bloc de la page.
 */
function sansLaLangueDeLaPage(html: string): string {
	return html.replace(/<div\b[^>]*\bclass="page\b[^"]*"[^>]*>/, (balise) =>
		balise.replace(/\slang="[a-z]{2}"/, '')
	);
}

describe('chaque écran touché, dans les cinq langues (D2, A3)', () => {
	const CAS = ECRANS.flatMap((ecran) =>
		(['de', 'it', 'en', 'ar'] as const).map((langue) => ({ ...ecran, langue }))
	);

	it.each(CAS)(
		'serves the $nom in $langue, in its direction, with no French left and no AAAA-MM-JJ date',
		async ({ suite, visiteur, langue }) => {
			const francais = await servir(`${base('fr')}${suite}`, visiteur);
			const autre = await servir(`${base(langue)}${suite}`, visiteur);
			expect(francais.statut).toBe(200);
			expect(autre.statut).toBe(200);
			expect(autre.html.match(/<html\b[^>]*>/g)).toEqual([
				`<html lang="${langue}" dir="${SENS[langue]}">`
			]);
			expect(
				frenchLeft(sansLaLangueDeLaPage(francais.html), sansLaLangueDeLaPage(autre.html), PERMIS)
			).toEqual([]);
			// Et la comparaison lit bien le corps de la page : sans cela, deux listes vides seraient
			// « égales » et le test ne dirait rien.
			expect(
				[...textSegments(sansLaLangueDeLaPage(francais.html), 'fr')].length,
				'le texte français comparé'
			).toBeGreaterThan(20);
			const texte = visibleText(autre.html);
			expect(texte.match(ISO_DATE)?.[0] ?? null, 'une date AAAA-MM-JJ dans le texte lu').toBeNull();
			expect(visibleText(francais.html).match(ISO_DATE)?.[0] ?? null).toBeNull();
		}
	);

	it('writes every date of the prayer tab as JJ.MM.AAAA', async () => {
		for (const langue of LANGUES) {
			const texte = visibleText((await servir(`${base(langue)}?vue=prieres`)).html);
			for (let pas = 0; pas < 7; pas += 1) {
				expect(texte, langue).toContain(jourEtDate(langue, addDays(today, pas)));
			}
		}
	});
});

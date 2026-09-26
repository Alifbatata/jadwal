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
/**
 * Une organisation dont le vendredi des sept jours a changé : une session annulée, une déplacée le
 * même jour, une déplacée au vendredi suivant (relecture du lot 3).
 */
const SLUG_CHANGE = 'vendredi-change';
const NOM_CHANGE = 'Association du vendredi changé';
const DEBUT = '2026-09-07';

const today = todayInZone(FUSEAU, new Date());
/** Le lendemain, et son jour de semaine : le cours déplacé a lieu ce jour-là chaque semaine. */
const DEMAIN = addDays(today, 1);
const APRES_DEMAIN = addDays(today, 2);
/** Le vendredi des sept jours de l'onglet : il y en a toujours un, et un seul. */
const VENDREDI = Array.from({ length: 7 }, (_, pas) => addDays(today, pas)).find(
	(date) => weekdayFromDays(isoDateToDays(date)) === 5
) as IsoDate;
const VENDREDI_SUIVANT = addDays(VENDREDI, 7);

/** Les heures importées, et les iqamas de la période saisie : fixes, pour qu'elles se lisent ici. */
const HEURES = { fajr: '05:30', dhuhr: '13:05', asr: '16:30', maghrib: '19:10', isha: '20:40' };
/** L'iqama de chaque prière : deux heures fixes, deux décalages, et l'Asr sans iqama. */
const IQAMAS = { fajr: '05:50', dhuhr: '13:15', asr: null, maghrib: '19:15', isha: '20:55' };
/** Les deux sessions du vendredi et les langues de leur sermon. */
const SESSIONS = [
	{ ordre: 1, debut: '12:30', fin: '13:10', langues: ['ar', 'fr'] },
	{ ordre: 2, debut: '13:45', fin: '14:25', langues: ['de'] }
];
/** La troisième session du vendredi changé, déplacée au vendredi suivant. */
const TROISIEME = { ordre: 3, debut: '15:00', fin: '15:40', langues: ['en'] };

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
	const change = newId();
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
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language", "prayer_module")
			values (${change}, ${SLUG_CHANGE}, ${NOM_CHANGE}, ${FUSEAU}, 'fr',
				array['fr','de','it','en','ar'], true)
		`);
		for (const avecPrieres of [organisation, change]) {
			for (let pas = -2; pas <= 10; pas += 1) {
				await tx.execute(sql`
					insert into "prayer_day" ("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib",
						"isha", "source")
					values (${avecPrieres}, ${addDays(today, pas)}, ${HEURES.fajr}, ${HEURES.dhuhr},
						${HEURES.asr}, ${HEURES.maghrib}, ${HEURES.isha}, 'import')
				`);
			}
			// Les iqamas, par une période saisie : deux heures fixes et deux décalages, l'Asr sans rien.
			await tx.execute(sql`
				insert into "prayer_period" ("id", "organization_id", "name", "from_date", "to_date",
					"fajr_iqama", "dhuhr_iqama_offset", "maghrib_iqama_offset", "isha_iqama")
				values (${newId()}, ${avecPrieres}, 'Automne', ${addDays(today, -2)},
					${addDays(today, 10)}, '05:50', 10, 5, '20:55')
			`);
		}
		const sessionDuVendredi = async (
			orgId: string,
			session: { ordre: number; debut: string; fin: string; langues: string[] }
		) => {
			const id = newId();
			await tx.execute(sql`
				insert into "course" ("id", "organization_id", "kind", "jumua_order", "status", "audience",
					"teaching_language", "source_language", "recurrence_kind", "recurrence_weekday",
					"recurrence_interval", "recurrence_anchor_date", "timing_kind", "timing_start",
					"timing_end", "starts_on")
				values (${id}, ${orgId}, 'jumua', ${session.ordre}, 'published', 'open',
					${sql.raw(`array[${session.langues.map((langue) => `'${langue}'`).join(',')}]`)}, 'fr',
					'weekly', array[5]::smallint[], 1, ${DEBUT}, 'fixed', ${session.debut}, ${session.fin},
					${DEBUT})
			`);
			await tx.execute(sql`
				insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
				values (${newId()}, ${orgId}, ${id}, 'fr', 'Jumu’a')
			`);
			return id;
		};
		for (const session of SESSIONS) await sessionDuVendredi(organisation, session);
		// Le vendredi changé : les deux mêmes sessions, et une troisième.
		const ids: string[] = [];
		for (const session of [...SESSIONS, TROISIEME]) {
			ids.push(await sessionDuVendredi(change, session));
		}
		const [premiere, deuxieme, troisieme] = ids as [string, string, string];
		// Comme les gestes « Annuler » et « Déplacer » de l'écran du vendredi, ce vendredi-là seulement.
		await tx.execute(sql`
			insert into "session_exception" ("id", "organization_id", "course_id", "date", "kind",
				"to_date", "to_start")
			values
				(${newId()}, ${change}, ${premiere}, ${VENDREDI}, 'cancelled', null, null),
				(${newId()}, ${change}, ${deuxieme}, ${VENDREDI}, 'moved', ${VENDREDI}, '14:15'),
				(${newId()}, ${change}, ${troisieme}, ${VENDREDI}, 'moved', ${VENDREDI_SUIVANT}, '15:00')
		`);
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
/** « Prière du vendredi : 12:30 », une seule heure : celle d'une session qui n'a pas lieu. */
const VENDREDI_SEULE: Record<Langue, (heure: string) => string> = {
	fr: (heure) => `Prière du vendredi : ${heure}`,
	de: (heure) => `Freitagsgebet: ${heure}`,
	it: (heure) => `Preghiera del venerdì: ${heure}`,
	en: (heure) => `Friday prayer: ${heure}`,
	ar: (heure) => `صلاة الجمعة: ${heure}`
};
/** Les mots de la vue Semaine, repris par l'onglet pour une session qui n'a pas lieu. */
const ANNULE: Record<Langue, string> = {
	fr: 'Annulé',
	de: 'Abgesagt',
	it: 'Annullato',
	en: 'Cancelled',
	ar: 'ملغى'
};
const DEPLACE_AU: Record<Langue, (date: string) => string> = {
	fr: (date) => `Déplacé au ${date}`,
	de: (date) => `Verschoben auf ${date}`,
	it: (date) => `Spostato al ${date}`,
	en: (date) => `Moved to ${date}`,
	ar: (date) => `نُقل إلى ${date}`
};
/** L'en-tête de la colonne des sept jours. */
const COLONNE_DES_JOURS: Record<Langue, string> = {
	fr: 'Jour',
	de: 'Tag',
	it: 'Giorno',
	en: 'Day',
	ar: 'التاريخ'
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

	// Relecture du lot 3 : l'onglet mettait chaque session sur chaque vendredi daté, même annulée ou
	// déplacée ce jour-là depuis l'écran du vendredi, quand la vue Semaine disait « Annulé ».
	it.each(LANGUES)(
		'follows that Friday in %s: a session cancelled, one moved that day, one moved a week later',
		async (langue) => {
			const { statut, html } = await servir(`${base(langue, SLUG_CHANGE)}?vue=prieres`);
			expect(statut).toBe(200);
			const semaine = lignes(html, 'semaine');
			const dates = Array.from({ length: 7 }, (_, pas) => addDays(today, pas));
			const deplace = DEPLACE_AU[langue](jourEtDate(langue, VENDREDI_SUIVANT));
			for (const [index, date] of dates.entries()) {
				expect(semaine[index]?.[2], date).toBe(
					date === VENDREDI
						? `${HEURES.dhuhr} 14:15 12:30 ${ANNULE[langue]} 15:00 ${deplace}`
						: `${HEURES.dhuhr} ${IQAMAS.dhuhr}`
				);
			}
			// Le tableau du jour, quand c'est ce vendredi ; `src/lib/public/Prieres.test.ts` l'éprouve
			// un vendredi choisi, quel que soit le jour où ce test tourne.
			if (today === VENDREDI) {
				const seule = VENDREDI_SEULE[langue];
				expect(lignes(html, 'aujourdhui')[1]?.[2]).toBe(
					`${seule('14:15')} ${seule('12:30')} ${ANNULE[langue]} ${seule('15:00')} ${deplace}`
				);
			}
			// Le bloc du bas, sans date, garde le rythme habituel.
			const section =
				html.match(/<section\b[^>]*\bid="prieres-vendredi"[\s\S]*?<\/section>/)?.[0] ?? '';
			expect(
				[...section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(
					(trouve) => lu(trouve[1] ?? '').split(' ')[0]
				)
			).toEqual(['12:30', '13:45', '15:00']);
			// Et la vue Semaine de la même page dit la même chose.
			const vueSemaine = visibleText((await servir(base(langue, SLUG_CHANGE))).html);
			expect(vueSemaine).toContain(ANNULE[langue]);
			expect(vueSemaine).toContain(deplace);
		}
	);

	// En arabe, « اليوم » était à la fois le titre « Aujourd'hui » et l'en-tête de la colonne des sept
	// jours, où il se lisait « aujourd'hui » au-dessus de sept dates.
	it.each(LANGUES)('names the day column with a word of its own, in %s', async (langue) => {
		const { html } = await servir(`${base(langue)}?vue=prieres`);
		const tete = html.match(/<table\b[^>]*\bclass="semaine\b[\s\S]*?<\/thead>/)?.[0] ?? '';
		const colonne = lu(tete.match(/<th\b[^>]*>([\s\S]*?)<\/th>/)?.[1] ?? '');
		expect(colonne).toBe(COLONNE_DES_JOURS[langue]);
		expect(AUJOURDHUI[langue]('').startsWith(colonne)).toBe(false);
	});

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
// Relecture du lot 3 : chaque page d'abonnement ne dit que ce qui est vrai pour elle
// ---------------------------------------------------------------------------------------------

/**
 * Ce que la page d'Android affirmait, et qui se contredisait : sous le bouton, que Google Agenda
 * s'ouvre dans le navigateur et propose d'ajouter l'agenda ; plus bas, que l'application du
 * téléphone ne sait pas ajouter un abonnement. L'aide de Google (answer 37100) dit qu'il faut le
 * navigateur d'un ordinateur.
 */
const AFFIRMATIONS_CONTRAIRES: Record<Langue, [string, string]> = {
	fr: [
		'Google Agenda s’ouvre dans votre navigateur et propose d’ajouter l’agenda',
		'l’application du téléphone ne sait pas ajouter un abonnement'
	],
	de: [
		'Google Kalender öffnet sich im Browser und bietet an, den Kalender hinzuzufügen',
		'Die Telefon-App kann keine Abos hinzufügen'
	],
	it: [
		'Google Calendar si apre nel browser e propone di aggiungere il calendario',
		'l’app del telefono non sa aggiungere un’iscrizione'
	],
	en: [
		'Google Calendar opens in your browser and offers to add the calendar',
		'the phone app cannot add a subscription'
	],
	ar: ['يُفتح تقويم Google في المتصفح ويقترح إضافة التقويم', 'تطبيق الهاتف لا يضيف الاشتراكات']
};
/** Sous le bouton d'Android : ce que fait le bouton, sans promettre ce que Google fera. */
const AIDE_DU_BOUTON_GOOGLE: Record<Langue, string> = {
	fr: 'Touchez le bouton : il ouvre Google Agenda et lui demande d’ajouter cet agenda. Si Google Agenda propose de l’ajouter, confirmez.',
	de: 'Tippen Sie auf die Schaltfläche: Sie öffnet Google Kalender und bittet darum, diesen Kalender hinzuzufügen. Wenn Google Kalender es Ihnen anbietet, bestätigen Sie.',
	it: 'Tocca il pulsante: apre Google Calendar e gli chiede di aggiungere questo calendario. Se Google Calendar te lo propone, conferma.',
	en: 'Tap the button: it opens Google Calendar and asks it to add this calendar. If Google Calendar offers to do so, confirm.',
	ar: 'اضغط على الزر: يفتح تقويم Google ويطلب منه إضافة هذا التقويم. إن اقترح عليك تقويم Google ذلك، فأكّد.'
};
/** Puis ce qu'il faut faire si Google Agenda ne propose rien sur le téléphone. */
const PAR_UN_ORDINATEUR: Record<Langue, string> = {
	fr: 'Si Google Agenda ne propose rien sur votre téléphone, passez par un ordinateur : selon Google, on ne peut ajouter un agenda par son adresse que depuis le navigateur d’un ordinateur. Ouvrez-y Google Agenda, puis, dans Autres agendas, choisissez À partir de l’URL et collez l’adresse ci-dessous. L’agenda apparaîtra ensuite aussi sur votre téléphone.',
	de: 'Wenn Google Kalender auf Ihrem Telefon nichts anbietet, nehmen Sie einen Computer: Laut Google lässt sich ein Kalender über seine Adresse nur im Browser eines Computers hinzufügen. Öffnen Sie dort Google Kalender, wählen Sie unter Weitere Kalender die Option Per URL und fügen Sie die Adresse unten ein. Danach erscheint der Kalender auch auf Ihrem Telefon.',
	it: 'Se Google Calendar non propone nulla sul telefono, usa un computer: secondo Google, un calendario si può aggiungere tramite indirizzo solo dal browser di un computer. Apri lì Google Calendar, in Altri calendari scegli Da URL e incolla l’indirizzo qui sotto. Il calendario comparirà poi anche sul telefono.',
	en: 'If Google Calendar offers nothing on your phone, use a computer: according to Google, a calendar can only be added by its address in a computer’s web browser. Open Google Calendar there, choose From URL under Other calendars, and paste the address below. The calendar will then appear on your phone too.',
	ar: 'إن لم يقترح تقويم Google شيئًا على هاتفك، فاستعن بحاسوب: حسب Google، لا يمكن إضافة تقويم عن طريق عنوانه إلا من متصفح على الحاسوب. افتح فيه تقويم Google، ومن التقاويم الأخرى اختر من عنوان URL، ثم الصق العنوان أدناه. سيظهر التقويم بعدها على هاتفك أيضًا.'
};
/** Les étapes « Sur Android », qui disent la même chose. */
const ETAPES_ANDROID: Record<Langue, string> = {
	fr: 'Selon Google, on ne peut ajouter un agenda par son adresse que depuis le navigateur d’un ordinateur. Sur l’ordinateur, ouvrez Google Agenda, puis, dans Autres agendas, choisissez À partir de l’URL, collez l’adresse et ajoutez l’agenda. Il apparaîtra ensuite aussi sur votre téléphone.',
	de: 'Laut Google lässt sich ein Kalender über seine Adresse nur im Browser eines Computers hinzufügen. Öffnen Sie am Computer Google Kalender, wählen Sie unter Weitere Kalender die Option Per URL, fügen Sie die Adresse ein und fügen Sie den Kalender hinzu. Danach erscheint er auch auf Ihrem Telefon.',
	it: 'Secondo Google, un calendario si può aggiungere tramite indirizzo solo dal browser di un computer. Dal computer apri Google Calendar, in Altri calendari scegli Da URL, incolla l’indirizzo e aggiungi il calendario. Comparirà poi anche sul telefono.',
	en: 'According to Google, a calendar can only be added by its address in a computer’s web browser. On the computer, open Google Calendar, choose From URL under Other calendars, paste the address, then add the calendar. It will then appear on your phone too.',
	ar: 'حسب Google، لا يمكن إضافة تقويم عن طريق عنوانه إلا من متصفح على الحاسوب. افتح تقويم Google على الحاسوب، ومن التقاويم الأخرى اختر من عنوان URL، الصق العنوان ثم أضف التقويم. سيظهر بعدها على هاتفك أيضًا.'
};
/** Les phrases qui parlaient d'un bouton sur le choix complet, qui n'en a pas. */
const SI_LE_BOUTON: Record<Langue, string> = {
	fr: 'Si le bouton ne fait rien, copiez l’adresse et suivez les étapes de votre application.',
	de: 'Wenn die Schaltfläche nichts bewirkt, kopieren Sie die Adresse und folgen Sie den Schritten Ihrer App.',
	it: 'Se il pulsante non fa nulla, copia l’indirizzo e segui i passaggi della tua app.',
	en: 'If the button does nothing, copy the address and follow the steps for your app.',
	ar: 'إن لم يحدث شيء عند الضغط على الزر، انسخ العنوان واتبع خطوات تطبيقك.'
};
const LE_BOUTON_CI_DESSUS: Record<Langue, string> = {
	fr: 'Touchez le bouton ci-dessus',
	de: 'Tippen Sie auf die Schaltfläche oben',
	it: 'Tocca il pulsante qui sopra',
	en: 'Tap the button above',
	ar: 'اضغط على الزر أعلاه'
};
/** L'introduction des étapes sur le choix complet, qui a quatre liens et aucun bouton. */
const SI_AUCUN_LIEN: Record<Langue, string> = {
	fr: 'Si aucun de ces liens ne fonctionne pour vous, copiez l’adresse et suivez les étapes de votre application.',
	de: 'Wenn keiner dieser Links für Sie funktioniert, kopieren Sie die Adresse und folgen Sie den Schritten Ihrer App.',
	it: 'Se nessuno di questi link funziona per te, copia l’indirizzo e segui i passaggi della tua app.',
	en: 'If none of these links works for you, copy the address and follow the steps for your app.',
	ar: 'إن لم ينجح معك أي من هذه الروابط، انسخ العنوان واتبع خطوات تطبيقك.'
};
/** Les étapes « Sur iPhone et iPad », sans le bouton : vraies sur toutes les pages. */
const ETAPES_IPHONE: Record<Langue, string> = {
	fr: 'Ouvrez Réglages, puis Applications, Calendrier, Comptes, Ajouter un compte, Autre, Ajouter un abonnement à un calendrier, et collez l’adresse.',
	de: 'Öffnen Sie Einstellungen, dann Apps, Kalender, Accounts, Account hinzufügen, Andere, Kalenderabo hinzufügen, und fügen Sie die Adresse ein.',
	it: 'Apri Impostazioni, poi App, Calendario, Account, Aggiungi account, Altro, Aggiungi calendario con iscrizione, e incolla l’indirizzo.',
	en: 'Open Settings, then Apps, Calendar, Calendar Accounts, Add Account, Other, Add Subscribed Calendar, and paste the address.',
	ar: 'افتح الإعدادات، ثم التطبيقات، التقويم، الحسابات، إضافة حساب، أخرى، إضافة اشتراك تقويم، والصق العنوان.'
};
/**
 * Le délai d'Outlook : Microsoft écrit qu'une mise à jour « can take more than 24 hours » (Import or
 * subscribe to a calendar in Outlook.com or Outlook on the web).
 */
const DELAI_OUTLOOK: Record<Langue, string> = {
	fr: 'Outlook peut mettre plus de 24 heures à rafraîchir un abonnement.',
	de: 'Outlook kann mehr als 24 Stunden brauchen, um ein Abo zu aktualisieren.',
	it: 'Outlook può impiegare più di 24 ore per aggiornare un’iscrizione.',
	en: 'Outlook can take more than 24 hours to refresh a subscription.',
	ar: 'قد يستغرق Outlook أكثر من 24 ساعة لتحديث الاشتراك.'
};

/** La section des étapes à la main : son introduction, puis chaque titre suivi de ses paragraphes. */
function aLaMain(html: string): { intro: string; etapes: Record<string, string[]>; lu: string } {
	const section =
		html.match(/<section\b[^>]*\bid="a-la-main"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? '';
	const paragraphes = [...section.matchAll(/<(h3|p)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((trouve) => ({
		balise: trouve[1],
		texte: lu(trouve[2] ?? '')
	}));
	const etapes: Record<string, string[]> = {};
	let titre = '';
	for (const { balise, texte } of paragraphes.slice(1)) {
		if (balise === 'h3') {
			titre = texte;
			etapes[titre] = [];
		} else etapes[titre]?.push(texte);
	}
	return { intro: paragraphes[0]?.texte ?? '', etapes, lu: lu(section) };
}

const SUR_IPHONE: Record<Langue, string> = {
	fr: 'Sur iPhone et iPad',
	de: 'Auf iPhone und iPad',
	it: 'Su iPhone e iPad',
	en: 'On iPhone and iPad',
	ar: 'على iPhone و iPad'
};
const SUR_ANDROID: Record<Langue, string> = {
	fr: 'Sur Android',
	de: 'Auf Android',
	it: 'Su Android',
	en: 'On Android',
	ar: 'على Android'
};
const SUR_OUTLOOK: Record<Langue, string> = {
	fr: 'Sur Outlook',
	de: 'In Outlook',
	it: 'Su Outlook',
	en: 'In Outlook',
	ar: 'على Outlook'
};

describe('chaque page d’abonnement ne dit que ce qui est vrai pour elle', () => {
	it.each(LANGUES)(
		'no longer contradicts itself on Android, in %s: the button, then a computer',
		async (langue) => {
			const chemin = `${base(langue)}/agenda`;
			const { html } = await servir(chemin, ANDROID);
			const page = lu(html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '');
			for (const affirmation of AFFIRMATIONS_CONTRAIRES[langue]) {
				expect(page, langue).not.toContain(affirmation);
			}
			const bloc = abonnement(html, chemin);
			expect(bloc.appareil).toBe('android');
			// Le bouton, ce qu'il fait, le délai, puis l'ordinateur et l'adresse à copier.
			expect(bloc.lu).toContain(
				`${AIDE_DU_BOUTON_GOOGLE[langue]} ${DELAI_GOOGLE[langue]} ${PAR_UN_ORDINATEUR[langue]}`
			);
			expect(bloc.code).toEqual([fluxHttps(langue)]);
			expect(aLaMain(html).etapes[SUR_ANDROID[langue]]).toEqual([
				ETAPES_ANDROID[langue],
				DELAI_GOOGLE[langue]
			]);
			// La page d'un cours, qui n'a pas d'étapes à la main, dit tout dans son bloc.
			const cours = `${base(langue)}/cours/${COURS.quotidien}`;
			const blocDuCours = abonnement((await servir(cours, ANDROID)).html, cours);
			expect(blocDuCours.lu).toContain(PAR_UN_ORDINATEUR[langue]);
			expect(blocDuCours.code).toEqual([fluxCoursHttps(langue, COURS.quotidien)]);
		}
	);

	it.each(LANGUES)('speaks of a button only where there is one, in %s', async (langue) => {
		const chemin = `${base(langue)}/agenda`;
		// Le choix complet n'a que des liens, qu'on le demande depuis un iPhone ou qu'on le reçoive
		// d'un ordinateur.
		for (const [suite, visiteur] of [
			['?appareil=tous', IPHONE],
			['', WINDOWS]
		] as const) {
			const main = aLaMain((await servir(`${chemin}${suite}`, visiteur)).html);
			expect(main.intro, `${langue} ${suite}`).toBe(SI_AUCUN_LIEN[langue]);
			expect(main.lu).not.toContain(LE_BOUTON_CI_DESSUS[langue]);
			expect(main.etapes[SUR_IPHONE[langue]]).toEqual([ETAPES_IPHONE[langue]]);
		}
		// Sur Android, le bouton est celui de Google : « le bouton ci-dessus » n'est pas celui qui
		// ouvre le calendrier de l'iPhone.
		const android = aLaMain((await servir(chemin, ANDROID)).html);
		expect(android.intro).toBe(SI_LE_BOUTON[langue]);
		expect(android.lu).not.toContain(LE_BOUTON_CI_DESSUS[langue]);
		expect(android.etapes[SUR_IPHONE[langue]]).toEqual([ETAPES_IPHONE[langue]]);
		// Sur un iPhone, le bouton existe : l'introduction en parle.
		const iphone = aLaMain((await servir(chemin, IPHONE)).html);
		expect(iphone.intro).toBe(SI_LE_BOUTON[langue]);
		expect(iphone.etapes[SUR_IPHONE[langue]]).toEqual([ETAPES_IPHONE[langue]]);
	});

	it.each(LANGUES)('says in %s that Outlook can take more than 24 hours', async (langue) => {
		const chemin = `${base(langue)}/agenda`;
		const { html } = await servir(chemin, WINDOWS);
		const choix = html.match(/<ul\b[^>]*\bclass="choix\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? '';
		const outlookLi = [...choix.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)]
			.map((trouve) => lu(trouve[1] ?? ''))
			.find((texte) => texte.startsWith('Outlook'));
		expect(outlookLi, langue).toContain(DELAI_OUTLOOK[langue]);
		expect(aLaMain(html).etapes[SUR_OUTLOOK[langue]]?.at(-1)).toBe(DELAI_OUTLOOK[langue]);
		// Et le délai de Google reste sous Google, pas sous Outlook.
		expect(outlookLi).not.toContain(DELAI_GOOGLE[langue]);
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
const PERMIS = [
	NOM,
	NOM_CHANGE,
	TITRES.deplace,
	TITRES.quotidien,
	'Jumu’a',
	`${TITRES.quotidien} | ${NOM}`
];

const ECRANS: { nom: string; suite: string; visiteur: Visiteur; slug?: string }[] = [
	{ nom: 'prayer tab', suite: '?vue=prieres', visiteur: {} },
	// Un vendredi changé : les mots « Annulé » et « Déplacé au », repris de la vue Semaine.
	{ nom: 'prayer tab of a changed Friday', suite: '?vue=prieres', visiteur: {}, slug: SLUG_CHANGE },
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
		async ({ suite, visiteur, langue, slug }) => {
			const francais = await servir(`${base('fr', slug)}${suite}`, visiteur);
			const autre = await servir(`${base(langue, slug)}${suite}`, visiteur);
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

	// Relecture du lot 3 : ce test lisait toute la page, et passait sur l'ancienne, où `?vue=prieres`
	// montrait la semaine et ses sept jours datés. Il lit maintenant le contenu de l'onglet, ses deux
	// tableaux, et chaque date qui s'y écrit, celle d'une session déplacée comprise.
	it.each([SLUG, SLUG_CHANGE])(
		'writes every date of the prayer tab as JJ.MM.AAAA, in the tab itself (%s)',
		async (slug) => {
			const numerique = (date: IsoDate) => date.split('-').reverse().join('.');
			const attendues = [
				...Array.from({ length: 7 }, (_, pas) => numerique(addDays(today, pas))),
				...(slug === SLUG_CHANGE ? [numerique(VENDREDI_SUIVANT)] : [])
			].sort();
			for (const langue of LANGUES) {
				const html = (await servir(`${base(langue, slug)}?vue=prieres`)).html;
				const onglet = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
				// L'onglet lui-même, et non une autre vue qui montrerait les mêmes jours.
				expect(lignes(onglet, 'aujourdhui'), `${langue} : le tableau du jour`).toHaveLength(5);
				expect(
					lignes(onglet, 'semaine').map((ligne) => ligne[0]),
					`${langue} : les jours du tableau`
				).toEqual(Array.from({ length: 7 }, (_, pas) => jourEtDate(langue, addDays(today, pas))));
				const texte = lu(onglet);
				expect(texte.match(ISO_DATE)?.[0] ?? null, `${langue} : une date AAAA-MM-JJ`).toBeNull();
				expect([...new Set(texte.match(/\d{2}\.\d{2}\.\d{4}/g))].sort(), langue).toEqual(attendues);
			}
		}
	);
});

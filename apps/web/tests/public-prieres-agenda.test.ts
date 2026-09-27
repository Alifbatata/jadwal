// La page publique et le widget, après les retours de l'étape 18 : l'onglet des prières (C4),
// l'agenda selon l'appareil (E1), le délai de Google (E2), la vue « Tous les cours » qui ne compte
// plus une séance déplacée ailleurs, et chaque écran touché dans les cinq langues (D2, A3).
//
// Vrai serveur construit, vraie base. Les textes attendus sont écrits ici en toutes lettres, sans
// passer par le code qu'on éprouve : un dictionnaire faux ferait tomber le test au lieu de s'y
// recopier.

import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { addDays, isoDateToDays, todayInZone, weekdayFromDays, type IsoDate } from '@jadwal/core';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';
import { productionEnvironment } from './environnement-de-production.js';
import { frenchLeft, ISO_DATE, textSegments, visibleText } from './textes-lus.js';

/**
 * Le serveur de ce fichier, à lui seul : le même serveur construit que celui de la préparation
 * globale, lancé de la même façon, avec en plus l'horloge figée (`HORLOGE_FIGEE`, plus bas). Les
 * trois serveurs de la préparation globale gardent la vraie heure : les autres fichiers calculent
 * leurs dates sur elle. Un port à part, le cinquième (`global-setup.ts`).
 */
const PORT = Number(process.env['JADWAL_TEST_PORT_BASE'] ?? 4173) + 4;
const origin = `http://127.0.0.1:${PORT}`;
const testDatabase = inject('testDatabase');
const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
/** Le module qui fige l'horloge de Node, chargé par le seul serveur de ce fichier. */
const HORLOGE = pathToFileURL(join(appDir, '..', '..', 'scripts', 'horloge-figee.mjs')).href;

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
/**
 * Une organisation dont la seule session du vendredi des sept jours part à un autre jour des sept,
 * à 13:00, avant l'adhan du Dhuhr de ce jour-là (relecture du lot 4). Une organisation à elle : la
 * base n'admet que trois sessions du vendredi, et le vendredi changé les a déjà.
 */
const SLUG_VENUE = 'vendredi-deplace';
const NOM_VENUE = 'Association du vendredi déplacé';
/**
 * Une organisation dont trois cours partent demain (relecture du lot 5) : le premier, à 12:30, pour
 * un autre jour ; le deuxième, de 15:00 à 16:00 le même jour ; le troisième, qui suit le Maghrib,
 * à 21:00 le même jour. L'heure d'avant de chacun est la sienne, et non celle d'un autre cours parti
 * plus tôt ce jour-là. Le troisième change encore d'heure une semaine plus tard, et un quatrième
 * cours, qui suit le Dhuhr, change d'heure le vendredi des sept jours, où une session du vendredi a
 * lieu à 13:30 (relecture du lot 6).
 */
const SLUG_HEURES = 'heures-changees';
const NOM_HEURES = 'Association des heures changées';
const DEBUT = '2026-09-07';

/**
 * L'instant où l'horloge du serveur de ce fichier est figée, et que ce fichier lit aussi : un
 * vendredi, 10:00 à Zurich.
 *
 * Jusqu'à l'étape 19, « aujourd'hui » était calculé au chargement de ce fichier, et le serveur le
 * recalculait à chaque requête : un passage qui franchissait minuit faisait attendre la veille à ce
 * fichier quand le serveur servait le lendemain, et treize vérifications tombaient. Le serveur de ce
 * fichier tourne désormais à l'horloge figée (`scripts/horloge-figee.mjs`), et les deux parlent du
 * même jour, quelle que soit l'heure du passage.
 *
 * Un vendredi, pour que les branches du vendredi jouent à chaque passage : l'iqama du Dhuhr qui
 * cède la place aux sessions, le tableau du jour du vendredi changé. Celle du jour qui reçoit une
 * session déplacée (`AUTRE_JOUR`) ne joue plus ; un jeudi la ferait jouer. Après `DEBUT`, loin d'un
 * changement d'heure, et l'année des données de ce fichier.
 */
const HORLOGE_FIGEE = '2026-10-09T08:00:00Z';
const today = todayInZone(FUSEAU, new Date(HORLOGE_FIGEE));
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
/** Le jour qui reçoit la session du vendredi déplacé : la veille, ou le lendemain si le vendredi est aujourd'hui. */
const AUTRE_JOUR = VENDREDI > today ? addDays(VENDREDI, -1) : addDays(VENDREDI, 1);
/** La deuxième session du vendredi changé, déplacée le même jour de 13:45 à 14:15 : sa page de cours. */
let sessionMemeJour = '';

const COURS = {
	/** Un cours qui a lieu chaque semaine le jour de demain ; la séance de demain est déplacée. */
	deplace: newId(),
	/** Un cours de chaque jour, pour la page d'un cours et son abonnement. */
	quotidien: newId()
};
/** Les titres, d'un seul mot : un titre saisi par l'organisation n'est pas un texte à traduire. */
const TITRES = { deplace: 'Tajwid', quotidien: 'Hifz' };
/**
 * Un cours ordinaire du vendredi changé, annulé demain : sa marque reste au masculin, « Annulé »,
 * quand celle d'une session du vendredi s'accorde avec la prière.
 */
const COURS_ANNULE = { id: newId(), titre: 'Nahw' };

/**
 * Les trois premiers cours des heures changées ont lieu chaque semaine le jour de demain, le
 * quatrième chaque vendredi.
 */
const COURS_HEURES = { parti: newId(), memeJour: newId(), priere: newId(), vendredi: newId() };
const TITRES_HEURES = { parti: 'Fiqh', memeJour: 'Sira', priere: 'Tafsir', vendredi: 'Dars' };
/** Une semaine après demain : le cours qui suit le Maghrib y change encore d'heure. */
const DEMAIN_EN_HUIT = addDays(DEMAIN, 7);
/** La session du vendredi des heures changées : le vendredi, elle tient lieu d'iqama du Dhuhr. */
const SESSION_HEURES = { ordre: 1, debut: '13:30', fin: '14:10', langues: ['fr'] };

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

let serveur: ChildProcess | undefined;

beforeAll(async () => {
	const journal: string[] = [];
	serveur = spawn(process.execPath, ['--import', HORLOGE, join(appDir, 'build', 'index.js')], {
		cwd: appDir,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...productionEnvironment(),
			NODE_ENV: 'production',
			PORT: String(PORT),
			HOST: '127.0.0.1',
			ORIGIN: origin,
			POSTGRES_DB: testDatabase,
			MAIL_TRANSPORT: 'file',
			MAIL_OUTBOX_DIR: inject('outbox'),
			MAIL_FROM: 'jadwal@example.test',
			BETTER_AUTH_SECRET: inject('authSecret'),
			JADWAL_HORLOGE_FIGEE: HORLOGE_FIGEE
		}
	});
	serveur.stdout?.on('data', (morceau: Buffer) => journal.push(morceau.toString()));
	serveur.stderr?.on('data', (morceau: Buffer) => {
		journal.push(morceau.toString());
		// Comme la préparation globale : une erreur du serveur doit se voir dans la sortie des tests,
		// et non seulement sous la forme d'un 500 sans explication.
		process.stderr.write(morceau.toString());
	});
	for (let essai = 1; essai <= 60; essai += 1) {
		try {
			if ((await fetch(`${origin}/healthz`)).ok) return;
		} catch {
			// Le serveur n'écoute pas encore.
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`Le serveur à l'horloge figée n'a pas démarré.\n${journal.join('')}`);
}, 120_000);

afterAll(() => {
	serveur?.kill();
});

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	const organisation = newId();
	const sans = newId();
	const change = newId();
	const venue = newId();
	const heures = newId();
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
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language", "prayer_module")
			values (${venue}, ${SLUG_VENUE}, ${NOM_VENUE}, ${FUSEAU}, 'fr',
				array['fr','de','it','en','ar'], true)
		`);
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language", "prayer_module")
			values (${heures}, ${SLUG_HEURES}, ${NOM_HEURES}, ${FUSEAU}, 'fr',
				array['fr','de','it','en','ar'], true)
		`);
		for (const avecPrieres of [organisation, change, venue, heures]) {
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
		sessionMemeJour = deuxieme;
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
				"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "starts_on")
			values (${COURS_ANNULE.id}, ${change}, 'published', 'open', array['fr'], 'fr', 'weekly',
				${sql.raw(`array[${jourDe(DEMAIN)}]::smallint[]`)}, 1, ${DEBUT}, 'fixed', '18:00',
				'19:00', ${DEBUT})
		`);
		await tx.execute(sql`
			insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
			values (${newId()}, ${change}, ${COURS_ANNULE.id}, 'fr', ${COURS_ANNULE.titre})
		`);
		await tx.execute(sql`
			insert into "session_exception" ("id", "organization_id", "course_id", "date", "kind",
				"to_date", "to_start")
			values (${newId()}, ${change}, ${COURS_ANNULE.id}, ${DEMAIN}, 'cancelled', null, null)
		`);
		// Le vendredi déplacé : une session, qui part à un autre jour ce vendredi-là.
		const partie = await sessionDuVendredi(venue, SESSIONS[0] as (typeof SESSIONS)[number]);
		// Comme les gestes « Annuler » et « Déplacer » de l'écran du vendredi, ce vendredi-là seulement.
		await tx.execute(sql`
			insert into "session_exception" ("id", "organization_id", "course_id", "date", "kind",
				"to_date", "to_start")
			values
				(${newId()}, ${change}, ${premiere}, ${VENDREDI}, 'cancelled', null, null),
				(${newId()}, ${change}, ${deuxieme}, ${VENDREDI}, 'moved', ${VENDREDI}, '14:15'),
				(${newId()}, ${change}, ${troisieme}, ${VENDREDI}, 'moved', ${VENDREDI_SUIVANT}, '15:00'),
				(${newId()}, ${venue}, ${partie}, ${VENDREDI}, 'moved', ${AUTRE_JOUR}, '13:00')
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
		// Les heures changées : deux cours à heure fixe, et un cours 15 minutes après le Maghrib, soit
		// 19:30 demain (iqama 19:15). Chacun part demain.
		for (const [id, titre, debut, fin] of [
			[COURS_HEURES.parti, TITRES_HEURES.parti, '12:30', '13:10'],
			[COURS_HEURES.memeJour, TITRES_HEURES.memeJour, '15:00', '15:40']
		] as const) {
			await tx.execute(sql`
				insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
					"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
					"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "starts_on")
				values (${id}, ${heures}, 'published', 'open', array['fr'], 'fr', 'weekly',
					${sql.raw(`array[${jourDe(DEMAIN)}]::smallint[]`)}, 1, ${DEBUT}, 'fixed', ${debut},
					${fin}, ${DEBUT})
			`);
			await tx.execute(sql`
				insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
				values (${newId()}, ${heures}, ${id}, 'fr', ${titre})
			`);
		}
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
				"recurrence_anchor_date", "timing_kind", "timing_prayer", "timing_offset_minutes",
				"timing_duration_minutes", "starts_on")
			values (${COURS_HEURES.priere}, ${heures}, 'published', 'open', array['fr'], 'fr', 'weekly',
				${sql.raw(`array[${jourDe(DEMAIN)}]::smallint[]`)}, 1, ${DEBUT}, 'prayer', 'maghrib', 15,
				60, ${DEBUT})
		`);
		await tx.execute(sql`
			insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
			values (${newId()}, ${heures}, ${COURS_HEURES.priere}, 'fr', ${TITRES_HEURES.priere})
		`);
		// Le cours du vendredi, 10 minutes après le Dhuhr : 13:25 un autre jour (iqama 13:15), 13:40 le
		// vendredi, après la session de 13:30.
		await sessionDuVendredi(heures, SESSION_HEURES);
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
				"recurrence_anchor_date", "timing_kind", "timing_prayer", "timing_offset_minutes",
				"timing_duration_minutes", "starts_on")
			values (${COURS_HEURES.vendredi}, ${heures}, 'published', 'open', array['fr'], 'fr', 'weekly',
				array[5]::smallint[], 1, ${DEBUT}, 'prayer', 'dhuhr', 10, 60, ${DEBUT})
		`);
		await tx.execute(sql`
			insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
			values (${newId()}, ${heures}, ${COURS_HEURES.vendredi}, 'fr', ${TITRES_HEURES.vendredi})
		`);
		await tx.execute(sql`
			insert into "session_exception" ("id", "organization_id", "course_id", "date", "kind",
				"to_date", "to_start")
			values
				(${newId()}, ${heures}, ${COURS_HEURES.parti}, ${DEMAIN}, 'moved', ${APRES_DEMAIN}, '12:30'),
				(${newId()}, ${heures}, ${COURS_HEURES.memeJour}, ${DEMAIN}, 'moved', ${DEMAIN}, '16:00'),
				(${newId()}, ${heures}, ${COURS_HEURES.priere}, ${DEMAIN}, 'moved', ${DEMAIN}, '21:00'),
				(${newId()}, ${heures}, ${COURS_HEURES.priere}, ${DEMAIN_EN_HUIT}, 'moved',
					${DEMAIN_EN_HUIT}, '21:30'),
				(${newId()}, ${heures}, ${COURS_HEURES.vendredi}, ${VENDREDI}, 'moved', ${VENDREDI},
					'16:00')
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
/**
 * Les mots de la vue Semaine, repris par l'onglet pour une session qui n'a pas lieu. Une session du
 * vendredi est une prière : « Annulée », « Annullata », « ملغاة », accordés au féminin (décision du
 * chef de projet, 27.09.2026). L'allemand et l'anglais n'ont qu'une forme.
 */
const ANNULE: Record<Langue, string> = {
	fr: 'Annulée',
	de: 'Abgesagt',
	it: 'Annullata',
	en: 'Cancelled',
	ar: 'ملغاة'
};
/** Le mot d'un cours annulé, qui ne change pas. */
const COURS_ANNULE_MARQUE: Record<Langue, string> = {
	fr: 'Annulé',
	de: 'Abgesagt',
	it: 'Annullato',
	en: 'Cancelled',
	ar: 'ملغى'
};
const DEPLACE_AU: Record<Langue, (date: string) => string> = {
	fr: (date) => `Déplacé au ${date}`,
	de: (date) => `Verschoben auf ${date}`,
	it: (date) => `Spostato a ${date}`,
	en: (date) => `Moved to ${date}`,
	ar: (date) => `نُقل إلى ${date}`
};
/** « Initialement le vendredi 02.10.2026 » : le mot de la vue Semaine pour une séance venue d'ailleurs. */
const ORIGINE: Record<Langue, (date: string) => string> = {
	fr: (date) => `Initialement le ${date}`,
	de: (date) => `Ursprünglich am ${date}`,
	it: (date) => `Inizialmente ${date}`,
	en: (date) => `Originally on ${date}`,
	ar: (date) => `كان مقرّرًا في ${date}`
};
/** L'aide qui dit qu'une session du vendredi déplacée s'écrit dans la case du Dhuhr de son jour. */
const AIDE_VENUE: Record<Langue, string> = {
	fr: 'Quand une prière du vendredi est déplacée à un autre jour, la case du Dhuhr de ce jour-là la donne aussi, avec son nom et sa date d’origine.',
	de: 'Wird ein Freitagsgebet auf einen anderen Tag verschoben, steht es auch im Feld des Dhuhr an diesem Tag, mit seinem Namen und seinem ursprünglichen Datum.',
	it: 'Quando una preghiera del venerdì viene spostata a un altro giorno, compare anche nella casella del Dhuhr di quel giorno, con il suo nome e la data prevista in origine.',
	en: 'When a Friday prayer is moved to another day, it also appears in the Dhuhr box of that day, with its name and its original date.',
	ar: 'إذا نُقلت صلاة الجمعة إلى يوم آخر، تظهر أيضًا في خانة الظهر لذلك اليوم، باسمها وتاريخها الأصلي.'
};
/** Les phrases d'aide de l'onglet, telles que l'œil les lit. */
function aides(html: string): string[] {
	return [...html.matchAll(/<p class="aide[^"]*">([\s\S]*?)<\/p>/g)].map((trouve) =>
		lu(trouve[1] ?? '')
	);
}
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

describe('l’horloge figée du serveur de ce fichier (étape 19)', () => {
	// Le jour est écrit ici en toutes lettres, sans le calcul de `today` : si le serveur servait le
	// jour du passage, et non celui de son horloge, ce test le dirait quel que soit ce jour.
	it.each([
		['fr', 'Aujourd’hui, vendredi 09.10.2026'],
		['de', 'Heute, Freitag, 09.10.2026'],
		['ar', 'اليوم، الجمعة 09.10.2026']
	] as const)(
		'serves the day of its frozen clock, not the day it runs, in %s',
		async (langue, jour) => {
			const { html } = await servir(`${base(langue)}?vue=prieres`);
			const titres = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((trouve) =>
				lu(trouve[1] ?? '')
			);
			expect(titres).toContain(jour);
		}
	);
});

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
		'lets the table of the week scroll from the keyboard, under a name of its own, in %s',
		async (langue) => {
			// Sur un téléphone, le tableau déborde et c'est son cadre qui défile. Un cadre qui défile
			// sans rien qu'on puisse atteindre au clavier ne se fait pas défiler : axe le classe
			// « serious » (scrollable-region-focusable), et la CI l'a vu à 390 px avec ses polices.
			// Le cadre porte son propre nom, et non celui de la section, qui en ferait deux régions
			// du même nom l'une dans l'autre.
			const NOM_DU_TABLEAU: Record<Langue, string> = {
				fr: 'Tableau des sept prochains jours',
				de: 'Tabelle der nächsten sieben Tage',
				it: 'Tabella dei prossimi sette giorni',
				en: 'Table of the next seven days',
				ar: 'جدول الأيام السبعة القادمة'
			};
			const { html } = await servir(`${base(langue)}?vue=prieres`);
			const cadre =
				html.match(/<div\b[^>]*\bclass="defile[^"]*"[^>]*>\s*<table\b[^>]*\bclass="semaine/)?.[0] ??
				'';
			expect(cadre, 'le cadre du tableau de la semaine').not.toBe('');
			expect(cadre).toMatch(/\btabindex="0"/);
			expect(cadre).toMatch(/\brole="region"/);
			expect(cadre.match(/\baria-label="([^"]*)"/)?.[1]).toBe(NOM_DU_TABLEAU[langue]);
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
			// Le tableau du jour, quand c'est ce vendredi : c'est le cas à l'horloge figée de ce
			// fichier (`HORLOGE_FIGEE`). `src/lib/public/Prieres.temps.test.ts` l'éprouve aussi, un
			// vendredi choisi.
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
			// Et la vue Semaine de la même page dit la même chose, le mot exact, dans sa marque : « Annulé »
			// passait pour « Annulée » tant qu'on cherchait le mot dans le texte. Le cours ordinaire
			// annulé demain garde le sien.
			const marquesDe = (page: string) =>
				[...page.matchAll(/<span class="marque[^"]*">([^<]*)<\/span>/g)].map((trouve) => trouve[1]);
			const vueSemaine = (await servir(base(langue, SLUG_CHANGE))).html;
			const marques = marquesDe(vueSemaine);
			expect(marques, langue).toContain(ANNULE[langue]);
			expect(marques, langue).toContain(COURS_ANNULE_MARQUE[langue]);
			expect(
				marques.filter(
					(marque) => marque === ANNULE[langue] || marque === COURS_ANNULE_MARQUE[langue]
				),
				langue
			).toHaveLength(2);
			expect(visibleText(vueSemaine)).toContain(deplace);
			// La vue Mois, au jour choisi, montre ses séances par le même composant : le même mot
			// (reprise 1). La grille ne porte que des nombres ; les marques sont celles de ce jour.
			const vueMois = await servir(
				`${base(langue, SLUG_CHANGE)}?vue=mois&mois=${VENDREDI.slice(0, 7)}&jour=${VENDREDI}`
			);
			expect(vueMois.statut).toBe(200);
			expect(marquesDe(vueMois.html), langue).toContain(ANNULE[langue]);
		}
	);

	// Relecture du lot 4 : le jour qui recevait une session du vendredi la montrait comme une troisième
	// heure en gras, sans nom visible, et après l'iqama alors qu'elle venait avant l'adhan.
	it.each(LANGUES)(
		'names a Friday session moved to another day, says its Friday, and puts it at its place in time, in %s',
		async (langue) => {
			const { html } = await servir(`${base(langue, SLUG_VENUE)}?vue=prieres`);
			const dates = Array.from({ length: 7 }, (_, pas) => addDays(today, pas));
			const venue = `${VENDREDI_SEULE[langue]('13:00')} ${ORIGINE[langue](jourEtDate(langue, VENDREDI))}`;
			const partie = DEPLACE_AU[langue](jourEtDate(langue, AUTRE_JOUR));
			const semaine = lignes(html, 'semaine');
			for (const [index, date] of dates.entries()) {
				expect(semaine[index]?.[2], date).toBe(
					date === AUTRE_JOUR
						? // 13:00 vient avant l'adhan de 13:05, et l'iqama reste : ce n'est pas un vendredi.
							`${venue} ${HEURES.dhuhr} ${IQAMAS.dhuhr}`
						: date === VENDREDI
							? `${HEURES.dhuhr} ${IQAMAS.dhuhr} 12:30 ${partie}`
							: `${HEURES.dhuhr} ${IQAMAS.dhuhr}`
				);
			}
			if (today === AUTRE_JOUR) {
				expect(lignes(html, 'aujourdhui')[1]?.[2]).toBe(`${venue} ${IQAMAS.dhuhr}`);
			}
			// L'aide au-dessus du tableau dit ce cas, et seulement là où il se présente.
			expect(aides(html)).toContain(AIDE_VENUE[langue]);
			const sansVenue = await servir(`${base(langue)}?vue=prieres`);
			expect(aides(sansVenue.html)).not.toContain(AIDE_VENUE[langue]);
		}
	);

	// L'onglet ignore le filtre par public, et c'est voulu : il ne montre aucun filtre, donc un filtre
	// venu avec le lien ne se verrait pas et ne s'enlèverait pas, et une heure de prière vaut pour tous.
	// Le bloc du bas, le rythme habituel, n'est pas filtré non plus.
	it('ignores the audience filter a link brings: the tab has no filter to see or remove', async () => {
		// Le visiteur arrive sur l'onglet depuis une vue filtrée : le lien de l'onglet garde le filtre.
		const filtree = await servir(`${base('fr', SLUG_CHANGE)}?public=women`);
		const onglet = new URL(
			vues(filtree.html)[3]?.href ?? '',
			`${origin}${base('fr', SLUG_CHANGE)}`
		);
		expect(onglet.searchParams.get('vue')).toBe('prieres');
		expect(onglet.searchParams.get('public')).toBe('women');
		// Le filtre agit bien ailleurs : la vue Semaine filtrée n'a aucune session, toutes ouvertes à tous.
		expect(visibleText(filtree.html)).not.toContain('Jumu’a');
		const avec = await servir(`${onglet.pathname}${onglet.search}`);
		const sans = await servir(`${base('fr', SLUG_CHANGE)}?vue=prieres`);
		expect(avec.statut).toBe(200);
		expect(avec.html).not.toMatch(/<nav\b[^>]*\bclass="filtres\b/);
		expect(lignes(avec.html, 'semaine')).toEqual(lignes(sans.html, 'semaine'));
		expect(lignes(avec.html, 'aujourdhui')).toEqual(lignes(sans.html, 'aujourdhui'));
		expect(aides(avec.html)).toEqual(aides(sans.html));
		// Et ces lignes portent les sessions : deux tableaux vides seraient égaux aussi.
		const dhuhr = lignes(avec.html, 'semaine').map((ligne) => ligne[2]);
		expect(dhuhr.join(' | ')).toContain(`14:15 12:30 ${ANNULE.fr}`);
	});

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
/** Outlook des comptes de travail ou d'école : le même chemin, chez `outlook.office.com`. */
const outlookTravail = (webcal: string, nom: string) =>
	`https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(webcal)}&name=${encodeURIComponent(nom)}`;

/** Le délai de Google, que la page disait jusqu'au 27.09.2026, et qui ne doit plus se lire. */
const DELAI_GOOGLE: Record<Langue, string> = {
	fr: 'Google peut mettre jusqu’à 24 heures à rafraîchir un abonnement.',
	de: 'Google kann bis zu 24 Stunden brauchen, um ein Abo zu aktualisieren.',
	it: 'Google può impiegare fino a 24 ore per aggiornare un’iscrizione.',
	en: 'Google can take up to 24 hours to refresh a subscription.',
	ar: 'قد يستغرق Google حتى 24 ساعة لتحديث الاشتراك.'
};
/**
 * Ce que la page dit à la place du délai de Google (décision du chef de projet, 27.09.2026) : l'aide
 * de Google ne donne aucun délai de rafraîchissement, et la phrase des 24 heures n'avait plus
 * d'appui écrit. L'arabe est celui du chef de projet, mot pour mot.
 */
const DERNIERE_MINUTE: Record<Langue, string> = {
	fr: 'Pour un changement de dernière minute, regardez la page du programme : elle est toujours à jour.',
	de: 'Bei einer Änderung in letzter Minute sehen Sie auf der Seite des Programms nach: Sie ist immer aktuell.',
	it: 'Per un cambiamento dell’ultimo minuto, guarda la pagina del programma: è sempre aggiornata.',
	en: 'For a last-minute change, check the programme page: it is always up to date.',
	ar: 'عند أي تغيير في آخر لحظة، راجع صفحة البرنامج: فهي محدَّثة دائمًا.'
};
/**
 * Le lien vers le choix complet, et la question qui le précède, hors du lien (décision du chef de
 * projet, 27.09.2026) : « Une autre application ou un autre appareil ? », puis « Voir tous les
 * choix ». La question était « Un autre appareil ? », et faisait partie du lien.
 */
const AUTRE_APPAREIL: Record<Langue, string> = {
	fr: 'Voir tous les choix',
	de: 'Alle Möglichkeiten anzeigen',
	it: 'Vedi tutte le possibilità',
	en: 'See all the options',
	ar: 'اعرض كل الخيارات'
};
const AUTRE_APPLICATION: Record<Langue, string> = {
	fr: 'Une autre application ou un autre appareil ?',
	de: 'Eine andere App oder ein anderes Gerät?',
	it: 'Un’altra app o un altro dispositivo?',
	en: 'Another app or another device?',
	ar: 'تطبيق آخر أو جهاز آخر؟'
};

describe('« Une autre application ou un autre appareil ? » (27.09.2026)', () => {
	it.each(LANGUES)(
		'asks the question in %s, then links to the full choice, on the page and on a course',
		async (langue) => {
			for (const [chemin, visiteur, vers] of [
				[`${base(langue)}/agenda`, IPHONE, `${base(langue)}/agenda?appareil=tous`],
				[`${base(langue)}/agenda`, ANDROID, `${base(langue)}/agenda?appareil=tous`],
				[
					`${base(langue)}/cours/${COURS.quotidien}`,
					IPHONE,
					`${base(langue)}/cours/${COURS.quotidien}?appareil=tous#agenda`
				]
			] as const) {
				const { html } = await servir(chemin, visiteur);
				const bloc =
					html.match(/<div\b[^>]*\bclass="abonnement\b[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
				const dernier = [...bloc.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].at(-1)?.[1] ?? '';
				// La question, puis le lien, dans le même paragraphe : la question n'est pas dans le lien.
				expect(lu(dernier), `${langue} ${chemin}`).toBe(
					`${AUTRE_APPLICATION[langue]} ${AUTRE_APPAREIL[langue]}`
				);
				const liens = [...dernier.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
				expect(liens.map((lien) => lu(lien[2] ?? ''))).toEqual([AUTRE_APPAREIL[langue]]);
				expect(
					suivi((attributs(`<a${liens[0]?.[1]}>`)['href'] ?? '').replaceAll('&amp;', '&'), chemin)
				).toBe(vers);
			}
		}
	);
});

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
			expect(bloc.lu).toContain(DERNIERE_MINUTE.fr);
			expect(bloc.lu).not.toContain(DELAI_GOOGLE.fr);
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
				[outlookTravail(fluxWebcal('de'), NOM), 'Outlook (Arbeit oder Schule)', '_blank'],
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
			outlookTravail(fluxWebcal('fr'), NOM),
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
		expect(android.lu).toContain(DERNIERE_MINUTE.it);
		expect(android.lu).not.toContain(DELAI_GOOGLE.it);

		const windows = abonnement((await servir(chemin('it'), WINDOWS)).html, chemin('it'));
		expect(windows.appareil).toBe('autre');
		expect(windows.liens.map((lien) => lien.href)).toEqual([
			google(fluxCoursWebcal('it', COURS.quotidien)),
			outlook(fluxCoursWebcal('it', COURS.quotidien), `${NOM} – ${TITRES.quotidien}`),
			outlookTravail(fluxCoursWebcal('it', COURS.quotidien), `${NOM} – ${TITRES.quotidien}`),
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

describe('le lien « S’abonner au calendrier » du pied', () => {
	// À garder tel quel (chef de projet, 27.09.2026) : seuls le bloc d'abonnement et la page d'un
	// cours choisissent selon l'appareil (ADR 0048). Le pied mène toujours à la page d'abonnement,
	// sinon toutes les pages du programme varieraient.
	it('stays the same on every device, on every public page', async () => {
		for (const chemin of [
			base('fr'),
			`${base('fr')}?vue=prieres`,
			`${base('fr')}/agenda`,
			`${base('fr')}/cours/${COURS.quotidien}`
		]) {
			const liens: string[][] = [];
			for (const visiteur of [IPHONE, ANDROID, WINDOWS, {}]) {
				const { html } = await servir(chemin, visiteur);
				const pied = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? '';
				const premier = pied.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/);
				liens.push([
					suivi(
						(attributs(`<a${premier?.[1] ?? ''}>`)['href'] ?? '').replaceAll('&amp;', '&'),
						chemin
					),
					lu(premier?.[2] ?? '')
				]);
			}
			expect(liens, chemin).toEqual(
				Array.from({ length: 4 }, () => [`/m/${SLUG}/agenda`, 'S’abonner au calendrier'])
			);
		}
	});
});

describe('« de » devant le nom de l’organisation, en français (D8)', () => {
	// « Association des prières » commence par une voyelle : « le programme d’Association… », et non
	// « le programme de Association… » (relevé D8 du 27.09.2026).
	it('elides « de » before the name, in the page and in its description', async () => {
		const { html } = await servir(`/m/${SLUG}/agenda`, IPHONE);
		const phrase = `Le programme d’${NOM} s’ajoute à votre calendrier et se met à jour tout seul.`;
		expect(lu(html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '')).toContain(phrase);
		const description = html.match(/<meta name="description"[^>]*>/)?.[0] ?? '';
		expect(attributs(description)['content']).toContain(phrase);
		expect(html).not.toContain(`programme de ${NOM}`);
	});
});

describe('ni délai de Google, ni 24 heures : la page du programme (E2, 27.09.2026)', () => {
	it.each(LANGUES)(
		'says in %s to look at the programme page, and no longer that Google takes 24 hours',
		async (langue) => {
			// Sur Android, sous l'aide du bouton, à la place du délai ; sur le choix complet, une fois,
			// sous la liste des choix ; sur la page d'un cours, dans son bloc ; et dans les étapes à la
			// main, qui disaient le délai de Google à tout appareil, une fois, après le délai d'Outlook
			// (relecture de la reprise 1).
			const chemin = `${base(langue)}/agenda`;
			const android = await servir(chemin, ANDROID);
			expect(abonnement(android.html, chemin).lu).toContain(
				`${AIDE_DU_BOUTON_GOOGLE[langue]} ${DERNIERE_MINUTE[langue]} ${SUR_UN_ORDINATEUR[langue]}`
			);
			const ailleurs = await servir(chemin, WINDOWS);
			const choix = abonnement(ailleurs.html, chemin).lu;
			expect(choix.split(DERNIERE_MINUTE[langue])).toHaveLength(2);
			expect(choix.endsWith(DERNIERE_MINUTE[langue]), langue).toBe(true);
			const cours = `${base(langue)}/cours/${COURS.quotidien}`;
			expect(abonnement((await servir(cours, ANDROID)).html, cours).lu).toContain(
				DERNIERE_MINUTE[langue]
			);
			// Et nulle part le délai de Google, ni sous un bouton, ni dans les étapes à la main, sur
			// aucun appareil : un iPhone, lui, n'a la phrase que là.
			const iphone = await servir(chemin, IPHONE);
			for (const html of [android.html, ailleurs.html, iphone.html]) {
				const page = lu(html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '');
				expect(page, langue).not.toContain(DELAI_GOOGLE[langue]);
				const main = aLaMain(html);
				expect(main.etapes[SUR_ANDROID[langue]]).toEqual([ETAPES_ANDROID[langue]]);
				expect(main.etapes[SUR_OUTLOOK[langue]]?.slice(-2), langue).toEqual([
					DELAI_OUTLOOK[langue],
					DERNIERE_MINUTE[langue]
				]);
				expect(main.lu.split(DERNIERE_MINUTE[langue]), langue).toHaveLength(2);
			}
		}
	);
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
	ar: 'اضغط على الزر: يُفتح تقويم Google مع طلب إضافة هذا التقويم. إن اقترح عليك ذلك، فأكّد.'
};
/**
 * Puis ce qu'il faut faire si Google Agenda ne propose rien sur le téléphone : ouvrir cette page sur
 * un ordinateur, dont l'adresse suit (décision du chef de projet, 27.09.2026). Sur l'ordinateur, la
 * page propose le choix complet, et le lien de Google Agenda y fonctionne.
 */
const SUR_UN_ORDINATEUR: Record<Langue, string> = {
	fr: 'Si Google Agenda ne propose rien sur votre téléphone, ouvrez cette page sur un ordinateur :',
	de: 'Wenn Google Kalender auf Ihrem Telefon nichts anbietet, öffnen Sie diese Seite an einem Computer:',
	it: 'Se Google Calendar non propone nulla sul telefono, apri questa pagina su un computer:',
	en: 'If Google Calendar offers nothing on your phone, open this page on a computer:',
	ar: 'إن لم يقترح تقويم Google شيئًا على هاتفك، فافتح هذه الصفحة على حاسوب:'
};
/**
 * La phrase d'avant, qui ne doit plus se lire : les étapes de l'aide de Google (answer 37100), avec
 * l'adresse à coller ci-dessous. Elles restent dans « Ajouter l'adresse à la main ».
 */
const PAR_UN_ORDINATEUR: Record<Langue, string> = {
	fr: 'Si Google Agenda ne propose rien sur votre téléphone, passez par un ordinateur : selon Google, on ne peut ajouter un agenda par son adresse que depuis le navigateur d’un ordinateur. Ouvrez-y Google Agenda. À gauche, à côté d’Autres agendas, cliquez sur le signe + (Ajouter d’autres agendas), puis choisissez À partir de l’URL. Collez l’adresse ci-dessous et cliquez sur Ajouter l’agenda. L’agenda apparaîtra ensuite aussi sur votre téléphone.',
	de: 'Wenn Google Kalender auf Ihrem Telefon nichts anbietet, nehmen Sie einen Computer: Laut Google lässt sich ein Kalender über seine Adresse nur im Browser eines Computers hinzufügen. Öffnen Sie dort Google Kalender. Klicken Sie links neben Weitere Kalender auf das Symbol + (Weitere Kalender hinzufügen) und dann auf Per URL. Fügen Sie die Adresse unten ein und klicken Sie auf Kalender hinzufügen. Danach erscheint der Kalender auch auf Ihrem Telefon.',
	it: 'Se Google Calendar non propone nulla sul telefono, usa un computer: secondo Google, un calendario si può aggiungere tramite indirizzo solo dal browser di un computer. Apri lì Google Calendar. A sinistra, accanto ad Altri calendari, fai clic sul segno + (Aggiungi altri calendari) e poi su Da URL. Incolla l’indirizzo qui sotto e fai clic su Aggiungi calendario. Il calendario comparirà poi anche sul telefono.',
	en: 'If Google Calendar offers nothing on your phone, use a computer: according to Google, a calendar can only be added by its address in a computer’s web browser. Open Google Calendar there. On the left, next to Other calendars, click the + sign (Add other calendars), then From URL. Paste the address below and click Add calendar. The calendar will then appear on your phone too.',
	ar: 'إن لم يقترح تقويم Google شيئًا على هاتفك، فاستعن بحاسوب: حسب Google، لا يمكن إضافة تقويم عن طريق عنوانه إلا من متصفح على الحاسوب. افتح فيه تقويم Google. على يمين الصفحة، بجانب التقاويم الأخرى، انقر على علامة + (إضافة تقاويم أخرى)، ثم اختر من عنوان URL. الصق العنوان أدناه، ثم انقر على إضافة تقويم. سيظهر التقويم بعدها على هاتفك أيضًا.'
};
/** Les étapes « Sur Android », qui disent la même chose, avec les mêmes libellés. */
const ETAPES_ANDROID: Record<Langue, string> = {
	fr: 'Selon Google, on ne peut ajouter un agenda par son adresse que depuis le navigateur d’un ordinateur. Sur l’ordinateur, ouvrez Google Agenda. À gauche, à côté d’Autres agendas, cliquez sur le signe + (Ajouter d’autres agendas), puis choisissez À partir de l’URL. Collez l’adresse et cliquez sur Ajouter l’agenda. Il apparaîtra ensuite aussi sur votre téléphone.',
	de: 'Laut Google lässt sich ein Kalender über seine Adresse nur im Browser eines Computers hinzufügen. Öffnen Sie am Computer Google Kalender. Klicken Sie links neben Weitere Kalender auf das Symbol + (Weitere Kalender hinzufügen) und dann auf Per URL. Fügen Sie die Adresse ein und klicken Sie auf Kalender hinzufügen. Danach erscheint er auch auf Ihrem Telefon.',
	it: 'Secondo Google, un calendario si può aggiungere tramite indirizzo solo dal browser di un computer. Dal computer apri Google Calendar. A sinistra, accanto ad Altri calendari, fai clic sul segno + (Aggiungi altri calendari) e poi su Da URL. Incolla l’indirizzo e fai clic su Aggiungi calendario. Comparirà poi anche sul telefono.',
	en: 'According to Google, a calendar can only be added by its address in a computer’s web browser. On the computer, open Google Calendar. On the left, next to Other calendars, click the + sign (Add other calendars), then From URL. Paste the address and click Add calendar. It will then appear on your phone too.',
	ar: 'حسب Google، لا يمكن إضافة تقويم عن طريق عنوانه إلا من متصفح على الحاسوب. افتح تقويم Google على الحاسوب. على يمين الصفحة، بجانب التقاويم الأخرى، انقر على علامة + (إضافة تقاويم أخرى)، ثم اختر من عنوان URL. الصق العنوان، ثم انقر على إضافة تقويم. سيظهر بعدها على هاتفك أيضًا.'
};
/**
 * Les libellés de l'interface de Google Agenda dans chaque langue, tels que son aide les écrit
 * (answer 37100) : la rubrique, le « + » qui l'accompagne, le choix, puis le dernier bouton.
 */
const LIBELLES_GOOGLE: Record<Langue, string[]> = {
	fr: ['Autres agendas', 'Ajouter d’autres agendas', 'À partir de l’URL', 'Ajouter l’agenda'],
	de: ['Weitere Kalender', 'Weitere Kalender hinzufügen', 'Per URL', 'auf Kalender hinzufügen'],
	it: ['Altri calendari', 'Aggiungi altri calendari', 'Da URL', 'Aggiungi calendario'],
	en: ['Other calendars', 'Add other calendars', 'From URL', 'Add calendar'],
	// « إضافة تقويم » seul se lit déjà plus tôt, dans « لا يمكن إضافة تقويم » : le clic le précède.
	ar: ['التقاويم الأخرى', 'إضافة تقاويم أخرى', 'من عنوان URL', 'انقر على إضافة تقويم']
};
/**
 * Sur Android, l'étiquette de l'adresse qui suivait « collez l'adresse ci-dessous » (relecture du
 * lot 4). La phrase ne dit plus de la coller : l'étiquette ne se lit plus, et l'adresse du flux y
 * reprend celle de l'iPhone, « Ou copiez cette adresse… », un autre choix.
 */
const ADRESSE_A_COLLER: Record<Langue, string> = {
	fr: 'L’adresse à coller :',
	de: 'Die Adresse zum Einfügen:',
	it: 'L’indirizzo da incollare:',
	en: 'The address to paste:',
	ar: 'العنوان المراد لصقه:'
};
const ADRESSE_DU_COURS_A_COLLER: Record<Langue, string> = {
	fr: 'L’adresse à coller, qui ne porte que ce cours :',
	de: 'Die Adresse zum Einfügen, die nur diesen Kurs enthält:',
	it: 'L’indirizzo da incollare, che contiene solo questo corso:',
	en: 'The address to paste, which covers only this course:',
	ar: 'العنوان المراد لصقه، وهو خاص بهذا الدرس وحده:'
};
/** L'étiquette qui présente l'adresse du flux comme un autre choix. */
const OU_COPIEZ: Record<Langue, string> = {
	fr: 'Ou copiez cette adresse dans votre application de calendrier :',
	de: 'Oder kopieren Sie diese Adresse in Ihre Kalender-App:',
	it: 'Oppure copia questo indirizzo nella tua app di calendario:',
	en: 'Or copy this address into your calendar app:',
	ar: 'أو انسخ هذا العنوان والصقه في تطبيق التقويم:'
};
/** La même, sur la page d'un cours. */
const OU_COPIEZ_CE_COURS: Record<Langue, string> = {
	fr: 'Ou copiez cette adresse, qui ne porte que ce cours :',
	de: 'Oder kopieren Sie diese Adresse, die nur diesen Kurs enthält:',
	it: 'Oppure copia questo indirizzo, che contiene solo questo corso:',
	en: 'Or copy this address, which covers only this course:',
	ar: 'أو انسخ هذا العنوان، وهو خاص بهذا الدرس وحده:'
};
/**
 * « Un seul cours », sur Android : le nom ouvre Google, et la page du cours est l'issue si rien ne
 * vient. Son lien s'affiche juste sous le nom, sur toute la largeur : la phrase disait « à côté »
 * (relecture du lot 5).
 */
const UN_SEUL_COURS_ANDROID: Record<Langue, string> = {
	fr: 'Vous pouvez aussi n’ajouter qu’un cours. Touchez son nom : Google Agenda s’ouvre pour ce cours seul, comme avec le bouton ci-dessus. Si Google Agenda ne propose rien sur votre téléphone, touchez Page du cours, juste sous son nom : cette page donne l’adresse du cours et la marche à suivre sur un ordinateur.',
	de: 'Sie können auch nur einen Kurs hinzufügen. Tippen Sie auf seinen Namen: Google Kalender öffnet sich für diesen Kurs allein, wie mit der Schaltfläche oben. Wenn Google Kalender auf Ihrem Telefon nichts anbietet, tippen Sie direkt unter seinem Namen auf Seite des Kurses: Dort stehen die Adresse des Kurses und die Schritte am Computer.',
	it: 'Puoi anche aggiungere un solo corso. Tocca il suo nome: Google Calendar si apre solo per quel corso, come con il pulsante qui sopra. Se Google Calendar non propone nulla sul telefono, tocca Pagina del corso, subito sotto il suo nome: lì trovi l’indirizzo del corso e i passaggi da fare su un computer.',
	en: 'You can also add just one course. Tap its name: Google Calendar opens for that course alone, as with the button above. If Google Calendar offers nothing on your phone, tap Course page, just below its name: that page gives the course’s address and the steps to follow on a computer.',
	ar: 'يمكنك أيضًا إضافة درس واحد فقط. اضغط على اسمه: يُفتح تقويم Google لهذا الدرس وحده، كما مع الزر أعلاه. إن لم يقترح تقويم Google شيئًا على هاتفك، فاضغط على صفحة الدرس تحت اسمه مباشرةً: فيها عنوان الدرس والخطوات التي تتبعها على الحاسوب.'
};
/** Le nom du lien vers la page d'un cours, celui de la vue « Tous les cours ». */
const PAGE_DU_COURS: Record<Langue, string> = {
	fr: 'Page du cours',
	de: 'Seite des Kurses',
	it: 'Pagina del corso',
	en: 'Course page',
	ar: 'صفحة الدرس'
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

/** Sous le lien d'Outlook, ce qu'il fait et pour quel compte : un compte personnel. */
const OUTLOOK_PERSONNEL: Record<Langue, string> = {
	fr: 'Outlook sur le web s’ouvre avec l’adresse déjà remplie : choisissez Importer. Ce lien sert aux comptes personnels.',
	de: 'Outlook im Web öffnet sich mit der bereits eingetragenen Adresse: Wählen Sie Importieren. Dieser Link ist für private Konten.',
	it: 'Outlook sul web si apre con l’indirizzo già inserito: scegli Importa. Questo link è per gli account personali.',
	en: 'Outlook on the web opens with the address already filled in: choose Import. This link is for personal accounts.',
	ar: 'يُفتح Outlook على الويب والعنوان مُدخل مسبقًا: اختر استيراد. هذا الرابط للحسابات الشخصية.'
};
/** Le lien d'Outlook des comptes de travail ou d'école, et sa phrase. */
const OUTLOOK_TRAVAIL: Record<Langue, [string, string]> = {
	fr: [
		'Outlook (travail ou école)',
		'Outlook sur le web s’ouvre avec l’adresse déjà remplie : choisissez Importer. Ce lien sert aux comptes de travail ou d’école.'
	],
	de: [
		'Outlook (Arbeit oder Schule)',
		'Outlook im Web öffnet sich mit der bereits eingetragenen Adresse: Wählen Sie Importieren. Dieser Link ist für Geschäfts- oder Schulkonten.'
	],
	it: [
		'Outlook (lavoro o scuola)',
		'Outlook sul web si apre con l’indirizzo già inserito: scegli Importa. Questo link è per gli account di lavoro o di scuola.'
	],
	en: [
		'Outlook (work or school)',
		'Outlook on the web opens with the address already filled in: choose Import. This link is for work or school accounts.'
	],
	ar: [
		'Outlook (عمل أو مدرسة)',
		'يُفتح Outlook على الويب والعنوان مُدخل مسبقًا: اختر استيراد. هذا الرابط لحسابات العمل أو المدرسة.'
	]
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
			// Le bouton, ce qu'il fait, la page du programme pour un changement de dernière minute, puis
			// l'ordinateur et l'adresse courte de cette page, d'une seule suite (décisions du chef de
			// projet, 27.09.2026). L'adresse du flux suit, comme un autre choix : la phrase ne dit plus
			// de la coller.
			const cettePage = `${origin}${base(langue)}/agenda`;
			expect(bloc.lu).toContain(
				`${AIDE_DU_BOUTON_GOOGLE[langue]} ${DERNIERE_MINUTE[langue]} ${SUR_UN_ORDINATEUR[langue]} ` +
					`${cettePage} ${OU_COPIEZ[langue]} ${fluxHttps(langue)}`
			);
			expect(bloc.lu).not.toContain(PAR_UN_ORDINATEUR[langue]);
			expect(bloc.lu).not.toContain(ADRESSE_A_COLLER[langue]);
			expect(bloc.code).toEqual([cettePage, fluxHttps(langue)]);
			expect(aLaMain(html).etapes[SUR_ANDROID[langue]]).toEqual([ETAPES_ANDROID[langue]]);
			// La page d'un cours, qui n'a pas d'étapes à la main, donne sa propre adresse.
			const cours = `${base(langue)}/cours/${COURS.quotidien}`;
			const blocDuCours = abonnement((await servir(cours, ANDROID)).html, cours);
			expect(blocDuCours.lu).toContain(
				`${SUR_UN_ORDINATEUR[langue]} ${origin}${cours} ${OU_COPIEZ_CE_COURS[langue]} ` +
					fluxCoursHttps(langue, COURS.quotidien)
			);
			expect(blocDuCours.lu).not.toContain(ADRESSE_DU_COURS_A_COLLER[langue]);
			expect(blocDuCours.code).toEqual([
				`${origin}${cours}`,
				fluxCoursHttps(langue, COURS.quotidien)
			]);
			// Sur un iPhone, l'adresse suit un bouton : elle y est bien un autre choix.
			const iphone = abonnement((await servir(chemin, IPHONE)).html, chemin);
			expect(iphone.lu).toContain(`${OU_COPIEZ[langue]} ${fluxHttps(langue)}`);
		}
	);

	it.each(LANGUES)(
		'gives the steps of Google’s help with the labels of its interface, in %s',
		async (langue) => {
			const chemin = `${base(langue)}/agenda`;
			const { html } = await servir(chemin, ANDROID);
			// Les étapes à la main ; le bloc du bouton, lui, envoie sur un ordinateur ouvrir cette page,
			// qui y propose le choix complet (27.09.2026).
			const etapes = aLaMain(html).etapes[SUR_ANDROID[langue]]?.[0] ?? '';
			// Le « + » à côté de la rubrique, puis chaque libellé, dans l'ordre où l'on clique.
			expect(etapes, langue).toContain('+');
			const places = LIBELLES_GOOGLE[langue].map((libelle) => etapes.indexOf(libelle));
			expect(
				places.every((place) => place >= 0),
				`${langue} : ${places.join(', ')}`
			).toBe(true);
			expect(
				[...places].sort((a, b) => a - b),
				langue
			).toEqual(places);
		}
	);

	it.each(LANGUES)(
		'gives each course on Android a way out when Google offers nothing, in %s',
		async (langue) => {
			const chemin = `${base(langue)}/agenda`;
			const { html } = await servir(chemin, ANDROID);
			const section =
				[...html.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)]
					.map((trouve) => trouve[1] ?? '')
					.find((contenu) => /<ul\b[^>]*\bclass="cours\b/.test(contenu)) ?? '';
			expect(lu(section.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '')).toBe(
				UN_SEUL_COURS_ANDROID[langue]
			);
			const ligne =
				[...section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)]
					.map((trouve) => trouve[1] ?? '')
					.find((contenu) => lu(contenu).startsWith(TITRES.quotidien)) ?? '';
			const liens = [...ligne.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((lien) => {
				const attrs = attributs(`<a${lien[1]}>`);
				return [
					suivi((attrs['href'] ?? '').replaceAll('&amp;', '&'), chemin),
					lu(lien[2] ?? ''),
					attrs['target']
				];
			});
			// Le nom ouvre Google, comme avant ; dessous, la page du cours, à son bloc d'abonnement.
			expect(liens).toEqual([
				[google(fluxCoursWebcal(langue, COURS.quotidien)), TITRES.quotidien, '_blank'],
				[`${base(langue)}/cours/${COURS.quotidien}#agenda`, PAGE_DU_COURS[langue], undefined]
			]);
			// Et cette page donne le passage par un ordinateur, avec sa propre adresse, puis celle du
			// flux du cours.
			const page = `${base(langue)}/cours/${COURS.quotidien}`;
			const { html: duCours } = await servir(page, ANDROID);
			expect(duCours).toMatch(/<section\b[^>]*\bid="agenda"/);
			expect(abonnement(duCours, page).lu).toContain(
				`${SUR_UN_ORDINATEUR[langue]} ${origin}${page} ${OU_COPIEZ_CE_COURS[langue]} ` +
					fluxCoursHttps(langue, COURS.quotidien)
			);
		}
	);

	// Décision du chef de projet, au 27.09.2026 : sur un iPhone aussi, chaque cours a, juste sous son
	// nom, le lien « Page du cours », comme sur Android. Le nom garde son lien `webcal:`, dans l'onglet.
	it.each(LANGUES)(
		'gives each course on an iPhone the course page link it has on Android, in %s',
		async (langue) => {
			const chemin = `${base(langue)}/agenda`;
			const { html } = await servir(chemin, IPHONE);
			const section =
				[...html.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)]
					.map((trouve) => trouve[1] ?? '')
					.find((contenu) => /<ul\b[^>]*\bclass="cours\b/.test(contenu)) ?? '';
			const ligne =
				[...section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)]
					.map((trouve) => trouve[1] ?? '')
					.find((contenu) => lu(contenu).startsWith(TITRES.quotidien)) ?? '';
			const liens = [...ligne.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((lien) => {
				const attrs = attributs(`<a${lien[1]}>`);
				return [
					suivi((attrs['href'] ?? '').replaceAll('&amp;', '&'), chemin),
					lu(lien[2] ?? ''),
					attrs['target'],
					// La classe qui donne au second lien sa place, sous le nom et sur toute la largeur.
					(attrs['class'] ?? '').split(/\s+/).includes('page-du-cours')
				];
			});
			expect(liens).toEqual([
				[fluxCoursWebcal(langue, COURS.quotidien), TITRES.quotidien, undefined, false],
				[`${base(langue)}/cours/${COURS.quotidien}#agenda`, PAGE_DU_COURS[langue], undefined, true]
			]);
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
			.filter((texte) => texte.startsWith('Outlook'));
		// Les deux Outlook, le personnel et celui du travail ou de l'école : Microsoft donne le même
		// délai aux deux (« Import or subscribe to a calendar in Outlook.com or Outlook on the web »,
		// relue le 27.09.2026).
		expect(outlookLi, langue).toHaveLength(2);
		for (const texte of outlookLi) {
			expect(texte, langue).toContain(DELAI_OUTLOOK[langue]);
			// Et le délai de Google reste sous Google, pas sous Outlook.
			expect(texte).not.toContain(DELAI_GOOGLE[langue]);
		}
		// Dans les étapes à la main, le délai d'Outlook, puis la page du programme pour un changement
		// de dernière minute.
		expect(aLaMain(html).etapes[SUR_OUTLOOK[langue]]?.slice(-2)).toEqual([
			DELAI_OUTLOOK[langue],
			DERNIERE_MINUTE[langue]
		]);
	});

	// Décision du chef de projet, au 27.09.2026 : le choix complet propose aussi l'Outlook des comptes
	// de travail ou d'école, `outlook.office.com`, juste après celui des comptes personnels. Chacun dit
	// à quel compte il sert ; la phrase qui renvoyait un compte de travail à la copie de l'adresse a
	// disparu.
	it.each(LANGUES)('offers Outlook for work or school next to Outlook, in %s', async (langue) => {
		const chemin = `${base(langue)}/agenda`;
		const { html } = await servir(chemin, WINDOWS);
		const choix = html.match(/<ul\b[^>]*\bclass="choix\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? '';
		const lignes = [...choix.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((trouve) =>
			lu(trouve[1] ?? '')
		);
		const [travail, aide] = OUTLOOK_TRAVAIL[langue];
		expect(lignes[1], langue).toBe(`Outlook ${OUTLOOK_PERSONNEL[langue]} ${DELAI_OUTLOOK[langue]}`);
		expect(lignes[2], langue).toBe(`${travail} ${aide} ${DELAI_OUTLOOK[langue]}`);
		expect(abonnement(html, chemin).liens[2]).toEqual({
			href: outlookTravail(fluxWebcal(langue), NOM),
			texte: travail,
			cible: '_blank'
		});
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
// Relecture du lot 4 : une séance déplacée le même jour, à une autre heure
// ---------------------------------------------------------------------------------------------

/** Au départ, la mention d'une séance déplacée le même jour : sa nouvelle heure. */
const DEPLACE_A: Record<Langue, (heure: string) => string> = {
	fr: (heure) => `Déplacé à ${heure}`,
	de: (heure) => `Verschoben auf ${heure}`,
	it: (heure) => `Spostato alle ${heure}`,
	en: (heure) => `Moved to ${heure}`,
	ar: (heure) => `نُقل إلى الساعة ${heure}`
};
/** À l'arrivée, la marque, à la place de « Date exceptionnelle », puisque la date n'a pas changé. */
const NOUVELLE_HEURE: Record<Langue, string> = {
	fr: 'Nouvelle heure',
	de: 'Neue Uhrzeit',
	it: 'Nuovo orario',
	en: 'New time',
	ar: 'وقت جديد'
};
/** Et l'heure d'avant. */
const INITIALEMENT_A: Record<Langue, (heure: string) => string> = {
	fr: (heure) => `Initialement à ${heure}`,
	de: (heure) => `Ursprünglich um ${heure}`,
	it: (heure) => `Inizialmente alle ${heure}`,
	en: (heure) => `Originally at ${heure}`,
	ar: (heure) => `كان مقرّرًا في الساعة ${heure}`
};
/** La marque d'une séance venue d'un autre jour, qu'un vrai changement de date garde. */
const DATE_EXCEPTIONNELLE: Record<Langue, string> = {
	fr: 'Date exceptionnelle',
	de: 'Ausnahmetermin',
	it: 'Data eccezionale',
	en: 'Rescheduled',
	ar: 'موعد استثنائي'
};

/** Les séances d'un jour de la vue Semaine : barrée ou non, sa ligne, ses marques, ses détails. */
function seancesDuJour(html: string, langue: Langue, date: IsoDate) {
	const section =
		[...html.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)]
			.map((trouve) => trouve[1] ?? '')
			.find((contenu) =>
				lu(contenu.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? '').startsWith(
					jourEtDate(langue, date)
				)
			) ?? '';
	return [...section.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/g)].map((trouve) => {
		const contenu = trouve[2] ?? '';
		return {
			barree: /\bclass="[^"]*\bbarree\b/.test(trouve[1] ?? ''),
			ligne: lu(contenu.match(/<p class="ligne[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? ''),
			marques: [...contenu.matchAll(/<span class="marque[^"]*">([\s\S]*?)<\/span>/g)].map(
				(marque) => lu(marque[1] ?? '')
			),
			details: lu(contenu.match(/<p class="details[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? '')
		};
	});
}

/** Les prochaines séances de la page d'un cours, telles que l'œil les lit. */
function prochainesDuCours(html: string): string[] {
	const liste =
		html.match(/<h2\b[^>]*>[^<]*<\/h2>(?:\s|<!--[^>]*-->)*<ul\b[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? '';
	return [...liste.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((trouve) => lu(trouve[1] ?? ''));
}

describe('une séance déplacée le même jour, à une autre heure', () => {
	it.each(LANGUES)(
		'says a change of time in the week view, in %s: the time before and the new one',
		async (langue) => {
			const { html } = await servir(base(langue, SLUG_CHANGE));
			const jumua = seancesDuJour(html, langue, VENDREDI).filter((seance) =>
				seance.ligne.includes('Jumu’a')
			);
			const depart = jumua.find((seance) => seance.barree && seance.ligne.startsWith('13:45'));
			const arrivee = jumua.find((seance) => !seance.barree && seance.ligne.startsWith('14:15'));
			expect(depart?.marques, langue).toEqual([DEPLACE_A[langue]('14:15')]);
			expect(arrivee?.marques, langue).toEqual([NOUVELLE_HEURE[langue]]);
			expect(arrivee?.details, langue).toContain(INITIALEMENT_A[langue]('13:45'));
			// Plus de « Déplacé au » vers le jour même, ni de « Initialement le » ce jour-là.
			const texte = visibleText(html);
			expect(texte).not.toContain(DEPLACE_AU[langue](jourEtDate(langue, VENDREDI)));
			expect(texte).not.toContain(ORIGINE[langue](jourEtDate(langue, VENDREDI)));
			// Un vrai changement de date garde ses mots : la session partie au vendredi suivant.
			const partie = jumua.find((seance) => seance.barree && seance.ligne.startsWith('15:00'));
			expect(partie?.marques).toEqual([DEPLACE_AU[langue](jourEtDate(langue, VENDREDI_SUIVANT))]);
			// Et un cours de l'autre organisation, déplacé de demain à après-demain, au départ et à
			// l'arrivée.
			const autre = (await servir(base(langue))).html;
			const parti = seancesDuJour(autre, langue, DEMAIN).find(
				(seance) => seance.barree && seance.ligne.includes(TITRES.deplace)
			);
			const arrive = seancesDuJour(autre, langue, APRES_DEMAIN).find(
				(seance) => !seance.barree && seance.ligne.includes(TITRES.deplace)
			);
			expect(parti?.marques).toEqual([DEPLACE_AU[langue](jourEtDate(langue, APRES_DEMAIN))]);
			expect(arrive?.marques).toEqual([DATE_EXCEPTIONNELLE[langue]]);
			expect(arrive?.details).toContain(ORIGINE[langue](jourEtDate(langue, DEMAIN)));
		}
	);

	it.each(LANGUES)(
		'says it on the course page too, in %s, and a real change of date keeps its words',
		async (langue) => {
			const page = await servir(`${base(langue, SLUG_CHANGE)}/cours/${sessionMemeJour}`);
			expect(page.statut).toBe(200);
			const jour = jourEtDate(langue, VENDREDI);
			expect(prochainesDuCours(page.html).find((ligne) => ligne.startsWith(jour))).toBe(
				`${jour} 14:15 – 14:55 ${NOUVELLE_HEURE[langue]} ${INITIALEMENT_A[langue]('13:45')}`
			);
			const autre = await servir(`${base(langue)}/cours/${COURS.deplace}`);
			const arrivee = jourEtDate(langue, APRES_DEMAIN);
			expect(prochainesDuCours(autre.html).find((ligne) => ligne.startsWith(arrivee))).toBe(
				`${arrivee} 18:00 – 19:00 ${DATE_EXCEPTIONNELLE[langue]}`
			);
		}
	);

	// Relecture du lot 5 : l'heure d'avant vient de la séance de départ du même cours. Demain, un
	// autre cours part plus tôt, à 12:30, vers un autre jour : son heure ne passe pas aux autres.
	it.each(LANGUES)(
		'gives each course its own time before in the week view, in %s, when another leaves earlier that day',
		async (langue) => {
			const { html } = await servir(base(langue, SLUG_HEURES));
			const demain = seancesDuJour(html, langue, DEMAIN);
			const arrivee = (titre: string, heure: string) =>
				demain.find(
					(seance) =>
						!seance.barree && seance.ligne.startsWith(heure) && seance.ligne.includes(titre)
				);
			const sira = arrivee(TITRES_HEURES.memeJour, '16:00');
			expect(sira?.marques, langue).toEqual([NOUVELLE_HEURE[langue]]);
			expect(sira?.details, langue).toContain(INITIALEMENT_A[langue]('15:00'));
			expect(sira?.details, langue).not.toContain(INITIALEMENT_A[langue]('12:30'));
			// Le cours qui suit le Maghrib : l'heure que la prière lui donnait ce jour-là.
			const tafsir = arrivee(TITRES_HEURES.priere, '21:00');
			expect(tafsir?.marques, langue).toEqual([NOUVELLE_HEURE[langue]]);
			expect(tafsir?.details, langue).toContain(INITIALEMENT_A[langue]('19:30'));
			// Le cours parti à un autre jour garde ses mots, au départ.
			const parti = demain.find(
				(seance) => seance.barree && seance.ligne.includes(TITRES_HEURES.parti)
			);
			expect(parti?.marques).toEqual([DEPLACE_AU[langue](jourEtDate(langue, APRES_DEMAIN))]);
		}
	);

	// Relecture du lot 5 : la page d'un cours qui suit une prière disait « Nouvelle heure » sans
	// l'heure d'avant, que la vue Semaine donne pour la même séance.
	it.each(LANGUES)(
		'gives the time before on the page of a course that follows a prayer, in %s, as the week view does',
		async (langue) => {
			const page = await servir(`${base(langue, SLUG_HEURES)}/cours/${COURS_HEURES.priere}`);
			expect(page.statut).toBe(200);
			const jour = jourEtDate(langue, DEMAIN);
			expect(prochainesDuCours(page.html).find((ligne) => ligne.startsWith(jour))).toBe(
				`${jour} 21:00 – 22:00 ${NOUVELLE_HEURE[langue]} ${INITIALEMENT_A[langue]('19:30')}`
			);
		}
	);

	// Relecture du lot 6 : la page lit les heures de prière du premier au dernier jour où une séance a
	// changé d'heure. Le même cours change encore d'heure une semaine plus tard : ce jour-là aussi a
	// son heure d'avant.
	it.each(LANGUES)(
		'gives the time before of each session moved the same day, in %s, on the page of a course that follows a prayer',
		async (langue) => {
			const page = await servir(`${base(langue, SLUG_HEURES)}/cours/${COURS_HEURES.priere}`);
			expect(page.statut).toBe(200);
			const seances = prochainesDuCours(page.html);
			for (const [date, debut, fin] of [
				[DEMAIN, '21:00', '22:00'],
				[DEMAIN_EN_HUIT, '21:30', '22:30']
			] as const) {
				const jour = jourEtDate(langue, date);
				expect(seances.find((ligne) => ligne.startsWith(jour))).toBe(
					`${jour} ${debut} – ${fin} ${NOUVELLE_HEURE[langue]} ${INITIALEMENT_A[langue]('19:30')}`
				);
			}
		}
	);

	// Relecture du lot 6 : le vendredi, l'heure d'avant d'un cours qui suit le Dhuhr part de la
	// dernière session du vendredi, 13:30, et non de l'iqama du Dhuhr, 13:15, comme dans la vue Semaine.
	it.each(LANGUES)(
		'gives the time before on Friday from the last Friday session, in %s, on the page of a course that follows the Dhuhr',
		async (langue) => {
			const page = await servir(`${base(langue, SLUG_HEURES)}/cours/${COURS_HEURES.vendredi}`);
			expect(page.statut).toBe(200);
			const jour = jourEtDate(langue, VENDREDI);
			expect(prochainesDuCours(page.html).find((ligne) => ligne.startsWith(jour))).toBe(
				`${jour} 16:00 – 17:00 ${NOUVELLE_HEURE[langue]} ${INITIALEMENT_A[langue]('13:40')}`
			);
			const semaine = seancesDuJour(
				(await servir(base(langue, SLUG_HEURES))).html,
				langue,
				VENDREDI
			);
			const arrivee = semaine.find(
				(seance) =>
					!seance.barree &&
					seance.ligne.startsWith('16:00') &&
					seance.ligne.includes(TITRES_HEURES.vendredi)
			);
			expect(arrivee?.details, langue).toContain(INITIALEMENT_A[langue]('13:40'));
		}
	);
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
	NOM_VENUE,
	TITRES.deplace,
	TITRES.quotidien,
	COURS_ANNULE.titre,
	'Jumu’a',
	`${TITRES.quotidien} | ${NOM}`
];

const ECRANS: { nom: string; suite: string; visiteur: Visiteur; slug?: string }[] = [
	{ nom: 'prayer tab', suite: '?vue=prieres', visiteur: {} },
	// Un vendredi changé : les mots « Annulé » et « Déplacé au », repris de la vue Semaine.
	{ nom: 'prayer tab of a changed Friday', suite: '?vue=prieres', visiteur: {}, slug: SLUG_CHANGE },
	// Et sa vue Semaine : une session déplacée le même jour dit un changement d'heure.
	{ nom: 'week of a changed Friday', suite: '', visiteur: {}, slug: SLUG_CHANGE },
	// Une session du vendredi partie à un autre jour : son nom, son vendredi, et l'aide qui le dit.
	{ nom: 'prayer tab of a moved Friday', suite: '?vue=prieres', visiteur: {}, slug: SLUG_VENUE },
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
	it.each([SLUG, SLUG_CHANGE, SLUG_VENUE])(
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

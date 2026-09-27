// Chaque page dans sa langue, servie par HTTP : la balise `<html>`, les en-têtes de la vue Mois, le
// lien des conditions au pied, le flux d'un cours ancré sur une prière, et le 404 d'une adresse
// publique. Depuis l'étape 18 : l'anglais britannique, cinquième langue, et les dates en
// `JJ.MM.AAAA` dans le texte que chaque page donne à lire, jamais en `AAAA-MM-JJ`.
//
// Ces promesses sont déjà tenues par des fonctions éprouvées une à une (`i18n.test.ts`,
// `affichage.test.ts`, `agenda.test.ts`, `Pied.test.ts`). Ce fichier éprouve ce qu'aucun test
// unitaire ne voit : le hook qui écrit la langue sur `<html>` une fois la page rendue, chaque route
// qui la pose ou ne la pose pas, la page d'erreur que SvelteKit choisit, et le flux réellement
// servi. Vrai serveur construit, vraie base.

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { addDays, isoDateToDays, todayInZone, weekdayFromDays, type IsoDate } from '@jadwal/core';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';

const origin = inject('origin');
const testDatabase = inject('testDatabase');

const FUSEAU = 'Europe/Zurich';
/** Une organisation en français par défaut, qui parle les cinq langues et a le module des prières. */
const SLUG = 'langues';
/** Une organisation dont la langue par défaut est l'arabe : son adresse courte doit être en arabe. */
const SLUG_ARABE = 'langues-arabe';

/**
 * Les cours, nommés dès le chargement du fichier : les tableaux de `it.each` sont lus avant
 * `beforeAll`, et les adresses des pages de cours en ont besoin.
 */
const COURS = {
	/** Au Maghrib, sans décalage : le flux dit « Après Maghrib », « بعد المغرب », comme la page. */
	maghrib: newId(),
	/** Au Fajr, sans décalage : le flux allemand dit « Nach Fadschr ». */
	fajr: newId(),
	/** Un quart d'heure avant l'Isha : « avant », jamais un signe moins. */
	isha: newId(),
	/** Un cours à heure fixe de l'organisation arabophone. */
	arabe: newId(),
	/**
	 * Un cours qui a une date de fin : sa page dit alors de quand à quand il court, sur la ligne
	 * « Dates ». Aucun autre cours de ce fichier n'en a, et cette ligne n'était lue par aucun test.
	 */
	borne: newId()
};

/** Le début de chaque cours de ce fichier, et la fin du cours borné, dans trois mois. */
const DEBUT_DES_COURS = '2026-09-07';
const FIN_DU_COURS_BORNE = addDays(todayInZone(FUSEAU, new Date()), 90);

/** Les heures de prière posées pour chaque jour : fixes, pour que l'heure attendue se lise ici. */
const HEURES = { fajr: '05:30', dhuhr: '13:05', asr: '16:30', maghrib: '19:10', isha: '20:40' };
/** L'Isha moins quinze minutes, déjà sur un multiple de cinq : l'arrondi du cœur ne la change pas. */
const ISHA_MOINS_QUINZE = '20:25';

let ownerHandle: DatabaseHandle;

/** Une transaction du propriétaire, sous son drapeau d'entretien : les fixtures passent par là. */
async function maintenance<T>(
	travail: (tx: Parameters<Parameters<DatabaseHandle['db']['transaction']>[0]>[0]) => Promise<T>
): Promise<T> {
	return ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		return travail(tx);
	});
}

/**
 * Un cours de tous les jours, posé par le propriétaire : l'application publique ne sait pas écrire.
 * Sans date de fin, sauf si on lui en donne une.
 */
async function poserCours(
	id: string,
	organizationId: string,
	titre: string,
	horaire: { priere: string; decalage: number } | { debut: string; fin: string },
	finDuCours: string | null = null
): Promise<void> {
	const ancre = 'priere' in horaire;
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
				"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "timing_prayer",
				"timing_offset_minutes", "timing_duration_minutes", "starts_on", "ends_on")
			values (${id}, ${organizationId}, 'published', 'open', array['fr'], 'fr', 'weekly',
				array[1,2,3,4,5,6,7]::smallint[], 1, ${DEBUT_DES_COURS}, ${ancre ? 'prayer' : 'fixed'},
				${ancre ? null : horaire.debut}, ${ancre ? null : horaire.fin},
				${ancre ? horaire.priere : null}, ${ancre ? horaire.decalage : null},
				${ancre ? 60 : null}, ${DEBUT_DES_COURS}, ${finDuCours})
		`);
		await tx.execute(sql`
			insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
			values (${newId()}, ${organizationId}, ${id}, 'fr', ${titre})
		`);
	});
}

/** Une page, sans suivre les renvois : le code et le corps. */
async function servir(chemin: string): Promise<{ statut: number; html: string }> {
	const reponse = await fetch(`${origin}${chemin}`, { redirect: 'manual' });
	return { statut: reponse.status, html: await reponse.text() };
}

/** Les attributs d'une balise ouvrante, par nom. */
function attributs(balise: string): Record<string, string> {
	return Object.fromEntries(
		[...balise.matchAll(/\s([a-z-]+)="([^"]*)"/g)].map((trouve) => [trouve[1], trouve[2]])
	);
}

/** Le texte d'un fragment, sans ses balises, les blancs ramenés à une espace. */
function texte(fragment: string): string {
	return fragment
		.replace(/<[^>]+>/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * La règle qui porte une classe de composant, lue dans les feuilles de style que la page sert
 * vraiment, liées ou en ligne. `classe` est l'attribut entier, tel que Svelte l'écrit :
 * `pour-lecteur svelte-empreinte` ; le sélecteur compilé est alors `.pour-lecteur.svelte-empreinte`.
 */
async function regleServie(html: string, chemin: string, classe: string): Promise<string> {
	const liees = await Promise.all(
		[...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)].map(async (trouve) => {
			const href = attributs(trouve[0])['href'] ?? '';
			return (await fetch(new URL(href, `${origin}${chemin}`))).text();
		})
	);
	const enLigne = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(
		(trouve) => trouve[1] ?? ''
	);
	const styles = [...liees, ...enLigne].join('\n');
	const selecteur = classe
		.split(/\s+/)
		.map((nom) => `\\.${nom}`)
		.join('');
	return styles.match(new RegExp(`${selecteur}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

/** Hors de la vue, pas hors de l'arbre d'accessibilité : la règle d'un texte réservé au lecteur. */
function cacheAuxYeuxSeulement(regle: string): void {
	expect(regle).toMatch(/position:\s*absolute/);
	expect(regle).toMatch(/clip-path:\s*inset\(50%\)/);
	// L'un ou l'autre le retirerait aussi aux lecteurs d'écran.
	expect(regle).not.toMatch(/display:\s*none|visibility:\s*hidden/);
}

/**
 * Un fichier `.ics` déplié : la RFC 5545 coupe les lignes de plus de soixante-quinze octets, et une
 * phrase arabe, à deux octets par lettre, y arrive vite. Chercher dans le fichier brut pourrait
 * manquer une phrase juste, coupée en deux.
 */
function deplie(ics: string): string {
	return ics.replace(/\r\n[ \t]/g, '');
}

async function flux(courseId: string, langue: string): Promise<string> {
	const reponse = await fetch(`${origin}/m/${SLUG}/agenda/${courseId}.ics?lang=${langue}`);
	expect(reponse.status, `flux ${langue} de ${courseId}`).toBe(200);
	const ics = deplie(await reponse.text());
	// Sans événement, une phrase absente passerait pour une phrase juste.
	expect(ics.match(/^DESCRIPTION:/gm)?.length ?? 0, `flux ${langue}`).toBeGreaterThan(0);
	return ics;
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	const organisation = newId();
	const arabophone = newId();
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language", "prayer_module")
			values (${organisation}, ${SLUG}, 'Association des langues', ${FUSEAU}, 'fr',
				array['fr','de','it','en','ar'], true)
		`);
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language")
			values (${arabophone}, ${SLUG_ARABE}, 'Association arabophone', ${FUSEAU}, 'ar',
				array['ar','fr'])
		`);
		// Les heures de prière autour d'aujourd'hui : la semaine de la page et une part de la fenêtre
		// du flux. Sans elles, un cours ancré n'a aucune heure, et le flux n'en sort aucun événement.
		const today = todayInZone(FUSEAU, new Date());
		for (let pas = -3; pas <= 20; pas += 1) {
			await tx.execute(sql`
				insert into "prayer_day" ("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib",
					"isha", "source")
				values (${organisation}, ${addDays(today, pas)}, ${HEURES.fajr}, ${HEURES.dhuhr},
					${HEURES.asr}, ${HEURES.maghrib}, ${HEURES.isha}, 'import')
			`);
		}
		// Le flux est compté dans le budget de débit public : un autre fichier a pu l'entamer.
		await tx.execute(sql`delete from "rate_limit"`);
	});
	// Aucun titre ne contient le nom d'une prière : un « Maghrib » trouvé dans le flux arabe ne
	// peut venir que du libellé d'ancrage.
	await poserCours(COURS.maghrib, organisation, 'Cercle du soir', {
		priere: 'maghrib',
		decalage: 0
	});
	await poserCours(COURS.fajr, organisation, 'Lecture de l’aube', { priere: 'fajr', decalage: 0 });
	await poserCours(COURS.isha, organisation, 'Veillée', { priere: 'isha', decalage: -15 });
	await poserCours(COURS.arabe, arabophone, 'Cours du samedi', { debut: '10:00', fin: '11:30' });
	await poserCours(
		COURS.borne,
		organisation,
		'Atelier d’automne',
		{ debut: '17:00', fin: '17:45' },
		FIN_DU_COURS_BORNE
	);
});

afterAll(async () => {
	await ownerHandle?.close();
});

/**
 * Les pages et la balise qu'elles doivent porter. Une page publique prend la langue de son adresse,
 * ou celle de l'organisation sans segment ; tout le reste du service est en français. Un 404 d'une
 * adresse publique prend la langue du segment quand il y en a un. Sans segment, il prend celle de
 * l'organisation quand la page l'a déjà trouvée (un cours inconnu), et le français sinon : la route
 * `[...reste]`, qui répond à une adresse qu'aucune autre route ne connaît, ne lit pas la base, et
 * `/m/<organisation arabe>/nulle-part` rend donc un 404 en français. Jusqu'à l'étape 17, un 404
 * restait toujours en français.
 */
const PAGES = [
	{ chemin: `/m/${SLUG}/ar`, statut: 200, balise: '<html lang="ar" dir="rtl">' },
	{ chemin: `/m/${SLUG}/ar?vue=mois`, statut: 200, balise: '<html lang="ar" dir="rtl">' },
	{ chemin: `/m/${SLUG}/ar?embed=1`, statut: 200, balise: '<html lang="ar" dir="rtl">' },
	{ chemin: `/m/${SLUG}/ar/agenda`, statut: 200, balise: '<html lang="ar" dir="rtl">' },
	{
		chemin: `/m/${SLUG}/ar/cours/${COURS.isha}`,
		statut: 200,
		balise: '<html lang="ar" dir="rtl">'
	},
	{ chemin: `/m/${SLUG}`, statut: 200, balise: '<html lang="fr" dir="ltr">' },
	{ chemin: `/m/${SLUG}/de`, statut: 200, balise: '<html lang="de" dir="ltr">' },
	{ chemin: `/m/${SLUG}/it/agenda`, statut: 200, balise: '<html lang="it" dir="ltr">' },
	// L'anglais britannique, cinquième langue (étape 18) : la page, les deux autres vues, l'abonnement,
	// un cours, et les 404.
	{ chemin: `/m/${SLUG}/en`, statut: 200, balise: '<html lang="en" dir="ltr">' },
	{ chemin: `/m/${SLUG}/en?vue=mois`, statut: 200, balise: '<html lang="en" dir="ltr">' },
	{ chemin: `/m/${SLUG}/en?embed=1`, statut: 200, balise: '<html lang="en" dir="ltr">' },
	{ chemin: `/m/${SLUG}/en/agenda`, statut: 200, balise: '<html lang="en" dir="ltr">' },
	{
		chemin: `/m/${SLUG}/en/cours/${COURS.isha}`,
		statut: 200,
		balise: '<html lang="en" dir="ltr">'
	},
	{ chemin: '/m/inconnue/en', statut: 404, balise: '<html lang="en" dir="ltr">' },
	{ chemin: `/m/${SLUG}/en/nulle-part`, statut: 404, balise: '<html lang="en" dir="ltr">' },
	{ chemin: `/m/${SLUG_ARABE}`, statut: 200, balise: '<html lang="ar" dir="rtl">' },
	{ chemin: `/m/${SLUG_ARABE}/agenda`, statut: 200, balise: '<html lang="ar" dir="rtl">' },
	{
		chemin: `/m/${SLUG_ARABE}/cours/${COURS.arabe}`,
		statut: 200,
		balise: '<html lang="ar" dir="rtl">'
	},
	{ chemin: `/m/${SLUG_ARABE}/fr`, statut: 200, balise: '<html lang="fr" dir="ltr">' },
	{ chemin: '/connexion', statut: 200, balise: '<html lang="fr" dir="ltr">' },
	{ chemin: '/conditions', statut: 200, balise: '<html lang="fr" dir="ltr">' },
	{ chemin: '/m/inconnue', statut: 404, balise: '<html lang="fr" dir="ltr">' },
	{ chemin: '/m/inconnue/ar', statut: 404, balise: '<html lang="ar" dir="rtl">' },
	{ chemin: '/m/inconnue/de/agenda', statut: 404, balise: '<html lang="de" dir="ltr">' },
	{ chemin: `/m/${SLUG}/ar/cours/${newId()}`, statut: 404, balise: '<html lang="ar" dir="rtl">' },
	{
		chemin: `/m/${SLUG_ARABE}/cours/${newId()}`,
		statut: 404,
		balise: '<html lang="ar" dir="rtl">'
	},
	{ chemin: `/m/${SLUG}/it/nulle-part`, statut: 404, balise: '<html lang="it" dir="ltr">' }
];

describe('la balise <html> de chaque page', () => {
	it.each(PAGES)('serves $chemin with $balise', async ({ chemin, statut, balise }) => {
		const page = await servir(chemin);
		expect(page.statut).toBe(statut);
		expect(page.html.match(/<html\b[^>]*>/g)).toEqual([balise]);
	});

	it('leaves no marker of the template in any response', async () => {
		for (const { chemin } of PAGES) {
			const { html } = await servir(chemin);
			expect(html, chemin).not.toContain('%lang%');
			expect(html, chemin).not.toContain('%dir%');
		}
	});
});

describe('les en-têtes de la vue Mois', () => {
	/**
	 * Le nom qu'un lecteur d'écran annonce avec chaque case : le texte de l'en-tête, moins ce qui
	 * porte `aria-hidden`. La forme courte, elle, reste la seule visible.
	 */
	function enTetes(html: string): { nom: string; visible: string }[] {
		const tete = html.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? '';
		return [...tete.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((trouve) => {
			const contenu = trouve[1] ?? '';
			const cache = /<span\b[^>]*\baria-hidden="true"[^>]*>([\s\S]*?)<\/span>/g;
			return {
				nom: texte(contenu.replace(cache, '')),
				visible: texte([...contenu.matchAll(cache)].map((partie) => partie[1]).join(''))
			};
		});
	}

	it.each([
		{
			langue: 'fr',
			chemin: `/m/${SLUG}?vue=mois`,
			noms: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
			courts: ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']
		},
		{
			langue: 'de',
			chemin: `/m/${SLUG}/de?vue=mois`,
			noms: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
			courts: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
		},
		{
			langue: 'it',
			chemin: `/m/${SLUG}/it?vue=mois`,
			noms: ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'],
			courts: ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
		},
		{
			langue: 'en',
			chemin: `/m/${SLUG}/en?vue=mois`,
			noms: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
			courts: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
		},
		{
			langue: 'ar',
			chemin: `/m/${SLUG}/ar?vue=mois`,
			noms: ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'],
			courts: ['ن', 'ث', 'ر', 'خ', 'ج', 'س', 'ح']
		}
	])(
		'names each column by its whole day in $langue, and shows only the short form',
		async ({ chemin, noms, courts }) => {
			const page = await servir(chemin);
			expect(page.statut).toBe(200);
			const colonnes = enTetes(page.html);
			expect(colonnes.map((colonne) => colonne.nom)).toEqual(noms);
			expect(colonnes.map((colonne) => colonne.visible)).toEqual(courts);
		}
	);

	it('hides the whole name from the eye, not from the screen reader', async () => {
		const { html } = await servir(`/m/${SLUG}/ar?vue=mois`);
		const tete = html.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? '';
		const classe = tete.match(/<span class="([^"]*)">الاثنين<\/span>/)?.[1];
		expect(classe, 'le nom entier doit être dans un élément à lui').toBeTruthy();
		// La règle qui le cache, lue dans les feuilles de style réellement servies : ni
		// `display: none` ni `visibility: hidden`, qui le retireraient aussi de l'arbre d'accessibilité.
		const regle = await regleServie(html, `/m/${SLUG}/ar`, classe as string);
		expect(regle, `aucune règle pour la classe « ${classe} »`).toBeTruthy();
		cacheAuxYeuxSeulement(regle);
	});
});

describe('le lien des conditions, au pied de la page publique', () => {
	/** Le lien du pied qui mène à `/conditions`, résolu depuis la page comme un navigateur le ferait. */
	function lienDesConditions(html: string, chemin: string): Record<string, string>[] {
		const pied = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? '';
		return [...pied.matchAll(/<a\b[^>]*>/g)]
			.map((trouve) => attributs(trouve[0]))
			.filter(
				(lien) =>
					new URL((lien['href'] ?? '').replaceAll('&amp;', '&'), `${origin}${chemin}`).pathname ===
					'/conditions'
			);
	}

	it('opens in a new tab inside the frame of the widget, towards a French text', async () => {
		const chemin = `/m/${SLUG}?embed=1`;
		const { html } = await servir(chemin);
		const liens = lienDesConditions(html, chemin);
		expect(liens).toHaveLength(1);
		expect(liens[0]).toMatchObject({ target: '_blank', rel: 'noopener', hreflang: 'fr' });
	});

	// Sans `embed=1`, la page peut quand même être dans un cadre : celui que l'écran Partager donne à
	// coller à la main. Un lien sans cible y chargerait `/conditions`, qui refuse d'être encadrée.
	it('opens in a new tab outside the widget too, since a frame pasted by hand has no embed=1', async () => {
		const chemin = `/m/${SLUG}`;
		const { html } = await servir(chemin);
		const liens = lienDesConditions(html, chemin);
		expect(liens).toHaveLength(1);
		expect(liens[0]).toMatchObject({ target: '_blank', rel: 'noopener', hreflang: 'fr' });
	});

	// Technique G201 des WCAG : un lien qui ouvre un nouvel onglet le dit avant qu'on le suive. Le
	// nom d'un lien est le texte de tout ce qu'il contient : c'est ce qu'un lecteur d'écran annonce,
	// et ce qu'on lit ici une fois les balises retirées. Les textes sont ceux du chef de projet.
	it.each([
		{
			langue: 'fr',
			chemin: `/m/${SLUG}`,
			nom: 'Conditions d’utilisation (s’ouvre dans un nouvel onglet)'
		},
		{
			langue: 'de',
			chemin: `/m/${SLUG}/de?embed=1`,
			nom: 'Nutzungsbedingungen (öffnet sich in einem neuen Tab)'
		},
		{
			langue: 'it',
			chemin: `/m/${SLUG}/it/agenda`,
			nom: 'Condizioni d’uso (si apre in una nuova scheda)'
		},
		{
			langue: 'en',
			chemin: `/m/${SLUG}/en/cours/${COURS.maghrib}`,
			nom: 'Terms of use (opens in a new tab)'
		},
		{
			langue: 'ar',
			chemin: `/m/${SLUG}/ar/cours/${COURS.isha}`,
			nom: 'شروط الاستخدام (يُفتح في علامة تبويب جديدة)'
		}
	])('says in $langue that it opens a new tab, on $chemin', async ({ chemin, nom }) => {
		const { statut, html } = await servir(chemin);
		expect(statut).toBe(200);
		const pied = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? '';
		const lien = [...pied.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].find(
			(trouve) => attributs(`<a${trouve[1]}>`)['target'] === '_blank'
		);
		expect(lien, 'aucun lien du pied n’ouvre de nouvel onglet').toBeTruthy();
		const contenu = (lien?.[2] ?? '').replace(/<!--[\s\S]*?-->/g, '');
		expect(texte(contenu)).toBe(nom);

		// La phrase ajoutée est dans un élément à elle, que la feuille servie cache aux yeux seuls.
		const cache = contenu.match(/<span class="([^"]*)">([^<]*)<\/span>/);
		expect(cache?.[2], 'l’annonce doit être dans un élément à elle').toBeTruthy();
		expect(nom.endsWith(cache?.[2] ?? '\0')).toBe(true);
		const regle = await regleServie(html, chemin, cache?.[1] ?? '');
		expect(regle, `aucune règle pour la classe « ${cache?.[1]} »`).toBeTruthy();
		cacheAuxYeuxSeulement(regle);
	});
});

describe('le flux d’un cours ancré, dans sa langue', () => {
	// La phrase de la page, décalage nul compris : jusqu'à l'étape 17, le flux disait « عند المغرب »
	// et « Zu Fadschr » là où la page dit « بعد المغرب » et « Nach Fadschr ».
	it('names the prayer in Arabic in the Arabic feed, as the page says it', async () => {
		const ics = await flux(COURS.maghrib, 'ar');
		expect(ics).toMatch(/^DESCRIPTION:بعد المغرب\r?$/m);
		expect(ics).not.toContain('Maghrib');
		expect(ics).not.toContain('عند');
	});

	it('says « Après Maghrib » in the French feed, as the page does', async () => {
		const ics = await flux(COURS.maghrib, 'fr');
		expect(ics).toMatch(/^DESCRIPTION:Après Maghrib\r?$/m);
		expect(ics).not.toMatch(/^DESCRIPTION:À /m);
	});

	it('names the prayer as the German page does in the German feed', async () => {
		const aube = await flux(COURS.fajr, 'de');
		expect(aube).toMatch(/^DESCRIPTION:Nach Fadschr\r?$/m);
		expect(aube).not.toContain('Fajr');

		const soir = await flux(COURS.isha, 'de');
		expect(soir).toMatch(/^DESCRIPTION:15 Min\. vor Ischa\r?$/m);
		expect(soir).not.toContain('Isha');
	});

	// Le flux anglais (étape 18) : `?lang=en` retombait sur le français.
	it('says the English page’s sentence in the English feed', async () => {
		const maghrib = await flux(COURS.maghrib, 'en');
		expect(maghrib).toMatch(/^DESCRIPTION:After Maghrib\r?$/m);
		expect(maghrib).not.toContain('Après');

		const soir = await flux(COURS.isha, 'en');
		expect(soir).toMatch(/^DESCRIPTION:15 min before Isha\r?$/m);
		expect(soir).not.toMatch(/avant|-15 min/);
	});
});

describe('un décalage négatif se dit « avant »', () => {
	/** Les heures annoncées pour un cours, jour après jour, dans la vue Semaine. */
	function heuresDe(html: string, titre: string): string[] {
		return [
			...html.matchAll(
				/<span class="heure[^"]*">([^<]*)<\/span>\s*<a class="titre[^"]*" href="[^"]*">([^<]*)<\/a>/g
			)
		]
			.filter((trouve) => trouve[2] === titre)
			.map((trouve) => trouve[1] as string);
	}

	it('on the page, in French and in Arabic, with the time it gives', async () => {
		const francais = heuresDe((await servir(`/m/${SLUG}`)).html, 'Veillée');
		expect(francais).toHaveLength(7);
		expect(new Set(francais)).toEqual(new Set([`15 min avant Isha (${ISHA_MOINS_QUINZE})`]));

		const arabe = heuresDe((await servir(`/m/${SLUG}/ar`)).html, 'Veillée');
		expect(arabe).toHaveLength(7);
		expect(new Set(arabe)).toEqual(new Set([`قبل العشاء بـ15 دقيقة (${ISHA_MOINS_QUINZE})`]));

		// La page du cours décrit l'horaire sans date : la même phrase, sans heure.
		const cours = (await servir(`/m/${SLUG}/cours/${COURS.isha}`)).html;
		expect(cours).toContain('15 min avant Isha');
		expect(cours).not.toMatch(/-15 min|après Isha/);
	});

	it('in the feed, in French and in Arabic', async () => {
		const francais = await flux(COURS.isha, 'fr');
		expect(francais).toMatch(/^DESCRIPTION:15 min avant Isha\r?$/m);
		// « -15 » seul se trouve dans les UID, qui portent la date de la séance.
		expect(francais).not.toMatch(/-15 min|après/);

		const arabe = await flux(COURS.isha, 'ar');
		expect(arabe).toMatch(/^DESCRIPTION:قبل العشاء بـ15 دقيقة\r?$/m);
		expect(arabe).not.toContain('بعد');
	});
});

describe('le 404 d’une adresse publique', () => {
	/** Les cinq textes de la page d'erreur de `/m/`, écrits ici en toutes lettres. */
	const TEXTES = {
		fr: { titre: 'Page introuvable', indice: 'Vérifiez l’adresse.' },
		de: { titre: 'Seite nicht gefunden', indice: 'Bitte prüfen Sie die Adresse.' },
		it: { titre: 'Pagina non trovata', indice: 'Controlla l’indirizzo.' },
		en: { titre: 'Page not found', indice: 'Please check the address.' },
		ar: { titre: 'الصفحة غير موجودة', indice: 'تحقّق من العنوان.' }
	} as const;

	// Jusqu'à l'étape 17, une organisation inconnue passait par la page d'erreur racine : le
	// JavaScript de SvelteKit, sur la seule page de `/m/` qui en chargeait, et un texte en français
	// sous `/ar`. L'erreur était levée par la page, et la frontière d'erreur la plus proche était la
	// racine, dont les options ne connaissent pas le `csr = false` de `/m/<identifiant>`.
	it.each([
		{ chemin: '/m/inconnue', langue: 'fr', dir: 'ltr' },
		{ chemin: '/m/inconnue/ar', langue: 'ar', dir: 'rtl' },
		{ chemin: '/m/inconnue/de/agenda', langue: 'de', dir: 'ltr' },
		// Même dans un cadre : le script d'annonce de hauteur n'a rien à mesurer sur une erreur.
		{ chemin: '/m/inconnue/it?embed=1', langue: 'it', dir: 'ltr' },
		{ chemin: '/m/inconnue/en', langue: 'en', dir: 'ltr' },
		{ chemin: `/m/${SLUG}/en/cours/${newId()}`, langue: 'en', dir: 'ltr' },
		// Une organisation connue, un cours qui ne l'est pas.
		{ chemin: `/m/${SLUG}/ar/cours/${newId()}`, langue: 'ar', dir: 'rtl' },
		// Sans segment, la langue de l'organisation, quand elle est connue.
		{ chemin: `/m/${SLUG_ARABE}/cours/${newId()}`, langue: 'ar', dir: 'rtl' },
		// Une adresse qu'aucune route ne connaît, sous une organisation qui existe.
		{ chemin: `/m/${SLUG}/de/nulle-part`, langue: 'de', dir: 'ltr' },
		{ chemin: `/m/${SLUG}/pas/davantage`, langue: 'fr', dir: 'ltr' },
		// Et sans segment sous une organisation arabe : la route `[...reste]` ne lit pas la base, et
		// ne connaît donc pas sa langue par défaut.
		{ chemin: `/m/${SLUG_ARABE}/nulle-part`, langue: 'fr', dir: 'ltr' }
	] as const)(
		'answers $chemin with a 404 in $langue, and not a single script',
		async ({ chemin, langue, dir }) => {
			const { statut, html } = await servir(chemin);
			expect(statut).toBe(404);
			expect(html.match(/<script\b/g), 'aucune balise script').toBeNull();
			// Ni préchargement de module : c'est l'autre moitié du démarrage de SvelteKit.
			expect(html).not.toMatch(/modulepreload|\/_app\/immutable\/[^"]*\.js/);
			expect(html.match(/<html\b[^>]*>/g)).toEqual([`<html lang="${langue}" dir="${dir}">`]);
			const { titre, indice } = TEXTES[langue];
			expect(texte(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '')).toBe(titre);
			expect(texte(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '')).toBe(titre);
			expect(texte(html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '')).toBe(
				`${titre} ${indice}`
			);
		}
	);

	it('says nothing of an organisation that does not exist, nor of the text it was thrown with', async () => {
		const { html } = await servir('/m/inconnue/ar');
		expect(html).not.toContain('inconnue');
		expect(html).not.toContain('Page introuvable.');
	});
});

/**
 * Le texte qu'une personne lit : le titre de l'onglet et le corps, sans balise, sans attribut, sans
 * script ni style ni commentaire, les entités rendues. Une date dans une adresse de lien ou dans un
 * `id` n'est pas lue ; elle n'est donc pas cherchée.
 */
function texteLu(html: string): string {
	const titre = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '';
	const corps = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
	return texte(
		`${titre} ${corps}`
			.replace(/<script\b[\s\S]*?<\/script>/g, ' ')
			.replace(/<style\b[\s\S]*?<\/style>/g, ' ')
			.replace(/<!--[\s\S]*?-->/g, ' ')
			.replace(/<[^>]+>/g, ' ')
	)
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&#39;', "'")
		.replaceAll('&nbsp;', ' ')
		.replaceAll('&amp;', '&');
}

describe('une page publique en anglais britannique', () => {
	it('speaks English on the programme, and not a word of the French interface', async () => {
		const { statut, html } = await servir(`/m/${SLUG}/en`);
		expect(statut).toBe(200);
		const lu = texteLu(html);
		expect(lu).toContain('Association des langues | This week’s courses');
		for (const mot of [
			'Week',
			'All courses',
			'Month',
			'Children',
			'Open to all',
			'Subscribe to the calendar',
			'Terms of use',
			'Provided free of charge by jadwal, a service from Voltia',
			'15 min before Isha',
			'After Maghrib'
		]) {
			expect(lu, mot).toContain(mot);
		}
		for (const mot of ['Semaine', 'Tous les cours', 'S’abonner', 'Proposé gratuitement', 'avant']) {
			expect(lu, mot).not.toContain(mot);
		}
		// La liste des langues porte son nom dans la langue de la page, et plus « Langues » partout.
		expect(html).toContain('aria-label="Languages"');
		expect(html).not.toContain('aria-label="Langues"');
		// Le choix de langue propose l'anglais, sous son nom anglais.
		expect(html).toMatch(/<a\b[^>]*hreflang="en"[^>]*>\s*English\s*<\/a>/);
	});

	it('explains the subscription in English', async () => {
		// Le bouton dépend de l'appareil depuis l'étape 18 (retour E1) : celui d'un iPhone, ici.
		const reponse = await fetch(`${origin}/m/${SLUG}/en/agenda`, {
			headers: {
				'user-agent':
					'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
			}
		});
		const lu = texteLu(await reponse.text());
		for (const phrase of [
			'Subscribe to the calendar',
			'The whole programme',
			'Add to my calendar',
			'Adding the address by hand',
			'On iPhone and iPad',
			'On Android',
			'In Outlook'
		]) {
			expect(lu, phrase).toContain(phrase);
		}
	});

	it('describes a course in English, and its feed stays in English', async () => {
		const { statut, html } = await servir(`/m/${SLUG}/en/cours/${COURS.isha}`);
		expect(statut).toBe(200);
		const lu = texteLu(html);
		for (const phrase of ['Upcoming sessions', 'Taught in', 'Add this course to my calendar']) {
			expect(lu, phrase).toContain(phrase);
		}
		expect(lu).toContain(`/m/${SLUG}/agenda/${COURS.isha}.ics?lang=en`);
	});
});

describe('les langues qu’une organisation propose', () => {
	/** Les versions linguistiques annoncées aux moteurs, et elles seules. */
	function versions(html: string): string[] {
		return [...html.matchAll(/<link\b[^>]*\srel="alternate"[^>]*>/g)].map(
			(trouve) => attributs(trouve[0])['hreflang'] ?? ''
		);
	}

	it('offers English where the organisation enabled it', async () => {
		const { html } = await servir(`/m/${SLUG}`);
		expect(versions(html)).toEqual(['fr', 'de', 'it', 'en', 'ar', 'x-default']);
	});

	it('does not offer English where the organisation did not enable it', async () => {
		const { html } = await servir(`/m/${SLUG_ARABE}`);
		expect(versions(html)).toEqual(['fr', 'ar', 'x-default']);
		expect(html).not.toContain('hreflang="en"');
		expect(texteLu(html)).not.toContain('English');
	});
});

/**
 * Une langue que l'organisation ne publie pas (décision du chef de projet, 27.09.2026) : l'adresse
 * renvoie vers la même page dans la langue par défaut, son adresse courte, sans le segment de
 * langue, filtres gardés. Elle répondait jusque-là, dans une langue que l'organisation n'avait pas
 * choisie. Un renvoi temporaire, 307 : l'organisation peut l'activer demain.
 */
describe('une langue que l’organisation ne publie pas', () => {
	it.each([
		{ chemin: `/m/${SLUG_ARABE}/en`, vers: `/m/${SLUG_ARABE}` },
		{ chemin: `/m/${SLUG_ARABE}/de/agenda`, vers: `/m/${SLUG_ARABE}/agenda` },
		{
			chemin: `/m/${SLUG_ARABE}/it/cours/${COURS.arabe}`,
			vers: `/m/${SLUG_ARABE}/cours/${COURS.arabe}`
		},
		{
			chemin: `/m/${SLUG_ARABE}/en?vue=mois&public=kids`,
			vers: `/m/${SLUG_ARABE}?vue=mois&public=kids`
		},
		{
			chemin: `/m/${SLUG_ARABE}/de/agenda?appareil=tous`,
			vers: `/m/${SLUG_ARABE}/agenda?appareil=tous`
		}
	])('sends $chemin to $vers', async ({ chemin, vers }) => {
		const reponse = await fetch(`${origin}${chemin}`, { redirect: 'manual' });
		await reponse.arrayBuffer();
		expect(reponse.status).toBe(307);
		const lieu = new URL(reponse.headers.get('location') ?? '', `${origin}${chemin}`);
		expect(`${lieu.pathname}${lieu.search}`).toBe(vers);
		expect(lieu.origin).toBe(origin);
	});

	it('still answers a language it publishes, and its short address', async () => {
		expect((await servir(`/m/${SLUG_ARABE}/fr`)).statut).toBe(200);
		expect((await servir(`/m/${SLUG_ARABE}/fr/agenda`)).statut).toBe(200);
		expect((await servir(`/m/${SLUG_ARABE}`)).statut).toBe(200);
		expect((await servir(`/m/${SLUG}/en`)).statut).toBe(200);
	});
});

/**
 * La langue de la page pour les aperçus de partage (Open Graph), décision du chef de projet au
 * 27.09.2026 : une langue et un pays, `fr_CH`, `de_CH`, `it_CH`, `en_GB` et `ar_AR`, et une balise
 * `og:locale:alternate` par autre langue que l'organisation publie. La page disait `fr`, `ar`.
 */
describe('la langue des aperçus de partage (og:locale)', () => {
	/** `og:locale`, puis chaque `og:locale:alternate`, dans l'ordre de la page. */
	function locales(html: string): { locale: string[]; alternates: string[] } {
		const valeurs = (propriete: string) =>
			[...html.matchAll(/<meta\b[^>]*>/g)]
				.map((trouve) => attributs(trouve[0]))
				.filter((meta) => meta['property'] === propriete)
				.map((meta) => meta['content'] ?? '');
		return { locale: valeurs('og:locale'), alternates: valeurs('og:locale:alternate') };
	}

	it.each([
		{ chemin: `/m/${SLUG}`, locale: 'fr_CH', alternates: ['de_CH', 'it_CH', 'en_GB', 'ar_AR'] },
		{ chemin: `/m/${SLUG}/de`, locale: 'de_CH', alternates: ['fr_CH', 'it_CH', 'en_GB', 'ar_AR'] },
		{
			chemin: `/m/${SLUG}/it/agenda`,
			locale: 'it_CH',
			alternates: ['fr_CH', 'de_CH', 'en_GB', 'ar_AR']
		},
		{
			chemin: `/m/${SLUG}/en/cours/${COURS.isha}`,
			locale: 'en_GB',
			alternates: ['fr_CH', 'de_CH', 'it_CH', 'ar_AR']
		},
		{
			chemin: `/m/${SLUG}/ar?vue=mois`,
			locale: 'ar_AR',
			alternates: ['fr_CH', 'de_CH', 'it_CH', 'en_GB']
		},
		// Une organisation qui ne publie que l'arabe et le français : une seule autre langue.
		{ chemin: `/m/${SLUG_ARABE}`, locale: 'ar_AR', alternates: ['fr_CH'] },
		{ chemin: `/m/${SLUG_ARABE}/fr/agenda`, locale: 'fr_CH', alternates: ['ar_AR'] },
		{ chemin: `/m/${SLUG_ARABE}/cours/${COURS.arabe}`, locale: 'ar_AR', alternates: ['fr_CH'] }
	])(
		'says $locale on $chemin, and the other languages it publishes',
		async ({ chemin, locale, alternates }) => {
			const { statut, html } = await servir(chemin);
			expect(statut).toBe(200);
			expect(locales(html)).toEqual({ locale: [locale], alternates });
		}
	);
});

/**
 * Les dates du public, depuis l'étape 18 : `JJ.MM.AAAA`, précédées ou non du nom du jour, dans les
 * cinq langues. Et jamais la forme de la base, `AAAA-MM-JJ`, dans ce qu'une personne lit.
 */
describe('les dates du public', () => {
	const today = todayInZone(FUSEAU, new Date());
	/** Aujourd'hui, écrit ici sans passer par le code qu'on éprouve. */
	const [annee, mois, jour] = today.split('-');
	const AUJOURDHUI = `${jour}.${mois}.${annee}`;
	const ISO = /(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/;
	const SUISSE = /(?<!\d)\d{2}\.\d{2}\.\d{4}(?!\d)/;

	const LANGUES = ['fr', 'de', 'it', 'en', 'ar'] as const;
	const base = (langue: string) => (langue === 'fr' ? `/m/${SLUG}` : `/m/${SLUG}/${langue}`);
	/** Chaque page publique, et si une date du jour doit s'y lire. */
	const PAGES_DATEES = LANGUES.flatMap((langue) => [
		{ langue, chemin: base(langue), attendu: AUJOURDHUI },
		{ langue, chemin: `${base(langue)}?vue=cours`, attendu: AUJOURDHUI },
		{ langue, chemin: `${base(langue)}?vue=mois&jour=${today}`, attendu: AUJOURDHUI },
		{ langue, chemin: `${base(langue)}/cours/${COURS.isha}`, attendu: AUJOURDHUI },
		// La page d'un cours qui finit porte une date de plus, sur sa ligne « Dates ».
		{ langue, chemin: `${base(langue)}/cours/${COURS.borne}`, attendu: AUJOURDHUI },
		{ langue, chemin: `${base(langue)}/agenda`, attendu: null }
	]);

	it.each(PAGES_DATEES)(
		'writes the dates of $chemin as JJ.MM.AAAA, never as AAAA-MM-JJ',
		async ({ chemin, attendu }) => {
			const { statut, html } = await servir(chemin);
			expect(statut).toBe(200);
			const lu = texteLu(html);
			expect(lu.match(ISO)?.[0] ?? null, 'une date AAAA-MM-JJ dans le texte lu').toBeNull();
			if (attendu) {
				expect(lu).toContain(attendu);
				expect(lu).toMatch(SUISSE);
			}
		}
	);

	it('writes the period of the week and each day as JJ.MM.AAAA, in each language', async () => {
		const semaine = addDays(today, 6);
		const [a, m, j] = semaine.split('-');
		const fin = `${j}.${m}.${a}`;
		const periodes = await Promise.all(
			LANGUES.map(async (langue) => {
				const html = (await servir(base(langue))).html;
				return texte(html.match(/<p class="periode[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? '');
			})
		);
		expect(periodes).toEqual([
			`Du ${AUJOURDHUI} au ${fin}`,
			`Vom ${AUJOURDHUI} bis ${fin}`,
			`Dal ${AUJOURDHUI} al ${fin}`,
			`From ${AUJOURDHUI} to ${fin}`,
			`من ${AUJOURDHUI} إلى ${fin}`
		]);
	});

	it('does not echo an impossible day written in the address', async () => {
		const { statut, html } = await servir(`/m/${SLUG}?vue=mois&jour=2026-02-30`);
		expect(statut).toBe(200);
		expect(texteLu(html)).not.toContain('2026-02-30');
	});

	/** Les termes de la liste d'une page de cours, chacun suivi de sa valeur : « Lieu Grande salle ». */
	function lignesDuCours(html: string): string[] {
		const liste = html.match(/<dl\b[^>]*>([\s\S]*?)<\/dl>/)?.[1] ?? '';
		return [...liste.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/g)].map(
			(trouve) => `${texte(trouve[1] ?? '')} ${texte(trouve[2] ?? '')}`
		);
	}

	// La fin du cours borné, écrite ici sans passer par le code qu'on éprouve.
	const [finA, finM, finJ] = FIN_DU_COURS_BORNE.split('-');
	const FIN = `${finJ}.${finM}.${finA}`;
	const [debutA, debutM, debutJ] = DEBUT_DES_COURS.split('-');
	const DEBUT = `${debutJ}.${debutM}.${debutA}`;

	it.each([
		{ langue: 'fr', ligne: `Dates Du ${DEBUT} au ${FIN}` },
		{ langue: 'de', ligne: `Zeitraum Vom ${DEBUT} bis ${FIN}` },
		{ langue: 'it', ligne: `Date Dal ${DEBUT} al ${FIN}` },
		{ langue: 'en', ligne: `Dates From ${DEBUT} to ${FIN}` },
		{ langue: 'ar', ligne: `الفترة من ${DEBUT} إلى ${FIN}` }
	])(
		'says in $langue from when to when a course that ends runs, as JJ.MM.AAAA',
		async ({ langue, ligne }) => {
			const { statut, html } = await servir(`${base(langue)}/cours/${COURS.borne}`);
			expect(statut).toBe(200);
			expect(lignesDuCours(html)).toContain(ligne);
		}
	);

	it('says nothing of an end on the page of a course that has none', async () => {
		const { html } = await servir(`/m/${SLUG}/en/cours/${COURS.isha}`);
		expect(lignesDuCours(html).filter((ligne) => ligne.startsWith('Dates'))).toEqual([]);
	});
});

/**
 * Le nom de la liste des langues, dans chacun des trois gabarits qui la portent : l'en-tête des
 * vues, l'abonnement et la page d'un cours. Il était écrit « Langues » en dur dans les trois, donc
 * annoncé en français sur une page arabe ; seul l'en-tête était vérifié.
 */
describe('le nom de la liste des langues', () => {
	const NOMS = {
		fr: 'Langues',
		de: 'Sprachen',
		it: 'Lingue',
		en: 'Languages',
		ar: 'اللغات'
	} as const;
	const base = (langue: string) => (langue === 'fr' ? `/m/${SLUG}` : `/m/${SLUG}/${langue}`);
	const CAS = (Object.keys(NOMS) as (keyof typeof NOMS)[]).flatMap((langue) =>
		['', '/agenda', `/cours/${COURS.borne}`].map((suite) => ({
			langue,
			chemin: `${base(langue)}${suite}`,
			nom: NOMS[langue]
		}))
	);

	it.each(CAS)('is « $nom » on $chemin', async ({ chemin, nom }) => {
		const { statut, html } = await servir(chemin);
		expect(statut).toBe(200);
		const listes = [...html.matchAll(/<nav\b[^>]*\bclass="langues\b[^"]*"[^>]*>/g)];
		expect(listes, 'une seule liste des langues').toHaveLength(1);
		expect(attributs(listes[0]?.[0] ?? '')['aria-label']).toBe(nom);
	});
});

/**
 * Les deux autres listes de liens de l'en-tête, les vues et les publics, portent chacune un nom qui
 * dit ce qu'elles font. Elles s'appelaient « Semaine » et « Tous » : un lecteur d'écran annonçait
 * « Week, navigation » devant les trois vues, et « All, navigation » devant les publics.
 */
describe('le nom des vues et des publics, dans l’en-tête', () => {
	const base = (langue: string) => (langue === 'fr' ? `/m/${SLUG}` : `/m/${SLUG}/${langue}`);

	it.each([
		{ langue: 'fr', vues: 'Affichage', publics: 'Filtrer par public' },
		{ langue: 'de', vues: 'Ansicht', publics: 'Nach Zielgruppe filtern' },
		{ langue: 'it', vues: 'Visualizzazione', publics: 'Filtra per pubblico' },
		{ langue: 'en', vues: 'View', publics: 'Filter by group' },
		{ langue: 'ar', vues: 'طريقة العرض', publics: 'تصفية حسب الفئة' }
	])('names them « $vues » and « $publics » in $langue', async ({ langue, vues, publics }) => {
		const { statut, html } = await servir(base(langue));
		expect(statut).toBe(200);
		const nom = (classe: string) =>
			[...html.matchAll(new RegExp(`<nav\\b[^>]*\\bclass="${classe}\\b[^"]*"[^>]*>`, 'g'))].map(
				(trouve) => attributs(trouve[0])['aria-label']
			);
		expect(nom('vues')).toEqual([vues]);
		expect(nom('filtres')).toEqual([publics]);
	});
});

/**
 * La vue « Tous les cours » : sous chaque cours, ses prochaines séances, puis le lien vers sa page.
 *
 * Jusqu'ici, la ligne des séances était écrite « {libellé} : » dans le gabarit, avec l'espace que le
 * français met devant les deux-points, et la page anglaise lisait « Upcoming sessions : ». Les dates
 * y étaient séparées par la virgule latine, en arabe aussi, et en allemand par une virgule qui se
 * confondait avec celle qui suit le nom du jour (« Samstag, 26.09.2026, Montag, 28.09.2026 »). Le
 * lien vers la page du cours portait le mot du fil d'Ariane, « Courses » au pluriel.
 */
describe('la vue « Tous les cours », dans chaque langue', () => {
	const today = todayInZone(FUSEAU, new Date());
	/** Les jours de la semaine, écrits ici sans passer par le code qu'on éprouve, lundi d'abord. */
	const JOURS = {
		fr: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
		de: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
		it: ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'],
		en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
		ar: ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']
	} as const;
	/** « samedi 26.09.2026 », « Samstag, 26.09.2026 ». */
	function jourEtDate(langue: keyof typeof JOURS, date: IsoDate): string {
		const [a, m, j] = date.split('-');
		const nom = JOURS[langue][weekdayFromDays(isoDateToDays(date)) - 1];
		return `${nom}${langue === 'de' ? ',' : ''} ${j}.${m}.${a}`;
	}
	/** Les trois prochaines séances du cours borné, qui a lieu chaque jour. */
	const trois = (langue: keyof typeof JOURS) =>
		[0, 1, 2].map((pas) => jourEtDate(langue, addDays(today, pas)));

	/** Le bloc d'un cours dans la vue, de son `<details>` à la fin de celui-ci. */
	function bloc(html: string, courseId: string): string {
		const debut = html.indexOf(`id="cours-${courseId}"`);
		expect(debut, `le cours ${courseId} manque à la vue`).toBeGreaterThan(-1);
		return html.slice(debut, html.indexOf('</details>', debut));
	}

	it.each([
		{
			langue: 'fr' as const,
			chemin: `/m/${SLUG}?vue=cours`,
			ligne: `Prochaines séances : ${trois('fr').join(', ')}`,
			lien: 'Page du cours'
		},
		{
			langue: 'de' as const,
			chemin: `/m/${SLUG}/de?vue=cours`,
			ligne: `Nächste Termine: ${trois('de').join('; ')}`,
			lien: 'Seite des Kurses'
		},
		{
			langue: 'it' as const,
			chemin: `/m/${SLUG}/it?vue=cours`,
			ligne: `Prossime lezioni: ${trois('it').join(', ')}`,
			lien: 'Pagina del corso'
		},
		{
			langue: 'en' as const,
			chemin: `/m/${SLUG}/en?vue=cours`,
			ligne: `Upcoming sessions: ${trois('en').join(', ')}`,
			lien: 'Course page'
		},
		{
			langue: 'ar' as const,
			chemin: `/m/${SLUG}/ar?vue=cours`,
			ligne: `الحصص القادمة: ${trois('ar').join('، ')}`,
			lien: 'صفحة الدرس'
		}
	])(
		'lists the upcoming sessions with the punctuation of $langue, and names the link « $lien »',
		async ({ chemin, ligne, lien }) => {
			const { statut, html } = await servir(chemin);
			expect(statut).toBe(200);
			const cours = bloc(html, COURS.borne);
			expect(texte(cours.match(/<p class="details[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? '')).toBe(ligne);
			// Le lien vers la page de ce cours, et lui seul.
			const liens = [...cours.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].filter((trouve) =>
				(attributs(`<a${trouve[1]}>`)['href'] ?? '').endsWith(`/cours/${COURS.borne}`)
			);
			expect(liens.map((trouve) => texte(trouve[2] ?? ''))).toEqual([lien]);
		}
	);
});

/**
 * La ponctuation de chaque langue, dans tout ce que les pages publiques donnent à lire. L'espace
 * avant les deux-points, le point-virgule, le point d'interrogation et le point d'exclamation est
 * une règle du français, et de lui seul.
 */
describe('la ponctuation des pages publiques', () => {
	const PAGES_A_LIRE = (['de', 'it', 'en', 'ar'] as const).flatMap((langue) =>
		['', '?vue=cours', '?vue=mois', '/agenda', `/cours/${COURS.borne}`].map((suite) => ({
			langue,
			chemin: `/m/${SLUG}/${langue}${suite}`
		}))
	);

	it.each(PAGES_A_LIRE)('puts no space before : ; ? or ! on $chemin', async ({ chemin }) => {
		const { statut, html } = await servir(chemin);
		expect(statut).toBe(200);
		expect(texteLu(html).match(/.{0,30}\s[:;?!؟؛].{0,10}/)?.[0] ?? null).toBeNull();
	});
});

// Chaque page dans sa langue, servie par HTTP : la balise `<html>`, les en-têtes de la vue Mois, le
// lien des conditions au pied, le flux d'un cours ancré sur une prière, et le 404 d'une adresse
// publique.
//
// Ces promesses sont déjà tenues par des fonctions éprouvées une à une (`i18n.test.ts`,
// `affichage.test.ts`, `agenda.test.ts`, `Pied.test.ts`). Ce fichier éprouve ce qu'aucun test
// unitaire ne voit : le hook qui écrit la langue sur `<html>` une fois la page rendue, chaque route
// qui la pose ou ne la pose pas, la page d'erreur que SvelteKit choisit, et le flux réellement
// servi. Vrai serveur construit, vraie base.

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { addDays, todayInZone } from '@jadwal/core';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';

const origin = inject('origin');
const testDatabase = inject('testDatabase');

const FUSEAU = 'Europe/Zurich';
/** Une organisation en français par défaut, qui parle les quatre langues et a le module des prières. */
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
	arabe: newId()
};

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

/** Un cours de tous les jours, posé par le propriétaire : l'application publique ne sait pas écrire. */
async function poserCours(
	id: string,
	organizationId: string,
	titre: string,
	horaire: { priere: string; decalage: number } | { debut: string; fin: string }
): Promise<void> {
	const ancre = 'priere' in horaire;
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
				"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "timing_prayer",
				"timing_offset_minutes", "timing_duration_minutes", "starts_on")
			values (${id}, ${organizationId}, 'published', 'open', array['fr'], 'fr', 'weekly',
				array[1,2,3,4,5,6,7]::smallint[], 1, '2026-09-07', ${ancre ? 'prayer' : 'fixed'},
				${ancre ? null : horaire.debut}, ${ancre ? null : horaire.fin},
				${ancre ? horaire.priere : null}, ${ancre ? horaire.decalage : null},
				${ancre ? 60 : null}, '2026-09-07')
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
				array['fr','de','it','ar'], true)
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
	/** Les quatre textes de la page d'erreur de `/m/`, écrits ici en toutes lettres. */
	const TEXTES = {
		fr: { titre: 'Page introuvable', indice: 'Vérifiez l’adresse.' },
		de: { titre: 'Seite nicht gefunden', indice: 'Bitte prüfen Sie die Adresse.' },
		it: { titre: 'Pagina non trovata', indice: 'Controlla l’indirizzo.' },
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

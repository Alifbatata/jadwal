// L'écran des heures de prière (étape 18, retours C1, C2, B1, D2 et A3), servi par HTTP.
//
// Le réglage commence par une seule question, « D'où viennent vos heures de prière ? », et chaque
// réponse n'affiche que ce qu'elle demande (C1). La localité se choisit par son nom ou son NPA dans
// la liste officielle embarquée, par une route réservée aux responsables, ou sans JavaScript par un
// formulaire qui rend la liste ; les coordonnées restent possibles « Hors de Suisse » (C2). Et
// l'écran parle les cinq langues de l'espace, dates en JJ.MM.AAAA comprises (D2, A3).
//
// Vrai serveur construit, vraie base, formulaires envoyés comme sans JavaScript. `prieres.test.ts`
// éprouve, lui, ce que les heures deviennent sur la page publique.

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { addDays, todayInZone } from '@jadwal/core';
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

const FUSEAU = 'Europe/Zurich';
const ORGANISATION = 'Association des heures de prière';
/** Responsable de l'organisation, module allumé. Sa langue est choisie test après test. */
const RESPONSABLE = 'prieres-cinq-responsable@example.test';
/** Éditeur de la même organisation : il n'ouvre pas l'écran, ni sa recherche. */
const EDITEUR = 'prieres-cinq-editeur@example.test';
/** Responsable d'une organisation qui n'a pas allumé le module. */
const SANS_MODULE = 'prieres-cinq-sans-module@example.test';

/** La ligne de Biel/Bienne dans la liste embarquée, lue ici sans passer par le module du serveur. */
const BIENNE = (() => {
	const ligne = readFileSync(
		new URL('../src/lib/server/localites/localities.csv', import.meta.url),
		'utf8'
	)
		.split(/\r?\n/)
		.find((texte) => texte.startsWith('2502;Biel/Bienne;'));
	const [, , , , latitude, longitude] = (ligne ?? '').split(';');
	return { latitude: Number(latitude), longitude: Number(longitude) };
})();
const BIENNE_AFFICHEE = '2502 Biel/Bienne (BE)';
const BIENNE_CHOISIE = '2502|Biel/Bienne';

/** Les réglages du calcul, tels que le formulaire les envoie. */
const CALCUL = {
	method: 'MuslimWorldLeague',
	madhab: 'shafi',
	highLatitudeRule: 'middleofthenight',
	fajrAdjustment: '0',
	dhuhrAdjustment: '0',
	asrAdjustment: '0',
	maghribAdjustment: '0',
	ishaAdjustment: '0'
};

/** La question, et ses trois réponses, dans chaque langue (C1). */
const QUESTION: Record<Langue, string> = {
	fr: 'D’où viennent vos heures de prière ?',
	de: 'Woher kommen Ihre Gebetszeiten?',
	it: 'Da dove vengono i tuoi orari di preghiera?',
	en: 'Where do your prayer times come from?',
	ar: 'من أين تأتي مواقيت الصلاة لديك؟'
};
const REPONSES: Record<Langue, [string, string, string]> = {
	fr: ['Calculées pour votre localité', 'Importées depuis un fichier', 'Saisies à la main'],
	de: ['Berechnet für Ihren Ort', 'Aus einer Datei importiert', 'Von Hand eingegeben'],
	it: ['Calcolati per la tua località', 'Importati da un file', 'Inseriti a mano'],
	en: ['Calculated for your town or village', 'Imported from a file', 'Entered by hand'],
	ar: ['محسوبة لبلدتك', 'مستوردة من ملف', 'مُدخلة يدويًا']
};
/** L'ordre de priorité entre les sources, en une phrase (C1). */
const PRIORITE: Record<Langue, string> = {
	fr: 'Si plusieurs sources donnent une heure pour le même jour, la saisie à la main passe avant le fichier, et le fichier avant le calcul.',
	de: 'Geben mehrere Quellen für denselben Tag eine Zeit an, geht die Eingabe von Hand der Datei vor, und die Datei der Berechnung.',
	it: 'Se più fonti danno un orario per lo stesso giorno, l’inserimento a mano ha la precedenza sul file, e il file sul calcolo.',
	en: 'If several sources give a time for the same day, times entered by hand come before the file, and the file before the calculation.',
	ar: 'إذا أعطت عدة مصادر وقتًا لليوم نفسه، فالإدخال اليدوي يسبق الملف، والملف يسبق الحساب.'
};
/** Le repli des coordonnées (C2). */
const HORS_DE_SUISSE: Record<Langue, string> = {
	fr: 'Hors de Suisse',
	de: 'Ausserhalb der Schweiz',
	it: 'Fuori dalla Svizzera',
	en: 'Outside Switzerland',
	ar: 'خارج سويسرا'
};
/** La mention de la source, sous l'une des formes que swisstopo accepte, dans chaque langue. */
const SWISSTOPO: Record<Langue, string> = {
	fr: 'Office fédéral de topographie swisstopo',
	de: 'Bundesamt für Landestopografie swisstopo',
	it: 'Ufficio federale di topografia swisstopo',
	en: 'Federal Office of Topography swisstopo',
	ar: '©swisstopo'
};
/** En arabe seulement : la liste n'a pas de noms arabes, on y tape en lettres latines. */
const LETTRES_LATINES =
	'اكتب الرمز البريدي أو اسم البلدة بحروف لاتينية، فالقائمة لا تتضمن أسماء عربية.';

let ownerHandle: DatabaseHandle;
let organizationId: string;
let sansModuleId: string;
const ids: Record<string, string> = {};
const sessions: Record<string, string> = {};

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

async function poserLangueDuCompte(email: string, langue: Langue): Promise<void> {
	await maintenance((tx) =>
		tx.execute(sql`update "user" set "language" = ${langue} where "email" = ${email}`)
	);
}

async function get(chemin: string, qui: string = RESPONSABLE): Promise<Response> {
	return fetch(`${origin}${chemin}`, {
		redirect: 'manual',
		headers: { accept: 'text/html', cookie: sessions[qui] ?? '' }
	});
}

async function postForm(
	chemin: string,
	champs: Record<string, string>,
	qui: string = RESPONSABLE
): Promise<Response> {
	return fetch(`${origin}${chemin}`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			accept: 'text/html',
			origin,
			cookie: sessions[qui] ?? ''
		},
		body: new URLSearchParams(champs).toString()
	});
}

/** Envoie un fichier, comme un `<input type="file">` sans JavaScript. */
async function postFichier(chemin: string, nom: string, contenu: string): Promise<Response> {
	const corps = new FormData();
	corps.append('ordre', 'auto');
	corps.append('calendrier', new Blob([contenu], { type: 'text/csv' }), nom);
	return fetch(`${origin}${chemin}`, {
		method: 'POST',
		redirect: 'manual',
		headers: { accept: 'text/html', origin, cookie: sessions[RESPONSABLE] ?? '' },
		body: corps
	});
}

function titre(html: string): string {
	return (html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim();
}

/** Les cases d'un groupe de boutons radio, dans l'ordre : leur valeur, et si elles sont cochées. */
function radios(html: string, nom: string): { valeur: string; cochee: boolean }[] {
	return [...html.matchAll(/<input\b[^>]*>/g)]
		.map((trouve) => trouve[0])
		.filter((balise) => balise.includes(`name="${nom}"`) && balise.includes('type="radio"'))
		.map((balise) => ({
			valeur: balise.match(/\bvalue="([^"]*)"/)?.[1] ?? '',
			cochee: /\schecked(?:=""|\s|\/?>)/.test(balise)
		}));
}

/** Le premier `<details>` dont le résumé porte ce texte, contenu compris. */
function replie(html: string, resume: string): string {
	return (
		[...html.matchAll(/<details\b[\s\S]*?<\/details>/g)]
			.map((trouve) => trouve[0])
			.find((bloc) =>
				(bloc.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1] ?? '').includes(resume)
			) ?? ''
	);
}

async function signIn(email: string): Promise<string> {
	await maintenance((tx) => tx.execute(sql`delete from "rate_limit"`));
	await fetch(`${origin}/connexion`, {
		method: 'POST',
		redirect: 'manual',
		headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html', origin },
		body: new URLSearchParams({ email }).toString()
	});
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

/** La position enregistrée pour l'organisation, relevée par le propriétaire. */
async function positionEnregistree(): Promise<{
	latitude: number | null;
	longitude: number | null;
}> {
	const trouve = await maintenance(async (tx) =>
		lignes<{ latitude: number | null; longitude: number | null }>(
			await tx.execute(sql`
				select "latitude", "longitude" from "prayer_settings"
				where "organization_id" = ${organizationId}
			`)
		)
	);
	return {
		latitude: trouve[0]?.latitude === undefined ? null : trouve[0].latitude,
		longitude: trouve[0]?.longitude === undefined ? null : trouve[0].longitude
	};
}

async function nombreDePeriodes(): Promise<number> {
	const trouve = await maintenance(async (tx) =>
		lignes<{ n: string }>(
			await tx.execute(sql`
				select count(*)::text as n from "prayer_period" where "organization_id" = ${organizationId}
			`)
		)
	);
	return Number(trouve[0]?.n ?? 0);
}

/** « 26.09.2026 », sans passer par le code du serveur. */
function jjmmaaaa(date: string): string {
	const [annee, mois, jour] = date.split('-');
	return `${jour}.${mois}.${annee}`;
}

const aujourdhui = () => todayInZone(FUSEAU, new Date());

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	organizationId = newId();
	sansModuleId = newId();
	for (const email of [RESPONSABLE, EDITEUR, SANS_MODULE]) ids[email] = newId();
	await maintenance(async (tx) => {
		for (const [id, slug, nom, module] of [
			[organizationId, 'prieres-cinq', ORGANISATION, true],
			[sansModuleId, 'prieres-cinq-sans-module', 'Association sans module', false]
		] as const) {
			await tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
					"enabled_language", "prayer_module")
				values (${id}, ${slug}, ${nom}, ${FUSEAU}, 'fr', array['fr','de','it','en','ar'], ${module})
			`);
		}
		for (const email of Object.keys(ids)) {
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified", "language")
				values (${ids[email] ?? ''}, ${email}, true, 'fr')
			`);
		}
		for (const [email, organisation, role] of [
			[RESPONSABLE, organizationId, 'org_admin'],
			[EDITEUR, organizationId, 'editor'],
			[SANS_MODULE, sansModuleId, 'org_admin']
		] as const) {
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organisation}, ${ids[email] ?? ''}, ${role})
			`);
			await tx.execute(conditionsAcceptees(organisation, ids[email] ?? ''));
		}
	});
	for (const email of Object.keys(ids)) sessions[email] = await signIn(email);
});

afterAll(async () => {
	await ownerHandle?.close();
});

describe('une seule question d’abord (retour C1)', () => {
	it.each(LANGUES)('asks where the times come from, with three answers, in %s', async (langue) => {
		await poserLangueDuCompte(RESPONSABLE, langue);
		const reponse = await get('/prieres');
		expect(reponse.status).toBe(200);
		const html = await reponse.text();
		const lu = visibleText(html);
		expect(lu).toContain(QUESTION[langue]);
		for (const libelle of REPONSES[langue]) expect(lu).toContain(libelle);
		expect(lu).toContain(PRIORITE[langue]);
		// Aucune réponse n'est encore choisie : rien d'autre à remplir que la question.
		expect(radios(html, 'source')).toEqual([
			{ valeur: 'computed', cochee: false },
			{ valeur: 'import', cochee: false },
			{ valeur: 'manual', cochee: false }
		]);
		for (const champ of ['lieu', 'latitude', 'calendrier', 'fromDate']) {
			expect(html, champ).not.toContain(`name="${champ}"`);
		}
	});

	it('no longer asks for a « declared source »', async () => {
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		for (const reponse of ['', '?source=computed', '?source=import', '?source=manual']) {
			const html = await (await get(`/prieres${reponse}`)).text();
			expect(visibleText(html), reponse).not.toContain('Source que vous déclarez');
			expect(html, reponse).not.toMatch(/<select\b[^>]*name="source"/);
		}
	});

	it('shows, for each answer, only what it asks', async () => {
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const calcul = await (await get('/prieres?source=computed')).text();
		expect(radios(calcul, 'source').find((radio) => radio.cochee)?.valeur).toBe('computed');
		expect(calcul).toContain('name="lieu"');
		expect(calcul).not.toContain('name="calendrier"');

		const fichier = await (await get('/prieres?source=import')).text();
		expect(radios(fichier, 'source').find((radio) => radio.cochee)?.valeur).toBe('import');
		expect(fichier).toContain('name="calendrier"');
		expect(fichier).not.toContain('name="lieu"');
		expect(fichier).not.toContain('name="latitude"');

		const main = await (await get('/prieres?source=manual')).text();
		expect(radios(main, 'source').find((radio) => radio.cochee)?.valeur).toBe('manual');
		expect(main).toContain('name="fromDate"');
		expect(main).not.toContain('name="lieu"');
		expect(main).not.toContain('name="calendrier"');
	});
});

describe('la localité, par son nom ou son NPA (retour C2)', () => {
	it('is searched by a route of the space, which answers the list of localities', async () => {
		const reponse = await get('/prieres/localites?q=2502');
		expect(reponse.status).toBe(200);
		expect(reponse.headers.get('content-type')).toContain('application/json');
		const trouvees = (await reponse.json()) as {
			postcode: string;
			name: string;
			canton: string;
			latitude: number;
			longitude: number;
		}[];
		expect(trouvees[0]).toEqual({
			postcode: '2502',
			name: 'Biel/Bienne',
			canton: 'BE',
			latitude: BIENNE.latitude,
			longitude: BIENNE.longitude
		});
		const parNom = (await (await get('/prieres/localites?q=bienne')).json()) as { name: string }[];
		expect(parNom[0]?.name).toBe('Biel/Bienne');
	});

	it('keeps that route to the people who manage the prayer times of the organisation', async () => {
		const anonyme = await fetch(`${origin}/prieres/localites?q=bienne`, { redirect: 'manual' });
		expect(anonyme.status).toBe(303);
		expect(anonyme.headers.get('location')).toBe('/connexion');
		const editeur = await get('/prieres/localites?q=bienne', EDITEUR);
		expect(editeur.status).toBe(303);
		expect(editeur.headers.get('location')).toBe('/');
		expect((await get('/prieres/localites?q=bienne', SANS_MODULE)).status).toBe(404);
	});

	it('returns the list without JavaScript, as a form that renders it', async () => {
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const html = await (await get('/prieres?source=computed&lieu=bienne')).text();
		expect(radios(html, 'localite')[0]).toEqual({ valeur: BIENNE_CHOISIE, cochee: false });
		expect(visibleText(html)).toContain(BIENNE_AFFICHEE);
		// Le champ de recherche garde ce qui a été tapé.
		expect(html).toMatch(/<input\b[^>]*name="lieu"[^>]*value="bienne"/);
	});

	it('previews seven days from the chosen locality, shows its position, and writes nothing', async () => {
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const reponse = await postForm('/prieres?source=computed&/apercu', {
			localite: BIENNE_CHOISIE,
			...CALCUL
		});
		expect(reponse.status).toBe(200);
		const lu = visibleText(await reponse.text());
		expect(lu).toContain(BIENNE_AFFICHEE);
		expect(lu).toContain(`latitude ${BIENNE.latitude.toFixed(4)}`);
		expect(lu).toContain(`longitude ${BIENNE.longitude.toFixed(4)}`);
		for (let pas = 0; pas < 7; pas += 1) {
			expect(lu).toContain(jjmmaaaa(addDays(aujourdhui(), pas)));
		}
		expect(await positionEnregistree()).toEqual({ latitude: null, longitude: null });
	});

	it('saves the position of the list, and not the one the browser sends', async () => {
		const reponse = await postForm('/prieres?source=computed&/enregistrer', {
			localite: BIENNE_CHOISIE,
			latitude: '0',
			longitude: '0',
			...CALCUL
		});
		expect(reponse.status).toBe(200);
		expect(await positionEnregistree()).toEqual(BIENNE);
		// L'écran la redonne ensuite, et la réponse « calculées » est celle qui est cochée.
		const html = await (await get('/prieres')).text();
		expect(radios(html, 'source').find((radio) => radio.cochee)?.valeur).toBe('computed');
		expect(visibleText(html)).toContain(BIENNE_AFFICHEE);
	});

	it('refuses a locality that is not in the list, and writes nothing', async () => {
		const reponse = await postForm('/prieres?source=computed&/enregistrer', {
			localite: '9999|Nulle-part',
			...CALCUL
		});
		expect(reponse.status).toBe(400);
		expect(visibleText(await reponse.text())).toContain('Cette localité n’est pas dans la liste.');
		expect(await positionEnregistree()).toEqual(BIENNE);
	});

	it('keeps coordinates possible, folded under « Outside Switzerland »', async () => {
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const avant = await (await get('/prieres?source=computed')).text();
		const repli = replie(avant, HORS_DE_SUISSE.fr);
		expect(repli).toContain('name="latitude"');
		expect(repli).toContain('name="longitude"');
		// Fermé tant que la position vient de la liste.
		expect(repli).not.toMatch(/<details\b[^>]*\sopen/);

		const reponse = await postForm('/prieres?source=computed&/enregistrer', {
			latitude: '48.8566',
			longitude: '2.3522',
			...CALCUL
		});
		expect(reponse.status).toBe(200);
		expect(await positionEnregistree()).toEqual({ latitude: 48.8566, longitude: 2.3522 });
		const apres = await (await get('/prieres?source=computed')).text();
		expect(replie(apres, HORS_DE_SUISSE.fr)).toMatch(/<details\b[^>]*\sopen/);
		expect(visibleText(apres)).not.toContain(BIENNE_AFFICHEE);

		// Bienne de nouveau, pour la suite.
		await postForm('/prieres?source=computed&/enregistrer', {
			localite: BIENNE_CHOISIE,
			...CALCUL
		});
		expect(await positionEnregistree()).toEqual(BIENNE);
	});

	it.each(LANGUES)('credits swisstopo next to the choice, in %s', async (langue) => {
		await poserLangueDuCompte(RESPONSABLE, langue);
		const lu = visibleText(await (await get('/prieres?source=computed')).text());
		expect(lu).toContain(SWISSTOPO[langue]);
		expect(lu).toContain('01.09.2026');
		expect(lu).toContain(HORS_DE_SUISSE[langue]);
		// La ligne des lettres latines n'est écrite qu'en arabe.
		expect(lu.includes(LETTRES_LATINES)).toBe(langue === 'ar');
	});
});

describe('chaque vue de l’écran, dans les cinq langues (retours D2 et A3)', () => {
	/** Un fichier qui porte chaque refus et chaque avertissement que le lecteur sait dire. */
	function calendrier(): string {
		const jour = (pas: number) => addDays(aujourdhui(), pas);
		return [
			'date;fajr;dhuhr;asr;maghrib;isha',
			`${jour(0)};05:11;13:11;17:11;19:11;21:11`,
			`${jour(1)};05:12;13:11;17:10;19:10;21:10`,
			`${jour(1)};05:12;13:11;17:10;19:10;21:10`,
			`${jour(3)};05:14;13:11;17:08;19:08;21:08`,
			`${jour(4)};05:30;13:11;17:07;19:07;21:07`,
			`${jour(5)};cinq heures;13:11;17:06;19:06;21:06`,
			`${jour(6)};05:16;13:11;19:30;19:05;21:05`,
			`32.13.2026;05:17;13:11;17:04;19:04;21:04`,
			`mardi;05:18;13:11;17:03;19:03;21:03`
		].join('\r\n');
	}

	const PERIODE = 'Hiver des essais';

	/** Chaque vue, et comment l'obtenir : par l'adresse, ou par un formulaire envoyé. */
	const VUES: { nom: string; statut: number; rendre: () => Promise<Response> }[] = [
		{ nom: 'la question, réglages faits', statut: 200, rendre: () => get('/prieres') },
		{ nom: 'le calcul', statut: 200, rendre: () => get('/prieres?source=computed') },
		{
			nom: 'la recherche sans JavaScript',
			statut: 200,
			rendre: () => get('/prieres?source=computed&lieu=bienne')
		},
		{
			nom: 'l’aperçu du calcul',
			statut: 200,
			rendre: () =>
				postForm('/prieres?source=computed&/apercu', { localite: BIENNE_CHOISIE, ...CALCUL })
		},
		{
			nom: 'une position illisible',
			statut: 400,
			rendre: () =>
				postForm('/prieres?source=computed&/apercu', {
					latitude: 'quarante-sept',
					longitude: '7.2468',
					...CALCUL
				})
		},
		{ nom: 'le fichier', statut: 200, rendre: () => get('/prieres?source=import') },
		{
			nom: 'la lecture d’un fichier',
			statut: 200,
			rendre: () => postFichier('/prieres?source=import&/lireFichier', 'essai.csv', calendrier())
		},
		{
			nom: 'un fichier vide',
			statut: 400,
			rendre: () => postFichier('/prieres?source=import&/lireFichier', 'vide.csv', '')
		},
		{ nom: 'la saisie à la main', statut: 200, rendre: () => get('/prieres?source=manual') },
		{
			nom: 'l’aperçu d’une période',
			statut: 200,
			rendre: () =>
				postForm('/prieres?source=manual&/apercuPeriode', {
					name: 'Printemps des essais',
					fromDate: addDays(aujourdhui(), 2),
					toDate: addDays(aujourdhui(), 40),
					maghrib: '19:00',
					maghribIqamaOffset: '10'
				})
		},
		{
			nom: 'une iqama donnée deux fois',
			statut: 400,
			rendre: () =>
				postForm('/prieres?source=manual&/periode', {
					name: 'Deux fois',
					fromDate: addDays(aujourdhui(), 200),
					toDate: addDays(aujourdhui(), 210),
					fajrIqama: '06:30',
					fajrIqamaOffset: '10'
				})
		}
	];

	/** Chaque vue, rendue dans chaque langue, et le code de sa réponse. */
	const rendus: Record<string, Record<Langue, string>> = {};
	const statuts: Record<string, Record<Langue, number>> = {};
	let importes = 0;
	let periodesAvantLesApercus = 0;
	let periodesApresLesApercus = 0;

	beforeAll(async () => {
		// Des heures des trois sources : Bienne calculée, trois jours importés, une période copiée.
		// Rien n'est affirmé ici : une préparation qui échoue ferait sauter les tests au lieu de les
		// faire échouer, et un test sauté ne dit pas ce qui manque.
		await postForm('/prieres?source=computed&/enregistrer', {
			localite: BIENNE_CHOISIE,
			...CALCUL
		});
		const lignesImportees = ['date;fajr;dhuhr;asr;maghrib;isha'];
		for (let pas = 0; pas < 3; pas += 1) {
			lignesImportees.push(`${addDays(aujourdhui(), pas)};05:11;13:11;17:11;21:11;22:11`);
		}
		const lu = await (
			await postFichier(
				'/prieres?source=import&/lireFichier',
				'trois.csv',
				lignesImportees.join('\n')
			)
		).text();
		const aConfirmer = (lu.match(/name="aConfirmer" value="([^"]*)"/)?.[1] ?? '').replaceAll(
			'&amp;',
			'&'
		);
		const confirme = await postForm('/prieres?source=import&/confirmer', { aConfirmer });
		importes = confirme.status === 200 ? aConfirmer.split(';').length : 0;
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "prayer_period" ("id", "organization_id", "name", "from_date", "to_date",
					"needs_review", "maghrib_iqama_offset")
				values (${newId()}, ${organizationId}, ${PERIODE}, ${addDays(aujourdhui(), 100)}::date,
					${addDays(aujourdhui(), 160)}::date, true, 5)
			`)
		);

		periodesAvantLesApercus = await nombreDePeriodes();
		for (const langue of LANGUES) {
			await poserLangueDuCompte(RESPONSABLE, langue);
			for (const { nom, rendre } of VUES) {
				const reponse = await rendre();
				(statuts[nom] ??= {} as Record<Langue, number>)[langue] = reponse.status;
				(rendus[nom] ??= {} as Record<Langue, string>)[langue] = await reponse.text();
			}
		}
		periodesApresLesApercus = await nombreDePeriodes();
	});

	it('prepared hours of the three sources, and answered each view as expected', () => {
		expect(importes).toBe(3);
		for (const { nom, statut } of VUES) {
			expect(statuts[nom], nom).toEqual(
				Object.fromEntries(LANGUES.map((langue) => [langue, statut]))
			);
		}
	});

	/** Ce qui est pareil dans toutes les langues par nature : des noms, un fichier, des localités. */
	function permis(francais: string): string[] {
		const localites = [...textSegments(francais)].filter((morceau) =>
			/^\d{4} .+ \((?:[A-Z]{2})\)$/.test(morceau)
		);
		return [ORGANISATION, RESPONSABLE, PERIODE, 'essai.csv', 'vide.csv', ...localites];
	}

	it.each(VUES.flatMap((vue) => LANGUES.map((langue) => ({ nom: vue.nom, langue }))))(
		'serves « $nom » with <html lang="$langue">',
		({ nom, langue }) => {
			expect(rendus[nom]?.[langue]?.match(/<html\b[^>]*>/g)).toEqual([
				`<html lang="${langue}" dir="${SENS[langue]}">`
			]);
		}
	);

	it.each(VUES.flatMap((vue) => LANGUES.slice(1).map((langue) => ({ nom: vue.nom, langue }))))(
		'leaves no French sentence in « $nom » in $langue',
		({ nom, langue }) => {
			const francais = rendus[nom]?.fr ?? '';
			const autre = rendus[nom]?.[langue] ?? '';
			// Sans texte, une comparaison vide passerait pour une traduction complète.
			expect(textSegments(francais).size, nom).toBeGreaterThan(20);
			expect(frenchLeft(francais, autre, permis(francais))).toEqual([]);
			expect(titre(autre)).not.toBe(titre(francais));
		}
	);

	it.each(VUES.flatMap((vue) => LANGUES.map((langue) => ({ nom: vue.nom, langue }))))(
		'writes no date as AAAA-MM-JJ in « $nom » in $langue',
		({ nom, langue }) => {
			const lu = visibleText(rendus[nom]?.[langue] ?? '');
			expect(lu.match(ISO_DATE)?.[0] ?? null).toBeNull();
		}
	);

	it('dates the days JJ.MM.AAAA, in the served days, the file read and its refusals', () => {
		const demain = jjmmaaaa(addDays(aujourdhui(), 1));
		const fichier = visibleText(rendus['la lecture d’un fichier']?.fr ?? '');
		expect(fichier).toContain(jjmmaaaa(aujourdhui()));
		expect(fichier).toContain(`La date ${demain} apparaît deux fois.`);
		expect(visibleText(rendus['la lecture d’un fichier']?.de ?? '')).toContain(
			`Das Datum ${demain} kommt zweimal vor.`
		);
		const etat = visibleText(rendus['la question, réglages faits']?.fr ?? '');
		for (let pas = 0; pas < 7; pas += 1) {
			expect(etat).toContain(jjmmaaaa(addDays(aujourdhui(), pas)));
		}
		// La fin de l'import, dans la phrase qui la dit.
		expect(etat).toContain(jjmmaaaa(addDays(aujourdhui(), 2)));
		// La période copiée, du premier au dernier jour.
		const main = visibleText(rendus['la saisie à la main']?.it ?? '');
		expect(main).toContain(jjmmaaaa(addDays(aujourdhui(), 100)));
		expect(main).toContain(jjmmaaaa(addDays(aujourdhui(), 160)));
	});

	it('says every refusal of the file in the language of the screen', () => {
		const lu = visibleText(rendus['la lecture d’un fichier']?.en ?? '');
		expect(lu).toContain('Unreadable date: ‘mardi’.');
		expect(lu).toContain('This date does not exist in the calendar.');
		expect(lu).toContain('Unreadable time for Fajr: ‘cinq heures’.');
		expect(lu).toContain('Maghrib (19:05) cannot come before Asr (19:30).');
		expect(lu).toMatch(/Fajr jumps by 16 minutes from the day before \(05:14 then 05:30\)/);
	});

	it('shows, under each answer, the preview of the next days, then « Enregistrer » (C1)', () => {
		/** Le morceau de page entre deux repères, dans cet ordre, ou `null`. */
		function entre(html: string, debut: string, fin: RegExp): string | null {
			const i = html.indexOf(debut);
			if (i < 0) return null;
			const j = html.slice(i).search(fin);
			return j < 0 ? null : html.slice(i, i + j);
		}
		const lignes = (bloc: string | null) =>
			(bloc?.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0] ?? '').match(/<tr\b/g)?.length ?? 0;

		const calcul = entre(
			rendus['l’aperçu du calcul']?.fr ?? '',
			'Aperçu des sept prochains jours</h3>',
			/>\s*Enregistrer\s*<\/button>/
		);
		expect(lignes(calcul)).toBe(7);

		// Le fichier d'essai donne quatre jours lisibles à venir : l'aperçu les montre tous.
		const fichier = entre(
			rendus['la lecture d’un fichier']?.fr ?? '',
			'Aperçu : les sept prochains jours du fichier</h4>',
			/>\s*Enregistrer ces 4 jours\s*<\/button>/
		);
		expect(lignes(fichier)).toBe(4);

		const main = entre(
			rendus['l’aperçu d’une période']?.fr ?? '',
			'Aperçu des sept prochains jours avec cette période</h4>',
			/>\s*Enregistrer cette période\s*<\/button>/
		);
		expect(lignes(main)).toBe(7);
	});

	it('calls no other website from the screen: the list is inside the service (C2)', () => {
		for (const nom of ['le calcul', 'la recherche sans JavaScript', 'l’aperçu du calcul']) {
			const html = rendus[nom]?.fr ?? '';
			const ailleurs = [...html.matchAll(/\s(?:src|href|action|formaction)="([^"]*)"/g)]
				.map((trouve) => trouve[1] ?? '')
				.filter((adresse) => /^(?:https?:)?\/\//i.test(adresse));
			expect(ailleurs, nom).toEqual([]);
		}
	});

	it('previews a period without writing it', () => {
		expect(periodesApresLesApercus).toBe(periodesAvantLesApercus);
		const lu = visibleText(rendus['l’aperçu d’une période']?.fr ?? '');
		expect(lu).toContain('19:00');
		expect(lu).toContain('iqama 19:10');
	});

	/**
	 * Les conteneurs qui font défiler un tableau trop large pour un téléphone (`.defile`), chacun
	 * avec sa balise ouvrante et son contenu. Les `div` sont comptés pour trouver la bonne fermeture.
	 */
	function defilants(html: string): { ouverture: string; contenu: string }[] {
		const trouves: { ouverture: string; contenu: string }[] = [];
		for (const ouverture of html.matchAll(/<div\b[^>]*\bclass="defile\b[^"]*"[^>]*>/g)) {
			const debut = (ouverture.index ?? 0) + ouverture[0].length;
			const balises = /<div\b[^>]*>|<\/div>/g;
			balises.lastIndex = debut;
			let profondeur = 1;
			let fin = html.length;
			for (let trouve = balises.exec(html); trouve; trouve = balises.exec(html)) {
				profondeur += trouve[0].startsWith('</') ? -1 : 1;
				if (profondeur === 0) {
					fin = trouve.index;
					break;
				}
			}
			trouves.push({ ouverture: ouverture[0], contenu: html.slice(debut, fin) });
		}
		return trouves;
	}

	/** Le nom d'une région : son `aria-label`, ou le texte de l'élément que désigne `aria-labelledby`. */
	function nomDeLaRegion(html: string, ouverture: string): string {
		const etiquette = ouverture.match(/\saria-label="([^"]*)"/)?.[1];
		if (etiquette !== undefined) return visibleText(`<body>${etiquette}</body>`);
		const id = ouverture.match(/\saria-labelledby="([^"]*)"/)?.[1];
		if (!id) return '';
		const cible = new RegExp(`<([a-z0-9]+)\\b[^>]*\\sid="${id}"[^>]*>([\\s\\S]*?)</\\1>`).exec(
			html
		);
		return visibleText(`<body>${cible?.[2] ?? ''}</body>`);
	}

	it.each(LANGUES)(
		'lets the keyboard scroll each table wider than a phone, and names it, in %s',
		(langue) => {
			// axe le classe « serious » (scrollable-region-focusable) à 390 px de large : un tableau qui
			// déborde et que rien ne permet d'atteindre au clavier ne se fait pas défiler sans souris.
			let regions = 0;
			for (const { nom } of VUES) {
				const html = rendus[nom]?.[langue] ?? '';
				const francais = rendus[nom]?.fr ?? '';
				const nomsFrancais = new Set(
					defilants(francais).map(({ ouverture }) => nomDeLaRegion(francais, ouverture))
				);
				for (const { ouverture, contenu } of defilants(html)) {
					// Un tableau de champs se fait défiler en passant d'un champ à l'autre.
					if (/<(?:input|select|textarea|button)\b/.test(contenu)) continue;
					regions += 1;
					expect(ouverture, nom).toMatch(/\stabindex="0"/);
					expect(ouverture, nom).toMatch(/\srole="region"/);
					const accessible = nomDeLaRegion(html, ouverture);
					expect(accessible, `${nom} : ${ouverture}`).not.toBe('');
					if (langue !== 'fr' && !permis(francais).includes(accessible)) {
						expect(nomsFrancais.has(accessible), `${nom} : « ${accessible} »`).toBe(false);
					}
				}
			}
			// L'aperçu du calcul, l'exemple et l'extrait du fichier, les périodes, l'aperçu d'une
			// période et ce que voit le public, sur onze vues : bien plus de huit.
			expect(regions).toBeGreaterThanOrEqual(8);
		}
	);

	it('writes the question and the priority sentence in each language', () => {
		for (const langue of LANGUES) {
			const lu = visibleText(rendus['la question, réglages faits']?.[langue] ?? '');
			expect(lu, langue).toContain(QUESTION[langue]);
			expect(lu, langue).toContain(PRIORITE[langue]);
		}
	});
});

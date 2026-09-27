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
/** La dernière case de la liste des localités : la position tapée sous « Hors de Suisse ». */
const CHOIX_HORS_DE_SUISSE: Record<Langue, string> = {
	fr: 'Hors de Suisse : utiliser la position donnée plus bas',
	de: 'Ausserhalb der Schweiz: die weiter unten angegebene Lage verwenden',
	it: 'Fuori dalla Svizzera: usare la posizione indicata più sotto',
	en: 'Outside Switzerland: use the position given below',
	ar: 'خارج سويسرا: استخدام الموقع المحدد أدناه'
};
/** Ce qui suit, dans la liste, le nom de la localité enregistrée qu'une recherche ne rend pas. */
const ENREGISTREE: Record<Langue, string> = {
	fr: 'localité enregistrée',
	de: 'gespeicherter Ort',
	it: 'località salvata',
	en: 'saved town or village',
	ar: 'البلدة المحفوظة'
};
/** Ce que dit l'écran d'une localité choisie avec une autre position tapée « Hors de Suisse ». */
const LOCALITE_ET_POSITION: Record<Langue, string> = {
	fr: 'Une localité est choisie dans la liste, et une autre position est tapée sous « Hors de Suisse ». Pour garder cette position, choisissez « Hors de Suisse » dans la liste. Pour garder la localité, effacez la latitude et la longitude.',
	de: 'In der Liste ist ein Ort gewählt, und unter «Ausserhalb der Schweiz» ist eine andere Lage eingegeben. Um diese Lage zu behalten, wählen Sie in der Liste «Ausserhalb der Schweiz». Um den Ort zu behalten, löschen Sie Breitengrad und Längengrad.',
	it: 'Nell’elenco è scelta una località, e sotto «Fuori dalla Svizzera» è scritta un’altra posizione. Per tenere questa posizione, scegli «Fuori dalla Svizzera» nell’elenco. Per tenere la località, cancella la latitudine e la longitudine.',
	en: 'A town or village is chosen in the list, and another position is typed under ‘Outside Switzerland’. To keep this position, choose ‘Outside Switzerland’ in the list. To keep the town or village, clear the latitude and the longitude.',
	ar: 'في القائمة بلدة مختارة، وتحت «خارج سويسرا» موقع آخر مكتوب. لإبقاء هذا الموقع، اختر «خارج سويسرا» في القائمة. ولإبقاء البلدة، امسح خط العرض وخط الطول.'
};
/** Une position hors de Suisse, telle qu'on la tape. */
const PARIS = { latitude: 48.8566, longitude: 2.3522 };
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

/** Une valeur d'attribut telle que le navigateur la lit. */
function attribut(valeur: string): string {
	return valeur
		.replaceAll('&quot;', '"')
		.replaceAll('&#39;', "'")
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&amp;', '&');
}

/** Les cases d'un groupe de boutons radio, dans l'ordre, avec le texte de leur étiquette. */
function casesDe(html: string, nom: string): { valeur: string; cochee: boolean; texte: string }[] {
	return [...html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)].flatMap(([, contenu = '']) => {
		const balise = contenu.match(/<input\b[^>]*>/)?.[0] ?? '';
		if (!balise.includes(`name="${nom}"`) || !balise.includes('type="radio"')) return [];
		return [
			{
				valeur: attribut(balise.match(/\svalue="([^"]*)"/)?.[1] ?? ''),
				cochee: /\schecked(?:=""|\s|\/?>)/.test(balise),
				texte: visibleText(`<body>${contenu}</body>`)
			}
		];
	});
}

/** La case « Hors de Suisse » de la liste des localités, trouvée par son étiquette. */
function caseHorsDeSuisse(html: string, langue: Langue = 'fr') {
	return casesDe(html, 'localite').find((radio) => radio.texte === CHOIX_HORS_DE_SUISSE[langue]);
}

/** Ce que porte le champ `nom` du formulaire, tel que la page le rend. */
function valeurDuChamp(html: string, nom: string): string | undefined {
	const balise = [...html.matchAll(/<input\b[^>]*>/g)]
		.map((trouve) => trouve[0])
		.find((texte) => texte.includes(`name="${nom}"`));
	return balise === undefined ? undefined : attribut(balise.match(/\svalue="([^"]*)"/)?.[1] ?? '');
}

/**
 * Ce qu'un navigateur envoie du formulaire dont l'action est `action` : chaque champ nommé qui lui
 * appartient, une case radio seulement cochée, un menu sous son option choisie. Un champ rattaché à
 * un autre formulaire par son attribut `form` n'en fait pas partie.
 */
function champsEnvoyes(html: string, action: string): Record<string, string> {
	const debut = html.indexOf(`action="${action.replaceAll('&', '&amp;')}"`);
	expect(debut, `aucun formulaire ${action}`).toBeGreaterThan(-1);
	const formulaire = html.slice(debut, html.indexOf('</form>', debut));
	const champs: Record<string, string> = {};
	for (const [balise] of formulaire.matchAll(/<input\b[^>]*>/g)) {
		const nom = balise.match(/\sname="([^"]*)"/)?.[1];
		const type = balise.match(/\stype="([^"]*)"/)?.[1] ?? 'text';
		if (!nom || /\sform="/.test(balise) || ['submit', 'button', 'file'].includes(type)) continue;
		const cochee = /\schecked(?:=""|\s|\/?>)/.test(balise);
		if ((type === 'radio' || type === 'checkbox') && !cochee) continue;
		champs[nom] = attribut(balise.match(/\svalue="([^"]*)"/)?.[1] ?? '');
	}
	for (const [, nom, options] of formulaire.matchAll(
		/<select\b[^>]*\sname="([^"]*)"[^>]*>([\s\S]*?)<\/select>/g
	)) {
		const toutes = [...(options ?? '').matchAll(/<option\b[^>]*>/g)].map((trouve) => trouve[0]);
		const choisie = toutes.find((option) => /\sselected(?:=""|\s|\/?>)/.test(option)) ?? toutes[0];
		champs[nom ?? ''] = attribut(choisie?.match(/\svalue="([^"]*)"/)?.[1] ?? '');
	}
	return champs;
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

	it('saves the chosen locality, sent with the two numbers of « Outside Switzerland » left empty', async () => {
		// Aucune position n'est encore enregistrée : la page laisse vides les deux nombres de « Hors de
		// Suisse », et le navigateur les envoie vides avec la localité. Des nombres tapés, et ceux que
		// la page remplit en cochant une localité, ont leurs propres tests plus bas.
		const reponse = await postForm('/prieres?source=computed&/enregistrer', {
			localite: BIENNE_CHOISIE,
			latitude: '',
			longitude: '',
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

	it('checks the saved locality when the screen opens, so that the form sends it again', async () => {
		// Bienne est enregistrée. Aucune case n'était cochée au chargement : le formulaire n'envoyait
		// que les deux nombres de « Hors de Suisse », et « Voir l’aperçu » ouvrait ce repli sans plus
		// nommer la localité, alors que l'écran disait « Localité enregistrée ».
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		expect(await positionEnregistree()).toEqual(BIENNE);
		const html = await (await get('/prieres?source=computed')).text();
		const hors = caseHorsDeSuisse(html);
		expect(radios(html, 'localite')).toEqual([
			{ valeur: BIENNE_CHOISIE, cochee: true },
			{ valeur: hors?.valeur, cochee: false }
		]);
		expect(visibleText(html)).toContain(`Localité enregistrée : ${BIENNE_AFFICHEE}`);
		expect(replie(html, HORS_DE_SUISSE.fr)).not.toMatch(/<details\b[^>]*\sopen/);

		// Une recherche qui ne la rend pas la garde en tête, cochée.
		const lugano = await (await get('/prieres?source=computed&lieu=Lugano')).text();
		const cases = radios(lugano, 'localite');
		expect(cases.length).toBeGreaterThan(2);
		expect(cases[0]).toEqual({ valeur: BIENNE_CHOISIE, cochee: true });
		expect(cases.filter((radio) => radio.cochee)).toHaveLength(1);

		// « Voir l’aperçu », le formulaire tel que le navigateur l'envoie, avec ou sans recherche.
		for (const page of [html, lugano]) {
			const champs = champsEnvoyes(page, '?source=computed&/enregistrer');
			expect(champs['localite']).toBe(BIENNE_CHOISIE);
			const apercu = await postForm('/prieres?source=computed&/apercu', champs);
			expect(apercu.status).toBe(200);
			const rendu = await apercu.text();
			expect(radios(rendu, 'localite')).toEqual([
				{ valeur: BIENNE_CHOISIE, cochee: true },
				{ valeur: hors?.valeur, cochee: false }
			]);
			expect(visibleText(rendu)).toContain(`Localité enregistrée : ${BIENNE_AFFICHEE}`);
			expect(replie(rendu, HORS_DE_SUISSE.fr)).not.toMatch(/<details\b[^>]*\sopen/);
		}
		expect(await positionEnregistree()).toEqual(BIENNE);
	});

	it('moves from the saved locality to a position outside Switzerland without JavaScript, and back', async () => {
		// Bienne est enregistrée, et sa case est cochée dès le chargement. Sans JavaScript, on ne
		// décoche pas une case radio : la liste doit donc proposer « Hors de Suisse », sans quoi une
		// position tapée dans ce repli ne pouvait plus passer avant la localité.
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		expect(await positionEnregistree()).toEqual(BIENNE);
		const html = await (await get('/prieres?source=computed')).text();
		const hors = caseHorsDeSuisse(html);
		expect(hors, 'aucune case « Hors de Suisse » dans la liste des localités').toBeDefined();
		expect(hors?.cochee).toBe(false);

		// La personne coche « Hors de Suisse », ouvre le repli et tape la position de Paris : le
		// navigateur envoie cette case, et les deux nombres.
		const versParis = {
			...champsEnvoyes(html, '?source=computed&/enregistrer'),
			localite: hors?.valeur ?? '',
			latitude: String(PARIS.latitude),
			longitude: String(PARIS.longitude)
		};
		const apercu = await postForm('/prieres?source=computed&/apercu', versParis);
		expect(apercu.status).toBe(200);
		const rendu = await apercu.text();
		// L'aperçu garde ce choix : « Hors de Suisse » cochée, le repli ouvert, la position tapée.
		expect(caseHorsDeSuisse(rendu)?.cochee).toBe(true);
		expect(radios(rendu, 'localite')).toContainEqual({ valeur: BIENNE_CHOISIE, cochee: false });
		expect(replie(rendu, HORS_DE_SUISSE.fr)).toMatch(/<details\b[^>]*\sopen/);
		expect(valeurDuChamp(rendu, 'latitude')).toBe(String(PARIS.latitude));
		expect(await positionEnregistree()).toEqual(BIENNE);

		const enregistre = await postForm(
			'/prieres?source=computed&/enregistrer',
			champsEnvoyes(rendu, '?source=computed&/enregistrer')
		);
		expect(enregistre.status).toBe(200);
		expect(visibleText(await enregistre.text())).toContain('Réglages enregistrés.');
		expect(await positionEnregistree()).toEqual(PARIS);

		// Et retour : la recherche rend Bienne, la personne la coche. Les deux nombres de Paris, que la
		// page a remplis, partent avec elle : la localité passe avant eux.
		const recherche = await (await get('/prieres?source=computed&lieu=Bienne')).text();
		expect(caseHorsDeSuisse(recherche)?.cochee).toBe(true);
		const versBienne: Record<string, string> = {
			...champsEnvoyes(recherche, '?source=computed&/enregistrer'),
			localite: BIENNE_CHOISIE
		};
		expect(versBienne['latitude']).toBe(String(PARIS.latitude));
		const retour = await postForm('/prieres?source=computed&/enregistrer', versBienne);
		expect(retour.status).toBe(200);
		expect(await positionEnregistree()).toEqual(BIENNE);
	});

	it('says so, and saves nothing, when a locality stays chosen and another position is typed', async () => {
		// Sans JavaScript, la case de Bienne reste cochée : la personne a ouvert « Hors de Suisse » et
		// tapé Paris, sans choisir « Hors de Suisse » dans la liste. Avant, le serveur gardait Bienne
		// et disait « Réglages enregistrés. » : la position tapée se perdait sans un mot.
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		expect(await positionEnregistree()).toEqual(BIENNE);
		const html = await (await get('/prieres?source=computed')).text();
		const champs: Record<string, string> = {
			...champsEnvoyes(html, '?source=computed&/enregistrer'),
			latitude: String(PARIS.latitude),
			longitude: String(PARIS.longitude)
		};
		expect(champs['localite']).toBe(BIENNE_CHOISIE);
		for (const action of ['apercu', 'enregistrer']) {
			const reponse = await postForm(`/prieres?source=computed&/${action}`, champs);
			expect(reponse.status, action).toBe(400);
			const rendu = await reponse.text();
			const lu = visibleText(rendu);
			expect(lu, action).toContain(LOCALITE_ET_POSITION.fr);
			expect(lu, action).not.toContain('Réglages enregistrés.');
			// Rien ne change sans la personne : la localité reste cochée, et la position tapée revient,
			// repli ouvert, à côté de la case « Hors de Suisse » à choisir.
			expect(radios(rendu, 'localite'), action).toContainEqual({
				valeur: BIENNE_CHOISIE,
				cochee: true
			});
			expect(caseHorsDeSuisse(rendu)?.cochee, action).toBe(false);
			expect(replie(rendu, HORS_DE_SUISSE.fr), action).toMatch(/<details\b[^>]*\sopen/);
			expect(valeurDuChamp(rendu, 'latitude'), action).toBe(String(PARIS.latitude));
			expect(valeurDuChamp(rendu, 'longitude'), action).toBe(String(PARIS.longitude));
		}
		expect(await positionEnregistree()).toEqual(BIENNE);

		// Pour garder la localité, la personne efface les deux nombres : Bienne est enregistrée.
		const efface = await postForm('/prieres?source=computed&/enregistrer', {
			...champs,
			latitude: '',
			longitude: ''
		});
		expect(efface.status).toBe(200);
		expect(await positionEnregistree()).toEqual(BIENNE);
	});

	it('says so, and saves nothing, when the typed position differs from the chosen locality by one number', async () => {
		// Bienne est enregistrée et cochée, et la page a rempli ses deux nombres sous « Hors de
		// Suisse ». La personne n'en change qu'un, pour la position exacte de sa mosquée, sans choisir
		// « Hors de Suisse » dans la liste : ce n'est plus la position de Bienne, et le serveur le dit.
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		expect(await positionEnregistree()).toEqual(BIENNE);
		const html = await (await get('/prieres?source=computed')).text();
		const envoyes = champsEnvoyes(html, '?source=computed&/enregistrer');
		expect(envoyes['localite']).toBe(BIENNE_CHOISIE);
		expect([envoyes['latitude'], envoyes['longitude']]).toEqual([
			String(BIENNE.latitude),
			String(BIENNE.longitude)
		]);
		for (const [champ, tape] of [
			['latitude', '47.15'],
			['longitude', '7.25']
		] as const) {
			const reponse = await postForm('/prieres?source=computed&/enregistrer', {
				...envoyes,
				[champ]: tape
			});
			expect(reponse.status, champ).toBe(400);
			const rendu = await reponse.text();
			expect(visibleText(rendu), champ).toContain(LOCALITE_ET_POSITION.fr);
			expect(valeurDuChamp(rendu, champ), champ).toBe(tape);
		}
		expect(await positionEnregistree()).toEqual(BIENNE);
	});

	it('saves a locality chosen while another position is saved, with the two numbers the page fills in from it', async () => {
		// Paris est enregistré. Avec JavaScript, cocher Bienne écrit sa position dans les deux champs
		// de « Hors de Suisse » : le formulaire envoie Bienne et ses deux nombres, qui ne sont pas ceux
		// de Paris. C'est bien Bienne que la personne a choisie.
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const versParis = await postForm('/prieres?source=computed&/enregistrer', {
			...CALCUL,
			localite: '',
			latitude: String(PARIS.latitude),
			longitude: String(PARIS.longitude)
		});
		expect(versParis.status).toBe(200);
		expect(await positionEnregistree()).toEqual(PARIS);

		// La page écrit la position que la route de recherche lui a donnée.
		const [trouvee] = (await (await get('/prieres/localites?q=2502')).json()) as {
			latitude: number;
			longitude: number;
		}[];
		const recherche = await (await get('/prieres?source=computed&lieu=Bienne')).text();
		const champs: Record<string, string> = {
			...champsEnvoyes(recherche, '?source=computed&/enregistrer'),
			localite: BIENNE_CHOISIE,
			latitude: String(trouvee?.latitude),
			longitude: String(trouvee?.longitude)
		};
		for (const action of ['apercu', 'enregistrer']) {
			const reponse = await postForm(`/prieres?source=computed&/${action}`, champs);
			expect(reponse.status, action).toBe(200);
			expect(visibleText(await reponse.text()), action).not.toContain(LOCALITE_ET_POSITION.fr);
		}
		expect(await positionEnregistree()).toEqual(BIENNE);
	});

	it('says why the saved locality heads a search that does not return it', async () => {
		// « Büe » ne rend que Büetigen. Bienne, enregistrée, reste en tête et cochée : sans un mot,
		// on lisait « 1 localité trouvée. » au-dessus de deux localités.
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const html = await (
			await get(`/prieres?source=computed&lieu=${encodeURIComponent('Büe')}`)
		).text();
		expect(casesDe(html, 'localite')).toEqual([
			{ valeur: BIENNE_CHOISIE, cochee: true, texte: `${BIENNE_AFFICHEE} ${ENREGISTREE.fr}` },
			{ valeur: '3263|Büetigen', cochee: false, texte: '3263 Büetigen (BE)' },
			{ valeur: caseHorsDeSuisse(html)?.valeur, cochee: false, texte: CHOIX_HORS_DE_SUISSE.fr }
		]);
		// Le message compte les localités trouvées, et non les cases.
		expect(visibleText(html)).toContain('1 localité trouvée.');

		// Une recherche qui la rend ne la distingue pas des autres.
		const bienne = await (await get('/prieres?source=computed&lieu=bienne')).text();
		expect(casesDe(bienne, 'localite')[0]).toEqual({
			valeur: BIENNE_CHOISIE,
			cochee: true,
			texte: BIENNE_AFFICHEE
		});
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

	/** La phrase entière de la mention, telle qu'on la lit. */
	const MENTION: Record<Langue, string> = {
		fr: 'Liste officielle des localités : Office fédéral de topographie swisstopo, version du 01.09.2026.',
		de: 'Amtliches Ortschaftenverzeichnis: Bundesamt für Landestopografie swisstopo, Stand 01.09.2026.',
		it: 'Elenco ufficiale delle località: Ufficio federale di topografia swisstopo, versione del 01.09.2026.',
		en: 'Official list of localities: Federal Office of Topography swisstopo, version of 01.09.2026.',
		ar: 'القائمة الرسمية للبلدات: ©swisstopo، إصدار 01.09.2026.'
	};

	it.each(LANGUES)(
		'isolates the name of the source in the sentence that credits it, in %s',
		async (langue) => {
			// En arabe, « ©swisstopo » posé tel quel dans la phrase s'affichait « swisstopo© » : le signe,
			// neutre, prenait le sens de la phrase. Dans un `<bdi>`, le nom garde le sien.
			await poserLangueDuCompte(RESPONSABLE, langue);
			const html = await (await get('/prieres?source=computed')).text();
			const mention = html.match(
				/<p\b[^>]*\bclass="[^"]*\bcredit\b[^"]*"[^>]*>([\s\S]*?)<\/p>/
			)?.[1];
			expect(mention, 'aucune mention de la source').toBeDefined();
			expect(mention).toContain(`<bdi>${SWISSTOPO[langue]}</bdi>`);
			const lue = (mention ?? '')
				.replace(/<[^>]+>/g, '')
				.replace(/\s+/g, ' ')
				.trim();
			expect(lue).toBe(MENTION[langue]);
		}
	);
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
			nom: 'une recherche qui ne rend pas la localité enregistrée',
			statut: 200,
			rendre: () => get(`/prieres?source=computed&lieu=${encodeURIComponent('Büe')}`)
		},
		{
			nom: 'l’aperçu du calcul',
			statut: 200,
			rendre: () =>
				postForm('/prieres?source=computed&/apercu', { localite: BIENNE_CHOISIE, ...CALCUL })
		},
		{
			nom: 'une localité choisie et une autre position tapée',
			statut: 400,
			rendre: () =>
				postForm('/prieres?source=computed&/apercu', {
					localite: BIENNE_CHOISIE,
					latitude: String(PARIS.latitude),
					longitude: String(PARIS.longitude),
					...CALCUL
				})
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
			'Aperçu des sept prochains jours avec cette période</h3>',
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

	/** Le nom du tableau qui défile sous « Ce que voit le public les sept prochains jours ». */
	const TABLEAU_PUBLIC: Record<Langue, string> = {
		fr: 'Tableau des heures que voit le public',
		de: 'Tabelle der Zeiten, die die Öffentlichkeit sieht',
		it: 'Tabella degli orari che vede il pubblico',
		en: 'Table of the times the public sees',
		ar: 'جدول المواقيت التي يراها الجمهور'
	};

	it.each(LANGUES)('gives each region of the screen a name of its own, in %s', (langue) => {
		// axe (landmark-unique) : le tableau de « Ce que voit le public les sept prochains jours »
		// portait le nom de la section qui l'entoure, et un lecteur d'écran listait deux régions de
		// même nom, l'une dans l'autre. Une section qui a un nom est une région, comme un `role`.
		for (const { nom } of VUES) {
			const html = rendus[nom]?.[langue] ?? '';
			const noms = [...html.matchAll(/<(?:section|div)\b[^>]*>/g)]
				.map((trouve) => trouve[0])
				.filter((ouverture) =>
					ouverture.startsWith('<section')
						? /\saria-label(?:ledby)?="/.test(ouverture)
						: /\srole="region"/.test(ouverture)
				)
				.map((ouverture) => nomDeLaRegion(html, ouverture));
			expect(
				noms.filter((region, rang) => noms.indexOf(region) !== rang),
				nom
			).toEqual([]);
			// Le tableau de ce que voit le public est bien là, sous son propre nom.
			expect(noms, nom).toContain(TABLEAU_PUBLIC[langue]);
		}
	});

	/** La dernière phrase de l'aide sous « Hors de Suisse » : ce qu'il faut choisir dans la liste. */
	const CHOISIR_HORS_DE_SUISSE: Record<Langue, string> = {
		fr: 'Si une localité est choisie dans la liste plus haut, choisissez à sa place « Hors de Suisse » : sinon, c’est la localité qui compte, et non ces deux nombres.',
		de: 'Ist in der Liste weiter oben ein Ort gewählt, wählen Sie stattdessen «Ausserhalb der Schweiz»: Sonst zählt der Ort, nicht diese zwei Zahlen.',
		it: 'Se nell’elenco qui sopra è scelta una località, scegli al suo posto «Fuori dalla Svizzera»: altrimenti conta la località, non questi due numeri.',
		en: 'If a town or village is chosen in the list above, choose ‘Outside Switzerland’ instead: otherwise the town or village counts, not these two numbers.',
		ar: 'إذا كانت في القائمة أعلاه بلدة مختارة، فاختر مكانها «خارج سويسرا»: وإلا فالعبرة بالبلدة، لا بهذين الرقمين.'
	};

	it('names « Outside Switzerland » in the list, and says what to choose there, in each language', () => {
		for (const langue of LANGUES) {
			const recherche =
				rendus['une recherche qui ne rend pas la localité enregistrée']?.[langue] ?? '';
			expect(
				casesDe(recherche, 'localite').map((radio) => radio.texte),
				langue
			).toEqual([
				`${BIENNE_AFFICHEE} ${ENREGISTREE[langue]}`,
				'3263 Büetigen (BE)',
				CHOIX_HORS_DE_SUISSE[langue]
			]);
			expect(
				visibleText(`<body>${replie(recherche, HORS_DE_SUISSE[langue])}</body>`),
				langue
			).toContain(CHOISIR_HORS_DE_SUISSE[langue]);
			const lu = visibleText(
				rendus['une localité choisie et une autre position tapée']?.[langue] ?? ''
			);
			expect(lu, langue).toContain(LOCALITE_ET_POSITION[langue]);
		}
	});

	it('writes the question and the priority sentence in each language', () => {
		for (const langue of LANGUES) {
			const lu = visibleText(rendus['la question, réglages faits']?.[langue] ?? '');
			expect(lu, langue).toContain(QUESTION[langue]);
			expect(lu, langue).toContain(PRIORITE[langue]);
		}
	});
});

describe('copier une période pour l’année suivante (retour D2)', () => {
	/** Le nom de la copie d'« Hiver », dans la langue de l'écran qui l'a faite. */
	const COPIE: Record<Langue, string> = {
		fr: 'Hiver (année suivante)',
		de: 'Hiver (nächstes Jahr)',
		it: 'Hiver (anno seguente)',
		en: 'Hiver (next year)',
		ar: 'Hiver (السنة التالية)'
	};

	it.each(LANGUES)('names the copy in the language of the screen, %s', async (langue) => {
		await poserLangueDuCompte(RESPONSABLE, langue);
		// Une période par langue, à plus de deux ans l'une de l'autre : aucune copie n'en chevauche
		// une autre, ni une période des tests précédents.
		const debut = addDays(aujourdhui(), 1000 + 800 * LANGUES.indexOf(langue));
		const id = newId();
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "prayer_period" ("id", "organization_id", "name", "from_date", "to_date",
					"maghrib_iqama_offset")
				values (${id}, ${organizationId}, 'Hiver', ${debut}::date, ${addDays(debut, 10)}::date, 5)
			`)
		);
		// Par le bouton de l'écran, comme une personne le ferait : l'action, et non du SQL.
		const reponse = await postForm('/prieres?source=manual&/dupliquerPeriode', { periodeId: id });
		expect(reponse.status).toBe(200);
		const copies = await maintenance(async (tx) =>
			lignes<{ name: string }>(
				await tx.execute(sql`
					select "name" from "prayer_period"
					where "organization_id" = ${organizationId}
						and "from_date" between ${debut}::date + 300 and ${debut}::date + 400
				`)
			)
		);
		expect(copies.map((copie) => copie.name)).toEqual([COPIE[langue]]);
		// L'écran la montre sous ce nom. (Les copies faites dans les autres langues restent, elles,
		// sous le leur : un nom est une donnée, il ne se traduit pas après coup.)
		expect(visibleText(await (await get('/prieres?source=manual')).text())).toContain(
			COPIE[langue]
		);
	});
});

describe('l’aperçu d’une période préparée à l’avance (retour B1)', () => {
	/** Le titre de l'aperçu d'une période qui commence après les sept prochains jours. */
	const TITRE: Record<Langue, string> = {
		fr: 'Aperçu des sept premiers jours de cette période',
		de: 'Vorschau der ersten sieben Tage dieses Zeitraums',
		it: 'Anteprima dei primi sette giorni di questo periodo',
		en: 'Preview of the first seven days of this period',
		ar: 'معاينة الأيام السبعة الأولى من هذه الفترة'
	};
	/** La phrase qui le dit, avec le premier jour de la période. */
	const PHRASE: Record<Langue, (jour: string) => string> = {
		fr: (jour) =>
			`Cette période commence le ${jour} : l’aperçu montre ses sept premiers jours, et non les sept prochains.`,
		de: (jour) =>
			`Dieser Zeitraum beginnt am ${jour}: Die Vorschau zeigt seine ersten sieben Tage, nicht die nächsten sieben.`,
		it: (jour) =>
			`Questo periodo comincia il ${jour}: l’anteprima mostra i suoi primi sette giorni, non i prossimi sette.`,
		en: (jour) =>
			`This period starts on ${jour}: the preview shows its first seven days, not the next seven.`,
		ar: (jour) =>
			`تبدأ هذه الفترة في ${jour}: لذلك تعرض المعاينة أيامها السبعة الأولى، لا الأيام السبعة القادمة.`
	};

	it.each(LANGUES)(
		'previews the first seven days of a period that starts later, and says so, in %s',
		async (langue) => {
			// Un Ramadan préparé deux mois à l'avance : les sept prochains jours ne le montraient pas, et
			// rien ne le disait. Une personne novice croyait que sa période ne marchait pas.
			await poserLangueDuCompte(RESPONSABLE, langue);
			const debut = addDays(aujourdhui(), 60);
			const avant = await nombreDePeriodes();
			const reponse = await postForm('/prieres?source=manual&/apercuPeriode', {
				name: 'Ramadan des essais',
				fromDate: debut,
				toDate: addDays(debut, 20),
				maghrib: '19:00'
			});
			expect(reponse.status).toBe(200);
			const html = await reponse.text();
			const lu = visibleText(html);
			expect(lu).toContain(TITRE[langue]);
			expect(lu).toContain(PHRASE[langue](jjmmaaaa(debut)));
			// Le tableau qui suit le titre : les sept premiers jours de la période, Maghrib saisi.
			const apres = html.slice(html.indexOf(`${TITRE[langue]}</h3>`));
			const tableau = apres.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0] ?? '';
			expect(tableau.match(/<tr\b/g)?.length ?? 0).toBe(7);
			for (let pas = 0; pas < 7; pas += 1) {
				expect(visibleText(`<body>${tableau}</body>`)).toContain(jjmmaaaa(addDays(debut, pas)));
			}
			expect(tableau.match(/19:00/g)?.length ?? 0).toBe(7);
			// Un aperçu, rien de plus : la période n'est pas écrite.
			expect(await nombreDePeriodes()).toBe(avant);
		}
	);
	// Une période qui commence pendant les sept prochains jours garde « Aperçu des sept prochains
	// jours avec cette période » : c'est la vue « l’aperçu d’une période » plus haut (premier jour
	// dans deux jours), que le test « shows, under each answer, the preview… (C1) » lit.

	/** Le titre de l'aperçu d'une période qui commence plus tard et dure moins de sept jours. */
	const TITRE_ENTIERE: Record<Langue, string> = {
		fr: 'Aperçu de toute cette période',
		de: 'Vorschau des ganzen Zeitraums',
		it: 'Anteprima dell’intero periodo',
		en: 'Preview of the whole period',
		ar: 'معاينة الفترة كلها'
	};
	/** La phrase qui le dit, avec son premier jour et le nombre de ses jours (un ou trois ici). */
	const PHRASE_ENTIERE: Record<Langue, (jour: string, jours: 1 | 3) => string> = {
		fr: (jour, jours) =>
			`Cette période commence le ${jour} et dure ${jours === 1 ? '1 jour' : '3 jours'} : l’aperçu la montre en entier, et non les sept prochains jours.`,
		de: (jour, jours) =>
			`Dieser Zeitraum beginnt am ${jour} und dauert ${jours === 1 ? '1 Tag' : '3 Tage'}: Die Vorschau zeigt ihn vollständig, nicht die nächsten sieben Tage.`,
		it: (jour, jours) =>
			`Questo periodo comincia il ${jour} e dura ${jours === 1 ? '1 giorno' : '3 giorni'}: l’anteprima lo mostra per intero, non i prossimi sette giorni.`,
		en: (jour, jours) =>
			`This period starts on ${jour} and lasts ${jours === 1 ? '1 day' : '3 days'}: the preview shows all of it, not the next seven days.`,
		ar: (jour, jours) =>
			`تبدأ هذه الفترة في ${jour} وتدوم ${jours === 1 ? 'يومًا واحدًا' : '3 أيام'}: لذلك تعرض المعاينة الفترة كلها، لا الأيام السبعة القادمة.`
	};

	it.each(LANGUES)(
		'says how many days a shorter period lasts, and previews only its days, in %s',
		async (langue) => {
			// L'Aïd, un seul jour, préparé deux mois à l'avance : l'écran annonçait « ses sept premiers
			// jours », et le calcul remplissait les jours suivants, qui ne sont pas de la période.
			await poserLangueDuCompte(RESPONSABLE, langue);
			const debut = addDays(aujourdhui(), 60);
			for (const jours of [1, 3] as const) {
				const reponse = await postForm('/prieres?source=manual&/apercuPeriode', {
					name: 'Aïd des essais',
					fromDate: debut,
					toDate: addDays(debut, jours - 1),
					maghrib: '19:00'
				});
				expect(reponse.status).toBe(200);
				const html = await reponse.text();
				const lu = visibleText(html);
				expect(lu).toContain(TITRE_ENTIERE[langue]);
				expect(lu).toContain(PHRASE_ENTIERE[langue](jjmmaaaa(debut), jours));
				expect(lu).not.toContain(TITRE[langue]);
				const apres = html.slice(html.indexOf(`${TITRE_ENTIERE[langue]}</h3>`));
				const tableau = apres.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0] ?? '';
				expect(tableau.match(/<tr\b/g)?.length ?? 0).toBe(jours);
				expect(tableau.match(/19:00/g)?.length ?? 0).toBe(jours);
				expect(visibleText(`<body>${tableau}</body>`)).not.toContain(
					jjmmaaaa(addDays(debut, jours))
				);
			}
		}
	);

	it('keeps « its first seven days » for a period of seven days or more, or without a last day', async () => {
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		// Sept jours tout juste, puis une période sans dernier jour, placée après toutes celles des
		// tests précédents pour n'en chevaucher aucune.
		for (const [debut, toDate] of [
			[addDays(aujourdhui(), 60), addDays(aujourdhui(), 66)],
			[addDays(aujourdhui(), 9000), '']
		] as const) {
			const reponse = await postForm('/prieres?source=manual&/apercuPeriode', {
				name: 'Période des essais',
				fromDate: debut,
				toDate,
				maghrib: '19:00'
			});
			expect(reponse.status).toBe(200);
			const html = await reponse.text();
			const lu = visibleText(html);
			expect(lu).toContain(TITRE.fr);
			expect(lu).toContain(PHRASE.fr(jjmmaaaa(debut)));
			expect(lu).not.toContain(TITRE_ENTIERE.fr);
			const tableau =
				html.slice(html.indexOf(`${TITRE.fr}</h3>`)).match(/<tbody>[\s\S]*?<\/tbody>/)?.[0] ?? '';
			expect(tableau.match(/19:00/g)?.length ?? 0).toBe(7);
		}
	});
});

describe('les replis (retour B1)', () => {
	it('shows that each fold opens: its summary keeps the marker of a details element', async () => {
		// « Hors de Suisse », « Méthode de calcul… », « Le format en détail »… : `display: flex` sur
		// le résumé retirait le triangle des `<details>`, et ils ressemblaient à des boîtes de texte.
		// Un résumé en `list-item` garde le triangle du navigateur, qui s'ouvre sans JavaScript et se
		// tourne de lui-même vers la gauche quand la page se lit de droite à gauche.
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const html = await (await get('/prieres?source=computed')).text();
		let css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]
			.map((trouve) => trouve[1] ?? '')
			.join('\n');
		for (const lien of html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)) {
			const adresse = lien[0].match(/\shref="([^"]+)"/)?.[1];
			if (adresse) css += await (await fetch(new URL(adresse, `${origin}/prieres`))).text();
		}
		const regles = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
			.map((trouve) => ({ selecteur: (trouve[1] ?? '').trim(), declarations: trouve[2] ?? '' }))
			.filter(
				({ selecteur }) =>
					/\.repli\b/.test(selecteur) &&
					/summary(?![\w-])/.test(selecteur) &&
					!selecteur.includes('::')
			);
		expect(regles.length, 'aucune règle pour le résumé des replis').toBeGreaterThan(0);
		for (const { selecteur, declarations } of regles) {
			const display = declarations.match(/(?:^|;)\s*display\s*:\s*([^;]+)/)?.[1]?.trim();
			expect(display ?? 'list-item', selecteur).toBe('list-item');
			expect(declarations, selecteur).not.toMatch(/list-style(?:-type)?\s*:\s*none/);
		}
		// Ce sont bien des `<details>` : ils s'ouvrent et se ferment sans aucun script.
		for (const resume of [HORS_DE_SUISSE.fr, 'Méthode de calcul, école et ajustements']) {
			expect(replie(html, resume), resume).toMatch(/^<details\b/);
		}
	});
});

describe('les formulations relevées par la relecture du lot 3', () => {
	/** Un fichier de `jours` jours à venir, envoyé et lu : la page qui montre ce qu'on en a compris. */
	async function lireJours(jours: number): Promise<string> {
		const lignesDuFichier = ['date;fajr;dhuhr;asr;maghrib;isha'];
		for (let pas = 0; pas < jours; pas += 1) {
			lignesDuFichier.push(`${addDays(aujourdhui(), pas)};05:11;13:11;17:11;19:11;21:11`);
		}
		const reponse = await postFichier(
			'/prieres?source=import&/lireFichier',
			'jours.csv',
			lignesDuFichier.join('\n')
		);
		return visibleText(await reponse.text());
	}

	it('names one day and two days in the Arabic button, and not « (1) »', async () => {
		await poserLangueDuCompte(RESPONSABLE, 'ar');
		expect(await lireJours(1)).toContain('حفظ هذا اليوم');
		expect(await lireJours(2)).toContain('حفظ هذين اليومين');
		const trois = await lireJours(3);
		expect(trois).toContain('حفظ هذه الأيام (3)');
		expect(trois).not.toContain('(1)');
	});

	/** Ce que « Autre » donne, dit près du choix de la méthode. */
	const AUTRE: Record<Langue, string> = {
		fr: '« Autre » ne fixe aucun angle : le Fajr tomberait presque au lever du soleil et l’Isha presque au coucher.',
		de: '«Andere» legt keinen Winkel fest: Fadschr fiele dann fast auf den Sonnenaufgang und Ischa fast auf den Sonnenuntergang.',
		it: '«Altro» non fissa nessun angolo: Fajr cadrebbe quasi al sorgere del sole e Isha quasi al tramonto.',
		en: '‘Other’ sets no angle: Fajr would fall almost at sunrise and Isha almost at sunset.',
		ar: '«أخرى» لا تضبط أي زاوية: فيقع الفجر تقريبًا عند شروق الشمس والعشاء تقريبًا عند غروبها.'
	};
	/** Ce que fait la troisième règle des nuits courtes, dit avec les deux autres. */
	const PROPORTIONNELLE: Record<Langue, string> = {
		fr: '« Proportionnelle à l’angle » donne des heures entre les deux, selon l’angle de la méthode choisie.',
		de: '«Anteilig zum Winkel» ergibt Zeiten zwischen den beiden, je nach dem Winkel der gewählten Methode.',
		it: '«Proporzionale all’angolo» dà orari tra i due, secondo l’angolo del metodo scelto.',
		en: '‘In proportion to the angle’ gives times between the two, depending on the angle of the chosen method.',
		ar: '«بنسبة الزاوية» تعطي مواقيت بين الاثنتين، حسب زاوية الطريقة المختارة.'
	};

	it.each(LANGUES)(
		'explains the method « Other » and the rule in proportion to the angle, in %s',
		async (langue) => {
			await poserLangueDuCompte(RESPONSABLE, langue);
			const lu = visibleText(await (await get('/prieres?source=computed')).text());
			expect(lu).toContain(AUTRE[langue]);
			expect(lu).toContain(PROPORTIONNELLE[langue]);
		}
	);

	/** L'état, quand une période saisie à la main donne des heures : avant quoi elle passe. */
	const PERIODE_AVANT: Record<Langue, string> = {
		fr: 'Vous avez saisi 1 période à la main : les jours qu’elle couvre, ses heures passent avant celles du fichier et du calcul.',
		de: 'Sie haben 1 Zeitraum von Hand eingegeben: An den Tagen, die er abdeckt, gehen seine Zeiten der Datei und der Berechnung vor.',
		it: 'Hai inserito 1 periodo a mano: nei giorni che copre, i suoi orari hanno la precedenza sul file e sul calcolo.',
		en: 'You have entered 1 period by hand: on the days it covers, its times come before those of the file and the calculation.',
		ar: 'الفترات التي أدخلتها يدويًا: 1. في الأيام التي تغطيها، تسبق مواقيتها مواقيت الملف والحساب.'
	};

	it('says before what a period entered by hand comes, in each language', async () => {
		const id = newId();
		const debut = addDays(aujourdhui(), 6000);
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "prayer_period" ("id", "organization_id", "name", "from_date", "to_date",
					"maghrib")
				values (${id}, ${organizationId}, 'Panneau', ${debut}::date, ${addDays(debut, 10)}::date,
					'19:00'::time)
			`)
		);
		try {
			for (const langue of LANGUES) {
				await poserLangueDuCompte(RESPONSABLE, langue);
				const lu = visibleText(await (await get('/prieres')).text());
				expect(lu, langue).toContain(PERIODE_AVANT[langue]);
			}
		} finally {
			await maintenance((tx) => tx.execute(sql`delete from "prayer_period" where "id" = ${id}`));
		}
	});

	it('says that no other website is contacted, in English and in Arabic', async () => {
		await poserLangueDuCompte(RESPONSABLE, 'en');
		const anglais = visibleText(await (await get('/prieres?source=computed')).text());
		expect(anglais).toContain('no other website is contacted.');
		expect(anglais).not.toContain('is asked');
		await poserLangueDuCompte(RESPONSABLE, 'ar');
		const arabe = visibleText(await (await get('/prieres?source=computed')).text());
		expect(arabe).toContain('موجودة داخل الخدمة: لا اتصال بأي موقع آخر.');
		expect(arabe).not.toContain('لا يُسأل');
	});

	it('writes « optional » in German, and not « freiwillig »', async () => {
		await poserLangueDuCompte(RESPONSABLE, 'de');
		const lu = visibleText(await (await get('/prieres?source=computed')).text());
		expect(lu).toContain('Berechnungsmethode, Rechtsschule und Anpassungen (optional)');
		expect(lu).toContain('Die Iqama (optional)');
		expect(lu).not.toContain('freiwillig');
	});

	it('says that a list cut at ten holds the ten that match best, and not that ten were found', async () => {
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const lugano = visibleText(await (await get('/prieres?source=computed&lieu=Lugano')).text());
		expect(lugano).toContain(
			'Voici les 10 localités qui correspondent le mieux. Si la vôtre n’y est pas, précisez le nom ou tapez le NPA.'
		);
		expect(lugano).not.toContain('10 localités trouvées.');
		// Une liste plus courte que la borne dit encore combien elle en a trouvé.
		const bienne = visibleText(await (await get('/prieres?source=computed&lieu=2502')).text());
		expect(bienne).toContain('1 localité trouvée.');
	});
});

describe('l’ordre des titres, sans aucune période (étape 19, D5)', () => {
	/** Responsable d'une organisation qui n'a encore aucune période. */
	const SANS_PERIODE = 'prieres-cinq-sans-periode@example.test';
	let sansPeriodeId: string;

	beforeAll(async () => {
		sansPeriodeId = newId();
		const personne = newId();
		await maintenance(async (tx) => {
			await tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
					"enabled_language", "prayer_module")
				values (${sansPeriodeId}, 'prieres-cinq-sans-periode', 'Association sans période',
					${FUSEAU}, 'fr', array['fr','de','it','en','ar'], true)
			`);
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified", "language")
				values (${personne}, ${SANS_PERIODE}, true, 'fr')
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${sansPeriodeId}, ${personne}, 'org_admin')
			`);
			await tx.execute(conditionsAcceptees(sansPeriodeId, personne));
		});
		sessions[SANS_PERIODE] = await signIn(SANS_PERIODE);
	});

	/** Les niveaux des titres de la page rendue, dans l'ordre : `<h1>` donne 1. */
	const niveaux = (html: string) =>
		[...html.matchAll(/<h([1-6])\b/g)].map((trouve) => Number(trouve[1]));
	/** Chaque titre plus profond de plus d'un niveau que celui qui le précède. */
	const sauts = (suite: number[]) =>
		suite.flatMap((niveau, rang) =>
			rang > 0 && niveau > (suite[rang - 1] ?? 0) + 1 ? [`h${suite[rang - 1]} puis h${niveau}`] : []
		);

	it.each([
		['manual', 'la saisie à la main'],
		['computed', 'l’iqama, sous le calcul']
	])(
		'keeps the heading levels in order in the preview of a new period, under %s (%s)',
		async (source) => {
			// axe (heading-order, gravité modérée) : sans aucune période, aucun titre de période ne
			// sépare le titre de la section de celui de l'aperçu, et la page passait de h2 à h4.
			const avant = await maintenance(async (tx) =>
				lignes<{ n: string }>(
					await tx.execute(sql`
						select count(*)::text as n from "prayer_period"
						where "organization_id" = ${sansPeriodeId}
					`)
				)
			);
			expect(avant[0]?.n).toBe('0');
			const reponse = await postForm(
				`/prieres?source=${source}&/apercuPeriode`,
				{
					name: 'Première période',
					fromDate: aujourdhui(),
					toDate: addDays(aujourdhui(), 30),
					maghrib: '19:00'
				},
				SANS_PERIODE
			);
			expect(reponse.status).toBe(200);
			const html = await reponse.text();
			expect(visibleText(html)).toContain('Aperçu des sept prochains jours avec cette période');
			const suite = niveaux(html);
			expect(suite[0]).toBe(1);
			expect(sauts(suite), suite.join(' ')).toEqual([]);
		}
	);
});

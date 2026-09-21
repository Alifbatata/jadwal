// Les heures de prière, de bout en bout : un responsable pose la position de sa mosquée, voit les
// sept prochains jours, importe un calendrier, et le cours « après Maghrib » affiche enfin une
// heure sur la page publique (ADR 0004).
//
// Rien n'est simulé : vrai serveur, vraie base, vrais formulaires sans JavaScript, vrai fichier
// envoyé en `multipart/form-data`.

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { addDays, roundUpToFiveMinutes, todayInZone, type IsoDate } from '@jadwal/core';
import { computePrayerDay } from '@jadwal/core/prayer';
import { createDatabase, newId, sql, withOrg, type DatabaseHandle } from '@jadwal/db';

const origin = inject('origin');
const outbox = inject('outbox');
const testDatabase = inject('testDatabase');

let ownerHandle: DatabaseHandle;
let appHandle: DatabaseHandle;
let cookie: string;
let organizationId: string;

const SLUG = 'bienne';
const FUSEAU = 'Europe/Zurich';
/** Bienne, en degrés décimaux. C'est la ville du cadrage, et la latitude qui pose la question. */
const LATITUDE = '47.1368';
const LONGITUDE = '7.2468';
/** Le cours du cadrage : quarante-cinq minutes après le Maghrib, tous les jours. */
const DECALAGE = 45;
const EMAIL = 'responsable-prieres@example.test';

const REGLAGES = {
	latitude: LATITUDE,
	longitude: LONGITUDE,
	method: 'MuslimWorldLeague',
	madhab: 'shafi',
	highLatitudeRule: 'middleofthenight',
	source: 'import',
	fajrAdjustment: '0',
	dhuhrAdjustment: '0',
	asrAdjustment: '0',
	maghribAdjustment: '0',
	ishaAdjustment: '0'
};

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

/** Poste un formulaire comme un navigateur sans JavaScript. */
async function postForm(chemin: string, champs: Record<string, string>): Promise<Response> {
	return fetch(`${origin}${chemin}`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			accept: 'text/html',
			origin,
			...(cookie ? { cookie } : {})
		},
		body: new URLSearchParams(champs).toString()
	});
}

/** Envoie un fichier, comme un `<input type="file">` sans JavaScript. */
async function postFichier(
	chemin: string,
	nom: string,
	contenu: string,
	champs: Record<string, string> = {}
): Promise<Response> {
	const corps = new FormData();
	for (const [cle, valeur] of Object.entries(champs)) corps.append(cle, valeur);
	corps.append('calendrier', new Blob([contenu], { type: 'text/csv' }), nom);
	return fetch(`${origin}${chemin}`, {
		method: 'POST',
		redirect: 'manual',
		headers: { accept: 'text/html', origin, cookie },
		body: corps
	});
}

async function page(chemin: string, avecSession = false): Promise<string> {
	const response = await fetch(`${origin}${chemin}`, {
		headers: {
			accept: 'text/html',
			// Un agent de navigateur : sans lui, le compteur de vues prendrait ces requêtes pour
			// celles d'un robot, ce qui n'a pas d'importance ici mais brouillerait les autres tests.
			'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36',
			...(avecSession ? { cookie } : {})
		}
	});
	expect(response.status, chemin).toBe(200);
	return response.text();
}

/** Les jours écrits pour cette organisation, par source. */
async function joursEnBase(): Promise<{ computed: number; import: number }> {
	// Le propriétaire ne voit `prayer_day` que sous son drapeau d'entretien (ADR 0019) : hors de
	// lui, la requête rendrait zéro ligne sans rien dire, et le test passerait pour faux.
	const lignes = await maintenance(async (tx) =>
		rows<{ source: string; n: string }>(
			await tx.execute(sql`
				select "source", count(*)::text as n from "prayer_day"
				where "organization_id" = ${organizationId} group by "source"
			`)
		)
	);
	const par = Object.fromEntries(lignes.map((ligne) => [ligne.source, Number(ligne.n)]));
	return { computed: par['computed'] ?? 0, import: par['import'] ?? 0 };
}

/**
 * Les heures annoncées par la page publique, dans l'ordre des jours. Le cours a lieu chaque jour :
 * la i-ème vaut donc pour `today + i`.
 *
 * La page n'écrit pas une heure nue pour un cours ancré : elle écrit « 45 min après Maghrib », et
 * ajoute l'heure entre parenthèses **quand elle la connaît** (ADR 0004). C'est cette parenthèse que
 * les tests regardent : sa présence prouve que la table des heures a été lue, sa valeur prouve
 * laquelle des deux sources a gagné.
 */
function heuresAffichees(html: string): string[] {
	return [...html.matchAll(/class="heure[^"]*">([^<]*)</g)].map((trouve) => trouve[1] as string);
}

/** L'heure que le cours doit afficher : le Maghrib calculé, plus le décalage. */
function attendue(date: IsoDate): string {
	const jour = computePrayerDay(date, {
		latitude: Number(LATITUDE),
		longitude: Number(LONGITUDE),
		timeZone: FUSEAU,
		method: 'MuslimWorldLeague',
		madhab: 'shafi',
		highLatitudeRule: 'middleofthenight',
		adjustments: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }
	});
	expect(jour, `aucun calcul pour ${date}`).toBeTruthy();
	return decale(jour?.maghrib as string, DECALAGE);
}

/**
 * L'heure d'une prière plus le décalage, **arrondie aux cinq minutes supérieures** comme le fait
 * `expandOccurrences`. L'arrondi n'est pas recopié ici : c'est la fonction du cœur qui l'applique,
 * sans quoi ce test affirmerait sa propre règle plutôt que celle du service (ADR 0004).
 */
function decale(heure: string, minutes: number): string {
	const [h, m] = heure.split(':').map(Number);
	const brut = ((h as number) * 60 + (m as number) + minutes + 1440) % 1440;
	const total = roundUpToFiveMinutes(brut) % 1440;
	return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	appHandle = createDatabase({ role: 'app', overrides: { database: testDatabase } });
	organizationId = newId();
	const userId = newId();
	const courseId = newId();
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language")
			values (${organizationId}, ${SLUG}, 'Mosquée de Bienne', ${FUSEAU}, 'fr', array['fr'])
		`);
		await tx.execute(sql`
			insert into "user" ("id", "email", "name", "email_verified")
			values (${userId}, ${EMAIL}, 'Responsable (personne fictive)', true)
		`);
		await tx.execute(sql`
			insert into "membership" ("id", "organization_id", "user_id", "role")
			values (${newId()}, ${organizationId}, ${userId}, 'org_admin')
		`);
		// Tous les jours de la semaine : il y a donc une séance chaque jour de la plage regardée.
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
				"recurrence_anchor_date", "timing_kind", "timing_prayer", "timing_offset_minutes",
				"timing_duration_minutes", "starts_on")
			values (${courseId}, ${organizationId}, 'published', 'open', array['fr'], 'fr', 'weekly',
				array[1,2,3,4,5,6,7]::smallint[], 1, '2026-09-07', 'prayer', 'maghrib', ${DECALAGE}, 60,
				'2026-09-07')
		`);
		await tx.execute(sql`
			insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
			values (${newId()}, ${organizationId}, ${courseId}, 'fr', 'Cercle du soir')
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
	await appHandle?.close();
});

describe('avant toute source', () => {
	it('annonce la séance sans heure, et invite à régler les prières', async () => {
		const publique = await page(`/m/${SLUG}`);
		expect(publique).toContain('Cercle du soir');
		// Sans heure connue, la page annonce la prière et **rien entre parenthèses** : un visiteur
		// n'a pas à apprendre qu'un réglage manque chez nous (ADR 0004).
		expect(heuresAffichees(publique)[0]).toBe('45 min après Maghrib');

		const accueil = await page('/', true);
		expect(accueil).toContain('sans heure');
		expect(accueil).toContain('Régler les heures de prière');
	});
});

describe('le calcul', () => {
	it('montre sept jours avant d’enregistrer quoi que ce soit', async () => {
		const avant = await joursEnBase();
		const response = await postForm('/prieres?/apercu', REGLAGES);
		expect(response.status).toBe(200);
		const html = await response.text();

		const today = todayInZone(FUSEAU, new Date());
		for (let pas = 0; pas < 7; pas += 1) expect(html).toContain(addDays(today, pas));
		// L'aperçu n'écrit rien : c'est toute la promesse de l'écran.
		expect(await joursEnBase()).toEqual(avant);
	});

	it('refuse une position illisible, sans rien écrire', async () => {
		const avant = await joursEnBase();
		const response = await postForm('/prieres?/apercu', { ...REGLAGES, latitude: 'quarante-sept' });
		expect(response.status).toBe(400);
		expect(await response.text()).toContain('degrés décimaux');
		expect(await joursEnBase()).toEqual(avant);
	});

	it('remplit la fenêtre glissante dès l’enregistrement', async () => {
		const response = await postForm('/prieres?/enregistrer', REGLAGES);
		expect(response.status).toBe(200);
		const compte = await joursEnBase();
		// Trente jours en arrière, trois cent soixante-dix en avant, et le jour même.
		expect(compte.computed).toBe(401);
		expect(compte.import).toBe(0);
	});

	it('donne enfin une heure au cours, sur la page publique', async () => {
		const today = todayInZone(FUSEAU, new Date());
		const heures = heuresAffichees(await page(`/m/${SLUG}`));
		for (let pas = 0; pas < 7; pas += 1) {
			expect(heures[pas], addDays(today, pas)).toBe(
				`45 min après Maghrib (${attendue(addDays(today, pas))})`
			);
		}
	});

	it('fait disparaître l’invitation de l’écran d’accueil', async () => {
		const accueil = await page('/', true);
		expect(accueil).not.toContain('Régler les heures de prière');
	});
});

describe('l’import', () => {
	const today = () => todayInZone(FUSEAU, new Date());
	/** Trois jours, avec un Maghrib très différent du calcul : la priorité doit se voir. */
	const MAGHRIB_IMPORTE = '21:11';

	function csv(jours: number): string {
		const lignes = ['date;fajr;dhuhr;asr;maghrib;isha'];
		for (let pas = 0; pas < jours; pas += 1) {
			lignes.push(`${addDays(today(), pas)};05:11;13:11;17:11;${MAGHRIB_IMPORTE};22:11`);
		}
		return `${lignes.join('\r\n')}\r\n`;
	}

	let aConfirmer: string;

	it('montre ce qu’il a compris du fichier, et n’écrit rien', async () => {
		const avant = await joursEnBase();
		const response = await postFichier('/prieres?/lireFichier', 'calendrier.csv', csv(3), {
			ordre: 'auto'
		});
		expect(response.status).toBe(200);
		const html = await response.text();
		expect(html).toContain(today());
		expect(html).toContain(addDays(today(), 2));
		expect(await joursEnBase()).toEqual(avant);

		const trouve = html.match(/name="aConfirmer" value="([^"]*)"/);
		expect(trouve, 'le champ de confirmation est absent').toBeTruthy();
		aConfirmer = (trouve?.[1] as string)
			.replaceAll('&amp;', '&')
			.replaceAll('&lt;', '<')
			.replaceAll('&gt;', '>')
			.replaceAll('&quot;', '"');
		expect(aConfirmer.split(';')).toHaveLength(3);
	});

	it('refuse un fichier vide sans rien changer', async () => {
		const avant = await joursEnBase();
		const response = await postFichier('/prieres?/lireFichier', 'vide.csv', '');
		expect(response.status).toBe(400);
		expect(await response.text()).toContain('vide');
		expect(await joursEnBase()).toEqual(avant);
	});

	it('écrit les jours confirmés, et eux seuls', async () => {
		const response = await postForm('/prieres?/confirmer', { aConfirmer });
		expect(response.status).toBe(200);
		const compte = await joursEnBase();
		expect(compte.import).toBe(3);
		// Le total ne bouge pas : l'import a remplacé trois jours calculés, il n'en a pas ajouté.
		expect(compte.computed + compte.import).toBe(401);
	});

	it('fait gagner le jour importé sur le calcul, jusque sur la page publique', async () => {
		const heures = heuresAffichees(await page(`/m/${SLUG}`));
		const importee = `45 min après Maghrib (${decale(MAGHRIB_IMPORTE, DECALAGE)})`;
		expect(heures.slice(0, 3)).toEqual([importee, importee, importee]);
		// Le quatrième jour n'est pas couvert par l'import : il reste au calcul.
		expect(heures[3]).toBe(`45 min après Maghrib (${attendue(addDays(today(), 3))})`);
	});

	it('ne réécrit pas les jours calculés quand on réenregistre les mêmes réglages', async () => {
		await postForm('/prieres?/enregistrer', REGLAGES);
		const compte = await joursEnBase();
		expect(compte.import).toBe(3);
		expect(compte.computed).toBe(398);
		expect(heuresAffichees(await page(`/m/${SLUG}`))[0]).toBe(
			`45 min après Maghrib (${decale(MAGHRIB_IMPORTE, DECALAGE)})`
		);
	});

	it('rend la main au calcul quand on efface l’import', async () => {
		const response = await postForm('/prieres?/effacer', {
			de: today(),
			a: addDays(today(), 2)
		});
		expect(response.status).toBe(200);
		expect((await joursEnBase()).import).toBe(0);

		// Les jours effacés sont vides tant que personne n'a recalculé : l'écran le dit, et un
		// nouvel enregistrement les remplit.
		await postForm('/prieres?/enregistrer', REGLAGES);
		expect((await joursEnBase()).computed).toBe(401);
		expect(heuresAffichees(await page(`/m/${SLUG}`))[0]).toBe(
			`45 min après Maghrib (${attendue(today())})`
		);
	});

	it('laisse une trace de chaque geste dans le journal', async () => {
		// Le journal se lit par le rôle applicatif, dans le contexte de son organisation : le
		// propriétaire, lui, n'a aucune politique de lecture dessus (ADR 0020).
		const journal = await withOrg(appHandle.db, organizationId, async (tx) =>
			rows<{ action: string; n: string }>(
				await tx.execute(sql`
					select "action", count(*)::text as n from "audit_log"
					where "organization_id" = ${organizationId} and "action" like 'prayer.%'
					group by "action" order by "action"
				`)
			)
		);
		expect(journal.map((ligne) => ligne.action)).toEqual([
			'prayer.import',
			'prayer.import.delete',
			'prayer.settings'
		]);
		expect(
			Number(journal.find((ligne) => ligne.action === 'prayer.settings')?.n)
		).toBeGreaterThanOrEqual(3);
	});
});

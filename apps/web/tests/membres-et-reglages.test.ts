// Les écrans Membres et Réglages (étape 18, retours B1, B3, D2, D3 et A3), servis par HTTP.
//
// Ce que ce fichier éprouve, sur un vrai serveur construit et une vraie base :
//
// - sous le choix du rôle, l'écran Membres dit ce que fait un éditeur et ce qui est réservé au
//   responsable (B3), et cette liste est liée à ce que la base et les routes permettent vraiment :
//   chaque table que la base réserve au responsable est couverte par un geste dit « réservé » (sauf
//   la lecture du journal, qu'aucun écran ne montre : `RESERVEES_SANS_ECRAN`), chaque
//   geste réservé est refusé à une éditrice, et chaque geste de l'éditeur, elle le fait elle-même, par
//   le formulaire de son écran. Les gestes viennent de la liste même que l'écran affiche
//   (`EDITOR_GESTURES` et `MANAGER_GESTURES`) : un geste ajouté à l'écran sans sa preuve ici, ou
//   l'inverse, ne compile pas et fait tomber le test ;
// - annuler une invitation, retirer un membre, changer un rôle : l'écran dit ce qui est fait ; une
//   responsable qui se donne le rôle d'éditeur le lit sur l'écran où elle arrive ;
// - l'invitation part dans la langue de l'écran de la personne qui invite (D3) ;
// - les deux écrans dans les cinq langues, erreurs comprises, sans phrase française restée et sans
//   date écrite comme la base l'écrit (D2, A3) ;
// - après un refus, Réglages rend ce qui a été saisi, et le fuseau se choisit dans la liste du
//   super-admin, qui n'a aucun alias ; d'un fuseau enregistré hors de la liste, l'écran dit si
//   l'abonnement au calendrier marche avec lui, et le flux agenda le confirme ;
// - supprimer une salle que des cours occupent : l'écran le dit avant, et demande de confirmer, en
//   haut de la page, là où l'on arrive après l'envoi ;
// - un identifiant de salle ou d'invitation mal formé, dans un formulaire trafiqué, reçoit la réponse
//   d'une salle ou d'une invitation inconnue, jamais une erreur 500 ; une salle inconnue n'est plus
//   dite « supprimée » (étape 19).
//
// Depuis l'étape 19 :
//
// - le formulaire d'invitation propose la langue du courriel, celle de l'écran d'abord, et
//   l'invitation part dans la langue choisie ;
// - retirer un membre et changer un rôle demandent une confirmation, et une adhésion introuvable
//   reçoit une phrase, sa propre adhésion dans une autre organisation comprise ;
// - une responsable qui se retire elle-même, ou toute personne qui quitte une organisation depuis
//   « Vos organisations », lit à l'arrivée un encadré qui le dit ; la seule personne responsable ne
//   part pas, et le refus dit quoi faire.

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDatabase, newId, sql, withOrg, type DatabaseHandle } from '@jadwal/db';
import { commonTexts } from '../src/lib/i18n/common.js';
import {
	EDITOR_GESTURES,
	MANAGER_GESTURES,
	type EditorGesture,
	type ManagerGesture
} from '../src/lib/i18n/members.js';
import { timeZoneChoices } from '../src/routes/super-admin/time-zones.server.js';
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

const SLUG = 'membres-et-reglages';
const ORGANISATION = 'Association des membres et des réglages';
const RESPONSABLE = 'mr-responsable@example.test';
const EDITRICE = 'mr-editrice@example.test';
const INVITEE = 'mr-invitee@example.test';
/** Un troisième membre, que la responsable retire et dont elle change le rôle. */
const MEMBRE = 'mr-membre@example.test';
const SALLE_OCCUPEE = 'Salle de prière';
const SALLE_LIBRE = 'Petite salle';

/** Deux autres organisations, pour les gestes de l'éditrice qui en demandent plusieurs. */
const VOISINE = { id: newId(), slug: 'mr-voisine', nom: 'Association voisine de mr' };
const INVITANTE = { id: newId(), slug: 'mr-invitante', nom: 'Association invitante de mr' };

/**
 * Ce qui est pareil dans toutes les langues par nature : noms, adresses, et les noms des fuseaux de
 * la liste, tels que Réglages les écrit (« America/Argentina/Buenos Aires »).
 */
const PERMIS = [
	ORGANISATION,
	RESPONSABLE,
	EDITRICE,
	INVITEE,
	MEMBRE,
	SALLE_OCCUPEE,
	SALLE_LIBRE,
	...[...timeZoneChoices().europe, ...timeZoneChoices().world].map((zone) =>
		zone.replaceAll('_', ' ')
	)
];

let ownerHandle: DatabaseHandle;
let organizationId: string;
let salleOccupee: string;
let salleLibre: string;
const ids: Record<string, string> = {};
/** Les cours de la salle occupée : deux cours, et une prière du vendredi. */
const coursDeLaSalle: string[] = [];

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

async function get(chemin: string, cookie: string): Promise<Response> {
	return fetch(`${origin}${chemin}`, { redirect: 'manual', headers: { cookie } });
}

/** Une page qui doit s'ouvrir : son statut est vérifié, son HTML rendu. */
async function page200(chemin: string, cookie: string): Promise<string> {
	const reponse = await get(chemin, cookie);
	expect(reponse.status, chemin).toBe(200);
	return reponse.text();
}

/** Poste un formulaire comme un navigateur sans JavaScript. Un champ peut porter plusieurs valeurs. */
async function postForm(
	chemin: string,
	champs: Record<string, string | readonly string[]>,
	cookie: string
): Promise<Response> {
	const corps = new URLSearchParams();
	for (const [nom, valeur] of Object.entries(champs)) {
		for (const une of typeof valeur === 'string' ? [valeur] : valeur) corps.append(nom, une);
	}
	return fetch(`${origin}${chemin}`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			accept: 'text/html',
			origin,
			cookie
		},
		body: corps.toString()
	});
}

function baliseHtml(html: string): string {
	return html.match(/<html\b[^>]*>/)?.[0] ?? '';
}

function titre(html: string): string {
	return (html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim();
}

/** Le texte lu d'un morceau de page, balises retirées. */
function lu(fragment: string): string {
	return visibleText(`<body>${fragment}</body>`);
}

/** L'élément qui porte cet identifiant, contenu compris (les balises du même nom sont comptées). */
function element(html: string, id: string): string {
	const ouverture = new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\bid="${id}"[^>]*>`, 'i').exec(html);
	if (!ouverture) return '';
	const balise = ouverture[1] as string;
	const motif = new RegExp(`<${balise}\\b[^>]*>|</${balise}>`, 'gi');
	motif.lastIndex = ouverture.index + ouverture[0].length;
	let profondeur = 1;
	for (let trouve = motif.exec(html); trouve; trouve = motif.exec(html)) {
		profondeur += trouve[0].startsWith('</') ? -1 : 1;
		if (profondeur === 0) return html.slice(ouverture.index, trouve.index + trouve[0].length);
	}
	return html.slice(ouverture.index);
}

/** Les éléments de liste d'un morceau de page, chacun réduit à son texte. */
function elementsDeListe(fragment: string): string[] {
	return [...fragment.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((trouve) =>
		lu(trouve[1] ?? '')
	);
}

/** Le message d'alerte de la page, s'il y en a un. */
function alerte(html: string): string {
	return lu(html.match(/<[a-z]+\b[^>]*role="alert"[^>]*>([\s\S]*?)<\/(?:p|div)>/)?.[1] ?? '');
}

/** Le message qui dit ce qui vient d'être fait, s'il y en a un. */
function statut(html: string): string {
	return lu(html.match(/<p\b[^>]*role="status"[^>]*>[\s\S]*?<\/p>/)?.[0] ?? '');
}

/**
 * Les liens de la navigation de l'espace, résolus depuis la page comme un navigateur le ferait :
 * SvelteKit rend les chemins de `resolve` relatifs à la page (`./organisations` sous `/cours`).
 */
function liensDuMenu(
	html: string,
	page: string,
	langue: Langue
): { chemin: string; texte: string }[] {
	const nom = commonTexts[langue].navigationLabel;
	const menu =
		new RegExp(`<nav\\b[^>]*aria-label="${nom}"[^>]*>[\\s\\S]*?</nav>`).exec(html)?.[0] ?? '';
	return [...menu.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((trouve) => ({
		chemin: new URL(
			(trouve[1]?.match(/\bhref="([^"]*)"/)?.[1] ?? '').replaceAll('&amp;', '&'),
			`${origin}${page}`
		).pathname,
		texte: lu(trouve[2] ?? '')
	}));
}

/**
 * Les champs cachés du premier formulaire de la page dont l'action est `action` et dont les champs
 * cachés passent `filtre`. `null` si la page n'en montre aucun : le geste n'est pas à l'écran.
 */
function formulaireDeLaPage(
	html: string,
	action: string,
	filtre: (caches: Record<string, string>) => boolean = () => true
): Record<string, string> | null {
	for (const [bloc] of html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)) {
		const ouverture = bloc.match(/<form\b[^>]*>/)?.[0] ?? '';
		// L'ancre qui ramène la page renvoyée sur la bonne carte (`?/enregistrer#ajout`) ne change
		// pas l'action.
		const cible = (ouverture.match(/\baction="([^"]*)"/)?.[1] ?? '').replace(/#.*$/, '');
		if (cible !== action) continue;
		const caches: Record<string, string> = {};
		for (const [champ] of bloc.matchAll(/<input\b[^>]*>/g)) {
			if (!/\btype="hidden"/.test(champ)) continue;
			const nom = champ.match(/\bname="([^"]*)"/)?.[1];
			if (nom) caches[nom] = champ.match(/\bvalue="([^"]*)"/)?.[1] ?? '';
		}
		if (filtre(caches)) return caches;
	}
	return null;
}

/** Les champs cachés qui valent ce qui est demandé. */
function avec(attendus: Record<string, string>) {
	return (caches: Record<string, string>) =>
		Object.entries(attendus).every(([nom, valeur]) => caches[nom] === valeur);
}

/** Le jour d'après, à partir d'une date ISO. */
function jourSuivant(date: string): string {
	const jour = new Date(`${date}T12:00:00Z`);
	jour.setUTCDate(jour.getUTCDate() + 1);
	return jour.toISOString().slice(0, 10);
}

/** La balise ouvrante du champ (ou de la liste) qui porte cet identifiant. */
function champ(html: string, id: string): string {
	return new RegExp(`<(?:input|select)\\b[^>]*\\bid="${id}"[^>]*>`).exec(html)?.[0] ?? '';
}

function valeurDuChamp(html: string, id: string): string | undefined {
	return champ(html, id).match(/\bvalue="([^"]*)"/)?.[1];
}

/** Les valeurs des options choisies d'une liste. */
function optionsChoisies(html: string, id: string): string[] {
	return [...element(html, id).matchAll(/<option\b([^>]*)>/g)]
		.filter(([, attributs]) => /\bselected\b/.test(attributs ?? ''))
		.map(([, attributs]) => (attributs ?? '').match(/\bvalue="([^"]*)"/)?.[1] ?? '');
}

/** Toutes les valeurs proposées par une liste, dans l'ordre. */
function optionsDe(fragment: string): string[] {
	return [...fragment.matchAll(/<option\b[^>]*\bvalue="([^"]*)"/g)].map(
		([, valeur]) => valeur ?? ''
	);
}

/** Les cases cochées d'un groupe de cases. */
function casesCochees(html: string, nom: string): string[] {
	return [...html.matchAll(/<input\b[^>]*>/g)]
		.map(([balise]) => balise)
		.filter((balise) => balise.includes(`name="${nom}"`) && /\bchecked\b/.test(balise))
		.map((balise) => balise.match(/\bvalue="([^"]*)"/)?.[1] ?? '');
}

interface Courriel {
	to: string;
	subject: string;
	text: string;
	html: string;
}

async function dernierCourrielA(email: string): Promise<Courriel | undefined> {
	const noms = (await readdir(outbox)).filter((nom) => nom.endsWith('.json')).sort();
	return noms
		.map((nom) => JSON.parse(readFileSync(join(outbox, nom), 'utf8')) as Courriel)
		.filter((courriel) => courriel.to === email)
		.at(-1);
}

/** Se connecte par lien magique, comme une vraie personne. Rend le cookie de session. */
async function signIn(email: string): Promise<string> {
	await maintenance((tx) => tx.execute(sql`delete from "rate_limit"`));
	await postForm('/connexion', { email }, '');
	const lien = (await dernierCourrielA(email))?.text.match(/https?:\/\/\S+/)?.[0];
	expect(lien, `aucun lien envoyé à ${email}`).toBeTruthy();
	const suivi = await fetch(lien as string, { redirect: 'manual' });
	const session = (suivi.headers.getSetCookie?.() ?? [])
		.find((valeur) => valeur.startsWith('better-auth.session_token='))
		?.split(';')[0];
	expect(session, `aucune session posée pour ${email}`).toBeTruthy();
	return session as string;
}

/** Les salles de l'organisation, et le nombre de cours qui gardent chacune. */
async function sallesEnBase(): Promise<{ id: string; cours: number }[]> {
	return maintenance(async (tx) =>
		lignes<{ id: string; cours: number }>(
			await tx.execute(sql`
				select r."id", (select count(*)::int from "course" c where c."room_id" = r."id") as "cours"
				from "room" r where r."organization_id" = ${organizationId}
				order by r."display_order"
			`)
		)
	);
}

/** Les cours de l'organisation du fichier qui portent ce titre. */
async function coursNommes(nom: string): Promise<{ id: string; status: string; kind: string }[]> {
	return maintenance(async (tx) =>
		lignes<{ id: string; status: string; kind: string }>(
			await tx.execute(sql`
				select c."id", c."status", c."kind" from "course" c
				join "course_translation" t on t."course_id" = c."id"
				where c."organization_id" = ${organizationId} and t."title" = ${nom}
			`)
		)
	);
}

/** Ce qui est posé sur une séance : annulée, déplacée, ou rien. */
async function exceptionDe(courseId: string, date: string): Promise<string | null> {
	const [ligne] = await maintenance(async (tx) =>
		lignes<{ kind: string }>(
			await tx.execute(sql`
				select "kind" from "session_exception" where "course_id" = ${courseId} and "date" = ${date}
			`)
		)
	);
	return ligne?.kind ?? null;
}

interface Reglages {
	name: string;
	time_zone: string;
	accent_color: string;
	greeting: string;
	enabled_language: string[];
	default_language: string;
}

async function reglagesEnBase(): Promise<Reglages> {
	const [ligne] = await maintenance(async (tx) =>
		lignes<Reglages>(
			await tx.execute(sql`
				select "name", "time_zone", "accent_color", "greeting", "enabled_language",
					"default_language"
				from "organization" where "id" = ${organizationId}
			`)
		)
	);
	return ligne as Reglages;
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	organizationId = newId();
	salleOccupee = newId();
	salleLibre = newId();
	for (const email of [RESPONSABLE, EDITRICE]) ids[email] = newId();
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language", "prayer_module")
			values (${organizationId}, ${SLUG}, ${ORGANISATION}, 'Europe/Zurich', 'fr',
				array['fr','de','it','en','ar'], true)
		`);
		for (const [email, role] of [
			[RESPONSABLE, 'org_admin'],
			[EDITRICE, 'editor']
		] as const) {
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified") values (${ids[email] ?? ''}, ${email}, true)
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organizationId}, ${ids[email] ?? ''}, ${role})
			`);
			await tx.execute(conditionsAcceptees(organizationId, ids[email] ?? ''));
		}
		// Une invitation en attente, envoyée hier : l'écran en montre les dates.
		await tx.execute(sql`
			insert into "invitation" ("id", "organization_id", "email", "role", "invited_by",
				"created_at", "expires_at")
			values (${newId()}, ${organizationId}, ${INVITEE}, 'editor', ${ids[RESPONSABLE] ?? ''},
				now() - make_interval(hours => 24), now() + make_interval(hours => 13 * 24))
		`);
		for (const [id, nom, rang] of [
			[salleOccupee, SALLE_OCCUPEE, 1],
			[salleLibre, SALLE_LIBRE, 2]
		] as const) {
			await tx.execute(sql`
				insert into "room" ("id", "organization_id", "name", "display_order")
				values (${id}, ${organizationId}, ${nom}, ${rang})
			`);
		}
		// Deux cours dans la salle occupée, l'un publié, l'autre en brouillon, et une prière du
		// vendredi : trois lignes qui perdront leur salle.
		for (const statut of ['published', 'draft']) {
			const id = newId();
			coursDeLaSalle.push(id);
			await tx.execute(sql`
				insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
					"room_id", "source_language", "recurrence_kind", "recurrence_weekday",
					"recurrence_interval", "recurrence_anchor_date", "timing_kind", "timing_start",
					"timing_end", "starts_on")
				values (${id}, ${organizationId}, ${statut}, 'open', array['fr'], ${salleOccupee}, 'fr',
					'weekly', array[2]::smallint[], 1, '2026-09-08', 'fixed', '19:00', '20:00', '2026-09-08')
			`);
			await tx.execute(sql`
				insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
				values (${newId()}, ${organizationId}, ${id}, 'fr', ${`Cours ${statut}`})
			`);
		}
		const vendredi = newId();
		coursDeLaSalle.push(vendredi);
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "kind", "jumua_order", "status", "audience",
				"teaching_language", "room_id", "source_language", "recurrence_kind",
				"recurrence_weekday", "recurrence_interval", "recurrence_anchor_date", "timing_kind",
				"timing_start", "timing_end", "starts_on")
			values (${vendredi}, ${organizationId}, 'jumua', 1, 'published', 'open', array['fr'],
				${salleOccupee}, 'fr', 'weekly', array[5]::smallint[], 1, '2026-09-04', 'fixed', '12:10',
				'13:00', '2026-09-04')
		`);
	});
});

afterAll(async () => {
	await ownerHandle?.close();
});

/** Un cours tel que le formulaire de l'écran l'envoie, sans salle et loin dans le temps. */
const COURS_DE_L_EDITRICE = {
	sourceLanguage: 'fr',
	audience: 'open',
	teachingLanguages: 'fr',
	recurrenceKind: 'weekly',
	weekdays: '3',
	interval: '1',
	timingKind: 'fixed',
	start: '17:00',
	end: '18:00',
	startsOn: '2027-01-06'
};

/** Une prière du vendredi telle que le formulaire de l'écran l'envoie, sans salle. */
const VENDREDI_DE_L_EDITRICE = {
	jumuaOrder: '2',
	start: '13:30',
	end: '14:15',
	sermonLanguages: 'fr',
	startsOn: '2026-09-04'
};

/**
 * Pour chaque geste que l'écran Membres promet à un éditeur, dans l'ordre de l'écran : le texte de
 * l'écran, et la preuve, que l'éditrice fait elle-même, par le formulaire que son écran lui montre, en
 * vérifiant dans la base que c'est fait. Le type exige une preuve par geste de `EDITOR_GESTURES`, la
 * liste même que l'écran affiche.
 */
const PREUVES: {
	readonly [G in EditorGesture]: {
		readonly texte: string;
		readonly preuve: (cookie: string) => Promise<void>;
	};
} = {
	week: {
		texte: 'Voir les séances des sept prochains jours et copier les messages prêts à coller',
		preuve: async (cookie) => {
			const html = await page200('/', cookie);
			// La séance du cours publié, et le message de la semaine, prêt à copier, qui la nomme.
			expect(visibleText(html)).toContain('Cours published');
			const semaine = html.slice(html.indexOf('id="semaine-titre"'));
			expect(semaine.match(/<textarea\b[^>]*>([^<]*)<\/textarea>/)?.[1] ?? '').toContain(
				'Cours published'
			);
		}
	},
	sessions: {
		texte:
			'Annuler une séance, la déplacer à une autre date ou à une autre heure, puis la rétablir',
		preuve: async (cookie) => {
			const cours = coursDeLaSalle[0] as string;
			const annuler = formulaireDeLaPage(
				await page200('/', cookie),
				'?/annuler',
				avec({ courseId: cours })
			);
			expect(annuler, 'le bouton qui annule la séance').not.toBeNull();
			const date = annuler?.date ?? '';
			expect((await postForm('/?/annuler', annuler ?? {}, cookie)).status).toBe(200);
			expect(await exceptionDe(cours, date)).toBe('cancelled');

			const retablir = formulaireDeLaPage(
				await page200('/', cookie),
				'?/retablir',
				avec({ courseId: cours, date })
			);
			expect(retablir, 'le bouton qui rétablit la séance annulée').not.toBeNull();
			expect((await postForm('/?/retablir', retablir ?? {}, cookie)).status).toBe(200);
			expect(await exceptionDe(cours, date)).toBeNull();

			const deplacer = formulaireDeLaPage(
				await page200('/', cookie),
				'?/deplacer',
				avec({ courseId: cours, date })
			);
			expect(deplacer, 'le formulaire qui déplace la séance').not.toBeNull();
			const deplacee = await postForm(
				'/?/deplacer',
				{ ...deplacer, toDate: jourSuivant(date), toStart: '18:30' },
				cookie
			);
			expect(deplacee.status).toBe(200);
			expect(await exceptionDe(cours, date)).toBe('moved');

			const revenir = formulaireDeLaPage(
				await page200('/', cookie),
				'?/retablir',
				avec({ courseId: cours, date })
			);
			expect(revenir, 'le bouton qui rétablit la séance déplacée').not.toBeNull();
			expect((await postForm('/?/retablir', revenir ?? {}, cookie)).status).toBe(200);
			expect(await exceptionDe(cours, date)).toBeNull();
		}
	},
	courses: {
		texte: 'Créer un cours, le modifier et le publier',
		preuve: async (cookie) => {
			const nom = 'Cours créé par l’éditrice';
			const modifie = 'Cours modifié par l’éditrice';
			expect(await page200('/cours/nouveau', cookie)).toMatch(/<form\b[^>]*method="post"/);
			const cree = await postForm(
				'/cours/nouveau',
				{ ...COURS_DE_L_EDITRICE, 'title.fr': nom, status: 'draft' },
				cookie
			);
			expect(cree.status).toBe(303);
			expect(cree.headers.get('location')).toBe('/cours');
			const [cours] = await coursNommes(nom);
			expect(cours?.status).toBe('draft');
			const id = cours?.id ?? '';

			// Le modifier et le publier : le formulaire de sa page, qui propose l'état « publié ».
			const edition = await page200(`/cours/${id}`, cookie);
			expect(edition).toMatch(/<form\b[^>]*method="post"/);
			expect(element(edition, 'status')).toMatch(/<option\b[^>]*\bvalue="published"/);
			const publie = await postForm(
				`/cours/${id}`,
				{ ...COURS_DE_L_EDITRICE, 'title.fr': modifie, status: 'published' },
				cookie
			);
			// Un refus répond aussi 303, mais vers l'accueil : c'est l'adresse qui dit que c'est fait. Un
			// brouillon publié ramène à la liste, qui propose le message « nouveau cours » (étape 19,
			// lot 2).
			expect(publie.status).toBe(303);
			expect(publie.headers.get('location')).toBe(`/cours?publie=${id}`);
			expect(await coursNommes(modifie)).toEqual([{ id, status: 'published', kind: 'course' }]);
			// Pas de suppression : l'écran Cours ne la propose qu'au responsable, et l'écran Membres la
			// range parmi les gestes réservés, que `RESERVES` refuse à l'éditrice par sa route.
		}
	},
	pauses: {
		texte: 'Poser une pause, par exemple pendant les vacances, puis la retirer',
		preuve: async (cookie) => {
			const raison = 'Vacances posées par l’éditrice';
			const pausesPosees = () =>
				maintenance(async (tx) =>
					lignes<{ id: string }>(
						await tx.execute(sql`select "id" from "pause" where "reason" = ${raison}`)
					)
				);
			expect(formulaireDeLaPage(await page200('/cours', cookie), '?/pause')).not.toBeNull();
			const posee = await postForm(
				'/cours?/pause',
				{ courseId: '', from: '2027-02-01', to: '2027-02-05', reason: raison },
				cookie
			);
			expect(posee.status).toBe(200);
			const [pause] = await pausesPosees();
			expect(pause, 'la pause est posée').toBeDefined();

			const retirer = formulaireDeLaPage(
				await page200('/cours', cookie),
				'?/supprimerPause',
				avec({ pauseId: pause?.id ?? '' })
			);
			expect(retirer, 'le bouton qui retire la pause').not.toBeNull();
			expect((await postForm('/cours?/supprimerPause', retirer ?? {}, cookie)).status).toBe(200);
			expect(await pausesPosees()).toEqual([]);
		}
	},
	friday: {
		texte:
			'Quand les heures de prière sont activées : ajouter une prière du vendredi, la modifier, la publier, l’annuler, la déplacer ou la supprimer',
		preuve: async (cookie) => {
			const nom = 'Prière ajoutée par l’éditrice';
			const modifie = 'Prière modifiée par l’éditrice';
			const ajout = formulaireDeLaPage(
				await page200('/vendredi', cookie),
				'?/enregistrer',
				(caches) => !('courseId' in caches)
			);
			expect(ajout, 'le formulaire d’ajout').not.toBeNull();
			const ajoutee = await postForm(
				'/vendredi?/enregistrer',
				{ ...ajout, ...VENDREDI_DE_L_EDITRICE, title: nom },
				cookie
			);
			expect(ajoutee.status).toBe(200);
			const [session] = await coursNommes(nom);
			expect(session?.kind).toBe('jumua');
			const id = session?.id ?? '';
			const deLaSession = avec({ courseId: id });

			const edition = formulaireDeLaPage(
				await page200('/vendredi', cookie),
				'?/enregistrer',
				deLaSession
			);
			expect(edition, 'le formulaire de modification').not.toBeNull();
			const modifiee = await postForm(
				'/vendredi?/enregistrer',
				{ ...edition, ...VENDREDI_DE_L_EDITRICE, end: '14:30', title: modifie },
				cookie
			);
			expect(modifiee.status).toBe(200);
			expect((await coursNommes(modifie)).map((ligne) => ligne.id)).toEqual([id]);

			// Publier : le bouton bascule d'un état à l'autre ; deux fois, pour finir publiée.
			for (const vers of ['draft', 'published']) {
				const bascule = formulaireDeLaPage(
					await page200('/vendredi', cookie),
					'?/basculer',
					avec({ courseId: id, vers })
				);
				expect(bascule, `le bouton qui la rend ${vers}`).not.toBeNull();
				expect((await postForm('/vendredi?/basculer', bascule ?? {}, cookie)).status).toBe(200);
				expect((await coursNommes(modifie))[0]?.status).toBe(vers);
			}

			// Ce vendredi-là : annuler, rétablir, déplacer, rétablir. Chaque bouton est pris sur la
			// page telle qu'elle est après le geste d'avant.
			const annuler = formulaireDeLaPage(
				await page200('/vendredi', cookie),
				'?/annuler',
				deLaSession
			);
			expect(annuler, 'le bouton qui annule ce vendredi').not.toBeNull();
			const date = annuler?.date ?? '';
			const ceVendredi = avec({ courseId: id, date });
			const suite: readonly [string, Record<string, string>, string | null][] = [
				['?/annuler', {}, 'cancelled'],
				['?/retablir', {}, null],
				['?/deplacer', { toDate: jourSuivant(date), toStart: '14:00' }, 'moved'],
				['?/retablir', {}, null]
			];
			for (const [action, saisie, attendu] of suite) {
				const bouton = formulaireDeLaPage(await page200('/vendredi', cookie), action, ceVendredi);
				expect(bouton, `le bouton ${action} de ce vendredi`).not.toBeNull();
				const fait = await postForm(`/vendredi${action}`, { ...bouton, ...saisie }, cookie);
				expect(fait.status, action).toBe(200);
				expect(await exceptionDe(id, date), action).toBe(attendu);
			}

			const supprimer = formulaireDeLaPage(
				await page200('/vendredi', cookie),
				'?/supprimer',
				deLaSession
			);
			expect(supprimer, 'le bouton qui la supprime').not.toBeNull();
			expect((await postForm('/vendredi?/supprimer', supprimer ?? {}, cookie)).status).toBe(200);
			expect(await coursNommes(modifie)).toEqual([]);
		}
	},
	share: {
		texte: 'Partager le programme : le lien, le code QR et le code à coller sur un site',
		preuve: async (cookie) => {
			const html = await page200('/partager', cookie);
			expect(html).toContain(`/m/${SLUG}`);
			expect(html).toMatch(/<svg\b/);
			expect(html).toMatch(/<textarea\b[^>]*\bid="code-site"[^>]*>[^<]*jadwal-widget/);
		}
	},
	language: {
		texte: 'Choisir la langue de son espace',
		preuve: async (cookie) => {
			const langueDuCompte = async () =>
				(
					await maintenance(async (tx) =>
						lignes<{ language: string | null }>(
							await tx.execute(sql`select "language" from "user" where "email" = ${EDITRICE}`)
						)
					)
				)[0]?.language;
			expect(await page200('/cours', cookie)).toMatch(
				/<form\b[^>]*method="post"[^>]*action="\/langue"/
			);
			const choisie = await postForm('/langue', { language: 'de', returnTo: '/cours' }, cookie);
			expect(choisie.status).toBe(303);
			expect(choisie.headers.get('location')).toBe('/cours');
			expect(await langueDuCompte()).toBe('de');
			expect(baliseHtml(await page200('/cours', cookie))).toBe('<html lang="de" dir="ltr">');
			await postForm('/langue', { language: 'fr', returnTo: '/cours' }, cookie);
			expect(await langueDuCompte()).toBe('fr');
		}
	},
	switchOrganisation: {
		texte: 'Passer d’une organisation à l’autre, quand on est membre de plusieurs',
		preuve: async (cookie) => {
			for (const [id, nom] of [
				[VOISINE.id, VOISINE.nom],
				[organizationId, ORGANISATION]
			] as const) {
				const choisir = formulaireDeLaPage(
					await page200('/organisations', cookie),
					'?/choisir',
					avec({ organizationId: id })
				);
				expect(choisir, `le bouton de ${nom}`).not.toBeNull();
				const choisie = await postForm('/organisations?/choisir', choisir ?? {}, cookie);
				expect(choisie.status).toBe(303);
				expect(choisie.headers.get('location')).toBe('/');
				expect(titre(await page200('/', cookie))).toContain(nom);
			}
		}
	},
	acceptance: {
		texte: 'Accepter les conditions d’utilisation et les invitations reçues',
		preuve: async (cookie) => {
			const invitation = formulaireDeLaPage(await page200('/organisations', cookie), '?/accepter');
			expect(invitation, 'le bouton qui accepte l’invitation reçue').not.toBeNull();
			const acceptee = await postForm('/organisations?/accepter', invitation ?? {}, cookie);
			expect(acceptee.status).toBe(303);
			// Une organisation neuve pour elle : la porte mène d'abord à ses conditions.
			const porte = await get('/', cookie);
			expect(porte.status).toBe(303);
			expect(porte.headers.get('location')).toBe('/conditions/accepter');
			expect(await page200('/conditions/accepter', cookie)).toMatch(/<form\b[^>]*method="post"/);
			const signees = await postForm('/conditions/accepter', {}, cookie);
			expect(signees.status).toBe(303);
			expect(signees.headers.get('location')).toBe('/');
			expect(titre(await page200('/', cookie))).toContain(INVITANTE.nom);
			// Et la voilà de retour dans l'organisation du fichier.
			const retour = formulaireDeLaPage(
				await page200('/organisations', cookie),
				'?/choisir',
				avec({ organizationId })
			);
			expect((await postForm('/organisations?/choisir', retour ?? {}, cookie)).status).toBe(303);
		}
	},
	leave: {
		texte: 'Quitter une organisation dont on est membre',
		preuve: async (cookie) => {
			// Le chemin, depuis un écran de son espace : la navigation mène à « Vos organisations »,
			// qu'elle soit membre d'une organisation ou de plusieurs.
			expect(
				liensDuMenu(await page200('/cours', cookie), '/cours', 'fr').map((lien) => lien.chemin),
				'le lien de la navigation vers « Vos organisations »'
			).toContain('/organisations');
			// L'organisation qu'elle vient de rejoindre en acceptant son invitation (`acceptance`).
			const quitter = formulaireDeLaPage(
				await page200('/organisations', cookie),
				'?/quitter',
				avec({ organizationId: INVITANTE.id })
			);
			expect(quitter, 'le bouton qui la fait partir').not.toBeNull();
			const demande = await postForm('/organisations?/quitter', quitter ?? {}, cookie);
			expect(demande.status).toBe(200);
			const confirmer = formulaireDeLaPage(
				element(await demande.text(), 'confirmer-depart'),
				'?/quitter'
			);
			expect(confirmer, 'la confirmation').toEqual({
				organizationId: INVITANTE.id,
				confirm: 'yes'
			});
			const partie = await postForm('/organisations?/quitter', confirmer ?? {}, cookie);
			expect(partie.status).toBe(303);
			const restantes = await maintenance(async (tx) =>
				lignes<{ organization_id: string }>(
					await tx.execute(sql`
						select "organization_id" from "membership" where "user_id" = ${ids[EDITRICE] ?? ''}
					`)
				).map((ligne) => ligne.organization_id)
			);
			expect(restantes).not.toContain(INVITANTE.id);
			expect(restantes).toContain(organizationId);
		}
	}
};

/**
 * Les gestes que l'écran Membres dit réservés au responsable, dans l'ordre de l'écran, avec les
 * tables que chacun écrit (ADR 0046) et les routes qu'une éditrice se voit refuser. Le type exige une
 * entrée par geste de `MANAGER_GESTURES`, la liste même que l'écran affiche.
 */
const RESERVES: {
	readonly [G in ManagerGesture]: {
		readonly texte: string;
		readonly tables: readonly string[];
		readonly refus: readonly {
			readonly chemin: string;
			readonly champs?: Readonly<Record<string, string>>;
		}[];
	};
} = {
	// L'écran Cours le propose à la personne responsable depuis le lot 2 de l'étape 19 ; la base le
	// lui réserve depuis le lot 1 (migration 0065). Un identifiant vide : la garde de la route refuse
	// l'éditrice avant de le lire.
	deleteCourse: {
		texte: 'Supprimer un cours',
		tables: ['course'],
		refus: [{ chemin: '/cours?/supprimer', champs: { courseId: '' } }]
	},
	members: {
		texte: 'Voir les membres, leur rôle et les invitations en attente',
		tables: [],
		refus: [{ chemin: '/membres' }]
	},
	invitations: {
		texte: 'Inviter une personne, comme éditeur ou comme responsable, et annuler une invitation',
		tables: ['invitation'],
		refus: [
			{ chemin: '/membres?/inviter', champs: { email: 'mr-par-l-editrice@example.test' } },
			{ chemin: '/membres?/annuler', champs: { invitationId: '' } }
		]
	},
	roles: {
		texte: 'Changer le rôle d’un membre',
		tables: ['membership'],
		refus: [{ chemin: '/membres?/role', champs: { membershipId: '', role: 'org_admin' } }]
	},
	remove: {
		texte: 'Retirer un membre de l’organisation',
		tables: ['membership'],
		refus: [{ chemin: '/membres?/retirer', champs: { membershipId: '' } }]
	},
	settings: {
		texte:
			'Modifier les réglages : nom, fuseau horaire, couleur, formule d’accueil et langues de la page publique',
		tables: ['organization'],
		refus: [{ chemin: '/reglages' }, { chemin: '/reglages?/enregistrer', champs: { name: 'Volé' } }]
	},
	rooms: {
		texte: 'Ajouter ou supprimer une salle',
		tables: ['room'],
		refus: [
			{ chemin: '/reglages?/ajouterSalle', champs: { name: 'Salle de l’éditrice' } },
			{ chemin: '/reglages?/supprimerSalle', champs: { roomId: '', confirm: 'yes' } }
		]
	},
	prayerSwitch: {
		texte: 'Activer ou désactiver les heures de prière',
		tables: ['organization'],
		refus: [{ chemin: '/reglages?/modulePrieres', champs: { allume: 'non' } }]
	},
	prayerTimes: {
		texte:
			'Régler les heures de prière : le calcul, l’import d’un fichier, les horaires saisis à la main et le modèle à télécharger',
		tables: ['prayer_settings', 'prayer_day', 'prayer_period'],
		refus: [
			{ chemin: '/prieres' },
			{ chemin: '/prieres?/enregistrer', champs: {} },
			{ chemin: '/prieres/modele.csv' }
		]
	}
};

/**
 * Ce que l'écran promet des cours à un éditeur, dans chaque langue : rien de plus que ce que les
 * écrans des cours lui proposent. Supprimer un cours n'est proposé qu'au responsable.
 */
const COURS_DE_L_EDITEUR: Record<Langue, string> = {
	fr: 'Créer un cours, le modifier et le publier',
	de: 'Einen Kurs erstellen, ändern und veröffentlichen',
	it: 'Creare un corso, modificarlo e pubblicarlo',
	en: 'Create a course, edit it and publish it',
	ar: 'إنشاء درس وتعديله ونشره'
};

/**
 * Ce que la base réserve déjà au responsable sans qu'aucun écran le propose : lire le journal
 * (migration 0070), qu'aucun écran ne montre, à personne. Supprimer un cours (migration 0065) en est
 * sorti au lot 2 de l'étape 19, avec le bouton de l'écran Cours.
 */
const RESERVEES_SANS_ECRAN = ['audit_log'] as const;

/** Le titre de la liste réservée, dans chaque langue : les mots que la consigne demande. */
const RESERVE: Record<Langue, string> = {
	fr: 'Réservé au responsable',
	de: 'Nur für die Leitung',
	it: 'Riservato al responsabile',
	en: 'Reserved for managers',
	ar: 'خاص بالمسؤول'
};

describe('ce que peut faire chaque rôle, sous le choix du rôle (retour B3)', () => {
	let cookie = '';
	let editrice = '';
	let sallesAvant: { id: string; cours: number }[] = [];
	const rendus: Partial<Record<Langue, string>> = {};

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		for (const langue of LANGUES) {
			await poserLangueDuCompte(RESPONSABLE, langue);
			const reponse = await get('/membres', cookie);
			expect(reponse.status, langue).toBe(200);
			rendus[langue] = await reponse.text();
		}
		await poserLangueDuCompte(RESPONSABLE, 'fr');

		// L'éditrice est aussi membre d'une organisation voisine, et une troisième l'a invitée : les
		// deux gestes qui demandent plusieurs organisations ont de quoi se faire.
		const inviteuse = newId();
		await maintenance(async (tx) => {
			for (const autre of [VOISINE, INVITANTE]) {
				await tx.execute(sql`
					insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
						"enabled_language")
					values (${autre.id}, ${autre.slug}, ${autre.nom}, 'Europe/Zurich', 'fr', array['fr'])
				`);
			}
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${VOISINE.id}, ${ids[EDITRICE] ?? ''}, 'editor')
			`);
			await tx.execute(conditionsAcceptees(VOISINE.id, ids[EDITRICE] ?? ''));
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified")
				values (${inviteuse}, 'mr-inviteuse@example.test', true)
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${INVITANTE.id}, ${inviteuse}, 'org_admin')
			`);
			await tx.execute(sql`
				insert into "invitation" ("id", "organization_id", "email", "role", "invited_by", "expires_at")
				values (${newId()}, ${INVITANTE.id}, ${EDITRICE}, 'editor', ${inviteuse},
					now() + make_interval(hours => 24))
			`);
		});
		editrice = await signIn(EDITRICE);
		// Deux organisations : la session choisit celle du fichier, comme l'éditrice le ferait.
		const choisie = await postForm('/organisations?/choisir', { organizationId }, editrice);
		expect(choisie.status).toBe(303);
		sallesAvant = await sallesEnBase();
	});

	it('lists, right under the choice of the role, what an editor does and what is reserved', () => {
		const html = rendus.fr ?? '';
		const choix = html.match(/<select\b[^>]*\bname="role"[^>]*>/)?.[0] ?? '';
		expect(choix).toMatch(/aria-describedby="roles-aide"/);
		const aide = element(html, 'roles-aide');
		expect(aide, 'l’aide des rôles').not.toBe('');
		// Sous le choix, avant le bouton d'envoi.
		expect(html.indexOf(aide)).toBeGreaterThan(html.indexOf(choix));
		expect(html.indexOf(aide)).toBeLessThan(html.indexOf('Envoyer l’invitation'));

		const editeur = element(aide, 'peut-editor');
		const responsable = element(aide, 'peut-org_admin');
		expect(lu(editeur.match(/<h3\b[\s\S]*?<\/h3>/)?.[0] ?? '')).toBe(
			'Ce que peut faire un éditeur'
		);
		expect(lu(responsable.match(/<h3\b[\s\S]*?<\/h3>/)?.[0] ?? '')).toBe(
			'Réservé au responsable, en plus de tout ce que fait un éditeur'
		);
		expect(elementsDeListe(editeur)).toEqual(EDITOR_GESTURES.map((geste) => PREUVES[geste].texte));
		expect(elementsDeListe(responsable)).toEqual(
			MANAGER_GESTURES.map((geste) => RESERVES[geste].texte)
		);
		// Ni plus ni moins de preuves que de gestes affichés, et dans le même ordre.
		expect(Object.keys(PREUVES)).toEqual([...EDITOR_GESTURES]);
		expect(Object.keys(RESERVES)).toEqual([...MANAGER_GESTURES]);
		expect(lu(aide)).toContain(
			'Une organisation garde toujours au moins une personne responsable.'
		);
	});

	it('says reserved to a manager every table the base reserves to one, and nothing more', async () => {
		// Ce que la base dit elle-même : les tables dont une politique du rôle applicatif exige la
		// fonction `jadwal.is_org_admin()` (migration 0059).
		const reservees = await maintenance(async (tx) =>
			lignes<{ tablename: string }>(
				await tx.execute(sql`
					select distinct "tablename" from pg_policies
					where "schemaname" = 'public' and 'jadwal_app' = any("roles")
						and (coalesce("qual", '') || ' ' || coalesce("with_check", '')) like '%is_org_admin()%'
					order by "tablename"
				`)
			).map((ligne) => ligne.tablename)
		);
		expect(reservees.length).toBeGreaterThan(0);
		const dites = [
			...new Set(Object.values(RESERVES).flatMap((reserve) => [...reserve.tables]))
		].sort();
		// Une table réservée sans écran n'est dite par aucun geste, et n'en couvre aucun.
		for (const table of RESERVEES_SANS_ECRAN) expect(dites).not.toContain(table);
		expect([...dites, ...RESERVEES_SANS_ECRAN].sort()).toEqual(reservees);
	});

	it.each(MANAGER_GESTURES)('refuses an editor the gesture %s, said reserved', async (geste) => {
		for (const essai of RESERVES[geste].refus) {
			const reponse = essai.champs
				? await postForm(essai.chemin, essai.champs, editrice)
				: await get(essai.chemin, editrice);
			expect(reponse.status, essai.chemin).toBe(303);
			expect(reponse.headers.get('location'), essai.chemin).toBe('/');
		}
	});

	it('changes nothing when it refuses her', async () => {
		// Ni salle ajoutée ou retirée, ni invitation partie.
		expect(await sallesEnBase()).toEqual(sallesAvant);
		expect(await dernierCourrielA('mr-par-l-editrice@example.test')).toBeUndefined();
	});

	it.each(EDITOR_GESTURES)(
		'lets an editor do the gesture %s herself, by her screen',
		async (geste) => {
			await PREUVES[geste].preuve(editrice);
		}
	);

	it.each(LANGUES)('says it in %s, the reserved list under its own heading', (langue) => {
		const aide = element(rendus[langue] ?? '', 'roles-aide');
		const responsable = element(aide, 'peut-org_admin');
		expect(lu(responsable.match(/<h3\b[\s\S]*?<\/h3>/)?.[0] ?? '')).toContain(RESERVE[langue]);
		const editeur = elementsDeListe(element(aide, 'peut-editor'));
		expect(editeur).toHaveLength(EDITOR_GESTURES.length);
		expect(editeur[EDITOR_GESTURES.indexOf('courses')]).toBe(COURS_DE_L_EDITEUR[langue]);
		expect(elementsDeListe(responsable)).toHaveLength(MANAGER_GESTURES.length);
	});
});

describe('l’écran Membres dans les cinq langues (retours B1, D2 et A3)', () => {
	let cookie = '';
	const rendus: Partial<Record<Langue, string>> = {};
	const erreurs: Partial<Record<Langue, string>> = {};

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		for (const langue of LANGUES) {
			await poserLangueDuCompte(RESPONSABLE, langue);
			rendus[langue] = await (await get('/membres', cookie)).text();
			const refus = await postForm(
				'/membres?/inviter',
				{ email: 'pas-une-adresse', role: 'editor' },
				cookie
			);
			expect(refus.status, langue).toBe(400);
			erreurs[langue] = await refus.text();
		}
		await poserLangueDuCompte(RESPONSABLE, 'fr');
	});

	it.each(LANGUES)(
		'keeps in %s the space between the account announcement and the address',
		(langue) => {
			// L'annonce de la coquille, pour les lecteurs d'écran seuls. Svelte retirait l'espace écrite
			// avant `</span>` : l'annonce se lisait collée à l'adresse (« Connecté avec
			// l’adressemr-responsable@example.test »).
			const annonce = rendus[langue]?.match(
				/<span class="pour-lecteur[^"]*">([^<]*)<\/span><bdi>([^<]*)<\/bdi>/
			);
			expect(annonce?.[1]).toBe(`${commonTexts[langue].signedInAs} `);
			expect(annonce?.[2]).toBe(RESPONSABLE);
		}
	);

	it.each(LANGUES)('serves /membres with <html lang="%s">', (langue) => {
		expect(rendus[langue]?.match(/<html\b[^>]*>/g)).toEqual([
			`<html lang="${langue}" dir="${SENS[langue]}">`
		]);
		expect(baliseHtml(erreurs[langue] ?? '')).toBe(`<html lang="${langue}" dir="${SENS[langue]}">`);
		// Une adresse électronique se lit de gauche à droite, même dans une page arabe.
		expect(rendus[langue]).toMatch(/<input\b[^>]*\bname="email"[^>]*\bdir="ltr"/);
	});

	it.each(LANGUES.slice(1))(
		'leaves no French sentence on /membres in %s, errors included',
		(langue) => {
			const francais = rendus.fr ?? '';
			expect(textSegments(francais).size).toBeGreaterThan(20);
			expect(frenchLeft(francais, rendus[langue] ?? '', PERMIS)).toEqual([]);
			expect(titre(rendus[langue] ?? '')).not.toBe(titre(francais));
			expect(alerte(erreurs[langue] ?? '')).not.toBe('');
			expect(alerte(erreurs[langue] ?? '')).not.toBe(alerte(erreurs.fr ?? ''));
			expect(frenchLeft(erreurs.fr ?? '', erreurs[langue] ?? '', PERMIS)).toEqual([]);
		}
	);

	it('explains the email address with an example, and keeps what was typed after an error', () => {
		const html = rendus.fr ?? '';
		expect(lu(html.match(/<label\b[^>]*for="email"[^>]*>[\s\S]*?<\/label>/)?.[0] ?? '')).toBe(
			'Adresse électronique de la personne'
		);
		expect(visibleText(html)).toContain('Exemple : prenom.nom@exemple.ch');
		expect(alerte(erreurs.fr ?? '')).toBe(
			'Cette adresse n’a pas la forme d’une adresse électronique. Exemple : prenom.nom@exemple.ch'
		);
		expect(erreurs.fr).toMatch(/<input\b[^>]*\bname="email"[^>]*\bvalue="pas-une-adresse"/);
	});

	it.each(LANGUES)(
		'dates the pending invitation JJ.MM.AAAA in %s, never AAAA-MM-JJ',
		async (langue) => {
			const [dates] = await maintenance(async (tx) =>
				lignes<{ envoyee: string; jusqua: string }>(
					await tx.execute(sql`
					select to_char("created_at" at time zone 'Europe/Zurich', 'DD.MM.YYYY') as "envoyee",
						to_char("expires_at" at time zone 'Europe/Zurich', 'DD.MM.YYYY') as "jusqua"
					from "invitation" where "email" = ${INVITEE} and "status" = 'pending'
				`)
				)
			);
			const texte = visibleText(rendus[langue] ?? '');
			expect(texte.match(ISO_DATE)?.[0] ?? null).toBeNull();
			const attendu = {
				fr: `Envoyée le ${dates?.envoyee}, valable jusqu’au ${dates?.jusqua}`,
				de: `Gesendet am ${dates?.envoyee}, gültig bis ${dates?.jusqua}`,
				it: `Inviato il ${dates?.envoyee}, valido fino al ${dates?.jusqua}`,
				en: `Sent on ${dates?.envoyee}, valid until ${dates?.jusqua}`,
				ar: `أُرسلت في ${dates?.envoyee}، صالحة حتى ${dates?.jusqua}`
			}[langue];
			expect(texte).toContain(attendu);
		}
	);
});

describe('l’invitation, dans la langue de l’écran de la personne qui invite (retour D3)', () => {
	it.each([
		['de', `Einladung zu ${ORGANISATION} auf jadwal`],
		['ar', `دعوة للانضمام إلى ${ORGANISATION} على jadwal`],
		['en', `Invitation to join ${ORGANISATION} on jadwal`]
	] as const)('is written in %s when the screen is', async (langue, sujet) => {
		const cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, langue);
		const email = `mr-invitation-${langue}@example.test`;
		const reponse = await postForm('/membres?/inviter', { email, role: 'editor' }, cookie);
		expect(reponse.status).toBe(200);
		const html = await reponse.text();
		expect(baliseHtml(html)).toBe(`<html lang="${langue}" dir="${SENS[langue]}">`);
		const courriel = await dernierCourrielA(email);
		expect(courriel?.subject).toBe(sujet);
		expect(courriel?.html).toContain(`<html lang="${langue}" dir="${SENS[langue]}">`);
		await poserLangueDuCompte(RESPONSABLE, 'fr');
	});
});

/** Le libellé du choix de la langue du courriel, dans chaque langue de l'écran. */
const LANGUE_DU_COURRIEL: Record<Langue, string> = {
	fr: 'Langue du courriel',
	de: 'Sprache der E-Mail',
	it: 'Lingua dell’e-mail',
	en: 'Language of the email',
	ar: 'لغة البريد الإلكتروني'
};

/** L'objet du courriel d'invitation, dans chaque langue. */
const OBJET_DE_L_INVITATION: Record<Langue, string> = {
	fr: `Invitation à rejoindre ${ORGANISATION} sur jadwal`,
	de: `Einladung zu ${ORGANISATION} auf jadwal`,
	it: `Invito a unirti a ${ORGANISATION} su jadwal`,
	en: `Invitation to join ${ORGANISATION} on jadwal`,
	ar: `دعوة للانضمام إلى ${ORGANISATION} على jadwal`
};

describe('la langue du courriel, choisie dans le formulaire d’invitation (étape 19)', () => {
	let cookie = '';

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
	});

	afterAll(async () => {
		await poserLangueDuCompte(RESPONSABLE, 'fr');
	});

	it.each(LANGUES)(
		'offers in %s the five languages in the invitation form, the screen’s chosen',
		async (langue) => {
			await poserLangueDuCompte(RESPONSABLE, langue);
			const html = await page200('/membres', cookie);
			const formulaire = html.match(/<form\b[^>]*action="\?\/inviter"[\s\S]*?<\/form>/)?.[0] ?? '';
			expect(champ(formulaire, 'emailLanguage')).toMatch(/\bname="emailLanguage"/);
			expect(optionsDe(element(formulaire, 'emailLanguage'))).toEqual([...LANGUES]);
			expect(optionsChoisies(formulaire, 'emailLanguage')).toEqual([langue]);
			expect(
				lu(formulaire.match(/<label\b[^>]*for="emailLanguage"[^>]*>[\s\S]*?<\/label>/)?.[0] ?? '')
			).toBe(LANGUE_DU_COURRIEL[langue]);
			// Chaque langue est écrite dans sa langue, comme dans le choix de la langue de l'écran.
			for (const code of LANGUES) {
				expect(formulaire).toMatch(
					new RegExp(`<option\\b[^>]*\\bvalue="${code}"[^>]*\\blang="${code}"`)
				);
			}
		}
	);

	it.each(LANGUES)(
		'sends the invitation in %s when it is chosen, from a French screen',
		async (choisie) => {
			await poserLangueDuCompte(RESPONSABLE, 'fr');
			const email = `mr-choisie-${choisie}@example.test`;
			const reponse = await postForm(
				'/membres?/inviter',
				{ email, role: 'editor', emailLanguage: choisie },
				cookie
			);
			expect(reponse.status).toBe(200);
			const html = await reponse.text();
			// L'écran reste en français, et dit la même phrase que pour toute adresse (ADR 0017).
			expect(baliseHtml(html)).toBe('<html lang="fr" dir="ltr">');
			expect(statut(html)).toBe('L’invitation a été envoyée à cette adresse.');
			const courriel = await dernierCourrielA(email);
			expect(courriel?.subject).toBe(OBJET_DE_L_INVITATION[choisie]);
			expect(courriel?.html).toContain(`<html lang="${choisie}" dir="${SENS[choisie]}">`);
		}
	);

	it('keeps the language chosen, and the role, when the address is refused', async () => {
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const refus = await postForm(
			'/membres?/inviter',
			{ email: 'pas-une-adresse', role: 'org_admin', emailLanguage: 'ar' },
			cookie
		);
		expect(refus.status).toBe(400);
		const html = await refus.text();
		expect(optionsChoisies(html, 'emailLanguage')).toEqual(['ar']);
		expect(optionsChoisies(html, 'role')).toEqual(['org_admin']);
		expect(await dernierCourrielA('pas-une-adresse')).toBeUndefined();
	});

	it('writes in the language of the screen when the form sends none, or one it does not speak', async () => {
		await poserLangueDuCompte(RESPONSABLE, 'de');
		for (const [email, choix] of [
			['mr-sans-langue@example.test', {}],
			['mr-langue-inconnue@example.test', { emailLanguage: 'es' }]
		] as const) {
			const reponse = await postForm(
				'/membres?/inviter',
				{ email, role: 'editor', ...choix },
				cookie
			);
			expect(reponse.status, email).toBe(200);
			expect((await dernierCourrielA(email))?.subject, email).toBe(OBJET_DE_L_INVITATION.de);
		}
	});
});

/** Ce que Membres dit après chacun des trois gestes, dans chaque langue. */
const FAIT: Record<
	Langue,
	{ annulee: string; retire: string; responsable: string; editeur: string }
> = {
	fr: {
		annulee: 'L’invitation est annulée : la personne ne peut plus l’accepter.',
		retire: 'La personne a été retirée de votre organisation.',
		responsable: 'Le rôle a été changé. Nouveau rôle : responsable.',
		editeur: 'Le rôle a été changé. Nouveau rôle : éditeur.'
	},
	de: {
		annulee: 'Sie haben die Einladung zurückgezogen. Die Person kann sie nicht mehr annehmen.',
		retire: 'Sie haben die Person aus Ihrer Organisation entfernt.',
		responsable: 'Die Rolle wurde geändert. Neue Rolle: Leitung.',
		editeur: 'Die Rolle wurde geändert. Neue Rolle: Redaktion.'
	},
	it: {
		annulee: 'L’invito è annullato: la persona non può più accettarlo.',
		retire: 'La persona è stata rimossa dalla tua organizzazione.',
		responsable: 'Il ruolo è stato cambiato. Nuovo ruolo: responsabile.',
		editeur: 'Il ruolo è stato cambiato. Nuovo ruolo: redattore.'
	},
	en: {
		annulee: 'The invitation is cancelled: the person can no longer accept it.',
		retire: 'The person has been removed from your organisation.',
		responsable: 'The role has been changed. New role: manager.',
		editeur: 'The role has been changed. New role: editor.'
	},
	ar: {
		annulee: 'أُلغيت الدعوة، ولم يعد بإمكان الشخص قبولها.',
		retire: 'أُزيل الشخص من مؤسستك.',
		responsable: 'تم تغيير الدور. الدور الجديد: مسؤول.',
		editeur: 'تم تغيير الدور. الدور الجديد: محرر.'
	}
};

describe('annuler, retirer, changer un rôle : Membres dit ce qui est fait (retour B1)', () => {
	let cookie = '';
	const membre = newId();
	const adhesion = newId();

	async function remettreLeMembre(): Promise<void> {
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${adhesion}, ${organizationId}, ${membre}, 'editor')
			`)
		);
	}

	beforeAll(async () => {
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "user" ("id", "email", "email_verified") values (${membre}, ${MEMBRE}, true)
			`)
		);
		await remettreLeMembre();
		cookie = await signIn(RESPONSABLE);
	});

	afterAll(async () => {
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		await maintenance((tx) => tx.execute(sql`delete from "membership" where "id" = ${adhesion}`));
	});

	it.each(LANGUES)('says in %s what each of the three gestures did', async (langue) => {
		await poserLangueDuCompte(RESPONSABLE, langue);
		const invitation = newId();
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "invitation" ("id", "organization_id", "email", "role", "invited_by", "expires_at")
				values (${invitation}, ${organizationId}, ${`mr-annulee-${langue}@example.test`}, 'editor',
					${ids[RESPONSABLE] ?? ''}, now() + make_interval(hours => 24))
			`)
		);
		const annulee = await postForm('/membres?/annuler', { invitationId: invitation }, cookie);
		expect(annulee.status).toBe(200);
		expect(statut(await annulee.text())).toBe(FAIT[langue].annulee);

		// Retirer et changer un rôle demandent une confirmation (étape 19) : c'est la réponse au second
		// envoi, celui qui confirme, qui dit ce qui est fait.
		for (const [role, attendu] of [
			['org_admin', FAIT[langue].responsable],
			['editor', FAIT[langue].editeur]
		] as const) {
			const change = await postForm(
				'/membres?/role',
				{ membershipId: adhesion, role, confirm: 'yes' },
				cookie
			);
			expect(change.status).toBe(200);
			expect(statut(await change.text())).toBe(attendu);
		}

		const retire = await postForm(
			'/membres?/retirer',
			{ membershipId: adhesion, confirm: 'yes' },
			cookie
		);
		expect(retire.status).toBe(200);
		const html = await retire.text();
		expect(statut(html)).toBe(FAIT[langue].retire);
		expect(html).not.toContain(MEMBRE);
		await remettreLeMembre();
	});
});

/** Ce que la demande de confirmation dit, devant l'adresse du membre visé, dans chaque langue. */
const AVANT_DE_CONFIRMER: Record<
	Langue,
	{ retirer: string; responsable: string; editeur: string; bouton: string; garder: string }
> = {
	fr: {
		retirer: 'Vous allez retirer cette personne de l’organisation :',
		responsable: 'Vous allez donner le rôle de responsable à cette personne :',
		editeur: 'Vous allez donner le rôle d’éditeur à cette personne :',
		bouton: 'Retirer cette personne',
		garder: 'Ne rien changer'
	},
	de: {
		retirer: 'Sie sind dabei, diese Person aus der Organisation zu entfernen:',
		responsable: 'Sie sind dabei, dieser Person die Rolle «Leitung» zu geben:',
		editeur: 'Sie sind dabei, dieser Person die Rolle «Redaktion» zu geben:',
		bouton: 'Person entfernen',
		garder: 'Nichts ändern'
	},
	it: {
		retirer: 'Stai per rimuovere questa persona dall’organizzazione:',
		responsable: 'Stai per dare il ruolo di responsabile a questa persona:',
		editeur: 'Stai per dare il ruolo di redattore a questa persona:',
		bouton: 'Rimuovi questa persona',
		garder: 'Non cambiare nulla'
	},
	en: {
		retirer: 'You are about to remove this person from the organisation:',
		responsable: 'You are about to give the manager role to this person:',
		editeur: 'You are about to give the editor role to this person:',
		bouton: 'Remove this person',
		garder: 'Change nothing'
	},
	ar: {
		retirer: 'أنت على وشك إزالة هذا الشخص من المؤسسة:',
		responsable: 'أنت على وشك منح دور المسؤول لهذا الشخص:',
		editeur: 'أنت على وشك منح دور المحرر لهذا الشخص:',
		bouton: 'إزالة هذا الشخص',
		garder: 'إبقاء كل شيء كما هو'
	}
};

/** Ce que Membres répond pour une adhésion qu'il ne trouve pas dans l'organisation. */
const MEMBRE_DISPARU: Record<Langue, string> = {
	fr: 'Cette personne ne fait plus partie de l’organisation.',
	de: 'Diese Person gehört nicht mehr zur Organisation.',
	it: 'Questa persona non fa più parte dell’organizzazione.',
	en: 'This person is no longer part of the organisation.',
	ar: 'لم يعد هذا الشخص عضوًا في المؤسسة.'
};

/** Le rôle d'une adhésion, relevé par le propriétaire ; `undefined` si elle n'existe plus. */
async function roleDe(membershipId: string): Promise<string | undefined> {
	const [ligne] = await maintenance(async (tx) =>
		lignes<{ role: string }>(
			await tx.execute(sql`select "role" from "membership" where "id" = ${membershipId}`)
		)
	);
	return ligne?.role;
}

describe('retirer un membre, changer un rôle : Membres demande de confirmer (étape 19)', () => {
	const A_CONFIRMER = 'mr-a-confirmer@example.test';
	const personne = newId();
	const adhesion = newId();
	let cookie = '';
	/** Le rôle applicatif : le journal se lit dans l'organisation ; le propriétaire ne le lit pas. */
	let appHandle: DatabaseHandle;

	async function remettre(): Promise<void> {
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${adhesion}, ${organizationId}, ${personne}, 'editor')
				on conflict ("id") do update set "role" = 'editor'
			`)
		);
	}

	beforeAll(async () => {
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "user" ("id", "email", "email_verified") values (${personne}, ${A_CONFIRMER}, true)
			`)
		);
		await remettre();
		cookie = await signIn(RESPONSABLE);
		appHandle = createDatabase({ role: 'app', overrides: { database: testDatabase } });
	});

	afterAll(async () => {
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		await maintenance((tx) => tx.execute(sql`delete from "membership" where "id" = ${adhesion}`));
		await appHandle?.close();
	});

	/** La demande, telle qu'elle revient du premier envoi : en haut, annoncée, avec sa réponse. */
	function demandeDe(html: string): string {
		const boite = element(html, 'confirmer-membre');
		expect(boite, 'la demande de confirmation').toMatch(/role="alert"/);
		// En haut, avant la liste des membres : après l'envoi, la page s'ouvre en haut, avec ou sans
		// JavaScript, et la demande doit s'y lire sans chercher.
		const place = html.indexOf('id="confirmer-membre"');
		expect(place).toBeGreaterThan(html.indexOf('<h1'));
		expect(place).toBeLessThan(html.indexOf('<ul class="membres'));
		// « Ne rien changer » est un lien, qui ramène à l'écran sans rien envoyer.
		const garder = boite.match(/<a\b[^>]*\bhref="([^"]*)"/)?.[1] ?? '';
		expect(garder).not.toBe('');
		expect(new URL(garder, `${origin}/membres`).pathname).toBe('/membres');
		return boite;
	}

	it.each(LANGUES)(
		'asks in %s before removing a member, and removes nothing until confirmed',
		async (langue) => {
			await remettre();
			await poserLangueDuCompte(RESPONSABLE, langue);
			const bouton = formulaireDeLaPage(
				await page200('/membres', cookie),
				'?/retirer',
				avec({ membershipId: adhesion })
			);
			expect(bouton).toEqual({ membershipId: adhesion });
			const demande = await postForm('/membres?/retirer', bouton ?? {}, cookie);
			expect(demande.status).toBe(200);
			const boite = demandeDe(await demande.text());
			expect(lu(boite)).toContain(`${AVANT_DE_CONFIRMER[langue].retirer} ${A_CONFIRMER}`);
			expect(boite).toContain(`<bdi>${A_CONFIRMER}</bdi>`);
			expect(lu(boite)).toContain(AVANT_DE_CONFIRMER[langue].garder);
			expect(await roleDe(adhesion), 'rien n’est retiré avant la confirmation').toBe('editor');

			const confirmer = formulaireDeLaPage(boite, '?/retirer');
			expect(confirmer).toEqual({ membershipId: adhesion, confirm: 'yes' });
			expect(lu(boite.match(/<form\b[\s\S]*?<\/form>/)?.[0] ?? '')).toBe(
				AVANT_DE_CONFIRMER[langue].bouton
			);
			const fait = await postForm('/membres?/retirer', confirmer ?? {}, cookie);
			expect(fait.status).toBe(200);
			expect(statut(await fait.text())).toBe(FAIT[langue].retire);
			expect(await roleDe(adhesion)).toBeUndefined();
		}
	);

	it.each(LANGUES)(
		'asks in %s before changing a role, and changes nothing until confirmed',
		async (langue) => {
			await remettre();
			await poserLangueDuCompte(RESPONSABLE, langue);
			for (const [role, avant, fait] of [
				['org_admin', AVANT_DE_CONFIRMER[langue].responsable, FAIT[langue].responsable],
				['editor', AVANT_DE_CONFIRMER[langue].editeur, FAIT[langue].editeur]
			] as const) {
				const bouton = formulaireDeLaPage(
					await page200('/membres', cookie),
					'?/role',
					avec({ membershipId: adhesion })
				);
				expect(bouton).toEqual({ membershipId: adhesion, role });
				const demande = await postForm('/membres?/role', bouton ?? {}, cookie);
				expect(demande.status).toBe(200);
				const boite = demandeDe(await demande.text());
				expect(lu(boite)).toContain(`${avant} ${A_CONFIRMER}`);
				expect(await roleDe(adhesion), 'rien ne change avant la confirmation').toBe(
					role === 'org_admin' ? 'editor' : 'org_admin'
				);
				const confirmer = formulaireDeLaPage(boite, '?/role');
				expect(confirmer).toEqual({ membershipId: adhesion, role, confirm: 'yes' });
				const change = await postForm('/membres?/role', confirmer ?? {}, cookie);
				expect(change.status).toBe(200);
				expect(statut(await change.text())).toBe(fait);
				expect(await roleDe(adhesion)).toBe(role);
			}
		}
	);

	it.each(LANGUES)(
		'answers in %s a member it cannot find with a sentence, never a 500, and changes nothing',
		async (langue) => {
			await remettre();
			await poserLangueDuCompte(RESPONSABLE, langue);
			// L'adhésion de l'éditrice dans une autre organisation : la base ne la montre pas ici.
			const [ailleurs] = await maintenance(async (tx) =>
				lignes<{ id: string }>(
					await tx.execute(sql`
						select "id" from "membership"
						where "organization_id" = ${VOISINE.id} and "user_id" = ${ids[EDITRICE] ?? ''}
					`)
				)
			);
			const inconnues = [newId(), 'pas-un-identifiant', '', ...(ailleurs ? [ailleurs.id] : [])];
			for (const membershipId of inconnues) {
				for (const confirm of ['', 'yes']) {
					for (const [chemin, champs] of [
						['/membres?/retirer', { membershipId, confirm }],
						['/membres?/role', { membershipId, role: 'org_admin', confirm }]
					] as const) {
						const reponse = await postForm(chemin, champs, cookie);
						const cas = `${chemin} « ${membershipId} » ${confirm}`;
						expect(reponse.status, cas).toBe(404);
						expect(alerte(await reponse.text()), cas).toBe(MEMBRE_DISPARU[langue]);
					}
				}
			}
			if (ailleurs) expect(await roleDe(ailleurs.id)).toBe('editor');
			expect(await roleDe(adhesion)).toBe('editor');
		}
	);

	it('answers her own membership in another organisation as one it cannot find, and changes nothing', async () => {
		await remettre();
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		// Sa propre adhésion dans une autre organisation, que la politique lui montre quelle que soit
		// l'organisation du contexte (migrations 0022 et 0064). Seul le filtre de `readMember`
		// l'écarte : sans lui, l'écran lui demandait de confirmer qu'elle se retirait elle-même, et le
		// second envoi signait au journal un retrait qui n'avait pas eu lieu, vidait sa session et
		// l'envoyait vers l'encadré du départ. L'adhésion de l'éditrice, que la base ne lui montre pas,
		// ne le prouvait pas.
		const ailleurs = newId();
		const sienneAilleurs = newId();
		await maintenance(async (tx) => {
			await tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
					"enabled_language")
				values (${ailleurs}, 'mr-sienne-ailleurs', 'Association où elle est aussi', 'Europe/Zurich',
					'fr', array['fr'])
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${sienneAilleurs}, ${ailleurs}, ${ids[RESPONSABLE] ?? ''}, 'editor')
			`);
		});
		const journal = () =>
			withOrg(appHandle.db, { organizationId, userId: ids[RESPONSABLE] ?? '' }, async (tx) =>
				lignes<{ action: string }>(
					await tx.execute(
						sql`select "action" from "audit_log" where "target_id" = ${sienneAilleurs}`
					)
				)
			);
		try {
			// Deux organisations : la session choisit celle du fichier, comme elle le ferait.
			expect((await postForm('/organisations?/choisir', { organizationId }, cookie)).status).toBe(
				303
			);
			expect(await organisationDeLaSession(cookie)).toBe(organizationId);
			for (const confirm of ['', 'yes']) {
				for (const [chemin, champs] of [
					['/membres?/retirer', { membershipId: sienneAilleurs, confirm }],
					['/membres?/role', { membershipId: sienneAilleurs, role: 'org_admin', confirm }]
				] as const) {
					const reponse = await postForm(chemin, champs, cookie);
					const cas = `${chemin} ${confirm}`;
					expect(reponse.status, cas).toBe(404);
					expect(alerte(await reponse.text()), cas).toBe(MEMBRE_DISPARU.fr);
				}
			}
			expect(await roleDe(sienneAilleurs)).toBe('editor');
			expect(await organisationDeLaSession(cookie)).toBe(organizationId);
			expect(await journal()).toEqual([]);
		} finally {
			await maintenance((tx) =>
				tx.execute(sql`delete from "membership" where "id" = ${sienneAilleurs}`)
			);
		}
	});
});

/** Ce que la coquille dit, là où elle arrive, à une responsable qui s'est donné le rôle d'éditeur. */
const DEVENUE_EDITRICE: Record<Langue, string> = {
	fr: 'Vous avez maintenant le rôle d’éditeur. Les écrans réservés aux responsables, comme Membres et Réglages, ne vous sont plus ouverts. Pour les retrouver, demandez à une autre personne responsable de vous redonner le rôle de responsable.',
	de: 'Sie haben jetzt die Rolle «Redaktion». Die Seiten, die der Leitung vorbehalten sind, zum Beispiel «Mitglieder» und «Einstellungen», stehen Ihnen nicht mehr offen. Um sie wieder zu öffnen, bitten Sie eine andere Person in der Leitung, Ihnen die Rolle «Leitung» zurückzugeben.',
	it: 'Ora hai il ruolo di redattore. Le pagine riservate ai responsabili, come Membri e Impostazioni, non ti sono più accessibili. Per riaverle, chiedi a un altro responsabile di ridarti il ruolo di responsabile.',
	en: 'You now have the editor role. The screens reserved for managers, such as Members and Settings, are no longer open to you. To get them back, ask another manager to give you the manager role again.',
	ar: 'لديك الآن دور المحرر. لم تعد الصفحات الخاصة بالمسؤولين، مثل «الأعضاء» و«الإعدادات»، مفتوحة لك. لاستعادتها، اطلب من مسؤول آخر أن يمنحك دور المسؤول من جديد.'
};

/** Ce que la demande de confirmation dit à une responsable qui se donne le rôle d'éditeur. */
const SE_DONNER_EDITEUR: Record<Langue, string> = {
	fr: 'Vous allez vous donner le rôle d’éditeur.',
	de: 'Sie sind dabei, sich selbst die Rolle «Redaktion» zu geben.',
	it: 'Stai per darti il ruolo di redattore.',
	en: 'You are about to give yourself the editor role.',
	ar: 'أنت على وشك أن تمنح نفسك دور المحرر.'
};

describe('une responsable qui se donne le rôle d’éditeur (retour B1)', () => {
	const seconde = newId();
	let cookie = '';
	let sienne = '';

	/** La responsable du fichier, rendue responsable, comme les groupes qui suivent l'attendent. */
	async function remettreResponsable(): Promise<void> {
		await maintenance((tx) =>
			tx.execute(sql`update "membership" set "role" = 'org_admin' where "id" = ${sienne}`)
		);
	}

	beforeAll(async () => {
		// Une seconde responsable : la base refuse de laisser l'organisation sans responsable.
		await maintenance(async (tx) => {
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified")
				values (${seconde}, 'mr-seconde@example.test', true)
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organizationId}, ${seconde}, 'org_admin')
			`);
			const [adhesion] = lignes<{ id: string }>(
				await tx.execute(sql`
					select "id" from "membership"
					where "organization_id" = ${organizationId} and "user_id" = ${ids[RESPONSABLE] ?? ''}
				`)
			);
			sienne = adhesion?.id ?? '';
		});
		cookie = await signIn(RESPONSABLE);
	});

	afterAll(async () => {
		await remettreResponsable();
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		await maintenance((tx) =>
			tx.execute(sql`delete from "membership" where "user_id" = ${seconde}`)
		);
	});

	/**
	 * Le bouton de sa propre ligne, tel que l'écran le montre, puis la confirmation, telle que la
	 * demande la propose (étape 19). Rend la réponse à la confirmation, et la demande lue.
	 */
	async function seDonnerLeRoleDEditeur(): Promise<{ reponse: Response; demande: string }> {
		const bouton = formulaireDeLaPage(
			await page200('/membres', cookie),
			'?/role',
			avec({ membershipId: sienne, role: 'editor' })
		);
		expect(bouton, 'le bouton de sa ligne').not.toBeNull();
		const premier = await postForm('/membres?/role', bouton ?? {}, cookie);
		expect(premier.status, 'le premier envoi ne change rien').toBe(200);
		const demande = element(await premier.text(), 'confirmer-membre');
		const confirmer = formulaireDeLaPage(demande, '?/role');
		expect(confirmer).toEqual({ membershipId: sienne, role: 'editor', confirm: 'yes' });
		return { reponse: await postForm('/membres?/role', confirmer ?? {}, cookie), demande };
	}

	it.each(LANGUES)(
		'tells her in %s, on the screen where she arrives, that she is now an editor',
		async (langue) => {
			await remettreResponsable();
			await poserLangueDuCompte(RESPONSABLE, langue);
			const { reponse, demande } = await seDonnerLeRoleDEditeur();
			// La demande lui parle d'elle-même, et dit ce qu'elle perdra.
			expect(lu(demande)).toContain(SE_DONNER_EDITEUR[langue]);
			// Membres ne lui est plus ouvert : elle est envoyée sur « À venir ».
			expect(reponse.status).toBe(303);
			const arrivee = reponse.headers.get('location') ?? '';
			expect(new URL(arrivee, origin).pathname).toBe('/');
			const html = await page200(arrivee, cookie);
			const avis = element(html, 'avis-role');
			expect(avis).toMatch(/role="status"/);
			expect(lu(avis)).toBe(DEVENUE_EDITRICE[langue]);
			// Et c'est vrai : Membres la renvoie.
			expect((await get('/membres', cookie)).status).toBe(303);
		}
	);

	it('says nothing when she is not an editor, nor on the next screen', async () => {
		await remettreResponsable();
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		// Une adresse copiée ne fait rien dire de faux à une responsable.
		const { reponse } = await seDonnerLeRoleDEditeur();
		const arrivee = reponse.headers.get('location') ?? '';
		await remettreResponsable();
		expect(element(await page200(arrivee, cookie), 'avis-role')).toBe('');
		// Éditrice, elle ne le lit qu'en arrivant : l'écran suivant ne le redit pas.
		await maintenance((tx) =>
			tx.execute(sql`update "membership" set "role" = 'editor' where "id" = ${sienne}`)
		);
		expect(element(await page200('/cours', cookie), 'avis-role')).toBe('');
	});
});

/** Ce que la demande de confirmation dit à une responsable qui se retire elle-même. */
const SE_RETIRER: Record<Langue, string> = {
	fr: 'Vous allez vous retirer vous-même de l’organisation.',
	de: 'Sie sind dabei, sich selbst aus der Organisation zu entfernen.',
	it: 'Stai per lasciare l’organizzazione.',
	en: 'You are about to remove yourself from the organisation.',
	ar: 'أنت على وشك إزالة نفسك من المؤسسة.'
};

/** L'encadré de « Vos organisations », à l'arrivée, après un départ. */
const PARTIE: Record<Langue, string> = {
	fr: 'Vous avez quitté l’organisation. Son espace ne vous est plus ouvert. Pour y revenir, demandez à une personne responsable de vous inviter de nouveau.',
	de: 'Sie haben die Organisation verlassen. Der Bereich der Organisation steht Ihnen nicht mehr offen. Um zurückzukommen, bitten Sie eine Person in der Leitung, Sie wieder einzuladen.',
	it: 'Hai lasciato l’organizzazione. La sua area non ti è più accessibile. Per tornare, chiedi a un responsabile di invitarti di nuovo.',
	en: 'You have left the organisation. Its area is no longer open to you. To come back, ask a manager to invite you again.',
	ar: 'لقد غادرت المؤسسة، ولم تعد مساحتها مفتوحة لك. وللعودة إليها اطلب من أحد المسؤولين أن يدعوك من جديد.'
};

/** L'organisation que désigne la session de ce cookie, relevée par le propriétaire. */
async function organisationDeLaSession(cookie: string): Promise<string | null | undefined> {
	const jeton = decodeURIComponent(cookie.split('=')[1] ?? '').split('.')[0] ?? '';
	const [ligne] = await maintenance(async (tx) =>
		lignes<{ active_organization_id: string | null }>(
			await tx.execute(sql`select "active_organization_id" from "session" where "token" = ${jeton}`)
		)
	);
	return ligne?.active_organization_id;
}

describe('une responsable qui se retire elle-même de l’organisation (étape 19)', () => {
	const seconde = newId();
	let cookie = '';
	let sienne = '';

	/**
	 * Son adhésion de responsable, et son acceptation des conditions, que le retrait emporte : les
	 * groupes qui suivent l'attendent dans l'organisation du fichier.
	 */
	async function remettre(): Promise<void> {
		await maintenance(async (tx) => {
			const rendue = lignes(
				await tx.execute(sql`
					insert into "membership" ("id", "organization_id", "user_id", "role")
					values (${sienne}, ${organizationId}, ${ids[RESPONSABLE] ?? ''}, 'org_admin')
					on conflict ("id") do nothing
					returning "id"
				`)
			);
			if (rendue.length > 0) {
				await tx.execute(conditionsAcceptees(organizationId, ids[RESPONSABLE] ?? ''));
			}
		});
	}

	beforeAll(async () => {
		// Une seconde responsable : la base refuse de laisser l'organisation sans responsable.
		await maintenance(async (tx) => {
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified")
				values (${seconde}, 'mr-seconde-depart@example.test', true)
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organizationId}, ${seconde}, 'org_admin')
			`);
			const [adhesion] = lignes<{ id: string }>(
				await tx.execute(sql`
					select "id" from "membership"
					where "organization_id" = ${organizationId} and "user_id" = ${ids[RESPONSABLE] ?? ''}
				`)
			);
			sienne = adhesion?.id ?? '';
		});
		cookie = await signIn(RESPONSABLE);
	});

	afterAll(async () => {
		await remettre();
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		await maintenance((tx) =>
			tx.execute(sql`delete from "membership" where "user_id" = ${seconde}`)
		);
	});

	it.each(LANGUES)(
		'asks her in %s, then tells her on « Vos organisations » that she has left',
		async (langue) => {
			await remettre();
			await poserLangueDuCompte(RESPONSABLE, langue);
			// L'organisation qu'elle quitte est celle de sa session. Membre d'une seule, elle n'a rien
			// à choisir, et sa session ne nomme alors aucune organisation : sans ce choix, la
			// vérification d'après passait à vide.
			expect((await postForm('/organisations?/choisir', { organizationId }, cookie)).status).toBe(
				303
			);
			expect(await organisationDeLaSession(cookie)).toBe(organizationId);
			// Le bouton de sa propre ligne, tel que l'écran le montre.
			const bouton = formulaireDeLaPage(
				await page200('/membres', cookie),
				'?/retirer',
				avec({ membershipId: sienne })
			);
			expect(bouton, 'le bouton de sa ligne').not.toBeNull();
			const premier = await postForm('/membres?/retirer', bouton ?? {}, cookie);
			expect(premier.status).toBe(200);
			const demande = element(await premier.text(), 'confirmer-membre');
			// La demande lui parle d'elle-même, sans recopier son adresse.
			expect(lu(demande)).toContain(SE_RETIRER[langue]);
			expect(demande).not.toContain(RESPONSABLE);
			expect(await roleDe(sienne), 'rien n’est retiré avant la confirmation').toBe('org_admin');

			const confirmer = formulaireDeLaPage(demande, '?/retirer');
			expect(confirmer).toEqual({ membershipId: sienne, confirm: 'yes' });
			const reponse = await postForm('/membres?/retirer', confirmer ?? {}, cookie);
			// Membres ne lui est plus ouvert : elle est envoyée sur « Vos organisations ».
			expect(reponse.status).toBe(303);
			const arrivee = new URL(reponse.headers.get('location') ?? '', origin);
			expect(arrivee.pathname).toBe('/organisations');
			expect(await roleDe(sienne)).toBeUndefined();
			// La session ne désigne plus l'organisation qu'elle vient de quitter.
			expect(await organisationDeLaSession(cookie)).toBeNull();

			const html = await page200(`${arrivee.pathname}${arrivee.search}`, cookie);
			const avis = element(html, 'avis-depart');
			expect(avis).toMatch(/role="status"/);
			expect(lu(avis)).toBe(PARTIE[langue]);
			// Avant tout le reste, titre compris, comme l'encadré de la responsable devenue éditrice.
			expect(html.indexOf('id="avis-depart"')).toBeLessThan(html.indexOf('<h1'));
			// Et c'est vrai : Membres la renvoie.
			expect((await get('/membres', cookie)).status).toBe(303);
		}
	);

	it('says nothing to someone who is still a member of the organisation the address names', async () => {
		await remettre();
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		// Une adresse copiée, ouverte par une personne qui est membre : rien de faux.
		const adresse = `/organisations?avis=depart&organisation=${organizationId}`;
		expect(element(await page200(adresse, cookie), 'avis-depart')).toBe('');
		// Ni pour une adresse qui ne nomme aucune organisation.
		for (const organisation of ['', 'pas-un-identifiant']) {
			const autre = `/organisations?avis=depart&organisation=${organisation}`;
			expect(element(await page200(autre, cookie), 'avis-depart'), autre).toBe('');
		}
	});
});

/** « Quitter l'organisation », sa demande de confirmation et son refus, dans chaque langue. */
const QUITTER: Record<
	Langue,
	{ bouton: string; demande: string; confirmer: string; rester: string; seule: string }
> = {
	fr: {
		bouton: 'Quitter l’organisation',
		demande: 'Vous allez quitter cette organisation :',
		confirmer: 'Confirmer le départ',
		rester: 'Rester dans l’organisation',
		seule: 'Vous êtes la seule personne responsable de cette organisation :'
	},
	de: {
		bouton: 'Organisation verlassen',
		demande: 'Sie sind dabei, diese Organisation zu verlassen:',
		confirmer: 'Austritt bestätigen',
		rester: 'In der Organisation bleiben',
		seule: 'Sie sind die einzige Person in der Leitung dieser Organisation:'
	},
	it: {
		bouton: 'Lascia l’organizzazione',
		demande: 'Stai per lasciare questa organizzazione:',
		confirmer: 'Conferma l’uscita',
		rester: 'Resta nell’organizzazione',
		seule: 'Sei l’unica persona responsabile di questa organizzazione:'
	},
	en: {
		bouton: 'Leave the organisation',
		demande: 'You are about to leave this organisation:',
		confirmer: 'Confirm leaving',
		rester: 'Stay in the organisation',
		seule: 'You are the only manager of this organisation:'
	},
	ar: {
		bouton: 'مغادرة المؤسسة',
		demande: 'أنت على وشك مغادرة هذه المؤسسة:',
		confirmer: 'تأكيد المغادرة',
		rester: 'البقاء في المؤسسة',
		seule: 'أنت المسؤول الوحيد عن هذه المؤسسة:'
	}
};

/** Ce que le refus dit de faire à la seule personne responsable qui voudrait partir. */
const AVANT_DE_PARTIR: Record<Langue, string> = {
	fr: 'Une organisation garde toujours au moins une personne responsable. Avant de la quitter, ouvrez-la, puis, dans l’écran Membres, donnez le rôle de responsable à un autre membre ou invitez une personne comme responsable.',
	de: 'Eine Organisation behält immer mindestens eine Person in der Leitung. Bevor Sie sie verlassen, öffnen Sie sie und geben Sie auf der Seite «Mitglieder» einem anderen Mitglied die Rolle «Leitung», oder laden Sie eine Person für die Leitung ein.',
	it: 'Un’organizzazione ha sempre almeno un responsabile. Prima di lasciarla, aprila e, nella pagina Membri, dai il ruolo di responsabile a un altro membro o invita una persona come responsabile.',
	en: 'An organisation always keeps at least one manager. Before leaving it, open it, then, on the Members screen, give the manager role to another member or invite someone as a manager.',
	ar: 'تحتفظ المؤسسة دائمًا بمسؤول واحد أو أكثر. قبل مغادرتها، افتحها، ثم امنح في صفحة «الأعضاء» دور المسؤول لعضو آخر أو ادعُ شخصًا بصفة مسؤول.'
};

/** Ce que « Vos organisations » répond pour une organisation dont la personne n'est pas membre. */
const PAS_MEMBRE = 'Vous n’êtes pas membre de cette organisation.';

/** Le lien de la navigation vers « Vos organisations », pour qui n'a qu'une organisation. */
const VOS_ORGANISATIONS: Record<Langue, string> = {
	fr: 'Vos organisations',
	de: 'Ihre Organisationen',
	it: 'Le tue organizzazioni',
	en: 'Your organisations',
	ar: 'مؤسساتك'
};

/** Le même lien, pour qui en a plusieurs ou a une invitation qui attend. */
const CHANGER: Record<Langue, string> = {
	fr: 'Changer d’organisation',
	de: 'Organisation wechseln',
	it: 'Cambia organizzazione',
	en: 'Change organisation',
	ar: 'تغيير المؤسسة'
};

describe('quitter une organisation depuis « Vos organisations » (étape 19)', () => {
	/** Celle que l'on quitte : une éditrice, deux responsables. */
	const QUITTEE = { id: newId(), slug: 'mr-quittee', nom: 'Association que l’on quitte' };
	/** Une seule responsable, et la même éditrice. */
	const SEULE = { id: newId(), slug: 'mr-seule', nom: 'Association d’une seule responsable' };
	const PARTANTE = 'mr-partante@example.test';
	const AUSSI = 'mr-responsable-aussi@example.test';
	const RESTE = 'mr-responsable-reste@example.test';
	const UNIQUE = 'mr-seule-responsable@example.test';
	/** Une éditrice d'une seule organisation, sans invitation : le cas le plus courant. */
	const SOLO = 'mr-une-seule-organisation@example.test';
	const personnes: Record<string, string> = {};
	/** Les adhésions, par adresse et par organisation : `adresse organisation`. */
	const adhesions: Record<string, string> = {};
	const cookies: Record<string, string> = {};
	let appHandle: DatabaseHandle;

	/** Remet une adhésion, avec son acceptation des conditions, si le départ l'a emportée. */
	async function remettre(email: string, organisation: string, role: string): Promise<void> {
		await maintenance(async (tx) => {
			const rendue = lignes(
				await tx.execute(sql`
					insert into "membership" ("id", "organization_id", "user_id", "role")
					values (${adhesions[`${email} ${organisation}`] ?? ''}, ${organisation},
						${personnes[email] ?? ''}, ${role})
					on conflict ("id") do nothing
					returning "id"
				`)
			);
			if (rendue.length > 0) {
				await tx.execute(conditionsAcceptees(organisation, personnes[email] ?? ''));
			}
		});
	}

	/** Le rôle d'une personne dans une organisation, ou `undefined` si elle n'en est plus membre. */
	async function roleDans(email: string, organisation: string): Promise<string | undefined> {
		return roleDe(adhesions[`${email} ${organisation}`] ?? '');
	}

	/** Les acceptations des conditions d'une personne dans une organisation. */
	async function acceptations(email: string, organisation: string): Promise<number> {
		const trouvees = await maintenance(async (tx) =>
			lignes(
				await tx.execute(sql`
					select 1 from "terms_acceptance"
					where "organization_id" = ${organisation} and "user_id" = ${personnes[email] ?? ''}
				`)
			)
		);
		return trouvees.length;
	}

	beforeAll(async () => {
		appHandle = createDatabase({ role: 'app', overrides: { database: testDatabase } });
		for (const email of [PARTANTE, AUSSI, RESTE, UNIQUE, SOLO]) personnes[email] = newId();
		const membres = [
			[PARTANTE, QUITTEE.id, 'editor'],
			[AUSSI, QUITTEE.id, 'org_admin'],
			[RESTE, QUITTEE.id, 'org_admin'],
			[PARTANTE, SEULE.id, 'editor'],
			[UNIQUE, SEULE.id, 'org_admin'],
			[SOLO, QUITTEE.id, 'editor']
		] as const;
		for (const [email, organisation] of membres) {
			adhesions[`${email} ${organisation}`] = newId();
		}
		await maintenance(async (tx) => {
			for (const organisation of [QUITTEE, SEULE]) {
				await tx.execute(sql`
					insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
						"enabled_language")
					values (${organisation.id}, ${organisation.slug}, ${organisation.nom}, 'Europe/Zurich',
						'fr', array['fr'])
				`);
			}
			for (const [email, id] of Object.entries(personnes)) {
				await tx.execute(sql`
					insert into "user" ("id", "email", "email_verified") values (${id}, ${email}, true)
				`);
			}
		});
		for (const [email, organisation, role] of membres) await remettre(email, organisation, role);
		for (const email of [PARTANTE, AUSSI, UNIQUE, SOLO]) cookies[email] = await signIn(email);
	});

	afterAll(async () => {
		for (const email of [PARTANTE, AUSSI, UNIQUE, SOLO]) await poserLangueDuCompte(email, 'fr');
		await appHandle?.close();
	});

	it.each(LANGUES)(
		'offers in %s « Quitter l’organisation » for each organisation of the list',
		async (langue) => {
			await poserLangueDuCompte(PARTANTE, langue);
			const html = await page200('/organisations', cookies[PARTANTE] ?? '');
			for (const organisation of [QUITTEE, SEULE]) {
				const bouton = formulaireDeLaPage(
					html,
					'?/quitter',
					avec({ organizationId: organisation.id })
				);
				expect(bouton, organisation.nom).toEqual({ organizationId: organisation.id });
			}
			const boutons = [...html.matchAll(/<form\b[^>]*action="\?\/quitter"[\s\S]*?<\/form>/g)].map(
				([formulaire]) => lu(formulaire)
			);
			expect(boutons).toEqual([QUITTER[langue].bouton, QUITTER[langue].bouton]);
		}
	);

	it.each(LANGUES)(
		'leads someone with one organisation from the menu, in %s, to « Vos organisations », where she leaves',
		async (langue) => {
			await remettre(SOLO, QUITTEE.id, 'editor');
			await poserLangueDuCompte(SOLO, langue);
			const cookie = cookies[SOLO] ?? '';
			// Rien à changer pour elle, mais « Vos organisations » lui propose de partir : sans ce lien,
			// seule l'arrivée d'un lien de connexion ou l'adresse tapée à la main l'y menait.
			for (const route of ['/', '/cours', '/partager']) {
				const html = await page200(route, cookie);
				// La page est bien celle de son espace : un renvoi passerait pour un menu sans lien.
				expect(html, route).toContain(QUITTEE.nom);
				expect(
					liensDuMenu(html, route, langue).filter((lien) => lien.chemin === '/organisations'),
					route
				).toEqual([{ chemin: '/organisations', texte: VOS_ORGANISATIONS[langue] }]);
				expect(html, route).not.toContain(CHANGER[langue]);
			}

			const quitter = formulaireDeLaPage(
				await page200('/organisations', cookie),
				'?/quitter',
				avec({ organizationId: QUITTEE.id })
			);
			expect(quitter, 'le bouton qui la fait partir').toEqual({ organizationId: QUITTEE.id });
			const demande = await postForm('/organisations?/quitter', quitter ?? {}, cookie);
			expect(demande.status).toBe(200);
			const confirmer = formulaireDeLaPage(
				element(await demande.text(), 'confirmer-depart'),
				'?/quitter'
			);
			expect(confirmer).toEqual({ organizationId: QUITTEE.id, confirm: 'yes' });
			const partie = await postForm('/organisations?/quitter', confirmer ?? {}, cookie);
			expect(partie.status).toBe(303);
			const arrivee = new URL(partie.headers.get('location') ?? '', origin);
			const html = await page200(`${arrivee.pathname}${arrivee.search}`, cookie);
			expect(lu(element(html, 'avis-depart'))).toBe(PARTIE[langue]);
			expect(await roleDans(SOLO, QUITTEE.id)).toBeUndefined();
		}
	);

	it.each(LANGUES)(
		'asks in %s before leaving, and leaves nothing until confirmed',
		async (langue) => {
			await remettre(PARTANTE, QUITTEE.id, 'editor');
			await poserLangueDuCompte(PARTANTE, langue);
			const demande = await postForm(
				'/organisations?/quitter',
				{ organizationId: QUITTEE.id },
				cookies[PARTANTE] ?? ''
			);
			expect(demande.status).toBe(200);
			const html = await demande.text();
			const boite = element(html, 'confirmer-depart');
			expect(boite).toMatch(/role="alert"/);
			// En haut, avant la liste : après l'envoi, la page s'ouvre en haut.
			expect(html.indexOf('id="confirmer-depart"')).toBeGreaterThan(html.indexOf('<h1'));
			expect(html.indexOf('id="confirmer-depart"')).toBeLessThan(
				html.indexOf('action="?/choisir"')
			);
			expect(lu(boite)).toContain(`${QUITTER[langue].demande} ${QUITTEE.nom}`);
			expect(boite).toContain(`<bdi>${QUITTEE.nom}</bdi>`);
			const confirmer = formulaireDeLaPage(boite, '?/quitter');
			expect(confirmer).toEqual({ organizationId: QUITTEE.id, confirm: 'yes' });
			expect(lu(boite.match(/<form\b[\s\S]*?<\/form>/)?.[0] ?? '')).toBe(QUITTER[langue].confirmer);
			const rester = boite.match(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
			expect(new URL(rester?.[1] ?? '', `${origin}/organisations`).pathname).toBe('/organisations');
			expect(lu(rester?.[2] ?? '')).toBe(QUITTER[langue].rester);
			expect(await roleDans(PARTANTE, QUITTEE.id), 'rien ne part avant la confirmation').toBe(
				'editor'
			);
		}
	);

	it.each(LANGUES)(
		'leaves once confirmed, says so in %s where she arrives, and writes it in the journal',
		async (langue) => {
			await remettre(PARTANTE, QUITTEE.id, 'editor');
			await poserLangueDuCompte(PARTANTE, langue);
			const cookie = cookies[PARTANTE] ?? '';
			// L'organisation qu'elle quitte est celle de sa session.
			expect(
				(await postForm('/organisations?/choisir', { organizationId: QUITTEE.id }, cookie)).status
			).toBe(303);
			expect(await organisationDeLaSession(cookie)).toBe(QUITTEE.id);
			const adhesion = adhesions[`${PARTANTE} ${QUITTEE.id}`] ?? '';

			const reponse = await postForm(
				'/organisations?/quitter',
				{ organizationId: QUITTEE.id, confirm: 'yes' },
				cookie
			);
			expect(reponse.status).toBe(303);
			const arrivee = new URL(reponse.headers.get('location') ?? '', origin);
			expect(arrivee.pathname).toBe('/organisations');
			// L'adhésion part, avec son acceptation des conditions ; la session ne nomme plus
			// l'organisation ; l'autre organisation reste.
			expect(await roleDans(PARTANTE, QUITTEE.id)).toBeUndefined();
			expect(await acceptations(PARTANTE, QUITTEE.id)).toBe(0);
			expect(await organisationDeLaSession(cookie)).toBeNull();
			expect(await roleDans(PARTANTE, SEULE.id)).toBe('editor');
			// Le journal de l'organisation le dit, signé de la personne qui part (migration 0063).
			const journal = await withOrg(
				appHandle.db,
				{ organizationId: QUITTEE.id, userId: personnes[RESTE] ?? '' },
				async (tx) =>
					lignes<{ action: string; actor_id: string; target_table: string }>(
						await tx.execute(sql`
							select "action", "actor_id", "target_table" from "audit_log"
							where "target_id" = ${adhesion} order by "created_at" desc, "id" desc
						`)
					)
			);
			expect(journal[0]).toEqual({
				action: 'member.leave',
				actor_id: personnes[PARTANTE],
				target_table: 'membership'
			});

			const html = await page200(`${arrivee.pathname}${arrivee.search}`, cookie);
			expect(lu(element(html, 'avis-depart'))).toBe(PARTIE[langue]);
			expect(
				formulaireDeLaPage(html, '?/quitter', avec({ organizationId: QUITTEE.id }))
			).toBeNull();
			expect(
				formulaireDeLaPage(html, '?/quitter', avec({ organizationId: SEULE.id }))
			).not.toBeNull();
		}
	);

	it('lets a manager leave when another one stays', async () => {
		await remettre(AUSSI, QUITTEE.id, 'org_admin');
		await poserLangueDuCompte(AUSSI, 'fr');
		const cookie = cookies[AUSSI] ?? '';
		const demande = await postForm(
			'/organisations?/quitter',
			{ organizationId: QUITTEE.id },
			cookie
		);
		expect(demande.status).toBe(200);
		expect(element(await demande.text(), 'confirmer-depart')).not.toBe('');
		const reponse = await postForm(
			'/organisations?/quitter',
			{ organizationId: QUITTEE.id, confirm: 'yes' },
			cookie
		);
		expect(reponse.status).toBe(303);
		expect(await roleDans(AUSSI, QUITTEE.id)).toBeUndefined();
		expect(await roleDans(RESTE, QUITTEE.id)).toBe('org_admin');
		await remettre(AUSSI, QUITTEE.id, 'org_admin');
	});

	it.each(LANGUES)(
		'refuses in %s the only manager, before and after confirming, and says what to do',
		async (langue) => {
			await poserLangueDuCompte(UNIQUE, langue);
			const cookie = cookies[UNIQUE] ?? '';
			// Sans confirmation, l'écran ne demande pas de confirmer un départ que la base refuserait ;
			// avec, c'est le refus de la base, traduit (déclencheur de la migration 0012).
			for (const confirm of ['', 'yes']) {
				const reponse = await postForm(
					'/organisations?/quitter',
					{ organizationId: SEULE.id, confirm },
					cookie
				);
				expect(reponse.status, confirm).toBe(409);
				const html = await reponse.text();
				expect(element(html, 'confirmer-depart'), confirm).toBe('');
				const refus = lu(element(html, 'refus-depart'));
				expect(element(html, 'refus-depart'), confirm).toMatch(/role="alert"/);
				expect(refus, confirm).toBe(
					`${QUITTER[langue].seule} ${SEULE.nom} ${AVANT_DE_PARTIR[langue]}`
				);
			}
			expect(await roleDans(UNIQUE, SEULE.id)).toBe('org_admin');
		}
	);

	it('answers an organisation she is not a member of, or no identifier at all, with a sentence', async () => {
		await poserLangueDuCompte(PARTANTE, 'fr');
		await maintenance((tx) =>
			tx.execute(
				sql`delete from "membership" where "id" = ${adhesions[`${PARTANTE} ${QUITTEE.id}`] ?? ''}`
			)
		);
		for (const organizationId of [QUITTEE.id, newId(), 'pas-un-identifiant', '']) {
			for (const confirm of ['', 'yes']) {
				const reponse = await postForm(
					'/organisations?/quitter',
					{ organizationId, confirm },
					cookies[PARTANTE] ?? ''
				);
				const cas = `« ${organizationId} » ${confirm}`;
				expect(reponse.status, cas).toBe(403);
				expect(alerte(await reponse.text()), cas).toBe(PAS_MEMBRE);
			}
		}
		// Et rien n'a bougé ailleurs.
		expect(await roleDans(PARTANTE, SEULE.id)).toBe('editor');
		expect(await roleDans(RESTE, QUITTEE.id)).toBe('org_admin');
	});
});

/** Les phrases qui disent, avant la suppression, ce qu'une salle occupée garde. */
const OCCUPEE: Record<Langue, readonly [string, string]> = {
	fr: [
		'2 cours utilisent cette salle ; ils n’auront plus de salle si vous la supprimez.',
		'Une prière du vendredi utilise cette salle ; elle n’aura plus de salle si vous la supprimez.'
	],
	de: [
		'2 Kurse nutzen diesen Raum. Wenn Sie den Raum löschen, haben diese Kurse keinen Raum mehr.',
		'Ein Freitagsgebet nutzt diesen Raum. Wenn Sie den Raum löschen, hat es keinen Raum mehr.'
	],
	it: [
		'2 corsi usano questa sala; se la elimini, resteranno senza sala.',
		'Una preghiera del venerdì usa questa sala; se la elimini, resterà senza sala.'
	],
	en: [
		'2 courses use this room. If you delete the room, these courses will have no room.',
		'One Friday prayer uses this room. If you delete the room, it will have no room.'
	],
	ar: [
		'درسان يستخدمان هذه القاعة، وسيبقيان بلا قاعة إذا حذفتها.',
		'صلاة جمعة واحدة تستخدم هذه القاعة، وستبقى بلا قاعة إذا حذفتها.'
	]
};

/** La phrase d'aide pour une ville absente de la liste, la même qu'au super-admin. */
const ABSENTE: Record<Langue, string> = {
	fr: 'Si la ville de l’organisation n’est pas dans la liste, choisissez une ville qui a toujours la même heure qu’elle. Pour la plus grande partie de l’Europe : Europe/Zurich, Europe/Paris ou Europe/Berlin.',
	de: 'Steht der Ort der Organisation nicht in der Liste, wählen Sie eine Stadt, in der immer die gleiche Uhrzeit gilt wie dort. Für den grössten Teil Europas: Europe/Zurich, Europe/Paris oder Europe/Berlin.',
	it: 'Se la città dell’organizzazione non è nella lista, scegli una città che abbia sempre la stessa ora di quella dell’organizzazione. Per la maggior parte dell’Europa: Europe/Zurich, Europe/Paris o Europe/Berlin.',
	en: 'If the town of the organisation is not in the list, choose a city that always has the same time as that town. For most of Europe: Europe/Zurich, Europe/Paris or Europe/Berlin.',
	ar: 'إذا لم تكن مدينة المؤسسة في القائمة، فاختر مدينة لها دائمًا توقيت مدينة المؤسسة نفسه. لمعظم دول أوروبا: Europe/Zurich أو Europe/Paris أو Europe/Berlin.'
};

/** Le refus d'un fuseau hors de la liste, le même qu'au super-admin. */
const HORS_LISTE: Record<Langue, string> = {
	fr: 'Choisissez le fuseau horaire dans la liste.',
	de: 'Wählen Sie die Zeitzone aus der Liste.',
	it: 'Scegli il fuso orario dalla lista.',
	en: 'Pick the time zone from the list.',
	ar: 'اختر المنطقة الزمنية من القائمة.'
};

/**
 * Ce que Réglages dit d'un fuseau enregistré hors de la liste, un alias : il est gardé, et c'est vrai,
 * puisque le flux agenda le ramène à son fuseau canonique (relecture du lot 7).
 */
const ALIAS_GARDE: Record<Langue, string> = {
	fr: 'Votre fuseau actuel, Europe/Amsterdam, ne fait pas partie de la liste. Il est gardé tant que vous n’en choisissez pas un autre.',
	de: 'Ihre aktuelle Zeitzone, Europe/Amsterdam, steht nicht in der Liste. Sie bleibt erhalten, solange Sie keine andere wählen.',
	it: 'Il tuo fuso orario attuale, Europe/Amsterdam, non è nella lista. Resta tale finché non ne scegli un altro.',
	en: 'Your current time zone, Europe/Amsterdam, is not in the list. It is kept until you choose another one.',
	ar: 'منطقتك الزمنية الحالية، Europe/Amsterdam، ليست في القائمة. تبقى كما هي ما لم تختر منطقة أخرى.'
};

/** Ce qu'il dit d'un fuseau hors de la liste avec lequel le flux marche : un `Etc/`, canonique. */
const GARDE_AVEC_CALENDRIER =
	'Votre fuseau actuel, Etc/GMT-1, ne fait pas partie de la liste. Il est gardé tant que vous n’en choisissez pas un autre.';

describe('l’écran Réglages dans les cinq langues (retours B1, D2 et A3)', () => {
	let cookie = '';
	const rendus: Partial<Record<Langue, string>> = {};
	const confirmations: Partial<Record<Langue, string>> = {};
	const erreurs: Partial<Record<Langue, string>> = {};
	const refusDuModule: Partial<Record<Langue, string>> = {};

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		for (const langue of LANGUES) {
			await poserLangueDuCompte(RESPONSABLE, langue);
			rendus[langue] = await (await get('/reglages', cookie)).text();
			const demande = await postForm('/reglages?/supprimerSalle', { roomId: salleOccupee }, cookie);
			expect(demande.status, langue).toBe(409);
			confirmations[langue] = await demande.text();
			const vide = await postForm(
				'/reglages?/enregistrer',
				{
					name: '',
					timeZone: 'Europe/Zurich',
					accentColor: '#0f766e',
					greeting: 'Salam',
					enabledLanguages: 'fr',
					defaultLanguage: 'fr'
				},
				cookie
			);
			expect(vide.status, langue).toBe(400);
			erreurs[langue] = await vide.text();
			// La prière du vendredi retient le module allumé : la base et l'écran le refusent.
			const module = await postForm('/reglages?/modulePrieres', { allume: 'non' }, cookie);
			expect(module.status, langue).toBe(409);
			refusDuModule[langue] = await module.text();
		}
		await poserLangueDuCompte(RESPONSABLE, 'fr');
	});

	it.each(LANGUES)('serves /reglages with <html lang="%s">, its answers too', (langue) => {
		for (const html of [rendus, confirmations, erreurs, refusDuModule].map((r) => r[langue])) {
			expect(html?.match(/<html\b[^>]*>/g)).toEqual([
				`<html lang="${langue}" dir="${SENS[langue]}">`
			]);
		}
		// Le fuseau est une valeur technique, de gauche à droite ; un nom suit sa propre écriture.
		const html = rendus[langue] ?? '';
		expect(html).toMatch(/<select\b[^>]*\bname="timeZone"[^>]*\bdir="ltr"/);
		for (const nom of ['name', 'greeting']) {
			expect(html).toMatch(new RegExp(`<input\\b[^>]*\\bid="${nom}"[^>]*\\bdir="auto"`));
		}
	});

	it.each(LANGUES.slice(1))('leaves no French sentence on /reglages in %s', (langue) => {
		expect(textSegments(rendus.fr ?? '').size).toBeGreaterThan(20);
		for (const [nom, rendu] of Object.entries({ rendus, confirmations, erreurs, refusDuModule })) {
			expect(frenchLeft(rendu.fr ?? '', rendu[langue] ?? '', PERMIS), nom).toEqual([]);
		}
		expect(titre(rendus[langue] ?? '')).not.toBe(titre(rendus.fr ?? ''));
		for (const rendu of [erreurs, refusDuModule]) {
			expect(alerte(rendu[langue] ?? '')).not.toBe('');
			expect(alerte(rendu[langue] ?? '')).not.toBe(alerte(rendu.fr ?? ''));
		}
	});

	it.each(LANGUES)('writes no date as AAAA-MM-JJ on /reglages in %s', (langue) => {
		for (const rendu of [rendus, confirmations, erreurs, refusDuModule]) {
			expect(visibleText(rendu[langue] ?? '').match(ISO_DATE)?.[0] ?? null).toBeNull();
		}
	});

	it('explains each field in plain words, with an example where one helps', () => {
		const texte = visibleText(rendus.fr ?? '');
		for (const attendu of [
			'Votre page publique l’affiche tout en haut.',
			'En Suisse, choisissez Europe/Zurich.',
			ABSENTE.fr,
			'Exemple : Assalamu alaykum',
			'Langues de votre page publique',
			'Exemple : Grande salle',
			// L'organisation a les heures de prière activées : le bouton propose l'inverse.
			'Désactiver les heures de prière'
		]) {
			expect(texte).toContain(attendu);
		}
		// Plus de mot technique : ni « IANA », ni « module », ni « widget », ni « accent ». En début
		// de mot : la liste des fuseaux nomme « America/Indiana/Indianapolis ».
		for (const technique of ['IANA', 'module', 'widget', 'accent']) {
			expect(texte).not.toMatch(new RegExp(`\\b${technique}`, 'i'));
		}
		expect(alerte(erreurs.fr ?? '')).toBe('Écrivez le nom de l’organisation.');
	});

	it.each(LANGUES)('says in %s, next to an occupied room, what deleting it would do', (langue) => {
		const liste = element(rendus[langue] ?? '', 'salles');
		const [occupee, libre] = elementsDeListe(liste);
		expect(occupee).toContain(SALLE_OCCUPEE);
		for (const phrase of OCCUPEE[langue]) expect(occupee).toContain(phrase);
		expect(libre).toContain(SALLE_LIBRE);
		for (const phrase of OCCUPEE[langue]) expect(libre).not.toContain(phrase);
	});

	it.each(LANGUES)('asks in %s before deleting an occupied room', (langue) => {
		const html = confirmations[langue] ?? '';
		const demande = element(html, 'confirmer-salle');
		expect(demande, langue).toMatch(/role="alert"/);
		// En haut, sous le titre et avant le formulaire des réglages : après l'envoi, la page s'ouvre
		// en haut, avec ou sans JavaScript, et la demande doit s'y lire sans chercher.
		const place = html.indexOf('id="confirmer-salle"');
		expect(place).toBeGreaterThan(html.indexOf('<h1'));
		expect(place).toBeLessThan(html.indexOf('action="?/enregistrer"'));
		const texte = lu(demande);
		expect(texte).toContain(SALLE_OCCUPEE);
		for (const phrase of OCCUPEE[langue]) expect(texte).toContain(phrase);
		// Le formulaire qui confirme porte la salle et la confirmation ; « garder » ramène à l'écran.
		const formulaire = demande.match(/<form\b[\s\S]*?<\/form>/)?.[0] ?? '';
		expect(formulaire).toMatch(/action="\?\/supprimerSalle"/);
		expect(formulaire).toContain(`name="roomId" value="${salleOccupee}"`);
		expect(formulaire).toMatch(/name="confirm" value="yes"/);
		// SvelteKit écrit ses liens en relatif : c'est l'adresse résolue qui dit où l'on arrive.
		const garder = demande.match(/<a\b[^>]*\bhref="([^"]*)"/)?.[1] ?? '';
		expect(garder).not.toBe('');
		expect(new URL(garder, `${origin}/reglages`).pathname).toBe('/reglages');
	});
});

describe('Réglages après un refus, et le fuseau dans une liste (retour B1)', () => {
	let cookie = '';
	let avant: Reglages;

	/** Les réglages du formulaire, tels qu'ils sont enregistrés, avec ce que le test change. */
	function champs(change: Partial<Record<string, string | readonly string[]>>) {
		return {
			name: avant.name,
			timeZone: avant.time_zone,
			accentColor: avant.accent_color,
			greeting: avant.greeting,
			enabledLanguages: avant.enabled_language,
			defaultLanguage: avant.default_language,
			...change
		} as Record<string, string | readonly string[]>;
	}

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		avant = await reglagesEnBase();
	});

	afterAll(async () => {
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		// Les réglages du début, pour les groupes qui suivent.
		await maintenance((tx) =>
			tx.execute(sql`
				update "organization" set "name" = ${avant.name}, "time_zone" = ${avant.time_zone},
					"accent_color" = ${avant.accent_color}, "greeting" = ${avant.greeting},
					"enabled_language" = ${sql.raw(
						`array[${avant.enabled_language.map((code) => `'${code}'`).join(',')}]::text[]`
					)},
					"default_language" = ${avant.default_language}
				where "id" = ${organizationId}
			`)
		);
	});

	it('shows again, after a refusal, everything that was typed', async () => {
		const refus = await postForm(
			'/reglages?/enregistrer',
			champs({
				name: 'Nom tapé puis refusé',
				timeZone: 'Europe/Berlin',
				accentColor: '#1d4ed8',
				greeting: 'Salam à tous',
				enabledLanguages: ['de', 'it'],
				defaultLanguage: 'fr'
			}),
			cookie
		);
		expect(refus.status).toBe(400);
		const html = await refus.text();
		expect(alerte(html)).toBe('La langue par défaut doit faire partie des langues cochées.');
		expect(valeurDuChamp(html, 'name')).toBe('Nom tapé puis refusé');
		expect(optionsChoisies(html, 'timeZone')).toEqual(['Europe/Berlin']);
		expect(valeurDuChamp(html, 'accentColor')).toBe('#1d4ed8');
		expect(valeurDuChamp(html, 'greeting')).toBe('Salam à tous');
		expect(casesCochees(html, 'enabledLanguages')).toEqual(['de', 'it']);
		expect(optionsChoisies(html, 'defaultLanguage')).toEqual(['fr']);
		// Et rien n'est enregistré.
		expect(await reglagesEnBase()).toEqual(avant);
	});

	it('offers the time zones of the super-admin list, Europe first, and no alias', async () => {
		const html = await page200('/reglages', cookie);
		const liste = element(html, 'timeZone');
		expect(champ(html, 'timeZone')).toMatch(/^<select\b[^>]*\bname="timeZone"/);
		const groupes = [
			...liste.matchAll(/<optgroup\b[^>]*\blabel="([^"]*)"[^>]*>([\s\S]*?)<\/optgroup>/g)
		].map(([, libelle, contenu]) => ({ libelle, zones: optionsDe(contenu ?? '') }));
		expect(groupes).toEqual([
			{ libelle: 'Europe', zones: [...timeZoneChoices().europe] },
			{ libelle: 'Reste du monde', zones: [...timeZoneChoices().world] }
		]);
		expect(optionsDe(liste)).not.toContain('Europe/Amsterdam');
		expect(optionsChoisies(html, 'timeZone')).toEqual(['Europe/Zurich']);
		const aide = lu(element(html, 'timeZone-aide'));
		expect(aide).toContain('En Suisse, choisissez Europe/Zurich.');
		expect(aide).toContain(ABSENTE.fr);
	});

	it.each(LANGUES)(
		'refuses in %s a time zone the list does not offer, and keeps the one saved',
		async (langue) => {
			await poserLangueDuCompte(RESPONSABLE, langue);
			const refus = await postForm(
				'/reglages?/enregistrer',
				champs({ name: 'Autre nom tapé', timeZone: 'Europe/Amsterdam' }),
				cookie
			);
			expect(refus.status).toBe(400);
			const html = await refus.text();
			expect(alerte(html)).toBe(HORS_LISTE[langue]);
			expect(valeurDuChamp(html, 'name')).toBe('Autre nom tapé');
			expect(optionsChoisies(html, 'timeZone')).toEqual(['Europe/Zurich']);
			expect(optionsDe(element(html, 'timeZone'))).not.toContain('Europe/Amsterdam');
			expect(lu(element(html, 'timeZone-aide'))).toContain(ABSENTE[langue]);
			expect(await reglagesEnBase()).toEqual(avant);
		}
	);

	it('keeps a saved time zone the list does not offer, until another one is chosen', async () => {
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		// Une organisation d'avant la liste, dont le fuseau est un alias.
		await maintenance((tx) =>
			tx.execute(
				sql`update "organization" set "time_zone" = 'Europe/Amsterdam' where "id" = ${organizationId}`
			)
		);
		const html = await page200('/reglages', cookie);
		expect(optionsChoisies(html, 'timeZone')).toEqual(['Europe/Amsterdam']);
		expect(
			optionsDe(element(html, 'timeZone')).filter((zone) => zone === 'Europe/Amsterdam')
		).toEqual(['Europe/Amsterdam']);
		expect(lu(element(html, 'timeZone-aide'))).toContain(ALIAS_GARDE.fr);

		// Enregistrer sans toucher au fuseau le garde.
		const garde = await postForm(
			'/reglages?/enregistrer',
			champs({ timeZone: 'Europe/Amsterdam', greeting: 'Salam, fuseau gardé' }),
			cookie
		);
		expect(garde.status).toBe(200);
		expect(statut(await garde.text())).toBe('Réglages enregistrés.');
		expect(await reglagesEnBase()).toEqual({
			...avant,
			time_zone: 'Europe/Amsterdam',
			greeting: 'Salam, fuseau gardé'
		});

		// Un autre alias reste refusé ; un fuseau de la liste le remplace.
		const autre = await postForm(
			'/reglages?/enregistrer',
			champs({ timeZone: 'Europe/Oslo' }),
			cookie
		);
		expect(autre.status).toBe(400);
		expect((await reglagesEnBase()).time_zone).toBe('Europe/Amsterdam');
		const choisi = await postForm(
			'/reglages?/enregistrer',
			champs({ timeZone: 'Europe/Berlin' }),
			cookie
		);
		expect(choisi.status).toBe(200);
		expect((await reglagesEnBase()).time_zone).toBe('Europe/Berlin');
		const apres = await page200('/reglages', cookie);
		expect(optionsChoisies(apres, 'timeZone')).toEqual(['Europe/Berlin']);
		expect(optionsDe(element(apres, 'timeZone'))).not.toContain('Europe/Amsterdam');
	});

	/** Un fuseau enregistré avant la liste, que la liste ne propose pas. */
	async function fuseauEnBase(zone: string): Promise<void> {
		await maintenance((tx) =>
			tx.execute(
				sql`update "organization" set "time_zone" = ${zone} where "id" = ${organizationId}`
			)
		);
	}

	it.each(LANGUES)(
		'says in %s that a saved alias is kept, and the calendar of the public page still answers',
		async (langue) => {
			await poserLangueDuCompte(RESPONSABLE, langue);
			await fuseauEnBase('Europe/Amsterdam');
			const aide = lu(element(await page200('/reglages', cookie), 'timeZone-aide'));
			expect(aide).toContain(ALIAS_GARDE[langue]);
			// La phrase dit vrai : le flux agenda répond, au fuseau canonique vers lequel l'alias
			// pointe, et donc aux mêmes heures.
			const flux = await get(`/m/${SLUG}/agenda.ics`, '');
			expect(flux.status).toBe(200);
			const texte = await flux.text();
			expect(texte).toContain('TZID:Europe/Brussels');
			expect(texte).not.toContain('Europe/Amsterdam');
		}
	);

	it('still says a saved time zone is kept when the calendar works with it', async () => {
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		await fuseauEnBase('Etc/GMT-1');
		const html = await page200('/reglages', cookie);
		expect(optionsChoisies(html, 'timeZone')).toEqual(['Etc/GMT-1']);
		const aide = lu(element(html, 'timeZone-aide'));
		expect(aide).toContain(GARDE_AVEC_CALENDRIER);
		expect(aide).not.toContain('abonnement au calendrier');
		// Et c'est vrai : le flux agenda répond avec ce fuseau.
		expect((await get(`/m/${SLUG}/agenda.ics`, '')).status).toBe(200);
	});
});

/** Ce que Réglages répond pour une salle qu'il ne connaît pas, ou un identifiant mal formé. */
const SALLE_DISPARUE: Record<Langue, string> = {
	fr: 'Cette salle n’existe plus.',
	de: 'Diesen Raum gibt es nicht mehr.',
	it: 'Questa sala non esiste più.',
	en: 'This room no longer exists.',
	ar: 'هذه القاعة لم تعد موجودة.'
};

describe('un identifiant mal formé, envoyé par un formulaire trafiqué', () => {
	it('answers a malformed room identifier in Settings as an unknown room, and deletes nothing', async () => {
		const cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const avant = await sallesEnBase();
		expect(avant).toHaveLength(2);
		// Une salle inconnue, bien écrite : rien à supprimer, et la page le dit en une phrase. Elle
		// disait « Salle supprimée. », pour une salle que personne n'avait supprimée (étape 19).
		const inconnue = await postForm(
			'/reglages?/supprimerSalle',
			{ roomId: newId(), confirm: 'yes' },
			cookie
		);
		expect(inconnue.status).toBe(404);
		const html = await inconnue.text();
		const phrase = alerte(html);
		expect(phrase).toBe(SALLE_DISPARUE.fr);
		expect(statut(html)).toBe('');
		// Un identifiant mal écrit était envoyé tel quel à la base, qui le refusait : erreur 500.
		for (const roomId of [newId(), 'pas-un-identifiant', '']) {
			for (const confirm of ['', 'yes']) {
				const reponse = await postForm('/reglages?/supprimerSalle', { roomId, confirm }, cookie);
				expect(reponse.status, `« ${roomId} » ${confirm}`).toBe(inconnue.status);
				expect(alerte(await reponse.text()), `« ${roomId} » ${confirm}`).toBe(phrase);
			}
		}
		expect(await sallesEnBase()).toEqual(avant);
	});

	it.each(LANGUES)('says in %s that a room it does not know no longer exists', async (langue) => {
		const cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, langue);
		for (const roomId of [newId(), 'pas-un-identifiant']) {
			const reponse = await postForm('/reglages?/supprimerSalle', { roomId }, cookie);
			expect(reponse.status, roomId).toBe(404);
			expect(alerte(await reponse.text()), roomId).toBe(SALLE_DISPARUE[langue]);
		}
		await poserLangueDuCompte(RESPONSABLE, 'fr');
	});

	it('answers a malformed invitation identifier as an unknown invitation, with a sentence', async () => {
		const cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const inconnue = await postForm('/organisations?/accepter', { invitationId: newId() }, cookie);
		expect(inconnue.status).toBe(404);
		const phrase = alerte(await inconnue.text());
		expect(phrase).toBe(
			'Cette invitation n’est plus valable : elle a peut-être expiré ou été annulée. Demandez-en une nouvelle à la personne qui vous a invité.'
		);
		for (const invitationId of ['pas-un-identifiant', '']) {
			const reponse = await postForm('/organisations?/accepter', { invitationId }, cookie);
			expect(reponse.status, `« ${invitationId} »`).toBe(404);
			expect(alerte(await reponse.text()), `« ${invitationId} »`).toBe(phrase);
		}
	});
});

describe('supprimer une salle que des cours occupent', () => {
	it('keeps the room and its courses as long as nobody confirms', async () => {
		const cookie = await signIn(RESPONSABLE);
		const reponse = await postForm('/reglages?/supprimerSalle', { roomId: salleOccupee }, cookie);
		expect(reponse.status).toBe(409);
		expect(await sallesEnBase()).toEqual([
			{ id: salleOccupee, cours: 3 },
			{ id: salleLibre, cours: 0 }
		]);
	});

	it('deletes it once confirmed: the courses and the Friday prayer stay, without a room', async () => {
		const cookie = await signIn(RESPONSABLE);
		const reponse = await postForm(
			'/reglages?/supprimerSalle',
			{ roomId: salleOccupee, confirm: 'yes' },
			cookie
		);
		expect(reponse.status).toBe(200);
		expect(statut(await reponse.text())).toBe('Salle supprimée.');
		expect(await sallesEnBase()).toEqual([{ id: salleLibre, cours: 0 }]);
		const cours = await maintenance(async (tx) =>
			lignes<{ organization_id: string; room_id: string | null }>(
				await tx.execute(sql`
					select "organization_id", "room_id" from "course" where "id" in ${sql.raw(
						`(${coursDeLaSalle.map((id) => `'${id}'`).join(',')})`
					)}
				`)
			)
		);
		expect(cours).toEqual(
			coursDeLaSalle.map(() => ({ organization_id: organizationId, room_id: null }))
		);
	});

	it('deletes a room no course uses without asking', async () => {
		const cookie = await signIn(RESPONSABLE);
		const reponse = await postForm('/reglages?/supprimerSalle', { roomId: salleLibre }, cookie);
		expect(reponse.status).toBe(200);
		expect(await sallesEnBase()).toEqual([]);
	});
});

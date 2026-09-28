// L'écran « À venir » (étape 18, retours A1, A2 et D1, et pour cet écran B1, D2 et A3), servi par
// HTTP : vrai serveur construit, vraie base, formulaires envoyés comme sans JavaScript.
//
// - A1 : les options de chaque séance sont fermées par défaut, chaque carte a les siennes, et le
//   bouton qui annule ne se trouve que derrière elles. C'est la page servie qui est lue : ce qu'elle
//   montre sans JavaScript est ce que ces tests voient.
// - A2 : une séance se déplace à toute date à partir d'aujourd'hui, plus tôt comme plus tard que la
//   date prévue. L'action refuse une date passée, avec une phrase claire, et n'écrit rien. Elle
//   refuse aussi un déplacement qui ne change rien, la même date à l'heure déjà prévue (relecture du
//   lot 3), et répond par une phrase, jamais par une erreur 500, à une heure hors plage, à un
//   identifiant mal formé ou à un cours inconnu, pour annuler, déplacer et rétablir. Elle refuse
//   aussi, par une phrase, l'annulation d'une séance déjà passée.
// - Une page restée ouverte (Retour, un second onglet, une autre personne) ne défait pas un
//   changement : annuler ou déplacer une séance déjà annulée ou déplacée est refusé, rien n'est
//   écrit, et l'écran rendu est à jour (relecture du lot 4). La carte envoie aussi l'heure qu'elle
//   montrait : si l'heure du cours a changé depuis dans sa fiche, son déplacement est refusé, et la
//   carte rouverte propose l'heure actuelle du cours, sauf une heure tapée. De deux déplacements
//   envoyés au même instant, un seul s'écrit (relecture du lot 5).
// - B1 : un déplacement le même jour à une autre heure se dit comme un changement d'heure, sur la
//   carte, dans le message et dans le programme de la semaine ; un changement de date garde ses mots
//   (relectures des lots 4 et 5).
// - D1 : les messages prêts à coller s'écrivent dans chacune des langues que l'organisation publie,
//   la langue source d'abord : la langue par défaut pour le programme de la semaine, celle du cours
//   pour une annulation ou un déplacement. Le nom de chaque zone de texte dit sa langue. Une session
//   du vendredi qui porte le nom proposé par le service se nomme dans la langue de chaque message,
//   comme sur l'écran Partager ; un titre choisi par l'organisation reste tel quel.
// - D2, A3, B1 : l'écran dans les cinq langues, sans phrase française restée, sans date AAAA-MM-JJ
//   dans le texte lu, et un champ de date qui dit ce qu'il accepte.
// - Étape 19 (D4 et les décisions du chef de projet) : les cours en brouillon sortent du programme
//   de la semaine, qui est celui de Partager, et leur carte dit « brouillon » ; une carte « date
//   exceptionnelle » a « Rétablir » ; une séance disparue dit que la liste ci-dessous est à jour ; le
//   refus d'une carte périmée nomme la séance, par son titre et sa date ; la seconde personne qui
//   annule la même séance reçoit quand même le message prêt à coller ; le titre d'une carte suit la
//   langue de l'écran quand le cours y est traduit ; la prière du vendredi a ses propres mots dans les
//   messages d'une annulation ou d'un déplacement.
// - Relectures de D2 et de D4 : un second « Rétablir la séance » n'a plus rien à rétablir, il est
//   refusé en haut de l'écran et n'écrit rien, pas même au journal ; une session du vendredi en
//   brouillon ne donne pas son heure à un cours prévu après le Dhuhr, ni sur sa carte, ni dans le
//   message d'un déplacement.
// - Étape 19, lot 3 : annuler ou déplacer une séance un jour où le cours n'en a pas, un autre jour
//   de la semaine, après son dernier jour ou pendant une pause, du cours ou de toute
//   l'organisation, est refusé dans chaque langue, et n'écrit rien, pas même au journal. Une séance
//   arrivée d'un autre jour ne s'annule pas sous ce jour-là, et « Rétablir » un jour sans
//   changement n'écrit rien non plus.
// - Étape 20 (C2) : la carte d'une séance déplacée dont la date prévue est passée n'a plus
//   « Rétablir », que l'action refuse ; elle propose « Annuler cette séance », derrière ses options
//   fermées, et le message à copier nomme la nouvelle date et la nouvelle heure. Déplacer une séance
//   dont la date prévue est passée est refusé, comme l'annuler.

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import { addDays, isoDateToDays, todayInZone, weekdayFromDays, type IsoDate } from '@jadwal/core';
import { createDatabase, newId, sql, withOrg, type DatabaseHandle } from '@jadwal/db';
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
const ORGANISATION = 'Association à venir';
const ACCUEIL = 'Salam alaykoum';
/** Une organisation qui publie en allemand d'abord, en français et en arabe, et pas en italien. */
const ORGANISATION_B = 'Verein Kommende';
const RESPONSABLE = 'avenir-responsable@example.test';
const RESPONSABLE_B = 'avenir-verein@example.test';
/** Un éditeur de la même organisation : l'écran des prières lui est fermé. */
const EDITEUR = 'avenir-editeur@example.test';

/** Le cours du soir : une séance chaque jour, à heure fixe, traduit en allemand et en arabe. */
const SOIR = { fr: 'Cours du soir', de: 'Abendkurs', ar: 'درس المساء' } as const;
/** Le cercle de lecture : une séance chaque jour, un quart d'heure après Maghrib, en français seul. */
const CERCLE = 'Cercle de lecture';
/** Le cours de l'organisation B, écrit en arabe, traduit en français seulement. */
const TAJWID = { ar: 'حلقة التجويد', fr: 'Cercle de tajwid' } as const;
const SALLE = 'Salle Ibn Khaldoun';
const ENSEIGNANT = 'Karim Haddad';

/** Une phrase qui nomme une séance, par son titre et sa date écrite dans la langue de l'écran. */
type PhraseNommee = (titre: string, date: string) => string;

/**
 * Le refus d'une page restée ouverte, quand la séance a été annulée ou déplacée depuis : laquelle,
 * par son titre et sa date (étape 19, D4), ce qui s'est passé, que rien n'est écrit, et que l'écran
 * rendu est à jour.
 */
const CHANGEE: Record<Langue, PhraseNommee> = {
	fr: (titre, date) =>
		`La séance « ${titre} » du ${date} a changé depuis l’ouverture de la page : elle a déjà été annulée ou déplacée. Rien n’a été enregistré. Le programme ci-dessous est à jour.`,
	de: (titre, date) =>
		`Der Termin «${titre}» vom ${date}, hat sich geändert, seit die Seite geöffnet wurde: Er wurde schon abgesagt oder verschoben. Es wurde nichts gespeichert. Das Programm unten ist aktuell.`,
	it: (titre, date) =>
		`La lezione «${titre}» di ${date} è cambiata da quando hai aperto la pagina: è già stata annullata o spostata. Non è stato salvato niente. Il programma qui sotto è aggiornato.`,
	en: (titre, date) =>
		`The ‘${titre}’ session on ${date} has changed since the page was opened: it has already been cancelled or moved. Nothing has been saved. The programme below shows the latest changes.`,
	ar: (titre, date) =>
		`تغيّرت حصة «${titre}» يوم ${date} منذ أن فُتحت الصفحة: سبق أن أُلغيت أو نُقلت. لم يُحفظ أي شيء. برنامجك المعروض أدناه محدَّث.`
};

/**
 * Le refus d'une carte restée ouverte pendant que l'heure du cours changeait dans sa fiche : la
 * séance est encore prévue, sa carte se rouvre sur cette phrase, sous sa nouvelle heure (relecture
 * du lot 5). Elle nomme aussi la séance (étape 19, D4).
 */
const HEURE_CHANGEE: Record<Langue, PhraseNommee> = {
	fr: (titre, date) =>
		`L’heure de la séance « ${titre} » du ${date} a changé depuis l’ouverture de la page. Rien n’a été enregistré. Sa nouvelle heure est écrite sous son titre : vérifiez la date et l’heure choisies, puis recommencez.`,
	de: (titre, date) =>
		`Die Uhrzeit des Termins «${titre}» vom ${date}, hat sich geändert, seit die Seite geöffnet wurde. Es wurde nichts gespeichert. Die neue Uhrzeit steht unter seinem Titel: Prüfen Sie das gewählte Datum und die gewählte Uhrzeit und versuchen Sie es noch einmal.`,
	it: (titre, date) =>
		`L’orario della lezione «${titre}» di ${date} è cambiato da quando hai aperto la pagina. Non è stato salvato niente. Il nuovo orario è indicato sotto il titolo: controlla la data e l’orario scelti, poi riprova.`,
	en: (titre, date) =>
		`The time of the ‘${titre}’ session on ${date} has changed since the page was opened. Nothing has been saved. Its new time is shown under its title: check the date and time you chose, then try again.`,
	ar: (titre, date) =>
		`تغيّر وقت حصة «${titre}» يوم ${date} منذ أن فُتحت الصفحة. لم يُحفظ أي شيء. وقتها الجديد مكتوب تحت عنوانها: راجع ما اخترته من تاريخ ووقت، ثم حاول مرة أخرى.`
};

/**
 * La seconde annulation d'une même séance, par une autre personne ou depuis une page restée
 * ouverte : rien n'est écrit, mais le message prêt à coller est donné quand même (étape 19, D4).
 */
const DEJA_ANNULEE: Record<Langue, PhraseNommee> = {
	fr: (titre, date) =>
		`La séance « ${titre} » du ${date} a déjà été annulée depuis l’ouverture de la page. Rien n’a été enregistré. Si le message n’a pas encore été envoyé, il est prêt ci-dessous.`,
	de: (titre, date) =>
		`Der Termin «${titre}» vom ${date}, ist abgesagt worden, seit die Seite geöffnet wurde. Es wurde nichts gespeichert. Wenn die Nachricht noch nicht verschickt ist, steht sie unten bereit.`,
	it: (titre, date) =>
		`La lezione «${titre}» di ${date} è già stata annullata da quando hai aperto la pagina. Non è stato salvato niente. Se il messaggio non è ancora stato mandato, è pronto qui sotto.`,
	en: (titre, date) =>
		`Since the page was opened, the ‘${titre}’ session on ${date} has already been cancelled. Nothing has been saved. If the message has not been sent yet, it is ready below.`,
	ar: (titre, date) =>
		`أُلغيت حصة «${titre}» يوم ${date} منذ أن فُتحت الصفحة. لم يُحفظ أي شيء. إن لم تُرسَل الرسالة بعد، فهي جاهزة أدناه.`
};

/**
 * Un second « Rétablir la séance », par une autre personne ou depuis une page restée ouverte : il
 * n'y a plus rien à rétablir, rien ne s'écrit, pas même le journal (étape 19, relecture de D2).
 */
const DEJA_RETABLIE: Record<Langue, PhraseNommee> = {
	fr: (titre, date) =>
		`La séance « ${titre} » du ${date} a déjà été rétablie depuis l’ouverture de la page. Rien n’a été enregistré. Le programme ci-dessous est à jour.`,
	de: (titre, date) =>
		`Der Termin «${titre}» vom ${date}, ist wiederhergestellt worden, seit die Seite geöffnet wurde. Es wurde nichts gespeichert. Das Programm unten ist aktuell.`,
	it: (titre, date) =>
		`La lezione «${titre}» di ${date} è già stata ripristinata da quando hai aperto la pagina. Non è stato salvato niente. Il programma qui sotto è aggiornato.`,
	en: (titre, date) =>
		`Since the page was opened, the ‘${titre}’ session on ${date} has already been restored. Nothing has been saved. The programme below shows the latest changes.`,
	ar: (titre, date) =>
		`استُعيدت حصة «${titre}» يوم ${date} منذ أن فُتحت الصفحة. لم يُحفظ أي شيء. برنامجك المعروض أدناه محدَّث.`
};

/**
 * Une séance qui n'existe pas, ou plus : la page renvoyée est déjà à jour, et, sans JavaScript,
 * recharger renverrait le formulaire refusé (étape 19, D4).
 */
const SEANCE_DISPARUE: Record<Langue, string> = {
	fr: 'Cette séance n’existe plus. La liste ci-dessous est à jour.',
	de: 'Diesen Termin gibt es nicht mehr. Die Liste unten ist aktuell.',
	it: 'Questa lezione non esiste più. L’elenco qui sotto è aggiornato.',
	en: 'This session no longer exists. The list below shows the sessions as they are now.',
	ar: 'هذه الحصة لم تعد موجودة. القائمة أدناه محدَّثة.'
};

/** La marque de la carte d'un cours en brouillon (étape 19, D4). */
const BROUILLON: Record<Langue, string> = {
	fr: 'brouillon',
	de: 'Entwurf',
	it: 'bozza',
	en: 'draft',
	ar: 'مسودة'
};

/** Les jours de la semaine, du lundi au dimanche, tels que chaque langue les écrit devant une date. */
const JOURS: Record<Langue, readonly string[]> = {
	fr: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
	de: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
	it: ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'],
	en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
	ar: ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']
};

/**
 * Le titre du cours du soir sur une carte, dans la langue de l'écran quand il y est traduit, sinon
 * dans sa langue source (décision du chef de projet, étape 19).
 */
const SOIR_LU: Record<Langue, string> = {
	fr: SOIR.fr,
	de: SOIR.de,
	it: SOIR.fr,
	en: SOIR.fr,
	ar: SOIR.ar
};

/**
 * Le refus d'une annulation pour une date passée, que la page d'hier encore ouverte peut envoyer.
 * Aucune carte ne porte cette séance : la phrase s'écrit en haut de l'écran. Depuis l'étape 20 (C2),
 * c'est aussi le refus d'un déplacement depuis une date passée : la phrase dit les deux gestes.
 */
const SEANCE_PASSEE: Record<Langue, string> = {
	fr: 'Cette séance est déjà passée : vous ne pouvez annuler ou déplacer que les séances d’aujourd’hui et des jours suivants.',
	de: 'Dieser Termin ist schon vorbei: Sie können nur Termine von heute oder von einem späteren Tag absagen oder verschieben.',
	it: 'Questa lezione è già passata: puoi annullare o spostare solo le lezioni di oggi o dei giorni successivi.',
	en: 'This session has already passed: you can only cancel or move sessions from today onwards.',
	ar: 'موعد هذه الحصة قد مضى: يمكنك إلغاء حصص اليوم والأيام التالية أو نقلها فقط.'
};

/** Ce qui est pareil dans toutes les langues par nature : noms, titres, adresses. */
const PERMIS = [
	ORGANISATION,
	ORGANISATION_B,
	ACCUEIL,
	RESPONSABLE,
	RESPONSABLE_B,
	SOIR.fr,
	CERCLE,
	SALLE,
	ENSEIGNANT
];

let ownerHandle: DatabaseHandle;
let organisationA: string;
let organisationB: string;
const soir = newId();
const cercle = newId();
const tajwid = newId();
const ids: Record<string, string> = {};
/** Le jour de l'organisation, pris une fois : les séances affichées vont d'aujourd'hui à J+6. */
const today = todayInZone(FUSEAU, new Date());
const jour = (pas: number): IsoDate => addDays(today, pas);

/** `26.09.2026` : la seule forme d'une date lue par une personne (A3). */
function numerique(date: string): string {
	const [annee, mois, quantieme] = date.split('-');
	return `${quantieme}.${mois}.${annee}`;
}

/** « samedi 26.09.2026 », « Samstag, 26.09.2026 » : une date telle que l'écran l'écrit. */
function dateLue(langue: Langue, date: IsoDate): string {
	const nom = JOURS[langue][weekdayFromDays(isoDateToDays(date)) - 1];
	return `${nom}${langue === 'de' ? ',' : ''} ${numerique(date)}`;
}

/** Le propriétaire, sous son drapeau d'entretien, le temps d'une transaction. */
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

/** L'exception posée sur une séance, telle que la base la garde, ou rien. */
async function exception(
	courseId: string,
	date: string
): Promise<{ kind: string; to_date: string | null; to_start: string | null } | undefined> {
	return maintenance(async (tx) =>
		lignes<{ kind: string; to_date: string | null; to_start: string | null }>(
			await tx.execute(sql`
				select "kind", "to_date"::text, left("to_start"::text, 5) as to_start
				from "session_exception" where "course_id" = ${courseId} and "date" = ${date}
			`)
		)
	).then((trouve) => trouve[0]);
}

/**
 * L'identifiant de l'exception posée sur une séance, ou rien. Chaque annulation, chaque déplacement
 * en écrit une nouvelle : deux changements semblables n'ont pas le même.
 */
async function identifiantDe(courseId: string, date: string): Promise<string | undefined> {
	return maintenance(async (tx) =>
		lignes<{ id: string }>(
			await tx.execute(sql`
				select "id" from "session_exception" where "course_id" = ${courseId} and "date" = ${date}
			`)
		)
	).then((trouve) => trouve[0]?.id);
}

async function get(chemin: string, cookie: string): Promise<Response> {
	return fetch(`${origin}${chemin}`, { redirect: 'manual', headers: { cookie } });
}

/** Poste un formulaire comme un navigateur sans JavaScript : encodage de formulaire et origine. */
async function postForm(
	chemin: string,
	champs: Record<string, string>,
	cookie?: string
): Promise<Response> {
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

async function dernierCourrielA(email: string): Promise<{ text: string } | undefined> {
	const noms = (await readdir(outbox)).filter((nom) => nom.endsWith('.json')).sort();
	return noms
		.map(
			(nom) => JSON.parse(readFileSync(join(outbox, nom), 'utf8')) as { to: string; text: string }
		)
		.filter((courriel) => courriel.to === email)
		.at(-1);
}

/** Se connecte par le lien reçu, et rend le cookie de session. */
async function signIn(email: string): Promise<string> {
	await maintenance((tx) => tx.execute(sql`delete from "rate_limit"`));
	await postForm('/connexion', { email });
	const lien = (await dernierCourrielA(email))?.text.match(/https?:\/\/\S+/)?.[0];
	expect(lien, `aucun lien envoyé à ${email}`).toBeTruthy();
	const suivi = await fetch(lien as string, { redirect: 'manual' });
	const session = (suivi.headers.getSetCookie?.() ?? [])
		.find((valeur) => valeur.startsWith('better-auth.session_token='))
		?.split(';')[0];
	expect(session, `aucune session posée pour ${email}`).toBeTruthy();
	return session as string;
}

/** Les entités que Svelte écrit dans le texte et les attributs, rendues. */
function decode(texte: string): string {
	return texte
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&nbsp;', ' ')
		.replaceAll('&amp;', '&');
}

/** Les attributs d'une balise ouvrante, par nom ; un attribut sans valeur vaut une chaîne vide. */
function attributs(balise: string): Record<string, string> {
	const corps = balise.replace(/^<[a-z]+/i, '').replace(/\/?>$/, '');
	return Object.fromEntries(
		[...corps.matchAll(/([a-z-]+)(?:="([^"]*)")?/gi)].map((trouve) => [
			trouve[1] ?? '',
			decode(trouve[2] ?? '')
		])
	);
}

/** Le texte d'un fragment, sans ses balises, les blancs ramenés à une espace. */
function texte(fragment: string): string {
	return decode(
		fragment
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

interface Options {
	/** La balise ouvrante `<details …>`. */
	balise: string;
	ouvert: boolean;
	resume: string;
	contenu: string;
}

/** Chaque `<details>` de la page, avec son résumé et son contenu. Les miens ne s'emboîtent pas. */
function blocsDetails(html: string): Options[] {
	return [...html.matchAll(/(<details\b[^>]*>)([\s\S]*?)<\/details>/g)].map((trouve) => {
		const balise = trouve[1] ?? '';
		const interieur = trouve[2] ?? '';
		return {
			balise,
			ouvert: 'open' in attributs(balise),
			resume: texte(interieur.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1] ?? ''),
			contenu: interieur
		};
	});
}

/** Les options d'une séance : un bloc qui porte le formulaire d'annulation. */
function optionsDesSeances(html: string): Options[] {
	return blocsDetails(html).filter((bloc) => bloc.contenu.includes('action="?/annuler"'));
}

/**
 * Pour chaque formulaire d'annulation de la page, le `<details>` qui l'enferme, ou `null` s'il est
 * à découvert. Les balises sont lues dans l'ordre, avec la pile des blocs ouverts.
 */
function enveloppesDesAnnulations(html: string): (string | null)[] {
	const pile: string[] = [];
	const trouves: (string | null)[] = [];
	for (const trouve of html.matchAll(
		/<details\b[^>]*>|<\/details>|<form\b[^>]*action="\?\/annuler"[^>]*>/g
	)) {
		const balise = trouve[0];
		if (balise.startsWith('<details')) pile.push(balise);
		else if (balise === '</details>') pile.pop();
		else trouves.push(pile.at(-1) ?? null);
	}
	return trouves;
}

/** La valeur d'un champ caché d'un fragment. */
function cache(fragment: string, nom: string): string | undefined {
	const balise = fragment.match(new RegExp(`<input\\b[^>]*name="${nom}"[^>]*>`))?.[0];
	return balise ? attributs(balise)['value'] : undefined;
}

/**
 * La phrase d'erreur d'un fragment : le texte de son élément `role="alert"`. Le titre d'une séance y
 * est isolé dans un `<bdi>` (ADR 0007), entre les commentaires que Svelte pose autour d'un bloc :
 * ni l'un ni les autres ne coupent la phrase, et ils sont retirés sans espace.
 */
function alerte(fragment: string): string {
	const phrase = fragment.match(/<([a-z]+)\b[^>]*role="alert"[^>]*>([\s\S]*?)<\/\1>/)?.[2] ?? '';
	return texte(phrase.replace(/<!--[\s\S]*?-->|<\/?bdi\b[^>]*>/g, ''));
}

/**
 * Le nom qu'un lecteur d'écran annonce pour une zone de texte : les éléments que désigne son
 * `aria-labelledby`, dans l'ordre, la zone elle-même valant son `aria-label` ; sans lui, son
 * `aria-label`. Chaque élément désigné est rendu avec sa balise, pour lire sa langue.
 */
function nomAccessible(
	fragment: string,
	balise: string
): { nom: string; designes: { balise: string; texte: string }[] } {
	const champs = attributs(balise);
	const ids = (champs['aria-labelledby'] ?? '').split(/\s+/).filter(Boolean);
	if (ids.length === 0) return { nom: champs['aria-label'] ?? '', designes: [] };
	const designes = ids.map((id) => {
		if (id === champs['id']) return { balise, texte: champs['aria-label'] ?? '' };
		const trouve = fragment.match(
			new RegExp(`(<([a-z]+)\\b[^>]*\\bid="${id}"[^>]*>)([\\s\\S]*?)</\\2>`)
		);
		return { balise: trouve?.[1] ?? '', texte: texte(trouve?.[3] ?? '') };
	});
	return { nom: designes.map((designe) => designe.texte).join(' '), designes };
}

/** Une section de la page, par l'identifiant de son titre. */
function section(html: string, titre: string): string {
	return (
		html.match(
			new RegExp(`<section\\b[^>]*aria-labelledby="${titre}"[^>]*>([\\s\\S]*?)</section>`)
		)?.[1] ?? ''
	);
}

interface Message {
	ouvert: boolean;
	/** La balise ouvrante du bloc de la langue. */
	bloc: string;
	langue: string | undefined;
	sens: string | undefined;
	libelle: string | undefined;
	/** Le nom accessible de la zone de texte, et les éléments qui le composent. */
	nom: ReturnType<typeof nomAccessible>;
	texte: string;
}

/** Les messages d'une section : un bloc par langue, et dans chacun le texte à copier. */
function messages(fragment: string): Message[] {
	return blocsDetails(fragment)
		.filter((bloc) => bloc.contenu.includes('<textarea'))
		.map((bloc) => {
			const zone = bloc.contenu.match(/(<textarea\b[^>]*>)([\s\S]*?)<\/textarea>/);
			const champs = attributs(zone?.[1] ?? '');
			return {
				ouvert: bloc.ouvert,
				bloc: bloc.balise,
				langue: champs['lang'],
				sens: champs['dir'],
				libelle: champs['aria-label'],
				nom: nomAccessible(bloc.contenu, zone?.[1] ?? ''),
				texte: decode(zone?.[2] ?? '')
			};
		});
}

/** Les zones de texte à copier d'une section, quelle que soit leur forme. */
function zonesDeTexte(fragment: string): string[] {
	return [...fragment.matchAll(/<textarea\b[^>]*>([\s\S]*?)<\/textarea>/g)].map((trouve) =>
		decode(trouve[1] ?? '')
	);
}

/** Une séance d'un jour, par son titre : le fragment de sa carte. */
function carte(html: string, date: string, titre: string, statut: string): string {
	const duJour = section(html, `jour-${date}`);
	const cartes = [...duJour.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((trouve) => trouve[0]);
	return (
		cartes.find(
			(fragment) =>
				texte(fragment).includes(titre) &&
				(attributs(fragment.match(/^<li\b[^>]*>/)?.[0] ?? '')['class'] ?? '')
					.split(/\s+/)
					.includes(statut)
		) ?? ''
	);
}

/**
 * Le titre de chaque carte d'un morceau de page, tel qu'il s'affiche. Svelte ajoute à `<bdi>` la
 * classe qui borne la feuille de style de l'écran.
 */
function titresDesCartes(fragment: string): string[] {
	return [
		...fragment.matchAll(/<p\b[^>]*class="titre[^"]*"[^>]*>\s*<bdi\b[^>]*>([\s\S]*?)<\/bdi>/g)
	].map((trouve) => decode(trouve[1] ?? ''));
}

/**
 * Le formulaire « Rétablir la séance » d'une carte : chaque champ nommé et sa valeur, ou `null`
 * quand la carte n'en a pas.
 */
function formulaireDeRetablissement(fragment: string): Record<string, string> | null {
	const formulaire = fragment.match(/<form\b[^>]*action="\?\/retablir"[^>]*>[\s\S]*?<\/form>/)?.[0];
	if (!formulaire) return null;
	return Object.fromEntries(
		[...formulaire.matchAll(/<input\b[^>]*>/g)].map((champ) => {
			const lu = attributs(champ[0]);
			return [lu['name'] ?? '', lu['value'] ?? ''];
		})
	);
}

/**
 * Le formulaire « Annuler cette séance » d'une carte déplacée dont la date prévue est passée (étape
 * 20, C2) : chaque champ nommé et sa valeur, ou `null` quand la carte n'en a pas.
 */
function formulaireDAnnulationDeplacee(fragment: string): Record<string, string> | null {
	const formulaire = fragment.match(
		/<form\b[^>]*action="\?\/annulerDeplacee"[^>]*>[\s\S]*?<\/form>/
	)?.[0];
	if (!formulaire) return null;
	return Object.fromEntries(
		[...formulaire.matchAll(/<input\b[^>]*>/g)].map((champ) => {
			const lu = attributs(champ[0]);
			return [lu['name'] ?? '', lu['value'] ?? ''];
		})
	);
}

/**
 * Un formulaire des options d'une séance, tel que la page le propose : chaque champ nommé et sa
 * valeur. C'est ce qu'envoie une page restée ouverte, même quand la séance a changé depuis.
 */
function formulaireDeLaCarte(
	html: string,
	action: 'annuler' | 'deplacer',
	courseId: string,
	date: string
): Record<string, string> {
	const bloc = optionsDesSeances(html).find(
		(options) =>
			cache(options.contenu, 'courseId') === courseId && cache(options.contenu, 'date') === date
	);
	const formulaire =
		bloc?.contenu.match(
			new RegExp(`<form\\b[^>]*action="\\?/${action}"[^>]*>[\\s\\S]*?</form>`)
		)?.[0] ?? '';
	return Object.fromEntries(
		[...formulaire.matchAll(/<input\b[^>]*>/g)].map((champ) => {
			const lu = attributs(champ[0]);
			return [lu['name'] ?? '', lu['value'] ?? ''];
		})
	);
}

/** Rétablit une séance et vérifie qu'il n'en reste rien : le test suivant la trouve telle quelle. */
async function retablir(courseId: string, date: string, cookie: string): Promise<void> {
	await postForm('/?/retablir', { courseId, date }, cookie);
	expect(await exception(courseId, date)).toBeUndefined();
}

/** Change l'heure d'un cours, comme une autre personne le ferait dans sa fiche. */
async function changerHeure(courseId: string, debut: string, fin: string): Promise<void> {
	await maintenance((tx) =>
		tx.execute(sql`
			update "course" set "timing_start" = ${debut}, "timing_end" = ${fin} where "id" = ${courseId}
		`)
	);
}

/**
 * Des envois qui arrivent au même instant, comme deux personnes qui touchent le bouton à la même
 * seconde. La table des exceptions est verrouillée en écriture, et la lecture reste permise : chaque
 * requête passe ses vérifications, puis attend d'écrire. Quand toutes attendent, le verrou tombe, et
 * elles écrivent ensemble.
 */
async function ensemble(envois: readonly (() => Promise<Response>)[]): Promise<Response[]> {
	let reponses: Promise<Response>[] = [];
	let enAttente = 0;
	await ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`lock table "session_exception" in exclusive mode`);
		reponses = envois.map((envoi) => envoi());
		for (const limite = Date.now() + 15_000; Date.now() < limite;) {
			enAttente =
				lignes<{ n: number }>(
					await ownerHandle.db.execute(sql`
						select count(*)::int as n from pg_locks
						where relation = 'session_exception'::regclass and not granted
					`)
				)[0]?.n ?? 0;
			if (enAttente >= envois.length) return;
			await new Promise((fini) => setTimeout(fini, 20));
		}
	});
	const rendues = await Promise.all(reponses);
	expect(enAttente, 'les envois qui attendaient ensemble d’écrire').toBe(envois.length);
	return rendues;
}

async function poserCours(
	id: string,
	organizationId: string,
	source: string,
	titres: Record<string, string>,
	horaire: { priere: string; decalage: number } | { debut: string; fin: string },
	extra: { salle?: string; enseignant?: string } = {}
): Promise<void> {
	const ancre = 'priere' in horaire;
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
				"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "timing_prayer",
				"timing_offset_minutes", "timing_duration_minutes", "starts_on", "room_id", "teacher")
			values (${id}, ${organizationId}, 'published', 'adults', array[${source}], ${source},
				'weekly', array[1,2,3,4,5,6,7]::smallint[], 1, ${jour(-30)},
				${ancre ? 'prayer' : 'fixed'}, ${ancre ? null : horaire.debut},
				${ancre ? null : horaire.fin}, ${ancre ? horaire.priere : null},
				${ancre ? horaire.decalage : null}, ${ancre ? 60 : null}, ${jour(-30)},
				${extra.salle ?? null}, ${extra.enseignant ?? null})
		`);
		for (const [langue, titre] of Object.entries(titres)) {
			await tx.execute(sql`
				insert into "course_translation" ("id", "organization_id", "course_id", "language",
					"title")
				values (${newId()}, ${organizationId}, ${id}, ${langue}, ${titre})
			`);
		}
	});
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	organisationA = newId();
	organisationB = newId();
	const salle = newId();
	for (const email of [RESPONSABLE, RESPONSABLE_B, EDITEUR]) ids[email] = newId();
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language", "prayer_module", "greeting")
			values (${organisationA}, 'a-venir', ${ORGANISATION}, ${FUSEAU}, 'fr',
				array['fr','de','it','en','ar'], true, ${ACCUEIL}),
				(${organisationB}, 'a-venir-verein', ${ORGANISATION_B}, ${FUSEAU}, 'de',
				array['ar','fr','de'], false, ${ACCUEIL})
		`);
		await tx.execute(sql`
			insert into "room" ("id", "organization_id", "name") values (${salle}, ${organisationA}, ${SALLE})
		`);
		for (const [email, organisation, role] of [
			[RESPONSABLE, organisationA, 'org_admin'],
			[RESPONSABLE_B, organisationB, 'org_admin'],
			[EDITEUR, organisationA, 'editor']
		] as const) {
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified") values (${ids[email] ?? ''}, ${email}, true)
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organisation}, ${ids[email] ?? ''}, ${role})
			`);
			await tx.execute(conditionsAcceptees(organisation, ids[email] ?? ''));
		}
		// Un calendrier importé qui s'arrête dans quatre jours : les deux dernières séances du cercle
		// n'ont pas d'heure, et l'écran le dit, avec la date de fin de l'import.
		for (let pas = 0; pas <= 4; pas += 1) {
			await tx.execute(sql`
				insert into "prayer_day" ("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib",
					"isha", "source")
				values (${organisationA}, ${jour(pas)}, '05:30', '13:15', '16:45', '19:20', '20:50',
					'import')
			`);
		}
		// Le programme vu dans un site il y a dix jours, et plus depuis : l'écran prévient.
		await tx.execute(sql`
			insert into "page_view" ("organization_id", "day", "kind", "count")
			values (${organisationA}, ${jour(-10)}, 'embed', 12), (${organisationA}, ${jour(-2)}, 'page', 30),
				(${organisationA}, ${jour(-1)}, 'feed', 7)
		`);
	});
	await poserCours(
		soir,
		organisationA,
		'fr',
		SOIR,
		{ debut: '19:00', fin: '20:30' },
		{
			salle,
			enseignant: ENSEIGNANT
		}
	);
	await poserCours(
		cercle,
		organisationA,
		'fr',
		{ fr: CERCLE },
		{ priere: 'maghrib', decalage: 15 }
	);
	await poserCours(tajwid, organisationB, 'ar', TAJWID, { debut: '18:00', fin: '19:00' });
});

afterAll(async () => {
	await ownerHandle?.close();
});

describe('A1 : les options de chaque séance', () => {
	let cookie: string;
	let html: string;

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const reponse = await get('/', cookie);
		expect(reponse.status).toBe(200);
		html = await reponse.text();
	});

	it('keeps every cancel button behind the options of its session, closed by default', () => {
		const enveloppes = enveloppesDesAnnulations(html);
		// Sept jours, deux cours par jour : quatorze séances, et autant de boutons d'annulation.
		expect(enveloppes).toHaveLength(14);
		// Aucun bouton d'annulation à découvert : sans avoir ouvert les options, on ne peut pas
		// annuler.
		expect(enveloppes.filter((enveloppe) => enveloppe === null)).toEqual([]);
		// Et aucune option ouverte d'avance.
		expect(enveloppes.filter((enveloppe) => enveloppe && 'open' in attributs(enveloppe))).toEqual(
			[]
		);
	});

	it('gives each session its own options, which open nothing but that session', () => {
		const options = optionsDesSeances(html);
		expect(options).toHaveLength(14);
		const seances = new Set<string>();
		for (const bloc of options) {
			expect(bloc.resume).toBe('Annuler ou déplacer');
			// Un bloc, une séance : son annulation et son déplacement, rien d'une autre carte.
			const annulations = bloc.contenu.match(/action="\?\/annuler"/g) ?? [];
			const deplacements = bloc.contenu.match(/action="\?\/deplacer"/g) ?? [];
			expect([annulations.length, deplacements.length]).toEqual([1, 1]);
			const cles = [...bloc.contenu.matchAll(/<form\b[\s\S]*?<\/form>/g)].map(
				(formulaire) => `${cache(formulaire[0], 'courseId')}|${cache(formulaire[0], 'date')}`
			);
			expect(new Set(cles).size, cles.join(', ')).toBe(1);
			seances.add(cles[0] ?? '');
		}
		// Quatorze blocs pour quatorze séances différentes.
		expect(seances.size).toBe(14);
	});
});

describe('A2 : déplacer une séance', () => {
	let cookie: string;

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'fr');
	});

	it('offers any date from today, earlier or later than the planned one', async () => {
		const html = await (await get('/', cookie)).text();
		const options = optionsDesSeances(html);
		expect(options).toHaveLength(14);
		for (const bloc of options) {
			const date = cache(bloc.contenu, 'date');
			// Plus de liste des six jours suivants : elle interdisait plus tôt, et plus loin.
			expect(bloc.contenu).not.toMatch(/<select\b[^>]*name="toDate"/);
			const balise = bloc.contenu.match(/<input\b[^>]*name="toDate"[^>]*>/)?.[0] ?? '';
			const champ = attributs(balise);
			expect(champ['type'], date).toBe('date');
			expect(champ['min'], date).toBe(today);
			// Jusqu'au 31.12.2100, la dernière date que l'action accepte : le calendrier du navigateur
			// ne propose plus une date qu'elle refuserait (étape 19, relecture de D2).
			expect(champ['max'], date).toBe('2100-12-31');
			expect(champ, date).toHaveProperty('required');
			// La date prévue d'abord : changer seulement l'heure reste un geste simple.
			expect(champ['value'], date).toBe(date);
		}
	});

	it('names the new date and says, with today’s date, which dates it accepts (B1, A3)', async () => {
		const html = await (await get('/', cookie)).text();
		const bloc = optionsDesSeances(html)[0]?.contenu ?? '';
		const champ = attributs(bloc.match(/<input\b[^>]*name="toDate"[^>]*>/)?.[0] ?? '');
		const libelle = bloc.match(
			new RegExp(`<label\\b[^>]*for="${champ['id']}"[^>]*>([\\s\\S]*?)</label>`)
		);
		expect(texte(libelle?.[1] ?? '')).toBe('Nouvelle date');
		const aide = bloc.match(
			new RegExp(`<[a-z]+\\b[^>]*id="${champ['aria-describedby']}"[^>]*>([\\s\\S]*?)</[a-z]+>`)
		);
		expect(texte(aide?.[1] ?? '')).toContain(numerique(today));
		expect(texte(aide?.[1] ?? '')).toContain('plus tôt ou plus tard');
	});

	it('refuses a date already past, says why, opens that session and writes nothing', async () => {
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(3), toDate: jour(-1), toStart: '18:00' },
			cookie
		);
		expect(reponse.status).toBe(400);
		const html = await reponse.text();
		expect(await exception(soir, jour(3))).toBeUndefined();
		// Les options de cette séance, et d'elle seule, sont rouvertes sur la phrase qui dit quoi faire.
		const ouvertes = optionsDesSeances(html).filter((bloc) => bloc.ouvert);
		expect(ouvertes).toHaveLength(1);
		const bloc = ouvertes[0]?.contenu ?? '';
		expect([cache(bloc, 'courseId'), cache(bloc, 'date')]).toEqual([soir, jour(3)]);
		expect(
			texte(bloc.match(/<[a-z]+\b[^>]*role="alert"[^>]*>([\s\S]*?)<\/[a-z]+>/)?.[1] ?? '')
		).toBe('Cette date est déjà passée. Choisissez une date à partir d’aujourd’hui.');
		// Ce qui avait été saisi est gardé, pour corriger sans tout refaire.
		expect(attributs(bloc.match(/<input\b[^>]*name="toDate"[^>]*>/)?.[0] ?? '')['value']).toBe(
			jour(-1)
		);
	});

	it('refuses an impossible date with a sentence, instead of failing', async () => {
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(3), toDate: '2027-02-31', toStart: '18:00' },
			cookie
		);
		expect(reponse.status).toBe(400);
		expect(visibleText(await reponse.text())).toContain('Cette date n’a pas pu être lue.');
		expect(await exception(soir, jour(3))).toBeUndefined();
	});

	it('refuses a date the service does not handle, the year 0000 or outside 1970 to 2100, with a sentence instead of an error 500', async () => {
		// Le calendrier de `@jadwal/core` a un an 0000 (ADR 0012), PostgreSQL non : la requête échouait,
		// et l'écran répondait par une erreur 500. Une date d'avant 1970 ou d'après 2100 s'écrivait :
		// le service s'en tient aux années que couvrent les tests du calcul (étape 19, relecture de D2).
		const DATE_DE_LA_SEANCE =
			'La date de cette séance n’a pas pu être lue. Rechargez la page, puis recommencez.';
		const NOUVELLE_DATE =
			'Cette date n’a pas pu être lue. Choisissez-la dans le calendrier du champ « Nouvelle date ».';
		const [{ debut } = { debut: '' }] = await maintenance(async (tx) =>
			lignes<{ debut: string }>(await tx.execute(sql`select now()::text as debut`))
		);
		const recus: Record<string, unknown> = {};
		const attendus: Record<string, unknown> = {};
		try {
			for (const [action, envoi, phrase] of [
				['annuler', { courseId: soir, date: '0000-01-01' }, DATE_DE_LA_SEANCE],
				['retablir', { courseId: soir, date: '0000-01-01' }, DATE_DE_LA_SEANCE],
				[
					'deplacer',
					{ courseId: soir, date: '0000-01-01', toDate: jour(4), toStart: '18:00' },
					DATE_DE_LA_SEANCE
				],
				[
					'deplacer',
					{ courseId: soir, date: jour(3), toDate: '0000-01-01', toStart: '18:00' },
					NOUVELLE_DATE
				],
				['annuler', { courseId: soir, date: '2101-01-03' }, DATE_DE_LA_SEANCE],
				['retablir', { courseId: soir, date: '9999-12-31' }, DATE_DE_LA_SEANCE],
				[
					'deplacer',
					{ courseId: soir, date: '1969-12-31', toDate: jour(4), toStart: '18:00' },
					DATE_DE_LA_SEANCE
				],
				[
					'deplacer',
					{ courseId: soir, date: jour(3), toDate: '9999-12-31', toStart: '18:00' },
					NOUVELLE_DATE
				]
			] as const) {
				const cas = `${action} ${JSON.stringify(envoi)}`;
				const reponse = await postForm(`/?/${action}`, envoi, cookie);
				recus[cas] = { statut: reponse.status, phrase: alerte(await reponse.text()) };
				attendus[cas] = { statut: 400, phrase };
			}
			expect(recus).toEqual(attendus);
		} finally {
			// Ce qu'un envoi aurait écrit ne reste pas pour les tests suivants.
			await maintenance((tx) =>
				tx.execute(sql`
					delete from "session_exception"
					where "course_id" = ${soir} and "created_at" >= ${debut}::timestamptz
				`)
			);
		}
	});

	it('refuses a move that changes neither the date nor the time, says what to do, keeps the form', async () => {
		// Le champ s'ouvre sur la date prévue et l'heure habituelle : les renvoyer tels quels, c'est
		// toucher « Déplacer la séance » sans rien changer. Rien ne se déplace, et rien ne s'annonce.
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(3), toDate: jour(3), toStart: '19:00' },
			cookie
		);
		expect(reponse.status).toBe(400);
		const html = await reponse.text();
		expect(await exception(soir, jour(3))).toBeUndefined();
		expect(section(html, 'message-titre')).toBe('');
		const ouvertes = optionsDesSeances(html).filter((bloc) => bloc.ouvert);
		expect(ouvertes).toHaveLength(1);
		const bloc = ouvertes[0]?.contenu ?? '';
		expect([cache(bloc, 'courseId'), cache(bloc, 'date')]).toEqual([soir, jour(3)]);
		expect(alerte(bloc)).toBe(
			'La séance est déjà prévue à cette date et à cette heure. Choisissez une autre date ou une autre heure.'
		);
		// Ce qui avait été envoyé reste dans le formulaire.
		expect(attributs(bloc.match(/<input\b[^>]*name="toDate"[^>]*>/)?.[0] ?? '')['value']).toBe(
			jour(3)
		);
		expect(attributs(bloc.match(/<input\b[^>]*name="toStart"[^>]*>/)?.[0] ?? '')['value']).toBe(
			'19:00'
		);
	});

	it('refuses it for a session that follows a prayer, at the time computed for that day', async () => {
		// Maghrib à 19:20 le jour J+2, et le cercle un quart d'heure après : 19:35, l'heure que le
		// champ propose. Le serveur la tient du même calcul que l'écran, pas du formulaire.
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: cercle, date: jour(2), toDate: jour(2), toStart: '19:35' },
			cookie
		);
		expect(reponse.status).toBe(400);
		expect(alerte(await reponse.text())).toContain('La séance est déjà prévue');
		expect(await exception(cercle, jour(2))).toBeUndefined();
	});

	it('accepts the same day at another time, and says the new time', async () => {
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(3), toDate: jour(3), toStart: '20:30' },
			cookie
		);
		expect(reponse.status).toBe(200);
		expect(await exception(soir, jour(3))).toEqual({
			kind: 'moved',
			to_date: jour(3),
			to_start: '20:30'
		});
		const annonce = messages(section(await reponse.text(), 'message-titre'));
		expect(annonce[0]?.texte).toContain('20:30');
		await postForm('/?/retablir', { courseId: soir, date: jour(3) }, cookie);
		expect(await exception(soir, jour(3))).toBeUndefined();
	});

	it('accepts another day at the same time', async () => {
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(3), toDate: jour(4), toStart: '19:00' },
			cookie
		);
		expect(reponse.status).toBe(200);
		expect((await exception(soir, jour(3)))?.to_date).toBe(jour(4));
		await postForm('/?/retablir', { courseId: soir, date: jour(3) }, cookie);
		expect(await exception(soir, jour(3))).toBeUndefined();
	});

	it('accepts the same day for a session shown without a time: it gets one', async () => {
		// Le calendrier importé s'arrête à J+4 : le cercle de J+5 n'a pas d'heure, et le champ propose
		// 19:00. L'accepter donne une heure à la séance, ce qui change quelque chose.
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: cercle, date: jour(5), toDate: jour(5), toStart: '19:00' },
			cookie
		);
		expect(reponse.status).toBe(200);
		expect(await exception(cercle, jour(5))).toEqual({
			kind: 'moved',
			to_date: jour(5),
			to_start: '19:00'
		});
		await postForm('/?/retablir', { courseId: cercle, date: jour(5) }, cookie);
		expect(await exception(cercle, jour(5))).toBeUndefined();
	});

	it('refuses an hour out of range with a sentence, instead of failing', async () => {
		for (const heure of ['25:99', '24:00', '19:60']) {
			const reponse = await postForm(
				'/?/deplacer',
				{ courseId: soir, date: jour(3), toDate: jour(4), toStart: heure },
				cookie
			);
			expect(reponse.status, heure).toBe(400);
			const bloc =
				optionsDesSeances(await reponse.text()).find((options) => options.ouvert)?.contenu ?? '';
			expect(alerte(bloc), heure).toBe(
				'Cette heure n’a pas pu être lue. Écrivez les heures et les minutes, par exemple 19:30.'
			);
			expect(await exception(soir, jour(3)), heure).toBeUndefined();
		}
	});

	it('answers a malformed course identifier with a sentence, in each action', async () => {
		const champs = { courseId: 'pas-un-identifiant', date: jour(3) };
		for (const [action, envoi] of [
			['annuler', champs],
			['deplacer', { ...champs, toDate: jour(4), toStart: '18:00' }],
			['retablir', champs]
		] as const) {
			const reponse = await postForm(`/?/${action}`, envoi, cookie);
			expect(reponse.status, action).toBe(404);
			const html = await reponse.text();
			// La séance visée ne désigne aucune carte : la phrase s'affiche en haut de l'écran. Elle ne
			// demande plus de recharger la page, qui est déjà à jour (étape 19, D4).
			expect(alerte(html), action).toBe(SEANCE_DISPARUE.fr);
			expect(
				optionsDesSeances(html).filter((options) => options.ouvert),
				action
			).toEqual([]);
		}
	});

	it('answers an unknown course, or one of another organisation, with a sentence', async () => {
		// Ni exception ni ligne du journal : la réponse vient avant toute écriture. Le journal se lit
		// dans l'organisation, par le rôle applicatif : le propriétaire ne le lit pas.
		const journal = createDatabase({ role: 'app', overrides: { database: testDatabase } });
		const lignesDuJournal = async () =>
			withOrg(
				journal.db,
				{ organizationId: organisationA, userId: ids[RESPONSABLE] ?? '' },
				async (tx) =>
					lignes<{ n: number }>(await tx.execute(sql`select count(*)::int as n from "audit_log"`))
			).then((trouve) => trouve[0]?.n ?? 0);
		const journalAvant = await lignesDuJournal();
		for (const courseId of [newId(), tajwid]) {
			for (const [action, envoi] of [
				['annuler', { courseId, date: jour(3) }],
				['deplacer', { courseId, date: jour(3), toDate: jour(4), toStart: '18:00' }],
				['retablir', { courseId, date: jour(3) }]
			] as const) {
				const reponse = await postForm(`/?/${action}`, envoi, cookie);
				expect(reponse.status, `${action} ${courseId}`).toBe(404);
				expect(alerte(await reponse.text()), `${action} ${courseId}`).toBe(SEANCE_DISPARUE.fr);
			}
		}
		// Rien n'est écrit dans l'autre organisation, ni au journal.
		expect(await exception(tajwid, jour(3))).toBeUndefined();
		expect(await lignesDuJournal()).toBe(journalAvant);
		await journal.close();
	});

	it('refuses to cancel a session whose date is past, with a sentence above the programme, and writes nothing', async () => {
		// Aucune carte ne propose une date passée : l'envoi vient d'une page ouverte la veille, ou d'un
		// formulaire écrit à la main.
		const reponse = await postForm('/?/annuler', { courseId: soir, date: jour(-1) }, cookie);
		try {
			expect(reponse.status).toBe(400);
			const html = await reponse.text();
			expect(alerte(html)).toBe(SEANCE_PASSEE.fr);
			expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf('id="jour-'));
			expect(section(html, 'message-titre')).toBe('');
			expect(optionsDesSeances(html).filter((options) => options.ouvert)).toEqual([]);
			expect(await exception(soir, jour(-1))).toBeUndefined();
		} finally {
			await maintenance((tx) =>
				tx.execute(sql`
					delete from "session_exception" where "course_id" = ${soir} and "date" = ${jour(-1)}
				`)
			);
		}
	});

	it('accepts a date earlier than the planned one, and shows the session there', async () => {
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(5), toDate: jour(2), toStart: '18:00' },
			cookie
		);
		expect(reponse.status).toBe(200);
		expect(await exception(soir, jour(5))).toEqual({
			kind: 'moved',
			to_date: jour(2),
			to_start: '18:00'
		});
		const html = await (await get('/', cookie)).text();
		const arrivee = carte(html, jour(2), SOIR.fr, 'moved_here');
		expect(texte(arrivee)).toContain(numerique(jour(5)));
		const depart = carte(html, jour(5), SOIR.fr, 'moved_away');
		expect(texte(depart)).toContain(numerique(jour(2)));
	});

	it('accepts today, the first date it offers', async () => {
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(4), toDate: today, toStart: '21:00' },
			cookie
		);
		expect(reponse.status).toBe(200);
		expect((await exception(soir, jour(4)))?.to_date).toBe(today);
	});

	it('accepts a date weeks after the planned one', async () => {
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(6), toDate: jour(40), toStart: '19:00' },
			cookie
		);
		expect(reponse.status).toBe(200);
		expect((await exception(soir, jour(6)))?.to_date).toBe(jour(40));
	});
});

describe('une page restée ouverte ne défait pas un changement (relecture du lot 4)', () => {
	let cookie: string;

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'fr');
	});

	/**
	 * Le refus d'une carte périmée : aucun message préparé, la phrase en haut de l'écran, puisque la
	 * carte n'a plus d'options, et aucune option rouverte. La phrase nomme la séance (étape 19, D4).
	 */
	function refusee(html: string, titre: string, date: IsoDate): void {
		expect(section(html, 'message-titre')).toBe('');
		expect(alerte(html)).toBe(CHANGEE.fr(titre, dateLue('fr', date)));
		expect(optionsDesSeances(html).filter((options) => options.ouvert)).toEqual([]);
	}

	it('refuses the card sent again after Back, once the session was moved, and keeps the move', async () => {
		// La page telle qu'elle était avant le déplacement : c'est elle que Retour remontre.
		const avant = await (await get('/', cookie)).text();
		const proposee = formulaireDeLaCarte(avant, 'deplacer', soir, jour(1));
		expect(proposee).toEqual({
			courseId: soir,
			date: jour(1),
			plannedStart: '19:00',
			toDate: jour(1),
			toStart: '19:00'
		});
		const deplace = await postForm(
			'/?/deplacer',
			{ ...proposee, toDate: jour(2), toStart: '20:30' },
			cookie
		);
		try {
			expect(deplace.status).toBe(200);
			const deplacement = { kind: 'moved', to_date: jour(2), to_start: '20:30' };
			expect(await exception(soir, jour(1))).toEqual(deplacement);
			// Retour, puis « Déplacer la séance » sans rien changer : la carte envoie la date prévue et
			// l'heure habituelle. L'action écrivait un déplacement vers la séance elle-même, qui
			// écrasait celui d'avant.
			const renvoi = await postForm('/?/deplacer', proposee, cookie);
			expect(renvoi.status).toBe(409);
			const html = await renvoi.text();
			expect(await exception(soir, jour(1))).toEqual(deplacement);
			refusee(html, SOIR.fr, jour(1));
			// L'écran rendu est à jour : la séance y est déplacée, avec de quoi la rétablir.
			const depart = texte(carte(html, jour(1), SOIR.fr, 'moved_away'));
			expect(depart).toContain(`${numerique(jour(2))} à 20:30`);
			expect(depart).toContain('Rétablir la séance');
		} finally {
			await retablir(soir, jour(1), cookie);
		}
	});

	it('refuses the card of a second tab or of another person, whatever it sends, and keeps their move', async () => {
		// Le premier onglet est ouvert d'abord ; une autre personne déplace la séance ensuite.
		const onglet = await (await get('/', cookie)).text();
		const editeur = await signIn(EDITEUR);
		await poserLangueDuCompte(EDITEUR, 'fr');
		const ailleurs = formulaireDeLaCarte(
			await (await get('/', editeur)).text(),
			'deplacer',
			cercle,
			jour(3)
		);
		const deplace = await postForm(
			'/?/deplacer',
			{ ...ailleurs, toDate: jour(4), toStart: '21:00' },
			editeur
		);
		try {
			expect(deplace.status).toBe(200);
			const deplacement = { kind: 'moved', to_date: jour(4), to_start: '21:00' };
			const proposee = formulaireDeLaCarte(onglet, 'deplacer', cercle, jour(3));
			// Maghrib à 19:20 ce jour-là : la carte proposait 19:35.
			expect(proposee).toEqual({
				courseId: cercle,
				date: jour(3),
				plannedStart: '19:35',
				toDate: jour(3),
				toStart: '19:35'
			});
			// Sans rien changer, à une autre date, à une date passée (ce refus-ci passe d'abord : il
			// n'y a rien à corriger), et l'annulation.
			for (const [action, envoi] of [
				['deplacer', proposee],
				['deplacer', { ...proposee, toDate: jour(5), toStart: '18:00' }],
				['deplacer', { ...proposee, toDate: jour(-1), toStart: '18:00' }],
				['annuler', formulaireDeLaCarte(onglet, 'annuler', cercle, jour(3))]
			] as const) {
				const reponse = await postForm(`/?/${action}`, envoi, cookie);
				expect(reponse.status, `${action} ${envoi['toDate'] ?? ''}`).toBe(409);
				refusee(await reponse.text(), CERCLE, jour(3));
				// Le déplacement de l'autre personne reste, et une annulation ne le remplace pas.
				expect(await exception(cercle, jour(3)), action).toEqual(deplacement);
			}
		} finally {
			await retablir(cercle, jour(3), cookie);
		}
	});

	it('refuses a move from a card left open after the session was cancelled, and keeps it cancelled', async () => {
		const page = await (await get('/', cookie)).text();
		const proposee = formulaireDeLaCarte(page, 'deplacer', soir, today);
		expect(proposee).toEqual({
			courseId: soir,
			date: today,
			plannedStart: '19:00',
			toDate: today,
			toStart: '19:00'
		});
		const annulation = formulaireDeLaCarte(page, 'annuler', soir, today);
		expect(annulation).toEqual({ courseId: soir, date: today });
		const annule = await postForm('/?/annuler', annulation, cookie);
		try {
			expect(annule.status).toBe(200);
			const annulee = { kind: 'cancelled', to_date: null, to_start: null };
			// La même page, « Déplacer la séance » sans rien changer : l'annulation devenait un
			// déplacement vers la séance elle-même.
			const renvoi = await postForm('/?/deplacer', proposee, cookie);
			expect(renvoi.status).toBe(409);
			refusee(await renvoi.text(), SOIR.fr, today);
			expect(await exception(soir, today)).toEqual(annulee);
			// Annuler une seconde fois depuis la même page ne réécrit rien non plus ; le message prêt à
			// coller est donné quand même (étape 19, D4).
			const encore = await postForm('/?/annuler', annulation, cookie);
			expect(encore.status).toBe(409);
			const html = await encore.text();
			expect(alerte(html)).toBe(DEJA_ANNULEE.fr(SOIR.fr, dateLue('fr', today)));
			expect(zonesDeTexte(section(html, 'message-titre'))).toEqual(
				zonesDeTexte(section(await annule.text(), 'message-titre'))
			);
			expect(await exception(soir, today)).toEqual(annulee);
		} finally {
			await retablir(soir, today, cookie);
		}
	});

	it('gives the cancellation message to a second person who cancels the same session, and writes nothing', async () => {
		// Deux personnes ouvrent l'écran ; la première annule le cercle de J+2, puis la seconde, sur
		// sa page restée ouverte, annule la même séance. Elle ne sait pas si la première a déjà prévenu
		// la communauté : elle reçoit le même message, et rien ne s'écrit une seconde fois.
		const editeur = await signIn(EDITEUR);
		await poserLangueDuCompte(EDITEUR, 'fr');
		const carteDeLEditeur = formulaireDeLaCarte(
			await (await get('/', editeur)).text(),
			'annuler',
			cercle,
			jour(2)
		);
		const journal = createDatabase({ role: 'app', overrides: { database: testDatabase } });
		const lignesDuJournal = async () =>
			withOrg(
				journal.db,
				{ organizationId: organisationA, userId: ids[RESPONSABLE] ?? '' },
				async (tx) =>
					lignes<{ n: number }>(await tx.execute(sql`select count(*)::int as n from "audit_log"`))
			).then((trouve) => trouve[0]?.n ?? 0);
		const premiere = await postForm('/?/annuler', { courseId: cercle, date: jour(2) }, cookie);
		try {
			expect(premiere.status).toBe(200);
			const messagesDeLaPremiere = messages(section(await premiere.text(), 'message-titre'));
			expect(messagesDeLaPremiere).toHaveLength(5);
			const journalAvant = await lignesDuJournal();
			const seconde = await postForm('/?/annuler', carteDeLEditeur, editeur);
			expect(seconde.status).toBe(409);
			const html = await seconde.text();
			// En haut, ce qui s'est passé ; dessous, le message, dans chaque langue publiée.
			expect(alerte(html)).toBe(DEJA_ANNULEE.fr(CERCLE, dateLue('fr', jour(2))));
			expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf('id="message-titre"'));
			expect(texte(section(html, 'message-titre').match(/^[\s\S]*?<\/h2>/)?.[0] ?? '')).toBe(
				'La séance est annulée.'
			);
			expect(
				messages(section(html, 'message-titre')).map((message) => [message.langue, message.texte])
			).toEqual(messagesDeLaPremiere.map((message) => [message.langue, message.texte]));
			expect(await exception(cercle, jour(2))).toEqual({
				kind: 'cancelled',
				to_date: null,
				to_start: null
			});
			expect(await lignesDuJournal()).toBe(journalAvant);
		} finally {
			await journal.close();
			await retablir(cercle, jour(2), cookie);
		}
	});

	it('refuses to restore a session restored since the page was opened, names it at the top, and writes nothing, not even the journal (relecture de D2)', async () => {
		// Le cercle de J+2 est annulé ; deux pages le montrent annulé. La première le rétablit ; la
		// seconde, restée ouverte, touche encore « Rétablir la séance ».
		expect((await postForm('/?/annuler', { courseId: cercle, date: jour(2) }, cookie)).status).toBe(
			200
		);
		const envoi = formulaireDeRetablissement(
			carte(await (await get('/', cookie)).text(), jour(2), CERCLE, 'cancelled')
		);
		// La carte envoie aussi ce qu'elle montrait : l'annulation, par son identifiant (étape 19,
		// lot 2).
		expect(envoi).toEqual({
			courseId: cercle,
			date: jour(2),
			shownId: await identifiantDe(cercle, jour(2))
		});
		const journal = createDatabase({ role: 'app', overrides: { database: testDatabase } });
		const lignesDuJournal = async () =>
			withOrg(
				journal.db,
				{ organizationId: organisationA, userId: ids[RESPONSABLE] ?? '' },
				async (tx) =>
					lignes<{ n: number }>(await tx.execute(sql`select count(*)::int as n from "audit_log"`))
			).then((trouve) => trouve[0]?.n ?? 0);
		try {
			expect((await postForm('/?/retablir', envoi ?? {}, cookie)).status).toBe(200);
			const journalAvant = await lignesDuJournal();
			const seconde = await postForm('/?/retablir', envoi ?? {}, cookie);
			expect(seconde.status).toBe(409);
			const html = await seconde.text();
			// La séance est de nouveau prévue, et sa carte est là : la phrase se lit pourtant en haut,
			// avant le programme, et aucune option ne se rouvre, puisque rien n'est à corriger.
			expect(alerte(html)).toBe(DEJA_RETABLIE.fr(CERCLE, dateLue('fr', jour(2))));
			expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf('id="jour-'));
			expect(carte(html, jour(2), CERCLE, 'scheduled')).not.toBe('');
			expect(optionsDesSeances(html).filter((options) => options.ouvert)).toEqual([]);
			expect(section(html, 'message-titre')).toBe('');
			expect(await exception(cercle, jour(2))).toBeUndefined();
			expect(await lignesDuJournal()).toBe(journalAvant);
		} finally {
			await journal.close();
			await retablir(cercle, jour(2), cookie);
		}
	});

	it('refuses « Rétablir » from a card left open after the session was restored and changed again, names it at the top in each language, keeps the change, and writes nothing (étape 19, lot 2)', async () => {
		// Le cercle de J+2 est annulé ; une page le montre annulé. Ailleurs, une autre personne le
		// rétablit, puis le déplace à J+4. La page restée ouverte touche « Rétablir la séance » : elle
		// effaçait ce déplacement, qu'elle n'avait jamais vu.
		expect((await postForm('/?/annuler', { courseId: cercle, date: jour(2) }, cookie)).status).toBe(
			200
		);
		const annulation = await identifiantDe(cercle, jour(2));
		const annulee =
			formulaireDeRetablissement(
				carte(await (await get('/', cookie)).text(), jour(2), CERCLE, 'cancelled')
			) ?? {};
		const journal = createDatabase({ role: 'app', overrides: { database: testDatabase } });
		const lignesDuJournal = async () =>
			withOrg(
				journal.db,
				{ organizationId: organisationA, userId: ids[RESPONSABLE] ?? '' },
				async (tx) =>
					lignes<{ n: number }>(await tx.execute(sql`select count(*)::int as n from "audit_log"`))
			).then((trouve) => trouve[0]?.n ?? 0);
		try {
			expect((await postForm('/?/retablir', annulee, cookie)).status).toBe(200);
			expect(
				(
					await postForm(
						'/?/deplacer',
						{ courseId: cercle, date: jour(2), toDate: jour(4), toStart: '21:00' },
						cookie
					)
				).status
			).toBe(200);
			const deplacement = { kind: 'moved', to_date: jour(4), to_start: '21:00' };
			const journalAvant = await lignesDuJournal();
			for (const langue of LANGUES) {
				await poserLangueDuCompte(RESPONSABLE, langue);
				const reponse = await postForm('/?/retablir', annulee, cookie);
				expect(reponse.status, langue).toBe(409);
				const html = await reponse.text();
				// La phrase des cartes périmées, qui nomme la séance, en haut, avant le programme.
				expect(alerte(html), langue).toBe(CHANGEE[langue](CERCLE, dateLue(langue, jour(2))));
				expect(html.indexOf('role="alert"'), langue).toBeLessThan(html.indexOf('id="jour-'));
				expect(section(html, 'message-titre'), langue).toBe('');
				expect(await exception(cercle, jour(2)), langue).toEqual(deplacement);
			}
			await poserLangueDuCompte(RESPONSABLE, 'fr');
			expect(await lignesDuJournal()).toBe(journalAvant);
			// La carte envoie ce qu'elle montrait : l'annulation, puis, rechargée, le déplacement.
			expect(annulee).toEqual({ courseId: cercle, date: jour(2), shownId: annulation });
			const page = await (await get('/', cookie)).text();
			const depart = formulaireDeRetablissement(carte(page, jour(2), CERCLE, 'moved_away'));
			const arrivee = formulaireDeRetablissement(carte(page, jour(4), CERCLE, 'moved_here'));
			const montre = {
				courseId: cercle,
				date: jour(2),
				shownId: (await identifiantDe(cercle, jour(2))) ?? '',
				shownToDate: jour(4),
				shownToStart: '21:00'
			};
			expect(montre.shownId).not.toBe(annulation);
			expect([depart, arrivee]).toEqual([montre, montre]);
			// Le même déplacement change encore sur place, ce que seul l'entretien fait : d'heure, puis
			// de jour à la même heure. Son identifiant reste ; la carte qui montrait l'état d'avant est
			// périmée à chaque fois.
			await maintenance((tx) =>
				tx.execute(sql`
					update "session_exception" set "to_start" = '21:30'
					where "course_id" = ${cercle} and "date" = ${jour(2)}
				`)
			);
			const perimee = await postForm('/?/retablir', montre, cookie);
			expect(perimee.status).toBe(409);
			expect(alerte(await perimee.text())).toBe(CHANGEE.fr(CERCLE, dateLue('fr', jour(2))));
			expect(await exception(cercle, jour(2))).toEqual({ ...deplacement, to_start: '21:30' });
			const a2130 = formulaireDeRetablissement(
				carte(await (await get('/', cookie)).text(), jour(4), CERCLE, 'moved_here')
			);
			expect(a2130).toEqual({ ...montre, shownToStart: '21:30' });
			await maintenance((tx) =>
				tx.execute(sql`
					update "session_exception" set "to_date" = ${jour(5)}
					where "course_id" = ${cercle} and "date" = ${jour(2)}
				`)
			);
			const autreJour = await postForm('/?/retablir', a2130 ?? {}, cookie);
			expect(autreJour.status).toBe(409);
			expect(alerte(await autreJour.text())).toBe(CHANGEE.fr(CERCLE, dateLue('fr', jour(2))));
			expect(await exception(cercle, jour(2))).toEqual({
				kind: 'moved',
				to_date: jour(5),
				to_start: '21:30'
			});
			expect(await identifiantDe(cercle, jour(2))).toBe(montre.shownId);
			expect(await lignesDuJournal()).toBe(journalAvant);
			// La carte à jour, elle, rétablit la séance.
			const aJour = formulaireDeRetablissement(
				carte(await (await get('/', cookie)).text(), jour(5), CERCLE, 'moved_here')
			);
			expect(aJour).toEqual({ ...montre, shownToDate: jour(5), shownToStart: '21:30' });
			expect((await postForm('/?/retablir', aJour ?? {}, cookie)).status).toBe(200);
			expect(await exception(cercle, jour(2))).toBeUndefined();
		} finally {
			await poserLangueDuCompte(RESPONSABLE, 'fr');
			await journal.close();
			await retablir(cercle, jour(2), cookie);
		}
	});

	it('refuses « Rétablir » from a card left open after the session was restored then cancelled again, or moved again to another day at the same time, in each language, and keeps the new change (étape 19, reprise du lot 2)', async () => {
		// Une annulation rétablie puis refaite ailleurs montre la même chose que la première ; un
		// déplacement refait vers un autre jour, à la même heure, ne diffère que par le jour. La carte
		// restée ouverte sur la première effaçait la seconde, qu'elle n'avait jamais vue.
		const journal = createDatabase({ role: 'app', overrides: { database: testDatabase } });
		const lignesDuJournal = async () =>
			withOrg(
				journal.db,
				{ organizationId: organisationA, userId: ids[RESPONSABLE] ?? '' },
				async (tx) =>
					lignes<{ n: number }>(await tx.execute(sql`select count(*)::int as n from "audit_log"`))
			).then((trouve) => trouve[0]?.n ?? 0);
		const carteDuJour = async (statut: string) =>
			formulaireDeRetablissement(
				carte(await (await get('/', cookie)).text(), jour(2), CERCLE, statut)
			) ?? {};
		try {
			// L'annulation refaite.
			expect(
				(await postForm('/?/annuler', { courseId: cercle, date: jour(2) }, cookie)).status
			).toBe(200);
			const premiere = await carteDuJour('cancelled');
			expect((await postForm('/?/retablir', premiere, cookie)).status).toBe(200);
			expect(
				(await postForm('/?/annuler', { courseId: cercle, date: jour(2) }, cookie)).status
			).toBe(200);
			const refaite = await identifiantDe(cercle, jour(2));
			const journalAvant = await lignesDuJournal();
			for (const langue of LANGUES) {
				await poserLangueDuCompte(RESPONSABLE, langue);
				const reponse = await postForm('/?/retablir', premiere, cookie);
				expect(reponse.status, langue).toBe(409);
				const html = await reponse.text();
				expect(alerte(html), langue).toBe(CHANGEE[langue](CERCLE, dateLue(langue, jour(2))));
				expect(html.indexOf('role="alert"'), langue).toBeLessThan(html.indexOf('id="jour-'));
				expect(section(html, 'message-titre'), langue).toBe('');
				expect(await exception(cercle, jour(2)), langue).toEqual({
					kind: 'cancelled',
					to_date: null,
					to_start: null
				});
				expect(await identifiantDe(cercle, jour(2)), langue).toBe(refaite);
			}
			await poserLangueDuCompte(RESPONSABLE, 'fr');
			expect(await lignesDuJournal()).toBe(journalAvant);

			// Le déplacement refait : vers J+4 à 21:00, puis, rétabli, vers J+5 à la même heure.
			expect((await postForm('/?/retablir', await carteDuJour('cancelled'), cookie)).status).toBe(
				200
			);
			const deplacer = (toDate: IsoDate) =>
				postForm(
					'/?/deplacer',
					{ courseId: cercle, date: jour(2), toDate, toStart: '21:00' },
					cookie
				);
			expect((await deplacer(jour(4))).status).toBe(200);
			const versJ4 = await carteDuJour('moved_away');
			expect((await postForm('/?/retablir', versJ4, cookie)).status).toBe(200);
			expect((await deplacer(jour(5))).status).toBe(200);
			const journalAvantDeplacement = await lignesDuJournal();
			const reponse = await postForm('/?/retablir', versJ4, cookie);
			expect(reponse.status).toBe(409);
			expect(alerte(await reponse.text())).toBe(CHANGEE.fr(CERCLE, dateLue('fr', jour(2))));
			expect(await exception(cercle, jour(2))).toEqual({
				kind: 'moved',
				to_date: jour(5),
				to_start: '21:00'
			});
			expect(await lignesDuJournal()).toBe(journalAvantDeplacement);
		} finally {
			await poserLangueDuCompte(RESPONSABLE, 'fr');
			await journal.close();
			await retablir(cercle, jour(2), cookie);
		}
	});

	it('refuses a card left open while the time of the course changed in its page, and writes nothing (relecture du lot 5)', async () => {
		// La page telle qu'elle était avant : la carte du cours du soir de J+2 montre 19:00.
		const avant = await (await get('/', cookie)).text();
		const proposee = formulaireDeLaCarte(avant, 'deplacer', soir, jour(2));
		// Une autre personne passe le cours à 20:00 dans sa fiche ; la séance n'a aucune exception.
		await changerHeure(soir, '20:00', '21:30');
		try {
			// Renvoyée sans changement, la carte déplaçait la séance à 19:00 le même jour, avec le
			// message « commence à 19:00 au lieu de 20:00 ». Pour un autre jour, elle partait d'une
			// heure que la personne n'a pas vue.
			for (const envoi of [proposee, { ...proposee, toDate: jour(4), toStart: '18:00' }]) {
				const reponse = await postForm('/?/deplacer', envoi, cookie);
				expect(reponse.status, envoi['toDate']).toBe(409);
				const html = await reponse.text();
				expect(await exception(soir, jour(2)), envoi['toDate']).toBeUndefined();
				expect(section(html, 'message-titre'), envoi['toDate']).toBe('');
				// La séance est encore prévue : sa carte se rouvre sur la phrase, et elle seule.
				const ouvertes = optionsDesSeances(html).filter((options) => options.ouvert);
				expect(
					ouvertes.map((options) => [
						cache(options.contenu, 'courseId'),
						cache(options.contenu, 'date')
					]),
					envoi['toDate']
				).toEqual([[soir, jour(2)]]);
				expect(alerte(ouvertes[0]?.contenu ?? ''), envoi['toDate']).toBe(
					HEURE_CHANGEE.fr(SOIR.fr, dateLue('fr', jour(2)))
				);
				// Sa nouvelle heure est sous son titre, et la carte rendue de nouveau l'envoie.
				expect(texte(carte(html, jour(2), SOIR.fr, 'scheduled')), envoi['toDate']).toContain(
					'20:00 – 21:30'
				);
				expect(cache(ouvertes[0]?.contenu ?? '', 'plannedStart'), envoi['toDate']).toBe('20:00');
			}
		} finally {
			await changerHeure(soir, '19:00', '20:30');
			await retablir(soir, jour(2), cookie);
		}
	});

	it('reopens that card on the current time of the course, not the old one it proposed, and keeps a time that was typed', async () => {
		const avant = await (await get('/', cookie)).text();
		const proposee = formulaireDeLaCarte(avant, 'deplacer', soir, jour(2));
		expect(proposee).toMatchObject({ plannedStart: '19:00', toDate: jour(2), toStart: '19:00' });
		await changerHeure(soir, '20:00', '21:30');
		try {
			// 19:00 était l'heure que la carte proposait d'elle-même : la personne ne l'a pas choisie, et
			// la carte rouverte propose l'heure du cours, 20:00. Une heure tapée, 18:00, reste.
			for (const [envoi, heure] of [
				[proposee, '20:00'],
				[{ ...proposee, toDate: jour(4), toStart: '18:00' }, '18:00']
			] as const) {
				const reponse = await postForm('/?/deplacer', envoi, cookie);
				expect(reponse.status, heure).toBe(409);
				const html = await reponse.text();
				expect(alerte(html), heure).toBe(HEURE_CHANGEE.fr(SOIR.fr, dateLue('fr', jour(2))));
				expect(formulaireDeLaCarte(html, 'deplacer', soir, jour(2)), heure).toEqual({
					courseId: soir,
					date: jour(2),
					plannedStart: '20:00',
					toDate: envoi['toDate'],
					toStart: heure
				});
			}
			// La carte rouverte, renvoyée telle quelle, ne déplace pas la séance à l'ancienne heure : elle
			// propose le jour et l'heure où la séance est prévue, et rien ne change.
			const rouverte = formulaireDeLaCarte(
				await (await postForm('/?/deplacer', proposee, cookie)).text(),
				'deplacer',
				soir,
				jour(2)
			);
			const renvoi = await postForm('/?/deplacer', rouverte, cookie);
			expect(renvoi.status).toBe(400);
			expect(alerte(await renvoi.text())).toBe(
				'La séance est déjà prévue à cette date et à cette heure. Choisissez une autre date ou une autre heure.'
			);
			expect(await exception(soir, jour(2))).toBeUndefined();
		} finally {
			await changerHeure(soir, '19:00', '20:30');
			await retablir(soir, jour(2), cookie);
		}
	});

	it('reopens on the time a session now has, when its card showed none and proposed 19:00', async () => {
		// Le calendrier importé s'arrête à J+4 : la carte du cercle de J+5 ne montre aucune heure, et
		// son champ propose 19:00.
		const avant = await (await get('/', cookie)).text();
		const proposee = formulaireDeLaCarte(avant, 'deplacer', cercle, jour(5));
		expect(proposee).toMatchObject({ plannedStart: '', toStart: '19:00' });
		// Le calendrier est prolongé d'un jour : Maghrib à 19:20, et le cercle à 19:35.
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "prayer_day" ("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib",
					"isha", "source")
				values (${organisationA}, ${jour(5)}, '05:30', '13:15', '16:45', '19:20', '20:50', 'import')
			`)
		);
		try {
			const reponse = await postForm('/?/deplacer', proposee, cookie);
			expect(reponse.status).toBe(409);
			// 19:00 était proposé par la carte, pas choisi : la carte rouverte propose 19:35.
			expect(formulaireDeLaCarte(await reponse.text(), 'deplacer', cercle, jour(5))).toEqual({
				courseId: cercle,
				date: jour(5),
				plannedStart: '19:35',
				toDate: jour(5),
				toStart: '19:35'
			});
			expect(await exception(cercle, jour(5))).toBeUndefined();
		} finally {
			await maintenance((tx) =>
				tx.execute(sql`
					delete from "prayer_day" where "organization_id" = ${organisationA} and "date" = ${jour(5)}
				`)
			);
			await retablir(cercle, jour(5), cookie);
		}
	});

	it('sends with each card the time it showed, none for a session shown without one, and takes a card that is up to date', async () => {
		const html = await (await get('/', cookie)).text();
		expect(formulaireDeLaCarte(html, 'deplacer', soir, jour(2))['plannedStart']).toBe('19:00');
		// Maghrib à 19:20 le jour J+2 : le cercle, un quart d'heure après, montre 19:35.
		expect(formulaireDeLaCarte(html, 'deplacer', cercle, jour(2))['plannedStart']).toBe('19:35');
		// Le calendrier importé s'arrête à J+4 : le cercle de J+5 ne montre aucune heure.
		const sansHeure = formulaireDeLaCarte(html, 'deplacer', cercle, jour(5));
		expect(sansHeure['plannedStart']).toBe('');
		// Cette carte est à jour : elle passe, et donne à la séance l'heure que le champ propose.
		const reponse = await postForm('/?/deplacer', sansHeure, cookie);
		try {
			expect(reponse.status).toBe(200);
			expect(await exception(cercle, jour(5))).toEqual({
				kind: 'moved',
				to_date: jour(5),
				to_start: '19:00'
			});
		} finally {
			await retablir(cercle, jour(5), cookie);
		}
	});
});

describe('deux envois au même instant n’écrasent rien (relecture du lot 5)', () => {
	let cookie: string;

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'fr');
	});

	it('lets one of two moves sent at the same instant through, refuses the other, and keeps the first', async () => {
		// Deux onglets, ou deux personnes, ouverts sur la même carte, qui déplacent la séance chacun
		// ailleurs à la même seconde. Les deux passent la vérification d'avant, puisque rien n'est
		// encore écrit : c'est l'écriture elle-même qui doit laisser la main au premier.
		const carteDuCercle = formulaireDeLaCarte(
			await (await get('/', cookie)).text(),
			'deplacer',
			cercle,
			jour(6)
		);
		const envois = [
			{ ...carteDuCercle, toDate: jour(4), toStart: '18:00' },
			{ ...carteDuCercle, toDate: jour(5), toStart: '21:00' }
		];
		try {
			const reponses = await ensemble(
				envois.map((envoi) => () => postForm('/?/deplacer', envoi, cookie))
			);
			const pages = await Promise.all(reponses.map((reponse) => reponse.text()));
			expect(reponses.map((reponse) => reponse.status).sort()).toEqual([200, 409]);
			const gagnant = reponses.findIndex((reponse) => reponse.status === 200);
			expect(await exception(cercle, jour(6))).toEqual({
				kind: 'moved',
				to_date: envois[gagnant]?.toDate,
				to_start: envois[gagnant]?.toStart
			});
			// Le second apprend que la séance a changé, et aucun message n'annonce son déplacement.
			const refus = pages[1 - gagnant] ?? '';
			expect(alerte(refus)).toBe(CHANGEE.fr(CERCLE, dateLue('fr', jour(6))));
			expect(section(refus, 'message-titre')).toBe('');
		} finally {
			await retablir(cercle, jour(6), cookie);
		}
	});
});

describe('D4 : une séance déplacée ici se rétablit depuis sa carte (étape 19)', () => {
	let cookie: string;

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'fr');
	});

	it('gives a « date exceptionnelle » card the restore button, even when the planned date is past the seven days', async () => {
		// Le cours du soir de J+10, avancé à J+1 : sa date prévue n'est pas à l'écran, et seule la carte
		// d'arrivée peut défaire le changement. J+1 n'a pas d'autre séance arrivée d'ailleurs : les
		// tests d'A2 en laissent à J+2 et aujourd'hui.
		const avance = newId();
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "session_exception" ("id", "organization_id", "course_id", "date", "kind",
					"to_date", "to_start", "created_by")
				values (${avance}, ${organisationA}, ${soir}, ${jour(10)}, 'moved', ${jour(1)}, '17:00',
					${ids[RESPONSABLE] ?? ''})
			`)
		);
		try {
			const html = await (await get('/', cookie)).text();
			const arrivee = carte(html, jour(1), SOIR.fr, 'moved_here');
			expect(texte(arrivee)).toContain('date exceptionnelle');
			expect(texte(arrivee)).toContain(`Prévue à l’origine le ${dateLue('fr', jour(10))}`);
			expect(texte(arrivee)).toContain('Rétablir la séance');
			// La carte vise la date où la séance était prévue : c'est celle que garde l'exception.
			const envoi = formulaireDeRetablissement(arrivee);
			// Elle envoie aussi ce qu'elle montrait : ce déplacement-là, à J+1, 17:00 (étape 19, lot 2).
			expect(envoi).toEqual({
				courseId: soir,
				date: jour(10),
				shownId: avance,
				shownToDate: jour(1),
				shownToStart: '17:00'
			});
			const reponse = await postForm('/?/retablir', envoi ?? {}, cookie);
			expect(reponse.status).toBe(200);
			expect(await exception(soir, jour(10))).toBeUndefined();
			const apres = await reponse.text();
			expect(texte(section(apres, 'message-titre').match(/^[\s\S]*?<\/h2>/)?.[0] ?? '')).toBe(
				'La séance est rétablie.'
			);
			expect(carte(apres, jour(1), SOIR.fr, 'moved_here')).toBe('');
		} finally {
			await retablir(soir, jour(10), cookie);
		}
	});

	it('keeps one restore button for a move within the same day, on the card of the planned time', async () => {
		const deplace = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(3), toDate: jour(3), toStart: '21:00' },
			cookie
		);
		try {
			expect(deplace.status).toBe(200);
			const html = await (await get('/', cookie)).text();
			const arrivee = carte(html, jour(3), SOIR.fr, 'moved_here');
			expect(texte(arrivee)).toContain('nouvelle heure');
			expect(formulaireDeRetablissement(arrivee)).toBeNull();
			expect(formulaireDeRetablissement(carte(html, jour(3), SOIR.fr, 'moved_away'))).toEqual({
				courseId: soir,
				date: jour(3),
				shownId: await identifiantDe(soir, jour(3)),
				shownToDate: jour(3),
				shownToStart: '21:00'
			});
		} finally {
			await retablir(soir, jour(3), cookie);
		}
	});
});

describe('D4 : un cours en brouillon reste hors du programme de la semaine (étape 19)', () => {
	let cookie: string;
	const brouillon = newId();
	const jumuaPubliee = newId();
	const jumuaBrouillon = newId();
	const apresDhuhr = newId();
	const TITRE_BROUILLON = 'Cours en préparation';
	const JUMUA_PUBLIEE = 'Jumu’a de midi';
	const JUMUA_BROUILLON = 'Jumu’a à l’essai';
	const APRES_DHUHR = 'Leçon après la prière';
	/** Le vendredi des sept jours affichés : il y en a toujours un, et un seul. */
	const vendredi =
		[0, 1, 2, 3, 4, 5, 6]
			.map((pas) => jour(pas))
			.find((date) => weekdayFromDays(isoDateToDays(date)) === 5) ?? today;
	/**
	 * Le calendrier importé s'arrête à J+4 : ce bloc le complète le temps de ses tests, pour que le
	 * vendredi ait toujours son Dhuhr.
	 */
	const joursAjoutes = [jour(5), jour(6)];

	/** Les marques d'une carte, telles qu'elles s'affichent. */
	function marques(fragment: string): string[] {
		return [...fragment.matchAll(/<span\b[^>]*class="marque[^"]*"[^>]*>([\s\S]*?)<\/span>/g)].map(
			(trouve) => texte(trouve[1] ?? '')
		);
	}

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		await maintenance(async (tx) => {
			for (const date of joursAjoutes) {
				await tx.execute(sql`
					insert into "prayer_day" ("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib",
						"isha", "source")
					values (${organisationA}, ${date}, '05:30', '13:15', '16:45', '19:20', '20:50', 'import')
				`);
			}
			// Un cours en brouillon, chaque jour à 17:00, et un cours publié le vendredi, une demi-heure
			// après le Dhuhr, c'est-à-dire après la dernière session du vendredi.
			for (const [id, statut, titre, jours, horaire] of [
				[
					brouillon,
					'draft',
					TITRE_BROUILLON,
					'1,2,3,4,5,6,7',
					sql`'fixed', '17:00', '18:00', null, null, null`
				],
				[apresDhuhr, 'published', APRES_DHUHR, '5', sql`'prayer', null, null, 'dhuhr', 30, 60`]
			] as const) {
				await tx.execute(sql`
					insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
						"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
						"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "timing_prayer",
						"timing_offset_minutes", "timing_duration_minutes", "starts_on")
					values (${id}, ${organisationA}, ${statut}, 'open', array['fr'], 'fr', 'weekly',
						${sql.raw(`array[${jours}]::smallint[]`)}, 1, ${jour(-30)}, ${horaire}, ${jour(-30)})
				`);
				await tx.execute(sql`
					insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
					values (${newId()}, ${organisationA}, ${id}, 'fr', ${titre})
				`);
			}
			// Deux sessions du vendredi : la première publiée à 13:30, la seconde en brouillon à 14:30.
			// Seule la première donne son heure au Dhuhr, sur cet écran comme sur la page publique et
			// dans Partager : le cours d'après le Dhuhr commence à 14:00, et non à 15:00.
			for (const [id, statut, rang, debut, fin, titre] of [
				[jumuaPubliee, 'published', 1, '13:30', '14:10', JUMUA_PUBLIEE],
				[jumuaBrouillon, 'draft', 2, '14:30', '15:10', JUMUA_BROUILLON]
			] as const) {
				await tx.execute(sql`
					insert into "course" ("id", "organization_id", "kind", "jumua_order", "status",
						"audience", "teaching_language", "source_language", "recurrence_kind",
						"recurrence_weekday", "recurrence_interval", "recurrence_anchor_date", "timing_kind",
						"timing_start", "timing_end", "starts_on")
					values (${id}, ${organisationA}, 'jumua', ${rang}, ${statut}, 'open', array['ar'], 'fr',
						'weekly', array[5]::smallint[], 1, ${jour(-30)}, 'fixed', ${debut}, ${fin}, ${jour(-30)})
				`);
				await tx.execute(sql`
					insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
					values (${newId()}, ${organisationA}, ${id}, 'fr', ${titre})
				`);
			}
		});
	});

	afterAll(async () => {
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		await maintenance(async (tx) => {
			for (const id of [brouillon, jumuaPubliee, jumuaBrouillon, apresDhuhr]) {
				await tx.execute(sql`delete from "course" where "id" = ${id}`);
			}
			for (const date of joursAjoutes) {
				await tx.execute(sql`
					delete from "prayer_day" where "organization_id" = ${organisationA} and "date" = ${date}
				`);
			}
		});
	});

	it('leaves a draft course and a draft Friday session out of the week message, in each language', async () => {
		const semaine = messages(section(await (await get('/', cookie)).text(), 'semaine-titre'));
		expect(semaine.map((message) => message.langue)).toEqual([...LANGUES]);
		for (const message of semaine) {
			expect(message.texte, message.langue).not.toContain(TITRE_BROUILLON);
			expect(message.texte, message.langue).not.toContain(JUMUA_BROUILLON);
			expect(message.texte, message.langue).toContain(JUMUA_PUBLIEE);
		}
	});

	it('writes the week message of Partager in each language, even when a draft Friday session moves a course after Dhuhr', async () => {
		const avenir = messages(section(await (await get('/', cookie)).text(), 'semaine-titre'));
		const partager = messages(
			section(await (await get('/partager', cookie)).text(), 'semaine-titre')
		);
		expect(partager).toHaveLength(5);
		const parLangue = (liste: Message[]) =>
			Object.fromEntries(liste.map((message) => [message.langue ?? '', message.texte]));
		expect(parLangue(avenir)).toEqual(parLangue(partager));
		// Le cours d'après le Dhuhr suit la session publiée, à 13:30, et non celle en brouillon.
		const [francais] = avenir.map((message) => message.texte);
		expect(francais?.split('\n')).toContain(`- ${APRES_DHUHR}, 14:00 – 15:00`);
	});

	it('shows on the card of a course after Dhuhr the time of the week message, not one a draft Friday session gives it (relecture de D4)', async () => {
		const html = await (await get('/', cookie)).text();
		expect(texte(carte(html, vendredi, APRES_DHUHR, 'scheduled'))).toContain('14:00 – 15:00');
		expect(formulaireDeLaCarte(html, 'deplacer', apresDhuhr, vendredi)['plannedStart']).toBe(
			'14:00'
		);
		// La session en brouillon garde sa propre heure sur sa carte.
		expect(texte(carte(html, vendredi, JUMUA_BROUILLON, 'scheduled'))).toContain('14:30 – 15:10');
	});

	it('says in each message of a move on the same day the time the community read, not one a draft Friday session gives (relecture de D4)', async () => {
		const html = await (await get('/', cookie)).text();
		const envoi = {
			...formulaireDeLaCarte(html, 'deplacer', apresDhuhr, vendredi),
			toStart: '16:00'
		};
		const reponse = await postForm('/?/deplacer', envoi, cookie);
		try {
			expect(reponse.status).toBe(200);
			const recus = messages(section(await reponse.text(), 'message-titre'));
			expect(recus.map((message) => message.langue)).toEqual([...LANGUES]);
			for (const message of recus) {
				expect(message.texte, message.langue).toContain('16:00');
				expect(message.texte, message.langue).toContain('14:00');
				expect(message.texte, message.langue).not.toContain('15:00');
			}
			expect(recus[0]?.texte.split('\n')).toContain(
				`Le cours « ${APRES_DHUHR} » du ${dateLue('fr', vendredi)} commence à 16:00 au lieu de 14:00.`
			);
		} finally {
			await retablir(apresDhuhr, vendredi, cookie);
		}
	});

	it('marks the card of a draft course « brouillon », in each language, and no other card', async () => {
		try {
			for (const langue of LANGUES) {
				await poserLangueDuCompte(RESPONSABLE, langue);
				const html = await (await get('/', cookie)).text();
				expect(marques(carte(html, jour(1), TITRE_BROUILLON, 'scheduled')), langue).toEqual([
					BROUILLON[langue]
				]);
				expect(marques(carte(html, vendredi, JUMUA_BROUILLON, 'scheduled')), langue).toEqual([
					BROUILLON[langue]
				]);
				expect(marques(carte(html, vendredi, JUMUA_PUBLIEE, 'scheduled')), langue).toEqual([]);
				expect(marques(carte(html, jour(1), CERCLE, 'scheduled')), langue).toEqual([]);
			}
		} finally {
			await poserLangueDuCompte(RESPONSABLE, 'fr');
		}
	});
});

describe('B1 : un déplacement le même jour dit un changement d’heure (relecture du lot 4)', () => {
	let cookie: string;

	beforeAll(async () => {
		cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'fr');
	});

	/** La phrase d'un message prêt à coller, entre la salutation et la dernière ligne. */
	function phrase(message: Message): string {
		return message.texte.split('\n')[2] ?? '';
	}

	/** La marque d'une carte, à côté de son titre. Svelte ajoute sa propre classe à la sienne. */
	function marque(fragment: string): string {
		return texte(
			fragment.match(/<span\b[^>]*class="marque\b[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? ''
		);
	}

	it('says in each message that only the time changes, from the planned time to the new one', async () => {
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(3), toDate: jour(3), toStart: '20:30' },
			cookie
		);
		try {
			expect(reponse.status).toBe(200);
			const annonce = messages(section(await reponse.text(), 'message-titre'));
			expect(annonce.map((message) => message.langue)).toEqual([...LANGUES]);
			const date = numerique(jour(3));
			const [fr, de, it, en, ar] = annonce.map(phrase);
			expect(fr).toMatch(
				new RegExp(
					`^Le cours « ${SOIR.fr} » du \\p{L}+ ${date} commence à 20:30 au lieu de 19:00\\.$`,
					'u'
				)
			);
			expect(de).toMatch(
				new RegExp(
					`^Am \\p{L}+, ${date}, beginnt der Kurs «${SOIR.de}» um 20:30 statt um 19:00\\.$`,
					'u'
				)
			);
			expect(it).toMatch(
				new RegExp(
					`^La lezione «${SOIR.fr}» di \\p{L}+ ${date} inizia alle 20:30 anziché alle 19:00\\.$`,
					'u'
				)
			);
			expect(en).toMatch(
				new RegExp(
					`^The ‘${SOIR.fr}’ session on \\p{L}+ ${date} now starts at 20:30 instead of 19:00\\.$`,
					'u'
				)
			);
			expect(ar).toMatch(
				new RegExp(
					`^يبدأ درس «${SOIR.ar}» يوم \\p{L}+ ${date} في الساعة 20:30 بدلًا من الساعة 19:00\\.$`,
					'u'
				)
			);
			// La date n'est dite qu'une fois : plus de « du mardi … au mardi … ».
			for (const message of annonce) {
				expect(message.texte.split(date).length - 1, message.langue).toBe(1);
			}
		} finally {
			await retablir(soir, jour(3), cookie);
		}
	});

	it('marks the session with its new time on its card, and says the planned time, in each language', async () => {
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(3), toDate: jour(3), toStart: '20:30' },
			cookie
		);
		try {
			expect(reponse.status).toBe(200);
			const attendus: Record<Langue, { marque: string; origine: string; ancienne: string }> = {
				fr: {
					marque: 'nouvelle heure',
					origine: 'Prévue à l’origine : 19:00 – 20:30',
					ancienne: 'date exceptionnelle'
				},
				de: {
					marque: 'neue Uhrzeit',
					origine: 'Ursprünglich geplant: 19:00 – 20:30',
					ancienne: 'Ausnahmetermin'
				},
				it: {
					marque: 'nuovo orario',
					origine: 'Prevista inizialmente: 19:00 – 20:30',
					ancienne: 'data eccezionale'
				},
				en: {
					marque: 'new time',
					origine: 'Originally planned: 19:00 – 20:30',
					ancienne: 'rescheduled'
				},
				ar: {
					marque: 'وقت جديد',
					origine: 'الوقت المقرّر أصلًا: 19:00 – 20:30',
					ancienne: 'موعد استثنائي'
				}
			};
			for (const langue of LANGUES) {
				await poserLangueDuCompte(RESPONSABLE, langue);
				const html = await (await get('/', cookie)).text();
				// Le titre de la carte suit la langue de l'écran (étape 19).
				const arrivee = carte(html, jour(3), SOIR_LU[langue], 'moved_here');
				expect(arrivee, langue).not.toBe('');
				const lu = texte(arrivee);
				expect(lu, langue).toContain(attendus[langue].marque);
				expect(lu, langue).toContain(attendus[langue].origine);
				// Ni « date exceptionnelle », ni la date elle-même : elle n'a pas changé.
				expect(lu, langue).not.toContain(attendus[langue].ancienne);
				expect(lu, langue).not.toContain(numerique(jour(3)));
				expect(marque(arrivee), langue).toBe(attendus[langue].marque);
			}
		} finally {
			await poserLangueDuCompte(RESPONSABLE, 'fr');
			await retablir(soir, jour(3), cookie);
		}
	});

	it('marks the session with its new time in the week message too, in each language (relecture du lot 5)', async () => {
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: soir, date: jour(3), toDate: jour(3), toStart: '20:30' },
			cookie
		);
		try {
			expect(reponse.status).toBe(200);
			const semaine = messages(section(await reponse.text(), 'semaine-titre'));
			expect(semaine.map((message) => message.langue)).toEqual([...LANGUES]);
			// Comme la carte et le message du déplacement : une nouvelle heure, pas une date exceptionnelle.
			const attendues: Record<Langue, string> = {
				fr: `- ${SOIR.fr}, 20:30 – 22:00, ${SALLE} (nouvelle heure)`,
				de: `- ${SOIR.de}, 20:30 – 22:00, ${SALLE} (neue Uhrzeit)`,
				it: `- ${SOIR.fr}, 20:30 – 22:00, ${SALLE} (nuovo orario)`,
				en: `- ${SOIR.fr}, 20:30 – 22:00, ${SALLE} (new time)`,
				ar: `- ${SOIR.ar}، 20:30 – 22:00، ${SALLE} (وقت جديد)`
			};
			for (const message of semaine) {
				const langue = message.langue as Langue;
				expect(message.texte.split('\n'), langue).toContain(attendues[langue]);
			}
		} finally {
			await retablir(soir, jour(3), cookie);
		}
	});

	it('gives the new time alone to a session that had none, on its card and in the message', async () => {
		// Le calendrier importé s'arrête à J+4 : le cercle de J+5 s'affiche « 15 min après Maghrib ».
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: cercle, date: jour(5), toDate: jour(5), toStart: '19:00' },
			cookie
		);
		try {
			expect(reponse.status).toBe(200);
			const annonce = messages(section(await reponse.text(), 'message-titre'));
			expect(phrase(annonce[0] as Message)).toMatch(
				new RegExp(
					`^Le cours « ${CERCLE} » du \\p{L}+ ${numerique(jour(5))} commence à 19:00\\.$`,
					'u'
				)
			);
			const arrivee = texte(
				carte(await (await get('/', cookie)).text(), jour(5), CERCLE, 'moved_here')
			);
			expect(arrivee).toContain('nouvelle heure');
			expect(arrivee).toContain('Prévue à l’origine : 15 min après Maghrib');
		} finally {
			await retablir(cercle, jour(5), cookie);
		}
	});

	it('keeps the words of a change of date, on the card and in the message', async () => {
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: cercle, date: jour(4), toDate: jour(6), toStart: '18:00' },
			cookie
		);
		try {
			expect(reponse.status).toBe(200);
			const annonce = messages(section(await reponse.text(), 'message-titre'));
			expect(phrase(annonce[0] as Message)).toMatch(
				new RegExp(
					`^Le cours « ${CERCLE} » du \\p{L}+ ${numerique(jour(4))} est déplacé au \\p{L}+ ${numerique(jour(6))} à 18:00\\.$`,
					'u'
				)
			);
			const html = await (await get('/', cookie)).text();
			const arrivee = carte(html, jour(6), CERCLE, 'moved_here');
			expect(marque(arrivee)).toBe('date exceptionnelle');
			expect(texte(arrivee)).toMatch(
				new RegExp(`Prévue à l’origine le \\p{L}+ ${numerique(jour(4))}`, 'u')
			);
			// Le programme de la semaine garde lui aussi ses mots pour une autre date.
			expect(messages(section(html, 'semaine-titre'))[0]?.texte.split('\n')).toContain(
				`- ${CERCLE}, 18:00 – 19:00 (date exceptionnelle)`
			);
		} finally {
			await retablir(cercle, jour(4), cookie);
		}
	});
});

describe('B1 : chaque mention dit quoi faire, et à qui', () => {
	/** Les mentions de l'écran, ce qui demande une décision avant le programme. */
	function mentions(html: string): string[] {
		return [...html.matchAll(/<p\b[^>]*class="mention[^"]*"[^>]*>([\s\S]*?)<\/p>/g)].map(
			(trouve) => trouve[1] ?? ''
		);
	}

	it('sends a manager to the prayer times, and tells an editor who can set them', async () => {
		const responsable = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const editeur = await signIn(EDITEUR);
		await poserLangueDuCompte(EDITEUR, 'fr');
		const pourLeResponsable = mentions(await (await get('/', responsable)).text());
		const pourLEditeur = mentions(await (await get('/', editeur)).text());
		// Les séances sans heure et la fin de l'import mènent à l'écran des prières ; le site, non.
		expect(pourLeResponsable.map((mention) => /href="[^"]*prieres"/.test(mention))).toEqual([
			true,
			true,
			false
		]);
		// Cet écran renverrait un éditeur à l'accueil sans rien lui dire : pas de lien, mais qui le peut.
		expect(pourLEditeur.map((mention) => /href="[^"]*prieres"/.test(mention))).toEqual([
			false,
			false,
			false
		]);
		expect(texte(pourLEditeur[0] ?? '')).toContain(
			'La personne responsable de votre organisation peut les régler.'
		);
		expect(texte(pourLEditeur[1] ?? '')).toContain(
			'La personne responsable de votre organisation peut ajouter la suite du calendrier.'
		);
	});
});

describe('D1 : les messages prêts à coller, dans les langues publiées', () => {
	it('writes the week in each published language, the default language first and open', async () => {
		const cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const semaine = messages(section(await (await get('/', cookie)).text(), 'semaine-titre'));
		expect(semaine.map((message) => message.langue)).toEqual(['fr', 'de', 'it', 'en', 'ar']);
		expect(semaine.map((message) => message.ouvert)).toEqual([true, false, false, false, false]);
		expect(semaine.map((message) => message.sens)).toEqual(['ltr', 'ltr', 'ltr', 'ltr', 'rtl']);
		const [fr, de, it, en, ar] = semaine.map((message) => message.texte);
		expect(fr).toContain(`Programme de la semaine à ${ORGANISATION} :`);
		expect(de).toContain(`Das Programm dieser Woche bei ${ORGANISATION}:`);
		expect(it).toContain(`Il programma della settimana di ${ORGANISATION}:`);
		expect(en).toContain(`This week’s programme at ${ORGANISATION}:`);
		expect(ar).toContain(`برنامج هذا الأسبوع في ${ORGANISATION}:`);
		// Le titre d'un cours dans la langue du message quand il y est traduit, sinon dans sa langue.
		expect(de).toContain(SOIR.de);
		expect(de).not.toContain(SOIR.fr);
		expect(ar).toContain(SOIR.ar);
		expect(it).toContain(SOIR.fr);
		expect(de).toContain(CERCLE);
		for (const message of semaine) {
			expect(message.texte.startsWith(ACCUEIL), message.langue).toBe(true);
			expect(message.texte.match(ISO_DATE)?.[0] ?? null, message.langue).toBeNull();
			expect(message.texte, message.langue).toContain(numerique(jour(1)));
		}
	});

	it('writes a cancellation in each published language, and nothing else', async () => {
		const cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'de');
		const reponse = await postForm('/?/annuler', { courseId: soir, date: jour(1) }, cookie);
		expect(reponse.status).toBe(200);
		const annonce = messages(section(await reponse.text(), 'message-titre'));
		expect(annonce.map((message) => message.langue)).toEqual(['fr', 'de', 'it', 'en', 'ar']);
		expect(annonce.map((message) => message.ouvert)).toEqual([true, false, false, false, false]);
		const date = numerique(jour(1));
		const [fr, de, , , ar] = annonce.map((message) => message.texte);
		expect(fr).toMatch(new RegExp(`Le cours « ${SOIR.fr} » du \\p{L}+ ${date} est annulé\\.`, 'u'));
		expect(de).toMatch(new RegExp(`Der Kurs «${SOIR.de}» vom \\p{L}+, ${date}, fällt aus\\.`, 'u'));
		expect(ar).toContain(`«${SOIR.ar}»`);
		expect(ar).toContain(date);
		// Le nom que lit un lecteur d'écran est dans la langue de l'écran, ici l'allemand, et il dit
		// la langue de chaque message.
		expect(annonce.map((message) => message.nom.nom)).toEqual([
			'Nachricht zum Kopieren auf Französisch',
			'Nachricht zum Kopieren auf Deutsch',
			'Nachricht zum Kopieren auf Italienisch',
			'Nachricht zum Kopieren auf Englisch',
			'Nachricht zum Kopieren auf Arabisch'
		]);
		await postForm('/?/retablir', { courseId: soir, date: jour(1) }, cookie);
	});

	it('names each message box after its language, in the language of the screen', async () => {
		const cookie = await signIn(RESPONSABLE);
		await poserLangueDuCompte(RESPONSABLE, 'fr');
		const semaine = messages(section(await (await get('/', cookie)).text(), 'semaine-titre'));
		// Cinq noms différents : un lecteur d'écran ne dit plus cinq fois la même chose.
		expect(semaine.map((message) => message.nom.nom)).toEqual([
			'Programme de la semaine en français',
			'Programme de la semaine en allemand',
			'Programme de la semaine en italien',
			'Programme de la semaine en anglais',
			'Programme de la semaine en arabe'
		]);
		// Chaque message garde sa langue et son sens.
		expect(semaine.map((message) => [message.langue, message.sens])).toEqual(
			LANGUES.map((langue) => [langue, SENS[langue]])
		);
		for (const message of semaine) {
			// La langue du message est dite par un élément qui n'est pas dans sa langue à lui : ni
			// l'élément, ni son bloc ne portent de `lang`, il parle donc la langue de l'écran.
			const autres = message.nom.designes.filter(
				(designe) => !designe.balise.startsWith('<textarea')
			);
			expect(autres.length, message.langue).toBeGreaterThan(0);
			for (const designe of autres)
				expect(attributs(designe.balise), message.langue).not.toHaveProperty('lang');
			expect(attributs(message.bloc), message.langue).not.toHaveProperty('lang');
		}
		// Le libellé que lisent les tests de l'accueil (`acces.test.ts`) reste le même.
		expect(semaine.map((message) => message.libelle)).toEqual(
			Array(5).fill('Programme de la semaine')
		);
	});

	it('names the message boxes in Arabic on an Arabic screen', async () => {
		const cookie = await signIn(RESPONSABLE_B);
		await poserLangueDuCompte(RESPONSABLE_B, 'ar');
		const semaine = messages(section(await (await get('/', cookie)).text(), 'semaine-titre'));
		expect(semaine.map((message) => message.nom.nom)).toEqual([
			'برنامجك لهذا الأسبوع بالألمانية',
			'برنامجك لهذا الأسبوع بالفرنسية',
			'برنامجك لهذا الأسبوع بالعربية'
		]);
		await poserLangueDuCompte(RESPONSABLE_B, 'fr');
	});

	it('puts the default language first for the week, and the language of the course first for it', async () => {
		const cookie = await signIn(RESPONSABLE_B);
		await poserLangueDuCompte(RESPONSABLE_B, 'fr');
		const html = await (await get('/', cookie)).text();
		const semaine = messages(section(html, 'semaine-titre'));
		// L'allemand, langue par défaut, puis les autres langues publiées ; ni l'italien ni l'anglais.
		expect(semaine.map((message) => message.langue)).toEqual(['de', 'fr', 'ar']);
		expect(semaine[0]?.ouvert).toBe(true);

		const deplace = await postForm(
			'/?/deplacer',
			{ courseId: tajwid, date: jour(3), toDate: jour(1), toStart: '17:30' },
			cookie
		);
		expect(deplace.status).toBe(200);
		const annonce = messages(section(await deplace.text(), 'message-titre'));
		// Le cours est écrit en arabe : son message commence par l'arabe.
		expect(annonce.map((message) => message.langue)).toEqual(['ar', 'fr', 'de']);
		const [ar, fr, de] = annonce.map((message) => message.texte);
		expect(ar).toContain(`«${TAJWID.ar}»`);
		expect(fr).toContain(`« ${TAJWID.fr} »`);
		// Pas de titre allemand : celui du cours, dans sa langue.
		expect(de).toContain(`«${TAJWID.ar}»`);
		for (const texteDuMessage of [ar, fr, de]) {
			expect(texteDuMessage).toContain(numerique(jour(3)));
			expect(texteDuMessage).toContain(numerique(jour(1)));
			expect(texteDuMessage).toContain('17:30');
		}
	});
});

describe('D2, A3 : l’écran dans les cinq langues', () => {
	/** Chaque état de l'écran, rendu dans chaque langue, et le code de la réponse. */
	const rendus: Record<string, Record<Langue, string>> = {};
	const statuts: Record<string, Record<Langue, number>> = {};
	const ETATS = [
		'affiché',
		'après une annulation',
		'après une seconde annulation',
		'après un refus',
		'après un déplacement qui ne change rien',
		'après une page restée ouverte',
		'après une carte dont l’heure a changé',
		'après une annulation pour une date passée',
		'après un rétablissement',
		'après un second rétablissement',
		'après une séance disparue'
	];
	const ATTENDUS: Record<string, number> = {
		affiché: 200,
		'après une annulation': 200,
		'après une seconde annulation': 409,
		'après un refus': 400,
		'après un déplacement qui ne change rien': 400,
		'après une page restée ouverte': 409,
		'après une carte dont l’heure a changé': 409,
		'après une annulation pour une date passée': 400,
		'après un rétablissement': 200,
		'après un second rétablissement': 409,
		'après une séance disparue': 404
	};

	beforeAll(async () => {
		const cookie = await signIn(RESPONSABLE);
		for (const langue of LANGUES) {
			await poserLangueDuCompte(RESPONSABLE, langue);
			const pages: [string, Response][] = [
				['affiché', await get('/', cookie)],
				[
					'après une annulation',
					await postForm('/?/annuler', { courseId: cercle, date: jour(1) }, cookie)
				],
				[
					// La même séance, annulée une seconde fois : par une autre personne, ou depuis une page
					// restée ouverte (étape 19, D4).
					'après une seconde annulation',
					await postForm('/?/annuler', { courseId: cercle, date: jour(1) }, cookie)
				],
				[
					'après un refus',
					await postForm(
						'/?/deplacer',
						{ courseId: cercle, date: jour(2), toDate: jour(-3), toStart: '20:00' },
						cookie
					)
				],
				[
					'après un déplacement qui ne change rien',
					await postForm(
						'/?/deplacer',
						{ courseId: soir, date: jour(3), toDate: jour(3), toStart: '19:00' },
						cookie
					)
				],
				[
					// La carte du cercle de J+1, encore affichée ailleurs, alors qu'il vient d'être annulé.
					'après une page restée ouverte',
					await postForm(
						'/?/deplacer',
						{ courseId: cercle, date: jour(1), toDate: jour(1), toStart: '19:35' },
						cookie
					)
				],
				[
					// La carte du cours du soir de J+2, ouverte quand il commençait à 18:00 : son heure
					// a changé depuis, et la séance est prévue à 19:00.
					'après une carte dont l’heure a changé',
					await postForm(
						'/?/deplacer',
						{
							courseId: soir,
							date: jour(2),
							plannedStart: '18:00',
							toDate: jour(2),
							toStart: '18:00'
						},
						cookie
					)
				],
				[
					// La carte du cours du soir d'hier, sur une page ouverte depuis la veille.
					'après une annulation pour une date passée',
					await postForm('/?/annuler', { courseId: soir, date: jour(-1) }, cookie)
				],
				[
					'après un rétablissement',
					await postForm('/?/retablir', { courseId: cercle, date: jour(1) }, cookie)
				],
				[
					// La même séance, rétablie une seconde fois depuis une page restée ouverte : il n'y a
					// plus rien à rétablir (étape 19, relecture de D2).
					'après un second rétablissement',
					await postForm('/?/retablir', { courseId: cercle, date: jour(1) }, cookie)
				],
				[
					// Un cours supprimé depuis l'ouverture de la page (étape 19, D4).
					'après une séance disparue',
					await postForm('/?/retablir', { courseId: newId(), date: jour(1) }, cookie)
				]
			];
			for (const [etat, reponse] of pages) {
				(statuts[etat] ??= {} as Record<Langue, number>)[langue] = reponse.status;
				(rendus[etat] ??= {} as Record<Langue, string>)[langue] = await reponse.text();
			}
		}
	});

	it.each(ETATS.flatMap((etat) => LANGUES.map((langue) => ({ etat, langue }))))(
		'answers the screen $etat in $langue with the right status',
		({ etat, langue }) => {
			expect(statuts[etat]?.[langue]).toBe(ATTENDUS[etat]);
		}
	);

	/**
	 * La page sans ses messages à copier : ils sont écrits dans les langues publiées, quelle que soit
	 * celle de l'écran, et les tests D1 les éprouvent. Sans ce retrait, le message allemand, présent
	 * dans la page française comme dans la page allemande, passerait pour du français resté.
	 */
	function sansMessages(html: string): string {
		return html.replace(/<textarea\b[\s\S]*?<\/textarea>/g, ' ');
	}

	it.each(ETATS.flatMap((etat) => LANGUES.map((langue) => ({ etat, langue }))))(
		'serves the screen $etat with <html lang="$langue">',
		({ etat, langue }) => {
			const html = rendus[etat]?.[langue] ?? '';
			expect(html.match(/<html\b[^>]*>/g)).toEqual([
				`<html lang="${langue}" dir="${SENS[langue]}">`
			]);
		}
	);

	it.each(ETATS.flatMap((etat) => LANGUES.slice(1).map((langue) => ({ etat, langue }))))(
		'leaves no French sentence on the screen $etat in $langue',
		({ etat, langue }) => {
			const francais = sansMessages(rendus[etat]?.fr ?? '');
			const autre = sansMessages(rendus[etat]?.[langue] ?? '');
			// Sans texte, une comparaison vide passerait pour une traduction complète.
			expect(textSegments(francais).size).toBeGreaterThan(40);
			expect(frenchLeft(francais, autre, PERMIS)).toEqual([]);
			// Un mot seul ne passe pas par le filtre des phrases : les marques et les boutons courts.
			const morceaux = textSegments(autre);
			for (const mot of ['annulée', 'déplacée', 'Rétablir', 'Déplacer', 'Consultations', 'Où']) {
				expect(morceaux.has(mot), mot).toBe(false);
			}
		}
	);

	it.each(ETATS.flatMap((etat) => LANGUES.map((langue) => ({ etat, langue }))))(
		'writes no date as AAAA-MM-JJ on the screen $etat in $langue',
		({ etat, langue }) => {
			const lu = visibleText(rendus[etat]?.[langue] ?? '');
			expect(lu.match(ISO_DATE)?.[0] ?? null).toBeNull();
		}
	);

	it('names the screen and its notices in each language', () => {
		const titres = {
			fr: `À venir | ${ORGANISATION}`,
			de: `Demnächst | ${ORGANISATION}`,
			it: `In arrivo | ${ORGANISATION}`,
			en: `Coming up | ${ORGANISATION}`,
			ar: `القادم | ${ORGANISATION}`
		};
		for (const langue of LANGUES) {
			const html = rendus['affiché']?.[langue] ?? '';
			expect(html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim(), langue).toBe(titres[langue]);
			const lu = visibleText(html);
			// L'import s'arrête dans quatre jours : la date de fin s'écrit JJ.MM.AAAA.
			expect(lu, langue).toContain(numerique(jour(4)));
			// Les trois mentions sont là, chacune avec son lien.
			expect((html.match(/<p\b[^>]*class="mention[^"]*"[^>]*role="status"/g) ?? []).length).toBe(3);
		}
		// Le texte que les tests des prières lisent en français reste le même.
		const francais = visibleText(rendus['affiché']?.fr ?? '');
		expect(francais).toContain('sans heure');
		expect(francais).toContain('Régler les heures de prière');
	});

	it('says in each language what the last action did', () => {
		const faits: Record<string, Record<Langue, string>> = {
			'après une annulation': {
				fr: 'La séance est annulée.',
				de: 'Der Termin ist abgesagt.',
				it: 'La lezione è annullata.',
				en: 'The session is cancelled.',
				ar: 'أُلغيت الحصة.'
			},
			'après un rétablissement': {
				fr: 'La séance est rétablie.',
				de: 'Der Termin ist wiederhergestellt.',
				it: 'La lezione è ripristinata.',
				en: 'The session has been restored.',
				ar: 'استُعيدت الحصة.'
			}
		};
		for (const [etat, phrases] of Object.entries(faits)) {
			for (const langue of LANGUES) {
				const html = rendus[etat]?.[langue] ?? '';
				expect(
					texte(section(html, 'message-titre').match(/^[\s\S]*?<\/h2>/)?.[0] ?? ''),
					`${etat} ${langue}`
				).toBe(phrases[langue]);
			}
		}
		// Une annulation porte son message ; un rétablissement, non.
		expect(
			zonesDeTexte(section(rendus['après une annulation']?.fr ?? '', 'message-titre'))
		).toHaveLength(5);
		expect(
			zonesDeTexte(section(rendus['après un rétablissement']?.fr ?? '', 'message-titre'))
		).toEqual([]);
	});

	it('says in each language that the session is already there, and what to choose instead', () => {
		const phrases: Record<Langue, string> = {
			fr: 'La séance est déjà prévue à cette date et à cette heure. Choisissez une autre date ou une autre heure.',
			de: 'Der Termin ist schon an diesem Datum und zu dieser Uhrzeit geplant. Wählen Sie ein anderes Datum oder eine andere Uhrzeit.',
			it: 'La lezione è già prevista per questa data e questo orario. Scegli un’altra data o un altro orario.',
			en: 'The session is already planned for this date and time. Choose a different date or time.',
			ar: 'الحصة مقرّرة أصلًا في هذا التاريخ وفي هذا الوقت. اختر تاريخًا آخر أو وقتًا آخر.'
		};
		for (const langue of LANGUES) {
			const html = rendus['après un déplacement qui ne change rien']?.[langue] ?? '';
			// Le refus se lit dans la carte de la séance, rouverte, et nulle part un « déplacé ».
			const ouvertes = optionsDesSeances(html).filter((bloc) => bloc.ouvert);
			expect(ouvertes, langue).toHaveLength(1);
			expect(alerte(ouvertes[0]?.contenu ?? ''), langue).toBe(phrases[langue]);
			expect(section(html, 'message-titre'), langue).toBe('');
		}
	});

	it('says in each language that the session changed since the page was opened, above the programme', () => {
		for (const langue of LANGUES) {
			const html = rendus['après une page restée ouverte']?.[langue] ?? '';
			// La carte n'a plus d'options : la phrase se lit en haut de l'écran, avant le programme. Elle
			// nomme la séance, dans la langue de l'écran (étape 19, D4).
			expect(alerte(html), langue).toBe(CHANGEE[langue](CERCLE, dateLue(langue, jour(1))));
			expect(html.indexOf('role="alert"'), langue).toBeLessThan(html.indexOf('id="jour-'));
			expect(
				optionsDesSeances(html).filter((bloc) => bloc.ouvert),
				langue
			).toEqual([]);
			expect(section(html, 'message-titre'), langue).toBe('');
		}
	});

	it('says in each language that the time changed since the page was opened, in the card', () => {
		for (const langue of LANGUES) {
			const html = rendus['après une carte dont l’heure a changé']?.[langue] ?? '';
			// La séance est encore prévue, à sa nouvelle heure : la phrase se lit dans sa carte, rouverte.
			const ouvertes = optionsDesSeances(html).filter((bloc) => bloc.ouvert);
			expect(ouvertes, langue).toHaveLength(1);
			// Le titre du cours est celui de la carte, dans la langue de l'écran quand il y est traduit.
			expect(alerte(ouvertes[0]?.contenu ?? ''), langue).toBe(
				HEURE_CHANGEE[langue](SOIR_LU[langue], dateLue(langue, jour(2)))
			);
			expect(section(html, 'message-titre'), langue).toBe('');
		}
	});

	it('says in each language that the session was already cancelled, above the programme, and gives its message anyway', () => {
		for (const langue of LANGUES) {
			const html = rendus['après une seconde annulation']?.[langue] ?? '';
			expect(alerte(html), langue).toBe(DEJA_ANNULEE[langue](CERCLE, dateLue(langue, jour(1))));
			expect(html.indexOf('role="alert"'), langue).toBeLessThan(html.indexOf('id="jour-'));
			expect(
				optionsDesSeances(html).filter((bloc) => bloc.ouvert),
				langue
			).toEqual([]);
			// Le message est celui de la première annulation, dans chaque langue publiée.
			const premiere = rendus['après une annulation']?.[langue] ?? '';
			expect(zonesDeTexte(section(html, 'message-titre')), langue).toHaveLength(5);
			expect(zonesDeTexte(section(html, 'message-titre')), langue).toEqual(
				zonesDeTexte(section(premiere, 'message-titre'))
			);
		}
	});

	it('says in each language that the session was already restored, above the programme, and opens no card', () => {
		for (const langue of LANGUES) {
			const html = rendus['après un second rétablissement']?.[langue] ?? '';
			expect(alerte(html), langue).toBe(DEJA_RETABLIE[langue](CERCLE, dateLue(langue, jour(1))));
			expect(html.indexOf('role="alert"'), langue).toBeLessThan(html.indexOf('id="jour-'));
			expect(
				optionsDesSeances(html).filter((bloc) => bloc.ouvert),
				langue
			).toEqual([]);
			expect(section(html, 'message-titre'), langue).toBe('');
		}
	});

	it('isolates the title of the session in each refusal that names it, in each language (ADR 0007)', () => {
		// Un nom saisi par une personne est isolé (`<bdi>`) : sans lui, sur un écran arabe, un titre
		// latin qui finit par une ponctuation se retourne, « (Tafsir (2 » (relecture de D4).
		const refus: [string, (langue: Langue) => string][] = [
			['après une page restée ouverte', () => CERCLE],
			['après une seconde annulation', () => CERCLE],
			['après un second rétablissement', () => CERCLE],
			['après une carte dont l’heure a changé', (langue) => SOIR_LU[langue]]
		];
		for (const [etat, titre] of refus) {
			for (const langue of LANGUES) {
				const phrase =
					(rendus[etat]?.[langue] ?? '').match(/<p\b[^>]*role="alert"[^>]*>([\s\S]*?)<\/p>/)?.[1] ??
					'';
				expect(
					[...phrase.matchAll(/<bdi\b[^>]*>([\s\S]*?)<\/bdi>/g)].map((isole) =>
						decode(isole[1] ?? '')
					),
					`${etat} ${langue}`
				).toEqual([titre(langue)]);
			}
		}
	});

	it('says in each language that a session is gone, and that the list below is up to date', () => {
		for (const langue of LANGUES) {
			const html = rendus['après une séance disparue']?.[langue] ?? '';
			expect(alerte(html), langue).toBe(SEANCE_DISPARUE[langue]);
			expect(html.indexOf('role="alert"'), langue).toBeLessThan(html.indexOf('id="jour-'));
			expect(section(html, 'message-titre'), langue).toBe('');
		}
	});

	it('writes the title of a card in the language of the screen when the course is translated into it', () => {
		for (const langue of LANGUES) {
			const html = rendus['affiché']?.[langue] ?? '';
			const titres = titresDesCartes(section(html, `jour-${jour(1)}`));
			// Traduit en allemand et en arabe, le cours du soir garde son titre français ailleurs ; le
			// cercle de lecture n'a que son titre français.
			expect(titres, langue).toContain(SOIR_LU[langue]);
			expect(titres, langue).toContain(CERCLE);
			if (SOIR_LU[langue] !== SOIR.fr) expect(titres, langue).not.toContain(SOIR.fr);
		}
	});

	it('says in each language that a past session can no longer be cancelled, above the programme', () => {
		for (const langue of LANGUES) {
			const html = rendus['après une annulation pour une date passée']?.[langue] ?? '';
			expect(alerte(html), langue).toBe(SEANCE_PASSEE[langue]);
			expect(html.indexOf('role="alert"'), langue).toBeLessThan(html.indexOf('id="jour-'));
			expect(section(html, 'message-titre'), langue).toBe('');
		}
	});
});

describe('D1 : la prière du vendredi dans la langue de chaque message (relecture du lot 4)', () => {
	/** Le nom que le service propose à une session du vendredi, dans chaque langue. */
	const PRIERE: Record<Langue, string> = {
		fr: 'Prière du vendredi',
		de: 'Freitagsgebet',
		it: 'Preghiera del venerdì',
		en: 'Friday prayer',
		ar: 'صلاة الجمعة'
	};
	/** Un titre que l'organisation a écrit elle-même : il ne change dans aucune langue. */
	const CHOISI = 'Jumu’a des jeunes';
	/** Le titre d'un cours dans un message, entre les guillemets de chaque langue. */
	const GUILLEMETS: Record<Langue, (titre: string) => string> = {
		fr: (titre) => `« ${titre} »`,
		de: (titre) => `«${titre}»`,
		it: (titre) => `«${titre}»`,
		en: (titre) => `‘${titre}’`,
		ar: (titre) => `«${titre}»`
	};
	const VIRGULE: Record<Langue, string> = { fr: ', ', de: ', ', it: ', ', en: ', ', ar: '، ' };
	/**
	 * Les mots propres à la prière du vendredi dans un message prêt à coller, à la place de « Le cours »
	 * (décision du chef de projet, étape 19) : l'annulation, le déplacement, et la dernière ligne.
	 */
	const ANNULATION: Record<Langue, (titre: string, date: string) => string> = {
		fr: (titre, date) => `« ${titre} » : la prière du ${date} est annulée.`,
		de: (titre, date) => `«${titre}»: Das Gebet vom ${date}, fällt aus.`,
		it: (titre, date) => `«${titre}»: la preghiera di ${date} è annullata.`,
		en: (titre, date) => `‘${titre}’: the prayer on ${date} is cancelled.`,
		ar: (titre, date) => `«${titre}»: أُلغيت الصلاة يوم ${date}.`
	};
	const DEPLACEMENT: Record<Langue, (titre: string, de: string, vers: string) => string> = {
		fr: (titre, de, vers) => `« ${titre} » : la prière du ${de} est déplacée au ${vers} à 15:00.`,
		de: (titre, de, vers) =>
			`«${titre}»: Das Gebet vom ${de}, wird auf ${vers}, um 15:00 verschoben.`,
		it: (titre, de, vers) => `«${titre}»: la preghiera di ${de} è spostata a ${vers} alle 15:00.`,
		en: (titre, de, vers) => `‘${titre}’: the prayer on ${de} has been moved to ${vers} at 15:00.`,
		ar: (titre, de, vers) =>
			`«${titre}»: نُقلت الصلاة من يوم ${de} إلى يوم ${vers} في الساعة 15:00.`
	};
	const LES_AUTRES: Record<Langue, string> = {
		fr: 'Les autres prières du vendredi ont lieu comme d’habitude.',
		de: 'Die anderen Freitagsgebete finden wie gewohnt statt.',
		it: 'Le altre preghiere del venerdì si svolgono regolarmente.',
		en: 'The other Friday prayers go ahead as usual.',
		ar: 'تُقام مواعيد صلاة الجمعة الأخرى كالمعتاد.'
	};

	/** Une organisation de langue française qui publie les cinq langues. */
	const francophone = newId();
	/** Une organisation de langue allemande qui publie aussi le français. */
	const germanophone = newId();
	const RESPONSABLE_FR = 'avenir-vendredi@example.test';
	const RESPONSABLE_DE = 'avenir-freitag@example.test';
	const propose = newId();
	const choisi = newId();
	const freitag = newId();
	/** Le vendredi des sept jours affichés : il y en a toujours un, et un seul. */
	const vendredi =
		[0, 1, 2, 3, 4, 5, 6]
			.map((pas) => jour(pas))
			.find((date) => new Date(`${date}T12:00:00Z`).getUTCDay() === 5) ?? today;
	let cookieFr: string;
	let cookieDe: string;

	beforeAll(async () => {
		await maintenance(async (tx) => {
			await tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
					"enabled_language", "prayer_module", "greeting")
				values (${francophone}, 'a-venir-vendredi', 'Association du vendredi', ${FUSEAU}, 'fr',
					array['fr','de','it','en','ar'], true, ${ACCUEIL}),
					(${germanophone}, 'a-venir-freitag', 'Verein am Freitag', ${FUSEAU}, 'de',
					array['de','fr'], true, ${ACCUEIL})
			`);
			for (const [email, organisation] of [
				[RESPONSABLE_FR, francophone],
				[RESPONSABLE_DE, germanophone]
			] as const) {
				const utilisateur = newId();
				await tx.execute(sql`
					insert into "user" ("id", "email", "email_verified", "language")
					values (${utilisateur}, ${email}, true, 'fr')
				`);
				await tx.execute(sql`
					insert into "membership" ("id", "organization_id", "user_id", "role")
					values (${newId()}, ${organisation}, ${utilisateur}, 'org_admin')
				`);
				await tx.execute(conditionsAcceptees(organisation, utilisateur));
			}
			for (const [id, organisation, source, ordre, debut, fin, titre] of [
				[propose, francophone, 'fr', 1, '13:30', '14:00', PRIERE.fr],
				[choisi, francophone, 'fr', 2, '14:15', '14:45', CHOISI],
				[freitag, germanophone, 'de', 1, '13:15', '13:45', PRIERE.de]
			] as const) {
				await tx.execute(sql`
					insert into "course" ("id", "organization_id", "kind", "jumua_order", "status",
						"audience", "teaching_language", "source_language", "recurrence_kind",
						"recurrence_weekday", "recurrence_interval", "recurrence_anchor_date", "timing_kind",
						"timing_start", "timing_end", "starts_on")
					values (${id}, ${organisation}, 'jumua', ${ordre}, 'published', 'open', array[${source}],
						${source}, 'weekly', array[5]::smallint[], 1, ${jour(-30)}, 'fixed', ${debut}, ${fin},
						${jour(-30)})
				`);
				await tx.execute(sql`
					insert into "course_translation" ("id", "organization_id", "course_id", "language",
						"title")
					values (${newId()}, ${organisation}, ${id}, ${source}, ${titre})
				`);
			}
		});
		cookieFr = await signIn(RESPONSABLE_FR);
		cookieDe = await signIn(RESPONSABLE_DE);
	});

	it('names the prayer in each week message, and keeps a title the organisation chose', async () => {
		const semaine = messages(section(await (await get('/', cookieFr)).text(), 'semaine-titre'));
		expect(semaine.map((message) => message.langue)).toEqual([...LANGUES]);
		for (const message of semaine) {
			const langue = message.langue as Langue;
			expect(message.texte, langue).toContain(`- ${PRIERE[langue]}${VIRGULE[langue]}13:30 – 14:00`);
			expect(message.texte, langue).toContain(`- ${CHOISI}${VIRGULE[langue]}14:15 – 14:45`);
			if (langue !== 'fr') expect(message.texte, langue).not.toContain(PRIERE.fr);
		}
	});

	it('names the prayer in each cancellation and move message', async () => {
		for (const [action, envoi] of [
			['annuler', { courseId: propose, date: vendredi }],
			[
				'deplacer',
				{ courseId: propose, date: vendredi, toDate: addDays(vendredi, 1), toStart: '15:00' }
			]
		] as const) {
			const reponse = await postForm(`/?/${action}`, envoi, cookieFr);
			try {
				expect(reponse.status, action).toBe(200);
				const annonce = messages(section(await reponse.text(), 'message-titre'));
				expect(
					annonce.map((message) => message.langue),
					action
				).toEqual([...LANGUES]);
				for (const message of annonce) {
					const langue = message.langue as Langue;
					expect(message.texte, `${action} ${langue}`).toContain(
						GUILLEMETS[langue](PRIERE[langue])
					);
					if (langue !== 'fr') {
						expect(message.texte, `${action} ${langue}`).not.toContain(PRIERE.fr);
					}
				}
			} finally {
				await retablir(propose, vendredi, cookieFr);
			}
		}
	});

	it('gives the Friday prayer its own words in each cancellation and move message, not those of a course', async () => {
		const lendemain = addDays(vendredi, 1);
		for (const [action, envoi] of [
			['annuler', { courseId: propose, date: vendredi }],
			['deplacer', { courseId: choisi, date: vendredi, toDate: lendemain, toStart: '15:00' }]
		] as const) {
			const reponse = await postForm(`/?/${action}`, envoi, cookieFr);
			try {
				expect(reponse.status, action).toBe(200);
				const annonce = messages(section(await reponse.text(), 'message-titre'));
				expect(annonce, action).toHaveLength(5);
				for (const message of annonce) {
					const langue = message.langue as Langue;
					const phrase =
						action === 'annuler'
							? ANNULATION[langue](PRIERE[langue], dateLue(langue, vendredi))
							: DEPLACEMENT[langue](CHOISI, dateLue(langue, vendredi), dateLue(langue, lendemain));
					expect(message.texte.split('\n'), `${action} ${langue}`).toEqual([
						`${ACCUEIL}${langue === 'ar' ? '،' : ','}`,
						'',
						phrase,
						LES_AUTRES[langue]
					]);
				}
			} finally {
				await retablir(envoi.courseId, vendredi, cookieFr);
			}
		}
	});

	it('names the prayer on its card in the language of the screen, and keeps a title the organisation chose', async () => {
		try {
			for (const langue of LANGUES) {
				await poserLangueDuCompte(RESPONSABLE_FR, langue);
				const html = await (await get('/', cookieFr)).text();
				const titres = titresDesCartes(section(html, `jour-${vendredi}`));
				expect(titres, langue).toContain(PRIERE[langue]);
				expect(titres, langue).toContain(CHOISI);
				if (langue !== 'fr') expect(titres, langue).not.toContain(PRIERE.fr);
			}
		} finally {
			await poserLangueDuCompte(RESPONSABLE_FR, 'fr');
		}
	});

	it('keeps a title the organisation chose in each cancellation and move message', async () => {
		for (const [action, envoi] of [
			['annuler', { courseId: choisi, date: vendredi }],
			[
				'deplacer',
				{ courseId: choisi, date: vendredi, toDate: addDays(vendredi, 1), toStart: '15:00' }
			]
		] as const) {
			const reponse = await postForm(`/?/${action}`, envoi, cookieFr);
			try {
				expect(reponse.status, action).toBe(200);
				const annonce = messages(section(await reponse.text(), 'message-titre'));
				expect(annonce, action).toHaveLength(5);
				for (const message of annonce) {
					const langue = message.langue as Langue;
					expect(message.texte, `${action} ${langue}`).toContain(GUILLEMETS[langue](CHOISI));
				}
			} finally {
				await retablir(choisi, vendredi, cookieFr);
			}
		}
	});

	it('names it in French for an organisation that writes in German', async () => {
		const semaine = messages(section(await (await get('/', cookieDe)).text(), 'semaine-titre'));
		expect(semaine.map((message) => message.langue)).toEqual(['de', 'fr']);
		const [de, fr] = semaine.map((message) => message.texte);
		expect(de).toContain(`- ${PRIERE.de}, 13:15 – 13:45`);
		expect(fr).toContain(`- ${PRIERE.fr}, 13:15 – 13:45`);
		expect(fr).not.toContain(PRIERE.de);
		for (const [action, envoi] of [
			['annuler', { courseId: freitag, date: vendredi }],
			[
				'deplacer',
				{ courseId: freitag, date: vendredi, toDate: addDays(vendredi, 1), toStart: '15:00' }
			]
		] as const) {
			const reponse = await postForm(`/?/${action}`, envoi, cookieDe);
			try {
				expect(reponse.status, action).toBe(200);
				const annonce = messages(section(await reponse.text(), 'message-titre'));
				expect(
					annonce.map((message) => message.langue),
					action
				).toEqual(['de', 'fr']);
				const [allemand, francais] = annonce.map((message) => message.texte);
				expect(allemand, action).toContain(GUILLEMETS.de(PRIERE.de));
				expect(francais, action).toContain(GUILLEMETS.fr(PRIERE.fr));
				expect(francais, action).not.toContain(PRIERE.de);
			} finally {
				await retablir(freitag, vendredi, cookieDe);
			}
		}
	});
});

describe('un jour où le cours n’a pas de séance (étape 19, lot 3)', () => {
	// Aucune carte ne l'envoie, mais un formulaire écrit à la main, ou une page restée ouverte pendant
	// que le rythme du cours changeait, pouvait annuler ou déplacer une séance un jour où le cours n'en
	// a pas : l'action répondait « annulée » et gardait une exception qui ne tombe sur aucune séance,
	// que le calcul ignore. Les séances comptent comme l'écran les montre, du calcul de `@jadwal/core`,
	// quel que soit le jour, dans les sept jours de l'écran ou après.

	/** Le refus d'un jour sans séance : il nomme le cours, par son titre, et le jour. */
	const PAS_DE_SEANCE: Record<Langue, PhraseNommee> = {
		fr: (titre, date) =>
			`Aucune séance « ${titre} » n’est prévue le ${date}. Rien n’a été enregistré. Le programme ci-dessous est à jour.`,
		de: (titre, date) =>
			`Am ${date}, ist kein Termin «${titre}» geplant. Es wurde nichts gespeichert. Das Programm unten ist aktuell.`,
		it: (titre, date) =>
			`Non è prevista nessuna lezione «${titre}» per ${date}. Non è stato salvato niente. Il programma qui sotto è aggiornato.`,
		en: (titre, date) =>
			`There is no ‘${titre}’ session on ${date}. Nothing has been saved. The programme below shows the latest changes.`,
		ar: (titre, date) =>
			`لا توجد حصة «${titre}» مقرّرة يوم ${date}. لم يُحفظ أي شيء. برنامجك المعروض أدناه محدَّث.`
	};

	const organisation = newId();
	const RESPONSABLE_ATELIER = 'avenir-atelier@example.test';
	const utilisateur = newId();
	/** Un cours chaque semaine, le jour de la semaine de demain seulement, jusqu'à J+10. */
	const atelier = newId();
	const ATELIER = 'Atelier du soir';
	/** Le jour de la séance de la semaine, et celui de la semaine suivante, hors des sept jours. */
	const seance = jour(1);
	const semaineSuivante = jour(8);
	/** Le lendemain de la séance : le cours n'a pas de séance ce jour-là. */
	const sansSeance = jour(2);
	/** Le même jour de la semaine, deux semaines plus tard : après le dernier jour du cours. */
	const apresLaFin = jour(15);
	let cookie: string;
	let journal: DatabaseHandle;

	/** Les lignes du journal de l'organisation, lues par le rôle applicatif, comme l'écran les lit. */
	async function lignesDuJournal(): Promise<number> {
		return withOrg(journal.db, { organizationId: organisation, userId: utilisateur }, async (tx) =>
			lignes<{ n: number }>(await tx.execute(sql`select count(*)::int as n from "audit_log"`))
		).then((trouve) => trouve[0]?.n ?? 0);
	}

	/** Toutes les exceptions du cours : un refus n'en écrit aucune, à aucune date. */
	async function exceptionsDuCours(): Promise<unknown[]> {
		return maintenance(async (tx) =>
			lignes(
				await tx.execute(sql`
					select "date"::text, "kind", "to_date"::text from "session_exception"
					where "course_id" = ${atelier} order by "date"
				`)
			)
		);
	}

	beforeAll(async () => {
		journal = createDatabase({ role: 'app', overrides: { database: testDatabase } });
		await maintenance(async (tx) => {
			await tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
					"enabled_language", "prayer_module", "greeting")
				values (${organisation}, 'a-venir-atelier', 'Association de l’atelier', ${FUSEAU}, 'fr',
					array['fr','de','it','en','ar'], false, ${ACCUEIL})
			`);
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified", "language")
				values (${utilisateur}, ${RESPONSABLE_ATELIER}, true, 'fr')
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organisation}, ${utilisateur}, 'org_admin')
			`);
			await tx.execute(conditionsAcceptees(organisation, utilisateur));
			await tx.execute(sql`
				insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
					"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
					"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "starts_on",
					"ends_on")
				values (${atelier}, ${organisation}, 'published', 'adults', array['fr'], 'fr', 'weekly',
					array[${weekdayFromDays(isoDateToDays(seance))}]::smallint[], 1, ${jour(-30)}, 'fixed',
					'18:00', '19:30', ${jour(-30)}, ${jour(10)})
			`);
			await tx.execute(sql`
				insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
				values (${newId()}, ${organisation}, ${atelier}, 'fr', ${ATELIER})
			`);
		});
		cookie = await signIn(RESPONSABLE_ATELIER);
	});

	// Ce qu'un envoi aurait écrit ne reste pas pour le test suivant : chacun part d'un cours sans
	// exception.
	afterEach(async () => {
		await maintenance((tx) =>
			tx.execute(sql`delete from "session_exception" where "course_id" = ${atelier}`)
		);
	});

	afterAll(async () => {
		await journal?.close();
	});

	it('refuses to cancel on such a day, says so above the programme in each language, and writes nothing, not even the journal', async () => {
		const journalAvant = await lignesDuJournal();
		try {
			for (const langue of LANGUES) {
				await poserLangueDuCompte(RESPONSABLE_ATELIER, langue);
				const reponse = await postForm(
					'/?/annuler',
					{ courseId: atelier, date: sansSeance },
					cookie
				);
				expect(reponse.status, langue).toBe(400);
				const html = await reponse.text();
				expect(alerte(html), langue).toBe(
					PAS_DE_SEANCE[langue](ATELIER, dateLue(langue, sansSeance))
				);
				expect(html.indexOf('role="alert"'), langue).toBeLessThan(html.indexOf('id="jour-'));
				expect(section(html, 'message-titre'), langue).toBe('');
				expect(
					optionsDesSeances(html).filter((options) => options.ouvert),
					langue
				).toEqual([]);
				// Le titre, saisi par une personne, est isolé dans la phrase (ADR 0007).
				const phrase = html.match(/<p\b[^>]*role="alert"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
				expect(
					[...phrase.matchAll(/<bdi\b[^>]*>([\s\S]*?)<\/bdi>/g)].map((isole) =>
						decode(isole[1] ?? '')
					),
					langue
				).toEqual([ATELIER]);
			}
		} finally {
			await poserLangueDuCompte(RESPONSABLE_ATELIER, 'fr');
		}
		expect(await exceptionsDuCours()).toEqual([]);
		expect(await lignesDuJournal()).toBe(journalAvant);
	});

	it('refuses to move a session from such a day, says so above the programme, and writes nothing', async () => {
		const journalAvant = await lignesDuJournal();
		const reponse = await postForm(
			'/?/deplacer',
			{ courseId: atelier, date: sansSeance, toDate: jour(3), toStart: '18:00' },
			cookie
		);
		expect(reponse.status).toBe(400);
		const html = await reponse.text();
		expect(alerte(html)).toBe(PAS_DE_SEANCE.fr(ATELIER, dateLue('fr', sansSeance)));
		expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf('id="jour-'));
		expect(optionsDesSeances(html).filter((options) => options.ouvert)).toEqual([]);
		expect(await exceptionsDuCours()).toEqual([]);
		expect(await lignesDuJournal()).toBe(journalAvant);
	});

	it('refuses a day after the last day of the course, even on its day of the week', async () => {
		for (const [action, envoi] of [
			['annuler', { courseId: atelier, date: apresLaFin }],
			['deplacer', { courseId: atelier, date: apresLaFin, toDate: jour(3), toStart: '18:00' }]
		] as const) {
			const reponse = await postForm(`/?/${action}`, envoi, cookie);
			expect(reponse.status, action).toBe(400);
			expect(alerte(await reponse.text()), action).toBe(
				PAS_DE_SEANCE.fr(ATELIER, dateLue('fr', apresLaFin))
			);
		}
		expect(await exceptionsDuCours()).toEqual([]);
	});

	it.each([
		['of the course', true],
		['of the whole organisation', false]
	] as const)(
		'refuses a day in a pause %s, in the seven days of the screen or after, and writes nothing, not even the journal',
		async (_pause, duCours) => {
			// Une pause retire ses séances de l'écran : le jour de la séance de cette semaine et celui de
			// la semaine suivante, qui s'annulent l'un et l'autre hors de la pause, n'en ont plus
			// (relecture du lot 3).
			const pause = newId();
			await maintenance((tx) =>
				tx.execute(sql`
					insert into "pause" ("id", "organization_id", "course_id", "from_date", "to_date",
						"reason")
					values (${pause}, ${organisation}, ${duCours ? atelier : null}, ${jour(0)}, ${jour(9)},
						'Vacances de l’atelier')
				`)
			);
			try {
				const journalAvant = await lignesDuJournal();
				for (const date of [seance, semaineSuivante]) {
					for (const [action, envoi] of [
						['annuler', { courseId: atelier, date }],
						['deplacer', { courseId: atelier, date, toDate: jour(3), toStart: '18:00' }]
					] as const) {
						const reponse = await postForm(`/?/${action}`, envoi, cookie);
						expect(reponse.status, `${action} ${date}`).toBe(400);
						expect(alerte(await reponse.text()), `${action} ${date}`).toBe(
							PAS_DE_SEANCE.fr(ATELIER, dateLue('fr', date))
						);
					}
				}
				expect(await exceptionsDuCours()).toEqual([]);
				expect(await lignesDuJournal()).toBe(journalAvant);
			} finally {
				await maintenance((tx) => tx.execute(sql`delete from "pause" where "id" = ${pause}`));
			}
		}
	);

	it('still cancels and moves a session after the seven days of the screen, the next week', async () => {
		const annule = await postForm(
			'/?/annuler',
			{ courseId: atelier, date: semaineSuivante },
			cookie
		);
		try {
			expect(annule.status).toBe(200);
			expect(await exception(atelier, semaineSuivante)).toEqual({
				kind: 'cancelled',
				to_date: null,
				to_start: null
			});
		} finally {
			await retablir(atelier, semaineSuivante, cookie);
		}
		const deplace = await postForm(
			'/?/deplacer',
			{ courseId: atelier, date: semaineSuivante, toDate: jour(9), toStart: '18:00' },
			cookie
		);
		try {
			expect(deplace.status).toBe(200);
			expect((await exception(atelier, semaineSuivante))?.to_date).toBe(jour(9));
		} finally {
			await retablir(atelier, semaineSuivante, cookie);
		}
	});

	it('refuses to cancel or move a session moved to that day, as a card left open, and keeps the move', async () => {
		// La séance de J+1 arrive au lendemain : l'écran la montre ce jour-là, « date exceptionnelle »,
		// avec « Rétablir ». Une annulation écrite sous ce jour-là, où le rythme n'a pas de séance, serait
		// ignorée par le calcul, et la séance aurait lieu quand même.
		expect(
			(
				await postForm(
					'/?/deplacer',
					{ courseId: atelier, date: seance, toDate: sansSeance, toStart: '20:00' },
					cookie
				)
			).status
		).toBe(200);
		try {
			const deplacement = await exceptionsDuCours();
			const journalAvant = await lignesDuJournal();
			for (const [action, envoi] of [
				['annuler', { courseId: atelier, date: sansSeance }],
				['deplacer', { courseId: atelier, date: sansSeance, toDate: jour(3), toStart: '18:00' }]
			] as const) {
				const reponse = await postForm(`/?/${action}`, envoi, cookie);
				expect(reponse.status, action).toBe(409);
				const html = await reponse.text();
				expect(alerte(html), action).toBe(CHANGEE.fr(ATELIER, dateLue('fr', sansSeance)));
				expect(section(html, 'message-titre'), action).toBe('');
			}
			expect(await exceptionsDuCours()).toEqual(deplacement);
			expect(await lignesDuJournal()).toBe(journalAvant);
		} finally {
			await retablir(atelier, seance, cookie);
		}
	});

	it('refuses to cancel or move a session on the day where it was moved then cancelled, and keeps the cancellation (étape 20)', async () => {
		// La séance de la semaine passée, déplacée au lendemain de celle de cette semaine, puis annulée
		// là : l'annulation garde le jour et l'heure d'arrivée (migration 0075), et l'écran la montre
		// ce jour-là, où le rythme n'a pas de séance. Comme une séance arrivée d'un autre jour, elle ne
		// s'annule ni ne se déplace sous ce jour-là : l'exception écrite serait ignorée par le calcul.
		const origine = jour(-6);
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "session_exception"
					("id", "organization_id", "course_id", "date", "kind", "to_date", "to_start")
				values (${newId()}, ${organisation}, ${atelier}, ${origine}, 'cancelled', ${sansSeance},
					'20:00')
			`)
		);
		const annulation = await exceptionsDuCours();
		expect(annulation).toEqual([{ date: origine, kind: 'cancelled', to_date: sansSeance }]);
		const journalAvant = await lignesDuJournal();
		for (const [action, envoi] of [
			['annuler', { courseId: atelier, date: sansSeance }],
			['deplacer', { courseId: atelier, date: sansSeance, toDate: jour(3), toStart: '18:00' }]
		] as const) {
			const reponse = await postForm(`/?/${action}`, envoi, cookie);
			expect(reponse.status, action).toBe(409);
			const html = await reponse.text();
			expect(alerte(html), action).toBe(CHANGEE.fr(ATELIER, dateLue('fr', sansSeance)));
			expect(section(html, 'message-titre'), action).toBe('');
		}
		expect(await exceptionsDuCours()).toEqual(annulation);
		expect(await lignesDuJournal()).toBe(journalAvant);
	});

	it('answers « Rétablir » on a day without a session nor a change with a refusal, and writes nothing, not even the journal', async () => {
		// Il n'y a rien à rétablir ce jour-là : rien ne s'écrit (étape 19, lot 1), ni dans la table des
		// exceptions, ni au journal.
		const journalAvant = await lignesDuJournal();
		const reponse = await postForm('/?/retablir', { courseId: atelier, date: sansSeance }, cookie);
		expect(reponse.status).toBe(409);
		expect(alerte(await reponse.text())).toBe(DEJA_RETABLIE.fr(ATELIER, dateLue('fr', sansSeance)));
		expect(await exceptionsDuCours()).toEqual([]);
		expect(await lignesDuJournal()).toBe(journalAvant);
	});
});

describe('C2 : une séance déplacée dont la date prévue est passée (étape 20)', () => {
	// Décision du chef de projet : « Rétablir » ramenait la séance à sa date prévue, déjà passée, et la
	// faisait disparaître de l'écran et de la page publique sans message à envoyer. Sur la carte d'une
	// séance déplacée dont la date prévue est passée, strictement avant aujourd'hui, « Rétablir »
	// disparaît et l'action le refuse ; la carte propose « Annuler cette séance », derrière ses options
	// fermées, avec son aide et le message à copier, qui nomme la nouvelle date et la nouvelle heure.
	// La séance annulée reste sur sa nouvelle date, annulée, sans « Rétablir ». Une carte déplacée dont
	// la date prévue est aujourd'hui ou plus tard garde « Rétablir » seul. Déplacer une séance dont la
	// date prévue est passée est refusé, comme l'annuler.

	/** Le résumé des options de cette carte, qui ne proposent que l'annulation. */
	const REPLI: Record<Langue, string> = {
		fr: 'Annuler',
		de: 'Absagen',
		it: 'Annulla',
		en: 'Cancel',
		ar: 'إلغاء'
	};
	/** L'aide sous ce résumé : la date prévue est passée, et une séance annulée ne se rétablit pas. */
	const AIDE: Record<Langue, string> = {
		fr: 'Sa date prévue est déjà passée : la séance ne peut plus avoir lieu à cette date. Une fois annulée, elle ne pourra pas être rétablie.',
		de: 'Das geplante Datum ist schon vorbei: Der Termin kann nicht mehr an diesem Datum stattfinden. Wenn Sie ihn absagen, können Sie ihn danach nicht wiederherstellen.',
		it: 'La data prevista è già passata: la lezione non può più tenersi in quella data. Una volta annullata, non potrai ripristinarla.',
		en: 'Its planned date has already passed: the session can no longer take place on that date. Once cancelled, it cannot be restored.',
		ar: 'التاريخ المقرّر لهذه الحصة قد مضى: لم يعد من الممكن أن تُقام فيه. وإذا ألغيتها، فلن يمكنك استعادتها بعد ذلك.'
	};
	/** Le bouton, celui de l'annulation de toute séance (`cancelButton`). */
	const ANNULER: Record<Langue, string> = {
		fr: 'Annuler cette séance',
		de: 'Diesen Termin absagen',
		it: 'Annulla questa lezione',
		en: 'Cancel this session',
		ar: 'إلغاء هذه الحصة'
	};
	/** Le refus de « Rétablir » vers une date prévue passée : il nomme la séance, et cette date. */
	const DATE_PREVUE_PASSEE: Record<Langue, PhraseNommee> = {
		fr: (titre, date) =>
			`La séance « ${titre} » du ${date} ne peut plus être rétablie : cette date est passée. Rien n’a été enregistré. Le programme ci-dessous est à jour.`,
		de: (titre, date) =>
			`Der Termin «${titre}» vom ${date}, kann nicht mehr wiederhergestellt werden: Dieses Datum ist schon vorbei. Es wurde nichts gespeichert. Das Programm unten ist aktuell.`,
		it: (titre, date) =>
			`La lezione «${titre}» di ${date} non può più essere ripristinata: questa data è già passata. Non è stato salvato niente. Il programma qui sotto è aggiornato.`,
		en: (titre, date) =>
			`The ‘${titre}’ session on ${date} can no longer be restored: that date has already passed. Nothing has been saved. The programme below shows the latest changes.`,
		ar: (titre, date) =>
			`لم يعد من الممكن استعادة حصة «${titre}» يوم ${date}: هذا التاريخ قد مضى. لم يُحفظ أي شيء. برنامجك المعروض أدناه محدَّث.`
	};
	/** Le refus d'une annulation de ce genre quand la date prévue n'est pas passée : aucune carte ne l'envoie. */
	const PAS_ENCORE_PASSEE: Record<Langue, string> = {
		fr: 'La date prévue de cette séance n’est pas encore passée : « Rétablir la séance » la remet à cette date. Rien n’a été enregistré.',
		de: 'Das geplante Datum dieses Termins ist noch nicht vorbei: Mit «Termin wiederherstellen» findet er wieder an diesem Datum statt. Es wurde nichts gespeichert.',
		it: 'La data prevista di questa lezione non è ancora passata: «Ripristina la lezione» la riporta a quella data. Non è stato salvato niente.',
		en: 'The planned date of this session has not passed yet: ‘Restore the session’ puts it back on that date. Nothing has been saved.',
		ar: 'لم يمضِ التاريخ المقرّر لهذه الحصة بعد: زر «استعادة الحصة» يعيدها إليه. لم يُحفظ أي شيء.'
	};

	const organisation = newId();
	const RESPONSABLE_C2 = 'avenir-c2@example.test';
	const utilisateur = newId();
	/** Un cours chaque jour à 18:00, écrit en français. */
	const lecture = newId();
	const LECTURE = 'Lecture du soir';
	/** La séance d'il y a trois jours, déplacée à après-demain, 20:30 : sa date prévue est passée. */
	const passee = jour(-3);
	const arrivee = jour(2);
	let deplacement = '';
	/** Une éditrice de la même organisation : l'ADR 0046 lui ouvre ce geste, comme au responsable. */
	const EDITRICE_C2 = 'avenir-c2-editrice@example.test';
	const editrice = newId();
	/**
	 * Le refus d'un formulaire qui n'envoie pas ce que la carte montrait, ou qui envoie une date ou
	 * une heure illisible : aucune carte ne l'envoie (`unreadableDate`).
	 */
	const DATE_ILLISIBLE: Record<Langue, string> = {
		fr: 'La date de cette séance n’a pas pu être lue. Rechargez la page, puis recommencez.',
		de: 'Das Datum dieses Termins konnte nicht gelesen werden. Laden Sie die Seite neu und versuchen Sie es noch einmal.',
		it: 'Non è stato possibile leggere la data di questa lezione. Ricarica la pagina e riprova.',
		en: 'The date of this session could not be read. Reload the page and try again.',
		ar: 'تعذّرت قراءة تاريخ هذه الحصة. أعد تحميل الصفحة، ثم حاول مرة أخرى.'
	};
	let cookie: string;
	let journal: DatabaseHandle;

	async function lignesDuJournal(): Promise<number> {
		return withOrg(journal.db, { organizationId: organisation, userId: utilisateur }, async (tx) =>
			lignes<{ n: number }>(await tx.execute(sql`select count(*)::int as n from "audit_log"`))
		).then((trouve) => trouve[0]?.n ?? 0);
	}

	/** La dernière entrée du journal : son action, et ce qu'elle garde d'avant et d'après. */
	async function derniereEntree(): Promise<{ action: string; before: unknown; after: unknown }> {
		return withOrg(journal.db, { organizationId: organisation, userId: utilisateur }, async (tx) =>
			lignes<{ action: string; before: unknown; after: unknown }>(
				await tx.execute(sql`
					select "action", "before", "after" from "audit_log" order by "created_at" desc, "id" desc
					limit 1
				`)
			)
		).then((trouve) => trouve[0] ?? { action: '', before: null, after: null });
	}

	/** Toutes les exceptions du cours, avec leur identifiant : un refus n'en écrit aucune. */
	async function exceptionsDuCours(): Promise<unknown[]> {
		return maintenance(async (tx) =>
			lignes(
				await tx.execute(sql`
					select "id", "date"::text, "kind", "to_date"::text, left("to_start"::text, 5) as to_start
					from "session_exception" where "course_id" = ${lecture} order by "date"
				`)
			)
		);
	}

	/** Pose un déplacement, comme l'écran l'aurait écrit, et rend son identifiant. */
	async function poserDeplacement(date: IsoDate, vers: IsoDate): Promise<string> {
		const id = newId();
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "session_exception" ("id", "organization_id", "course_id", "date", "kind",
					"to_date", "to_start", "created_by")
				values (${id}, ${organisation}, ${lecture}, ${date}, 'moved', ${vers}, '20:30', ${utilisateur})
			`)
		);
		return id;
	}

	/**
	 * Pose une annulation qui garde où la séance avait été déplacée, comme `cancelMoved` l'écrit, et
	 * rend son identifiant.
	 */
	async function poserAnnulationDeplacee(date: IsoDate, vers: IsoDate): Promise<string> {
		const id = newId();
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "session_exception" ("id", "organization_id", "course_id", "date", "kind",
					"to_date", "to_start", "created_by")
				values (${id}, ${organisation}, ${lecture}, ${date}, 'cancelled', ${vers}, '20:30',
					${utilisateur})
			`)
		);
		return id;
	}

	/** Retire les exceptions du cours à ces dates : chaque test rend le cours tel qu'il l'a trouvé. */
	async function effacer(...dates: IsoDate[]): Promise<void> {
		for (const date of dates) {
			await maintenance((tx) =>
				tx.execute(sql`
					delete from "session_exception" where "course_id" = ${lecture} and "date" = ${date}
				`)
			);
		}
	}

	/** Le formulaire que la carte d'un déplacement envoie, tel qu'elle le montre. */
	function formulaireDe(date: IsoDate, id: string, vers: IsoDate): Record<string, string> {
		return { courseId: lecture, date, shownId: id, shownToDate: vers, shownToStart: '20:30' };
	}

	/** L'auteur de la dernière entrée du journal. */
	async function auteurDeLaDerniereEntree(): Promise<string> {
		return withOrg(journal.db, { organizationId: organisation, userId: utilisateur }, async (tx) =>
			lignes<{ actor_id: string }>(
				await tx.execute(sql`
					select "actor_id" from "audit_log" order by "created_at" desc, "id" desc limit 1
				`)
			)
		).then((trouve) => trouve[0]?.actor_id ?? '');
	}

	async function pageEn(langue: Langue): Promise<string> {
		await maintenance((tx) =>
			tx.execute(sql`update "user" set "language" = ${langue} where "id" = ${utilisateur}`)
		);
		return (await get('/', cookie)).text();
	}

	beforeAll(async () => {
		journal = createDatabase({ role: 'app', overrides: { database: testDatabase } });
		await maintenance(async (tx) => {
			await tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
					"enabled_language", "prayer_module", "greeting")
				values (${organisation}, 'a-venir-c2', 'Association de la lecture', ${FUSEAU}, 'fr',
					array['fr','de','it','en','ar'], false, ${ACCUEIL})
			`);
			for (const [id, email, role] of [
				[utilisateur, RESPONSABLE_C2, 'org_admin'],
				[editrice, EDITRICE_C2, 'editor']
			] as const) {
				await tx.execute(sql`
					insert into "user" ("id", "email", "email_verified", "language")
					values (${id}, ${email}, true, 'fr')
				`);
				await tx.execute(sql`
					insert into "membership" ("id", "organization_id", "user_id", "role")
					values (${newId()}, ${organisation}, ${id}, ${role})
				`);
				await tx.execute(conditionsAcceptees(organisation, id));
			}
			await tx.execute(sql`
				insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
					"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
					"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "starts_on")
				values (${lecture}, ${organisation}, 'published', 'adults', array['fr'], 'fr', 'weekly',
					array[1,2,3,4,5,6,7]::smallint[], 1, ${jour(-30)}, 'fixed', '18:00', '19:30',
					${jour(-30)})
			`);
			await tx.execute(sql`
				insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
				values (${newId()}, ${organisation}, ${lecture}, 'fr', ${LECTURE})
			`);
		});
		cookie = await signIn(RESPONSABLE_C2);
		deplacement = await poserDeplacement(passee, arrivee);
	});

	afterAll(async () => {
		await journal?.close();
	});

	it('gives the card of a session moved from a past date « Annuler cette séance », behind closed options, and no « Rétablir », in each language', async () => {
		for (const langue of LANGUES) {
			const html = await pageEn(langue);
			const carteDArrivee = carte(html, arrivee, LECTURE, 'moved_here');
			expect(carteDArrivee, langue).not.toBe('');
			expect(formulaireDeRetablissement(carteDArrivee), langue).toBeNull();
			const options = blocsDetails(carteDArrivee);
			expect(options, langue).toHaveLength(1);
			expect(options[0]?.ouvert, langue).toBe(false);
			expect(options[0]?.balise, langue).toMatch(/\bclass="options\b/);
			expect(options[0]?.resume, langue).toBe(REPLI[langue]);
			const contenu = options[0]?.contenu ?? '';
			expect(
				texte(contenu.match(/<p\b[^>]*class="aide[^"]*"[^>]*>[\s\S]*?<\/p>/)?.[0] ?? ''),
				langue
			).toBe(AIDE[langue]);
			const bouton = contenu.match(/<button\b[^>]*>[\s\S]*?<\/button>/)?.[0] ?? '';
			expect(texte(bouton), langue).toBe(ANNULER[langue]);
			expect(bouton, langue).toMatch(/\bclass="danger\b/);
			// Le formulaire envoie ce que la carte montrait, comme « Rétablir » : ce déplacement-là.
			expect(formulaireDAnnulationDeplacee(contenu), langue).toEqual({
				courseId: lecture,
				date: passee,
				shownId: deplacement,
				shownToDate: arrivee,
				shownToStart: '20:30'
			});
		}
	});

	it('describes « Annuler cette séance » by its help, which says it cannot be undone, in each language', async () => {
		// Au clavier, la personne passe du résumé au bouton : sans ce lien, le lecteur d'écran ne lisait
		// pas l'aide, et la personne annulait sans savoir que c'est définitif.
		for (const langue of LANGUES) {
			const html = await pageEn(langue);
			const contenu = blocsDetails(carte(html, arrivee, LECTURE, 'moved_here'))[0]?.contenu ?? '';
			const bouton = attributs(contenu.match(/<button\b[^>]*>/)?.[0] ?? '');
			const decrit = bouton['aria-describedby'] ?? '';
			expect(decrit, langue).not.toBe('');
			expect(html.split(`id="${decrit}"`), langue).toHaveLength(2);
			const aide = contenu.match(new RegExp(`<p\\b[^>]*\\sid="${decrit}"[^>]*>([\\s\\S]*?)</p>`));
			expect(texte(aide?.[1] ?? ''), langue).toBe(AIDE[langue]);
		}
	});

	it('keeps « Rétablir » alone on the card of a session moved from today or a later date', async () => {
		const aujourdhui = await poserDeplacement(today, jour(4));
		const demain = await poserDeplacement(jour(1), jour(5));
		try {
			const html = await pageEn('fr');
			for (const [depuis, vers, id] of [
				[today, jour(4), aujourdhui],
				[jour(1), jour(5), demain]
			] as const) {
				const carteDArrivee = carte(html, vers, LECTURE, 'moved_here');
				expect(formulaireDeRetablissement(carteDArrivee), depuis).toEqual({
					courseId: lecture,
					date: depuis,
					shownId: id,
					shownToDate: vers,
					shownToStart: '20:30'
				});
				expect(formulaireDAnnulationDeplacee(carteDArrivee), depuis).toBeNull();
				expect(blocsDetails(carteDArrivee), depuis).toEqual([]);
			}
		} finally {
			await maintenance((tx) =>
				tx.execute(sql`
					delete from "session_exception"
					where "course_id" = ${lecture} and "date" in (${today}, ${jour(1)})
				`)
			);
		}
	});

	it('refuses « Rétablir » on a past planned date, says so above the programme in each language, and writes nothing, not even the journal', async () => {
		const avant = await exceptionsDuCours();
		const journalAvant = await lignesDuJournal();
		// La carte telle qu'une page ouverte avant-hier la montrait, et le même formulaire écrit à la
		// main sans ce qu'il montrait : « Rétablir » les ramenait à une date passée.
		const envois: Record<string, string>[] = [
			{
				courseId: lecture,
				date: passee,
				shownId: deplacement,
				shownToDate: arrivee,
				shownToStart: '20:30'
			},
			{ courseId: lecture, date: passee }
		];
		for (const langue of LANGUES) {
			await pageEn(langue);
			for (const envoi of envois) {
				const reponse = await postForm('/?/retablir', envoi, cookie);
				expect(reponse.status, langue).toBe(400);
				const html = await reponse.text();
				expect(alerte(html), langue).toBe(
					DATE_PREVUE_PASSEE[langue](LECTURE, dateLue(langue, passee))
				);
				expect(html.indexOf('role="alert"'), langue).toBeLessThan(html.indexOf('id="jour-'));
				expect(section(html, 'message-titre'), langue).toBe('');
			}
		}
		expect(await exceptionsDuCours()).toEqual(avant);
		expect(await lignesDuJournal()).toBe(journalAvant);
	});

	it('refuses a hand-written cancellation of this kind when the planned date is not past, or when the new date is past, in each language, and writes nothing', async () => {
		const aujourdhui = await poserDeplacement(today, jour(4));
		const hier = await poserDeplacement(jour(-5), jour(-1));
		try {
			const avant = await exceptionsDuCours();
			const journalAvant = await lignesDuJournal();
			for (const langue of LANGUES) {
				await pageEn(langue);
				for (const [envoi, phrase] of [
					[
						{
							courseId: lecture,
							date: today,
							shownId: aujourdhui,
							shownToDate: jour(4),
							shownToStart: '20:30'
						},
						PAS_ENCORE_PASSEE[langue]
					],
					[
						{
							courseId: lecture,
							date: jour(-5),
							shownId: hier,
							shownToDate: jour(-1),
							shownToStart: '20:30'
						},
						SEANCE_PASSEE[langue]
					]
				] as const) {
					const reponse = await postForm('/?/annulerDeplacee', envoi, cookie);
					expect(reponse.status, `${langue} ${envoi.date}`).toBe(400);
					const html = await reponse.text();
					expect(alerte(html), `${langue} ${envoi.date}`).toBe(phrase);
					expect(section(html, 'message-titre'), `${langue} ${envoi.date}`).toBe('');
				}
			}
			expect(await exceptionsDuCours()).toEqual(avant);
			expect(await lignesDuJournal()).toBe(journalAvant);
		} finally {
			await maintenance((tx) =>
				tx.execute(sql`
					delete from "session_exception"
					where "course_id" = ${lecture} and "date" in (${today}, ${jour(-5)})
				`)
			);
		}
	});

	it('refuses to move a session from a past planned date, as it refuses to cancel it, in each language, and writes nothing', async () => {
		const avant = await exceptionsDuCours();
		const journalAvant = await lignesDuJournal();
		for (const langue of LANGUES) {
			await pageEn(langue);
			const reponse = await postForm(
				'/?/deplacer',
				{ courseId: lecture, date: jour(-2), toDate: jour(4), toStart: '18:00' },
				cookie
			);
			expect(reponse.status, langue).toBe(400);
			const html = await reponse.text();
			expect(alerte(html), langue).toBe(SEANCE_PASSEE[langue]);
			expect(section(html, 'message-titre'), langue).toBe('');
		}
		expect(await exceptionsDuCours()).toEqual(avant);
		expect(await lignesDuJournal()).toBe(journalAvant);
	});

	it('restores a session moved from today, from the form of its card: the bound is strictly before today', async () => {
		const vers = jour(4);
		const id = await poserDeplacement(today, vers);
		try {
			const envoi = formulaireDeRetablissement(
				carte(await pageEn('fr'), vers, LECTURE, 'moved_here')
			);
			expect(envoi).toEqual(formulaireDe(today, id, vers));
			const journalAvant = await lignesDuJournal();
			const reponse = await postForm('/?/retablir', envoi ?? {}, cookie);
			expect(reponse.status).toBe(200);
			expect(await exception(lecture, today)).toBeUndefined();
			expect(await lignesDuJournal()).toBe(journalAvant + 1);
		} finally {
			await effacer(today);
		}
	});

	it('cancels a session moved from a past date to today, from the form of its card: today has not passed', async () => {
		const depuis = jour(-2);
		const id = await poserDeplacement(depuis, today);
		try {
			const envoi = formulaireDAnnulationDeplacee(
				carte(await pageEn('fr'), today, LECTURE, 'moved_here')
			);
			expect(envoi).toEqual(formulaireDe(depuis, id, today));
			const reponse = await postForm('/?/annulerDeplacee', envoi ?? {}, cookie);
			expect(reponse.status).toBe(200);
			expect(await exception(lecture, depuis)).toEqual({
				kind: 'cancelled',
				to_date: today,
				to_start: '20:30'
			});
		} finally {
			await effacer(depuis);
		}
	});

	it('refuses the form of a card that showed another change, another exception, another new date or another new time, in each language, and writes nothing', async () => {
		// Une page restée ouverte : la séance a été rétablie puis déplacée de nouveau, ou déplacée
		// ailleurs, depuis. Le déplacement en place n'est pas celui que la carte montrait.
		const depuis = jour(-6);
		const vers = jour(5);
		const juste = formulaireDe(depuis, await poserDeplacement(depuis, vers), vers);
		const autre = await poserDeplacement(jour(-7), jour(6));
		try {
			const avant = await exceptionsDuCours();
			const journalAvant = await lignesDuJournal();
			for (const langue of LANGUES) {
				await pageEn(langue);
				const envois: [string, Record<string, string>][] = [
					['une autre exception', { ...juste, shownId: autre }],
					['un autre jour', { ...juste, shownToDate: jour(6) }],
					['une autre heure', { ...juste, shownToStart: '21:00' }]
				];
				for (const [quoi, envoi] of envois) {
					const reponse = await postForm('/?/annulerDeplacee', envoi, cookie);
					expect(reponse.status, `${langue} ${quoi}`).toBe(409);
					const html = await reponse.text();
					// Le refus nomme la séance par la date que la carte montrait.
					expect(alerte(html), `${langue} ${quoi}`).toBe(
						CHANGEE[langue](LECTURE, dateLue(langue, envoi['shownToDate'] as IsoDate))
					);
					expect(section(html, 'message-titre'), `${langue} ${quoi}`).toBe('');
				}
			}
			expect(await exceptionsDuCours()).toEqual(avant);
			expect(await lignesDuJournal()).toBe(journalAvant);
		} finally {
			await effacer(depuis, jour(-7));
			await pageEn('fr');
		}
	});

	it('answers a hand-written form that sends the cancellation itself as already cancelled, gives the message, and writes nothing', async () => {
		// L'annulation garde le jour et l'heure où la séance avait été déplacée. Un formulaire écrit à
		// la main qui la renvoie telle qu'elle est n'a plus rien à annuler : il ne la remplace pas par
		// une autre, et reçoit le message, comme une seconde annulation (D4).
		const depuis = jour(-6);
		const vers = jour(5);
		const envoi = formulaireDe(depuis, await poserAnnulationDeplacee(depuis, vers), vers);
		try {
			const avant = await exceptionsDuCours();
			const journalAvant = await lignesDuJournal();
			for (const langue of LANGUES) {
				await pageEn(langue);
				const reponse = await postForm('/?/annulerDeplacee', envoi, cookie);
				expect(reponse.status, langue).toBe(409);
				const html = await reponse.text();
				expect(alerte(html), langue).toBe(DEJA_ANNULEE[langue](LECTURE, dateLue(langue, vers)));
				expect(messages(section(html, 'message-titre')), langue).toHaveLength(5);
			}
			expect(await exceptionsDuCours()).toEqual(avant);
			expect(await lignesDuJournal()).toBe(journalAvant);
		} finally {
			await effacer(depuis);
			await pageEn('fr');
		}
	});

	it('answers a course of another organisation, or one that does not exist, as a session that no longer exists, in each language, and writes nothing', async () => {
		// Le cours de l'autre organisation a bien un déplacement à cette date, que le formulaire montre
		// tel qu'il est : seule l'organisation l'écarte.
		const depuis = jour(-9);
		const vers = jour(4);
		const ailleurs = newId();
		const exceptionsDuTajwid = () =>
			maintenance(async (tx) =>
				lignes(
					await tx.execute(sql`
						select "id", "date"::text, "kind" from "session_exception"
						where "course_id" = ${tajwid} order by "date"
					`)
				)
			);
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "session_exception" ("id", "organization_id", "course_id", "date", "kind",
					"to_date", "to_start", "created_by")
				values (${ailleurs}, ${organisationB}, ${tajwid}, ${depuis}, 'moved', ${vers}, '20:30',
					${ids[RESPONSABLE_B] ?? ''})
			`)
		);
		try {
			const avant = await exceptionsDuCours();
			const avantAilleurs = await exceptionsDuTajwid();
			const journalAvant = await lignesDuJournal();
			for (const langue of LANGUES) {
				await pageEn(langue);
				for (const [quoi, envoi] of [
					[
						'une autre organisation',
						{
							courseId: tajwid,
							date: depuis,
							shownId: ailleurs,
							shownToDate: vers,
							shownToStart: '20:30'
						}
					],
					[
						'un cours inconnu',
						{
							courseId: newId(),
							date: depuis,
							shownId: newId(),
							shownToDate: vers,
							shownToStart: '20:30'
						}
					]
				] as const) {
					const reponse = await postForm('/?/annulerDeplacee', envoi, cookie);
					expect(reponse.status, `${langue} ${quoi}`).toBe(404);
					const html = await reponse.text();
					expect(alerte(html), `${langue} ${quoi}`).toBe(SEANCE_DISPARUE[langue]);
					expect(section(html, 'message-titre'), `${langue} ${quoi}`).toBe('');
				}
			}
			expect(await exceptionsDuCours()).toEqual(avant);
			expect(await exceptionsDuTajwid()).toEqual(avantAilleurs);
			expect(await lignesDuJournal()).toBe(journalAvant);
		} finally {
			await maintenance((tx) =>
				tx.execute(sql`delete from "session_exception" where "id" = ${ailleurs}`)
			);
			await pageEn('fr');
		}
	});

	it('refuses a form that does not send what the card showed, or sends a date or a time that cannot be read, in each language, and writes nothing', async () => {
		const depuis = jour(-6);
		const vers = jour(5);
		const juste = formulaireDe(depuis, await poserDeplacement(depuis, vers), vers);
		try {
			const avant = await exceptionsDuCours();
			const journalAvant = await lignesDuJournal();
			for (const langue of LANGUES) {
				await pageEn(langue);
				for (const [quoi, envoi] of [
					['sans ce que la carte montrait', { courseId: lecture, date: depuis }],
					['une heure impossible', { ...juste, shownToStart: '25:99' }],
					['sans heure', { ...juste, shownToStart: '' }],
					['un jour impossible', { ...juste, shownToDate: '2026-02-30' }],
					['une date prévue hors de 1970 à 2100', { ...juste, date: '0000-01-01' }]
				] as const) {
					const reponse = await postForm('/?/annulerDeplacee', envoi, cookie);
					expect(reponse.status, `${langue} ${quoi}`).toBe(400);
					const html = await reponse.text();
					expect(alerte(html), `${langue} ${quoi}`).toBe(DATE_ILLISIBLE[langue]);
					expect(section(html, 'message-titre'), `${langue} ${quoi}`).toBe('');
				}
			}
			expect(await exceptionsDuCours()).toEqual(avant);
			expect(await lignesDuJournal()).toBe(journalAvant);
		} finally {
			await effacer(depuis);
			await pageEn('fr');
		}
	});

	it('lets an editor cancel it, as ADR 0046 opens this gesture to her, and writes the journal in her name', async () => {
		const depuis = jour(-6);
		const vers = jour(5);
		const id = await poserDeplacement(depuis, vers);
		try {
			const cookieDeLEditrice = await signIn(EDITRICE_C2);
			const html = await (await get('/', cookieDeLEditrice)).text();
			const envoi = formulaireDAnnulationDeplacee(carte(html, vers, LECTURE, 'moved_here'));
			expect(envoi).toEqual(formulaireDe(depuis, id, vers));
			const journalAvant = await lignesDuJournal();
			const reponse = await postForm('/?/annulerDeplacee', envoi ?? {}, cookieDeLEditrice);
			expect(reponse.status).toBe(200);
			expect(messages(section(await reponse.text(), 'message-titre'))).toHaveLength(5);
			expect(await exception(lecture, depuis)).toEqual({
				kind: 'cancelled',
				to_date: vers,
				to_start: '20:30'
			});
			expect(await lignesDuJournal()).toBe(journalAvant + 1);
			expect(await derniereEntree()).toEqual({
				action: 'exception.cancel',
				before: { date: depuis, kind: 'moved', toDate: vers, toStart: '20:30' },
				after: { date: depuis, kind: 'cancelled', toDate: vers, toStart: '20:30' }
			});
			expect(await auteurDeLaDerniereEntree()).toBe(editrice);
		} finally {
			await effacer(depuis);
		}
	});

	it('cancels it at its new date, keeps where it had moved, gives the message with the new date and time in each published language, and writes the journal once', async () => {
		const html = await pageEn('fr');
		const envoi = formulaireDAnnulationDeplacee(carte(html, arrivee, LECTURE, 'moved_here')) ?? {};
		const journalAvant = await lignesDuJournal();
		const reponse = await postForm('/?/annulerDeplacee', envoi, cookie);
		expect(reponse.status).toBe(200);
		const apres = await reponse.text();
		// Une nouvelle exception, qui garde le jour et l'heure où la séance avait été déplacée.
		const [annulation] = (await exceptionsDuCours()) as {
			id: string;
			date: string;
			kind: string;
			to_date: string;
			to_start: string;
		}[];
		expect(annulation).toMatchObject({
			date: passee,
			kind: 'cancelled',
			to_date: arrivee,
			to_start: '20:30'
		});
		expect(annulation?.id).not.toBe(deplacement);
		expect(await lignesDuJournal()).toBe(journalAvant + 1);
		expect(await derniereEntree()).toEqual({
			action: 'exception.cancel',
			before: { date: passee, kind: 'moved', toDate: arrivee, toStart: '20:30' },
			after: { date: passee, kind: 'cancelled', toDate: arrivee, toStart: '20:30' }
		});
		// La page dit que c'est fait, et donne le message dans chaque langue publiée, le français
		// d'abord : il nomme la nouvelle date et la nouvelle heure, celles que la communauté attend.
		expect(texte(section(apres, 'message-titre').match(/^[\s\S]*?<\/h2>/)?.[0] ?? '')).toBe(
			'La séance est annulée.'
		);
		const ecrits = messages(section(apres, 'message-titre'));
		expect(ecrits.map((message) => message.langue)).toEqual(['fr', 'de', 'it', 'en', 'ar']);
		expect(ecrits[0]?.texte).toBe(
			[
				`${ACCUEIL},`,
				'',
				`Le cours « ${LECTURE} » du ${dateLue('fr', arrivee)} à 20:30 est annulé.`,
				'Les autres séances ont lieu normalement.'
			].join('\n')
		);
		expect(ecrits[4]?.texte).toContain(`يوم ${dateLue('ar', arrivee)} في الساعة 20:30.`);
		// La séance reste sur sa nouvelle date, annulée, sans rien à rétablir ni à annuler.
		expect(carte(apres, arrivee, LECTURE, 'moved_here')).toBe('');
		const annulee = carte(apres, arrivee, LECTURE, 'cancelled');
		expect(annulee).not.toBe('');
		expect(formulaireDeRetablissement(annulee)).toBeNull();
		expect(formulaireDAnnulationDeplacee(annulee)).toBeNull();
		expect(blocsDetails(annulee)).toEqual([]);
	});

	it('answers a second cancellation with the same message, above the programme, and writes nothing (D4)', async () => {
		// Depuis une page restée ouverte, ou par une autre personne : la séance est déjà annulée, et la
		// personne ne sait pas si la communauté a été prévenue. Le test pose son propre déplacement et
		// l'annule d'abord : il ne dépend d'aucun autre, ni de leur ordre.
		const depuis = jour(-4);
		const vers = jour(3);
		const envoi = formulaireDe(depuis, await poserDeplacement(depuis, vers), vers);
		try {
			await pageEn('fr');
			const premiere = await postForm('/?/annulerDeplacee', envoi, cookie);
			expect(premiere.status).toBe(200);
			const attendus = messages(section(await premiere.text(), 'message-titre')).map(
				(message) => message.texte
			);
			expect(attendus).toHaveLength(5);
			const annulation = await exceptionsDuCours();
			const journalAvant = await lignesDuJournal();
			for (const langue of LANGUES) {
				await pageEn(langue);
				const reponse = await postForm('/?/annulerDeplacee', envoi, cookie);
				expect(reponse.status, langue).toBe(409);
				const html = await reponse.text();
				expect(alerte(html), langue).toBe(DEJA_ANNULEE[langue](LECTURE, dateLue(langue, vers)));
				expect(html.indexOf('role="alert"'), langue).toBeLessThan(html.indexOf('id="jour-'));
				expect(
					messages(section(html, 'message-titre')).map((message) => message.texte),
					langue
				).toEqual(attendus);
			}
			expect(await exceptionsDuCours()).toEqual(annulation);
			expect(await lignesDuJournal()).toBe(journalAvant);
		} finally {
			await effacer(depuis);
			await pageEn('fr');
		}
	});
});

describe('C2 : « aujourd’hui » est celui du fuseau de l’organisation (étape 20)', () => {
	// `pastOrigin`, `originNotPast` et `pastSession` comparent une date à aujourd'hui dans le fuseau
	// de l'organisation. Les autres organisations de ce fichier sont à Zurich, comme le poste : un
	// calcul fait dans le fuseau du poste, ou en UTC, y passait inaperçu. Celle-ci est dans un fuseau
	// dont la date, à l'heure du test, n'est pas celle du poste, ni celle d'UTC quand c'est possible :
	// Kiritimati (UTC+14) ou Pago Pago (UTC-11), l'un des deux convient à toute heure. Une séance
	// déplacée depuis la veille de ce fuseau a « Annuler cette séance », une séance déplacée depuis son
	// aujourd'hui garde « Rétablir », et les actions des deux écrans en jugent de même.
	const maintenant = new Date();
	const duPoste = todayInZone(Intl.DateTimeFormat().resolvedOptions().timeZone, maintenant);
	const enUtc = todayInZone('UTC', maintenant);
	const CANDIDATS = ['Pacific/Kiritimati', 'Pacific/Pago_Pago'] as const;
	const fuseau =
		CANDIDATS.find((candidat) => ![duPoste, enUtc].includes(todayInZone(candidat, maintenant))) ??
		CANDIDATS.find((candidat) => todayInZone(candidat, maintenant) !== duPoste) ??
		CANDIDATS[0];
	const aujourdhui = todayInZone(fuseau, maintenant);
	const hier = addDays(aujourdhui, -1);

	const organisation = newId();
	const RESPONSABLE_FUSEAU = 'avenir-fuseau@example.test';
	const utilisateur = newId();
	/** Un cours chaque jour à 18:00, et une session du vendredi. */
	const cours = newId();
	const COURS = 'Cours du lointain';
	const session = newId();
	let cookie: string;

	/** Pose un déplacement, comme les écrans l'auraient écrit, et rend son identifiant. */
	async function poserDeplacement(courseId: string, date: IsoDate, vers: IsoDate): Promise<string> {
		const id = newId();
		await maintenance((tx) =>
			tx.execute(sql`
				insert into "session_exception" ("id", "organization_id", "course_id", "date", "kind",
					"to_date", "to_start", "created_by")
				values (${id}, ${organisation}, ${courseId}, ${date}, 'moved', ${vers}, '20:30',
					${utilisateur})
			`)
		);
		return id;
	}

	/** Toutes les exceptions d'un cours, avec leur identifiant : un refus n'en écrit aucune. */
	async function exceptionsDe(courseId: string): Promise<unknown[]> {
		return maintenance(async (tx) =>
			lignes(
				await tx.execute(sql`
					select "id", "date"::text, "kind", "to_date"::text, left("to_start"::text, 5) as to_start
					from "session_exception" where "course_id" = ${courseId} order by "date"
				`)
			)
		);
	}

	async function effacer(): Promise<void> {
		await maintenance((tx) =>
			tx.execute(sql`delete from "session_exception" where "organization_id" = ${organisation}`)
		);
	}

	beforeAll(async () => {
		await maintenance(async (tx) => {
			await tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
					"enabled_language", "prayer_module", "greeting")
				values (${organisation}, 'a-venir-fuseau', 'Association du lointain', ${fuseau}, 'fr',
					array['fr'], true, ${ACCUEIL})
			`);
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified", "language")
				values (${utilisateur}, ${RESPONSABLE_FUSEAU}, true, 'fr')
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organisation}, ${utilisateur}, 'org_admin')
			`);
			await tx.execute(conditionsAcceptees(organisation, utilisateur));
			await tx.execute(sql`
				insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
					"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
					"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "starts_on")
				values (${cours}, ${organisation}, 'published', 'adults', array['fr'], 'fr', 'weekly',
					array[1,2,3,4,5,6,7]::smallint[], 1, ${addDays(aujourdhui, -30)}, 'fixed', '18:00',
					'19:30', ${addDays(aujourdhui, -30)})
			`);
			await tx.execute(sql`
				insert into "course" ("id", "organization_id", "kind", "jumua_order", "status",
					"audience", "teaching_language", "source_language", "recurrence_kind",
					"recurrence_weekday", "recurrence_interval", "recurrence_anchor_date", "timing_kind",
					"timing_start", "timing_end", "starts_on")
				values (${session}, ${organisation}, 'jumua', 1, 'published', 'open', array['ar'], 'fr',
					'weekly', array[5]::smallint[], 1, ${addDays(aujourdhui, -30)}, 'fixed', '12:10',
					'12:50', ${addDays(aujourdhui, -30)})
			`);
			for (const [id, titre] of [
				[cours, COURS],
				[session, 'Jumu’a du lointain']
			] as const) {
				await tx.execute(sql`
					insert into "course_translation" ("id", "organization_id", "course_id", "language",
						"title")
					values (${newId()}, ${organisation}, ${id}, 'fr', ${titre})
				`);
			}
		});
		cookie = await signIn(RESPONSABLE_FUSEAU);
	});

	it('gives « Annuler cette séance » to a session moved from yesterday in that zone, and « Rétablir » to one moved from today there', async () => {
		// Le fuseau n'a pas la date du poste : sans cela, le test ne prouverait rien.
		expect(aujourdhui, fuseau).not.toBe(duPoste);
		const depuisHier = await poserDeplacement(cours, hier, addDays(aujourdhui, 2));
		const depuisAujourdhui = await poserDeplacement(cours, aujourdhui, addDays(aujourdhui, 3));
		try {
			const html = await (await get('/', cookie)).text();
			const deLaVeille = carte(html, addDays(aujourdhui, 2), COURS, 'moved_here');
			expect(deLaVeille).not.toBe('');
			expect(formulaireDeRetablissement(deLaVeille)).toBeNull();
			expect(formulaireDAnnulationDeplacee(deLaVeille)?.['shownId']).toBe(depuisHier);
			const duJour = carte(html, addDays(aujourdhui, 3), COURS, 'moved_here');
			expect(formulaireDeRetablissement(duJour)?.['shownId']).toBe(depuisAujourdhui);
			expect(formulaireDAnnulationDeplacee(duJour)).toBeNull();
		} finally {
			await effacer();
		}
	});

	it.each(['/', '/vendredi'] as const)(
		'judges « Rétablir » and « Annuler cette séance » on %s by today in that zone',
		async (ecran) => {
			const courseId = ecran === '/' ? cours : session;
			const action = (nom: string) => `${ecran}?/${nom}`;
			const envoi = (date: IsoDate, id: string, vers: IsoDate) => ({
				courseId,
				date,
				shownId: id,
				shownToDate: vers,
				shownToStart: '20:30'
			});
			const deLaVeille = envoi(
				hier,
				await poserDeplacement(courseId, hier, addDays(aujourdhui, 2)),
				addDays(aujourdhui, 2)
			);
			const duJour = envoi(
				aujourdhui,
				await poserDeplacement(courseId, aujourdhui, addDays(aujourdhui, 3)),
				addDays(aujourdhui, 3)
			);
			try {
				const avant = await exceptionsDe(courseId);
				// Hier dans ce fuseau : « Rétablir » est refusé. Aujourd'hui : l'annulation de ce genre
				// est refusée, sa carte a « Rétablir ». Rien ne s'écrit.
				const refusDuRetablissement = await postForm(action('retablir'), deLaVeille, cookie);
				expect(refusDuRetablissement.status).toBe(400);
				expect(alerte(await refusDuRetablissement.text())).toContain('ne peut plus être rétablie');
				const refusDeLAnnulation = await postForm(action('annulerDeplacee'), duJour, cookie);
				expect(refusDeLAnnulation.status).toBe(400);
				expect(alerte(await refusDeLAnnulation.text())).toContain('n’est pas encore passé');
				expect(await exceptionsDe(courseId)).toEqual(avant);
				// Et chacun passe là où l'autre est refusé.
				expect((await postForm(action('retablir'), duJour, cookie)).status).toBe(200);
				expect((await postForm(action('annulerDeplacee'), deLaVeille, cookie)).status).toBe(200);
				expect(await exceptionsDe(courseId)).toMatchObject([
					{ date: hier, kind: 'cancelled', to_date: addDays(aujourdhui, 2), to_start: '20:30' }
				]);
			} finally {
				await effacer();
			}
		}
	);
});

describe('C4 : l’état d’une carte s’écrit avec son propre nom (étape 20)', () => {
	// Décision du chef de projet : l'état s'écrit avec son propre nom, jamais accordé à un titre
	// libre. Une séance est une fois où un cours a lieu, une session une fois où la prière du
	// vendredi a lieu : « Séance annulée », « Session annulée », « Séance déplacée au … à … »,
	// « Session déplacée au … à … », dans les cinq langues. L'italien et l'arabe accordaient au mot
	// « séance » l'état d'une session du vendredi, masculine dans ces deux langues.

	/** Chaque marque, par état et par sorte de carte, dans chaque langue. */
	const MARQUE: Record<
		'annulee' | 'deplacee',
		Record<'seance' | 'session', Record<Langue, string>>
	> = {
		annulee: {
			seance: {
				fr: 'Séance annulée',
				de: 'Termin abgesagt',
				it: 'Lezione annullata',
				en: 'Session cancelled',
				ar: 'حصة ملغاة'
			},
			session: {
				fr: 'Session annulée',
				de: 'Durchgang abgesagt',
				it: 'Turno annullato',
				en: 'Session cancelled',
				ar: 'موعد ملغى'
			}
		},
		deplacee: {
			seance: {
				fr: 'Séance déplacée',
				de: 'Termin verschoben',
				it: 'Lezione spostata',
				en: 'Session moved',
				ar: 'حصة منقولة'
			},
			session: {
				fr: 'Session déplacée',
				de: 'Durchgang verschoben',
				it: 'Turno spostato',
				en: 'Session moved',
				ar: 'موعد منقول'
			}
		}
	};
	/** La phrase sous la carte d'une séance ou d'une session partie ailleurs. */
	const DEPLACEE_AU: Record<
		'seance' | 'session',
		Record<Langue, (date: string, heure: string) => string>
	> = {
		seance: {
			fr: (date, heure) => `Séance déplacée au ${date} à ${heure}`,
			de: (date, heure) => `Termin verschoben auf ${date}, um ${heure}`,
			it: (date, heure) => `Lezione spostata a ${date} alle ${heure}`,
			en: (date, heure) => `Session moved to ${date} at ${heure}`,
			ar: (date, heure) => `حصة منقولة إلى يوم ${date} في الساعة ${heure}`
		},
		session: {
			fr: (date, heure) => `Session déplacée au ${date} à ${heure}`,
			de: (date, heure) => `Durchgang verschoben auf ${date}, um ${heure}`,
			it: (date, heure) => `Turno spostato a ${date} alle ${heure}`,
			en: (date, heure) => `Session moved to ${date} at ${heure}`,
			ar: (date, heure) => `موعد منقول إلى يوم ${date} في الساعة ${heure}`
		}
	};

	const organisation = newId();
	const RESPONSABLE_C4 = 'avenir-c4@example.test';
	const utilisateur = newId();
	const fiqh = newId();
	const FIQH = 'Cercle de fiqh';
	/** Deux sessions du vendredi, sous un titre choisi : la première annulée, la seconde déplacée. */
	const premiere = newId();
	const seconde = newId();
	const JUMUA = ['Jumu’a de midi', 'Jumu’a de l’après-midi'] as const;
	/** Le prochain vendredi de l'écran, aujourd'hui compris. */
	const vendredi = [0, 1, 2, 3, 4, 5, 6]
		.map((pas) => jour(pas))
		.find((date) => weekdayFromDays(isoDateToDays(date)) === 5) as IsoDate;
	/** Le jour où part la seconde session : le lendemain, ou la veille quand il sort de l'écran. */
	const ailleurs = addDays(vendredi, 1) > jour(6) ? addDays(vendredi, -1) : addDays(vendredi, 1);
	let cookie: string;

	/** Les marques d'une carte, dans l'ordre, chacune réduite à son texte. */
	function marques(fragment: string): string[] {
		return [...fragment.matchAll(/<span\b[^>]*class="marque[^"]*"[^>]*>([\s\S]*?)<\/span>/g)].map(
			(trouve) => texte(trouve[1] ?? '')
		);
	}

	beforeAll(async () => {
		await maintenance(async (tx) => {
			await tx.execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
					"enabled_language", "prayer_module", "greeting")
				values (${organisation}, 'a-venir-c4', 'Association des états', ${FUSEAU}, 'fr',
					array['fr','de','it','en','ar'], true, ${ACCUEIL})
			`);
			await tx.execute(sql`
				insert into "user" ("id", "email", "email_verified", "language")
				values (${utilisateur}, ${RESPONSABLE_C4}, true, 'fr')
			`);
			await tx.execute(sql`
				insert into "membership" ("id", "organization_id", "user_id", "role")
				values (${newId()}, ${organisation}, ${utilisateur}, 'org_admin')
			`);
			await tx.execute(conditionsAcceptees(organisation, utilisateur));
			await tx.execute(sql`
				insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
					"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
					"recurrence_anchor_date", "timing_kind", "timing_start", "timing_end", "starts_on")
				values (${fiqh}, ${organisation}, 'published', 'adults', array['fr'], 'fr', 'weekly',
					array[1,2,3,4,5,6,7]::smallint[], 1, ${jour(-30)}, 'fixed', '18:00', '19:30',
					${jour(-30)})
			`);
			for (const [id, rang, debut, fin] of [
				[premiere, 1, '12:10', '12:50'],
				[seconde, 2, '13:30', '14:10']
			] as const) {
				await tx.execute(sql`
					insert into "course" ("id", "organization_id", "kind", "jumua_order", "status",
						"audience", "teaching_language", "source_language", "recurrence_kind",
						"recurrence_weekday", "recurrence_interval", "recurrence_anchor_date", "timing_kind",
						"timing_start", "timing_end", "starts_on")
					values (${id}, ${organisation}, 'jumua', ${rang}, 'published', 'open', array['ar'], 'fr',
						'weekly', array[5]::smallint[], 1, ${jour(-30)}, 'fixed', ${debut}, ${fin},
						${jour(-30)})
				`);
			}
			for (const [id, titre] of [
				[fiqh, FIQH],
				[premiere, JUMUA[0]],
				[seconde, JUMUA[1]]
			] as const) {
				await tx.execute(sql`
					insert into "course_translation" ("id", "organization_id", "course_id", "language",
						"title")
					values (${newId()}, ${organisation}, ${id}, 'fr', ${titre})
				`);
			}
			// Le cours annulé demain et déplacé d'après-demain au jour suivant ; la première session
			// annulée ce vendredi, la seconde déplacée.
			for (const [id, date, kind, versLe, heure] of [
				[fiqh, jour(1), 'cancelled', null, null],
				[fiqh, jour(2), 'moved', jour(3), '20:30'],
				[premiere, vendredi, 'cancelled', null, null],
				[seconde, vendredi, 'moved', ailleurs, '15:00']
			] as const) {
				await tx.execute(sql`
					insert into "session_exception" ("id", "organization_id", "course_id", "date", "kind",
						"to_date", "to_start", "created_by")
					values (${newId()}, ${organisation}, ${id}, ${date}, ${kind}, ${versLe}, ${heure},
						${utilisateur})
				`);
			}
		});
		cookie = await signIn(RESPONSABLE_C4);
	});

	it.each(LANGUES)(
		'writes « Séance annulée » and « Session annulée » on the cancelled cards, in %s',
		async (langue) => {
			await maintenance((tx) =>
				tx.execute(sql`update "user" set "language" = ${langue} where "id" = ${utilisateur}`)
			);
			const html = await (await get('/', cookie)).text();
			expect(marques(carte(html, jour(1), FIQH, 'cancelled'))).toEqual([
				MARQUE.annulee.seance[langue]
			]);
			expect(marques(carte(html, vendredi, JUMUA[0], 'cancelled'))).toEqual([
				MARQUE.annulee.session[langue]
			]);
		}
	);

	it.each(LANGUES)(
		'writes « Séance déplacée » and « Session déplacée », with where they went, on the cards they left, in %s',
		async (langue) => {
			await maintenance((tx) =>
				tx.execute(sql`update "user" set "language" = ${langue} where "id" = ${utilisateur}`)
			);
			const html = await (await get('/', cookie)).text();
			const cours = carte(html, jour(2), FIQH, 'moved_away');
			expect(marques(cours)).toEqual([MARQUE.deplacee.seance[langue]]);
			expect(texte(cours)).toContain(DEPLACEE_AU.seance[langue](dateLue(langue, jour(3)), '20:30'));
			const session = carte(html, vendredi, JUMUA[1], 'moved_away');
			expect(marques(session)).toEqual([MARQUE.deplacee.session[langue]]);
			expect(texte(session)).toContain(
				DEPLACEE_AU.session[langue](dateLue(langue, ailleurs), '15:00')
			);
		}
	);
});

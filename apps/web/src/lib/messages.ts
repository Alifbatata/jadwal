// Les messages prêts à coller dans WhatsApp (cadrage, section « Solution »).
//
// Du texte, rien que du texte : pas de mise en forme, pas de lien qui casse, pas d'émoji imposé.
// C'est ce que les responsables recopient déjà à la main aujourd'hui, en moins fastidieux.
//
// Depuis l'étape 18, chaque message s'écrit dans chacune des cinq langues : une organisation publie
// dans les langues que sa communauté lit. La langue est le dernier paramètre, et le français reste
// la langue d'un appel qui n'en donne pas, pour que les écrans d'aujourd'hui n'aient rien à changer.
// Les dates suivent la règle de tout le service, `JJ.MM.AAAA` précédée du nom du jour
// (`longDate` de `i18n.ts`).
//
// Chaque phrase est rangée sous la clé de sa langue, `fr:`, `de:`, `it:`, `en:` ou `ar:`, jamais
// dans un ternaire : le correcteur (`pnpm orthographe`) relit chaque chaîne dans la langue de sa clé.
// Les heures et les mots des séances viennent de la page publique (`affichage.ts`) : un message ne
// dit pas autre chose que la page.
//
// Depuis l'étape 19, une session du vendredi a ses propres mots (décision du chef de projet) : la
// prière du vendredi n'est pas un cours, et « Le cours « Freitagsgebet » du … est annulé » le
// laissait croire. Son titre vient d'abord, puis la phrase parle de la prière, et la dernière ligne
// des autres prières du vendredi. Le type de la séance est le dernier paramètre, `course` par défaut.

import type { IsoDate } from '@jadwal/core';
import { longDate, t, type Langue } from './i18n.js';
import { decalageEnClair, nomPriere } from './public/affichage.js';

export interface SeanceLine {
	date: IsoDate;
	title: string;
	start: string | null;
	end: string | null;
	room: string | null;
	anchor?: { prayer: string; offsetMinutes: number } | undefined;
	status: string;
	/**
	 * Pour une séance déplacée ici (`moved_here`), la date où elle était prévue : la même date dit
	 * qu'elle a seulement changé d'heure (relecture du lot 5).
	 */
	originalDate?: IsoDate | undefined;
}

/**
 * Le séparateur d'une énumération : la virgule, ou la virgule arabe « ، ». De la ponctuation, pas
 * une phrase : elle reste hors des phrases rangées par langue, que le correcteur relit.
 */
function virgule(langue: Langue): string {
	return langue === 'ar' ? '، ' : ', ';
}

/** Ce qu'un message dit d'une séance qui change : son annulation, son déplacement, et la suite. */
interface Changement {
	readonly annulation: (titre: string, date: string) => string;
	readonly deplacement: (titre: string, de: string, vers: string, heure: string) => string;
	/** Le même jour à une autre heure : la date une fois, la nouvelle heure, puis celle d'avant. */
	readonly changementHeure: (titre: string, date: string, heure: string, avant: string) => string;
	/** Le même jour, pour une séance qui n'avait pas encore d'heure : la nouvelle heure seule. */
	readonly heureFixee: (titre: string, date: string, heure: string) => string;
	readonly lesAutres: string;
}

interface Phrases extends Changement {
	readonly semaine: (organisation: string) => string;
	readonly annule: string;
	readonly exceptionnelle: string;
	/** Une séance déplacée le même jour à une autre heure, comme le dit sa carte sur « À venir ». */
	readonly nouvelleHeure: string;
	/** Une séance ancrée sur une prière dont la table ne connaît pas encore l'heure, ni l'ancre. */
	readonly heureInconnue: string;
	readonly nouveau: (titre: string, suite: string) => string;
	/** Les mêmes changements pour une session du vendredi, qui n'est pas un cours (étape 19). */
	readonly vendredi: Changement;
}

/**
 * Les phrases des messages. Les guillemets sont ceux de chaque langue : « » espacés en français,
 * «» serrés en allemand de Suisse et en italien, ‘ ’ en anglais britannique, «» en arabe.
 */
const PHRASES: Record<Langue, Phrases> = {
	fr: {
		semaine: (organisation) => `Programme de la semaine à ${organisation} :`,
		annule: '(ANNULÉ)',
		exceptionnelle: '(date exceptionnelle)',
		nouvelleHeure: '(nouvelle heure)',
		heureInconnue: 'heure à préciser',
		annulation: (titre, date) => `Le cours « ${titre} » du ${date} est annulé.`,
		deplacement: (titre, de, vers, heure) =>
			`Le cours « ${titre} » du ${de} est déplacé au ${vers} à ${heure}.`,
		changementHeure: (titre, date, heure, avant) =>
			`Le cours « ${titre} » du ${date} commence à ${heure} au lieu de ${avant}.`,
		heureFixee: (titre, date, heure) => `Le cours « ${titre} » du ${date} commence à ${heure}.`,
		lesAutres: 'Les autres séances ont lieu normalement.',
		nouveau: (titre, suite) => `Nouveau cours : « ${titre} », ${suite}.`,
		vendredi: {
			annulation: (titre, date) => `« ${titre} » : la prière du ${date} est annulée.`,
			deplacement: (titre, de, vers, heure) =>
				`« ${titre} » : la prière du ${de} est déplacée au ${vers} à ${heure}.`,
			changementHeure: (titre, date, heure, avant) =>
				`« ${titre} » : la prière du ${date} commence à ${heure} au lieu de ${avant}.`,
			heureFixee: (titre, date, heure) =>
				`« ${titre} » : la prière du ${date} commence à ${heure}.`,
			lesAutres: 'Les autres prières du vendredi ont lieu comme d’habitude.'
		}
	},
	de: {
		semaine: (organisation) => `Das Programm dieser Woche bei ${organisation}:`,
		annule: '(ABGESAGT)',
		exceptionnelle: '(Ausnahmetermin)',
		nouvelleHeure: '(neue Uhrzeit)',
		heureInconnue: 'Zeit noch offen',
		annulation: (titre, date) => `Der Kurs «${titre}» vom ${date}, fällt aus.`,
		deplacement: (titre, de, vers, heure) =>
			`Der Kurs «${titre}» vom ${de}, wird auf ${vers}, um ${heure} verschoben.`,
		changementHeure: (titre, date, heure, avant) =>
			`Am ${date}, beginnt der Kurs «${titre}» um ${heure} statt um ${avant}.`,
		heureFixee: (titre, date, heure) => `Am ${date}, beginnt der Kurs «${titre}» um ${heure}.`,
		lesAutres: 'Die anderen Termine finden wie gewohnt statt.',
		nouveau: (titre, suite) => `Neuer Kurs: «${titre}», ${suite}.`,
		vendredi: {
			annulation: (titre, date) => `«${titre}»: Das Gebet vom ${date}, fällt aus.`,
			deplacement: (titre, de, vers, heure) =>
				`«${titre}»: Das Gebet vom ${de}, wird auf ${vers}, um ${heure} verschoben.`,
			changementHeure: (titre, date, heure, avant) =>
				`«${titre}»: Am ${date}, beginnt das Gebet um ${heure} statt um ${avant}.`,
			heureFixee: (titre, date, heure) => `«${titre}»: Am ${date}, beginnt das Gebet um ${heure}.`,
			lesAutres: 'Die anderen Freitagsgebete finden wie gewohnt statt.'
		}
	},
	it: {
		semaine: (organisation) => `Il programma della settimana di ${organisation}:`,
		annule: '(ANNULLATO)',
		exceptionnelle: '(data eccezionale)',
		nouvelleHeure: '(nuovo orario)',
		heureInconnue: 'orario da definire',
		annulation: (titre, date) => `La lezione «${titre}» di ${date} è annullata.`,
		deplacement: (titre, de, vers, heure) =>
			`La lezione «${titre}» di ${de} è spostata a ${vers} alle ${heure}.`,
		changementHeure: (titre, date, heure, avant) =>
			`La lezione «${titre}» di ${date} inizia alle ${heure} anziché alle ${avant}.`,
		heureFixee: (titre, date, heure) => `La lezione «${titre}» di ${date} inizia alle ${heure}.`,
		lesAutres: 'Le altre lezioni si svolgono regolarmente.',
		nouveau: (titre, suite) => `Nuovo corso: «${titre}», ${suite}.`,
		vendredi: {
			annulation: (titre, date) => `«${titre}»: la preghiera di ${date} è annullata.`,
			deplacement: (titre, de, vers, heure) =>
				`«${titre}»: la preghiera di ${de} è spostata a ${vers} alle ${heure}.`,
			changementHeure: (titre, date, heure, avant) =>
				`«${titre}»: la preghiera di ${date} inizia alle ${heure} anziché alle ${avant}.`,
			heureFixee: (titre, date, heure) =>
				`«${titre}»: la preghiera di ${date} inizia alle ${heure}.`,
			lesAutres: 'Le altre preghiere del venerdì si svolgono regolarmente.'
		}
	},
	en: {
		semaine: (organisation) => `This week’s programme at ${organisation}:`,
		annule: '(CANCELLED)',
		exceptionnelle: '(rescheduled)',
		nouvelleHeure: '(new time)',
		heureInconnue: 'time to be confirmed',
		annulation: (titre, date) => `The ‘${titre}’ session on ${date} is cancelled.`,
		deplacement: (titre, de, vers, heure) =>
			`The ‘${titre}’ session on ${de} has been moved to ${vers} at ${heure}.`,
		changementHeure: (titre, date, heure, avant) =>
			`The ‘${titre}’ session on ${date} now starts at ${heure} instead of ${avant}.`,
		heureFixee: (titre, date, heure) => `The ‘${titre}’ session on ${date} starts at ${heure}.`,
		lesAutres: 'The other sessions go ahead as usual.',
		nouveau: (titre, suite) => `New course: ‘${titre}’, ${suite}.`,
		vendredi: {
			annulation: (titre, date) => `‘${titre}’: the prayer on ${date} is cancelled.`,
			deplacement: (titre, de, vers, heure) =>
				`‘${titre}’: the prayer on ${de} has been moved to ${vers} at ${heure}.`,
			changementHeure: (titre, date, heure, avant) =>
				`‘${titre}’: the prayer on ${date} now starts at ${heure} instead of ${avant}.`,
			heureFixee: (titre, date, heure) => `‘${titre}’: the prayer on ${date} starts at ${heure}.`,
			lesAutres: 'The other Friday prayers go ahead as usual.'
		}
	},
	ar: {
		semaine: (organisation) => `برنامج هذا الأسبوع في ${organisation}:`,
		annule: '(ملغى)',
		exceptionnelle: '(موعد استثنائي)',
		nouvelleHeure: '(وقت جديد)',
		heureInconnue: 'الوقت لم يُحدَّد بعد',
		annulation: (titre, date) => `أُلغي درس «${titre}» يوم ${date}.`,
		deplacement: (titre, de, vers, heure) =>
			`نُقل درس «${titre}» من يوم ${de} إلى يوم ${vers} في الساعة ${heure}.`,
		changementHeure: (titre, date, heure, avant) =>
			`يبدأ درس «${titre}» يوم ${date} في الساعة ${heure} بدلًا من الساعة ${avant}.`,
		heureFixee: (titre, date, heure) => `يبدأ درس «${titre}» يوم ${date} في الساعة ${heure}.`,
		lesAutres: 'تُقام الحصص الأخرى كالمعتاد.',
		nouveau: (titre, suite) => `درس جديد: «${titre}»، ${suite}.`,
		vendredi: {
			annulation: (titre, date) => `«${titre}»: أُلغيت الصلاة يوم ${date}.`,
			deplacement: (titre, de, vers, heure) =>
				`«${titre}»: نُقلت الصلاة من يوم ${de} إلى يوم ${vers} في الساعة ${heure}.`,
			changementHeure: (titre, date, heure, avant) =>
				`«${titre}»: تبدأ الصلاة يوم ${date} في الساعة ${heure} بدلًا من الساعة ${avant}.`,
			heureFixee: (titre, date, heure) => `«${titre}»: تبدأ الصلاة يوم ${date} في الساعة ${heure}.`,
			lesAutres: 'تُقام مواعيد صلاة الجمعة الأخرى كالمعتاد.'
		}
	}
};

/**
 * Les phrases d'un changement, selon le type de la séance : celles d'une session du vendredi pour
 * `jumua`, celles d'un cours sinon.
 */
function changement(langue: Langue, kind: string): Changement {
	return kind === 'jumua' ? PHRASES[langue].vendredi : PHRASES[langue];
}

/** « Salam alaykoum, » : la formule que l'organisation a choisie, suivie de la virgule de la langue. */
function salutation(greeting: string, langue: Langue): string {
	return `${greeting}${virgule(langue).trimEnd()}`;
}

/**
 * L'heure d'une séance au fil de la ligne : « 19:00 – 20:30 », « 30 min après Maghrib ». La phrase
 * d'une séance ancrée est celle de la page publique, en minuscule, puisqu'elle suit une virgule ;
 * en français, c'est mot pour mot ce que l'espace écrivait déjà (`describeSessionTime`).
 */
function heureDansLeMessage(seance: SeanceLine, langue: Langue): string {
	if (seance.start && seance.end) return `${seance.start} – ${seance.end}`;
	if (seance.anchor) {
		const phrase = decalageEnClair(
			langue,
			seance.anchor.offsetMinutes,
			nomPriere(langue, seance.anchor.prayer)
		);
		return phrase.charAt(0).toLocaleLowerCase(langue) + phrase.slice(1);
	}
	return PHRASES[langue].heureInconnue;
}

/**
 * Le programme de la semaine, jour par jour. Les séances annulées y figurent **barrées en mots** :
 * ne pas les dire serait le meilleur moyen que quelqu'un se déplace pour rien. Une séance déplacée
 * ici porte « date exceptionnelle », ou « nouvelle heure » quand elle n'a changé que d'heure, le même
 * jour.
 */
export function weekMessage(
	greeting: string,
	organisation: string,
	seances: readonly SeanceLine[],
	langue: Langue = 'fr'
): string {
	const phrases = PHRASES[langue];
	const lignes: string[] = [salutation(greeting, langue), '', phrases.semaine(organisation)];
	const parJour = new Map<string, SeanceLine[]>();
	for (const seance of seances) {
		if (seance.status === 'moved_away') continue;
		const jour = parJour.get(seance.date) ?? [];
		jour.push(seance);
		parJour.set(seance.date, jour);
	}
	if (parJour.size === 0) {
		lignes.push('', t(langue).emptyWeek);
		return lignes.join('\n');
	}
	for (const [date, jour] of [...parJour.entries()].sort()) {
		lignes.push('', longDate(langue, date as IsoDate));
		for (const seance of jour) {
			const heure = heureDansLeMessage(seance, langue);
			const lieu = seance.room ? `${virgule(langue)}${seance.room}` : '';
			const marque =
				seance.status === 'cancelled'
					? ` ${phrases.annule}`
					: seance.status === 'moved_here'
						? ` ${seance.originalDate === seance.date ? phrases.nouvelleHeure : phrases.exceptionnelle}`
						: '';
			lignes.push(`- ${seance.title}${virgule(langue)}${heure}${lieu}${marque}`);
		}
	}
	return lignes.join('\n');
}

/**
 * Le message d'une annulation ponctuelle. Il dit toujours que le cours continue après, ou, pour une
 * session du vendredi (`kind` vaut `jumua`), que les autres prières du vendredi ont lieu.
 */
export function cancellationMessage(
	greeting: string,
	title: string,
	date: IsoDate,
	langue: Langue = 'fr',
	kind = 'course'
): string {
	const phrases = changement(langue, kind);
	return [
		salutation(greeting, langue),
		'',
		phrases.annulation(title, longDate(langue, date)),
		phrases.lesAutres
	].join('\n');
}

/**
 * Le message d'un déplacement. Les deux dates y sont, sans quoi personne ne s'y retrouve. Le même
 * jour, seule l'heure change, et le message ne parle que d'elle : la date une fois, la nouvelle
 * heure, et `plannedStart`, l'heure prévue, quand la séance en avait une (relecture du lot 4 de
 * l'étape 18). Une session du vendredi a ses propres mots, comme pour une annulation.
 */
export function moveMessage(
	greeting: string,
	title: string,
	from: IsoDate,
	to: IsoDate,
	start: string,
	langue: Langue = 'fr',
	plannedStart: string | null = null,
	kind = 'course'
): string {
	const phrases = changement(langue, kind);
	const date = longDate(langue, from);
	const phrase =
		from !== to
			? phrases.deplacement(title, date, longDate(langue, to), start)
			: plannedStart
				? phrases.changementHeure(title, date, start, plannedStart)
				: phrases.heureFixee(title, date, start);
	return [salutation(greeting, langue), '', phrase, phrases.lesAutres].join('\n');
}

/**
 * Le message d'un cours nouveau. Le rythme et l'horaire arrivent déjà écrits, dans la langue du
 * message : `describeRecurrence` et `describeTiming` pour le français de l'espace, `rythmeEnClair`
 * et `horaireEnClair` de la page publique pour les cinq langues.
 */
export function newCourseMessage(
	greeting: string,
	title: string,
	rythme: string,
	horaire: string,
	room: string | null,
	langue: Langue = 'fr'
): string {
	const phrases = PHRASES[langue];
	const suite = [rythme, horaire, ...(room ? [room] : [])].join(virgule(langue));
	return [salutation(greeting, langue), '', phrases.nouveau(title, suite)].join('\n');
}

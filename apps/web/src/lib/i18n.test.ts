// Les dictionnaires des pages publiques, et les phrases arabes relues par le chef de projet.
//
// Chaque correction de la relecture a ici sa phrase exacte : une faute qui reviendrait par un
// copier-coller ferait tomber le test, pas seulement le correcteur. Les nombres arabes sont éprouvés
// sur les huit valeurs demandées, 0, 1, 2, 3, 10, 11, 15 et 100, qui couvrent les six formes du CLDR.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { IsoDate } from '@jadwal/core';
import {
	direction,
	documentDansSaLangue,
	LANGUES,
	longDate,
	monthName,
	NOM_DE_LANGUE,
	numericDate,
	t,
	type Langue
} from './i18n.js';
import { upcomingTexts } from './i18n/upcoming.js';

const ar = t('ar');

describe('l’italien devant un jour de la semaine', () => {
	// La date longue commence par le nom du jour : « domenica 04.10.2026 ». « Spostato al » et
	// « Inizialmente il » mettaient un article masculin devant « domenica », qui est féminin
	// (relecture du lot 7). Sans article, la phrase vaut pour les sept jours.
	it('says a session was moved, and where it originally was, with no article before the day', () => {
		const it_ = t('it');
		expect(it_.movedTo(longDate('it', '2026-10-04' as IsoDate))).toBe(
			'Spostato a domenica 04.10.2026'
		);
		expect(it_.originallyOn(longDate('it', '2026-10-04' as IsoDate))).toBe(
			'In origine: domenica 04.10.2026'
		);
		expect(it_.movedTo(longDate('it', '2026-10-05' as IsoDate))).toBe(
			'Spostato a lunedì 05.10.2026'
		);
	});

	it('writes the week of the upcoming screen from one day to another, with no article', () => {
		expect(
			upcomingTexts.it.period(
				longDate('it', '2026-10-04' as IsoDate),
				longDate('it', '2026-10-10' as IsoDate)
			)
		).toBe('Da domenica 04.10.2026 a sabato 10.10.2026');
	});
});

describe('les phrases arabes relues', () => {
	it('uses the one-letter short weekdays of the CLDR, Monday first', () => {
		expect(ar.shortWeekdays).toEqual(['ن', 'ث', 'ر', 'خ', 'ج', 'س', 'ح']);
		// La vue Mois les prend pour clé de sa boucle : sept lettres, sept clés distinctes.
		expect(new Set(ar.shortWeekdays).size).toBe(7);
	});

	it('says a session was moved, and where it originally was', () => {
		expect(ar.movedTo('الخميس 1 أكتوبر')).toBe('نُقل إلى الخميس 1 أكتوبر');
		expect(ar.originallyOn('الخميس 1 أكتوبر')).toBe('كان مقرّرًا في الخميس 1 أكتوبر');
	});

	it('names the language of the sermon', () => {
		expect(ar.sermonIn('العربية والفرنسية')).toBe('لغة الخطبة: العربية والفرنسية');
	});

	it('says the calendar is updated, not that it speaks', () => {
		// La phrase relue, sans « مرة كل ساعة تقريبًا » depuis l'étape 18 : le délai dépend de
		// l'application, et il passe sous le bouton de l'iPhone, mot pour mot (retour E2).
		expect(ar.subscribeIntro('جمعية بلفيدير')).toBe(
			'يُضاف برنامج جمعية بلفيدير إلى تقويمك ويُحدَّث تلقائيًا. لا حاجة لإعادة أي إعداد عند تغيّر درس.'
		);
		expect(ar.appleHelp).toContain('مرة كل ساعة تقريبًا');
		expect(ar.subscribeOneCourseText).toBe(
			'يمكنك أيضًا إضافة درس واحد فقط. اضغط على اسمه: يُضاف وحده ويُحدَّث مثل الباقي. وعنوانه بصيغة https موجود في صفحة الدرس.'
		);
		expect(`${ar.subscribeIntro('x')} ${ar.subscribeOneCourseText}`).not.toContain('ويتحدّث');
	});

	it('asks to copy the address and paste it', () => {
		expect(ar.subscribeAddress).toBe('أو انسخ هذا العنوان والصقه في تطبيق التقويم:');
		expect(ar.courseFeedAddress).toBe('أو انسخ هذا العنوان، وهو خاص بهذا الدرس وحده:');
	});

	it('presses on the button, with its preposition', () => {
		// Les phrases qui parlent d'un bouton gardent « اضغط على الزر ». Depuis la relecture du lot 3,
		// les étapes de l'iPhone n'en parlent plus : elles se lisent aussi sur le choix complet, qui n'a
		// pas de bouton. Ce sont les mots relus, sans leur première phrase.
		expect(ar.appleHelp).toMatch(/^اضغط على الزر، /);
		expect(ar.googleHelp).toMatch(/^اضغط على الزر: /);
		expect(ar.iphoneText).toBe(
			'افتح الإعدادات، ثم التطبيقات، التقويم، الحسابات، إضافة حساب، أخرى، إضافة اشتراك تقويم، والصق العنوان.'
		);
	});
});

describe('les nombres en arabe', () => {
	it('agrees the minutes after a prayer with their number', () => {
		const phrases = [0, 1, 2, 3, 10, 11, 15, 100].map((minutes) =>
			ar.afterOffset(minutes, 'المغرب')
		);
		expect(phrases).toEqual([
			// Zéro n'est pas une phrase de minutes : c'est « après » tout court, comme `after`.
			'بعد المغرب',
			'بعد المغرب بدقيقة واحدة',
			'بعد المغرب بدقيقتين',
			'بعد المغرب بـ3 دقائق',
			'بعد المغرب بـ10 دقائق',
			'بعد المغرب بـ11 دقيقة',
			'بعد المغرب بـ15 دقيقة',
			'بعد المغرب بـ100 دقيقة'
		]);
		expect(ar.afterOffset(0, 'المغرب')).toBe(ar.after('المغرب'));
	});

	it('agrees the sessions with their number', () => {
		const phrases = [0, 1, 2, 3, 10, 11, 15, 100].map((seances) => ar.sessionCount(seances));
		expect(phrases).toEqual([
			'لا حصص',
			'حصة واحدة',
			'حصتان',
			'3 حصص',
			'10 حصص',
			'11 حصة',
			'15 حصة',
			'100 حصة'
		]);
	});

	it('follows the CLDR past a hundred: 103 is « few » again, 102 is « other »', () => {
		expect(ar.sessionCount(102)).toBe('102 حصة');
		expect(ar.sessionCount(103)).toBe('103 حصص');
		expect(ar.afterOffset(240, 'المغرب')).toBe('بعد المغرب بـ240 دقيقة');
	});
});

describe('les autres langues ne bougent pas', () => {
	it('keeps the minutes after a prayer', () => {
		expect(t('fr').afterOffset(15, 'Maghrib')).toBe('15 min après Maghrib');
		expect(t('de').afterOffset(15, 'Maghrib')).toBe('15 Min. nach Maghrib');
		expect(t('it').afterOffset(15, 'Maghrib')).toBe('15 min dopo Maghrib');
		expect(t('fr').afterOffset(1, 'Maghrib')).toBe('1 min après Maghrib');
		expect(t('fr').after('Maghrib')).toBe('Après Maghrib');
		expect(t('de').after('Maghrib')).toBe('Nach Maghrib');
		expect(t('it').after('Maghrib')).toBe('Dopo Maghrib');
	});

	it('keeps the number of sessions', () => {
		expect([0, 1, 2, 11].map((n) => t('fr').sessionCount(n))).toEqual([
			'0 séances',
			'1 séance',
			'2 séances',
			'11 séances'
		]);
		expect([0, 1, 2].map((n) => t('de').sessionCount(n))).toEqual([
			'0 Termine',
			'1 Termin',
			'2 Termine'
		]);
		expect([0, 1, 2].map((n) => t('it').sessionCount(n))).toEqual([
			'0 lezioni',
			'1 lezione',
			'2 lezioni'
		]);
	});

	it('keeps the other sentences that the Arabic review touched', () => {
		expect(t('fr').movedTo('x')).toBe('Déplacé au x');
		expect(t('de').originallyOn('x')).toBe('Ursprünglich am x');
		expect(t('it').sermonIn('x')).toBe('sermone in x');
		expect(t('fr').shortWeekdays).toEqual(['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']);
		expect(t('de').shortWeekdays).toEqual(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']);
		expect(t('it').shortWeekdays).toEqual(['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']);
	});
});

/**
 * Les dates, depuis l'étape 18 : `JJ.MM.AAAA`, comme en Suisse, dans les cinq langues et en chiffres
 * latins. Le nom du jour peut la précéder ; le nom du mois ne sert plus qu'en tête de la vue Mois.
 * Jusque-là, la page écrivait « jeudi 1er octobre », sans l'année, et chaque langue à sa façon.
 */
describe('les dates, en JJ.MM.AAAA dans les cinq langues', () => {
	const samedi = '2026-09-26' as IsoDate;

	it('lists the five languages in the order of the service', () => {
		expect(LANGUES).toEqual(['fr', 'de', 'it', 'en', 'ar']);
	});

	it('writes a date as day, month and year, with two digits for the day and the month', () => {
		expect(numericDate(samedi)).toBe('26.09.2026');
		expect(numericDate('2026-10-01' as IsoDate)).toBe('01.10.2026');
		expect(numericDate('2028-02-29' as IsoDate)).toBe('29.02.2028');
	});

	it('puts the name of the day in front of it, in each language', () => {
		expect(LANGUES.map((langue) => longDate(langue, samedi))).toEqual([
			'samedi 26.09.2026',
			'Samstag, 26.09.2026',
			'sabato 26.09.2026',
			'Saturday 26.09.2026',
			'السبت 26.09.2026'
		]);
		expect(LANGUES.map((langue) => longDate(langue, '2026-10-01' as IsoDate))).toEqual([
			'jeudi 01.10.2026',
			'Donnerstag, 01.10.2026',
			'giovedì 01.10.2026',
			'Thursday 01.10.2026',
			'الخميس 01.10.2026'
		]);
	});

	it('keeps the name of the month where a month is named, at the head of the month view', () => {
		expect(LANGUES.map((langue) => monthName(langue, 2026, 10))).toEqual([
			'Octobre 2026',
			'Oktober 2026',
			'Ottobre 2026',
			'October 2026',
			'أكتوبر 2026'
		]);
	});

	it('gives back what it was given when the date is unreadable', () => {
		// Plutôt que d'inventer une date : une chaîne inattendue doit se voir, pas se fondre.
		expect(numericDate('pas-une-date' as IsoDate)).toBe('pas-une-date');
		expect(longDate('en', 'pas-une-date' as IsoDate)).toBe('pas-une-date');
	});
});

describe('l’anglais britannique', () => {
	const en = t('en');

	it('reads from left to right, and names itself in English', () => {
		expect(direction('en')).toBe('ltr');
		expect(NOM_DE_LANGUE.en).toBe('English');
	});

	it('spells the British way', () => {
		expect(en.cancelled).toBe('Cancelled');
		expect(en.backToProgramme).toBe('Back to the programme');
		expect(en.rhythms['fortnightly']).toBe('Every fortnight');
		expect(en.views).toEqual({
			week: 'Week',
			courses: 'All courses',
			month: 'Month',
			prayers: 'Prayer times'
		});
	});

	it('counts the sessions and the minutes', () => {
		expect([0, 1, 2, 11].map((n) => en.sessionCount(n))).toEqual([
			'0 sessions',
			'1 session',
			'2 sessions',
			'11 sessions'
		]);
		expect(en.after('Maghrib')).toBe('After Maghrib');
		expect(en.afterOffset(15, 'Maghrib')).toBe('15 min after Maghrib');
		expect(en.beforeOffset(15, 'Maghrib')).toBe('15 min before Maghrib');
	});

	it('names the days and the months', () => {
		expect(en.weekdays).toEqual([
			'Monday',
			'Tuesday',
			'Wednesday',
			'Thursday',
			'Friday',
			'Saturday',
			'Sunday'
		]);
		expect(en.shortWeekdays).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
		expect(en.months[8]).toBe('September');
	});
});

/**
 * Chaque texte d'un dictionnaire, les phrases à trous remplies d'un exemple : c'est ce que la page
 * affiche, et ce que les règles de ponctuation ci-dessous relisent.
 */
function textesDe(langue: Langue): string[] {
	const textes: string[] = [];
	for (const [cle, valeur] of Object.entries(t(langue))) {
		if (typeof valeur === 'string') textes.push(valeur);
		else if (Array.isArray(valeur)) textes.push(...(valeur as string[]));
		else if (typeof valeur === 'function') {
			const phrase = valeur as (...exemple: unknown[]) => string;
			textes.push(cle === 'nextSessionsLine' ? phrase(['A', 'B']) : phrase(3, 'Maghrib'));
		} else textes.push(...Object.values(valeur as Record<string, string>));
	}
	return textes;
}

describe('la ponctuation de chaque langue', () => {
	// L'espace avant les deux-points, le point-virgule, le point d'interrogation et le point
	// d'exclamation est une règle du français, et de lui seul. « Upcoming sessions : » était écrit
	// ainsi dans le gabarit de la vue « Tous les cours », dans toutes les langues.
	it('puts no space before a colon, a semicolon, a question or an exclamation mark, outside French', () => {
		for (const langue of ['de', 'it', 'en', 'ar'] as const) {
			expect(
				textesDe(langue).filter((texte) => /\s[:;?!؟؛]/.test(texte)),
				langue
			).toEqual([]);
		}
	});

	// En allemand, une phrase entière qui suit les deux-points prend la majuscule : c'est la règle de
	// l'orthographe officielle. Aucun texte allemand du public ne met après les deux-points autre
	// chose qu'une phrase entière ou un texte saisi par l'organisation.
	it('starts the whole sentence that follows a colon with a capital letter, in German', () => {
		expect(textesDe('de').filter((texte) => /:\s+\p{Ll}/u.test(texte))).toEqual([]);
	});
});

describe('le lien des conditions, au pied de la page publique', () => {
	it('names the terms of use in each of the five languages', () => {
		expect(LANGUES.map((langue) => t(langue).terms)).toEqual([
			'Conditions d’utilisation',
			'Nutzungsbedingungen',
			'Condizioni d’uso',
			'Terms of use',
			'شروط الاستخدام'
		]);
	});

	it('names the list of languages in each language, and no longer in French everywhere', () => {
		expect(LANGUES.map((langue) => t(langue).languagesLabel)).toEqual([
			'Langues',
			'Sprachen',
			'Lingue',
			'Languages',
			'اللغات'
		]);
	});
});

/**
 * Les décalages négatifs, de -1 à -120 : la base et le formulaire les acceptent. Le dictionnaire
 * reçoit la valeur absolue, et l'arabe choisit sa forme sur elle.
 */
const AVANT = [1, 2, 3, 10, 11, 15, 100, 120];

describe('les minutes avant une prière', () => {
	it('says « avant », « vor », « prima di » with a positive number', () => {
		expect(AVANT.map((minutes) => t('fr').beforeOffset(minutes, 'Maghrib'))).toEqual(
			AVANT.map((minutes) => `${minutes} min avant Maghrib`)
		);
		expect(AVANT.map((minutes) => t('de').beforeOffset(minutes, 'Maghrib'))).toEqual(
			AVANT.map((minutes) => `${minutes} Min. vor Maghrib`)
		);
		expect(AVANT.map((minutes) => t('it').beforeOffset(minutes, 'Maghrib'))).toEqual(
			AVANT.map((minutes) => `${minutes} min prima di Maghrib`)
		);
	});

	it('agrees the Arabic minutes with their number, on the model of « بعد »', () => {
		expect(AVANT.map((minutes) => ar.beforeOffset(minutes, 'المغرب'))).toEqual([
			'قبل المغرب بدقيقة واحدة',
			'قبل المغرب بدقيقتين',
			'قبل المغرب بـ3 دقائق',
			'قبل المغرب بـ10 دقائق',
			'قبل المغرب بـ11 دقيقة',
			'قبل المغرب بـ15 دقيقة',
			'قبل المغرب بـ100 دقيقة',
			'قبل المغرب بـ120 دقيقة'
		]);
	});

	it('differs from the proofread « بعد » sentence by its first word only, for every offset', () => {
		for (let minutes = 1; minutes <= 240; minutes += 1) {
			expect(ar.beforeOffset(minutes, 'المغرب')).toBe(
				ar.afterOffset(minutes, 'المغرب').replace(/^بعد /, 'قبل ')
			);
		}
	});
});

describe('la langue du document', () => {
	const gabarit = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

	it('finds in app.html the tag it replaces', () => {
		expect(gabarit).toContain('<html lang="%lang%" dir="%dir%">');
	});

	it('writes the language and the direction of a public page on <html>', () => {
		expect(documentDansSaLangue(gabarit, 'ar')).toContain('<html lang="ar" dir="rtl">');
		expect(documentDansSaLangue(gabarit, 'de')).toContain('<html lang="de" dir="ltr">');
		expect(documentDansSaLangue(gabarit, 'it')).toContain('<html lang="it" dir="ltr">');
		expect(documentDansSaLangue(gabarit, 'en')).toContain('<html lang="en" dir="ltr">');
		expect(documentDansSaLangue(gabarit, 'fr')).toContain('<html lang="fr" dir="ltr">');
	});

	it('keeps the rest of the service in French, left to right', () => {
		const rendu = documentDansSaLangue(gabarit, undefined);
		expect(rendu).toContain('<html lang="fr" dir="ltr">');
		expect(rendu).not.toContain('%lang%');
		expect(rendu).not.toContain('%dir%');
	});

	it('touches nothing but the tag, not even the same words typed in a page', () => {
		// Le texte d'une page est échappé : un chevron tapé par quelqu'un y devient `&lt;`. La balise
		// entière ne peut donc venir que du gabarit, et elle seule est remplacée.
		const morceau = '<p>&lt;html lang="%lang%" dir="%dir%"&gt; et %lang%</p>';
		expect(documentDansSaLangue(morceau, 'ar')).toBe(morceau);
	});
});

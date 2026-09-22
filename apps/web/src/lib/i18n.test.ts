// Les dictionnaires des pages publiques, et les phrases arabes relues par le chef de projet.
//
// Chaque correction de la relecture a ici sa phrase exacte : une faute qui reviendrait par un
// copier-coller ferait tomber le test, pas seulement le correcteur. Les nombres arabes sont éprouvés
// sur les huit valeurs demandées, 0, 1, 2, 3, 10, 11, 15 et 100, qui couvrent les six formes du CLDR.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { IsoDate } from '@jadwal/core';
import { dateWithYear, documentDansSaLangue, LANGUES, longDate, monthName, t } from './i18n.js';

const ar = t('ar');

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
		expect(ar.subscribeIntro('جمعية بلفيدير')).toBe(
			'يُضاف برنامج جمعية بلفيدير إلى تقويمك ويُحدَّث تلقائيًا، مرة كل ساعة تقريبًا. لا حاجة لإعادة أي إعداد عند تغيّر درس.'
		);
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
		expect(ar.iphoneText).toBe(
			'اضغط على الزر أعلاه: سيقترح هاتفك إضافة التقويم. إن لم يحدث شيء، افتح الإعدادات، ثم التطبيقات، التقويم، الحسابات، إضافة حساب، أخرى، إضافة اشتراك تقويم، والصق العنوان.'
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

	it('keeps the dates of the four languages, in Latin digits', () => {
		const jeudi = '2026-10-01' as IsoDate;
		expect(LANGUES.map((langue) => longDate(langue, jeudi))).toEqual([
			'jeudi 1er octobre',
			'Donnerstag, 1. Oktober',
			'giovedì 1 ottobre',
			'الخميس 1 أكتوبر'
		]);
		expect(LANGUES.map((langue) => dateWithYear(langue, jeudi))).toEqual([
			'1er octobre 2026',
			'1. Oktober 2026',
			'1 ottobre 2026',
			'1 أكتوبر 2026'
		]);
		expect(LANGUES.map((langue) => monthName(langue, 2026, 10))).toEqual([
			'Octobre 2026',
			'Oktober 2026',
			'Ottobre 2026',
			'أكتوبر 2026'
		]);
	});
});

describe('le lien des conditions, au pied de la page publique', () => {
	it('names the terms of use in each of the four languages', () => {
		expect(LANGUES.map((langue) => t(langue).terms)).toEqual([
			'Conditions d’utilisation',
			'Nutzungsbedingungen',
			'Condizioni d’uso',
			'شروط الاستخدام'
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

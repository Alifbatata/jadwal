// Les messages prêts à coller, dans chacune des cinq langues (étape 18).
//
// Une organisation publie dans les langues que sa communauté lit : ses messages s'écrivent donc dans
// chacune d'elles, au choix. Chaque message est figé ici en entier, phrase par phrase : un mot qui
// changerait par mégarde ferait tomber le test, et pas seulement le correcteur. Les dates suivent la
// règle de tout le service, `JJ.MM.AAAA`, précédées du nom du jour.
//
// Les appels d'avant l'étape 18, sans langue, restent en français : les écrans qui montrent ces
// messages ne changent pas dans ce lot.

import { describe, expect, it } from 'vitest';
import type { IsoDate } from '@jadwal/core';
import { LANGUES } from './i18n.js';
import { cancellationMessage, moveMessage, newCourseMessage, weekMessage } from './messages.js';

const SALUT = 'Salam alaykoum';
const ORGANISATION = 'Association de Bienne';

const SEMAINE = [
	{
		date: '2026-09-21' as IsoDate,
		title: 'Tafsir',
		start: '19:00',
		end: '20:30',
		room: 'Salle 1',
		status: 'scheduled'
	},
	{
		date: '2026-09-21' as IsoDate,
		title: 'Arabe',
		start: '17:00',
		end: '18:00',
		room: null,
		status: 'cancelled'
	},
	{
		date: '2026-09-23' as IsoDate,
		title: 'Fiqh',
		start: null,
		end: null,
		room: null,
		anchor: { prayer: 'maghrib', offsetMinutes: 30 },
		status: 'scheduled'
	},
	{
		date: '2026-09-24' as IsoDate,
		title: 'Hifz',
		start: '18:00',
		end: '19:00',
		room: null,
		status: 'moved_here'
	},
	{
		date: '2026-09-26' as IsoDate,
		title: 'Cercle',
		start: null,
		end: null,
		room: null,
		status: 'scheduled'
	},
	{
		date: '2026-09-25' as IsoDate,
		title: 'Parti ailleurs',
		start: '19:00',
		end: '20:00',
		room: null,
		status: 'moved_away'
	}
];

describe('le programme de la semaine, dans les cinq langues', () => {
	it('writes it in French, as before, with the dates as JJ.MM.AAAA', () => {
		expect(weekMessage(SALUT, ORGANISATION, SEMAINE, 'fr')).toBe(
			[
				'Salam alaykoum,',
				'',
				'Programme de la semaine à Association de Bienne :',
				'',
				'lundi 21.09.2026',
				'- Tafsir, 19:00 – 20:30, Salle 1',
				'- Arabe, 17:00 – 18:00 (ANNULÉ)',
				'',
				'mercredi 23.09.2026',
				'- Fiqh, 30 min après Maghrib',
				'',
				'jeudi 24.09.2026',
				'- Hifz, 18:00 – 19:00 (date exceptionnelle)',
				'',
				'samedi 26.09.2026',
				'- Cercle, heure à préciser'
			].join('\n')
		);
	});

	it('writes it in German', () => {
		expect(weekMessage(SALUT, ORGANISATION, SEMAINE, 'de')).toBe(
			[
				'Salam alaykoum,',
				'',
				'Das Programm dieser Woche bei Association de Bienne:',
				'',
				'Montag, 21.09.2026',
				'- Tafsir, 19:00 – 20:30, Salle 1',
				'- Arabe, 17:00 – 18:00 (ABGESAGT)',
				'',
				'Mittwoch, 23.09.2026',
				'- Fiqh, 30 Min. nach Maghrib',
				'',
				'Donnerstag, 24.09.2026',
				'- Hifz, 18:00 – 19:00 (Ausnahmetermin)',
				'',
				'Samstag, 26.09.2026',
				'- Cercle, Zeit noch offen'
			].join('\n')
		);
	});

	it('writes it in Italian', () => {
		expect(weekMessage(SALUT, ORGANISATION, SEMAINE, 'it')).toBe(
			[
				'Salam alaykoum,',
				'',
				'Il programma della settimana di Association de Bienne:',
				'',
				'lunedì 21.09.2026',
				'- Tafsir, 19:00 – 20:30, Salle 1',
				'- Arabe, 17:00 – 18:00 (ANNULLATO)',
				'',
				'mercoledì 23.09.2026',
				'- Fiqh, 30 min dopo Maghrib',
				'',
				'giovedì 24.09.2026',
				'- Hifz, 18:00 – 19:00 (data eccezionale)',
				'',
				'sabato 26.09.2026',
				'- Cercle, orario da definire'
			].join('\n')
		);
	});

	it('writes it in British English', () => {
		expect(weekMessage(SALUT, ORGANISATION, SEMAINE, 'en')).toBe(
			[
				'Salam alaykoum,',
				'',
				'This week’s programme at Association de Bienne:',
				'',
				'Monday 21.09.2026',
				'- Tafsir, 19:00 – 20:30, Salle 1',
				'- Arabe, 17:00 – 18:00 (CANCELLED)',
				'',
				'Wednesday 23.09.2026',
				'- Fiqh, 30 min after Maghrib',
				'',
				'Thursday 24.09.2026',
				'- Hifz, 18:00 – 19:00 (rescheduled)',
				'',
				'Saturday 26.09.2026',
				'- Cercle, time to be confirmed'
			].join('\n')
		);
	});

	it('writes it in Arabic, with the Arabic comma and Latin digits', () => {
		expect(weekMessage('السلام عليكم', 'جمعية بيل', SEMAINE, 'ar')).toBe(
			[
				'السلام عليكم،',
				'',
				'برنامج هذا الأسبوع في جمعية بيل:',
				'',
				'الاثنين 21.09.2026',
				'- Tafsir، 19:00 – 20:30، Salle 1',
				'- Arabe، 17:00 – 18:00 (ملغى)',
				'',
				'الأربعاء 23.09.2026',
				'- Fiqh، بعد المغرب بـ30 دقيقة',
				'',
				'الخميس 24.09.2026',
				'- Hifz، 18:00 – 19:00 (موعد استثنائي)',
				'',
				'السبت 26.09.2026',
				'- Cercle، الوقت لم يُحدَّد بعد'
			].join('\n')
		);
	});

	it('says so plainly when there is nothing that week, in each language', () => {
		expect(LANGUES.map((langue) => weekMessage(SALUT, 'X', [], langue).split('\n').at(-1))).toEqual(
			[
				'Aucune séance cette semaine.',
				'Diese Woche keine Termine.',
				'Nessuna lezione questa settimana.',
				'No sessions this week.',
				'لا حصص هذا الأسبوع.'
			]
		);
	});

	it('stays in French when no language is given, as the screens call it today', () => {
		expect(weekMessage(SALUT, ORGANISATION, SEMAINE)).toBe(
			weekMessage(SALUT, ORGANISATION, SEMAINE, 'fr')
		);
	});
});

describe('l’annonce d’une annulation, dans les cinq langues', () => {
	const date = '2026-09-26' as IsoDate;

	it('says which session is cancelled, and that the others go on', () => {
		expect(LANGUES.map((langue) => cancellationMessage(SALUT, 'Tafsir', date, langue))).toEqual([
			[
				'Salam alaykoum,',
				'',
				'Le cours « Tafsir » du samedi 26.09.2026 est annulé.',
				'Les autres séances ont lieu normalement.'
			].join('\n'),
			[
				'Salam alaykoum,',
				'',
				'Der Kurs «Tafsir» vom Samstag, 26.09.2026, fällt aus.',
				'Die anderen Termine finden wie gewohnt statt.'
			].join('\n'),
			[
				'Salam alaykoum,',
				'',
				'La lezione «Tafsir» di sabato 26.09.2026 è annullata.',
				'Le altre lezioni si svolgono regolarmente.'
			].join('\n'),
			[
				'Salam alaykoum,',
				'',
				'The ‘Tafsir’ session on Saturday 26.09.2026 is cancelled.',
				'The other sessions go ahead as usual.'
			].join('\n'),
			[
				'Salam alaykoum،',
				'',
				'أُلغي درس «Tafsir» يوم السبت 26.09.2026.',
				'تُقام الحصص الأخرى كالمعتاد.'
			].join('\n')
		]);
	});

	it('stays in French when no language is given', () => {
		expect(cancellationMessage(SALUT, 'Tafsir', date)).toBe(
			cancellationMessage(SALUT, 'Tafsir', date, 'fr')
		);
	});
});

describe('l’annonce d’un déplacement, dans les cinq langues', () => {
	const de = '2026-09-26' as IsoDate;
	const vers = '2026-09-28' as IsoDate;

	it('carries both dates and the new time', () => {
		expect(
			LANGUES.map((langue) => moveMessage(SALUT, 'Tafsir', de, vers, '18:00', langue))
		).toEqual([
			[
				'Salam alaykoum,',
				'',
				'Le cours « Tafsir » du samedi 26.09.2026 est déplacé au lundi 28.09.2026 à 18:00.',
				'Les autres séances ont lieu normalement.'
			].join('\n'),
			[
				'Salam alaykoum,',
				'',
				'Der Kurs «Tafsir» vom Samstag, 26.09.2026, wird auf Montag, 28.09.2026, um 18:00 verschoben.',
				'Die anderen Termine finden wie gewohnt statt.'
			].join('\n'),
			[
				'Salam alaykoum,',
				'',
				'La lezione «Tafsir» di sabato 26.09.2026 è spostata a lunedì 28.09.2026 alle 18:00.',
				'Le altre lezioni si svolgono regolarmente.'
			].join('\n'),
			[
				'Salam alaykoum,',
				'',
				'The ‘Tafsir’ session on Saturday 26.09.2026 has been moved to Monday 28.09.2026 at 18:00.',
				'The other sessions go ahead as usual.'
			].join('\n'),
			[
				'Salam alaykoum،',
				'',
				'نُقل درس «Tafsir» من يوم السبت 26.09.2026 إلى يوم الاثنين 28.09.2026 في الساعة 18:00.',
				'تُقام الحصص الأخرى كالمعتاد.'
			].join('\n')
		]);
	});
});

describe('l’annonce d’un cours nouveau, dans les cinq langues', () => {
	it('names the course, its rhythm, its time and its room', () => {
		const rythmes = {
			fr: 'le lundi',
			de: 'jeden Montag',
			it: 'il lunedì',
			en: 'every Monday',
			ar: 'كل الاثنين'
		} as const;
		const horaires = {
			fr: 'de 19:00 à 20:30',
			de: 'von 19:00 bis 20:30',
			it: 'dalle 19:00 alle 20:30',
			en: 'from 19:00 to 20:30',
			ar: 'من 19:00 إلى 20:30'
		} as const;
		expect(
			LANGUES.map((langue) =>
				newCourseMessage(SALUT, 'Tafsir', rythmes[langue], horaires[langue], 'Salle 1', langue)
					.split('\n')
					.at(-1)
			)
		).toEqual([
			'Nouveau cours : « Tafsir », le lundi, de 19:00 à 20:30, Salle 1.',
			'Neuer Kurs: «Tafsir», jeden Montag, von 19:00 bis 20:30, Salle 1.',
			'Nuovo corso: «Tafsir», il lunedì, dalle 19:00 alle 20:30, Salle 1.',
			'New course: ‘Tafsir’, every Monday, from 19:00 to 20:30, Salle 1.',
			'درس جديد: «Tafsir»، كل الاثنين، من 19:00 إلى 20:30، Salle 1.'
		]);
		// Sans salle, la phrase s'arrête à l'horaire.
		expect(
			newCourseMessage(SALUT, 'Tafsir', 'every Monday', 'from 19:00 to 20:30', null, 'en')
		).toContain('New course: ‘Tafsir’, every Monday, from 19:00 to 20:30.');
	});
});

describe('les dates des messages', () => {
	it('never writes a date as AAAA-MM-JJ, in any language, and always as JJ.MM.AAAA', () => {
		for (const langue of LANGUES) {
			const messages = [
				weekMessage(SALUT, ORGANISATION, SEMAINE, langue),
				cancellationMessage(SALUT, 'Tafsir', '2026-09-26' as IsoDate, langue),
				moveMessage(
					SALUT,
					'Tafsir',
					'2026-09-26' as IsoDate,
					'2026-10-01' as IsoDate,
					'18:00',
					langue
				)
			];
			for (const message of messages) {
				expect(message, langue).not.toMatch(/\d{4}-\d{2}-\d{2}/);
				expect(message, langue).toMatch(/\b\d{2}\.\d{2}\.\d{4}\b/);
				// Les chiffres latins, l'arabe compris (ADR 0007).
				expect(message, langue).not.toMatch(/[٠-٩۰-۹]/);
			}
		}
	});
});

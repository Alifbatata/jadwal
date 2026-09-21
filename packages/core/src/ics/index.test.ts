// Tests de l'export agenda (ics/index.ts) : instantané d'un calendrier complet, contrôle croisé avec
// ical.js sur deux ans, échappement des textes, validation des entrées et cas limites. Les tests
// suivent la spécification de l'étape 1 (docs/CADRAGE.md, ADR 0003) ; un écart du code est un test
// rouge, jamais un attendu adapté.
//
// Calendrier de référence 2026-2028, calculé à la main (1970-01-01 est un jeudi) :
// - septembre 2026 commence un mardi : lundis 7, 14, 21, 28 ; mercredis 2, 9, 16, 23, 30 ; jeudis 3,
//   10, 17, 24 ; vendredis 4, 11, 18, 25 ; samedis 5, 12, 19, 26.
// - octobre 2026 commence un jeudi : lundis 5, 12, 19, 26 ; mercredis 7, 14, 21, 28 ; vendredis 2, 9,
//   16, 23, 30 ; samedis 3, 10, 17, 24, 31 ; dimanches 4, 11, 18, 25.
// - novembre 2026 commence un dimanche : lundis 2, 9, 16, 23, 30 ; jeudis 5, 12, 19, 26.
// - décembre 2026 commence un mardi : lundis 7, 14, 21, 28 ; mercredis 2, 9, 16, 23, 30 ; jeudis 3,
//   10, 17, 24, 31 ; samedis 5, 12, 19, 26.
// - 2027 commence un vendredi : dimanche 3 janvier ; février commence un lundi (jeudi 4) ; mars
//   commence un lundi (dimanche 7, lundi 8, samedi 27) ; mai commence un samedi (samedis 1, 8, 15,
//   22, 29) ; juin commence un mardi (mercredi 30) ; juillet commence un jeudi (jeudis 1, 8, 15, 22,
//   29) ; août commence un dimanche (jeudis 5, 12) ; novembre commence un lundi (jeudi 4).
// - 2028 (bissextile) commence un samedi : mars commence un mercredi (jeudis 2, 9, 16, 23, 30 ;
//   samedis 4, 11, 18, 25).
// - Semaines actives d'un cours « une semaine sur deux » ancré sur la semaine du lundi 7 septembre
//   2026 : lundis 7 et 21 sept., 5 et 19 oct., 2, 16 et 30 nov., 14 et 28 déc. 2026, 11 et 25 janv.,
//   8 et 22 févr., 8 et 22 mars, 5 et 19 avr., 3, 17 et 31 mai, 14 et 28 juin 2027.
// - Heure d'été Europe/Zurich (UTC+2) du dernier dimanche de mars au dernier dimanche d'octobre :
//   2026-03-29 → 2026-10-25, 2027-03-28 → 2027-10-31, 2028-03-26 → 2028-10-29 ; UTC+1 sinon.

import ICAL from 'ical.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { daysFromCivil, daysToIsoDate, formatLocalTime, isoDateToDays } from '../dates.js';
import { expandOccurrences, ruleDays } from '../expand.js';
import type {
	CourseSchedule,
	IsoDate,
	LocalTime,
	Occurrence,
	Pause,
	Prayer,
	PrayerDay,
	PrayerTimesLookup,
	Recurrence,
	SessionException,
	Timing,
	Weekday
} from '../types.js';
import { ValidationError, type ValidationIssue } from '../validation.js';
import { civilToUtc } from './civil.js';
import {
	DEFAULT_HORIZON_DAYS,
	DEFAULT_PAST_DAYS,
	buildCalendar,
	canonicalTimeZone,
	canonicalTimeZones,
	isCanonicalTimeZone,
	vtimezoneFor,
	type BuildCalendarInput,
	type CalendarCourse
} from './index.js';
import {
	civilKey,
	civilSessionOf,
	expandWithIcalJs,
	lineValue,
	masterEvent,
	parseCalendar,
	startDateOf,
	textValue,
	uidOf,
	unfoldLines,
	utf8Length,
	veventBlocks
} from './test-helpers.js';

const ZONE = 'Europe/Zurich';
const HOST = 'jadwal.example';
/** 10:00 à Zurich : « aujourd'hui » vaut 2026-09-20. */
const NOW = new Date('2026-09-20T08:00:00Z');

const anchorLabel = (prayer: Prayer, offsetMinutes: number): string =>
	`Après ${prayer} (${offsetMinutes >= 0 ? '+' : ''}${offsetMinutes} min)`;

function calendarInput(overrides: Partial<BuildCalendarInput>): BuildCalendarInput {
	return {
		name: 'Test',
		timeZone: ZONE,
		now: NOW,
		uidHost: HOST,
		courses: [],
		anchorLabel,
		...overrides
	};
}

const fixed = (start: LocalTime, end: LocalTime): Timing => ({ kind: 'fixed', start, end });

const weekly = (
	weekdays: Weekday[],
	interval: 1 | 2 = 1,
	anchorDate: IsoDate = '2026-09-07'
): Recurrence => ({
	kind: 'weekly',
	weekdays,
	interval,
	anchorDate
});

const monthly = (weekday: Weekday, ordinal: 1 | 2 | 3 | 4 | -1): Recurrence => ({
	kind: 'monthly',
	weekday,
	ordinal
});

const dates = (list: IsoDate[]): Recurrence => ({ kind: 'dates', dates: list });

function course(
	id: string,
	recurrence: Recurrence,
	timing: Timing,
	extra: Partial<CourseSchedule> & Partial<Omit<CalendarCourse, 'schedule'>> = {}
): CalendarCourse {
	const { title, description, location, url, ...schedule } = extra;
	return {
		schedule: { id, recurrence, timing, startsOn: '2026-09-01', sequence: 0, ...schedule },
		title: title ?? `Cours ${id}`,
		...(description === undefined ? {} : { description }),
		...(location === undefined ? {} : { location }),
		...(url === undefined ? {} : { url })
	};
}

function lookupFrom(days: readonly PrayerDay[]): PrayerTimesLookup {
	const byDate = new Map(days.map((day) => [day.date, day]));
	return (date) => byDate.get(date);
}

/** Anomalies de la ValidationError levée par `fn` ; échoue si rien n'est levé. */
function validationIssues(fn: () => unknown): ValidationIssue[] {
	try {
		fn();
	} catch (error) {
		if (error instanceof ValidationError) return [...error.issues];
		throw error;
	}
	throw new Error('expected a ValidationError');
}

const uidsOf = (ics: string): string[] =>
	veventBlocks(ics).map((block) => lineValue(block, 'UID') ?? '');

// ---------------------------------------------------------------------------------------------
// 1. Instantané d'un calendrier complet et réaliste
// ---------------------------------------------------------------------------------------------

/**
 * DONNÉES DE TEST : heures de prière plausibles pour Bienne, PAS des heures officielles. Quatre
 * vendredis seulement ; le vendredi 2026-10-23 n'a volontairement pas d'entrée.
 */
const SNAPSHOT_PRAYER_DAYS: readonly PrayerDay[] = [
	{
		date: '2026-09-18',
		fajr: '05:36',
		dhuhr: '13:23',
		asr: '16:52',
		maghrib: '19:38',
		isha: '21:08'
	},
	{
		date: '2026-09-25',
		fajr: '05:45',
		dhuhr: '13:21',
		asr: '16:41',
		maghrib: '19:23',
		isha: '20:53'
	},
	{
		date: '2026-10-02',
		fajr: '05:54',
		dhuhr: '13:18',
		asr: '16:30',
		maghrib: '19:09',
		isha: '20:39'
	},
	{
		date: '2026-10-30',
		fajr: '05:31',
		dhuhr: '12:15',
		asr: '15:00',
		maghrib: '17:14',
		isha: '18:44'
	}
];

const ORGANISATION: BuildCalendarInput = calendarInput({
	name: 'Communauté de Bienne, cours; 2026-2027',
	courses: [
		// Ancré sur maghrib, le vendredi, +15 min arrondi aux 5 min supérieures, 60 min.
		course(
			'tafsir',
			weekly([5]),
			{ kind: 'prayer', prayer: 'maghrib', offsetMinutes: 15, durationMinutes: 60 },
			{
				sequence: 2,
				title: 'Tafsir du vendredi',
				description: 'Sourate Al-Kahf, versets 1 à 10',
				location: 'Grande salle',
				url: 'https://example.org/cours/tafsir'
			}
		),
		// Hebdomadaire lundi et mercredi, à partir d'un mardi : première séance le mercredi 2 septembre.
		course('arabic-1', weekly([1, 3]), fixed('19:00', '21:00'), {
			endsOn: '2026-12-16',
			sequence: 3,
			title: 'Arabe, niveau 1; العربية 📖',
			description: 'Manuel : tome 1, leçons 1 à 5.\nApporter un cahier; pas de manuel numérique.',
			location: 'Salle 2, Centre culturel, Bienne',
			url: 'https://example.org/cours/arabe-1'
		}),
		// Dates précises, 21:30-00:30 : la séance se termine le lendemain.
		course('seminar', dates(['2026-09-25', '2026-10-02', '2026-10-23']), fixed('21:30', '00:30'), {
			sequence: 1,
			title: 'Séminaire « Fiqh » 🕌',
			description:
				'Cycle de trois soirées ; la séance se termine après minuit.\nEntrée libre, inscription conseillée.',
			location: 'Salle 1'
		}),
		// Mensuel, dernier samedi, sans date de fin : première séance le samedi 26 septembre.
		course('tajwid', monthly(6, -1), fixed('10:00', '12:00'), {
			title: 'Tajwid, groupe du samedi',
			description: 'Règles de récitation ; niveau intermédiaire.',
			location: 'Salle 1'
		})
	],
	exceptions: [
		{ kind: 'cancelled', courseId: 'arabic-1', date: '2026-09-09' },
		{
			kind: 'moved',
			courseId: 'arabic-1',
			date: '2026-09-14',
			toDate: '2026-09-15',
			toStart: '20:00'
		},
		{
			kind: 'moved',
			courseId: 'seminar',
			date: '2026-10-02',
			toDate: '2026-10-03',
			toStart: '18:00'
		},
		{ kind: 'cancelled', courseId: 'seminar', date: '2026-10-23' }
	],
	// Vacances d'automne de toute l'organisation : lundis 5 et 12, mercredis 7 et 14 octobre,
	// vendredis 9 et 16 octobre.
	pauses: [{ from: '2026-10-05', to: '2026-10-18' }],
	prayerTimes: lookupFrom(SNAPSHOT_PRAYER_DAYS)
});

describe('buildCalendar: full organisation calendar (now = 2026-09-20T08:00:00Z, Europe/Zurich)', () => {
	const ics = buildCalendar(ORGANISATION);
	const lines = unfoldLines(ics);
	const blocks = veventBlocks(ics);
	const blockWithUid = (uid: string): string[][] =>
		blocks.filter((block) => lineValue(block, 'UID') === `${uid}@${HOST}`);

	it('uses CRLF line endings only and ends with a CRLF', () => {
		expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		// RFC 5545 §3.4 : l'objet se termine par END:VCALENDAR suivi d'un CRLF.
		expect(ics.endsWith('\r\nEND:VCALENDAR\r\n')).toBe(true);
		for (const line of ics.slice(0, -2).split('\r\n')) {
			expect(line).not.toContain('\n');
			expect(line).not.toContain('\r');
		}
	});

	it('embeds the Europe/Zurich VTIMEZONE with its last-Sunday March and October rules', () => {
		const start = lines.indexOf('BEGIN:VTIMEZONE');
		const end = lines.indexOf('END:VTIMEZONE');
		expect(start).toBeGreaterThan(0);
		expect(end).toBeGreaterThan(start);
		const zone = lines.slice(start, end + 1);
		expect(zone).toContain('TZID:Europe/Zurich');
		expect(zone).toContain('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU');
		expect(zone).toContain('RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU');
		expect(zone).toContain('TZOFFSETTO:+0200');
		expect(zone).toContain('TZOFFSETTO:+0100');
		expect(lines.filter((line) => line === 'BEGIN:VTIMEZONE')).toHaveLength(1);
	});

	it('escapes the calendar name in NAME and X-WR-CALNAME', () => {
		expect(lines).toContain('NAME:Communauté de Bienne\\, cours\\; 2026-2027');
		expect(lines).toContain('X-WR-CALNAME:Communauté de Bienne\\, cours\\; 2026-2027');
	});

	it('declares PRODID and a one-hour refresh interval, before any component and without METHOD', () => {
		expect(lines.some((line) => line.startsWith('PRODID:'))).toBe(true);
		expect(lines).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H');
		expect(lines).toContain('X-PUBLISHED-TTL:PT1H');
		expect(lines).toContain('X-WR-TIMEZONE:Europe/Zurich');
		// RFC 5545 §3.6 : icalbody = calprops component. Toutes les propriétés du calendrier
		// précèdent le premier BEGIN: (ical-generator les écrirait après).
		const firstComponent = lines.findIndex((line, index) => index > 0 && line.startsWith('BEGIN:'));
		for (const property of [
			'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
			'X-PUBLISHED-TTL:PT1H',
			'X-WR-TIMEZONE:Europe/Zurich'
		]) {
			expect(lines.indexOf(property), property).toBeLessThan(firstComponent);
		}
		// RFC 5546 §3.2.1 : METHOD:PUBLISH exigerait un ORGANIZER dans chaque VEVENT.
		expect(lines.some((line) => line.startsWith('METHOD:'))).toBe(false);
	});

	it('stamps every VEVENT with DTSTAMP = now in UTC', () => {
		expect(blocks).toHaveLength(9);
		for (const block of blocks) expect(block).toContain('DTSTAMP:20260920T080000Z');
	});

	it('exports the weekly course as one master VEVENT: DTSTART on the first real session, RRULE with UNTIL in UTC, sorted EXDATE', () => {
		const [master] = blockWithUid('arabic-1');
		expect(master).toBeDefined();
		expect(master).toContain('SEQUENCE:3');
		// startsOn est un mardi : première vraie séance le mercredi 2 septembre.
		expect(master).toContain('DTSTART;TZID=Europe/Zurich:20260902T190000');
		expect(master).toContain('DTEND;TZID=Europe/Zurich:20260902T210000');
		// Fin du 16 décembre 2026 à Zurich (heure d'hiver, UTC+1) : 23:59:59 → 22:59:59Z.
		expect(master).toContain(
			'RRULE:FREQ=WEEKLY;INTERVAL=1;WKST=MO;BYDAY=MO,WE;UNTIL=20261216T225959Z'
		);
		// Annulation du 9 septembre puis les quatre séances des vacances d'automne, à l'heure du DTSTART.
		expect(master).toContain(
			'EXDATE;TZID=Europe/Zurich:20260909T190000,20261005T190000,20261007T190000,20261012T190000,20261014T190000'
		);
		expect(master?.some((line) => line.startsWith('RECURRENCE-ID'))).toBe(false);
		expect(master).toContain('SUMMARY:Arabe\\, niveau 1\\; العربية 📖');
		expect(master).toContain(
			'DESCRIPTION:Manuel : tome 1\\, leçons 1 à 5.\\nApporter un cahier\\; pas de manuel numérique.'
		);
		expect(master).toContain('LOCATION:Salle 2\\, Centre culturel\\, Bienne');
		expect(master).toContain('URL;VALUE=URI:https://example.org/cours/arabe-1');
	});

	it('exports the moved weekly session as a separate VEVENT with the same UID, RECURRENCE-ID and no EXDATE', () => {
		const [, moved] = blockWithUid('arabic-1');
		expect(moved).toBeDefined();
		expect(moved).toContain('RECURRENCE-ID;TZID=Europe/Zurich:20260914T190000');
		expect(moved).toContain('DTSTART;TZID=Europe/Zurich:20260915T200000');
		expect(moved).toContain('DTEND;TZID=Europe/Zurich:20260915T220000');
		expect(moved).toContain('SEQUENCE:3');
		expect(moved?.some((line) => line.startsWith('EXDATE'))).toBe(false);
		expect(moved?.some((line) => line.startsWith('RRULE'))).toBe(false);
		expect(blockWithUid('arabic-1')).toHaveLength(2);
	});

	it('exports the monthly last-Saturday course with RRULE:FREQ=MONTHLY;BYDAY=-1SA and no EXDATE', () => {
		const [master] = blockWithUid('tajwid');
		expect(blockWithUid('tajwid')).toHaveLength(1);
		expect(master).toContain('SEQUENCE:0');
		expect(master).toContain('DTSTART;TZID=Europe/Zurich:20260926T100000');
		expect(master).toContain('DTEND;TZID=Europe/Zurich:20260926T120000');
		expect(master).toContain('RRULE:FREQ=MONTHLY;BYDAY=-1SA');
		expect(master?.some((line) => line.startsWith('EXDATE'))).toBe(false);
	});

	it('exports dated sessions one by one: end past midnight, moved session under its original UID, cancelled omitted', () => {
		const uids = uidsOf(ics);
		const [regular] = blockWithUid('seminar-2026-09-25');
		expect(regular).toContain('DTSTART;TZID=Europe/Zurich:20260925T213000');
		expect(regular).toContain('DTEND;TZID=Europe/Zurich:20260926T003000');
		expect(regular).toContain('SEQUENCE:1');
		expect(regular).toContain('SUMMARY:Séminaire « Fiqh » 🕌');
		expect(regular).toContain(
			'DESCRIPTION:Cycle de trois soirées \\; la séance se termine après minuit.\\nEntrée libre\\, inscription conseillée.'
		);
		const [moved] = blockWithUid('seminar-2026-10-02');
		expect(moved).toContain('DTSTART;TZID=Europe/Zurich:20261003T180000');
		expect(moved).toContain('DTEND;TZID=Europe/Zurich:20261003T210000');
		expect(moved?.some((line) => line.startsWith('RECURRENCE-ID'))).toBe(false);
		expect(uids).not.toContain(`seminar-2026-10-03@${HOST}`);
		expect(uids).not.toContain(`seminar-2026-10-23@${HOST}`);
		expect(uids.filter((uid) => uid.startsWith('seminar-'))).toHaveLength(2);
	});

	it('exports anchored sessions with the anchor label first and omits the day without prayer times', () => {
		const uids = uidsOf(ics);
		expect(uids.filter((uid) => uid.startsWith('tafsir-'))).toEqual([
			`tafsir-2026-09-18@${HOST}`,
			`tafsir-2026-09-25@${HOST}`,
			`tafsir-2026-10-02@${HOST}`,
			`tafsir-2026-10-30@${HOST}`
		]);
		// 19:23 + 15 min = 19:38, arrondi à 19:40 ; fin 60 min plus tard.
		const [session] = blockWithUid('tafsir-2026-09-25');
		expect(session).toContain('DTSTART;TZID=Europe/Zurich:20260925T194000');
		expect(session).toContain('DTEND;TZID=Europe/Zurich:20260925T204000');
		expect(session).toContain('SEQUENCE:2');
		expect(session).toContain(
			'DESCRIPTION:Après maghrib (+15 min)\\nSourate Al-Kahf\\, versets 1 à 10'
		);
		// 17:14 + 15 = 17:29 → 17:30, heure d'hiver.
		expect(blockWithUid('tafsir-2026-10-30')[0]).toContain(
			'DTSTART;TZID=Europe/Zurich:20261030T173000'
		);
		// Vendredi 23 octobre : pas d'heure de prière connue ; 9 et 16 octobre : en pause.
		expect(uids).not.toContain(`tafsir-2026-10-23@${HOST}`);
		expect(uids).not.toContain(`tafsir-2026-10-09@${HOST}`);
		expect(uids).not.toContain(`tafsir-2026-10-16@${HOST}`);
	});

	it('orders VEVENTs by course id, master first, then moved and dated sessions by date', () => {
		expect(uidsOf(ics)).toEqual([
			`arabic-1@${HOST}`,
			`arabic-1@${HOST}`,
			`seminar-2026-09-25@${HOST}`,
			`seminar-2026-10-02@${HOST}`,
			`tafsir-2026-09-18@${HOST}`,
			`tafsir-2026-09-25@${HOST}`,
			`tafsir-2026-10-02@${HOST}`,
			`tafsir-2026-10-30@${HOST}`,
			`tajwid@${HOST}`
		]);
	});

	it('matches the file snapshot byte for byte', async () => {
		await expect(ics).toMatchFileSnapshot('./snapshots/organisation.ics');
	});
});

// ---------------------------------------------------------------------------------------------
// 2. Contrôle croisé avec ical.js sur deux ans (quatre changements d'heure)
// ---------------------------------------------------------------------------------------------

/**
 * DONNÉES DE TEST : table synthétique et lisse pour toute date (maghrib entre 16:30 et 19:30 selon
 * la saison, isha 90 min plus tard), PAS des heures réelles. Sert au contrôle croisé des cours ancrés.
 */
const syntheticPrayerTimes: PrayerTimesLookup = (date) => {
	const year = Number(date.slice(0, 4));
	const dayOfYear = isoDateToDays(date) - daysFromCivil(year, 1, 1);
	const maghrib = 18 * 60 + Math.round(90 * Math.sin(((dayOfYear - 80) / 365) * 2 * Math.PI));
	return {
		date,
		fajr: formatLocalTime(maghrib - 13 * 60),
		dhuhr: '12:30',
		asr: formatLocalTime(maghrib - 3 * 60),
		maghrib: formatLocalTime(maghrib),
		isha: formatLocalTime(maghrib + 90)
	};
};

const CROSS_FROM: IsoDate = '2026-09-20';
const CROSS_TO: IsoDate = '2028-09-20';
/** Fenêtre des cours datés et ancrés : pastDays 30 et horizonDays 365 autour du 2026-09-20. */
const DATED_FROM: IsoDate = '2026-08-21';
const DATED_TO: IsoDate = '2027-09-20';

const RECURRING_IDS = ['w1', 'w2', 'm1', 'm2'] as const;
const DATED_IDS = ['d1', 'a1', 'a2'] as const;

const CROSS_COURSES: readonly CalendarCourse[] = [
	// Hebdomadaire un jour (jeudi), sans fin, première séance le jeudi 3 septembre 2026.
	course('w1', weekly([4]), fixed('18:30', '20:00'), { sequence: 1 }),
	// Lundi et mercredi une semaine sur deux (semaines du 7 septembre), à partir du mardi 22
	// septembre : première séance le mercredi 23 septembre, dernière le mercredi 30 juin 2027.
	course('w2', weekly([1, 3], 2, '2026-09-07'), fixed('19:00', '21:00'), {
		startsOn: '2026-09-22',
		endsOn: '2027-06-30',
		sequence: 4
	}),
	// Premier dimanche du mois, à partir du jeudi 1er octobre : première séance le 4 octobre 2026.
	course('m1', monthly(7, 1), fixed('09:00', '11:00'), { startsOn: '2026-10-01' }),
	// Dernier samedi du mois, à partir du dimanche 27 septembre : première séance le 31 octobre
	// 2026, dernière le samedi 25 mars 2028 (endsOn inclus, veille du passage à l'heure d'été).
	course('m2', monthly(6, -1), fixed('14:00', '16:00'), {
		startsOn: '2026-09-27',
		endsOn: '2028-03-25',
		sequence: 2
	}),
	// Dates précises, dont deux hors fenêtre (avant le 21 août 2026, après le 20 septembre 2027).
	course(
		'd1',
		dates([
			'2026-08-15',
			'2026-08-28',
			'2026-10-10',
			'2026-12-12',
			'2027-03-27',
			'2027-09-20',
			'2027-09-21',
			'2027-10-01'
		]),
		fixed('20:00', '22:00'),
		{ startsOn: '2026-08-01' }
	),
	// Ancré sur isha le vendredi, +30 min, 90 min.
	course('a1', weekly([5]), {
		kind: 'prayer',
		prayer: 'isha',
		offsetMinutes: 30,
		durationMinutes: 90
	}),
	// Ancré sur isha le samedi, décalage maximal : passe minuit en été.
	course('a2', weekly([6]), {
		kind: 'prayer',
		prayer: 'isha',
		offsetMinutes: 240,
		durationMinutes: 120
	})
];

const CROSS_EXCEPTIONS: readonly SessionException[] = [
	{ kind: 'cancelled', courseId: 'w1', date: '2026-11-05' },
	{ kind: 'moved', courseId: 'w1', date: '2027-02-04', toDate: '2027-02-06', toStart: '10:00' },
	// Déplacement de la première occurrence de w2, puis déplacement vers un autre mois.
	{ kind: 'moved', courseId: 'w2', date: '2026-09-23', toDate: '2026-09-24', toStart: '19:30' },
	{ kind: 'moved', courseId: 'w2', date: '2026-11-30', toDate: '2026-12-03', toStart: '18:00' },
	{ kind: 'cancelled', courseId: 'w2', date: '2027-03-08' },
	{ kind: 'cancelled', courseId: 'm1', date: '2027-03-07' },
	{ kind: 'moved', courseId: 'm2', date: '2027-05-29', toDate: '2027-06-05', toStart: '14:00' },
	{ kind: 'cancelled', courseId: 'd1', date: '2026-10-10' },
	{ kind: 'moved', courseId: 'd1', date: '2026-12-12', toDate: '2026-12-13', toStart: '15:00' }
];

const CROSS_PAUSES: readonly Pause[] = [
	// Vacances de fin d'année de toute l'organisation.
	{ from: '2026-12-21', to: '2027-01-03' },
	// Pause d'été propre au cours w1.
	{ from: '2027-07-05', to: '2027-08-15', courseId: 'w1' }
];

/** expandOccurrences par tranches de 365 jours (garde-fou de 400 jours) sur [from, to]. */
function expandInChunks(
	schedules: readonly CourseSchedule[],
	from: IsoDate,
	to: IsoDate
): Occurrence[] {
	const result: Occurrence[] = [];
	const last = isoDateToDays(to);
	for (let chunkStart = isoDateToDays(from); chunkStart <= last;) {
		const chunkEnd = Math.min(last, chunkStart + 364);
		result.push(
			...expandOccurrences({
				schedules,
				exceptions: CROSS_EXCEPTIONS,
				pauses: CROSS_PAUSES,
				prayerTimes: syntheticPrayerTimes,
				range: { from: daysToIsoDate(chunkStart), to: daysToIsoDate(chunkEnd) }
			})
		);
		chunkStart = chunkEnd + 1;
	}
	return result;
}

/** Clés « début -> fin » civiles des séances qui ont lieu, par cours, dans [from, to] (jour de début réel). */
function expectedKeys(
	schedules: readonly CourseSchedule[],
	from: IsoDate,
	to: IsoDate
): Map<string, string[]> {
	const keys = new Map<string, string[]>();
	for (const occurrence of expandInChunks(schedules, from, to)) {
		if (occurrence.status !== 'scheduled' && occurrence.status !== 'moved_here') continue;
		if (occurrence.start === null) continue;
		const session = civilSessionOf(occurrence);
		const day = startDateOf(session);
		if (day < from || day > to) continue;
		const list = keys.get(occurrence.courseId) ?? [];
		list.push(civilKey(session));
		keys.set(occurrence.courseId, list);
	}
	for (const list of keys.values()) list.sort();
	return keys;
}

describe('buildCalendar: cross-check with ical.js from 2026-09-20 to 2028-09-20', () => {
	beforeEach(() => {
		ICAL.TimezoneService.reset();
	});

	const input = calendarInput({
		name: 'Contrôle croisé',
		pastDays: 30,
		horizonDays: 365,
		courses: CROSS_COURSES,
		exceptions: CROSS_EXCEPTIONS,
		pauses: CROSS_PAUSES,
		prayerTimes: syntheticPrayerTimes
	});
	const ics = buildCalendar(input);
	const lines = unfoldLines(ics);
	const schedules = CROSS_COURSES.map((item) => item.schedule);
	const recurringSchedules = schedules.filter((schedule) =>
		(RECURRING_IDS as readonly string[]).includes(schedule.id)
	);
	const datedSchedules = schedules.filter((schedule) =>
		(DATED_IDS as readonly string[]).includes(schedule.id)
	);

	it('writes every DTSTART with the Europe/Zurich TZID that ical.js resolves (no floating fallback)', () => {
		const calendar = parseCalendar(ics);
		const vevents = calendar.getAllSubcomponents('vevent');
		expect(vevents.length).toBeGreaterThan(60);
		for (const component of vevents) {
			const event = new ICAL.Event(component);
			expect(event.startDate.zone.tzid).toBe(ZONE);
			expect(event.endDate.zone.tzid).toBe(ZONE);
		}
	});

	it('writes UNTIL in UTC with the Z suffix on the RRULE lines', () => {
		expect(lines).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1;WKST=MO;BYDAY=TH');
		// 30 juin 2027 23:59:59 à Zurich, heure d'été (UTC+2) → 21:59:59Z.
		expect(lines).toContain(
			'RRULE:FREQ=WEEKLY;INTERVAL=2;WKST=MO;BYDAY=MO,WE;UNTIL=20270630T215959Z'
		);
		expect(lines).toContain('RRULE:FREQ=MONTHLY;BYDAY=1SU');
		// 25 mars 2028 23:59:59 à Zurich, heure d'hiver (UTC+1, l'été commence le 26) → 22:59:59Z.
		expect(lines).toContain('RRULE:FREQ=MONTHLY;BYDAY=-1SA;UNTIL=20280325T225959Z');
		for (const line of lines.filter(
			(item) => item.startsWith('RRULE:') && item.includes('UNTIL=')
		)) {
			expect(line).toMatch(/;UNTIL=\d{8}T\d{6}Z$/);
		}
	});

	it('lists cancelled and paused sessions in EXDATE, at the DTSTART time, sorted', () => {
		// w1 : annulation du 5 novembre, jeudis 24 et 31 décembre en pause d'organisation, six
		// jeudis de la pause d'été du cours.
		expect(lines).toContain(
			'EXDATE;TZID=Europe/Zurich:20261105T183000,20261224T183000,20261231T183000,20270708T183000,20270715T183000,20270722T183000,20270729T183000,20270805T183000,20270812T183000'
		);
		// w2 : lundi 28 et mercredi 30 décembre en pause, annulation du lundi 8 mars.
		expect(lines).toContain(
			'EXDATE;TZID=Europe/Zurich:20261228T190000,20261230T190000,20270308T190000'
		);
		// m1 : dimanche 3 janvier en pause, annulation du 7 mars. m2 : samedi 26 décembre en pause.
		expect(lines).toContain('EXDATE;TZID=Europe/Zurich:20270103T090000,20270307T090000');
		expect(lines).toContain('EXDATE;TZID=Europe/Zurich:20261226T140000');
	});

	for (const id of RECURRING_IDS) {
		it(`expands ${id} with ical.js to exactly the scheduled and moved_here sessions of expandOccurrences`, () => {
			const calendar = parseCalendar(ics);
			const expanded = expandWithIcalJs(masterEvent(calendar, `${id}@${HOST}`), CROSS_TO).filter(
				(item) => startDateOf(item) >= CROSS_FROM && startDateOf(item) <= CROSS_TO
			);
			const actual = expanded.map(civilKey).sort();
			const expected = expectedKeys(recurringSchedules, CROSS_FROM, CROSS_TO).get(id) ?? [];
			expect(actual.length).toBeGreaterThan(15);
			expect(actual).toEqual(expected);
			// Aucune date d'EXDATE ne réapparaît dans la série développée.
			const seriesDates = new Set(expanded.map((item) => item.recurrenceDate));
			for (const date of [
				'2026-11-05',
				'2026-12-24',
				'2026-12-31',
				'2027-07-08',
				'2026-12-28',
				'2026-12-30',
				'2027-03-08',
				'2027-01-03',
				'2027-03-07',
				'2026-12-26'
			]) {
				expect(seriesDates.has(date)).toBe(false);
			}
		});
	}

	it('replaces moved sessions through RECURRENCE-ID at the new date and time (getOccurrenceDetails)', () => {
		const calendar = parseCalendar(ics);
		const find = (id: string, recurrenceDate: string) =>
			expandWithIcalJs(masterEvent(calendar, `${id}@${HOST}`), CROSS_TO).find(
				(item) => item.recurrenceDate === recurrenceDate
			);
		// Première occurrence de w2 déplacée d'un jour.
		expect(find('w2', '2026-09-23')).toMatchObject({
			fromException: true,
			start: '2026-09-24 19:30',
			end: '2026-09-24 21:30'
		});
		// Déplacement vers un autre mois, heure différente, même durée.
		expect(find('w2', '2026-11-30')).toMatchObject({
			fromException: true,
			start: '2026-12-03 18:00',
			end: '2026-12-03 20:00'
		});
		expect(find('w1', '2027-02-04')).toMatchObject({
			fromException: true,
			start: '2027-02-06 10:00',
			end: '2027-02-06 11:30'
		});
		expect(find('m2', '2027-05-29')).toMatchObject({
			fromException: true,
			start: '2027-06-05 14:00',
			end: '2027-06-05 16:00'
		});
		// Une séance ordinaire vient de la série elle-même.
		expect(find('w1', '2027-11-04')).toMatchObject({
			fromException: false,
			start: '2027-11-04 18:30',
			end: '2027-11-04 20:00'
		});
	});

	it('applies the VTIMEZONE: the UTC instant of an 18:30 session differs by one hour between summer and winter time and matches civilToUtc', () => {
		const calendar = parseCalendar(ics);
		const byStart = new Map(
			expandWithIcalJs(masterEvent(calendar, `w1@${HOST}`), CROSS_TO).map((item) => [
				item.start,
				item.startUtc
			])
		);
		// Jeudi 23 mars 2028 (heure d'hiver), jeudi 30 mars 2028 (heure d'été, depuis le dimanche 26),
		// jeudi 4 novembre 2027 (heure d'hiver).
		expect(byStart.get('2028-03-23 18:30')).toBe('2028-03-23T17:30:00Z');
		expect(byStart.get('2028-03-30 18:30')).toBe('2028-03-30T16:30:00Z');
		expect(byStart.get('2027-11-04 18:30')).toBe('2027-11-04T17:30:00Z');
		const minutes = 18 * 60 + 30;
		expect(civilToUtc('2028-03-23', minutes, ZONE).toISOString()).toBe('2028-03-23T17:30:00.000Z');
		expect(civilToUtc('2028-03-30', minutes, ZONE).toISOString()).toBe('2028-03-30T16:30:00.000Z');
		expect(civilToUtc('2027-11-04', minutes, ZONE).toISOString()).toBe('2027-11-04T17:30:00.000Z');
	});

	it('ends the series on the last session before endsOn inclusive', () => {
		const calendar = parseCalendar(ics);
		const far: IsoDate = '2031-12-31';
		const w2 = expandWithIcalJs(masterEvent(calendar, `w2@${HOST}`), far);
		expect(w2.at(-1)).toMatchObject({ start: '2027-06-30 19:00', end: '2027-06-30 21:00' });
		const m2 = expandWithIcalJs(masterEvent(calendar, `m2@${HOST}`), far);
		expect(m2.at(-1)).toMatchObject({ start: '2028-03-25 14:00', end: '2028-03-25 16:00' });
		expect(m2[0]).toMatchObject({ start: '2026-10-31 14:00', end: '2026-10-31 16:00' });
		// expandOccurrences s'arrête au même endroit.
		const expected = expectedKeys(recurringSchedules, CROSS_FROM, '2031-12-31' as IsoDate);
		expect(expected.get('w2')?.at(-1)).toBe('2027-06-30 19:00 -> 2027-06-30 21:00');
		expect(expected.get('m2')?.at(-1)).toBe('2028-03-25 14:00 -> 2028-03-25 16:00');
	});

	it('exports dated and anchored courses session by session inside the pastDays/horizonDays window', () => {
		const calendar = parseCalendar(ics);
		const actual = new Map<string, string[]>();
		const uidDates = new Map<string, string[]>();
		for (const component of calendar.getAllSubcomponents('vevent')) {
			const match = /^(d1|a1|a2)-(\d{4}-\d{2}-\d{2})@/.exec(uidOf(component));
			if (!match || match[1] === undefined || match[2] === undefined) continue;
			const event = new ICAL.Event(component);
			const key = civilKey({
				start: `${event.startDate.toString().slice(0, 10)} ${event.startDate.toString().slice(11, 16)}`,
				end: `${event.endDate.toString().slice(0, 10)} ${event.endDate.toString().slice(11, 16)}`
			});
			actual.set(match[1], [...(actual.get(match[1]) ?? []), key]);
			uidDates.set(match[1], [...(uidDates.get(match[1]) ?? []), match[2]]);
		}
		for (const list of actual.values()) list.sort();
		const expected = expectedKeys(datedSchedules, DATED_FROM, DATED_TO);
		for (const id of DATED_IDS) {
			expect(actual.get(id), id).toEqual(expected.get(id));
		}
		expect(actual.get('d1')).toEqual([
			'2026-08-28 20:00 -> 2026-08-28 22:00',
			'2026-12-13 15:00 -> 2026-12-13 17:00',
			'2027-03-27 20:00 -> 2027-03-27 22:00',
			'2027-09-20 20:00 -> 2027-09-20 22:00'
		]);
		// UID d'une séance déplacée : la date d'origine.
		expect(uidDates.get('d1')).toEqual(['2026-08-28', '2026-12-12', '2027-03-27', '2027-09-20']);
		expect(actual.get('a1')?.length).toBeGreaterThan(50);
		// a2 : au moins une séance commence le lendemain de sa date (isha + 240 min passe minuit).
		const a2Dates = uidDates.get('a2') ?? [];
		const a2Starts = actual.get('a2') ?? [];
		expect(a2Starts.length).toBe(a2Dates.length);
		const a2 = calendar
			.getAllSubcomponents('vevent')
			.filter((component) => uidOf(component).startsWith('a2-'))
			.map((component) => ({
				uidDate: uidOf(component).slice(3, 13),
				startDate: new ICAL.Event(component).startDate.toString().slice(0, 10)
			}));
		expect(a2.some((item) => item.startDate !== item.uidDate)).toBe(true);
		expect(a2.some((item) => item.startDate === item.uidDate)).toBe(true);
	});
});

// ---------------------------------------------------------------------------------------------
// 3. Échappement des textes
// ---------------------------------------------------------------------------------------------

describe('buildCalendar: text escaping and line folding', () => {
	beforeEach(() => {
		ICAL.TimezoneService.reset();
	});

	const title = 'Cours, niveau 1; « Fiqh »\\ chemin\n📖 العربية';
	const description =
		'Ligne 1, virgule; point-virgule\nLigne 2 : 📖 القرآن الكريم — ' +
		'texte long, '.repeat(10) +
		'fin.';
	const location = 'Salle 3, Centre; Bienne 🕌 C:\\Salles\\3';
	const name = 'Communauté, Bienne; « jadwal »';
	const ics = buildCalendar(
		calendarInput({
			name,
			courses: [
				course('c', dates(['2026-09-25']), fixed('19:00', '20:00'), {
					title,
					description,
					location
				})
			]
		})
	);
	const lines = unfoldLines(ics);

	it('escapes backslash-sensitive characters in the raw text', () => {
		expect(lines).toContain('SUMMARY:Cours\\, niveau 1\\; « Fiqh »\\\\ chemin\\n📖 العربية');
		expect(lines).toContain('LOCATION:Salle 3\\, Centre\\; Bienne 🕌 C:\\\\Salles\\\\3');
		expect(lines).toContain('NAME:Communauté\\, Bienne\\; « jadwal »');
		expect(lines).toContain('X-WR-CALNAME:Communauté\\, Bienne\\; « jadwal »');
	});

	it('folds physical lines longer than 74 octets and ical.js reads the texts back identically', () => {
		const physical = ics.split('\r\n');
		for (const line of physical) expect(utf8Length(line)).toBeLessThanOrEqual(75);
		expect(physical.some((line) => line.startsWith(' '))).toBe(true);
		const descriptionLine = lines.find((line) => line.startsWith('DESCRIPTION:'));
		expect(descriptionLine).toBeDefined();
		expect(utf8Length(descriptionLine ?? '')).toBeGreaterThan(74);
		const calendar = parseCalendar(ics);
		const [vevent] = calendar.getAllSubcomponents('vevent');
		expect(vevent).toBeDefined();
		if (!vevent) return;
		expect(textValue(vevent, 'summary')).toBe(title);
		expect(textValue(vevent, 'description')).toBe(description);
		expect(textValue(vevent, 'location')).toBe(location);
	});

	it('reads the calendar name back identically from X-WR-CALNAME and NAME', () => {
		const calendar = parseCalendar(ics);
		expect(textValue(calendar, 'x-wr-calname')).toBe(name);
		expect(textValue(calendar, 'name')).toBe(name);
	});
});

// ---------------------------------------------------------------------------------------------
// 4. Validation
// ---------------------------------------------------------------------------------------------

describe('buildCalendar: input validation', () => {
	const valid = (): BuildCalendarInput =>
		calendarInput({ courses: [course('c', weekly([1]), fixed('19:00', '21:00'))] });

	it('accepts a valid input and exposes the default window sizes', () => {
		expect(() => buildCalendar(valid())).not.toThrow();
		expect(DEFAULT_HORIZON_DAYS).toBe(120);
		expect(DEFAULT_PAST_DAYS).toBe(30);
	});

	it('rejects a uidHost or a course id that would need escaping in UID', () => {
		// RFC 5545 §3.8.4.7 : UID est du TEXT, écrit tel quel par la bibliothèque.
		for (const uidHost of ['jadwal example', 'jadwal,example', 'jadwal;example', 'a\b', 'a"b']) {
			const issues = validationIssues(() => buildCalendar({ ...valid(), uidHost }));
			expect(issues, uidHost).toContainEqual(
				expect.objectContaining({ code: 'invalid_uid', path: 'uidHost' })
			);
		}
		for (const id of ['co urse', 'cour,se', 'cour;se']) {
			const issues = validationIssues(() =>
				buildCalendar({
					...valid(),
					courses: [course(id, weekly([1]), fixed('19:00', '21:00'))]
				})
			);
			expect(issues, id).toContainEqual(
				expect.objectContaining({ code: 'invalid_uid', path: 'courses[0].schedule.id' })
			);
		}
	});

	it('rejects a course id ending with a date, which would collide with a dated session UID', () => {
		const issues = validationIssues(() =>
			buildCalendar({
				...valid(),
				courses: [course('tafsir-2026-10-05', weekly([1]), fixed('19:00', '21:00'))]
			})
		);
		expect(issues).toContainEqual(
			expect.objectContaining({ code: 'invalid_uid', path: 'courses[0].schedule.id' })
		);
	});

	it('rejects an empty uidHost with id_empty', () => {
		const issues = validationIssues(() => buildCalendar({ ...valid(), uidHost: '' }));
		expect(issues).toContainEqual(expect.objectContaining({ code: 'id_empty', path: 'uidHost' }));
	});

	it('rejects an unknown IANA time zone with invalid_time_zone', () => {
		const issues = validationIssues(() => buildCalendar({ ...valid(), timeZone: 'Mars/Olympus' }));
		expect(issues).toContainEqual(
			expect.objectContaining({ code: 'invalid_time_zone', path: 'timeZone' })
		);
	});

	it('rejects an invalid now with invalid_date', () => {
		const issues = validationIssues(() => buildCalendar({ ...valid(), now: new Date('nope') }));
		expect(issues).toContainEqual(expect.objectContaining({ code: 'invalid_date', path: 'now' }));
	});

	it('rejects negative, non-integer or too wide windows with invalid_horizon', () => {
		expect(validationIssues(() => buildCalendar({ ...valid(), pastDays: -1 }))).toContainEqual(
			expect.objectContaining({ code: 'invalid_horizon', path: 'pastDays' })
		);
		expect(validationIssues(() => buildCalendar({ ...valid(), horizonDays: 1.5 }))).toContainEqual(
			expect.objectContaining({ code: 'invalid_horizon', path: 'horizonDays' })
		);
		// 200 + 200 + 1 = 401 jours > 400.
		expect(
			validationIssues(() => buildCalendar({ ...valid(), pastDays: 200, horizonDays: 200 }))
		).toContainEqual(expect.objectContaining({ code: 'invalid_horizon' }));
		// 199 + 200 + 1 = 400 jours : accepté.
		expect(() => buildCalendar({ ...valid(), pastDays: 199, horizonDays: 200 })).not.toThrow();
	});

	it('rejects invalid courses, exceptions and pauses with their path', () => {
		const badCourse = course(
			'c',
			{ kind: 'weekly', weekdays: [], interval: 1, anchorDate: '2026-09-07' },
			fixed('19:00', '21:00')
		);
		expect(
			validationIssues(() => buildCalendar(calendarInput({ courses: [badCourse] })))
		).toContainEqual(
			expect.objectContaining({ code: 'weekdays_empty', path: 'schedules[0].recurrence.weekdays' })
		);
		const badException: SessionException = { kind: 'cancelled', courseId: 'c', date: '2026-13-01' };
		expect(
			validationIssues(() => buildCalendar({ ...valid(), exceptions: [badException] }))
		).toContainEqual(expect.objectContaining({ code: 'invalid_date', path: 'exceptions[0].date' }));
		const badPause: Pause = { from: '2026-10-10', to: '2026-10-01' };
		expect(
			validationIssues(() => buildCalendar({ ...valid(), pauses: [badPause] }))
		).toContainEqual(expect.objectContaining({ code: 'pause_inverted', path: 'pauses[0].to' }));
	});

	it('exports dated sessions from today - 30 to today + 120 by default (today = 2026-09-20)', () => {
		// 2026-09-20 - 30 jours = 2026-08-21 ; + 120 jours = 2027-01-18.
		const ics = buildCalendar(
			calendarInput({
				courses: [
					course(
						'c',
						dates(['2026-08-20', '2026-08-21', '2027-01-18', '2027-01-19']),
						fixed('19:00', '20:00'),
						{ startsOn: '2026-01-01' }
					)
				]
			})
		);
		expect(uidsOf(ics)).toEqual([`c-2026-08-21@${HOST}`, `c-2027-01-18@${HOST}`]);
	});

	it('takes today from the organisation time zone: 2026-09-20T22:30:00Z is already 21 September in Zurich', () => {
		const ics = buildCalendar(
			calendarInput({
				now: new Date('2026-09-20T22:30:00Z'),
				courses: [
					course(
						'c',
						dates(['2026-08-21', '2026-08-22', '2027-01-18', '2027-01-19', '2027-01-20']),
						fixed('19:00', '20:00'),
						{ startsOn: '2026-01-01' }
					)
				]
			})
		);
		// Fenêtre [2026-08-22, 2027-01-19].
		expect(uidsOf(ics)).toEqual([
			`c-2026-08-22@${HOST}`,
			`c-2027-01-18@${HOST}`,
			`c-2027-01-19@${HOST}`
		]);
	});
});

// ---------------------------------------------------------------------------------------------
// 5. Cas limites
// ---------------------------------------------------------------------------------------------

describe('buildCalendar: edge cases', () => {
	it('exports no VEVENT for a recurring course that ends before its first session', () => {
		// Cours du lundi du mardi 1er au dimanche 6 septembre : aucun lundi.
		const ics = buildCalendar(
			calendarInput({
				courses: [course('c', weekly([1]), fixed('19:00', '21:00'), { endsOn: '2026-09-06' })]
			})
		);
		expect(ics).not.toContain('BEGIN:VEVENT');
		expect(ics).toContain('END:VCALENDAR');
	});

	it('writes no EXDATE line for a recurring course without exceptions or pauses', () => {
		const ics = buildCalendar(
			calendarInput({ courses: [course('c', weekly([1]), fixed('19:00', '21:00'))] })
		);
		expect(unfoldLines(ics).some((line) => line.startsWith('EXDATE'))).toBe(false);
		expect(veventBlocks(ics)).toHaveLength(1);
	});

	it('ignores an orphan exception (not a session day) and an exception inside a pause', () => {
		const ics = buildCalendar(
			calendarInput({
				courses: [course('c', weekly([1]), fixed('19:00', '21:00'))],
				exceptions: [
					// Mardi 8 septembre : pas une séance du cours du lundi.
					{ kind: 'cancelled', courseId: 'c', date: '2026-09-08' },
					{
						kind: 'moved',
						courseId: 'c',
						date: '2026-09-22',
						toDate: '2026-09-23',
						toStart: '19:00'
					},
					// Lundi 14 septembre, dans la pause : ignorée, la pause suffit.
					{
						kind: 'moved',
						courseId: 'c',
						date: '2026-09-14',
						toDate: '2026-09-16',
						toStart: '19:00'
					}
				],
				pauses: [{ from: '2026-09-14', to: '2026-09-15', courseId: 'c' }]
			})
		);
		const lines = unfoldLines(ics);
		expect(veventBlocks(ics)).toHaveLength(1);
		expect(lines.some((line) => line.startsWith('RECURRENCE-ID'))).toBe(false);
		expect(lines).toContain('EXDATE;TZID=Europe/Zurich:20260914T190000');
		expect(ics).not.toContain('20260908');
		expect(ics).not.toContain('20260916');
		expect(ics).not.toContain('20260923');
	});

	it('writes no DESCRIPTION line when the description is absent', () => {
		const ics = buildCalendar(
			calendarInput({
				courses: [
					course('r', weekly([1]), fixed('19:00', '21:00'), { location: 'Salle 1' }),
					course('d', dates(['2026-09-25']), fixed('19:00', '21:00'))
				]
			})
		);
		expect(veventBlocks(ics)).toHaveLength(2);
		expect(unfoldLines(ics).some((line) => line.startsWith('DESCRIPTION'))).toBe(false);
		expect(unfoldLines(ics)).toContain('LOCATION:Salle 1');
	});

	it('starts an anchored session on the next day when isha plus the offset passes midnight', () => {
		const ics = buildCalendar(
			calendarInput({
				courses: [
					course(
						'late',
						dates(['2026-09-25']),
						{ kind: 'prayer', prayer: 'isha', offsetMinutes: 120, durationMinutes: 60 },
						{ description: 'Veillée' }
					)
				],
				prayerTimes: lookupFrom([
					{
						date: '2026-09-25',
						fajr: '05:45',
						dhuhr: '13:21',
						asr: '16:41',
						maghrib: '19:23',
						isha: '23:20'
					}
				])
			})
		);
		const [block] = veventBlocks(ics);
		expect(veventBlocks(ics)).toHaveLength(1);
		// 23:20 + 120 min = 01:20 le lendemain ; UID sur la date de la prière.
		expect(block).toContain(`UID:late-2026-09-25@${HOST}`);
		expect(block).toContain('DTSTART;TZID=Europe/Zurich:20260926T012000');
		expect(block).toContain('DTEND;TZID=Europe/Zurich:20260926T022000');
		expect(block).toContain('DESCRIPTION:Après isha (+120 min)\\nVeillée');
	});

	it('vtimezoneFor returns the VTIMEZONE of a known zone and null for an unknown one', () => {
		const zone = vtimezoneFor('Europe/Zurich');
		expect(zone).toContain('BEGIN:VTIMEZONE');
		expect(zone).toContain('TZID:Europe/Zurich');
		expect(zone).toContain('END:VTIMEZONE');
		expect(vtimezoneFor('Nowhere/Land')).toBeNull();
	});

	it('sorts VEVENTs by course id, then master, moved sessions and dated sessions by date', () => {
		const input = calendarInput({
			courses: [
				course('c', monthly(6, -1), fixed('10:00', '12:00')),
				course('a', dates(['2026-10-09', '2026-09-25', '2026-10-02']), fixed('19:00', '20:00')),
				course('b', weekly([1]), fixed('19:00', '21:00'))
			],
			exceptions: [
				{
					kind: 'moved',
					courseId: 'b',
					date: '2026-09-21',
					toDate: '2026-09-22',
					toStart: '19:00'
				},
				{ kind: 'moved', courseId: 'b', date: '2026-09-07', toDate: '2026-09-08', toStart: '19:00' }
			]
		});
		const ics = buildCalendar(input);
		const blocks = veventBlocks(ics);
		expect(blocks.map((block) => lineValue(block, 'UID'))).toEqual([
			`a-2026-09-25@${HOST}`,
			`a-2026-10-02@${HOST}`,
			`a-2026-10-09@${HOST}`,
			`b@${HOST}`,
			`b@${HOST}`,
			`b@${HOST}`,
			`c@${HOST}`
		]);
		expect(blocks[3]?.some((line) => line.startsWith('RRULE:'))).toBe(true);
		expect(blocks[4]).toContain('RECURRENCE-ID;TZID=Europe/Zurich:20260907T190000');
		expect(blocks[5]).toContain('RECURRENCE-ID;TZID=Europe/Zurich:20260921T190000');
	});

	it('is deterministic: two identical calls give the same string', () => {
		expect(buildCalendar(ORGANISATION)).toBe(buildCalendar(ORGANISATION));
	});
});

describe('buildCalendar: RFC 5545 object structure', () => {
	it('keeps at least one component when no session is exported (RFC 5545 §3.6)', () => {
		const ics = buildCalendar(calendarInput({ courses: [] }));
		const lines = unfoldLines(ics);
		// Sans séance, le VTIMEZONE de l'organisation tient le rôle du composant obligatoire.
		expect(lines).toContain('BEGIN:VTIMEZONE');
		expect(lines).toContain('TZID:Europe/Zurich');
		expect(lines.filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(0);
		expect(lines.filter((line) => line.startsWith('X-WR-TIMEZONE:'))).toHaveLength(1);
		expect(ics.endsWith('\r\nEND:VCALENDAR\r\n')).toBe(true);
		// Le fichier reste lisible par un analyseur indépendant.
		expect(() => parseCalendar(ics)).not.toThrow();
	});

	it('writes WKST=MO in weekly rules so a Sunday-first client does not shift the weeks', () => {
		const ics = buildCalendar(
			calendarInput({
				courses: [course('a', weekly([7], 2, '2026-09-07'), fixed('10:00', '11:00'))]
			})
		);
		const block = veventBlocks(ics).find((lines) => lines.includes(`UID:a@${HOST}`));
		expect(block).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2;WKST=MO;BYDAY=SU');
	});
});

describe('buildCalendar: first occurrence search window', () => {
	it('finds the first session of any recurring rhythm within the 62-day search window', () => {
		// buildCalendar cherche le DTSTART d'un cours récurrent dans les 62 jours qui suivent
		// startsOn. Balayage d'une année de dates de départ × tous les rythmes récurrents : le pire
		// écart observé est de 34 jours (mensuel, premier jour de semaine, startsOn juste après la
		// séance du mois), soit une marge de presque deux fois.
		const firstDay = isoDateToDays('2026-01-01');
		let worst = 0;
		for (let day = firstDay; day < firstDay + 365; day += 1) {
			const startsOn = daysToIsoDate(day);
			const rhythms: Recurrence[] = [];
			for (const ordinal of [1, 2, 3, 4, -1] as const) {
				for (let weekday = 1; weekday <= 7; weekday += 1) {
					rhythms.push(monthly(weekday as Weekday, ordinal));
				}
			}
			for (const interval of [1, 2] as const) {
				for (let weekday = 1; weekday <= 7; weekday += 1) {
					rhythms.push(weekly([weekday as Weekday], interval, '2026-01-05'));
				}
			}
			for (const recurrence of rhythms) {
				const schedule: CourseSchedule = {
					id: 'c',
					recurrence,
					timing: fixed('10:00', '11:00'),
					startsOn,
					sequence: 0
				};
				const days = ruleDays(schedule, day, day + 120);
				expect(days.length, `${startsOn} ${JSON.stringify(recurrence)}`).toBeGreaterThan(0);
				worst = Math.max(worst, (days[0] ?? day) - day);
			}
		}
		expect(worst).toBe(34);
		expect(worst).toBeLessThanOrEqual(62);
	});
});

describe('buildCalendar: time zones and hostile input', () => {
	it('rejects an alias of a time zone and names the canonical zone', () => {
		// Un alias stocké aujourd'hui pourrait désigner un autre fuseau demain, si la zone se sépare
		// de celle vers laquelle elle pointe (Europe/Kyiv et America/Nuuk l'ont fait).
		for (const [alias, canonical] of [
			['Europe/Kiev', 'Europe/Kyiv'],
			['Asia/Calcutta', 'Asia/Kolkata'],
			['UTC', 'Etc/UTC']
		] as const) {
			const issues = validationIssues(() => buildCalendar(calendarInput({ timeZone: alias })));
			expect(issues, alias).toContainEqual({
				code: 'invalid_time_zone',
				path: 'timeZone',
				message: `"${alias}" is an alias of the IANA time zone "${canonical}"; use the canonical name`
			});
		}
	});

	it('exposes the canonical zones and labels the VTIMEZONE with the requested name', () => {
		expect(canonicalTimeZone('Europe/Kiev')).toBe('Europe/Kyiv');
		expect(canonicalTimeZone('Europe/Zurich')).toBe('Europe/Zurich');
		expect(canonicalTimeZone('Nowhere/Land')).toBeNull();
		expect(isCanonicalTimeZone('Europe/Zurich')).toBe(true);
		expect(isCanonicalTimeZone('Europe/Kiev')).toBe(false);
		const zones = canonicalTimeZones();
		expect(zones).toContain('Europe/Zurich');
		expect(zones).toContain('Europe/Kyiv');
		expect(zones).not.toContain('Europe/Kiev');
		expect(zones).toEqual([...zones].sort());
		// La réécriture du TZID reste le garde-fou des autres appelants de vtimezoneFor.
		expect(vtimezoneFor('Europe/Kiev')).toContain('TZID:Europe/Kiev');
		for (const zone of ['Europe/Kyiv', 'Asia/Kolkata', 'Europe/Zurich']) {
			const ics = buildCalendar(
				calendarInput({
					timeZone: zone,
					courses: [course('a', dates(['2026-10-05']), fixed('19:00', '20:00'))]
				})
			);
			const lines = unfoldLines(ics);
			expect(lines, zone).toContain(`TZID:${zone}`);
			expect(
				lines.some((line) => line.startsWith(`DTSTART;TZID=${zone}:`)),
				zone
			).toBe(true);
		}
	});

	it('rejects a zone the provider lists but Intl refuses', () => {
		for (const timeZone of ['CT', 'ET', 'MT', 'PT']) {
			const issues = validationIssues(() => buildCalendar(calendarInput({ timeZone })));
			expect(issues, timeZone).toContainEqual(
				expect.objectContaining({ code: 'invalid_time_zone', path: 'timeZone' })
			);
		}
	});

	it('keeps DTSTART before DTEND for a session starting in a daylight-saving gap', () => {
		// 2026-03-29 à Zurich : 02:00 devient 03:00.
		const ics = buildCalendar(
			calendarInput({
				now: new Date('2026-03-01T08:00:00Z'),
				courses: [
					course('gap', dates(['2026-03-29']), fixed('02:30', '03:10'), {
						startsOn: '2026-01-01'
					})
				]
			})
		);
		const block = veventBlocks(ics)[0] ?? [];
		expect(block).toContain('DTSTART;TZID=Europe/Zurich:20260329T023000');
		expect(block).toContain('DTEND;TZID=Europe/Zurich:20260329T031000');
	});

	it('bounds the EXDATE of an endless pause on an endless course', () => {
		const ics = buildCalendar(
			calendarInput({
				courses: [course('a', weekly([1]), fixed('19:00', '20:00'))],
				pauses: [{ from: '2026-10-01', to: '5026-10-01' }]
			})
		);
		const values = (lineValue(unfoldLines(ics), 'EXDATE') ?? '').split(',');
		// Bornées à 400 jours après « aujourd'hui » : le flux est régénéré à chaque lecture.
		expect(values.length).toBeGreaterThan(40);
		expect(values.length).toBeLessThan(80);
		expect(ics.length).toBeLessThan(5000);
	});

	it('removes control characters from the texts a responsible can type', () => {
		const ics = buildCalendar(
			calendarInput({
				name: 'Nom\u0007 du calendrier',
				courses: [
					course('a', dates(['2026-10-05']), fixed('19:00', '20:00'), {
						title: 'Titre\u0001 propre',
						description: 'Ligne 1\nLigne\u0000 2',
						location: 'Salle\u001f 3'
					})
				]
			})
		);
		// eslint-disable-next-line no-control-regex -- c'est précisément ce que l'on cherche.
		const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
		expect(ics).not.toMatch(controls);
		const calendar = parseCalendar(ics);
		const event = calendar.getAllSubcomponents('vevent')[0];
		expect(event?.getFirstPropertyValue('summary')).toBe('Titre propre');
		expect(event?.getFirstPropertyValue('location')).toBe('Salle 3');
		expect(event?.getFirstPropertyValue('description')).toBe('Ligne 1\nLigne 2');
	});
});

describe('buildCalendar: moved and paused first sessions', () => {
	// Cours du lundi 19:00-20:00 à partir du mardi 2026-09-01 : première séance le lundi 7 septembre.
	const monday = (extra: Partial<CourseSchedule> = {}): CalendarCourse =>
		course('a', weekly([1]), fixed('19:00', '20:00'), extra);

	it('keeps DTSTART on the first session even when it is cancelled', () => {
		const ics = buildCalendar(
			calendarInput({
				courses: [monday()],
				exceptions: [{ kind: 'cancelled', courseId: 'a', date: '2026-09-07' }]
			})
		);
		const block = veventBlocks(ics)[0] ?? [];
		// La RRULE part de la première séance du rythme, que l'EXDATE retire ensuite.
		expect(block).toContain('DTSTART;TZID=Europe/Zurich:20260907T190000');
		expect(block).toContain('EXDATE;TZID=Europe/Zurich:20260907T190000');
	});

	it('keeps DTSTART on the first session even when it falls inside a pause', () => {
		const ics = buildCalendar(
			calendarInput({
				courses: [monday()],
				pauses: [{ from: '2026-09-01', to: '2026-09-10' }]
			})
		);
		const block = veventBlocks(ics)[0] ?? [];
		expect(block).toContain('DTSTART;TZID=Europe/Zurich:20260907T190000');
		expect(block).toContain('EXDATE;TZID=Europe/Zurich:20260907T190000');
	});

	it('exports a session moved into a pause: the move wins over the pause', () => {
		const ics = buildCalendar(
			calendarInput({
				courses: [monday()],
				exceptions: [
					{
						kind: 'moved',
						courseId: 'a',
						date: '2026-09-14',
						toDate: '2026-10-08',
						toStart: '18:00'
					}
				],
				pauses: [{ from: '2026-10-05', to: '2026-10-11' }]
			})
		);
		const moved = veventBlocks(ics).find((block) =>
			block.some((line) => line.startsWith('RECURRENCE-ID'))
		);
		expect(moved).toContain('RECURRENCE-ID;TZID=Europe/Zurich:20260914T190000');
		expect(moved).toContain('DTSTART;TZID=Europe/Zurich:20261008T180000');
		expect(moved).toContain('DTEND;TZID=Europe/Zurich:20261008T190000');
		// La pause du 5 au 11 octobre ne couvre que le lundi 5 ; le 14 septembre est déplacé, pas exclu.
		const master = veventBlocks(ics)[0] ?? [];
		expect(lineValue(master, 'EXDATE')).toBe('20261005T190000');
	});

	it('exports a session moved after endsOn and one moved to an earlier date', () => {
		const ics = buildCalendar(
			calendarInput({
				courses: [monday({ endsOn: '2026-09-30' })],
				exceptions: [
					// Après la fin du cours : la décision explicite du responsable l'emporte.
					{
						kind: 'moved',
						courseId: 'a',
						date: '2026-09-28',
						toDate: '2026-10-12',
						toStart: '18:00'
					},
					// Vers une date antérieure à la séance d'origine.
					{
						kind: 'moved',
						courseId: 'a',
						date: '2026-09-21',
						toDate: '2026-09-19',
						toStart: '10:30'
					}
				]
			})
		);
		const moved = veventBlocks(ics).filter((block) =>
			block.some((line) => line.startsWith('RECURRENCE-ID'))
		);
		expect(moved).toHaveLength(2);
		const byRecurrenceId = new Map(
			moved.map((block) => [lineValue(block, 'RECURRENCE-ID'), block])
		);
		expect(byRecurrenceId.get('20260928T190000')).toContain(
			'DTSTART;TZID=Europe/Zurich:20261012T180000'
		);
		expect(byRecurrenceId.get('20260921T190000')).toContain(
			'DTSTART;TZID=Europe/Zurich:20260919T103000'
		);
		// Même UID que le maître, et aucune EXDATE pour une séance déplacée.
		for (const block of moved) {
			expect(block).toContain(`UID:a@${HOST}`);
			expect(block.some((line) => line.startsWith('EXDATE'))).toBe(false);
		}
	});

	it('lists the dated sessions of the window at hand-written dates', () => {
		// Fenêtre par défaut autour du 2026-09-20 : du 21 août au 18 janvier. Le 2026-08-01 est hors
		// fenêtre, le 2027-02-01 aussi ; les trois autres sont dedans, dont une annulée.
		const ics = buildCalendar(
			calendarInput({
				courses: [
					course(
						'seminar',
						dates(['2026-08-01', '2026-09-25', '2026-11-14', '2027-01-10', '2027-02-01']),
						fixed('14:00', '16:00'),
						{ startsOn: '2026-01-01' }
					)
				],
				exceptions: [{ kind: 'cancelled', courseId: 'seminar', date: '2026-11-14' }]
			})
		);
		expect(uidsOf(ics)).toEqual([`seminar-2026-09-25@${HOST}`, `seminar-2027-01-10@${HOST}`]);
	});
});

describe('buildCalendar: URL is a URI, not text', () => {
	it('writes a URL containing a comma or a semicolon without backslashes', () => {
		// RFC 5545 §3.3.13 : la valeur URI n'est pas soumise à l'échappement par contre-oblique, que
		// la bibliothèque applique pourtant. Un client prendrait la valeur brute et suivrait un lien
		// contenant des contre-obliques.
		const url = 'https://example.org/cours?a=1,2;b=3';
		const ics = buildCalendar(
			calendarInput({
				courses: [course('a', dates(['2026-10-05']), fixed('19:00', '20:00'), { url })]
			})
		);
		expect(unfoldLines(ics)).toContain(`URL;VALUE=URI:${url}`);
		const event = parseCalendar(ics).getAllSubcomponents('vevent')[0];
		expect(event?.getFirstPropertyValue('url')).toBe(url);
	});
});

describe('buildCalendar: pause horizon, UNTIL and the UTC zone', () => {
	it('lists the EXDATE of a far pause when the course has an end date', () => {
		// Le cours se termine en 2028 : la pause de décembre 2027 est au-delà de l'horizon des 400
		// jours, mais la série est finie, donc les EXDATE le sont aussi.
		const ics = buildCalendar(
			calendarInput({
				courses: [
					course('c', weekly([3]), fixed('19:00', '20:00'), {
						startsOn: '2026-09-02',
						endsOn: '2028-06-30'
					})
				],
				pauses: [{ from: '2027-12-01', to: '2027-12-31' }]
			})
		);
		// Mercredis de décembre 2027 : 1, 8, 15, 22, 29.
		expect(lineValue(unfoldLines(ics), 'EXDATE')).toBe(
			'20271201T190000,20271208T190000,20271215T190000,20271222T190000,20271229T190000'
		);
	});

	it('ends the series on the last session even where the civil day has no 23rd hour', () => {
		// America/Nuuk passe à l'heure d'été le 2026-03-28 à 22:00 : « 23:59:59 » n'existe pas ce
		// jour-là, et un UNTIL calculé sur cette heure laisserait passer la séance du 29 mars.
		const schedule: CourseSchedule = {
			id: 'n',
			recurrence: weekly([7], 1, '2026-03-01'),
			timing: fixed('00:30', '01:30'),
			startsOn: '2026-03-01',
			endsOn: '2026-03-28',
			sequence: 0
		};
		const ics = buildCalendar(
			calendarInput({
				timeZone: 'America/Nuuk',
				now: new Date('2026-03-01T12:00:00Z'),
				courses: [{ schedule, title: 'Nuuk' }]
			})
		);
		const master = veventBlocks(ics)[0] ?? [];
		expect(master).toContain(
			'RRULE:FREQ=WEEKLY;INTERVAL=1;WKST=MO;BYDAY=SU;UNTIL=20260329T005959Z'
		);
		const expected = expandOccurrences({
			schedules: [schedule],
			range: { from: '2026-03-01', to: '2026-04-15' }
		}).map((occurrence) => occurrence.date);
		expect(expected).toEqual(['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22']);
		const read = expandWithIcalJs(masterEvent(parseCalendar(ics), `n@${HOST}`), '2026-04-15');
		expect(read.map((session) => session.start.slice(0, 10))).toEqual(expected);
	});

	it('uses Etc/UTC with a TZID like any other zone, « UTC » being an alias', () => {
		// ical-generator ramènerait le nom « UTC » à « aucun fuseau » (heures en Z, sans VTIMEZONE) ;
		// ce nom est refusé comme alias, et le nom canonique se comporte comme les autres.
		const ics = buildCalendar(
			calendarInput({
				timeZone: 'Etc/UTC',
				courses: [course('c', weekly([3], 1, '2026-09-02'), fixed('19:00', '20:00'))],
				exceptions: [{ kind: 'cancelled', courseId: 'c', date: '2026-09-30' }]
			})
		);
		const lines = unfoldLines(ics);
		expect(lines).toContain('TZID:Etc/UTC');
		expect(lines).toContain('DTSTART;TZID=Etc/UTC:20260902T190000');
		expect(lines).toContain('EXDATE;TZID=Etc/UTC:20260930T190000');
	});

	it('reads a URL back identically whatever the folding position', () => {
		for (let length = 20; length <= 70; length += 1) {
			const url = `https://example.org/${'a'.repeat(length)},b`;
			const ics = buildCalendar(
				calendarInput({
					courses: [course('c', dates(['2026-10-07']), fixed('19:00', '20:00'), { url })]
				})
			);
			expect(unfoldLines(ics), `longueur ${length}`).toContain(`URL;VALUE=URI:${url}`);
		}
	});
});

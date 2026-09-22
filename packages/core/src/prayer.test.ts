// Horaires ancrés sur une prière (ADR 0004), testés via expandOccurrences et nextOccurrences :
// arrondi aux 5 minutes supérieures, lecture de chaque colonne, jour inconnu, passage de minuit,
// déplacement et annulation d'une séance ancrée (y compris dans une pause ou orpheline), validation
// des bornes, tri au sein d'une journée.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	MAX_DURATION_MINUTES,
	MAX_OFFSET_MINUTES,
	MIN_DURATION_MINUTES,
	MIN_OFFSET_MINUTES,
	PRAYERS,
	ValidationError,
	expandOccurrences,
	findOrphanExceptions,
	formatLocalTime,
	nextOccurrences,
	validateSchedule,
	type CourseSchedule,
	type IsoDate,
	type LocalTime,
	type Occurrence,
	type Prayer,
	type PrayerDay,
	type PrayerTimesLookup,
	type SessionException,
	type ValidationCode
} from './index.js';

// ---------------------------------------------------------------------------------------------
// DONNÉES DE TEST : heures de prière pour Bienne (Suisse, 47,1° N). Valeurs plausibles, PAS des
// heures officielles. Cinq jours avant et cinq jours après chaque changement d'heure de 2026 :
// - dimanche 29 mars 2026, passage à l'heure d'été (les heures locales avancent d'une heure) ;
// - dimanche 25 octobre 2026, retour à l'heure d'hiver (les heures locales reculent d'une heure).
// Les valeurs dérivent d'une à deux minutes par jour.
// ---------------------------------------------------------------------------------------------

function day(
	date: IsoDate,
	fajr: LocalTime,
	dhuhr: LocalTime,
	asr: LocalTime,
	maghrib: LocalTime,
	isha: LocalTime
): PrayerDay {
	return { date, fajr, dhuhr, asr, maghrib, isha };
}

const BIENNE_TEST_DAYS: readonly PrayerDay[] = [
	// Fin mars 2026, heure d'hiver.
	day('2026-03-24', '04:53', '12:37', '16:01', '18:44', '20:19'),
	day('2026-03-25', '04:51', '12:36', '16:02', '18:45', '20:20'),
	day('2026-03-26', '04:49', '12:36', '16:03', '18:47', '20:22'),
	day('2026-03-27', '04:47', '12:35', '16:04', '18:48', '20:23'),
	day('2026-03-28', '04:45', '12:35', '16:05', '18:50', '20:25'),
	// Dimanche 29 mars 2026 et jours suivants, heure d'été.
	day('2026-03-29', '05:43', '13:35', '17:06', '19:52', '21:27'),
	day('2026-03-30', '05:41', '13:34', '17:07', '19:53', '21:28'),
	day('2026-03-31', '05:39', '13:34', '17:08', '19:55', '21:30'),
	day('2026-04-01', '05:37', '13:34', '17:09', '19:56', '21:32'),
	day('2026-04-02', '05:35', '13:33', '17:10', '19:58', '21:33'),
	day('2026-04-03', '05:33', '13:33', '17:11', '19:59', '21:35'),
	// Fin octobre 2026, heure d'été.
	day('2026-10-20', '06:18', '13:18', '16:11', '18:38', '20:12'),
	day('2026-10-21', '06:20', '13:18', '16:09', '18:36', '20:10'),
	day('2026-10-22', '06:22', '13:18', '16:08', '18:34', '20:08'),
	day('2026-10-23', '06:23', '13:17', '16:06', '18:32', '20:07'),
	day('2026-10-24', '06:25', '13:17', '16:05', '18:30', '20:05'),
	// Dimanche 25 octobre 2026 et jours suivants, heure d'hiver.
	day('2026-10-25', '05:27', '12:17', '15:03', '17:28', '19:03'),
	day('2026-10-26', '05:28', '12:17', '15:02', '17:26', '19:02'),
	day('2026-10-27', '05:30', '12:17', '15:00', '17:25', '19:00'),
	day('2026-10-28', '05:31', '12:17', '14:59', '17:23', '18:59'),
	day('2026-10-29', '05:33', '12:17', '14:58', '17:22', '18:57'),
	day('2026-10-30', '05:34', '12:17', '14:56', '17:20', '18:56')
];

const BIENNE_BY_DATE = new Map<IsoDate, PrayerDay>(
	BIENNE_TEST_DAYS.map((entry) => [entry.date, entry])
);

/** La table de test exposée comme PrayerTimesLookup : undefined en dehors des jours ci-dessus. */
const bienne: PrayerTimesLookup = (date) => BIENNE_BY_DATE.get(date);

/** Table synthétique qui renvoie les mêmes heures quel que soit le jour (cas limites de minuit). */
function everyDay(times: Omit<PrayerDay, 'date'>): PrayerTimesLookup {
	return (date) => ({ date, ...times });
}

const MIDNIGHT_TIMES: Omit<PrayerDay, 'date'> = {
	fajr: '01:00',
	dhuhr: '12:00',
	asr: '15:00',
	maghrib: '18:00',
	isha: '23:40'
};

// ---------------------------------------------------------------------------------------------
// Aides de construction.
// ---------------------------------------------------------------------------------------------

function anchored(
	id: string,
	prayer: Prayer,
	offsetMinutes: number,
	durationMinutes: number,
	dates: IsoDate[]
): CourseSchedule {
	return {
		id,
		recurrence: { kind: 'dates', dates },
		timing: { kind: 'prayer', prayer, offsetMinutes, durationMinutes },
		startsOn: '2026-01-01',
		sequence: 0
	};
}

function fixed(id: string, start: LocalTime, end: LocalTime, dates: IsoDate[]): CourseSchedule {
	return {
		id,
		recurrence: { kind: 'dates', dates },
		timing: { kind: 'fixed', start, end },
		startsOn: '2026-01-01',
		sequence: 0
	};
}

function expandDay(
	schedules: CourseSchedule[],
	date: IsoDate,
	prayerTimes?: PrayerTimesLookup
): Occurrence[] {
	return expandOccurrences({ schedules, range: { from: date, to: date }, prayerTimes });
}

function single(
	schedule: CourseSchedule,
	date: IsoDate,
	prayerTimes?: PrayerTimesLookup
): Occurrence {
	const occurrences = expandDay([schedule], date, prayerTimes);
	expect(occurrences).toHaveLength(1);
	const [occurrence] = occurrences;
	if (!occurrence) throw new Error('expected exactly one occurrence');
	return occurrence;
}

function ids(occurrences: readonly Occurrence[]): string[] {
	return occurrences.map((occurrence) => occurrence.courseId);
}

function minutesOf(time: LocalTime | null): number {
	if (time === null) throw new Error('expected a known time');
	const [hours, minutes] = time.split(':').map(Number);
	return (hours ?? 0) * 60 + (minutes ?? 0);
}

function codesOf(run: () => unknown): ValidationCode[] {
	try {
		run();
	} catch (error) {
		if (error instanceof ValidationError) return error.issues.map((issue) => issue.code);
		throw error;
	}
	throw new Error('expected a ValidationError');
}

/** Cours du week-end « maghrib + 30 min, 60 min », le samedi et le dimanche. */
const weekendMaghrib: CourseSchedule = {
	id: 'weekend-maghrib',
	recurrence: { kind: 'weekly', weekdays: [6, 7], interval: 1, anchorDate: '2026-01-05' },
	timing: { kind: 'prayer', prayer: 'maghrib', offsetMinutes: 30, durationMinutes: 60 },
	startsOn: '2026-01-01',
	sequence: 0
};

const MAGHRIB_30: Occurrence['anchor'] = { prayer: 'maghrib', offsetMinutes: 30 };

function scheduled(
	courseId: string,
	date: IsoDate,
	start: LocalTime,
	end: LocalTime,
	anchor: Occurrence['anchor']
): Occurrence {
	return {
		courseId,
		date,
		start,
		end,
		startDayOffset: 0,
		endDayOffset: 0,
		anchor,
		status: 'scheduled'
	};
}

// ---------------------------------------------------------------------------------------------
// Cas exigés.
// ---------------------------------------------------------------------------------------------

describe('weekend course anchored on maghrib around the DST changes', () => {
	it('computes Saturday 28 (winter time) and Sunday 29 March 2026 (summer time)', () => {
		const occurrences = expandOccurrences({
			schedules: [weekendMaghrib],
			range: { from: '2026-03-24', to: '2026-04-03' },
			prayerTimes: bienne
		});
		expect(occurrences).toEqual([
			// Samedi 28 mars : maghrib 18:50 + 30 = 19:20, multiple de 5 exact.
			scheduled('weekend-maghrib', '2026-03-28', '19:20', '20:20', MAGHRIB_30),
			// Dimanche 29 mars (heure d'été) : maghrib 19:52 + 30 = 20:22 → 20:25.
			scheduled('weekend-maghrib', '2026-03-29', '20:25', '21:25', MAGHRIB_30)
		]);
	});

	it('computes Saturday 24 (summer time) and Sunday 25 October 2026 (winter time)', () => {
		const occurrences = expandOccurrences({
			schedules: [weekendMaghrib],
			range: { from: '2026-10-20', to: '2026-10-30' },
			prayerTimes: bienne
		});
		expect(occurrences).toEqual([
			// Samedi 24 octobre : maghrib 18:30 + 30 = 19:00.
			scheduled('weekend-maghrib', '2026-10-24', '19:00', '20:00', MAGHRIB_30),
			// Dimanche 25 octobre (heure d'hiver) : maghrib 17:28 + 30 = 17:58 → 18:00.
			scheduled('weekend-maghrib', '2026-10-25', '18:00', '19:00', MAGHRIB_30)
		]);
	});

	it('keeps end = start + 60 minutes on every weekend day of both tables', () => {
		const occurrences = [
			...expandOccurrences({
				schedules: [weekendMaghrib],
				range: { from: '2026-03-24', to: '2026-04-03' },
				prayerTimes: bienne
			}),
			...expandOccurrences({
				schedules: [weekendMaghrib],
				range: { from: '2026-10-20', to: '2026-10-30' },
				prayerTimes: bienne
			})
		];
		expect(occurrences.map((occurrence) => occurrence.date)).toEqual([
			'2026-03-28',
			'2026-03-29',
			'2026-10-24',
			'2026-10-25'
		]);
		for (const occurrence of occurrences) {
			expect(occurrence.anchor).toEqual(MAGHRIB_30);
			expect(minutesOf(occurrence.end) - minutesOf(occurrence.start)).toBe(60);
			expect(minutesOf(occurrence.start) % 5).toBe(0);
		}
	});
});

describe('rounding of the anchored start up to the next five minutes', () => {
	const cases: {
		label: string;
		date: IsoDate;
		prayer: Prayer;
		offset: number;
		start: LocalTime;
		end: LocalTime;
	}[] = [
		{
			label: 'an exact multiple of five stays unchanged (18:50 + 30 = 19:20)',
			date: '2026-03-28',
			prayer: 'maghrib',
			offset: 30,
			start: '19:20',
			end: '20:20'
		},
		{
			label: 'one minute past a multiple goes up to the next one (18:50 + 31 = 19:21 → 19:25)',
			date: '2026-03-28',
			prayer: 'maghrib',
			offset: 31,
			start: '19:25',
			end: '20:25'
		},
		{
			label: 'two minutes past a multiple goes up (19:52 + 30 = 20:22 → 20:25)',
			date: '2026-03-29',
			prayer: 'maghrib',
			offset: 30,
			start: '20:25',
			end: '21:25'
		},
		{
			label: 'three minutes past a multiple goes up (19:53 + 30 = 20:23 → 20:25)',
			date: '2026-03-30',
			prayer: 'maghrib',
			offset: 30,
			start: '20:25',
			end: '21:25'
		},
		{
			label: 'one minute past a multiple goes up to the next one (12:36 + 0 → 12:40)',
			date: '2026-03-25',
			prayer: 'dhuhr',
			offset: 0,
			start: '12:40',
			end: '13:40'
		},
		{
			label: 'a negative offset rounds up too (12:37 - 30 = 12:07 → 12:10)',
			date: '2026-03-24',
			prayer: 'dhuhr',
			offset: -30,
			start: '12:10',
			end: '13:10'
		},
		{
			label: 'the minimum offset on an exact multiple (04:45 - 120 = 02:45)',
			date: '2026-03-28',
			prayer: 'fajr',
			offset: -120,
			start: '02:45',
			end: '03:45'
		},
		{
			label: 'a zero offset keeps an exact multiple (12:35 + 0 = 12:35)',
			date: '2026-03-28',
			prayer: 'dhuhr',
			offset: 0,
			start: '12:35',
			end: '13:35'
		},
		{
			label: 'a zero offset still rounds up (12:37 + 0 → 12:40)',
			date: '2026-03-24',
			prayer: 'dhuhr',
			offset: 0,
			start: '12:40',
			end: '13:40'
		},
		{
			label: 'the maximum offset (18:50 + 240 = 22:50)',
			date: '2026-03-28',
			prayer: 'maghrib',
			offset: 240,
			start: '22:50',
			end: '23:50'
		}
	];

	it.each(cases)('$label', ({ date, prayer, offset, start, end }) => {
		const occurrence = single(anchored('course', prayer, offset, 60, [date]), date, bienne);
		expect(occurrence.start).toBe(start);
		expect(occurrence.end).toBe(end);
		expect(occurrence.startDayOffset).toBe(0);
		expect(occurrence.endDayOffset).toBe(0);
		expect(occurrence.anchor).toEqual({ prayer, offsetMinutes: offset });
	});

	it('always starts at the smallest multiple of five minutes at or after prayer + offset', () => {
		const DAY: IsoDate = '2026-05-10';
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 1439 }),
				fc.integer({ min: MIN_OFFSET_MINUTES, max: MAX_OFFSET_MINUTES }),
				fc.integer({ min: MIN_DURATION_MINUTES, max: MAX_DURATION_MINUTES }),
				(prayerMinutes, offsetMinutes, durationMinutes) => {
					const lookup = everyDay({ ...MIDNIGHT_TIMES, isha: formatLocalTime(prayerMinutes) });
					const occurrence = single(
						anchored('course', 'isha', offsetMinutes, durationMinutes, [DAY]),
						DAY,
						lookup
					);
					expect(occurrence.anchor).toEqual({ prayer: 'isha', offsetMinutes });
					const start = Math.ceil((prayerMinutes + offsetMinutes) / 5) * 5;
					if (start < 0) {
						// Début la veille : heure inconnue.
						expect(occurrence.start).toBeNull();
						expect(occurrence.end).toBeNull();
						return;
					}
					const end = start + durationMinutes;
					expect(occurrence.start).toBe(formatLocalTime(start % 1440));
					expect(occurrence.startDayOffset).toBe(Math.floor(start / 1440));
					expect(occurrence.end).toBe(formatLocalTime(end % 1440));
					expect(occurrence.endDayOffset).toBe(Math.floor(end / 1440));
				}
			)
		);
	});
});

describe('each prayer is read from its own column', () => {
	// Samedi 28 mars 2026 : toutes les colonnes sont des multiples de 5, le début est la colonne.
	const winterStart: Record<Prayer, LocalTime> = {
		fajr: '04:45',
		dhuhr: '12:35',
		asr: '16:05',
		maghrib: '18:50',
		isha: '20:25'
	};
	const winterEnd: Record<Prayer, LocalTime> = {
		fajr: '05:15',
		dhuhr: '13:05',
		asr: '16:35',
		maghrib: '19:20',
		isha: '20:55'
	};
	it.each([...PRAYERS])('%s + 0 on 2026-03-28 is the column value', (prayer) => {
		const occurrence = single(
			anchored('course', prayer, 0, 30, ['2026-03-28']),
			'2026-03-28',
			bienne
		);
		expect(occurrence).toEqual(
			scheduled('course', '2026-03-28', winterStart[prayer], winterEnd[prayer], {
				prayer,
				offsetMinutes: 0
			})
		);
	});

	// Dimanche 25 octobre 2026 : aucune colonne n'est un multiple de 5, chacune est arrondie.
	const autumnStart: Record<Prayer, LocalTime> = {
		fajr: '05:30',
		dhuhr: '12:20',
		asr: '15:05',
		maghrib: '17:30',
		isha: '19:05'
	};
	it.each([...PRAYERS])('%s + 0 on 2026-10-25 is the column value rounded up', (prayer) => {
		const occurrence = single(
			anchored('course', prayer, 0, 5, ['2026-10-25']),
			'2026-10-25',
			bienne
		);
		expect(occurrence.start).toBe(autumnStart[prayer]);
		expect(occurrence.anchor?.prayer).toBe(prayer);
	});

	it('yields five different starts for the five prayers of one day', () => {
		const starts = PRAYERS.map(
			(prayer) =>
				single(anchored('course', prayer, 0, 5, ['2026-10-22']), '2026-10-22', bienne).start
		);
		expect(starts).toEqual(['06:25', '13:20', '16:10', '18:35', '20:10']);
		expect(new Set(starts).size).toBe(5);
	});
});

describe('unknown prayer day', () => {
	it('gives null times but keeps the anchor and the scheduled status when the table has no entry', () => {
		const occurrence = single(
			anchored('anchored', 'maghrib', 30, 60, ['2026-04-10']),
			'2026-04-10',
			bienne
		);
		expect(occurrence).toEqual({
			courseId: 'anchored',
			date: '2026-04-10',
			start: null,
			end: null,
			startDayOffset: 0,
			endDayOffset: 0,
			anchor: MAGHRIB_30,
			status: 'scheduled'
		});
	});

	it('gives null times when no table is provided at all, even on a date the test table knows', () => {
		const occurrence = single(
			anchored('anchored', 'maghrib', 30, 60, ['2026-03-28']),
			'2026-03-28'
		);
		expect(occurrence).toEqual({
			courseId: 'anchored',
			date: '2026-03-28',
			start: null,
			end: null,
			startDayOffset: 0,
			endDayOffset: 0,
			anchor: MAGHRIB_30,
			status: 'scheduled'
		});
	});

	it('leaves fixed courses untouched when no table is provided', () => {
		const occurrence = single(fixed('fixed', '19:00', '20:00', ['2026-03-28']), '2026-03-28');
		expect(occurrence.start).toBe('19:00');
		expect(occurrence.end).toBe('20:00');
		expect(occurrence.anchor).toBeUndefined();
	});

	it('sorts the occurrence without start last in its day, whatever its course id', () => {
		const occurrences = expandDay(
			[
				anchored('anchored', 'isha', 0, 60, ['2026-04-10']),
				fixed('fixed-late', '23:30', '23:59', ['2026-04-10'])
			],
			'2026-04-10',
			bienne
		);
		expect(ids(occurrences)).toEqual(['fixed-late', 'anchored']);
		expect(occurrences[1]?.start).toBeNull();
	});

	it('orders two occurrences without start by course id', () => {
		const occurrences = expandDay(
			[
				anchored('b-anchored', 'isha', 0, 60, ['2026-04-10']),
				anchored('a-anchored', 'fajr', 0, 60, ['2026-04-10'])
			],
			'2026-04-10',
			bienne
		);
		expect(ids(occurrences)).toEqual(['a-anchored', 'b-anchored']);
	});
});

describe('crossing midnight', () => {
	const DAY: IsoDate = '2026-05-10';

	it('isha 23:40 + 30 starts the next day at 00:10 and ends at 01:10', () => {
		const occurrence = single(
			anchored('late', 'isha', 30, 60, [DAY]),
			DAY,
			everyDay(MIDNIGHT_TIMES)
		);
		expect(occurrence).toEqual({
			courseId: 'late',
			date: DAY,
			start: '00:10',
			end: '01:10',
			startDayOffset: 1,
			endDayOffset: 1,
			anchor: { prayer: 'isha', offsetMinutes: 30 },
			status: 'scheduled'
		});
	});

	it('isha 23:00 + 60 = 24:00 starts the next day at 00:00', () => {
		const lookup = everyDay({ ...MIDNIGHT_TIMES, isha: '23:00' });
		const occurrence = single(anchored('late', 'isha', 60, 60, [DAY]), DAY, lookup);
		expect(occurrence.start).toBe('00:00');
		expect(occurrence.startDayOffset).toBe(1);
		expect(occurrence.end).toBe('01:00');
		expect(occurrence.endDayOffset).toBe(1);
		expect(occurrence.date).toBe(DAY);
	});

	it('fajr 01:00 - 120 would start the day before: null times, anchor kept', () => {
		const occurrence = single(
			anchored('early', 'fajr', -120, 60, [DAY]),
			DAY,
			everyDay(MIDNIGHT_TIMES)
		);
		expect(occurrence).toEqual({
			courseId: 'early',
			date: DAY,
			start: null,
			end: null,
			startDayOffset: 0,
			endDayOffset: 0,
			anchor: { prayer: 'fajr', offsetMinutes: -120 },
			status: 'scheduled'
		});
	});

	it('isha 22:30 + 0 lasting 120 minutes ends the next day at 00:30', () => {
		const lookup = everyDay({ ...MIDNIGHT_TIMES, isha: '22:30' });
		const occurrence = single(anchored('long', 'isha', 0, 120, [DAY]), DAY, lookup);
		expect(occurrence.start).toBe('22:30');
		expect(occurrence.startDayOffset).toBe(0);
		expect(occurrence.end).toBe('00:30');
		expect(occurrence.endDayOffset).toBe(1);
	});

	it('a session ending exactly at midnight ends the next day at 00:00', () => {
		const lookup = everyDay({ ...MIDNIGHT_TIMES, isha: '23:00' });
		const occurrence = single(anchored('until-midnight', 'isha', 0, 60, [DAY]), DAY, lookup);
		expect(occurrence.start).toBe('23:00');
		expect(occurrence.end).toBe('00:00');
		expect(occurrence.startDayOffset).toBe(0);
		expect(occurrence.endDayOffset).toBe(1);
	});

	it('a session ending before midnight is not flagged endsNextDay', () => {
		const lookup = everyDay({ ...MIDNIGHT_TIMES, isha: '22:30' });
		const occurrence = single(anchored('evening', 'isha', 0, 60, [DAY]), DAY, lookup);
		expect(occurrence.end).toBe('23:30');
		expect(occurrence.endDayOffset).toBe(0);
	});

	it('the longest session starting after midnight ends two days after its own date', () => {
		// isha 23:40 + 30 min = 00:10 le lendemain, puis 1440 min : la fin tombe le surlendemain.
		// Les deux décalages le disent, ce qu'un booléen « le lendemain » ne pouvait pas exprimer.
		const occurrence = single(
			anchored('marathon', 'isha', 30, MAX_DURATION_MINUTES, [DAY]),
			DAY,
			everyDay(MIDNIGHT_TIMES)
		);
		expect(occurrence.start).toBe('00:10');
		expect(occurrence.startDayOffset).toBe(1);
		expect(occurrence.end).toBe('00:10');
		expect(occurrence.endDayOffset).toBe(2);
	});
});

describe('moving a session of an anchored course', () => {
	it('moved_here takes toStart and durationMinutes without anchor; moved_away keeps its times, anchor and movedTo', () => {
		const occurrences = expandOccurrences({
			schedules: [weekendMaghrib],
			exceptions: [
				{
					kind: 'moved',
					courseId: 'weekend-maghrib',
					date: '2026-03-28',
					toDate: '2026-03-30',
					toStart: '20:00'
				}
			],
			range: { from: '2026-03-24', to: '2026-04-03' },
			prayerTimes: bienne
		});
		expect(occurrences).toEqual([
			{
				courseId: 'weekend-maghrib',
				date: '2026-03-28',
				start: '19:20',
				end: '20:20',
				startDayOffset: 0,
				endDayOffset: 0,
				anchor: MAGHRIB_30,
				status: 'moved_away',
				movedTo: { date: '2026-03-30', start: '20:00' }
			},
			scheduled('weekend-maghrib', '2026-03-29', '20:25', '21:25', MAGHRIB_30),
			{
				courseId: 'weekend-maghrib',
				date: '2026-03-30',
				start: '20:00',
				end: '21:00',
				startDayOffset: 0,
				endDayOffset: 0,
				status: 'moved_here',
				originalDate: '2026-03-28'
			}
		]);
		expect(occurrences[2]?.anchor).toBeUndefined();
	});

	it('moved_away has null times when the original day is unknown but still carries anchor and movedTo', () => {
		const occurrences = expandOccurrences({
			schedules: [anchored('anchored', 'maghrib', 30, 90, ['2026-04-10'])],
			exceptions: [
				{
					kind: 'moved',
					courseId: 'anchored',
					date: '2026-04-10',
					toDate: '2026-04-12',
					toStart: '10:00'
				}
			],
			range: { from: '2026-04-10', to: '2026-04-12' },
			prayerTimes: bienne
		});
		expect(occurrences).toEqual([
			{
				courseId: 'anchored',
				date: '2026-04-10',
				start: null,
				end: null,
				startDayOffset: 0,
				endDayOffset: 0,
				anchor: MAGHRIB_30,
				status: 'moved_away',
				movedTo: { date: '2026-04-12', start: '10:00' }
			},
			{
				courseId: 'anchored',
				date: '2026-04-12',
				start: '10:00',
				end: '11:30',
				startDayOffset: 0,
				endDayOffset: 0,
				status: 'moved_here',
				originalDate: '2026-04-10'
			}
		]);
	});

	it('the moved session does not need any prayer table', () => {
		const occurrences = expandOccurrences({
			schedules: [anchored('anchored', 'isha', 0, 45, ['2026-04-10'])],
			exceptions: [
				{
					kind: 'moved',
					courseId: 'anchored',
					date: '2026-04-10',
					toDate: '2026-04-11',
					toStart: '21:15'
				}
			],
			range: { from: '2026-04-11', to: '2026-04-11' }
		});
		expect(occurrences).toHaveLength(1);
		expect(occurrences[0]).toMatchObject({
			status: 'moved_here',
			start: '21:15',
			end: '22:00',
			originalDate: '2026-04-10'
		});
		expect(occurrences[0]?.anchor).toBeUndefined();
	});

	it('a moved session that ends after midnight is flagged endsNextDay', () => {
		const occurrences = expandOccurrences({
			schedules: [weekendMaghrib],
			exceptions: [
				{
					kind: 'moved',
					courseId: 'weekend-maghrib',
					date: '2026-03-28',
					toDate: '2026-03-31',
					toStart: '23:30'
				}
			],
			range: { from: '2026-03-31', to: '2026-03-31' },
			prayerTimes: bienne
		});
		expect(occurrences).toEqual([
			{
				courseId: 'weekend-maghrib',
				date: '2026-03-31',
				start: '23:30',
				end: '00:30',
				startDayOffset: 0,
				endDayOffset: 1,
				status: 'moved_here',
				originalDate: '2026-03-28'
			}
		]);
	});

	it('includes moved_here when only its date is in the range, moved_away when only the original date is', () => {
		const exceptions: SessionException[] = [
			{
				kind: 'moved',
				courseId: 'weekend-maghrib',
				date: '2026-03-28',
				toDate: '2026-04-01',
				toStart: '21:00'
			}
		];
		const onlyTarget = expandOccurrences({
			schedules: [weekendMaghrib],
			exceptions,
			range: { from: '2026-04-01', to: '2026-04-01' },
			prayerTimes: bienne
		});
		expect(onlyTarget).toHaveLength(1);
		expect(onlyTarget[0]).toMatchObject({
			status: 'moved_here',
			date: '2026-04-01',
			start: '21:00',
			end: '22:00',
			originalDate: '2026-03-28'
		});

		const onlyOrigin = expandOccurrences({
			schedules: [weekendMaghrib],
			exceptions,
			range: { from: '2026-03-28', to: '2026-03-28' },
			prayerTimes: bienne
		});
		expect(onlyOrigin).toHaveLength(1);
		expect(onlyOrigin[0]).toMatchObject({
			status: 'moved_away',
			date: '2026-03-28',
			start: '19:20',
			end: '20:20',
			anchor: MAGHRIB_30,
			movedTo: { date: '2026-04-01', start: '21:00' }
		});
	});

	it('a session moved within the same day at the same start sorts moved_away before moved_here', () => {
		const occurrences = expandOccurrences({
			schedules: [weekendMaghrib],
			exceptions: [
				{
					kind: 'moved',
					courseId: 'weekend-maghrib',
					date: '2026-03-28',
					toDate: '2026-03-28',
					toStart: '19:20'
				}
			],
			range: { from: '2026-03-28', to: '2026-03-28' },
			prayerTimes: bienne
		});
		expect(occurrences.map((occurrence) => occurrence.status)).toEqual([
			'moved_away',
			'moved_here'
		]);
		expect(occurrences[0]?.anchor).toEqual(MAGHRIB_30);
		expect(occurrences[1]?.anchor).toBeUndefined();
		expect(occurrences[0]?.start).toBe('19:20');
		expect(occurrences[1]?.start).toBe('19:20');
	});

	it('moved_away keeps startsNextDay when the original start falls after midnight', () => {
		const DAY: IsoDate = '2026-05-10';
		const occurrences = expandOccurrences({
			schedules: [anchored('late', 'isha', 30, 60, [DAY])],
			exceptions: [
				{ kind: 'moved', courseId: 'late', date: DAY, toDate: '2026-05-12', toStart: '21:00' }
			],
			range: { from: DAY, to: '2026-05-12' },
			prayerTimes: everyDay(MIDNIGHT_TIMES)
		});
		expect(occurrences).toEqual([
			{
				courseId: 'late',
				date: DAY,
				// isha 23:40 + 30 = 00:10 le lendemain : les drapeaux calculés survivent au déplacement.
				start: '00:10',
				end: '01:10',
				startDayOffset: 1,
				endDayOffset: 1,
				anchor: { prayer: 'isha', offsetMinutes: 30 },
				status: 'moved_away',
				movedTo: { date: '2026-05-12', start: '21:00' }
			},
			{
				courseId: 'late',
				date: '2026-05-12',
				start: '21:00',
				end: '22:00',
				startDayOffset: 0,
				endDayOffset: 0,
				status: 'moved_here',
				originalDate: DAY
			}
		]);
	});

	it('a moved session lands on toDate even inside a pause; the rhythm dates in the pause vanish', () => {
		const occurrences = expandOccurrences({
			schedules: [weekendMaghrib],
			exceptions: [
				{
					kind: 'moved',
					courseId: 'weekend-maghrib',
					date: '2026-03-28',
					toDate: '2026-03-30',
					toStart: '20:00'
				}
			],
			// Pause du dimanche 29 au mardi 31 mars : le dimanche 29 disparaît, la séance déplacée au
			// lundi 30 est émise quand même (le déplacement explicite l'emporte).
			pauses: [{ from: '2026-03-29', to: '2026-03-31' }],
			range: { from: '2026-03-24', to: '2026-04-03' },
			prayerTimes: bienne
		});
		expect(
			occurrences.map((occurrence) => [occurrence.date, occurrence.status, occurrence.start])
		).toEqual([
			['2026-03-28', 'moved_away', '19:20'],
			['2026-03-30', 'moved_here', '20:00']
		]);
		expect(occurrences[1]?.anchor).toBeUndefined();
		expect(occurrences[1]?.end).toBe('21:00');
	});
});

describe('cancelling a session of an anchored course', () => {
	it('keeps the computed times and the anchor with status cancelled', () => {
		const occurrences = expandOccurrences({
			schedules: [weekendMaghrib],
			exceptions: [{ kind: 'cancelled', courseId: 'weekend-maghrib', date: '2026-03-28' }],
			range: { from: '2026-03-28', to: '2026-03-29' },
			prayerTimes: bienne
		});
		expect(occurrences).toEqual([
			{
				courseId: 'weekend-maghrib',
				date: '2026-03-28',
				start: '19:20',
				end: '20:20',
				startDayOffset: 0,
				endDayOffset: 0,
				anchor: MAGHRIB_30,
				status: 'cancelled'
			},
			scheduled('weekend-maghrib', '2026-03-29', '20:25', '21:25', MAGHRIB_30)
		]);
	});

	it('keeps null times and the anchor when the cancelled day is unknown', () => {
		const occurrences = expandOccurrences({
			schedules: [anchored('anchored', 'fajr', -30, 45, ['2026-04-10'])],
			exceptions: [{ kind: 'cancelled', courseId: 'anchored', date: '2026-04-10' }],
			range: { from: '2026-04-10', to: '2026-04-10' },
			prayerTimes: bienne
		});
		expect(occurrences).toEqual([
			{
				courseId: 'anchored',
				date: '2026-04-10',
				start: null,
				end: null,
				startDayOffset: 0,
				endDayOffset: 0,
				anchor: { prayer: 'fajr', offsetMinutes: -30 },
				status: 'cancelled'
			}
		]);
	});
});

describe('exceptions that do not match a session of the anchored course', () => {
	const cancelledOnFriday: SessionException = {
		kind: 'cancelled',
		courseId: 'weekend-maghrib',
		date: '2026-03-27' // vendredi : pas une séance du cours du week-end
	};
	const movedOfUnknownCourse: SessionException = {
		kind: 'moved',
		courseId: 'unknown-course',
		date: '2026-03-28',
		toDate: '2026-03-30',
		toStart: '20:00'
	};

	it('are ignored by expandOccurrences: the anchored sessions come out untouched', () => {
		const occurrences = expandOccurrences({
			schedules: [weekendMaghrib],
			exceptions: [cancelledOnFriday, movedOfUnknownCourse],
			range: { from: '2026-03-24', to: '2026-04-03' },
			prayerTimes: bienne
		});
		expect(occurrences).toEqual([
			scheduled('weekend-maghrib', '2026-03-28', '19:20', '20:20', MAGHRIB_30),
			scheduled('weekend-maghrib', '2026-03-29', '20:25', '21:25', MAGHRIB_30)
		]);
	});

	it('are reported by findOrphanExceptions with the matching reason', () => {
		expect(
			findOrphanExceptions([weekendMaghrib], [cancelledOnFriday, movedOfUnknownCourse])
		).toEqual([
			{ exception: cancelledOnFriday, reason: 'not_an_occurrence' },
			{ exception: movedOfUnknownCourse, reason: 'unknown_course' }
		]);
		expect(
			findOrphanExceptions(
				[weekendMaghrib],
				[{ kind: 'cancelled', courseId: 'weekend-maghrib', date: '2026-03-28' }]
			)
		).toEqual([]);
	});
});

describe('validation of the anchored timing', () => {
	const range = { from: '2026-03-28', to: '2026-03-28' } as const;

	it.each<{ offset: number; duration: number; code: ValidationCode; path: string }>([
		{ offset: -121, duration: 60, code: 'offset_out_of_range', path: 'timing.offsetMinutes' },
		{ offset: 241, duration: 60, code: 'offset_out_of_range', path: 'timing.offsetMinutes' },
		{ offset: 30, duration: 4, code: 'duration_out_of_range', path: 'timing.durationMinutes' },
		{ offset: 30, duration: 1441, code: 'duration_out_of_range', path: 'timing.durationMinutes' }
	])(
		'rejects offsetMinutes $offset / durationMinutes $duration with $code',
		({ offset, duration, code, path }) => {
			const schedule = anchored('course', 'maghrib', offset, duration, ['2026-03-28']);
			const issues = validateSchedule(schedule);
			expect(issues.map((issue) => issue.code)).toEqual([code]);
			expect(issues[0]?.path).toBe(`schedule.${path}`);

			expect(() =>
				expandOccurrences({ schedules: [schedule], range, prayerTimes: bienne })
			).toThrow(ValidationError);
			expect(codesOf(() => expandOccurrences({ schedules: [schedule], range }))).toEqual([code]);
			expect(
				codesOf(() => nextOccurrences({ schedules: [schedule], from: '2026-03-28', limit: 1 }))
			).toEqual([code]);
			expect(codesOf(() => findOrphanExceptions([schedule], []))).toEqual([code]);
		}
	);

	it('reports the indexed path when several schedules are validated together', () => {
		const good = anchored('good', 'maghrib', 30, 60, ['2026-03-28']);
		const bad = anchored('bad', 'maghrib', 241, 1441, ['2026-03-28']);
		let caught: unknown;
		try {
			expandOccurrences({ schedules: [good, bad], range, prayerTimes: bienne });
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(ValidationError);
		const error = caught as ValidationError;
		expect(error.name).toBe('ValidationError');
		expect(error.issues.map((issue) => [issue.code, issue.path])).toEqual([
			['offset_out_of_range', 'schedules[1].timing.offsetMinutes'],
			['duration_out_of_range', 'schedules[1].timing.durationMinutes']
		]);
		expect(error.message).toContain('schedules[1].timing.offsetMinutes');
	});

	it.each<{ offset: number; duration: number }>([
		{ offset: -120, duration: 5 },
		{ offset: 240, duration: 1440 },
		{ offset: 0, duration: 60 }
	])('accepts offsetMinutes $offset and durationMinutes $duration', ({ offset, duration }) => {
		const schedule = anchored('course', 'maghrib', offset, duration, ['2026-03-28']);
		expect(validateSchedule(schedule)).toEqual([]);
		expect(() =>
			expandOccurrences({ schedules: [schedule], range, prayerTimes: bienne })
		).not.toThrow();
	});

	it('rejects a non-integer offset or duration', () => {
		expect(
			validateSchedule(anchored('course', 'maghrib', 30.5, 60, ['2026-03-28'])).map(
				(issue) => issue.code
			)
		).toEqual(['offset_out_of_range']);
		expect(
			validateSchedule(anchored('course', 'maghrib', 30, 60.5, ['2026-03-28'])).map(
				(issue) => issue.code
			)
		).toEqual(['duration_out_of_range']);
		expect(
			validateSchedule(anchored('course', 'maghrib', Number.NaN, 60, ['2026-03-28'])).map(
				(issue) => issue.code
			)
		).toEqual(['offset_out_of_range']);
	});

	it('rejects an unknown prayer name', () => {
		const schedule = {
			...anchored('course', 'maghrib', 0, 30, ['2026-03-28']),
			timing: { kind: 'prayer', prayer: 'sunrise', offsetMinutes: 0, durationMinutes: 30 }
		} as unknown as CourseSchedule;
		expect(validateSchedule(schedule).map((issue) => [issue.code, issue.path])).toEqual([
			['invalid_prayer', 'schedule.timing.prayer']
		]);
		expect(codesOf(() => expandOccurrences({ schedules: [schedule], range }))).toEqual([
			'invalid_prayer'
		]);
	});

	it('reports every anchored-timing issue at once', () => {
		const schedule = {
			...anchored('course', 'maghrib', -121, 4, ['2026-03-28']),
			timing: { kind: 'prayer', prayer: 'noon', offsetMinutes: -121, durationMinutes: 4 }
		} as unknown as CourseSchedule;
		expect(validateSchedule(schedule).map((issue) => issue.code)).toEqual([
			'invalid_prayer',
			'offset_out_of_range',
			'duration_out_of_range'
		]);
	});
});

describe('nextOccurrences on anchored courses', () => {
	it('drops, on the from day, the sessions starting before fromTime and keeps unknown starts', () => {
		const result = nextOccurrences({
			schedules: [weekendMaghrib],
			prayerTimes: bienne,
			from: '2026-03-28',
			fromTime: '19:30',
			limit: 2
		});
		expect(result).toEqual([
			// Samedi 28 mars (19:20) est avant 19:30 : exclu. Dimanche 29 mars : 20:25.
			scheduled('weekend-maghrib', '2026-03-29', '20:25', '21:25', MAGHRIB_30),
			// Samedi 4 avril : jour absent de la table, start null, conservé.
			{
				courseId: 'weekend-maghrib',
				date: '2026-04-04',
				start: null,
				end: null,
				startDayOffset: 0,
				endDayOffset: 0,
				anchor: MAGHRIB_30,
				status: 'scheduled'
			}
		]);
	});

	it('keeps a session starting exactly at fromTime', () => {
		const result = nextOccurrences({
			schedules: [weekendMaghrib],
			prayerTimes: bienne,
			from: '2026-03-28',
			fromTime: '19:20',
			limit: 1
		});
		expect(result).toEqual([
			scheduled('weekend-maghrib', '2026-03-28', '19:20', '20:20', MAGHRIB_30)
		]);
	});

	it('drops, on the from day, a moved_here session starting before fromTime and keeps one at fromTime', () => {
		const exceptions: SessionException[] = [
			{
				kind: 'moved',
				courseId: 'weekend-maghrib',
				date: '2026-03-28',
				toDate: '2026-03-30',
				toStart: '18:00'
			}
		];
		const summary = (occurrences: readonly Occurrence[]): (string | null)[][] =>
			occurrences.map((occurrence) => [occurrence.date, occurrence.status, occurrence.start]);
		// Lundi 30 mars : la séance déplacée à 18:00 est passée à 18:30 ; la suivante est le samedi 4 avril.
		expect(
			summary(
				nextOccurrences({
					schedules: [weekendMaghrib],
					exceptions,
					prayerTimes: bienne,
					from: '2026-03-30',
					fromTime: '18:30',
					limit: 1
				})
			)
		).toEqual([['2026-04-04', 'scheduled', null]]);
		expect(
			summary(
				nextOccurrences({
					schedules: [weekendMaghrib],
					exceptions,
					prayerTimes: bienne,
					from: '2026-03-30',
					fromTime: '18:00',
					limit: 1
				})
			)
		).toEqual([['2026-03-30', 'moved_here', '18:00']]);
	});

	it('keeps every session of the from day when fromTime is omitted', () => {
		const result = nextOccurrences({
			schedules: [weekendMaghrib],
			prayerTimes: bienne,
			from: '2026-03-28',
			limit: 1
		});
		expect(result).toEqual([
			scheduled('weekend-maghrib', '2026-03-28', '19:20', '20:20', MAGHRIB_30)
		]);
	});

	it('keeps an unknown start on the from day while dropping earlier fixed sessions', () => {
		const DAY: IsoDate = '2026-04-10';
		const result = nextOccurrences({
			schedules: [
				anchored('anchored-unknown', 'maghrib', 30, 60, [DAY]),
				fixed('fixed-early', '09:00', '10:00', [DAY]),
				fixed('fixed-at', '10:00', '10:30', [DAY]),
				fixed('fixed-late', '11:00', '12:00', [DAY])
			],
			prayerTimes: bienne,
			from: DAY,
			fromTime: '10:00',
			limit: 10
		});
		expect(ids(result)).toEqual(['fixed-at', 'fixed-late', 'anchored-unknown']);
		expect(result[2]?.start).toBeNull();
		expect(result[2]?.anchor).toEqual(MAGHRIB_30);
	});

	it('does not apply fromTime to the days after from', () => {
		const result = nextOccurrences({
			schedules: [weekendMaghrib],
			prayerTimes: bienne,
			from: '2026-03-27',
			fromTime: '23:00',
			limit: 1
		});
		expect(result).toEqual([
			scheduled('weekend-maghrib', '2026-03-28', '19:20', '20:20', MAGHRIB_30)
		]);
	});

	it('keeps on the from day a session whose start falls after midnight (startsNextDay)', () => {
		const DAY: IsoDate = '2026-05-10';
		const result = nextOccurrences({
			schedules: [anchored('late', 'isha', 30, 60, [DAY])],
			prayerTimes: everyDay(MIDNIGHT_TIMES),
			from: DAY,
			fromTime: '12:00',
			limit: 1
		});
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ date: DAY, start: '00:10', startDayOffset: 1 });
	});

	it('returns only scheduled and moved_here sessions', () => {
		const result = nextOccurrences({
			schedules: [weekendMaghrib],
			exceptions: [
				{ kind: 'cancelled', courseId: 'weekend-maghrib', date: '2026-03-28' },
				{
					kind: 'moved',
					courseId: 'weekend-maghrib',
					date: '2026-03-29',
					toDate: '2026-03-31',
					toStart: '21:00'
				}
			],
			prayerTimes: bienne,
			from: '2026-03-28',
			limit: 3
		});
		expect(
			result.map((occurrence) => [occurrence.date, occurrence.status, occurrence.start])
		).toEqual([
			['2026-03-31', 'moved_here', '21:00'],
			['2026-04-04', 'scheduled', null],
			['2026-04-05', 'scheduled', null]
		]);
		expect(result[0]?.anchor).toBeUndefined();
		expect(result[0]?.originalDate).toBe('2026-03-29');
	});

	it('respects the horizon', () => {
		const one = nextOccurrences({
			schedules: [weekendMaghrib],
			prayerTimes: bienne,
			from: '2026-03-28',
			limit: 10,
			horizonDays: 1
		});
		expect(one.map((occurrence) => occurrence.date)).toEqual(['2026-03-28']);
		const two = nextOccurrences({
			schedules: [weekendMaghrib],
			prayerTimes: bienne,
			from: '2026-03-28',
			limit: 10,
			horizonDays: 2
		});
		expect(two.map((occurrence) => occurrence.date)).toEqual(['2026-03-28', '2026-03-29']);
	});

	it('explores beyond the first 56-day chunk and stops at limit or at the 400-day horizon', () => {
		const sparse = anchored('sparse', 'maghrib', 30, 60, [
			'2026-03-28',
			'2026-06-01',
			'2026-09-15',
			'2027-06-01'
		]);
		const all = nextOccurrences({
			schedules: [sparse],
			prayerTimes: bienne,
			from: '2026-03-24',
			limit: 10
		});
		expect(all.map((occurrence) => [occurrence.date, occurrence.start])).toEqual([
			['2026-03-28', '19:20'],
			['2026-06-01', null],
			['2026-09-15', null]
		]);
		const limited = nextOccurrences({
			schedules: [sparse],
			prayerTimes: bienne,
			from: '2026-03-24',
			limit: 2
		});
		expect(limited.map((occurrence) => occurrence.date)).toEqual(['2026-03-28', '2026-06-01']);
	});

	it.each([0, -1, 1.5, Number.NaN])('rejects limit %s with invalid_limit', (limit) => {
		expect(
			codesOf(() => nextOccurrences({ schedules: [weekendMaghrib], from: '2026-03-28', limit }))
		).toEqual(['invalid_limit']);
	});

	it.each([0, -7, 2.5])('rejects horizonDays %s with invalid_horizon', (horizonDays) => {
		expect(
			codesOf(() =>
				nextOccurrences({ schedules: [weekendMaghrib], from: '2026-03-28', limit: 1, horizonDays })
			)
		).toEqual(['invalid_horizon']);
	});

	it('rejects an invalid from date', () => {
		const codes = codesOf(() =>
			nextOccurrences({ schedules: [weekendMaghrib], from: '2026-13-01', limit: 1 })
		);
		expect(codes.length).toBeGreaterThan(0);
		expect(new Set(codes)).toEqual(new Set(['invalid_date']));
	});
});

describe('sorting within a day', () => {
	const DAY: IsoDate = '2026-05-10';

	it('places an anchored course at 19:25 after a fixed course at 19:00 and before one at 20:00', () => {
		// maghrib 18:52 + 30 = 19:22 → 19:25 ; les identifiants sont choisis pour contredire l'ordre.
		const lookup = everyDay({ ...MIDNIGHT_TIMES, maghrib: '18:52' });
		const occurrences = expandDay(
			[
				fixed('a-fixed-20', '20:00', '21:00', [DAY]),
				anchored('m-anchored', 'maghrib', 30, 60, [DAY]),
				fixed('z-fixed-19', '19:00', '20:00', [DAY])
			],
			DAY,
			lookup
		);
		expect(ids(occurrences)).toEqual(['z-fixed-19', 'm-anchored', 'a-fixed-20']);
		expect(occurrences.map((occurrence) => occurrence.start)).toEqual(['19:00', '19:25', '20:00']);
	});

	it('counts a start on the next day as 24 hours later and keeps unknown starts last', () => {
		const occurrences = expandDay(
			[
				anchored('a-next-day', 'isha', 30, 60, [DAY]), // 23:40 + 30 = 00:10 le lendemain
				anchored('b-unknown', 'fajr', -120, 60, [DAY]), // 01:00 - 120 : heure inconnue
				fixed('z-late', '23:30', '23:59', [DAY])
			],
			DAY,
			everyDay(MIDNIGHT_TIMES)
		);
		expect(ids(occurrences)).toEqual(['z-late', 'a-next-day', 'b-unknown']);
	});

	it('breaks ties at equal start by course id', () => {
		const occurrences = expandDay(
			[
				anchored('b-course', 'maghrib', 30, 60, [DAY]),
				anchored('a-course', 'maghrib', 30, 60, [DAY]),
				fixed('c-course', '18:30', '19:30', [DAY]) // 18:00 + 30 = 18:30 pour les deux ancrés
			],
			DAY,
			everyDay(MIDNIGHT_TIMES)
		);
		expect(occurrences.map((occurrence) => occurrence.start)).toEqual(['18:30', '18:30', '18:30']);
		expect(ids(occurrences)).toEqual(['a-course', 'b-course', 'c-course']);
	});

	it('sorts by date before anything else', () => {
		const occurrences = expandOccurrences({
			schedules: [
				anchored('anchored', 'maghrib', 30, 60, ['2026-03-29', '2026-03-28']),
				fixed('fixed', '08:00', '09:00', ['2026-03-29'])
			],
			range: { from: '2026-03-28', to: '2026-03-29' },
			prayerTimes: bienne
		});
		expect(occurrences.map((occurrence) => [occurrence.date, occurrence.courseId])).toEqual([
			['2026-03-28', 'anchored'],
			['2026-03-29', 'fixed'],
			['2026-03-29', 'anchored']
		]);
	});
});

describe('unreadable prayer times', () => {
	// ADR 0004 : une heure illisible pour la prière demandée vaut heure inconnue, comme un jour
	// absent de la table. Une cellule vide ou au format « 20h00 » d'un import CSV (étape 7) ne doit
	// pas faire échouer toute l'expansion.
	const schedule: CourseSchedule = {
		id: 'tafsir',
		recurrence: { kind: 'weekly', weekdays: [1], interval: 1, anchorDate: '2026-03-30' },
		timing: { kind: 'prayer', prayer: 'maghrib', offsetMinutes: 30, durationMinutes: 60 },
		startsOn: '2026-03-30',
		sequence: 0
	};

	it('treats a malformed or missing prayer time as unknown, keeping the anchor', () => {
		for (const maghrib of ['25:00', '20h00', '', undefined, null, 1900]) {
			const prayerTimes: PrayerTimesLookup = (date) =>
				({
					date,
					fajr: '05:00',
					dhuhr: '13:00',
					asr: '17:00',
					maghrib: maghrib as unknown as LocalTime,
					isha: '22:00'
				}) as PrayerDay;
			const result = expandOccurrences({
				schedules: [schedule],
				range: { from: '2026-03-30', to: '2026-03-30' },
				prayerTimes
			});
			expect(result, `maghrib ${String(maghrib)}`).toEqual([
				{
					courseId: 'tafsir',
					date: '2026-03-30',
					start: null,
					end: null,
					startDayOffset: 0,
					endDayOffset: 0,
					anchor: { prayer: 'maghrib', offsetMinutes: 30 },
					status: 'scheduled'
				}
			]);
		}
	});

	it('still reads a valid time for another prayer of the same day', () => {
		const prayerTimes: PrayerTimesLookup = (date) =>
			({
				date,
				fajr: '05:00',
				dhuhr: '13:00',
				asr: '17:00',
				maghrib: 'n/a' as unknown as LocalTime,
				isha: '22:00'
			}) as PrayerDay;
		const isha: CourseSchedule = {
			...schedule,
			id: 'qiyam',
			timing: { kind: 'prayer', prayer: 'isha', offsetMinutes: 0, durationMinutes: 30 }
		};
		const result = expandOccurrences({
			schedules: [isha],
			range: { from: '2026-03-30', to: '2026-03-30' },
			prayerTimes
		});
		expect(result[0]?.start).toBe('22:00');
		expect(result[0]?.end).toBe('22:30');
	});
});

// ---------------------------------------------------------------------------------------------
// L'iqama (étape 8). Ce que l'organisation décide, et qui passe avant l'heure du soleil.
// ---------------------------------------------------------------------------------------------

describe("anchoring on the organisation's iqama", () => {
	/** La table de Bienne, augmentée des iqamas données. */
	function avecIqama(iqama: Partial<Record<Prayer, LocalTime>>): PrayerTimesLookup {
		return (date) => {
			const jour = BIENNE_BY_DATE.get(date);
			return jour ? { ...jour, iqama } : undefined;
		};
	}

	const coursDuSoir: CourseSchedule = {
		...weekendMaghrib,
		id: 'soir',
		recurrence: {
			kind: 'weekly',
			weekdays: [1, 2, 3, 4, 5, 6, 7],
			interval: 1,
			anchorDate: '2026-01-05'
		}
	};

	function heureDe(prayerTimes: PrayerTimesLookup, date: IsoDate, schedule = coursDuSoir) {
		const [occurrence] = expandOccurrences({
			schedules: [schedule],
			range: { from: date, to: date },
			prayerTimes
		});
		return occurrence?.start ?? null;
	}

	it('prefers the iqama over the sun time', () => {
		// Le soleil dit 18:50 le 28 mars ; l'organisation appelle la prière à 19:05. Le cours est
		// « maghrib + 30 min » : il suit l'iqama, donc 19:35, et non 19:20.
		expect(heureDe(bienne, '2026-03-28')).toBe('19:20');
		expect(heureDe(avecIqama({ maghrib: '19:05' }), '2026-03-28')).toBe('19:35');
	});

	it('falls back to the sun time for a prayer whose iqama is not set', () => {
		// Une organisation peut régler l'iqama de trois prières et pas des deux autres : chaque prière
		// retombe sur sa propre heure de soleil, indépendamment des autres.
		const table = avecIqama({ fajr: '06:30', isha: '21:00' });
		expect(heureDe(table, '2026-03-28')).toBe('19:20');
		const fajr: CourseSchedule = {
			...coursDuSoir,
			id: 'aube',
			timing: { kind: 'prayer', prayer: 'fajr', offsetMinutes: 0, durationMinutes: 30 }
		};
		expect(heureDe(table, '2026-03-28', fajr)).toBe('06:30');
	});

	it('leaves the session without an hour when neither iqama nor sun time is known', () => {
		// Le repli complet : ni iqama, ni heure du soleil. Le comportement d'avant l'étape 8, mot
		// pour mot — la séance sort avec son ancrage et sans heure.
		const [occurrence] = expandOccurrences({
			schedules: [coursDuSoir],
			range: { from: '2026-05-01', to: '2026-05-01' },
			prayerTimes: avecIqama({ fajr: '06:30' })
		});
		expect(occurrence).toMatchObject({ start: null, end: null, anchor: MAGHRIB_30 });
	});

	it("keeps the course's own offset meaning what it meant", () => {
		// Le décalage du cours s'ajoute à l'iqama exactement comme il s'ajoutait au soleil, arrondi
		// compris : ce n'est pas une seconde règle, c'est la même appliquée à une autre base.
		const table = avecIqama({ maghrib: '19:06' });
		const sansDecalage: CourseSchedule = {
			...coursDuSoir,
			id: 'sans-decalage',
			timing: { kind: 'prayer', prayer: 'maghrib', offsetMinutes: 0, durationMinutes: 60 }
		};
		// 19:06 pile, arrondi aux cinq minutes supérieures : 19:10.
		expect(heureDe(table, '2026-03-28', sansDecalage)).toBe('19:10');
		// 19:06 + 30 = 19:36, arrondi : 19:40.
		expect(heureDe(table, '2026-03-28')).toBe('19:40');
	});

	it('does not move a fixed iqama across the change of clock, and that is intended', () => {
		// **À ne pas « corriger » plus tard.** Le samedi 28 mars le soleil se couche à 18:50 ; le
		// dimanche 29, l'heure locale a avancé d'une heure et il se couche à 19:52. Une iqama fixée
		// à 19:15 reste à 19:15 les deux jours : c'est ce qu'affiche le panneau de l'organisation,
		// qui ne change pas de lui-même. L'organisation corrigera son panneau, et sa période, quand
		// elle le décidera — ce n'est pas au service de décider à sa place.
		const table = avecIqama({ maghrib: '19:15' });
		expect(heureDe(table, '2026-03-28')).toBe('19:45');
		expect(heureDe(table, '2026-03-29')).toBe('19:45');
		// Sans iqama, la même séance suit le soleil et saute d'une heure entre les deux jours.
		expect(heureDe(bienne, '2026-03-28')).toBe('19:20');
		expect(heureDe(bienne, '2026-03-29')).toBe('20:25');
	});

	it('ignores an unreadable iqama and falls back to the sun time', () => {
		// Même règle que pour une heure de soleil illisible : on ne devine pas, on retombe.
		const table = avecIqama({ maghrib: '19h05' as unknown as LocalTime });
		expect(heureDe(table, '2026-03-28')).toBe('19:20');
	});

	it('carries the iqama across midnight like any other base hour', () => {
		// Une iqama tardive fait passer le début au lendemain, et la séance reste rattachée au jour
		// de la prière — c'est la règle de l'étape 1, inchangée.
		const [occurrence] = expandOccurrences({
			schedules: [
				{
					...coursDuSoir,
					id: 'qiyam',
					timing: { kind: 'prayer', prayer: 'isha', offsetMinutes: 45, durationMinutes: 60 }
				}
			],
			range: { from: '2026-03-28', to: '2026-03-28' },
			prayerTimes: avecIqama({ isha: '23:40' })
		});
		expect(occurrence).toMatchObject({
			date: '2026-03-28',
			start: '00:25',
			startDayOffset: 1,
			endDayOffset: 1
		});
	});
});

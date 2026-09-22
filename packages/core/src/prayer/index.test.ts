// Le calcul des heures de prière (ADR 0004).
//
// Deux tests portent plus que les autres. Le premier confronte notre chaîne complète — date civile,
// instant, heure locale dans un fuseau IANA — aux jeux de référence publiés par `adhan` elle-même :
// si nous nous trompions d'un jour, d'un fuseau ou d'une heure d'été, ils le diraient. Le second
// parcourt une année entière à Bienne et vérifie ce qui doit tenir tous les jours.

import { describe, expect, it } from 'vitest';
import { addDays, type IsoDate, type LocalTime } from '../index.js';
import {
	CALCULATION_METHODS,
	computePrayerDay,
	crossesMidnight,
	HIGH_LATITUDE_RULES,
	isCalculationMethod,
	isHighLatitudeRule,
	isMadhab,
	recommendedHighLatitudeRule,
	type PrayerSettings
} from './index.js';
import doha from './reference/Doha-Qatar.json' with { type: 'json' };
import londres from './reference/London-MoonsightingCommittee.json' with { type: 'json' };

/** Bienne, l'organisation de référence du projet. */
const BIENNE: PrayerSettings = {
	latitude: 47.1368,
	longitude: 7.2468,
	timeZone: 'Europe/Zurich',
	method: 'MuslimWorldLeague',
	madhab: 'shafi',
	highLatitudeRule: 'middleofthenight'
};

const PRIERES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

function minutes(heure: LocalTime): number {
	const [h, m] = heure.split(':').map(Number);
	return (h as number) * 60 + (m as number);
}

/** « 4:58 AM » des jeux de référence vers « 04:58 ». Midi et minuit sont les deux pièges. */
function de12h(valeur: string): LocalTime {
	const trouve = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(valeur.trim());
	if (!trouve) throw new Error(`heure de référence illisible : ${valeur}`);
	const brut = Number(trouve[1]);
	const meridien = (trouve[3] as string).toUpperCase();
	const heure = meridien === 'AM' ? (brut === 12 ? 0 : brut) : brut === 12 ? 12 : brut + 12;
	return `${String(heure).padStart(2, '0')}:${trouve[2]}` as LocalTime;
}

interface JeuDeReference {
	params: {
		latitude: number;
		longitude: number;
		timezone: string;
		method: string;
		madhab: string;
		highLatitudeRule: string;
	};
	times: {
		date: string;
		fajr: string;
		dhuhr: string;
		asr: string;
		maghrib: string;
		isha: string;
	}[];
}

describe('les jeux de référence publiés par adhan', () => {
	it.each([
		['Doha (Qatar, Shafi, sans heure d’été)', doha as JeuDeReference],
		['Londres (MoonsightingCommittee, Hanafi, avec heure d’été)', londres as JeuDeReference]
	])('matches %s to the minute', (_nom, jeu) => {
		const settings: PrayerSettings = {
			latitude: jeu.params.latitude,
			longitude: jeu.params.longitude,
			timeZone: jeu.params.timezone,
			method: jeu.params.method as PrayerSettings['method'],
			madhab: jeu.params.madhab.toLowerCase() as PrayerSettings['madhab'],
			highLatitudeRule:
				jeu.params.highLatitudeRule.toLowerCase() as PrayerSettings['highLatitudeRule']
		};
		expect(jeu.times.length).toBeGreaterThan(5);
		for (const attendu of jeu.times) {
			const calcule = computePrayerDay(attendu.date as IsoDate, settings);
			expect(calcule, attendu.date).toBeDefined();
			for (const priere of PRIERES) {
				expect(calcule?.[priere], `${attendu.date} ${priere} (référence ${attendu[priere]})`).toBe(
					de12h(attendu[priere])
				);
			}
		}
	});
});

describe('une année entière à Bienne', () => {
	const jours: IsoDate[] = [];
	for (let index = 0; index < 365; index += 1) jours.push(addDays('2026-01-01' as IsoDate, index));

	it('produces the five prayers every single day', () => {
		for (const jour of jours) {
			const calcule = computePrayerDay(jour, BIENNE);
			expect(calcule, jour).toBeDefined();
			for (const priere of PRIERES) {
				expect(calcule?.[priere], `${jour} ${priere}`).toMatch(/^\d{2}:\d{2}$/);
			}
		}
	});

	it('keeps fajr before dhuhr before asr before maghrib, every day', () => {
		// L'Isha est exclue de cette chaîne : elle passe minuit une partie de l'été, et son heure
		// affichée devient alors inférieure à toutes les autres. C'est la raison pour laquelle la
		// base ne porte aucune contrainte d'ordre (ADR 0004).
		for (const jour of jours) {
			const jourCalcule = computePrayerDay(jour, BIENNE);
			const heures = PRIERES.slice(0, 4).map((priere) =>
				minutes(jourCalcule?.[priere] as LocalTime)
			);
			for (let index = 1; index < heures.length; index += 1) {
				expect(
					(heures[index] as number) > (heures[index - 1] as number),
					`${jour} : ${PRIERES[index - 1]} ${jourCalcule?.[PRIERES[index - 1] as 'fajr']} puis ${PRIERES[index]} ${jourCalcule?.[PRIERES[index] as 'fajr']}`
				).toBe(true);
			}
		}
	});

	it('has isha cross midnight around the solstice, and says so', () => {
		const traversees = jours.filter((jour) => crossesMidnight(jour, BIENNE));
		// Mesuré : vingt-huit jours en 2026, du 9 juin au 6 juillet. Le nombre exact dépend de
		// l'année ; ce qui doit tenir, c'est qu'il ne soit ni nul — ce serait croire le problème
		// absent — ni de l'ordre de l'année.
		expect(traversees.length).toBeGreaterThan(20);
		expect(traversees.length).toBeLessThan(40);
		expect(traversees[0]?.slice(0, 7)).toBe('2026-06');
		expect(traversees.at(-1)?.slice(0, 7)).toBe('2026-07');
		// Et ces jours-là, l'heure affichée est bien une heure du petit matin.
		for (const jour of traversees) {
			expect(minutes(computePrayerDay(jour, BIENNE)?.isha as LocalTime)).toBeLessThan(120);
		}
	});

	it('moves by minutes from one day to the next, never by an hour', () => {
		// Le contrôle de plausibilité de l'import s'appuie sur cet ordre de grandeur : à 47° N, une
		// prière ne bouge que de quelques minutes par jour. Les deux jours de changement d'heure
		// n'y font pas exception, parce que l'heure locale et le fuseau bougent ensemble.
		for (let index = 1; index < jours.length; index += 1) {
			const veille = computePrayerDay(jours[index - 1] as IsoDate, BIENNE);
			const jour = computePrayerDay(jours[index] as IsoDate, BIENNE);
			// L'Isha est écartée : son passage sous minuit fait un écart apparent de 24 heures.
			for (const priere of ['fajr', 'dhuhr', 'asr', 'maghrib'] as const) {
				const ecart = Math.abs(
					minutes(jour?.[priere] as LocalTime) - minutes(veille?.[priere] as LocalTime)
				);
				// Les deux jours de changement d'heure décalent l'heure affichée d'une heure pleine.
				const change = ecart > 45;
				expect(
					change ? Math.abs(ecart - 60) <= 6 : ecart <= 6,
					`${jours[index]} ${priere} : écart de ${ecart} min`
				).toBe(true);
			}
		}
	});

	it('changes the clock on the two days the time zone does, and only those', () => {
		// 2026 : passage à l'heure d'été le 29 mars, retour le 25 octobre.
		const sauts = jours.filter((jour, index) => {
			if (index === 0) return false;
			const veille = computePrayerDay(jours[index - 1] as IsoDate, BIENNE);
			const calcule = computePrayerDay(jour, BIENNE);
			return (
				Math.abs(minutes(calcule?.dhuhr as LocalTime) - minutes(veille?.dhuhr as LocalTime)) > 45
			);
		});
		expect(sauts).toEqual(['2026-03-29', '2026-10-25']);
	});
});

describe('les réglages', () => {
	it('recommends the middle of the night everywhere in Switzerland', () => {
		// Le seuil de la bibliothèque est strictement 48°. Bargen SH, 47,81° N, est le point le plus
		// au nord du pays : la règle recommandée y est encore celle du milieu de la nuit.
		expect(recommendedHighLatitudeRule(47.1368)).toBe('middleofthenight');
		expect(recommendedHighLatitudeRule(47.8081)).toBe('middleofthenight');
		// Le seuil est strictement supérieur à 48 : 48,0 est encore en deçà, 48,0001 au-delà.
		expect(recommendedHighLatitudeRule(48)).toBe('middleofthenight');
		expect(recommendedHighLatitudeRule(48.0001)).toBe('seventhofthenight');
		expect(recommendedHighLatitudeRule(48.8566)).toBe('seventhofthenight');
	});

	it('changes the answer when the rule changes, which is why the organisation chooses', () => {
		const solstice = '2026-06-21' as IsoDate;
		const milieu = computePrayerDay(solstice, BIENNE);
		const septieme = computePrayerDay(solstice, {
			...BIENNE,
			highLatitudeRule: 'seventhofthenight'
		});
		// Mesuré : 02:36 contre 04:26 pour le Fajr, 00:10 contre 22:40 pour l'Isha.
		expect(minutes(septieme?.fajr as LocalTime)).toBeGreaterThan(
			minutes(milieu?.fajr as LocalTime) + 60
		);
		expect(crossesMidnight(solstice, BIENNE)).toBe(true);
		expect(crossesMidnight(solstice, { ...BIENNE, highLatitudeRule: 'seventhofthenight' })).toBe(
			false
		);
	});

	it('shifts every prayer by the minutes the organisation asks for', () => {
		const jour = '2026-09-21' as IsoDate;
		const sans = computePrayerDay(jour, BIENNE);
		const avec = computePrayerDay(jour, {
			...BIENNE,
			adjustments: { fajr: 5, dhuhr: -3, asr: 0, maghrib: 2, isha: 10 }
		});
		expect(minutes(avec?.fajr as LocalTime) - minutes(sans?.fajr as LocalTime)).toBe(5);
		expect(minutes(avec?.dhuhr as LocalTime) - minutes(sans?.dhuhr as LocalTime)).toBe(-3);
		expect(avec?.asr).toBe(sans?.asr);
		expect(minutes(avec?.maghrib as LocalTime) - minutes(sans?.maghrib as LocalTime)).toBe(2);
		expect(minutes(avec?.isha as LocalTime) - minutes(sans?.isha as LocalTime)).toBe(10);
	});

	it('puts asr later under the hanafi school', () => {
		const jour = '2026-09-21' as IsoDate;
		const shafi = computePrayerDay(jour, BIENNE);
		const hanafi = computePrayerDay(jour, { ...BIENNE, madhab: 'hanafi' });
		expect(minutes(hanafi?.asr as LocalTime)).toBeGreaterThan(minutes(shafi?.asr as LocalTime));
		// Et rien d'autre ne bouge : l'école ne décide que de la longueur d'ombre de l'Asr.
		expect(hanafi?.fajr).toBe(shafi?.fajr);
		expect(hanafi?.maghrib).toBe(shafi?.maghrib);
	});

	it('answers for every method it offers', () => {
		for (const method of CALCULATION_METHODS) {
			const jour = computePrayerDay('2026-09-21' as IsoDate, { ...BIENNE, method });
			// `Other` a des angles nuls : elle ne produit rien de sensé tant qu'on ne les pose pas.
			if (method === 'Other') continue;
			expect(jour, method).toBeDefined();
			expect(jour?.maghrib, method).toMatch(/^\d{2}:\d{2}$/);
		}
		for (const regle of HIGH_LATITUDE_RULES) {
			expect(
				computePrayerDay('2026-06-21' as IsoDate, { ...BIENNE, highLatitudeRule: regle })
			).toBeDefined();
		}
	});

	it('recognises its own names, and nothing else', () => {
		expect(isCalculationMethod('MuslimWorldLeague')).toBe(true);
		expect(isCalculationMethod('muslimworldleague')).toBe(false);
		expect(isCalculationMethod('Inconnue')).toBe(false);
		expect(isMadhab('hanafi')).toBe(true);
		expect(isMadhab('maliki')).toBe(false);
		expect(isHighLatitudeRule('middleofthenight')).toBe(true);
		expect(isHighLatitudeRule('minuit')).toBe(false);
	});

	it('says nothing rather than something wrong when a date is unreadable', () => {
		expect(computePrayerDay('pas-une-date' as IsoDate, BIENNE)).toBeUndefined();
		expect(computePrayerDay('2026-02-30' as IsoDate, BIENNE)).toBeUndefined();
	});

	it('produces no fajr at all where the sun never goes low enough', () => {
		// Tromsø, 69,65° N, fin juin : le soleil ne passe jamais sous l'horizon. Une méthode peut
		// donc ne rien produire, et un jour incomplet n'est pas écrit du tout.
		const tromso: PrayerSettings = {
			...BIENNE,
			latitude: 69.6492,
			longitude: 18.9553,
			timeZone: 'Europe/Oslo'
		};
		expect(computePrayerDay('2026-06-21' as IsoDate, tromso)).toBeUndefined();
		// Et en décembre, où le soleil ne se lève pas davantage.
		expect(computePrayerDay('2026-12-21' as IsoDate, tromso)).toBeUndefined();
	});
});

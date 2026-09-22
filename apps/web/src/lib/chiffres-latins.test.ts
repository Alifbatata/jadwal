// Un seul système de chiffres dans toute la vue arabe : les chiffres latins, de 0 à 9 (ADR 0007).
//
// Chaque formatage que la page publique et le flux agenda emploient en arabe passe ici sur une large
// plage d'entrées, et aucune sortie ne doit porter un chiffre arabe oriental (U+0660 à U+0669) ni un
// chiffre persan (U+06F0 à U+06F9). Le widget a le même contrôle dans son propre paquet.
//
// Le danger n'est pas théorique. Sur Node 24 (ICU 78, CLDR 48), `Intl.NumberFormat('ar')` rend
// « 15 », mais `Intl.NumberFormat('ar-EG')` rend « ١٥ » : un formatage qui passerait un jour par
// une locale régionale changerait de système sans qu'aucun texte du dépôt ne change.

import { describe, expect, it } from 'vitest';
import { addDays, type IsoDate, type LocalTime, type Prayer } from '@jadwal/core';
import { buildCalendar } from '@jadwal/core/ics';
import { computePrayerDay } from '@jadwal/core/prayer';
import { dateWithYear, longDate, monthName, t } from './i18n.js';
import {
	heureDeSeance,
	horaireEnClair,
	languesEnClair,
	nomPriere,
	rythmeEnClair
} from './public/affichage.js';
import { libelleAncrage } from './server/agenda.js';

const ORIENTAUX = /[٠-٩۰-۹]/;
const PRIERES: readonly Prayer[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
/** Toute la plage des décalages permis par la base et le cœur, -120 à 240. */
const DECALAGES = Array.from({ length: 361 }, (_, index) => index - 120);
const JOURS = Array.from({ length: 731 }, (_, index) => addDays('2026-01-01' as IsoDate, index));
/** Une heure toutes les cinq minutes, de 00:00 à 23:55. */
const HEURES = Array.from({ length: 288 }, (_, index) => {
	const minutes = index * 5;
	return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

/** Chaque sortie arabe, rangée sous le nom du formatage qui l'a produite. */
function sortiesArabes(): [string, string][] {
	const mots = t('ar');
	const sorties: [string, string][] = [];
	const noter = (formatage: string, sortie: string) => sorties.push([formatage, sortie]);

	for (const jour of JOURS) {
		noter('longDate', longDate('ar', jour));
		noter('dateWithYear', dateWithYear('ar', jour));
	}
	for (let annee = 2026; annee <= 2030; annee += 1) {
		for (let mois = 1; mois <= 12; mois += 1) noter('monthName', monthName('ar', annee, mois));
	}
	noter('period', mots.period(longDate('ar', JOURS[0]!), longDate('ar', JOURS[6]!)));
	noter('fromTo', mots.fromTo(dateWithYear('ar', JOURS[0]!), dateWithYear('ar', JOURS[300]!)));
	noter('movedTo', mots.movedTo(longDate('ar', JOURS[40]!)));
	noter('originallyOn', mots.originallyOn(longDate('ar', JOURS[41]!)));
	for (let seances = 0; seances <= 500; seances += 1) {
		noter('sessionCount', mots.sessionCount(seances));
	}

	for (const heure of HEURES) {
		const fin = HEURES[(HEURES.indexOf(heure) + 18) % HEURES.length]!;
		noter('heureDeSeance (fixe)', heureDeSeance('ar', { start: heure, end: fin, anchor: null }));
		noter(
			'horaireEnClair (fixe)',
			horaireEnClair('ar', { timingKind: 'fixed', timingStart: `${heure}:00`, timingEnd: fin })
		);
	}
	for (const priere of PRIERES) {
		const nom = nomPriere('ar', priere);
		for (const decalage of DECALAGES) {
			// Le dictionnaire reçoit une valeur absolue : « après » pour un décalage positif, « avant »
			// pour un négatif. Zéro est la phrase de `after`, déjà relevée par les séances ancrées.
			if (decalage > 0) noter('afterOffset', mots.afterOffset(decalage, nom));
			if (decalage < 0) noter('beforeOffset', mots.beforeOffset(-decalage, nom));
			noter(
				'heureDeSeance (ancrée)',
				heureDeSeance('ar', {
					start: '19:40',
					end: null,
					anchor: { prayer: priere, offsetMinutes: decalage }
				})
			);
			noter(
				'horaireEnClair (ancrée)',
				horaireEnClair('ar', {
					timingKind: 'prayer',
					timingPrayer: priere,
					timingOffsetMinutes: decalage
				})
			);
			noter('libellé d’ancrage du flux', libelleAncrage('ar', priere, decalage));
		}
	}

	for (let premier = 1; premier <= 7; premier += 1) {
		for (let second = premier; second <= 7; second += 1) {
			for (const intervalle of [1, 2]) {
				noter(
					'rythmeEnClair (semaine)',
					rythmeEnClair('ar', {
						recurrenceKind: 'weekly',
						recurrenceWeekdays: premier === second ? [premier] : [premier, second],
						recurrenceInterval: intervalle
					})
				);
			}
		}
	}
	for (const rang of [1, 2, 3, 4, -1]) {
		for (let jour = 1; jour <= 7; jour += 1) {
			noter(
				'rythmeEnClair (mois)',
				rythmeEnClair('ar', {
					recurrenceKind: 'monthly',
					recurrenceOrdinal: rang,
					recurrenceOrdinalWeekday: jour
				})
			);
		}
	}
	noter('rythmeEnClair (dates)', rythmeEnClair('ar', { recurrenceKind: 'dates' }));
	noter('languesEnClair', languesEnClair('ar', ['fr', 'de', 'it', 'ar', 'en', 'sq', 'tr', 'bs']));

	// Les heures de prière : celles du bloc du vendredi, du Dhuhr remplacé par la session, et celles
	// entre parenthèses d'une séance ancrée, sortent toutes du calcul du cœur ou de la base.
	const reglages = {
		latitude: 47.14,
		longitude: 7.25,
		timeZone: 'Europe/Zurich',
		method: 'MuslimWorldLeague',
		madhab: 'shafi',
		highLatitudeRule: 'middleofthenight'
	} as const;
	for (const jour of JOURS.slice(0, 366)) {
		const heures = computePrayerDay(jour, reglages);
		if (!heures) continue;
		for (const priere of PRIERES) {
			noter('heure de prière (cœur)', heures[priere]);
			noter(
				'heureDeSeance (ancrée, heure du jour)',
				heureDeSeance('ar', {
					start: heures[priere],
					end: null,
					anchor: { prayer: priere, offsetMinutes: 0 }
				})
			);
		}
	}

	// Le flux lui-même, en entier : un cours ancré séance par séance et un cours à heure fixe.
	const prieres = new Map(
		JOURS.map((jour) => [jour, computePrayerDay(jour, reglages)] as const).filter(
			(entree): entree is [IsoDate, NonNullable<(typeof entree)[1]>] => entree[1] !== undefined
		)
	);
	noter(
		'flux agenda (fichier entier)',
		buildCalendar({
			name: 'جمعية بلفيدير',
			timeZone: 'Europe/Zurich',
			now: new Date('2026-09-22T10:00:00Z'),
			uidHost: 'jadwal.example',
			courses: [
				{
					title: 'درس بعد المغرب',
					schedule: {
						id: 'ancre',
						recurrence: {
							kind: 'weekly',
							weekdays: [1, 3],
							interval: 1,
							anchorDate: '2026-09-21'
						},
						timing: { kind: 'prayer', prayer: 'maghrib', offsetMinutes: 15, durationMinutes: 60 },
						startsOn: '2026-09-01',
						sequence: 0
					}
				},
				{
					title: 'درس السبت',
					schedule: {
						id: 'fixe',
						recurrence: { kind: 'weekly', weekdays: [6], interval: 1, anchorDate: '2026-09-26' },
						timing: { kind: 'fixed', start: '10:00' as LocalTime, end: '11:30' as LocalTime },
						startsOn: '2026-09-01',
						sequence: 0
					}
				}
			],
			prayerTimes: (date) => prieres.get(date),
			anchorLabel: (priere, decalage) => libelleAncrage('ar', priere, decalage)
		})
	);
	return sorties;
}

describe('les chiffres de la vue arabe', () => {
	const sorties = sortiesArabes();

	it('covers every formatting of the Arabic view', () => {
		expect(new Set(sorties.map(([formatage]) => formatage))).toEqual(
			new Set([
				'longDate',
				'dateWithYear',
				'monthName',
				'period',
				'fromTo',
				'movedTo',
				'originallyOn',
				'sessionCount',
				'heureDeSeance (fixe)',
				'horaireEnClair (fixe)',
				'afterOffset',
				'beforeOffset',
				'heureDeSeance (ancrée)',
				'horaireEnClair (ancrée)',
				'libellé d’ancrage du flux',
				'rythmeEnClair (semaine)',
				'rythmeEnClair (mois)',
				'rythmeEnClair (dates)',
				'languesEnClair',
				'heure de prière (cœur)',
				'heureDeSeance (ancrée, heure du jour)',
				'flux agenda (fichier entier)'
			])
		);
		// Les chiffres latins sont bien là : une vue qui aurait perdu ses nombres passerait aussi.
		expect(sorties.filter(([, sortie]) => /[0-9]/.test(sortie)).length).toBeGreaterThan(5000);
	});

	it('writes every number in Latin digits, never in Eastern Arabic or Persian ones', () => {
		const fautives = sorties.filter(([, sortie]) => ORIENTAUX.test(sortie));
		expect(fautives.slice(0, 5)).toEqual([]);
	});
});

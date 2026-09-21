// Aides de test pour relire un flux ICS avec ical.js (contrôle croisé indépendant d'ical-generator).
// Importé uniquement par index.test.ts. Pièges d'ical.js 2.2.1 pris en compte ici : enregistrement
// des VTIMEZONE dans TimezoneService, propriétés X- lues comme TEXT, fin de série signalée par
// `undefined`, exceptions RECURRENCE-ID à relier explicitement à l'événement maître.

import ICAL from 'ical.js';
import { daysToIsoDate, isoDateToDays, localTimeToMinutes } from '../dates.js';
import type { IsoDate, Occurrence } from '../types.js';

/** Lignes logiques du flux : coupe sur CRLF et recolle les lignes pliées (CRLF + espace). */
export function unfoldLines(ics: string): string[] {
	return ics.replace(/\r\n[ \t]/g, '').split('\r\n');
}

/** Blocs VEVENT (lignes logiques de BEGIN:VEVENT à END:VEVENT inclus), dans l'ordre du flux. */
export function veventBlocks(ics: string): string[][] {
	const blocks: string[][] = [];
	let current: string[] | null = null;
	for (const line of unfoldLines(ics)) {
		if (line === 'BEGIN:VEVENT') current = [];
		if (current) current.push(line);
		if (line === 'END:VEVENT' && current) {
			blocks.push(current);
			current = null;
		}
	}
	return blocks;
}

/** Valeur de la première propriété `name` d'un bloc de lignes logiques (paramètres compris). */
export function lineValue(block: readonly string[], name: string): string | undefined {
	const line = block.find(
		(item) => item === name || item.startsWith(`${name}:`) || item.startsWith(`${name};`)
	);
	if (line === undefined) return undefined;
	return line.slice(line.indexOf(':') + 1);
}

/** Propriétés X- et RFC 7986 qu'ical.js ne connaît pas : déclarées comme TEXT pour être désechappées. */
const TEXT_PROPERTIES = ['name', 'x-wr-calname', 'x-wr-timezone'];

let designReady = false;

function declareTextProperties(): void {
	if (designReady) return;
	const properties = ICAL.design.icalendar.property as Record<string, { defaultType: string }>;
	for (const name of TEXT_PROPERTIES) properties[name] ??= { defaultType: 'text' };
	designReady = true;
}

/**
 * Analyse un VCALENDAR complet, enregistre ses VTIMEZONE (à appeler après
 * ICAL.TimezoneService.reset()) et renvoie le composant racine.
 */
export function parseCalendar(ics: string): ICAL.Component {
	declareTextProperties();
	const calendar = new ICAL.Component(ICAL.parse(ics));
	for (const zone of calendar.getAllSubcomponents('vtimezone')) {
		ICAL.TimezoneService.register(zone);
	}
	return calendar;
}

export function textValue(component: ICAL.Component, name: string): string | null {
	const value = component.getFirstPropertyValue(name);
	return typeof value === 'string' ? value : null;
}

export function uidOf(component: ICAL.Component): string {
	return textValue(component, 'uid') ?? '';
}

/** Événement maître (sans RECURRENCE-ID) d'un UID, relié à ses exceptions RECURRENCE-ID. */
export function masterEvent(calendar: ICAL.Component, uid: string): ICAL.Event {
	const components = calendar
		.getAllSubcomponents('vevent')
		.filter((component) => uidOf(component) === uid);
	const masters = components.filter((component) => !component.hasProperty('recurrence-id'));
	if (masters.length !== 1 || masters[0] === undefined) {
		throw new Error(`expected exactly one master VEVENT for ${uid}, got ${masters.length}`);
	}
	const exceptions = components.filter((component) => component.hasProperty('recurrence-id'));
	return new ICAL.Event(masters[0], { exceptions, strictExceptions: true });
}

/** Séance relue : date et heure civiles de début et de fin, « AAAA-MM-JJ HH:MM ». */
export interface CivilSession {
	start: string;
	end: string;
}

export function civilKey(session: CivilSession): string {
	return `${session.start} -> ${session.end}`;
}

/** « 2026-09-23T19:00:00 » (ICAL.Time.toString) → « 2026-09-23 19:00 ». */
export function civilOf(time: ICAL.Time): string {
	const text = time.toString();
	return `${text.slice(0, 10)} ${text.slice(11, 16)}`;
}

export interface ExpandedOccurrence extends CivilSession {
	/** Date d'origine de la séance dans la série (RECURRENCE-ID), « AAAA-MM-JJ ». */
	recurrenceDate: string;
	/** Vrai quand un VEVENT RECURRENCE-ID a remplacé l'occurrence de la série. */
	fromException: boolean;
	startUtc: string;
}

/** Développe un événement maître avec ical.js jusqu'à la fin de série ou jusqu'au jour `to` inclus. */
export function expandWithIcalJs(event: ICAL.Event, to: IsoDate): ExpandedOccurrence[] {
	const result: ExpandedOccurrence[] = [];
	const iterator = event.iterator();
	for (;;) {
		const next: ICAL.Time | undefined = iterator.next();
		if (!next) break; // fin de série : undefined, pas null
		if (next.toString().slice(0, 10) > to) break;
		const details = event.getOccurrenceDetails(next);
		result.push({
			recurrenceDate: details.recurrenceId.toString().slice(0, 10),
			fromException: details.item !== event,
			start: civilOf(details.startDate),
			end: civilOf(details.endDate),
			startUtc: details.startDate.convertToZone(ICAL.Timezone.utcTimezone).toString()
		});
	}
	return result;
}

/** Séance civile d'une occurrence d'expandOccurrences (début et fin le bon jour, même après minuit). */
export function civilSessionOf(occurrence: Occurrence): CivilSession {
	if (occurrence.start === null || occurrence.end === null) {
		throw new Error(`occurrence without times: ${occurrence.courseId} ${occurrence.date}`);
	}
	const startDay = isoDateToDays(occurrence.date) + occurrence.startDayOffset;
	const startMinutes = localTimeToMinutes(occurrence.start);
	const endMinutes = localTimeToMinutes(occurrence.end);
	const endDay = startDay + (endMinutes <= startMinutes ? 1 : 0);
	return {
		start: `${daysToIsoDate(startDay)} ${occurrence.start}`,
		end: `${daysToIsoDate(endDay)} ${occurrence.end}`
	};
}

/** Jour civil (« AAAA-MM-JJ ») où commence réellement une séance relue. */
export function startDateOf(session: CivilSession): string {
	return session.start.slice(0, 10);
}

/** Longueur en octets UTF-8 d'une chaîne (le pliage RFC 5545 compte des octets, pas des caractères). */
export function utf8Length(text: string): number {
	let length = 0;
	for (const character of text) {
		const codePoint = character.codePointAt(0) ?? 0;
		length += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
	}
	return length;
}

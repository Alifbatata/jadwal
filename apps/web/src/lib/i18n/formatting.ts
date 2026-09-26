// Les formes dont `format.ts` a besoin pour écrire un rythme, un horaire, une durée et un public dans
// les cinq langues de l'espace (étape 18).
//
// Ce qui est déjà dit pour la page publique n'est pas redit ici : le rythme d'une semaine sur deux et
// celui du mois, l'horaire fixe, la place d'un cours par rapport à sa prière, les noms des jours, des
// prières et des langues viennent de `i18n.ts` et de `public/affichage.ts`, pour qu'une responsable et
// un visiteur lisent la même chose du même cours. Les formes françaises sont celles que l'espace
// écrivait avant l'étape 18, mot pour mot.

import { plural, type PluralForms, type Translations } from './space.js';

/** Les formes arabes selon le nombre (voir `plural`). Le code de la langue reste hors des textes. */
function arabic(count: number, forms: PluralForms): string {
	return plural('ar', count, forms);
}

/** Deux chiffres pour les minutes d'une durée française : « 2 h 05 ». */
function twoDigits(minutes: number): string {
	return String(minutes).padStart(2, '0');
}

interface FormattingTexts {
	/** « chaque semaine, le lundi et mercredi ». */
	readonly weekly: (days: string) => string;
	/** Des dates, écrites avec le nom de leur jour, en une liste. */
	readonly dateList: (dates: readonly string[]) => string;
	/** Un cours à des dates précises dont on ne montre aucune date. */
	readonly datesNone: string;
	/** « à des dates précises : lundi 21.09.2026 et lundi 05.10.2026 ». */
	readonly dates: (list: string) => string;
	/** La même liste, et le compte des dates qui ne sont pas montrées. */
	readonly datesAndMore: (list: string, more: number) => string;
	/** Une durée, en heures et minutes : l'une ou l'autre peut être nulle, pas les deux. */
	readonly duration: (hours: number, minutes: number) => string;
	/** « 30 min après Maghrib, pendant 1 h 30 ». */
	readonly lasting: (when: string, duration: string) => string;
	/** L'heure d'une séance que la table des prières ne connaît pas encore. */
	readonly timeUnknown: string;
	/** Les publics, au fil d'une ligne. */
	readonly audiences: {
		readonly kids: string;
		readonly youth: string;
		readonly women: string;
		readonly adults: string;
		readonly open: string;
	};
}

export const formattingTexts: Translations<FormattingTexts> = {
	fr: {
		weekly: (days) => `chaque semaine, le ${days}`,
		dateList: (dates) =>
			dates.length < 2
				? (dates[0] ?? '')
				: `${dates.slice(0, -1).join(', ')} et ${dates[dates.length - 1]}`,
		datesNone: 'à des dates précises',
		dates: (list) => `à des dates précises : ${list}`,
		datesAndMore: (list, more) =>
			more === 1
				? `à des dates précises : ${list}, et 1 autre`
				: `à des dates précises : ${list}, et ${more} autres`,
		duration: (hours, minutes) =>
			hours === 0
				? `${minutes} min`
				: minutes === 0
					? `${hours} h`
					: `${hours} h ${twoDigits(minutes)}`,
		lasting: (when, duration) => `${when}, pendant ${duration}`,
		timeUnknown: 'heure à préciser',
		audiences: {
			kids: 'enfants',
			youth: 'jeunes',
			women: 'femmes',
			adults: 'adultes',
			open: 'ouvert à tous'
		}
	},
	de: {
		weekly: (days) => `jede Woche am ${days}`,
		// Un point-virgule entre les dates : « Montag, 21.09.2026 » porte déjà une virgule.
		dateList: (dates) =>
			dates.length < 2
				? (dates[0] ?? '')
				: `${dates.slice(0, -1).join('; ')} und ${dates[dates.length - 1]}`,
		datesNone: 'an bestimmten Daten',
		dates: (list) => `an bestimmten Daten: ${list}`,
		datesAndMore: (list, more) =>
			more === 1
				? `an bestimmten Daten: ${list} sowie 1 weiteres`
				: `an bestimmten Daten: ${list} sowie ${more} weitere`,
		duration: (hours, minutes) => {
			const stunden = hours === 1 ? '1 Stunde' : `${hours} Stunden`;
			const minuten = minutes === 1 ? '1 Minute' : `${minutes} Minuten`;
			return hours === 0 ? minuten : minutes === 0 ? stunden : `${stunden} ${minuten}`;
		},
		lasting: (when, duration) => `${when}, ${duration} lang`,
		timeUnknown: 'Uhrzeit noch offen',
		audiences: {
			kids: 'Kinder',
			youth: 'Jugendliche',
			women: 'Frauen',
			adults: 'Erwachsene',
			open: 'für alle offen'
		}
	},
	it: {
		weekly: (days) => `ogni settimana, il ${days}`,
		dateList: (dates) =>
			dates.length < 2
				? (dates[0] ?? '')
				: `${dates.slice(0, -1).join(', ')} e ${dates[dates.length - 1]}`,
		datesNone: 'in date precise',
		dates: (list) => `in date precise: ${list}`,
		datesAndMore: (list, more) =>
			more === 1
				? `in date precise: ${list}, e un’altra`
				: `in date precise: ${list}, e altre ${more}`,
		duration: (hours, minutes) => {
			const ore = hours === 1 ? '1 ora' : `${hours} ore`;
			const minuti = minutes === 1 ? '1 minuto' : `${minutes} minuti`;
			return hours === 0 ? minuti : minutes === 0 ? ore : `${ore} e ${minuti}`;
		},
		lasting: (when, duration) => `${when}, per ${duration}`,
		timeUnknown: 'orario da definire',
		audiences: {
			kids: 'bambini',
			youth: 'giovani',
			women: 'donne',
			adults: 'adulti',
			open: 'aperto a tutti'
		}
	},
	en: {
		weekly: (days) => `every week on ${days}`,
		dateList: (dates) =>
			dates.length < 2
				? (dates[0] ?? '')
				: `${dates.slice(0, -1).join(', ')} and ${dates[dates.length - 1]}`,
		datesNone: 'on specific dates',
		dates: (list) => `on specific dates: ${list}`,
		datesAndMore: (list, more) => `on specific dates: ${list}, and ${more} more`,
		duration: (hours, minutes) => {
			const hoursText = hours === 1 ? '1 hour' : `${hours} hours`;
			const minutesText = minutes === 1 ? '1 minute' : `${minutes} minutes`;
			return hours === 0 ? minutesText : minutes === 0 ? hoursText : `${hoursText} ${minutesText}`;
		},
		lasting: (when, duration) => `${when}, for ${duration}`,
		timeUnknown: 'time to be confirmed',
		audiences: {
			kids: 'children',
			youth: 'young people',
			women: 'women',
			adults: 'adults',
			open: 'open to all'
		}
	},
	ar: {
		weekly: (days) => `كل أسبوع: ${days}`,
		// « و » collé au mot qui suit, répété devant chaque date, sans virgule, comme `joindre`.
		dateList: (dates) => dates.join(' و'),
		datesNone: 'في تواريخ محددة',
		dates: (list) => `في تواريخ محددة: ${list}`,
		datesAndMore: (list, more) =>
			`في تواريخ محددة: ${list}، ${arabic(more, {
				one: 'وتاريخ آخر',
				two: 'وتاريخان آخران',
				few: `و${more} تواريخ أخرى`,
				many: `و${more} تاريخًا آخر`,
				other: `و${more} تاريخ آخر`
			})}`,
		// Après « لمدة », le duel se met au cas indirect : « ساعتين », « دقيقتين ».
		duration: (hours, minutes) => {
			const saat = arabic(hours, {
				one: 'ساعة',
				two: 'ساعتين',
				few: `${hours} ساعات`,
				many: `${hours} ساعة`,
				other: `${hours} ساعة`
			});
			const daqaiq = arabic(minutes, {
				one: 'دقيقة',
				two: 'دقيقتين',
				few: `${minutes} دقائق`,
				many: `${minutes} دقيقة`,
				other: `${minutes} دقيقة`
			});
			return hours === 0 ? daqaiq : minutes === 0 ? saat : `${saat} و${daqaiq}`;
		},
		lasting: (when, duration) => `${when}، لمدة ${duration}`,
		timeUnknown: 'الوقت لم يُحدَّد بعد',
		audiences: {
			kids: 'الأطفال',
			youth: 'الشباب',
			women: 'النساء',
			adults: 'الكبار',
			open: 'مفتوح للجميع'
		}
	}
};

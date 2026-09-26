// La page publique d'une organisation : trois vues, une langue par lien (ADR 0027), et depuis
// l'étape 18 un quatrième onglet, les heures de prière, quand le module est allumé (retour C4).
//
// Les séances viennent de `@jadwal/core`, comme partout. Cette route lit, filtre par public, et
// range ; elle ne calcule aucune date. Les heures de prière viennent de la même requête que celles
// qui placent les cours ancrés (`readPublicPrayerDays`) : l'onglet ne peut pas dire une autre heure
// que celle qui place un cours « après Maghrib ».

import {
	addDays,
	daysInMonth,
	isIsoDate,
	isoDateToDays,
	weekdayFromDays,
	type IsoDate
} from '@jadwal/core';
import type { PageServerLoad } from './$types.js';
import {
	boundedRange,
	fingerprint,
	pauseCouvrant,
	readPublicPrayerDays,
	readPublicProgramme,
	type SeancePublique
} from '$lib/server/public.js';
import {
	languesProposees,
	publicContext,
	publicDemande,
	referencement
} from '$lib/server/pages.js';
import { lienVue } from '$lib/public/liens.js';
import { CACHE_PROGRAMME } from '$lib/server/api.js';

export type Vue = 'semaine' | 'cours' | 'mois' | 'prieres';

const JOURS_SEMAINE = 7;
/** La navigation par mois est bornée : un an en arrière, un an en avant. */
const MOIS_MAXIMUM = 12;
/** Les cinq prières, dans l'ordre de la journée : les colonnes de l'onglet. */
const PRIERES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

/**
 * La vue demandée. L'onglet des prières n'existe que si le module est allumé : sans lui, l'adresse
 * `?vue=prieres` montre la semaine, comme toute vue inconnue, et ne dit rien d'un réglage.
 */
function vueDemandee(value: string | null, avecPrieres: boolean): Vue {
	if (value === 'prieres') return avecPrieres ? 'prieres' : 'semaine';
	return value === 'cours' || value === 'mois' ? value : 'semaine';
}

/** « 05:30 » : une heure de la base, `05:30:00`, ramenée aux minutes ; `null` si elle manque. */
function minutes(valeur: string | null | undefined): string | null {
	return typeof valeur === 'string' && /^\d{2}:\d{2}/.test(valeur) ? valeur.slice(0, 5) : null;
}

/** Le premier jour du mois demandé, ramené dans les bornes. */
function moisDemande(value: string | null, today: IsoDate): IsoDate {
	const courant = `${today.slice(0, 7)}-01` as IsoDate;
	if (!value || !/^\d{4}-\d{2}$/.test(value)) return courant;
	const demande = `${value}-01` as IsoDate;
	const ecart = (isoDateToDays(demande) - isoDateToDays(courant)) / 30;
	if (ecart < -MOIS_MAXIMUM || ecart > MOIS_MAXIMUM) return courant;
	return demande;
}

/** Le jour choisi dans la vue Mois, s'il existe au calendrier. */
function jourDemande(value: string | null): IsoDate | null {
	return value !== null && isIsoDate(value) ? value : null;
}

export const load: PageServerLoad = async (event) => {
	const { organisation, langue } = await publicContext(event);
	const vue = vueDemandee(event.url.searchParams.get('vue'), organisation.prayer_module);
	const filtre = publicDemande(event);

	const programme = await readPublicProgramme(organisation, langue, new Date());
	const today = programme.today;

	let from: IsoDate = today;
	let to: IsoDate = addDays(today, JOURS_SEMAINE - 1);
	let premierDuMois: IsoDate | null = null;
	if (vue === 'mois') {
		premierDuMois = moisDemande(event.url.searchParams.get('mois'), today);
		const civil = premierDuMois.split('-').map(Number);
		const jours = daysInMonth(civil[0] as number, civil[1] as number);
		from = premierDuMois;
		to = addDays(premierDuMois, jours - 1);
	} else if (vue === 'cours') {
		// La vue Tous les cours montre les prochaines dates : un trimestre suffit largement, et la
		// plage est de toute façon bornée côté serveur.
		({ from, to } = boundedRange(today, today, addDays(today, 91)));
	}

	const complet =
		vue === 'semaine' || vue === 'prieres'
			? programme
			: await readPublicProgramme(organisation, langue, new Date(), { from, to });

	// Les sessions du vendredi de chaque date, telles que l'expansion les rend : annulées, déplacées
	// ailleurs, ou venues d'un autre jour. Toutes, quel que soit le filtre par public : il ne
	// s'applique pas à l'onglet.
	const vendrediDu = (date: string) =>
		complet.seances
			.filter((seance) => seance.kind === 'jumua' && seance.date === date)
			.map((seance) => ({
				id: seance.courseId,
				start: seance.start,
				status: seance.status,
				movedTo: seance.movedTo?.date ?? null
			}));

	// L'onglet des prières : aujourd'hui et les six jours suivants, adhan et iqama de chaque prière,
	// les trois sources résolues comme pour les cours ancrés. Un jour qu'aucune source ne couvre
	// n'est pas montré ; une iqama que l'organisation n'a pas réglée reste vide. Chaque jour porte
	// ses sessions du vendredi réelles (relecture du lot 3) : une ligne datée dit ce qui a lieu ce
	// jour-là, comme la vue Semaine, et non le rythme habituel.
	const prieres =
		vue === 'prieres'
			? (await readPublicPrayerDays(organisation.id, today, addDays(today, JOURS_SEMAINE - 1)))
					.map((ligne) => {
						const date = String(ligne.date).slice(0, 10);
						return {
							date,
							heures: PRIERES.map((priere) => ({
								priere,
								adhan: minutes(ligne[priere]),
								iqama: minutes(ligne[`${priere}_iqama`])
							})),
							vendredi: vendrediDu(date)
						};
					})
					.filter((jour) => jour.heures.some((heure) => heure.adhan !== null))
			: [];

	const garde = (seance: SeancePublique) => !filtre || seance.audience === filtre;
	const seances = complet.seances.filter(garde).map((seance) => ({
		courseId: seance.courseId,
		date: seance.date,
		start: seance.start,
		end: seance.end,
		status: seance.status,
		anchor: seance.anchor ?? null,
		movedTo: seance.movedTo ?? null,
		originalDate: seance.originalDate ?? null,
		title: seance.title,
		audience: seance.audience,
		room: seance.room,
		teacher: seance.teacher,
		kind: seance.kind,
		sermonLanguages: seance.kind === 'jumua' ? seance.teachingLanguages : undefined
	}));

	// Le cache d'une page publique suit la même empreinte que l'API : une modification par un
	// responsable change la version suivante (ADR 0026).
	event.setHeaders({ 'cache-control': CACHE_PROGRAMME });

	const pause = pauseCouvrant(complet.pauses, today);
	// L'adresse canonique d'une vue est cette vue **sans ses filtres** : un filtre par public et une
	// navigation par mois réarrangent le même programme, ils n'ajoutent pas de contenu à indexer.
	const moteur = referencement(event, organisation, langue, (autre) =>
		lienVue(
			{
				slug: organisation.slug,
				langue: autre,
				langueParDefaut: organisation.default_language
			},
			{ vue: vue === 'semaine' ? null : vue }
		)
	);
	// La langue du document, que le hook écrit sur `<html>`. Posée au moment où la page va être
	// rendue ; un 404 levé plus haut pose la sienne, par `introuvable` (`$lib/server/pages.ts`).
	event.locals.langue = langue;
	return {
		canonical: moteur.canonical,
		alternates: moteur.alternates,
		organisation: {
			slug: organisation.slug,
			name: organisation.name,
			accentColor: organisation.accent_color,
			timeZone: organisation.time_zone,
			defaultLanguage: organisation.default_language
		},
		langue,
		langues: languesProposees(organisation),
		vue,
		// L'onglet des prières n'est proposé que si le module est allumé (ADR 0042).
		avecPrieres: organisation.prayer_module,
		prieres,
		filtre,
		from,
		to,
		today,
		premierDuMois,
		// Un jour qui n'existe pas, `2026-02-30`, n'est pas choisi : la page le recopiait tel quel en
		// titre, dans la forme de la base, là où toute date se lit `JJ.MM.AAAA` (étape 18).
		jourChoisi: jourDemande(event.url.searchParams.get('jour')),
		seances,
		// Les sessions du vendredi, pour le bloc du haut. Elles décrivent le **rythme habituel** et
		// ne portent donc aucune exception : une session annulée ou déplacée se lit dans la vue
		// Semaine (docs/maquettes/public-vendredi.md). Elles viennent de la même lecture que les
		// cours — aucune requête de plus.
		vendredi: complet.courses
			.filter((course) => course.kind === 'jumua')
			.sort((a, b) => (a.jumua_order ?? 0) - (b.jumua_order ?? 0))
			.map((course) => ({
				id: course.id,
				start: String(course.timing_start ?? '').slice(0, 5),
				sermonLanguages: course.teaching_language,
				room: course.room
			})),
		// Les cours, pour la vue Tous les cours. Chaque cours porte ses prochaines dates, prises
		// dans la même expansion : aucune requête de plus, et aucun calcul refait.
		cours: complet.courses.map((course) => ({
			id: course.id,
			kind: course.kind,
			jumuaOrder: course.jumua_order,
			title: course.title ?? '',
			description: course.description,
			audience: course.audience,
			teachingLanguages: course.teaching_language,
			room: course.room,
			teacher: course.teacher,
			recurrenceKind: course.recurrence_kind,
			recurrenceWeekdays: course.recurrence_weekday,
			recurrenceInterval: course.recurrence_interval,
			recurrenceOrdinal: course.recurrence_ordinal,
			recurrenceOrdinalWeekday: course.recurrence_ordinal_weekday,
			recurrenceDates: course.recurrence_dates,
			timingKind: course.timing_kind,
			timingStart: course.timing_start,
			timingEnd: course.timing_end,
			timingPrayer: course.timing_prayer,
			timingOffsetMinutes: course.timing_offset_minutes,
			timingDurationMinutes: course.timing_duration_minutes
		})),
		aucunCoursPublie: complet.courses.length === 0,
		pause: pause ? { reason: pause.reason } : null,
		empreinte: await fingerprint(organisation.id),
		premierJourDeLaSemaine: weekdayFromDays(isoDateToDays(from))
	};
};

// La page publique d'une organisation : trois vues, une langue par lien (ADR 0027), et depuis
// l'étape 18 un quatrième onglet, les heures de prière, quand le module est allumé (retour C4).
//
// Les séances viennent de `@jadwal/core`, comme partout. Cette route lit, filtre par public, et
// range ; elle ne calcule aucune date. Les heures de prière viennent de la même requête que celles
// qui placent les cours ancrés (`readPublicPrayerDays`) : l'onglet ne peut pas dire une autre heure
// que celle qui place un cours « après Maghrib ».
//
// Depuis l'étape 24, une cinquième vue, « Aujourd'hui » : les prières du jour, la prochaine, les
// séances du jour et le premier jour suivant qui en a (docs/maquettes/public-aujourdhui.md). Elle lit
// les mêmes deux requêtes, et ce qu'elle décide est dans `#lib/public/aujourdhui.ts`.
//
// Depuis l'étape 25, une sixième, « Direct » : l'écoute du prêche traduit (ADR 0057). Elle
// n'existe que si le direct est allumé sur l'instance et qu'il reste une langue à offrir ; la page
// n'y donne que l'adresse du relais et les langues, et le module `/m/ecoute.js` fait le reste.

import {
	addDays,
	daysInMonth,
	isIsoDate,
	isoDateToDays,
	minuteOfDayInZone,
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
} from '#lib/server/public.js';
import {
	appareilDuVisiteur,
	infosDe,
	languesProposees,
	publicContext,
	publicDemande,
	referencement
} from '#lib/server/pages.js';
import { lienVue } from '#lib/public/liens.js';
import { premierJourSuivant, prochainePriere } from '#lib/public/aujourdhui.js';
import { aDesInfos, lienCarte } from '#lib/public/infos.js';
import { CACHE_AUJOURDHUI, CACHE_PROGRAMME, CACHE_REGLAGES } from '#lib/server/api.js';
import { broadcastLanguages, liveSettings } from '#lib/server/live.js';

export type Vue = 'semaine' | 'cours' | 'mois' | 'prieres' | 'aujourdhui' | 'infos' | 'direct';

const JOURS_SEMAINE = 7;
/** La navigation par mois est bornée : un an en arrière, un an en avant. */
const MOIS_MAXIMUM = 12;
/** Les cinq prières, dans l'ordre de la journée : les colonnes de l'onglet. */
const PRIERES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

/**
 * La vue demandée. L'onglet des prières n'existe que si le module est allumé : sans lui, l'adresse
 * `?vue=prieres` montre la semaine, comme toute vue inconnue, et ne dit rien d'un réglage.
 */
function vueDemandee(
	value: string | null,
	avecPrieres: boolean,
	avecInfos: boolean,
	avecDirect: boolean
): Vue {
	if (value === 'prieres') return avecPrieres ? 'prieres' : 'semaine';
	// L'écoute n'existe que si le direct est allumé et qu'il reste une langue (étape 25).
	if (value === 'direct') return avecDirect ? 'direct' : 'semaine';
	// L'onglet des infos n'existe que si l'organisation a dit quelque chose d'elle (étape 24).
	if (value === 'infos') return avecInfos ? 'infos' : 'semaine';
	return value === 'cours' || value === 'mois' || value === 'aujourdhui' ? value : 'semaine';
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
	const infos = infosDe(organisation);
	const avecInfos = aDesInfos(infos);
	// Les langues de l'écoute : celles que l'organisation a choisies et que le relais sert, dans
	// l'ordre du relais, comme pour le poste « Diffuser ». Aucune : pas d'onglet.
	const live = liveSettings();
	const languesDuDirect = live
		? broadcastLanguages(organisation.live_language, live.languages)
		: [];
	const avecDirect = languesDuDirect.length > 0;
	const vue = vueDemandee(
		event.url.searchParams.get('vue'),
		organisation.prayer_module,
		avecInfos,
		avecDirect
	);
	// « Aujourd'hui », « Infos » et « Direct » ne montrent aucun filtre : il n'y en a pas à voir ni
	// à enlever.
	const filtre =
		vue === 'aujourdhui' || vue === 'infos' || vue === 'direct' ? null : publicDemande(event);
	// Le lien vers une carte dépend de l'appareil, comme l'agenda (ADR 0048) : la réponse le dit par
	// `Vary`. Seul l'onglet Infos le lit.
	const carte =
		vue === 'infos' && infos.address
			? lienCarte(appareilDuVisiteur(event).appareil, infos.address)
			: null;

	// Un seul instant pour toute la page : le jour et l'heure qu'il est se lisent sur la même horloge.
	const maintenant = new Date();
	const programme = await readPublicProgramme(organisation, langue, maintenant);
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
		vue === 'semaine' ||
		vue === 'prieres' ||
		vue === 'aujourdhui' ||
		vue === 'infos' ||
		vue === 'direct'
			? programme
			: await readPublicProgramme(organisation, langue, new Date(), { from, to });

	// Les sessions du vendredi de chaque date, telles que l'expansion les rend : annulées, déplacées
	// ailleurs, ou venues d'un autre jour, avec le vendredi d'où elles viennent. Toutes, quel que soit
	// le filtre par public : l'onglet ne montre aucun filtre, un filtre venu avec le lien ne s'y
	// verrait pas et ne s'y enlèverait pas, et une heure de prière vaut pour tous.
	const vendrediDu = (date: string) =>
		complet.seances
			.filter((seance) => seance.kind === 'jumua' && seance.date === date)
			.map((seance) => ({
				id: seance.courseId,
				start: seance.start,
				status: seance.status,
				movedTo: seance.movedTo?.date ?? null,
				originalDate: seance.originalDate ?? null
			}));

	// Une séance déplacée le même jour, à une autre heure : l'heure d'avant est celle de la séance de
	// départ, que l'expansion rend le même jour (relecture du lot 4). La page dit alors un changement
	// d'heure, et non « Déplacé au » suivi du jour même.
	const heureDAvant = (seance: SeancePublique): string | null =>
		seance.status === 'moved_here' && seance.originalDate === seance.date
			? (complet.seances.find(
					(depart) =>
						depart.status === 'moved_away' &&
						depart.courseId === seance.courseId &&
						depart.date === seance.date
				)?.start ?? null)
			: null;

	// L'onglet des prières : aujourd'hui et les six jours suivants, adhan et iqama de chaque prière,
	// les trois sources résolues comme pour les cours ancrés. Un jour qu'aucune source ne couvre
	// n'est pas montré ; une iqama que l'organisation n'a pas réglée reste vide. Chaque jour porte
	// ses sessions du vendredi réelles (relecture du lot 3) : une ligne datée dit ce qui a lieu ce
	// jour-là, comme la vue Semaine, et non le rythme habituel.
	// La vue « Aujourd'hui » ne lit que deux jours : aujourd'hui, et demain pour son Fajr.
	const dernierJourDesPrieres =
		vue === 'prieres' ? addDays(today, JOURS_SEMAINE - 1) : addDays(today, 1);
	const prieres =
		vue === 'prieres' || (vue === 'aujourdhui' && organisation.prayer_module)
			? (await readPublicPrayerDays(organisation.id, today, dernierJourDesPrieres))
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
		originalStart: heureDAvant(seance),
		title: seance.title,
		audience: seance.audience,
		room: seance.room,
		teacher: seance.teacher,
		kind: seance.kind,
		sermonLanguages: seance.kind === 'jumua' ? seance.teachingLanguages : undefined
	}));

	// La prochaine prière : la première dont l'adhan n'est pas passé, à l'heure de l'organisation.
	// Un vendredi où des sessions ont lieu, elles tiennent lieu de Dhuhr (ADR 0033).
	const prieresDuJour = prieres.find((jour) => jour.date === today) ?? null;
	const prochaine =
		vue === 'aujourdhui' && prieresDuJour
			? prochainePriere({
					maintenant: minuteOfDayInZone(organisation.time_zone, maintenant),
					heures: prieresDuJour.heures,
					vendredi:
						weekdayFromDays(isoDateToDays(today)) === 5
							? prieresDuJour.vendredi
									.filter(
										(seance) => seance.status === 'scheduled' || seance.status === 'moved_here'
									)
									.flatMap((seance) => (seance.start ? [seance.start] : []))
							: [],
					demain: prieres.find((jour) => jour.date === addDays(today, 1))?.heures ?? null
				})
			: null;

	// Le cache d'une page publique suit la même empreinte que l'API : une modification par un
	// responsable change la version suivante (ADR 0026). « Aujourd'hui » ne se garde qu'une minute.
	// « Infos » suit le cache des réglages, dont ses textes font partie, et « Direct » aussi : ses
	// langues en sont.
	event.setHeaders({
		'cache-control':
			vue === 'aujourdhui'
				? CACHE_AUJOURDHUI
				: vue === 'infos' || vue === 'direct'
					? CACHE_REGLAGES
					: CACHE_PROGRAMME
	});
	// La vue d'écoute ouvre, sur sa réponse seule, la liaison vers le relais ; le micro reste fermé
	// (ADR 0057).
	if (vue === 'direct' && live) event.locals.live = { relay: live.url, microphone: false };

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
	// rendue ; un 404 levé plus haut pose la sienne, par `introuvable` (`#lib/server/pages.ts`).
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
		// L'onglet des infos n'est proposé que si l'organisation en a saisi au moins une.
		avecInfos,
		// L'onglet du direct, seulement s'il est allumé et qu'il reste une langue (étape 25).
		avecDirect,
		// Ce que le module d'écoute lit : la porte du relais pour cette organisation, jusqu'à la langue,
		// et les langues offertes. Jamais dans le cadre du widget, qui encadre un programme.
		direct:
			vue === 'direct' && live
				? {
						relais: `${live.url}/listen/${organisation.slug}/`,
						langues: languesDuDirect
					}
				: null,
		// Les six textes, pour l'onglet seul ; l'annonce, pour lui et pour « Aujourd'hui », et jamais
		// dans le cadre du widget, qui encadre un programme (docs/maquettes/public-infos.md).
		infos: vue === 'infos' ? infos : null,
		carte,
		annonce:
			(vue === 'infos' || vue === 'aujourdhui') && event.url.searchParams.get('embed') !== '1'
				? infos.announcement
				: null,
		// Pour « Aujourd'hui », le seul jour même : le lendemain n'a servi qu'à son Fajr.
		prieres: vue === 'aujourdhui' ? prieres.filter((jour) => jour.date === today) : prieres,
		prochaine,
		// Le premier jour suivant qui a des séances, dans les six jours que la page a lus.
		jourSuivant: vue === 'aujourdhui' ? premierJourSuivant(today, seances) : null,
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

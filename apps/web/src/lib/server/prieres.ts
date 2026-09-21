// Les heures de prière, côté application (ADR 0004).
//
// Deux sources, une priorité : **un jour importé l'emporte toujours**. Le calcul remplit ce que
// l'import ne couvre pas, et ne touche jamais une ligne importée — c'est la clause `where` de
// l'écriture qui le garantit, dans `@jadwal/db`, pas la discipline de ce fichier.
//
// Rien n'est calculé ici : `@jadwal/core/prayer` le fait, et il est le seul à dépendre d'`adhan`.

import {
	addDays,
	compareIsoDates,
	nextYearSameDate,
	todayInZone,
	type IsoDate,
	type PrayerDay
} from '@jadwal/core';
import {
	computePrayerDay,
	crossesMidnight,
	isCalculationMethod,
	isHighLatitudeRule,
	isMadhab,
	recommendedHighLatitudeRule,
	type CalculationMethodName,
	type HighLatitudeRuleName,
	type MadhabName,
	type PrayerSettings
} from '@jadwal/core/prayer';
import { fillPrayerDays, lastImportedDay, newId, sql, type Transaction } from '@jadwal/db';
import { record } from './audit.js';

/** Sept jours : ce que le responsable compare au panneau de sa mosquée. */
export const JOURS_D_APERCU = 7;
/** Trente jours : le délai à partir duquel un calendrier qui s'épuise est signalé. */
export const ALERTE_FIN_D_IMPORT = 30;

export interface ReglagesPrieres {
	latitude: number | null;
	longitude: number | null;
	method: string | null;
	madhab: string;
	high_latitude_rule: string;
	source: string;
	fajr_adjustment: number;
	dhuhr_adjustment: number;
	asr_adjustment: number;
	maghrib_adjustment: number;
	isha_adjustment: number;
}

function nombre(valeur: unknown): number {
	return typeof valeur === 'number' ? valeur : Number(valeur ?? 0);
}

/** Les réglages de l'organisation courante. La ligne existe toujours : le seed la crée. */
export async function readReglages(tx: Transaction): Promise<ReglagesPrieres> {
	const result = await tx.execute(sql`
		select "latitude", "longitude", "method", "madhab", "high_latitude_rule", "source",
			"fajr_adjustment", "dhuhr_adjustment", "asr_adjustment", "maghrib_adjustment",
			"isha_adjustment"
		from "prayer_settings"
	`);
	const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
	const ligne = rows[0] as Record<string, unknown> | undefined;
	return {
		latitude:
			ligne?.['latitude'] === null || ligne?.['latitude'] === undefined
				? null
				: nombre(ligne['latitude']),
		longitude:
			ligne?.['longitude'] === null || ligne?.['longitude'] === undefined
				? null
				: nombre(ligne['longitude']),
		method: (ligne?.['method'] as string | null) ?? null,
		madhab: (ligne?.['madhab'] as string) ?? 'shafi',
		high_latitude_rule: (ligne?.['high_latitude_rule'] as string) ?? 'middleofthenight',
		source: (ligne?.['source'] as string) ?? 'import',
		fajr_adjustment: nombre(ligne?.['fajr_adjustment']),
		dhuhr_adjustment: nombre(ligne?.['dhuhr_adjustment']),
		asr_adjustment: nombre(ligne?.['asr_adjustment']),
		maghrib_adjustment: nombre(ligne?.['maghrib_adjustment']),
		isha_adjustment: nombre(ligne?.['isha_adjustment'])
	};
}

/** Les réglages rangés, traduits pour le calcul, ou `undefined` sans position. */
export function versCalcul(
	reglages: ReglagesPrieres,
	timeZone: string
): PrayerSettings | undefined {
	if (reglages.latitude === null || reglages.longitude === null) return undefined;
	return {
		latitude: reglages.latitude,
		longitude: reglages.longitude,
		timeZone,
		method: isCalculationMethod(reglages.method) ? reglages.method : 'MuslimWorldLeague',
		madhab: isMadhab(reglages.madhab) ? reglages.madhab : 'shafi',
		highLatitudeRule: isHighLatitudeRule(reglages.high_latitude_rule)
			? reglages.high_latitude_rule
			: recommendedHighLatitudeRule(reglages.latitude),
		adjustments: {
			fajr: reglages.fajr_adjustment,
			dhuhr: reglages.dhuhr_adjustment,
			asr: reglages.asr_adjustment,
			maghrib: reglages.maghrib_adjustment,
			isha: reglages.isha_adjustment
		}
	};
}

export interface JourDApercu extends PrayerDay {
	/** Vrai quand l'Isha de ce jour tombe après minuit, donc le lendemain. */
	apresMinuit: boolean;
}

/**
 * Les sept prochains jours, calculés avec les réglages **en cours de saisie**, avant enregistrement.
 * C'est ce que le responsable compare au panneau de sa mosquée avant de valider.
 */
export function apercu(settings: PrayerSettings, today: IsoDate): JourDApercu[] {
	const jours: JourDApercu[] = [];
	for (let pas = 0; pas < JOURS_D_APERCU; pas += 1) {
		const date = addDays(today, pas);
		const jour = computePrayerDay(date, settings);
		if (!jour) continue;
		jours.push({ ...jour, apresMinuit: crossesMidnight(date, settings) });
	}
	return jours;
}

export interface EtatDesSources {
	/** Le dernier jour couvert par l'import, ou `null`. */
	finDeLImport: IsoDate | null;
	/** Jours restants avant que l'import ne s'épuise, ou `null` s'il n'y en a pas. */
	joursRestants: number | null;
	/** Le calcul est-il possible ? Sans position, non. */
	calculPossible: boolean;
	/** Faut-il prévenir ? Vrai quand l'import s'arrête dans moins de trente jours. */
	alerte: boolean;
}

/** Ce que les écrans disent de l'état des deux sources. */
export async function etatDesSources(
	tx: Transaction,
	organizationId: string,
	reglages: ReglagesPrieres,
	today: IsoDate
): Promise<EtatDesSources> {
	const fin = await lastImportedDay(tx, organizationId);
	const restants = fin
		? Math.round(
				(new Date(`${fin}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
					86_400_000
			)
		: null;
	return {
		finDeLImport: fin,
		joursRestants: restants,
		calculPossible: reglages.latitude !== null,
		alerte: restants !== null && restants < ALERTE_FIN_D_IMPORT
	};
}

/** Enregistre les réglages, puis recalcule la fenêtre glissante. Le journal note le changement. */
export async function enregistrerReglages(
	tx: Transaction,
	context: { organizationId: string; userId: string | null },
	timeZone: string,
	avant: ReglagesPrieres,
	apres: {
		latitude: number | null;
		longitude: number | null;
		method: CalculationMethodName;
		madhab: MadhabName;
		highLatitudeRule: HighLatitudeRuleName;
		source: string;
		adjustments: Record<'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha', number>;
	},
	now: Date
): Promise<number> {
	await tx.execute(sql`
		insert into "prayer_settings" ("organization_id", "latitude", "longitude", "method", "madhab",
			"high_latitude_rule", "source", "fajr_adjustment", "dhuhr_adjustment", "asr_adjustment",
			"maghrib_adjustment", "isha_adjustment")
		values (${context.organizationId}, ${apres.latitude}, ${apres.longitude}, ${apres.method},
			${apres.madhab}, ${apres.highLatitudeRule}, ${apres.source}, ${apres.adjustments.fajr},
			${apres.adjustments.dhuhr}, ${apres.adjustments.asr}, ${apres.adjustments.maghrib},
			${apres.adjustments.isha})
		on conflict ("organization_id") do update set
			"latitude" = excluded."latitude", "longitude" = excluded."longitude",
			"method" = excluded."method", "madhab" = excluded."madhab",
			"high_latitude_rule" = excluded."high_latitude_rule", "source" = excluded."source",
			"fajr_adjustment" = excluded."fajr_adjustment",
			"dhuhr_adjustment" = excluded."dhuhr_adjustment",
			"asr_adjustment" = excluded."asr_adjustment",
			"maghrib_adjustment" = excluded."maghrib_adjustment",
			"isha_adjustment" = excluded."isha_adjustment",
			"updated_at" = now()
	`);
	await record(tx, context.organizationId, context.userId, {
		action: 'prayer.settings',
		targetTable: 'prayer_settings',
		targetId: context.organizationId,
		before: avant,
		after: apres
	});
	// Un changement de réglage change toutes les heures calculées : la fenêtre est refaite tout de
	// suite, sans attendre la tâche de nuit. Les jours importés ne bougent pas.
	const rempli = await fillPrayerDays(
		tx,
		{
			organizationId: context.organizationId,
			timeZone,
			latitude: apres.latitude,
			longitude: apres.longitude,
			method: apres.method,
			madhab: apres.madhab,
			highLatitudeRule: apres.highLatitudeRule,
			fajrAdjustment: apres.adjustments.fajr,
			dhuhrAdjustment: apres.adjustments.dhuhr,
			asrAdjustment: apres.adjustments.asr,
			maghribAdjustment: apres.adjustments.maghrib,
			ishaAdjustment: apres.adjustments.isha
		},
		todayInZone(timeZone, now)
	);
	return rempli.ecrites;
}

/**
 * Écrit les jours importés. Un nouvel import **remplace** les jours qu'il couvre — importés comme
 * calculés — et ne touche à aucun autre. C'est la promesse de l'écran, et elle tient en une clause.
 */
export async function importerJours(
	tx: Transaction,
	context: { organizationId: string; userId: string | null },
	jours: readonly PrayerDay[]
): Promise<number> {
	if (jours.length === 0) return 0;
	const valeurs = jours.map(
		(jour) => sql`(${context.organizationId}::uuid, ${jour.date}::date, ${jour.fajr}::time,
			${jour.dhuhr}::time, ${jour.asr}::time, ${jour.maghrib}::time, ${jour.isha}::time, 'import')`
	);
	await tx.execute(sql`
		insert into "prayer_day"
			("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib", "isha", "source")
		values ${sql.join(valeurs, sql`, `)}
		on conflict ("organization_id", "date") do update set
			"fajr" = excluded."fajr", "dhuhr" = excluded."dhuhr", "asr" = excluded."asr",
			"maghrib" = excluded."maghrib", "isha" = excluded."isha",
			"source" = 'import', "updated_at" = now()
	`);
	await record(tx, context.organizationId, context.userId, {
		action: 'prayer.import',
		targetTable: 'prayer_day',
		targetId: newId(),
		after: {
			jours: jours.length,
			premiere: jours[0]?.date,
			derniere: jours.at(-1)?.date
		}
	});
	return jours.length;
}

/** Efface les jours importés d'une plage : ce que le responsable annule quand il s'est trompé. */
export async function effacerImport(
	tx: Transaction,
	context: { organizationId: string; userId: string | null },
	de: IsoDate,
	a: IsoDate
): Promise<number> {
	const result = await tx.execute(sql`
		delete from "prayer_day"
		where "organization_id" = ${context.organizationId} and "source" = 'import'
			and "date" between ${de} and ${a}
		returning "date"
	`);
	const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
	await record(tx, context.organizationId, context.userId, {
		action: 'prayer.import.delete',
		targetTable: 'prayer_day',
		before: { de, a, jours: rows.length }
	});
	return rows.length;
}

// ---------------------------------------------------------------------------------------------
// Les périodes d'horaires (ADR 0004, étape 8)
// ---------------------------------------------------------------------------------------------

/** Les cinq prières, dans l'ordre de la journée. */
export const PRIERES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type Priere = (typeof PRIERES)[number];

export interface IqamaSaisie {
	/** Heure fixe, ou `null`. Exclusive du décalage. */
	heure: string | null;
	/** Décalage en minutes après l'heure du soleil, ou `null`. */
	decalage: number | null;
}

export interface PeriodeHoraires {
	id: string;
	name: string;
	fromDate: string;
	toDate: string | null;
	/** Dates reportées par « dupliquer », tant qu'un responsable ne les a pas revues. */
	needsReview: boolean;
	/** Heures du soleil saisies à la main. Vide : l'import ou le calcul décide. */
	soleil: Record<Priere, string | null>;
	iqama: Record<Priere, IqamaSaisie>;
}

function texteCourt(valeur: unknown): string | null {
	if (typeof valeur !== 'string') return null;
	const court = valeur.slice(0, 5);
	return /^\d{2}:\d{2}$/.test(court) ? court : null;
}

/** Les périodes de l'organisation, de la plus ancienne à la plus récente. */
export async function readPeriodes(tx: Transaction): Promise<PeriodeHoraires[]> {
	const result = await tx.execute(sql`
		select "id", "name", "from_date"::text, "to_date"::text, "needs_review",
			"fajr"::text, "dhuhr"::text, "asr"::text, "maghrib"::text, "isha"::text,
			"fajr_iqama"::text, "dhuhr_iqama"::text, "asr_iqama"::text, "maghrib_iqama"::text,
			"isha_iqama"::text,
			"fajr_iqama_offset", "dhuhr_iqama_offset", "asr_iqama_offset", "maghrib_iqama_offset",
			"isha_iqama_offset"
		from "prayer_period" order by "from_date"
	`);
	const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
	return (rows as Record<string, unknown>[]).map((row) => ({
		id: String(row['id']),
		name: String(row['name']),
		fromDate: String(row['from_date']).slice(0, 10),
		toDate: row['to_date'] ? String(row['to_date']).slice(0, 10) : null,
		needsReview: row['needs_review'] === true,
		soleil: Object.fromEntries(
			PRIERES.map((priere) => [priere, texteCourt(row[priere])])
		) as Record<Priere, string | null>,
		iqama: Object.fromEntries(
			PRIERES.map((priere) => [
				priere,
				{
					heure: texteCourt(row[`${priere}_iqama`]),
					decalage:
						row[`${priere}_iqama_offset`] === null || row[`${priere}_iqama_offset`] === undefined
							? null
							: Number(row[`${priere}_iqama_offset`])
				}
			])
		) as Record<Priere, IqamaSaisie>
	}));
}

/** Ce qu'un formulaire de période porte, une fois lu et borné. */
export interface PeriodeSaisie {
	id: string | null;
	name: string;
	fromDate: IsoDate;
	toDate: IsoDate | null;
	/** Posé par la duplication ; l'enregistrement par un responsable le remet à faux. */
	needsReview?: boolean;
	soleil: Record<Priere, string | null>;
	iqama: Record<Priere, IqamaSaisie>;
}

/**
 * Écrit une période, et laisse une trace. Le chevauchement n'est pas vérifié ici : c'est la
 * contrainte d'exclusion de la base qui le refuse, quel que soit le chemin d'écriture. L'appelant
 * attrape le code `23P01` et le traduit — une vérification en double finirait par diverger.
 */
export async function enregistrerPeriode(
	tx: Transaction,
	context: { organizationId: string; userId: string | null },
	saisie: PeriodeSaisie
): Promise<string> {
	const id = saisie.id ?? newId();
	const valeur = (priere: Priere) => sql`${saisie.soleil[priere]}::time`;
	const iqamaHeure = (priere: Priere) => sql`${saisie.iqama[priere].heure}::time`;
	const iqamaDecalage = (priere: Priere) => sql`${saisie.iqama[priere].decalage}::smallint`;
	await tx.execute(sql`
		insert into "prayer_period" (
			"id", "organization_id", "name", "from_date", "to_date", "needs_review",
			"fajr", "dhuhr", "asr", "maghrib", "isha",
			"fajr_iqama", "dhuhr_iqama", "asr_iqama", "maghrib_iqama", "isha_iqama",
			"fajr_iqama_offset", "dhuhr_iqama_offset", "asr_iqama_offset", "maghrib_iqama_offset",
			"isha_iqama_offset"
		) values (
			${id}, ${context.organizationId}, ${saisie.name}, ${saisie.fromDate}, ${saisie.toDate},
			${saisie.needsReview ?? false},
			${valeur('fajr')}, ${valeur('dhuhr')}, ${valeur('asr')}, ${valeur('maghrib')},
			${valeur('isha')},
			${iqamaHeure('fajr')}, ${iqamaHeure('dhuhr')}, ${iqamaHeure('asr')},
			${iqamaHeure('maghrib')}, ${iqamaHeure('isha')},
			${iqamaDecalage('fajr')}, ${iqamaDecalage('dhuhr')}, ${iqamaDecalage('asr')},
			${iqamaDecalage('maghrib')}, ${iqamaDecalage('isha')}
		)
		on conflict ("id") do update set
			"name" = excluded."name", "from_date" = excluded."from_date",
			"to_date" = excluded."to_date", "needs_review" = excluded."needs_review",
			"fajr" = excluded."fajr", "dhuhr" = excluded."dhuhr", "asr" = excluded."asr",
			"maghrib" = excluded."maghrib", "isha" = excluded."isha",
			"fajr_iqama" = excluded."fajr_iqama", "dhuhr_iqama" = excluded."dhuhr_iqama",
			"asr_iqama" = excluded."asr_iqama", "maghrib_iqama" = excluded."maghrib_iqama",
			"isha_iqama" = excluded."isha_iqama",
			"fajr_iqama_offset" = excluded."fajr_iqama_offset",
			"dhuhr_iqama_offset" = excluded."dhuhr_iqama_offset",
			"asr_iqama_offset" = excluded."asr_iqama_offset",
			"maghrib_iqama_offset" = excluded."maghrib_iqama_offset",
			"isha_iqama_offset" = excluded."isha_iqama_offset",
			"updated_at" = now()
	`);
	await record(tx, context.organizationId, context.userId, {
		action: saisie.id ? 'prayer.period.update' : 'prayer.period.create',
		targetTable: 'prayer_period',
		targetId: id,
		after: { name: saisie.name, de: saisie.fromDate, a: saisie.toDate }
	});
	return id;
}

export async function supprimerPeriode(
	tx: Transaction,
	context: { organizationId: string; userId: string | null },
	id: string
): Promise<boolean> {
	const result = await tx.execute(
		sql`delete from "prayer_period" where "id" = ${id} returning "name"`
	);
	const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
	if (rows.length === 0) return false;
	await record(tx, context.organizationId, context.userId, {
		action: 'prayer.period.delete',
		targetTable: 'prayer_period',
		targetId: id,
		before: { name: (rows[0] as { name: string }).name }
	});
	return true;
}

/**
 * Les dates de la même période un an plus tard, ou `null` si elle n'a pas d'équivalent.
 *
 * **Les heures de prière suivent le soleil, pas le calendrier hégirien.** Le Maghrib du 1er mars
 * revient au 1er mars : une période reportée garde donc son mois et son jour, et change seulement
 * d'année. Une copie avancée de onze jours ferait décrire au soleil une année lunaire, ce qu'il ne
 * fait pas — et, la copie tombant dans l'année d'origine, elle chevauchait la période source dès
 * que celle-ci durait plus de onze jours.
 *
 * La date de fin suit le **lendemain**, pas elle-même, et c'est tout le soin de cette fonction :
 * deux périodes voisines restent jointives quelle que soit l'année d'arrivée. Une période qui
 * s'arrête le 28 février 2027 est suivie par une autre qui commence le 1er mars ; l'année suivante
 * est bissextile, le 1er mars reste le 1er mars, et la première période s'étend donc jusqu'au
 * 29 février 2028 au lieu de laisser ce jour à découvert. Dans l'autre sens, une période qui
 * s'arrête le 29 février 2028 se termine le 28 février 2029, et sa suivante commence le 1er mars.
 *
 * Le seul cas sans équivalent est la période réduite au seul 29 février, reportée sur une année
 * commune : ce jour n'existe pas, la copie serait inversée, et la fonction rend `null`.
 */
export function datesAnneeSuivante(
	fromDate: IsoDate,
	toDate: IsoDate | null
): { fromDate: IsoDate; toDate: IsoDate | null } | null {
	const debut = nextYearSameDate(fromDate);
	// Une période sans date de fin reste sans date de fin : elle couvre tout ce qui vient après.
	if (toDate === null) return { fromDate: debut, toDate: null };
	const fin = addDays(nextYearSameDate(addDays(toDate, 1)), -1);
	if (compareIsoDates(fin, debut) < 0) return null;
	return { fromDate: debut, toDate: fin };
}

/**
 * Duplique une période pour l'année suivante : mêmes mois et mêmes jours, un an plus tard.
 *
 * Ce que le bouton fait, et ce qu'il ne fait pas : il **fait gagner la saisie**, il ne décide pas
 * des heures. Le soleil revient aux mêmes dates, mais d'une minute près il ne revient pas au même
 * endroit, et une mosquée arrondit ses iqamas à sa façon. La période produite porte donc « dates à
 * vérifier » jusqu'à ce qu'un responsable l'enregistre — c'est-à-dire jusqu'à ce qu'il ait regardé.
 *
 * Rend `null` si la période n'a pas d'équivalent l'année suivante (voir `datesAnneeSuivante`).
 *
 * Le chevauchement n'est pas vérifié ici : la contrainte d'exclusion le refuse, et l'appelant
 * traduit le code `23P01`. Une période sans date de fin ne peut pas être dupliquée sans chevaucher
 * l'originale, et c'est exact — il faut d'abord la clore.
 */
export async function dupliquerPeriode(
	tx: Transaction,
	context: { organizationId: string; userId: string | null },
	source: PeriodeHoraires
): Promise<string | null> {
	const dates = datesAnneeSuivante(source.fromDate as IsoDate, source.toDate as IsoDate | null);
	if (!dates) return null;
	return enregistrerPeriode(tx, context, {
		id: null,
		name: `${source.name} (année suivante)`.slice(0, 60),
		fromDate: dates.fromDate,
		toDate: dates.toDate,
		needsReview: true,
		soleil: source.soleil,
		iqama: source.iqama
	});
}

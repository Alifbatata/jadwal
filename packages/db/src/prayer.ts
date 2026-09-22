// Le remplissage de la table des heures de prière (ADR 0004).
//
// Une seule règle commande tout le fichier : **un jour importé l'emporte toujours**. Ce n'est pas la
// discipline de l'appelant qui le garantit, c'est la clause `where` de l'écriture — un calcul ne
// peut pas écraser une ligne dont la source est l'import, quel que soit le code qui l'appelle.
//
// Le calcul lui-même n'est pas ici : il est dans `@jadwal/core/prayer`, pur et testé contre les jeux
// de référence d'`adhan`. Ce fichier ne fait que le ranger.

import { addDays, type IsoDate, type LocalTime, type PrayerDay } from '@jadwal/core';
import {
	computePrayerDay,
	isCalculationMethod,
	isHighLatitudeRule,
	isMadhab,
	type PrayerSettings
} from '@jadwal/core/prayer';
import { sql } from 'drizzle-orm';
import type { Database, Transaction } from './client.js';

/** Jours couverts en arrière : la fenêtre glissante du flux agenda commence trente jours plus tôt. */
export const PRAYER_PAST_DAYS = 30;
/** Jours couverts en avant. Trente plus trois cent soixante-dix font les quatre cents du cœur. */
export const PRAYER_AHEAD_DAYS = 370;

/** Les réglages d'une organisation, tels que la table les porte. */
export interface StoredPrayerSettings {
	organizationId: string;
	timeZone: string;
	latitude: number | null;
	longitude: number | null;
	method: string | null;
	madhab: string;
	highLatitudeRule: string;
	fajrAdjustment: number;
	dhuhrAdjustment: number;
	asrAdjustment: number;
	maghribAdjustment: number;
	ishaAdjustment: number;
}

/**
 * Les réglages rangés, traduits pour le calcul — ou `undefined` quand il n'y a rien à calculer.
 *
 * Sans position, aucun calcul n'est possible : c'est le cas d'une organisation qui n'importe que son
 * calendrier, et ce n'est pas une erreur. Une méthode absente vaut `MuslimWorldLeague`, qui est le
 * défaut du service ; une valeur illisible — venue d'une base modifiée à la main — est traitée comme
 * absente plutôt que de faire échouer la tâche de nuit de toutes les organisations.
 */
export function toPrayerSettings(stored: StoredPrayerSettings): PrayerSettings | undefined {
	if (stored.latitude === null || stored.longitude === null) return undefined;
	return {
		latitude: stored.latitude,
		longitude: stored.longitude,
		timeZone: stored.timeZone,
		method: isCalculationMethod(stored.method) ? stored.method : 'MuslimWorldLeague',
		madhab: isMadhab(stored.madhab) ? stored.madhab : 'shafi',
		highLatitudeRule: isHighLatitudeRule(stored.highLatitudeRule)
			? stored.highLatitudeRule
			: 'middleofthenight',
		adjustments: {
			fajr: stored.fajrAdjustment,
			dhuhr: stored.dhuhrAdjustment,
			asr: stored.asrAdjustment,
			maghrib: stored.maghribAdjustment,
			isha: stored.ishaAdjustment
		}
	};
}

export interface FillResult {
	/** Jours que le calcul a produits. */
	calcules: number;
	/** Lignes réellement écrites ou modifiées : zéro à la deuxième exécution du même jour. */
	ecrites: number;
}

/**
 * Remplit la fenêtre glissante d'une organisation avec les heures calculées.
 *
 * **Idempotente** : relancée le même jour avec les mêmes réglages, elle n'écrit rien. La clause
 * `is distinct from` évite de toucher `updated_at` pour rien — ce qui compte, parce que cet
 * horodatage fait partie de l'empreinte de cache des flux agenda (ADR 0026).
 */
export async function fillPrayerDays(
	tx: Transaction | Database,
	stored: StoredPrayerSettings,
	today: IsoDate
): Promise<FillResult> {
	const settings = toPrayerSettings(stored);
	if (!settings) return { calcules: 0, ecrites: 0 };

	const lignes = [];
	for (let pas = -PRAYER_PAST_DAYS; pas <= PRAYER_AHEAD_DAYS; pas += 1) {
		const date = addDays(today, pas);
		const jour = computePrayerDay(date, settings);
		// Une méthode peut ne rien produire : à Tromsø en juin, le soleil ne descend jamais assez.
		// Un jour incomplet n'est pas écrit du tout, et vaut alors « heure inconnue » pour le cœur.
		if (!jour) continue;
		lignes.push(
			sql`(${stored.organizationId}::uuid, ${date}::date, ${jour.fajr}::time, ${jour.dhuhr}::time,
				${jour.asr}::time, ${jour.maghrib}::time, ${jour.isha}::time, 'computed')`
		);
	}
	if (lignes.length === 0) return { calcules: 0, ecrites: 0 };

	const result = await tx.execute(sql`
		insert into "prayer_day"
			("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib", "isha", "source")
		values ${sql.join(lignes, sql`, `)}
		on conflict ("organization_id", "date") do update set
			"fajr" = excluded."fajr", "dhuhr" = excluded."dhuhr", "asr" = excluded."asr",
			"maghrib" = excluded."maghrib", "isha" = excluded."isha",
			"source" = 'computed', "updated_at" = now()
		where "prayer_day"."source" = 'computed'
			and (
				"prayer_day"."fajr", "prayer_day"."dhuhr", "prayer_day"."asr",
				"prayer_day"."maghrib", "prayer_day"."isha"
			) is distinct from (
				excluded."fajr", excluded."dhuhr", excluded."asr",
				excluded."maghrib", excluded."isha"
			)
		returning "date"
	`);
	const ecrites = Array.isArray(result)
		? result.length
		: ((result as { rows?: unknown[] }).rows?.length ?? 0);
	return { calcules: lignes.length, ecrites };
}

/**
 * Le jour où le calendrier importé s'arrête, ou `null` s'il n'y en a aucun.
 *
 * L'écran d'accueil s'en sert pour prévenir trente jours à l'avance : quand l'import s'épuise, le
 * calcul prend le relais sans rien dire, et une organisation qui tient à ses propres heures doit
 * l'apprendre avant, pas après.
 */
export async function lastImportedDay(
	tx: Transaction | Database,
	organizationId: string
): Promise<IsoDate | null> {
	const result = await tx.execute(sql`
		select max("date")::text as fin from "prayer_day"
		where "organization_id" = ${organizationId} and "source" = 'import'
	`);
	const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
	const fin = (rows[0] as { fin: string | null } | undefined)?.fin ?? null;
	return fin ? (fin.slice(0, 10) as IsoDate) : null;
}

// ---------------------------------------------------------------------------------------------
// Les trois sources, résolues en une seule requête (ADR 0004, étape 8)
// ---------------------------------------------------------------------------------------------

/** Les cinq prières, dans l'ordre de la journée. */
const PRIERES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
type Priere = (typeof PRIERES)[number];

/**
 * La requête qui résout les heures d'une organisation sur une plage, **saisie à la main d'abord,
 * import ensuite, calcul en dernier**.
 *
 * Pourquoi une résolution à la lecture plutôt qu'une matérialisation dans `prayer_day` : si une
 * période saisie à la main écrasait les jours importés, supprimer la période ferait disparaître
 * l'import pour toujours. Ici, aucune source n'en détruit une autre, et la priorité tient en un
 * `coalesce` — un seul endroit à lire pour savoir qui gagne.
 *
 * L'iqama est calculée dans la même requête : une heure fixe si l'organisation en a posé une, sinon
 * l'heure du soleil **résolue** plus le décalage. `time + interval` repasse par minuit tout seul,
 * ce qu'il faut pour une Isha tardive.
 *
 * `generate_series` donne un jour par ligne, y compris ceux qu'aucune source ne couvre : la
 * résolution les rend avec des colonnes nulles, et l'appelant les jette. Trois cent soixante-six
 * lignes au plus — la plage publique est bornée par `docs/API.md`.
 */
export function resolvedPrayerDaysQuery(organizationId: string, from: IsoDate, to: IsoDate) {
	const soleil = (priere: Priere) =>
		sql`coalesce(p.${sql.identifier(priere)}, d.${sql.identifier(priere)})`;
	const colonnes = PRIERES.flatMap((priere) => [
		sql`${soleil(priere)}::text as ${sql.identifier(priere)}`,
		// D'où vient l'heure, prière par prière. L'écran des réglages le montre sur sept jours :
		// une organisation qui mélange les trois sources doit pouvoir voir laquelle a gagné, sans
		// avoir à le déduire.
		sql`case
			when p.${sql.identifier(priere)} is not null then 'manual'
			when d.${sql.identifier(priere)} is not null then d."source"
		end as ${sql.identifier(`${priere}_source`)}`,
		sql`coalesce(
			p.${sql.identifier(`${priere}_iqama`)},
			case
				when p.${sql.identifier(`${priere}_iqama_offset`)} is not null
					and ${soleil(priere)} is not null
				then (${soleil(priere)} + make_interval(mins => p.${sql.identifier(`${priere}_iqama_offset`)}))::time
			end
		)::text as ${sql.identifier(`${priere}_iqama`)}`
	]);
	return sql`
		select to_char(s.jour, 'YYYY-MM-DD') as date, ${sql.join(colonnes, sql`, `)}
		from generate_series(${from}::date, ${to}::date, interval '1 day') as s(jour)
		left join "prayer_day" d
			on d."organization_id" = ${organizationId} and d."date" = s.jour::date
		left join "prayer_period" p
			on p."organization_id" = ${organizationId}
			and s.jour::date between p."from_date" and coalesce(p."to_date", 'infinity'::date)
		order by s.jour
	`;
}

/** Une ligne de la requête ci-dessus, avant d'être rangée en `PrayerDay`. */
export type ResolvedPrayerRow = Record<string, string | null> & { date: string };

function heure(valeur: string | null | undefined): LocalTime | undefined {
	if (typeof valeur !== 'string') return undefined;
	const court = valeur.slice(0, 5);
	return /^\d{2}:\d{2}$/.test(court) ? (court as LocalTime) : undefined;
}

/**
 * Les lignes résolues, rangées dans la table que `@jadwal/core` attend. Un jour dont l'une des cinq
 * heures manque n'entre pas : le cœur traite « jour absent » et « heure absente » de la même façon,
 * et une table à trous serait plus difficile à lire qu'une table sans le jour.
 */
export function toPrayerTable(rows: readonly ResolvedPrayerRow[]): Map<IsoDate, PrayerDay> {
	const table = new Map<IsoDate, PrayerDay>();
	for (const row of rows) {
		const date = String(row['date']).slice(0, 10) as IsoDate;
		const heures = PRIERES.map((priere) => heure(row[priere]));
		if (heures.some((valeur) => valeur === undefined)) continue;
		const [fajr, dhuhr, asr, maghrib, isha] = heures as LocalTime[];
		const iqama: Partial<Record<Priere, LocalTime>> = {};
		for (const priere of PRIERES) {
			const valeur = heure(row[`${priere}_iqama`]);
			if (valeur) iqama[priere] = valeur;
		}
		table.set(date, {
			date,
			fajr: fajr as LocalTime,
			dhuhr: dhuhr as LocalTime,
			asr: asr as LocalTime,
			maghrib: maghrib as LocalTime,
			isha: isha as LocalTime,
			...(Object.keys(iqama).length > 0 ? { iqama } : {})
		});
	}
	return table;
}

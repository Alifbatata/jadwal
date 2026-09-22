// Ce que le côté public lit, et sous quelle forme il le rend (ADR 0026).
//
// Une seule connexion, celle du rôle public : lecture seule, sans contexte d'organisation, et qui
// ne voit que les organisations actives et les cours publiés. Ce fichier n'ajoute donc **aucune**
// condition de visibilité : si un brouillon sortait d'ici, ce serait la base qui aurait tort, et
// c'est exactement la propriété que l'on veut. Les routes, elles, n'ont rien à filtrer.
//
// Aucun calcul de récurrence non plus : les occurrences viennent de `@jadwal/core`, comme partout.

import { createHash } from 'node:crypto';
import {
	addDays,
	expandOccurrences,
	todayInZone,
	type IsoDate,
	type Occurrence
} from '@jadwal/core';
import {
	createDatabase,
	resolvedPrayerDaysQuery,
	sql,
	toPrayerTable,
	type Database,
	type DatabaseHandle,
	type ResolvedPrayerRow
} from '@jadwal/db';
import { appliquerVendredi, sessionsDuVendredi } from './vendredi.js';
import {
	toException,
	toPause,
	toSchedule,
	type CourseRow,
	type ExceptionRow,
	type PauseRow
} from './programme.js';

let publicHandle: DatabaseHandle | undefined;

/** La connexion du côté public. Ouverte une fois pour le processus, comme les autres. */
export function publicDatabase(): Database {
	publicHandle ??= createDatabase({ role: 'public' });
	return publicHandle.db;
}

export async function closePublicDatabase(): Promise<void> {
	await publicHandle?.close();
	publicHandle = undefined;
}

/** Les quatre langues d'interface (ADR 0007). */
export const LANGUES = ['fr', 'de', 'it', 'ar'] as const;
export type Langue = (typeof LANGUES)[number];

export function isLangue(value: string): value is Langue {
	return (LANGUES as readonly string[]).includes(value);
}

/** Plage maximale servie quand l'appelant ne demande rien : 92 jours, un trimestre. */
export const MAX_JOURS = 92;
/**
 * Plage maximale qu'un appelant peut demander **explicitement**, par `maxDays` : 366 jours, une
 * année bissextile. Au-delà, la réponse est un refus et non un silence (étape 6, partie A).
 *
 * Pourquoi un paramètre plutôt que le simple relèvement de la borne : `docs/API.md` est un contrat
 * versionné. Refuser d'un coup une requête qui réussissait hier serait un changement de contrat,
 * donc un `/api/v2/`. Un paramètre que personne n'envoie ne casse personne.
 */
export const MAX_JOURS_DEMANDE = 366;
/** Plage servie quand l'appelant n'en demande pas. */
export const JOURS_PAR_DEFAUT = 7;

export interface OrganisationPublique {
	id: string;
	slug: string;
	name: string;
	time_zone: string;
	accent_color: string;
	default_language: string;
	enabled_language: string[];
	/** Le module des heures de prière de cette organisation (ADR 0042). */
	prayer_module: boolean;
	/** Sert au plan de site : la date de ce qu'il décrit, jamais l'heure de la requête (ADR 0029). */
	updated_at: string;
}

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

const isoDate = (value: unknown): IsoDate => String(value).slice(0, 10) as IsoDate;

/**
 * L'organisation derrière un identifiant d'URL, ou `undefined`. Une organisation suspendue rend
 * `undefined` sans que cette requête ait à le dire : sa politique de lecture l'exclut déjà.
 */
export async function findOrganisation(slug: string): Promise<OrganisationPublique | undefined> {
	return rows<OrganisationPublique>(
		await publicDatabase().execute(sql`
			select "id", "slug", "name", "time_zone", "accent_color", "default_language",
				"enabled_language", "prayer_module", "updated_at"::text as updated_at
			from "organization" where "slug" = ${slug}
		`)
	)[0];
}

/**
 * L'empreinte des données d'une organisation : le plus récent horodatage **et** le nombre de lignes
 * de chaque table servie.
 *
 * Le comptage n'est pas une précaution de style. Une suppression ne touche aucun `updated_at` :
 * sans lui, supprimer un cours laisserait l'empreinte inchangée et le cache servirait un programme
 * périmé. Un test supprime, et vérifie que l'empreinte change.
 */
export async function fingerprint(organizationId: string): Promise<string> {
	const found = rows<{ marque: string }>(
		await publicDatabase().execute(sql`
			select
				coalesce(max("quand")::text, 'vide') || ':' || sum("combien")::text as marque
			from (
				select max(greatest("updated_at", "created_at")) as quand, count(*) as combien
					from "organization" where "id" = ${organizationId}
				union all
				select max(greatest("updated_at", "created_at")), count(*) from "course"
					where "organization_id" = ${organizationId}
				union all
				select max(greatest("updated_at", "created_at")), count(*) from "course_translation"
					where "organization_id" = ${organizationId}
				union all
				select max("created_at"), count(*) from "session_exception"
					where "organization_id" = ${organizationId}
				union all
				select max("created_at"), count(*) from "pause"
					where "organization_id" = ${organizationId}
				union all
				select max(greatest("updated_at", "created_at")), count(*) from "room"
					where "organization_id" = ${organizationId}
				union all
				select max("created_at"), count(*) from "prayer_day"
					where "organization_id" = ${organizationId}
				union all
				-- Depuis l'étape 8, les heures servies ne viennent plus seulement de la table des
				-- jours : une période saisie à la main les remplace. Sans cette ligne, changer une
				-- iqama ne périmerait aucun flux agenda, et l'organisation servirait ses anciennes
				-- heures.
				select max(greatest("updated_at", "created_at")), count(*) from "prayer_period"
					where "organization_id" = ${organizationId}
			) as sources
		`)
	)[0];
	return found?.marque ?? 'vide:0';
}

/**
 * L'entité de validation d'une réponse : l'empreinte des données **et** tout ce qui change la
 * réponse pour les mêmes données — la langue, la plage, la vue. Deux visiteurs qui demandent des
 * choses différentes ne doivent pas partager une entrée de cache.
 */
export function etagOf(marque: string, ...parts: (string | number)[]): string {
	const empreinte = createHash('sha256')
		.update([marque, ...parts].join('\u0000'))
		.digest('base64url');
	return `"${empreinte.slice(0, 27)}"`;
}

export interface CoursPublic {
	id: string;
	title: string;
	description: string | null;
	audience: string;
	teachingLanguages: string[];
	room: string | null;
	teacher: string | null;
	recurrence: CourseRow['recurrence_kind'] extends string ? Record<string, unknown> : never;
	timing: Record<string, unknown>;
	startsOn: string;
	endsOn: string | null;
}

/**
 * Les cours publiés, avec le texte dans la langue demandée et le repli sur la langue source. Le
 * repli est fait **côté serveur** : l'appelant reçoit un texte, jamais une absence à gérer, et
 * jamais la mention qu'une traduction manque (ADR 0007).
 */
export async function readPublicCourses(organizationId: string, langue: Langue) {
	return rows<CourseRow & { source_title: string | null; source_description: string | null }>(
		await publicDatabase().execute(sql`
			select c.*, c."recurrence_date"::text[] as recurrence_dates,
				c."starts_on"::text as starts_on, c."ends_on"::text as ends_on,
				c."recurrence_anchor_date"::text as recurrence_anchor_date,
				c."timing_start"::text as timing_start, c."timing_end"::text as timing_end,
				coalesce(demandee."title", source."title") as title,
				coalesce(demandee."description", source."description") as description,
				r."name" as room
			from "course" c
			left join "course_translation" demandee
				on demandee."course_id" = c."id" and demandee."language" = ${langue}
			left join "course_translation" source
				on source."course_id" = c."id" and source."language" = c."source_language"
			left join "room" r on r."id" = c."room_id"
			where c."organization_id" = ${organizationId}
			order by lower(coalesce(demandee."title", source."title", '')), c."created_at"
		`)
	);
}

export interface OrganisationListee {
	slug: string;
	default_language: string;
	enabled_language: string[];
	last_modified: string;
}

/**
 * Les organisations servies au public, pour l'index des plans de site (ADR 0029). Aucun filtre ici
 * non plus : le rôle public ne voit que les organisations actives, et une organisation suspendue
 * disparaît donc du plan de site en même temps que de ses pages.
 *
 * La date de dernière modification est celle des données réellement servies, et non l'heure de la
 * requête : un plan de site qui se dirait modifié à chaque lecture ferait réexplorer pour rien, et
 * un moteur cesse vite de le croire.
 */
export async function listPublicOrganisations(): Promise<OrganisationListee[]> {
	return rows<OrganisationListee>(
		await publicDatabase().execute(sql`
			select o."slug", o."default_language", o."enabled_language",
				greatest(
					o."updated_at",
					coalesce((select max(greatest(c."updated_at", c."created_at")) from "course" c
						where c."organization_id" = o."id"), o."updated_at"),
					coalesce((select max(greatest(t."updated_at", t."created_at"))
						from "course_translation" t where t."organization_id" = o."id"), o."updated_at")
				)::text as last_modified
			from "organization" o
			order by o."slug"
		`)
	);
}

/** Les cours publiés d'une organisation, réduits à ce qu'un plan de site a besoin de connaître. */
export async function readPublicCourseStamps(organizationId: string) {
	return rows<{ id: string; last_modified: string }>(
		await publicDatabase().execute(sql`
			select c."id",
				greatest(
					c."updated_at", c."created_at",
					coalesce((select max(greatest(t."updated_at", t."created_at"))
						from "course_translation" t where t."course_id" = c."id"), c."updated_at")
				)::text as last_modified
			from "course" c
			where c."organization_id" = ${organizationId}
			order by c."created_at"
		`)
	);
}

export async function readPublicRooms(organizationId: string) {
	return rows<{ id: string; name: string; display_order: number }>(
		await publicDatabase().execute(sql`
			select "id", "name", "display_order" from "room"
			where "organization_id" = ${organizationId}
			order by "display_order", "name"
		`)
	);
}

async function readPublicExceptions(organizationId: string, from: IsoDate, to: IsoDate) {
	return rows<ExceptionRow>(
		await publicDatabase().execute(sql`
			select "id", "course_id", "date"::text, "kind", "to_date"::text, "to_start"::text
			from "session_exception"
			where "organization_id" = ${organizationId}
				and (("date" between ${from} and ${to}) or ("to_date" between ${from} and ${to}))
		`)
	);
}

export async function readPublicPauses(organizationId: string) {
	return rows<PauseRow>(
		await publicDatabase().execute(sql`
			select "id", "course_id", "from_date"::text, "to_date"::text, "reason"
			from "pause" where "organization_id" = ${organizationId} order by "from_date"
		`)
	);
}

/**
 * Les heures d'une organisation sur une plage, **les trois sources résolues** : saisie à la main
 * d'abord, import ensuite, calcul en dernier, avec l'iqama de chaque prière quand elle existe
 * (ADR 0004, étape 8). La requête vient de `@jadwal/db` : la priorité est écrite une seule fois,
 * et l'espace des responsables lit exactement la même chose.
 */
export async function readPublicPrayerDays(organizationId: string, from: IsoDate, to: IsoDate) {
	return rows<ResolvedPrayerRow>(
		await publicDatabase().execute(resolvedPrayerDaysQuery(organizationId, from, to))
	);
}

/** Les heures de prière, dans la forme que `@jadwal/core` attend : une table par date. */
export const tableDesPrieres = toPrayerTable;

export interface SeancePublique extends Occurrence {
	title: string;
	description: string | null;
	audience: string;
	room: string | null;
	teacher: string | null;
	/** `course` ou `jumua` (ADR 0033). */
	kind: string;
	/** `jumua` : première, deuxième ou troisième session. Nul pour un cours. */
	jumuaOrder: number | null;
	/**
	 * Langues d'enseignement du cours — **du sermon**, pour une session du vendredi. C'est la même
	 * colonne ; seul le mot affiché change, et il change parce qu'il n'a pas le même sens.
	 */
	teachingLanguages: string[];
}

export interface ProgrammePublic {
	from: IsoDate;
	to: IsoDate;
	today: IsoDate;
	courses: (CourseRow & {
		title: string | null;
		description: string | null;
		room: string | null;
	})[];
	pauses: PauseRow[];
	seances: SeancePublique[];
}

/**
 * Le plafond de plage que l'appelant demande, ou `'trop_long'` s'il dépasse ce que le serveur
 * accepte de servir d'un coup.
 *
 * Une valeur illisible est **ignorée**, exactement comme `from` et `to` : c'est la règle déjà écrite
 * dans `docs/API.md`, et deux règles pour trois paramètres seraient une de trop. Une valeur lisible
 * mais trop grande, en revanche, est refusée : elle dit une intention, et la borner en silence
 * reviendrait à répondre autre chose que ce qui est demandé sans le dire.
 */
export function plafondDemande(value: string | null): number | 'trop_long' {
	if (value === null) return MAX_JOURS;
	const jours = Number(value);
	if (!Number.isInteger(jours) || jours < 1) return MAX_JOURS;
	if (jours > MAX_JOURS_DEMANDE) return 'trop_long';
	return jours;
}

/** La plage demandée, ramenée dans ses bornes. Le serveur décide, pas l'appelant. */
export function boundedRange(
	today: IsoDate,
	from: string | null,
	to: string | null,
	maxJours: number = MAX_JOURS
): { from: IsoDate; to: IsoDate } {
	const debut = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? (from as IsoDate) : today;
	const demandee =
		to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? (to as IsoDate) : addDays(debut, JOURS_PAR_DEFAUT - 1);
	const plafond = addDays(debut, Math.min(maxJours, MAX_JOURS_DEMANDE) - 1);
	const fin = demandee < debut ? debut : demandee > plafond ? plafond : demandee;
	return { from: debut, to: fin };
}

/**
 * Le programme public d'une organisation. Quatre requêtes, quel que soit le nombre de cours, et une
 * seule vérité sur les séances : `expandOccurrences`.
 */
export async function readPublicProgramme(
	organisation: OrganisationPublique,
	langue: Langue,
	now: Date,
	range?: { from: IsoDate; to: IsoDate }
): Promise<ProgrammePublic> {
	const today = todayInZone(organisation.time_zone, now);
	const { from, to } = range ?? boundedRange(today, null, null);
	const courses = await readPublicCourses(organisation.id, langue);
	const exceptions = await readPublicExceptions(organisation.id, from, to);
	const pauses = await readPublicPauses(organisation.id);
	// Module éteint : aucune heure de prière n'est lue, donc aucune ne peut paraître (ADR 0042). Le
	// déclencheur de la migration 0050 garantit déjà qu'aucun cours ancré ni aucune session du
	// vendredi ne subsiste dans ce cas ; la lecture serait donc inutile, et la sauter le dit.
	const prayerDays = organisation.prayer_module
		? await readPublicPrayerDays(organisation.id, from, to)
		: [];

	// Le vendredi, c'est la Jumu'a qui tient lieu de Dhuhr : l'iqama du Dhuhr devient l'heure de la
	// dernière session, et un cours ancré dessus la suit (ADR 0033).
	const table = appliquerVendredi(tableDesPrieres(prayerDays), sessionsDuVendredi(courses));
	const byId = new Map(courses.map((course) => [course.id, course]));
	const seances = expandOccurrences({
		schedules: courses.map(toSchedule),
		exceptions: exceptions.map(toException),
		pauses: pauses.map(toPause),
		range: { from, to },
		prayerTimes: (date) => table.get(date)
	}).map((occurrence) => {
		const course = byId.get(occurrence.courseId);
		return {
			...occurrence,
			title: course?.title ?? '',
			description: course?.description ?? null,
			audience: course?.audience ?? 'open',
			room: course?.room ?? null,
			teacher: course?.teacher ?? null,
			kind: course?.kind ?? 'course',
			jumuaOrder: course?.jumua_order ?? null,
			teachingLanguages: course?.teaching_language ?? []
		};
	});
	return { from, to, today, courses, pauses, seances };
}

/** La pause d'organisation qui couvre cette date, s'il y en a une. */
export function pauseCouvrant(pauses: readonly PauseRow[], date: IsoDate): PauseRow | undefined {
	return pauses.find(
		(pause) =>
			pause.course_id === null && isoDate(pause.from_date) <= date && isoDate(pause.to_date) >= date
	);
}

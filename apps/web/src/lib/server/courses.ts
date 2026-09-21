// Lire un formulaire de cours, le vérifier, l'écrire — et laisser une trace.
//
// La vérification n'est pas réécrite ici : les formes de rythme et d'horaire sont celles de
// `@jadwal/core`, et c'est `validateSchedule` qui tranche. Ce fichier traduit un formulaire en
// modèle, rend les messages en français, et écrit. La base a le dernier mot de toute façon : ses
// contraintes de forme refusent ce qui aurait échappé.
//
// Les identifiants sont produits par le système. Les contraintes d'UID de l'étape 1 — pas d'espace,
// pas de virgule, jamais un identifiant qui finit par une date — ne remontent donc jamais jusqu'au
// responsable, puisqu'il n'en saisit aucun.

import {
	validateSchedule,
	type CourseSchedule,
	type ValidationCode,
	type IsoDate,
	type LocalTime,
	type Prayer,
	type Recurrence,
	type Timing,
	type Weekday
} from '@jadwal/core';
import { AUDIENCES, newId, sql, type Transaction } from '@jadwal/db';
import { record } from './audit.js';
import type { OrganisationContext } from './context.js';

/** Les deux formes que les formulaires acceptent, et rien d'autre. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^\d{2}:\d{2}$/;

export interface CourseValues {
	/**
	 * `course` ou `jumua`. Une session du vendredi passe par les mêmes écritures qu'un cours : ces
	 * deux champs sont toute la différence côté base (ADR 0033).
	 */
	kind: string;
	/** `jumua` : première, deuxième ou troisième session. Nul pour un cours. */
	jumuaOrder: number | null;
	title: string;
	description: string | null;
	audience: string;
	teachingLanguages: string[];
	sourceLanguage: string;
	roomId: string | null;
	teacher: string | null;
	status: string;
	startsOn: IsoDate;
	endsOn: IsoDate | null;
	recurrence: Recurrence;
	timing: Timing;
	/** Traductions saisies, langue par langue. La langue source y figure aussi. */
	translations: Map<string, { title: string; description: string | null }>;
}

export type ParseResult = { ok: true; values: CourseValues } | { ok: false; erreurs: string[] };

function text(form: FormData, name: string): string {
	return String(form.get(name) ?? '').trim();
}

function optional(form: FormData, name: string): string | null {
	const value = text(form, name);
	return value.length > 0 ? value : null;
}

function integer(form: FormData, name: string, fallback: number): number {
	const value = Number(text(form, name));
	return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

/**
 * Traduit les anomalies de `@jadwal/core` en phrases que le responsable peut agir. Un code qu'on ne
 * connaît pas n'est pas masqué : il sort tel quel, plutôt que de faire croire que tout va bien.
 */
function enFrancais(code: ValidationCode, path: string): string {
	// Le type est celui de `@jadwal/core` : renommer un code là-bas fait échouer la compilation
	// ici, au lieu de faire tomber la phrase dans le repli silencieux.
	const messages: Partial<Record<ValidationCode, string>> = {
		invalid_date: 'Une date est mal écrite.',
		invalid_time: 'Une heure est mal écrite.',
		ends_before_starts: 'Le dernier jour est avant le premier.',
		weekdays_empty: 'Choisissez au moins un jour.',
		weekdays_duplicate: 'Un jour est choisi deux fois.',
		invalid_weekday: 'Ce jour de la semaine n’existe pas.',
		invalid_interval: 'Le rythme hebdomadaire est « chaque semaine » ou « une semaine sur deux ».',
		invalid_ordinal: 'Le rang dans le mois n’est pas reconnu.',
		dates_empty: 'Indiquez au moins une date.',
		dates_duplicate: 'Une date est indiquée deux fois.',
		invalid_prayer: 'Cette prière n’existe pas.',
		offset_out_of_range: 'Le décalage va de -120 à 240 minutes.',
		duration_out_of_range: 'La durée va de 5 minutes à 24 heures.',
		invalid_kind: 'Ce rythme ou cet horaire n’existe pas.'
	};
	return messages[code] ?? `Valeur refusée (${code}, ${path}).`;
}

/** Les jours cochés, en jours ISO. */
function weekdays(form: FormData): Weekday[] {
	return form
		.getAll('weekdays')
		.map((value) => Number(value))
		.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
		.sort((a, b) => a - b) as Weekday[];
}

function readRecurrence(form: FormData): Recurrence {
	const kind = text(form, 'recurrenceKind');
	if (kind === 'monthly') {
		return {
			kind: 'monthly',
			weekday: integer(form, 'monthlyWeekday', 1) as Weekday,
			ordinal: integer(form, 'monthlyOrdinal', 1) as 1 | 2 | 3 | 4 | -1
		};
	}
	if (kind === 'dates') {
		const dates = text(form, 'dates')
			.split(/[\s,;]+/)
			.map((value) => value.trim())
			.filter((value) => value.length > 0);
		return { kind: 'dates', dates: dates as IsoDate[] };
	}
	return {
		kind: 'weekly',
		weekdays: weekdays(form),
		interval: (integer(form, 'interval', 1) === 2 ? 2 : 1) as 1 | 2,
		anchorDate: (text(form, 'startsOn') || '1970-01-01') as IsoDate
	};
}

function readTiming(form: FormData): Timing {
	if (text(form, 'timingKind') === 'prayer') {
		return {
			kind: 'prayer',
			prayer: text(form, 'prayer') as Prayer,
			offsetMinutes: integer(form, 'offsetMinutes', 0),
			durationMinutes: integer(form, 'durationMinutes', 60)
		};
	}
	return {
		kind: 'fixed',
		start: text(form, 'start') as LocalTime,
		end: text(form, 'end') as LocalTime
	};
}

/**
 * Lit le formulaire et rend soit des valeurs sûres, soit la liste des phrases à afficher. Rien
 * n'est écrit tant que tout n'est pas bon : un formulaire à moitié accepté serait pire que refusé.
 */
export function parseCourseForm(form: FormData, enabledLanguages: readonly string[]): ParseResult {
	const erreurs: string[] = [];
	const sourceLanguage = text(form, 'sourceLanguage') || (enabledLanguages[0] ?? 'fr');
	if (!enabledLanguages.includes(sourceLanguage)) {
		erreurs.push('Cette langue n’est pas activée pour l’organisation.');
	}
	const title = text(form, `title.${sourceLanguage}`) || text(form, 'title');
	if (title.length === 0) erreurs.push('Le titre est obligatoire.');

	const audience = text(form, 'audience') || 'open';
	if (!(AUDIENCES as readonly string[]).includes(audience)) {
		erreurs.push('Ce public n’existe pas.');
	}
	const teachingLanguages = form
		.getAll('teachingLanguages')
		.map((value) => String(value))
		.filter((value) => enabledLanguages.includes(value));
	if (teachingLanguages.length === 0) teachingLanguages.push(sourceLanguage);

	const startsOn = text(form, 'startsOn') as IsoDate;
	const endsOn = optional(form, 'endsOn') as IsoDate | null;
	const recurrence = readRecurrence(form);
	const timing = readTiming(form);

	// L'identifiant passé à la validation n'est pas celui du cours : il n'existe pas encore à la
	// création. Un identifiant factice mais valide suffit, puisque c'est le rythme qu'on vérifie.
	const schedule: CourseSchedule = {
		id: 'verification',
		recurrence,
		timing,
		startsOn,
		sequence: 0,
		...(endsOn ? { endsOn } : {})
	};
	for (const issue of validateSchedule(schedule)) {
		const phrase = enFrancais(issue.code, issue.path);
		if (!erreurs.includes(phrase)) erreurs.push(phrase);
	}

	const translations = new Map<string, { title: string; description: string | null }>();
	for (const language of enabledLanguages) {
		const titre = text(form, `title.${language}`) || (language === sourceLanguage ? title : '');
		const description = optional(form, `description.${language}`);
		if (titre.length > 0) translations.set(language, { title: titre, description });
	}

	if (erreurs.length > 0) return { ok: false, erreurs };
	return {
		ok: true,
		values: {
			kind: 'course',
			jumuaOrder: null,
			title,
			description: optional(form, `description.${sourceLanguage}`),
			audience,
			teachingLanguages,
			sourceLanguage,
			roomId: optional(form, 'roomId'),
			teacher: optional(form, 'teacher'),
			status: text(form, 'status') === 'published' ? 'published' : 'draft',
			startsOn,
			endsOn,
			recurrence,
			timing,
			translations
		}
	};
}

/** Les colonnes de rythme et d'horaire, à plat, telles que la base les attend. */
function columns(values: CourseValues) {
	const recurrence = values.recurrence;
	const timing = values.timing;
	return {
		weekdays: recurrence.kind === 'weekly' ? recurrence.weekdays : null,
		interval: recurrence.kind === 'weekly' ? recurrence.interval : null,
		anchorDate: recurrence.kind === 'weekly' ? recurrence.anchorDate : null,
		ordinalWeekday: recurrence.kind === 'monthly' ? recurrence.weekday : null,
		ordinal: recurrence.kind === 'monthly' ? recurrence.ordinal : null,
		dates: recurrence.kind === 'dates' ? recurrence.dates : null,
		start: timing.kind === 'fixed' ? timing.start : null,
		end: timing.kind === 'fixed' ? timing.end : null,
		prayer: timing.kind === 'prayer' ? timing.prayer : null,
		offsetMinutes: timing.kind === 'prayer' ? timing.offsetMinutes : null,
		durationMinutes: timing.kind === 'prayer' ? timing.durationMinutes : null
	};
}

/** Un tableau PostgreSQL littéral, pour les colonnes de type tableau. */
function pgArray(values: readonly (string | number)[], cast: string): ReturnType<typeof sql.raw> {
	const inner = values.map((value) => `'${String(value).replaceAll("'", "''")}'`).join(',');
	return sql.raw(`array[${inner}]::${cast}`);
}

async function writeTranslations(
	tx: Transaction,
	context: OrganisationContext,
	courseId: string,
	values: CourseValues
): Promise<void> {
	await tx.execute(sql`delete from "course_translation" where "course_id" = ${courseId}`);
	for (const [language, translation] of values.translations) {
		await tx.execute(sql`
			insert into "course_translation"
				("id", "organization_id", "course_id", "language", "title", "description")
			values (${newId()}, ${context.organizationId}, ${courseId}, ${language},
				${translation.title}, ${translation.description})
		`);
	}
}

export async function insertCourse(
	tx: Transaction,
	context: OrganisationContext,
	values: CourseValues
): Promise<string> {
	const id = newId();
	const c = columns(values);
	await tx.execute(sql`
		insert into "course" (
			"id", "organization_id", "kind", "jumua_order",
			"status", "audience", "teaching_language", "room_id", "teacher",
			"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
			"recurrence_anchor_date", "recurrence_ordinal_weekday", "recurrence_ordinal",
			"recurrence_date", "timing_kind", "timing_start", "timing_end", "timing_prayer",
			"timing_offset_minutes", "timing_duration_minutes", "starts_on", "ends_on", "updated_by"
		) values (
			${id}, ${context.organizationId}, ${values.kind}, ${values.jumuaOrder},
			${values.status}, ${values.audience},
			${pgArray(values.teachingLanguages, 'text[]')}, ${values.roomId}, ${values.teacher},
			${values.sourceLanguage}, ${values.recurrence.kind},
			${c.weekdays ? pgArray(c.weekdays, 'smallint[]') : null}, ${c.interval},
			${c.anchorDate}, ${c.ordinalWeekday}, ${c.ordinal},
			${c.dates ? pgArray(c.dates, 'date[]') : null},
			${values.timing.kind}, ${c.start}, ${c.end}, ${c.prayer}, ${c.offsetMinutes},
			${c.durationMinutes}, ${values.startsOn}, ${values.endsOn}, ${context.userId}
		)
	`);
	await writeTranslations(tx, context, id, values);
	await record(tx, context.organizationId, context.userId, {
		action: 'course.create',
		targetTable: 'course',
		targetId: id,
		after: { title: values.title, status: values.status, recurrence: values.recurrence }
	});
	return id;
}

export async function updateCourse(
	tx: Transaction,
	context: OrganisationContext,
	courseId: string,
	values: CourseValues,
	before: unknown
): Promise<boolean> {
	const c = columns(values);
	const touched = await tx.execute(sql`
		update "course" set
			"kind" = ${values.kind}, "jumua_order" = ${values.jumuaOrder},
			"status" = ${values.status}, "audience" = ${values.audience},
			"teaching_language" = ${pgArray(values.teachingLanguages, 'text[]')},
			"room_id" = ${values.roomId}, "teacher" = ${values.teacher},
			"source_language" = ${values.sourceLanguage},
			"recurrence_kind" = ${values.recurrence.kind},
			"recurrence_weekday" = ${c.weekdays ? pgArray(c.weekdays, 'smallint[]') : null},
			"recurrence_interval" = ${c.interval},
			"recurrence_anchor_date" = ${c.anchorDate},
			"recurrence_ordinal_weekday" = ${c.ordinalWeekday},
			"recurrence_ordinal" = ${c.ordinal},
			"recurrence_date" = ${c.dates ? pgArray(c.dates, 'date[]') : null},
			"timing_kind" = ${values.timing.kind}, "timing_start" = ${c.start}, "timing_end" = ${c.end},
			"timing_prayer" = ${c.prayer}, "timing_offset_minutes" = ${c.offsetMinutes},
			"timing_duration_minutes" = ${c.durationMinutes},
			"starts_on" = ${values.startsOn}, "ends_on" = ${values.endsOn},
			"sequence" = "sequence" + 1, "updated_at" = now(), "updated_by" = ${context.userId}
		where "id" = ${courseId}
		returning "id"
	`);
	// Une mise à jour refusée par la sécurité au niveau des lignes ne lève pas : elle rend zéro
	// ligne. Sans ce contrôle, l'écran dirait « enregistré » sans que rien ne le soit.
	const rows = Array.isArray(touched) ? touched : ((touched as { rows?: unknown[] }).rows ?? []);
	if (rows.length === 0) return false;
	await writeTranslations(tx, context, courseId, values);
	await record(tx, context.organizationId, context.userId, {
		action: 'course.update',
		targetTable: 'course',
		targetId: courseId,
		before,
		after: { title: values.title, status: values.status, recurrence: values.recurrence }
	});
	return true;
}

// ---------------------------------------------------------------------------------------------
// Les sessions du vendredi (ADR 0033)
// ---------------------------------------------------------------------------------------------

/**
 * Lit le formulaire d'une session du vendredi.
 *
 * Trois questions ne sont **pas** posées, et ce n'est pas un oubli : le jour, c'est le vendredi ;
 * le rythme, c'est chaque semaine ; le public, c'est ouvert à tous. Elles ont un sens pour un cours,
 * aucun ici, et l'écran ne fait pas semblant de les poser
 * (docs/maquettes/responsables-vendredi.md). Trois contraintes de vérification disent la même chose
 * du côté de la base : elle refuserait une session qui s'en écarterait, quel que soit le chemin.
 */
export function parseJumuaForm(form: FormData, enabledLanguages: readonly string[]): ParseResult {
	const erreurs: string[] = [];
	const titre = text(form, 'title') || 'Prière du vendredi';
	if (titre.length > 120) erreurs.push('Le titre est trop long.');

	const rang = Number(text(form, 'jumuaOrder'));
	if (!Number.isInteger(rang) || rang < 1 || rang > 3) {
		erreurs.push('Choisissez la première, la deuxième ou la troisième session.');
	}

	const debut = text(form, 'start');
	const fin = text(form, 'end');
	if (!HEURE.test(debut) || !HEURE.test(fin)) {
		erreurs.push('Donnez une heure de début et une heure de fin, au format 12:10.');
	} else if (fin <= debut) {
		erreurs.push('La fin doit venir après le début.');
	}

	const langues = form.getAll('sermonLanguages').map(String);
	const sermon = langues.filter((langue) => enabledLanguages.includes(langue));
	if (sermon.length === 0) erreurs.push('Choisissez au moins une langue de sermon.');

	const debutDe = text(form, 'startsOn');
	if (!DATE.test(debutDe)) erreurs.push('Donnez une date de début, au format AAAA-MM-JJ.');
	const finDe = text(form, 'endsOn');
	if (finDe !== '' && !DATE.test(finDe)) erreurs.push('La date de fin est illisible.');
	if (DATE.test(debutDe) && DATE.test(finDe) && finDe < debutDe) {
		erreurs.push('La date de fin vient avant la date de début.');
	}

	const sourceLanguage = enabledLanguages[0] ?? 'fr';
	if (erreurs.length > 0) return { ok: false, erreurs };

	const translations = new Map<string, { title: string; description: string | null }>();
	translations.set(sourceLanguage, {
		title: titre,
		description: optional(form, 'description')
	});

	return {
		ok: true,
		values: {
			kind: 'jumua',
			jumuaOrder: rang,
			title: titre,
			description: optional(form, 'description'),
			audience: 'open',
			teachingLanguages: sermon,
			sourceLanguage,
			roomId: optional(form, 'roomId'),
			teacher: optional(form, 'teacher'),
			status: text(form, 'status') === 'published' ? 'published' : 'draft',
			startsOn: debutDe as IsoDate,
			endsOn: finDe === '' ? null : (finDe as IsoDate),
			// Le vendredi, chaque semaine : jamais autre chose.
			recurrence: {
				kind: 'weekly',
				weekdays: [5],
				interval: 1,
				anchorDate: debutDe as IsoDate
			},
			timing: { kind: 'fixed', start: debut as LocalTime, end: fin as LocalTime },
			translations
		}
	};
}

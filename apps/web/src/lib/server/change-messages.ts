// Le cours d'une séance qu'un écran change, et les messages prêts à coller qui l'annoncent, dans
// chaque langue que l'organisation publie. « À venir » s'en sert depuis l'étape 18 ; l'écran du
// vendredi aussi depuis l'étape 20, pour l'annulation d'une session déplacée dont le vendredi prévu
// est passé (C2). Un `+page.server.ts` ne peut rien exporter d'autre que ce que SvelteKit attend :
// le code partagé vit ici.

import type { IsoDate } from '@jadwal/core';
import { sql, type Transaction } from '@jadwal/db';
import { LANGUES, type Langue } from '$lib/i18n.js';
import { cancellationMessage } from '$lib/messages.js';
import { fridayTitle } from './friday-title.js';

/** Un identifiant de cours. Autre chose n'atteint pas la base, qui le refuserait en erreur. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

/** Un message prêt à coller, dans une langue. */
export interface Message {
	language: Langue;
	text: string;
}

/**
 * Le cours d'une séance visée par une action : sa langue source, son type, et son titre dans une
 * langue, ou dans sa langue source quand il n'y est pas traduit ; pour une session du vendredi qui
 * porte le nom proposé, le nom de la prière dans cette langue.
 */
export interface CourseOfSeance {
	source: string;
	kind: string;
	title: (language: Langue) => string;
}

/**
 * Les langues des messages : celles que l'organisation publie, dans l'ordre du service, et `first`
 * devant elles quand elle en fait partie (retour D1). La base exige au moins une langue publiée ; le
 * français ne sert que si aucune n'est une langue du service.
 */
export function messageLanguages(published: readonly string[], first: string): Langue[] {
	const languages = LANGUES.filter((language) => published.includes(language));
	const head = languages.find((language) => language === first) ?? languages[0] ?? 'fr';
	return [head, ...languages.filter((language) => language !== head)];
}

/**
 * Le cours d'une séance visée par une action, ou rien si le cours n'existe pas, ou plus, dans
 * l'organisation du contexte. Le filtre sur le contexte est écrit ici, comme dans `readSettings` : il
 * ne dépend pas de la seule politique de lecture.
 */
export async function readCourse(
	tx: Transaction,
	courseId: string
): Promise<CourseOfSeance | null> {
	if (!UUID.test(courseId)) return null;
	const found = rows<{
		source_language: string;
		kind: string;
		language: string | null;
		title: string | null;
	}>(
		await tx.execute(sql`
			select c."source_language", c."kind", t."language", t."title"
			from "course" c
			left join "course_translation" t on t."course_id" = c."id"
			where c."id" = ${courseId} and c."organization_id" = (select jadwal.current_org_id())
		`)
	);
	const source = found[0]?.source_language;
	const kind = found[0]?.kind ?? 'course';
	if (source === undefined) return null;
	const titles = new Map(found.map((row) => [row.language, row.title ?? '']));
	const fallback = titles.get(source) ?? found.find((row) => row.title)?.title ?? '';
	return {
		source,
		kind,
		title: (language) => fridayTitle(titles.get(language) ?? fallback, kind, language)
	};
}

/**
 * Le message d'une annulation, dans chaque langue publiée, la langue du cours d'abord. La première
 * annulation le rend, et la seconde aussi (étape 19, D4). `start` : l'heure d'une séance déplacée
 * puis annulée à sa nouvelle date, que le message nomme avec cette date (étape 20, C2).
 */
export function cancellationMessages(
	settings: { enabled_language: string[]; greeting: string },
	course: CourseOfSeance,
	date: IsoDate,
	start: string | null = null
): Message[] {
	return messageLanguages(settings.enabled_language, course.source).map((language) => ({
		language,
		text: cancellationMessage(
			settings.greeting,
			course.title(language),
			date,
			language,
			course.kind,
			start
		)
	}));
}

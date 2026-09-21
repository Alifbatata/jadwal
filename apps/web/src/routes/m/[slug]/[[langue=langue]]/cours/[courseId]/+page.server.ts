// La page d'un cours, à son propre lien (docs/maquettes/public-cours.md).
//
// Elle existe pour deux raisons : c'est ce qu'on partage dans un message, et c'est ce qu'un moteur
// de recherche indexe. Un cours non publié, ou d'une organisation suspendue, répond comme un cours
// qui n'existe pas — le rôle public ne le voit pas, donc il n'y a rien à filtrer ici.

import { error } from '@sveltejs/kit';
import { todayInZone } from '@jadwal/core';
import type { PageServerLoad } from './$types.js';
import { CACHE_PROGRAMME } from '$lib/server/api.js';
import {
	publicDatabase,
	readPublicCourses,
	readPublicPauses,
	type Langue
} from '$lib/server/public.js';
import { toException, toSchedule } from '$lib/server/programme.js';
import { nextDates } from '$lib/server/serialise.js';
import { languesProposees, publicContext, referencement } from '$lib/server/pages.js';
import { lienCours, lienFluxCours } from '$lib/public/liens.js';
import { sql } from '@jadwal/db';

/** Dix dates à venir : au-delà, personne ne lit (docs/maquettes/public-cours.md). */
const PROCHAINES = 10;

export const load: PageServerLoad = async (event) => {
	const { organisation, langue } = await publicContext(event);
	const courseId = event.params.courseId;
	const courses = await readPublicCourses(organisation.id, langue as Langue);
	const cours = courses.find((candidat) => candidat.id === courseId);
	if (!cours) error(404, 'Page introuvable.');

	const today = todayInZone(organisation.time_zone, new Date());
	const pauses = await readPublicPauses(organisation.id);
	const exceptions = (
		(await publicDatabase().execute(sql`
			select "id", "course_id", "date"::text, "kind", "to_date"::text, "to_start"::text
			from "session_exception"
			where "organization_id" = ${organisation.id} and "course_id" = ${courseId}
		`)) as unknown as Parameters<typeof toException>[0][]
	).map(toException);

	// Le flux de ce seul cours (ADR 0028). La langue ne figure dans l'adresse que si elle n'est pas
	// celle de l'organisation : une adresse qu'on copie à la main gagne à rester courte.
	const demandee = langue === organisation.default_language ? undefined : langue;
	const fluxHttps = new URL(
		lienFluxCours(organisation.slug, courseId, demandee),
		event.url.origin
	).toString();

	const moteur = referencement(event, organisation, langue, (autre) =>
		lienCours(
			{
				slug: organisation.slug,
				langue: autre,
				langueParDefaut: organisation.default_language
			},
			courseId
		)
	);

	event.setHeaders({ 'cache-control': CACHE_PROGRAMME });
	return {
		canonical: moteur.canonical,
		alternates: moteur.alternates,
		flux: { https: fluxHttps, webcal: fluxHttps.replace(/^https?:/, 'webcal:') },
		organisation: {
			slug: organisation.slug,
			name: organisation.name,
			accentColor: organisation.accent_color,
			defaultLanguage: organisation.default_language
		},
		langue,
		langues: languesProposees(organisation),
		cours: {
			id: cours.id,
			title: cours.title ?? '',
			description: cours.description,
			audience: cours.audience,
			teachingLanguages: cours.teaching_language,
			room: cours.room,
			teacher: cours.teacher,
			startsOn: String(cours.starts_on).slice(0, 10),
			endsOn: cours.ends_on ? String(cours.ends_on).slice(0, 10) : null,
			recurrenceKind: cours.recurrence_kind,
			recurrenceWeekdays: cours.recurrence_weekday,
			recurrenceInterval: cours.recurrence_interval,
			recurrenceOrdinal: cours.recurrence_ordinal,
			recurrenceOrdinalWeekday: cours.recurrence_ordinal_weekday,
			recurrenceDates: cours.recurrence_dates,
			timingKind: cours.timing_kind,
			timingStart: cours.timing_start,
			timingEnd: cours.timing_end,
			timingPrayer: cours.timing_prayer,
			timingOffsetMinutes: cours.timing_offset_minutes,
			timingDurationMinutes: cours.timing_duration_minutes
		},
		prochaines: nextDates(toSchedule(cours), exceptions, pauses, today, PROCHAINES).map(
			(seance) => ({
				date: seance.date,
				start: seance.start,
				end: seance.end,
				status: seance.status,
				anchor: seance.anchor ?? null,
				originalDate: seance.originalDate ?? null
			})
		)
	};
};

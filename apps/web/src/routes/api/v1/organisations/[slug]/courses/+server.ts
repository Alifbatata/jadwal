// La liste des cours d'une organisation, groupés par rythme (ADR 0026, `docs/API.md`).

import type { RequestHandler } from './$types.js';
import { todayInZone } from '@jadwal/core';
import {
	allowRequest,
	CACHE_PROGRAMME,
	publicError,
	publicOptions,
	publicResponse,
	tooManyRequests
} from '$lib/server/api.js';
import {
	etagOf,
	findOrganisation,
	fingerprint,
	isLangue,
	readPublicCourses,
	readPublicPauses
} from '$lib/server/public.js';
import { toException, toSchedule } from '$lib/server/programme.js';
import { courseOf, coursesOf, nextDates, RYTHMES, rythmeOf } from '$lib/server/serialise.js';
import { publicDatabase } from '$lib/server/public.js';
import { sql } from '@jadwal/db';

/** Au plus cinq dates à venir par cours : la vue Tous les cours n'en montre pas davantage. */
const PROCHAINES = 5;

export const GET: RequestHandler = async (event) => {
	if (!(await allowRequest(event))) return tooManyRequests();
	const organisation = await findOrganisation(event.params.slug);
	if (!organisation) return publicError(404, 'not_found');

	const demandee = event.url.searchParams.get('lang') ?? organisation.default_language;
	const langue = isLangue(demandee) ? demandee : 'fr';
	const etag = etagOf(await fingerprint(organisation.id), 'courses', langue);

	const today = todayInZone(organisation.time_zone, new Date());
	const courses = await readPublicCourses(organisation.id, langue);
	const pauses = await readPublicPauses(organisation.id);
	// Toutes les exceptions à venir, une seule fois : les prochaines dates de chaque cours les
	// prennent en compte, et une requête par cours serait une requête de trop par cours.
	const exceptions = (
		(await publicDatabase().execute(sql`
			select "id", "course_id", "date"::text, "kind", "to_date"::text, "to_start"::text
			from "session_exception"
			where "organization_id" = ${organisation.id} and "date" >= ${today}
		`)) as unknown as Parameters<typeof toException>[0][]
	).map(toException);

	const groupes = RYTHMES.map((rhythm) => ({
		rhythm,
		courses: courses
			.filter((course) => rythmeOf(course) === rhythm)
			.map((course) =>
				courseOf(
					course,
					nextDates(toSchedule(course), exceptions, pauses, today, PROCHAINES).map((seance) => ({
						date: seance.date,
						start: seance.start,
						status: seance.status
					}))
				)
			)
	})).filter((groupe) => groupe.courses.length > 0);

	return publicResponse(event, JSON.stringify(coursesOf(organisation, langue, groupes)), {
		cacheControl: CACHE_PROGRAMME,
		etag
	});
};

export const OPTIONS: RequestHandler = () => publicOptions();

// Le flux agenda d'une organisation (ADR 0003, ADR 0004, partie C de l'étape 5).
//
// Construit par `@jadwal/core/ics`, qui est le seul endroit du projet où une `RRULE` est produite.
// Ce fichier ne fait que rassembler les entrées et choisir les libellés : un cours ancré sur une
// prière sort avec « Après Maghrib » en tête de description, puisque son heure change chaque jour.

import { buildCalendar, DEFAULT_HORIZON_DAYS, DEFAULT_PAST_DAYS } from '@jadwal/core/ics';
import { addDays, todayInZone, type Prayer } from '@jadwal/core';
import { toException, toPause, toSchedule } from './programme.js';
import {
	findOrganisation,
	readPublicCourses,
	readPublicPauses,
	readPublicPrayerDays,
	tableDesPrieres,
	type Langue,
	type OrganisationPublique
} from './public.js';
import { appliquerVendredi, sessionsDuVendredi } from './vendredi.js';
import { publicDatabase } from './public.js';
import { sql } from '@jadwal/db';
import { PRAYER_LABELS } from '$lib/format.js';

/** Le libellé d'ancrage, dans la langue de la page : c'est la première ligne de la description. */
const ANCRAGE: Record<Langue, (priere: string, decalage: number) => string> = {
	fr: (priere, decalage) => (decalage === 0 ? `À ${priere}` : `${decalage} min après ${priere}`),
	de: (priere, decalage) => (decalage === 0 ? `Zu ${priere}` : `${decalage} Min. nach ${priere}`),
	it: (priere, decalage) => (decalage === 0 ? `A ${priere}` : `${decalage} min dopo ${priere}`),
	ar: (priere, decalage) =>
		decalage === 0 ? `عند ${priere}` : `بعد ${priere} بـ ${decalage} دقيقة`
};

export interface AgendaOptions {
	organisation: OrganisationPublique;
	langue: Langue;
	now: Date;
	/** Hôte repris dans les UID : il doit être stable, sinon chaque abonné revoit tout comme neuf. */
	uidHost: string;
	/**
	 * Un seul cours au lieu de tout le programme (ADR 0028). Le calendrier est construit par le même
	 * `buildCalendar`, avec une liste d'un cours : un flux par cours n'est pas un second export, et
	 * c'est tout l'intérêt — il ne peut pas diverger de celui de l'organisation.
	 */
	courseId?: string;
}

/** Ce qu'un flux agenda a besoin de savoir, une fois le cours résolu. */
export interface Agenda {
	ics: string;
	/** Le titre du cours quand le flux n'en porte qu'un, pour le nom de fichier et le calendrier. */
	title: string | null;
}

/** Le fichier `.ics` d'une organisation, ou d'un seul de ses cours, prêt à être servi. */
export async function buildAgenda(options: AgendaOptions): Promise<Agenda | undefined> {
	const { organisation, langue, now, uidHost, courseId } = options;
	const tous = await readPublicCourses(organisation.id, langue);
	const courses = courseId ? tous.filter((course) => course.id === courseId) : tous;
	// Un cours non publié, archivé, ou d'une autre organisation n'est simplement pas là : le rôle
	// public ne le voit pas. La route répond alors comme pour un cours qui n'existe pas.
	if (courseId && courses.length === 0) return undefined;

	const pauses = await readPublicPauses(organisation.id);
	const exceptions = (
		(await publicDatabase().execute(sql`
			select "id", "course_id", "date"::text, "kind", "to_date"::text, "to_start"::text
			from "session_exception" where "organization_id" = ${organisation.id}
		`)) as unknown as Parameters<typeof toException>[0][]
	).map(toException);

	// Les heures de prière sur la fenêtre glissante du fichier. Sans elles, un cours ancré n'a
	// aucune heure connue et le cœur ne produit **aucun** événement pour lui : le flux omettait en
	// silence tous les cours ancrés, alors que `docs/API.md` promet qu'ils en sortent séance par
	// séance. Défaut de l'étape 5, trouvé par le test du flux par cours de l'étape 6.
	const aujourdhui = todayInZone(organisation.time_zone, now);
	// `tous` et non `courses` : la substitution du vendredi vaut même dans le flux d'un seul cours,
	// puisque c'est l'organisation qui décide de ses sessions, pas le cours qu'on exporte.
	const prieres = appliquerVendredi(
		tableDesPrieres(
			await readPublicPrayerDays(
				organisation.id,
				addDays(aujourdhui, -DEFAULT_PAST_DAYS),
				addDays(aujourdhui, DEFAULT_HORIZON_DAYS)
			)
		),
		sessionsDuVendredi(tous)
	);

	const titre = courseId ? (courses[0]?.title ?? '') : null;
	const ics = buildCalendar({
		// Le nom du calendrier est ce que l'application d'agenda affiche dans sa liste :
		// « Association Belvédère » pour tout le programme, « Association Belvédère — Arabe,
		// niveau 1 » pour un cours. Sans le nom de l'organisation, deux abonnements de deux
		// organisations se ressembleraient.
		name: titre ? `${organisation.name} — ${titre}` : organisation.name,
		timeZone: organisation.time_zone,
		now,
		uidHost,
		courses: courses.map((course) => ({
			schedule: toSchedule(course),
			title: course.title ?? '',
			...(course.description ? { description: course.description } : {}),
			...(course.room ? { location: course.room } : {})
		})),
		// Les exceptions et les pauses de toute l'organisation sont passées telles quelles : le cœur
		// ne retient que celles qui concernent un cours de la liste, et une pause d'organisation
		// s'applique au cours isolé comme elle s'applique aux autres.
		exceptions,
		pauses: pauses.map(toPause),
		prayerTimes: (date) => prieres.get(date),
		anchorLabel: (prayer: Prayer, offsetMinutes: number) =>
			ANCRAGE[langue](PRAYER_LABELS[prayer] ?? prayer, offsetMinutes)
	});
	return { ics, title: titre };
}

/**
 * Un nom de fichier lisible : sans accent, sans espace, sans guillemet. C'est ce que la personne
 * verra dans ses téléchargements, et c'est aussi ce qui se glisse entre guillemets dans un en-tête —
 * une apostrophe ou un chevron n'y a rien à faire.
 */
function ascii(texte: string): string {
	return texte
		.normalize('NFD')
		.replaceAll(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, '-')
		.replaceAll(/^-+|-+$/g, '')
		.slice(0, 40);
}

/** Le nom de fichier proposé au téléchargement : lisible, sans accent, sans espace. */
export function agendaFilename(slug: string, titre?: string | null): string {
	const cours = titre ? ascii(titre) : '';
	// Un titre entièrement en arabe ne laisse rien après le passage en ASCII : le nom de fichier
	// retombe alors sur celui de l'organisation, plutôt que sur une suite de tirets.
	return cours ? `${slug}-${cours}.ics` : `${slug}-jadwal.ics`;
}

export { findOrganisation };

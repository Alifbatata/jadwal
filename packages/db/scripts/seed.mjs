// Données de démonstration : une organisation, ses salles, deux responsables et ses cours, avec les
// deux modes d'horaire, une annulation, un déplacement et une pause.
//
// AUCUNE DONNÉE PERSONNELLE RÉELLE. Les noms, les adresses et les horaires sont inventés pour la
// démonstration ; les adresses sont dans le domaine `example.test`, réservé par la RFC 2606 et non
// routable. Les heures de prière sont des valeurs plausibles, pas des heures officielles.
//
// Le script est idempotent : il est écrit avec des identifiants fixes, et chaque écriture remplace
// toutes les colonnes de la ligne existante, y compris celles qui ne figurent pas dans la liste
// d'insertion (`excluded` porte alors leur valeur par défaut). Le rejouer remet les données de
// démonstration dans leur état initial, sans toucher au reste de la base.
// `test/seed.test.ts` le vérifie en comparant une empreinte du contenu, pas un simple comptage.

// Les dépendances du paquet viennent de `@jadwal/db` — son propre nom — et non de `../src/*.ts`.
// Node refuse de retirer les types d'un fichier situé sous `node_modules`, et l'image de
// production, elle, y met ce paquet : un script qui importerait la source ne démarrerait pas
// sur le serveur. Il faut donc que `dist/` soit construit avant de lancer ces scripts à la main
// (`pnpm build`) ; la CI et l'image le font déjà, dans cet ordre (ADR 0034).
import postgres from 'postgres';
import { isMainModule } from './is-main.mjs';
import { connectionSettings, loadDotEnv } from '@jadwal/db';

loadDotEnv();

/** Identifiants fixes : des UUID v7 figés, pour que le script soit rejouable à l'identique. */
const ID = {
	organization: '01930000-0000-7000-8000-000000000001',
	adminUser: '01930000-0000-7000-8000-000000000011',
	editorUser: '01930000-0000-7000-8000-000000000012',
	adminMembership: '01930000-0000-7000-8000-000000000021',
	editorMembership: '01930000-0000-7000-8000-000000000022',
	mainRoom: '01930000-0000-7000-8000-000000000031',
	smallRoom: '01930000-0000-7000-8000-000000000032',
	womenRoom: '01930000-0000-7000-8000-000000000033',
	arabicCourse: '01930000-0000-7000-8000-000000000041',
	tafsirCourse: '01930000-0000-7000-8000-000000000042',
	kidsCourse: '01930000-0000-7000-8000-000000000043',
	womenCourse: '01930000-0000-7000-8000-000000000044',
	youthCourse: '01930000-0000-7000-8000-000000000045',
	cancelled: '01930000-0000-7000-8000-000000000051',
	moved: '01930000-0000-7000-8000-000000000052',
	jumuaFirst: '01930000-0000-7000-8000-000000000046',
	jumuaSecond: '01930000-0000-7000-8000-000000000047',
	holidayPause: '01930000-0000-7000-8000-000000000061',
	arabicPause: '01930000-0000-7000-8000-000000000062',
	autumnPeriod: '01930000-0000-7000-8000-000000000071'
};

const ORGANIZATION = {
	slug: 'belvedere',
	name: 'Association Belvédère',
	timeZone: 'Europe/Zurich',
	defaultLanguage: 'fr',
	languages: ['fr', 'de', 'it', 'ar']
};

/** Deux responsables fictifs : personnes inventées, adresses non routables. */
const PEOPLE = [
	{
		id: ID.adminUser,
		email: 'responsable@belvedere.example.test',
		name: 'Amina Cherif (personne fictive)',
		membership: ID.adminMembership,
		role: 'org_admin'
	},
	{
		id: ID.editorUser,
		email: 'secretariat@belvedere.example.test',
		name: 'Yusuf Berger (personne fictive)',
		membership: ID.editorMembership,
		role: 'editor'
	}
];

const ROOMS = [
	{ id: ID.mainRoom, name: 'Grande salle', order: 1 },
	{ id: ID.smallRoom, name: 'Salle 2', order: 2 },
	{ id: ID.womenRoom, name: 'Salle des sœurs', order: 3 }
];

/**
 * Cours de la démonstration. Le rythme et l'horaire suivent le modèle de @jadwal/core : rythme
 * hebdomadaire à plusieurs jours, une semaine sur deux, mensuel au dernier samedi, dates précises ;
 * horaire à heure fixe ou ancré sur une prière.
 */
const COURSES = [
	{
		id: ID.arabicCourse,
		audience: 'adults',
		room: ID.mainRoom,
		teacher: 'Amina Cherif (personne fictive)',
		teachingLanguages: ['fr', 'ar'],
		recurrence: { kind: 'weekly', weekdays: [1, 3], interval: 1, anchorDate: '2026-09-07' },
		timing: { kind: 'fixed', start: '19:00', end: '20:30' },
		startsOn: '2026-09-07',
		endsOn: '2027-06-30',
		translations: {
			fr: ['Arabe, niveau 1', 'Lecture et écriture, à partir de zéro. Manuel fourni.'],
			de: ['Arabisch, Stufe 1', 'Lesen und Schreiben, von Grund auf. Lehrbuch inbegriffen.'],
			ar: ['العربية، المستوى الأول', 'القراءة والكتابة من الصفر.']
		}
	},
	{
		id: ID.tafsirCourse,
		audience: 'open',
		room: ID.mainRoom,
		teacher: null,
		teachingLanguages: ['ar', 'fr'],
		// Ancré sur maghrib : l'heure suit les heures de prière de l'organisation.
		recurrence: { kind: 'weekly', weekdays: [5], interval: 1, anchorDate: '2026-09-04' },
		timing: { kind: 'prayer', prayer: 'maghrib', offsetMinutes: 15, durationMinutes: 60 },
		startsOn: '2026-09-04',
		endsOn: null,
		translations: {
			fr: ['Tafsir du vendredi', 'Commentaire du Coran, après la prière du Maghrib.'],
			ar: ['تفسير الجمعة', 'تفسير القرآن بعد صلاة المغرب.']
		}
	},
	{
		id: ID.kidsCourse,
		audience: 'kids',
		room: ID.smallRoom,
		teacher: 'Yusuf Berger (personne fictive)',
		teachingLanguages: ['fr'],
		recurrence: { kind: 'weekly', weekdays: [6], interval: 1, anchorDate: '2026-09-05' },
		timing: { kind: 'fixed', start: '10:00', end: '11:30' },
		startsOn: '2026-09-05',
		endsOn: '2027-06-26',
		translations: {
			fr: ['École du samedi', 'Coran et bonnes manières, de 7 à 12 ans. Inscription au bureau.'],
			de: ['Samstagsschule', 'Koran und gutes Benehmen, 7 bis 12 Jahre.']
		}
	},
	{
		id: ID.womenCourse,
		audience: 'women',
		room: ID.womenRoom,
		teacher: 'Amina Cherif (personne fictive)',
		teachingLanguages: ['fr', 'it'],
		// Une semaine sur deux, le mardi.
		recurrence: { kind: 'weekly', weekdays: [2], interval: 2, anchorDate: '2026-09-08' },
		timing: { kind: 'fixed', start: '14:00', end: '15:30' },
		startsOn: '2026-09-08',
		endsOn: null,
		translations: {
			fr: ['Cercle des sœurs', 'Rencontre bimensuelle, thème annoncé chaque quinzaine.'],
			it: ['Circolo delle sorelle', 'Incontro ogni due settimane.']
		}
	},
	{
		id: ID.youthCourse,
		audience: 'youth',
		room: ID.mainRoom,
		teacher: null,
		teachingLanguages: ['fr', 'de'],
		// Le dernier samedi du mois.
		recurrence: { kind: 'monthly', weekday: 6, ordinal: -1 },
		timing: { kind: 'fixed', start: '18:00', end: '20:00' },
		startsOn: '2026-09-01',
		endsOn: null,
		translations: {
			fr: ['Soirée des jeunes', 'Discussion libre et repas partagé, dernier samedi du mois.'],
			de: ['Jugendabend', 'Offene Diskussion und gemeinsames Essen.']
		}
	},
	// Deux sessions du vendredi, en deux langues différentes : c'est le cas décrit par l'exploitant,
	// et c'est l'information la plus cherchée sur la page d'une organisation (ADR 0033).
	{
		id: ID.jumuaFirst,
		kind: 'jumua',
		jumuaOrder: 1,
		audience: 'open',
		room: ID.mainRoom,
		teacher: null,
		teachingLanguages: ['ar', 'fr'],
		recurrence: { kind: 'weekly', weekdays: [5], interval: 1, anchorDate: '2026-09-04' },
		timing: { kind: 'fixed', start: '12:10', end: '12:50' },
		startsOn: '2026-09-04',
		endsOn: null,
		translations: {
			fr: ['Prière du vendredi', 'Sermon en arabe, traduit en français.'],
			de: ['Freitagsgebet', 'Predigt auf Arabisch, ins Französische übersetzt.'],
			ar: ['صلاة الجمعة', 'خطبة بالعربية مترجمة إلى الفرنسية.']
		}
	},
	{
		id: ID.jumuaSecond,
		kind: 'jumua',
		jumuaOrder: 2,
		audience: 'open',
		room: ID.mainRoom,
		teacher: null,
		teachingLanguages: ['ar'],
		recurrence: { kind: 'weekly', weekdays: [5], interval: 1, anchorDate: '2026-09-04' },
		timing: { kind: 'fixed', start: '13:30', end: '14:10' },
		startsOn: '2026-09-04',
		endsOn: null,
		translations: {
			fr: ['Prière du vendredi', 'Sermon en arabe.'],
			ar: ['صلاة الجمعة', 'خطبة بالعربية.']
		}
	}
];

/**
 * Une période d'horaires saisie à la main : ce que l'organisation affiche sur son panneau (ADR 0004,
 * étape 8). Sans date de fin — « jusqu'à nouvel ordre » —, avec deux iqamas en heure fixe et trois
 * en décalage, pour que les deux formes coexistent comme dans une vraie organisation.
 */
const AUTUMN_PERIOD = {
	id: ID.autumnPeriod,
	name: 'Automne 2026',
	fromDate: '2026-09-01',
	toDate: null,
	// Heures du soleil laissées vides : l'import et le calcul les donnent déjà.
	iqama: {
		fajr: { time: '06:30' },
		dhuhr: { time: '13:00' },
		asr: { offset: 15 },
		maghrib: { offset: 5 },
		isha: { offset: 10 }
	}
};

/** Heures de prière plausibles pour Bienne, données de démonstration et non des heures officielles. */
const PRAYER_DAYS = [
	['2026-09-04', '05:40', '13:22', '16:53', '19:39', '21:09'],
	['2026-09-11', '05:51', '13:19', '16:43', '19:24', '20:54'],
	['2026-09-18', '06:02', '13:17', '16:32', '19:09', '20:39'],
	['2026-09-25', '06:13', '13:14', '16:21', '18:54', '20:24']
];

export async function seed(overrides = {}, env = process.env) {
	const settings = connectionSettings('owner', overrides, env);
	const client = postgres({
		host: settings.host,
		port: settings.port,
		database: settings.database,
		username: settings.user,
		password: settings.password,
		connection: { search_path: 'public' },
		max: 1,
		onnotice: () => {}
	});
	try {
		await client.begin(async (tx) => {
			// Le propriétaire est soumis à la sécurité au niveau des lignes comme les autres
			// (ADR 0019) : ses politiques d'entretien ne s'ouvrent que sous ce drapeau, et il ne
			// vaut que pour cette transaction. Sans lui, les insertions lèveraient — et, pire, les
			// mises à jour rendraient « 0 ligne » sans rien dire.
			await tx`set local jadwal.maintenance = 'on'`;
			await tx`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language", "enabled_language", "plan", "prayer_module")
				values (${ID.organization}, ${ORGANIZATION.slug}, ${ORGANIZATION.name}, ${ORGANIZATION.timeZone},
					${ORGANIZATION.defaultLanguage}, ${ORGANIZATION.languages}, 'sponsored', true)
				on conflict ("id") do update set
					"slug" = excluded."slug", "name" = excluded."name", "time_zone" = excluded."time_zone",
					"accent_color" = excluded."accent_color",
					"default_language" = excluded."default_language",
					"enabled_language" = excluded."enabled_language", "plan" = excluded."plan",
					"status" = excluded."status",
					-- Les données de démonstration portent un cours ancré sur le Maghrib et deux sessions
					-- du vendredi : sans le module, la base les refuse (ADR 0042).
					"prayer_module" = excluded."prayer_module", "updated_at" = now()
			`;
			for (const person of PEOPLE) {
				await tx`
					insert into "user" ("id", "email", "name")
					values (${person.id}, ${person.email}, ${person.name})
					on conflict ("id") do update set
						"email" = excluded."email", "name" = excluded."name",
						"is_super_admin" = excluded."is_super_admin", "updated_at" = now()
				`;
				await tx`
					insert into "membership" ("id", "organization_id", "user_id", "role")
					values (${person.membership}, ${ID.organization}, ${person.id}, ${person.role})
					on conflict ("id") do update set "role" = excluded."role", "updated_at" = now()
				`;
			}
			for (const room of ROOMS) {
				await tx`
					insert into "room" ("id", "organization_id", "name", "display_order")
					values (${room.id}, ${ID.organization}, ${room.name}, ${room.order})
					on conflict ("id") do update set
						"name" = excluded."name", "display_order" = excluded."display_order", "updated_at" = now()
				`;
			}
			for (const course of COURSES) {
				const recurrence = course.recurrence;
				const timing = course.timing;
				await tx`
					insert into "course" (
						"id", "organization_id", "kind", "jumua_order", "status", "audience",
						"teaching_language", "room_id", "teacher",
						"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
						"recurrence_anchor_date", "recurrence_ordinal_weekday", "recurrence_ordinal",
						"recurrence_date", "timing_kind", "timing_start", "timing_end", "timing_prayer",
						"timing_offset_minutes", "timing_duration_minutes", "starts_on", "ends_on", "updated_by"
					) values (
						${course.id}, ${ID.organization}, ${course.kind ?? 'course'},
						${course.jumuaOrder ?? null}, 'published', ${course.audience},
						${course.teachingLanguages}, ${course.room}, ${course.teacher}, 'fr',
						${recurrence.kind},
						${recurrence.kind === 'weekly' ? recurrence.weekdays : null},
						${recurrence.kind === 'weekly' ? recurrence.interval : null},
						${recurrence.kind === 'weekly' ? recurrence.anchorDate : null},
						${recurrence.kind === 'monthly' ? recurrence.weekday : null},
						${recurrence.kind === 'monthly' ? recurrence.ordinal : null},
						${recurrence.kind === 'dates' ? recurrence.dates : null},
						${timing.kind},
						${timing.kind === 'fixed' ? timing.start : null},
						${timing.kind === 'fixed' ? timing.end : null},
						${timing.kind === 'prayer' ? timing.prayer : null},
						${timing.kind === 'prayer' ? timing.offsetMinutes : null},
						${timing.kind === 'prayer' ? timing.durationMinutes : null},
						${course.startsOn}, ${course.endsOn}, ${ID.adminUser}
					)
					on conflict ("id") do update set
						"kind" = excluded."kind", "jumua_order" = excluded."jumua_order",
						"status" = excluded."status", "source_language" = excluded."source_language",
						"sequence" = excluded."sequence", "updated_by" = excluded."updated_by",
						"audience" = excluded."audience", "teaching_language" = excluded."teaching_language",
						"room_id" = excluded."room_id", "teacher" = excluded."teacher",
						"recurrence_kind" = excluded."recurrence_kind",
						"recurrence_weekday" = excluded."recurrence_weekday",
						"recurrence_interval" = excluded."recurrence_interval",
						"recurrence_anchor_date" = excluded."recurrence_anchor_date",
						"recurrence_ordinal_weekday" = excluded."recurrence_ordinal_weekday",
						"recurrence_ordinal" = excluded."recurrence_ordinal",
						"recurrence_date" = excluded."recurrence_date",
						"timing_kind" = excluded."timing_kind", "timing_start" = excluded."timing_start",
						"timing_end" = excluded."timing_end", "timing_prayer" = excluded."timing_prayer",
						"timing_offset_minutes" = excluded."timing_offset_minutes",
						"timing_duration_minutes" = excluded."timing_duration_minutes",
						"starts_on" = excluded."starts_on", "ends_on" = excluded."ends_on",
						"updated_at" = now()
				`;
				for (const [language, [title, description]] of Object.entries(course.translations)) {
					await tx`
						insert into "course_translation" ("id", "organization_id", "course_id", "language", "title", "description")
						values (${translationId(course.id, language)}, ${ID.organization}, ${course.id},
							${language}, ${title}, ${description})
						on conflict ("course_id", "language") do update set
							"title" = excluded."title", "description" = excluded."description", "updated_at" = now()
					`;
				}
			}
			// Une séance annulée et une séance déplacée, sur le cours d'arabe.
			await tx`
				insert into "session_exception" ("id", "organization_id", "course_id", "date", "kind", "created_by")
				values (${ID.cancelled}, ${ID.organization}, ${ID.arabicCourse}, '2026-09-21', 'cancelled', ${ID.editorUser})
				on conflict ("course_id", "date") do update set
					"kind" = excluded."kind", "to_date" = excluded."to_date",
					"to_start" = excluded."to_start", "created_by" = excluded."created_by"
			`;
			await tx`
				insert into "session_exception" ("id", "organization_id", "course_id", "date", "kind", "to_date", "to_start", "created_by")
				values (${ID.moved}, ${ID.organization}, ${ID.arabicCourse}, '2026-10-05', 'moved', '2026-10-06', '18:00', ${ID.editorUser})
				on conflict ("course_id", "date") do update set
					"kind" = excluded."kind", "to_date" = excluded."to_date",
					"to_start" = excluded."to_start", "created_by" = excluded."created_by"
			`;
			// Une pause de toute l'organisation, et une pause d'un seul cours.
			await tx`
				insert into "pause" ("id", "organization_id", "course_id", "from_date", "to_date", "reason", "created_by")
				values (${ID.holidayPause}, ${ID.organization}, null, '2026-12-21', '2027-01-04',
					'Vacances scolaires', ${ID.adminUser})
				on conflict ("id") do update set
					"from_date" = excluded."from_date", "to_date" = excluded."to_date",
					"reason" = excluded."reason", "created_by" = excluded."created_by"
			`;
			await tx`
				insert into "pause" ("id", "organization_id", "course_id", "from_date", "to_date", "reason", "created_by")
				values (${ID.arabicPause}, ${ID.organization}, ${ID.arabicCourse}, '2027-02-15', '2027-02-21',
					'Absence de l''intervenante', ${ID.adminUser})
				on conflict ("id") do update set
					"from_date" = excluded."from_date", "to_date" = excluded."to_date",
					"reason" = excluded."reason", "created_by" = excluded."created_by"
			`;
			for (const [date, fajr, dhuhr, asr, maghrib, isha] of PRAYER_DAYS) {
				await tx`
					insert into "prayer_day" ("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib", "isha", "source")
					values (${ID.organization}, ${date}, ${fajr}, ${dhuhr}, ${asr}, ${maghrib}, ${isha}, 'import')
					on conflict ("organization_id", "date") do update set
						"fajr" = excluded."fajr", "dhuhr" = excluded."dhuhr", "asr" = excluded."asr",
						"maghrib" = excluded."maghrib", "isha" = excluded."isha",
						"source" = excluded."source"
				`;
			}
			// La période d'horaires saisie à la main : elle passe avant l'import et le calcul.
			await tx`
				insert into "prayer_period" (
					"id", "organization_id", "name", "from_date", "to_date",
					"fajr_iqama", "dhuhr_iqama",
					"asr_iqama_offset", "maghrib_iqama_offset", "isha_iqama_offset"
				) values (
					${AUTUMN_PERIOD.id}, ${ID.organization}, ${AUTUMN_PERIOD.name},
					${AUTUMN_PERIOD.fromDate}, ${AUTUMN_PERIOD.toDate},
					${AUTUMN_PERIOD.iqama.fajr.time}, ${AUTUMN_PERIOD.iqama.dhuhr.time},
					${AUTUMN_PERIOD.iqama.asr.offset}, ${AUTUMN_PERIOD.iqama.maghrib.offset},
					${AUTUMN_PERIOD.iqama.isha.offset}
				)
				on conflict ("id") do update set
					"name" = excluded."name", "from_date" = excluded."from_date",
					"to_date" = excluded."to_date",
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
			`;
			// Les colonnes absentes de la liste d'insertion valent leur défaut, et `excluded` les porte :
			// un réglage changé à la main revient donc à l'état de démonstration au prochain passage.
			await tx`
				insert into "prayer_settings" ("organization_id") values (${ID.organization})
				on conflict ("organization_id") do update set
					"latitude" = excluded."latitude", "longitude" = excluded."longitude",
					"method" = excluded."method", "madhab" = excluded."madhab",
					"high_latitude_rule" = excluded."high_latitude_rule",
					"source" = excluded."source",
					"fajr_adjustment" = excluded."fajr_adjustment",
					"dhuhr_adjustment" = excluded."dhuhr_adjustment",
					"asr_adjustment" = excluded."asr_adjustment",
					"maghrib_adjustment" = excluded."maghrib_adjustment",
					"isha_adjustment" = excluded."isha_adjustment",
					"updated_at" = now()
			`;
		});
		const jumua = COURSES.filter((course) => course.kind === 'jumua').length;
		return {
			organization: ID.organization,
			courses: COURSES.length - jumua,
			jumua,
			rooms: ROOMS.length
		};
	} finally {
		await client.end({ timeout: 5 });
	}
}

/**
 * Identifiant stable d'une traduction : un espace d'identifiants à part, indexé par le rang du
 * cours et par la langue, pour que le script reste rejouable à l'identique.
 */
const LANGUAGE_DIGIT = { fr: '1', de: '2', it: '3', ar: '4' };

function translationId(courseId, language) {
	const courseIndex = COURSES.findIndex((course) => course.id === courseId);
	const digit = LANGUAGE_DIGIT[language];
	if (courseIndex < 0 || !digit) {
		throw new Error(`Unknown demo course or language: ${courseId} / ${language}`);
	}
	// Dernier groupe de douze chiffres : dix fixes, puis le rang du cours et la langue.
	const id = `01930000-0000-7000-8000-0000000001${courseIndex + 1}${digit}`;
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
		throw new Error(`Malformed demo translation id: ${id}`);
	}
	return id;
}

if (isMainModule(import.meta.filename)) {
	const result = await seed();
	process.stdout.write(
		`données de démonstration en place : ${result.courses} cours, ${result.jumua} sessions du ` +
			`vendredi, ${result.rooms} salles\n`
	);
}

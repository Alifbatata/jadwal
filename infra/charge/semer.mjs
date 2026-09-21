// Vingt organisations de quarante cours, pour mesurer la charge (étape 9).
//
// Ce script **n'est pas** le script de démonstration : il ne sert qu'à mesurer, il écrit dans la
// base de développement, et il nomme tout `charge-*` pour qu'on puisse le retirer d'un coup. Il ne
// tourne jamais en production.
//
// Usage : node infra/charge/semer.mjs [--organisations 20] [--cours 40] [--effacer]

import postgres from 'postgres';
import { connectionSettings, loadDotEnv } from '@jadwal/db';
import { v7 as uuidv7 } from 'uuid';

loadDotEnv();

function nombre(nom, defaut) {
	const index = process.argv.indexOf(`--${nom}`);
	if (index < 0) return defaut;
	const valeur = Number(process.argv[index + 1]);
	return Number.isFinite(valeur) && valeur > 0 ? Math.floor(valeur) : defaut;
}

const ORGANISATIONS = nombre('organisations', 20);
const COURS = nombre('cours', 40);
const EFFACER = process.argv.includes('--effacer');

/** Une graine fixe : deux exécutions produisent les mêmes identifiants, donc les mêmes mesures. */
const PREFIXE = 'charge-';

const settings = connectionSettings('owner', {}, process.env);
const sql = postgres({
	host: settings.host,
	port: settings.port,
	database: settings.database,
	username: settings.user,
	password: settings.password,
	connection: { search_path: 'public' },
	max: 1,
	onnotice: () => {}
});

/** Un rythme parmi quatre, pour que l'expansion ne suive pas toujours le même chemin. */
function rythme(index) {
	if (index % 4 === 0) return { kind: 'weekly', weekdays: [1, 3], interval: 1 };
	if (index % 4 === 1) return { kind: 'weekly', weekdays: [(index % 7) + 1], interval: 2 };
	if (index % 4 === 2) return { kind: 'monthly', weekday: (index % 7) + 1, ordinal: -1 };
	return { kind: 'weekly', weekdays: [5, 6], interval: 1 };
}

/** Un horaire sur deux est ancré sur une prière : c'est le chemin le plus coûteux. */
function horaire(index) {
	const prieres = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
	if (index % 2 === 0) return { kind: 'fixed', start: '19:00', end: '20:30' };
	return { kind: 'prayer', prayer: prieres[index % 5], offsetMinutes: 15, durationMinutes: 60 };
}

async function effacer(tx) {
	const slugs = Array.from({ length: 200 }, (_, index) => `${PREFIXE}${index + 1}`);
	await tx`delete from "organization" where "slug" = any(${slugs})`;
}

await sql.begin(async (tx) => {
	await tx`set local jadwal.maintenance = 'on'`;
	await effacer(tx);
	if (EFFACER) return;

	for (let numero = 1; numero <= ORGANISATIONS; numero += 1) {
		const orgId = uuidv7();
		const salleId = uuidv7();
		const slug = `${PREFIXE}${numero}`;
		await tx`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language")
			values (${orgId}, ${slug}, ${`Mosquée de charge ${numero}`}, 'Europe/Zurich', 'fr',
				array['fr','de','it','ar'])
		`;
		await tx`
			insert into "room" ("id", "organization_id", "name", "display_order")
			values (${salleId}, ${orgId}, 'Grande salle', 1)
		`;
		// Une année d'heures de prière : les cours ancrés en ont besoin, et c'est aussi ce qui
		// rend la lecture représentative — la résolution des trois sources porte sur ces lignes.
		await tx`
			insert into "prayer_day" ("organization_id", "date", "fajr", "dhuhr", "asr", "maghrib",
				"isha", "source")
			select ${orgId}, jour::date, '05:40', '13:20', '16:50', '19:27', '21:00', 'import'
			from generate_series(current_date - 30, current_date + 370, interval '1 day') as jour
		`;
		await tx`insert into "prayer_settings" ("organization_id") values (${orgId})`;
		await tx`
			insert into "prayer_period" ("id", "organization_id", "name", "from_date", "maghrib_iqama_offset")
			values (${uuidv7()}, ${orgId}, 'Toute l''année', current_date - 60, 5)
		`;

		for (let index = 0; index < COURS; index += 1) {
			const coursId = uuidv7();
			const r = rythme(index);
			const h = horaire(index);
			await tx`
				insert into "course" (
					"id", "organization_id", "status", "audience", "teaching_language", "room_id",
					"source_language", "recurrence_kind", "recurrence_weekday", "recurrence_interval",
					"recurrence_anchor_date", "recurrence_ordinal_weekday", "recurrence_ordinal",
					"timing_kind", "timing_start", "timing_end", "timing_prayer",
					"timing_offset_minutes", "timing_duration_minutes", "starts_on"
				) values (
					${coursId}, ${orgId}, 'published', 'open', array['fr'], ${salleId}, 'fr',
					${r.kind},
					${r.kind === 'weekly' ? r.weekdays : null},
					${r.kind === 'weekly' ? r.interval : null},
					${r.kind === 'weekly' ? '2026-01-05' : null},
					${r.kind === 'monthly' ? r.weekday : null},
					${r.kind === 'monthly' ? r.ordinal : null},
					${h.kind},
					${h.kind === 'fixed' ? h.start : null},
					${h.kind === 'fixed' ? h.end : null},
					${h.kind === 'prayer' ? h.prayer : null},
					${h.kind === 'prayer' ? h.offsetMinutes : null},
					${h.kind === 'prayer' ? h.durationMinutes : null},
					'2026-01-05'
				)
			`;
			await tx`
				insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
				values (${uuidv7()}, ${orgId}, ${coursId}, 'fr', ${`Cours ${index + 1} de la mosquée ${numero}`})
			`;
		}
	}
});

process.stdout.write(
	EFFACER
		? 'données de charge effacées\n'
		: `${ORGANISATIONS} organisations de ${COURS} cours en place (identifiants ${PREFIXE}1…${PREFIXE}${ORGANISATIONS})\n`
);
await sql.end();

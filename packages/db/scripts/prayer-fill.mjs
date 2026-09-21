// La tâche quotidienne des heures de prière (ADR 0004).
//
// Elle recalcule la fenêtre glissante de chaque organisation qui a une position. Elle est
// **idempotente** : relancée dans la même journée, elle n'écrit rien du tout — la clause
// `is distinct from` de l'écriture y veille, et c'est aussi ce qui empêche l'empreinte de cache des
// flux agenda de bouger pour rien.
//
// Elle tourne sous le rôle propriétaire, comme les purges : il est le seul à pouvoir traverser
// toutes les organisations. Sa programmation viendra à l'étape 8 ; d'ici là elle se lance à la main :
//
//   pnpm --filter @jadwal/db run prayer-fill
//
// Un jour importé n'est jamais touché : ce n'est pas une précaution de ce script, c'est la clause
// `where` de l'écriture, dans `src/prayer.ts`.

// Les dépendances du paquet viennent de `@jadwal/db` — son propre nom — et non de `../src/*.ts`.
// Node refuse de retirer les types d'un fichier situé sous `node_modules`, et l'image de
// production, elle, y met ce paquet : un script qui importerait la source ne démarrerait pas
// sur le serveur. Il faut donc que `dist/` soit construit avant de lancer ces scripts à la main
// (`pnpm build`) ; la CI et l'image le font déjà, dans cet ordre (ADR 0034).
import { todayInZone } from '@jadwal/core';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { isMainModule } from './is-main.mjs';
import { connectionSettings, fillPrayerDays, loadDotEnv } from '@jadwal/db';

loadDotEnv();

export async function fillAllPrayerDays({ overrides = {}, now = new Date() } = {}) {
	const settings = connectionSettings('owner', overrides);
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
	const db = drizzle(client);
	const rapport = [];
	try {
		// Le propriétaire n'écrit que sous son drapeau d'entretien (ADR 0019). Une seule transaction
		// par organisation : une mosquée dont le calcul échoue n'empêche pas les autres d'aboutir.
		const organisations = await db.execute(sql`
			select o."id", o."slug", o."time_zone", s."latitude", s."longitude", s."method",
				s."madhab", s."high_latitude_rule", s."fajr_adjustment", s."dhuhr_adjustment",
				s."asr_adjustment", s."maghrib_adjustment", s."isha_adjustment"
			from "organization" o
			join "prayer_settings" s on s."organization_id" = o."id"
			where s."latitude" is not null
			order by o."slug"
		`);
		const lignes = Array.isArray(organisations) ? organisations : (organisations.rows ?? []);
		for (const ligne of lignes) {
			const stored = {
				organizationId: String(ligne.id),
				timeZone: String(ligne.time_zone),
				latitude: Number(ligne.latitude),
				longitude: Number(ligne.longitude),
				method: ligne.method === null ? null : String(ligne.method),
				madhab: String(ligne.madhab),
				highLatitudeRule: String(ligne.high_latitude_rule),
				fajrAdjustment: Number(ligne.fajr_adjustment),
				dhuhrAdjustment: Number(ligne.dhuhr_adjustment),
				asrAdjustment: Number(ligne.asr_adjustment),
				maghribAdjustment: Number(ligne.maghrib_adjustment),
				ishaAdjustment: Number(ligne.isha_adjustment)
			};
			const today = todayInZone(stored.timeZone, now);
			const resultat = await db.transaction(async (tx) => {
				await tx.execute(sql`set local jadwal.maintenance = 'on'`);
				return fillPrayerDays(tx, stored, today);
			});
			rapport.push({ slug: String(ligne.slug), ...resultat });
		}
		return rapport;
	} finally {
		await client.end({ timeout: 5 });
	}
}

if (isMainModule(import.meta.filename)) {
	const rapport = await fillAllPrayerDays();
	if (rapport.length === 0) {
		process.stdout.write('aucune organisation avec une position : rien à calculer\n');
	}
	for (const ligne of rapport) {
		process.stdout.write(
			`${ligne.slug} : ${ligne.calcules} jours calculés, ${ligne.ecrites} écrits\n`
		);
	}
}

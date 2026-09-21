// Réglages de l'organisation : nom, fuseau, couleur, langues, salles, formule d'accueil.
//
// Réservé aux responsables (`org_admin`). Un `editor` n'y entre pas — et ce n'est pas seulement
// l'écran qui le dit : la base accorde les mêmes droits aux deux rôles, la distinction est ici.
// C'est un choix assumé de l'étape 3, et le test le vérifie route par route.

import { fail } from '@sveltejs/kit';
import { newId, sql } from '@jadwal/db';
import { record } from '$lib/server/audit.js';
import { withSessionOrg } from '$lib/server/context.js';
import { mustAdminister } from '$lib/server/guard.js';
import { readRooms, readSettings } from '$lib/server/programme.js';
import type { Actions, PageServerLoad } from './$types.js';

/** Les langues que l'interface sait afficher (ADR 0007). */
const LANGUES = ['fr', 'de', 'it', 'ar'] as const;
const COULEUR = /^#[0-9a-fA-F]{6}$/;

export const load: PageServerLoad = async (event) => {
	const context = await mustAdminister(event);
	return withSessionOrg(context, async (tx) => {
		const settings = await readSettings(tx);
		return {
			organisation: settings,
			salles: await readRooms(tx),
			languesPossibles: LANGUES
		};
	});
};

export const actions: Actions = {
	enregistrer: async (event) => {
		const context = await mustAdminister(event);
		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim();
		const timeZone = String(form.get('timeZone') ?? '').trim();
		const accentColor = String(form.get('accentColor') ?? '').trim();
		const greeting = String(form.get('greeting') ?? '').trim();
		const langues = form
			.getAll('enabledLanguages')
			.map((value) => String(value))
			.filter((value) => (LANGUES as readonly string[]).includes(value));
		const defaultLanguage = String(form.get('defaultLanguage') ?? '');

		if (name.length === 0) return fail(400, { erreur: 'Le nom est obligatoire.' });
		if (!COULEUR.test(accentColor)) {
			return fail(400, { erreur: 'La couleur s’écrit en hexadécimal, par exemple #0f766e.' });
		}
		if (greeting.length === 0) {
			return fail(400, { erreur: 'La formule d’accueil ne peut pas être vide.' });
		}
		if (langues.length === 0) return fail(400, { erreur: 'Activez au moins une langue.' });
		if (!langues.includes(defaultLanguage)) {
			return fail(400, { erreur: 'La langue par défaut doit faire partie des langues activées.' });
		}
		// Le fuseau est vérifié par la bibliothèque du système : un nom inventé lève ici, avant
		// d'être écrit, plutôt que de faire échouer tous les calculs de dates plus tard.
		try {
			new Intl.DateTimeFormat('fr', { timeZone });
		} catch {
			return fail(400, { erreur: 'Ce fuseau horaire n’existe pas.' });
		}

		const literal = langues.map((langue) => `'${langue}'`).join(',');
		const ok = await withSessionOrg(context, async (tx) => {
			const before = await readSettings(tx);
			const touched = await tx.execute(sql`
				update "organization" set "name" = ${name}, "time_zone" = ${timeZone},
					"accent_color" = ${accentColor}, "greeting" = ${greeting},
					"enabled_language" = ${sql.raw(`array[${literal}]::text[]`)},
					"default_language" = ${defaultLanguage}, "updated_at" = now()
				where "id" = ${context.organizationId}
				returning "id"
			`);
			const rows = Array.isArray(touched)
				? touched
				: ((touched as { rows?: unknown[] }).rows ?? []);
			if (rows.length === 0) return false;
			await record(tx, context.organizationId, context.userId, {
				action: 'organization.settings',
				targetTable: 'organization',
				targetId: context.organizationId,
				before: {
					name: before.name,
					time_zone: before.time_zone,
					accent_color: before.accent_color,
					greeting: before.greeting,
					enabled_language: before.enabled_language,
					default_language: before.default_language
				},
				after: {
					name,
					time_zone: timeZone,
					accent_color: accentColor,
					greeting,
					enabled_language: langues,
					default_language: defaultLanguage
				}
			});
			return true;
		});
		if (!ok) return fail(404, { erreur: 'Cette organisation n’existe plus.' });
		return { enregistre: true };
	},

	ajouterSalle: async (event) => {
		const context = await mustAdminister(event);
		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (name.length === 0) return fail(400, { erreur: 'Le nom de la salle est obligatoire.' });
		const id = newId();
		await withSessionOrg(context, async (tx) => {
			await tx.execute(sql`
				insert into "room" ("id", "organization_id", "name", "display_order")
				values (${id}, ${context.organizationId}, ${name},
					coalesce((select max("display_order") + 1 from "room"), 0))
			`);
			await record(tx, context.organizationId, context.userId, {
				action: 'room.create',
				targetTable: 'room',
				targetId: id,
				after: { name }
			});
		});
		return { salleAjoutee: true };
	},

	supprimerSalle: async (event) => {
		const context = await mustAdminister(event);
		const form = await event.request.formData();
		const roomId = String(form.get('roomId') ?? '');
		await withSessionOrg(context, async (tx) => {
			await tx.execute(sql`delete from "room" where "id" = ${roomId}`);
			await record(tx, context.organizationId, context.userId, {
				action: 'room.delete',
				targetTable: 'room',
				targetId: roomId
			});
		});
		return { salleSupprimee: true };
	}
};

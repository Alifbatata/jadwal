// Réglages de l'organisation : nom, fuseau, couleur, langues, salles, formule d'accueil.
//
// Réservé aux responsables (`org_admin`). Un `editor` n'y entre pas : l'écran le renvoie à
// l'accueil, et depuis la migration 0059 la base refuse aussi ses écritures sur l'organisation et
// les salles (ADR 0046). Le test le vérifie route par route.
//
// Les actions rendent le nom d'une erreur, jamais sa phrase : la page l'écrit dans la langue de
// l'écran (`$lib/i18n/settings.ts`, étape 18).

import { fail } from '@sveltejs/kit';
import { newId, sql } from '@jadwal/db';
// Les langues qu'on peut activer sont celles des pages publiques (ADR 0007), lues dans la liste
// commune. L'écran en gardait une copie à quatre langues : l'anglais, ajouté à l'étape 18, n'y était
// pas, et un « en » envoyé par le formulaire était retiré sans rien dire.
import { LANGUES } from '$lib/i18n.js';
import { record } from '$lib/server/audit.js';
import { withSessionOrg } from '$lib/server/context.js';
import { mustAdminister } from '$lib/server/guard.js';
import { readSettings } from '$lib/server/programme.js';
import type { Actions, PageServerLoad } from './$types.js';

const COULEUR = /^#[0-9a-fA-F]{6}$/;

type Transaction = Parameters<Parameters<typeof withSessionOrg>[1]>[0];

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

/** Ce qui retient le module allumé, en une requête (ADR 0042). */
async function somethingHoldsThePrayerModule(tx: Transaction): Promise<boolean> {
	const lignes = rows<{ combien: number | string }>(
		await tx.execute(sql`
			select count(*) as "combien" from "course"
			where "timing_kind" = 'prayer' or "kind" = 'jumua'
		`)
	);
	return Number(lignes[0]?.combien ?? 0) > 0;
}

/**
 * Une salle, et ce qui l'occupe : les cours d'un côté, les prières du vendredi de l'autre, parce que
 * l'écran les nomme chacun. Tous les états comptent, brouillons compris : la suppression de la salle
 * vide la salle de chacun (migration 0061).
 */
interface RoomInUse {
	id: string;
	name: string;
	courses: number;
	fridays: number;
}

/** Les salles de l'organisation, dans leur ordre, avec ce qui les occupe. */
async function readRoomsInUse(tx: Transaction, roomId?: string): Promise<RoomInUse[]> {
	const filtre = roomId === undefined ? sql`true` : sql`r."id" = ${roomId}`;
	return rows<{ id: string; name: string; courses: number | string; fridays: number | string }>(
		await tx.execute(sql`
			select r."id", r."name",
				count(c."id") filter (where c."kind" <> 'jumua') as "courses",
				count(c."id") filter (where c."kind" = 'jumua') as "fridays"
			from "room" r left join "course" c on c."room_id" = r."id"
			where ${filtre}
			group by r."id", r."name", r."display_order"
			order by r."display_order", r."name"
		`)
	).map((ligne) => ({
		id: ligne.id,
		name: ligne.name,
		courses: Number(ligne.courses),
		fridays: Number(ligne.fridays)
	}));
}

export const load: PageServerLoad = async (event) => {
	const context = await mustAdminister(event);
	return withSessionOrg(context, async (tx) => {
		const settings = await readSettings(tx);
		return {
			organisation: settings,
			salles: await readRoomsInUse(tx),
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

		if (name.length === 0) return fail(400, { error: 'nameRequired' as const });
		if (!COULEUR.test(accentColor)) return fail(400, { error: 'colour' as const });
		if (greeting.length === 0) return fail(400, { error: 'greetingRequired' as const });
		if (langues.length === 0) return fail(400, { error: 'noLanguage' as const });
		if (!langues.includes(defaultLanguage)) {
			return fail(400, { error: 'defaultNotEnabled' as const });
		}
		// Le fuseau est vérifié par la bibliothèque du système : un nom inventé lève ici, avant
		// d'être écrit, plutôt que de faire échouer tous les calculs de dates plus tard.
		try {
			new Intl.DateTimeFormat('fr', { timeZone });
		} catch {
			return fail(400, { error: 'timeZone' as const });
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
			if (rows(touched).length === 0) return false;
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
		if (!ok) return fail(404, { error: 'gone' as const });
		return { enregistre: true };
	},

	/**
	 * Le module des heures de prière (ADR 0042).
	 *
	 * L'écran compte lui-même ce qui bloque, pour le nommer : la base refuse l'extinction tant
	 * qu'un cours est ancré sur une prière ou qu'une session du vendredi existe, mais son message
	 * est celui d'un déclencheur, pas celui qu'on montre à quelqu'un. Le refus de la base reste la
	 * vérité : il est attrapé plus bas, au cas où la ligne serait créée entre le compte et l'écriture.
	 */
	modulePrieres: async (event) => {
		const context = await mustAdminister(event);
		const form = await event.request.formData();
		const allume = String(form.get('allume') ?? '') === 'oui';
		try {
			const retenu = await withSessionOrg(context, async (tx) => {
				if (!allume && (await somethingHoldsThePrayerModule(tx))) return true;
				await tx.execute(sql`
					update "organization" set "prayer_module" = ${allume}, "updated_at" = now()
					where "id" = ${context.organizationId}
				`);
				await record(tx, context.organizationId, context.userId, {
					action: 'organization.prayer_module',
					targetTable: 'organization',
					targetId: context.organizationId,
					before: { prayer_module: !allume },
					after: { prayer_module: allume }
				});
				return false;
			});
			if (retenu) return fail(409, { error: 'prayerStillUsed' as const });
		} catch (cause) {
			if (String(cause).includes('prayer_module_still_used')) {
				return fail(409, { error: 'prayerStillUsed' as const });
			}
			throw cause;
		}
		// La page dit ce qui est fait, et non « mis à jour » : allumées ou éteintes.
		return { moduleChange: true, allume };
	},

	ajouterSalle: async (event) => {
		const context = await mustAdminister(event);
		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (name.length === 0) return fail(400, { error: 'roomNameRequired' as const });
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

	/**
	 * Supprimer une salle. Si des cours ou des prières du vendredi l'occupent, le premier envoi ne
	 * supprime rien : l'écran dit combien la perdront, et propose de confirmer (étape 18). La base ne
	 * vide que la salle de ces cours, qui gardent tout le reste (migration 0061). Une salle libre part
	 * dès le premier envoi.
	 */
	supprimerSalle: async (event) => {
		const context = await mustAdminister(event);
		const form = await event.request.formData();
		const roomId = String(form.get('roomId') ?? '');
		const confirme = String(form.get('confirm') ?? '') === 'yes';
		const occupee = await withSessionOrg(context, async (tx) => {
			if (!confirme) {
				const [salle] = await readRoomsInUse(tx, roomId);
				if (salle && salle.courses + salle.fridays > 0) return salle;
			}
			const supprimees = rows<{ id: string }>(
				await tx.execute(sql`delete from "room" where "id" = ${roomId} returning "id"`)
			);
			if (supprimees.length > 0) {
				await record(tx, context.organizationId, context.userId, {
					action: 'room.delete',
					targetTable: 'room',
					targetId: roomId
				});
			}
			return null;
		});
		if (occupee) return fail(409, { roomInUse: occupee });
		return { salleSupprimee: true };
	}
};

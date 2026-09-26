// L'espace du super-admin : créer et suspendre des organisations, attribuer le plan, entrer dans
// l'espace d'une organisation avec tous les pouvoirs, produire un lien de connexion de secours.
//
// Depuis l'étape 4, il n'y a plus de fenêtre d'accès à ouvrir : il lit et écrit partout, à tout
// moment (ADR 0025). Ce que cela coûte est écrit dans `docs/SECURITE.md`, et ce que les
// organisations en savent dans `docs/CONDITIONS.md`.
//
// Deux garde-fous demeurent, et ils ne sont pas cosmétiques : aucun pouvoir sans session ouverte
// par passkey, et une organisation à la fois — celle de la session, rappelée par une bannière.
//
// Les actions rendent le nom d'une erreur, jamais sa phrase : la page l'écrit dans la langue de
// l'espace (`i18n/super-admin.ts`, étape 18).

import { fail, redirect } from '@sveltejs/kit';
import { newId, sql } from '@jadwal/db';
import { auth, captureMagicLink } from '$lib/server/auth.js';
import { chooseOrganisation, recordAdminAccess } from '$lib/server/context.js';
import { superAdminDatabase } from '$lib/server/database.js';
import { mustBeSuperAdmin } from '$lib/server/guard.js';
import { isPublicAddress, proposePublicAddress } from './public-address.js';
import { DEFAULT_TIME_ZONE, isOfferedTimeZone, timeZoneChoices } from './time-zones.server.js';
import type { Actions, PageServerLoad } from './$types.js';

const PLANS = ['free', 'sponsored', 'paid'] as const;
const STATUTS = ['active', 'suspended'] as const;
const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/**
 * Un identifiant d'organisation. Autre chose n'atteint pas la base, qui le refuserait en erreur du
 * serveur : c'est une organisation inconnue, et l'écran le dit comme tel.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

/** Le code SQLSTATE d'une erreur du pilote, lu dans la cause comme ailleurs dans le dépôt. */
function codeSql(error: unknown): string | undefined {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
		const code = (current as { code?: unknown }).code;
		if (typeof code === 'string') return code;
		current = (current as { cause?: unknown }).cause;
	}
	return undefined;
}

/**
 * Le début de l'adresse d'une page publique, tel que l'écran l'écrit : l'hôte de l'origine publique
 * du service (`ORIGIN`, que l'adaptateur donne à `event.url`), sans le protocole, puis `/m/`.
 */
function publicPrefix(url: URL): string {
	return `${url.host}/m/`;
}

export const load: PageServerLoad = async (event) => {
	mustBeSuperAdmin(event);
	return {
		organisations: rows<{
			id: string;
			slug: string;
			name: string;
			plan: string;
			status: string;
		}>(
			await superAdminDatabase().execute(sql`
				select "id", "slug", "name", "plan", "status" from "organization" order by "name"
			`)
		),
		plans: PLANS,
		statuts: STATUTS,
		timeZones: timeZoneChoices(),
		defaultTimeZone: DEFAULT_TIME_ZONE,
		publicPrefix: publicPrefix(event.url)
	};
};

export const actions: Actions = {
	/** Créer une organisation. Le nom de l'action date d'avant l'étape 18, où l'écran disait « ouvrir ». */
	ouvrir: async (event) => {
		mustBeSuperAdmin(event);
		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim();
		const written = String(form.get('slug') ?? '').trim();
		const timeZone = String(form.get('timeZone') ?? '').trim();
		// Ce que la personne a saisi revient dans le formulaire, pour qu'une erreur ne l'efface pas.
		const values = { name, slug: written, timeZone };
		if (name.length === 0) return fail(400, { error: 'nameRequired' as const, values });
		// Sans JavaScript, le champ arrive vide : le serveur propose l'adresse comme l'écran l'aurait
		// fait pendant la frappe. Une adresse écrite, elle, est gardée telle quelle et vérifiée.
		const slug = written || proposePublicAddress(name);
		if (slug === '') return fail(400, { error: 'noAddressFromName' as const, values });
		if (!isPublicAddress(slug)) return fail(400, { error: 'invalidAddress' as const, values });
		if (!isOfferedTimeZone(timeZone)) {
			return fail(400, { error: 'unknownTimeZone' as const, values });
		}
		try {
			await superAdminDatabase().execute(sql`
				insert into "organization" ("id", "slug", "name", "time_zone", "default_language", "enabled_language")
				values (${newId()}, ${slug}, ${name}, ${timeZone}, 'fr', array['fr'])
			`);
		} catch (cause) {
			// L'adresse est unique dans la base (`organization_slug_uq`) : une adresse déjà prise se dit,
			// au lieu de finir en erreur du serveur.
			if (codeSql(cause) === '23505') {
				return fail(400, { error: 'addressTaken' as const, values });
			}
			throw cause;
		}
		return { created: { name, address: `${publicPrefix(event.url)}${slug}` } };
	},

	plan: async (event) => {
		mustBeSuperAdmin(event);
		const form = await event.request.formData();
		const organizationId = String(form.get('organizationId') ?? '');
		const plan = String(form.get('plan') ?? '');
		if (!(PLANS as readonly string[]).includes(plan)) {
			return fail(400, { error: 'unknownPlan' as const });
		}
		if (!UUID.test(organizationId)) return fail(404, { error: 'unknownOrganisation' as const });
		const touched = rows<{ name: string }>(
			await superAdminDatabase().execute(
				sql`update "organization" set "plan" = ${plan}, "updated_at" = now()
					where "id" = ${organizationId} returning "name"`
			)
		);
		if (touched.length === 0) return fail(404, { error: 'unknownOrganisation' as const });
		return { planSaved: touched[0]?.name ?? '' };
	},

	statut: async (event) => {
		mustBeSuperAdmin(event);
		const form = await event.request.formData();
		const organizationId = String(form.get('organizationId') ?? '');
		const status = String(form.get('status') ?? '');
		if (!(STATUTS as readonly string[]).includes(status)) {
			return fail(400, { error: 'unknownStatus' as const });
		}
		if (!UUID.test(organizationId)) return fail(404, { error: 'unknownOrganisation' as const });
		const touched = rows<{ name: string }>(
			await superAdminDatabase().execute(
				sql`update "organization" set "status" = ${status}, "updated_at" = now()
					where "id" = ${organizationId} returning "name"`
			)
		);
		if (touched.length === 0) return fail(404, { error: 'unknownOrganisation' as const });
		return { statusSaved: touched[0]?.name ?? '' };
	},

	/** Entrer dans l'espace d'une organisation. Le contexte est posé sur la session, jamais sur l'URL. */
	entrer: async (event) => {
		const person = mustBeSuperAdmin(event);
		const form = await event.request.formData();
		const organizationId = String(form.get('organizationId') ?? '');
		if (!UUID.test(organizationId) || !(await chooseOrganisation(person, organizationId))) {
			return fail(404, { error: 'unknownOrganisation' as const });
		}
		redirect(303, '/');
	},

	/**
	 * Lien de connexion de secours : le service doit rester utilisable même si le courriel tombe
	 * entièrement (ADR 0024). Le lien a la même durée de vie et le même usage unique qu'un lien
	 * envoyé ; il s'affiche à l'écran et se transmet par un autre canal. Il ouvre une session par
	 * lien magique, donc sans aucun pouvoir de super-admin (ADR 0025), et crée un compte sans
	 * organisation pour une adresse qui n'en a pas. Chaque production est inscrite au registre
	 * interne.
	 */
	lienSecours: async (event) => {
		const person = mustBeSuperAdmin(event);
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		if (!ADRESSE.test(email)) return fail(400, { error: 'invalidEmail' as const });
		const link = await captureMagicLink(() =>
			auth().api.signInMagicLink({
				body: { email, callbackURL: '/organisations' },
				// L'API serveur exige des en-têtes : ce sont ceux de la requête en cours, ce qui fait
				// aussi que la limitation de débit voit la bonne adresse IP.
				headers: event.request.headers
			})
		);
		await recordAdminAccess(person, 'magic_link', event.url.pathname);
		if (!link) return fail(500, { error: 'linkFailed' as const });
		return { link, email };
	}
};

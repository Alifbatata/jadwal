// L'espace du super-admin : ouvrir et fermer des organisations, attribuer le plan, entrer dans
// l'espace d'une organisation avec tous les pouvoirs, produire un lien de connexion de secours.
//
// Depuis l'étape 4, il n'y a plus de fenêtre d'accès à ouvrir : il lit et écrit partout, à tout
// moment (ADR 0025). Ce que cela coûte est écrit dans `docs/SECURITE.md`, et ce que les
// organisations en savent dans `docs/CONDITIONS.md`.
//
// Deux garde-fous demeurent, et ils ne sont pas cosmétiques : aucun pouvoir sans session ouverte
// par passkey, et une organisation à la fois — celle de la session, rappelée par une bannière.

import { fail, redirect } from '@sveltejs/kit';
import { newId, sql } from '@jadwal/db';
import { auth, captureMagicLink } from '$lib/server/auth.js';
import { chooseOrganisation, recordAdminAccess } from '$lib/server/context.js';
import { superAdminDatabase } from '$lib/server/database.js';
import { mustBeSuperAdmin } from '$lib/server/guard.js';
import type { Actions, PageServerLoad } from './$types.js';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PLANS = ['free', 'sponsored', 'paid'] as const;
const STATUTS = ['active', 'suspended'] as const;
const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
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
		statuts: STATUTS
	};
};

export const actions: Actions = {
	ouvrir: async (event) => {
		mustBeSuperAdmin(event);
		const form = await event.request.formData();
		const slug = String(form.get('slug') ?? '').trim();
		const name = String(form.get('name') ?? '').trim();
		const timeZone = String(form.get('timeZone') ?? 'Europe/Zurich').trim();
		if (!SLUG.test(slug)) {
			return fail(400, {
				erreur: 'L’identifiant d’URL ne porte que des minuscules, des chiffres et des tirets.'
			});
		}
		if (name.length === 0) return fail(400, { erreur: 'Le nom est obligatoire.' });
		await superAdminDatabase().execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language", "enabled_language")
			values (${newId()}, ${slug}, ${name}, ${timeZone}, 'fr', array['fr'])
		`);
		return { ouverte: true };
	},

	plan: async (event) => {
		mustBeSuperAdmin(event);
		const form = await event.request.formData();
		const organizationId = String(form.get('organizationId') ?? '');
		const plan = String(form.get('plan') ?? '');
		if (!(PLANS as readonly string[]).includes(plan)) {
			return fail(400, { erreur: 'Ce plan n’existe pas.' });
		}
		await superAdminDatabase().execute(
			sql`update "organization" set "plan" = ${plan}, "updated_at" = now() where "id" = ${organizationId}`
		);
		return { planChange: true };
	},

	statut: async (event) => {
		mustBeSuperAdmin(event);
		const form = await event.request.formData();
		const organizationId = String(form.get('organizationId') ?? '');
		const status = String(form.get('status') ?? '');
		if (!(STATUTS as readonly string[]).includes(status)) {
			return fail(400, { erreur: 'Cet état n’existe pas.' });
		}
		await superAdminDatabase().execute(
			sql`update "organization" set "status" = ${status}, "updated_at" = now()
				where "id" = ${organizationId}`
		);
		return { statutChange: true };
	},

	/** Entrer dans l'espace d'une organisation. Le contexte est posé sur la session, jamais sur l'URL. */
	entrer: async (event) => {
		const person = mustBeSuperAdmin(event);
		const form = await event.request.formData();
		const organizationId = String(form.get('organizationId') ?? '');
		if (!(await chooseOrganisation(person, organizationId))) {
			return fail(404, { erreur: 'Cette organisation n’existe pas.' });
		}
		redirect(303, '/');
	},

	/**
	 * Lien de connexion de secours : le service doit rester utilisable même si le courriel tombe
	 * entièrement (ADR 0024). Le lien a la même durée de vie et le même usage unique qu'un lien
	 * envoyé ; il s'affiche à l'écran et se transmet par un autre canal. Chaque production est
	 * inscrite au registre interne.
	 */
	lienSecours: async (event) => {
		const person = mustBeSuperAdmin(event);
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		if (!ADRESSE.test(email)) return fail(400, { erreur: 'Cette adresse est mal écrite.' });
		const lien = await captureMagicLink(() =>
			auth().api.signInMagicLink({
				body: { email, callbackURL: '/organisations' },
				// L'API serveur exige des en-têtes : ce sont ceux de la requête en cours, ce qui fait
				// aussi que la limitation de débit voit la bonne adresse IP.
				headers: event.request.headers
			})
		);
		await recordAdminAccess(person, 'magic_link', event.url.pathname);
		if (!lien) return fail(500, { erreur: 'Le lien n’a pas pu être produit.' });
		return { lien, pour: email };
	}
};

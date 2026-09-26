// Les langues qu'un responsable active depuis l'écran Réglages, jusqu'à la page publique.
//
// L'anglais britannique est devenu la cinquième langue du public à l'étape 18, mais l'écran gardait
// sa propre liste de quatre langues : il ne proposait pas l'anglais, et retirait sans rien dire un
// « en » envoyé par le formulaire. Seule la base permettait de l'activer. Ce fichier passe par le
// vrai chemin : connexion par lien magique, formulaire envoyé sans JavaScript, puis la page publique
// que voit un visiteur.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';
import { conditionsAcceptees } from './conditions-acceptees.js';

const origin = inject('origin');
const outbox = inject('outbox');
const testDatabase = inject('testDatabase');

const SLUG = 'reglages-langues';
const EMAIL = 'responsable-reglages-langues@example.test';

let ownerHandle: DatabaseHandle;
let organizationId: string;
let cookie: string;

async function maintenance<T>(
	travail: (tx: Parameters<Parameters<DatabaseHandle['db']['transaction']>[0]>[0]) => Promise<T>
): Promise<T> {
	return ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		return travail(tx);
	});
}

function lignes<T>(resultat: unknown): T[] {
	if (Array.isArray(resultat)) return resultat as T[];
	return ((resultat as { rows?: unknown[] }).rows ?? []) as T[];
}

/** Un formulaire envoyé comme un navigateur sans JavaScript ; un champ répété s'écrit en tableau. */
async function envoyer(chemin: string, champs: Record<string, string | string[]>) {
	const corps = new URLSearchParams();
	for (const [cle, valeur] of Object.entries(champs)) {
		for (const une of Array.isArray(valeur) ? valeur : [valeur]) corps.append(cle, une);
	}
	return fetch(`${origin}${chemin}`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			accept: 'text/html',
			origin,
			cookie
		},
		body: corps.toString()
	});
}

/** Les réglages tels que le formulaire les envoie, les langues et la langue par défaut à part. */
function reglages(langues: string[], parDefaut: string): Record<string, string | string[]> {
	return {
		name: 'Association des réglages',
		timeZone: 'Europe/Zurich',
		accentColor: '#0f766e',
		greeting: 'Salam',
		enabledLanguages: langues,
		defaultLanguage: parDefaut
	};
}

async function languesEnBase(): Promise<{ enabled_language: string[]; default_language: string }> {
	const [ligne] = await maintenance(async (tx) =>
		lignes<{ enabled_language: string[]; default_language: string }>(
			await tx.execute(sql`
				select "enabled_language", "default_language" from "organization"
				where "id" = ${organizationId}
			`)
		)
	);
	return ligne as { enabled_language: string[]; default_language: string };
}

async function servir(chemin: string): Promise<{ statut: number; html: string }> {
	const reponse = await fetch(`${origin}${chemin}`, { redirect: 'manual' });
	return { statut: reponse.status, html: await reponse.text() };
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	organizationId = newId();
	const userId = newId();
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language")
			values (${organizationId}, ${SLUG}, 'Association des réglages', 'Europe/Zurich', 'fr',
				array['fr'])
		`);
		await tx.execute(sql`
			insert into "user" ("id", "email", "name", "email_verified")
			values (${userId}, ${EMAIL}, 'Responsable (personne fictive)', true)
		`);
		await tx.execute(sql`
			insert into "membership" ("id", "organization_id", "user_id", "role")
			values (${newId()}, ${organizationId}, ${userId}, 'org_admin')
		`);
		// Ce fichier éprouve les langues de l'écran, pas la porte de l'espace (ADR 0044).
		await tx.execute(conditionsAcceptees(organizationId, userId));
		await tx.execute(sql`delete from "rate_limit"`);
	});

	// Connexion par lien magique, comme un vrai responsable.
	await fetch(`${origin}/connexion`, {
		method: 'POST',
		redirect: 'manual',
		headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html', origin },
		body: new URLSearchParams({ email: EMAIL }).toString()
	});
	const noms = (await readdir(outbox)).filter((nom) => nom.endsWith('.json')).sort();
	const messages = await Promise.all(
		noms.map(
			async (nom) =>
				JSON.parse(await readFile(join(outbox, nom), 'utf8')) as { to: string; text: string }
		)
	);
	const lien = messages
		.filter((message) => message.to === EMAIL)
		.at(-1)
		?.text.match(/https?:\/\/\S+/)?.[0];
	expect(lien, 'aucun lien magique reçu').toBeTruthy();
	const suivi = await fetch(lien as string, { redirect: 'manual' });
	const pose = (suivi.headers.getSetCookie?.() ?? []).find((valeur) =>
		valeur.startsWith('better-auth.session_token=')
	);
	expect(pose, 'aucune session posée').toBeTruthy();
	cookie = (pose as string).split(';')[0] as string;
});

afterAll(async () => {
	await ownerHandle?.close();
});

describe('les langues de l’écran Réglages', () => {
	it('offers the five languages of the public pages, English included', async () => {
		const reponse = await fetch(`${origin}/reglages`, { headers: { cookie } });
		expect(reponse.status).toBe(200);
		const html = await reponse.text();
		const cases = [
			...html.matchAll(/<input\b[^>]*\bname="enabledLanguages"[^>]*\bvalue="([^"]*)"/g)
		].map((trouve) => trouve[1]);
		expect(cases).toEqual(['fr', 'de', 'it', 'en', 'ar']);
		const choix = html.match(/<select\b[^>]*\bname="defaultLanguage"[^>]*>([\s\S]*?)<\/select>/);
		const options = [...(choix?.[1] ?? '').matchAll(/<option\b[^>]*\bvalue="([^"]*)"/g)].map(
			(trouve) => trouve[1]
		);
		expect(options).toEqual(['fr', 'de', 'it', 'en', 'ar']);
	});

	it('enables English, and the public page offers it', async () => {
		const enregistre = await envoyer('/reglages?/enregistrer', reglages(['fr', 'en'], 'fr'));
		expect(enregistre.status).toBe(200);
		expect(await languesEnBase()).toEqual({
			enabled_language: ['fr', 'en'],
			default_language: 'fr'
		});

		// La page publique propose l'anglais, sous son nom anglais, et l'annonce aux moteurs.
		const { statut, html } = await servir(`/m/${SLUG}`);
		expect(statut).toBe(200);
		expect(html).toMatch(/<a\b[^>]*hreflang="en"[^>]*>\s*English\s*<\/a>/);
		expect(html).toMatch(/<link\b[^>]*rel="alternate"[^>]*hreflang="en"/);
	});

	it('makes English the language of the public page when it is the default one', async () => {
		const enregistre = await envoyer('/reglages?/enregistrer', reglages(['en', 'fr'], 'en'));
		expect(enregistre.status).toBe(200);
		expect(await languesEnBase()).toEqual({
			enabled_language: ['en', 'fr'],
			default_language: 'en'
		});

		const { statut, html } = await servir(`/m/${SLUG}`);
		expect(statut).toBe(200);
		expect(html.match(/<html\b[^>]*>/g)).toEqual(['<html lang="en" dir="ltr">']);
		expect(html).toContain('This week’s courses');
	});

	it('still refuses a language the public pages do not speak', async () => {
		const refus = await envoyer('/reglages?/enregistrer', reglages(['tr'], 'tr'));
		expect(refus.status).toBe(400);
		expect((await languesEnBase()).enabled_language).not.toContain('tr');
	});
});

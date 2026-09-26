// Supprimer une salle qu'un cours occupe, depuis l'écran des réglages (migration 0061).
//
// La clé qui relie un cours à sa salle vidait aussi l'organisation du cours quand la salle
// disparaissait : la base refusait, et l'écran rendait une erreur 500. Ce fichier refait le geste
// d'une personne responsable, sans JavaScript, sur un vrai serveur et une vraie base : la salle
// disparaît, le cours reste dans son organisation, sans salle, et la page publique le montre encore.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';
import { conditionsAcceptees } from './conditions-acceptees.js';

const origin = inject('origin');
const outbox = inject('outbox');
const testDatabase = inject('testDatabase');

const SLUG = 'salles-occupees';
const EMAIL = 'responsable-salles@example.test';
const SALLE = 'Salle du fond';
const COURS = 'Lecture du mardi';

let ownerHandle: DatabaseHandle;
let cookie = '';
let organizationId: string;
let roomId: string;
let courseId: string;

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

async function maintenance<T>(
	callback: (tx: Parameters<Parameters<DatabaseHandle['db']['transaction']>[0]>[0]) => Promise<T>
): Promise<T> {
	return ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		return callback(tx);
	});
}

/** Poste un formulaire comme un navigateur sans JavaScript. */
async function postForm(chemin: string, champs: Record<string, string>): Promise<Response> {
	return fetch(`${origin}${chemin}`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			accept: 'text/html',
			origin,
			cookie
		},
		body: new URLSearchParams(champs).toString()
	});
}

async function page(chemin: string, avecSession: boolean): Promise<string> {
	const response = await fetch(`${origin}${chemin}`, {
		headers: {
			accept: 'text/html',
			'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36',
			...(avecSession ? { cookie } : {})
		}
	});
	expect(response.status, chemin).toBe(200);
	return response.text();
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	organizationId = newId();
	roomId = newId();
	courseId = newId();
	const userId = newId();
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language")
			values (${organizationId}, ${SLUG}, 'Association des salles', 'Europe/Zurich', 'fr',
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
		await tx.execute(conditionsAcceptees(organizationId, userId));
		await tx.execute(sql`
			insert into "room" ("id", "organization_id", "name", "display_order")
			values (${roomId}, ${organizationId}, ${SALLE}, 1)
		`);
		// Tous les jours : la page publique a une séance à montrer, quel que soit le jour du test.
		await tx.execute(sql`
			insert into "course" ("id", "organization_id", "status", "audience", "teaching_language",
				"room_id", "source_language", "recurrence_kind", "recurrence_weekday",
				"recurrence_interval", "recurrence_anchor_date", "timing_kind", "timing_start",
				"timing_end", "starts_on")
			values (${courseId}, ${organizationId}, 'published', 'open', array['fr'], ${roomId}, 'fr',
				'weekly', array[1,2,3,4,5,6,7]::smallint[], 1, '2026-09-07', 'fixed', '19:00', '20:00',
				'2026-09-07')
		`);
		await tx.execute(sql`
			insert into "course_translation" ("id", "organization_id", "course_id", "language", "title")
			values (${newId()}, ${organizationId}, ${courseId}, 'fr', ${COURS})
		`);
		await tx.execute(sql`delete from "rate_limit"`);
	});

	// Connexion par lien magique, comme une vraie personne responsable.
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

describe('supprimer une salle qu’un cours occupe, depuis les réglages', () => {
	it('removes the room, and the course stays in its organisation, without a room', async () => {
		expect(await page('/reglages', true)).toContain(SALLE);
		const avant = await page(`/m/${SLUG}`, false);
		expect(avant).toContain(COURS);
		expect(avant).toContain(SALLE);

		const response = await postForm('/reglages?/supprimerSalle', { roomId });
		expect(response.status).toBe(200);
		expect(await page('/reglages', true)).not.toContain(SALLE);

		const [course] = await maintenance(async (tx) =>
			rows<{ organization_id: string; room_id: string | null }>(
				await tx.execute(sql`
					select "organization_id", "room_id" from "course" where "id" = ${courseId}
				`)
			)
		);
		expect(course).toEqual({ organization_id: organizationId, room_id: null });
		const rooms = await maintenance(async (tx) =>
			rows(await tx.execute(sql`select 1 from "room" where "id" = ${roomId}`))
		);
		expect(rooms).toEqual([]);

		// Le cours reste publié, et la page publique le montre, sans salle.
		const publique = await page(`/m/${SLUG}`, false);
		expect(publique).toContain(COURS);
		expect(publique).not.toContain(SALLE);
	});
});

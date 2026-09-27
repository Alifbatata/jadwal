// Le lien magique répond dans le même temps à une adresse connue et à une adresse inconnue.
//
// Contre un vrai serveur et une vraie base, comme `acces.test.ts`, d'où ce test vient. Il mesure un
// écart de temps de l'ordre de la milliseconde, et sous la charge de la suite complète, le bruit de
// la machine a dépassé son seuil de 3 ms (étape 18, lot 5). Il tourne donc à part, dans
// `pnpm test:temps` (étape 19), avec un seuil et un délai tirés d'une mesure : `CONTRIBUTING.md`,
// « Les tests liés au temps », dit comment.

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDatabase, newId, sql, type DatabaseHandle } from '@jadwal/db';

const origin = inject('origin');
const testDatabase = inject('testDatabase');

/**
 * Le délai du test, en millisecondes : quinze fois le maximum mesuré à l'étape 19, sur cinq passages
 * sur le poste chargé (1 193 à 1 289 ms), arrondi à la seconde supérieure. Le seuil de l'écart est
 * plus bas.
 */
const DELAI = 20_000;

/**
 * Le plus grand écart apparié médian mesuré à l'étape 19, en millisecondes, sur les mêmes cinq
 * passages : il allait de 0,017 à 1,041 ms.
 */
const ECART_MAXIMUM_MESURE = 1.041;

/**
 * Le seuil de l'écart : trois fois ce maximum, 3,123 ms, **sans arrondi**. Jusqu'à la relecture de
 * l'étape 19, il était arrondi à 3 ms, vers le bas, et un écart entre 3 et 3,123 ms, dans la règle,
 * faisait tomber le test. Il n'est pas non plus arrondi vers le haut, comme les délais, à 4 ms :
 * un seuil qui s'élargit cesse de voir ce qu'il cherche (voir le test).
 */
const SEUIL = 3 * ECART_MAXIMUM_MESURE;

let ownerHandle: DatabaseHandle;

/** Poste un formulaire comme un navigateur sans JavaScript : encodage de formulaire et origine. */
async function postForm(path: string, fields: Record<string, string>): Promise<Response> {
	return fetch(`${origin}${path}`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			// Sans cet en-tête, SvelteKit répond au protocole de ses formulaires améliorés : du JSON et
			// un code 200 qui porte l'échec dans son corps. C'est le chemin sans JavaScript qu'on éprouve.
			accept: 'text/html',
			origin
		},
		body: new URLSearchParams(fields).toString()
	});
}

/** La page, sans le nonce que SvelteKit change à chaque rendu : le comparer comparerait du hasard. */
function sansNonce(html: string): string {
	return html.replaceAll(/nonce="[^"]*"/g, 'nonce="…"');
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	await ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		// Un compte connu, rattaché à rien : l'adresse connue que ce test compare à une inconnue.
		await tx.execute(sql`
			insert into "user" ("id", "email", "email_verified")
			values (${newId()}, 'connue@example.test', true)
		`);
	});
});

afterAll(async () => {
	await ownerHandle?.close();
});

describe('le lien magique', () => {
	it(
		'answers the same thing, and in the same time, for a known and an unknown address',
		async () => {
			// Le chemin de demande ne consulte jamais les comptes : il n'y a donc aucune branche qui
			// puisse dépendre de l'existence d'un compte (ADR 0017). On le vérifie sur la réponse, sur
			// le corps, et sur le temps.
			const connue = 'connue@example.test';
			const inconnue = 'jamais-vue@example.test';
			const corps: Record<string, string> = {};

			const mesurer = async (nom: string, email: string) => {
				const debut = performance.now();
				const response = await postForm('/connexion', { email });
				const duree = performance.now() - debut;
				corps[nom] = sansNonce(await response.text());
				expect(response.status, nom).toBe(200);
				return duree;
			};

			// Rodage : la première réponse d'un serveur qui vient de démarrer coûte plusieurs fois les
			// suivantes, et une mesure qui l'inclurait noierait l'écart qu'on cherche.
			for (const email of [connue, inconnue]) await postForm('/connexion', { email });

			// **Des écarts appariés, et non une différence de médianes.** Les deux mesures d'un tour
			// sont prises l'une après l'autre, à quelques millisecondes d'intervalle : un
			// ralentissement de la machine — et une machine d'intégration continue est partagée — les
			// touche toutes les deux et s'annule dans leur différence. Une différence de médianes,
			// elle, compare deux ensembles que le bruit a pu décaler séparément, et c'est ainsi qu'on
			// obtient un test qui échoue une fois sur dix sans que rien n'ait changé. Un test qu'on
			// relance jusqu'à ce qu'il passe ne prouve plus rien.
			//
			// L'ordre du couple alterne, pour qu'un éventuel avantage à « passer en premier » — un
			// cache tiède, une connexion déjà ouverte — se compense lui aussi.
			const ecarts: number[] = [];
			for (let tour = 0; tour < 40; tour += 1) {
				if (tour % 2 === 0) {
					const a = await mesurer('connue', connue);
					const b = await mesurer('inconnue', inconnue);
					ecarts.push(a - b);
				} else {
					const b = await mesurer('inconnue', inconnue);
					const a = await mesurer('connue', connue);
					ecarts.push(a - b);
				}
			}
			// Le corps rendu est le même, mot pour mot.
			expect(corps['connue']).toBe(corps['inconnue']);

			const mediane = (valeurs: number[]) =>
				[...valeurs].sort((a, b) => a - b)[Math.floor(valeurs.length / 2)] ?? 0;
			const ecart = Math.abs(mediane(ecarts));
			// Un seuil absolu, et non une fraction du temps de réponse : une fraction de la moitié
			// tolérerait huit millisecondes sur des réponses de seize, c'est-à-dire deux allers-retours
			// vers la base. Une consultation des comptes en coûte un ou deux : le seuil doit être plus
			// serré qu'elle, pas plus large.
			//
			// Mesuré à l'étape 19, cinq passages sur le poste chargé, commande à part : un écart
			// apparié médian de 0,017 à 1,041 ms. Le seuil est trois fois ce maximum, sans arrondi :
			// `SEUIL`, 3,123 ms. Pas quinze fois, comme les délais : un seuil qui s'élargit avec le
			// bruit cesse de voir ce qu'il cherche, quand un délai plus long ne fait qu'attendre plus.
			expect(
				ecart,
				`écart apparié médian : ${ecart.toFixed(3)} ms, seuil ${SEUIL.toFixed(3)} ms`
			).toBeLessThan(SEUIL);
		},
		DELAI
	);
});

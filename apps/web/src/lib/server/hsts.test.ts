// L'en-tête de transport strict, éprouvé sans serveur : les serveurs de test écoutent en clair, et
// `tests/acces.test.ts` vérifie seulement qu'il n'y part pas. Ici, sa valeur et sa condition.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STRICT_TRANSPORT_SECURITY, strictTransportSecurity } from './hsts.js';

/** Deux ans, en secondes, comme le bloc de site : 2 × 365 × 24 × 3600. */
const DEUX_ANS = 2 * 365 * 24 * 3600;

/** Le bloc de site publié avec le dépôt, celui qu'une installation pose devant l'application. */
const BLOC_DE_SITE = readFileSync(
	new URL('../../../../../infra/caddy/jadwal.voltia.ch.caddy', import.meta.url),
	'utf8'
);

describe('l’en-tête de transport strict de l’application', () => {
	it('asks for two years, subdomains included, and nothing more', () => {
		expect(DEUX_ANS).toBe(63072000);
		expect(STRICT_TRANSPORT_SECURITY).toBe(`max-age=${DEUX_ANS}; includeSubDomains`);
	});

	// Jusqu'à l'étape 17, l'application disait un an et le bloc de site deux. En production, c'est
	// le bloc qui a le dernier mot ; une instance servie sans lui promettait moins.
	it('says exactly what the site block says', () => {
		const duBloc = BLOC_DE_SITE.match(/Strict-Transport-Security\s+"([^"]+)"/)?.[1];
		expect(duBloc, 'le bloc de site ne pose plus l’en-tête').toBeTruthy();
		expect(STRICT_TRANSPORT_SECURITY).toBe(duBloc);
	});

	it('is sent over https only', () => {
		expect(strictTransportSecurity(new URL('https://jadwal.example/m/x'))).toBe(
			STRICT_TRANSPORT_SECURITY
		);
		// En clair, il engagerait le navigateur pour deux ans sur un domaine qui n'est pas encore en
		// HTTPS.
		expect(strictTransportSecurity(new URL('http://127.0.0.1:4173/connexion'))).toBeUndefined();
	});
});

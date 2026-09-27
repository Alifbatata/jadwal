// L'adresse de la page publique d'une organisation, proposée à partir de son nom (étape 18, retour
// B2). La même fonction sert au navigateur pendant la frappe et au serveur quand le champ arrive vide :
// ce fichier la tient pour les deux.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isPublicAddress, proposePublicAddress, PUBLIC_ADDRESS } from './public-address.js';

describe('la règle de l’adresse', () => {
	it('is the one the database enforces, word for word', () => {
		// La contrainte `organization_slug_ck`, telle que la migration 0003 la pose. L'écran ne doit ni
		// l'affaiblir ni en inventer une autre : une adresse qu'il accepte, la base l'accepte.
		const migration = readFileSync(
			new URL('../../../../../packages/db/migrations/0003_strict_checks.sql', import.meta.url),
			'utf8'
		);
		const contrainte = migration.match(
			/ADD CONSTRAINT "organization_slug_ck" CHECK \(\("organization"\."slug" ~ '([^']+)'\)/
		)?.[1];
		expect(contrainte).toBe('^[a-z0-9]+(-[a-z0-9]+)*$');
		expect(PUBLIC_ADDRESS.source).toBe(contrainte);
	});

	it.each(['association-horizon', 'club-7', 'a', '2026'])('accepts « %s »', (adresse) => {
		expect(isPublicAddress(adresse)).toBe(true);
	});

	it.each(['', 'Horizon', 'crèche', '-club', 'club-', 'club--foot', 'club foot', 'club_foot'])(
		'refuses « %s »',
		(adresse) => {
			expect(isPublicAddress(adresse)).toBe(false);
		}
	);
});

describe('l’adresse proposée à partir du nom', () => {
	it.each([
		['Association Horizon', 'association-horizon'],
		['  Centre culturel d’Aarau  ', 'centre-culturel-d-aarau'],
		['École coranique, Straße 12', 'ecole-coranique-strasse-12'],
		['Œuvre -- Æsir', 'oeuvre-aesir'],
		['Zürich : Club de foot !', 'zurich-club-de-foot'],
		['Crèche الأفق', 'creche'],
		['CLUB 2000', 'club-2000']
	])('turns « %s » into « %s »', (nom, adresse) => {
		expect(proposePublicAddress(nom)).toBe(adresse);
	});

	it('proposes nothing for a name without a single Latin letter or digit', () => {
		// Le serveur demande alors d'écrire l'adresse à la main, au lieu d'en inventer une.
		expect(proposePublicAddress('جمعية الأفق')).toBe('');
		expect(proposePublicAddress('   ')).toBe('');
	});

	it('keeps a long name to 60 characters, cut between two words', () => {
		const adresse = proposePublicAddress(
			'Association culturelle et éducative des familles musulmanes de la région de Bienne et environs'
		);
		expect(adresse.length).toBeLessThanOrEqual(60);
		expect(adresse).toBe('association-culturelle-et-educative-des-familles-musulmanes');
		expect(isPublicAddress(adresse)).toBe(true);
	});

	it('always proposes an address the rule accepts, or nothing', () => {
		for (const nom of [
			'Association Horizon',
			'--Club--',
			'L’Étoile d’Or',
			'Ärzte ohne Grenzen',
			'Ça va, ça vient',
			'İstanbul Kültür',
			'Łódź',
			'x'.repeat(200),
			'a-'.repeat(80),
			'جمعية',
			''
		]) {
			const adresse = proposePublicAddress(nom);
			expect(adresse === '' || isPublicAddress(adresse), `${nom} → ${adresse}`).toBe(true);
			expect(adresse.length, nom).toBeLessThanOrEqual(60);
		}
	});
});

// L'adresse de la page publique d'une organisation, proposée à partir de son nom (étape 18, retour
// B2). La même fonction sert au navigateur pendant la frappe et au serveur quand le champ arrive vide :
// ce fichier la tient pour les deux.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	isPublicAddress,
	proposePublicAddress,
	PUBLIC_ADDRESS,
	PUBLIC_ADDRESS_PATTERN
} from './public-address.js';

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

	const ACCEPTEES = ['association-horizon', 'club-7', 'a', '2026-club', 'club-2000'];
	const REFUSEES = [
		'',
		'Horizon',
		'crèche',
		'-club',
		'club-',
		'club--foot',
		'club foot',
		'club_foot'
	];
	/** Des chiffres et des traits d'union, sans une lettre : la base les prend, l'écran non. */
	const SANS_LETTRE = ['2026', '2', '12-34'];

	it.each(ACCEPTEES)('accepts « %s »', (adresse) => {
		expect(isPublicAddress(adresse)).toBe(true);
	});

	it.each(REFUSEES)('refuses « %s »', (adresse) => {
		expect(isPublicAddress(adresse)).toBe(false);
	});

	it.each(SANS_LETTRE)(
		'refuses « %s », which has no letter, though the database takes it',
		(adresse) => {
			// `/m/2` ne dit rien de l'organisation qu'elle ouvre (étape 18, relecture de B2). La règle de
			// la base reste celle de la migration 0003 : l'écran est plus strict qu'elle.
			expect(PUBLIC_ADDRESS.test(adresse)).toBe(true);
			expect(isPublicAddress(adresse)).toBe(false);
		}
	);

	it('gives the field a pattern that says the same as the rule, read as a browser reads it', () => {
		// Un navigateur ancre l'attribut `pattern` et le lit avec le drapeau `v` : compilé ainsi, il
		// accepte et refuse exactement ce que le serveur accepte et refuse.
		const champ = new RegExp(`^(?:${PUBLIC_ADDRESS_PATTERN})$`, 'v');
		for (const adresse of [...ACCEPTEES, ...REFUSEES, ...SANS_LETTRE]) {
			expect(champ.test(adresse), adresse).toBe(isPublicAddress(adresse));
		}
	});
});

describe('l’adresse proposée à partir du nom', () => {
	it.each([
		['Association Horizon', 'association-horizon'],
		['  Centre culturel d’Aarau  ', 'centre-culturel-d-aarau'],
		['École coranique, Straße 12', 'ecole-coranique-strasse-12'],
		['Œuvre -- Æsir', 'oeuvre-aesir'],
		['Zürich : Club de foot !', 'zurich-club-de-foot'],
		['Crèche الأفق', 'creche'],
		['CLUB 2000', 'club-2000'],
		// Les ligatures et les lettres pleine chasse se décomposent en lettres latines (NFKD) ; la
		// décomposition canonique (NFD) les laissait telles quelles, et elles tombaient.
		['Oﬃce culturel', 'office-culturel'],
		['Café ﬂoral', 'cafe-floral'],
		['Ｃｌｕｂ ７', 'club-7'],
		// Cette décomposition donne parfois une majuscule (« № » donne « No », « ℌ » donne « H ») :
		// elle vient donc avant la mise en minuscules, sinon cette lettre tombait.
		['Club № 5', 'club-no-5'],
		['ℌorizon', 'horizon'],
		['ℂlub Ⅻ', 'club-xii']
	])('turns « %s » into « %s »', (nom, adresse) => {
		expect(proposePublicAddress(nom)).toBe(adresse);
	});

	it.each(['جمعية الأفق', '   ', 'جمعية الأفق 2', '2026', '12 34', '٢٠٢٦'])(
		'proposes nothing for « %s », a name without a single Latin letter',
		(nom) => {
			// Le serveur demande alors d'écrire l'adresse à la main, au lieu d'en inventer une : un nom
			// en arabe suivi d'un chiffre donnait `/m/2`.
			expect(proposePublicAddress(nom)).toBe('');
		}
	);

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
			'جمعية الأفق 2',
			'2026',
			'Oﬃce',
			''
		]) {
			const adresse = proposePublicAddress(nom);
			expect(adresse === '' || isPublicAddress(adresse), `${nom} → ${adresse}`).toBe(true);
			expect(adresse.length, nom).toBeLessThanOrEqual(60);
		}
	});
});

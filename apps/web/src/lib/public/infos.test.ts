// Ce que l'onglet Infos décide sans rien afficher (étape 24, docs/maquettes/public-infos.md) :
// l'organisation a-t-elle dit quelque chose d'elle, et où mène « Ouvrir dans une carte ».

import { describe, expect, it } from 'vitest';
import { aDesInfos, lienCarte, lienSite } from './infos.js';

const RIEN = {
	address: null,
	contactPhone: null,
	contactEmail: null,
	website: null,
	accessNote: null,
	announcement: null
};

describe('une organisation a-t-elle des informations', () => {
	it('has none when it said nothing', () => {
		expect(aDesInfos(RIEN)).toBe(false);
	});

	it.each(Object.keys(RIEN))('has some as soon as %s is there', (champ) => {
		expect(aDesInfos({ ...RIEN, [champ]: 'x' })).toBe(true);
	});
});

describe('le lien vers une carte', () => {
	const ADRESSE = 'Rue de l’Exemple 12\n2500 Bienne';
	const ENCODEE = encodeURIComponent('Rue de l’Exemple 12, 2500 Bienne');

	it('opens the maps application of an Android phone', () => {
		expect(lienCarte('android', ADRESSE)).toEqual({
			href: `geo:0,0?q=${ENCODEE}`,
			ailleurs: false
		});
	});

	it('opens Apple Maps on an iPhone, an iPad or a Mac', () => {
		expect(lienCarte('apple', ADRESSE)).toEqual({
			href: `https://maps.apple.com/?q=${ENCODEE}`,
			ailleurs: true
		});
	});

	it('opens OpenStreetMap anywhere else', () => {
		expect(lienCarte('autre', ADRESSE)).toEqual({
			href: `https://www.openstreetmap.org/search?query=${ENCODEE}`,
			ailleurs: true
		});
	});

	it('writes the address on one line, whatever its line breaks and blanks', () => {
		expect(lienCarte('autre', ' Rue A 1 \n\n 1000 Ville ').href).toBe(
			`https://www.openstreetmap.org/search?query=${encodeURIComponent('Rue A 1, 1000 Ville')}`
		);
	});

	it('never lets the address leave the query of the link', () => {
		const piege = 'x&y=1#z?w/../"><script>';
		const { href } = lienCarte('autre', piege);
		const lu = new URL(href);
		expect(lu.origin + lu.pathname).toBe('https://www.openstreetmap.org/search');
		expect([...lu.searchParams.keys()]).toEqual(['query']);
		expect(lu.searchParams.get('query')).toBe(piege);
		expect(lu.hash).toBe('');
	});
});

describe('le lien du site', () => {
	it('is the address itself when it starts with http or https', () => {
		expect(lienSite('https://www.example.org/')).toBe('https://www.example.org/');
		expect(lienSite('http://example.org')).toBe('http://example.org');
	});

	// La base le garantit déjà (migration 0082) ; la page le revérifie avant d'en faire un lien.
	it.each(['javascript:alert(1)', 'www.example.org', 'data:text/html,x', '', ' https://x'])(
		'is nothing for anything else: %s',
		(site) => {
			expect(lienSite(site)).toBeNull();
		}
	);
});

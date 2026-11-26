// Ce que l'écran Réglages accepte pour les informations d'une organisation (étape 24,
// docs/maquettes/public-infos.md). La base refuse la même chose de son côté
// (`packages/db/test/organization-info.test.ts`) : ici, c'est ce que l'écran dit avant elle.

import { describe, expect, it } from 'vitest';
import { LIMITES_DES_INFOS, lireInfos } from './infos.js';

const champs = (valeurs: Record<string, string>) => {
	const formulaire = new FormData();
	for (const [cle, valeur] of Object.entries(valeurs)) formulaire.set(cle, valeur);
	return formulaire;
};

const VIDES = {
	address: null,
	contactPhone: null,
	contactEmail: null,
	website: null,
	accessNote: null,
	announcement: null
};

describe('les informations lues du formulaire', () => {
	it('reads nothing at all as six absent pieces of information', () => {
		expect(lireInfos(champs({}))).toEqual({ infos: VIDES, error: null });
		expect(
			lireInfos(champs({ address: '', contactPhone: '   ', website: '\n', announcement: ' \t ' }))
		).toEqual({ infos: VIDES, error: null });
	});

	it('trims each field, and keeps the line breaks of the three longer ones', () => {
		const lues = lireInfos(
			champs({
				address: '  Rue de l’Exemple 12\r\n2500 Bienne  ',
				contactPhone: ' +41 32 000 00 00 ',
				contactEmail: ' contact@example.org ',
				website: ' https://www.example.org/ ',
				accessNote: 'Bus 4.\r\nEntrée par la cour.\n',
				announcement: '\nSalle fermée.\n\nRetour lundi.'
			})
		);
		expect(lues.error).toBeNull();
		expect(lues.infos).toEqual({
			address: 'Rue de l’Exemple 12\n2500 Bienne',
			contactPhone: '+41 32 000 00 00',
			contactEmail: 'contact@example.org',
			website: 'https://www.example.org/',
			accessNote: 'Bus 4.\nEntrée par la cour.',
			announcement: 'Salle fermée.\n\nRetour lundi.'
		});
	});

	it('puts a phone number on one line, whatever was sent', () => {
		expect(lireInfos(champs({ contactPhone: '+41 32\r\n000\t00 00' })).infos.contactPhone).toBe(
			'+41 32 000 00 00'
		);
	});

	it.each(Object.entries(LIMITES_DES_INFOS))('holds %s to %i characters', (champ, limite) => {
		const tete = champ === 'website' ? 'https://' : champ === 'contactEmail' ? 'a@' : '';
		const juste = tete + 'x'.repeat(limite - tete.length);
		expect(lireInfos(champs({ [champ]: juste })).error).toBeNull();
		expect(lireInfos(champs({ [champ]: `${juste}x` })).error).toBe('infoTooLong');
	});

	it('counts characters, not the two halves of an emoji', () => {
		// 500 caractères, dont un qui pèse deux unités : la base compte comme ici.
		const annonce = `${'x'.repeat(499)}🕌`;
		expect(annonce.length).toBe(501);
		expect(lireInfos(champs({ announcement: annonce })).error).toBeNull();
	});

	it.each(['contact', 'contact@', '@example.org', 'a b@example.org', 'a@b@example.org'])(
		'refuses an e-mail address that has not the form of one: %s',
		(adresse) => {
			expect(lireInfos(champs({ contactEmail: adresse })).error).toBe('infoEmail');
		}
	);

	it.each([
		'www.example.org',
		'ftp://example.org',
		'javascript:alert(1)',
		'https://',
		'https://exa mple.org',
		'https:example.org'
	])('refuses a website that is not a web address: %s', (site) => {
		expect(lireInfos(champs({ website: site })).error).toBe('infoWebsite');
	});

	it.each(['http://example.org', 'https://example.org/chemin?x=1'])(
		'accepts a website that starts with http or https: %s',
		(site) => {
			expect(lireInfos(champs({ website: site }))).toMatchObject({
				error: null,
				infos: { website: site }
			});
		}
	);

	it('writes the protocol of a website in lower case, as the database expects it', () => {
		expect(lireInfos(champs({ website: 'HTTPS://Example.org/Page' }))).toMatchObject({
			error: null,
			infos: { website: 'https://Example.org/Page' }
		});
	});

	it('gives back what was typed when it refuses, so that the form can show it again', () => {
		const lues = lireInfos(champs({ address: 'Rue de l’Exemple 12', website: 'www.example.org' }));
		expect(lues.error).toBe('infoWebsite');
		expect(lues.infos).toMatchObject({
			address: 'Rue de l’Exemple 12',
			website: 'www.example.org'
		});
	});
});

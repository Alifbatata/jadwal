// Où part une archive, et sous quel nom (ADR 0037).
//
// Ce que ces tests protègent tient en une phrase : la rétention n'est plus tenue par le serveur mais
// par le stockage, et le stockage ne sait rien d'autre que le préfixe sous lequel un objet est
// arrivé. Se tromper de préfixe, c'est donner à une archive la mauvaise durée de vie — et on ne s'en
// apercevrait que le jour où elle manque.

import { describe, expect, it } from 'vitest';
import { destinations, nomArchive, prefixes } from './destinations.mjs';

describe('nomArchive', () => {
	it('porte la date ET l’heure, en UTC', () => {
		expect(nomArchive('2026-09-21T02:15:03Z')).toBe('jadwal-2026-09-21T021503Z.dump.age');
	});

	it('distingue deux exécutions du même jour', () => {
		// Un verrou de conservation refuse l'écrasement : deux sauvegardes le même jour doivent
		// produire deux objets, sinon la seconde échoue et la nuit passe sans archive.
		const matin = nomArchive('2026-09-21T02:15:03Z');
		const rattrapage = nomArchive('2026-09-21T09:40:00Z');
		expect(matin).not.toBe(rattrapage);
	});

	it('ramène tout à UTC, quel que soit le décalage écrit', () => {
		// 2026-09-21T02:15:03+03:00 est 2026-09-20T23:15:03Z : c'est la veille.
		expect(nomArchive('2026-09-21T02:15:03+03:00')).toBe('jadwal-2026-09-20T231503Z.dump.age');
	});

	it('refuse un horodatage illisible plutôt que d’inventer un nom', () => {
		expect(() => nomArchive('la nuit dernière')).toThrow(TypeError);
	});
});

describe('prefixes', () => {
	it('envoie toute archive sous quotidien/', () => {
		// 2026-09-22 est un mardi : ni dimanche, ni premier du mois.
		expect(prefixes('2026-09-22T02:15:00Z')).toEqual(['quotidien']);
	});

	it('ajoute hebdo/ le dimanche', () => {
		// 2026-09-20 est un dimanche.
		expect(prefixes('2026-09-20T02:15:00Z')).toEqual(['quotidien', 'hebdo']);
	});

	it('ajoute mensuel/ le premier du mois', () => {
		// 2026-10-01 est un jeudi.
		expect(prefixes('2026-10-01T02:15:00Z')).toEqual(['quotidien', 'mensuel']);
	});

	it('ajoute les deux quand le premier du mois tombe un dimanche', () => {
		// 2026-11-01 est un dimanche : l'archive part trois fois.
		expect(prefixes('2026-11-01T02:15:00Z')).toEqual(['quotidien', 'hebdo', 'mensuel']);
	});

	it('donne exactement un dimanche et un premier du mois par période, sur une année entière', () => {
		// La propriété qui compte : sur 365 nuits, il doit y avoir 52 ou 53 copies hebdomadaires et
		// exactement 12 mensuelles. Un décalage de fuseau en produirait 51 ou 54.
		let quotidiennes = 0;
		let hebdomadaires = 0;
		let mensuelles = 0;
		const debut = Date.UTC(2027, 0, 1, 2, 15, 0);
		for (let jour = 0; jour < 365; jour += 1) {
			const liste = prefixes(new Date(debut + jour * 86_400_000).toISOString());
			if (liste.includes('quotidien')) quotidiennes += 1;
			if (liste.includes('hebdo')) hebdomadaires += 1;
			if (liste.includes('mensuel')) mensuelles += 1;
		}
		expect(quotidiennes).toBe(365);
		expect(hebdomadaires).toBe(52);
		expect(mensuelles).toBe(12);
	});
});

describe('destinations', () => {
	it('rend des chemins prêts pour rclone, quotidien/ en premier', () => {
		expect(destinations('2026-11-01T02:15:00Z')).toEqual([
			'quotidien/jadwal-2026-11-01T021500Z.dump.age',
			'hebdo/jadwal-2026-11-01T021500Z.dump.age',
			'mensuel/jadwal-2026-11-01T021500Z.dump.age'
		]);
	});

	it('n’écrit jamais hors des trois préfixes connus', () => {
		// Le stockage n'applique un verrou qu'aux préfixes qu'on lui a déclarés. Une archive posée
		// ailleurs n'aurait aucune protection et ne serait jamais effacée : deux défauts d'un coup.
		const connus = new Set(['quotidien', 'hebdo', 'mensuel']);
		const debut = Date.UTC(2028, 0, 1, 2, 15, 0);
		for (let jour = 0; jour < 366; jour += 1) {
			for (const chemin of destinations(new Date(debut + jour * 86_400_000).toISOString())) {
				expect(connus.has(chemin.split('/')[0]), chemin).toBe(true);
			}
		}
	});
});

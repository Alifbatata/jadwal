// Ce qu'on garde sur le disque du serveur (ADR 0035, ADR 0037).
//
// Ces tests existent pour une raison datée : la règle a passé une nuit en bash, où elle ne gardait
// **rien** — chaque date était imprimée sans fin de ligne, et `date` recevait quatorze dates collées.
// Le script appelant efface tout ce que la règle ne désigne pas. Le premier test ci-dessous est
// écrit pour tomber sur ce défaut-là, et pas seulement pour décrire le cas heureux.

import { describe, expect, it } from 'vitest';
import { aGarder, jourDe, RETENTION } from './retention.mjs';

/** Le nom d'archive d'un jour, à l'heure de la sauvegarde. */
const archive = (jour, heure = '021503') => `jadwal-${jour}T${heure}Z.dump.age`;

/**
 * Les quatorze archives de la séance du 2026-09-21 : sept jours d'affilée, trois dimanches, trois
 * premiers du mois, un jour qui en porte deux, et une au vieux format sans heure.
 */
const QUATORZE = [
	archive('2026-06-01'),
	archive('2026-07-01'),
	archive('2026-08-01'),
	archive('2026-09-06'),
	archive('2026-09-13'),
	archive('2026-09-14'),
	archive('2026-09-15'),
	archive('2026-09-16'),
	archive('2026-09-17'),
	archive('2026-09-18'),
	archive('2026-09-19'),
	archive('2026-09-20'),
	archive('2026-09-21'),
	archive('2026-09-21', '094000')
];

describe('jourDe', () => {
	it('lit le jour d’un nom avec heure', () => {
		expect(jourDe('jadwal-2026-09-21T021503Z.dump.age')).toBe('2026-09-21');
	});

	it('lit encore le jour d’un nom d’avant l’ADR 0037, sans heure', () => {
		expect(jourDe('jadwal-2026-05-01.dump.age')).toBe('2026-05-01');
	});

	it('rend null sur ce qu’elle ne sait pas dater', () => {
		expect(jourDe('jadwal-.dump.age')).toBeNull();
		expect(jourDe('notes.txt')).toBeNull();
		expect(jourDe('jadwal-2026-13-45T000000Z.dump.age')).toBe('2026-13-45');
	});
});

describe('aGarder', () => {
	it('garde quelque chose — le défaut qui n’en gardait aucune doit tomber ici', () => {
		const gardees = aGarder(QUATORZE);
		expect(gardees.length).toBeGreaterThan(0);
		// Et pas non plus « tout garder », l'autre façon de ne pas être une règle.
		expect(gardees.length).toBeLessThan(QUATORZE.length);
	});

	it('garde les sept jours les plus récents, les dimanches et les premiers du mois', () => {
		expect(aGarder(QUATORZE)).toEqual([
			archive('2026-06-01'), // 1er du mois
			archive('2026-07-01'), // 1er du mois
			archive('2026-08-01'), // 1er du mois
			archive('2026-09-06'), // dimanche
			archive('2026-09-13'), // dimanche
			// 2026-09-14 est un lundi, hors des sept derniers jours : c'est la seule écartée.
			archive('2026-09-15'),
			archive('2026-09-16'),
			archive('2026-09-17'),
			archive('2026-09-18'),
			archive('2026-09-19'),
			archive('2026-09-20'), // dimanche, et dans les sept derniers jours
			archive('2026-09-21'),
			archive('2026-09-21', '094000') // le même jour : les deux se gardent ensemble
		]);
	});

	it('garde les deux archives d’un même jour, ou aucune', () => {
		const deuxLeMemeJour = [archive('2026-09-14'), archive('2026-09-14', '094000')];
		const avecUnPasse = [...QUATORZE.slice(4), ...deuxLeMemeJour];
		const gardees = aGarder(avecUnPasse);
		const quatorzeSeptembre = gardees.filter((nom) => jourDe(nom) === '2026-09-14');
		expect(quatorzeSeptembre.length === 0 || quatorzeSeptembre.length === 2).toBe(true);
	});

	it('reconnaît un dimanche qui est aussi le premier du mois', () => {
		// 2026-11-01 est un dimanche. Il doit être gardé à ce double titre, et ne consommer qu'une
		// hebdomadaire et une mensuelle — pas deux de chacune.
		const novembre = [
			archive('2026-11-01'),
			archive('2026-11-08'),
			archive('2026-11-15'),
			archive('2026-11-22'),
			archive('2026-11-29'),
			archive('2026-12-06')
		];
		// Toutes ces dates sont des dimanches, à sept jours d'écart.
		const gardees = aGarder(novembre, { quotidiennes: 1, hebdomadaires: 4, mensuelles: 6 });
		expect(gardees).toContain(archive('2026-11-01'));
		// Le plus récent au titre des quotidiennes, les quatre dimanches les plus récents au titre
		// des hebdomadaires — et le 1er novembre, cinquième dimanche, gardé comme **mensuelle**.
		// C'est le seul intérêt de ce cas : sans la règle du premier du mois, il tomberait.
		expect(gardees).toEqual([
			archive('2026-11-01'),
			archive('2026-11-15'),
			archive('2026-11-22'),
			archive('2026-11-29'),
			archive('2026-12-06')
		]);
		expect(gardees).not.toContain(archive('2026-11-08'));
	});

	it('ne garde rien d’un répertoire vide, et ne se plaint pas', () => {
		expect(aGarder([])).toEqual([]);
	});

	it('garde ce qu’elle ne sait pas dater plutôt que de l’effacer', () => {
		// Une règle de rétention qui se trompe doit se tromper du côté qui ne perd rien.
		const melange = [...QUATORZE, 'ne-ressemble-a-rien.dump.age'];
		expect(aGarder(melange)).toContain('ne-ressemble-a-rien.dump.age');
	});

	it('rend toujours un sous-ensemble de ce qu’on lui donne', () => {
		const gardees = aGarder(QUATORZE);
		for (const nom of gardees) expect(QUATORZE).toContain(nom);
	});

	it('tient la promesse annoncée : 7 jours, 4 dimanches, 6 premiers du mois', () => {
		// Deux ans de sauvegardes quotidiennes. La promesse écrite partout dans la documentation est
		// celle-ci, et ce test la relit telle quelle : les sept derniers jours, les quatre derniers
		// dimanches, les six derniers premiers du mois. Un jour peut cocher plusieurs cases — le
		// total gardé est donc au plus dix-sept, et souvent moins.
		const noms = [];
		const debut = Date.UTC(2025, 0, 1);
		for (let jour = 0; jour < 730; jour += 1) {
			noms.push(archive(new Date(debut + jour * 86_400_000).toISOString().slice(0, 10)));
		}
		const jours = noms.map(jourDe);
		const gardes = new Set(aGarder(noms).map(jourDe));
		const desc = [...jours].reverse();

		for (const jour of desc.slice(0, RETENTION.quotidiennes)) expect(gardes).toContain(jour);
		const dimanches = desc.filter((j) => new Date(`${j}T00:00:00Z`).getUTCDay() === 0);
		for (const jour of dimanches.slice(0, RETENTION.hebdomadaires)) expect(gardes).toContain(jour);
		const premiers = desc.filter((j) => j.endsWith('-01'));
		for (const jour of premiers.slice(0, RETENTION.mensuelles)) expect(gardes).toContain(jour);

		expect(gardes.size).toBeLessThanOrEqual(
			RETENTION.quotidiennes + RETENTION.hebdomadaires + RETENTION.mensuelles
		);
		// Et le huitième jour, le cinquième dimanche et le septième premier du mois sont bien partis.
		expect(gardes).not.toContain(desc[RETENTION.quotidiennes]);
		expect(gardes).not.toContain(dimanches[RETENTION.hebdomadaires]);
		expect(gardes).not.toContain(premiers[RETENTION.mensuelles]);
	});
});

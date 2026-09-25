// La conversion MN95 vers WGS84, contre l'exemple chiffré du document officiel de swisstopo :
// « Formules approchées pour la transformation entre des coordonnées de projection suisses et
// WGS84 », version de décembre 2016, chapitre 2, point 4.
// https://www.swisstopo.admin.ch/dam/fr/sd-web/KLRCX9XIdXDu/ch1903wgs84-FR.pdf
//
// Le document donne le résultat en degrés, minutes et secondes, arrondi au centième de seconde :
// c'est à ce niveau que la conversion est comparée, puis à la référence exacte qu'il cite, avec la
// précision qu'il annonce (0,12" en longitude, 0,08" en latitude).

import { describe, expect, it } from 'vitest';
import { lv95ToWgs84 } from './lv95.js';

/** Les secondes d'arc d'un angle en degrés, une fois les degrés et les minutes entiers retirés. */
function secondes(degres: number): number {
	const total = degres * 3600;
	return total - Math.floor(total / 60) * 60;
}

/** Les minutes entières d'un angle en degrés. */
function minutes(degres: number): number {
	return Math.floor((degres * 60) % 60);
}

describe('lv95ToWgs84', () => {
	const { latitude, longitude } = lv95ToWgs84(2_700_000, 1_100_000);

	it('retrouve l’exemple chiffré du document : λ = 8° 43′ 49,80″, φ = 46° 02′ 38,86″', () => {
		expect(Math.floor(longitude)).toBe(8);
		expect(minutes(longitude)).toBe(43);
		expect(secondes(longitude).toFixed(2)).toBe('49.80');
		expect(Math.floor(latitude)).toBe(46);
		expect(minutes(latitude)).toBe(2);
		expect(secondes(latitude).toFixed(2)).toBe('38.86');
	});

	it('passe par les grandeurs auxiliaires du document : λ′ = 3,14297976, φ′ = 16,57588564', () => {
		// Les deux valeurs intermédiaires sont en unités de 10 000″ : λ = λ′ × 100 / 36.
		expect((longitude * 36) / 100).toBeCloseTo(3.14297976, 8);
		expect((latitude * 36) / 100).toBeCloseTo(16.57588564, 8);
	});

	it('reste dans la précision annoncée autour de la référence : 49,79″ et 38,87″', () => {
		expect(Math.abs(secondes(longitude) - 49.79)).toBeLessThan(0.12);
		expect(Math.abs(secondes(latitude) - 38.87)).toBeLessThan(0.08);
	});

	it('met le nord au-dessus du sud et l’est à droite de l’ouest', () => {
		const nord = lv95ToWgs84(2_600_000, 1_250_000);
		const sud = lv95ToWgs84(2_600_000, 1_100_000);
		const est = lv95ToWgs84(2_750_000, 1_200_000);
		const ouest = lv95ToWgs84(2_500_000, 1_200_000);
		expect(nord.latitude).toBeGreaterThan(sud.latitude);
		expect(est.longitude).toBeGreaterThan(ouest.longitude);
	});
});

// La conversion des coordonnées suisses MN95 (LV95) en latitude et longitude WGS84.
//
// Les formules approchées de swisstopo, telles que le document officiel les donne : « Formules
// approchées pour la transformation entre des coordonnées de projection suisses et WGS84 », version
// de décembre 2016, chapitre 2 (U. Marti, 1999, d'après Bolliger, 1967).
// https://www.swisstopo.admin.ch/dam/fr/sd-web/KLRCX9XIdXDu/ch1903wgs84-FR.pdf
//
// Leur précision, sur tout le territoire suisse, est meilleure que 0,12" en longitude et 0,08" en
// latitude, soit quelques mètres : bien plus qu'il n'en faut pour une heure de prière, qui ne bouge
// que d'une minute pour une vingtaine de kilomètres. Le document le dit lui-même : elles ne valent
// pas pour la mensuration officielle.
//
// Ce fichier n'importe rien : `scripts/localites-suisses.mjs` le charge tel quel, par le retrait de
// types de Node, pour convertir la liste officielle au moment où il l'engendre. La conversion a donc
// un seul texte, et c'est celui que les tests éprouvent.

export interface Wgs84 {
	/** En degrés décimaux, positive au nord de l'équateur. */
	latitude: number;
	/** En degrés décimaux, positive à l'est de Greenwich. */
	longitude: number;
}

/**
 * Une position MN95 (coordonnée est `E`, coordonnée nord `N`, en mètres) en degrés WGS84.
 *
 * Les coefficients sont ceux du document, recopiés sans arrondi ni réécriture, dans l'ordre où il
 * les donne.
 */
export function lv95ToWgs84(east: number, north: number): Wgs84 {
	// 1. Le système civil, Berne à l'origine, en unités de 1 000 km.
	const y = (east - 2_600_000) / 1_000_000;
	const x = (north - 1_200_000) / 1_000_000;

	// 2. La longitude et la latitude, en unités de 10 000".
	const lambda =
		2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
	const phi =
		16.9023892 +
		3.238272 * x -
		0.270978 * y * y -
		0.002528 * x * x -
		0.0447 * y * y * x -
		0.014 * x * x * x;

	// 3. En degrés : 10 000" valent 100 / 36 degrés.
	return { latitude: (phi * 100) / 36, longitude: (lambda * 100) / 36 };
}

// La recherche dans la liste officielle des localités suisses, embarquée dans le serveur.
//
// Ces tests lisent la vraie liste, celle que `scripts/localites-suisses.mjs` a engendrée et que le
// serveur construit incorpore : ce qu'ils trouvent est ce qu'une personne trouvera. Ils ne fixent
// pas le nombre exact de localités, qui change d'une version à l'autre, mais ce qu'une recherche
// doit rendre en premier.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findLocality, findLocalityAt, LOCALITIES_SOURCE, searchLocalities } from './localities.js';

/** Le premier résultat d'une recherche, sous la forme « NPA Nom (canton) ». */
function premier(requete: string): string {
	const [trouve] = searchLocalities(requete);
	return trouve ? `${trouve.postcode} ${trouve.name} (${trouve.canton})` : 'rien';
}

/**
 * Chaque ligne de la liste, lue ici dans le fichier, sans passer par le module qu'on éprouve : NPA,
 * nom et canton.
 */
const LIGNES = readFileSync(new URL('./localities.csv', import.meta.url), 'utf8')
	.split(/\r?\n/)
	.filter((ligne) => /^\d{4};/.test(ligne))
	.map((ligne) => {
		const [postcode, name, , canton] = ligne.split(';');
		return { postcode: postcode as string, name: name as string, canton: canton as string };
	});

describe('LOCALITIES_SOURCE', () => {
	it('nomme la liste officielle, sa version et la source à citer', () => {
		expect(LOCALITIES_SOURCE.title).toBe(
			'Répertoire officiel des localités avec le code postal et le périmètre'
		);
		expect(LOCALITIES_SOURCE.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(LOCALITIES_SOURCE.credit.fr).toBe('Office fédéral de topographie swisstopo');
		expect(LOCALITIES_SOURCE.credit.de).toBe('Bundesamt für Landestopografie swisstopo');
		expect(LOCALITIES_SOURCE.credit.it).toBe('Ufficio federale di topografia swisstopo');
		expect(LOCALITIES_SOURCE.credit.en).toBe('Federal Office of Topography swisstopo');
		expect(LOCALITIES_SOURCE.credit.ar).toBe('©swisstopo');
		expect(LOCALITIES_SOURCE.termsUrl).toBe(
			'https://www.swisstopo.admin.ch/fr/conditions-utilisation-geodonnees-et-geoservices-gratuit'
		);
	});

	it('compte les quelque 4 000 localités et NPA de la liste', () => {
		expect(LOCALITIES_SOURCE.count).toBeGreaterThan(4000);
	});
});

describe('searchLocalities, par nom', () => {
	it('« bienne » trouve Biel/Bienne', () => {
		expect(premier('bienne')).toBe('2502 Biel/Bienne (BE)');
		expect(premier('biel')).toBe('2502 Biel/Bienne (BE)');
	});

	it('« zurich » trouve Zürich, sans tenir compte des accents ni de la casse', () => {
		expect(premier('zurich')).toBe('8001 Zürich (ZH)');
		expect(premier('ZURICH')).toBe('8001 Zürich (ZH)');
		expect(premier('Zürich')).toBe('8001 Zürich (ZH)');
		expect(premier('  zürich ')).toBe('8001 Zürich (ZH)');
	});

	it('trouve les chefs-lieux par leur nom officiel', () => {
		expect(premier('geneve')).toBe('1201 Genève (GE)');
		expect(premier('Bern')).toBe('3004 Bern (BE)');
		expect(premier('lugano')).toBe('6900 Lugano (TI)');
		expect(premier('neuchatel')).toBe('2000 Neuchâtel (NE)');
	});

	it('trouve une ville par son nom dans une autre langue nationale, ou en anglais', () => {
		expect(premier('Genf')).toBe('1201 Genève (GE)');
		expect(premier('Ginevra')).toBe('1201 Genève (GE)');
		expect(premier('Geneva')).toBe('1201 Genève (GE)');
		expect(premier('Berne')).toBe('3004 Bern (BE)');
		expect(premier('Bâle')).toBe('4001 Basel (BS)');
		expect(premier('Lucerne')).toBe('6003 Luzern (LU)');
		expect(premier('Neuenburg')).toBe('2000 Neuchâtel (NE)');
		expect(premier('saint-gall')).toBe('9000 St. Gallen (SG)');
		expect(premier('San Gallo')).toBe('9000 St. Gallen (SG)');
	});

	it('lit « Saint », « Sainte » et « Sankt » comme les abréviations officielles', () => {
		expect(premier('saint-imier')).toBe('2610 St-Imier (BE)');
		expect(premier('St Imier')).toBe('2610 St-Imier (BE)');
		expect(premier('sainte croix')).toBe('1450 Ste-Croix (VD)');
		expect(premier('sankt gallen')).toBe('9000 St. Gallen (SG)');
	});

	it('met la localité la plus probable en premier dès les premières lettres', () => {
		expect(premier('laus')).toBe('1003 Lausanne (VD)');
		expect(premier('gen')).toBe('1201 Genève (GE)');
		expect(premier('zur')).toBe('8001 Zürich (ZH)');
		expect(premier('lug')).toBe('6900 Lugano (TI)');
	});

	it('ne rend chaque localité qu’une fois, sous son plus petit NPA', () => {
		const resultats = searchLocalities('zurich');
		expect(resultats.filter((localite) => localite.name === 'Zürich')).toHaveLength(1);
		const bale = searchLocalities('basel');
		expect(bale.filter((localite) => localite.name === 'Basel')).toHaveLength(1);
	});

	it('trouve une localité par sa commune', () => {
		const resultats = searchLocalities('val-de-ruz');
		expect(resultats.length).toBeGreaterThan(0);
		expect(resultats.every((localite) => localite.municipality === 'Val-de-Ruz')).toBe(true);
	});

	it('cherche un nom officiel sans le canton qui le termine', () => {
		// « Muri AG », « Wil SG » : le canton fait partie du nom officiel, pour distinguer des
		// homonymes. Qui tape « muri » cherche Muri AG avant Murist, et « wil » doit rendre les trois
		// Wil avant Willerzell ou Wildhaus.
		expect(premier('muri')).toBe('5630 Muri AG (AG)');
		expect(
			searchLocalities('wil')
				.slice(0, 3)
				.map((localite) => localite.name)
		).toEqual(['Wil AG', 'Wil SG', 'Wil ZH']);
	});

	it('trouve un nom bilingue écrit dans l’autre ordre', () => {
		expect(premier('Bienne/Biel')).toBe('2502 Biel/Bienne (BE)');
		expect(premier('bienne biel')).toBe('2502 Biel/Bienne (BE)');
	});
});

describe('searchLocalities, avec le canton', () => {
	// En Suisse, on lève un homonyme en ajoutant l'abréviation du canton : « Biel BE ». La recherche
	// cherchait « biel be » comme un seul texte, et le trouvait dans « Biel-Benken BL », à 45 km.
	it('lit l’abréviation du canton qui suit le nom', () => {
		expect(premier('Biel BE')).toBe('2502 Biel/Bienne (BE)');
		expect(premier('Bern BE')).toBe('3004 Bern (BE)');
		expect(premier('Lausanne VD')).toBe('1003 Lausanne (VD)');
		expect(premier('Zurich ZH')).toBe('8001 Zürich (ZH)');
		expect(premier('Genève GE')).toBe('1201 Genève (GE)');
		expect(premier('Fribourg FR')).toBe('1700 Fribourg (FR)');
	});

	it('la lit aussi entre parenthèses, en minuscules ou après une virgule', () => {
		expect(premier('Biel (BE)')).toBe('2502 Biel/Bienne (BE)');
		expect(premier('Biel/Bienne (BE)')).toBe('2502 Biel/Bienne (BE)');
		expect(premier('Biel/Bienne(BE)')).toBe('2502 Biel/Bienne (BE)');
		expect(premier('biel be')).toBe('2502 Biel/Bienne (BE)');
		expect(premier('Biel, BE')).toBe('2502 Biel/Bienne (BE)');
	});

	it('met d’abord les localités de ce canton, puis celles dont le nom porte ces lettres', () => {
		const resultats = searchLocalities('Biel BE');
		const premiere = resultats.findIndex((localite) => localite.canton !== 'BE');
		expect(premiere).toBeGreaterThan(0);
		expect(resultats.slice(premiere).every((localite) => localite.canton !== 'BE')).toBe(true);
		// « biel be » peut aussi être le début de « Biel-Benken » : la localité reste proposée, après.
		expect(resultats.map((localite) => localite.name)).toContain('Biel-Benken BL');
	});

	it('comprend la forme d’affichage « NPA Nom (CANTON) »', () => {
		expect(premier('2502 Biel/Bienne (BE)')).toBe('2502 Biel/Bienne (BE)');
		expect(premier('1000 Lausanne 25 (VD)')).toBe('1000 Lausanne 25 (VD)');
		expect(premier('7032 Laax GR 2 (GR)')).toBe('7032 Laax GR 2 (GR)');
		expect(premier('1227 Carouge GE (GE)')).toBe('1227 Carouge GE (GE)');
	});

	it('retrouve en premier chaque localité de la liste sous sa forme d’affichage', () => {
		// Un écran qui remet dans le champ la localité choisie, sous cette forme, doit la retrouver.
		const perdues = LIGNES.map(({ postcode, name, canton }) => `${postcode} ${name} (${canton})`)
			.filter((affichee) => premier(affichee) !== affichee)
			.map((affichee) => `${affichee} -> ${premier(affichee)}`);
		expect(perdues).toEqual([]);
	});

	it('retrouve en premier chaque localité sous « Nom (CANTON) », sans le NPA', () => {
		const perdues = LIGNES.filter(({ name, canton }) => {
			const [trouve] = searchLocalities(`${name} (${canton})`);
			return trouve?.name !== name || trouve.canton !== canton;
		}).map(({ name, canton }) => `${name} (${canton}) -> ${premier(`${name} (${canton})`)}`);
		expect([...new Set(perdues)]).toEqual([]);
	});
});

describe('searchLocalities, d’autres façons d’écrire', () => {
	it('lit un NPA suivi d’une virgule, comme dans une adresse', () => {
		expect(premier('1201, Geneve')).toBe('1201 Genève (GE)');
		expect(premier('Geneve, 1201')).toBe('1201 Genève (GE)');
	});

	it('accepte le préfixe CH- devant le NPA', () => {
		expect(premier('CH-2502')).toBe('2502 Biel/Bienne (BE)');
		expect(premier('CH-2502 Biel')).toBe('2502 Biel/Bienne (BE)');
		expect(premier('ch-1201 geneve')).toBe('1201 Genève (GE)');
	});

	it('lit un NPA que la liste ne connaît pas comme celui de la grande localité voisine', () => {
		// 8000, 3000, 1200 : des NPA de cases postales ou de grands destinataires, que le répertoire
		// des localités ne contient pas. La ville voisine qui a le plus de NPA vient d'abord.
		expect(premier('8000 Zürich')).toBe('8001 Zürich (ZH)');
		expect(premier('8000')).toBe('8001 Zürich (ZH)');
		expect(premier('3000 Bern')).toBe('3004 Bern (BE)');
		expect(premier('1200 Genève')).toBe('1201 Genève (GE)');
		// Un NPA que la liste connaît reste pris tel quel : il ne correspond pas à Zurich.
		expect(searchLocalities('2502 zurich')).toEqual([]);
	});
});

describe('searchLocalities, pendant la frappe (relecture du lot 2)', () => {
	it('lit une parenthèse encore ouverte comme le début d’un mot, et non comme un canton', () => {
		// « Charmey (Gr » est le nom qualifié qu'une personne est en train de taper : la liste ne
		// doit pas se vider à la deuxième lettre après la parenthèse.
		expect(premier('Charmey (Gr')).toBe('1637 Charmey (Gruyère) (FR)');
		expect(premier('Aproz (Ne')).toBe('1994 Aproz (Nendaz) (VS)');
		expect(premier('Egg (Fl')).toBe('9231 Egg (Flawil) (SG)');
		expect(premier('Chapelle (Gl')).toBe('1608 Chapelle (Glâne) (FR)');
		expect(premier('Campo (Bl')).toBe('6720 Campo (Blenio) (TI)');
		// Une parenthèse ouverte sur un vrai canton le lit encore, localités de ce canton d'abord.
		expect(premier('Biel (BE')).toBe('2502 Biel/Bienne (BE)');
	});

	it('garde des places au sens littéral quand les localités du canton rempliraient la liste', () => {
		const noms = (requete: string) => searchLocalities(requete).map((localite) => localite.name);
		expect(noms('la ne')).toEqual(expect.arrayContaining(['La Neuveville', 'La Neirigue']));
		expect(noms('le gr')).toContain('Le Grand-Saconnex');
		expect(noms('la ti')).toContain('La Tine');
		// Les localités du canton restent en tête, et la liste garde sa borne.
		expect(searchLocalities('la ne')[0]?.canton).toBe('NE');
		expect(searchLocalities('la ne')).toHaveLength(10);
	});

	it('propose d’abord la ville d’un NPA de cases postales, et non une localité voisine', () => {
		// 1211 : les cases postales de Genève. 3030 : celles de Berne. Ni l'un ni l'autre n'est dans
		// la liste, et leurs trois premiers chiffres mènent à Grand-Lancy et à Hinterkappelen.
		expect(premier('1211')).toBe('1201 Genève (GE)');
		expect(premier('1211 Genève')).toBe('1201 Genève (GE)');
		expect(premier('3030')).toBe('3004 Bern (BE)');
		expect(premier('3030 Bern')).toBe('3004 Bern (BE)');
		// Une ville n'y figure qu'une fois, sous son plus petit NPA.
		const geneve = searchLocalities('1211').filter((localite) => localite.name === 'Genève');
		expect(geneve).toHaveLength(1);
	});
});

describe('searchLocalities, sans trémas (relecture du lot 3)', () => {
	// Un clavier sans trémas, anglais ou arabe, écrit « Zuerich » : c'est justement celui de la
	// personne à qui l'écran arabe demande de taper en lettres latines. La recherche ne trouvait rien.

	/** « Zürich » écrit comme sur un clavier sans trémas, sans passer par le module qu'on éprouve. */
	const TREMAS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue' };
	const sansTremas = (nom: string) =>
		nom.replace(/[äöüÄÖÜ]/g, (lettre) => TREMAS[lettre] ?? lettre);

	it('lit « ue », « oe » et « ae » comme « ü », « ö » et « ä »', () => {
		expect(premier('Zuerich')).toBe('8001 Zürich (ZH)');
		expect(premier('Koeniz')).toBe('3098 Köniz (BE)');
		expect(premier('Muensterlingen')).toBe('8596 Münsterlingen (TG)');
		expect(premier('Naefels')).toBe('8752 Näfels (GL)');
		expect(premier('Duedingen')).toBe('3186 Düdingen (FR)');
		expect(premier('zueri')).toBe('8001 Zürich (ZH)');
		expect(premier('8050 Zuerich')).toBe('8050 Zürich (ZH)');
	});

	it('trouve encore sans trémas ni « e », comme avant', () => {
		expect(premier('Zurich')).toBe('8001 Zürich (ZH)');
		expect(premier('Koniz')).toBe('3098 Köniz (BE)');
		expect(premier('Munsterlingen')).toBe('8596 Münsterlingen (TG)');
	});

	it('garde les noms qui s’écrivent vraiment avec « ue », « oe » ou « ae »', () => {
		expect(premier('Frauenfeld')).toBe('8500 Frauenfeld (TG)');
		expect(premier('Feuerthalen')).toBe('8245 Feuerthalen (ZH)');
		expect(premier('Mauensee')).toBe('6216 Mauensee (LU)');
		expect(premier('Oensingen')).toBe('4702 Oensingen (SO)');
		expect(premier('Coeuve')).toBe('2932 Coeuve (JU)');
		expect(premier('Aeugst am Albis')).toBe('8914 Aeugst am Albis (ZH)');
		expect(premier('Bellevue')).toBe('1293 Bellevue (GE)');
		expect(searchLocalities('Buenos Aires')).toEqual([]);
	});

	it('retrouve en premier chaque localité à trémas, écrite sans trémas, avec son NPA et son canton', () => {
		const lignes = LIGNES.filter(({ name }) => /[äöüÄÖÜ]/.test(name));
		expect(lignes.length).toBeGreaterThan(300);
		const perdues = lignes
			.map(({ postcode, name, canton }) => ({
				tapee: `${postcode} ${sansTremas(name)} (${canton})`,
				attendue: `${postcode} ${name} (${canton})`
			}))
			.filter(({ tapee, attendue }) => premier(tapee) !== attendue)
			.map(({ tapee }) => `${tapee} -> ${premier(tapee)}`);
		expect(perdues).toEqual([]);
	});

	it('retrouve en premier chaque localité à trémas sous « Nom (CANTON) », écrit sans trémas', () => {
		const perdues = LIGNES.filter(({ name }) => /[äöüÄÖÜ]/.test(name))
			.filter(({ name, canton }) => {
				const [trouve] = searchLocalities(`${sansTremas(name)} (${canton})`);
				return trouve?.name !== name || trouve.canton !== canton;
			})
			.map(
				({ name, canton }) =>
					`${sansTremas(name)} (${canton}) -> ${premier(`${sansTremas(name)} (${canton})`)}`
			);
		expect([...new Set(perdues)]).toEqual([]);
	});
});

describe('searchLocalities, par NPA', () => {
	it('« 2502 » trouve Biel/Bienne', () => {
		const resultats = searchLocalities('2502');
		expect(premier('2502')).toBe('2502 Biel/Bienne (BE)');
		expect(resultats.every((localite) => localite.postcode === '2502')).toBe(true);
	});

	it('rend toutes les localités d’un NPA partagé, la principale en premier', () => {
		const noms = searchLocalities('6900').map((localite) => localite.name);
		expect(noms[0]).toBe('Lugano');
		expect(noms).toEqual(expect.arrayContaining(['Lugano', 'Massagno', 'Paradiso']));
	});

	it('un NPA commencé donne les NPA qui commencent par ces chiffres, dans l’ordre', () => {
		const npa = searchLocalities('250').map((localite) => localite.postcode);
		expect(npa.length).toBeGreaterThan(0);
		expect(npa.every((code) => code.startsWith('250'))).toBe(true);
		expect([...npa].sort()).toEqual(npa);
	});

	it('accepte un NPA suivi du nom', () => {
		expect(premier('2502 biel')).toBe('2502 Biel/Bienne (BE)');
		expect(premier('1227 acacias')).toBe('1227 Les Acacias (GE)');
		expect(searchLocalities('2502 zurich')).toEqual([]);
	});

	it('accepte aussi le nom suivi du NPA', () => {
		expect(premier('bienne 2502')).toBe('2502 Biel/Bienne (BE)');
		expect(premier('Zürich 8050')).toBe('8050 Zürich (ZH)');
	});

	it('garde au nom le nombre qui en fait partie', () => {
		// « Lausanne 25 » est un nom officiel, pas Lausanne au NPA 25.
		expect(premier('lausanne 25')).toBe('1000 Lausanne 25 (VD)');
		expect(premier('laax gr 2')).toBe('7032 Laax GR 2 (GR)');
	});

	it('lit un NPA tapé en chiffres arabes orientaux ou persans comme en chiffres latins', () => {
		// Un clavier arabe de téléphone tape ces chiffres ; la liste, comme toute l'application, est
		// en chiffres latins (ADR 0007). Écrits par leur code, pour qu'aucun ne se perde à la relecture.
		const oriental = String.fromCharCode(0x0662, 0x0665, 0x0660, 0x0662);
		const persan = String.fromCharCode(0x06f2, 0x06f5, 0x06f0, 0x06f2);
		expect(premier(oriental)).toBe('2502 Biel/Bienne (BE)');
		expect(premier(persan)).toBe('2502 Biel/Bienne (BE)');
	});
});

describe('searchLocalities, les bornes', () => {
	it('rend au plus 10 résultats, ou le nombre demandé, et jamais plus de 50', () => {
		expect(searchLocalities('st')).toHaveLength(10);
		expect(searchLocalities('st', 3)).toHaveLength(3);
		expect(searchLocalities('st', 500)).toHaveLength(50);
		expect(searchLocalities('st', 0)).toHaveLength(1);
	});

	it('prend la borne par défaut quand le nombre demandé n’en est pas un', () => {
		// Un paramètre d'adresse absent ou mal tapé arrive en NaN après `Number(...)`.
		expect(searchLocalities('st', Number.NaN)).toHaveLength(10);
		expect(searchLocalities('2502', Number.POSITIVE_INFINITY)).toHaveLength(1);
	});

	it('ne rend rien pour une recherche vide, trop courte, ou sans réponse', () => {
		expect(searchLocalities('')).toEqual([]);
		expect(searchLocalities('   ')).toEqual([]);
		expect(searchLocalities('z')).toEqual([]);
		expect(searchLocalities('2')).toEqual([]);
		expect(searchLocalities('qqqqq')).toEqual([]);
		expect(searchLocalities('0000')).toEqual([]);
	});
});

describe('les positions', () => {
	// Les coordonnées publiées de chaque ville (infobox de Wikipédia en anglais, relevée le
	// 26.09.2026). Le point de la liste officielle est un point quelconque dans le périmètre du
	// NPA : il tombe dans la ville, à quelques centièmes de degré de son centre.
	const VILLES: [string, string, number, number][] = [
		['2502', 'Biel/Bienne', 47.133, 7.25],
		['1201', 'Genève', 46.20167, 6.14694],
		['6900', 'Lugano', 46.005, 8.9525],
		['8001', 'Zürich', 47.37444, 8.54111],
		['3011', 'Bern', 46.94806, 7.4475]
	];

	for (const [npa, nom, latitude, longitude] of VILLES) {
		it(`${npa} ${nom} tombe à moins de 0,03° de ${latitude} N, ${longitude} E`, () => {
			const localite = findLocality(npa, nom);
			expect(localite).not.toBeNull();
			expect(Math.abs((localite?.latitude ?? 0) - latitude)).toBeLessThan(0.03);
			expect(Math.abs((localite?.longitude ?? 0) - longitude)).toBeLessThan(0.03);
		});
	}
});

describe('findLocality', () => {
	it('retrouve une localité par son NPA et son nom exacts, et rien d’autre', () => {
		expect(findLocality('2502', 'Biel/Bienne')?.municipality).toBe('Biel/Bienne');
		expect(findLocality('2502', 'Zürich')).toBeNull();
		expect(findLocality('2502', 'biel/bienne')).toBeNull();
		expect(findLocality('9999', 'Biel/Bienne')).toBeNull();
	});

	it('rend le Liechtenstein sous le code FL', () => {
		expect(findLocality('9490', 'Vaduz')?.canton).toBe('FL');
	});
});

describe('findLocalityAt', () => {
	// L'écran des prières n'enregistre que la position : c'est elle qui redit la localité choisie.
	it('retrouve la localité d’une position prise dans la liste', () => {
		const bienne = findLocality('2502', 'Biel/Bienne');
		expect(bienne).not.toBeNull();
		expect(findLocalityAt(bienne?.latitude ?? 0, bienne?.longitude ?? 0)).toEqual(bienne);
		const vaduz = findLocality('9490', 'Vaduz');
		expect(findLocalityAt(vaduz?.latitude ?? 0, vaduz?.longitude ?? 0)?.name).toBe('Vaduz');
	});

	it('ne rend rien pour une position saisie à la main', () => {
		expect(findLocalityAt(48.8566, 2.3522)).toBeNull();
		expect(findLocalityAt(47.1368, 7.2468)).toBeNull();
	});
});

// L'âge des sauvegardes distantes, vérifié chaque nuit (ADR 0037).
//
// Ces tests protègent une promesse écrite : « Ce que vous effacez reste au plus 182 jours dans ces
// sauvegardes ». Le stockage efface ce qui est échu ; le serveur ne peut pas l'y forcer, et ne le
// fait pas à sa place (ADR 0037). Il regarde, et c'est ce que fait la règle : elle lit la liste des
// objets telle que `rclone lsjson` la rend, et désigne ce qui a dépassé l'âge promis pour son
// préfixe.
//
// Deux façons de rater, et chacune a ses tests. La première est de laisser passer un objet trop
// vieux. La seconde est plus sournoise : **se taire quand on n'a pas pu regarder**. Une liste vide,
// une liste qui ne montre pas les objets de la nuit, une date illisible, une entrée qui n'est pas du
// JSON ne veulent pas dire « rien à signaler ». La veille a déjà porté un contrôle de ce genre, qui
// affirmait pour toujours qu'aucun verrou ne traînait sans avoir jamais rien lu (étape 12).
//
// Chaque objet de ces tests porte le nom que la nuit lui donne : la date de la vidange, quelques
// minutes avant le dépôt. La règle lit aussi cette date, et un nom mal daté fausserait le verdict.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AGE_PROMIS, CYCLE_DE_VIE, EntreeIllisible, verifier } from './ages.mjs';

const SCRIPT = fileURLToPath(new URL('./ages.mjs', import.meta.url));
const CONDITIONS = fileURLToPath(new URL('../../docs/CONDITIONS.md', import.meta.url));
const PAGE_DE_GARDE = fileURLToPath(new URL('../../scripts/conditions-pdf.mjs', import.meta.url));

/** L'heure où la tâche de nuit vérifie, juste après l'envoi et la relecture. */
const MAINTENANT = '2026-09-23T02:25:00Z';
const JOUR = 86_400_000;
const MINUTE = 60_000;

/** Les minutes qu'une nuit ordinaire met, dans ces tests, entre la vidange et le dépôt. */
const VIDANGE = 3;

/** L'instant d'il y a tant de jours et de minutes, en millisecondes. */
const ilYAMs = (jours, minutes = 0) => Date.parse(MAINTENANT) - jours * JOUR - minutes * MINUTE;

/**
 * Une date telle que rclone l'écrit pour un objet de ce stockage : RFC 3339, neuf décimales, en
 * UTC. C'est la forme relevée sur une vraie liste, pas une forme supposée.
 */
function ilYA(jours, minutes = 0) {
	return new Date(ilYAMs(jours, minutes)).toISOString().replace(/\.(\d{3})Z$/, '.$1000000Z');
}

/** L'instant tel qu'un nom d'objet l'écrit : `2026-09-21T021503Z`. */
function horodatage(ms) {
	const iso = new Date(ms).toISOString();
	return `${iso.slice(0, 10)}T${iso.slice(11, 19).replaceAll(':', '')}Z`;
}

/**
 * Un objet, avec les champs que `rclone lsjson` rend vraiment, et pas seulement ceux qu'on lit.
 * `--no-mimetype` retire `MimeType`, et `--use-server-modtime` met dans `ModTime` la date de dépôt.
 */
function objet(chemin, jours, minutes = 0) {
	return {
		Path: chemin,
		Name: chemin.split('/').at(-1),
		Size: 1024,
		ModTime: ilYA(jours, minutes),
		IsDir: false,
		Tier: 'STANDARD'
	};
}

/** La sortie de `rclone lsjson` : un tableau, un objet par ligne. */
const liste = (...objets) => `[\n${objets.map((o) => JSON.stringify(o)).join(',\n')}\n]\n`;

/**
 * Le chemin d'une archive déposée il y a tant de jours et de minutes. Son nom porte l'heure de la
 * vidange, quelques minutes plus tôt, comme `destinations.mjs` le fait chaque nuit.
 */
const archive = (prefixe, jours = 0, minutes = 0) =>
	`${prefixe}/jadwal-${horodatage(ilYAMs(jours, minutes + VIDANGE))}.dump.age`;

/** L'archive que la nuit vient d'envoyer, et son empreinte : la tâche les passe à la règle. */
const NUIT = archive('quotidien');
const ENVOYES = [NUIT, `${NUIT}.sha256`];
const DE_LA_NUIT = () => ENVOYES.map((chemin) => objet(chemin, 0));

describe('les âges promis', () => {
	it('sont ceux du cycle de vie du stockage, plus le jour qu’il peut mettre à effacer', () => {
		// Le fournisseur efface un objet échu « en général dans les 24 heures ». Le cycle de vie
		// reste réglé à 8, 29 et 181 jours ; ce qui change, c'est ce qu'on promet.
		expect(CYCLE_DE_VIE).toEqual({ quotidien: 8, hebdo: 29, mensuel: 181 });
		expect(AGE_PROMIS).toEqual({ quotidien: 9, hebdo: 30, mensuel: 182 });
	});

	it('disent pour mensuel/ la durée écrite dans les conditions d’utilisation', () => {
		// Les conditions ne connaissent qu'une durée, celle du préfixe qui garde le plus longtemps.
		// Si le texte et la règle divergent, l'un des deux ment : ce test tombe.
		const texte = readFileSync(CONDITIONS, 'utf8');
		const phrases = [
			/\*\*(\d+) jours au plus\*\*/g,
			/reste au plus (\d+) jours dans ces sauvegardes/g,
			/Passé (\d+) jours, aucune sauvegarde/g
		];
		const durees = phrases.flatMap((motif) => [...texte.matchAll(motif)].map((t) => Number(t[1])));
		// Le témoin : trois phrases trouvées. Reformulées, elles échapperaient à la comparaison.
		expect(durees, 'les trois phrases des conditions qui disent la durée').toHaveLength(3);
		for (const duree of durees) expect(duree).toBe(AGE_PROMIS.mensuel);
	});

	it('disent pour mensuel/ la durée que la page de garde du PDF soumet au juriste', () => {
		// La page de garde n'est pas dans les conditions : elle est écrite dans le script qui fait
		// le PDF, et le point sur les sauvegardes y redit la durée, dans son titre et dans son corps.
		// Lu comme un texte, sans importer le script : ce test ne dépend pas de Chrome.
		const script = readFileSync(PAGE_DE_GARDE, 'utf8');
		const phrases = [
			/reste jusqu’à (\d+) jours dans les sauvegardes/g,
			/<strong>(\d+) jours au\s+plus/g
		];
		const durees = phrases.flatMap((motif) => [...script.matchAll(motif)].map((t) => Number(t[1])));
		expect(durees, 'le titre et le corps du point sur les sauvegardes').toHaveLength(2);
		for (const duree of durees) expect(duree).toBe(AGE_PROMIS.mensuel);
	});
});

describe('verifier', () => {
	it.each([
		['mensuel', 183, 182],
		['hebdo', 31, 30],
		['quotidien', 10, 9]
	])(
		'signale un objet de %s/ de %i jours, plus vieux que les %i promis',
		(prefixe, jours, promis) => {
			const chemin = archive(prefixe, jours);
			const resultat = verifier(liste(objet(chemin, jours)), MAINTENANT);
			expect(resultat.tropVieux).toHaveLength(1);
			const [trouve] = resultat.tropVieux;
			expect(trouve.chemin).toBe(chemin);
			expect(trouve.prefixe).toBe(prefixe);
			expect(trouve.promis).toBe(promis);
			// Déposé quelques minutes après sa vidange, comme chaque nuit : compté depuis son dépôt.
			expect(trouve.age).toBeCloseTo(jours, 6);
			expect(trouve.depot).toBeUndefined();
			expect(resultat.horsPrefixes).toEqual([]);
		}
	);

	it.each([
		['mensuel', 182],
		['hebdo', 30],
		['quotidien', 9]
	])('laisse passer un objet de %s/ de %i jours tout juste', (prefixe, jours) => {
		const resultat = verifier(liste(objet(archive(prefixe, jours), jours)), MAINTENANT);
		expect(resultat).toEqual({ verifies: 1, tropVieux: [], horsPrefixes: [] });
	});

	it('tranche à la minute : 182 jours et une minute, c’est trop', () => {
		const chemin = archive('mensuel', 182, 1);
		const resultat = verifier(liste(objet(chemin, 182, 1)), MAINTENANT);
		expect(resultat.tropVieux.map((o) => o.chemin)).toEqual([chemin]);
	});

	it('compte les empreintes .sha256 comme les archives', () => {
		// Une empreinte ne contient aucune donnée, mais elle part et doit partir avec son archive :
		// une empreinte qui reste dirait que le cycle de vie ne fait pas son travail.
		const empreinte = `${archive('quotidien', 10)}.sha256`;
		const resultat = verifier(
			liste(objet(archive('quotidien', 2), 2), objet(empreinte, 10)),
			MAINTENANT
		);
		expect(resultat.verifies).toBe(2);
		expect(resultat.tropVieux.map((o) => o.chemin)).toEqual([empreinte]);
	});

	it('signale un objet hors des trois préfixes, même jeune', () => {
		// Aucune promesse ne dit quand il part, ni même si un cycle de vie le couvre : on ne peut
		// pas le déclarer dans les temps.
		const inconnus = [
			'autre/notes.txt',
			'jadwal-2026-09-21.dump.age', // à la racine, comme avant l'ADR 0037
			'Quotidien/jadwal-2026-09-22T021503Z.dump.age',
			'quotidiens/jadwal-2026-09-22T021503Z.dump.age'
		];
		const resultat = verifier(
			liste(objet(archive('quotidien', 1), 1), ...inconnus.map((chemin) => objet(chemin, 1))),
			MAINTENANT
		);
		expect(resultat.verifies).toBe(5);
		expect(resultat.tropVieux).toEqual([]);
		expect(resultat.horsPrefixes.map((o) => o.chemin)).toEqual(inconnus);
		expect(resultat.horsPrefixes[0]?.age).toBeCloseTo(1, 6);
	});

	it('ignore les dossiers, qui n’ont pas d’âge', () => {
		const dossier = { Path: 'mensuel', Name: 'mensuel', Size: -1, ModTime: '', IsDir: true };
		const resultat = verifier(liste(dossier, objet(archive('mensuel', 3), 3)), MAINTENANT);
		expect(resultat).toEqual({ verifies: 1, tropVieux: [], horsPrefixes: [] });
	});

	it('lit un décalage horaire comme rclone l’écrit', () => {
		// 182 jours tout juste, écrits avec une heure de décalage : même instant, même verdict.
		const juste = new Date(Date.parse(MAINTENANT) - 182 * JOUR + 3_600_000);
		const avecDecalage = `${juste.toISOString().slice(0, 19)}.034468261+01:00`;
		const dans = { ...objet(archive('mensuel', 182), 0), ModTime: avecDecalage };
		expect(verifier(liste(dans), MAINTENANT).tropVieux).toEqual([]);
		// Une minute plus tôt, il est trop vieux.
		const avant = new Date(juste.getTime() - 60_000);
		const trop = { ...dans, ModTime: `${avant.toISOString().slice(0, 19)}+01:00` };
		expect(verifier(liste(trop), MAINTENANT).tropVieux).toHaveLength(1);
	});

	it('ne signale rien sur une nuit ordinaire, même avec des objets à la limite', () => {
		const objets = [];
		for (let jour = 0; jour <= 9; jour += 1) {
			objets.push(objet(archive('quotidien', jour), jour));
			objets.push(objet(`${archive('quotidien', jour)}.sha256`, jour));
		}
		for (let jour = 0; jour <= 30; jour += 7) objets.push(objet(archive('hebdo', jour), jour));
		for (let jour = 0; jour <= 182; jour += 30) {
			objets.push(objet(archive('mensuel', jour), jour));
		}
		objets.push(objet(archive('mensuel', 182), 182));
		objets.push(objet('mensuel/jadwal-limite.dump.age', 182));
		// L'objet d'essai que le playbook écrit pour éprouver le verrou vit sous quotidien/.
		objets.push(objet(`quotidien/verrou-eprouve-${horodatage(ilYAMs(2, 1))}.txt`, 2));

		const resultat = verifier(liste(...objets), MAINTENANT);
		expect(resultat.verifies).toBe(objets.length);
		expect(resultat.tropVieux).toEqual([]);
		expect(resultat.horsPrefixes).toEqual([]);
	});

	it('passe quand la liste montre ce que la nuit vient d’envoyer', () => {
		const resultat = verifier(
			liste(objet(archive('mensuel', 40), 40), ...DE_LA_NUIT()),
			MAINTENANT,
			ENVOYES
		);
		expect(resultat).toEqual({ verifies: 3, tropVieux: [], horsPrefixes: [] });
	});
});

describe('la date écrite dans le nom', () => {
	// Avec `--use-server-modtime`, la date de la liste est celle du dépôt. Un objet recopié (un
	// changement de stockage, une copie entre seaux) repart donc de zéro, et le cycle de vie du
	// nouveau seau le garde encore un plein délai. Le nom, lui, garde la date de la vidange, et une
	// archive contient les données de ce moment-là.
	const RECOPIE = 'mensuel/jadwal-2026-03-01T021503Z.dump.age';

	it('compte depuis le nom une archive recopiée : vidée il y a 206 jours, déposée il y a 13', () => {
		const resultat = verifier(liste(objet(RECOPIE, 13), ...DE_LA_NUIT()), MAINTENANT, ENVOYES);
		expect(resultat.tropVieux).toHaveLength(1);
		const [trouve] = resultat.tropVieux;
		expect(trouve.chemin).toBe(RECOPIE);
		// Du 2026-03-01T02:15:03Z au 2026-09-23T02:25:00Z : 206 jours et 9 min 57 s.
		expect(trouve.age).toBeCloseTo(206 + (9 * 60 + 57) / 86_400, 6);
		expect(trouve.depot, 'l’âge que dit le stockage, pour le journal').toBeCloseTo(13, 6);
	});

	it.each([
		['une archive', RECOPIE],
		['son empreinte', `${RECOPIE}.sha256`],
		['l’objet d’essai du verrou', 'quotidien/verrou-eprouve-2026-09-01T120000Z.txt']
	])('lit la date du nom de %s', (_nom, chemin) => {
		const resultat = verifier(liste(objet(chemin, 1)), MAINTENANT);
		expect(resultat.tropVieux.map((o) => o.chemin)).toEqual([chemin]);
		expect(resultat.tropVieux[0]?.depot).toBeCloseTo(1, 6);
	});

	it('laisse passer un objet déposé moins d’une heure après sa vidange, même à la limite', () => {
		// Le nom est daté du début de la nuit, avant la vidange ; le dépôt vient après la vidange et
		// l'envoi. Compter depuis le nom ferait tomber une nuit ordinaire où le stockage a pris tout
		// son jour pour effacer : 182 jours depuis le dépôt, mais 182 jours et 59 minutes depuis la
		// vidange.
		for (const prefixe of ['quotidien', 'hebdo', 'mensuel']) {
			const jours = AGE_PROMIS[prefixe];
			const chemin = `${prefixe}/jadwal-${horodatage(ilYAMs(jours, 59))}.dump.age`;
			const resultat = verifier(liste(objet(chemin, jours)), MAINTENANT);
			expect(resultat, `${prefixe}/`).toEqual({ verifies: 1, tropVieux: [], horsPrefixes: [] });
		}
	});

	it('compte depuis le nom un objet déposé plus d’une heure après sa vidange', () => {
		// 181 jours et 23 heures depuis le dépôt, mais 182 jours et une minute depuis la vidange : une
		// heure et une minute entre les deux, une minute de trop.
		const chemin = `mensuel/jadwal-${horodatage(ilYAMs(182, 1))}.dump.age`;
		const resultat = verifier(liste(objet(chemin, 181, 23 * 60)), MAINTENANT);
		expect(resultat.tropVieux.map((o) => o.chemin)).toEqual([chemin]);
		expect(resultat.tropVieux[0]?.age).toBeCloseTo(182 + 1 / 1440, 6);
	});

	it('ne rajeunit jamais un objet par une date du nom dans le futur', () => {
		const chemin = 'mensuel/jadwal-2027-01-01T021503Z.dump.age';
		const resultat = verifier(liste(objet(chemin, 183)), MAINTENANT);
		expect(resultat.tropVieux.map((o) => o.chemin)).toEqual([chemin]);
		expect(resultat.tropVieux[0]?.age).toBeCloseTo(183, 6);
		expect(resultat.tropVieux[0]?.depot).toBeUndefined();
	});

	it.each([
		['un jour qui n’existe pas', 'jadwal-2026-02-30T021503Z.dump.age'],
		['un mois qui n’existe pas', 'jadwal-2026-13-01T021503Z.dump.age'],
		['une 25e heure', 'jadwal-2026-03-01T251503Z.dump.age']
	])('garde la date du stockage quand le nom porte %s', (_nom, nom) => {
		// Une date lue de travers pourrait vieillir l'objet à tort, ou le rajeunir.
		expect(verifier(liste(objet(`quotidien/${nom}`, 2)), MAINTENANT)).toEqual({
			verifies: 1,
			tropVieux: [],
			horsPrefixes: []
		});
		const vieux = verifier(liste(objet(`mensuel/${nom}`, 183)), MAINTENANT).tropVieux;
		expect(vieux.map((o) => o.age)).toEqual([expect.closeTo(183, 6)]);
	});

	it.each([
		'mensuel/jadwal-limite.dump.age',
		'mensuel/jadwal-2026-03-01.dump.age',
		'mensuel/copie-2026-03-01T021503Z.dump.age'
	])('garde la date du stockage pour un nom que la nuit n’écrit pas : %s', (chemin) => {
		expect(verifier(liste(objet(chemin, 2)), MAINTENANT)).toEqual({
			verifies: 1,
			tropVieux: [],
			horsPrefixes: []
		});
	});
});

describe('une liste qui ne montre pas ce que la nuit vient d’envoyer', () => {
	// Une liste incomplète, ou faite ailleurs que là où la nuit a écrit, peut très bien ne montrer
	// que des objets dans les âges. Elle ne prouve rien sur ceux qu'elle ne montre pas. Les objets de
	// la nuit, eux, sont forcément chez le stockage : la tâche vient de les envoyer et de les relire.
	it('est refusée, même quand tout ce qu’elle montre est dans les âges', () => {
		const entree = liste(
			objet(archive('quotidien', 2), 2),
			objet(`${archive('quotidien', 2)}.sha256`, 2)
		);
		expect(() => verifier(entree, MAINTENANT, ENVOYES)).toThrow(EntreeIllisible);
		expect(() => verifier(entree, MAINTENANT, ENVOYES)).toThrow(
			`la liste ne montre pas ce que cette nuit vient d'envoyer (${NUIT}, ${NUIT}.sha256)`
		);
	});

	it('est refusée quand il ne lui manque que l’empreinte, qu’elle nomme', () => {
		const entree = liste(objet(NUIT, 0), objet(archive('mensuel', 40), 40));
		expect(() => verifier(entree, MAINTENANT, ENVOYES)).toThrow(`(${NUIT}.sha256) :`);
	});

	it('est refusée comme une liste incomplète, pas comme une liste illisible', () => {
		// Elle a été lue, sans erreur : c'est ce qu'elle montre qui ne va pas, et rclone n'a rien
		// écrit dans le journal. Le message ne doit pas renvoyer à une erreur de lecture.
		let erreur;
		try {
			verifier(liste(objet(archive('mensuel', 40), 40)), MAINTENANT, ENVOYES);
		} catch (e) {
			erreur = e;
		}
		expect(erreur).toBeInstanceOf(EntreeIllisible);
		expect(erreur?.name).toBe('ListeIncomplete');
	});
});

describe('une entrée qui ne permet pas de contrôler', () => {
	const date = ilYA(1);
	it.each([
		['une entrée vide', '', 'vide'],
		['une entrée faite de blancs', '  \n\n', 'vide'],
		// rclone rend `[]` sans erreur pour un chemin qui n'existe pas dans le seau. Juste après un
		// envoi, la destination ne peut pas être vide : on ne regarde pas au bon endroit.
		['une liste sans aucun objet', '[]\n', 'aucun objet'],
		[
			'une liste de dossiers seulement',
			liste({ Path: 'mensuel', ModTime: '', IsDir: true }),
			'aucun objet'
		],
		['autre chose que du JSON', 'ERROR : couldn’t list', 'JSON'],
		['un JSON qui n’est pas un tableau', '{"Path":"quotidien/x"}', 'tableau'],
		['un objet sans chemin', liste({ ModTime: date, IsDir: false }), 'chemin'],
		['un objet au chemin vide', liste({ Path: '', ModTime: date, IsDir: false }), 'chemin'],
		// `--no-modtime` fait rendre une date vide à rclone.
		['une date vide', liste({ Path: 'quotidien/x', ModTime: '', IsDir: false }), 'date'],
		[
			'une date sans heure',
			liste({ Path: 'quotidien/x', ModTime: '2026-09-21', IsDir: false }),
			'date'
		],
		[
			'une date à l’anglaise',
			liste({ Path: 'quotidien/x', ModTime: 'Tue, 01 Sep 2026 12:00:00 GMT', IsDir: false }),
			'date'
		],
		[
			'un jour qui n’existe pas',
			liste({ Path: 'quotidien/x', ModTime: '2026-02-30T02:15:03Z', IsDir: false }),
			'date'
		]
	])('refuse %s', (_nom, entree, fragment) => {
		expect(() => verifier(entree, MAINTENANT)).toThrow(EntreeIllisible);
		expect(() => verifier(entree, MAINTENANT)).toThrow(fragment);
	});

	it('refuse un « maintenant » illisible plutôt que de compter depuis n’importe quand', () => {
		const bonne = liste(objet(archive('quotidien', 1), 1));
		expect(() => verifier(bonne, 'cette nuit')).toThrow(EntreeIllisible);
		expect(() => verifier(bonne, '')).toThrow(EntreeIllisible);
	});
});

describe('le script, lancé comme sur le serveur', () => {
	// `jadwal-sauvegarde.sh` lui passe la liste sur l'entrée standard, puis « maintenant » et les
	// objets que la nuit vient d'envoyer en arguments, dans un conteneur jetable. Il ne lit que son
	// code de sortie et ce qu'il écrit.
	const lancer = (entree, ...args) =>
		spawnSync(process.execPath, [SCRIPT, ...args], { input: entree, encoding: 'utf8' });

	it('sort en 0 quand tout est dans les âges, et dit combien il a vérifié', () => {
		const { status, stdout, stderr } = lancer(
			liste(
				...DE_LA_NUIT(),
				objet(archive('quotidien', 9), 9),
				objet(archive('hebdo', 30), 30),
				objet(archive('mensuel', 182), 182)
			),
			MAINTENANT,
			...ENVOYES
		);
		expect(stderr).toBe('');
		expect(status).toBe(0);
		expect(stdout).toContain('5 objets distants vérifiés');
		expect(stdout).toContain('mensuel/ 182 jours');
	});

	it('sort en erreur sur un objet trop vieux, et le nomme avec son âge', () => {
		const chemin = archive('mensuel', 183, 250);
		const { status, stdout } = lancer(
			liste(...DE_LA_NUIT(), objet(chemin, 183, 250)),
			MAINTENANT,
			...ENVOYES
		);
		expect(status).toBe(1);
		const [premiere, ligne] = stdout.split('\n');
		expect(premiere).toBe(
			"1 objet distant plus vieux que l'âge promis pour son préfixe, sur 3 vérifiés"
		);
		expect(ligne).toBe(`  ${chemin} : 183 jours 4 h 10 min, pour 182 jours promis sous mensuel/`);
		expect(stdout, 'avec la marche à suivre').toContain('docs/EXPLOITATION.md');
	});

	it('dit quand l’âge est compté depuis le nom, et depuis quand le stockage a l’objet', () => {
		// Sans cela, l'exploitant chercherait chez le stockage un objet de 206 jours et y verrait un
		// dépôt de 13 jours : le journal doit dire les deux.
		const recopie = 'mensuel/jadwal-2026-03-01T021503Z.dump.age';
		const { status, stdout } = lancer(
			liste(...DE_LA_NUIT(), objet(recopie, 13)),
			MAINTENANT,
			...ENVOYES
		);
		expect(status).toBe(1);
		expect(stdout.split('\n')[1]).toBe(
			`  ${recopie} : 206 jours 0 h 09 min, pour 182 jours promis sous mensuel/,` +
				' compté depuis la date de son nom (déposé chez le stockage il y a 13 jours 0 h 00 min)'
		);
	});

	it('sort en erreur sur un objet hors des trois préfixes', () => {
		const { status, stdout } = lancer(
			liste(...DE_LA_NUIT(), objet('autre/notes.txt', 12)),
			MAINTENANT,
			...ENVOYES
		);
		expect(status).toBe(1);
		expect(stdout.split('\n')[0]).toBe('1 objet distant hors des trois préfixes, sur 3 vérifiés');
		expect(stdout).toContain('autre/notes.txt : 12 jours 0 h 00 min, sans âge promis');
	});

	it.each([
		['vide', ''],
		['illisible', 'ERROR : couldn’t list'],
		['sans aucun objet', '[]']
	])('sort en 2 sur une entrée %s, avec un message clair', (_nom, entree) => {
		const { status, stdout, stderr } = lancer(entree, MAINTENANT, ...ENVOYES);
		expect(status).toBe(2);
		expect(stdout).toBe('');
		expect(stderr).toMatch(/^liste illisible : /);
	});

	it('sort en 2 sur une liste qui ne montre pas les objets de la nuit, qu’il dit incomplète', () => {
		// La liste a été lue : « liste illisible » enverrait chercher un message de rclone qui
		// n'existe pas.
		const { status, stdout, stderr } = lancer(
			liste(objet(archive('mensuel', 40), 40)),
			MAINTENANT,
			...ENVOYES
		);
		expect(status).toBe(2);
		expect(stdout).toBe('');
		expect(stderr).toMatch(/^liste incomplète : /);
	});

	it('sort en 2 quand un objet de la nuit manque à la liste, et le nomme', () => {
		const { status, stdout, stderr } = lancer(
			liste(objet(NUIT, 0), objet(archive('mensuel', 40), 40)),
			MAINTENANT,
			...ENVOYES
		);
		expect(status).toBe(2);
		expect(stdout).toBe('');
		expect(stderr).toBe(
			`liste incomplète : la liste ne montre pas ce que cette nuit vient d'envoyer (${NUIT}.sha256) :` +
				' lue sans erreur, elle regarde ailleurs, ou elle est tronquée, et ne prouve rien sur le reste\n'
		);
	});

	it('sort en 2 sans « maintenant », et dit comment l’appeler', () => {
		const { status, stderr } = lancer(liste(objet(archive('quotidien', 1), 1)));
		expect(status).toBe(2);
		expect(stderr).toContain('usage');
	});

	it('sort en 2 sans les objets de la nuit à chercher, et dit comment l’appeler', () => {
		// Sans eux, une liste incomplète passerait : le script refuse de vérifier à moitié.
		const { status, stdout, stderr } = lancer(liste(...DE_LA_NUIT()), MAINTENANT);
		expect(status).toBe(2);
		expect(stdout).toBe('');
		expect(stderr).toContain('usage');
		expect(stderr).toContain('<objet envoyé cette nuit>');
	});
});

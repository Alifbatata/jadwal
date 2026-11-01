#!/usr/bin/env node
/**
 * Éprouve `scripts/licences-tierces.mjs` sur le **code incorporé** au serveur et au client.
 *
 *     pnpm licences:test
 *
 * ## Pourquoi ce test existe
 *
 * L'empaqueteur fond SvelteKit, Svelte et d'autres dans le serveur et le client construits : ils ne
 * sont plus des paquets de l'image, et l'avis, qui ne lisait que le magasin de l'image, les oubliait
 * (constat de l'étape 23). Le greffon `apps/web/bundled-packages.js` les relève à la construction ;
 * l'avis lit ce relevé. Ce test vérifie, sur des arbres factices, qu'il le lit, qu'il ne recopie
 * qu'une fois un paquet présent à deux endroits, et qu'il **refuse** de produire un avis quand le
 * relevé manque ou qu'un module n'a pas de paquet connu : un avis incomplet ne doit pas partir.
 *
 * `pnpm image:test` vérifie, lui, sur la vraie image, que SvelteKit et Svelte y sont.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LICENCES = fileURLToPath(new URL('licences-tierces.mjs', import.meta.url));
const dossier = mkdtempSync(join(tmpdir(), 'jadwal-licences-'));
process.on('exit', () => rmSync(dossier, { recursive: true, force: true }));

const echecs = [];
let verifications = 0;
function verifier(quoi, condition, detail = '') {
	verifications += 1;
	if (!condition) echecs.push(detail ? `${quoi} : ${detail}` : quoi);
	process.stdout.write(`  ${condition ? 'ok  ' : 'NON '} ${quoi}${detail ? ` (${detail})` : ''}\n`);
}

/** Un paquet publié, avec son `package.json` et son texte de licence. */
function paquet(chemin, nom, version) {
	mkdirSync(chemin, { recursive: true });
	writeFileSync(
		join(chemin, 'package.json'),
		JSON.stringify({ name: nom, version, license: 'MIT', repository: `github:exemple/${nom}` })
	);
	writeFileSync(join(chemin, 'LICENSE'), `MIT License\n\nCopyright (c) Les auteurs de ${nom}\n`);
	return chemin;
}

// L'arbre déployé : un magasin d'un paquet, `du-magasin`, et un serveur construit d'un fichier.
const arbre = join(dossier, 'arbre');
paquet(
	join(arbre, 'node_modules', '.pnpm', 'du-magasin@2.0.0', 'node_modules', 'du-magasin'),
	'du-magasin',
	'2.0.0'
);
mkdirSync(join(arbre, 'build', 'server'), { recursive: true });
writeFileSync(join(arbre, 'build', 'server', 'index.js'), 'export {};\n');

// Les paquets que le relevé désigne, hors de l'arbre, comme dans l'étage de construction.
const incorpore = paquet(join(dossier, 'construction', 'incorpore'), 'incorpore', '1.2.3');
const duClient = paquet(join(dossier, 'construction', 'du-client'), 'du-client', '0.1.0');
const memeQueLeMagasin = paquet(join(dossier, 'construction', 'du-magasin'), 'du-magasin', '2.0.0');

/** Un relevé : un dossier, un fichier par environnement. */
function releve(nom, environnements) {
	const chemin = join(dossier, nom);
	mkdirSync(chemin, { recursive: true });
	for (const [environnement, contenu] of Object.entries(environnements)) {
		writeFileSync(join(chemin, `${environnement}.json`), JSON.stringify(contenu));
	}
	return chemin;
}
const entree = (nom, version, dir) => ({ name: nom, version, dir });

const complet = releve('complet', {
	ssr: {
		packages: [
			entree('incorpore', '1.2.3', incorpore),
			entree('du-magasin', '2.0.0', memeQueLeMagasin)
		],
		unknown: []
	},
	client: {
		packages: [entree('incorpore', '1.2.3', incorpore), entree('du-client', '0.1.0', duClient)],
		unknown: []
	}
});
const lancer = (...args) => spawnSync(process.execPath, [LICENCES, ...args], { encoding: 'utf8' });

process.stdout.write('L’avis des licences et le code incorporé\n');

const bon = lancer(arbre, complet);
const avis = bon.stdout ?? '';
const sections = (nom) => avis.split('\n').filter((ligne) => ligne.startsWith(`## ${nom} `)).length;
verifier('le script réussit avec un relevé complet', bon.status === 0, bon.stderr?.trim());
verifier(
	'l’avis recopie un paquet incorporé au serveur et au client, une fois',
	sections('incorpore') === 1,
	`${sections('incorpore')} section(s)`
);
verifier(
	'l’avis recopie le texte de sa licence',
	avis.includes('Copyright (c) Les auteurs de incorpore')
);
verifier('l’avis recopie un paquet incorporé au client seul', sections('du-client') === 1);
verifier(
	'l’avis dit où chaque paquet se trouve',
	/## incorpore 1\.2\.3\n\nLicence déclarée : \*\*MIT\*\*\n\nPrésent : incorporé au serveur, incorporé au client/.test(
		avis
	)
);
verifier(
	'un paquet du magasin, incorporé aussi, n’est recopié qu’une fois',
	sections('du-magasin') === 1,
	`${sections('du-magasin')} section(s)`
);
verifier(
	'le compte des composants les compte tous, une fois chacun',
	avis.includes('**3 composants tiers.**'),
	avis.match(/\*\*\d+ composants tiers\.\*\*/)?.[0]
);

const sansReleve = lancer(arbre);
verifier(
	'il refuse sans relevé, le dit, et n’écrit rien',
	sansReleve.status !== 0 &&
		/relevé/.test(sansReleve.stderr ?? '') &&
		(sansReleve.stdout ?? '') === '',
	`code ${sansReleve.status}`
);

const sansServeur = releve('sans-serveur', { client: { packages: [], unknown: [] } });
const r1 = lancer(arbre, sansServeur);
verifier(
	'il refuse un relevé sans le serveur, le dit, et n’écrit rien',
	r1.status !== 0 && /ssr\.json/.test(r1.stderr ?? '') && (r1.stdout ?? '') === '',
	`code ${r1.status}, ${(r1.stderr ?? '').trim()}`
);

const inconnu = releve('inconnu', {
	ssr: { packages: [], unknown: ['\0module-sans-paquet'] },
	client: { packages: [], unknown: [] }
});
const r2 = lancer(arbre, inconnu);
verifier(
	'il refuse un module sans paquet connu, le nomme, et n’écrit rien',
	r2.status !== 0 && /module-sans-paquet/.test(r2.stderr ?? '') && (r2.stdout ?? '') === '',
	`code ${r2.status}, ${(r2.stderr ?? '').trim()}`
);

if (echecs.length > 0) {
	process.stderr.write(`\nCe qui a échoué :\n`);
	for (const echec of echecs) process.stderr.write(`  - ${echec}\n`);
	process.exitCode = 1;
} else {
	process.stdout.write(`\nLes ${verifications} vérifications passent.\n`);
}

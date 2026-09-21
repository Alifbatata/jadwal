#!/usr/bin/env node
/**
 * Éprouve le contrôle de secrets : pose un faux secret, tente de le commiter, et vérifie que le
 * commit est refusé. Ne laisse rien derrière lui, même en cas d'échec.
 *
 * Un contrôle qu'on n'a jamais vu refuser quelque chose n'est pas un contrôle, c'est une
 * intention. Cette commande est là pour qu'on puisse le voir refuser, à volonté.
 *
 *     pnpm secrets:test
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const racine = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const temoin = join(racine, 'faux-secret-de-test.pem');

/**
 * Un bloc de clé privée dont le corps ne contient que du remplissage : la forme est celle d'un
 * secret, la matière n'en est pas une, et rien ne s'ouvre avec.
 *
 * Les clés d'exemple des fournisseurs — `AKIAIOSFODNN7EXAMPLE` chez AWS — ne conviennent pas :
 * gitleaks les met en liste blanche, précisément parce que ce sont des exemples. Éprouver le
 * contrôle avec l'une d'elles le ferait passer pour muet alors qu'il fonctionne.
 *
 * L'en-tête est assemblé à l'exécution, et n'apparaît donc jamais tel quel dans ce fichier :
 * sinon le contrôle refuserait de commiter sa propre épreuve, et il faudrait lui poser une
 * exception — c'est-à-dire lui apprendre à se taire, ce qu'on ne veut faire nulle part.
 */
const TIRETS = '-'.repeat(5);
const ETIQUETTE = ['RSA', 'PRIVATE', 'KEY'].join(' ');
const FAUX = [
	`${TIRETS}BEGIN ${ETIQUETTE}${TIRETS}`,
	'MIIEowIBAAKCAQEAxxxxFAUXxxxSECRETxxxDETESTxxxNEMARCHExxxPAS0000',
	'AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJKKKKLLLLMMMMNNNNOOOOPPPP',
	`${TIRETS}END ${ETIQUETTE}${TIRETS}`,
	''
].join('\n');

let indexe = false;
let echecAttendu = false;

try {
	writeFileSync(temoin, FAUX);
	execFileSync('git', ['add', '--force', temoin], { cwd: racine, stdio: 'pipe' });
	indexe = true;

	process.stdout.write('Tentative de commit d’un faux secret…\n\n');
	try {
		execFileSync('git', ['commit', '-m', 'test: ceci ne doit jamais aboutir'], {
			cwd: racine,
			stdio: 'inherit'
		});
	} catch {
		echecAttendu = true;
	}
} finally {
	if (indexe) {
		try {
			execFileSync('git', ['restore', '--staged', temoin], { cwd: racine, stdio: 'pipe' });
		} catch {
			/* le fichier n'était plus indexé : rien à défaire */
		}
	}
	if (existsSync(temoin)) rmSync(temoin, { force: true });
}

if (echecAttendu) {
	process.stdout.write('\nLe commit a été refusé : le contrôle fonctionne.\n');
} else {
	process.stderr.write(
		'\nLE COMMIT EST PASSÉ. Le contrôle de secrets ne protège rien.\n' +
			'Vérifiez `git config core.hooksPath` et relancez `pnpm hooks`.\n' +
			'Si un commit a été créé, défaites-le : git reset --hard HEAD~1\n'
	);
	process.exitCode = 1;
}

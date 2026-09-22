// L'empreinte d'intégrité du widget, et le code à coller qui va avec.
//
// À lancer après chaque construction : `pnpm --filter @jadwal/widget integrity`. L'empreinte porte
// sur les octets du fichier construit, pas sur ceux du dépôt — un changement de version de Vite ou
// une fin de ligne différente la change, et une empreinte fausse bloque le script à cent pour cent.
//
// SHA-384, comme tous les exemples de la spécification. Mélanger les algorithmes ne sert à rien :
// le navigateur ne retient que le plus fort présent et ignore les autres, donc une empreinte
// périmée dans un algorithme plus fort bloquerait la ressource à elle seule.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const file = new URL('../dist/jadwal-widget.js', import.meta.url);
let content;
try {
	content = readFileSync(file);
} catch {
	console.error('dist/jadwal-widget.js introuvable : lancer `pnpm build` d’abord.');
	process.exit(1);
}

const sha384 = `sha384-${createHash('sha384').update(content).digest('base64')}`;
// La même empreinte, en SHA-256 tronquée : c'est elle qui nomme l'URL versionnée servie par
// l'application (apps/web/src/lib/server/widget.ts). Les deux sont calculées sur les mêmes octets.
const version = createHash('sha256').update(content).digest('base64url').slice(0, 12);

process.stdout.write(`version : ${version}\n`);
process.stdout.write(`intégrité : ${sha384}\n\n`);
process.stdout.write(`Code à coller, version verrouillée (remplacer l’hôte) :\n\n`);
process.stdout.write(
	`<script src="https://exemple.invalid/widget/${version}/jadwal-widget.js"\n` +
		`        integrity="${sha384}"\n` +
		`        crossorigin="anonymous"></script>\n` +
		`<jadwal-widget org="mon-organisation">\n` +
		`  <a href="https://exemple.invalid/m/mon-organisation">Voir le programme des cours</a>\n` +
		`</jadwal-widget>\n\n`
);
process.stdout.write(
	'Vérification croisée : openssl dgst -sha384 -binary dist/jadwal-widget.js | openssl base64 -A\n'
);

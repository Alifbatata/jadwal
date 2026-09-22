// Archive la version construite du widget, pour qu'elle reste servie pour toujours (ADR 0005).
//
// Le segment de version d'une adresse immuable est une empreinte du contenu : il change dès que le
// fichier change. Une organisation qui a collé l'adresse versionnée — celle qui porte une empreinte
// d'intégrité — la garde des années. Si nous cessions de servir cette version, son programme
// disparaîtrait de son site, sans message.
//
// D'où ce dossier : `published/<version>/jadwal-widget.js`, alimenté à chaque construction et
// **jamais vidé**. `apps/web` sert tout ce qu'il contient. Un test lit le dossier et échoue si une
// version publiée cesse d'être servie.
//
// Une version construite en cours de développement et jamais commitée n'a été publiée nulle part :
// son dossier peut être supprimé avant de commiter. Une fois dans l'historique, elle est publiée.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const construit = new URL('../dist/jadwal-widget.js', import.meta.url);
let contenu;
try {
	contenu = readFileSync(construit);
} catch {
	console.error('dist/jadwal-widget.js introuvable : lancer `pnpm build` d’abord.');
	process.exit(1);
}

/** La même empreinte que celle qui nomme l'adresse, calculée sur les mêmes octets. */
const version = createHash('sha256').update(contenu).digest('base64url').slice(0, 12);
const cible = new URL(`../published/${version}/jadwal-widget.js`, import.meta.url);
const chemin = fileURLToPath(cible);

if (existsSync(chemin)) {
	process.stdout.write(`version ${version} déjà archivée\n`);
} else {
	mkdirSync(dirname(chemin), { recursive: true });
	copyFileSync(fileURLToPath(construit), chemin);
	process.stdout.write(`version ${version} archivée dans published/\n`);
}

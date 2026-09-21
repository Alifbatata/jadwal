// Affiche la taille brute et gzip du bundle du widget. Usage : pnpm --filter @jadwal/widget size
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const file = new URL('../dist/jadwal-widget.js', import.meta.url);
let content;
try {
	content = readFileSync(file);
} catch {
	console.error('dist/jadwal-widget.js introuvable : lancer `pnpm build` d’abord.');
	process.exit(1);
}
const gzip = gzipSync(content, { level: 9 });
const kib = (bytes) => (bytes / 1024).toFixed(2);
console.log(`dist/jadwal-widget.js : ${content.length} octets (${kib(content.length)} KiB)`);
console.log(`gzip (niveau 9)       : ${gzip.length} octets (${kib(gzip.length)} KiB)`);

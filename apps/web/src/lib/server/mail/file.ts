// Transport de développement et de test : rien ne part, chaque courriel est écrit dans un dossier.
//
// Un fichier par courriel, et non un seul fichier en lignes JSON. La mesure est sans appel : à six
// processus écrivant en parallèle des enregistrements d'un demi-mégaoctet, 220 lignes sur 360
// étaient illisibles, l'ajout en fin de fichier n'étant atomique ni sous Windows ni au-delà d'une
// certaine taille sous POSIX. Un courriel HTML dépasse vite cette taille.
//
// Chaque fichier est écrit sous un nom temporaire puis renommé : un lecteur ne voit jamais un
// fichier à moitié écrit, le renommage étant atomique sur NTFS comme sur ext4.

import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Mailer, OutgoingEmail } from './types.js';

export interface RecordedEmail extends OutgoingEmail {
	readonly sentAt: string;
	readonly sequence: number;
	readonly pid: number;
}

/** Compteur par processus : deux courriels de la même milliseconde restent ordonnés. */
let counter = 0;

/**
 * Horodatage triable et écrivable partout. `2026-09-20T17:58:53.878Z` est un nom de fichier
 * illégal sous Windows à cause des deux-points ; la forme à tirets passe sur les deux systèmes et
 * garde l'ordre lexicographique.
 */
function stamp(date: Date): string {
	return date.toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

export class FileMailer implements Mailer {
	readonly #directory: string;

	constructor(directory: string) {
		this.#directory = directory;
	}

	async send(mail: OutgoingEmail): Promise<void> {
		const now = new Date();
		const sequence = ++counter;
		const record: RecordedEmail = {
			to: mail.to,
			subject: mail.subject,
			text: mail.text,
			html: mail.html,
			sentAt: now.toISOString(),
			sequence,
			pid: process.pid
		};
		// L'identifiant du processus et l'aléatoire écartent toute collision entre processus
		// parallèles, même à l'intérieur d'une milliseconde.
		const name = [
			stamp(now),
			String(sequence).padStart(6, '0'),
			String(process.pid).padStart(8, '0'),
			randomBytes(4).toString('hex')
		].join('_');
		await mkdir(this.#directory, { recursive: true });
		const temporary = join(this.#directory, `.${name}.tmp`);
		await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
		await rename(temporary, join(this.#directory, `${name}.json`));
	}
}

/** Les courriels écrits dans ce dossier, du plus ancien au plus récent. */
export async function readOutbox(directory: string): Promise<RecordedEmail[]> {
	let names: string[];
	try {
		names = await readdir(directory);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw error;
	}
	// Tri binaire, sans locale : le même ordre sur les deux systèmes.
	const kept = names.filter((name) => name.endsWith('.json')).sort();
	const records: RecordedEmail[] = [];
	for (const name of kept) {
		records.push(JSON.parse(await readFile(join(directory, name), 'utf8')) as RecordedEmail);
	}
	return records;
}

/**
 * Le dernier courriel écrit dans ce dossier. Un test donne à chaque cas son propre dossier : dans
 * une corbeille partagée, « le dernier courriel envoyé » désignerait peut-être celui du voisin.
 */
export async function lastEmail(directory: string): Promise<RecordedEmail | undefined> {
	const all = await readOutbox(directory);
	return all.at(-1);
}

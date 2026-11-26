// Le compteur du mois : combien de temps ce relais a fait facturer depuis le premier du mois.
//
// Le temps facturé, c'est le temps de direct fois le nombre de langues : un sermon de trente
// minutes en sept langues en compte deux cent dix. C'est l'unité des services de traduction ; le
// relais plafonne donc du temps et non de l'argent, dont le prix changerait sans lui (ADR 0055).
//
// Il compte en **secondes entières** : des minutes à virgule, additionnées trente fois, tombent à
// un cheveu sous le plafond au lieu de l'atteindre.
//
// Le compte doit survivre à un redémarrage, sinon le plafond ne plafonnerait rien : il vit dans un
// fichier, qui ne porte que le mois et un nombre. Le mois est celui du temps universel : à une
// heure près autour du premier du mois, sans conséquence pour un plafond.
//
// **On échoue fermé.** Un fichier illisible ne vaut pas zéro : il arrête le programme au
// démarrage. Une écriture qui échoue lève, et le relais arrête le direct.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

export interface Counter {
	/** Les secondes facturées du mois en cours. */
	seconds(now: number): number;
	/** Ajoute des secondes au mois en cours, et l'écrit. Lève si l'écriture échoue. */
	add(now: number, seconds: number): void;
}

interface Stored {
	month: string;
	seconds: number;
}

/** `2026-11` : le mois, en temps universel. */
function monthOf(now: number): string {
	return new Date(now).toISOString().slice(0, 7);
}

function isCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parse(file: string, content: string): Stored {
	let value: unknown;
	try {
		value = JSON.parse(content);
	} catch {
		value = null;
	}
	const stored = value as Partial<Stored> | null;
	if (
		typeof stored !== 'object' ||
		stored === null ||
		Object.keys(stored).sort().join() !== 'month,seconds' ||
		typeof stored.month !== 'string' ||
		!/^\d{4}-(0[1-9]|1[0-2])$/.test(stored.month) ||
		!isCount(stored.seconds)
	) {
		throw new Error(
			`Le compteur du direct est illisible (${file}) : le relais refuse de repartir de zéro. ` +
				'Le corriger à la main, ou le supprimer en sachant ce que le mois a déjà coûté.'
		);
	}
	return { month: stored.month, seconds: stored.seconds };
}

export function openCounter(file: string, now: number): Counter {
	let stored: Stored = existsSync(file)
		? parse(file, readFileSync(file, 'utf8'))
		: { month: monthOf(now), seconds: 0 };

	const write = (): void => {
		// Un fichier voisin, puis un renommage : une coupure au milieu ne laisse pas un compteur à
		// moitié écrit, que le prochain démarrage refuserait.
		const temporary = `${file}.tmp`;
		try {
			writeFileSync(temporary, JSON.stringify(stored));
			renameSync(temporary, file);
		} catch (cause) {
			throw new Error(`Le compteur du direct ne s'écrit pas (${file}).`, { cause });
		}
	};
	const current = (at: number): Stored => {
		const month = monthOf(at);
		if (stored.month !== month) stored = { month, seconds: 0 };
		return stored;
	};

	// Écrit dès l'ouverture : un dossier absent ou interdit se voit au démarrage, pas au milieu
	// d'un sermon.
	current(now);
	write();

	return {
		seconds: (at) => current(at).seconds,
		add(at, seconds) {
			if (!isCount(seconds))
				throw new Error('compteur : un nombre entier de secondes, positif ou nul');
			current(at).seconds += seconds;
			write();
		}
	};
}

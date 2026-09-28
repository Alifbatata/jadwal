// La clé d'une séance dans les listes des écrans « À venir » et « Vendredi » (`{#each}` à clé).
//
// Deux séances d'un même cours peuvent tomber le même jour avec le même statut : deux séances
// déplacées vers ce jour, ou, depuis l'étape 20, la séance du rythme annulée et une séance arrivée
// d'un autre jour puis annulée là. Svelte refuse deux fois la même clé dans une liste : à
// l'hydratation, en production comme en développement, il lève `each_key_duplicate`, et l'écran ne
// répond plus. La date d'origine les distingue. Une séance du rythme n'en a pas, une séance arrivée
// d'ailleurs a la sienne, et il n'y a qu'une exception par cours et par date prévue
// (`session_exception_course_date_uq`). `session-key.test.ts` le vérifie sur ces cas.

export interface KeyedSession {
	courseId: string;
	date: string;
	status: string;
	/** La date prévue d'une séance arrivée d'un autre jour, ou d'une autre heure le même jour. */
	originalDate?: string | null | undefined;
}

export function sessionKey(seance: KeyedSession): string {
	return `${seance.courseId} ${seance.date} ${seance.status} ${seance.originalDate ?? ''}`;
}

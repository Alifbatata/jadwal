// Le refus d'une carte périmée nomme la séance par son titre, saisi par une personne : la page
// l'isole (`<bdi>`, ADR 0007), et la phrase se découpe autour de lui (relecture de D4). De même pour
// le refus d'un jour où le cours n'a pas de séance (étape 19, lot 3).

import { describe, expect, it } from 'vitest';
import { LANGUES } from '../i18n.js';
import { upcomingErrorParts, upcomingTexts, type NamedUpcomingError } from './upcoming.js';

const NOMMES: readonly NamedUpcomingError[] = [
	'notPlanned',
	'changed',
	'timeChanged',
	'alreadyCancelled',
	'alreadyRestored'
];
/** Un titre latin qui finit par une ponctuation : celui qui se retournait sur un écran arabe. */
const TITRE = 'Tafsir (2)';
const DATE = 'lundi 28.09.2026';

describe('upcomingErrorParts', () => {
	it.each(LANGUES)('cuts each refusal that names a session around its title, in %s', (langue) => {
		const textes = upcomingTexts[langue];
		for (const erreur of NOMMES) {
			const morceaux = upcomingErrorParts(textes, erreur, TITRE, DATE);
			expect(
				morceaux.filter((morceau) => morceau.title),
				erreur
			).toEqual([{ text: TITRE, title: true }]);
			expect(morceaux.map((morceau) => morceau.text).join(''), erreur).toBe(
				textes.errors[erreur](TITRE, DATE)
			);
		}
	});

	it('leaves whole a refusal that names no session', () => {
		expect(upcomingErrorParts(upcomingTexts.fr, 'sessionGone', TITRE, DATE)).toEqual([
			{ text: upcomingTexts.fr.errors.sessionGone, title: false }
		]);
	});
});

// Le titre d'une session du vendredi, dans la langue de celui qui le lit (étape 18, retour D1).
//
// Une fonction pure, sans base : c'est elle que la page publique, le programme sur un site, le flux
// agenda et les messages prêts à coller appellent, et qui décide seule.

import { describe, expect, it } from 'vitest';
import { LANGUES, t } from '$lib/i18n.js';
import { fridayTitle } from './friday-title.js';

describe('fridayTitle', () => {
	it.each(LANGUES)(
		'names a session titled with the name the service proposes after the prayer, in %s',
		(lecteur) => {
			for (const source of LANGUES) {
				expect(fridayTitle(t(source).jumua, 'jumua', lecteur), source).toBe(t(lecteur).jumua);
			}
		}
	);

	it('keeps a title the organisation chose, in every language', () => {
		for (const lecteur of LANGUES) {
			expect(fridayTitle('Jumu’a', 'jumua', lecteur)).toBe('Jumu’a');
			expect(fridayTitle('Prière du vendredi, grande salle', 'jumua', lecteur)).toBe(
				'Prière du vendredi, grande salle'
			);
		}
	});

	it('leaves a course alone, even one named like the prayer', () => {
		expect(fridayTitle('Prière du vendredi', 'course', 'en')).toBe('Prière du vendredi');
	});

	it('recognises the proposed name with spaces around it', () => {
		expect(fridayTitle(' Freitagsgebet ', 'jumua', 'it')).toBe('Preghiera del venerdì');
	});
});

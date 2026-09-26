// Le formulaire d'une session du vendredi, lu et vérifié (étape 18, retour D2).
//
// Il rend le nom de chaque erreur, jamais sa phrase : l'écran l'écrit dans la langue de la personne.

import { describe, expect, it } from 'vitest';
import { parseFridayForm } from './form.js';

/** Un formulaire tel que l'écran l'envoie, rempli comme il faut ; `champs` remplace ou retire. */
function formulaire(champs: Record<string, string | readonly string[] | null> = {}): FormData {
	const valeurs: Record<string, string | readonly string[] | null> = {
		title: 'Prière du vendredi',
		jumuaOrder: '1',
		start: '12:10',
		end: '12:50',
		roomId: '',
		sermonLanguages: ['ar', 'fr'],
		teacher: '',
		startsOn: '2026-09-04',
		endsOn: '',
		description: '',
		status: 'published',
		...champs
	};
	const form = new FormData();
	for (const [nom, valeur] of Object.entries(valeurs)) {
		if (valeur === null) continue;
		for (const une of typeof valeur === 'string' ? [valeur] : valeur) form.append(nom, une);
	}
	return form;
}

describe('parseFridayForm', () => {
	it('reads a Friday session: every Friday, fixed times, the languages the organisation publishes', () => {
		const lu = parseFridayForm(
			formulaire({ sermonLanguages: ['ar', 'tr', 'fr'], teacher: 'Imam Youssef' }),
			['fr', 'de', 'ar']
		);
		expect(lu.ok).toBe(true);
		if (!lu.ok) return;
		expect(lu.values).toMatchObject({
			kind: 'jumua',
			jumuaOrder: 1,
			title: 'Prière du vendredi',
			audience: 'open',
			// Une langue que l'organisation ne publie pas est écartée.
			teachingLanguages: ['ar', 'fr'],
			sourceLanguage: 'fr',
			roomId: null,
			teacher: 'Imam Youssef',
			status: 'published',
			startsOn: '2026-09-04',
			endsOn: null,
			recurrence: { kind: 'weekly', weekdays: [5], interval: 1, anchorDate: '2026-09-04' },
			timing: { kind: 'fixed', start: '12:10', end: '12:50' }
		});
		expect([...lu.values.translations]).toEqual([
			['fr', { title: 'Prière du vendredi', description: null }]
		]);
	});

	it('names an empty title after the prayer, in the language the session is written in', () => {
		const allemand = parseFridayForm(formulaire({ title: '' }), ['de', 'fr']);
		const francais = parseFridayForm(formulaire({ title: '  ' }), ['fr', 'de']);
		expect(allemand.ok && allemand.values.title).toBe('Freitagsgebet');
		expect(francais.ok && francais.values.title).toBe('Prière du vendredi');
	});

	it.each([
		['titleTooLong', { title: 'x'.repeat(121) }],
		['orderInvalid', { jumuaOrder: '4' }],
		['orderInvalid', { jumuaOrder: null }],
		['timesMissing', { start: '' }],
		['timesMissing', { end: '1250' }],
		['endBeforeStart', { start: '12:50', end: '12:10' }],
		['endBeforeStart', { start: '12:10', end: '12:10' }],
		['sermonLanguageMissing', { sermonLanguages: null }],
		['sermonLanguageMissing', { sermonLanguages: ['tr'] }],
		['startDateMissing', { startsOn: '' }],
		['startDateMissing', { startsOn: '04.09.2026' }],
		['endDateUnreadable', { endsOn: 'bientôt' }],
		['endDateBeforeStart', { endsOn: '2026-09-03' }]
	] as const)('names the mistake %s, and only that one', (erreur, champs) => {
		const lu = parseFridayForm(formulaire(champs), ['fr', 'ar']);
		expect(lu).toEqual({ ok: false, errors: [erreur] });
	});

	it('names every mistake at once, in the order of the form', () => {
		const lu = parseFridayForm(
			formulaire({ jumuaOrder: '0', start: '13:00', end: '12:00', sermonLanguages: null }),
			['fr']
		);
		expect(lu).toEqual({
			ok: false,
			errors: ['orderInvalid', 'endBeforeStart', 'sermonLanguageMissing']
		});
	});
});

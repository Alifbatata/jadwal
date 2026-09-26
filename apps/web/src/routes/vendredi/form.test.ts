// Le formulaire d'une session du vendredi, lu et vérifié (étape 18, retour D2).
//
// Il rend le nom de chaque erreur, jamais sa phrase : l'écran l'écrit dans la langue de la personne.

import { describe, expect, it } from 'vitest';
import { parseFridayForm, proposedOrder } from './form.js';

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
			['fr', 'de', 'ar'],
			'fr'
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

	it('writes a session in the language of the organisation, even when it is not its first published one', () => {
		// Réglages enregistre les langues dans l'ordre fr, de, it, en, ar : une organisation de langue
		// allemande qui publie aussi le français a donc le français en tête de sa liste.
		const allemand = parseFridayForm(formulaire({ title: '' }), ['fr', 'de'], 'de');
		const francais = parseFridayForm(formulaire({ title: '  ' }), ['de', 'fr'], 'fr');
		expect(allemand.ok && allemand.values.title).toBe('Freitagsgebet');
		expect(allemand.ok && allemand.values.sourceLanguage).toBe('de');
		expect(allemand.ok && [...allemand.values.translations.keys()]).toEqual(['de']);
		expect(francais.ok && francais.values.title).toBe('Prière du vendredi');
		expect(francais.ok && francais.values.sourceLanguage).toBe('fr');
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
		const lu = parseFridayForm(formulaire(champs), ['fr', 'ar'], 'fr');
		expect(lu).toEqual({ ok: false, errors: [erreur] });
	});

	it('names every mistake at once, in the order of the form', () => {
		const lu = parseFridayForm(
			formulaire({ jumuaOrder: '0', start: '13:00', end: '12:00', sermonLanguages: null }),
			['fr'],
			'fr'
		);
		expect(lu).toEqual({
			ok: false,
			errors: ['orderInvalid', 'endBeforeStart', 'sermonLanguageMissing']
		});
	});
});

describe('proposedOrder', () => {
	const sans = (jumuaOrder: number) => ({ jumuaOrder, endsOn: null });

	it.each([
		['no session yet: the first', [], 1],
		['only the second is left: the first', [sans(2)], 1],
		['the first and the second: the third', [sans(1), sans(2)], 3],
		[
			'the first ends, as when the season changes: the first again',
			[{ jumuaOrder: 1, endsOn: '2026-10-23' }],
			1
		],
		[
			'the first ends, the second and the third go on: the first',
			[{ jumuaOrder: 1, endsOn: '2026-10-23' }, sans(2), sans(3)],
			1
		],
		['all three go on: none, no order is free', [sans(1), sans(2), sans(3)], null],
		[
			'all three go on, and an older one has ended: none',
			[{ jumuaOrder: 2, endsOn: '2026-03-27' }, sans(1), sans(2), sans(3)],
			null
		]
	] as const)('proposes the first free order when %s', (_, existantes, attendu) => {
		expect(proposedOrder(existantes)).toBe(attendu);
	});
});

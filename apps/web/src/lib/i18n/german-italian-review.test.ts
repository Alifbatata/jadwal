// L'allemand et l'italien nouveaux ou changés aux étapes 19 et 20, relus à l'étape 21 : chaque
// correction, à sa place, et l'ancienne forme absente.

import { describe, expect, it } from 'vitest';
import { t } from '../i18n.js';
import { fridayTexts } from './friday.js';
import { prayersTexts } from './prayers.js';

describe('German reviewed (step 21)', () => {
	it('R1: the programme page is « Diese », not « Sie », which would read as the reader', () => {
		expect(t('de').lastMinute).toBe(
			'Bei einer Änderung in letzter Minute sehen Sie auf der Seite des Programms nach: Diese ist immer aktuell.'
		);
	});

	it('R2: Isha begins late, it does not fall late', () => {
		const hint = prayersTexts.de.computed.ruleHint;
		expect(hint).toContain('dass Ischa spät und Fadschr sehr früh beginnt.');
		expect(hint).not.toContain('fällt');
	});
});

describe('Italian reviewed (step 21)', () => {
	it('R1: a sermon is given (tenuto), not said', () => {
		expect(fridayTexts.it.form.sermonHelp).toContain('in cui viene tenuto il sermone');
		expect(fridayTexts.it.form.sermonHelp).not.toContain('detto');
	});

	it('R2: the middle of the night keeps (mantiene) the astronomical times', () => {
		expect(prayersTexts.it.computed.ruleHint).toContain(
			'La metà della notte mantiene gli orari astronomici'
		);
	});
});

// L'arabe relu par le chef de projet à l'étape 19 : chaque correction, à sa place, et l'ancienne
// forme absente. Les textes viennent tels qu'il les a donnés ; seul l'accord de « لصقها » suit le
// genre de « الشيفرة », comme dans Partager (« شيفرة الإطار المطلوب لصقها »).

import { describe, expect, it } from 'vitest';
import { t } from '../i18n.js';
import { fridayTexts } from './friday.js';
import { membersTexts } from './members.js';
import { prayersTexts } from './prayers.js';
import { shareTexts } from './share.js';
import { upcomingTexts } from './upcoming.js';

describe('Arabic reviewed by the project lead (step 19)', () => {
	it('B1: the locked code is not updated by itself', () => {
		expect(shareTexts.ar.code.lockedWhere).toContain('وهي لا تُحدَّث تلقائيًا');
		expect(shareTexts.ar.code.lockedWhere).not.toContain('تتحدّث');
	});

	it('B2: the calendar is updated by itself', () => {
		expect(upcomingTexts.ar.audience.note).toContain('فالتقويم يُحدَّث من تلقاء نفسه');
		expect(upcomingTexts.ar.audience.note).not.toContain('يتحدّث');
	});

	it('B3: an unpublished Friday session stays here as a draft', () => {
		expect(fridayTexts.ar.done.unpublished).toContain('لكنه يبقى هنا كمسودة');
		expect(fridayTexts.ar.done.unpublished).not.toContain('محفوظًا');
	});

	it('B4: the template is filled in, then uploaded here', () => {
		const hint = prayersTexts.ar.file.templateHint;
		expect(hint).toContain('النموذج مُعبّأ');
		expect(hint).toContain('ثم ارفعه هنا');
		expect(hint).not.toContain('مملوء');
		expect(hint).not.toContain('أرسله');
	});

	it('B5: the tab character is named with its key', () => {
		expect(prayersTexts.ar.file.tab).toBe('علامة الجدولة (Tab)');
	});

	it('B6: and N others', () => {
		expect(prayersTexts.ar.file.more(4)).toBe('… و4 أخرى.');
	});

	it('B7: the values are filled in beforehand', () => {
		const prefilled = prayersTexts.ar.periods.prefilled('شتاء 2027');
		expect(prefilled).toContain('مُعبّأة مسبقًا');
		expect(prefilled).not.toContain('مملوءة');
	});

	it('B8: choose the editor role or the manager role', () => {
		expect(membersTexts.ar.errors.unknownRole).toBe(
			'هذا الدور غير موجود. اختر دور المحرر أو دور المسؤول.'
		);
	});

	it('B9: copy the message, then paste it', () => {
		expect(shareTexts.ar.week.help).toContain(
			'انسخ هذه الرسالة والصقها في مجموعة WhatsApp الخاصة بك'
		);
		expect(upcomingTexts.ar.weekHelp).toContain('لتنسخه وتلصقه في WhatsApp');
	});

	it('B10: the code to paste is « الشيفرة », as on the share screen', () => {
		expect(upcomingTexts.ar.widgetSilent).toContain('لصقت فيها الشيفرة');
		expect(upcomingTexts.ar.widgetSilent).not.toContain('الرمز');
		// Ce qu'on a retiré, c'est le code : « الشيفرة », féminin (l'allemand dit « ihn », der Code).
		expect(upcomingTexts.ar.widgetSilent).toContain('إن كنت أزلتها عن قصد');
		expect(upcomingTexts.ar.widgetLink).toBe('عرض الشيفرة المراد لصقها مرة أخرى');
	});

	it('B11: the Google button, in the reviewed words', () => {
		expect(t('ar').googleHelp).toBe(
			'اضغط على الزر: يُفتح تقويم Google مع طلب إضافة هذا التقويم. إن اقترح عليك ذلك، فأكّد.'
		);
	});
});

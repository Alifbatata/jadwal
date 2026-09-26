// Les textes autour des conditions d'utilisation : la page ouverte à tous (`/conditions`) et l'écran
// d'acceptation (`/conditions/accepter`).
//
// Le texte des conditions lui-même reste en français, dans toutes les langues : c'est celui que relit
// le juriste, et celui que chacun accepte (retour D4, ADR 0044). Dans les quatre autres langues, une
// phrase le dit en tête de la page.

import type { Translations } from './space.js';

interface TermsTexts {
	readonly title: string;
	/** La phrase qui précède le texte français. Aucune en français. */
	readonly onlyInFrench: string | null;
	/**
	 * Ce que l'écran d'acceptation demande, autour du nom de l'organisation, mis en valeur entre les
	 * deux parties. `after` commence par sa ponctuation.
	 */
	readonly acceptIntro: { readonly before: string; readonly after: string };
	readonly askedAgain: string;
	/** « Version du 26.09.2026 ». */
	readonly version: (date: string) => string;
	readonly otherOrganisation: string;
	readonly accept: string;
	readonly closedUntil: (organisation: string) => string;
}

export const termsTexts: Translations<TermsTexts> = {
	fr: {
		title: 'Conditions d’utilisation',
		onlyInFrench: null,
		acceptIntro: {
			before: 'Avant d’entrer dans l’espace de',
			after:
				', lisez les conditions d’utilisation et acceptez-les. Elles disent ce que le service conserve, combien de temps, et ce que l’exploitant peut voir.'
		},
		askedAgain: 'Si le texte change, cet écran vous demandera de nouveau votre accord.',
		version: (date) => `Version du ${date}`,
		otherOrganisation: 'Choisir une autre organisation',
		accept: 'J’accepte les conditions d’utilisation',
		closedUntil: (organisation) =>
			`Tant que vous ne les avez pas acceptées, l’espace de ${organisation} reste fermé.`
	},
	de: {
		title: 'Nutzungsbedingungen',
		onlyInFrench: 'Diesen Text gibt es vorerst nur auf Französisch.',
		acceptIntro: {
			before: 'Bevor Sie den Bereich von',
			after:
				' betreten, lesen Sie die Nutzungsbedingungen und akzeptieren Sie sie. Sie sagen, was der Dienst speichert, wie lange, und was der Betreiber sehen kann.'
		},
		askedAgain: 'Ändert sich der Text, werden Sie hier erneut um Ihr Einverständnis gebeten.',
		version: (date) => `Version vom ${date}`,
		otherOrganisation: 'Andere Organisation wählen',
		accept: 'Ich akzeptiere die Nutzungsbedingungen',
		closedUntil: (organisation) =>
			`Solange Sie sie nicht akzeptiert haben, bleibt der Bereich von ${organisation} geschlossen.`
	},
	it: {
		title: 'Condizioni d’uso',
		onlyInFrench: 'Per ora questo testo esiste solo in francese.',
		acceptIntro: {
			before: 'Prima di entrare nell’area di',
			after:
				', leggi le condizioni d’uso e accettale. Dicono che cosa conserva il servizio, per quanto tempo e che cosa può vedere chi lo gestisce.'
		},
		askedAgain: 'Se il testo cambia, questa pagina ti chiederà di nuovo il tuo consenso.',
		version: (date) => `Versione del ${date}`,
		otherOrganisation: 'Scegli un’altra organizzazione',
		accept: 'Accetto le condizioni d’uso',
		closedUntil: (organisation) =>
			`Finché non le hai accettate, l’area di ${organisation} resta chiusa.`
	},
	en: {
		title: 'Terms of use',
		onlyInFrench: 'For now, this text only exists in French.',
		acceptIntro: {
			before: 'Before you enter the area of',
			after:
				', read the terms of use and accept them. They say what the service keeps, for how long, and what the operator can see.'
		},
		askedAgain: 'If the text changes, this page will ask for your agreement again.',
		version: (date) => `Version dated ${date}`,
		otherOrganisation: 'Choose another organisation',
		accept: 'I accept the terms of use',
		closedUntil: (organisation) =>
			`Until you have accepted them, the area of ${organisation} stays closed.`
	},
	ar: {
		title: 'شروط الاستخدام',
		onlyInFrench: 'هذا النص متوفر بالفرنسية فقط في الوقت الحالي.',
		acceptIntro: {
			before: 'قبل الدخول إلى مساحة',
			after:
				'، اقرأ شروط الاستخدام ووافق عليها. فهي تبيّن ما تحفظه الخدمة، ولأي مدة، وما يستطيع المشغّل رؤيته.'
		},
		askedAgain: 'إذا تغيّر النص، ستطلب منك هذه الصفحة موافقتك من جديد.',
		version: (date) => `الإصدار بتاريخ ${date}`,
		otherOrganisation: 'اختيار مؤسسة أخرى',
		accept: 'أوافق على شروط الاستخدام',
		closedUntil: (organisation) => `ما دمت لم توافق عليها، تبقى مساحة ${organisation} مغلقة.`
	}
};

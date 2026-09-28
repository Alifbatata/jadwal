// Les textes autour des conditions d'utilisation : la page ouverte à tous (`/conditions`) et l'écran
// d'acceptation (`/conditions/accepter`).
//
// Le texte des conditions lui-même reste en français, dans toutes les langues : c'est celui que relit
// le juriste, et celui que chacun accepte (retour D4, ADR 0044). Dans les quatre autres langues, une
// phrase le dit en tête de la page.
//
// Depuis l'étape 20, l'écran propose aussi de ne pas accepter et de quitter l'organisation. La
// demande de confirmation et les refus reprennent les phrases de « Vos organisations »
// (`organisations.ts`), sauf ce que doit faire la seule personne responsable, propre à cet écran.

import { deDevant } from '../i18n.js';
import type { Translations } from './space.js';

interface TermsTexts {
	readonly title: string;
	/** La phrase qui précède le texte français. Aucune en français. */
	readonly onlyInFrench: string | null;
	/**
	 * Ce que l'écran d'acceptation demande, autour du nom de l'organisation, mis en valeur entre les
	 * deux parties. `before` finit par ce qui le sépare du nom, une espace, ou rien après l'« d’ » du
	 * français (`deDevant`) ; `after` commence par sa ponctuation.
	 */
	readonly acceptIntro: {
		readonly before: (organisation: string) => string;
		readonly after: string;
	};
	readonly askedAgain: string;
	/** « Version du 26.09.2026 ». */
	readonly version: (date: string) => string;
	readonly otherOrganisation: string;
	readonly accept: string;
	readonly closedUntil: (organisation: string) => string;
	/** Sous le bouton d'accord, le bouton secondaire de qui ne veut pas accepter (étape 20). */
	readonly leave: string;
	/**
	 * Après le refus fait à la seule personne responsable qui voulait partir, ce qu'elle doit faire. La
	 * phrase de « Vos organisations » lui dit d'ouvrir l'organisation, ce qui la ramènerait ici.
	 */
	readonly lastManagerWhat: string;
	/**
	 * Un envoi qui nomme une autre organisation que celle de la session : elle en a choisi une autre
	 * depuis l'affichage, dans un autre onglet. `what` dit ce qui s'est passé ; `now` précède le nom
	 * de l'organisation que l'écran montre désormais (étape 20).
	 */
	readonly sessionChanged: {
		readonly what: string;
		readonly now: string;
	};
}

export const termsTexts: Translations<TermsTexts> = {
	fr: {
		title: 'Conditions d’utilisation',
		onlyInFrench: null,
		acceptIntro: {
			before: (organisation) => `Avant d’entrer dans l’espace ${deDevant(organisation)}`,
			after:
				', lisez les conditions d’utilisation et acceptez-les. Elles disent ce que le service conserve, combien de temps, et ce que l’exploitant peut voir.'
		},
		askedAgain: 'Si le texte change, cet écran vous demandera de nouveau votre accord.',
		version: (date) => `Version du ${date}`,
		otherOrganisation: 'Choisir une autre organisation',
		accept: 'J’accepte les conditions d’utilisation',
		closedUntil: (organisation) =>
			`Tant que vous ne les avez pas acceptées, l’espace ${deDevant(organisation)}${organisation} reste fermé.`,
		leave: 'Ne pas accepter et quitter l’organisation',
		lastManagerWhat:
			'Une organisation garde toujours au moins une personne responsable. Pour la quitter, acceptez d’abord les conditions, puis, dans l’écran Membres, donnez le rôle de responsable à un autre membre ou invitez une personne comme responsable.',
		sessionChanged: {
			what: 'Depuis l’ouverture de la page, vous avez choisi une autre organisation, peut-être dans un autre onglet. Rien n’a été enregistré.',
			now: 'La page concerne maintenant cette organisation :'
		}
	},
	de: {
		title: 'Nutzungsbedingungen',
		onlyInFrench: 'Diesen Text gibt es vorerst nur auf Französisch.',
		acceptIntro: {
			before: () => 'Bevor Sie den Bereich von ',
			after:
				' betreten, lesen Sie die Nutzungsbedingungen und akzeptieren Sie sie. Sie sagen, was der Dienst speichert, wie lange, und was der Betreiber sehen kann.'
		},
		askedAgain: 'Ändert sich der Text, werden Sie hier erneut um Ihr Einverständnis gebeten.',
		version: (date) => `Version vom ${date}`,
		otherOrganisation: 'Andere Organisation wählen',
		accept: 'Ich akzeptiere die Nutzungsbedingungen',
		closedUntil: (organisation) =>
			`Solange Sie sie nicht akzeptiert haben, bleibt der Bereich von ${organisation} geschlossen.`,
		leave: 'Nicht akzeptieren und Organisation verlassen',
		lastManagerWhat:
			'Eine Organisation behält immer mindestens eine Person in der Leitung. Um sie zu verlassen, akzeptieren Sie zuerst die Nutzungsbedingungen. Geben Sie dann auf der Seite «Mitglieder» einem anderen Mitglied die Rolle «Leitung», oder laden Sie eine Person für die Leitung ein.',
		sessionChanged: {
			what: 'Seit die Seite geöffnet wurde, haben Sie eine andere Organisation gewählt, vielleicht in einem anderen Tab. Es wurde nichts gespeichert.',
			now: 'Die Seite gilt jetzt für diese Organisation:'
		}
	},
	it: {
		title: 'Condizioni d’uso',
		onlyInFrench: 'Per ora questo testo esiste solo in francese.',
		acceptIntro: {
			before: () => 'Prima di entrare nell’area di ',
			after:
				', leggi le condizioni d’uso e accettale. Dicono che cosa conserva il servizio, per quanto tempo e che cosa può vedere chi lo gestisce.'
		},
		askedAgain: 'Se il testo cambia, questa pagina ti chiederà di nuovo il tuo consenso.',
		version: (date) => `Versione del ${date}`,
		otherOrganisation: 'Scegli un’altra organizzazione',
		accept: 'Accetto le condizioni d’uso',
		closedUntil: (organisation) =>
			`Finché non le hai accettate, l’area di ${organisation} resta chiusa.`,
		leave: 'Non accettare e lascia l’organizzazione',
		lastManagerWhat:
			'Un’organizzazione ha sempre almeno un responsabile. Per lasciarla, accetta prima le condizioni d’uso, poi, nella pagina Membri, dai il ruolo di responsabile a un altro membro o invita una persona come responsabile.',
		sessionChanged: {
			what: 'Da quando hai aperto la pagina hai scelto un’altra organizzazione, forse in un’altra scheda. Non è stato salvato niente.',
			now: 'Ora la pagina riguarda questa organizzazione:'
		}
	},
	en: {
		title: 'Terms of use',
		onlyInFrench: 'For now, this text only exists in French.',
		acceptIntro: {
			before: () => 'Before you enter the area of ',
			after:
				', read the terms of use and accept them. They say what the service keeps, for how long, and what the operator can see.'
		},
		askedAgain: 'If the text changes, this page will ask for your agreement again.',
		version: (date) => `Version dated ${date}`,
		otherOrganisation: 'Choose another organisation',
		accept: 'I accept the terms of use',
		closedUntil: (organisation) =>
			`Until you have accepted them, the area of ${organisation} stays closed.`,
		leave: 'Decline the terms and leave the organisation',
		lastManagerWhat:
			'An organisation always keeps at least one manager. To leave it, first accept the terms of use, then, on the Members screen, give the manager role to another member or invite someone as a manager.',
		sessionChanged: {
			what: 'Since the page was opened, you have chosen another organisation, perhaps in another tab. Nothing has been saved.',
			now: 'The page is now about this organisation:'
		}
	},
	ar: {
		title: 'شروط الاستخدام',
		onlyInFrench: 'هذا النص متوفر بالفرنسية فقط في الوقت الحالي.',
		acceptIntro: {
			before: () => 'قبل الدخول إلى مساحة ',
			after:
				'، اقرأ شروط الاستخدام ووافق عليها. فهي تبيّن ما تحفظه الخدمة، ولأي مدة، وما يستطيع المشغّل رؤيته.'
		},
		askedAgain: 'إذا تغيّر النص، ستطلب منك هذه الصفحة موافقتك من جديد.',
		version: (date) => `الإصدار بتاريخ ${date}`,
		otherOrganisation: 'اختيار مؤسسة أخرى',
		accept: 'أوافق على شروط الاستخدام',
		closedUntil: (organisation) => `ما دمت لم توافق عليها، تبقى مساحة ${organisation} مغلقة.`,
		leave: 'عدم الموافقة ومغادرة المؤسسة',
		lastManagerWhat:
			'تحتفظ المؤسسة دائمًا بمسؤول واحد أو أكثر. لمغادرتها، وافق أولًا على شروط الاستخدام، ثم امنح في صفحة «الأعضاء» دور المسؤول لعضو آخر أو ادعُ شخصًا بصفة مسؤول.',
		sessionChanged: {
			what: 'اخترت مؤسسة أخرى منذ أن فُتحت الصفحة، ربما في علامة تبويب أخرى. لم يُحفظ أي شيء.',
			now: 'تخص الصفحة الآن هذه المؤسسة:'
		}
	}
};

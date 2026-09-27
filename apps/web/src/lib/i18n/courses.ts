// Les textes de la liste des cours et de ses pauses (`/cours`), étape 18.
//
// Le rythme, l'horaire, les publics et les dates viennent de `format.ts`. Les libellés d'une ligne de
// cours portent leurs deux-points : l'espace qui les précède n'est que française.
//
// Les deux confirmations d'une pause sont rangées loin des boutons de pause : le correcteur lit les
// textes voisins à la suite, et « Ajouter la pause La pause est ajoutée » lui semblait une répétition.
// Celle d'un cours supprimé les suit, loin de « Supprimer ce cours », pour la même raison.

import type { Translations } from './space.js';

interface CoursesTexts {
	readonly title: string;
	readonly intro: string;
	readonly add: string;
	readonly none: string;
	readonly pauseAdded: string;
	readonly untitled: string;
	readonly pauseRemoved: string;
	readonly courseDeleted: string;
	readonly statuses: {
		readonly draft: string;
		readonly published: string;
	};
	/** Le rythme et l'horaire d'un cours, sur une ligne. */
	readonly schedule: (rhythm: string, time: string) => string;
	readonly audience: string;
	readonly room: string;
	readonly teacher: string;
	/**
	 * Un cours dont des dates précises tombent hors de sa période, enregistré avant la règle de
	 * l'étape 18 : elles ne sont pas publiées, et sa fiche dit lesquelles (étape 19, lot 2).
	 */
	readonly datesOutsidePeriod: string;
	readonly edit: string;
	/**
	 * Le geste réservé au responsable (étape 19, lot 2), ce qu'il emporte, et le bouton qui le
	 * confirme : la base supprime avec le cours ses pauses et les changements de ses séances.
	 */
	readonly deleteCourse: string;
	readonly deleteWarning: string;
	readonly deleteConfirm: string;
	readonly pausesTitle: string;
	readonly pausesIntro: string;
	readonly noPauses: string;
	/** Une pause sans cours choisi : elle vaut pour tous les cours (ADR 0011). */
	readonly wholeOrganisation: string;
	/** « Du lundi 21.12.2026 au dimanche 03.01.2027 ». */
	readonly period: (from: string, to: string) => string;
	readonly deletePause: string;
	readonly newPauseTitle: string;
	readonly pauseCourseLabel: string;
	readonly pauseFromLabel: string;
	readonly pauseToLabel: string;
	readonly pauseReasonLabel: string;
	readonly optional: string;
	readonly pauseReasonHint: string;
	readonly addPause: string;
	/** Une phrase par erreur, que l'action nomme sans jamais l'écrire (voir `LISEZMOI.md`). */
	readonly errors: {
		readonly pauseDates: string;
		readonly pauseInverted: string;
		/** Le cours visé n'existe pas, ou plus, dans l'organisation. */
		readonly courseGone: string;
		/** La pause à retirer n'existe pas, ou plus : une autre personne l'a peut-être retirée. */
		readonly pauseGone: string;
	};
}

export const coursesTexts: Translations<CoursesTexts> = {
	fr: {
		title: 'Cours',
		intro:
			'Les cours de votre organisation. Un cours publié apparaît sur la page publique du programme. Un brouillon reste dans cet espace.',
		add: 'Ajouter un cours',
		none: 'Aucun cours pour l’instant. Touchez « Ajouter un cours » pour créer le premier.',
		pauseAdded: 'La pause est ajoutée.',
		untitled: 'Cours sans titre',
		pauseRemoved: 'La pause est supprimée.',
		courseDeleted: 'Le cours est supprimé.',
		statuses: { draft: 'brouillon', published: 'publié' },
		schedule: (rhythm, time) => `${rhythm}, ${time}`,
		audience: 'Public :',
		room: 'Salle :',
		teacher: 'Intervenant :',
		datesOutsidePeriod:
			'À corriger : des dates de ce cours tombent hors de sa période et ne sont pas publiées. Ouvrez « Modifier ce cours » pour voir lesquelles.',
		edit: 'Modifier ce cours',
		deleteCourse: 'Supprimer ce cours',
		deleteWarning:
			'Le cours disparaîtra de cet écran, de votre page publique et des agendas abonnés, avec ses pauses et les changements de ses séances. Cela ne peut pas être annulé. Pour arrêter le cours à une date, indiquez plutôt son dernier jour dans « Modifier ce cours ».',
		deleteConfirm: 'Oui, supprimer',
		pausesTitle: 'Pauses',
		pausesIntro:
			'Une pause arrête les séances pendant une période : vacances, Ramadan, travaux. Elle vaut pour un seul cours, ou pour tous les cours de l’organisation.',
		noPauses: 'Aucune pause prévue.',
		wholeOrganisation: 'Toute l’organisation',
		period: (from, to) => `Du ${from} au ${to}`,
		deletePause: 'Supprimer cette pause',
		newPauseTitle: 'Nouvelle pause',
		pauseCourseLabel: 'Pour quel cours ?',
		pauseFromLabel: 'Premier jour de la pause',
		pauseToLabel: 'Dernier jour de la pause',
		pauseReasonLabel: 'Raison',
		optional: '(facultatif)',
		pauseReasonHint: 'Elle s’affiche sur la page publique. Exemple : Vacances d’été',
		addPause: 'Ajouter la pause',
		errors: {
			pauseDates: 'Choisissez le premier et le dernier jour de la pause.',
			pauseInverted: 'Le dernier jour de la pause vient avant le premier.',
			courseGone: 'Ce cours n’existe plus : il a peut-être déjà été supprimé.',
			pauseGone: 'Cette pause n’existe plus : elle a peut-être déjà été supprimée.'
		}
	},
	de: {
		title: 'Kurse',
		intro:
			'Die Kurse Ihrer Organisation. Ein veröffentlichter Kurs erscheint auf der öffentlichen Seite des Programms. Ein Entwurf bleibt in diesem Bereich.',
		add: 'Kurs hinzufügen',
		none: 'Noch keine Kurse. Tippen Sie auf «Kurs hinzufügen», um den ersten zu erstellen.',
		pauseAdded: 'Die Pause ist hinzugefügt.',
		untitled: 'Kurs ohne Titel',
		pauseRemoved: 'Die Pause ist gelöscht.',
		courseDeleted: 'Der Kurs ist gelöscht.',
		statuses: { draft: 'Entwurf', published: 'veröffentlicht' },
		schedule: (rhythm, time) => `${rhythm}, ${time}`,
		audience: 'Zielgruppe:',
		room: 'Raum:',
		teacher: 'Lehrperson:',
		datesOutsidePeriod:
			'Zu korrigieren: Einige Daten dieses Kurses liegen ausserhalb seines Zeitraums und werden nicht veröffentlicht. Öffnen Sie «Diesen Kurs bearbeiten», um zu sehen, welche.',
		edit: 'Diesen Kurs bearbeiten',
		deleteCourse: 'Diesen Kurs löschen',
		deleteWarning:
			'Der Kurs verschwindet von dieser Seite, von Ihrer öffentlichen Seite und aus den abonnierten Kalendern, mit seinen Pausen und den Änderungen an seinen Terminen. Das lässt sich nicht rückgängig machen. Um den Kurs an einem bestimmten Tag zu beenden, tragen Sie besser seinen letzten Kurstag unter «Diesen Kurs bearbeiten» ein.',
		deleteConfirm: 'Ja, löschen',
		pausesTitle: 'Pausen',
		pausesIntro:
			'Eine Pause setzt die Termine für eine Zeit aus: Ferien, Ramadan, Bauarbeiten. Sie gilt für einen einzelnen Kurs oder für alle Kurse der Organisation.',
		noPauses: 'Keine Pause geplant.',
		wholeOrganisation: 'Die ganze Organisation',
		period: (from, to) => `Vom ${from} bis ${to}`,
		deletePause: 'Diese Pause löschen',
		newPauseTitle: 'Neue Pause',
		pauseCourseLabel: 'Für welchen Kurs?',
		pauseFromLabel: 'Erster Tag der Pause',
		pauseToLabel: 'Letzter Tag der Pause',
		pauseReasonLabel: 'Grund',
		optional: '(freiwillig)',
		pauseReasonHint: 'Er erscheint auf der öffentlichen Seite. Beispiel: Sommerferien',
		addPause: 'Pause hinzufügen',
		errors: {
			pauseDates: 'Wählen Sie den ersten und den letzten Tag der Pause.',
			pauseInverted: 'Der letzte Tag der Pause liegt vor dem ersten.',
			courseGone: 'Diesen Kurs gibt es nicht mehr. Vielleicht wurde er schon gelöscht.',
			pauseGone: 'Diese Pause gibt es nicht mehr. Vielleicht wurde sie schon gelöscht.'
		}
	},
	it: {
		title: 'Corsi',
		intro:
			'I corsi della tua organizzazione. Un corso pubblicato compare sulla pagina pubblica del programma. Una bozza resta in quest’area.',
		add: 'Aggiungi un corso',
		none: 'Ancora nessun corso. Tocca «Aggiungi un corso» per creare il primo.',
		pauseAdded: 'La pausa è stata aggiunta.',
		untitled: 'Corso senza titolo',
		pauseRemoved: 'La pausa è stata eliminata.',
		courseDeleted: 'Il corso è stato eliminato.',
		statuses: { draft: 'bozza', published: 'pubblicato' },
		schedule: (rhythm, time) => `${rhythm}, ${time}`,
		audience: 'Pubblico:',
		room: 'Sala:',
		teacher: 'Insegnante:',
		datesOutsidePeriod:
			'Da correggere: alcune date di questo corso cadono fuori dal suo periodo e non sono pubblicate. Apri «Modifica questo corso» per vedere quali.',
		edit: 'Modifica questo corso',
		deleteCourse: 'Elimina questo corso',
		deleteWarning:
			'Il corso sparirà da questa schermata, dalla tua pagina pubblica e dai calendari abbonati, con le sue pause e le modifiche alle sue lezioni. Non si può annullare. Per terminare il corso a una certa data, indica piuttosto il suo ultimo giorno in «Modifica questo corso».',
		deleteConfirm: 'Sì, elimina',
		pausesTitle: 'Pause',
		pausesIntro:
			'Una pausa sospende le lezioni per un periodo: vacanze, Ramadan, lavori. Vale per un solo corso, o per tutti i corsi dell’organizzazione.',
		noPauses: 'Nessuna pausa prevista.',
		wholeOrganisation: 'Tutta l’organizzazione',
		// « Da … a … », sans article : il s'accorderait au nom du jour, masculin ou féminin.
		period: (from, to) => `Da ${from} a ${to}`,
		deletePause: 'Elimina questa pausa',
		newPauseTitle: 'Nuova pausa',
		pauseCourseLabel: 'Per quale corso?',
		pauseFromLabel: 'Primo giorno della pausa',
		pauseToLabel: 'Ultimo giorno della pausa',
		pauseReasonLabel: 'Motivo',
		optional: '(facoltativo)',
		pauseReasonHint: 'Compare sulla pagina pubblica. Esempio: Vacanze estive',
		addPause: 'Aggiungi la pausa',
		errors: {
			pauseDates: 'Scegli il primo e l’ultimo giorno della pausa.',
			pauseInverted: 'L’ultimo giorno della pausa viene prima del primo.',
			courseGone: 'Questo corso non esiste più: forse è già stato eliminato.',
			pauseGone: 'Questa pausa non esiste più: forse è già stata eliminata.'
		}
	},
	en: {
		title: 'Courses',
		intro:
			'The courses of your organisation. A published course appears on the public page of the programme. A draft stays in this area.',
		add: 'Add a course',
		none: 'No courses yet. Tap ‘Add a course’ to create the first one.',
		pauseAdded: 'The break has been added.',
		untitled: 'Untitled course',
		pauseRemoved: 'The break has been deleted.',
		courseDeleted: 'The course has been deleted.',
		statuses: { draft: 'draft', published: 'published' },
		schedule: (rhythm, time) => `${rhythm}, ${time}`,
		audience: 'Audience:',
		room: 'Room:',
		teacher: 'Teacher:',
		datesOutsidePeriod:
			'To correct: some dates of this course fall outside its period and are not published. Open ‘Edit this course’ to see which ones.',
		edit: 'Edit this course',
		deleteCourse: 'Delete this course',
		deleteWarning:
			'The course will disappear from this screen, from your public page and from subscribed calendars, with its breaks and the changes to its sessions. This cannot be undone. To end the course on a given date, set its last day in ‘Edit this course’ instead.',
		deleteConfirm: 'Yes, delete',
		pausesTitle: 'Breaks',
		pausesIntro:
			'A break stops the sessions for a period: holidays, Ramadan, building work. It applies to a single course, or to all the courses of the organisation.',
		noPauses: 'No break planned.',
		wholeOrganisation: 'The whole organisation',
		period: (from, to) => `From ${from} to ${to}`,
		deletePause: 'Delete this break',
		newPauseTitle: 'New break',
		pauseCourseLabel: 'For which course?',
		pauseFromLabel: 'First day of the break',
		pauseToLabel: 'Last day of the break',
		pauseReasonLabel: 'Reason',
		optional: '(optional)',
		pauseReasonHint: 'It is shown on the public page. Example: Summer holidays',
		addPause: 'Add the break',
		errors: {
			pauseDates: 'Choose the first and the last day of the break.',
			pauseInverted: 'The last day of the break comes before the first.',
			courseGone: 'This course no longer exists. It may already have been deleted.',
			pauseGone: 'This break no longer exists. It may already have been deleted.'
		}
	},
	ar: {
		title: 'الدروس',
		intro:
			'دروس مؤسستك. يظهر الدرس المنشور على الصفحة العامة للبرنامج. أما المسودة فتبقى في هذه المساحة.',
		add: 'إضافة درس',
		none: 'لا توجد دروس بعد. اضغط على «إضافة درس» لإنشاء الدرس الأول.',
		pauseAdded: 'أُضيفت العطلة.',
		untitled: 'درس بلا عنوان',
		pauseRemoved: 'حُذفت العطلة.',
		courseDeleted: 'حُذف الدرس.',
		statuses: { draft: 'مسودة', published: 'منشور' },
		// La virgule arabe entre le rythme et l'horaire.
		schedule: (rhythm, time) => `${rhythm}، ${time}`,
		audience: 'الفئة:',
		room: 'القاعة:',
		teacher: 'المدرّس:',
		datesOutsidePeriod:
			'يجب التصحيح: بعض تواريخ هذا الدرس تقع خارج فترته ولا تُنشر. افتح «تعديل هذا الدرس» لتعرف أيّها.',
		edit: 'تعديل هذا الدرس',
		deleteCourse: 'حذف هذا الدرس',
		deleteWarning:
			'سيختفي الدرس من هذه الشاشة ومن صفحتك العامة ومن التقاويم المشترِكة، مع عطله والتغييرات على حصصه. لا يمكن التراجع عن ذلك. لإنهاء الدرس في تاريخ معيّن، حدّد بدلًا من ذلك يومه الأخير في «تعديل هذا الدرس».',
		deleteConfirm: 'نعم، احذف',
		pausesTitle: 'العطل',
		pausesIntro:
			'العطلة توقف الحصص خلال مدة: إجازة، رمضان، أشغال. وهي تخص درسًا واحدًا، أو كل دروس المؤسسة.',
		noPauses: 'لا توجد عطلة مقررة.',
		wholeOrganisation: 'المؤسسة كلها',
		period: (from, to) => `من ${from} إلى ${to}`,
		deletePause: 'حذف هذه العطلة',
		newPauseTitle: 'عطلة جديدة',
		pauseCourseLabel: 'لأي درس؟',
		pauseFromLabel: 'اليوم الأول من العطلة',
		pauseToLabel: 'اليوم الأخير من العطلة',
		pauseReasonLabel: 'السبب',
		optional: '(اختياري)',
		pauseReasonHint: 'يظهر على الصفحة العامة. مثال: العطلة الصيفية',
		addPause: 'إضافة العطلة',
		errors: {
			pauseDates: 'اختر اليوم الأول واليوم الأخير من العطلة.',
			pauseInverted: 'اليوم الأخير من العطلة يأتي قبل اليوم الأول.',
			courseGone: 'هذا الدرس لم يعد موجودًا. ربما حُذف من قبل.',
			pauseGone: 'هذه العطلة لم تعد موجودة. ربما حُذفت من قبل.'
		}
	}
};

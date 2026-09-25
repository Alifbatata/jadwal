// Les quatre langues de l'interface publique (ADR 0007).
//
// Un objet par langue, pas de bibliothèque : il y a quatre langues et une centaine de phrases, et
// une dépendance coûterait plus qu'elle ne rendrait. TypeScript tient le contrat — une clé oubliée
// dans une langue ne compile pas.
//
// Les nombres s'écrivent en chiffres latins dans les quatre langues, l'arabe compris : c'est la
// décision de l'ADR 0007, et c'est ce que lisent les téléphones réglés en français d'une communauté
// qui parle arabe.

import { isoDateToDays, parseIsoDate, weekdayFromDays, type IsoDate } from '@jadwal/core';

export const LANGUES = ['fr', 'de', 'it', 'ar'] as const;
export type Langue = (typeof LANGUES)[number];

/** Le sens d'écriture. L'arabe est en RTL complet. */
export function direction(langue: Langue): 'ltr' | 'rtl' {
	return langue === 'ar' ? 'rtl' : 'ltr';
}

/** Le nom de chaque langue, écrit dans cette langue : c'est ainsi qu'on choisit la sienne. */
export const NOM_DE_LANGUE: Record<Langue, string> = {
	fr: 'Français',
	de: 'Deutsch',
	it: 'Italiano',
	ar: 'العربية'
};

interface Dictionnaire {
	readonly weekdays: readonly string[];
	readonly months: readonly string[];
	readonly views: { week: string; courses: string; month: string };
	readonly audiences: Record<string, string>;
	readonly rhythms: Record<string, string>;
	readonly today: string;
	readonly period: (from: string, to: string) => string;
	readonly cancelled: string;
	readonly exceptionalDate: string;
	readonly movedTo: (date: string) => string;
	readonly originallyOn: (date: string) => string;
	readonly after: (prayer: string) => string;
	/** « 15 min après Maghrib ». Le nombre est positif : le signe est déjà dans le choix du mot. */
	readonly afterOffset: (offset: number, prayer: string) => string;
	/** « 15 min avant Maghrib », pour un décalage négatif, donné ici par sa valeur absolue. */
	readonly beforeOffset: (offset: number, prayer: string) => string;
	readonly emptyPauseNamed: (reason: string) => string;
	readonly emptyPause: string;
	readonly emptyNotPublished: string;
	readonly emptyWeek: string;
	readonly emptyFilter: string;
	readonly emptyMonth: string;
	readonly emptyDay: string;
	readonly noCourses: string;
	readonly allAudiences: string;
	readonly place: string;
	readonly teacher: string;
	readonly taughtIn: string;
	/** Le titre du bloc du vendredi, en haut de la page publique (ADR 0033). */
	readonly jumua: string;
	/** « sermon en arabe et français » : le mot juste, qui n'est pas « enseigné en ». */
	readonly sermonIn: (languages: string) => string;
	readonly fromTo: (from: string, to: string) => string;
	readonly datesLabel: string;
	readonly nextSessions: string;
	readonly noNextSessions: string;
	readonly backToProgramme: string;
	readonly coursesCrumb: string;
	readonly subscribe: string;
	readonly subscribeTitle: string;
	readonly subscribeIntro: (name: string) => string;
	readonly subscribeButton: string;
	readonly subscribeAddress: string;
	readonly subscribeWholeTitle: string;
	readonly subscribeOneCourseTitle: string;
	readonly subscribeOneCourseText: string;
	readonly subscribeWhole: string;
	readonly addCourseToCalendar: string;
	readonly courseFeedAddress: string;
	readonly onIphone: string;
	readonly onAndroid: string;
	readonly onOutlook: string;
	readonly iphoneText: string;
	readonly androidText: string;
	readonly outlookText: string;
	readonly offeredBy: string;
	/** Le lien du pied vers les conditions d'utilisation, qui n'existent qu'en français. */
	readonly terms: string;
	/**
	 * Ce qu'un lien qui ouvre un nouvel onglet dit aux lecteurs d'écran, et à eux seuls (technique
	 * G201 des WCAG). Les textes du chef de projet, mot pour mot ; `annonceNouvelOnglet` les met
	 * entre parenthèses.
	 */
	readonly newTab: string;
	/** Le titre de la page d'erreur d'une adresse publique qui n'existe pas. */
	readonly notFound: string;
	/** La phrase qui le suit : la seule chose que le visiteur peut faire. */
	readonly notFoundHint: string;
	readonly weekTitle: string;
	readonly coursesTitle: string;
	readonly sessionCount: (count: number) => string;
	readonly previousMonth: string;
	readonly nextMonth: string;
	readonly shortWeekdays: readonly string[];
}

/**
 * L'accord d'un nom arabe avec son nombre, selon les six formes du CLDR (`Intl.PluralRules`) :
 * zéro, un, deux, puis « few » et « many », lus sur les deux derniers chiffres (de 3 à 10, de 11
 * à 99 : 103 est « few », 111 est « many »), et « other » pour le reste (100, 101, 102, 200…).
 *
 * C'est le seul endroit où l'arabe accorde un nom à un nombre : les minutes de la page, celles du
 * flux agenda, qui reprend `afterOffset`, et le nombre de séances passent tous par ici. Le nombre
 * reste en chiffres latins (ADR 0007) : seules les règles viennent d'`Intl`, jamais le formatage.
 */
const PLURIEL_ARABE = new Intl.PluralRules('ar');

function selonLeNombre(nombre: number, formes: Record<Intl.LDMLPluralRule, string>): string {
	return formes[PLURIEL_ARABE.select(nombre)];
}

const fr: Dictionnaire = {
	weekdays: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
	shortWeekdays: ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'],
	months: [
		'janvier',
		'février',
		'mars',
		'avril',
		'mai',
		'juin',
		'juillet',
		'août',
		'septembre',
		'octobre',
		'novembre',
		'décembre'
	],
	views: { week: 'Semaine', courses: 'Tous les cours', month: 'Mois' },
	audiences: {
		kids: 'Enfants',
		youth: 'Jeunes',
		women: 'Femmes',
		adults: 'Adultes',
		open: 'Ouvert à tous'
	},
	rhythms: {
		weekly: 'Chaque semaine',
		fortnightly: 'Une semaine sur deux',
		monthly: 'Chaque mois',
		dates: 'À des dates précises'
	},
	today: 'aujourd’hui',
	period: (from, to) => `Du ${from} au ${to}`,
	cancelled: 'Annulé',
	exceptionalDate: 'Date exceptionnelle',
	movedTo: (date) => `Déplacé au ${date}`,
	originallyOn: (date) => `Initialement le ${date}`,
	after: (prayer) => `Après ${prayer}`,
	afterOffset: (offset, prayer) => `${offset} min après ${prayer}`,
	beforeOffset: (offset, prayer) => `${offset} min avant ${prayer}`,
	emptyPauseNamed: (reason) => `Pas de cours cette semaine : ${reason}.`,
	emptyPause: 'Pas de cours cette semaine : une pause est en cours.',
	emptyNotPublished: 'Le programme n’est pas encore publié.',
	emptyWeek: 'Aucune séance cette semaine.',
	emptyFilter: 'Aucune séance cette semaine pour ce public.',
	emptyMonth: 'Aucune séance ce mois-ci.',
	emptyDay: 'Aucune séance ce jour-là.',
	noCourses: 'Aucun cours publié pour l’instant.',
	allAudiences: 'Tous',
	place: 'Lieu',
	teacher: 'Intervenant',
	taughtIn: 'Enseigné en',
	jumua: 'Prière du vendredi',
	sermonIn: (languages) => `sermon en ${languages}`,
	fromTo: (from, to) => `Du ${from} au ${to}`,
	datesLabel: 'Dates',
	nextSessions: 'Prochaines séances',
	noNextSessions: 'Aucune date à venir.',
	backToProgramme: 'Retour au programme',
	coursesCrumb: 'Cours',
	subscribe: 'S’abonner au calendrier',
	subscribeTitle: 'S’abonner au calendrier',
	subscribeIntro: (name) =>
		`Le programme de ${name} s’ajoute à votre calendrier et se met à jour tout seul, environ une fois par heure. Rien à réinstaller quand un cours change.`,
	subscribeButton: 'Ajouter à mon calendrier',
	subscribeAddress: 'Ou copiez cette adresse dans votre application de calendrier :',
	subscribeWholeTitle: 'Tout le programme',
	subscribeOneCourseTitle: 'Un seul cours',
	subscribeOneCourseText:
		'Vous pouvez aussi n’ajouter qu’un cours. Touchez son nom : il s’ajoute seul et se met à jour comme le reste. Son adresse en https figure sur la page du cours.',
	subscribeWhole: 'S’abonner à tout le programme',
	addCourseToCalendar: 'Ajouter ce cours à mon agenda',
	courseFeedAddress: 'Ou copiez cette adresse, qui ne porte que ce cours :',
	onIphone: 'Sur iPhone et iPad',
	onAndroid: 'Sur Android',
	onOutlook: 'Sur Outlook',
	iphoneText:
		'Touchez le bouton ci-dessus : votre iPhone propose d’ajouter le calendrier. Si rien ne se passe, ouvrez Réglages, puis Applications, Calendrier, Comptes, Ajouter un compte, Autre, Ajouter un abonnement à un calendrier, et collez l’adresse.',
	androidText:
		'Ouvrez Google Agenda sur un ordinateur : l’application du téléphone ne sait pas ajouter un abonnement. Dans Autres agendas, choisissez À partir de l’URL, collez l’adresse, puis ajoutez l’agenda. Il apparaîtra ensuite sur votre téléphone.',
	outlookText:
		'Ouvrez Outlook sur le web, allez dans Calendrier, Ajouter un calendrier, S’abonner à partir du Web, collez l’adresse, donnez-lui un nom, puis importez.',
	offeredBy: 'Proposé gratuitement par jadwal, un service de Voltia',
	terms: 'Conditions d’utilisation',
	newTab: 's’ouvre dans un nouvel onglet',
	notFound: 'Page introuvable',
	notFoundHint: 'Vérifiez l’adresse.',
	weekTitle: 'Cours de la semaine',
	coursesTitle: 'Tous les cours',
	sessionCount: (count) => (count === 1 ? '1 séance' : `${count} séances`),
	previousMonth: 'Mois précédent',
	nextMonth: 'Mois suivant'
};

const de: Dictionnaire = {
	weekdays: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
	shortWeekdays: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
	months: [
		'Januar',
		'Februar',
		'März',
		'April',
		'Mai',
		'Juni',
		'Juli',
		'August',
		'September',
		'Oktober',
		'November',
		'Dezember'
	],
	views: { week: 'Woche', courses: 'Alle Kurse', month: 'Monat' },
	audiences: {
		kids: 'Kinder',
		youth: 'Jugendliche',
		women: 'Frauen',
		adults: 'Erwachsene',
		open: 'Für alle offen'
	},
	rhythms: {
		weekly: 'Jede Woche',
		fortnightly: 'Alle zwei Wochen',
		monthly: 'Jeden Monat',
		dates: 'An bestimmten Daten'
	},
	today: 'heute',
	period: (from, to) => `Vom ${from} bis ${to}`,
	cancelled: 'Abgesagt',
	exceptionalDate: 'Ausnahmetermin',
	movedTo: (date) => `Verschoben auf ${date}`,
	originallyOn: (date) => `Ursprünglich am ${date}`,
	after: (prayer) => `Nach ${prayer}`,
	afterOffset: (offset, prayer) => `${offset} Min. nach ${prayer}`,
	beforeOffset: (offset, prayer) => `${offset} Min. vor ${prayer}`,
	emptyPauseNamed: (reason) => `Diese Woche kein Unterricht: ${reason}.`,
	emptyPause: 'Diese Woche kein Unterricht: es läuft eine Pause.',
	emptyNotPublished: 'Das Programm ist noch nicht veröffentlicht.',
	emptyWeek: 'Diese Woche keine Termine.',
	emptyFilter: 'Diese Woche keine Termine für dieses Publikum.',
	emptyMonth: 'Diesen Monat keine Termine.',
	emptyDay: 'An diesem Tag keine Termine.',
	noCourses: 'Noch keine Kurse veröffentlicht.',
	allAudiences: 'Alle',
	place: 'Ort',
	teacher: 'Leitung',
	taughtIn: 'Unterrichtssprache',
	jumua: 'Freitagsgebet',
	sermonIn: (languages) => `Predigt auf ${languages}`,
	fromTo: (from, to) => `Vom ${from} bis ${to}`,
	datesLabel: 'Zeitraum',
	nextSessions: 'Nächste Termine',
	noNextSessions: 'Keine kommenden Termine.',
	backToProgramme: 'Zurück zum Programm',
	coursesCrumb: 'Kurse',
	subscribe: 'Kalender abonnieren',
	subscribeTitle: 'Kalender abonnieren',
	subscribeIntro: (name) =>
		`Das Programm von ${name} kommt in Ihren Kalender und aktualisiert sich von selbst, etwa einmal pro Stunde. Nichts neu einrichten, wenn sich ein Kurs ändert.`,
	subscribeButton: 'Zu meinem Kalender hinzufügen',
	subscribeAddress: 'Oder kopieren Sie diese Adresse in Ihre Kalender-App:',
	subscribeWholeTitle: 'Das ganze Programm',
	subscribeOneCourseTitle: 'Nur ein Kurs',
	subscribeOneCourseText:
		'Sie können auch nur einen Kurs hinzufügen. Tippen Sie auf seinen Namen: er kommt allein in den Kalender und aktualisiert sich wie der Rest. Seine https-Adresse steht auf der Seite des Kurses.',
	subscribeWhole: 'Das ganze Programm abonnieren',
	addCourseToCalendar: 'Diesen Kurs zu meinem Kalender hinzufügen',
	courseFeedAddress: 'Oder kopieren Sie diese Adresse, die nur diesen Kurs enthält:',
	onIphone: 'Auf iPhone und iPad',
	onAndroid: 'Auf Android',
	onOutlook: 'In Outlook',
	iphoneText:
		'Tippen Sie auf die Schaltfläche oben: Ihr iPhone bietet an, den Kalender hinzuzufügen. Passiert nichts, öffnen Sie Einstellungen, dann Apps, Kalender, Accounts, Account hinzufügen, Andere, Kalenderabo hinzufügen, und fügen Sie die Adresse ein.',
	androidText:
		'Öffnen Sie Google Kalender am Computer: die Telefon-App kann keine Abos hinzufügen. Wählen Sie unter Weitere Kalender die Option Per URL, fügen Sie die Adresse ein und fügen Sie den Kalender hinzu. Danach erscheint er auf Ihrem Telefon.',
	outlookText:
		'Öffnen Sie Outlook im Web, gehen Sie zu Kalender, Kalender hinzufügen, Aus dem Internet abonnieren, fügen Sie die Adresse ein, geben Sie einen Namen ein und importieren Sie.',
	offeredBy: 'Kostenlos bereitgestellt von jadwal, einem Dienst von Voltia',
	terms: 'Nutzungsbedingungen',
	newTab: 'öffnet sich in einem neuen Tab',
	notFound: 'Seite nicht gefunden',
	notFoundHint: 'Bitte prüfen Sie die Adresse.',
	weekTitle: 'Kurse dieser Woche',
	coursesTitle: 'Alle Kurse',
	sessionCount: (count) => (count === 1 ? '1 Termin' : `${count} Termine`),
	previousMonth: 'Vorheriger Monat',
	nextMonth: 'Nächster Monat'
};

const it: Dictionnaire = {
	weekdays: ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'],
	shortWeekdays: ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'],
	months: [
		'gennaio',
		'febbraio',
		'marzo',
		'aprile',
		'maggio',
		'giugno',
		'luglio',
		'agosto',
		'settembre',
		'ottobre',
		'novembre',
		'dicembre'
	],
	views: { week: 'Settimana', courses: 'Tutti i corsi', month: 'Mese' },
	audiences: {
		kids: 'Bambini',
		youth: 'Giovani',
		women: 'Donne',
		adults: 'Adulti',
		open: 'Aperto a tutti'
	},
	rhythms: {
		weekly: 'Ogni settimana',
		fortnightly: 'Una settimana su due',
		monthly: 'Ogni mese',
		dates: 'In date precise'
	},
	today: 'oggi',
	period: (from, to) => `Dal ${from} al ${to}`,
	cancelled: 'Annullato',
	exceptionalDate: 'Data eccezionale',
	movedTo: (date) => `Spostato al ${date}`,
	originallyOn: (date) => `Inizialmente il ${date}`,
	after: (prayer) => `Dopo ${prayer}`,
	afterOffset: (offset, prayer) => `${offset} min dopo ${prayer}`,
	beforeOffset: (offset, prayer) => `${offset} min prima di ${prayer}`,
	emptyPauseNamed: (reason) => `Nessun corso questa settimana: ${reason}.`,
	emptyPause: 'Nessun corso questa settimana: è in corso una pausa.',
	emptyNotPublished: 'Il programma non è ancora pubblicato.',
	emptyWeek: 'Nessuna lezione questa settimana.',
	emptyFilter: 'Nessuna lezione questa settimana per questo pubblico.',
	emptyMonth: 'Nessuna lezione questo mese.',
	emptyDay: 'Nessuna lezione in questo giorno.',
	noCourses: 'Nessun corso pubblicato per ora.',
	allAudiences: 'Tutti',
	place: 'Luogo',
	teacher: 'Docente',
	taughtIn: 'Lingua del corso',
	jumua: 'Preghiera del venerdì',
	sermonIn: (languages) => `sermone in ${languages}`,
	fromTo: (from, to) => `Dal ${from} al ${to}`,
	datesLabel: 'Date',
	nextSessions: 'Prossime lezioni',
	noNextSessions: 'Nessuna data in programma.',
	backToProgramme: 'Torna al programma',
	coursesCrumb: 'Corsi',
	subscribe: 'Iscriviti al calendario',
	subscribeTitle: 'Iscriviti al calendario',
	subscribeIntro: (name) =>
		`Il programma di ${name} entra nel tuo calendario e si aggiorna da solo, circa una volta all’ora. Niente da reinstallare quando un corso cambia.`,
	subscribeButton: 'Aggiungi al mio calendario',
	subscribeAddress: 'Oppure copia questo indirizzo nella tua app di calendario:',
	subscribeWholeTitle: 'Tutto il programma',
	subscribeOneCourseTitle: 'Un solo corso',
	subscribeOneCourseText:
		'Puoi anche aggiungere un solo corso. Tocca il suo nome: entra da solo nel calendario e si aggiorna come il resto. Il suo indirizzo https si trova sulla pagina del corso.',
	subscribeWhole: 'Iscriviti a tutto il programma',
	addCourseToCalendar: 'Aggiungi questo corso al mio calendario',
	courseFeedAddress: 'Oppure copia questo indirizzo, che contiene solo questo corso:',
	onIphone: 'Su iPhone e iPad',
	onAndroid: 'Su Android',
	onOutlook: 'Su Outlook',
	iphoneText:
		'Tocca il pulsante qui sopra: l’iPhone propone di aggiungere il calendario. Se non succede nulla, apri Impostazioni, poi App, Calendario, Account, Aggiungi account, Altro, Aggiungi calendario con iscrizione, e incolla l’indirizzo.',
	androidText:
		'Apri Google Calendar da un computer: l’app del telefono non sa aggiungere un’iscrizione. In Altri calendari scegli Da URL, incolla l’indirizzo e aggiungi il calendario. Comparirà poi sul telefono.',
	outlookText:
		'Apri Outlook sul web, vai su Calendario, Aggiungi calendario, Iscriviti dal Web, incolla l’indirizzo, dagli un nome e importa.',
	offeredBy: 'Offerto gratuitamente da jadwal, un servizio di Voltia',
	terms: 'Condizioni d’uso',
	newTab: 'si apre in una nuova scheda',
	notFound: 'Pagina non trovata',
	notFoundHint: 'Controlla l’indirizzo.',
	weekTitle: 'Corsi della settimana',
	coursesTitle: 'Tutti i corsi',
	sessionCount: (count) => (count === 1 ? '1 lezione' : `${count} lezioni`),
	previousMonth: 'Mese precedente',
	nextMonth: 'Mese successivo'
};

const ar: Dictionnaire = {
	weekdays: ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'],
	// Les formes étroites du CLDR (`weekday: 'narrow'`), d'une lettre : l'en-tête de la vue Mois n'a
	// pas la place de plus. Les formes « short » de l'arabe sont les noms entiers.
	shortWeekdays: ['ن', 'ث', 'ر', 'خ', 'ج', 'س', 'ح'],
	months: [
		'يناير',
		'فبراير',
		'مارس',
		'أبريل',
		'مايو',
		'يونيو',
		'يوليو',
		'أغسطس',
		'سبتمبر',
		'أكتوبر',
		'نوفمبر',
		'ديسمبر'
	],
	views: { week: 'الأسبوع', courses: 'كل الدروس', month: 'الشهر' },
	audiences: {
		kids: 'الأطفال',
		youth: 'الشباب',
		women: 'النساء',
		adults: 'الكبار',
		open: 'مفتوح للجميع'
	},
	rhythms: {
		weekly: 'كل أسبوع',
		fortnightly: 'كل أسبوعين',
		monthly: 'كل شهر',
		dates: 'في تواريخ محددة'
	},
	today: 'اليوم',
	period: (from, to) => `من ${from} إلى ${to}`,
	cancelled: 'ملغى',
	exceptionalDate: 'موعد استثنائي',
	movedTo: (date) => `نُقل إلى ${date}`,
	originallyOn: (date) => `كان مقرّرًا في ${date}`,
	after: (prayer) => `بعد ${prayer}`,
	// Zéro n'est pas une phrase de minutes : c'est « après » tout court, la phrase de `after`.
	afterOffset: (offset, prayer) =>
		selonLeNombre(offset, {
			zero: `بعد ${prayer}`,
			one: `بعد ${prayer} بدقيقة واحدة`,
			two: `بعد ${prayer} بدقيقتين`,
			few: `بعد ${prayer} بـ${offset} دقائق`,
			many: `بعد ${prayer} بـ${offset} دقيقة`,
			other: `بعد ${prayer} بـ${offset} دقيقة`
		}),
	// Les formes de « بعد », relues par le chef de projet, avec « قبل » à la place. Zéro n'arrive
	// jamais ici, un décalage nul se dit par `after` ; la forme n'est là que parce que l'accord en
	// demande six.
	beforeOffset: (offset, prayer) =>
		selonLeNombre(offset, {
			zero: `قبل ${prayer}`,
			one: `قبل ${prayer} بدقيقة واحدة`,
			two: `قبل ${prayer} بدقيقتين`,
			few: `قبل ${prayer} بـ${offset} دقائق`,
			many: `قبل ${prayer} بـ${offset} دقيقة`,
			other: `قبل ${prayer} بـ${offset} دقيقة`
		}),
	emptyPauseNamed: (reason) => `لا دروس هذا الأسبوع: ${reason}.`,
	emptyPause: 'لا دروس هذا الأسبوع: هناك عطلة.',
	emptyNotPublished: 'لم يُنشر البرنامج بعد.',
	emptyWeek: 'لا حصص هذا الأسبوع.',
	emptyFilter: 'لا حصص هذا الأسبوع لهذه الفئة.',
	emptyMonth: 'لا حصص هذا الشهر.',
	emptyDay: 'لا حصص في هذا اليوم.',
	noCourses: 'لا دروس منشورة حاليًا.',
	allAudiences: 'الكل',
	place: 'المكان',
	teacher: 'المدرّس',
	taughtIn: 'لغة التدريس',
	jumua: 'صلاة الجمعة',
	sermonIn: (languages) => `لغة الخطبة: ${languages}`,
	fromTo: (from, to) => `من ${from} إلى ${to}`,
	datesLabel: 'الفترة',
	nextSessions: 'الحصص القادمة',
	noNextSessions: 'لا مواعيد قادمة.',
	backToProgramme: 'العودة إلى البرنامج',
	coursesCrumb: 'الدروس',
	subscribe: 'الاشتراك في التقويم',
	subscribeTitle: 'الاشتراك في التقويم',
	subscribeIntro: (name) =>
		`يُضاف برنامج ${name} إلى تقويمك ويُحدَّث تلقائيًا، مرة كل ساعة تقريبًا. لا حاجة لإعادة أي إعداد عند تغيّر درس.`,
	subscribeButton: 'أضف إلى تقويمي',
	subscribeAddress: 'أو انسخ هذا العنوان والصقه في تطبيق التقويم:',
	subscribeWholeTitle: 'البرنامج كاملًا',
	subscribeOneCourseTitle: 'درس واحد فقط',
	subscribeOneCourseText:
		'يمكنك أيضًا إضافة درس واحد فقط. اضغط على اسمه: يُضاف وحده ويُحدَّث مثل الباقي. وعنوانه بصيغة https موجود في صفحة الدرس.',
	subscribeWhole: 'الاشتراك في البرنامج كاملًا',
	addCourseToCalendar: 'أضف هذا الدرس إلى تقويمي',
	courseFeedAddress: 'أو انسخ هذا العنوان، وهو خاص بهذا الدرس وحده:',
	// Décision du chef de projet, à l'étape 17 : ce titre reste tel quel, avec le « و » détaché
	// devant « iPad ». Une relecture ne doit pas le « corriger ».
	onIphone: 'على iPhone و iPad',
	onAndroid: 'على Android',
	onOutlook: 'على Outlook',
	iphoneText:
		'اضغط على الزر أعلاه: سيقترح هاتفك إضافة التقويم. إن لم يحدث شيء، افتح الإعدادات، ثم التطبيقات، التقويم، الحسابات، إضافة حساب، أخرى، إضافة اشتراك تقويم، والصق العنوان.',
	androidText:
		'افتح تقويم Google على حاسوب: تطبيق الهاتف لا يضيف الاشتراكات. من التقاويم الأخرى اختر من عنوان URL، الصق العنوان ثم أضف التقويم. سيظهر بعدها على هاتفك.',
	outlookText:
		'افتح Outlook على الويب، اذهب إلى التقويم، إضافة تقويم، الاشتراك من الويب، الصق العنوان، سمِّه، ثم استورد.',
	offeredBy: 'مقدَّم مجانًا من jadwal، خدمة من Voltia',
	terms: 'شروط الاستخدام',
	newTab: 'يُفتح في علامة تبويب جديدة',
	notFound: 'الصفحة غير موجودة',
	notFoundHint: 'تحقّق من العنوان.',
	weekTitle: 'دروس الأسبوع',
	coursesTitle: 'كل الدروس',
	sessionCount: (count) =>
		selonLeNombre(count, {
			zero: 'لا حصص',
			one: 'حصة واحدة',
			two: 'حصتان',
			few: `${count} حصص`,
			many: `${count} حصة`,
			other: `${count} حصة`
		}),
	previousMonth: 'الشهر السابق',
	nextMonth: 'الشهر التالي'
};

const DICTIONNAIRES: Record<Langue, Dictionnaire> = { fr, de, it, ar };

export function t(langue: Langue): Dictionnaire {
	return DICTIONNAIRES[langue];
}

/**
 * Le texte caché d'un lien qui ouvre un nouvel onglet : collé au texte visible, il donne au lien le
 * nom « Conditions d’utilisation (s’ouvre dans un nouvel onglet) ».
 *
 * Entre parenthèses, et non après une virgule. L'élément qui le cache est en `position: absolute`,
 * donc un bloc, et Chrome sépare un bloc de ce qui l'entoure par une espace : la virgule se
 * retrouvait détachée, « Conditions d’utilisation , s’ouvre… », mesuré dans l'arbre
 * d'accessibilité de Chrome 153. L'espace de tête couvre les calculs du nom qui ne séparent pas les
 * blocs, et la page lue sans sa feuille de style.
 */
export function annonceNouvelOnglet(langue: Langue): string {
	return ` (${DICTIONNAIRES[langue].newTab})`;
}

/** « lundi 21 septembre », dans la langue demandée. Chiffres latins partout. */
export function longDate(langue: Langue, date: IsoDate): string {
	const civil = parseIsoDate(date);
	if (!civil) return date;
	const dictionnaire = DICTIONNAIRES[langue];
	const jour = dictionnaire.weekdays[weekdayFromDays(isoDateToDays(date)) - 1] ?? '';
	const mois = dictionnaire.months[civil.month - 1] ?? '';
	if (langue === 'fr') {
		return `${jour} ${civil.day === 1 ? '1er' : civil.day} ${mois}`;
	}
	if (langue === 'de') return `${jour}, ${civil.day}. ${mois}`;
	return `${jour} ${civil.day} ${mois}`;
}

/** « 21 septembre 2026 », pour les endroits où l'année compte. */
export function dateWithYear(langue: Langue, date: IsoDate): string {
	const civil = parseIsoDate(date);
	if (!civil) return date;
	const mois = DICTIONNAIRES[langue].months[civil.month - 1] ?? '';
	if (langue === 'de') return `${civil.day}. ${mois} ${civil.year}`;
	if (langue === 'fr' && civil.day === 1) return `1er ${mois} ${civil.year}`;
	return `${civil.day} ${mois} ${civil.year}`;
}

/**
 * La balise `<html>` de `src/app.html`, avec ses deux repères. `%lang%` n'est pas un repère de
 * SvelteKit : c'est celui de sa documentation sur l'accessibilité, remplacé par le hook.
 */
const BALISE_HTML = '<html lang="%lang%" dir="%dir%">';

/**
 * La langue et le sens du document, écrits sur `<html>`. Une page publique donne sa langue ; le reste
 * du service, qui n'en donne aucune, reste en français, de gauche à droite.
 *
 * Sans cela, une page arabe portait `<html lang="fr">` : la page intérieure disait bien `ar`, mais le
 * `<title>`, lu avant elle, était annoncé comme du français.
 *
 * On remplace la balise entière et pas seulement `%lang%` : le texte d'une page est échappé, un
 * chevron tapé dans une description y devient `&lt;`. La balise ne peut donc venir que du gabarit,
 * alors que les mots `%lang%` pourraient se trouver dans n'importe quel texte saisi.
 */
export function documentDansSaLangue(html: string, langue: Langue | undefined): string {
	const choisie = langue ?? 'fr';
	return html.replace(BALISE_HTML, `<html lang="${choisie}" dir="${direction(choisie)}">`);
}

/** « Octobre 2026 », en tête de la vue Mois. */
export function monthName(langue: Langue, year: number, month: number): string {
	const mois = DICTIONNAIRES[langue].months[month - 1] ?? '';
	const majuscule = langue === 'ar' ? mois : mois.charAt(0).toUpperCase() + mois.slice(1);
	return `${majuscule} ${year}`;
}

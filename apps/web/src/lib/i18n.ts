// Les cinq langues de l'interface publique (ADR 0007) : français, allemand, italien, anglais
// britannique et arabe, dans cet ordre, pour tout le service. L'anglais s'est ajouté à l'étape 18.
//
// Un objet par langue, pas de bibliothèque : il y a cinq langues et une centaine de phrases, et
// une dépendance coûterait plus qu'elle ne rendrait. TypeScript tient le contrat — une clé oubliée
// dans une langue ne compile pas.
//
// Les nombres s'écrivent en chiffres latins dans les cinq langues, l'arabe compris : c'est la
// décision de l'ADR 0007, et c'est ce que lisent les téléphones réglés en français d'une communauté
// qui parle arabe.
//
// Les dates s'écrivent `JJ.MM.AAAA` dans toutes les langues, comme en Suisse (étape 18), par
// `numericDate`, et `longDate` y ajoute le nom du jour. La page publique, les messages prêts à
// coller et les écrans de l'espace qui passent par `format.ts` les mettent en forme ici ; une date
// lue par une personne ne doit pas l'être ailleurs.

import { isoDateToDays, parseIsoDate, weekdayFromDays, type IsoDate } from '@jadwal/core';

export const LANGUES = ['fr', 'de', 'it', 'en', 'ar'] as const;
export type Langue = (typeof LANGUES)[number];

/** Une langue de l'interface, ou non : ce qui vient d'une adresse ou de la base se vérifie ici. */
export function isLangue(value: string): value is Langue {
	return (LANGUES as readonly string[]).includes(value);
}

/** Le sens d'écriture. L'arabe est en RTL complet. */
export function direction(langue: Langue): 'ltr' | 'rtl' {
	return langue === 'ar' ? 'rtl' : 'ltr';
}

/** Le nom de chaque langue, écrit dans cette langue : c'est ainsi qu'on choisit la sienne. */
export const NOM_DE_LANGUE: Record<Langue, string> = {
	fr: 'Français',
	de: 'Deutsch',
	it: 'Italiano',
	en: 'English',
	ar: 'العربية'
};

interface Dictionnaire {
	readonly weekdays: readonly string[];
	readonly months: readonly string[];
	/** Les onglets de l'en-tête. `prayers` n'est montré que si le module des prières est allumé. */
	readonly views: { week: string; courses: string; month: string; prayers: string };
	readonly audiences: Record<string, string>;
	readonly rhythms: Record<string, string>;
	readonly today: string;
	readonly period: (from: string, to: string) => string;
	readonly cancelled: string;
	readonly exceptionalDate: string;
	readonly movedTo: (date: string) => string;
	readonly originallyOn: (date: string) => string;
	/**
	 * Une séance déplacée le même jour, à une autre heure (relecture du lot 4). Au départ, la nouvelle
	 * heure ; à l'arrivée, la marque, puis l'heure d'avant. La page disait « Déplacé au » suivi du jour
	 * même, et « Date exceptionnelle » pour une date qui n'avait pas changé.
	 */
	readonly movedToTime: (time: string) => string;
	readonly newTime: string;
	readonly originallyAt: (time: string) => string;
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
	/**
	 * « Prochaines séances : samedi 26.09.2026, lundi 28.09.2026 », sous un cours de la vue « Tous
	 * les cours ». La phrase entière, et pas seulement son libellé : chaque langue a sa ponctuation.
	 * L'espace avant les deux-points n'est que française. L'arabe sépare les dates par sa virgule,
	 * « ، ». L'allemand, par un point-virgule, parce que la virgule y suit déjà le nom du jour
	 * (« Samstag, 26.09.2026 ») et qu'une seconde les confondrait.
	 *
	 * Rangée après `noNextSessions`, et non juste après `nextSessions` : le correcteur lit à la suite
	 * les textes voisins, et deux « Prochaines séances » de suite lui semblaient une répétition.
	 */
	readonly nextSessionsLine: (dates: readonly string[]) => string;
	readonly backToProgramme: string;
	/** Le fil d'Ariane de la page d'un cours, qui ramène à la vue de tous les cours. */
	readonly coursesCrumb: string;
	/**
	 * Le lien qui mène, depuis la vue « Tous les cours », à la page d'un seul cours. Il portait le
	 * mot du fil d'Ariane, au pluriel en anglais, en allemand et en italien.
	 */
	readonly coursePage: string;
	readonly subscribe: string;
	readonly subscribeTitle: string;
	/**
	 * L'introduction de la page d'abonnement. Elle ne dit plus « environ une fois par heure » depuis
	 * l'étape 18 : c'est vrai d'un iPhone, pas de Google, qui peut mettre un jour (retour E2). Le
	 * délai est dit sous chaque bouton, pour l'application qu'il ouvre.
	 */
	readonly subscribeIntro: (name: string) => string;
	/** Le bouton `webcal:` d'un iPhone, d'un iPad ou d'un Mac (étape 18, retour E1). */
	readonly subscribeButton: string;
	readonly subscribeAddress: string;
	readonly subscribeWholeTitle: string;
	readonly subscribeOneCourseTitle: string;
	/** Sous « Un seul cours », sur un iPhone : chaque nom de cours ouvre son flux `webcal:`. */
	readonly subscribeOneCourseText: string;
	/**
	 * Sur Android : chaque nom de cours ouvre Google Agenda, et, juste dessous, sa page donne l'issue
	 * si Google ne propose rien sur le téléphone (relecture du lot 4). Le lien porte le mot
	 * `coursePage` et prend toute la largeur, sous le nom : la phrase disait « à côté » (relecture du
	 * lot 5).
	 */
	readonly subscribeOneCourseGoogle: string;
	/** Ailleurs : chaque nom de cours mène à sa page, qui propose le choix complet. */
	readonly subscribeOneCourseChoice: string;
	readonly subscribeWhole: string;
	/** Le titre du bloc d'abonnement de la page d'un cours, au-dessus de ce que l'appareil propose. */
	readonly addCourseToCalendar: string;
	readonly courseFeedAddress: string;
	/**
	 * Sur Android, l'étiquette de l'adresse, sous la phrase qui dit de la coller sur un ordinateur :
	 * « Ou copiez cette adresse… » la présentait comme un autre choix (relecture du lot 4). Sur un
	 * iPhone, où elle suit un bouton, `subscribeAddress` et `courseFeedAddress` restent justes.
	 */
	readonly androidAddress: string;
	readonly androidCourseAddress: string;
	/** Le bouton d'un Android : Google Agenda, avec la demande d'abonnement prête. */
	readonly addToGoogle: string;
	/** Ce qui se passe quand on touche le bouton `webcal:`, sur un iPhone, un iPad ou un Mac. */
	readonly appleHelp: string;
	/**
	 * Ce que fait le bouton de Google Agenda, sur Android : il ouvre Google Agenda avec la demande
	 * d'abonnement. Il ne promet pas que Google l'accepte sur un téléphone : l'aide de Google
	 * (answer 37100) dit qu'il faut le navigateur d'un ordinateur (relecture du lot 3).
	 */
	readonly googleHelp: string;
	/**
	 * Le délai de Google (retour E2). Une phrase à elle, reprise partout où Google est proposé :
	 * sous le bouton d'Android, sous le choix de Google, et dans les étapes à suivre à la main.
	 */
	readonly googleDelay: string;
	/**
	 * Sous le bouton d'Android, ce qu'il faut faire si Google Agenda ne propose rien sur le
	 * téléphone : passer par un ordinateur, avec l'adresse écrite juste en dessous. La phrase se suffit
	 * à elle-même : la page d'un cours n'a pas d'étapes à suivre à la main.
	 *
	 * Les étapes et leurs libellés sont ceux de l'aide de Google (answer 37100, « Use a link to add a
	 * public calendar », relue le 26.09.2026 en en, fr, de, it et ar) : le « + » à côté de la
	 * rubrique des autres agendas, le choix par l'adresse, puis le bouton qui ajoute l'agenda. `androidText`
	 * dit les mêmes étapes.
	 */
	readonly googleComputer: string;
	/** Le choix complet, quand l'appareil n'est pas reconnu ou que le visiteur le demande. */
	readonly chooseApp: string;
	readonly choiceGoogle: string;
	readonly choiceGoogleHelp: string;
	readonly choiceOutlook: string;
	readonly choiceOutlookHelp: string;
	/**
	 * Le délai d'Outlook, comme celui de Google : Microsoft écrit qu'une mise à jour « can take more
	 * than 24 hours » (Import or subscribe to a calendar in Outlook.com or Outlook on the web).
	 */
	readonly outlookDelay: string;
	readonly choiceOther: string;
	readonly choiceOtherHelp: string;
	/** « Copier l’adresse » : un texte à sélectionner, la page n'ayant aucun script pour le copier. */
	readonly choiceCopy: string;
	readonly choiceCopyHelp: string;
	/** Le lien vers le choix complet, pour qui n'est pas reconnu comme il faut. */
	readonly otherDevice: string;
	/** Les étapes à suivre à la main, quand le bouton ne fait rien. */
	readonly manualTitle: string;
	/** L'introduction des étapes, là où la page propose un bouton : iPhone, iPad, Mac et Android. */
	readonly manualIntro: string;
	/** La même, sur le choix complet, qui n'a que des liens (relecture du lot 3). */
	readonly manualIntroChoice: string;
	readonly onIphone: string;
	readonly onAndroid: string;
	readonly onOutlook: string;
	/**
	 * Les étapes sur un iPhone ou un iPad, sans parler d'un bouton : elles se lisent aussi sur le
	 * choix complet, qui n'en a pas, et sur la page d'Android, dont le bouton est celui de Google.
	 */
	readonly iphoneText: string;
	readonly androidText: string;
	readonly outlookText: string;
	readonly offeredBy: string;
	/** Le lien du pied vers les conditions d'utilisation, qui n'existent qu'en français. */
	readonly terms: string;
	/**
	 * Le nom de la liste des langues, pour les lecteurs d'écran (`aria-label`). Il était écrit
	 * « Langues » dans les trois gabarits, et donc annoncé en français sur une page arabe.
	 */
	readonly languagesLabel: string;
	/**
	 * Le nom des deux autres listes de liens de l'en-tête, pour les lecteurs d'écran : les vues
	 * (semaine, tous les cours, mois) et les publics. Elles portaient le nom de leur premier lien,
	 * « Semaine » et « Tous », qui ne dit pas ce qu'on y choisit.
	 */
	readonly viewsLabel: string;
	readonly audiencesLabel: string;
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
	/** L'onglet des prières (étape 18, retour C4) : son titre, dans l'onglet du navigateur. */
	readonly prayersTitle: string;
	readonly noPrayerTimes: string;
	/** « Aujourd’hui, samedi 26.09.2026 » : la date vient de `longDate`. */
	readonly prayersToday: (date: string) => string;
	/** Ce que sont l'adhan et l'iqama, pour qui ne connaît pas les deux mots. */
	readonly prayersHelp: string;
	readonly prayerColumn: string;
	readonly dayColumn: string;
	readonly adhan: string;
	readonly iqama: string;
	/** Dit aux lecteurs d'écran, à la place d'un tiret, qu'aucune iqama n'est fixée. */
	readonly noIqama: string;
	readonly prayersWeek: string;
	readonly weekBoxHelp: string;
	/** Le nom du cadre qui fait défiler le tableau de la semaine sur un téléphone. */
	readonly weekTableLabel: string;
	readonly fridayBoxHelp: string;
	/**
	 * Montrée quand une session du vendredi est déplacée à un autre jour des sept : la case du Dhuhr
	 * de ce jour-là la donne, nommée, avec son vendredi d'origine (relecture du lot 4).
	 */
	readonly movedJumuaHelp: string;
	/** « Prière du vendredi : 12:30 et 13:45 », à la place de l'iqama du Dhuhr, un vendredi. */
	readonly jumuaAt: (times: string) => string;
	readonly jumuaReplacesDhuhr: string;
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
	views: { week: 'Semaine', courses: 'Tous les cours', month: 'Mois', prayers: 'Prières' },
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
	movedToTime: (time) => `Déplacé à ${time}`,
	newTime: 'Nouvelle heure',
	originallyAt: (time) => `Initialement à ${time}`,
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
	nextSessionsLine: (dates) => `Prochaines séances : ${dates.join(', ')}`,
	backToProgramme: 'Retour au programme',
	coursesCrumb: 'Cours',
	coursePage: 'Page du cours',
	subscribe: 'S’abonner au calendrier',
	subscribeTitle: 'S’abonner au calendrier',
	subscribeIntro: (name) =>
		`Le programme de ${name} s’ajoute à votre calendrier et se met à jour tout seul. Rien à réinstaller quand un cours change.`,
	subscribeButton: 'Ajouter à mon calendrier',
	addToGoogle: 'Ajouter à Google Agenda',
	subscribeAddress: 'Ou copiez cette adresse dans votre application de calendrier :',
	subscribeWholeTitle: 'Tout le programme',
	subscribeOneCourseTitle: 'Un seul cours',
	subscribeOneCourseText:
		'Vous pouvez aussi n’ajouter qu’un cours. Touchez son nom : il s’ajoute seul et se met à jour comme le reste. Son adresse en https figure sur la page du cours.',
	subscribeOneCourseGoogle:
		'Vous pouvez aussi n’ajouter qu’un cours. Touchez son nom : Google Agenda s’ouvre pour ce cours seul, comme avec le bouton ci-dessus. Si Google Agenda ne propose rien sur votre téléphone, touchez Page du cours, juste sous son nom : cette page donne l’adresse du cours et la marche à suivre sur un ordinateur.',
	subscribeOneCourseChoice:
		'Vous pouvez aussi n’ajouter qu’un cours. Touchez son nom : sa page propose les mêmes choix, pour ce cours seul.',
	subscribeWhole: 'S’abonner à tout le programme',
	addCourseToCalendar: 'Ajouter ce cours à mon agenda',
	courseFeedAddress: 'Ou copiez cette adresse, qui ne porte que ce cours :',
	androidAddress: 'L’adresse à coller :',
	androidCourseAddress: 'L’adresse à coller, qui ne porte que ce cours :',
	// Le libellé du bouton d'Android est rangé sous celui de l'iPhone, et non ici : le correcteur
	// recolle les chaînes voisines en un paragraphe, et lisait ce libellé, sans point, comme la fin
	// d'une phrase.
	appleHelp:
		'Touchez le bouton, ou cliquez dessus sur un Mac : l’application Calendrier propose de vous abonner. Acceptez, et le calendrier se met à jour tout seul, environ une fois par heure.',
	googleHelp:
		'Touchez le bouton : il ouvre Google Agenda et lui demande d’ajouter cet agenda. Si Google Agenda propose de l’ajouter, confirmez.',
	googleDelay: 'Google peut mettre jusqu’à 24 heures à rafraîchir un abonnement.',
	googleComputer:
		'Si Google Agenda ne propose rien sur votre téléphone, passez par un ordinateur : selon Google, on ne peut ajouter un agenda par son adresse que depuis le navigateur d’un ordinateur. Ouvrez-y Google Agenda. À gauche, à côté d’Autres agendas, cliquez sur le signe + (Ajouter d’autres agendas), puis choisissez À partir de l’URL. Collez l’adresse ci-dessous et cliquez sur Ajouter l’agenda. L’agenda apparaîtra ensuite aussi sur votre téléphone.',
	chooseApp: 'Choisissez votre application de calendrier :',
	choiceGoogle: 'Google Agenda',
	// Un nom d'application, puis la phrase qui dit ce qu'elle fait : le correcteur les lisait d'un
	// seul tenant.
	choiceGoogleHelp: 'Il propose d’ajouter l’agenda à votre compte Google.',
	choiceOutlook: 'Outlook',
	choiceOutlookHelp:
		'Outlook sur le web s’ouvre avec l’adresse déjà remplie : choisissez Importer. Avec un compte de travail ou d’école, copiez plutôt l’adresse.',
	outlookDelay: 'Outlook peut mettre plus de 24 heures à rafraîchir un abonnement.',
	choiceOther: 'Une autre application',
	choiceOtherHelp:
		'Calendrier d’Apple, Thunderbird ou toute application qui sait s’abonner à un calendrier : elle s’ouvre et propose l’abonnement.',
	choiceCopy: 'Copier l’adresse',
	choiceCopyHelp:
		'Sélectionnez-la, copiez-la, puis collez-la dans votre application, là où elle propose d’ajouter un calendrier par son adresse.',
	otherDevice: 'Un autre appareil ? Voir tous les choix',
	manualTitle: 'Ajouter l’adresse à la main',
	manualIntro:
		'Si le bouton ne fait rien, copiez l’adresse et suivez les étapes de votre application.',
	manualIntroChoice:
		'Si aucun de ces liens ne fonctionne pour vous, copiez l’adresse et suivez les étapes de votre application.',
	onIphone: 'Sur iPhone et iPad',
	onAndroid: 'Sur Android',
	onOutlook: 'Sur Outlook',
	iphoneText:
		'Ouvrez Réglages, puis Applications, Calendrier, Comptes, Ajouter un compte, Autre, Ajouter un abonnement à un calendrier, et collez l’adresse.',
	androidText:
		'Selon Google, on ne peut ajouter un agenda par son adresse que depuis le navigateur d’un ordinateur. Sur l’ordinateur, ouvrez Google Agenda. À gauche, à côté d’Autres agendas, cliquez sur le signe + (Ajouter d’autres agendas), puis choisissez À partir de l’URL. Collez l’adresse et cliquez sur Ajouter l’agenda. Il apparaîtra ensuite aussi sur votre téléphone.',
	outlookText:
		'Ouvrez Outlook sur le web, allez dans Calendrier, Ajouter un calendrier, S’abonner à partir du Web, collez l’adresse, donnez-lui un nom, puis importez.',
	offeredBy: 'Proposé gratuitement par jadwal, un service de Voltia',
	terms: 'Conditions d’utilisation',
	languagesLabel: 'Langues',
	viewsLabel: 'Affichage',
	audiencesLabel: 'Filtrer par public',
	newTab: 's’ouvre dans un nouvel onglet',
	notFound: 'Page introuvable',
	notFoundHint: 'Vérifiez l’adresse.',
	weekTitle: 'Cours de la semaine',
	coursesTitle: 'Tous les cours',
	sessionCount: (count) => (count === 1 ? '1 séance' : `${count} séances`),
	previousMonth: 'Mois précédent',
	nextMonth: 'Mois suivant',
	// L'onglet des prières (étape 18, retour C4).
	prayersTitle: 'Heures de prière',
	noPrayerTimes: 'Les heures de prière ne sont pas encore publiées.',
	prayersToday: (date) => `Aujourd’hui, ${date}`,
	prayersHelp:
		'L’adhan est l’appel à la prière. L’iqama est l’heure à laquelle elle commence dans la salle.',
	prayerColumn: 'Prière',
	dayColumn: 'Jour',
	adhan: 'Adhan',
	iqama: 'Iqama',
	noIqama: 'Aucune iqama fixée',
	prayersWeek: 'Les sept prochains jours',
	weekBoxHelp:
		'Dans chaque case, l’heure de l’adhan, et en dessous celle de l’iqama quand elle est fixée.',
	weekTableLabel: 'Tableau des sept prochains jours',
	fridayBoxHelp: 'Le vendredi, la case du Dhuhr donne les heures de la prière du vendredi.',
	movedJumuaHelp:
		'Quand une prière du vendredi est déplacée à un autre jour, la case du Dhuhr de ce jour-là la donne aussi, avec son nom et sa date d’origine.',
	jumuaReplacesDhuhr: 'Elle remplace le Dhuhr chaque vendredi.',
	jumuaAt: (times) => `Prière du vendredi : ${times}`
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
	views: { week: 'Woche', courses: 'Alle Kurse', month: 'Monat', prayers: 'Gebetszeiten' },
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
	movedToTime: (time) => `Verschoben auf ${time}`,
	newTime: 'Neue Uhrzeit',
	originallyAt: (time) => `Ursprünglich um ${time}`,
	after: (prayer) => `Nach ${prayer}`,
	afterOffset: (offset, prayer) => `${offset} Min. nach ${prayer}`,
	beforeOffset: (offset, prayer) => `${offset} Min. vor ${prayer}`,
	emptyPauseNamed: (reason) => `Diese Woche kein Unterricht: ${reason}.`,
	emptyPause: 'Diese Woche kein Unterricht: Es ist Pause.',
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
	nextSessionsLine: (dates) => `Nächste Termine: ${dates.join('; ')}`,
	backToProgramme: 'Zurück zum Programm',
	coursesCrumb: 'Kurse',
	coursePage: 'Seite des Kurses',
	subscribe: 'Kalender abonnieren',
	subscribeTitle: 'Kalender abonnieren',
	subscribeIntro: (name) =>
		`Das Programm von ${name} kommt in Ihren Kalender und aktualisiert sich von selbst. Nichts neu einrichten, wenn sich ein Kurs ändert.`,
	subscribeButton: 'Zu meinem Kalender hinzufügen',
	subscribeAddress: 'Oder kopieren Sie diese Adresse in Ihre Kalender-App:',
	subscribeWholeTitle: 'Das ganze Programm',
	subscribeOneCourseTitle: 'Nur ein Kurs',
	subscribeOneCourseText:
		'Sie können auch nur einen Kurs hinzufügen. Tippen Sie auf seinen Namen: Er kommt allein in den Kalender und aktualisiert sich wie der Rest. Seine https-Adresse steht auf der Seite des Kurses.',
	subscribeOneCourseGoogle:
		'Sie können auch nur einen Kurs hinzufügen. Tippen Sie auf seinen Namen: Google Kalender öffnet sich für diesen Kurs allein, wie mit der Schaltfläche oben. Wenn Google Kalender auf Ihrem Telefon nichts anbietet, tippen Sie direkt unter seinem Namen auf Seite des Kurses: Dort stehen die Adresse des Kurses und die Schritte am Computer.',
	subscribeOneCourseChoice:
		'Sie können auch nur einen Kurs hinzufügen. Tippen Sie auf seinen Namen: Seine Seite bietet dieselben Möglichkeiten, nur für diesen Kurs.',
	subscribeWhole: 'Das ganze Programm abonnieren',
	addCourseToCalendar: 'Diesen Kurs zu meinem Kalender hinzufügen',
	courseFeedAddress: 'Oder kopieren Sie diese Adresse, die nur diesen Kurs enthält:',
	androidAddress: 'Die Adresse zum Einfügen:',
	androidCourseAddress: 'Die Adresse zum Einfügen, die nur diesen Kurs enthält:',
	addToGoogle: 'Zu Google Kalender hinzufügen',
	appleHelp:
		'Tippen Sie auf die Schaltfläche, auf dem Mac klicken Sie darauf: Die App Kalender bietet an, den Kalender zu abonnieren. Bestätigen Sie, und der Kalender aktualisiert sich von selbst, etwa einmal pro Stunde.',
	googleHelp:
		'Tippen Sie auf die Schaltfläche: Sie öffnet Google Kalender und bittet darum, diesen Kalender hinzuzufügen. Wenn Google Kalender es Ihnen anbietet, bestätigen Sie.',
	googleDelay: 'Google kann bis zu 24 Stunden brauchen, um ein Abo zu aktualisieren.',
	googleComputer:
		'Wenn Google Kalender auf Ihrem Telefon nichts anbietet, nehmen Sie einen Computer: Laut Google lässt sich ein Kalender über seine Adresse nur im Browser eines Computers hinzufügen. Öffnen Sie dort Google Kalender. Klicken Sie links neben Weitere Kalender auf das Symbol + (Weitere Kalender hinzufügen) und dann auf Per URL. Fügen Sie die Adresse unten ein und klicken Sie auf Kalender hinzufügen. Danach erscheint der Kalender auch auf Ihrem Telefon.',
	chooseApp: 'Wählen Sie Ihre Kalender-App:',
	choiceGoogle: 'Google Kalender',
	choiceGoogleHelp: 'Er bietet an, den Kalender zu Ihrem Google-Konto hinzuzufügen.',
	choiceOutlook: 'Outlook',
	choiceOutlookHelp:
		'Outlook im Web öffnet sich mit der bereits eingetragenen Adresse: Wählen Sie Importieren. Mit einem Geschäfts- oder Schulkonto kopieren Sie besser die Adresse.',
	outlookDelay: 'Outlook kann mehr als 24 Stunden brauchen, um ein Abo zu aktualisieren.',
	choiceOther: 'Eine andere App',
	choiceOtherHelp:
		'Apple Kalender, Thunderbird oder jede App, die Kalender abonnieren kann: Sie öffnet sich und bietet das Abo an.',
	choiceCopy: 'Die Adresse kopieren',
	choiceCopyHelp:
		'Markieren und kopieren Sie sie, dann fügen Sie sie in Ihrer App dort ein, wo sie anbietet, einen Kalender über seine Adresse hinzuzufügen.',
	otherDevice: 'Ein anderes Gerät? Alle Möglichkeiten anzeigen',
	manualTitle: 'Die Adresse von Hand hinzufügen',
	manualIntro:
		'Wenn die Schaltfläche nichts bewirkt, kopieren Sie die Adresse und folgen Sie den Schritten Ihrer App.',
	manualIntroChoice:
		'Wenn keiner dieser Links für Sie funktioniert, kopieren Sie die Adresse und folgen Sie den Schritten Ihrer App.',
	onIphone: 'Auf iPhone und iPad',
	onAndroid: 'Auf Android',
	onOutlook: 'In Outlook',
	iphoneText:
		'Öffnen Sie Einstellungen, dann Apps, Kalender, Accounts, Account hinzufügen, Andere, Kalenderabo hinzufügen, und fügen Sie die Adresse ein.',
	androidText:
		'Laut Google lässt sich ein Kalender über seine Adresse nur im Browser eines Computers hinzufügen. Öffnen Sie am Computer Google Kalender. Klicken Sie links neben Weitere Kalender auf das Symbol + (Weitere Kalender hinzufügen) und dann auf Per URL. Fügen Sie die Adresse ein und klicken Sie auf Kalender hinzufügen. Danach erscheint er auch auf Ihrem Telefon.',
	outlookText:
		'Öffnen Sie Outlook im Web, gehen Sie zu Kalender, Kalender hinzufügen, Aus dem Internet abonnieren, fügen Sie die Adresse ein, geben Sie einen Namen ein und importieren Sie.',
	offeredBy: 'Kostenlos bereitgestellt von jadwal, einem Dienst von Voltia',
	terms: 'Nutzungsbedingungen',
	languagesLabel: 'Sprachen',
	viewsLabel: 'Ansicht',
	audiencesLabel: 'Nach Zielgruppe filtern',
	newTab: 'öffnet sich in einem neuen Tab',
	notFound: 'Seite nicht gefunden',
	notFoundHint: 'Bitte prüfen Sie die Adresse.',
	weekTitle: 'Kurse dieser Woche',
	coursesTitle: 'Alle Kurse',
	sessionCount: (count) => (count === 1 ? '1 Termin' : `${count} Termine`),
	previousMonth: 'Vorheriger Monat',
	nextMonth: 'Nächster Monat',
	// L'onglet des prières (étape 18, retour C4).
	prayersTitle: 'Gebetszeiten',
	noPrayerTimes: 'Die Gebetszeiten sind noch nicht veröffentlicht.',
	prayersToday: (date) => `Heute, ${date}`,
	prayersHelp:
		'Der Adhan ist der Gebetsruf. Die Iqama ist die Zeit, zu der das Gebet im Gebetsraum beginnt.',
	prayerColumn: 'Gebet',
	dayColumn: 'Tag',
	adhan: 'Adhan',
	iqama: 'Iqama',
	noIqama: 'Keine Iqama festgelegt',
	prayersWeek: 'Die nächsten sieben Tage',
	weekBoxHelp:
		'In jedem Feld steht die Zeit des Adhan, darunter die der Iqama, wenn sie festgelegt ist.',
	weekTableLabel: 'Tabelle der nächsten sieben Tage',
	fridayBoxHelp: 'Am Freitag nennt das Feld des Dhuhr die Zeiten des Freitagsgebets.',
	movedJumuaHelp:
		'Wird ein Freitagsgebet auf einen anderen Tag verschoben, steht es auch im Feld des Dhuhr an diesem Tag, mit seinem Namen und seinem ursprünglichen Datum.',
	jumuaReplacesDhuhr: 'Es tritt jeden Freitag an die Stelle des Dhuhr.',
	jumuaAt: (times) => `Freitagsgebet: ${times}`
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
	views: { week: 'Settimana', courses: 'Tutti i corsi', month: 'Mese', prayers: 'Preghiere' },
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
	// Sans article devant le nom du jour, qui ouvre la date longue : « al domenica » et
	// « il domenica » seraient faux. « Inizialmente domenica … » est la phrase du chef de projet.
	movedTo: (date) => `Spostato a ${date}`,
	originallyOn: (date) => `Inizialmente ${date}`,
	movedToTime: (time) => `Spostato alle ${time}`,
	newTime: 'Nuovo orario',
	originallyAt: (time) => `Inizialmente alle ${time}`,
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
	nextSessionsLine: (dates) => `Prossime lezioni: ${dates.join(', ')}`,
	backToProgramme: 'Torna al programma',
	coursesCrumb: 'Corsi',
	coursePage: 'Pagina del corso',
	subscribe: 'Iscriviti al calendario',
	subscribeTitle: 'Iscriviti al calendario',
	subscribeIntro: (name) =>
		`Il programma di ${name} entra nel tuo calendario e si aggiorna da solo. Niente da reinstallare quando un corso cambia.`,
	subscribeButton: 'Aggiungi al mio calendario',
	subscribeAddress: 'Oppure copia questo indirizzo nella tua app di calendario:',
	subscribeWholeTitle: 'Tutto il programma',
	subscribeOneCourseTitle: 'Un solo corso',
	subscribeOneCourseText:
		'Puoi anche aggiungere un solo corso. Tocca il suo nome: entra da solo nel calendario e si aggiorna come il resto. Il suo indirizzo https si trova sulla pagina del corso.',
	subscribeOneCourseGoogle:
		'Puoi anche aggiungere un solo corso. Tocca il suo nome: Google Calendar si apre solo per quel corso, come con il pulsante qui sopra. Se Google Calendar non propone nulla sul telefono, tocca Pagina del corso, subito sotto il suo nome: lì trovi l’indirizzo del corso e i passaggi da fare su un computer.',
	subscribeOneCourseChoice:
		'Puoi anche aggiungere un solo corso. Tocca il suo nome: la sua pagina offre le stesse possibilità, solo per quel corso.',
	subscribeWhole: 'Iscriviti a tutto il programma',
	addCourseToCalendar: 'Aggiungi questo corso al mio calendario',
	courseFeedAddress: 'Oppure copia questo indirizzo, che contiene solo questo corso:',
	androidAddress: 'L’indirizzo da incollare:',
	androidCourseAddress: 'L’indirizzo da incollare, che contiene solo questo corso:',
	addToGoogle: 'Aggiungi a Google Calendar',
	appleHelp:
		'Tocca il pulsante (sul computer, fai clic): l’app Calendario propone di iscriverti. Accetta, e il calendario si aggiorna da solo, circa una volta all’ora.',
	googleHelp:
		'Tocca il pulsante: apre Google Calendar e gli chiede di aggiungere questo calendario. Se Google Calendar te lo propone, conferma.',
	googleDelay: 'Google può impiegare fino a 24 ore per aggiornare un’iscrizione.',
	googleComputer:
		'Se Google Calendar non propone nulla sul telefono, usa un computer: secondo Google, un calendario si può aggiungere tramite indirizzo solo dal browser di un computer. Apri lì Google Calendar. A sinistra, accanto ad Altri calendari, fai clic sul segno + (Aggiungi altri calendari) e poi su Da URL. Incolla l’indirizzo qui sotto e fai clic su Aggiungi calendario. Il calendario comparirà poi anche sul telefono.',
	chooseApp: 'Scegli la tua app di calendario:',
	choiceGoogle: 'Google Calendar',
	choiceGoogleHelp: 'Propone di aggiungere il calendario al tuo account Google.',
	choiceOutlook: 'Outlook',
	choiceOutlookHelp:
		'Outlook sul web si apre con l’indirizzo già inserito: scegli Importa. Con un account di lavoro o di scuola, copia piuttosto l’indirizzo.',
	outlookDelay: 'Outlook può impiegare più di 24 ore per aggiornare un’iscrizione.',
	choiceOther: 'Un’altra app',
	choiceOtherHelp:
		'Calendario di Apple, Thunderbird o qualsiasi app in grado di iscriversi a un calendario: si apre e propone l’iscrizione.',
	choiceCopy: 'Copia l’indirizzo',
	choiceCopyHelp:
		'Selezionalo, copialo e incollalo nella tua app, là dove propone di aggiungere un calendario tramite indirizzo.',
	otherDevice: 'Un altro dispositivo? Vedi tutte le possibilità',
	manualTitle: 'Aggiungere l’indirizzo a mano',
	manualIntro: 'Se il pulsante non fa nulla, copia l’indirizzo e segui i passaggi della tua app.',
	manualIntroChoice:
		'Se nessuno di questi link funziona per te, copia l’indirizzo e segui i passaggi della tua app.',
	onIphone: 'Su iPhone e iPad',
	onAndroid: 'Su Android',
	onOutlook: 'Su Outlook',
	iphoneText:
		'Apri Impostazioni, poi App, Calendario, Account, Aggiungi account, Altro, Aggiungi calendario con iscrizione, e incolla l’indirizzo.',
	androidText:
		'Secondo Google, un calendario si può aggiungere tramite indirizzo solo dal browser di un computer. Dal computer apri Google Calendar. A sinistra, accanto ad Altri calendari, fai clic sul segno + (Aggiungi altri calendari) e poi su Da URL. Incolla l’indirizzo e fai clic su Aggiungi calendario. Comparirà poi anche sul telefono.',
	outlookText:
		'Apri Outlook sul web, vai su Calendario, Aggiungi calendario, Iscriviti dal Web, incolla l’indirizzo, dagli un nome e importa.',
	offeredBy: 'Offerto gratuitamente da jadwal, un servizio di Voltia',
	terms: 'Condizioni d’uso',
	languagesLabel: 'Lingue',
	viewsLabel: 'Visualizzazione',
	audiencesLabel: 'Filtra per pubblico',
	newTab: 'si apre in una nuova scheda',
	notFound: 'Pagina non trovata',
	notFoundHint: 'Controlla l’indirizzo.',
	weekTitle: 'Corsi della settimana',
	coursesTitle: 'Tutti i corsi',
	sessionCount: (count) => (count === 1 ? '1 lezione' : `${count} lezioni`),
	previousMonth: 'Mese precedente',
	nextMonth: 'Mese successivo',
	// L'onglet des prières (étape 18, retour C4).
	prayersTitle: 'Orari delle preghiere',
	noPrayerTimes: 'Gli orari delle preghiere non sono ancora pubblicati.',
	prayersToday: (date) => `Oggi, ${date}`,
	prayersHelp:
		'L’adhan è la chiamata alla preghiera. L’iqama è l’ora in cui la preghiera comincia nella sala.',
	prayerColumn: 'Preghiera',
	dayColumn: 'Giorno',
	adhan: 'Adhan',
	iqama: 'Iqama',
	noIqama: 'Nessuna iqama fissata',
	prayersWeek: 'I prossimi sette giorni',
	weekBoxHelp: 'In ogni casella l’ora dell’adhan e, sotto, quella dell’iqama quando è fissata.',
	weekTableLabel: 'Tabella dei prossimi sette giorni',
	fridayBoxHelp: 'Il venerdì, la casella del Dhuhr indica gli orari della preghiera del venerdì.',
	movedJumuaHelp:
		'Quando una preghiera del venerdì viene spostata a un altro giorno, compare anche nella casella del Dhuhr di quel giorno, con il suo nome e la data prevista in origine.',
	jumuaReplacesDhuhr: 'Sostituisce il Dhuhr ogni venerdì.',
	jumuaAt: (times) => `Preghiera del venerdì: ${times}`
};

// L'anglais britannique (étape 18) : « programme », « cancelled », « fortnight », et les guillemets
// simples des Britanniques dans les messages. Les noms de menus des téléphones et d'Outlook sont ceux
// de leurs versions anglaises.
const en: Dictionnaire = {
	weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
	shortWeekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
	months: [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	],
	views: { week: 'Week', courses: 'All courses', month: 'Month', prayers: 'Prayer times' },
	audiences: {
		kids: 'Children',
		youth: 'Young people',
		women: 'Women',
		adults: 'Adults',
		open: 'Open to all'
	},
	rhythms: {
		weekly: 'Every week',
		fortnightly: 'Every fortnight',
		monthly: 'Every month',
		dates: 'On specific dates'
	},
	today: 'today',
	period: (from, to) => `From ${from} to ${to}`,
	cancelled: 'Cancelled',
	exceptionalDate: 'Rescheduled',
	movedTo: (date) => `Moved to ${date}`,
	originallyOn: (date) => `Originally on ${date}`,
	movedToTime: (time) => `Moved to ${time}`,
	newTime: 'New time',
	originallyAt: (time) => `Originally at ${time}`,
	after: (prayer) => `After ${prayer}`,
	afterOffset: (offset, prayer) => `${offset} min after ${prayer}`,
	beforeOffset: (offset, prayer) => `${offset} min before ${prayer}`,
	emptyPauseNamed: (reason) => `No courses this week: ${reason}.`,
	emptyPause: 'No courses this week: the programme is on a break.',
	emptyNotPublished: 'The programme has not been published yet.',
	emptyWeek: 'No sessions this week.',
	emptyFilter: 'No sessions this week for this group.',
	emptyMonth: 'No sessions this month.',
	emptyDay: 'No sessions on this day.',
	noCourses: 'No courses published yet.',
	allAudiences: 'All',
	place: 'Venue',
	teacher: 'Teacher',
	taughtIn: 'Taught in',
	jumua: 'Friday prayer',
	sermonIn: (languages) => `sermon in ${languages}`,
	fromTo: (from, to) => `From ${from} to ${to}`,
	datesLabel: 'Dates',
	nextSessions: 'Upcoming sessions',
	noNextSessions: 'No upcoming dates.',
	nextSessionsLine: (dates) => `Upcoming sessions: ${dates.join(', ')}`,
	backToProgramme: 'Back to the programme',
	coursesCrumb: 'Courses',
	coursePage: 'Course page',
	subscribe: 'Subscribe to the calendar',
	subscribeTitle: 'Subscribe to the calendar',
	subscribeIntro: (name) =>
		`The programme of ${name} is added to your calendar and updates itself. There is nothing to set up again when a course changes.`,
	subscribeButton: 'Add to my calendar',
	subscribeAddress: 'Or copy this address into your calendar app:',
	subscribeWholeTitle: 'The whole programme',
	subscribeOneCourseTitle: 'Just one course',
	subscribeOneCourseText:
		'You can also add just one course. Tap its name: it is added on its own and updates like the rest. Its https address is on the course page.',
	subscribeOneCourseGoogle:
		'You can also add just one course. Tap its name: Google Calendar opens for that course alone, as with the button above. If Google Calendar offers nothing on your phone, tap Course page, just below its name: that page gives the course’s address and the steps to follow on a computer.',
	subscribeOneCourseChoice:
		'You can also add just one course. Tap its name: its page offers the same options, for that course alone.',
	subscribeWhole: 'Subscribe to the whole programme',
	addCourseToCalendar: 'Add this course to my calendar',
	courseFeedAddress: 'Or copy this address, which covers only this course:',
	androidAddress: 'The address to paste:',
	androidCourseAddress: 'The address to paste, which covers only this course:',
	addToGoogle: 'Add to Google Calendar',
	appleHelp:
		'Tap the button, or click it on a Mac: the Calendar app offers to subscribe. Accept, and the calendar updates itself, about once an hour.',
	googleHelp:
		'Tap the button: it opens Google Calendar and asks it to add this calendar. If Google Calendar offers to do so, confirm.',
	googleDelay: 'Google can take up to 24 hours to refresh a subscription.',
	googleComputer:
		'If Google Calendar offers nothing on your phone, use a computer: according to Google, a calendar can only be added by its address in a computer’s web browser. Open Google Calendar there. On the left, next to Other calendars, click the + sign (Add other calendars), then From URL. Paste the address below and click Add calendar. The calendar will then appear on your phone too.',
	chooseApp: 'Choose your calendar app:',
	choiceGoogle: 'Google Calendar',
	choiceGoogleHelp: 'It offers to add the calendar to your Google account.',
	choiceOutlook: 'Outlook',
	choiceOutlookHelp:
		'Outlook on the web opens with the address already filled in: choose Import. With a work or school account, copy the address instead.',
	outlookDelay: 'Outlook can take more than 24 hours to refresh a subscription.',
	choiceOther: 'Another app',
	choiceOtherHelp:
		'Apple Calendar, Thunderbird or any app that can subscribe to a calendar: it opens and offers the subscription.',
	choiceCopy: 'Copy the address',
	choiceCopyHelp:
		'Select it, copy it, then paste it into your app, where it offers to add a calendar by its address.',
	otherDevice: 'Another device? See all the options',
	manualTitle: 'Adding the address by hand',
	manualIntro: 'If the button does nothing, copy the address and follow the steps for your app.',
	manualIntroChoice:
		'If none of these links works for you, copy the address and follow the steps for your app.',
	onIphone: 'On iPhone and iPad',
	onAndroid: 'On Android',
	onOutlook: 'In Outlook',
	iphoneText:
		'Open Settings, then Apps, Calendar, Calendar Accounts, Add Account, Other, Add Subscribed Calendar, and paste the address.',
	androidText:
		'According to Google, a calendar can only be added by its address in a computer’s web browser. On the computer, open Google Calendar. On the left, next to Other calendars, click the + sign (Add other calendars), then From URL. Paste the address and click Add calendar. It will then appear on your phone too.',
	outlookText:
		'Open Outlook on the web, go to Calendar, Add calendar, Subscribe from web, paste the address, give it a name, then import.',
	offeredBy: 'Provided free of charge by jadwal, a service from Voltia',
	terms: 'Terms of use',
	languagesLabel: 'Languages',
	viewsLabel: 'View',
	audiencesLabel: 'Filter by group',
	newTab: 'opens in a new tab',
	notFound: 'Page not found',
	notFoundHint: 'Please check the address.',
	weekTitle: 'This week’s courses',
	coursesTitle: 'All courses',
	sessionCount: (count) => (count === 1 ? '1 session' : `${count} sessions`),
	previousMonth: 'Previous month',
	nextMonth: 'Next month',
	// L'onglet des prières (étape 18, retour C4).
	prayersTitle: 'Prayer times',
	noPrayerTimes: 'The prayer times have not been published yet.',
	prayersToday: (date) => `Today, ${date}`,
	prayersHelp:
		'The adhan is the call to prayer. The iqama is the time the prayer begins in the prayer hall.',
	prayerColumn: 'Prayer',
	dayColumn: 'Day',
	adhan: 'Adhan',
	iqama: 'Iqama',
	noIqama: 'No iqama set',
	prayersWeek: 'The next seven days',
	weekBoxHelp: 'Each box shows the time of the adhan, with the iqama below it when one is set.',
	weekTableLabel: 'Table of the next seven days',
	fridayBoxHelp: 'On Fridays, the Dhuhr box gives the times of the Friday prayer.',
	movedJumuaHelp:
		'When a Friday prayer is moved to another day, it also appears in the Dhuhr box of that day, with its name and its original date.',
	jumuaReplacesDhuhr: 'It takes the place of Dhuhr every Friday.',
	jumuaAt: (times) => `Friday prayer: ${times}`
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
	views: { week: 'الأسبوع', courses: 'كل الدروس', month: 'الشهر', prayers: 'مواقيت الصلاة' },
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
	movedToTime: (time) => `نُقل إلى الساعة ${time}`,
	newTime: 'وقت جديد',
	originallyAt: (time) => `كان مقرّرًا في الساعة ${time}`,
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
	nextSessionsLine: (dates) => `الحصص القادمة: ${dates.join('، ')}`,
	backToProgramme: 'العودة إلى البرنامج',
	coursesCrumb: 'الدروس',
	coursePage: 'صفحة الدرس',
	subscribe: 'الاشتراك في التقويم',
	subscribeTitle: 'الاشتراك في التقويم',
	// La phrase relue par le chef de projet, sans « مرة كل ساعة تقريبًا » depuis l'étape 18 : le délai
	// dépend de l'application, et il est dit sous chaque bouton (retour E2).
	subscribeIntro: (name) =>
		`يُضاف برنامج ${name} إلى تقويمك ويُحدَّث تلقائيًا. لا حاجة لإعادة أي إعداد عند تغيّر درس.`,
	subscribeButton: 'أضف إلى تقويمي',
	subscribeAddress: 'أو انسخ هذا العنوان والصقه في تطبيق التقويم:',
	subscribeWholeTitle: 'البرنامج كاملًا',
	subscribeOneCourseTitle: 'درس واحد فقط',
	subscribeOneCourseText:
		'يمكنك أيضًا إضافة درس واحد فقط. اضغط على اسمه: يُضاف وحده ويُحدَّث مثل الباقي. وعنوانه بصيغة https موجود في صفحة الدرس.',
	subscribeOneCourseGoogle:
		'يمكنك أيضًا إضافة درس واحد فقط. اضغط على اسمه: يُفتح تقويم Google لهذا الدرس وحده، كما مع الزر أعلاه. إن لم يقترح تقويم Google شيئًا على هاتفك، فاضغط على صفحة الدرس تحت اسمه مباشرةً: فيها عنوان الدرس والخطوات التي تتبعها على الحاسوب.',
	subscribeOneCourseChoice:
		'يمكنك أيضًا إضافة درس واحد فقط. اضغط على اسمه: تعرض صفحته الخيارات نفسها لهذا الدرس وحده.',
	subscribeWhole: 'الاشتراك في البرنامج كاملًا',
	addCourseToCalendar: 'أضف هذا الدرس إلى تقويمي',
	courseFeedAddress: 'أو انسخ هذا العنوان، وهو خاص بهذا الدرس وحده:',
	androidAddress: 'العنوان المراد لصقه:',
	androidCourseAddress: 'العنوان المراد لصقه، وهو خاص بهذا الدرس وحده:',
	addToGoogle: 'أضف إلى تقويم Google',
	appleHelp:
		'اضغط على الزر، أو انقر عليه على الحاسوب: يقترح تطبيق التقويم الاشتراك. وافق، وسيُحدَّث التقويم تلقائيًا، مرة كل ساعة تقريبًا.',
	googleHelp:
		'اضغط على الزر: يُفتح تقويم Google مع طلب إضافة هذا التقويم. إن اقترح عليك ذلك، فأكّد.',
	googleDelay: 'قد يستغرق Google حتى 24 ساعة لتحديث الاشتراك.',
	googleComputer:
		'إن لم يقترح تقويم Google شيئًا على هاتفك، فاستعن بحاسوب: حسب Google، لا يمكن إضافة تقويم عن طريق عنوانه إلا من متصفح على الحاسوب. افتح فيه تقويم Google. على يمين الصفحة، بجانب التقاويم الأخرى، انقر على علامة + (إضافة تقاويم أخرى)، ثم اختر من عنوان URL. الصق العنوان أدناه، ثم انقر على إضافة تقويم. سيظهر التقويم بعدها على هاتفك أيضًا.',
	chooseApp: 'اختر تطبيق التقويم الذي تستخدمه:',
	choiceGoogle: 'تقويم Google',
	choiceGoogleHelp: 'يقترح تقويم Google إضافة التقويم إلى حسابك في Google.',
	choiceOutlook: 'Outlook',
	choiceOutlookHelp:
		'يُفتح Outlook على الويب والعنوان مُدخل مسبقًا: اختر استيراد. إن كان حسابك حساب عمل أو مدرسة، فانسخ العنوان بدلًا من ذلك.',
	outlookDelay: 'قد يستغرق Outlook أكثر من 24 ساعة لتحديث الاشتراك.',
	choiceOther: 'تطبيق آخر',
	choiceOtherHelp:
		'تقويم Apple أو Thunderbird أو أي تطبيق يمكنه الاشتراك في تقويم: يُفتح ويقترح الاشتراك.',
	choiceCopy: 'نسخ العنوان',
	choiceCopyHelp: 'حدّده وانسخه، ثم الصق العنوان في تطبيقك، في المكان الذي يقترح فيه إضافة تقويم.',
	otherDevice: 'جهاز آخر؟ اعرض كل الخيارات',
	manualTitle: 'إضافة العنوان يدويًا',
	manualIntro: 'إن لم يحدث شيء عند الضغط على الزر، انسخ العنوان واتبع خطوات تطبيقك.',
	manualIntroChoice: 'إن لم ينجح معك أي من هذه الروابط، انسخ العنوان واتبع خطوات تطبيقك.',
	// Décision du chef de projet, à l'étape 17 : ce titre reste tel quel, avec le « و » détaché
	// devant « iPad ». Une relecture ne doit pas le « corriger ».
	onIphone: 'على iPhone و iPad',
	onAndroid: 'على Android',
	onOutlook: 'على Outlook',
	iphoneText:
		'افتح الإعدادات، ثم التطبيقات، التقويم، الحسابات، إضافة حساب، أخرى، إضافة اشتراك تقويم، والصق العنوان.',
	androidText:
		'حسب Google، لا يمكن إضافة تقويم عن طريق عنوانه إلا من متصفح على الحاسوب. افتح تقويم Google على الحاسوب. على يمين الصفحة، بجانب التقاويم الأخرى، انقر على علامة + (إضافة تقاويم أخرى)، ثم اختر من عنوان URL. الصق العنوان، ثم انقر على إضافة تقويم. سيظهر بعدها على هاتفك أيضًا.',
	outlookText:
		'افتح Outlook على الويب، اذهب إلى التقويم، إضافة تقويم، الاشتراك من الويب، الصق العنوان، سمِّه، ثم استورد.',
	offeredBy: 'مقدَّم مجانًا من jadwal، خدمة من Voltia',
	terms: 'شروط الاستخدام',
	languagesLabel: 'اللغات',
	viewsLabel: 'طريقة العرض',
	audiencesLabel: 'تصفية حسب الفئة',
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
	nextMonth: 'الشهر التالي',
	// L'onglet des prières (étape 18, retour C4).
	prayersTitle: 'مواقيت الصلاة',
	noPrayerTimes: 'لم تُنشر مواقيت الصلاة بعد.',
	prayersToday: (date) => `اليوم، ${date}`,
	prayersHelp: 'الأذان هو النداء إلى الصلاة، والإقامة هي موعد إقامة الصلاة في المصلى.',
	prayerColumn: 'الصلاة',
	// « التاريخ » (la date), et non « اليوم » : c'est le mot du titre « اليوم، … » (aujourd'hui), et en
	// tête des sept jours il se lisait « aujourd'hui » (relecture du lot 3).
	dayColumn: 'التاريخ',
	adhan: 'الأذان',
	iqama: 'الإقامة',
	noIqama: 'لا إقامة محددة',
	prayersWeek: 'الأيام السبعة القادمة',
	weekBoxHelp: 'في كل خانة وقت الأذان، وتحته وقت الإقامة إن كان محددًا.',
	weekTableLabel: 'جدول الأيام السبعة القادمة',
	fridayBoxHelp: 'يوم الجمعة، تعرض خانة الظهر مواقيت صلاة الجمعة.',
	movedJumuaHelp:
		'إذا نُقلت صلاة الجمعة إلى يوم آخر، تظهر أيضًا في خانة الظهر لذلك اليوم، باسمها وتاريخها الأصلي.',
	jumuaReplacesDhuhr: 'تحلّ محلّ صلاة الظهر كل يوم جمعة.',
	jumuaAt: (times) => `صلاة الجمعة: ${times}`
};

const DICTIONNAIRES: Record<Langue, Dictionnaire> = { fr, de, it, en, ar };

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

/**
 * « 26.09.2026 » : une date telle qu'une personne la lit, dans les cinq langues (étape 18). Le jour
 * et le mois sur deux chiffres, l'année sur quatre, séparés par des points, en chiffres latins.
 *
 * L'arabe l'écrit de la même façon, et elle s'y lit dans le bon ordre : pour l'algorithme
 * bidirectionnel d'Unicode, un point entre deux nombres est un séparateur de nombre, et
 * `26.09.2026` reste un seul bloc de gauche à droite dans une phrase de droite à gauche.
 *
 * Une chaîne illisible est rendue telle quelle : plutôt que d'inventer une date, une valeur
 * inattendue doit se voir.
 */
export function numericDate(date: IsoDate): string {
	const civil = parseIsoDate(date);
	if (!civil) return date;
	const deux = (nombre: number) => String(nombre).padStart(2, '0');
	return `${deux(civil.day)}.${deux(civil.month)}.${String(civil.year).padStart(4, '0')}`;
}

/**
 * « samedi 26.09.2026 », « Samstag, 26.09.2026 », « Saturday 26.09.2026 » : le nom du jour, puis la
 * date. L'allemand sépare les deux par une virgule, comme il l'écrit ; les autres langues, par une
 * espace. Jusqu'à l'étape 18, la date s'écrivait en toutes lettres et sans l'année, chaque langue à
 * sa façon.
 */
export function longDate(langue: Langue, date: IsoDate): string {
	if (!parseIsoDate(date)) return date;
	const jour = DICTIONNAIRES[langue].weekdays[weekdayFromDays(isoDateToDays(date)) - 1] ?? '';
	return `${jour}${langue === 'de' ? ', ' : ' '}${numericDate(date)}`;
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

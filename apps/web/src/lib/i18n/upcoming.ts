// Les textes de l'écran « À venir » (`/`), l'accueil de l'espace : les séances des sept prochains
// jours, ce qui demande une décision, les options d'une séance, les chiffres d'audience et les
// messages prêts à coller (étape 18, retours A1, A2, B1 et D2).
//
// Une séance se dit « Termin » en allemand, « lezione » en italien, « session » en anglais et « حصة »
// en arabe, comme dans les messages prêts à coller (`../messages.ts`) : l'écran et le message qu'il
// prépare parlent de la même chose avec le même mot. Le titre de l'écran est celui de la navigation
// (`common.ts`), pour qu'un lien et la page qu'il ouvre portent le même nom.

import { plural, type PluralForms, type Translations } from './space.js';

/** Les formes arabes selon le nombre (voir `plural`). Le code de la langue reste hors des textes. */
function arabic(count: number, forms: PluralForms): string {
	return plural('ar', count, forms);
}

/** Ce qu'une action vient de faire, par son nom : l'action le rend, l'écran l'écrit. */
export type UpcomingDone = 'cancelled' | 'moved' | 'restored';

/**
 * Les erreurs des actions, par leur nom : l'action rend le nom, jamais la phrase. `unchanged` : un
 * déplacement vers la date et l'heure où la séance est déjà prévue, qui ne déplacerait rien.
 * `changed` : la séance a été annulée ou déplacée depuis que la page a été ouverte, par Retour, dans
 * un autre onglet ou par une autre personne ; la carte encore affichée ne défait pas ce changement.
 * `timeChanged` : l'heure du cours a changé dans sa fiche depuis ; la séance garde sa carte, qui se
 * rouvre sur la phrase, sous sa nouvelle heure. `alreadyCancelled` : la séance a été annulée depuis,
 * et la carte l'annule encore ; rien ne s'écrit, mais le message prêt à coller est donné quand même
 * (étape 19, D4). `alreadyRestored` : la séance a été rétablie depuis, et la carte la rétablit
 * encore ; il n'y a plus rien à rétablir, et rien ne s'écrit, pas même le journal (étape 19,
 * relecture de D2). `pastSession` : l'annulation d'une séance dont la date est passée, qu'aucune
 * carte ne propose.
 */
export type UpcomingError =
	| 'unreadableDate'
	| 'unreadableNewDate'
	| 'unreadableTime'
	| 'pastDate'
	| 'pastSession'
	| 'unchanged'
	| 'changed'
	| 'timeChanged'
	| 'alreadyCancelled'
	| 'alreadyRestored'
	| 'sessionGone';

/**
 * Les refus d'une carte périmée, qui nomment la séance par son titre et sa date (étape 19, D4) :
 * leur phrase reçoit le titre, dans la langue de l'écran quand le cours y est traduit, et la date
 * déjà écrite.
 */
export type NamedUpcomingError = 'changed' | 'timeChanged' | 'alreadyCancelled' | 'alreadyRestored';

/** Une phrase qui nomme une séance. */
type Named = (title: string, date: string) => string;

interface UpcomingTexts {
	/** Ce que montre l'écran, et où se trouvent les options d'une séance. */
	readonly intro: string;
	/** « Du samedi 26.09.2026 au vendredi 02.10.2026 ». */
	readonly period: (from: string, to: string) => string;
	/** Des séances de la semaine sans heure, parce que leur heure dépend d'une prière. */
	readonly untimed: (count: number) => string;
	readonly untimedNotCovered: string;
	readonly untimedNotSet: string;
	readonly untimedLink: string;
	/** Pour un éditeur, qui n'ouvre pas l'écran des prières : qui peut le faire à sa place. */
	readonly untimedAskManager: string;
	/**
	 * La fin du calendrier de prières importé : `days` jours à partir d'aujourd'hui. Négatif, l'import
	 * s'est déjà arrêté ; zéro, il s'arrête aujourd'hui ; un, demain.
	 */
	readonly importEnds: (date: string, days: number) => string;
	readonly importThenComputed: string;
	readonly importThenUntimed: string;
	readonly importLink: string;
	readonly importAskManager: string;
	/** Le programme intégré à un site, que personne n'y voit plus depuis sept jours. */
	readonly widgetSilent: string;
	readonly widgetLink: string;
	readonly empty: string;
	readonly emptyLink: string;
	/**
	 * Les marques d'une séance, à côté de son titre. `newTime` : une séance déplacée le même jour, à
	 * une autre heure ; sa date n'a rien d'exceptionnel. `draft` : un cours en brouillon, que la page
	 * publique et le programme de la semaine ne montrent pas (étape 19, D4).
	 */
	readonly marks: {
		readonly cancelled: string;
		readonly movedAway: string;
		readonly movedHere: string;
		readonly newTime: string;
		readonly draft: string;
	};
	/** Sous une séance déplacée : sa nouvelle date et sa nouvelle heure. */
	readonly movedTo: (date: string, time: string) => string;
	/** Sous une séance arrivée d'une autre date : la date où elle était prévue. */
	readonly originallyOn: (date: string) => string;
	/**
	 * Sous une séance déplacée le même jour : l'heure où elle était prévue, telle que l'écran l'écrit
	 * (« 19:00 – 20:30 », ou « 15 min après Maghrib » quand l'heure de la prière manque).
	 */
	readonly originallyAt: (time: string) => string;
	/** Le bouton qui ouvre les options d'une séance, et elles seules (retour A1). */
	readonly options: string;
	readonly cancelHelp: string;
	readonly cancelButton: string;
	readonly moveLegend: string;
	readonly newDate: string;
	/** Les dates acceptées, avec celle d'aujourd'hui : plus tôt comme plus tard (retour A2). */
	readonly newDateHelp: (today: string) => string;
	readonly newTime: string;
	readonly newTimeHelp: string;
	readonly moveButton: string;
	readonly restoreButton: string;
	readonly restoreHelp: string;
	/** Le titre qui dit ce que la dernière action a fait. */
	readonly done: { readonly [D in UpcomingDone]: string };
	/** Sous ce titre, ce qu'est le message et dans quelles langues il est écrit (retour D1). */
	readonly messageHelp: string;
	/**
	 * Le nom de chaque zone de texte du message, pour les lecteurs d'écran (`aria-label`). Il est
	 * suivi de `inLanguage` : « Message à copier en allemand ».
	 */
	readonly messageLabel: string;
	readonly weekTitle: string;
	readonly weekHelp: string;
	/** Le nom de chaque zone de texte du programme de la semaine, suivi lui aussi de `inLanguage`. */
	readonly weekLabel: string;
	/**
	 * La langue d'une zone de texte, dans la langue de l'écran : « en allemand ». Elle suit son nom, et
	 * cinq zones ouvertes ne s'annoncent plus toutes pareilles.
	 */
	readonly inLanguage: (language: string) => string;
	readonly audience: {
		readonly title: string;
		readonly where: string;
		readonly last7: string;
		readonly last30: string;
		readonly page: string;
		readonly embed: string;
		readonly feed: string;
		readonly note: string;
	};
	readonly errors: { readonly [E in Exclude<UpcomingError, NamedUpcomingError>]: string } & {
		readonly [E in NamedUpcomingError]: Named;
	};
}

export const upcomingTexts: Translations<UpcomingTexts> = {
	fr: {
		intro:
			'Les séances des sept prochains jours, jour par jour. Si une séance n’a pas lieu ou change de date, ouvrez « Annuler ou déplacer » sous son titre.',
		period: (from, to) => `Du ${from} au ${to}`,
		untimed: (count) =>
			count === 1
				? 'Une séance de la semaine s’affiche sans heure, parce que son heure dépend d’une prière.'
				: `${count} séances de la semaine s’affichent sans heure, parce que leur heure dépend d’une prière.`,
		untimedNotCovered: 'Les heures de prière enregistrées ne couvrent pas encore toute la semaine.',
		untimedNotSet: 'Les heures de prière ne sont pas encore réglées.',
		untimedLink: 'Régler les heures de prière',
		untimedAskManager: 'La personne responsable de votre organisation peut les régler.',
		importEnds: (date, days) =>
			days < 0
				? `Votre calendrier de prières importé s’est arrêté le ${date}.`
				: days === 0
					? `Aujourd’hui, ${date}, est le dernier jour de votre calendrier de prières importé.`
					: days === 1
						? `Demain, ${date}, est le dernier jour de votre calendrier de prières importé.`
						: `Votre calendrier de prières importé s’arrête le ${date}, dans ${days} jours.`,
		importThenComputed:
			'Ensuite, les heures seront calculées avec les réglages de votre organisation.',
		importThenUntimed:
			'Après cette date, les séances dont l’heure dépend d’une prière s’afficheront sans heure.',
		importLink: 'Importer la suite du calendrier',
		importAskManager:
			'La personne responsable de votre organisation peut ajouter la suite du calendrier.',
		widgetSilent:
			'Votre programme ne semble plus s’afficher sur votre site : personne ne l’y a vu depuis sept jours, alors que c’était le cas avant. Vérifiez la page de votre site sur laquelle vous avez collé le code. Si vous l’avez retiré exprès, il n’y a rien à faire.',
		widgetLink: 'Revoir le code à coller',
		empty: 'Aucune séance dans les sept prochains jours.',
		emptyLink: 'Créer un cours',
		marks: {
			cancelled: 'annulée',
			movedAway: 'déplacée',
			movedHere: 'date exceptionnelle',
			newTime: 'nouvelle heure',
			draft: 'brouillon'
		},
		movedTo: (date, time) => `Déplacée au ${date} à ${time}`,
		originallyOn: (date) => `Prévue à l’origine le ${date}`,
		originallyAt: (time) => `Prévue à l’origine : ${time}`,
		options: 'Annuler ou déplacer',
		cancelHelp:
			'Seule cette séance est annulée : le cours continue les autres semaines. Vous pourrez la rétablir ensuite.',
		cancelButton: 'Annuler cette séance',
		moveLegend: 'Déplacer cette séance',
		newDate: 'Nouvelle date',
		newDateHelp: (today) =>
			`À partir d’aujourd’hui, ${today}, plus tôt ou plus tard que la date prévue.`,
		newTime: 'Heure de début',
		newTimeHelp: 'Exemple : 19:30',
		moveButton: 'Déplacer la séance',
		restoreButton: 'Rétablir la séance',
		restoreHelp: 'Cela défait le changement : la séance retrouve sa date et son heure habituelles.',
		done: {
			cancelled: 'La séance est annulée.',
			moved: 'La séance est déplacée.',
			restored: 'La séance est rétablie.'
		},
		messageHelp:
			'Un message à envoyer à votre communauté, par exemple dans WhatsApp. Il est écrit dans chaque langue de votre page publique, la langue du cours d’abord : ouvrez une langue, puis copiez son texte.',
		messageLabel: 'Message à copier',
		weekTitle: 'Le programme de la semaine',
		weekHelp:
			'Le programme des sept prochains jours, prêt à copier dans WhatsApp. Il est écrit dans chaque langue de votre page publique, la langue par défaut d’abord : ouvrez une langue, puis copiez son texte.',
		weekLabel: 'Programme de la semaine',
		inLanguage: (language) => `en ${language}`,
		audience: {
			title: 'Combien votre programme a été vu',
			where: 'Où',
			last7: '7 derniers jours',
			last30: '30 derniers jours',
			page: 'Page publique',
			embed: 'Programme intégré à votre site',
			feed: 'Agendas abonnés',
			note: 'Chaque jour, seul un nombre par type est gardé : aucune adresse, aucune provenance, aucun visiteur. Les robots connus ne sont pas comptés. Ces nombres sont un minimum : une page gardée en mémoire par un navigateur ou par un opérateur ne nous parvient pas. Pour les agendas, chaque mise à jour compte, pas chaque personne : un agenda se met à jour tout seul, plusieurs fois par jour.'
		},
		errors: {
			unreadableDate:
				'La date de cette séance n’a pas pu être lue. Rechargez la page, puis recommencez.',
			unreadableNewDate:
				'Cette date n’a pas pu être lue. Choisissez-la dans le calendrier du champ « Nouvelle date ».',
			unreadableTime:
				'Cette heure n’a pas pu être lue. Écrivez les heures et les minutes, par exemple 19:30.',
			pastDate: 'Cette date est déjà passée. Choisissez une date à partir d’aujourd’hui.',
			pastSession:
				'Cette séance est déjà passée : vous ne pouvez annuler que les séances d’aujourd’hui et des jours suivants.',
			unchanged:
				'La séance est déjà prévue à cette date et à cette heure. Choisissez une autre date ou une autre heure.',
			changed: (title, date) =>
				`La séance « ${title} » du ${date} a changé depuis l’ouverture de la page : elle a déjà été annulée ou déplacée. Rien n’a été enregistré. Le programme ci-dessous est à jour.`,
			timeChanged: (title, date) =>
				`L’heure de la séance « ${title} » du ${date} a changé depuis l’ouverture de la page. Rien n’a été enregistré. Sa nouvelle heure est écrite sous son titre : vérifiez la date et l’heure choisies, puis recommencez.`,
			alreadyCancelled: (title, date) =>
				`La séance « ${title} » du ${date} a déjà été annulée depuis l’ouverture de la page. Rien n’a été enregistré. Si le message n’a pas encore été envoyé, il est prêt ci-dessous.`,
			alreadyRestored: (title, date) =>
				`La séance « ${title} » du ${date} a déjà été rétablie depuis l’ouverture de la page. Rien n’a été enregistré. Le programme ci-dessous est à jour.`,
			sessionGone: 'Cette séance n’existe plus. La liste ci-dessous est à jour.'
		}
	},
	de: {
		intro:
			'Die Termine der nächsten sieben Tage, Tag für Tag. Wenn ein Termin ausfällt oder sein Datum ändert, öffnen Sie «Absagen oder verschieben» unter seinem Titel.',
		period: (from, to) => `Vom ${from}, bis ${to}`,
		untimed: (count) =>
			count === 1
				? 'Ein Termin dieser Woche wird ohne Uhrzeit angezeigt, weil seine Zeit von einem Gebet abhängt.'
				: `${count} Termine dieser Woche werden ohne Uhrzeit angezeigt, weil ihre Zeit von einem Gebet abhängt.`,
		untimedNotCovered: 'Die gespeicherten Gebetszeiten decken die Woche noch nicht ganz ab.',
		untimedNotSet: 'Die Gebetszeiten sind noch nicht eingerichtet.',
		untimedLink: 'Gebetszeiten einrichten',
		untimedAskManager: 'Die verantwortliche Person Ihrer Organisation kann sie einrichten.',
		importEnds: (date, days) =>
			days < 0
				? `Ihr importierter Gebetskalender endete am ${date}.`
				: days === 0
					? `Heute, ${date}, ist der letzte Tag Ihres importierten Gebetskalenders.`
					: days === 1
						? `Morgen, ${date}, ist der letzte Tag Ihres importierten Gebetskalenders.`
						: `Ihr importierter Gebetskalender endet am ${date}, in ${days} Tagen.`,
		importThenComputed:
			'Danach werden die Zeiten mit den Einstellungen Ihrer Organisation berechnet.',
		importThenUntimed:
			'Nach diesem Datum werden Termine, deren Zeit von einem Gebet abhängt, ohne Uhrzeit angezeigt.',
		importLink: 'Fortsetzung des Kalenders importieren',
		importAskManager:
			'Die verantwortliche Person Ihrer Organisation kann die Fortsetzung importieren.',
		widgetSilent:
			'Ihr Programm scheint auf Ihrer Website nicht mehr angezeigt zu werden: Seit sieben Tagen hat es dort niemand gesehen, vorher schon. Prüfen Sie die Seite Ihrer Website, auf der Sie den Code eingefügt haben. Wenn Sie ihn absichtlich entfernt haben, müssen Sie nichts tun.',
		widgetLink: 'Code zum Einfügen noch einmal ansehen',
		empty: 'Keine Termine in den nächsten sieben Tagen.',
		emptyLink: 'Kurs erstellen',
		marks: {
			cancelled: 'abgesagt',
			movedAway: 'verschoben',
			movedHere: 'Ausnahmetermin',
			newTime: 'neue Uhrzeit',
			draft: 'Entwurf'
		},
		movedTo: (date, time) => `Verschoben auf ${date}, um ${time}`,
		originallyOn: (date) => `Ursprünglich geplant am ${date}`,
		originallyAt: (time) => `Ursprünglich geplant: ${time}`,
		options: 'Absagen oder verschieben',
		cancelHelp:
			'Nur dieser Termin wird abgesagt: Der Kurs geht in den anderen Wochen weiter. Sie können den Termin danach wiederherstellen.',
		cancelButton: 'Diesen Termin absagen',
		moveLegend: 'Diesen Termin verschieben',
		newDate: 'Neues Datum',
		newDateHelp: (today) => `Ab heute, ${today}, früher oder später als das geplante Datum.`,
		newTime: 'Anfangszeit',
		newTimeHelp: 'Beispiel: 19:30',
		moveButton: 'Termin verschieben',
		restoreButton: 'Termin wiederherstellen',
		restoreHelp:
			'Damit machen Sie die Änderung rückgängig: Der Termin findet wieder an seinem üblichen Datum und zu seiner üblichen Zeit statt.',
		done: {
			cancelled: 'Der Termin ist abgesagt.',
			moved: 'Sie haben den Termin verschoben.',
			restored: 'Der Termin ist wiederhergestellt.'
		},
		messageHelp:
			'Eine Nachricht für Ihre Gemeinschaft, zum Beispiel für WhatsApp. Sie steht in jeder Sprache Ihrer öffentlichen Seite bereit, die Sprache des Kurses zuerst: Öffnen Sie eine Sprache und kopieren Sie deren Text.',
		messageLabel: 'Nachricht zum Kopieren',
		weekTitle: 'Das Programm der Woche',
		weekHelp:
			'Das Programm der nächsten sieben Tage, bereit zum Kopieren in WhatsApp. Es steht in jeder Sprache Ihrer öffentlichen Seite bereit, die Standardsprache zuerst: Öffnen Sie eine Sprache und kopieren Sie deren Text.',
		weekLabel: 'Programm der Woche',
		inLanguage: (language) => `auf ${language}`,
		audience: {
			title: 'Wie oft wurde Ihr Programm angesehen?',
			where: 'Wo',
			last7: 'Letzte 7 Tage',
			last30: 'Letzte 30 Tage',
			page: 'Öffentliche Seite',
			embed: 'Eingebettetes Programm auf Ihrer Website',
			feed: 'Abonnierte Kalender',
			note: 'Pro Tag wird nur eine Zahl pro Art gespeichert: keine Adresse, keine Herkunft, kein Besucher. Bekannte Bots werden nicht gezählt. Diese Zahlen sind ein Minimum: Eine Seite, die ein Browser oder ein Anbieter zwischengespeichert hat, erreicht uns nicht. Bei den Kalendern zählt jede Aktualisierung, nicht jede Person: Ein Kalender aktualisiert sich von selbst, mehrmals am Tag.'
		},
		errors: {
			unreadableDate:
				'Das Datum dieses Termins konnte nicht gelesen werden. Laden Sie die Seite neu und versuchen Sie es noch einmal.',
			unreadableNewDate:
				'Dieses Datum konnte nicht gelesen werden. Wählen Sie es im Kalender des Feldes «Neues Datum».',
			unreadableTime:
				'Diese Uhrzeit konnte nicht gelesen werden. Geben Sie Stunden und Minuten ein, zum Beispiel 19:30.',
			pastDate: 'Dieses Datum ist schon vorbei. Wählen Sie heute oder einen späteren Tag.',
			pastSession:
				'Dieser Termin ist schon vorbei: Sie können nur Termine von heute oder von einem späteren Tag absagen.',
			unchanged:
				'Der Termin ist schon an diesem Datum und zu dieser Uhrzeit geplant. Wählen Sie ein anderes Datum oder eine andere Uhrzeit.',
			changed: (title, date) =>
				`Der Termin «${title}» vom ${date}, hat sich geändert, seit die Seite geöffnet wurde: Er wurde schon abgesagt oder verschoben. Es wurde nichts gespeichert. Das Programm unten ist aktuell.`,
			timeChanged: (title, date) =>
				`Die Uhrzeit des Termins «${title}» vom ${date}, hat sich geändert, seit die Seite geöffnet wurde. Es wurde nichts gespeichert. Die neue Uhrzeit steht unter seinem Titel: Prüfen Sie das gewählte Datum und die gewählte Uhrzeit und versuchen Sie es noch einmal.`,
			alreadyCancelled: (title, date) =>
				`Der Termin «${title}» vom ${date}, ist abgesagt worden, seit die Seite geöffnet wurde. Es wurde nichts gespeichert. Wenn die Nachricht noch nicht verschickt ist, steht sie unten bereit.`,
			alreadyRestored: (title, date) =>
				`Der Termin «${title}» vom ${date}, ist wiederhergestellt worden, seit die Seite geöffnet wurde. Es wurde nichts gespeichert. Das Programm unten ist aktuell.`,
			sessionGone: 'Diesen Termin gibt es nicht mehr. Die Liste unten ist aktuell.'
		}
	},
	it: {
		intro:
			'Le lezioni dei prossimi sette giorni, giorno per giorno. Se una lezione non si tiene o cambia data, apri «Annulla o sposta» sotto il suo titolo.',
		period: (from, to) => `Da ${from} a ${to}`,
		untimed: (count) =>
			count === 1
				? 'Una lezione della settimana appare senza orario, perché il suo orario dipende da una preghiera.'
				: `${count} lezioni della settimana appaiono senza orario, perché il loro orario dipende da una preghiera.`,
		untimedNotCovered: 'Gli orari di preghiera registrati non coprono ancora tutta la settimana.',
		untimedNotSet: 'Gli orari di preghiera non sono ancora impostati.',
		untimedLink: 'Imposta gli orari di preghiera',
		untimedAskManager: 'La persona responsabile della tua organizzazione può impostarli.',
		importEnds: (date, days) =>
			days < 0
				? `Il tuo calendario delle preghiere importato è finito ${date}.`
				: days === 0
					? `Oggi, ${date}, è l’ultimo giorno del tuo calendario delle preghiere importato.`
					: days === 1
						? `Domani, ${date}, è l’ultimo giorno del tuo calendario delle preghiere importato.`
						: `Il tuo calendario delle preghiere importato finisce ${date}, tra ${days} giorni.`,
		importThenComputed:
			'Dopo, gli orari saranno calcolati con le impostazioni della tua organizzazione.',
		importThenUntimed:
			'Dopo questa data, le lezioni il cui orario dipende da una preghiera appariranno senza orario.',
		importLink: 'Importa il seguito del calendario',
		importAskManager: 'La persona responsabile della tua organizzazione può importare il seguito.',
		widgetSilent:
			'Il tuo programma sembra non apparire più sul tuo sito: nessuno l’ha visto lì da sette giorni, mentre prima sì. Controlla la pagina del tuo sito dove hai incollato il codice. Se l’hai tolto apposta, non devi fare niente.',
		widgetLink: 'Rivedi il codice da incollare',
		empty: 'Nessuna lezione nei prossimi sette giorni.',
		emptyLink: 'Crea un corso',
		marks: {
			cancelled: 'annullata',
			movedAway: 'spostata',
			movedHere: 'data eccezionale',
			newTime: 'nuovo orario',
			draft: 'bozza'
		},
		movedTo: (date, time) => `Spostata a ${date} alle ${time}`,
		originallyOn: (date) => `Prevista inizialmente per ${date}`,
		originallyAt: (time) => `Prevista inizialmente: ${time}`,
		options: 'Annulla o sposta',
		cancelHelp:
			'Viene annullata solo questa lezione: il corso continua nelle altre settimane. Potrai ripristinarla dopo.',
		cancelButton: 'Annulla questa lezione',
		moveLegend: 'Sposta questa lezione',
		newDate: 'Nuova data',
		newDateHelp: (today) => `Da oggi, ${today}, prima o dopo la data prevista.`,
		newTime: 'Ora di inizio',
		newTimeHelp: 'Esempio: 19:30',
		moveButton: 'Sposta la lezione',
		restoreButton: 'Ripristina la lezione',
		restoreHelp:
			'Così annulli la modifica: la lezione torna alla sua data e al suo orario abituali.',
		done: {
			cancelled: 'La lezione è annullata.',
			moved: 'La lezione è spostata.',
			restored: 'La lezione è ripristinata.'
		},
		messageHelp:
			'Un messaggio da mandare alla tua comunità, per esempio su WhatsApp. È scritto in ogni lingua della tua pagina pubblica, prima la lingua del corso: apri una lingua, poi copia il suo testo.',
		messageLabel: 'Messaggio da copiare',
		weekTitle: 'Il programma della settimana',
		weekHelp:
			'Il programma dei prossimi sette giorni, pronto da copiare su WhatsApp. È scritto in ogni lingua della tua pagina pubblica, prima la lingua predefinita: apri una lingua, poi copia il suo testo.',
		weekLabel: 'Programma della settimana',
		inLanguage: (language) => `in ${language}`,
		audience: {
			title: 'Quante volte è stato visto il tuo programma',
			where: 'Dove',
			last7: 'Ultimi 7 giorni',
			last30: 'Ultimi 30 giorni',
			page: 'Pagina pubblica',
			embed: 'Programma integrato nel tuo sito',
			feed: 'Calendari abbonati',
			note: 'Ogni giorno si tiene solo un numero per tipo: nessun indirizzo, nessuna provenienza, nessun visitatore. I robot noti non vengono contati. Questi numeri sono un minimo: una pagina tenuta in memoria da un browser o da un operatore non ci arriva. Per i calendari conta ogni aggiornamento, non ogni persona: un calendario si aggiorna da solo, più volte al giorno.'
		},
		errors: {
			unreadableDate:
				'Non è stato possibile leggere la data di questa lezione. Ricarica la pagina e riprova.',
			unreadableNewDate:
				'Non è stato possibile leggere questa data. Sceglila nel calendario del campo «Nuova data».',
			unreadableTime:
				'Non è stato possibile leggere questo orario. Scrivi le ore e i minuti, per esempio 19:30.',
			pastDate: 'Questa data è già passata. Scegli oggi o un giorno successivo.',
			pastSession:
				'Questa lezione è già passata: puoi annullare solo le lezioni di oggi o dei giorni successivi.',
			unchanged:
				'La lezione è già prevista per questa data e questo orario. Scegli un’altra data o un altro orario.',
			changed: (title, date) =>
				`La lezione «${title}» di ${date} è cambiata da quando hai aperto la pagina: è già stata annullata o spostata. Non è stato salvato niente. Il programma qui sotto è aggiornato.`,
			timeChanged: (title, date) =>
				`L’orario della lezione «${title}» di ${date} è cambiato da quando hai aperto la pagina. Non è stato salvato niente. Il nuovo orario è indicato sotto il titolo: controlla la data e l’orario scelti, poi riprova.`,
			alreadyCancelled: (title, date) =>
				`La lezione «${title}» di ${date} è già stata annullata da quando hai aperto la pagina. Non è stato salvato niente. Se il messaggio non è ancora stato mandato, è pronto qui sotto.`,
			alreadyRestored: (title, date) =>
				`La lezione «${title}» di ${date} è già stata ripristinata da quando hai aperto la pagina. Non è stato salvato niente. Il programma qui sotto è aggiornato.`,
			sessionGone: 'Questa lezione non esiste più. L’elenco qui sotto è aggiornato.'
		}
	},
	en: {
		intro:
			'The sessions for the next seven days, day by day. If a session is not taking place or changes date, open ‘Cancel or move’ under its title.',
		period: (from, to) => `From ${from} to ${to}`,
		untimed: (count) =>
			count === 1
				? 'One session this week is shown without a time, because its time depends on a prayer.'
				: `${count} sessions this week are shown without a time, because their time depends on a prayer.`,
		untimedNotCovered: 'The prayer times you have saved do not cover the whole week yet.',
		untimedNotSet: 'The prayer times have not been set up yet.',
		untimedLink: 'Set up the prayer times',
		untimedAskManager: 'The person in charge of your organisation can set them up.',
		importEnds: (date, days) =>
			days < 0
				? `Your imported prayer calendar ended on ${date}.`
				: days === 0
					? `Today, ${date}, is the last day of your imported prayer calendar.`
					: days === 1
						? `Tomorrow, ${date}, is the last day of your imported prayer calendar.`
						: `Your imported prayer calendar ends on ${date}, in ${days} days.`,
		importThenComputed:
			'After that, the times will be calculated with your organisation’s settings.',
		importThenUntimed:
			'After this date, sessions whose time depends on a prayer will be shown without a time.',
		importLink: 'Import the rest of the calendar',
		importAskManager: 'The person in charge of your organisation can import the rest.',
		widgetSilent:
			'Your programme no longer seems to appear on your website: nobody has seen it there for seven days, although people did before. Check the page of your website where you pasted the code. If you removed it on purpose, there is nothing to do.',
		widgetLink: 'See the code to paste again',
		empty: 'No sessions in the next seven days.',
		emptyLink: 'Create a course',
		marks: {
			cancelled: 'cancelled',
			movedAway: 'moved',
			movedHere: 'rescheduled',
			newTime: 'new time',
			draft: 'draft'
		},
		movedTo: (date, time) => `Moved to ${date} at ${time}`,
		originallyOn: (date) => `Originally planned for ${date}`,
		originallyAt: (time) => `Originally planned: ${time}`,
		options: 'Cancel or move',
		cancelHelp:
			'Only this session is cancelled: the course continues in the other weeks. You can restore it afterwards.',
		cancelButton: 'Cancel this session',
		moveLegend: 'Move this session',
		newDate: 'New date',
		newDateHelp: (today) => `From today, ${today}, earlier or later than the planned date.`,
		newTime: 'Start time',
		newTimeHelp: 'Example: 19:30',
		moveButton: 'Move the session',
		restoreButton: 'Restore the session',
		restoreHelp: 'This undoes the change: the session goes back to its usual date and time.',
		done: {
			cancelled: 'The session is cancelled.',
			moved: 'The session has been moved.',
			restored: 'The session has been restored.'
		},
		messageHelp:
			'A message to send to your community, for example on WhatsApp. It is written in each language of your public page, the language of the course first: open a language, then copy its text.',
		messageLabel: 'Message to copy',
		weekTitle: 'This week’s programme',
		weekHelp:
			'The programme for the next seven days, ready to copy into WhatsApp. It is written in each language of your public page, the default language first: open a language, then copy its text.',
		weekLabel: 'Programme for the week',
		inLanguage: (language) => `in ${language}`,
		audience: {
			title: 'How often your programme was seen',
			where: 'Where',
			last7: 'Last 7 days',
			last30: 'Last 30 days',
			page: 'Public page',
			embed: 'Programme embedded in your website',
			feed: 'Subscribed calendars',
			note: 'Only one number per type is kept each day: no address, no origin, no visitor. Known bots are not counted. These numbers are a minimum: a page kept in memory by a browser or a provider does not reach us. For calendars, each update counts, not each person: a calendar updates by itself, several times a day.'
		},
		errors: {
			unreadableDate: 'The date of this session could not be read. Reload the page and try again.',
			unreadableNewDate:
				'This date could not be read. Choose it in the calendar of the ‘New date’ field.',
			unreadableTime:
				'This time could not be read. Enter the hours and minutes, for example 19:30.',
			pastDate: 'This date has already passed. Choose today or a later day.',
			pastSession:
				'This session has already passed: you can only cancel sessions from today onwards.',
			unchanged:
				'The session is already planned for this date and time. Choose a different date or time.',
			changed: (title, date) =>
				`The ‘${title}’ session on ${date} has changed since the page was opened: it has already been cancelled or moved. Nothing has been saved. The programme below shows the latest changes.`,
			timeChanged: (title, date) =>
				`The time of the ‘${title}’ session on ${date} has changed since the page was opened. Nothing has been saved. Its new time is shown under its title: check the date and time you chose, then try again.`,
			alreadyCancelled: (title, date) =>
				`Since the page was opened, the ‘${title}’ session on ${date} has already been cancelled. Nothing has been saved. If the message has not been sent yet, it is ready below.`,
			alreadyRestored: (title, date) =>
				`Since the page was opened, the ‘${title}’ session on ${date} has already been restored. Nothing has been saved. The programme below shows the latest changes.`,
			sessionGone:
				'This session no longer exists. The list below shows the sessions as they are now.'
		}
	},
	ar: {
		intro:
			'حصص الأيام السبعة القادمة، يومًا بيوم. إذا لم تُقَم حصة أو تغيّر تاريخها، فافتح «إلغاء أو نقل» تحت عنوانها.',
		period: (from, to) => `من ${from} إلى ${to}`,
		untimed: (count) =>
			arabic(count, {
				one: 'حصة واحدة هذا الأسبوع تظهر بلا وقت، لأن وقتها مرتبط بصلاة.',
				two: 'حصتان هذا الأسبوع تظهران بلا وقت، لأن وقتهما مرتبط بصلاة.',
				few: `${count} حصص هذا الأسبوع تظهر بلا وقت، لأن وقتها مرتبط بصلاة.`,
				many: `${count} حصة هذا الأسبوع تظهر بلا وقت، لأن وقتها مرتبط بصلاة.`,
				other: `${count} حصة هذا الأسبوع تظهر بلا وقت، لأن وقتها مرتبط بصلاة.`
			}),
		untimedNotCovered: 'لم تغطِّ مواقيت الصلاة المسجّلة الأسبوع كله بعد.',
		untimedNotSet: 'لم تُضبط مواقيت الصلاة بعد.',
		untimedLink: 'ضبط مواقيت الصلاة',
		untimedAskManager: 'يمكن للمسؤول عن مؤسستك ضبطها.',
		importEnds: (date, days) =>
			days < 0
				? `انتهى تقويم الصلاة المستورد يوم ${date}.`
				: days === 0
					? `اليوم، ${date}، آخر يوم في تقويم الصلاة المستورد.`
					: days === 1
						? `غدًا، ${date}، آخر يوم في تقويم الصلاة المستورد.`
						: `ينتهي تقويم الصلاة المستورد يوم ${date}، بعد ${arabic(days, {
								two: 'يومين',
								few: `${days} أيام`,
								many: `${days} يومًا`,
								other: `${days} يوم`
							})}.`,
		importThenComputed: 'بعد ذلك، تُحسب المواقيت بإعدادات مؤسستك.',
		importThenUntimed: 'بعد هذا التاريخ، ستظهر الحصص المرتبط وقتها بصلاة بلا وقت.',
		importLink: 'استيراد بقية التقويم',
		importAskManager: 'يمكن للمسؤول عن مؤسستك استيراد البقية.',
		widgetSilent:
			'يبدو أن برنامجك لم يعد يظهر على موقعك: لم يره أحد هناك منذ أسبوع، مع أنه كان يُرى من قبل. راجع الصفحة التي لصقت فيها الشيفرة في موقعك. إن كنت أزلته عن قصد، فلا شيء عليك فعله.',
		widgetLink: 'عرض الشيفرة المراد لصقها مرة أخرى',
		empty: 'لا حصص خلال الأيام السبعة القادمة.',
		emptyLink: 'إنشاء درس',
		marks: {
			cancelled: 'ملغاة',
			movedAway: 'منقولة',
			movedHere: 'موعد استثنائي',
			newTime: 'وقت جديد',
			draft: 'مسودة'
		},
		movedTo: (date, time) => `نُقلت إلى يوم ${date} في الساعة ${time}`,
		originallyOn: (date) => `كانت مقرّرة يوم ${date}`,
		originallyAt: (time) => `الوقت المقرّر أصلًا: ${time}`,
		options: 'إلغاء أو نقل',
		cancelHelp: 'تُلغى هذه الحصة وحدها: يستمر الدرس في الأسابيع الأخرى. يمكنك استعادتها بعد ذلك.',
		cancelButton: 'إلغاء هذه الحصة',
		moveLegend: 'نقل هذه الحصة',
		newDate: 'التاريخ الجديد',
		newDateHelp: (today) => `ابتداءً من اليوم، ${today}، قبل التاريخ المقرّر أو بعده.`,
		newTime: 'وقت البداية',
		newTimeHelp: 'مثال: 19:30',
		moveButton: 'نقل الحصة',
		restoreButton: 'استعادة الحصة',
		restoreHelp: 'بهذا يُلغى التغيير: تعود الحصة إلى تاريخها ووقتها المعتادين.',
		done: {
			cancelled: 'أُلغيت الحصة.',
			moved: 'نُقلت الحصة.',
			restored: 'استُعيدت الحصة.'
		},
		messageHelp:
			'رسالة ترسلها إلى جماعتك، في WhatsApp مثلًا. هي مكتوبة بكل لغة من لغات صفحتك العامة، ولغة الدرس أولًا: افتح لغة، ثم انسخ نصها.',
		messageLabel: 'الرسالة المراد نسخها',
		weekTitle: 'برنامجك لهذا الأسبوع',
		weekHelp:
			'برنامجك للأيام السبعة القادمة، لتنسخه وتلصقه في WhatsApp. هو مكتوب بكل لغة من لغات صفحتك العامة، واللغة الافتراضية أولًا: افتح لغة، ثم انسخ نصها.',
		weekLabel: 'برنامجك لهذا الأسبوع',
		inLanguage: (language) => `ب${language}`,
		audience: {
			title: 'كم مرة شوهد برنامجك',
			where: 'أين',
			last7: 'آخر 7 أيام',
			last30: 'آخر 30 يومًا',
			page: 'الصفحة العامة',
			embed: 'برنامجك المدمج في موقعك',
			feed: 'التقاويم المشترِكة',
			note: 'لا يُحفظ كل يوم إلا عدد واحد لكل نوع: لا عنوان، ولا مصدر، ولا زائر. لا تُحتسب الروبوتات المعروفة. هذه الأعداد حدّ أدنى: فالصفحة التي يحفظها متصفح أو مزوّد في ذاكرته لن تصلنا. في التقاويم، يُحتسب كل تحديث، لا كل شخص: فالتقويم يُحدَّث من تلقاء نفسه، عدة مرات في اليوم.'
		},
		errors: {
			unreadableDate: 'تعذّرت قراءة تاريخ هذه الحصة. أعد تحميل الصفحة، ثم حاول مرة أخرى.',
			unreadableNewDate: 'تعذّرت قراءة هذا التاريخ. اختره من تقويم خانة «التاريخ الجديد».',
			unreadableTime: 'تعذّرت قراءة هذا الوقت. اكتب الساعات والدقائق، مثلًا 19:30.',
			pastDate: 'هذا التاريخ قد مضى. اختر اليوم أو يومًا بعده.',
			pastSession: 'موعد هذه الحصة قد مضى: يمكنك إلغاء حصص اليوم والأيام التالية فقط.',
			unchanged: 'الحصة مقرّرة أصلًا في هذا التاريخ وفي هذا الوقت. اختر تاريخًا آخر أو وقتًا آخر.',
			changed: (title, date) =>
				`تغيّرت حصة «${title}» يوم ${date} منذ أن فُتحت الصفحة: سبق أن أُلغيت أو نُقلت. لم يُحفظ أي شيء. برنامجك المعروض أدناه محدَّث.`,
			timeChanged: (title, date) =>
				`تغيّر وقت حصة «${title}» يوم ${date} منذ أن فُتحت الصفحة. لم يُحفظ أي شيء. وقتها الجديد مكتوب تحت عنوانها: راجع ما اخترته من تاريخ ووقت، ثم حاول مرة أخرى.`,
			alreadyCancelled: (title, date) =>
				`أُلغيت حصة «${title}» يوم ${date} منذ أن فُتحت الصفحة. لم يُحفظ أي شيء. إن لم تُرسَل الرسالة بعد، فهي جاهزة أدناه.`,
			alreadyRestored: (title, date) =>
				`استُعيدت حصة «${title}» يوم ${date} منذ أن فُتحت الصفحة. لم يُحفظ أي شيء. برنامجك المعروض أدناه محدَّث.`,
			sessionGone: 'هذه الحصة لم تعد موجودة. القائمة أدناه محدَّثة.'
		}
	}
};

/**
 * La phrase d'un refus, dans la langue de l'écran. Un refus qui nomme la séance reçoit son titre et
 * sa date déjà écrite ; les autres n'en ont pas besoin.
 */
export function upcomingErrorText(
	texts: UpcomingTexts,
	error: UpcomingError,
	title: string,
	date: string
): string {
	const phrase = texts.errors[error];
	return typeof phrase === 'function' ? phrase(title, date) : phrase;
}

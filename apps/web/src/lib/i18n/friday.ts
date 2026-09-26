// Les textes de l'écran de la prière du vendredi (`/vendredi`, ADR 0033).
//
// Une organisation y vient deux fois par an, au changement de saison : l'écran doit se comprendre
// sans rien savoir du service. Chaque champ dit ce qu'il demande, avec un exemple quand la valeur
// n'est pas évidente, et chaque geste dit ce qu'il a fait.
//
// Une « session » est une fois où la prière a lieu le vendredi : l'allemand dit « Durchgang »,
// l'italien « turno », l'arabe « موعد », les mots que les mosquées emploient pour une prière du
// vendredi tenue en plusieurs fois. Le sermon est « Predigt », « sermone », « الخطبة », comme sur la
// page publique.

import type { Translations } from './space.js';

/**
 * Ce qu'une action de l'écran peut refuser : le nom de l'erreur, jamais sa phrase. Pour « Ce
 * vendredi », comme sur « À venir » : `changed`, la session a été annulée ou déplacée ce jour-là
 * depuis l'ouverture de la page ; `timeChanged`, son heure a changé depuis ; `unchanged`, un
 * déplacement vers le jour et l'heure où elle est déjà prévue. Pour l'ajout : `orderTaken`, une
 * session sans date de fin a déjà ce rang.
 */
export type FridayError =
	| 'titleTooLong'
	| 'orderInvalid'
	| 'timesMissing'
	| 'endBeforeStart'
	| 'sermonLanguageMissing'
	| 'startDateMissing'
	| 'endDateUnreadable'
	| 'endDateBeforeStart'
	| 'sessionGone'
	| 'dateUnreadable'
	| 'timeUnreadable'
	| 'changed'
	| 'timeChanged'
	| 'unchanged'
	| 'orderTaken';

/** Ce qu'une action de l'écran a fait, pour la phrase qui le confirme. */
export type FridayDone =
	| 'added'
	| 'updated'
	| 'published'
	| 'unpublished'
	| 'deleted'
	| 'cancelled'
	| 'moved'
	| 'restored';

interface FridayTexts {
	readonly title: string;
	readonly intro: string;
	/** Plusieurs sessions le même vendredi : ce que c'est, avec un exemple. */
	readonly severalSessions: string;
	readonly empty: string;
	/** Le rang d'une session, en toutes lettres : première, deuxième, troisième. */
	readonly orders: readonly [string, string, string];
	readonly sermonIn: (languages: string) => string;
	/** L'état d'une session, et ce qu'il veut dire pour un visiteur. */
	readonly published: string;
	readonly draft: string;
	/** « Jusqu'au mercredi 25.11.2026 » : la date arrive déjà écrite, nom du jour compris. */
	readonly until: (date: string) => string;
	readonly publish: string;
	readonly unpublish: string;
	readonly edit: string;
	/**
	 * Ce que la suppression emporte, avant le bouton qui l'ouvre. Rangé entre les deux boutons : le
	 * correcteur lit à la suite les textes voisins, et « Edit this session Delete » lui semblait un
	 * sujet suivi de son verbe.
	 */
	readonly removeWarning: string;
	readonly remove: string;
	readonly removeConfirm: string;
	readonly add: string;
	/**
	 * À la place du formulaire d'ajout, quand trois sessions continuent sans date de fin : pourquoi
	 * l'écran n'en propose pas une autre, et quoi faire.
	 */
	readonly noFreeOrder: string;
	readonly form: {
		readonly title: string;
		readonly titleHelp: string;
		readonly order: string;
		readonly orderHelp: string;
		readonly start: string;
		readonly end: string;
		readonly timesHelp: string;
		readonly room: string;
		readonly noRoom: string;
		readonly roomHelp: string;
		readonly sermon: string;
		readonly sermonHelp: string;
		readonly teacher: string;
		readonly teacherHelp: string;
		readonly startsOn: string;
		/** À l'ajout, où le champ montre la date du jour. */
		readonly startsOnHelp: string;
		/**
		 * Dans la carte d'une session, où le champ montre sa date de début : changer cette date
		 * change aussi les vendredis déjà passés, et une nouvelle heure passe par « Jusqu'au ».
		 */
		readonly startsOnEditHelp: string;
		readonly endsOn: string;
		readonly endsOnHelp: string;
		/** Le changement de saison : clore la session, puis en ajouter une nouvelle. */
		readonly season: string;
		readonly description: string;
		readonly descriptionHelp: string;
		readonly save: string;
		readonly create: string;
	};
	/** Le prochain vendredi, avec l'annulation et le déplacement d'une seule session. */
	readonly thisFriday: {
		readonly title: string;
		readonly intro: string;
		readonly cancelled: string;
		readonly movedTo: (date: string, time: string) => string;
		readonly movedFrom: (date: string) => string;
		readonly onlyThis: string;
		readonly cancel: string;
		readonly newDay: string;
		readonly newTime: string;
		readonly move: string;
		readonly restore: string;
	};
	readonly coursesElsewhere: string;
	readonly coursesLink: string;
	readonly done: Readonly<Record<FridayDone, string>>;
	readonly errors: Readonly<Record<FridayError, string>>;
}

export const fridayTexts: Translations<FridayTexts> = {
	fr: {
		title: 'Prière du vendredi',
		intro:
			'Indiquez ici l’heure de la prière du vendredi. Elle s’affiche en haut de votre page publique. Le vendredi, elle remplace l’heure du Dhuhr partout : un cours prévu après le Dhuhr suit l’heure de la dernière session.',
		severalSessions:
			'La prière a lieu plusieurs fois le même vendredi, par exemple à 12:10 puis à 13:30 ? Ajoutez une session pour chaque fois, jusqu’à trois.',
		empty:
			'Aucune session du vendredi pour l’instant. Tant qu’il n’y en a pas, votre page publique n’affiche rien pour le vendredi, et les cours prévus après le Dhuhr gardent l’heure du Dhuhr.',
		orders: ['Première session', 'Deuxième session', 'Troisième session'],
		sermonIn: (languages) => `Sermon en ${languages}`,
		published: 'Publiée : visible sur votre page publique.',
		draft: 'Brouillon : pas encore visible sur votre page publique.',
		until: (date) => `Jusqu’au ${date}`,
		publish: 'Publier',
		unpublish: 'Retirer de la page publique',
		edit: 'Modifier cette session',
		removeWarning:
			'Elle disparaîtra de cet écran et de votre page publique, pour tous les vendredis. Pour un seul vendredi, annulez-la plutôt dans « Ce vendredi », plus bas.',
		remove: 'Supprimer cette session',
		removeConfirm: 'Oui, supprimer',
		add: 'Ajouter une session',
		noFreeOrder:
			'Vous ne pouvez pas ajouter de session : trois sessions continuent déjà sans date de fin, et c’est le maximum. Pour changer l’heure d’une session, ouvrez « Modifier cette session » plus haut. Si l’heure change avec la saison, remplissez d’abord « Jusqu’au » dans la session qui s’arrête : vous pourrez ensuite ajouter la nouvelle ici.',
		form: {
			title: 'Titre',
			titleHelp:
				'Ce que les visiteurs lisent sur votre page publique. Exemple : Prière du vendredi',
			order: 'Rang dans la journée',
			orderHelp:
				'Les sessions s’affichent dans cet ordre. Une seule prière le vendredi ? Gardez « Première session ».',
			start: 'Heure de début',
			end: 'Heure de fin',
			timesHelp: 'Du début du sermon à la fin de la prière. Exemple : de 12:10 à 12:50.',
			room: 'Salle',
			noRoom: 'Pas de salle précise',
			roomHelp: 'Une personne responsable crée les salles dans Réglages.',
			sermon: 'Langue du sermon',
			sermonHelp:
				'Cochez chaque langue dans laquelle le sermon est dit. Seules les langues de votre page publique sont proposées.',
			teacher: 'Imam ou intervenant (facultatif)',
			teacherHelp: 'Son nom s’affiche sur votre page publique. Exemple : Imam Youssef',
			startsOn: 'À partir du',
			startsOnHelp:
				'La session a lieu chaque vendredi à partir de cette date. Gardez la date du jour pour qu’elle commence tout de suite.',
			startsOnEditHelp:
				'La session a lieu chaque vendredi à partir de cette date. Changez cette date seulement pour corriger une erreur.',
			endsOn: 'Jusqu’au (facultatif)',
			endsOnHelp: 'Laissez vide si la session continue sans date de fin.',
			season:
				'L’heure change avec la saison ? Remplissez « Jusqu’au » ici, puis ajoutez une nouvelle session : les vendredis passés gardent leur heure.',
			description: 'Description (facultatif)',
			descriptionHelp:
				'Quelques mots pour les visiteurs, sur la page de la session. Exemple : La salle ouvre à 12:00.',
			save: 'Enregistrer les changements',
			create: 'Ajouter la session'
		},
		thisFriday: {
			title: 'Ce vendredi',
			intro:
				'Pour un seul vendredi, vous pouvez annuler une session, ou la déplacer à un autre jour ou à une autre heure.',
			cancelled: 'Annulée ce jour-là',
			movedTo: (date, time) => `Déplacée au ${date} à ${time}`,
			movedFrom: (date) => `Nouvelle date, à la place du ${date}`,
			onlyThis: 'Cette session seulement. Les autres vendredis ne changent pas.',
			cancel: 'Annuler cette session',
			newDay: 'Nouveau jour',
			newTime: 'Nouvelle heure',
			move: 'Déplacer',
			restore: 'Rétablir comme d’habitude'
		},
		coursesElsewhere:
			'Les cours ont leur propre écran : une session du vendredi n’y figure pas, et un cours ne figure pas ici.',
		coursesLink: 'Aller aux cours',
		done: {
			added: 'La session est ajoutée.',
			updated: 'Les changements sont enregistrés.',
			published: 'La session est publiée : elle s’affiche sur votre page publique.',
			unpublished: 'La session est retirée de votre page publique. Elle reste ici, en brouillon.',
			deleted: 'La session est supprimée.',
			cancelled: 'La session est annulée pour ce vendredi. Les autres vendredis ne changent pas.',
			moved: 'La session est déplacée pour ce vendredi. Les autres vendredis ne changent pas.',
			restored: 'La session retrouve son jour et son heure habituels.'
		},
		errors: {
			titleTooLong: 'Le titre est trop long : 120 signes au plus.',
			orderInvalid: 'Choisissez la première, la deuxième ou la troisième session.',
			timesMissing: 'Donnez une heure de début et une heure de fin. Exemple : 12:10 et 12:50.',
			endBeforeStart: 'L’heure de fin doit venir après l’heure de début.',
			sermonLanguageMissing: 'Cochez au moins une langue du sermon.',
			startDateMissing: 'Choisissez la date à partir de laquelle la session a lieu.',
			endDateUnreadable: 'La date « Jusqu’au » est illisible. Choisissez-la dans le calendrier.',
			endDateBeforeStart: 'La date « Jusqu’au » vient avant la date « À partir du ».',
			sessionGone:
				'Cette session n’existe plus : elle a été supprimée entre-temps. La liste ci-dessous est à jour.',
			dateUnreadable: 'Cette date est illisible. Rechargez la page et recommencez.',
			timeUnreadable: 'Cette heure est illisible. Exemple : 13:30.',
			changed:
				'Cette session a changé depuis l’ouverture de la page : elle a déjà été annulée ou déplacée ce jour-là. Rien n’a été enregistré. La partie « Ce vendredi », plus bas, est à jour.',
			timeChanged:
				'L’heure de cette session a changé depuis l’ouverture de la page. Rien n’a été enregistré. Sa nouvelle heure est écrite plus bas, dans « Ce vendredi » : vérifiez le jour et l’heure choisis, puis recommencez.',
			unchanged:
				'La session est déjà prévue ce jour-là à cette heure : rien n’a été déplacé. Choisissez une autre heure ou un autre jour dans « Ce vendredi », plus bas.',
			orderTaken:
				'Une autre session sans date de fin occupe déjà ce rang. Choisissez un autre rang, ou remplissez d’abord « Jusqu’au » dans l’autre session.'
		}
	},
	de: {
		title: 'Freitagsgebet',
		intro:
			'Geben Sie hier die Zeit des Freitagsgebets an. Sie erscheint oben auf Ihrer öffentlichen Seite. Am Freitag ersetzt sie überall die Zeit des Dhuhr: Ein Kurs, der nach dem Dhuhr geplant ist, richtet sich nach dem letzten Durchgang.',
		severalSessions:
			'Findet das Gebet am selben Freitag mehrmals statt, zum Beispiel um 12:10 und dann um 13:30? Fügen Sie für jedes Mal einen Durchgang hinzu, höchstens drei.',
		empty:
			'Noch kein Durchgang für das Freitagsgebet. Solange es keinen gibt, zeigt Ihre öffentliche Seite für den Freitag nichts an, und Kurse, die nach dem Dhuhr geplant sind, behalten die Zeit des Dhuhr.',
		orders: ['Erster Durchgang', 'Zweiter Durchgang', 'Dritter Durchgang'],
		sermonIn: (languages) => `Predigt auf ${languages}`,
		published: 'Veröffentlicht: auf Ihrer öffentlichen Seite sichtbar.',
		draft: 'Entwurf: noch nicht auf Ihrer öffentlichen Seite sichtbar.',
		until: (date) => `Bis ${date}`,
		publish: 'Veröffentlichen',
		unpublish: 'Von der öffentlichen Seite nehmen',
		edit: 'Diesen Durchgang bearbeiten',
		removeWarning:
			'Er verschwindet von dieser Seite und von Ihrer öffentlichen Seite, für alle Freitage. Für einen einzigen Freitag sagen Sie ihn besser weiter unten unter «Diesen Freitag» ab.',
		remove: 'Diesen Durchgang löschen',
		removeConfirm: 'Ja, löschen',
		add: 'Durchgang hinzufügen',
		noFreeOrder:
			'Sie können keinen weiteren Durchgang hinzufügen: Drei Durchgänge laufen schon ohne Enddatum weiter, und mehr sind nicht möglich. Um die Zeit eines Durchgangs zu ändern, öffnen Sie weiter oben «Diesen Durchgang bearbeiten». Ändert sich die Zeit mit der Jahreszeit? Füllen Sie zuerst beim Durchgang, der endet, «Gültig bis» aus. Danach können Sie hier den neuen hinzufügen.',
		form: {
			title: 'Titel',
			titleHelp:
				'Das lesen die Besucherinnen und Besucher auf Ihrer öffentlichen Seite. Beispiel: Freitagsgebet',
			order: 'Reihenfolge am Tag',
			orderHelp:
				'Die Durchgänge erscheinen in dieser Reihenfolge. Nur ein Gebet am Freitag? Behalten Sie «Erster Durchgang».',
			start: 'Anfangszeit',
			end: 'Endzeit',
			timesHelp: 'Vom Beginn der Predigt bis zum Ende des Gebets. Beispiel: von 12:10 bis 12:50.',
			room: 'Raum',
			noRoom: 'Kein bestimmter Raum',
			roomHelp: 'Die Räume legt eine verantwortliche Person unter Einstellungen an.',
			sermon: 'Sprache der Predigt',
			sermonHelp:
				'Kreuzen Sie jede Sprache an, in der gepredigt wird. Zur Auswahl stehen nur die Sprachen Ihrer öffentlichen Seite.',
			teacher: 'Imam oder Referent (optional)',
			teacherHelp: 'Der Name erscheint auf Ihrer öffentlichen Seite. Beispiel: Imam Youssef',
			startsOn: 'Gültig ab',
			startsOnHelp:
				'Der Durchgang findet ab diesem Datum jeden Freitag statt. Behalten Sie das heutige Datum, damit er sofort beginnt.',
			startsOnEditHelp:
				'Der Durchgang findet ab diesem Datum jeden Freitag statt. Ändern Sie das Datum nur, um einen Fehler zu korrigieren.',
			endsOn: 'Gültig bis (optional)',
			endsOnHelp: 'Leer lassen, wenn der Durchgang ohne Enddatum weiterläuft.',
			season:
				'Ändert sich die Zeit mit der Jahreszeit? Füllen Sie hier «Gültig bis» aus und fügen Sie danach einen neuen Durchgang hinzu: Vergangene Freitage behalten ihre Zeit.',
			description: 'Beschreibung (optional)',
			descriptionHelp:
				'Ein paar Worte für die Besucherinnen und Besucher, auf der Seite des Durchgangs. Beispiel: Der Saal öffnet um 12:00.',
			save: 'Änderungen speichern',
			create: 'Diesen Durchgang hinzufügen'
		},
		thisFriday: {
			title: 'Diesen Freitag',
			intro:
				'Für einen einzigen Freitag können Sie einen Durchgang absagen oder ihn auf einen anderen Tag oder eine andere Zeit verschieben.',
			cancelled: 'An diesem Tag abgesagt',
			movedTo: (date, time) => `Verschoben auf ${date}, um ${time}`,
			movedFrom: (date) => `Neues Datum, anstelle von ${date}`,
			onlyThis: 'Nur dieser Durchgang. Die anderen Freitage bleiben unverändert.',
			cancel: 'Diesen Durchgang absagen',
			newDay: 'Neuer Tag',
			newTime: 'Neue Uhrzeit',
			move: 'Verschieben',
			restore: 'Wie gewohnt wiederherstellen'
		},
		coursesElsewhere:
			'Die Kurse haben ihre eigene Seite: Ein Durchgang des Freitagsgebets erscheint dort nicht, und ein Kurs erscheint nicht hier.',
		coursesLink: 'Zu den Kursen',
		done: {
			added: 'Der Durchgang wurde hinzugefügt.',
			updated: 'Die Änderungen wurden gespeichert.',
			published: 'Der Durchgang ist veröffentlicht: Er erscheint auf Ihrer öffentlichen Seite.',
			unpublished:
				'Der Durchgang wurde von Ihrer öffentlichen Seite genommen. Er bleibt hier als Entwurf.',
			deleted: 'Der Durchgang wurde gelöscht.',
			cancelled:
				'Der Durchgang ist für diesen Freitag abgesagt. Die anderen Freitage bleiben unverändert.',
			moved:
				'Der Durchgang ist für diesen Freitag verschoben. Die anderen Freitage bleiben unverändert.',
			restored:
				'Der Durchgang findet wieder an seinem gewohnten Tag und zu seiner gewohnten Zeit statt.'
		},
		errors: {
			titleTooLong: 'Der Titel ist zu lang: höchstens 120 Zeichen.',
			orderInvalid: 'Wählen Sie den ersten, zweiten oder dritten Durchgang.',
			timesMissing:
				'Geben Sie an, wann der Durchgang beginnt und endet. Beispiel: 12:10 und 12:50.',
			endBeforeStart: 'Das Ende muss nach dem Beginn liegen.',
			sermonLanguageMissing: 'Kreuzen Sie mindestens eine Sprache der Predigt an.',
			startDateMissing: 'Wählen Sie das Datum, ab dem der Durchgang gilt.',
			endDateUnreadable: 'Das Datum «Gültig bis» ist nicht lesbar. Wählen Sie es im Kalender.',
			endDateBeforeStart: 'Das Datum «Gültig bis» liegt vor dem Datum «Gültig ab».',
			sessionGone:
				'Diesen Durchgang gibt es nicht mehr: Er wurde inzwischen gelöscht. Die Liste unten ist aktuell.',
			dateUnreadable:
				'Dieses Datum ist nicht lesbar. Laden Sie die Seite neu und versuchen Sie es noch einmal.',
			timeUnreadable: 'Diese Uhrzeit ist nicht lesbar. Beispiel: 13:30.',
			changed:
				'Dieser Durchgang hat sich geändert, seit die Seite geöffnet wurde: Er wurde an diesem Tag schon abgesagt oder verschoben. Es wurde nichts gespeichert. Der Abschnitt «Diesen Freitag» weiter unten ist aktuell.',
			timeChanged:
				'Die Uhrzeit dieses Durchgangs hat sich geändert, seit die Seite geöffnet wurde. Es wurde nichts gespeichert. Die neue Uhrzeit steht weiter unten unter «Diesen Freitag»: Prüfen Sie den gewählten Tag und die gewählte Uhrzeit und versuchen Sie es noch einmal.',
			unchanged:
				'Der Durchgang ist schon an diesem Tag zu dieser Uhrzeit geplant: Es wurde nichts verschoben. Wählen Sie weiter unten unter «Diesen Freitag» einen anderen Tag oder eine andere Uhrzeit.',
			orderTaken:
				'Ein anderer Durchgang ohne Enddatum hat schon diese Reihenfolge. Wählen Sie eine andere, oder füllen Sie zuerst «Gültig bis» im anderen Durchgang aus.'
		}
	},
	it: {
		title: 'Preghiera del venerdì',
		intro:
			'Indica qui l’orario della preghiera del venerdì. Compare in alto sulla tua pagina pubblica. Il venerdì sostituisce ovunque l’orario del Dhuhr: un corso previsto dopo il Dhuhr segue l’orario dell’ultimo turno.',
		severalSessions:
			'La preghiera si tiene più volte lo stesso venerdì, per esempio alle 12:10 e poi alle 13:30? Aggiungi un turno per ogni volta, fino a tre.',
		empty:
			'Ancora nessun turno per la preghiera del venerdì. Finché non ce n’è uno, la tua pagina pubblica non mostra niente per il venerdì, e i corsi previsti dopo il Dhuhr mantengono l’orario del Dhuhr.',
		orders: ['Primo turno', 'Secondo turno', 'Terzo turno'],
		sermonIn: (languages) => `Sermone in ${languages}`,
		published: 'Pubblicato: visibile sulla tua pagina pubblica.',
		draft: 'Bozza: non ancora visibile sulla tua pagina pubblica.',
		until: (date) => `Fino a ${date}`,
		publish: 'Pubblica',
		unpublish: 'Togli dalla pagina pubblica',
		edit: 'Modifica questo turno',
		removeWarning:
			'Sparirà da questa schermata e dalla tua pagina pubblica, per tutti i venerdì. Per un solo venerdì, annullalo piuttosto più in basso, in «Questo venerdì».',
		remove: 'Elimina questo turno',
		removeConfirm: 'Sì, elimina',
		add: 'Aggiungi un turno',
		noFreeOrder:
			'Non puoi aggiungere un altro turno: tre turni continuano già senza data di fine, ed è il massimo. Per cambiare l’orario di un turno, apri «Modifica questo turno» più in alto. Se l’orario cambia con la stagione, compila prima «Valido fino al» nel turno che finisce: poi potrai aggiungere qui quello nuovo.',
		form: {
			title: 'Titolo',
			titleHelp:
				'Quello che i visitatori leggono sulla tua pagina pubblica. Esempio: Preghiera del venerdì',
			order: 'Ordine nella giornata',
			orderHelp:
				'I turni compaiono in quest’ordine. Una sola preghiera il venerdì? Lascia «Primo turno».',
			start: 'Ora di inizio',
			end: 'Ora di fine',
			timesHelp:
				'Dall’inizio del sermone alla fine della preghiera. Esempio: dalle 12:10 alle 12:50.',
			room: 'Sala',
			noRoom: 'Nessuna sala precisa',
			roomHelp: 'Le sale le crea una persona responsabile in Impostazioni.',
			sermon: 'Lingua del sermone',
			sermonHelp:
				'Seleziona ogni lingua in cui viene detto il sermone. Sono proposte solo le lingue della tua pagina pubblica.',
			teacher: 'Imam o relatore (facoltativo)',
			teacherHelp: 'Il suo nome compare sulla tua pagina pubblica. Esempio: Imam Omar',
			startsOn: 'Valido dal',
			startsOnHelp:
				'Il turno si tiene ogni venerdì a partire da questa data. Lascia la data di oggi perché cominci subito.',
			startsOnEditHelp:
				'Il turno si tiene ogni venerdì a partire da questa data. Cambiala solo per correggere un errore.',
			endsOn: 'Valido fino al (facoltativo)',
			endsOnHelp: 'Lascia vuoto se il turno continua senza data di fine.',
			season:
				'L’orario cambia con la stagione? Compila qui «Valido fino al», poi aggiungi un nuovo turno: i venerdì passati mantengono il loro orario.',
			description: 'Descrizione (facoltativa)',
			descriptionHelp:
				'Qualche parola per i visitatori, sulla pagina del turno. Esempio: La sala apre alle 12:00.',
			save: 'Salva le modifiche',
			create: 'Aggiungi il turno'
		},
		thisFriday: {
			title: 'Questo venerdì',
			intro:
				'Per un solo venerdì puoi annullare un turno, oppure spostarlo a un altro giorno o a un altro orario.',
			cancelled: 'Annullato quel giorno',
			movedTo: (date, time) => `Spostato a ${date} alle ${time}`,
			movedFrom: (date) => `Nuova data, al posto di ${date}`,
			onlyThis: 'Solo questo turno. Gli altri venerdì non cambiano.',
			cancel: 'Annulla questo turno',
			newDay: 'Nuovo giorno',
			newTime: 'Nuovo orario',
			move: 'Sposta',
			restore: 'Ripristina come al solito'
		},
		coursesElsewhere:
			'I corsi hanno una schermata tutta loro: un turno della preghiera del venerdì non vi compare, e un corso non compare qui.',
		coursesLink: 'Vai ai corsi',
		done: {
			added: 'Il turno è stato aggiunto.',
			updated: 'Le modifiche sono state salvate.',
			published: 'Il turno è pubblicato: compare sulla tua pagina pubblica.',
			unpublished: 'Il turno è stato tolto dalla tua pagina pubblica. Resta qui, come bozza.',
			deleted: 'Il turno è stato eliminato.',
			cancelled: 'Il turno è annullato per questo venerdì. Gli altri venerdì non cambiano.',
			moved: 'Il turno è spostato per questo venerdì. Gli altri venerdì non cambiano.',
			restored: 'Il turno ritrova il suo giorno e il suo orario abituali.'
		},
		errors: {
			titleTooLong: 'Il titolo è troppo lungo: al massimo 120 caratteri.',
			orderInvalid: 'Scegli il primo, il secondo o il terzo turno.',
			timesMissing: 'Indica un’ora di inizio e un’ora di fine. Esempio: 12:10 e 12:50.',
			endBeforeStart: 'L’ora di fine deve venire dopo l’ora di inizio.',
			sermonLanguageMissing: 'Seleziona almeno una lingua del sermone.',
			startDateMissing: 'Scegli la data da cui vale il turno.',
			endDateUnreadable: 'La data «Valido fino al» non è leggibile. Sceglila nel calendario.',
			endDateBeforeStart: 'La data «Valido fino al» viene prima della data «Valido dal».',
			sessionGone:
				'Questo turno non esiste più: nel frattempo è stato eliminato. L’elenco qui sotto è aggiornato.',
			dateUnreadable: 'Questa data non è leggibile. Ricarica la pagina e riprova.',
			timeUnreadable: 'Questo orario non è leggibile. Esempio: 13:30.',
			changed:
				'Questo turno è cambiato da quando hai aperto la pagina: quel giorno è già stato annullato o spostato. Non è stato salvato niente. La sezione «Questo venerdì», più in basso, è aggiornata.',
			timeChanged:
				'L’orario di questo turno è cambiato da quando hai aperto la pagina. Non è stato salvato niente. Il nuovo orario è indicato più in basso, in «Questo venerdì»: controlla il giorno e l’orario scelti, poi riprova.',
			unchanged:
				'Il turno è già previsto quel giorno a quell’ora: non è stato spostato niente. Scegli un altro giorno o un altro orario più in basso, in «Questo venerdì».',
			orderTaken:
				'Un altro turno senza data di fine occupa già questo posto nell’ordine. Scegline un altro, oppure compila prima «Valido fino al» nell’altro turno.'
		}
	},
	en: {
		title: 'Friday prayer',
		intro:
			'Enter the time of the Friday prayer here. It appears at the top of your public page. On Fridays, it replaces the Dhuhr time everywhere: a course planned after Dhuhr follows the time of the last session.',
		severalSessions:
			'Is the prayer held more than once on the same Friday, for example at 12:10 and then at 13:30? Add one session for each time, up to three.',
		empty:
			'No Friday prayer session yet. Until there is one, your public page shows nothing for Friday, and courses planned after Dhuhr keep the Dhuhr time.',
		orders: ['First session', 'Second session', 'Third session'],
		sermonIn: (languages) => `Sermon in ${languages}`,
		published: 'Published: visible on your public page.',
		draft: 'Draft: not yet visible on your public page.',
		until: (date) => `Until ${date}`,
		publish: 'Publish',
		unpublish: 'Remove from the public page',
		edit: 'Edit this session',
		removeWarning:
			'It will disappear from this screen and from your public page, for every Friday. For a single Friday, cancel it instead under ‘This Friday’, further down.',
		remove: 'Delete this session',
		removeConfirm: 'Yes, delete',
		add: 'Add a session',
		noFreeOrder:
			'You cannot add another session: three sessions already carry on with no end date, and that is the maximum. To change the time of a session, open ‘Edit this session’ further up. If the time changes with the season, first fill in ‘Until’ in the session that ends: you can then add the new one here.',
		form: {
			title: 'Title',
			titleHelp: 'What visitors read on your public page. Example: Friday prayer',
			order: 'Order in the day',
			orderHelp:
				'Sessions are shown in this order. Only one prayer on Fridays? Keep ‘First session’.',
			start: 'Start time',
			end: 'End time',
			timesHelp:
				'From the start of the sermon to the end of the prayer. Example: from 12:10 to 12:50.',
			room: 'Room',
			noRoom: 'No particular room',
			roomHelp: 'A manager creates rooms in Settings.',
			sermon: 'Language of the sermon',
			sermonHelp:
				'Tick each language the sermon is given in. Only the languages of your public page are offered.',
			teacher: 'Imam or speaker (optional)',
			teacherHelp: 'Their name appears on your public page. Example: Imam Youssef',
			startsOn: 'From',
			startsOnHelp:
				'The session takes place every Friday from this date. Keep today’s date for it to start straight away.',
			startsOnEditHelp:
				'The session takes place every Friday from this date. Only change the date to correct a mistake.',
			endsOn: 'Until (optional)',
			endsOnHelp: 'Leave empty if the session carries on with no end date.',
			season:
				'Does the time change with the season? Fill in ‘Until’ here, then add a new session: past Fridays keep their time.',
			description: 'Description (optional)',
			descriptionHelp:
				'A few words for visitors, on the page of the session. Example: The hall opens at 12:00.',
			save: 'Save changes',
			create: 'Add the session'
		},
		thisFriday: {
			title: 'This Friday',
			intro:
				'For a single Friday, you can cancel a session, or move it to another day or another time.',
			cancelled: 'Cancelled that day',
			movedTo: (date, time) => `Moved to ${date} at ${time}`,
			movedFrom: (date) => `New date, instead of ${date}`,
			onlyThis: 'This session only. Other Fridays do not change.',
			cancel: 'Cancel this session',
			newDay: 'New day',
			newTime: 'New time',
			move: 'Move',
			restore: 'Restore as usual'
		},
		coursesElsewhere:
			'Courses have their own screen: a Friday prayer session does not appear there, and a course does not appear here.',
		coursesLink: 'Go to courses',
		done: {
			added: 'The session has been added.',
			updated: 'Your changes have been saved.',
			published: 'The session is published: it appears on your public page.',
			unpublished: 'The session has been removed from your public page. It stays here as a draft.',
			deleted: 'The session has been deleted.',
			cancelled: 'The session is cancelled for this Friday. Other Fridays do not change.',
			moved: 'The session is moved for this Friday. Other Fridays do not change.',
			restored: 'The session is back to its usual day and time.'
		},
		errors: {
			titleTooLong: 'The title is too long: 120 characters at most.',
			orderInvalid: 'Choose the first, second or third session.',
			timesMissing: 'Give a start time and an end time. Example: 12:10 and 12:50.',
			endBeforeStart: 'The end time must come after the start time.',
			sermonLanguageMissing: 'Tick at least one language for the sermon.',
			startDateMissing: 'Choose the date from which the session takes place.',
			endDateUnreadable: 'The ‘Until’ date cannot be read. Pick it in the calendar.',
			endDateBeforeStart: 'The ‘Until’ date comes before the ‘From’ date.',
			sessionGone:
				'This session no longer exists: it has been deleted in the meantime. The list below shows the sessions as they are now.',
			dateUnreadable: 'This date cannot be read. Reload the page and try again.',
			timeUnreadable: 'This time cannot be read. Example: 13:30.',
			changed:
				'This session has changed since the page was opened: it has already been cancelled or moved for that day. Nothing has been saved. The ‘This Friday’ section further down shows the latest changes.',
			timeChanged:
				'The time of this session has changed since the page was opened. Nothing has been saved. Its new time is shown further down, under ‘This Friday’: check the day and time you chose, then try again.',
			unchanged:
				'The session is already planned for that day at that time: nothing has been moved. Choose a different day or time under ‘This Friday’, further down.',
			orderTaken:
				'Another session with no end date already has this place in the order. Choose another, or first fill in ‘Until’ in the other session.'
		}
	},
	ar: {
		title: 'صلاة الجمعة',
		intro:
			'حدّد هنا وقت صلاة الجمعة. يظهر هذا الوقت في أعلى صفحتك العامة. وفي يوم الجمعة يحلّ محلّ وقت الظهر في كل مكان: فالدرس المقرّر بعد الظهر يتبع وقت الموعد الأخير.',
		severalSessions:
			'هل تُقام الصلاة أكثر من مرة في الجمعة نفسها، مثلًا في 12:10 ثم في 13:30؟ أضف موعدًا لكل مرة، بحد أقصى 3 مواعيد.',
		empty:
			'لا يوجد أي موعد لصلاة الجمعة حتى الآن. وما دام لا يوجد موعد، لا تعرض صفحتك العامة شيئًا في يوم الجمعة، وتحتفظ الدروس المقرّرة بعد الظهر بوقت الظهر.',
		orders: ['الموعد الأول', 'الموعد الثاني', 'الموعد الثالث'],
		sermonIn: (languages) => `لغة الخطبة: ${languages}`,
		published: 'منشور: يظهر على صفحتك العامة.',
		draft: 'مسودة: لا يظهر على صفحتك العامة بعد.',
		until: (date) => `حتى يوم ${date}`,
		publish: 'نشر',
		unpublish: 'سحب من الصفحة العامة',
		edit: 'تعديل هذا الموعد',
		removeWarning:
			'سيختفي من هذه الشاشة ومن صفحتك العامة، في كل أيام الجمعة. ولإلغائه في جمعة واحدة فقط، ألغِه بدلًا من ذلك في قسم «هذه الجمعة» في الأسفل.',
		remove: 'حذف هذا الموعد',
		removeConfirm: 'نعم، احذف',
		add: 'إضافة موعد',
		noFreeOrder:
			'لا يمكنك إضافة موعد آخر: توجد 3 مواعيد مستمرة دون تاريخ نهاية، وهذا هو الحد الأقصى. لتغيير وقت موعد، افتح «تعديل هذا الموعد» في الأعلى. وإن تغيّر الوقت مع الفصل، فاملأ أولًا خانة «يسري حتى» في الموعد الذي ينتهي، ثم أضف الموعد الجديد هنا.',
		form: {
			title: 'العنوان',
			titleHelp: 'ما يراه الزوار على صفحتك العامة. مثال: صلاة الجمعة',
			order: 'الترتيب في اليوم',
			orderHelp:
				'تظهر المواعيد بهذا الترتيب. هل تُقام صلاة واحدة فقط يوم الجمعة؟ اترك «الموعد الأول».',
			start: 'وقت البداية',
			end: 'وقت النهاية',
			timesHelp: 'من بداية الخطبة إلى نهاية الصلاة. مثال: من 12:10 إلى 12:50.',
			room: 'القاعة',
			noRoom: 'دون قاعة محددة',
			roomHelp: 'ينشئ المسؤول القاعات في الإعدادات.',
			sermon: 'لغة الخطبة',
			sermonHelp: 'اختر كل لغة تُلقى بها الخطبة. لا تظهر هنا إلا لغات صفحتك العامة.',
			teacher: 'الإمام أو المتحدث (اختياري)',
			teacherHelp: 'يظهر اسمه على صفحتك العامة. مثال: الإمام يوسف',
			startsOn: 'يسري ابتداءً من',
			startsOnHelp:
				'يُقام هذا الموعد كل يوم جمعة ابتداءً من هذا التاريخ. اترك تاريخ اليوم ليبدأ فورًا.',
			startsOnEditHelp:
				'يُقام هذا الموعد كل يوم جمعة ابتداءً من هذا التاريخ. لا تغيّر هذا التاريخ إلا لتصحيح خطأ.',
			endsOn: 'يسري حتى (اختياري)',
			endsOnHelp: 'اتركه فارغًا إن كان الموعد مستمرًا دون تاريخ نهاية.',
			season:
				'هل يتغيّر الوقت مع الفصل؟ املأ خانة «يسري حتى» هنا، ثم أضف موعدًا جديدًا: تحتفظ أيام الجمعة الماضية بوقتها.',
			description: 'الوصف (اختياري)',
			descriptionHelp: 'سطر قصير للزوار، على صفحة هذا الموعد. مثال: تُفتح القاعة في الساعة 12:00.',
			save: 'حفظ التغييرات',
			create: 'إضافة الموعد'
		},
		thisFriday: {
			title: 'هذه الجمعة',
			intro: 'في جمعة واحدة فقط، يمكنك إلغاء موعد، أو نقله إلى يوم آخر أو إلى وقت آخر.',
			cancelled: 'أُلغي في ذلك اليوم',
			movedTo: (date, time) => `نُقل إلى يوم ${date} في الساعة ${time}`,
			movedFrom: (date) => `موعد جديد، بدلًا من يوم ${date}`,
			onlyThis: 'هذا الموعد فقط. لا تتغيّر أيام الجمعة الأخرى.',
			cancel: 'إلغاء هذا الموعد',
			newDay: 'اليوم الجديد',
			newTime: 'الوقت الجديد',
			move: 'نقل',
			restore: 'إعادته كالمعتاد'
		},
		coursesElsewhere: 'للدروس شاشتها الخاصة: لا يظهر فيها موعد صلاة الجمعة، ولا يظهر الدرس هنا.',
		coursesLink: 'افتح شاشة الدروس',
		done: {
			added: 'أُضيف الموعد.',
			updated: 'حُفظت التغييرات.',
			published: 'نُشر الموعد، وهو يظهر الآن على صفحتك العامة.',
			unpublished: 'سُحب الموعد من صفحتك العامة، لكنه يبقى محفوظًا هنا.',
			deleted: 'حُذف الموعد.',
			cancelled: 'أُلغي الموعد في هذه الجمعة. لا تتغيّر أيام الجمعة الأخرى.',
			moved: 'نُقل الموعد في هذه الجمعة. لا تتغيّر أيام الجمعة الأخرى.',
			restored: 'عاد الموعد إلى يومه ووقته المعتادين.'
		},
		errors: {
			titleTooLong: 'العنوان طويل جدًا: 120 حرفًا على الأكثر.',
			orderInvalid: 'اختر الموعد الأول أو الثاني أو الثالث.',
			timesMissing: 'أدخل وقت البداية ووقت النهاية. مثال: 12:10 و12:50.',
			endBeforeStart: 'يجب أن يأتي وقت النهاية بعد وقت البداية.',
			sermonLanguageMissing: 'اختر لغة واحدة للخطبة أو أكثر.',
			startDateMissing: 'اختر التاريخ الذي يبدأ منه هذا الموعد.',
			endDateUnreadable: 'تعذّرت قراءة تاريخ «يسري حتى». اختره من التقويم.',
			endDateBeforeStart: 'تاريخ «يسري حتى» يسبق تاريخ «يسري ابتداءً من».',
			sessionGone: 'هذا الموعد لم يعد موجودًا: فقد حُذف في هذه الأثناء. القائمة أدناه محدَّثة.',
			dateUnreadable: 'تعذّرت قراءة هذا التاريخ. أعد تحميل الصفحة وحاول مرة أخرى.',
			timeUnreadable: 'تعذّرت قراءة هذا الوقت. مثال: 13:30.',
			changed:
				'تغيّر هذا الموعد منذ أن فُتحت الصفحة: سبق أن أُلغي أو نُقل في ذلك اليوم. لم يُحفظ أي شيء. قسم «هذه الجمعة» في الأسفل محدَّث.',
			timeChanged:
				'تغيّر وقت هذا الموعد منذ أن فُتحت الصفحة. لم يُحفظ أي شيء. وقته الجديد مكتوب في قسم «هذه الجمعة» في الأسفل: راجع ما اخترته من يوم ووقت، ثم حاول مرة أخرى.',
			unchanged:
				'الموعد مقرّر أصلًا في هذا اليوم وفي هذا الوقت: لم يُنقل أي شيء. اختر يومًا آخر أو وقتًا آخر في قسم «هذه الجمعة» في الأسفل.',
			orderTaken:
				'موعد آخر بلا تاريخ نهاية يشغل هذا الترتيب. اختر ترتيبًا آخر، أو املأ أولًا «يسري حتى» في الموعد الآخر.'
		}
	}
};

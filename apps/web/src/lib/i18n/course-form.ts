// Les textes du formulaire d'un cours (`/cours/nouveau` et `/cours/<id>`), de son résumé et de ses
// erreurs (étape 18, retours B1, B4 et C3).
//
// Le résumé reprend tout ce qui sera publié, ligne par ligne, et dit ce qui manque plutôt que de le
// taire. Chaque libellé du résumé porte ses deux-points, parce que la ponctuation change d'une
// langue à l'autre (l'espace avant les deux-points n'est que française). Les noms des jours, des
// prières, des langues et des publics, le rythme et l'horaire viennent de `format.ts` : ils ne sont
// pas traduits une seconde fois ici.
//
// L'ordre des clés compte pour le correcteur, qui lit les textes voisins à la suite : le titre de
// l'écran et celui de la fiche sont séparés par la phrase d'accueil, sans quoi « Neuer Kurs Kurs
// bearbeiten » lui semblait une répétition.

import { plural, type PluralForms, type Translations } from './space.js';

/** Les formes arabes selon le nombre (voir `plural`). Le code de la langue reste hors des textes. */
function arabic(count: number, forms: PluralForms): string {
	return plural('ar', count, forms);
}

interface CourseFormTexts {
	readonly newTitle: string;
	readonly intro: string;
	/** Le titre de la fiche, suivi du nom du cours. */
	readonly editHeading: string;
	readonly untitled: string;
	readonly submitNew: string;
	readonly submitEdit: string;
	readonly errorsTitle: string;
	/** Une phrase par erreur, que l'action nomme sans jamais l'écrire (voir `LISEZMOI.md`). */
	readonly errors: {
		readonly titleMissing: string;
		readonly teachingMissing: string;
		readonly weekdaysMissing: string;
		readonly datesMissing: string;
		readonly datesTwice: string;
		readonly startsOnMissing: string;
		readonly endsBeforeStarts: string;
		readonly timeMissing: string;
		readonly minutesAfter: string;
		readonly minutesBefore: string;
		readonly duration: string;
		/** Une valeur que le formulaire ne peut pas envoyer : une page trafiquée ou périmée. */
		readonly refused: string;
		readonly gone: string;
	};
	/** Les dates illisibles ou qui n'existent pas, telles que la personne les a écrites, et leur nombre. */
	readonly badDates: (list: string, count: number) => string;
	readonly required: string;
	readonly optional: string;
	readonly summary: {
		readonly title: string;
		readonly titleIn: (language: string) => string;
		readonly audience: string;
		readonly days: string;
		readonly dates: string;
		readonly badDates: string;
		readonly frequency: string;
		readonly time: string;
		readonly room: string;
		readonly teacher: string;
		readonly teachingLanguage: string;
		readonly startsOn: string;
		readonly endsOn: string;
		readonly status: string;
	};
	/** Ce que le résumé dit à la place d'une valeur qui manque. */
	readonly missing: {
		readonly title: string;
		readonly days: string;
		readonly dates: string;
		readonly time: string;
		readonly room: string;
		readonly teacher: string;
		readonly teachingLanguage: string;
		readonly startsOn: string;
	};
	readonly frequencies: {
		readonly weekly: string;
		readonly fortnightly: string;
		readonly monthly: string;
		readonly dates: string;
	};
	/** L'état d'un cours, dans le résumé et dans la liste de choix : ce qu'il change pour le public. */
	readonly statuses: {
		readonly draft: string;
		readonly published: string;
		readonly archived: string;
	};
	readonly textLegend: string;
	/** Le nom des onglets de langue, pour les lecteurs d'écran (`aria-label`). */
	readonly languageTabs: string;
	readonly sourceMark: string;
	readonly titleLabel: (language: string) => string;
	readonly titleHint: string;
	readonly descriptionLabel: (language: string) => string;
	readonly descriptionHint: string;
	readonly sourceLanguageLabel: string;
	readonly sourceLanguageHint: string;
	readonly audienceLegend: string;
	readonly audienceLabel: string;
	readonly teachingLegend: string;
	readonly teachingHint: string;
	readonly rhythmLegend: string;
	readonly recurrenceLabel: string;
	readonly recurrenceOptions: {
		readonly weekly: string;
		readonly monthly: string;
		readonly dates: string;
	};
	readonly weekdaysLegend: string;
	readonly intervalLabel: string;
	readonly intervalHint: string;
	readonly ordinalLabel: string;
	readonly ordinals: {
		readonly first: string;
		readonly second: string;
		readonly third: string;
		readonly fourth: string;
		readonly last: string;
	};
	readonly monthlyWeekdayLabel: string;
	readonly datesLabel: string;
	readonly datesHint: string;
	readonly timeLegend: string;
	readonly timingLabel: string;
	/** Retour C3 : l'heure fixe, après une prière, avant une prière. */
	readonly timingOptions: {
		readonly fixed: string;
		readonly prayer: string;
		readonly beforePrayer: string;
	};
	readonly timingHint: string;
	readonly startLabel: string;
	readonly endLabel: string;
	readonly timeHint: string;
	readonly prayerLabel: string;
	readonly minutesAfterLabel: string;
	readonly minutesBeforeLabel: string;
	readonly minutesAfterHint: string;
	readonly minutesBeforeHint: string;
	readonly durationLabel: string;
	readonly durationHint: string;
	readonly placeLegend: string;
	readonly roomLabel: string;
	readonly noRoom: string;
	readonly roomHint: string;
	readonly teacherLabel: string;
	readonly teacherHint: string;
	readonly startsOnLabel: string;
	readonly startsOnHint: string;
	readonly endsOnLabel: string;
	readonly endsOnHint: string;
	readonly statusLabel: string;
	readonly statusHint: string;
}

export const courseFormTexts: Translations<CourseFormTexts> = {
	fr: {
		newTitle: 'Nouveau cours',
		intro:
			'Remplissez les champs, puis enregistrez. Le résumé ci-dessous montre ce qui sera publié, et signale ce qui manque.',
		editHeading: 'Modifier le cours :',
		untitled: 'Cours sans titre',
		submitNew: 'Créer le cours',
		submitEdit: 'Enregistrer les modifications',
		errorsTitle: 'Le cours n’est pas enregistré. À corriger :',
		errors: {
			titleMissing: 'Écrivez le titre du cours dans la langue de saisie.',
			teachingMissing: 'Cochez au moins une langue d’enseignement.',
			weekdaysMissing: 'Choisissez au moins un jour de la semaine.',
			datesMissing: 'Écrivez au moins une date, une par ligne. Exemple : 12.10.2026',
			datesTwice: 'Une date est écrite deux fois.',
			startsOnMissing: 'Choisissez le premier jour du cours.',
			endsBeforeStarts: 'Le dernier jour vient avant le premier jour.',
			timeMissing: 'Indiquez l’heure de début et l’heure de fin. Exemple : 19:00 et 20:30',
			minutesAfter: 'Après une prière : de 0 à 240 minutes, en chiffres. Exemple : 15',
			minutesBefore: 'Avant une prière : de 1 à 120 minutes, en chiffres. Exemple : 10',
			duration: 'La durée va de 5 à 1440 minutes, en chiffres. Exemple : 90 pour 1 h 30',
			refused: 'Une valeur du formulaire n’est pas reconnue. Rechargez la page, puis recommencez.',
			gone: 'Ce cours n’existe plus : il a peut-être été supprimé.'
		},
		badDates: (list, count) =>
			count === 1
				? `Cette date n’est pas valable : ${list}. Écrivez chaque date comme ceci : 12.10.2026`
				: `Ces dates ne sont pas valables : ${list}. Écrivez chaque date comme ceci : 12.10.2026`,
		required: '(obligatoire)',
		optional: '(facultatif)',
		summary: {
			title: 'Résumé : ce qui sera publié',
			titleIn: (language) => `Titre en ${language} :`,
			audience: 'Public :',
			days: 'Jours :',
			dates: 'Dates :',
			badDates: 'Dates à corriger :',
			frequency: 'Fréquence :',
			time: 'Horaire :',
			room: 'Salle :',
			teacher: 'Intervenant :',
			teachingLanguage: 'Langue d’enseignement :',
			startsOn: 'Premier jour :',
			endsOn: 'Dernier jour :',
			status: 'État :'
		},
		missing: {
			title: 'pas encore écrit',
			days: 'pas choisis',
			dates: 'pas encore écrites',
			time: 'à indiquer',
			room: 'pas choisie',
			teacher: 'aucun pour l’instant',
			teachingLanguage: 'pas choisie',
			startsOn: 'pas choisi'
		},
		frequencies: {
			weekly: 'chaque semaine',
			fortnightly: 'une semaine sur deux',
			monthly: 'chaque mois',
			dates: 'à des dates précises'
		},
		statuses: {
			draft: 'brouillon, pas encore sur la page publique',
			published: 'publié, visible sur la page publique',
			archived: 'archivé, retiré de la page publique'
		},
		textLegend: 'Titre et description',
		languageTabs: 'Langue du texte',
		sourceMark: '(langue de saisie)',
		titleLabel: (language) => `Titre en ${language}`,
		titleHint: 'Le nom du cours sur la page publique. Exemple : Arabe pour débutants',
		descriptionLabel: (language) => `Description en ${language}`,
		descriptionHint: 'Quelques phrases : à qui s’adresse le cours, ce qu’on y apprend.',
		sourceLanguageLabel: 'Langue de saisie',
		sourceLanguageHint:
			'La langue dans laquelle vous écrivez. Le titre dans cette langue est obligatoire. Les autres langues sont facultatives, et rien n’est traduit automatiquement.',
		audienceLegend: 'Public et langue',
		audienceLabel: 'À qui s’adresse le cours ?',
		teachingLegend: 'Langue d’enseignement',
		teachingHint: 'La langue parlée pendant le cours. Cochez-en une ou plusieurs.',
		rhythmLegend: 'Jours et fréquence',
		recurrenceLabel: 'Le cours a lieu',
		recurrenceOptions: {
			weekly: 'chaque semaine, ou une semaine sur deux',
			monthly: 'une fois par mois',
			dates: 'à des dates précises'
		},
		weekdaysLegend: 'Jours',
		intervalLabel: 'Fréquence',
		intervalHint: 'Une semaine sur deux : la semaine du premier jour compte comme la première.',
		ordinalLabel: 'Quelle semaine du mois ?',
		ordinals: {
			first: 'la première',
			second: 'la deuxième',
			third: 'la troisième',
			fourth: 'la quatrième',
			last: 'la dernière'
		},
		monthlyWeekdayLabel: 'Quel jour de cette semaine ?',
		datesLabel: 'Dates, une par ligne',
		datesHint: 'Exemple : 12.10.2026',
		timeLegend: 'Horaire',
		timingLabel: 'Comment fixer l’heure ?',
		timingOptions: {
			fixed: 'heure fixe',
			prayer: 'après une prière',
			beforePrayer: 'avant une prière'
		},
		timingHint:
			'Placé par rapport à une prière, le cours suit son heure, qui change au fil de l’année.',
		startLabel: 'Heure de début',
		endLabel: 'Heure de fin',
		timeHint: 'Exemple : 19:00 et 20:30',
		prayerLabel: 'Quelle prière ?',
		minutesAfterLabel: 'Combien de minutes après la prière ?',
		minutesBeforeLabel: 'Combien de minutes avant la prière ?',
		minutesAfterHint: 'De 0 à 240. Exemple : 15. Avec 0, le cours commence juste après la prière.',
		minutesBeforeHint: 'De 1 à 120. Exemple : 10.',
		durationLabel: 'Durée du cours, en minutes',
		durationHint: 'De 5 à 1440. Exemple : 90 pour 1 h 30.',
		placeLegend: 'Lieu, intervenant et période',
		roomLabel: 'Salle',
		noRoom: 'aucune salle',
		roomHint: 'Les salles se créent dans les réglages, par une personne responsable.',
		teacherLabel: 'Intervenant',
		teacherHint: 'La personne qui donne le cours, par son nom ou sa fonction. Exemple : l’imam',
		startsOnLabel: 'Premier jour du cours',
		startsOnHint: 'Les séances commencent ce jour-là.',
		endsOnLabel: 'Dernier jour du cours',
		endsOnHint: 'Laissez vide si le cours continue sans date de fin.',
		statusLabel: 'Publication',
		statusHint: 'Un brouillon ne se voit que dans cet espace. Publiez le cours quand tout est prêt.'
	},
	de: {
		newTitle: 'Neuer Kurs',
		intro:
			'Füllen Sie die Felder aus und speichern Sie. Die Zusammenfassung unten zeigt, was veröffentlicht wird, und markiert, was fehlt.',
		editHeading: 'Kurs bearbeiten:',
		untitled: 'Kurs ohne Titel',
		submitNew: 'Kurs erstellen',
		submitEdit: 'Änderungen speichern',
		errorsTitle: 'Der Kurs ist nicht gespeichert. Bitte korrigieren:',
		errors: {
			titleMissing: 'Schreiben Sie den Titel des Kurses in der Eingabesprache.',
			teachingMissing: 'Kreuzen Sie mindestens eine Unterrichtssprache an.',
			weekdaysMissing: 'Wählen Sie mindestens einen Wochentag.',
			datesMissing: 'Schreiben Sie mindestens ein Datum, eines pro Zeile. Beispiel: 12.10.2026',
			datesTwice: 'Ein Datum ist zweimal eingetragen.',
			startsOnMissing: 'Wählen Sie den ersten Kurstag.',
			endsBeforeStarts: 'Der letzte Tag liegt vor dem ersten Tag.',
			timeMissing: 'Geben Sie die Anfangszeit und die Endzeit an. Beispiel: 19:00 und 20:30',
			minutesAfter: 'Nach einem Gebet: 0 bis 240 Minuten, in Ziffern. Beispiel: 15',
			minutesBefore: 'Vor einem Gebet: 1 bis 120 Minuten, in Ziffern. Beispiel: 10',
			duration:
				'Die Dauer beträgt 5 bis 1440 Minuten, in Ziffern. Beispiel: 90 für 1 Stunde 30 Minuten',
			refused:
				'Ein Wert des Formulars wird nicht erkannt. Laden Sie die Seite neu und versuchen Sie es noch einmal.',
			gone: 'Diesen Kurs gibt es nicht mehr. Vielleicht wurde er gelöscht.'
		},
		badDates: (list, count) =>
			count === 1
				? `Dieses Datum ist nicht gültig: ${list}. Schreiben Sie jedes Datum so: 12.10.2026`
				: `Diese Daten sind nicht gültig: ${list}. Schreiben Sie jedes Datum so: 12.10.2026`,
		required: '(Pflichtfeld)',
		optional: '(freiwillig)',
		summary: {
			title: 'Zusammenfassung: das wird veröffentlicht',
			titleIn: (language) => `Titel auf ${language}:`,
			audience: 'Zielgruppe:',
			days: 'Tage:',
			dates: 'Daten:',
			badDates: 'Zu korrigierende Daten:',
			frequency: 'Häufigkeit:',
			time: 'Zeit:',
			room: 'Raum:',
			teacher: 'Lehrperson:',
			teachingLanguage: 'Unterrichtssprache:',
			startsOn: 'Erster Tag:',
			endsOn: 'Letzter Tag:',
			status: 'Status:'
		},
		missing: {
			title: 'noch nicht geschrieben',
			days: 'nicht gewählt',
			dates: 'noch nicht eingetragen',
			time: 'noch nicht angegeben',
			room: 'kein Raum gewählt',
			teacher: 'nicht angegeben',
			teachingLanguage: 'keine gewählt',
			startsOn: 'nicht gewählt'
		},
		frequencies: {
			weekly: 'jede Woche',
			fortnightly: 'jede zweite Woche',
			monthly: 'jeden Monat',
			dates: 'an bestimmten Daten'
		},
		statuses: {
			draft: 'Entwurf, noch nicht auf der öffentlichen Seite',
			published: 'veröffentlicht, auf der öffentlichen Seite sichtbar',
			archived: 'archiviert, von der öffentlichen Seite entfernt'
		},
		textLegend: 'Titel und Beschreibung',
		languageTabs: 'Sprache des Textes',
		sourceMark: '(Eingabesprache)',
		titleLabel: (language) => `Titel auf ${language}`,
		titleHint: 'Der Name des Kurses auf der öffentlichen Seite. Beispiel: Arabisch für Anfänger',
		descriptionLabel: (language) => `Beschreibung auf ${language}`,
		descriptionHint: 'Ein paar Sätze: für wen der Kurs ist und was man dort lernt.',
		sourceLanguageLabel: 'Eingabesprache',
		sourceLanguageHint:
			'Die Sprache, in der Sie schreiben. Der Titel in dieser Sprache ist Pflicht. Die anderen Sprachen sind freiwillig, und nichts wird automatisch übersetzt.',
		audienceLegend: 'Zielgruppe und Sprache',
		audienceLabel: 'Für wen ist der Kurs?',
		teachingLegend: 'Unterrichtssprache',
		teachingHint: 'Die Sprache, die im Kurs gesprochen wird. Kreuzen Sie eine oder mehrere an.',
		rhythmLegend: 'Tage und Häufigkeit',
		recurrenceLabel: 'Der Kurs findet statt',
		recurrenceOptions: {
			weekly: 'jede Woche oder jede zweite Woche',
			monthly: 'einmal im Monat',
			dates: 'an bestimmten Daten'
		},
		weekdaysLegend: 'Tage',
		intervalLabel: 'Häufigkeit',
		intervalHint: 'Jede zweite Woche: Die Woche des ersten Tages zählt als erste Woche.',
		ordinalLabel: 'Welche Woche im Monat?',
		ordinals: {
			first: 'die erste',
			second: 'die zweite',
			third: 'die dritte',
			fourth: 'die vierte',
			last: 'die letzte'
		},
		monthlyWeekdayLabel: 'Welcher Tag in dieser Woche?',
		datesLabel: 'Daten, eines pro Zeile',
		datesHint: 'Beispiel: 12.10.2026',
		timeLegend: 'Zeit',
		timingLabel: 'Wie wird die Zeit festgelegt?',
		timingOptions: {
			fixed: 'feste Uhrzeit',
			prayer: 'nach einem Gebet',
			beforePrayer: 'vor einem Gebet'
		},
		timingHint:
			'Richtet sich der Kurs nach einem Gebet, folgt er dessen Zeit, die sich im Lauf des Jahres ändert.',
		startLabel: 'Beginn',
		endLabel: 'Ende',
		timeHint: 'Beispiel: 19:00 und 20:30',
		prayerLabel: 'Welches Gebet?',
		minutesAfterLabel: 'Wie viele Minuten nach dem Gebet?',
		minutesBeforeLabel: 'Wie viele Minuten vor dem Gebet?',
		minutesAfterHint: '0 bis 240. Beispiel: 15. Mit 0 beginnt der Kurs direkt nach dem Gebet.',
		minutesBeforeHint: '1 bis 120. Beispiel: 10.',
		durationLabel: 'Dauer des Kurses, in Minuten',
		durationHint: '5 bis 1440. Beispiel: 90 für 1 Stunde 30 Minuten.',
		placeLegend: 'Ort, Lehrperson und Zeitraum',
		roomLabel: 'Raum',
		noRoom: 'kein Raum',
		roomHint: 'Räume werden in den Einstellungen angelegt, von der Leitung.',
		teacherLabel: 'Lehrperson',
		teacherHint: 'Die Person, die den Kurs gibt, mit Namen oder Funktion. Beispiel: der Imam',
		startsOnLabel: 'Erster Kurstag',
		startsOnHint: 'An diesem Tag beginnen die Termine.',
		endsOnLabel: 'Letzter Kurstag',
		endsOnHint: 'Leer lassen, wenn der Kurs ohne Enddatum weiterläuft.',
		statusLabel: 'Veröffentlichung',
		statusHint:
			'Ein Entwurf ist nur in diesem Bereich sichtbar. Veröffentlichen Sie den Kurs, wenn alles bereit ist.'
	},
	it: {
		newTitle: 'Nuovo corso',
		intro:
			'Compila i campi, poi salva. Il riepilogo qui sotto mostra ciò che sarà pubblicato e segnala ciò che manca.',
		editHeading: 'Modifica il corso:',
		untitled: 'Corso senza titolo',
		submitNew: 'Crea il corso',
		submitEdit: 'Salva le modifiche',
		errorsTitle: 'Il corso non è stato salvato. Da correggere:',
		errors: {
			titleMissing: 'Scrivi il titolo del corso nella lingua di inserimento.',
			teachingMissing: 'Scegli almeno una lingua di insegnamento.',
			weekdaysMissing: 'Scegli almeno un giorno della settimana.',
			datesMissing: 'Scrivi almeno una data, una per riga. Esempio: 12.10.2026',
			datesTwice: 'Una data è scritta due volte.',
			startsOnMissing: 'Scegli il primo giorno del corso.',
			endsBeforeStarts: 'L’ultimo giorno viene prima del primo giorno.',
			timeMissing: 'Indica l’ora di inizio e l’ora di fine. Esempio: 19:00 e 20:30',
			minutesAfter: 'Dopo una preghiera: da 0 a 240 minuti, in cifre. Esempio: 15',
			minutesBefore: 'Prima di una preghiera: da 1 a 120 minuti, in cifre. Esempio: 10',
			duration: 'La durata va da 5 a 1440 minuti, in cifre. Esempio: 90 per 1 ora e 30 minuti',
			refused: 'Un valore del modulo non è riconosciuto. Ricarica la pagina e riprova.',
			gone: 'Questo corso non esiste più: forse è stato eliminato.'
		},
		badDates: (list, count) =>
			count === 1
				? `Questa data non è valida: ${list}. Scrivi ogni data così: 12.10.2026`
				: `Queste date non sono valide: ${list}. Scrivi ogni data così: 12.10.2026`,
		required: '(obbligatorio)',
		optional: '(facoltativo)',
		summary: {
			title: 'Riepilogo: ciò che sarà pubblicato',
			titleIn: (language) => `Titolo in ${language}:`,
			audience: 'Pubblico:',
			days: 'Giorni:',
			dates: 'Date:',
			badDates: 'Date da correggere:',
			frequency: 'Frequenza:',
			time: 'Orario:',
			room: 'Sala:',
			teacher: 'Insegnante:',
			teachingLanguage: 'Lingua di insegnamento:',
			startsOn: 'Primo giorno:',
			endsOn: 'Ultimo giorno:',
			status: 'Stato:'
		},
		missing: {
			title: 'non ancora scritto',
			days: 'non scelti',
			dates: 'non ancora scritte',
			time: 'non ancora indicato',
			room: 'non scelta',
			teacher: 'non indicato',
			teachingLanguage: 'non scelta',
			startsOn: 'non scelto'
		},
		frequencies: {
			weekly: 'ogni settimana',
			fortnightly: 'una settimana su due',
			monthly: 'ogni mese',
			dates: 'in date precise'
		},
		statuses: {
			draft: 'bozza, non ancora sulla pagina pubblica',
			published: 'pubblicato, visibile sulla pagina pubblica',
			archived: 'archiviato, tolto dalla pagina pubblica'
		},
		textLegend: 'Titolo e descrizione',
		languageTabs: 'Lingua del testo',
		sourceMark: '(lingua di inserimento)',
		titleLabel: (language) => `Titolo in ${language}`,
		titleHint: 'Il nome del corso sulla pagina pubblica. Esempio: Arabo per principianti',
		descriptionLabel: (language) => `Descrizione in ${language}`,
		descriptionHint: 'Qualche frase: a chi si rivolge il corso, che cosa si impara.',
		sourceLanguageLabel: 'Lingua di inserimento',
		sourceLanguageHint:
			'La lingua in cui scrivi. Il titolo in questa lingua è obbligatorio. Le altre lingue sono facoltative, e niente viene tradotto automaticamente.',
		audienceLegend: 'Pubblico e lingua',
		audienceLabel: 'A chi si rivolge il corso?',
		teachingLegend: 'Lingua di insegnamento',
		teachingHint: 'La lingua parlata durante il corso. Scegline una o più.',
		rhythmLegend: 'Giorni e frequenza',
		recurrenceLabel: 'Il corso si tiene',
		recurrenceOptions: {
			weekly: 'ogni settimana, o una settimana su due',
			monthly: 'una volta al mese',
			dates: 'in date precise'
		},
		weekdaysLegend: 'Giorni',
		intervalLabel: 'Frequenza',
		intervalHint: 'Una settimana su due: la settimana del primo giorno conta come la prima.',
		ordinalLabel: 'Quale settimana del mese?',
		ordinals: {
			first: 'la prima',
			second: 'la seconda',
			third: 'la terza',
			fourth: 'la quarta',
			last: 'l’ultima'
		},
		monthlyWeekdayLabel: 'Quale giorno di quella settimana?',
		datesLabel: 'Date, una per riga',
		datesHint: 'Esempio: 12.10.2026',
		timeLegend: 'Orario',
		timingLabel: 'Come fissare l’ora?',
		timingOptions: {
			fixed: 'ora fissa',
			prayer: 'dopo una preghiera',
			beforePrayer: 'prima di una preghiera'
		},
		timingHint: 'Legato a una preghiera, il corso ne segue l’orario, che cambia durante l’anno.',
		startLabel: 'Ora di inizio',
		endLabel: 'Ora di fine',
		timeHint: 'Esempio: 19:00 e 20:30',
		prayerLabel: 'Quale preghiera?',
		minutesAfterLabel: 'Quanti minuti dopo la preghiera?',
		minutesBeforeLabel: 'Quanti minuti prima della preghiera?',
		minutesAfterHint: 'Da 0 a 240. Esempio: 15. Con 0, il corso inizia subito dopo la preghiera.',
		minutesBeforeHint: 'Da 1 a 120. Esempio: 10.',
		durationLabel: 'Durata del corso, in minuti',
		durationHint: 'Da 5 a 1440. Esempio: 90 per 1 ora e 30 minuti.',
		placeLegend: 'Luogo, insegnante e periodo',
		roomLabel: 'Sala',
		noRoom: 'nessuna sala',
		roomHint: 'Le sale si creano nelle impostazioni, da una persona responsabile.',
		teacherLabel: 'Insegnante',
		teacherHint: 'La persona che tiene il corso, con il nome o il ruolo. Esempio: l’imam',
		startsOnLabel: 'Primo giorno del corso',
		startsOnHint: 'Le lezioni iniziano quel giorno.',
		endsOnLabel: 'Ultimo giorno del corso',
		endsOnHint: 'Lascia vuoto se il corso continua senza data di fine.',
		statusLabel: 'Pubblicazione',
		statusHint: 'Una bozza si vede solo in quest’area. Pubblica il corso quando tutto è pronto.'
	},
	en: {
		newTitle: 'New course',
		intro:
			'Fill in the fields, then save. The summary below shows what will be published and flags anything missing.',
		editHeading: 'Edit course:',
		untitled: 'Untitled course',
		submitNew: 'Create the course',
		submitEdit: 'Save changes',
		errorsTitle: 'The course has not been saved. To correct:',
		errors: {
			titleMissing: 'Write the title of the course in the input language.',
			teachingMissing: 'Tick at least one teaching language.',
			weekdaysMissing: 'Choose at least one day of the week.',
			datesMissing: 'Write at least one date, one per line. Example: 12.10.2026',
			datesTwice: 'A date is written twice.',
			startsOnMissing: 'Choose the first day of the course.',
			endsBeforeStarts: 'The last day comes before the first day.',
			timeMissing: 'Enter the start time and the end time. Example: 19:00 and 20:30',
			minutesAfter: 'After a prayer: from 0 to 240 minutes, in figures. Example: 15',
			minutesBefore: 'Before a prayer: from 1 to 120 minutes, in figures. Example: 10',
			duration:
				'The duration is from 5 to 1440 minutes, in figures. Example: 90 for 1 hour 30 minutes',
			refused: 'A value in the form is not recognised. Reload the page, then try again.',
			gone: 'This course no longer exists. It may have been deleted.'
		},
		badDates: (list, count) =>
			count === 1
				? `This date is not valid: ${list}. Write each date like this: 12.10.2026`
				: `These dates are not valid: ${list}. Write each date like this: 12.10.2026`,
		required: '(required)',
		optional: '(optional)',
		summary: {
			title: 'Summary: what will be published',
			titleIn: (language) => `Title in ${language}:`,
			audience: 'Audience:',
			days: 'Days:',
			dates: 'Dates:',
			badDates: 'Dates to correct:',
			frequency: 'Frequency:',
			time: 'Time:',
			room: 'Room:',
			teacher: 'Teacher:',
			teachingLanguage: 'Teaching language:',
			startsOn: 'First day:',
			endsOn: 'Last day:',
			status: 'Status:'
		},
		missing: {
			title: 'not written yet',
			days: 'none chosen',
			dates: 'not written yet',
			time: 'not given yet',
			room: 'none chosen',
			teacher: 'not given',
			teachingLanguage: 'none chosen',
			startsOn: 'not chosen yet'
		},
		frequencies: {
			weekly: 'every week',
			fortnightly: 'every other week',
			monthly: 'every month',
			dates: 'on specific dates'
		},
		statuses: {
			draft: 'draft, not yet on the public page',
			published: 'published, visible on the public page',
			archived: 'archived, removed from the public page'
		},
		textLegend: 'Title and description',
		languageTabs: 'Language of the text',
		sourceMark: '(input language)',
		titleLabel: (language) => `Title in ${language}`,
		titleHint: 'The name of the course on the public page. Example: Arabic for beginners',
		descriptionLabel: (language) => `Description in ${language}`,
		descriptionHint: 'A few sentences: who the course is for, and what people learn there.',
		sourceLanguageLabel: 'Input language',
		sourceLanguageHint:
			'The language you write in. The title in this language is required. The other languages are optional, and nothing is translated automatically.',
		audienceLegend: 'Audience and language',
		audienceLabel: 'Who is the course for?',
		teachingLegend: 'Teaching language',
		teachingHint: 'The language spoken during the course. Tick one or more.',
		rhythmLegend: 'Days and frequency',
		recurrenceLabel: 'The course takes place',
		recurrenceOptions: {
			weekly: 'every week, or every other week',
			monthly: 'once a month',
			dates: 'on specific dates'
		},
		weekdaysLegend: 'Days',
		intervalLabel: 'Frequency',
		intervalHint: 'Every other week: the week of the first day counts as the first week.',
		ordinalLabel: 'Which week of the month?',
		ordinals: {
			first: 'the first',
			second: 'the second',
			third: 'the third',
			fourth: 'the fourth',
			last: 'the last'
		},
		monthlyWeekdayLabel: 'Which day of that week?',
		datesLabel: 'Dates, one per line',
		datesHint: 'Example: 12.10.2026',
		timeLegend: 'Time',
		timingLabel: 'How is the time set?',
		timingOptions: {
			fixed: 'fixed time',
			prayer: 'after a prayer',
			beforePrayer: 'before a prayer'
		},
		timingHint:
			'When it is set by a prayer, the course follows the time of that prayer, which changes through the year.',
		startLabel: 'Start time',
		endLabel: 'End time',
		timeHint: 'Example: 19:00 and 20:30',
		prayerLabel: 'Which prayer?',
		minutesAfterLabel: 'How many minutes after the prayer?',
		minutesBeforeLabel: 'How many minutes before the prayer?',
		minutesAfterHint:
			'From 0 to 240. Example: 15. With 0, the course starts right after the prayer.',
		minutesBeforeHint: 'From 1 to 120. Example: 10.',
		durationLabel: 'Length of the course, in minutes',
		durationHint: 'From 5 to 1440. Example: 90 for 1 hour 30 minutes.',
		placeLegend: 'Place, teacher and period',
		roomLabel: 'Room',
		noRoom: 'no room',
		roomHint: 'Rooms are created in the settings, by a manager.',
		teacherLabel: 'Teacher',
		teacherHint: 'The person who gives the course, by name or role. Example: the imam',
		startsOnLabel: 'First day of the course',
		startsOnHint: 'Sessions start on that day.',
		endsOnLabel: 'Last day of the course',
		endsOnHint: 'Leave empty if the course goes on with no end date.',
		statusLabel: 'Publication',
		statusHint: 'A draft is only visible in this area. Publish the course when everything is ready.'
	},
	ar: {
		newTitle: 'درس جديد',
		intro: 'املأ الحقول ثم احفظ. يعرض الملخص أدناه ما سيُنشر، ويشير إلى ما ينقص.',
		editHeading: 'تعديل الدرس:',
		untitled: 'درس بلا عنوان',
		submitNew: 'إنشاء الدرس',
		submitEdit: 'حفظ التعديلات',
		errorsTitle: 'لم يُحفظ الدرس. يجب تصحيح ما يلي:',
		errors: {
			titleMissing: 'اكتب عنوان الدرس بلغة الإدخال.',
			teachingMissing: 'اختر لغة تدريس أو أكثر.',
			weekdaysMissing: 'اختر يومًا من أيام الأسبوع أو أكثر.',
			datesMissing: 'اكتب تاريخًا أو أكثر، تاريخًا في كل سطر. مثال: 12.10.2026',
			datesTwice: 'هناك تاريخ مكتوب مرتين.',
			startsOnMissing: 'اختر اليوم الأول للدرس.',
			endsBeforeStarts: 'اليوم الأخير يأتي قبل اليوم الأول.',
			timeMissing: 'أدخل وقت البداية ووقت النهاية. مثال: 19:00 و20:30',
			minutesAfter: 'بعد صلاة: من 0 إلى 240 دقيقة، بالأرقام. مثال: 15',
			minutesBefore: 'قبل صلاة: من 1 إلى 120 دقيقة، بالأرقام. مثال: 10',
			duration: 'المدة من 5 إلى 1440 دقيقة، بالأرقام. مثال: 90 لساعة ونصف',
			refused: 'إحدى قيم النموذج غير معروفة. أعد تحميل الصفحة، ثم حاول مرة أخرى.',
			gone: 'هذا الدرس لم يعد موجودًا. ربما حُذف.'
		},
		// Le singulier, le duel, puis le pluriel d'un nom de chose, accordé au féminin singulier.
		badDates: (list, count) =>
			arabic(count, {
				one: `هذا التاريخ غير صالح: ${list}. اكتب كل تاريخ هكذا: 12.10.2026`,
				two: `هذان التاريخان غير صالحين: ${list}. اكتب كل تاريخ هكذا: 12.10.2026`,
				other: `هذه التواريخ غير صالحة: ${list}. اكتب كل تاريخ هكذا: 12.10.2026`
			}),
		required: '(إلزامي)',
		optional: '(اختياري)',
		summary: {
			title: 'الملخص: ما سيُنشر',
			titleIn: (language) => `العنوان ب${language}:`,
			audience: 'الفئة:',
			days: 'الأيام:',
			dates: 'التواريخ:',
			badDates: 'تواريخ يجب تصحيحها:',
			frequency: 'التكرار:',
			time: 'الوقت:',
			room: 'القاعة:',
			teacher: 'المدرّس:',
			teachingLanguage: 'لغة التدريس:',
			startsOn: 'اليوم الأول:',
			endsOn: 'اليوم الأخير:',
			status: 'الحالة:'
		},
		missing: {
			title: 'لم يُكتب بعد',
			days: 'لم تُختر بعد',
			dates: 'لم تُكتب بعد',
			time: 'لم يُحدَّد بعد',
			room: 'لم تُختر',
			teacher: 'لم يُذكر',
			teachingLanguage: 'لم تُختر',
			startsOn: 'لم يُختر بعد'
		},
		frequencies: {
			weekly: 'كل أسبوع',
			fortnightly: 'كل أسبوعين',
			monthly: 'كل شهر',
			dates: 'في تواريخ محددة'
		},
		statuses: {
			draft: 'مسودة، ليست على الصفحة العامة بعد',
			published: 'منشور، ظاهر على الصفحة العامة',
			archived: 'في المحفوظات، أُزيل من الصفحة العامة'
		},
		textLegend: 'العنوان والوصف',
		languageTabs: 'لغة النص',
		sourceMark: '(لغة الإدخال)',
		titleLabel: (language) => `العنوان ب${language}`,
		titleHint: 'اسم الدرس على الصفحة العامة. مثال: العربية للمبتدئين',
		descriptionLabel: (language) => `الوصف ب${language}`,
		descriptionHint: 'بضع جمل: لمن الدرس، وماذا يتعلم فيه المشاركون.',
		sourceLanguageLabel: 'لغة الإدخال',
		sourceLanguageHint:
			'اللغة التي تكتب بها. العنوان بهذه اللغة إلزامي. اللغات الأخرى اختيارية، ولا يُترجم شيء تلقائيًا.',
		audienceLegend: 'الفئة واللغة',
		audienceLabel: 'لمن هذا الدرس؟',
		teachingLegend: 'لغة التدريس',
		teachingHint: 'اللغة المستعملة خلال الدرس. اختر لغة واحدة أو أكثر.',
		rhythmLegend: 'الأيام والتكرار',
		recurrenceLabel: 'يُقام الدرس',
		recurrenceOptions: {
			weekly: 'كل أسبوع، أو كل أسبوعين',
			monthly: 'مرة في الشهر',
			dates: 'في تواريخ محددة'
		},
		weekdaysLegend: 'الأيام',
		intervalLabel: 'التكرار',
		intervalHint: 'كل أسبوعين: أسبوع اليوم الأول هو الأسبوع الأول.',
		ordinalLabel: 'أي أسبوع من الشهر؟',
		ordinals: {
			first: 'الأول',
			second: 'الثاني',
			third: 'الثالث',
			fourth: 'الرابع',
			last: 'الأخير'
		},
		monthlyWeekdayLabel: 'أي يوم من ذلك الأسبوع؟',
		datesLabel: 'التواريخ، تاريخ في كل سطر',
		datesHint: 'مثال: 12.10.2026',
		timeLegend: 'الوقت',
		timingLabel: 'كيف يُحدَّد الوقت؟',
		timingOptions: {
			fixed: 'وقت ثابت',
			prayer: 'بعد صلاة',
			beforePrayer: 'قبل صلاة'
		},
		timingHint: 'إذا رُبط الدرس بصلاة، فإنه يتبع وقتها الذي يتغير على مدار السنة.',
		startLabel: 'وقت البداية',
		endLabel: 'وقت النهاية',
		timeHint: 'مثال: 19:00 و20:30',
		prayerLabel: 'أي صلاة؟',
		minutesAfterLabel: 'كم دقيقة بعد الصلاة؟',
		minutesBeforeLabel: 'كم دقيقة قبل الصلاة؟',
		minutesAfterHint: 'من 0 إلى 240. مثال: 15. مع 0 يبدأ الدرس فور انتهاء الصلاة.',
		minutesBeforeHint: 'من 1 إلى 120. مثال: 10.',
		durationLabel: 'مدة الدرس بالدقائق',
		durationHint: 'من 5 إلى 1440. مثال: 90 لساعة ونصف.',
		placeLegend: 'المكان والمدرّس والفترة',
		roomLabel: 'القاعة',
		noRoom: 'بلا قاعة',
		roomHint: 'تُنشأ القاعات في الإعدادات، من قِبل مسؤول.',
		teacherLabel: 'المدرّس',
		teacherHint: 'الشخص الذي يقدّم الدرس، باسمه أو بصفته. مثال: الإمام',
		startsOnLabel: 'اليوم الأول للدرس',
		startsOnHint: 'تبدأ الحصص في هذا اليوم.',
		endsOnLabel: 'اليوم الأخير للدرس',
		endsOnHint: 'اتركه فارغًا إذا استمر الدرس دون تاريخ نهاية.',
		statusLabel: 'النشر',
		statusHint: 'المسودة لا تظهر إلا في هذه المساحة. انشر الدرس عندما يصبح كل شيء جاهزًا.'
	}
};

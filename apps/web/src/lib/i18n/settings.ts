// Les textes de l'écran « Réglages » (`/reglages`) : l'organisation telle que le public la voit, ses
// salles, et les heures de prière (étape 18, retours B1 et D2). Les noms des langues viennent de
// `public/affichage.ts`, par `languageLabel` de `format.ts`.
//
// L'ordre des clés compte pour le correcteur, qui relit les textes d'une langue à la suite : deux
// textes voisins qui finissent et commencent par les mêmes mots passent pour une répétition. Les
// boutons des heures de prière viennent donc après leurs messages.

import { plural, type PluralForms, type Translations } from './space.js';

/**
 * Les valeurs qu'on tape ou qu'on choisit telles quelles, pareilles dans toutes les langues : des noms
 * de fuseau horaire, un code de couleur, une salutation. Ce ne sont pas des mots de la phrase qui les
 * cite.
 *
 * Les trois fuseaux ont toujours l'heure de la plus grande partie de l'Europe. Une ville dont le nom
 * est un alias (Oslo, Amsterdam, Vaduz…) n'est pas dans la liste, parce que le flux agenda refuse les
 * alias : l'aide dit d'en prendre une à la même heure, avec la phrase du super-admin.
 */
const [SWISS_ZONE, PARIS_ZONE, BERLIN_ZONE] = [
	'Europe/Zurich',
	'Europe/Paris',
	'Europe/Berlin'
] as const;
const COLOUR_SAMPLE = '#0f766e';
const GREETING_SAMPLE = 'Assalamu alaykum';

/** Les formes arabes selon le nombre (voir `plural`). Le code de la langue reste hors des textes. */
function arabic(count: number, forms: PluralForms): string {
	return plural('ar', count, forms);
}

/**
 * Un rapport de contraste, à un chiffre après la virgule, avec une virgule : le français, l'italien
 * et l'allemand de Suisse l'écrivent ainsi hors des montants.
 */
function withComma(ratio: number): string {
	return ratio.toFixed(1).replace('.', ',');
}

/** Le même rapport, avec le point de l'anglais et de l'arabe en chiffres latins. */
function withPoint(ratio: number): string {
	return ratio.toFixed(1);
}

interface SettingsTexts {
	readonly title: string;
	readonly intro: string;
	readonly saved: string;
	readonly nameLabel: string;
	readonly nameHelp: string;
	readonly timeZoneLabel: string;
	readonly timeZoneHelp: string;
	/** Quoi choisir quand la ville de l'organisation n'est pas dans la liste (celle du super-admin). */
	readonly timeZoneNotListed: string;
	/**
	 * Un fuseau enregistré avant la liste, qu'elle ne propose pas (un alias, ou un `Etc/`) : la liste
	 * le montre, choisi, pour qu'un enregistrement ne le change pas sans le dire. Le flux agenda marche
	 * avec lui : il ramène un alias au fuseau canonique vers lequel il pointe.
	 */
	readonly timeZoneKept: (zone: string) => string;
	readonly timeZoneEurope: string;
	readonly timeZoneWorld: string;
	readonly colourLabel: string;
	readonly colourPreview: string;
	/** Le contraste du texte posé sur la couleur choisie, écrit à la façon de chaque langue. */
	readonly colourContrast: (ratio: number) => string;
	readonly colourHelp: string;
	readonly greetingLabel: string;
	readonly greetingHelp: string;
	readonly languagesLegend: string;
	readonly languagesHelp: string;
	readonly defaultLanguageLabel: string;
	readonly defaultLanguageHelp: string;
	readonly save: string;
	readonly roomsTitle: string;
	readonly roomsIntro: string;
	readonly roomsNone: string;
	/** Les cours qui occupent une salle, et ce que sa suppression leur fera. */
	readonly roomCourses: (count: number) => string;
	/** Les prières du vendredi qui occupent une salle, et ce que sa suppression leur fera. */
	readonly roomFridays: (count: number) => string;
	readonly deleteRoom: string;
	readonly newRoomLabel: string;
	readonly newRoomHelp: string;
	readonly addRoom: string;
	readonly roomAdded: string;
	readonly roomDeleted: string;
	/** Devant le nom de la salle, quand l'écran demande de confirmer sa suppression. */
	readonly confirmIntro: string;
	readonly nothingElse: string;
	readonly confirmDelete: string;
	readonly keepRoom: string;
	readonly prayerTitle: string;
	readonly prayerOn: string;
	readonly prayerOnKeep: string;
	readonly prayerOff: string;
	readonly turnedOn: string;
	readonly turnedOff: string;
	readonly turnOn: string;
	readonly turnOff: string;
	readonly errors: {
		readonly nameRequired: string;
		readonly colour: string;
		readonly greetingRequired: string;
		readonly noLanguage: string;
		readonly defaultNotEnabled: string;
		readonly timeZone: string;
		readonly gone: string;
		readonly roomNameRequired: string;
		readonly prayerStillUsed: string;
	};
}

export const settingsTexts: Translations<SettingsTexts> = {
	fr: {
		title: 'Réglages',
		intro:
			'Ce que votre organisation montre au public : son nom, sa couleur, ses langues et ses salles.',
		saved: 'Réglages enregistrés.',
		nameLabel: 'Nom de l’organisation',
		nameHelp: 'Votre page publique l’affiche tout en haut.',
		timeZoneLabel: 'Fuseau horaire',
		timeZoneHelp: `L’heure de vos cours en dépend. En Suisse, choisissez ${SWISS_ZONE}.`,
		timeZoneNotListed: `Si la ville de l’organisation n’est pas dans la liste, choisissez une ville qui a toujours la même heure qu’elle. Pour la plus grande partie de l’Europe : ${SWISS_ZONE}, ${PARIS_ZONE} ou ${BERLIN_ZONE}.`,
		timeZoneKept: (zone) =>
			`Votre fuseau actuel, ${zone}, ne fait pas partie de la liste. Il est gardé tant que vous n’en choisissez pas un autre.`,
		timeZoneEurope: 'Europe',
		timeZoneWorld: 'Reste du monde',
		colourLabel: 'Couleur de votre page',
		colourPreview: 'Exemple de bouton',
		colourContrast: (ratio) =>
			`Contraste du texte sur cette couleur : ${withComma(ratio)} pour 1. Il se lit bien à partir de 4,5 pour 1.`,
		colourHelp:
			'Elle sert de fond sur votre page publique, dans le programme collé sur votre site et ici. Le texte posé dessus s’écrit en noir ou en blanc pour rester lisible : toutes les couleurs sont acceptées.',
		greetingLabel: 'Formule d’accueil des messages',
		greetingHelp: `Les premiers mots des messages prêts à coller que vous envoyez à votre communauté. Exemple : ${GREETING_SAMPLE}`,
		languagesLegend: 'Langues de votre page publique',
		languagesHelp:
			'Votre page publique, et le programme collé sur votre site, se lisent dans les langues cochées. Chaque visiteur choisit la sienne.',
		defaultLanguageLabel: 'Langue par défaut',
		defaultLanguageHelp:
			'La langue de votre page publique à la première visite. Elle doit faire partie des langues cochées.',
		save: 'Enregistrer',
		roomsTitle: 'Salles',
		roomsIntro:
			'Les salles de vos cours. Un cours peut indiquer sa salle, mais ce n’est pas obligatoire.',
		roomsNone: 'Aucune salle pour le moment.',
		roomCourses: (count) =>
			count === 1
				? 'Un cours utilise cette salle ; il n’aura plus de salle si vous la supprimez.'
				: `${count} cours utilisent cette salle ; ils n’auront plus de salle si vous la supprimez.`,
		roomFridays: (count) =>
			count === 1
				? 'Une prière du vendredi utilise cette salle ; elle n’aura plus de salle si vous la supprimez.'
				: `${count} prières du vendredi utilisent cette salle ; elles n’auront plus de salle si vous la supprimez.`,
		deleteRoom: 'Supprimer',
		newRoomLabel: 'Nouvelle salle',
		newRoomHelp: 'Exemple : Grande salle',
		addRoom: 'Ajouter',
		roomAdded: 'Salle ajoutée.',
		roomDeleted: 'Salle supprimée.',
		confirmIntro: 'Vous allez supprimer cette salle :',
		nothingElse: 'Rien d’autre ne change dans votre programme.',
		confirmDelete: 'Supprimer la salle',
		keepRoom: 'Garder la salle',
		prayerTitle: 'Heures de prière',
		prayerOn:
			'Les heures de prière sont activées. Votre espace montre les heures de prière et la prière du vendredi, l’heure d’un cours peut se régler sur une prière, et votre page publique les affiche.',
		prayerOnKeep:
			'Les désactiver n’efface rien : vos horaires, vos fichiers importés et vos prières du vendredi restent, et tout revient si vous les activez de nouveau.',
		prayerOff:
			'Les heures de prière sont désactivées. Activez-les si votre organisation publie des heures de prière, une iqama ou une prière du vendredi, ou si l’heure d’un cours dépend d’une prière.',
		turnedOn: 'Les heures de prière sont activées.',
		turnedOff: 'Les heures de prière sont désactivées.',
		turnOn: 'Activer les heures de prière',
		turnOff: 'Désactiver les heures de prière',
		errors: {
			nameRequired: 'Écrivez le nom de l’organisation.',
			colour: `Cette couleur n’est pas valable. Elle s’écrit # suivi de six chiffres ou lettres, par exemple ${COLOUR_SAMPLE}.`,
			greetingRequired: `Écrivez une formule d’accueil, par exemple ${GREETING_SAMPLE}.`,
			noLanguage: 'Cochez au moins une langue pour votre page publique.',
			defaultNotEnabled: 'La langue par défaut doit faire partie des langues cochées.',
			timeZone: 'Choisissez le fuseau horaire dans la liste.',
			gone: 'Cette organisation n’existe plus.',
			roomNameRequired: 'Écrivez le nom de la salle.',
			prayerStillUsed:
				'L’heure de certains cours se règle sur une prière, ou une prière du vendredi existe. Donnez à ces cours une heure fixe ou supprimez-les avant de désactiver les heures de prière.'
		}
	},
	de: {
		title: 'Einstellungen',
		intro:
			'Was Ihre Organisation der Öffentlichkeit zeigt: ihren Namen, ihre Farbe, ihre Sprachen und ihre Räume.',
		saved: 'Einstellungen gespeichert.',
		nameLabel: 'Name der Organisation',
		nameHelp: 'Er erscheint oben auf Ihrer öffentlichen Seite.',
		timeZoneLabel: 'Zeitzone',
		timeZoneHelp: `Sie bestimmt die Uhrzeit Ihrer Kurse. In der Schweiz wählen Sie ${SWISS_ZONE}.`,
		timeZoneNotListed: `Steht der Ort der Organisation nicht in der Liste, wählen Sie eine Stadt, in der immer die gleiche Uhrzeit gilt wie dort. Für den grössten Teil Europas: ${SWISS_ZONE}, ${PARIS_ZONE} oder ${BERLIN_ZONE}.`,
		timeZoneKept: (zone) =>
			`Ihre aktuelle Zeitzone, ${zone}, steht nicht in der Liste. Sie bleibt erhalten, solange Sie keine andere wählen.`,
		timeZoneEurope: 'Europa',
		timeZoneWorld: 'Übrige Welt',
		colourLabel: 'Farbe Ihrer Seite',
		colourPreview: 'Beispiel für eine Schaltfläche',
		colourContrast: (ratio) =>
			`Kontrast des Textes auf dieser Farbe: ${withComma(ratio)} zu 1. Ab 4,5 zu 1 ist er gut lesbar.`,
		colourHelp:
			'Sie dient als Hintergrund auf Ihrer öffentlichen Seite, im Programm auf Ihrer Website und hier. Der Text darauf wird schwarz oder weiss geschrieben, damit er lesbar bleibt: Jede Farbe ist erlaubt.',
		greetingLabel: 'Grussformel der Nachrichten',
		greetingHelp: `Die ersten Worte der vorbereiteten Nachrichten, die Sie an Ihre Gemeinschaft schicken. Beispiel: ${GREETING_SAMPLE}`,
		languagesLegend: 'Sprachen Ihrer öffentlichen Seite',
		languagesHelp:
			'Ihre öffentliche Seite und das Programm auf Ihrer Website sind in den angekreuzten Sprachen lesbar. Wer sie besucht, wählt die eigene Sprache.',
		defaultLanguageLabel: 'Standardsprache',
		defaultLanguageHelp:
			'Die Sprache Ihrer öffentlichen Seite beim ersten Besuch. Sie muss zu den angekreuzten Sprachen gehören.',
		save: 'Speichern',
		roomsTitle: 'Räume',
		roomsIntro:
			'Die Räume, in denen Ihre Kurse stattfinden. Ein Kurs kann seinen Raum angeben, muss aber nicht.',
		roomsNone: 'Noch keine Räume.',
		roomCourses: (count) =>
			count === 1
				? 'Ein Kurs nutzt diesen Raum. Wenn Sie den Raum löschen, hat der Kurs keinen Raum mehr.'
				: `${count} Kurse nutzen diesen Raum. Wenn Sie den Raum löschen, haben diese Kurse keinen Raum mehr.`,
		roomFridays: (count) =>
			count === 1
				? 'Ein Freitagsgebet nutzt diesen Raum. Wenn Sie den Raum löschen, hat es keinen Raum mehr.'
				: `${count} Freitagsgebete nutzen diesen Raum. Wenn Sie den Raum löschen, haben sie keinen Raum mehr.`,
		deleteRoom: 'Löschen',
		newRoomLabel: 'Neuer Raum',
		newRoomHelp: 'Beispiel: Grosser Saal',
		addRoom: 'Hinzufügen',
		roomAdded: 'Raum hinzugefügt.',
		roomDeleted: 'Raum gelöscht.',
		confirmIntro: 'Sie sind dabei, diesen Raum zu löschen:',
		nothingElse: 'Sonst ändert sich nichts an Ihrem Programm.',
		confirmDelete: 'Raum löschen',
		keepRoom: 'Raum behalten',
		prayerTitle: 'Gebetszeiten',
		prayerOn:
			'Die Gebetszeiten sind aktiviert. Ihr Bereich zeigt die Gebetszeiten und das Freitagsgebet, die Uhrzeit eines Kurses kann sich nach einem Gebet richten, und Ihre öffentliche Seite zeigt sie an.',
		prayerOnKeep:
			'Das Deaktivieren löscht nichts: Ihre Zeiten, Ihre importierten Dateien und Ihre Freitagsgebete bleiben, und alles ist wieder da, wenn Sie sie erneut aktivieren.',
		prayerOff:
			'Die Gebetszeiten sind deaktiviert. Aktivieren Sie sie, wenn Ihre Organisation Gebetszeiten, eine Iqama oder ein Freitagsgebet veröffentlicht, oder wenn die Uhrzeit eines Kurses von einem Gebet abhängt.',
		turnedOn: 'Die Gebetszeiten sind aktiviert.',
		turnedOff: 'Die Gebetszeiten sind deaktiviert.',
		turnOn: 'Gebetszeiten aktivieren',
		turnOff: 'Gebetszeiten deaktivieren',
		errors: {
			nameRequired: 'Schreiben Sie den Namen der Organisation.',
			colour: `Diese Farbe ist ungültig. Sie wird mit # und sechs Ziffern oder Buchstaben geschrieben, zum Beispiel ${COLOUR_SAMPLE}.`,
			greetingRequired: `Schreiben Sie eine Grussformel, zum Beispiel ${GREETING_SAMPLE}.`,
			noLanguage: 'Kreuzen Sie mindestens eine Sprache für Ihre öffentliche Seite an.',
			defaultNotEnabled: 'Die Standardsprache muss zu den angekreuzten Sprachen gehören.',
			timeZone: 'Wählen Sie die Zeitzone aus der Liste.',
			gone: 'Diese Organisation gibt es nicht mehr.',
			roomNameRequired: 'Schreiben Sie den Namen des Raums.',
			prayerStillUsed:
				'Die Uhrzeit mancher Kurse richtet sich nach einem Gebet, oder es gibt ein Freitagsgebet. Geben Sie diesen Kursen eine feste Uhrzeit oder löschen Sie sie, bevor Sie die Gebetszeiten deaktivieren.'
		}
	},
	it: {
		title: 'Impostazioni',
		intro:
			'Ciò che la tua organizzazione mostra al pubblico: il nome, il colore, le lingue e le sale.',
		saved: 'Impostazioni salvate.',
		nameLabel: 'Nome dell’organizzazione',
		nameHelp: 'Compare in alto sulla tua pagina pubblica.',
		timeZoneLabel: 'Fuso orario',
		timeZoneHelp: `Dà l’ora dei tuoi corsi. In Svizzera scegli ${SWISS_ZONE}.`,
		timeZoneNotListed: `Se la città dell’organizzazione non è nella lista, scegli una città che abbia sempre la stessa ora di quella dell’organizzazione. Per la maggior parte dell’Europa: ${SWISS_ZONE}, ${PARIS_ZONE} o ${BERLIN_ZONE}.`,
		timeZoneKept: (zone) =>
			`Il tuo fuso orario attuale, ${zone}, non è nella lista. Resta tale finché non ne scegli un altro.`,
		timeZoneEurope: 'Europa',
		timeZoneWorld: 'Resto del mondo',
		colourLabel: 'Colore della tua pagina',
		colourPreview: 'Esempio di pulsante',
		colourContrast: (ratio) =>
			`Contrasto del testo su questo colore: ${withComma(ratio)} a 1. Si legge bene da 4,5 a 1 in su.`,
		colourHelp:
			'Fa da sfondo sulla tua pagina pubblica, nel programma incollato sul tuo sito e qui. Il testo sopra è scritto in nero o in bianco per restare leggibile: tutti i colori sono accettati.',
		greetingLabel: 'Formula di saluto dei messaggi',
		greetingHelp: `Le prime parole dei messaggi pronti da incollare che mandi alla tua comunità. Esempio: ${GREETING_SAMPLE}`,
		languagesLegend: 'Lingue della tua pagina pubblica',
		languagesHelp:
			'La tua pagina pubblica e il programma incollato sul tuo sito si leggono nelle lingue selezionate. Ogni visitatore sceglie la sua.',
		defaultLanguageLabel: 'Lingua predefinita',
		defaultLanguageHelp:
			'La lingua della tua pagina pubblica alla prima visita. Deve essere tra le lingue selezionate.',
		save: 'Salva',
		roomsTitle: 'Sale',
		roomsIntro:
			'Le sale dove si tengono i tuoi corsi. Un corso può indicare la sua sala, ma non è obbligatorio.',
		roomsNone: 'Ancora nessuna sala.',
		roomCourses: (count) =>
			count === 1
				? 'Un corso usa questa sala; se la elimini, resterà senza sala.'
				: `${count} corsi usano questa sala; se la elimini, resteranno senza sala.`,
		roomFridays: (count) =>
			count === 1
				? 'Una preghiera del venerdì usa questa sala; se la elimini, resterà senza sala.'
				: `${count} preghiere del venerdì usano questa sala; se la elimini, resteranno senza sala.`,
		deleteRoom: 'Elimina',
		newRoomLabel: 'Nuova sala',
		newRoomHelp: 'Esempio: Sala grande',
		addRoom: 'Aggiungi',
		roomAdded: 'Sala aggiunta.',
		roomDeleted: 'Sala eliminata.',
		confirmIntro: 'Stai per eliminare questa sala:',
		nothingElse: 'Nient’altro cambia nel tuo programma.',
		confirmDelete: 'Elimina la sala',
		keepRoom: 'Tieni la sala',
		prayerTitle: 'Orari di preghiera',
		prayerOn:
			'Gli orari di preghiera sono attivi. La tua area mostra gli orari di preghiera e la preghiera del venerdì, l’ora di un corso può dipendere da una preghiera e la tua pagina pubblica li mostra.',
		prayerOnKeep:
			'Disattivarli non cancella nulla: i tuoi orari, i file importati e le preghiere del venerdì restano, e tutto torna se li riattivi.',
		prayerOff:
			'Gli orari di preghiera sono disattivati. Attivali se la tua organizzazione pubblica orari di preghiera, una iqama o una preghiera del venerdì, o se l’ora di un corso dipende da una preghiera.',
		turnedOn: 'Gli orari di preghiera sono attivi.',
		turnedOff: 'Gli orari di preghiera sono disattivati.',
		turnOn: 'Attiva gli orari di preghiera',
		turnOff: 'Disattiva gli orari di preghiera',
		errors: {
			nameRequired: 'Scrivi il nome dell’organizzazione.',
			colour: `Questo colore non è valido. Si scrive con # seguito da sei cifre o lettere, per esempio ${COLOUR_SAMPLE}.`,
			greetingRequired: `Scrivi una formula di saluto, per esempio ${GREETING_SAMPLE}.`,
			noLanguage: 'Seleziona almeno una lingua per la tua pagina pubblica.',
			defaultNotEnabled: 'La lingua predefinita deve essere tra le lingue selezionate.',
			timeZone: 'Scegli il fuso orario dalla lista.',
			gone: 'Questa organizzazione non esiste più.',
			roomNameRequired: 'Scrivi il nome della sala.',
			prayerStillUsed:
				'L’ora di alcuni corsi dipende da una preghiera, oppure esiste una preghiera del venerdì. Dai a questi corsi un orario fisso o eliminali prima di disattivare gli orari di preghiera.'
		}
	},
	en: {
		title: 'Settings',
		intro:
			'What your organisation shows the public: its name, its colour, its languages and its rooms.',
		saved: 'Settings saved.',
		nameLabel: 'Name of the organisation',
		nameHelp: 'It appears at the top of your public page.',
		timeZoneLabel: 'Time zone',
		timeZoneHelp: `It sets the time of your courses. In Switzerland, choose ${SWISS_ZONE}.`,
		timeZoneNotListed: `If the town of the organisation is not in the list, choose a city that always has the same time as that town. For most of Europe: ${SWISS_ZONE}, ${PARIS_ZONE} or ${BERLIN_ZONE}.`,
		timeZoneKept: (zone) =>
			`Your current time zone, ${zone}, is not in the list. It is kept until you choose another one.`,
		timeZoneEurope: 'Europe',
		timeZoneWorld: 'Rest of the world',
		colourLabel: 'Colour of your page',
		colourPreview: 'Sample button',
		colourContrast: (ratio) =>
			`Contrast of the text on this colour: ${withPoint(ratio)} to 1. From 4.5 to 1, it reads well.`,
		colourHelp:
			'It is used as a background on your public page, in the programme pasted into your website and here. The text on it is written in black or white to stay readable, so every colour is accepted.',
		greetingLabel: 'Greeting for messages',
		greetingHelp: `The first words of the ready-to-paste messages you send to your community. Example: ${GREETING_SAMPLE}`,
		languagesLegend: 'Languages of your public page',
		languagesHelp:
			'Your public page, and the programme pasted into your website, can be read in the ticked languages. Each visitor chooses their own.',
		defaultLanguageLabel: 'Default language',
		defaultLanguageHelp:
			'The language of your public page on a first visit. It must be one of the ticked languages.',
		save: 'Save',
		roomsTitle: 'Rooms',
		roomsIntro:
			'The rooms where your courses take place. A course can name its room, but it does not have to.',
		roomsNone: 'No rooms yet.',
		roomCourses: (count) =>
			count === 1
				? 'One course uses this room. If you delete the room, the course will have no room.'
				: `${count} courses use this room. If you delete the room, these courses will have no room.`,
		roomFridays: (count) =>
			count === 1
				? 'One Friday prayer uses this room. If you delete the room, it will have no room.'
				: `${count} Friday prayers use this room. If you delete the room, they will have no room.`,
		deleteRoom: 'Delete',
		newRoomLabel: 'New room',
		newRoomHelp: 'Example: Main hall',
		addRoom: 'Add',
		roomAdded: 'Room added.',
		roomDeleted: 'Room deleted.',
		confirmIntro: 'You are about to delete this room:',
		nothingElse: 'Nothing else changes in your programme.',
		confirmDelete: 'Delete the room',
		keepRoom: 'Keep the room',
		prayerTitle: 'Prayer times',
		prayerOn:
			'Prayer times are switched on. Your area shows the prayer times and the Friday prayer, the time of a course can follow a prayer, and your public page shows them.',
		prayerOnKeep:
			'Switching them off deletes nothing: your times, your imported files and your Friday prayers stay, and everything comes back if you switch them on again.',
		prayerOff:
			'Prayer times are switched off. Switch them on if your organisation publishes prayer times, an iqama or a Friday prayer, or if the time of a course depends on a prayer.',
		turnedOn: 'Prayer times are switched on.',
		turnedOff: 'Prayer times are switched off.',
		turnOn: 'Switch on prayer times',
		turnOff: 'Switch off prayer times',
		errors: {
			nameRequired: 'Write the name of the organisation.',
			colour: `This colour is not valid. It is written # followed by six digits or letters, for example ${COLOUR_SAMPLE}.`,
			greetingRequired: `Write a greeting, for example ${GREETING_SAMPLE}.`,
			noLanguage: 'Tick at least one language for your public page.',
			defaultNotEnabled: 'The default language must be one of the ticked languages.',
			timeZone: 'Pick the time zone from the list.',
			gone: 'This organisation no longer exists.',
			roomNameRequired: 'Write the name of the room.',
			prayerStillUsed:
				'Some courses have their time set by a prayer, or a Friday prayer exists. Give these courses a fixed time or delete them before switching off prayer times.'
		}
	},
	ar: {
		title: 'الإعدادات',
		intro: 'ما تعرضه مؤسستك للجمهور: اسمها ولونها ولغاتها وقاعاتها.',
		saved: 'حُفظت الإعدادات.',
		nameLabel: 'اسم المؤسسة',
		nameHelp: 'يظهر في أعلى صفحتك العامة.',
		timeZoneLabel: 'المنطقة الزمنية',
		timeZoneHelp: `تحدد وقت دروسك. في سويسرا اختر ${SWISS_ZONE}.`,
		timeZoneNotListed: `إذا لم تكن مدينة المؤسسة في القائمة، فاختر مدينة لها دائمًا توقيت مدينة المؤسسة نفسه. لمعظم دول أوروبا: ${SWISS_ZONE} أو ${PARIS_ZONE} أو ${BERLIN_ZONE}.`,
		timeZoneKept: (zone) =>
			`منطقتك الزمنية الحالية، ${zone}، ليست في القائمة. تبقى كما هي ما لم تختر منطقة أخرى.`,
		timeZoneEurope: 'أوروبا',
		timeZoneWorld: 'بقية العالم',
		colourLabel: 'لون صفحتك',
		colourPreview: 'مثال على زر',
		colourContrast: (ratio) =>
			`تباين النص على هذا اللون: ${withPoint(ratio)} إلى 1. تكون القراءة سهلة ابتداء من 4.5 إلى 1.`,
		colourHelp:
			'يُستخدم خلفية في صفحتك العامة وفي البرنامج الملصق في موقعك وهنا. يُكتب النص فوقه بالأسود أو بالأبيض ليبقى مقروءًا، لذلك تُقبل كل الألوان.',
		greetingLabel: 'عبارة الترحيب في الرسائل',
		greetingHelp: 'الكلمات الأولى في الرسائل الجاهزة التي ترسلها إلى جماعتك. مثال: السلام عليكم',
		languagesLegend: 'لغات صفحتك العامة',
		languagesHelp:
			'تُقرأ صفحتك العامة، والبرنامج الملصق في موقعك، باللغات المحددة. ويختار كل زائر لغته.',
		defaultLanguageLabel: 'اللغة الافتراضية',
		defaultLanguageHelp: 'لغة صفحتك العامة عند الزيارة الأولى. يجب أن تكون من اللغات المحددة.',
		save: 'حفظ',
		roomsTitle: 'القاعات',
		roomsIntro: 'القاعات التي تُقام فيها دروسك. يمكن للدرس أن يذكر قاعته، لكن ذلك ليس إلزاميًا.',
		roomsNone: 'لا توجد قاعات حاليًا.',
		roomCourses: (count) =>
			arabic(count, {
				one: 'درس واحد يستخدم هذه القاعة، وسيبقى بلا قاعة إذا حذفتها.',
				two: 'درسان يستخدمان هذه القاعة، وسيبقيان بلا قاعة إذا حذفتها.',
				few: `${count} دروس تستخدم هذه القاعة، وستبقى بلا قاعة إذا حذفتها.`,
				many: `${count} درسًا تستخدم هذه القاعة، وستبقى بلا قاعة إذا حذفتها.`,
				other: `${count} درس تستخدم هذه القاعة، وستبقى بلا قاعة إذا حذفتها.`
			}),
		roomFridays: (count) =>
			arabic(count, {
				one: 'صلاة جمعة واحدة تستخدم هذه القاعة، وستبقى بلا قاعة إذا حذفتها.',
				two: 'صلاتا جمعة تستخدمان هذه القاعة، وستبقيان بلا قاعة إذا حذفتها.',
				few: `${count} صلوات جمعة تستخدم هذه القاعة، وستبقى بلا قاعة إذا حذفتها.`,
				many: `${count} صلاة جمعة تستخدم هذه القاعة، وستبقى بلا قاعة إذا حذفتها.`,
				other: `${count} صلاة جمعة تستخدم هذه القاعة، وستبقى بلا قاعة إذا حذفتها.`
			}),
		deleteRoom: 'حذف',
		newRoomLabel: 'قاعة جديدة',
		newRoomHelp: 'مثال: القاعة الكبرى',
		addRoom: 'إضافة',
		roomAdded: 'أُضيفت القاعة.',
		roomDeleted: 'حُذفت القاعة.',
		confirmIntro: 'أنت على وشك حذف هذه القاعة:',
		nothingElse: 'لا يتغير شيء آخر في برنامجك.',
		confirmDelete: 'حذف القاعة',
		keepRoom: 'الإبقاء على القاعة',
		prayerTitle: 'مواقيت الصلاة',
		prayerOn:
			'مواقيت الصلاة مفعلة. تعرض مساحتك مواقيت الصلاة وصلاة الجمعة، ويمكن ضبط وقت الدرس على صلاة، وتعرضها صفحتك العامة.',
		prayerOnKeep:
			'إيقافها لا يحذف شيئًا: تبقى مواقيتك وملفاتك المستوردة وصلوات الجمعة، ويعود كل شيء إذا فعلتها من جديد.',
		prayerOff:
			'مواقيت الصلاة غير مفعلة. فعلها إذا كانت مؤسستك تنشر مواقيت الصلاة أو الإقامة أو صلاة الجمعة، أو إذا كان وقت درس مرتبطًا بصلاة.',
		turnedOn: 'فُعلت مواقيت الصلاة.',
		turnedOff: 'أُوقفت مواقيت الصلاة.',
		turnOn: 'تفعيل مواقيت الصلاة',
		turnOff: 'إيقاف مواقيت الصلاة',
		errors: {
			nameRequired: 'اكتب اسم المؤسسة.',
			colour: `هذا اللون غير صالح. يُكتب بالعلامة # متبوعة بستة أرقام أو حروف، مثل ${COLOUR_SAMPLE}.`,
			greetingRequired: 'اكتب عبارة ترحيب، مثل السلام عليكم.',
			noLanguage: 'حدد لغة واحدة أو أكثر لصفحتك العامة.',
			defaultNotEnabled: 'يجب أن تكون اللغة الافتراضية من اللغات المحددة.',
			timeZone: 'اختر المنطقة الزمنية من القائمة.',
			gone: 'هذه المؤسسة لم تعد موجودة.',
			roomNameRequired: 'اكتب اسم القاعة.',
			prayerStillUsed:
				'بعض الدروس مضبوط وقتها على صلاة، أو توجد صلاة جمعة. امنح هذه الدروس وقتًا ثابتًا أو احذفها قبل إيقاف مواقيت الصلاة.'
		}
	}
};

// Les textes de l'écran du super-admin (`/super-admin`) : la liste des organisations, la création
// d'une organisation et le lien de connexion de secours (étape 18, retours B1, B2 et D2), et
// l'invitation de la personne responsable, à la création ou depuis la liste (étape 22, ADR 0049).
//
// Ce que disent les invitations est ce que fait le code : le rôle est celui de personne
// responsable, l'invitation vaut `INVITATION_DAYS` jours (`invitations.ts`), et la réponse ne dit
// jamais si l'adresse a déjà un compte (ADR 0017).
//
// Ce que dit le lien de secours est ce que fait le code, et rien d'autre : il vaut quinze minutes, il
// ne sert qu'une fois, il s'affiche au lieu de partir par courriel, il ouvre une session sans aucun
// pouvoir de super-admin (seule une passkey les donne, ADR 0025), il crée un compte sans organisation
// pour une adresse qui n'en a pas, et chaque lien produit est inscrit au registre des accès.
//
// L'exemple d'adresse n'est écrit nulle part ici : la page le forme à partir de l'exemple de nom, par
// la fonction même qui propose l'adresse pendant la frappe. L'exemple et la règle ne peuvent donc
// pas se contredire, et le fuseau d'exemple vient du serveur, comme celui qui est choisi d'avance.

import type { Translations } from './space.js';

/**
 * L'exemple de nom : celui d'une association, un nom propre qui s'écrit de même dans chaque langue en
 * lettres latines. jadwal sert toute organisation (ADR 0042) : l'exemple ne nomme pas un genre
 * d'organisation plutôt qu'un autre.
 */
const NAME_EXAMPLE = 'Association Horizon';

/**
 * Trois fuseaux de la liste qui ont toujours l'heure de la plus grande partie de l'Europe. Une ville
 * dont le nom est un alias (Oslo, Amsterdam, Vaduz, Zagreb…) n'est pas dans la liste, parce que le
 * flux agenda refuse les alias : l'aide dit de prendre une ville à la même heure, par exemple l'un
 * de ceux-là. Ce sont des noms de la base IANA, écrits comme la liste les montre.
 */
const [ZURICH, PARIS, BERLIN] = ['Europe/Zurich', 'Europe/Paris', 'Europe/Berlin'] as const;

interface SuperAdminTexts {
	readonly title: string;
	readonly intro: string;
	/** Après la création : le texte avant le nom de l'organisation, puis avant son adresse. */
	readonly created: string;
	readonly createdAddress: string;
	readonly createdNext: string;
	/** Devant le nom de l'organisation dont l'état vient d'être enregistré. */
	readonly statusSaved: string;
	readonly listTitle: string;
	readonly listEmpty: string;
	/** Ce que font les deux gestes proposés pour chaque organisation, dits une fois pour toutes. */
	readonly enterHelp: string;
	readonly statusHelp: string;
	/** Devant l'adresse de la page publique d'une organisation de la liste. */
	readonly publicPage: string;
	readonly enter: string;
	readonly statusLabel: string;
	readonly statuses: { readonly active: string; readonly suspended: string };
	readonly saveStatus: string;
	readonly createTitle: string;
	readonly createIntro: string;
	/** « Exemple : », devant un exemple de nom ou d'adresse. */
	readonly example: string;
	readonly nameLabel: string;
	readonly nameHint: string;
	/**
	 * Un nom d'organisation tel qu'on l'écrit dans cette langue. L'exemple d'adresse en est tiré ; un
	 * nom sans lettre latine n'en donne aucun, et la page prend alors celui du français.
	 */
	readonly nameExample: string;
	readonly addressLabel: string;
	readonly addressHint: string;
	readonly addressRule: string;
	readonly addressFixed: string;
	/** Sous le champ de l'adresse, quand le nom saisi n'a aucune lettre latine (étape 19, D6). */
	readonly addressToType: string;
	/** Devant l'adresse complète de la page publique, écrite pendant la frappe. */
	readonly fullAddress: string;
	/**
	 * L'étape qui montre l'adresse proposée avant de créer l'organisation, quand le champ est arrivé
	 * vide, sans JavaScript (étape 19, D6) : le titre, le texte avant le nom, le texte avant l'adresse
	 * complète, puis quoi faire. Le bouton est celui du formulaire, `create`.
	 */
	readonly confirm: {
		readonly title: string;
		readonly notYet: string;
		readonly proposed: string;
		readonly check: string;
		/** Devant l'adresse de la personne responsable, quand l'invitation partira à la création. */
		readonly invite: string;
	};
	readonly timeZoneLabel: string;
	/** À quoi sert le fuseau, et celui de la Suisse, que le serveur donne. */
	readonly timeZoneHint: (zone: string) => string;
	/** Quoi choisir quand la ville de l'organisation n'est pas dans la liste. */
	readonly timeZoneNotListed: string;
	readonly timeZoneEurope: string;
	readonly timeZoneWorld: string;
	readonly create: string;
	/**
	 * La personne responsable, facultative, dans le formulaire de création (étape 22) : le titre du
	 * groupe de champs et ce qu'il fait. Les champs eux-mêmes sont ceux de `invite`.
	 */
	readonly manager: { readonly legend: string; readonly intro: string };
	/**
	 * Inviter la personne responsable d'une organisation de la liste, sans entrer dans son espace
	 * (étape 22), et ce que l'écran dit après l'envoi, de là comme depuis la création.
	 */
	readonly invite: {
		readonly summary: string;
		readonly help: string;
		readonly emailLabel: string;
		readonly emailHint: string;
		readonly languageLabel: string;
		readonly languageHelp: string;
		readonly submit: string;
		/** Devant l'adresse invitée, puis devant le nom de l'organisation. */
		readonly sentTo: string;
		readonly sentFor: string;
		readonly validity: (days: number) => string;
	};
	readonly rescue: {
		readonly title: string;
		/** Les trois phrases de l'écran : quand s'en servir, ce qui se passe, combien de temps. */
		readonly when: string;
		readonly what: string;
		readonly duration: string;
		readonly emailLabel: string;
		readonly emailHint: string;
		readonly submit: string;
		/** Devant l'adresse pour laquelle le lien vient d'être créé. */
		readonly resultTitle: string;
		readonly resultCopy: string;
		readonly resultOpens: string;
		readonly resultLog: string;
		/** Le nom du champ qui porte le lien, pour les lecteurs d'écran (`aria-label`). */
		readonly linkLabel: string;
	};
	readonly errors: {
		readonly nameRequired: string;
		/** Les trois erreurs d'adresse finissent sur l'exemple d'adresse que la page leur donne. */
		readonly invalidAddress: (example: string) => string;
		readonly noAddressFromName: (example: string) => string;
		/**
		 * Une adresse faite de chiffres et de traits d'union seuls (étape 19, D6), que la base refuse
		 * aussi depuis la migration 0074.
		 */
		readonly addressWithoutLetter: (example: string) => string;
		readonly addressTaken: string;
		readonly unknownTimeZone: string;
		readonly unknownStatus: string;
		readonly unknownOrganisation: string;
		readonly linkFailed: string;
		readonly invalidManagerEmail: string;
	};
}

export const superAdminTexts: Translations<SuperAdminTexts> = {
	fr: {
		title: 'Super-admin',
		intro:
			'Cet écran sert à la personne qui exploite le service : créer les organisations et inviter leur personne responsable, régler leur état, entrer dans leur espace pour les aider, et dépanner une connexion.',
		created: 'L’organisation est créée :',
		createdAddress: 'Sa page publique :',
		createdNext:
			'Pour y faire entrer sa personne responsable, touchez « Inviter une personne responsable » sous son nom, dans la liste des organisations.',
		statusSaved: 'État enregistré pour',
		listTitle: 'Organisations',
		listEmpty:
			'Aucune organisation pour le moment. Créez la première avec le formulaire ci-dessous.',
		enterHelp:
			'Vous y voyez et modifiez tout, comme sa personne responsable. Une bannière le rappelle en haut de chaque écran.',
		statusHelp:
			'Une organisation suspendue n’a plus de page publique : ni sa page, ni son widget, ni son agenda ne s’affichent. Rien n’est effacé, et vous pouvez la réactiver.',
		publicPage: 'Page publique :',
		enter: 'Entrer dans son espace',
		statusLabel: 'État',
		statuses: { active: 'Active', suspended: 'Suspendue' },
		saveStatus: 'Enregistrer l’état',
		createTitle: 'Créer une organisation',
		createIntro:
			'Une organisation est l’espace d’une association, d’une école ou d’un club : son programme, ses membres et sa page publique.',
		example: 'Exemple :',
		nameLabel: 'Nom de l’organisation',
		nameHint: 'Tel qu’il s’affichera sur sa page publique.',
		nameExample: NAME_EXAMPLE,
		addressLabel: 'Adresse de la page publique',
		addressHint:
			'Elle est proposée à partir du nom, et vous pouvez la modifier. Si vous la laissez vide, l’écran la forme à partir du nom et vous la montre avant de créer l’organisation.',
		addressRule:
			'Lettres minuscules sans accent ni cédille, chiffres et traits d’union, avec au moins une lettre.',
		addressFixed: 'Choisissez-la avec soin : elle ne se change plus ensuite.',
		addressToType:
			'Ce nom n’a aucune lettre latine : aucune adresse ne peut en être tirée. Écrivez-la vous-même.',
		fullAddress: 'Adresse complète :',
		confirm: {
			title: 'Vérifiez l’adresse avant de créer l’organisation',
			notYet: 'L’organisation n’est pas encore créée :',
			proposed: 'Adresse de sa page publique, proposée à partir du nom :',
			check:
				'Elle ne se changera plus ensuite. Si elle vous convient, touchez « Créer l’organisation ». Sinon, écrivez-en une autre dans le champ ci-dessous.',
			invite: 'L’invitation de personne responsable partira à la création, à :'
		},
		timeZoneLabel: 'Fuseau horaire',
		timeZoneHint: (zone) =>
			`Il sert à afficher les heures du programme à l’heure du lieu de l’organisation et à calculer les heures de prière. En Suisse : ${zone}.`,
		timeZoneNotListed: `Si la ville de l’organisation n’est pas dans la liste, choisissez une ville qui a toujours la même heure qu’elle. Pour la plus grande partie de l’Europe : ${ZURICH}, ${PARIS} ou ${BERLIN}.`,
		timeZoneEurope: 'Europe',
		timeZoneWorld: 'Reste du monde',
		create: 'Créer l’organisation',
		manager: {
			legend: 'Personne responsable (facultatif)',
			intro:
				'Si vous connaissez son adresse électronique, l’invitation lui part dès la création de l’organisation. Sinon, laissez le champ vide : vous pourrez l’inviter plus tard depuis la liste des organisations.'
		},
		invite: {
			summary: 'Inviter une personne responsable',
			help: 'L’invitation part par courriel. En l’acceptant, la personne devient responsable de l’organisation, sans que vous ayez à entrer dans son espace.',
			emailLabel: 'Adresse électronique de la personne responsable',
			emailHint: 'Exemple : prenom.nom@example.org',
			languageLabel: 'Langue du courriel',
			languageHelp: 'La personne invitée reçoit le courriel dans cette langue.',
			submit: 'Envoyer l’invitation',
			sentTo: 'L’invitation de personne responsable est partie à :',
			sentFor: 'Organisation :',
			validity: (days) =>
				`Elle vaut ${days} jours. En l’acceptant, cette personne devient responsable de l’organisation.`
		},
		rescue: {
			title: 'Lien de connexion de secours',
			when: 'Servez-vous-en quand une personne ne reçoit pas le courriel de connexion, par exemple si l’envoi des courriels est en panne.',
			what: 'Le lien s’affiche ici au lieu de partir par courriel : envoyez-le à la personne par un message, et, en l’ouvrant, elle entre dans son compte comme avec le lien habituel.',
			duration: 'Il est valable quinze minutes et ne sert qu’une fois.',
			emailLabel: 'Adresse électronique de la personne',
			emailHint: 'L’adresse de son compte. Exemple : prenom.nom@example.org',
			submit: 'Créer le lien de connexion',
			resultTitle: 'Lien de connexion pour',
			resultCopy:
				'Copiez-le et envoyez-le à cette personne par un message. Il est valable quinze minutes à partir de maintenant et ne sert qu’une fois.',
			resultOpens:
				'Il ouvre son compte et ses organisations, sans aucun pouvoir de super-admin, même pour votre propre adresse. Si l’adresse n’a pas encore de compte, il en crée un, rattaché à aucune organisation.',
			resultLog: 'Ce lien est noté dans le registre des accès du super-admin.',
			linkLabel: 'Lien de connexion de secours'
		},
		errors: {
			nameRequired: 'Écrivez le nom de l’organisation.',
			invalidAddress: (example) =>
				`Cette adresse ne convient pas. Elle ne peut contenir que des lettres minuscules sans accent ni cédille, des chiffres et des traits d’union, un seul entre deux mots, jamais au début ni à la fin. Exemple : ${example}`,
			noAddressFromName: (example) =>
				`Le nom ne permet pas de proposer une adresse. Écrivez-la vous-même, en lettres minuscules sans accent ni cédille, chiffres et traits d’union. Exemple : ${example}`,
			addressWithoutLetter: (example) =>
				`Cette adresse n’a que des chiffres et des traits d’union. Ajoutez-y au moins une lettre, par exemple un mot du nom. Exemple : ${example}`,
			addressTaken:
				'Cette adresse est déjà celle d’une autre organisation. Choisissez-en une autre, par exemple en y ajoutant le nom de la ville.',
			unknownTimeZone: 'Choisissez le fuseau horaire dans la liste.',
			unknownStatus: 'Cet état n’existe pas : prenez-en un dans la liste.',
			unknownOrganisation: 'Cette organisation n’existe pas, ou plus.',
			linkFailed: 'Le lien n’a pas pu être créé. Réessayez dans une minute.',
			invalidManagerEmail:
				'L’adresse de la personne responsable ne convient pas. Exemple : prenom.nom@example.org'
		}
	},
	de: {
		title: 'Super-Admin',
		intro:
			'Diese Seite ist für die Person, die den Dienst betreibt: Organisationen erstellen und ihre verantwortliche Person einladen, ihren Status festlegen, ihren Bereich betreten, um zu helfen, und bei Problemen mit der Anmeldung weiterhelfen.',
		created: 'Die Organisation wurde erstellt:',
		createdAddress: 'Ihre öffentliche Seite:',
		createdNext:
			'Um ihre verantwortliche Person einzuladen, tippen Sie in der Liste der Organisationen unter ihrem Namen auf «Verantwortliche Person einladen».',
		statusSaved: 'Status gespeichert für',
		listTitle: 'Organisationen',
		listEmpty: 'Noch keine Organisation. Erstellen Sie die erste mit dem Formular weiter unten.',
		enterHelp:
			'Dort sehen und ändern Sie alles, wie die verantwortliche Person. Ein Banner oben auf jeder Seite erinnert daran.',
		statusHelp:
			'Eine gesperrte Organisation hat keine öffentliche Seite mehr: Weder ihre Seite noch ihr Widget noch ihr Kalender werden angezeigt. Nichts wird gelöscht, und Sie können sie wieder aktivieren.',
		publicPage: 'Öffentliche Seite:',
		enter: 'Ihren Bereich betreten',
		statusLabel: 'Status',
		statuses: { active: 'Aktiv', suspended: 'Gesperrt' },
		saveStatus: 'Status speichern',
		createTitle: 'Organisation erstellen',
		createIntro:
			'Eine Organisation ist der Bereich eines Vereins, einer Schule oder eines Clubs: ihr Programm, ihre Mitglieder und ihre öffentliche Seite.',
		example: 'Beispiel:',
		nameLabel: 'Name der Organisation',
		nameHint: 'So, wie er auf der öffentlichen Seite erscheinen wird.',
		nameExample: NAME_EXAMPLE,
		addressLabel: 'Adresse der öffentlichen Seite',
		addressHint:
			'Sie wird aus dem Namen vorgeschlagen, und Sie können sie ändern. Wenn Sie das Feld leer lassen, wird sie aus dem Namen gebildet und Ihnen gezeigt, bevor die Organisation erstellt wird.',
		addressRule:
			'Kleinbuchstaben ohne Umlaute und Akzente, Ziffern und Bindestriche, mit mindestens einem Buchstaben.',
		addressFixed: 'Wählen Sie sie sorgfältig: Sie lässt sich danach nicht mehr ändern.',
		addressToType:
			'Dieser Name hat keine lateinischen Buchstaben: Es lässt sich keine Adresse daraus bilden. Schreiben Sie sie selbst.',
		fullAddress: 'Vollständige Adresse:',
		confirm: {
			title: 'Prüfen Sie die Adresse, bevor die Organisation erstellt wird',
			notYet: 'Die Organisation ist noch nicht erstellt:',
			proposed: 'Adresse ihrer öffentlichen Seite, aus dem Namen vorgeschlagen:',
			check:
				'Sie lässt sich danach nicht mehr ändern. Wenn sie passt, tippen Sie auf «Organisation erstellen». Sonst schreiben Sie im Feld unten eine andere.',
			invite: 'Die Einladung der verantwortlichen Person geht bei der Erstellung an:'
		},
		timeZoneLabel: 'Zeitzone',
		timeZoneHint: (zone) =>
			`Sie dient dazu, die Zeiten des Programms in der Ortszeit der Organisation anzuzeigen und die Gebetszeiten zu berechnen. In der Schweiz: ${zone}.`,
		timeZoneNotListed: `Steht der Ort der Organisation nicht in der Liste, wählen Sie eine Stadt, in der immer die gleiche Uhrzeit gilt wie dort. Für den grössten Teil Europas: ${ZURICH}, ${PARIS} oder ${BERLIN}.`,
		timeZoneEurope: 'Europa',
		timeZoneWorld: 'Übrige Welt',
		create: 'Organisation erstellen',
		manager: {
			legend: 'Verantwortliche Person (optional)',
			intro:
				'Wenn Sie ihre E-Mail-Adresse kennen, geht die Einladung gleich bei der Erstellung der Organisation an sie. Sonst lassen Sie das Feld leer: Sie können sie später über die Liste der Organisationen einladen.'
		},
		invite: {
			summary: 'Verantwortliche Person einladen',
			help: 'Die Einladung geht per E-Mail. Wer sie annimmt, wird verantwortliche Person der Organisation, ohne dass Sie ihren Bereich betreten müssen.',
			emailLabel: 'E-Mail-Adresse der verantwortlichen Person',
			emailHint: 'Beispiel: vorname.name@example.org',
			languageLabel: 'Sprache der E-Mail',
			languageHelp: 'Die eingeladene Person erhält die E-Mail in dieser Sprache.',
			submit: 'Einladung senden',
			sentTo: 'Die Einladung als verantwortliche Person wurde gesendet an:',
			sentFor: 'Organisation:',
			validity: (days) =>
				`Sie ist ${days} Tage gültig. Wer sie annimmt, wird verantwortliche Person der Organisation.`
		},
		rescue: {
			title: 'Notfall-Anmeldelink',
			when: 'Verwenden Sie ihn, wenn eine Person die Anmelde-E-Mail nicht erhält, zum Beispiel wenn der E-Mail-Versand gestört ist.',
			what: 'Der Link erscheint hier, statt per E-Mail verschickt zu werden: Senden Sie ihn der Person mit einer Nachricht, und wenn sie ihn öffnet, gelangt sie in ihr Konto, wie mit dem gewohnten Link.',
			duration: 'Er ist fünfzehn Minuten gültig und funktioniert nur einmal.',
			emailLabel: 'E-Mail-Adresse der Person',
			emailHint: 'Die Adresse ihres Kontos. Beispiel: vorname.name@example.org',
			submit: 'Anmeldelink erstellen',
			resultTitle: 'Anmeldelink für',
			resultCopy:
				'Kopieren Sie ihn und senden Sie ihn der Person mit einer Nachricht. Er ist ab jetzt fünfzehn Minuten gültig und funktioniert nur einmal.',
			resultOpens:
				'Er öffnet ihr Konto und ihre Organisationen, ohne Super-Admin-Rechte, auch für Ihre eigene Adresse. Hat die Adresse noch kein Konto, erstellt er eines, das zu keiner Organisation gehört.',
			resultLog: 'Dieser Link wird im Zugriffsprotokoll des Super-Admins festgehalten.',
			linkLabel: 'Notfall-Anmeldelink'
		},
		errors: {
			nameRequired: 'Geben Sie den Namen der Organisation ein.',
			invalidAddress: (example) =>
				`Diese Adresse ist nicht möglich. Sie darf nur Kleinbuchstaben ohne Umlaute und Akzente, Ziffern und Bindestriche enthalten, nur einen Bindestrich zwischen zwei Wörtern und keinen am Anfang oder am Ende. Beispiel: ${example}`,
			noAddressFromName: (example) =>
				`Aus dem Namen lässt sich keine Adresse bilden. Schreiben Sie sie selbst, mit Kleinbuchstaben ohne Umlaute und Akzente, Ziffern und Bindestrichen. Beispiel: ${example}`,
			addressWithoutLetter: (example) =>
				`Diese Adresse besteht nur aus Ziffern und Bindestrichen. Fügen Sie mindestens einen Buchstaben hinzu, zum Beispiel ein Wort aus dem Namen. Beispiel: ${example}`,
			addressTaken:
				'Diese Adresse gehört schon einer anderen Organisation. Wählen Sie eine andere, zum Beispiel mit dem Namen des Orts dazu.',
			unknownTimeZone: 'Wählen Sie die Zeitzone aus der Liste.',
			unknownStatus: 'Diesen Status gibt es nicht: Nehmen Sie einen aus der Liste.',
			unknownOrganisation: 'Die Organisation gibt es nicht oder nicht mehr.',
			linkFailed:
				'Der Link konnte nicht erstellt werden. Versuchen Sie es in einer Minute noch einmal.',
			invalidManagerEmail:
				'Die Adresse der verantwortlichen Person hat nicht die Form einer E-Mail-Adresse. Beispiel: vorname.name@example.org'
		}
	},
	it: {
		title: 'Super-admin',
		intro:
			'Questa pagina serve a chi gestisce il servizio: creare le organizzazioni e invitarne la persona responsabile, impostarne lo stato, entrare nel loro spazio per aiutarle e risolvere un problema di accesso.',
		created: 'L’organizzazione è stata creata:',
		createdAddress: 'La sua pagina pubblica:',
		createdNext:
			'Per invitare la sua persona responsabile, tocca «Invita una persona responsabile» sotto il suo nome, nella lista delle organizzazioni.',
		statusSaved: 'Stato salvato per',
		listTitle: 'Organizzazioni',
		listEmpty: 'Ancora nessuna organizzazione. Crea la prima con il modulo qui sotto.',
		enterHelp:
			'Lì vedi e modifichi tutto, come la persona responsabile. Un banner te lo ricorda in cima a ogni pagina.',
		statusHelp:
			'Un’organizzazione sospesa non ha più una pagina pubblica: né la pagina, né il widget, né il calendario vengono mostrati. Non si cancella niente, e puoi riattivarla.',
		publicPage: 'Pagina pubblica:',
		enter: 'Entra nel suo spazio',
		statusLabel: 'Stato',
		statuses: { active: 'Attiva', suspended: 'Sospesa' },
		saveStatus: 'Salva lo stato',
		createTitle: 'Crea un’organizzazione',
		createIntro:
			'Un’organizzazione è lo spazio di un’associazione, di una scuola o di un club: il suo programma, i suoi membri e la sua pagina pubblica.',
		example: 'Esempio:',
		nameLabel: 'Nome dell’organizzazione',
		nameHint: 'Come apparirà sulla sua pagina pubblica.',
		nameExample: NAME_EXAMPLE,
		addressLabel: 'Indirizzo della pagina pubblica',
		addressHint:
			'Viene proposto a partire dal nome, e puoi modificarlo. Se lo lasci vuoto, viene formato a partire dal nome e ti viene mostrato prima di creare l’organizzazione.',
		addressRule: 'Lettere minuscole senza accenti, cifre e trattini, con almeno una lettera.',
		addressFixed: 'Sceglilo con cura: dopo non si può più cambiare.',
		addressToType:
			'Questo nome non ha lettere latine: non se ne può ricavare un indirizzo. Scrivilo tu.',
		fullAddress: 'Indirizzo completo:',
		confirm: {
			title: 'Controlla l’indirizzo prima di creare l’organizzazione',
			notYet: 'L’organizzazione non è ancora stata creata:',
			proposed: 'Indirizzo della sua pagina pubblica, proposto a partire dal nome:',
			check:
				'Dopo non si potrà più cambiare. Se ti va bene, tocca «Crea l’organizzazione». Altrimenti scrivine un altro nel campo qui sotto.',
			invite: 'L’invito alla persona responsabile partirà alla creazione, a:'
		},
		timeZoneLabel: 'Fuso orario',
		timeZoneHint: (zone) =>
			`Serve a mostrare gli orari del programma all’ora del luogo dell’organizzazione e a calcolare gli orari di preghiera. In Svizzera: ${zone}.`,
		timeZoneNotListed: `Se la città dell’organizzazione non è nella lista, scegli una città che abbia sempre la stessa ora di quella dell’organizzazione. Per la maggior parte dell’Europa: ${ZURICH}, ${PARIS} o ${BERLIN}.`,
		timeZoneEurope: 'Europa',
		timeZoneWorld: 'Resto del mondo',
		create: 'Crea l’organizzazione',
		manager: {
			legend: 'Persona responsabile (facoltativo)',
			intro:
				'Se conosci il suo indirizzo e-mail, l’invito le arriva appena l’organizzazione è creata. Altrimenti lascia il campo vuoto: potrai invitarla più tardi dalla lista delle organizzazioni.'
		},
		invite: {
			summary: 'Invita una persona responsabile',
			help: 'L’invito parte per e-mail. Accettandolo, la persona diventa responsabile dell’organizzazione, senza che tu debba entrare nel suo spazio.',
			emailLabel: 'Indirizzo e-mail della persona responsabile',
			emailHint: 'Esempio: nome.cognome@example.org',
			languageLabel: 'Lingua dell’e-mail',
			languageHelp: 'La persona invitata riceve l’e-mail in questa lingua.',
			submit: 'Invia l’invito',
			sentTo: 'L’invito come persona responsabile è stato inviato a:',
			sentFor: 'Organizzazione:',
			validity: (days) =>
				`È valido ${days} giorni. Accettandolo, questa persona diventa responsabile dell’organizzazione.`
		},
		rescue: {
			title: 'Link di accesso di emergenza',
			when: 'Usalo quando una persona non riceve l’e-mail di accesso, per esempio se l’invio delle e-mail non funziona.',
			what: 'Il link appare qui invece di partire per e-mail: mandalo alla persona con un messaggio, e aprendolo entra nel suo account, come con il link solito.',
			duration: 'È valido quindici minuti e funziona una sola volta.',
			emailLabel: 'Indirizzo e-mail della persona',
			emailHint: 'L’indirizzo del suo account. Esempio: nome.cognome@example.org',
			submit: 'Crea il link di accesso',
			resultTitle: 'Link di accesso per',
			resultCopy:
				'Copialo e mandalo a questa persona con un messaggio. È valido quindici minuti da adesso e funziona una sola volta.',
			resultOpens:
				'Apre il suo account e le sue organizzazioni, senza nessun potere di super-admin, anche per il tuo indirizzo. Se l’indirizzo non ha ancora un account, ne crea uno, senza nessuna organizzazione.',
			resultLog: 'Questo link viene annotato nel registro degli accessi del super-admin.',
			linkLabel: 'Link di accesso di emergenza'
		},
		errors: {
			nameRequired: 'Scrivi il nome dell’organizzazione.',
			invalidAddress: (example) =>
				`Questo indirizzo non va bene. Può contenere solo lettere minuscole senza accenti, cifre e trattini, un solo trattino tra due parole, mai all’inizio né alla fine. Esempio: ${example}`,
			noAddressFromName: (example) =>
				`Dal nome non si può proporre un indirizzo. Scrivilo tu, con lettere minuscole senza accenti, cifre e trattini. Esempio: ${example}`,
			addressWithoutLetter: (example) =>
				`Questo indirizzo ha solo cifre e trattini. Aggiungi almeno una lettera, per esempio una parola del nome. Esempio: ${example}`,
			addressTaken:
				'Questo indirizzo è già di un’altra organizzazione. Scegline un altro, per esempio aggiungendo il nome della città.',
			unknownTimeZone: 'Scegli il fuso orario dalla lista.',
			unknownStatus: 'Questo stato non esiste: prendine uno dalla lista.',
			unknownOrganisation: 'L’organizzazione non esiste, o non esiste più.',
			linkFailed: 'Non è stato possibile creare il link. Riprova tra un minuto.',
			invalidManagerEmail:
				'L’indirizzo della persona responsabile non ha la forma di un indirizzo e-mail. Esempio: nome.cognome@example.org'
		}
	},
	en: {
		title: 'Super admin',
		intro:
			'This page is for the person who runs the service: create organisations and invite the person in charge of each, set their status, enter their space to help them, and sort out a sign-in problem.',
		created: 'The organisation has been created:',
		createdAddress: 'Its public page:',
		createdNext:
			'To bring in the person in charge, tap ‘Invite the person in charge’ under its name, in the list of organisations.',
		statusSaved: 'Status saved for',
		listTitle: 'Organisations',
		listEmpty: 'No organisations yet. Create the first one with the form below.',
		enterHelp:
			'There you see and change everything, like the person in charge. A banner reminds you at the top of every page.',
		statusHelp:
			'A suspended organisation no longer has a public page: its page, widget and calendar are no longer shown. Nothing is deleted, and you can make it active again.',
		publicPage: 'Public page:',
		enter: 'Enter its space',
		statusLabel: 'Status',
		statuses: { active: 'Active', suspended: 'Suspended' },
		saveStatus: 'Save the status',
		createTitle: 'Create an organisation',
		createIntro:
			'An organisation is the space of an association, a school or a club: its programme, its members and its public page.',
		example: 'Example:',
		nameLabel: 'Name of the organisation',
		nameHint: 'As it will appear on its public page.',
		nameExample: NAME_EXAMPLE,
		addressLabel: 'Address of the public page',
		addressHint:
			'It is suggested from the name, and you can change it. If you leave it empty, it is made from the name and shown to you before the organisation is created.',
		addressRule:
			'Lower-case letters without accents, digits and hyphens, with at least one letter.',
		addressFixed: 'Choose it with care: it cannot be changed afterwards.',
		addressToType:
			'This name has no Latin letters, so no address can be made from it. Write it yourself.',
		fullAddress: 'Full address:',
		confirm: {
			title: 'Check the address before the organisation is created',
			notYet: 'The organisation has not been created yet:',
			proposed: 'Address of its public page, suggested from the name:',
			check:
				'It cannot be changed afterwards. If it suits you, tap ‘Create the organisation’. Otherwise, write another one in the field below.',
			invite: 'On creation, the invitation for the person in charge will be sent to this address:'
		},
		timeZoneLabel: 'Time zone',
		timeZoneHint: (zone) =>
			`It is used to show the times of the programme in the local time of the organisation, and to work out the prayer times. In Switzerland: ${zone}.`,
		timeZoneNotListed: `If the town of the organisation is not in the list, choose a city that always has the same time as that town. For most of Europe: ${ZURICH}, ${PARIS} or ${BERLIN}.`,
		timeZoneEurope: 'Europe',
		timeZoneWorld: 'Rest of the world',
		create: 'Create the organisation',
		manager: {
			legend: 'Person in charge (optional)',
			intro:
				'If you know their email address, the invitation is sent as soon as the organisation is created. Otherwise, leave the field empty: you can invite them later from the list of organisations.'
		},
		invite: {
			summary: 'Invite the person in charge',
			help: 'The invitation is sent by email. By accepting it, the person becomes in charge of the organisation, without you having to enter its space.',
			emailLabel: 'Email address of the person in charge',
			emailHint: 'Example: first.last@example.org',
			languageLabel: 'Language of the email',
			languageHelp: 'The person you invite receives the email in this language.',
			submit: 'Send the invitation',
			sentTo: 'Invited as person in charge:',
			sentFor: 'Organisation:',
			validity: (days) =>
				`It is valid for ${days} days. By accepting it, this person becomes in charge of the organisation.`
		},
		rescue: {
			title: 'Emergency sign-in link',
			when: 'Use it when someone does not receive the sign-in email, for example if sending emails has broken down.',
			what: 'The link appears here instead of being sent by email: send it to the person in a message, and when they open it they get into their account, as with the usual link.',
			duration: 'It is valid for fifteen minutes and works only once.',
			emailLabel: 'Email address of the person',
			emailHint: 'The address of their account. Example: first.last@example.org',
			submit: 'Create the sign-in link',
			resultTitle: 'Sign-in link for',
			resultCopy:
				'Copy it and send it to this person in a message. It is valid for fifteen minutes from now and works only once.',
			resultOpens:
				'It opens their account and their organisations, without any super admin powers, even for your own address. If the address has no account yet, it creates one, linked to no organisation.',
			resultLog: 'This link is recorded in the super admin access log.',
			linkLabel: 'Emergency sign-in link'
		},
		errors: {
			nameRequired: 'Write the name of the organisation.',
			invalidAddress: (example) =>
				`This address cannot be used. It may contain only lower-case letters without accents, digits and hyphens, a single hyphen between two words, never at the start or the end. Example: ${example}`,
			noAddressFromName: (example) =>
				`No address can be suggested from the name. Write it yourself, in lower-case letters without accents, digits and hyphens. Example: ${example}`,
			addressWithoutLetter: (example) =>
				`This address has only digits and hyphens. Add at least one letter, for example a word from the name. Example: ${example}`,
			addressTaken:
				'This address already belongs to another organisation. Choose another one, for example by adding the name of the town.',
			unknownTimeZone: 'Pick the time zone from the list.',
			unknownStatus: 'This status does not exist: pick one from the list.',
			unknownOrganisation: 'The organisation does not exist, or no longer exists.',
			linkFailed: 'The link could not be created. Try again in a minute.',
			invalidManagerEmail:
				'The address of the person in charge does not look like an email address. Example: first.last@example.org'
		}
	},
	ar: {
		title: 'المشرف العام',
		intro:
			'هذه الصفحة مخصصة للشخص الذي يدير الخدمة: إنشاء المؤسسات ودعوة المسؤول عن كل منها، وتحديد حالتها، والدخول إلى مساحتها لمساعدتها، وحل مشكلة في تسجيل الدخول.',
		created: 'تم إنشاء المؤسسة:',
		createdAddress: 'صفحتها العامة:',
		createdNext: 'لدعوة المسؤول عنها، اضغط «دعوة المسؤول» تحت اسمها في قائمة المؤسسات.',
		statusSaved: 'تم حفظ حالة',
		listTitle: 'المؤسسات',
		listEmpty: 'لا توجد أي مؤسسة بعد. أنشئ الأولى بالنموذج أدناه.',
		enterHelp: 'ترى فيها كل شيء وتعدله، مثل المسؤول عنها. ويذكرك بذلك شريط في أعلى كل صفحة.',
		statusHelp:
			'المؤسسة الموقوفة لم تعد لها صفحة عامة: لا تظهر صفحتها ولا أداتها المدمجة ولا تقويمها. لا يحذف شيء، ويمكنك إعادة تفعيلها.',
		publicPage: 'الصفحة العامة:',
		enter: 'الدخول إلى مساحتها',
		statusLabel: 'الحالة',
		statuses: { active: 'نشطة', suspended: 'موقوفة' },
		saveStatus: 'حفظ الحالة',
		createTitle: 'إنشاء مؤسسة',
		createIntro: 'المؤسسة هي مساحة جمعية أو مدرسة أو ناد: برنامجها وأعضاؤها وصفحتها العامة.',
		example: 'مثال:',
		nameLabel: 'اسم المؤسسة',
		nameHint: 'كما سيظهر في صفحتها العامة.',
		nameExample: 'جمعية الأفق',
		addressLabel: 'عنوان الصفحة العامة',
		addressHint:
			'يقترح العنوان انطلاقًا من الاسم إذا كان بأحرف لاتينية، ويمكنك تعديله. إذا تركته فارغًا، يؤخذ العنوان من الاسم ويعرض عليك قبل إنشاء المؤسسة.',
		addressRule: 'أحرف لاتينية صغيرة بلا علامات، وأرقام، وشرطات، مع حرف واحد على الأقل.',
		addressFixed: 'اختره بعناية: لا يمكن تغييره بعد ذلك.',
		addressToType: 'ليس في هذا الاسم أي حرف لاتيني، فلا يمكن اقتراح عنوان منه. اكتبه بنفسك.',
		fullAddress: 'العنوان الكامل:',
		confirm: {
			title: 'تحقق من العنوان قبل إنشاء المؤسسة',
			notYet: 'لم تُنشأ المؤسسة بعد:',
			proposed: 'عنوان صفحتها العامة، مقترح انطلاقًا من الاسم:',
			check:
				'لا يمكن تغييره بعد ذلك. إذا كان مناسبًا، فاضغط «إنشاء المؤسسة». وإلا فاكتب عنوانًا آخر في الحقل أدناه.',
			invite: 'ستُرسل دعوة المسؤول عند الإنشاء إلى:'
		},
		timeZoneLabel: 'المنطقة الزمنية',
		timeZoneHint: (zone) =>
			`تستعمل لعرض المواعيد حسب التوقيت المحلي لمكان المؤسسة، ولحساب مواقيت الصلاة. في سويسرا: ${zone}.`,
		timeZoneNotListed: `إذا لم تكن مدينة المؤسسة في القائمة، فاختر مدينة لها دائمًا توقيت مدينة المؤسسة نفسه. لمعظم دول أوروبا: ${ZURICH} أو ${PARIS} أو ${BERLIN}.`,
		timeZoneEurope: 'أوروبا',
		timeZoneWorld: 'بقية العالم',
		create: 'إنشاء المؤسسة',
		manager: {
			legend: 'المسؤول عن المؤسسة (اختياري)',
			intro:
				'إن كنت تعرف بريده الإلكتروني، تُرسل إليه الدعوة فور إنشاء المؤسسة. وإلا فاترك الحقل فارغًا: يمكنك دعوته لاحقًا من قائمة المؤسسات.'
		},
		invite: {
			summary: 'دعوة المسؤول',
			help: 'تُرسل الدعوة بالبريد الإلكتروني. بقبولها يصبح الشخص مسؤولًا عن المؤسسة، دون أن تحتاج إلى الدخول إلى مساحتها.',
			emailLabel: 'البريد الإلكتروني للمسؤول',
			emailHint: 'مثال: name@example.org',
			languageLabel: 'لغة البريد الإلكتروني',
			languageHelp: 'تصل رسالة الدعوة إلى الشخص المدعو بهذه اللغة.',
			submit: 'إرسال الدعوة',
			sentTo: 'أُرسلت دعوة المسؤول إلى:',
			sentFor: 'المؤسسة:',
			validity: (days) => `تبقى صالحة ${days} يومًا. بقبولها يصبح هذا الشخص مسؤولًا عن المؤسسة.`
		},
		rescue: {
			title: 'رابط دخول احتياطي',
			when: 'استعمله عندما لا يصل بريد تسجيل الدخول إلى شخص ما، مثلًا إذا تعطل إرسال الرسائل الإلكترونية.',
			what: 'يظهر الرابط هنا بدل أن يرسل بالبريد: أرسله إلى الشخص في رسالة، وعندما يفتحه يدخل إلى حسابه، كما مع الرابط المعتاد.',
			duration: 'يبقى صالحًا 15 دقيقة، ويعمل مرة واحدة فقط.',
			emailLabel: 'البريد الإلكتروني للشخص',
			emailHint: 'عنوان حسابه. مثال: name@example.org',
			submit: 'إنشاء رابط الدخول',
			resultTitle: 'رابط دخول للعنوان',
			resultCopy:
				'انسخه وأرسله إلى هذا الشخص في رسالة. يبقى صالحًا 15 دقيقة من لحظة إنشائه، ويعمل مرة واحدة فقط.',
			resultOpens:
				'يفتح حسابه ومؤسساته، دون صلاحيات المشرف العام، حتى لو كان العنوان عنوانك. وإن لم يكن للعنوان حساب بعد، ينشئ له حسابًا غير مرتبط بأي مؤسسة.',
			resultLog: 'يسجل هذا الرابط في سجل دخول المشرف العام.',
			linkLabel: 'رابط دخول احتياطي'
		},
		errors: {
			nameRequired: 'اكتب اسم المؤسسة.',
			invalidAddress: (example) =>
				`هذا العنوان غير مقبول. لا يجوز أن يحتوي إلا على أحرف لاتينية صغيرة بلا علامات، وأرقام، وشرطات غير متتالية، ولا شرطة في أوله ولا في آخره. مثال: ${example}`,
			noAddressFromName: (example) =>
				`لا يمكن اقتراح عنوان من هذا الاسم. اكتبه بنفسك، بأحرف لاتينية صغيرة بلا علامات، وأرقام، وشرطات. مثال: ${example}`,
			addressWithoutLetter: (example) =>
				`هذا العنوان ليس فيه إلا أرقام وشرطات. أضف إليه حرفًا لاتينيًا واحدًا على الأقل، مثلًا اسم المؤسسة بحروف لاتينية. مثال: ${example}`,
			addressTaken:
				'هذا العنوان مستعمل من قبل مؤسسة أخرى. اختر عنوانًا آخر، مثلًا بإضافة اسم المدينة.',
			unknownTimeZone: 'اختر المنطقة الزمنية من القائمة.',
			unknownStatus: 'اختر حالة من القائمة.',
			unknownOrganisation: 'هذه المؤسسة غير موجودة، أو لم تعد موجودة.',
			linkFailed: 'تعذر إنشاء الرابط. أعد المحاولة بعد دقيقة.',
			invalidManagerEmail: 'عنوان المسؤول ليس بصيغة عنوان بريد إلكتروني. مثال: name@example.org'
		}
	}
};

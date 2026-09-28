// Les textes de l'écran « Membres » (`/membres`) : la liste des membres, les invitations en attente,
// et le formulaire d'invitation avec, sous le choix du rôle, ce que chaque rôle peut faire (étape 18,
// retour B3). Les noms des rôles et l'erreur d'adresse mal formée sont dans `common.ts`.
//
// La liste des gestes suit la liste qui fait foi, dans l'ADR 0046 : ce que les écrans ouvrent à chaque
// rôle, et ce que la base réserve au responsable depuis la migration 0059. Un geste ajouté ici doit
// l'être aussi à cet ADR, et `tests/membres-et-reglages.test.ts` les lie l'un à l'autre : chaque table
// que la base réserve doit être dite réservée à l'écran, chaque geste réservé est refusé à une
// éditrice, et chaque geste de l'éditeur, une éditrice le fait elle-même, par le formulaire de son
// écran. Le test prend ses gestes dans les deux listes ci-dessous : un geste ajouté ici sans sa preuve
// là-bas ne compile pas.

import { plural, type PluralForms, type Translations } from './space.js';

/** Ce que fait un éditeur, et donc toute personne membre, dans l'ordre de l'écran. */
export const EDITOR_GESTURES = [
	'week',
	'sessions',
	'courses',
	'pauses',
	'friday',
	'share',
	'language',
	'switchOrganisation',
	'acceptance',
	'leave'
] as const;

/**
 * Ce qui est réservé au responsable, en plus, dans l'ordre de l'écran. Supprimer un cours vient
 * d'abord, comme l'écran Cours dans la navigation : la base le réserve depuis la migration 0065, et
 * l'écran le propose depuis le lot 2 de l'étape 19.
 */
export const MANAGER_GESTURES = [
	'deleteCourse',
	'members',
	'invitations',
	'roles',
	'remove',
	'settings',
	'rooms',
	'prayerSwitch',
	'prayerTimes'
] as const;

export type EditorGesture = (typeof EDITOR_GESTURES)[number];
export type ManagerGesture = (typeof MANAGER_GESTURES)[number];

/** Les formes arabes selon le nombre (voir `plural`). Le code de la langue reste hors des textes. */
function arabic(count: number, forms: PluralForms): string {
	return plural('ar', count, forms);
}

interface MembersTexts {
	/** Le titre de l'onglet ; le titre de la page est le nom de l'organisation. */
	readonly title: string;
	readonly intro: string;
	readonly membersTitle: string;
	/** À côté de sa propre adresse, entre parenthèses. */
	readonly you: string;
	/** « Rôle : responsable ». */
	readonly role: (role: string) => string;
	readonly giveRole: { readonly org_admin: string; readonly editor: string };
	readonly remove: string;
	readonly removeHelp: string;
	readonly pendingTitle: string;
	readonly pendingNone: string;
	/** Les deux dates d'une invitation en attente, déjà écrites JJ.MM.AAAA. */
	readonly pendingDates: (sent: string, until: string) => string;
	readonly cancelInvitation: string;
	readonly inviteTitle: string;
	/** Ce que reçoit la personne invitée, et combien de jours vaut l'invitation. */
	readonly inviteIntro: (days: number) => string;
	readonly emailLabel: string;
	readonly emailHelp: string;
	/**
	 * Le choix de la langue du courriel d'invitation (étape 19) : la personne qui invite la choisit,
	 * celle de son écran d'abord. Les langues s'y écrivent dans leur langue, comme dans le choix de
	 * la langue de l'écran.
	 */
	readonly emailLanguageLabel: string;
	readonly emailLanguageHelp: string;
	readonly roleLabel: string;
	readonly roleOptions: { readonly editor: string; readonly org_admin: string };
	readonly editorCan: string;
	readonly managerOnly: string;
	readonly gestures: {
		readonly editor: { readonly [G in EditorGesture]: string };
		readonly manager: { readonly [G in ManagerGesture]: string };
	};
	readonly alwaysOneManager: string;
	/**
	 * La seule réponse de l'invitation, quelle que soit l'adresse (ADR 0017). Avant le bouton : le
	 * correcteur relit les textes à la suite, et « Send the invitation The invitation has been sent »
	 * passait pour une répétition.
	 */
	readonly sent: string;
	/**
	 * Ce que la page dit après les trois gestes sur un membre ou une invitation : sans message, la
	 * ligne disparaissait ou changeait sans rien dire, et l'on doutait que le geste ait porté.
	 */
	readonly done: {
		readonly cancelled: string;
		readonly removed: string;
		/** Le nouveau rôle, déjà écrit dans la langue de l'écran (`common.ts`). */
		readonly roleChanged: (role: string) => string;
	};
	/**
	 * La demande de confirmation avant de retirer un membre ou de changer un rôle (étape 19), en haut
	 * de l'écran, comme celle d'une salle occupée. Devant l'adresse du membre, puis ce que le geste
	 * fera. Une responsable qui se vise elle-même lit des phrases qui parlent d'elle, sans son
	 * adresse. Le lien `keep` ramène à l'écran sans rien envoyer.
	 */
	readonly confirm: {
		readonly removeIntro: string;
		readonly removeButton: string;
		readonly removeSelf: string;
		readonly removeSelfWhat: string;
		readonly removeSelfButton: string;
		readonly roleIntro: { readonly org_admin: string; readonly editor: string };
		readonly roleWhat: { readonly org_admin: string; readonly editor: string };
		readonly roleButton: string;
		readonly selfEditor: string;
		readonly selfEditorWhat: string;
		readonly selfEditorButton: string;
		readonly keep: string;
	};
	readonly send: string;
	readonly errors: {
		readonly notManager: string;
		readonly unknownRole: string;
		readonly lastManager: string;
		/** Une adhésion que l'écran ne trouve pas dans l'organisation, ou un identifiant mal formé. */
		readonly memberGone: string;
	};
}

export const membersTexts: Translations<MembersTexts> = {
	fr: {
		title: 'Membres',
		intro:
			'Les personnes qui gèrent avec vous le programme de votre organisation, et celles que vous avez invitées.',
		membersTitle: 'Membres',
		you: 'vous',
		role: (role) => `Rôle : ${role}`,
		giveRole: {
			org_admin: 'Donner le rôle de responsable',
			editor: 'Donner le rôle d’éditeur'
		},
		remove: 'Retirer de l’organisation',
		removeHelp:
			'Une personne retirée n’entre plus dans l’espace de votre organisation. Son compte reste, et vous pouvez l’inviter de nouveau.',
		pendingTitle: 'Invitations en attente',
		pendingNone: 'Aucune invitation en attente.',
		pendingDates: (sent, until) => `Envoyée le ${sent}, valable jusqu’au ${until}`,
		cancelInvitation: 'Annuler l’invitation',
		inviteTitle: 'Inviter une personne',
		inviteIntro: (days) =>
			`La personne reçoit un courriel avec un lien pour se connecter. L’invitation vaut ${days} jours. La personne apparaît parmi les membres quand elle a accepté ; avant, son nom ne s’affiche nulle part.`,
		emailLabel: 'Adresse électronique de la personne',
		emailHelp: 'Exemple : prenom.nom@exemple.ch',
		emailLanguageLabel: 'Langue du courriel',
		emailLanguageHelp: 'La personne invitée reçoit le courriel dans cette langue.',
		roleLabel: 'Rôle',
		roleOptions: { editor: 'Éditeur', org_admin: 'Responsable' },
		editorCan: 'Ce que peut faire un éditeur',
		managerOnly: 'Réservé au responsable, en plus de tout ce que fait un éditeur',
		gestures: {
			editor: {
				week: 'Voir les séances des sept prochains jours et copier les messages prêts à coller',
				sessions:
					'Annuler une séance, la déplacer à une autre date ou à une autre heure, puis la rétablir',
				courses: 'Créer un cours, le modifier et le publier',
				pauses: 'Poser une pause, par exemple pendant les vacances, puis la retirer',
				friday:
					'Quand les heures de prière sont activées : ajouter une prière du vendredi, la modifier, la publier, l’annuler, la déplacer ou la supprimer',
				share: 'Partager le programme : le lien, le code QR et le code à coller sur un site',
				language: 'Choisir la langue de son espace',
				// Pas « Changer d’organisation » : c'est le libellé du lien de la coquille, qui doit
				// rester le seul de la page à le porter.
				switchOrganisation: 'Passer d’une organisation à l’autre, quand on est membre de plusieurs',
				acceptance: 'Accepter les conditions d’utilisation et les invitations reçues',
				leave: 'Quitter une organisation dont on est membre'
			},
			manager: {
				deleteCourse: 'Supprimer un cours',
				members: 'Voir les membres, leur rôle et les invitations en attente',
				invitations:
					'Inviter une personne, comme éditeur ou comme responsable, et annuler une invitation',
				roles: 'Changer le rôle d’un membre',
				remove: 'Retirer un membre de l’organisation',
				settings:
					'Modifier les réglages : nom, fuseau horaire, couleur, formule d’accueil et langues de la page publique',
				rooms: 'Ajouter ou supprimer une salle',
				prayerSwitch: 'Activer ou désactiver les heures de prière',
				prayerTimes:
					'Régler les heures de prière : le calcul, l’import d’un fichier, les horaires saisis à la main et le modèle à télécharger'
			}
		},
		alwaysOneManager: 'Une organisation garde toujours au moins une personne responsable.',
		sent: 'L’invitation a été envoyée à cette adresse.',
		done: {
			cancelled: 'L’invitation est annulée : la personne ne peut plus l’accepter.',
			removed: 'La personne a été retirée de votre organisation.',
			roleChanged: (role) => `Le rôle a été changé. Nouveau rôle : ${role}.`
		},
		confirm: {
			removeIntro: 'Vous allez retirer cette personne de l’organisation :',
			removeButton: 'Retirer cette personne',
			removeSelf: 'Vous allez vous retirer vous-même de l’organisation.',
			removeSelfWhat:
				'Son espace ne vous sera plus ouvert. Pour y revenir, il faudra qu’une personne responsable vous invite de nouveau.',
			removeSelfButton: 'Me retirer de l’organisation',
			roleIntro: {
				org_admin: 'Vous allez donner le rôle de responsable à cette personne :',
				editor: 'Vous allez donner le rôle d’éditeur à cette personne :'
			},
			roleWhat: {
				org_admin:
					'Elle pourra faire tout ce qui est réservé au responsable, membres et réglages compris.',
				editor:
					'Elle gérera toujours les cours et le programme, mais n’ouvrira plus les écrans réservés aux responsables, comme Membres et Réglages.'
			},
			roleButton: 'Donner ce rôle',
			selfEditor: 'Vous allez vous donner le rôle d’éditeur.',
			selfEditorWhat:
				'Les écrans réservés aux responsables, comme Membres et Réglages, ne vous seront plus ouverts. Pour les retrouver, il faudra qu’une autre personne responsable vous redonne le rôle de responsable.',
			selfEditorButton: 'Prendre le rôle d’éditeur',
			keep: 'Ne rien changer'
		},
		send: 'Envoyer l’invitation',
		errors: {
			notManager: 'Seule une personne responsable peut faire cela.',
			unknownRole: 'Ce rôle n’existe pas. Choisissez éditeur ou responsable.',
			lastManager:
				'Une organisation doit toujours garder au moins une personne responsable. Donnez d’abord ce rôle à une autre personne.',
			memberGone: 'Cette personne ne fait plus partie de l’organisation.'
		}
	},
	de: {
		title: 'Mitglieder',
		intro:
			'Die Personen, die das Programm Ihrer Organisation mit Ihnen verwalten, und die Personen, die Sie eingeladen haben.',
		membersTitle: 'Mitglieder',
		you: 'Sie',
		role: (role) => `Rolle: ${role}`,
		giveRole: {
			org_admin: 'Rolle «Leitung» vergeben',
			editor: 'Rolle «Redaktion» vergeben'
		},
		remove: 'Aus der Organisation entfernen',
		removeHelp:
			'Eine entfernte Person hat keinen Zugang mehr zum Bereich Ihrer Organisation. Ihr Konto bleibt bestehen, und Sie können sie wieder einladen.',
		pendingTitle: 'Offene Einladungen',
		pendingNone: 'Keine offenen Einladungen.',
		pendingDates: (sent, until) => `Gesendet am ${sent}, gültig bis ${until}`,
		cancelInvitation: 'Einladung zurückziehen',
		inviteTitle: 'Eine Person einladen',
		inviteIntro: (days) =>
			`Die Person erhält eine E-Mail mit einem Link zum Anmelden, und die Einladung gilt ${days} Tage. Sobald sie angenommen hat, erscheint sie unter den Mitgliedern; vorher wird ihr Name nirgends angezeigt.`,
		emailLabel: 'E-Mail-Adresse der Person',
		emailHelp: 'Beispiel: vorname.name@beispiel.ch',
		emailLanguageLabel: 'Sprache der E-Mail',
		emailLanguageHelp: 'Die eingeladene Person erhält die E-Mail in dieser Sprache.',
		roleLabel: 'Rolle',
		roleOptions: { editor: 'Redaktion', org_admin: 'Leitung' },
		editorCan: 'Was die Redaktion tun kann',
		managerOnly: 'Nur für die Leitung, zusätzlich zu allem, was die Redaktion tut',
		gestures: {
			editor: {
				week: 'Die Termine der nächsten sieben Tage sehen und die vorbereiteten Nachrichten kopieren',
				sessions:
					'Einen Termin absagen, auf ein anderes Datum oder eine andere Uhrzeit verschieben und wiederherstellen',
				courses: 'Einen Kurs erstellen, ändern und veröffentlichen',
				pauses: 'Eine Pause eintragen, zum Beispiel während der Ferien, und wieder entfernen',
				friday:
					'Wenn die Gebetszeiten aktiviert sind: ein Freitagsgebet hinzufügen, ändern, veröffentlichen, absagen, verschieben oder löschen',
				share: 'Das Programm teilen: den Link, den QR-Code und den Code für eine Website',
				language: 'Die Sprache des eigenen Bereichs wählen',
				switchOrganisation: 'Zwischen Organisationen wechseln, wenn man Mitglied mehrerer ist',
				acceptance: 'Die Nutzungsbedingungen und erhaltene Einladungen annehmen',
				leave: 'Eine Organisation verlassen, in der man Mitglied ist'
			},
			manager: {
				deleteCourse: 'Einen Kurs löschen',
				members: 'Die Mitglieder, ihre Rolle und die offenen Einladungen sehen',
				invitations:
					'Eine Person für die Redaktion oder die Leitung einladen und eine Einladung zurückziehen',
				roles: 'Die Rolle eines Mitglieds ändern',
				remove: 'Ein Mitglied aus der Organisation entfernen',
				settings:
					'Die Einstellungen ändern: Name, Zeitzone, Farbe, Grussformel und Sprachen der öffentlichen Seite',
				rooms: 'Einen Raum hinzufügen oder löschen',
				prayerSwitch: 'Die Gebetszeiten aktivieren oder deaktivieren',
				prayerTimes:
					'Die Gebetszeiten einstellen: die Berechnung, den Import einer Datei, die von Hand erfassten Zeiten und die Vorlage zum Herunterladen'
			}
		},
		alwaysOneManager: 'Eine Organisation behält immer mindestens eine Person in der Leitung.',
		sent: 'Die Einladung wurde an diese Adresse gesendet.',
		done: {
			cancelled: 'Sie haben die Einladung zurückgezogen. Die Person kann sie nicht mehr annehmen.',
			removed: 'Sie haben die Person aus Ihrer Organisation entfernt.',
			roleChanged: (role) => `Die Rolle wurde geändert. Neue Rolle: ${role}.`
		},
		confirm: {
			removeIntro: 'Sie sind dabei, diese Person aus der Organisation zu entfernen:',
			removeButton: 'Person entfernen',
			removeSelf: 'Sie sind dabei, sich selbst aus der Organisation zu entfernen.',
			removeSelfWhat:
				'Danach haben Sie keinen Zugang mehr zu ihrem Bereich. Um zurückzukommen, brauchen Sie eine neue Einladung von einer Person in der Leitung.',
			removeSelfButton: 'Mich aus der Organisation entfernen',
			roleIntro: {
				org_admin: 'Sie sind dabei, dieser Person die Rolle «Leitung» zu geben:',
				editor: 'Sie sind dabei, dieser Person die Rolle «Redaktion» zu geben:'
			},
			roleWhat: {
				org_admin:
					'Sie kann dann alles tun, was der Leitung vorbehalten ist, auch Mitglieder und Einstellungen verwalten.',
				editor:
					'Sie verwaltet weiterhin die Kurse und das Programm, öffnet aber die Seiten nicht mehr, die der Leitung vorbehalten sind, zum Beispiel «Mitglieder» und «Einstellungen».'
			},
			roleButton: 'Diese Rolle geben',
			selfEditor: 'Sie sind dabei, sich selbst die Rolle «Redaktion» zu geben.',
			selfEditorWhat:
				'Die Seiten, die der Leitung vorbehalten sind, zum Beispiel «Mitglieder» und «Einstellungen», stehen Ihnen dann nicht mehr offen. Um sie wieder zu öffnen, muss Ihnen eine andere Person in der Leitung die Rolle «Leitung» zurückgeben.',
			selfEditorButton: 'Rolle «Redaktion» übernehmen',
			keep: 'Nichts ändern'
		},
		send: 'Einladung senden',
		errors: {
			notManager: 'Das darf nur die Leitung.',
			unknownRole: 'Diese Rolle gibt es nicht. Wählen Sie Redaktion oder Leitung.',
			lastManager:
				'Eine Organisation muss immer mindestens eine Person in der Leitung behalten. Geben Sie diese Rolle zuerst einer anderen Person.',
			memberGone: 'Diese Person gehört nicht mehr zur Organisation.'
		}
	},
	it: {
		title: 'Membri',
		intro:
			'Le persone che gestiscono con te il programma della tua organizzazione, e quelle che hai invitato.',
		membersTitle: 'Membri',
		you: 'tu',
		role: (role) => `Ruolo: ${role}`,
		giveRole: {
			org_admin: 'Dai il ruolo di responsabile',
			editor: 'Dai il ruolo di redattore'
		},
		remove: 'Rimuovi dall’organizzazione',
		removeHelp:
			'Una persona rimossa non entra più nell’area della tua organizzazione. Il suo account resta e puoi invitarla di nuovo.',
		pendingTitle: 'Inviti in attesa',
		pendingNone: 'Nessun invito in attesa.',
		pendingDates: (sent, until) => `Inviato il ${sent}, valido fino al ${until}`,
		cancelInvitation: 'Annulla l’invito',
		inviteTitle: 'Invita una persona',
		inviteIntro: (days) =>
			`La persona riceve un’e-mail con un link per accedere. L’invito vale ${days} giorni. La persona compare tra i membri quando ha accettato; prima, il suo nome non appare da nessuna parte.`,
		emailLabel: 'Indirizzo e-mail della persona',
		emailHelp: 'Esempio: nome.cognome@esempio.ch',
		emailLanguageLabel: 'Lingua dell’e-mail',
		emailLanguageHelp: 'La persona invitata riceve l’e-mail in questa lingua.',
		roleLabel: 'Ruolo',
		roleOptions: { editor: 'Redattore', org_admin: 'Responsabile' },
		editorCan: 'Cosa può fare un redattore',
		managerOnly: 'Riservato al responsabile, oltre a tutto ciò che fa un redattore',
		gestures: {
			editor: {
				week: 'Vedere le lezioni dei prossimi sette giorni e copiare i messaggi pronti da incollare',
				sessions:
					'Annullare una lezione, spostarla a un’altra data o a un’altra ora, poi ripristinarla',
				courses: 'Creare un corso, modificarlo e pubblicarlo',
				pauses: 'Inserire una pausa, per esempio durante le vacanze, poi toglierla',
				friday:
					'Quando gli orari di preghiera sono attivi: aggiungere una preghiera del venerdì, modificarla, pubblicarla, annullarla, spostarla o eliminarla',
				share:
					'Condividere il programma: il link, il codice QR e il codice da incollare su un sito',
				language: 'Scegliere la lingua della propria area',
				switchOrganisation:
					'Passare da un’organizzazione all’altra, per chi è membro di più di una',
				acceptance: 'Accettare le condizioni d’uso e gli inviti ricevuti',
				leave: 'Lasciare un’organizzazione di cui si è membri'
			},
			manager: {
				deleteCourse: 'Eliminare un corso',
				members: 'Vedere i membri, il loro ruolo e gli inviti in attesa',
				invitations:
					'Invitare una persona, come redattore o come responsabile, e annullare un invito',
				roles: 'Cambiare il ruolo di un membro',
				remove: 'Rimuovere un membro dall’organizzazione',
				settings:
					'Modificare le impostazioni: nome, fuso orario, colore, formula di saluto e lingue della pagina pubblica',
				rooms: 'Aggiungere o eliminare una sala',
				prayerSwitch: 'Attivare o disattivare gli orari di preghiera',
				prayerTimes:
					'Impostare gli orari di preghiera: il calcolo, l’importazione di un file, gli orari inseriti a mano e il modello da scaricare'
			}
		},
		alwaysOneManager: 'Un’organizzazione ha sempre almeno un responsabile.',
		sent: 'L’invito è stato inviato a questo indirizzo.',
		done: {
			cancelled: 'L’invito è annullato: la persona non può più accettarlo.',
			removed: 'La persona è stata rimossa dalla tua organizzazione.',
			roleChanged: (role) => `Il ruolo è stato cambiato. Nuovo ruolo: ${role}.`
		},
		confirm: {
			removeIntro: 'Stai per rimuovere questa persona dall’organizzazione:',
			removeButton: 'Rimuovi questa persona',
			removeSelf: 'Stai per lasciare l’organizzazione.',
			removeSelfWhat:
				'Non potrai più entrare nella sua area. Per tornare, ti servirà un nuovo invito da un responsabile.',
			removeSelfButton: 'Lascia l’organizzazione',
			roleIntro: {
				org_admin: 'Stai per dare il ruolo di responsabile a questa persona:',
				editor: 'Stai per dare il ruolo di redattore a questa persona:'
			},
			roleWhat: {
				org_admin:
					'Potrà fare tutto ciò che è riservato al responsabile, compresi membri e impostazioni.',
				editor:
					'Continuerà a gestire i corsi e il programma, ma non aprirà più le pagine riservate ai responsabili, come Membri e Impostazioni.'
			},
			roleButton: 'Dai questo ruolo',
			selfEditor: 'Stai per darti il ruolo di redattore.',
			selfEditorWhat:
				'Le pagine riservate ai responsabili, come Membri e Impostazioni, non ti saranno più accessibili. Per riaverle, un altro responsabile dovrà ridarti il ruolo di responsabile.',
			selfEditorButton: 'Prendi il ruolo di redattore',
			keep: 'Non cambiare nulla'
		},
		send: 'Invia l’invito',
		errors: {
			notManager: 'Solo un responsabile può farlo.',
			unknownRole: 'Questo ruolo non esiste. Scegli redattore o responsabile.',
			lastManager:
				'Un’organizzazione deve avere sempre almeno un responsabile. Prima dai questo ruolo a un’altra persona.',
			memberGone: 'Questa persona non fa più parte dell’organizzazione.'
		}
	},
	en: {
		title: 'Members',
		intro:
			'The people who manage your organisation’s programme with you, and the people you have invited.',
		membersTitle: 'Members',
		you: 'you',
		role: (role) => `Role: ${role}`,
		giveRole: {
			org_admin: 'Make manager',
			editor: 'Make editor'
		},
		remove: 'Remove from the organisation',
		removeHelp:
			'A removed person can no longer enter your organisation’s area. Their account stays, and you can invite them again.',
		pendingTitle: 'Pending invitations',
		pendingNone: 'No pending invitations.',
		pendingDates: (sent, until) => `Sent on ${sent}, valid until ${until}`,
		cancelInvitation: 'Cancel the invitation',
		inviteTitle: 'Invite someone',
		inviteIntro: (days) =>
			`The person receives an email with a link to sign in. The invitation lasts ${days} days. They appear among the members once they have accepted; until then, their name is not shown anywhere.`,
		emailLabel: 'Email address of the person',
		emailHelp: 'Example: first.last@example.ch',
		emailLanguageLabel: 'Language of the email',
		emailLanguageHelp: 'The person you invite receives the email in this language.',
		roleLabel: 'Role',
		roleOptions: { editor: 'Editor', org_admin: 'Manager' },
		editorCan: 'What an editor can do',
		managerOnly: 'Reserved for managers, on top of everything an editor does',
		gestures: {
			editor: {
				week: 'See the sessions of the next seven days and copy the ready-to-paste messages',
				sessions: 'Cancel a session, move it to another date or time, then restore it',
				courses: 'Create a course, edit it and publish it',
				pauses: 'Add a break, for example during the holidays, then remove it',
				friday:
					'When prayer times are switched on: add a Friday prayer, edit it, publish it, cancel it, move it or delete it',
				share: 'Share the programme: the link, the QR code and the code to paste into a website',
				language: 'Choose the language of their own area',
				switchOrganisation: 'Switch between organisations, for someone who is a member of several',
				acceptance: 'Accept the terms of use and the invitations received',
				leave: 'Leave an organisation they are a member of'
			},
			manager: {
				deleteCourse: 'Delete a course',
				members: 'See the members, their role and the pending invitations',
				invitations: 'Invite someone, as an editor or as a manager, and cancel an invitation',
				roles: 'Change the role of a member',
				remove: 'Remove a member from the organisation',
				settings:
					'Change the settings: name, time zone, colour, greeting and languages of the public page',
				rooms: 'Add or delete a room',
				prayerSwitch: 'Switch prayer times on or off',
				prayerTimes:
					'Set the prayer times: the calculation, importing a file, the times entered by hand and the template to download'
			}
		},
		alwaysOneManager: 'An organisation always keeps at least one manager.',
		sent: 'The invitation has been sent to this address.',
		done: {
			cancelled: 'The invitation is cancelled: the person can no longer accept it.',
			removed: 'The person has been removed from your organisation.',
			roleChanged: (role) => `The role has been changed. New role: ${role}.`
		},
		confirm: {
			removeIntro: 'You are about to remove this person from the organisation:',
			removeButton: 'Remove this person',
			removeSelf: 'You are about to remove yourself from the organisation.',
			removeSelfWhat:
				'Its area will no longer be open to you. To come back, you will need a new invitation from a manager.',
			removeSelfButton: 'Remove myself from the organisation',
			roleIntro: {
				org_admin: 'You are about to give the manager role to this person:',
				editor: 'You are about to give the editor role to this person:'
			},
			roleWhat: {
				org_admin:
					'They will be able to do everything reserved for managers, including members and settings.',
				editor:
					'They will still manage the courses and the programme, but will no longer open the screens reserved for managers, such as Members and Settings.'
			},
			roleButton: 'Give this role',
			selfEditor: 'You are about to give yourself the editor role.',
			selfEditorWhat:
				'The screens reserved for managers, such as Members and Settings, will no longer be open to you. To get them back, another manager will have to give you the manager role again.',
			selfEditorButton: 'Take the editor role',
			keep: 'Change nothing'
		},
		send: 'Send the invitation',
		errors: {
			notManager: 'Only a manager can do this.',
			unknownRole: 'This role does not exist. Choose editor or manager.',
			lastManager:
				'An organisation must always keep at least one manager. First give this role to someone else.',
			memberGone: 'This person is no longer part of the organisation.'
		}
	},
	ar: {
		title: 'الأعضاء',
		intro: 'الأشخاص الذين يديرون برنامج مؤسستك معك، والأشخاص الذين دعوتهم.',
		membersTitle: 'الأعضاء',
		you: 'أنت',
		role: (role) => `الدور: ${role}`,
		giveRole: {
			org_admin: 'منح دور المسؤول',
			editor: 'منح دور المحرر'
		},
		remove: 'إزالة العضو من المؤسسة',
		removeHelp:
			'لا يستطيع الشخص الذي أُزيل دخول مساحة مؤسستك بعد ذلك. يبقى حسابه، ويمكنك دعوته من جديد.',
		pendingTitle: 'الدعوات المعلقة',
		pendingNone: 'لا توجد دعوات معلقة.',
		pendingDates: (sent, until) => `أُرسلت في ${sent}، صالحة حتى ${until}`,
		cancelInvitation: 'إلغاء الدعوة',
		inviteTitle: 'دعوة شخص',
		inviteIntro: (days) =>
			`يتلقى الشخص رسالة بريد إلكتروني فيها رابط لتسجيل الدخول. تبقى الدعوة صالحة ${arabic(days, {
				one: 'يومًا واحدًا',
				two: 'يومين',
				few: `${days} أيام`,
				many: `${days} يومًا`,
				other: `${days} يوم`
			})}. يظهر الشخص بين الأعضاء بعد أن يقبل الدعوة، وقبل ذلك لا يظهر اسمه في أي مكان.`,
		emailLabel: 'عنوان البريد الإلكتروني للشخص',
		emailHelp: 'مثال: name@example.ch',
		emailLanguageLabel: 'لغة البريد الإلكتروني',
		emailLanguageHelp: 'تصل رسالة الدعوة إلى الشخص المدعو بهذه اللغة.',
		roleLabel: 'الدور',
		roleOptions: { editor: 'محرر', org_admin: 'مسؤول' },
		editorCan: 'ما يمكن للمحرر فعله',
		managerOnly: 'خاص بالمسؤول، إضافة إلى ما يفعله المحرر',
		gestures: {
			editor: {
				week: 'عرض حصص الأيام السبعة القادمة ونسخ الرسائل الجاهزة',
				sessions: 'إلغاء حصة أو نقلها إلى تاريخ آخر أو ساعة أخرى، ثم إعادتها',
				courses: 'إنشاء درس وتعديله ونشره',
				pauses: 'إضافة عطلة، في الإجازات مثلًا، ثم إزالتها',
				friday: 'عند تفعيل مواقيت الصلاة: إضافة صلاة جمعة وتعديلها ونشرها وإلغاؤها ونقلها أو حذفها',
				share: 'مشاركة البرنامج: الرابط ورمز QR والشيفرة التي تُلصق في موقع',
				language: 'اختيار لغة مساحته',
				switchOrganisation: 'الانتقال من مؤسسة إلى أخرى لمن هو عضو في أكثر من مؤسسة',
				acceptance: 'قبول شروط الاستخدام والدعوات الواردة',
				leave: 'مغادرة مؤسسة يكون عضوًا فيها'
			},
			manager: {
				deleteCourse: 'حذف درس',
				members: 'عرض الأعضاء وأدوارهم والدعوات المعلقة',
				invitations: 'دعوة شخص بصفة محرر أو مسؤول، وإلغاء دعوة',
				roles: 'تغيير دور عضو',
				remove: 'إزالة عضو من المؤسسة',
				settings:
					'تعديل الإعدادات: الاسم والمنطقة الزمنية واللون وعبارة الترحيب ولغات الصفحة العامة',
				rooms: 'إضافة قاعة أو حذفها',
				prayerSwitch: 'تفعيل مواقيت الصلاة أو إيقافها',
				prayerTimes:
					'ضبط مواقيت الصلاة: الحساب واستيراد ملف والمواقيت المدخلة يدويًا والنموذج الذي يُنزَّل'
			}
		},
		alwaysOneManager: 'تحتفظ المؤسسة دائمًا بمسؤول واحد أو أكثر.',
		sent: 'أُرسلت الدعوة إلى هذا العنوان.',
		done: {
			cancelled: 'أُلغيت الدعوة، ولم يعد بإمكان الشخص قبولها.',
			removed: 'أُزيل الشخص من مؤسستك.',
			roleChanged: (role) => `تم تغيير الدور. الدور الجديد: ${role}.`
		},
		confirm: {
			removeIntro: 'أنت على وشك إزالة هذا الشخص من المؤسسة:',
			removeButton: 'إزالة هذا الشخص',
			removeSelf: 'أنت على وشك إزالة نفسك من المؤسسة.',
			removeSelfWhat:
				'لن تستطيع دخول مساحتها بعد ذلك. وللعودة إليها تحتاج إلى دعوة جديدة من أحد المسؤولين.',
			removeSelfButton: 'إزالة نفسي من المؤسسة',
			roleIntro: {
				org_admin: 'أنت على وشك منح دور المسؤول لهذا الشخص:',
				editor: 'أنت على وشك منح دور المحرر لهذا الشخص:'
			},
			roleWhat: {
				org_admin: 'سيتمكن من فعل كل ما هو خاص بالمسؤول، بما في ذلك الأعضاء والإعدادات.',
				editor:
					'سيبقى يدير الدروس والبرنامج، لكنه لن يفتح بعد ذلك الصفحات الخاصة بالمسؤولين، مثل «الأعضاء» و«الإعدادات».'
			},
			roleButton: 'منح هذا الدور',
			selfEditor: 'أنت على وشك أن تمنح نفسك دور المحرر.',
			selfEditorWhat:
				'لن تبقى الصفحات الخاصة بالمسؤولين، مثل «الأعضاء» و«الإعدادات»، مفتوحة لك. ولاستعادتها يجب أن يمنحك مسؤول آخر دور المسؤول من جديد.',
			selfEditorButton: 'أخذ دور المحرر',
			keep: 'إبقاء كل شيء كما هو'
		},
		send: 'إرسال الدعوة',
		errors: {
			notManager: 'هذا الإجراء خاص بالمسؤول.',
			unknownRole: 'هذا الدور غير موجود. اختر دور المحرر أو دور المسؤول.',
			lastManager:
				'يجب أن يبقى في المؤسسة دائمًا مسؤول واحد أو أكثر. امنح هذا الدور لشخص آخر أولًا.',
			memberGone: 'لم يعد هذا الشخص عضوًا في المؤسسة.'
		}
	}
};

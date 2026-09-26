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
	'acceptance'
] as const;

/** Ce qui est réservé au responsable, en plus, dans l'ordre de l'écran. */
export const MANAGER_GESTURES = [
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
	readonly send: string;
	readonly errors: {
		readonly notManager: string;
		readonly unknownRole: string;
		readonly lastManager: string;
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
				acceptance: 'Accepter les conditions d’utilisation et les invitations reçues'
			},
			manager: {
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
		send: 'Envoyer l’invitation',
		errors: {
			notManager: 'Seule une personne responsable peut faire cela.',
			unknownRole: 'Ce rôle n’existe pas. Choisissez éditeur ou responsable.',
			lastManager:
				'Une organisation doit toujours garder au moins une personne responsable. Donnez d’abord ce rôle à une autre personne.'
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
				acceptance: 'Die Nutzungsbedingungen und erhaltene Einladungen annehmen'
			},
			manager: {
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
		send: 'Einladung senden',
		errors: {
			notManager: 'Das darf nur die Leitung.',
			unknownRole: 'Diese Rolle gibt es nicht. Wählen Sie Redaktion oder Leitung.',
			lastManager:
				'Eine Organisation muss immer mindestens eine Person in der Leitung behalten. Geben Sie diese Rolle zuerst einer anderen Person.'
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
				acceptance: 'Accettare le condizioni d’uso e gli inviti ricevuti'
			},
			manager: {
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
		send: 'Invia l’invito',
		errors: {
			notManager: 'Solo un responsabile può farlo.',
			unknownRole: 'Questo ruolo non esiste. Scegli redattore o responsabile.',
			lastManager:
				'Un’organizzazione deve avere sempre almeno un responsabile. Prima dai questo ruolo a un’altra persona.'
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
				acceptance: 'Accept the terms of use and the invitations received'
			},
			manager: {
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
		send: 'Send the invitation',
		errors: {
			notManager: 'Only a manager can do this.',
			unknownRole: 'This role does not exist. Choose editor or manager.',
			lastManager:
				'An organisation must always keep at least one manager. First give this role to someone else.'
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
				acceptance: 'قبول شروط الاستخدام والدعوات الواردة'
			},
			manager: {
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
		send: 'إرسال الدعوة',
		errors: {
			notManager: 'هذا الإجراء خاص بالمسؤول.',
			unknownRole: 'هذا الدور غير موجود. اختر محررًا أو مسؤولًا.',
			lastManager:
				'يجب أن يبقى في المؤسسة دائمًا مسؤول واحد أو أكثر. امنح هذا الدور لشخص آخر أولًا.'
		}
	}
};

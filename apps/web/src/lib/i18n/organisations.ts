// Les textes de l'écran « Vos organisations » (`/organisations`) : le choix de l'organisation après la
// connexion, les invitations reçues, et, depuis l'étape 19, le départ d'une organisation. Les noms des
// rôles sont dans `common.ts`. Depuis l'étape 20, l'écran d'acceptation des conditions reprend les
// phrases du départ (`confirmLeave`, `errors`), sauf `lastManagerWhat`, qu'il a en propre (`terms.ts`).

import type { Translations } from './space.js';

interface OrganisationsTexts {
	readonly title: string;
	/**
	 * L'encadré de l'arrivée, après un départ : depuis cet écran, ou depuis Membres pour une
	 * responsable qui s'est retirée elle-même (étape 19), ou depuis l'écran d'acceptation des
	 * conditions (étape 20). Il ne nomme pas l'organisation : la base ne la montre plus à qui l'a
	 * quittée.
	 */
	readonly left: string;
	readonly chooseIntro: string;
	/** « Rôle : responsable ». */
	readonly role: (role: string) => string;
	/** Le bouton de chaque organisation de la liste. */
	readonly leave: string;
	readonly rolesHelp: string;
	/**
	 * La demande de confirmation d'un départ, en haut de l'écran : devant le nom de l'organisation,
	 * puis ce que le départ fera. Le lien `stay` ramène à l'écran sans rien envoyer.
	 */
	readonly confirmLeave: {
		readonly intro: string;
		readonly what: string;
		readonly button: string;
		readonly stay: string;
	};
	/**
	 * Après le refus fait à la seule personne responsable, ce qu'elle doit faire pour partir. L'écran
	 * d'acceptation des conditions a sa propre phrase : « ouvrez-la » l'y ramènerait (`terms.ts`).
	 */
	readonly lastManagerWhat: string;
	readonly none: string;
	/** Devant l'adresse du compte, pour que la personne sache laquelle donner. */
	readonly yourAddress: string;
	readonly invitationsTitle: string;
	readonly invitationsIntro: string;
	readonly accept: string;
	readonly errors: {
		readonly notMember: string;
		readonly invitationGone: string;
		/** Devant le nom de l'organisation que la seule personne responsable voulait quitter. */
		readonly lastManager: string;
	};
}

export const organisationsTexts: Translations<OrganisationsTexts> = {
	fr: {
		title: 'Vos organisations',
		left: 'Vous avez quitté l’organisation. Son espace ne vous est plus ouvert. Pour y revenir, demandez à une personne responsable de vous inviter de nouveau.',
		chooseIntro: 'Choisissez l’organisation dont vous voulez gérer le programme.',
		role: (role) => `Rôle : ${role}`,
		leave: 'Quitter l’organisation',
		rolesHelp:
			'Une personne responsable gère tout, membres et réglages compris. Un éditeur gère les cours et le programme.',
		confirmLeave: {
			intro: 'Vous allez quitter cette organisation :',
			what: 'Son espace ne vous sera plus ouvert. Pour y revenir, il faudra qu’une personne responsable vous invite de nouveau.',
			button: 'Confirmer le départ',
			stay: 'Rester dans l’organisation'
		},
		lastManagerWhat:
			'Une organisation garde toujours au moins une personne responsable. Avant de la quitter, ouvrez-la, puis, dans l’écran Membres, donnez le rôle de responsable à un autre membre ou invitez une personne comme responsable.',
		none: 'Votre compte n’est rattaché à aucune organisation pour le moment. Pour gérer le programme d’une organisation, il faut y être invité : demandez à la personne responsable de vous envoyer une invitation à votre adresse.',
		yourAddress: 'Votre adresse :',
		invitationsTitle: 'Invitations reçues',
		invitationsIntro:
			'En acceptant une invitation, vous devenez membre de l’organisation et vous gérez son programme avec elle.',
		accept: 'Accepter l’invitation',
		errors: {
			notMember: 'Vous n’êtes pas membre de cette organisation.',
			invitationGone:
				'Cette invitation n’est plus valable : elle a peut-être expiré ou été annulée. Demandez-en une nouvelle à la personne qui vous a invité.',
			lastManager: 'Vous êtes la seule personne responsable de cette organisation :'
		}
	},
	de: {
		title: 'Ihre Organisationen',
		left: 'Sie haben die Organisation verlassen. Der Bereich der Organisation steht Ihnen nicht mehr offen. Um zurückzukommen, bitten Sie eine Person in der Leitung, Sie wieder einzuladen.',
		chooseIntro: 'Wählen Sie die Organisation, deren Programm Sie verwalten möchten.',
		role: (role) => `Rolle: ${role}`,
		leave: 'Organisation verlassen',
		rolesHelp:
			'Die Leitung verwaltet alles, auch Mitglieder und Einstellungen. Die Redaktion verwaltet die Kurse und das Programm.',
		confirmLeave: {
			intro: 'Sie sind dabei, diese Organisation zu verlassen:',
			what: 'Danach haben Sie keinen Zugang mehr zu ihrem Bereich. Um zurückzukommen, brauchen Sie eine neue Einladung von einer Person in der Leitung.',
			button: 'Austritt bestätigen',
			stay: 'In der Organisation bleiben'
		},
		lastManagerWhat:
			'Eine Organisation behält immer mindestens eine Person in der Leitung. Bevor Sie sie verlassen, öffnen Sie sie und geben Sie auf der Seite «Mitglieder» einem anderen Mitglied die Rolle «Leitung», oder laden Sie eine Person für die Leitung ein.',
		none: 'Ihr Konto gehört zurzeit zu keiner Organisation. Um das Programm einer Organisation zu verwalten, brauchen Sie eine Einladung: Bitten Sie die verantwortliche Person, Ihnen eine Einladung an Ihre Adresse zu schicken.',
		yourAddress: 'Ihre Adresse:',
		invitationsTitle: 'Erhaltene Einladungen',
		invitationsIntro:
			'Wenn Sie eine Einladung annehmen, werden Sie Mitglied der Organisation und verwalten ihr Programm mit.',
		accept: 'Einladung annehmen',
		errors: {
			notMember: 'Sie sind nicht Mitglied dieser Organisation.',
			invitationGone:
				'Diese Einladung gilt nicht mehr: Sie ist vielleicht abgelaufen oder wurde zurückgezogen. Bitten Sie die Person, die Sie eingeladen hat, um eine neue.',
			lastManager: 'Sie sind die einzige Person in der Leitung dieser Organisation:'
		}
	},
	it: {
		title: 'Le tue organizzazioni',
		left: 'Hai lasciato l’organizzazione. La sua area non ti è più accessibile. Per tornare, chiedi a un responsabile di invitarti di nuovo.',
		chooseIntro: 'Scegli l’organizzazione di cui vuoi gestire il programma.',
		role: (role) => `Ruolo: ${role}`,
		leave: 'Lascia l’organizzazione',
		rolesHelp:
			'Un responsabile gestisce tutto, membri e impostazioni compresi. Un redattore gestisce i corsi e il programma.',
		confirmLeave: {
			intro: 'Stai per lasciare questa organizzazione:',
			what: 'Non potrai più entrare nella sua area. Per tornare, ti servirà un nuovo invito da un responsabile.',
			button: 'Conferma l’uscita',
			stay: 'Resta nell’organizzazione'
		},
		lastManagerWhat:
			'Un’organizzazione ha sempre almeno un responsabile. Prima di lasciarla, aprila e, nella pagina Membri, dai il ruolo di responsabile a un altro membro o invita una persona come responsabile.',
		none: 'Per ora il tuo account non è collegato a nessuna organizzazione. Per gestire il programma di un’organizzazione serve un invito: chiedi alla persona responsabile di mandarti un invito al tuo indirizzo.',
		yourAddress: 'Il tuo indirizzo:',
		invitationsTitle: 'Inviti ricevuti',
		invitationsIntro:
			'Accettando un invito diventi membro dell’organizzazione e gestisci il suo programma insieme a lei.',
		accept: 'Accetta l’invito',
		errors: {
			notMember: 'Non sei membro di questa organizzazione.',
			invitationGone:
				'Questo invito non è più valido: forse è scaduto o è stato annullato. Chiedine uno nuovo alla persona che ti ha invitato.',
			lastManager: 'Sei l’unica persona responsabile di questa organizzazione:'
		}
	},
	en: {
		title: 'Your organisations',
		left: 'You have left the organisation. Its area is no longer open to you. To come back, ask a manager to invite you again.',
		chooseIntro: 'Choose the organisation whose programme you want to manage.',
		role: (role) => `Role: ${role}`,
		leave: 'Leave the organisation',
		rolesHelp:
			'A manager handles everything, including members and settings. An editor handles the courses and the programme.',
		confirmLeave: {
			intro: 'You are about to leave this organisation:',
			what: 'Its area will no longer be open to you. To come back, you will need a new invitation from a manager.',
			button: 'Confirm leaving',
			stay: 'Stay in the organisation'
		},
		lastManagerWhat:
			'An organisation always keeps at least one manager. Before leaving it, open it, then, on the Members screen, give the manager role to another member or invite someone as a manager.',
		none: 'Your account is not linked to any organisation yet. To manage the programme of an organisation, you need an invitation: ask the person in charge to send one to your address.',
		yourAddress: 'Your address:',
		invitationsTitle: 'Invitations received',
		invitationsIntro:
			'When you accept an invitation, you become a member of the organisation and manage its programme with them.',
		accept: 'Accept the invitation',
		errors: {
			notMember: 'You are not a member of this organisation.',
			invitationGone:
				'This invitation is no longer valid: it may have expired or been cancelled. Ask the person who invited you for a new one.',
			lastManager: 'You are the only manager of this organisation:'
		}
	},
	ar: {
		title: 'مؤسساتك',
		left: 'لقد غادرت المؤسسة، ولم تعد مساحتها مفتوحة لك. وللعودة إليها اطلب من أحد المسؤولين أن يدعوك من جديد.',
		chooseIntro: 'اختر المؤسسة التي تريد إدارة برنامجها.',
		role: (role) => `الدور: ${role}`,
		leave: 'مغادرة المؤسسة',
		rolesHelp: 'المسؤول يدير كل شيء، بما في ذلك الأعضاء والإعدادات. والمحرر يدير الدروس والبرنامج.',
		confirmLeave: {
			intro: 'أنت على وشك مغادرة هذه المؤسسة:',
			what: 'لن تستطيع دخول مساحتها بعد ذلك. وللعودة إليها تحتاج إلى دعوة جديدة من أحد المسؤولين.',
			button: 'تأكيد المغادرة',
			stay: 'البقاء في المؤسسة'
		},
		lastManagerWhat:
			'تحتفظ المؤسسة دائمًا بمسؤول واحد أو أكثر. قبل مغادرتها، افتحها، ثم امنح في صفحة «الأعضاء» دور المسؤول لعضو آخر أو ادعُ شخصًا بصفة مسؤول.',
		none: 'حسابك غير مرتبط بأي مؤسسة حاليًا. لإدارة برنامج مؤسسة تحتاج إلى دعوة: اطلب من المسؤول أن يرسل دعوة إلى عنوانك.',
		yourAddress: 'عنوانك:',
		invitationsTitle: 'الدعوات الواردة',
		invitationsIntro: 'بقبولك دعوة، تصبح عضوًا في المؤسسة وتشارك في إدارة برنامجها.',
		accept: 'قبول الدعوة',
		errors: {
			notMember: 'لست عضوًا في هذه المؤسسة.',
			invitationGone:
				'هذه الدعوة لم تعد صالحة: ربما انتهت مدتها أو أُلغيت. اطلب دعوة جديدة من الشخص الذي دعاك.',
			lastManager: 'أنت المسؤول الوحيد عن هذه المؤسسة:'
		}
	}
};

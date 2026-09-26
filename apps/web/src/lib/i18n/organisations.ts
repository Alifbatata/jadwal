// Les textes de l'écran « Vos organisations » (`/organisations`) : le choix de l'organisation après la
// connexion, et les invitations reçues. Les noms des rôles sont dans `common.ts`.

import type { Translations } from './space.js';

interface OrganisationsTexts {
	readonly title: string;
	readonly chooseIntro: string;
	/** « Rôle : responsable ». */
	readonly role: (role: string) => string;
	readonly rolesHelp: string;
	readonly none: string;
	/** Devant l'adresse du compte, pour que la personne sache laquelle donner. */
	readonly yourAddress: string;
	readonly invitationsTitle: string;
	readonly invitationsIntro: string;
	readonly accept: string;
	readonly errors: {
		readonly notMember: string;
		readonly invitationGone: string;
	};
}

export const organisationsTexts: Translations<OrganisationsTexts> = {
	fr: {
		title: 'Vos organisations',
		chooseIntro: 'Choisissez l’organisation dont vous voulez gérer le programme.',
		role: (role) => `Rôle : ${role}`,
		rolesHelp:
			'Une personne responsable gère tout, membres et réglages compris. Un éditeur gère les cours et le programme.',
		none: 'Votre compte n’est rattaché à aucune organisation pour le moment. Pour gérer le programme d’une organisation, il faut y être invité : demandez à la personne responsable de vous envoyer une invitation à votre adresse.',
		yourAddress: 'Votre adresse :',
		invitationsTitle: 'Invitations reçues',
		invitationsIntro:
			'En acceptant une invitation, vous devenez membre de l’organisation et vous gérez son programme avec elle.',
		accept: 'Accepter l’invitation',
		errors: {
			notMember: 'Vous n’êtes pas membre de cette organisation.',
			invitationGone:
				'Cette invitation n’est plus valable : elle a peut-être expiré ou été annulée. Demandez-en une nouvelle à la personne qui vous a invité.'
		}
	},
	de: {
		title: 'Ihre Organisationen',
		chooseIntro: 'Wählen Sie die Organisation, deren Programm Sie verwalten möchten.',
		role: (role) => `Rolle: ${role}`,
		rolesHelp:
			'Die Leitung verwaltet alles, auch Mitglieder und Einstellungen. Die Redaktion verwaltet die Kurse und das Programm.',
		none: 'Ihr Konto gehört zurzeit zu keiner Organisation. Um das Programm einer Organisation zu verwalten, brauchen Sie eine Einladung: Bitten Sie die verantwortliche Person, Ihnen eine Einladung an Ihre Adresse zu schicken.',
		yourAddress: 'Ihre Adresse:',
		invitationsTitle: 'Erhaltene Einladungen',
		invitationsIntro:
			'Wenn Sie eine Einladung annehmen, werden Sie Mitglied der Organisation und verwalten ihr Programm mit.',
		accept: 'Einladung annehmen',
		errors: {
			notMember: 'Sie sind nicht Mitglied dieser Organisation.',
			invitationGone:
				'Diese Einladung gilt nicht mehr: Sie ist vielleicht abgelaufen oder wurde zurückgezogen. Bitten Sie die Person, die Sie eingeladen hat, um eine neue.'
		}
	},
	it: {
		title: 'Le tue organizzazioni',
		chooseIntro: 'Scegli l’organizzazione di cui vuoi gestire il programma.',
		role: (role) => `Ruolo: ${role}`,
		rolesHelp:
			'Un responsabile gestisce tutto, membri e impostazioni compresi. Un redattore gestisce i corsi e il programma.',
		none: 'Per ora il tuo account non è collegato a nessuna organizzazione. Per gestire il programma di un’organizzazione serve un invito: chiedi alla persona responsabile di mandarti un invito al tuo indirizzo.',
		yourAddress: 'Il tuo indirizzo:',
		invitationsTitle: 'Inviti ricevuti',
		invitationsIntro:
			'Accettando un invito diventi membro dell’organizzazione e gestisci il suo programma insieme a lei.',
		accept: 'Accetta l’invito',
		errors: {
			notMember: 'Non sei membro di questa organizzazione.',
			invitationGone:
				'Questo invito non è più valido: forse è scaduto o è stato annullato. Chiedine uno nuovo alla persona che ti ha invitato.'
		}
	},
	en: {
		title: 'Your organisations',
		chooseIntro: 'Choose the organisation whose programme you want to manage.',
		role: (role) => `Role: ${role}`,
		rolesHelp:
			'A manager handles everything, including members and settings. An editor handles the courses and the programme.',
		none: 'Your account is not linked to any organisation yet. To manage the programme of an organisation, you need an invitation: ask the person in charge to send one to your address.',
		yourAddress: 'Your address:',
		invitationsTitle: 'Invitations received',
		invitationsIntro:
			'When you accept an invitation, you become a member of the organisation and manage its programme with them.',
		accept: 'Accept the invitation',
		errors: {
			notMember: 'You are not a member of this organisation.',
			invitationGone:
				'This invitation is no longer valid: it may have expired or been cancelled. Ask the person who invited you for a new one.'
		}
	},
	ar: {
		title: 'مؤسساتك',
		chooseIntro: 'اختر المؤسسة التي تريد إدارة برنامجها.',
		role: (role) => `الدور: ${role}`,
		rolesHelp: 'المسؤول يدير كل شيء، بما في ذلك الأعضاء والإعدادات. والمحرر يدير الدروس والبرنامج.',
		none: 'حسابك غير مرتبط بأي مؤسسة حاليًا. لإدارة برنامج مؤسسة تحتاج إلى دعوة: اطلب من المسؤول أن يرسل دعوة إلى عنوانك.',
		yourAddress: 'عنوانك:',
		invitationsTitle: 'الدعوات الواردة',
		invitationsIntro: 'بقبولك دعوة، تصبح عضوًا في المؤسسة وتشارك في إدارة برنامجها.',
		accept: 'قبول الدعوة',
		errors: {
			notMember: 'لست عضوًا في هذه المؤسسة.',
			invitationGone:
				'هذه الدعوة لم تعد صالحة: ربما انتهت مدتها أو أُلغيت. اطلب دعوة جديدة من الشخص الذي دعاك.'
		}
	}
};

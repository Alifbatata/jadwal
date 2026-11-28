// Les textes de la vue du super-admin sur les comptes (`/super-admin/comptes`, étape 25, ADR 0058),
// et le lien qui y mène depuis la console.
//
// Ce que l'écran dit est ce que fait le code : il montre tous les comptes, ouverts seuls ou sur
// invitation, avec leurs organisations, leur rôle et leur autorisation de diffuser ; il ne change
// rien. Pour agir dans une organisation, le super-admin y entre, comme depuis la console. Un compte
// sans organisation ni session part de lui-même au bout de douze mois (`purge_orphan_accounts`).

import type { Translations } from './space.js';

interface AccountsTexts {
	readonly title: string;
	readonly intro: string;
	readonly purge: string;
	/** Le lien de la console vers cet écran, et le retour. */
	readonly link: string;
	readonly back: string;
	readonly total: string;
	readonly alone: string;
	readonly email: string;
	readonly name: string;
	readonly openedOn: string;
	readonly organisations: string;
	readonly superAdmin: string;
	readonly none: string;
	readonly roles: { readonly org_admin: string; readonly editor: string };
	readonly mayBroadcast: string;
	readonly enter: string;
	/**
	 * Supprimer un compte (ADR 0058 amendée) : le bouton de chaque ligne, la confirmation, ce qui part
	 * avec le compte, le résultat et les trois refus. Ce que dit la confirmation est ce que fait
	 * `jadwal.delete_account` (migration 0087).
	 */
	readonly remove: {
		readonly button: string;
		readonly intro: string;
		readonly memberOf: string;
		readonly what: string;
		readonly confirm: string;
		readonly keep: string;
		readonly done: string;
		readonly gone: string;
		readonly superAdmin: string;
		readonly lastManager: string;
	};
}

export const superAdminAccountsTexts: Translations<AccountsTexts> = {
	fr: {
		title: 'Les comptes',
		intro:
			'Tous les comptes ouverts sur ce service, avec leurs organisations, leur rôle et leur autorisation de diffuser le direct. Cet écran ne change rien : pour agir dans une organisation, entrez-y.',
		purge:
			'Un compte sans organisation ni session ouverte est effacé de lui-même au bout de douze mois.',
		link: 'Voir tous les comptes',
		back: 'Retour à la console',
		total: 'Comptes :',
		alone: 'Sans organisation :',
		email: 'Adresse',
		name: 'Nom',
		openedOn: 'Ouvert le',
		organisations: 'Organisations',
		superAdmin: 'Super-admin',
		none: 'Aucune organisation',
		roles: { org_admin: 'Responsable', editor: 'Éditeur' },
		mayBroadcast: 'peut diffuser le direct',
		enter: 'Entrer',
		remove: {
			button: 'Supprimer le compte',
			intro: 'Vous allez supprimer ce compte :',
			memberOf: 'Il est membre de :',
			what: 'Ses sessions, ses passkeys et ses adhésions partent avec lui ; le journal de chacune de ses organisations en garde la trace. Ce qu’il a modifié dans un programme reste, sans son nom. Ce geste ne s’annule pas.',
			confirm: 'Supprimer définitivement ce compte',
			keep: 'Garder le compte',
			done: 'Compte supprimé :',
			gone: 'Ce compte n’existe plus.',
			superAdmin: 'Un compte de l’exploitant ne se supprime pas depuis cet écran.',
			lastManager:
				'Ce compte est la dernière personne responsable de ces organisations. Nommez d’abord une autre personne responsable dans chacune, puis revenez :'
		}
	},
	de: {
		title: 'Die Konten',
		intro:
			'Alle Konten, die bei diesem Dienst eröffnet wurden, mit ihren Organisationen, ihrer Rolle und ihrer Erlaubnis, die Übertragung zu starten. Diese Seite ändert nichts: Um in einer Organisation zu handeln, treten Sie in sie ein.',
		purge:
			'Ein Konto ohne Organisation und ohne offene Sitzung wird nach zwölf Monaten von selbst gelöscht.',
		link: 'Alle Konten ansehen',
		back: 'Zurück zur Konsole',
		total: 'Konten:',
		alone: 'Ohne Organisation:',
		email: 'Adresse',
		name: 'Name',
		openedOn: 'Eröffnet am',
		organisations: 'Organisationen',
		superAdmin: 'Super-Admin',
		none: 'Keine Organisation',
		roles: { org_admin: 'Leitung', editor: 'Redaktion' },
		mayBroadcast: 'darf die Übertragung starten',
		enter: 'Eintreten',
		remove: {
			button: 'Konto löschen',
			intro: 'Sie löschen dieses Konto:',
			memberOf: 'Es ist Mitglied von:',
			what: 'Seine Sitzungen, Passkeys und Mitgliedschaften verschwinden mit ihm; das Protokoll jeder seiner Organisationen hält es fest. Was es in einem Programm geändert hat, bleibt, ohne seinen Namen. Dieser Schritt lässt sich nicht rückgängig machen.',
			confirm: 'Dieses Konto endgültig löschen',
			keep: 'Konto behalten',
			done: 'Konto gelöscht:',
			gone: 'Dieses Konto existiert nicht mehr.',
			superAdmin: 'Ein Konto des Betreibers lässt sich auf dieser Seite nicht löschen.',
			lastManager:
				'Dieses Konto ist die letzte Leitung dieser Organisationen. Bestimmen Sie zuerst in jeder eine andere Leitung, und kommen Sie dann zurück:'
		}
	},
	it: {
		title: 'Gli account',
		intro:
			'Tutti gli account aperti su questo servizio, con le loro organizzazioni, il loro ruolo e la loro autorizzazione a trasmettere la diretta. Questa pagina non cambia nulla: per agire in un’organizzazione, entraci.',
		purge:
			'Un account senza organizzazione né sessione aperta viene cancellato da solo dopo dodici mesi.',
		link: 'Vedi tutti gli account',
		back: 'Torna alla console',
		total: 'Account:',
		alone: 'Senza organizzazione:',
		email: 'Indirizzo',
		name: 'Nome',
		openedOn: 'Aperto il',
		organisations: 'Organizzazioni',
		superAdmin: 'Super-admin',
		none: 'Nessuna organizzazione',
		roles: { org_admin: 'Responsabile', editor: 'Redattore' },
		mayBroadcast: 'può trasmettere la diretta',
		enter: 'Entra',
		remove: {
			button: 'Elimina l’account',
			intro: 'Stai per eliminare questo account:',
			memberOf: 'È membro di:',
			what: 'Le sue sessioni, le sue passkey e le sue adesioni se ne vanno con lui; il registro di ciascuna delle sue organizzazioni ne conserva traccia. Ciò che ha modificato in un programma resta, senza il suo nome. Questo gesto non si può annullare.',
			confirm: 'Elimina definitivamente questo account',
			keep: 'Tieni l’account',
			done: 'Account eliminato:',
			gone: 'Questo account non esiste più.',
			superAdmin: 'Un account del gestore non si elimina da questa pagina.',
			lastManager:
				'Questo account è l’ultima persona responsabile di queste organizzazioni. Nomina prima un’altra persona responsabile in ciascuna, poi torna qui:'
		}
	},
	en: {
		title: 'The accounts',
		intro:
			'Every account opened on this service, with its organisations, its role and its permission to start the broadcast. This page changes nothing: to act in an organisation, enter it.',
		purge:
			'An account with no organisation and no open session is deleted on its own after twelve months.',
		link: 'See every account',
		back: 'Back to the console',
		total: 'Accounts:',
		alone: 'Without an organisation:',
		email: 'Address',
		name: 'Name',
		openedOn: 'Opened on',
		organisations: 'Organisations',
		superAdmin: 'Super-admin',
		none: 'No organisation',
		roles: { org_admin: 'Manager', editor: 'Editor' },
		mayBroadcast: 'may start the broadcast',
		enter: 'Enter',
		remove: {
			button: 'Delete the account',
			intro: 'You are about to delete this account:',
			memberOf: 'It is a member of:',
			what: 'Its sessions, passkeys and memberships go with it; the journal of each of its organisations keeps a record. What it changed in a programme stays, without its name. This cannot be undone.',
			confirm: 'Delete this account for good',
			keep: 'Keep the account',
			done: 'Account deleted:',
			gone: 'This account no longer exists.',
			superAdmin: 'An account of the operator cannot be deleted from this page.',
			lastManager:
				'This account is the last manager of these organisations. First name another manager in each of them, then come back:'
		}
	},
	ar: {
		title: 'الحسابات',
		intro:
			'كل الحسابات المفتوحة في هذه الخدمة، مع مؤسساتها ودورها وإذنها ببَدْء البث. هذه الصفحة لا تغيّر شيئًا: لتتصرف في مؤسسة، ادخل إليها.',
		purge: 'الحساب الذي لا مؤسسة له ولا جلسة مفتوحة يُحذف من تلقاء نفسه بعد اثني عشر شهرًا.',
		link: 'عرض كل الحسابات',
		back: 'العودة إلى لوحة الإدارة',
		total: 'الحسابات:',
		alone: 'بلا مؤسسة:',
		email: 'العنوان',
		name: 'الاسم',
		openedOn: 'فُتح في',
		organisations: 'المؤسسات',
		superAdmin: 'المشرف العام',
		none: 'لا مؤسسة',
		roles: { org_admin: 'مسؤول', editor: 'محرر' },
		mayBroadcast: 'يمكنه بَدْء البث',
		enter: 'دخول',
		remove: {
			button: 'حذف الحساب',
			intro: 'أنت على وشك حذف هذا الحساب:',
			memberOf: 'هو عضو في:',
			what: 'تُحذف معه جلساته ومفاتيح المرور الخاصة به وعضوياته، ويحتفظ سجل كل مؤسسة من مؤسساته بأثر ذلك. وما عدّله في برنامج يبقى، دون اسمه. لا يمكن التراجع عن هذه الخطوة.',
			confirm: 'احذف هذا الحساب نهائيًا',
			keep: 'أبقِ الحساب',
			done: 'حُذف الحساب:',
			gone: 'هذا الحساب لم يعد موجودًا.',
			superAdmin: 'لا يُحذف حساب القائم على الخدمة من هذه الصفحة.',
			lastManager:
				'هذا الحساب هو آخر مسؤول عن هذه المؤسسات. عيّن أولًا مسؤولًا آخر في كل واحدة منها، ثم عُد إلى هنا:'
		}
	}
};

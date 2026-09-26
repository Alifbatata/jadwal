// Les textes communs à tous les écrans de l'espace : l'en-tête de la coquille, sa navigation, la
// bannière du super-admin, le choix de la langue, les rôles et les messages d'erreur que plusieurs
// écrans donnent. Un écran range ses propres textes dans son propre fichier (voir `LISEZMOI.md`).
//
// Les noms des langues, des jours, des mois, des publics et des prières, et le lien des conditions,
// sont déjà dans `i18n.ts` et `public/affichage.ts` : on les y prend, sans les traduire une seconde
// fois.

import type { Translations } from './space.js';

interface CommonTexts {
	/** Le nom de la navigation, pour les lecteurs d'écran (`aria-label`). */
	readonly navigationLabel: string;
	readonly navigation: {
		readonly upcoming: string;
		readonly courses: string;
		readonly friday: string;
		readonly share: string;
		readonly members: string;
		readonly prayers: string;
		readonly settings: string;
		readonly switchOrganisation: string;
	};
	readonly superAdmin: string;
	readonly signOut: string;
	/** « Connecté avec l'adresse », devant l'adresse du compte, pour les lecteurs d'écran seuls. */
	readonly signedInAs: string;
	/**
	 * La bannière du super-admin entré dans une organisation : le texte avant son nom, et après. Le nom
	 * est mis en valeur entre les deux ; les cinq langues le placent au même endroit de la phrase.
	 */
	readonly superAdminBanner: { readonly before: string; readonly after: string };
	/** Le titre du choix de la langue, en haut de chaque écran. */
	readonly language: string;
	/**
	 * Ce que la coquille dit, sur l'écran où elle arrive, à une responsable qui vient de se donner le
	 * rôle d'éditeur : l'écran Membres ne lui est plus ouvert (`routes/membres/self-editor.ts`).
	 */
	readonly becameEditor: string;
	readonly roles: { readonly org_admin: string; readonly editor: string };
	readonly errors: {
		/** Une adresse électronique mal formée, avec un exemple de la bonne forme. */
		readonly invalidEmail: string;
	};
}

export const commonTexts: Translations<CommonTexts> = {
	fr: {
		navigationLabel: 'Espace des responsables',
		navigation: {
			upcoming: 'À venir',
			courses: 'Cours',
			friday: 'Prière du vendredi',
			share: 'Partager',
			members: 'Membres',
			prayers: 'Heures de prière',
			settings: 'Réglages',
			switchOrganisation: 'Changer d’organisation'
		},
		superAdmin: 'Super-admin',
		signOut: 'Se déconnecter',
		signedInAs: 'Connecté avec l’adresse',
		superAdminBanner: {
			before: 'Vous travaillez dans',
			after: 'avec vos pouvoirs de super-admin.'
		},
		language: 'Langue',
		becameEditor:
			'Vous avez maintenant le rôle d’éditeur. Les écrans réservés aux responsables, comme Membres et Réglages, ne vous sont plus ouverts. Pour les retrouver, demandez à une autre personne responsable de vous redonner le rôle de responsable.',
		roles: { org_admin: 'responsable', editor: 'éditeur' },
		errors: {
			invalidEmail:
				'Cette adresse n’a pas la forme d’une adresse électronique. Exemple : prenom.nom@exemple.ch'
		}
	},
	de: {
		navigationLabel: 'Verwaltungsbereich',
		navigation: {
			upcoming: 'Demnächst',
			courses: 'Kurse',
			friday: 'Freitagsgebet',
			share: 'Teilen',
			members: 'Mitglieder',
			prayers: 'Gebetszeiten',
			settings: 'Einstellungen',
			switchOrganisation: 'Organisation wechseln'
		},
		superAdmin: 'Super-Admin',
		signOut: 'Abmelden',
		signedInAs: 'Angemeldet mit der Adresse',
		superAdminBanner: {
			before: 'Sie arbeiten in',
			after: 'mit Ihren Super-Admin-Rechten.'
		},
		language: 'Sprache',
		becameEditor:
			'Sie haben jetzt die Rolle «Redaktion». Die Seiten, die der Leitung vorbehalten sind, zum Beispiel «Mitglieder» und «Einstellungen», stehen Ihnen nicht mehr offen. Um sie wieder zu öffnen, bitten Sie eine andere Person in der Leitung, Ihnen die Rolle «Leitung» zurückzugeben.',
		roles: { org_admin: 'Leitung', editor: 'Redaktion' },
		errors: {
			invalidEmail:
				'Diese Adresse hat nicht die Form einer E-Mail-Adresse. Beispiel: vorname.name@beispiel.ch'
		}
	},
	it: {
		navigationLabel: 'Area di gestione',
		navigation: {
			upcoming: 'In arrivo',
			courses: 'Corsi',
			friday: 'Preghiera del venerdì',
			share: 'Condividi',
			members: 'Membri',
			prayers: 'Orari di preghiera',
			settings: 'Impostazioni',
			switchOrganisation: 'Cambia organizzazione'
		},
		superAdmin: 'Super-admin',
		signOut: 'Esci',
		signedInAs: 'Accesso con l’indirizzo',
		superAdminBanner: {
			before: 'Stai lavorando in',
			after: 'con i tuoi poteri di super-admin.'
		},
		language: 'Lingua',
		becameEditor:
			'Ora hai il ruolo di redattore. Le pagine riservate ai responsabili, come Membri e Impostazioni, non ti sono più accessibili. Per riaverle, chiedi a un altro responsabile di ridarti il ruolo di responsabile.',
		roles: { org_admin: 'responsabile', editor: 'redattore' },
		errors: {
			invalidEmail:
				'Questo indirizzo non ha la forma di un indirizzo e-mail. Esempio: nome.cognome@esempio.ch'
		}
	},
	en: {
		navigationLabel: 'Management area',
		navigation: {
			upcoming: 'Coming up',
			courses: 'Courses',
			friday: 'Friday prayer',
			share: 'Share',
			members: 'Members',
			prayers: 'Prayer times',
			settings: 'Settings',
			switchOrganisation: 'Change organisation'
		},
		superAdmin: 'Super admin',
		signOut: 'Sign out',
		signedInAs: 'Signed in with the address',
		superAdminBanner: {
			before: 'You are working in',
			after: 'with your super admin powers.'
		},
		language: 'Language',
		becameEditor:
			'You now have the editor role. The screens reserved for managers, such as Members and Settings, are no longer open to you. To get them back, ask another manager to give you the manager role again.',
		roles: { org_admin: 'manager', editor: 'editor' },
		errors: {
			invalidEmail:
				'This address does not look like an email address. Example: first.last@example.ch'
		}
	},
	ar: {
		navigationLabel: 'مساحة الإدارة',
		navigation: {
			upcoming: 'القادم',
			courses: 'الدروس',
			friday: 'صلاة الجمعة',
			share: 'المشاركة',
			members: 'الأعضاء',
			prayers: 'مواقيت الصلاة',
			settings: 'الإعدادات',
			switchOrganisation: 'تغيير المؤسسة'
		},
		superAdmin: 'المشرف العام',
		signOut: 'تسجيل الخروج',
		signedInAs: 'مسجّل الدخول بالعنوان',
		superAdminBanner: {
			before: 'أنت تعمل في',
			after: 'بصلاحيات المشرف العام.'
		},
		language: 'اللغة',
		becameEditor:
			'لديك الآن دور المحرر. لم تعد الصفحات الخاصة بالمسؤولين، مثل «الأعضاء» و«الإعدادات»، مفتوحة لك. لاستعادتها، اطلب من مسؤول آخر أن يمنحك دور المسؤول من جديد.',
		roles: { org_admin: 'مسؤول', editor: 'محرر' },
		errors: {
			invalidEmail: 'هذا العنوان ليس على شكل بريد إلكتروني. مثال: name@example.ch'
		}
	}
};

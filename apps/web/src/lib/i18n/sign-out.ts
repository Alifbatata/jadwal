// Les textes de l'écran de déconnexion (`/deconnexion`). Les deux gestes de déconnexion renvoient à
// la connexion ; cet écran ne se voit qu'en ouvrant l'adresse elle-même.

import type { Translations } from './space.js';

interface SignOutTexts {
	readonly title: string;
	readonly text: string;
	readonly signInAgain: string;
}

export const signOutTexts: Translations<SignOutTexts> = {
	fr: {
		title: 'Déconnexion',
		text: 'Vous n’êtes plus connecté.',
		signInAgain: 'Se reconnecter'
	},
	de: {
		title: 'Abmeldung',
		text: 'Sie sind abgemeldet.',
		signInAgain: 'Wieder anmelden'
	},
	it: {
		title: 'Disconnessione',
		text: 'Non sei più connesso.',
		signInAgain: 'Accedi di nuovo'
	},
	en: {
		title: 'Signed out',
		text: 'You are no longer signed in.',
		signInAgain: 'Sign in again'
	},
	ar: {
		title: 'تسجيل الخروج',
		text: 'لم تعد مسجّل الدخول.',
		signInAgain: 'تسجيل الدخول من جديد'
	}
};

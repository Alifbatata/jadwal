// Les textes de la page d'erreur de l'espace (`routes/+error.svelte`), selon le code de la réponse.
//
// La page ne recopie jamais le message de l'erreur : il est écrit pour celui qui lit le code, en
// français, et il pourrait dire quelque chose qu'une personne n'a pas à lire. Elle dit ce qui arrive
// et ce que la personne peut faire, dans sa langue.

import type { Translations } from './space.js';

interface ErrorPage {
	readonly title: string;
	readonly text: string;
}

interface ErrorTexts {
	/** 404 : l'adresse ne mène à rien. */
	readonly notFound: ErrorPage;
	/** 403 : la page existe, mais pas pour ce compte. */
	readonly forbidden: ErrorPage;
	/** 429 : trop de demandes d'un coup. */
	readonly tooMany: ErrorPage;
	/** Tout le reste, 500 compris. */
	readonly other: ErrorPage;
	readonly home: string;
}

export const errorTexts: Translations<ErrorTexts> = {
	fr: {
		notFound: {
			title: 'Page introuvable',
			text: 'Cette adresse ne mène à aucune page. Vérifiez-la, ou revenez à l’accueil.'
		},
		forbidden: {
			title: 'Accès refusé',
			text: 'Cette page n’est pas ouverte à votre compte.'
		},
		tooMany: {
			title: 'Trop de demandes',
			text: 'Attendez une minute, puis réessayez.'
		},
		other: {
			title: 'Une erreur est survenue',
			text: 'Le service n’a pas pu afficher cette page. Réessayez dans un instant.'
		},
		home: 'Revenir à l’accueil'
	},
	de: {
		notFound: {
			title: 'Seite nicht gefunden',
			text: 'Diese Adresse führt zu keiner Seite. Prüfen Sie sie, oder kehren Sie zur Startseite zurück.'
		},
		forbidden: {
			title: 'Zugriff verweigert',
			text: 'Diese Seite ist für Ihr Konto nicht zugänglich.'
		},
		tooMany: {
			title: 'Zu viele Anfragen',
			text: 'Warten Sie eine Minute, und versuchen Sie es dann noch einmal.'
		},
		other: {
			title: 'Ein Fehler ist aufgetreten',
			text: 'Der Dienst konnte diese Seite nicht anzeigen. Versuchen Sie es gleich noch einmal.'
		},
		home: 'Zur Startseite'
	},
	it: {
		notFound: {
			title: 'Pagina non trovata',
			text: 'Questo indirizzo non porta a nessuna pagina. Controllalo, oppure torna alla pagina iniziale.'
		},
		forbidden: {
			title: 'Accesso negato',
			text: 'Questa pagina non è aperta al tuo account.'
		},
		tooMany: {
			title: 'Troppe richieste',
			text: 'Aspetta un minuto, poi riprova.'
		},
		other: {
			title: 'Si è verificato un errore',
			text: 'Il servizio non è riuscito a mostrare questa pagina. Riprova tra un momento.'
		},
		home: 'Torna alla pagina iniziale'
	},
	en: {
		notFound: {
			title: 'Page not found',
			text: 'This address does not lead to any page. Check it, or go back to the home page.'
		},
		forbidden: {
			title: 'Access denied',
			text: 'This page is not open to your account.'
		},
		tooMany: {
			title: 'Too many requests',
			text: 'Wait a minute, then try again.'
		},
		other: {
			title: 'Something went wrong',
			text: 'The service could not show this page. Try again in a moment.'
		},
		home: 'Back to the home page'
	},
	ar: {
		notFound: {
			title: 'الصفحة غير موجودة',
			text: 'لا توجد صفحة بهذا العنوان. تحقّق من العنوان، أو عد إلى الصفحة الرئيسية.'
		},
		forbidden: {
			title: 'الدخول مرفوض',
			text: 'هذه الصفحة غير متاحة لحسابك.'
		},
		tooMany: {
			title: 'طلبات كثيرة جدًا',
			text: 'انتظر دقيقة، ثم أعد المحاولة.'
		},
		other: {
			title: 'حدث خطأ',
			text: 'لم تتمكن الخدمة من عرض هذه الصفحة. أعد المحاولة بعد لحظة.'
		},
		home: 'العودة إلى الصفحة الرئيسية'
	}
};

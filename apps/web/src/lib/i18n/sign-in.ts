// Les textes de l'écran de connexion (`/connexion`).
//
// La réponse après l'envoi est la même pour une adresse connue et pour une adresse inconnue, dans
// chaque langue (ADR 0017) : elle ne dit jamais qu'un lien est parti, seulement qu'il part si
// l'adresse peut se connecter.

import type { Translations } from './space.js';

interface SignInTexts {
	readonly title: string;
	readonly intro: string;
	readonly emailLabel: string;
	readonly emailHint: string;
	readonly submit: string;
	readonly sent: string;
	readonly sentHint: string;
	readonly close: string;
	readonly askAgain: string;
	readonly notInvited: string;
	readonly readTerms: string;
}

export const signInTexts: Translations<SignInTexts> = {
	fr: {
		title: 'Se connecter',
		intro:
			'Cet espace sert aux personnes qui gèrent le programme d’une organisation. Saisissez votre adresse électronique : vous recevrez un lien pour vous connecter. Il n’y a pas de mot de passe.',
		emailLabel: 'Votre adresse électronique',
		emailHint: 'L’adresse à laquelle votre invitation est arrivée. Exemple : prenom.nom@exemple.ch',
		submit: 'Recevoir un lien de connexion',
		sent: 'Si cette adresse peut se connecter, un lien vient d’y être envoyé. Ouvrez votre messagerie et touchez le lien : il est valable quinze minutes et ne sert qu’une fois.',
		sentHint:
			'Rien reçu après quelques minutes ? Regardez dans les courriels indésirables, ou demandez un autre lien.',
		close: 'Vous pouvez fermer cette page.',
		askAgain: 'Demander un autre lien',
		notInvited:
			'Pas encore invité ? Demandez à la personne responsable de votre organisation de vous inviter.',
		readTerms: 'Lire les conditions d’utilisation'
	},
	de: {
		title: 'Anmelden',
		intro:
			'Dieser Bereich ist für Personen, die das Programm einer Organisation verwalten. Geben Sie Ihre E-Mail-Adresse ein: Sie erhalten einen Link zum Anmelden. Es gibt kein Passwort.',
		emailLabel: 'Ihre E-Mail-Adresse',
		emailHint:
			'Die Adresse, an die Ihre Einladung geschickt wurde. Beispiel: vorname.name@beispiel.ch',
		submit: 'Anmeldelink erhalten',
		sent: 'Wenn sich diese Adresse anmelden kann, wurde soeben ein Link an sie geschickt. Öffnen Sie Ihr Postfach und tippen Sie auf den Link: Er ist fünfzehn Minuten gültig und funktioniert nur einmal.',
		sentHint:
			'Nach einigen Minuten nichts erhalten? Schauen Sie im Spam-Ordner nach, oder fordern Sie einen neuen Link an.',
		close: 'Sie können diese Seite schliessen.',
		askAgain: 'Neuen Link anfordern',
		notInvited:
			'Noch nicht eingeladen? Bitten Sie die verantwortliche Person Ihrer Organisation, Sie einzuladen.',
		readTerms: 'Nutzungsbedingungen lesen'
	},
	it: {
		title: 'Accedi',
		intro:
			'Quest’area è per chi gestisce il programma di un’organizzazione. Inserisci il tuo indirizzo e-mail: riceverai un link per accedere. Non c’è nessuna password.',
		emailLabel: 'Il tuo indirizzo e-mail',
		emailHint: 'L’indirizzo a cui è arrivato il tuo invito. Esempio: nome.cognome@esempio.ch',
		submit: 'Ricevi il link di accesso',
		sent: 'Se questo indirizzo può accedere, gli è appena stato inviato un link. Apri la tua casella di posta e tocca il link: è valido quindici minuti e funziona una sola volta.',
		sentHint:
			'Non è arrivato niente dopo qualche minuto? Guarda nella posta indesiderata, oppure chiedi un altro link.',
		close: 'Puoi chiudere questa pagina.',
		askAgain: 'Chiedi un altro link',
		notInvited:
			'Non hai ancora ricevuto un invito? Chiedi alla persona responsabile della tua organizzazione di invitarti.',
		readTerms: 'Leggi le condizioni d’uso'
	},
	en: {
		title: 'Sign in',
		intro:
			'This area is for the people who manage the programme of an organisation. Enter your email address: you will receive a link to sign in. There is no password.',
		emailLabel: 'Your email address',
		emailHint: 'The address your invitation was sent to. Example: first.last@example.ch',
		submit: 'Send me the sign-in link',
		sent: 'If this address can sign in, a link has just been sent to it. Open your mailbox and tap the link: it is valid for fifteen minutes and works only once.',
		sentHint: 'Nothing after a few minutes? Look in your junk mail, or ask for another link.',
		close: 'You can close this page.',
		askAgain: 'Ask for another link',
		notInvited: 'Not invited yet? Ask the person in charge of your organisation to invite you.',
		readTerms: 'Read the terms of use'
	},
	ar: {
		title: 'تسجيل الدخول',
		intro:
			'هذه المساحة مخصّصة للأشخاص الذين يديرون برنامج مؤسسة. أدخل بريدك الإلكتروني: سيصلك رابط لتسجيل الدخول. لا توجد كلمة مرور.',
		emailLabel: 'بريدك الإلكتروني',
		emailHint: 'العنوان الذي وصلتك عليه الدعوة. مثال: name@example.ch',
		submit: 'أرسل لي رابط الدخول',
		sent: 'إن كان هذا العنوان يستطيع الدخول، فقد أُرسل إليه رابط الآن. افتح بريدك واضغط على الرابط: يبقى صالحًا 15 دقيقة، ويعمل مرة واحدة فقط.',
		sentHint: 'لم يصلك شيء بعد بضع دقائق؟ ابحث في البريد غير المرغوب فيه، أو اطلب رابطًا آخر.',
		close: 'يمكنك إغلاق هذه الصفحة.',
		askAgain: 'اطلب رابطًا آخر',
		notInvited: 'لم تصلك دعوة بعد؟ اطلب من المسؤول عن مؤسستك أن يدعوك.',
		readTerms: 'اقرأ شروط الاستخدام'
	}
};

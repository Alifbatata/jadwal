// Les textes de l'écran de connexion (`/connexion`).
//
// La réponse après l'envoi est la même pour une adresse connue et pour une adresse inconnue, dans
// chaque langue (ADR 0017). Depuis que l'inscription est ouverte (ADR 0058), toute adresse reçoit
// un lien, sauf quand une borne le retient en silence : la réponse le dit sans dire laquelle.
// `tooMany` est la seule borne dite, celle de l'adresse IP : elle ne parle que de la connexion.

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
	readonly tooMany: string;
}

export const signInTexts: Translations<SignInTexts> = {
	fr: {
		title: 'Se connecter',
		intro:
			'Cet espace sert aux personnes qui gèrent le programme d’une organisation. Saisissez votre adresse électronique : vous recevrez un lien pour vous connecter. Il n’y a pas de mot de passe.',
		emailLabel: 'Votre adresse électronique',
		emailHint:
			'Si vous avez reçu une invitation, l’adresse à laquelle elle est arrivée. Exemple : prenom.nom@example.org',
		submit: 'Recevoir un lien de connexion',
		sent: 'Un lien de connexion vient de partir vers cette adresse, sauf si trop de liens ont été demandés ces derniers temps. Ouvrez votre messagerie et touchez le lien : il est valable quinze minutes et ne sert qu’une fois.',
		sentHint:
			'Rien reçu après quelques minutes ? Regardez dans les courriels indésirables, ou demandez un autre lien.',
		close: 'Vous pouvez fermer cette page.',
		askAgain: 'Demander un autre lien',
		notInvited:
			'Pas encore de compte ? Ce lien en ouvre un. Il ne donne accès à aucune organisation : pour gérer le programme de la vôtre, demandez à sa personne responsable de vous inviter.',
		tooMany: 'Trop de demandes depuis votre connexion. Réessayez dans une heure.'
	},
	de: {
		title: 'Anmelden',
		intro:
			'Dieser Bereich ist für Personen, die das Programm einer Organisation verwalten. Geben Sie Ihre E-Mail-Adresse ein: Sie erhalten einen Link zum Anmelden. Es gibt kein Passwort.',
		emailLabel: 'Ihre E-Mail-Adresse',
		emailHint:
			'Wenn Sie eine Einladung erhalten haben: die Adresse, an die sie geschickt wurde. Beispiel: vorname.name@example.org',
		submit: 'Anmeldelink erhalten',
		sent: 'Soeben wurde ein Anmeldelink an diese Adresse geschickt, ausser es wurden in letzter Zeit zu viele Links angefordert. Öffnen Sie Ihr Postfach und tippen Sie auf den Link: Er ist fünfzehn Minuten gültig und funktioniert nur einmal.',
		sentHint:
			'Nach einigen Minuten nichts erhalten? Schauen Sie im Spam-Ordner nach, oder fordern Sie einen neuen Link an.',
		close: 'Sie können diese Seite schliessen.',
		askAgain: 'Neuen Link anfordern',
		notInvited:
			'Noch kein Konto? Dieser Link eröffnet eines. Es gibt Ihnen keinen Zugang zu einer Organisation: Um das Programm Ihrer Organisation zu verwalten, bitten Sie deren verantwortliche Person, Sie einzuladen.',
		tooMany: 'Zu viele Anfragen von Ihrer Verbindung aus. Versuchen Sie es in einer Stunde erneut.'
	},
	it: {
		title: 'Accedi',
		intro:
			'Quest’area è per chi gestisce il programma di un’organizzazione. Inserisci il tuo indirizzo e-mail: riceverai un link per accedere. Non c’è nessuna password.',
		emailLabel: 'Il tuo indirizzo e-mail',
		emailHint:
			'Se hai ricevuto un invito, l’indirizzo a cui è arrivato. Esempio: nome.cognome@example.org',
		submit: 'Ricevi il link di accesso',
		sent: 'Un link di accesso è appena partito verso questo indirizzo, a meno che ne siano stati chiesti troppi di recente. Apri la tua casella di posta e tocca il link: è valido quindici minuti e funziona una sola volta.',
		sentHint:
			'Non è arrivato niente dopo qualche minuto? Guarda nella posta indesiderata, oppure chiedi un altro link.',
		close: 'Puoi chiudere questa pagina.',
		askAgain: 'Chiedi un altro link',
		notInvited:
			'Non hai ancora un account? Questo link ne apre uno. Non dà accesso a nessuna organizzazione: per gestire il programma della tua, chiedi alla sua persona responsabile di invitarti.',
		tooMany: 'Troppe richieste dalla tua connessione. Riprova tra un’ora.'
	},
	en: {
		title: 'Sign in',
		intro:
			'This area is for the people who manage the programme of an organisation. Enter your email address: you will receive a link to sign in. There is no password.',
		emailLabel: 'Your email address',
		emailHint:
			'If you received an invitation, the address it was sent to. Example: first.last@example.org',
		submit: 'Send me the sign-in link',
		sent: 'A sign-in link has just been sent to this address, unless too many links were asked for recently. Open your mailbox and tap the link: it is valid for fifteen minutes and works only once.',
		sentHint: 'Nothing after a few minutes? Look in your junk mail, or ask for another link.',
		close: 'You can close this page.',
		askAgain: 'Ask for another link',
		notInvited:
			'No account yet? This link opens one. It gives access to no organisation: to manage the programme of yours, ask the person in charge of it to invite you.',
		tooMany: 'Too many requests from your connection. Try again in an hour.'
	},
	ar: {
		title: 'تسجيل الدخول',
		intro:
			'هذه المساحة مخصّصة للأشخاص الذين يديرون برنامج مؤسسة. أدخل بريدك الإلكتروني: سيصلك رابط لتسجيل الدخول. لا توجد كلمة مرور.',
		emailLabel: 'بريدك الإلكتروني',
		emailHint: 'إن وصلتك دعوة، فهو العنوان الذي وصلت إليه دعوتك. مثال: name@example.org',
		submit: 'أرسل لي رابط الدخول',
		sent: 'أُرسل الآن رابط الدخول إلى هذا العنوان، إلا إذا طُلبت روابط كثيرة في الفترة الأخيرة. افتح بريدك واضغط على الرابط: يبقى صالحًا 15 دقيقة، ويعمل مرة واحدة فقط.',
		sentHint: 'لم يصلك شيء بعد بضع دقائق؟ ابحث في البريد غير المرغوب فيه، أو اطلب رابطًا آخر.',
		close: 'يمكنك إغلاق هذه الصفحة.',
		askAgain: 'اطلب رابطًا آخر',
		notInvited:
			'ليس لديك حساب بعد؟ هذا الرابط يفتح لك حسابًا. لا يمنحك الحساب الدخول إلى أي مؤسسة: لإدارة برنامج مؤسستك، اطلب من المسؤول عنها أن يدعوك.',
		tooMany: 'طلبات كثيرة جدًا من اتصالك. أعد المحاولة بعد ساعة.'
	}
};

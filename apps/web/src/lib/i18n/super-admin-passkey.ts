// Les textes de l'écran de la passkey du super-admin (`/super-admin/passkey`) : ce qu'est une passkey,
// pourquoi elle est exigée, et les trois états de l'écran (première passkey, pouvoirs actifs, session
// ouverte par le lien du courriel), étape 18, retours B1 et D2.
//
// Les messages d'échec sont dits dans la langue de l'écran. Le détail que rend le navigateur, lui,
// vient de WebAuthn ou de Better Auth, dans la langue qu'ils choisissent : il n'est montré qu'à la
// suite, présenté comme tel.

import type { Translations } from './space.js';

interface PasskeyTexts {
	readonly title: string;
	readonly what: string;
	readonly why: string;
	readonly noScript: string;
	readonly powersActive: string;
	readonly firstTime: string;
	readonly noPowers: string;
	readonly register: string;
	readonly signIn: string;
	/**
	 * Après l'enregistrement : `registered` pour la première passkey, qui renvoie au bouton de
	 * connexion apparu dessous ; `registeredAnother` pour une passkey de plus, pouvoirs actifs, quand
	 * l'écran n'a aucun bouton de connexion (`routes/super-admin/passkey/screen.ts`).
	 */
	readonly registered: string;
	readonly registeredAnother: string;
	readonly registerFailed: string;
	readonly signInFailed: string;
	readonly deleteFailed: string;
	/** Devant le message technique rendu par le navigateur, après un échec. */
	readonly detail: string;
	readonly listTitle: string;
	readonly none: string;
	/** « Enregistrée le 26.09.2026 » : la date arrive déjà écrite par `numericDate`. */
	readonly registeredOn: (date: string) => string;
	readonly unnamed: string;
	readonly delete: string;
	readonly advice: string;
}

export const passkeyTexts: Translations<PasskeyTexts> = {
	fr: {
		title: 'Votre passkey',
		what: 'Une passkey est une clé de connexion que votre appareil garde pour vous : un téléphone, un ordinateur ou une clé de sécurité. Vous la déverrouillez comme votre appareil, avec votre empreinte, votre visage ou son code.',
		why: 'Pour agir comme super-admin, il faut vous connecter avec une passkey. Le lien reçu par courriel ne suffit pas : quelqu’un qui entrerait dans votre messagerie ne doit pas pouvoir ouvrir toutes les organisations.',
		noScript:
			'Cet écran a besoin de JavaScript : c’est le navigateur lui-même qui crée une passkey, aucun formulaire ne peut le faire. Le reste du service fonctionne sans JavaScript.',
		powersActive: 'Vous êtes connecté avec une passkey : vos pouvoirs de super-admin sont actifs.',
		firstTime:
			'Aucune passkey n’est encore enregistrée. Enregistrez-en une maintenant, depuis cette session. Ensuite, il faudra être connecté avec une passkey pour en ajouter ou en retirer.',
		noPowers:
			'Vous êtes connecté avec le lien reçu par courriel : cette session n’a aucun pouvoir de super-admin. Connectez-vous avec une passkey déjà enregistrée.',
		register: 'Enregistrer une passkey',
		signIn: 'Se connecter avec une passkey',
		registered:
			'Passkey enregistrée. Utilisez le bouton ci-dessous pour vous connecter avec elle, sans quitter la page.',
		registeredAnother:
			'Passkey enregistrée. Vous pourrez vous connecter avec elle la prochaine fois. Vous n’avez rien d’autre à faire.',
		registerFailed:
			'La passkey n’a pas pu être enregistrée. Réessayez, ou essayez depuis un autre appareil.',
		signInFailed: 'La connexion avec la passkey n’a pas abouti. Réessayez.',
		deleteFailed: 'La passkey n’a pas pu être supprimée. Réessayez.',
		detail: 'Détail donné par le navigateur :',
		listTitle: 'Passkeys enregistrées',
		none: 'Aucune pour le moment.',
		registeredOn: (date) => `Enregistrée le ${date}`,
		unnamed: 'Sans nom',
		delete: 'Supprimer',
		advice:
			'Enregistrez-en plusieurs, sur plusieurs appareils : perdre son téléphone ne doit pas fermer le service. Si toutes sont perdues, seule une intervention directe dans la base de données permet de repartir : il n’existe ni question secrète ni code envoyé par courriel.'
	},
	de: {
		title: 'Ihr Passkey',
		what: 'Ein Passkey ist ein Anmeldeschlüssel, den Ihr Gerät für Sie aufbewahrt: ein Telefon, ein Computer oder ein Sicherheitsschlüssel. Sie entsperren ihn wie Ihr Gerät, mit Fingerabdruck, Gesicht oder Code.',
		why: 'Um als Super-Admin zu handeln, müssen Sie sich mit einem Passkey anmelden. Der Link per E-Mail genügt nicht: Wer in Ihr Postfach eindringt, darf nicht alle Organisationen öffnen können.',
		noScript:
			'Diese Seite braucht JavaScript: Einen Passkey erstellt der Browser selbst, kein Formular kann das. Der Rest des Dienstes funktioniert ohne JavaScript.',
		powersActive: 'Sie sind mit einem Passkey angemeldet: Ihre Super-Admin-Rechte sind aktiv.',
		firstTime:
			'Es ist noch kein Passkey gespeichert. Speichern Sie jetzt einen, in dieser Sitzung. Danach braucht es eine Anmeldung mit Passkey, um weitere hinzuzufügen oder zu entfernen.',
		noPowers:
			'Sie sind mit dem Link aus der E-Mail angemeldet: Diese Sitzung hat keine Super-Admin-Rechte. Melden Sie sich mit einem bereits gespeicherten Passkey an.',
		register: 'Passkey speichern',
		signIn: 'Mit Passkey anmelden',
		registered:
			'Passkey gespeichert. Melden Sie sich jetzt damit an, mit der Schaltfläche unten, ohne die Seite zu verlassen.',
		registeredAnother:
			'Passkey gespeichert. Sie können sich beim nächsten Mal damit anmelden. Mehr ist nicht zu tun.',
		registerFailed:
			'Der Passkey konnte nicht gespeichert werden. Versuchen Sie es noch einmal oder mit einem anderen Gerät.',
		signInFailed: 'Die Anmeldung mit dem Passkey hat nicht geklappt. Versuchen Sie es noch einmal.',
		deleteFailed: 'Der Passkey konnte nicht gelöscht werden. Versuchen Sie es noch einmal.',
		detail: 'Angabe des Browsers:',
		listTitle: 'Gespeicherte Passkeys',
		none: 'Noch keiner.',
		registeredOn: (date) => `Gespeichert am ${date}`,
		unnamed: 'Ohne Namen',
		delete: 'Löschen',
		advice:
			'Speichern Sie mehrere, auf mehreren Geräten: Wer sein Telefon verliert, soll damit nicht den Dienst sperren. Sind alle verloren, hilft nur ein direkter Eingriff in die Datenbank: Es gibt weder eine Sicherheitsfrage noch einen Code per E-Mail.'
	},
	it: {
		title: 'La tua passkey',
		what: 'Una passkey è una chiave di accesso che il tuo dispositivo custodisce per te: un telefono, un computer o una chiave di sicurezza. La sblocchi come il tuo dispositivo, con l’impronta, il viso o il codice.',
		why: 'Per agire come super-admin devi accedere con una passkey. Il link ricevuto per e-mail non basta: chi entrasse nella tua casella di posta non deve poter aprire tutte le organizzazioni.',
		noScript:
			'Questa pagina ha bisogno di JavaScript: è il browser stesso a creare una passkey, nessun modulo può farlo. Il resto del servizio funziona senza JavaScript.',
		powersActive:
			'Hai effettuato l’accesso con una passkey: i tuoi poteri di super-admin sono attivi.',
		firstTime:
			'Non c’è ancora nessuna passkey registrata. Registrane una adesso, da questa sessione. Dopo, servirà un accesso con passkey per aggiungerne o toglierne.',
		noPowers:
			'Hai effettuato l’accesso con il link ricevuto per e-mail: questa sessione non ha nessun potere di super-admin. Accedi con una passkey già registrata.',
		register: 'Registra una passkey',
		signIn: 'Accedi con una passkey',
		registered:
			'Passkey registrata. Accedi adesso con questa passkey, con il pulsante qui sotto, senza lasciare la pagina.',
		registeredAnother:
			'Passkey registrata. Potrai accedere con questa passkey la prossima volta. Non devi fare nient’altro.',
		registerFailed:
			'Non è stato possibile registrare la passkey. Riprova, oppure prova da un altro dispositivo.',
		signInFailed: 'L’accesso con la passkey non è riuscito. Riprova.',
		deleteFailed: 'Non è stato possibile eliminare la passkey. Riprova.',
		detail: 'Dettaglio dato dal browser:',
		listTitle: 'Passkey registrate',
		none: 'Ancora nessuna.',
		registeredOn: (date) => `Registrata il ${date}`,
		unnamed: 'Senza nome',
		delete: 'Elimina',
		advice:
			'Registrane più di una, su più dispositivi: perdere il telefono non deve chiudere il servizio. Se sono andate tutte perse, solo un intervento diretto nella banca dati permette di ripartire: non esiste né una domanda segreta né un codice per e-mail.'
	},
	en: {
		title: 'Your passkey',
		what: 'A passkey is a sign-in key that your device keeps for you: a phone, a computer or a security key. You unlock it the way you unlock your device, with your fingerprint, your face or its code.',
		why: 'To act as super admin, you must sign in with a passkey. The link sent by email is not enough: someone who got into your mailbox must not be able to open every organisation.',
		noScript:
			'This page needs JavaScript: a passkey is created by the browser itself, and no form can do it. The rest of the service works without JavaScript.',
		powersActive: 'You are signed in with a passkey: your super admin powers are active.',
		firstTime:
			'No passkey has been registered yet. Register one now, from this session. After that, you will need to be signed in with a passkey to add or remove one.',
		noPowers:
			'You are signed in with the link sent by email: this session has no super admin powers. Sign in with a passkey you have already registered.',
		register: 'Register a passkey',
		signIn: 'Sign in with a passkey',
		registered:
			'Passkey registered. Sign in with it now, with the button below, without leaving the page.',
		registeredAnother:
			'Passkey registered. You can sign in with it next time. There is nothing else to do.',
		registerFailed: 'The passkey could not be registered. Try again, or try from another device.',
		signInFailed: 'Signing in with the passkey did not work. Try again.',
		deleteFailed: 'The passkey could not be removed. Try again.',
		detail: 'Detail given by the browser:',
		listTitle: 'Registered passkeys',
		none: 'None yet.',
		registeredOn: (date) => `Registered on ${date}`,
		unnamed: 'Unnamed',
		delete: 'Remove',
		advice:
			'Register several, on several devices: losing your phone must not close the service. If they are all lost, only a direct change in the database can get you back in: there is no secret question and no code sent by email.'
	},
	ar: {
		title: 'مفتاح المرور الخاص بك',
		what: 'مفتاح المرور مفتاح دخول يحفظه جهازك لك: هاتف أو حاسوب أو مفتاح أمان. تفتحه كما تفتح جهازك، ببصمتك أو بوجهك أو برمزه.',
		why: 'لكي تعمل بصفة المشرف العام، يجب أن تسجل الدخول بمفتاح مرور. الرابط الذي يصلك بالبريد لا يكفي: من يدخل إلى بريدك يجب ألا يستطيع فتح كل المؤسسات.',
		noScript:
			'تحتاج هذه الصفحة إلى JavaScript: المتصفح نفسه هو الذي ينشئ مفتاح المرور، ولا يستطيع أي نموذج فعل ذلك. بقية الخدمة تعمل دون JavaScript.',
		powersActive: 'أنت مسجل الدخول بمفتاح مرور: صلاحياتك بصفة المشرف العام مفعلة.',
		firstTime:
			'لا يوجد أي مفتاح مرور مسجل بعد. سجل واحدًا الآن، وأنت على هذه الصفحة. بعد ذلك، يجب أن تسجل الدخول بمفتاح مرور لتضيف مفتاحًا أو تحذفه.',
		noPowers:
			'أنت مسجل الدخول بالرابط الذي وصلك بالبريد: هذا الدخول لا يمنحك صلاحيات المشرف العام. سجل الدخول بمفتاح مرور مسجل من قبل.',
		register: 'تسجيل مفتاح مرور',
		signIn: 'الدخول بمفتاح مرور',
		registered: 'تم تسجيل مفتاح المرور. سجل الدخول به الآن، بالزر أدناه، دون مغادرة الصفحة.',
		registeredAnother:
			'تم تسجيل مفتاح المرور. يمكنك الدخول به في المرة القادمة. لا حاجة إلى فعل أي شيء آخر.',
		registerFailed: 'تعذر تسجيل مفتاح المرور. أعد المحاولة، أو جرب من جهاز آخر.',
		signInFailed: 'لم ينجح الدخول بمفتاح المرور. أعد المحاولة.',
		deleteFailed: 'تعذر حذف مفتاح المرور. أعد المحاولة.',
		detail: 'رسالة المتصفح:',
		listTitle: 'مفاتيح المرور المسجلة',
		none: 'لا يوجد أي مفتاح بعد.',
		registeredOn: (date) => `تاريخ التسجيل: ${date}`,
		unnamed: 'دون اسم',
		delete: 'حذف',
		advice:
			'سجل أكثر من مفتاح، على أكثر من جهاز: فقدان الهاتف يجب ألا يغلق الخدمة. وإذا ضاعت كلها، فلا سبيل إلى العودة إلا بتدخل مباشر في قاعدة البيانات: لا يوجد سؤال سري ولا رمز يرسل بالبريد.'
	}
};

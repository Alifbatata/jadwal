// Les textes du formulaire public de demande d'accès (`/demande-d-acces`, étape 22, ADR 0049).
//
// La réponse est la même qu'une demande attende déjà pour cette adresse ou non : l'écran ne dit
// jamais qu'une adresse a déjà demandé (ADR 0017). Seule la surcharge du service se dit, parce
// qu'elle ne dit rien de personne.
//
// `elsewhere` est le renvoi vers cette page, que l'écran de connexion et « Vos organisations »
// affichent sous leurs propres textes.

import type { Translations } from './space.js';

interface AccessRequestTexts {
	readonly title: string;
	readonly intro: string;
	readonly outcome: string;
	readonly member: string;
	readonly organizationLabel: string;
	readonly organizationHint: string;
	readonly localityLabel: string;
	readonly localityHint: string;
	readonly contactLabel: string;
	readonly contactHint: string;
	readonly emailLabel: string;
	readonly emailHint: string;
	readonly messageLabel: string;
	readonly messageHint: string;
	readonly privacyTitle: string;
	readonly privacy: string;
	/** Suivi du lien des conditions d'utilisation, puis d'un point. */
	readonly privacyTerms: string;
	readonly submit: string;
	readonly sent: string;
	readonly sentHint: string;
	readonly close: string;
	readonly tooMany: string;
	readonly errorSummary: string;
	readonly errors: {
		readonly required: string;
		readonly tooLong: string;
	};
	readonly elsewhere: {
		readonly question: string;
		readonly link: string;
	};
}

export const accessRequestTexts: Translations<AccessRequestTexts> = {
	fr: {
		title: 'Demander l’accès à jadwal',
		intro:
			'jadwal est gratuit pour les organisations qui veulent publier le programme de leurs cours et de leurs activités. L’accès s’ouvre sur demande : remplissez ce formulaire, et la personne qui exploite le service l’examinera.',
		outcome:
			'Si votre demande est acceptée, une invitation arrivera à l’adresse que vous donnez. Elle ouvre l’espace de votre organisation, où vous gérez son programme.',
		member:
			'Votre organisation utilise déjà jadwal ? Ne remplissez pas ce formulaire : demandez à sa personne responsable de vous inviter.',
		organizationLabel: 'Nom de l’organisation',
		organizationHint: 'Exemple : Association culturelle de Bienne',
		localityLabel: 'Localité',
		localityHint: 'La ville ou la commune de l’organisation. Exemple : Bienne',
		contactLabel: 'Votre nom',
		contactHint: 'Prénom et nom de la personne qui fait la demande.',
		emailLabel: 'Votre adresse électronique',
		emailHint: 'L’invitation partira à cette adresse. Exemple : prenom.nom@example.org',
		messageLabel: 'Message (facultatif)',
		messageHint: 'Ce que vous voulez ajouter : vos activités, une question. 1000 signes au plus.',
		privacyTitle: 'Ce que deviennent ces données',
		privacy:
			'Elles servent seulement à examiner votre demande, et seule la personne qui exploite le service les lit. Ce formulaire n’écrit pas à l’adresse donnée : un courriel n’y part que si la demande est acceptée, et c’est l’invitation. Une demande est effacée 90 jours après la réponse, ou au bout de 12 mois si elle reste sans réponse.',
		privacyTerms: 'Le détail est dans les',
		submit: 'Envoyer la demande',
		sent: 'Votre demande est enregistrée.',
		sentHint:
			'Si elle est acceptée, une invitation arrivera à l’adresse que vous avez donnée. Il n’y a rien d’autre à faire.',
		close: 'Vous pouvez fermer cette page.',
		tooMany:
			'Trop de demandes ont été envoyées ces dernières heures. Votre demande n’est pas partie : réessayez plus tard, par exemple demain.',
		errorSummary:
			'La demande n’est pas partie. Corrigez les champs signalés, puis envoyez-la de nouveau.',
		errors: {
			required: 'Ce champ est obligatoire.',
			tooLong: 'Ce texte est trop long. Raccourcissez-le.'
		},
		elsewhere: {
			question: 'Votre organisation n’utilise pas encore jadwal ?',
			link: 'Demander l’accès'
		}
	},
	de: {
		title: 'Zugang zu jadwal beantragen',
		intro:
			'jadwal ist kostenlos für Organisationen, die das Programm ihrer Kurse und Aktivitäten veröffentlichen möchten. Der Zugang wird auf Antrag eröffnet: Füllen Sie dieses Formular aus, und die Person, die den Dienst betreibt, prüft Ihren Antrag.',
		outcome:
			'Wird Ihr Antrag angenommen, erhalten Sie an die angegebene Adresse eine Einladung. Sie öffnet den Bereich Ihrer Organisation, in dem Sie ihr Programm verwalten.',
		member:
			'Nutzt Ihre Organisation jadwal bereits? Dann füllen Sie dieses Formular nicht aus: Bitten Sie die verantwortliche Person, Sie einzuladen.',
		organizationLabel: 'Name der Organisation',
		organizationHint: 'Beispiel: Kulturverein Biel',
		localityLabel: 'Ort',
		localityHint: 'Die Stadt oder Gemeinde der Organisation. Beispiel: Biel',
		contactLabel: 'Ihr Name',
		contactHint: 'Vor- und Nachname der Person, die den Antrag stellt.',
		emailLabel: 'Ihre E-Mail-Adresse',
		emailHint: 'Die Einladung wird an diese Adresse geschickt. Beispiel: vorname.name@example.org',
		messageLabel: 'Nachricht (freiwillig)',
		messageHint:
			'Was Sie hinzufügen möchten: Ihre Aktivitäten, eine Frage. Höchstens 1000 Zeichen.',
		privacyTitle: 'Was mit diesen Daten geschieht',
		privacy:
			'Sie dienen nur dazu, Ihren Antrag zu prüfen, und nur die Person, die den Dienst betreibt, liest sie. Dieses Formular schreibt der angegebenen Adresse nicht: Eine E-Mail geht nur dorthin, wenn der Antrag angenommen wird, und es ist die Einladung. Ein Antrag wird 90 Tage nach der Antwort gelöscht, oder nach 12 Monaten, wenn er unbeantwortet bleibt.',
		privacyTerms: 'Die Einzelheiten stehen in den',
		submit: 'Antrag senden',
		sent: 'Ihr Antrag ist eingegangen.',
		sentHint:
			'Wird er angenommen, erhalten Sie an die angegebene Adresse eine Einladung. Mehr ist nicht zu tun.',
		close: 'Sie können diese Seite schliessen.',
		tooMany:
			'In den letzten Stunden wurden zu viele Anträge gesendet. Ihr Antrag wurde nicht gesendet: Versuchen Sie es später wieder, zum Beispiel morgen.',
		errorSummary:
			'Der Antrag wurde nicht gesendet. Korrigieren Sie die markierten Felder und senden Sie ihn erneut.',
		errors: {
			required: 'Dieses Feld muss ausgefüllt werden.',
			tooLong: 'Dieser Text ist zu lang. Kürzen Sie ihn.'
		},
		elsewhere: {
			question: 'Nutzt Ihre Organisation jadwal noch nicht?',
			link: 'Zugang beantragen'
		}
	},
	it: {
		title: 'Chiedi l’accesso a jadwal',
		intro:
			'jadwal è gratuito per le organizzazioni che vogliono pubblicare il programma dei loro corsi e delle loro attività. L’accesso si apre su richiesta: compila questo modulo, e la persona che gestisce il servizio esaminerà la tua richiesta.',
		outcome:
			'Se la richiesta viene accettata, all’indirizzo che indichi arriverà un invito. L’invito apre lo spazio della tua organizzazione, dove gestisci il suo programma.',
		member:
			'La tua organizzazione usa già jadwal? Allora non compilare questo modulo: chiedi alla persona responsabile di invitarti.',
		organizationLabel: 'Nome dell’organizzazione',
		organizationHint: 'Esempio: Associazione culturale di Bienne',
		localityLabel: 'Località',
		localityHint: 'La città o il comune dell’organizzazione. Esempio: Bienne',
		contactLabel: 'Il tuo nome',
		contactHint: 'Il nome e il cognome di chi fa la richiesta.',
		emailLabel: 'Il tuo indirizzo e-mail',
		emailHint: 'L’invito partirà verso questo indirizzo. Esempio: nome.cognome@example.org',
		messageLabel: 'Messaggio (facoltativo)',
		messageHint:
			'Quello che vuoi aggiungere: le tue attività, una domanda. Al massimo 1000 caratteri.',
		privacyTitle: 'Che cosa succede a questi dati',
		privacy:
			'Servono solo a esaminare la tua richiesta, e li legge solo la persona che gestisce il servizio. Questo modulo non scrive all’indirizzo indicato: un’e-mail ci arriva solo se la richiesta viene accettata, ed è l’invito. Una richiesta viene cancellata 90 giorni dopo la risposta, oppure dopo 12 mesi se resta senza risposta.',
		privacyTerms: 'I dettagli sono nelle',
		submit: 'Invia la richiesta',
		sent: 'La tua richiesta è stata registrata.',
		sentHint:
			'Se viene accettata, all’indirizzo che hai indicato arriverà un invito. Non devi fare nient’altro.',
		close: 'Puoi chiudere questa pagina.',
		tooMany:
			'Nelle ultime ore sono state inviate troppe richieste. La tua richiesta non è partita: riprova più tardi, per esempio domani.',
		errorSummary: 'La richiesta non è partita. Correggi i campi segnalati, poi inviala di nuovo.',
		errors: {
			required: 'Questo campo è obbligatorio.',
			tooLong: 'Questo testo è troppo lungo. Accorcialo.'
		},
		elsewhere: {
			question: 'La tua organizzazione non usa ancora jadwal?',
			link: 'Chiedi l’accesso'
		}
	},
	en: {
		title: 'Ask for access to jadwal',
		intro:
			'jadwal is free for organisations that want to publish the programme of their courses and activities. Access is opened on request: fill in this form, and the person who runs the service will review it.',
		outcome:
			'If your request is accepted, an invitation will arrive at the address you give. It opens your organisation’s space, where you manage its programme.',
		member:
			'Does your organisation already use jadwal? Then do not fill in this form: ask the person in charge to invite you.',
		organizationLabel: 'Name of the organisation',
		organizationHint: 'Example: Biel Cultural Association',
		localityLabel: 'Town',
		localityHint: 'The town or municipality of the organisation. Example: Biel',
		contactLabel: 'Your name',
		contactHint: 'First name and surname of the person making the request.',
		emailLabel: 'Your email address',
		emailHint: 'The invitation will be sent to this address. Example: first.last@example.org',
		messageLabel: 'Message (optional)',
		messageHint: 'Anything you want to add: your activities, a question. 1000 characters at most.',
		privacyTitle: 'What happens to this information',
		privacy:
			'It is used only to review your request, and only the person who runs the service reads it. This form does not write to the address given: an email goes there only if the request is accepted, and it is the invitation. A request is deleted 90 days after the answer, or after 12 months if it stays unanswered.',
		privacyTerms: 'The details are in the',
		submit: 'Send the request',
		sent: 'Your request has been recorded.',
		sentHint:
			'If it is accepted, an invitation will arrive at the address you gave. There is nothing else to do.',
		close: 'You can close this page.',
		tooMany:
			'Too many requests have been sent in the last few hours. Your request was not sent: try again later, tomorrow for example.',
		errorSummary: 'The request was not sent. Correct the fields marked, then send it again.',
		errors: {
			required: 'This field is required.',
			tooLong: 'This text is too long. Please shorten it.'
		},
		elsewhere: {
			question: 'Your organisation does not use jadwal yet?',
			link: 'Ask for access'
		}
	},
	ar: {
		title: 'اطلب الوصول إلى jadwal',
		intro:
			'jadwal مجاني للمؤسسات التي تريد أن تنشر مواعيد دروسها وأنشطتها. يُفتح الوصول بناءً على طلب: املأ هذا النموذج، وسيدرسه الشخص الذي يدير الخدمة.',
		outcome:
			'إن قُبل طلبك، ستصل دعوة إلى العنوان الذي تكتبه. تفتح الدعوة مساحة مؤسستك، حيث تدير برنامجها.',
		member:
			'إن كانت مؤسستك تستخدم jadwal، فلا حاجة إلى هذا النموذج: اطلب من المسؤول عنها أن يدعوك.',
		organizationLabel: 'اسم المؤسسة',
		organizationHint: 'مثال: الجمعية الثقافية في بيل',
		localityLabel: 'المدينة',
		localityHint: 'المدينة أو البلدية التي توجد فيها المؤسسة. مثال: بيل',
		contactLabel: 'اسمك',
		contactHint: 'الاسم الأول واسم العائلة للشخص الذي يقدّم الطلب.',
		emailLabel: 'بريدك الإلكتروني',
		emailHint: 'ستُرسَل الدعوة إلى هذا العنوان. مثال: name@example.org',
		messageLabel: 'رسالة (اختيارية)',
		messageHint: 'ما تريد إضافته: أنشطتكم، أو سؤال. 1000 حرف على الأكثر.',
		privacyTitle: 'ماذا يحدث لهذه البيانات',
		privacy:
			'لا تُستعمل إلا لدراسة طلبك، ولا يطّلع عليها إلا الشخص الذي يدير الخدمة. لا يكتب هذا النموذج إلى العنوان المذكور: لا تُرسَل إليه رسالة إلا إن قُبل الطلب، وهي الدعوة. يُحذف الطلب بعد 90 يومًا من الرد، أو بعد 12 شهرًا إن بقي بلا رد.',
		privacyTerms: 'التفاصيل في',
		submit: 'أرسل الطلب',
		sent: 'سُجّل طلبك.',
		sentHint: 'إن قُبل، ستصل دعوة إلى العنوان الذي كتبته. لا شيء آخر عليك فعله.',
		close: 'يمكنك إغلاق هذه الصفحة.',
		tooMany:
			'أُرسلت طلبات كثيرة جدًا في الساعات الأخيرة. لم يُرسَل طلبك: حاول مرة أخرى لاحقًا، غدًا مثلًا.',
		errorSummary: 'لم يُرسَل الطلب. صحّح الحقول المشار إليها، ثم أرسله مرة أخرى.',
		errors: {
			required: 'هذا الحقل مطلوب.',
			tooLong: 'هذا النص طويل جدًا. اختصره.'
		},
		elsewhere: {
			question: 'مؤسستك لا تستخدم jadwal بعد؟',
			link: 'اطلب الوصول'
		}
	}
};

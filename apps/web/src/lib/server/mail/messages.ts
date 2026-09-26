// Les courriels que le service envoie. Texte et HTML, dans les cinq langues de l'espace, sans image
// ni pièce jointe.
//
// Aucun message ne dit jamais si un compte existe : le lien de connexion est le même pour une
// adresse connue et pour une adresse inconnue (ADR 0017). Pour la même raison, la langue d'un
// courriel ne vient jamais du compte à qui l'on écrit, qu'il faudrait lire par son adresse : elle vient
// de l'écran où le geste est fait (retour D3, voir `language.ts`). Sans langue donnée, c'est celle de
// la requête en cours.

import { direction, type Langue } from '$lib/i18n.js';
import type { Translations } from '$lib/i18n/space.js';
import { mailLanguage } from './language.js';
import type { OutgoingEmail } from './types.js';

/** Échappe ce qui irait dans du HTML. Les valeurs viennent d'une saisie, jamais de nous. */
function escape(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

/** Le pied de tous les messages : qui écrit, et à qui répondre (étape 9). */
const SIGNATURES: Translations<string> = {
	fr: 'jadwal, un service de Voltia',
	de: 'jadwal, ein Dienst von Voltia',
	it: 'jadwal, un servizio di Voltia',
	en: 'jadwal, a service from Voltia',
	ar: 'jadwal، خدمة من Voltia'
};

function layout(language: Langue, title: string, body: string): string {
	return [
		'<!doctype html>',
		`<html lang="${language}" dir="${direction(language)}"><head><meta charset="utf-8">`,
		`<title>${escape(title)}</title></head>`,
		'<body style="font-family:system-ui,sans-serif;line-height:1.5">',
		body,
		`<hr><p style="color:#555;font-size:0.9em">${escape(SIGNATURES[language])}</p>`,
		'</body></html>'
	].join('');
}

/** Le même pied, en texte brut. Séparé par la ligne que les clients de messagerie reconnaissent. */
function signer(language: Langue, texte: string): string {
	return `${texte}

--
${SIGNATURES[language]}`;
}

// L'ordre des clés est celui où le correcteur les lit, recollées ligne après ligne : le texte du lien,
// qui n'a pas de point, vient en dernier, pour ne pas se coller à la phrase qui le suivrait.
interface MagicLinkTexts {
	readonly subject: string;
	readonly greeting: string;
	readonly intro: string;
	readonly validity: string;
	readonly ignore: string;
	readonly link: string;
}

const MAGIC_LINK: Translations<MagicLinkTexts> = {
	fr: {
		subject: 'Votre lien de connexion à jadwal',
		greeting: 'Bonjour,',
		intro: 'Voici votre lien de connexion :',
		validity: 'Il est valable quinze minutes et ne peut servir qu’une fois.',
		ignore: 'Si vous n’avez rien demandé, ignorez ce message : personne n’a accès à votre compte.',
		link: 'Se connecter à jadwal'
	},
	de: {
		subject: 'Ihr Anmeldelink für jadwal',
		greeting: 'Guten Tag',
		intro: 'Hier ist Ihr Anmeldelink:',
		validity: 'Er ist fünfzehn Minuten gültig und kann nur einmal verwendet werden.',
		ignore:
			'Wenn Sie nichts angefordert haben, ignorieren Sie diese Nachricht: Niemand hat Zugang zu Ihrem Konto.',
		link: 'Bei jadwal anmelden'
	},
	it: {
		subject: 'Il tuo link di accesso a jadwal',
		greeting: 'Buongiorno,',
		intro: 'Ecco il tuo link di accesso:',
		validity: 'È valido quindici minuti e si può usare una sola volta.',
		ignore: 'Se non hai chiesto nulla, ignora questo messaggio: nessuno ha accesso al tuo account.',
		link: 'Accedi a jadwal'
	},
	en: {
		subject: 'Your sign-in link for jadwal',
		greeting: 'Hello,',
		intro: 'Here is your sign-in link:',
		validity: 'It is valid for fifteen minutes and can only be used once.',
		ignore: 'If you did not ask for it, ignore this message: nobody has access to your account.',
		link: 'Sign in to jadwal'
	},
	ar: {
		subject: 'رابط الدخول إلى jadwal',
		greeting: 'مرحبًا،',
		intro: 'إليك رابط الدخول:',
		validity: 'يبقى الرابط صالحًا 15 دقيقة، ولا يُستخدم إلا مرة واحدة.',
		ignore: 'إن لم تطلب شيئًا، فتجاهل هذه الرسالة: لا أحد يستطيع الدخول إلى حسابك.',
		link: 'الدخول إلى jadwal'
	}
};

/**
 * Le lien de connexion, dans la langue de l'écran d'où il est demandé. Le lien est la première
 * adresse du texte brut : c'est celle qu'un client de messagerie rend cliquable.
 */
export function magicLinkEmail(
	to: string,
	url: string,
	language: Langue = mailLanguage()
): OutgoingEmail {
	const words = MAGIC_LINK[language];
	const text = [words.greeting, '', words.intro, url, '', words.validity, words.ignore].join('\n');
	const html = layout(
		language,
		words.subject,
		[
			`<p>${escape(words.greeting)}</p>`,
			`<p><a href="${escape(url)}">${escape(words.link)}</a></p>`,
			`<p>${escape(words.validity)}</p>`,
			`<p>${escape(words.ignore)}</p>`
		].join('')
	);
	return { to, subject: words.subject, text: signer(language, text), html };
}

interface InvitationTexts {
	readonly subject: (organisation: string) => string;
	readonly greeting: string;
	/** La phrase de l'invitation, autour du nom de l'organisation, mis en valeur dans le HTML. */
	readonly invited: { readonly before: string; readonly after: string };
	readonly howTo: string;
	readonly link: string;
	readonly next: string;
	readonly validity: string;
	readonly nothingShared: string;
	readonly ignore: string;
}

const INVITATION: Translations<InvitationTexts> = {
	fr: {
		subject: (organisation) => `Invitation à rejoindre ${organisation} sur jadwal`,
		greeting: 'Bonjour,',
		invited: {
			before: 'Vous êtes invité à rejoindre',
			after: 'sur jadwal, le service qui publie le programme des cours de l’organisation.'
		},
		howTo:
			'Pour accepter, ouvrez cette page et connectez-vous avec l’adresse électronique qui a reçu ce message :',
		link: 'Se connecter pour accepter',
		next: 'Vous recevrez un lien de connexion, puis l’invitation vous attendra sur l’écran « Vos organisations ».',
		validity: 'L’invitation est valable quatorze jours.',
		nothingShared:
			'Tant que vous n’avez pas accepté, rien n’est partagé et votre nom n’apparaît nulle part.',
		ignore: 'Si cette invitation ne vous concerne pas, ignorez ce message.'
	},
	de: {
		subject: (organisation) => `Einladung zu ${organisation} auf jadwal`,
		greeting: 'Guten Tag',
		invited: {
			before: 'Sie wurden eingeladen,',
			after:
				'auf jadwal beizutreten, dem Dienst, der das Kursprogramm der Organisation veröffentlicht.'
		},
		howTo:
			'Um die Einladung anzunehmen, öffnen Sie diese Seite und melden Sie sich mit der E-Mail-Adresse an, die diese Nachricht erhalten hat:',
		link: 'Anmelden und annehmen',
		next: 'Sie erhalten einen Anmeldelink, danach wartet die Einladung auf der Seite «Ihre Organisationen» auf Sie.',
		validity: 'Die Einladung ist vierzehn Tage gültig.',
		nothingShared:
			'Solange Sie nicht angenommen haben, wird nichts geteilt, und Ihr Name erscheint nirgends.',
		ignore: 'Wenn diese Einladung nicht für Sie bestimmt ist, ignorieren Sie diese Nachricht.'
	},
	it: {
		subject: (organisation) => `Invito a unirti a ${organisation} su jadwal`,
		greeting: 'Buongiorno,',
		invited: {
			before: 'Sei invitato a unirti a',
			after: 'su jadwal, il servizio che pubblica il programma dei corsi dell’organizzazione.'
		},
		howTo:
			'Per accettare, apri questa pagina e accedi con l’indirizzo e-mail che ha ricevuto questo messaggio:',
		link: 'Accedi per accettare',
		next: 'Riceverai un link di accesso, poi l’invito ti aspetterà nella pagina «Le tue organizzazioni».',
		validity: 'L’invito è valido quattordici giorni.',
		nothingShared:
			'Finché non hai accettato, non viene condiviso nulla e il tuo nome non compare da nessuna parte.',
		ignore: 'Se questo invito non ti riguarda, ignora questo messaggio.'
	},
	en: {
		subject: (organisation) => `Invitation to join ${organisation} on jadwal`,
		greeting: 'Hello,',
		invited: {
			before: 'You have been invited to join',
			after: 'on jadwal, the service that publishes the organisation’s course programme.'
		},
		howTo:
			'To accept, open this page and sign in with the email address that received this message:',
		link: 'Sign in to accept',
		next: 'You will receive a sign-in link, then the invitation will be waiting for you on the ‘Your organisations’ page.',
		validity: 'The invitation is valid for fourteen days.',
		nothingShared: 'Until you accept, nothing is shared, and your name appears nowhere.',
		ignore: 'If this invitation is not meant for you, ignore this message.'
	},
	ar: {
		subject: (organisation) => `دعوة للانضمام إلى ${organisation} على jadwal`,
		greeting: 'مرحبًا،',
		invited: {
			before: 'أنت مدعو للانضمام إلى',
			after: 'على jadwal، الخدمة التي تنشر برنامج دروس المؤسسة.'
		},
		howTo: 'للقبول، افتح هذه الصفحة وسجّل الدخول بالبريد الإلكتروني الذي وصلته هذه الرسالة:',
		link: 'سجّل الدخول للقبول',
		next: 'سيصلك رابط للدخول، ثم تجد الدعوة في صفحة «مؤسساتك».',
		validity: 'تبقى الدعوة صالحة 14 يومًا.',
		nothingShared: 'ما لم تقبل، لا يُشارَك أي شيء ولا يظهر اسمك في أي مكان.',
		ignore: 'إن لم تكن هذه الدعوة موجّهة إليك، فتجاهل هذه الرسالة.'
	}
};

/**
 * L'invitation, dans la langue de la personne qui invite, que l'adresse invitée ait un compte ou non :
 * lire la langue de ce compte demanderait de le chercher par son adresse, ce que le chemin
 * d'invitation ne fait jamais (ADR 0017).
 */
export function invitationEmail(
	to: string,
	organisation: string,
	origin: string,
	language: Langue = mailLanguage()
): OutgoingEmail {
	const words = INVITATION[language];
	const subject = words.subject(organisation);
	const text = [
		words.greeting,
		'',
		`${words.invited.before} ${organisation} ${words.invited.after}`,
		'',
		words.howTo,
		`${origin}/connexion`,
		'',
		`${words.next} ${words.validity}`,
		'',
		words.nothingShared,
		words.ignore
	].join('\n');
	const html = layout(
		language,
		subject,
		[
			`<p>${escape(words.greeting)}</p>`,
			`<p>${escape(words.invited.before)} <strong>${escape(organisation)}</strong> ${escape(words.invited.after)}</p>`,
			`<p>${escape(words.howTo)}</p>`,
			`<p><a href="${escape(origin)}/connexion">${escape(words.link)}</a></p>`,
			`<p>${escape(words.next)} ${escape(words.validity)}</p>`,
			`<p>${escape(words.nothingShared)}</p>`,
			`<p>${escape(words.ignore)}</p>`
		].join('')
	);
	return { to, subject, text: signer(language, text), html };
}

// Les textes de l'écran Partager (`/partager`).
//
// Quatre façons de faire connaître le programme : l'adresse de la page publique, le message de la
// semaine prêt à coller, le QR code et le code pour un site. L'écran s'adresse à une personne qui n'a
// jamais touché au code d'un site : chaque code dit où il se colle, avec un exemple, sans les mots du
// métier. Le mot « cadre » remplace celui de la balise ; le mot de l'empreinte d'intégrité n'apparaît
// que comme ce qu'une personne technique pourrait demander, entre guillemets.
//
// `codeWords` n'est pas lu dans la langue de l'écran : ce sont les mots écrits dans le code lui-même,
// que verront les visiteurs du site de l'organisation. Ils sont donc pris dans la langue de
// l'organisation.

import type { Translations } from './space.js';

interface ShareTexts {
	readonly title: string;
	readonly intro: string;
	readonly link: {
		readonly title: string;
		readonly help: string;
		readonly open: string;
	};
	readonly week: {
		readonly title: string;
		readonly help: string;
		/** Quand le message existe en plusieurs langues : lesquelles, et laquelle ouvrir. */
		readonly languages: string;
		/** Le titre d'un message, par le nom de sa langue écrit dans la langue de l'écran. */
		readonly in: (language: string) => string;
		/**
		 * Ajouté entre parenthèses au titre du premier message, celui de la langue de l'organisation.
		 * Une phrase à part, et non une seconde fonction qui répéterait le début de la première : le
		 * correcteur lit à la suite les textes voisins, et y voyait un mot répété.
		 */
		readonly main: string;
		readonly label: (language: string) => string;
	};
	readonly qr: {
		readonly title: string;
		readonly help: string;
		/** Le nom de l'image pour les lecteurs d'écran, aussi écrit dans le fichier téléchargé. */
		readonly label: string;
		readonly download: string;
	};
	readonly code: {
		readonly title: string;
		readonly intro: string;
		/** Ce que le programme ne prend pas au site : ses couleurs, ses polices. */
		readonly ownLook: string;
		readonly simpleTitle: string;
		readonly simpleWhere: string;
		readonly simpleSomeoneElse: string;
		readonly simpleLabel: string;
		readonly frameTitle: string;
		readonly frameWhere: string;
		/** La hauteur du cadre, et un exemple plus grand : les deux nombres viennent du serveur. */
		readonly frameHeight: (height: number, example: number) => string;
		readonly frameLabel: string;
		readonly lockedTitle: string;
		readonly lockedWhere: string;
		readonly lockedLabel: string;
	};
	/** Les mots écrits dans le code, dans la langue de l'organisation. */
	readonly codeWords: {
		/** Le nom du cadre, suivi du nom de l'organisation. */
		readonly frameName: string;
		/** Le lien que voient les visiteurs dont le navigateur refuse le programme. */
		readonly fallbackLink: string;
	};
}

export const shareTexts: Translations<ShareTexts> = {
	fr: {
		title: 'Partager',
		intro:
			'Tout ce qu’il faut pour faire connaître votre programme : l’adresse de votre page publique, un message prêt à coller, un QR code et le code pour votre site.',
		link: {
			title: 'L’adresse de votre page publique',
			help: 'Votre page publique montre vos cours à tout le monde, sans compte. Mettez son adresse partout où l’on vous cherche : bio Instagram, groupe WhatsApp, affiche. Elle ne change jamais.',
			open: 'Ouvrir la page publique'
		},
		week: {
			title: 'Le programme de la semaine, prêt à coller',
			help: 'Copiez ce message dans votre groupe WhatsApp, ou partout où votre communauté vous lit. Il donne les cours publiés des sept prochains jours, annulations comprises.',
			languages:
				'Il est écrit dans chacune des langues de votre page publique : ouvrez celle de votre groupe.',
			in: (language) => `En ${language}`,
			main: 'la langue principale de votre page',
			label: (language) => `Programme de la semaine en ${language}`
		},
		qr: {
			title: 'Le QR code',
			help: 'Un téléphone qui photographie ce carré ouvre votre page publique. Imprimez-le sur une affiche ou une annonce.',
			label: 'QR code de votre page publique',
			download: 'Télécharger le QR code (image)'
		},
		code: {
			title: 'Le programme sur votre site',
			intro:
				'Votre site peut afficher le programme, toujours à jour : quand vous changez un cours ici, votre site suit tout seul.',
			ownLook:
				'Le programme garde sa propre présentation : il ne prend ni les couleurs ni les polices de votre site.',
			simpleTitle: 'Le code à coller',
			simpleWhere:
				'Collez ce code sur votre site, à l’endroit où le programme doit apparaître, dans un bloc qui accepte du code HTML. Exemple : sur WordPress, ajoutez un bloc « HTML personnalisé » à la page de vos cours, puis collez-y ce code.',
			simpleSomeoneElse: 'Quelqu’un d’autre s’occupe de votre site ? Envoyez-lui ce code.',
			simpleLabel: 'Code à coller',
			frameTitle: 'Si votre site refuse ce code',
			frameWhere:
				'Certains sites n’acceptent pas le premier code : le programme n’apparaît pas une fois la page enregistrée. Collez alors celui-ci au même endroit, à la place du premier. Il montre votre page publique dans un cadre de hauteur fixe, et le programme défile à l’intérieur.',
			frameHeight: (height, example) =>
				`Pour un cadre plus haut, remplacez ${height} par un nombre plus grand dans le code, par exemple ${example}.`,
			frameLabel: 'Code du cadre à coller',
			lockedTitle: 'Pour un site très strict (rare)',
			lockedWhere:
				'Si la personne qui gère votre site demande un code « avec empreinte d’intégrité », donnez-lui celui-ci. Il ne se met pas à jour tout seul : quand jadwal change, revenez le copier ici.',
			lockedLabel: 'Code avec empreinte d’intégrité'
		},
		codeWords: {
			frameName: 'Programme des cours',
			fallbackLink: 'Voir le programme des cours'
		}
	},
	de: {
		title: 'Teilen',
		intro:
			'Alles, um Ihr Programm bekannt zu machen: die Adresse Ihrer öffentlichen Seite, eine Nachricht zum Einfügen, ein QR-Code und der Code für Ihre Website.',
		link: {
			title: 'Die Adresse Ihrer öffentlichen Seite',
			help: 'Ihre öffentliche Seite zeigt Ihre Kurse allen, ohne Konto. Geben Sie ihre Adresse überall an, wo man Sie sucht: Instagram-Bio, WhatsApp-Gruppe, Aushang. Sie ändert sich nie.',
			open: 'Öffentliche Seite öffnen'
		},
		week: {
			title: 'Das Wochenprogramm zum Einfügen',
			help: 'Kopieren Sie diese Nachricht in Ihre WhatsApp-Gruppe oder überallhin, wo Ihre Gemeinschaft Sie liest. Sie enthält die veröffentlichten Kurse der nächsten sieben Tage, Absagen inbegriffen.',
			languages:
				'Sie ist in jeder Sprache Ihrer öffentlichen Seite geschrieben: Öffnen Sie die Sprache Ihrer Gruppe.',
			in: (language) => `Auf ${language}`,
			main: 'die Hauptsprache Ihrer Seite',
			label: (language) => `Wochenprogramm auf ${language}`
		},
		qr: {
			title: 'Der QR-Code',
			help: 'Ein Telefon, das dieses Quadrat fotografiert, öffnet Ihre öffentliche Seite. Drucken Sie den QR-Code auf einen Aushang oder eine Ankündigung.',
			label: 'QR-Code Ihrer öffentlichen Seite',
			download: 'QR-Code herunterladen (Bild)'
		},
		code: {
			title: 'Das Programm auf Ihrer Website',
			intro:
				'Ihre Website kann das Programm anzeigen, immer aktuell: Wenn Sie hier einen Kurs ändern, zieht Ihre Website von selbst nach.',
			ownLook:
				'Das Programm behält seine eigene Gestaltung: Es übernimmt weder die Farben noch die Schriften Ihrer Website.',
			simpleTitle: 'Der Code zum Einfügen',
			simpleWhere:
				'Fügen Sie diesen Code auf Ihrer Website dort ein, wo das Programm erscheinen soll, in einem Block, der HTML-Code annimmt. Beispiel: In WordPress legen Sie auf der Seite Ihrer Kurse einen Block «Individuelles HTML» an und kopieren diesen Code hinein.',
			simpleSomeoneElse:
				'Kümmert sich jemand anderes um Ihre Website? Schicken Sie dieser Person den Code.',
			simpleLabel: 'Code zum Einfügen',
			frameTitle: 'Wenn Ihre Website diesen Code ablehnt',
			frameWhere:
				'Manche Websites nehmen den ersten Code nicht an: Das Programm erscheint nach dem Speichern der Seite nicht. Fügen Sie dann diesen Code an derselben Stelle ein, anstelle des ersten. Er zeigt Ihre öffentliche Seite in einem Rahmen mit fester Höhe, und das Programm lässt sich darin scrollen.',
			frameHeight: (height, example) =>
				`Für einen höheren Rahmen ersetzen Sie im Code ${height} durch eine grössere Zahl, zum Beispiel ${example}.`,
			frameLabel: 'Code des Rahmens zum Einfügen',
			lockedTitle: 'Für eine sehr strenge Website (selten)',
			lockedWhere:
				'Wenn die Person, die Ihre Website betreut, einen Code «mit Prüfsumme» verlangt, geben Sie ihr diesen. Er aktualisiert sich nicht von selbst: Wenn sich jadwal ändert, kopieren Sie ihn hier neu.',
			lockedLabel: 'Code mit Prüfsumme'
		},
		codeWords: {
			frameName: 'Kursprogramm',
			fallbackLink: 'Das Kursprogramm ansehen'
		}
	},
	it: {
		title: 'Condividi',
		intro:
			'Tutto quello che serve per far conoscere il tuo programma: l’indirizzo della tua pagina pubblica, un messaggio pronto da incollare, un codice QR e il codice per il tuo sito.',
		link: {
			title: 'L’indirizzo della tua pagina pubblica',
			help: 'La tua pagina pubblica mostra i tuoi corsi a tutti, senza account. Metti il suo indirizzo ovunque ti si cerchi: profilo Instagram, gruppo WhatsApp, locandina. Non cambia mai.',
			open: 'Apri la pagina pubblica'
		},
		week: {
			title: 'Il programma della settimana, pronto da incollare',
			help: 'Copia questo messaggio nel tuo gruppo WhatsApp, oppure ovunque la tua comunità ti legga. Contiene i corsi pubblicati dei prossimi sette giorni, annullamenti compresi.',
			languages:
				'È scritto in ciascuna delle lingue della tua pagina pubblica: apri quella del tuo gruppo.',
			in: (language) => `In ${language}`,
			main: 'la lingua principale della tua pagina',
			label: (language) => `Programma della settimana in ${language}`
		},
		qr: {
			title: 'Il codice QR',
			help: 'Un telefono che fotografa questo quadrato apre la tua pagina pubblica. Stampalo su una locandina o su un avviso.',
			label: 'Codice QR della tua pagina pubblica',
			download: 'Scarica il codice QR (immagine)'
		},
		code: {
			title: 'Il programma sul tuo sito',
			intro:
				'Il tuo sito può mostrare il programma, sempre aggiornato: quando cambi un corso qui, il tuo sito si aggiorna da solo.',
			ownLook:
				'Il programma mantiene il suo aspetto: non prende né i colori né i caratteri del tuo sito.',
			simpleTitle: 'Il codice da incollare',
			simpleWhere:
				'Incolla questo codice sul tuo sito, nel punto in cui deve comparire il programma, in un blocco che accetta codice HTML. Esempio: su WordPress, aggiungi un blocco «HTML personalizzato» alla pagina dei tuoi corsi e incollaci questo codice.',
			simpleSomeoneElse: 'Del tuo sito si occupa qualcun altro? Mandagli questo codice.',
			simpleLabel: 'Codice da incollare',
			frameTitle: 'Se il tuo sito rifiuta questo codice',
			frameWhere:
				'Alcuni siti non accettano il primo codice: il programma non compare dopo aver salvato la pagina. Incolla allora questo nello stesso punto, al posto del primo. Mostra la tua pagina pubblica in una cornice di altezza fissa, e il programma scorre al suo interno.',
			frameHeight: (height, example) =>
				`Per una cornice più alta, sostituisci ${height} con un numero più grande nel codice, per esempio ${example}.`,
			frameLabel: 'Codice della cornice da incollare',
			lockedTitle: 'Per un sito molto rigoroso (raro)',
			lockedWhere:
				'Se la persona che gestisce il tuo sito chiede un codice «con impronta di integrità», dagli questo. Non si aggiorna da solo: quando jadwal cambia, torna a copiarlo qui.',
			lockedLabel: 'Codice con impronta di integrità'
		},
		codeWords: {
			frameName: 'Programma dei corsi',
			fallbackLink: 'Vedi il programma dei corsi'
		}
	},
	en: {
		title: 'Share',
		intro:
			'Everything you need to make your programme known: the address of your public page, a message ready to paste, a QR code and the code for your website.',
		link: {
			title: 'The address of your public page',
			help: 'Your public page shows your courses to everyone, with no account. Put its address wherever people look for you: Instagram bio, WhatsApp group, poster. It never changes.',
			open: 'Open the public page'
		},
		week: {
			title: 'This week’s programme, ready to paste',
			help: 'Copy this message into your WhatsApp group, or wherever your community reads you. It lists the published courses for the next seven days, cancellations included.',
			languages:
				'It is written in each language of your public page: open the one your group reads.',
			in: (language) => `In ${language}`,
			main: 'the main language of your page',
			label: (language) => `This week’s programme in ${language}`
		},
		qr: {
			title: 'The QR code',
			help: 'A phone that photographs this square opens your public page. Print it on a poster or a notice.',
			label: 'QR code of your public page',
			download: 'Download the QR code (image)'
		},
		code: {
			title: 'The programme on your website',
			intro:
				'Your website can show the programme, always up to date: when you change a course here, your website follows on its own.',
			ownLook:
				'The programme keeps its own look: it does not take on the colours or the fonts of your website.',
			simpleTitle: 'The code to paste',
			simpleWhere:
				'Paste this code into your website, where the programme should appear, in a block that accepts HTML code. Example: on WordPress, add a ‘Custom HTML’ block to the page of your courses, then paste this code into it.',
			simpleSomeoneElse: 'Does someone else look after your website? Send them this code.',
			simpleLabel: 'Code to paste',
			frameTitle: 'If your website refuses this code',
			frameWhere:
				'Some websites do not accept the first code: the programme does not appear once the page is saved. Then paste this code in the same place, instead of the first. It shows your public page in a frame of fixed height, and the programme scrolls inside it.',
			frameHeight: (height, example) =>
				`For a taller frame, replace ${height} with a bigger number in the code, for example ${example}.`,
			frameLabel: 'Frame code to paste',
			lockedTitle: 'For a very strict website (rare)',
			lockedWhere:
				'If the person who runs your website asks for a code ‘with an integrity hash’, give them this one. It does not update on its own: when jadwal changes, come back and copy it again here.',
			lockedLabel: 'Code with an integrity hash'
		},
		codeWords: {
			frameName: 'Course programme',
			fallbackLink: 'See the course programme'
		}
	},
	ar: {
		title: 'المشاركة',
		intro:
			'هنا تجد ما يلزم للتعريف ببرنامجك: عنوان صفحتك العامة، ورسالة للنسخ واللصق، ورمز QR، والشيفرة الخاصة بموقعك.',
		link: {
			title: 'عنوان صفحتك العامة',
			help: 'تعرض صفحتك العامة دروسك للجميع، دون حساب. ضع عنوانها في كل مكان يبحث فيه الناس عنك: حسابك على Instagram، مجموعة WhatsApp، ملصق. هذا العنوان لا يتغيّر أبدًا.',
			open: 'فتح الصفحة العامة'
		},
		week: {
			title: 'برنامج الأسبوع، للنسخ واللصق',
			help: 'انسخ هذه الرسالة والصقها في مجموعة WhatsApp الخاصة بك، أو في أي مكان يتابعك فيه مجتمعك. وهي تذكر الدروس المنشورة في الأيام السبعة القادمة، والدروس الملغاة أيضًا.',
			languages: 'وهي مكتوبة بكل لغة من لغات صفحتك العامة: افتح لغة مجموعتك.',
			in: (language) => `ب${language}`,
			main: 'اللغة الأساسية لصفحتك',
			label: (language) => `برنامج الأسبوع ب${language}`
		},
		qr: {
			title: 'رمز QR',
			help: 'عندما يصوّر هاتفٌ هذا المربع، تُفتح صفحتك العامة. اطبعه على ملصق أو إعلان.',
			label: 'رمز QR لصفحتك العامة',
			download: 'تنزيل رمز QR (صورة)'
		},
		code: {
			title: 'البرنامج على موقعك',
			intro:
				'يمكن لموقعك أن يعرض البرنامج محدَّثًا دائمًا: عندما تغيّر درسًا هنا، يتبعه موقعك تلقائيًا.',
			ownLook: 'يحتفظ البرنامج بمظهره الخاص: فهو لا يأخذ ألوان موقعك ولا خطوطه.',
			simpleTitle: 'الشيفرة التي تلصقها',
			simpleWhere:
				'الصق هذه الشيفرة في موقعك، في المكان الذي يجب أن يظهر فيه البرنامج، داخل مكوّن يقبل شيفرة HTML. مثال: في WordPress، أضف مكوّن «HTML مخصص» إلى صفحة دروسك، ثم الصق فيه هذه الشيفرة.',
			simpleSomeoneElse: 'هل يتولى شخص آخر موقعك؟ أرسل إليه هذه الشيفرة.',
			simpleLabel: 'الشيفرة التي تلصقها',
			frameTitle: 'إذا رفض موقعك هذه الشيفرة',
			frameWhere:
				'بعض المواقع لا تقبل الشيفرة الأولى: لا يظهر البرنامج بعد حفظ الصفحة. عندئذٍ الصق هذه الشيفرة في المكان نفسه، بدلًا من الأولى. وهي تعرض صفحتك العامة داخل إطار بارتفاع ثابت، ويتحرك البرنامج داخله إلى الأعلى والأسفل.',
			frameHeight: (height, example) =>
				`لإطار أعلى، استبدل في الشيفرة ${height} برقم أكبر، مثلًا ${example}.`,
			frameLabel: 'شيفرة الإطار المطلوب لصقها',
			lockedTitle: 'لموقع صارم جدًا (نادر)',
			lockedWhere:
				'إذا طلب الشخص الذي يدير موقعك شيفرة «ببصمة تحقق من السلامة»، فأعطه هذه. وهي لا تُحدَّث تلقائيًا: عندما يتغيّر jadwal، عد وانسخها من هنا من جديد.',
			lockedLabel: 'شيفرة ببصمة تحقق من السلامة'
		},
		codeWords: {
			frameName: 'برنامج الدروس',
			fallbackLink: 'عرض برنامج الدروس'
		}
	}
};

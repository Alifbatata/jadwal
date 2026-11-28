// Les textes du poste « Diffuser » (`/direct`, ADR 0056) : l'écran d'où une personne de
// l'organisation lance le direct du sermon. Le lien de la navigation est dans `common.ts`.
//
// La personne qui lit cet écran est debout près de la sono, un vendredi, et n'a pas le temps :
// chaque phrase dit ce qui se passe et quoi faire, sans un mot du relais ni du jeton.

import type { Translations } from './space.js';

interface LiveTexts {
	readonly title: string;
	readonly intro: string;
	/** La traduction vient d'une machine : la personne qui diffuse doit le savoir aussi. */
	readonly automatic: string;
	readonly languages: {
		readonly legend: string;
		readonly help: string;
		/** Aucune langue cochée : rien à diffuser. */
		readonly none: string;
		/**
		 * Aucune des langues que l'organisation a choisies dans ses réglages n'est servie par le relais
		 * de cette instance : pas de bouton (ADR 0056 amendée).
		 */
		readonly unavailable: string;
	};
	readonly start: string;
	readonly stop: string;
	/** Sans JavaScript, l'écran ne peut rien : il le dit. */
	readonly noScript: string;
	readonly phase: {
		readonly starting: string;
		readonly live: string;
		readonly resuming: string;
	};
	readonly keepOpen: string;
	readonly duration: string;
	readonly maxDuration: string;
	readonly listeners: { readonly title: string; readonly total: string };
	readonly microphone: {
		readonly level: string;
		/** Le direct tourne, mais le micro ne donne que du silence depuis plusieurs secondes. */
		readonly silent: string;
	};
	/** Le relais a fermé le direct. `other` : toute raison que l'écran ne sait pas nommer. */
	readonly closed: {
		readonly requested: string;
		readonly duration: string;
		readonly silence: string;
		readonly ceiling: string;
		readonly replaced: string;
		readonly translator: string;
		readonly shutdown: string;
		readonly other: string;
	};
	/** Le relais n'a pas voulu ouvrir le direct. */
	readonly refused: {
		readonly token: string;
		readonly languages: string;
		readonly ceiling: string;
		readonly shutdown: string;
		readonly other: string;
	};
	/** Le serveur web n'a pas donné l'autorisation : session finie, ou droit retiré. */
	readonly denied: string;
	/** Rien n'a répondu au départ. */
	readonly unreachable: string;
	/** La liaison est tombée pendant le direct, et les reprises n'ont rien donné. */
	readonly lost: string;
	readonly microphoneErrors: {
		readonly denied: string;
		readonly missing: string;
		readonly busy: string;
		readonly unsupported: string;
	};
}

export const liveTexts: Translations<LiveTexts> = {
	fr: {
		title: 'Diffuser le sermon en direct',
		intro:
			'Cet appareil capte la voix par son micro et l’envoie pour qu’elle soit traduite. Les personnes qui écoutent choisissent leur langue. Rien n’est enregistré.',
		automatic: 'La traduction est faite par une machine : elle peut contenir des erreurs.',
		languages: {
			legend: 'Langues de traduction',
			help: 'Chaque langue cochée est traduite pendant tout le direct. Décochez celles dont personne n’a besoin.',
			none: 'Cochez au moins une langue.',
			unavailable:
				'Aucune des langues choisies pour le direct n’est disponible ici. La personne responsable les choisit dans les réglages.'
		},
		start: 'Commencer le direct',
		stop: 'Arrêter le direct',
		noScript: 'Cet écran a besoin de JavaScript pour capter le micro.',
		phase: {
			starting: 'Connexion en cours…',
			live: 'En direct',
			resuming: 'La liaison est coupée. Nouvel essai en cours…'
		},
		keepOpen:
			'Gardez cet écran ouvert jusqu’à la fin : si l’appareil se met en veille ou si vous quittez cette page, le direct s’arrête.',
		duration: 'Durée',
		maxDuration: 'Arrêt automatique après',
		listeners: { title: 'Personnes à l’écoute', total: 'Total' },
		microphone: {
			level: 'Niveau du micro',
			silent:
				'Le micro ne capte aucun son. Vérifiez qu’il est allumé, branché, et que le son n’est pas coupé.'
		},
		closed: {
			requested: 'Le direct est terminé.',
			duration: 'Le direct s’est arrêté : la durée maximale est atteinte.',
			silence: 'Le direct s’est arrêté : plus aucun son n’arrivait de cet appareil.',
			ceiling: 'Le direct s’est arrêté : le temps de traduction prévu pour ce mois est épuisé.',
			replaced: 'Le direct a été repris depuis un autre appareil. Celui-ci ne diffuse plus.',
			translator:
				'Le direct s’est arrêté : le service de traduction ne répond plus. Vous pouvez recommencer.',
			shutdown:
				'Le direct s’est arrêté : le service redémarre. Vous pouvez recommencer dans un instant.',
			other: 'Le direct s’est arrêté à cause d’une erreur. Vous pouvez recommencer.'
		},
		refused: {
			token:
				'Le direct n’a pas pu commencer : l’autorisation n’a pas été acceptée. Rechargez la page et réessayez.',
			languages: 'Le direct n’a pas pu commencer : une des langues choisies n’est pas proposée.',
			ceiling:
				'Le direct ne peut pas commencer : le temps de traduction prévu pour ce mois est épuisé.',
			shutdown:
				'Le direct ne peut pas commencer pour l’instant : le service redémarre. Réessayez dans un instant.',
			other: 'Le direct n’a pas pu commencer. Réessayez.'
		},
		denied:
			'Vous n’êtes plus connecté, ou vous n’avez plus le droit de diffuser. Rechargez la page.',
		unreachable:
			'Le service du direct ne répond pas. Vérifiez la connexion de cet appareil, puis réessayez.',
		lost: 'La liaison est perdue et n’a pas pu être rétablie. Vérifiez la connexion de cet appareil, puis recommencez.',
		microphoneErrors: {
			denied:
				'Le micro est refusé à cette page. Autorisez-le dans les réglages du navigateur, puis réessayez.',
			missing: 'Aucun micro n’a été trouvé sur cet appareil.',
			busy: 'Le micro ne répond pas : une autre application l’utilise peut-être.',
			unsupported:
				'Ce navigateur ne permet pas de capter le micro ici. Essayez avec un navigateur récent.'
		}
	},
	de: {
		title: 'Predigt live übertragen',
		intro:
			'Dieses Gerät nimmt die Stimme über sein Mikrofon auf und sendet sie zur Übersetzung. Wer zuhört, wählt die eigene Sprache. Es wird nichts aufgezeichnet.',
		automatic: 'Die Übersetzung stammt von einer Maschine: Sie kann Fehler enthalten.',
		languages: {
			legend: 'Übersetzungssprachen',
			help: 'Jede angekreuzte Sprache wird während der ganzen Übertragung übersetzt. Entfernen Sie das Häkchen bei Sprachen, die niemand braucht.',
			none: 'Kreuzen Sie mindestens eine Sprache an.',
			unavailable:
				'Keine der für die Übertragung gewählten Sprachen ist hier verfügbar. Die verantwortliche Person wählt sie in den Einstellungen.'
		},
		start: 'Übertragung starten',
		stop: 'Übertragung beenden',
		noScript: 'Diese Seite braucht JavaScript, um das Mikrofon aufzunehmen.',
		phase: {
			starting: 'Verbindung wird aufgebaut …',
			live: 'Live',
			resuming: 'Die Verbindung ist unterbrochen. Neuer Versuch läuft …'
		},
		keepOpen:
			'Lassen Sie diese Seite bis zum Schluss offen: Wenn das Gerät in den Ruhezustand geht oder Sie die Seite verlassen, endet die Übertragung.',
		duration: 'Dauer',
		maxDuration: 'Automatisches Ende nach',
		listeners: { title: 'Zuhörende', total: 'Total' },
		microphone: {
			level: 'Lautstärke des Mikrofons',
			silent:
				'Das Mikrofon nimmt keinen Ton auf. Prüfen Sie, ob es eingeschaltet und angeschlossen ist und ob der Ton nicht stummgeschaltet ist.'
		},
		closed: {
			requested: 'Die Übertragung ist beendet.',
			duration: 'Die Übertragung wurde beendet: Die Höchstdauer ist erreicht.',
			silence: 'Die Übertragung wurde beendet: Von diesem Gerät kam kein Ton mehr.',
			ceiling:
				'Die Übertragung wurde beendet: Die für diesen Monat vorgesehene Übersetzungszeit ist aufgebraucht.',
			replaced:
				'Die Übertragung wurde von einem anderen Gerät übernommen. Dieses Gerät sendet nicht mehr.',
			translator:
				'Die Übertragung wurde beendet: Der Übersetzungsdienst antwortet nicht mehr. Sie können neu starten.',
			shutdown:
				'Die Übertragung wurde beendet: Der Dienst startet neu. Sie können gleich wieder starten.',
			other: 'Die Übertragung wurde wegen eines Fehlers beendet. Sie können neu starten.'
		},
		refused: {
			token:
				'Die Übertragung konnte nicht starten: Die Berechtigung wurde nicht angenommen. Laden Sie die Seite neu und versuchen Sie es noch einmal.',
			languages:
				'Die Übertragung konnte nicht starten: Eine der gewählten Sprachen wird nicht angeboten.',
			ceiling:
				'Die Übertragung kann nicht starten: Die für diesen Monat vorgesehene Übersetzungszeit ist aufgebraucht.',
			shutdown:
				'Die Übertragung kann im Moment nicht starten: Der Dienst startet neu. Versuchen Sie es gleich noch einmal.',
			other: 'Die Übertragung konnte nicht starten. Versuchen Sie es noch einmal.'
		},
		denied:
			'Sie sind nicht mehr angemeldet oder dürfen nicht mehr übertragen. Laden Sie die Seite neu.',
		unreachable:
			'Der Live-Dienst antwortet nicht. Prüfen Sie die Verbindung dieses Geräts und versuchen Sie es noch einmal.',
		lost: 'Die Verbindung ist verloren und konnte nicht wiederhergestellt werden. Prüfen Sie die Verbindung dieses Geräts und starten Sie neu.',
		microphoneErrors: {
			denied:
				'Das Mikrofon ist für diese Seite gesperrt. Erlauben Sie es in den Einstellungen des Browsers und versuchen Sie es noch einmal.',
			missing: 'Auf diesem Gerät wurde kein Mikrofon gefunden.',
			busy: 'Das Mikrofon antwortet nicht: Vielleicht wird es von einer anderen App verwendet.',
			unsupported:
				'Dieser Browser kann das Mikrofon hier nicht aufnehmen. Versuchen Sie es mit einem aktuellen Browser.'
		}
	},
	it: {
		title: 'Trasmetti il sermone in diretta',
		intro:
			'Questo dispositivo capta la voce con il suo microfono e la invia per farla tradurre. Chi ascolta sceglie la propria lingua. Nulla viene registrato.',
		automatic: 'La traduzione è fatta da una macchina: può contenere errori.',
		languages: {
			legend: 'Lingue di traduzione',
			help: 'Ogni lingua selezionata viene tradotta per tutta la diretta. Togli quelle che non servono a nessuno.',
			none: 'Seleziona almeno una lingua.',
			unavailable:
				'Nessuna delle lingue scelte per la diretta è disponibile qui. La persona responsabile le sceglie nelle impostazioni.'
		},
		start: 'Inizia la diretta',
		stop: 'Ferma la diretta',
		noScript: 'Questa pagina ha bisogno di JavaScript per captare il microfono.',
		phase: {
			starting: 'Connessione in corso…',
			live: 'In diretta',
			resuming: 'Il collegamento si è interrotto. Nuovo tentativo in corso…'
		},
		keepOpen:
			'Tieni aperta questa pagina fino alla fine: se il dispositivo va in sospensione o se lasci la pagina, la diretta si ferma.',
		duration: 'Durata',
		maxDuration: 'Arresto automatico dopo',
		listeners: { title: 'Persone in ascolto', total: 'Totale' },
		microphone: {
			level: 'Livello del microfono',
			silent:
				'Il microfono non capta alcun suono. Controlla che sia acceso, collegato e che l’audio non sia disattivato.'
		},
		closed: {
			requested: 'La diretta è terminata.',
			duration: 'La diretta si è fermata: è stata raggiunta la durata massima.',
			silence: 'La diretta si è fermata: da questo dispositivo non arrivava più alcun suono.',
			ceiling:
				'La diretta si è fermata: il tempo di traduzione previsto per questo mese è esaurito.',
			replaced: 'La diretta è stata ripresa da un altro dispositivo. Questo non trasmette più.',
			translator:
				'La diretta si è fermata: il servizio di traduzione non risponde più. Puoi ricominciare.',
			shutdown:
				'La diretta si è fermata: il servizio si sta riavviando. Puoi ricominciare tra un istante.',
			other: 'La diretta si è fermata per un errore. Puoi ricominciare.'
		},
		refused: {
			token:
				'La diretta non è potuta iniziare: l’autorizzazione non è stata accettata. Ricarica la pagina e riprova.',
			languages: 'La diretta non è potuta iniziare: una delle lingue scelte non è disponibile.',
			ceiling:
				'La diretta non può iniziare: il tempo di traduzione previsto per questo mese è esaurito.',
			shutdown:
				'La diretta non può iniziare per ora: il servizio si sta riavviando. Riprova tra un istante.',
			other: 'La diretta non è potuta iniziare. Riprova.'
		},
		denied:
			'Non sei più connesso, oppure non hai più il diritto di trasmettere. Ricarica la pagina.',
		unreachable:
			'Il servizio della diretta non risponde. Controlla la connessione di questo dispositivo e riprova.',
		lost: 'Il collegamento è andato perso e non è stato possibile ristabilirlo. Controlla la connessione di questo dispositivo e ricomincia.',
		microphoneErrors: {
			denied:
				'Il microfono è negato a questa pagina. Autorizzalo nelle impostazioni del browser e riprova.',
			missing: 'Su questo dispositivo non è stato trovato alcun microfono.',
			busy: 'Il microfono non risponde: forse lo sta usando un’altra applicazione.',
			unsupported:
				'Questo browser non permette di captare il microfono qui. Prova con un browser recente.'
		}
	},
	en: {
		title: 'Broadcast the sermon live',
		intro:
			'This device picks up the voice through its microphone and sends it to be translated. Listeners choose their own language. Nothing is recorded.',
		automatic: 'The translation is made by a machine: it may contain mistakes.',
		languages: {
			legend: 'Translation languages',
			help: 'Each ticked language is translated for the whole broadcast. Remove the tick from those nobody needs.',
			none: 'Tick at least one language.',
			unavailable:
				'None of the languages chosen for the broadcast is available here. The person in charge chooses them in the settings.'
		},
		start: 'Start the broadcast',
		stop: 'Stop the broadcast',
		noScript: 'This screen needs JavaScript to capture the microphone.',
		phase: {
			starting: 'Connecting…',
			live: 'Live',
			resuming: 'The connection dropped. Trying again…'
		},
		keepOpen:
			'Keep this screen open until the end: if the device goes to sleep, or you leave this page, the broadcast stops.',
		duration: 'Duration',
		maxDuration: 'Stops automatically after',
		listeners: { title: 'People listening', total: 'Total' },
		microphone: {
			level: 'Microphone level',
			silent:
				'The microphone is picking up no sound. Check that it is switched on, plugged in and not muted.'
		},
		closed: {
			requested: 'The broadcast has ended.',
			duration: 'The broadcast stopped: the maximum duration was reached.',
			silence: 'The broadcast stopped: no more sound was coming from this device.',
			ceiling: 'The broadcast stopped: the translation time planned for this month is used up.',
			replaced:
				'The broadcast was taken over from another device. This one is no longer broadcasting.',
			translator:
				'The broadcast stopped: the translation service no longer answers. You can start again.',
			shutdown:
				'The broadcast stopped: the service is restarting. You can start again in a moment.',
			other: 'The broadcast stopped because of an error. You can start again.'
		},
		refused: {
			token:
				'The broadcast could not start: the authorisation was not accepted. Reload the page and try again.',
			languages: 'The broadcast could not start: one of the chosen languages is not offered.',
			ceiling:
				'The broadcast cannot start: the translation time planned for this month is used up.',
			shutdown:
				'The broadcast cannot start for now: the service is restarting. Try again in a moment.',
			other: 'The broadcast could not start. Try again.'
		},
		denied:
			'You are no longer signed in, or you are no longer allowed to broadcast. Reload the page.',
		unreachable:
			'The live service does not answer. Check this device’s connection, then try again.',
		lost: 'The connection was lost and could not be restored. Check this device’s connection, then start again.',
		microphoneErrors: {
			denied:
				'The microphone is blocked for this page. Allow it in the browser settings, then try again.',
			missing: 'No microphone was found on this device.',
			busy: 'The microphone does not answer: another application may be using it.',
			unsupported: 'This browser cannot capture the microphone here. Try a recent browser.'
		}
	},
	ar: {
		title: 'البث المباشر للخطبة',
		intro: 'يلتقط هذا الجهاز الصوت بميكروفونه ويرسله ليُترجَم. يختار كل مستمع لغته. لا يُسجَّل أي شيء.',
		automatic: 'الترجمة آلية وقد تحتوي على أخطاء.',
		languages: {
			legend: 'لغات الترجمة',
			help: 'تُترجَم كل لغة محددة طوال البث. ألغِ تحديد اللغات التي لا يحتاج إليها أحد.',
			none: 'حدّد لغة واحدة على الأقل.',
			unavailable:
				'لا تتوفر هنا أي لغة من اللغات المختارة للبث. يختارها الشخص المسؤول في الإعدادات.'
		},
		start: 'بدء البث',
		stop: 'إيقاف البث',
		noScript: 'تحتاج هذه الصفحة إلى JavaScript لالتقاط صوت الميكروفون.',
		phase: {
			starting: 'جارٍ الاتصال…',
			live: 'بث مباشر',
			resuming: 'انقطع الاتصال. جارٍ المحاولة من جديد…'
		},
		keepOpen:
			'أبقِ هذه الصفحة مفتوحة حتى النهاية: إذا دخل الجهاز في وضع السكون أو غادرت الصفحة، يتوقف البث.',
		duration: 'المدة',
		maxDuration: 'يتوقف تلقائيًا بعد',
		listeners: { title: 'المستمعون', total: 'المجموع' },
		microphone: {
			level: 'مستوى الميكروفون',
			silent: 'الميكروفون لا يلتقط أي صوت. تحقق من أنه مشغّل وموصول وأن الصوت غير مكتوم.'
		},
		closed: {
			requested: 'انتهى البث.',
			duration: 'توقف البث: بلغ المدة القصوى.',
			silence: 'توقف البث: لم يعد يصل أي صوت من هذا الجهاز.',
			ceiling: 'توقف البث: انتهى وقت الترجمة المخصص لهذا الشهر.',
			replaced: 'انتقل البث إلى جهاز آخر. هذا الجهاز لم يعد يبث.',
			translator: 'توقف البث: خدمة الترجمة لم تعد تستجيب. يمكنك البدء من جديد.',
			shutdown: 'توقف البث: الخدمة يُعاد تشغيلها. يمكنك البدء من جديد بعد لحظات.',
			other: 'توقف البث بسبب خطأ. يمكنك البدء من جديد.'
		},
		refused: {
			token: 'تعذّر بدء البث: لم يُقبل الإذن. أعد تحميل الصفحة وحاول من جديد.',
			languages: 'تعذّر بدء البث: إحدى اللغات المختارة غير متاحة.',
			ceiling: 'لا يمكن بدء البث: انتهى وقت الترجمة المخصص لهذا الشهر.',
			shutdown: 'لا يمكن بدء البث الآن: الخدمة يُعاد تشغيلها. حاول من جديد بعد لحظات.',
			other: 'تعذّر بدء البث. حاول من جديد.'
		},
		denied: 'لم تعد مسجّل الدخول، أو لم يعد لك حق البث. أعد تحميل الصفحة.',
		unreachable: 'لم تستجب خدمة البث. تحقق من اتصال هذا الجهاز ثم حاول من جديد.',
		lost: 'انقطع الاتصال وتعذّرت استعادته. تحقق من اتصال هذا الجهاز ثم ابدأ من جديد.',
		microphoneErrors: {
			denied: 'الميكروفون محظور على هذه الصفحة. اسمح به من إعدادات المتصفح ثم حاول من جديد.',
			missing: 'لم يُعثر على أي ميكروفون في هذا الجهاز.',
			busy: 'الميكروفون لا يستجيب: ربما يستخدمه تطبيق آخر.',
			unsupported: 'هذا المتصفح لا يسمح بالتقاط صوت الميكروفون هنا. جرّب متصفحًا حديثًا.'
		}
	}
};

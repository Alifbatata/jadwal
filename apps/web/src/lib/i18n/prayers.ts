// Les textes de l'écran des heures de prière (`/prieres`), dans les cinq langues de l'espace (étape
// 18, retours C1, C2, B1, D2 et A3).
//
// L'écran commence par une seule question, « D'où viennent vos heures de prière ? », et chaque
// réponse n'affiche que ce qu'elle demande. Les noms des prières viennent de `public/affichage.ts`,
// les dates de `numericDate` et `longDate` : ici, seulement les phrases de cet écran.
//
// Une phrase qui nomme un lieu ou un fichier s'arrête avant lui : la page le met ensuite dans un
// `<bdi>`, pour qu'il garde son sens au milieu d'une phrase arabe.

import type { CalculationMethodName } from '@jadwal/core/prayer';
import { plural, type PluralForms, type Translations } from './space.js';

/** Les formes selon le nombre, une fonction par langue : le code de la langue reste hors des textes. */
const francais = (count: number, forms: PluralForms) => plural('fr', count, forms);
const deutsch = (count: number, forms: PluralForms) => plural('de', count, forms);
const italiano = (count: number, forms: PluralForms) => plural('it', count, forms);
const english = (count: number, forms: PluralForms) => plural('en', count, forms);
const arabic = (count: number, forms: PluralForms) => plural('ar', count, forms);

type Answer = 'computed' | 'import' | 'manual';

interface PrayersTexts {
	readonly title: string;
	readonly intro: string;
	/** Ce qui vient d'être fait, au retour d'un formulaire. */
	readonly done: {
		readonly settingsSaved: (days: number) => string;
		readonly imported: (days: number, first: string, last: string) => string;
		readonly removed: (days: number) => string;
		readonly periodSaved: string;
		readonly periodCopied: string;
		readonly periodDeleted: string;
	};
	/** D'où viennent les heures aujourd'hui, en une ou deux phrases. */
	readonly status: {
		readonly title: string;
		readonly importUntil: (date: string) => string;
		readonly thenComputed: string;
		readonly thenNothing: string;
		readonly importEnding: (days: number) => string;
		/** Suivie du nom de la localité. */
		readonly computedFor: string;
		readonly computedForPosition: string;
		readonly nothing: string;
		readonly manualPeriods: (count: number) => string;
	};
	readonly question: {
		readonly legend: string;
		readonly answers: { readonly [A in Answer]: { readonly label: string; readonly hint: string } };
		/** L'ordre de priorité entre les trois sources, en une phrase. */
		readonly priority: string;
		/** Le bouton qui montre la réponse choisie, sans JavaScript. */
		readonly continue: string;
	};
	readonly computed: {
		readonly title: string;
		readonly localityLegend: string;
		/** Suivie du nom de la localité enregistrée. */
		readonly saved: string;
		readonly searchLabel: string;
		readonly searchHint: string;
		/** En arabe seulement : la liste n'a pas de noms arabes. Ailleurs, rien. */
		readonly latinLetters: string | null;
		readonly searchButton: string;
		readonly resultsLegend: string;
		readonly found: (count: number) => string;
		/** Une liste pleine : la recherche en a peut-être trouvé davantage, elle montre les meilleures. */
		readonly foundBest: (count: number) => string;
		readonly noneFound: string;
		readonly tooShort: string;
		/** Suivie du nom de la localité choisie. */
		readonly chosen: string;
		readonly position: (latitude: string, longitude: string) => string;
		/**
		 * La mention de la source, que les conditions de swisstopo exigent, en deux morceaux : la page
		 * met entre eux le nom de la source dans un `<bdi>`, pour que « ©swisstopo » garde son signe à
		 * sa place au milieu d'une phrase arabe.
		 */
		readonly creditBefore: string;
		readonly creditAfter: (version: string) => string;
		readonly abroadSummary: string;
		readonly abroadHint: string;
		readonly latitude: string;
		readonly longitude: string;
		readonly abroadExample: string;
		readonly advancedSummary: string;
		readonly advancedHint: string;
		readonly methodLabel: string;
		readonly methodHint: string;
		readonly methods: { readonly [M in CalculationMethodName]: string };
		readonly madhabLabel: string;
		readonly madhabHint: string;
		readonly madhabs: { readonly shafi: string; readonly hanafi: string };
		readonly ruleLabel: string;
		readonly ruleHint: string;
		readonly rules: {
			readonly middleofthenight: string;
			readonly seventhofthenight: string;
			readonly twilightangle: string;
		};
		readonly ruleUsual: (rule: string) => string;
		readonly adjustmentsLegend: string;
		readonly adjustmentsHint: string;
		readonly previewButton: string;
		readonly previewTitle: string;
		readonly previewUnsaved: string;
		readonly previewSaved: string;
		readonly previewEmpty: string;
		readonly nextDay: string;
		readonly nextDayTitle: string;
		readonly save: string;
	};
	/** Les tableaux de jours : l'en-tête, la provenance d'une heure, l'iqama, le vendredi. */
	readonly table: {
		readonly day: string;
		readonly sources: {
			readonly manual: string;
			readonly import: string;
			readonly computed: string;
		};
		readonly iqama: (time: string) => string;
		readonly jumua: (times: string) => string;
	};
	readonly file: {
		readonly title: string;
		readonly intro: (size: string) => string;
		readonly exampleTitle: string;
		readonly formatSummary: string;
		readonly formatColumns: string;
		readonly columnDate: string;
		/** « Date : », devant les noms qu'une colonne peut porter. */
		readonly columnNames: (column: string) => string;
		readonly formatDates: string;
		readonly formatTimes: string;
		readonly formatLocal: string;
		readonly formatEncoding: string;
		readonly template: string;
		readonly templateHint: string;
		readonly fileLabel: string;
		readonly fileHint: string;
		readonly orderLabel: string;
		readonly orderHint: string;
		readonly orders: {
			readonly auto: string;
			readonly dayMonth: string;
			readonly monthDay: string;
		};
		readonly yearLabel: string;
		readonly monthLabel: string;
		readonly yearMonthHint: string;
		readonly read: string;
		/** Suivie du nom du fichier. */
		readonly readTitle: string;
		readonly encoding: (encoding: string, separator: string) => string;
		readonly tab: string;
		/** Les unités de la taille acceptée, qu'adapter-node écrit « 512K ». */
		readonly units: { readonly K: string; readonly M: string; readonly G: string };
		readonly days: (count: number, first: string, last: string) => string;
		readonly daysNone: string;
		readonly missing: (count: number, list: string) => string;
		/** Entre deux dates d'une liste. */
		readonly listSeparator: string;
		readonly refused: (count: number) => string;
		readonly ambiguous: string;
		readonly refusedTitle: string;
		readonly line: (number: number, reason: string) => string;
		readonly more: (count: number) => string;
		readonly checkTitle: string;
		readonly checkHint: string;
		readonly previewFromToday: string;
		readonly previewFirst: string;
		readonly nothingSaved: string;
		readonly saveDays: (count: number) => string;
		readonly removeTitle: string;
		readonly removeHint: string;
		readonly removeFrom: string;
		readonly removeTo: string;
		readonly removeButton: string;
	};
	/** Ce que le lecteur de fichiers dit d'une ligne (voir `lireRaison`). */
	readonly reasons: {
		readonly empty: string;
		readonly header: string;
		readonly badDate: (raw: string) => string;
		readonly badTime: (prayer: string, raw: string) => string;
		readonly noSuchDate: string;
		readonly order: (
			later: string,
			laterTime: string,
			earlier: string,
			earlierTime: string
		) => string;
		readonly ishaBeforeMaghrib: (
			isha: string,
			ishaTime: string,
			maghrib: string,
			maghribTime: string
		) => string;
		readonly duplicate: (date: string) => string;
		readonly jump: (
			date: string,
			prayer: string,
			minutes: number,
			before: string,
			after: string
		) => string;
	};
	readonly periods: {
		readonly manualTitle: string;
		readonly manualIntro: string;
		readonly iqamaTitle: string;
		readonly iqamaIntro: string;
		readonly noOverlap: string;
		/** « Le vendredi, ce sont vos [sessions du vendredi] qui remplacent le Dhuhr. » */
		readonly fridayBefore: string;
		readonly fridayLink: string;
		readonly fridayAfter: string;
		readonly ramadanTitle: string;
		readonly ramadanText: string;
		readonly dates: (from: string, to: string) => string;
		readonly datesOpen: (from: string) => string;
		readonly toReview: string;
		readonly toReviewTitle: string;
		readonly toReviewText: string;
		readonly colPrayer: string;
		readonly colShown: string;
		readonly colIqama: string;
		readonly iqamaAfter: (minutes: number) => string;
		readonly modify: string;
		readonly copy: string;
		/** Le nom d'une période copiée pour l'année suivante, d'après le nom de l'originale. */
		readonly copyName: (name: string) => string;
		readonly delete: string;
		readonly add: string;
		readonly prefilled: (name: string) => string;
		readonly nameLabel: string;
		readonly nameHint: string;
		readonly namePlaceholder: string;
		readonly fromLabel: string;
		readonly toLabel: string;
		readonly toHint: string;
		readonly shownTitle: string;
		readonly shownHint: string;
		readonly shownFold: string;
		readonly shownFoldHint: string;
		readonly iqamaLegend: string;
		readonly iqamaHint: string;
		readonly iqamaAt: string;
		readonly iqamaOffset: string;
		readonly iqamaOffsetLabel: (prayer: string) => string;
		readonly preview: string;
		readonly previewTitle: string;
		/** Une période qui commence après les sept prochains jours : l'aperçu montre ses sept premiers. */
		readonly previewTitleLater: string;
		readonly previewLater: (firstDay: string) => string;
		readonly previewLaterEmpty: string;
		readonly previewHint: string;
		readonly save: string;
	};
	/**
	 * Ce que voit le public : les trois sources résolues, sur sept jours. Le tableau qui défile a son
	 * propre nom : celui du titre nomme déjà la section qui l'entoure.
	 */
	readonly served: {
		readonly title: string;
		readonly intro: string;
		readonly tableLabel: string;
		readonly empty: string;
	};
	readonly errors: {
		readonly positionMissing: string;
		readonly positionUnreadable: string;
		readonly positionHalf: string;
		readonly positionOffEarth: string;
		readonly localityUnknown: string;
		readonly fileTooLarge: (size: string) => string;
		readonly fileMissing: string;
		readonly fileEmpty: string;
		readonly nothingToSave: string;
		readonly periodName: string;
		readonly periodStart: string;
		readonly periodEndUnreadable: string;
		readonly periodEndBeforeStart: string;
		readonly iqamaBoth: (prayer: string) => string;
		readonly periodOverlap: string;
		readonly periodGone: string;
		readonly leapDay: string;
		readonly copyOverlap: string;
		readonly removeDates: string;
	};
}

export const prayersTexts: Translations<PrayersTexts> = {
	fr: {
		title: 'Heures de prière',
		intro:
			'Les heures de prière donnent l’heure des cours qui suivent une prière, par exemple « 15 min après Maghrib ». Réglez-les une fois : le service les tient à jour chaque jour.',
		done: {
			settingsSaved: (days) =>
				`Réglages enregistrés. ${francais(days, { one: `${days} jour recalculé`, other: `${days} jours recalculés` })}.`,
			imported: (days, first, last) =>
				`${francais(days, { one: `${days} jour importé`, other: `${days} jours importés` })}, du ${first} au ${last}.`,
			removed: (days) =>
				`${francais(days, { one: `${days} jour retiré`, other: `${days} jours retirés` })} de l’import. Si une localité est choisie, le calcul remplit de nouveau ces jours cette nuit, ou tout de suite quand vous enregistrez le calcul.`,
			periodSaved: 'Période enregistrée.',
			periodCopied:
				'Période copiée aux mêmes dates, un an plus tard. Vérifiez ses dates, puis enregistrez-la.',
			periodDeleted: 'Période supprimée.'
		},
		status: {
			title: 'Vos heures aujourd’hui',
			importUntil: (date) => `Votre fichier importé donne les heures jusqu’au ${date}.`,
			thenComputed: 'Ensuite, le calcul les donne.',
			thenNothing:
				'Ensuite, il n’y a plus d’heure : importez la suite, ou choisissez une localité pour que le calcul prenne le relais.',
			importEnding: (days) =>
				`${francais(days, { one: `Il reste ${days} jour`, other: `Il reste ${days} jours` })} dans votre fichier. Importez la suite, ou laissez le calcul prendre le relais.`,
			computedFor: 'Vos heures sont calculées pour cette localité :',
			computedForPosition: 'Vos heures sont calculées pour la position que vous avez donnée.',
			nothing:
				'Aucune heure de prière n’est réglée. Les cours qui suivent une prière s’affichent sans heure, par exemple « Après Maghrib ». Répondez à la question ci-dessous.',
			manualPeriods: (count) =>
				francais(count, {
					one: `Vous avez saisi ${count} période à la main : les jours qu’elle couvre, ses heures passent avant celles du fichier et du calcul.`,
					other: `Vous avez saisi ${count} périodes à la main : les jours qu’elles couvrent, leurs heures passent avant celles du fichier et du calcul.`
				})
		},
		question: {
			legend: 'D’où viennent vos heures de prière ?',
			answers: {
				computed: {
					label: 'Calculées pour votre localité',
					hint: 'Le service calcule les heures de chaque jour d’après la position de votre localité. C’est le plus simple.'
				},
				import: {
					label: 'Importées depuis un fichier',
					hint: 'Vous avez le calendrier de votre mosquée ou de votre fédération dans un fichier, une ligne par jour.'
				},
				manual: {
					label: 'Saisies à la main',
					hint: 'Vous recopiez les heures de votre panneau, pour quelques semaines ou pour toute l’année.'
				}
			},
			priority:
				'Si plusieurs sources donnent une heure pour le même jour, la saisie à la main passe avant le fichier, et le fichier avant le calcul.',
			continue: 'Continuer'
		},
		computed: {
			title: 'Calculées pour votre localité',
			localityLegend: 'Votre localité',
			saved: 'Localité enregistrée :',
			searchLabel: 'Nom ou NPA de la localité',
			searchHint:
				'Par exemple Bienne, Lugano ou 2502. La liste officielle des localités suisses est dans le service : aucun autre site n’est interrogé.',
			latinLetters: null,
			searchButton: 'Chercher',
			resultsLegend: 'Choisissez votre localité',
			found: (count) =>
				francais(count, {
					one: `${count} localité trouvée.`,
					other: `${count} localités trouvées.`
				}),
			foundBest: (count) =>
				`Voici les ${count} localités qui correspondent le mieux. Si la vôtre n’y est pas, précisez le nom ou tapez le NPA.`,
			noneFound: 'Aucune localité ne correspond. Vérifiez l’orthographe, ou tapez le NPA.',
			tooShort: 'Tapez au moins deux lettres ou deux chiffres.',
			chosen: 'Localité choisie :',
			position: (latitude, longitude) =>
				`Sa position : latitude ${latitude}, longitude ${longitude}.`,
			creditBefore: 'Liste officielle des localités : ',
			creditAfter: (version) => `, version du ${version}.`,
			abroadSummary: 'Hors de Suisse',
			abroadHint:
				'Votre organisation n’est pas en Suisse ? Donnez sa position en degrés décimaux. Sur une carte en ligne, un clic droit sur son emplacement affiche ces deux nombres : le premier est la latitude. Une localité choisie dans la liste passe avant ces deux nombres.',
			latitude: 'Latitude',
			longitude: 'Longitude',
			abroadExample: 'Exemple : latitude 48.8566 et longitude 2.3522 pour Paris.',
			advancedSummary: 'Méthode de calcul, école et ajustements (facultatif)',
			advancedHint:
				'Les réglages proposés conviennent à la plupart des organisations. Ne les changez que si l’aperçu diffère des heures que vous annoncez déjà.',
			methodLabel: 'Méthode de calcul',
			methodHint:
				'Elle fixe l’heure du Fajr et de l’Isha. En cas de doute, gardez « Ligue islamique mondiale » : c’est la méthode la plus répandue en Europe. « Autre » ne fixe aucun angle : le Fajr tomberait presque au lever du soleil et l’Isha presque au coucher.',
			methods: {
				MuslimWorldLeague: 'Ligue islamique mondiale',
				Egyptian: 'Autorité générale égyptienne d’arpentage',
				Karachi: 'Université des sciences islamiques de Karachi',
				UmmAlQura: 'Université Umm al-Qura, La Mecque',
				Dubai: 'Émirats arabes unis (Dubaï)',
				MoonsightingCommittee: 'Comité d’observation de la lune (Moonsighting Committee)',
				NorthAmerica: 'Amérique du Nord (ISNA)',
				Kuwait: 'Koweït',
				Qatar: 'Qatar',
				Singapore: 'Singapour, Malaisie, Indonésie',
				Tehran: 'Institut de géophysique de l’université de Téhéran',
				Turkey: 'Turquie (Diyanet)',
				Other: 'Autre (aucun angle réglé, à éviter)'
			},
			madhabLabel: 'École pour l’heure de l’Asr',
			madhabHint: 'Seule l’heure de l’Asr change : elle vient plus tard avec Hanafi.',
			madhabs: {
				shafi: 'Shafi’i, Maliki, Hanbali (ombre simple)',
				hanafi: 'Hanafi (ombre double)'
			},
			ruleLabel: 'Règle pour les nuits courtes de l’été',
			ruleHint:
				'En juin, la nuit est si courte que l’Isha tombe tard et le Fajr très tôt. Le milieu de la nuit garde les heures astronomiques ; le dernier septième avance l’Isha et retarde le Fajr, pour des heures plus faciles à tenir. « Proportionnelle à l’angle » donne des heures entre les deux, selon l’angle de la méthode choisie.',
			rules: {
				middleofthenight: 'Milieu de la nuit',
				seventhofthenight: 'Dernier septième de la nuit',
				twilightangle: 'Proportionnelle à l’angle'
			},
			ruleUsual: (rule) => `Pour votre position, la règle habituelle est « ${rule} ».`,
			adjustmentsLegend: 'Ajustement par prière, en minutes',
			adjustmentsHint:
				'Pour aligner le calcul sur les heures que votre organisation affiche déjà. Exemple : 2 retarde la prière de deux minutes, -2 l’avance de deux minutes.',
			previewButton: 'Voir l’aperçu',
			previewTitle: 'Aperçu des sept prochains jours',
			previewUnsaved:
				'Calculé avec ce que vous venez de choisir, sans rien enregistrer. Comparez avec le panneau de votre organisation, puis enregistrez.',
			previewSaved: 'Calculé avec les réglages enregistrés.',
			previewEmpty:
				'Une fois la localité choisie, touchez « Voir l’aperçu » : les heures des sept prochains jours s’affichent ici avant d’être enregistrées.',
			nextDay: 'le lendemain',
			nextDayTitle: 'Cette heure tombe après minuit, le jour suivant',
			save: 'Enregistrer'
		},
		table: {
			day: 'Jour',
			sources: { manual: 'saisie', import: 'importée', computed: 'calculée' },
			iqama: (time) => `iqama ${time}`,
			jumua: (times) => `Jumu’a ${times}`
		},
		file: {
			title: 'Importées depuis un fichier',
			intro: (size) =>
				`Un fichier CSV, une ligne par jour : une colonne pour la date, et une pour chacune des cinq prières. Un tableur comme Excel ou LibreOffice l’enregistre avec « Enregistrer sous », au format CSV. Taille acceptée : ${size}.`,
			exampleTitle: 'Exemple',
			formatSummary: 'Le format en détail',
			formatColumns:
				'L’ordre des colonnes n’a pas d’importance : c’est le nom en tête de chaque colonne qui compte, sans tenir compte des majuscules ni des accents. Noms acceptés :',
			columnDate: 'Date',
			columnNames: (column) => `${column} :`,
			formatDates:
				'Dates : 21.09.2026, 21/09/2026 ou 21-9-2026. Une date écrite l’année en premier est acceptée aussi.',
			formatTimes:
				'Heures : 19:23, 9:23, 19:23:00, 19h23 ou 7:23 PM. Des secondes autres que 00 sont refusées : elles signalent presque toujours une colonne décalée.',
			formatLocal:
				'Les heures sont celles de votre fuseau : ne convertissez rien, et ne vous occupez pas du changement d’heure. Une Isha après minuit s’écrit 00:41 sur la ligne du jour de la prière, pas sur celle du lendemain.',
			formatEncoding:
				'Les fichiers enregistrés par Excel, LibreOffice ou Numbers passent tels quels, avec leurs guillemets, leurs fins de ligne et leur encodage. L’encodage reconnu est affiché après la lecture.',
			template: 'Télécharger un modèle des soixante prochains jours',
			templateHint:
				'Il est déjà rempli avec les heures calculées pour votre localité, si vous en avez choisi une. Corrigez dans un tableur ce qui diffère de votre panneau, puis envoyez-le ici.',
			fileLabel: 'Votre fichier',
			fileHint: 'Un fichier au format CSV, par exemple horaires-2027.csv.',
			orderLabel: 'Si les dates sont écrites en chiffres seuls',
			orderHint:
				'Dans 03/04/2027, le 3 peut désigner le jour ou le mois. Laissez « Deviner » : nous vous demanderons de choisir si le fichier ne permet pas de trancher.',
			orders: {
				auto: 'Deviner (recommandé)',
				dayMonth: 'Le jour, puis le mois (21/09/2026)',
				monthDay: 'Le mois, puis le jour (09/21/2026)'
			},
			yearLabel: 'Année du fichier',
			monthLabel: 'Mois du fichier',
			yearMonthHint:
				'Seulement pour le fichier d’un seul mois dont la colonne des dates ne donne que le jour (1, 2, 3…). Exemple : 2026 et 9 pour septembre 2026.',
			read: 'Lire le fichier',
			readTitle: 'Ce que nous avons lu dans ce fichier :',
			encoding: (encoding, separator) => `Encodage : ${encoding}. Séparateur : « ${separator} ».`,
			tab: 'tabulation',
			units: { K: 'Ko', M: 'Mo', G: 'Go' },
			days: (count, first, last) =>
				`${francais(count, { one: `${count} jour`, other: `${count} jours` })}, du ${first} au ${last}.`,
			daysNone: 'Aucun jour lisible.',
			missing: (count, list) =>
				`${francais(count, { one: `${count} jour manque`, other: `${count} jours manquent` })} dans cet intervalle : ${list}`,
			listSeparator: ', ',
			refused: (count) =>
				francais(count, { one: `${count} ligne refusée.`, other: `${count} lignes refusées.` }),
			ambiguous:
				'Les dates de ce fichier se lisent de deux façons, jour puis mois ou mois puis jour, et les deux donnent un calendrier valable. Nous ne devinons pas : choisissez l’ordre plus haut, puis lisez le fichier de nouveau.',
			refusedTitle: 'Lignes refusées',
			line: (number, reason) => `Ligne ${number} : ${reason}`,
			more: (count) => `… et ${count} autres.`,
			checkTitle: 'À vérifier',
			checkHint: 'Ces jours seront importés tels quels : un écart peut être une correction voulue.',
			previewFromToday: 'Aperçu : les sept prochains jours du fichier',
			previewFirst: 'Aperçu : les sept premiers jours du fichier',
			nothingSaved:
				'Rien n’est encore enregistré. Enregistrer remplace les jours couverts par ce fichier, et ne touche à aucun autre.',
			saveDays: (count) =>
				francais(count, { one: 'Enregistrer ce jour', other: `Enregistrer ces ${count} jours` }),
			removeTitle: 'Retirer des jours importés',
			removeHint:
				'Les jours retirés repassent au calcul, si une localité est choisie. Le journal des modifications en garde la trace.',
			removeFrom: 'Premier jour à retirer',
			removeTo: 'Dernier jour à retirer',
			removeButton: 'Retirer ces jours'
		},
		reasons: {
			empty: 'Le fichier est vide.',
			header: 'La première ligne doit nommer les colonnes : date, fajr, dhuhr, asr, maghrib, isha.',
			badDate: (raw) => `Date illisible : « ${raw} ».`,
			badTime: (prayer, raw) => `Heure illisible pour ${prayer} : « ${raw} ».`,
			noSuchDate: 'Cette date n’existe pas dans le calendrier.',
			order: (later, laterTime, earlier, earlierTime) =>
				`${later} (${laterTime}) ne peut pas venir avant ${earlier} (${earlierTime}).`,
			ishaBeforeMaghrib: (isha, ishaTime, maghrib, maghribTime) =>
				`${isha} (${ishaTime}) tombe avant ${maghrib} (${maghribTime}) sans passer minuit.`,
			duplicate: (date) => `La date ${date} apparaît deux fois.`,
			jump: (date, prayer, minutes, before, after) =>
				`${date} : ${prayer} saute de ${minutes} minutes par rapport à la veille (${before} puis ${after}).`
		},
		periods: {
			manualTitle: 'Saisies à la main',
			manualIntro:
				'Une période, c’est ce que vous affichez sur votre panneau pendant quelques semaines ou toute l’année : un nom, des dates, et pour chaque prière l’heure affichée et l’heure de l’iqama. Une case vide laisse le fichier ou le calcul donner l’heure.',
			iqamaTitle: 'L’iqama (facultatif)',
			iqamaIntro:
				'L’iqama est l’heure où la prière est appelée dans la salle. Si vous en avez une, réglez-la ici : un cours « après Maghrib » suivra l’iqama. Si vos iqamas restent les mêmes toute l’année, une seule période sans dernier jour convient.',
			noOverlap:
				'Deux périodes ne peuvent pas se chevaucher : fermez celle qui précède avant d’en ouvrir une autre.',
			fridayBefore: 'Le vendredi, ce sont vos ',
			fridayLink: 'sessions du vendredi',
			fridayAfter: ' qui remplacent le Dhuhr.',
			ramadanTitle: 'Ramadan :',
			ramadanText:
				'une période de Ramadan avance d’environ onze jours chaque année. « Copier pour l’année suivante » garde vos dates telles quelles : c’est à vous de les changer.',
			dates: (from, to) => `Du ${from} au ${to}`,
			datesOpen: (from) => `À partir du ${from}, jusqu’à nouvel ordre`,
			toReview: 'dates à vérifier',
			toReviewTitle: 'Dates reportées d’un an par la copie',
			toReviewText:
				'Ces dates viennent d’une copie : les mêmes jours, un an plus tard, parce que les heures de prière suivent le soleil et non le calendrier hégirien. Vérifiez-les, corrigez-les si besoin, puis enregistrez : la mention disparaîtra.',
			colPrayer: 'Prière',
			colShown: 'Heure affichée',
			colIqama: 'Iqama',
			iqamaAfter: (minutes) => `${minutes} min après`,
			modify: 'Modifier cette période',
			copy: 'Copier pour l’année suivante',
			copyName: (name) => `${name} (année suivante)`,
			delete: 'Supprimer',
			add: 'Ajouter une période',
			prefilled: (name) =>
				`Les valeurs de « ${name} » sont déjà remplies : ne changez que ce qui change.`,
			nameLabel: 'Nom de la période',
			nameHint: 'Exemple : Hiver 2027, ou Ramadan 2027.',
			namePlaceholder: 'Hiver 2027',
			fromLabel: 'Premier jour',
			toLabel: 'Dernier jour',
			toHint: 'Laissez vide pour « jusqu’à nouvel ordre ».',
			shownTitle: 'Heures affichées',
			shownHint:
				'Les heures de votre panneau. Une case vide laisse le fichier ou le calcul donner l’heure de cette prière.',
			shownFold: 'Remplacer aussi les heures affichées',
			shownFoldHint:
				'Seulement si les heures de votre panneau diffèrent de celles du fichier ou du calcul. Une case vide laisse le fichier ou le calcul décider, prière par prière.',
			iqamaLegend: 'Iqama',
			iqamaHint:
				'Pour chaque prière, une heure fixe ou un nombre de minutes après l’heure affichée, jamais les deux. Des minutes suivent le soleil toutes seules ; une heure fixe ne bouge pas, même au changement d’heure. Exemple : Maghrib, 10 minutes après.',
			iqamaAt: 'Heure fixe',
			iqamaOffset: 'ou minutes après',
			iqamaOffsetLabel: (prayer) => `Iqama : ${prayer}, minutes après l’heure affichée`,
			preview: 'Voir l’aperçu',
			previewTitle: 'Aperçu des sept prochains jours avec cette période',
			previewTitleLater: 'Aperçu des sept premiers jours de cette période',
			previewLater: (firstDay) =>
				`Cette période commence le ${firstDay} : l’aperçu montre ses sept premiers jours, et non les sept prochains.`,
			previewLaterEmpty: 'Aucune heure pour ces sept jours.',
			previewHint: 'Rien n’est encore enregistré.',
			save: 'Enregistrer cette période'
		},
		served: {
			title: 'Ce que voit le public les sept prochains jours',
			intro:
				'Sous chaque heure, d’où elle vient, et l’iqama si vous en avez réglé une : c’est elle qui donne l’heure d’un cours « après Maghrib ».',
			tableLabel: 'Tableau des heures que voit le public',
			empty: 'Aucune heure pour les sept prochains jours.'
		},
		errors: {
			positionMissing:
				'Choisissez une localité, ou donnez une latitude et une longitude, pour voir un aperçu.',
			positionUnreadable: 'La position s’écrit en degrés décimaux, par exemple 47.1368.',
			positionHalf: 'Donnez la latitude et la longitude, ou aucune des deux.',
			positionOffEarth:
				'Cette position n’est pas sur Terre : la latitude va de -90 à 90, la longitude de -180 à 180.',
			localityUnknown: 'Cette localité n’est pas dans la liste. Cherchez-la de nouveau.',
			fileTooLarge: (size) =>
				`Ce fichier dépasse la taille acceptée (${size}). Un calendrier d’un an en fait environ vingt fois moins : vérifiez que c’est bien un fichier CSV.`,
			fileMissing: 'Choisissez un fichier.',
			fileEmpty: 'Ce fichier est vide.',
			nothingToSave: 'Il n’y a rien à enregistrer.',
			periodName: 'Donnez un nom à cette période.',
			periodStart: 'Donnez le premier jour de la période.',
			periodEndUnreadable: 'Le dernier jour est illisible.',
			periodEndBeforeStart: 'Le dernier jour vient avant le premier.',
			iqamaBoth: (prayer) =>
				`Pour ${prayer}, choisissez une heure fixe ou des minutes, pas les deux.`,
			periodOverlap:
				'Cette période en chevauche une autre. Fermez d’abord celle qui la précède. Une période sans date de fin couvre tout ce qui vient après elle.',
			periodGone: 'Cette période n’existe plus.',
			leapDay:
				'Cette période ne couvre que le 29 février, et l’année suivante n’en a pas. Choisissez vous-même la date qui la remplace.',
			copyOverlap:
				'La copie chevaucherait une période existante. Une période sans dernier jour couvre tout ce qui vient après elle : fermez-la d’abord.',
			removeDates: 'Donnez le premier et le dernier jour à retirer.'
		}
	},
	de: {
		title: 'Gebetszeiten',
		intro:
			'Die Gebetszeiten bestimmen die Uhrzeit der Kurse, die auf ein Gebet folgen, zum Beispiel «15 Min. nach Maghrib». Stellen Sie sie einmal ein: Der Dienst hält sie jeden Tag aktuell.',
		done: {
			settingsSaved: (days) =>
				`Einstellungen gespeichert. ${deutsch(days, { one: `${days} Tag neu berechnet`, other: `${days} Tage neu berechnet` })}.`,
			imported: (days, first, last) =>
				`${deutsch(days, { one: `${days} Tag importiert`, other: `${days} Tage importiert` })}, vom ${first} bis zum ${last}.`,
			removed: (days) =>
				`${deutsch(days, { one: `${days} Tag`, other: `${days} Tage` })} aus dem Import entfernt. Ist ein Ort gewählt, füllt die Berechnung diese Tage heute Nacht wieder, oder sofort, wenn Sie die Berechnung speichern.`,
			periodSaved: 'Zeitraum gespeichert.',
			periodCopied:
				'Zeitraum mit denselben Daten ein Jahr später kopiert. Prüfen Sie die Daten und speichern Sie ihn dann.',
			periodDeleted: 'Zeitraum gelöscht.'
		},
		status: {
			title: 'Ihre Zeiten heute',
			importUntil: (date) => `Ihre importierte Datei gibt die Zeiten bis zum ${date} an.`,
			thenComputed: 'Danach werden sie berechnet.',
			thenNothing:
				'Nach diesem Datum gibt es keine Zeiten mehr: Importieren Sie die Fortsetzung, oder wählen Sie einen Ort, damit die Berechnung übernimmt.',
			importEnding: (days) =>
				`${deutsch(days, { one: `In Ihrer Datei bleibt noch ${days} Tag`, other: `In Ihrer Datei bleiben noch ${days} Tage` })}. Importieren Sie die Fortsetzung, oder lassen Sie die Berechnung übernehmen.`,
			computedFor: 'Ihre Zeiten werden für diesen Ort berechnet:',
			computedForPosition: 'Ihre Zeiten werden für die Lage berechnet, die Sie angegeben haben.',
			nothing:
				'Es sind keine Gebetszeiten eingestellt. Kurse, die auf ein Gebet folgen, erscheinen ohne Uhrzeit, zum Beispiel «Nach Maghrib». Beantworten Sie die Frage unten.',
			manualPeriods: (count) =>
				deutsch(count, {
					one: `Sie haben ${count} Zeitraum von Hand eingegeben: An den Tagen, die er abdeckt, gehen seine Zeiten der Datei und der Berechnung vor.`,
					other: `Sie haben ${count} Zeiträume von Hand eingegeben: An den Tagen, die sie abdecken, gehen ihre Zeiten der Datei und der Berechnung vor.`
				})
		},
		question: {
			legend: 'Woher kommen Ihre Gebetszeiten?',
			answers: {
				computed: {
					label: 'Berechnet für Ihren Ort',
					hint: 'Der Dienst berechnet die Zeiten jedes Tages anhand der Lage Ihres Ortes. Das ist am einfachsten.'
				},
				import: {
					label: 'Aus einer Datei importiert',
					hint: 'Sie haben den Kalender Ihrer Moschee oder Ihres Verbands in einer Datei, eine Zeile pro Tag.'
				},
				manual: {
					label: 'Von Hand eingegeben',
					hint: 'Sie übertragen die Zeiten von Ihrer Anzeigetafel, für einige Wochen oder für das ganze Jahr.'
				}
			},
			priority:
				'Geben mehrere Quellen für denselben Tag eine Zeit an, geht die Eingabe von Hand der Datei vor, und die Datei der Berechnung.',
			continue: 'Weiter'
		},
		computed: {
			title: 'Berechnet für Ihren Ort',
			localityLegend: 'Ihr Ort',
			saved: 'Gespeicherter Ort:',
			searchLabel: 'Name oder Postleitzahl des Ortes',
			searchHint:
				'Zum Beispiel Biel, Lugano oder 2502. Das amtliche Verzeichnis der Schweizer Ortschaften ist im Dienst enthalten: Keine andere Website wird abgefragt.',
			latinLetters: null,
			searchButton: 'Suchen',
			resultsLegend: 'Wählen Sie Ihren Ort',
			found: (count) =>
				deutsch(count, { one: `${count} Ort gefunden.`, other: `${count} Orte gefunden.` }),
			foundBest: (count) =>
				`Hier sind die ${count} Orte, die am besten passen. Ist Ihrer nicht dabei, ergänzen Sie den Namen oder geben Sie die Postleitzahl ein.`,
			noneFound:
				'Kein Ort passt. Prüfen Sie die Schreibweise, oder geben Sie die Postleitzahl ein.',
			tooShort: 'Geben Sie mindestens zwei Buchstaben oder zwei Ziffern ein.',
			chosen: 'Gewählter Ort:',
			position: (latitude, longitude) =>
				`Seine Lage: Breitengrad ${latitude}, Längengrad ${longitude}.`,
			creditBefore: 'Amtliches Ortschaftenverzeichnis: ',
			creditAfter: (version) => `, Stand ${version}.`,
			abroadSummary: 'Ausserhalb der Schweiz',
			abroadHint:
				'Ist Ihre Organisation nicht in der Schweiz? Geben Sie ihre Lage in Dezimalgrad an. Auf einer Online-Karte zeigt ein Rechtsklick auf den Standort diese zwei Zahlen: Die erste ist der Breitengrad. Ein in der Liste gewählter Ort geht diesen zwei Zahlen vor.',
			latitude: 'Breitengrad',
			longitude: 'Längengrad',
			abroadExample: 'Beispiel: Breitengrad 48.8566 und Längengrad 2.3522 für Paris.',
			advancedSummary: 'Berechnungsmethode, Rechtsschule und Anpassungen (optional)',
			advancedHint:
				'Die vorgeschlagenen Einstellungen passen für die meisten Organisationen. Ändern Sie sie nur, wenn die Vorschau von den Zeiten abweicht, die Sie bereits bekannt geben.',
			methodLabel: 'Berechnungsmethode',
			methodHint:
				'Sie bestimmt die Zeit von Fadschr und Ischa. Behalten Sie im Zweifel «Islamische Weltliga»: Diese Methode ist in Europa am weitesten verbreitet. «Andere» legt keinen Winkel fest: Fadschr fiele dann fast auf den Sonnenaufgang und Ischa fast auf den Sonnenuntergang.',
			methods: {
				MuslimWorldLeague: 'Islamische Weltliga',
				Egyptian: 'Ägyptische Vermessungsbehörde',
				Karachi: 'Universität für islamische Wissenschaften, Karachi',
				UmmAlQura: 'Umm-al-Qura-Universität, Mekka',
				Dubai: 'Vereinigte Arabische Emirate (Dubai)',
				MoonsightingCommittee: 'Komitee für die Mondsichtung (Moonsighting Committee)',
				NorthAmerica: 'Nordamerika (ISNA)',
				Kuwait: 'Kuwait',
				Qatar: 'Katar',
				Singapore: 'Singapur, Malaysia, Indonesien',
				Tehran: 'Institut für Geophysik der Universität Teheran',
				Turkey: 'Türkei (Diyanet)',
				Other: 'Andere (keine Winkel eingestellt, nicht empfohlen)'
			},
			madhabLabel: 'Rechtsschule für die Zeit des Asr',
			madhabHint: 'Nur die Zeit des Asr ändert sich: Mit Hanafi liegt sie später.',
			madhabs: {
				shafi: 'Shafi’i, Maliki, Hanbali (einfacher Schatten)',
				hanafi: 'Hanafi (doppelter Schatten)'
			},
			ruleLabel: 'Regel für die kurzen Sommernächte',
			ruleHint:
				'Im Juni ist die Nacht so kurz, dass Ischa spät und Fadschr sehr früh fällt. Die Nachtmitte behält die astronomischen Zeiten; das letzte Siebtel legt Ischa früher und Fadschr später, damit die Zeiten leichter einzuhalten sind. «Anteilig zum Winkel» ergibt Zeiten zwischen den beiden, je nach dem Winkel der gewählten Methode.',
			rules: {
				middleofthenight: 'Nachtmitte',
				seventhofthenight: 'Letztes Siebtel der Nacht',
				twilightangle: 'Anteilig zum Winkel'
			},
			ruleUsual: (rule) => `Für Ihre Lage ist die übliche Regel «${rule}».`,
			adjustmentsLegend: 'Anpassung pro Gebet, in Minuten',
			adjustmentsHint:
				'Um die Berechnung an die Zeiten anzugleichen, die Ihre Organisation bereits bekannt gibt. Beispiel: 2 verschiebt das Gebet um zwei Minuten nach hinten, -2 um zwei Minuten nach vorne.',
			previewButton: 'Vorschau anzeigen',
			previewTitle: 'Vorschau der nächsten sieben Tage',
			previewUnsaved:
				'Berechnet mit dem, was Sie eben gewählt haben, ohne etwas zu speichern. Vergleichen Sie mit der Anzeigetafel Ihrer Organisation und speichern Sie dann.',
			previewSaved: 'Berechnet mit den gespeicherten Einstellungen.',
			previewEmpty:
				'Sobald der Ort gewählt ist, tippen Sie auf «Vorschau anzeigen»: Die Zeiten der nächsten sieben Tage erscheinen hier, bevor sie gespeichert werden.',
			nextDay: 'am Folgetag',
			nextDayTitle: 'Diese Zeit fällt nach Mitternacht, auf den folgenden Tag',
			save: 'Speichern'
		},
		table: {
			day: 'Tag',
			sources: { manual: 'von Hand', import: 'importiert', computed: 'berechnet' },
			iqama: (time) => `Iqama ${time}`,
			jumua: (times) => `Freitagsgebet ${times}`
		},
		file: {
			title: 'Aus einer Datei importiert',
			intro: (size) =>
				`Eine CSV-Datei mit einer Zeile pro Tag: eine Spalte für das Datum und je eine für die fünf Gebete. Ein Tabellenprogramm wie Excel oder LibreOffice speichert sie mit «Speichern unter», im Format CSV. Erlaubte Grösse: ${size}.`,
			exampleTitle: 'Beispiel',
			formatSummary: 'Das Format im Detail',
			formatColumns:
				'Die Reihenfolge der Spalten spielt keine Rolle: Es zählt der Name oben in jeder Spalte, ohne Rücksicht auf Gross- und Kleinschreibung oder Akzente. Erlaubte Namen:',
			columnDate: 'Datum',
			columnNames: (column) => `${column}:`,
			formatDates:
				'Datumsangaben: 21.09.2026, 21/09/2026 oder 21-9-2026. Ein Datum mit dem Jahr zuerst wird auch angenommen.',
			formatTimes:
				'Uhrzeiten: 19:23, 9:23, 19:23:00, 19h23 oder 7:23 PM. Sekunden ausser 00 werden abgelehnt: Sie weisen fast immer auf eine verschobene Spalte hin.',
			formatLocal:
				'Die Zeiten sind die Ihrer Zeitzone: Rechnen Sie nichts um, und kümmern Sie sich nicht um die Zeitumstellung. Ein Ischa nach Mitternacht steht als 00:41 auf der Zeile des Gebetstages, nicht auf der des Folgetages.',
			formatEncoding:
				'Dateien aus Excel, LibreOffice oder Numbers werden so angenommen, wie sie sind, mit ihren Anführungszeichen, Zeilenenden und ihrer Kodierung. Die erkannte Kodierung wird nach dem Lesen angezeigt.',
			template: 'Vorlage für die nächsten sechzig Tage herunterladen',
			templateHint:
				'Sie ist bereits mit den berechneten Zeiten für Ihren Ort ausgefüllt, wenn Sie einen gewählt haben. Korrigieren Sie in einem Tabellenprogramm, was von Ihrer Anzeigetafel abweicht, und laden Sie sie dann hier hoch.',
			fileLabel: 'Ihre Datei',
			fileHint: 'Eine Datei im Format CSV, zum Beispiel gebetszeiten-2027.csv.',
			orderLabel: 'Wenn die Datumsangaben nur aus Zahlen bestehen',
			orderHint:
				'In 03/04/2027 kann die 3 der Tag oder der Monat sein. Lassen Sie «Erraten»: Wir bitten Sie um eine Wahl, wenn die Datei keine Entscheidung erlaubt.',
			orders: {
				auto: 'Erraten (empfohlen)',
				dayMonth: 'Zuerst der Tag, dann der Monat (21/09/2026)',
				monthDay: 'Zuerst der Monat, dann der Tag (09/21/2026)'
			},
			yearLabel: 'Jahr der Datei',
			monthLabel: 'Monat der Datei',
			yearMonthHint:
				'Nur für die Datei eines einzigen Monats, deren Datumsspalte nur den Tag angibt (1, 2, 3 …). Beispiel: 2026 und 9 für September 2026.',
			read: 'Datei lesen',
			readTitle: 'Was wir in dieser Datei gelesen haben:',
			encoding: (encoding, separator) => `Kodierung: ${encoding}. Trennzeichen: «${separator}».`,
			tab: 'Tabulator',
			units: { K: 'KB', M: 'MB', G: 'GB' },
			days: (count, first, last) =>
				`${deutsch(count, { one: `${count} Tag`, other: `${count} Tage` })}, vom ${first} bis zum ${last}.`,
			daysNone: 'Kein lesbarer Tag.',
			missing: (count, list) =>
				`${deutsch(count, { one: `${count} Tag fehlt`, other: `${count} Tage fehlen` })} in diesem Zeitraum: ${list}`,
			listSeparator: ', ',
			refused: (count) =>
				deutsch(count, { one: `${count} Zeile abgelehnt.`, other: `${count} Zeilen abgelehnt.` }),
			ambiguous:
				'Die Datumsangaben dieser Datei lassen sich auf zwei Arten lesen, Tag vor Monat oder Monat vor Tag, und beide ergeben einen gültigen Kalender. Wir raten nicht: Wählen Sie oben die Reihenfolge und lesen Sie die Datei erneut.',
			refusedTitle: 'Abgelehnte Zeilen',
			line: (number, reason) => `Zeile ${number}: ${reason}`,
			more: (count) => `… und ${count} weitere.`,
			checkTitle: 'Zu prüfen',
			checkHint:
				'Diese Tage werden so importiert, wie sie sind: Eine Abweichung kann eine gewollte Korrektur sein.',
			previewFromToday: 'Vorschau: die nächsten sieben Tage der Datei',
			previewFirst: 'Vorschau: die ersten sieben Tage der Datei',
			nothingSaved:
				'Noch ist nichts gespeichert. Speichern ersetzt die Tage, die diese Datei abdeckt, und keine anderen.',
			saveDays: (count) =>
				deutsch(count, { one: 'Diesen Tag speichern', other: `Diese ${count} Tage speichern` }),
			removeTitle: 'Importierte Tage entfernen',
			removeHint:
				'Entfernte Tage werden wieder berechnet, wenn ein Ort gewählt ist. Das Änderungsprotokoll hält es fest.',
			removeFrom: 'Erster Tag, der entfernt wird',
			removeTo: 'Letzter Tag, der entfernt wird',
			removeButton: 'Diese Tage entfernen'
		},
		reasons: {
			empty: 'Die Datei ist leer.',
			header: 'Die erste Zeile muss die Spalten benennen: date, fajr, dhuhr, asr, maghrib, isha.',
			badDate: (raw) => `Unlesbares Datum: «${raw}».`,
			badTime: (prayer, raw) => `Unlesbare Uhrzeit für ${prayer}: «${raw}».`,
			noSuchDate: 'Dieses Datum gibt es im Kalender nicht.',
			order: (later, laterTime, earlier, earlierTime) =>
				`${later} (${laterTime}) kann nicht vor ${earlier} (${earlierTime}) liegen.`,
			ishaBeforeMaghrib: (isha, ishaTime, maghrib, maghribTime) =>
				`${isha} (${ishaTime}) liegt vor ${maghrib} (${maghribTime}), ohne über Mitternacht zu gehen.`,
			duplicate: (date) => `Das Datum ${date} kommt zweimal vor.`,
			jump: (date, prayer, minutes, before, after) =>
				`${date}: ${prayer} springt gegenüber dem Vortag um ${minutes} Minuten (${before}, dann ${after}).`
		},
		periods: {
			manualTitle: 'Von Hand eingegeben',
			manualIntro:
				'Ein Zeitraum ist das, was Sie einige Wochen oder das ganze Jahr auf Ihrer Anzeigetafel zeigen: ein Name, Daten und für jedes Gebet die angezeigte Zeit und die Zeit der Iqama. Ein leeres Feld überlässt die Zeit der Datei oder der Berechnung.',
			iqamaTitle: 'Die Iqama (optional)',
			iqamaIntro:
				'Die Iqama ist die Zeit, zu der das Gebet im Saal ausgerufen wird. Wenn Sie eine haben, stellen Sie sie hier ein: Ein Kurs «nach Maghrib» richtet sich dann nach der Iqama. Ein Zeitraum ohne letzten Tag genügt, wenn sich im Jahr nichts ändert.',
			noOverlap:
				'Zwei Zeiträume dürfen sich nicht überschneiden: Schliessen Sie den vorherigen, bevor Sie einen neuen beginnen.',
			fridayBefore: 'Am Freitag ersetzen Ihre ',
			fridayLink: 'Freitagsgebete',
			fridayAfter: ' das Dhuhr.',
			ramadanTitle: 'Ramadan:',
			ramadanText:
				'Ein Ramadan-Zeitraum verschiebt sich jedes Jahr um etwa elf Tage nach vorne. «Für das nächste Jahr kopieren» behält Ihre Daten unverändert: Sie müssen sie selbst anpassen.',
			dates: (from, to) => `Vom ${from} bis zum ${to}`,
			datesOpen: (from) => `Ab dem ${from}, bis auf Weiteres`,
			toReview: 'Daten prüfen',
			toReviewTitle: 'Daten durch die Kopie um ein Jahr verschoben',
			toReviewText:
				'Diese Daten stammen aus einer Kopie: dieselben Tage, ein Jahr später, weil die Gebetszeiten der Sonne folgen und nicht dem islamischen Mondkalender. Prüfen Sie sie, korrigieren Sie sie bei Bedarf und speichern Sie dann: Der Hinweis verschwindet.',
			colPrayer: 'Gebet',
			colShown: 'Angezeigte Zeit',
			colIqama: 'Iqama',
			iqamaAfter: (minutes) => `${minutes} Min. danach`,
			modify: 'Diesen Zeitraum ändern',
			copy: 'Für das nächste Jahr kopieren',
			copyName: (name) => `${name} (nächstes Jahr)`,
			delete: 'Löschen',
			add: 'Zeitraum hinzufügen',
			prefilled: (name) =>
				`Die Werte von «${name}» sind bereits ausgefüllt: Ändern Sie nur, was sich ändert.`,
			nameLabel: 'Name des Zeitraums',
			nameHint: 'Beispiel: Winter 2027 oder Ramadan 2027.',
			namePlaceholder: 'Winter 2027',
			fromLabel: 'Erster Tag',
			toLabel: 'Letzter Tag',
			toHint: 'Leer lassen für «bis auf Weiteres».',
			shownTitle: 'Angezeigte Zeiten',
			shownHint:
				'Die Zeiten Ihrer Anzeigetafel. Ein leeres Feld überlässt die Zeit dieses Gebets der Datei oder der Berechnung.',
			shownFold: 'Auch die angezeigten Zeiten ersetzen',
			shownFoldHint:
				'Nur wenn die Zeiten Ihrer Anzeigetafel von denen der Datei oder der Berechnung abweichen. Ein leeres Feld überlässt die Entscheidung der Datei oder der Berechnung, Gebet für Gebet.',
			iqamaLegend: 'Iqama',
			iqamaHint:
				'Für jedes Gebet eine feste Uhrzeit oder eine Anzahl Minuten nach der angezeigten Zeit, nie beides. Minuten folgen der Sonne von selbst; eine feste Uhrzeit bleibt, auch bei der Zeitumstellung. Beispiel: Maghrib, 10 Minuten danach.',
			iqamaAt: 'Feste Uhrzeit',
			iqamaOffset: 'oder Minuten danach',
			iqamaOffsetLabel: (prayer) => `Iqama: ${prayer}, Minuten nach der angezeigten Zeit`,
			preview: 'Vorschau anzeigen',
			previewTitle: 'Vorschau der nächsten sieben Tage mit diesem Zeitraum',
			previewTitleLater: 'Vorschau der ersten sieben Tage dieses Zeitraums',
			previewLater: (firstDay) =>
				`Dieser Zeitraum beginnt am ${firstDay}: Die Vorschau zeigt seine ersten sieben Tage, nicht die nächsten sieben.`,
			previewLaterEmpty: 'Keine Zeiten für diese sieben Tage.',
			previewHint: 'Noch ist nichts gespeichert.',
			save: 'Diesen Zeitraum speichern'
		},
		served: {
			title: 'Was die Öffentlichkeit in den nächsten sieben Tagen sieht',
			intro:
				'Unter jeder Uhrzeit steht, woher sie kommt, und die Iqama, wenn Sie eine eingestellt haben: Sie gibt die Zeit eines Kurses «nach Maghrib».',
			tableLabel: 'Tabelle der Zeiten, die die Öffentlichkeit sieht',
			empty: 'Keine Zeiten für die nächsten sieben Tage.'
		},
		errors: {
			positionMissing:
				'Wählen Sie einen Ort, oder geben Sie Breiten- und Längengrad an, um eine Vorschau zu sehen.',
			positionUnreadable: 'Die Lage wird in Dezimalgrad geschrieben, zum Beispiel 47.1368.',
			positionHalf: 'Geben Sie Breiten- und Längengrad an, oder keinen von beiden.',
			positionOffEarth:
				'Diese Lage ist nicht auf der Erde: Der Breitengrad reicht von -90 bis 90, der Längengrad von -180 bis 180.',
			localityUnknown: 'Dieser Ort ist nicht in der Liste. Suchen Sie ihn erneut.',
			fileTooLarge: (size) =>
				`Diese Datei ist grösser als erlaubt (${size}). Ein Kalender für ein Jahr ist etwa zwanzigmal kleiner: Prüfen Sie, ob es wirklich eine CSV-Datei ist.`,
			fileMissing: 'Wählen Sie eine Datei.',
			fileEmpty: 'Diese Datei ist leer.',
			nothingToSave: 'Es gibt nichts zu speichern.',
			periodName: 'Geben Sie diesem Zeitraum einen Namen.',
			periodStart: 'Geben Sie den ersten Tag des Zeitraums an.',
			periodEndUnreadable: 'Der letzte Tag ist unlesbar.',
			periodEndBeforeStart: 'Der letzte Tag liegt vor dem ersten.',
			iqamaBoth: (prayer) =>
				`Wählen Sie für ${prayer} eine feste Uhrzeit oder Minuten, nicht beides.`,
			periodOverlap:
				'Dieser Zeitraum überschneidet sich mit einem anderen. Schliessen Sie zuerst den vorherigen. Ein Zeitraum ohne letzten Tag deckt alles ab, was danach kommt.',
			periodGone: 'Diesen Zeitraum gibt es nicht mehr.',
			leapDay:
				'Dieser Zeitraum umfasst nur den 29. Februar, und das nächste Jahr hat keinen. Wählen Sie selbst das Datum, das ihn ersetzt.',
			copyOverlap:
				'Die Kopie würde sich mit einem bestehenden Zeitraum überschneiden. Ein Zeitraum ohne letzten Tag deckt alles ab, was danach kommt: Schliessen Sie ihn zuerst.',
			removeDates: 'Geben Sie den ersten und den letzten Tag an, die entfernt werden.'
		}
	},
	it: {
		title: 'Orari di preghiera',
		intro:
			'Gli orari di preghiera danno l’ora dei corsi che seguono una preghiera, per esempio «15 min dopo Maghrib». Impostali una volta: il servizio li tiene aggiornati ogni giorno.',
		done: {
			settingsSaved: (days) =>
				`Impostazioni salvate. ${italiano(days, { one: `${days} giorno ricalcolato`, other: `${days} giorni ricalcolati` })}.`,
			imported: (days, first, last) =>
				`${italiano(days, { one: `${days} giorno importato`, other: `${days} giorni importati` })}, dal ${first} al ${last}.`,
			removed: (days) =>
				`${italiano(days, { one: `${days} giorno tolto`, other: `${days} giorni tolti` })} dall’importazione. Se è scelta una località, il calcolo riempie di nuovo questi giorni stanotte, o subito quando salvi il calcolo.`,
			periodSaved: 'Periodo salvato.',
			periodCopied:
				'Periodo copiato alle stesse date, un anno dopo. Controlla le date, poi salvalo.',
			periodDeleted: 'Periodo eliminato.'
		},
		status: {
			title: 'I tuoi orari oggi',
			importUntil: (date) => `Il tuo file importato dà gli orari fino al ${date}.`,
			thenComputed: 'Dopo, sono calcolati.',
			thenNothing:
				'Dopo, non c’è più nessun orario: importa il seguito, o scegli una località perché il calcolo prenda il posto del file.',
			importEnding: (days) =>
				`${italiano(days, { one: `Nel tuo file resta ${days} giorno`, other: `Nel tuo file restano ${days} giorni` })}. Importa il seguito, o lascia che il calcolo prenda il posto del file.`,
			computedFor: 'I tuoi orari sono calcolati per questa località:',
			computedForPosition: 'I tuoi orari sono calcolati per la posizione che hai indicato.',
			nothing:
				'Nessun orario di preghiera è impostato. I corsi che seguono una preghiera appaiono senza ora, per esempio «Dopo Maghrib». Rispondi alla domanda qui sotto.',
			manualPeriods: (count) =>
				italiano(count, {
					one: `Hai inserito ${count} periodo a mano: nei giorni che copre, i suoi orari hanno la precedenza sul file e sul calcolo.`,
					other: `Hai inserito ${count} periodi a mano: nei giorni che coprono, i loro orari hanno la precedenza sul file e sul calcolo.`
				})
		},
		question: {
			legend: 'Da dove vengono i tuoi orari di preghiera?',
			answers: {
				computed: {
					label: 'Calcolati per la tua località',
					hint: 'Il servizio calcola gli orari di ogni giorno in base alla posizione della tua località. È la soluzione più semplice.'
				},
				import: {
					label: 'Importati da un file',
					hint: 'Hai il calendario della tua moschea o della tua federazione in un file, una riga per giorno.'
				},
				manual: {
					label: 'Inseriti a mano',
					hint: 'Ricopi gli orari del tuo tabellone, per qualche settimana o per tutto l’anno.'
				}
			},
			priority:
				'Se più fonti danno un orario per lo stesso giorno, l’inserimento a mano ha la precedenza sul file, e il file sul calcolo.',
			continue: 'Continua'
		},
		computed: {
			title: 'Calcolati per la tua località',
			localityLegend: 'La tua località',
			saved: 'Località salvata:',
			searchLabel: 'Nome o NPA della località',
			searchHint:
				'Per esempio Bienne, Lugano o 2502. L’elenco ufficiale delle località svizzere è nel servizio: nessun altro sito viene interrogato.',
			latinLetters: null,
			searchButton: 'Cerca',
			resultsLegend: 'Scegli la tua località',
			found: (count) =>
				italiano(count, {
					one: `${count} località trovata.`,
					other: `${count} località trovate.`
				}),
			foundBest: (count) =>
				`Ecco le ${count} località che corrispondono meglio. Se la tua non c’è, precisa il nome o scrivi il NPA.`,
			noneFound: 'Nessuna località corrisponde. Controlla l’ortografia, o scrivi il NPA.',
			tooShort: 'Scrivi almeno due lettere o due cifre.',
			chosen: 'Località scelta:',
			position: (latitude, longitude) =>
				`La sua posizione: latitudine ${latitude}, longitudine ${longitude}.`,
			creditBefore: 'Elenco ufficiale delle località: ',
			creditAfter: (version) => `, versione del ${version}.`,
			abroadSummary: 'Fuori dalla Svizzera',
			abroadHint:
				'La tua organizzazione non è in Svizzera? Indica la sua posizione in gradi decimali. Su una mappa online, un clic destro sul luogo mostra questi due numeri: il primo è la latitudine. Una località scelta nell’elenco ha la precedenza su questi due numeri.',
			latitude: 'Latitudine',
			longitude: 'Longitudine',
			abroadExample: 'Esempio: latitudine 48.8566 e longitudine 2.3522 per Parigi.',
			advancedSummary: 'Metodo di calcolo, scuola e correzioni (facoltativo)',
			advancedHint:
				'Le impostazioni proposte vanno bene per la maggior parte delle organizzazioni. Cambiale solo se l’anteprima è diversa dagli orari che annunci già.',
			methodLabel: 'Metodo di calcolo',
			methodHint:
				'Fissa l’ora di Fajr e di Isha. Nel dubbio, tieni «Lega musulmana mondiale»: è il metodo più diffuso in Europa. «Altro» non fissa nessun angolo: Fajr cadrebbe quasi al sorgere del sole e Isha quasi al tramonto.',
			methods: {
				MuslimWorldLeague: 'Lega musulmana mondiale',
				Egyptian: 'Autorità generale egiziana di rilevamento',
				Karachi: 'Università di scienze islamiche di Karachi',
				UmmAlQura: 'Università Umm al-Qura, La Mecca',
				Dubai: 'Emirati Arabi Uniti (Dubai)',
				MoonsightingCommittee: 'Comitato di osservazione della luna (Moonsighting Committee)',
				NorthAmerica: 'America del Nord (ISNA)',
				Kuwait: 'Kuwait',
				Qatar: 'Qatar',
				Singapore: 'Singapore, Malesia, Indonesia',
				Tehran: 'Istituto di geofisica dell’Università di Teheran',
				Turkey: 'Turchia (Diyanet)',
				Other: 'Altro (nessun angolo impostato, sconsigliato)'
			},
			madhabLabel: 'Scuola per l’ora di Asr',
			madhabHint: 'Cambia solo l’ora di Asr: con Hanafi è più tardi.',
			madhabs: {
				shafi: 'Shafi’i, Maliki, Hanbali (ombra semplice)',
				hanafi: 'Hanafi (ombra doppia)'
			},
			ruleLabel: 'Regola per le notti corte d’estate',
			ruleHint:
				'A giugno la notte è così corta che Isha cade tardi e Fajr molto presto. La metà della notte tiene gli orari astronomici; l’ultimo settimo anticipa Isha e posticipa Fajr, per orari più facili da rispettare. «Proporzionale all’angolo» dà orari tra i due, secondo l’angolo del metodo scelto.',
			rules: {
				middleofthenight: 'Metà della notte',
				seventhofthenight: 'Ultimo settimo della notte',
				twilightangle: 'Proporzionale all’angolo'
			},
			ruleUsual: (rule) => `Per la tua posizione, la regola abituale è «${rule}».`,
			adjustmentsLegend: 'Correzione per ogni preghiera, in minuti',
			adjustmentsHint:
				'Per allineare il calcolo agli orari che la tua organizzazione annuncia già. Esempio: 2 sposta la preghiera due minuti più tardi, -2 due minuti più presto.',
			previewButton: 'Vedi l’anteprima',
			previewTitle: 'Anteprima dei prossimi sette giorni',
			previewUnsaved:
				'Calcolata con quello che hai appena scelto, senza salvare niente. Confronta con il tabellone della tua organizzazione, poi salva.',
			previewSaved: 'Calcolata con le impostazioni salvate.',
			previewEmpty:
				'Quando hai scelto la località, tocca «Vedi l’anteprima»: gli orari dei prossimi sette giorni appaiono qui prima di essere salvati.',
			nextDay: 'il giorno dopo',
			nextDayTitle: 'Quest’ora cade dopo mezzanotte, il giorno seguente',
			save: 'Salva'
		},
		table: {
			day: 'Giorno',
			sources: { manual: 'a mano', import: 'importato', computed: 'calcolato' },
			iqama: (time) => `iqama ${time}`,
			jumua: (times) => `Jumu’a ${times}`
		},
		file: {
			title: 'Importati da un file',
			intro: (size) =>
				`Un file CSV, una riga per giorno: una colonna per la data e una per ciascuna delle cinque preghiere. Un foglio di calcolo come Excel o LibreOffice lo salva con «Salva con nome», nel formato CSV. Dimensione accettata: ${size}.`,
			exampleTitle: 'Esempio',
			formatSummary: 'Il formato nel dettaglio',
			formatColumns:
				'L’ordine delle colonne non conta: conta il nome in cima a ogni colonna, senza badare a maiuscole o accenti. Nomi accettati:',
			columnDate: 'Data',
			columnNames: (column) => `${column}:`,
			formatDates:
				'Date: 21.09.2026, 21/09/2026 o 21-9-2026. Anche una data scritta con l’anno per primo è accettata.',
			formatTimes:
				'Ore: 19:23, 9:23, 19:23:00, 19h23 o 7:23 PM. I secondi diversi da 00 sono rifiutati: segnalano quasi sempre una colonna spostata.',
			formatLocal:
				'Gli orari sono quelli del tuo fuso orario: non convertire niente, e non preoccuparti del cambio dell’ora. Un Isha dopo mezzanotte si scrive 00:41 sulla riga del giorno della preghiera, non su quella del giorno dopo.',
			formatEncoding:
				'I file salvati da Excel, LibreOffice o Numbers vanno bene così come sono, con le loro virgolette, i loro fine riga e la loro codifica. La codifica riconosciuta appare dopo la lettura.',
			template: 'Scarica un modello dei prossimi sessanta giorni',
			templateHint:
				'È già compilato con gli orari calcolati per la tua località, se ne hai scelta una. Correggi in un foglio di calcolo quello che è diverso dal tuo tabellone, poi caricalo qui.',
			fileLabel: 'Il tuo file',
			fileHint: 'Un file in formato CSV, per esempio orari-2027.csv.',
			orderLabel: 'Se le date sono scritte solo con numeri',
			orderHint:
				'In 03/04/2027 il 3 può essere il giorno o il mese. Lascia «Indovina»: ti chiederemo di scegliere se il file non permette di decidere.',
			orders: {
				auto: 'Indovina (consigliato)',
				dayMonth: 'Prima il giorno, poi il mese (21/09/2026)',
				monthDay: 'Prima il mese, poi il giorno (09/21/2026)'
			},
			yearLabel: 'Anno del file',
			monthLabel: 'Mese del file',
			yearMonthHint:
				'Solo per il file di un solo mese, la cui colonna delle date dà solo il giorno (1, 2, 3…). Esempio: 2026 e 9 per settembre 2026.',
			read: 'Leggi il file',
			readTitle: 'Quello che abbiamo letto in questo file:',
			encoding: (encoding, separator) => `Codifica: ${encoding}. Separatore: «${separator}».`,
			tab: 'tabulazione',
			units: { K: 'KB', M: 'MB', G: 'GB' },
			days: (count, first, last) =>
				`${italiano(count, { one: `${count} giorno`, other: `${count} giorni` })}, dal ${first} al ${last}.`,
			daysNone: 'Nessun giorno leggibile.',
			missing: (count, list) =>
				`${italiano(count, { one: `Manca ${count} giorno`, other: `Mancano ${count} giorni` })} in questo intervallo: ${list}`,
			listSeparator: ', ',
			refused: (count) =>
				italiano(count, {
					one: `${count} riga rifiutata.`,
					other: `${count} righe rifiutate.`
				}),
			ambiguous:
				'Le date di questo file si leggono in due modi, giorno poi mese o mese poi giorno, ed entrambi danno un calendario valido. Non tiriamo a indovinare: scegli l’ordine qui sopra, poi leggi di nuovo il file.',
			refusedTitle: 'Righe rifiutate',
			line: (number, reason) => `Riga ${number}: ${reason}`,
			more: (count) => `… e altre ${count}.`,
			checkTitle: 'Da controllare',
			checkHint:
				'Questi giorni saranno importati così come sono: uno scarto può essere una correzione voluta.',
			previewFromToday: 'Anteprima: i prossimi sette giorni del file',
			previewFirst: 'Anteprima: i primi sette giorni del file',
			nothingSaved:
				'Non è ancora salvato niente. Salvare sostituisce i giorni coperti da questo file, e non ne tocca nessun altro.',
			saveDays: (count) =>
				italiano(count, { one: 'Salva questo giorno', other: `Salva questi ${count} giorni` }),
			removeTitle: 'Togliere giorni importati',
			removeHint:
				'I giorni tolti tornano al calcolo, se è scelta una località. Il registro delle modifiche ne tiene traccia.',
			removeFrom: 'Primo giorno da togliere',
			removeTo: 'Ultimo giorno da togliere',
			removeButton: 'Togli questi giorni'
		},
		reasons: {
			empty: 'Il file è vuoto.',
			header: 'La prima riga deve nominare le colonne: date, fajr, dhuhr, asr, maghrib, isha.',
			badDate: (raw) => `Data illeggibile: «${raw}».`,
			badTime: (prayer, raw) => `Ora illeggibile per ${prayer}: «${raw}».`,
			noSuchDate: 'Questa data non esiste nel calendario.',
			order: (later, laterTime, earlier, earlierTime) =>
				`${later} (${laterTime}) non può venire prima di ${earlier} (${earlierTime}).`,
			ishaBeforeMaghrib: (isha, ishaTime, maghrib, maghribTime) =>
				`${isha} (${ishaTime}) cade prima di ${maghrib} (${maghribTime}) senza passare la mezzanotte.`,
			duplicate: (date) => `La data ${date} compare due volte.`,
			jump: (date, prayer, minutes, before, after) =>
				`${date}: ${prayer} salta di ${minutes} minuti rispetto al giorno prima (${before}, poi ${after}).`
		},
		periods: {
			manualTitle: 'Inseriti a mano',
			manualIntro:
				'Un periodo è quello che mostri sul tuo tabellone per qualche settimana o per tutto l’anno: un nome, delle date e, per ogni preghiera, l’ora mostrata e l’ora dell’iqama. Una casella vuota lascia che sia il file o il calcolo a dare l’ora.',
			iqamaTitle: 'L’iqama (facoltativo)',
			iqamaIntro:
				'L’iqama è l’ora in cui la preghiera viene chiamata nella sala. Se ne hai una, impostala qui: un corso «dopo Maghrib» seguirà l’iqama. Un periodo senza ultimo giorno basta se nell’anno non cambia niente.',
			noOverlap:
				'Due periodi non possono sovrapporsi: chiudi quello precedente prima di aprirne un altro.',
			fridayBefore: 'Il venerdì sono le tue ',
			fridayLink: 'sessioni del venerdì',
			fridayAfter: ' a sostituire Dhuhr.',
			ramadanTitle: 'Ramadan:',
			ramadanText:
				'un periodo di Ramadan si sposta di circa undici giorni in avanti ogni anno. «Copia per l’anno seguente» mantiene le tue date così come sono: tocca a te cambiarle.',
			dates: (from, to) => `Dal ${from} al ${to}`,
			datesOpen: (from) => `Dal ${from}, fino a nuovo avviso`,
			toReview: 'date da controllare',
			toReviewTitle: 'Date spostate di un anno dalla copia',
			toReviewText:
				'Queste date vengono da una copia: gli stessi giorni, un anno dopo, perché gli orari di preghiera seguono il sole e non il calendario lunare. Controllale, correggile se serve, poi salva: l’indicazione sparirà.',
			colPrayer: 'Preghiera',
			colShown: 'Ora mostrata',
			colIqama: 'Iqama',
			iqamaAfter: (minutes) => `${minutes} min dopo`,
			modify: 'Modifica questo periodo',
			copy: 'Copia per l’anno seguente',
			copyName: (name) => `${name} (anno seguente)`,
			delete: 'Elimina',
			add: 'Aggiungi un periodo',
			prefilled: (name) =>
				`I valori di «${name}» sono già compilati: cambia solo quello che cambia.`,
			nameLabel: 'Nome del periodo',
			nameHint: 'Esempio: Inverno 2027, o Ramadan 2027.',
			namePlaceholder: 'Inverno 2027',
			fromLabel: 'Primo giorno',
			toLabel: 'Ultimo giorno',
			toHint: 'Lascia vuoto per «fino a nuovo avviso».',
			shownTitle: 'Orari mostrati',
			shownHint:
				'Gli orari del tuo tabellone. Una casella vuota lascia che sia il file o il calcolo a dare l’ora di questa preghiera.',
			shownFold: 'Sostituire anche gli orari mostrati',
			shownFoldHint:
				'Solo se gli orari del tuo tabellone sono diversi da quelli del file o del calcolo. Una casella vuota lascia decidere il file o il calcolo, preghiera per preghiera.',
			iqamaLegend: 'Iqama',
			iqamaHint:
				'Per ogni preghiera, un’ora fissa o un numero di minuti dopo l’ora mostrata, mai entrambi. I minuti seguono il sole da soli; un’ora fissa non si sposta, nemmeno al cambio dell’ora. Esempio: Maghrib, 10 minuti dopo.',
			iqamaAt: 'Ora fissa',
			iqamaOffset: 'o minuti dopo',
			iqamaOffsetLabel: (prayer) => `Iqama: ${prayer}, minuti dopo l’ora mostrata`,
			preview: 'Vedi l’anteprima',
			previewTitle: 'Anteprima dei prossimi sette giorni con questo periodo',
			previewTitleLater: 'Anteprima dei primi sette giorni di questo periodo',
			previewLater: (firstDay) =>
				`Questo periodo comincia il ${firstDay}: l’anteprima mostra i suoi primi sette giorni, non i prossimi sette.`,
			previewLaterEmpty: 'Nessun orario per questi sette giorni.',
			previewHint: 'Non è ancora salvato niente.',
			save: 'Salva questo periodo'
		},
		served: {
			title: 'Quello che il pubblico vede nei prossimi sette giorni',
			intro:
				'Sotto ogni ora, da dove viene, e l’iqama se ne hai impostata una: è lei a dare l’ora di un corso «dopo Maghrib».',
			tableLabel: 'Tabella degli orari che vede il pubblico',
			empty: 'Nessun orario per i prossimi sette giorni.'
		},
		errors: {
			positionMissing:
				'Scegli una località, o indica una latitudine e una longitudine, per vedere un’anteprima.',
			positionUnreadable: 'La posizione si scrive in gradi decimali, per esempio 47.1368.',
			positionHalf: 'Indica la latitudine e la longitudine, o nessuna delle due.',
			positionOffEarth:
				'Questa posizione non è sulla Terra: la latitudine va da -90 a 90, la longitudine da -180 a 180.',
			localityUnknown: 'Questa località non è nell’elenco. Cercala di nuovo.',
			fileTooLarge: (size) =>
				`Questo file supera la dimensione accettata (${size}). Un calendario di un anno è circa venti volte più piccolo: controlla che sia proprio un file CSV.`,
			fileMissing: 'Scegli un file.',
			fileEmpty: 'Questo file è vuoto.',
			nothingToSave: 'Non c’è niente da salvare.',
			periodName: 'Dai un nome a questo periodo.',
			periodStart: 'Indica il primo giorno del periodo.',
			periodEndUnreadable: 'L’ultimo giorno è illeggibile.',
			periodEndBeforeStart: 'L’ultimo giorno viene prima del primo.',
			iqamaBoth: (prayer) => `Per ${prayer}, scegli un’ora fissa o dei minuti, non entrambi.`,
			periodOverlap:
				'Questo periodo si sovrappone a un altro. Chiudi prima quello precedente. Un periodo senza ultimo giorno copre tutto quello che viene dopo.',
			periodGone: 'Questo periodo non esiste più.',
			leapDay:
				'Questo periodo copre solo il 29 febbraio, e l’anno seguente non ce l’ha. Scegli tu la data che lo sostituisce.',
			copyOverlap:
				'La copia si sovrapporrebbe a un periodo esistente. Un periodo senza ultimo giorno copre tutto quello che viene dopo: chiudilo prima.',
			removeDates: 'Indica il primo e l’ultimo giorno da togliere.'
		}
	},
	en: {
		title: 'Prayer times',
		intro:
			'Prayer times give the time of the courses that follow a prayer, for example ‘15 min after Maghrib’. Set them once: the service keeps them up to date every day.',
		done: {
			settingsSaved: (days) =>
				`Settings saved. ${english(days, { one: `${days} day recalculated`, other: `${days} days recalculated` })}.`,
			imported: (days, first, last) =>
				`${english(days, { one: `${days} day imported`, other: `${days} days imported` })}, from ${first} to ${last}.`,
			removed: (days) =>
				`${english(days, { one: `${days} day removed`, other: `${days} days removed` })} from the import. If a town or village is chosen, the calculation fills these days again tonight, or at once when you save the calculation.`,
			periodSaved: 'Period saved.',
			periodCopied:
				'Period copied to the same dates, one year later. Check its dates, then save it.',
			periodDeleted: 'Period deleted.'
		},
		status: {
			title: 'Your times today',
			importUntil: (date) => `Your imported file gives the times until ${date}.`,
			thenComputed: 'After that, they are calculated.',
			thenNothing:
				'After that, there are no times: import the next part, or choose a town or village so that the calculation takes over.',
			importEnding: (days) =>
				`${english(days, { one: `${days} day is left`, other: `${days} days are left` })} in your file. Import the next part, or let the calculation take over.`,
			computedFor: 'Your times are calculated for this town or village:',
			computedForPosition: 'Your times are calculated for the position you gave.',
			nothing:
				'No prayer times are set. Courses that follow a prayer are shown without a time, for example ‘After Maghrib’. Answer the question below.',
			manualPeriods: (count) =>
				english(count, {
					one: `You have entered ${count} period by hand: on the days it covers, its times come before those of the file and the calculation.`,
					other: `You have entered ${count} periods by hand: on the days they cover, their times come before those of the file and the calculation.`
				})
		},
		question: {
			legend: 'Where do your prayer times come from?',
			answers: {
				computed: {
					label: 'Calculated for your town or village',
					hint: 'The service calculates the times of each day from the position of your town or village. This is the simplest.'
				},
				import: {
					label: 'Imported from a file',
					hint: 'You have the calendar of your mosque or your federation in a file, one line per day.'
				},
				manual: {
					label: 'Entered by hand',
					hint: 'You copy the times from your notice board, for a few weeks or for the whole year.'
				}
			},
			priority:
				'If several sources give a time for the same day, times entered by hand come before the file, and the file before the calculation.',
			continue: 'Continue'
		},
		computed: {
			title: 'Calculated for your town or village',
			localityLegend: 'Your town or village',
			saved: 'Saved town or village:',
			searchLabel: 'Name or postcode of the town or village',
			searchHint:
				'For example Biel, Lugano or 2502. The official list of Swiss localities is inside the service: no other website is contacted.',
			latinLetters: null,
			searchButton: 'Search',
			resultsLegend: 'Choose your town or village',
			found: (count) =>
				english(count, { one: `${count} place found.`, other: `${count} places found.` }),
			foundBest: (count) =>
				`Here are the ${count} places that match best. If yours is not there, type more of the name, or the postcode.`,
			noneFound: 'No town or village matches. Check the spelling, or type the postcode.',
			tooShort: 'Type at least two letters or two digits.',
			chosen: 'Chosen town or village:',
			position: (latitude, longitude) =>
				`Its position: latitude ${latitude}, longitude ${longitude}.`,
			creditBefore: 'Official list of localities: ',
			creditAfter: (version) => `, version of ${version}.`,
			abroadSummary: 'Outside Switzerland',
			abroadHint:
				'Is your organisation outside Switzerland? Give its position in decimal degrees. On an online map, a right-click on the place shows these two numbers: the first is the latitude. A town or village chosen from the list comes before these two numbers.',
			latitude: 'Latitude',
			longitude: 'Longitude',
			abroadExample: 'Example: latitude 48.8566 and longitude 2.3522 for Paris.',
			advancedSummary: 'Calculation method, school and adjustments (optional)',
			advancedHint:
				'The suggested settings suit most organisations. Only change them if the preview differs from the times you already announce.',
			methodLabel: 'Calculation method',
			methodHint:
				'It sets the time of Fajr and Isha. If in doubt, keep ‘Muslim World League’: it is the most widely used method in Europe. ‘Other’ sets no angle: Fajr would fall almost at sunrise and Isha almost at sunset.',
			methods: {
				MuslimWorldLeague: 'Muslim World League',
				Egyptian: 'Egyptian General Authority of Survey',
				Karachi: 'University of Islamic Sciences, Karachi',
				UmmAlQura: 'Umm al-Qura University, Makkah',
				Dubai: 'United Arab Emirates (Dubai)',
				MoonsightingCommittee: 'Moonsighting Committee Worldwide',
				NorthAmerica: 'North America (ISNA)',
				Kuwait: 'Kuwait',
				Qatar: 'Qatar',
				Singapore: 'Singapore, Malaysia, Indonesia',
				Tehran: 'Institute of Geophysics, University of Tehran',
				Turkey: 'Turkey (Diyanet)',
				Other: 'Other (no angles set, not recommended)'
			},
			madhabLabel: 'School for the time of Asr',
			madhabHint: 'Only the time of Asr changes: it is later with Hanafi.',
			madhabs: {
				shafi: 'Shafi’i, Maliki, Hanbali (single shadow)',
				hanafi: 'Hanafi (double shadow)'
			},
			ruleLabel: 'Rule for short summer nights',
			ruleHint:
				'In June the night is so short that Isha falls late and Fajr very early. The middle of the night keeps the astronomical times; the last seventh brings Isha forward and Fajr back, for times that are easier to keep. ‘In proportion to the angle’ gives times between the two, depending on the angle of the chosen method.',
			rules: {
				middleofthenight: 'Middle of the night',
				seventhofthenight: 'Last seventh of the night',
				twilightangle: 'In proportion to the angle'
			},
			ruleUsual: (rule) => `For your position, the usual rule is ‘${rule}’.`,
			adjustmentsLegend: 'Adjustment per prayer, in minutes',
			adjustmentsHint:
				'To align the calculation with the times your organisation already announces. Example: 2 moves the prayer two minutes later, -2 two minutes earlier.',
			previewButton: 'Show the preview',
			previewTitle: 'Preview of the next seven days',
			previewUnsaved:
				'Calculated with what you have just chosen, without saving anything. Compare it with the notice board of your organisation, then save.',
			previewSaved: 'Calculated with the saved settings.',
			previewEmpty:
				'Once the town or village is chosen, tap ‘Show the preview’: the times of the next seven days appear here before they are saved.',
			nextDay: 'the next day',
			nextDayTitle: 'This time falls after midnight, on the following day',
			save: 'Save'
		},
		table: {
			day: 'Day',
			sources: { manual: 'by hand', import: 'imported', computed: 'calculated' },
			iqama: (time) => `iqama ${time}`,
			jumua: (times) => `Jumu’a ${times}`
		},
		file: {
			title: 'Imported from a file',
			intro: (size) =>
				`A CSV file, one line per day: one column for the date, and one for each of the five prayers. A spreadsheet such as Excel or LibreOffice saves it with ‘Save as’, in CSV format. Accepted size: ${size}.`,
			exampleTitle: 'Example',
			formatSummary: 'The format in detail',
			formatColumns:
				'The order of the columns does not matter: what counts is the name at the top of each column, regardless of capitals or accents. Accepted names:',
			columnDate: 'Date',
			columnNames: (column) => `${column}:`,
			formatDates:
				'Dates: 21.09.2026, 21/09/2026 or 21-9-2026. A date written with the year first is accepted too.',
			formatTimes:
				'Times: 19:23, 9:23, 19:23:00, 19h23 or 7:23 PM. Seconds other than 00 are refused: they almost always mean a shifted column.',
			formatLocal:
				'The times are those of your time zone: convert nothing, and do not worry about the clocks changing. An Isha after midnight is written 00:41 on the line of the day of the prayer, not on the line of the next day.',
			formatEncoding:
				'Files saved by Excel, LibreOffice or Numbers work as they are, with their quotation marks, line endings and encoding. The encoding found is shown after reading.',
			template: 'Download a template for the next sixty days',
			templateHint:
				'It is already filled in with the times calculated for your town or village, if you have chosen one. Correct in a spreadsheet what differs from your notice board, then upload it here.',
			fileLabel: 'Your file',
			fileHint: 'A file in CSV format, for example prayer-times-2027.csv.',
			orderLabel: 'If the dates are written in figures only',
			orderHint:
				'In 03/04/2027, the 3 can be the day or the month. Leave ‘Guess’: we will ask you to choose if the file does not allow us to decide.',
			orders: {
				auto: 'Guess (recommended)',
				dayMonth: 'Day first, then month (21/09/2026)',
				monthDay: 'Month first, then day (09/21/2026)'
			},
			yearLabel: 'Year of the file',
			monthLabel: 'Month of the file',
			yearMonthHint:
				'Only for the file of a single month whose date column gives only the day (1, 2, 3…). Example: 2026 and 9 for September 2026.',
			read: 'Read the file',
			readTitle: 'What we read in this file:',
			encoding: (encoding, separator) => `Encoding: ${encoding}. Separator: ‘${separator}’.`,
			tab: 'tab',
			units: { K: 'KB', M: 'MB', G: 'GB' },
			days: (count, first, last) =>
				`${english(count, { one: `${count} day`, other: `${count} days` })}, from ${first} to ${last}.`,
			daysNone: 'No readable day.',
			missing: (count, list) =>
				`${english(count, { one: `${count} day is missing`, other: `${count} days are missing` })} in this range: ${list}`,
			listSeparator: ', ',
			refused: (count) =>
				english(count, { one: `${count} line refused.`, other: `${count} lines refused.` }),
			ambiguous:
				'The dates of this file can be read in two ways, day then month or month then day, and both give a valid calendar. We do not guess: choose the order above, then read the file again.',
			refusedTitle: 'Refused lines',
			line: (number, reason) => `Line ${number}: ${reason}`,
			more: (count) => `… and ${count} more.`,
			checkTitle: 'To check',
			checkHint: 'These days will be imported as they are: a gap can be an intended correction.',
			previewFromToday: 'Preview: the next seven days of the file',
			previewFirst: 'Preview: the first seven days of the file',
			nothingSaved:
				'Nothing has been saved yet. Saving replaces the days this file covers, and touches no other.',
			saveDays: (count) =>
				english(count, { one: 'Save this day', other: `Save these ${count} days` }),
			removeTitle: 'Remove imported days',
			removeHint:
				'The removed days go back to the calculation, if a town or village is chosen. The change log keeps a record of it.',
			removeFrom: 'First day to remove',
			removeTo: 'Last day to remove',
			removeButton: 'Remove these days'
		},
		reasons: {
			empty: 'The file is empty.',
			header: 'The first line must name the columns: date, fajr, dhuhr, asr, maghrib, isha.',
			badDate: (raw) => `Unreadable date: ‘${raw}’.`,
			badTime: (prayer, raw) => `Unreadable time for ${prayer}: ‘${raw}’.`,
			noSuchDate: 'This date does not exist in the calendar.',
			order: (later, laterTime, earlier, earlierTime) =>
				`${later} (${laterTime}) cannot come before ${earlier} (${earlierTime}).`,
			ishaBeforeMaghrib: (isha, ishaTime, maghrib, maghribTime) =>
				`${isha} (${ishaTime}) falls before ${maghrib} (${maghribTime}) without passing midnight.`,
			duplicate: (date) => `The date ${date} appears twice.`,
			jump: (date, prayer, minutes, before, after) =>
				`${date}: ${prayer} jumps by ${minutes} minutes from the day before (${before} then ${after}).`
		},
		periods: {
			manualTitle: 'Entered by hand',
			manualIntro:
				'A period is what you show on your notice board for a few weeks or the whole year: a name, dates, and for each prayer the time shown and the time of the iqama. An empty box lets the file or the calculation give the time.',
			iqamaTitle: 'The iqama (optional)',
			iqamaIntro:
				'The iqama is the time at which the prayer is called in the hall. If you have one, set it here: a course ‘after Maghrib’ will follow the iqama. One period with no last day is enough if nothing changes during the year.',
			noOverlap: 'Two periods cannot overlap: close the previous one before opening another.',
			fridayBefore: 'On Fridays, your ',
			fridayLink: 'Friday sessions',
			fridayAfter: ' replace Dhuhr.',
			ramadanTitle: 'Ramadan:',
			ramadanText:
				'a Ramadan period moves about eleven days earlier each year. ‘Copy for next year’ keeps your dates as they are: it is up to you to change them.',
			dates: (from, to) => `From ${from} to ${to}`,
			datesOpen: (from) => `From ${from}, until further notice`,
			toReview: 'dates to check',
			toReviewTitle: 'Dates moved one year on by the copy',
			toReviewText:
				'These dates come from a copy: the same days, one year later, because prayer times follow the sun and not the lunar calendar. Check them, correct them if needed, then save: the note will disappear.',
			colPrayer: 'Prayer',
			colShown: 'Time shown',
			colIqama: 'Iqama',
			iqamaAfter: (minutes) => `${minutes} min after`,
			modify: 'Change this period',
			copy: 'Copy for next year',
			copyName: (name) => `${name} (next year)`,
			delete: 'Delete',
			add: 'Add a period',
			prefilled: (name) =>
				`The values of ‘${name}’ are already filled in: only change what changes.`,
			nameLabel: 'Name of the period',
			nameHint: 'Example: Winter 2027, or Ramadan 2027.',
			namePlaceholder: 'Winter 2027',
			fromLabel: 'First day',
			toLabel: 'Last day',
			toHint: 'Leave empty for ‘until further notice’.',
			shownTitle: 'Times shown',
			shownHint:
				'The times on your notice board. An empty box lets the file or the calculation give the time of this prayer.',
			shownFold: 'Also replace the times shown',
			shownFoldHint:
				'Only if the times on your notice board differ from those of the file or the calculation. An empty box lets the file or the calculation decide, prayer by prayer.',
			iqamaLegend: 'Iqama',
			iqamaHint:
				'For each prayer, a fixed time or a number of minutes after the time shown, never both. Minutes follow the sun by themselves; a fixed time does not move, not even when the clocks change. Example: Maghrib, 10 minutes after.',
			iqamaAt: 'Fixed time',
			iqamaOffset: 'or minutes after',
			iqamaOffsetLabel: (prayer) => `Iqama: ${prayer}, minutes after the time shown`,
			preview: 'Show the preview',
			previewTitle: 'Preview of the next seven days with this period',
			previewTitleLater: 'Preview of the first seven days of this period',
			previewLater: (firstDay) =>
				`This period starts on ${firstDay}: the preview shows its first seven days, not the next seven.`,
			previewLaterEmpty: 'No times for these seven days.',
			previewHint: 'Nothing has been saved yet.',
			save: 'Save this period'
		},
		served: {
			title: 'What the public sees over the next seven days',
			intro:
				'Under each time, where it comes from, and the iqama if you have set one: it gives the time of a course ‘after Maghrib’.',
			tableLabel: 'Table of the times the public sees',
			empty: 'No times for the next seven days.'
		},
		errors: {
			positionMissing:
				'Choose a town or village, or give a latitude and a longitude, to see a preview.',
			positionUnreadable: 'The position is written in decimal degrees, for example 47.1368.',
			positionHalf: 'Give the latitude and the longitude, or neither.',
			positionOffEarth:
				'This position is not on Earth: latitude goes from -90 to 90, longitude from -180 to 180.',
			localityUnknown: 'This town or village is not in the list. Search for it again.',
			fileTooLarge: (size) =>
				`This file is larger than the accepted size (${size}). A calendar for one year is about twenty times smaller: check that it really is a CSV file.`,
			fileMissing: 'Choose a file.',
			fileEmpty: 'This file is empty.',
			nothingToSave: 'There is nothing to save.',
			periodName: 'Give this period a name.',
			periodStart: 'Give the first day of the period.',
			periodEndUnreadable: 'The last day cannot be read.',
			periodEndBeforeStart: 'The last day comes before the first.',
			iqamaBoth: (prayer) => `For ${prayer}, choose a fixed time or minutes, not both.`,
			periodOverlap:
				'This period overlaps another. First close the one before it. A period with no last day covers everything that comes after it.',
			periodGone: 'This period no longer exists.',
			leapDay:
				'This period only covers 29 February, and next year has none. Choose the date that replaces it yourself.',
			copyOverlap:
				'The copy would overlap an existing period. A period with no last day covers everything that comes after it: close it first.',
			removeDates: 'Give the first and the last day to remove.'
		}
	},
	ar: {
		title: 'مواقيت الصلاة',
		intro:
			'تحدّد مواقيت الصلاة وقت الدروس التي تأتي بعد صلاة، مثل «بعد المغرب بـ15 دقيقة». اضبطها مرة واحدة، وستحدّثها الخدمة كل يوم.',
		done: {
			settingsSaved: (days) => `حُفظت الإعدادات. الأيام التي أُعيد حسابها: ${days}.`,
			imported: (days, first, last) => `الأيام المستوردة: ${days}، من ${first} إلى ${last}.`,
			removed: (days) =>
				`الأيام التي أُزيلت من الاستيراد: ${days}. إن كانت هناك بلدة مختارة، فسيملأ الحساب هذه الأيام من جديد الليلة، أو فورًا عند حفظ الحساب.`,
			periodSaved: 'حُفظت الفترة.',
			periodCopied: 'نُسخت الفترة بالتواريخ نفسها بعد سنة. تحقّق من تواريخها، ثم احفظها.',
			periodDeleted: 'حُذفت الفترة.'
		},
		status: {
			title: 'مواقيتك اليوم',
			importUntil: (date) => `يعطي ملفك المستورد المواقيت حتى ${date}.`,
			thenComputed: 'بعد ذلك، تُحسب المواقيت.',
			thenNothing: 'بعد ذلك لا توجد مواقيت: استورد ما يليها، أو اختر بلدة ليتولى الحساب الأمر.',
			importEnding: (days) =>
				`الأيام المتبقية في ملفك: ${days}. استورد ما يليها، أو دع الحساب يتولى الأمر.`,
			computedFor: 'تُحسب مواقيتك لهذه البلدة:',
			computedForPosition: 'تُحسب مواقيتك للموقع الذي أدخلته.',
			nothing:
				'لم تُضبط أي مواقيت للصلاة. تظهر الدروس التي تأتي بعد صلاة بلا وقت، مثل «بعد المغرب». أجب عن السؤال أدناه.',
			manualPeriods: (count) =>
				`الفترات التي أدخلتها يدويًا: ${count}. في الأيام التي تغطيها، تسبق مواقيتها مواقيت الملف والحساب.`
		},
		question: {
			legend: 'من أين تأتي مواقيت الصلاة لديك؟',
			answers: {
				computed: {
					label: 'محسوبة لبلدتك',
					hint: 'تحسب الخدمة مواقيت كل يوم حسب موقع بلدتك. هذا هو الأبسط.'
				},
				import: {
					label: 'مستوردة من ملف',
					hint: 'لديك تقويم مسجدك أو اتحادك في ملف، سطر لكل يوم.'
				},
				manual: {
					label: 'مُدخلة يدويًا',
					hint: 'تنقل المواقيت من لوحة الإعلانات عندك، لبضعة أسابيع أو للسنة كلها.'
				}
			},
			priority:
				'إذا أعطت عدة مصادر وقتًا لليوم نفسه، فالإدخال اليدوي يسبق الملف، والملف يسبق الحساب.',
			continue: 'متابعة'
		},
		computed: {
			title: 'محسوبة لبلدتك',
			localityLegend: 'بلدتك',
			saved: 'البلدة المحفوظة:',
			searchLabel: 'اسم البلدة أو رمزها البريدي',
			searchHint:
				'مثلًا Biel أو Lugano أو 2502. القائمة الرسمية للبلدات السويسرية موجودة داخل الخدمة: لا اتصال بأي موقع آخر.',
			latinLetters:
				'اكتب الرمز البريدي أو اسم البلدة بحروف لاتينية، فالقائمة لا تتضمن أسماء عربية.',
			searchButton: 'بحث',
			resultsLegend: 'اختر بلدتك',
			found: (count) => `البلدات التي وُجدت: ${count}.`,
			foundBest: (count) =>
				`إليك البلدات الأكثر تطابقًا (${count}). إن لم تجد بلدتك بينها، فأكمل الاسم أو اكتب الرمز البريدي.`,
			noneFound: 'لا توجد بلدة مطابقة. تحقّق من الإملاء، أو اكتب الرمز البريدي.',
			tooShort: 'اكتب حرفين أو رقمين على الأقل.',
			chosen: 'البلدة المختارة:',
			position: (latitude, longitude) => `موقعها: خط العرض ${latitude}، خط الطول ${longitude}.`,
			creditBefore: 'القائمة الرسمية للبلدات: ',
			creditAfter: (version) => `، إصدار ${version}.`,
			abroadSummary: 'خارج سويسرا',
			abroadHint:
				'مؤسستك ليست في سويسرا؟ أدخل موقعها بالدرجات العشرية. على خريطة في الإنترنت، يُظهر النقر بالزر الأيمن على المكان هذين الرقمين: الأول هو خط العرض. البلدة المختارة من القائمة تسبق هذين الرقمين.',
			latitude: 'خط العرض',
			longitude: 'خط الطول',
			abroadExample: 'مثال: خط العرض 48.8566 وخط الطول 2.3522 لباريس.',
			advancedSummary: 'طريقة الحساب والمذهب والتعديلات (اختياري)',
			advancedHint:
				'الإعدادات المقترحة تناسب معظم المؤسسات. لا تغيّرها إلا إذا اختلفت المعاينة عن المواقيت التي تعلنها.',
			methodLabel: 'طريقة الحساب',
			methodHint:
				'تحدّد وقت الفجر والعشاء. إن كنت مترددًا، فاحتفظ بـ«رابطة العالم الإسلامي»: إنها الطريقة الأكثر انتشارًا في أوروبا. «أخرى» لا تضبط أي زاوية: فيقع الفجر تقريبًا عند شروق الشمس والعشاء تقريبًا عند غروبها.',
			methods: {
				MuslimWorldLeague: 'رابطة العالم الإسلامي',
				Egyptian: 'الهيئة المصرية العامة للمساحة',
				Karachi: 'جامعة العلوم الإسلامية بكراتشي',
				UmmAlQura: 'جامعة أم القرى، مكة المكرمة',
				Dubai: 'الإمارات العربية المتحدة (دبي)',
				MoonsightingCommittee: 'لجنة رؤية الهلال (Moonsighting Committee)',
				NorthAmerica: 'أمريكا الشمالية (ISNA)',
				Kuwait: 'الكويت',
				Qatar: 'قطر',
				Singapore: 'سنغافورة وماليزيا وإندونيسيا',
				Tehran: 'معهد الجيوفيزياء بجامعة طهران',
				Turkey: 'تركيا (رئاسة الشؤون الدينية)',
				Other: 'أخرى (بلا زوايا محددة، غير مستحسنة)'
			},
			madhabLabel: 'المذهب لوقت العصر',
			madhabHint: 'وقت العصر وحده يتغير: يأتي متأخرًا عند الحنفية.',
			madhabs: {
				shafi: 'الشافعي والمالكي والحنبلي (ظل المثل)',
				hanafi: 'الحنفي (ظل المثلين)'
			},
			ruleLabel: 'قاعدة ليالي الصيف القصيرة',
			ruleHint:
				'في يونيو يقصر الليل حتى يتأخر العشاء ويبكر الفجر كثيرًا. منتصف الليل يُبقي المواقيت الفلكية كما هي، والسُّبع الأخير يقدّم العشاء ويؤخر الفجر، لمواقيت يسهل الالتزام بها. «بنسبة الزاوية» تعطي مواقيت بين الاثنتين، حسب زاوية الطريقة المختارة.',
			rules: {
				middleofthenight: 'منتصف الليل',
				seventhofthenight: 'السُّبع الأخير من الليل',
				twilightangle: 'بنسبة الزاوية'
			},
			ruleUsual: (rule) => `لموقعك، القاعدة المعتادة هي «${rule}».`,
			adjustmentsLegend: 'تعديل كل صلاة، بالدقائق',
			adjustmentsHint:
				'لمطابقة الحساب مع المواقيت التي تعلنها مؤسستك. مثال: 2 يؤخر الصلاة دقيقتين، و-2 يقدّمها دقيقتين.',
			previewButton: 'عرض المعاينة',
			previewTitle: 'معاينة الأيام السبعة القادمة',
			previewUnsaved: 'محسوبة بما اخترته الآن، دون حفظ أي شيء. قارنها بلوحة مؤسستك، ثم احفظ.',
			previewSaved: 'محسوبة بالإعدادات المحفوظة.',
			previewEmpty:
				'بعد اختيار البلدة، اضغط «عرض المعاينة»: تظهر هنا مواقيت الأيام السبعة القادمة قبل حفظها.',
			nextDay: 'في اليوم التالي',
			nextDayTitle: 'هذا الوقت بعد منتصف الليل، في اليوم التالي',
			save: 'حفظ'
		},
		table: {
			day: 'اليوم',
			sources: { manual: 'يدوي', import: 'مستورد', computed: 'محسوب' },
			iqama: (time) => `الإقامة ${time}`,
			jumua: (times) => `الجمعة ${times}`
		},
		file: {
			title: 'مستوردة من ملف',
			intro: (size) =>
				`ملف CSV، سطر لكل يوم: عمود للتاريخ، وعمود لكل صلاة من الصلوات الخمس. يحفظه برنامج جداول مثل Excel أو LibreOffice عبر «حفظ باسم» بصيغة CSV. الحجم المقبول: ${size}.`,
			exampleTitle: 'مثال',
			formatSummary: 'الصيغة بالتفصيل',
			formatColumns:
				'ترتيب الأعمدة لا يهم: المهم هو الاسم في رأس كل عمود، دون اعتبار للأحرف الكبيرة أو علامات النطق. الأسماء المقبولة:',
			columnDate: 'التاريخ',
			columnNames: (column) => `${column}:`,
			formatDates:
				'التواريخ: 21.09.2026 أو 21/09/2026 أو 21-9-2026. ويُقبل أيضًا التاريخ المكتوب بالسنة أولًا.',
			formatTimes:
				'الأوقات: 19:23 أو 9:23 أو 19:23:00 أو 19h23 أو 7:23 PM. تُرفض الثواني غير 00، فهي تدل غالبًا على عمود منزاح.',
			formatLocal:
				'الأوقات هي أوقات منطقتك الزمنية: لا تحوّل شيئًا، ولا تشغل بالك بتغيير الساعة. العشاء بعد منتصف الليل يُكتب 00:41 في سطر يوم الصلاة، لا في سطر اليوم التالي.',
			formatEncoding:
				'الملفات المحفوظة من Excel أو LibreOffice أو Numbers تُقبل كما هي، بعلامات الاقتباس ونهايات الأسطر والترميز. يظهر الترميز المتعرَّف عليه بعد القراءة.',
			template: 'تنزيل نموذج للأيام الستين القادمة',
			templateHint:
				'النموذج مملوء بالمواقيت المحسوبة لبلدتك، إن كنت قد اخترت بلدة. صحّح في برنامج جداول ما يختلف عن لوحتك، ثم أرسله هنا.',
			fileLabel: 'ملفك',
			fileHint: 'ملف بصيغة CSV، مثل prayer-times-2027.csv.',
			orderLabel: 'إذا كُتبت التواريخ بالأرقام فقط',
			orderHint:
				'في 03/04/2027 قد يكون 3 هو اليوم أو الشهر. اترك «التخمين»: سنطلب منك الاختيار إن لم يسمح الملف بالحسم.',
			orders: {
				auto: 'التخمين (مستحسن)',
				dayMonth: 'اليوم أولًا ثم الشهر (21/09/2026)',
				monthDay: 'الشهر أولًا ثم اليوم (09/21/2026)'
			},
			yearLabel: 'سنة الملف',
			monthLabel: 'شهر الملف',
			yearMonthHint:
				'فقط لملف شهر واحد لا يذكر عمود التواريخ فيه إلا اليوم (1، 2، 3…). مثال: 2026 و9 لشهر سبتمبر 2026.',
			read: 'قراءة الملف',
			readTitle: 'ما قرأناه في هذا الملف:',
			encoding: (encoding, separator) => `الترميز: ${encoding}. الفاصل: «${separator}».`,
			tab: 'مسافة الجدولة',
			units: { K: 'كيلوبايت', M: 'ميغابايت', G: 'غيغابايت' },
			days: (count, first, last) => `عدد الأيام: ${count}، من ${first} إلى ${last}.`,
			daysNone: 'لا يوجد يوم مقروء.',
			missing: (count, list) => `الأيام الناقصة في هذه المدة: ${count}، وهي ${list}`,
			listSeparator: '، ',
			refused: (count) => `الأسطر المرفوضة: ${count}.`,
			ambiguous:
				'يمكن قراءة تواريخ هذا الملف بطريقتين، اليوم ثم الشهر أو الشهر ثم اليوم، وكلتاهما تعطي تقويمًا صحيحًا. لا نخمّن: اختر الترتيب أعلاه، ثم اقرأ الملف من جديد.',
			refusedTitle: 'الأسطر المرفوضة',
			line: (number, reason) => `السطر ${number}: ${reason}`,
			more: (count) => `… و${count} غيرها.`,
			checkTitle: 'للتحقق',
			checkHint: 'ستُستورد هذه الأيام كما هي: قد يكون الفرق تصحيحًا مقصودًا.',
			previewFromToday: 'معاينة: الأيام السبعة القادمة في الملف',
			previewFirst: 'معاينة: الأيام السبعة الأولى في الملف',
			nothingSaved: 'لم يُحفظ شيء بعد. الحفظ يستبدل الأيام التي يغطيها هذا الملف، ولا يمس غيرها.',
			saveDays: (count) =>
				arabic(count, {
					one: 'حفظ هذا اليوم',
					two: 'حفظ هذين اليومين',
					other: `حفظ هذه الأيام (${count})`
				}),
			removeTitle: 'إزالة أيام مستوردة',
			removeHint:
				'الأيام المُزالة تعود إلى الحساب، إن كانت هناك بلدة مختارة. ويحتفظ سجل التعديلات بأثر ذلك.',
			removeFrom: 'أول يوم يُزال',
			removeTo: 'آخر يوم يُزال',
			removeButton: 'إزالة هذه الأيام'
		},
		reasons: {
			empty: 'الملف فارغ.',
			header: 'يجب أن يسمّي السطر الأول الأعمدة: date، fajr، dhuhr، asr، maghrib، isha.',
			badDate: (raw) => `تاريخ غير مقروء: «${raw}».`,
			badTime: (prayer, raw) => `وقت غير مقروء لصلاة ${prayer}: «${raw}».`,
			noSuchDate: 'هذا التاريخ غير موجود في التقويم.',
			order: (later, laterTime, earlier, earlierTime) =>
				`لا يمكن أن يأتي ${later} (${laterTime}) قبل ${earlier} (${earlierTime}).`,
			ishaBeforeMaghrib: (isha, ishaTime, maghrib, maghribTime) =>
				`${isha} (${ishaTime}) يأتي قبل ${maghrib} (${maghribTime}) دون تجاوز منتصف الليل.`,
			duplicate: (date) => `التاريخ ${date} مكرر.`,
			jump: (date, prayer, minutes, before, after) =>
				`${date}: يتغير ${prayer} عن اليوم السابق بمقدار ${arabic(minutes, {
					one: 'دقيقة واحدة',
					two: 'دقيقتين',
					few: `${minutes} دقائق`,
					many: `${minutes} دقيقة`,
					other: `${minutes} دقيقة`
				})} (${before} ثم ${after}).`
		},
		periods: {
			manualTitle: 'مُدخلة يدويًا',
			manualIntro:
				'الفترة هي ما تعرضه على لوحتك لبضعة أسابيع أو للسنة كلها: اسم وتواريخ، ولكل صلاة الوقت المعروض ووقت الإقامة. الخانة الفارغة تترك للملف أو للحساب إعطاء الوقت.',
			iqamaTitle: 'الإقامة (اختياري)',
			iqamaIntro:
				'الإقامة هي الوقت الذي تُقام فيه الصلاة في القاعة. إن كانت لديك إقامة، فاضبطها هنا: الدرس «بعد المغرب» سيتبع الإقامة. تكفي فترة بلا يوم أخير إن لم يتغير شيء خلال السنة.',
			noOverlap: 'لا يجوز أن تتداخل فترتان: أغلق الفترة السابقة قبل أن تفتح غيرها.',
			fridayBefore: 'يوم الجمعة، ',
			fridayLink: 'مواعيد صلاة الجمعة',
			fridayAfter: ' هي التي تحلّ محلّ الظهر.',
			ramadanTitle: 'رمضان:',
			ramadanText:
				'تتقدّم فترة رمضان نحو أحد عشر يومًا في كل سنة. «النسخ للسنة التالية» يحتفظ بتواريخك كما هي، وعليك أنت تعديلها.',
			dates: (from, to) => `من ${from} إلى ${to}`,
			datesOpen: (from) => `ابتداءً من ${from}، حتى إشعار آخر`,
			toReview: 'تواريخ للتحقق',
			toReviewTitle: 'تواريخ نقلتها النسخة سنة كاملة',
			toReviewText:
				'هذه التواريخ آتية من نسخة: الأيام نفسها بعد سنة، لأن مواقيت الصلاة تتبع الشمس لا التقويم الهجري. تحقّق منها وصحّحها عند الحاجة، ثم احفظ، وستختفي هذه الإشارة.',
			colPrayer: 'الصلاة',
			colShown: 'الوقت المعروض',
			colIqama: 'الإقامة',
			iqamaAfter: (minutes) =>
				arabic(minutes, {
					one: 'بعد دقيقة واحدة',
					two: 'بعد دقيقتين',
					few: `بعد ${minutes} دقائق`,
					many: `بعد ${minutes} دقيقة`,
					other: `بعد ${minutes} دقيقة`
				}),
			modify: 'تعديل هذه الفترة',
			copy: 'النسخ للسنة التالية',
			copyName: (name) => `${name} (السنة التالية)`,
			delete: 'حذف',
			add: 'إضافة فترة',
			prefilled: (name) => `قيم «${name}» مملوءة مسبقًا: لا تغيّر إلا ما يتغير.`,
			nameLabel: 'اسم الفترة',
			nameHint: 'مثال: شتاء 2027، أو رمضان 2027.',
			namePlaceholder: 'شتاء 2027',
			fromLabel: 'اليوم الأول',
			toLabel: 'اليوم الأخير',
			toHint: 'اتركه فارغًا لـ«حتى إشعار آخر».',
			shownTitle: 'المواقيت المعروضة',
			shownHint: 'مواقيت لوحتك. الخانة الفارغة تترك للملف أو للحساب إعطاء وقت هذه الصلاة.',
			shownFold: 'استبدال المواقيت المعروضة أيضًا',
			shownFoldHint:
				'فقط إن كانت مواقيت لوحتك تختلف عن مواقيت الملف أو الحساب. الخانة الفارغة تترك القرار للملف أو للحساب، صلاةً بصلاة.',
			iqamaLegend: 'الإقامة',
			iqamaHint:
				'لكل صلاة، وقت ثابت أو عدد من الدقائق بعد الوقت المعروض، لا الاثنان معًا. الدقائق تتبع الشمس وحدها، والوقت الثابت لا يتحرك، ولا حتى عند تغيير الساعة. مثال: المغرب، بعد 10 دقائق.',
			iqamaAt: 'وقت ثابت',
			iqamaOffset: 'أو دقائق بعده',
			iqamaOffsetLabel: (prayer) => `الإقامة: ${prayer}، دقائق بعد الوقت المعروض`,
			preview: 'عرض المعاينة',
			previewTitle: 'معاينة الأيام السبعة القادمة مع هذه الفترة',
			previewTitleLater: 'معاينة الأيام السبعة الأولى من هذه الفترة',
			previewLater: (firstDay) =>
				`تبدأ هذه الفترة في ${firstDay}: لذلك تعرض المعاينة أيامها السبعة الأولى، لا الأيام السبعة القادمة.`,
			previewLaterEmpty: 'لا مواقيت لهذه الأيام السبعة.',
			previewHint: 'لم يُحفظ شيء بعد.',
			save: 'حفظ هذه الفترة'
		},
		served: {
			title: 'ما يراه الجمهور في الأيام السبعة القادمة',
			intro: 'تحت كل وقت، مصدره، والإقامة إن كنت قد ضبطتها: فهي التي تعطي وقت الدرس «بعد المغرب».',
			tableLabel: 'جدول المواقيت التي يراها الجمهور',
			empty: 'لا مواقيت للأيام السبعة القادمة.'
		},
		errors: {
			positionMissing: 'اختر بلدة، أو أدخل خط العرض وخط الطول، لرؤية المعاينة.',
			positionUnreadable: 'يُكتب الموقع بالدرجات العشرية، مثل 47.1368.',
			positionHalf: 'أدخل خط العرض وخط الطول، أو لا تدخل أيًّا منهما.',
			positionOffEarth:
				'هذا الموقع ليس على الأرض: خط العرض من -90 إلى 90، وخط الطول من -180 إلى 180.',
			localityUnknown: 'هذه البلدة ليست في القائمة. ابحث عنها من جديد.',
			fileTooLarge: (size) =>
				`هذا الملف أكبر من الحجم المقبول (${size}). تقويم سنة كاملة أصغر بنحو عشرين مرة: تحقّق من أنه فعلًا ملف CSV.`,
			fileMissing: 'اختر ملفًا.',
			fileEmpty: 'هذا الملف فارغ.',
			nothingToSave: 'لا يوجد ما يُحفظ.',
			periodName: 'أعطِ هذه الفترة اسمًا.',
			periodStart: 'أدخل اليوم الأول من الفترة.',
			periodEndUnreadable: 'اليوم الأخير غير مقروء.',
			periodEndBeforeStart: 'اليوم الأخير يأتي قبل اليوم الأول.',
			iqamaBoth: (prayer) => `لصلاة ${prayer}، اختر وقتًا ثابتًا أو دقائق، لا الاثنين معًا.`,
			periodOverlap:
				'هذه الفترة تتداخل مع فترة أخرى. أغلق أولًا الفترة التي قبلها. الفترة التي لا يوم أخير لها تغطي كل ما يأتي بعدها.',
			periodGone: 'هذه الفترة لم تعد موجودة.',
			leapDay:
				'هذه الفترة لا تغطي إلا 29 فبراير، والسنة التالية ليس فيها هذا اليوم. اختر بنفسك التاريخ الذي يحلّ محلّه.',
			copyOverlap:
				'النسخة ستتداخل مع فترة موجودة. الفترة التي لا يوم أخير لها تغطي كل ما يأتي بعدها: أغلقها أولًا.',
			removeDates: 'أدخل اليوم الأول واليوم الأخير للإزالة.'
		}
	}
};

#!/usr/bin/env node
/**
 * Le **parcours complet** d'une organisation, dans un vrai navigateur, sur l'image de production.
 *
 *     pnpm parcours:test
 *
 * ## Pourquoi ce test existe
 *
 * Les tests de l'application éprouvent chaque route à part, sans navigateur. Aucun ne prouve que
 * les écrans s'enchaînent : que le super-admin d'une instance neuve arrive à enregistrer sa passkey
 * et à créer une organisation, que la personne invitée trouve son invitation et passe par les
 * conditions d'utilisation, que le cours qu'elle saisit apparaît sur la page publique, dans le
 * widget posé sur un autre site et dans le flux agenda, avec la semaine annulée et la séance
 * déplacée. Ce script le fait, dans l'ordre où une organisation le vit, et regarde l'écran à chaque
 * pas.
 *
 * La personne invitée est invitée dans **deux** organisations. Le lien « Choisir une autre
 * organisation » de l'écran d'acceptation, « Changer d’organisation » dans la navigation, et
 * l'acceptation qui vaut pour une organisation et non pour toutes ne se voient qu'à cette condition.
 *
 * Il passe aussi **axe** sur chaque page traversée. Le parcours s'arrête au premier écran qui ne
 * montre pas ce qu'il doit ; axe, lui, relève tout et tranche à la fin : un défaut d'accessibilité
 * n'empêche pas la suite du parcours, et la liste entière vaut mieux qu'un défaut à la fois. Le
 * script échoue s'il reste un problème « serious » ou « critical » ; les autres sont imprimés pour
 * information. Le texte de chaque écran est lu de même en passant, et jugé à la fin (A3, F1).
 *
 * ## Une vérification au moins par retour du chef de projet
 *
 * La règle, depuis l'étape 18 : « Chaque retour du chef de projet devient au moins une vérification du
 * parcours automatique, qui tombe sur l'ancien comportement. » Chaque vérification d'un retour
 * porte sa lettre, et le parcours imprime à la fin un tableau « retour | vérification | verdict ».
 * Un retour sans aucune ligne fait échouer le parcours : on ne perd pas une vérification sans le
 * voir.
 *
 * - A1 : sur « À venir », les options d'une séance sont fermées, « Annuler ou déplacer » n'ouvre que
 *   sa carte, et rien ne s'annule sans l'avoir ouverte, avec ou sans JavaScript.
 * - A2 : une séance se déplace à une date plus tôt que la sienne, toute date à partir d'aujourd'hui,
 *   et le déplacement se lit sur la page publique et dans le flux agenda. Un déplacement qui ne
 *   change ni la date ni l'heure est refusé, avec une phrase. Déplacée le même jour à une autre
 *   heure, une séance porte « nouvelle heure » sur sa carte ; une carte restée ouverte dans un autre
 *   onglet, envoyée après ce déplacement, est refusée, et rien n'est écrit.
 * - A3 : aucune date écrite `2026-09-26` dans le texte d'aucun écran traversé (espace, super-admin,
 *   page publique, widget), et la date des conditions et d'une passkey en `JJ.MM.AAAA`.
 * - B1 : les aides sous les champs clés, et des libellés qui disent ce qu'ils font ; sur un
 *   téléphone, la confirmation avant de supprimer une salle occupée se voit sans défiler ; sans
 *   JavaScript, une session du vendredi se supprime, et l'écran le dit. Le message d'une séance
 *   déplacée le même jour dit un changement d'heure ; dans la carte d'une session du vendredi,
 *   l'aide de « À partir du » est celle d'une modification ; dans Réglages, le nom et la formule
 *   d'accueil tapés au clavier s'enregistrent, même quand la couleur change ensuite.
 * - B2 : l'écran du super-admin, de « Créer une organisation » au lien de connexion de secours ;
 *   l'adresse proposée pendant la frappe, et par le serveur sans JavaScript ; une seconde passkey,
 *   qui a son propre nom et un message juste.
 * - B3 : l'écran Membres dit ce que fait un éditeur, sans lui promettre de supprimer un cours, et ce
 *   qui est réservé au responsable ; une responsable qui se donne le rôle d'éditeur le lit sur
 *   l'écran où elle arrive.
 * - B4 : le résumé du formulaire de cours, sa ligne de description, et ce qui manque, signalé ; une
 *   description écrite sans le titre de sa langue est refusée, avec une phrase qui nomme la langue.
 * - C1 : « D'où viennent vos heures de prière ? », ses trois réponses et l'aperçu de sept jours ;
 *   axe à 390 px de large sur les trois réponses.
 * - C2 : la localité trouvée par son nom et par son NPA, sans service extérieur, avec l'attribution
 *   de swisstopo, et les heures qu'elle donne : celles que `@jadwal/core` calcule pour la position
 *   de la liste, sur l'écran, sur la page publique et dans le flux.
 * - C3 : un cours « avant une prière », des minutes positives à l'écran.
 * - C4 : l'onglet « Prières » de la page publique et du widget, et axe à 390 px de large.
 * - D1 : la page publique, le widget, le flux et une page d'erreur en anglais, sans texte français ;
 *   les messages prêts à coller de Partager, un par langue publiée, le nom de la prière du vendredi
 *   dans chacune, et de même dans ceux de « À venir », le programme de la semaine et un
 *   déplacement.
 * - D2 : l'espace et le super-admin en cinq langues, le choix en haut de chaque écran, retenu pour
 *   le compte, la langue du navigateur au premier passage, celle choisie avant la connexion, et la
 *   copie d'une période nommée dans la langue de l'écran.
 * - D3 : le courriel de connexion et celui d'une invitation dans la langue de l'écran d'où ils
 *   partent.
 * - D4 : les conditions restent en français, précédées d'une phrase dans la langue de la page, en
 *   allemand, en italien, en anglais et en arabe.
 * - E1, E2 : l'agenda selon l'appareil, iPhone (ni Google ni Outlook), Android (le bouton de
 *   Google, puis une issue par un ordinateur, avec l'adresse), ordinateur, et le délai de Google.
 * - F1 : l'exploitant est Voltia ; le nom de personne retiré du dépôt ne s'affiche nulle part.
 * - H2 : l'écran d'acceptation compte une invitation en attente, comme la navigation.
 *
 * Les autres retours de l'étape 18 ne sont pas des écrans. H1 (les rôles dans la base) est éprouvé
 * par les tests d'attaque de `packages/db`. H3 et H4 (la compression et l'en-tête `Via`) tiennent au
 * bloc de site de Caddy, dans `infra/caddy/`, qui a ses propres vérifications. H5 (`queue: max`) est
 * lu dans `.github/workflows/parcours.yml` par `scripts/eprouver-garde-deploiement.mjs`. G et I sont
 * des gestes sur le serveur, relevés dans le rapport de l'étape.
 *
 * ## Le mode relevé
 *
 * Sans variable, le parcours est strict : il s'arrête au premier rouge. Avec
 * `JADWAL_PARCOURS_RELEVE=1`, une vérification d'un retour qui tombe est notée en rouge, et le
 * parcours continue tant que la suite reste possible. C'est ce qui montre, sur l'image d'une
 * version d'avant, que chaque vérification tombe sur l'ancien comportement. Un geste impossible sur
 * l'ancien écran (un champ qui n'existe pas encore) est noté comme tel, « impossible », pour son
 * retour. Les vérifications qui ne sont pas celles d'un retour restent strictes dans les deux
 * modes : le parcours s'arrête quand la suite n'a plus de sens, et le tableau dit alors quels
 * retours n'ont pas été atteints.
 *
 * Un geste impossible arrête son bloc : les vérifications qui le suivent dans ce bloc ne sont pas
 * jouées. Le bilan les compte donc à part : les vérifications jouées, vertes ou rouges, puis les
 * gestes impossibles. Combien de vérifications n'ont jamais tourné se lit en comparant, retour par
 * retour, le tableau du relevé à celui d'un passage strict sur l'image d'aujourd'hui.
 *
 * Les gestes qui ne sont pas l'objet d'une vérification visent les champs par leur `id` ou leur
 * `name`, qui sont le contrat du formulaire avec le serveur, et non par leur libellé : un libellé
 * qu'on récrit ne casse pas le parcours, et les libellés qui comptent sont vérifiés pour eux-mêmes.
 *
 * ## Sur un téléphone, et sans JavaScript
 *
 * Deux passages de plus, vers la fin. L'un à 390 px de large, la largeur d'un téléphone courant :
 * axe sur l'écran des prières et sur l'onglet « Prières » du public, dont les tableaux défilent de
 * côté à cette largeur, et la confirmation d'une salle occupée, qui doit se voir sans défiler.
 * L'autre dans un navigateur sans JavaScript, avec la session de la personne responsable : l'espace
 * doit marcher sans script. Le super-admin passe aussi par un navigateur sans JavaScript, dès
 * l'étape a, pour l'adresse que le serveur propose quand personne ne l'a vue se remplir.
 *
 * ## En dernier, ce qui change l'organisation
 *
 * Trois pas viennent après tous les autres, parce qu'ils changent ce que les autres lisent. La
 * session du vendredi est déplacée le même jour, sur « À venir », d'où un second onglet, ouvert
 * avant, renvoie sa carte restée telle quelle. Le nom et la formule d'accueil sont tapés dans
 * Réglages, puis remis. Une seconde personne responsable rejoint l'organisation, la première se
 * donne le rôle d'éditeur, et la seconde lui rend le sien.
 *
 * ## Les heures de prière attendues
 *
 * Les heures qu'un écran dit « calculées pour la localité » sont comparées à celles que
 * `@jadwal/core` calcule pour la position que la liste des localités donne à cette localité
 * (`apps/web/src/lib/server/localites/localities.csv`), avec la méthode, l'école, la règle et les
 * ajustements que l'écran a enregistrés. Le calcul est celui de l'image, joué dans le conteneur du
 * serveur : le poste n'a pas à construire le paquet, et la CI ne construit rien hors de Docker. Le
 * début d'un cours ancré en est tiré par la règle du service : l'heure de la prière, décalée de ses
 * minutes, arrondie aux cinq minutes supérieures.
 *
 * ## Ce qu'il lui faut
 *
 * Docker, et Chrome ou Chromium déjà installé : aucun navigateur n'est téléchargé. Aucun secret,
 * aucune base existante, aucun port fixe. Les mots de passe sont tirés au hasard et jamais affichés.
 * Le navigateur se présente en français de Suisse (`fr-CH`) : l'espace suit la langue du
 * navigateur au premier passage.
 *
 * ## Variables d'environnement
 *
 * - `JADWAL_PARCOURS_IMAGE` : une image déjà construite. Elle est reprise telle quelle, et laissée
 *   en place à la fin.
 * - `JADWAL_PARCOURS_CONTEXTE` : le dossier d'où construire l'image quand aucune n'est donnée ; par
 *   défaut, la racine du dépôt. Un instantané (`git worktree add <dossier> HEAD`) construit ce qui
 *   est commité, même si l'arbre de travail change pendant ce temps. L'image construite est retirée
 *   à la fin.
 * - `JADWAL_PARCOURS_RELEVE` : `1` pour le mode relevé, décrit plus haut.
 * - `JADWAL_CHROME` : le chemin de Chrome, quand il n'est pas à un emplacement usuel.
 *
 * La date des conditions attendue à l'écran est lue dans le `docs/CONDITIONS.md` du dossier de
 * construction, par la fonction du serveur : une nouvelle version du texte n'oblige pas à retoucher
 * ce script.
 *
 * ## Deux choix qui ne se devinent pas
 *
 * `ORIGIN` vaut `http://localhost:<port>`, et non une adresse IP : WebAuthn refuse une adresse IP
 * comme identifiant de partie de confiance, et SvelteKit refuse un formulaire dont l'origine n'est
 * pas `ORIGIN`. Le port est donc choisi **avant** de lancer le conteneur, et publié à l'identique.
 *
 * axe est injecté par le protocole de débogage (`page.evaluate`), qui n'est pas soumis à la
 * politique de sécurité du contenu. Une balise `<script>` ajoutée à une page publique y serait
 * bloquée, et c'est exactement ce que la politique doit faire.
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { dateDeLaVersion } from '../apps/web/src/lib/conditions/rendu.js';
import { construireImage, MiseEnMarche, racine } from './image-en-marche.mjs';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const IMAGE_DONNEE = process.env['JADWAL_PARCOURS_IMAGE']?.trim() ?? '';
const CONTEXTE = process.env['JADWAL_PARCOURS_CONTEXTE']?.trim() || racine;
const RELEVE = process.env['JADWAL_PARCOURS_RELEVE']?.trim() === '1';

const marque = randomUUID().slice(0, 8);
const IMAGE = IMAGE_DONNEE || `jadwal-parcours:${marque}`;
const marche = new MiseEnMarche(IMAGE, 'jadwal-parcours', marque);

/**
 * « 26.09.2026 » : la date du texte que l'image a reçu, lue comme le serveur la lit. Celui du
 * dossier de construction, ou celui du dépôt pour une image donnée.
 */
const TEXTE_DES_CONDITIONS = [CONTEXTE, racine]
	.map((dossier) => join(dossier, 'docs', 'CONDITIONS.md'))
	.find((fichier) => existsSync(fichier));
const DATE_DES_CONDITIONS = dateDeLaVersion(readFileSync(String(TEXTE_DES_CONDITIONS), 'utf8'));
/** Le texte compte dix données personnelles, en une seule liste numérotée (`docs/CONDITIONS.md`). */
const DONNEES_PERSONNELLES = 10;
/** L'exploitant, tel que les conditions le nomment depuis l'étape 18 (retour F1). */
const EXPLOITANT = 'Voltia';
/**
 * L'empreinte SHA-256 du nom de personne que le retour F1 a retiré du dépôt, écrit en minuscules,
 * ses trois mots séparés par une espace. Le nom lui-même n'est écrit nulle part, pas même ici : on
 * compare l'empreinte de chaque suite de trois mots lus à l'écran.
 */
const EMPREINTE_DU_NOM_RETIRE = 'empreinte-retiree-de-l-historique';

/** La langue que le navigateur annonce : celle d'une personne de Suisse romande. */
const LANGUE_DU_NAVIGATEUR = 'fr-CH';

/** Ce que le parcours saisit. Des adresses en `example.test`, qui ne mènent nulle part. */
const SUPER_ADMIN = 'super-admin@example.test';
const RESPONSABLE = 'responsable@example.test';
/** Une adresse sans compte, invitée depuis un écran en allemand (retour D3). */
const INVITEE_EN_ALLEMAND = 'eingeladen@example.test';
const ORGANISATION = { nom: 'Centre du Parcours', slug: 'centre-parcours' };
/** L'adresse que l'écran du super-admin propose pour ce nom, avant qu'on la change (retour B2). */
const ADRESSE_PROPOSEE = 'centre-du-parcours';
/** La seconde organisation de la personne invitée, où elle est éditrice. */
const VOISINE = { nom: 'Association voisine', slug: 'association-voisine' };
const FUSEAU = 'Europe/Zurich';
const SALLE = 'Grande salle';
const COURS_1 = { fr: 'Lecture du Coran', ar: 'قراءة القرآن' };
const COURS_2 = 'Arabe pour adultes';
const COURS_ANCRE = 'Tafsir du soir';
/** Un second cours ancré, à l'heure même de la prière : le décalage nul a sa propre phrase. */
const COURS_SANS_DECALAGE = 'Cercle de lecture';
/** Un cours placé avant une prière, avec des minutes positives (retour C3). */
const COURS_AVANT = { titre: 'Hifz avant Maghrib', minutes: 10 };
/**
 * La localité du parcours, cherchée par son nom puis par son NPA (retour C2) ; `liste`, le début de
 * sa ligne dans la liste des localités, d'où vient sa position.
 */
const LOCALITE = {
	nom: 'Bienne',
	npa: '2502',
	libelle: '2502 Biel/Bienne (BE)',
	liste: '2502;Biel/Bienne;'
};
/** La liste des localités que le serveur embarque, lue dans le dépôt. */
const LISTE_DES_LOCALITES = join(
	racine,
	'apps',
	'web',
	'src',
	'lib',
	'server',
	'localites',
	'localities.csv'
);
/** Les cinq prières, dans l'ordre des colonnes de chaque tableau. */
const PRIERES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
/** La session du vendredi, qui s'affiche dans l'onglet « Prières » (retour C4). */
const VENDREDI = { debut: '12:30', fin: '13:15' };
/** Une seconde session, ajoutée puis supprimée dans un navigateur sans JavaScript (retour B1). */
const SECONDE_SESSION = { debut: '13:40', fin: '14:20' };
/** La nouvelle heure de la session du vendredi, déplacée le même jour sur « À venir » (A2, B1). */
const HEURE_DU_VENDREDI_DEPLACE = '13:00';
/**
 * Les phrases lues à la lettre dans les écrans corrigés depuis la relecture du lot 4 : ce que dit
 * l'écran du vendredi après une suppression, et l'aide de « À partir du » dans la carte d'une
 * session (`friday.ts`) ; le refus d'une carte restée ouverte sur « À venir » (`upcoming.ts`) ; ce
 * que lit une responsable qui s'est donné le rôle d'éditeur (`common.ts`).
 */
const SESSION_SUPPRIMEE = 'La session est supprimée.';
const AIDE_DE_LA_MODIFICATION =
	'La session a lieu chaque vendredi à partir de cette date. Changez cette date seulement pour corriger une erreur.';
const SEANCE_CHANGEE =
	'Cette séance a changé depuis l’ouverture de la page : elle a déjà été annulée ou déplacée. Rien n’a été enregistré. Le programme ci-dessous est à jour.';
const DEVENUE_EDITRICE =
	'Vous avez maintenant le rôle d’éditeur. Les écrans réservés aux responsables, comme Membres et Réglages, ne vous sont plus ouverts. Pour les retrouver, demandez à une autre personne responsable de vous redonner le rôle de responsable.';
/**
 * Une description écrite en allemand, le titre allemand laissé vide (retour B4), et le refus qui
 * nomme la langue (`course-form.ts`).
 */
const DESCRIPTION_SANS_TITRE = {
	texte: 'Kommentierte Lesung.',
	refus:
		'La description en allemand ne peut pas être publiée sans titre dans la même langue. Écrivez aussi le titre en allemand, ou effacez cette description.'
};
/** Ce qui est tapé au clavier dans Réglages, puis la couleur choisie ensuite (retour B1). */
const SAISIE_AU_CLAVIER = {
	nom: 'Centre du Parcours, nom tapé',
	accueil: 'Salam au clavier',
	couleur: '#b91c1c'
};
/**
 * Une seconde personne responsable de l'organisation : sans elle, la base refuse qu'une
 * responsable se donne le rôle d'éditeur (retour B3).
 */
const SECONDE_RESPONSABLE = 'deuxieme.personne@example.test';
/** La description que reçoit le premier cours le temps de lire le résumé (retour B4). */
const DESCRIPTION = 'Pour les enfants de 7 à 12 ans.';
/**
 * Une organisation créée sans JavaScript, l'adresse laissée vide : le serveur la propose (retour
 * B2), comme l'écran l'aurait fait pendant la frappe.
 */
const SANS_SCRIPT = { nom: 'École du Lac', adresse: 'ecole-du-lac' };
/** Une période préparée à l'avance, puis copiée depuis l'écran en allemand (retour D2). */
const PERIODE = { nom: 'Winter', copie: 'Winter (nächstes Jahr)' };
/** La fenêtre d'un téléphone courant, et celle que playwright donne par défaut. */
const TELEPHONE = { width: 390, height: 844 };
const ECRAN = { width: 1280, height: 720 };
const CHIFFRES_ORIENTAUX = /[\u0660-\u0669\u06F0-\u06F9]/g;
/** Une date telle que la base l'écrit, qui ne doit se lire sur aucun écran (retour A3). */
const DATE_ISO = /(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g;
/** La boîte aux lettres du serveur, dans le conteneur : `MAIL_TRANSPORT=file`. */
const BOITE = '/tmp/courriels';
/** La hauteur que le widget pose avant la première mesure (`packages/widget/src/element.ts`). */
const HAUTEUR_INITIALE_DU_CADRE = 320;
/** Les cinq langues, dans l'ordre du choix en haut de chaque écran (`apps/web/src/lib/i18n.ts`). */
const LANGUES = ['fr', 'de', 'it', 'en', 'ar'];
/** Chaque langue écrite dans sa propre langue, comme le choix la montre. */
const NOM_DE_LANGUE = {
	fr: 'Français',
	de: 'Deutsch',
	it: 'Italiano',
	en: 'English',
	ar: 'العربية'
};
/**
 * Ce que la page publique écrit, langue par langue (`apps/web/src/lib/i18n.ts`) : le lien du pied,
 * l'annonce du nouvel onglet que ce lien porte pour les lecteurs d'écran, le début des deux
 * mentions d'une séance déplacée, au départ et à l'arrivée, et la page d'une organisation inconnue.
 * L'arabe est celui que le chef de projet a relu.
 */
const TEXTES_PUBLICS = {
	fr: {
		conditions: 'Conditions d’utilisation',
		nouvelOnglet: 's’ouvre dans un nouvel onglet',
		depart: 'Déplacé au ',
		arrivee: 'Initialement le ',
		introuvable: { titre: 'Page introuvable', phrase: 'Vérifiez l’adresse.' }
	},
	de: {
		conditions: 'Nutzungsbedingungen',
		nouvelOnglet: 'öffnet sich in einem neuen Tab',
		depart: 'Verschoben auf ',
		arrivee: 'Ursprünglich am '
	},
	it: {
		conditions: 'Condizioni d’uso',
		nouvelOnglet: 'si apre in una nuova scheda',
		depart: 'Spostato al ',
		arrivee: 'Inizialmente il '
	},
	en: {
		conditions: 'Terms of use',
		nouvelOnglet: 'opens in a new tab',
		depart: 'Moved to ',
		arrivee: 'Originally on ',
		introuvable: { titre: 'Page not found', phrase: 'Please check the address.' }
	},
	ar: {
		conditions: 'شروط الاستخدام',
		nouvelOnglet: 'يُفتح في علامة تبويب جديدة',
		depart: 'نُقل إلى ',
		arrivee: 'كان مقرّرًا في ',
		introuvable: { titre: 'الصفحة غير موجودة', phrase: 'تحقّق من العنوان.' }
	}
};
/**
 * La phrase en tête des conditions, dans une autre langue que le français (retour D4,
 * `apps/web/src/lib/i18n/terms.ts`).
 */
const CONDITIONS_EN_FRANCAIS_SEULEMENT = {
	de: 'Diesen Text gibt es vorerst nur auf Französisch.',
	it: 'Per ora questo testo esiste solo in francese.',
	en: 'For now, this text only exists in French.',
	ar: 'هذا النص متوفر بالفرنسية فقط في الوقت الحالي.'
};
/**
 * Le nom que le service propose à une session du vendredi, dans chaque langue
 * (`apps/web/src/lib/i18n.ts`) : une session qui le garde le prend dans la langue de qui la lit
 * (retour D1).
 */
const PRIERE_DU_VENDREDI = {
	fr: 'Prière du vendredi',
	de: 'Freitagsgebet',
	it: 'Preghiera del venerdì',
	en: 'Friday prayer',
	ar: 'صلاة الجمعة'
};
/**
 * Le nom accessible d'un lien qui ouvre un nouvel onglet : son texte visible, puis l'annonce entre
 * parenthèses, que seuls les lecteurs d'écran reçoivent (technique G201 des WCAG). Le widget dit la
 * même annonce que la page (`packages/widget/src/element.ts`).
 */
const avecNouvelOnglet = (texte, langue) => `${texte} (${TEXTES_PUBLICS[langue].nouvelOnglet})`;
/** Le lien du widget vers la page publique, sous son cadre, selon la langue demandée au widget. */
const LIEN_DU_WIDGET = { fr: 'Voir le programme complet', en: 'See the full programme' };
const CHANGER = 'Changer d’organisation';
/**
 * Les deux cours ancrés sur le maghrib : leur jour (dans quatre et cinq jours), leurs minutes après
 * la prière, et leur libellé. La page écrit le libellé puis le début, tiré du maghrib calculé,
 * « 15 min après Maghrib (19:30) » ; le flux, le libellé seul. 15 minutes après le maghrib, puis à
 * l'heure même : au décalage nul, le flux dit la phrase de la page, « Après Maghrib », et non « À
 * Maghrib » comme avant l'étape 17. Le flux anglais dit la phrase de la page anglaise (retour D1).
 */
const ANCRAGES = [
	{
		titre: COURS_ANCRE,
		dans: 4,
		minutes: 15,
		libelle: {
			fr: '15 min après Maghrib',
			en: '15 min after Maghrib',
			ar: 'بعد المغرب بـ15 دقيقة'
		}
	},
	{
		titre: COURS_SANS_DECALAGE,
		dans: 5,
		minutes: 0,
		libelle: { fr: 'Après Maghrib', en: 'After Maghrib', ar: 'بعد المغرب' }
	}
];
/** Une organisation qui n'existe pas. */
const INCONNUE = 'organisation-inconnue';
/**
 * Des agents d'appareils réels. Le serveur lit la plateforme dans `Sec-CH-UA-Platform`, sinon dans
 * `User-Agent` : un agent imposé à Chrome l'emporte sur sa vraie plateforme, mesuré à l'étape 18.
 */
const APPAREILS = {
	iphone:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
	android:
		'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
	windows:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
};

// ---------------------------------------------------------------------------------------------
// Ce qui se dit, ce qui se note, et ce qui arrête tout
// ---------------------------------------------------------------------------------------------

class Echec extends Error {}

let verifications = 0;

/** Les retours du chef de projet que le parcours vérifie, dans l'ordre du tableau final. */
const RETOURS = [
	'A1',
	'A2',
	'A3',
	'B1',
	'B2',
	'B3',
	'B4',
	'C1',
	'C2',
	'C3',
	'C4',
	'D1',
	'D2',
	'D3',
	'D4',
	'E1',
	'E2',
	'F1',
	'H2'
];
/**
 * Chaque vérification d'un retour : `{ retour, quoi, ok, detail }`, et `impossible` pour un geste
 * que l'écran n'offre pas, qui a arrêté son bloc.
 */
const releve = [];
/** La lettre du retour dont le bloc est en cours, ou `null` hors de tout bloc. */
let retourCourant = null;

/**
 * Une vérification du parcours. Hors d'un retour, ou en mode strict, le premier échec arrête tout :
 * la suite n'aurait aucun sens. Dans le bloc d'un retour, en mode relevé, l'échec est noté et le
 * parcours continue.
 */
function verifier(quoi, condition, detail = '') {
	verifications += 1;
	const lettre = retourCourant ? `[${retourCourant}] ` : '';
	process.stdout.write(
		`  ${condition ? 'ok  ' : 'NON '} ${lettre}${quoi}${detail ? ` (${detail})` : ''}\n`
	);
	if (retourCourant) releve.push({ retour: retourCourant, quoi, ok: Boolean(condition), detail });
	if (!condition && !(RELEVE && retourCourant)) {
		throw new Echec(detail ? `${quoi} : ${detail}` : quoi);
	}
	return Boolean(condition);
}

/**
 * Le bloc des vérifications d'un retour. En mode relevé, un geste impossible (un champ que l'écran
 * n'a pas) est noté en rouge pour ce retour, et le parcours reprend après le bloc ; en mode strict,
 * il arrête tout, comme le reste.
 */
async function retour(lettre, corps) {
	// Sans lettre, le bloc n'est celui d'aucun retour : ses vérifications restent strictes.
	if (!lettre) return corps();
	const avant = retourCourant;
	retourCourant = lettre;
	try {
		return await corps();
	} catch (erreur) {
		if (!RELEVE) throw erreur;
		const message = (erreur instanceof Error ? erreur.message : String(erreur)).split('\n')[0];
		// Un geste impossible n'est pas une vérification : il n'est pas compté avec elles.
		releve.push({
			retour: lettre,
			quoi: 'geste impossible sur cet écran',
			ok: false,
			impossible: true,
			detail: message
		});
		process.stdout.write(`  NON  [${lettre}] geste impossible sur cet écran (${message})\n`);
		return undefined;
	} finally {
		retourCourant = avant;
	}
}

function etape(titre) {
	process.stdout.write(`\n${titre}\n`);
}

const attendre = (millisecondes) => new Promise((resolue) => setTimeout(resolue, millisecondes));

// ---------------------------------------------------------------------------------------------
// axe
// ---------------------------------------------------------------------------------------------

/** Tout ce qu'axe a trouvé : `{ page, regle, impact, cible, aide }`. */
const trouvaillesAxe = [];
const pagesAuditees = [];
const GRAVES = new Set(['serious', 'critical']);

/**
 * Passe axe sur une page ou sur un cadre. `iframes: false` pour une page qui contient un cadre
 * d'une autre origine : axe attendrait une minute une réponse que le cadre, sans axe, ne donnera
 * jamais. Le cadre est audité à part.
 */
async function auditer(cible, nom, { iframes = true } = {}) {
	// Une page atteinte par un lien de SvelteKit garde le `<title>` de la précédente quand elle n'en
	// pose pas : axe n'y verrait rien. On la recharge donc d'abord, en GET, sans l'action d'un
	// formulaire qu'un rechargement renverrait. Mesuré : l'écran Membres, sans titre, portait celui
	// de l'accueil.
	if (typeof cible.mainFrame === 'function' && cible.url().startsWith(ORIGINE)) {
		const adresse = new URL(cible.url());
		await ouvrir(
			cible,
			adresse.search.startsWith('?/') ? adresse.pathname : adresse.pathname + adresse.search
		);
	}
	await cible.evaluate(AXE);
	const violations = await cible.evaluate(async (avecCadres) => {
		const resultat = await window.axe.run(document, {
			resultTypes: ['violations'],
			iframes: avecCadres
		});
		return resultat.violations.map((violation) => ({
			regle: violation.id,
			impact: violation.impact ?? 'inconnu',
			aide: violation.help,
			cibles: violation.nodes.map((noeud) =>
				noeud.target
					.map((morceau) => (Array.isArray(morceau) ? morceau.join(' >>> ') : morceau))
					.join(' ')
			)
		}));
	}, iframes);
	pagesAuditees.push(nom);
	let graves = 0;
	let autres = 0;
	const lignes = [];
	for (const violation of violations) {
		for (const cibleTrouvee of violation.cibles) {
			trouvaillesAxe.push({ page: nom, ...violation, cible: cibleTrouvee });
			if (GRAVES.has(violation.impact)) graves += 1;
			else autres += 1;
			lignes.push(`         [${violation.impact}] ${violation.regle} : ${cibleTrouvee}`);
		}
	}
	const resume =
		graves === 0 && autres === 0
			? 'rien à signaler'
			: `${graves} sérieux ou critique(s), ${autres} pour information`;
	process.stdout.write(`  ${graves === 0 ? 'ok  ' : 'NON '} axe : ${nom} (${resume})\n`);
	for (const ligne of lignes) process.stdout.write(`${ligne}\n`);
}

// ---------------------------------------------------------------------------------------------
// Le poste : Chrome, un port libre, les dates
// ---------------------------------------------------------------------------------------------

/** Chrome, là où il se trouve : la même recherche que `conditions-pdf.mjs`. */
function chrome() {
	const declare = process.env['JADWAL_CHROME'];
	if (declare) {
		if (!existsSync(declare))
			throw new Error(`JADWAL_CHROME pointe sur un fichier absent : ${declare}`);
		return declare;
	}
	const candidats = [
		'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
		'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'/usr/bin/google-chrome',
		'/usr/bin/chromium',
		'/usr/bin/chromium-browser'
	];
	const trouve = candidats.find((candidat) => existsSync(candidat));
	if (!trouve) {
		throw new Error(
			'Chrome ou Chromium est introuvable. Poser JADWAL_CHROME sur le chemin de l’exécutable.'
		);
	}
	return trouve;
}

/** Un port libre de la boucle locale, demandé au système puis rendu aussitôt. */
function portLibre() {
	return new Promise((resolue, rejetee) => {
		const sonde = createNetServer();
		sonde.on('error', rejetee);
		sonde.listen(0, '127.0.0.1', () => {
			const { port } = /** @type {import('node:net').AddressInfo} */ (sonde.address());
			sonde.close(() => resolue(port));
		});
	});
}

/** La date du jour dans le fuseau de l'organisation, sans dépendre de celui du poste. */
function aujourdhui() {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: FUSEAU,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date());
}

/** Midi UTC : aucun changement d'heure ne fait changer de jour. */
function plusJours(iso, jours) {
	const date = new Date(`${iso}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + jours);
	return date.toISOString().slice(0, 10);
}

/** 1 pour lundi, 7 pour dimanche, comme le formulaire des cours. */
function jourDeSemaine(iso) {
	const jour = new Date(`${iso}T12:00:00Z`).getUTCDay();
	return jour === 0 ? 7 : jour;
}

const compacte = (iso) => iso.replaceAll('-', '');

/** « 26.09.2026 » : une date comme la Suisse l'écrit, et comme chaque écran doit l'écrire (A3). */
const dateSuisse = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** La date `AAAA-MM-JJ` d'un texte qui l'écrit `JJ.MM.AAAA`, « samedi 26.09.2026 », ou `''`. */
function isoDuTexte(texte) {
	const trouvee = /(\d{2})\.(\d{2})\.(\d{4})/.exec(texte);
	return trouvee ? `${trouvee[3]}-${trouvee[2]}-${trouvee[1]}` : '';
}

/**
 * Le début d'un cours ancré sur une prière : l'heure de la prière, décalée de ses minutes, puis
 * arrondie aux cinq minutes supérieures, la règle de `roundUpToFiveMinutes`
 * (`packages/core/src/dates.ts`). « 19:13 » et 15 minutes donnent « 19:30 ».
 */
function debutAncre(priere, minutes) {
	const [h, m] = priere.split(':').map(Number);
	const total = Math.ceil(((h ?? 0) * 60 + (m ?? 0) + minutes) / 5) * 5;
	return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------------------------
// Le serveur : ses courriels, son journal
// ---------------------------------------------------------------------------------------------

/** Le séparateur des courriels dans la lecture groupée : un caractère qu'aucun JSON ne contient. */
const SEPARATEUR = '\u001e';

/**
 * Les courriels écrits par le serveur, lus dans le conteneur, du plus ancien au plus récent. Une
 * seule commande pour toute la boîte : un `docker exec` par fichier coûtait une à deux secondes
 * chacun, et l'attente d'un courriel relisait toute la boîte à chaque tour.
 */
function courriels() {
	const lecture = spawnSync(
		'docker',
		[
			'exec',
			marche.serveur,
			'sh',
			'-c',
			`for f in ${BOITE}/*.json; do [ -f "$f" ] && cat "$f" && printf '${SEPARATEUR}'; done`
		],
		{ encoding: 'utf8' }
	);
	if (lecture.status !== 0) return [];
	return lecture.stdout
		.split(SEPARATEUR)
		.filter((morceau) => morceau.trim() !== '')
		.map((morceau) => JSON.parse(morceau))
		.sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.sequence - b.sequence);
}

/** Le premier courriel pour cette adresse dont le sujet correspond, attendu dix secondes au plus. */
async function attendreCourriel(pour, sujet) {
	const limite = Date.now() + 10000;
	do {
		const trouve = courriels().find(
			(courriel) => courriel.to === pour && sujet.test(courriel.subject)
		);
		if (trouve) return trouve;
		await attendre(250);
	} while (Date.now() < limite);
	return undefined;
}

/** Les sujets reçus par une adresse : ce qu'on imprime quand le courriel attendu manque. */
const sujetsRecus = (pour) =>
	courriels()
		.filter((courriel) => courriel.to === pour)
		.map((courriel) => courriel.subject)
		.join(' | ');

/** Le lien de connexion d'un courriel. Il n'est jamais affiché : c'est un jeton. */
function lienDeConnexion(courriel) {
	return (courriel?.text ?? '')
		.split(/\s+/)
		.find((mot) => mot.startsWith('http') && mot.includes('token='));
}

/** La langue écrite sur la balise `<html>` du courriel, que les clients de messagerie lisent. */
const langueDuCourriel = (courriel) =>
	/<html\b[^>]*\blang="([^"]+)"/i.exec(courriel?.html ?? '')?.[1];

function dernieresLignesDuServeur(combien = 30) {
	return marche.journal().trim().split('\n').slice(-combien);
}

/** Le lien de connexion d'un courriel arrivé après les `avant` premiers, attendu dix secondes. */
async function nouveauLienDeConnexion(pour, avant) {
	for (let essai = 0; essai < 40; essai += 1) {
		const lien = lienDeConnexion(
			courriels()
				.slice(avant)
				.find((courriel) => courriel.to === pour)
		);
		if (lien) return lien;
		await attendre(250);
	}
	return undefined;
}

/** La position que la liste des localités donne à la localité du parcours (retour C2). */
function positionDeLaListe() {
	const ligne = readFileSync(LISTE_DES_LOCALITES, 'utf8')
		.split(/\r?\n/)
		.find((une) => une.startsWith(LOCALITE.liste));
	const champs = (ligne ?? '').split(';');
	return { latitude: Number(champs[4]), longitude: Number(champs[5]) };
}

/**
 * Les heures que `@jadwal/core` calcule pour une position et des réglages, date par date : le calcul
 * de l'image elle-même, joué dans le conteneur du serveur (voir l'en-tête). Rend
 * `{ [date]: { fajr, dhuhr, asr, maghrib, isha } }`.
 */
function heuresCalculees(dates, reglage) {
	const code = [
		"const { computePrayerDay } = await import('@jadwal/core/prayer');",
		'const [dates, reglage] = JSON.parse(process.argv[1]);',
		'const jours = dates.map((date) => [date, computePrayerDay(date, reglage) ?? null]);',
		'process.stdout.write(JSON.stringify(Object.fromEntries(jours)));'
	].join('\n');
	const passage = spawnSync(
		'docker',
		[
			'exec',
			marche.serveur,
			'node',
			'--input-type=module',
			'-e',
			code,
			JSON.stringify([dates, reglage])
		],
		{ encoding: 'utf8' }
	);
	if (passage.status !== 0) {
		const raison = (passage.stderr ?? '').trim().split('\n').pop();
		throw new Error(`le calcul des heures dans le conteneur a échoué : ${raison}`);
	}
	return JSON.parse(passage.stdout);
}

// ---------------------------------------------------------------------------------------------
// Ce que chaque écran montre : ses dates, ses noms (retours A3 et F1)
// ---------------------------------------------------------------------------------------------

/** Chaque écran lu pendant le parcours : `adresse → { dates, nomRetire }`. */
const ecransLus = new Map();

/** Vrai si le texte contient le nom de personne retiré du dépôt (voir `EMPREINTE_DU_NOM_RETIRE`). */
function nommeLaPersonneRetiree(texte) {
	const mots = texte
		.toLowerCase()
		.split(/[^\p{L}]+/u)
		.filter(Boolean);
	for (let index = 0; index + 2 < mots.length; index += 1) {
		const suite = mots.slice(index, index + 3).join(' ');
		if (createHash('sha256').update(suite).digest('hex') === EMPREINTE_DU_NOM_RETIRE) return true;
	}
	return false;
}

/**
 * Le texte qu'une personne lit sur une page ou dans un cadre : le titre de l'onglet, le texte du
 * corps, et le contenu des zones de texte, comme les messages prêts à copier. La valeur technique
 * d'un champ de date n'en fait pas partie : le navigateur l'affiche à sa façon.
 */
async function texteLu(cible) {
	return cible.evaluate(() => {
		const morceaux = [document.title, document.body?.innerText ?? ''];
		for (const zone of document.querySelectorAll('textarea')) morceaux.push(zone.value);
		return morceaux.join('\n');
	});
}

/** Relève ce qu'un écran du service montre, une fois chargé. Les pages d'un autre site, non. */
async function lireLEcran(cible) {
	const adresse = cible.url();
	if (!ORIGINE || !adresse.startsWith(ORIGINE)) return;
	const texte = await texteLu(cible).catch(() => '');
	const dates = [...new Set(texte.match(DATE_ISO) ?? [])];
	const cle = new URL(adresse).pathname + new URL(adresse).search;
	const deja = ecransLus.get(cle);
	ecransLus.set(cle, {
		dates: [...new Set([...(deja?.dates ?? []), ...dates])],
		nomRetire: Boolean(deja?.nomRetire) || nommeLaPersonneRetiree(texte)
	});
}

/**
 * Le bilan de tous les écrans lus, à la fin du parcours, comme celui d'axe : aucune date
 * `AAAA-MM-JJ` (A3), et nulle part le nom retiré du dépôt (F1). Chaque écran fautif est nommé,
 * avec ce qu'il montre.
 */
async function bilanDesEcrans() {
	etape('Ce que montrent tous les écrans traversés');
	const lus = [...ecransLus];
	const avecDates = lus.filter(([, lu]) => lu.dates.length > 0);
	const avecNom = lus.filter(([, lu]) => lu.nomRetire);
	await retour('A3', async () => {
		verifier(
			`aucune date écrite AAAA-MM-JJ sur les ${lus.length} écrans traversés (espace, super-admin, page publique, widget)`,
			lus.length > 0 && avecDates.length === 0,
			avecDates
				.slice(0, 8)
				.map(([cle, lu]) => `${cle} : ${lu.dates.slice(0, 3).join(', ')}`)
				.join(' ; ')
		);
	});
	await retour('F1', async () => {
		verifier(
			`aucun des ${lus.length} écrans traversés ne nomme la personne retirée du dépôt`,
			lus.length > 0 && avecNom.length === 0,
			avecNom
				.slice(0, 8)
				.map(([cle]) => cle)
				.join(' ; ')
		);
	});
}

// ---------------------------------------------------------------------------------------------
// Le navigateur
// ---------------------------------------------------------------------------------------------

let ORIGINE = '';
let PORT = 0;
/** Vrai une fois le serveur lancé : avant, il n'a pas de journal à recopier. */
let serveurLance = false;
/** La page que le parcours regarde en ce moment : c'est elle qu'on décrit en cas d'échec. */
let pageCourante;

const chemin = (page) => new URL(page.url()).pathname;

/** Un contexte neuf, qui se présente comme un navigateur réglé en français de Suisse. */
async function nouveauContexte(navigateur, options = {}) {
	const contexte = await navigateur.newContext({ locale: LANGUE_DU_NAVIGATEUR, ...options });
	contexte.setDefaultTimeout(15000);
	return contexte;
}

async function ouvrir(page, adresse) {
	pageCourante = page;
	const reponse = await page.goto(adresse.startsWith('http') ? adresse : `${ORIGINE}${adresse}`);
	await page.waitForLoadState('networkidle');
	await lireLEcran(page);
	return reponse;
}

/** Un bouton qui envoie un formulaire : la page se recharge, et on attend qu'elle ait fini. */
async function envoyer(page, bouton) {
	pageCourante = page;
	await Promise.all([page.waitForEvent('load'), bouton.click()]);
	await page.waitForLoadState('networkidle');
	await lireLEcran(page);
}

/**
 * Un lien de la navigation des responsables, visé par l'écran où il mène : SvelteKit change de page
 * sans la recharger. Le libellé du lien est vérifié à part (retour B1).
 */
async function naviguer(page, attendu) {
	pageCourante = page;
	await page.locator(`nav a[href="${attendu}"]`).first().click();
	await page.waitForURL((adresse) => adresse.pathname === attendu);
	await page.waitForLoadState('networkidle');
	await lireLEcran(page);
}

/**
 * Un lien, qu'il mène à une page rendue par le client ou à une page sans JavaScript (`csr = false`,
 * comme `/conditions`), que SvelteKit charge alors en entier : on attend l'adresse, pas l'événement.
 */
async function suivre(page, lien, attendu) {
	pageCourante = page;
	await lien.click();
	await page.waitForURL((adresse) => adresse.pathname === attendu);
	await page.waitForLoadState('networkidle');
	await lireLEcran(page);
}

async function titre(page) {
	return ((await page.locator('h1').first().textContent()) ?? '').trim();
}

/** Le texte d'un élément, espaces fines et insécables comprises ramenées à une espace simple. */
async function texteDe(locator) {
	return ((await locator.first().textContent()) ?? '').replace(/\s+/g, ' ').trim();
}

/** La valeur d'un attribut de `<html>` : `lang` ou `dir`. */
const racineDit = (page, attribut) => page.locator('html').getAttribute(attribut);

/**
 * La description accessible d'un champ : le texte des éléments que son `aria-describedby` désigne,
 * celui qu'un lecteur d'écran lit après son nom.
 */
async function descriptionDe(champ) {
	return champ.evaluate((element) =>
		(element.getAttribute('aria-describedby') ?? '')
			.split(/\s+/)
			.filter(Boolean)
			.map((id) => document.getElementById(id)?.textContent ?? '')
			.join(' ')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

/**
 * L'adresse d'un lien une fois résolue. SvelteKit écrit ses liens en relatif (`../conditions`
 * depuis `/m/<slug>/ar`) : c'est la propriété `href`, pas l'attribut, qui dit où l'on arrive.
 */
async function cheminDuLien(lien) {
	return lien.evaluate((a) => new URL(/** @type {HTMLAnchorElement} */ (a).href).pathname);
}

/** La navigation de l'espace des responsables : absente tant que les conditions attendent. */
const navigationDeLEspace = (page) =>
	page.getByRole('navigation', { name: 'Espace des responsables' });

/**
 * « Changer d’organisation » dans la navigation : pour qui est membre de plusieurs organisations,
 * ou d'une seule avec une invitation qui attend encore.
 */
const lienChanger = (page) =>
	navigationDeLEspace(page).getByRole('link', { name: CHANGER, exact: true });

/** Le formulaire de connexion : l'adresse, puis le bouton, visés par le formulaire lui-même. */
async function demanderUnLien(page, adresse) {
	await page.locator('main input[type="email"]').fill(adresse);
	await envoyer(page, page.locator('main form[method="post"] button[type="submit"]').first());
}

/** Le choix de la langue en haut de l'écran (retour D2) : un formulaire, qui marche sans script. */
const choixDeLaLangue = (page) => page.locator('header form[action="/langue"]');

/** Choisir une langue dans ce choix : la page se recharge dans cette langue. */
async function choisirLaLangue(page, langue) {
	await envoyer(page, choixDeLaLangue(page).locator(`button[value="${langue}"]`));
}

/**
 * Ce que le choix de la langue montre sur un écran : les cinq langues, chacune écrite dans sa
 * langue et marquée comme telle, et la langue de l'écran désignée comme choisie.
 */
async function choixPresent(page, langue) {
	const boutons = choixDeLaLangue(page).locator('button[name="language"]');
	const vus = [];
	for (let index = 0; index < (await boutons.count()); index += 1) {
		const bouton = boutons.nth(index);
		vus.push({
			valeur: await bouton.getAttribute('value'),
			lang: await bouton.getAttribute('lang'),
			texte: (await bouton.textContent())?.trim(),
			courant: (await bouton.getAttribute('aria-current')) === 'true'
		});
	}
	return (
		vus.length === LANGUES.length &&
		vus.every(
			(vu, index) =>
				vu.valeur === LANGUES[index] &&
				vu.lang === LANGUES[index] &&
				vu.texte === NOM_DE_LANGUE[LANGUES[index]] &&
				vu.courant === (vu.valeur === langue)
		)
	);
}

/**
 * Chaque morceau de texte d'une page ou d'un cadre : le contenu de chaque nœud de texte, et les
 * attributs qu'un lecteur d'écran annonce (`aria-label`, `title`, `placeholder`, `alt`). Dans une
 * page qui n'est pas en français, un bloc marqué `lang="fr"` est écarté : ce sont les conditions,
 * ou un titre de cours écrit en français, qui ont le droit de l'être.
 */
async function segmentsLus(cible) {
	return cible.evaluate(() => {
		const racineDuDocument = document.documentElement;
		const enFrancais = racineDuDocument.lang === 'fr';
		const ecarte = (element) => {
			if (!element || element.closest('script, style, template, noscript')) return true;
			const bloc = element.closest('[lang]');
			return !enFrancais && bloc !== racineDuDocument && bloc?.getAttribute('lang') === 'fr';
		};
		// Le titre de l'onglet, « Super-admin | jadwal », en ses deux parties : le nom de l'écran, puis
		// celui du service ou de l'organisation, qui ne se traduit pas.
		const morceaux = new Set(document.title.split(' | ').map((partie) => partie.trim()));
		const marcheur = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let noeud = marcheur.nextNode(); noeud; noeud = marcheur.nextNode()) {
			if (ecarte(noeud.parentElement)) continue;
			morceaux.add((noeud.textContent ?? '').replace(/\s+/g, ' ').trim());
		}
		for (const element of document.querySelectorAll(
			'[aria-label], [title], [placeholder], [alt]'
		)) {
			if (ecarte(element)) continue;
			for (const nom of ['aria-label', 'title', 'placeholder', 'alt']) {
				morceaux.add((element.getAttribute(nom) ?? '').replace(/\s+/g, ' ').trim());
			}
		}
		morceaux.delete('');
		return [...morceaux];
	});
}

/**
 * Au moins deux mots de deux lettres : une phrase, et non un nom propre ou le nom d'une langue. Un
 * trait d'union ne sépare pas deux mots : « Super-admin » s'écrit de même en italien. La même règle
 * que `apps/web/tests/textes-lus.ts`.
 */
const PHRASE = /\p{L}{2,}[^\p{L}-]+\p{L}{2,}/u;

/**
 * Ce qui s'écrit de même dans toutes les langues, par nature : du code à coller, une adresse, le
 * nom d'un fuseau horaire (« America/New York »).
 */
const PAREIL_PARTOUT = [/[<>]/, /:\/\//, /^[A-Z][A-Za-z]+\/[A-Za-z /_-]+$/];

/**
 * Ce qui, dans la version d'une page dans une autre langue, reste tel quel de sa version française :
 * ce qu'on a oublié de traduire. `permis` écarte ce qui est pareil dans toutes les langues parce
 * que c'est une donnée saisie, comme le nom d'une organisation, d'un cours ou d'une salle.
 */
function resteEnFrancais(francais, autre, permis) {
	const dansLeFrancais = new Set(francais);
	// Un nom saisi est retiré du morceau avant de juger ce qui reste : « · Grande salle » n'a rien à
	// traduire, « Salle : Grande salle » garde « Salle », qui en a.
	const sansLesNoms = (morceau) =>
		permis.reduce((reste, nom) => reste.replaceAll(nom, ' '), morceau);
	return autre.filter(
		(morceau) =>
			dansLeFrancais.has(morceau) &&
			PHRASE.test(sansLesNoms(morceau)) &&
			!PAREIL_PARTOUT.some((motif) => motif.test(morceau))
	);
}

/** Les noms que le parcours a saisis : ils restent tels quels dans toutes les langues. */
const NOMS_SAISIS = [
	ORGANISATION.nom,
	VOISINE.nom,
	COURS_1.fr,
	COURS_1.ar,
	COURS_2,
	COURS_ANCRE,
	COURS_SANS_DECALAGE,
	COURS_AVANT.titre,
	SALLE,
	SUPER_ADMIN,
	RESPONSABLE
];

/**
 * Les noms que Chrome donne lui-même aux liens du document principal, lus dans son arbre
 * d'accessibilité : c'est ce qu'un lecteur d'écran annonce. `getByRole` en fait son propre calcul ;
 * on demande les deux. Le contenu d'un cadre n'y est pas, celui d'un shadow root ouvert y est.
 */
async function nomsDesLiensSelonChrome(page) {
	const cdp = await page.context().newCDPSession(page);
	try {
		const { nodes } = await cdp.send('Accessibility.getFullAXTree');
		return nodes
			.filter((noeud) => !noeud.ignored && noeud.role?.value === 'link')
			.map((noeud) =>
				String(noeud.name?.value ?? '')
					.replace(/\s+/g, ' ')
					.trim()
			);
	} finally {
		await cdp.detach();
	}
}

/**
 * La boîte de l'annonce du nouvel onglet dans un lien, en pixels : `1×1` quand elle est cachée aux
 * yeux et laissée aux lecteurs d'écran, `absente` quand le lien ne la porte pas.
 */
async function boiteDeLAnnonce(lien, langue) {
	const annonce = lien.getByText(`(${TEXTES_PUBLICS[langue].nouvelOnglet})`, { exact: true });
	if ((await annonce.count()) !== 1) return { cachee: false, taille: 'absente' };
	const boite = await annonce.boundingBox();
	if (!boite) return { cachee: false, taille: 'non rendue' };
	return {
		cachee: boite.width <= 1 && boite.height <= 1,
		taille: `${Math.round(boite.width)}×${Math.round(boite.height)} px`
	};
}

// ---------------------------------------------------------------------------------------------
// Les étapes
// ---------------------------------------------------------------------------------------------

const T = aujourdhui();
/**
 * Le premier cours demain ; le second le surlendemain de demain, ramené la veille de sa date, plus
 * tôt que prévu (A2) ; les deux cours ancrés dans quatre et cinq jours, et celui d'avant une prière
 * dans six : tout tient dans les sept jours de l'accueil et de la vue Semaine.
 */
const J1 = plusJours(T, 1);
const J2 = plusJours(T, 2);
const J3 = plusJours(T, 3);
const J4 = plusJours(T, 4);
const J5 = plusJours(T, 5);
const J6 = plusJours(T, 6);
/** Le vendredi des sept prochains jours, aujourd'hui compris : celui de la session du vendredi. */
const VENDREDI_QUI_VIENT = plusJours(T, (5 - jourDeSemaine(T) + 7) % 7);

const etat = {
	cours1: '',
	cours2: '',
	codeEmbarque: '',
	codeCadre: '',
	segmentsDuCadre: [],
	/** Les heures calculées pour la localité, date par date, une fois enregistrée (retour C2). */
	heures: /** @type {Record<string, Record<string, string>> | null} */ (null)
};

function preparerLImage() {
	etape(`L'image`);
	if (IMAGE_DONNEE) {
		const existe = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' });
		verifier('l’image donnée existe', existe.status === 0, 'JADWAL_PARCOURS_IMAGE');
		return;
	}
	const construction = construireImage(CONTEXTE, IMAGE);
	if (construction.status !== 0) process.stderr.write(construction.stderr?.slice(-4000) ?? '');
	verifier(
		'l’image se construit',
		construction.status === 0,
		CONTEXTE === racine ? 'depuis la racine du dépôt' : 'depuis JADWAL_PARCOURS_CONTEXTE'
	);
}

async function leverLeServeur() {
	etape('La base et le serveur, comme en production');
	verifier('la base répond', marche.leverLaBase());
	for (const [quoi, script] of [
		['les rôles sont créés', 'bootstrap-roles.mjs'],
		['les migrations passent', 'migrate.mjs']
	]) {
		const passage = marche.jouer(script);
		verifier(quoi, passage.ok, passage.derniere.slice(0, 120));
	}
	const superAdmin = marche.jouer('super-admin.mjs', ['--email', SUPER_ADMIN]);
	verifier(
		'la commande de l’image crée le super-admin',
		superAdmin.ok,
		superAdmin.derniere.slice(0, 120)
	);

	PORT = await portLibre();
	ORIGINE = `http://localhost:${PORT}`;
	marche.lancerLeServeur(`127.0.0.1:${PORT}:3000`, { ORIGIN: ORIGINE });
	serveurLance = true;
	let code = 0;
	for (let essai = 0; essai < 60 && code !== 200; essai += 1) {
		try {
			code = (await fetch(`http://127.0.0.1:${PORT}/healthz`)).status;
		} catch {
			await attendre(500);
		}
	}
	verifier('le serveur répond', code === 200, `ORIGIN ${ORIGINE}`);
}

/**
 * Avant toute connexion : un navigateur réglé en allemand voit l'écran de connexion en allemand
 * (D2), et le lien qu'il demande part en allemand (D3).
 */
async function premierPassage(navigateur) {
	const contexte = await nouveauContexte(navigateur, { locale: 'de-CH' });
	try {
		const page = await contexte.newPage();
		await retour('D2', async () => {
			await ouvrir(page, '/connexion');
			const lang = await racineDit(page, 'lang');
			verifier(
				'au premier passage, un navigateur réglé en allemand (de-CH) voit /connexion en allemand',
				lang === 'de' && (await titre(page)) === 'Anmelden',
				`<html lang="${lang}">, « ${await titre(page)} »`
			);
		});
		await retour('D3', async () => {
			await ouvrir(page, '/connexion');
			await demanderUnLien(page, SUPER_ADMIN);
			const courriel = await attendreCourriel(SUPER_ADMIN, /Anmeldelink/);
			verifier(
				'le lien demandé depuis cet écran allemand part en allemand, <html lang="de"> compris',
				courriel?.subject === 'Ihr Anmeldelink für jadwal' &&
					langueDuCourriel(courriel) === 'de' &&
					Boolean(lienDeConnexion(courriel)),
				`reçus : ${sujetsRecus(SUPER_ADMIN)}`
			);
		});
	} finally {
		await contexte.close();
	}
}

/** a. Le super-admin : lien, passkey, organisation, invitation. */
async function superAdmin(navigateur) {
	etape('a. Le super-admin crée une organisation et invite une personne');
	await premierPassage(navigateur);

	const contexte = await nouveauContexte(navigateur);
	const page = await contexte.newPage();
	const passages = [];
	page.on('framenavigated', (cadre) => {
		if (cadre === page.mainFrame()) passages.push(new URL(cadre.url()).pathname);
	});

	const cdp = await contexte.newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true
		}
	});
	verifier('l’authentificateur virtuel de Chrome est branché', Boolean(authenticatorId));

	await ouvrir(page, '/connexion');
	verifier('la page de connexion s’affiche en français', (await titre(page)) === 'Se connecter');
	await retour('B1', async () => {
		const champ = page.locator('main input[type="email"]');
		const aide = await descriptionDe(champ);
		verifier(
			'la connexion dit, sous le champ, quelle adresse écrire, avec un exemple',
			aide.includes('Exemple : prenom.nom@exemple.ch'),
			aide || 'aucune aide reliée au champ'
		);
	});
	await auditer(page, 'connexion');
	await lireLesConditions(
		page,
		page.getByRole('link', { name: 'Lire les conditions d’utilisation', exact: true }),
		'le lien sous le formulaire'
	);
	await auditer(page, 'conditions');
	await ouvrir(page, '/connexion');
	await lireLesConditions(
		page,
		page.locator('footer').getByRole('link', { name: 'Conditions d’utilisation', exact: true }),
		'le lien du pied commun'
	);

	await ouvrir(page, '/connexion');
	await demanderUnLien(page, SUPER_ADMIN);
	verifier(
		'la demande de lien est prise',
		(await texteDe(page.getByRole('status'))).startsWith('Si cette adresse')
	);

	const lien = lienDeConnexion(await attendreCourriel(SUPER_ADMIN, /lien de connexion/));
	verifier('le lien de connexion arrive par courriel, en français', Boolean(lien));
	await ouvrir(page, /** @type {string} */ (lien));
	verifier('le lien ouvre une session', chemin(page) === '/organisations', chemin(page));

	await ouvrir(page, '/super-admin');
	verifier(
		'sans passkey, /super-admin renvoie vers l’écran de la passkey',
		chemin(page) === '/super-admin/passkey',
		chemin(page)
	);
	await auditer(page, 'passkey');
	await page.getByRole('button', { name: 'Enregistrer une passkey' }).click();
	// Le message de l'écran, ou celui de l'échec : « Aucune passkey enregistrée. », déjà là avant le
	// clic, contient les mêmes mots, d'où l'ancre en tête.
	const annonce = page
		.getByRole('status')
		.filter({ hasText: /^(Passkey enregistrée\.|(?!Aucune).+)/ });
	await annonce.first().waitFor();
	const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
	verifier(
		'la passkey est enregistrée, et l’authentificateur la garde',
		(await texteDe(annonce)).startsWith('Passkey enregistrée.') && credentials.length === 1,
		`${await texteDe(annonce)} ; ${credentials.length} dans l’authentificateur`
	);

	await envoyer(page, page.getByRole('button', { name: 'Se connecter avec une passkey' }));
	verifier(
		'la connexion par passkey mène à l’écran du super-admin',
		chemin(page) === '/super-admin' && (await titre(page)) === 'Super-admin',
		chemin(page)
	);
	await auditer(page, 'super-admin');

	await ouvrir(page, '/super-admin/passkey');
	await retour('A3', async () => {
		// La ligne de la passkey, par sa date : son nom dépend de l'appareil (« Windows, 26.09.2026 »
		// sur ce poste, « Linux, … » dans la CI), et n'est plus « Cet appareil » depuis l'étape 18.
		const ligne = page.locator('li').filter({ hasText: /enregistrée le/i });
		const texte = (await ligne.count()) === 1 ? await texteDe(ligne) : 'aucune ligne';
		verifier(
			`la passkey est datée du jour en Suisse, « Enregistrée le ${dateSuisse(T)} »`,
			texte.includes(`Enregistrée le ${dateSuisse(T)}`),
			texte
		);
	});
	await secondePasskey(page, cdp, authenticatorId);
	await languesDuSuperAdmin(page);

	await ouvrir(page, '/super-admin');
	await ecranDuSuperAdmin(page);
	await ouvrirEtEntrer(page, ORGANISATION, { proposee: ADRESSE_PROPOSEE });
	await naviguer(page, '/membres');
	await auditer(page, 'membres');
	await ceQueFaitChaqueRole(page);
	await inviter(page, ORGANISATION, 'org_admin', 'responsable');

	// La seconde organisation, où la même personne sera éditrice. La bannière ramène à l'écran du
	// super-admin. La navigation n'a pas de second « Changer d’organisation » : il mènerait au choix
	// d'une personne membre, `/organisations`, et deux liens du même nom vers deux écrans
	// tromperaient.
	const parLaBanniere = page
		.getByRole('status')
		.filter({ hasText: 'pouvoirs de super-admin' })
		.getByRole('link', { name: CHANGER, exact: true });
	verifier(
		`le super-admin garde « ${CHANGER} » dans sa bannière, vers son écran, et la navigation n’en a pas d’autre`,
		(await parLaBanniere.count()) === 1 &&
			(await cheminDuLien(parLaBanniere)) === '/super-admin' &&
			(await navigationDeLEspace(page).count()) === 1 &&
			(await lienChanger(page).count()) === 0,
		`${await parLaBanniere.count()} dans la bannière, ${await lienChanger(page).count()} dans la navigation`
	);
	await suivre(page, parLaBanniere, '/super-admin');
	await ouvrirEtEntrer(page, VOISINE, {});
	await naviguer(page, '/membres');
	await inviterEnAllemand(page);
	await inviter(page, VOISINE, 'editor', 'éditeur');

	verifier(
		'le super-admin n’est jamais renvoyé vers des conditions à accepter',
		!passages.some((passage) => passage.startsWith('/conditions/accepter')),
		`${passages.length} pages traversées`
	);
	await adresseSansScript(navigateur, contexte);
	await contexte.close();
}

/**
 * Une passkey de plus, pouvoirs actifs (B2) : un second appareil, que l'authentificateur virtuel
 * joue en remplaçant le premier. Celui qui garde déjà la première passkey refuserait la seconde, que
 * le serveur lui envoie dans `excludeCredentials`. Le message dit qu'elle servira à la prochaine
 * connexion, sans renvoyer à un bouton que l'écran n'a pas, et son nom se distingue de la première.
 */
async function secondePasskey(page, cdp, premier) {
	await retour('B2', async () => {
		await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: premier });
		await cdp.send('WebAuthn.addVirtualAuthenticator', {
			options: {
				protocol: 'ctap2',
				transport: 'internal',
				hasResidentKey: true,
				hasUserVerification: true,
				isUserVerified: true,
				automaticPresenceSimulation: true
			}
		});
		// Le message de ce geste : le premier qui n'était pas déjà à l'écran avant le clic, comme celui
		// qui dit que les pouvoirs sont actifs. Quinze secondes au plus.
		const annonces = async () =>
			(await page.getByRole('status').allTextContents()).map((texte) =>
				texte.replace(/\s+/g, ' ').trim()
			);
		const dejaLa = new Set(await annonces());
		await page.getByRole('button', { name: 'Enregistrer une passkey' }).click();
		let message = '';
		for (let essai = 0; essai < 60 && !message; essai += 1) {
			message = (await annonces()).find((texte) => !dejaLa.has(texte)) ?? '';
			if (!message) await attendre(250);
		}
		const boutons = (await page.locator('.actions button').allTextContents()).map((texte) =>
			texte.trim()
		);
		verifier(
			'une seconde passkey, pouvoirs actifs : le message dit qu’elle servira à la prochaine connexion, sans renvoyer à un bouton, et l’écran n’en montre pas d’autre que « Enregistrer une passkey »',
			message.startsWith('Passkey enregistrée.') &&
				message.includes('la prochaine fois') &&
				!/bouton/i.test(message) &&
				boutons.join('|') === 'Enregistrer une passkey',
			`« ${message || 'aucun message'} » ; boutons : ${boutons.join(', ') || 'aucun'}`
		);
		// La liste se relit après le message : on attend la seconde ligne, cinq secondes au plus.
		const lignes = page.locator('li').filter({ hasText: /enregistrée le/i });
		await lignes
			.nth(1)
			.waitFor({ timeout: 5000 })
			.catch(() => undefined);
		const noms = (await lignes.locator('strong').allTextContents()).map((nom) => nom.trim());
		verifier(
			'son nom se distingue de celui de la première',
			noms.length === 2 && new Set(noms).size === 2,
			noms.map((nom) => `« ${nom} »`).join(', ') || 'aucun nom'
		);
	});
}

/**
 * Le super-admin sans JavaScript (B2) : l'adresse de la page publique ne se remplit pas pendant la
 * frappe, le champ part vide, et le serveur la propose d'après le nom, comme l'écran l'aurait fait.
 * La même session, dans un navigateur qui n'exécute aucun script.
 */
async function adresseSansScript(navigateur, contexte) {
	await retour('B2', async () => {
		const sansScript = await nouveauContexte(navigateur, {
			javaScriptEnabled: false,
			storageState: await contexte.storageState()
		});
		try {
			const page = await sansScript.newPage();
			await ouvrir(page, '/super-admin');
			await page.locator('#name').fill(SANS_SCRIPT.nom);
			await envoyer(page, page.locator('form[action="?/ouvrir"] button[type="submit"]'));
			const adresse = `${new URL(ORIGINE).host}/m/${SANS_SCRIPT.adresse}`;
			const succes = page.locator('section.succes');
			const annonce = (await succes.count()) === 1 ? await texteDe(succes) : '';
			const carte = page.locator('li').filter({ hasText: SANS_SCRIPT.nom });
			verifier(
				`sans JavaScript, « ${SANS_SCRIPT.nom} », créée sans adresse écrite, reçoit celle que le serveur propose, « ${SANS_SCRIPT.adresse} », et l’écran dit l’adresse entière`,
				annonce.includes(SANS_SCRIPT.nom) &&
					annonce.includes(adresse) &&
					(await carte.count()) === 1 &&
					(await texteDe(carte)).includes(adresse),
				annonce || (await texteDe(page.locator('main'))).slice(0, 160)
			);
		} finally {
			await sansScript.close();
		}
	});
}

/**
 * Les écrans du super-admin dans les quatre autres langues (D2) : `<html lang dir>`, le choix de la
 * langue en haut, retenu au rechargement, et aucune phrase de la version française restée telle
 * quelle. Puis retour au français, pour la suite du parcours.
 */
async function languesDuSuperAdmin(page) {
	await retour('D2', async () => {
		const ecrans = ['/super-admin', '/super-admin/passkey'];
		const francais = new Map();
		for (const ecran of ecrans) {
			await ouvrir(page, ecran);
			verifier(
				`${ecran} porte en haut le choix des cinq langues, le français choisi`,
				await choixPresent(page, 'fr')
			);
			francais.set(ecran, await segmentsLus(page));
		}
		for (const langue of LANGUES.filter((code) => code !== 'fr')) {
			await ouvrir(page, ecrans[0]);
			await choisirLaLangue(page, langue);
			const problemes = [];
			for (const ecran of ecrans) {
				await ouvrir(page, ecran);
				const lang = await racineDit(page, 'lang');
				const dir = await racineDit(page, 'dir');
				if (lang !== langue || dir !== (langue === 'ar' ? 'rtl' : 'ltr')) {
					problemes.push(`${ecran} : <html lang="${lang}" dir="${dir}">`);
				}
				if (!(await choixPresent(page, langue))) problemes.push(`${ecran} : choix de la langue`);
				// Le nom d'une passkey, « Windows, 26.09.2026 », s'écrit de même dans toutes les langues :
				// ce n'est pas une phrase, et il n'a pas à être écarté.
				const restes = resteEnFrancais(
					/** @type {string[]} */ (francais.get(ecran)),
					await segmentsLus(page),
					NOMS_SAISIS
				);
				for (const reste of restes.slice(0, 3)) problemes.push(`${ecran} : « ${reste} »`);
			}
			verifier(
				`en ${NOM_DE_LANGUE[langue]}, les écrans du super-admin sont dans cette langue, rien en français`,
				problemes.length === 0,
				problemes.join(' ; ')
			);
		}
		await page.reload();
		await page.waitForLoadState('networkidle');
		verifier(
			'la langue choisie reste au rechargement',
			(await racineDit(page, 'lang')) === 'ar' && (await racineDit(page, 'dir')) === 'rtl'
		);
		await choisirLaLangue(page, 'fr');
		verifier('retour au français', (await racineDit(page, 'lang')) === 'fr');
	});
}

/** `/conditions`, atteinte par un lien : le document entier, daté, avec sa liste complète. */
async function lireLesConditions(page, lien, quel) {
	await suivre(page, lien, '/conditions');
	const listes = page.locator('main ol');
	const nombreDeListes = await listes.count();
	const elements = nombreDeListes === 1 ? await listes.locator(':scope > li').count() : 0;
	verifier(
		`${quel} mène à /conditions, qui montre le document`,
		(await titre(page)) === 'Conditions d’utilisation' && elements === DONNEES_PERSONNELLES,
		`« ${await titre(page)} », ${nombreDeListes} liste numérotée de ${elements} éléments`
	);
	await retour('A3', async () => {
		const date = await texteDe(page.locator('main p').filter({ hasText: /^Dernière mise à jour/ }));
		verifier(
			`les conditions sont datées en JJ.MM.AAAA, « Dernière mise à jour : ${DATE_DES_CONDITIONS}. »`,
			date === `Dernière mise à jour : ${DATE_DES_CONDITIONS}.`,
			date
		);
	});
	await retour('F1', async () => {
		const texte = await texteLu(page);
		const exploitant = texte.includes(`exploité par ${EXPLOITANT}`);
		const nomRetire = nommeLaPersonneRetiree(texte);
		verifier(
			`les conditions nomment ${EXPLOITANT} comme exploitant, et nulle part la personne retirée`,
			exploitant && !nomRetire,
			`${exploitant ? `« exploité par ${EXPLOITANT} » y est` : `« exploité par ${EXPLOITANT} » n’y est pas`} ; ` +
				`${nomRetire ? 'le nom retiré du dépôt y est' : 'le nom retiré du dépôt n’y est pas'}`
		);
	});
}

/**
 * L'écran du super-admin, avant de créer la première organisation (B2) : ce qu'est une
 * organisation, le fuseau dans une liste, le lien de connexion de secours expliqué.
 */
async function ecranDuSuperAdmin(page) {
	await retour('B2', async () => {
		const section = page.locator('section', {
			has: page.getByRole('heading', { name: 'Créer une organisation', exact: true })
		});
		const phrase = (await section.count()) === 1 ? await texteDe(section.locator('p').first()) : '';
		verifier(
			'« Créer une organisation », avec la phrase qui dit ce qu’est une organisation',
			phrase ===
				'Une organisation est l’espace d’une association, d’une école ou d’un club : son programme, ses membres et sa page publique.' &&
				(await page.getByText('Ouvrir une organisation').count()) === 0,
			phrase || 'aucune section de ce nom'
		);
		// Le champ du fuseau, par son `id` : son libellé n'est pas l'objet de cette vérification.
		const fuseau = page.locator('#timeZone');
		const genre = await fuseau.evaluate((element) => element.tagName.toLowerCase());
		const groupes = await fuseau
			.locator('optgroup')
			.evaluateAll((tous) => tous.map((groupe) => groupe.getAttribute('label')));
		verifier(
			'le fuseau se choisit dans une liste, les fuseaux d’Europe en tête, Europe/Zurich par défaut',
			genre === 'select' && (await fuseau.inputValue()) === FUSEAU && groupes[0] === 'Europe',
			`<${genre}> « ${await fuseau.inputValue()} », groupes ${groupes.join(', ') || 'aucun'}`
		);
		const aideDuFuseau = await descriptionDe(fuseau);
		verifier(
			'une phrase sous le fuseau dit à quoi il sert : les heures du programme et celles des prières',
			aideDuFuseau.includes('heures du programme') && aideDuFuseau.includes('heures de prière'),
			aideDuFuseau || 'aucune aide'
		);
		const secours = page.locator('section', {
			has: page.getByRole('heading', { name: 'Lien de connexion de secours', exact: true })
		});
		const texte = (await secours.count()) === 1 ? await texteDe(secours) : '';
		verifier(
			'le lien de connexion de secours dit quand s’en servir, ce qui se passe et combien il vaut',
			texte.includes('quand une personne ne reçoit pas le courriel de connexion') &&
				texte.includes('Le lien s’affiche ici au lieu de partir par courriel') &&
				texte.includes('Il est valable quinze minutes et ne sert qu’une fois.') &&
				(await secours.getByLabel('Adresse électronique de la personne').count()) === 1 &&
				(await secours.getByRole('button', { name: 'Créer le lien de connexion' }).count()) === 1,
			texte.slice(0, 160) || 'aucune section de ce nom'
		);
	});
}

/**
 * L'écran du super-admin : créer une organisation, puis entrer dans son espace. Pour la première,
 * l'adresse proposée pendant la frappe, modifiable, et l'adresse complète qui suit (B2).
 */
async function ouvrirEtEntrer(page, organisation, { proposee }) {
	const nom = page.locator('#name');
	const adresse = page.locator('#slug');
	await nom.click();
	await nom.pressSequentially(organisation.nom);
	if (proposee) {
		await retour('B2', async () => {
			const complete = page.locator('#slug-adresse');
			const hote = new URL(ORIGINE).host;
			const lue = (await complete.count()) === 1 ? await texteDe(complete) : 'absente';
			verifier(
				`« Adresse de la page publique » est proposée pendant la frappe, « ${proposee} », adresse complète en direct`,
				(await page.getByLabel('Adresse de la page publique', { exact: true }).count()) === 1 &&
					(await adresse.inputValue()) === proposee &&
					lue === `Adresse complète : ${hote}/m/${proposee}`,
				`« ${await adresse.inputValue()} » ; ${lue}`
			);
		});
	}
	await adresse.fill(organisation.slug);
	if (proposee) {
		await retour('B2', async () => {
			const complete = page.locator('#slug-adresse');
			const lue = (await complete.count()) === 1 ? await texteDe(complete) : 'absente';
			verifier(
				'l’adresse se modifie, et l’adresse complète la suit',
				lue === `Adresse complète : ${new URL(ORIGINE).host}/m/${organisation.slug}` &&
					(await page
						.getByRole('button', { name: 'Créer l’organisation', exact: true })
						.count()) === 1,
				lue
			);
		});
	}
	await envoyer(page, page.locator('form[action="?/ouvrir"] button[type="submit"]'));
	const carte = page.locator('li').filter({ hasText: organisation.nom });
	verifier(`« ${organisation.nom} » est créée`, (await carte.count()) === 1, organisation.slug);

	await envoyer(page, carte.getByRole('button', { name: 'Entrer dans son espace' }));
	const banniere = await texteDe(page.getByRole('status'));
	verifier(
		'il entre dans son espace, et la bannière le lui rappelle',
		chemin(page) === '/' && banniere.includes(organisation.nom),
		banniere
	);
}

/** L'écran Membres (B3) : ce que fait un éditeur, ce qui est réservé au responsable. */
async function ceQueFaitChaqueRole(page) {
	await retour('B3', async () => {
		const editeur = page.locator('section', {
			has: page.getByRole('heading', { name: 'Ce que peut faire un éditeur', exact: true })
		});
		const responsable = page.locator('section', {
			has: page.getByRole('heading', {
				name: 'Réservé au responsable, en plus de tout ce que fait un éditeur',
				exact: true
			})
		});
		const gestesEditeur = await editeur.locator('li').allTextContents();
		const gestesResponsable = await responsable.locator('li').allTextContents();
		verifier(
			'sous le choix du rôle, ce que peut faire un éditeur, et ce qui est réservé au responsable',
			gestesEditeur.some((geste) => geste.includes('Créer un cours')) &&
				gestesResponsable.some((geste) => geste.includes('Retirer un membre')) &&
				gestesResponsable.some((geste) => geste.includes('Inviter une personne')),
			`${gestesEditeur.length} gestes d’éditeur, ${gestesResponsable.length} réservés`
		);
		// Aucun écran ne propose de supprimer un cours : la liste ne le promet pas à l'éditeur.
		const surLesCours = gestesEditeur
			.map((geste) => geste.replace(/\s+/g, ' ').trim())
			.filter((geste) => /\bcours\b/.test(geste));
		verifier(
			'ce que peut faire un éditeur ne promet pas de supprimer un cours, qu’aucun écran ne propose : « Créer un cours, le modifier et le publier »',
			surLesCours.includes('Créer un cours, le modifier et le publier') &&
				!surLesCours.some((geste) => /supprimer/.test(geste)),
			surLesCours.map((geste) => `« ${geste} »`).join(', ') || 'aucun geste sur les cours'
		);
		const decrit = await page.locator('#role').getAttribute('aria-describedby');
		verifier(
			'le choix du rôle renvoie à ces deux listes pour les lecteurs d’écran',
			(decrit ?? '').split(/\s+/).includes('roles-aide') &&
				(await page.locator('#roles-aide').count()) === 1,
			`aria-describedby="${decrit}"`
		);
	});
	await retour('B1', async () => {
		const aide = await descriptionDe(page.locator('#email'));
		verifier(
			'l’invitation dit, sous l’adresse, un exemple de la bonne forme',
			aide.includes('Exemple : prenom.nom@exemple.ch'),
			aide || 'aucune aide'
		);
	});
}

/** L'écran Membres : inviter la personne responsable du parcours, avec un rôle. */
async function inviter(page, organisation, role, roleAffiche) {
	// Le rôle du super-admin voit toutes les organisations : l'écran doit nommer celle où il est
	// entré, et non la première venue, ce qu'il faisait dans la seconde avant l'étape 16.
	verifier(
		`l’écran Membres nomme « ${organisation.nom} »`,
		(await titre(page)) === organisation.nom,
		await titre(page)
	);
	await page.locator('#email').fill(RESPONSABLE);
	await page.locator('#role').selectOption(role);
	await envoyer(page, page.locator('form[action="?/inviter"] button[type="submit"]'));
	verifier(
		`l’invitation dans « ${organisation.nom} » part`,
		(await texteDe(page.getByRole('status').last())) ===
			'L’invitation a été envoyée à cette adresse.'
	);
	const enAttente = page.locator('li').filter({ hasText: RESPONSABLE });
	verifier(
		`elle attend dans « Invitations en attente », en ${roleAffiche}`,
		(await enAttente.count()) === 1 && (await texteDe(enAttente)).includes(roleAffiche),
		await texteDe(enAttente)
	);
}

/**
 * Une invitation envoyée depuis l'écran Membres en allemand, à une adresse sans compte : elle part
 * dans la langue de la personne qui invite (D3). Puis l'écran revient au français.
 */
async function inviterEnAllemand(page) {
	await retour('D3', async () => {
		await choisirLaLangue(page, 'de');
		await page.locator('#email').fill(INVITEE_EN_ALLEMAND);
		await page.locator('#role').selectOption('editor');
		await envoyer(page, page.locator('form[action="?/inviter"] button[type="submit"]'));
		const courriel = await attendreCourriel(INVITEE_EN_ALLEMAND, /./);
		verifier(
			'une invitation envoyée depuis l’écran en allemand part en allemand, <html lang="de"> compris',
			courriel?.subject === `Einladung zu ${VOISINE.nom} auf jadwal` &&
				langueDuCourriel(courriel) === 'de',
			`reçus : ${sujetsRecus(INVITEE_EN_ALLEMAND) || 'rien'}`
		);
	});
	if ((await racineDit(page, 'lang')) !== 'fr') await choisirLaLangue(page, 'fr');
}

const AUTRE_ORGANISATION = 'Choisir une autre organisation';

/**
 * L'écran `/conditions/accepter`, où la porte de l'espace renvoie : le texte entier, sa version, le
 * bouton, et rien de l'espace. Le lien vers le choix d'organisation y est pour qui en a plusieurs,
 * ou une invitation qui attend encore (H2) : avec une seule et rien d'autre, il n'y aurait rien à
 * choisir.
 */
async function ecranDAcceptation(page, organisation, { lienAttendu, pourquoi }) {
	verifier(
		`elle est renvoyée vers les conditions à accepter de « ${organisation.nom} »`,
		chemin(page) === '/conditions/accepter',
		chemin(page)
	);
	const raison = await texteDe(page.locator('main p').filter({ hasText: /^Avant d’entrer/ }));
	const bouton = page.getByRole('button', {
		name: 'J’accepte les conditions d’utilisation',
		exact: true
	});
	verifier(
		'elle voit le texte entier et le bouton « J’accepte les conditions d’utilisation »',
		(await titre(page)) === 'Conditions d’utilisation' &&
			raison.includes(`l’espace de ${organisation.nom},`) &&
			(await page.locator('main ol > li').count()) === DONNEES_PERSONNELLES &&
			(await bouton.count()) === 1,
		raison
	);
	await retour('A3', async () => {
		const version = await texteDe(page.locator('main p').filter({ hasText: /^Version du/ }));
		const date = await texteDe(page.locator('main p').filter({ hasText: /^Dernière mise à jour/ }));
		verifier(
			`la version et la date du texte s’écrivent en JJ.MM.AAAA, « Version du ${DATE_DES_CONDITIONS} »`,
			version === `Version du ${DATE_DES_CONDITIONS}` &&
				date === `Dernière mise à jour : ${DATE_DES_CONDITIONS}.`,
			`« ${version} », « ${date} »`
		);
	});
	verifier(
		'la navigation de l’espace est absente, « Se déconnecter » reste',
		(await navigationDeLEspace(page).count()) === 0 &&
			(await page.getByRole('button', { name: 'Se déconnecter' }).count()) === 1
	);
	const lien = page.getByRole('link', { name: AUTRE_ORGANISATION, exact: true });
	const verification = async () =>
		verifier(
			`${pourquoi}, le lien « ${AUTRE_ORGANISATION} » est là, vers le choix`,
			(await lien.count()) === (lienAttendu ? 1 : 0) &&
				(!lienAttendu || (await cheminDuLien(lien)) === '/organisations'),
			`${await lien.count()} lien`
		);
	if (lienAttendu === 'H2') await retour('H2', verification);
	else await verification();
	return { bouton, lien };
}

/** b. La personne invitée : courriels, lien, deux invitations acceptées, les conditions. */
async function personneInvitee(navigateur) {
	etape(
		'b. La personne invitée se connecte, rejoint ses deux organisations, accepte les conditions'
	);
	const contexte = await nouveauContexte(navigateur);
	const page = await contexte.newPage();

	const invitations = [];
	for (const organisation of [ORGANISATION, VOISINE]) {
		invitations.push(
			await attendreCourriel(RESPONSABLE, new RegExp(`^Invitation à rejoindre ${organisation.nom}`))
		);
	}
	verifier(
		'les deux invitations arrivent par courriel, en français, avec l’adresse de connexion',
		invitations.every((invitation) => invitation?.text.includes(`${ORIGINE}/connexion`)),
		`reçus : ${sujetsRecus(RESPONSABLE)}`
	);

	await ouvrir(page, '/connexion');
	await demanderUnLien(page, RESPONSABLE);
	const lien = lienDeConnexion(await attendreCourriel(RESPONSABLE, /lien de connexion/));
	verifier('son lien de connexion arrive par courriel', Boolean(lien));
	await ouvrir(page, /** @type {string} */ (lien));
	verifier(
		'le lien mène au choix d’organisation',
		chemin(page) === '/organisations' && (await titre(page)) === 'Vos organisations',
		chemin(page)
	);
	const recue = page.locator('li').filter({ hasText: ORGANISATION.nom });
	const recueVoisine = page.locator('li').filter({ hasText: VOISINE.nom });
	verifier(
		'les deux invitations reçues y sont, avec leur rôle',
		(await texteDe(recue)).includes('responsable') &&
			(await texteDe(recueVoisine)).includes('éditeur'),
		`${await texteDe(recue)} | ${await texteDe(recueVoisine)}`
	);
	await auditer(page, 'choix d’organisation');

	// La première : l'invitation acceptée, la porte renvoie vers les conditions. La seconde
	// invitation attend encore : le lien vers le choix est là (H2), comme dans la navigation.
	await envoyer(page, recue.getByRole('button', { name: 'Accepter' }));
	const { bouton } = await ecranDAcceptation(page, ORGANISATION, {
		lienAttendu: 'H2',
		pourquoi: 'avec une organisation et une invitation qui attend'
	});
	await auditer(page, 'conditions à accepter');
	await envoyer(page, bouton);
	verifier(
		'après avoir accepté, elle arrive à l’accueil de son espace, et la navigation revient',
		chemin(page) === '/' &&
			(await titre(page)) === 'À venir' &&
			(await navigationDeLEspace(page).count()) === 1,
		chemin(page)
	);
	await ouvrir(page, '/conditions/accepter');
	verifier(
		'revenue sur /conditions/accepter, elle est renvoyée à l’accueil',
		chemin(page) === '/',
		chemin(page)
	);

	// Membre d'une seule organisation, elle a encore la seconde invitation en attente : la
	// navigation la mène au choix d'organisation, où elle l'accepte. Qu'une personne d'une seule
	// organisation sans invitation n'ait pas ce lien, `apps/web/tests/acces.test.ts` le vérifie :
	// personne, dans ce parcours, n'est dans ce cas.
	verifier(
		`avec une seule organisation et une invitation qui attend, elle trouve « ${CHANGER} » dans la navigation, vers le choix`,
		(await lienChanger(page).count()) === 1 &&
			(await cheminDuLien(lienChanger(page))) === '/organisations'
	);
	await naviguer(page, '/organisations');
	const seconde = page.locator('li').filter({ hasText: VOISINE.nom });
	verifier(
		`par ce lien, elle retrouve l’invitation de « ${VOISINE.nom} », à accepter`,
		(await texteDe(seconde)).includes('éditeur') &&
			(await seconde.getByRole('button', { name: 'Accepter' }).count()) === 1,
		await texteDe(seconde)
	);

	// Ses conditions l'attendent, parce que l'acceptation vaut pour une organisation, et le lien
	// vers le choix est là : elle en a maintenant deux.
	await envoyer(page, seconde.getByRole('button', { name: 'Accepter' }));
	const { lien: autre } = await ecranDAcceptation(page, VOISINE, {
		lienAttendu: true,
		pourquoi: 'avec deux organisations'
	});
	await suivre(page, autre, '/organisations');
	await envoyer(page, page.getByRole('button', { name: ORGANISATION.nom, exact: true }));
	verifier(
		`par ce lien, elle revient dans « ${ORGANISATION.nom} », qui ne redemande rien`,
		chemin(page) === '/' && (await page.title()) === `À venir | ${ORGANISATION.nom}`,
		`${chemin(page)} « ${await page.title()} »`
	);

	// Membre de deux organisations, elle trouve « Changer d’organisation » dans la navigation, en
	// responsable ici, puis en éditrice dans la voisine, où elle entre accepter les conditions.
	verifier(
		`membre de deux organisations, elle trouve « ${CHANGER} » dans la navigation, vers le choix`,
		(await lienChanger(page).count()) === 1 &&
			(await cheminDuLien(lienChanger(page))) === '/organisations'
	);
	await naviguer(page, '/organisations');
	await envoyer(page, page.getByRole('button', { name: VOISINE.nom, exact: true }));
	verifier(
		`dans « ${VOISINE.nom} », ses conditions l’attendent encore`,
		chemin(page) === '/conditions/accepter' && (await navigationDeLEspace(page).count()) === 0,
		chemin(page)
	);
	await envoyer(
		page,
		page.getByRole('button', { name: 'J’accepte les conditions d’utilisation', exact: true })
	);
	const liensDeLEditrice = await navigationDeLEspace(page).getByRole('link').allTextContents();
	verifier(
		`éditrice dans « ${VOISINE.nom} », elle trouve « ${CHANGER} » dans la navigation, sans « Membres »`,
		chemin(page) === '/' &&
			(await page.title()) === `À venir | ${VOISINE.nom}` &&
			(await lienChanger(page).count()) === 1 &&
			(await cheminDuLien(lienChanger(page))) === '/organisations' &&
			!liensDeLEditrice.some((texte) => texte.trim() === 'Membres'),
		`« ${await page.title()} » : ${liensDeLEditrice.map((texte) => texte.trim()).join(', ')}`
	);
	await naviguer(page, '/organisations');
	await envoyer(page, page.getByRole('button', { name: ORGANISATION.nom, exact: true }));
	verifier(
		`par ce lien, elle revient en responsable dans « ${ORGANISATION.nom} »`,
		chemin(page) === '/' &&
			(await page.title()) === `À venir | ${ORGANISATION.nom}` &&
			(await navigationDeLEspace(page)
				.getByRole('link', { name: 'Membres', exact: true })
				.count()) === 1,
		`${chemin(page)} « ${await page.title()} »`
	);

	// Une personne déjà connectée qui suit l'adresse de son courriel d'invitation passe par
	// `/connexion`, qui la renvoie au choix d'organisation. De là, elle rentre dans « Centre du
	// Parcours ».
	const adresseDuCourriel = (invitations[1]?.text ?? '')
		.split(/\s+/)
		.find((mot) => mot.startsWith(`${ORIGINE}/connexion`));
	await ouvrir(page, adresseDuCourriel ?? '/connexion');
	verifier(
		'une fois connectée, elle suit l’adresse de son second courriel d’invitation et arrive au choix d’organisation',
		Boolean(adresseDuCourriel) && chemin(page) === '/organisations',
		`${adresseDuCourriel ?? 'adresse absente du courriel'} : ${chemin(page)}`
	);
	await envoyer(page, page.getByRole('button', { name: ORGANISATION.nom, exact: true }));
	verifier(
		`de là, elle rentre dans « ${ORGANISATION.nom} »`,
		chemin(page) === '/' && (await page.title()) === `À venir | ${ORGANISATION.nom}`,
		`${chemin(page)} « ${await page.title()} »`
	);
	return { contexte, page };
}

/**
 * Le formulaire d'un cours, avant d'y écrire (B1 et B4) : les aides sous les champs clés, puis le
 * résumé de ce qui sera publié, qui signale ce qui manque et suit la saisie.
 */
async function clarteDuFormulaire(page, cours) {
	await retour('B1', async () => {
		const aides = {
			titre: await descriptionDe(page.locator('#title-fr')),
			premierJour: await descriptionDe(page.locator('#startsOn')),
			publication: await descriptionDe(page.locator('#status'))
		};
		verifier(
			'le formulaire d’un cours a une aide sous le titre, le premier jour et la publication',
			aides.titre.includes('Exemple :') &&
				aides.premierJour.length > 0 &&
				aides.publication.length > 0,
			`titre « ${aides.titre} », premier jour « ${aides.premierJour} », publication « ${aides.publication} »`
		);
	});
	await retour('B4', async () => {
		const resume = page.locator('#course-summary');
		const ligne = (debut) => resume.locator('div').filter({ hasText: debut });
		verifier(
			'en haut du formulaire, « Résumé : ce qui sera publié », et le premier jour signalé comme manquant',
			(await resume.getByRole('heading', { name: 'Résumé : ce qui sera publié' }).count()) === 1 &&
				(await texteDe(ligne('Premier jour'))) === 'Premier jour : pas choisi',
			(await resume.count()) === 1 ? await texteDe(ligne('Premier jour')) : 'aucun résumé'
		);
		await page.locator('#title-fr').fill(cours.titre);
		await page.locator('#startsOn').fill(T);
		verifier(
			'le résumé suit la saisie : le titre, puis le premier jour écrit en JJ.MM.AAAA',
			(await texteDe(ligne('Titre en français'))) === `Titre en français : ${cours.titre}` &&
				(await texteDe(ligne('Premier jour'))).endsWith(dateSuisse(T)),
			`${await texteDe(ligne('Titre en français'))} | ${await texteDe(ligne('Premier jour'))}`
		);
		// La description a sa ligne, juste sous le titre de sa langue. Elle est retirée ensuite : le
		// cours du parcours n'en a pas, et les écrans lus dans les autres langues n'ont rien à écarter.
		await page.locator('#description-fr').fill(DESCRIPTION);
		const lignes = (await resume.locator('dl > div').allTextContents()).map((texte) =>
			texte.replace(/\s+/g, ' ').trim()
		);
		const titreLu = lignes.indexOf(`Titre en français : ${cours.titre}`);
		const apresLeTitre = titreLu >= 0 ? (lignes[titreLu + 1] ?? '') : '';
		verifier(
			'le résumé a une ligne pour la description, sous le titre de sa langue',
			apresLeTitre === `Description en français : ${DESCRIPTION}`,
			apresLeTitre || lignes.slice(0, 3).join(' | ')
		);
		await page.locator('#description-fr').fill('');
	});
}

/**
 * Une description écrite en allemand, le titre allemand laissé vide (B4) : le serveur refuse le
 * cours avec une phrase qui nomme la langue, et le formulaire revient avec la saisie. La
 * description est ensuite effacée, pour que le cours s'enregistre sans elle. Le champ vit derrière
 * l'onglet de sa langue, qu'on ouvre avant d'y écrire, quel que soit l'onglet que l'écran rouvre.
 */
async function descriptionSansTitre(page) {
	const allemand = () => page.getByRole('tab', { name: /allemand/ }).click();
	const francais = () => page.getByRole('tab', { name: /français/ }).click();
	const description = page.locator('#description-de');
	await retour('B4', async () => {
		await allemand();
		await description.fill(DESCRIPTION_SANS_TITRE.texte);
		await francais();
		await envoyer(page, page.locator('form.colonne button[type="submit"]'));
		const refus = (await page.locator('form.colonne [role="alert"] li').allTextContents()).map(
			(phrase) => phrase.replace(/\s+/g, ' ').trim()
		);
		verifier(
			'une description écrite en allemand sans titre en allemand est refusée, avec une phrase qui nomme la langue, et le formulaire revient avec la description',
			chemin(page) === '/cours/nouveau' &&
				refus.includes(DESCRIPTION_SANS_TITRE.refus) &&
				(await description.inputValue()) === DESCRIPTION_SANS_TITRE.texte,
			`${chemin(page)} ; ${refus.map((phrase) => `« ${phrase} »`).join(', ') || 'aucun refus'}`
		);
		if (chemin(page) === '/cours/nouveau') {
			await allemand();
			await description.fill('');
			await francais();
		}
	});
}

/**
 * Un cours saisi comme une personne le saisit : écran par écran, champ par champ. Les champs sont
 * visés par leur `id`, le contrat du formulaire avec le serveur ; leurs libellés et leurs aides
 * sont vérifiés à part.
 */
async function creerCours(page, cours) {
	await naviguer(page, '/cours');
	await suivre(page, page.locator('main a[href="/cours/nouveau"]').first(), '/cours/nouveau');
	if (cours.auditer) await auditer(page, 'nouveau cours');
	if (cours.clarte) await clarteDuFormulaire(page, cours);

	await page.locator('#title-fr').fill(cours.titre);
	if (cours.titreArabe) {
		await page.getByRole('tab', { name: /arabe/ }).click();
		await page.locator('#title-ar').fill(cours.titreArabe);
		await page.getByRole('tab', { name: /français/ }).click();
	}
	await page.locator('#audience').selectOption(cours.public);
	for (let jour = 1; jour <= 7; jour += 1) {
		const caseDuJour = page.locator(`input[name="weekdays"][value="${jour}"]`);
		if (jour === cours.jour) await caseDuJour.check();
		else await caseDuJour.uncheck();
	}
	if (cours.ancre) {
		await page.locator('#timingKind').selectOption(cours.ancre.sens);
		await page.locator('#prayer').selectOption(cours.ancre.priere);
		await page.locator('#offsetMinutes').fill(String(cours.ancre.minutes));
		await page.locator('#durationMinutes').fill(String(cours.ancre.duree));
	} else {
		await page.locator('#start').fill(cours.debut);
		await page.locator('#end').fill(cours.fin);
	}
	await page.locator('#roomId').selectOption({ label: SALLE });
	await page.locator('#startsOn').fill(T);
	await page.locator('#status').selectOption(cours.etat === 'publié' ? 'published' : 'draft');
	if (cours.descriptionSansTitre) await descriptionSansTitre(page);
	// Un écran qui accepte la description sans titre, comme avant la relecture du lot 4, enregistre le
	// cours dès cet envoi : il est alors déjà dans la liste, et il n'y a rien à renvoyer.
	if (chemin(page) === '/cours/nouveau') {
		await envoyer(page, page.locator('form.colonne button[type="submit"]'));
	}

	const ligne = page.locator('li').filter({ hasText: cours.titre });
	verifier(
		`« ${cours.titre} » est créé, ${cours.etat}, le ${JOURS[cours.jour - 1]}`,
		chemin(page) === '/cours' && (await texteDe(ligne)).includes(cours.etat),
		await texteDe(ligne)
	);
	const modifier = await ligne.locator('a[href^="/cours/"]').first().getAttribute('href');
	return (modifier ?? '').split('/').pop() ?? '';
}

/** La séance d'un cours un jour donné, sur l'accueil de l'espace. */
function seanceDuJour(page, date, titreDuCours) {
	return page
		.locator('section', { has: page.locator(`[id="jour-${date}"]`) })
		.locator('li')
		.filter({ hasText: titreDuCours });
}

/** Les boutons « Annuler cette séance » qu'une personne voit sur l'accueil, sans rien ouvrir. */
const boutonsDAnnulationVisibles = (cible) =>
	cible.getByRole('button', { name: 'Annuler cette séance', exact: true });

/**
 * « À venir » (A1) : les options sont fermées, « Annuler ou déplacer » n'ouvre que celles de sa
 * carte, et un second geste la referme sans rien rouvrir d'autre.
 */
async function optionsDesSeances(page, premiere, seconde) {
	await retour('A1', async () => {
		verifier(
			'avant tout geste, aucun bouton « Annuler cette séance » n’est visible',
			(await boutonsDAnnulationVisibles(page).count()) === 0,
			`${await boutonsDAnnulationVisibles(page).count()} visibles`
		);
		const ouvrirLes = premiere.getByText('Annuler ou déplacer', { exact: true });
		await ouvrirLes.click();
		verifier(
			'« Annuler ou déplacer » n’ouvre que les options de sa carte',
			(await boutonsDAnnulationVisibles(premiere).count()) === 1 &&
				(await boutonsDAnnulationVisibles(seconde).count()) === 0 &&
				(await boutonsDAnnulationVisibles(page).count()) === 1,
			`${await boutonsDAnnulationVisibles(page).count()} visibles en tout`
		);
		await ouvrirLes.click();
		verifier(
			'un second geste la referme, sans rouvrir les autres',
			(await boutonsDAnnulationVisibles(page).count()) === 0,
			`${await boutonsDAnnulationVisibles(page).count()} visibles`
		);
	});
}

/**
 * Déplacer une séance (A2) : le champ accepte toute date à partir d'aujourd'hui, refuse une date
 * passée, et la séance du J3 part la veille, plus tôt que prévu. L'aide de la date le dit (B1).
 */
async function deplacerPlusTot(page) {
	const depart = seanceDuJour(page, J3, COURS_2);
	await retour('A2', async () => {
		await depart.getByText('Annuler ou déplacer', { exact: true }).click();
		const date = depart.getByLabel('Nouvelle date', { exact: true });
		verifier(
			`le champ « Nouvelle date » accepte toute date à partir d’aujourd’hui (${dateSuisse(T)}), sans limite`,
			(await date.getAttribute('type')) === 'date' &&
				(await date.getAttribute('min')) === T &&
				(await date.getAttribute('max')) === null,
			`min="${await date.getAttribute('min')}" max="${await date.getAttribute('max')}"`
		);
		await retour('B1', async () => {
			const aide = await descriptionDe(date);
			verifier(
				'l’aide de la nouvelle date dit : à partir d’aujourd’hui, plus tôt ou plus tard',
				aide ===
					`À partir d’aujourd’hui, ${dateLongue(T)}, plus tôt ou plus tard que la date prévue.`,
				aide
			);
		});
		// Les champs s'ouvrent sur la date prévue et l'heure habituelle : les envoyer tels quels ne
		// déplace rien, et l'écran le dit dans la carte, au lieu d'écrire un déplacement vers la séance
		// elle-même.
		await envoyer(page, depart.getByRole('button', { name: 'Déplacer la séance', exact: true }));
		const inchangee = seanceDuJour(page, J3, COURS_2);
		const phrase =
			(await inchangee.getByRole('alert').count()) === 1
				? await texteDe(inchangee.getByRole('alert'))
				: '';
		verifier(
			'« Déplacer la séance » sans rien changer, ni la date ni l’heure, est refusé avec une phrase, dans la carte, et rien n’est déplacé',
			(await inchangee.count()) === 1 &&
				/\p{L}{2,}.*\.$/u.test(phrase) &&
				!phrase.startsWith('Cette date est déjà passée.') &&
				!(await texteDe(inchangee)).includes('déplacée'),
			`${await inchangee.count()} carte(s) ; « ${phrase || 'aucune phrase'} »`
		);
		// Une date passée, que le navigateur refuserait de lui-même : le formulaire est envoyé sans sa
		// validation, et c'est le serveur qui doit la refuser, dans la carte rouverte.
		await depart.locator('form[action="?/deplacer"]').evaluate((formulaire) => {
			formulaire.setAttribute('novalidate', '');
		});
		await date.fill(plusJours(T, -1));
		await depart.getByLabel('Heure de début', { exact: true }).fill('20:30');
		await envoyer(page, depart.getByRole('button', { name: 'Déplacer la séance', exact: true }));
		const refus = seanceDuJour(page, J3, COURS_2).getByRole('alert');
		verifier(
			'une date passée est refusée, dans la carte de la séance',
			(await refus.count()) === 1 &&
				(await texteDe(refus)).startsWith('Cette date est déjà passée.'),
			(await refus.count()) === 1 ? await texteDe(refus) : 'aucun refus'
		);
		const rouverte = seanceDuJour(page, J3, COURS_2);
		await rouverte.getByLabel('Nouvelle date', { exact: true }).fill(J2);
		await rouverte.getByLabel('Heure de début', { exact: true }).fill('20:30');
		await envoyer(page, rouverte.getByRole('button', { name: 'Déplacer la séance', exact: true }));
		const parti = seanceDuJour(page, J3, COURS_2);
		verifier(
			`la séance du ${dateSuisse(J3)} part au ${dateSuisse(J2)}, plus tôt que prévu, et se dit déplacée`,
			(await texteDe(parti)).includes('déplacée') &&
				(await texteDe(parti)).includes(`Déplacée au ${dateLongue(J2)} à 20:30`),
			await texteDe(parti)
		);
		const arrivee = seanceDuJour(page, J2, COURS_2);
		verifier(
			`elle apparaît le ${dateSuisse(J2)}, en date exceptionnelle, prévue à l’origine le ${dateSuisse(J3)}`,
			(await texteDe(arrivee)).includes('date exceptionnelle') &&
				(await texteDe(arrivee)).includes(`Prévue à l’origine le ${dateLongue(J3)}`),
			await texteDe(arrivee)
		);
	});
}

/** Les jours, comme l'espace en français les écrit (`apps/web/src/lib/i18n.ts`). */
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** « samedi 26.09.2026 » : le nom du jour, puis la date en JJ.MM.AAAA (retour A3). */
const dateLongue = (iso) => `${JOURS[jourDeSemaine(iso) - 1]} ${dateSuisse(iso)}`;

/** c. Réglages, salle, deux cours, une séance annulée, une séance déplacée, publication. */
async function programme(page) {
	etape('c. Elle règle les langues, crée une salle et deux cours, annule, déplace, publie');
	await naviguer(page, '/reglages');
	await auditer(page, 'réglages');
	for (const langue of ['de', 'it', 'ar']) {
		await page.locator(`input[name="enabledLanguages"][value="${langue}"]`).check();
	}
	// L'anglais, cinquième langue du public (D1) : l'écran des réglages doit le proposer.
	await retour('D1', async () => {
		const anglais = page.locator(`input[name="enabledLanguages"][value="en"]`);
		verifier(
			'les réglages proposent l’anglais parmi les langues de la page publique',
			(await anglais.count()) === 1
		);
		await anglais.check();
	});
	await envoyer(
		page,
		page.locator('form:has(input[name="enabledLanguages"]) button[type="submit"]')
	);
	verifier(
		'les langues sont activées',
		(await texteDe(page.getByRole('status'))) === 'Réglages enregistrés.'
	);
	await page.locator('#salle').fill(SALLE);
	await envoyer(page, page.locator('form:has(#salle) button[type="submit"]'));
	const salles = page.locator('section', { has: page.locator('#salles-titre') }).locator('li');
	verifier('la salle est créée', (await texteDe(salles)).startsWith(SALLE), await texteDe(salles));

	// Les heures de prière, allumées ici pour que leurs écrans soient de ceux qu'on parcourt dans
	// les cinq langues ; elles se règlent à l'étape g.
	await envoyer(
		page,
		page.locator('form:has(input[name="allume"][value="oui"]) button[type="submit"]')
	);
	verifier(
		'les heures de prière sont activées, et la navigation mène à leurs deux écrans',
		(await navigationDeLEspace(page).locator('a[href="/prieres"]').count()) === 1 &&
			(await navigationDeLEspace(page).locator('a[href="/vendredi"]').count()) === 1
	);
	await retour('B1', async () => {
		const libelles = {
			prieres: await texteDe(navigationDeLEspace(page).locator('a[href="/prieres"]')),
			vendredi: await texteDe(navigationDeLEspace(page).locator('a[href="/vendredi"]'))
		};
		verifier(
			'la navigation nomme ces écrans par leur titre, « Heures de prière » et « Prière du vendredi »',
			libelles.prieres === 'Heures de prière' && libelles.vendredi === 'Prière du vendredi',
			`« ${libelles.prieres} », « ${libelles.vendredi} »`
		);
		const statut = await texteDe(page.getByRole('status'));
		verifier(
			'l’écran le confirme sans jargon, « Les heures de prière sont activées. »',
			statut === 'Les heures de prière sont activées.',
			statut
		);
	});

	etat.cours1 = await creerCours(page, {
		titre: COURS_1.fr,
		titreArabe: COURS_1.ar,
		public: 'kids',
		jour: jourDeSemaine(J1),
		debut: '18:00',
		fin: '19:00',
		etat: 'publié',
		auditer: true,
		clarte: true
	});
	etat.cours2 = await creerCours(page, {
		titre: COURS_2,
		public: 'adults',
		jour: jourDeSemaine(J3),
		debut: '20:00',
		fin: '21:30',
		etat: 'brouillon',
		descriptionSansTitre: true
	});
	await auditer(page, 'cours');

	await naviguer(page, '/');
	const premiere = seanceDuJour(page, J1, COURS_1.fr);
	const seconde = seanceDuJour(page, J3, COURS_2);
	verifier(
		`les séances du ${dateSuisse(J1)} et du ${dateSuisse(J3)} sont à l’accueil de l’espace`,
		(await premiere.count()) === 1 && (await seconde.count()) === 1
	);
	await optionsDesSeances(page, premiere, seconde);
	const ouverte = premiere.locator('details[open]');
	if ((await ouverte.count()) === 0 && (await boutonsDAnnulationVisibles(premiere).count()) === 0) {
		await premiere.getByText('Annuler ou déplacer', { exact: true }).click();
	}
	await envoyer(page, boutonsDAnnulationVisibles(premiere));
	verifier(
		`la séance du ${dateSuisse(J1)} est annulée, et peut être rétablie`,
		(await texteDe(premiere)).includes('annulée') &&
			(await premiere.getByRole('button', { name: 'Rétablir' }).count()) === 1,
		await texteDe(premiere.locator('.titre'))
	);
	await deplacerPlusTot(page);
	await auditer(page, 'accueil de l’espace');

	// Publier le second cours : c'est le champ de publication de sa fiche.
	await naviguer(page, '/cours');
	await page
		.locator('li')
		.filter({ hasText: COURS_2 })
		.locator(`a[href="/cours/${etat.cours2}"]`)
		.click();
	await page.waitForURL((adresse) => adresse.pathname === `/cours/${etat.cours2}`);
	await page.waitForLoadState('networkidle');
	await lireLEcran(page);
	verifier('sa fiche s’ouvre', (await titre(page)).includes(COURS_2), await titre(page));
	await auditer(page, 'un cours');
	await page.locator('#status').selectOption('published');
	await envoyer(page, page.locator('form.colonne button[type="submit"]'));
	const ligne = page.locator('li').filter({ hasText: COURS_2 });
	verifier(
		`« ${COURS_2} » est publié`,
		(await texteDe(ligne)).includes('publié'),
		await texteDe(ligne.locator('.titre'))
	);

	await naviguer(page, '/partager');
	await auditer(page, 'partager');
	const codes = await page
		.locator('textarea')
		.evaluateAll((zones) => zones.map((zone) => zone.value));
	etat.codeEmbarque = codes.find((code) => code.includes('<jadwal-widget')) ?? '';
	verifier(
		'l’écran Partager donne le code du widget',
		etat.codeEmbarque.includes(`${ORIGINE}/widget/jadwal-widget.js`) &&
			etat.codeEmbarque.includes(`<jadwal-widget org="${ORGANISATION.slug}">`)
	);
	etat.codeCadre = codes.find((code) => code.includes('<iframe')) ?? '';
	verifier(
		'l’écran Partager donne le cadre à coller à la main, sans embed=1',
		etat.codeCadre.includes(`<iframe src="${ORIGINE}/m/${ORGANISATION.slug}"`),
		etat.codeCadre.split('\n')[0]
	);
	await retour('B1', async () => {
		const texte = await texteDe(page.locator('main'));
		verifier(
			'l’écran Partager dit où coller le code, avec un exemple, et nomme le cadre sans jargon',
			texte.includes('Exemple : sur WordPress') &&
				(await page.getByLabel('Code du cadre à coller', { exact: true }).count()) === 1,
			texte.slice(0, 120)
		);
	});
}

/** Les deux cours tels qu'une page publique les montre : ce qu'on voit, barré ou non. */
async function seancesPubliques(page, titreDuCours) {
	const lignes = page
		.locator('li')
		.filter({ has: page.getByRole('link', { name: titreDuCours, exact: true }) });
	const vues = [];
	for (let index = 0; index < (await lignes.count()); index += 1) {
		const ligne = lignes.nth(index);
		const barree = await ligne
			.getByRole('link', { name: titreDuCours, exact: true })
			.evaluate((lien) => getComputedStyle(lien).textDecorationLine.includes('line-through'));
		// Une séance ordinaire ne porte aucune mention : on ne l'attend pas.
		const mention =
			(await ligne.locator('.marque').count()) > 0 ? await texteDe(ligne.locator('.marque')) : '';
		vues.push({ barree, mention, texte: await texteDe(ligne) });
	}
	return vues;
}

function sansChiffresOrientaux(html, ou) {
	const trouves = [...new Set(html.match(CHIFFRES_ORIENTAUX) ?? [])];
	verifier(`${ou} : aucun chiffre arabe oriental`, trouves.length === 0, trouves.join(' '));
}

/**
 * La balise `<html>` elle-même : c'est elle qui dit à un lecteur d'écran la langue du titre de
 * l'onglet et de tout ce qui n'est pas dans le bloc de la page.
 */
async function verifierLaBaliseHtml(page, adresse, langue) {
	const lang = await racineDit(page, 'lang');
	const dir = await racineDit(page, 'dir');
	const dirAttendu = langue === 'ar' ? 'rtl' : 'ltr';
	verifier(
		`${adresse} : <html lang="${langue}" dir="${dirAttendu}">`,
		lang === langue && dir === dirAttendu,
		`<html lang="${lang}" dir="${dir}">`
	);
}

/**
 * Le lien des conditions au pied d'une page publique, trouvé par son nom accessible entier, annonce
 * du nouvel onglet comprise : sa cible, sa langue, et ce que l'œil voit de l'annonce.
 */
async function lienDesConditions(cadre, langue) {
	const lien = cadre.locator('footer').getByRole('link', {
		name: avecNouvelOnglet(TEXTES_PUBLICS[langue].conditions, langue),
		exact: true
	});
	const nombre = await lien.count();
	return {
		lien,
		nombre,
		chemin: nombre === 1 ? await cheminDuLien(lien) : '',
		hreflang: nombre === 1 ? await lien.getAttribute('hreflang') : null,
		target: nombre === 1 ? await lien.getAttribute('target') : null,
		rel: nombre === 1 ? await lien.getAttribute('rel') : null,
		annonce: nombre === 1 ? await boiteDeLAnnonce(lien, langue) : { cachee: false, taille: '' }
	};
}

/** d. La page publique, dans les cinq langues. */
async function pagesPubliques(page) {
	etape('d. La page publique, dans les cinq langues');
	const segmentsFrancais = [];
	for (const langue of ['fr', 'de', 'it', 'en', 'ar']) {
		const adresse = `/m/${ORGANISATION.slug}${langue === 'fr' ? '' : `/${langue}`}`;
		const textes = TEXTES_PUBLICS[langue];
		// L'anglais est un retour à lui seul (D1) : toute cette page en dépend.
		await retour(langue === 'en' ? 'D1' : null, async () => {
			const reponse = await ouvrir(page, adresse);
			const racineDePage = page.locator('div[lang]').first();
			const lang = await racineDePage.getAttribute('lang');
			const dir = await racineDePage.getAttribute('dir');
			const dirAttendu = langue === 'ar' ? 'rtl' : 'ltr';
			verifier(
				`${adresse} s’affiche, lang="${langue}" dir="${dirAttendu}"`,
				reponse?.status() === 200 && lang === langue && dir === dirAttendu,
				`rendu ${reponse?.status()}, lang="${lang}" dir="${dir}"`
			);
			await verifierLaBaliseHtml(page, adresse, langue);
			const titre1 = langue === 'ar' ? COURS_1.ar : COURS_1.fr;
			const premier = await seancesPubliques(page, titre1);
			const second = await seancesPubliques(page, COURS_2);
			verifier(
				`${adresse} : les deux cours y sont`,
				premier.length > 0 && second.length > 0,
				`${titre1}, ${COURS_2}`
			);
			verifier(
				`${adresse} : la séance annulée reste visible, barrée, avec sa mention`,
				premier.length === 1 && premier[0].barree && premier[0].mention.length > 0,
				premier.map((vue) => vue.mention).join(' | ')
			);
			// Au départ, la mention dit où va la séance ; à l'arrivée, la marque dit « date
			// exceptionnelle » et le détail d'où elle vient. Chacune avec sa date entière, JJ.MM.AAAA.
			await retour('A2', async () => {
				const depart = second.find((vue) => vue.barree);
				const arrivee = second.find((vue) => !vue.barree);
				const debutDeLaPhrase = arrivee?.texte.indexOf(textes.arrivee) ?? -1;
				const phraseDArrivee =
					arrivee && debutDeLaPhrase >= 0 ? arrivee.texte.slice(debutDeLaPhrase) : '';
				verifier(
					`${adresse} : la séance ramenée plus tôt se voit au départ (${dateSuisse(J3)}) et à l’arrivée (${dateSuisse(J2)})`,
					second.length === 2 &&
						Boolean(depart?.mention.startsWith(textes.depart)) &&
						(depart?.mention ?? '').includes(dateSuisse(J2)) &&
						Boolean(arrivee?.mention) &&
						arrivee?.texte.includes(textes.arrivee) === true &&
						phraseDArrivee.includes(dateSuisse(J3)),
					`${depart?.mention ?? 'départ absent'} | ${arrivee?.mention ?? 'arrivée absente'} · ${phraseDArrivee}`
				);
			});
			// Un nouvel onglet ici aussi : la même adresse, sans `embed=1`, est celle du cadre que
			// l'écran Partager donne à coller à la main, et `/conditions` refuse d'être encadrée. Le
			// lien le dit aux lecteurs d'écran, dans la langue de la page, et à eux seuls.
			const nomAttendu = avecNouvelOnglet(textes.conditions, langue);
			const nomsSelonChrome = await nomsDesLiensSelonChrome(page);
			const conditions = await lienDesConditions(page, langue);
			verifier(
				`${adresse} : le nom accessible du lien des conditions est « ${nomAttendu} », selon playwright et selon Chrome, et l’annonce est cachée aux yeux`,
				conditions.nombre === 1 &&
					nomsSelonChrome.includes(nomAttendu) &&
					conditions.annonce.cachee,
				`Chrome : ${
					nomsSelonChrome.filter((nom) => nom.startsWith(textes.conditions)).join(' | ') ||
					'aucun lien de ce nom'
				} ; playwright : ${conditions.nombre} lien ; annonce ${conditions.annonce.taille}`
			);
			verifier(
				`${adresse} : le pied porte ce lien, vers /conditions, dans un nouvel onglet`,
				conditions.nombre === 1 &&
					conditions.chemin === '/conditions' &&
					conditions.hreflang === 'fr' &&
					conditions.target === '_blank' &&
					(conditions.rel ?? '').split(' ').includes('noopener'),
				`${conditions.nombre} lien, ${conditions.chemin}, hreflang="${conditions.hreflang}", ` +
					`target="${conditions.target}" rel="${conditions.rel}"`
			);
			if (langue === 'ar') sansChiffresOrientaux(await page.content(), adresse);
			if (langue === 'fr') segmentsFrancais.push(...(await segmentsLus(page)));
			if (langue === 'en') {
				const restes = resteEnFrancais(segmentsFrancais, await segmentsLus(page), NOMS_SAISIS);
				verifier(
					`${adresse} : aucune phrase de la page française n’y reste en français`,
					restes.length === 0,
					restes.slice(0, 5).join(' | ')
				);
			}
			if (langue in CONDITIONS_EN_FRANCAIS_SEULEMENT) {
				await conditionsDansUneAutreLangue(page, conditions, langue);
			}
		});
	}

	for (const langue of ['fr', 'en', 'ar']) {
		const base = `/m/${ORGANISATION.slug}${langue === 'fr' ? '' : `/${langue}`}`;
		await retour(langue === 'en' ? 'D1' : null, async () => {
			for (const [vue, requete] of [
				['semaine', ''],
				['cours', '?vue=cours'],
				['mois', '?vue=mois']
			]) {
				await ouvrir(page, `${base}${requete}`);
				if (langue === 'ar' && vue !== 'semaine')
					sansChiffresOrientaux(await page.content(), `${base}${requete}`);
				if (langue !== 'en') await auditer(page, `page publique ${langue}, vue ${vue}`);
			}
			const reponse = await ouvrir(page, `${base}/cours/${etat.cours1}`);
			verifier(`${base}/cours/<id> s’affiche`, reponse?.status() === 200, await titre(page));
			if (langue !== 'fr') await verifierLaBaliseHtml(page, `${base}/cours/<id>`, langue);
			if (langue === 'ar') sansChiffresOrientaux(await page.content(), `${base}/cours/<id>`);
			if (langue !== 'en') await auditer(page, `page d’un cours ${langue}`);
			const abonnement = await ouvrir(page, `${base}/agenda`);
			verifier(`${base}/agenda s’affiche`, abonnement?.status() === 200, await titre(page));
			if (langue !== 'fr') await verifierLaBaliseHtml(page, `${base}/agenda`, langue);
			if (langue === 'ar') sansChiffresOrientaux(await page.content(), `${base}/agenda`);
			if (langue !== 'en') await auditer(page, `page d’abonnement ${langue}`);
		});
	}
}

/**
 * Les conditions ouvertes depuis la page publique dans une autre langue que le français (D4) : le
 * texte reste en français, précédé d'une phrase dans la langue de la page qui le dit.
 */
async function conditionsDansUneAutreLangue(page, conditions, langue) {
	await retour('D4', async () => {
		const adresse = await conditions.lien.evaluate(
			(a) => /** @type {HTMLAnchorElement} */ (a).href
		);
		await ouvrir(page, adresse);
		const phrase = await texteDe(page.locator('main p').first());
		const texte = page.locator('main div[lang="fr"]');
		verifier(
			`les conditions ouvertes depuis /m/${ORGANISATION.slug}/${langue} disent d’abord, dans cette langue, qu’elles n’existent qu’en français`,
			(await racineDit(page, 'lang')) === langue &&
				phrase === CONDITIONS_EN_FRANCAIS_SEULEMENT[langue] &&
				(await texte.count()) === 1 &&
				(await texteDe(texte)).includes('Dernière mise à jour'),
			`<html lang="${await racineDit(page, 'lang')}">, « ${phrase} »`
		);
	});
}

/** Le cadre que le widget pose sur la page hôte, attendu quinze secondes au plus. */
async function cadreDuWidget(page, debut) {
	let cadre;
	for (let essai = 0; essai < 60 && !cadre; essai += 1) {
		cadre = page.frames().find((f) => f.url().startsWith(debut));
		if (!cadre) await attendre(250);
	}
	return cadre;
}

/**
 * e. Le widget, sur une page d'une autre origine, servie par ce script. Puis le cadre posé à la
 * main, sur une seconde page du même site, et le widget en anglais sur une troisième (D1).
 */
async function widget(page) {
	etape('e. Le widget, posé sur le site d’une organisation');
	const html =
		'<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n' +
		'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
		'<title>Le site d’une organisation</title>\n</head>\n<body>\n<main>\n' +
		`<h1>Notre programme</h1>\n${etat.codeEmbarque}\n</main>\n</body>\n</html>\n`;
	// Le même site, avec le cadre posé à la main que donne aussi l'écran Partager, pour un site qui
	// refuse tout script extérieur (`docs/INTEGRATION.md`).
	// Une fonction, et non une chaîne : `replace` lirait un `$` du code collé comme un motif.
	const htmlCadre = html.replace(etat.codeEmbarque, () => etat.codeCadre);
	// Le même code, avec la langue demandée au widget : l'anglais (D1).
	const htmlAnglais = html
		.replace('<html lang="fr">', '<html lang="en">')
		.replace('<jadwal-widget ', '<jadwal-widget lang="en" ');
	const hote = createServer((requete, reponse) => {
		const pages = { '/': html, '/cadre': htmlCadre, '/en': htmlAnglais };
		const corps = pages[/** @type {keyof typeof pages} */ (requete.url ?? '')];
		if (corps) {
			reponse.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
			reponse.end(corps);
		} else {
			reponse.writeHead(404);
			reponse.end();
		}
	});
	await new Promise((resolue) => hote.listen(0, '127.0.0.1', () => resolue(undefined)));
	try {
		const { port } = /** @type {import('node:net').AddressInfo} */ (hote.address());
		const origineHote = `http://127.0.0.1:${port}`;
		await ouvrir(page, `${origineHote}/`);
		verifier(
			'la page d’essai est servie sur une autre origine',
			new URL(page.url()).origin !== ORIGINE,
			origineHote
		);

		const cadre = await cadreDuWidget(page, `${ORIGINE}/m/${ORGANISATION.slug}`);
		verifier(
			'le widget pose son cadre',
			Boolean(cadre),
			cadre ? new URL(cadre.url()).pathname + new URL(cadre.url()).search : ''
		);
		const encadree = /** @type {import('playwright-core').Frame} */ (cadre);
		await encadree.waitForLoadState('load');
		await lireLEcran(encadree);
		const texte = await encadree.locator('body').innerText();
		verifier(
			'le cadre montre les deux cours',
			texte.includes(COURS_1.fr) && texte.includes(COURS_2),
			`${COURS_1.fr}, ${COURS_2}`
		);
		etat.segmentsDuCadre = await segmentsLus(encadree);

		let mesure = { cadre: 0, contenu: 0 };
		for (let essai = 0; essai < 40; essai += 1) {
			mesure = {
				cadre: await page.evaluate(
					() =>
						document
							.querySelector('jadwal-widget')
							?.shadowRoot?.querySelector('iframe')
							?.getBoundingClientRect().height ?? 0
				),
				contenu: await encadree.evaluate(
					() => document.documentElement.getBoundingClientRect().height
				)
			};
			if (Math.abs(mesure.cadre - Math.max(mesure.contenu, HAUTEUR_INITIALE_DU_CADRE)) <= 2) break;
			await attendre(250);
		}
		verifier(
			'le cadre a pris la hauteur de son contenu',
			mesure.cadre > 0 &&
				Math.abs(mesure.cadre - Math.max(mesure.contenu, HAUTEUR_INITIALE_DU_CADRE)) <= 2,
			`cadre ${Math.round(mesure.cadre)} px, contenu ${Math.round(mesure.contenu)} px, ${HAUTEUR_INITIALE_DU_CADRE} px au départ`
		);
		await lienDuWidget(page, 'fr');

		// `/conditions` refuse d'être encadrée : dans le cadre, le lien doit ouvrir un nouvel onglet.
		const conditions = await lienDesConditions(encadree, 'fr');
		verifier(
			'dans le cadre, le lien des conditions s’ouvre dans un nouvel onglet',
			conditions.nombre === 1 &&
				conditions.chemin === '/conditions' &&
				conditions.target === '_blank' &&
				(conditions.rel ?? '').split(' ').includes('noopener'),
			`target="${conditions.target}" rel="${conditions.rel}"`
		);
		await auditer(page, 'page hôte du widget', { iframes: false });
		await auditer(encadree, `page encadrée (/m/${ORGANISATION.slug}?embed=1)`);

		// Le cadre posé à la main charge la page publique sans `embed=1`. Le lien des conditions doit
		// y ouvrir un nouvel onglet, et non charger dans le cadre une page qui refuse d'être encadrée.
		await ouvrir(page, `${origineHote}/cadre`);
		const adresseDuCadre = `${ORIGINE}/m/${ORGANISATION.slug}`;
		let manuel;
		for (let essai = 0; essai < 60 && !manuel; essai += 1) {
			manuel = page.frames().find((f) => f.url() === adresseDuCadre);
			if (!manuel) await attendre(250);
		}
		verifier('le cadre posé à la main montre la page publique', Boolean(manuel), adresseDuCadre);
		const cadreManuel = /** @type {import('playwright-core').Frame} */ (manuel);
		await cadreManuel.waitForLoadState('load');
		const lienManuel = await lienDesConditions(cadreManuel, 'fr');
		verifier(
			'dans le cadre posé à la main, le lien des conditions s’ouvre dans un nouvel onglet',
			lienManuel.nombre === 1 &&
				lienManuel.chemin === '/conditions' &&
				lienManuel.target === '_blank' &&
				(lienManuel.rel ?? '').split(' ').includes('noopener'),
			`target="${lienManuel.target}" rel="${lienManuel.rel}"`
		);
		const [onglet] = await Promise.all([
			page.context().waitForEvent('page'),
			lienManuel.lien.click()
		]);
		await onglet.waitForLoadState('load');
		const titreDeLOnglet = await titre(onglet);
		verifier(
			'le clic ouvre /conditions dans un onglet à part, et le cadre garde le programme',
			chemin(onglet) === '/conditions' &&
				titreDeLOnglet === 'Conditions d’utilisation' &&
				cadreManuel.url() === adresseDuCadre,
			`onglet ${chemin(onglet)} « ${titreDeLOnglet} », cadre ${new URL(cadreManuel.url()).pathname}`
		);
		await onglet.close();

		// Le widget en anglais (D1) : son lien, son cadre, et rien de la version française.
		await retour('D1', async () => {
			await ouvrir(page, `${origineHote}/en`);
			// Le cadre que le widget pose, quelle que soit sa langue : c'est son adresse qu'on juge.
			const cadreAnglais = /** @type {import('playwright-core').Frame} */ (
				await cadreDuWidget(page, `${ORIGINE}/m/${ORGANISATION.slug}`)
			);
			const adresseAnglaise = new URL(cadreAnglais.url());
			verifier(
				'le widget demandé en anglais pose le cadre de la page anglaise',
				adresseAnglaise.pathname === `/m/${ORGANISATION.slug}/en`,
				adresseAnglaise.pathname + adresseAnglaise.search
			);
			await cadreAnglais.waitForLoadState('load');
			await lireLEcran(cadreAnglais);
			await lienDuWidget(page, 'en');
			const restes = resteEnFrancais(
				etat.segmentsDuCadre,
				await segmentsLus(cadreAnglais),
				NOMS_SAISIS
			);
			verifier(
				'dans le cadre anglais, aucune phrase du cadre français ne reste en français',
				(await cadreAnglais.locator('html').getAttribute('lang')) === 'en' && restes.length === 0,
				restes.slice(0, 5).join(' | ')
			);
		});
	} finally {
		await new Promise((resolue) => hote.close(() => resolue(undefined)));
	}
}

/**
 * Sous le cadre, le lien vers la page publique ouvre un nouvel onglet : il le dit aux lecteurs
 * d'écran, dans la langue du widget. Il vit dans le shadow root du widget, que Chrome et
 * playwright traversent.
 */
async function lienDuWidget(page, langue) {
	const nomAttendu = avecNouvelOnglet(LIEN_DU_WIDGET[langue], langue);
	const lien = page.locator('jadwal-widget').getByRole('link', { name: nomAttendu, exact: true });
	const nombre = await lien.count();
	const nomsSurLHote = await nomsDesLiensSelonChrome(page);
	const annonce =
		nombre === 1 ? await boiteDeLAnnonce(lien, langue) : { cachee: false, taille: '' };
	const cible = `/m/${ORGANISATION.slug}${langue === 'fr' ? '' : `/${langue}`}`;
	verifier(
		`le nom accessible du lien du widget est « ${nomAttendu} », selon playwright et selon Chrome, et l’annonce est cachée aux yeux`,
		nombre === 1 &&
			nomsSurLHote.includes(nomAttendu) &&
			annonce.cachee &&
			(await lien.getAttribute('target')) === '_blank' &&
			(await cheminDuLien(lien)) === cible,
		`Chrome : ${nomsSurLHote.join(' | ') || 'aucun lien'} ; playwright : ${nombre} lien ; annonce ${annonce.taille}`
	);
}

/**
 * Le flux agenda, déplié, rangé en événements. Sa langue passe par `?lang=`, comme l'adresse que
 * donne la page d'abonnement (`apps/web/src/lib/public/liens.ts`).
 */
async function fluxAgenda(langue) {
	const requete = langue ? `?lang=${langue}` : '';
	const reponse = await fetch(
		`http://127.0.0.1:${PORT}/m/${ORGANISATION.slug}/agenda.ics${requete}`
	);
	const texte = (await reponse.text()).replace(/\r\n[ \t]/g, '');
	const evenements = texte
		.split('BEGIN:VEVENT')
		.slice(1)
		.map((bloc) => (bloc.split('END:VEVENT')[0] ?? '').split('\r\n').filter(Boolean));
	return { statut: reponse.status, texte, evenements };
}

const champ = (evenement, nom) =>
	evenement.filter((ligne) => ligne.startsWith(`${nom}:`) || ligne.startsWith(`${nom};`));

/** f. Le flux agenda : les deux cours, la semaine annulée, la séance déplacée. */
async function agenda() {
	etape('f. Le flux agenda');
	const { statut, evenements } = await fluxAgenda();
	verifier(
		`/m/${ORGANISATION.slug}/agenda.ics rend 200`,
		statut === 200,
		`${evenements.length} événements`
	);
	const serie1 = evenements.find(
		(evenement) =>
			evenement.includes(`SUMMARY:${COURS_1.fr}`) && champ(evenement, 'RRULE').length > 0
	);
	verifier('le premier cours y est, avec sa règle de récurrence', Boolean(serie1));
	const exdate = champ(serie1 ?? [], 'EXDATE');
	verifier(
		`son EXDATE est la semaine annulée (${dateSuisse(J1)})`,
		exdate.some((ligne) => ligne.includes(compacte(J1))),
		exdate.join(' ')
	);
	const second = evenements.filter((evenement) => evenement.includes(`SUMMARY:${COURS_2}`));
	verifier(
		'le second cours y est, avec sa règle de récurrence',
		second.some((evenement) => champ(evenement, 'RRULE').length > 0)
	);
	await retour('A2', async () => {
		const deplace = second.find((evenement) =>
			champ(evenement, 'RECURRENCE-ID').some((ligne) => ligne.includes(compacte(J3)))
		);
		verifier(
			`la séance ramenée plus tôt a son RECURRENCE-ID (${dateSuisse(J3)}) et sa nouvelle date, la veille (${dateSuisse(J2)})`,
			Boolean(deplace) &&
				champ(deplace ?? [], 'DTSTART').some((ligne) => ligne.includes(`${compacte(J2)}T2030`)),
			deplace
				? [...champ(deplace, 'RECURRENCE-ID'), ...champ(deplace, 'DTSTART')].join(' ')
				: 'absente'
		);
	});
}

/**
 * Ce que la page d'abonnement propose à un appareil donné (E1, E2) : le bloc de « Tout le
 * programme », ses liens, et ce qu'il dit du délai de Google.
 */
async function abonnementSelon(navigateur, agent) {
	const contexte = await nouveauContexte(navigateur, { userAgent: agent });
	try {
		const page = await contexte.newPage();
		const reponse = await ouvrir(page, `/m/${ORGANISATION.slug}/agenda`);
		const bloc = page.locator('.abonnement').first();
		const present = (await bloc.count()) === 1;
		const liens = present
			? await bloc.locator('a').evaluateAll((tous) =>
					tous.map((a) => ({
						href: /** @type {HTMLAnchorElement} */ (a).href,
						texte: (a.textContent ?? '').replace(/\s+/g, ' ').trim(),
						target: a.getAttribute('target')
					}))
				)
			: [];
		// Les paragraphes du bloc, dans l'ordre : un lien, une adresse à copier, ou une phrase.
		const paragraphes = present
			? await bloc.locator('p').evaluateAll((tous) =>
					tous.map((p) => ({
						lien: /** @type {HTMLAnchorElement | null} */ (p.querySelector('a'))?.href ?? '',
						adresse: (p.querySelector('code')?.textContent ?? '').trim(),
						texte: (p.textContent ?? '').replace(/\s+/g, ' ').trim()
					}))
				)
			: [];
		return {
			vary: (reponse?.headers()['vary'] ?? '').toLowerCase(),
			appareil: present ? await bloc.getAttribute('data-appareil') : null,
			liens,
			paragraphes,
			texte: present ? await texteDe(bloc) : '',
			page: present ? await texteDe(page.locator('main')) : ''
		};
	} finally {
		await contexte.close();
	}
}

/** E. L'agenda selon l'appareil : iPhone, Android, ordinateur (E1), et le délai de Google (E2). */
async function appareils(navigateur) {
	etape('E. La page d’abonnement selon l’appareil du visiteur');
	const webcal = `webcal://${new URL(ORIGINE).host}/m/${ORGANISATION.slug}/agenda.ics`;
	const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
	const outlook = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(webcal)}`;
	const commencePar = (href, debut) => href.startsWith(debut);

	const iphone = await abonnementSelon(navigateur, APPAREILS.iphone);
	const android = await abonnementSelon(navigateur, APPAREILS.android);
	const windows = await abonnementSelon(navigateur, APPAREILS.windows);
	await retour('E1', async () => {
		verifier(
			'sur un iPhone, le premier lien est l’abonnement webcal, sans Google ni Outlook',
			commencePar(iphone.liens[0]?.href ?? '', webcal) &&
				!iphone.liens.some((lien) => commencePar(lien.href, 'https://calendar.google.com')) &&
				!iphone.liens.some((lien) => commencePar(lien.href, 'https://outlook.live.com')),
			iphone.liens.map((lien) => lien.href).join(' ') || 'aucun lien'
		);
		verifier(
			'sur un Android, le lien ouvre Google Agenda avec la demande d’abonnement prête, dans un nouvel onglet',
			commencePar(android.liens[0]?.href ?? '', google) && android.liens[0]?.target === '_blank',
			android.liens.map((lien) => lien.href).join(' ') || 'aucun lien'
		);
		// La forme de la page, et non ses phrases, qu'un autre chantier récrit : le bouton de Google
		// d'abord, puis une phrase qui propose de passer par un ordinateur, et l'adresse à y coller
		// après elle.
		const adresseACopier = `http://${new URL(ORIGINE).host}/m/${ORGANISATION.slug}/agenda.ics`;
		const bouton = android.paragraphes.findIndex((p) => commencePar(p.lien, google));
		const parUnOrdinateur = android.paragraphes.findIndex(
			(p, index) => index > bouton && !p.lien && !p.adresse && /ordinateur/i.test(p.texte)
		);
		const adresse = android.paragraphes.findIndex((p) => p.adresse === adresseACopier);
		verifier(
			'sur un Android, après le bouton de Google, une issue par un ordinateur, puis l’adresse à y coller',
			android.appareil === 'android' &&
				bouton === 0 &&
				parUnOrdinateur > bouton &&
				adresse > parUnOrdinateur,
			`bloc « ${android.appareil} » ; bouton ${bouton}, ordinateur ${parUnOrdinateur}, adresse ${adresse} sur ${android.paragraphes.length} paragraphes`
		);
		verifier(
			'sur un PC Windows, le choix entre Google Agenda, Outlook, une autre application, et l’adresse à copier',
			windows.liens.some((lien) => commencePar(lien.href, google)) &&
				windows.liens.some((lien) => commencePar(lien.href, outlook)) &&
				windows.liens.some((lien) => commencePar(lien.href, webcal)) &&
				windows.texte.includes(`http://${new URL(ORIGINE).host}/m/${ORGANISATION.slug}/agenda.ics`),
			windows.liens.map((lien) => lien.texte).join(' | ') || 'aucun lien'
		);
		verifier(
			'la réponse dit aux caches qu’elle dépend de l’appareil (Vary)',
			iphone.vary.includes('sec-ch-ua-platform') && iphone.vary.includes('user-agent'),
			`Vary: ${iphone.vary}`
		);
	});
	await retour('E2', async () => {
		verifier(
			'la page dit que Google peut mettre jusqu’à 24 heures, sur Android comme sur un ordinateur',
			/jusqu’à 24 heures/.test(android.texte) && /jusqu’à 24 heures/.test(windows.texte),
			`Android : ${android.texte.slice(0, 80)}`
		);
	});
}

/** Le choix de la localité du parcours, parmi les réponses de la recherche. */
const radioDeLaLocalite = (page) =>
	page.getByRole('radio', { name: LOCALITE.libelle, exact: true });

/**
 * Les réglages du calcul que l'écran des prières vient d'enregistrer, lus dans ses champs par leur
 * `id`, avec la position que la liste donne à la localité et le fuseau de l'organisation.
 */
async function reglageEnregistre(page) {
	const valeur = (id) => page.locator(`#${id}`).inputValue();
	/** @type {Record<string, number>} */
	const ajustements = {};
	for (const priere of PRIERES) ajustements[priere] = Number(await valeur(`${priere}Adjustment`));
	return {
		...positionDeLaListe(),
		timeZone: FUSEAU,
		method: await valeur('method'),
		madhab: await valeur('madhab'),
		highLatitudeRule: await valeur('highLatitudeRule'),
		adjustments: ajustements
	};
}

/**
 * Les jours d'un tableau d'heures de prière : la date, lue dans l'en-tête de la ligne, puis une
 * heure par prière, lue dans la cellule ou dans l'élément `cellule` qu'elle contient.
 */
async function heuresDuTableau(lignes, cellule) {
	const lus = await lignes.evaluateAll(
		(rangees, selecteur) =>
			rangees.map((rangee) => ({
				jour: rangee.querySelector('th')?.textContent ?? '',
				heures: [...rangee.querySelectorAll('td')].map(
					(td) => (selecteur ? td.querySelector(selecteur) : td)?.textContent ?? ''
				)
			})),
		cellule
	);
	return lus.map((lu) => ({
		date: isoDuTexte(lu.jour),
		heures: lu.heures.map((texte) => /\d{2}:\d{2}/.exec(texte)?.[0] ?? '–')
	}));
}

/** Les jours lus qui diffèrent du calcul, un par ligne : ce qu'on lit, puis ce qui est calculé. */
function ecartsAuCalcul(jours, calculees) {
	return jours.flatMap((jour) => {
		const attendues = PRIERES.map((priere) => calculees?.[jour.date]?.[priere] ?? '?');
		if (attendues.join(' ') === jour.heures.join(' ')) return [];
		const date = jour.date ? dateSuisse(jour.date) : 'date illisible';
		return [`${date} : lu ${jour.heures.join(' ')}, calculé ${attendues.join(' ')}`];
	});
}

/**
 * Ce que la page publique écrit pour un cours ancré sur le maghrib dans `dans` jours, `minutes`
 * après la prière (avant, si négatif) : le libellé, puis son début, tiré du maghrib calculé pour la
 * localité.
 */
function heureAncree(libelle, dans, minutes) {
	const maghrib = etat.heures?.[plusJours(T, dans)]?.maghrib;
	return maghrib
		? `${libelle} (${debutAncre(maghrib, minutes)})`
		: `${libelle} (heure calculée inconnue)`;
}

/**
 * Les messages prêts à coller de Partager (D1) : un par langue que l'organisation publie, la sienne
 * d'abord et seule ouverte, chacun marqué de sa langue et de son sens. La session du vendredi, qui
 * garde le nom proposé, y prend le nom de la prière dans la langue du message.
 */
async function messagesDuPartage(page) {
	await retour('D1', async () => {
		await naviguer(page, '/partager');
		const lus = await page.locator('details.message').evaluateAll((replis) =>
			replis.map((repli) => {
				const zone = repli.querySelector('textarea');
				return {
					ouvert: /** @type {HTMLDetailsElement} */ (repli).open,
					lang: zone?.getAttribute('lang') ?? '',
					dir: zone?.getAttribute('dir') ?? '',
					texte: zone?.value ?? ''
				};
			})
		);
		const langues = lus.map((lu) => lu.lang);
		verifier(
			`Partager donne un message par langue publiée, les ${LANGUES.length}, le français de l’organisation d’abord et seul ouvert`,
			lus.length === LANGUES.length &&
				LANGUES.every((langue) => langues.includes(langue)) &&
				langues[0] === 'fr' &&
				lus.every((lu, index) => lu.ouvert === (index === 0)),
			lus.map((lu) => `${lu.lang || 'sans langue'}${lu.ouvert ? ' (ouvert)' : ''}`).join(', ') ||
				'aucun repli'
		);
		verifier(
			'chaque message porte sa langue et son sens, de droite à gauche en arabe',
			lus.length > 0 &&
				lus.every(
					(lu) => LANGUES.includes(lu.lang) && lu.dir === (lu.lang === 'ar' ? 'rtl' : 'ltr')
				),
			lus.map((lu) => `lang="${lu.lang}" dir="${lu.dir}"`).join(', ') || 'aucune zone'
		);
		const fautifs = sansLeNomDeLaPriere(lus);
		verifier(
			`la session du vendredi y porte le nom de la prière dans la langue du message : ${NOMS_TRADUITS}`,
			lus.length > 0 && fautifs.length === 0,
			lignesDuVendredi(lus, fautifs, VENDREDI.debut)
		);
	});
}

/** Les noms de la prière du vendredi hors du français, tels qu'une vérification les annonce. */
const NOMS_TRADUITS = LANGUES.filter((langue) => langue !== 'fr')
	.map((langue) => `« ${PRIERE_DU_VENDREDI[langue]} »`)
	.join(', ');

/**
 * Les langues dont le message ne nomme pas la session du vendredi comme il le doit (D1) : chacun
 * porte le nom de la prière dans sa langue, et, hors du français, jamais le nom français.
 */
function sansLeNomDeLaPriere(lus) {
	return LANGUES.filter((langue) => {
		const texte = lus.find((lu) => lu.lang === langue)?.texte ?? '';
		return (
			!texte.includes(PRIERE_DU_VENDREDI[langue]) ||
			(langue !== 'fr' && texte.includes(PRIERE_DU_VENDREDI.fr))
		);
	});
}

/** Ce qu'on imprime pour ces langues : la ligne de chaque message qui porte l'heure de la session. */
function lignesDuVendredi(lus, langues, heure) {
	return langues
		.map((langue) => {
			const texte = lus.find((lu) => lu.lang === langue)?.texte ?? '';
			const ligne = texte.split('\n').find((une) => une.includes(heure));
			return `${langue} : ${ligne?.trim() ?? `aucune ligne à ${heure}`}`;
		})
		.join(' ; ');
}

/**
 * Les messages prêts à coller d'« À venir », dans l'ordre : ceux du programme de la semaine
 * (`semaine`), ou ceux de la dernière action (`message`), chacun avec sa langue.
 */
async function messagesDeLAccueil(page, prefixe) {
	return page.locator(`details textarea[id^="${prefixe}-"]`).evaluateAll((zones) =>
		zones.map((zone) => ({
			lang: zone.getAttribute('lang') ?? '',
			texte: /** @type {HTMLTextAreaElement} */ (zone).value
		}))
	);
}

/**
 * g. Les heures de prière, par la question (C1) et la localité (C2) ; une session du vendredi ; trois
 * cours ancrés, dont un avant une prière (C3) ; l'onglet « Prières » du public (C4).
 */
async function prieres(page, navigateur) {
	etape('g. Les heures de prière, trois cours ancrés, l’onglet « Prières » du public');
	await naviguer(page, '/prieres');
	// Aucune requête ne doit quitter le service pendant la recherche d'une localité (C2).
	const ailleurs = [];
	const surveiller = (requete) => {
		const adresse = new URL(requete.url());
		if (!['localhost', '127.0.0.1'].includes(adresse.hostname) && adresse.protocol !== 'data:')
			ailleurs.push(adresse.host);
	};
	page.on('request', surveiller);

	await retour('C1', async () => {
		const question = page.getByRole('group', { name: 'D’où viennent vos heures de prière ?' });
		const reponses = [
			'Calculées pour votre localité',
			'Importées depuis un fichier',
			'Saisies à la main'
		];
		const presentes = [];
		for (const reponse of reponses) {
			presentes.push(
				await question.getByRole('radio', { name: new RegExp(`^${reponse}`) }).count()
			);
		}
		verifier(
			'l’écran commence par « D’où viennent vos heures de prière ? », avec ses trois réponses',
			presentes.every((nombre) => nombre === 1),
			reponses.map((reponse, index) => `${reponse} : ${presentes[index]}`).join(', ')
		);
		verifier(
			'« Source que vous déclarez » a disparu, et rien du calcul n’est montré avant la réponse',
			(await page.getByLabel('Source que vous déclarez').count()) === 0 &&
				(await page.locator('#latitude').count()) === 0,
			`${await page.locator('#latitude').count()} champ de latitude`
		);
		await question.getByRole('radio', { name: /^Calculées pour votre localité/ }).check();
	});

	await retour('C2', async () => {
		const recherche = page.getByLabel('Nom ou NPA de la localité', { exact: true });
		await recherche.fill(LOCALITE.nom);
		await radioDeLaLocalite(page).waitFor();
		verifier(
			`par son nom, « ${LOCALITE.nom} », la localité « ${LOCALITE.libelle} » est proposée`,
			(await radioDeLaLocalite(page).count()) === 1
		);
		await recherche.fill('');
		await recherche.fill(LOCALITE.npa);
		await page
			.getByRole('group', { name: 'Choisissez votre localité' })
			.getByRole('radio')
			.first()
			.waitFor();
		const proposees = await page
			.getByRole('group', { name: 'Choisissez votre localité' })
			.getByRole('radio')
			.count();
		verifier(
			`par son NPA, « ${LOCALITE.npa} », elle est proposée aussi`,
			(await radioDeLaLocalite(page).count()) === 1,
			`${proposees} réponse(s)`
		);
		await radioDeLaLocalite(page).check();
		const choisie = await texteDe(page.locator('.choisie'));
		const credit = await texteDe(page.locator('.credit'));
		verifier(
			'la localité choisie donne sa position, et l’attribution de swisstopo est écrite',
			choisie.startsWith(`Localité choisie : ${LOCALITE.libelle}`) &&
				choisie.includes('latitude') &&
				credit.includes('swisstopo'),
			`${choisie} · ${credit}`
		);
		verifier(
			'la recherche n’a interrogé aucun service extérieur',
			ailleurs.length === 0,
			ailleurs.join(' ')
		);
	});

	await retour('C1', async () => {
		await envoyer(page, page.getByRole('button', { name: 'Voir l’aperçu', exact: true }));
		const apercu = page.locator('section', {
			has: page.getByRole('heading', { name: 'Aperçu des sept prochains jours', exact: true })
		});
		const lignes = apercu.locator('.defile tbody tr');
		verifier(
			'« Voir l’aperçu » montre les sept prochains jours avant tout enregistrement, puis « Enregistrer »',
			(await lignes.count()) === 7 &&
				(await page.getByRole('button', { name: 'Enregistrer', exact: true }).count()) === 1,
			(await lignes.count()) > 0
				? (await lignes.first().innerText()).replace(/\s+/g, ' ')
				: 'aucun aperçu'
		);
		await envoyer(page, page.getByRole('button', { name: 'Enregistrer', exact: true }));
	});
	await retour('C2', async () => {
		// L'écran le confirme, puis dit d'où viennent désormais les heures : de cette localité, et
		// non d'une position vide, qu'un ancien écran enregistrait aussi sans rien dire.
		const confirmation = await texteDe(page.getByRole('status'));
		const etat = await texteDe(page.locator('section', { has: page.locator('#etat-titre') }));
		verifier(
			`la localité de ${LOCALITE.nom} est enregistrée, et l’écran dit que les heures en viennent`,
			confirmation.startsWith('Réglages enregistrés.') &&
				etat.includes(`Vos heures sont calculées pour cette localité : ${LOCALITE.libelle}`),
			`${confirmation} · ${etat.slice(0, 120)}`
		);
	});
	page.off('request', surveiller);
	await retour('C2', async () => {
		// Les heures attendues, pour tous les jours que ce parcours lit : celles que `@jadwal/core`
		// calcule pour la position de la liste, avec les réglages que l'écran vient d'enregistrer.
		const reglage = await reglageEnregistre(page);
		etat.heures = heuresCalculees(
			Array.from({ length: 7 }, (_, pas) => plusJours(T, pas)),
			reglage
		);
		const servies = await heuresDuTableau(
			page.locator('section', { has: page.locator('#servies-titre') }).locator('tbody tr'),
			'.soleil'
		);
		const ecarts = ecartsAuCalcul(servies, etat.heures);
		verifier(
			'les heures des sept prochains jours sont servies au public, celles que le calcul donne pour la position de la localité dans la liste',
			servies.length === 7 && ecarts.length === 0,
			ecarts.slice(0, 2).join(' ; ') ||
				`${servies.length} jour(s), position ${reglage.latitude}, ${reglage.longitude}, ${reglage.method}`
		);
	});
	await auditer(page, 'prières');

	await naviguer(page, '/vendredi');
	verifier('l’écran du vendredi s’ouvre', (await titre(page)) === 'Prière du vendredi');
	await retour('C4', async () => {
		const ajout = page.getByRole('region', { name: 'Ajouter une session' });
		await retour('B1', async () => {
			const aide = await descriptionDe(ajout.getByLabel('Heure de début', { exact: true }));
			verifier(
				'l’heure d’une session du vendredi a son aide, avec un exemple',
				aide.includes('Exemple : de 12:10 à 12:50.'),
				aide || 'aucune aide'
			);
		});
		await ajout.getByLabel('Heure de début', { exact: true }).fill(VENDREDI.debut);
		await ajout.getByLabel('Heure de fin', { exact: true }).fill(VENDREDI.fin);
		const langues = ajout.locator('input[name="sermonLanguages"]');
		if ((await langues.locator(':checked').count()) === 0) await langues.first().check();
		await envoyer(page, ajout.locator('button[type="submit"]'));
		verifier(
			'une session du vendredi est ajoutée',
			(await texteDe(page.getByRole('status').last())) === 'La session est ajoutée.',
			await texteDe(page.getByRole('status').last())
		);
	});
	// La carte de la session enregistrée a son propre formulaire, celui d'une modification : son aide
	// ne dit pas de garder la date du jour, comme celle de l'ajout.
	await retour('B1', async () => {
		const carte = page
			.locator('section.session')
			.filter({ hasText: `${VENDREDI.debut} – ${VENDREDI.fin}` });
		const champ = carte.getByLabel('À partir du', { exact: true });
		const aide = (await champ.count()) === 1 ? await descriptionDe(champ) : 'aucun champ';
		verifier(
			'dans la carte d’une session, « À partir du » a l’aide d’une modification : « Changez cette date seulement pour corriger une erreur. »',
			aide === AIDE_DE_LA_MODIFICATION,
			aide || 'aucune aide'
		);
	});
	await auditer(page, 'vendredi');
	await messagesDuPartage(page);

	await creerCours(page, {
		titre: COURS_ANCRE,
		public: 'open',
		jour: jourDeSemaine(J4),
		ancre: { sens: 'prayer', priere: 'maghrib', minutes: 15, duree: 60 },
		etat: 'publié'
	});
	await creerCours(page, {
		titre: COURS_SANS_DECALAGE,
		public: 'open',
		jour: jourDeSemaine(J5),
		ancre: { sens: 'prayer', priere: 'maghrib', minutes: 0, duree: 45 },
		etat: 'publié'
	});
	await coursAvantUnePriere(page);

	// Un visiteur neuf : la page publique se garde deux minutes en cache (`CACHE_PROGRAMME`), et celui
	// de l'étape d relirait sa copie d'avant les cours ancrés. C'est voulu, et ce n'est pas l'objet
	// ici.
	const neuf = await nouveauContexte(navigateur);
	const visiteur = await neuf.newPage();
	await retour('C2', async () => {
		for (const langue of ['fr', 'ar']) {
			const adresse = `/m/${ORGANISATION.slug}${langue === 'fr' ? '' : '/ar'}`;
			await ouvrir(visiteur, adresse);
			for (const ancrage of ANCRAGES) {
				const [seance] = await seancesPubliques(visiteur, ancrage.titre);
				const heure = seance
					? await texteDe(
							visiteur.locator('li').filter({ hasText: ancrage.titre }).locator('.heure')
						)
					: '';
				const attendue = heureAncree(ancrage.libelle[langue], ancrage.dans, ancrage.minutes);
				verifier(
					`${adresse} : « ${ancrage.titre} » affiche son heure, celle que le calcul donne pour la localité`,
					heure === attendue,
					`lu « ${heure} », attendu « ${attendue} »`
				);
			}
		}
	});
	// Hors du retour : la page arabe s'écrivait déjà en chiffres latins avant l'étape 18.
	await ouvrir(visiteur, `/m/${ORGANISATION.slug}/ar`);
	sansChiffresOrientaux(await visiteur.content(), `/m/${ORGANISATION.slug}/ar`);
	await retour('C3', async () => {
		await ouvrir(visiteur, `/m/${ORGANISATION.slug}`);
		const heure = await texteDe(
			visiteur.locator('li').filter({ hasText: COURS_AVANT.titre }).locator('.heure')
		);
		// Le cours d'avant une prière a lieu dans six jours.
		const attendue = heureAncree(
			`${COURS_AVANT.minutes} min avant Maghrib`,
			6,
			-COURS_AVANT.minutes
		);
		verifier(
			`la page publique dit « ${COURS_AVANT.minutes} min avant Maghrib », avec l’heure`,
			heure === attendue,
			`lu « ${heure} », attendu « ${attendue} »`
		);
	});

	// Le flux dit la phrase de la page, décalage nul compris, et en anglais celle de la page
	// anglaise (D1). La séance commence à l'heure que le calcul donne pour la localité.
	for (const langue of ['fr', 'en', 'ar']) {
		const { texte, evenements } = await fluxAgenda(langue === 'fr' ? undefined : langue);
		await retour(langue === 'en' ? 'D1' : 'C2', async () => {
			for (const ancrage of ANCRAGES) {
				const ancres = evenements.filter((evenement) =>
					evenement.some((ligne) => ligne.startsWith('SUMMARY:') && ligne.includes(ancrage.titre))
				);
				const description = ancres.flatMap((evenement) => champ(evenement, 'DESCRIPTION'))[0] ?? '';
				const jour = compacte(plusJours(T, ancrage.dans));
				const debut =
					ancres
						.flatMap((evenement) => champ(evenement, 'DTSTART'))
						.find((ligne) => ligne.includes(`${jour}T`)) ?? '';
				const maghrib = etat.heures?.[plusJours(T, ancrage.dans)]?.maghrib;
				const attendu = maghrib
					? `${jour}T${debutAncre(maghrib, ancrage.minutes).replace(':', '')}`
					: 'heure calculée inconnue';
				verifier(
					`le flux agenda${langue === 'fr' ? '' : ` (?lang=${langue})`} dit « ${ancrage.libelle[langue]} » pour « ${ancrage.titre} », comme la page, à l’heure que le calcul donne pour la localité`,
					ancres.length > 0 &&
						description === `DESCRIPTION:${ancrage.libelle[langue]}` &&
						debut.includes(attendu),
					`${description.slice(0, 60)} ; ${debut || 'aucun début ce jour-là'}, attendu ${attendu}`
				);
			}
		});
		// Hors du retour, comme la page : le flux arabe s'écrivait déjà en chiffres latins.
		if (langue === 'ar') sansChiffresOrientaux(texte, `le flux agenda (?lang=${langue})`);
	}

	await ongletDesPrieres(visiteur);
	await neuf.close();
}

/**
 * Un cours placé avant une prière (C3) : le choix existe, les minutes restent positives à l'écran,
 * dans la liste des cours et dans sa fiche rouverte.
 */
async function coursAvantUnePriere(page) {
	await retour('C3', async () => {
		await naviguer(page, '/cours');
		await suivre(page, page.locator('main a[href="/cours/nouveau"]').first(), '/cours/nouveau');
		const choix = await page
			.locator('#timingKind option')
			.evaluateAll((options) => options.map((option) => option.textContent?.trim()));
		verifier(
			'l’horaire propose « heure fixe », « après une prière », « avant une prière »',
			choix.join('|') === 'heure fixe|après une prière|avant une prière',
			choix.join(', ')
		);
		const id = await creerCours(page, {
			titre: COURS_AVANT.titre,
			public: 'open',
			jour: jourDeSemaine(J6),
			ancre: { sens: 'beforePrayer', priere: 'maghrib', minutes: COURS_AVANT.minutes, duree: 30 },
			etat: 'publié'
		});
		const ligne = page.locator('li').filter({ hasText: COURS_AVANT.titre });
		verifier(
			`la liste des cours dit « ${COURS_AVANT.minutes} min avant Maghrib »`,
			(await texteDe(ligne)).includes(`${COURS_AVANT.minutes} min avant Maghrib`),
			await texteDe(ligne)
		);
		await ouvrir(page, `/cours/${id}`);
		const libelle = await texteDe(page.locator('label[for="offsetMinutes"]'));
		verifier(
			'sa fiche rouverte dit « avant une prière » et garde des minutes positives',
			(await page.locator('#timingKind').inputValue()) === 'beforePrayer' &&
				(await page.locator('#offsetMinutes').inputValue()) === String(COURS_AVANT.minutes) &&
				libelle === 'Combien de minutes avant la prière ?',
			`${await page.locator('#timingKind').inputValue()}, ${await page.locator('#offsetMinutes').inputValue()}, « ${libelle} »`
		);
	});
}

/**
 * L'onglet « Prières » de la page publique (C4) : les heures du jour, adhan et iqama, les sept
 * jours, la prière du vendredi ; en arabe de droite à gauche ; puis dans le widget.
 */
async function ongletDesPrieres(visiteur) {
	await retour('C4', async () => {
		await ouvrir(visiteur, `/m/${ORGANISATION.slug}`);
		const vues = await visiteur.locator('nav.vues a').allTextContents();
		verifier(
			'la page publique propose quatre vues, dont « Prières »',
			vues.map((vue) => vue.trim()).join('|') === 'Semaine|Tous les cours|Mois|Prières',
			vues.map((vue) => vue.trim()).join(', ')
		);
		// Le même chemin, une autre vue : on attend la vue dans l'adresse, pas le chemin.
		await visiteur.locator('nav.vues').getByRole('link', { name: 'Prières', exact: true }).click();
		await visiteur.waitForURL((adresse) => adresse.searchParams.get('vue') === 'prieres');
		await visiteur.waitForLoadState('networkidle');
		await lireLEcran(visiteur);
		const jour = await texteDe(visiteur.locator('#prieres-aujourdhui'));
		const entetes = await visiteur.locator('table.aujourdhui thead th').allTextContents();
		const semaine = visiteur.locator('table.semaine tbody tr');
		const vendredi = visiteur.locator('#prieres-vendredi');
		verifier(
			'l’onglet montre les heures du jour, adhan et iqama, les sept prochains jours et la prière du vendredi',
			jour.startsWith('Aujourd’hui, ') &&
				jour.endsWith(dateSuisse(T)) &&
				entetes.map((entete) => entete.trim()).join('|') === 'Prière|Adhan|Iqama' &&
				(await semaine.count()) === 7 &&
				(await vendredi.count()) === 1 &&
				(await texteDe(vendredi)).includes(VENDREDI.debut),
			`« ${jour} », ${entetes.join(', ')}, ${await semaine.count()} jours, vendredi : ${
				(await vendredi.count()) === 1 ? await texteDe(vendredi) : 'absent'
			}`
		);
		await auditer(visiteur, 'page publique fr, vue prières');
		await ouvrir(visiteur, `/m/${ORGANISATION.slug}/ar?vue=prieres`);
		const jourArabe = await texteDe(visiteur.locator('#prieres-aujourdhui'));
		verifier(
			'en arabe, l’onglet « مواقيت الصلاة », de droite à gauche, avec le jour en chiffres latins',
			(await visiteur.locator('nav.vues a[aria-current="page"]').textContent())?.trim() ===
				'مواقيت الصلاة' &&
				(await racineDit(visiteur, 'dir')) === 'rtl' &&
				jourArabe.startsWith('اليوم، ') &&
				jourArabe.endsWith(dateSuisse(T)),
			`« ${jourArabe} »`
		);
		sansChiffresOrientaux(await visiteur.content(), `/m/${ORGANISATION.slug}/ar?vue=prieres`);
		await auditer(visiteur, 'page publique ar, vue prières');
	});
	await retour('C4', async () => {
		// Le widget : l'onglet est dans le cadre, et y reste encadré.
		const hote = createServer((_requete, reponse) => {
			reponse.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
			reponse.end(
				'<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n' +
					'<title>Le site d’une organisation</title>\n</head>\n<body>\n<main>\n' +
					`<h1>Nos prières</h1>\n${etat.codeEmbarque}\n</main>\n</body>\n</html>\n`
			);
		});
		await new Promise((resolue) => hote.listen(0, '127.0.0.1', () => resolue(undefined)));
		try {
			const { port } = /** @type {import('node:net').AddressInfo} */ (hote.address());
			await ouvrir(visiteur, `http://127.0.0.1:${port}/`);
			const cadre = /** @type {import('playwright-core').Frame} */ (
				await cadreDuWidget(visiteur, `${ORIGINE}/m/${ORGANISATION.slug}`)
			);
			await cadre.waitForLoadState('load');
			await cadre.locator('nav.vues').getByRole('link', { name: 'Prières', exact: true }).click();
			await cadre.waitForURL((adresse) => adresse.searchParams.get('vue') === 'prieres');
			await cadre.waitForLoadState('load');
			await lireLEcran(cadre);
			const adresse = new URL(cadre.url());
			verifier(
				'dans le widget, l’onglet « Prières » s’ouvre dans le cadre, qui reste encadré',
				adresse.searchParams.get('embed') === '1' &&
					(await cadre.locator('table.aujourdhui tbody tr').count()) === 5,
				adresse.pathname + adresse.search
			);
		} finally {
			await new Promise((resolue) => hote.close(() => resolue(undefined)));
		}
	});
}

/**
 * h. Une organisation qui n'existe pas. Le 404 parle la langue de l'adresse, `<html>` compris, et
 * ne porte aucun script : `/m/` n'en a jamais, erreur comprise. Le HTML est lu brut, tel que le
 * serveur l'envoie ; le texte, dans le navigateur, qui le montre aussi à axe. L'anglais est un
 * retour à lui seul (D1).
 */
async function organisationInconnue(page) {
	etape('h. Une organisation inconnue : un 404 dans la langue de l’adresse, sans script');
	for (const langue of ['fr', 'en', 'ar']) {
		await retour(langue === 'en' ? 'D1' : null, async () => {
			const adresse = `/m/${INCONNUE}${langue === 'fr' ? '' : `/${langue}`}`;
			const dirAttendu = langue === 'ar' ? 'rtl' : 'ltr';
			const brut = await fetch(`http://127.0.0.1:${PORT}${adresse}`);
			const html = await brut.text();
			const balise = /<html\b[^>]*>/i.exec(html)?.[0] ?? 'aucune balise <html>';
			const scripts = html.match(/<script\b/gi)?.length ?? 0;
			verifier(
				`${adresse} rend 404, avec <html lang="${langue}" dir="${dirAttendu}"> et aucune balise script`,
				brut.status === 404 &&
					balise === `<html lang="${langue}" dir="${dirAttendu}">` &&
					scripts === 0,
				`rendu ${brut.status}, ${balise}, ${scripts} balise(s) script`
			);

			const reponse = await ouvrir(page, adresse);
			const attendu = TEXTES_PUBLICS[langue].introuvable;
			const phrase = await texteDe(page.locator('main p'));
			verifier(
				`${adresse} : la page d’erreur dit « ${attendu.titre} » et « ${attendu.phrase} »`,
				reponse?.status() === 404 &&
					(await page.title()) === attendu.titre &&
					(await titre(page)) === attendu.titre &&
					phrase === attendu.phrase,
				`« ${await page.title()} », « ${await titre(page)} », « ${phrase} »`
			);
			await auditer(page, `404 d’une organisation inconnue, ${langue}`);
		});
	}
}

/**
 * i. L'espace des responsables dans les cinq langues (D2) : chaque écran, le choix de la langue en
 * haut, `<html lang dir>`, rien de la version française resté tel quel. Puis la langue retenue pour
 * le compte : on change, on recharge, on se reconnecte ailleurs, elle reste.
 */
async function languesDeLEspace(navigateur, page) {
	etape('i. L’espace des responsables dans les cinq langues, et la langue retenue pour le compte');
	const ecrans = [
		'/',
		'/cours',
		'/cours/nouveau',
		`/cours/${etat.cours1}`,
		'/vendredi',
		'/partager',
		'/membres',
		'/prieres',
		'/reglages',
		'/organisations'
	];
	await retour('D2', async () => {
		const francais = new Map();
		const sansChoix = [];
		for (const ecran of ecrans) {
			await ouvrir(page, ecran);
			if (!(await choixPresent(page, 'fr'))) sansChoix.push(ecran);
			francais.set(ecran, await segmentsLus(page));
		}
		verifier(
			`les ${ecrans.length} écrans de l’espace portent en haut le choix des cinq langues`,
			sansChoix.length === 0,
			sansChoix.join(' ')
		);
		for (const langue of LANGUES.filter((code) => code !== 'fr')) {
			await ouvrir(page, '/');
			await choisirLaLangue(page, langue);
			const problemes = [];
			for (const ecran of ecrans) {
				await ouvrir(page, ecran);
				const lang = await racineDit(page, 'lang');
				const dir = await racineDit(page, 'dir');
				if (lang !== langue || dir !== (langue === 'ar' ? 'rtl' : 'ltr')) {
					problemes.push(`${ecran} : <html lang="${lang}" dir="${dir}">`);
				}
				if (!(await choixPresent(page, langue))) problemes.push(`${ecran} : choix de la langue`);
				const restes = resteEnFrancais(
					/** @type {string[]} */ (francais.get(ecran)),
					await segmentsLus(page),
					NOMS_SAISIS
				);
				for (const reste of restes.slice(0, 3)) problemes.push(`${ecran} : « ${reste} »`);
			}
			verifier(
				`en ${NOM_DE_LANGUE[langue]}, les ${ecrans.length} écrans sont dans cette langue, rien en français`,
				problemes.length === 0,
				problemes.slice(0, 8).join(' ; ')
			);
		}

		// La langue retenue : on choisit l'italien, on recharge, puis on se connecte dans un autre
		// navigateur, neuf, réglé en français : c'est le compte qui garde l'italien.
		await ouvrir(page, '/');
		await choisirLaLangue(page, 'it');
		await page.reload();
		await page.waitForLoadState('networkidle');
		verifier(
			'la langue choisie, l’italien, reste au rechargement',
			(await racineDit(page, 'lang')) === 'it',
			`<html lang="${await racineDit(page, 'lang')}">`
		);
		const ailleurs = await nouveauContexte(navigateur);
		try {
			const autre = await ailleurs.newPage();
			await ouvrir(autre, '/connexion');
			const avant = courriels().length;
			await demanderUnLien(autre, RESPONSABLE);
			const lien = await nouveauLienDeConnexion(RESPONSABLE, avant);
			await ouvrir(autre, /** @type {string} */ (lien));
			verifier(
				'reconnectée dans un autre navigateur réglé en français, elle retrouve l’italien de son compte',
				chemin(autre) === '/organisations' &&
					(await racineDit(autre, 'lang')) === 'it' &&
					(await titre(autre)) === 'Le tue organizzazioni',
				`${chemin(autre)}, <html lang="${await racineDit(autre, 'lang')}">, « ${await titre(autre)} »`
			);
			await choisirLaLangue(autre, 'fr');
		} finally {
			await ailleurs.close();
		}
		await ouvrir(page, '/');
		verifier(
			'revenue au français par le compte, le premier navigateur le suit',
			(await racineDit(page, 'lang')) === 'fr',
			`<html lang="${await racineDit(page, 'lang')}">`
		);
	});
	await langueChoisieAvantLaConnexion(navigateur, page);
}

/**
 * Une langue choisie sur `/connexion`, avant de demander le lien, devient celle du compte (D2) : le
 * lien la porte, et un autre navigateur, réglé en français, qui l'ouvre arrive dans cette langue.
 * Puis le compte revient au français, pour la suite du parcours.
 */
async function langueChoisieAvantLaConnexion(navigateur, page) {
	await retour('D2', async () => {
		const avantLaConnexion = await nouveauContexte(navigateur);
		const ailleurs = await nouveauContexte(navigateur);
		try {
			const choix = await avantLaConnexion.newPage();
			await ouvrir(choix, '/connexion');
			await choisirLaLangue(choix, 'de');
			const avant = courriels().length;
			await demanderUnLien(choix, RESPONSABLE);
			const lien = await nouveauLienDeConnexion(RESPONSABLE, avant);
			const arrivee = await ailleurs.newPage();
			await ouvrir(arrivee, lien ?? '/connexion');
			verifier(
				'une langue choisie sur /connexion avant de demander le lien devient celle du compte : ouvert dans un autre navigateur, réglé en français, le lien arrive en allemand',
				Boolean(lien) &&
					chemin(arrivee) === '/organisations' &&
					(await racineDit(arrivee, 'lang')) === 'de' &&
					(await titre(arrivee)) === 'Ihre Organisationen',
				`${lien ? 'lien reçu' : 'aucun lien'}, ${chemin(arrivee)}, <html lang="${await racineDit(arrivee, 'lang')}">, « ${await titre(arrivee)} »`
			);
			if ((await racineDit(arrivee, 'lang')) !== 'fr') await choisirLaLangue(arrivee, 'fr');
		} finally {
			await avantLaConnexion.close();
			await ailleurs.close();
		}
	});
	await ouvrir(page, '/');
	if ((await racineDit(page, 'lang')) !== 'fr') await choisirLaLangue(page, 'fr');
}

/** Les trouvailles « serious » ou « critical » d'axe sur des pages nommées. */
const gravesSur = (noms) =>
	trouvaillesAxe.filter(
		(trouvaille) => noms.includes(trouvaille.page) && GRAVES.has(trouvaille.impact)
	);

/**
 * j. Sur un téléphone, 390 px de large : les tableaux de l'écran des prières et de l'onglet
 * « Prières » défilent de côté, et doivent se prendre au clavier (axe, C1 et C4) ; la confirmation
 * avant de supprimer une salle occupée se voit sans défiler (B1).
 */
async function surUnTelephone(navigateur, page) {
	etape('j. Sur un téléphone, 390 px de large');
	await page.setViewportSize(TELEPHONE);
	try {
		await retour('C1', async () => {
			const noms = [];
			for (const [reponse, quoi] of [
				['computed', 'calculées'],
				['import', 'importées'],
				['manual', 'saisies à la main']
			]) {
				await ouvrir(page, `/prieres?source=${reponse}`);
				noms.push(`prières à 390 px, heures ${quoi}`);
				await auditer(page, /** @type {string} */ (noms.at(-1)));
			}
			const servies = await page
				.locator('section[aria-labelledby="servies-titre"] tbody tr')
				.count();
			const graves = gravesSur(noms);
			verifier(
				'à 390 px de large, axe ne relève rien de sérieux sur les trois réponses de l’écran des prières, heures servies comprises',
				servies === 7 && graves.length === 0,
				graves.map((grave) => `${grave.regle} : ${grave.cible}`).join(' ; ') ||
					`${servies} jour(s) servis`
			);
		});
		await retour('B1', async () => {
			await ouvrir(page, '/reglages');
			const salle = page.locator('#salles li').filter({ hasText: SALLE });
			// Le formulaire recharge la page aujourd'hui ; s'il passe un jour par JavaScript, sans
			// recharger, la demande doit se voir de même : on attend l'une ou l'autre, sans l'exiger.
			await Promise.all([
				page.waitForEvent('load', { timeout: 5000 }).catch(() => undefined),
				salle.locator('form[action="?/supprimerSalle"] button[type="submit"]').click()
			]);
			await page.waitForLoadState('networkidle');
			await lireLEcran(page);
			const confirmation = page.locator('#confirmer-salle');
			await confirmation.waitFor({ timeout: 5000 }).catch(() => undefined);
			const present = (await confirmation.count()) === 1;
			const boite = present ? await confirmation.boundingBox() : null;
			const bouton = present
				? await confirmation.locator('button[type="submit"]').boundingBox()
				: null;
			verifier(
				`à 390 px, supprimer « ${SALLE} », qu’un cours occupe, demande d’abord de confirmer, et la demande se voit sans défiler`,
				present &&
					(await texteDe(confirmation)).includes(SALLE) &&
					boite !== null &&
					boite.y >= 0 &&
					bouton !== null &&
					bouton.y + bouton.height <= TELEPHONE.height,
				boite
					? `demande de ${Math.round(boite.y)} à ${Math.round(boite.y + boite.height)} px, bouton jusqu’à ${Math.round((bouton?.y ?? 0) + (bouton?.height ?? 0))} px, fenêtre de ${TELEPHONE.height} px`
					: 'aucune demande de confirmation'
			);
		});
	} finally {
		await page.setViewportSize(ECRAN);
	}

	// Un visiteur sur son téléphone, dans un navigateur neuf : aucune copie de la page en cache.
	const telephone = await nouveauContexte(navigateur, { viewport: TELEPHONE });
	try {
		const visiteur = await telephone.newPage();
		await retour('C4', async () => {
			const noms = [];
			const semaines = [];
			for (const langue of ['fr', 'ar']) {
				await ouvrir(
					visiteur,
					`/m/${ORGANISATION.slug}${langue === 'fr' ? '' : `/${langue}`}?vue=prieres`
				);
				semaines.push(await visiteur.locator('table.semaine').count());
				noms.push(`onglet Prières à 390 px, ${langue}`);
				await auditer(visiteur, /** @type {string} */ (noms.at(-1)));
			}
			const graves = gravesSur(noms);
			verifier(
				'à 390 px de large, axe ne relève rien de sérieux sur l’onglet « Prières », en français et en arabe, tableau de la semaine compris',
				semaines.every((nombre) => nombre === 1) && graves.length === 0,
				graves.map((grave) => `${grave.regle} : ${grave.cible}`).join(' ; ') ||
					`tableau de la semaine : ${semaines.join(', ')}`
			);
		});
	} finally {
		await telephone.close();
	}
}

/**
 * k. Sans JavaScript, avec la session de la personne responsable : les options d'une séance restent
 * fermées et s'ouvrent (A1) ; une session du vendredi s'ajoute et se supprime, et l'écran le dit
 * (B1).
 */
async function sansJavaScript(navigateur, page) {
	etape('k. Sans JavaScript');
	const contexte = await nouveauContexte(navigateur, {
		javaScriptEnabled: false,
		storageState: await page.context().storageState()
	});
	try {
		const sans = await contexte.newPage();
		await retour('A1', async () => {
			await ouvrir(sans, '/');
			const options = sans.locator('details.options');
			const nombre = await options.count();
			const ouvertes = async () => sans.locator('details.options[open]').count();
			verifier(
				'sans JavaScript, les options de chaque séance sont fermées au chargement, et aucun bouton « Annuler cette séance » ne se voit',
				nombre >= 2 &&
					(await ouvertes()) === 0 &&
					(await boutonsDAnnulationVisibles(sans).count()) === 0,
				`${nombre} cartes, ${await ouvertes()} ouvertes, ${await boutonsDAnnulationVisibles(sans).count()} boutons visibles`
			);
			const premiere = options.first();
			await premiere.locator(':scope > summary').click();
			verifier(
				'sans JavaScript, « Annuler ou déplacer » ouvre les options de sa carte, et d’elle seule',
				(await ouvertes()) === 1 &&
					(await premiere.evaluate(
						(details) => /** @type {HTMLDetailsElement} */ (details).open
					)) &&
					(await boutonsDAnnulationVisibles(premiere).count()) === 1 &&
					(await boutonsDAnnulationVisibles(sans).count()) === 1,
				`${await ouvertes()} ouverte(s), ${await boutonsDAnnulationVisibles(sans).count()} bouton(s) visible(s)`
			);
		});
		await retour('B1', async () => {
			await ouvrir(sans, '/vendredi');
			const ajout = sans.getByRole('region', { name: 'Ajouter une session' });
			await ajout.locator('input[name="start"]').fill(SECONDE_SESSION.debut);
			await ajout.locator('input[name="end"]').fill(SECONDE_SESSION.fin);
			const langues = ajout.locator('input[name="sermonLanguages"]');
			if ((await langues.locator(':checked').count()) === 0) await langues.first().check();
			await envoyer(sans, ajout.locator('button[type="submit"]'));
			const carte = () =>
				sans
					.locator('section.session')
					.filter({ hasText: `${SECONDE_SESSION.debut} – ${SECONDE_SESSION.fin}` });
			const avant = await carte().count();
			// Le repli qui supprime : le second de la carte, après celui qui modifie. Son bouton est visé
			// quel que soit son type, et l'on n'exige pas que la page se recharge : un bouton qui ne
			// fait rien sans script est justement ce que la vérification doit voir.
			const repli = carte().locator('details.repli').nth(1);
			await repli.locator(':scope > summary').click();
			await Promise.all([
				sans.waitForEvent('load', { timeout: 5000 }).catch(() => undefined),
				repli.locator('form[action="?/supprimer"] button').click()
			]);
			await sans.waitForLoadState('networkidle');
			await lireLEcran(sans);
			// Le texte de l'annonce, et non sa seule présence : une annonce qui dirait autre chose, ou
			// qui resterait celle de l'ajout, ne dit pas ce qui s'est passé.
			const annonces = (await sans.getByRole('status').allTextContents()).map((texte) =>
				texte.replace(/\s+/g, ' ').trim()
			);
			verifier(
				`sans JavaScript, une session du vendredi se supprime : ouvrir « Supprimer cette session », confirmer, et elle a disparu, « ${SESSION_SUPPRIMEE} »`,
				avant === 1 && (await carte().count()) === 0 && annonces.includes(SESSION_SUPPRIMEE),
				`${avant} carte avant, ${await carte().count()} après ; ${annonces.map((texte) => `« ${texte} »`).join(', ') || 'aucun message'}`
			);
		});
	} finally {
		await contexte.close();
	}
}

/**
 * l. Une période préparée à l'avance, copiée pour l'année suivante depuis l'écran en allemand : la
 * copie est nommée dans cette langue (D2). Les deux périodes sont ensuite supprimées, et l'écran
 * revient au français.
 */
async function periodeCopiee(page) {
	etape('l. Une période copiée pour l’année suivante, depuis l’écran en allemand');
	await retour('D2', async () => {
		await ouvrir(page, '/prieres?source=manual');
		await choisirLaLangue(page, 'de');
		const nom = page.locator('#nom-nouvelle');
		const repli = page.locator('details', { has: nom });
		if (!(await repli.evaluate((details) => /** @type {HTMLDetailsElement} */ (details).open))) {
			await repli.locator(':scope > summary').click();
		}
		// Dans deux mois, pour un mois : les sept prochains jours n'en sont pas touchés.
		await nom.fill(PERIODE.nom);
		await page.locator('#de-nouvelle').fill(plusJours(T, 60));
		await page.locator('#a-nouvelle').fill(plusJours(T, 90));
		await envoyer(page, page.locator('form', { has: nom }).locator('button.principal'));
		const periode = (intitule) =>
			page
				.locator('div.periode')
				.filter({ has: page.locator('h3 bdi').getByText(intitule, { exact: true }) });
		await envoyer(
			page,
			periode(PERIODE.nom).locator('form[action$="/dupliquerPeriode"] button[type="submit"]')
		);
		const noms = (await page.locator('div.periode h3 bdi').allTextContents()).map((texte) =>
			texte.trim()
		);
		verifier(
			`depuis l’écran en allemand, la copie de « ${PERIODE.nom} » pour l’année suivante s’appelle « ${PERIODE.copie} »`,
			noms.includes(PERIODE.copie),
			noms.map((texte) => `« ${texte} »`).join(', ') || 'aucune période'
		);
		// Toutes les périodes de l'écran sont celles de ce pas : elles s'en vont.
		for (let reste = await page.locator('div.periode').count(); reste > 0; reste -= 1) {
			await envoyer(
				page,
				page
					.locator('div.periode')
					.first()
					.locator('form[action$="/supprimerPeriode"] button[type="submit"]')
			);
		}
	});
	if ((await racineDit(page, 'lang')) !== 'fr') await choisirLaLangue(page, 'fr');
}

/**
 * m. « À venir », la session du vendredi en place : le programme de la semaine la nomme dans la
 * langue de chaque message (D1). Déplacée le même jour à une autre heure, sa carte d'arrivée dit
 * « nouvelle heure » et l'heure prévue (A2), et le message dit un changement d'heure, la date une
 * seule fois (B1), en nommant la prière dans chaque langue (D1). Un second onglet, ouvert avant ce
 * déplacement, renvoie ensuite sa carte restée telle quelle : l'écran le refuse, et rien n'est
 * écrit (A2).
 */
async function vendrediSurLAccueil(page) {
	etape(
		'm. « À venir » : la session du vendredi, ses messages, un changement d’heure, une carte restée ouverte'
	);
	const nom = PRIERE_DU_VENDREDI.fr;
	const jour = VENDREDI_QUI_VIENT;
	/** La carte de la session ce vendredi-là, selon ce qui lui est arrivé : `scheduled`, `moved_here`… */
	const carte = (cible, statut) =>
		cible
			.locator('section', { has: cible.locator(`[id="jour-${jour}"]`) })
			.locator(`li.${statut}`)
			.filter({ hasText: nom });
	await ouvrir(page, '/');
	await retour('D1', async () => {
		const semaine = await messagesDeLAccueil(page, 'semaine');
		const fautifs = sansLeNomDeLaPriere(semaine);
		verifier(
			`sur « À venir », le programme de la semaine nomme la session du vendredi dans la langue de chaque message : ${NOMS_TRADUITS}`,
			semaine.length === LANGUES.length && fautifs.length === 0,
			lignesDuVendredi(semaine, fautifs, VENDREDI.debut) || `${semaine.length} message(s)`
		);
	});
	// Le second onglet, ouvert avant le déplacement : sa carte reste celle d'une séance prévue.
	const ouvertAvant = await page.context().newPage();
	try {
		await ouvrir(ouvertAvant, '/');
		await retour('A2', async () => {
			const prevue = carte(page, 'scheduled');
			await prevue.getByText('Annuler ou déplacer', { exact: true }).click();
			await prevue.getByLabel('Heure de début', { exact: true }).fill(HEURE_DU_VENDREDI_DEPLACE);
			await envoyer(page, prevue.getByRole('button', { name: 'Déplacer la séance', exact: true }));
			const arrivee = carte(page, 'moved_here');
			const presente = (await arrivee.count()) === 1;
			const marque = presente ? await texteDe(arrivee.locator('.marque')) : '';
			const lue = presente ? await texteDe(arrivee) : `${await arrivee.count()} carte(s) d’arrivée`;
			const prevueA = `Prévue à l’origine : ${VENDREDI.debut} – ${VENDREDI.fin}`;
			verifier(
				`déplacée le même jour de ${VENDREDI.debut} à ${HEURE_DU_VENDREDI_DEPLACE}, la session du vendredi porte sur sa carte « nouvelle heure » et « ${prevueA} »`,
				marque === 'nouvelle heure' && lue.includes(prevueA),
				lue
			);
			await retour('B1', async () => {
				const messages = await messagesDeLAccueil(page, 'message');
				const francais = messages[0]?.lang === 'fr' ? messages[0].texte : '';
				const phrase = `Le cours « ${nom} » du ${dateLongue(jour)} commence à ${HEURE_DU_VENDREDI_DEPLACE} au lieu de ${VENDREDI.debut}.`;
				verifier(
					`le message prêt à coller le dit comme un changement d’heure, la date une seule fois : « ${phrase} »`,
					francais.includes(phrase) &&
						!francais.includes('est déplacé au') &&
						francais.split(dateSuisse(jour)).length === 2,
					francais.split('\n').find((ligne) => ligne.startsWith('Le cours')) ??
						'aucun message en français'
				);
			});
			await retour('D1', async () => {
				const messages = await messagesDeLAccueil(page, 'message');
				const fautifs = sansLeNomDeLaPriere(messages);
				verifier(
					`ce message nomme la session du vendredi dans la langue de chaque message : ${NOMS_TRADUITS}`,
					messages.length === LANGUES.length && fautifs.length === 0,
					lignesDuVendredi(messages, fautifs, HEURE_DU_VENDREDI_DEPLACE) ||
						`${messages.length} message(s)`
				);
			});
			// L'onglet ouvert avant renvoie sa carte, restée celle d'une séance prévue à son heure.
			const perimee = carte(ouvertAvant, 'scheduled');
			await perimee.getByText('Annuler ou déplacer', { exact: true }).click();
			await envoyer(
				ouvertAvant,
				perimee.getByRole('button', { name: 'Déplacer la séance', exact: true })
			);
			const refus = ouvertAvant.getByRole('alert');
			const phrase =
				(await refus.count()) === 1 ? await texteDe(refus) : `${await refus.count()} alerte(s)`;
			// En haut : avant le premier jour du programme, puisque la carte n'a plus d'options.
			const enHaut =
				(await refus.count()) === 1 &&
				(await refus.evaluate((alerte) => {
					const premierJour = document.querySelector('section[aria-labelledby^="jour-"]');
					return Boolean(
						premierJour &&
						alerte.compareDocumentPosition(premierJour) & Node.DOCUMENT_POSITION_FOLLOWING
					);
				}));
			const depart = carte(ouvertAvant, 'moved_away');
			const departLu =
				(await depart.count()) === 1 ? await texteDe(depart) : 'aucune carte de départ';
			verifier(
				`une carte restée ouverte dans un autre onglet, envoyée après ce déplacement, est refusée par une phrase en haut, et rien n’est écrit : la session reste à ${HEURE_DU_VENDREDI_DEPLACE}`,
				phrase === SEANCE_CHANGEE &&
					enHaut &&
					(await ouvertAvant.locator('#message-titre').count()) === 0 &&
					departLu.includes(`Déplacée au ${dateLongue(jour)} à ${HEURE_DU_VENDREDI_DEPLACE}`) &&
					(await carte(ouvertAvant, 'moved_here').count()) === 1,
				`« ${phrase} » ; ${departLu}`
			);
		});
	} finally {
		await ouvertAvant.close();
	}
}

/**
 * n. Réglages, avec JavaScript et au clavier (B1) : le nom et la formule d'accueil tapés, puis une
 * autre couleur, sont ce qui s'enregistre. Le sélecteur de couleur du navigateur ne se pilote pas
 * au clavier : sa valeur est posée directement. Les réglages d'avant reviennent ensuite.
 */
async function reglagesAuClavier(page) {
	etape('n. Réglages : ce qui est tapé au clavier, puis une autre couleur');
	await retour('B1', async () => {
		await ouvrir(page, '/reglages');
		const nom = page.locator('#name');
		const accueil = page.locator('#greeting');
		const couleur = page.locator('#accentColor');
		// Une fois la page hydratée, Svelte retire l'attribut `value` des champs, qui gardent leur
		// valeur : c'est le signe que les gestes passent par l'écran. Cinq secondes au plus.
		await page
			.waitForFunction(() => !document.getElementById('name')?.hasAttribute('value'), undefined, {
				timeout: 5000
			})
			.catch(() => undefined);
		const avant = {
			nom: await nom.inputValue(),
			accueil: await accueil.inputValue(),
			couleur: await couleur.inputValue()
		};
		for (const [champ, texte] of [
			[nom, SAISIE_AU_CLAVIER.nom],
			[accueil, SAISIE_AU_CLAVIER.accueil]
		]) {
			await champ.click();
			await page.keyboard.press('ControlOrMeta+A');
			await page.keyboard.type(texte);
		}
		await couleur.fill(SAISIE_AU_CLAVIER.couleur);
		const tape = { nom: await nom.inputValue(), accueil: await accueil.inputValue() };
		const formulaire = page.locator('form[action="?/enregistrer"] button[type="submit"]');
		await envoyer(page, formulaire);
		const statut = await texteDe(page.getByRole('status'));
		const enregistre = { nom: await nom.inputValue(), accueil: await accueil.inputValue() };
		verifier(
			'avec JavaScript, le nom et la formule d’accueil tapés au clavier, puis une autre couleur : c’est ce qui a été tapé qui s’enregistre',
			tape.nom === SAISIE_AU_CLAVIER.nom &&
				tape.accueil === SAISIE_AU_CLAVIER.accueil &&
				statut === 'Réglages enregistrés.' &&
				enregistre.nom === SAISIE_AU_CLAVIER.nom &&
				enregistre.accueil === SAISIE_AU_CLAVIER.accueil &&
				(await page.title()) === `Réglages | ${SAISIE_AU_CLAVIER.nom}`,
			`avant l’envoi « ${tape.nom} », « ${tape.accueil} » ; « ${statut} », enregistré « ${enregistre.nom} », « ${enregistre.accueil} »`
		);
		await couleur.fill(avant.couleur);
		await nom.fill(avant.nom);
		await accueil.fill(avant.accueil);
		await envoyer(page, formulaire);
	});
}

/**
 * o. Membres (B3) : une seconde personne responsable rejoint l'organisation, puis la première se
 * donne le rôle d'éditeur sur sa propre ligne. Elle arrive sur « À venir », où une phrase, visible
 * sans défiler, lui dit ce qui s'est passé et comment retrouver ses écrans. La seconde lui rend
 * ensuite son rôle.
 */
async function devenirEditrice(navigateur, page) {
	etape('o. Membres : une responsable se donne le rôle d’éditeur');
	await retour('B3', async () => {
		await ouvrir(page, '/membres');
		await page.locator('#email').fill(SECONDE_RESPONSABLE);
		await page.locator('#role').selectOption('org_admin');
		await envoyer(page, page.locator('form[action="?/inviter"] button[type="submit"]'));
		const ailleurs = await nouveauContexte(navigateur);
		try {
			const seconde = await ailleurs.newPage();
			await ouvrir(seconde, '/connexion');
			const avant = courriels().length;
			await demanderUnLien(seconde, SECONDE_RESPONSABLE);
			await ouvrir(seconde, (await nouveauLienDeConnexion(SECONDE_RESPONSABLE, avant)) ?? '/');
			await envoyer(
				seconde,
				seconde
					.locator('li')
					.filter({ hasText: ORGANISATION.nom })
					.getByRole('button', { name: 'Accepter' })
			);
			await envoyer(
				seconde,
				seconde.getByRole('button', { name: 'J’accepte les conditions d’utilisation', exact: true })
			);

			await ouvrir(page, '/membres');
			const ligne = (cible, adresse) =>
				cible.locator('ul.membres li').filter({ has: cible.getByText(adresse, { exact: true }) });
			await envoyer(
				page,
				ligne(page, RESPONSABLE).getByRole('button', {
					name: 'Donner le rôle d’éditeur',
					exact: true
				})
			);
			const avis = page.locator('#avis-role');
			const texte = (await avis.count()) === 1 ? await texteDe(avis) : '';
			const boite = texte ? await avis.boundingBox() : null;
			const hauteur = page.viewportSize()?.height ?? ECRAN.height;
			const adresse = new URL(page.url());
			verifier(
				'une responsable qui se donne le rôle d’éditeur arrive sur « À venir », où une phrase, visible sans défiler, lui dit ce qui s’est passé et comment retrouver ses écrans',
				adresse.pathname === '/' &&
					(await titre(page)) === 'À venir' &&
					texte === DEVENUE_EDITRICE &&
					(await avis.getAttribute('role')) === 'status' &&
					boite !== null &&
					boite.y >= 0 &&
					boite.y + boite.height <= hauteur,
				`${adresse.pathname}${adresse.search}, « ${await titre(page)} » ; ${texte ? `« ${texte} »` : 'aucune phrase'}`
			);
			// La seconde responsable lui rend son rôle.
			await ouvrir(seconde, '/membres');
			await envoyer(
				seconde,
				ligne(seconde, RESPONSABLE).getByRole('button', {
					name: 'Donner le rôle de responsable',
					exact: true
				})
			);
		} finally {
			await ailleurs.close();
		}
	});
}

// ---------------------------------------------------------------------------------------------
// Le déroulé
// ---------------------------------------------------------------------------------------------

let navigateur;

function nettoyer() {
	marche.nettoyer();
	if (!IMAGE_DONNEE) spawnSync('docker', ['image', 'rm', '-f', IMAGE], { stdio: 'ignore' });
}

process.on('exit', nettoyer);
process.on('SIGINT', () => process.exit(130));

const debut = Date.now();
let echoue = false;
try {
	if (RELEVE)
		process.stdout.write(
			'Mode relevé : une vérification d’un retour qui tombe est notée, et le parcours continue.\n'
		);
	preparerLImage();
	await leverLeServeur();

	etape('Le navigateur');
	navigateur = await chromium.launch({ executablePath: chrome(), headless: true });
	verifier('Chrome démarre', true, navigateur.version());

	await superAdmin(navigateur);
	const { page } = await personneInvitee(navigateur);
	await programme(page);

	const visiteurs = await nouveauContexte(navigateur);
	const visiteur = await visiteurs.newPage();
	await pagesPubliques(visiteur);
	await widget(visiteur);
	await agenda();
	await appareils(navigateur);
	await organisationInconnue(visiteur);
	await languesDeLEspace(navigateur, page);
	await prieres(page, navigateur);
	await surUnTelephone(navigateur, page);
	await sansJavaScript(navigateur, page);
	await periodeCopiee(page);
	await vendrediSurLAccueil(page);
	await reglagesAuClavier(page);
	await devenirEditrice(navigateur, page);
	await bilanDesEcrans();
} catch (erreur) {
	echoue = true;
	if (!(erreur instanceof Echec)) {
		process.stdout.write(`\n  NON  ${erreur instanceof Error ? erreur.message : String(erreur)}\n`);
	}
	if (pageCourante) {
		process.stdout.write(`\nLa page regardée : ${pageCourante.url()}\n`);
		const visible = await pageCourante
			.locator('body')
			.innerText()
			.catch(() => '');
		for (const ligne of visible.split('\n').filter(Boolean).slice(0, 15)) {
			process.stdout.write(`      ${ligne}\n`);
		}
	}
	if (serveurLance) {
		process.stdout.write(`\nLes dernières lignes du serveur :\n`);
		for (const ligne of dernieresLignesDuServeur()) process.stdout.write(`      ${ligne}\n`);
	}
} finally {
	await navigateur?.close();
}

const graves = trouvaillesAxe.filter((trouvaille) => GRAVES.has(trouvaille.impact));
etape(`axe, sur ${pagesAuditees.length} pages`);
if (pagesAuditees.length === 0) {
	process.stdout.write('  aucune page n’a été auditée\n');
} else if (trouvaillesAxe.length === 0) {
	process.stdout.write('  rien à signaler\n');
} else {
	const parRegle = new Map();
	for (const trouvaille of trouvaillesAxe) {
		const cle = `[${trouvaille.impact}] ${trouvaille.regle} : ${trouvaille.aide}`;
		const pages = parRegle.get(cle) ?? new Set();
		pages.add(trouvaille.page);
		parRegle.set(cle, pages);
	}
	for (const [cle, pages] of [...parRegle].sort()) {
		process.stdout.write(`  ${cle}\n      ${[...pages].join(', ')}\n`);
	}
}

// Le tableau des retours : une ligne par vérification, une ligne par geste impossible (la suite de
// son bloc n'a pas été jouée), et une ligne pour chaque retour que le parcours n'a pas atteint.
etape('Les retours du chef de projet, une ligne par vérification');
process.stdout.write('  retour | vérification | verdict\n');
for (const lettre of RETOURS) {
	const lignes = releve.filter((ligne) => ligne.retour === lettre);
	if (lignes.length === 0) {
		process.stdout.write(`  ${lettre} | non atteint : le parcours s’est arrêté avant | rouge\n`);
	}
	for (const ligne of lignes) {
		const verdict = ligne.impossible ? 'impossible' : ligne.ok ? 'vert' : 'rouge';
		process.stdout.write(`  ${lettre} | ${ligne.quoi} | ${verdict}\n`);
	}
}
const jouees = releve.filter((ligne) => !ligne.impossible);
const impossibles = releve.filter((ligne) => ligne.impossible);
const rouges = jouees.filter((ligne) => !ligne.ok);
const sansLigne = RETOURS.filter((lettre) => !releve.some((ligne) => ligne.retour === lettre));
const duree = Math.round((Date.now() - debut) / 1000);
process.stdout.write(
	`\n  ${jouees.length} vérifications des retours jouées, ${jouees.length - rouges.length} vertes, ${rouges.length} rouges ; ` +
		`${impossibles.length} geste(s) impossible(s), dont le bloc s’est arrêté là ; ` +
		`${sansLigne.length} retour(s) non atteint(s) ; ${ecransLus.size} écrans lus ; ${Math.floor(duree / 60)} min ${duree % 60} s\n`
);

if (echoue) {
	process.stderr.write(`\nLe parcours s’est arrêté après ${verifications} vérifications.\n`);
	process.exit(1);
}
if (rouges.length > 0 || impossibles.length > 0 || sansLigne.length > 0) {
	process.stderr.write(
		`\nLe parcours va au bout (${verifications} vérifications), mais ${rouges.length} vérification(s) ` +
			`de retours tombent, ${impossibles.length} geste(s) sont impossibles et ${sansLigne.length} ` +
			`retour(s) n’ont aucune ligne.\n`
	);
	process.exit(1);
}
if (graves.length > 0) {
	process.stderr.write(
		`\nLe parcours passe (${verifications} vérifications), mais axe relève ${graves.length} ` +
			`problème(s) sérieux ou critique(s).\n`
	);
	process.exit(1);
}
process.stdout.write(
	`\nLes ${verifications} vérifications passent, chaque retour a les siennes, et axe ne relève ` +
		`rien de sérieux sur ${pagesAuditees.length} pages.\n`
);

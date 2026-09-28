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
 * La règle, depuis l'étape 18 : chaque retour du chef de projet devient au moins une vérification
 * du parcours automatique, qui tombe sur l'ancien comportement. Chaque vérification d'un retour
 * porte sa lettre, et le parcours imprime à la fin un tableau « retour | vérification | verdict ».
 * Un retour sans aucune ligne fait échouer le parcours : on ne perd pas une vérification sans le
 * voir. L'étape 19 suit la même règle pour chacune de ses corrections qui se voient à l'écran.
 *
 * ### Les retours de l'étape 18
 *
 * - A1 : sur « À venir », les options d'une séance sont fermées, « Annuler ou déplacer » n'ouvre que
 *   sa carte, et rien ne s'annule sans l'avoir ouverte, avec ou sans JavaScript.
 * - A2 : une séance se déplace à une date plus tôt que la sienne, toute date à partir d'aujourd'hui,
 *   et le déplacement se lit sur la page publique et dans le flux agenda. Un déplacement qui ne
 *   change ni la date ni l'heure est refusé, avec une phrase. Déplacée le même jour à une autre
 *   heure, une séance porte « nouvelle heure » sur sa carte ; une carte restée ouverte dans un autre
 *   onglet, envoyée après ce déplacement, est refusée, et rien n'est écrit, sur « À venir » comme
 *   sur l'écran du vendredi.
 * - A3 : aucune date écrite `2026-09-26` dans le texte d'aucun écran traversé (espace, super-admin,
 *   page publique, widget), et la date des conditions et d'une passkey en `JJ.MM.AAAA`.
 * - B1 : les aides sous les champs clés, et des libellés qui disent ce qu'ils font ; sur un
 *   téléphone, la confirmation avant de supprimer une salle occupée se voit sans défiler ; sans
 *   JavaScript, une session du vendredi se supprime, et l'écran le dit. Le message d'une séance
 *   déplacée le même jour dit un changement d'heure, et le programme de la semaine une nouvelle
 *   heure, dans chaque langue ; dans la carte d'une session du vendredi, l'aide de « À partir du »
 *   est celle d'une modification ; dans Réglages, le nom et la formule d'accueil tapés au clavier
 *   s'enregistrent, même quand la couleur change ensuite.
 * - B2 : l'écran du super-admin, de « Créer une organisation » au lien de connexion de secours ;
 *   l'adresse proposée pendant la frappe, et par le serveur sans JavaScript ; une seconde passkey,
 *   qui a son propre nom et un message juste.
 * - B3 : l'écran Membres dit ce que fait un éditeur, sans lui promettre de supprimer un cours, et ce
 *   qui est réservé au responsable ; une responsable qui se donne le rôle d'éditeur le lit sur
 *   l'écran où elle arrive.
 * - B4 : le résumé du formulaire de cours, sa ligne de description, et ce qui manque, signalé ; une
 *   description écrite sans le titre de sa langue est refusée, avec une phrase qui nomme la langue,
 *   et l'écran revient sur l'onglet de cette langue.
 * - C1 : « D'où viennent vos heures de prière ? », ses trois réponses et l'aperçu de sept jours ;
 *   axe à 390 px de large sur les trois réponses.
 * - C2 : la localité trouvée par son nom et par son NPA, sans service extérieur, avec l'attribution
 *   de swisstopo, et les heures qu'elle donne : celles que `@jadwal/core` calcule pour la position
 *   de la liste, sur l'écran, sur la page publique et dans le flux. Avec JavaScript, « Hors de
 *   Suisse » et « Méthode de calcul, école et ajustements » restent ouverts pendant qu'on tape, une
 *   touche à la fois, et une position tapée coche « Hors de Suisse » à la place de la localité.
 *   Sans JavaScript, une position hors de Suisse, cette case cochée, s'enregistre à la place de la
 *   localité, puis la localité revient.
 * - C3 : un cours « avant une prière », des minutes positives à l'écran ; avec JavaScript, le
 *   navigateur exige les champs de l'horaire choisi, et eux seuls.
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
 * - E1 : l'agenda selon l'appareil, iPhone (ni Google ni Outlook), Android (le bouton de Google),
 *   ordinateur (le choix complet), et une réponse qui dit aux caches qu'elle en dépend.
 * - E2 : le délai d'Outlook, dit sous Outlook. Celui de Google, que l'étape 18 disait aussi, a
 *   laissé la place à la page du programme (19-agenda-derniere-minute).
 * - F1 : l'exploitant est Voltia ; le nom de personne retiré du dépôt ne s'affiche nulle part.
 * - H2 : l'écran d'acceptation compte une invitation en attente, comme la navigation.
 *
 * Les autres retours de l'étape 18 ne sont pas des écrans. H1 (les rôles dans la base) est éprouvé
 * par les tests d'attaque de `packages/db`. H3 et H4 (la compression et l'en-tête `Via`) tiennent au
 * bloc de site de Caddy, dans `infra/caddy/`, qui a ses propres vérifications. H5 (`queue: max`) est
 * lu dans `.github/workflows/parcours.yml` par `scripts/eprouver-garde-deploiement.mjs`. G et I sont
 * des gestes sur le serveur, relevés dans le rapport de l'étape.
 *
 * ### Les corrections de l'étape 19
 *
 * L'arabe relu, l'exemple du super-admin, la langue du courriel d'invitation :
 *
 * - 19-B1 à 19-B11 : chaque phrase arabe relue, à sa place, écran en arabe. Partager (B1, B9),
 *   « À venir » (B2, B9 ; B10, l'alerte d'un programme qui ne s'affiche plus sur le site, une vue
 *   du widget datée d'avant la semaine écrite dans la base), l'écran du vendredi après « Retirer de
 *   la page publique » (B3), la lecture d'un fichier d'heures séparé par des tabulations, dont
 *   vingt-cinq lignes sont refusées, l'ordre des dates choisi à l'écran, jour puis mois, pour que
 *   le compte ne dépende pas du jour du passage (B4 à B6), l'aide d'une nouvelle période (B7),
 *   Membres et un rôle inconnu, que le parcours ajoute au choix du rôle comme un formulaire écrit à
 *   la main (B8), l'aide du bouton de Google sur Android (B11).
 * - 19-B12 : l'exemple du super-admin, « Association Horizon » et « association-horizon », en
 *   arabe « جمعية الأفق », et la règle de l'adresse, dans les cinq langues.
 * - 19-C : l'invitation part dans la langue choisie sous l'adresse, et non dans celle de l'écran.
 *
 * Les défauts :
 *
 * - 19-D2, le vendredi : un vendredi passé à annuler, la veille comme jour d'arrivée d'un
 *   déplacement, une salle ou une session supprimées entre-temps depuis un autre onglet, refusés
 *   par une phrase, sans erreur 500. Là où l'écran peut le montrer, rien n'est écrit : aucune
 *   session ajoutée, aucune session déplacée ; ailleurs, l'écran ne confirme rien.
 * - 19-D3, les cours : la responsable supprime un cours depuis /cours, avec et sans JavaScript.
 * - 19-D4, « À venir » : un cours en brouillon marqué, et hors du programme de la semaine ; une
 *   carte « date exceptionnelle » qui se rétablit ; le refus d'une carte restée ouverte qui nomme la
 *   séance ; le calendrier de « Nouvelle date » borné au 31.12.2100 ; le vendredi, un cours placé
 *   après le Dhuhr qui prend l'heure de la session publiée, et non celle d'une session en
 *   brouillon, sur sa carte comme dans les messages.
 * - 19-D5, les prières : l'aperçu d'une nouvelle période sous un titre de niveau 3, et axe n'y
 *   relève plus « heading-order ».
 * - 19-D6, le super-admin : l'adresse proposée d'après « Club № 5 » ou « Horizon™ », rien pour un
 *   nom sans lettre latine, et, sans JavaScript, l'adresse montrée avant de créer l'organisation.
 * - 19-D7, l'italien : « Inizialmente <giorno> JJ.MM.AAAA », sans « In origine: » ni article.
 * - 19-D8, le français : « l’espace d’Association voisine », « Le programme d’Association
 *   voisine ».
 *
 * Les décisions appliquées, sur la page publique et l'agenda :
 *
 * - 19-agenda-outlook : « Outlook (travail ou école) », et à quels comptes sert chaque Outlook,
 *   dans les cinq langues.
 * - 19-agenda-android : sur Android, « ouvrez cette page sur un ordinateur », puis l'adresse de la
 *   page, sur la page d'abonnement et sur celle d'un cours.
 * - 19-agenda-derniere-minute : la page du programme pour un changement de dernière minute, à la
 *   place du délai de Google.
 * - 19-agenda-page-du-cours : « Page du cours » sous chaque cours, sur un iPhone.
 * - 19-agenda-autre-appareil : « Une autre application ou un autre appareil ? », puis le lien
 *   « Voir tous les choix », seul.
 * - 19-annulee : une session du vendredi annulée porte « Annulée », accordé à la prière, dans la vue
 *   Semaine, l'onglet « Prières » et la vue Mois, dans les cinq langues.
 * - 19-widget-prieres : le widget posé avec `view="prieres"` s'ouvre sur l'onglet « Prières ».
 * - 19-og-locale : `og:locale` et un `og:locale:alternate` par autre langue publiée.
 * - 19-langue-non-activee : une langue que l'organisation ne publie pas renvoie à sa langue par
 *   défaut, choix de l'appareil gardé.
 * - 19-404-organisation : sous une organisation connue, le 404 dans sa langue par défaut. La base
 *   donne l'arabe pour langue par défaut à l'organisation voisine le temps de ce 404 : en français,
 *   il ne se distinguerait pas du français que le site prend faute de mieux, l'ancien défaut.
 * - 19-adresse-sans-langue : le lien de connexion qui porte la langue choisie avant la connexion
 *   arrive à une adresse sans elle, sans « ?language= ».
 *
 * Sur les cours :
 *
 * - 19-cours-langue-de-saisie : la langue de saisie coche la langue d'enseignement.
 * - 19-cours-facultatif : chaque ligne facultative du résumé porte « (facultatif) ».
 * - 19-cours-premier-jour : le premier jour d'un cours à dates précises suit la première date, avec
 *   JavaScript, et le serveur le remplit sans.
 * - 19-cours-hors-periode : un cours dont des dates tombent hors de sa période porte « À corriger »
 *   dans la liste ; la base lui donne ce dernier jour, que le formulaire refuse depuis l'étape 18.
 * - 19-cours-titre-manquant : une description sans le titre de sa langue se signale dans le résumé.
 * - 19-cours-message : un cours publié donne le message « nouveau cours », prêt à coller.
 * - 19-cours-seance-barree : sur la page publique d'un cours, la séance annulée reste, barrée.
 * - 19-cours-sans-js : le formulaire d'un cours sans JavaScript, le choix d'une prière envoyé heures
 *   vides, et « après une prière » qui laisse partir 0 minute comme 180.
 * - 19-cours-session-vendredi : l'adresse d'une session du vendredi sous /cours mène au 404 de
 *   l'espace, et non au formulaire d'un cours, dont l'envoi faisait de la session un cours.
 *
 * Sur les prières :
 *
 * - 19-prieres-rue : « Rüe » propose d'abord les noms qui portent « Rüe », « ü » d'un ou de deux
 *   points de code.
 * - 19-prieres-copie : la copie d'une période au nom de soixante signes garde sa marque entière.
 * - 19-prieres-periode-passee : l'aperçu d'une période terminée le dit.
 * - 19-prieres-hors-de-suisse : sans JavaScript, une position tapée l'emporte sur la localité
 *   cochée, sans toucher à la liste : le serveur coche lui-même « Hors de Suisse ». Avec
 *   JavaScript, la case se cochait déjà pendant la frappe à l'étape 18 : C2 le vérifie. Sans
 *   JavaScript encore, la latitude seule vidée : l'erreur, et le repli « Hors de Suisse » ouvert
 *   sur le champ dont elle parle. Il revenait fermé, une régression faite puis corrigée pendant
 *   l'étape 19.
 * - 19-prieres-angle : l'aide de la règle des nuits courtes dit que « Proportionnelle à l’angle »
 *   donne des heures qui changent avec la méthode de calcul.
 * - 19-prieres-jumua-brouillon : le vendredi, le tableau des heures servies ne dit que l'heure des
 *   sessions publiées, et non celle d'une session en brouillon.
 *
 * Sur les membres :
 *
 * - 19-membres-confirmations : changer un rôle, et retirer un autre membre, se confirment en haut
 *   de l'écran ; « Ne rien changer » ne change rien.
 * - 19-membres-depart : une responsable qui se retire elle-même lit un encadré à l'arrivée.
 * - 19-membres-quitter : « Quitter l’organisation » depuis « Vos organisations », et le refus fait à
 *   la seule personne responsable, qui dit pourquoi et quoi faire. Membre d'une seule organisation,
 *   la navigation mène à cet écran sous son titre, « Vos organisations ».
 * - 19-membres-salle : une salle déjà supprimée dans un autre onglet, « Cette salle n’existe
 *   plus. ».
 *
 * Sur « À venir » et le vendredi :
 *
 * - 19-titre-langue-ecran : une séance porte son titre dans la langue de l'écran.
 * - 19-texte-vendredi : le message d'une session du vendredi annulée parle d'une prière.
 * - 19-sermon : la langue du sermon parmi les huit langues d'enseignement.
 * - 19-retablir-nouvelle-date : « Rétablir comme d’habitude » sur la ligne « Nouvelle date ».
 * - 19-jour-sans-seance : annuler un jour sans séance, par un formulaire modifié dans la page, est
 *   refusé par une phrase, sur « À venir » et sur l'écran du vendredi.
 *
 * Les langues vérifiées, retour par retour. Une correction faite dans les cinq langues n'est pas
 * toujours vérifiée dans les cinq : les phrases de chaque langue sont éprouvées par les tests de
 * `apps/web`, et le parcours en lit ici :
 *
 * - dans les cinq langues : 19-B12, 19-agenda-outlook, 19-annulee, 19-og-locale (la page du
 *   programme ; la page d'un cours et celle de l'abonnement en français, en anglais et en arabe),
 *   19-prieres-angle, le refus fait à la seule personne responsable et le lien « Vos organisations »
 *   (19-membres-quitter), le 404 d'une session sous /cours (19-cours-session-vendredi), et les
 *   messages de 19-D4 (le programme de la semaine, le déplacement d'un cours placé après le Dhuhr) ;
 * - en arabe seul : 19-B1 à 19-B11, les phrases relues ;
 * - dans deux langues ou plus, sans les cinq : 19-cours-seance-barree (français, anglais, arabe),
 *   19-titre-langue-ecran (allemand, arabe), 19-C (l'écran en français, le courriel en italien) ;
 * - dans une autre langue que le français : 19-D7 (italien), 19-adresse-sans-langue (allemand),
 *   19-404-organisation et 19-langue-non-activee (l'anglais demandé ; l'arabe, puis le français
 *   servis) ;
 * - en français seul : tous les autres.
 *
 * Ce que l'étape 19 a changé sans que cela se voie à l'écran n'est pas ici : la base (le journal
 * signé, les droits de lecture, la suppression réservée, le départ permis, la source déclarée des
 * heures de prière, retirée sans que l'écran change, la fin de l'état « archivé », que le
 * formulaire d'un cours ne proposait pas à l'étape 18, et le type d'une ligne de cours, figé par
 * un déclencheur) est éprouvée par les tests de `packages/db`, et les outils (l'épreuve du PDF,
 * l'image, le bloc de site, les tests liés au temps) par leurs propres épreuves. De ces changements
 * de la base, l'écran ne montre qu'une chose : une session du vendredi ne s'ouvre plus comme un
 * cours, et 19-cours-session-vendredi le vérifie.
 *
 * ## La date figée (étape 19, D9)
 *
 * Le parcours ne lit plus la date de son lancement pour savoir ce qu'il attend. Il pose l'horloge
 * du serveur à un instant, par `scripts/horloge-figee.mjs`, monté en lecture seule dans le seul
 * conteneur de l'application et chargé par `NODE_OPTIONS=--import=…`, avec
 * `JADWAL_HORLOGE_FIGEE` ; le conteneur des rôles et des migrations n'en reçoit rien. Toutes les
 * dates attendues partent de ce même instant : les heures de prière (C2), le jour de l'onglet
 * « Prières » (C4), les séances, la date d'une passkey. L'horloge part de l'instant et avance au
 * rythme réel ; le serveur dit dans son journal d'où elle part, et le parcours le vérifie.
 *
 * La règle : **l'instant du lancement, ramené à 20:00, heure de Zurich, s'il tombe plus tard**. La
 * base mesure l'âge d'une session du super-admin avec son horloge à elle, `now()`, contre la date
 * de création que Better Auth écrit depuis Node, à l'horloge posée
 * (`apps/web/src/lib/server/context.ts`) ; au-delà de douze heures, la session est supprimée. Un
 * instant loin du vrai la couperait : un instant fixe, « 10:00 le jour du lancement », la coupe dès
 * qu'un passage part après 22:00. Avec cette règle, l'horloge posée ne retarde jamais de plus de
 * quatre heures sur la base, et elle a au moins quatre heures avant son minuit : un passage ne
 * change pas de jour en route. L'instant est celui du jour du lancement à Zurich : la date de la
 * base et celle du serveur restent la même.
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
 * retours n'ont pas été atteints. Les gestes que l'étape 19 a changés et dont la suite dépend
 * (confirmer un rôle, par exemple) ne sont joués que si l'écran les offre : sur l'image de
 * l'étape 18, les vérifications de ses propres retours restent ainsi jouables.
 *
 * Un geste impossible arrête son bloc : les vérifications qui le suivent dans ce bloc ne sont pas
 * jouées. Le parcours les compte lui-même, depuis l'étape 19 : il connaît la liste entière des
 * vérifications de ses retours, le **catalogue** (section du même nom, plus bas), et imprime à la
 * fin celles qui n'ont pas été jouées, une par ligne, puis leur nombre. Un libellé s'y écrit sous
 * une forme neutre : les dates, l'hôte et son port, et tout « <nombre> écrans » (les écrans lus de
 * A3 et F1, ceux de l'espace parcourus par D2), qui change d'une image à l'autre, y sont remplacés
 * par un mot. Un passage strict échoue si une
 * vérification du catalogue n'a pas été jouée, ou si une vérification jouée n'y est pas. Le bilan
 * donne ces nombres pour l'étape 18 et pour l'étape 19, à part.
 *
 * Une vérification faite de plusieurs conditions les nomme (`verifierChaque`), qu'elle soit celle
 * d'un retour ou non : sa ligne rouge commence par « tombé : » et le nom de celles qui manquent,
 * puis ce que l'écran montrait. Un relevé dit donc laquelle est tombée, et pas seulement ce qu'une
 * ligne verte aurait dit.
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
 * doit marcher sans script. Une position hors de Suisse y remplace la localité de Bienne, qui est
 * enregistrée de nouveau avant la suite : les heures de prière redeviennent celles de l'étape g. Le
 * super-admin passe aussi par un navigateur sans JavaScript, dès
 * l'étape a, pour l'adresse que le serveur propose quand personne ne l'a vue se remplir : il la
 * montre en entier, et ne crée l'organisation qu'une fois l'adresse confirmée (étape 19, D6).
 *
 * ## En dernier, ce qui change l'organisation
 *
 * Les derniers pas viennent après tous les autres, parce qu'ils changent ce que les autres lisent.
 * L'écran du vendredi et « À venir » reçoivent d'abord ce que l'étape 19 y a corrigé, chaque geste
 * défait à la fin de son bloc (étape p). La session du vendredi est ensuite déplacée le même jour,
 * sur « À venir ». Deux onglets ouverts avant, l'un sur « À venir », l'autre sur l'écran du
 * vendredi, renvoient ensuite leur carte restée telle quelle ; la session, rétablie, est annulée
 * pour ce vendredi, lue sur la page publique, puis rétablie. Le nom et la formule d'accueil sont
 * tapés dans Réglages, puis remis. Une seconde personne responsable rejoint l'organisation, la
 * première se donne le rôle d'éditeur, la seconde lui rend le sien, puis s'en va. Enfin, la
 * personne du parcours quitte l'organisation voisine (étape q).
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
 *   défaut, la racine du dépôt. Un instantané (`git worktree add --detach <dossier> HEAD`,
 *   retiré ensuite par `git worktree remove <dossier>`) construit ce qui est commité, même si
 *   l'arbre de travail change pendant ce temps. L'image construite est retirée à la fin. Le module
 *   de l'horloge posée, lui, vient toujours du dépôt qui lance le parcours.
 * - `JADWAL_PARCOURS_RELEVE` : `1` pour le mode relevé, décrit plus haut.
 * - `JADWAL_PARCOURS_NOM_RETIRE` : facultatif, le nom de personne retiré au retour F1, pour le
 *   chercher tel quel sur chaque écran. Il vient de `PRIVE/` et n'entre jamais dans le dépôt.
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
import { randomUUID } from 'node:crypto';
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
 * Le nom de personne que le retour F1 a retiré n'est écrit nulle part dans le dépôt, ni en clair ni
 * sous une empreinte : une empreinte sans secret d'un nom se retrouve en essayant des noms. Le
 * parcours voit sa trace à la forme qu'il avait à l'écran, le nom suivi de l'exploitant entre
 * parenthèses, « … (Voltia) ». Sur le poste, `JADWAL_PARCOURS_NOM_RETIRE` peut donner le nom
 * lui-même (tiré de `PRIVE/`, jamais du dépôt), et il est alors cherché tel quel.
 */
const NOM_RETIRE = process.env['JADWAL_PARCOURS_NOM_RETIRE']?.trim().toLowerCase() ?? '';

/** La langue que le navigateur annonce : celle d'une personne de Suisse romande. */
const LANGUE_DU_NAVIGATEUR = 'fr-CH';

/** Ce que le parcours saisit. Des adresses en `example.test`, qui ne mènent nulle part. */
const SUPER_ADMIN = 'super-admin@example.test';
const RESPONSABLE = 'responsable@example.test';
/** Une adresse sans compte, invitée depuis un écran en allemand (retour D3). */
const INVITEE_EN_ALLEMAND = 'eingeladen@example.test';
/** Une adresse sans compte, invitée en italien depuis l'écran en français (étape 19, C). */
const INVITEE_EN_ITALIEN = 'invitata@example.test';
/**
 * `espaceDe` : « l’espace de … » dans la phrase de l'écran d'acceptation, écrit ici en toutes
 * lettres. Un nom qui commence par une voyelle y prend « d’ » (relevé D8 du 27.09.2026).
 */
const ORGANISATION = {
	nom: 'Centre du Parcours',
	slug: 'centre-parcours',
	espaceDe: 'l’espace de Centre du Parcours'
};
/** L'adresse que l'écran du super-admin propose pour ce nom, avant qu'on la change (retour B2). */
const ADRESSE_PROPOSEE = 'centre-du-parcours';
/**
 * L'exemple que l'écran du super-admin donne sous le nom et sous l'adresse (étape 19, B12) : un
 * nom, le même en français, en allemand, en italien et en anglais, et son nom arabe.
 */
const EXEMPLE_DU_SUPER_ADMIN = {
	nom: 'Association Horizon',
	nomArabe: 'جمعية الأفق',
	adresse: 'association-horizon'
};
/**
 * Sous les champs du super-admin, dans chaque langue (`apps/web/src/lib/i18n/super-admin.ts`) : le
 * mot qui annonce l'exemple, et la règle de l'adresse, qui demande une lettre (étape 19, B12).
 */
const SOUS_LES_CHAMPS_DU_SUPER_ADMIN = {
	fr: {
		exemple: 'Exemple :',
		regle:
			'Lettres minuscules sans accent ni cédille, chiffres et traits d’union, avec au moins une lettre.'
	},
	de: {
		exemple: 'Beispiel:',
		regle:
			'Kleinbuchstaben ohne Umlaute und Akzente, Ziffern und Bindestriche, mit mindestens einem Buchstaben.'
	},
	it: {
		exemple: 'Esempio:',
		regle: 'Lettere minuscole senza accenti, cifre e trattini, con almeno una lettera.'
	},
	en: {
		exemple: 'Example:',
		regle: 'Lower-case letters without accents, digits and hyphens, with at least one letter.'
	},
	ar: {
		exemple: 'مثال:',
		regle: 'أحرف لاتينية صغيرة بلا علامات، وأرقام، وشرطات، مع حرف واحد على الأقل.'
	}
};
/** La seconde organisation de la personne invitée, où elle est éditrice. */
const VOISINE = {
	nom: 'Association voisine',
	slug: 'association-voisine',
	espaceDe: 'l’espace d’Association voisine'
};
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
 * Un cours à dates précises, tapées dans le désordre, publié puis supprimé (étape 19) : le message
 * « nouveau cours », le premier jour tiré des dates, une date hors de sa période, la suppression.
 */
const ANNONCE_EN_DESORDRE = 'Annoncé dans le désordre';
/** Un cours à dates précises saisi sans JavaScript, en brouillon, puis supprimé (étape 19). */
const DATES_SANS_SCRIPT = 'Dates sans script';
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
/**
 * Le résumé des deux replis de la réponse « Calculées pour votre localité », tel que l'écran les
 * écrit (`apps/web/src/lib/i18n/prayers.ts`), et une position hors de Suisse, celle de Paris, que
 * le parcours tape sous le premier (retour C2).
 */
const REPLIS_DES_PRIERES = {
	horsDeSuisse: 'Hors de Suisse',
	methode: 'Méthode de calcul, école et ajustements (facultatif)'
};
const POSITION_HORS_DE_SUISSE = { latitude: '48.8566', longitude: '2.3522' };
/**
 * Sans JavaScript (retour C2) : la dernière case de la liste des localités, qui choisit la position
 * tapée sous « Hors de Suisse », et ce que l'écran dit une fois cette position enregistrée.
 */
const CHOIX_HORS_DE_SUISSE = 'Hors de Suisse : utiliser la position donnée plus bas';
const POSITION_DONNEE = 'Vos heures sont calculées pour la position que vous avez donnée.';
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
/**
 * L'étape p (étape 19) : une salle libre, supprimée depuis un autre onglet, et une session d'une
 * autre heure, ajoutée dans cette salle, puis au sermon en albanais et en turc.
 */
const SALLE_PROVISOIRE = 'Salle provisoire';
const SESSION_DANS_LA_SALLE = { debut: '14:30', fin: '15:10' };
/**
 * Un cours publié le vendredi, placé après le Dhuhr, créé puis supprimé à l'étape p, pendant que la
 * seconde session est en brouillon (étape 19, D4), et l'heure où il est déplacé le même jour.
 */
const COURS_APRES_DHUHR = { titre: 'Leçon après Dhuhr', minutes: 30, duree: 60, deplace: '16:00' };
/** La nouvelle heure de la session du vendredi, déplacée le même jour sur « À venir » (A2, B1). */
const HEURE_DU_VENDREDI_DEPLACE = '13:00';
/**
 * La marque d'une séance déplacée le même jour dans le programme de la semaine, dans chaque langue
 * (`apps/web/src/lib/messages.ts`, retour B1).
 */
const NOUVELLE_HEURE_DANS_LA_SEMAINE = {
	fr: '(nouvelle heure)',
	de: '(neue Uhrzeit)',
	it: '(nuovo orario)',
	en: '(new time)',
	ar: '(وقت جديد)'
};
/**
 * Les phrases lues à la lettre dans les écrans corrigés depuis la relecture du lot 4 : ce que dit
 * l'écran du vendredi après une suppression, l'aide de « À partir du » dans la carte d'une session,
 * et son refus d'une carte restée ouverte (`friday.ts`) ; le refus d'une carte restée ouverte sur
 * « À venir » (`upcoming.ts`), qui nomme la séance par son titre et sa date depuis l'étape 19 (D4) ;
 * ce que lit une responsable qui s'est donné le rôle d'éditeur (`common.ts`).
 */
const SESSION_SUPPRIMEE = 'La session est supprimée.';
const AIDE_DE_LA_MODIFICATION =
	'La session a lieu chaque vendredi à partir de cette date. Changez cette date seulement pour corriger une erreur.';
const SESSION_CHANGEE =
	'Cette session a changé depuis l’ouverture de la page : elle a déjà été annulée ou déplacée ce jour-là. Rien n’a été enregistré. La partie « Ce vendredi », plus bas, est à jour.';
const SEANCE_CHANGEE = (titre, date) =>
	`La séance « ${titre} » du ${date} a changé depuis l’ouverture de la page : elle a déjà été annulée ou déplacée. Rien n’a été enregistré. Le programme ci-dessous est à jour.`;
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
 * B2), comme l'écran l'aurait fait pendant la frappe, et la montre avant de créer quoi que ce soit
 * (étape 19, D6).
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
		depart: 'Spostato a ',
		arrivee: 'Inizialmente '
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
 * Le titre de la page d'erreur de l'espace des responsables pour une adresse qui ne mène à rien,
 * dans chaque langue (`apps/web/src/lib/i18n/error.ts`).
 */
const ESPACE_INTROUVABLE = {
	fr: 'Page introuvable',
	de: 'Seite nicht gefunden',
	it: 'Pagina non trovata',
	en: 'Page not found',
	ar: 'الصفحة غير موجودة'
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
 * La marque d'une session du vendredi annulée, accordée à la prière, dans chaque langue de la page
 * publique (`cancelledJumua`, `apps/web/src/lib/i18n.ts`, étape 19).
 */
const ANNULEE_DU_VENDREDI = {
	fr: 'Annulée',
	de: 'Abgesagt',
	it: 'Annullata',
	en: 'Cancelled',
	ar: 'ملغاة'
};
/**
 * Sur un ordinateur, l'Outlook des comptes de travail ou d'école, et ce que l'aide de chaque Outlook
 * dit des comptes qu'il sert, dans chaque langue (`apps/web/src/lib/i18n.ts`, étape 19).
 */
const OUTLOOK_TRAVAIL = {
	fr: {
		lien: 'Outlook (travail ou école)',
		personnels: 'Ce lien sert aux comptes personnels.',
		travail: 'Ce lien sert aux comptes de travail ou d’école.'
	},
	de: {
		lien: 'Outlook (Arbeit oder Schule)',
		personnels: 'Dieser Link ist für private Konten.',
		travail: 'Dieser Link ist für Geschäfts- oder Schulkonten.'
	},
	it: {
		lien: 'Outlook (lavoro o scuola)',
		personnels: 'Questo link è per gli account personali.',
		travail: 'Questo link è per gli account di lavoro o di scuola.'
	},
	en: {
		lien: 'Outlook (work or school)',
		personnels: 'This link is for personal accounts.',
		travail: 'This link is for work or school accounts.'
	},
	ar: {
		lien: 'Outlook (حساب عمل أو مدرسة)',
		personnels: 'هذا الرابط للحسابات الشخصية.',
		travail: 'هذا الرابط لحسابات العمل أو المدرسة.'
	}
};
/**
 * La fin de l'aide de la règle des nuits courtes, dans chaque langue (`ruleHint`,
 * `apps/web/src/lib/i18n/prayers.ts`) : les heures « proportionnelles à l'angle » changent avec la
 * méthode de calcul, le champ juste au-dessus (étape 19). Elles dépendaient, avant, « de l'angle de
 * la méthode choisie ».
 */
const NUITS_COURTES = {
	fr: '« Proportionnelle à l’angle » donne des heures entre les deux, qui changent avec la méthode de calcul.',
	de: '«Anteilig zum Winkel» ergibt Zeiten zwischen den beiden, die sich mit der Berechnungsmethode ändern.',
	it: '«Proporzionale all’angolo» dà orari tra i due, che cambiano con il metodo di calcolo.',
	en: '‘In proportion to the angle’ gives times between the two, which change with the calculation method.',
	ar: '«بنسبة الزاوية» تعطي مواقيت بين الاثنتين، تتغير بحسب طريقة الحساب.'
};
/**
 * Le refus fait à la seule personne responsable qui veut quitter son organisation, dans chaque
 * langue (`apps/web/src/lib/i18n/organisations.ts`, étape 19) : la phrase avant le nom de
 * l'organisation, puis ce qu'elle doit faire pour partir.
 */
const SEULE_RESPONSABLE = {
	fr: {
		avantLeNom: 'Vous êtes la seule personne responsable de cette organisation :',
		quoiFaire:
			'Une organisation garde toujours au moins une personne responsable. Avant de la quitter, ouvrez-la, puis, dans l’écran Membres, donnez le rôle de responsable à un autre membre ou invitez une personne comme responsable.'
	},
	de: {
		avantLeNom: 'Sie sind die einzige Person in der Leitung dieser Organisation:',
		quoiFaire:
			'Eine Organisation behält immer mindestens eine Person in der Leitung. Bevor Sie sie verlassen, öffnen Sie sie und geben Sie auf der Seite «Mitglieder» einem anderen Mitglied die Rolle «Leitung», oder laden Sie eine Person für die Leitung ein.'
	},
	it: {
		avantLeNom: 'Sei l’unica persona responsabile di questa organizzazione:',
		quoiFaire:
			'Un’organizzazione ha sempre almeno un responsabile. Prima di lasciarla, aprila e, nella pagina Membri, dai il ruolo di responsabile a un altro membro o invita una persona come responsabile.'
	},
	en: {
		avantLeNom: 'You are the only manager of this organisation:',
		quoiFaire:
			'An organisation always keeps at least one manager. Before leaving it, open it, then, on the Members screen, give the manager role to another member or invite someone as a manager.'
	},
	ar: {
		avantLeNom: 'أنت المسؤول الوحيد عن هذه المؤسسة:',
		quoiFaire:
			'تحتفظ المؤسسة دائمًا بمسؤول واحد أو أكثر. قبل مغادرتها، افتحها، ثم امنح في صفحة «الأعضاء» دور المسؤول لعضو آخر أو ادعُ شخصًا بصفة مسؤول.'
	}
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

/** Les retours du chef de projet à l'étape 18, dans l'ordre du tableau final. */
const RETOURS_DE_L_ETAPE_18 = [
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
 * Les corrections de l'étape 19 qui se voient à l'écran, dans l'ordre du prompt du chef de projet :
 * l'arabe relu et l'exemple du super-admin (B1 à B12), la langue du courriel d'invitation (C), les
 * défauts (D2 à D8), puis les décisions appliquées. L'en-tête du script dit ce que chacune vérifie.
 */
const RETOURS_DE_L_ETAPE_19 = [
	'19-B1',
	'19-B2',
	'19-B3',
	'19-B4',
	'19-B5',
	'19-B6',
	'19-B7',
	'19-B8',
	'19-B9',
	'19-B10',
	'19-B11',
	'19-B12',
	'19-C',
	'19-D2',
	'19-D3',
	'19-D4',
	'19-D5',
	'19-D6',
	'19-D7',
	'19-D8',
	'19-agenda-outlook',
	'19-agenda-android',
	'19-agenda-derniere-minute',
	'19-agenda-page-du-cours',
	'19-agenda-autre-appareil',
	'19-annulee',
	'19-widget-prieres',
	'19-og-locale',
	'19-langue-non-activee',
	'19-404-organisation',
	'19-adresse-sans-langue',
	'19-cours-langue-de-saisie',
	'19-cours-facultatif',
	'19-cours-premier-jour',
	'19-cours-hors-periode',
	'19-cours-titre-manquant',
	'19-cours-message',
	'19-cours-seance-barree',
	'19-cours-sans-js',
	'19-cours-session-vendredi',
	'19-prieres-rue',
	'19-prieres-copie',
	'19-prieres-periode-passee',
	'19-prieres-hors-de-suisse',
	'19-prieres-angle',
	'19-prieres-jumua-brouillon',
	'19-membres-confirmations',
	'19-membres-depart',
	'19-membres-quitter',
	'19-membres-salle',
	'19-titre-langue-ecran',
	'19-texte-vendredi',
	'19-sermon',
	'19-retablir-nouvelle-date',
	'19-jour-sans-seance'
];
/** Tous les retours, dans l'ordre du tableau final. */
const RETOURS = [...RETOURS_DE_L_ETAPE_18, ...RETOURS_DE_L_ETAPE_19];
/**
 * Chaque vérification d'un retour : `{ retour, quoi, ok, detail }`, et `impossible` pour un geste
 * que l'écran n'offre pas, qui a arrêté son bloc.
 */
const releve = [];
/** La lettre du retour dont le bloc est en cours, ou `null` hors de tout bloc. */
let retourCourant = null;

/**
 * Le libellé d'une vérification, sans ce qui change d'un passage à l'autre : l'hôte et son port,
 * les dates (celles du jour de l'horloge posée), le jour de la semaine qui les précède, et tout
 * « <nombre> écrans » (A3, F1 et D2), qui change d'une image à l'autre. C'est sous cette forme que
 * le catalogue les connaît.
 */
function neutre(quoi) {
	return quoi
		.replace(/\b(?:localhost|127\.0\.0\.1):\d+/g, 'HÔTE')
		.replace(/\d{2}\.\d{2}\.\d{4}/g, 'JJ.MM.AAAA')
		.replace(/\d{4}-\d{2}-\d{2}/g, 'AAAA-MM-JJ')
		.replace(/\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?= JJ\.MM\.AAAA)/g, 'JOUR')
		.replace(/, le (?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)$/, ', le JOUR')
		.replace(/\b\d+ écrans\b/g, 'N écrans');
}

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
 * Une vérification faite de plusieurs conditions, chacune nommée : elle passe quand toutes sont
 * vraies. Sa ligne rouge commence par le nom de celles qui sont tombées, puis ce que l'écran
 * montrait ; sa ligne verte ne dit que ce que l'écran montrait.
 */
function verifierChaque(quoi, conditions, detail = '') {
	const tombees = Object.entries(conditions)
		.filter(([, vraie]) => !vraie)
		.map(([nom]) => nom);
	const dit =
		tombees.length === 0
			? detail
			: [`tombé : ${tombees.join(', ')}`, detail].filter(Boolean).join(' ; ');
	return verifier(quoi, tombees.length === 0, dit);
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
 * jamais. Le cadre est audité à part. `recharger: false` pour une page qui n'existe que comme
 * réponse d'un formulaire, comme l'aperçu d'une période : la recharger la perdrait.
 */
async function auditer(cible, nom, { iframes = true, recharger = true } = {}) {
	// Une page atteinte par un lien de SvelteKit garde le `<title>` de la précédente quand elle n'en
	// pose pas : axe n'y verrait rien. On la recharge donc d'abord, en GET, sans l'action d'un
	// formulaire qu'un rechargement renverrait. Mesuré : l'écran Membres, sans titre, portait celui
	// de l'accueil.
	if (recharger && typeof cible.mainFrame === 'function' && cible.url().startsWith(ORIGINE)) {
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

/**
 * L'instant où le parcours pose l'horloge du serveur (étape 19, D9) : celui du lancement, ramené à
 * 20:00, heure de Zurich, s'il tombe plus tard. Il s'écrit à l'heure de Zurich, avec son décalage,
 * « 2026-09-28T20:00:00+02:00 », comme `scripts/horloge-figee.mjs` le lit. Un changement d'heure
 * tombe à 2 ou 3 heures du matin : le décalage du lancement est celui de 20:00 le même jour.
 */
function instantDuParcours(lancement = new Date()) {
	const parties = Object.fromEntries(
		new Intl.DateTimeFormat('en-CA', {
			timeZone: FUSEAU,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hourCycle: 'h23',
			timeZoneName: 'longOffset'
		})
			.formatToParts(lancement)
			.map((partie) => [partie.type, partie.value])
	);
	const jour = `${parties['year']}-${parties['month']}-${parties['day']}`;
	const heure = `${parties['hour']}:${parties['minute']}:${parties['second']}`;
	const decalage = String(parties['timeZoneName']).replace('GMT', '') || '+00:00';
	return `${jour}T${heure > LIMITE_DE_L_HORLOGE ? LIMITE_DE_L_HORLOGE : heure}${decalage}`;
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

/**
 * La forme d'un identifiant de la base, celle que le serveur vérifie avant de lire un cours
 * (`apps/web/src/routes/cours/+page.server.ts`). Une valeur lue à l'écran doit l'avoir pour entrer
 * dans une requête.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/**
 * Une requête jouée dans la base du parcours, par son propriétaire, là où aucun écran ne mène : une
 * vue du widget datée d'avant la semaine (B10), un cours enregistré avant la règle de l'étape 18
 * (dates hors de sa période), l'arabe pour langue par défaut de l'organisation voisine, où la
 * personne du parcours n'est qu'éditrice, le temps d'un 404 (19-404-organisation). Le texte de la
 * requête vient de ce script. Une seule valeur y entre depuis le serveur : l'identifiant du cours
 * à dates précises, lu à l'adresse où l'écran revient ; il n'y entre qu'avec la forme d'un
 * identifiant (`UUID`), sinon le geste est impossible.
 */
function ecrireDansLaBase(requete) {
	const passage = spawnSync(
		'docker',
		[
			'exec',
			marche.base,
			'psql',
			'-U',
			'jadwal',
			'-d',
			'jadwal',
			'-v',
			'ON_ERROR_STOP=1',
			'-At',
			'-c',
			requete
		],
		{ encoding: 'utf8' }
	);
	return {
		ok: passage.status === 0,
		sortie: `${passage.stdout ?? ''}${passage.stderr ?? ''}`.trim().split('\n').pop() ?? ''
	};
}

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

/** Vrai si le texte porte la trace du nom de personne retiré du dépôt (voir `NOM_RETIRE`). */
function nommeLaPersonneRetiree(texte) {
	if (texte.includes(`(${EXPLOITANT})`)) return true;
	return NOM_RETIRE !== '' && texte.toLowerCase().includes(NOM_RETIRE);
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
		verifierChaque(
			`aucune date écrite AAAA-MM-JJ sur les ${lus.length} écrans traversés (espace, super-admin, page publique, widget)`,
			{
				'au moins un écran lu': lus.length > 0,
				'aucune date AAAA-MM-JJ': avecDates.length === 0
			},
			avecDates
				.slice(0, 8)
				.map(([cle, lu]) => `${cle} : ${lu.dates.slice(0, 3).join(', ')}`)
				.join(' ; ')
		);
	});
	await retour('F1', async () => {
		verifierChaque(
			`aucun des ${lus.length} écrans traversés ne nomme la personne retirée du dépôt`,
			{
				'au moins un écran lu': lus.length > 0,
				'aucun écran ne nomme la personne retirée': avecNom.length === 0
			},
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
 * L'élément dont le geste suivant a besoin. S'il manque, le geste est impossible sur cet écran : le
 * bloc s'arrête tout de suite, en le nommant, au lieu d'attendre quinze secondes un élément qu'une
 * ancienne image n'a pas.
 */
async function exiger(locator, quoi) {
	if ((await locator.count()) === 0) throw new Error(`${quoi} : absent de cet écran`);
	return locator;
}

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
	ANNONCE_EN_DESORDRE,
	DATES_SANS_SCRIPT,
	SALLE,
	SALLE_PROVISOIRE,
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

/** L'heure de Zurich au-delà de laquelle l'instant du lancement est ramené (voir l'en-tête). */
const LIMITE_DE_L_HORLOGE = '20:00:00';
/** L'instant de l'horloge du serveur, et le jour qu'il donne : toutes les dates attendues en partent. */
const INSTANT = instantDuParcours();
const T = INSTANT.slice(0, 10);
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
	marche.lancerLeServeur(`127.0.0.1:${PORT}:3000`, { ORIGIN: ORIGINE }, { horloge: INSTANT });
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
	// Le module de l'horloge dit sur la sortie d'erreur du serveur d'où elle part : c'est la preuve
	// qu'il a été chargé, et que le serveur compte bien à partir de l'instant du parcours.
	const depart = /horloge-figee : l’horloge de ce processus part du (\S+),/.exec(marche.journal());
	verifierChaque(
		`l’horloge du serveur part de l’instant du parcours, ${INSTANT}`,
		{
			'la ligne de l’horloge dans le journal': depart !== null,
			'l’instant du parcours':
				depart !== null && Date.parse(depart[1] ?? '') === Date.parse(INSTANT)
		},
		depart ? `le serveur dit ${depart[1]}` : 'aucune ligne de l’horloge dans le journal du serveur'
	);
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
			verifierChaque(
				'au premier passage, un navigateur réglé en allemand (de-CH) voit /connexion en allemand',
				{
					'<html lang="de">': lang === 'de',
					'le titre « Anmelden »': (await titre(page)) === 'Anmelden'
				},
				`<html lang="${lang}">, « ${await titre(page)} »`
			);
		});
		await retour('D3', async () => {
			await ouvrir(page, '/connexion');
			await demanderUnLien(page, SUPER_ADMIN);
			const courriel = await attendreCourriel(SUPER_ADMIN, /Anmeldelink/);
			verifierChaque(
				'le lien demandé depuis cet écran allemand part en allemand, <html lang="de"> compris',
				{
					'l’objet en allemand': courriel?.subject === 'Ihr Anmeldelink für jadwal',
					'<html lang="de">': langueDuCourriel(courriel) === 'de',
					'le lien de connexion': Boolean(lienDeConnexion(courriel))
				},
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
	verifierChaque(
		'la passkey est enregistrée, et l’authentificateur la garde',
		{
			'« Passkey enregistrée. »': (await texteDe(annonce)).startsWith('Passkey enregistrée.'),
			'une passkey dans l’authentificateur': credentials.length === 1
		},
		`${await texteDe(annonce)} ; ${credentials.length} dans l’authentificateur`
	);

	await envoyer(page, page.getByRole('button', { name: 'Se connecter avec une passkey' }));
	verifierChaque(
		'la connexion par passkey mène à l’écran du super-admin',
		{
			'l’adresse /super-admin': chemin(page) === '/super-admin',
			'le titre « Super-admin »': (await titre(page)) === 'Super-admin'
		},
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
	await superAdminEtape19(page);
	await ouvrir(page, '/super-admin');
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
	verifierChaque(
		`le super-admin garde « ${CHANGER} » dans sa bannière, vers son écran, et la navigation n’en a pas d’autre`,
		{
			'le lien dans la bannière': (await parLaBanniere.count()) === 1,
			'vers /super-admin':
				(await parLaBanniere.count()) === 1 &&
				(await cheminDuLien(parLaBanniere)) === '/super-admin',
			'la navigation de l’espace': (await navigationDeLEspace(page).count()) === 1,
			'aucun second lien dans la navigation': (await lienChanger(page).count()) === 0
		},
		`${await parLaBanniere.count()} dans la bannière, ${await lienChanger(page).count()} dans la navigation`
	);
	await suivre(page, parLaBanniere, '/super-admin');
	await ouvrirEtEntrer(page, VOISINE, {});
	await naviguer(page, '/membres');
	await inviterEnAllemand(page);
	await inviterDansLaLangueChoisie(page);
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
		verifierChaque(
			'une seconde passkey, pouvoirs actifs : le message dit qu’elle servira à la prochaine connexion, sans renvoyer à un bouton, et l’écran n’en montre pas d’autre que « Enregistrer une passkey »',
			{
				'« Passkey enregistrée. »': message.startsWith('Passkey enregistrée.'),
				'« la prochaine fois »': message.includes('la prochaine fois'),
				'sans renvoyer à un bouton': !/bouton/i.test(message),
				'un seul bouton, « Enregistrer une passkey »':
					boutons.join('|') === 'Enregistrer une passkey'
			},
			`« ${message || 'aucun message'} » ; boutons : ${boutons.join(', ') || 'aucun'}`
		);
		// La liste se relit après le message : on attend la seconde ligne, cinq secondes au plus.
		const lignes = page.locator('li').filter({ hasText: /enregistrée le/i });
		await lignes
			.nth(1)
			.waitFor({ timeout: 5000 })
			.catch(() => undefined);
		const noms = (await lignes.locator('strong').allTextContents()).map((nom) => nom.trim());
		verifierChaque(
			'son nom se distingue de celui de la première',
			{
				'deux passkeys': noms.length === 2,
				'deux noms distincts': new Set(noms).size === 2
			},
			noms.map((nom) => `« ${nom} »`).join(', ') || 'aucun nom'
		);
	});
}

/**
 * Le super-admin sans JavaScript (B2) : l'adresse de la page publique ne se remplit pas pendant la
 * frappe, le champ part vide, et le serveur la propose d'après le nom, comme l'écran l'aurait fait.
 * Il la montre alors en entier, dans un champ où on la confirme ou la change, et ne crée
 * l'organisation qu'à la confirmation (étape 19, D6). La même session, dans un navigateur qui
 * n'exécute aucun script.
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
			const etape = page.locator('section.a-confirmer');
			const montree = (await etape.count()) === 1 ? await texteDe(etape) : '';
			const champ = etape.locator('#slug-confirme');
			const proposee = (await champ.count()) === 1 ? await champ.inputValue() : 'aucun champ';
			const pasEncore =
				(await page.locator('li').filter({ hasText: SANS_SCRIPT.nom }).count()) === 0;
			// L'étape qui montre l'adresse avant de créer est de l'étape 19 (D6) ; l'adresse que le
			// serveur propose, vérifiée plus bas, est celle du retour B2.
			await retour('19-D6', async () => {
				verifierChaque(
					`sans JavaScript, « ${SANS_SCRIPT.nom} », envoyée sans adresse écrite, n’est pas encore créée : l’écran montre en entier l’adresse proposée, « ${adresse} », dans un champ où la confirmer ou la changer`,
					{
						'aucune organisation créée': pasEncore,
						'« Vérifiez l’adresse avant de créer l’organisation »': montree.includes(
							'Vérifiez l’adresse avant de créer l’organisation'
						),
						'l’adresse entière': montree.includes(adresse),
						'le champ porte l’adresse proposée': proposee === SANS_SCRIPT.adresse
					},
					montree || (await texteDe(page.locator('main'))).slice(0, 160)
				);
			});
			if ((await etape.count()) === 1) {
				await envoyer(page, etape.getByRole('button', { name: 'Créer l’organisation' }));
			}
			const succes = page.locator('section.succes');
			const annonce = (await succes.count()) === 1 ? await texteDe(succes) : '';
			const carte = page.locator('li').filter({ hasText: SANS_SCRIPT.nom });
			const cartes = await carte.count();
			verifierChaque(
				`sans JavaScript, « ${SANS_SCRIPT.nom} », créée à la confirmation, reçoit l’adresse que le serveur a proposée, « ${SANS_SCRIPT.adresse} », et l’écran dit l’adresse entière`,
				{
					'l’annonce nomme l’organisation': annonce.includes(SANS_SCRIPT.nom),
					'l’annonce dit l’adresse entière': annonce.includes(adresse),
					'une carte de l’organisation': cartes === 1,
					'la carte dit l’adresse entière': cartes === 1 && (await texteDe(carte)).includes(adresse)
				},
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
				// ce n'est pas une phrase, et il n'a pas à être écarté. L'exemple d'un nom d'organisation,
				// « Association Horizon », est un nom : il reste tel quel hors de l'arabe (étape 19, B12).
				const restes = resteEnFrancais(
					/** @type {string[]} */ (francais.get(ecran)),
					await segmentsLus(page),
					[...NOMS_SAISIS, EXEMPLE_DU_SUPER_ADMIN.nom]
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
		verifierChaque('la langue choisie reste au rechargement', {
			'<html lang="ar">': (await racineDit(page, 'lang')) === 'ar',
			'dir="rtl"': (await racineDit(page, 'dir')) === 'rtl'
		});
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
	verifierChaque(
		`${quel} mène à /conditions, qui montre le document`,
		{
			'le titre « Conditions d’utilisation »': (await titre(page)) === 'Conditions d’utilisation',
			'la liste des données personnelles': elements === DONNEES_PERSONNELLES
		},
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
		verifierChaque(
			`les conditions nomment ${EXPLOITANT} comme exploitant, et nulle part la personne retirée`,
			{
				'l’exploitant nommé': exploitant,
				'la personne retirée absente': !nomRetire
			},
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
		verifierChaque(
			'« Créer une organisation », avec la phrase qui dit ce qu’est une organisation',
			{
				'la phrase de la section':
					phrase ===
					'Une organisation est l’espace d’une association, d’une école ou d’un club : son programme, ses membres et sa page publique.',
				'plus d’« Ouvrir une organisation »':
					(await page.getByText('Ouvrir une organisation').count()) === 0
			},
			phrase || 'aucune section de ce nom'
		);
		// Le champ du fuseau, par son `id` : son libellé n'est pas l'objet de cette vérification.
		const fuseau = page.locator('#timeZone');
		const genre = await fuseau.evaluate((element) => element.tagName.toLowerCase());
		const groupes = await fuseau
			.locator('optgroup')
			.evaluateAll((tous) => tous.map((groupe) => groupe.getAttribute('label')));
		verifierChaque(
			'le fuseau se choisit dans une liste, les fuseaux d’Europe en tête, Europe/Zurich par défaut',
			{
				'une liste': genre === 'select',
				'Europe/Zurich par défaut': (await fuseau.inputValue()) === FUSEAU,
				'l’Europe en tête': groupes[0] === 'Europe'
			},
			`<${genre}> « ${await fuseau.inputValue()} », groupes ${groupes.join(', ') || 'aucun'}`
		);
		const aideDuFuseau = await descriptionDe(fuseau);
		verifierChaque(
			'une phrase sous le fuseau dit à quoi il sert : les heures du programme et celles des prières',
			{
				'les heures du programme': aideDuFuseau.includes('heures du programme'),
				'les heures de prière': aideDuFuseau.includes('heures de prière')
			},
			aideDuFuseau || 'aucune aide'
		);
		const secours = page.locator('section', {
			has: page.getByRole('heading', { name: 'Lien de connexion de secours', exact: true })
		});
		const texte = (await secours.count()) === 1 ? await texteDe(secours) : '';
		verifierChaque(
			'le lien de connexion de secours dit quand s’en servir, ce qui se passe et combien il vaut',
			{
				'quand s’en servir': texte.includes(
					'quand une personne ne reçoit pas le courriel de connexion'
				),
				'ce qui se passe': texte.includes('Le lien s’affiche ici au lieu de partir par courriel'),
				'combien il vaut': texte.includes('Il est valable quinze minutes et ne sert qu’une fois.'),
				'le champ de l’adresse':
					(await secours.getByLabel('Adresse électronique de la personne').count()) === 1,
				'le bouton':
					(await secours.getByRole('button', { name: 'Créer le lien de connexion' }).count()) === 1
			},
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
			verifierChaque(
				`« Adresse de la page publique » est proposée pendant la frappe, « ${proposee} », adresse complète en direct`,
				{
					'le champ « Adresse de la page publique »':
						(await page.getByLabel('Adresse de la page publique', { exact: true }).count()) === 1,
					'l’adresse proposée': (await adresse.inputValue()) === proposee,
					'l’adresse complète en direct': lue === `Adresse complète : ${hote}/m/${proposee}`
				},
				`« ${await adresse.inputValue()} » ; ${lue}`
			);
		});
	}
	await adresse.fill(organisation.slug);
	if (proposee) {
		await retour('B2', async () => {
			const complete = page.locator('#slug-adresse');
			const lue = (await complete.count()) === 1 ? await texteDe(complete) : 'absente';
			verifierChaque(
				'l’adresse se modifie, et l’adresse complète la suit',
				{
					'l’adresse complète suit':
						lue === `Adresse complète : ${new URL(ORIGINE).host}/m/${organisation.slug}`,
					'le bouton « Créer l’organisation »':
						(await page
							.getByRole('button', { name: 'Créer l’organisation', exact: true })
							.count()) === 1
				},
				lue
			);
		});
	}
	await envoyer(page, page.locator('form[action="?/ouvrir"] button[type="submit"]'));
	const carte = page.locator('li').filter({ hasText: organisation.nom });
	verifier(`« ${organisation.nom} » est créée`, (await carte.count()) === 1, organisation.slug);

	await envoyer(page, carte.getByRole('button', { name: 'Entrer dans son espace' }));
	const banniere = await texteDe(page.getByRole('status'));
	verifierChaque(
		'il entre dans son espace, et la bannière le lui rappelle',
		{
			'l’accueil de l’espace': chemin(page) === '/',
			'la bannière nomme l’organisation': banniere.includes(organisation.nom)
		},
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
		verifierChaque(
			'sous le choix du rôle, ce que peut faire un éditeur, et ce qui est réservé au responsable',
			{
				'ce que fait un éditeur': gestesEditeur.some((geste) => geste.includes('Créer un cours')),
				'« Retirer un membre » réservé': gestesResponsable.some((geste) =>
					geste.includes('Retirer un membre')
				),
				'« Inviter une personne » réservé': gestesResponsable.some((geste) =>
					geste.includes('Inviter une personne')
				)
			},
			`${gestesEditeur.length} gestes d’éditeur, ${gestesResponsable.length} réservés`
		);
		// Supprimer un cours est réservé au responsable, à qui seul l'écran Cours le propose (étape 19,
		// lot 2) : la liste de l'éditeur ne le promet pas, la liste réservée le dit.
		const surLesCours = gestesEditeur
			.map((geste) => geste.replace(/\s+/g, ' ').trim())
			.filter((geste) => /\bcours\b/.test(geste));
		const reserveSurLesCours = gestesResponsable
			.map((geste) => geste.replace(/\s+/g, ' ').trim())
			.filter((geste) => /\bcours\b/.test(geste));
		const gestesSurLesCours =
			[...surLesCours, ...reserveSurLesCours].map((geste) => `« ${geste} »`).join(', ') ||
			'aucun geste sur les cours';
		verifierChaque(
			'ce que peut faire un éditeur ne promet pas de supprimer un cours : « Créer un cours, le modifier et le publier »',
			{
				'« Créer un cours, le modifier et le publier »': surLesCours.includes(
					'Créer un cours, le modifier et le publier'
				),
				'l’éditeur ne supprime pas': !surLesCours.some((geste) => /supprimer/i.test(geste))
			},
			gestesSurLesCours
		);
		// Depuis l'étape 19, la responsable supprime un cours depuis l'écran Cours (D3).
		await retour('19-D3', async () => {
			verifier(
				'la liste réservée au responsable dit « Supprimer un cours »',
				reserveSurLesCours.includes('Supprimer un cours'),
				gestesSurLesCours
			);
		});
		const decrit = await page.locator('#role').getAttribute('aria-describedby');
		verifierChaque(
			'le choix du rôle renvoie à ces deux listes pour les lecteurs d’écran',
			{
				'aria-describedby vers les listes': (decrit ?? '').split(/\s+/).includes('roles-aide'),
				'les listes à l’écran': (await page.locator('#roles-aide').count()) === 1
			},
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
	verifierChaque(
		`elle attend dans « Invitations en attente », en ${roleAffiche}`,
		{
			'une invitation en attente': (await enAttente.count()) === 1,
			'avec son rôle':
				(await enAttente.count()) === 1 && (await texteDe(enAttente)).includes(roleAffiche)
		},
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
		verifierChaque(
			'une invitation envoyée depuis l’écran en allemand part en allemand, <html lang="de"> compris',
			{
				'l’objet en allemand': courriel?.subject === `Einladung zu ${VOISINE.nom} auf jadwal`,
				'<html lang="de">': langueDuCourriel(courriel) === 'de'
			},
			`reçus : ${sujetsRecus(INVITEE_EN_ALLEMAND) || 'rien'}`
		);
	});
	if ((await racineDit(page, 'lang')) !== 'fr') await choisirLaLangue(page, 'fr');
}

/**
 * Une invitation dans la langue choisie sous l'adresse, et non dans celle de l'écran (étape 19, C) :
 * depuis l'écran en français, le courriel part en italien. Le choix propose les cinq langues, celle
 * de l'écran d'abord choisie.
 */
async function inviterDansLaLangueChoisie(page) {
	await retour('19-C', async () => {
		await ouvrir(page, '/membres');
		const choix = await exiger(page.locator('#emailLanguage'), 'le choix « Langue du courriel »');
		const options = await choix.locator('option').evaluateAll((toutes) =>
			toutes.map((option) => ({
				valeur: /** @type {HTMLOptionElement} */ (option).value,
				choisie: /** @type {HTMLOptionElement} */ (option).selected
			}))
		);
		await page.locator('#email').fill(INVITEE_EN_ITALIEN);
		await page.locator('#role').selectOption('editor');
		await choix.selectOption('it');
		await envoyer(page, page.locator('form[action="?/inviter"] button[type="submit"]'));
		const statut = await texteDe(page.getByRole('status').last());
		const courriel = await attendreCourriel(INVITEE_EN_ITALIEN, /./);
		verifierChaque(
			'depuis l’écran en français, l’invitation part dans la langue choisie sous l’adresse, « Italiano », objet et <html lang="it"> compris',
			{
				'le choix des cinq langues, celle de l’écran choisie':
					options.map((option) => option.valeur).join('|') === LANGUES.join('|') &&
					options.find((option) => option.choisie)?.valeur === 'fr',
				'« L’invitation a été envoyée à cette adresse. »':
					statut === 'L’invitation a été envoyée à cette adresse.',
				'l’objet en italien': courriel?.subject === `Invito a unirti a ${VOISINE.nom} su jadwal`,
				'<html lang="it">': langueDuCourriel(courriel) === 'it'
			},
			`« ${statut} » ; reçus : ${sujetsRecus(INVITEE_EN_ITALIEN) || 'rien'}`
		);
	});
}

/**
 * L'écran du super-admin, ce que l'étape 19 y a changé, avant de créer quoi que ce soit. L'exemple
 * sous le nom et sous l'adresse (B12), dans les cinq langues. L'adresse proposée pendant la
 * frappe (D6) : un signe hors de l'alphabet latin, « № », devient les lettres qu'il porte, une
 * marque disparaît, et un nom sans lettre latine ne propose rien, avec une phrase qui dit d'écrire
 * l'adresse. Rien n'est envoyé ; l'écran revient au français.
 */
async function superAdminEtape19(page) {
	await retour('19-B12', async () => {
		const lus = {};
		for (const langue of LANGUES) {
			await ouvrir(page, '/super-admin');
			if ((await racineDit(page, 'lang')) !== langue) await choisirLaLangue(page, langue);
			lus[langue] = {
				nom: await texteDe(await exiger(page.locator('#name-aide'), 'l’aide du nom')),
				adresse: await texteDe(await exiger(page.locator('#slug-regle'), 'la règle de l’adresse'))
			};
		}
		verifierChaque(
			`dans les cinq langues, sous le nom et sous l’adresse d’une organisation, l’exemple est « ${EXEMPLE_DU_SUPER_ADMIN.nom} » et « ${EXEMPLE_DU_SUPER_ADMIN.adresse} », en arabe « ${EXEMPLE_DU_SUPER_ADMIN.nomArabe} », et la règle de l’adresse demande une lettre`,
			Object.fromEntries(
				LANGUES.flatMap((langue) => {
					const { exemple, regle } = SOUS_LES_CHAMPS_DU_SUPER_ADMIN[langue];
					const nom =
						langue === 'ar' ? EXEMPLE_DU_SUPER_ADMIN.nomArabe : EXEMPLE_DU_SUPER_ADMIN.nom;
					return [
						[`« ${nom} » sous le nom, ${langue}`, lus[langue].nom.endsWith(`${exemple} ${nom}`)],
						[`la règle de l’adresse, ${langue}`, lus[langue].adresse.startsWith(regle)],
						[
							`« ${EXEMPLE_DU_SUPER_ADMIN.adresse} » sous l’adresse, ${langue}`,
							lus[langue].adresse.endsWith(`${exemple} ${EXEMPLE_DU_SUPER_ADMIN.adresse}`)
						]
					];
				})
			),
			LANGUES.map(
				(langue) => `${langue} : « ${lus[langue].nom} » ; « ${lus[langue].adresse} »`
			).join(' | ')
		);
	});
	if ((await racineDit(page, 'lang')) !== 'fr') await choisirLaLangue(page, 'fr');

	await retour('19-D6', async () => {
		await ouvrir(page, '/super-admin');
		const nom = page.locator('#name');
		const adresse = page.locator('#slug');
		const proposee = async (texte) => {
			await nom.fill(texte);
			return adresse.inputValue();
		};
		const club = await proposee('Club № 5');
		const marque = await proposee('Horizon™');
		const arabe = await proposee(EXEMPLE_DU_SUPER_ADMIN.nomArabe);
		const aTaper = page.locator('#slug-a-taper');
		const phrase = (await aTaper.count()) === 1 ? await texteDe(aTaper) : 'aucune phrase';
		verifierChaque(
			'avec JavaScript, l’adresse proposée pendant la frappe : « Club № 5 » donne « club-no-5 », « Horizon™ » donne « horizon », et un nom sans lettre latine ne propose rien et dit d’écrire l’adresse',
			{
				'« club-no-5 »': club === 'club-no-5',
				'« horizon »': marque === 'horizon',
				'rien de proposé pour un nom arabe': arabe === '',
				'la phrase qui dit d’écrire l’adresse':
					phrase ===
					'Ce nom n’a aucune lettre latine : aucune adresse ne peut en être tirée. Écrivez-la vous-même.'
			},
			`« ${club} », « ${marque} », « ${arabe} » ; « ${phrase} »`
		);
	});
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
	verifierChaque(
		'elle voit le texte entier et le bouton « J’accepte les conditions d’utilisation »',
		{
			'le titre « Conditions d’utilisation »': (await titre(page)) === 'Conditions d’utilisation',
			'la phrase qui nomme l’organisation': raison.includes(organisation.nom),
			[`les ${DONNEES_PERSONNELLES} données personnelles`]:
				(await page.locator('main ol > li').count()) === DONNEES_PERSONNELLES,
			'le bouton': (await bouton.count()) === 1
		},
		raison
	);
	// « l’espace d’Association voisine », et non « de Association » : l'élision devant une voyelle
	// (étape 19, D8), dans la phrase du haut comme dans celle sous le bouton.
	if (organisation.espaceDe.includes('d’')) {
		await retour('19-D8', async () => {
			const sousLeBouton = await texteDe(
				page.locator('main p').filter({ hasText: /^Tant que vous ne les avez pas acceptées/ })
			);
			verifierChaque(
				`l’écran d’acceptation écrit « ${organisation.espaceDe} », en haut et sous le bouton`,
				{
					'en haut': raison.includes(`${organisation.espaceDe},`),
					'sous le bouton':
						sousLeBouton ===
						`Tant que vous ne les avez pas acceptées, ${organisation.espaceDe} reste fermé.`
				},
				`« ${raison.slice(0, 80)} » ; « ${sousLeBouton} »`
			);
		});
	}
	await retour('A3', async () => {
		const version = await texteDe(page.locator('main p').filter({ hasText: /^Version du/ }));
		const date = await texteDe(page.locator('main p').filter({ hasText: /^Dernière mise à jour/ }));
		verifierChaque(
			`la version et la date du texte s’écrivent en JJ.MM.AAAA, « Version du ${DATE_DES_CONDITIONS} »`,
			{
				'« Version du … »': version === `Version du ${DATE_DES_CONDITIONS}`,
				'« Dernière mise à jour : … »': date === `Dernière mise à jour : ${DATE_DES_CONDITIONS}.`
			},
			`« ${version} », « ${date} »`
		);
	});
	verifierChaque('la navigation de l’espace est absente, « Se déconnecter » reste', {
		'pas de navigation de l’espace': (await navigationDeLEspace(page).count()) === 0,
		'« Se déconnecter »': (await page.getByRole('button', { name: 'Se déconnecter' }).count()) === 1
	});
	const lien = page.getByRole('link', { name: AUTRE_ORGANISATION, exact: true });
	const verification = async () =>
		verifierChaque(
			`${pourquoi}, le lien « ${AUTRE_ORGANISATION} » est là, vers le choix`,
			{
				'le lien, s’il est attendu': (await lien.count()) === (lienAttendu ? 1 : 0),
				'vers le choix':
					!lienAttendu ||
					((await lien.count()) === 1 && (await cheminDuLien(lien)) === '/organisations')
			},
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
	verifierChaque(
		'le lien mène au choix d’organisation',
		{
			'l’adresse /organisations': chemin(page) === '/organisations',
			'le titre « Vos organisations »': (await titre(page)) === 'Vos organisations'
		},
		chemin(page)
	);
	const recue = page.locator('li').filter({ hasText: ORGANISATION.nom });
	const recueVoisine = page.locator('li').filter({ hasText: VOISINE.nom });
	verifierChaque(
		'les deux invitations reçues y sont, avec leur rôle',
		{
			'responsable ici': (await texteDe(recue)).includes('responsable'),
			'éditrice dans la voisine': (await texteDe(recueVoisine)).includes('éditeur')
		},
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
	verifierChaque(
		'après avoir accepté, elle arrive à l’accueil de son espace, et la navigation revient',
		{
			'l’accueil': chemin(page) === '/',
			'le titre « À venir »': (await titre(page)) === 'À venir',
			'la navigation revient': (await navigationDeLEspace(page).count()) === 1
		},
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
	// organisation sans invitation n'ait pas ce lien, mais « Vos organisations » vers le même écran
	// (étape 19), l'étape q le vérifie, une fois l'organisation voisine quittée, et
	// `apps/web/tests/acces.test.ts` aussi.
	verifierChaque(
		`avec une seule organisation et une invitation qui attend, elle trouve « ${CHANGER} » dans la navigation, vers le choix`,
		{
			'le lien': (await lienChanger(page).count()) === 1,
			'vers le choix':
				(await lienChanger(page).count()) === 1 &&
				(await cheminDuLien(lienChanger(page))) === '/organisations'
		}
	);
	await naviguer(page, '/organisations');
	const seconde = page.locator('li').filter({ hasText: VOISINE.nom });
	verifierChaque(
		`par ce lien, elle retrouve l’invitation de « ${VOISINE.nom} », à accepter`,
		{
			'en éditrice': (await texteDe(seconde)).includes('éditeur'),
			'le bouton « Accepter »':
				(await seconde.getByRole('button', { name: 'Accepter' }).count()) === 1
		},
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
	verifierChaque(
		`par ce lien, elle revient dans « ${ORGANISATION.nom} », qui ne redemande rien`,
		{
			'l’accueil': chemin(page) === '/',
			'le titre de l’organisation': (await page.title()) === `À venir | ${ORGANISATION.nom}`
		},
		`${chemin(page)} « ${await page.title()} »`
	);

	// Membre de deux organisations, elle trouve « Changer d’organisation » dans la navigation, en
	// responsable ici, puis en éditrice dans la voisine, où elle entre accepter les conditions.
	verifierChaque(
		`membre de deux organisations, elle trouve « ${CHANGER} » dans la navigation, vers le choix`,
		{
			'le lien': (await lienChanger(page).count()) === 1,
			'vers le choix':
				(await lienChanger(page).count()) === 1 &&
				(await cheminDuLien(lienChanger(page))) === '/organisations'
		}
	);
	await naviguer(page, '/organisations');
	await envoyer(page, page.getByRole('button', { name: VOISINE.nom, exact: true }));
	verifierChaque(
		`dans « ${VOISINE.nom} », ses conditions l’attendent encore`,
		{
			'l’écran d’acceptation': chemin(page) === '/conditions/accepter',
			'pas de navigation de l’espace': (await navigationDeLEspace(page).count()) === 0
		},
		chemin(page)
	);
	await envoyer(
		page,
		page.getByRole('button', { name: 'J’accepte les conditions d’utilisation', exact: true })
	);
	const liensDeLEditrice = await navigationDeLEspace(page).getByRole('link').allTextContents();
	verifierChaque(
		`éditrice dans « ${VOISINE.nom} », elle trouve « ${CHANGER} » dans la navigation, sans « Membres »`,
		{
			'l’accueil': chemin(page) === '/',
			'le titre de la voisine': (await page.title()) === `À venir | ${VOISINE.nom}`,
			'le lien': (await lienChanger(page).count()) === 1,
			'vers le choix':
				(await lienChanger(page).count()) === 1 &&
				(await cheminDuLien(lienChanger(page))) === '/organisations',
			'pas de « Membres »': !liensDeLEditrice.some((texte) => texte.trim() === 'Membres')
		},
		`« ${await page.title()} » : ${liensDeLEditrice.map((texte) => texte.trim()).join(', ')}`
	);
	await naviguer(page, '/organisations');
	await envoyer(page, page.getByRole('button', { name: ORGANISATION.nom, exact: true }));
	verifierChaque(
		`par ce lien, elle revient en responsable dans « ${ORGANISATION.nom} »`,
		{
			'l’accueil': chemin(page) === '/',
			'le titre de l’organisation': (await page.title()) === `À venir | ${ORGANISATION.nom}`,
			'« Membres » dans la navigation':
				(await navigationDeLEspace(page)
					.getByRole('link', { name: 'Membres', exact: true })
					.count()) === 1
		},
		`${chemin(page)} « ${await page.title()} »`
	);

	// Une personne déjà connectée qui suit l'adresse de son courriel d'invitation passe par
	// `/connexion`, qui la renvoie au choix d'organisation. De là, elle rentre dans « Centre du
	// Parcours ».
	const adresseDuCourriel = (invitations[1]?.text ?? '')
		.split(/\s+/)
		.find((mot) => mot.startsWith(`${ORIGINE}/connexion`));
	await ouvrir(page, adresseDuCourriel ?? '/connexion');
	verifierChaque(
		'une fois connectée, elle suit l’adresse de son second courriel d’invitation et arrive au choix d’organisation',
		{
			'l’adresse du courriel': Boolean(adresseDuCourriel),
			'le choix d’organisation': chemin(page) === '/organisations'
		},
		`${adresseDuCourriel ?? 'adresse absente du courriel'} : ${chemin(page)}`
	);
	await envoyer(page, page.getByRole('button', { name: ORGANISATION.nom, exact: true }));
	verifierChaque(
		`de là, elle rentre dans « ${ORGANISATION.nom} »`,
		{
			'l’accueil': chemin(page) === '/',
			'le titre de l’organisation': (await page.title()) === `À venir | ${ORGANISATION.nom}`
		},
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
		verifierChaque(
			'le formulaire d’un cours a une aide sous le titre, le premier jour et la publication',
			{
				'l’aide du titre, avec un exemple': aides.titre.includes('Exemple :'),
				'l’aide du premier jour': aides.premierJour.length > 0,
				'l’aide de la publication': aides.publication.length > 0
			},
			`titre « ${aides.titre} », premier jour « ${aides.premierJour} », publication « ${aides.publication} »`
		);
	});
	await retour('B4', async () => {
		const resume = page.locator('#course-summary');
		const ligne = (debut) => resume.locator('div').filter({ hasText: debut });
		verifierChaque(
			'en haut du formulaire, « Résumé : ce qui sera publié », et le premier jour signalé comme manquant',
			{
				'« Résumé : ce qui sera publié »':
					(await resume.getByRole('heading', { name: 'Résumé : ce qui sera publié' }).count()) ===
					1,
				'« Premier jour : pas choisi »':
					(await texteDe(ligne('Premier jour'))) === 'Premier jour : pas choisi'
			},
			(await resume.count()) === 1 ? await texteDe(ligne('Premier jour')) : 'aucun résumé'
		);
		await page.locator('#title-fr').fill(cours.titre);
		await page.locator('#startsOn').fill(T);
		verifierChaque(
			'le résumé suit la saisie : le titre, puis le premier jour écrit en JJ.MM.AAAA',
			{
				'le titre':
					(await texteDe(ligne('Titre en français'))) === `Titre en français : ${cours.titre}`,
				'le premier jour en JJ.MM.AAAA': (await texteDe(ligne('Premier jour'))).endsWith(
					dateSuisse(T)
				)
			},
			`${await texteDe(ligne('Titre en français'))} | ${await texteDe(ligne('Premier jour'))}`
		);
		// La description a sa ligne, juste sous le titre de sa langue, marquée facultative depuis
		// l'étape 19 (lot 2). Elle est retirée ensuite : le cours du parcours n'en a pas, et les écrans
		// lus dans les autres langues n'ont rien à écarter.
		await page.locator('#description-fr').fill(DESCRIPTION);
		const lignes = (await resume.locator('dl > div').allTextContents()).map((texte) =>
			texte.replace(/\s+/g, ' ').trim()
		);
		const titreLu = lignes.indexOf(`Titre en français : ${cours.titre}`);
		const apresLeTitre = titreLu >= 0 ? (lignes[titreLu + 1] ?? '') : '';
		verifier(
			'le résumé a une ligne pour la description, sous le titre de sa langue',
			apresLeTitre.startsWith(`Description en français : ${DESCRIPTION}`),
			apresLeTitre || lignes.slice(0, 3).join(' | ')
		);
		await retour('19-cours-facultatif', async () => {
			verifier(
				'la ligne de la description, remplie, finit par « (facultatif) »',
				apresLeTitre === `Description en français : ${DESCRIPTION} (facultatif)`,
				apresLeTitre || 'aucune ligne'
			);
		});
		await page.locator('#description-fr').fill('');
	});
}

/**
 * Une description écrite en allemand, le titre allemand laissé vide (B4) : le serveur refuse le
 * cours avec une phrase qui nomme la langue, et le formulaire revient avec la saisie, ouvert sur
 * l'onglet de l'allemand, où le champ à corriger est en vue. La description est ensuite effacée,
 * pour que le cours s'enregistre sans elle. Le champ vit derrière l'onglet de sa langue, qu'on ouvre
 * avant d'y écrire, quel que soit l'onglet que l'écran rouvre.
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
		// Un écran qui accepte le cours n'a plus de champ de description : on ne l'attend pas.
		const gardee =
			chemin(page) === '/cours/nouveau' && (await description.count()) === 1
				? await description.inputValue()
				: '';
		verifierChaque(
			'une description écrite en allemand sans titre en allemand est refusée, avec une phrase qui nomme la langue, et le formulaire revient avec la description',
			{
				'le formulaire revient': chemin(page) === '/cours/nouveau',
				'la phrase qui nomme la langue': refus.includes(DESCRIPTION_SANS_TITRE.refus),
				'la description gardée': gardee === DESCRIPTION_SANS_TITRE.texte
			},
			`${chemin(page)} ; ${refus.map((phrase) => `« ${phrase} »`).join(', ') || 'aucun refus'} ; description « ${gardee} »`
		);
		// Les onglets n'existent qu'une fois la page rouverte hydratée : on les attend, sans rien
		// cliquer, cinq secondes au plus.
		if (chemin(page) === '/cours/nouveau') {
			await page
				.getByRole('tab')
				.first()
				.waitFor({ timeout: 5000 })
				.catch(() => undefined);
		}
		const choisis = (
			await page.locator('[role="tab"][aria-selected="true"]').allTextContents()
		).map((onglet) => onglet.replace(/\s+/g, ' ').trim());
		const enVue = (await description.count()) === 1 && (await description.isVisible());
		verifierChaque(
			'avec JavaScript, après ce refus, l’écran revient sur l’onglet de la langue en cause, « allemand », où la description est en vue',
			{
				'l’onglet « allemand » choisi, seul': choisis.length === 1 && choisis[0] === 'allemand',
				'la description en vue': enVue
			},
			`onglet choisi : ${choisis.map((onglet) => `« ${onglet} »`).join(', ') || 'aucun'} ; description ${enVue ? 'en vue' : 'cachée ou absente'}`
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
	verifierChaque(
		`« ${cours.titre} » est créé, ${cours.etat}, le ${JOURS[cours.jour - 1]}`,
		{
			'retour à /cours': chemin(page) === '/cours',
			'son état': (await texteDe(ligne)).includes(cours.etat)
		},
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
		verifierChaque(
			'« Annuler ou déplacer » n’ouvre que les options de sa carte',
			{
				'le bouton de sa carte': (await boutonsDAnnulationVisibles(premiere).count()) === 1,
				'aucun sur l’autre carte': (await boutonsDAnnulationVisibles(seconde).count()) === 0,
				'un seul en tout': (await boutonsDAnnulationVisibles(page).count()) === 1
			},
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
 * Déplacer une séance (A2) : le champ accepte toute date à partir d'aujourd'hui, jusqu'au
 * 31.12.2100, la dernière que l'action accepte (étape 19), refuse une date passée, et la séance du
 * J3 part la veille, plus tôt que prévu. L'aide de la date le dit (B1).
 */
async function deplacerPlusTot(page) {
	const depart = seanceDuJour(page, J3, COURS_2);
	await retour('A2', async () => {
		await depart.getByText('Annuler ou déplacer', { exact: true }).click();
		const date = depart.getByLabel('Nouvelle date', { exact: true });
		const bornes = `min="${await date.getAttribute('min')}" max="${await date.getAttribute('max')}"`;
		verifierChaque(
			`le champ « Nouvelle date » accepte toute date à partir d’aujourd’hui (${dateSuisse(T)})`,
			{
				'un champ de date': (await date.getAttribute('type')) === 'date',
				'à partir d’aujourd’hui': (await date.getAttribute('min')) === T
			},
			bornes
		);
		// La dernière date que l'action accepte, le calendrier du navigateur s'y arrête (étape 19).
		await retour('19-D4', async () => {
			verifier(
				'le calendrier de « Nouvelle date » s’arrête au 31.12.2100, la dernière date que l’action accepte',
				(await date.getAttribute('max')) === '2100-12-31',
				bornes
			);
		});
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
		verifierChaque(
			'« Déplacer la séance » sans rien changer, ni la date ni l’heure, est refusé avec une phrase, dans la carte, et rien n’est déplacé',
			{
				'une seule carte': (await inchangee.count()) === 1,
				'une phrase': /\p{L}{2,}.*\.$/u.test(phrase),
				'pas celle d’une date passée': !phrase.startsWith('Cette date est déjà passée.'),
				'rien de déplacé':
					(await inchangee.count()) === 1 && !(await texteDe(inchangee)).includes('déplacée')
			},
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
		verifierChaque(
			'une date passée est refusée, dans la carte de la séance',
			{
				'un refus dans la carte': (await refus.count()) === 1,
				'« Cette date est déjà passée. »':
					(await refus.count()) === 1 &&
					(await texteDe(refus)).startsWith('Cette date est déjà passée.')
			},
			(await refus.count()) === 1 ? await texteDe(refus) : 'aucun refus'
		);
		const rouverte = seanceDuJour(page, J3, COURS_2);
		await rouverte.getByLabel('Nouvelle date', { exact: true }).fill(J2);
		await rouverte.getByLabel('Heure de début', { exact: true }).fill('20:30');
		await envoyer(page, rouverte.getByRole('button', { name: 'Déplacer la séance', exact: true }));
		const parti = seanceDuJour(page, J3, COURS_2);
		verifierChaque(
			`la séance du ${dateSuisse(J3)} part au ${dateSuisse(J2)}, plus tôt que prévu, et se dit déplacée`,
			{
				'« déplacée »': (await texteDe(parti)).includes('déplacée'),
				'« Déplacée au … à 20:30 »': (await texteDe(parti)).includes(
					`Déplacée au ${dateLongue(J2)} à 20:30`
				)
			},
			await texteDe(parti)
		);
		const arrivee = seanceDuJour(page, J2, COURS_2);
		verifierChaque(
			`elle apparaît le ${dateSuisse(J2)}, en date exceptionnelle, prévue à l’origine le ${dateSuisse(J3)}`,
			{
				'« date exceptionnelle »': (await texteDe(arrivee)).includes('date exceptionnelle'),
				'« Prévue à l’origine le … »': (await texteDe(arrivee)).includes(
					`Prévue à l’origine le ${dateLongue(J3)}`
				)
			},
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
	verifierChaque('les heures de prière sont activées, et la navigation mène à leurs deux écrans', {
		'le lien vers /prieres':
			(await navigationDeLEspace(page).locator('a[href="/prieres"]').count()) === 1,
		'le lien vers /vendredi':
			(await navigationDeLEspace(page).locator('a[href="/vendredi"]').count()) === 1
	});
	await retour('B1', async () => {
		const libelles = {
			prieres: await texteDe(navigationDeLEspace(page).locator('a[href="/prieres"]')),
			vendredi: await texteDe(navigationDeLEspace(page).locator('a[href="/vendredi"]'))
		};
		verifierChaque(
			'la navigation nomme ces écrans par leur titre, « Heures de prière » et « Prière du vendredi »',
			{
				'« Heures de prière »': libelles.prieres === 'Heures de prière',
				'« Prière du vendredi »': libelles.vendredi === 'Prière du vendredi'
			},
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
	verifierChaque(
		`les séances du ${dateSuisse(J1)} et du ${dateSuisse(J3)} sont à l’accueil de l’espace`,
		{
			[`celle du ${dateSuisse(J1)}`]: (await premiere.count()) === 1,
			[`celle du ${dateSuisse(J3)}`]: (await seconde.count()) === 1
		}
	);
	// Le second cours est encore en brouillon : sa carte le dit, et le programme de la semaine, prêt
	// à coller, ne l'annonce pas (étape 19, D4).
	await retour('19-D4', async () => {
		const marque = seconde.locator('.titre .marque');
		const marques = (await marque.allTextContents()).map((texte) => texte.trim());
		const semaine = await messagesDeLAccueil(page, 'semaine');
		const annonce = semaine.filter((message) => message.texte.includes(COURS_2));
		verifierChaque(
			`sur « À venir », la carte de « ${COURS_2} », en brouillon, porte « brouillon », et le programme de la semaine ne l’annonce dans aucune langue`,
			{
				'la marque « brouillon »': marques.includes('brouillon'),
				'un programme de la semaine par langue publiée': semaine.length === LANGUES.length,
				'le brouillon absent du programme': annonce.length === 0
			},
			`marques : ${marques.join(', ') || 'aucune'} ; ${annonce.map((message) => message.lang).join(', ') || 'aucun'} programme(s) qui l’annoncent`
		);
	});
	await optionsDesSeances(page, premiere, seconde);
	const ouverte = premiere.locator('details[open]');
	if ((await ouverte.count()) === 0 && (await boutonsDAnnulationVisibles(premiere).count()) === 0) {
		await premiere.getByText('Annuler ou déplacer', { exact: true }).click();
	}
	await envoyer(page, boutonsDAnnulationVisibles(premiere));
	verifierChaque(
		`la séance du ${dateSuisse(J1)} est annulée, et peut être rétablie`,
		{
			'« annulée »': (await texteDe(premiere)).includes('annulée'),
			'le bouton « Rétablir »':
				(await premiere.getByRole('button', { name: 'Rétablir' }).count()) === 1
		},
		await texteDe(premiere.locator('.titre'))
	);
	await deplacerPlusTot(page);
	// La carte d'arrivée, « date exceptionnelle », défait le déplacement elle aussi (étape 19, D4). Le
	// bouton n'est pas touché : la séance déplacée sert à la suite du parcours.
	await retour('19-D4', async () => {
		const arrivee = seanceDuJour(page, J2, COURS_2);
		const bouton = arrivee.locator('form[action="?/retablir"] button[type="submit"]');
		const aide = arrivee.locator('form[action="?/retablir"] .aide');
		verifierChaque(
			`la carte d’arrivée du ${dateSuisse(J2)}, « date exceptionnelle », a son bouton « Rétablir la séance », avec l’aide qui dit ce qu’il défait`,
			{
				'le bouton « Rétablir la séance »':
					(await bouton.count()) === 1 && (await texteDe(bouton)) === 'Rétablir la séance',
				'l’aide « Cela défait le changement »':
					(await aide.count()) === 1 &&
					(await texteDe(aide)).startsWith('Cela défait le changement')
			},
			await texteDe(arrivee)
		);
	});
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
	verifierChaque('l’écran Partager donne le code du widget', {
		'le script du widget': etat.codeEmbarque.includes(`${ORIGINE}/widget/jadwal-widget.js`),
		'l’élément <jadwal-widget>': etat.codeEmbarque.includes(
			`<jadwal-widget org="${ORGANISATION.slug}">`
		)
	});
	etat.codeCadre = codes.find((code) => code.includes('<iframe')) ?? '';
	verifier(
		'l’écran Partager donne le cadre à coller à la main, sans embed=1',
		etat.codeCadre.includes(`<iframe src="${ORIGINE}/m/${ORGANISATION.slug}"`),
		etat.codeCadre.split('\n')[0]
	);
	await retour('B1', async () => {
		const texte = await texteDe(page.locator('main'));
		verifierChaque(
			'l’écran Partager dit où coller le code, avec un exemple, et nomme le cadre sans jargon',
			{
				'l’exemple « sur WordPress »': texte.includes('Exemple : sur WordPress'),
				'« Code du cadre à coller »':
					(await page.getByLabel('Code du cadre à coller', { exact: true }).count()) === 1
			},
			texte.slice(0, 120)
		);
	});
	await arabeDeLEspace(page);
	await formulaireDUnCours(page);
}

/**
 * Le formulaire d'un cours avec JavaScript, ce que l'étape 19 y a changé : chaque ligne facultative
 * du résumé le dit ; une description sans le titre de sa langue se signale ; la langue de saisie
 * coche la langue d'enseignement ; le premier jour d'un cours à dates précises suit la première
 * date. Puis un cours à dates précises, tapées dans le désordre, est publié : l'écran donne le
 * message « nouveau cours ». La base lui donne ensuite un dernier jour avant sa dernière date, comme
 * un cours enregistré avant la règle de l'étape 18 : la liste le signale. Enfin, la responsable le
 * supprime, ce que seule une personne responsable peut faire (D3). Il ne reste rien du cours.
 */
async function formulaireDUnCours(page) {
	etape('c, le formulaire d’un cours (étape 19)');
	const nouveau = async () => {
		await ouvrir(page, '/cours/nouveau');
		// Les onglets des langues n'existent qu'une fois la page hydratée. Cinq secondes au plus.
		await page
			.getByRole('tab')
			.first()
			.waitFor({ timeout: 5000 })
			.catch(() => undefined);
	};
	/** Les lignes du résumé : leur texte, et si elles sont marquées comme un manque. */
	const resume = () =>
		page.locator('#course-summary dl > div').evaluateAll((lignes) =>
			lignes.map((ligne) => ({
				texte: (ligne.textContent ?? '').replace(/\s+/g, ' ').trim(),
				manque: ligne.classList.contains('manque')
			}))
		);
	const ligne = (lignes, debut) =>
		lignes.find((lue) => lue.texte.startsWith(debut)) ?? { texte: '', manque: false };
	const onglet = (nom) => page.getByRole('tab', { name: new RegExp(`^${nom}`) });

	await nouveau();
	await retour('19-cours-facultatif', async () => {
		const lignes = await resume();
		const attendues = [
			'Salle : pas choisie (facultatif)',
			'Intervenant : aucun pour l’instant (facultatif)',
			'Titre en allemand : pas encore écrit, le titre en français s’affichera à sa place (facultatif)'
		];
		verifierChaque(
			'le résumé d’un nouveau cours marque « (facultatif) » chaque ligne facultative, sans la signaler comme un manque',
			Object.fromEntries(
				attendues.map((attendue) => [
					`« ${attendue} »`,
					lignes.some((lue) => lue.texte === attendue && !lue.manque)
				])
			),
			attendues
				.map((attendue) => ligne(lignes, attendue.split(' : ')[0] ?? attendue).texte || 'absente')
				.join(' | ')
		);
	});
	await retour('19-cours-titre-manquant', async () => {
		await (await exiger(onglet('allemand'), 'l’onglet « allemand »')).click();
		await page.locator('#description-de').fill(DESCRIPTION_SANS_TITRE.texte);
		const avecDescription = await resume();
		await page.locator('#title-de').fill('Kommentierte Lesung');
		const avecTitre = await resume();
		const titre = ligne(avecDescription, 'Titre en allemand');
		const description = ligne(avecDescription, 'Description en allemand');
		verifierChaque(
			'une description allemande sans titre allemand : le résumé signale le titre qui manque, et la description à corriger ; écrire le titre retire la marque',
			{
				'« Titre en allemand : pas encore écrit (facultatif) », marqué':
					titre.texte === 'Titre en allemand : pas encore écrit (facultatif)' && titre.manque,
				'la description à corriger':
					description.texte ===
					'Description en allemand : à corriger, il manque le titre en allemand (facultatif)',
				'le titre écrit, plus de marque': !ligne(avecTitre, 'Titre en allemand').manque
			},
			`« ${titre.texte} »${titre.manque ? ', marqué' : ''} ; « ${description.texte} »`
		);
	});
	await nouveau();
	await retour('19-cours-langue-de-saisie', async () => {
		await page.locator('#sourceLanguage').selectOption('ar');
		const cochees = await page
			.locator('input[name="teachingLanguages"]:checked')
			.evaluateAll((cases) => cases.map((une) => /** @type {HTMLInputElement} */ (une).value));
		const enseignement = ligne(await resume(), 'Langue d’enseignement').texte;
		verifierChaque(
			'sur un nouveau cours, choisir l’arabe comme langue de saisie coche l’arabe comme langue d’enseignement, à la place du français',
			{
				'l’arabe seul coché': cochees.join('|') === 'ar',
				'« Langue d’enseignement : arabe »': enseignement === 'Langue d’enseignement : arabe'
			},
			`cochées : ${cochees.join(', ') || 'aucune'} ; « ${enseignement} »`
		);
	});

	await nouveau();
	const dates = [plusJours(T, 67), plusJours(T, 60)];
	const plusTot = plusJours(T, 53);
	await page.locator('#title-fr').fill(ANNONCE_EN_DESORDRE);
	await page.locator('#recurrenceKind').selectOption('dates');
	await retour('19-cours-premier-jour', async () => {
		const champ = await exiger(page.locator('#dates'), 'le champ « Dates, une par ligne »');
		await champ.fill(dates.map(dateSuisse).join('\n'));
		const suivi = await page.locator('#startsOn').inputValue();
		const resumeSuivi = ligne(await resume(), 'Premier jour').texte;
		await champ.fill([...dates, plusTot].map(dateSuisse).join('\n'));
		const plusTotSuivi = await page.locator('#startsOn').inputValue();
		verifierChaque(
			`un cours à dates précises : « Premier jour du cours » prend la première date, ${dateSuisse(dates[1] ?? '')}, puis suit une date plus tôt, ${dateSuisse(plusTot)}`,
			{
				'la première date': suivi === dates[1],
				'le résumé la dit': resumeSuivi === `Premier jour : ${dateLongue(dates[1] ?? '')}`,
				'une date plus tôt': plusTotSuivi === plusTot
			},
			`« ${suivi} », « ${resumeSuivi} », puis « ${plusTotSuivi} »`
		);
	});
	let id = '';
	await retour('19-cours-message', async () => {
		await page.locator('#start').fill('19:00');
		await page.locator('#end').fill('20:00');
		await page.locator('#status').selectOption('published');
		// Un premier jour resté vide et exigé, le navigateur n'enverrait rien : c'est l'ancien
		// comportement, un geste impossible ici, dit tel quel plutôt qu'attendu quinze secondes.
		const premierJour = page.locator('#startsOn');
		if (
			!(await premierJour.evaluate((champ) =>
				/** @type {HTMLInputElement} */ (champ).checkValidity()
			))
		) {
			throw new Error(
				'le navigateur n’envoie pas le cours : « Premier jour du cours » est vide et exigé'
			);
		}
		await envoyer(page, page.locator('form.colonne button[type="submit"]'));
		const adresse = new URL(page.url());
		id = adresse.pathname === '/cours' ? (adresse.searchParams.get('publie') ?? '') : '';
		const bloc = page.locator('section.message');
		const titreDuBloc =
			(await bloc.count()) === 1 ? await texteDe(bloc.locator('#message-titre')) : '';
		const ouverts = await bloc.locator('details[open]').count();
		const francais =
			(await bloc.locator('#message-fr').count()) === 1
				? await bloc.locator('#message-fr').inputValue()
				: '';
		const ordre = [plusTot, ...[...dates].reverse()].map(dateSuisse);
		verifierChaque(
			`un cours publié : l’écran revient sur /cours?publie=<id>, « Le cours est publié. », et le message « Nouveau cours : « ${ANNONCE_EN_DESORDRE} » » prêt à coller, ses dates dans l’ordre`,
			{
				'l’adresse /cours?publie=<id>': id !== '',
				'« Le cours est publié. »': titreDuBloc === 'Le cours est publié.',
				'le français d’abord, seul ouvert':
					ouverts === 1 && (await bloc.locator('details[open] #message-fr').count()) === 1,
				'« Nouveau cours : … »': francais.includes(
					`Nouveau cours : « ${ANNONCE_EN_DESORDRE} », à des dates précises :`
				),
				'les dates dans l’ordre':
					ordre.every((date) => francais.includes(date)) &&
					francais.indexOf(ordre[0] ?? '') < francais.indexOf(ordre[2] ?? '')
			},
			`${adresse.pathname}${adresse.search} ; « ${titreDuBloc} » ; ${francais.split('\n').find((une) => une.startsWith('Nouveau cours')) ?? 'aucun message'}`
		);
	});
	await retour('19-cours-hors-periode', async () => {
		if (!id) throw new Error('le cours à dates précises n’a pas été créé');
		// L'identifiant vient de l'adresse que le serveur rend : il n'entre dans la requête qu'avec la
		// forme d'un identifiant.
		if (!UUID.test(id)) {
			throw new Error(`l’adresse du cours publié ne porte pas un identifiant : « ${id} »`);
		}
		// Un dernier jour avant sa dernière date : le formulaire le refuse depuis l'étape 18, seul un
		// cours enregistré avant peut l'avoir.
		const periode = ecrireDansLaBase(
			`update course set ends_on = '${dates[1]}' where id = '${id}'`
		);
		await ouvrir(page, '/cours');
		const bloc = page.locator('li').filter({ hasText: ANNONCE_EN_DESORDRE });
		const aCorriger = page.locator('p.a-corriger');
		verifierChaque(
			'un cours à dates précises dont une date tombe après son dernier jour : son bloc, et lui seul, dit « À corriger : … »',
			{
				'la base garde le dernier jour': periode.ok,
				'la phrase dans son bloc':
					(await bloc.locator('p.a-corriger').count()) === 1 &&
					(await texteDe(bloc.locator('p.a-corriger'))) ===
						'À corriger : des dates de ce cours tombent hors de sa période et ne sont pas publiées. Ouvrez « Modifier ce cours » pour voir lesquelles.',
				'dans aucun autre bloc': (await aCorriger.count()) === 1
			},
			`${periode.sortie} ; ${await aCorriger.count()} bloc(s) à corriger`
		);
	});
	await retour('19-D3', async () => {
		await ouvrir(page, '/cours');
		const bloc = page.locator('li').filter({ hasText: ANNONCE_EN_DESORDRE });
		const repli = bloc.locator('details').filter({
			has: page.locator('summary', { hasText: 'Supprimer ce cours' })
		});
		await exiger(repli, 'le repli « Supprimer ce cours »');
		const fermeAuChargement = !(await repli.evaluate(
			(details) => /** @type {HTMLDetailsElement} */ (details).open
		));
		await repli.locator(':scope > summary').click();
		const avertissement = await texteDe(repli.locator('form p'));
		await envoyer(page, repli.getByRole('button', { name: 'Oui, supprimer', exact: true }));
		const statut = (await page.getByRole('status').allTextContents()).map((texte) => texte.trim());
		verifierChaque(
			'sur /cours, la responsable supprime un cours : « Supprimer ce cours », fermé au chargement, dit ce que la suppression emporte, et « Oui, supprimer » le retire',
			{
				'fermé au chargement': fermeAuChargement,
				'ce que la suppression emporte': avertissement.startsWith(
					'Le cours disparaîtra de cet écran, de votre page publique et des agendas abonnés'
				),
				'« Le cours est supprimé. »': statut.includes('Le cours est supprimé.'),
				'le cours a quitté la liste':
					(await page.locator('li').filter({ hasText: ANNONCE_EN_DESORDRE }).count()) === 0
			},
			`« ${avertissement.slice(0, 60)}… » ; ${statut.map((texte) => `« ${texte} »`).join(', ') || 'aucun message'}`
		);
	});
}

/**
 * L'espace en arabe, les phrases que le chef de projet a relues (étape 19, B1, B2, B8, B9, B10), sur
 * « À venir », Partager et Membres. L'alerte d'un programme qui ne s'affiche plus sur le site (B10)
 * demande des vues du widget avant les sept derniers jours, et aucune depuis : le parcours en écrit
 * une dans la base, dix jours plus tôt, seul moyen de dater une vue, avant que le widget ne soit vu
 * à l'étape e. Le rôle inconnu (B8) ne part que d'un formulaire écrit à la main : le parcours ajoute
 * au choix du rôle une valeur que l'écran ne propose pas, comme il ôte ailleurs la validation du
 * navigateur à un formulaire. L'écran revient au français.
 */
async function arabeDeLEspace(page) {
	etape('c, en arabe : les phrases relues par le chef de projet (étape 19)');
	const vue = ecrireDansLaBase(
		`insert into page_view (organization_id, day, kind, count) select id, '${plusJours(T, -10)}', 'embed', 3 from organization where slug = '${ORGANISATION.slug}'`
	);
	verifier(
		`la base garde trois vues du widget il y a dix jours, le ${dateSuisse(plusJours(T, -10))}`,
		vue.ok,
		vue.sortie
	);
	await ouvrir(page, '/');
	await choisirLaLangue(page, 'ar');
	try {
		await retour('19-B2', async () => {
			const note = await texteDe(
				await exiger(page.locator('section.audience p.aide'), 'la note de l’audience')
			);
			verifier(
				'« À venir » en arabe : la note de l’audience dit « فالتقويم يُحدَّث من تلقاء نفسه »',
				note.includes('فالتقويم يُحدَّث من تلقاء نفسه'),
				note
			);
		});
		await retour('19-B10', async () => {
			const alerte = page.locator('p.mention').filter({ has: page.locator('a[href="/partager"]') });
			const lue = (await alerte.count()) === 1 ? await texteDe(alerte) : '';
			const lien = (await alerte.count()) === 1 ? await texteDe(alerte.locator('a')) : '';
			verifierChaque(
				'« À venir » en arabe, le programme qui ne s’affiche plus sur le site : l’alerte parle de « الشيفرة », et son lien dit « عرض الشيفرة المراد لصقها مرة أخرى »',
				{
					'l’alerte, vues du widget avant la semaine et aucune depuis': lue !== '',
					'« الشيفرة » dans l’alerte': lue.includes('لصقت فيها الشيفرة'),
					'le lien': lien === 'عرض الشيفرة المراد لصقها مرة أخرى'
				},
				lue || 'aucune alerte'
			);
		});
		await retour('19-B9', async () => {
			const aVenir = await texteDe(page.locator('section[aria-labelledby="semaine-titre"] p.aide'));
			await ouvrir(page, '/partager');
			const partager = await texteDe(
				page.locator('section[aria-labelledby="semaine-titre"] p.details')
			);
			verifierChaque(
				'en arabe, le programme de la semaine se copie puis se colle : « لتنسخه وتلصقه في WhatsApp » sur « À venir », « انسخ هذه الرسالة والصقها في مجموعة WhatsApp الخاصة بك » dans Partager',
				{
					'sur « À venir »': aVenir.includes('لتنسخه وتلصقه في WhatsApp'),
					'dans Partager': partager.includes(
						'انسخ هذه الرسالة والصقها في مجموعة WhatsApp الخاصة بك'
					)
				},
				`« ${aVenir} » ; « ${partager} »`
			);
		});
		await retour('19-B1', async () => {
			await ouvrir(page, '/partager');
			const ouCollerLeCode = await texteDe(
				await exiger(
					page.locator('label[for="code-verrouille"]').locator('xpath=preceding-sibling::p[1]'),
					'la phrase du code pour un site très strict'
				)
			);
			verifier(
				'Partager en arabe : le code pour un site très strict « وهي لا تُحدَّث تلقائيًا »',
				ouCollerLeCode.includes('وهي لا تُحدَّث تلقائيًا'),
				ouCollerLeCode
			);
		});
		await retour('19-B8', async () => {
			await ouvrir(page, '/membres');
			// Une valeur que le choix du rôle ne propose pas, comme un formulaire écrit à la main.
			await page.locator('#role').evaluate((choix) => {
				const inconnu = document.createElement('option');
				inconnu.value = 'owner';
				inconnu.textContent = 'owner';
				choix.append(inconnu);
				/** @type {HTMLSelectElement} */ (choix).value = 'owner';
			});
			await page.locator('#email').fill('role.inconnu@example.test');
			await envoyer(page, page.locator('form[action="?/inviter"] button[type="submit"]'));
			const refus = (await page.getByRole('alert').allTextContents()).map((texte) =>
				texte.replace(/\s+/g, ' ').trim()
			);
			verifier(
				'Membres en arabe, un rôle inconnu envoyé par un formulaire écrit à la main : « هذا الدور غير موجود. اختر دور المحرر أو دور المسؤول. »',
				refus.includes('هذا الدور غير موجود. اختر دور المحرر أو دور المسؤول.'),
				refus.map((phrase) => `« ${phrase} »`).join(', ') || 'aucun refus'
			);
		});
	} finally {
		await ouvrir(page, '/');
		if ((await racineDit(page, 'lang')) !== 'fr') await choisirLaLangue(page, 'fr');
	}
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
	verifierChaque(
		`${adresse} : <html lang="${langue}" dir="${dirAttendu}">`,
		{
			lang: lang === langue,
			dir: dir === dirAttendu
		},
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
			verifierChaque(
				`${adresse} s’affiche, lang="${langue}" dir="${dirAttendu}"`,
				{
					200: reponse?.status() === 200,
					lang: lang === langue,
					dir: dir === dirAttendu
				},
				`rendu ${reponse?.status()}, lang="${lang}" dir="${dir}"`
			);
			await verifierLaBaliseHtml(page, adresse, langue);
			const titre1 = langue === 'ar' ? COURS_1.ar : COURS_1.fr;
			const premier = await seancesPubliques(page, titre1);
			const second = await seancesPubliques(page, COURS_2);
			verifierChaque(
				`${adresse} : les deux cours y sont`,
				{
					'le premier cours': premier.length > 0,
					'le second cours': second.length > 0
				},
				`${titre1}, ${COURS_2}`
			);
			verifierChaque(
				`${adresse} : la séance annulée reste visible, barrée, avec sa mention`,
				{
					'une seule séance': premier.length === 1,
					barrée: premier[0]?.barree === true,
					'avec sa mention': (premier[0]?.mention.length ?? 0) > 0
				},
				premier.map((vue) => vue.mention).join(' | ')
			);
			// Au départ, la mention dit où va la séance ; à l'arrivée, la marque dit « date
			// exceptionnelle » et le détail d'où elle vient. Chacune avec sa date entière, JJ.MM.AAAA.
			const depart = second.find((vue) => vue.barree);
			const arrivee = second.find((vue) => !vue.barree);
			await retour('A2', async () => {
				verifierChaque(
					`${adresse} : la séance ramenée plus tôt se voit au départ (${dateSuisse(J3)}) et à l’arrivée (${dateSuisse(J2)})`,
					{
						'au départ et à l’arrivée': second.length === 2,
						'le départ dit où elle va':
							Boolean(depart?.mention.startsWith(textes.depart)) &&
							(depart?.mention ?? '').includes(dateSuisse(J2)),
						'l’arrivée a sa marque': Boolean(arrivee?.mention),
						'l’arrivée dit d’où elle vient': (arrivee?.texte ?? '').includes(dateSuisse(J3))
					},
					`${depart?.mention ?? 'départ absent'} | ${arrivee?.mention ?? 'arrivée absente'} · ${arrivee?.texte ?? ''}`
				);
			});
			// En italien, « Inizialmente », sans article devant le jour (étape 19, D7).
			if (langue === 'it') {
				await retour('19-D7', async () => {
					const lue = arrivee?.texte ?? '';
					const attendue = `${textes.arrivee}${GIORNI[jourDeSemaine(J3) - 1]} ${dateSuisse(J3)}`;
					verifierChaque(
						`${adresse} : à l’arrivée, « ${textes.arrivee}<giorno> JJ.MM.AAAA », sans « In origine: » ni « il » devant le jour`,
						{
							[`« ${textes.arrivee}<giorno> JJ.MM.AAAA »`]: lue.includes(attendue),
							'sans « In origine: »': !lue.includes('In origine'),
							'sans « il » devant le jour': !lue.includes(` il ${GIORNI[jourDeSemaine(J3) - 1]}`)
						},
						lue || 'arrivée absente'
					);
				});
			}
			await retour('19-og-locale', () => localeDePartage(page, adresse, langue));
			// Un nouvel onglet ici aussi : la même adresse, sans `embed=1`, est celle du cadre que
			// l'écran Partager donne à coller à la main, et `/conditions` refuse d'être encadrée. Le
			// lien le dit aux lecteurs d'écran, dans la langue de la page, et à eux seuls.
			const nomAttendu = avecNouvelOnglet(textes.conditions, langue);
			const nomsSelonChrome = await nomsDesLiensSelonChrome(page);
			const conditions = await lienDesConditions(page, langue);
			verifierChaque(
				`${adresse} : le nom accessible du lien des conditions est « ${nomAttendu} », selon playwright et selon Chrome, et l’annonce est cachée aux yeux`,
				{
					'un lien de ce nom': conditions.nombre === 1,
					'le même nom selon Chrome': nomsSelonChrome.includes(nomAttendu),
					'l’annonce cachée aux yeux': conditions.annonce.cachee
				},
				`Chrome : ${
					nomsSelonChrome.filter((nom) => nom.startsWith(textes.conditions)).join(' | ') ||
					'aucun lien de ce nom'
				} ; playwright : ${conditions.nombre} lien ; annonce ${conditions.annonce.taille}`
			);
			verifierChaque(
				`${adresse} : le pied porte ce lien, vers /conditions, dans un nouvel onglet`,
				{
					'un lien': conditions.nombre === 1,
					'vers /conditions': conditions.chemin === '/conditions',
					'hreflang="fr"': conditions.hreflang === 'fr',
					'target="_blank"': conditions.target === '_blank',
					'rel="noopener"': (conditions.rel ?? '').split(' ').includes('noopener')
				},
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
			await retour('19-cours-seance-barree', () =>
				seanceAnnuleeSurLaPageDuCours(page, base, langue)
			);
			await retour('19-og-locale', () => localeDePartage(page, `${base}/cours/<id>`, langue));
			if (langue !== 'en') await auditer(page, `page d’un cours ${langue}`);
			const abonnement = await ouvrir(page, `${base}/agenda`);
			verifier(`${base}/agenda s’affiche`, abonnement?.status() === 200, await titre(page));
			if (langue !== 'fr') await verifierLaBaliseHtml(page, `${base}/agenda`, langue);
			if (langue === 'ar') sansChiffresOrientaux(await page.content(), `${base}/agenda`);
			await retour('19-og-locale', () => localeDePartage(page, `${base}/agenda`, langue));
			if (langue !== 'en') await auditer(page, `page d’abonnement ${langue}`);
		});
	}
	await retour('19-D8', async () => {
		const adresse = `/m/${VOISINE.slug}/agenda`;
		await ouvrir(page, adresse);
		const introduction = await texteDe(page.locator('main > p').first());
		const description =
			(await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
		const attendue = `Le programme d’${VOISINE.nom} s’ajoute à votre calendrier`;
		verifierChaque(
			`${adresse} : « ${attendue} », dans la page et dans sa description, jamais « de Association »`,
			{
				'dans la page': introduction.startsWith(attendue),
				'dans la description': description.startsWith(attendue)
			},
			`« ${introduction.slice(0, 80)} » ; « ${description.slice(0, 80)} »`
		);
	});
}

/** Les jours de la semaine en italien, comme la page publique les écrit devant une date (D7). */
const GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

/**
 * La langue d'une page pour les aperçus de partage (étape 19) : `og:locale`, une langue et un pays,
 * puis un `og:locale:alternate` pour chaque autre langue que l'organisation publie.
 */
const LOCALE_DE_PARTAGE = { fr: 'fr_CH', de: 'de_CH', it: 'it_CH', en: 'en_GB', ar: 'ar_AR' };

async function localeDePartage(page, adresse, langue) {
	const lues = await page
		.locator('meta[property="og:locale"], meta[property="og:locale:alternate"]')
		.evaluateAll((metas) =>
			metas.map((meta) => ({
				propriete: meta.getAttribute('property'),
				valeur: meta.getAttribute('content')
			}))
		);
	const locale = lues.filter((lue) => lue.propriete === 'og:locale').map((lue) => lue.valeur);
	const autres = lues
		.filter((lue) => lue.propriete === 'og:locale:alternate')
		.map((lue) => lue.valeur)
		.sort();
	const attendues = LANGUES.filter((autre) => autre !== langue)
		.map((autre) => LOCALE_DE_PARTAGE[autre])
		.sort();
	verifierChaque(
		`${adresse} : <meta property="og:locale" content="${LOCALE_DE_PARTAGE[langue]}">, et un og:locale:alternate par autre langue publiée`,
		{
			[`og:locale ${LOCALE_DE_PARTAGE[langue]}`]:
				locale.length === 1 && locale[0] === LOCALE_DE_PARTAGE[langue],
			'les quatre autres langues': autres.join('|') === attendues.join('|')
		},
		`og:locale ${locale.join(', ') || 'absent'} ; alternate ${autres.join(', ') || 'aucun'}`
	);
}

/** « Annulé » dans chaque langue de la page publique (`apps/web/src/lib/i18n.ts`). */
const ANNULE = { fr: 'Annulé', de: 'Abgesagt', it: 'Annullato', en: 'Cancelled', ar: 'ملغى' };

/**
 * La page publique d'un cours (étape 19, lot 2) : dans « Prochaines séances », la séance annulée
 * reste à sa date, barrée, avec « Annulé », au lieu de disparaître.
 */
async function seanceAnnuleeSurLaPageDuCours(page, base, langue) {
	const barrees = page.locator('main ul li.barree');
	const nombre = await barrees.count();
	const lue = nombre === 1 ? await texteDe(barrees) : '';
	const marque = nombre === 1 ? await texteDe(barrees.locator('.marque')) : '';
	const trait =
		nombre === 1 &&
		(await barrees.evaluate((ligne) =>
			getComputedStyle(ligne).textDecorationLine.includes('line-through')
		));
	verifierChaque(
		`${base}/cours/<id> : dans « Prochaines séances », la séance annulée du ${dateSuisse(J1)} reste, barrée, avec « ${ANNULE[langue]} »`,
		{
			'une séance barrée': nombre === 1,
			'à sa date': lue.includes(dateSuisse(J1)),
			[`« ${ANNULE[langue]} »`]: marque === ANNULE[langue],
			'le trait sur le texte': trait
		},
		lue || `${nombre} séance(s) barrée(s)`
	);
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
		verifierChaque(
			`les conditions ouvertes depuis /m/${ORGANISATION.slug}/${langue} disent d’abord, dans cette langue, qu’elles n’existent qu’en français`,
			{
				'la langue de la page': (await racineDit(page, 'lang')) === langue,
				'la phrase': phrase === CONDITIONS_EN_FRANCAIS_SEULEMENT[langue],
				'le texte français': (await texte.count()) === 1,
				daté: (await texte.count()) === 1 && (await texteDe(texte)).includes('Dernière mise à jour')
			},
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
		verifierChaque(
			'le cadre montre les deux cours',
			{
				'le premier cours': texte.includes(COURS_1.fr),
				'le second cours': texte.includes(COURS_2)
			},
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
		verifierChaque(
			'le cadre a pris la hauteur de son contenu',
			{
				'un cadre mesuré': mesure.cadre > 0,
				'à la hauteur du contenu':
					Math.abs(mesure.cadre - Math.max(mesure.contenu, HAUTEUR_INITIALE_DU_CADRE)) <= 2
			},
			`cadre ${Math.round(mesure.cadre)} px, contenu ${Math.round(mesure.contenu)} px, ${HAUTEUR_INITIALE_DU_CADRE} px au départ`
		);
		await lienDuWidget(page, 'fr');

		// `/conditions` refuse d'être encadrée : dans le cadre, le lien doit ouvrir un nouvel onglet.
		const conditions = await lienDesConditions(encadree, 'fr');
		verifierChaque(
			'dans le cadre, le lien des conditions s’ouvre dans un nouvel onglet',
			{
				'un lien': conditions.nombre === 1,
				'vers /conditions': conditions.chemin === '/conditions',
				'target="_blank"': conditions.target === '_blank',
				'rel="noopener"': (conditions.rel ?? '').split(' ').includes('noopener')
			},
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
		verifierChaque(
			'dans le cadre posé à la main, le lien des conditions s’ouvre dans un nouvel onglet',
			{
				'un lien': lienManuel.nombre === 1,
				'vers /conditions': lienManuel.chemin === '/conditions',
				'target="_blank"': lienManuel.target === '_blank',
				'rel="noopener"': (lienManuel.rel ?? '').split(' ').includes('noopener')
			},
			`target="${lienManuel.target}" rel="${lienManuel.rel}"`
		);
		const [onglet] = await Promise.all([
			page.context().waitForEvent('page'),
			lienManuel.lien.click()
		]);
		await onglet.waitForLoadState('load');
		const titreDeLOnglet = await titre(onglet);
		verifierChaque(
			'le clic ouvre /conditions dans un onglet à part, et le cadre garde le programme',
			{
				'l’onglet sur /conditions': chemin(onglet) === '/conditions',
				'le titre de l’onglet': titreDeLOnglet === 'Conditions d’utilisation',
				'le cadre garde le programme': cadreManuel.url() === adresseDuCadre
			},
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
			verifierChaque(
				'dans le cadre anglais, aucune phrase du cadre français ne reste en français',
				{
					'<html lang="en">': (await cadreAnglais.locator('html').getAttribute('lang')) === 'en',
					'rien de resté en français': restes.length === 0
				},
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
	verifierChaque(
		`le nom accessible du lien du widget est « ${nomAttendu} », selon playwright et selon Chrome, et l’annonce est cachée aux yeux`,
		{
			'un lien de ce nom': nombre === 1,
			'le même nom selon Chrome': nomsSurLHote.includes(nomAttendu),
			'l’annonce cachée aux yeux': annonce.cachee,
			'target="_blank"': nombre === 1 && (await lien.getAttribute('target')) === '_blank',
			'vers la page publique': nombre === 1 && (await cheminDuLien(lien)) === cible
		},
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
		verifierChaque(
			`la séance ramenée plus tôt a son RECURRENCE-ID (${dateSuisse(J3)}) et sa nouvelle date, la veille (${dateSuisse(J2)})`,
			{
				'le RECURRENCE-ID': Boolean(deplace),
				'la nouvelle date, à 20:30': champ(deplace ?? [], 'DTSTART').some((ligne) =>
					ligne.includes(`${compacte(J2)}T2030`)
				)
			},
			deplace
				? [...champ(deplace, 'RECURRENCE-ID'), ...champ(deplace, 'DTSTART')].join(' ')
				: 'absente'
		);
	});
}

/**
 * Ce que la page d'abonnement, ou la page `adresse` (celle d'un cours), propose à un appareil
 * donné (E1, E2) : le bloc d'abonnement, ses liens et ses paragraphes, les liens « Page du cours »
 * et les noms accessibles des liens selon Chrome.
 */
async function abonnementSelon(navigateur, agent, adresse = `/m/${ORGANISATION.slug}/agenda`) {
	const contexte = await nouveauContexte(navigateur, { userAgent: agent });
	try {
		const page = await contexte.newPage();
		const reponse = await ouvrir(page, adresse);
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
		// Les paragraphes du bloc, dans l'ordre : un lien, une adresse à copier, ou une phrase, et le
		// texte du lien seul, sans la phrase qui le précède.
		const paragraphes = present
			? await bloc.locator('p').evaluateAll((tous) =>
					tous.map((p) => ({
						lien: /** @type {HTMLAnchorElement | null} */ (p.querySelector('a'))?.href ?? '',
						texteDuLien: (p.querySelector('a')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
						adresse: (p.querySelector('code')?.textContent ?? '').trim(),
						texte: (p.textContent ?? '').replace(/\s+/g, ' ').trim()
					}))
				)
			: [];
		// Sous le nom de chaque cours, « Page du cours », sur un téléphone (étape 19).
		const pagesDesCours = await page.locator('ul.cours li a.page-du-cours').evaluateAll((tous) =>
			tous.map((a) => ({
				href: /** @type {HTMLAnchorElement} */ (a).href,
				texte: (a.textContent ?? '').replace(/\s+/g, ' ').trim(),
				hauteur: a.getBoundingClientRect().height
			}))
		);
		return {
			vary: (reponse?.headers()['vary'] ?? '').toLowerCase(),
			appareil: present ? await bloc.getAttribute('data-appareil') : null,
			liens,
			paragraphes,
			cours: await page.locator('ul.cours li').count(),
			pagesDesCours,
			nomsDesLiens: present ? await nomsDesLiensSelonChrome(page) : [],
			texte: present ? await texteDe(bloc) : '',
			page: present ? await texteDe(page.locator('main')) : ''
		};
	} finally {
		await contexte.close();
	}
}

/**
 * E. L'agenda selon l'appareil : iPhone, Android, ordinateur (E1), et le délai d'Outlook (E2). Puis
 * ce que l'étape 19 y a changé : l'issue d'Android par un ordinateur, la page du programme pour un
 * changement de dernière minute, l'Outlook des comptes de travail ou d'école, « Page du cours » sur
 * un iPhone, le lien vers tous les choix, et l'aide du bouton de Google en arabe (B11).
 */
async function appareils(navigateur) {
	etape('E. La page d’abonnement selon l’appareil du visiteur');
	const hote = `http://${new URL(ORIGINE).host}`;
	const webcal = `webcal://${new URL(ORIGINE).host}/m/${ORGANISATION.slug}/agenda.ics`;
	const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
	const outlook = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(webcal)}`;
	const outlookTravail = `https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(webcal)}`;
	const commencePar = (href, debut) => href.startsWith(debut);

	const iphone = await abonnementSelon(navigateur, APPAREILS.iphone);
	const android = await abonnementSelon(navigateur, APPAREILS.android);
	const windows = await abonnementSelon(navigateur, APPAREILS.windows);
	await retour('E1', async () => {
		verifierChaque(
			'sur un iPhone, le premier lien est l’abonnement webcal, sans Google ni Outlook',
			{
				'webcal d’abord': commencePar(iphone.liens[0]?.href ?? '', webcal),
				'sans Google': !iphone.liens.some((lien) =>
					commencePar(lien.href, 'https://calendar.google.com')
				),
				'sans Outlook': !iphone.liens.some((lien) => /^https:\/\/outlook\./.test(lien.href))
			},
			iphone.liens.map((lien) => lien.href).join(' ') || 'aucun lien'
		);
		verifierChaque(
			'sur un Android, le lien ouvre Google Agenda avec la demande d’abonnement prête, dans un nouvel onglet',
			{
				'Google Agenda d’abord': commencePar(android.liens[0]?.href ?? '', google),
				'dans un nouvel onglet': android.liens[0]?.target === '_blank'
			},
			android.liens.map((lien) => lien.href).join(' ') || 'aucun lien'
		);
		verifierChaque(
			'sur un PC Windows, le choix entre Google Agenda, Outlook, une autre application, et l’adresse à copier',
			{
				'Google Agenda': windows.liens.some((lien) => commencePar(lien.href, google)),
				Outlook: windows.liens.some((lien) => commencePar(lien.href, outlook)),
				'une autre application': windows.liens.some((lien) => commencePar(lien.href, webcal)),
				'l’adresse à copier': windows.texte.includes(`${hote}/m/${ORGANISATION.slug}/agenda.ics`)
			},
			windows.liens.map((lien) => lien.texte).join(' | ') || 'aucun lien'
		);
		verifierChaque(
			'la réponse dit aux caches qu’elle dépend de l’appareil (Vary)',
			{
				'Sec-CH-UA-Platform': iphone.vary.includes('sec-ch-ua-platform'),
				'User-Agent': iphone.vary.includes('user-agent')
			},
			`Vary: ${iphone.vary}`
		);
	});
	// Ce qui reste du retour E2 depuis l'étape 19 : le délai d'Outlook, que Microsoft donne. Celui de
	// Google, qu'aucune aide de Google ne donne, a laissé la place à la page du programme (plus bas).
	await retour('E2', async () => {
		verifier(
			'sur un ordinateur, sous Outlook, le délai qu’il met à rafraîchir un abonnement : « Outlook peut mettre plus de 24 heures à rafraîchir un abonnement. »',
			windows.texte.includes('Outlook peut mettre plus de 24 heures à rafraîchir un abonnement.'),
			windows.texte.slice(0, 160)
		);
	});

	// Sur Android, la forme du bloc (décision du chef de projet, 27.09.2026) : le bouton de Google,
	// puis la phrase qui propose d'ouvrir cette page sur un ordinateur, suivie de l'adresse courte de
	// la page dans son propre paragraphe, et l'adresse du flux après elles. De même sur la page d'un
	// cours, avec l'adresse de ce cours.
	const androidDuCours = await abonnementSelon(
		navigateur,
		APPAREILS.android,
		`/m/${ORGANISATION.slug}/cours/${etat.cours1}`
	);
	await retour('19-agenda-android', async () => {
		const parUnOrdinateur =
			'Si Google Agenda ne propose rien sur votre téléphone, ouvrez cette page sur un ordinateur :';
		for (const [ou, lu, cettePage, flux] of [
			[
				'la page d’abonnement',
				android,
				`${hote}/m/${ORGANISATION.slug}/agenda`,
				`${hote}/m/${ORGANISATION.slug}/agenda.ics`
			],
			[
				'la page d’un cours',
				androidDuCours,
				`${hote}/m/${ORGANISATION.slug}/cours/${etat.cours1}`,
				`${hote}/m/${ORGANISATION.slug}/agenda/${etat.cours1}.ics`
			]
		]) {
			const bouton = lu.paragraphes.findIndex((p) =>
				commencePar(p.lien, 'https://calendar.google.com')
			);
			const phrase = lu.paragraphes.findIndex((p) => p.texte === parUnOrdinateur);
			const adresseDeLaPage = lu.paragraphes.findIndex((p) => p.adresse === cettePage);
			const adresseDuFlux = lu.paragraphes.findIndex((p) => p.adresse.startsWith(flux));
			verifierChaque(
				`sur un Android, ${ou} : après le bouton de Google, « ${parUnOrdinateur} », puis l’adresse de la page dans son propre paragraphe, puis celle du flux, et plus « L’adresse à coller »`,
				{
					'le bouton de Google d’abord': lu.appareil === 'android' && bouton === 0,
					'la phrase de l’ordinateur': phrase > bouton,
					'l’adresse de la page, juste après': phrase >= 0 && adresseDeLaPage === phrase + 1,
					'l’adresse du flux ensuite': adresseDuFlux > adresseDeLaPage,
					'plus « L’adresse à coller »': !lu.texte.includes('L’adresse à coller')
				},
				`bouton ${bouton}, phrase ${phrase}, page ${adresseDeLaPage}, flux ${adresseDuFlux} sur ${lu.paragraphes.length} paragraphes`
			);
		}
	});
	// La page du programme pour un changement de dernière minute, là où la page disait le délai de
	// Google (décision du chef de projet, 27.09.2026).
	await retour('19-agenda-derniere-minute', async () => {
		const derniereMinute =
			'Pour un changement de dernière minute, regardez la page du programme : elle est toujours à jour.';
		const fois = (texte) => texte.split(derniereMinute).length - 1;
		verifierChaque(
			'la page renvoie à la page du programme pour un changement de dernière minute, sous l’aide du bouton d’Android et une fois sous le choix complet, et ne dit plus que Google peut mettre 24 heures',
			{
				'sous le bouton d’Android': android.texte.includes(derniereMinute),
				'une fois sous le choix complet': fois(windows.texte) === 1,
				'plus de délai de Google': !/Google peut mettre/.test(
					`${android.page} ${windows.page} ${iphone.page}`
				)
			},
			`Android : ${android.texte.slice(0, 120)}`
		);
		// Un iPhone ne la lit pas dans son bloc : les étapes à la main la disent, une fois, après le
		// délai d'Outlook (reprise 1).
		const delaiOutlook = iphone.page.indexOf('Outlook peut mettre plus de 24 heures');
		verifierChaque(
			'sur un iPhone, les étapes à la main renvoient à la page du programme, une fois, après le délai d’Outlook',
			{
				'le délai d’Outlook': delaiOutlook >= 0,
				'la page du programme après lui': iphone.page.indexOf(derniereMinute) > delaiOutlook,
				'une seule fois': fois(iphone.page) === 1
			},
			`iPhone : ${iphone.page.slice(Math.max(0, delaiOutlook), delaiOutlook + 200)}`
		);
	});
	// Dans les cinq langues : la page française est celle du choix complet, déjà lue plus haut, et
	// les quatre autres sont demandées par le même ordinateur. Le flux d'une autre langue porte
	// `?lang=` : l'adresse d'Outlook commence de même.
	await retour('19-agenda-outlook', async () => {
		const pages = { fr: windows };
		for (const langue of LANGUES.filter((code) => code !== 'fr')) {
			pages[langue] = await abonnementSelon(
				navigateur,
				APPAREILS.windows,
				`/m/${ORGANISATION.slug}/${langue}/agenda`
			);
		}
		const travail = Object.fromEntries(
			LANGUES.map((langue) => [
				langue,
				pages[langue].liens.find((lien) => lien.texte.startsWith(OUTLOOK_TRAVAIL[langue].lien))
			])
		);
		verifierChaque(
			'sur un ordinateur, dans les cinq langues, « Outlook (travail ou école) » ouvre outlook.office.com dans un nouvel onglet, et chaque Outlook dit à quels comptes il sert',
			Object.fromEntries(
				LANGUES.flatMap((langue) => [
					[`« ${OUTLOOK_TRAVAIL[langue].lien} »`, Boolean(travail[langue])],
					[
						`vers outlook.office.com, ${langue}`,
						commencePar(travail[langue]?.href ?? '', outlookTravail)
					],
					[`dans un nouvel onglet, ${langue}`, travail[langue]?.target === '_blank'],
					[
						`« ${OUTLOOK_TRAVAIL[langue].personnels} »`,
						pages[langue].texte.includes(OUTLOOK_TRAVAIL[langue].personnels)
					],
					[
						`« ${OUTLOOK_TRAVAIL[langue].travail} »`,
						pages[langue].texte.includes(OUTLOOK_TRAVAIL[langue].travail)
					]
				])
			),
			LANGUES.map(
				(langue) =>
					`${langue} : ${
						pages[langue].liens
							.filter((lien) => lien.texte.startsWith('Outlook'))
							.map((lien) => lien.texte)
							.join(' | ') || 'aucun lien Outlook'
					}`
			).join(' ; ')
		);
	});
	await retour('19-agenda-page-du-cours', async () => {
		const cours = `${hote}/m/${ORGANISATION.slug}/cours/`;
		verifierChaque(
			'sur un iPhone, sous le nom de chaque cours, un lien « Page du cours » vers le bloc d’abonnement de sa page, d’au moins 44 px de haut',
			{
				'un lien par cours': iphone.cours > 0 && iphone.pagesDesCours.length === iphone.cours,
				'« Page du cours »': iphone.pagesDesCours.every((lien) => lien.texte === 'Page du cours'),
				'vers …/cours/<id>#agenda': iphone.pagesDesCours.every(
					(lien) => lien.href.startsWith(cours) && lien.href.endsWith('#agenda')
				),
				'44 px de haut': iphone.pagesDesCours.every((lien) => lien.hauteur >= 44)
			},
			`${iphone.pagesDesCours.length} lien(s) pour ${iphone.cours} cours ; ${iphone.pagesDesCours
				.slice(0, 2)
				.map((lien) => `« ${lien.texte} » ${Math.round(lien.hauteur)} px`)
				.join(', ')}`
		);
	});
	await retour('19-agenda-autre-appareil', async () => {
		for (const [appareil, lu] of [
			['un iPhone', iphone],
			['un Android', android]
		]) {
			const dernier = lu.paragraphes.at(-1);
			verifierChaque(
				`sur ${appareil}, le bloc finit par « Une autre application ou un autre appareil ? » en texte, puis le lien « Voir tous les choix », seul, vers ?appareil=tous`,
				{
					'la question en texte':
						(dernier?.texte ?? '').startsWith('Une autre application ou un autre appareil ?') &&
						!(dernier?.texteDuLien ?? '').includes('?'),
					'le lien « Voir tous les choix »': dernier?.texteDuLien === 'Voir tous les choix',
					'son nom accessible': lu.nomsDesLiens.includes('Voir tous les choix'),
					'vers ?appareil=tous': (dernier?.lien ?? '').endsWith('?appareil=tous')
				},
				`« ${dernier?.texte ?? 'aucun paragraphe'} », lien « ${dernier?.texteDuLien ?? ''} »`
			);
		}
	});
	await retour('19-B11', async () => {
		const arabe = await abonnementSelon(
			navigateur,
			APPAREILS.android,
			`/m/${ORGANISATION.slug}/ar/agenda`
		);
		const aide = arabe.paragraphes[1]?.texte ?? '';
		verifier(
			'la page d’abonnement en arabe, sur un Android : l’aide du bouton de Google est exactement celle relue',
			aide ===
				'اضغط على الزر: يُفتح تقويم Google مع طلب إضافة هذا التقويم. إن اقترح عليك ذلك، فأكّد.',
			aide || 'aucune aide'
		);
	});
}

/** Le choix de la localité du parcours, parmi les réponses de la recherche. */
const radioDeLaLocalite = (page) =>
	page.getByRole('radio', { name: LOCALITE.libelle, exact: true });

/**
 * Les valeurs des cases cochées de la liste des localités : `2502|Biel/Bienne` pour une localité,
 * une valeur vide pour « Hors de Suisse ». Par la valeur et non par le nom accessible, qui s'allonge
 * de « localité enregistrée » quand la localité est épinglée en tête.
 */
const casesCochees = (page) =>
	page
		.locator('input[name="localite"]:checked')
		.evaluateAll((cases) => cases.map((une) => une.value));

/**
 * Les réglages du calcul que l'écran des prières vient d'enregistrer, lus dans ses champs par leur
 * `id`, avec la position donnée, par défaut celle que la liste donne à la localité, et le fuseau de
 * l'organisation.
 */
async function reglageEnregistre(page, position = positionDeLaListe()) {
	const valeur = (id) => page.locator(`#${id}`).inputValue();
	/** @type {Record<string, number>} */
	const ajustements = {};
	for (const priere of PRIERES) ajustements[priere] = Number(await valeur(`${priere}Adjustment`));
	return {
		...position,
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
		verifierChaque(
			`Partager donne un message par langue publiée, les ${LANGUES.length}, le français de l’organisation d’abord et seul ouvert`,
			{
				'un message par langue': lus.length === LANGUES.length,
				'toutes les langues': LANGUES.every((langue) => langues.includes(langue)),
				'le français d’abord': langues[0] === 'fr',
				'lui seul ouvert': lus.every((lu, index) => lu.ouvert === (index === 0))
			},
			lus.map((lu) => `${lu.lang || 'sans langue'}${lu.ouvert ? ' (ouvert)' : ''}`).join(', ') ||
				'aucun repli'
		);
		verifierChaque(
			'chaque message porte sa langue et son sens, de droite à gauche en arabe',
			{
				'au moins un message': lus.length > 0,
				'chaque langue et son sens': lus.every(
					(lu) => LANGUES.includes(lu.lang) && lu.dir === (lu.lang === 'ar' ? 'rtl' : 'ltr')
				)
			},
			lus.map((lu) => `lang="${lu.lang}" dir="${lu.dir}"`).join(', ') || 'aucune zone'
		);
		const fautifs = sansLeNomDeLaPriere(lus);
		verifierChaque(
			`la session du vendredi y porte le nom de la prière dans la langue du message : ${NOMS_TRADUITS}`,
			{
				'au moins un message': lus.length > 0,
				'le nom de la prière dans chaque langue': fautifs.length === 0
			},
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
		verifierChaque(
			'« Source que vous déclarez » a disparu, et rien du calcul n’est montré avant la réponse',
			{
				'plus de « Source que vous déclarez »':
					(await page.getByLabel('Source que vous déclarez').count()) === 0,
				'rien du calcul': (await page.locator('#latitude').count()) === 0
			},
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
		verifierChaque(
			'la localité choisie donne sa position, et l’attribution de swisstopo est écrite',
			{
				'la localité choisie': choisie.startsWith(`Localité choisie : ${LOCALITE.libelle}`),
				'sa position': choisie.includes('latitude'),
				'l’attribution de swisstopo': credit.includes('swisstopo')
			},
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
		verifierChaque(
			'« Voir l’aperçu » montre les sept prochains jours avant tout enregistrement, puis « Enregistrer »',
			{
				'sept jours': (await lignes.count()) === 7,
				'le bouton « Enregistrer »':
					(await page.getByRole('button', { name: 'Enregistrer', exact: true }).count()) === 1
			},
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
		verifierChaque(
			`la localité de ${LOCALITE.nom} est enregistrée, et l’écran dit que les heures en viennent`,
			{
				'« Réglages enregistrés. »': confirmation.startsWith('Réglages enregistrés.'),
				'les heures en viennent': etat.includes(
					`Vos heures sont calculées pour cette localité : ${LOCALITE.libelle}`
				)
			},
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
		verifierChaque(
			'les heures des sept prochains jours sont servies au public, celles que le calcul donne pour la position de la localité dans la liste',
			{
				'sept jours servis': servies.length === 7,
				'les heures du calcul': ecarts.length === 0
			},
			ecarts.slice(0, 2).join(' ; ') ||
				`${servies.length} jour(s), position ${reglage.latitude}, ${reglage.longitude}, ${reglage.method}`
		);
	});
	await replisPendantLaFrappe(page);
	await rechercheDUneLocalite(page);
	await importEnArabe(page);
	await aideDesNuitsCourtes(page);
	await ouvrir(page, '/prieres?source=computed');
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
		// Les langues du sermon sont les huit langues d'enseignement, que la page publique soit écrite
		// dans chacune ou non (étape 19).
		await retour('19-sermon', async () => {
			const groupe = await exiger(
				ajout
					.locator('fieldset')
					.filter({ has: page.locator('legend', { hasText: 'Langue du sermon' }) }),
				'le groupe « Langue du sermon »'
			);
			const noms = (await groupe.locator('label').allTextContents()).map((nom) => nom.trim());
			const aide = await descriptionDe(groupe);
			verifierChaque(
				'dans « Ajouter une session », « Langue du sermon » propose les huit langues d’enseignement, dans l’ordre, et son aide le dit',
				{
					'les huit langues, dans l’ordre':
						noms.join('|') === 'Français|Allemand|Italien|Arabe|Anglais|Albanais|Turc|Bosnien',
					'l’aide':
						aide ===
						'Cochez chaque langue dans laquelle le sermon est dit, même si votre page publique n’est pas écrite dans cette langue.'
				},
				`${noms.join(', ')} ; « ${aide} »`
			);
		});
		await ajout.getByLabel('Heure de début', { exact: true }).fill(VENDREDI.debut);
		await ajout.getByLabel('Heure de fin', { exact: true }).fill(VENDREDI.fin);
		const langues = ajout.locator('input[name="sermonLanguages"]');
		if ((await ajout.locator('input[name="sermonLanguages"]:checked').count()) === 0) {
			await langues.first().check();
		}
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
				verifierChaque(
					`le flux agenda${langue === 'fr' ? '' : ` (?lang=${langue})`} dit « ${ancrage.libelle[langue]} » pour « ${ancrage.titre} », comme la page, à l’heure que le calcul donne pour la localité`,
					{
						'l’événement du cours': ancres.length > 0,
						'la phrase de la page': description === `DESCRIPTION:${ancrage.libelle[langue]}`,
						'l’heure du calcul': debut.includes(attendu)
					},
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

/** Le repli de l'écran dont le résumé dit exactement ce texte. */
const repliNomme = (page, resume) =>
	page.locator('details').filter({ has: page.locator(`summary:text-is("${resume}")`) });

/** Vrai si ce repli est ouvert. */
const estOuvert = (repli) =>
	repli.evaluate((details) => /** @type {HTMLDetailsElement} */ (details).open);

/**
 * Tape un texte dans un champ, au clavier, à la place de ce qu'il contient, une touche à la fois.
 * Rend le rang de la première touche après laquelle le repli est fermé, ou 0 s'il est resté ouvert.
 */
async function taperSansFermer(page, champ, texte, repli) {
	await champ.click();
	await page.keyboard.press('ControlOrMeta+A');
	let fermeApres = 0;
	for (const [rang, touche] of [...texte].entries()) {
		await page.keyboard.type(touche);
		if (fermeApres === 0 && !(await estOuvert(repli))) fermeApres = rang + 1;
	}
	return fermeApres;
}

/**
 * Avec JavaScript, au clavier (C2) : « Hors de Suisse » reste ouvert pendant qu'on tape la latitude
 * puis la longitude, et « Méthode de calcul, école et ajustements » pendant qu'on tape dans la
 * recherche, puis quand la liste arrive. Un repli fermé avant un champ est d'abord ouvert, pour que
 * chaque champ soit tapé. La position tapée coche « Hors de Suisse » à la place de la localité
 * enregistrée, cochée au départ. Rien n'est enregistré : la page est rouverte à la fin.
 */
async function replisPendantLaFrappe(page) {
	const ouvrirLEcran = async () => {
		await ouvrir(page, '/prieres?source=computed');
		// Hydratée, la page retire le bouton « Continuer » de la question. Cinq secondes au plus.
		await page
			.waitForFunction(
				() => !document.querySelector('form.question button[type="submit"]'),
				undefined,
				{ timeout: 5000 }
			)
			.catch(() => undefined);
	};
	const ouvrirLe = async (repli) => {
		if (!(await estOuvert(repli))) await repli.locator(':scope > summary').click();
	};
	const recit = (fermeApres, touches) =>
		fermeApres === 0
			? `ouvert après les ${touches} touches`
			: `fermé après la touche ${fermeApres}`;

	await retour('C2', async () => {
		await ouvrirLEcran();
		// L'état de départ, avant toute frappe : la case de la localité enregistrée est cochée, seule.
		// Sans lui, la vérification de « Hors de Suisse » après la frappe ne prouverait rien.
		const cocheesAvant = await casesCochees(page);
		const hors = repliNomme(page, REPLIS_DES_PRIERES.horsDeSuisse);
		const lus = [];
		for (const id of ['latitude', 'longitude']) {
			await ouvrirLe(hors);
			const champ = page.locator(`#${id}`);
			const texte = POSITION_HORS_DE_SUISSE[id];
			const fermeApres = await taperSansFermer(page, champ, texte, hors);
			lus.push({ id, texte, fermeApres, valeur: await champ.inputValue() });
		}
		verifierChaque(
			`avec JavaScript, « ${REPLIS_DES_PRIERES.horsDeSuisse} » reste ouvert pendant qu’on tape la latitude puis la longitude, touche par touche`,
			Object.fromEntries(
				lus.flatMap((lu) => [
					[`ouvert pendant la frappe de la ${lu.id}`, lu.fermeApres === 0],
					[`la ${lu.id} tapée entière`, lu.valeur === lu.texte]
				])
			),
			lus
				.map((lu) => `${lu.id} « ${lu.valeur} », ${recit(lu.fermeApres, lu.texte.length)}`)
				.join(' ; ')
		);
		// La localité enregistrée était cochée au chargement : une position tapée la remplace, et la
		// frappe coche « Hors de Suisse » à sa place (étape 19, lot 2). Sans JavaScript, le serveur
		// fait de même à l'envoi.
		const caseHors = page.getByRole('radio', { name: CHOIX_HORS_DE_SUISSE, exact: true });
		const horsCochee = (await caseHors.count()) === 1 && (await caseHors.isChecked());
		const cocheesApres = await casesCochees(page);
		const dites = (valeurs) =>
			valeurs.map((valeur) => (valeur === '' ? '« Hors de Suisse »' : valeur)).join(', ') ||
			'aucune';
		// Rangée sous C2, et non sous l'étape 19 : l'image de l'étape 18 cochait déjà « Hors de Suisse »
		// pendant la frappe (relevé du 28.09.2026). Ce que l'étape 19 y a ajouté, le serveur qui coche
		// lui-même sans JavaScript, est vérifié à l'étape k.
		verifierChaque(
			`avec JavaScript, ${LOCALITE.nom} enregistrée et cochée, taper une position coche « ${CHOIX_HORS_DE_SUISSE} » à sa place`,
			{
				[`${LOCALITE.nom} seule cochée avant la frappe`]:
					cocheesAvant.length === 1 && cocheesAvant[0].startsWith(`${LOCALITE.npa}|`),
				'« Hors de Suisse » seule cochée après la frappe':
					horsCochee && cocheesApres.length === 1 && cocheesApres[0] === ''
			},
			`cochée avant : ${dites(cocheesAvant)} ; après : ${dites(cocheesApres)}`
		);

		await ouvrirLEcran();
		const methode = repliNomme(page, REPLIS_DES_PRIERES.methode);
		await ouvrirLe(methode);
		const recherche = page.getByLabel('Nom ou NPA de la localité', { exact: true });
		const fermeApres = await taperSansFermer(page, recherche, LOCALITE.nom, methode);
		// La liste est arrivée quand l'annonce sous la recherche, vide au chargement, dit ce qu'elle
		// a trouvé. Cinq secondes au plus.
		await page
			.waitForFunction(
				() => (document.querySelector('p[aria-live="polite"]')?.textContent ?? '').trim() !== '',
				undefined,
				{ timeout: 5000 }
			)
			.catch(() => undefined);
		const annonce = page.locator('p[aria-live="polite"]');
		const trouvees = (await annonce.count()) === 1 ? await texteDe(annonce) : '';
		const ouvertALaListe = await estOuvert(methode);
		const tapee = await recherche.inputValue();
		verifierChaque(
			`avec JavaScript, « ${REPLIS_DES_PRIERES.methode} » reste ouvert pendant qu’on tape dans la recherche, touche par touche, puis quand la liste arrive`,
			{
				'ouvert pendant la frappe': fermeApres === 0,
				'ouvert quand la liste arrive': ouvertALaListe,
				'la recherche tapée entière': tapee === LOCALITE.nom
			},
			`« ${tapee} », ${recit(fermeApres, LOCALITE.nom.length)}, puis ${ouvertALaListe ? 'ouvert' : 'fermé'} ; « ${trouvees || 'aucune annonce'} »`
		);
		await ouvrirLEcran();
	});
}

/**
 * La recherche d'une localité, avec JavaScript (étape 19) : « Rüe » propose d'abord les localités
 * dont le nom porte « Rüe », et Rue (FR) seulement après elles, que le « ü » soit tapé d'un seul
 * point de code ou de deux, « u » puis le tréma. Rien n'est enregistré.
 */
async function rechercheDUneLocalite(page) {
	await retour('19-prieres-rue', async () => {
		for (const [forme, texte] of [
			['d’un seul point de code', 'Rüe'.normalize('NFC')],
			['de deux points de code', 'Rüe'.normalize('NFD')]
		]) {
			await ouvrir(page, '/prieres?source=computed');
			await page.getByLabel('Nom ou NPA de la localité', { exact: true }).fill(texte);
			await page
				.locator('label.resultat bdi', { hasText: 'Rüe' })
				.first()
				.waitFor({ timeout: 5000 })
				.catch(() => undefined);
			// Les réponses de la recherche, sans la localité enregistrée, épinglée en tête, ni la case
			// « Hors de Suisse ».
			const noms = await page
				.locator('label.resultat')
				.evaluateAll((cases) =>
					cases
						.filter((une) => une.querySelector('bdi') && !une.querySelector('.aide'))
						.map((une) => (une.querySelector('bdi')?.textContent ?? '').trim())
				);
			const avecTrema = noms.filter((nom) => nom.includes('Rüe'));
			const derniereAvecTrema = noms.findLastIndex((nom) => nom.includes('Rüe'));
			const rue = noms.findIndex((nom) => /\bRue \(FR\)/.test(nom));
			verifierChaque(
				`« Rüe », le « ü » tapé ${forme} : les premières localités proposées portent « Rüe », et Rue (FR) ne vient qu’après elles`,
				{
					'les trois premières portent « Rüe »':
						noms.length >= 3 && noms.slice(0, 3).every((nom) => nom.includes('Rüe')),
					'Rue (FR) après elles': rue === -1 || rue > derniereAvecTrema
				},
				`${noms.slice(0, 5).join(', ') || 'aucune localité'} ; ${avecTrema.length} avec « Rüe », Rue (FR) au rang ${rue + 1}`
			);
		}
	});
}

/**
 * La lecture d'un fichier d'heures, l'écran en arabe (étape 19, B4 à B6) : l'aide du modèle, puis
 * un fichier séparé par des tabulations dont vingt-cinq lignes sont refusées, plus que la liste
 * n'en montre (vingt). Le fichier est lu, rien n'est enregistré ; l'écran revient au français.
 */
async function importEnArabe(page) {
	await ouvrir(page, '/prieres?source=import');
	await choisirLaLangue(page, 'ar');
	try {
		await retour('19-B4', async () => {
			const aide = await texteDe(
				await exiger(
					page.locator('p.aide').filter({ has: page.locator('a[href="/prieres/modele.csv"]') }),
					'l’aide du modèle'
				)
			);
			verifierChaque(
				'l’écran des prières en arabe, « importées depuis un fichier » : l’aide du modèle dit « النموذج مُعبّأ » et « ثم ارفعه هنا »',
				{
					'« النموذج مُعبّأ »': aide.includes('النموذج مُعبّأ'),
					'« ثم ارفعه هنا »': aide.includes('ثم ارفعه هنا')
				},
				aide
			);
		});
		const valides = [1, 2, 3].map((pas) =>
			[dateSuisse(plusJours(T, pas)), '05:40', '13:20', '16:40', '19:20', '20:50'].join('\t')
		);
		// Une heure illisible, et non une date : une date impossible, « 32.01 », ferait lire au service
		// les dates du fichier dans l'autre ordre, et refuser aussi les trois bonnes lignes.
		const refusees = Array.from({ length: 25 }, (_, rang) =>
			[
				`${String(rang + 1).padStart(2, '0')}.01.2027`,
				'99:99',
				'13:20',
				'16:40',
				'19:20',
				'20:50'
			].join('\t')
		);
		const fichier = [
			['date', 'fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].join('\t'),
			...valides,
			...refusees
		].join('\n');
		await page.locator('#calendrier').setInputFiles({
			name: 'horaires.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from(`${fichier}\n`, 'utf8')
		});
		// L'ordre des dates est choisi dans la liste de l'écran, jour puis mois. Deviné, il dépendrait
		// du jour du passage. Le service ne tranche que sur les lignes gardées, les trois bonnes : quand
		// elles tombent toutes le 12 du mois ou avant, « 01.10 » se lit aussi « 10 janvier », l'ordre
		// reste ambigu, et les trois sont refusées avec les autres. Cela fait vingt-huit refus au lieu
		// de vingt-cinq, cent vingt jours de lancement par an (relecture du lot 4 de l'étape 19).
		await page.locator('#ordre').selectOption('jour-mois');
		await envoyer(page, page.locator('form[action$="/lireFichier"] button[type="submit"]'));
		const rapport = page.locator('.rapport');
		await retour('19-B5', async () => {
			const lecture = await texteDe(
				await exiger(rapport.locator('ul li'), 'le rapport de lecture')
			);
			verifier(
				'un fichier séparé par des tabulations, lu en arabe : le séparateur se lit « علامة الجدولة (Tab) »',
				lecture.includes('علامة الجدولة (Tab)'),
				lecture
			);
		});
		await retour('19-B6', async () => {
			const suite = await texteDe(
				await exiger(rapport.locator('ul.refusees + p.aide'), 'la ligne qui compte les autres')
			);
			verifier(
				'vingt-cinq lignes refusées, vingt montrées : la ligne finale se lit « … و5 أخرى. »',
				suite === '… و5 أخرى.',
				suite
			);
		});
	} finally {
		if ((await racineDit(page, 'lang')) !== 'fr') await choisirLaLangue(page, 'fr');
	}
}

/**
 * L'aide de la règle des nuits courtes, dans les cinq langues (étape 19) : ce que donne
 * « Proportionnelle à l’angle » change avec la méthode de calcul, le champ juste au-dessus, au lieu
 * de dépendre « de l’angle de la méthode choisie », qui demandait de savoir qu'une méthode règle un
 * angle. Le texte est lu dans la page, repli fermé ou non. L'écran revient au français.
 */
async function aideDesNuitsCourtes(page) {
	await retour('19-prieres-angle', async () => {
		const lues = {};
		try {
			for (const langue of LANGUES) {
				if ((await racineDit(page, 'lang')) !== langue) await choisirLaLangue(page, langue);
				await ouvrir(page, '/prieres?source=computed');
				lues[langue] = await texteDe(
					await exiger(page.locator('#regle-aide'), 'l’aide de la règle des nuits courtes')
				);
			}
		} finally {
			if ((await racineDit(page, 'lang')) !== 'fr') await choisirLaLangue(page, 'fr');
		}
		verifierChaque(
			'dans les cinq langues, l’aide de la règle des nuits courtes dit que « Proportionnelle à l’angle » donne des heures qui changent avec la méthode de calcul',
			Object.fromEntries(
				LANGUES.map((langue) => [langue, lues[langue].includes(NUITS_COURTES[langue])])
			),
			// Ce que l'aide dit de la règle, depuis le guillemet qui ouvre son nom.
			LANGUES.map((langue) => {
				const debut = Math.max(0, lues[langue].search(/[«‘]/));
				return `${langue} : ${lues[langue].slice(debut, debut + 110)}`;
			}).join(' | ')
		);
	});
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
		// Avec JavaScript, le navigateur exige les champs de la façon choisie, et eux seuls : les heures
		// pour une heure fixe, les minutes et la durée pour une prière. Le serveur rend ces champs sans
		// `required`, pour qu'une page sans JavaScript s'envoie (étape 19, lot 3, et l'étape k) : les
		// tests HTTP ne voient pas qu'ils le redeviennent une fois la page hydratée.
		const exige = async (identifiant) =>
			(await page.locator(`#${identifiant}`).count()) === 1 &&
			(await page
				.locator(`#${identifiant}`)
				.evaluate((champ) => /** @type {HTMLInputElement} */ (champ).required));
		await page
			.locator('#start[required]')
			.waitFor({ timeout: 5000 })
			.catch(() => undefined);
		const heuresExigees = (await exige('start')) && (await exige('end'));
		await page.locator('#timingKind').selectOption('beforePrayer');
		const minutesExigees = (await exige('offsetMinutes')) && (await exige('durationMinutes'));
		const heuresParties = (await page.locator('#start').count()) === 0;
		// Les bornes des minutes suivent le choix de même : de 1 à 120 avant une prière, de 0 à 240
		// après. Le serveur rend celles des deux choix réunies, de 0 à 240, pour qu'une page sans
		// JavaScript parte avec 0 minute après une prière (relecture du lot 3) : les tests HTTP ne
		// voient pas qu'elles se resserrent une fois la page hydratée.
		const bornesDesMinutes = async () =>
			page.locator('#offsetMinutes').evaluate((champ) => {
				const minutes = /** @type {HTMLInputElement} */ (champ);
				return `${minutes.min} à ${minutes.max}`;
			});
		const bornesAvant = await bornesDesMinutes();
		await page.locator('#timingKind').selectOption('prayer');
		const bornesApres = await bornesDesMinutes();
		await page.locator('#timingKind').selectOption('fixed');
		const heuresRevenues = await exige('start');
		verifierChaque(
			'avec JavaScript, le navigateur exige les champs de l’horaire choisi : les heures pour une heure fixe, les minutes et la durée avant une prière, et eux seuls',
			{
				'les heures exigées pour une heure fixe': heuresExigees,
				'les minutes et la durée exigées avant une prière': minutesExigees,
				'les heures retirées avant une prière': heuresParties,
				'les heures de nouveau exigées pour une heure fixe': heuresRevenues
			},
			`heures ${heuresExigees ? 'exigées' : 'libres'}, puis minutes et durée ${minutesExigees ? 'exigées' : 'libres'}, puis heures ${heuresRevenues ? 'exigées' : 'libres'}`
		);
		verifierChaque(
			'avec JavaScript, les minutes prennent les bornes du choix : de 1 à 120 avant une prière, de 0 à 240 après',
			{
				'de 1 à 120 avant une prière': bornesAvant === '1 à 120',
				'de 0 à 240 après une prière': bornesApres === '0 à 240'
			},
			`avant : ${bornesAvant} ; après : ${bornesApres}`
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
		verifierChaque(
			'sa fiche rouverte dit « avant une prière » et garde des minutes positives',
			{
				'« avant une prière »': (await page.locator('#timingKind').inputValue()) === 'beforePrayer',
				'les minutes positives':
					(await page.locator('#offsetMinutes').inputValue()) === String(COURS_AVANT.minutes),
				'le libellé des minutes': libelle === 'Combien de minutes avant la prière ?'
			},
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
		verifierChaque(
			'l’onglet montre les heures du jour, adhan et iqama, les sept prochains jours et la prière du vendredi',
			{
				'« Aujourd’hui, … »': jour.startsWith('Aujourd’hui, '),
				'le jour de l’horloge': jour.endsWith(dateSuisse(T)),
				'Prière, Adhan, Iqama':
					entetes.map((entete) => entete.trim()).join('|') === 'Prière|Adhan|Iqama',
				'sept jours': (await semaine.count()) === 7,
				'la prière du vendredi': (await vendredi.count()) === 1,
				'à son heure':
					(await vendredi.count()) === 1 && (await texteDe(vendredi)).includes(VENDREDI.debut)
			},
			`« ${jour} », ${entetes.join(', ')}, ${await semaine.count()} jours, vendredi : ${
				(await vendredi.count()) === 1 ? await texteDe(vendredi) : 'absent'
			}`
		);
		await auditer(visiteur, 'page publique fr, vue prières');
		await ouvrir(visiteur, `/m/${ORGANISATION.slug}/ar?vue=prieres`);
		const jourArabe = await texteDe(visiteur.locator('#prieres-aujourdhui'));
		verifierChaque(
			'en arabe, l’onglet « مواقيت الصلاة », de droite à gauche, avec le jour en chiffres latins',
			{
				'l’onglet « مواقيت الصلاة »':
					(await visiteur.locator('nav.vues a[aria-current="page"]').count()) === 1 &&
					(await visiteur.locator('nav.vues a[aria-current="page"]').textContent())?.trim() ===
						'مواقيت الصلاة',
				'dir="rtl"': (await racineDit(visiteur, 'dir')) === 'rtl',
				'« اليوم، … »': jourArabe.startsWith('اليوم، '),
				'le jour de l’horloge': jourArabe.endsWith(dateSuisse(T))
			},
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
			verifierChaque(
				'dans le widget, l’onglet « Prières » s’ouvre dans le cadre, qui reste encadré',
				{
					'le cadre reste encadré': adresse.searchParams.get('embed') === '1',
					'les cinq prières du jour':
						(await cadre.locator('table.aujourdhui tbody tr').count()) === 5
				},
				adresse.pathname + adresse.search
			);
		} finally {
			await new Promise((resolue) => hote.close(() => resolue(undefined)));
		}
	});
	await widgetSurLesPrieres(visiteur);
}

/**
 * Le widget posé avec `view="prieres"` (étape 19) : son cadre s'ouvre sur l'onglet « Prières » de
 * la page encadrée, et le lien de son pied mène au même onglet de la page publique.
 */
async function widgetSurLesPrieres(visiteur) {
	await retour('19-widget-prieres', async () => {
		const code = etat.codeEmbarque.replace('<jadwal-widget ', '<jadwal-widget view="prieres" ');
		const hote = createServer((_requete, reponse) => {
			reponse.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
			reponse.end(
				'<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n' +
					'<title>Le site d’une organisation</title>\n</head>\n<body>\n<main>\n' +
					`<h1>Nos prières</h1>\n${code}\n</main>\n</body>\n</html>\n`
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
			await lireLEcran(cadre);
			const adresse = new URL(cadre.url());
			const ongletCourant = await cadre
				.locator('nav.vues a[aria-current="page"]')
				.allTextContents();
			const pied = await visiteur
				.locator('jadwal-widget')
				.getByRole('link', { name: avecNouvelOnglet(LIEN_DU_WIDGET.fr, 'fr'), exact: true })
				.evaluateAll((liens) => liens.map((lien) => /** @type {HTMLAnchorElement} */ (lien).href));
			verifierChaque(
				'le widget posé avec view="prieres" ouvre son cadre sur l’onglet « Prières », encadré, et son pied mène au même onglet',
				{
					'le cadre sur ?vue=prieres': adresse.searchParams.get('vue') === 'prieres',
					'encadré (embed=1)': adresse.searchParams.get('embed') === '1',
					'l’onglet « Prières » choisi':
						ongletCourant.map((texte) => texte.trim()).join('|') === 'Prières',
					'le pied vers ?vue=prieres':
						pied.length === 1 && new URL(pied[0] ?? ORIGINE).searchParams.get('vue') === 'prieres'
				},
				`${adresse.pathname}${adresse.search} ; onglet « ${ongletCourant.join(', ') || 'aucun'} » ; pied ${pied.join(', ') || 'absent'}`
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
			verifierChaque(
				`${adresse} rend 404, avec <html lang="${langue}" dir="${dirAttendu}"> et aucune balise script`,
				{
					404: brut.status === 404,
					[`<html lang="${langue}" dir="${dirAttendu}">`]:
						balise === `<html lang="${langue}" dir="${dirAttendu}">`,
					'aucune balise script': scripts === 0
				},
				`rendu ${brut.status}, ${balise}, ${scripts} balise(s) script`
			);

			const reponse = await ouvrir(page, adresse);
			const attendu = TEXTES_PUBLICS[langue].introuvable;
			const phrase = await texteDe(page.locator('main p'));
			verifierChaque(
				`${adresse} : la page d’erreur dit « ${attendu.titre} » et « ${attendu.phrase} »`,
				{
					404: reponse?.status() === 404,
					'le titre de l’onglet': (await page.title()) === attendu.titre,
					'le titre de la page': (await titre(page)) === attendu.titre,
					'la phrase': phrase === attendu.phrase
				},
				`« ${await page.title()} », « ${await titre(page)} », « ${phrase} »`
			);
			await auditer(page, `404 d’une organisation inconnue, ${langue}`);
		});
	}
	await langueDeLOrganisation(page);
}

/**
 * Sous une organisation connue, la langue que l'adresse demande, si l'organisation la publie, et
 * sa langue par défaut sinon (décisions du chef de projet, 27.09.2026).
 *
 * Le 404 d'abord. Une organisation dont la langue par défaut est le français ne distingue pas sa
 * langue du français que le site prend faute de mieux, l'ancien défaut (relecture du lot 4). Le
 * temps de ce 404, la base donne donc à la voisine l'arabe pour langue par défaut, à côté du
 * français ; aucun écran de la personne du parcours ne le peut, elle n'y est qu'éditrice. Une
 * adresse inventée sous `/en/` rend alors son 404 en arabe. Ses langues d'avant reviennent
 * ensuite : sa page d'abonnement demandée en anglais renvoie à la française, choix de l'appareil
 * gardé.
 */
async function langueDeLOrganisation(page) {
	const langues = ecrireDansLaBase(
		`select default_language || '|' || array_to_string(enabled_language, ',') from organization where slug = '${VOISINE.slug}'`
	);
	const [parDefaut = '', activees = ''] = langues.sortie.split('|');
	const enArabe = ecrireDansLaBase(
		`update organization set enabled_language = array['fr', 'ar'], default_language = 'ar' where slug = '${VOISINE.slug}'`
	);
	try {
		verifierChaque(
			`la base donne à « ${VOISINE.nom} » l’arabe pour langue par défaut, à côté du français, le temps d’un 404`,
			{
				'ses langues lues': langues.ok,
				'le français par défaut, avant': parDefaut === 'fr',
				'le français seul publié, avant': activees === 'fr',
				'l’arabe posé': enArabe.ok
			},
			`avant : ${langues.sortie} ; ${enArabe.sortie}`
		);
		await retour('19-404-organisation', async () => {
			const adresse = `/m/${VOISINE.slug}/en/nulle-part`;
			const reponse = await ouvrir(page, adresse);
			const attendu = TEXTES_PUBLICS.ar.introuvable;
			const phrase = await texteDe(page.locator('main p'));
			const lang = await racineDit(page, 'lang');
			const dir = await racineDit(page, 'dir');
			const titreLu = await titre(page);
			verifierChaque(
				`${adresse}, l’anglais, que l’organisation ne publie pas : le 404 est dans sa langue par défaut, l’arabe, et non en français, « ${attendu.titre} »`,
				{
					404: reponse?.status() === 404,
					'<html lang="ar">': lang === 'ar',
					'dir="rtl"': dir === 'rtl',
					[`« ${attendu.titre} »`]: titreLu === attendu.titre,
					[`« ${attendu.phrase} »`]: phrase === attendu.phrase
				},
				`rendu ${reponse?.status()}, <html lang="${lang}" dir="${dir}">, « ${titreLu} », « ${phrase} »`
			);
		});
	} finally {
		const remises = ecrireDansLaBase(
			`update organization set enabled_language = array['fr'], default_language = 'fr' where slug = '${VOISINE.slug}'`
		);
		verifier(
			`« ${VOISINE.nom} » retrouve ses langues, le français seul`,
			remises.ok,
			remises.sortie
		);
	}
	await retour('19-langue-non-activee', async () => {
		const demandee = `/m/${VOISINE.slug}/en/agenda?appareil=tous`;
		const attendue = `/m/${VOISINE.slug}/agenda?appareil=tous`;
		const brut = await fetch(`http://127.0.0.1:${PORT}${demandee}`, { redirect: 'manual' });
		const vers = brut.headers.get('location') ?? '';
		await ouvrir(page, demandee);
		const arrivee = new URL(page.url());
		const lang = await racineDit(page, 'lang');
		verifierChaque(
			`${demandee}, une langue que l’organisation ne publie pas : 307 vers ${attendue}, la page dans sa langue par défaut`,
			{
				307: brut.status === 307,
				[`vers ${attendue}`]:
					new URL(vers, ORIGINE).pathname + new URL(vers, ORIGINE).search === attendue,
				'le navigateur y arrive': arrivee.pathname + arrivee.search === attendue,
				'<html lang="fr">': lang === 'fr'
			},
			`rendu ${brut.status} vers « ${vers} » ; arrivée ${arrivee.pathname}${arrivee.search}, <html lang="${lang}">`
		);
	});
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
			verifierChaque(
				'reconnectée dans un autre navigateur réglé en français, elle retrouve l’italien de son compte',
				{
					'l’adresse /organisations': chemin(autre) === '/organisations',
					'<html lang="it">': (await racineDit(autre, 'lang')) === 'it',
					'le titre en italien': (await titre(autre)) === 'Le tue organizzazioni'
				},
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
			verifierChaque(
				'une langue choisie sur /connexion avant de demander le lien devient celle du compte : ouvert dans un autre navigateur, réglé en français, le lien arrive en allemand',
				{
					'le lien reçu': Boolean(lien),
					'l’adresse /organisations': chemin(arrivee) === '/organisations',
					'<html lang="de">': (await racineDit(arrivee, 'lang')) === 'de',
					'le titre en allemand': (await titre(arrivee)) === 'Ihre Organisationen'
				},
				`${lien ? 'lien reçu' : 'aucun lien'}, ${chemin(arrivee)}, <html lang="${await racineDit(arrivee, 'lang')}">, « ${await titre(arrivee)} »`
			);
			// Le lien portait la langue, et l'adresse où il arrive ne la porte plus : aucun écran ne
			// lit `?language=`, que la personne aurait gardé en copiant l'adresse (étape 19).
			await retour('19-adresse-sans-langue', async () => {
				const adresse = new URL(arrivee.url());
				verifierChaque(
					'le lien de connexion arrive à une adresse sans la langue qu’il portait : /organisations, sans « ?language= »',
					{
						'l’adresse /organisations': adresse.pathname === '/organisations',
						'sans « ?language= »': adresse.search === ''
					},
					`${adresse.pathname}${adresse.search}`
				);
			});
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
			verifierChaque(
				'à 390 px de large, axe ne relève rien de sérieux sur les trois réponses de l’écran des prières, heures servies comprises',
				{
					'sept jours servis': servies === 7,
					'rien de sérieux': graves.length === 0
				},
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
			verifierChaque(
				`à 390 px, supprimer « ${SALLE} », qu’un cours occupe, demande d’abord de confirmer, et la demande se voit sans défiler`,
				{
					'la demande': present,
					'elle nomme la salle': present && (await texteDe(confirmation)).includes(SALLE),
					'la demande rendue': boite !== null,
					'en haut de la fenêtre': boite !== null && boite.y >= 0,
					'le bouton rendu': bouton !== null,
					'le bouton sans défiler': bouton !== null && bouton.y + bouton.height <= TELEPHONE.height
				},
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
			verifierChaque(
				'à 390 px de large, axe ne relève rien de sérieux sur l’onglet « Prières », en français et en arabe, tableau de la semaine compris',
				{
					'le tableau de la semaine': semaines.every((nombre) => nombre === 1),
					'rien de sérieux': graves.length === 0
				},
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
 * (B1) ; le choix d'une prière, sur un nouveau cours, s'envoie heures vides, puis « après une
 * prière » y laisse partir 0 minute comme 180 (C3) ; une position hors de Suisse remplace la
 * localité enregistrée, puis la localité revient (C2).
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
			verifierChaque(
				'sans JavaScript, les options de chaque séance sont fermées au chargement, et aucun bouton « Annuler cette séance » ne se voit',
				{
					'au moins deux cartes': nombre >= 2,
					'toutes fermées': (await ouvertes()) === 0,
					'aucun bouton visible': (await boutonsDAnnulationVisibles(sans).count()) === 0
				},
				`${nombre} cartes, ${await ouvertes()} ouvertes, ${await boutonsDAnnulationVisibles(sans).count()} boutons visibles`
			);
			const premiere = options.first();
			await premiere.locator(':scope > summary').click();
			verifierChaque(
				'sans JavaScript, « Annuler ou déplacer » ouvre les options de sa carte, et d’elle seule',
				{
					'une seule ouverte': (await ouvertes()) === 1,
					'la sienne': await premiere.evaluate(
						(details) => /** @type {HTMLDetailsElement} */ (details).open
					),
					'son bouton visible': (await boutonsDAnnulationVisibles(premiere).count()) === 1,
					'un seul bouton visible': (await boutonsDAnnulationVisibles(sans).count()) === 1
				},
				`${await ouvertes()} ouverte(s), ${await boutonsDAnnulationVisibles(sans).count()} bouton(s) visible(s)`
			);
		});
		await retour('B1', async () => {
			await ouvrir(sans, '/vendredi');
			const ajout = sans.getByRole('region', { name: 'Ajouter une session' });
			await ajout.locator('input[name="start"]').fill(SECONDE_SESSION.debut);
			await ajout.locator('input[name="end"]').fill(SECONDE_SESSION.fin);
			const langues = ajout.locator('input[name="sermonLanguages"]');
			if ((await ajout.locator('input[name="sermonLanguages"]:checked').count()) === 0) {
				await langues.first().check();
			}
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
			verifierChaque(
				`sans JavaScript, une session du vendredi se supprime : ouvrir « Supprimer cette session », confirmer, et elle a disparu, « ${SESSION_SUPPRIMEE} »`,
				{
					'la session ajoutée': avant === 1,
					'elle a disparu': (await carte().count()) === 0,
					'« La session est supprimée. »': annonces.includes(SESSION_SUPPRIMEE)
				},
				`${avant} carte avant, ${await carte().count()} après ; ${annonces.map((texte) => `« ${texte} »`).join(', ') || 'aucun message'}`
			);
		});
		await retour('19-cours-sans-js', async () => {
			// Sans JavaScript, choisir une prière ne change pas la page : on l'envoie, et elle revient
			// avec les champs de la prière et ce qui manque. Les heures, vidées, ne doivent pas arrêter
			// le navigateur (étape 19, lot 3) : avant, elles étaient exigées, et il fallait taper des
			// heures qui ne servent à rien pour voir les champs de la prière. Le serveur refuse le cours
			// sans minutes ni durée : rien ne s'enregistre.
			await ouvrir(sans, '/cours/nouveau');
			const exigee = async (identifiant) =>
				sans
					.locator(`#${identifiant}`)
					.evaluate((champ) => /** @type {HTMLInputElement} */ (champ).required);
			const libres = !(await exigee('start')) && !(await exigee('end'));
			await sans.locator('#title-fr').fill('Cours à placer');
			await sans.locator('#start').fill('');
			await sans.locator('#end').fill('');
			await sans.locator('#timingKind').selectOption('beforePrayer');
			// Un envoi que le navigateur arrête ne recharge rien : on n'attend le chargement que cinq
			// secondes, et les champs de la page disent ensuite ce qui s'est passé.
			await Promise.all([
				sans.waitForEvent('load', { timeout: 5000 }).catch(() => undefined),
				sans.locator('form.colonne button[type="submit"]').click()
			]);
			await sans.waitForLoadState('networkidle');
			await lireLEcran(sans);
			const refus = (await sans.locator('[role="alert"] li').allTextContents()).map((phrase) =>
				phrase.replace(/\s+/g, ' ').trim()
			);
			verifierChaque(
				'sans JavaScript, « avant une prière » choisi sur un nouveau cours, heures vidées, s’envoie, et la page revient avec les champs de la prière et la phrase des minutes',
				{
					'les heures non exigées': libres,
					'les minutes à l’écran': (await sans.locator('#offsetMinutes').count()) === 1,
					'les heures retirées': (await sans.locator('#start').count()) === 0,
					'la phrase des minutes': refus.some((phrase) =>
						phrase.startsWith('Avant une prière : de 1 à 120 minutes')
					)
				},
				refus.map((phrase) => `« ${phrase} »`).join(', ') || 'aucun refus'
			);
			// La page est revenue pour « avant une prière ». Passer à « après une prière » ne la change
			// pas : le champ des minutes doit laisser partir 0 minute, juste après la prière, comme 180,
			// que les bornes d'avant la prière arrêtaient (relecture du lot 3). Rien n'est envoyé : le
			// navigateur dit seulement s'il laisserait partir la valeur.
			const minutes = sans.locator('#offsetMinutes');
			const aLEcran = (await minutes.count()) === 1;
			const bornes = aLEcran
				? await minutes.evaluate((champ) => {
						const saisie = /** @type {HTMLInputElement} */ (champ);
						return `${saisie.min} à ${saisie.max}`;
					})
				: 'aucun champ des minutes';
			const partirait = async (valeur) => {
				if (!aLEcran) return false;
				await minutes.fill(valeur);
				return minutes.evaluate((champ) => /** @type {HTMLInputElement} */ (champ).validity.valid);
			};
			await sans.locator('#timingKind').selectOption('prayer');
			const zero = await partirait('0');
			const centQuatreVingts = await partirait('180');
			verifierChaque(
				'sans JavaScript, « après une prière » choisi sur la page revenue pour « avant une prière » laisse partir 0 minute comme 180',
				{
					'les bornes des deux choix, de 0 à 240': bornes === '0 à 240',
					'0 minute que le navigateur laisse partir': zero,
					'180 minutes que le navigateur laisse partir': centQuatreVingts
				},
				`bornes ${bornes} ; 0 ${zero ? 'part' : 'arrêté'} ; 180 ${centQuatreVingts ? 'part' : 'arrêté'}`
			);
		});
		await datesPrecisesSansScript(sans);
		await horsDeSuisseSansScript(sans);
	} finally {
		await contexte.close();
	}
}

/**
 * Sans JavaScript, un cours à dates précises (étape 19, lot 2) : choisir « à des dates précises »
 * ne change pas la page, qu'on envoie une première fois pour recevoir le champ des dates. Les dates
 * tapées dans le désordre, le premier jour laissé vide, le cours s'enregistre avec la première date
 * pour premier jour. Puis la responsable le supprime, sans script aussi (D3) : le repli s'ouvre, et
 * « Oui, supprimer » le retire. Le cours reste en brouillon : rien n'en paraît en public.
 */
async function datesPrecisesSansScript(sans) {
	const dates = [plusJours(T, 81), plusJours(T, 74)];
	await retour('19-cours-premier-jour', async () => {
		await ouvrir(sans, '/cours/nouveau');
		await sans.locator('#title-fr').fill(DATES_SANS_SCRIPT);
		await sans.locator('#recurrenceKind').selectOption('dates');
		// Le premier envoi ne crée rien : il ramène la page avec le champ des dates. Un navigateur qui
		// exigeait le premier jour arrêtait cet envoi, et le serveur ne voyait jamais le premier jour
		// vide : c'est l'ancien comportement, un geste impossible ici.
		await Promise.all([
			sans.waitForEvent('load', { timeout: 5000 }).catch(() => undefined),
			sans.locator('form.colonne button[type="submit"]').click()
		]);
		await sans.waitForLoadState('networkidle');
		const champ = await exiger(sans.locator('#dates'), 'le champ « Dates, une par ligne »');
		const premierJourExige = await sans
			.locator('#startsOn')
			.evaluate((date) => /** @type {HTMLInputElement} */ (date).required);
		await champ.fill(dates.map(dateSuisse).join('\n'));
		await sans.locator('#startsOn').fill('');
		await envoyer(sans, sans.locator('form.colonne button[type="submit"]'));
		const bloc = sans.locator('li').filter({ hasText: DATES_SANS_SCRIPT });
		const enregistre = chemin(sans) === '/cours' && (await bloc.count()) === 1;
		// Sans JavaScript, le lien reste relatif, tel que le serveur l'écrit : c'est l'adresse résolue
		// qu'on suit.
		const modifier = bloc.getByRole('link', { name: 'Modifier ce cours', exact: true });
		const fiche =
			enregistre && (await modifier.count()) === 1 ? await cheminDuLien(modifier) : null;
		if (fiche) await ouvrir(sans, fiche);
		const premierJour = fiche ? await sans.locator('#startsOn').inputValue() : '';
		verifierChaque(
			`sans JavaScript, un cours à dates précises tapées dans le désordre, le premier jour vide : il s’enregistre, avec la première date, ${dateSuisse(dates[1] ?? '')}, pour premier jour`,
			{
				'le premier jour pas exigé': !premierJourExige,
				'le cours enregistré': enregistre,
				'la première date pour premier jour': premierJour === dates[1]
			},
			`${chemin(sans)} ; premier jour « ${premierJour || 'aucun'} »`
		);
	});
	await retour('19-D3', async () => {
		await ouvrir(sans, '/cours');
		const bloc = sans.locator('li').filter({ hasText: DATES_SANS_SCRIPT });
		const repli = await exiger(
			bloc.locator('details').filter({
				has: sans.locator('summary', { hasText: 'Supprimer ce cours' })
			}),
			'le repli « Supprimer ce cours »'
		);
		await repli.locator(':scope > summary').click();
		const ouvert = await repli.evaluate(
			(details) => /** @type {HTMLDetailsElement} */ (details).open
		);
		await envoyer(sans, repli.getByRole('button', { name: 'Oui, supprimer', exact: true }));
		const statut = (await sans.getByRole('status').allTextContents()).map((texte) => texte.trim());
		verifierChaque(
			'sans JavaScript, « Supprimer ce cours » s’ouvre, et « Oui, supprimer » retire le cours',
			{
				'le repli s’ouvre sans script': ouvert,
				'« Le cours est supprimé. »': statut.includes('Le cours est supprimé.'),
				'le cours a quitté la liste':
					(await sans.locator('li').filter({ hasText: DATES_SANS_SCRIPT }).count()) === 0
			},
			statut.map((texte) => `« ${texte} »`).join(', ') || 'aucun message'
		);
	});
}

/**
 * Sans JavaScript, la localité de Bienne enregistrée et cochée (C2) : une position tapée sous le
 * repli « Hors de Suisse », la case « Hors de Suisse » cochée, s'enregistre à la place de la
 * localité, et les heures servies sont celles que le calcul donne pour cette position. Ensuite, la
 * localité est cherchée, cochée et enregistrée de nouveau : l'écran la nomme, et les heures
 * redeviennent celles que le calcul donne pour sa position dans la liste. Depuis l'étape 19, la
 * position tapée l'emporte aussi sans toucher à la liste : le serveur coche lui-même « Hors de
 * Suisse ». La localité est enregistrée une dernière fois pour la suite. Les heures attendues sont
 * calculées pour les jours que le tableau montre. Enfin, la latitude seule vidée, l'aperçu demandé
 * revient avec l'erreur et le repli « Hors de Suisse » ouvert, sans rien enregistrer.
 */
async function horsDeSuisseSansScript(sans) {
	const enregistrer = () =>
		envoyer(sans, sans.getByRole('button', { name: 'Enregistrer', exact: true }));
	const confirmation = async () =>
		(await sans.getByRole('status').count()) > 0
			? texteDe(sans.getByRole('status'))
			: 'aucune confirmation';
	const etatLu = () => texteDe(sans.locator('section', { has: sans.locator('#etat-titre') }));
	/** Les jours servis, et leurs écarts au calcul pour cette position, avec les réglages de l'écran. */
	const servies = async (position) => {
		const jours = await heuresDuTableau(
			sans.locator('section', { has: sans.locator('#servies-titre') }).locator('tbody tr'),
			'.soleil'
		);
		const calculees = heuresCalculees(
			jours.map((jour) => jour.date).filter(Boolean),
			await reglageEnregistre(sans, position)
		);
		return { jours, ecarts: ecartsAuCalcul(jours, calculees) };
	};
	const paris = {
		latitude: Number(POSITION_HORS_DE_SUISSE.latitude),
		longitude: Number(POSITION_HORS_DE_SUISSE.longitude)
	};
	const localiteNommee = `Vos heures sont calculées pour cette localité : ${LOCALITE.libelle}`;
	const caseHors = sans.getByRole('radio', { name: CHOIX_HORS_DE_SUISSE, exact: true });
	/** La position tapée sous le repli, la case « Hors de Suisse » cochée ou non, puis enregistrée. */
	const taperLaPosition = async (cocher) => {
		await repliNomme(sans, REPLIS_DES_PRIERES.horsDeSuisse).locator(':scope > summary').click();
		await sans.locator('#latitude').fill(POSITION_HORS_DE_SUISSE.latitude);
		await sans.locator('#longitude').fill(POSITION_HORS_DE_SUISSE.longitude);
		if (cocher) await caseHors.check();
		await enregistrer();
	};
	/** La localité, cherchée, cochée et enregistrée de nouveau. */
	const revenirALaLocalite = async () => {
		await sans.getByLabel('Nom ou NPA de la localité', { exact: true }).fill(LOCALITE.nom);
		await envoyer(sans, sans.getByRole('button', { name: 'Chercher', exact: true }));
		await radioDeLaLocalite(sans).check();
		await enregistrer();
	};
	await retour('C2', async () => {
		await ouvrir(sans, '/prieres?source=computed');
		await taperLaPosition(true);
		const dite = await confirmation();
		const ailleurs = await etatLu();
		const { jours: lues, ecarts } = await servies(paris);
		verifierChaque(
			`sans JavaScript, ${LOCALITE.nom} enregistrée, la position ${POSITION_HORS_DE_SUISSE.latitude}, ${POSITION_HORS_DE_SUISSE.longitude} tapée sous « Hors de Suisse », cette case cochée, s’enregistre à sa place : l’écran le dit, et les heures servies sont celles de cette position`,
			{
				'« Réglages enregistrés. »': dite.startsWith('Réglages enregistrés.'),
				'l’écran dit la position donnée': ailleurs.includes(POSITION_DONNEE),
				'les heures de cette position': lues.length === 7 && ecarts.length === 0
			},
			`« ${dite} » ; ${ailleurs.slice(0, 120)} ; ${ecarts.slice(0, 1).join('') || `${lues.length} jour(s) servis`}`
		);

		await revenirALaLocalite();
		const revenue = await etatLu();
		const { jours: luesApres, ecarts: ecartsApres } = await servies(positionDeLaListe());
		verifierChaque(
			`sans JavaScript, de cette position, ${LOCALITE.nom} se cherche, se coche et s’enregistre de nouveau : l’écran nomme la localité, et les heures redeviennent les siennes`,
			{
				'la position hors de Suisse était enregistrée': ailleurs.includes(POSITION_DONNEE),
				'l’écran nomme la localité': revenue.includes(localiteNommee),
				'les heures de la localité': luesApres.length === 7 && ecartsApres.length === 0
			},
			`« ${await confirmation()} » ; ${revenue.slice(0, 120)} ; ${ecartsApres.slice(0, 1).join('') || `${luesApres.length} jour(s) servis`}`
		);
	});
	await retour('19-prieres-hors-de-suisse', async () => {
		await ouvrir(sans, '/prieres?source=computed');
		// La case « Hors de Suisse » est offerte, mais la personne ne la coche pas : la case de la
		// localité reste cochée, et la position tapée doit l'emporter quand même.
		const caseOfferte = (await caseHors.count()) === 1;
		const cocheesAvant = await casesCochees(sans);
		await taperLaPosition(false);
		const dite = await confirmation();
		const ailleurs = await etatLu();
		const { jours: lues, ecarts } = await servies(paris);
		verifierChaque(
			`sans JavaScript, ${LOCALITE.nom} enregistrée et cochée, la position tapée sous « Hors de Suisse », sans toucher à la liste, s’enregistre à sa place : l’écran le dit, et les heures servies sont celles de cette position`,
			{
				'la case « Hors de Suisse » dans la liste': caseOfferte,
				[`${LOCALITE.nom} seule cochée avant la frappe`]:
					cocheesAvant.length === 1 && cocheesAvant[0].startsWith(`${LOCALITE.npa}|`),
				'« Réglages enregistrés. »': dite.startsWith('Réglages enregistrés.'),
				'l’écran dit la position donnée': ailleurs.includes(POSITION_DONNEE),
				'les heures de cette position': lues.length === 7 && ecarts.length === 0
			},
			`« ${dite} » ; ${ailleurs.slice(0, 120)} ; ${ecarts.slice(0, 1).join('') || `${lues.length} jour(s) servis`}`
		);
	});
	// Hors de tout retour : la localité, de nouveau, pour les heures de la suite du parcours.
	await ouvrir(sans, '/prieres?source=computed');
	await revenirALaLocalite();
	const revenue = await etatLu();
	verifier(
		`sans JavaScript, ${LOCALITE.nom} est enregistrée de nouveau pour la suite du parcours`,
		revenue.includes(localiteNommee),
		revenue.slice(0, 120)
	);
	// La localité enregistrée et cochée, la latitude seule vidée sous « Hors de Suisse » : la position
	// tapée n'a qu'un nombre, et le serveur la refuse. L'écran revient avec « Hors de Suisse » cochée
	// et ce repli ouvert, sur le champ dont parle l'erreur. Il revenait le repli fermé : une régression
	// de la correction elle-même, faite puis corrigée pendant l'étape 19. « Voir l’aperçu »
	// n'enregistre rien : la localité reste celle de la suite.
	await retour('19-prieres-hors-de-suisse', async () => {
		await ouvrir(sans, '/prieres?source=computed');
		const repli = repliNomme(sans, REPLIS_DES_PRIERES.horsDeSuisse);
		await repli.locator(':scope > summary').click();
		const longitude = await sans.locator('#longitude').inputValue();
		await sans.locator('#latitude').fill('');
		await envoyer(sans, sans.getByRole('button', { name: 'Voir l’aperçu', exact: true }));
		const erreurs = (await sans.locator('main [role="alert"]').allTextContents()).map((texte) =>
			texte.replace(/\s+/g, ' ').trim()
		);
		const lues = {
			latitude: await sans.locator('#latitude').inputValue(),
			longitude: await sans.locator('#longitude').inputValue()
		};
		const cochees = await casesCochees(sans);
		verifierChaque(
			`sans JavaScript, ${LOCALITE.nom} enregistrée et cochée, la latitude seule vidée sous « Hors de Suisse » : l’écran revient avec l’erreur « Donnez la latitude et la longitude, ou aucune des deux. », « Hors de Suisse » cochée, et ce repli ouvert sur la longitude gardée`,
			{
				[`la longitude de ${LOCALITE.nom} dans le champ, avant l’envoi`]: longitude !== '',
				'l’erreur': erreurs.includes('Donnez la latitude et la longitude, ou aucune des deux.'),
				'« Hors de Suisse » cochée': cochees.includes(''),
				'une seule case cochée': cochees.length === 1,
				'le repli « Hors de Suisse » ouvert': await estOuvert(repli),
				'la latitude vide': lues.latitude === '',
				'la longitude gardée': lues.longitude === longitude
			},
			`${erreurs.map((texte) => `« ${texte} »`).join(', ') || 'aucune erreur'} ; cochées : ${cochees.map((valeur) => valeur || 'Hors de Suisse').join(', ') || 'aucune'} ; latitude « ${lues.latitude} », longitude « ${lues.longitude} »`
		);
	});
}

/** Une période au nom de soixante signes, le plus long que le champ accepte (étape 19). */
const PERIODE_AU_NOM_LONG = 'Horaires d’hiver de la grande salle, rue du Marché 12, Nidau';
/** La marque d'une copie pour l'année suivante, dans l'écran en français. */
const ANNEE_SUIVANTE = ' (année suivante)';

/**
 * Les périodes des heures saisies à la main, ce que l'étape 19 y a changé, avant toute autre
 * période. L'aperçu d'une nouvelle période vient sous un titre de niveau 3, et axe n'y relève plus
 * « heading-order » (D5) ; celui d'une période déjà terminée le dit. En arabe, l'aide de « Ajouter
 * une période » dit que ses valeurs viennent de la précédente (B7). Une période au nom de soixante
 * signes se copie pour l'année suivante avec la marque entière, le nom raccourci. Les périodes
 * enregistrées ici sont supprimées à la fin.
 */
async function periodesEtape19(page) {
	const nouvelle = () => page.locator('details', { has: page.locator('#nom-nouvelle') });
	const ouvrirLaNouvelle = async () => {
		const repli = await exiger(nouvelle(), 'le repli « Ajouter une période »');
		if (!(await repli.evaluate((details) => /** @type {HTMLDetailsElement} */ (details).open))) {
			await repli.locator(':scope > summary').click();
		}
	};
	const remplir = async (nom, de, a) => {
		await ouvrir(page, '/prieres?source=manual');
		await ouvrirLaNouvelle();
		await page.locator('#nom-nouvelle').fill(nom);
		await page.locator('#de-nouvelle').fill(de);
		await page.locator('#a-nouvelle').fill(a);
	};
	const formulaire = () => page.locator('form', { has: page.locator('#nom-nouvelle') });
	const apercu = async (nom, de, a) => {
		await remplir(nom, de, a);
		await envoyer(page, formulaire().locator('button[formaction$="/apercuPeriode"]'));
	};

	await retour('19-D5', async () => {
		await apercu('Aperçu', T, plusJours(T, 30));
		const titre = page.locator('#apercu-periode-titre-nouvelle');
		const niveau =
			(await titre.count()) === 1 ? await titre.evaluate((element) => element.tagName) : 'aucun';
		const niveaux = await page
			.locator('h1, h2, h3, h4, h5, h6')
			.evaluateAll((titres) => titres.map((element) => element.tagName.toLowerCase()).join(', '));
		const nom = 'aperçu d’une nouvelle période, sans autre période';
		await auditer(page, nom, { recharger: false });
		const ordre = trouvaillesAxe.filter(
			(trouvaille) => trouvaille.page === nom && trouvaille.regle === 'heading-order'
		);
		verifierChaque(
			'sans autre période, l’aperçu d’une nouvelle période vient sous un titre de niveau 3, et axe n’y relève plus « heading-order »',
			{
				'un titre de niveau 3': niveau === 'H3',
				'aucun « heading-order »': ordre.length === 0
			},
			`<${niveau.toLowerCase()}> ; titres : ${niveaux} ; ${ordre.length} « heading-order »`
		);
	});
	await retour('19-prieres-periode-passee', async () => {
		const fin = plusJours(T, -30);
		await apercu('Passée', plusJours(T, -60), fin);
		const phrase = page.locator('p.aide').filter({ hasText: /^Cette période s’est terminée le/ });
		const lue = (await phrase.count()) === 1 ? await texteDe(phrase) : '';
		verifier(
			`l’aperçu d’une période terminée le ${dateSuisse(fin)} le dit : « Cette période s’est terminée le ${dateSuisse(fin)} : elle ne change aucun des sept prochains jours, que l’aperçu montre. »`,
			lue ===
				`Cette période s’est terminée le ${dateSuisse(fin)} : elle ne change aucun des sept prochains jours, que l’aperçu montre.`,
			lue || 'aucune phrase'
		);
	});

	// Une période enregistrée, loin des sept prochains jours : l'aide de la suivante et la copie.
	await remplir(PERIODE_AU_NOM_LONG, plusJours(T, 120), plusJours(T, 150));
	await envoyer(page, formulaire().locator('button.principal'));
	const noms = async () =>
		(await page.locator('div.periode h3 bdi').allTextContents()).map((texte) => texte.trim());
	verifier(
		`la période « ${PERIODE_AU_NOM_LONG} » (${[...PERIODE_AU_NOM_LONG].length} signes) est enregistrée`,
		(await noms()).includes(PERIODE_AU_NOM_LONG),
		(await noms()).map((nom) => `« ${nom} »`).join(', ') || 'aucune période'
	);
	await retour('19-B7', async () => {
		await ouvrir(page, '/prieres?source=manual');
		await choisirLaLangue(page, 'ar');
		const aide = await texteDe(
			await exiger(nouvelle().locator(':scope > p.aide'), 'l’aide de « Ajouter une période »')
		);
		verifier(
			'en arabe, après une période, l’aide de « Ajouter une période » dit que ses valeurs sont « مُعبّأة مسبقًا »',
			aide.includes('مُعبّأة مسبقًا'),
			aide
		);
	});
	if ((await racineDit(page, 'lang')) !== 'fr') await choisirLaLangue(page, 'fr');
	await retour('19-prieres-copie', async () => {
		await ouvrir(page, '/prieres?source=manual');
		await envoyer(
			page,
			page
				.locator('div.periode')
				.filter({ has: page.locator('h3 bdi').getByText(PERIODE_AU_NOM_LONG, { exact: true }) })
				.locator('form[action$="/dupliquerPeriode"] button[type="submit"]')
		);
		const copie = (await noms()).find((nom) => nom !== PERIODE_AU_NOM_LONG) ?? '';
		const debut = copie.endsWith(ANNEE_SUIVANTE) ? copie.slice(0, -ANNEE_SUIVANTE.length) : '';
		verifierChaque(
			`une période au nom de soixante signes se copie pour l’année suivante : la marque « ${ANNEE_SUIVANTE.trim()} » entière, le nom raccourci, soixante signes au plus`,
			{
				'la marque entière': debut !== '',
				'le début du nom': debut !== '' && PERIODE_AU_NOM_LONG.startsWith(debut),
				'soixante signes au plus': [...copie].length <= 60
			},
			`« ${copie || 'aucune copie'} », ${[...copie].length} signes`
		);
	});
	// Toutes les périodes de l'écran sont celles de ce pas : elles s'en vont.
	await ouvrir(page, '/prieres?source=manual');
	for (let reste = await page.locator('div.periode').count(); reste > 0; reste -= 1) {
		await envoyer(
			page,
			page
				.locator('div.periode')
				.first()
				.locator('form[action$="/supprimerPeriode"] button[type="submit"]')
		);
	}
	verifier(
		'les périodes de ce pas sont supprimées',
		(await page.locator('div.periode').count()) === 0
	);
}

/**
 * l. Une période préparée à l'avance, copiée pour l'année suivante depuis l'écran en allemand : la
 * copie est nommée dans cette langue (D2). Les deux périodes sont ensuite supprimées, et l'écran
 * revient au français.
 */
async function periodeCopiee(page) {
	etape('l. Une période copiée pour l’année suivante, depuis l’écran en allemand');
	await periodesEtape19(page);
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
 * seule fois (B1), en nommant la prière dans chaque langue (D1), avec les mots d'une prière et non
 * ceux d'un cours (étape 19) ; le programme de la semaine la marque d'une nouvelle heure, dans
 * chaque langue (B1). Deux onglets, ouverts avant ce déplacement sur « À venir » et sur l'écran du
 * vendredi, renvoient ensuite leur carte restée telle quelle : chaque écran le refuse, et rien n'est
 * écrit (A2) ; « À venir » nomme la séance dans son refus (étape 19, D4).
 */
async function vendrediSurLAccueil(page) {
	etape(
		'm. « À venir » : la session du vendredi, ses messages, un changement d’heure, des cartes restées ouvertes'
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
		verifierChaque(
			`sur « À venir », le programme de la semaine nomme la session du vendredi dans la langue de chaque message : ${NOMS_TRADUITS}`,
			{
				'un message par langue': semaine.length === LANGUES.length,
				'le nom de la prière dans chaque langue': fautifs.length === 0
			},
			lignesDuVendredi(semaine, fautifs, VENDREDI.debut) || `${semaine.length} message(s)`
		);
	});
	// Deux onglets, ouverts avant le déplacement : « À venir » et l'écran du vendredi. Leurs cartes
	// restent celles d'une séance prévue.
	const ouvertAvant = await page.context().newPage();
	const vendrediOuvert = await page.context().newPage();
	try {
		await ouvrir(ouvertAvant, '/');
		await ouvrir(vendrediOuvert, '/vendredi');
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
			verifierChaque(
				`déplacée le même jour de ${VENDREDI.debut} à ${HEURE_DU_VENDREDI_DEPLACE}, la session du vendredi porte sur sa carte « nouvelle heure » et « ${prevueA} »`,
				{
					'« nouvelle heure »': marque === 'nouvelle heure',
					'l’heure prévue à l’origine': lue.includes(prevueA)
				},
				lue
			);
			const messagesDuDeplacement = await messagesDeLAccueil(page, 'message');
			const francais =
				messagesDuDeplacement[0]?.lang === 'fr' ? messagesDuDeplacement[0].texte : '';
			const ligneDuVendredi =
				francais.split('\n').find((ligne) => ligne.includes(nom)) ?? 'aucun message en français';
			await retour('B1', async () => {
				const changement = `commence à ${HEURE_DU_VENDREDI_DEPLACE} au lieu de ${VENDREDI.debut}.`;
				verifierChaque(
					`le message prêt à coller le dit comme un changement d’heure, la date une seule fois : « … ${changement} »`,
					{
						'le changement d’heure': francais.includes(changement),
						'pas « est déplacé au »': !francais.includes('est déplacé au'),
						'la date une seule fois': francais.split(dateSuisse(jour)).length === 2
					},
					ligneDuVendredi
				);
			});
			// Les mots d'une prière, et non ceux d'un cours (étape 19).
			await retour('19-texte-vendredi', async () => {
				const phrase = `« ${nom} » : la prière du ${dateLongue(jour)} commence à ${HEURE_DU_VENDREDI_DEPLACE} au lieu de ${VENDREDI.debut}.`;
				verifierChaque(
					`déplacée le même jour, la session du vendredi : le message dit « « Prière du vendredi » : la prière du vendredi JJ.MM.AAAA commence à ${HEURE_DU_VENDREDI_DEPLACE} au lieu de ${VENDREDI.debut}. », sans « Le cours »`,
					{
						'la prière et sa nouvelle heure': francais.includes(phrase),
						'sans « Le cours »': francais !== '' && !francais.includes('Le cours')
					},
					ligneDuVendredi
				);
			});
			await retour('D1', async () => {
				const messages = await messagesDeLAccueil(page, 'message');
				const fautifs = sansLeNomDeLaPriere(messages);
				verifierChaque(
					`ce message nomme la session du vendredi dans la langue de chaque message : ${NOMS_TRADUITS}`,
					{
						'un message par langue': messages.length === LANGUES.length,
						'le nom de la prière dans chaque langue': fautifs.length === 0
					},
					lignesDuVendredi(messages, fautifs, HEURE_DU_VENDREDI_DEPLACE) ||
						`${messages.length} message(s)`
				);
			});
			// Le programme de la semaine, sur l'écran rendu après le déplacement : la ligne de la
			// session, à sa nouvelle heure, finit par la marque d'une nouvelle heure, dans sa langue.
			await retour('B1', async () => {
				const semaine = await messagesDeLAccueil(page, 'semaine');
				const lignes = LANGUES.map((langue) => {
					const texte = semaine.find((lu) => lu.lang === langue)?.texte ?? '';
					const ligne = texte
						.split('\n')
						.find((une) => une.includes(`${HEURE_DU_VENDREDI_DEPLACE} – `));
					return {
						langue,
						ligne: ligne?.trim() ?? '',
						marque: NOUVELLE_HEURE_DANS_LA_SEMAINE[langue]
					};
				});
				verifierChaque(
					`le programme de la semaine dit la session déplacée le même jour comme une nouvelle heure, dans chaque langue : ${lignes.map((lu) => `« ${lu.marque} »`).join(', ')}`,
					Object.fromEntries(
						lignes.map((lu) => [`« ${lu.marque} » en ${lu.langue}`, lu.ligne.endsWith(lu.marque)])
					),
					lignes
						.filter((lu) => lu.langue === 'fr' || !lu.ligne.endsWith(lu.marque))
						.map(
							(lu) => `${lu.langue} : ${lu.ligne || `aucune ligne à ${HEURE_DU_VENDREDI_DEPLACE}`}`
						)
						.join(' ; ')
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
			const messagesPrepares = await ouvertAvant.locator('#message-titre').count();
			const arrivees = await carte(ouvertAvant, 'moved_here').count();
			verifierChaque(
				`une carte restée ouverte dans un autre onglet, envoyée après ce déplacement, est refusée par une phrase en haut, et rien n’est écrit : la session reste à ${HEURE_DU_VENDREDI_DEPLACE}`,
				{
					'une phrase de refus': / a changé depuis l’ouverture de la page /.test(phrase),
					'le refus en haut': enHaut,
					'aucun message préparé': messagesPrepares === 0,
					[`la session à ${HEURE_DU_VENDREDI_DEPLACE}`]: departLu.includes(
						`Déplacée au ${dateLongue(jour)} à ${HEURE_DU_VENDREDI_DEPLACE}`
					),
					'une seule carte d’arrivée': arrivees === 1
				},
				`« ${phrase} », ${enHaut ? 'avant' : 'pas avant'} le premier jour ; ${messagesPrepares} message(s) préparé(s) ; ${departLu} ; ${arrivees} carte(s) d’arrivée`
			);
			// La phrase nomme la séance par son titre et sa date (étape 19, D4).
			await retour('19-D4', async () => {
				verifier(
					'sur « À venir », le refus d’une carte restée ouverte nomme la séance : « La séance « Prière du vendredi » du vendredi JJ.MM.AAAA a changé depuis l’ouverture de la page : … »',
					phrase === SEANCE_CHANGEE(nom, dateLongue(jour)),
					phrase
				);
			});
			// L'écran du vendredi, ouvert lui aussi avant le déplacement, annule la séance qu'il montre
			// encore prévue à son heure habituelle.
			const seanceDuVendredi = (cible) =>
				cible
					.locator('section[aria-labelledby="ce-vendredi"] div.seance')
					.filter({ hasText: `${VENDREDI.debut} – ${VENDREDI.fin}` })
					.filter({ hasText: dateLongue(jour) });
			await envoyer(
				vendrediOuvert,
				seanceDuVendredi(vendrediOuvert).getByRole('button', {
					name: 'Annuler cette session',
					exact: true
				})
			);
			const alertes = vendrediOuvert.getByRole('alert');
			const refusDuVendredi =
				(await alertes.count()) === 1
					? await texteDe(alertes)
					: `${await alertes.count()} alerte(s)`;
			// En tête : avant la première carte de session.
			const enTete =
				(await alertes.count()) === 1 &&
				(await alertes.evaluate((alerte) => {
					const premiere = document.querySelector('section.session');
					return Boolean(
						premiere && alerte.compareDocumentPosition(premiere) & Node.DOCUMENT_POSITION_FOLLOWING
					);
				}));
			const confirmations = await vendrediOuvert.getByRole('status').count();
			const seance = seanceDuVendredi(vendrediOuvert);
			const seanceLue =
				(await seance.count()) === 1
					? await texteDe(seance)
					: `${await seance.count()} séance(s) à ${VENDREDI.debut} dans « Ce vendredi »`;
			verifierChaque(
				`sur l’écran du vendredi, une carte restée ouverte dans un autre onglet, envoyée après ce déplacement (« Annuler cette session »), est refusée par une phrase en tête, et rien n’est écrit : la session reste déplacée à ${HEURE_DU_VENDREDI_DEPLACE}`,
				{
					'la phrase du refus': refusDuVendredi === SESSION_CHANGEE,
					'le refus en tête': enTete,
					'aucune confirmation': confirmations === 0,
					[`la session déplacée à ${HEURE_DU_VENDREDI_DEPLACE}`]: seanceLue.includes(
						`Déplacée au ${dateLongue(jour)} à ${HEURE_DU_VENDREDI_DEPLACE}`
					)
				},
				`« ${refusDuVendredi} », ${enTete ? 'avant' : 'pas avant'} la première session ; ${confirmations} confirmation(s) ; ${seanceLue}`
			);
		});
	} finally {
		await ouvertAvant.close();
		await vendrediOuvert.close();
	}
	await vendrediAnnule(page);
}

/**
 * La session du vendredi, rétablie à son heure, puis annulée pour ce vendredi sur « À venir »
 * (étape 19) : le message prêt à coller parle d'une prière, et dit que les autres ont lieu comme
 * d'habitude, sans les mots d'un cours. La page publique la marque « Annulée », accordé à la
 * prière, dans la vue Semaine, dans l'onglet « Prières » et dans la vue Mois, dans les cinq
 * langues. La session est rétablie à la fin.
 */
async function vendrediAnnule(page) {
	const nom = PRIERE_DU_VENDREDI.fr;
	const jour = VENDREDI_QUI_VIENT;
	const carte = (statut) =>
		page
			.locator('section', { has: page.locator(`[id="jour-${jour}"]`) })
			.locator(`li.${statut}`)
			.filter({ hasText: nom });
	await ouvrir(page, '/');
	await envoyer(
		page,
		carte('moved_away').locator('form[action="?/retablir"] button[type="submit"]')
	);
	verifier(
		`la session du vendredi retrouve son heure habituelle, ${VENDREDI.debut}`,
		(await carte('scheduled').count()) === 1,
		`${await carte('scheduled').count()} carte(s) prévue(s)`
	);
	await carte('scheduled').getByText('Annuler ou déplacer', { exact: true }).click();
	await envoyer(
		page,
		carte('scheduled').getByRole('button', { name: 'Annuler cette séance', exact: true })
	);
	verifier(
		'annulée sur « À venir », la session du vendredi porte « annulée »',
		(await carte('cancelled').count()) === 1,
		`${await carte('cancelled').count()} carte(s) annulée(s)`
	);
	await retour('19-texte-vendredi', async () => {
		const messages = await messagesDeLAccueil(page, 'message');
		const francais = messages.find((message) => message.lang === 'fr')?.texte ?? '';
		const annonce = `« ${nom} » : la prière du ${dateLongue(jour)} est annulée.`;
		verifierChaque(
			'annulée, la session du vendredi : le message dit « « Prière du vendredi » : la prière du vendredi JJ.MM.AAAA est annulée. », puis « Les autres prières du vendredi ont lieu comme d’habitude. », sans « Le cours »',
			{
				'la prière annulée': francais.includes(annonce),
				'les autres prières du vendredi': francais.includes(
					'Les autres prières du vendredi ont lieu comme d’habitude.'
				),
				'sans « Le cours »': francais !== '' && !francais.includes('Le cours')
			},
			francais.split('\n').filter(Boolean).slice(1, 3).join(' | ') || 'aucun message en français'
		);
	});
	await retour('19-annulee', async () => {
		const contexte = await nouveauContexte(
			/** @type {import('playwright-core').Browser} */ (page.context().browser())
		);
		try {
			const visiteur = await contexte.newPage();
			const marques = {};
			for (const langue of LANGUES) {
				const titreDeLaSession = PRIERE_DU_VENDREDI[langue];
				const annulee = ANNULEE_DU_VENDREDI[langue];
				const base = `/m/${ORGANISATION.slug}${langue === 'fr' ? '' : `/${langue}`}`;
				await ouvrir(visiteur, base);
				const semaine = (await seancesPubliques(visiteur, titreDeLaSession)).find(
					(vue) => vue.barree
				);
				await ouvrir(visiteur, `${base}?vue=prieres`);
				const prieres = await texteDe(visiteur.locator('table.semaine'));
				await ouvrir(visiteur, `${base}?vue=mois&mois=${jour.slice(0, 7)}&jour=${jour}`);
				const mois = (await seancesPubliques(visiteur, titreDeLaSession)).find((vue) => vue.barree);
				marques[langue] = {
					annulee,
					semaine: semaine?.mention ?? 'absente',
					prieres: prieres.includes(annulee),
					mois: mois?.mention ?? 'absente'
				};
			}
			verifierChaque(
				'annulée, la session du vendredi porte, dans les cinq langues, « Annulée », « Abgesagt », « Annullata », « Cancelled » et « ملغاة », accordé à la prière, dans la vue Semaine, l’onglet « Prières » et la vue Mois',
				Object.fromEntries(
					Object.entries(marques).flatMap(([langue, lu]) => [
						[`vue Semaine, ${langue}`, lu.semaine === lu.annulee],
						[`onglet « Prières », ${langue}`, lu.prieres],
						[`vue Mois, ${langue}`, lu.mois === lu.annulee]
					])
				),
				Object.entries(marques)
					.map(([langue, lu]) => `${langue} : « ${lu.semaine} », « ${lu.mois} »`)
					.join(' ; ')
			);
		} finally {
			await contexte.close();
		}
	});
	await ouvrir(page, '/');
	await envoyer(
		page,
		carte('cancelled').locator('form[action="?/retablir"] button[type="submit"]')
	);
	verifier(
		'la session du vendredi est rétablie pour la suite du parcours',
		(await carte('scheduled').count()) === 1,
		`${await carte('scheduled').count()} carte(s) prévue(s)`
	);
}

/**
 * Le vendredi, le Dhuhr d'un cours placé après lui est l'heure de la dernière session publiée
 * (ADR 0033). Une session en brouillon ne la donne pas : elle n'a pas encore lieu (étape 19,
 * relecture de D4). Pendant que la seconde session de l'étape p, à 14:30, est en brouillon, un
 * cours publié « 30 min après Dhuhr » commence donc à 13:00, après la session de 12:30 : sur sa
 * carte d'« À venir », dans le programme de la semaine de chaque langue, et dans le message de son
 * déplacement le même jour. Sa carte et ce message disaient 15:00, l'heure tirée du brouillon, que
 * la page publique ne montre pas. Le cours est supprimé ensuite.
 */
async function coursApresDhuhr(page) {
	const jour = VENDREDI_QUI_VIENT;
	const { titre: nom, minutes, duree, deplace } = COURS_APRES_DHUHR;
	const id = await creerCours(page, {
		titre: nom,
		public: 'open',
		jour: jourDeSemaine(jour),
		ancre: { sens: 'prayer', priere: 'dhuhr', minutes, duree },
		etat: 'publié'
	});
	const debut = debutAncre(VENDREDI.debut, minutes);
	const plage = `${debut} – ${debutAncre(VENDREDI.debut, minutes + duree)}`;
	await retour('19-D4', async () => {
		await ouvrir(page, '/');
		const carte = seanceDuJour(page, jour, nom);
		const carteLue =
			(await carte.count()) === 1 ? await texteDe(carte) : `${await carte.count()} carte(s)`;
		/** La ligne du cours dans chaque message d'une sorte, `semaine` ou `message`, par langue. */
		const lignesDuCours = async (sorte) =>
			Object.fromEntries(
				(await messagesDeLAccueil(page, sorte)).map((lu) => [
					lu.lang,
					lu.texte
						.split('\n')
						.find((ligne) => ligne.includes(nom))
						?.trim() ?? ''
				])
			);
		const semaine = await lignesDuCours('semaine');
		await carte.getByText('Annuler ou déplacer', { exact: true }).click();
		await carte.getByLabel('Heure de début', { exact: true }).fill(deplace);
		await envoyer(page, carte.getByRole('button', { name: 'Déplacer la séance', exact: true }));
		const messages = await lignesDuCours('message');
		verifierChaque(
			`le vendredi, un cours publié « ${minutes} min après Dhuhr » prend l’heure de la session publiée, ${VENDREDI.debut}, et non celle de la session en brouillon, ${SESSION_DANS_LA_SALLE.debut} : ${plage} sur sa carte d’« À venir » et dans le programme de la semaine de chaque langue, ${debut} dans chaque message de son déplacement le même jour`,
			{
				[`la carte : ${plage}`]: carteLue.includes(plage),
				...Object.fromEntries(
					LANGUES.map((langue) => [
						`le programme de la semaine en ${langue} : ${plage}`,
						(semaine[langue] ?? '').includes(plage)
					])
				),
				[`le message en français : « … commence à ${deplace} au lieu de ${debut}. »`]: (
					messages['fr'] ?? ''
				).endsWith(`commence à ${deplace} au lieu de ${debut}.`),
				...Object.fromEntries(
					LANGUES.map((langue) => [
						`le message en ${langue} : ${debut}`,
						(messages[langue] ?? '').includes(debut)
					])
				)
			},
			`carte : ${carteLue.slice(0, 60)} ; semaine : ${semaine['fr'] || 'aucune ligne'} ; message : ${messages['fr'] || 'aucune ligne'}`
		);
	});
	await supprimerLeCours(page, nom, id);
}

/**
 * Supprime, depuis la liste des cours, un cours que le parcours a créé le temps d'une vérification :
 * par le repli « Supprimer ce cours » quand l'écran l'offre (étape 19, D3), sinon par l'action de
 * la liste, que l'image de l'étape 18 avait déjà sans bouton pour elle, dans un formulaire écrit
 * dans la page. Hors de tout retour : le cours doit partir, pour la suite du parcours.
 */
async function supprimerLeCours(page, nom, id) {
	await ouvrir(page, '/cours');
	const repli = page
		.locator('li')
		.filter({ hasText: nom })
		.locator('details')
		.filter({ has: page.locator('summary', { hasText: 'Supprimer ce cours' }) });
	if ((await repli.count()) === 1) {
		await repli.locator(':scope > summary').click();
		await envoyer(page, repli.getByRole('button', { name: 'Oui, supprimer', exact: true }));
	} else {
		verifier(`l’identifiant de « ${nom} » est lisible`, UUID.test(id), id || 'aucun identifiant');
		await page.evaluate((courseId) => {
			const formulaire = document.createElement('form');
			formulaire.method = 'post';
			formulaire.action = '?/supprimer';
			const champ = document.createElement('input');
			champ.type = 'hidden';
			champ.name = 'courseId';
			champ.value = courseId;
			const bouton = document.createElement('button');
			bouton.type = 'submit';
			bouton.id = 'parcours-supprimer';
			bouton.textContent = 'Supprimer';
			formulaire.append(champ, bouton);
			document.body.append(formulaire);
		}, id);
		await envoyer(page, page.locator('#parcours-supprimer'));
	}
	await ouvrir(page, '/cours');
	verifier(
		`« ${nom} » est supprimé`,
		(await page.locator('li').filter({ hasText: nom }).count()) === 0
	);
}

/**
 * Une session du vendredi n'est pas un cours (étape 19) : son adresse sous /cours, celle de la fiche
 * d'un cours, mène à la page « Page introuvable » de l'espace, dans la langue de l'écran. Elle
 * ouvrait le formulaire d'un cours, dont l'envoi faisait de la session un cours. L'identifiant est
 * celui que l'écran du vendredi envoie avec chaque geste. Rien n'est envoyé : sur une ancienne
 * image, le formulaire envoyé changerait la session en cours pour la suite du parcours. L'écran
 * revient au français.
 */
async function sessionHorsDesCours(page) {
	await ouvrir(page, '/vendredi');
	const id =
		(await page
			.locator('section.session')
			.filter({ hasText: `${VENDREDI.debut} – ${VENDREDI.fin}` })
			.locator('input[name="courseId"]')
			.first()
			.getAttribute('value')) ?? '';
	verifier(
		`l’écran du vendredi donne l’identifiant de la session de ${VENDREDI.debut}`,
		UUID.test(id),
		id || 'aucun identifiant'
	);
	await retour('19-cours-session-vendredi', async () => {
		const lus = {};
		for (const langue of LANGUES) {
			if ((await racineDit(page, 'lang')) !== langue) await choisirLaLangue(page, langue);
			const reponse = await ouvrir(page, `/cours/${id}`);
			lus[langue] = {
				statut: reponse?.status() ?? 0,
				titre: await titre(page),
				formulaire: await page.locator('#title-fr').count()
			};
		}
		verifierChaque(
			`l’adresse /cours/<id> d’une session du vendredi mène, dans les cinq langues, au 404 de l’espace, ${LANGUES.map((langue) => `« ${ESPACE_INTROUVABLE[langue]} »`).join(', ')}, et non au formulaire d’un cours`,
			Object.fromEntries(
				Object.entries(lus).flatMap(([langue, lu]) => [
					[`404 en ${langue}`, lu.statut === 404],
					[
						`« ${ESPACE_INTROUVABLE[langue]} » en ${langue}`,
						lu.titre === ESPACE_INTROUVABLE[langue]
					],
					[`aucun formulaire de cours en ${langue}`, lu.formulaire === 0]
				])
			),
			Object.entries(lus)
				.map(([langue, lu]) => `${langue} : ${lu.statut}, « ${lu.titre} »`)
				.join(' ; ')
		);
	});
	if ((await racineDit(page, 'lang')) !== 'fr') await choisirLaLangue(page, 'fr');
}

/**
 * p. L'écran du vendredi et « À venir », ce que l'étape 19 y a corrigé, la session du vendredi
 * encore prévue à son heure. Chaque geste est défait à la fin de son bloc : l'étape m part de la
 * même session, seule, prévue à 12:30.
 *
 * - L'adresse d'une session sous /cours : un 404, dans les cinq langues (`sessionHorsDesCours`).
 * - D2 : annuler un vendredi passé, par un formulaire modifié dans la page ; ajouter une session
 *   dans une salle supprimée entre-temps depuis un autre onglet ; publier une session supprimée
 *   entre-temps ; déplacer la session à la veille, par un formulaire modifié. Chaque fois une
 *   phrase, sans confirmation, et, là où l'écran peut le montrer, rien d'écrit.
 * - La salle supprimée deux fois, depuis deux onglets de Réglages : « Cette salle n’existe plus. ».
 * - Une session au sermon en albanais et en turc, deux langues que la page publique ne publie pas,
 *   puis retirée de la page publique, l'écran en arabe (B3). Pendant qu'elle est en brouillon, un
 *   cours placé après le Dhuhr prend l'heure de la session publiée (D4) ; il est supprimé ensuite.
 * - « Rétablir comme d’habitude » sur la ligne « Nouvelle date » d'une session déplacée à un autre
 *   jour.
 * - Un jour sans séance, sur l'écran du vendredi et sur « À venir », par un formulaire modifié dans
 *   la page : une phrase qui le dit, sans confirmation ni message préparé.
 * - Sur « À venir », le titre d'une séance dans la langue de l'écran.
 */
async function vendrediEtape19(page) {
	etape('p. Le vendredi et « À venir » : ce que l’étape 19 a corrigé');
	await sessionHorsDesCours(page);
	const jour = VENDREDI_QUI_VIENT;
	const contexte = page.context();
	/** La première ligne de « Ce vendredi », celle de la session du parcours, ce jour-là. */
	const ceVendredi = (cible) =>
		cible
			.locator('section[aria-labelledby="ce-vendredi"] div.seance')
			.filter({ hasText: `${VENDREDI.debut} – ${VENDREDI.fin}` });
	/** Le refus en tête de l'écran du vendredi : sa phrase, et s'il vient avant la première session. */
	const refusEnTete = async (cible) => {
		const alertes = cible.getByRole('alert');
		const phrase =
			(await alertes.count()) === 1 ? await texteDe(alertes) : `${await alertes.count()} alerte(s)`;
		const enTete =
			(await alertes.count()) === 1 &&
			(await alertes.evaluate((alerte) => {
				const premiere = document.querySelector('section.session');
				return Boolean(
					premiere && alerte.compareDocumentPosition(premiere) & Node.DOCUMENT_POSITION_FOLLOWING
				);
			}));
		return { phrase, enTete, confirmations: await cible.getByRole('status').count() };
	};
	/** Une valeur cachée d'un formulaire, changée dans la page, comme un formulaire écrit à la main. */
	const changer = (champ, valeur) =>
		champ.evaluate((element, nouvelle) => {
			/** @type {HTMLInputElement} */ (element).value = nouvelle;
		}, valeur);

	// Le vendredi passé précède le premier jour de la session, ajoutée à l'étape g : une annulation
	// écrite pour lui ne se lirait sur aucun écran. Ce que l'écran dit de son geste est tout ce qui se
	// vérifie ici : un refus, et aucune confirmation.
	await retour('19-D2', async () => {
		await ouvrir(page, '/vendredi');
		const annuler = await exiger(
			ceVendredi(page).locator('form[action="?/annuler"]'),
			'« Annuler cette session » dans « Ce vendredi »'
		);
		await changer(annuler.locator('input[name="date"]'), plusJours(jour, -7));
		await envoyer(page, annuler.locator('button[type="submit"]'));
		const { phrase, enTete, confirmations } = await refusEnTete(page);
		verifierChaque(
			'sur l’écran du vendredi, « Annuler cette session » envoyé pour le vendredi passé (formulaire modifié dans la page) est refusé en tête : « Cette session est déjà passée : … », sans confirmation',
			{
				'la phrase':
					phrase ===
					'Cette session est déjà passée : vous ne pouvez annuler que les sessions d’aujourd’hui et des jours suivants.',
				'en tête': enTete,
				'aucune confirmation': confirmations === 0
			},
			phrase
		);
	});

	// Une salle libre, supprimée depuis un onglet de Réglages pendant qu'un second onglet de Réglages
	// et l'ajout d'une session sur l'écran du vendredi la montrent encore.
	await ouvrir(page, '/reglages');
	await page.locator('#salle').fill(SALLE_PROVISOIRE);
	await envoyer(page, page.locator('form:has(#salle) button[type="submit"]'));
	const salleProvisoire = (cible) =>
		cible.locator('#salles li').filter({ hasText: SALLE_PROVISOIRE });
	verifier(
		`la salle « ${SALLE_PROVISOIRE} » est créée`,
		(await salleProvisoire(page).count()) === 1
	);
	const reglagesB = await contexte.newPage();
	const vendrediA = await contexte.newPage();
	try {
		await ouvrir(reglagesB, '/reglages');
		await ouvrir(vendrediA, '/vendredi');
		const ajout = vendrediA.getByRole('region', { name: 'Ajouter une session' });
		await ajout.getByLabel('Salle', { exact: true }).selectOption({ label: SALLE_PROVISOIRE });
		await ajout.getByLabel('Heure de début', { exact: true }).fill(SESSION_DANS_LA_SALLE.debut);
		await ajout.getByLabel('Heure de fin', { exact: true }).fill(SESSION_DANS_LA_SALLE.fin);
		await envoyer(
			page,
			salleProvisoire(page).locator('form[action="?/supprimerSalle"] button[type="submit"]')
		);
		verifier(
			`la salle « ${SALLE_PROVISOIRE} », libre, est supprimée depuis un premier onglet`,
			(await salleProvisoire(page).count()) === 0
		);
		await retour('19-membres-salle', async () => {
			await envoyer(
				reglagesB,
				salleProvisoire(reglagesB).locator('form[action="?/supprimerSalle"] button[type="submit"]')
			);
			const alertes = (await reglagesB.getByRole('alert').allTextContents()).map((texte) =>
				texte.trim()
			);
			const statuts = (await reglagesB.getByRole('status').allTextContents()).map((texte) =>
				texte.trim()
			);
			verifierChaque(
				'dans Réglages, « Supprimer » sur une salle déjà supprimée depuis un autre onglet dit « Cette salle n’existe plus. », et non « Salle supprimée. »',
				{
					'« Cette salle n’existe plus. »': alertes.includes('Cette salle n’existe plus.'),
					'pas « Salle supprimée. »': !statuts.includes('Salle supprimée.')
				},
				`${alertes.map((texte) => `« ${texte} »`).join(', ') || 'aucune alerte'} ; ${statuts.map((texte) => `« ${texte} »`).join(', ') || 'aucun message'}`
			);
		});
		await retour('19-D2', async () => {
			const [reponse] = await Promise.all([
				vendrediA.waitForResponse((une) => une.request().method() === 'POST'),
				envoyer(vendrediA, ajout.locator('button[type="submit"]'))
			]);
			const section = vendrediA.getByRole('region', { name: 'Ajouter une session' });
			const alertes = (await section.getByRole('alert').allTextContents()).map((texte) =>
				texte.replace(/\s+/g, ' ').trim()
			);
			const debut = section.getByLabel('Heure de début', { exact: true });
			const gardee =
				(await debut.count()) === 1
					? await debut.inputValue()
					: `aucune section d’ajout, réponse ${reponse.status()}`;
			verifierChaque(
				'sur l’écran du vendredi, une session ajoutée dans une salle supprimée entre-temps est refusée, dans la section d’ajout, saisie gardée : « Cette salle n’existe plus : … »',
				{
					'la phrase': alertes.some((texte) =>
						texte.includes(
							'Cette salle n’existe plus : elle a été supprimée entre-temps. Choisissez une autre salle, ou « Pas de salle précise ».'
						)
					),
					'la saisie gardée': gardee === SESSION_DANS_LA_SALLE.debut,
					'rien d’ajouté':
						(await vendrediA
							.locator('section.session')
							.filter({ hasText: `${SESSION_DANS_LA_SALLE.debut} – ` })
							.count()) === 0
				},
				`${alertes.map((texte) => `« ${texte} »`).join(', ') || 'aucune alerte'} ; début « ${gardee} »`
			);
		});
	} finally {
		await reglagesB.close();
		await vendrediA.close();
	}

	// Une seconde session, au sermon en albanais et en turc (étape 19), ajoutée puis retirée de la
	// page publique en arabe (B3), puis supprimée depuis un autre onglet pendant que le premier la
	// montre encore (D2).
	const seconde = (cible) =>
		cible.locator('section.session').filter({ hasText: `${SESSION_DANS_LA_SALLE.debut} – ` });
	await ouvrir(page, '/vendredi');
	const ajout = page.getByRole('region', { name: 'Ajouter une session' });
	await ajout.getByLabel('Heure de début', { exact: true }).fill(SESSION_DANS_LA_SALLE.debut);
	await ajout.getByLabel('Heure de fin', { exact: true }).fill(SESSION_DANS_LA_SALLE.fin);
	await retour('19-sermon', async () => {
		for (const langue of ['sq', 'tr']) {
			await exiger(
				ajout.locator(`input[name="sermonLanguages"][value="${langue}"]`),
				`la case de la langue « ${langue} »`
			);
		}
		// L'albanais et le turc seuls : les cases que l'écran coche d'avance sont décochées.
		const cases = ajout.locator('input[name="sermonLanguages"]');
		for (let rang = 0; rang < (await cases.count()); rang += 1) {
			const caseDeLaLangue = cases.nth(rang);
			if (['sq', 'tr'].includes((await caseDeLaLangue.getAttribute('value')) ?? '')) {
				await caseDeLaLangue.check();
			} else {
				await caseDeLaLangue.uncheck();
			}
		}
	});
	const langues = ajout.locator('input[name="sermonLanguages"]');
	if ((await ajout.locator('input[name="sermonLanguages"]:checked').count()) === 0) {
		await langues.first().check();
	}
	await envoyer(page, ajout.locator('button[type="submit"]'));
	verifier(
		`une seconde session, à ${SESSION_DANS_LA_SALLE.debut}, est ajoutée`,
		(await seconde(page).count()) === 1,
		await texteDe(page.getByRole('status').last())
	);
	await retour('19-sermon', async () => {
		const carte = await texteDe(seconde(page));
		const contexteVisiteur = await nouveauContexte(
			/** @type {import('playwright-core').Browser} */ (contexte.browser())
		);
		try {
			const visiteur = await contexteVisiteur.newPage();
			await ouvrir(visiteur, `/m/${ORGANISATION.slug}`);
			const enHaut = await texteDe(visiteur.locator('section.vendredi'));
			verifierChaque(
				'une session au sermon en albanais et en turc, deux langues que la page publique ne publie pas : sa carte dit « Sermon en albanais et turc », et la page publique « albanais et turc »',
				{
					'la carte': carte.includes('Sermon en albanais et turc'),
					'la page publique': enHaut.includes('albanais et turc')
				},
				`carte : ${carte.slice(0, 100)} ; page publique : ${enHaut}`
			);
		} finally {
			await contexteVisiteur.close();
		}
	});
	await choisirLaLangue(page, 'ar');
	await retour('19-B3', async () => {
		await envoyer(page, seconde(page).locator('form[action="?/basculer"] button[type="submit"]'));
		const dit = (await page.getByRole('status').allTextContents()).map((texte) =>
			texte.replace(/\s+/g, ' ').trim()
		);
		verifier(
			'l’écran du vendredi en arabe, après « Retirer de la page publique » : « لكنه يبقى هنا كمسودة »',
			dit.some((texte) => texte.includes('لكنه يبقى هنا كمسودة')),
			dit.map((texte) => `« ${texte} »`).join(', ') || 'aucun message'
		);
	});
	await choisirLaLangue(page, 'fr');
	// La seconde session, en brouillon, n'a lieu nulle part : le tableau des heures servies n'en dit
	// pas l'heure, comme la page publique (étape 19). Il disait celles de toutes les sessions.
	await retour('19-prieres-jumua-brouillon', async () => {
		await ouvrir(page, '/prieres');
		const ceJourLa = page
			.locator('section', { has: page.locator('#servies-titre') })
			.locator('tbody tr')
			.filter({ has: page.locator('th', { hasText: dateSuisse(jour) }) });
		const dhuhr = ceJourLa.locator('td').nth(1).locator('.iqama');
		const lu = (await dhuhr.count()) === 1 ? await texteDe(dhuhr) : '';
		verifierChaque(
			`dans « Heures de prière », le vendredi, la cellule de Dhuhr dit « Jumu’a ${VENDREDI.debut} », la session publiée, sans l’heure de celle en brouillon, ${SESSION_DANS_LA_SALLE.debut}`,
			{
				[`« Jumu’a ${VENDREDI.debut} »`]: lu === `Jumu’a ${VENDREDI.debut}`,
				[`sans ${SESSION_DANS_LA_SALLE.debut}`]: !lu.includes(SESSION_DANS_LA_SALLE.debut)
			},
			lu ? `« ${lu} »` : `aucune session dans la cellule de Dhuhr du ${dateLongue(jour)}`
		);
	});
	await coursApresDhuhr(page);
	await ouvrir(page, '/vendredi');
	const autreOnglet = await contexte.newPage();
	try {
		await ouvrir(autreOnglet, '/vendredi');
		const repli = seconde(page).locator('details.repli').nth(1);
		await repli.locator(':scope > summary').click();
		await envoyer(page, repli.getByRole('button', { name: 'Oui, supprimer', exact: true }));
		verifier(
			'la seconde session est supprimée, depuis un premier onglet',
			(await seconde(page).count()) === 0
		);
		await retour('19-D2', async () => {
			await envoyer(
				autreOnglet,
				seconde(autreOnglet).locator('form[action="?/basculer"] button[type="submit"]')
			);
			const { phrase, enTete, confirmations } = await refusEnTete(autreOnglet);
			verifierChaque(
				'dans un second onglet, « Publier » sur une session supprimée entre-temps est refusé en tête : « Cette session n’existe plus : elle a été supprimée entre-temps. La liste ci-dessous est à jour. »',
				{
					'la phrase':
						phrase ===
						'Cette session n’existe plus : elle a été supprimée entre-temps. La liste ci-dessous est à jour.',
					'en tête': enTete,
					'aucune confirmation': confirmations === 0
				},
				phrase
			);
		});
	} finally {
		await autreOnglet.close();
	}

	// « Déplacer » vers la veille, par un formulaire modifié dans la page : la liste des jours commence
	// aujourd'hui, et l'écran refuse un jour passé depuis l'étape 19. Avant, il l'écrivait : la
	// session déplacée au passé est alors rétablie, pour la suite.
	const deplacees = page
		.locator('section[aria-labelledby="ce-vendredi"] div.seance')
		.filter({ hasText: 'Déplacée au' });
	await retour('19-D2', async () => {
		await ouvrir(page, '/vendredi');
		const deplacer = await exiger(
			ceVendredi(page)
				.filter({ hasText: dateLongue(jour) })
				.locator('form[action="?/deplacer"]'),
			'« Déplacer » dans « Ce vendredi »'
		);
		const veille = plusJours(T, -1);
		const jours = deplacer.locator('select[name="toDate"]');
		await jours
			.locator('option')
			.first()
			.evaluate((option, valeur) => {
				/** @type {HTMLOptionElement} */ (option).value = valeur;
			}, veille);
		await jours.selectOption(veille);
		await envoyer(page, deplacer.locator('button[type="submit"]'));
		const { phrase, enTete, confirmations } = await refusEnTete(page);
		verifierChaque(
			'sur l’écran du vendredi, « Déplacer » envoyé pour la veille (formulaire modifié dans la page) est refusé en tête : « Ce jour est déjà passé : rien n’a été déplacé. … », et rien n’est déplacé',
			{
				'la phrase':
					phrase ===
					'Ce jour est déjà passé : rien n’a été déplacé. Choisissez aujourd’hui ou un jour suivant dans « Ce vendredi », plus bas.',
				'en tête': enTete,
				'aucune confirmation': confirmations === 0,
				'rien de déplacé': (await deplacees.count()) === 0
			},
			phrase
		);
	});
	if ((await deplacees.count()) === 1) {
		await envoyer(page, deplacees.locator('form[action="?/retablir"] button[type="submit"]'));
	}

	// « Rétablir comme d’habitude » sur la ligne « Nouvelle date » d'une session déplacée à un autre
	// jour. Si l'écran ne l'offre pas, la ligne « Déplacée au … » rétablit la session à sa place.
	await retour('19-retablir-nouvelle-date', async () => {
		await ouvrir(page, '/vendredi');
		const ligne = ceVendredi(page).filter({ hasText: dateLongue(jour) });
		const deplacer = ligne.locator('form[action="?/deplacer"]');
		const autreJour = await deplacer
			.locator('select[name="toDate"] option')
			.evaluateAll(
				(options, date) =>
					options
						.map((option) => /** @type {HTMLOptionElement} */ (option).value)
						.find((valeur) => valeur !== date) ?? '',
				jour
			);
		await deplacer.locator('select[name="toDate"]').selectOption(autreJour);
		await envoyer(page, deplacer.locator('button[type="submit"]'));
		const nouvelleDate = ceVendredi(page).filter({
			hasText: `Nouvelle date, à la place du ${dateLongue(jour)}`
		});
		const bouton = nouvelleDate.locator('form[action="?/retablir"] button[type="submit"]');
		const present =
			(await bouton.count()) === 1 && (await texteDe(bouton)) === 'Rétablir comme d’habitude';
		if (present) await envoyer(page, bouton);
		const dit = (await page.getByRole('status').allTextContents()).map((texte) => texte.trim());
		verifierChaque(
			'une session déplacée à un autre jour : sur la ligne « Nouvelle date, à la place du vendredi JJ.MM.AAAA », « Rétablir comme d’habitude » la ramène à son vendredi',
			{
				'le bouton sur la ligne « Nouvelle date »': present,
				'« La session retrouve son jour et son heure habituels. »': dit.includes(
					'La session retrouve son jour et son heure habituels.'
				),
				'la session de nouveau prévue ce vendredi':
					(await ceVendredi(page)
						.filter({ hasText: dateLongue(jour) })
						.locator('form[action="?/annuler"]')
						.count()) === 1
			},
			dit.map((texte) => `« ${texte} »`).join(', ') || 'aucun message'
		);
	});
	const deplacee = ceVendredi(page).filter({ hasText: 'Déplacée au' });
	if ((await deplacee.count()) === 1) {
		await envoyer(page, deplacee.locator('form[action="?/retablir"] button[type="submit"]'));
	}
	verifier(
		`la session du vendredi est prévue à ${VENDREDI.debut}, ce vendredi, pour la suite du parcours`,
		(await ceVendredi(page)
			.filter({ hasText: dateLongue(jour) })
			.locator('form[action="?/annuler"]')
			.count()) === 1
	);

	// Un jour sans séance n'en montre aucune, sur aucun écran, qu'une annulation soit écrite pour lui
	// ou non. Ce qui se vérifie, c'est ce que l'écran dit de son geste : un refus en tête, aucune
	// confirmation sur l'écran du vendredi, et aucun message préparé sur « À venir », qui en prépare
	// un après chaque séance annulée.
	await retour('19-jour-sans-seance', async () => {
		await ouvrir(page, '/vendredi');
		const annuler = ceVendredi(page)
			.filter({ hasText: dateLongue(jour) })
			.locator('form[action="?/annuler"]');
		const lundi = plusJours(jour, 3);
		await changer(annuler.locator('input[name="date"]'), lundi);
		await envoyer(page, annuler.locator('button[type="submit"]'));
		const vendredi = await refusEnTete(page);
		await ouvrir(page, '/');
		const carte = seanceDuJour(page, J4, COURS_ANCRE);
		await carte.getByText('Annuler ou déplacer', { exact: true }).click();
		const formulaire = carte.locator('form[action="?/annuler"]');
		await changer(formulaire.locator('input[name="date"]'), J5);
		await envoyer(page, formulaire.locator('button[type="submit"]'));
		const alertes = page.getByRole('alert');
		const aVenir =
			(await alertes.count()) === 1 ? await texteDe(alertes) : `${await alertes.count()} alerte(s)`;
		verifierChaque(
			'« Annuler » envoyé pour un jour où il n’y a pas de séance (formulaire modifié dans la page) : une phrase qui le dit, en tête, sans confirmation sur l’écran du vendredi ni message préparé sur « À venir »',
			{
				'le vendredi : « Cette session n’a pas lieu ce jour-là. … »':
					vendredi.phrase ===
					'Cette session n’a pas lieu ce jour-là. Rien n’a été enregistré. La partie « Ce vendredi », plus bas, est à jour.',
				'le vendredi : en tête': vendredi.enTete,
				'le vendredi : aucune confirmation': vendredi.confirmations === 0,
				[`« À venir » : « Aucune séance « ${COURS_ANCRE} » n’est prévue le … »`]:
					aVenir ===
					`Aucune séance « ${COURS_ANCRE} » n’est prévue le ${dateLongue(J5)}. Rien n’a été enregistré. Le programme ci-dessous est à jour.`,
				'« À venir » : aucun message préparé': (await page.locator('#message-titre').count()) === 0
			},
			`« ${vendredi.phrase} » ; « ${aVenir} »`
		);
	});

	await retour('19-titre-langue-ecran', async () => {
		const titres = {};
		for (const [langue, jourDeLaCarte, source, attendu] of [
			['de', jour, PRIERE_DU_VENDREDI.fr, PRIERE_DU_VENDREDI.de],
			['ar', J1, COURS_1.fr, COURS_1.ar]
		]) {
			await ouvrir(page, '/');
			await choisirLaLangue(page, langue);
			const cartes = await page
				.locator('section', { has: page.locator(`[id="jour-${jourDeLaCarte}"]`) })
				.locator('li .titre bdi')
				.allTextContents();
			titres[langue] = { lus: cartes.map((titre) => titre.trim()), source, attendu };
		}
		verifierChaque(
			'sur « À venir », une séance porte son titre dans la langue de l’écran : « Freitagsgebet » en allemand, « قراءة القرآن » en arabe',
			Object.fromEntries(
				Object.entries(titres).map(([langue, lu]) => [
					`« ${lu.attendu} » en ${langue}, et non « ${lu.source} »`,
					lu.lus.includes(lu.attendu) && !lu.lus.includes(lu.source)
				])
			),
			Object.entries(titres)
				.map(([langue, lu]) => `${langue} : ${lu.lus.join(', ') || 'aucune carte'}`)
				.join(' ; ')
		);
	});
	await ouvrir(page, '/');
	if ((await racineDit(page, 'lang')) !== 'fr') await choisirLaLangue(page, 'fr');
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
		verifierChaque(
			'avec JavaScript, le nom et la formule d’accueil tapés au clavier, puis une autre couleur : c’est ce qui a été tapé qui s’enregistre',
			{
				'le nom tapé': tape.nom === SAISIE_AU_CLAVIER.nom,
				'la formule tapée': tape.accueil === SAISIE_AU_CLAVIER.accueil,
				'« Réglages enregistrés. »': statut === 'Réglages enregistrés.',
				'le nom enregistré': enregistre.nom === SAISIE_AU_CLAVIER.nom,
				'la formule enregistrée': enregistre.accueil === SAISIE_AU_CLAVIER.accueil,
				'le titre de l’onglet': (await page.title()) === `Réglages | ${SAISIE_AU_CLAVIER.nom}`
			},
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
 * donne le rôle d'éditeur sur sa propre ligne, et confirme (étape 19 : un changement de rôle demande
 * une confirmation, en haut de l'écran). Elle arrive sur « À venir », où une phrase, visible sans
 * défiler, lui dit ce qui s'est passé et comment retrouver ses écrans. La seconde lui rend ensuite son
 * rôle, et confirme aussi.
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
			/** Le bouton de la demande de confirmation, en haut de l'écran Membres (étape 19). */
			const confirmer = (cible, nom) =>
				cible.locator('#confirmer-membre').getByRole('button', { name: nom, exact: true });
			await envoyer(
				page,
				ligne(page, RESPONSABLE).getByRole('button', {
					name: 'Donner le rôle d’éditeur',
					exact: true
				})
			);
			await retour('19-membres-confirmations', async () => {
				const demande = page.locator('#confirmer-membre');
				const texte = (await demande.count()) === 1 ? await texteDe(demande) : '';
				verifierChaque(
					'sur sa propre ligne, « Donner le rôle d’éditeur » ne change rien au premier envoi : en haut, « Vous allez vous donner le rôle d’éditeur. », « Prendre le rôle d’éditeur » et « Ne rien changer »',
					{
						'la demande en haut, annoncée (role=alert)':
							texte !== '' && (await demande.getAttribute('role')) === 'alert',
						'« Vous allez vous donner le rôle d’éditeur. »': texte.startsWith(
							'Vous allez vous donner le rôle d’éditeur.'
						),
						'« Prendre le rôle d’éditeur »':
							(await confirmer(page, 'Prendre le rôle d’éditeur').count()) === 1,
						'« Ne rien changer »':
							(await demande
								.getByRole('link', { name: 'Ne rien changer', exact: true })
								.count()) === 1,
						'le rôle pas encore changé': chemin(page) === '/membres'
					},
					texte || `aucune demande, ${chemin(page)}`
				);
			});
			// Depuis l'étape 19, le rôle ne change qu'à la confirmation ; avant, au premier envoi.
			if ((await confirmer(page, 'Prendre le rôle d’éditeur').count()) === 1) {
				await envoyer(page, confirmer(page, 'Prendre le rôle d’éditeur'));
			}
			const avis = page.locator('#avis-role');
			const texte = (await avis.count()) === 1 ? await texteDe(avis) : '';
			const boite = texte ? await avis.boundingBox() : null;
			const role = texte ? await avis.getAttribute('role') : null;
			const hauteur = page.viewportSize()?.height ?? ECRAN.height;
			const adresse = new URL(page.url());
			const titreLu = await titre(page);
			verifierChaque(
				'une responsable qui se donne le rôle d’éditeur arrive sur « À venir », où une phrase, visible sans défiler, lui dit ce qui s’est passé et comment retrouver ses écrans',
				{
					'l’arrivée sur « À venir »': adresse.pathname === '/' && titreLu === 'À venir',
					'la phrase': texte === DEVENUE_EDITRICE,
					'annoncée (role=status)': role === 'status',
					'visible sans défiler':
						boite !== null && boite.y >= 0 && boite.y + boite.height <= hauteur
				},
				`${adresse.pathname}${adresse.search}, « ${titreLu} » ; ${texte ? `« ${texte} »` : 'aucune phrase'} ; role « ${role ?? 'aucun'} » ; ${
					boite
						? `de ${Math.round(boite.y)} à ${Math.round(boite.y + boite.height)} px, fenêtre de ${hauteur} px`
						: 'aucune boîte'
				}`
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
			await retour('19-membres-confirmations', async () => {
				const demande = seconde.locator('#confirmer-membre');
				const texte = (await demande.count()) === 1 ? await texteDe(demande) : '';
				verifierChaque(
					'sur la ligne d’un autre membre, « Donner le rôle de responsable » demande d’abord de confirmer : « Vous allez donner le rôle de responsable à cette personne : <adresse> », ce qu’elle pourra faire, et « Donner ce rôle »',
					{
						'la personne nommée': texte.includes(
							`Vous allez donner le rôle de responsable à cette personne : ${RESPONSABLE}`
						),
						'ce qu’elle pourra faire': texte.includes(
							'Elle pourra faire tout ce qui est réservé au responsable, membres et réglages compris.'
						),
						'« Donner ce rôle »': (await confirmer(seconde, 'Donner ce rôle').count()) === 1
					},
					texte || `aucune demande, ${chemin(seconde)}`
				);
			});
			if ((await confirmer(seconde, 'Donner ce rôle').count()) === 1) {
				await envoyer(seconde, confirmer(seconde, 'Donner ce rôle'));
			}
			// La première, de nouveau responsable, commence à retirer la seconde, puis ne change rien :
			// retirer un autre membre se confirme aussi (étape 19). Avant, la personne partait au premier
			// envoi ; sur une image de ce temps-là, la seconde ne peut plus ensuite se retirer elle-même.
			await retour('19-membres-confirmations', async () => {
				await ouvrir(page, '/membres');
				await envoyer(
					page,
					await exiger(
						ligne(page, SECONDE_RESPONSABLE).getByRole('button', {
							name: 'Retirer de l’organisation',
							exact: true
						}),
						'le bouton « Retirer de l’organisation » sur la ligne de la seconde'
					)
				);
				const demande = page.locator('#confirmer-membre');
				const texte = (await demande.count()) === 1 ? await texteDe(demande) : '';
				const role = texte ? await demande.getAttribute('role') : null;
				const retirer = await confirmer(page, 'Retirer cette personne').count();
				const garder = demande.getByRole('link', { name: 'Ne rien changer', exact: true });
				const garderPresent = (await garder.count()) === 1;
				if (garderPresent) {
					await garder.click();
					await demande.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
					await page.waitForLoadState('networkidle');
				}
				const apres = await ligne(page, SECONDE_RESPONSABLE).count();
				verifierChaque(
					'sur la ligne d’un autre membre, « Retirer de l’organisation » demande d’abord de confirmer : « Vous allez retirer cette personne de l’organisation : <adresse> », « Retirer cette personne », et « Ne rien changer », qui la laisse membre',
					{
						'la personne nommée': texte.includes(
							`Vous allez retirer cette personne de l’organisation : ${SECONDE_RESPONSABLE}`
						),
						'annoncée (role=alert)': role === 'alert',
						'« Retirer cette personne »': retirer === 1,
						'« Ne rien changer »': garderPresent,
						'la demande refermée': (await demande.count()) === 0,
						'toujours membre': apres === 1
					},
					`${texte || `aucune demande, ${chemin(page)}`} ; ${apres} ligne(s) pour ${SECONDE_RESPONSABLE}`
				);
			});
			await seRetirerDeMembres(seconde, ligne);
		} finally {
			await ailleurs.close();
		}
	});
}

/**
 * La seconde responsable se retire elle-même de l'organisation, depuis Membres (étape 19) : l'écran
 * demande d'abord de confirmer, avec des phrases qui parlent d'elle, puis elle arrive sur « Vos
 * organisations », où un encadré, avant le titre et visible sans défiler, dit ce qui s'est passé.
 * Rechargé sans paramètre, l'écran ne le montre plus.
 */
async function seRetirerDeMembres(seconde, ligne) {
	await retour('19-membres-depart', async () => {
		await ouvrir(seconde, '/membres');
		await envoyer(
			seconde,
			await exiger(
				ligne(seconde, SECONDE_RESPONSABLE).getByRole('button', {
					name: 'Retirer de l’organisation',
					exact: true
				}),
				'le bouton « Retirer de l’organisation » sur sa propre ligne'
			)
		);
		const demande = seconde.locator('#confirmer-membre');
		const texteDeLaDemande = (await demande.count()) === 1 ? await texteDe(demande) : '';
		await envoyer(
			seconde,
			await exiger(
				demande.getByRole('button', { name: 'Me retirer de l’organisation', exact: true }),
				'le bouton « Me retirer de l’organisation »'
			)
		);
		const adresse = new URL(seconde.url());
		const avis = seconde.locator('#avis-depart');
		const texte = (await avis.count()) === 1 ? await texteDe(avis) : '';
		const boite = texte ? await avis.boundingBox() : null;
		const role = texte ? await avis.getAttribute('role') : null;
		const hauteur = seconde.viewportSize()?.height ?? ECRAN.height;
		const avantLeTitre =
			texte !== '' &&
			(await avis.evaluate((encadre) => {
				const titre = document.querySelector('h1');
				return Boolean(
					titre && encadre.compareDocumentPosition(titre) & Node.DOCUMENT_POSITION_FOLLOWING
				);
			}));
		await ouvrir(seconde, '/organisations');
		const apresRechargement = await seconde.locator('#avis-depart').count();
		verifierChaque(
			'une responsable qui se retire elle-même, depuis Membres, confirme d’abord, puis arrive sur « Vos organisations », où un encadré, avant le titre et visible sans défiler, dit qu’elle a quitté l’organisation',
			{
				'la demande « Vous allez vous retirer vous-même de l’organisation. »':
					texteDeLaDemande.startsWith('Vous allez vous retirer vous-même de l’organisation.'),
				'l’arrivée sur « Vos organisations »': adresse.pathname === '/organisations',
				'l’encadré':
					texte ===
					'Vous avez quitté l’organisation. Son espace ne vous est plus ouvert. Pour y revenir, demandez à une personne responsable de vous inviter de nouveau.',
				'annoncé (role=status), avant le titre': avantLeTitre && role === 'status',
				'visible sans défiler': boite !== null && boite.y >= 0 && boite.y + boite.height <= hauteur,
				'plus d’encadré au rechargement': apresRechargement === 0
			},
			`${adresse.pathname}${adresse.search} ; « ${texte || 'aucun encadré'} »`
		);
	});
}

/**
 * Le lien de la navigation vers « Vos organisations », pour qui n'est membre que d'une
 * organisation, sans invitation qui attende, dans chaque langue (`apps/web/src/lib/i18n/common.ts`).
 */
const VOS_ORGANISATIONS = {
	fr: 'Vos organisations',
	de: 'Ihre Organisationen',
	it: 'Le tue organizzazioni',
	en: 'Your organisations',
	ar: 'مؤسساتك'
};

/**
 * q. « Vos organisations » (étape 19) : la personne du parcours quitte l'organisation voisine, où
 * elle est éditrice. Le bouton « Quitter l’organisation » a pour description le nom de
 * l'organisation ; l'écran demande de confirmer en la nommant ; puis l'encadré dit le départ, et
 * l'organisation a quitté la liste. Membre d'une seule organisation, elle trouve alors dans la
 * navigation « Vos organisations », et non plus « Changer d’organisation ».
 */
async function quitterLaVoisine(page) {
	etape('q. Vos organisations : quitter une organisation');
	// D'abord l'organisation du parcours, dont elle est la seule personne responsable depuis que la
	// seconde s'est retirée (étape o) : l'écran refuse, dit pourquoi et ce qu'il faut faire, sans
	// demander de confirmation, dans les cinq langues ; elle reste membre.
	await retour('19-membres-quitter', async () => {
		const lus = {};
		try {
			for (const langue of LANGUES) {
				if ((await racineDit(page, 'lang')) !== langue) await choisirLaLangue(page, langue);
				await ouvrir(page, '/organisations');
				const ligne = page.locator('li').filter({
					has: page.getByRole('button', { name: ORGANISATION.nom, exact: true })
				});
				await envoyer(
					page,
					await exiger(
						ligne.locator('form[action="?/quitter"] button[type="submit"]'),
						'le bouton « Quitter l’organisation »'
					)
				);
				const refus = page.locator('#refus-depart');
				// Ses paragraphes un à un, joints par une espace : le texte du bloc entier dépend des
				// blancs que le rendu laisse entre eux.
				const paragraphes = (await refus.locator('p').allTextContents()).map((texte) =>
					texte.replace(/\s+/g, ' ').trim()
				);
				lus[langue] = {
					texte: paragraphes.join(' '),
					role: (await refus.count()) === 1 ? await refus.getAttribute('role') : null,
					demandes: await page.locator('#confirmer-depart').count(),
					restee: await page.getByRole('button', { name: ORGANISATION.nom, exact: true }).count()
				};
			}
		} finally {
			if ((await racineDit(page, 'lang')) !== 'fr') await choisirLaLangue(page, 'fr');
		}
		verifierChaque(
			`dans « Vos organisations », la seule personne responsable de « ${ORGANISATION.nom} » qui veut la quitter lit, dans les cinq langues, un refus qui la nomme et dit quoi faire, sans demande de confirmation, et reste membre`,
			Object.fromEntries(
				LANGUES.flatMap((langue) => {
					const { avantLeNom, quoiFaire } = SEULE_RESPONSABLE[langue];
					const lu = lus[langue];
					return [
						[`le refus, ${langue}`, lu.texte === `${avantLeNom} ${ORGANISATION.nom} ${quoiFaire}`],
						[`annoncé (role=alert), ${langue}`, lu.role === 'alert'],
						[`sans demande de confirmation, ${langue}`, lu.demandes === 0],
						[`toujours membre, ${langue}`, lu.restee === 1]
					];
				})
			),
			LANGUES.map(
				(langue) => `${langue} : « ${lus[langue].texte.slice(0, 90) || 'aucun refus'} »`
			).join(' | ')
		);
	});
	await retour('19-membres-quitter', async () => {
		await ouvrir(page, '/organisations');
		const ligne = page
			.locator('li')
			.filter({ has: page.getByRole('button', { name: VOISINE.nom, exact: true }) });
		const quitter = await exiger(
			ligne.getByRole('button', { name: 'Quitter l’organisation', exact: true }),
			'le bouton « Quitter l’organisation »'
		);
		const description = await descriptionDe(quitter);
		await envoyer(page, quitter);
		const demande = page.locator('#confirmer-depart');
		const texteDeLaDemande = (await demande.count()) === 1 ? await texteDe(demande) : '';
		await envoyer(
			page,
			await exiger(
				demande.getByRole('button', { name: 'Confirmer le départ', exact: true }),
				'le bouton « Confirmer le départ »'
			)
		);
		const avis = page.locator('#avis-depart');
		const texte = (await avis.count()) === 1 ? await texteDe(avis) : '';
		const restantes = await page.getByRole('button', { name: VOISINE.nom, exact: true }).count();
		verifierChaque(
			`dans « Vos organisations », « Quitter l’organisation » sur « ${VOISINE.nom} » : le bouton porte son nom pour les lecteurs d’écran, l’écran demande de confirmer en la nommant, puis l’encadré dit le départ, et l’organisation a quitté la liste`,
			{
				'la description du bouton': description === VOISINE.nom,
				'la demande nomme l’organisation': texteDeLaDemande.startsWith(
					`Vous allez quitter cette organisation : ${VOISINE.nom}`
				),
				'l’encadré du départ':
					texte ===
					'Vous avez quitté l’organisation. Son espace ne vous est plus ouvert. Pour y revenir, demandez à une personne responsable de vous inviter de nouveau.',
				'l’organisation a quitté la liste': restantes === 0
			},
			`« ${description} » ; « ${texteDeLaDemande.slice(0, 80)} » ; « ${texte || 'aucun encadré'} »`
		);
	});
	// Membre d'une seule organisation, sans invitation qui attende : la navigation la mène encore à
	// l'écran où l'on quitte une organisation, sous son titre, « Vos organisations » (étape 19).
	// Avant, elle n'avait aucun lien vers cet écran.
	await retour('19-membres-quitter', async () => {
		const lus = {};
		try {
			for (const langue of LANGUES) {
				await ouvrir(page, '/');
				if ((await racineDit(page, 'lang')) !== langue) await choisirLaLangue(page, langue);
				lus[langue] = await page
					.locator('header nav a')
					.evaluateAll((liens) =>
						liens
							.filter(
								(lien) =>
									new URL(/** @type {HTMLAnchorElement} */ (lien).href).pathname ===
									'/organisations'
							)
							.map((lien) => (lien.textContent ?? '').replace(/\s+/g, ' ').trim())
					);
			}
		} finally {
			if ((await racineDit(page, 'lang')) !== 'fr') await choisirLaLangue(page, 'fr');
		}
		verifierChaque(
			'membre d’une seule organisation, sans invitation qui attende, elle trouve dans la navigation un seul lien vers /organisations, « Vos organisations », dans les cinq langues, à la place de « Changer d’organisation »',
			Object.fromEntries(
				LANGUES.map((langue) => [
					`« ${VOS_ORGANISATIONS[langue]} », seul, en ${langue}`,
					lus[langue].join('|') === VOS_ORGANISATIONS[langue]
				])
			),
			LANGUES.map(
				(langue) =>
					`${langue} : ${lus[langue].map((texte) => `« ${texte} »`).join(', ') || 'aucun lien'}`
			).join(' ; ')
		);
	});
}

// ---------------------------------------------------------------------------------------------
// Le catalogue des vérifications des retours
// ---------------------------------------------------------------------------------------------

/**
 * Chaque vérification d'un retour, sous la forme neutre de son libellé (`neutre`), `retour |
 * libellé`, une par ligne, dans l'ordre d'un passage entier. Le parcours sait ainsi lui-même,
 * contre une ancienne image, lesquelles n'ont jamais été jouées, et les imprime une par ligne. Un
 * passage strict échoue si l'une d'elles ne l'est pas, ou si une vérification jouée n'y est pas :
 * le catalogue ne peut pas s'écarter du script sans que le parcours le dise.
 */
const CATALOGUE = `
D2 | au premier passage, un navigateur réglé en allemand (de-CH) voit /connexion en allemand
D3 | le lien demandé depuis cet écran allemand part en allemand, <html lang="de"> compris
B1 | la connexion dit, sous le champ, quelle adresse écrire, avec un exemple
A3 | les conditions sont datées en JJ.MM.AAAA, « Dernière mise à jour : JJ.MM.AAAA. »
F1 | les conditions nomment Voltia comme exploitant, et nulle part la personne retirée
A3 | la passkey est datée du jour en Suisse, « Enregistrée le JJ.MM.AAAA »
B2 | une seconde passkey, pouvoirs actifs : le message dit qu’elle servira à la prochaine connexion, sans renvoyer à un bouton, et l’écran n’en montre pas d’autre que « Enregistrer une passkey »
B2 | son nom se distingue de celui de la première
D2 | /super-admin porte en haut le choix des cinq langues, le français choisi
D2 | /super-admin/passkey porte en haut le choix des cinq langues, le français choisi
D2 | en Deutsch, les écrans du super-admin sont dans cette langue, rien en français
D2 | en Italiano, les écrans du super-admin sont dans cette langue, rien en français
D2 | en English, les écrans du super-admin sont dans cette langue, rien en français
D2 | en العربية, les écrans du super-admin sont dans cette langue, rien en français
D2 | la langue choisie reste au rechargement
D2 | retour au français
B2 | « Créer une organisation », avec la phrase qui dit ce qu’est une organisation
B2 | le fuseau se choisit dans une liste, les fuseaux d’Europe en tête, Europe/Zurich par défaut
B2 | une phrase sous le fuseau dit à quoi il sert : les heures du programme et celles des prières
B2 | le lien de connexion de secours dit quand s’en servir, ce qui se passe et combien il vaut
19-B12 | dans les cinq langues, sous le nom et sous l’adresse d’une organisation, l’exemple est « Association Horizon » et « association-horizon », en arabe « جمعية الأفق », et la règle de l’adresse demande une lettre
19-D6 | avec JavaScript, l’adresse proposée pendant la frappe : « Club № 5 » donne « club-no-5 », « Horizon™ » donne « horizon », et un nom sans lettre latine ne propose rien et dit d’écrire l’adresse
B2 | « Adresse de la page publique » est proposée pendant la frappe, « centre-du-parcours », adresse complète en direct
B2 | l’adresse se modifie, et l’adresse complète la suit
B3 | sous le choix du rôle, ce que peut faire un éditeur, et ce qui est réservé au responsable
B3 | ce que peut faire un éditeur ne promet pas de supprimer un cours : « Créer un cours, le modifier et le publier »
19-D3 | la liste réservée au responsable dit « Supprimer un cours »
B3 | le choix du rôle renvoie à ces deux listes pour les lecteurs d’écran
B1 | l’invitation dit, sous l’adresse, un exemple de la bonne forme
D3 | une invitation envoyée depuis l’écran en allemand part en allemand, <html lang="de"> compris
19-C | depuis l’écran en français, l’invitation part dans la langue choisie sous l’adresse, « Italiano », objet et <html lang="it"> compris
19-D6 | sans JavaScript, « École du Lac », envoyée sans adresse écrite, n’est pas encore créée : l’écran montre en entier l’adresse proposée, « HÔTE/m/ecole-du-lac », dans un champ où la confirmer ou la changer
B2 | sans JavaScript, « École du Lac », créée à la confirmation, reçoit l’adresse que le serveur a proposée, « ecole-du-lac », et l’écran dit l’adresse entière
A3 | la version et la date du texte s’écrivent en JJ.MM.AAAA, « Version du JJ.MM.AAAA »
H2 | avec une organisation et une invitation qui attend, le lien « Choisir une autre organisation » est là, vers le choix
19-D8 | l’écran d’acceptation écrit « l’espace d’Association voisine », en haut et sous le bouton
D1 | les réglages proposent l’anglais parmi les langues de la page publique
B1 | la navigation nomme ces écrans par leur titre, « Heures de prière » et « Prière du vendredi »
B1 | l’écran le confirme sans jargon, « Les heures de prière sont activées. »
B1 | le formulaire d’un cours a une aide sous le titre, le premier jour et la publication
B4 | en haut du formulaire, « Résumé : ce qui sera publié », et le premier jour signalé comme manquant
B4 | le résumé suit la saisie : le titre, puis le premier jour écrit en JJ.MM.AAAA
B4 | le résumé a une ligne pour la description, sous le titre de sa langue
19-cours-facultatif | la ligne de la description, remplie, finit par « (facultatif) »
B4 | une description écrite en allemand sans titre en allemand est refusée, avec une phrase qui nomme la langue, et le formulaire revient avec la description
B4 | avec JavaScript, après ce refus, l’écran revient sur l’onglet de la langue en cause, « allemand », où la description est en vue
19-D4 | sur « À venir », la carte de « Arabe pour adultes », en brouillon, porte « brouillon », et le programme de la semaine ne l’annonce dans aucune langue
A1 | avant tout geste, aucun bouton « Annuler cette séance » n’est visible
A1 | « Annuler ou déplacer » n’ouvre que les options de sa carte
A1 | un second geste la referme, sans rouvrir les autres
A2 | le champ « Nouvelle date » accepte toute date à partir d’aujourd’hui (JJ.MM.AAAA)
19-D4 | le calendrier de « Nouvelle date » s’arrête au JJ.MM.AAAA, la dernière date que l’action accepte
B1 | l’aide de la nouvelle date dit : à partir d’aujourd’hui, plus tôt ou plus tard
A2 | « Déplacer la séance » sans rien changer, ni la date ni l’heure, est refusé avec une phrase, dans la carte, et rien n’est déplacé
A2 | une date passée est refusée, dans la carte de la séance
A2 | la séance du JJ.MM.AAAA part au JJ.MM.AAAA, plus tôt que prévu, et se dit déplacée
A2 | elle apparaît le JJ.MM.AAAA, en date exceptionnelle, prévue à l’origine le JJ.MM.AAAA
19-D4 | la carte d’arrivée du JJ.MM.AAAA, « date exceptionnelle », a son bouton « Rétablir la séance », avec l’aide qui dit ce qu’il défait
B1 | l’écran Partager dit où coller le code, avec un exemple, et nomme le cadre sans jargon
19-B2 | « À venir » en arabe : la note de l’audience dit « فالتقويم يُحدَّث من تلقاء نفسه »
19-B10 | « À venir » en arabe, le programme qui ne s’affiche plus sur le site : l’alerte parle de « الشيفرة », et son lien dit « عرض الشيفرة المراد لصقها مرة أخرى »
19-B9 | en arabe, le programme de la semaine se copie puis se colle : « لتنسخه وتلصقه في WhatsApp » sur « À venir », « انسخ هذه الرسالة والصقها في مجموعة WhatsApp الخاصة بك » dans Partager
19-B1 | Partager en arabe : le code pour un site très strict « وهي لا تُحدَّث تلقائيًا »
19-B8 | Membres en arabe, un rôle inconnu envoyé par un formulaire écrit à la main : « هذا الدور غير موجود. اختر دور المحرر أو دور المسؤول. »
19-cours-facultatif | le résumé d’un nouveau cours marque « (facultatif) » chaque ligne facultative, sans la signaler comme un manque
19-cours-titre-manquant | une description allemande sans titre allemand : le résumé signale le titre qui manque, et la description à corriger ; écrire le titre retire la marque
19-cours-langue-de-saisie | sur un nouveau cours, choisir l’arabe comme langue de saisie coche l’arabe comme langue d’enseignement, à la place du français
19-cours-premier-jour | un cours à dates précises : « Premier jour du cours » prend la première date, JJ.MM.AAAA, puis suit une date plus tôt, JJ.MM.AAAA
19-cours-message | un cours publié : l’écran revient sur /cours?publie=<id>, « Le cours est publié. », et le message « Nouveau cours : « Annoncé dans le désordre » » prêt à coller, ses dates dans l’ordre
19-cours-hors-periode | un cours à dates précises dont une date tombe après son dernier jour : son bloc, et lui seul, dit « À corriger : … »
19-D3 | sur /cours, la responsable supprime un cours : « Supprimer ce cours », fermé au chargement, dit ce que la suppression emporte, et « Oui, supprimer » le retire
A2 | /m/centre-parcours : la séance ramenée plus tôt se voit au départ (JJ.MM.AAAA) et à l’arrivée (JJ.MM.AAAA)
19-og-locale | /m/centre-parcours : <meta property="og:locale" content="fr_CH">, et un og:locale:alternate par autre langue publiée
A2 | /m/centre-parcours/de : la séance ramenée plus tôt se voit au départ (JJ.MM.AAAA) et à l’arrivée (JJ.MM.AAAA)
19-og-locale | /m/centre-parcours/de : <meta property="og:locale" content="de_CH">, et un og:locale:alternate par autre langue publiée
D4 | les conditions ouvertes depuis /m/centre-parcours/de disent d’abord, dans cette langue, qu’elles n’existent qu’en français
A2 | /m/centre-parcours/it : la séance ramenée plus tôt se voit au départ (JJ.MM.AAAA) et à l’arrivée (JJ.MM.AAAA)
19-D7 | /m/centre-parcours/it : à l’arrivée, « Inizialmente <giorno> JJ.MM.AAAA », sans « In origine: » ni « il » devant le jour
19-og-locale | /m/centre-parcours/it : <meta property="og:locale" content="it_CH">, et un og:locale:alternate par autre langue publiée
D4 | les conditions ouvertes depuis /m/centre-parcours/it disent d’abord, dans cette langue, qu’elles n’existent qu’en français
D1 | /m/centre-parcours/en s’affiche, lang="en" dir="ltr"
D1 | /m/centre-parcours/en : <html lang="en" dir="ltr">
D1 | /m/centre-parcours/en : les deux cours y sont
D1 | /m/centre-parcours/en : la séance annulée reste visible, barrée, avec sa mention
A2 | /m/centre-parcours/en : la séance ramenée plus tôt se voit au départ (JJ.MM.AAAA) et à l’arrivée (JJ.MM.AAAA)
19-og-locale | /m/centre-parcours/en : <meta property="og:locale" content="en_GB">, et un og:locale:alternate par autre langue publiée
D1 | /m/centre-parcours/en : le nom accessible du lien des conditions est « Terms of use (opens in a new tab) », selon playwright et selon Chrome, et l’annonce est cachée aux yeux
D1 | /m/centre-parcours/en : le pied porte ce lien, vers /conditions, dans un nouvel onglet
D1 | /m/centre-parcours/en : aucune phrase de la page française n’y reste en français
D4 | les conditions ouvertes depuis /m/centre-parcours/en disent d’abord, dans cette langue, qu’elles n’existent qu’en français
A2 | /m/centre-parcours/ar : la séance ramenée plus tôt se voit au départ (JJ.MM.AAAA) et à l’arrivée (JJ.MM.AAAA)
19-og-locale | /m/centre-parcours/ar : <meta property="og:locale" content="ar_AR">, et un og:locale:alternate par autre langue publiée
D4 | les conditions ouvertes depuis /m/centre-parcours/ar disent d’abord, dans cette langue, qu’elles n’existent qu’en français
19-cours-seance-barree | /m/centre-parcours/cours/<id> : dans « Prochaines séances », la séance annulée du JJ.MM.AAAA reste, barrée, avec « Annulé »
19-og-locale | /m/centre-parcours/cours/<id> : <meta property="og:locale" content="fr_CH">, et un og:locale:alternate par autre langue publiée
19-og-locale | /m/centre-parcours/agenda : <meta property="og:locale" content="fr_CH">, et un og:locale:alternate par autre langue publiée
D1 | /m/centre-parcours/en/cours/<id> s’affiche
D1 | /m/centre-parcours/en/cours/<id> : <html lang="en" dir="ltr">
19-cours-seance-barree | /m/centre-parcours/en/cours/<id> : dans « Prochaines séances », la séance annulée du JJ.MM.AAAA reste, barrée, avec « Cancelled »
19-og-locale | /m/centre-parcours/en/cours/<id> : <meta property="og:locale" content="en_GB">, et un og:locale:alternate par autre langue publiée
D1 | /m/centre-parcours/en/agenda s’affiche
D1 | /m/centre-parcours/en/agenda : <html lang="en" dir="ltr">
19-og-locale | /m/centre-parcours/en/agenda : <meta property="og:locale" content="en_GB">, et un og:locale:alternate par autre langue publiée
19-cours-seance-barree | /m/centre-parcours/ar/cours/<id> : dans « Prochaines séances », la séance annulée du JJ.MM.AAAA reste, barrée, avec « ملغى »
19-og-locale | /m/centre-parcours/ar/cours/<id> : <meta property="og:locale" content="ar_AR">, et un og:locale:alternate par autre langue publiée
19-og-locale | /m/centre-parcours/ar/agenda : <meta property="og:locale" content="ar_AR">, et un og:locale:alternate par autre langue publiée
19-D8 | /m/association-voisine/agenda : « Le programme d’Association voisine s’ajoute à votre calendrier », dans la page et dans sa description, jamais « de Association »
D1 | le widget demandé en anglais pose le cadre de la page anglaise
D1 | le nom accessible du lien du widget est « See the full programme (opens in a new tab) », selon playwright et selon Chrome, et l’annonce est cachée aux yeux
D1 | dans le cadre anglais, aucune phrase du cadre français ne reste en français
A2 | la séance ramenée plus tôt a son RECURRENCE-ID (JJ.MM.AAAA) et sa nouvelle date, la veille (JJ.MM.AAAA)
E1 | sur un iPhone, le premier lien est l’abonnement webcal, sans Google ni Outlook
E1 | sur un Android, le lien ouvre Google Agenda avec la demande d’abonnement prête, dans un nouvel onglet
E1 | sur un PC Windows, le choix entre Google Agenda, Outlook, une autre application, et l’adresse à copier
E1 | la réponse dit aux caches qu’elle dépend de l’appareil (Vary)
E2 | sur un ordinateur, sous Outlook, le délai qu’il met à rafraîchir un abonnement : « Outlook peut mettre plus de 24 heures à rafraîchir un abonnement. »
19-agenda-android | sur un Android, la page d’abonnement : après le bouton de Google, « Si Google Agenda ne propose rien sur votre téléphone, ouvrez cette page sur un ordinateur : », puis l’adresse de la page dans son propre paragraphe, puis celle du flux, et plus « L’adresse à coller »
19-agenda-android | sur un Android, la page d’un cours : après le bouton de Google, « Si Google Agenda ne propose rien sur votre téléphone, ouvrez cette page sur un ordinateur : », puis l’adresse de la page dans son propre paragraphe, puis celle du flux, et plus « L’adresse à coller »
19-agenda-derniere-minute | la page renvoie à la page du programme pour un changement de dernière minute, sous l’aide du bouton d’Android et une fois sous le choix complet, et ne dit plus que Google peut mettre 24 heures
19-agenda-derniere-minute | sur un iPhone, les étapes à la main renvoient à la page du programme, une fois, après le délai d’Outlook
19-agenda-outlook | sur un ordinateur, dans les cinq langues, « Outlook (travail ou école) » ouvre outlook.office.com dans un nouvel onglet, et chaque Outlook dit à quels comptes il sert
19-agenda-page-du-cours | sur un iPhone, sous le nom de chaque cours, un lien « Page du cours » vers le bloc d’abonnement de sa page, d’au moins 44 px de haut
19-agenda-autre-appareil | sur un iPhone, le bloc finit par « Une autre application ou un autre appareil ? » en texte, puis le lien « Voir tous les choix », seul, vers ?appareil=tous
19-agenda-autre-appareil | sur un Android, le bloc finit par « Une autre application ou un autre appareil ? » en texte, puis le lien « Voir tous les choix », seul, vers ?appareil=tous
19-B11 | la page d’abonnement en arabe, sur un Android : l’aide du bouton de Google est exactement celle relue
D1 | /m/organisation-inconnue/en rend 404, avec <html lang="en" dir="ltr"> et aucune balise script
D1 | /m/organisation-inconnue/en : la page d’erreur dit « Page not found » et « Please check the address. »
19-404-organisation | /m/association-voisine/en/nulle-part, l’anglais, que l’organisation ne publie pas : le 404 est dans sa langue par défaut, l’arabe, et non en français, « الصفحة غير موجودة »
19-langue-non-activee | /m/association-voisine/en/agenda?appareil=tous, une langue que l’organisation ne publie pas : 307 vers /m/association-voisine/agenda?appareil=tous, la page dans sa langue par défaut
D2 | les N écrans de l’espace portent en haut le choix des cinq langues
D2 | en Deutsch, les N écrans sont dans cette langue, rien en français
D2 | en Italiano, les N écrans sont dans cette langue, rien en français
D2 | en English, les N écrans sont dans cette langue, rien en français
D2 | en العربية, les N écrans sont dans cette langue, rien en français
D2 | la langue choisie, l’italien, reste au rechargement
D2 | reconnectée dans un autre navigateur réglé en français, elle retrouve l’italien de son compte
D2 | revenue au français par le compte, le premier navigateur le suit
D2 | une langue choisie sur /connexion avant de demander le lien devient celle du compte : ouvert dans un autre navigateur, réglé en français, le lien arrive en allemand
19-adresse-sans-langue | le lien de connexion arrive à une adresse sans la langue qu’il portait : /organisations, sans « ?language= »
C1 | l’écran commence par « D’où viennent vos heures de prière ? », avec ses trois réponses
C1 | « Source que vous déclarez » a disparu, et rien du calcul n’est montré avant la réponse
C2 | par son nom, « Bienne », la localité « 2502 Biel/Bienne (BE) » est proposée
C2 | par son NPA, « 2502 », elle est proposée aussi
C2 | la localité choisie donne sa position, et l’attribution de swisstopo est écrite
C2 | la recherche n’a interrogé aucun service extérieur
C1 | « Voir l’aperçu » montre les sept prochains jours avant tout enregistrement, puis « Enregistrer »
C2 | la localité de Bienne est enregistrée, et l’écran dit que les heures en viennent
C2 | les heures des sept prochains jours sont servies au public, celles que le calcul donne pour la position de la localité dans la liste
C2 | avec JavaScript, « Hors de Suisse » reste ouvert pendant qu’on tape la latitude puis la longitude, touche par touche
C2 | avec JavaScript, Bienne enregistrée et cochée, taper une position coche « Hors de Suisse : utiliser la position donnée plus bas » à sa place
C2 | avec JavaScript, « Méthode de calcul, école et ajustements (facultatif) » reste ouvert pendant qu’on tape dans la recherche, touche par touche, puis quand la liste arrive
19-prieres-rue | « Rüe », le « ü » tapé d’un seul point de code : les premières localités proposées portent « Rüe », et Rue (FR) ne vient qu’après elles
19-prieres-rue | « Rüe », le « ü » tapé de deux points de code : les premières localités proposées portent « Rüe », et Rue (FR) ne vient qu’après elles
19-B4 | l’écran des prières en arabe, « importées depuis un fichier » : l’aide du modèle dit « النموذج مُعبّأ » et « ثم ارفعه هنا »
19-B5 | un fichier séparé par des tabulations, lu en arabe : le séparateur se lit « علامة الجدولة (Tab) »
19-B6 | vingt-cinq lignes refusées, vingt montrées : la ligne finale se lit « … و5 أخرى. »
19-prieres-angle | dans les cinq langues, l’aide de la règle des nuits courtes dit que « Proportionnelle à l’angle » donne des heures qui changent avec la méthode de calcul
B1 | l’heure d’une session du vendredi a son aide, avec un exemple
19-sermon | dans « Ajouter une session », « Langue du sermon » propose les huit langues d’enseignement, dans l’ordre, et son aide le dit
C4 | une session du vendredi est ajoutée
B1 | dans la carte d’une session, « À partir du » a l’aide d’une modification : « Changez cette date seulement pour corriger une erreur. »
D1 | Partager donne un message par langue publiée, les 5, le français de l’organisation d’abord et seul ouvert
D1 | chaque message porte sa langue et son sens, de droite à gauche en arabe
D1 | la session du vendredi y porte le nom de la prière dans la langue du message : « Freitagsgebet », « Preghiera del venerdì », « Friday prayer », « صلاة الجمعة »
C3 | l’horaire propose « heure fixe », « après une prière », « avant une prière »
C3 | avec JavaScript, le navigateur exige les champs de l’horaire choisi : les heures pour une heure fixe, les minutes et la durée avant une prière, et eux seuls
C3 | avec JavaScript, les minutes prennent les bornes du choix : de 1 à 120 avant une prière, de 0 à 240 après
C3 | « Hifz avant Maghrib » est créé, publié, le JOUR
C3 | la liste des cours dit « 10 min avant Maghrib »
C3 | sa fiche rouverte dit « avant une prière » et garde des minutes positives
C2 | /m/centre-parcours : « Tafsir du soir » affiche son heure, celle que le calcul donne pour la localité
C2 | /m/centre-parcours : « Cercle de lecture » affiche son heure, celle que le calcul donne pour la localité
C2 | /m/centre-parcours/ar : « Tafsir du soir » affiche son heure, celle que le calcul donne pour la localité
C2 | /m/centre-parcours/ar : « Cercle de lecture » affiche son heure, celle que le calcul donne pour la localité
C3 | la page publique dit « 10 min avant Maghrib », avec l’heure
C2 | le flux agenda dit « 15 min après Maghrib » pour « Tafsir du soir », comme la page, à l’heure que le calcul donne pour la localité
C2 | le flux agenda dit « Après Maghrib » pour « Cercle de lecture », comme la page, à l’heure que le calcul donne pour la localité
D1 | le flux agenda (?lang=en) dit « 15 min after Maghrib » pour « Tafsir du soir », comme la page, à l’heure que le calcul donne pour la localité
D1 | le flux agenda (?lang=en) dit « After Maghrib » pour « Cercle de lecture », comme la page, à l’heure que le calcul donne pour la localité
C2 | le flux agenda (?lang=ar) dit « بعد المغرب بـ15 دقيقة » pour « Tafsir du soir », comme la page, à l’heure que le calcul donne pour la localité
C2 | le flux agenda (?lang=ar) dit « بعد المغرب » pour « Cercle de lecture », comme la page, à l’heure que le calcul donne pour la localité
C4 | la page publique propose quatre vues, dont « Prières »
C4 | l’onglet montre les heures du jour, adhan et iqama, les sept prochains jours et la prière du vendredi
C4 | en arabe, l’onglet « مواقيت الصلاة », de droite à gauche, avec le jour en chiffres latins
C4 | /m/centre-parcours/ar?vue=prieres : aucun chiffre arabe oriental
C4 | dans le widget, l’onglet « Prières » s’ouvre dans le cadre, qui reste encadré
19-widget-prieres | le widget posé avec view="prieres" ouvre son cadre sur l’onglet « Prières », encadré, et son pied mène au même onglet
C1 | à 390 px de large, axe ne relève rien de sérieux sur les trois réponses de l’écran des prières, heures servies comprises
B1 | à 390 px, supprimer « Grande salle », qu’un cours occupe, demande d’abord de confirmer, et la demande se voit sans défiler
C4 | à 390 px de large, axe ne relève rien de sérieux sur l’onglet « Prières », en français et en arabe, tableau de la semaine compris
A1 | sans JavaScript, les options de chaque séance sont fermées au chargement, et aucun bouton « Annuler cette séance » ne se voit
A1 | sans JavaScript, « Annuler ou déplacer » ouvre les options de sa carte, et d’elle seule
B1 | sans JavaScript, une session du vendredi se supprime : ouvrir « Supprimer cette session », confirmer, et elle a disparu, « La session est supprimée. »
19-cours-sans-js | sans JavaScript, « avant une prière » choisi sur un nouveau cours, heures vidées, s’envoie, et la page revient avec les champs de la prière et la phrase des minutes
19-cours-sans-js | sans JavaScript, « après une prière » choisi sur la page revenue pour « avant une prière » laisse partir 0 minute comme 180
19-cours-premier-jour | sans JavaScript, un cours à dates précises tapées dans le désordre, le premier jour vide : il s’enregistre, avec la première date, JJ.MM.AAAA, pour premier jour
19-D3 | sans JavaScript, « Supprimer ce cours » s’ouvre, et « Oui, supprimer » retire le cours
C2 | sans JavaScript, Bienne enregistrée, la position 48.8566, 2.3522 tapée sous « Hors de Suisse », cette case cochée, s’enregistre à sa place : l’écran le dit, et les heures servies sont celles de cette position
C2 | sans JavaScript, de cette position, Bienne se cherche, se coche et s’enregistre de nouveau : l’écran nomme la localité, et les heures redeviennent les siennes
19-prieres-hors-de-suisse | sans JavaScript, Bienne enregistrée et cochée, la position tapée sous « Hors de Suisse », sans toucher à la liste, s’enregistre à sa place : l’écran le dit, et les heures servies sont celles de cette position
19-prieres-hors-de-suisse | sans JavaScript, Bienne enregistrée et cochée, la latitude seule vidée sous « Hors de Suisse » : l’écran revient avec l’erreur « Donnez la latitude et la longitude, ou aucune des deux. », « Hors de Suisse » cochée, et ce repli ouvert sur la longitude gardée
19-D5 | sans autre période, l’aperçu d’une nouvelle période vient sous un titre de niveau 3, et axe n’y relève plus « heading-order »
19-prieres-periode-passee | l’aperçu d’une période terminée le JJ.MM.AAAA le dit : « Cette période s’est terminée le JJ.MM.AAAA : elle ne change aucun des sept prochains jours, que l’aperçu montre. »
19-B7 | en arabe, après une période, l’aide de « Ajouter une période » dit que ses valeurs sont « مُعبّأة مسبقًا »
19-prieres-copie | une période au nom de soixante signes se copie pour l’année suivante : la marque « (année suivante) » entière, le nom raccourci, soixante signes au plus
D2 | depuis l’écran en allemand, la copie de « Winter » pour l’année suivante s’appelle « Winter (nächstes Jahr) »
19-cours-session-vendredi | l’adresse /cours/<id> d’une session du vendredi mène, dans les cinq langues, au 404 de l’espace, « Page introuvable », « Seite nicht gefunden », « Pagina non trovata », « Page not found », « الصفحة غير موجودة », et non au formulaire d’un cours
19-D2 | sur l’écran du vendredi, « Annuler cette session » envoyé pour le vendredi passé (formulaire modifié dans la page) est refusé en tête : « Cette session est déjà passée : … », sans confirmation
19-membres-salle | dans Réglages, « Supprimer » sur une salle déjà supprimée depuis un autre onglet dit « Cette salle n’existe plus. », et non « Salle supprimée. »
19-D2 | sur l’écran du vendredi, une session ajoutée dans une salle supprimée entre-temps est refusée, dans la section d’ajout, saisie gardée : « Cette salle n’existe plus : … »
19-sermon | une session au sermon en albanais et en turc, deux langues que la page publique ne publie pas : sa carte dit « Sermon en albanais et turc », et la page publique « albanais et turc »
19-B3 | l’écran du vendredi en arabe, après « Retirer de la page publique » : « لكنه يبقى هنا كمسودة »
19-prieres-jumua-brouillon | dans « Heures de prière », le vendredi, la cellule de Dhuhr dit « Jumu’a 12:30 », la session publiée, sans l’heure de celle en brouillon, 14:30
19-D4 | le vendredi, un cours publié « 30 min après Dhuhr » prend l’heure de la session publiée, 12:30, et non celle de la session en brouillon, 14:30 : 13:00 – 14:00 sur sa carte d’« À venir » et dans le programme de la semaine de chaque langue, 13:00 dans chaque message de son déplacement le même jour
19-D2 | dans un second onglet, « Publier » sur une session supprimée entre-temps est refusé en tête : « Cette session n’existe plus : elle a été supprimée entre-temps. La liste ci-dessous est à jour. »
19-D2 | sur l’écran du vendredi, « Déplacer » envoyé pour la veille (formulaire modifié dans la page) est refusé en tête : « Ce jour est déjà passé : rien n’a été déplacé. … », et rien n’est déplacé
19-retablir-nouvelle-date | une session déplacée à un autre jour : sur la ligne « Nouvelle date, à la place du JOUR JJ.MM.AAAA », « Rétablir comme d’habitude » la ramène à son vendredi
19-jour-sans-seance | « Annuler » envoyé pour un jour où il n’y a pas de séance (formulaire modifié dans la page) : une phrase qui le dit, en tête, sans confirmation sur l’écran du vendredi ni message préparé sur « À venir »
19-titre-langue-ecran | sur « À venir », une séance porte son titre dans la langue de l’écran : « Freitagsgebet » en allemand, « قراءة القرآن » en arabe
D1 | sur « À venir », le programme de la semaine nomme la session du vendredi dans la langue de chaque message : « Freitagsgebet », « Preghiera del venerdì », « Friday prayer », « صلاة الجمعة »
A2 | déplacée le même jour de 12:30 à 13:00, la session du vendredi porte sur sa carte « nouvelle heure » et « Prévue à l’origine : 12:30 – 13:15 »
B1 | le message prêt à coller le dit comme un changement d’heure, la date une seule fois : « … commence à 13:00 au lieu de 12:30. »
19-texte-vendredi | déplacée le même jour, la session du vendredi : le message dit « « Prière du vendredi » : la prière du JOUR JJ.MM.AAAA commence à 13:00 au lieu de 12:30. », sans « Le cours »
D1 | ce message nomme la session du vendredi dans la langue de chaque message : « Freitagsgebet », « Preghiera del venerdì », « Friday prayer », « صلاة الجمعة »
B1 | le programme de la semaine dit la session déplacée le même jour comme une nouvelle heure, dans chaque langue : « (nouvelle heure) », « (neue Uhrzeit) », « (nuovo orario) », « (new time) », « (وقت جديد) »
A2 | une carte restée ouverte dans un autre onglet, envoyée après ce déplacement, est refusée par une phrase en haut, et rien n’est écrit : la session reste à 13:00
19-D4 | sur « À venir », le refus d’une carte restée ouverte nomme la séance : « La séance « Prière du vendredi » du JOUR JJ.MM.AAAA a changé depuis l’ouverture de la page : … »
A2 | sur l’écran du vendredi, une carte restée ouverte dans un autre onglet, envoyée après ce déplacement (« Annuler cette session »), est refusée par une phrase en tête, et rien n’est écrit : la session reste déplacée à 13:00
19-texte-vendredi | annulée, la session du vendredi : le message dit « « Prière du vendredi » : la prière du JOUR JJ.MM.AAAA est annulée. », puis « Les autres prières du vendredi ont lieu comme d’habitude. », sans « Le cours »
19-annulee | annulée, la session du vendredi porte, dans les cinq langues, « Annulée », « Abgesagt », « Annullata », « Cancelled » et « ملغاة », accordé à la prière, dans la vue Semaine, l’onglet « Prières » et la vue Mois
B1 | avec JavaScript, le nom et la formule d’accueil tapés au clavier, puis une autre couleur : c’est ce qui a été tapé qui s’enregistre
19-membres-confirmations | sur sa propre ligne, « Donner le rôle d’éditeur » ne change rien au premier envoi : en haut, « Vous allez vous donner le rôle d’éditeur. », « Prendre le rôle d’éditeur » et « Ne rien changer »
B3 | une responsable qui se donne le rôle d’éditeur arrive sur « À venir », où une phrase, visible sans défiler, lui dit ce qui s’est passé et comment retrouver ses écrans
19-membres-confirmations | sur la ligne d’un autre membre, « Donner le rôle de responsable » demande d’abord de confirmer : « Vous allez donner le rôle de responsable à cette personne : <adresse> », ce qu’elle pourra faire, et « Donner ce rôle »
19-membres-confirmations | sur la ligne d’un autre membre, « Retirer de l’organisation » demande d’abord de confirmer : « Vous allez retirer cette personne de l’organisation : <adresse> », « Retirer cette personne », et « Ne rien changer », qui la laisse membre
19-membres-depart | une responsable qui se retire elle-même, depuis Membres, confirme d’abord, puis arrive sur « Vos organisations », où un encadré, avant le titre et visible sans défiler, dit qu’elle a quitté l’organisation
19-membres-quitter | dans « Vos organisations », la seule personne responsable de « Centre du Parcours » qui veut la quitter lit, dans les cinq langues, un refus qui la nomme et dit quoi faire, sans demande de confirmation, et reste membre
19-membres-quitter | dans « Vos organisations », « Quitter l’organisation » sur « Association voisine » : le bouton porte son nom pour les lecteurs d’écran, l’écran demande de confirmer en la nommant, puis l’encadré dit le départ, et l’organisation a quitté la liste
19-membres-quitter | membre d’une seule organisation, sans invitation qui attende, elle trouve dans la navigation un seul lien vers /organisations, « Vos organisations », dans les cinq langues, à la place de « Changer d’organisation »
A3 | aucune date écrite AAAA-MM-JJ sur les N écrans traversés (espace, super-admin, page publique, widget)
F1 | aucun des N écrans traversés ne nomme la personne retirée du dépôt
`
	.trim()
	.split('\n')
	.filter(Boolean);

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
	await vendrediEtape19(page);
	await vendrediSurLAccueil(page);
	await reglagesAuClavier(page);
	await devenirEditrice(navigateur, page);
	await quitterLaVoisine(page);
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

// Le catalogue, comparé à ce qui a été joué : une vérification du catalogue qui n'a pas tourné n'a
// pas été jouée ; une vérification jouée qui n'est pas au catalogue manque à la liste.
const cle = (ligne) => `${ligne.retour} | ${neutre(ligne.quoi)}`;
const catalogue = new Set(CATALOGUE);
const joueesParCle = new Set(jouees.map(cle));
const jamaisJouees = CATALOGUE.filter((entree) => !joueesParCle.has(entree));
const horsCatalogue = [...joueesParCle].filter((entree) => !catalogue.has(entree));
if (RELEVE || jamaisJouees.length > 0) {
	etape(`Les vérifications du catalogue jamais jouées, une par ligne (${jamaisJouees.length})`);
	for (const entree of jamaisJouees) process.stdout.write(`  ${entree}\n`);
}
if (horsCatalogue.length > 0) {
	etape(
		`Les vérifications jouées qui manquent au catalogue, une par ligne (${horsCatalogue.length})`
	);
	for (const entree of horsCatalogue) process.stdout.write(`  ${entree}\n`);
}

/** Le bilan d'un groupe de retours : jouées, vertes, rouges, impossibles, jamais jouées. */
function bilanDe(nom, lettres) {
	const dans = (ligne) => lettres.includes(ligne.retour);
	const sesJouees = jouees.filter(dans);
	const sesRouges = sesJouees.filter((ligne) => !ligne.ok);
	const sesJamais = jamaisJouees.filter((entree) => lettres.includes(entree.split(' | ')[0] ?? ''));
	process.stdout.write(
		`  ${nom} : ${lettres.length} retours, ${sesJouees.length} vérifications jouées, ${sesJouees.length - sesRouges.length} vertes, ` +
			`${sesRouges.length} rouges ; ${impossibles.filter(dans).length} geste(s) impossible(s) ; ` +
			`${sesJamais.length} jamais jouée(s) ; ${lettres.filter((lettre) => sansLigne.includes(lettre)).length} retour(s) sans ligne\n`
	);
}
process.stdout.write('\n');
bilanDe('étape 18', RETOURS_DE_L_ETAPE_18);
bilanDe('étape 19', RETOURS_DE_L_ETAPE_19);
process.stdout.write(
	`\n  ${jouees.length} vérifications des retours jouées, ${jouees.length - rouges.length} vertes, ${rouges.length} rouges ; ` +
		`${impossibles.length} geste(s) impossible(s), dont le bloc s’est arrêté là ; ` +
		`${jamaisJouees.length} vérification(s) du catalogue (${CATALOGUE.length}) jamais jouée(s) ; ` +
		`${sansLigne.length} retour(s) non atteint(s) ; ${ecransLus.size} écrans lus ; ${Math.floor(duree / 60)} min ${duree % 60} s\n`
);

if (echoue) {
	process.stderr.write(`\nLe parcours s’est arrêté après ${verifications} vérifications.\n`);
	process.exit(1);
}
if (
	rouges.length > 0 ||
	impossibles.length > 0 ||
	sansLigne.length > 0 ||
	jamaisJouees.length > 0 ||
	horsCatalogue.length > 0
) {
	process.stderr.write(
		`\nLe parcours va au bout (${verifications} vérifications), mais ${rouges.length} vérification(s) ` +
			`de retours tombent, ${impossibles.length} geste(s) sont impossibles, ${sansLigne.length} ` +
			`retour(s) n’ont aucune ligne, ${jamaisJouees.length} vérification(s) du catalogue n’ont pas ` +
			`été jouées et ${horsCatalogue.length} vérification(s) jouées manquent au catalogue.\n`
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

# ADR 0021 : Espace des responsables — structure et vocabulaire

## Contexte

Le cadrage promet « une seule saisie » pour quatre sorties. L'espace des responsables est cette
saisie. Il est utilisé depuis un téléphone, souvent sur place, par deux ou trois personnes qui ne
sont pas des informaticiennes et qui ne s'en serviront qu'une fois par semaine — parfois moins.

Trois choses en découlent, et elles décident de tout le reste : les mots doivent être ceux de
l'organisation, pas ceux de la base ; ce qui est fréquent doit être à un geste ; et rien ne doit
dépendre de JavaScript, parce qu'un réseau de sous-sol n'est pas un réseau de bureau.

## Décision

### Cinq écrans, dans cet ordre

| Écran        | Ce qu'on y fait                                                                   |
| ------------ | --------------------------------------------------------------------------------- |
| **À venir**  | les sept prochains jours ; annuler, déplacer, rétablir une séance                 |
| **Cours**    | la liste avec le rythme en clair ; créer, modifier, poser une pause               |
| **Partager** | le lien public, le programme de la semaine en texte, le code à coller, un QR code |
| **Membres**  | inviter, retirer, changer un rôle (`org_admin`)                                   |
| **Réglages** | nom, fuseau, couleur, langues, salles, formule d'accueil (`org_admin`)            |

**À venir est l'accueil**, et non la liste des cours. Ce qu'on vient faire un mardi soir, c'est
annuler la séance de demain, pas relire la fiche d'un cours.

### Le vocabulaire

Celui de l'organisation : « séance » et non « occurrence », « cours » et non « événement »,
« public » et non « audience », « Maghrib » et non « `prayer` `anchor` ». Le rythme s'affiche en
phrase — « chaque semaine, le lundi et mercredi », « le dernier samedi du mois » — et jamais en
règle de récurrence.

### Ce que l'écran ne calcule pas

**Tous les aperçus viennent de `@jadwal/core`** : les sept prochains jours, le résumé qui se met à
jour pendant la saisie, les prochaines dates. Refaire l'arithmétique dans l'interface donnerait deux
vérités, et celle de l'écran serait la moins testée. Un test compare, pour les mêmes données, ce que
l'écran affiche à ce que `expandOccurrences` calcule.

### Ce que le responsable ne saisit jamais

Les identifiants. Ils sont produits par le système, en UUID v7 (ADR 0014), et les contraintes d'`UID`
de l'étape 1 — pas d'espace, pas de virgule, jamais un identifiant qui finit par une date — ne
remontent donc jamais jusqu'à lui.

### Les gestes fréquents

- **Annuler** demande une confirmation qui rappelle, en toutes lettres, que le cours continue les
  autres semaines. C'est la confusion la plus probable, et elle se corrige par une phrase.
- **Déplacer** propose toute date à partir d'aujourd'hui, plus tôt ou plus tard que la date prévue,
  et une heure. Un déplacement qui ne change ni la date ni l'heure d'une séance de l'écran est
  refusé. Le même jour à une autre heure, la carte et le message disent un changement d'heure, et
  non de date.
- **Annuler** et **Déplacer** ne visent qu'une séance encore prévue telle quelle. Une page restée
  ouverte qui envoie la carte d'une séance annulée ou déplacée depuis est refusée : rien n'est écrit,
  et l'écran rendu est à jour.
- **Rétablir** défait l'un comme l'autre.
- Après une annulation ou un déplacement, **le message prêt à coller s'affiche**. C'est ce que les
  responsables font déjà à la main, dans WhatsApp.

> **Révisé le 2026-09-26, à l'étape 18 (retour A2).** Déplacer proposait les six jours qui suivent
> la séance, et un changement plus lointain passait pour un changement de rythme. Les essais de
> l'étape 18 ont montré le défaut : une séance ne pouvait être ni avancée, ni reportée de deux
> semaines, et un changement de rythme n'est pas fait pour un seul jour. Le champ « Nouvelle date »
> accepte désormais toute date à partir d'aujourd'hui, dans le fuseau de l'organisation, sans limite
> vers l'avant. C'est l'action qui refuse une date passée, et non le seul champ du navigateur, qu'un
> formulaire envoyé à la main contourne. (Depuis l'étape 19, la limite vers l'avant est le
> 31.12.2100, et le champ la porte : voir l'addendum du 27.09.2026.)
>
> Le champ s'ouvre sur la date et l'heure prévues, pour que changer seulement l'heure reste un geste
> simple. En contrepartie, l'action refuse un déplacement qui ne change ni la date ni l'heure, avec
> une phrase qui dit de choisir une autre date ou une autre heure. L'accepter écrivait une exception
> vers la séance elle-même : la séance s'affichait deux fois le même jour, et le message prêt à
> coller annonçait un déplacement du mercredi au même mercredi, à la même heure. L'heure prévue est
> celle que calcule `@jadwal/core` pour ce jour-là, et non une valeur renvoyée par le formulaire. Le
> même jour à une autre heure reste un déplacement, comme le même jour pour une séance affichée sans
> heure, qui en reçoit une.

> **Révisé le 2026-09-26, à l'étape 18 (relecture du lot 4).** Le refus ne tenait pas sur tous les
> chemins. Une page restée ouverte, par Retour, dans un autre onglet ou chez une autre personne,
> montrait encore la carte d'une séance déjà déplacée ou annulée. Envoyée sans changement, cette
> carte écrivait un déplacement de la séance vers elle-même, qui écrasait le premier ; une
> annulation devenait de la même façon un déplacement. Annuler et Déplacer n'écrivent donc plus que
> pour une séance qui n'a encore ni annulation ni déplacement ce jour-là. Sinon, l'action répond que
> la séance a changé depuis l'ouverture de la page, que rien n'a été enregistré et que le programme
> affiché est à jour, puisque la page est rendue de nouveau. L'heure prévue qui sert à refuser un
> déplacement sans changement est celle des sept jours de l'écran, les seuls que ses cartes
> proposent : un formulaire fabriqué à la main pour une séance plus lointaine n'est pas comparé.
>
> Un déplacement le même jour à une autre heure se disait comme un changement de date : la carte
> d'arrivée portait « date exceptionnelle » et « Prévue à l'origine » suivi du même jour, et le
> message répétait la date. La carte porte maintenant « nouvelle heure » et l'heure prévue, et le
> message ne donne la date qu'une fois, avec la nouvelle heure et celle d'avant.

### Le JavaScript améliore, il n'est jamais nécessaire

Toutes les écritures passent par des `form` actions. Sans JavaScript : les onglets de langue sont
tous dépliés, le résumé affiche l'état enregistré au lieu de suivre la frappe. Rien ne manque. Les
options d'une séance (« Annuler ou déplacer ») sont un élément `details` natif : fermées par
défaut, elles s'ouvrent et se ferment avec ou sans JavaScript, et n'ouvrent que leur carte
(révision de l'étape 18, retour A1 ; avant, elles étaient toutes ouvertes au chargement). Les tests
postent des formulaires `application/x-www-form-urlencoded` avec `accept: text/html`, ce qui est
exactement le chemin d'un navigateur sans JavaScript.

**Une seule exception**, et elle est bornée : l'écran de passkey du super-admin. WebAuthn est une
API du navigateur ; il n'existe pas de formulaire qui crée une passkey. L'écran le dit au lieu de
présenter un bouton inerte.

### Texte brut, partout

Aucun HTML saisi n'est jamais rendu. Svelte échappe ce qu'il affiche, et un test envoie des charges
habituelles dans chaque champ puis relit les pages pour vérifier qu'elles sortent en texte.

### Performance et accessibilité

- L'écran d'accueil tient en **cinq requêtes** — réglages, cours, exceptions, pauses, heures de
  prière — quel que soit le nombre de cours. Jamais une requête par cours.
- Tout est rendu côté serveur.
- Cibles tactiles d'au moins 44 pixels, libellés reliés à leurs champs, erreurs annoncées
  (`role="alert"`), navigation au clavier complète.

### Traductions

Les textes sont saisis dans la langue source de l'organisation. Les traductions sont facultatives :
un onglet par langue activée, vide par défaut, et **aucune traduction automatique** ici. La
pré-traduction validée par le responsable est dans la feuille de route, pas dans la V1.

## Conséquences

- Un responsable peut, depuis un téléphone, créer les cours de son organisation, en annuler un, en
  déplacer un autre, poser une pause et copier le message de la semaine.
- L'interface ne peut pas afficher une séance que le cœur n'aurait pas calculée, ni en manquer une :
  c'est le même code qui répond aux quatre sorties du cadrage.
- Le résumé pendant la saisie est un confort. Il disparaît sans JavaScript, et le formulaire
  fonctionne quand même.
- Les pauses sont sur l'écran des cours parce que c'est là qu'on a la liste sous les yeux : une
  pause vise un cours, ou toute l'organisation.
- L'écran **Partager** montre déjà le lien public et le code à coller, marqués « à venir » tant que
  les étapes 5 et 6 ne sont pas faites. Dire qu'une chose n'existe pas encore vaut mieux que de
  laisser croire qu'elle marche.

## Addendum du 27.09.2026 : ce que l'ADR ne disait pas, et la relecture d'« À venir » (étape 19)

### La carte envoie l'heure qu'elle montrait

Depuis la relecture du lot 5 de l'étape 18, le formulaire « Déplacer » d'une carte envoie, sans le
montrer, `plannedStart` : l'heure de la séance telle que la carte l'affichait, vide pour une séance
sans heure. Quand l'heure du cours a changé depuis dans sa fiche, la séance n'est plus prévue à
cette heure-là : l'action refuse la carte (`timeChanged`, 409), quelle que soit la date choisie, et
rien ne s'écrit. Sans ce refus, une carte renvoyée telle quelle déplaçait la séance à l'ancienne
heure, avec le message « commence à 19:00 au lieu de 20:00 ». La carte se rouvre sous la nouvelle
heure et propose l'heure actuelle, sauf une heure que la personne avait tapée. Un formulaire sans
ce champ, ou une séance hors des sept jours de l'écran, n'est pas comparé.

### Les refus de l'écran du vendredi

L'écran du vendredi (ADR 0033) suit la règle d'« À venir » pour une page restée ouverte : annuler
et déplacer n'écrivent que pour une session encore prévue telle quelle ce jour-là. Comme « À
venir », il refuse l'annulation d'un jour déjà passé, et depuis l'étape 19 (lot 2) un déplacement
vers un jour passé (`pastDate`) : sa liste de jours commence aujourd'hui, mais un formulaire écrit à
la main peut en envoyer un d'avant, et l'écran l'écrivait.

Chaque refus a son nom, que l'écran écrit dans la langue de la personne. Ceux des gestes de « Ce
vendredi » et des boutons d'une session s'affichent en tête de l'écran :

| Refus             | Statut | Quand                                                                                                                                                   |
| ----------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `changed`         | 409    | la session a déjà été annulée ou déplacée ce jour-là, ici ou sur À venir ; pour Rétablir, la ligne montrait un autre changement, même semblable (lot 2) |
| `timeChanged`     | 409    | l'heure de la session a changé depuis l'ouverture de la page                                                                                            |
| `alreadyRestored` | 409    | un second Rétablir : la session n'a plus rien à rétablir ce jour-là (relecture de D2)                                                                   |
| `unchanged`       | 400    | le déplacement vise le jour et l'heure où la session est déjà prévue                                                                                    |
| `pastSession`     | 400    | l'annulation d'un jour déjà passé (étape 19, D2)                                                                                                        |
| `pastDate`        | 400    | un déplacement vers un jour déjà passé (étape 19, lot 2)                                                                                                |
| `notPlanned`      | 400    | annuler ou déplacer la session un jour où elle n'a pas lieu, un lundi ou après sa fin (lot 3)                                                           |
| `sessionGone`     | 404    | la session n'existe pas, ou plus, ou l'identifiant est celui d'un cours                                                                                 |
| `dateUnreadable`  | 400    | une date illisible, impossible (un 30 février) ou hors des années 1970 à 2100                                                                           |
| `timeUnreadable`  | 400    | une heure illisible ou impossible, 25:99 par exemple                                                                                                    |

Ceux du formulaire d'une session, à l'ajout comme à la modification, restent dans ce formulaire,
avec la saisie :

| Refus                   | Statut | Quand                                                                          |
| ----------------------- | ------ | ------------------------------------------------------------------------------ |
| `titleTooLong`          | 400    | un titre de plus de 120 signes                                                 |
| `orderInvalid`          | 400    | un rang autre que la première, la deuxième ou la troisième session             |
| `timesMissing`          | 400    | une heure de début ou de fin absente, illisible ou impossible                  |
| `endBeforeStart`        | 400    | une heure de fin qui ne vient pas après l'heure de début                       |
| `sermonLanguageMissing` | 400    | aucune langue du sermon cochée parmi les huit langues d'enseignement (lot 2)   |
| `startDateMissing`      | 400    | une date « À partir du » absente, illisible, impossible ou hors de 1970 à 2100 |
| `endDateUnreadable`     | 400    | une date « Jusqu'au » illisible, impossible ou hors de 1970 à 2100             |
| `endDateBeforeStart`    | 400    | une date « Jusqu'au » qui vient avant la date « À partir du »                  |
| `roomGone`              | 400    | la salle choisie n'existe pas, ou plus, dans l'organisation (étape 19, D2)     |
| `orderTaken`            | 409    | à l'ajout, une session sans date de fin occupe déjà ce rang                    |

La modification d'une session supprimée entre-temps n'a plus de carte : sa réponse s'écrit en tête
de l'écran, `sessionGone` (404), ou, quand la saisie a aussi des erreurs, la phrase de
`sessionGone` suivie de ces erreurs (400).

Relevé à l'étape 18 et corrigé à l'étape 19 (D2) : annuler ne comparait pas la date au jour de
l'organisation, et acceptait un vendredi passé ; Rétablir, Publier et Supprimer répondaient « fait »
pour une session inconnue et l'écrivaient au journal ; un identifiant mal formé, une salle
supprimée entre-temps, un 30 février ou 25:99 atteignaient la base, qui répondait alors par une
erreur 500. Chaque geste vérifie désormais chaque identifiant, chaque date et chaque heure avant la
base, et un refus n'écrit rien, pas même au journal.

La relecture de D2 a trouvé ce que ces vérifications laissaient passer. `isIsoDate` suit le
calendrier de `@jadwal/core`, qui a un an 0000 (ADR 0012), et PostgreSQL n'en a pas : Rétablir,
Déplacer et Enregistrer répondaient encore à « 0000-01-01 » par une erreur 500, ici comme sur
« À venir ». La base range le 31.12.9999, mais le flux agenda calcule le lendemain d'une date de
fin, en l'an 10000, que le calcul refuse : une session publiée qui finissait ce jour-là faisait
tomber le flux de toute l'organisation. Une date envoyée aux deux écrans s'accepte désormais de 1970
à 2100, les années que couvrent les tests du calcul (`isSupportedDate`), et reçoit sinon la phrase
d'une date illisible. Les champs de date portent les mêmes bornes (`min` et `max`) : « Nouvelle
date » sur « À venir », du jour même au 31.12.2100, et « À partir du » et « Jusqu'au » dans le
formulaire d'une session, du 01.01.1970 au 31.12.2100. Sans elles, le calendrier du navigateur
proposait le 31.12.2101, et la phrase d'une date illisible demandait de choisir dans ce calendrier
la date qui venait d'y être choisie. La limite vers l'avant, que la révision du 2026-09-26 disait
absente, est donc le 31.12.2100. Le caractère nul (U+0000), qu'aucun clavier ne tape mais qu'un formulaire écrit
à la main peut envoyer, et que PostgreSQL refuse dans un texte, est retiré des champs de texte d'une
session au lieu de donner une erreur 500.

Sa seconde relecture a trouvé un « Rétablir » qui répondait encore « fait » : pour une session qui
existe mais n'a plus rien à rétablir ce jour-là, parce qu'une page restée ouverte ou une autre
personne l'a déjà rétablie, il disait l'avoir rétablie et l'écrivait au journal. Il est refusé
désormais (`alreadyRestored`, 409), sur cet écran comme sur « À venir », et rien ne s'écrit, pas
même au journal : la suppression de l'exception rend ce qu'elle a supprimé, et le journal ne suit
que si elle a supprimé une ligne, comme pour Publier et Supprimer.

### À venir, après la relecture de l'étape 18 (D4)

- **Le programme de la semaine est celui de Partager** : les cours publiés seulement. Retirer les
  brouillons des séances de l'écran ne suffisait pas d'abord : la dernière session du vendredi, même
  en brouillon, donnait son heure à un cours prévu après le Dhuhr. Une seconde lecture du programme,
  pour les seuls cours publiés, a corrigé le programme de la semaine, mais pas la carte : sa relecture
  a montré un écran qui se contredisait, 15:00 sur la carte d'un cours publié et 14:00 dans le
  programme de la semaine, comme sur la page publique, et un message de déplacement qui disait « au
  lieu de 15:00 » à une communauté qui avait toujours lu 14:00. **Une session du vendredi en
  brouillon ne donne plus son heure au Dhuhr** (`readProgramme`, ADR 0033) : elle s'affiche à sa
  propre heure, mais n'a pas encore lieu. La carte, le message d'un déplacement et le programme de
  la semaine disent la même heure que la page publique, pour un cours publié comme pour un cours en
  brouillon. L'écran lit le programme une seule fois et en retire les brouillons pour la semaine :
  cinq requêtes, comme avant.
- **L'écran montre les brouillons**, et leur carte porte la marque `brouillon`.
- **Une carte « date exceptionnelle » a « Rétablir »**. Elle envoie la date prévue de la séance,
  celle que garde le changement, qui n'est pas toujours à l'écran : une séance peut être avancée
  de loin. Une séance qui n'a changé que d'heure garde un seul « Rétablir », sur la carte de son
  heure prévue, le même jour.
- **Le refus d'une carte périmée nomme la séance**, par son titre et sa date : `changed` et
  `timeChanged`, et `alreadyCancelled` et `alreadyRestored`, ci-dessous. Le titre, saisi par une
  personne, est isolé dans la phrase comme sur la carte (`<bdi>`, ADR 0007) : l'action rend le
  titre à part, et la page découpe la phrase autour de lui (`upcomingErrorParts`). Inséré tel quel,
  un titre latin qui finit par une ponctuation se retournait sur un écran arabe (relecture de D4).
- **Un second « Rétablir »**, par une autre personne ou depuis une page restée ouverte, n'a plus
  rien à rétablir : il est refusé (409, `alreadyRestored`) et n'écrit rien, pas même au journal
  (relecture de D2). Sa phrase s'écrit en haut de l'écran, et non dans la carte de la séance, de
  nouveau prévue : seuls les refus d'un déplacement se corrigent dans la carte.
- **Une seconde annulation de la même séance**, par une autre personne ou depuis une page restée
  ouverte, n'écrit rien (409, `alreadyCancelled`) mais donne le message prêt à coller : la séance
  est annulée, et la personne ne sait pas si la communauté a déjà été prévenue. Une carte qui annule
  une séance déplacée depuis reste refusée sans message.
- **Une séance disparue** dit que la liste ci-dessous est à jour, au lieu de demander de recharger
  une page qui l'est déjà : sans JavaScript, recharger renverrait le formulaire refusé.
- **Le titre d'une carte suit la langue de l'écran** quand le cours y est traduit, sinon celui de sa
  langue source, comme avant ; une session du vendredi au nom proposé prend le nom de la prière
  dans cette langue. Les messages restent écrits dans chaque langue publiée, la langue source
  d'abord : la langue par défaut pour la semaine, celle du cours pour une annulation ou un
  déplacement.

### Les écrans des cours, au lot 2 de l'étape 19

Ce que le lot 1 a corrigé sur « À venir » et le vendredi, le formulaire d'un cours et la liste des
cours l'avaient aussi. Chaque défaut a d'abord eu son test, puis sa correction, et aucune de ces
valeurs ne donne plus d'erreur 500 :

- une date s'accepte de 1970 à 2100 (`isSupportedDate`) : le premier jour, le dernier, chaque date
  d'un cours à dates précises et les deux dates d'une pause. L'an 0000 atteignait la base ; un cours
  publié qui finissait le 31.12.9999 faisait tomber le flux agenda de toute l'organisation. Les
  champs de date portent les mêmes bornes, et le résumé du formulaire les applique : le serveur les
  donne à la page, le résumé ne pouvant pas lire un module du serveur ;
- le caractère nul est retiré de chaque champ du formulaire d'un cours et de la raison d'une pause ;
- une salle qui n'est pas, ou plus, une salle de l'organisation est refusée avec sa phrase
  (`roomGone`), à sa place dans l'ordre du formulaire ; un identifiant de cours mal formé dans
  l'adresse de la fiche répond comme un cours inconnu ; une pause pour un cours qui n'existe plus
  reçoit `courseGone`, et retirer une pause déjà retirée reçoit `pauseGone` au lieu de « supprimée »,
  sans rien écrire au journal.

Les refus du formulaire d'un cours, à l'ajout comme sur la fiche, dans l'ordre de ses cadres :

| Refus                     | Quand                                                                     |
| ------------------------- | ------------------------------------------------------------------------- |
| `titleMissing`            | pas de titre dans la langue de saisie                                     |
| `descriptionWithoutTitle` | une description sans le titre de sa langue                                |
| `teachingMissing`         | aucune langue d'enseignement cochée                                       |
| `weekdaysMissing`         | chaque semaine, aucun jour coché                                          |
| `datesMissing`            | à dates précises, aucune date écrite                                      |
| `badDates`                | une date illisible, impossible ou hors de 1970 à 2100                     |
| `datesTwice`              | une date écrite deux fois                                                 |
| `datesBeforeStart`        | une date avant le premier jour                                            |
| `datesAfterEnd`           | une date après le dernier jour                                            |
| `timeMissing`             | heure fixe, une heure absente ou illisible                                |
| `minutesAfter`            | après une prière, hors de 0 à 240 minutes                                 |
| `minutesBefore`           | avant une prière, hors de 1 à 120 minutes                                 |
| `duration`                | par rapport à une prière, une durée hors de 5 à 1440 minutes              |
| `roomGone`                | la salle n'est pas, ou plus, une salle de l'organisation (lot 2)          |
| `startsOnMissing`         | pas de premier jour, ou un premier jour illisible ou hors de 1970 à 2100  |
| `endsOnUnreadable`        | un dernier jour illisible, impossible ou hors de 1970 à 2100 (lot 2)      |
| `endsBeforeStarts`        | un dernier jour avant le premier                                          |
| `refused`                 | une valeur que le formulaire ne peut pas envoyer (langue, public, prière) |
| `gone`                    | sur la fiche, le cours n'existe plus (404)                                |

Et quatre gestes de plus, décidés par le chef de projet :

- **Supprimer un cours**, réservé à la personne responsable, derrière une confirmation qui marche
  sans JavaScript (ADR 0046, addendum du lot 2). L'action juge au nombre de lignes supprimées : un
  cours qui n'existe plus reçoit une phrase, jamais « supprimé ».
- **Le message « nouveau cours »**, prêt à coller, sur la liste des cours après la publication d'un
  nouveau cours, qu'il soit créé publié ou qu'un brouillon soit publié depuis sa fiche : la liste
  s'ouvre alors avec `?publie=<identifiant>`. Il s'écrit dans chaque langue publiée, la langue du
  cours d'abord, comme les autres messages. Le bloc suit l'adresse : il s'affiche pour tout cours
  publié de l'organisation dont elle porte l'identifiant, après un rechargement, depuis un favori
  ou à la main aussi ; un brouillon ou un identifiant inconnu n'en ont pas. Le message ne dit que ce
  que la page publique dit déjà, et l'adresse permet de le retrouver. Les dates d'un cours à dates
  précises s'y écrivent comme dans la liste : les trois premières du calendrier. Elles
  s'enregistrent désormais dans cet ordre, quel que soit celui de la saisie, et la liste range
  celles d'un cours enregistré avant.
- **Ce que le formulaire remplit de lui-même** : sur un nouveau cours, la langue de saisie cochée
  comme langue d'enseignement, et, avec JavaScript, la case qui la suit tant qu'on n'a pas touché
  aux cases ; pour un cours à dates précises, le premier jour pris à la première date, pendant la
  saisie avec JavaScript, et par le serveur quand il arrive vide. Un premier jour choisi n'est
  jamais remplacé. Le champ n'est `required` qu'avec JavaScript, et jamais pour un cours à dates
  précises : sans script, le navigateur refusait d'envoyer un premier jour vide, et le serveur ne
  le remplissait donc jamais. Un premier jour pris par le service n'est pas choisi : après un envoi
  refusé, il revient rempli avec un champ caché qui le porte (`startsOnFromDates`), et le serveur
  le reprend de la première date tant qu'il revient tel quel, avec ou sans JavaScript ; changé à la
  main, il est choisi. Sans cette marque, il passait pour choisi au renvoi, et une coquille corrigée
  dans la date la plus ancienne faisait refuser le cours (relecture du lot 2).
- **Le résumé** marque en discret, avec « (facultatif) », chaque champ facultatif, rempli ou non,
  ne marque plus comme un manque un champ facultatif laissé vide, et donne une ligne au titre de
  chaque langue publiée. Sauf un titre qu'une description de sa langue attend : il est un manque,
  puisque le serveur refuse le cours sans lui. La liste signale un cours dont des dates précises
  tombent hors de sa période.

### Addendum du 27.09.2026 : Rétablir, sur les deux écrans (étape 19, lot 2)

Le lot 1 a laissé trois défauts, relevés par sa relecture et corrigés ici.

- **Rétablir envoie ce que sa carte montrait.** Annuler et Déplacer ne défont plus un changement
  fait ailleurs depuis l'étape 18 ; Rétablir, si. Une page restée ouverte sur une séance annulée,
  après qu'une autre personne l'avait rétablie puis déplacée, effaçait ce déplacement, qu'elle
  n'avait jamais vu. La carte envoie maintenant, sans le montrer, ce qu'elle montrait : l'exception
  elle-même, par son identifiant (`shownId`), et pour un déplacement le jour et l'heure d'arrivée
  (`shownToDate`, `shownToStart`). L'exception n'est retirée que si elle est celle-là, au même jour
  et à la même heure, dans la suppression même (`apps/web/src/lib/server/exceptions.ts`) : un
  changement écrit entre-temps n'est jamais effacé. Sinon, la carte reçoit le refus d'une carte
  périmée, `changed` (409), qui nomme la séance sur « À venir », et rien ne s'écrit, pas même au
  journal. Plus rien à rétablir reste `alreadyRestored`. Un formulaire qui n'envoie pas
  d'identifiant, écrit à la main ou venu d'une page ouverte avant ce lot, n'est pas comparé, comme
  l'heure `plannedStart` d'un déplacement.

  L'identifiant vient de la relecture du lot 2. La première version n'envoyait que l'état montré,
  `cancelled` ou `moved` avec le jour et l'heure : une séance annulée, rétablie puis annulée de
  nouveau ailleurs montrait la même chose qu'avant, et la carte restée ouverte sur la première
  annulation effaçait la seconde. Le service ne modifie jamais une exception : annuler et déplacer
  en écrivent une nouvelle, rétablir la retire. Un autre identifiant est donc un autre changement,
  même semblable. Le jour et l'heure restent comparés pour une exception changée sur place, ce que
  seul l'entretien fait. Le type ne s'envoie plus : la forme d'une exception le fixe
  (`session_exception_shape_ck`), une annulation n'a ni jour ni heure d'arrivée, un déplacement a
  les deux.

- **L'écran du vendredi refuse un déplacement vers un jour passé** (`pastDate`, 400), comme
  « À venir ». Une session déjà annulée ou déplacée ce jour-là reçoit d'abord `changed` : elle n'a
  rien à corriger, quel que soit le jour choisi.
- **La ligne « Nouvelle date, à la place du … » de l'écran du vendredi a « Rétablir comme
  d'habitude »**, comme la carte « date exceptionnelle » d'« À venir » : elle vise le vendredi d'où
  vient la session. Un changement d'heure le même jour garde un seul bouton, sur la ligne de l'heure
  habituelle.

### Addendum du 27.09.2026 : les reprises du lot 3 (étape 19)

Deux défauts relevés par les chantiers du lot 2, chacun prouvé d'abord par son test.

- **L'horaire d'un cours, sans JavaScript.** Les heures de début et de fin portaient `required`,
  comme les minutes et la durée d'un cours placé par rapport à une prière. Sans JavaScript, changer
  `Comment fixer l'heure ?` ne change pas la page : sur une page rendue pour une heure fixe, heures
  vides, le navigateur refusait d'envoyer le choix d'une prière, et il fallait taper des heures qui
  ne servent à rien pour voir les champs de la prière ; de même, dans l'autre sens, avec des
  minutes. C'est le mécanisme du premier jour, corrigé au lot 2 : ces champs ne sont `required`
  qu'avec JavaScript, où ils suivent le choix. Le serveur refuse toujours une heure fixe sans heure
  (`timeMissing`) et une prière sans minutes ou sans durée, avec leur phrase, et rien ne change
  avec JavaScript. Une organisation sans le module des prières n'a pas ce choix : l'heure fixe y
  est la seule, et ses deux heures restent `required`, avec ou sans JavaScript (relecture du
  lot 3).
- **Annuler et Déplacer un jour sans séance.** Aucune carte ne l'envoie, mais un formulaire écrit à
  la main, ou une page restée ouverte pendant que le rythme d'un cours changeait, annulait une
  session du vendredi un lundi, ou une séance d'« À venir » à toute date à partir d'aujourd'hui.
  L'action répondait « annulée », et la base gardait une exception qui ne tombe sur aucune séance,
  que le calcul ignore (`expandOccurrences`). Les deux écrans refusent désormais un jour où le cours
  ou la session n'a pas de séance (`notPlanned`, 400) : rien ne s'écrit, pas même au journal. Sur
  « À venir », la phrase nomme le cours, par son titre isolé (`<bdi>`, ADR 0007), et le jour.

  Les séances comptent comme l'écran les montre, par la même lecture (`seanceOn`, qui passe par
  `readProgramme` sur ce seul jour) : le rythme, le premier et le dernier jour, les pauses, et les
  séances arrivées d'un autre jour. Le jour peut être hors des sept jours de l'écran : une séance
  de la semaine suivante s'annule et se déplace toujours. Une séance arrivée d'un autre jour compte
  comme une séance, et ne reçoit donc pas cette phrase, mais elle ne s'annule ni ne se déplace sous
  ce jour-là : son exception y serait écrite là où le rythme n'a pas de séance, et le calcul
  l'ignorerait. Sa carte n'a que « Rétablir », et l'envoi reçoit le refus d'une carte périmée
  (`changed`, 409), comme une séance qui n'est plus prévue telle quelle. L'heure prévue qui sert à
  refuser un déplacement sans changement, ou une carte dont l'heure a changé, reste celle des sept
  jours de l'écran, comme l'a décidé l'étape 18.

  Rétablir ne change pas : un jour sans exception n'a rien à rétablir, et rien ne s'écrit depuis le
  lot 1 (`alreadyRestored`, 409). Un test le prouve maintenant sur les deux écrans, pour un jour où
  le cours n'a pas de séance. Un « Rétablir » sur une nouvelle date dont la date d'origine est
  passée reste tel quel : il attend une décision.

## Statut

Accepté, 2026-09-20. Étape 4 de la feuille de route (espace des responsables). Les numéros 0022 et
0023 restent libres. Révisé le 2026-09-26 (étape 18) : une séance se déplace à toute date à partir
d'aujourd'hui, un déplacement qui ne change rien est refusé, les options d'une séance sont fermées
par défaut, une page restée ouverte ne défait pas un changement, et un déplacement le même jour se
dit comme un changement d'heure. Complété le 27.09.2026 (étape 19) : l'heure que la carte montrait,
les refus de l'écran du vendredi, les dates que les deux écrans acceptent, et la relecture
d'« À venir » ; au lot 2, les écrans des cours, puis Rétablir qui envoie l'exception que sa carte
montrait, et l'écran du vendredi qui refuse un jour passé et rétablit une nouvelle date ; au lot 3,
les champs de l'horaire d'un cours, exigés seulement avec JavaScript, et les deux écrans qui
refusent d'annuler ou de déplacer une séance un jour où le cours n'en a pas.

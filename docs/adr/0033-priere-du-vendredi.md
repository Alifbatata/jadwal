# ADR 0033 : Prière du vendredi — des sessions par le même moteur que les cours

## Contexte

Une organisation tient une, deux, parfois trois prières du vendredi, à des heures différentes et
dans des langues différentes. L'exemple que l'exploitant décrit : une première à 12:10 en arabe et
en français, une seconde à 13:30 en arabe seulement. Les horaires changent selon la saison.

C'est **l'information la plus cherchée** sur la page d'une organisation, et c'est celle qui se
contredit le plus entre les canaux — l'affiche sur la porte, le groupe WhatsApp, la page Facebook,
le site.

Jusqu'à l'étape 7, le modèle ne la connaissait pas. Une organisation pouvait créer un « cours » du
vendredi à 12:10, mais rien ne disait que c'était la Jumu'a, rien n'ordonnait deux sessions entre
elles, et le mot affiché pour ses langues était « enseigné en », qui n'est pas le mot juste.

## La question

Un second modèle, à côté des cours ? Ou un type sur celui qui existe ?

## Décision

**Un type sur l'objet existant : `course.kind ∈ { 'course', 'jumua' }`.**

Je l'ai examiné avant de l'accepter, parce qu'un « type » sur un objet est le genre de raccourci qui
se paie plus tard. Voici le calcul.

Une session du vendredi a **exactement** les mêmes besoins qu'un cours : elle revient chaque semaine,
elle s'annule un jour donné, elle se déplace, elle est suspendue par une pause de l'organisation,
elle se traduit dans quatre langues avec repli sur la langue source, elle sort dans le flux agenda de
l'organisation et dans le sien, elle entre dans l'empreinte de cache, elle est isolée par
organisation, et elle passe du brouillon au publié.

Sept mécanismes. Un second modèle les dupliquerait tous, pour une différence qui tient en trois
colonnes. Et une duplication ne reste jamais synchronisée : la correction de l'étape 6 — les cours
ancrés absents des flux agenda — aurait dû être faite deux fois.

### Ce qui change malgré tout

- **`kind`** : `course` ou `jumua`.
- **`jumua_order`** : le rang, de 1 à 3, qui décide de l'ordre d'affichage. Nul pour un cours, et la
  base l'exige dans les deux sens (`(kind = 'jumua') = (jumua_order is not null)`).
- **Les langues**, qui sont la même colonne mais n'ont pas le même sens : `enseigné en` pour un
  cours, **`sermon en`** pour une session. Le mot change parce que la chose change.
- **Trois contraintes de forme**, que rien ne peut contourner : une session a une **heure fixe**
  (l'ancrer sur une prière n'aurait aucun sens, c'est elle qui remplace le Dhuhr), elle revient
  **chaque semaine**, et c'est le **vendredi**.

### Le prix, et la parade

Chaque écran qui liste des cours doit désormais dire s'il veut les cours, les sessions, ou les deux.
Un oubli ferait apparaître la Jumu'a dans la liste des cours d'un responsable.

La parade n'est pas la vigilance : c'est que **le tri se fait dans la lecture, pas dans l'écran**.
`readCourses(tx, statuses, kinds)` et son équivalent public prennent les types voulus, le défaut
étant **les deux** — ce qu'attendent le programme, les flux et le cache, pour qui une session est une
séance comme une autre. Deux écrans demandent explicitement : la liste des cours veut `['course']`,
l'écran du vendredi veut `['jumua']`. Un test exige que la liste des cours n'en contienne aucune.

### Les trois questions qu'on ne pose pas

Le formulaire d'une session ne demande ni le jour, ni le rythme, ni le public. Ils valent toujours
vendredi, chaque semaine, ouvert à tous. Les poser reviendrait à faire semblant qu'il y a un choix.

## La Jumu'a remplace le Dhuhr

Quand des sessions existent, l'heure du Dhuhr du vendredi n'est plus affichée seule. Cela vaut aussi
pour ce qui en **dépend**, et c'est le point le moins évident de cet ADR.

Un cours annoncé « 30 min après Dhuhr » un vendredi suivrait le Dhuhr astronomique — 12:34 — pendant
que l'organisation prie à 13:30. Ce serait faux. La règle est donc :

> Le vendredi, l'**iqama du Dhuhr** est l'heure de la **dernière** session.

Trois précisions, parce qu'elles comptent :

- **L'heure du soleil n'est pas touchée.** Le Dhuhr astronomique reste ce qu'il est : c'est un fait,
  et le fausser serait mentir. C'est l'iqama qui change, et l'iqama est par définition « quand la
  prière est appelée dans la salle » — le vendredi, elle l'est à la Jumu'a.
- **Le mécanisme est celui de l'étape 8**, sans rien de neuf : un cours suit déjà l'iqama quand elle
  existe (ADR 0004). Il n'y a pas de second chemin à maintenir.
- **La dernière session, et non la première.** C'est le moment où l'assemblée est encore là : après
  la première, une partie est repartie et la seconde n'a pas commencé. Le choix est discutable ; ce
  qui ne l'est pas, c'est qu'il faut en faire un, et celui-ci est écrit plutôt que subi.

## L'affichage

Décrit écran par écran dans `docs/maquettes/public-vendredi.md` et
`docs/maquettes/responsables-vendredi.md`, écrits **avant** le code. En résumé :

- Un bloc **en haut de la page publique**, avant les vues : heure, langues du sermon, salle. Deux ou
  trois lignes, jamais plus. C'est la seule chose qui passe devant la navigation.
- Le bloc décrit le **rythme habituel** et ne porte aucune exception : une session annulée ou
  déplacée se lit dans la vue Semaine, là où sont toutes les exceptions. Un bloc qui changerait
  chaque semaine ne serait plus une réponse, il serait une question de plus.
- Les sessions apparaissent **aussi** dans la vue Semaine, à leur place dans le vendredi, et dans la
  vue Tous les cours sous leur propre titre, en tête.
- Dans l'espace des responsables, elles ont leur écran, distinct de la liste des cours : une
  organisation y vient deux fois par an, au changement de saison, et elle ne doit pas les chercher
  parmi vingt cours.

## Conséquences

- Une organisation saisit ses sessions une fois et les corrige au changement de saison, comme elle
  réimprime son panneau. L'écran lui recommande de **clore** la session et d'en ajouter une nouvelle
  plutôt que d'en modifier l'heure : les vendredis passés gardent alors la leur.
- `docs/API.md` change : une séance porte `kind`, et une session porte en plus `jumuaOrder` et
  `sermonLanguages`. Un lecteur tiers peut donc les distinguer sans deviner.
- Le flux agenda contient les sessions comme des événements récurrents ordinaires, à heure fixe :
  aucun traitement particulier, et un abonné les voit apparaître sans rien faire.
- Un cours du vendredi ancré sur le Dhuhr change d'heure le jour où une organisation saisit sa
  première session. C'est voulu, et c'est la correction d'une erreur, pas une régression.
- La limite : trois sessions au plus. Aucune organisation connue n'en tient davantage, et la
  contrainte se relève d'un chiffre le jour où l'une le fait.

## Addendum du 27.09.2026 : le type d'une ligne ne change pas

Un cours reste un cours, et une session reste une session. Depuis la migration 0065, la suppression
d'un cours est réservée à la personne responsable ; celle d'une session restait ouverte à l'éditeur,
qui la faisait depuis l'écran Vendredi (ADR 0046), jusqu'à la migration 0073 (addendum du
28.09.2026). La modification reste ouverte à tout membre : sans autre règle, une éditrice faisait
d'un cours une session par un appel direct, puis la supprimait.

Le déclencheur `course_kind_fixed` (migration 0069) refuse que le type d'une ligne change, pour tous
les rôles. Aucun écran ne le faisait volontairement : l'écran Vendredi ne modifie qu'une session.
Le formulaire d'un cours, lui, écrivait `kind = 'course'` sur la ligne qu'on lui donnait, et faisait
un cours d'une session envoyée à son adresse ; il répond maintenant qu'il ne la connaît pas.

## Addendum du 27.09.2026 : les mots d'une session dans un message, et son écran (étape 19)

**Les messages prêts à coller.** Une session du vendredi annulée ou déplacée sur « À venir » était
annoncée comme un cours : « Le cours « Freitagsgebet » du … est annulé. Les autres séances ont lieu
normalement. » Le mot changeait déjà pour les langues du sermon ; il change aussi ici, dans les cinq
langues. Le titre vient d'abord, puis la phrase parle de la prière, et la dernière ligne des autres
prières du vendredi :

```
« Prière du vendredi » : la prière du vendredi 02.10.2026 est annulée.
Les autres prières du vendredi ont lieu comme d’habitude.
```

Il en va de même pour un déplacement à un autre jour, un changement d'heure le même jour, et une
heure donnée à une séance qui n'en avait pas. Le titre reste celui de la session : le nom proposé
par le service se lit dans la langue du message, un titre choisi par l'organisation reste tel quel.
Un cours garde ses mots.

**Les cartes d'« À venir ».** Le titre d'une carte suit la langue de l'écran quand le cours y est
traduit ; une session qui porte le nom proposé prend donc le nom de la prière dans la langue de
l'écran, par la même règle des cinq noms (`friday-title.ts`).

**Une session en brouillon ne remplace pas le Dhuhr.** La règle se lit désormais : le vendredi,
l'iqama du Dhuhr est l'heure de la **dernière session publiée**. C'était déjà le cas sur la page
publique, qui ne lit pas les brouillons ; l'écran « À venir » comptait aussi les sessions en
brouillon. Une organisation qui prépare une seconde session à 14:30 voyait alors, sur « À
venir », un cours prévu après le Dhuhr à 15:00, et son message de déplacement disait « au lieu de
15:00 » à une communauté qui lisait 14:00 partout ailleurs. Une session en brouillon s'affiche
toujours à sa propre heure ; elle ne donne la sienne au Dhuhr qu'une fois publiée (relecture de
D4, addendum du même jour de l'ADR 0021).

**L'écran du vendredi (D2).** Annuler un jour déjà passé est refusé, comme sur « À venir ».
Rétablir, Publier et Supprimer répondent qu'une session inconnue, ou un cours, n'existe plus, au
lieu de dire qu'ils l'ont fait et de l'écrire au journal ; Rétablir refuse de même une session qui
n'a plus rien à rétablir ce jour-là (`alreadyRestored`). Chaque identifiant, chaque date et chaque
heure est vérifié avant la base ; une salle qui n'existe pas, ou plus, a sa phrase dans le
formulaire. La liste des refus de l'écran est dans l'addendum du même jour de l'ADR 0021.

## Addendum du 27.09.2026 : la langue du sermon, parmi toutes les langues d'enseignement (étape 19, lot 2)

**La langue du sermon se choisit parmi les huit langues d'enseignement du service** : français,
allemand, italien, arabe, anglais, albanais, turc et bosnien (`LANGUES_D_ENSEIGNEMENT`, la liste des
noms de `apps/web/src/lib/public/affichage.ts`). Jusqu'ici, l'écran ne proposait que les langues que
l'organisation publie, et le serveur retirait les autres de l'envoi. Or la langue du sermon ne dit
pas dans quelle langue la page se lit : elle dit ce que les fidèles entendront. Le chef de projet
citait l'albanais, le turc et le bosnien : une communauté entend souvent le sermon dans une langue
que sa page publique ne parle pas. Un code hors de la liste est toujours écarté, et une session sans
langue du sermon toujours refusée.

La base n'avait rien à changer : `course.teaching_language` ne demande qu'une liste non vide, sans
valeur nulle (migration 0003), et ne connaît pas la liste des langues. L'affichage non plus : les
huit langues ont leur nom dans les cinq langues de l'interface depuis l'étape 18, et la page
publique, l'onglet Prières, le programme sur un site et l'écran du vendredi les écrivent en toutes
lettres dans la langue du lecteur. L'API rend les codes, comme avant ; un lecteur tiers peut donc
recevoir `sq`, `tr` ou `bs` pour une organisation qui ne publie pas ces langues (`docs/API.md`). Les
messages prêts à coller ne nomment pas la langue du sermon.

La liste du formulaire d'un cours, elle, ne change pas : les langues d'enseignement d'un cours
restent celles que l'organisation publie.

**L'écran du vendredi, à la suite du lot 1.** Déplacer refuse un jour passé, comme « À venir » ; la
ligne d'une session arrivée d'un autre jour a son « Rétablir », sauf, depuis l'étape 20, quand son
vendredi prévu est passé (addendum du 28.09.2026) ; et chaque « Rétablir » envoie ce que sa ligne
montrait, pour qu'une page restée ouverte n'efface pas un changement fait depuis (addendum du même
jour de l'ADR 0021).

## Addendum du 28.09.2026 : supprimer une session, et une session déplacée depuis un vendredi passé (étape 20)

**Supprimer une session est réservé à la personne responsable** (décision C3 du chef de projet),
comme supprimer un cours. La politique `course_delete` perd sa branche `kind = 'jumua'` (migration
0073), l'action `supprimer` de l'écran passe par la garde du responsable (l'éditeur est renvoyé à
l'accueil, et rien ne s'écrit), et le bouton « Supprimer cette session » n'est rendu que pour lui.
L'éditeur garde les autres gestes de l'écran : ajouter une session, la modifier, la publier,
l'annuler, la déplacer et la rétablir. L'écran Membres range ce geste parmi ceux du responsable,
« Supprimer une prière du vendredi » (ADR 0046). Le déclencheur `course_kind_fixed` reste : il
tient toujours le type d'une ligne.

**Une session déplacée depuis un vendredi passé** (décision C2) ne se rétablit plus sur ce vendredi,
ni ne se déplace de nouveau : sa ligne propose « Annuler cette session », qui l'annule à sa nouvelle
date et donne le message à copier, le seul que rend cet écran. Le détail, et les refus de ces
gestes, sont dans l'addendum du même jour de l'ADR 0021.

## Statut

Accepté, 2026-09-21. Étape 8 de la feuille de route. Complète l'ADR 0003 (récurrence) et l'ADR 0004
(ancrage sur une prière). Complété le 27.09.2026 (étape 19) : le type d'une ligne ne change pas ; les
mots d'une session dans les messages prêts à coller, les refus de son écran, et une session en
brouillon qui ne remplace pas le Dhuhr ; puis au lot 2, la langue du sermon parmi toutes les
langues d'enseignement. Complété le 28.09.2026 (étape 20) : supprimer une session est réservé au
responsable, et une session déplacée depuis un vendredi passé s'annule à sa nouvelle date.

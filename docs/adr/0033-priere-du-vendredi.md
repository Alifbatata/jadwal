# ADR 0033 : Prière du vendredi — des sessions par le même moteur que les cours

## Contexte

Une mosquée tient une, deux, parfois trois prières du vendredi, à des heures différentes et dans des
langues différentes. L'exemple que l'exploitant décrit : une première à 12:10 en arabe et en
français, une seconde à 13:30 en arabe seulement. Les horaires changent selon la saison.

C'est **l'information la plus cherchée** sur la page d'une mosquée, et c'est celle qui se contredit
le plus entre les canaux — l'affiche sur la porte, le groupe WhatsApp, la page Facebook, le site.

Jusqu'à l'étape 7, le modèle ne la connaissait pas. Une mosquée pouvait créer un « cours » du
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
que la mosquée prie à 13:30. Ce serait faux. La règle est donc :

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
- Dans l'espace des responsables, elles ont leur écran, distinct de la liste des cours : une mosquée
  y vient deux fois par an, au changement de saison, et elle ne doit pas les chercher parmi vingt
  cours.

## Conséquences

- Une mosquée saisit ses sessions une fois et les corrige au changement de saison, comme elle
  réimprime son panneau. L'écran lui recommande de **clore** la session et d'en ajouter une nouvelle
  plutôt que d'en modifier l'heure : les vendredis passés gardent alors la leur.
- `docs/API.md` change : une séance porte `kind`, et une session porte en plus `jumuaOrder` et
  `sermonLanguages`. Un lecteur tiers peut donc les distinguer sans deviner.
- Le flux agenda contient les sessions comme des événements récurrents ordinaires, à heure fixe :
  aucun traitement particulier, et un abonné les voit apparaître sans rien faire.
- Un cours du vendredi ancré sur le Dhuhr change d'heure le jour où une mosquée saisit sa première
  session. C'est voulu, et c'est la correction d'une erreur, pas une régression.
- La limite : trois sessions au plus. Aucune mosquée connue n'en tient davantage, et la contrainte se
  relève d'un chiffre le jour où l'une le fait.

## Statut

Accepté, 2026-09-21. Étape 8 de la feuille de route. Complète l'ADR 0003 (récurrence) et l'ADR 0004
(ancrage sur une prière).

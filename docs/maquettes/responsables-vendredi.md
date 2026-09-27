# La prière du vendredi, côté responsables

**Lien** : `/vendredi`, dans la navigation de l'espace des responsables sous le nom
`Prière du vendredi`, le titre même de l'écran (étape 18). L'écran n'existe que si les heures de
prière sont activées ; un éditeur y a accès comme une personne responsable.

Un écran distinct de la liste des cours, pour une raison simple : une organisation y vient deux fois
par an, au changement de saison, et elle ne doit pas avoir à chercher ses sessions parmi vingt cours.
Le moteur, lui, est le même : une session du vendredi est un cours d'un autre type (ADR 0033).

> **Récrit à l'étape 18.** Les libellés, les aides et les messages ci-dessous sont ceux du code à la
> fin de l'étape (`apps/web/src/lib/i18n/friday.ts`), dans les cinq langues. Modifier et supprimer
> une session s'ouvrent dans un repli fermé, qui marche sans JavaScript.

## Structure, de haut en bas

1. Titre de niveau 1 : `Prière du vendredi`.
2. **Deux phrases d'aide** :
   - `Indiquez ici l'heure de la prière du vendredi. Elle s'affiche en haut de votre page publique.
Le vendredi, elle remplace l'heure du Dhuhr partout : un cours prévu après le Dhuhr suit l'heure
de la dernière session.`
   - `La prière a lieu plusieurs fois le même vendredi, par exemple à 12:10 puis à 13:30 ? Ajoutez
une session pour chaque fois, jusqu'à trois.`
3. Les erreurs, ou la confirmation du dernier geste. Un formulaire de session refusé garde les
   siennes dans sa carte, rouverte, avec la saisie ; un enregistrement réussi est confirmé dans la
   carte de sa session.
4. **Les sessions**, dans leur ordre, chacune dans un cadre.
5. **Ajouter une session**, avec le formulaire vide, au premier rang libre. Quand trois sessions
   continuent sans date de fin, il n'y a plus de formulaire, mais la phrase `Vous ne pouvez pas
ajouter de session : trois sessions continuent déjà sans date de fin, et c'est le maximum. […]`,
   qui dit quoi faire. Le serveur tient la même règle pour une page ouverte avant : une session sans
   date de fin envoyée à un rang déjà pris est refusée, `Une autre session sans date de fin occupe
déjà ce rang. Choisissez un autre rang, ou remplissez d'abord « Jusqu'au » dans l'autre session.`
6. **Ce vendredi**, avec l'annulation et le déplacement.
7. `Les cours ont leur propre écran : une session du vendredi n'y figure pas, et un cours ne figure
pas ici.`, puis le lien `Aller aux cours`.

## Une session

```
Première session
12:10 – 12:50 · Grande salle
Sermon en arabe et français
Publiée : visible sur votre page publique.
Jusqu'au mercredi 25.11.2026

[Retirer de la page publique]
▸ Modifier cette session
▸ Supprimer cette session
```

- Le rang est en toutes lettres : `Première session`, `Deuxième session`, `Troisième session`.
- L'heure est toujours **fixe**, début et fin. Le formulaire ne propose pas d'ancrage sur une
  prière : c'est cette session qui tient lieu de Dhuhr, une fois publiée. Une session en brouillon
  ne remplace pas encore le Dhuhr, ni sur la page publique ni sur `À venir` (étape 19).
- `Sermon en …`, avec les langues écrites dans la langue de l'écran.
- L'état dit ce qu'il veut dire : `Publiée : visible sur votre page publique.` ou
  `Brouillon : pas encore visible sur votre page publique.` Le bouton qui suit est `Publier` ou
  `Retirer de la page publique`.
- `Jusqu'au <date>` seulement si la session a une date de fin.
- **Modifier cette session** ouvre le formulaire rempli.
- **Supprimer cette session** ouvre un avertissement : `Elle disparaîtra de cet écran et de votre
page publique, pour tous les vendredis. Pour un seul vendredi, annulez-la plutôt dans « Ce
vendredi », plus bas.`, puis `Oui, supprimer`. Un éditeur le peut comme une personne responsable :
  depuis l'étape 19, la base réserve la suppression d'un cours à la personne responsable, mais pas
  celle d'une session du vendredi (migration 0065).

## Ajouter ou modifier une session

Le même formulaire, dans les deux cas, dans cet ordre. Chaque aide est reliée à son champ.

| Champ                              | Forme                                       | Aide                                                                                                              |
| ---------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Titre`                            | texte, proposé dans la langue de la session | `Ce que les visiteurs lisent sur votre page publique. Exemple : Prière du vendredi`                               |
| `Rang dans la journée`             | liste : première, deuxième, troisième       | `Les sessions s'affichent dans cet ordre. Une seule prière le vendredi ? Gardez « Première session ».`            |
| `Heure de début`, `Heure de fin`   | heures                                      | `Du début du sermon à la fin de la prière. Exemple : de 12:10 à 12:50.`                                           |
| `Salle`                            | liste, avec `Pas de salle précise`          | `Une personne responsable crée les salles dans Réglages.`                                                         |
| `Langue du sermon`                 | cases, les langues de la page publique      | `Cochez chaque langue dans laquelle le sermon est dit. Seules les langues de votre page publique sont proposées.` |
| `Imam ou intervenant (facultatif)` | texte                                       | `Son nom s'affiche sur votre page publique. Exemple : Imam Youssef`                                               |
| `À partir du`                      | date                                        | voir sous le tableau                                                                                              |
| `Jusqu'au (facultatif)`            | date                                        | `Laissez vide si la session continue sans date de fin.`                                                           |
| `Description (facultatif)`         | texte long                                  | `Quelques mots pour les visiteurs, sur la page de la session. Exemple : La salle ouvre à 12:00.`                  |

L'aide de `À partir du` dépend du formulaire. Pour une nouvelle session : `La session a lieu chaque
vendredi à partir de cette date. Gardez la date du jour pour qu'elle commence tout de suite.` Dans
la carte d'une session enregistrée : `La session a lieu chaque vendredi à partir de cette date.
Changez cette date seulement pour corriger une erreur.`

Le titre proposé, et celui que prend un champ laissé vide, est le nom de la prière dans la langue où
la session s'écrit : la langue par défaut de l'organisation, celle que l'écran Partager met aussi en
tête. Avant, c'était la première langue cochée, donc le français dès qu'il l'était. Une session qui
porte le nom proposé par le service le montre dans la langue de l'organisation, même écrite avant
l'étape 18 sous « Prière du vendredi », et s'enregistre sous ce nom la prochaine fois. Ailleurs,
sur la page publique, dans les messages, le programme sur un site et le flux agenda, ce nom se lit
dans la langue du lecteur ; un titre écrit par l'organisation reste tel quel.

Sous `Jusqu'au`, la phrase du changement de saison : `L'heure change avec la saison ? Remplissez
« Jusqu'au » ici, puis ajoutez une nouvelle session : les vendredis passés gardent leur heure.` C'est
la même recommandation que pour un cours dont le rythme change, et pour la même raison.

Le bouton dit `Ajouter la session` pour une nouvelle, `Enregistrer les changements` pour une session
existante.

Ce que le formulaire **ne demande pas**, et pourquoi :

- **le jour** : c'est le vendredi, toujours ;
- **le rythme** : chaque semaine, toujours ;
- **le public** : `Ouvert à tous`, toujours.

## Ce vendredi

Titre de niveau 2 `Ce vendredi`, puis : `Pour un seul vendredi, vous pouvez annuler une session, ou
la déplacer à un autre jour ou à une autre heure.` Chaque session du prochain vendredi a sa ligne :

```
12:10 – 12:50 · Première session · vendredi 02.10.2026
Cette session seulement. Les autres vendredis ne changent pas.
[Annuler cette session]   Nouveau jour [liste]   Nouvelle heure [12:10]   [Déplacer]
```

- Une session annulée porte `Annulée ce jour-là`, une session déplacée
  `Déplacée au samedi 03.10.2026 à 15:00`, et sa nouvelle date
  `Nouvelle date, à la place du vendredi 02.10.2026`. Les deux premières ont le bouton
  `Rétablir comme d'habitude`.
- Une session annulée ou déplacée apparaît ensuite barrée dans la vue Semaine publique, comme une
  séance de cours.
- `Annuler` et `Déplacer` suivent la règle d'`À venir` : ils n'écrivent que pour une session encore
  prévue telle quelle ce jour-là. Une page restée ouverte qui envoie une session déjà annulée ou
  déplacée depuis, sur cet écran ou sur `À venir`, est refusée, et rien n'est écrit, pas même au
  journal. Le formulaire de déplacement envoie aussi l'heure qu'il montrait : si l'heure de la
  session a changé depuis l'ouverture de la page, la carte est refusée, vers ce vendredi comme vers
  un autre jour. Un déplacement vers le jour et l'heure déjà prévus est refusé aussi. Jusqu'au lot
  5 de l'étape 18, une page restée ouverte défaisait un changement fait ailleurs, et une session
  supprimée entre-temps donnait une erreur 500.
- `Annuler` refuse un jour déjà passé, comme sur `À venir` : aucune ligne ne le propose, mais la
  page d'une semaine d'avant restée ouverte peut l'envoyer (étape 19, D2). `Déplacer`, lui, ne
  refuse pas un jour d'arrivée passé : sa liste de jours commence aujourd'hui, et seul un formulaire
  écrit à la main peut en envoyer un d'avant. `À venir`, dont le champ de date est libre, le refuse.
- `Rétablir comme d'habitude`, `Publier`, `Retirer de la page publique` et `Oui, supprimer`
  répondent `Cette session n'existe plus` à une session supprimée entre-temps, ou à un cours, et
  n'écrivent rien, pas même au journal. Avant l'étape 19, ils disaient l'avoir fait, et
  l'écrivaient au journal. `Rétablir comme d'habitude` refuse de même une session qui n'a plus
  rien à rétablir ce jour-là : une page restée ouverte, après qu'une autre l'a déjà rétablie
  (relecture de D2).
- Chaque identifiant, chaque date et chaque heure envoyés sont vérifiés avant la base : un
  identifiant mal formé, un 30 février, 25:99 ou une date hors des années 1970 à 2100 (l'an 0000,
  le 31.12.9999) reçoivent une phrase, et non une erreur 500. Le calendrier de `À partir du` et de
  `Jusqu'au` ne propose que ces années-là, du 01.01.1970 au 31.12.2100. Le caractère nul, qu'aucun
  clavier ne tape et que la base refuse dans un texte, est retiré du titre, de la description et
  du champ `Imam ou intervenant`.

## Ce que dit l'écran après un geste

Une phrase par geste, au lieu d'un « Enregistré. » unique :

- `La session est ajoutée.`, `Les changements sont enregistrés.`, `La session est supprimée.` ;
- `La session est publiée : elle s'affiche sur votre page publique.` ;
- `La session est retirée de votre page publique. Elle reste ici, en brouillon.` ;
- `La session est annulée pour ce vendredi. Les autres vendredis ne changent pas.` ;
- `La session est déplacée pour ce vendredi. Les autres vendredis ne changent pas.` ;
- `La session retrouve son jour et son heure habituels.`

Les erreurs disent quoi faire : `L'heure de fin doit venir après l'heure de début.`,
`Donnez une heure de début et une heure de fin. Exemple : 12:10 et 12:50.`,
`Cochez au moins une langue du sermon.`,
`Choisissez la date à partir de laquelle la session a lieu.` Une salle supprimée dans Réglages
pendant que le formulaire restait ouvert donne, dans le formulaire, avec la saisie : `Cette salle
n'existe plus : elle a été supprimée entre-temps. Choisissez une autre salle, ou « Pas de salle
précise ».` (étape 19, D2 ; avant, une erreur 500).

Les refus de « Ce vendredi », en tête de l'écran :

- `Cette session a changé depuis l'ouverture de la page : elle a déjà été annulée ou déplacée ce
jour-là. Rien n'a été enregistré. La partie « Ce vendredi », plus bas, est à jour.` ;
- `L'heure de cette session a changé depuis l'ouverture de la page. Rien n'a été enregistré. Sa
nouvelle heure est écrite plus bas, dans « Ce vendredi » : vérifiez le jour et l'heure choisis,
puis recommencez.` ;
- `La session est déjà prévue ce jour-là à cette heure : rien n'a été déplacé. Choisissez une autre
heure ou un autre jour dans « Ce vendredi », plus bas.` ;
- `Cette session est déjà passée : vous ne pouvez annuler que les sessions d'aujourd'hui et des
jours suivants.` (étape 19) ;
- `Cette session n'existe plus : elle a été supprimée entre-temps. La liste ci-dessous est à jour.`,
  aussi pour `Rétablir`, `Publier` et `Supprimer` depuis l'étape 19 ;
- `Cette session a déjà été rétablie depuis l'ouverture de la page. Rien n'a été enregistré. La
partie « Ce vendredi », plus bas, est à jour.` : un second `Rétablir comme d'habitude`, qui n'a
  plus rien à rétablir (étape 19, relecture de D2).

La liste des refus de l'écran, avec leur statut, est dans l'addendum du 27.09.2026 de l'ADR 0021.

## Dans les messages d'« À venir »

Une session annulée ou déplacée sur `À venir` y a ses propres mots, et non ceux d'un cours
(étape 19) : `« Prière du vendredi » : la prière du vendredi 02.10.2026 est annulée.`, puis
`Les autres prières du vendredi ont lieu comme d'habitude.` Sur une carte d'`À venir`, le nom
proposé se lit dans la langue de l'écran.

## Ce que l'écran dit quand il n'y a rien

`Aucune session du vendredi pour l'instant. Tant qu'il n'y en a pas, votre page publique n'affiche
rien pour le vendredi, et les cours prévus après le Dhuhr gardent l'heure du Dhuhr.`

Puis le formulaire `Ajouter une session`.

## Sans JavaScript

Tout l'écran fonctionne sans script, comme le reste de l'espace : les formulaires sont des `form`
avec des `action`, modifier et supprimer s'ouvrent dans un `<details>`, et l'ordre des sessions se
règle par une liste déroulante, jamais par un glisser-déposer. Avant l'étape 18, supprimer une
session demandait JavaScript, et tous les formulaires s'affichaient ouverts au chargement.

## Les langues

Tout ce qui précède existe en français, en allemand de Suisse, en italien, en anglais britannique et
en arabe, de droite à gauche. Les dates passent par la même fonction que partout : `Freitag,
02.10.2026`. Les noms de salle sont isolés (`<bdi>`), pour garder leur sens au milieu d'une ligne
arabe.

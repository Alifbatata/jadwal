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
3. Les erreurs, ou la confirmation du dernier geste.
4. **Les sessions**, dans leur ordre, chacune dans un cadre.
5. **Ajouter une session**, avec le formulaire vide.
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
  prière : c'est cette session qui tient lieu de Dhuhr.
- `Sermon en …`, avec les langues écrites dans la langue de l'écran.
- L'état dit ce qu'il veut dire : `Publiée : visible sur votre page publique.` ou
  `Brouillon : pas encore visible sur votre page publique.` Le bouton qui suit est `Publier` ou
  `Retirer de la page publique`.
- `Jusqu'au <date>` seulement si la session a une date de fin.
- **Modifier cette session** ouvre le formulaire rempli.
- **Supprimer cette session** ouvre un avertissement : `Elle disparaîtra de cet écran et de votre
page publique, pour tous les vendredis. Pour un seul vendredi, annulez-la plutôt dans « Ce
vendredi », plus bas.`, puis `Oui, supprimer`.

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
| `À partir du`                      | date                                        |                                                                                                                   |
| `Jusqu'au (facultatif)`            | date                                        | `Laissez vide si la session continue sans date de fin.`                                                           |
| `Description (facultatif)`         | texte long                                  | `Quelques mots pour les visiteurs, sur la page de la session. Exemple : La salle ouvre à 12:00.`                  |

Le titre proposé, et celui que prend un champ laissé vide, est le nom de la prière dans la langue où
la session s'écrit, la première langue que l'organisation publie.

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
`Choisissez la date à partir de laquelle la session a lieu.`

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

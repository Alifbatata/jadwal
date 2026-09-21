# La prière du vendredi, côté responsables

**Lien** : `/vendredi`, dans la navigation de l'espace des responsables, entre `Cours` et
`Partager`.

Un écran distinct de la liste des cours, pour une raison simple : une mosquée y vient deux fois par
an, au changement de saison, et elle ne doit pas avoir à chercher ses sessions parmi vingt cours.
Le moteur, lui, est le même — une session du vendredi est un cours d'un autre type (ADR 0033).

## Structure, de haut en bas

1. Titre de niveau 1 : `Prière du vendredi`.
2. **Une phrase qui dit ce que cet écran remplace** :
   `Ces sessions remplacent l'heure du Dhuhr du vendredi partout où elle s'affiche.`
3. **Les sessions**, dans leur ordre, chacune dans un cadre.
4. **Ajouter une session**.
5. **Ce vendredi**, avec l'annulation et le déplacement.

## Une session

```
Première session
12:10 – 12:50 · Grande salle
Sermon en arabe et français
Publiée

[Modifier]  [Dépublier]  [Supprimer]
```

- Le rang est en toutes lettres : `Première session`, `Deuxième session`, `Troisième session`.
- L'heure est toujours **fixe**, début et fin. Le formulaire ne propose pas d'ancrage sur une
  prière : c'est cette session qui tient lieu de Dhuhr, l'ancrer sur lui n'aurait pas de sens.
- `Sermon en …` et non `Langues d'enseignement` : c'est le mot juste, et c'est celui que le public
  verra.
- L'état est celui d'un cours : `Publiée` ou `Brouillon`. Un brouillon ne s'affiche nulle part en
  public, pas même dans le bloc du haut.
- `Supprimer` demande une confirmation sur la même page, sans fenêtre : `Supprimer cette session ?`
  puis `Oui, supprimer` et `Annuler`.

## Ajouter ou modifier une session

Le même formulaire, dans les deux cas, dans cet ordre :

| Champ         | Forme                                      | Remarque                                         |
| ------------- | ------------------------------------------ | ------------------------------------------------ |
| `Titre`       | texte                                      | proposé : `Prière du vendredi`                   |
| `Rang`        | liste : première, deuxième, troisième      | décide de l'ordre d'affichage                    |
| `Début`       | heure                                      | obligatoire                                      |
| `Fin`         | heure                                      | obligatoire, après le début                      |
| `Salle`       | liste des salles de l'organisation         | facultative                                      |
| `Sermon en`   | cases : français, allemand, italien, arabe | au moins une                                     |
| `Intervenant` | texte                                      | facultatif                                       |
| `À partir du` | date                                       | proposée : aujourd'hui                           |
| `Jusqu'au`    | date                                       | facultative — vide vaut « jusqu'à nouvel ordre » |
| `Description` | texte long                                 | facultative                                      |

Ce que le formulaire **ne demande pas**, et pourquoi :

- **le jour** : c'est le vendredi, toujours ;
- **le rythme** : chaque semaine, toujours ;
- **le public** : `Ouvert à tous`, toujours.

Trois questions qu'une mosquée n'a pas à se poser. Elles sont posées pour un cours parce qu'elles y
ont un sens ; ici elles n'en ont aucun.

### Le changement de saison

Deux chemins, et l'écran nomme les deux :

- **Modifier l'heure** de la session : simple, mais l'ancien horaire disparaît, y compris pour les
  vendredis passés qu'un visiteur pourrait relire.
- **Clore la session** (`Jusqu'au`) et en **ajouter une nouvelle** à partir du lendemain :
  l'historique reste juste.

Le second est proposé par l'écran, avec cette phrase :
`Pour un changement de saison, mieux vaut clore cette session et en ajouter une nouvelle : les
vendredis passés gardent leur heure.`

C'est la même recommandation que pour un cours dont le rythme change, et pour la même raison.

## Ce vendredi

Le prochain vendredi, avec ses sessions telles qu'elles auront lieu :

```
Ce vendredi, 25 septembre
12:10 – 12:50   Première session   [Annuler ou déplacer]
13:30 – 14:10   Deuxième session   [Annuler ou déplacer]
```

Les deux gestes sont **exactement** ceux de l'écran d'accueil pour une séance de cours : annuler
cette session-là seulement, ou la déplacer à une autre date et une autre heure. L'avertissement est
le même : `Cette session seulement. Les autres vendredis ne changent pas.`

Une session annulée ou déplacée apparaît ensuite barrée dans la vue Semaine publique, comme une
séance de cours.

## Ce que l'écran dit quand il n'y a rien

Un seul paragraphe :

`Aucune session du vendredi n'est saisie. Tant qu'il n'y en a pas, la page publique n'affiche rien
pour le vendredi, et les cours ancrés sur le Dhuhr gardent l'heure du Dhuhr.`

Puis le bouton `Ajouter une session`.

## Sans JavaScript

Tout l'écran fonctionne sans script, comme le reste de l'espace : les formulaires sont des `form`
avec des `action`, la confirmation de suppression est un second formulaire affiché sur place, et
l'ordre des sessions se règle par une liste déroulante, jamais par un glisser-déposer.

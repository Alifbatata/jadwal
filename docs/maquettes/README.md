# Maquettes

Une description écran par écran, écrite **avant** le code, pour que l'exploitant puisse comparer ce
qui a été livré à ce qui avait été décrit. C'est la référence qui manquait à l'étape 4, où le rapport
a dû reconnaître qu'aucune maquette n'était comparable.

Ces fichiers ne sont pas des captures d'écran : ce sont des descriptions. Structure, ordre des
éléments, **libellés exacts en français**, comportements. Un désaccord entre un de ces fichiers et
le code est un défaut — de l'un ou de l'autre, et il faut trancher, pas contourner.

## Écrans publics (étape 5)

| Fichier                    | Écran                                                      |
| -------------------------- | ---------------------------------------------------------- |
| `public-semaine.md`        | la vue Semaine, page d'accueil publique d'une organisation |
| `public-tous-les-cours.md` | la vue Tous les cours, groupés par rythme                  |
| `public-mois.md`           | la vue Mois : grille, puis liste du jour choisi            |
| `public-cours.md`          | la page d'un cours, à son propre lien                      |
| `public-agenda.md`         | la page d'abonnement au flux agenda                        |

## Le widget (étape 6)

| Fichier     | Écran                                                     |
| ----------- | --------------------------------------------------------- |
| `widget.md` | le widget, la vue intégrée `?embed=1`, et la page d'essai |

## La prière du vendredi (étape 8)

| Fichier                    | Écran                                                          |
| -------------------------- | -------------------------------------------------------------- |
| `public-vendredi.md`       | le bloc en haut de la page publique, et la place dans les vues |
| `responsables-vendredi.md` | l'écran des responsables, distinct de la liste des cours       |

## Conventions communes à tous les écrans publics

### Ce qui ne change jamais

- **Aucun JavaScript.** Tout se lit et se manipule en HTML : les détails se déplient avec
  `<details>`, les vues et les filtres sont des liens. Une page publique qui aurait besoin d'un
  script serait un défaut de conception, pas une fonctionnalité.
- **Aucune ressource d'un autre domaine** : pas de police distante, pas d'image distante, pas de
  script distant. Le texte s'affiche avec les polices du système.
- **Aucun cookie, aucun traceur.** Un visiteur ne laisse rien.
- **Texte brut.** Rien de ce qu'un responsable a saisi n'est interprété comme du HTML.

### L'en-tête, identique sur les trois vues

1. Le **nom de l'organisation**, en titre de niveau 1.
2. Les **trois vues**, dans cet ordre, la vue courante marquée : `Semaine`, `Tous les cours`,
   `Mois`.
3. Les **filtres par public**, dans cet ordre : `Tous`, `Enfants`, `Jeunes`, `Femmes`, `Adultes`,
   `Ouvert à tous`. Le filtre actif est marqué. Un filtre est un lien, jamais une case à cocher.
4. Les **langues disponibles**, en toutes lettres : `Français`, `Deutsch`, `Italiano`, `العربية`.
   La langue courante est marquée. Chaque langue est un lien vers la même vue dans cette langue.

### Le pied, identique partout

1. `S'abonner au calendrier` — lien vers la page d'abonnement.
2. `Proposé gratuitement par jadwal`.
3. Rien d'autre. Pas de mention légale, pas de compteur, pas de logo.

### Comment une séance s'affiche

Toujours dans cet ordre, sur une ligne ou deux :

1. **L'heure**. Pour un cours à heure fixe : `19:00 – 20:30`. Pour un cours ancré sur une prière :
   `Après Maghrib` d'abord, puis l'heure entre parenthèses **si elle est connue** — jamais de
   mention d'un réglage manquant, un visiteur n'a pas à connaître nos étapes.
2. **Le titre du cours**, qui est un lien vers la page du cours.
3. **Le public**, en un mot : `Enfants`, `Jeunes`, `Femmes`, `Adultes`, `Ouvert à tous`.
4. **La salle**, si elle est renseignée.
5. **L'intervenant**, s'il est renseigné.

Une séance **annulée** reste visible, son texte est barré, et elle porte la mention `Annulé`.
Une séance **déplacée** apparaît deux fois : barrée à sa date d'origine avec `Déplacé au <date>`, et
à sa nouvelle date avec `Date exceptionnelle`.

### Les langues

L'arabe s'affiche en écriture de droite à gauche complète (`dir="rtl"`), avec des **chiffres
latins** : `19:00`, jamais `١٩:٠٠`. Le contenu d'un cours s'affiche dans la langue demandée si la
traduction existe, sinon dans sa langue source, **sans mention d'échec** : un visiteur n'a pas à
savoir qu'une traduction manque.

### Accessibilité

Même niveau qu'à l'étape 4 : cibles d'au moins 44 pixels, un seul titre de niveau 1 par page, une
hiérarchie de titres continue, chaque lien compréhensible hors de son contexte, contraste suffisant,
et la langue de la page déclarée sur `<html>`.

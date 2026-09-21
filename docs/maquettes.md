# Maquettes

Deux prototypes cliquables ont été validés avant le démarrage du code :

1. **Widget public** : les trois vues (Semaine, Tous les cours, Mois), les filtres par public et le
   détail d'un cours déplié sur place. Depuis l'étape 6, ce prototype décrit ce que rend la **page
   publique** : le widget ne la redessine plus, il l'affiche dans un cadre (ADR 0005 révisé).
2. **Espace des responsables** : la saisie et la modification des cours, pensée pour le téléphone.

Leurs sources n'ont pas été versées au dépôt. À l'étape 4, l'espace des responsables a donc été
construit à partir du cadrage et de la description écrite du prompt, sans rien à quoi le comparer —
le rapport de cette étape le dit.

Depuis l'étape 5, `docs/maquettes/` porte une description écran par écran, écrite **avant** le code :
structure, ordre des éléments, libellés exacts en français, comportements. Ce n'est pas une capture
d'écran, c'est une référence comparable. Voir `docs/maquettes/README.md`.

| Écrans                         | Où                           | Depuis  |
| ------------------------------ | ---------------------------- | ------- |
| Pages publiques et flux agenda | `docs/maquettes/public-*.md` | étape 5 |
| Espace des responsables        | à écrire, sur le même modèle | —       |
| Widget et vue intégrée         | `docs/maquettes/widget.md`   | étape 6 |

`docs/CADRAGE.md` reste la référence du comportement attendu pour tout ce qui n'a pas encore sa
description.

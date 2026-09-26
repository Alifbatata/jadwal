# Maquettes

Deux prototypes cliquables ont été validés avant le démarrage du code :

1. **Widget public** : les trois vues (Semaine, Tous les cours, Mois), les filtres par public et le
   détail d'un cours déplié sur place. Depuis l'étape 6, ce prototype décrit ce que rend la **page
   publique** : le widget ne la redessine plus, il l'affiche dans un cadre (ADR 0005 révisé).
2. **Espace des responsables** : la saisie et la modification des cours, pensée pour le téléphone.

Leurs sources n'ont pas été versées au dépôt. À l'étape 4, l'espace des responsables a donc été
construit à partir du cadrage et de la description écrite du prompt, sans rien à quoi le comparer,
et le rapport de cette étape le dit.

Depuis l'étape 5, `docs/maquettes/` porte une description écran par écran, écrite **avant** le code :
structure, ordre des éléments, libellés exacts en français, comportements. Ce n'est pas une capture
d'écran, c'est une référence comparable. Voir `docs/maquettes/README.md`.

Ce qui est décrit, et depuis quand :

- les pages publiques et le flux agenda : `docs/maquettes/public-*.md`, depuis l'étape 5 ;
- le widget et la vue intégrée : `docs/maquettes/widget.md`, depuis l'étape 6 ;
- la prière du vendredi, bloc public et écran des responsables : `docs/maquettes/public-vendredi.md`
  et `docs/maquettes/responsables-vendredi.md`, depuis l'étape 8 ;
- les conditions d'utilisation, la page ouverte à tous et l'écran d'acceptation :
  `docs/maquettes/responsables-conditions.md`, depuis l'étape 16 ;
- le reste de l'espace des responsables et le super-admin, récrits à l'étape 18 : la coquille et la
  connexion, À venir, les cours, les heures de prière, Partager, Membres, Réglages, la console du
  super-admin et sa passkey ; et l'onglet Prières de la page publique. Voir la liste des fichiers
  dans `docs/maquettes/README.md`.

Ces descriptions de l'étape 18 ont été écrites **après** le code, d'après les dictionnaires de
chaque écran et les écrans rendus : elles disent ce qui est livré, et, pour chaque écran, ce que la
relecture a relevé sans le corriger. Chaque écran de l'espace a maintenant sa description ;
`docs/CADRAGE.md` reste la référence du comportement attendu.

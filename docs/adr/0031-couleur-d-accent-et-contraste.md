# ADR 0031 : Couleur d'accent et contraste

## Contexte

Chaque organisation choisit une couleur d'accent. Elle existe en base depuis l'étape 2
(`organization.accent_color`) mais n'était affichée nulle part : les écrans portaient une seule
teinte, la même pour toutes les mosquées.

Une couleur choisie par quelqu'un d'autre que nous pose un problème que l'on ne peut pas résoudre en
faisant attention : n'importe quelle couleur peut être choisie, et certaines rendent un texte
illisible. Trois issues sont possibles.

1. **Refuser** les couleurs de contraste insuffisant à la saisie. C'est ce que font beaucoup de
   produits. Le responsable d'une mosquée dont la couleur est un jaune vif se voit alors refuser la
   couleur de sa mosquée, sans comprendre pourquoi, et sans qu'on puisse lui proposer autre chose
   que « prenez une autre couleur ».
2. **Corriger** la couleur en silence — l'assombrir jusqu'à ce qu'elle passe. Le responsable voit
   alors une couleur qui n'est pas la sienne, et personne ne lui dit pourquoi.
3. **Changer l'usage de la couleur** pour qu'aucune couleur ne pose problème.

## Décision

La troisième. **La couleur d'accent ne sert que de fond**, et le texte posé dessus n'est pas choisi,
il est calculé : noir ou blanc, celui des deux qui contraste le mieux.

Aucune couleur n'est refusée, aucune n'est modifiée à la saisie.

### Ce que cela garantit, et ce n'est pas une impression

Pour **toute** couleur sRGB, le meilleur des deux contrastes vaut au moins **4,58:1**, donc toujours
plus que les 4,5:1 qu'exige le critère 1.4.3 de WCAG 2.2 au niveau AA.

La démonstration tient en trois lignes. Le contraste avec le noir vaut `(L + 0,05) / 0,05` et croît
avec la luminance ; celui avec le blanc vaut `1,05 / (L + 0,05)` et décroît. Le pire cas est donc
leur point d'égalité : `(L + 0,05)² = 0,0525`, soit `L ≈ 0,1791`, où les deux valent
`√0,0525 / 0,05 ≈ 4,5826`.

`apps/web/src/lib/couleur.test.ts` ne se contente pas de la démonstration : il parcourt les
**16 777 216** couleurs sRGB une par une, calcule le meilleur des deux contrastes, et vérifie que le
minimum observé vaut bien 4,5826. C'est plus fort qu'un test de propriété tiré au hasard, qui
n'aurait qu'une probabilité de tomber près du pire cas, et cela coûte moins d'une seconde.

### Les trois règles qui en découlent

- **Jamais de texte coloré sur fond blanc.** Un lien, un titre ou une étiquette en couleur d'accent
  sur fond blanc n'aurait aucun contraste garanti — c'est le cas symétrique, et il n'a pas de
  solution. Les liens gardent donc une teinte fixe, `#0f5c55`, qui contraste avec le blanc.
- **Jamais la couleur comme seule indication d'un état.** Une séance annulée est barrée et porte le
  mot « annulée » ; l'onglet courant porte `aria-current` et une graisse différente. Retirer toutes
  les couleurs d'une page ne doit rien lui faire perdre. C'est le critère 1.4.1 de WCAG, et c'est
  aussi ce qui rend les écrans lisibles en niveaux de gris, imprimés ou photocopiés.
- **Un seul endroit fabrique les deux variables CSS.** `variablesAccent()` rend
  `--accent` _et_ `--accent-texte` ensemble, pour que la seconde ne puisse jamais être oubliée là où
  la première est posée.

### Où elle s'applique

Sur les pages publiques, en mode intégré et dans l'espace des responsables. L'écran des réglages
montre un aperçu vivant : la couleur en cours de saisie, le texte calculé dessus, et le rapport de
contraste en clair. Sans JavaScript, l'aperçu montre la couleur enregistrée — ce qui est exact,
puisque rien n'a encore changé.

Une valeur illisible en base — saisie à la main, migration ancienne — vaut la teinte du service
`#0f766e` plutôt que de faire échouer le rendu.

## Conséquences

- Une mosquée peut poser la couleur de son panneau, quelle qu'elle soit, sans rien négocier.
- Le texte sur fond d'accent bascule du noir au blanc à `L ≈ 0,1791`. Deux couleurs voisines de ce
  seuil peuvent donc porter des textes de couleurs différentes ; c'est visible et c'est correct.
- Le mode sombre n'existe pas encore. Quand il existera, `--accent-texte` restera calculé de la même
  manière : c'est le fond qui décide, pas le thème.
- Le widget hérite de la couleur par la page publique qu'il encadre : il n'a rien à configurer.

## Statut

Accepté, 2026-09-21. Étape 7 de la feuille de route.

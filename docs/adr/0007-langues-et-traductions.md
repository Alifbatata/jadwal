# ADR 0007 : Langues et traductions

## Contexte

`jadwal` publie le programme des cours d'une organisation à partir d'une seule saisie des
responsables, vers quatre sorties : widget, page publique, flux ICS et messages WhatsApp (voir
`docs/CADRAGE.md`).
Deux questions de langue se posent, distinctes l'une de l'autre :

- la langue de l'interface du côté public (libellés, navigation) ;
- la langue du contenu saisi par les responsables pour un cours, comme le titre et la description.

Le champ « langue(s) d'enseignement » d'un cours indique dans quelle(s) langue(s) le cours est
donné ; il ne relève pas du présent ADR.

La feuille de route place la page publique en 4 langues à l'étape 5 et renvoie la pré-traduction
automatique, validée par le responsable, à « plus tard », après l'étape 8. À l'étape 0, aucune
dépendance n'est ajoutée sans besoin immédiat.

## Décision

- L'interface du côté public est proposée en quatre langues : `fr`, `de`, `it` et `ar`.
- L'arabe est affiché en RTL complet, avec des chiffres latins.
- Chaque cours a une langue source obligatoire, dans laquelle son contenu est saisi.
- Les traductions du contenu dans les autres langues sont optionnelles.
- Lorsqu'une traduction manque dans la langue d'interface demandée, le contenu du cours est affiché
  dans sa langue source (repli).
- La page publique est livrée dans les quatre langues à l'étape 5 de la feuille de route.
- La pré-traduction automatique, validée par le responsable, est reportée à « plus tard » : elle ne
  fait pas partie des étapes 0 à 8.

## Conséquences

- Plus simple : un responsable peut publier un cours sans le traduire ; grâce au repli, un cours est
  toujours affichable dans chacune des quatre langues d'interface.
- Plus simple : aucune traduction automatique n'est intégrée en V1, donc aucune dépendance n'est
  ajoutée pour cela.
- Plus contraignant : l'interface publique est conçue pour le RTL complet dès le départ, et les
  nombres affichés en arabe (heures, dates) utilisent des chiffres latins.
- Plus contraignant : chaque cours porte sa langue source et ses éventuelles traductions ; leur
  stockage relève du schéma de base, qui arrive à l'étape 2.
- À accepter : une page peut mélanger la langue d'interface et la langue source d'un cours non
  traduit.
- Reporté : la pré-traduction automatique validée par le responsable, après l'étape 8.
- Non fixé ici : l'outillage de traduction ; aucune bibliothèque n'est retenue à l'étape 0.

## Statut

Accepté, 2026-09-19. Étape 5 de la feuille de route (page publique en 4 langues) ; pré-traduction
automatique reportée à « plus tard ».

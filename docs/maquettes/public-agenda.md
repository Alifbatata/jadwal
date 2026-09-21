# Page d'abonnement au calendrier

Le flux agenda est la sortie la plus utile et la moins connue : une fois l'abonnement posé, le
programme de la mosquée arrive dans le calendrier du téléphone et se met à jour tout seul. Cette
page existe parce que « copiez cette adresse et collez-la dans votre application de calendrier »
n'aide personne.

**Lien** : `/m/<identifiant>/agenda`, et `/m/<identifiant>/<langue>/agenda`.

## Structure, de haut en bas

1. **L'en-tête commun**, sans les filtres par public : ils n'ont pas de sens ici, le flux porte tout
   le programme.
2. **Titre de niveau 1** : `S'abonner au calendrier`.
3. **Un paragraphe**, trois lignes au plus : ce que fait l'abonnement, et qu'il se met à jour tout
   seul. `Le programme de <Nom de l'organisation> s'ajoute à votre calendrier et se met à jour tout
seul, environ une fois par heure. Rien à réinstaller quand un cours change.`
4. **Le lien d'abonnement au programme entier**, sous le titre de niveau 2 `Tout le programme`,
   mis en évidence, sous deux formes :
   - un bouton `Ajouter à mon calendrier`, qui pointe en `webcal:` — c'est lui qui ouvre
     directement l'application de calendrier sur un téléphone ;
   - l'adresse en `https:`, en texte sélectionnable, pour les applications qui la demandent.
5. **Un seul cours**, titre de niveau 2, quand l'organisation a au moins un cours publié : une
   phrase, puis la liste des cours, un par ligne, chacun en lien `webcal:` vers **son** flux
   (ADR 0028). L'adresse en `https:` d'un cours figure sur la page de ce cours, pas ici : quinze
   adresses empilées ne se lisent pas.
6. **Trois sections**, titres de niveau 2, dans cet ordre, en texte et sans capture d'écran :
   - `Sur iPhone et iPad`
   - `Sur Android`
   - `Sur Outlook`
7. **Le pied commun**.

## Le texte des trois sections, en français

**Sur iPhone et iPad.** Touchez le bouton ci-dessus : votre iPhone propose d'ajouter le calendrier.
Si rien ne se passe, ouvrez Réglages, puis Applications, Calendrier, Comptes, Ajouter un compte,
Autre, Ajouter un abonnement à un calendrier, et collez l'adresse.

**Sur Android.** Ouvrez Google Agenda sur un ordinateur — l'application du téléphone ne sait pas
ajouter un abonnement. Dans Autres agendas, choisissez À partir de l'URL, collez l'adresse, puis
ajoutez l'agenda. Il apparaîtra ensuite sur votre téléphone.

**Sur Outlook.** Ouvrez Outlook sur le web, allez dans Calendrier, Ajouter un calendrier,
S'abonner à partir du Web, collez l'adresse, donnez-lui un nom, puis importez.

Ces textes sont traduits en allemand, en italien et en arabe, avec les noms de menus dans la langue
de la page — un menu français dans une page allemande ne servirait à personne.

La phrase de la section `Un seul cours`, en français : `Vous pouvez aussi n'ajouter qu'un cours.
Touchez son nom : il s'ajoute seul et se met à jour comme le reste. Son adresse en https figure sur
la page du cours.` Traduite dans les trois autres langues comme le reste.

## Ce que la page ne fait pas

- Elle ne détecte pas l'appareil. Les trois procédures sont affichées ; une détection se trompe, et
  une détection qui se trompe cache la bonne réponse.
- Elle ne propose pas de filtrer un flux par public. La question est fermée par l'ADR 0028 : le flux
  par cours répond au vrai besoin, qui est « je veux celui-là ».

> **Correction du 2026-09-21.** Cette page disait « elle ne propose pas de choisir un cours ». Elle
> contredisait `public-cours.md`, qui place « ajouter à mon agenda » sur chaque cours, et c'est elle
> qui avait tort : l'ADR 0028 ajoute un flux par cours, et la section `Un seul cours` ci-dessus.

## Comportements

- Le titre du navigateur est `S'abonner au calendrier — <Nom de l'organisation>`.
- Le lien `webcal:` et le lien `https:` désignent le même fichier, au même chemin.

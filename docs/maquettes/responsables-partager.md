# L'écran Partager

Décrit après le code, à l'étape 18 (retours D1, B1, D2, A3 pour cet écran). Textes :
`apps/web/src/lib/i18n/share.ts`, dans les cinq langues. La marche à suivre écrite pour une personne
responsable est dans `docs/INTEGRATION.md`.

**Lien** : `/partager`, ouvert à l'éditeur comme à la personne responsable.

## Structure, de haut en bas

1. Titre de niveau 1 : `Partager`, puis `Tout ce qu'il faut pour faire connaître votre programme :
l'adresse de votre page publique, un message prêt à coller, un QR code et le code pour votre site.`
2. **L'adresse de votre page publique** (avant : `Le lien de l'organisation`) : `Votre page publique
montre vos cours à tout le monde, sans compte. Mettez son adresse partout où l'on vous cherche :
bio Instagram, groupe WhatsApp, affiche. Elle ne change jamais.`, le champ qui porte l'adresse, et
   le lien `Ouvrir la page publique`.
3. **Le programme de la semaine, prêt à coller** (retour D1) : `Copiez ce message dans votre groupe
WhatsApp, ou partout où votre communauté vous lit. Il donne les cours publiés des sept prochains
jours, annulations comprises.`, puis `Il est écrit dans chacune des langues de votre page publique :
ouvrez celle de votre groupe.` Un repli par langue publiée, la langue de l'organisation d'abord et
   ouverte (`En français (la langue principale de votre page)`, `En allemand`…). Chaque zone porte
   `lang`, `dir` et un nom : `Programme de la semaine en allemand`. Un cours y garde son titre
   traduit quand il existe, sinon son titre source.
4. **Le QR code** : `Un téléphone qui photographie ce carré ouvre votre page publique. Imprimez-le
sur une affiche ou une annonce.`, l'image (nommée `QR code de votre page publique` pour les lecteurs
   d'écran, dans la langue de l'écran), et `Télécharger le QR code (image)`.
5. **Le programme sur votre site** : `Votre site peut afficher le programme, toujours à jour : quand
vous changez un cours ici, votre site suit tout seul.` Puis trois codes, chacun avec son libellé
   visible, dans cet ordre :
   - **Le code à coller** : `Collez ce code sur votre site, à l'endroit où le programme doit
apparaître, dans un bloc qui accepte du code HTML. Exemple : sur WordPress, ajoutez un bloc « HTML
personnalisé » à la page de vos cours, puis collez-y ce code.`, puis `Quelqu'un d'autre s'occupe
de votre site ? Envoyez-lui ce code.`, et la zone `Code à coller`.
   - **Si votre site refuse ce code** : `Certains sites n'acceptent pas le premier code : le
programme n'apparaît pas une fois la page enregistrée. Collez alors celui-ci au même endroit, à la
place du premier. Il montre votre page publique dans un cadre de hauteur fixe, et le programme
défile à l'intérieur.`, comment agrandir le cadre, et la zone `Code du cadre à coller`.
   - **Pour un site très strict (rare)** : `Si la personne qui gère votre site demande un code « avec
empreinte d'intégrité », donnez-lui celui-ci. Il ne se met pas à jour tout seul : quand jadwal
change, revenez le copier ici.`, et la zone `Code avec empreinte d'intégrité`.

Les mots « widget », « script » et « iframe » ne sont plus dans le texte de l'écran. Les codes se
lisent de gauche à droite même dans l'espace en arabe, et les mots écrits dans les codes (le lien de
repli `Voir le programme des cours`, le nom du cadre `Programme des cours`) sont dans la langue de
l'organisation, pas dans celle de l'écran.

## Ce qui reste à vérifier

Les noms du bloc WordPress donnés en exemple dans les cinq langues ont été écrits sans être vérifiés
sur une installation de WordPress dans chaque langue.

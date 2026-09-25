# Mettre le programme des cours sur le site de l'organisation

Ce document est écrit pour vous, responsable de l'organisation. Il ne suppose aucune connaissance
technique. Comptez dix minutes.

À la fin, le programme des cours s'affichera sur votre site, et il se mettra à jour tout seul : vous
ne toucherez plus jamais à ce code. Quand vous ajoutez ou déplacez un cours dans jadwal, le site
suit dans la minute.

Si vous n'avez pas de site, allez directement au **point 5**.

---

## 1. Copiez votre code

1. Connectez-vous à jadwal.
2. Ouvrez **Partager**, dans le menu du haut.
3. Descendez jusqu'à la section **Le code à coller sur votre site**.
4. Cliquez dans le cadre de texte, sélectionnez tout, et copiez.

Le code ressemble à ceci. Le vôtre porte le nom de votre organisation :

```html
<script src="https://exemple.invalid/widget/jadwal-widget.js"></script>
<jadwal-widget org="mon-organisation">
	<a href="https://exemple.invalid/m/mon-organisation">Voir le programme des cours</a>
</jadwal-widget>
```

La ligne du milieu, avec le lien, n'est pas décorative : c'est ce que verront les rares visiteurs
dont le navigateur refuse les programmes de ce genre. Ne la retirez pas.

---

## 2. Collez-le sur votre site

La manœuvre dépend de l'outil avec lequel votre site est fait. Dans tous les cas, vous cherchez un
bloc qui accepte du **code HTML**. Pas une zone de texte ordinaire : elle afficherait le code au
lieu de l'exécuter.

**Sur un site Odoo**

1. Ouvrez la page où vous voulez le programme, puis **Modifier**.
2. Dans le panneau de droite, onglet **Blocs**, cherchez **Code intégré** (ou _Embed Code_).
3. Faites-le glisser à l'endroit voulu sur la page.
4. Cliquez sur le bloc, puis sur le bouton qui ouvre le code.
5. Effacez ce qu'il contient, collez votre code, validez.
6. **Enregistrez** la page, puis ouvrez-la en visiteur : le programme doit apparaître.

**Sur un site WordPress**

1. Ouvrez la page, puis ajoutez un bloc **HTML personnalisé**.
2. Collez votre code dedans.
3. Mettez à jour la page, puis ouvrez-la en visiteur.

**Sur un site Wix, Squarespace ou Jimdo**

Cherchez un élément appelé **Code personnalisé**, **Intégrer du code** ou **Embed**. Collez votre
code dedans. Sur certaines de ces formules, le bloc de code n'est disponible qu'avec un abonnement
payant ; si vous ne le trouvez pas, passez au **point 4**.

**Si vous ne savez pas**

Envoyez ce document et votre code à la personne qui s'occupe du site. Tout ce qu'il lui faut y est.

---

## 3. Choisissez la langue et la vue de départ

Par défaut, le programme s'affiche dans la langue de votre organisation, sur la vue **Semaine**. Le
visiteur peut changer les deux lui-même, comme sur votre page publique.

Pour changer ce qu'il voit **en arrivant**, ajoutez un mot dans la deuxième ligne du code.

Pour la langue, ajoutez `lang` :

```html
<jadwal-widget org="mon-organisation" lang="de"></jadwal-widget>
```

Les langues possibles sont `fr` (français), `de` (allemand), `it` (italien) et `ar` (arabe).

Pour la vue, ajoutez `view` :

```html
<jadwal-widget org="mon-organisation" view="cours"></jadwal-widget>
```

Les vues possibles sont `semaine`, `cours` (tous les cours, groupés par rythme) et `mois`.

Vous pouvez mettre les deux :

```html
<jadwal-widget org="mon-organisation" lang="ar" view="mois"></jadwal-widget>
```

Et vous pouvez n'afficher qu'un public, avec `audience` :

```html
<jadwal-widget org="mon-organisation" audience="kids"></jadwal-widget>
```

Les publics possibles sont `kids` (enfants), `youth` (jeunes), `women` (femmes), `adults` (adultes)
et `open` (ouvert à tous).

**Si vous écrivez un mot qui n'existe pas**, rien ne casse : le programme s'affiche normalement,
comme si vous n'aviez rien ajouté.

**Deux programmes sur la même page**, c'est permis : collez la deuxième ligne une seconde fois, avec
d'autres réglages. La ligne du script, elle, ne se met qu'une fois.

---

## 4. Si votre site refuse les scripts extérieurs

Certains sites, surtout dans les administrations et les entreprises, n'acceptent aucun code venu
d'ailleurs. Il reste alors une solution, plus simple mais moins jolie.

Dans **Partager**, sous **Si votre site refuse les scripts extérieurs**, copiez le second code. Il
ressemble à ceci :

```html
<iframe
	src="https://exemple.invalid/m/mon-organisation"
	title="Programme des cours – Mon organisation"
	style="width:100%;height:900px;border:0"
	loading="lazy"
	referrerpolicy="no-referrer"
></iframe>
```

Collez-le au même endroit que le premier.

La différence : **la hauteur ne s'adapte pas**. Le programme s'affiche dans une fenêtre de hauteur
fixe, et le visiteur fait défiler à l'intérieur. Si vous trouvez la fenêtre trop courte ou trop
haute, changez le nombre `900` : c'est une hauteur en pixels. Comptez environ 100 pixels par séance
affichée.

**Si rien ne s'affiche du tout**, même avec ce code, c'est que votre site interdit aussi les
fenêtres extérieures. Demandez alors à votre webmestre d'ajouter notre adresse à la ligne
`frame-src` de la politique de sécurité du site, ou passez au point suivant.

**Un cas plus rare.** Certains sites se protègent par un réglage que votre webmestre connaît sous le
nom `Cross-Origin-Embedder-Policy`. Ce réglage refuse d'afficher dans un cadre une page qui ne le
déclare pas elle-même, et notre programme ne le déclare pas. Sur un tel site, le script se charge
sans doute, mais le programme ne s'affiche pas, ni avec le premier code ni avec celui-ci. Nous le
déduisons des règles que suivent les navigateurs, sans l'avoir vu sur un vrai site. Dans ce cas,
utilisez le lien de l'organisation (**point 5**).

**Si votre site exige une empreinte de sécurité** (votre webmestre saura de quoi il s'agit), prenez
le code de la section **Si votre site exige une empreinte d'intégrité**. Attention : ce code fige la
version du programme. À chaque nouvelle publication de jadwal, il faudra revenir le copier. Sinon,
le programme cessera de s'afficher, sans message.

---

## 5. Si l'organisation n'a pas de site

Vous n'avez besoin de rien d'autre que du lien.

1. Dans **Partager**, copiez **Le lien de l'organisation**. Il ressemble à
   `https://exemple.invalid/m/mon-organisation`.
2. Mettez-le partout où les gens vous cherchent :
   - dans la **bio Instagram** de l'organisation ;
   - en **message épinglé** du groupe WhatsApp ;
   - sur la **fiche** de l'organisation dans un service de calendrier de prière ;
   - dans la signature des courriels.

Ce lien ne changera jamais. Il ouvre la même chose que le programme sur un site : les trois vues,
les quatre langues, l'abonnement au calendrier.

**Le QR code**, dans la même page, est ce même lien sous forme d'image. Téléchargez-le, puis :

- imprimez-le et affichez-le à l'entrée de vos locaux, à hauteur des yeux ;
- mettez-le sur les affiches des cours ;
- mettez-le sur les flyers de la rentrée.

Imprimez-le à **au moins trois centimètres de côté**, en noir sur blanc, et vérifiez qu'il
fonctionne avec votre propre téléphone avant d'en faire cent exemplaires.

---

## Ce qu'il faut savoir avant de coller

**Le programme garde sa propre mise en forme.** Il ne prend pas les couleurs ni les polices de votre
site : il s'affiche comme une carte posée sur la page. C'est ce qui garantit qu'il est lisible
partout, et qu'une erreur chez nous ne peut pas abîmer votre site.

**Le bouton « précédent » du navigateur.** Quand un visiteur change de vue à l'intérieur du
programme, son navigateur ne garde pas l'étape précédente. Le bouton « précédent » le fait donc
sortir de votre page en une fois, ce qui est le comportement attendu par la plupart des gens.

**Le lien « Conditions d'utilisation ».** En bas du programme, à côté de « S'abonner au
calendrier », un lien mène aux conditions d'utilisation du service : celles que vous avez acceptées
en entrant dans votre espace. Il s'ouvre toujours dans un nouvel onglet, parce que cette page refuse
de s'afficher à l'intérieur d'un autre site. Votre page reste ouverte derrière. Le texte du lien
suit la langue du programme, mais les conditions n'existent qu'en français. Un lecteur d'écran
annonce aussi le nouvel onglet, pour ce lien comme pour « Voir le programme complet » : « Conditions
d'utilisation (s'ouvre dans un nouvel onglet) ». À l'écran, rien ne change.

**Ce que nous voyons, et ce que nous ne voyons pas.** Le programme ne dépose aucun cookie et
n'apprend rien de vos visiteurs. Une seule chose est comptée : le nombre d'affichages par jour, pour
que votre espace puisse vous dire « votre widget a été vu 42 fois cette semaine », et vous prévenir
s'il cesse de l'être. Ce compteur ne retient que votre organisation, la date, le type d'affichage et
un nombre. Ni adresse, ni page d'où vient le visiteur, ni heure. Il n'y a donc rien à déclarer dans
votre politique de confidentialité, et rien à faire accepter.

**Ce qui se passe si notre service tombe.** Le lien placé sous le programme,
`Voir le programme complet`, reste visible, et il reste cliquable. Votre page ne casse pas.

---

## Régler les heures de prière

Un cours annoncé « après Maghrib » n'a pas d'heure fixe : elle change chaque jour. Tant que
l'organisation n'a pas dit d'où viennent ses heures de prière, ces cours s'affichent « 45 min après
Maghrib », sans heure, sur votre site comme sur la page publique.

Pour qu'une heure apparaisse, allez dans **Prières** dans votre espace. Deux possibilités, qui se
combinent :

- **Importer votre calendrier.** Un fichier CSV, une ligne par jour. C'est la meilleure option si
  l'organisation affiche ses propres heures sur un panneau : ce sont celles-là qui seront publiées.
  L'écran vous montre ce qu'il a compris **avant** d'écrire quoi que ce soit, et vous confirmez. Le
  format est décrit dans [`CALENDRIER-PRIERES.md`](CALENDRIER-PRIERES.md), avec un fichier d'exemple.
- **Laisser le service calculer.** Saisissez la position de l'organisation en degrés décimaux,
  choisissez la méthode, et comparez l'aperçu des sept prochains jours au panneau de l'organisation
  avant d'enregistrer. Si l'écart est constant, l'ajustement par prière le rattrape.

Depuis l'étape 8, une troisième source passe **avant les deux autres** : vos horaires **saisis à la
main**. Une période (un nom, des dates, et pour chaque prière l'heure affichée et l'heure d'iqama)
dit ce que porte votre panneau. C'est aussi là que vous réglez vos **iqamas**, en heure fixe ou en
minutes après l'heure affichée, et ce sont elles que suivent vos cours annoncés « après Maghrib ».

La priorité est donc : ce que vous saisissez, puis ce que vous importez, puis le calcul. Vous pouvez
mélanger, et l'écran vous montre pour les sept prochains jours d'où vient chaque heure. L'écran
d'accueil vous prévient trente jours avant la fin de votre calendrier importé.

## La prière du vendredi

Un écran à part, **Vendredi**, où vous saisissez une, deux ou trois sessions : l'heure, la langue du
sermon, la salle. Elles apparaissent **en haut** de votre page publique et de votre widget, avant
tout le reste : c'est l'information la plus cherchée.

Dès qu'une session existe, elle remplace l'heure du Dhuhr du vendredi partout, y compris pour un
cours annoncé « après le Dhuhr », qui suit alors la dernière session.

Rien de tout cela n'interroge un service extérieur. Il n'y a pas de recherche d'adresse derrière le
champ de position, et nous n'appelons jamais un service tiers de calendrier de prière.

---

## Si ça ne marche pas

| Ce que vous voyez                       | Ce que c'est                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| Le code s'affiche en toutes lettres     | Vous l'avez collé dans une zone de texte ordinaire. Il faut un bloc **code HTML**.        |
| Rien du tout, pas même un lien          | Le bloc a supprimé le code à l'enregistrement. Essayez le cadre du **point 4**.           |
| Seulement le lien « Voir le programme » | Le script est bloqué par votre site. Essayez le cadre du **point 4**.                     |
| Une fenêtre vide, ou très courte        | Votre site bloque les fenêtres extérieures. Votre webmestre doit autoriser notre adresse. |
| « Page introuvable »                    | Le nom dans `org=` n'est pas le bon. Recopiez le code depuis **Partager**.                |
| Le programme est vide                   | Aucun cours n'est **publié**. Un brouillon ne s'affiche jamais en public.                 |

Dans tous les cas, le lien de l'organisation (**point 5**) fonctionne, lui, toujours. Mettez-le en
attendant, il ne sera jamais perdu.

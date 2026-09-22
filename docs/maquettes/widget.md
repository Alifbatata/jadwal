# Le widget et la vue intégrée

Le widget n'a pas d'écran à lui : il pose un cadre qui affiche la page publique (ADR 0005 révisé).
Ce fichier décrit donc deux choses — ce que le widget ajoute **autour** du cadre, et ce que la page
publique change quand elle est **dedans**.

**Lien du fichier** : `/widget/jadwal-widget.js`, ou `/widget/<empreinte>/jadwal-widget.js` pour un
site qui exige une empreinte d'intégrité.

## Le code à coller

```html
<script src="https://<hôte>/widget/jadwal-widget.js"></script>
<jadwal-widget org="mon-organisation">
	<a href="https://<hôte>/m/mon-organisation">Voir le programme des cours</a>
</jadwal-widget>
```

Le lien à l'intérieur de la balise est le **contenu de repli**. Il s'affiche exactement quand le
script n'a pas pu s'exécuter : JavaScript désactivé, script bloqué par le site, empreinte qui ne
correspond plus. L'élément n'ayant aucun `<slot>`, ce contenu disparaît dès qu'il est défini.

## Les attributs

| Attribut     | Valeurs                                    | Défaut                        |
| ------------ | ------------------------------------------ | ----------------------------- |
| `org`        | l'identifiant d'URL de l'organisation      | obligatoire, sinon rien       |
| `lang`       | `fr`, `de`, `it`, `ar`                     | la langue de l'organisation   |
| `view`       | `semaine`, `cours`, `mois`                 | `semaine`                     |
| `audience`   | `kids`, `youth`, `women`, `adults`, `open` | tous les publics              |
| `min-height` | un nombre de pixels                        | `320`                         |
| `base`       | l'origine du service                       | celle d'où le script est venu |

**Un attribut absent ou absurde est ignoré, jamais une erreur.** `lang="klingon"` donne la langue de
l'organisation ; `view="tableau"` donne la vue Semaine ; `min-height="-42"` donne 320.

Sans `org`, aucun cadre n'est posé et le contenu de repli reste seul visible : c'est la bonne
réponse, et non un message d'erreur sur le site de quelqu'un d'autre.

## Ce que le widget affiche, de haut en bas

1. **Le cadre**, sur toute la largeur disponible, sans bordure et sans barre de défilement interne.
   Sa hauteur vaut `min-height` jusqu'à ce que la page annonce la sienne.
2. **Un pied d'une ligne**, discret, en police du système, à 0,8 rem :
   - `Voir le programme complet` — un lien vers la page publique, qui **sort du cadre** (nouvelle
     fenêtre). C'est lui qu'on imprime, et c'est lui qui reste utile si le cadre ne s'affiche pas ;
   - `Proposé gratuitement par jadwal`.

Le pied est traduit dans les quatre langues, d'après l'attribut `lang`.

Le cadre porte un `title` traduit — `Programme des cours`, `Kursprogramm`, `Programma dei corsi`,
`برنامج الدروس` — sans quoi il serait annoncé comme un cadre anonyme.

## Ce que la page publique change en mode intégré

Le paramètre `?embed=1` est posé par le widget, et par lui seul. Il change trois choses, et rien
d'autre : le contenu, l'en-tête, les vues, les filtres et les langues sont exactement les mêmes.

1. **Un script**, un seul, `/widget/embed.js`. Il annonce la hauteur, et il fait naviguer par
   remplacement pour ne pas empiler d'entrées dans l'historique du site de l'organisation.
2. **Trois règles de style** : plus de barre de défilement interne, une gouttière de barre stable,
   et un contexte de bloc sur le corps pour qu'aucune marge ne sorte de la boîte mesurée.
3. **La mention `Proposé gratuitement par jadwal` disparaît du pied de la page** : c'est le pied du
   widget qui la porte, sous le cadre, donc sur le site de l'organisation. L'écrire deux fois à dix
   pixels d'écart n'apprendrait rien.

Le lien `S'abonner au calendrier` reste, lui, dans le pied de la page.

## Ce que le widget ne fait pas

- **Il ne redessine rien.** Pas de seconde implémentation des trois vues.
- **Il ne lit aucune donnée.** Il n'appelle pas l'API : c'est la page qui la remplace.
- **Il ne traite aucun autre message** que l'annonce de hauteur, et seulement si elle vient de son
  propre cadre, de la bonne origine, et avec la bonne forme.
- **Il ne prend pas les couleurs du site.** Rien n'est hérité à travers un cadre ; le programme
  s'affiche comme une carte posée sur la page.
- **Il ne réécrit jamais le `src` d'un cadre existant** : sur un changement d'attribut, il remplace
  le cadre. Réécrire `src` ajouterait une entrée à l'historique du site de l'organisation.

## La page d'essai d'intégration

`/widget/test`, servie par le projet, porte `noindex` et n'est liée depuis nulle part. Elle imite le
site d'une organisation — une autre police, d'autres couleurs, pas notre en-tête — et charge le
widget par son adresse versionnée, avec son empreinte et `crossorigin`.

Six configurations, dans cet ordre : le code ordinaire ; l'allemand sur la vue Tous les cours ;
l'arabe sur la vue Mois ; deux widgets côte à côte ; des attributs absurdes ; aucun `org`.

**Ce qu'elle sert à vérifier de ses yeux, avant chaque publication :** la hauteur suit le contenu,
il n'y a aucune barre de défilement à l'intérieur d'un cadre, déplier un cours fait grandir le cadre
sans à-coup, et la hauteur de l'un des deux widgets du bas ne bouge pas quand l'autre change.

Une honnêteté à garder en tête : sur cette page, le cadre est de la **même** origine. La
vérification d'origine y passe trivialement. C'est `apps/web/tests/widget.test.ts` qui éprouve le
reste, et `packages/widget/src/element.test.ts` qui éprouve les refus.

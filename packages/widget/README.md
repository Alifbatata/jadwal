# @jadwal/widget

Le custom element `<jadwal-widget org="...">` à coller sur le site d'une mosquée. Licence MIT (voir
`LICENSE` dans ce dossier) : un site qui colle le script n'a d'autre obligation que de conserver
l'avis de copyright et de licence s'il redistribue le fichier.

**Ce fichier ne dessine rien.** Il pose un cadre vers la page publique `/m/<identifiant>` et lui
donne la hauteur de son contenu. Les vues, les filtres et les quatre langues sont ceux de la page,
testés une seule fois, identiques partout. Les raisons et ce que cela coûte sont dans l'ADR 0005,
révisé à l'étape 6.

Aucune bibliothèque, aucune dépendance à l'exécution : **1,71 Kio gzip**, mesurés.

Pour un responsable de mosquée, la marche à suivre est dans `docs/INTEGRATION.md`. Ce fichier-ci
s'adresse à qui travaille sur le paquet.

## Le code à coller

```html
<script src="https://exemple.invalid/widget/jadwal-widget.js"></script>
<jadwal-widget org="ma-mosquee">
	<a href="https://exemple.invalid/m/ma-mosquee">Voir le programme des cours</a>
</jadwal-widget>
```

Le lien à l'intérieur de la balise est le **contenu de repli** : il s'affiche exactement quand le
script n'a pas pu s'exécuter — JavaScript désactivé, script bloqué, empreinte qui ne correspond
plus. L'élément n'ayant aucun `<slot>`, ce contenu disparaît dès qu'il est défini.

L'origine du service est déduite de l'adresse du script lui-même : c'est la seule valeur qu'on ne
peut pas demander à une mosquée sans qu'elle la recopie de travers une fois sur deux.

## Les attributs

| Attribut     | Valeurs                                    | Défaut                        |
| ------------ | ------------------------------------------ | ----------------------------- |
| `org`        | l'identifiant d'URL de l'organisation      | obligatoire                   |
| `lang`       | `fr`, `de`, `it`, `ar`                     | la langue de l'organisation   |
| `view`       | `semaine`, `cours`, `mois`                 | `semaine`                     |
| `audience`   | `kids`, `youth`, `women`, `adults`, `open` | tous les publics              |
| `min-height` | un nombre de pixels                        | `320`                         |
| `base`       | l'origine du service                       | celle d'où le script est venu |

Un attribut absent ou absurde est ignoré, jamais une erreur. Sans `org`, aucun cadre n'est posé et
le contenu de repli reste seul visible.

## Le message de hauteur

La page intégrée — et elle seule, par le paramètre `?embed=1` — envoie
`{ type: 'jadwal:height:1', height: <pixels> }` à son parent. Le widget vérifie, dans cet ordre :

1. **la fenêtre émettrice** est celle de son cadre. C'est la vérification qui fait tout le travail :
   n'importe quel cadre de la page hôte peut poster un message, et c'est elle aussi qui empêche deux
   `<jadwal-widget>` de se marcher dessus ;
2. **l'origine** est exactement celle du cadre, par égalité stricte — `startsWith` accepterait
   `https://jadwal.example.evil.tld`, `endsWith` accepterait `https://evil-jadwal.example` ;
3. **la forme** : le nom exact, et un nombre fini.

La hauteur est ensuite bornée entre `min-height` et 20 000 pixels, et ignorée en deçà de deux pixels
d'écart. Aucun autre type de message n'est traité.

## Développer

```
pnpm --filter @jadwal/widget build      # produit dist/jadwal-widget.js (un seul fichier, IIFE)
pnpm --filter @jadwal/widget test       # vitest + jsdom : 25 tests
pnpm --filter @jadwal/widget size       # taille brute et gzip
pnpm --filter @jadwal/widget integrity  # l'empreinte SHA-384 et le code à coller
```

Le paquet est construit à l'installation (`prepare`), parce que `apps/web` incorpore le fichier
construit dans son serveur : sans lui, `pnpm check` échouerait sur une importation introuvable.

## Publier une nouvelle version

1. `pnpm build` à la racine, pour que le fichier construit soit à jour.
2. `pnpm --filter @jadwal/widget integrity` : il affiche la version, l'empreinte, et le code à
   coller.
3. Ouvrir `/widget/test` sur l'instance et vérifier **de ses yeux** : la hauteur suit le contenu, il
   n'y a aucune barre de défilement à l'intérieur d'un cadre, et les deux widgets côte à côte ne se
   marchent pas dessus.
4. Déployer. L'adresse `/widget/jadwal-widget.js` sert le nouveau fichier immédiatement ; l'adresse
   versionnée change, et l'ancienne répond `404`.

**Un site qui a épinglé une empreinte cesse d'afficher le programme après une publication**, sans
message, jusqu'à ce qu'il recopie le nouveau code depuis l'écran « Partager ». C'est le prix d'une
empreinte, il est dit dans `docs/INTEGRATION.md`, et c'est pourquoi l'adresse ordinaire n'en publie
aucune.

## Essayer

La page d'essai d'intégration est servie par le projet, à `/widget/test`. Elle charge le widget
comme le ferait un site extérieur, avec six configurations. Voir `docs/maquettes/widget.md`.

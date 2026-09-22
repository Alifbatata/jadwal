# ADR 0001 : Licences

> **Remplacé par l'ADR 0043** : jadwal est sous licence MIT pour tout le dépôt, widget compris.
> Ce qui suit n'est pas réécrit, et reste exact pour son moment.

## Contexte

`jadwal` est un projet libre. Le même code sert deux modes de déploiement : un service
hébergé par l'auteur, ou un auto-hébergement par une organisation avec Docker Compose documenté.
La V1 est gratuite ; des offres payantes viendront plus tard.

Le dépôt est un monorepo pnpm (`apps/web`, `packages/core`, `packages/db`, `packages/widget`),
portée npm `@jadwal/*`, tous les paquets en `private: true`. Le widget se distingue par son mode
de diffusion : il est compilé en custom element `<jadwal-widget>`, en un seul fichier
`dist/jadwal-widget.js`, sans dépendance à l'exécution, utilisable avec une simple balise
`<script>` que les sites des organisations collent chez eux. Contrainte : un site qui colle ce
script ne doit avoir aucun doute sur ses obligations.

Le projet accepte des contributions externes. L'auteur veut pouvoir financer le projet.

## Décision

- Tout le dépôt est sous licence AGPL-3.0-or-later. Le fichier `LICENSE` à la racine contient le
  texte intégral de l'AGPL-3.0, récupéré depuis la source officielle (gnu.org). Le champ `license`
  de chaque paquet, sauf le widget, vaut `AGPL-3.0-or-later`.
- `packages/widget` est sous licence MIT, et lui seul : il porte son propre fichier `LICENSE` et
  son champ `license` vaut `MIT`. Ainsi, aucun site qui colle le script n'a de doute sur ses
  obligations.
- Les contributions externes sont soumises à la signature d'un accord de contribution (CLA), pour
  permettre à l'auteur de financer le projet. `CONTRIBUTING.md` le mentionne, avec cette raison.

## Conséquences

- Un site qui intègre `dist/jadwal-widget.js` ne relève que de la licence MIT du widget ; le reste
  du dépôt (`apps/web`, `packages/core`, `packages/db`) reste sous AGPL-3.0-or-later.
- `packages/widget` est le seul paquet dont la licence diffère de celle de la racine : son fichier
  `LICENSE` et son champ `license` sont à maintenir à part.
- Le texte de l'AGPL-3.0 n'est pas retapé ni résumé : il est repris tel quel depuis gnu.org.
- Toute contribution externe demande la signature du CLA ; la contrainte est annoncée dans
  `CONTRIBUTING.md`, avec sa raison.

## Statut

Accepté, 2026-09-19, étape 0 de la feuille de route (dépôt, licences, docs, CI).

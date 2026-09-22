# ADR 0002 : Architecture du monorepo

## Contexte

`jadwal` produit, à partir d'une seule saisie des responsables, quatre sorties : un widget
intégrable au site de l'organisation, une page publique par organisation, un flux agenda ICS et des
messages WhatsApp. Le même code sert aux deux modes de déploiement : service hébergé par l'auteur
ou auto-hébergement par une organisation. Le cadrage (`docs/CADRAGE.md`) découpe la technique en
quatre parties : une bibliothèque de logique pure (récurrence, exceptions, ancrage sur la prière,
export ICS), une base PostgreSQL avec RLS par organisation, une application SvelteKit (espace des
responsables, pages publiques, API publique, flux ICS) et un widget compilé en custom element.

Contraintes : tout doit fonctionner sous Windows (PowerShell) et sous Linux ; pas d'abstraction
prématurée ; aucune dépendance sans besoin immédiat. L'étape 0 de la feuille de route amorce le
dépôt, les licences, la documentation et la CI.

## Décision

Nous organisons le dépôt en un monorepo pnpm. La dernière version stable de pnpm est activée par
corepack et épinglée dans le champ `packageManager`. Les paquets sont déclarés dans
`pnpm-workspace.yaml` :

- `apps/web` : application SvelteKit avec `adapter-node` ;
- `packages/core` : bibliothèque TypeScript pure, zéro dépendance à l'exécution, qui porte la
  récurrence, les exceptions, l'ancrage sur la prière et l'export ICS ;
- `packages/db` : Drizzle + PostgreSQL, RLS par organisation, tests avec un rôle `NOBYPASSRLS` ;
- `packages/widget` : Svelte 5 compilé en custom element `<jadwal-widget>`, livré en un seul
  fichier JS (`dist/jadwal-widget.js`).

À côté des paquets : `docs/` (`CADRAGE.md`, `adr/`, `maquettes.md`), `A_LIVRER/`
(`RAPPORT_DERNIER.md`, hors dépôt depuis l'étape 9) et `.github/` (`workflows/ci.yml`,
`dependabot.yml`).

Les paquets portent la portée npm `@jadwal/*` et sont tous marqués `private: true`.

Les `package.json` ne contiennent aucun script shell : les scripts utilitaires sont écrits en Node.
Le développement se fait sur `main` (« trunk-based »), en commits atomiques au format Conventional
Commits. Nous n'introduisons ni abstraction prématurée, ni dépendance sans besoin immédiat.

## Conséquences

- Les quatre parties vivent dans un seul dépôt et partagent le même historique sur `main`.
- Aucun paquet n'est publié sur npm.
- Les scripts utilitaires s'écrivent en Node, jamais en shell, afin de tourner à l'identique sous
  Windows et sous Linux ; `.gitattributes` impose `eol=lf`.
- Chaque dépendance ajoutée est listée et justifiée en une ligne dans le rapport de l'étape.
- `packages/core` ne peut s'appuyer sur aucune bibliothèque à l'exécution.
- À l'étape 0, `packages/db` est un paquet vide avec un README ; le schéma arrive à l'étape 2.
  `packages/core` et ses tests arrivent à l'étape 1, `packages/widget` à l'étape 6.

## Statut

Accepté, 2026-09-19, étape 0 de la feuille de route (dépôt, licences, docs, CI).

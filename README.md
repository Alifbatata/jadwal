# jadwal

**Statut : en développement, pas encore utilisable.**

`jadwal` (« horaire » en arabe) permet à une mosquée, puis plus tard à toute organisation, de publier
le programme de ses cours récurrents à partir d'une seule saisie. Les responsables saisissent une
fois ; en sortent un widget intégrable au site de la mosquée, une page publique, un flux agenda
(ICS) et des messages WhatsApp prêts à coller. Gratuit pour les mosquées. Le même code fonctionne
en service hébergé par l'auteur ou installé par l'organisation sur son propre serveur.

Le cadrage complet est dans [`docs/CADRAGE.md`](docs/CADRAGE.md), les décisions dans
[`docs/adr/`](docs/adr/), l'état d'avancement dans [`ETAT-PROJET.md`](ETAT-PROJET.md).

## Structure

```
apps/web/          SvelteKit (adapter-node) : espace des responsables, pages publiques, API, ICS
packages/core/     bibliothèque TypeScript pure : récurrence, exceptions, prières, export ICS
packages/db/       Drizzle + PostgreSQL, RLS par organisation (vide jusqu'à l'étape 2)
packages/widget/   custom element Svelte 5 <jadwal-widget>, un seul fichier JS
docs/              cadrage, ADR, maquettes, exploitation
infra/             déploiement en fichiers : Ansible, Compose, Caddy, systemd, sauvegardes
.github/           CI GitHub Actions, Dependabot
```

## Commandes

Prérequis : Node 24 (voir `.node-version`), git, corepack (encore distribué avec Node 24 ; la CI, elle,
installe pnpm avec l'action officielle `pnpm/setup`). Docker est optionnel jusqu'à l'étape 2.

```
corepack enable                 # une fois ; sous Windows, dans une console administrateur
pnpm install --frozen-lockfile
pnpm lint                       # prettier --check + eslint
pnpm format                     # prettier --write
pnpm check                      # tsc / svelte-check dans chaque paquet
pnpm test                       # vitest dans chaque paquet (couverture de core imposée à 90 %)
pnpm test:tz                    # suite de core rejouée sous quatre fuseaux de machine
pnpm build                      # build de chaque paquet
```

Les variables d'environnement sont documentées dans `.env.example`. La base de développement
(`docker-compose.dev.yml`) ne sert qu'à partir de l'étape 2.

## Licence et droits d'auteur

- Titulaire du copyright : Mahmoud Ali Mohamad (Voltia). Le fichier [`COPYRIGHT`](COPYRIGHT) porte la
  ligne de copyright et l'avis standard recommandé par l'AGPL ; le texte de l'AGPL lui-même n'a pas de
  ligne de titulaire.
- Tout le dépôt est sous **AGPL-3.0-or-later** (fichier [`LICENSE`](LICENSE)). Quiconque fait tourner une
  version modifiée en service réseau doit en proposer le code source aux utilisateurs (section 13 de
  l'AGPL) ; l'instance officielle affichera un lien vers le dépôt.
- Le paquet `packages/widget` est sous **MIT** (fichier [`packages/widget/LICENSE`](packages/widget/LICENSE),
  même titulaire) : c'est le script que les sites des mosquées collent chez eux, et aucun site qui le
  colle ne doit avoir de doute sur ses obligations.
- Les contributions externes sont soumises à un accord de contribution (CLA), voir
  [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Documentation

- [`docs/CADRAGE.md`](docs/CADRAGE.md) : produit, rôles, cours, côté public, technique, feuille de route.
- [`docs/adr/`](docs/adr/) : décisions d'architecture.
- [`docs/maquettes.md`](docs/maquettes.md) : prototypes validés.
- [`docs/EXPLOITATION.md`](docs/EXPLOITATION.md) : faire tourner le service, sauvegarder,
  restaurer, mettre à jour, revenir en arrière. Écrit pour être lu à deux heures du matin.
- [`infra/README.md`](infra/README.md) : ce que le déploiement pose sur le serveur, et comment
  le retirer.
- [`SECURITY.md`](SECURITY.md) : signalement d'une vulnérabilité.

---

## English summary

`jadwal` ("schedule" in Arabic) lets a mosque, and later any organisation, publish its recurring
class schedule from a single entry. Staff enter the programme once; out come an embeddable widget,
a public page, an ICS calendar feed and ready-to-paste WhatsApp messages. Free for mosques. The same
code runs as a hosted service or self-hosted with Docker Compose. Status: under development, not
usable yet. Licence: AGPL-3.0-or-later for the repository, MIT for `packages/widget`. External
contributions require a CLA.

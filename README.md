# jadwal

**Statut : en développement, pas encore utilisable.**

`jadwal` (« horaire » en arabe) permet à une organisation de publier le programme de ses cours
récurrents à partir d'une seule saisie. Associations, écoles, clubs, entreprises, lieux de culte :
toute organisation qui répète un programme et doit le faire savoir.

Les responsables saisissent une fois ; en sortent un widget intégrable au site de l'organisation, une
page publique, un flux agenda (ICS) et des messages WhatsApp prêts à coller. Le service est gratuit.
Le même code fonctionne en service hébergé par l'auteur ou installé par l'organisation sur son propre
serveur.

Ce qu'il sait faire :

- des **cours récurrents** : toutes les semaines, une semaine sur deux, un jour du mois, ou des dates
  choisies ; avec leurs annulations, leurs déplacements et leurs pauses ;
- une **page publique** en quatre langues, sans aucun script ni aucune ressource extérieure ;
- un **widget** à coller sur votre site, en une balise ;
- un **flux agenda** que chacun peut suivre depuis son téléphone ;
- des **messages prêts à coller** pour annoncer un changement ;
- un **compteur de consultations** qui ne retient aucune donnée personnelle ;
- en option, un **module d'heures de prière** : les horaires d'un lieu de culte, saisis, importés ou
  calculés, avec l'iqama et la prière du vendredi. Il est désactivé par défaut, et une organisation
  qui ne l'active pas ne le voit nulle part.

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
  ligne de copyright et l'avis MIT.
- Tout le dépôt est sous **MIT** (fichier [`LICENSE`](LICENSE)), widget compris. Le widget garde une
  copie du texte dans [`packages/widget/LICENSE`](packages/widget/LICENSE), parce que ce paquet se lit
  seul par qui colle le script sur son site (ADR 0043).
- Les licences des composants tiers embarqués dans l'image de production sont dans
  `LICENCES-TIERCES.md`, engendré à la construction à partir du contenu réel de l'image.
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

`jadwal` ("schedule" in Arabic) lets any organisation publish its recurring class schedule from a
single entry: associations, schools, clubs, companies, places of worship. Staff enter the programme
once; out come an embeddable widget, a public page, an ICS calendar feed and ready-to-paste WhatsApp
messages. The service is free. An optional prayer-times module is available for places of worship,
switched off by default. The same code runs as a hosted service or self-hosted with Docker Compose.
Status: under development, not usable yet. Licence: MIT. External contributions require a CLA.

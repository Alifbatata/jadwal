# jadwal

**Statut : première version, en ligne depuis le 21 septembre 2026.**

`jadwal` (« horaire » en arabe) permet à une organisation de publier le programme de ses cours
récurrents à partir d'une seule saisie. Associations, écoles, clubs, entreprises, lieux de culte :
toute organisation qui publie un programme régulier et doit le faire savoir.

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
- des **conditions d'utilisation** en ligne, lisibles sans compte. Chaque personne les accepte avant
  d'entrer dans l'espace d'une organisation, et de nouveau quand le texte change de version ;
- en option, un **module d'heures de prière** : les horaires d'un lieu de culte, saisis, importés ou
  calculés, avec l'iqama et la prière du vendredi. Il est désactivé par défaut, et une organisation
  qui ne l'active pas ne le voit nulle part.

Le cadrage complet est dans [`docs/CADRAGE.md`](docs/CADRAGE.md), les décisions dans
[`docs/adr/`](docs/adr/), l'état d'avancement dans [`ETAT-PROJET.md`](ETAT-PROJET.md).

## Structure

```
apps/web/          SvelteKit (adapter-node) : espace des responsables, pages publiques, API, ICS
packages/core/     bibliothèque TypeScript pure : récurrence, exceptions, prières, export ICS
packages/db/       Drizzle + PostgreSQL : schéma, migrations, isolation par organisation (RLS)
packages/widget/   élément <jadwal-widget> en TypeScript pur, sans dépendance, un seul fichier JS
docs/              cadrage, conditions d'utilisation, ADR, maquettes, API, exploitation
infra/             déploiement en fichiers : Ansible, Compose, Caddy, systemd, sauvegardes
scripts/           contrôles et épreuves en Node, PDF des conditions
.github/           CI GitHub Actions, Dependabot
```

## Commandes

Prérequis : Node 24 (voir `.node-version`), git, `corepack` (encore distribué avec Node 24 ; la CI,
elle, installe pnpm avec l'action officielle `pnpm/setup`). Docker, pour la base de développement
dont ont besoin les tests de `packages/db` et d'`apps/web`, pour le correcteur et pour les épreuves
de l'image. Chrome ou Chromium, déjà installé, pour le parcours et le PDF : aucun navigateur n'est
téléchargé.

```
corepack enable                 # une fois ; sous Windows, dans une console administrateur
pnpm install --frozen-lockfile
pnpm lint                       # prettier --check + eslint + contrôle de style
pnpm format                     # prettier --write
pnpm check                      # tsc / svelte-check dans chaque paquet
pnpm test                       # vitest dans chaque paquet (couverture de core imposée à 90 %)
pnpm test:tz                    # suite de core rejouée sous quatre fuseaux de machine
pnpm build                      # build de chaque paquet
pnpm style                      # tiret cadratin et chevilles dans les textes lus par les gens
pnpm orthographe                # LanguageTool hors réseau, en conteneur, en quatre langues
pnpm image:test                 # l'image de production, construite, lancée et interrogée (Docker)
pnpm parcours:test              # le parcours d'une organisation dans Chrome, et axe (Docker, Chrome)
pnpm garde:test                 # la garde du déploiement, cas par cas, contre une fausse API (Docker)
pnpm sauvegarde:test            # la sauvegarde de nuit, jusqu'à l'âge des objets distants (Docker)
pnpm conditions:pdf             # le PDF des conditions pour le juriste (Chrome)
pnpm conditions:test            # éprouve le générateur de ce PDF
```

Les variables d'environnement sont documentées dans `.env.example`. La base de développement est
dans `docker-compose.dev.yml`.

## Licence et droits d'auteur

- Titulaire du copyright : Mahmoud Ali `Mohamad` (Voltia). Le fichier [`COPYRIGHT`](COPYRIGHT) porte la
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
- [`docs/CONDITIONS.md`](docs/CONDITIONS.md) : les conditions d'utilisation, telles que le service
  les montre et les fait accepter.
- [`docs/adr/`](docs/adr/) : décisions d'architecture.
- [`docs/maquettes.md`](docs/maquettes.md) : prototypes validés, et descriptions écran par écran.
- [`docs/INTEGRATION.md`](docs/INTEGRATION.md) : pour une personne responsable, poser le programme
  sur le site de son organisation.
- [`docs/CALENDRIER-PRIERES.md`](docs/CALENDRIER-PRIERES.md) : pour la même personne, régler les
  heures de prière de son organisation.
- [`docs/API.md`](docs/API.md) : l'API publique en lecture seule et les flux agenda.
- [`docs/SECURITE.md`](docs/SECURITE.md) : le modèle de menace.
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
switched off by default. Everyone who enters an organisation's workspace first accepts the terms of
use, published online. The same code runs as a hosted service or self-hosted with Docker Compose.
Status: first version, online since 21 September 2026. Licence: MIT. External contributions require
a CLA.

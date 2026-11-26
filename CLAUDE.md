# jadwal : consignes de travail

Lire `ETAT-PROJET.md` en premier. Il fait autorité sur l'étape en cours, ce qui est fait et ce qui reste.
`docs/CADRAGE.md` fixe le produit ; `docs/adr/` consigne les décisions.

## Ce dépôt est public, et il ne parle que de jadwal

**Aucune information sur l'infrastructure de l'exploitant ni sur ses autres services n'entre ici.**
Cette règle est permanente et n'a pas d'exception.

Ne doivent apparaître nulle part — ni dans un fichier, ni dans un commentaire, ni dans un message de
commit, ni dans une sortie de commande recopiée :

- le nom, le gabarit, le système ou l'adresse de la machine, et le nom de son hébergeur ailleurs que
  dans `docs/CONDITIONS.md`, qui dit l'hébergeur et le pays des données, rien d'autre ;
- les autres applications qui tournent sur cette machine, sous quelque nom que ce soit ;
- les comptes système réels, les règles `sudo`, le port SSH, les noms et empreintes de clés ;
- les chemins réels, les unités systemd d'autres services, les crontabs, les horaires de sauvegarde ;
- les journaux de séance, les sorties d'audit, les inventaires de la machine.

Ce qui sert à quelqu'un qui s'auto-héberge reste, avec des **valeurs d'exemple** : `infra/` se lit
comme un modèle, pas comme la description d'une machine en service. Il est légitime d'écrire qu'un
serveur _peut_ héberger d'autres applications ; il ne l'est jamais de dire lesquelles.

Tout ce qui est propre à une machine en service — inventaire, adresses, comptes, port, chemins,
journaux de séance, sorties d'audit — vit dans **`PRIVE/`**, et nulle part ailleurs. C'est le seul
autre dossier de travail : il est ignoré par git, comme `A_LIVRER/`, et le crochet `pre-push` refuse
toute poussée qui en emporterait un fichier, **même ajouté avec `git add -f`**. Il n'y a pas de
second dépôt.

Avant chaque poussée, relire `git diff --staged` en entier avec cette règle en tête. Une fuite
poussée ne se rattrape pas : elle subsiste dans des journaux et des caches que le dépôt ne contrôle
pas.

## Règles de travail

- Docs, rapports et commentaires de haut niveau en français. Code, identifiants, noms de fichiers de
  code et messages de commit en anglais.
- Planifier avant d'agir : écrire le plan dans `A_LIVRER/RAPPORT_DERNIER.md` (section Plan) avant de
  créer le reste, puis exécuter.
- Preuve par exécution réelle : chaque commande de vérification est lancée pour de vrai et sa sortie
  utile est copiée dans le rapport. Jamais de « devrait fonctionner ».
- Zéro valeur fragile codée en dur : ports, URLs, identifiants passent par des variables
  d'environnement documentées dans `.env.example`.
- Pas d'abstraction prématurée. Aucune dépendance sans besoin immédiat. Chaque dépendance ajoutée est
  listée et justifiée en une ligne dans le rapport.
- Aucune télémétrie. Aucun secret dans le dépôt.
- Tout doit fonctionner sous Windows (PowerShell) et sous Linux : pas de script shell spécifique dans
  les `package.json`, scripts utilitaires en Node.
- Pour SvelteKit, les custom elements, pnpm et GitHub Actions, vérifier la doc officielle actuelle
  au lieu de se fier à sa mémoire.
- Développement sur `main` (trunk-based), commits atomiques au format Conventional Commits, push sur
  `origin main` à la fin de l'étape.
- Si une consigne est impossible ou en contredit une autre, s'arrêter et poser la question.

## Reprise et vérifications

- Au mot « continue » ou « reprends », souvent après un `/clear` : lire `PRIVE/REPRISE.md`, puis la
  section Plan de `A_LIVRER/RAPPORT_DERNIER.md`, et faire le prochain chantier sans redemander ce
  qui est tranché. À la fin de chaque chantier : le rapport et `PRIVE/REPRISE.md` à jour, puis dire
  que `/clear` est possible, mais jamais pendant qu'une commande tourne en arrière-plan.
- Faire soi-même tout test qu'un outil peut jouer : parcours, navigateur, lectures publiques. Ne
  laisser au chef de projet que ce qui demande un humain ou ses accès (relecture par un locuteur,
  vrai téléphone, comptes chez les fournisseurs) et ses décisions.
- Les épreuves lourdes (image Docker, parcours dans Chrome, LanguageTool) se lancent seules, au
  premier plan. Avant, mesurer la mémoire libre ; sous 3 Go environ, demander d'abord de fermer des
  applications. Une commande arrêtée faute de mémoire ne se relance pas sans accord : la CI rejoue
  le reste.

## Pièges de Windows

- Un texte qui porte un antislash ne passe jamais par un heredoc, par `sed -i` ni par `node -e "…"`
  sous Git Bash : ils mangent ou interprètent `\n`, `\b` ou `\c` sans rien dire, et les accents
  graves y sont exécutés. Passer par l'outil d'édition, ou par un script `.mjs` écrit puis lancé.
- Python sous Windows écrit des fins de ligne `\r\n` : toujours passer `newline=''` à `open()`. Un
  script shell en CRLF ne tourne pas sous Linux, et ce qui part sur un serveur vient de l'arbre de
  travail, pas de git.
- Sous PowerShell, `| Select-Object -First N` arrête la commande en amont : un build coupé, puis
  « No test files found ». Filtrer avec `-Last N`.
- Une commande `pnpm` qui réinstalle et s'arrête sur « Accès refusé. (os error 5) » bute sur un
  verrou passager, pas sur des droits : relancer `pnpm install --frozen-lockfile`.

## Consignes privées

Ce qui est propre au poste de travail et à l'instance en service vit dans `PRIVE/CLAUDE.md`,
absent du dépôt public :

@PRIVE/CLAUDE.md

## Structure

- `apps/web/` : SvelteKit (adapter-node), espace des responsables, pages publiques, API, flux ICS.
- `apps/live/` : le relais du direct (ADR 0055), un programme Node à part du serveur web. Une
  dépendance, `ws`. Éteint sans `JADWAL_LIVE_TRANSLATOR` ; le seul traducteur est simulé.
- `packages/core/` : bibliothèque TypeScript pure (récurrence, exceptions, prières, ICS).
- `packages/db/` : Drizzle + PostgreSQL, RLS (vide jusqu'à l'étape 2).
- `packages/widget/` : custom element `<jadwal-widget>` en TypeScript pur, sans dépendance à
  l'exécution, un seul fichier JS, licence MIT (ADR 0005 révisé à l'étape 6).
- `docs/` : `CADRAGE.md`, `adr/`, `maquettes.md`.
- `A_LIVRER/RAPPORT_DERNIER.md` : rapport de la dernière étape. **Ignoré par git** : ce dossier ne
  quitte pas le poste, parce qu'un rapport recopie des sorties de commandes et que ces sorties
  parlent de la machine.
- `PRIVE/` : **tout ce qui est propre au serveur de celui qui exploite cette instance**, et le seul
  autre dossier de travail. Le coffre chiffré, l'inventaire Ansible réel, la liste des termes
  interdits, les marches à suivre, les journaux de séance, les archives. **Ignoré par git**, et
  refusé à la poussée par le crochet `pre-push` même s'il y entre avec `git add -f` — voir
  `PRIVE/LISEZMOI.md`. Il n'y a pas de second dépôt : ce qui ne doit pas être public vit ici.
- `.github/` : CI et Dependabot.

## Commandes (à la racine)

```
corepack enable                 # une fois ; sous Windows, dans une console administrateur
pnpm install --frozen-lockfile
pnpm lint                       # prettier --check + eslint sur tout le dépôt
pnpm format                     # prettier --write
pnpm check                      # tsc / svelte-check dans chaque paquet
pnpm test                       # vitest dans chaque paquet, puis un tableau par paquet
                                # (fichiers, tests, réussis, sautés, échoués) ; un test sauté = rouge
pnpm test:temps                 # les tests liés au temps (*.temps.test.ts), à part : voir CONTRIBUTING
pnpm tests:test                 # l'épreuve des deux commandes de test elles-mêmes
pnpm build                      # build de chaque paquet
```

## Format du rapport

`A_LIVRER/RAPPORT_DERNIER.md`, sections dans cet ordre : Plan ; Ce qui a été fait ; Versions
installées (Node, pnpm et chaque dépendance) ; Commandes de vérification avec leurs sorties réelles ;
Taille gzip du widget ; Écarts par rapport au prompt et pourquoi ; Actions manuelles en attente ;
Questions ouvertes.

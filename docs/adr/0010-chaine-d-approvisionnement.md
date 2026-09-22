# ADR 0010 : Chaîne d'approvisionnement

## Contexte

`jadwal` est un projet open source organisé en monorepo pnpm : `apps/web`, `packages/core`,
`packages/db` et `packages/widget`. Ses dépendances sont installées par pnpm, son intégration
continue tourne sur GitHub Actions (push et pull request vers `main`, `ubuntu-latest`, Node 24,
`corepack`) et sa base de développement est une image PostgreSQL lancée par `docker-compose.dev.yml`,
qui ne sert qu'à partir de l'étape 2.

Les règles du projet fixent le cadre : « aucune dépendance sans besoin immédiat », chaque
dépendance ajoutée listée et justifiée en une ligne dans le rapport, aucune télémétrie, aucun secret
dans le dépôt, et zéro valeur fragile codée en dur : ports, URL et identifiants passent par des
variables d'environnement documentées dans `.env.example`.

## Décision

- Dans `pnpm-workspace.yaml` : `minimumReleaseAge: 10080` (soit 7 jours), `strictDepBuilds: true`,
  `trustPolicy: no-downgrade` et `blockExoticSubdeps: true`.
- Dans `.npmrc` : `save-exact=true` et `engine-strict=true`.
- Une exception à `trustPolicy` est déclarée version par version dans `trustPolicyExclude`, avec
  sa raison en commentaire. Une seule à ce jour : `chokidar@4.0.3`, publiée sans attestation de
  provenance alors que 4.0.1 en avait une, cas cité en exemple par la doc pnpm ; elle est tirée
  par `svelte-check`.
- Chaque dépendance est épinglée exactement à la dernière version stable compatible avec le délai
  de 7 jours. Chaque dépendance ajoutée est justifiée en une ligne dans le rapport
  (`A_LIVRER/RAPPORT_DERNIER.md`).
- Toute dépendance qui a besoin d'un script d'installation (`esbuild`, par exemple) est autorisée
  explicitement, selon le mécanisme de la version de pnpm installée, et listée dans le rapport.
- pnpm est épinglé dans sa dernière version stable dans le champ `packageManager`. En local, il est
  activé par `corepack` (encore distribué avec Node 24). En CI, depuis l'étape 1, il est installé par
  l'action officielle `pnpm/setup` recommandée par la doc pnpm, épinglée par SHA de commit complet,
  qui lit la version dans `packageManager`, vérifie le téléchargement par la signature du registre
  `npm` et met le store pnpm en cache (clé dérivée de `pnpm-lock.yaml`) ; l'installation reste une
  étape explicite `pnpm install --frozen-lockfile`. Raison : `corepack` n'est plus distribué avec Node
  à partir de la v25.
- Dans la CI GitHub Actions (`.github/workflows/ci.yml`) : les actions sont épinglées par SHA de
  commit complet, avec la version en commentaire ; le workflow déclare `permissions: contents: read` ;
  l'installation se fait par `pnpm install --frozen-lockfile`.
- Dependabot (`.github/dependabot.yml`) surveille les écosystèmes `npm` et `github-actions`, avec un
  délai de 7 jours. Les alertes Dependabot et les mises à jour de sécurité Dependabot sont activées
  sur le dépôt GitHub (par l'API, étape 1) ; les mises à jour de sécurité ne suivent pas le délai de
  7 jours, ce qui est voulu.
- Dans `docker-compose.dev.yml`, l'image PostgreSQL est épinglée par digest.
- Le dépôt ne contient aucun secret et le projet n'embarque aucune télémétrie.

## Conséquences

- Une version publiée depuis moins de 7 jours n'est pas installée, même si elle est la plus
  récente : la mise à niveau attend l'expiration du délai. Dependabot applique le même délai.
- Aucune plage de versions : chaque mise à jour de dépendance est un changement explicite du
  `package.json` et du fichier de verrouillage, et la CI n'installe que ce que décrit ce fichier de
  verrouillage (`--frozen-lockfile`).
- Les scripts d'installation ne s'exécutent pas par défaut : chaque dépendance qui en a besoin
  demande une autorisation explicite, à tenir à jour et à consigner dans le rapport.
- Mettre à jour une action GitHub, c'est changer un SHA et son commentaire de version ; mettre à
  jour l'image PostgreSQL, c'est changer un digest. Dependabot, tel que configuré (`npm` et
  github-actions), couvre le premier cas, pas le second.
- L'épinglage de l'image PostgreSQL n'a d'effet qu'à partir de l'étape 2, quand
  `docker-compose.dev.yml` commence à servir.
- pnpm 12 ne lit plus `save-exact` ni `engine-strict` dans `.npmrc` : les deux réglages sont aussi
  déclarés dans `pnpm-workspace.yaml` (`saveExact`, `engineStrict`), où pnpm les applique ; `.npmrc`
  les conserve pour `npm` et les outils qui le lisent.
- La CI ne dépend plus de `corepack` : le passage à Node 25 ou plus ne changera rien côté GitHub
  Actions. En local, quand `corepack` disparaîtra avec Node, pnpm s'installera autrement (installeur
  officiel de pnpm ou `pnpm self-update`) ; `packageManager` reste la source de la version.
- Le `hash` `+sha512` du champ `packageManager` n'est vérifié que par `corepack` (en local) ; `pnpm/setup`
  vérifie la signature `npm` du téléchargement puis compare `pnpm --version` à la version déclarée.
- Dependabot ne suit pas `.node-version` : la mise à niveau de Node, publications de sécurité
  comprises, reste manuelle et se vérifie à chaque étape sur https://nodejs.org/dist/index.json.

## Addendum du 2026-09-21 : l'attestation de provenance est coupée

`docker/build-push-action` active par défaut, sous GitHub Actions, l'attestation de provenance SLSA
de BuildKit. Cette attestation embarque le **`payload` complet de l'événement `push`**, donc le
message de commit entier, et elle est publiée dans le registre d'images, qui est public. Elle y est
lisible sans authentification. Ce qui y entre une fois n'en ressort plus.

Elle est donc coupée : `provenance: false` et `sbom: false` dans l'étape de construction. Ce que
l'on perd est réel — plus de chaîne vérifiable entre l'image publiée et le commit qui l'a produite —
et ce que l'on garde suffit : **le déploiement se fait par digest, jamais par étiquette**, la CI
publie ce digest et le playbook refuse de démarrer sans lui. L'identité de l'image reste donc
vérifiable, par son contenu plutôt que par une signature.

Le jour où une attestation redeviendra souhaitable, elle devra être produite avec un `payload` réduit
(`mode=min`), qui ne recopie pas le message de commit.

## Statut

Accepté, 2026-09-19 ; complété le 2026-09-20 (étape 1 : `pnpm/setup` en CI à la place de `corepack`,
alertes et mises à jour de sécurité Dependabot activées) ; complété le 2026-09-21 (attestation de
provenance coupée, voir l'addendum). Étape 0 de la feuille de route (dépôt, licences, docs, CI).

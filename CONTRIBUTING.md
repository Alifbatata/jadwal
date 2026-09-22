# Contribuer à jadwal

Merci de votre intérêt. Le projet est en développement et n'est pas encore utilisable ; les
contributions les plus utiles à ce stade sont les retours sur `docs/CADRAGE.md` et les ADR.

## Conventions

- **Langues** : documentation, rapports et commentaires de haut niveau en français ; code,
  identifiants, noms de fichiers de code et messages de commit en anglais.
- **Branches** : développement sur `main` (trunk-based). Les contributions externes passent par une
  pull request vers `main`.
- **Commits** : atomiques, au format [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `test:`, `refactor:`), avec une portée quand elle aide
  (`feat(core): ...`).
- **Qualité** : `pnpm lint`, `pnpm check`, `pnpm test` et `pnpm build` doivent passer. La CI les
  exécute sur chaque push et chaque pull request.
- **Dépendances** : aucune dépendance sans besoin immédiat. Chaque dépendance ajoutée est épinglée
  exactement, respecte le délai de publication de 7 jours (`minimumReleaseAge`) et est justifiée en
  une ligne dans le rapport de l'étape.
- **Portabilité** : tout doit fonctionner sous Windows (PowerShell) et sous Linux. Pas de script
  shell dans les `package.json` ; les scripts utilitaires sont écrits en Node.
- **Vie privée** : aucune télémétrie, aucun secret dans le dépôt. Les valeurs de configuration
  passent par des variables d'environnement documentées dans `.env.example`.
- **Décisions** : toute décision structurante fait l'objet d'un ADR dans `docs/adr/`, selon le
  modèle `docs/adr/0000-modele.md`.

## Mise en route

```
corepack enable
pnpm install --frozen-lockfile
pnpm hooks                       # une fois : le contrôle de secrets, avant chaque commit
pnpm lint
pnpm check
pnpm test
pnpm build
```

La base de développement se lance avec `docker compose -f docker-compose.dev.yml up -d db` ; les
tests de `packages/db` en ont besoin (voir `packages/db/README.md`).

`pnpm test` rend compte **par paquet** — fichiers, tests, réussis, sautés, échoués — puis affiche un
total. Un test sauté rend la main en rouge : un test qui a besoin de PostgreSQL ou de Docker doit
échouer quand ils manquent, jamais disparaître du décompte. `pnpm secrets:test` fait voir le contrôle
de secrets refuser un commit, à volonté.

`pnpm hooks` installe aussi un crochet **`pre-push`** : celui qui exploite une instance de jadwal
peut lui donner la liste des mots qui ne doivent jamais sortir de chez lui — l'adresse de son
serveur, les autres services qu'il héberge, ses comptes. La liste ne vit pas dans ce dépôt, et le
crochet refuse de tourner sans elle. **Si vous contribuez depuis votre propre clone**, vous n'avez
rien de tel à protéger : dites-le une fois, et il se taira.

```
git config jadwal.termes-interdits aucune
```

Piège de Vitest : l'option de mise à jour des instantanés accepte une valeur facultative, donc
`vitest run -u src/x.test.ts` avale le nom du fichier et rejoue toute la suite. Écrire le filtre
avant l'option : `vitest run src/x.test.ts -u`.

## Accord de contribution (CLA)

Toute contribution externe demandera la signature d'un accord de contribution (CLA). La raison est
simple : le dépôt est sous AGPL-3.0-or-later (sauf le widget, sous MIT), et l'auteur doit pouvoir
proposer le service sous d'autres conditions à des organisations payantes pour financer le projet,
qui reste gratuit. Le CLA doit lui donner ce droit, sans retirer aux contributeurs la propriété de
leur travail ni le caractère libre du code publié.

Les modalités précises (texte du CLA, outil de signature) seront fixées avant la première
contribution externe.

## Sécurité

Ne signalez pas de vulnérabilité par une issue publique : voir `SECURITY.md`.

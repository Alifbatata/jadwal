# 0051 : l'origine publique, lue par `adapter-node` et vérifiée au démarrage

- Statut : accepté
- Date : 2026-11-21
- Remplace : [0050](0050-origine-lue-au-demarrage.md)
- Complète : [0034](0034-isolation-du-deploiement.md)

## Contexte

L'ADR 0050 a rendu à `ORIGIN` son rôle par un point d'entrée de jadwal, `apps/web/server.js`,
parce qu'`adapter-node` 6.0.0 ne la lisait plus. Ce point d'entrée dépendait de deux détails de
l'adaptateur : `build/index.js` exporte `server`, et les en-têtes `PROTOCOL_HEADER` et
`HOST_HEADER` sont lus au chargement du module.

`adapter-node` 6.0.2 (publié le 10 novembre 2026, avec SvelteKit 3.2.0, qu'il exige) relit
`ORIGIN` au démarrage quand `paths.origin` n'est pas posé (`sveltejs/kit#17632`, lu dans son code
publié). Quand elle est posée, elle donne l'adresse de toute requête, `event.url`, sans regarder
`Host` ni aucun autre en-tête. Il refuse de démarrer si `ORIGIN` est vide, illisible, ou ni en
`http` ni en `https`.

Ce qu'il ne fait pas, mesuré sur le serveur construit : il se lance **sans** `ORIGIN`, et tire alors
l'adresse de `Host` et suppose `https` ; et il réduit **sans rien dire** une `ORIGIN` qui porte un
chemin, une requête, un fragment ou un compte à son origine. Avec un chemin, Better Auth
abandonnerait son chemin de base, mais ne le découvrirait qu'à la première requête qui le sollicite.

Mesuré aussi en retirant `server.js` : le serveur construit chargeait le `.env` de la racine du
dépôt (`database.ts`), si bien qu'une `ORIGIN` absente de l'environnement y revenait depuis le
fichier. `server.js` vérifiait avant ce chargement, ce qui le masquait.

## Décision

- `apps/web/server.js` est retiré. Le `CMD` de l'image, `pnpm start` et les serveurs des tests
  lancent `build/index.js`, le serveur de l'adaptateur. `ORIGIN` reste la variable à poser.
- Le crochet `init` de `hooks.server.ts`, qu'`adapter-node` attend avant d'écouter, fait jouer
  `checkPublicOrigin` (`#lib/server/origin.ts`) : il arrête le démarrage si `ORIGIN` manque, n'est
  pas en `http` ou `https`, ou porte un chemin, une requête, un fragment ou un compte, et si
  `PROTOCOL_HEADER`, `HOST_HEADER` ou `PORT_HEADER` sont posés, qu'`ORIGIN` rend sans effet et qui
  ne pourraient que tromper qui les lit.
- Le serveur ne charge plus le `.env` de la racine quand `NODE_ENV` vaut `production`, comme dans
  l'image et les serveurs des tests : il lit son environnement, et lui seul.

`apps/web/tests/origine.test.ts` l'éprouve sur de vrais serveurs construits, comme pour l'ADR 0050 :
ses 21 tests sont restés les mêmes, à trois messages près, qui sont désormais ceux de l'adaptateur.
Les onze refus du démarrage ont été vus en échec sur `build/index.js` sans le crochet, puis verts
avec lui.

## Options écartées

- **Garder `server.js`.** Il ne servirait plus à rien quand `ORIGIN` est posée, l'adaptateur
  n'écoutant plus les en-têtes qu'il écrit, et garderait sa dépendance aux détails de l'adaptateur.
- **Laisser l'adaptateur seul.** Une `ORIGIN` oubliée donnerait un service qui croit ce que le
  client écrit dans `Host`, et une `ORIGIN` avec un chemin un service qui semble marcher.

## Conséquences

- Plus de code de jadwal entre Node et l'adaptateur : l'arrêt propre, les délais, l'adresse du
  visiteur et l'origine sont ceux d'`adapter-node`. Le risque noté pour l'ADR 0050 tombe.
- Un réglage `paths.origin` dans `vite.config.ts` ferait ignorer `ORIGIN`, avec un avertissement
  de l'adaptateur : jadwal n'en pose pas, et ne doit pas en poser.
- `pnpm start` sur le poste, sans `NODE_ENV`, lit toujours le `.env` ; un serveur lancé avec
  `NODE_ENV=production` doit recevoir toutes ses variables de son environnement.

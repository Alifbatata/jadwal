# 0050 : l'origine publique, lue au démarrage par un point d'entrée de jadwal

- Statut : accepté
- Date : 2026-11-01
- Complète : [0034](0034-isolation-du-deploiement.md)

## Contexte

Jusqu'à l'étape 22, une même image servait partout et recevait son origine publique au démarrage,
par la variable `ORIGIN` : `https://…` en production, `http://127.0.0.1:4173` dans la CI,
`http://localhost:<port>` dans le parcours automatique, qui éprouve **l'image même** qui sera
déployée. `adapter-node` en faisait l'adresse de chaque requête, `event.url`, que SvelteKit compare à
l'en-tête `Origin` d'un formulaire pour refuser ceux qui viennent d'un autre site. jadwal s'en sert
aussi lui-même : liens des courriels, plan du site, code à intégrer, cookies `Secure`, en-tête de
transport strict.

L'étape 23 passe à SvelteKit 3 et à `adapter-node` 6, qui **retire `ORIGIN`** (lu dans son code
publié, version 6.0.0). L'origine y est soit figée à la construction (`paths.origin`, écrite en dur
dans `build/adapter-node.js`), soit tirée de chaque requête : l'hôte de l'en-tête `Host` (ou de
`HOST_HEADER`), le protocole de `PROTOCOL_HEADER`, ou `https` quand aucun en-tête ne le donne.

Mesuré avant ce changement, sur le serveur des tests, en HTTP local : chaque formulaire du service
était refusé comme venu d'un autre site (158 tests en échec) ; un formulaire venu d'un autre site,
avec un `Host` falsifié, était **accepté** ; l'en-tête de transport strict partait sur une connexion
en clair ; le plan du site annonçait l'hôte qu'avait écrit le client.

## Décision

Un point d'entrée de jadwal, `apps/web/server.js`, lance le serveur d'`adapter-node` et lui rend
`ORIGIN` :

1. il lit `ORIGIN` et refuse de démarrer si elle manque, si elle n'est pas en `http` ou `https`, ou
   si elle porte un chemin, une requête, un fragment ou un compte ; il refuse aussi
   `PROTOCOL_HEADER`, `HOST_HEADER` et `PORT_HEADER`, qu'il pose lui-même ;
2. il désigne à `adapter-node` deux en-têtes internes, `x-jadwal-protocol` et `x-jadwal-host`, avant
   de charger son module, qui ne lit ces réglages qu'une fois ;
3. il importe `server` de `build/index.js`, le serveur HTTP de l'adaptateur, et place **avant**
   l'écouteur de l'adaptateur un écouteur qui écrit dans ces deux en-têtes le protocole et l'hôte
   d'`ORIGIN`, en écrasant toute valeur venue du client.

L'arrêt propre, les délais, la taille des corps et l'adresse du visiteur (`ADDRESS_HEADER`,
`XFF_DEPTH`) restent ceux d'`adapter-node`. Le `CMD` de l'image, `pnpm start` et les serveurs des tests
lancent ce point d'entrée, et plus `build/index.js`. Rien ne change au déploiement : `ORIGIN` reste
la variable à poser.

`apps/web/tests/origine.test.ts` l'éprouve sur de vrais serveurs construits : formulaire du service
accepté et formulaire d'un autre site refusé en HTTP local ; `Host`, `X-Forwarded-Host`,
`X-Forwarded-Proto` et les deux en-têtes internes, écrits par le client, sans effet sur l'adresse,
avec et sans mandataire déclaré ; une origine en `https` derrière un mandataire en clair donne
l'en-tête de transport strict et des cookies `Secure` ; chaque `ORIGIN` invalide, et chacun des trois
réglages refusés, arrête le démarrage avec un message qui le dit.

## Options écartées

- **Figer l'origine à la construction.** Il faudrait une image par origine : le parcours et la CI
  n'éprouveraient plus l'image déployée.
- **Faire confiance à `Host` et au protocole par défaut.** Juste derrière Caddy, qui transmet l'hôte
  demandé, mais faux en HTTP local, où la CI et le parcours verraient `https://localhost` ; et
  `event.url`, donc la protection des formulaires, dépendrait d'un en-tête que le client écrit.
- **Faire écrire les en-têtes par Caddy** (`X-Forwarded-Proto`, `X-Forwarded-Host`, nommés par
  `PROTOCOL_HEADER` et `HOST_HEADER`). Le service ne serait juste que derrière ce mandataire-là, et
  une instance servie autrement, ou atteinte sans lui, verrait l'adresse que le client choisit.
- **Un serveur HTTP écrit par jadwal autour de `build/handler.js`.** Possible, mais il faudrait
  refaire l'arrêt propre, les délais et l'activation par socket qu'`adapter-node` fait déjà.

## Conséquences

- `build/index.js` lancé seul démarre, mais sans origine : il ne doit plus servir. Seul
  `server.js` est un point d'entrée.
- Le point d'entrée dépend de deux choses d'`adapter-node` 6 : `build/index.js` exporte `server`, et
  les réglages `PROTOCOL_HEADER` et `HOST_HEADER` sont lus au chargement du module. Une montée de
  version d'`adapter-node` qui changerait l'une ou l'autre ferait échouer `origine.test.ts`.
- Les requêtes arrivent à l'application avec deux en-têtes de plus, que rien ne lit.

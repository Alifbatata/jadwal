# ADR 0034 : Isolation du déploiement

## Contexte

jadwal n'exige pas une machine à lui. Il est conçu pour être posé sur un serveur qui peut héberger
d'autres applications, sans rien supposer de ce qui s'y trouve déjà ni rien en attendre. Le présent
ADR décrit ce qui garantit son isolation : ses fichiers, ses conteneurs, son réseau, ses rôles de
base de données, et le fait que rien de tout cela ne soit joignable de l'extérieur.

Un déploiement qui redémarre un service voisin, réécrit une configuration partagée ou ouvre un port
casse quelque chose qui marchait, et il le casse en silence : la panne se découvre plus tard,
ailleurs, et rarement par celui qui l'a provoquée. L'isolation n'est donc pas un raffinement : c'est
ce qui rend le déploiement rejouable, et son retrait sans dégât.

## Décision

**Tout ce que jadwal ajoute est additif et réversible, et porte son nom.**

### Ce que cela veut dire, concrètement

- **Un projet Compose à nous** (`jadwal`), un **réseau Docker à nous** (`jadwal`), un **volume à
  nous** (`jadwal_pgdata`). Rien de partagé, pas même la base de données : PostgreSQL tourne dans son
  propre conteneur, sur le seul réseau `jadwal`, que le playbook crée et que rien d'autre ne rejoint.
- **Aucun port ouvert.** L'application publie son port sur `127.0.0.1` uniquement, où seul le
  mandataire va le chercher ; la base n'en publie aucun, et n'est donc joignable que depuis le réseau
  `jadwal`. Le `127.0.0.1:` du fichier Compose n'est pas décoratif : sans lui, Docker écrit ses
  propres règles dans nftables et **contourne le pare-feu de l'hôte**, qui n'en voit rien. C'est la
  faute la plus courante et la plus silencieuse de Docker sur un serveur protégé par un pare-feu.
- **Des fichiers qui n'appartiennent qu'à `root`.** `/etc/jadwal`, `/var/lib/jadwal` et
  `/var/backups/jadwal` sont en `0700` ; le fichier d'environnement, qui porte tous les secrets du
  service, est en **`0600 root:root`**. Aucun groupe partagé, aucun bit de lecture pour les autres,
  aucun de ces chemins monté ailleurs : l'arborescence de jadwal est illisible à tout compte non
  privilégié de la machine.
- **Un propriétaire non privilégié à chaque étage.** Dans les conteneurs, `user` n'est jamais `root`
  (l'image de jadwal tourne en `node`) ; dans la base, les requêtes de l'application passent par des
  rôles dédiés, soumis à la sécurité au niveau des lignes, dont aucun n'est superutilisateur
  (ADR 0019).
- **Pas de second mandataire.** Les ports 80 et 443 appartiennent au Caddy de l'hôte ; en lancer un
  deuxième les lui disputerait. On lui ajoute un fichier de site, et c'est tout.
- **Un seul geste sur un service en fonctionnement** : `systemctl reload caddy`. Il ne coupe aucune
  connexion en cours et ne touche à aucune autre configuration de site. Le playbook le **refuse par
  défaut** : il pose le bloc, montre son contenu, et s'arrête. Il faut `-e jadwal_caddy_reload=true`
  pour aller plus loin.
- **Un retrait écrit avant la pose** : `infra/ansible/retrait.yml`, et `/opt/jadwal/RETRAIT.txt`
  déposé sur le serveur pour celui qui n'aurait pas le dépôt sous la main.
- **Tout est préfixé `jadwal`** : `/opt/jadwal`, `/etc/jadwal`, `/var/lib/jadwal`,
  `/var/backups/jadwal`, `jadwal-*.service`, `jadwal-*.timer`. On voit d'un `ls` ce qui est à nous.

### L'image, par digest et jamais par étiquette

La CI construit l'image quand la chaîne complète est verte, la publie sur GHCR, et écrit son
**digest** dans le résumé de l'exécution, avec la commande à copier. Le playbook refuse de démarrer
si `jadwal_image` ne contient pas `@sha256:`.

La raison tient en une phrase : `:main` désigne une image différente demain. Un retour arrière fait
avec une étiquette ne rend pas ce qui tournait avant, il rend ce qui porte le même nom. C'est la même
règle que pour PostgreSQL depuis l'étape 0 (ADR 0010), appliquée à notre propre image.

Revenir en arrière, du coup, c'est rejouer le même playbook avec le digest précédent. Il n'y a pas
deux procédures — une pour avancer, une pour reculer — il y en a une, et son argument change.

### Le durcissement des conteneurs

`read_only: true` sur l'application, `cap_drop: [ALL]`, `no-new-privileges`, `USER node` dans
l'image, et pour PostgreSQL les cinq capacités dont son initialisation a besoin, pas une de plus.
Ce n'est pas du zèle : dès lors qu'un serveur peut porter plus d'une application, une évasion de
conteneur ne coûterait pas que jadwal. Le conteneur est la dernière barrière, et on la traite comme
telle.

## Ce qui a été découvert en le faisant, et qu'il faut retenir

**Un script qui importe du TypeScript ne démarre pas depuis `node_modules`.** Les scripts de
`packages/db` importaient `../src/env.ts`. En développement, cela fonctionne : Node retire les types
à la volée. Dans l'image de production, le paquet est sous `node_modules`, et Node **refuse** d'y
retirer les types — `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. Migrations, création des rôles,
remplissage des heures de prière, purges : tout le déploiement et toutes les tâches périodiques
échouaient, et rien dans la construction de l'image ne le disait.

La correction : les scripts importent `@jadwal/db` — le nom du paquet, résolu vers `dist/` — au lieu
de leur propre source. Contrepartie assumée : il faut avoir construit le paquet avant de les lancer à
la main. La CI construit avant de tester, l'image construit avant de déployer ; c'est déjà le cas
partout, et le commentaire en tête de chaque script le dit.

Cela n'aurait été découvert par aucune relecture. Il a fallu lancer les tâches contre l'image de
production pour de vrai.

## Conséquences

- Le playbook ne provisionne pas le serveur : il vérifie que Docker répond, installe trois paquets
  (`age`, `rclone`, `curl`), crée ses répertoires, et pose ses fichiers. Il ne touche ni au pare-feu,
  ni à l'accès distant, ni aux comptes existants, ni à Docker lui-même. Rien de ce qu'il fait ne
  déborde des chemins et des objets préfixés `jadwal`, et `retrait.yml` les reprend un par un.
- Le rôle `caddy` **refuse d'agir** si le Caddyfile de l'hôte n'importe pas un répertoire de sites.
  Ajouter cet `import` est une modification de la configuration d'un service en fonctionnement :
  c'est une décision d'exploitation, prise sciemment, pas une liberté qu'un playbook s'accorde.
- Ansible ne tourne pas sous Windows. `infra/README.md` donne la commande qui le lance dans un
  conteneur, avec le coffre et la clé SSH montés et rien d'autre.
- Les secrets ne sont jamais en clair dans le dépôt : `group_vars/all/vault.yml` est chiffré par
  `ansible-vault`, `.gitignore` l'exclut, et le dépôt n'en contient que le modèle.

## Statut

Accepté, 2026-09-21. Étape 9 de la feuille de route. Complète l'ADR 0010 (versions épinglées par
digest) et l'ADR 0019 (propriétaire non privilégié). Voir l'ADR 0035 pour les sauvegardes et
l'ADR 0036 pour les tâches périodiques et la veille.

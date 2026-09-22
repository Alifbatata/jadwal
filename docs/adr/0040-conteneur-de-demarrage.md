# 0040 — Un conteneur de démarrage, pour que l'application ne porte plus les mots de passe privilégiés

- Statut : accepté
- Date : 2026-09-22
- Complète : [0013](0013-isolation-par-rls-et-contexte-par-transaction.md),
  [0019](0019-proprietaire-non-privilegie.md), [0034](0034-isolation-du-deploiement.md)

## Contexte

Deux mots de passe de ce service contournent la sécurité au niveau des lignes :

- **`POSTGRES_PASSWORD`**, celui du rôle que l'image PostgreSQL crée. Il est superutilisateur : la
  sécurité par ligne ne s'applique pas à lui, et il peut écrire `is_super_admin = true`, ce qu'aucun
  rôle applicatif ne peut faire (migration 0032).
- **`JADWAL_DB_OWNER_PASSWORD`**, celui du propriétaire du schéma. Il n'est ni superutilisateur ni
  porteur de `BYPASSRLS` — c'est toute la décision de l'ADR 0019 — mais il **possède** les tables :
  il peut modifier une politique, la désactiver, ou se donner un droit.

Jusqu'ici, les deux vivaient **en permanence** dans l'environnement du conteneur de l'application,
c'est-à-dire du seul processus de ce service qui soit exposé à Internet. Ils y étaient pour deux
gestes qui durent quelques secondes : créer les rôles au premier démarrage, et passer les migrations
à chaque déploiement.

Le reste du temps, ils n'y servaient à rien. L'application n'ouvre de connexion que sous `app`,
`superadmin`, `auth` et `public`, tous non privilégiés — c'est vérifié, et par deux chemins
différents, dans `apps/web/tests/roles-de-base.test.ts`.

Le déséquilibre est celui-ci : l'ADR 0013 et l'ADR 0019 construisent une isolation qui tient **même
si le code de l'application est fautif** — une injection, une erreur de contexte, une politique mal
écrite ne donnent pas accès aux autres organisations. Mais qui prenait la main sur le processus lui-
même n'avait pas à chercher si loin : il lisait `/proc/self/environ` et repartait avec de quoi
ouvrir toutes les organisations d'un coup.

## Décision

**Un service Compose `init`, de la même image, reçoit ces deux mots de passe. Il crée les rôles,
passe les migrations, et s'arrête. L'application ne démarre qu'après sa réussite, et son fichier
d'environnement ne les contient plus.**

Trois fichiers d'environnement, un par service, et chacun ne porte que ce qui le concerne :

| Fichier                | Qui le lit                                   | Ce qu'il porte de privilégié                                                         |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `/etc/jadwal/init.env` | le conteneur de démarrage, quelques secondes | **les deux**, plus les cinq mots de passe applicatifs que `bootstrap-roles.mjs` pose |
| `/etc/jadwal/app.env`  | l'application, en permanence                 | aucun                                                                                |
| `/etc/jadwal/db.env`   | PostgreSQL                                   | le sien, qu'il crée                                                                  |

L'ordre est tenu par Compose, et non par le playbook :

```yaml
app:
  depends_on:
    db: { condition: service_healthy }
    init: { condition: service_completed_successfully }
```

C'est une propriété du fichier Compose, donc elle tient aussi quand quelqu'un tape `docker compose
up` à la main sur le serveur. Si `init` échoue, `up` échoue, et l'application qui tournait déjà
continue de tourner : un déploiement raté ne coupe rien.

**Les commandes d'exploitant qui ont besoin de ces rôles passent par ce même service**, en conteneur
jetable :

```sh
docker compose run --rm --no-deps -T init node node_modules/@jadwal/db/scripts/super-admin.mjs --email …
```

Et les tâches périodiques qui écrivent sous le propriétaire aussi — `jadwal-prieres`,
`jadwal-purges`, et la lecture des verrous de conservation par la veille.

## Ce que cela coûte

**`init.env` porte plus de secrets qu'aucun autre fichier de ce serveur**, et il faut le dire. Ce
qui a changé n'est pas leur nombre, c'est la durée et l'exposition : le conteneur qui les lit vit
quelques secondes, ne publie aucun port, ne répond à personne, et s'arrête. Le fichier reste en
`0600 root:root`, comme les deux autres.

**Trois tâches créent maintenant un conteneur là où elles lançaient un processus.** `docker compose
run` coûte quelques centaines de millisecondes de plus que `docker compose exec`. Deux de ces tâches
passent une fois par jour, la troisième une fois par heure : c'est un prix qu'on paie sans le voir.

**Une commande d'exploitant a une forme de plus à retenir.** `docs/EXPLOITATION.md` les distingue par
ce qu'elles font, pas par leur mécanique : ce qui touche aux rôles ou au schéma passe par `init`, le
reste par `app`.

## Ce qui n'est pas décidé ici

**Les mots de passe applicatifs restent dans `app.env`.** Ils y sont nécessaires, en permanence, et
les retirer n'aurait aucun sens : un service qui ne peut pas se connecter à sa base ne sert à rien.
Ce sont des rôles non privilégiés, soumis aux politiques, et c'est précisément pour cela que
l'isolation de l'ADR 0013 ne repose pas sur leur secret.

**Rien ne change dans la base.** Aucune migration, aucun rôle, aucune politique. Ce qui change est
l'endroit où vivent deux chaînes de caractères.

## Alternatives écartées

**Garder `exec` sur l'application, avec les mots de passe passés à la commande.** Ils seraient alors
visibles dans `ps`, dans le journal de l'unité, et dans l'historique du shell. C'est le contraire de
ce qu'on cherche.

**Un montage de secret lu puis effacé au démarrage.** Le processus les aurait quand même eus en
mémoire, et l'exercice aurait consisté à se rassurer.

**Un rôle intermédiaire qui pourrait jouer les migrations sans posséder les tables.** PostgreSQL n'a
pas cela : modifier une table demande d'en être propriétaire, ou d'être superutilisateur. C'est
d'ailleurs pour cette raison que l'ADR 0019 a fait du propriétaire un rôle non privilégié plutôt que
d'en faire l'affaire du superutilisateur.

**Un second conteneur, d'une autre image, réduite aux migrations.** Un second digest à suivre, un
second point de mise à jour, et une image qui pourrait dériver de celle qui tourne. La même image
n'apporte que ce qu'elle a déjà.

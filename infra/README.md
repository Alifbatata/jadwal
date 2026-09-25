# `infra/` — l'infrastructure de jadwal, en fichiers

Tout ce qui décrit le **déploiement** est ici, et rien de ce qui est ici n'est un secret. Ce qui
décrit **une machine en particulier** n'y est pas et n'y entre jamais : cela vit dans `PRIVE/`, à la
racine du dépôt — un dossier ignoré par git, et que le crochet `pre-push` refuse d'emporter même
ajouté de force (voir [`CLAUDE.md`](../CLAUDE.md)). Le dépôt ne livre que des modèles, sans aucune
valeur vraie.

| Ce qui est à vous                                            | Où le poser                              |
| ------------------------------------------------------------ | ---------------------------------------- |
| L'inventaire : l'hôte visé, le compte qui s'y connecte       | `PRIVE/inventaire/inventory.ini`         |
| Le coffre `ansible-vault` : mots de passe, SMTP, sauvegardes | `PRIVE/coffre/vault.yml`                 |
| Ce qui est propre à l'installation sans être secret          | `PRIVE/coffre/exploitant.yml`            |
| La phrase de passe du coffre, et la clé privée `age`         | `~/.jadwal-secrets/`, hors de tout dépôt |

Les modèles à copier : `ansible/inventory.ini.example`, `ansible/group_vars/all/vault.yml.example`.
`PRIVE/` est la seule copie qui fait foi ; ce que le déploiement pose dans `infra/ansible/` est une
copie de travail, ignorée par git, et qui s'efface après.

Les décisions sont dans [ADR 0034](../docs/adr/0034-isolation-du-deploiement.md), « Isolation du
déploiement », pour la disposition, [ADR 0035](../docs/adr/0035-sauvegardes-chiffrees.md) pour les
sauvegardes et [ADR 0036](../docs/adr/0036-taches-periodiques-et-veille.md) pour les tâches et la
veille. La marche à suivre quand quelque chose ne va pas est dans
[`docs/EXPLOITATION.md`](../docs/EXPLOITATION.md).

## Ce qu'il y a dedans

| Chemin     | Ce que c'est                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ansible/` | Le déploiement : un inventaire d'exemple à copier, un playbook, six rôles dont la garde, un playbook de retrait.                                      |
| `compose/` | Les trois services de production — le conteneur de démarrage, l'application et sa base — et l'exemple du fichier d'environnement.                     |
| `caddy/`   | Le bloc de site à poser dans le Caddy **de l'hôte**, qui peut servir d'autres sites.                                                                  |
| `systemd/` | Sept unités de minuterie — celle de la sonde est un modèle, armé une fois par pile — leurs services, et l’unité d’alerte déclenchée par `OnFailure=`. |
| `scripts/` | Ce que les minuteries lancent : prières, purges, sauvegarde, restauration, veille, sonde, coupe du journal, alerte.                                   |
| `charge/`  | La mesure de charge : de quoi semer vingt organisations et les interroger. Ne tourne jamais en production.                                            |

## Le principe, en une phrase

**Tout est additif et réversible.** Le déploiement vise un serveur qui peut héberger d'autres
applications : il n'y touche donc à rien qui ne soit à jadwal — ni au pare-feu, ni à la
configuration SSH, ni aux comptes, ni à la configuration générale de la machine. Le playbook ajoute
des répertoires préfixés `jadwal`, un projet Compose à lui, un réseau Docker à lui, huit minuteries armées
et un fichier de site. Il ne redémarre aucun service existant. La seule action qui touche quelque
chose de déjà en fonctionnement est un `reload` de Caddy, et elle est **refusée par défaut** : il
faut la demander explicitement, après avoir lu le bloc de site qu'on ajoute.

`ansible-playbook retrait.yml` défait tout, dans l'ordre. `/opt/jadwal/RETRAIT.txt`, posé sur le
serveur, dit la même chose pour celui qui n'aurait pas le dépôt sous la main.

## Ansible ne tourne pas sous Windows

Ce n'est pas une limite du projet, c'est la position du projet Ansible : le nœud de contrôle doit
être un système POSIX. Depuis Windows, on le lance dans un conteneur, et c'est ce que fait la
commande ci-dessous, **lancée depuis la racine du dépôt**. Elle monte `infra/` et `PRIVE/` en
lecture seule, la phrase de passe du coffre, et la clé SSH de l'exploitant — rien d'autre.

```sh
docker run --rm -it \
  -v "$PWD/infra:/infra:ro" \
  -v "$PWD/PRIVE:/prive:ro" \
  -v "$HOME/.ssh:/ssh-source:ro" \
  -v "$HOME/.jadwal-secrets:/secrets:ro" \
  python:3.13-slim sh -c '
    apt-get -qq update && apt-get -qq install -y openssh-client
    pip install --quiet ansible-core
    # Trois pièges d un montage Windows, payés une fois chacun :
    #
    #   1. il est inscriptible par tous, et Ansible IGNORE alors ansible.cfg — sans un mot, sinon un
    #      avertissement. Plus d inventaire, plus d hôte, et un playbook qui ne fait rien ;
    #   2. il donne le bit d exécution à tout, et Ansible prend le fichier de phrase de passe pour un
    #      script : « Exec format error » ;
    #   3. ssh refuse une clé privée que tout le monde peut lire.
    #
    # On recopie donc tout dans le conteneur, avec des droits sains. Le conteneur disparaît
    # avec --rm, et rien n est réécrit côté hôte.
    cp -r /infra /travail && chmod -R go-w /travail
    mkdir -p /root/.ssh /root/.ansible/cp
    cp /ssh-source/* /root/.ssh/ 2>/dev/null || true
    chmod 700 /root/.ssh && chmod 600 /root/.ssh/*
    cp /secrets/vault-pass.txt /tmp/p && chmod 600 /tmp/p
    export ANSIBLE_VAULT_PASSWORD_FILE=/tmp/p
    # Ce qui décrit la machine visée vient de PRIVE/, monté en lecture seule. Ces trois copies ne
    # vivent que le temps du conteneur : elles partent avec --rm, et rien ne revient sur le poste.
    cp /prive/inventaire/inventory.ini /travail/ansible/inventory.ini
    cp /prive/coffre/vault.yml        /travail/ansible/group_vars/all/vault.yml
    cp /prive/coffre/exploitant.yml   /travail/ansible/exploitant.yml
    cd /travail/ansible && exec bash'
```

Le playbook, lui, se lance depuis `/travail/ansible`. **Les modifications faites dans le conteneur
ne reviennent pas sur le poste** : c'est une copie, et c'est voulu — on ne déploie pas depuis un
arbre qu'on vient de modifier sans le relire.

Sous Linux et macOS, `pipx install ansible-core` suffit, et les commandes se lancent depuis
`infra/ansible/` — après avoir posé à la main les trois copies que le conteneur pose tout seul :

```sh
cd infra/ansible
cp ../../PRIVE/inventaire/inventory.ini inventory.ini
cp ../../PRIVE/coffre/vault.yml         group_vars/all/vault.yml
cp ../../PRIVE/coffre/exploitant.yml    exploitant.yml
```

Ces trois chemins sont ignorés par git, et le crochet `pre-commit` refuserait le coffre de toute
façon. Les effacer après le déploiement : l'original est dans `PRIVE/`, ceci n'en est qu'une copie.

## Les commandes

Depuis `infra/ansible/`, une fois les trois copies posées. `-e @exploitant.yml` porte ce qui est
propre à l'installation — la clé publique `age`, la destination des sauvegardes — en variables
supplémentaires, dont la précédence l'emporte sur les valeurs vides livrées par le dépôt.

```sh
# Voir ce qui changerait, sans rien changer.
ansible-playbook jadwal.yml --check --diff \
  -e @exploitant.yml -e jadwal_image=ghcr.io/<compte>/jadwal@sha256:<digest>

# Déployer. Le bloc de site est posé, Caddy n'est PAS rechargé.
ansible-playbook jadwal.yml -e @exploitant.yml -e jadwal_image=ghcr.io/<compte>/jadwal@sha256:<digest>

# Une fois le bloc de site relu : recharger Caddy, et alors seulement le service est servi.
ansible-playbook jadwal.yml -e @exploitant.yml -e jadwal_image=… -e jadwal_caddy_reload=true

# Revenir à la version précédente : le même playbook, le digest d'avant.
ansible-playbook jadwal.yml -e @exploitant.yml -e jadwal_image=ghcr.io/<compte>/jadwal@sha256:<ancien digest>

# Tout retirer.
ansible-playbook retrait.yml -e @exploitant.yml
```

Le digest à déployer est écrit dans le résumé de l'exécution de la CI, avec la commande à copier
telle quelle. **Jamais d'étiquette** : `:main` bouge, un digest non. Le playbook refuse de démarrer
si `jadwal_image` n'en porte pas un, et il refuse aussi une image dont le commit n'a pas passé le
parcours complet : c'est la garde, décrite ci-dessous.

## La garde du déploiement

**Le playbook ne déploie pas une image dont le commit n'a pas d'exécution verte du flux
`parcours`.** Ce flux, `.github/workflows/parcours.yml`, lance `pnpm parcours:test` à chaque
poussée sur `main` : tout le parcours d'une organisation, dans un vrai navigateur, contre l'image de
production. La CI publie l'image sans attendre ce flux, et rien, côté GitHub, n'empêche de déployer
une image dont le parcours a échoué. La garde fait ce lien, au seul endroit par où passe tout
déploiement.

Elle tourne en premier, sur le poste qui déploie, **avant toute connexion au serveur** :

1. elle exige une image désignée par son digest, publiée sur le registre que la garde lit
   (`ghcr.io`), sous le chemin du dépôt (`jadwal_garde_depot`, sans tenir compte de la casse).
   N'importe quel compte du registre peut publier une image qui porte le commit d'un autre ; seul
   le chemin dit qui l'a publiée ;
2. elle lit, par l'API du registre et au digest donné, les étiquettes que la CI pose sur l'image :
   `org.opencontainers.image.revision`, le commit, et `org.opencontainers.image.source`, qui doit
   désigner ce dépôt. L'empreinte du manifeste et celle de la configuration sont recalculées, et une
   image qui ne correspond pas à son digest est refusée. Elle n'accepte qu'un manifeste d'image
   simple, celui que la CI publie : un index de plusieurs plateformes est refusé, en disant que
   faire ;
3. elle demande à l'API de GitHub les exécutions du flux `parcours.yml` pour ce commit, et exige au
   moins une exécution réussie (`success`) **de ce commit-là et de ce flux-là**. Sinon, elle
   s'arrête, et dit quelle révision, quel flux, ce qu'elle a trouvé et ce qu'il faut faire.

Tout se lit sans compte, parce que l'image et le dépôt sont publics : le poste qui déploie doit
seulement joindre `ghcr.io` et `api.github.com` en HTTPS. Sans compte, l'API de GitHub accepte 60
requêtes par heure depuis une même adresse ; la garde en fait une par déploiement.

**Quand elle tourne.** Chaque fois que le rôle `application` tourne : seul ce rôle lit
`jadwal_image` et l'écrit sur le serveur. Un passage qui ne le joue pas, comme `--tags taches` ou
`--tags caddy`, ne déploie aucune image, et la garde n'y tourne pas. `--check` ne la saute pas : une
simulation répond comme le déploiement répondrait.

**Une sélection de tâches ne la contourne pas.** Les tâches de la garde se jouent d'un seul bloc :
`--start-at-task` ne peut pas démarrer au milieu, et Ansible répond qu'il ne trouve rien à ce nom. La
garde range son verdict dans les faits du poste qui déploie, pour ce passage seulement. Le rôle
`application` commence par vérifier que ce verdict porte sur cette image-là, et ses deux gabarits
qui écrivent l'image (`compose.env` et `jadwal.env`) ne la lisent qu'à travers lui.
`--skip-tags garde`, `--start-at-task` sur une tâche du rôle `application`, ou `--limit` sans
`localhost` arrêtent donc le déploiement avant qu'une image ne soit écrite, en disant pourquoi.
`pnpm garde:test` joue chacun de ces cas.

**Ses variables ne se posent pas à la main.** Les variables au préfixe `garde_` sont celles de la
garde. Si l'une existe avant elle, par `-e` ou par l'inventaire, la garde refuse de tourner, et le
rôle `application` refuse d'écrire l'image. Un verdict écrit dans l'inventaire ne se lit pas comme
un fait, et un cache de faits qui survivrait au passage (`ANSIBLE_CACHE_PLUGIN=jsonfile`, par
exemple) est refusé.

**Ce qu'elle ne vise pas.** C'est une garde contre l'oubli et la hâte, pas contre qui la contourne
exprès. Qui modifie le playbook ou ses rôles, pointe `jadwal_garde_registre` ou
`jadwal_garde_api_github` vers un faux service, ou tient le registre, le compte ou le dépôt, peut
déployer une image rouge. Voir « Ce qui n'est pas fait » dans l'ADR 0045.

**Le serveur ne s'appelle pas `localhost` dans l'inventaire.** La garde tourne sur le poste qui
déploie, sous le nom `localhost`, et y range son verdict. Un serveur nommé `localhost` dans le groupe
`jadwal`, pour déployer sur la machine même qui lance Ansible, verrait ces variables comme posées
hors de la garde, et une image verte serait refusée. Nommez le serveur par son nom de domaine, comme
dans l'exemple d'inventaire.

**Limiter le déploiement à un serveur** : la garde tourne sur `localhost`, qui doit rester dans la
limite, sans quoi le rôle `application` s'arrête en disant que la garde n'a pas tourné :

```sh
ansible-playbook jadwal.yml --limit '<serveur>,localhost' -e @exploitant.yml \
  -e jadwal_image=ghcr.io/<compte>/jadwal@sha256:<digest>
```

**Quand elle refuse** :

- le flux tourne encore : attendre sa fin, puis relancer la même commande ;
- il a échoué, ou il a été annulé : le relancer depuis l'onglet Actions du dépôt (`Re-run jobs`
  rejoue le même commit), ou déployer l'image du dernier commit. Une poussée plus récente n'annule
  ni le parcours en cours (`cancel-in-progress: false`) ni ceux qui attendent (`queue: max`, jusqu'à
  cent) : un commit reste sans verdict seulement si son exécution a été annulée à la main, ou passé
  cent en attente ;
- « aucune exécution de ce flux pour ce commit » : l'image vient d'un commit poussé avant que le
  flux existe. C'est le cas de toute image construite avant la garde, y compris celle qui tourne
  peut-être encore : la redéployer demande une dérogation. Un passage `--tags taches` n'est pas
  concerné : la garde n'y tourne pas ;
- « le flux est inconnu de GitHub pour ce dépôt (404) » : GitHub cherche un flux par son nom dans
  le dépôt, quel que soit le commit. Le fichier n'y a pas encore été poussé, il a changé de nom, ou
  `jadwal_garde_depot` et `jadwal_garde_flux` désignent un autre dépôt ou un autre flux.

**Lever la garde**, en secours seulement, par exemple pour revenir en urgence à une image construite
avant elle. La dérogation nomme l'image qu'elle couvre, la même que `jadwal_image`, et dit pourquoi :

```sh
ansible-playbook jadwal.yml -e @exploitant.yml -e jadwal_image=ghcr.io/<compte>/jadwal@sha256:<digest> \
  -e '{"jadwal_garde_derogation": {"image": "ghcr.io/<compte>/jadwal@sha256:<digest>", "motif": "retour à l’image d’avant la garde, le dernier parcours est rouge"}}'
```

Elle s'écrit en JSON, la seule forme qui fasse passer une valeur composée : `-e clé=valeur` ne sait
écrire qu'une chaîne, coupée au premier espace sans rien dire. La garde refuse toute autre forme, une
dérogation qui nomme une autre image, et un motif d'un seul mot. Une dérogation oubliée dans un
fichier passé par `-e @fichier` ne vaut donc pas pour l'image suivante. Avec une dérogation, **rien
d'autre n'est vérifié** : la garde l'écrit en rouge avec l'image et le motif, et le récapitulatif
final en garde la trace (`ignored=1`).

Une instance qui construit sa propre image depuis son propre dépôt met le sien dans
`jadwal_garde_depot` (`ansible/group_vars/all/main.yml`) et garde le flux `parcours.yml`.

`pnpm garde:test` l'éprouve cas par cas : le playbook livré, joué par Ansible dans un conteneur
jetable, contre une fausse API servie par le poste, y compris le rôle `application` en simulation,
sous des sélections de tâches de chaque sorte et avec des variables forgées. Aucune connexion ne
part vers un serveur.
`node scripts/eprouver-garde-deploiement.mjs --reel ghcr.io/<compte>/jadwal@sha256:<digest>` joue la
même garde contre les vraies API, en lecture seule, sans rien déployer.

## Le coffre

Il se crée une fois, **directement dans `PRIVE/`**, et c'est là qu'il se modifie ensuite : le
déploiement n'en lit qu'une copie jetable.

```sh
cp infra/ansible/group_vars/all/vault.yml.example PRIVE/coffre/vault.yml
# y écrire les vraies valeurs, puis :
ansible-vault encrypt PRIVE/coffre/vault.yml
ansible-vault view PRIVE/coffre/vault.yml    # relire
ansible-vault edit PRIVE/coffre/vault.yml    # modifier
```

La phrase de passe est à l'exploitant. Elle n'est ni dans le dépôt, ni sur le serveur : elle vit
dans `~/.jadwal-secrets/vault-pass.txt`, où `ansible.cfg` va la chercher. Un coffre et sa clé au
même endroit, ce n'est plus un coffre.

## Les tâches périodiques

| Unité                        | Quand                | Ce qu'elle fait                                                               |
| ---------------------------- | -------------------- | ----------------------------------------------------------------------------- |
| `jadwal-sauvegarde.timer`    | 02:15 UTC            | Vidange, chiffrement `age`, envoi sous `quotidien/`, `hebdo/` et `mensuel/`.  |
| `jadwal-prieres.timer`       | 03:10 UTC            | Recalcule la fenêtre glissante des heures de prière calculées.                |
| `jadwal-purges.timer`        | 03:40 UTC            | Les six purges de rétention.                                                  |
| `jadwal-restauration.timer`  | dimanche 04:30 UTC   | Restaure dans une base jetable et compare à la base vivante.                  |
| `jadwal-veille.timer`        | toutes les heures    | Tâches muettes, disque, certificat, archives, verrous, conteneurs, IPv4/IPv6. |
| `jadwal-sonde@4.timer`       | toutes les 5 minutes | Interroge `/healthz` par le nom public, en IPv4.                              |
| `jadwal-sonde@6.timer`       | toutes les 5 minutes | La même chose en IPv6 ; `jadwal_sonde_ipv6: false` la désarme.                |
| `jadwal-journal-caddy.timer` | 00:20 UTC            | Coupe le journal d'accès du site et n'en garde que quatorze jours (ADR 0039). |

Tout est en **UTC**, y compris les minuteries : une heure locale glisse de deux heures au changement
d'heure, et « le dimanche » décide du préfixe de conservation d'une archive (ADR 0037).

Chaque unité porte `OnFailure=jadwal-alerte@%n.service` : un échec envoie un courriel qui contient
les trente dernières lignes du journal de l'unité. Une tâche qui **cesse de se lancer** ne produit
aucun échec : c'est la veille qui la remarque, en comparant l'âge de sa dernière réussite au double
de sa période.

**Les deux sondes font exception : elles n'ont pas d'`OnFailure=` et ne sortent jamais en erreur.**
Un échec part en `/fail` vers la supervision, qui est dehors. Sans cela, une panne enverrait un
courriel toutes les cinq minutes en plus de l'alerte, et l'on apprendrait très vite à filtrer les
deux. Ce que la sonde ne voit pas, et pourquoi le silence compte davantage qu'elle :
[ADR 0038](../docs/adr/0038-sonde-exterieure-hors-de-github-actions.md).

```sh
systemctl list-timers 'jadwal-*'          # les prochaines échéances
systemctl start jadwal-purges.service     # lancer une tâche tout de suite
journalctl -u jadwal-sauvegarde.service   # ce qu'elle a dit la dernière fois
ls -l /var/lib/jadwal/reussites/          # quand chaque tâche a abouti pour la dernière fois
```

## Ce que la clé privée des sauvegardes n'est pas

Elle n'est pas sur le serveur, et le rôle `sauvegarde` vérifie qu'aucun fichier qui y ressemble n'y
traîne. Seule la clé **publique** y est, dans `JADWAL_AGE_RECIPIENT`. Conséquence assumée : le test
de restauration hebdomadaire ne peut pas déchiffrer une archive. Il éprouve donc ce qui pourrit avec
le temps — un schéma que `pg_restore` ne sait plus remonter — en restaurant une vidange fraîche dans
une base jetable, et l'intégrité des archives est vérifiée à chaque envoi par relecture depuis la
destination. La chaîne entière, clé privée comprise, est éprouvée par l'exploitant :

```sh
/opt/jadwal/scripts/jadwal-restauration.sh \
  --archive /var/backups/jadwal/jadwal-2026-09-21T021503Z.dump.age \
  --cle /chemin/vers/la/cle/privee
```

La veille alerte si cela n'a plus abouti depuis quatre-vingt-dix-sept jours — un trimestre, plus la marge de sept jours du contrôle extérieur (ADR 0037).

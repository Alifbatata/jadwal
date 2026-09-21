# `infra/` — l'infrastructure de jadwal, en fichiers

Tout ce qui décrit le **déploiement** est ici, et rien de ce qui est ici n'est un secret. Ce qui
décrit une machine en particulier n'y est pas : l'inventaire se crée à partir de
`ansible/inventory.ini.example` et reste hors du dépôt. Les mots de passe, les identifiants SMTP et
ceux de la destination de sauvegarde vivent dans un coffre chiffré par `ansible-vault` que le dépôt
ignore (`group_vars/all/vault.yml`). Le dépôt ne contient que son modèle, sans aucune valeur vraie.

Les décisions sont dans [ADR 0034](../docs/adr/0034-isolation-du-deploiement.md), « Isolation du
déploiement », pour la disposition, [ADR 0035](../docs/adr/0035-sauvegardes-chiffrees.md) pour les
sauvegardes et [ADR 0036](../docs/adr/0036-taches-periodiques-et-veille.md) pour les tâches et la
veille. La marche à suivre quand quelque chose ne va pas est dans
[`docs/EXPLOITATION.md`](../docs/EXPLOITATION.md).

## Ce qu'il y a dedans

| Chemin     | Ce que c'est                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| `ansible/` | Le déploiement : un inventaire d'exemple à copier, un playbook, cinq rôles, un playbook de retrait.        |
| `compose/` | Les deux conteneurs de production — l'application et sa base — et l'exemple du fichier d'environnement.    |
| `caddy/`   | Le bloc de site à poser dans le Caddy **de l'hôte**, qui peut servir d'autres sites.                       |
| `systemd/` | Les cinq minuteries, leurs unités, et l'unité d'alerte déclenchée par `OnFailure=`.                        |
| `scripts/` | Ce que les minuteries lancent : prières, purges, sauvegarde, restauration, veille, alerte.                 |
| `charge/`  | La mesure de charge : de quoi semer vingt organisations et les interroger. Ne tourne jamais en production. |

## Le principe, en une phrase

**Tout est additif et réversible.** Le déploiement vise un serveur qui peut héberger d'autres
applications : il n'y touche donc à rien qui ne soit à jadwal — ni au pare-feu, ni à la
configuration SSH, ni aux comptes, ni à la configuration générale de la machine. Le playbook ajoute
des répertoires préfixés `jadwal`, un projet Compose à lui, un réseau Docker à lui, cinq minuteries
et un fichier de site. Il ne redémarre aucun service existant. La seule action qui touche quelque
chose de déjà en fonctionnement est un `reload` de Caddy, et elle est **refusée par défaut** : il
faut la demander explicitement, après avoir lu le bloc de site qu'on ajoute.

`ansible-playbook retrait.yml` défait tout, dans l'ordre. `/opt/jadwal/RETRAIT.txt`, posé sur le
serveur, dit la même chose pour celui qui n'aurait pas le dépôt sous la main.

## Ansible ne tourne pas sous Windows

Ce n'est pas une limite du projet, c'est la position du projet Ansible : le nœud de contrôle doit
être un système POSIX. Depuis Windows, on le lance dans un conteneur, et c'est ce que fait la
commande ci-dessous. Elle monte `infra/` en lecture seule, le coffre et la clé du coffre séparément,
et la clé SSH de l'exploitant — rien d'autre.

```sh
docker run --rm -it \
  -v "$PWD/infra:/infra" \
  -v "$HOME/.ssh:/root/.ssh:ro" \
  -v "$HOME/.jadwal-secrets:/root/.jadwal-secrets:ro" \
  -w /infra/ansible \
  python:3.13-slim sh -c '
    pip install --quiet ansible-core
    # Un montage Windows expose ses fichiers avec le bit d exécution, et Ansible prend alors le
    # fichier de phrase de passe pour un script à exécuter : « Exec format error ». On le recopie
    # sans ce bit, dans un conteneur qui disparaît avec --rm.
    cp /root/.jadwal-secrets/vault-pass.txt /tmp/p && chmod 600 /tmp/p
    export ANSIBLE_VAULT_PASSWORD_FILE=/tmp/p
    exec bash'
```

Sous Linux et macOS, `pipx install ansible-core` suffit, et les commandes se lancent depuis
`infra/ansible/`.

## Les commandes

L'inventaire n'est pas livré, seulement son modèle : copier `inventory.ini.example` en
`inventory.ini`, y écrire l'hôte visé et le compte d'administration qui s'y connecte, puis lancer
les commandes depuis `infra/ansible/`. `inventory.ini` reste hors du dépôt, comme le coffre.

```sh
# Voir ce qui changerait, sans rien changer.
ansible-playbook jadwal.yml --check --diff -e jadwal_image=ghcr.io/<compte>/jadwal@sha256:<digest>

# Déployer. Le bloc de site est posé, Caddy n'est PAS rechargé.
ansible-playbook jadwal.yml -e jadwal_image=ghcr.io/<compte>/jadwal@sha256:<digest>

# Une fois le bloc de site relu : recharger Caddy, et alors seulement le service est servi.
ansible-playbook jadwal.yml -e jadwal_image=… -e jadwal_caddy_reload=true

# Revenir à la version précédente : le même playbook, le digest d'avant.
ansible-playbook jadwal.yml -e jadwal_image=ghcr.io/<compte>/jadwal@sha256:<ancien digest>

# Tout retirer.
ansible-playbook retrait.yml
```

Le digest à déployer est écrit dans le résumé de l'exécution de la CI, avec la commande à copier
telle quelle. **Jamais d'étiquette** : `:main` bouge, un digest non. Le playbook refuse de démarrer
si `jadwal_image` n'en porte pas un.

## Le coffre

```sh
cp group_vars/all/vault.yml.example group_vars/all/vault.yml
# y écrire les vraies valeurs, puis :
ansible-vault encrypt group_vars/all/vault.yml
ansible-vault view group_vars/all/vault.yml    # relire
ansible-vault edit group_vars/all/vault.yml    # modifier
```

La phrase de passe est à l'exploitant. Elle n'est ni dans le dépôt, ni sur le serveur.

## Les tâches périodiques

| Unité                       | Quand             | Ce qu'elle fait                                                               |
| --------------------------- | ----------------- | ----------------------------------------------------------------------------- |
| `jadwal-sauvegarde.timer`   | 02:15 UTC         | Vidange, chiffrement `age`, envoi sous `quotidien/`, `hebdo/` et `mensuel/`.  |
| `jadwal-prieres.timer`      | 03:10             | Recalcule la fenêtre glissante des heures de prière calculées.                |
| `jadwal-purges.timer`       | 03:40             | Les six purges de rétention.                                                  |
| `jadwal-restauration.timer` | dimanche 04:30    | Restaure dans une base jetable et compare à la base vivante.                  |
| `jadwal-veille.timer`       | toutes les heures | Tâches muettes, disque, certificat, archives, verrous, conteneurs, IPv4/IPv6. |

Chaque unité porte `OnFailure=jadwal-alerte@%n.service` : un échec envoie un courriel qui contient
les trente dernières lignes du journal de l'unité. Une tâche qui **cesse de se lancer** ne produit
aucun échec : c'est la veille qui la remarque, en comparant l'âge de sa dernière réussite au double
de sa période.

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

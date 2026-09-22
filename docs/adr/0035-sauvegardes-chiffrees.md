# ADR 0035 : Sauvegardes chiffrées, envoyées hors du serveur, et dont la clé n'est pas là

## Contexte

Une organisation qui publie ses cours sur jadwal y met des mois de saisie : les cours, les
traductions, les heures de prière tenues à la main, les périodes, les sessions du vendredi. Perdre
cela, c'est perdre le travail d'une équipe bénévole, et ce n'est pas rattrapable en une soirée.

Les instantanés que propose un hébergeur ne comptent pas : ils sont dans le même compte, chez le même
fournisseur, et un compte qu'on perd emporte la machine **et** ses instantanés. On s'en sert pour
remonter vite après une bêtise, pas pour survivre à un sinistre.

## Décision

**Une vidange logique quotidienne, chiffrée sur le tube avant de toucher le disque, envoyée hors du
serveur, et dont la clé de déchiffrement n'est jamais sur le serveur.**

### L'ordre, qui est tout

```
pg_dump --format=custom | age --recipient <clé publique> --output archive.age
```

Il n'existe à aucun moment un fichier de vidange en clair sur le serveur. Pas dans `/tmp`, pas une
seconde. `pipefail` fait qu'un `pg_dump` interrompu en cours de route ne laisse pas passer une
archive chiffrée tronquée, et deux contrôles suivent : la taille, et la présence de l'en-tête
`age-encryption.org/v1`. Une archive qui ne les passe pas est effacée et la tâche échoue — plutôt que
de remplacer une bonne archive par une mauvaise.

### `age` plutôt que GnuPG

Un format, une commande, pas de trousseau, pas d'agent, pas de date d'expiration à surveiller, pas de
sous-clés. La clé publique tient sur une ligne et vit dans le fichier d'environnement ; la clé privée
tient sur une ligne aussi, et vit ailleurs. GnuPG ferait la même chose avec dix ans de compatibilité
ascendante à porter et un trousseau à sauvegarder lui-même.

### `rclone` plutôt qu'un client spécialisé

Il parle S3, Swift, SFTP, WebDAV et une trentaine d'autres protocoles. La destination peut changer —
d'un stockage objet à un autre — sans qu'une ligne de ce projet change. Sa configuration,
qui porte les identifiants, est en `0600 root` à côté du fichier d'environnement.

Après l'envoi, l'archive est **relue depuis la destination** et son empreinte comparée à la locale.
Sans cela, on découvrirait un envoi silencieusement tronqué le jour où on en a besoin.

### La rétention : 7 quotidiennes, 4 hebdomadaires, 5 mensuelles

Une seule série de fichiers, pas trois copies. La règle décide de ce qui reste : les sept plus
récentes, les dimanches des quatre dernières semaines, les premiers des cinq derniers mois. Elle est
isolée dans `jadwal-retention.sh`, qui **n'efface rien** et se contente d'écrire les noms à garder —
ce qui permet de l'éprouver sur un répertoire jetable rempli de fichiers vides. Elle l'a été : sur
quatre cent une dates, elle en garde quinze, et on peut les compter à la main.

> **Révisé le 2026-09-23 : cinq mensuelles, et non plus six.** Les conditions d'utilisation
> promettent qu'une donnée effacée ne reste pas plus de 181 jours dans une sauvegarde. Six premiers
> du mois gardés, c'était jusqu'à 184 jours sur le disque du serveur : deux premiers du mois
> éloignés de six mois peuvent être séparés de 184 jours, du 1er mars au 1er septembre. Avec cinq,
> c'est 153 jours au plus. Un test le rejoue sur huit ans de vraies nuits. Le même jour, le script
> lancé dans un conteneur sur quatre cent une dates en a gardé quinze.

### La clé privée n'est pas sur le serveur

C'est la ligne qu'on ne franchit pas. Qui prend le serveur prend la base vivante de toute façon ;
mais il ne prend pas l'historique, et il ne peut rien lire chez l'hébergeur de sauvegarde. Le rôle
Ansible vérifie qu'aucun fichier ressemblant à une clé privée ne traîne dans `/etc/jadwal`,
`/opt/jadwal` ou `/root`, et s'arrête s'il en trouve un.

## La conséquence gênante, et ce qu'on en fait

Un test de restauration automatique ne peut pas déchiffrer une archive, puisque la clé n'est pas là.
Dire « on restaure chaque semaine » en le laissant croire serait un mensonge par omission. Voici donc
ce qui est vraiment éprouvé, et par qui.

| Ce qu'on veut savoir                                              | Qui l'éprouve                                               | Quand                                                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| La vidange est restaurable : schéma, RLS, contraintes, extensions | La tâche hebdomadaire, sans clé, dans une base jetable      | Chaque dimanche                                                   |
| L'archive est partie entière et intacte                           | La tâche de sauvegarde, par relecture depuis la destination | Chaque nuit                                                       |
| L'archive est bien chiffrée                                       | La tâche de sauvegarde, par son en-tête                     | Chaque nuit                                                       |
| **La clé de l'exploitant ouvre l'archive**                        | **L'exploitant, avec sa clé**                               | À la mise en production, puis au rythme de `docs/EXPLOITATION.md` |

Ce qui pourrit avec le temps, c'est la première ligne : une extension absente, une dépendance
circulaire, un `pg_restore` qui ne sait plus remonter un schéma. C'est donc elle qu'on éprouve toutes
les semaines, et elle l'est sérieusement — nombre de tables, RLS forcée sur chacune, journal de
migrations identique, et nombre de lignes égal table par table hors tables volatiles.

La dernière ligne, elle, ne pourrit pas : une clé `age` qui ouvrait une archive hier l'ouvre encore
dans dix ans. Ce qui pourrit, c'est la certitude qu'on a **la bonne** clé et qu'on sait s'en servir.
D'où le rappel : la veille alerte si la restauration complète n'a plus abouti depuis quatre-vingt-dix-sept jours, soit un trimestre plus la marge de sept jours du contrôle extérieur (ADR 0037).

Les deux modes ont été joués pour de vrai à l'étape 9, contre l'image de production, avec une paire
de clés engendrée pour l'occasion. Les sorties sont dans le rapport.

## Ce que cela ne protège pas, et qu'il faut demander à l'hébergeur

Qui obtient `root` sur le serveur a les identifiants de `rclone`, donc peut effacer les archives
distantes. La parade n'est pas dans ce projet : c'est un compartiment à **verrouillage d'objet** ou
en écriture seule, du côté de l'hébergeur de sauvegarde. C'est demandé à l'exploitant, et tant que ce
n'est pas en place, la sauvegarde protège de la panne et du sinistre, pas d'un attaquant qui prend la
machine.

## Conséquences

- `age` et `rclone` sont installés sur l'hôte. Deux paquets, tous deux dans les dépôts d'Ubuntu.
- Le fichier d'environnement porte `JADWAL_AGE_RECIPIENT` (clé **publique**) et
  `JADWAL_RCLONE_REMOTE`. Sans eux, la tâche refuse de tourner plutôt que d'écrire en clair ou de
  laisser l'archive sur place.
- `--no-owner` et `--no-privileges` sont volontairement **absents** du `pg_dump` : les rôles et les
  politiques RLS font partie de ce qu'on sauvegarde (ADR 0019).
- Le journal d'audit et le registre interne sont dans les archives comme le reste. Un verrou de
  conservation (ADR 0030) ne les en sort pas : il suspend leur purge, il ne change pas la sauvegarde.

## Statut

Accepté, 2026-09-21. Étape 9 de la feuille de route. Complète l'ADR 0019 (propriétaire non
privilégié) et l'ADR 0030 (verrou de conservation). Voir l'ADR 0036 pour la programmation et la
veille. Révisé le 2026-09-23 : cinq mensuelles sur le disque du serveur au lieu de six.

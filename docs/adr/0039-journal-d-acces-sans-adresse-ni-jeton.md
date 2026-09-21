# 0039 — Le journal d'accès ne porte ni adresse entière ni jeton

- **Statut** : acceptée
- **Date** : 2026-09-21
- **Complète** : [ADR 0009](0009-vie-privee.md) (vie privée) et
  [ADR 0034](0034-isolation-du-deploiement.md) (isolation du déploiement).

## Le problème

`docs/CONDITIONS.md` promet qu'un visiteur d'une page publique ne laisse pas d'adresse. L'application
tient cette promesse : elle ne lit pas le cookie sur ces routes, elle ne journalise rien, et son
limiteur range un condensat plutôt qu'une adresse (ADR 0032).

Le serveur, lui, ne la tenait pas. Le bloc de site posait un `log` au format JSON, sans filtre, et
ce fichier porte trois choses que la promesse exclut :

1. **L'adresse du visiteur**, en clair, deux ou trois fois par ligne : celle de la connexion, celle
   que Caddy a résolue, et celle que porte `X-Forwarded-For`.
2. **Le jeton du lien magique.** `GET /api/auth/magic-link/verify?token=…` est un mot de passe à
   usage unique dans une adresse. Quiconque lit ce fichier dans les quinze minutes ouvre la session
   de la personne. Le même jeton revient une seconde fois dans l'en-tête `Referer`, que le
   navigateur renvoie après la redirection.
3. **La page d'où vient le visiteur**, par ce même `Referer`.

Un journal d'accès ordinaire est une base de données personnelles que personne n'a décidé de créer.

## La décision

**Le filtre est dans le bloc de site, pas ailleurs**, parce que Caddy écrit avant que l'application
ne voie quoi que ce soit : ce qui n'est pas retiré là est déjà sur le disque.

| Ce qui est journalisé                    | Ce qu'il en reste                                         |
| ---------------------------------------- | --------------------------------------------------------- |
| `request.remote_ip`, `request.client_ip` | tronqué en /24 (IPv4) et /48 (IPv6)                       |
| `request.headers.X-Forwarded-For`        | tronqué de même, adresse par adresse                      |
| `request.uri`                            | `token=…` et `/reset-password/…` remplacés par `REDACTED` |
| `request.headers.Referer`                | supprimé                                                  |
| `Cookie`, `Authorization`, `Set-Cookie`  | déjà vidés par Caddy lui-même                             |

Un /24 garde de quoi reconnaître un abus qui vient d'un même réseau ; il ne désigne plus personne.

Deux formes de jeton existent, et la même expression couvre les deux : dans la requête
(`?token=`, sur `magic-link/verify`, `verify-email` et `delete-user/callback`) et dans le chemin
(`/reset-password/<jeton>`, que Better Auth monte quelle que soit la configuration).

**Ce filtre est éprouvé, pas relu.** `format filter` désigne ses champs par un chemin
(`request>headers>Cookie`) et une faute de frappe dans ce chemin ne produit aucune erreur : le
filtre ne s'applique à rien, et le secret part dans le fichier. `scripts/eprouver-journal-caddy.mjs`
rejoue donc **le bloc livré** dans un conteneur jetable, envoie une requête porteuse des quatre
secrets, et relit la ligne écrite.

## La rétention : quatorze jours, fichier courant compris

Caddy borne ce qu'il a **déjà roulé** — `roll_keep`, `roll_keep_for` — mais il ne roule qu'à la
taille. Le fichier courant n'a donc aucune borne de temps : sur un service peu fréquenté, il peut
porter des mois de lignes avant d'atteindre dix mégaoctets. Une rétention annoncée dans les
conditions d'utilisation ne peut pas dépendre du trafic.

`logrotate` ne le résout pas, et cela a été **mesuré** contre la version de Caddy visée :

- avec `copytruncate`, Caddy garde sa position d'écriture et reprend là où il en était. Le fichier
  vidé se remplit d'octets nuls jusqu'à l'ancienne position — relevé : 1 259 octets de zéros avant
  la première ligne, après une seule coupe. `jq` ne lit plus rien ;
- sans `copytruncate`, `logrotate` renomme, Caddy continue d'écrire dans le fichier renommé, et le
  journal courant reste vide pour toujours.

Faire rouvrir Caddy après chaque rotation demanderait de le recharger, et recharger le Caddy de
l'hôte sans que l'exploitant l'ait demandé est exactement ce que l'ADR 0034 s'interdit.

**La tâche `jadwal-journal-caddy`, chaque nuit à 00:20 UTC, écrase plutôt que de vider.** Elle
relève la taille, copie ce qui précède cette position dans une archive datée, puis remplit cette
même zone de retours à la ligne. Le fichier garde sa taille, Caddy garde sa position, les lignes
écrites entre-temps sont au-delà et restent intactes, et la zone écrasée devient des lignes vides
que `jq` et `grep` traversent sans broncher. Les archives de plus de quatorze jours sont effacées.

Caddy écrit une ligne entière par appel : la position relevée est toujours une fin de ligne.

`roll_size 10MiB` reste en place comme garde-fou de disque, avec `roll_keep_for 336h` pour que même
ces roulements-là ne survivent pas à quatorze jours.

## Ce que l'on perd

- **Le diagnostic fin d'un abus.** Un /24 ne distingue pas deux visiteurs du même opérateur. Ce qui
  reste suffit à voir un réseau qui martèle une route ; ce qui manque est ce qu'on a promis de ne
  pas garder.
- **La provenance.** Sans `Referer`, on ne sait plus quel site a envoyé un visiteur. C'est une
  information de régie publicitaire, pas d'exploitation.
- **Un mécanisme de plus à tenir** : un script, une unité, une minuterie. Le prix d'une rétention
  qui ne dépend pas du trafic.

## Ce que l'on gagne

Le fichier le plus banal du serveur cesse d'être celui qui en dit le plus. Qui le lit n'y trouve ni
l'adresse de quelqu'un, ni de quoi ouvrir sa session, et rien de plus vieux que quatorze jours.

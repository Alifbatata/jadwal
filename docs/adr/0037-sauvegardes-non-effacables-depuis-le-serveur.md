# 0037 — Les sauvegardes ne sont pas effaçables depuis le serveur

- **Statut** : acceptée
- **Date** : 2026-09-21
- **Remplace en partie** : [ADR 0035](0035-sauvegardes-chiffrees.md), dont la rétention distante
  était tenue par le serveur lui-même.

## Le problème

L'ADR 0035 chiffre les archives avant qu'elles quittent le serveur, et garde la clé privée ailleurs.
Cela protège d'une **lecture** : ni l'hébergeur, ni le stockage, ni quelqu'un qui volerait une
archive ne peut l'ouvrir.

Cela ne protège de rien d'autre. Le serveur portait les identifiants de la destination **et** le
droit d'y effacer, puisque c'est lui qui appliquait la rétention : sept quotidiennes, quatre
hebdomadaires, six mensuelles, ici comme là-bas. Qui obtient `root` sur ce serveur obtient donc ce
jeton, et un jeton qui sait effacer efface. Un rançongiciel ordinaire commence par là.

Une sauvegarde qu'un attaquant peut supprimer en même temps que la base n'est pas une sauvegarde.
C'est une copie.

## La décision

**Le serveur n'efface plus rien sur la destination.** Il écrit, il relit ce qu'il vient d'écrire, et
c'est tout. La rétention distante passe au stockage, qui en sait assez pour l'appliquer seul et qui
n'obéit pas au serveur.

Trois préfixes, trois durées :

| Préfixe      | Ce qui y va                      | Verrou de conservation | Cycle de vie |
| ------------ | -------------------------------- | ---------------------- | ------------ |
| `quotidien/` | chaque nuit                      | 7 jours                | 8 jours      |
| `hebdo/`     | la nuit du dimanche, **en plus** | 28 jours               | 29 jours     |
| `mensuel/`   | la nuit du 1er, **en plus**      | 180 jours              | 181 jours    |

Deux mécanismes, et il en faut deux : le **verrou** empêche d'effacer avant l'échéance, le **cycle
de vie** efface après. Le verrou seul laisserait tout s'accumuler ; le cycle de vie seul n'empêcherait
personne d'effacer plus tôt. Le cycle de vie est réglé un jour après la fin du verrou, pour qu'aucun
objet ne soit candidat à l'effacement pendant qu'il est encore protégé.

Trois conséquences, toutes assumées :

1. **Une archive est copiée, pas liée.** Un verrou porte sur un objet, pas sur un nom : une nuit de
   dimanche 1er du mois produit trois objets identiques. C'est trois fois la place, et c'est le prix
   d'une rétention qu'un attaquant ne peut pas raccourcir.
2. **Le nom porte la date et l'heure.** `jadwal-2026-09-21T021503Z.dump.age`. Un verrou refuse
   l'écrasement : deux exécutions le même jour — un rattrapage après incident, une minuterie
   `Persistent=true` qui se déclenche au démarrage — doivent produire deux objets, pas une erreur.
3. **Tout est en UTC**, y compris « dimanche » et « le 1er », et la minuterie systemd avec. Une
   minuterie en heure locale glisse de deux heures au changement d'heure, et une semaine pourrait
   alors recevoir deux dimanches ou aucun.

La règle qui décide du nom et des préfixes vit dans `infra/sauvegarde/destinations.mjs`, à part,
parce qu'elle se teste : se tromper de préfixe donne à une archive la mauvaise durée de vie, et cela
ne se verrait que le jour où elle manque. Elle est jouée sur le serveur par un conteneur jetable tiré
de l'image de l'application — l'hôte n'a pas de Node, et la règle n'existe qu'à un seul endroit.

La rétention **locale**, sur le disque du serveur, ne change pas : elle reste tenue par
`jadwal-retention.sh`. Ce disque est à nous, il est petit, et ce qui s'y trouve n'est qu'un raccourci.

## Ce qui reste hors de ce dépôt

Les verrous et le cycle de vie se posent chez le stockage, et **pas depuis le serveur** : c'est toute
la décision. Les commandes exactes, le compte et la juridiction sont propres à celui qui exploite une
instance ; il les garde chez lui, hors de ce dépôt. Ce dépôt ne décrit que la forme : trois préfixes,
trois durées, et une vérification.

## La vérification

Une règle qu'on n'a jamais vue refuser quelque chose n'est pas une règle. Le rôle `sauvegarde` du
playbook écrit donc, à chaque déploiement, un objet d'essai sous `quotidien/`, puis **tente de
l'écraser et de l'effacer** avec le jeton du serveur. Les deux doivent échouer, sinon le playbook
s'arrête. L'objet d'essai reste jusqu'à la fin de son verrou : quelques kilo-octets, et c'est le prix
de la preuve.

`jadwal_verifier_verrous=false` saute cette vérification, pour une destination qui n'a délibérément
pas de verrou — un stockage qui n'en propose pas, une instance d'essai.

## Ce que l'on perd

- **De la place.** Jusqu'à trois copies d'une même archive, et rien ne s'efface avant l'échéance.
  Pour une base de programme de cours, cela reste de l'ordre du gigaoctet.
- **Le droit de se raviser.** Un objet envoyé par erreur reste jusqu'à la fin de son verrou, et
  personne ne peut le retirer — pas même l'exploitant, pas même le support du stockage. C'est
  exactement ce qu'on a demandé.
- **Une donnée effacée survit 181 jours au plus** dans les archives chiffrées. Les conditions
  d'utilisation le disent, parce que la loi demande de le dire.

## Ce que l'on gagne

Qui prend le serveur prend la base, les identifiants d'envoi et le droit d'écrire. Il ne prend pas
les sauvegardes des 180 derniers jours.

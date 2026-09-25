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

| Préfixe      | Ce qui y va                      | Verrou de conservation | Cycle de vie | Âge promis |
| ------------ | -------------------------------- | ---------------------- | ------------ | ---------- |
| `quotidien/` | chaque nuit                      | 7 jours                | 8 jours      | 9 jours    |
| `hebdo/`     | la nuit du dimanche, **en plus** | 28 jours               | 29 jours     | 30 jours   |
| `mensuel/`   | la nuit du 1er, **en plus**      | 180 jours              | 181 jours    | 182 jours  |

Deux mécanismes, et il en faut deux : le **verrou** empêche d'effacer avant l'échéance, le **cycle
de vie** efface après. Le verrou seul laisserait tout s'accumuler ; le cycle de vie seul n'empêcherait
personne d'effacer plus tôt. Le cycle de vie est réglé un jour après la fin du verrou, pour qu'aucun
objet ne soit candidat à l'effacement pendant qu'il est encore protégé.

**L'âge promis n'est pas le cycle de vie, il a un jour de plus.** Le cycle de vie désigne ce qui est
échu ; il ne l'efface pas à la seconde. Le fournisseur du stockage retenu écrit que ses objets échus
sont effacés « en général dans les 24 heures ». Ce jour-là compte dans ce qu'on promet : un objet est
dans les temps jusqu'à 9 jours sous `quotidien/`, 30 sous `hebdo/`, 182 sous `mensuel/`, comptés
depuis sa date de dépôt chez le stockage, ou depuis l'heure de la vidange que porte son nom quand
il a été déposé plus d'une heure après elle. Les conditions d'utilisation disent donc **182 jours**,
la durée du préfixe qui garde le plus longtemps, et une vérification de nuit contrôle que chaque
objet tient l'âge de son préfixe (voir plus bas).

> **Révisé le 2026-09-23.** Les conditions disaient 181 jours : la durée du cycle de vie, sans le jour
> que le stockage peut mettre à effacer. Le réglage du stockage ne change pas ; c'est la promesse qui
> s'aligne sur ce qu'il fait.

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
Depuis le 2026-09-23, elle garde cinq mensuelles et non plus six : avec six, une archive pouvait y
rester 184 jours, plus que les 182 promis par les conditions (voir l'ADR 0035). Avec cinq, c'est
153 jours au plus. Ce disque n'a pas de jour de retard : c'est le serveur qui y efface, à la nuit
dite.

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

### Chaque nuit, l'âge de chaque objet

Le verrou se prouve en essayant d'effacer. Le cycle de vie, lui, ne se prouve qu'en regardant ce qui
reste, et c'est ce que la tâche de sauvegarde fait chaque nuit, après l'envoi et la relecture : elle
liste la destination avec le même rclone, la même configuration et le même jeton
(`rclone lsjson --use-server-modtime --no-mimetype --recursive --files-only`), et passe la liste à
`infra/sauvegarde/ages.mjs`, avec les chemins des objets qu'elle vient d'envoyer. La règle signale
tout objet plus vieux que l'âge promis pour son préfixe, et tout objet hors des trois préfixes, pour
lequel aucune promesse ne dit quand il part. Les empreintes `.sha256` et l'objet d'essai du verrou
comptent comme les archives.

Un objet signalé fait **échouer la tâche** : `OnFailure=` envoie le courriel, et le battement de
cœur part en échec. **Une liste qui échoue la fait échouer aussi**, celle d'un seau qui n'existe
pas par exemple (« directory not found »). Une liste vide ou illisible aussi : rclone rend une liste
vide, sans erreur, pour un chemin qui n'existe pas dans le seau, et la destination ne peut pas être
vide juste après un envoi. `pnpm sauvegarde:test` joue ces deux cas avec le vrai rclone, contre un
faux stockage S3. Une liste qui ne montre pas l'archive de la nuit et son empreinte est refusée de
même, sous le nom de « liste incomplète » : elle a été lue sans erreur, mais elle regarde ailleurs,
ou elle est tronquée, et ne prouve rien sur les objets qu'elle ne montre pas. Un contrôle qui ne
peut pas contrôler ne doit pas se taire ; la veille en a porté un qui se taisait (étape 12).

L'âge est compté depuis la date de dépôt que le stockage écrit dans la liste. C'est de cette date
que le stockage compte lui-même l'échéance du cycle de vie : la vérification mesure donc ce que le
cycle de vie mesure. `--use-server-modtime` fait prendre cette date à rclone, et `--no-mimetype` lui
retire la dernière lecture objet par objet, celle du type. Sans la première, rclone lit la date de
chaque objet par une requête à part. Quand cette requête échoue, rclone met l'heure présente à la
place et sort sans erreur : un objet trop vieux passerait pour neuf. Le rôle installe le paquet
rclone de la distribution, souvent bien plus ancien que l'image officielle. Le défaut existe en
1.60.1, la version des paquets des distributions stables d'aujourd'hui, comme en 1.75.1, une
version récente, et l'option le corrige dans les deux. `pnpm sauvegarde:test` joue ce cas avec les
deux versions, contre un faux stockage S3 qui refuse ces requêtes.

**La date de dépôt a un défaut : un objet recopié repart de zéro.** Un changement de stockage, une
copie entre seaux donnent à l'objet une nouvelle date de dépôt, et le cycle de vie du nouveau seau
le garde encore un plein délai. La vérification lit donc aussi l'heure écrite dans le nom, celle où
la nuit a commencé, juste avant la vidange : `jadwal-2026-09-21T021503Z.dump.age`, son empreinte
`.sha256`, et `verrou-eprouve-2026-09-21T120000Z.txt` pour l'objet d'essai du verrou. Une archive
contient les données de ce moment-là, et c'est la mesure la plus juste de la promesse.

- Un objet déposé **plus d'une heure** après l'heure de son nom est jugé depuis son nom. Le journal
  donne les deux âges : l'exploitant cherchera l'objet chez le stockage, qui ne connaît que le
  dépôt.
- Un objet déposé **dans l'heure** reste jugé depuis son dépôt. C'est le temps qu'une nuit met à
  vider la base et à envoyer : quelques minutes pour une base de programmes de cours, et l'heure
  laisse de la place à une base qui grossit. Compter depuis le nom ferait tomber une nuit ordinaire
  où le stockage a pris tout son jour pour effacer : 182 jours depuis le dépôt, mais 182 jours et
  quelques minutes depuis la vidange. Dans l'heure, le verdict est donc exactement celui de la date
  de dépôt.
- Une date de nom dans le futur ou illisible, et un nom que la nuit n'écrit pas, laissent la date
  de dépôt. Le nom peut vieillir un objet, jamais le rajeunir.

Le nom rattrape aussi le défaut de rclone décrit plus haut : un objet que rclone daterait de l'heure
présente serait jugé depuis son nom. L'épreuve joue une archive vidée il y a 206 jours et recopiée
il y a 13 jours, et exige qu'elle soit signalée.

Ce que cette vérification ne voit pas :

- **Un retard de moins d'une nuit.** Elle passe une fois par nuit, et ne voit donc un dépassement
  que s'il dure encore au passage suivant. Un objet resté quelques heures de trop, puis effacé entre
  deux passages, n'est jamais signalé.
- **Les versions anciennes d'un stockage qui garde des versions.** La liste ne montre que la
  version courante de chaque objet. Sur un tel stockage, une expiration peut laisser derrière elle
  une version ancienne que la liste ne voit pas, et la vérification n'y prouve rien. Le stockage
  retenu ne garde pas de versions : la question ne se pose pas pour lui. Elle se pose pour qui en
  choisit un autre.
- **Les minutes entre la vidange et le dépôt.** Un objet déposé dans l'heure qui suit l'heure de son
  nom est jugé depuis son dépôt, comme le stockage le juge. Les données qu'il contient ont donc un
  peu plus que l'âge compté : les minutes de la vidange et de l'envoi, une heure au plus.
- **Un objet recopié sous un autre nom.** Seuls les noms que la nuit et le playbook écrivent portent
  une heure que la vérification sait lire. Une archive renommée en route, ou posée à la main sous
  un autre nom, est jugée depuis son dépôt : recopiée, elle repart de zéro.
- **Une copie hors de la destination.** La liste ne couvre que `JADWAL_RCLONE_REMOTE`. Une archive
  recopiée dans un autre seau, ou chez un autre stockage, échappe à la vérification, quelle que soit
  sa date.
- **Une horloge du serveur en retard.** « Maintenant » est l'heure du serveur au moment de la
  vérification. Une horloge en retard rajeunit tous les objets d'autant.

Le serveur n'efface pas l'objet signalé, par décision : il n'efface rien sur la destination (voir
« La décision »). Ce n'est pas une incapacité. Seul le verrou empêche d'effacer : tant qu'il court,
personne ne peut effacer l'objet. Une fois le verrou échu, le jeton du serveur le pourrait. Un objet
signalé n'a pas toujours dépassé son verrou : une archive recopiée est jugée depuis son nom alors
que son verrou, compté depuis le nouveau dépôt, court encore, et un objet hors des trois préfixes
est signalé à tout âge. La suite se joue chez le stockage, avec les identifiants de l'exploitant
(`docs/EXPLOITATION.md`).

## Ce que l'on perd

- **De la place.** Jusqu'à trois copies d'une même archive, et rien ne s'efface avant l'échéance.
  Pour une base de programme de cours, cela reste de l'ordre du gigaoctet.
- **Le droit de se raviser.** Un objet envoyé par erreur reste jusqu'à la fin de son verrou, et
  personne ne peut le retirer — pas même l'exploitant, pas même le support du stockage. C'est
  exactement ce qu'on a demandé.
- **Une donnée effacée survit 182 jours au plus** dans les archives chiffrées : 181 jours de cycle
  de vie, et le jour que le stockage peut mettre à effacer. Les conditions d'utilisation le disent,
  parce que la loi demande de le dire.

## Ce que l'on gagne

Qui prend le serveur prend la base, les identifiants d'envoi et le droit d'écrire. Il ne prend pas
les sauvegardes des 180 derniers jours.

# ADR 0036 : Tâches périodiques par systemd, et une veille qui écoute le silence

## Contexte

Six tâches ont été écrites au fil des étapes précédentes et n'ont jamais été programmées : le
remplissage des heures de prière calculées, et cinq purges de rétention — journal d'audit, registre
interne du super-admin, compteur de vues, limiteur de débit, invitations résolues, comptes sans
organisation. Deux autres arrivent avec l'étape 9 : la sauvegarde et son test de restauration.

Une politique de rétention qu'aucune tâche n'applique est une phrase dans un document. `docs/CONDITIONS.md`
promet des durées ; il fallait que quelque chose les tienne.

## Décision

**systemd, une minuterie par tâche, `OnFailure=` pour l'échec, et une veille horaire pour le
silence.**

### systemd plutôt que cron

Trois raisons, dans l'ordre où elles comptent :

1. **`Persistent=true`** rattrape une exécution manquée. Un serveur redémarré à 03:00 rate son cron
   de 03:10 et ne le sait pas. Une minuterie systemd le rejoue au démarrage suivant.
2. **`OnFailure=`** envoie un courriel sans qu'aucun script n'ait à y penser. Avec cron, chaque
   script doit se souvenir de prévenir en cas d'échec — et le jour où il échoue avant d'arriver à ce
   code, il ne prévient personne.
3. **Le journal existe déjà**, daté, avec le code de sortie, sans fichier de log à faire tourner.

Et pas de conteneur ordonnanceur : ce serait un troisième conteneur à surveiller pour rendre ce que
l'hôte fait déjà, avec une horloge de plus à garder à l'heure.

### Cinq minuteries, pas huit

| Unité                 | Quand             | Ce qu'elle fait                                              |
| --------------------- | ----------------- | ------------------------------------------------------------ |
| `jadwal-sauvegarde`   | 02:15             | Vidange, chiffrement, envoi, rétention (ADR 0035).           |
| `jadwal-prieres`      | 03:10             | Fenêtre glissante des heures de prière calculées (ADR 0004). |
| `jadwal-purges`       | 03:40             | Les six purges de rétention.                                 |
| `jadwal-restauration` | dimanche 04:30    | Restauration dans une base jetable et comparaison.           |
| `jadwal-veille`       | toutes les heures | Ce que personne d'autre ne remarquerait.                     |

Les six purges sont **une seule unité**, et non six. Elles partagent leur horaire, leur rôle de base
et leur conséquence ; six unités auraient produit six courriels pour une même panne de base. Le
script, lui, les sépare : chaque purge est sa propre transaction, et la sortie dit laquelle a emporté
combien de lignes. La sauvegarde passe **avant** les purges : l'archive du matin porte alors l'état
d'avant, et une purge qui se tromperait resterait rattrapable.

Chaque unité est `Nice=10`, `IOSchedulingClass=idle`, et ses minuteries portent un
`RandomizedDelaySec`. Un serveur peut porter d'autres applications : les tâches de jadwal passent
après tout le monde, et ne se réveillent pas toutes à la même seconde.

### L'échec prévient. Le silence aussi.

`OnFailure=jadwal-alerte@%n.service` : une unité séparée, qui reçoit le nom de celle qui a échoué et
envoie un courriel contenant **les trente dernières lignes de son journal**. C'est ce qu'on veut lire
à deux heures du matin — pas « la sauvegarde a échoué », mais pourquoi. Unité séparée et non
`ExecStopPost=`, pour que l'échec de l'envoi n'entre pas en boucle avec l'échec d'origine.

Mais une tâche qui **cesse de se lancer** ne produit ni sortie, ni code d'erreur, ni ligne de
journal. C'est le silence qu'on n'entend pas. Chaque tâche écrit donc une **marque de réussite**
datée dans `/var/lib/jadwal/reussites/`, et la veille horaire compare son âge au **double** de sa
période : une tâche quotidienne qui saute une nuit a pu tomber sur un redémarrage, deux nuits
d'affilée ne sont plus un hasard.

La veille relit aussi, toutes les heures : la place restante sur le disque, la date d'expiration du
certificat **vue depuis le réseau** et non depuis la configuration, la présence d'une archive de
moins de deux jours, les verrous de conservation posés depuis plus de six mois, l'état des deux
conteneurs, la réponse de `/healthz` sur la boucle locale, et celle du nom public en IPv4 **et en
IPv6**.

Elle n'envoie pas le même courriel toutes les heures : une alerte déjà envoyée dans les dernières
vingt-quatre heures n'est pas renvoyée, et sa marque est effacée dès que la situation redevient
normale. Sans cela, une alerte vraie deviendrait en deux jours une alerte qu'on filtre, et la veille
se serait détruite elle-même.

### Le courriel part par un conteneur jetable

L'alerte doit partir **quand l'application ne répond plus**, ce qui est le cas de loin le plus
fréquent. Un envoi qui passerait par le serveur SvelteKit ne servirait que lorsqu'on n'en a pas
besoin. Elle part donc par un `docker run` sur l'image de production, qui porte déjà `nodemailer` et
la configuration SMTP : rien à installer sur l'hôte, et l'alerte emprunte exactement le même chemin
que les courriels du service.

### La sonde extérieure, et ce qu'elle ne peut pas faire

La veille sait tout sauf une chose : si le serveur est injoignable, elle est injoignable avec lui. Il
faut donc quelqu'un dehors.

> **Révisé à l'étape 9 — voir [ADR 0038](0038-sonde-exterieure-hors-de-github-actions.md).** Cette
> sonde était un travail programmé de GitHub Actions, qui interrogeait `/healthz` toutes les quinze
> minutes et alertait par SMTP. Elle a été retirée pour une raison dirimante : **les machines de
> GitHub n'ont pas d'IPv6 sortant**, et la moitié de la surface publique du service n'était donc
> jamais éprouvée depuis l'extérieur. Elle est remplacée par une sonde sur une machine tierce, qui
> interroge les deux piles séparément et signale ses succès à un service de supervision — lequel
> alerte quand un signal n'arrive pas.

L'IPv6 reste par ailleurs éprouvée par la veille, depuis le serveur, contre sa propre adresse
publique — ce qui traverse le DNS, Caddy et TLS. Les deux se complètent : la veille voit ce que
l'extérieur ne peut pas voir, et l'extérieur voit ce que l'intérieur ne peut pas voir, à savoir
l'absence.

## Ce que l'exécution réelle a corrigé

Deux défauts que la relecture n'avait pas vus, trouvés en lançant les scripts contre l'image de
production :

- **`set -e` faisait taire la veille au moment précis où elle avait quelque chose à dire.** Une
  affectation dont la substitution de commande échoue fait sortir le script : un serveur qui ne
  présente plus de certificat arrêtait la veille avant les contrôles suivants, au lieu de déclencher
  l'alerte. Corrigé par un `|| true` explicite, commenté à l'endroit où il compte.
- **`text || boolean` rend `true`/`false` en PostgreSQL**, et non `t`/`f` comme l'affichage de psql.
  Le contrôle de RLS du test de restauration déclarait donc les vingt et une tables sans RLS, alors
  qu'elles l'avaient toutes. Un test de restauration qui échoue toujours ne vaut pas mieux qu'aucun
  test.

## Conséquences

- Les unités tournent en root. C'est nécessaire — elles pilotent Docker — et c'est aussi ce qui
  permet de garder `/etc/jadwal/jadwal.env` en `0600 root` : les secrets ne sont lisibles par aucun
  compte non privilégié.
- Les scripts ne **sourcent jamais** le fichier d'environnement : ils en extraient les quelques
  valeurs non secrètes dont ils ont besoin, avec `sed`. Un script qui l'aurait sourcé exposerait les
  secrets à tout ce qu'il lance ensuite, et à `/proc/<pid>/environ`.
- Le tri des verrous de conservation « plus vieux que N jours » est fait par
  `retention-hold.mjs list --anciens N`, dans le conteneur, et non par la veille : Node est dans
  l'image, il n'a aucune raison d'être aussi sur l'hôte.
- La sonde extérieure avait besoin de trois secrets de dépôt (`SUPERVISION_SMTP_USER`,
  `SUPERVISION_SMTP_PASSWORD`, `SUPERVISION_MAIL_TO`) pour envoyer son courriel — c'est-à-dire de
  confier des identifiants de messagerie à la forge qui héberge le code public. Aucun n'a jamais été
  posé, et l'alerte n'aurait donc jamais pu partir. Constat qui a pesé dans la révision de
  l'[ADR 0038](0038-sonde-exterieure-hors-de-github-actions.md).

## Statut

Accepté, 2026-09-21. Étape 9 de la feuille de route. Complète l'ADR 0004 (heures de prière),
l'ADR 0020 (rétention du journal d'audit), l'ADR 0030 (verrou de conservation) et l'ADR 0032
(compteur de vues). Voir l'ADR 0034 pour le déploiement et l'ADR 0035 pour les sauvegardes.

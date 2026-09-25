# 0045 : la garde du déploiement, un parcours vert pour le commit de l'image

- Statut : accepté
- Date : 2026-09-23
- Complète : [0010](0010-chaine-d-approvisionnement.md), [0034](0034-isolation-du-deploiement.md)

## Contexte

Le parcours complet (`pnpm parcours:test`) fait, dans un vrai navigateur et contre l'image de
production, tout ce qu'une organisation vit : la passkey du super-admin, l'invitation, les
conditions, les cours, la page publique, le widget, le flux agenda, et axe sur chaque page. C'est
l'épreuve la plus proche de ce que vivent les gens. Depuis l'étape 16, elle tournait sur le poste,
quand quelqu'un pensait à la lancer.

La CI (`ci.yml`) publie l'image dès que ses tests, sa construction et son contrôle des secrets
passent, sans attendre le parcours, qui prend plus longtemps : il construit l'image, la met en
marche avec sa base, puis passe dans Chrome. Le déploiement, lui, part d'un poste, par Ansible,
avec un digest copié à la main. Rien, côté GitHub, n'empêche de déployer une image dont le parcours
a échoué, ou n'a jamais tourné.

Le seul endroit par où passe tout déploiement est le playbook. C'est donc là que la condition doit
tenir : pas de déploiement sans un parcours vert pour le commit de l'image.

## Décision

**Un flux à part, `.github/workflows/parcours.yml`**, lance `pnpm parcours:test` à chaque poussée
sur `main`, et à la main (`workflow_dispatch`). Il ne publie rien : l'image qu'il construit
disparaît avec la machine de GitHub qui le fait tourner. Un flux à part plutôt qu'un travail de
plus dans `ci.yml` : la garde demande à GitHub les exécutions d'un fichier de flux, par son nom, et
celui-ci a sa propre règle de concurrence (voir plus bas).

**Une pièce Ansible à part, jouée en premier, sur le nœud de contrôle** (`hosts: localhost`, rôle
`garde`), avant toute connexion au serveur. Quand elle refuse, Ansible s'arrête avant la pièce
suivante : le serveur ne voit ni connexion ni collecte de faits. Elle fait quatre choses :

1. elle n'accepte qu'une image désignée par son digest, publiée sur le registre qu'elle lit et sous
   le chemin du dépôt (`jadwal_garde_depot`, sans tenir compte de la casse). N'importe quel compte
   du registre peut publier une image dont l'étiquette de révision désigne un commit vert de
   jadwal : seul le chemin dit qui l'a publiée ;
2. elle lit dans le registre le manifeste à ce digest et la configuration qu'il désigne, et
   recalcule l'empreinte de chacun. Un registre qui rend autre chose que l'image demandée est
   refusé. Le type du manifeste décide : elle n'accepte qu'un manifeste d'image simple, celui que
   la CI publie (`provenance: false`, `sbom: false`). Un index de plusieurs plateformes est refusé,
   parce que Docker y prendrait le manifeste de la plateforme du serveur, que la garde ne connaît
   pas ; le message dit de déployer le digest de cette plateforme. Un manifeste d'image qui porte
   aussi une liste `manifests` est refusé de même ;
3. elle tire de la configuration les étiquettes que `ci.yml` pose sur chaque image :
   `org.opencontainers.image.revision`, qui doit être un commit, et
   `org.opencontainers.image.source`, qui doit désigner ce dépôt ;
4. elle demande à l'API de GitHub les exécutions de `parcours.yml` pour ce commit, refait elle-même
   les deux filtres de l'adresse, le commit et le flux, et exige au moins une exécution conclue en
   `success`.

Sinon, elle refuse, en disant l'image, la révision, le flux, ce qu'elle a trouvé et ce qu'il faut
faire.

**Des lectures anonymes.** Le dépôt et l'image sont publics. La garde suit le défi
`WWW-Authenticate` du registre pour prendre un jeton anonyme de lecture, jamais affiché (`no_log`),
et interroge l'API de GitHub sans compte. Aucun secret n'entre ni sur le poste qui déploie, ni dans
le coffre.

**La garde tient dans le rôle qui écrit l'image.** Seul le rôle `application` lit `jadwal_image`
et l'écrit sur le serveur, dans `compose.env` et `jadwal.env`. La pièce de la garde porte les tags
`garde` et `application` : elle tourne chaque fois que ce rôle tourne, et un passage qui ne le joue
pas (`--tags taches`, `--tags caddy`) ne déploie aucune image et n'a pas à présenter une image
verte. `--check` ne la saute pas : ses lectures portent `check_mode: false`.

**Le verdict ne naît que d'une vérification faite dans le même passage.** Trois choses y veillent :

- la garde se joue d'un seul bloc (`include_tasks`), dont `--start-at-task` ne voit pas le
  contenu : il ne peut pas démarrer au milieu, là où le verdict est posé par exemple, et Ansible
  répond qu'il ne trouve rien à ce nom ;
- une variable passée par `-e` l'emporte sur `set_fact` et sur `register`. Avec
  `-e garde_revision=<un commit vert>`, le verdict d'une image rouge devenait vert. Toutes les
  variables de la garde portent donc le préfixe `garde_`, et elle commence par refuser toute
  variable à ce préfixe qui existe avant elle, par `-e` ou par l'inventaire ;
- le verdict est rangé dans les faits du nœud de contrôle. L'inventaire ne peut pas écrire dans les
  faits, et `-e ansible_facts=…`, qui les remplace sur chaque hôte, se voit sur le serveur. Un
  cache de faits qui survit au passage (`jsonfile`, par exemple) garderait le verdict d'un passage
  précédent : la garde exige le cache par défaut, en mémoire.

Une sélection de tâches ne la contourne pas, et c'est tenu à deux endroits du rôle `application` :

- sa première tâche, sans tag propre, vérifie que la garde a passé cette image-là dans ce passage.
  Elle hérite du tag du rôle : aucun `--tags` ni `--skip-tags` ne joue le rôle sans elle. Elle
  refuse aussi `--skip-tags garde`, une variable `garde_` visible sur le serveur et un verdict dans
  les faits du serveur, et dit, quand `--limit` laisse `localhost` dehors, qu'il faut l'y remettre
  (`--limit '<serveur>,localhost'`) ;
- `--start-at-task` peut sauter cette tâche et la garde avec elle. Les deux gabarits qui écrivent
  l'image ne lisent donc pas `jadwal_image`, mais une valeur qui n'existe que si la garde a passé
  cette image dans ce passage (`image-gardee.j2`). Sans elle, le rendu s'arrête avec un message qui
  dit ce qu'il faut faire, et l'image n'est écrite nulle part. `compose.env` est écrit avant
  `jadwal.env`, dont le `no_log` cacherait ce message.

**Une dérogation écrite, bruyante, et liée à son image.** En secours seulement,
`jadwal_garde_derogation` lève la garde. Elle nomme l'image qu'elle couvre et dit pourquoi :
`-e '{"jadwal_garde_derogation": {"image": "<la référence par digest>", "motif": "<le motif>"}}'`.
L'image doit être celle de `jadwal_image` : oubliée dans un fichier passé par `-e @fichier` à chaque
déploiement, une dérogation ne vaut pas pour l'image suivante. Toute autre forme est refusée, en le
disant, de même qu'un motif d'un seul mot. Le JSON est la seule forme qui fasse passer une valeur
composée ; `-e clé=valeur` ne sait écrire qu'une chaîne, coupée au premier espace sans rien dire.
Avec une dérogation, rien d'autre n'est vérifié. La garde l'écrit en rouge, avec l'image et le
motif, et le récapitulatif final en garde la trace (`ignored=1`). Son verdict porte l'image que la
dérogation nomme, et ces tâches se jouent avec le reste de la garde : une dérogation ne passe pas
sans être vérifiée, ni sans être affichée.

**Chaque commit garde son verdict.** Le flux n'annule pas une exécution en cours quand une poussée
plus récente arrive (`cancel-in-progress: false`), et garde celles qui attendent (`queue: max`,
jusqu'à cent, dans l'ordre d'arrivée). La valeur par défaut, `queue: single`, n'en garde qu'une :
chaque nouvelle poussée annulait celle qui attendait, et ce commit-là restait sans verdict. Un
commit poussé reste donc déployable dès que son parcours est vert, même si d'autres l'ont suivi.
`ci.yml` garde `cancel-in-progress: true` : là, seul le dernier commit compte.

## Conséquences

- Par la voie prévue, aucune image ne part en production sans que le parcours complet ait réussi
  pour son commit, sauf dérogation écrite, visible dans la sortie et au récapitulatif. Ce n'est pas
  une promesse contre qui contourne la garde exprès (voir plus bas).
- Les variables au préfixe `garde_` appartiennent à la garde, et le cache de faits reste celui par
  défaut, en mémoire. Autrement, la garde refuse de tourner.
- Déployer attend la fin du parcours, en plus de celle de la CI.
- Le poste qui déploie doit joindre `ghcr.io` et `api.github.com`. Sans compte, l'API de GitHub
  accepte 60 requêtes par heure depuis une même adresse ; la garde en fait une par déploiement.
- Une image construite avant la garde est refusée : GitHub n'a aucune exécution de `parcours.yml`
  pour son commit, et la garde le dit (« aucune exécution de ce flux pour ce commit »). La
  redéployer demande une dérogation. Un passage qui ne joue pas le rôle `application`, comme
  `--tags taches`, n'en demande pas. GitHub cherche un flux par son nom dans le dépôt, pas commit
  par commit : le 404 (« le flux est inconnu de GitHub pour ce dépôt (404) ») ne vient que d'un
  flux qu'il ne connaît pas, pas encore poussé ou renommé, ou d'un `jadwal_garde_depot` ou
  `jadwal_garde_flux` qui désigne un autre dépôt ou un autre flux.
- Passé cent exécutions en attente, ou après une annulation à la main, un commit reste sans
  verdict, et son image est refusée tant que son parcours n'est pas relancé depuis l'onglet
  Actions (`Re-run jobs` rejoue le même commit).
- `--limit` doit garder `localhost`, où la garde tourne : `--limit '<serveur>,localhost'`. Sans
  lui, le rôle `application` s'arrête en le disant.
- Une instance qui construit sa propre image depuis son propre dépôt met le sien dans
  `jadwal_garde_depot`, et garde le flux.
- `pnpm garde:test` joue le playbook livré dans un conteneur jetable, contre une fausse API servie
  par le poste, cas par cas. `node scripts/eprouver-garde-deploiement.mjs --reel <image>` joue la
  même garde contre les API réelles, en lecture seule, sans rien déployer.

## Ce qui n'est pas fait

- **La garde ne protège pas contre qui tient le registre, le compte ou le dépôt.** Elle exige que
  l'image soit publiée sous le chemin du dépôt, et croit alors l'étiquette de révision que la CI y
  a posée. C'est une garde contre l'oubli et la hâte, pas contre un registre ou un compte
  compromis, qui pourrait publier autre chose sous le même chemin. Signer l'image le couvrirait ;
  ce n'est pas fait.
- **Elle ne vise pas qui la contourne exprès.** Elle tient contre l'oubli et la hâte : une
  sélection de tâches malheureuse, une dérogation restée dans un fichier, une variable posée par
  erreur. Qui modifie le playbook, ses rôles ou ses gabarits sur son poste, ou pointe
  `jadwal_garde_registre` et `jadwal_garde_api_github` vers un faux service qui répond « vert »,
  peut s'en passer sans bruit. Ce n'est pas ce qu'elle vise. `pnpm garde:test` éprouve les
  contournements qu'une main pressée peut faire, pas ceux d'une main décidée.
- **Elle remonte au commit, pas à l'octet.** Le flux construit sa propre image depuis le même
  commit, et c'est elle qu'il éprouve. L'image publiée par `ci.yml` n'est pas celle que le parcours
  a éprouvée ; elle sort du même commit et du même `Dockerfile`, sans que rien ne prouve qu'elle
  soit identique à l'octet près.
- **Rien n'est bloqué côté GitHub.** Le parcours ne conditionne pas la publication de l'image, et
  aucune règle de branche ne l'exige. Une image dont le parcours est rouge existe sur le registre ;
  seul le playbook refuse de la déployer.
- **Le parcours ne tourne pas sur les demandes de fusion.** Il tourne à chaque poussée sur
  `main`, et à la main (`workflow_dispatch`) sur la branche choisie.

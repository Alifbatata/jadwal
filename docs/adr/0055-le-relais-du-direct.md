# 0055 : le relais du direct

- Statut : accepté
- Date : 2026-11-26
- Met en œuvre : [0052](0052-application-mobile-et-sermon-traduit-en-direct.md)

## Contexte

L'ADR 0052 demande que le sermon du vendredi soit traduit à l'oral, en direct, dans sept langues.
Il pose déjà le cadre : un programme à part du serveur web, rien d'enregistré, un direct lancé à la
main et qui s'arrête seul, un plafond de dépense, et un module éteint sans réglage.

Le service de traduction n'est pas choisi. Il le sera sur un vrai sermon, parce que personne ne
garantit la justesse d'une machine sur un texte qui cite le Coran en arabe classique. Il faut donc
bâtir le relais sans savoir qui traduira, et pouvoir éprouver tout le reste sans clé ni dépense.

Lu dans les documentations officielles le 26 novembre 2026 :

- Les trois services candidats se parlent en WebSocket depuis un serveur. L'un n'accepte en entrée
  que du son PCM 16 bits, mono, à 24 kHz ; les deux autres le prennent aussi. Deux rendent de la
  voix dans ce même format, le troisième rend du texte.
- Deux d'entre eux veulent une session par langue cible. Le troisième traduit vers plusieurs
  langues dans une seule session.
- Node 24 fournit un client WebSocket, pas de serveur ; sa documentation renvoie au paquet `ws`.
- Un navigateur n'ouvre pas de liaison WebRTC sans serveur de signalisation ni pair en face ; Node
  n'en fournit pas.

## Décision

### Un programme à part : `apps/live`

Il ne partage avec le serveur web ni processus, ni base, ni variables d'environnement, sauf un
secret (plus bas). Il portera la clé du service de traduction ; le serveur web ne la voit jamais.
Il tient des liaisons ouvertes pendant tout un sermon, ce qu'un serveur de pages ne fait pas.

Sa seule dépendance à l'exécution est `ws`, parce que Node n'a pas de serveur WebSocket.

### WebSocket des deux côtés, et un seul format de son

Le poste « Diffuser » envoie la voix au relais par WebSocket ; le relais distribue la traduction
par WebSocket. Les ordres sont du texte JSON, le son des trames binaires. WebRTC est écarté : il
demanderait une pile de plus sur le serveur, pour un gain de quelques dixièmes de seconde sur une
traduction qui en prend déjà plusieurs.

Le relais ne connaît qu'un format : PCM 16 bits, mono, 24 kHz, petit-boutiste. Il ne convertit
rien et ne regarde pas les octets qu'il passe.

Ce format pèse 48 Ko par seconde et par personne qui écoute. Celui qui sera servi aux téléphones
reste à choisir, sur mesure, avec l'écran d'écoute.

### Le traducteur est une pièce qu'on change

Le relais demande à un traducteur d'ouvrir une traduction vers une liste de langues, lui passe le
son, et reçoit de lui, langue par langue, du son et du texte. À lui d'ouvrir une session par langue
ou une seule.

Un seul traducteur existe pour l'instant : le **simulé**. Il rend le son reçu, tel quel, et un
texte par seconde qui se dit lui-même simulé. Il n'appelle personne. Il sert à bâtir et à éprouver
le relais, le poste et l'écoute ; personne ne peut le prendre pour une traduction.

### Qui diffuse : un jeton signé par le serveur web

Le relais ne connaît ni comptes ni organisations. Le serveur web, qui les connaît, signe pour un
responsable connecté un jeton court : l'organisation, une échéance, et une signature HMAC-SHA-256
faite avec un secret que les deux programmes partagent, `JADWAL_LIVE_SECRET`.

Le jeton voyage dans le premier message de la liaison, jamais dans son adresse : une adresse finit
dans les journaux d'un mandataire. Un poste qui ne s'annonce pas en cinq secondes est décroché.
Faux, échu ou signé par un autre, le jeton reçoit le même refus.

Un poste qui se présente pour une organisation déjà en direct remplace l'ancien : c'est le même
responsable, revenu après une coupure.

### Qui écoute : tout le monde, sans compte ni cookie

Comme les pages publiques (ADR 0027). On écoute une organisation dans une langue. On peut arriver
avant le début : le direct commence sur la liaison déjà ouverte, et une reprise du poste ne
décroche personne. Qui arrive en cours de route ne reçoit rien de ce qui a déjà été dit.

Un appareil qui a plus de trois secondes de son en attente saute des morceaux : un direct en
retard ne sert à rien. Un appareil qui ne répond plus à la sonde des liaisons est décroché.

Une demande de navigateur venue d'une autre origine que celle du site est refusée.

### Un direct s'arrête seul

- passé la durée maximale (une heure par défaut) ;
- quand le poste n'envoie plus de son (trente secondes par défaut) ;
- quand la liaison du poste tombe ;
- quand le plafond du mois est atteint ;
- quand le poste envoie plus de son que le temps écoulé n'en permet, ou autre chose que du son ;
- quand le traducteur ne répond pas en quinze secondes, ou lâche ;
- quand le compteur du mois ne s'écrit plus.

### Le plafond se compte en temps facturé, pas en argent

Les services facturent le temps de son, par langue. Le relais compte donc les secondes de direct
fois le nombre de langues, par mois civil, pour toute l'instance, et s'arrête au plafond réglé en
minutes. Un prix écrit dans le code serait faux au premier changement de tarif.

Le compte du mois vit dans un fichier, pour survivre à un redémarrage. Ce fichier porte le mois et
un nombre, rien d'autre. Illisible, il arrête le programme au démarrage : le relais ne repart pas
de zéro en silence.

### Aucune trace

Ni le son ni le texte ne sont écrits, ni sur le disque ni dans le journal. Le relais ne les garde
pas non plus en mémoire : ils le traversent.

Le journal dit qu'un direct a commencé et fini, pour quelle organisation, dans quelles langues,
combien de temps, pourquoi il s'est arrêté, et combien de personnes écoutaient au plus. Il ne dit
l'adresse de personne, et ne recopie jamais un message d'erreur du service de traduction, qui
pourrait citer ce qu'il a entendu.

### Éteint sans réglage

Sans `JADWAL_LIVE_TRANSLATOR`, le programme dit que le direct est éteint et s'arrête : rien
n'écoute. Tout autre réglage manquant ou faux refuse le démarrage de même, avec le nom de la
variable.

## Conséquences

- Le secret partagé est un secret d'hébergement de plus. Qui le tient ouvre un direct au nom de
  n'importe quelle organisation, donc fait dépenser jusqu'au plafond du mois, et fait entendre ce
  qu'il veut à ceux qui écoutent. Il n'ouvre rien d'autre : ni la base, ni les comptes.
- Le plafond est celui de l'instance, pas d'une organisation. Avec plusieurs organisations, l'une
  peut consommer le mois des autres. À revoir quand une deuxième se servira du direct.
- Le compte s'écrit toutes les dix secondes. Un arrêt brutal du programme perd au plus dix
  secondes par langue ; le plafond peut être dépassé d'autant.
- Rien ne limite encore le nombre de liaisons d'une même adresse : quelques centaines de liaisons
  ouvertes par un seul programme prennent toutes les places d'écoute. La limite par adresse revient
  au mandataire, et l'épreuve de charge de l'étape 25 dira laquelle.
- Le relais est un seul processus : les directs et les liaisons vivent dans sa mémoire. Un
  redémarrage coupe le direct en cours ; le poste doit le rouvrir, ceux qui écoutent se
  rebranchent.
- La voix part chez un tiers dès qu'un vrai traducteur sera branché. La personne qui parle doit
  l'avoir accepté, et les conditions d'utilisation devront le dire avant la première mise en ligne
  du direct.
- Le traducteur simulé n'appelle personne : avec lui, la voix ne quitte pas le relais.

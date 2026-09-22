# ADR 0024 : Envoi de courriel par SMTP, sans fournisseur propriétaire

## Contexte

Le cadrage et l'ADR 0016 prévoyaient AWS SES pour l'envoi des courriels. L'étape 3 l'a implémenté :
`@aws-sdk/client-sesv2`, une région, une identité vérifiée, une sortie de bac à sable à demander.

Trois choses ont fait revenir sur ce choix. Le compte AWS est une dépendance d'exploitation à part
entière : une facturation, une console, des identifiants de longue durée, et une vérification
d'identité à refaire dans chaque région. Le paquet installe vingt-quatre dépendances pour envoyer un
message de quinze lignes. Et l'auto-hébergement, que le cadrage promet dès le départ (ADR 0008),
demanderait à une organisation d'ouvrir un compte AWS pour envoyer un lien de connexion.

## Décision

- **SMTP**, par `nodemailer` (MIT-0, zéro dépendance, Node ≥ 20). C'est le seul protocole que tous
  les hébergeurs parlent, donc le seul qui laisse changer de fournisseur sans changer une ligne de
  code. Un compte de messagerie ordinaire suffit — celui d'Infomaniak pour l'instance officielle.
- **L'interface à une seule méthode de l'étape 3 ne bouge pas.** C'est elle qui a permis de
  remplacer SES par SMTP sans toucher à une seule route : `Mailer.send(mail)`, deux implémentations,
  et l'application ne connaît ni l'une ni l'autre.
- **Le transport fichier reste le défaut.** `MAIL_TRANSPORT=file` écrit un fichier et n'expédie
  rien : une configuration oubliée ne part pas au hasard, elle ne part pas du tout.
- **Le port décide du chiffrement**, et c'est le seul réglage qu'on pourrait poser de travers : 465
  parle TLS d'emblée, 587 commence en clair et bascule par STARTTLS — que nous **exigeons** même
  quand le serveur ne l'annonce pas. Se tromper de port fait échouer la connexion, jamais partir un
  message en clair.
- **Robustesse** : délais bornés à l'établissement, à l'accueil et à l'inactivité ; réessai avec
  attente doublée sur une panne passagère ; **aucun** réessai sur un refus définitif.
  `nodemailer` porte le code SMTP dans `responseCode` : `4xx` est passager, `5xx` est définitif, et une
  erreur sans code n'a pas atteint le serveur — DNS, connexion, TLS —, ce qui est passager par
  nature.
- **Les traces ne portent jamais le message.** Le destinataire, le code, la commande SMTP en cause,
  et le mot « passager » ou « définitif ». Jamais le corps : un lien magique dans un fichier de
  traces vaut un mot de passe en clair.
- **Sortie de secours.** Le super-admin peut produire un lien de connexion à usage unique pour une
  adresse donnée, affiché à l'écran, à transmettre par un autre canal. Même durée de vie, même usage
  unique. Chaque production est inscrite au registre interne (ADR 0025). Le service reste utilisable
  même si le courriel tombe entièrement.

### Ce que SMTP demande en échange

Un serveur SMTP tiers n'est pas une API : il faut que le domaine autorise l'envoi, sans quoi les
messages arrivent en indésirable ou n'arrivent pas. Trois enregistrements DNS, documentés dans
`apps/web/README.md` : SPF, DKIM et DMARC.

**Nous ne faisons pas tourner notre propre serveur d'envoi.** Un MTA à soi demande une adresse IP à
la réputation propre, une surveillance des listes noires, des boucles de retour, et un travail
d'exploitation continu — pour un service qui envoie quelques dizaines de messages par jour. Le
fournisseur s'en charge ; nous gardons la liberté d'en changer.

## Conséquences

- Plus aucune trace d'AWS dans le dépôt : ni dépendance, ni variable, ni code, ni documentation.
- Vingt-quatre paquets en moins, un paquet sans dépendance en plus.
- L'auto-hébergement n'exige plus qu'un compte de messagerie, ce que toute organisation a déjà.
- Le mot de passe SMTP est un secret d'exploitation de plus. Il ne donne accès qu'à l'envoi, jamais
  à la base.
- Les tests n'envoient rien : le transport de production est appelé contre un transporteur factice,
  et c'est le fichier qui sert partout ailleurs.
- Un test relit les réglages tels que `nodemailer` les reçoit — hôte, port, `secure`, `requireTLS`,
  délais — parce que c'est la seule façon de prouver qu'un port 587 exige bien STARTTLS.

## Statut

Accepté, 2026-09-20. Étape 4 de la feuille de route. **Corrige l'ADR 0016** et le cadrage sur un
point : les courriels partent par SMTP, pas par AWS SES.

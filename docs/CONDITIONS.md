# Conditions d'utilisation

Ce texte s'adresse aux organisations qui publient leur programme avec ce service, et aux personnes
de leur équipe. Il est écrit pour être lu : chaque phrase dit ce que le service fait vraiment.

Dernière mise à jour : 19.10.2026.

## Qui exploite le service

Le service est exploité par <!-- exploitant -->Voltia<!-- /exploitant -->, en Suisse, responsable
du traitement au sens de la loi fédérale sur la protection des données (nLPD).

Pour toute question ou demande : **contact@voltia.ch**.

## Ce que le service conserve

Le programme que vous publiez, et le strict nécessaire pour vous laisser y accéder.

### Ce qui est public, parce que c'est le but

**Le programme de vos cours** : titres, descriptions, horaires, salles, intervenants. Ces données
sont destinées à être publiques.

Le nom d'un intervenant est une donnée personnelle, et c'est vous qui décidez de l'écrire. Voyez
plus bas, « Ce que vous acceptez ».

### Les données personnelles, la liste complète

1. **L'adresse électronique des personnes de votre équipe**, responsables ou éditeurs, leur nom si
   le service le connaît, et la langue qu'elles ont choisie pour l'espace. C'est la seule identité
   que le service demande : il n'y a pas de mot de passe, et donc rien d'autre à retenir de vous.
2. **Le lien entre une personne et votre organisation** : qui est responsable de quoi. Le service ne
   peut pas fonctionner sans, puisque c'est lui qui décide qui voit quoi. Le programme garde aussi
   qui a modifié un cours en dernier, et qui a annulé ou déplacé une séance ou posé une pause ; ce
   lien part avec le compte de la personne. Appartenir à l'équipe d'une organisation religieuse peut
   révéler une conviction : ce lien n'est montré qu'aux personnes de votre organisation et à
   l'exploitant, jamais sur votre page publique.
3. **L'adresse électronique d'une personne invitée**, même si cette personne n'ouvre jamais de
   compte, avec qui l'a invitée et qui a accepté l'invitation. L'invitation est effacée 90 jours
   après sa fin. Son envoi est aussi écrit au journal des modifications, avec l'adresse et le rôle
   proposé, et il y reste la durée du journal.
4. **Un journal des modifications** : qui a changé quoi, et quand. Il sert à comprendre ce qui s'est
   passé et à répondre en cas de contestation. Il n'est pas affiché dans votre espace : sa copie
   fait partie de ce que vous pouvez demander.
5. **Les sessions de connexion** : quel compte, depuis quand, jusqu'à quand, et la dernière
   organisation choisie quand la personne en a plusieurs. C'est ce qui vous garde connecté d'une
   page à l'autre.
6. **Les liens de connexion en attente** : l'adresse à laquelle le lien est parti, tant qu'il court.
   Le lien lui-même n'est pas conservé en clair.
7. **Les passkeys de l'exploitant.** Seuls ses comptes peuvent en enregistrer une : elles protègent
   son accès à vos données (voir plus bas). Le service garde pour chacune un nom, fait du système de
   l'appareil et de la date, sa clé publique, son identifiant, un compteur d'usage, le type
   d'appareil, le fait qu'elle soit copiée ailleurs que sur cet appareil, les moyens par lesquels
   elle se présente, l'identifiant du modèle d'authentificateur, et la date d'enregistrement.

   **Ce qui est vrai de toutes** : le service ne reçoit jamais le secret de la passkey, ni une
   empreinte digitale, ni un visage. Une passkey **synchronisée** est en revanche recopiée par son
   trousseau sur les autres appareils de son titulaire : cela se passe entre lui et le fabricant de
   son appareil, et le service ne fait qu'en enregistrer le fait.

8. **Une empreinte de l'adresse IP ou de l'adresse électronique**, le temps de compter les demandes
   trop nombreuses. Voir plus bas.
9. **Les traces d'accès de l'exploitant** : quand il a regardé les données d'une organisation,
   laquelle, et quelle page. Voir « L'accès de l'exploitant à vos données ».
10. **L'acceptation de ces conditions** : qui les a acceptées, quelle version du texte, et quand.
    Voir « Comment ce texte est accepté ».

Le service n'utilise **aucun cookie de mesure d'audience**, ne fait **aucun suivi publicitaire** et
ne transmet vos données à **aucun tiers** à des fins commerciales. Les visiteurs de votre page
publique ne sont pas identifiés et ne s'inscrivent à rien.

### Ce qu'une session ouverte ne retient pas

Une session ouverte ne retient **ni l'adresse IP ni le navigateur** de la personne connectée.

### Les cookies

Le service pose quatre cookies, tous nécessaires à ce que vous lui demandez, et aucun autre :

- **La session**, quand vous vous connectez : c'est elle qui porte votre connexion, trente jours au
  plus sans revenir.
- **La langue**, quand vous en choisissez une : un an.
- **La langue choisie avant la connexion**, le temps de la reporter sur votre compte : retirée à la
  connexion, un an au plus.
- **Le défi d'une passkey**, pour l'exploitant seulement : cinq minutes.

Un visiteur de votre page publique qui ne choisit pas de langue n'en reçoit aucun.

### Le journal technique du serveur

Le serveur tient un journal des requêtes qu'il a servies. Il sert à réparer une panne et à repérer
un abus. L'adresse du visiteur y est **tronquée avant d'être écrite**, au point de ne plus désigner
personne : le dernier nombre d'une adresse IPv4 est effacé, et tout ce qui suit les trois premiers
groupes d'une adresse IPv6. Le journal garde le navigateur, tel qu'il se présente ; la page d'où
vient le visiteur n'y figure pas, et un lien de connexion y est masqué. Aucune ligne n'est gardée
plus de **quatorze jours**.

Les messages d'erreur de l'application sont gardés à part, en quantité bornée, et ne servent qu'à
réparer. Un courriel refusé n'y laisse que le domaine de l'adresse, jamais l'adresse entière.

### Le compteur de consultations

Votre espace affiche le nombre de consultations de votre programme sur sept et trente jours,
réparties entre votre page publique, le widget posé sur votre site, et les abonnements agenda.

Ce compteur est un nombre, et c'est tout ce qu'il est. Le service conserve, par jour et par type,
**votre organisation, la date, le type et un nombre**. Il ne conserve ni adresse IP, ni cookie, ni
page d'où vient le visiteur, ni identifiant, ni heure de la consultation. Il ne peut donc pas dire
qui a lu votre programme, ni d'où, ni quand dans la journée, et nous non plus.

Trois précisions honnêtes :

- **Les nombres sont un minimum.** Une page relue quelques minutes plus tard, ou servie par le cache
  d'un navigateur ou d'un opérateur, ne nous parvient pas. Ne les comparez pas aux chiffres d'un
  outil de mesure d'audience classique : les nôtres seront plus bas.
- **Les robots connus ne sont pas comptés**, mais la liste est courte et certains passent.
- **Les abonnements agenda comptent des relevés, pas des personnes.** Un agenda se met à jour tout
  seul, plusieurs fois par jour.

Votre espace signale aussi quand le widget, qui était consulté, ne l'est plus depuis sept jours.
Cette mention ne peut pas distinguer un widget cassé d'un widget retiré volontairement : le service
ne sait pas sur quelle page vous l'avez collé, puisqu'il ne conserve pas la provenance.

## Combien de temps

| Ce qui est conservé                            | Durée                                                  | Comment il est effacé             |
| ---------------------------------------------- | ------------------------------------------------------ | --------------------------------- |
| Le programme de vos cours                      | tant que votre organisation utilise le service         | vous l'effacez vous-même          |
| L'acceptation de ces conditions                | tant que la personne fait partie de votre organisation | règle de la base, avec l'adhésion |
| Le journal des modifications                   | 24 mois, puis effacé automatiquement                   | règle de la base, chaque nuit     |
| Le compteur de consultations                   | 25 mois, puis effacé automatiquement                   | règle de la base, chaque nuit     |
| Une invitation qui n'est plus en cours         | 90 jours après sa fin, puis effacée automatiquement    | procédure de la base, chaque nuit |
| Un compte sans organisation ni session ouverte | effacé dès qu'il a plus de 12 mois                     | procédure de la base, chaque nuit |
| Une session de connexion                       | 30 jours sans usage, puis effacée automatiquement      | règle de la base, chaque nuit     |
| Un lien de connexion non utilisé               | 15 minutes, puis effacé automatiquement                | règle de la base, chaque nuit     |
| L'empreinte du compteur de demandes            | un à deux jours, puis effacée automatiquement          | règle de la base, chaque nuit     |
| Les traces d'accès internes de l'exploitant    | 24 mois, puis effacées automatiquement                 | règle de la base, chaque nuit     |
| Le journal technique du serveur                | 14 jours au plus, puis effacé automatiquement          | fichier découpé chaque nuit       |

**Une session en usage se prolonge.** Les trente jours comptent depuis la dernière fois qu'elle a
servi : tant que vous revenez, elle ne se ferme pas. Un mois sans revenir, et elle part.

Ces durées ne sont pas des intentions. Là où la troisième colonne dit « règle de la base »,
l'effacement est porté par une **règle de la base de données** : elle dit ce qui a le droit de
partir. Là où elle dit « procédure de la base », la durée est écrite dans la procédure que la base
exécute. Là où la colonne ajoute « chaque nuit », une tâche passe chaque nuit pour emporter ce qui a
dépassé sa durée. L'acceptation de ces conditions, elle, n'attend pas la nuit : la base de données
l'efface en même temps que l'adhésion, quand la personne quitte l'organisation ou en est retirée,
quand son compte est supprimé ou quand l'organisation est supprimée. Le journal technique du
serveur, lui, n'est pas dans la base : c'est un fichier, qu'un script découpe chaque nuit et dont il
ne garde aucune ligne plus de quatorze jours.

Une seule exception, et elle se voit : si votre organisation conteste un accès, l'exploitant peut
poser un verrou qui suspend l'effacement du journal des modifications et de ses propres traces, le
temps que la contestation se règle. Tant que ce verrou est posé, votre organisation ne peut pas non
plus être supprimée : elle emporterait avec elle ce que le verrou garde.

## L'accès de l'exploitant à vos données

**L'exploitant peut accéder aux données de votre organisation, les lire et les modifier**, pour
l'assistance et la maintenance du service. C'est ce qui permet de réparer une saisie ou de corriger
une erreur sans vous demander de tout recopier.

Trois précisions, parce qu'elles comptent :

- **Ses modifications sont écrites dans le journal des modifications** de votre organisation, avec
  la date, ce qui a changé et son identité, exactement comme celles d'une personne de votre équipe.
  La copie du journal que vous pouvez demander les montre.
- **Ses consultations n'y sont pas écrites.** Si l'exploitant regarde vos données sans rien changer,
  rien ne vous le signale. Elles sont notées dans un registre interne que l'exploitant conserve
  24 mois, et qui sert à répondre en cas de contestation.
- **L'accès est protégé par une passkey.** Ces droits ne s'ouvrent que dans une session ouverte avec
  une passkey enregistrée sur un appareil de l'exploitant : un lien reçu par courriel n'y suffit
  jamais. La session qui porte ces droits dure au plus douze heures.

Si cette possibilité d'accès vous pose un problème, dites-le avant d'ouvrir votre organisation :
sans elle, l'assistance n'est pas possible.

## Ce que vous pouvez demander

Écrivez à **contact@voltia.ch** ; la réponse arrive sous trente jours.

Chaque personne peut demander :

- **Une copie des données qui la concernent.**
- **La correction** d'une donnée inexacte. La langue se change aussi depuis l'espace.
- **La suppression de son compte.** Elle peut aussi quitter elle-même chacune de ses organisations,
  depuis « Vos organisations » : un compte sans organisation est ensuite effacé de lui-même (voir le
  tableau). Une organisation garde toujours au moins une personne responsable : la dernière ne peut
  pas partir sans en nommer une autre.

Votre organisation peut demander :

- **Une copie de ses données**, journal des modifications compris.
- **Le retrait d'une personne**, que les responsables font aussi depuis l'écran des membres.
- **La suppression de votre organisation.** Elle efface le programme, les salles, les réglages, les
  adhésions, les acceptations de ces conditions, les invitations, le compteur de consultations et le
  journal des modifications. Les traces d'accès de l'exploitant gardent leur durée de 24 mois. Une
  suppression est définitive : nous n'avons pas de corbeille. Les sauvegardes chiffrées déjà
  parties, elles, ne se réécrivent pas. Voir plus bas : **182 jours au plus**.

Si vous estimez que nous traitons mal vos données, vous pouvez aussi vous adresser au Préposé
fédéral à la protection des données et à la transparence (PFPDT).

## Comment ce texte est accepté

Chaque personne qui a accès à l'espace de votre organisation, responsable ou éditeur, doit accepter
ce texte pour y entrer. Le service le lui montre en entier, et elle l'accepte d'un clic sur le
bouton « J'accepte les conditions d'utilisation ». Une personne responsable l'accepte aussi pour
votre organisation.

Le service garde qui a accepté, quelle version du texte et quand. La version est la date de la
dernière mise à jour, écrite en tête de ce texte. Le moment est noté par la base de données, pas par
l'application. Quand le texte change, il change de version, et le service demande à nouveau
l'accord de chacun avant de le laisser entrer.

Cette acceptation est conservée tant que la personne fait partie de votre organisation, et effacée
avec son adhésion. L'exploitant n'y est pas soumis : c'est lui qui propose ce texte.

## Ce que vous acceptez

- Que le programme que vous publiez soit **public** : page, widget, flux agenda.
- De ne publier des données personnelles d'autres personnes dans les champs libres, comme le nom
  d'un intervenant, **qu'avec leur accord**. Ces données, c'est votre organisation qui décide de les
  publier, et qui en répond.
- Que le service soit fourni **sans garantie de disponibilité**. Il est gratuit et tenu par une
  seule personne : une interruption reste possible, et une perte de données aussi, que les
  sauvegardes limitent.

## Ce dont nous répondons, et le droit applicable

Nous répondons des dommages que nous causons intentionnellement ou par une négligence grave. Pour le
reste, et autant que la loi le permet, nous n'en répondons pas : le service est gratuit. Ce texte
est soumis au droit suisse.

## Ce que nous ne faisons pas

- Nous ne vendons rien, nous ne louons rien, nous ne profilons personne.
- Nous n'inscrivons personne à un cours : le service ne collecte aucune donnée sur les participants.
  Savoir qui suit quel cours peut révéler une conviction, un état de santé ou une situation
  familiale, c'est-à-dire une donnée sensible au sens de la nLPD. C'est pour cela que l'inscription
  n'existe pas ici.
- Nous n'interrogeons aucun service tiers avec vos données. Les heures de prière, quand une
  organisation active ce module, viennent du calendrier qu'elle importe, de ce qu'elle saisit à la
  main, ou d'un calcul fait sur notre serveur à partir de la position qu'elle indique elle-même. Il
  n'y a aucun service de localisation derrière le champ de position.
- Nous ne conservons pas l'adresse IP complète des visiteurs. Le service compte les demandes trop
  nombreuses pour se protéger d'un abus, mais ce compteur ne retient qu'une empreinte calculée avec
  une clé secrète, effacée au bout d'un à deux jours. Sans cette clé, l'empreinte ne rend pas
  l'adresse ; avec elle, et il faut un accès au serveur pour l'avoir, une adresse IPv4 pourrait être
  retrouvée en les essayant toutes. C'est une pseudonymisation, pas un anonymat.

## Où sont vos données, et qui y touche

Trois sous-traitants, et rien d'autre. La loi demande de dire qui ils sont, ce qu'ils font, et dans
quel pays : les voici, et il n'y a rien de plus.

| Sous-traitant                           | Ce qu'il fait                                                         | Où sont les données |
| --------------------------------------- | --------------------------------------------------------------------- | ------------------- |
| Hetzner Online GmbH (société allemande) | Héberge le serveur qui fait tourner le service, et sa base de données | Finlande            |
| Cloudflare, Inc. (société américaine)   | Conserve les sauvegardes, chiffrées                                   | Union européenne    |
| Infomaniak Network SA (société suisse)  | Envoie les courriels du service                                       | Suisse              |

La Finlande est membre de l'Union européenne. Elle figure à ce titre sur la liste des États dont la
Suisse reconnaît que la législation assure une protection adéquate des données (annexe 1 de
l'ordonnance sur la protection des données).

**Cloudflare, Inc. est une société américaine.** Les sauvegardes lui sont confiées dans sa
juridiction « Union européenne », qui garde les fichiers sur des sites de l'Union et ne les réplique
pas ailleurs. Nous le disons parce que la société et le lieu de stockage ne sont pas dans le même
pays, et que vous avez le droit de le savoir sans avoir à le chercher.

**Les sauvegardes sont chiffrées sur le serveur, avant de le quitter.** La clé qui permet de les lire
**n'est jamais conservée sur ce serveur**, et n'est jamais chez celui qui les garde : Cloudflare
détient des fichiers qu'il ne peut pas ouvrir, et personne chez lui ne peut en lire une ligne, quelle
que soit la loi qu'on lui oppose.

La nuance compte, et la voici : pour vérifier qu'une sauvegarde se relit vraiment, l'exploitant
envoie la clé au serveur le temps d'un essai, où elle ne passe qu'en mémoire. Elle n'est écrite
nulle part, et elle repart avec le processus.

**Ce que vous effacez reste au plus 182 jours dans ces sauvegardes.** Une suppression est immédiate
dans le service ; dans les sauvegardes déjà parties, elle est différée, parce qu'elles ne se
réécrivent pas, et c'est ce qui fait leur valeur le jour d'un incident. Elles ne servent qu'à
remettre le service en état. Passé 182 jours, aucune sauvegarde ne contient plus vos données
effacées.

Le code du service est ouvert et peut être auto-hébergé : rien n'oblige une organisation à dépendre
de cette instance.

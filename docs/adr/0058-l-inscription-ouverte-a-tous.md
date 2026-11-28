# 0058 : l'inscription ouverte à tous

- Statut : accepté
- Date : 2026-11-28
- Remplace en partie : [0049](0049-service-gratuit-acces-donne-par-le-super-admin.md) (« La création
  de compte est fermée aux adresses que personne n'attend »)
- Complète : [0016](0016-better-auth-liens-magiques-pas-de-mot-de-passe.md),
  [0017](0017-invitation-sans-fuite-d-information.md),
  [0025](0025-super-admin-pouvoirs-complets.md), [0056](0056-le-poste-diffuser.md)

## Contexte

Depuis l'étape 22 (ADR 0049), un lien de connexion ne partait qu'à une adresse qu'un compte portait
ou qu'une invitation en attente attendait. Toute autre adresse recevait, à la place, un courriel
« aucun compte » qui renvoyait vers la demande d'accès.

Le chef de projet a décidé autrement le 27 novembre 2026, pour l'application de la mosquée : tout le
monde peut créer un compte, ou ne pas en créer ; un compte ne sert qu'à recevoir des accès
particuliers, que donnent la personne responsable d'une mosquée ou le super-admin. Écouter le direct
et consulter le programme restent sans compte.

En relisant le code avant d'ouvrir la porte, un trou est apparu. La limitation par adresse IP de
Better Auth (1.7.13) vit dans le routeur de ses requêtes HTTP ; l'action du formulaire `/connexion`
appelle son API serveur, qui ne passe pas par là. Le formulaire n'avait donc qu'une borne, trois
liens par heure **par adresse électronique** : une seule machine pouvait faire écrire le service à
autant d'adresses qu'elle en inventait. C'était vrai avant cette décision (le courriel « aucun
compte » partait à n'importe quelle adresse) ; un lien qui ouvre un compte le rend plus tentant.
Un test le montre : vingt et une demandes depuis la même adresse IP, en moins d'une seconde,
recevaient toutes leur courriel.

## Décision

### Toute adresse reçoit son lien, et l'ouvrir crée le compte

Le courriel « aucun compte » disparaît. L'adresse inconnue reçoit le même lien qu'un compte, mot
pour mot, et son ouverture crée un compte rattaché à rien. La réponse de l'écran, ses cookies et
le nombre d'envois restent les mêmes pour une adresse connue et une inconnue (ADR 0017).

**Un compte sans organisation ne voit rien de plus qu'un visiteur.** Il n'a aucune adhésion, donc
la base ne lui montre aucune ligne d'aucune organisation. Aucun écran de l'espace ne s'ouvre : tous
renvoient vers « Vos organisations », qui dit les deux chemins, se faire inviter par la personne
responsable d'une organisation, ou demander l'accès pour en ouvrir une. Il n'accepte aucune
condition : on les accepte en entrant dans l'espace d'une organisation (ADR 0044).

### Les bornes des liens de connexion

| Borne                                         | Où                                                                                             | Au-delà                                                      |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 20 demandes par heure et par adresse IP       | formulaire `/connexion` (seau à nous) et `/api/auth/sign-in/magic-link` (règle de Better Auth) | `429`, « trop de demandes depuis votre connexion »           |
| 3 liens par heure et par adresse électronique | envoi                                                                                          | rien ne part, réponse inchangée                              |
| 10 liens par heure depuis une adresse IP      | envoi                                                                                          | plus aucun compte ne s'ouvre depuis elle ; réponse inchangée |
| 60 liens par heure pour tout le service       | envoi                                                                                          | plus aucun compte ne s'ouvre ; réponse inchangée             |

- **La première se dit**, parce qu'elle ne parle que de la connexion d'où l'on écrit, jamais de
  l'adresse saisie ; elle passe avant toute lecture de la base au sujet de l'adresse.
- **Les deux dernières comptent chaque lien, connu ou non, et ne retiennent que l'ouverture d'un
  compte.** Une adresse qu'un compte porte, ou qu'une invitation en attente attend
  (`jadwal.may_sign_in`, migration 0077), reçoit toujours son lien. Ainsi les deux branches font
  les mêmes écritures, et un flot d'inscriptions ne ferme la porte à personne qui a déjà un compte.
  Le seau du service n'est entamé que si celui de l'adresse IP accorde : une seule machine ne le
  vide pas.
- Toutes vivent dans la table de limitation existante, sous des clés condensées, purgées à un jour
  (ADR 0009, ADR 0032). L'adresse IP est celle que résout l'adaptateur.

`jadwal.may_sign_in` garde son nom, et change de sens : non plus « peut se connecter », mais « le
lien n'ouvre pas de compte ». Renommer une fonction demandait une migration pour rien.

### L'invitation et la demande d'accès restent

L'invitation reste le seul chemin pour entrer dans une organisation, et la demande d'accès le seul
pour en ouvrir une. Le lien de secours du super-admin passe toujours avant toutes les bornes.

### La vue du super-admin sur les comptes

Le super-admin gère toutes les mosquées et tous les comptes. Un écran à part,
`/super-admin/comptes`, lié depuis la console, montre chaque compte : adresse, nom, date
d'ouverture, super-admin ou non, et chacune de ses organisations avec son rôle et l'autorisation de
diffuser d'un éditeur ; un compte sans organisation est dit tel. L'écran ne change rien : pour agir
dans une organisation, il y entre, par l'action de la console, proposée sur chaque ligne.

Il lisait déjà tous les comptes et toutes les organisations, mais les adhésions de la seule
organisation où il est entré (migration 0033). **Cette politique ne change pas** : élargie, elle
ferait voir à l'écran Membres, s'il oubliait un jour son filtre, les membres de toutes les
organisations. Les adhésions sortent par une fonction, `jadwal.all_memberships()` (migration
0086), à droits du définisseur, exécutable par le seul rôle du super-admin, qui ne rend que le
compte, l'organisation, le rôle et l'autorisation. Chaque ouverture de l'écran est inscrite au
registre des accès de l'exploitant, comme toute requête d'un super-admin en exercice.

### Le super-admin supprime un compte

À la question posée en fin de chantier, le chef de projet a répondu le 28 novembre 2026 : « le
super admin doit pouvoir tout faire ». Chaque ligne de l'écran des comptes porte donc « Supprimer
le compte », sauf celles des comptes de l'exploitant. Le premier envoi montre l'adresse, les
organisations du compte et ce qui part avec lui ; le second, confirmé, supprime. Sans JavaScript
comme avec.

- **Une fonction, pas un droit** : le rôle du super-admin n'a toujours aucun droit de suppression
  sur les comptes. `jadwal.delete_account(uuid)` (migration 0087), à droits du définisseur et
  exécutable par lui seul, supprime un compte à la fois et dit ce qui s'est passé : supprimé,
  introuvable, compte de l'exploitant, ou dernière personne responsable d'une organisation.
- **Ce qui part avec le compte** : ses sessions, ses passkeys, ses comptes de connexion et ses
  adhésions, donc ses acceptations des conditions, par les clés étrangères. Ce qu'il a signé dans
  un programme reste, sans son nom.
- **Deux refus.** Un compte de l'exploitant ne se supprime pas d'un écran, pas plus qu'il ne s'y
  ouvre (étape 11) : le sien compris, sans quoi il fermerait sa propre porte. Et une organisation
  garde toujours au moins une personne responsable (migration 0012) : l'écran nomme celles dont le
  compte est la dernière, et le super-admin en nomme une autre avant de revenir. Le déclencheur de
  la base reste le dernier rempart.
- **Le journal** de chaque organisation du compte reçoit, dans la même transaction, une entrée
  `account.delete` signée du super-admin, avec l'adresse, le rôle et l'autorisation de diffuser :
  le compte ne sera plus là pour le dire. Si la base refuse, rien n'est écrit.

## Conséquences

- N'importe qui peut ouvrir un compte. Il n'en tire rien d'autre que ce qu'un visiteur a déjà ; la
  table des comptes grandit, et la purge de nuit emporte un compte sans organisation ni session au
  bout de douze mois (`purge_orphan_accounts`, inchangée).
- Un flot d'inscriptions peut fermer l'ouverture des comptes pour une heure, pour tout le service.
  C'est le prix d'un plafond : sans lui, le service écrirait à qui l'on veut, en son nom. Les comptes
  existants ne sont pas touchés.
- Le formulaire de connexion répond `429` au-delà de vingt demandes par heure depuis une même
  adresse IP. Un réseau partagé (le Wi-Fi d'une mosquée) le partage aussi ; un compte n'y sert
  qu'aux responsables, qui sont peu.
- Les conditions d'utilisation changent de version (28 novembre 2026) : l'inscription ouverte, ce
  que garde un compte sans organisation, les bornes. Chacun les accepte de nouveau.

## Ce qui n'est pas fait

- **Aucune suppression d'une organisation** depuis l'écran : elle reste une demande à l'adresse de
  contact, faite par le propriétaire de la base.
- **Aucune recherche ni pagination** dans la liste des comptes : il y en a peu. À ajouter quand la
  liste deviendra longue.
- **Aucune vérification « humaine »** (énigme, case à cocher) : les bornes suffisent tant que le
  service ne gagne rien à ouvrir des comptes en masse, et une énigme exclurait des personnes.

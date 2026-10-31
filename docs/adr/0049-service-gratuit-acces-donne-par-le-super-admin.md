# 0049 : un service gratuit, un accès que donne le super-admin

- Statut : accepté
- Date : 2026-10-31
- Complète : [0016](0016-better-auth-liens-magiques-pas-de-mot-de-passe.md),
  [0017](0017-invitation-sans-fuite-d-information.md),
  [0025](0025-super-admin-pouvoirs-complets.md), [0044](0044-acceptation-des-conditions.md)

## Contexte

Jusqu'à l'étape 21, deux choses restaient floues.

**Le prix.** Le modèle prévoyait depuis l'étape 0 un plan par organisation : gratuit, offert ou
payant. La console le faisait choisir, la base le gardait (`organization.plan`), et rien ne le
lisait : un plan ne changeait rien à ce qu'une organisation pouvait faire. L'étape 21 avait inscrit
les plans dans la feuille de route, pour plus tard.

**L'entrée.** N'importe qui pouvait demander un lien de connexion, pour n'importe quelle adresse de
forme acceptable, et l'ouvrir créait un compte rattaché à rien. Ce compte ne voyait aucune
organisation, et « Vos organisations » le renvoyait vers une invitation qu'il n'avait pas. Seul le
super-admin créait une organisation ; pour y faire entrer sa personne responsable, il entrait dans
son espace, puis l'invitait depuis l'écran Membres. Rien, sur le site, ne disait comment une
organisation pouvait demander à utiliser le service.

Le chef de projet a tranché le 20.10.2026.

## Décision

### Le service est gratuit, et il n'y a pas de plan

jadwal est entièrement gratuit, pour toutes les organisations, pour l'instant. Les plans
disparaissent du code, de la base et de la feuille de route : la colonne `organization.plan` et sa
contrainte partent (migration 0076, qui vérifie son propre résultat), avec l'action et le champ de
la console, leurs textes en cinq langues et le type de journal `organization.plan`, qu'aucune
écriture n'employait. Les anciennes entrées du journal restent telles quelles. La mention
« Proposé gratuitement par jadwal », sous le widget et sur la page publique, reste : elle est vraie.

Si cela devait changer, ce serait une décision nouvelle, avec son ADR, et une nouvelle version des
conditions d'utilisation, que chacun accepterait de nouveau (ADR 0044).

### C'est le super-admin qui donne l'accès

**Une organisation demande l'accès** par la page publique `/demande-d-acces`, en cinq langues, sans
JavaScript comme avec : le nom de l'organisation, sa localité, le nom et l'adresse électronique de
la personne qui demande, un message facultatif, et ce que deviennent ces données. Les liens y
mènent depuis `/connexion`, depuis « Vos organisations » quand le compte n'en a aucune, et depuis
le courriel « aucun compte » (plus bas).

- **Une table, une seule porte d'écriture.** La table `access_request` (migration 0078) n'est
  accessible à aucun rôle de l'application. Le rôle public écrit par une seule fonction,
  `jadwal.request_access(...)`, à droits du définisseur (migration 0079), comme le compteur de
  vues. Elle rend `recorded`, `duplicate` (une demande attend déjà pour cette adresse, casse
  ignorée : rien n'est écrit) ou `full` (trente demandes en vingt-quatre heures pour tout le
  service : rien n'est écrit), sous un verrou consultatif pour que deux demandes simultanées ne
  franchissent pas le plafond ensemble.
- **La page ne dit rien de personne.** `recorded` et `duplicate` rendent la même page, mot pour mot.
  Avant la base, chaque demande de forme acceptable consomme un jeton d'un budget par adresse IP,
  trois par heure, dans la table de limitation existante, sous une clé condensée (ADR 0009). La
  limite par adresse IP et le plafond du service rendent la même réponse, `429`, « trop de
  demandes » : elle ne parle que du service.
- **Le formulaire n'écrit à personne.** Aucun courriel ne part à l'adresse saisie : sans cela, le
  formulaire servirait à écrire à n'importe qui en notre nom. Un courriel n'y part que si la
  demande est acceptée, et c'est l'invitation. L'exploitant peut être averti qu'une demande attend,
  à l'adresse de `JADWAL_DEMANDES_COURRIEL`, facultative ; cet avis ne porte rien de la demande, que
  le lien de la console.
- **Une purge, portée par une politique** : une demande résolue est effacée quatre-vingt-dix jours
  après sa réponse, une demande restée sans réponse douze mois après son dépôt
  (`jadwal.purge_access_requests()`, lancée chaque nuit par `scripts/purge.mjs`).

**Le super-admin répond depuis sa console.** Les demandes en attente s'affichent en tête, de la plus
ancienne à la plus récente, avec tout ce qu'elles disent. Il les lit sans organisation en contexte,
et ne peut que les résoudre : passer une demande en attente à `accepted` ou `refused`, avec une
date de réponse que la base exige égale à `now()` (migrations 0080 et 0081, droits de colonne sur
l'état et cette date seulement). Ni insertion, ni suppression, ni retour en attente.

- **Accepter**, c'est créer : « Créer l'organisation » remplit le formulaire de création avec la
  demande (nom, adresse proposée, adresse et langue de la personne qui demande). À la création, une
  seule transaction marque la demande acceptée, sans contexte, puis pose celui de l'organisation
  nouvelle (`setOrgContext`) et crée l'organisation et l'invitation. Une demande qui n'attend plus
  annule tout.
- **Refuser** ne part pas par courriel : la personne n'est pas prévenue. Un refus annoncé serait un
  courriel que le formulaire déclenche, à une adresse que personne n'a vérifiée.

**À la création d'une organisation, le super-admin peut inviter sa personne responsable dans le
même geste**, ou plus tard, depuis la liste des organisations, sans entrer dans son espace. Les deux
passent par le même chemin que l'écran Membres (`apps/web/src/lib/server/invitations.ts`) : rôle
`org_admin`, quatorze jours, journal de l'organisation, et une réponse qui ne dépend jamais de
l'existence d'un compte (ADR 0017).

### La création de compte est fermée aux adresses que personne n'attend

Le lien de connexion ne part qu'à une adresse qu'un compte porte, ou qu'une invitation en attente et
non échue attend. La base répond, et rien d'autre ne sort d'elle : `jadwal.may_sign_in(text)`
(migration 0077), à droits du définisseur, exécutable par le seul rôle de connexion, rend oui ou
non. Le rôle de connexion ne lit toujours aucune invitation.

Toute autre adresse reçoit, à la place du lien, un courriel dans la langue de l'écran : aucun compte
n'est ouvert à cette adresse et aucune invitation ne l'attend ; pour utiliser jadwal, demandez
l'accès, avec le lien du formulaire ; si votre organisation utilise déjà jadwal, demandez à sa
personne responsable de vous inviter.

**Ce que la porte change à l'ADR 0017.** La demande d'un lien consulte désormais la base au sujet
de l'adresse. Ce qui ne change pas : **l'écran ne le dit à personne**. La porte passe après le
budget par adresse, et les deux branches font la même chose, une lecture et un courriel : la
réponse, ses cookies et le nombre d'envois sont les mêmes pour une adresse connue et une adresse
inconnue (test). Seule la boîte de l'adresse apprend s'il y a un compte, et c'est la seule à qui
cela revient. Un appel direct à `/api/auth/sign-in/magic-link` passe par la même porte.

**Le lien de secours garde son pouvoir.** Le lien que le super-admin produit dans sa console, quand
le courriel ne part plus, est capturé avant la porte : il ouvre un compte à une adresse qui n'en a
pas. C'est le super-admin qui donne l'accès ; c'est aussi lui qui dépanne.

## Conséquences

- Une organisation ne peut plus s'ouvrir seule un compte pour « voir » : elle demande, et attend. Le
  formulaire le dit, et la réponse arrive par l'invitation.
- Le compte sans organisation devient rare : il ne naît plus que d'une invitation, avant qu'elle
  soit acceptée ou après un départ, ou du lien de secours. Sa purge à douze mois reste.
- Better Auth range le jeton avant d'appeler l'envoi, donc aussi pour une adresse que personne
  n'attend. Ce jeton ne part jamais : il échoit au bout de quinze minutes, et la purge de nuit
  l'emporte. Les conditions d'utilisation le disent.
- Un tiers peut remplir le formulaire au nom d'une autre personne. Il n'en tire rien : aucun
  courriel ne part, l'invitation n'arrive qu'à l'acceptation, et c'est la personne invitée qui
  accepte, connectée à sa propre boîte.
- La console gagne une section, et le super-admin un devoir : répondre. Une demande oubliée part
  d'elle-même au bout de douze mois.
- Les conditions d'utilisation changent de version (31.10.2026) : les demandes d'accès, leurs
  données et leurs durées, l'entrée sur invitation, le service gratuit et sans plan. Chacun les
  accepte de nouveau.

## Ce qui n'est pas fait

- **Aucun courriel de refus**, ni d'accusé de réception à l'adresse saisie (plus haut).
- **Aucune file d'attente visible du demandeur** : il ne sait pas où en est sa demande. Une seconde
  demande pour la même adresse, tant que la première attend, reçoit la même page et n'écrit rien.
- **Aucun effacement d'une demande depuis la console.** La purge et le propriétaire de la base le
  font ; une demande d'effacement passe par l'adresse de contact des conditions.
- **Aucun plan à venir n'est préparé** : ni colonne, ni drapeau, ni écran.

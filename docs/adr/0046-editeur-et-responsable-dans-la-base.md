# ADR 0046 : l'éditeur et le responsable, séparés dans la base

- Statut : accepté
- Date : 2026-09-26
- Complète : [0006](0006-connexion-et-roles.md), [0013](0013-isolation-par-rls-et-contexte-par-transaction.md),
  [0017](0017-invitation-sans-fuite-d-information.md), [0025](0025-super-admin-pouvoirs-complets.md)
- Lève la « Limite du rôle » de l'ADR 0017.

## Contexte

Une organisation a deux rôles (ADR 0006) : la personne responsable (`org_admin`) invite, retire,
règle ; l'éditeur (`editor`) saisit les cours. Jusqu'ici, seule l'application faisait la
différence. Elle réserve trois écrans aux responsables (Membres, Réglages, Prières) et ne montre
leurs liens qu'à eux. La base, elle, laissait toute personne qui avait le contexte de
l'organisation faire la même chose par un appel direct : changer un rôle, le sien compris,
s'écrire une invitation de responsable, l'accepter et adhérer avec ce rôle, retirer un membre,
modifier les réglages (ADR 0017, « Limite du rôle »).

La faille de l'étape 17 a montré ce que cela coûte. L'application lisait le rôle dans la première
adhésion venue : une personne responsable d'une organisation et éditrice d'une autre était traitée
en responsable dans les deux. L'erreur était dans le code, et la base ne l'arrêtait pas.

Le retour H1 des tests de l'étape 18 le demande en une phrase : « à l'intérieur d'une organisation, la base
distingue l'éditeur du responsable pour tout ce qu'un éditeur ne doit pas pouvoir faire ».

## Décision

### La liste qui fait foi

Elle vient de l'application telle qu'elle est : les gardes des routes (`mustBeInOrganisation`,
`mustHavePrayerModule`, `mustAdminister`, `mustAdministerPrayerModule`, `mustBeAdmin`), les liens
de navigation montrés selon le rôle, et chaque écriture en base derrière ces gardes. C'est aussi la
liste que l'écran Membres montrera, pour qu'une personne sache ce que chaque rôle permet.

Chaque geste dit sa route, puis la table et l'opération. Chaque écriture ajoute aussi une ligne au
journal (`audit_log`, ajout), qui n'est pas répétée. Les deux colonnes se lisent chacune de haut en
bas : une ligne ne met pas en regard deux gestes liés.

| Ce que fait un éditeur                                                                                                       | Ce que fait en plus un responsable                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Voir la semaine à venir : `/` · lecture                                                                                      | Voir les membres et leur rôle : `/membres` · `membership`, `user` (lecture)                                                               |
| Annuler, déplacer, rétablir une séance : `/?/annuler`, `?/deplacer`, `?/retablir` · `session_exception` (ajout, suppression) | Voir les invitations en attente : `/membres` · `invitation` (lecture)                                                                     |
| Voir les cours : `/cours` · lecture                                                                                          | Inviter une personne, avec son rôle : `/membres?/inviter` · `invitation` (ajout ; l'invitation en attente pour la même adresse est close) |
| Créer un cours : `/cours/nouveau` · `course`, `course_translation` (ajout)                                                   | Annuler une invitation : `/membres?/annuler` · `invitation` (modification)                                                                |
| Modifier un cours : `/cours/[id]` · `course` (modification), `course_translation` (remplacement)                             | Changer le rôle d'un membre : `/membres?/role` · `membership` (modification)                                                              |
| Supprimer un cours : `/cours?/supprimer` · `course` (suppression)                                                            | Retirer un membre : `/membres?/retirer` · `membership` (suppression)                                                                      |
| Poser, retirer une pause : `/cours?/pause`, `?/supprimerPause` · `pause` (ajout, suppression)                                | Modifier nom, fuseau, couleur, formule d'accueil, langues : `/reglages?/enregistrer` · `organization` (modification)                      |
| Gérer le vendredi, module allumé : `/vendredi` · `course`, `course_translation`, `session_exception`                         | Allumer, éteindre le module des prières : `/reglages?/modulePrieres` · `organization` (modification)                                      |
| Partager le programme : `/partager` · lecture                                                                                | Ajouter, supprimer une salle : `/reglages?/ajouterSalle`, `?/supprimerSalle` · `room` (ajout, suppression)                                |
| Accepter une invitation reçue : `/organisations?/accepter` · `invitation` (modification), `membership` (ajout)               | Régler le calcul des heures de prière : `/prieres?/enregistrer` · `prayer_settings`, `prayer_day` (ajout, modification)                   |
| Accepter les conditions : `/conditions/accepter` · `terms_acceptance` (ajout)                                                | Importer, effacer des heures : `/prieres?/confirmer`, `?/effacer` · `prayer_day` (ajout, modification, suppression)                       |
| Choisir sa langue, écran à venir · `user` (modification de `language`, son propre compte)                                    | Écrire, dupliquer, supprimer une période : `/prieres?/periode`, `?/dupliquerPeriode`, `?/supprimerPeriode` · `prayer_period`              |
|                                                                                                                              | Télécharger le modèle d'horaires : `/prieres/modele.csv` · lecture                                                                        |

Trois écritures ne viennent d'aucun écran et sont réservées quand même, parce qu'elles touchent
aux mêmes tables : supprimer une invitation, renommer une salle, supprimer les réglages des
prières. Le super-admin fait tout ce que fait une personne responsable, dans l'organisation où il
est entré (ADR 0025).

### Comment la base la tient

- **Une fonction dit qui est responsable.** `jadwal.is_org_admin()` répond oui quand la personne du
  contexte (`jadwal.user_id`) a une adhésion `org_admin` dans l'organisation du contexte
  (`jadwal.org_id`), et non dans tous les autres cas : sans personne, sans organisation, ou
  responsable ailleurs. Elle est faite sur le modèle de `jadwal.invited` : droits du définisseur,
  chemin de recherche figé, exécution accordée au seul rôle applicatif. Sans argument, elle ne
  répond que sur le contexte, que l'application pose à partir de la session.
- **Le propriétaire lit l'adhésion du contexte, et rien d'autre.** La fonction est évaluée sous le
  propriétaire, soumis à la sécurité au niveau des lignes (ADR 0019). Une politique de lecture de
  plus, pour lui seul, lui montre l'adhésion de la personne du contexte dans l'organisation du
  contexte. Elle ne lit aucune autre table : les politiques des adhésions peuvent appeler la
  fonction sans récursion.
- **Les politiques des gestes réservés l'exigent**, pour le rôle applicatif, dans chacune de leurs
  clauses : `invitation` (lecture, insertion, modification, suppression, pour la branche de
  l'organisation), `membership` (modification, suppression), `organization` (modification),
  `room`, `prayer_settings`, `prayer_day`, `prayer_period` (insertion, modification, suppression).
  La lecture de ces tables reste ouverte à tous les membres, invitations exceptées : l'écran des
  cours lit les salles et les heures, et le programme en dépend.
- **La branche de la personne invitée ne change pas.** Reconnue par son adresse, sans contexte
  d'organisation, elle voit, accepte ou décline l'invitation reçue. L'adhésion qu'elle crée porte le
  rôle de son invitation (migration 0058) : c'est l'écriture de l'invitation qui est réservée, et
  cela suffit à fermer la chaîne de l'ADR 0017 dès la première marche.
- **Les colonnes de l'organisation.** Le rôle applicatif ne modifie plus que les huit colonnes de
  l'écran des réglages. Le plan et l'état relèvent du super-admin (ADR 0006, ADR 0025), et changer
  l'identifiant d'URL casserait toutes les adresses publiques : ni l'éditeur ni la personne
  responsable ne les écrivent.
- **Ce qui ne change pas.** Le super-admin garde ses pouvoirs : ses politiques ne passent pas par la
  fonction, et il ne peut pas l'appeler. Le propriétaire, sous son drapeau d'entretien, non plus.
  Les règles des migrations 0012 (la dernière personne responsable) et 0053 à 0058 (les colonnes
  d'une adhésion, la vie d'une invitation) restent telles quelles.
- **La fonction est stable, évaluée une fois par instruction**, sur l'état d'avant l'instruction.
  Une personne responsable qui se passe elle-même éditrice le peut donc, tant qu'une autre reste
  responsable.

La migration 0059 porte tout cela, et vérifie dans la même transaction la liste exacte des
politiques qui exigent la fonction. `packages/db/test/org-admin.test.ts` rejoue chaque geste de la
liste : une éditrice est refusée, une personne responsable et le super-admin passent, le parcours
d'une personne invitée reste le même.

### La langue du compte

L'espace des responsables se lit en cinq langues, et la langue choisie est retenue pour le compte
(migration 0060). Une colonne facultative, limitée à `fr`, `de`, `it`, `en` et `ar` par une
contrainte close par `is true`. La personne seule la change : le rôle applicatif reçoit le droit de
modifier cette colonne et aucune autre, et une politique ne lui laisse que la ligne de la personne
du contexte. Le rôle de connexion nomme la colonne à la création d'un compte, parce que Drizzle
nomme toutes les colonnes d'une insertion (migration 0032), et sa politique exige qu'elle reste
vide. `apps/web/src/lib/server/account-language.ts` la lit et l'écrit.

## Conséquences

- Un rôle mal lu par l'application ne suffit plus. Si un écran réservé oubliait sa garde, ou lisait
  le rôle dans la mauvaise adhésion, la base refuserait l'écriture d'une éditrice.
- **Limite.** Cette séparation arrête les erreurs de l'application, pas qui tient le mot de passe du
  rôle applicatif : il pose lui-même le contexte, personne comprise, et peut donc se dire
  responsable. C'est la même limite que celle de l'isolation entre organisations
  (`docs/SECURITE.md`, barrière 1).
- **Ce que l'éditeur lit encore.** Par un appel direct, un éditeur lit les membres de son
  organisation, avec leur nom et leur adresse. Aucun écran ne les lui montre. Fermer cette lecture
  changerait ce que voit la garde des personnes désignées (ADR 0013), sur laquelle s'appuient des
  écritures ordinaires : une éditrice qui annule une séance qu'un collègue avait déplacée écrit une
  ligne qui nomme ce collègue.
- **Ce que l'éditeur écrit encore au nom d'un autre.** Le journal accepte d'un membre une entrée
  qui nomme comme auteur un autre membre de l'organisation : sa politique ne demande qu'une personne
  visible. Rien de la liste ci-dessus n'en dépend ; c'est une question à part.
- Un éditeur ne peut plus retirer sa propre adhésion. Aucun écran ne le propose. Si un écran
  « quitter l'organisation » voyait le jour, la politique de suppression devrait l'autoriser pour
  soi.
- Un script ou un test qui écrit des réglages, des salles, des heures de prière, des invitations ou
  des adhésions sous le seul contexte d'une organisation n'écrit plus rien : il doit poser la
  personne responsable, comme le font les écrans (`asAdmin` dans les tests de `packages/db`). Une
  modification ou une suppression écartée ne lève pas d'erreur, elle touche zéro ligne.
- Ajouter un écran réservé aux responsables, c'est ajouter sa table à cette liste, à la migration
  qui exige la fonction et au test des gestes, dans le même changement.

## Statut

Accepté, 2026-09-26. Étape 18, retour H1 des tests de l'exploitant (les rôles dans la base), et la
langue du compte.

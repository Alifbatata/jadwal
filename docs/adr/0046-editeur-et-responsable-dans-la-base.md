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

La consigne du chef de projet, après les tests de l'étape 18 : à l'intérieur d'une organisation, la
base distingue l'éditeur du responsable pour tout ce qu'un éditeur ne doit pas pouvoir faire.

## Décision

### La liste qui fait foi

Elle vient de l'application telle qu'elle est : les gardes des routes (`mustBeInOrganisation`,
`mustHavePrayerModule`, `mustAdminister`, `mustAdministerPrayerModule`, `mustBeAdmin`), les liens
de navigation montrés selon le rôle, et chaque écriture en base derrière ces gardes. C'est aussi la
liste que l'écran Membres montre, sous le choix du rôle, pour qu'une personne sache ce que chaque
rôle permet.

Chaque geste dit sa route, puis la table et l'opération. Chaque écriture ajoute aussi une ligne au
journal (`audit_log`, ajout), qui n'est pas répétée. Les deux colonnes se lisent chacune de haut en
bas : une ligne ne met pas en regard deux gestes liés.

| Ce que fait un éditeur                                                                                                             | Ce que fait en plus un responsable                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Voir la semaine à venir : `/` · lecture                                                                                            | Voir les membres et leur rôle : `/membres` · `membership`, `user` (lecture)                                                                                                          |
| Annuler, déplacer, rétablir une séance : `/?/annuler`, `?/deplacer`, `?/retablir` · `session_exception` (ajout, suppression)       | Voir les invitations en attente : `/membres` · `invitation` (lecture)                                                                                                                |
| Voir les cours : `/cours` · lecture                                                                                                | Inviter une personne, avec son rôle : `/membres?/inviter` · `invitation` (ajout ; l'invitation en attente pour la même adresse est close)                                            |
| Créer un cours : `/cours/nouveau` · `course`, `course_translation` (ajout)                                                         | Annuler une invitation : `/membres?/annuler` · `invitation` (modification)                                                                                                           |
| Modifier un cours : `/cours/[id]` · `course` (modification), `course_translation` (remplacement)                                   | Changer le rôle d'un membre : `/membres?/role` · `membership` (modification)                                                                                                         |
| Poser, retirer une pause : `/cours?/pause`, `?/supprimerPause` · `pause` (ajout, suppression)                                      | Retirer un membre : `/membres?/retirer` · `membership` (suppression)                                                                                                                 |
| Gérer le vendredi, module allumé : `/vendredi` · `course`, `course_translation`, `session_exception`                               | Modifier nom, fuseau, couleur, formule d'accueil, langues : `/reglages?/enregistrer` · `organization` (modification)                                                                 |
| Partager le programme : `/partager` · lecture                                                                                      | Allumer, éteindre le module des prières : `/reglages?/modulePrieres` · `organization` (modification)                                                                                 |
| Accepter une invitation reçue : `/organisations?/accepter` · `invitation` (modification), `membership` (ajout)                     | Ajouter, supprimer une salle : `/reglages?/ajouterSalle`, `?/supprimerSalle` · `room` (ajout, suppression)                                                                           |
| Accepter les conditions : `/conditions/accepter` · `terms_acceptance` (ajout)                                                      | Régler le calcul des heures de prière, après un aperçu : `/prieres?/apercu` (sans rien écrire), `?/enregistrer` · `prayer_settings`, `prayer_day` (ajout, modification)              |
| Choisir sa langue, en haut de chaque écran : `/langue` · `user` (modification de `language`, son propre compte)                    | Importer, effacer des heures : `/prieres?/lireFichier` (sans rien écrire), `?/confirmer`, `?/effacer` · `prayer_day` (ajout, modification, suppression)                              |
| Changer d'organisation, pour qui est membre de plusieurs : `/organisations?/choisir` · `session` (modification, rôle de connexion) | Écrire, prévisualiser, dupliquer, supprimer une période : `/prieres?/periode`, `?/apercuPeriode` (écrite puis annulée), `?/dupliquerPeriode`, `?/supprimerPeriode` · `prayer_period` |
|                                                                                                                                    | Télécharger le modèle d'horaires : `/prieres/modele.csv` · lecture                                                                                                                   |
|                                                                                                                                    | Chercher une localité suisse : `/prieres/localites` · lecture de la liste embarquée, aucune table                                                                                    |

Trois écritures ne viennent d'aucun écran et sont réservées quand même, parce qu'elles touchent
aux mêmes tables : supprimer une invitation, renommer une salle, supprimer les réglages des
prières. Une lecture non plus : le journal (`audit_log`), qu'aucun écran ne montre, et qui nomme
les membres et les personnes invitées (migration 0070). Le super-admin fait tout ce que fait une personne responsable, dans l'organisation où il
est entré (ADR 0025).

Deux gestes n'ont pas encore d'écran, et la base les tient déjà depuis l'étape 19 :

- **Supprimer un cours** (`/cours?/supprimer` · `course`, suppression) est réservé à la personne
  responsable (migration 0065). L'action existe, mais aucun écran ne l'appelle, et sa route n'a pas
  d'autre garde que l'appartenance : appelée par un éditeur, elle ne supprime plus rien. L'écran
  Cours la proposera au lot suivant, et elle rejoindra alors la colonne de droite. Une session du
  vendredi n'est pas concernée : l'écran Vendredi en propose la suppression à l'éditeur, et la base
  la lui laisse. Un cours ne devient pas une session le temps d'être supprimé : le type d'une ligne
  ne change pas, pour personne (migration 0069, ADR 0033).
- **Quitter l'organisation** (`membership`, suppression de sa propre adhésion) est ouvert à chacun,
  pour soi seulement (migration 0066). L'écran viendra dans « Vos organisations ». La dernière
  personne responsable ne part pas : le déclencheur de la migration 0012 la retient.

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
  l'organisation), `membership` (lecture et suppression pour la branche de l'organisation,
  modification), `organization` (modification), `room`, `prayer_settings`, `prayer_day`,
  `prayer_period` (insertion, modification, suppression), `course` (suppression, sauf une
  session du vendredi) et `audit_log` (lecture). Un déclencheur tient le type de chaque cours : sans lui, la modification,
  ouverte à tout membre, ferait d'un cours une session, que l'éditeur supprimerait. La lecture de ces tables reste ouverte à tous les membres, invitations,
  adhésions et journal exceptés : l'écran des cours lit les salles et les heures, et le programme en
  dépend.
- **Chacun garde ce qui est à lui.** La lecture des adhésions a une seconde branche, ses propres
  adhésions, dans toutes ses organisations : c'est d'elles que l'application part pour savoir de
  quelles organisations une personne est membre, et avec quel rôle. La suppression en a une aussi,
  sa propre adhésion dans l'organisation du contexte : c'est quitter l'organisation. Les comptes
  suivent la lecture des adhésions, puisque la politique de `user` passe par elle : un éditeur ne
  lit plus que le sien, la personne responsable lit ceux de ses membres.
- **Le journal est signé de la personne du contexte.** L'écrire n'est pas un geste réservé : tout
  membre écrit au journal. Mais l'auteur d'une entrée est la personne que l'application pose, et
  aucune autre (migration 0063, ADR 0015). Le lire l'est : l'écran Membres y écrit l'adresse et le
  rôle de chaque personne invitée, et un éditeur y relisait la liste des membres (migration 0070).
- **La branche de la personne invitée ne change pas.** Reconnue par son adresse, sans contexte
  d'organisation, elle voit, accepte ou décline l'invitation reçue. L'adhésion qu'elle crée porte le
  rôle de son invitation (migration 0058) : c'est l'écriture de l'invitation qui est réservée, et
  cela suffit à fermer la chaîne de l'ADR 0017 dès la première marche.
- **Les colonnes de l'organisation.** Le rôle applicatif ne modifie plus que les huit colonnes de
  l'écran des réglages. Le plan et l'état relèvent du super-admin (ADR 0006, ADR 0025), et changer
  l'identifiant d'URL casserait toutes les adresses publiques : ni l'éditeur ni la personne
  responsable ne les écrivent.
- **Ce qui ne change pas.** Le super-admin garde ses pouvoirs : ses politiques ne passent pas par la
  fonction, et il ne peut pas l'appeler. Aucune politique du propriétaire ne passe non plus par
  elle : il peut l'appeler, puisqu'elle lui appartient, mais aucun de ses droits n'en dépend. Les
  règles des migrations 0012 (la dernière personne responsable) et 0053 à 0058 (les colonnes
  d'une adhésion, la vie d'une invitation) restent telles quelles.
- **La fonction est stable, évaluée une fois par instruction**, sur l'état d'avant l'instruction.
  Une personne responsable qui se passe elle-même éditrice le peut donc, tant qu'une autre reste
  responsable.

La migration 0059 porte tout cela, et les migrations 0063 à 0066, 0069 et 0070 le complètent. La 0059
vérifiait dans la même transaction la liste exacte des politiques qui exigent la fonction ; depuis
que d'autres la complètent, elle n'en vérifie que le minimum, pour rester rejouable après elles.
`packages/db/test/org-admin.test.ts` tient la liste exacte, et rejoue chaque geste de la liste : une
éditrice est refusée, une personne responsable et le super-admin passent, le parcours d'une
personne invitée reste le même.

### La langue du compte

L'espace des responsables se lit en cinq langues, et la langue choisie est retenue pour le compte
(migration 0060). Une colonne facultative, limitée à `fr`, `de`, `it`, `en` et `ar` par une
contrainte close par `is true`. La personne seule la change : le rôle applicatif reçoit le droit de
modifier cette colonne et aucune autre, et une politique ne lui laisse que la ligne de la personne
du contexte. Le rôle de connexion nomme la colonne à la création d'un compte, parce que Drizzle
nomme toutes les colonnes d'une insertion (migration 0032) ; sa politique refuse qu'elle porte une
valeur. `apps/web/src/lib/server/account-language.ts` la lit et l'écrit. Quand et comment
l'application l'écrit (le choix en haut de chaque écran, un choix fait avant la connexion qui
devient la langue du compte), c'est l'ADR 0047.

### Ce que l'étape 18 a encore changé dans les écrans réservés

La liste ci-dessus est celle du code à la fin de l'étape 18 :

- **L'écran Membres montre la liste**, en deux parties : ce que peut faire un éditeur, et ce qui est
  réservé à la personne responsable. `apps/web/tests/membres-et-reglages.test.ts` la lie à la base :
  les tables que les politiques réservent (celles qui appellent `jadwal.is_org_admin()`, lues dans
  `pg_policies`) doivent être exactement celles des gestes que l'écran range dans la seconde partie.
- **L'écran des prières prévisualise une période** avant de l'enregistrer (`?/apercuPeriode`) : la
  période est écrite, les sept prochains jours sont relus, puis la transaction est annulée. Il passe
  par la même garde et par les mêmes politiques que `?/periode`.
- **Supprimer une salle qu'un cours occupe** demande d'abord une confirmation à l'écran, puis la base
  ne vide que la salle de ces cours (migration 0061).
- **Les langues d'une organisation** sont bornées par la base aux cinq langues du public
  (migration 0062).

## Conséquences

- Un rôle mal lu par l'application ne suffit plus. Si un écran réservé oubliait sa garde, ou lisait
  le rôle dans la mauvaise adhésion, la base refuserait l'écriture d'une éditrice.
- **Limite.** Cette séparation arrête les erreurs de l'application, pas qui tient le mot de passe du
  rôle applicatif : il pose lui-même le contexte, personne comprise, et peut donc se dire
  responsable. C'est la même limite que celle de l'isolation entre organisations
  (`docs/SECURITE.md`, barrière 1).
- **Un éditeur ne nomme que lui-même.** La garde des personnes désignées (ADR 0013) passe par ce
  que la personne voit, et un éditeur ne voit plus ses collègues : dans une ligne qu'il écrit
  (`created_by`, `updated_by`), il ne peut nommer que lui-même. C'est ce que l'application écrit
  toujours, et chaque modification d'un cours réécrit `updated_by` : aucune écriture ordinaire ne
  dépendait de la lecture des collègues. La personne responsable nomme tout membre, comme avant.
- Un script ou un test qui écrit des réglages, des salles, des heures de prière, des invitations ou
  des adhésions, ou qui supprime un cours, sous le seul contexte d'une organisation n'écrit plus
  rien : il doit poser la personne responsable, comme le font les écrans (`asAdmin` dans les tests
  de `packages/db`). Il ne lit pas non plus les adhésions, les comptes ni le journal, et n'écrit
  rien au journal. Une modification ou une suppression écartée ne lève pas d'erreur, elle touche zéro ligne.
- Ajouter un écran réservé aux responsables, c'est ajouter sa table à cette liste, à la migration
  qui exige la fonction et au test des gestes, dans le même changement.

## Addendum du 27.09.2026 : les deux limites de l'étape 18 sont fermées

L'étape 18 laissait à l'éditeur deux choses, écrites ici comme limites : lire la liste des membres
et leurs comptes par un appel direct, et écrire au journal une entrée qui nommait un collègue comme
auteur. Le chef de projet a demandé de les fermer, avec deux gestes de plus.

- **Le journal** (migration 0063) : l'auteur d'une entrée est la personne du contexte. Le
  super-admin signe de sa propre identité, comme avant ; sa politique ne change pas. La lecture est
  réservée à la personne responsable (migration 0070) : le journal nomme les membres et les
  personnes invitées, et un éditeur y retrouvait la liste que la migration 0064 lui retire.
- **La liste des membres** (migration 0064) : la personne responsable et le super-admin la lisent
  comme avant ; un éditeur ne lit plus que sa propre adhésion et son propre compte. La garde des
  personnes désignées ne passe pas par une fonction de plus : elle suit ce que la personne voit, et
  l'application ne fait jamais nommer à un éditeur que lui-même.
- **Supprimer un cours** (migration 0065) : réservé à la personne responsable, sauf une session du
  vendredi. Le type d'une ligne ne change pas (migration 0069) : un cours ne devient pas une
  session le temps d'être supprimé.
- **Quitter l'organisation** (migration 0066) : chacun peut supprimer sa propre adhésion, et rien
  de plus ; la dernière personne responsable reste retenue.

Ce qui reste à l'éditeur, et que la base ne ferme pas : dans les cours, les séances et les pauses,
l'identifiant de la personne qui les a écrits (`updated_by`, `created_by`). Un identifiant opaque,
qu'aucune table ne lui permet plus de relier à un nom, une adresse ou un rôle (`docs/SECURITE.md`).

Les écrans de ces deux derniers gestes viennent au lot suivant de l'étape 19 : le bouton de l'écran
Cours, et « Quitter l'organisation » dans « Vos organisations ». Jusque-là, l'écran Membres ne
promet ni l'un ni l'autre, et le test qui lie sa liste à la base nomme la table des cours comme
réservée sans écran.

## Statut

Accepté, 2026-09-26. Étape 18, consigne du chef de projet (les rôles dans la base), et la langue du
compte. Révisé le même jour, à la fin de l'étape : la langue se choisit en haut de chaque écran,
l'écran Membres montre la liste, et l'écran des prières prévisualise une période. Complété le
27.09.2026 (étape 19) : le journal, la liste des membres, la suppression d'un cours et le départ
d'une organisation.

> **Remplacé par l'[ADR 0025](0025-super-admin-pouvoirs-complets.md), le 2026-09-20.**
>
> L'exploitant a demandé l'inverse de ce que cette décision posait : le super-admin a désormais tous
> les droits, en permanence, et ses consultations ne laissent aucune trace visible par
> l'organisation. La fenêtre d'accès décrite ici n'existe plus — ni la table, ni les politiques, ni
> l'écran. Ce texte reste lisible parce qu'une décision annulée se raye, elle ne s'efface pas : il
> dit ce que nous avions voulu, et l'ADR 0025 dit ce que nous avons accepté de perdre.

# ADR 0018 : Accès de support du super-admin

## Contexte

Depuis l'étape 2, le rôle super-admin n'a aucun droit sur les données d'une organisation : il ouvre
et ferme les organisations, attribue le plan, lit les comptes, et c'est tout. Cette retenue est
délibérée (ADR 0006 et 0013) : celui qui administre le service n'a pas à lire le programme des cours
d'une mosquée.

Elle a un coût. « Je ne vois plus mon cours du mardi » est une demande de support qu'on ne peut pas
instruire sans regarder. La question a été laissée ouverte à la fin de l'étape 2. Deux réponses
mauvaises se présentaient : donner au super-admin un accès permanent en lecture, ce qui annule la
retenue ; ou refuser tout accès, ce qui rend le support impossible et pousse à demander au
responsable de tout recopier à la main.

## Décision

Le super-admin peut ouvrir un **accès de support**, borné et tracé.

- **Une organisation à la fois.** Une entrée d'accès vise une organisation nommée ; elle n'ouvre
  rien ailleurs.
- **Un motif écrit obligatoire.** Une contrainte de vérification impose un texte d'au moins dix
  caractères. Il n'y a pas d'accès sans raison écrite.
- **Vingt-quatre heures au plus.** Une contrainte de vérification impose que la fin de fenêtre soit
  postérieure à son ouverture et ne la dépasse pas de plus de vingt-quatre heures.
- **Une fenêtre ouverte ne se récrit pas du tout.** La contrainte seule ne suffisait pas : elle
  bornait la fin par rapport à l'ouverture, et l'ouverture était modifiable — il suffisait de
  l'avancer pour repousser la fin, indéfiniment. Le droit de modification est donc réduit à la seule
  colonne de révocation, et un déclencheur refuse tout retour en arrière. Prolonger, c'est ouvrir une
  nouvelle entrée, qui laisse sa propre trace.
- **Révocable à tout moment**, par une date de révocation qui ferme la fenêtre immédiatement, et
  **jamais rouvrable** : une fenêtre révoquée le reste.
- **Lecture seule, et la base le garantit.** Le super-admin ne reçoit aucun droit d'écriture sur les
  tables d'organisation : une tentative échoue sur un refus de droit, avant que la moindre ligne
  soit examinée, avec un message qui ne dépend pas du contenu. Ses politiques de lecture sur ces
  tables sont conditionnées à l'existence d'une fenêtre ouverte pour l'organisation du contexte
  courant. Hors fenêtre, il ne voit rien : pas une erreur, rien.
- **Il lit le journal d'audit d'une organisation sous la même règle.** Ses propres traces de support
  lui restent lisibles partout et toujours — c'est ce qu'il a écrit lui-même. Le reste du journal
  d'une organisation ne lui est lisible que pendant une fenêtre ouverte pour elle. Une entrée
  d'adhésion porte l'auteur et la cible : la laisser lisible en permanence rouvrirait le graphe des
  responsables que cette décision ferme, et fermer une porte en laissant la fenêtre ouverte ne ferme
  rien.
- **Tout est écrit dans le journal d'audit de l'organisation visée** : l'ouverture, la prolongation
  et la révocation le sont dès l'étape 3. La trace de **chaque lecture** faite sous cet accès suppose
  que toutes les lectures passent par un point unique, ce qu'apporteront les écrans de consultation
  de l'étape 4 : elle est décidée ici, pas encore écrite, et l'étape 3 le dit dans son rapport.
- **Les responsables de l'organisation voient ces entrées.** L'accès de support n'est pas discret :
  la table est lisible par le rôle applicatif dans le contexte de son organisation, et le journal
  d'audit l'est aussi. Quelqu'un a regardé chez eux, ils le savent, ils savent qui et pourquoi.

## Conséquences

- La retenue de l'ADR 0013 tient toujours par défaut : sans fenêtre ouverte, le super-admin ne voit
  aucune donnée d'organisation. L'accès est l'exception, déclarée et datée, pas la règle.
- La borne de vingt-quatre heures et le motif sont vérifiés par la base, donc ils tiennent quel que
  soit le code appelant. Une interface qui oublierait de les imposer échouerait.
- Journaliser chaque lecture coûte une écriture par lecture. À l'échelle du support — quelques
  ouvertures par mois — c'est sans conséquence, et c'est le prix de la confiance.
- L'écriture des traces relève de l'application : la base garantit la fenêtre et la lecture seule,
  pas le fait qu'une lecture soit journalisée. Un test vérifie que l'ouverture écrit bien sa trace
  dans le journal de la bonne organisation, et que les responsables de cette organisation la voient.
- Tant que la trace par lecture n'existe pas, une fenêtre ouverte dit **qu'on a pu regarder**, pas
  ce qui a été regardé. C'est moins que ce que l'on veut, et plus que rien : la fenêtre est datée,
  motivée, bornée et visible.
- Le super-admin ne peut pas se donner un accès en modifiant une entrée existante : il peut en
  créer, et les révoquer, jamais les récrire. Le refus est un refus de droit pour tout ce qui n'est
  pas la révocation, donc son message ne dépend pas de la valeur proposée.
- Il ne peut pas non plus écrire une entrée de journal imputée à quelqu'un d'autre : sa politique
  d'insertion n'accepte que les actions de support, et rien qui ressemble à une action de
  responsable. Le journal étant indélébile, une entrée fausse y resterait.
- Hors fenêtre, il ne lit pas davantage le graphe des adhésions : « qui est responsable de quelle
  mosquée » est ce que le modèle de menace classe comme sensible, et cela relève de la même fenêtre
  que le reste. Il voit les organisations et les comptes, pas le lien entre les deux.
- Un incident qui exigerait une écriture — réparer une donnée corrompue — n'est pas couvert. Il
  relèvera du propriétaire, hors du chemin applicatif, et laissera ses propres traces.

## Statut

Accepté, 2026-09-20. Étape 3 de la feuille de route (connexion, organisations, rôles, invitations,
super-admin, journal).

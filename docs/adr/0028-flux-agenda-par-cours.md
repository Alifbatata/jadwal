# ADR 0028 : Flux agenda par cours

## Contexte

L'étape 5 a livré un flux agenda par organisation : `/m/<identifiant>/agenda.ics`. On s'abonne, et
tout le programme de l'organisation arrive dans le téléphone.

La maquette écrite avant ce code disait autre chose. `docs/maquettes/public-cours.md` place
« Ajouter à mon agenda » **sur la page de chaque cours**, et le cadrage décrit le détail d'un cours
avec son propre bouton d'agenda. Ce qui a été livré pointait ce bouton vers la page d'abonnement de
l'organisation : le lien existait, mais il ne faisait pas ce qu'il annonçait.

C'est un oubli de conception, pas une simplification : quelqu'un qui suit le cours d'arabe du mardi
n'a aucune raison de recevoir les quatorze autres cours de l'organisation dans son calendrier, et
il ne se réabonnera pas si le seul abonnement possible lui remplit son agenda.

## Décision

**Un flux par cours, à son propre lien** : `/m/<identifiant>/agenda/<identifiant du cours>.ics`.

Il vit à côté du flux de l'organisation et non sous `/api/`, pour la même raison qu'à l'étape 5 :
c'est une adresse qu'une personne copie et colle dans son téléphone.

### Construit par le même code

Le flux d'un cours est produit par le **même appel à `buildCalendar`** que celui de l'organisation,
avec une liste d'un seul cours. Il n'y a donc pas de second export à maintenir : les deux flux
tiennent ou se cassent ensemble, et un correctif sur l'un porte sur l'autre sans qu'on y pense.

Les exceptions et les pauses de toute l'organisation lui sont passées telles quelles. C'est le cœur
qui ne retient que ce qui concerne le cours, comme il le fait déjà, et une pause d'organisation
s'applique au cours isolé exactement comme aux autres.

### Ce que le fichier dit de lui-même

Le nom du calendrier est `<Nom de l'organisation> — <Titre du cours>`. Sans le nom de
l'organisation, deux abonnements venus de deux organisations se ressembleraient dans la liste du
téléphone. Le nom de fichier proposé au téléchargement suit le titre du cours, ramené à des
caractères sûrs ; un titre entièrement en arabe ne laissant rien après ce passage, il retombe alors
sur le nom de l'organisation plutôt que sur une suite de tirets.

Les `UID` ne changent pas : ce sont ceux du flux d'organisation, `<identifiant du cours>@<hôte>`.
Quelqu'un qui s'abonne aux deux verra les mêmes séances deux fois, une fois par calendrier — c'est
ce que font deux calendriers distincts, et c'est ce qu'il a demandé.

### Où le bouton mène

- **La page d'un cours** porte « Ajouter ce cours à mon agenda » en `webcal:`, puis son adresse en
  `https:` en texte sélectionnable, puis un lien vers l'abonnement au programme entier.
- **La page d'abonnement** explique les deux, dans cet ordre : tout le programme d'abord, puisque
  c'est le cas courant, un seul cours ensuite, avec la liste des cours.

### Un cours invisible répond comme un cours qui n'existe pas

Un brouillon, un cours archivé, un cours d'une autre organisation et un identifiant inventé rendent
tous le même `404`, avec le même corps. Ce n'est même pas une précaution d'écriture : le rôle public
ne voit pas ces lignes (ADR 0026), donc il n'y a rien à filtrer.

### Pas de filtre par public sur le flux

La question était ouverte depuis l'étape 5 : fallait-il `?public=kids` sur le flux agenda ? **Non**,
et la question est fermée. Un abonnement est une décision qu'on prend une fois et qu'on oublie ;
un filtre par public y ajouterait une adresse de plus à choisir, pour un découpage qui ne correspond
à rien de durable — un enfant grandit, une femme suit aussi un cours ouvert à tous. Le flux par
cours répond au vrai besoin, qui est « je veux celui-là », et il y répond mieux.

## Conséquences

- Une organisation peut mettre dans un message le lien d'abonnement d'un seul cours, ce qui est
  exactement ce qu'un groupe WhatsApp de classe demande.
- Le nombre d'adresses publiques augmente d'une par cours publié. Elles sont bornées par la
  limitation de débit comme le reste, et chacune coûte le même calcul qu'une page de cours.
- La maquette `docs/maquettes/public-agenda.md` disait « elle ne propose pas de choisir un cours ».
  Elle est corrigée : un désaccord entre la maquette et le code est un défaut de l'un ou de l'autre,
  et c'est ici la maquette qui avait tort.
- Le `docs/API.md` gagne un point d'entrée. Ce n'est pas un changement de contrat : rien de ce qui
  existait ne bouge.

## Statut

Accepté, 2026-09-21. Étape 6 de la feuille de route. Complète l'ADR 0026 (API publique) et
l'ADR 0003 (export ICS).

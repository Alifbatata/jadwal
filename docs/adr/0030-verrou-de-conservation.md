# ADR 0030 : Verrou de conservation

## Contexte

Depuis l'étape 3, le journal d'audit d'une organisation est purgé à vingt-quatre mois, et depuis
l'étape 5 le registre interne du super-admin aussi (ADR 0020, ADR 0025). La borne n'est pas dans le
code de la procédure mais dans une politique de suppression : un `delete` sans clause de restriction
ne peut emporter que ce que la fenêtre autorise.

Cette purge est une bonne chose tant que rien ne se passe. Le jour où quelque chose se passe — une
organisation qui conteste une modification, un responsable qui accuse un autre d'avoir effacé un
cours, une demande d'une autorité —, elle devient exactement le contraire : le compte à rebours qui
efface la pièce du dossier pendant qu'on en discute.

Aucun mécanisme du service ne permettait de suspendre ce compte à rebours.

## Décision

**Une table `retention_hold`, une ligne par organisation.** Tant qu'elle existe, les politiques de
purge du journal d'audit et du registre interne ne laissent plus supprimer une seule ligne de cette
organisation. La ligne porte un motif et le nom de qui l'a posée, tous deux obligatoires : un verrou
sans motif ne se lève jamais, parce que personne ne sait plus pourquoi il est là.

### Qui peut le poser, et qui ne le peut pas

**Le propriétaire de la base, et lui seul.** Le rôle applicatif, le super-admin et le rôle public
n'ont aucun droit sur cette table : la tentative échoue sur un refus de droit, avant qu'une ligne
soit examinée. Poser et lever un verrou sont des écritures d'entretien, sous le drapeau de
l'ADR 0019, donc des gestes délibérés, faits en console, avec le mot de passe d'hébergement.

C'est le point de la décision. Un verrou que l'application pourrait lever ne serait pas un verrou :
la personne visée par un litige est parfois celle qui tient l'application. Le super-admin lui-même
en est écarté, alors qu'il a tous les autres pouvoirs depuis l'ADR 0025 — c'est la première chose
que ses pouvoirs n'ouvrent pas, et c'est voulu.

### La clé étrangère est en `restrict`, pas en `cascade`

Le journal d'audit disparaît avec son organisation. Sans cette précaution, le verrou n'aurait fermé
que la purge, c'est-à-dire la seule voie dont personne ne se serait servi : il aurait suffi de
supprimer l'organisation. Avec `restrict`, une organisation sous verrou ne peut pas être supprimée,
et le message d'erreur nomme la contrainte.

### La lecture reste ouverte au propriétaire

Les politiques de purge consultent la table au milieu d'un `delete`, et la purge du journal d'audit
ne pose aucun drapeau d'entretien. La lecture est donc permise sans drapeau. Ce n'est pas un
relâchement : lire un verrou n'a jamais effacé personne.

### Un relevé

`packages/db/scripts/retention-hold.mjs` pose, lève et **relève** les verrous. Le relevé ne se
contente pas de lister les lignes : il dit, pour chaque verrou, combien d'entrées de journal et de
registre il retient. C'est la seule chose qu'on veut savoir en le relisant six mois plus tard.

## Conséquences

- La rétention de vingt-quatre mois reste la règle, et la suspension est une exception nommée,
  datée et signée.
- Une organisation sous verrou ne peut plus être supprimée. C'est un effet de bord voulu ; il
  surprendra celui qui l'ignore, d'où le relevé.
- Le verrou ne protège pas contre un superutilisateur PostgreSQL, qui n'est soumis à aucune
  politique. Comme le reste du modèle de menace, il protège contre nos propres erreurs et contre les
  rôles de l'application, pas contre celui qui tient le serveur (`docs/SECURITE.md`).
- Poser un verrou exige un accès à la base. C'est plus lourd qu'un bouton dans l'écran du
  super-admin, et c'est le prix de la garantie.
- Rien ne rappelle qu'un verrou est posé. À l'étape 8, la supervision devra le faire : un verrou
  oublié fait grossir un journal sans fin.

## Statut

Accepté, 2026-09-21. Étape 6 de la feuille de route. Complète l'ADR 0020 (rétention du journal
d'audit) et borne l'ADR 0025 (pouvoirs du super-admin).

# ADR 0019 : Propriétaire non privilégié

## Contexte

L'ADR 0013 a posé l'isolation par la sécurité au niveau des lignes, activée **et forcée**. Le forçage
existe pour une raison précise : sans lui, le propriétaire d'une table échappe aux politiques.

La revue de l'étape 2 a montré que cette deuxième barrière ne servait à rien. Le propriétaire des
tables était le rôle du serveur, celui que l'image PostgreSQL crée à partir de `POSTGRES_USER`, et ce
rôle est superutilisateur. Or un superutilisateur passe outre la sécurité au niveau des lignes quoi
qu'il arrive, forçage compris. L'isolation ne reposait donc que sur le fait que les requêtes
applicatives passent par un rôle non privilégié — une seule barrière, là où l'ADR en annonçait deux.

## Décision

- **Un rôle propriétaire dédié**, `jadwal_owner`, créé `NOSUPERUSER NOBYPASSRLS NOCREATEDB
NOCREATEROLE NOREPLICATION`. Il possède les schémas `public`, `jadwal` et celui du suivi de
  migration, ainsi que toutes les tables, séquences, index et fonctions. Il joue les migrations et
  écrit les données de démonstration. Il ne reçoit aucune requête venue de l'extérieur.
- **Le rôle du serveur ne sert plus qu'à l'amorçage.** Créer un rôle, créer ou supprimer une base, et
  donner un schéma sont les seules choses qu'un rôle non privilégié ne peut pas faire.
  `scripts/bootstrap-roles.mjs` les fait, et rien d'autre. Il tourne **avant** les migrations,
  puisque c'est lui qui crée le rôle qui va les jouer.
- **Deux droits suffisent au propriétaire** : `CREATE` sur la base, et la propriété du schéma
  `public`. Le premier n'est pas facultatif : Drizzle lance `create schema if not exists` à chaque
  exécution, et PostgreSQL vérifie le droit avant de regarder si le schéma existe déjà.
- **Le propriétaire est soumis à la RLS forcée**, et c'est le but. Il en découle qu'il ne peut plus
  rien écrire sans politique le nommant. Ses politiques d'entretien existent, mais ne s'ouvrent que
  sous un drapeau posé pour la seule durée d'une transaction :

  ```sql
  begin;
  set local jadwal.maintenance = 'on';
  ...
  commit;
  ```

  Hors de ce drapeau, il est en refus par défaut, y compris pour une requête tapée par erreur dans
  une console de production. Ce n'est pas une muraille — il peut poser le drapeau quand il veut —
  mais c'est explicite, transactionnel, sans verrou, et cela transforme un accès permanent en un
  geste délibéré.

- **Une politique par opération**, comme partout (ADR 0013), et le journal d'audit n'en reçoit que
  deux : il reste en ajout seul, même pour le propriétaire (ADR 0015).
- **`ALTER TABLE … NO FORCE ROW LEVEL SECURITY` est interdit**, même le temps d'une transaction. Il
  prend un verrou exclusif qui bloque toute lecture concurrente, et surtout un `commit` au mauvais
  endroit laisse la table sans protection, définitivement et sans le moindre message. Le cas s'est
  produit pendant les essais préparatoires : seule une requête de catalogue l'a vu.
- **Le propriétaire ne doit jamais être membre d'un rôle superutilisateur.** L'attribut ne s'hérite
  pas, mais l'appartenance ouvre `set role`, et `set role` prend les attributs de la cible.
- **Le nom du propriétaire est paramétrable** comme celui des autres rôles, avec les deux chemins
  déjà documentés à l'étape 2 : ouvrir un rôle membre, ou renommer.

## Conséquences

- L'isolation repose enfin sur deux barrières indépendantes : les politiques, et le fait qu'aucun
  rôle en jeu n'y échappe.
- Un test de catalogue échoue si un objet d'un schéma du projet appartient à un autre rôle que le
  propriétaire attendu, si ce rôle porte un attribut privilégié — directement ou par appartenance —
  ou si une table n'a pas ses politiques d'entretien. Il ne nomme aucune table.
- **Un `update` ou un `delete` refusé par la sécurité au niveau des lignes ne lève pas d'erreur** :
  il rend « 0 ligne ». Un script d'entretien qui oublierait le drapeau croirait avoir travaillé. Les
  scripts du projet posent le drapeau explicitement, et le test d'idempotence des données de
  démonstration compare le contenu, pas un compte de lignes, ce qui attrape ce cas.
- Une base déjà migrée bascule par `scripts/transfer-ownership.mjs`. `REASSIGN OWNED BY` ne convient
  pas : quand l'ancien propriétaire est le rôle d'amorçage du serveur, PostgreSQL refuse en bloc,
  parce que ce rôle possède aussi des objets partagés épinglés et que la commande est tout ou rien.
  Le script nomme donc les schémas au lieu de filtrer sur l'ancien propriétaire — depuis
  PostgreSQL 15, `public` appartient à `pg_database_owner` et un tel filtre le raterait.
- Les index, les tables techniques associées et les types composites de table suivent leur table :
  la bascule ne les nomme pas. Les fonctions, elles, ne sont pas des relations et doivent être
  traitées à part.
- La préparation de la base de test ouvre désormais deux connexions : le rôle du serveur pour créer
  la base et les rôles, le propriétaire pour les migrations.

## Statut

Accepté, 2026-09-20. Étape 3 de la feuille de route (connexion, organisations, rôles, invitations,
super-admin, journal). Remplace, sur ce point, la décision de l'ADR 0013 qui annonçait un
propriétaire non superutilisateur sans le créer.

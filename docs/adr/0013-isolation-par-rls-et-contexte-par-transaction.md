# ADR 0013 : Isolation par RLS et contexte par transaction

## Contexte

`jadwal` héberge plusieurs organisations dans une seule base (ADR 0008 : service hébergé par
l'auteur, ou auto-hébergement). Une organisation ne doit jamais voir ni toucher les données d'une
autre. Le cadrage le rappelle : « `packages/db` : Drizzle + PostgreSQL, RLS par organisation, tests
avec un rôle `NOBYPASSRLS` ».

Deux façons de tenir cette promesse. La première est applicative : chaque requête porte un
`where organization_id = …`, et une relecture attentive garantit qu'aucune n'a été oubliée. La
seconde est la sécurité au niveau des lignes de PostgreSQL (RLS) : la base elle-même filtre, quelle
que soit la requête. La première dépend de la vigilance à chaque ligne de code écrite pendant des
années ; la seconde dépend d'une configuration posée une fois et vérifiable par un test.

Le service parle à la base par un pool de connexions : une connexion sert successivement plusieurs
requêtes de plusieurs organisations. Le contexte « quelle organisation » doit donc avoir une portée
strictement limitée.

## Décision

- **RLS activée et forcée** (`ENABLE` puis `FORCE ROW LEVEL SECURITY`) sur chaque table qui porte des
  données d'organisation. `FORCE` n'a d'effet que sur le propriétaire de la table, et c'est
  précisément ce qui compte : sans lui, une migration jouée sous le rôle propriétaire, ou une
  appartenance de rôle mal placée, annulerait l'isolation sans bruit. La propriété se transmet par
  appartenance de rôle, l'attribut `BYPASSRLS` non. Un superutilisateur, lui, passe outre le forçage
  comme le reste : voir plus bas ce que cela coûte aujourd'hui.
- **Trois rôles**. Un propriétaire possède le schéma, les tables et les fonctions ; il ne sert qu'aux
  migrations et aux données de démonstration. Deux rôles applicatifs se connectent : le rôle
  ordinaire et le rôle super-admin, tous deux `NOSUPERUSER NOBYPASSRLS`, non propriétaires, sans
  droit de création. Le rôle super-admin a ses propres politiques et ne sert jamais aux requêtes
  ordinaires. Ce sont les deux rôles applicatifs que les migrations créent et que les tests
  vérifient ; le propriétaire, lui, est fourni par le serveur.
- **Le propriétaire est, en V1, le rôle du serveur.** Dans le conteneur de développement comme dans
  la CI, c'est celui que l'image PostgreSQL crée, et il est superutilisateur. Un superutilisateur
  échappe aux politiques quoi qu'il arrive, `FORCE ROW LEVEL SECURITY` compris : le forçage ne
  protège donc aujourd'hui que du cas « propriétaire non superutilisateur », qui n'est pas celui du
  poste de développement. C'est assumé pour l'instant, parce que ce rôle ne sert qu'aux migrations
  et ne reçoit jamais une requête venue de l'extérieur. En production, le propriétaire doit être
  créé `NOSUPERUSER` par l'exploitant, et le reste du schéma suit sans changement. La mise en place
  de ce rôle dédié est une action en attente, consignée dans `ETAT-PROJET.md`.
- **Une politique par table et par opération**, jamais un `FOR ALL` seul : `FOR ALL` se cumule en OU
  avec les autres et promeut silencieusement son `USING` en `WITH CHECK`. Les rôles d'une politique
  sont nommés explicitement.
- **Contexte par transaction** : `set_config('jadwal.org_id', …, true)` à l'ouverture de la
  transaction. Le troisième argument est obligatoire ; sans lui, la valeur reste collée à la
  connexion rendue au pool et fuite vers la requête suivante. L'aide `withOrg(orgId, callback)` est
  le seul chemin prévu, et le contexte disparaît avec la transaction, y compris après une erreur.
- **Lecture défensive du contexte** : la fonction `current_org_id()` rend `NULL` quand le paramètre
  est absent, vide ou illisible, au lieu de lever une erreur de conversion. À la fin d'une
  transaction, le paramètre ne redevient pas absent mais vaut la chaîne vide : sans cette précaution,
  la première requête hors contexte lèverait une erreur au lieu de ne rien rendre.
- **Les politiques appellent `(select jadwal.current_org_id())`**, entre parenthèses : la valeur est
  alors calculée une fois par requête et non une fois par ligne.
- **Clés étrangères composites** : une table rattachée à un cours référence `(course_id,
organization_id)` et non le seul `course_id`. Les vérifications d'intégrité référentielle
  contournent toujours la RLS ; sans cette forme, une référence vers la ligne d'une autre
  organisation réussirait, et l'écart entre « existe » et « n'existe pas » renseignerait sur des
  données invisibles.
- **Attacher une personne à une organisation n'est pas une écriture ordinaire.** Le rôle applicatif
  lit et retire une adhésion, mais n'en crée ni n'en modifie : ces deux opérations reviennent au
  super-admin, avec le flux d'invitation qui crée aussi le compte. Sans ce retrait, une organisation
  écrivait une adhésion désignant la personne d'une autre — la vérification de clé étrangère
  contourne toujours la RLS — et cette adhésion lui ouvrait la lecture de cette personne, puisque la
  politique de `user` accorde la lecture aux membres de l'organisation courante. La garde employée
  ailleurs est ici impossible : la politique de `user` lit `membership`, donc une politique de
  `membership` qui lirait `user` forme une récursion que PostgreSQL refuse, y compris à travers une
  fonction à droits du définisseur.
- **Une colonne qui désigne une personne ne peut désigner qu'une personne déjà visible.** Les
  politiques d'écriture de `course`, `pause`, `session_exception` et `audit_log` l'exigent. Sans
  cela, la contrainte de clé étrangère passait pour un identifiant réel et échouait pour un
  identifiant inventé, et l'écart renseignait sur des personnes invisibles.
- **Une contrainte de vérification ne refuse une ligne que si elle rend FAUX.** Une contrainte qui
  rend NULL accepte. Or presque tout rend NULL au contact d'une valeur absente : `array_length` d'un
  tableau vide, une comparaison avec un NULL, un `case` sans branche correspondante. Chaque
  contrainte du schéma est donc close par `is true`, et un test de catalogue échoue si l'une d'elles
  l'oublie.
- **Le journal d'audit** est en insertion seule : ADR 0015.

## Conséquences

- Une requête écrite sans filtre d'organisation ne rend rien au lieu de tout rendre. L'oubli devient
  visible en développement, pas en production.
- Toute écriture passe par une transaction, même une écriture unique : c'est le prix du contexte.
- Les tests s'exécutent avec le rôle applicatif non privilégié, jamais avec le propriétaire ni un
  superutilisateur, sans quoi ils prouveraient le contraire de ce qu'ils affirment. Un test parcourt
  les catalogues système et échoue si une table portant `organization_id` n'a pas la RLS activée et
  forcée, ou s'il manque une politique pour une opération accordée.
- Les vérifications d'unicité et de clé étrangère restent hors du filtre : PostgreSQL 18 masque le
  détail d'une violation d'unicité dès que la RLS est active, mais le nom de la contrainte reste
  visible. Les messages d'erreur remontés à l'interface ne reprennent donc jamais la valeur fautive.
- Une vue, si le projet en ajoute, devra porter `security_invoker = true` : sinon elle applique les
  droits de son propriétaire et ouvre un passage.
- Aucune fonction du projet n'est marquée `LEAKPROOF` : une fonction leakproof est évaluée avant le
  filtre de sécurité et verrait les lignes des autres organisations.
- L'isolation ne protège pas d'un rôle mal configuré : un superutilisateur ou un rôle `BYPASSRLS`
  voit tout, quelles que soient les politiques. Les deux rôles applicatifs sont créés par la
  migration d'amorçage, qui pose leurs attributs sur une base neuve. Sur une base déjà migrée,
  Drizzle ne rejoue pas ce fichier : c'est `scripts/bootstrap-roles.mjs`, rejouable à volonté, qui
  ramène un rôle qui aurait dérivé. La suite de tests relève les attributs **avant** de préparer
  quoi que ce soit, sans quoi elle relirait ce que sa propre préparation vient d'écrire et ne
  pourrait jamais échouer.
- Un rôle appartient au serveur, pas à une base. Migrer deux bases du même serveur en même temps
  écrirait deux fois dans le catalogue des rôles : le bloc est donc sérialisé par un verrou
  consultatif, et n'écrit que si un attribut diffère vraiment.

## Statut

Accepté, 2026-09-20. Étape 2 de la feuille de route (base, RLS, données de démo).

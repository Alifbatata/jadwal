# @jadwal/db

Accès aux données de `jadwal` : schéma Drizzle, migrations SQL versionnées, et isolation par
organisation assurée par PostgreSQL lui-même. Le paquet ne dépend pas de SvelteKit et tourne dans un
script Node seul.

## Principes

- **L'isolation est dans la base, pas dans les requêtes.** La sécurité au niveau des lignes (RLS)
  est activée et forcée sur chaque table ; une requête écrite sans filtre d'organisation ne rend
  rien au lieu de tout rendre. Les règles exactes sont dans l'ADR 0013.
- **Le contexte est posé par transaction**, jamais par session : `withOrg` ouvre une transaction,
  pose `jadwal.org_id` pour elle seule, et le contexte disparaît avec elle, même après une erreur.
- **Les migrations sont des fichiers SQL versionnés**, produits par Drizzle Kit et relus avant
  d'être commités. Aucune synchronisation automatique du schéma (`drizzle-kit push` n'est pas
  utilisé).
- **Les identifiants sont des UUID v7 générés par l'application** (ADR 0014), parce qu'ils servent
  aussi d'UID dans le flux agenda.

## Schéma

| Table                | Ce qu'elle porte                                                                 |
| -------------------- | -------------------------------------------------------------------------------- |
| `organization`       | slug, nom, fuseau IANA canonique, couleur d'accent, langues, plan, statut        |
| `user`               | courriel unique sans égard à la casse, nom, statut super-admin                   |
| `membership`         | qui est `org_admin` ou `editor` dans quelle organisation                         |
| `room`               | salles de l'organisation et leur ordre d'affichage                               |
| `course`             | public, langues, salle, intervenant, rythme et horaire en colonnes explicites    |
| `course_translation` | titre et description par langue, la langue source étant obligatoire              |
| `session_exception`  | séance annulée, ou déplacée vers une autre date et une autre heure               |
| `pause`              | période sans séance, pour un cours ou pour toute l'organisation                  |
| `prayer_day`         | les cinq heures d'un jour, importées ou calculées (remplie à l'étape 7)          |
| `prayer_settings`    | méthode de calcul et ajustements par prière (étape 7)                            |
| `audit_log`          | qui a fait quoi, avec l'état avant et après ; insertion seule (ADR 0015)         |
| `admin_access_log`   | le registre interne des accès du super-admin, hors de portée des organisations   |
| `invitation`         | une adresse invitée, son rôle, son statut et qui l'a acceptée (ADR 0017)         |
| `terms_acceptance`   | qui a accepté quelle version des conditions, et quand ; insertion seule          |
| `session`            | les sessions de Better Auth, plus la preuve de passkey et l'organisation choisie |
| `account`            | exigée par Better Auth ; sa colonne de mot de passe reste vide                   |
| `verification`       | les jetons de lien magique, stockés hachés                                       |
| `rate_limit`         | les compteurs de débit, en base pour être partagés entre les instances           |
| `passkey`            | les passkeys du super-admin (ADR 0025)                                           |

Le rythme et l'horaire d'un cours reprennent colonne par colonne le modèle de `@jadwal/core` : pas
de chaîne `RRULE` en base, elle n'est produite qu'à l'export agenda (ADR 0003). Des contraintes de
vérification imposent que chaque forme porte ses colonnes et seulement les siennes : un cours
hebdomadaire a ses jours, son intervalle et sa semaine d'ancrage, et rien des autres formes.

## Rôles

| Rôle                | À quoi il sert                       | Attributs                                      |
| ------------------- | ------------------------------------ | ---------------------------------------------- |
| rôle du serveur     | créer les rôles et la base de test   | superutilisateur ; ne sert qu'à l'amorçage     |
| `jadwal_owner`      | migrations, données de démonstration | possède tout ; `NOSUPERUSER`, `NOBYPASSRLS`    |
| `jadwal_app`        | toutes les requêtes de l'application | `NOSUPERUSER`, `NOBYPASSRLS`, non propriétaire |
| `jadwal_superadmin` | toutes les organisations (ADR 0025)  | `NOSUPERUSER`, `NOBYPASSRLS`, non propriétaire |
| `jadwal_auth`       | sessions, liens magiques, passkeys   | `NOSUPERUSER`, `NOBYPASSRLS`, non propriétaire |

`scripts/bootstrap-roles.mjs` crée les quatre rôles, leur pose un mot de passe lu dans
l'environnement, et ramène leurs attributs à ce qu'ils doivent être. Rien de secret n'est dans le
dépôt. C'est ce script, et non les migrations, qui répare un rôle qui aurait dérivé : Drizzle ne
rejoue pas un fichier déjà appliqué.

Le propriétaire est lui aussi soumis à la sécurité au niveau des lignes (ADR 0019) : hors d'une
transaction qui déclare `set local jadwal.maintenance = 'on'`, il ne voit rien et n'écrit rien. C'est
voulu. Attention : une écriture refusée par la RLS ne lève pas toujours — une insertion crie, mais un
`update` ou un `delete` rend simplement « 0 ligne ». Un script d'entretien doit donc vérifier le
nombre de lignes touchées, pas seulement l'absence d'erreur. Une exception, écrite comme limite dans
l'ADR 0019 : le propriétaire garde `TRUNCATE`, qui n'examine aucune politique, et peut vider une
table sans son drapeau, journal d'audit compris. `test/owner-truncate.test.ts` fixe cette limite.

Une organisation n'attache personne : c'est la personne invitée qui crée son adhésion en acceptant,
et la politique d'écriture n'autorise une adhésion que pour soi-même, après une invitation acceptée
(ADR 0017). Sans cela, une organisation fabriquait l'adhésion qui lui ouvrait la lecture d'une
personne d'une autre organisation : la vérification d'une clé étrangère contourne toujours la
sécurité au niveau des lignes. L'adhésion porte le rôle de l'invitation, et aucun autre : la
fonction que lit la politique reçoit le rôle de la ligne à insérer (migration 0058). Une invitation
ne vaut qu'une fois. L'adhésion créée la marque consommée (« joined ») ; si la personne qui accepte
est déjà membre, c'est l'acceptation elle-même qui la consomme, sans créer d'adhésion (migration
0058). Le super-admin n'est pas concerné : il crée une adhésion sans invitation, dans
l'organisation où il est entré (ADR 0025).

La base tient aussi les passages de statut d'une invitation, pour tous les rôles de connexion,
super-admin compris (migration 0058). Une invitation naît en attente, acceptée par personne, sans
date de réponse ; en attente, elle est acceptée ou annulée ; acceptée, elle est consommée ;
consommée ou annulée, elle ne bouge plus. Seule la personne à qui elle est adressée l'accepte, à
son propre nom, et cette acceptation ne passe jamais à un autre compte. La date de réponse est
l'heure de la transaction qui répond, écrite une fois pour toutes : la purge des invitations
résolues compte ses quatre-vingt-dix jours depuis elle. Un déclencheur refuse tout le reste avec
`restrict_violation`, et un message qui nomme la règle. Seul le propriétaire, sous son drapeau
d'entretien, en sort. Retirée, une personne ne revient donc pas avec la même invitation : il faut
l'inviter de nouveau. `pg_restore` d'une sauvegarde complète recrée les déclencheurs après les
lignes ; une restauration des seules données, dans un schéma déjà en place, passe
`--disable-triggers`.

**Limite.** Pour le rôle applicatif, la base ne sépare pas l'éditeur du responsable à l'intérieur
d'une organisation : toute personne qui a le contexte de l'organisation peut, par un appel direct,
s'écrire une invitation, de n'importe quel rôle, à sa propre adresse, l'accepter et adhérer avec ce
rôle, comme elle peut changer le rôle d'une adhésion, le sien compris (migration 0053). C'est
l'écran des membres qui réserve ces gestes aux personnes responsables.

Une invitation dure quatorze jours au plus, et la base le tient (migration 0056) : une contrainte
borne la durée écoulée entre `created_at` et `expires_at`, sans dépendre du fuseau de la session, et
`created_at` est posé par le serveur : aucun rôle de connexion ne peut le nommer. Une invitation
échue ne passe jamais à « accepted », quel que soit le rôle, et ne change pas de mains une fois
acceptée : un déclencheur le refuse avec `restrict_violation`. Le retour à vide de `accepted_by`
reste permis : c'est ce que fait la suppression d'un compte, par la clé étrangère. Sans cela, un
compte qui porte une acceptation échue ne se supprimerait plus, et la purge des comptes échouerait
en entier. L'adhésion, elle, exige une acceptation qui court encore (migration 0057). La durée est
aussi celle de l'écran des membres (`INVITATION_DAYS`) : `test/invitation-expiry.test.ts` rejoue la
fin que pose l'écran sous deux fuseaux et échoue si les deux divergent, d'une seconde ou d'une heure.

Le rôle de connexion écrit dans la table des comptes, qui est une table du métier. Ses droits y sont
bornés colonne par colonne, et une politique lui interdit la valeur `true` sur le drapeau
super-admin : un droit dit quelles colonnes on peut nommer, seule une politique dit quelle valeur on
y met.

Depuis l'étape 4, le rôle super-admin lit et écrit dans **toutes** les organisations, sans fenêtre à
ouvrir (ADR 0025). Ses politiques restent bornées par `jadwal.current_org_id()` : ce n'est plus une
barrière — il entre où il veut — c'est le garde-fou qui l'empêche de modifier la mauvaise
organisation par inadvertance. Deux tables lui échappent quand même : le journal d'audit, qui reste
en insertion seule pour lui aussi, et les passkeys, qui appartiennent au seul rôle de connexion.
La table des organisations suit la même règle depuis l'étape 17 (migration 0055) : entré dans une
organisation, il ne voit et ne touche plus qu'elle ; sans contexte, dans sa console, il les voit et
les change toutes. Un contexte illisible ne montre rien.

`admin_access_log` est son registre interne : une entrée par requête, lisible de lui seul, en
insertion seule, et hors de portée du rôle applicatif — aucun droit, aucune politique, aucune clé
étrangère qui le rendrait atteignable par une jointure.

`terms_acceptance` garde une ligne par personne, par organisation et par version des conditions
d'utilisation. La version est la date de « Dernière mise à jour » du document, en ISO
(`2026-09-22`) : une contrainte refuse toute autre forme, et une date absente du calendrier. Chacun
lit et ajoute ses propres lignes, dans l'organisation du contexte : la politique exige l'organisation
**et** la personne, donc une transaction qui ne pose que l'organisation n'y voit rien. Personne ne
modifie ni ne supprime, super-admin compris, qui lit sans écrire. Le moment est posé par la base par
le procédé du journal d'audit (ADR 0020) : l'insertion est accordée colonne par colonne, sans
`accepted_at`, et nommer la colonne est refusé. La ligne part avec l'adhésion, par une clé étrangère
en cascade vers `membership` : retirer la personne, supprimer son compte ou supprimer l'organisation
l'efface, sans purge à écrire.

## Lancer la base et les migrations

Depuis la racine du dépôt, avec un fichier `.env` construit à partir de `.env.example`. Les scripts
et les tests le lisent tout seuls ; une variable déjà posée dans l'environnement gagne sur le
fichier, ce qui laisse la CI passer les siennes sans fichier.

```
docker compose -f docker-compose.dev.yml up -d db
pnpm --filter @jadwal/db run bootstrap       # crée les rôles et donne le schéma au propriétaire
pnpm --filter @jadwal/db run migrate         # applique les migrations en attente
pnpm --filter @jadwal/db run seed            # données de démonstration, rejouable
```

L'amorçage passe **avant** les migrations : c'est lui qui crée le propriétaire qui va les jouer.
C'est aussi le seul moment où le rôle du serveur est employé. Les rôles appartiennent au serveur et
non à une base, mais les droits du propriétaire se posent par base : relancer l'amorçage pour chaque
nouvelle base. Il est rejouable à volonté, et c'est lui qui répare un rôle qui aurait dérivé.

### Faire passer une base existante au propriétaire non privilégié

```
pnpm --filter @jadwal/db run bootstrap
pnpm --filter @jadwal/db run transfer-ownership
```

Application arrêtée : chaque changement de propriétaire prend un verrou exclusif bref. Le script est
rejouable et ne touche que ce qui n'appartient pas déjà au propriétaire. `REASSIGN OWNED BY` ne
conviendrait pas : quand l'ancien propriétaire est le rôle d'amorçage du serveur, PostgreSQL refuse
en bloc, parce que ce rôle possède aussi des objets partagés et que la commande est tout ou rien.

## Modifier le schéma

```
pnpm --filter @jadwal/db run generate --name ce_qui_change
```

Drizzle Kit compare `src/schema/index.ts` à l'état précédent et écrit un fichier dans `migrations/`.
Trois choses qu'il ne produit pas et qu'il faut écrire à la main, dans une migration
supplémentaire : `FORCE ROW LEVEL SECURITY`, les `GRANT`, et tout ce qui touche aux rôles. Un
fichier écrit à la main doit être ajouté au journal `migrations/meta/_journal.json`, avec un
horodatage strictement supérieur au précédent.

Un fichier marqué `@rejouable` est rejoué tel quel par `test/migrations.test.ts`, et l'empreinte du
schéma doit en sortir inchangée. Deux pièges, tous deux rencontrés à l'étape 4 : un fichier qui nomme
une table qu'une migration plus récente supprime n'est plus rejouable — il porte alors `@retire` et
dit pourquoi ; et un fichier qui rétablit une décision qu'une migration plus récente renverse défait
cette dernière à chaque rejeu — la section concernée est retirée, et l'en-tête l'explique.

Drizzle Kit pose une question à l'écran dès qu'une politique disparaît en même temps qu'une autre
apparaît sur la même table : il demande s'il s'agit d'un renommage. Sans terminal interactif, il
s'arrête sur `Interactive prompts require a TTY terminal`. Garder le nom d'une politique et ne
changer que son contenu ou son rôle évite la question.

Toute contrainte de vérification passe par l'aide `ck`, qui la clôt par `is true` : sans cela, une
contrainte qui rend NULL accepte la ligne au lieu de la refuser. `test/catalog.test.ts` échoue si
une contrainte oublie l'enveloppe, sans nommer une seule table.

## Purges

Huit procédures, toutes réservées au propriétaire — ni le rôle applicatif ni le super-admin ne
peuvent les appeler. `scripts/purge.mjs` les lance toutes, chaque nuit :

| Procédure                              | Ce qu'elle efface                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| `jadwal.purge_audit_log()`             | les entrées de journal de plus de 24 mois (ADR 0020)                               |
| `jadwal.purge_admin_access_log()`      | les traces d'accès du super-admin de plus de 24 mois                               |
| `jadwal.purge_page_views()`            | les jours du compteur de vues de plus de 25 mois                                   |
| `jadwal.purge_rate_limit()`            | les empreintes du limiteur de débit de plus d'un jour                              |
| `jadwal.purge_expired_sessions()`      | les sessions expirées                                                              |
| `jadwal.purge_expired_verifications()` | les liens de connexion expirés                                                     |
| `jadwal.purge_resolved_invitations()`  | les invitations qui ne sont plus en cours depuis plus de 90 jours                  |
| `jadwal.purge_orphan_accounts()`       | les comptes de plus de 12 mois sans adhésion, session, ni invitation encore valide |

Les six premières bornes sont portées par une **politique**, celles des invitations et des comptes
par la **procédure**. Ce n'est pas une inconséquence : le journal doit résister au propriétaire
lui-même, alors qu'un compte, il peut déjà l'effacer sous son drapeau d'entretien. Une politique
bornée ne lui retirerait rien et donnerait l'illusion d'une garantie.

Sur un serveur, la minuterie `jadwal-purges` lance `scripts/purge.mjs` chaque nuit (étape 9).

## Écrire une migration

**Ne jamais modifier un fichier de migration déjà appliqué.** Drizzle ne compare que l'horodatage de
la dernière migration appliquée : un fichier changé après coup ne serait pas rejoué, et une entrée
antidatée dans `meta/_journal.json` serait ignorée en silence. `test/migrations.test.ts` vérifie que
le journal reste strictement croissant et que chaque fichier y figure.

## Tests

```
pnpm build              # @jadwal/db lit les types publiés de @jadwal/core
pnpm --filter @jadwal/db test
```

Deux ensembles : les tests unitaires (`src/*.test.ts`, sans base) et ceux qui exigent un vrai
PostgreSQL (`test/*.test.ts`). Ces derniers créent leur propre base, y jouent les migrations, et la
détruisent à la fin. **Si le serveur est injoignable, la suite échoue avec un message qui dit quelle
commande lancer** ; elle ne passe jamais en silence.

Tout ce qui touche à l'isolation est joué avec `jadwal_app`, le rôle non privilégié. Un test qui
utiliserait le propriétaire ou un superutilisateur prouverait le contraire de ce qu'il affirme : ces
deux-là échappent aux politiques. Un test le vérifie d'ailleurs explicitement.

Les tests de catalogue lisent les tables dans `pg_class` et `pg_policy` au lieu de les nommer : une
table ajoutée plus tard sans RLS forcée, ou une opération accordée sans politique, fait échouer la
suite sans que personne ait à y penser.

Licence : MIT (voir `LICENSE` à la racine du dépôt).

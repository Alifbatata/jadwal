# ADR 0015 : Journal d'audit en insertion seule

## Contexte

Le cadrage demande un « journal des modifications (qui, quoi, quand) avec retour arrière ». Deux à
trois responsables partagent l'espace d'une organisation ; un cours effacé ou un horaire changé par
erreur doit pouvoir être expliqué et rétabli.

Un journal ne vaut que par ce qu'il empêche. S'il peut être modifié ou effacé par le même rôle que
celui qui écrit les données, il ne prouve rien : une erreur peut être recouverte, et une
compromission du compte applicatif efface ses propres traces. Les politiques de sécurité au niveau
des lignes (ADR 0013) permettent de traiter ce cas à part.

## Décision

- La table `audit_log` enregistre l'organisation, l'auteur, l'action, la table et l'identifiant
  visés, l'état avant et l'état après en JSON, et la date. L'état avant et après sert au retour
  arrière ; il est écrit par l'application, dans la même transaction que la modification qu'il
  décrit.
- Le rôle applicatif reçoit `SELECT` et `INSERT` sur cette table, et **rien d'autre**. Aucun `GRANT`
  `UPDATE` ni `DELETE`, et aucune politique pour ces deux opérations : une tentative échoue avant
  même que la moindre ligne soit examinée, avec un message qui ne dépend pas du contenu de la table.
- La lecture reste limitée à l'organisation, comme partout ailleurs, par une politique `SELECT`.
- Le rôle super-admin ne reçoit pas davantage : il peut lire pour instruire un incident, jamais
  corriger une ligne.
- Une purge éventuelle (conservation limitée dans le temps) relèvera d'une tâche d'entretien jouée
  par le propriétaire, hors du chemin applicatif, et sera décidée par un ADR à ce moment-là.

## Conséquences

- Le journal est fiable : ce qui y est entré y reste, y compris pour le compte qui l'a écrit.
- Un retour arrière ne se fait pas en effaçant une ligne du journal mais en écrivant la modification
  inverse, elle-même journalisée. L'historique raconte la correction au lieu de la dissimuler.
- Une ligne fausse ne peut pas être corrigée par l'application : une erreur de journalisation se
  répare par une nouvelle ligne, ce qui est le comportement voulu.
- La table grossit sans limite tant qu'aucune purge n'est décidée. À l'échelle visée (quelques
  responsables, quelques dizaines de cours par organisation), c'est sans conséquence avant
  longtemps ; l'index sur l'organisation et la date garde les lectures rapides.
- Les données personnelles du journal se limitent à l'identifiant de l'auteur, qui est un
  responsable de l'organisation (ADR 0009 : seules données personnelles du système, les courriels des
  responsables). L'état avant et après ne contient que des données de cours.

## Addendum du 27.09.2026 : l'auteur est la personne connectée

Jusqu'à l'étape 19, la politique d'insertion du rôle applicatif ne demandait qu'un auteur visible
(ADR 0013). Tout membre voit ses collègues : une éditrice pouvait écrire au journal une entrée qui
nommait un collègue comme auteur, ou n'en nommait aucun. Depuis la migration 0063, l'auteur d'une
entrée est la personne du contexte, celle que l'application pose à partir de la session. Une entrée
sans auteur, ou écrite sans personne dans le contexte, est refusée.

Rien ne change pour les autres chemins : le super-admin signe de sa propre identité, que
l'application pose comme pour tout le monde (ADR 0025), et sa politique ne change pas ; le
propriétaire écrit sous son drapeau d'entretien et purge comme avant ; aucun déclencheur n'écrit au
journal.

## Statut

Accepté, 2026-09-20. Étape 2 de la feuille de route (base, RLS, données de démo). Complété le
27.09.2026 : l'auteur d'une entrée est la personne connectée.

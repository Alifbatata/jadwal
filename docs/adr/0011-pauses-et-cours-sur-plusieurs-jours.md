# ADR 0011 : Pauses et cours sur plusieurs jours de la semaine

## Contexte

Le cadrage (`docs/CADRAGE.md`) prévoit un rythme « chaque semaine (un jour) » et « toutes les deux
semaines (un jour) ». En pratique, un même cours a souvent lieu deux ou trois fois par semaine
(par exemple le lundi et le mercredi, avec le même titre, le même intervenant et la même salle) ;
saisir un cours par jour multiplierait les fiches, les traductions et les exceptions.

Par ailleurs, une organisation interrompt ses cours pendant des périodes entières : vacances
scolaires, Ramadan, travaux. Une annulation séance par séance serait fastidieuse et source
d'oublis, et le flux ICS y gagnerait autant d'`EXDATE` que de séances. La même interruption peut
concerner un seul cours (absence de l'intervenant) ou toute l'organisation.

L'étape 1 implémente la récurrence dans `packages/core` (ADR 0003) et doit trancher ces deux points.

## Décision

- Le rythme hebdomadaire porte une **liste de jours de semaine** (`weekdays`, jours ISO 1 = lundi à
  7 = dimanche, non vide, sans doublon) et un intervalle de 1 ou 2 semaines. Avec l'intervalle 2,
  les semaines actives sont celles à distance paire de la semaine (commençant le lundi) qui contient
  `anchorDate` ; tous les jours listés d'une semaine active produisent une séance.
- Une **pause** est une période inclusive `{ from, to }`, rattachée à un cours (`courseId`) ou, sans
  `courseId`, à toute l'organisation. Une date couverte par une pause ne produit aucune occurrence
  pour le ou les cours concernés : la séance n'apparaît ni comme annulée ni autrement.
- Une exception (annulation ou déplacement) dont la date d'origine tombe dans une pause est ignorée :
  la pause l'emporte. En revanche, une séance déplacée vers une date en pause a bien lieu à cette
  date : le déplacement est une décision explicite du responsable, la pause ne supprime que les
  dates du rythme.
- Dans le flux ICS, les dates en pause d'un cours récurrent à heure fixe sont des `EXDATE`, comme
  les annulations ; pour les cours exportés séance par séance, elles sont simplement absentes.
- Les pauses ne comptent pas dans la détection des exceptions orphelines
  (`findOrphanExceptions`) : une exception sur une date en pause reste rattachée à une séance du
  rythme et redevient active si la pause est supprimée.

## Conséquences

- Un cours « lundi et mercredi » est une seule fiche ; le widget, la page publique et le flux ICS
  (un seul VEVENT avec `BYDAY=MO,WE`) le traitent comme tel.
- Une pause d'organisation suspend tous les cours en une saisie ; une pause de cours n'en suspend
  qu'un. Les responsables n'ont plus à annuler séance par séance.
- Le statut `cancelled` reste réservé aux annulations ponctuelles : une séance en pause n'existe
  pas, elle ne peut donc pas être affichée « barrée ». C'est le comportement voulu pour des
  vacances, mais il faut annuler explicitement une séance isolée que l'on veut montrer barrée.
- Une exception saisie dans une pause n'a pas d'effet tant que la pause dure : l'interface
  (étape 4) devra le signaler au responsable.
- Le modèle de la base (étape 2) porte les pauses dans une table à part, avec `courseId` nullable.

## Statut

Accepté, 2026-09-20. Étape 1 de la feuille de route (`core` et ses tests).

# ADR 0000 : modèle d'une décision d'architecture

Chaque décision structurante du projet est consignée dans un fichier `docs/adr/NNNN-titre.md`,
numéroté dans l'ordre d'écriture. Une décision n'est jamais modifiée après coup : si elle change,
un nouvel ADR la remplace et l'ancien passe au statut « Remplacé par ADR `NNNN` ».

Un ADR tient sur une page et suit exactement les quatre sections ci-dessous.

## Contexte

Le problème à résoudre, les contraintes et les options considérées. Faits uniquement, pas de plaidoyer.

## Décision

Ce qui est décidé, formulé à l'indicatif présent (« Nous stockons... », « Le widget est... »).

## Conséquences

Ce que la décision entraîne, en bien comme en mal : ce qui devient plus simple, ce qui devient
plus contraignant, ce qui est reporté à une étape ultérieure de la feuille de route.

## Statut

L'un de : « Proposé », « Accepté », « Remplacé par ADR `NNNN` », « Obsolète », suivi de la date
(`AAAA-MM-JJ`) et, si utile, de l'étape de la feuille de route concernée.

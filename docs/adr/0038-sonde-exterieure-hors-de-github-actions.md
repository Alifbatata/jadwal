# 0038 — La sonde extérieure sort de GitHub Actions

- **Statut** : acceptée
- **Date** : 2026-09-21
- **Modifie** : [ADR 0036](0036-taches-periodiques-et-veille.md), qui confiait la sonde extérieure à
  GitHub Actions.

## Le problème

La veille qui tourne sur le serveur sait tout, sauf une chose : si le serveur est injoignable, elle
est injoignable avec lui. Il faut donc quelqu'un dehors. L'ADR 0036 avait choisi GitHub Actions,
parce que c'était gratuit et déjà là.

Deux défauts, et le premier est rédhibitoire.

1. **Les machines de GitHub n'ont pas d'IPv6 sortant.** Le service publie un enregistrement `AAAA`,
   et la moitié de sa surface publique n'était donc jamais éprouvée depuis l'extérieur. Un serveur
   qui répond en IPv4 et se tait en IPv6 — un pare-feu asymétrique, une règle oubliée, un conteneur
   publié sur une seule pile — passait inaperçu. L'ADR 0036 le disait déjà et s'en remettait à la
   veille interne, c'est-à-dire à quelqu'un qui n'est pas dehors.
2. **Les minutes ne sont pas gratuites, et les exécutions programmées sont « au mieux ».** Une sonde
   toutes les quinze minutes consomme un quota qui sert par ailleurs à construire et à publier
   l'image ; et un retard de plusieurs minutes est normal, ce qui oblige à rendre l'alerte molle
   pour éviter le faux positif — donc à la rendre lente.

S'ajoute une raison qui n'est pas technique : l'alerte partait par SMTP depuis un workflow, ce qui
demandait de confier des identifiants de messagerie à la forge qui héberge le code public.

## La décision

**La sonde extérieure quitte GitHub Actions.** Elle est remplacée par deux mécanismes distincts, qui
ne partagent aucun point de défaillance avec le serveur surveillé :

1. **Une machine tierce**, sur un autre réseau et chez un autre hébergeur, interroge
   `/healthz` toutes les cinq minutes, **en IPv4 et en IPv6 séparément**, et signale chaque succès à
   un service de supervision par battement de cœur. Elle n'a aucun autre rôle, tourne sous un compte
   dédié sans privilège, et ne détient aucun secret du service.
2. **Un service de supervision par battement de cœur** (Healthchecks) reçoit ces signaux, et **c'est
   lui qui alerte** quand un signal attendu n'arrive pas. Le renversement est tout l'intérêt : ce
   n'est plus à celui qui tombe de prévenir qu'il est tombé.

Le même service reçoit un battement de chaque tâche périodique du serveur, et un battement
trimestriel du test de déchiffrement complet.

Le workflow `supervision.yml` est supprimé, avec les variables et secrets SMTP qu'il réclamait.
GitHub ne reçoit plus rien du service et n'en est plus un sous-traitant.

## Ce qu'un battement de cœur transporte

**Un code de sortie et un court message technique, rien d'autre.** Jamais une ligne de la base,
jamais une adresse électronique, jamais un identifiant d'organisation. En cas d'échec, la sonde
envoie l'erreur de `curl` — « couldn't connect to host », un code HTTP — et le nom de la tâche. Ce
que le service de supervision apprend de plus que le public, c'est qu'un service existe et qu'il va
bien ou mal.

## Pourquoi pas la veille interne seule

Parce qu'elle tombe avec le serveur, et que c'est précisément le cas qu'on veut couvrir. Les deux se
complètent : la veille interne voit ce que l'extérieur ne peut pas voir — disque, certificat, tâches
muettes, verrous — et l'extérieur voit ce que l'intérieur ne peut pas voir : l'absence.

## Ce qui reste hors de ce dépôt

Le nom de la machine tierce, son compte, son fournisseur, ses adresses, et les adresses de battement
— qui sont des jetons — vivent dans le dépôt privé de l'exploitation. Ce dépôt ne décrit que la
forme : une sonde dehors, deux piles, cinq minutes, une marge de dix, et un service qui alerte.

## Ce que l'on perd

- **Une dépendance de plus**, et elle est dans le chemin de l'alerte. Si le service de supervision
  tombe, personne ne prévient. C'est accepté : il est plus simple et plus surveillé que ce qu'il
  surveille, et son silence se remarque.
- **Une machine de plus à tenir à jour**, même si elle ne fait rien d'autre que `curl`.

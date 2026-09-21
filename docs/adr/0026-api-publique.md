# ADR 0026 : API publique — contrat, cache et limites

## Contexte

Le cadrage promet quatre sorties à partir d'une seule saisie : un widget, une page publique, un flux
agenda et des messages prêts à coller. Les trois premières lisent les mêmes données. Le widget de
l'étape 6 tournera sur le site d'une mosquée, donc sur une autre origine, et une mosquée qui
s'auto-héberge servira la sienne. Il faut donc un contrat, et il faut qu'il tienne.

Deux questions se posaient avant d'écrire une seule route.

**Avec quel compte de base lire ?** Le rôle applicatif exige un contexte d'organisation, qu'on ne
peut pas poser avant d'avoir résolu l'identifiant d'URL — et il voit les brouillons. Le rôle
super-admin voit tout. Ni l'un ni l'autre ne convient à une lecture anonyme.

**Comment garder un cache honnête ?** Un programme de cours change rarement, mais quand il change,
la correction doit se voir. Un cache qui sert un cours supprimé est pire que pas de cache.

## Décision

### Un cinquième rôle de base, en lecture seule

`jadwal_public` ne pose **aucun** contexte d'organisation et ne voit que deux choses : les
organisations dont l'état est `active`, et les cours dont l'état est `published`. Toutes ses
politiques passent par celle de l'organisation, donc suspendre une organisation la retire du public
partout à la fois, sans toucher à une autre ligne.

Il n'a aucun droit sur les comptes, les adhésions, les invitations, les journaux, les sessions, les
passkeys ni les réglages de prière : la tentative échoue sur un refus de droit, avant qu'une ligne
soit examinée.

« Un brouillon est invisible » devient ainsi une propriété de la base, et non une clause d'un
`select` qu'une route pourrait oublier. Les routes n'ont rien à filtrer, et c'est le but.

**Une exception**, assumée : il écrit dans le compteur de limitation de débit, qui n'est pas une
donnée d'organisation. Sans elle, il faudrait prêter au côté public le rôle de la connexion — celui
qui tient les jetons de session. Un test vérifie que c'est la seule table qu'il peut écrire.

### Le contrat

Décrit champ par champ dans `docs/API.md`, avec un exemple de réponse. Les noms de champs sont en
anglais, comme le reste du code ; ce sont eux qui ne bougeront pas.

Ce qui ne sort jamais : une adresse, un identifiant de personne, un identifiant de salle, le plan,
l'état de l'organisation, un journal, un réglage interne. Le seul identifiant interne qui sort est
celui d'un **cours publié**, parce qu'un lien en a besoin. Un test parcourt chaque réponse publique
et échoue à la moindre adresse ou au moindre identifiant non prévu.

Un brouillon, un cours archivé, une organisation suspendue et un identifiant inventé rendent tous la
même réponse : `404`, même corps. Le code de réponse ne dit pas qu'une organisation a existé.

Toutes les occurrences viennent de `@jadwal/core`. Aucune route ne calcule de date.

### Le cache

`ETag` fort et `Cache-Control` explicite, `304` sur `If-None-Match`. Deux minutes de fraîcheur pour
le programme, cinq pour les réglages, une heure pour le flux agenda — qui annonce déjà ce
rafraîchissement dans le fichier —, plus une journée de `stale-while-revalidate` : une panne du
serveur ne blanchit pas la page d'une mosquée.

**L'empreinte est calculée à partir des données servies : le plus récent horodatage _et_ le nombre
de lignes** de chaque table qui alimente la réponse. Le comptage n'est pas une précaution de style :
une suppression ne touche aucun `updated_at`, donc sans lui, supprimer un cours laisserait
l'empreinte inchangée et le cache servirait un programme périmé. Un test supprime un cours et
vérifie que l'empreinte change.

L'empreinte inclut aussi ce qui change la réponse à données égales : la langue et la plage. Deux
visiteurs qui demandent des choses différentes ne partagent pas une entrée de cache.

### Les limites

- **120 requêtes par minute et par adresse IP**, compteur en base, donc partagé entre les instances
  comme à l'étape 3. Un widget en appelle trois par page.
- **Plage de dates bornée à 92 jours par le serveur**, quoi que demande l'appelant. Le champ `range`
  de la réponse dit toujours ce qui a réellement été servi : borner en silence sans le dire serait
  mentir.
- **CORS ouvert en lecture**, méthodes `GET, HEAD, OPTIONS`. Aucun en-tête d'authentification n'est
  accepté, et la liste des en-têtes permis est close. Ce que cela ouvre est exactement ce que
  n'importe qui peut déjà lire en tapant l'adresse : il n'y a ni cookie, ni session, donc rien qu'un
  navigateur puisse joindre à la requête à l'insu de son visiteur.
- La réponse d'état ne dit que « je réponds » : ni version, ni nom de machine, ni compte
  d'organisations. Une page d'état qui renseigne un attaquant coûte plus qu'elle ne rapporte.

## Conséquences

- Le widget de l'étape 6 et une instance auto-hébergée liront la même chose, décrite au même endroit.
- Une route publique ne peut pas laisser fuir un brouillon, même écrite distraitement : le compte
  qui lit ne le voit pas.
- Le `304` économise la bande passante, **pas le temps du serveur** : l'empreinte se calcule quand
  même, et sur les données de démonstration une revalidation coûte autant qu'une réponse complète.
  C'est le bon compromis pour un widget qui se rafraîchit souvent sur un réseau mobile, et il faut
  le dire plutôt que de laisser croire à un gain qui n'existe pas.
- Le rôle public est un cinquième mot de passe à poser en production. Il ne donne accès qu'à ce qui
  est déjà public.
- Un changement de contrat demandera `/api/v2/`. C'est le prix d'un contrat.

## Statut

Accepté, 2026-09-20. Étape 5 de la feuille de route (API publique, pages publiques, flux agenda).

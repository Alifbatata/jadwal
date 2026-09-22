# ADR 0014 : UUID v7 générés par l'application

## Contexte

Chaque ligne de la base porte une clé primaire. Deux exigences pèsent sur ce choix.

D'abord, ces identifiants sortent du système : l'identifiant d'un cours et celui d'une organisation
sont repris tels quels dans les `UID` du flux agenda (`<courseId>@<hôte>`, ADR 0003). L'étape 1 a
imposé à ces valeurs de ne contenir ni espace, ni caractère de contrôle, ni virgule, point-virgule,
antislash ou guillemet, et de ne pas finir par `-AAAA-MM-JJ`. Un identifiant doit donc être stable,
opaque et sûr à écrire dans un fichier texte.

Ensuite, l'écriture se fait souvent par lots : créer un cours, ses traductions et sa première
exception dans la même transaction demande de connaître l'identifiant du parent avant d'écrire les
enfants. Un identifiant produit par la base (`DEFAULT`) oblige à relire la ligne insérée, ou à
enchaîner les écritures.

Options considérées : un entier auto-incrémenté (`bigserial`), un UUID v4, un UUID v7, ou un
identifiant textuel court (`cuid2`, `nanoid`). PostgreSQL 18 fournit désormais `uuidv7()` en natif,
utilisable comme valeur par défaut.

## Décision

- Les clés primaires sont des **UUID version 7** (RFC 9562 §5.7 : 48 bits d'horodatage en
  millisecondes, puis version, aléa et variante), stockées dans le type `uuid` de PostgreSQL.
- Elles sont **générées par l'application**, avec la fonction `v7()` du paquet `uuid`, avant
  l'écriture. La base ne pose pas de valeur par défaut : une ligne sans identifiant est refusée.
- Une contrainte de vérification impose le format canonique aux colonnes reprises dans les `UID` de
  calendrier, pour que la règle de l'étape 1 soit tenue par la base et non seulement par le code.
- Le tri d'un UUID v7 suit le temps : les index restent compacts et les listes « les plus récents
  d'abord » n'ont pas besoin d'une colonne de date.

## Conséquences

- Une écriture groupée connaît tous ses identifiants avant d'ouvrir la transaction ; aucun aller-
  retour avec la base, aucun `RETURNING` obligatoire.
- Les identifiants portent une horodatation à la milliseconde, lisible par quiconque obtient un `UID`
  de calendrier (`uuid_extract_timestamp()` la rend). C'est la création de la ligne, une information
  déjà publique pour un cours publié. Aucun identifiant d'utilisateur n'apparaît dans une sortie
  publique (ADR 0009).
- La monotonie est celle du paquet `uuid` : un compteur de 31 bits, amorcé au hasard et incrémenté à
  chaque appel dans la même milliseconde (RFC 9562 §6.2, méthode « Monotonic Random »). Une
  implémentation maison sans compteur perdrait cette garantie une fois sur deux ; c'est la raison
  d'être de cette dépendance, qui reste sans dépendance propre.
- `uuidv7()` de PostgreSQL 18 n'est pas utilisé comme valeur par défaut : la base refuse une ligne
  sans identifiant plutôt que d'en inventer un que l'application ne connaîtrait pas. La fonction
  reste disponible pour un script de maintenance.
- Les identifiants font 36 caractères : un flux agenda et une page publique sont un peu plus lourds
  qu'avec un identifiant court, sans conséquence à l'échelle visée.

## Statut

Accepté, 2026-09-20. Étape 2 de la feuille de route (base, RLS, données de démo).

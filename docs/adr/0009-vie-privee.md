# ADR 0009 : Vie privée

## Contexte

`jadwal` publie le programme des cours d'une mosquée à partir d'une seule saisie par ses
responsables. Le côté public (page publique par organisation, widget, flux ICS, API publique) est
consulté par des visiteurs qui ne se connectent pas. La V1 ne propose pas d'inscription aux
cours : une inscription à un cours de mosquée serait une donnée sensible au sens de la nLPD suisse.

Les seules personnes connues du système sont les responsables, en pratique 2 à 3 par mosquée, qui
se connectent par lien magique reçu par mail, sans mot de passe.

Le même code sert aux deux modes de déploiement : service hébergé par l'auteur, ou
auto-hébergement par une organisation. Les règles du projet imposent l'absence de télémétrie.

Les heures de prière, nécessaires aux cours ancrés sur une prière, ont deux sources possibles :
le calendrier annuel CSV exporté par l'organisation depuis son espace Mawaqit, ou un calcul local
avec la bibliothèque Adhan (MIT), méthode et ajustements par prière réglables par organisation.
Appeler ou scraper Mawaqit est exclu.

## Décision

- La V1 est sans inscription aux cours. Côté public, le système ne traite aucune donnée
  personnelle, ne pose aucun cookie et n'embarque aucun analytics.
- Les seules données personnelles du système sont les emails des responsables.
- L'API publique de `apps/web` est en lecture seule et sans cookie.
- Le logiciel ne contient aucune télémétrie.
- Le logiciel n'appelle jamais Mawaqit et ne le scrape jamais. Les heures de prière viennent d'un
  CSV importé par l'organisation ou d'un calcul local.

## Conséquences

- Un visiteur de la page publique, du widget, du flux ICS ou de l'API publique n'est pas identifié
  et ne laisse aucune donnée personnelle dans le système.
- Les données personnelles à protéger se limitent aux emails des responsables, introduits à
  l'étape 3 (connexion, organisations, rôles, invitations).
- L'API publique et la page publique, prévues à l'étape 5, se conçoivent sans cookie ; l'API est en
  lecture seule.
- Aucune instance, hébergée par l'auteur ou auto-hébergée, ne remonte de télémétrie.
- Pour les heures de prière (étape 7), l'organisation exporte elle-même son calendrier annuel CSV
  depuis son espace Mawaqit et l'importe dans `jadwal` ; à défaut, le calcul local avec Adhan
  s'applique. Cet import ne peut pas être remplacé par un appel à Mawaqit.
- L'inscription aux cours est hors périmètre de la V1. L'introduire, ou ajouter un outil de mesure
  d'audience, reviendrait sur cette décision.

## Amendement de l'étape 7 (2026-09-21)

Deux points de cet ADR bougent. Ils sont détaillés dans l'ADR 0032 ; voici ce qu'ils changent ici.

**Un compteur de vues existe désormais**, ce que la dernière conséquence ci-dessus donnait pour un
retour en arrière. Elle visait un outil de mesure d'audience — de ceux qui suivent un visiteur d'une
page à l'autre. Ce compteur-là n'en est pas un : il incrémente un nombre par organisation, par jour
et par type, dans une table qui n'a aucune autre colonne. Ni adresse, ni cookie, ni `Referer`, ni
identifiant, ni horodatage, et rien gardé en mémoire au-delà de la requête. La phrase « côté public,
le système ne traite aucune donnée personnelle, ne pose aucun cookie et n'embarque aucun analytics »
reste donc vraie mot pour mot, et un test la vérifie en balayant toutes les colonnes de toutes les
tables après des requêtes marquées.

**Le limiteur de débit démentait cet ADR depuis l'étape 5.** Sa table portait des clés en clair —
`email:<adresse>` posée par nous, `<adresse IP>` posée par le limiteur intégré de Better Auth — et
rien ne les effaçait jamais. C'était une contradiction directe avec « un visiteur […] ne laisse
aucune donnée personnelle dans le système ». Depuis l'étape 7 : les clés sont condensées (HMAC-SHA256
salé par le secret de session), les deux volets partagent la même implémentation, une politique de
suppression borne la rétention à un jour, et une migration a effacé ce que l'ancienne version avait
écrit.

## Statut

Accepté, 2026-09-19, étape 0 (amorçage du dépôt) ; amendé le 2026-09-21 (étape 7). Concerne les
étapes 3, 5, 6 et 7 de la feuille de route. Complété par l'ADR 0032.

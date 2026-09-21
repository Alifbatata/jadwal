# ADR 0008 : Hébergement et auto-hébergement

## Contexte

`jadwal` permet à une mosquée, puis plus tard à toute organisation, de publier le programme de ses
cours récurrents à partir d'une seule saisie. La cible de la V1 est constituée des mosquées, qui
utilisent le service gratuitement ; d'autres organisations viendront plus tard, en payant. Aucun
paiement n'est codé en V1.

Le cadrage (`docs/CADRAGE.md`) prévoit deux modes de déploiement avec le même code : un service
hébergé par l'auteur, ou une installation par l'organisation sur son propre serveur.

Les règles du projet imposent qu'aucune valeur fragile ne soit codée en dur : ports, URL et
identifiants passent par des variables d'environnement documentées dans `.env.example`. Le dépôt ne
contient aucune télémétrie et aucun secret.

Nous sommes à l'étape 0 de la feuille de route (dépôt, licences, docs, CI). Le déploiement est
prévu à l'étape 8 : durcissement, déploiement, pose sur le site de la première mosquée.

## Décision

- Le même code sert aux deux modes de déploiement.
- Service hébergé : l'auteur exploite une instance officielle, gratuite pour les mosquées en V1 ;
  plus tard, d'autres organisations y accèdent en payant.
- Auto-hébergement : une organisation installe le service sur son propre serveur, avec un Docker
  Compose documenté.
- L'instance officielle tourne sur un VPS dédié, avec Docker Compose, Caddy et des sauvegardes
  quotidiennes.
- Le VPS dédié est provisionné à l'étape 8.
- `jadwal` est un nom de travail : le nom public et le domaine sont choisis avant le lancement.

## Conséquences

- Toute organisation peut installer le service sur son propre serveur à partir du même code que
  l'instance officielle.
- Rien de ce qui dépend d'un hébergement précis n'est codé en dur : ports, URL et identifiants
  passent par des variables d'environnement documentées dans `.env.example`, pour l'instance
  officielle comme pour une instance auto-hébergée.
- Le Docker Compose d'auto-hébergement doit être documenté. À l'étape 0, le dépôt ne contient que
  `docker-compose.dev.yml` (PostgreSQL pour le développement, utilisé à partir de l'étape 2).
- Le durcissement, le déploiement de l'instance officielle et la pose sur le site de la première
  mosquée sont reportés à l'étape 8 ; le VPS dédié reste à provisionner à cette étape.
- Le nom public et le domaine sont encore à choisir : `jadwal` reste un nom de travail jusqu'au
  lancement.
- Aucun paiement n'est codé en V1 : l'accès payant d'autres organisations est reporté à plus tard,
  avec le paiement prévu après l'étape 8 de la feuille de route.

## Statut

Accepté, 2026-09-19. Étape 0 (amorçage du dépôt) ; mise en œuvre à l'étape 8 (durcissement,
déploiement, pose sur le site de la première mosquée).

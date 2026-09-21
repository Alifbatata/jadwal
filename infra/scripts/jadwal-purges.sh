#!/usr/bin/env bash
# Les six purges de rétention, une fois par jour (ADR 0020, ADR 0030, ADR 0032, ADR 0036).
#
# Une seule unité systemd pour six purges, et non six : elles partagent leur horaire, leur rôle de
# base et leur conséquence, et un échec de l'une doit de toute façon faire lire le journal. Le
# script, lui, les sépare — chaque purge est sa propre transaction, et la sortie dit laquelle a
# emporté combien de lignes. Six unités auraient produit six courriels pour une même panne de base.
#
# Ce qu'aucune de ces purges ne peut faire : dépasser sa borne. Elle est portée par une politique de
# suppression dans PostgreSQL, pas par ce script, et un verrou de conservation la suspend.

# shellcheck source=jadwal-commun.sh
. "$(dirname "$(readlink -f "$0")")/jadwal-commun.sh"
JADWAL_TACHE=purges

trace 'purges de rétention'
dans_app node node_modules/@jadwal/db/scripts/purge.mjs
reussite

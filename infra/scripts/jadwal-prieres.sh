#!/usr/bin/env bash
# Le remplissage quotidien des heures de prière calculées (ADR 0004).
#
# Idempotent : relancé dans la même journée, il ne réécrit rien — l'écriture porte un
# `is distinct from` qui laisse les lignes inchangées, et un jour importé ou saisi à la main n'est
# jamais touché. Relancer cette tâche n'a donc aucune conséquence visible, ce qui est exactement ce
# qu'on veut d'une tâche qu'on relance quand on doute.

# shellcheck source=jadwal-commun.sh
. "$(dirname "$(readlink -f "$0")")/jadwal-commun.sh"
JADWAL_TACHE=prieres

# `dans_init` et non `dans_app` : `prayer-fill.mjs` écrit sous le rôle propriétaire, et le conteneur
# de l'application ne porte plus son mot de passe (ADR 0040).
trace 'remplissage des heures de prière calculées'
dans_init node node_modules/@jadwal/db/scripts/prayer-fill.mjs
reussite

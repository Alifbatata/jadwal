#!/usr/bin/env bash
# « Laquelle de ces archives garde-t-on **sur le disque du serveur** ? » (ADR 0035, ADR 0037)
#
# Sept quotidiennes, quatre hebdomadaires, six mensuelles. La règle est isolée dans ce fichier pour
# une seule raison : elle se teste. `jadwal-retention.sh <répertoire>` écrit, un par ligne, le nom
# des archives à garder, et ne supprime rien lui-même. On peut donc la vérifier sur un répertoire
# jetable rempli de fichiers vides, sans jamais risquer une vraie sauvegarde.
#
# **Elle ne vaut que pour le disque local.** Depuis l'ADR 0037, le serveur n'efface plus rien à
# distance : la rétention des archives envoyées est tenue par le stockage, verrou de conservation et
# cycle de vie, hors d'atteinte d'un attaquant qui aurait pris ce serveur.
#
# Le classement est fait sur la **date du nom**, pas sur la date du fichier : une archive recopiée
# depuis la destination garde son rang. Les noms portent désormais une heure
# (`jadwal-2026-09-21T021503Z.dump.age`) ; les anciens, sans heure, restent lisibles.

set -Eeuo pipefail

repertoire="${1:?répertoire attendu}"
QUOTIDIENNES="${JADWAL_RETENTION_QUOTIDIENNES:-7}"
HEBDOMADAIRES="${JADWAL_RETENTION_HEBDOMADAIRES:-4}"
MENSUELLES="${JADWAL_RETENTION_MENSUELLES:-6}"

# Le jour d'une archive, à partir de son seul nom. `jadwal-2026-09-21T021503Z.dump.age` → 2026-09-21.
jour_de() {
	local reste="${1#jadwal-}"
	reste="${reste%%.*}"
	printf '%s' "${reste%%T*}"
}

noms=()
while IFS= read -r fichier; do
	noms+=("$(basename "$fichier")")
done < <(find "$repertoire" -maxdepth 1 -name 'jadwal-*.dump.age' | sort)

if [ "${#noms[@]}" -eq 0 ]; then
	exit 0
fi

# Les jours représentés, du plus récent au plus ancien. Un jour peut porter plusieurs archives : un
# rattrapage après incident en produit une seconde, et les deux se gardent ou se jettent ensemble.
jours=()
while IFS= read -r jour; do
	jours+=("$jour")
done < <(for nom in "${noms[@]}"; do jour_de "$nom"; done | sort --reverse --unique)

garder=()

# Les jours les plus récents, quel que soit leur jour de semaine.
for jour in "${jours[@]:0:$QUOTIDIENNES}"; do
	garder+=("$jour")
done

# Les dimanches, ensuite : `date +%u` vaut 7 le dimanche.
restant="$HEBDOMADAIRES"
for jour in "${jours[@]}"; do
	[ "$restant" -gt 0 ] || break
	[ "$(date --date="$jour" +%u)" = 7 ] || continue
	garder+=("$jour")
	restant=$((restant - 1))
done

# Les premiers du mois, enfin.
restant="$MENSUELLES"
for jour in "${jours[@]}"; do
	[ "$restant" -gt 0 ] || break
	[ "$(date --date="$jour" +%d)" = 01 ] || continue
	garder+=("$jour")
	restant=$((restant - 1))
done

retenus="$(printf '%s\n' "${garder[@]}" | sort --unique)"
for nom in "${noms[@]}"; do
	if printf '%s\n' "$retenus" | grep --quiet --line-regexp --fixed-strings "$(jour_de "$nom")"; then
		printf '%s\n' "$nom"
	fi
done

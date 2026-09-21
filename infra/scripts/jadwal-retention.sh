#!/usr/bin/env bash
# « Laquelle de ces archives garde-t-on ? » (ADR 0035)
#
# Sept quotidiennes, quatre hebdomadaires, six mensuelles. La règle est isolée dans ce fichier pour
# une seule raison : elle se teste. `jadwal-retention.sh <répertoire>` écrit, un par ligne, le nom
# des archives à garder, et ne supprime rien lui-même. On peut donc la vérifier sur un répertoire
# jetable rempli de fichiers vides, sans jamais risquer une vraie sauvegarde.
#
# Le classement est fait sur la **date du nom**, pas sur la date du fichier : une archive recopiée
# depuis la destination garde son rang.

set -Eeuo pipefail

repertoire="${1:?répertoire attendu}"
QUOTIDIENNES="${JADWAL_RETENTION_QUOTIDIENNES:-7}"
HEBDOMADAIRES="${JADWAL_RETENTION_HEBDOMADAIRES:-4}"
MENSUELLES="${JADWAL_RETENTION_MENSUELLES:-6}"

dates=()
while IFS= read -r fichier; do
	nom="$(basename "$fichier")"
	jour="${nom#jadwal-}"
	jour="${jour%%.*}"
	dates+=("$jour")
done < <(find "$repertoire" -maxdepth 1 -name 'jadwal-*.dump.age' | sort)

if [ "${#dates[@]}" -eq 0 ]; then
	exit 0
fi

garder=()

# Les plus récentes, quel que soit leur jour de semaine.
while IFS= read -r jour; do
	garder+=("$jour")
done < <(printf '%s\n' "${dates[@]}" | sort --reverse | head -n "$QUOTIDIENNES")

# Les dimanches, ensuite : `date +%u` vaut 7 le dimanche.
restant="$HEBDOMADAIRES"
while IFS= read -r jour; do
	[ "$restant" -gt 0 ] || break
	[ "$(date --date="$jour" +%u)" = 7 ] || continue
	garder+=("$jour")
	restant=$((restant - 1))
done < <(printf '%s\n' "${dates[@]}" | sort --reverse)

# Les premiers du mois, enfin.
restant="$MENSUELLES"
while IFS= read -r jour; do
	[ "$restant" -gt 0 ] || break
	[ "$(date --date="$jour" +%d)" = 01 ] || continue
	garder+=("$jour")
	restant=$((restant - 1))
done < <(printf '%s\n' "${dates[@]}" | sort --reverse)

printf '%s\n' "${garder[@]}" | sort --unique | sed -e 's/^/jadwal-/' -e 's/$/.dump.age/'

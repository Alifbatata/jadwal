#!/usr/bin/env bash
# Efface du disque du serveur les archives que la règle de rétention ne désigne pas (ADR 0035, 0037).
#
# **Il ne décide rien.** La règle — sept quotidiennes, quatre hebdomadaires, six mensuelles — vit
# dans `infra/sauvegarde/retention.mjs`, où elle est éprouvée par onze tests, et elle est jouée par
# un conteneur jetable tiré de l'image de l'application, comme celle des destinations. Ce script lui
# donne la liste des noms et efface ce qu'elle ne rend pas.
#
# Le partage est celui-là parce qu'il a coûté cher : la règle a passé une nuit ici, en bash, où elle
# imprimait chaque date sans fin de ligne. `date` recevait quatorze dates collées, répondait
# « invalid date », et la règle ne gardait plus rien — ce script aurait effacé toutes les archives
# locales dès la première nuit. Un défaut de ce genre ne se voit pas à la relecture.
#
# **Elle ne vaut que pour le disque local.** Depuis l'ADR 0037, le serveur n'efface plus rien à
# distance : c'est le cycle de vie du stockage qui s'en charge, hors de sa portée.
#
#     jadwal-retention.sh <répertoire>            efface
#     jadwal-retention.sh <répertoire> --lister   dit seulement ce qu'il garderait

# shellcheck source=jadwal-commun.sh
. "$(dirname "$(readlink -f "$0")")/jadwal-commun.sh"

repertoire="${1:?répertoire attendu}"
mode="${2:-}"

noms=""
while IFS= read -r fichier; do
	noms="$noms$(basename "$fichier")
"
done < <(find "$repertoire" -maxdepth 1 -name 'jadwal-*.dump.age' | sort)

if [ -z "$noms" ]; then
	trace "aucune archive dans $repertoire : rien à faire"
	exit 0
fi

a_garder="$(printf '%s' "$noms" | retention)" \
	|| echec "la règle de rétention n'a pas répondu : rien n'est effacé"

# Une règle qui ne garde rien alors qu'on lui a donné des archives est un défaut, pas une décision.
# On refuse plutôt que d'effacer : le disque local est le premier endroit où l'on cherche une
# archive, et le rattrapage depuis le stockage coûte un rapatriement.
if [ -z "$a_garder" ]; then
	echec "la règle de rétention n'a désigné aucune archive à garder sur $(printf '%s' "$noms" | grep --count .) : refus d'effacer"
fi

if [ "$mode" = "--lister" ]; then
	printf '%s\n' "$a_garder"
	exit 0
fi

efface=0
while IFS= read -r court; do
	[ -n "$court" ] || continue
	if ! printf '%s\n' "$a_garder" | grep --quiet --line-regexp --fixed-strings "$court"; then
		trace "retrait local de $court (hors rétention locale)"
		rm -f "$repertoire/$court" "$repertoire/$court.sha256"
		efface=$((efface + 1))
	fi
done <<< "$noms"

trace "$(printf '%s\n' "$a_garder" | grep --count .) archive(s) gardée(s), $efface effacée(s) du disque local"

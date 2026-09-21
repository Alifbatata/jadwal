#!/usr/bin/env bash
# « Une unité vient d'échouer » : le courriel qui le dit (ADR 0036).
#
# Appelé par `OnFailure=jadwal-alerte@%n.service`, où `%n` est le nom de l'unité qui a échoué.
# systemd le lance **après** l'échec, dans une unité séparée : si l'envoi échoue à son tour, il
# n'entre pas en boucle avec celle qui l'a déclenché.
#
# Le courriel porte le journal des trente dernières lignes de l'unité en cause. C'est ce qu'on veut
# lire à deux heures du matin : pas « la sauvegarde a échoué », mais pourquoi.

# shellcheck source=jadwal-commun.sh
. "$(dirname "$(readlink -f "$0")")/jadwal-commun.sh"

# Le nom de l'unité en échec, que systemd passe en argument. Une vérification explicite
# plutôt que `${1:?…}` : bash ouvre une quote sur l'apostrophe du message, et le script
# ne se lit alors même plus.
unite="${1-}"
if [ -z "$unite" ]; then
	echo "nom de l'unité en échec attendu en premier argument" >&2
	exit 2
fi
hote="$(hostname --fqdn 2>/dev/null || hostname)"

{
	printf "L'unité %s a échoué sur %s, à %s.\n\n" "$unite" "$hote" "$(date --iso-8601=seconds)"
	printf 'État :\n'
	systemctl status --no-pager --lines=0 "$unite" 2>&1 | sed 's/^/  /'
	printf '\nJournal (30 dernières lignes) :\n'
	journalctl --unit "$unite" --no-pager --lines=30 --output=short-iso 2>&1 | sed 's/^/  /'
	printf '\nRelancer à la main :\n  systemctl start %s\n  journalctl -u %s -f\n' "$unite" "$unite"
	printf '\nLa marche à suivre est dans docs/EXPLOITATION.md.\n'
} | courriel "jadwal : $unite a échoué sur $hote"

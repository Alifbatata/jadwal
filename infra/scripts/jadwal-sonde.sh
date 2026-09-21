#!/usr/bin/env bash
# La sonde : est-ce que l'instance répond, par son nom public, sur chaque pile ? (ADR 0038)
#
#     jadwal-sonde.sh 4        interroge en IPv4
#     jadwal-sonde.sh 6        interroge en IPv6
#
# Une pile par exécution, parce que deux piles tombent séparément et que c'est justement la panne
# qu'on veut voir : un service qui répond en IPv4 et se tait en IPv6 — un pare-feu asymétrique, une
# règle oubliée, un conteneur publié sur une seule pile — passe sinon inaperçu. `curl` choisirait
# pour nous ; `-4` et `-6` l'en empêchent.
#
# Elle passe par **le nom public**, `JADWAL_ORIGIN`, donc par le DNS, par le serveur web de l'hôte et
# par TLS. C'est plus que ce que la veille regarde, et c'est le trajet du visiteur.
#
# ## CE QU'ELLE NE VOIT PAS, ET IL FAUT LE SAVOIR
#
# Elle tourne **sur le serveur qu'elle interroge**. Son trafic ressort rarement de la machine : le
# noyau reconnaît sa propre adresse publique et boucle en interne. Un blocage qui ne toucherait que
# les visiteurs — une règle de pare-feu en entrée, un routage cassé chez l'hébergeur, un peering
# mort — ne se verra donc **pas** ici. Ce qu'elle voit, elle, c'est le DNS, le certificat, le serveur
# web et l'application.
#
# Ce qui couvre l'autre moitié n'est pas ce script : c'est le **silence**. Les battements partent
# vers un service de supervision qui, lui, est dehors ; si le serveur s'éteint ou si son réseau est
# coupé, ils cessent d'arriver et c'est ce service qui alerte. La sonde dit « ça va » ; c'est son
# absence qui dit le reste.
#
# ## Pourquoi elle ne sort jamais en erreur
#
# Un échec part en `/fail` vers la supervision, et le script rend 0. Sans cela, l'unité passerait en
# échec, `OnFailure=` enverrait un courriel — un toutes les cinq minutes tant que le service est à
# terre — et l'on aurait deux canaux d'alerte qui disent la même chose, dont un qu'on apprendrait
# très vite à filtrer.

# shellcheck source=jadwal-commun.sh
. "$(dirname "$(readlink -f "$0")")/jadwal-commun.sh"

PILE="${1:-}"
case "$PILE" in
	4 | 6) ;;
	*)
		trace "usage : jadwal-sonde.sh 4|6"
		exit 2
		;;
esac

JADWAL_TACHE="sonde-ipv${PILE}"
ESSAIS="${JADWAL_SONDE_ESSAIS:-3}"
ENTRE_ESSAIS="${JADWAL_SONDE_ENTRE_ESSAIS:-20}"
DELAI="${JADWAL_SONDE_DELAI:-10}"

origine="$(valeur_env JADWAL_ORIGIN)"
if [ -z "$origine" ]; then
	trace "JADWAL_ORIGIN manque : la sonde ne sait pas quelle adresse interroger"
	exit 0
fi

# Une instance sans IPv6 n'a pas à voir sa sonde échouer toutes les cinq minutes pour une adresse
# qu'elle ne publie pas. `JADWAL_SONDE_IPV6=false` la coupe, et c'est un réglage, pas un oubli.
if [ "$PILE" = "6" ]; then
	ipv6="$(valeur_env JADWAL_SONDE_IPV6)"
	if [ "${ipv6:-true}" = "false" ]; then
		trace "JADWAL_SONDE_IPV6=false : sonde IPv6 désactivée pour cette instance"
		exit 0
	fi
fi

url="${origine%/}/healthz"
derniere=""

for essai in $(seq 1 "$ESSAIS"); do
	# `--fail` : un 500 est un échec, pas une réponse. `--location` suit la redirection de :80.
	if sortie="$(curl "-${PILE}" --silent --show-error --fail --location \
		--max-time "$DELAI" --output /dev/null --write-out '%{http_code}' "$url" 2>&1)"; then
		trace "IPv${PILE} $url → $sortie (essai $essai/$ESSAIS)"
		# `battement` et non `reussite` : la sonde ne laisse pas de marque de réussite sur le disque,
		# parce que ce n'est pas la veille locale qui surveille sa fraîcheur — c'est la supervision,
		# dehors, et c'est tout l'objet de l'ADR 0038. Une marque ici ne servirait qu'à se rassurer.
		battement ok "IPv${PILE} ${url} → ${sortie} (essai ${essai}/${ESSAIS})"
		exit 0
	fi
	derniere="$sortie"
	trace "IPv${PILE} essai $essai/$ESSAIS : $derniere"
	[ "$essai" = "$ESSAIS" ] || sleep "$ENTRE_ESSAIS"
done

# Ce qui part en cas d'échec : le message d'erreur de curl, et rien d'autre. Aucune donnée de la base
# n'est à portée de ce script, et il n'en demande aucune.
trace "IPv${PILE} $url : $ESSAIS échecs, dernier : $derniere"
battement fail "IPv${PILE} ${url} : ${ESSAIS} échecs. Dernier : ${derniere}"
exit 0

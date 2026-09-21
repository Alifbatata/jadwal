#!/usr/bin/env bash
# La veille : ce qui remarque le silence (ADR 0036).
#
# Une tâche qui échoue prévient toute seule — `OnFailure=` s'en charge. Une tâche qui **ne se lance
# plus du tout** ne prévient personne : elle ne produit ni sortie, ni code d'erreur, ni ligne de
# journal. C'est le silence qu'on n'entend pas, et c'est exactement ce que cette unité écoute.
#
# Elle tourne toutes les heures et relit des faits, jamais des intentions :
#   — l'âge de la dernière réussite de chaque tâche, comparé au double de sa période ;
#   — l'âge de la dernière restauration complète, celle que l'exploitant joue avec sa clé ;
#   — la place restante sur le disque, là où vit le volume de PostgreSQL comme ailleurs ;
#   — la date d'expiration du certificat, vue depuis le réseau et non depuis la configuration ;
#   — la présence d'une archive de sauvegarde récente ;
#   — les verrous de conservation posés depuis plus de six mois ;
#   — l'état des deux conteneurs et la réponse de `/healthz` sur la boucle locale ;
#   — la réponse du nom public en IPv4 et en IPv6, seule épreuve de l'IPv6 dont nous disposions.
#
# Elle n'envoie **pas** le même courriel toutes les heures : une alerte déjà envoyée dans les
# dernières vingt-quatre heures n'est pas renvoyée. Sans cela, une alerte vraie deviendrait en deux
# jours une alerte qu'on filtre, et la veille se serait détruite elle-même.

# shellcheck source=jadwal-commun.sh
. "$(dirname "$(readlink -f "$0")")/jadwal-commun.sh"
JADWAL_TACHE=veille

JADWAL_SAUVEGARDES="${JADWAL_SAUVEGARDES:-/var/backups/jadwal}"
SEUIL_DISQUE="${JADWAL_SEUIL_DISQUE:-15}"             # pour cent de place libre
SEUIL_CERTIFICAT="${JADWAL_SEUIL_CERTIFICAT:-21}"     # jours avant expiration
# Un trimestre, plus la marge de sept jours du contrôle extérieur : la même cadence est annoncée
# dans docs/EXPLOITATION.md et surveillée par Healthchecks (ADR 0037, ADR 0038). Deux seuils
# différents pour la même chose finiraient par se contredire.
SEUIL_RESTAURATION="${JADWAL_SEUIL_RESTAURATION:-97}" # jours depuis la dernière restauration complète
SEUIL_VERROU="${JADWAL_SEUIL_VERROU:-183}"            # jours qu'un verrou de conservation peut durer
SILENCE="${JADWAL_SILENCE:-86400}"                    # une même alerte, au plus une fois par jour

# Les tâches et leur période, en secondes. L'alerte part au-delà du double : une tâche quotidienne
# qui saute une nuit a pu tomber sur un redémarrage, deux nuits d'affilée ne sont plus un hasard.
PERIODES="prieres:86400 purges:86400 sauvegarde:86400 restauration:604800"

alertes=0

# Une alerte, au plus une fois par période de silence. La clé sert de nom de fichier : elle ne
# contient donc que des lettres, des chiffres et des tirets.
alerter() {
	local cle="$1" sujet="$2" corps="$3"
	mkdir -p "$JADWAL_ETAT/alertes"
	local marque="$JADWAL_ETAT/alertes/$cle"
	if [ -f "$marque" ]; then
		local age=$(($(date +%s) - $(stat --format=%Y "$marque")))
		if [ "$age" -lt "$SILENCE" ]; then
			trace "[$cle] $sujet — déjà signalé il y a ${age}s, silence"
			return 0
		fi
	fi
	trace "[$cle] ALERTE : $sujet"
	printf '%s\n' "$corps" | courriel "jadwal : $sujet" && date --iso-8601=seconds > "$marque"
	alertes=$((alertes + 1))
}

# Une alerte qui redevient vraie doit pouvoir repartir tout de suite : on efface sa marque dès que
# la situation est revenue à la normale.
apaiser() {
	rm -f "$JADWAL_ETAT/alertes/$1"
}

# 1. Les tâches qui ne se lancent plus.
for entree in $PERIODES; do
	tache="${entree%%:*}"
	periode="${entree##*:}"
	marque="$JADWAL_ETAT/reussites/$tache"
	if [ ! -f "$marque" ]; then
		alerter "tache-$tache" "la tâche $tache n'a jamais abouti" \
			"Aucune marque de réussite dans $marque.
La tâche n'a peut-être jamais été lancée depuis l'installation.
  systemctl status jadwal-$tache.timer
  systemctl start jadwal-$tache.service"
		continue
	fi
	age=$(($(date +%s) - $(stat --format=%Y "$marque")))
	if [ "$age" -gt $((periode * 2)) ]; then
		alerter "tache-$tache" "la tâche $tache n'a plus abouti depuis $((age / 3600)) h" \
			"Dernière réussite : $(cat "$marque")
Période attendue : $((periode / 3600)) h. Le seuil d'alerte est le double.
  systemctl list-timers 'jadwal-*'
  journalctl -u jadwal-$tache.service --since '3 days ago'"
	else
		apaiser "tache-$tache"
	fi
done

# 2. La restauration complète, celle que l'exploitant joue avec sa clé privée. Elle n'est pas
#    automatisable ici — la clé n'est pas sur ce serveur, et c'est voulu (ADR 0035). La seule chose
#    que la machine puisse faire, c'est rappeler qu'elle est due.
marque="$JADWAL_ETAT/reussites/restauration-complete"
if [ ! -f "$marque" ]; then
	alerter "restauration-complete" "aucune restauration complète n'a jamais été faite" \
		"La restauration de bout en bout, avec la clé privée, n'a jamais abouti sur ce serveur.
Marche à suivre : docs/EXPLOITATION.md, « Restaurer pour de vrai »."
else
	jours=$((($(date +%s) - $(stat --format=%Y "$marque")) / 86400))
	if [ "$jours" -gt "$SEUIL_RESTAURATION" ]; then
		alerter "restauration-complete" "dernière restauration complète il y a $jours jours" \
			"Dernière réussite : $(cat "$marque")
Au-delà de $SEUIL_RESTAURATION jours, plus personne ne sait si les archives s'ouvrent encore.
Marche à suivre : docs/EXPLOITATION.md, « Restaurer pour de vrai »."
	else
		apaiser "restauration-complete"
	fi
fi

# 3. Le disque : la racine, le point qui porte les volumes Docker, et celui des archives. Ce sont
#    souvent les mêmes ; `df` le dira, et une alerte en double vaut mieux qu'un angle mort.
for point in / /var/lib/docker "$JADWAL_SAUVEGARDES"; do
	[ -d "$point" ] || continue
	occupe="$(df --output=pcent "$point" | tail -n1 | tr -dc '0-9')"
	libre=$((100 - occupe))
	cle="disque-$(printf '%s' "$point" | tr -c 'a-zA-Z0-9' '-')"
	if [ "$libre" -lt "$SEUIL_DISQUE" ]; then
		alerter "$cle" "il reste $libre % de place sur $point" \
			"$(df --human-readable "$point")

Un disque plein arrête la base de jadwal, et toute autre application qui partagerait ce disque."
	else
		apaiser "$cle"
	fi
done

# 4. Le certificat, vu depuis le réseau. La configuration de Caddy peut être parfaite et le
#    renouvellement échouer quand même : c'est la date que présente le serveur qui compte.
origine="$(valeur_env JADWAL_ORIGIN)"
# `https://jadwal.voltia.ch/` → `jadwal.voltia.ch`. Le schéma, le chemin et un éventuel port
# sont retirés séparément : une origine qui en porterait un ferait chercher un certificat pour
# un nom qui n'existe pas.
hote="${origine#*://}"
hote="${hote%%/*}"
hote="${hote%%:*}"
if [ -n "$hote" ]; then
	# `|| true` : sans lui, `set -e` tuerait la veille au moment précis où elle a quelque chose à
	# dire. Une affectation dont la substitution échoue fait sortir le script, et un serveur qui
	# ne présente plus de certificat ferait taire la surveillance au lieu de la déclencher.
	fin="$(echo | openssl s_client -connect "$hote:443" -servername "$hote" 2> /dev/null \
		| openssl x509 -noout -enddate 2> /dev/null | cut -d= -f2 || true)"
	if [ -z "$fin" ]; then
		alerter "certificat" "impossible de lire le certificat de $hote" \
			"La connexion TLS à $hote:443 n'a rien rendu.
  systemctl status caddy
  journalctl -u caddy --since '1 hour ago'"
	else
		jours=$((($(date --date="$fin" +%s) - $(date +%s)) / 86400))
		if [ "$jours" -lt "$SEUIL_CERTIFICAT" ]; then
			alerter "certificat" "le certificat de $hote expire dans $jours jours" \
				"Expiration : $fin
Caddy renouvelle normalement à trente jours. S'il ne l'a pas fait, il a une raison :
  journalctl -u caddy --since '2 days ago' | grep -i acme"
		else
			apaiser "certificat"
			trace "certificat de $hote : $jours jours restants"
		fi
	fi
fi

# 5. Une archive de sauvegarde récente sur le disque. La marque de réussite dit que la tâche a
#    abouti ; ceci dit qu'il en reste quelque chose.
recente="$(find "$JADWAL_SAUVEGARDES" -maxdepth 1 -name 'jadwal-*.dump.age' -mtime -2 2> /dev/null | head -n1 || true)"
if [ -z "$recente" ]; then
	alerter "archive" "aucune archive de sauvegarde de moins de deux jours" \
		"Rien de récent dans $JADWAL_SAUVEGARDES.
  systemctl status jadwal-sauvegarde.timer
  journalctl -u jadwal-sauvegarde.service --since '3 days ago'"
else
	apaiser "archive"
	trace "archive récente : $(basename "$recente")"
fi

# 6. Les verrous de conservation posés depuis trop longtemps. Un verrou suspend une purge : oublié,
#    il garde indéfiniment des données qui auraient dû partir, c'est-à-dire exactement ce que la
#    politique de rétention promet de ne pas faire (ADR 0030).
vieux="$(dans_app node node_modules/@jadwal/db/scripts/retention-hold.mjs list --anciens "$SEUIL_VERROU" 2> /dev/null || true)"
if [ -n "$vieux" ]; then
	alerter "verrous" "un verrou de conservation dure depuis plus de six mois" \
		"$vieux

Un verrou suspend la purge du journal d'audit et du registre interne de son organisation.
Le lever quand le litige est clos :
  docker compose exec -T app node node_modules/@jadwal/db/scripts/retention-hold.mjs lift <identifiant>"
else
	apaiser "verrous"
fi

# 7. Les deux conteneurs, et la réponse de `/healthz` depuis le serveur lui-même. La sonde
#    extérieure, posée hors de ce serveur (ADR 0038), dit si le service répond au monde ; celle-ci
#    dit si c'est le
#    service ou le chemin qui manque, et ce n'est pas la même panne.
etat="$(compose ps --format '{{.Service}} {{.State}} {{.Health}}' 2> /dev/null || true)"
if printf '%s\n' "$etat" | grep --quiet --extended-regexp '(exited|restarting|unhealthy)'; then
	alerter "conteneurs" "un conteneur de jadwal ne va pas bien" \
		"$etat

  docker compose -f $JADWAL_COMPOSE --env-file $JADWAL_ENV logs --tail 50"
else
	apaiser "conteneurs"
fi

port="$(valeur_env JADWAL_APP_PORT)"
port="${port:-3080}"
if ! curl --silent --fail --max-time 10 "http://127.0.0.1:$port/healthz" > /dev/null; then
	alerter "healthz" "/healthz ne répond pas sur la boucle locale" \
		"http://127.0.0.1:$port/healthz n'a pas rendu 200.
Le service est en cause, pas Caddy ni le réseau.
  docker compose -f $JADWAL_COMPOSE --env-file $JADWAL_ENV logs --tail 50 app"
else
	apaiser "healthz"
fi

# 8. Le service, vu de l'extérieur, en IPv4 **et** en IPv6. Ce n'est pas une répétition du point
#    précédent : celui-ci passe par le nom public, donc par le DNS, par Caddy et par TLS. Et c'est
#    le second endroit où l'IPv6 est éprouvée : la sonde extérieure l'interroge elle aussi, depuis
#    une machine tierce qui, elle, a bien une IPv6 sortante (ADR 0038). Le serveur, lui, joint sa
#    propre adresse publique sans difficulté.
if [ -n "$hote" ] && [ "${origine#https://}" != "$origine" ]; then
	for famille in 4 6; do
		if curl --silent --fail --max-time 15 "--ipv$famille" "https://$hote/healthz" > /dev/null; then
			apaiser "public-ipv$famille"
			trace "https://$hote/healthz répond en IPv$famille"
		else
			alerter "public-ipv$famille" "le service ne répond pas en IPv$famille sur $hote" \
				"https://$hote/healthz est injoignable en IPv$famille depuis le serveur lui-même.
Si la boucle locale répond et pas celle-ci, la panne est entre Caddy et le réseau :
  systemctl status caddy
  ss -tlnp | grep ':443'
  dig +short A $hote ; dig +short AAAA $hote"
		fi
	done
fi

trace "veille terminée, $alertes alerte(s) envoyée(s)"
reussite

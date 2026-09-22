#!/usr/bin/env bash
# Le socle commun des tâches périodiques de jadwal (ADR 0036).
#
# Rien ici ne s'exécute tout seul : ce fichier se fait inclure par les autres. Il tient trois
# choses, et trois seulement — où sont les fichiers, comment appeler Compose, comment laisser une
# trace de ce qui a réussi.
#
# Les secrets ne sont **jamais** chargés dans l'environnement du script : ils restent dans
# `/etc/jadwal/jadwal.env`, que seul root peut lire, et c'est Docker qui les y prend au moment où il
# lance le conteneur (`--env-file`). Un script qui les aurait sourcés les exposerait à tout ce qu'il
# lance ensuite, et à `/proc/<pid>/environ`.

set -Eeuo pipefail

JADWAL_RACINE="${JADWAL_RACINE:-/opt/jadwal}"
JADWAL_ETAT="${JADWAL_ETAT:-/var/lib/jadwal}"
JADWAL_ENV="${JADWAL_ENV:-/etc/jadwal/jadwal.env}"
# Ce que Compose lit pour interpoler : ni secret, ni lu par personne d'autre. Voir `compose()`.
JADWAL_COMPOSE_ENV="${JADWAL_COMPOSE_ENV:-/etc/jadwal/compose.env}"
JADWAL_COMPOSE="${JADWAL_COMPOSE:-$JADWAL_RACINE/compose/docker-compose.yml}"

# Le nom de la tâche, pour les traces et pour la marque de réussite. Chaque script le pose.
JADWAL_TACHE="${JADWAL_TACHE:-jadwal}"

trace() {
	# Le journal part sur la sortie standard : systemd la range dans le journal de l'unité, avec
	# l'horodatage, l'unité et le code de sortie. Réécrire un fichier de log à côté ne ferait que
	# créer un deuxième endroit où chercher, et un troisième à faire tourner.
	printf '%s %s\n' "$(date --iso-8601=seconds)" "$*"
}

echec() {
	trace "ÉCHEC : $*"
	battement fail "$*"
	exit 1
}

# Une valeur du fichier d'environnement, lue sans sourcer le fichier. `tail -n1` parce qu'une clé
# répétée vaut sa dernière occurrence, comme pour Docker.
valeur_env() {
	local cle="$1"
	sed -n "s/^${cle}=//p" "$JADWAL_ENV" | tail -n1
}

# Compose, et le fichier qu'il lit pour interpoler.
#
# **Ce n'est pas `jadwal.env`, et c'est le point.** Compose ne se contente pas de lire le fichier
# qu'on lui donne : il développe les références de variables **à l'intérieur de ses valeurs**. Le mot
# de passe SMTP contient un « $ » ; à chaque appel, Compose y voyait une référence qu'il ne savait pas
# résoudre, et il la nommait dans un avertissement :
#
#     level=warning msg="The \"o4\" variable is not set. Defaulting to a blank string."
#
# Deux caractères d'un secret, recopiés dans le journal des unités à chaque passage de chaque tâche,
# c'est-à-dire toutes les heures. `compose.env` ne porte que l'image, le port et la taille de corps :
# il n'y a plus rien à y développer.
compose() {
	docker compose --file "$JADWAL_COMPOSE" --env-file "$JADWAL_COMPOSE_ENV" "$@"
}

# Un client PostgreSQL — `pg_dump`, `pg_restore`, `psql` — dans le conteneur de la base.
#
# **Le mot de passe est lu dans le conteneur**, depuis sa propre variable `POSTGRES_PASSWORD`, et
# nulle part ailleurs : il ne passe ni par l'environnement de ce script, ni par sa ligne de commande,
# ni par `ps`, ni par le journal de l'unité. C'est la même règle que pour le reste des secrets.
#
# Sans cela, `pg_dump` se connecte à la socket locale de son propre conteneur **sans mot de passe** :
# l'image officielle de PostgreSQL n'accorde pas `trust` en local, elle demande `scram-sha-256`.
# `pg_dump` affiche alors « Password: » sur une entrée qui n'existe pas, puis « fe_sendauth: no
# password supplied », et la sauvegarde échoue. Ce défaut a survécu à tous les `--check` : aucune
# tâche `shell` ne tourne en mode vérification. C'est la première sauvegarde réelle qui l'a montré.
dans_db() {
	compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"' sh "$@"
}

# Un battement de cœur vers le service de supervision (ADR 0038).
#
# Le renversement est tout l'intérêt : ce n'est plus à celui qui tombe de prévenir qu'il est tombé.
# Une tâche qui ne se lance plus du tout ne produit aucun échec, donc aucun courriel ; en revanche
# elle cesse de battre, et c'est le service de supervision qui s'en aperçoit, de dehors.
#
# **Un battement ne transporte aucune donnée de la base** : le nom de la tâche, un état, et au plus
# une ligne technique — un message d'erreur de `pg_dump`, un code HTTP. Jamais un cours, jamais une
# adresse électronique, jamais un identifiant d'organisation.
#
# Il ne fait jamais échouer la tâche : `--max-time` court, erreurs avalées. Une supervision qui
# casserait ce qu'elle surveille serait pire que pas de supervision. Et si l'adresse manque du
# fichier d'environnement, on le dit dans le journal et l'on continue : l'instance qui s'auto-héberge
# n'a pas à installer un service tiers pour faire tourner jadwal.
battement() {
	local etat="$1" message="${2:-}" adresse variable
	variable="JADWAL_PING_$(printf '%s' "$JADWAL_TACHE" | tr '[:lower:]-' '[:upper:]_')"
	adresse="$(valeur_env "$variable")"
	if [ -z "$adresse" ]; then
		trace "$variable absent de $JADWAL_ENV : pas de battement de cœur"
		return 0
	fi
	[ "$etat" = "ok" ] || adresse="$adresse/$etat"
	curl --silent --show-error --max-time 10 --retry 2 --retry-all-errors \
		--data-raw "${message:0:500}" --output /dev/null "$adresse" \
		|| trace "le battement de cœur n'est pas parti (sans conséquence sur la tâche)"
}

# Une commande Node dans le conteneur de l'application, qui tourne déjà. `exec -T` : pas de pseudo
# terminal, sinon la sortie arrive dans le journal truffée de retours chariot.
#
# Ce conteneur n'a **que** les rôles applicatifs : ni le superutilisateur de PostgreSQL, ni le
# propriétaire du schéma (ADR 0040). Ce qui a besoin de l'un des deux passe par `dans_init`.
dans_app() {
	compose exec -T app "$@"
}

# Une commande Node avec les deux mots de passe privilégiés (ADR 0040) : le superutilisateur de
# PostgreSQL et le propriétaire du schéma.
#
# `run` et non `exec`, parce que le conteneur de démarrage **ne tourne pas** : il a fait son travail
# au déploiement et s'est arrêté. `run` en tire un neuf de la même image, avec `init.env`, le temps
# d'une commande.
#
#   `--rm`      sinon un conteneur mort s'accumule à chaque passage de chaque tâche ;
#   `--no-deps` **le point qui compte.** Mesuré : un `run` ne redémarre pas une dépendance saine,
#               mais il la **recrée** dès que le fichier Compose du disque a changé. Entre la copie
#               d'un nouveau fichier Compose par le playbook et le `up` qui suit, une tâche
#               périodique sans `--no-deps` recréerait le conteneur PostgreSQL de production ;
#   `-T`        pas de pseudo terminal, sinon la sortie arrive truffée de retours chariot.
#
# C'est plus cher qu'un `exec` — un conteneur à créer plutôt qu'un processus à lancer — et c'est le
# prix assumé pour que le service exposé à Internet ne porte plus ces deux mots de passe. Les tâches
# qui en ont besoin passent une fois par jour, et la veille une fois par heure.
dans_init() {
	compose run --rm --no-deps -T init "$@"
}

# L'instant que systemd rend pour une propriété de date, en secondes depuis l'époque.
#
# `systemctl show --property=LastTriggerUSec --value` ne rend **pas** des microsecondes, malgré son
# nom : systemd 255 imprime une date lisible — `Tue 2026-09-22 00:23:30 UTC` — et une **chaîne vide**
# quand la minuterie ne s'est jamais déclenchée. `--timestamp=unix` n'y change rien.
#
# Relevé sur la machine, après avoir vu cinq tâches déclarées « jamais déclenchées » alors que
# `systemctl list-timers` en montrait une qui venait de tourner. Lire une propriété, ce n'est pas
# deviner son format d'après son nom.
#
# Les trois cas, et rien d'autre : vide (jamais), un nombre (des microsecondes, systemd plus ancien),
# une date (on la fait traduire). Ce qui ne se lit pas rend 0, c'est-à-dire « jamais » : mieux vaut
# se taire que de reprocher à une tâche une heure qu'on n'a pas su lire.
epoch_systemd() {
	local valeur="${1-}"
	case "$valeur" in
		'' | 'n/a') printf '0\n'; return ;;
		*[!0-9]*) ;;
		*) printf '%s\n' "$((valeur / 1000000))"; return ;;
	esac
	date --date="$valeur" +%s 2>/dev/null || printf '0\n'
}

# Une tâche périodique est-elle muette, et faut-il s'en inquiéter ?
#
# **La question n'est pas « quand a-t-elle réussi pour la dernière fois », mais « a-t-elle réussi
# depuis la dernière fois qu'elle aurait dû ».** C'est systemd qui sait quand la minuterie s'est
# déclenchée ; le script n'a pas à recopier une période, qui finirait par contredire l'`OnCalendar`
# de l'unité.
#
# Ce qui a motivé cette fonction : le soir de la mise en ligne, trois alertes sont parties une demi-
# heure après l'installation, pour trois tâches dont la minuterie ne s'était simplement pas encore
# déclenchée. L'alerte était exacte et inutile, et c'est ainsi qu'on apprend à ignorer ses alertes.
#
#     verdict_tache <charge> <activite> <declenchement> <reussite> <maintenant> <en_cours> <grace>
#
# `declenchement` et `reussite` sont des secondes depuis l'époque, **0 voulant dire « jamais »**.
# `en_cours` vaut `oui` quand le service tourne à cet instant. La fonction ne lit rien, n'écrit rien
# et ne décide de rien d'autre : elle rend un mot.
#
#     absente | inactive | sans-reussite   → il faut alerter
#     jamais  | en-cours | ok              → il n'y a rien à dire
verdict_tache() {
	local charge="$1" activite="$2" declenchement="$3" reussite="$4" maintenant="$5" en_cours="$6" grace="$7"

	# Une minuterie qu'on ne trouve plus, ou qui ne tournera plus, est un vrai problème : elle ne se
	# déclenchera jamais, donc aucun des contrôles suivants ne se déclencherait non plus.
	[ "$charge" = "loaded" ] || { printf 'absente\n'; return; }
	[ "$activite" = "active" ] || { printf 'inactive\n'; return; }

	# Jamais déclenchée depuis l'installation : il n'y a rien à reprocher à une tâche dont l'heure
	# n'est pas encore venue.
	[ "$declenchement" -gt 0 ] || { printf 'jamais\n'; return; }

	# Réussi depuis le dernier déclenchement : tout va bien.
	#
	# `-lt` et non `-le` : une tâche brève écrit sa marque **dans la seconde même** du déclenchement,
	# et les deux instants sont alors égaux. Les juger dans le mauvais sens revient à déclarer qu'elle
	# n'a pas abouti — ce qui s'est vu sur la coupe du journal, qui prend moins d'une seconde.
	[ "$reussite" -lt "$declenchement" ] || { printf 'ok\n'; return; }

	# Pas encore réussi, mais la tâche tourne en ce moment, ou vient d'être déclenchée : on lui
	# laisse le temps de finir. La veille repasse dans une heure.
	[ "$en_cours" != "oui" ] || { printf 'en-cours\n'; return; }
	[ $((maintenant - declenchement)) -gt "$grace" ] || { printf 'en-cours\n'; return; }

	printf 'sans-reussite\n'
}

# La marque de réussite : un fichier par tâche, qui contient la date de la dernière fois où elle est
# allée jusqu'au bout. C'est ce que la veille relit pour dire « cette tâche n'a plus abouti depuis
# trop longtemps » — une tâche qui ne se lance plus du tout ne produit aucun échec, donc aucune
# alerte, et c'est précisément le silence qu'on veut entendre.
reussite() {
	mkdir -p "$JADWAL_ETAT/reussites"
	date --iso-8601=seconds > "$JADWAL_ETAT/reussites/$JADWAL_TACHE"
	trace "réussite enregistrée dans $JADWAL_ETAT/reussites/$JADWAL_TACHE"
	battement ok "$JADWAL_TACHE : terminé"
}

# Un courriel à l'exploitant. Le corps arrive sur l'entrée standard.
#
# Il part par un conteneur jetable tiré de l'image de l'application, parce que nodemailer et la
# configuration SMTP y sont déjà : rien à installer sur l'hôte, et le courriel d'alerte emprunte
# exactement le même chemin que ceux du service. `--no-deps` n'existe pas pour `docker run` ; c'est
# justement l'intérêt de `run` plutôt que de `compose exec` — l'alerte doit partir même quand
# l'application et la base sont à terre, ce qui est le cas le plus fréquent.
courriel() {
	local sujet="$1"
	local image destinataire
	image="$(valeur_env JADWAL_IMAGE)"
	destinataire="$(valeur_env JADWAL_ALERTE_TO)"
	if [ -z "$image" ] || [ -z "$destinataire" ]; then
		trace "ni JADWAL_IMAGE ni JADWAL_ALERTE_TO dans $JADWAL_ENV : pas de courriel possible"
		cat >&2
		return 1
	fi
	docker run --rm --interactive \
		--env-file "$JADWAL_ENV" \
		--volume "$JADWAL_RACINE/scripts/jadwal-mail.mjs:/app/jadwal-mail.mjs:ro" \
		--read-only --tmpfs /tmp \
		--cap-drop ALL --security-opt no-new-privileges:true \
		"$image" node /app/jadwal-mail.mjs "$sujet"
}

# Où part une archive de sauvegarde, et sous quel nom : un chemin par ligne, `quotidien/` en premier
# (ADR 0037).
#
# La règle vit dans `infra/sauvegarde/destinations.mjs`, où elle est éprouvée par onze tests. Elle
# est jouée ici par un conteneur jetable tiré de l'image de l'application, comme l'est déjà le
# courriel d'alerte : l'hôte n'a pas de Node et n'a pas à en avoir un, et surtout la règle n'existe
# qu'à un seul endroit. La recopier en `date +%u` dans ce fichier-ci reviendrait à entretenir deux
# versions d'une décision dont une erreur ne se verrait que le jour où une archive manque.
destinations() {
	local horodatage="$1" image
	image="$(valeur_env JADWAL_IMAGE)"
	[ -n "$image" ] || { trace "JADWAL_IMAGE manque : impossible de nommer l'archive"; return 1; }
	docker run --rm \
		--volume "$JADWAL_RACINE/scripts/jadwal-destinations.mjs:/app/jadwal-destinations.mjs:ro" \
		--read-only --tmpfs /tmp \
		--cap-drop ALL --security-opt no-new-privileges:true \
		"$image" node /app/jadwal-destinations.mjs "$horodatage"
}

# Quelles archives locales garde-t-on ? Les noms arrivent sur l'entrée standard, un par ligne, et
# ressortent filtrés (ADR 0037).
#
# Même mécanique que `destinations` et pour la même raison : la règle n'existe qu'à un seul endroit,
# `infra/sauvegarde/retention.mjs`, où elle est éprouvée. Elle a passé une nuit en bash, où elle ne
# gardait rien du tout sans que personne le voie.
retention() {
	local image
	image="$(valeur_env JADWAL_IMAGE)"
	[ -n "$image" ] || { trace "JADWAL_IMAGE manque : impossible d'appliquer la rétention"; return 1; }
	docker run --rm --interactive \
		--volume "$JADWAL_RACINE/scripts/jadwal-retention.mjs:/app/jadwal-retention.mjs:ro" \
		--read-only --tmpfs /tmp \
		--cap-drop ALL --security-opt no-new-privileges:true \
		"$image" node /app/jadwal-retention.mjs
}

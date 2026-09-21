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

compose() {
	docker compose --file "$JADWAL_COMPOSE" --env-file "$JADWAL_ENV" "$@"
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
dans_app() {
	compose exec -T app "$@"
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

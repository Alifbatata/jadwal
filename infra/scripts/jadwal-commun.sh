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

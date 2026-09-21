#!/usr/bin/env bash
# La sauvegarde quotidienne : vidange logique, chiffrement, départ hors du serveur (ADR 0035).
#
# L'ordre compte, et il est celui-ci : `pg_dump` écrit sur un tube, `age` chiffre ce qui en sort, et
# **rien d'autre** ne touche le disque. Il n'existe à aucun moment un fichier de vidange en clair sur
# le serveur, pas même une seconde, pas même dans /tmp. `pipefail` fait qu'un `pg_dump` interrompu en
# cours de route ne laisse pas passer une archive chiffrée tronquée.
#
# Le chiffrement est fait par `age`, avec une clé publique et une clé publique seule. La clé privée
# n'est pas sur ce serveur et n'y sera jamais. `age` plutôt que GnuPG : un format, une commande, pas
# de trousseau, pas d'agent, pas de date d'expiration à surveiller.
#
# Le départ hors du serveur est fait par `rclone`, parce qu'il parle S3, Swift, SFTP et une trentaine
# d'autres protocoles : la destination peut changer sans que ce script change.
#
# Rétention : sept quotidiennes, quatre hebdomadaires, six mensuelles. Une seule série de fichiers,
# pas trois copies ; la règle est dans `jadwal-retention.sh`, et la même règle vaut ici et là-bas.
#
# Ce que ce script ne protège pas : qui obtient root sur ce serveur a les identifiants de `rclone` et
# peut donc effacer les archives distantes. La parade est un compartiment à verrouillage d'objet, du
# côté de l'hébergeur ; elle est demandée à l'exploitant et signalée dans le rapport.

# shellcheck source=jadwal-commun.sh
. "$(dirname "$(readlink -f "$0")")/jadwal-commun.sh"
JADWAL_TACHE=sauvegarde

JADWAL_SAUVEGARDES="${JADWAL_SAUVEGARDES:-/var/backups/jadwal}"
RCLONE_CONF="${RCLONE_CONF:-/etc/jadwal/rclone.conf}"
ICI="$(dirname "$(readlink -f "$0")")"

destinataire="$(valeur_env JADWAL_AGE_RECIPIENT)"
distant="$(valeur_env JADWAL_RCLONE_REMOTE)"
base="$(valeur_env POSTGRES_DB)"
utilisateur="$(valeur_env POSTGRES_USER)"

[ -n "$destinataire" ] || echec "JADWAL_AGE_RECIPIENT manque : refus de sauvegarder en clair"
[ -n "$distant" ] || echec "JADWAL_RCLONE_REMOTE manque : une sauvegarde restée sur le serveur n'en est pas une"

jour="$(date +%Y-%m-%d)"
nom="jadwal-$jour.dump.age"
mkdir -p "$JADWAL_SAUVEGARDES"
chmod 0700 "$JADWAL_SAUVEGARDES"
partiel="$JADWAL_SAUVEGARDES/.$nom.partielle"
final="$JADWAL_SAUVEGARDES/$nom"

trace "vidange de ${base:-jadwal}, chiffrée pour $destinataire"
# `--format=custom` : compressé, et restaurable table par table, ce dont le test de restauration a
# besoin. `--no-owner` et `--no-privileges` sont volontairement absents : les rôles et les politiques
# RLS font partie de ce qu'on sauvegarde (ADR 0019).
if ! compose exec -T db pg_dump --username "${utilisateur:-jadwal}" --dbname "${base:-jadwal}" \
	--format=custom | age --recipient "$destinataire" --output "$partiel"; then
	rm -f "$partiel"
	echec "la vidange ou le chiffrement a échoué : aucune archive écrite"
fi

# Une archive vide, ou non chiffrée, ne doit pas prendre la place d'une bonne.
taille="$(stat --format=%s "$partiel")"
if [ "$taille" -lt 1024 ]; then
	rm -f "$partiel"
	echec "archive de $taille octets : trop petite pour être vraie"
fi
if ! head --bytes=21 "$partiel" | grep --quiet "age-encryption.org/v1"; then
	rm -f "$partiel"
	echec "l'archive ne porte pas l'en-tête age : elle n'est pas chiffrée"
fi

mv "$partiel" "$final"
chmod 0600 "$final"
empreinte="$(sha256sum "$final" | cut -d" " -f1)"
printf "%s  %s\n" "$empreinte" "$nom" > "$final.sha256"
trace "archive locale : $final ($taille octets, sha256 ${empreinte:0:16}…)"

trace "envoi vers $distant"
rclone --config "$RCLONE_CONF" copy "$final" "$distant/" --checksum \
	|| echec "l'envoi vers $distant a échoué : l'archive est restée sur le serveur"
rclone --config "$RCLONE_CONF" copy "$final.sha256" "$distant/" --checksum \
	|| echec "l'empreinte n'a pas pu être envoyée"

# Relecture immédiate : la destination rend-elle bien ce qu'on vient d'y mettre ? Sans cela, on
# découvrirait un envoi silencieusement tronqué le jour où on en a besoin.
distante="$(rclone --config "$RCLONE_CONF" hashsum sha256 "$distant/$nom" 2>/dev/null | cut -d" " -f1 || true)"
if [ -n "$distante" ]; then
	[ "$distante" = "$empreinte" ] || echec "l'archive distante diffère : $distante au lieu de $empreinte"
	trace "empreinte distante identique à la locale"
else
	# Tous les protocoles ne savent pas calculer une empreinte à distance. On relit alors l'octet près.
	trace "la destination ne calcule pas d'empreinte : relecture complète"
	relue="$(rclone --config "$RCLONE_CONF" cat "$distant/$nom" | sha256sum | cut -d" " -f1)"
	[ "$relue" = "$empreinte" ] || echec "la relecture de l'archive distante diffère : $relue"
	trace "relecture identique"
fi

# La rétention, ici et là-bas, par la même règle.
a_garder="$("$ICI/jadwal-retention.sh" "$JADWAL_SAUVEGARDES")"
for fichier in "$JADWAL_SAUVEGARDES"/jadwal-*.dump.age; do
	[ -e "$fichier" ] || continue
	court="$(basename "$fichier")"
	if ! printf "%s\n" "$a_garder" | grep --quiet --line-regexp --fixed-strings "$court"; then
		trace "retrait de $court (hors rétention)"
		rm -f "$fichier" "$fichier.sha256"
		rclone --config "$RCLONE_CONF" deletefile "$distant/$court" 2>/dev/null || true
		rclone --config "$RCLONE_CONF" deletefile "$distant/$court.sha256" 2>/dev/null || true
	fi
done

trace "$(printf "%s\n" "$a_garder" | grep --count . || true) archive(s) conservée(s)"
reussite

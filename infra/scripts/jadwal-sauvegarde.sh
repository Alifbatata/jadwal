#!/usr/bin/env bash
# La sauvegarde quotidienne : vidange logique, chiffrement, départ hors du serveur (ADR 0035, 0037).
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
# **CE SCRIPT N'EFFACE RIEN À DISTANCE, ET C'EST TOUT SON OBJET (ADR 0037).** Qui obtient root sur ce
# serveur obtient le jeton de `rclone` ; si ce jeton savait effacer, il effacerait, et une sauvegarde
# qu'un attaquant peut supprimer ne protège de rien. La rétention distante est donc confiée au
# stockage, par un verrou de conservation et un cycle de vie posés hors de ce serveur :
#
#     quotidien/   toutes les nuits            verrou 7 jours,   effacement à 8 jours
#     hebdo/       le dimanche, en plus        verrou 28 jours,  effacement à 29 jours
#     mensuel/     le 1er du mois, en plus     verrou 180 jours, effacement à 181 jours
#
# Le nom d'objet porte la date **et l'heure** : un verrou refuse l'écrasement, donc deux exécutions
# le même jour doivent produire deux objets plutôt qu'une erreur. La règle qui décide du nom et des
# préfixes est dans `infra/sauvegarde/destinations.mjs`, isolée là parce qu'elle se teste.
#
# La rétention **locale**, elle, reste tenue ici : le disque du serveur est à nous, et il est petit.

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

# Un seul instant pour toute l'exécution, en UTC : le nom local et les noms distants doivent être le
# même, et « dimanche » ne doit pas dépendre du fuseau ni du changement d'heure. Les destinations
# sont calculées **avant** la vidange : mieux vaut échouer sans rien écrire que d'écrire au mauvais
# endroit, où aucun verrou ne protégerait l'archive et où rien ne l'effacerait jamais.
horodatage="$(date --utc +%Y-%m-%dT%H:%M:%SZ)"
chemins="$(destinations "$horodatage")" || echec "impossible de nommer l'archive pour $horodatage"
[ -n "$chemins" ] || echec "aucune destination pour $horodatage"
premier="$(printf '%s\n' "$chemins" | head -n 1)"
nom="${premier##*/}"

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

# Chaque préfixe reçoit une **copie** de l'objet, pas un lien : un verrou de conservation porte sur
# un objet, et un objet n'est protégé que par le verrou du préfixe où il est arrivé.
copies=0
while IFS= read -r chemin; do
	[ -n "$chemin" ] || continue
	trace "envoi vers $distant/$chemin"
	rclone --config "$RCLONE_CONF" copyto "$final" "$distant/$chemin" \
		|| echec "l'envoi de $chemin a échoué : l'archive est restée sur le serveur"
	rclone --config "$RCLONE_CONF" copyto "$final.sha256" "$distant/$chemin.sha256" \
		|| echec "l'empreinte de $chemin n'a pas pu être envoyée"
	copies=$((copies + 1))

	# Relecture immédiate : la destination rend-elle bien ce qu'on vient d'y mettre ? Sans cela, on
	# découvrirait un envoi silencieusement tronqué le jour où on en a besoin.
	distante="$(rclone --config "$RCLONE_CONF" hashsum sha256 "$distant/$chemin" 2>/dev/null | cut -d" " -f1 || true)"
	if [ -n "$distante" ]; then
		[ "$distante" = "$empreinte" ] || echec "l'archive distante $chemin diffère : $distante au lieu de $empreinte"
		trace "empreinte distante identique à la locale"
	else
		# Tous les stockages ne savent pas calculer une empreinte à distance — R2, par exemple, rend
		# « hash unsupported ». On relit alors l'objet en entier, et l'on compare octet par octet.
		trace "la destination ne calcule pas d'empreinte : relecture complète"
		relue="$(rclone --config "$RCLONE_CONF" cat "$distant/$chemin" | sha256sum | cut -d" " -f1)"
		[ "$relue" = "$empreinte" ] || echec "la relecture de $chemin diffère : $relue"
		trace "relecture identique"
	fi
done <<< "$chemins"

[ "$copies" -gt 0 ] || echec "aucune copie distante n'a été écrite"
trace "$copies copie(s) distante(s) écrite(s)"

# La rétention **locale**, et elle seule. Rien n'est effacé à distance : c'est le cycle de vie du
# stockage qui s'en charge, et c'est ce qui rend les archives hors d'atteinte depuis ce serveur.
a_garder="$("$ICI/jadwal-retention.sh" "$JADWAL_SAUVEGARDES")"
for fichier in "$JADWAL_SAUVEGARDES"/jadwal-*.dump.age; do
	[ -e "$fichier" ] || continue
	court="$(basename "$fichier")"
	if ! printf "%s\n" "$a_garder" | grep --quiet --line-regexp --fixed-strings "$court"; then
		trace "retrait local de $court (hors rétention locale)"
		rm -f "$fichier" "$fichier.sha256"
	fi
done

trace "$(printf "%s\n" "$a_garder" | grep --count . || true) archive(s) conservée(s) sur le disque local"
reussite

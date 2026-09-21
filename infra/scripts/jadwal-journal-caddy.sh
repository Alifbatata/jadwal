#!/usr/bin/env bash
# Coupe le journal d'accès de jadwal chaque nuit, et n'en garde que quatorze jours (ADR 0039).
#
#     jadwal-journal-caddy.sh [<fichier>] [<jours>]
#
# ## Pourquoi ce script existe, alors que Caddy sait faire tourner ses journaux
#
# Caddy borne ce qu'il a **déjà roulé** — `roll_keep`, `roll_keep_for` — mais il ne roule qu'à la
# taille. Le fichier **courant** n'a donc aucune borne de temps : sur un service peu fréquenté, il
# peut porter des mois de lignes avant d'atteindre dix mégaoctets. Une rétention de quatorze jours
# annoncée dans les conditions d'utilisation ne peut pas dépendre du trafic.
#
# ## Pourquoi pas `logrotate`
#
# `logrotate --copytruncate` a été **mesuré** contre la version de Caddy visée, en conteneur : Caddy
# garde sa position d'écriture et recommence à écrire là où il en était. Le fichier vidé se remplit
# donc de milliers d'octets nuls avant la première ligne, et le journal devient illisible pour `jq`
# comme pour un humain. `logrotate` sans `copytruncate` est pire : il renomme, Caddy continue
# d'écrire dans le fichier renommé, et le journal courant reste vide pour toujours. Recharger Caddy
# après chaque rotation le ferait rouvrir, mais recharger le Caddy de l'hôte est exactement ce que
# ce déploiement s'interdit de faire tout seul.
#
# ## Ce que fait ce script, et pourquoi c'est sûr
#
# Il relève la taille, copie ce qui précède cette position, puis **écrase cette même zone par des
# retours à la ligne** au lieu de la vider. Le fichier garde sa taille, Caddy garde sa position, et
# rien ne se perd ni ne se corrompt : la zone écrasée devient des lignes vides, que `jq` et `grep`
# traversent sans broncher, et les lignes écrites entre-temps sont au-delà de la position relevée,
# donc intactes. Caddy écrit une ligne entière par appel : cette position est toujours une fin de
# ligne.
#
# Le fichier courant ne dépasse jamais la taille à laquelle Caddy le roule, et les archives datées
# sont effacées au bout de quatorze jours.

# shellcheck source=jadwal-commun.sh
. "$(dirname "$(readlink -f "$0")")/jadwal-commun.sh"

JADWAL_TACHE=journal-caddy

journal="${1:-$(valeur_env JADWAL_JOURNAL_CADDY)}"
jours="${2:-14}"

[ -n "$journal" ] \
	|| echec "aucun journal à couper : ni argument, ni JADWAL_JOURNAL_CADDY dans $JADWAL_ENV"

# Un journal absent n'est pas un journal vide : la sonde interroge le service toutes les cinq
# minutes, donc ce fichier existe dès le premier jour. S'il manque, c'est que le bloc de site écrit
# ailleurs que là où on le croit, et une rétention qu'on croit tenue est pire qu'une rétention
# absente.
[ -f "$journal" ] || echec "$journal est introuvable : le bloc de site écrit-il bien là ?"

# La position est relevée **avant** la copie. Tout ce que Caddy écrit ensuite est au-delà, et ne sera
# ni archivé ni écrasé : il restera dans le fichier courant, à sa place.
taille="$(stat --format=%s "$journal")"

if [ "$taille" -eq 0 ]; then
	trace "$journal est vide : rien à couper"
else
	archive="$journal.$(date --utc +%FT%H%M%SZ)"
	# Les lignes vides laissées par la coupe précédente ne sont pas recopiées dans l'archive.
	head --bytes="$taille" "$journal" | sed '/^$/d' > "$archive"
	chmod 0640 "$archive"

	# L'écrasement, et non la troncature : voir l'en-tête. `conv=notrunc` garde la taille du fichier,
	# donc la position de Caddy.
	head --bytes="$taille" /dev/zero | tr '\0' '\n' \
		| dd of="$journal" conv=notrunc status=none

	trace "$taille octets coupés vers $(basename "$archive") ($(grep --count . "$archive") ligne(s))"
fi

# La rétention. `-mtime +N` prend les fichiers dont la dernière écriture remonte à plus de N jours
# pleins : pour garder quatorze jours, on efface au-delà de treize.
efface="$(find "$(dirname "$journal")" -maxdepth 1 -type f \
	-name "$(basename "$journal").*Z" -mtime "+$((jours - 1))" -print -delete | grep --count . || true)"
trace "$efface archive(s) de plus de $jours jours effacée(s)"

reussite

#!/usr/bin/env bash
# Coupe le journal d'accès de jadwal chaque nuit, et n'en garde que quatorze jours (ADR 0039).
#
#     jadwal-journal-caddy.sh [<fichier>] [<jours>]
#
# ## Pourquoi ce script existe, alors que Caddy sait faire tourner ses journaux
#
# Caddy ne roule qu'à la taille, et ne borne ce qu'il a **déjà roulé** — `roll_keep`,
# `roll_keep_for` — qu'au roulement suivant. Le fichier **courant** n'a donc aucune borne de temps :
# sur un service peu fréquenté, il peut porter des mois de lignes avant d'atteindre dix mégaoctets.
# Une rétention de quatorze jours annoncée dans les conditions d'utilisation ne peut pas dépendre du
# trafic.
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
# Le fichier courant ne dépasse jamais la taille à laquelle Caddy le roule, et aucune ligne ne reste
# plus de quatorze jours, ni dans le fichier courant, ni dans une archive : le calcul est plus bas.

# shellcheck source=jadwal-commun.sh
. "$(dirname "$(readlink -f "$0")")/jadwal-commun.sh"

JADWAL_TACHE=journal-caddy

journal="${1:-$(valeur_env JADWAL_JOURNAL_CADDY)}"
jours="${2:-14}"

[ -n "$journal" ] \
	|| echec "aucun journal à couper : ni argument, ni JADWAL_JOURNAL_CADDY dans $JADWAL_ENV"

# Le seuil plus bas ne tient qu'à partir de trois jours : en deçà, il deviendrait nul ou négatif.
[[ "$jours" =~ ^[0-9]+$ ]] && [ "$jours" -ge 3 ] \
	|| echec "durée de rétention illisible ou trop courte : « $jours » (trois jours au moins)"

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

# La rétention : aucune ligne ne doit vivre plus de `jours` jours, où qu'elle soit.
#
# L'ancien seuil, `-mtime +13`, effaçait une archive à quatorze jours pleins **depuis la coupe**. Il
# oubliait le jour que ses lignes avaient déjà passé dans le fichier courant, et le délai de la
# minuterie : une ligne vivait jusqu'à seize jours. Le calcul, pour la minuterie livrée (00:20 UTC,
# jusqu'à cinq minutes de délai aléatoire et une minute de précision, soit un retard R de six
# minutes au plus) :
#
#   1. Une ligne écrite juste après une coupe reste dans le fichier courant jusqu'à la coupe
#      suivante, un jour à R près, puis part dans l'archive de cette coupe, datée de cette coupe.
#   2. Une archive n'est effacée que par un passage, une fois par nuit. Effacée k nuits après sa
#      coupe, sa plus vieille ligne a vécu k + 1 jours, plus R au pire. Pour rester sous quatorze
#      jours quel que soit R, il faut k + 1 <= 13 : l'archive part la douzième nuit après sa coupe.
#   3. La douzième nuit, l'archive a 12 jours à R près ; la onzième, 11 jours à R près. Le seuil est
#      pris au milieu : 11 jours et 12 heures, soit 16 560 minutes. Les retards n'exigent que six
#      minutes de jeu ; le milieu en laisse douze heures dans les deux sens, et couvre donc aussi un
#      passage rattrapé au démarrage (`Persistent=true`) avec moins de douze heures de retard.
#
#   Pire cas : 13 jours et 6 minutes pour la plus vieille ligne d'une archive. Le journal garde donc
#   au moins onze jours et demi de lignes, et jamais quatorze. En général, pour `jours` >= 3 : le
#   seuil vaut (jours - 2) jours moins 12 heures, et la plus vieille ligne vit au plus (jours - 1)
#   jours et R.
#
# Les morceaux que Caddy roule lui-même à la taille suivent la même règle. `roll_keep_for` ne les
# efface qu'au roulement suivant, que rien ne date : mesuré avec Caddy 2.11.4, un morceau roulé de
# plus de cinquante jours reste en place tant que Caddy ne roule pas de nouveau. Leurs lignes datent
# toutes d'après la dernière coupe, comme celles d'une archive, et leur dernière écriture précède le
# roulement : le même seuil leur tient la même borne. `pnpm caddy:test` rejoue ce calcul, et ces
# deux sortes de morceaux.
seuil=$(( (jours - 2) * 24 * 60 - 12 * 60 ))
nom="$(basename "$journal")"
efface="$(find "$(dirname "$journal")" -maxdepth 1 -type f \
	\( -name "$nom.*Z" -o -name "${nom%.*}-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*" \) \
	-mmin "+$seuil" -print -delete | grep --count . || true)"
trace "$efface morceau(x) effacé(s) : aucune ligne n'y reste plus de $jours jours"

reussite

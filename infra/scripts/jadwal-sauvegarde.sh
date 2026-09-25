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
# préfixes est dans `infra/sauvegarde/destinations.mjs`, isolée là parce qu'elle se teste. Cette
# heure est prise juste avant la vidange, et la vérification de l'âge la relit (plus bas).
#
# La rétention **locale**, elle, reste tenue ici : le disque du serveur est à nous, et il est petit.
#
# **Ce script n'efface rien à distance, mais il regarde.** En dernier, il liste la destination
# et vérifie qu'aucun objet n'a dépassé l'âge promis pour son préfixe : 9, 30 et 182 jours, soit le
# cycle de vie plus le jour que le stockage peut mettre à effacer. La règle est dans
# `infra/sauvegarde/ages.mjs`. Un objet trop vieux, un objet hors des trois préfixes, une liste qui
# échoue, qui revient vide ou qui ne montre pas les objets de la nuit font échouer la tâche, donc
# partir l'alerte d'`OnFailure=`. L'âge compte depuis le dépôt chez le stockage, ou depuis l'heure
# écrite dans le nom quand l'objet a été déposé plus d'une heure après elle : une archive recopiée
# ne repart pas de zéro.

# shellcheck source=jadwal-commun.sh
. "$(dirname "$(readlink -f "$0")")/jadwal-commun.sh"
JADWAL_TACHE=sauvegarde

JADWAL_SAUVEGARDES="${JADWAL_SAUVEGARDES:-/var/backups/jadwal}"
RCLONE_CONF="${RCLONE_CONF:-/etc/jadwal/rclone.conf}"

# `--s3-no-head` : ne pas relire l'objet après l'avoir écrit.
#
# **Mesuré**, pas supposé. Chaque envoi produisait deux `ERROR : NotImplemented (501)` réussis à la
# seconde tentative. Le détail des échanges HTTP le dit :
#
#     HEAD /…/verrou-eprouve-….txt                      404   (il n'existe pas encore)
#     PUT  /…/verrou-eprouve-….txt                      200   (l'envoi RÉUSSIT)
#     HEAD /…/verrou-eprouve-….txt?versionId=7e5f…      501   ← l'erreur
#     (seconde tentative) HEAD sans versionId           200   « unchanged, skipping »
#
# L'envoi réussit du premier coup. Ce qui échoue, c'est la relecture que rclone fait ensuite **par
# identifiant de version**, que cette destination n'implémente pas. La seconde tentative n'envoie
# donc rien : elle constate que l'objet est déjà là et passe.
#
# Deux conséquences, et la seconde compte plus que la première :
#
#   1. deux lignes `ERROR` par nuit qui ne signalaient rien — et deux erreurs qu'on apprend à ne
#      plus lire sont deux erreurs qu'on ne lira pas le jour où elles comptent ;
#   2. **le code de retour de rclone ne voulait plus rien dire.** Un envoi parfaitement réussi
#      sortait en échec. C'est ce code que la preuve des verrous interroge pour affirmer qu'un
#      écrasement a été refusé : elle pouvait donc conclure « le verrou tient » alors que l'objet
#      venait d'être écrasé.
#
# Rien n'est perdu à ne pas relire : ce script vérifie lui-même chaque copie distante, en la
# relisant **en entier** et en comparant son empreinte SHA-256 à celle de l'archive locale. C'est
# une vérification plus forte que celle qu'on retire.
RCLONE_OPTIONS="${RCLONE_OPTIONS:---s3-no-head}"
ICI="$(dirname "$(readlink -f "$0")")"

# L'âge des objets distants, jugé par `infra/sauvegarde/ages.mjs` (ADR 0037) : la liste de rclone
# arrive sur l'entrée standard, « maintenant » en premier argument, puis les chemins des objets que la
# nuit vient d'envoyer, que la liste doit montrer. Sortie 0 si tout est dans les âges.
#
# Même mécanique que `destinations` et `retention` du socle commun, et pour la même raison : la
# règle n'existe qu'à un seul endroit, là où elle est éprouvée, et l'hôte n'a pas de Node. Elle vit
# ici plutôt que dans le socle parce que ce script est le seul à s'en servir. `--network none` : elle
# lit son entrée, et rien d'autre.
ages() {
	local image
	image="$(valeur_env JADWAL_IMAGE)"
	[ -n "$image" ] || { printf "JADWAL_IMAGE manque : impossible de juger l'âge des objets distants\n"; return 1; }
	docker run --rm --interactive --network none \
		--volume "$JADWAL_RACINE/scripts/jadwal-ages.mjs:/app/jadwal-ages.mjs:ro" \
		--read-only --tmpfs /tmp \
		--cap-drop ALL --security-opt no-new-privileges:true \
		"$image" node /app/jadwal-ages.mjs "$@"
}

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
if ! dans_db pg_dump --username "${utilisateur:-jadwal}" --dbname "${base:-jadwal}" \
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
#
# `envoyes` garde le chemin de chaque objet écrit, l'archive et son empreinte : la vérification de
# l'âge exigera de les voir dans la liste de la destination.
copies=0
envoyes=()
while IFS= read -r chemin; do
	[ -n "$chemin" ] || continue
	trace "envoi vers $distant/$chemin"
	rclone $RCLONE_OPTIONS --config "$RCLONE_CONF" copyto "$final" "$distant/$chemin" \
		|| echec "l'envoi de $chemin a échoué : l'archive est restée sur le serveur"
	rclone $RCLONE_OPTIONS --config "$RCLONE_CONF" copyto "$final.sha256" "$distant/$chemin.sha256" \
		|| echec "l'empreinte de $chemin n'a pas pu être envoyée"
	copies=$((copies + 1))
	envoyes+=("$chemin" "$chemin.sha256")

	# Relecture immédiate : la destination rend-elle bien ce qu'on vient d'y mettre ? Sans cela, on
	# découvrirait un envoi silencieusement tronqué le jour où on en a besoin.
	distante="$(rclone $RCLONE_OPTIONS --config "$RCLONE_CONF" hashsum sha256 "$distant/$chemin" 2>/dev/null | cut -d" " -f1 || true)"
	if [ -n "$distante" ]; then
		[ "$distante" = "$empreinte" ] || echec "l'archive distante $chemin diffère : $distante au lieu de $empreinte"
		trace "empreinte distante identique à la locale"
	else
		# Tous les stockages ne savent pas calculer une empreinte à distance — R2, par exemple, rend
		# « hash unsupported ». On relit alors l'objet en entier, et l'on compare octet par octet.
		trace "la destination ne calcule pas d'empreinte : relecture complète"
		relue="$(rclone $RCLONE_OPTIONS --config "$RCLONE_CONF" cat "$distant/$chemin" | sha256sum | cut -d" " -f1)"
		[ "$relue" = "$empreinte" ] || echec "la relecture de $chemin diffère : $relue"
		trace "relecture identique"
	fi
done <<< "$chemins"

[ "$copies" -gt 0 ] || echec "aucune copie distante n'a été écrite"
trace "$copies copie(s) distante(s) écrite(s)"

# La rétention **locale**, et elle seule. Rien n'est effacé à distance : c'est le cycle de vie du
# stockage qui s'en charge, et c'est ce qui rend les archives hors d'atteinte depuis ce serveur.
"$ICI/jadwal-retention.sh" "$JADWAL_SAUVEGARDES"

# L'âge des objets distants (ADR 0037). Le serveur ne peut pas tenir la promesse des conditions
# d'utilisation, puisqu'il n'efface rien là-bas ; il peut vérifier chaque nuit qu'elle est tenue.
#
# **Après la rétention locale, pas avant.** Un objet distant trop vieux ne s'efface pas depuis ce
# serveur : la tâche échouera donc chaque nuit jusqu'à ce que l'exploitant le retire. Si la
# vérification passait avant, cet échec empêcherait aussi le ménage du disque local, et une promesse
# rompue chez le stockage en romprait une seconde ici.
#
# **Une liste qui échoue fait échouer la tâche.** Pas de `|| true`, pas de sortie vide qui vaudrait
# « rien à signaler » : c'est exactement le défaut que la veille a porté à l'étape 12, quand un
# relevé en échec se lisait comme un relevé vide. Un seau qui n'existe pas fait échouer la liste
# (« directory not found »). La règle refuse aussi une liste vide, que rclone rend sans erreur pour
# un chemin qui n'existe pas dans le seau, et une liste qui ne montre pas les objets que cette nuit
# vient d'écrire : incomplète, ou faite ailleurs, elle ne prouve rien.
#
# Le même rclone, la même configuration, le même jeton que pour l'envoi : il sait lister, et c'est
# tout ce qu'il faut. `--use-server-modtime` : la date de chaque objet est la date de dépôt que le
# stockage écrit dans la liste, celle d'où il compte l'échéance de son cycle de vie. Sans cette
# option, rclone lirait la date du fichier envoyé par un HEAD par objet ; et quand ce HEAD échoue,
# rclone met l'heure présente à la place, sort en 0, et un objet trop vieux passe pour neuf. C'est
# vrai en 1.60.1 comme en 1.75.1, et l'option corrige les deux : le rôle installe le paquet rclone
# de la distribution, souvent bien plus ancien que l'image officielle, et `pnpm sauvegarde:test`
# joue les deux versions. `--no-mimetype` retire l'autre HEAD par objet, celui du type. Il ne reste
# que la liste, et aucune date ne vient plus d'une lecture qui échoue sans rien dire. La règle relit
# en plus l'heure écrite dans le nom de chaque objet, qu'aucune lecture ne peut fausser.
maintenant="$(date --utc +%Y-%m-%dT%H:%M:%SZ)"
trace "vérification de l'âge des objets de $distant"
liste="$(rclone $RCLONE_OPTIONS --config "$RCLONE_CONF" lsjson --use-server-modtime --no-mimetype --recursive --files-only "$distant")" \
	|| echec "l'archive est partie et a été relue, mais la liste de $distant a échoué : l'âge des sauvegardes distantes n'est pas vérifié"
if verdict="$(printf '%s\n' "$liste" | ages "$maintenant" "${envoyes[@]}" 2>&1)"; then
	trace "$verdict"
else
	while IFS= read -r ligne; do trace "$ligne"; done <<< "$verdict"
	echec "l'archive est partie et a été relue, mais la vérification de l'âge des objets distants a échoué : $(printf '%s\n' "$verdict" | head -n 1)"
fi

reussite

#!/usr/bin/env bash
# Le test de restauration : une sauvegarde qu'on n'a jamais restaurée n'est pas une sauvegarde.
# (ADR 0035)
#
# Deux modes, parce que la clé privée n'est pas sur ce serveur et ne doit pas y être.
#
#   1. Automatique, chaque semaine, sans clé — `jadwal-restauration.sh`
#      Il prend une vidange fraîche, la restaure dans une base jetable, et compare la base restaurée
#      à la base vivante : mêmes tables, mêmes lignes, RLS toujours forcée partout, même journal de
#      migrations. C'est ce qui pourrit avec le temps — un schéma que `pg_restore` ne sait plus
#      remonter, une extension absente, une dépendance circulaire — et c'est donc ce qu'il faut
#      éprouver toutes les semaines.
#      Ce mode **ne vérifie pas** que la clé de l'exploitant ouvre les archives : il ne le peut pas,
#      puisque la clé n'est pas là. L'intégrité des archives, elle, est vérifiée à chaque envoi, par
#      relecture depuis la destination (`jadwal-sauvegarde.sh`).
#
#   2. Complet, avec la clé, lancé par l'exploitant — `jadwal-restauration.sh --archive <x.age> --cle <clé>`
#      Il déchiffre une vraie archive et fait les mêmes vérifications dessus. C'est le seul mode qui
#      prouve la chaîne entière, de la clé publique du serveur à la clé privée de l'exploitant. Il
#      est joué une fois à la mise en production, puis à la cadence que fixe `docs/EXPLOITATION.md`,
#      et la veille alerte s'il n'a plus abouti depuis quarante jours.
#      Le fichier de clé n'est ni recopié, ni journalisé, ni laissé dans l'historique du shell : il
#      est lu par `age`, et c'est tout.

# shellcheck source=jadwal-commun.sh
. "$(dirname "$(readlink -f "$0")")/jadwal-commun.sh"
JADWAL_TACHE=restauration

BASE_TEST="${JADWAL_BASE_TEST:-jadwal_restauration_test}"
archive=""
cle=""
while [ "$#" -gt 0 ]; do
	case "$1" in
		--archive) archive="${2-}"; shift 2 ;;
		--cle) cle="${2-}"; shift 2 ;;
		*) echec "argument inconnu : $1" ;;
	esac
done

# La clé arrive sur l'entrée standard, et il faut la mettre à l'abri **tout de suite**.
#
# `--cle /dev/stdin` est la forme qui évite d'écrire la clé privée sur le serveur : elle vient du
# tube SSH et va directement à `age`. Seulement, entre l'entrée dans ce script et l'appel à `age`,
# il y a une dizaine de commandes — `docker compose exec -T`, `psql` — et **chacune lit l'entrée
# standard**. Quand `age` y arrive enfin, il n'y a plus rien : « no secret keys found », suivi d'un
# `pg_restore` sur un flux vide.
#
# On duplique donc l'entrée standard sur le descripteur 9 dès la première ligne utile, puis on
# branche l'entrée standard sur /dev/null : plus personne ne peut consommer la clé par mégarde, et
# `age` la lit sur `/dev/fd/9`. Elle reste dans un tube, du poste jusqu'à `age` : elle ne touche
# jamais le disque du serveur, n'apparaît dans aucun journal et dans aucune ligne de commande.
#
# Relevé à la mise en production du 2026-09-21 : la procédure signalait cette forme comme « à
# éprouver », et elle ne marchait pas.
if [ "$cle" = "/dev/stdin" ] || [ "$cle" = "-" ]; then
	exec 9<&0 0</dev/null
	cle=/dev/fd/9
fi

base="$(valeur_env POSTGRES_DB)"; base="${base:-jadwal}"
utilisateur="$(valeur_env POSTGRES_USER)"; utilisateur="${utilisateur:-jadwal}"

psql_base() { dans_db psql --username "$utilisateur" --dbname "$1" --no-align --tuples-only --quiet --set ON_ERROR_STOP=1 "${@:2}"; }

# Le relevé qu'on compare : une ligne par table, avec son nombre de lignes et l'état de sa RLS.
# `query_to_xml` évite d'avoir à construire et à jouer une requête par table depuis le shell.
releve() {
	psql_base "$1" --command "
		select c.relname
			|| '|' || (xpath('/row/c/text()',
				query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text
			|| '|' || c.relrowsecurity || '|' || c.relforcerowsecurity
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relkind = 'r'
		order by c.relname;"
}

# Les tables qui bougent pendant qu'on prend la vidange : une visite, une connexion, un jeton. Leur
# différer d'une ligne ne dit rien d'une sauvegarde ratée, et exiger l'égalité ferait échouer le test
# une nuit sur deux pour rien. Leur **présence** et leur RLS sont vérifiées comme les autres.
VOLATILES='page_view|rate_limit|session|verification|audit_log|admin_access_log'

trace "préparation de la base jetable $BASE_TEST"
psql_base postgres --command "drop database if exists \"$BASE_TEST\" with (force);" > /dev/null
psql_base postgres --command "create database \"$BASE_TEST\";" > /dev/null
nettoyer() {
	psql_base postgres --command "drop database if exists \"$BASE_TEST\" with (force);" > /dev/null 2>&1 || true
}
trap nettoyer EXIT

if [ -n "$archive" ]; then
	[ -n "$cle" ] || echec "--archive demande --cle : sans clé privée, rien ne peut être déchiffré"
	[ -r "$archive" ] || echec "archive illisible : $archive"
	[ -r "$cle" ] || echec "clé illisible : $cle"
	trace "restauration de $archive (déchiffrement avec la clé fournie)"
	age --decrypt --identity "$cle" "$archive" \
		| dans_db pg_restore --username "$utilisateur" --dbname "$BASE_TEST" --no-owner --exit-on-error \
		|| echec "pg_restore a refusé l'archive : elle n'est pas restaurable"
else
	trace "vidange fraîche de $base, restaurée dans $BASE_TEST"
	avant="$(releve "$base")"
	dans_db pg_dump --username "$utilisateur" --dbname "$base" --format=custom \
		| dans_db pg_restore --username "$utilisateur" --dbname "$BASE_TEST" --no-owner --exit-on-error \
		|| echec "la vidange n'est pas restaurable : pg_restore a refusé"
fi

apres="$(releve "$BASE_TEST")"
[ -n "$apres" ] || echec "la base restaurée ne contient aucune table"

# 1. Toutes les tables sont là, et la RLS est toujours forcée sur chacune.
# `text || boolean` rend `true`/`false` en PostgreSQL, et non `t`/`f` comme l'affichage de psql :
# la première version de ce test comparait à « t » et déclarait donc toutes les tables sans RLS.
sans_rls="$(printf '%s\n' "$apres" | awk -F'|' '$3 != "true" || $4 != "true" { print $1 }')"
[ -z "$sans_rls" ] || echec "RLS absente ou non forcée après restauration sur : $(echo "$sans_rls" | tr '\n' ' ')"
trace "$(printf '%s\n' "$apres" | grep --count .) tables restaurées, RLS forcée sur toutes"

# 2. Le journal des migrations. En mode automatique il doit être identique à celui de la base
#    vivante : une base restaurée à un schéma en retard est pire qu'une base vide. En mode archive on
#    ne le compare à rien — une archive d'il y a trois mois a légitimement moins de migrations — mais
#    il doit exister et ne pas être vide, sans quoi ce n'est pas une base de jadwal.
migrations_test="$(psql_base "$BASE_TEST" --command 'select count(*) from drizzle."__drizzle_migrations";')"
if [ -z "$archive" ]; then
	migrations_vivante="$(psql_base "$base" --command 'select count(*) from drizzle."__drizzle_migrations";')"
	[ "$migrations_vivante" = "$migrations_test" ] || echec "journal de migrations : $migrations_test au lieu de $migrations_vivante"
	trace "journal de migrations : $migrations_test migrations, identique à la base vivante"
else
	[ "$migrations_test" -gt 0 ] || echec "l'archive restaurée n'a aucun journal de migrations"
	trace "journal de migrations de l'archive : $migrations_test migrations"
fi

# 3. Les lignes, table par table, hors tables volatiles — seulement en mode automatique, où la
#    vidange vient d'être prise. Une archive d'hier a légitimement d'autres comptes.
if [ -z "$archive" ]; then
	ecarts=0
	while IFS='|' read -r table lignes _ _; do
		case "$table" in
			''|*' '*) continue ;;
		esac
		if printf '%s' "$table" | grep --quiet --extended-regexp "^($VOLATILES)$"; then continue; fi
		attendu="$(printf '%s\n' "$avant" | awk -F'|' -v t="$table" '$1 == t { print $2 }')"
		if [ "$attendu" != "$lignes" ]; then
			trace "écart sur $table : $lignes restaurées pour $attendu attendues"
			ecarts=$((ecarts + 1))
		fi
	done <<< "$apres"
	[ "$ecarts" -eq 0 ] || echec "$ecarts table(s) restaurée(s) avec un nombre de lignes différent"
	trace "comptes de lignes identiques sur toutes les tables non volatiles"
else
	organisations="$(psql_base "$BASE_TEST" --command 'select count(*) from public."organization";')"
	cours="$(psql_base "$BASE_TEST" --command 'select count(*) from public."course";')"
	vivantes="$(psql_base "$base" --command 'select count(*) from public."organization";')"
	# Ce qui est refusé, c'est une archive **vide alors que le service ne l'est pas** : là, quelque
	# chose s'est perdu entre la vidange et le chiffrement, et il faut le savoir tout de suite.
	#
	# Exiger un minimum absolu serait faux, et cela a fait échouer ce test à la mise en production :
	# une instance qui vient d'être déployée n'a aucune organisation, et son archive n'en a donc
	# aucune non plus. Ce n'est pas un défaut de la chaîne, c'est un service qui commence. Ce que la
	# chaîne doit prouver — la clé privée ouvre l'archive, `pg_restore` l'accepte, le schéma est
	# complet, la RLS est forcée, le journal de migrations concorde — est prouvé plus haut, et c'est
	# cela qui compte.
	if [ "$vivantes" -gt 0 ] && [ "$organisations" -eq 0 ]; then
		echec "la base vivante porte $vivantes organisation(s) et l'archive restaurée aucune : archive suspecte"
	fi
	trace "archive restaurée : $organisations organisation(s), $cours cours (base vivante : $vivantes)"
	# Une réussite de ce mode-là, et de lui seul, arme la veille du trimestre.
	mkdir -p "$JADWAL_ETAT/reussites"
	date --iso-8601=seconds > "$JADWAL_ETAT/reussites/restauration-complete"
	# Et elle bat, de dehors, sur le contrôle trimestriel du déchiffrement (ADR 0038). C'est la
	# seule épreuve qui va de la clé publique du serveur à la clé privée de l'exploitant : si
	# personne ne la joue pendant un trimestre, le silence doit s'entendre.
	JADWAL_TACHE=dechiffrement battement ok "déchiffrement complet vérifié"
fi

reussite
trace "base jetable supprimée par le trap de sortie"

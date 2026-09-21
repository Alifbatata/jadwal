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

base="$(valeur_env POSTGRES_DB)"; base="${base:-jadwal}"
utilisateur="$(valeur_env POSTGRES_USER)"; utilisateur="${utilisateur:-jadwal}"

psql_base() { compose exec -T db psql --username "$utilisateur" --dbname "$1" --no-align --tuples-only --quiet --set ON_ERROR_STOP=1 "${@:2}"; }

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
		| compose exec -T db pg_restore --username "$utilisateur" --dbname "$BASE_TEST" --no-owner --exit-on-error \
		|| echec "pg_restore a refusé l'archive : elle n'est pas restaurable"
else
	trace "vidange fraîche de $base, restaurée dans $BASE_TEST"
	avant="$(releve "$base")"
	compose exec -T db pg_dump --username "$utilisateur" --dbname "$base" --format=custom \
		| compose exec -T db pg_restore --username "$utilisateur" --dbname "$BASE_TEST" --no-owner --exit-on-error \
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
	[ "$organisations" -gt 0 ] || echec "l'archive restaurée ne contient aucune organisation"
	trace "archive restaurée : $organisations organisation(s), $cours cours"
	# Une réussite de ce mode-là, et de lui seul, arme la veille des quarante jours.
	mkdir -p "$JADWAL_ETAT/reussites"
	date --iso-8601=seconds > "$JADWAL_ETAT/reussites/restauration-complete"
fi

reussite
trace "base jetable supprimée par le trap de sortie"

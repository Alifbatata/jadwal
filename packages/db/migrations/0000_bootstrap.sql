-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Amorçage : rôles, schéma de contexte et fonctions de lecture du contexte (ADR 0013).
-- Cette migration est écrite à la main : Drizzle ne sait ni créer un rôle avec un mot de passe, ni
-- forcer la sécurité au niveau des lignes. Les mots de passe ne sont jamais ici : les rôles sont
-- créés sans possibilité de connexion, et `scripts/bootstrap-roles.mjs` leur pose un mot de passe
-- lu dans l'environnement.

CREATE SCHEMA IF NOT EXISTS "jadwal";
--> statement-breakpoint
-- Un rôle appartient au serveur, pas à une base : deux bases du même serveur migrées en même temps
-- écriraient toutes deux dans `pg_authid` et l'une des deux échouerait sur « tuple concurrently
-- updated ». Le verrou consultatif sérialise ce bloc, et l'écriture n'a lieu que si un attribut
-- diffère vraiment : dans le cas ordinaire, rien n'est écrit et rien ne peut se croiser.
--
-- La réaffirmation ne joue qu'ici, c'est-à-dire sur une base neuve. Sur une base déjà migrée,
-- Drizzle ne rejoue pas ce fichier : c'est `scripts/bootstrap-roles.mjs`, rejouable à volonté, qui
-- ramène un rôle qui aurait dérivé.
DO $$
BEGIN
	PERFORM pg_advisory_xact_lock(hashtext('jadwal:roles'));
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jadwal_app') THEN
		CREATE ROLE "jadwal_app" NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jadwal_superadmin') THEN
		CREATE ROLE "jadwal_superadmin" NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
	END IF;
	-- NOBYPASSRLS est le point qui compte : un rôle qui contourne la RLS voit tout.
	IF EXISTS (
		SELECT 1 FROM pg_roles
		WHERE rolname IN ('jadwal_app', 'jadwal_superadmin')
			AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole)
	) THEN
		ALTER ROLE "jadwal_app" NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
		ALTER ROLE "jadwal_superadmin" NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
	END IF;
END $$;
--> statement-breakpoint
-- Organisation du contexte de la transaction. Rend NULL quand le paramètre est absent, vide ou
-- illisible : à la fin d'une transaction, le paramètre ne redevient pas absent mais vaut la chaîne
-- vide, et une conversion directe lèverait une erreur au lieu de ne rien rendre.
-- STABLE, et surtout PAS LEAKPROOF : une fonction leakproof serait évaluée avant le filtre de
-- sécurité et verrait les lignes des autres organisations.
CREATE OR REPLACE FUNCTION "jadwal"."current_org_id"() RETURNS uuid
LANGUAGE sql STABLE
AS $$
	SELECT CASE
		WHEN current_setting('jadwal.org_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
		THEN current_setting('jadwal.org_id', true)::uuid
	END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "jadwal"."current_user_id"() RETURNS uuid
LANGUAGE sql STABLE
AS $$
	SELECT CASE
		WHEN current_setting('jadwal.user_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
		THEN current_setting('jadwal.user_id', true)::uuid
	END
$$;
--> statement-breakpoint
-- Une contrainte de vérification ne peut pas contenir de sous-requête (SQLSTATE 0A000) ; elle peut
-- appeler une fonction immuable. Sert aux listes qui doivent être sans doublon.
CREATE OR REPLACE FUNCTION "jadwal"."has_no_duplicate"(anyarray) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT
AS $fn$
	SELECT cardinality($1) = (SELECT count(DISTINCT element) FROM unnest($1) AS element)
$fn$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "jadwal"."has_no_duplicate"(anyarray) TO "jadwal_app", "jadwal_superadmin";
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."current_org_id"() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."current_user_id"() FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "jadwal" TO "jadwal_app", "jadwal_superadmin";
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "jadwal"."current_org_id"() TO "jadwal_app", "jadwal_superadmin";
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "jadwal"."current_user_id"() TO "jadwal_app", "jadwal_superadmin";
--> statement-breakpoint
-- Le rôle applicatif ne peut rien créer dans le schéma des tables.
REVOKE CREATE ON SCHEMA "public" FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "public" TO "jadwal_app", "jadwal_superadmin";

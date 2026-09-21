-- @retire : ce fichier a été rejouable, il ne l'est plus. La migration 0035 supprime
-- `support_access`, donc la fonction de fenêtre et les politiques conditionnelles qu'il pose n'ont plus d'objet. Il appartient à l'histoire
-- de la base, et le test de rejeu le laisse de côté — il ne cherche que `@rejouable`.
-- Accès de support du super-admin (ADR 0018) : ce que Drizzle Kit n'émet pas — la fonction de
-- fenêtre, les droits, les politiques de lecture conditionnelles, et les politiques d'entretien du
-- propriétaire pour la table nouvelle.

-- Une fenêtre ouverte pour cette organisation. STABLE, et surtout PAS LEAKPROOF : une fonction
-- leakproof serait évaluée avant le filtre de sécurité.
CREATE OR REPLACE FUNCTION "jadwal"."support_access_open"(uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $fn$
	SELECT EXISTS (
		SELECT 1 FROM public."support_access" sa
		WHERE sa."organization_id" = $1
			AND sa."revoked_at" IS NULL
			AND sa."expires_at" > now()
	)
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."support_access_open"(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "jadwal"."support_access_open"(uuid) TO "jadwal_superadmin";
--> statement-breakpoint
-- Le super-admin ouvre et révoque ; les responsables de l'organisation lisent ce qui les concerne.
GRANT SELECT, INSERT, UPDATE ON "support_access" TO "jadwal_superadmin";
--> statement-breakpoint
GRANT SELECT ON "support_access" TO "jadwal_app";
--> statement-breakpoint
-- La lecture des données d'organisation par le super-admin, conditionnée à une fenêtre ouverte. Le
-- droit d'écriture ne lui est jamais accordé : une tentative échoue sur un refus de droit, avant que
-- la moindre ligne soit examinée, avec un message qui ne dépend pas du contenu.
DO $support$
DECLARE
	t record;
BEGIN
	FOR t IN
		SELECT c.relname FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		JOIN pg_attribute a ON a.attrelid = c.oid
		WHERE n.nspname = 'public' AND c.relkind = 'r'
			AND a.attname = 'organization_id' AND a.attnum > 0 AND NOT a.attisdropped
			-- `support_access` et `audit_log` ont déjà leurs propres politiques pour ce rôle : le
			-- super-admin doit pouvoir lire la trace de son propre accès hors de toute fenêtre.
			AND c.relname NOT IN ('support_access', 'audit_log')
		ORDER BY c.relname
	LOOP
		EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
			t.relname || '_superadmin_support_select', t.relname);
		EXECUTE format(
			'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" '
			|| 'USING ("organization_id" = (select jadwal.current_org_id()) '
			|| 'AND jadwal.support_access_open("organization_id"))',
			t.relname || '_superadmin_support_select', t.relname);
		EXECUTE format('GRANT SELECT ON public.%I TO "jadwal_superadmin"', t.relname);
	END LOOP;
END
$support$;
--> statement-breakpoint
-- La table nouvelle reçoit les politiques d'entretien du propriétaire, comme toutes les autres
-- (ADR 0019). Le test de catalogue échoue si on l'oublie.
DO $maintenance$
DECLARE
	op record;
	owner_name text := current_user;
	policy_name text;
BEGIN
	FOR op IN
		SELECT * FROM (VALUES
			('select', 'using'), ('insert', 'with check'),
			('update', 'both'), ('delete', 'using')
		) AS v(operation, clause)
	LOOP
		policy_name := format('support_access_owner_%s', op.operation);
		EXECUTE format('DROP POLICY IF EXISTS %I ON public."support_access"', policy_name);
		EXECUTE format(
			'CREATE POLICY %I ON public."support_access" AS PERMISSIVE FOR %s TO %I %s',
			policy_name, op.operation, owner_name,
			CASE op.clause
				WHEN 'using' THEN 'USING (jadwal.maintenance())'
				WHEN 'with check' THEN 'WITH CHECK (jadwal.maintenance())'
				ELSE 'USING (jadwal.maintenance()) WITH CHECK (jadwal.maintenance())'
			END);
	END LOOP;
END
$maintenance$;

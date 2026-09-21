-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Ce que Drizzle Kit n'émet pas pour l'étape 4 : le forçage de la sécurité au niveau des lignes sur
-- les deux tables nouvelles, les droits du super-admin, les politiques d'entretien du propriétaire,
-- le retrait des politiques de la fenêtre de support, et les deux procédures de purge de la
-- partie C.

-- 1. Forçage sur les tables nouvelles. Drizzle sait activer, jamais forcer : sans `FORCE`, le
--    propriétaire échapperait aux politiques, et l'ADR 0019 ne vaudrait plus rien.
ALTER TABLE "admin_access_log" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "passkey" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 2. Le rôle de connexion possède les passkeys comme il possède les sessions (ADR 0016).
GRANT SELECT, INSERT, UPDATE, DELETE ON "passkey" TO "jadwal_auth";
--> statement-breakpoint

-- 3. Le registre interne : le super-admin l'écrit et le relit, personne d'autre n'en approche.
--    Pas d'`UPDATE`, pas de `DELETE` : une trace qu'on peut récrire ne protège personne. Comme pour
--    le journal d'audit, l'horodatage n'est pas dans la liste des colonnes accordées.
GRANT SELECT ON "admin_access_log" TO "jadwal_superadmin";
--> statement-breakpoint
GRANT INSERT ("id", "organization_id", "organization_slug", "actor_id", "action", "route")
	ON "admin_access_log" TO "jadwal_superadmin";
--> statement-breakpoint
REVOKE ALL ON "admin_access_log" FROM "jadwal_app";
--> statement-breakpoint
REVOKE ALL ON "admin_access_log" FROM "jadwal_auth";
--> statement-breakpoint
REVOKE ALL ON "passkey" FROM "jadwal_app";
--> statement-breakpoint
REVOKE ALL ON "passkey" FROM "jadwal_superadmin";
--> statement-breakpoint

-- 4. Le super-admin écrit dans les organisations (ADR 0025). Les quatre opérations sur les tables
--    qui portent une organisation, sauf deux :
--      `audit_log`, qui reste en insertion seule pour lui aussi — un journal qu'on peut récrire ne
--      prouve rien, et c'est vrai même pour celui qui a tous les autres droits (ADR 0015) ;
--      `admin_access_log`, qui a reçu les siens juste au-dessus.
DO $powers$
DECLARE
	t record;
BEGIN
	FOR t IN
		SELECT c.relname FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		JOIN pg_attribute a ON a.attrelid = c.oid
		WHERE n.nspname = 'public' AND c.relkind = 'r'
			AND a.attname = 'organization_id' AND a.attnum > 0 AND NOT a.attisdropped
			AND c.relname NOT IN ('audit_log', 'admin_access_log', 'support_access', 'session')
		ORDER BY c.relname
	LOOP
		EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO "jadwal_superadmin"',
			t.relname);
	END LOOP;
END
$powers$;
--> statement-breakpoint

-- 5. La fenêtre d'accès de support n'existe plus (ADR 0018 révisé, ADR 0025). Ses politiques
--    conditionnelles sont retirées avant sa fonction, et sa fonction avant sa table.
DO $support$
DECLARE
	t record;
BEGIN
	FOR t IN
		SELECT c.relname, p.polname FROM pg_policy p
		JOIN pg_class c ON c.oid = p.polrelid
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public' AND p.polname LIKE '%\_superadmin\_support\_select'
		ORDER BY c.relname
	LOOP
		EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t.polname, t.relname);
	END LOOP;
END
$support$;
--> statement-breakpoint
-- `DROP TRIGGER IF EXISTS` échoue quand c'est la **table** qui n'existe plus, et la migration 0035
-- la supprime : sans cette garde, ce fichier cesserait d'être rejouable le jour suivant.
DO $trigger$
BEGIN
	IF to_regclass('public.support_access') IS NOT NULL THEN
		EXECUTE 'DROP TRIGGER IF EXISTS "support_access_final" ON public."support_access"';
	END IF;
END
$trigger$;
--> statement-breakpoint
DROP FUNCTION IF EXISTS "jadwal"."support_access_open"(uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS "jadwal"."support_access_is_final"();
--> statement-breakpoint

-- 6. Les politiques d'entretien du propriétaire pour les tables nouvelles (ADR 0019). Sans elles,
--    il ne verrait rien et n'écrirait rien, et un `update` refusé rendrait « 0 ligne » en silence.
DO $maintenance$
DECLARE
	t record;
	op record;
	owner_name text := current_user;
	policy_name text;
BEGIN
	FOR t IN
		SELECT c.relname FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public' AND c.relkind = 'r'
			AND NOT EXISTS (
				SELECT 1 FROM pg_policy p
				-- Toute politique d'entretien, et non la seule lecture : une migration plus
				-- récente peut avoir retiré délibérément la lecture du propriétaire sur un
				-- journal (ADR 0020). Se fier à `_owner_select` faisait alors repasser cette
				-- boucle pour « table sans politique » et recréait ce qu'on venait d'enlever.
				WHERE p.polrelid = c.oid AND p.polname LIKE c.relname || '\_owner\_%'
			)
		ORDER BY c.relname
	LOOP
		FOR op IN
			SELECT * FROM (VALUES
				('select', 'using'), ('insert', 'with check'),
				('update', 'both'), ('delete', 'using')
			) AS v(operation, clause)
		LOOP
			policy_name := format('%s_owner_%s', t.relname, op.operation);
			EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, t.relname);
			EXECUTE format(
				'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR %s TO %I %s',
				policy_name, t.relname, op.operation, owner_name,
				CASE op.clause
					WHEN 'using' THEN 'USING (jadwal.maintenance())'
					WHEN 'with check' THEN 'WITH CHECK (jadwal.maintenance())'
					ELSE 'USING (jadwal.maintenance()) WITH CHECK (jadwal.maintenance())'
				END);
		END LOOP;
	END LOOP;
END
$maintenance$;
--> statement-breakpoint

-- 7. Purge des comptes sans adhésion (partie C de l'étape 4).
--    Douze mois sans adhésion, sans invitation en attente et sans session. Demander un lien magique
--    crée un compte sans pouvoir : c'est ce qui permet d'accepter une invitation, et c'est aussi ce
--    qui fait grossir la table sans fin. La borne est dans la procédure et non dans une politique,
--    à la différence du journal d'audit : le propriétaire a déjà, par son drapeau d'entretien, le
--    droit d'effacer n'importe quel compte. Une politique bornée ne lui retirerait rien et
--    donnerait l'illusion d'une garantie. Le journal, lui, doit résister au propriétaire lui-même,
--    et c'est pourquoi sa borne est ailleurs (ADR 0020).
CREATE OR REPLACE FUNCTION "jadwal"."purge_orphan_accounts"() RETURNS bigint
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
DECLARE
	supprimes bigint;
BEGIN
	PERFORM set_config('jadwal.maintenance', 'on', true);
	DELETE FROM public."user" u
	WHERE u."created_at" < now() - interval '12 months'
		AND u."is_super_admin" = false
		AND NOT EXISTS (SELECT 1 FROM public."membership" m WHERE m."user_id" = u."id")
		AND NOT EXISTS (SELECT 1 FROM public."session" s WHERE s."user_id" = u."id")
		AND NOT EXISTS (
			SELECT 1 FROM public."invitation" i
			WHERE i."status" = 'pending' AND lower(i."email") = lower(u."email")
		);
	GET DIAGNOSTICS supprimes = ROW_COUNT;
	RETURN supprimes;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."purge_orphan_accounts"() FROM PUBLIC;
--> statement-breakpoint

-- 8. Purge des invitations résolues : quatre-vingt-dix jours après leur résolution. Une invitation
--    annulée ou refusée porte une adresse, donc une donnée personnelle, et rien ne l'effaçait.
--    Une invitation acceptée puis consommée aussi : l'adhésion, elle, reste.
CREATE OR REPLACE FUNCTION "jadwal"."purge_resolved_invitations"() RETURNS bigint
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
DECLARE
	supprimees bigint;
BEGIN
	PERFORM set_config('jadwal.maintenance', 'on', true);
	DELETE FROM public."invitation"
	WHERE "status" <> 'pending'
		AND coalesce("resolved_at", "created_at") < now() - interval '90 days';
	GET DIAGNOSTICS supprimees = ROW_COUNT;
	RETURN supprimees;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."purge_resolved_invitations"() FROM PUBLIC;

-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Ce que Drizzle Kit n'émet pas pour l'étape 5 : les droits du rôle public, et la rétention du
-- registre interne du super-admin.

-- 1. Le rôle public lit, et ne fait rien d'autre (ADR 0026).
--    Les tables nommées ici sont exactement celles qui portent une politique `_public_select`. Les
--    autres — comptes, adhésions, invitations, journaux, sessions, passkeys, réglages de prière —
--    ne lui sont pas seulement invisibles : elles lui sont inaccessibles, et la tentative échoue
--    sur un refus de droit avant qu'une ligne soit examinée.
DO $lecture$
DECLARE
	t record;
BEGIN
	FOR t IN
		SELECT DISTINCT c.relname FROM pg_policy p
		JOIN pg_class c ON c.oid = p.polrelid
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public' AND p.polname LIKE '%\_public\_select'
		ORDER BY c.relname
	LOOP
		EXECUTE format('GRANT SELECT ON public.%I TO "jadwal_public"', t.relname);
	END LOOP;
END
$lecture$;
--> statement-breakpoint

-- 2. La seule écriture qu'il reçoit : le compteur de limitation de débit, qui n'est pas une donnée
--    d'organisation. Sans lui, le côté public n'aurait pas de compteur partagé entre les instances,
--    ou il faudrait lui prêter le rôle de la connexion — qui, lui, tient les jetons de session.
--    `test/public-role.test.ts` vérifie que c'est la seule.
GRANT SELECT, INSERT, UPDATE ON "rate_limit" TO "jadwal_public";
--> statement-breakpoint
DROP POLICY IF EXISTS "rate_limit_public_select" ON "rate_limit";
--> statement-breakpoint
CREATE POLICY "rate_limit_public_select" ON "rate_limit"
	AS PERMISSIVE FOR SELECT TO "jadwal_public" USING (true);
--> statement-breakpoint
DROP POLICY IF EXISTS "rate_limit_public_insert" ON "rate_limit";
--> statement-breakpoint
CREATE POLICY "rate_limit_public_insert" ON "rate_limit"
	AS PERMISSIVE FOR INSERT TO "jadwal_public" WITH CHECK (true);
--> statement-breakpoint
DROP POLICY IF EXISTS "rate_limit_public_update" ON "rate_limit";
--> statement-breakpoint
CREATE POLICY "rate_limit_public_update" ON "rate_limit"
	AS PERMISSIVE FOR UPDATE TO "jadwal_public" USING (true) WITH CHECK (true);
--> statement-breakpoint

-- 3. Rien d'autre, nulle part. Le rôle vient d'être créé, donc il n'a rien à perdre ; le `REVOKE`
--    est là pour le jour où quelqu'un accordera un droit à `PUBLIC` sans y penser — ce qui
--    donnerait ce droit à tous les rôles, celui-ci compris.
DO $retrait$
DECLARE
	t record;
BEGIN
	FOR t IN
		SELECT c.relname FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public' AND c.relkind = 'r'
			AND NOT EXISTS (
				SELECT 1 FROM pg_policy p
				WHERE p.polrelid = c.oid AND p.polname LIKE '%\_public\_%'
			)
		ORDER BY c.relname
	LOOP
		EXECUTE format('REVOKE ALL ON public.%I FROM "jadwal_public"', t.relname);
	END LOOP;
END
$retrait$;
--> statement-breakpoint

-- 4. Le propriétaire ne lit toujours pas le journal d'audit, et ne l'efface pas hors de la fenêtre.
--    La migration 0029 lui avait retiré sa politique de lecture (ADR 0020). La boucle d'entretien
--    de la migration 0034 l'a recréée sans le vouloir : elle sautait les tables qui portaient déjà
--    un `_owner_select`, donc elle repassait précisément sur celles où on venait de l'enlever. Le
--    garde de la boucle a été corrigé dans les fichiers 0019 et 0034 ; ici, on retire ce qu'elle
--    avait remis, et on borne la suppression à la seule fenêtre de rétention.
--
--    Le registre interne garde sa lecture — il appartient à l'exploitant, qui est le propriétaire —
--    mais perd sa suppression libre, pour la même raison qu'une trace qu'on peut effacer ne protège
--    personne.
DROP POLICY IF EXISTS "audit_log_owner_select" ON "audit_log";
--> statement-breakpoint
DROP POLICY IF EXISTS "audit_log_owner_delete" ON "audit_log";
--> statement-breakpoint
DROP POLICY IF EXISTS "admin_access_log_owner_delete" ON "admin_access_log";
--> statement-breakpoint

-- 5. Rétention du registre interne : vingt-quatre mois, comme le journal d'audit (étape 5,
--    partie A). Même mécanisme, et pour la même raison : la borne est portée par une politique de
--    suppression, donc un `delete` sans clause de restriction ne peut emporter que ce que la
--    fenêtre autorise. Une erreur dans la procédure ne peut pas effacer une trace récente.
DROP POLICY IF EXISTS "admin_access_log_owner_purge" ON "admin_access_log";
--> statement-breakpoint
CREATE POLICY "admin_access_log_owner_purge" ON "admin_access_log"
	AS PERMISSIVE FOR DELETE TO "jadwal_owner"
	USING ("created_at" < now() - interval '24 months');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "jadwal"."purge_admin_access_log"() RETURNS bigint
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
DECLARE
	supprimees bigint;
BEGIN
	DELETE FROM public."admin_access_log";
	GET DIAGNOSTICS supprimees = ROW_COUNT;
	RETURN supprimees;
END
$fn$;
--> statement-breakpoint
-- Accordée à personne : ni le rôle applicatif, ni le super-admin, ni le rôle public.
REVOKE ALL ON FUNCTION "jadwal"."purge_admin_access_log"() FROM PUBLIC;

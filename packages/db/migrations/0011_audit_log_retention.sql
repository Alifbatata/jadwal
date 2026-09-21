-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Rétention du journal d'audit : vingt-quatre mois (ADR 0020).
--
-- Deux idées, et la seconde est la plus importante :
-- 1. l'horodatage n'est pas écrivable par l'application, donc une entrée ne peut être ni antidatée
--    pour tomber dans la fenêtre de purge, ni postdatée pour y échapper ;
-- 2. la fenêtre de rétention est portée par une politique de suppression, pas par le code de la
--    procédure. Un `delete` sans clause de restriction ne supprime que ce que la fenêtre autorise :
--    une erreur dans la procédure, ou un appel malveillant, ne peut pas emporter les entrées
--    récentes.

-- Droit d'insertion accordé colonne par colonne, sans `created_at`, qui garde son défaut serveur.
REVOKE INSERT ON "audit_log" FROM "jadwal_app";
--> statement-breakpoint
GRANT INSERT ("id", "organization_id", "actor_id", "action", "target_table", "target_id", "before", "after")
	ON "audit_log" TO "jadwal_app";
--> statement-breakpoint
DROP POLICY IF EXISTS "audit_log_owner_purge" ON "audit_log";
--> statement-breakpoint
CREATE POLICY "audit_log_owner_purge" ON "audit_log"
	AS PERMISSIVE FOR DELETE TO "jadwal_owner"
	USING ("created_at" < now() - interval '24 months');
--> statement-breakpoint
-- La procédure n'est accordée à personne : ni le rôle applicatif ni le super-admin ne peuvent
-- l'appeler. Le propriétaire n'a pas de politique de lecture sur le journal : il supprime sans lire.
CREATE OR REPLACE FUNCTION "jadwal"."purge_audit_log"() RETURNS bigint
LANGUAGE plpgsql
AS $fn$
DECLARE
	supprimees bigint;
BEGIN
	DELETE FROM public."audit_log";
	GET DIAGNOSTICS supprimees = ROW_COUNT;
	RETURN supprimees;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."purge_audit_log"() FROM PUBLIC;

-- Fichier produit par Drizzle Kit, avec un seul ajout à la main : `IF EXISTS` sur la suppression,
-- parce que la migration 0029 a déjà retiré cette politique et que la même suite doit pouvoir se
-- rejouer sur une base neuve comme sur une base existante.
DROP POLICY IF EXISTS "membership_superadmin_select" ON "membership" CASCADE;--> statement-breakpoint
ALTER POLICY "audit_log_superadmin_select" ON "audit_log" TO jadwal_superadmin USING ("audit_log"."action" like 'support.%'
				or (
					"audit_log"."organization_id" = (select jadwal.current_org_id())
					and jadwal.support_access_open("audit_log"."organization_id")
				));--> statement-breakpoint
ALTER POLICY "audit_log_superadmin_insert" ON "audit_log" TO jadwal_superadmin WITH CHECK ("audit_log"."action" like 'support.%');--> statement-breakpoint
ALTER POLICY "user_auth_insert" ON "user" TO jadwal_auth WITH CHECK ("user"."is_super_admin" = false);
-- La fenêtre d'accès de support disparaît : le super-admin a désormais tous les droits, en
-- permanence (ADR 0018 révisé, ADR 0025). Fichier produit par Drizzle Kit ; le `DROP TABLE` emporte
-- ses politiques, la ligne au-dessus les retire d'abord pour que l'état enregistré reste exact.
DROP POLICY "support_access_select" ON "support_access" CASCADE;--> statement-breakpoint
DROP POLICY "support_access_superadmin_select" ON "support_access" CASCADE;--> statement-breakpoint
DROP POLICY "support_access_superadmin_insert" ON "support_access" CASCADE;--> statement-breakpoint
DROP POLICY "support_access_superadmin_update" ON "support_access" CASCADE;--> statement-breakpoint
DROP TABLE "support_access" CASCADE;
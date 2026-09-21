CREATE POLICY "membership_superadmin_select" ON "membership" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING (true);--> statement-breakpoint
CREATE POLICY "membership_superadmin_delete" ON "membership" AS PERMISSIVE FOR DELETE TO "jadwal_superadmin" USING (true);--> statement-breakpoint
ALTER POLICY "membership_insert" ON "membership" TO jadwal_superadmin WITH CHECK (true);--> statement-breakpoint
ALTER POLICY "membership_update" ON "membership" TO jadwal_superadmin USING (true) WITH CHECK (true);
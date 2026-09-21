CREATE POLICY "user_auth_select" ON "user" AS PERMISSIVE FOR SELECT TO "jadwal_auth" USING (true);--> statement-breakpoint
CREATE POLICY "user_auth_insert" ON "user" AS PERMISSIVE FOR INSERT TO "jadwal_auth" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "user_auth_update" ON "user" AS PERMISSIVE FOR UPDATE TO "jadwal_auth" USING (true) WITH CHECK (true);
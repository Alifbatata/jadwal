CREATE TABLE "admin_access_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"organization_slug" text,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"route" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_access_log_id_uuid_v7_ck" CHECK (("admin_access_log"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') is true),
	CONSTRAINT "admin_access_log_action_ck" CHECK (("admin_access_log"."action" in ('read', 'write', 'magic_link')) is true),
	CONSTRAINT "admin_access_log_route_ck" CHECK ((length(btrim("admin_access_log"."route")) > 0) is true)
);
--> statement-breakpoint
ALTER TABLE "admin_access_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"aaguid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "passkey_id_uuid_v7_ck" CHECK (("passkey"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') is true)
);
--> statement-breakpoint
ALTER TABLE "passkey" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "passkey_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_access_log_created_at_idx" ON "admin_access_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_access_log_organization_idx" ON "admin_access_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "passkey_credential_uq" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "passkey_user_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "course_superadmin_select" ON "course" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING ("course"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "course_superadmin_insert" ON "course" AS PERMISSIVE FOR INSERT TO "jadwal_superadmin" WITH CHECK ("course"."organization_id" = (select jadwal.current_org_id()) and ("course"."updated_by" is null or exists (select 1 from "user" u where u."id" = "course"."updated_by")));--> statement-breakpoint
CREATE POLICY "course_superadmin_update" ON "course" AS PERMISSIVE FOR UPDATE TO "jadwal_superadmin" USING ("course"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("course"."organization_id" = (select jadwal.current_org_id()) and ("course"."updated_by" is null or exists (select 1 from "user" u where u."id" = "course"."updated_by")));--> statement-breakpoint
CREATE POLICY "course_superadmin_delete" ON "course" AS PERMISSIVE FOR DELETE TO "jadwal_superadmin" USING ("course"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "course_translation_superadmin_select" ON "course_translation" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING ("course_translation"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "course_translation_superadmin_insert" ON "course_translation" AS PERMISSIVE FOR INSERT TO "jadwal_superadmin" WITH CHECK ("course_translation"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "course_translation_superadmin_update" ON "course_translation" AS PERMISSIVE FOR UPDATE TO "jadwal_superadmin" USING ("course_translation"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("course_translation"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "course_translation_superadmin_delete" ON "course_translation" AS PERMISSIVE FOR DELETE TO "jadwal_superadmin" USING ("course_translation"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "invitation_superadmin_select" ON "invitation" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING ("invitation"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "invitation_superadmin_insert" ON "invitation" AS PERMISSIVE FOR INSERT TO "jadwal_superadmin" WITH CHECK ("invitation"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "invitation_superadmin_update" ON "invitation" AS PERMISSIVE FOR UPDATE TO "jadwal_superadmin" USING ("invitation"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("invitation"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "invitation_superadmin_delete" ON "invitation" AS PERMISSIVE FOR DELETE TO "jadwal_superadmin" USING ("invitation"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "membership_superadmin_select" ON "membership" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING ("membership"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "membership_superadmin_insert" ON "membership" AS PERMISSIVE FOR INSERT TO "jadwal_superadmin" WITH CHECK ("membership"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "membership_superadmin_update" ON "membership" AS PERMISSIVE FOR UPDATE TO "jadwal_superadmin" USING ("membership"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("membership"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "pause_superadmin_select" ON "pause" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING ("pause"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "pause_superadmin_insert" ON "pause" AS PERMISSIVE FOR INSERT TO "jadwal_superadmin" WITH CHECK ("pause"."organization_id" = (select jadwal.current_org_id()) and ("pause"."created_by" is null or exists (select 1 from "user" u where u."id" = "pause"."created_by")));--> statement-breakpoint
CREATE POLICY "pause_superadmin_update" ON "pause" AS PERMISSIVE FOR UPDATE TO "jadwal_superadmin" USING ("pause"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("pause"."organization_id" = (select jadwal.current_org_id()) and ("pause"."created_by" is null or exists (select 1 from "user" u where u."id" = "pause"."created_by")));--> statement-breakpoint
CREATE POLICY "pause_superadmin_delete" ON "pause" AS PERMISSIVE FOR DELETE TO "jadwal_superadmin" USING ("pause"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_day_superadmin_select" ON "prayer_day" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING ("prayer_day"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_day_superadmin_insert" ON "prayer_day" AS PERMISSIVE FOR INSERT TO "jadwal_superadmin" WITH CHECK ("prayer_day"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_day_superadmin_update" ON "prayer_day" AS PERMISSIVE FOR UPDATE TO "jadwal_superadmin" USING ("prayer_day"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("prayer_day"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_day_superadmin_delete" ON "prayer_day" AS PERMISSIVE FOR DELETE TO "jadwal_superadmin" USING ("prayer_day"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_settings_superadmin_select" ON "prayer_settings" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING ("prayer_settings"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_settings_superadmin_insert" ON "prayer_settings" AS PERMISSIVE FOR INSERT TO "jadwal_superadmin" WITH CHECK ("prayer_settings"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_settings_superadmin_update" ON "prayer_settings" AS PERMISSIVE FOR UPDATE TO "jadwal_superadmin" USING ("prayer_settings"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("prayer_settings"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_settings_superadmin_delete" ON "prayer_settings" AS PERMISSIVE FOR DELETE TO "jadwal_superadmin" USING ("prayer_settings"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "room_superadmin_select" ON "room" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING ("room"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "room_superadmin_insert" ON "room" AS PERMISSIVE FOR INSERT TO "jadwal_superadmin" WITH CHECK ("room"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "room_superadmin_update" ON "room" AS PERMISSIVE FOR UPDATE TO "jadwal_superadmin" USING ("room"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("room"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "room_superadmin_delete" ON "room" AS PERMISSIVE FOR DELETE TO "jadwal_superadmin" USING ("room"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "session_exception_superadmin_select" ON "session_exception" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING ("session_exception"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "session_exception_superadmin_insert" ON "session_exception" AS PERMISSIVE FOR INSERT TO "jadwal_superadmin" WITH CHECK ("session_exception"."organization_id" = (select jadwal.current_org_id()) and ("session_exception"."created_by" is null or exists (select 1 from "user" u where u."id" = "session_exception"."created_by")));--> statement-breakpoint
CREATE POLICY "session_exception_superadmin_update" ON "session_exception" AS PERMISSIVE FOR UPDATE TO "jadwal_superadmin" USING ("session_exception"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("session_exception"."organization_id" = (select jadwal.current_org_id()) and ("session_exception"."created_by" is null or exists (select 1 from "user" u where u."id" = "session_exception"."created_by")));--> statement-breakpoint
CREATE POLICY "session_exception_superadmin_delete" ON "session_exception" AS PERMISSIVE FOR DELETE TO "jadwal_superadmin" USING ("session_exception"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "admin_access_log_superadmin_select" ON "admin_access_log" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING (true);--> statement-breakpoint
CREATE POLICY "admin_access_log_superadmin_insert" ON "admin_access_log" AS PERMISSIVE FOR INSERT TO "jadwal_superadmin" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "passkey_auth_select" ON "passkey" AS PERMISSIVE FOR SELECT TO "jadwal_auth" USING (true);--> statement-breakpoint
CREATE POLICY "passkey_auth_insert" ON "passkey" AS PERMISSIVE FOR INSERT TO "jadwal_auth" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "passkey_auth_update" ON "passkey" AS PERMISSIVE FOR UPDATE TO "jadwal_auth" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "passkey_auth_delete" ON "passkey" AS PERMISSIVE FOR DELETE TO "jadwal_auth" USING (true);--> statement-breakpoint
ALTER POLICY "audit_log_superadmin_select" ON "audit_log" TO jadwal_superadmin USING ("audit_log"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
ALTER POLICY "audit_log_superadmin_insert" ON "audit_log" TO jadwal_superadmin WITH CHECK ("audit_log"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
ALTER POLICY "membership_superadmin_delete" ON "membership" TO jadwal_superadmin USING ("membership"."organization_id" = (select jadwal.current_org_id()));
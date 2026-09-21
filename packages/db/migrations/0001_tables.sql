CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_table" text NOT NULL,
	"target_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_id_uuid_v7_ck" CHECK ("audit_log"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "audit_log_action_ck" CHECK (length(btrim("audit_log"."action")) > 0)
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "course" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"audience" text NOT NULL,
	"teaching_language" text[] NOT NULL,
	"room_id" uuid,
	"teacher" text,
	"source_language" text NOT NULL,
	"recurrence_kind" text NOT NULL,
	"recurrence_weekday" smallint[],
	"recurrence_interval" smallint,
	"recurrence_anchor_date" date,
	"recurrence_ordinal_weekday" smallint,
	"recurrence_ordinal" smallint,
	"recurrence_date" date[],
	"timing_kind" text NOT NULL,
	"timing_start" time,
	"timing_end" time,
	"timing_prayer" text,
	"timing_offset_minutes" smallint,
	"timing_duration_minutes" smallint,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "course_id_organization_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "course_id_uuid_v7_ck" CHECK ("course"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "course_status_ck" CHECK ("course"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "course_audience_ck" CHECK ("course"."audience" in ('kids', 'youth', 'women', 'adults', 'open')),
	CONSTRAINT "course_teaching_language_ck" CHECK (array_length("course"."teaching_language", 1) >= 1),
	CONSTRAINT "course_ends_on_ck" CHECK ("course"."ends_on" is null or "course"."ends_on" >= "course"."starts_on"),
	CONSTRAINT "course_sequence_ck" CHECK ("course"."sequence" >= 0),
	CONSTRAINT "course_recurrence_kind_ck" CHECK ("course"."recurrence_kind" in ('weekly', 'monthly', 'dates')),
	CONSTRAINT "course_timing_kind_ck" CHECK ("course"."timing_kind" in ('fixed', 'prayer')),
	CONSTRAINT "course_recurrence_shape_ck" CHECK (case "course"."recurrence_kind"
				when 'weekly' then
					"course"."recurrence_weekday" is not null
					and array_length("course"."recurrence_weekday", 1) between 1 and 7
					and "course"."recurrence_weekday" <@ array[1,2,3,4,5,6,7]::smallint[]
					and jadwal.has_no_duplicate("course"."recurrence_weekday")
					and "course"."recurrence_interval" in (1, 2)
					and "course"."recurrence_anchor_date" is not null
					and "course"."recurrence_ordinal_weekday" is null and "course"."recurrence_ordinal" is null
					and "course"."recurrence_date" is null
				when 'monthly' then
					"course"."recurrence_ordinal_weekday" between 1 and 7
					and "course"."recurrence_ordinal" in (1, 2, 3, 4, -1)
					and "course"."recurrence_weekday" is null and "course"."recurrence_interval" is null
					and "course"."recurrence_anchor_date" is null and "course"."recurrence_date" is null
				when 'dates' then
					"course"."recurrence_date" is not null
					and array_length("course"."recurrence_date", 1) >= 1
					and jadwal.has_no_duplicate("course"."recurrence_date")
					and "course"."recurrence_weekday" is null and "course"."recurrence_interval" is null
					and "course"."recurrence_anchor_date" is null and "course"."recurrence_ordinal_weekday" is null
					and "course"."recurrence_ordinal" is null
				else false end),
	CONSTRAINT "course_timing_shape_ck" CHECK (case "course"."timing_kind"
				when 'fixed' then
					"course"."timing_start" is not null and "course"."timing_end" is not null
					and "course"."timing_prayer" is null and "course"."timing_offset_minutes" is null
					and "course"."timing_duration_minutes" is null
				when 'prayer' then
					"course"."timing_prayer" in ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha')
					and "course"."timing_offset_minutes" between -120 and 240
					and "course"."timing_duration_minutes" between 5 and 1440
					and "course"."timing_start" is null and "course"."timing_end" is null
				else false end)
);
--> statement-breakpoint
ALTER TABLE "course" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "course_translation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"language" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_translation_course_language_uq" UNIQUE("course_id","language"),
	CONSTRAINT "course_translation_id_uuid_v7_ck" CHECK ("course_translation"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "course_translation_title_ck" CHECK (length(btrim("course_translation"."title")) > 0)
);
--> statement-breakpoint
ALTER TABLE "course_translation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_organization_user_uq" UNIQUE("organization_id","user_id"),
	CONSTRAINT "membership_id_uuid_v7_ck" CHECK ("membership"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "membership_role_ck" CHECK ("membership"."role" in ('org_admin', 'editor'))
);
--> statement-breakpoint
ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"time_zone" text NOT NULL,
	"accent_color" text DEFAULT '#0f766e' NOT NULL,
	"default_language" text NOT NULL,
	"enabled_language" text[] NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_id_uuid_v7_ck" CHECK ("organization"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "organization_slug_ck" CHECK ("organization"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "organization_accent_color_ck" CHECK ("organization"."accent_color" ~ '^#[0-9a-fA-F]{6}$'),
	CONSTRAINT "organization_plan_ck" CHECK ("organization"."plan" in ('free', 'sponsored', 'paid')),
	CONSTRAINT "organization_status_ck" CHECK ("organization"."status" in ('active', 'suspended')),
	CONSTRAINT "organization_language_ck" CHECK (array_length("organization"."enabled_language", 1) >= 1),
	CONSTRAINT "organization_default_language_ck" CHECK ("organization"."default_language" = any("organization"."enabled_language"))
);
--> statement-breakpoint
ALTER TABLE "organization" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pause" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"course_id" uuid,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pause_id_uuid_v7_ck" CHECK ("pause"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "pause_range_ck" CHECK ("pause"."to_date" >= "pause"."from_date")
);
--> statement-breakpoint
ALTER TABLE "pause" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prayer_day" (
	"organization_id" uuid NOT NULL,
	"date" date NOT NULL,
	"fajr" time NOT NULL,
	"dhuhr" time NOT NULL,
	"asr" time NOT NULL,
	"maghrib" time NOT NULL,
	"isha" time NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prayer_day_pk" PRIMARY KEY("organization_id","date"),
	CONSTRAINT "prayer_day_source_ck" CHECK ("prayer_day"."source" in ('import', 'computed'))
);
--> statement-breakpoint
ALTER TABLE "prayer_day" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prayer_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"method" text,
	"fajr_adjustment" smallint DEFAULT 0 NOT NULL,
	"dhuhr_adjustment" smallint DEFAULT 0 NOT NULL,
	"asr_adjustment" smallint DEFAULT 0 NOT NULL,
	"maghrib_adjustment" smallint DEFAULT 0 NOT NULL,
	"isha_adjustment" smallint DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'import' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prayer_settings_source_ck" CHECK ("prayer_settings"."source" in ('import', 'computed')),
	CONSTRAINT "prayer_settings_adjustment_ck" CHECK ("prayer_settings"."fajr_adjustment" between -120 and 120
				and "prayer_settings"."dhuhr_adjustment" between -120 and 120
				and "prayer_settings"."asr_adjustment" between -120 and 120
				and "prayer_settings"."maghrib_adjustment" between -120 and 120
				and "prayer_settings"."isha_adjustment" between -120 and 120)
);
--> statement-breakpoint
ALTER TABLE "prayer_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "room" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_id_organization_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "room_organization_name_uq" UNIQUE("organization_id","name"),
	CONSTRAINT "room_id_uuid_v7_ck" CHECK ("room"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
);
--> statement-breakpoint
ALTER TABLE "room" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "session_exception" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"to_date" date,
	"to_start" time,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_exception_course_date_uq" UNIQUE("course_id","date"),
	CONSTRAINT "session_exception_id_uuid_v7_ck" CHECK ("session_exception"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "session_exception_kind_ck" CHECK ("session_exception"."kind" in ('cancelled', 'moved')),
	CONSTRAINT "session_exception_shape_ck" CHECK (case "session_exception"."kind"
				when 'cancelled' then "session_exception"."to_date" is null and "session_exception"."to_start" is null
				when 'moved' then "session_exception"."to_date" is not null and "session_exception"."to_start" is not null
				else false end)
);
--> statement-breakpoint
ALTER TABLE "session_exception" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_id_uuid_v7_ck" CHECK ("user"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
	CONSTRAINT "user_email_ck" CHECK ("user"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
);
--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_room_fk" FOREIGN KEY ("room_id","organization_id") REFERENCES "public"."room"("id","organization_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_translation" ADD CONSTRAINT "course_translation_course_fk" FOREIGN KEY ("course_id","organization_id") REFERENCES "public"."course"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pause" ADD CONSTRAINT "pause_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pause" ADD CONSTRAINT "pause_course_fk" FOREIGN KEY ("course_id","organization_id") REFERENCES "public"."course"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pause" ADD CONSTRAINT "pause_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_day" ADD CONSTRAINT "prayer_day_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_settings" ADD CONSTRAINT "prayer_settings_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room" ADD CONSTRAINT "room_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exception" ADD CONSTRAINT "session_exception_course_fk" FOREIGN KEY ("course_id","organization_id") REFERENCES "public"."course"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exception" ADD CONSTRAINT "session_exception_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_organization_created_at_idx" ON "audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "course_organization_idx" ON "course" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "course_organization_status_idx" ON "course" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "course_room_idx" ON "course" USING btree ("room_id","organization_id");--> statement-breakpoint
CREATE INDEX "course_updated_by_idx" ON "course" USING btree ("updated_by");--> statement-breakpoint
CREATE INDEX "course_translation_course_idx" ON "course_translation" USING btree ("course_id","organization_id");--> statement-breakpoint
CREATE INDEX "course_translation_organization_idx" ON "course_translation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_uq" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "pause_organization_idx" ON "pause" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "pause_course_idx" ON "pause" USING btree ("course_id","organization_id");--> statement-breakpoint
CREATE INDEX "pause_created_by_idx" ON "pause" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "room_organization_idx" ON "room" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "session_exception_course_idx" ON "session_exception" USING btree ("course_id","organization_id");--> statement-breakpoint
CREATE INDEX "session_exception_created_by_idx" ON "session_exception" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "session_exception_organization_date_idx" ON "session_exception" USING btree ("organization_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_uq" ON "user" USING btree (lower("email"));--> statement-breakpoint
CREATE POLICY "audit_log_select" ON "audit_log" AS PERMISSIVE FOR SELECT TO "jadwal_app" USING ("audit_log"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "audit_log_insert" ON "audit_log" AS PERMISSIVE FOR INSERT TO "jadwal_app" WITH CHECK ("audit_log"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "audit_log_superadmin_select" ON "audit_log" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING (true);--> statement-breakpoint
CREATE POLICY "course_select" ON "course" AS PERMISSIVE FOR SELECT TO "jadwal_app" USING ("course"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "course_insert" ON "course" AS PERMISSIVE FOR INSERT TO "jadwal_app" WITH CHECK ("course"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "course_update" ON "course" AS PERMISSIVE FOR UPDATE TO "jadwal_app" USING ("course"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("course"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "course_delete" ON "course" AS PERMISSIVE FOR DELETE TO "jadwal_app" USING ("course"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "course_translation_select" ON "course_translation" AS PERMISSIVE FOR SELECT TO "jadwal_app" USING ("course_translation"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "course_translation_insert" ON "course_translation" AS PERMISSIVE FOR INSERT TO "jadwal_app" WITH CHECK ("course_translation"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "course_translation_update" ON "course_translation" AS PERMISSIVE FOR UPDATE TO "jadwal_app" USING ("course_translation"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("course_translation"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "course_translation_delete" ON "course_translation" AS PERMISSIVE FOR DELETE TO "jadwal_app" USING ("course_translation"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "membership_select" ON "membership" AS PERMISSIVE FOR SELECT TO "jadwal_app" USING ("membership"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "membership_insert" ON "membership" AS PERMISSIVE FOR INSERT TO "jadwal_app" WITH CHECK ("membership"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "membership_update" ON "membership" AS PERMISSIVE FOR UPDATE TO "jadwal_app" USING ("membership"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("membership"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "membership_delete" ON "membership" AS PERMISSIVE FOR DELETE TO "jadwal_app" USING ("membership"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "organization_select" ON "organization" AS PERMISSIVE FOR SELECT TO "jadwal_app" USING ("organization"."id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "organization_update" ON "organization" AS PERMISSIVE FOR UPDATE TO "jadwal_app" USING ("organization"."id" = (select jadwal.current_org_id())) WITH CHECK ("organization"."id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "organization_superadmin_select" ON "organization" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING (true);--> statement-breakpoint
CREATE POLICY "organization_superadmin_insert" ON "organization" AS PERMISSIVE FOR INSERT TO "jadwal_superadmin" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "organization_superadmin_update" ON "organization" AS PERMISSIVE FOR UPDATE TO "jadwal_superadmin" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "organization_superadmin_delete" ON "organization" AS PERMISSIVE FOR DELETE TO "jadwal_superadmin" USING (true);--> statement-breakpoint
CREATE POLICY "pause_select" ON "pause" AS PERMISSIVE FOR SELECT TO "jadwal_app" USING ("pause"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "pause_insert" ON "pause" AS PERMISSIVE FOR INSERT TO "jadwal_app" WITH CHECK ("pause"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "pause_update" ON "pause" AS PERMISSIVE FOR UPDATE TO "jadwal_app" USING ("pause"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("pause"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "pause_delete" ON "pause" AS PERMISSIVE FOR DELETE TO "jadwal_app" USING ("pause"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_day_select" ON "prayer_day" AS PERMISSIVE FOR SELECT TO "jadwal_app" USING ("prayer_day"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_day_insert" ON "prayer_day" AS PERMISSIVE FOR INSERT TO "jadwal_app" WITH CHECK ("prayer_day"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_day_update" ON "prayer_day" AS PERMISSIVE FOR UPDATE TO "jadwal_app" USING ("prayer_day"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("prayer_day"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_day_delete" ON "prayer_day" AS PERMISSIVE FOR DELETE TO "jadwal_app" USING ("prayer_day"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_settings_select" ON "prayer_settings" AS PERMISSIVE FOR SELECT TO "jadwal_app" USING ("prayer_settings"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_settings_insert" ON "prayer_settings" AS PERMISSIVE FOR INSERT TO "jadwal_app" WITH CHECK ("prayer_settings"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_settings_update" ON "prayer_settings" AS PERMISSIVE FOR UPDATE TO "jadwal_app" USING ("prayer_settings"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("prayer_settings"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_settings_delete" ON "prayer_settings" AS PERMISSIVE FOR DELETE TO "jadwal_app" USING ("prayer_settings"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "room_select" ON "room" AS PERMISSIVE FOR SELECT TO "jadwal_app" USING ("room"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "room_insert" ON "room" AS PERMISSIVE FOR INSERT TO "jadwal_app" WITH CHECK ("room"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "room_update" ON "room" AS PERMISSIVE FOR UPDATE TO "jadwal_app" USING ("room"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("room"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "room_delete" ON "room" AS PERMISSIVE FOR DELETE TO "jadwal_app" USING ("room"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "session_exception_select" ON "session_exception" AS PERMISSIVE FOR SELECT TO "jadwal_app" USING ("session_exception"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "session_exception_insert" ON "session_exception" AS PERMISSIVE FOR INSERT TO "jadwal_app" WITH CHECK ("session_exception"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "session_exception_update" ON "session_exception" AS PERMISSIVE FOR UPDATE TO "jadwal_app" USING ("session_exception"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("session_exception"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "session_exception_delete" ON "session_exception" AS PERMISSIVE FOR DELETE TO "jadwal_app" USING ("session_exception"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "user_select" ON "user" AS PERMISSIVE FOR SELECT TO "jadwal_app" USING ("user"."id" = (select jadwal.current_user_id()) or exists (
				select 1 from "membership" m
				where m."user_id" = "user"."id" and m."organization_id" = (select jadwal.current_org_id())
			));--> statement-breakpoint
CREATE POLICY "user_superadmin_select" ON "user" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING (true);
CREATE TABLE "prayer_period" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date,
	"fajr" time,
	"dhuhr" time,
	"asr" time,
	"maghrib" time,
	"isha" time,
	"fajr_iqama" time,
	"dhuhr_iqama" time,
	"asr_iqama" time,
	"maghrib_iqama" time,
	"isha_iqama" time,
	"fajr_iqama_offset" smallint,
	"dhuhr_iqama_offset" smallint,
	"asr_iqama_offset" smallint,
	"maghrib_iqama_offset" smallint,
	"isha_iqama_offset" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prayer_period_id_organization_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "prayer_period_id_uuid_v7_ck" CHECK (("prayer_period"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') is true),
	CONSTRAINT "prayer_period_name_ck" CHECK ((length(btrim("prayer_period"."name")) > 0 is true) is true),
	CONSTRAINT "prayer_period_dates_ck" CHECK (("prayer_period"."to_date" is null or "prayer_period"."to_date" >= "prayer_period"."from_date") is true),
	CONSTRAINT "prayer_period_time_ck" CHECK ((("prayer_period"."fajr" is null or "prayer_period"."fajr" < time '24:00:00' and extract(second from "prayer_period"."fajr") = 0)
				and ("prayer_period"."dhuhr" is null or "prayer_period"."dhuhr" < time '24:00:00' and extract(second from "prayer_period"."dhuhr") = 0)
				and ("prayer_period"."asr" is null or "prayer_period"."asr" < time '24:00:00' and extract(second from "prayer_period"."asr") = 0)
				and ("prayer_period"."maghrib" is null or "prayer_period"."maghrib" < time '24:00:00' and extract(second from "prayer_period"."maghrib") = 0)
				and ("prayer_period"."isha" is null or "prayer_period"."isha" < time '24:00:00' and extract(second from "prayer_period"."isha") = 0)) is true),
	CONSTRAINT "prayer_period_iqama_time_ck" CHECK ((("prayer_period"."fajr_iqama" is null or "prayer_period"."fajr_iqama" < time '24:00:00' and extract(second from "prayer_period"."fajr_iqama") = 0)
				and ("prayer_period"."dhuhr_iqama" is null or "prayer_period"."dhuhr_iqama" < time '24:00:00' and extract(second from "prayer_period"."dhuhr_iqama") = 0)
				and ("prayer_period"."asr_iqama" is null or "prayer_period"."asr_iqama" < time '24:00:00' and extract(second from "prayer_period"."asr_iqama") = 0)
				and ("prayer_period"."maghrib_iqama" is null or "prayer_period"."maghrib_iqama" < time '24:00:00' and extract(second from "prayer_period"."maghrib_iqama") = 0)
				and ("prayer_period"."isha_iqama" is null or "prayer_period"."isha_iqama" < time '24:00:00' and extract(second from "prayer_period"."isha_iqama") = 0)) is true),
	CONSTRAINT "prayer_period_iqama_exclusive_ck" CHECK ((num_nonnulls("prayer_period"."fajr_iqama", "prayer_period"."fajr_iqama_offset") <= 1
				and num_nonnulls("prayer_period"."dhuhr_iqama", "prayer_period"."dhuhr_iqama_offset") <= 1
				and num_nonnulls("prayer_period"."asr_iqama", "prayer_period"."asr_iqama_offset") <= 1
				and num_nonnulls("prayer_period"."maghrib_iqama", "prayer_period"."maghrib_iqama_offset") <= 1
				and num_nonnulls("prayer_period"."isha_iqama", "prayer_period"."isha_iqama_offset") <= 1) is true),
	CONSTRAINT "prayer_period_iqama_offset_ck" CHECK ((("prayer_period"."fajr_iqama_offset" is null or "prayer_period"."fajr_iqama_offset" between 0 and 120)
				and ("prayer_period"."dhuhr_iqama_offset" is null or "prayer_period"."dhuhr_iqama_offset" between 0 and 120)
				and ("prayer_period"."asr_iqama_offset" is null or "prayer_period"."asr_iqama_offset" between 0 and 120)
				and ("prayer_period"."maghrib_iqama_offset" is null or "prayer_period"."maghrib_iqama_offset" between 0 and 120)
				and ("prayer_period"."isha_iqama_offset" is null or "prayer_period"."isha_iqama_offset" between 0 and 120)) is true)
);
--> statement-breakpoint
ALTER TABLE "prayer_period" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "kind" text DEFAULT 'course' NOT NULL;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "jumua_order" smallint;--> statement-breakpoint
ALTER TABLE "prayer_period" ADD CONSTRAINT "prayer_period_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prayer_period_organization_idx" ON "prayer_period" USING btree ("organization_id","from_date");--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_kind_ck" CHECK (("course"."kind" in ('course', 'jumua')) is true);--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_jumua_order_ck" CHECK ((("course"."kind" = 'jumua') = ("course"."jumua_order" is not null)
				and ("course"."jumua_order" is null or "course"."jumua_order" between 1 and 3)) is true);--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_jumua_shape_ck" CHECK (("course"."kind" <> 'jumua' or (
				"course"."timing_kind" = 'fixed'
				and "course"."recurrence_kind" = 'weekly'
				and "course"."recurrence_interval" = 1
				and "course"."recurrence_weekday" = array[5]::smallint[]
			)) is true);--> statement-breakpoint
CREATE POLICY "prayer_period_select" ON "prayer_period" AS PERMISSIVE FOR SELECT TO "jadwal_app" USING ("prayer_period"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_period_insert" ON "prayer_period" AS PERMISSIVE FOR INSERT TO "jadwal_app" WITH CHECK ("prayer_period"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_period_update" ON "prayer_period" AS PERMISSIVE FOR UPDATE TO "jadwal_app" USING ("prayer_period"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("prayer_period"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_period_delete" ON "prayer_period" AS PERMISSIVE FOR DELETE TO "jadwal_app" USING ("prayer_period"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_period_superadmin_select" ON "prayer_period" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING ("prayer_period"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_period_superadmin_insert" ON "prayer_period" AS PERMISSIVE FOR INSERT TO "jadwal_superadmin" WITH CHECK ("prayer_period"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_period_superadmin_update" ON "prayer_period" AS PERMISSIVE FOR UPDATE TO "jadwal_superadmin" USING ("prayer_period"."organization_id" = (select jadwal.current_org_id())) WITH CHECK ("prayer_period"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_period_superadmin_delete" ON "prayer_period" AS PERMISSIVE FOR DELETE TO "jadwal_superadmin" USING ("prayer_period"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "prayer_period_public_select" ON "prayer_period" AS PERMISSIVE FOR SELECT TO "jadwal_public" USING (exists (select 1 from "organization" o where o."id" = "prayer_period"."organization_id"));
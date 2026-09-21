ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_id_uuid_v7_ck";--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_ck";--> statement-breakpoint
ALTER TABLE "course" DROP CONSTRAINT "course_id_uuid_v7_ck";--> statement-breakpoint
ALTER TABLE "course" DROP CONSTRAINT "course_status_ck";--> statement-breakpoint
ALTER TABLE "course" DROP CONSTRAINT "course_audience_ck";--> statement-breakpoint
ALTER TABLE "course" DROP CONSTRAINT "course_teaching_language_ck";--> statement-breakpoint
ALTER TABLE "course" DROP CONSTRAINT "course_ends_on_ck";--> statement-breakpoint
ALTER TABLE "course" DROP CONSTRAINT "course_sequence_ck";--> statement-breakpoint
ALTER TABLE "course" DROP CONSTRAINT "course_recurrence_kind_ck";--> statement-breakpoint
ALTER TABLE "course" DROP CONSTRAINT "course_timing_kind_ck";--> statement-breakpoint
ALTER TABLE "course" DROP CONSTRAINT "course_recurrence_shape_ck";--> statement-breakpoint
ALTER TABLE "course" DROP CONSTRAINT "course_timing_shape_ck";--> statement-breakpoint
ALTER TABLE "course_translation" DROP CONSTRAINT "course_translation_id_uuid_v7_ck";--> statement-breakpoint
ALTER TABLE "course_translation" DROP CONSTRAINT "course_translation_title_ck";--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT "membership_id_uuid_v7_ck";--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT "membership_role_ck";--> statement-breakpoint
ALTER TABLE "organization" DROP CONSTRAINT "organization_id_uuid_v7_ck";--> statement-breakpoint
ALTER TABLE "organization" DROP CONSTRAINT "organization_slug_ck";--> statement-breakpoint
ALTER TABLE "organization" DROP CONSTRAINT "organization_accent_color_ck";--> statement-breakpoint
ALTER TABLE "organization" DROP CONSTRAINT "organization_plan_ck";--> statement-breakpoint
ALTER TABLE "organization" DROP CONSTRAINT "organization_status_ck";--> statement-breakpoint
ALTER TABLE "organization" DROP CONSTRAINT "organization_language_ck";--> statement-breakpoint
ALTER TABLE "organization" DROP CONSTRAINT "organization_default_language_ck";--> statement-breakpoint
ALTER TABLE "pause" DROP CONSTRAINT "pause_id_uuid_v7_ck";--> statement-breakpoint
ALTER TABLE "pause" DROP CONSTRAINT "pause_range_ck";--> statement-breakpoint
ALTER TABLE "prayer_day" DROP CONSTRAINT "prayer_day_source_ck";--> statement-breakpoint
ALTER TABLE "prayer_settings" DROP CONSTRAINT "prayer_settings_source_ck";--> statement-breakpoint
ALTER TABLE "prayer_settings" DROP CONSTRAINT "prayer_settings_adjustment_ck";--> statement-breakpoint
ALTER TABLE "room" DROP CONSTRAINT "room_id_uuid_v7_ck";--> statement-breakpoint
ALTER TABLE "session_exception" DROP CONSTRAINT "session_exception_id_uuid_v7_ck";--> statement-breakpoint
ALTER TABLE "session_exception" DROP CONSTRAINT "session_exception_kind_ck";--> statement-breakpoint
ALTER TABLE "session_exception" DROP CONSTRAINT "session_exception_shape_ck";--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_id_uuid_v7_ck";--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_email_ck";--> statement-breakpoint
DROP INDEX "pause_organization_idx";--> statement-breakpoint
CREATE INDEX "course_translation_organization_language_idx" ON "course_translation" USING btree ("organization_id","language");--> statement-breakpoint
CREATE INDEX "pause_organization_range_idx" ON "pause" USING btree ("organization_id","from_date","to_date");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_id_uuid_v7_ck" CHECK (("audit_log"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') is true);--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_ck" CHECK ((length(btrim("audit_log"."action")) > 0) is true);--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_id_uuid_v7_ck" CHECK (("course"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') is true);--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_status_ck" CHECK (("course"."status" in ('draft', 'published', 'archived')) is true);--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_audience_ck" CHECK (("course"."audience" in ('kids', 'youth', 'women', 'adults', 'open')) is true);--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_teaching_language_ck" CHECK ((cardinality("course"."teaching_language") >= 1 and array_position("course"."teaching_language", null) is null) is true);--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_ends_on_ck" CHECK (("course"."ends_on" is null or "course"."ends_on" >= "course"."starts_on") is true);--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_sequence_ck" CHECK (("course"."sequence" >= 0) is true);--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_recurrence_kind_ck" CHECK (("course"."recurrence_kind" in ('weekly', 'monthly', 'dates')) is true);--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_timing_kind_ck" CHECK (("course"."timing_kind" in ('fixed', 'prayer')) is true);--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_recurrence_shape_ck" CHECK ((case "course"."recurrence_kind"
				when 'weekly' then
					"course"."recurrence_weekday" is not null
					and cardinality("course"."recurrence_weekday") between 1 and 7
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
					and cardinality("course"."recurrence_date") >= 1
					and jadwal.has_no_duplicate("course"."recurrence_date")
					and "course"."recurrence_weekday" is null and "course"."recurrence_interval" is null
					and "course"."recurrence_anchor_date" is null and "course"."recurrence_ordinal_weekday" is null
					and "course"."recurrence_ordinal" is null
				else false end) is true);--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_timing_shape_ck" CHECK ((case "course"."timing_kind"
				when 'fixed' then
					"course"."timing_start" is not null and "course"."timing_end" is not null
					and "course"."timing_start" < time '24:00:00' and extract(second from "course"."timing_start") = 0 and "course"."timing_end" < time '24:00:00' and extract(second from "course"."timing_end") = 0
					and "course"."timing_prayer" is null and "course"."timing_offset_minutes" is null
					and "course"."timing_duration_minutes" is null
				when 'prayer' then
					"course"."timing_prayer" in ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha')
					and "course"."timing_offset_minutes" between -120 and 240
					and "course"."timing_duration_minutes" between 5 and 1440
					and "course"."timing_start" is null and "course"."timing_end" is null
				else false end) is true);--> statement-breakpoint
ALTER TABLE "course_translation" ADD CONSTRAINT "course_translation_id_uuid_v7_ck" CHECK (("course_translation"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') is true);--> statement-breakpoint
ALTER TABLE "course_translation" ADD CONSTRAINT "course_translation_title_ck" CHECK ((length(btrim("course_translation"."title")) > 0) is true);--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_id_uuid_v7_ck" CHECK (("membership"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') is true);--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_role_ck" CHECK (("membership"."role" in ('org_admin', 'editor')) is true);--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_id_uuid_v7_ck" CHECK (("organization"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') is true);--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_slug_ck" CHECK (("organization"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$') is true);--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_accent_color_ck" CHECK (("organization"."accent_color" ~ '^#[0-9a-fA-F]{6}$') is true);--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_plan_ck" CHECK (("organization"."plan" in ('free', 'sponsored', 'paid')) is true);--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_status_ck" CHECK (("organization"."status" in ('active', 'suspended')) is true);--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_language_ck" CHECK ((cardinality("organization"."enabled_language") >= 1 and array_position("organization"."enabled_language", null) is null) is true);--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_default_language_ck" CHECK (("organization"."default_language" = any("organization"."enabled_language")) is true);--> statement-breakpoint
ALTER TABLE "pause" ADD CONSTRAINT "pause_id_uuid_v7_ck" CHECK (("pause"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') is true);--> statement-breakpoint
ALTER TABLE "pause" ADD CONSTRAINT "pause_range_ck" CHECK (("pause"."to_date" >= "pause"."from_date") is true);--> statement-breakpoint
ALTER TABLE "prayer_day" ADD CONSTRAINT "prayer_day_time_ck" CHECK (("prayer_day"."fajr" < time '24:00:00' and extract(second from "prayer_day"."fajr") = 0 and "prayer_day"."dhuhr" < time '24:00:00' and extract(second from "prayer_day"."dhuhr") = 0 and "prayer_day"."asr" < time '24:00:00' and extract(second from "prayer_day"."asr") = 0
				and "prayer_day"."maghrib" < time '24:00:00' and extract(second from "prayer_day"."maghrib") = 0 and "prayer_day"."isha" < time '24:00:00' and extract(second from "prayer_day"."isha") = 0) is true);--> statement-breakpoint
ALTER TABLE "prayer_day" ADD CONSTRAINT "prayer_day_source_ck" CHECK (("prayer_day"."source" in ('import', 'computed')) is true);--> statement-breakpoint
ALTER TABLE "prayer_settings" ADD CONSTRAINT "prayer_settings_source_ck" CHECK (("prayer_settings"."source" in ('import', 'computed')) is true);--> statement-breakpoint
ALTER TABLE "prayer_settings" ADD CONSTRAINT "prayer_settings_adjustment_ck" CHECK (("prayer_settings"."fajr_adjustment" between -120 and 120
				and "prayer_settings"."dhuhr_adjustment" between -120 and 120
				and "prayer_settings"."asr_adjustment" between -120 and 120
				and "prayer_settings"."maghrib_adjustment" between -120 and 120
				and "prayer_settings"."isha_adjustment" between -120 and 120) is true);--> statement-breakpoint
ALTER TABLE "room" ADD CONSTRAINT "room_id_uuid_v7_ck" CHECK (("room"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') is true);--> statement-breakpoint
ALTER TABLE "session_exception" ADD CONSTRAINT "session_exception_id_uuid_v7_ck" CHECK (("session_exception"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') is true);--> statement-breakpoint
ALTER TABLE "session_exception" ADD CONSTRAINT "session_exception_kind_ck" CHECK (("session_exception"."kind" in ('cancelled', 'moved')) is true);--> statement-breakpoint
ALTER TABLE "session_exception" ADD CONSTRAINT "session_exception_shape_ck" CHECK ((case "session_exception"."kind"
				when 'cancelled' then "session_exception"."to_date" is null and "session_exception"."to_start" is null
				when 'moved' then "session_exception"."to_date" is not null and "session_exception"."to_start" is not null
					and "session_exception"."to_start" < time '24:00:00' and extract(second from "session_exception"."to_start") = 0
				else false end) is true);--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_id_uuid_v7_ck" CHECK (("user"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') is true);--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_email_ck" CHECK (("user"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') is true);
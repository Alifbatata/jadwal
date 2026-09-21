CREATE TABLE "page_view" (
	"organization_id" uuid NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"count" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "page_view_pk" PRIMARY KEY("organization_id","day","kind"),
	CONSTRAINT "page_view_kind_ck" CHECK (("page_view"."kind" in ('page', 'embed', 'feed')) is true),
	CONSTRAINT "page_view_count_ck" CHECK (("page_view"."count" >= 0) is true)
);
--> statement-breakpoint
ALTER TABLE "page_view" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prayer_day" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "prayer_settings" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "prayer_settings" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "prayer_settings" ADD COLUMN "madhab" text DEFAULT 'shafi' NOT NULL;--> statement-breakpoint
ALTER TABLE "prayer_settings" ADD COLUMN "high_latitude_rule" text DEFAULT 'middleofthenight' NOT NULL;--> statement-breakpoint
ALTER TABLE "page_view" ADD CONSTRAINT "page_view_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_settings" ADD CONSTRAINT "prayer_settings_madhab_ck" CHECK (("prayer_settings"."madhab" in ('shafi', 'hanafi')) is true);--> statement-breakpoint
ALTER TABLE "prayer_settings" ADD CONSTRAINT "prayer_settings_high_latitude_ck" CHECK (("prayer_settings"."high_latitude_rule" in ('middleofthenight', 'seventhofthenight', 'twilightangle')) is true);--> statement-breakpoint
ALTER TABLE "prayer_settings" ADD CONSTRAINT "prayer_settings_method_ck" CHECK (("prayer_settings"."method" is null or "prayer_settings"."method" in ('MuslimWorldLeague', 'Egyptian', 'Karachi', 'UmmAlQura', 'Dubai', 'MoonsightingCommittee', 'NorthAmerica', 'Kuwait', 'Qatar', 'Singapore', 'Tehran', 'Turkey', 'Other')) is true);--> statement-breakpoint
ALTER TABLE "prayer_settings" ADD CONSTRAINT "prayer_settings_position_ck" CHECK ((("prayer_settings"."latitude" is null) = ("prayer_settings"."longitude" is null)
				and ("prayer_settings"."latitude" is null
					or ("prayer_settings"."latitude" between -90 and 90 and "prayer_settings"."longitude" between -180 and 180))) is true);--> statement-breakpoint
CREATE POLICY "page_view_select" ON "page_view" AS PERMISSIVE FOR SELECT TO "jadwal_app" USING ("page_view"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "page_view_superadmin_select" ON "page_view" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING ("page_view"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "page_view_public_select" ON "page_view" AS PERMISSIVE FOR SELECT TO "jadwal_public" USING (exists (select 1 from "organization" o where o."id" = "page_view"."organization_id"));--> statement-breakpoint
CREATE POLICY "page_view_public_insert" ON "page_view" AS PERMISSIVE FOR INSERT TO "jadwal_public" WITH CHECK (exists (select 1 from "organization" o where o."id" = "page_view"."organization_id"));--> statement-breakpoint
CREATE POLICY "page_view_public_update" ON "page_view" AS PERMISSIVE FOR UPDATE TO "jadwal_public" USING (exists (select 1 from "organization" o where o."id" = "page_view"."organization_id")) WITH CHECK (exists (select 1 from "organization" o where o."id" = "page_view"."organization_id"));
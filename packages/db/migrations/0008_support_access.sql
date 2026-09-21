CREATE TABLE "support_access" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"opened_by" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "support_access_id_uuid_v7_ck" CHECK (("support_access"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') is true),
	CONSTRAINT "support_access_reason_ck" CHECK ((length(btrim("support_access"."reason")) >= 10) is true),
	CONSTRAINT "support_access_window_ck" CHECK (("support_access"."expires_at" > "support_access"."opened_at"
				and "support_access"."expires_at" <= "support_access"."opened_at" + interval '24 hours') is true)
);
--> statement-breakpoint
ALTER TABLE "support_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "support_access" ADD CONSTRAINT "support_access_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access" ADD CONSTRAINT "support_access_opened_by_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_access_open_idx" ON "support_access" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE POLICY "support_access_select" ON "support_access" AS PERMISSIVE FOR SELECT TO "jadwal_app" USING ("support_access"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "support_access_superadmin_select" ON "support_access" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING (true);--> statement-breakpoint
CREATE POLICY "support_access_superadmin_insert" ON "support_access" AS PERMISSIVE FOR INSERT TO "jadwal_superadmin" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "support_access_superadmin_update" ON "support_access" AS PERMISSIVE FOR UPDATE TO "jadwal_superadmin" USING (true) WITH CHECK (true);
-- Les demandes d'accès (étape 22, ADR 0049). Fichier produit par Drizzle Kit, sans retouche. Ce
-- qu'il ne sait pas émettre (le forçage, les droits, les politiques d'entretien, la fonction
-- d'écriture et la purge) est dans la migration 0079.
CREATE TABLE "access_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_name" text NOT NULL,
	"locality" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"message" text,
	"language" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "access_request_id_uuid_v7_ck" CHECK (("access_request"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') is true),
	CONSTRAINT "access_request_organization_name_ck" CHECK ((length(btrim("access_request"."organization_name")) > 0 and length("access_request"."organization_name") <= 120) is true),
	CONSTRAINT "access_request_locality_ck" CHECK ((length(btrim("access_request"."locality")) > 0 and length("access_request"."locality") <= 120) is true),
	CONSTRAINT "access_request_contact_name_ck" CHECK ((length(btrim("access_request"."contact_name")) > 0 and length("access_request"."contact_name") <= 120) is true),
	CONSTRAINT "access_request_email_ck" CHECK (("access_request"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
				and length("access_request"."email") <= 254) is true),
	CONSTRAINT "access_request_message_ck" CHECK (("access_request"."message" is null or length(btrim("access_request"."message")) > 0 and length("access_request"."message") <= 1000) is true),
	CONSTRAINT "access_request_language_ck" CHECK (("access_request"."language" in ('fr', 'de', 'it', 'en', 'ar')) is true),
	CONSTRAINT "access_request_status_ck" CHECK (("access_request"."status" in ('pending', 'accepted', 'refused')) is true),
	CONSTRAINT "access_request_resolved_ck" CHECK ((("access_request"."status" = 'pending') = ("access_request"."resolved_at" is null)) is true)
);
--> statement-breakpoint
ALTER TABLE "access_request" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "access_request_pending_email_uq" ON "access_request" USING btree (lower("email")) WHERE "access_request"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "access_request_created_at_idx" ON "access_request" USING btree ("created_at");--> statement-breakpoint
CREATE POLICY "access_request_superadmin_select" ON "access_request" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING ((select coalesce(current_setting('jadwal.org_id', true), '')) = '');
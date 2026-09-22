-- L'acceptation des conditions d'utilisation. Fichier produit par Drizzle Kit, avec un seul retrait
-- à la main : la ligne qui ajoutait `organization.prayer_module`. La migration 0050 l'a ajoutée
-- sans instantané, écrite à la main, donc Drizzle Kit la croyait encore absente et la réémettait ;
-- rejouée ici, elle échouerait sur une colonne qui existe. L'instantané 0051 la contient désormais :
-- la prochaine génération ne la réémettra plus. Ce que Drizzle Kit ne sait pas émettre (le
-- forçage, les droits, les politiques d'entretien) est dans la migration 0052.
CREATE TABLE "terms_acceptance" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terms_acceptance_organization_user_version_uq" UNIQUE("organization_id","user_id","version"),
	CONSTRAINT "terms_acceptance_id_uuid_v7_ck" CHECK (("terms_acceptance"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') is true),
	CONSTRAINT "terms_acceptance_version_ck" CHECK ((case when "terms_acceptance"."version" ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
		then substr("terms_acceptance"."version", 9, 2)::integer <= extract(day from
			(make_date(substr("terms_acceptance"."version", 1, 4)::integer, substr("terms_acceptance"."version", 6, 2)::integer, 1)
				+ interval '1 month')::date - 1)
		else false end) is true)
);
--> statement-breakpoint
ALTER TABLE "terms_acceptance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "terms_acceptance" ADD CONSTRAINT "terms_acceptance_membership_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."membership"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "terms_acceptance_select" ON "terms_acceptance" AS PERMISSIVE FOR SELECT TO "jadwal_app" USING ("terms_acceptance"."organization_id" = (select jadwal.current_org_id()) and "terms_acceptance"."user_id" = (select jadwal.current_user_id()));--> statement-breakpoint
CREATE POLICY "terms_acceptance_insert" ON "terms_acceptance" AS PERMISSIVE FOR INSERT TO "jadwal_app" WITH CHECK ("terms_acceptance"."organization_id" = (select jadwal.current_org_id()) and "terms_acceptance"."user_id" = (select jadwal.current_user_id()));--> statement-breakpoint
CREATE POLICY "terms_acceptance_superadmin_select" ON "terms_acceptance" AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" USING ("terms_acceptance"."organization_id" = (select jadwal.current_org_id()));
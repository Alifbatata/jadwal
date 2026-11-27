-- Le direct (étape 25, ADR 0056 amendée) : l'autorisation de diffuser, portée par l'adhésion, et les
-- langues du direct, portées par l'organisation ; l'invité qui crée sa propre adhésion ne se donne
-- pas l'autorisation. Fichier produit par Drizzle Kit, sans retouche. Ce qu'il ne sait pas émettre,
-- les droits de colonne du rôle applicatif et la preuve, est dans la migration 0085.
ALTER TABLE "membership" ADD COLUMN "can_broadcast" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "live_language" text[] DEFAULT array['fr', 'de', 'it', 'en', 'sq', 'bs', 'tr']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_live_language_ck" CHECK ((cardinality("organization"."live_language") >= 1 and array_position("organization"."live_language", null) is null and "organization"."live_language" <@ array['fr', 'de', 'it', 'en', 'sq', 'bs', 'tr']::text[]) is true);--> statement-breakpoint
ALTER POLICY "membership_insert" ON "membership" TO jadwal_app WITH CHECK ("membership"."organization_id" = (select jadwal.current_org_id())
				and "membership"."user_id" = (select jadwal.current_user_id())
				and jadwal.invited("membership"."organization_id", "membership"."user_id", "membership"."role")
				and "membership"."can_broadcast" = false);
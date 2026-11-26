-- Ce que l'organisation dit d'elle (étape 24, ADR 0052) : six colonnes facultatives, chacune avec
-- sa contrainte. Fichier produit par Drizzle Kit, sans retouche. Ce qu'il ne sait pas émettre, les
-- droits de colonne du rôle applicatif et la preuve, est dans la migration 0083.
ALTER TABLE "organization" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "access_note" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "announcement" text;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_address_ck" CHECK (("organization"."address" is null or ("organization"."address" !~ '^[[:space:]]*$' and char_length("organization"."address") <= 300)) is true);--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_access_note_ck" CHECK (("organization"."access_note" is null or ("organization"."access_note" !~ '^[[:space:]]*$' and char_length("organization"."access_note") <= 1000)) is true);--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_announcement_ck" CHECK (("organization"."announcement" is null or ("organization"."announcement" !~ '^[[:space:]]*$' and char_length("organization"."announcement") <= 500)) is true);--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_contact_phone_ck" CHECK (("organization"."contact_phone" is null or ("organization"."contact_phone" !~ '^[[:space:]]*$' and "organization"."contact_phone" !~ '[[:cntrl:]]' and char_length("organization"."contact_phone") <= 40)) is true);--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_contact_email_ck" CHECK (("organization"."contact_email" is null or ("organization"."contact_email" ~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+$' and char_length("organization"."contact_email") <= 254)) is true);--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_website_ck" CHECK (("organization"."website" is null or ("organization"."website" ~ '^https?://[^[:space:][:cntrl:]]+$' and char_length("organization"."website") <= 300)) is true);
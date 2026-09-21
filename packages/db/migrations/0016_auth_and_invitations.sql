CREATE TABLE "account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "invitation_id_uuid_v7_ck" CHECK (("invitation"."id"::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') is true),
	CONSTRAINT "invitation_status_ck" CHECK (("invitation"."status" in ('pending', 'accepted', 'cancelled')) is true),
	CONSTRAINT "invitation_role_ck" CHECK (("invitation"."role" in ('org_admin', 'editor')) is true),
	CONSTRAINT "invitation_email_ck" CHECK (("invitation"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') is true),
	CONSTRAINT "invitation_expires_at_ck" CHECK (("invitation"."expires_at" > "invitation"."created_at") is true)
);
--> statement-breakpoint
ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rate_limit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_pending_uq" ON "invitation" USING btree ("organization_id",lower("email")) WHERE "invitation"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "invitation_organization_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "invitation_invited_by_idx" ON "invitation" USING btree ("invited_by");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_key_uq" ON "rate_limit" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_uq" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verification_expires_at_idx" ON "verification" USING btree ("expires_at");--> statement-breakpoint
CREATE POLICY "account_auth_select" ON "account" AS PERMISSIVE FOR SELECT TO "jadwal_auth" USING (true);--> statement-breakpoint
CREATE POLICY "account_auth_insert" ON "account" AS PERMISSIVE FOR INSERT TO "jadwal_auth" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "account_auth_update" ON "account" AS PERMISSIVE FOR UPDATE TO "jadwal_auth" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "account_auth_delete" ON "account" AS PERMISSIVE FOR DELETE TO "jadwal_auth" USING (true);--> statement-breakpoint
CREATE POLICY "invitation_select" ON "invitation" AS PERMISSIVE FOR SELECT TO "jadwal_app" USING ("invitation"."organization_id" = (select jadwal.current_org_id())
				or exists (
					select 1 from "user" u
					where u."id" = (select jadwal.current_user_id()) and lower(u."email") = lower("invitation"."email")
				));--> statement-breakpoint
CREATE POLICY "invitation_insert" ON "invitation" AS PERMISSIVE FOR INSERT TO "jadwal_app" WITH CHECK ("invitation"."organization_id" = (select jadwal.current_org_id())
				and ("invitation"."invited_by" is null or exists (select 1 from "user" u where u."id" = "invitation"."invited_by")));--> statement-breakpoint
CREATE POLICY "invitation_update" ON "invitation" AS PERMISSIVE FOR UPDATE TO "jadwal_app" USING ("invitation"."organization_id" = (select jadwal.current_org_id())
				or exists (
					select 1 from "user" u
					where u."id" = (select jadwal.current_user_id()) and lower(u."email") = lower("invitation"."email")
				)) WITH CHECK ("invitation"."organization_id" = (select jadwal.current_org_id())
				or exists (
					select 1 from "user" u
					where u."id" = (select jadwal.current_user_id()) and lower(u."email") = lower("invitation"."email")
				));--> statement-breakpoint
CREATE POLICY "invitation_delete" ON "invitation" AS PERMISSIVE FOR DELETE TO "jadwal_app" USING ("invitation"."organization_id" = (select jadwal.current_org_id()));--> statement-breakpoint
CREATE POLICY "rate_limit_auth_select" ON "rate_limit" AS PERMISSIVE FOR SELECT TO "jadwal_auth" USING (true);--> statement-breakpoint
CREATE POLICY "rate_limit_auth_insert" ON "rate_limit" AS PERMISSIVE FOR INSERT TO "jadwal_auth" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "rate_limit_auth_update" ON "rate_limit" AS PERMISSIVE FOR UPDATE TO "jadwal_auth" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "rate_limit_auth_delete" ON "rate_limit" AS PERMISSIVE FOR DELETE TO "jadwal_auth" USING (true);--> statement-breakpoint
CREATE POLICY "session_auth_select" ON "session" AS PERMISSIVE FOR SELECT TO "jadwal_auth" USING (true);--> statement-breakpoint
CREATE POLICY "session_auth_insert" ON "session" AS PERMISSIVE FOR INSERT TO "jadwal_auth" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "session_auth_update" ON "session" AS PERMISSIVE FOR UPDATE TO "jadwal_auth" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "session_auth_delete" ON "session" AS PERMISSIVE FOR DELETE TO "jadwal_auth" USING (true);--> statement-breakpoint
CREATE POLICY "verification_auth_select" ON "verification" AS PERMISSIVE FOR SELECT TO "jadwal_auth" USING (true);--> statement-breakpoint
CREATE POLICY "verification_auth_insert" ON "verification" AS PERMISSIVE FOR INSERT TO "jadwal_auth" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "verification_auth_update" ON "verification" AS PERMISSIVE FOR UPDATE TO "jadwal_auth" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "verification_auth_delete" ON "verification" AS PERMISSIVE FOR DELETE TO "jadwal_auth" USING (true);
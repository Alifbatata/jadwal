CREATE TABLE "retention_hold" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"placed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retention_hold_reason_ck" CHECK ((length(btrim("retention_hold"."reason")) > 0) is true),
	CONSTRAINT "retention_hold_placed_by_ck" CHECK ((length(btrim("retention_hold"."placed_by")) > 0) is true)
);
--> statement-breakpoint
ALTER TABLE "retention_hold" ADD CONSTRAINT "retention_hold_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;
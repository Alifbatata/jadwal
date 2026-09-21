ALTER TABLE "invitation" ADD COLUMN "accepted_by" uuid;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_accepted_by_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_accepted_by_idx" ON "invitation" USING btree ("accepted_by");
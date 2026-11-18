ALTER TABLE "users" ADD COLUMN "parent_media_consent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "users_parent_idx" ON "users" USING btree ("parent_user_id");
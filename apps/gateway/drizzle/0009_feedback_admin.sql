CREATE TABLE "admin_audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"actor_kind" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_audit_log_actor_kind_ck" CHECK ("admin_audit_log"."actor_kind" in ('user', 'cli')),
	CONSTRAINT "admin_audit_log_cli_actor_ck" CHECK ("admin_audit_log"."actor_kind" <> 'cli' or "admin_audit_log"."actor_user_id" is null)
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_hash" text NOT NULL,
	"mfa_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_sessions_refresh_hash_unique" UNIQUE("refresh_hash")
);
--> statement-breakpoint
CREATE TABLE "blob_deletions" (
	"blob_key" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "blob_deletions_attempts_ck" CHECK ("blob_deletions"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "feedback_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feedback_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"status" text,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_events_status_ck" CHECK ("feedback_events"."status" is null or "feedback_events"."status" in ('received', 'in_progress', 'done')),
	CONSTRAINT "feedback_events_message_len_ck" CHECK ("feedback_events"."message" is null or char_length("feedback_events"."message") between 1 and 1000),
	CONSTRAINT "feedback_events_nonempty_ck" CHECK ("feedback_events"."status" is not null or "feedback_events"."message" is not null)
);
--> statement-breakpoint
CREATE TABLE "feedback_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feedback_id" uuid NOT NULL,
	"blob_key" text NOT NULL,
	"media" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purged_at" timestamp with time zone,
	CONSTRAINT "feedback_files_media_ck" CHECK ("feedback_files"."media" in ('image', 'video')),
	CONSTRAINT "feedback_files_type_ck" CHECK (("feedback_files"."media" = 'image' and "feedback_files"."content_type" in ('image/webp', 'image/jpeg', 'image/png')) or ("feedback_files"."media" = 'video' and "feedback_files"."content_type" in ('video/mp4', 'video/webm', 'video/quicktime'))),
	CONSTRAINT "feedback_files_bytes_ck" CHECK ("feedback_files"."bytes" > 0 and "feedback_files"."bytes" <= case when "feedback_files"."media" = 'image' then 5242880 else 52428800 end),
	CONSTRAINT "feedback_files_duration_ck" CHECK ("feedback_files"."duration_ms" is null or ("feedback_files"."duration_ms" >= 0 and "feedback_files"."duration_ms" <= 60000))
);
--> statement-breakpoint
CREATE TABLE "feedback_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"context" jsonb NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"user_unread" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone,
	CONSTRAINT "feedback_reports_kind_ck" CHECK ("feedback_reports"."kind" in ('bug', 'idea', 'other')),
	CONSTRAINT "feedback_reports_status_ck" CHECK ("feedback_reports"."status" in ('received', 'in_progress', 'done')),
	CONSTRAINT "feedback_reports_body_len_ck" CHECK (char_length("feedback_reports"."body") between 10 and 2000),
	CONSTRAINT "feedback_reports_done_at_ck" CHECK (("feedback_reports"."status" = 'done') = ("feedback_reports"."done_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "staff_roles" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" uuid,
	CONSTRAINT "staff_roles_user_id_role_pk" PRIMARY KEY("user_id","role"),
	CONSTRAINT "staff_roles_role_ck" CHECK ("staff_roles"."role" in ('owner', 'editor', 'reviewer', 'support'))
);
--> statement-breakpoint
CREATE TABLE "staff_totp" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"secret_enc" "bytea" NOT NULL,
	"confirmed_at" timestamp with time zone,
	"last_used_step" bigint DEFAULT 0 NOT NULL,
	"backup_hashes" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "staff_totp_backup_count_ck" CHECK (cardinality("staff_totp"."backup_hashes") <= 10)
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_feedback_id_feedback_reports_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_files" ADD CONSTRAINT "feedback_files_feedback_id_feedback_reports_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_totp" ADD CONSTRAINT "staff_totp_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_log_created_idx" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_sessions_user_idx" ON "admin_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "admin_sessions_expires_idx" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "blob_deletions_created_idx" ON "blob_deletions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feedback_events_feedback_idx" ON "feedback_events" USING btree ("feedback_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_files_blob_key_uq" ON "feedback_files" USING btree ("blob_key");--> statement-breakpoint
CREATE INDEX "feedback_files_feedback_idx" ON "feedback_files" USING btree ("feedback_id");--> statement-breakpoint
CREATE INDEX "feedback_reports_status_created_idx" ON "feedback_reports" USING btree ("status","created_at" desc);--> statement-breakpoint
CREATE INDEX "feedback_reports_user_created_idx" ON "feedback_reports" USING btree ("user_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "feedback_reports_user_unread_idx" ON "feedback_reports" USING btree ("user_id") WHERE "feedback_reports"."user_unread";--> statement-breakpoint
CREATE INDEX "feedback_reports_done_at_idx" ON "feedback_reports" USING btree ("done_at") WHERE "feedback_reports"."done_at" is not null;
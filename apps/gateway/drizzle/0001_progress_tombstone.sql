CREATE TABLE "deleted_accounts" (
	"credential_hash" text PRIMARY KEY NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_progress" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"lessons_done" integer DEFAULT 0 NOT NULL,
	"freezes" integer DEFAULT 0 NOT NULL,
	"daily_goal" integer DEFAULT 10 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learner_progress" ADD CONSTRAINT "learner_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
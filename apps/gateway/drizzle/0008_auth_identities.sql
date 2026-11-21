CREATE TABLE "auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"key_hash" text NOT NULL,
	"subject" text,
	"user_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_challenges_kind_ck" CHECK ("auth_challenges"."kind" in ('oidc_nonce', 'email_otp', 'merge_ticket', 'login_fail'))
);
--> statement-breakpoint
CREATE TABLE "identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"display" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "identities_provider_ck" CHECK ("identities"."provider" in ('google', 'password', 'email')),
	CONSTRAINT "identities_subject_lower_ck" CHECK ("identities"."provider" = 'google' or "identities"."subject" = lower("identities"."subject"))
);
--> statement-breakpoint
CREATE TABLE "password_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"backup_code_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reserved_usernames" (
	"username" text PRIMARY KEY NOT NULL,
	"until" timestamp with time zone NOT NULL,
	CONSTRAINT "reserved_usernames_lower_ck" CHECK ("reserved_usernames"."username" = lower("reserved_usernames"."username"))
);
--> statement-breakpoint
ALTER TABLE "deleted_accounts" ADD COLUMN "reason" text DEFAULT 'deleted' NOT NULL;--> statement-breakpoint
ALTER TABLE "deleted_accounts" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "family_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "delete_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_credentials" ADD CONSTRAINT "password_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_challenges_kind_key_uq" ON "auth_challenges" USING btree ("kind","key_hash") WHERE "auth_challenges"."kind" <> 'email_otp';--> statement-breakpoint
CREATE INDEX "auth_challenges_kind_subject_idx" ON "auth_challenges" USING btree ("kind","subject");--> statement-breakpoint
CREATE INDEX "auth_challenges_expires_idx" ON "auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_challenges_user_idx" ON "auth_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identities_provider_subject_uq" ON "identities" USING btree ("provider","subject");--> statement-breakpoint
CREATE UNIQUE INDEX "identities_user_provider_uq" ON "identities" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "reserved_usernames_until_idx" ON "reserved_usernames" USING btree ("until");--> statement-breakpoint
CREATE INDEX "deleted_accounts_expires_idx" ON "deleted_accounts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "users_delete_at_idx" ON "users" USING btree ("delete_at") WHERE "users"."delete_at" is not null;--> statement-breakpoint
ALTER TABLE "deleted_accounts" ADD CONSTRAINT "deleted_accounts_reason_ck" CHECK ("deleted_accounts"."reason" in ('deleted', 'merged', 'upgraded'));
CREATE TABLE "call_participants" (
	"call_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	"relay_seconds" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "call_participants_call_id_user_id_pk" PRIMARY KEY("call_id","user_id"),
	CONSTRAINT "call_participants_relay_ck" CHECK ("call_participants"."relay_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"initiator_id" uuid,
	"mode" text DEFAULT 'mesh' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	CONSTRAINT "calls_kind_ck" CHECK ("calls"."kind" in ('voice', 'video')),
	CONSTRAINT "calls_mode_ck" CHECK ("calls"."mode" in ('mesh', 'sfu')),
	CONSTRAINT "calls_end_reason_ck" CHECK ("calls"."end_reason" is null or "calls"."end_reason" in ('hangup', 'no_answer', 'declined', 'busy', 'timeout', 'error')),
	CONSTRAINT "calls_end_pair_ck" CHECK (("calls"."ended_at" is null) = ("calls"."end_reason" is null))
);
--> statement-breakpoint
CREATE TABLE "chat_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"uploader_id" uuid,
	"blob_key" text NOT NULL,
	"media" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"duration_ms" integer,
	"width" integer,
	"height" integer,
	"waveform" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pinned_by_report" boolean DEFAULT false NOT NULL,
	"purged_at" timestamp with time zone,
	CONSTRAINT "chat_attachments_media_ck" CHECK ("chat_attachments"."media" in ('image', 'voice')),
	CONSTRAINT "chat_attachments_type_ck" CHECK (("chat_attachments"."media" = 'image' and "chat_attachments"."content_type" in ('image/webp', 'image/jpeg', 'image/png') and "chat_attachments"."bytes" <= 2097152)
        or ("chat_attachments"."media" = 'voice' and "chat_attachments"."content_type" in ('audio/webm', 'audio/ogg', 'audio/mp4') and "chat_attachments"."bytes" <= 3145728)),
	CONSTRAINT "chat_attachments_bytes_ck" CHECK ("chat_attachments"."bytes" > 0),
	CONSTRAINT "chat_attachments_duration_ck" CHECK ("chat_attachments"."duration_ms" is null or "chat_attachments"."duration_ms" between 0 and 120000),
	CONSTRAINT "chat_attachments_dims_ck" CHECK (("chat_attachments"."width" is null or "chat_attachments"."width" between 1 and 1280) and ("chat_attachments"."height" is null or "chat_attachments"."height" between 1 and 1280)),
	CONSTRAINT "chat_attachments_waveform_ck" CHECK ("chat_attachments"."waveform" is null or (jsonb_typeof("chat_attachments"."waveform") = 'array' and jsonb_array_length("chat_attachments"."waveform") <= 64))
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"sender_id" uuid,
	"client_msg_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"body" text,
	"attachment_id" uuid,
	"system_event" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_kind" text,
	CONSTRAINT "chat_messages_kind_ck" CHECK ("chat_messages"."kind" in ('text', 'image', 'voice', 'system')),
	CONSTRAINT "chat_messages_seq_ck" CHECK ("chat_messages"."seq" >= 1),
	CONSTRAINT "chat_messages_body_len_ck" CHECK ("chat_messages"."body" is null or char_length("chat_messages"."body") <= 4000),
	CONSTRAINT "chat_messages_deleted_kind_ck" CHECK ("chat_messages"."deleted_kind" is null or "chat_messages"."deleted_kind" in ('recalled', 'account_deleted')),
	CONSTRAINT "chat_messages_deleted_pair_ck" CHECK (("chat_messages"."deleted_at" is null) = ("chat_messages"."deleted_kind" is null)),
	CONSTRAINT "chat_messages_content_ck" CHECK (("chat_messages"."kind" = 'text' and "chat_messages"."attachment_id" is null and "chat_messages"."system_event" is null)
        or ("chat_messages"."kind" in ('image', 'voice') and "chat_messages"."body" is null and "chat_messages"."system_event" is null and ("chat_messages"."attachment_id" is not null or coalesce("chat_messages"."deleted_kind" = 'account_deleted', false)))
        or ("chat_messages"."kind" = 'system' and "chat_messages"."system_event" is not null and "chat_messages"."body" is null and "chat_messages"."attachment_id" is null))
);
--> statement-breakpoint
CREATE TABLE "chat_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid,
	"reported_user_id" uuid,
	"conversation_id" uuid,
	"message_id" uuid,
	"reason" text NOT NULL,
	"note" text,
	"snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"action" text,
	CONSTRAINT "chat_reports_reason_ck" CHECK ("chat_reports"."reason" in ('spam', 'harassment', 'sexual', 'minor_safety', 'scam', 'other')),
	CONSTRAINT "chat_reports_status_ck" CHECK ("chat_reports"."status" in ('open', 'reviewing', 'actioned', 'dismissed')),
	CONSTRAINT "chat_reports_action_ck" CHECK ("chat_reports"."action" is null or "chat_reports"."action" in ('dismiss', 'warn', 'restrict')),
	CONSTRAINT "chat_reports_note_ck" CHECK ("chat_reports"."note" is null or char_length("chat_reports"."note") <= 500),
	CONSTRAINT "chat_reports_snapshot_ck" CHECK (jsonb_typeof("chat_reports"."snapshot") = 'array' and jsonb_array_length("chat_reports"."snapshot") <= 30),
	CONSTRAINT "chat_reports_resolved_ck" CHECK (("chat_reports"."status" in ('actioned', 'dismissed')) = ("chat_reports"."resolved_at" is not null)),
	CONSTRAINT "chat_reports_not_self_ck" CHECK ("chat_reports"."reporter_id" is null or "chat_reports"."reported_user_id" is null or "chat_reports"."reporter_id" <> "chat_reports"."reported_user_id")
);
--> statement-breakpoint
CREATE TABLE "chat_restrictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'chat_ban' NOT NULL,
	"until" timestamp with time zone,
	"reason" text NOT NULL,
	"report_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_at" timestamp with time zone,
	CONSTRAINT "chat_restrictions_kind_ck" CHECK ("chat_restrictions"."kind" = 'chat_ban'),
	CONSTRAINT "chat_restrictions_reason_ck" CHECK (char_length("chat_restrictions"."reason") between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "conversation_members" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_seq" bigint DEFAULT 0 NOT NULL,
	"left_at" timestamp with time zone,
	"last_read_seq" bigint DEFAULT 0 NOT NULL,
	"hidden_before_seq" bigint DEFAULT 0 NOT NULL,
	"muted_until" timestamp with time zone,
	CONSTRAINT "conversation_members_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id"),
	CONSTRAINT "conversation_members_role_ck" CHECK ("conversation_members"."role" in ('owner', 'admin', 'member')),
	CONSTRAINT "conversation_members_seq_ck" CHECK ("conversation_members"."joined_seq" >= 0 and "conversation_members"."last_read_seq" >= 0 and "conversation_members"."hidden_before_seq" >= 0)
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"dm_key" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seq" bigint DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	CONSTRAINT "conversations_dm_key_unique" UNIQUE("dm_key"),
	CONSTRAINT "conversations_kind_ck" CHECK ("conversations"."kind" in ('dm', 'group')),
	CONSTRAINT "conversations_dm_key_ck" CHECK (("conversations"."kind" = 'dm') = ("conversations"."dm_key" is not null)),
	CONSTRAINT "conversations_title_ck" CHECK (("conversations"."kind" = 'dm' and "conversations"."title" is null) or ("conversations"."kind" = 'group' and "conversations"."title" is not null and char_length("conversations"."title") between 1 and 60)),
	CONSTRAINT "conversations_last_seq_ck" CHECK ("conversations"."last_seq" >= 0)
);
--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "friend_requests_status_ck" CHECK ("friend_requests"."status" in ('pending', 'accepted', 'declined', 'canceled')),
	CONSTRAINT "friend_requests_not_self_ck" CHECK ("friend_requests"."from_user_id" <> "friend_requests"."to_user_id"),
	CONSTRAINT "friend_requests_resolved_ck" CHECK (("friend_requests"."status" = 'pending') = ("friend_requests"."resolved_at" is null))
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"app_build" integer DEFAULT 0 NOT NULL,
	"locale" text DEFAULT 'vi' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "push_tokens_token_unique" UNIQUE("token"),
	CONSTRAINT "push_tokens_platform_ck" CHECK ("push_tokens"."platform" = 'android'),
	CONSTRAINT "push_tokens_locale_ck" CHECK ("push_tokens"."locale" in ('vi', 'en')),
	CONSTRAINT "push_tokens_build_ck" CHECK ("push_tokens"."app_build" >= 0),
	CONSTRAINT "push_tokens_len_ck" CHECK (char_length("push_tokens"."token") between 20 and 4096)
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "user_blocks_not_self_ck" CHECK ("user_blocks"."blocker_id" <> "user_blocks"."blocked_id")
);
--> statement-breakpoint
ALTER TABLE "friendships" ADD COLUMN "quest_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "handle" text;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "handle_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "discoverable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "show_online" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "show_read_receipts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD COLUMN "show_push_preview" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_adult" boolean;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "age_declared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_initiator_id_users_id_fk" FOREIGN KEY ("initiator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_attachment_id_chat_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."chat_attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_restrictions" ADD CONSTRAINT "chat_restrictions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_restrictions" ADD CONSTRAINT "chat_restrictions_report_id_chat_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."chat_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_restrictions" ADD CONSTRAINT "chat_restrictions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_participants_active_idx" ON "call_participants" USING btree ("user_id") WHERE "call_participants"."joined_at" is not null and "call_participants"."left_at" is null;--> statement-breakpoint
CREATE INDEX "call_participants_user_idx" ON "call_participants" USING btree ("user_id","invited_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "calls_conv_idx" ON "calls" USING btree ("conversation_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "calls_initiator_idx" ON "calls" USING btree ("initiator_id");--> statement-breakpoint
CREATE INDEX "calls_open_idx" ON "calls" USING btree ("started_at") WHERE "calls"."ended_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_attachments_blob_key_uq" ON "chat_attachments" USING btree ("blob_key");--> statement-breakpoint
CREATE INDEX "chat_attachments_conv_idx" ON "chat_attachments" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "chat_attachments_uploader_idx" ON "chat_attachments" USING btree ("uploader_id");--> statement-breakpoint
CREATE INDEX "chat_attachments_live_created_idx" ON "chat_attachments" USING btree ("created_at") WHERE "chat_attachments"."purged_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_conv_seq_uq" ON "chat_messages" USING btree ("conversation_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_dedupe_uq" ON "chat_messages" USING btree ("conversation_id","sender_id","client_msg_id");--> statement-breakpoint
CREATE INDEX "chat_messages_conv_seq_desc_idx" ON "chat_messages" USING btree ("conversation_id","seq" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_attachment_uq" ON "chat_messages" USING btree ("attachment_id") WHERE "chat_messages"."attachment_id" is not null;--> statement-breakpoint
CREATE INDEX "chat_messages_sender_idx" ON "chat_messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "chat_reports_status_idx" ON "chat_reports" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chat_reports_reporter_idx" ON "chat_reports" USING btree ("reporter_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chat_reports_reported_idx" ON "chat_reports" USING btree ("reported_user_id");--> statement-breakpoint
CREATE INDEX "chat_restrictions_active_idx" ON "chat_restrictions" USING btree ("user_id") WHERE "chat_restrictions"."lifted_at" is null;--> statement-breakpoint
CREATE INDEX "conversation_members_user_idx" ON "conversation_members" USING btree ("user_id","left_at");--> statement-breakpoint
CREATE INDEX "conversations_last_message_idx" ON "conversations" USING btree ("last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "friend_requests_pending_uq" ON "friend_requests" USING btree ("from_user_id","to_user_id") WHERE "friend_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "friend_requests_to_idx" ON "friend_requests" USING btree ("to_user_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "friend_requests_from_idx" ON "friend_requests" USING btree ("from_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "push_tokens_user_idx" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_tokens_last_seen_idx" ON "push_tokens" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_idx" ON "user_blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_profiles_handle_lower_uq" ON "social_profiles" USING btree (lower("handle")) WHERE "social_profiles"."handle" is not null;--> statement-breakpoint
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_handle_fmt_ck" CHECK ("social_profiles"."handle" is null or ("social_profiles"."handle" ~* '^[a-z0-9._]{3,24}$' and "social_profiles"."handle" !~ '^[.]|[.]$' and position('..' in "social_profiles"."handle") = 0));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_age_flag_ck" CHECK (("users"."is_adult" is null) = ("users"."age_declared_at" is null));
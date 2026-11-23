CREATE TABLE "ai_usage" (
	"user_id" uuid NOT NULL,
	"usage_day_utc" text NOT NULL,
	"capability" text NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_user_id_usage_day_utc_capability_pk" PRIMARY KEY("user_id","usage_day_utc","capability")
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
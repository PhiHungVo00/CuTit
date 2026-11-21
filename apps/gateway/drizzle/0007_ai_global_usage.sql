CREATE TABLE "ai_global_usage" (
	"usage_day" text NOT NULL,
	"capability" text NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_global_usage_usage_day_capability_pk" PRIMARY KEY("usage_day","capability")
);

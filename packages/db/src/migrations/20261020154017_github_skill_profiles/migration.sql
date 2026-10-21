CREATE TABLE "github_generation_reservations" (
	"budget_key" text,
	"slot" text,
	"request_id" uuid NOT NULL UNIQUE,
	"candidate_sha" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"max_output_tokens" integer NOT NULL,
	"maximum_cost_micro_usd" integer NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_generation_reservations_pkey" PRIMARY KEY("budget_key","slot"),
	CONSTRAINT "github_generation_reservations_tokens_check" CHECK ("input_tokens" BETWEEN 1 AND 16000 AND "max_output_tokens" BETWEEN 1 AND 4096),
	CONSTRAINT "github_generation_reservations_cost_check" CHECK ("maximum_cost_micro_usd" BETWEEN 1 AND 20000),
	CONSTRAINT "github_generation_reservations_sha_check" CHECK ("candidate_sha" ~ '^[0-9a-f]{40}$')
);
--> statement-breakpoint
ALTER TABLE "github_generation_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "github_profiles" (
	"user_id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"active_request_id" uuid,
	"active_until" timestamp with time zone,
	"consent_version" text NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"snapshot" jsonb,
	"analysis" jsonb,
	"corrections" jsonb DEFAULT '{}' NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "github_profiles_active_check" CHECK (("active_request_id" IS NULL) = ("active_until" IS NULL)),
	CONSTRAINT "github_profiles_publication_check" CHECK (("published_at" IS NULL AND "snapshot" IS NULL AND "analysis" IS NULL) OR ("published_at" IS NOT NULL AND "snapshot" IS NOT NULL AND "analysis" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "github_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "github_profiles" ADD CONSTRAINT "github_profiles_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "github_profiles" ADD CONSTRAINT "github_profiles_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE;
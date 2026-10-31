CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"type" text NOT NULL,
	"user_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'queued' NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"error_code" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_jobs_type_check" CHECK ("type" in ('github_profile', 'knowledge_map', 'quiz_generation')),
	CONSTRAINT "ai_jobs_status_check" CHECK ("status" in ('queued', 'running', 'completed', 'failed')),
	CONSTRAINT "ai_jobs_lease_check" CHECK (("status" = 'running' and "lease_token" is not null and "lease_until" is not null) or ("status" <> 'running' and "lease_token" is null and "lease_until" is null)),
	CONSTRAINT "ai_jobs_payload_size_check" CHECK ("payload" is null or octet_length("payload"::text) <= 65536)
);
--> statement-breakpoint
ALTER TABLE "ai_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "ai_jobs_queue_idx" ON "ai_jobs" ("status","created_at");--> statement-breakpoint
CREATE INDEX "ai_jobs_quota_idx" ON "ai_jobs" ("type","user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_jobs_active_unique_idx" ON "ai_jobs" ("type","user_id","resource_id") WHERE "status" in ('queued', 'running');--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
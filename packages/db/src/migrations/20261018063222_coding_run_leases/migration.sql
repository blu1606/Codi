CREATE TABLE "coding_run_leases" (
	"user_id" text PRIMARY KEY,
	"token" text NOT NULL,
	"running_until" timestamp with time zone NOT NULL,
	"last_started_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coding_run_leases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coding_run_leases" ADD CONSTRAINT "coding_run_leases_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
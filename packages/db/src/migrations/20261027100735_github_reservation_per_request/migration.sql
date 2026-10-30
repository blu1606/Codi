ALTER TABLE "github_generation_reservations" DROP CONSTRAINT "github_generation_reservations_request_id_key";--> statement-breakpoint
ALTER TABLE "github_generation_reservations" DROP CONSTRAINT "github_generation_reservations_pkey";--> statement-breakpoint
ALTER TABLE "github_generation_reservations" ADD PRIMARY KEY ("request_id");--> statement-breakpoint
CREATE INDEX "github_generation_reservations_budget_key_idx" ON "github_generation_reservations" ("budget_key");
ALTER TABLE "github_profiles" ADD COLUMN "ai_guidance_consented_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_profiles" ADD COLUMN "ai_guidance_declined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_profiles" ADD CONSTRAINT "github_profiles_ai_guidance_check" CHECK ("ai_guidance_consented_at" IS NULL OR "ai_guidance_declined_at" IS NULL);
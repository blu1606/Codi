ALTER TABLE "assessment_submissions" ADD COLUMN "code_text" text;--> statement-breakpoint
ALTER TABLE "assessment_submissions" ADD COLUMN "code_language" text;--> statement-breakpoint
ALTER TABLE "assessment_submissions" ADD CONSTRAINT "submissions_code_language_check" CHECK ("code_language" IS NULL OR ("code_text" IS NOT NULL AND "code_language" IN ('javascript', 'typescript')));